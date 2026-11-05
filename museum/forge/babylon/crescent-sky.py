"""The evening of 15 April 570 BC at Babylon from JPL Horizons' observer tables (DE441), for the walk's last stop.

  python3 -I crescent-sky.py <folder with the six tables> --out <sky json> [--hold 16:09]

The tables (text, CSV, ANG_FORMAT=DEG, one-minute steps, site 44.421 E, 32.536 N, 0.035 km): sun-topo-airless
(quantities 2,4,7,13,20,23,24), moon-topo-airless (2,4,7,9,10,13,20,23,24), sun-topo-refracted and moon-topo-refracted
(4), sun-geo and moon-geo (geocentre 500@399: 2,20 and 2,20,23). Writes the minutes from sunset to moonset (and ten
either side), the evening's events and the hold's minute; prints the numbers it derives.
"""
import argparse, json, math, os, sys

D = math.pi / 180
LAT, LON = 32.536, 44.421
# UTM zone 38's central meridian: the map's grid north stands this far from true north at the site (west of it)
CONVERGENCE = math.atan(math.tan((LON - 45.0) * D) * math.sin(LAT * D)) / D


def table(path):
    rows, cols, on = {}, None, False
    for line in open(path, encoding='utf-8'):
        if line.startswith(' Date__'):
            cols = [c.strip() for c in line.split(',')]
        elif line.startswith('$$SOE'):
            on = True
        elif line.startswith('$$EOE'):
            on = False
        elif on:
            v = [c.strip() for c in line.split(',')]
            rows[v[0].split(' ')[1]] = dict(zip(cols, v))
    return rows


def num(r, key):
    for k, v in r.items():
        if k.startswith(key):
            return float(v)
    raise KeyError(key)


def unit(az, el):
    """az clockwise from north, el up: the scene's frame (x east, y up, z south)"""
    c = math.cos(el * D)
    return (c * math.sin(az * D), math.sin(el * D), -c * math.cos(az * D))


def limb_zenith_cw(m_az, m_el, s_az, s_el):
    """the bright limb's direction on the Moon's disc, degrees clockwise from the zenith's direction as the observer
    sees it (toward increasing azimuth): the first bearing of the great circle from the Moon to the Sun in alt-az"""
    dA = (s_az - m_az) * D
    y = math.sin(dA) * math.cos(s_el * D)
    x = math.cos(m_el * D) * math.sin(s_el * D) - math.sin(m_el * D) * math.cos(s_el * D) * math.cos(dA)
    return math.atan2(y, x) / D % 360


def limb_meeus(ra0, de0, ra, de, last):
    """Meeus (1998) eq. 48.5, the bright limb's position angle chi (from north through east), and eq. 14.1, the
    parallactic angle q; chi - q is the limb's angle from the zenith's direction, counter-clockwise on the sky"""
    a0, d0, a, d = ra0 * D, de0 * D, ra * D, de * D
    chi = math.atan2(math.cos(d0) * math.sin(a0 - a), math.sin(d0) * math.cos(d) - math.cos(d0) * math.sin(d) * math.cos(a0 - a)) / D % 360
    H = (last * 15 - ra) * D
    q = math.atan2(math.sin(H), math.tan(LAT * D) * math.cos(d) - math.sin(d) * math.cos(H)) / D
    return chi, q, (chi - q) % 360


def geo_alt(ra, de, last):
    H = (last * 15 - ra) * D
    return math.asin(math.sin(LAT * D) * math.sin(de * D) + math.cos(LAT * D) * math.cos(de * D) * math.cos(H)) / D


def hm(m):
    return f'{m // 60:02d}:{m % 60:02d}'


def mins(s):
    h, m = s.split(':')
    return int(h) * 60 + int(m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--out', required=True)
    ap.add_argument('--hold', default='16:09')
    a = ap.parse_args()
    T = {n: table(os.path.join(a.folder, n + '.txt')) for n in ('sun-topo-airless', 'moon-topo-airless', 'sun-topo-refracted', 'moon-topo-refracted', 'sun-geo', 'moon-geo')}
    keys = sorted(T['moon-topo-airless'], key=mins)
    ev = {}
    rows = []
    prev = None
    for k in keys:
        S, M = T['sun-topo-airless'][k], T['moon-topo-airless'][k]
        s_el, m_el = num(S, 'Elevation'), num(M, 'Elevation')
        s_sd, m_sd = num(S, 'Ang-diam') / 7200, num(M, 'Ang-diam') / 7200
        # the upper limb on the horizon with 34' of refraction: the centre at -(34' + semidiameter), airless
        s_up, m_up = s_el + 34 / 60 + s_sd, m_el + 34 / 60 + m_sd
        # the minute the limb is last on or above the horizon, and the crossing to the second between rows
        if prev:
            for name, i, now in (('sunset', 0, s_up), ('moonset', 1, m_up)):
                if prev[i] >= 0 > now:
                    ev[name] = prev[2]
                    sec = round(60 * prev[i] / (prev[i] - now))
                    ev[name + 'At'] = f"{prev[2]}:{sec:02d}"
        prev = (s_up, m_up, k)
        rows.append((k, S, M))
    if 'sunset' not in ev or 'moonset' not in ev:
        sys.exit('sunset or moonset outside the tables')
    secs = lambda t: sum(int(x) * f for x, f in zip(t.split(':'), (3600, 60, 1)))
    ss, ms = mins(ev['sunset']), mins(ev['moonset'])
    lag = (secs(ev['moonsetAt']) - secs(ev['sunsetAt'])) / 60
    # Yallop's best time, Tb = Ts + 4/9 Lag (NAO Technical Note 69, eq. 4.1)
    b = secs(ev['sunsetAt']) + round(4 / 9 * lag * 60)
    ev['lag'] = round(lag, 2)
    ev['best'] = hm(b // 60)
    ev['bestAt'] = f"{hm(b // 60)}:{b % 60:02d}"

    def yallop(k):
        S, M = T['sun-topo-airless'][k], T['moon-topo-airless'][k]
        last = num(M, 'L_Ap_Sid_Time')
        sg, mg = T['sun-geo'][k], T['moon-geo'][k]
        hs = geo_alt(num(sg, 'R.A.'), num(sg, 'DEC'), last)
        hmn = geo_alt(num(mg, 'R.A.'), num(mg, 'DEC'), last)
        arcl = num(mg, 'S-O-T')
        arcv = hmn - hs
        par = math.asin(6378.14 / (num(mg, 'delta') * 149597870.7)) / D * 60
        sd = 0.27245 * par
        sdp = sd * (1 + math.sin(hmn * D) * math.sin(par / 60 * D))
        w = sdp * (1 - math.cos(arcl * D))
        q = (arcv - (11.8371 - 6.3226 * w + 0.7319 * w * w - 0.1018 * w ** 3)) / 10
        return {'arcl': round(arcl, 2), 'arcv': round(arcv, 2), 'w': round(w, 3), 'q': round(q, 3)}

    out = []
    for k, S, M in rows:
        if not (ss - 10 <= mins(k) <= ms + 10):
            continue
        sR, mR = T['sun-topo-refracted'][k], T['moon-topo-refracted'][k]
        s_az, s_el, m_az, m_el = num(S, 'Azimuth'), num(S, 'Elevation'), num(M, 'Azimuth'), num(M, 'Elevation')
        cw = limb_zenith_cw(m_az, m_el, s_az, s_el)
        out.append({
            'ut': k,
            'sun': {'az': round(s_az, 4), 'el': round(s_el, 4), 'elR': round(num(sR, 'Elevation'), 4), 'ra': round(num(S, 'R.A.'), 5), 'dec': round(num(S, 'DEC'), 5)},
            'moon': {'az': round(m_az, 4), 'el': round(m_el, 4), 'elR': round(num(mR, 'Elevation'), 4), 'ra': round(num(M, 'R.A.'), 5), 'dec': round(num(M, 'DEC'), 5),
                     'illu': round(num(M, 'Illu%'), 4), 'diam': round(num(M, 'Ang-diam') / 3600, 5), 'sto': round(num(M, 'S-T-O'), 3), 'sot': round(num(M, 'S-O-T'), 3)},
            'last': round(num(M, 'L_Ap_Sid_Time'), 6),
            'limbCw': round(cw, 3),
        })
    hold = next(r for r in out if r['ut'] == a.hold)
    chi, q, z = limb_meeus(hold['sun']['ra'], hold['sun']['dec'], hold['moon']['ra'], hold['moon']['dec'], hold['last'])
    doc = {
        'about': "The Sun and the Moon over Babylon on the evening of 15 April 570 BC (Julian), one row a minute from ten minutes before sunset to ten after moonset: JPL Horizons observer tables, ephemeris DE441, topocentric (44.421 E, 32.536 N, 35 m), apparent, airless (az, el) and with Horizons' refraction (elR); illu the Moon's lit percent, diam its apparent diameter (degrees), sto the phase angle, sot the elongation, last the local apparent sidereal time (hours); limbCw the bright limb's direction from the zenith's, clockwise as seen, from the two airless positions (ours, from Horizons' numbers). Sunset and moonset: the upper limb on the horizon with 34 minutes of refraction. Written by forge/babylon/crescent-sky.py.",
        'site': [LON, LAT, 35],
        'convergence': round(CONVERGENCE, 4),
        'events': ev,
        'hold': a.hold,
        'minutes': out,
    }
    # one minute a line
    text = json.dumps({k: v for k, v in doc.items() if k != 'minutes'}, indent=1)[:-2]
    text += ',\n "minutes": [\n' + ',\n'.join('  ' + json.dumps(r, separators=(',', ':')) for r in out) + '\n ]\n}\n'
    json.loads(text)
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"sunset {ev['sunsetAt']} UT, moonset {ev['moonsetAt']} UT, lag {lag} min, best time {ev['bestAt']} UT")
    for k in (ev['sunset'], ev['best'], ev['moonset']):
        y = yallop(k)
        r = next(r for r in out if r['ut'] == k)
        print(f"{k}: sun az {r['sun']['az']:.2f} el {r['sun']['el']:.2f} (refr {r['sun']['elR']:.2f}); moon az {r['moon']['az']:.2f} el {r['moon']['el']:.2f} (refr {r['moon']['elR']:.2f}); lit {r['moon']['illu']:.2f}%, diam {r['moon']['diam'] * 60:.2f}', phase angle {r['moon']['sto']:.2f}, limb {r['limbCw']:.2f} cw; Yallop {y}")
    print(f"hold {a.hold}: Meeus chi {chi:.3f} q {q:.3f} chi-q {z:.3f} ccw, against alt-az {hold['limbCw']:.3f} cw: sum {(z + hold['limbCw']) % 360:.4f} (0 or 360 agree)")
    print(f"grid convergence {CONVERGENCE:.4f} deg; rows {len(out)} written to {a.out}")


if __name__ == '__main__':
    main()
