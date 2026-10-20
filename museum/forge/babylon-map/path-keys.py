# THE WALK'S PATH KEYS: writes the stops' hours and figures and the timed `path` into map-cams.json.
#   python3 path-keys.py <map-cams.json> [--walk <WALK.md table out>]
# Legs are given as seconds after the key before; a cut is 0.01 s. A leg marked even=(rest at start, rest at
# end) runs at a constant pace with short eases only where it starts or ends at rest, by keys about every two
# seconds, so a long leg never brakes over its last quarter. Each key's kind names the motion that arrives at
# it (walk, fly, crane, hold, turn); a stop runs from its first key to the next stop's first key; one key per
# stop is its still. The phone keeps the path and takes its own lens and shift per stop.
import json, math, sys

T = (445641.5, 3600034)                      # the tower's centre
GATE = (445772.7, 3600843.9)                 # the Ishtar Gate's north face on its axis (bearing 163)
def ax(d, c=0.0):
    """on the tower's axis, d metres out toward the stair (bearing 163), c metres across toward 253"""
    return [round(T[0] + 0.2924 * d - 0.9563 * c, 1), round(T[1] - 0.9563 * d - 0.2924 * c, 1)]
def ga(a, c=0.0):
    """on the gate's axis, a metres south of its north face, c metres across toward 253"""
    return [round(GATE[0] + 0.2924 * a - 0.9563 * c, 2), round(GATE[1] - 0.9563 * a - 0.2924 * c, 2)]

STOPS = {   # n: id, name, hour at the stop's first key, exposure stops, figure (E, N, facing), phone lens and shift
 1: ('moat', 'Over the moat to the North Gate', '17:30', 0.0, [445727, 3601085, 168], (30, -0.25)),
 2: ('lion-street', 'The lion street', '17:32', 0.0, None, (44, 0.05)),
 3: ('forecourt', 'The forecourt and the whole double gate', '17:34', 0.15, [445766.9, 3600844.2, 163], (30, 0.1)),
 4: ('through-the-gate', 'Through the gate', '17:35', 0.6, ga(36, 1.8) + [163], (44, 0.0)),
 5: ('gardens', 'The gardens question', '17:37', 0.2, None, (44, -0.35)),
 6: ('throne-court', 'The throne-room facade', '17:40', 0.6, [445652, 3600680, 180], (44, -0.25)),
 7: ('canal-city', 'The canal bridge and the filled city', '17:44', 0.3, None, (44, -0.25)),
 8: ('nabu', 'The Nabu temple and the reading table', '17:46', 0.3, None, (44, -0.25)),
 9: ('etemenanki', 'Etemenanki at true size', '17:49', 0.3, [445953.4, 3600117.5, 75], (22, 0.33)),
 10: ('turn', 'The turn', '17:53', 0.4, None, (34, 0.0)),
 11: ('esagila', 'Esagila, where the procession ended', '17:56', 0.6, None, (30, 0.0)),
 12: ('great-stair', 'The great stair and the switch', '17:59', 0.9, ax(101, -6) + [343], (44, -0.05)),
 13: ('bridge', 'The bridge over the Euphrates at sunset', '18:07', 0.7, [445452, 3599833, 265], (44, -0.05)),
 14: ('city-and-sky', 'The city and the sky', '18:14', 1.2, None, (44, -0.3)),
}
END_HOUR = '18:19'

L = [
 # 1. high over the outer city: the dam, the moat on its right, the North Gate and, far off, the tower; down onto the dam
 (0,    dict(at=[445705, 3601300], y=45, look=[445700, 3600500, 18], stop=1, kind='fly', still=True, say='over the outer city at +45: the dam, the moat, the North Gate, the tower far off')),
 (8,    dict(at=[445710, 3601205], y=24, look=[445725, 3600900, 14], stop=1, kind='fly')),
 (8,    dict(at=[445718, 3601125], y='eye', look=[445735, 3601035, 9], stop=1, kind='fly', hold=True, say='lands on the dam, the North Gate ahead')),
 (6,    dict(at=[445720.4, 3601117.3], y='eye', look=[445737, 3601030, 9], stop=1, kind='walk')),
 # 2. a taste of the lion street, then its far end toward the double gate
 (0.01, dict(at=[445740, 3601003], y='eye', look=[445773, 3600850, 15], stop=2, cut=True, kind='walk', say='cut: through the North Gate')),
 (4,    dict(at=[445741.0, 3600998.2], y='eye', look=[445773, 3600849, 15], stop=2, kind='walk')),
 (0.01, dict(at=[445748.5, 3600937], y='eye', look=[445773, 3600844, 20], stop=2, cut=True, kind='walk', still=True, say='cut: toward the end of the lion street')),
 (26,   dict(at=[445753.7, 3600906.1], y='eye', look=[445772.7, 3600843.9, 20], stop=3, kind='walk')),
 # 3. the whole double gate, held
 (5,    dict(at=[445753.7, 3600906.1], y='eye', look=[445772.7, 3600843.9, 20], stop=3, kind='hold', still=True)),
 # 4. inside the main gate's passage: the light slot, the figure passed, out onto the street
 (0.01, dict(at=ga(26), y='eye', look=ga(160) + [17], stop=4, cut=True, kind='walk', say='cut: inside the main gate')),
 (2.5,  dict(at=ga(29), y='eye', look=ga(161) + [17], stop=4, kind='walk', still=True)),
 (17.5, dict(at=ga(50), y='eye', look=ga(170) + [16], stop=4, kind='walk')),
 (6,    dict(at=ga(57), y='eye', look=ga(180, 25) + [14], stop=4, kind='walk', hold=True)),
 # 5. straight up, turning right through the tower's first glimpse to the North Palace's terraces
 (12,   dict(at=ga(57), y=46, look=[445560, 3600600, 40], stop=5, kind='fly', say='rises straight up, turning right: the tower far off over the palace')),
 (7,    dict(at=ga(57), y=60, look=[445560, 3600930, 20], stop=5, kind='turn', say='at +60: the North Palace and its terraces')),
 (5,    dict(at=ga(57), y=60, look=[445560, 3600930, 20], stop=5, kind='hold', still=True)),
 # 6. on toward the terraces, banking left over the palace roofs to the court, the tower over the throne room;
 #    down into the court; up and out east
 (6,    dict(at=[445740, 3600800], y=52, look=[445600, 3600790, 30], stop=6, kind='fly', say='on toward the terraces, banking left')),
 (6,    dict(at=[445690, 3600770], y=40, look=[445650, 3600620, 28], stop=6, kind='fly', say='over the palace roofs')),
 (7,    dict(at=[445660, 3600716], y=32, look=[445655, 3600600, 22], stop=6, kind='fly', still=True, say='over the court: the throne room, the tower above it')),
 (7,    dict(at=[445658, 3600712], y='eye', look=[445659, 3600665, 15], stop=6, kind='fly', hold=True, say='down into the court')),
 (3,    dict(at=[445658, 3600712], y='eye', look=[445659, 3600665, 15], stop=6, kind='hold')),
 (7,    dict(at=[445658, 3600712], y=30, look=[445659, 3600600, 32], stop=6, kind='fly', say='straight up: the tower again over the throne room')),
 (9,    dict(at=[445760, 3600660], y=32, look=[445790, 3600480, 15], stop=6, kind='fly', say='out east over the palace')),
 (7,    dict(at=[445830, 3600628], y=22, look=[445860, 3600540, 13], stop=6, kind='fly')),
 # 7. over the canal's mouth at the street bridge; a turn right: the canal's line of water runs to the river and the low sun
 (6,    dict(at=[445838, 3600604], y=24, look=[445860, 3600530, 12], stop=7, kind='fly', hold=True, say='over the canal where the street bridges it')),
 (8,    dict(at=[445838, 3600604], y=24, look=[445500, 3600604, -1], stop=7, kind='turn', say='turns right: the canal, down its length')),
 (5,    dict(at=[445838, 3600604], y=24, look=[445500, 3600604, -1], stop=7, kind='hold', still=True)),
 (8,    dict(at=[445838, 3600604], y=24, look=[445838, 3600520, 12], stop=7, kind='turn', hold=True, say='turns back south')),
 # 8. the low glide south along the street, the Nabu temple passing on the right, the tower ahead over the precinct
 (8,    dict(at=[445850, 3600555], y=28, look=[445850, 3600380, 10], stop=8, kind='fly', say='into a low glide south')),
 (8,    dict(at=[445875, 3600468], y=30, look=[445875, 3600340, 4], stop=8, kind='fly', still=True, say='the Nabu temple and its court on the right')),
 (12,   dict(at=[445915, 3600330], y=17, look=[445960, 3600170, 6], stop=8, kind='fly')),
 # 9. down beside the precinct wall, a walk to Gate 5, turning right: the tower in the opening
 (16,   dict(at=[445968, 3600157], y='eye', look=[445985, 3600090, 5], stop=9, kind='fly', hold=True, say='down onto the street by the precinct wall')),
 (26,   dict(at=[445977, 3600126], y='eye', look=[445641.5, 3600034, 6], stop=9, kind='walk', say='to Gate 5, turning right toward the tower')),
 (6,    dict(at=[445977, 3600126], y='eye', look=[445641.5, 3600034, 6], stop=9, kind='hold', still=True)),
 # 10. straight up off the street before Gate 5 over the precinct wall; out south-west over the precinct's south rooms:
 #     Esagila ahead, the river beyond
 (7,    dict(at=[445977, 3600126], y=26, look=[445641.5, 3600034, 40], stop=10, kind='fly', still=True, say='straight up: the precinct and the tower over its wall')),
 (15,   dict(at=[445860, 3599930], y=40, look=[445560, 3599700, 20], stop=10, kind='fly', say='out over the precinct\'s south-east corner: Esagila ahead, the river beyond')),
 # 11. over Esagila's annex and west past its south side; a turn right over the river bank: Esagila lit on its west face, the
 #     tower behind it; north along Esagila's west side and down to the precinct gate
 (22,   dict(at=[445720, 3599640], y=40, look=[445560, 3599690, 18], stop=11, kind='fly', say="over the annex, past Esagila's south side toward the river")),
 (11,   dict(at=[445540, 3599560], y=45, look=[445430, 3599720, 10], stop=11, kind='fly', hold=True, say='over the river bank')),
 (7,    dict(at=[445540, 3599560], y=45, look=[445680, 3599860, 20], stop=11, kind='turn', hold=True, say='turns right: Esagila lit on its west face, the tower behind it')),
 (4,    dict(at=[445540, 3599560], y=45, look=[445680, 3599860, 20], stop=11, kind='hold', still=True)),
 (14,   dict(at=[445620, 3599790], y=24, look=[445641.5, 3600034, 45], stop=11, kind='fly', say="north along Esagila's west side")),
 (6,    dict(at=ax(200), y=10, look=[445641.5, 3600034, 45], stop=11, kind='fly', say='onto the gate\'s axis')),
 (7,    dict(at=ax(158), y='eye', look=[445641.5, 3600034, 45], stop=12, kind='fly', hold=True, say='down onto the street at the precinct gate: the stair and the tower in it')),
 # 12. the great stair seen through the precinct gate; up through the gate, rising in front of the stair, over the top
 (4,    dict(at=ax(158), y='eye', look=[445641.5, 3600034, 45], stop=12, kind='hold')),
 (7,    dict(at=ax(128), y=12, look=[445641.5, 3600034, 50], stop=12, kind='fly', say='up through the gate')),
 (8,    dict(at=ax(118), y=42, look=[445641.5, 3600034, 70], stop=12, kind='fly', still=True, say='rising before the stair: the whole tower')),
 (8,    dict(at=ax(105), y=72, look=[445641.5, 3600034, 90], stop=12, kind='fly')),
 (8,    dict(at=ax(70), y=100, look=[445641.5, 3600034, 98], stop=12, kind='fly')),
 (7,    dict(at=ax(32), y=110, look=[445610, 3600110, 90], stop=12, kind='fly', say='over the top')),
 # 13. west and down to the bridge at sunset; a walk on it; the look back at the tower
 (8,    dict(at=[445600, 3599990], y=92, look=[445400, 3599820, 12], stop=13, kind='fly', say='turns left over the top: the river and the bridge')),
 (15,   dict(at=[445548, 3599868], y=34, look=[445380, 3599830, 3], stop=13, kind='fly', say='glides down over the street line')),
 (8,    dict(at=[445500, 3599838], y='eye', look=[445300, 3599826, 4], stop=13, kind='fly', hold=True, say='lands on the bridge, the sun ahead')),
 (6,    dict(at=[445492.5, 3599837.3], y='eye', look=[445300, 3599826, 4], stop=13, kind='walk', hold=True)),
 (6,    dict(at=[445492.5, 3599837.3], y='eye', look=[445480, 3600000, 14], stop=13, kind='turn', say='looks back, turning right through north')),
 (6,    dict(at=[445492.5, 3599837.3], y='eye', look=[445641.5, 3600034, 32], stop=13, kind='turn', say='to the tower across the river')),
 (4,    dict(at=[445492.5, 3599837.3], y='eye', look=[445641.5, 3600034, 32], stop=13, kind='hold', still=True)),
 # 14. the crane up and back over the river: the whole city
 (18,   dict(at=[445380, 3599700], y=170, look=[445800, 3600250, 0], stop=14, kind='crane', say='rises up and back, a crane, the one backward move (WALK stop 14)')),
 (10,   dict(at=[445300, 3599610], y=255, look=[445870, 3600360, 0], stop=14, kind='crane', still=True)),
]
# a key the next key stands on is held: the camera arrives at rest
for i in range(len(L) - 1):
    a, b = L[i][1], L[i + 1][1]
    if a['at'] == b['at'] and a['look'] == b['look'] and a['y'] == b['y'] and not b.get('cut'):
        a['hold'] = True
for _, k in L:
    if k['kind'] == 'hold':
        k['hold'] = True

def lerp(a, b, u):
    return [a[i] + (b[i] - a[i]) * u for i in range(len(a))]


def look_at(a, b, u):
    """the look between two keys by its angle round the camera, its reach and its level, not by a straight
    line between the two look points (that line sweeps past the camera and spins the view)"""
    pa, pb = a['at'], b['at']
    p = lerp(pa, pb, u)
    ya = math.atan2(a['look'][0] - pa[0], a['look'][1] - pa[1])
    yb = math.atan2(b['look'][0] - pb[0], b['look'][1] - pb[1])
    dy = (yb - ya + math.pi) % (2 * math.pi) - math.pi
    ra = math.hypot(a['look'][0] - pa[0], a['look'][1] - pa[1])
    rb = math.hypot(b['look'][0] - pb[0], b['look'][1] - pb[1])
    yw, r = ya + dy * u, ra + (rb - ra) * u
    return [p[0] + r * math.sin(yw), p[1] + r * math.cos(yw), a['look'][2] + (b['look'][2] - a['look'][2]) * u]


def even_keys(a, b, t0, dt, rest0, rest1):
    """keys between a and b at a constant pace, eased over about 1.5 s at an end at rest"""
    e0 = min(1.5, dt / 4) if rest0 else 0.0
    e1 = min(1.5, dt / 4) if rest1 else 0.0
    v = 1.0 / (dt - e0 / 2 - e1 / 2)            # in units of the leg per second
    def s(t):                                    # share of the leg done after t seconds
        if t <= e0:
            return v * t * t / (2 * e0) if e0 else v * t
        if t >= dt - e1:
            r = dt - t
            return 1 - (v * r * r / (2 * e1) if e1 else v * r)
        return v * (e0 / 2 + (t - e0))
    times = [e0] if e0 else []
    n = max(1, round((dt - e0 - e1) / 1.5))
    times += [e0 + (dt - e0 - e1) * k / n for k in range(1, n)]
    if e1:
        times.append(dt - e1)
    out = []
    for t in times:
        if t <= 0.05 or t >= dt - 0.05:
            continue
        u = s(t)
        k = {kk: vv for kk, vv in b.items() if kk not in ('say', 'even', 'hold', 'cut', 'still', 'phone')}
        k['at'] = [round(x, 2) for x in lerp(a['at'], b['at'], u)]
        k['look'] = [round(x, 2) for x in look_at(a, b, u)]
        if isinstance(a['y'], (int, float)) and isinstance(b['y'], (int, float)):
            k['y'] = round(a['y'] + (b['y'] - a['y']) * u, 2)
        k['t'] = round(t0 + t, 2)
        k['stop'] = a['stop']                   # a stop starts at its own first key
        k['phone'] = {kk: round(a['phone'][kk] + (b['phone'][kk] - a['phone'][kk]) * u, 3) for kk in ('hfov', 'shift')}
        out.append(k)
    return out


def phone_of(stop):
    h, sh = STOPS[stop][5]
    return {'hfov': h, 'shift': sh}


def build():
    """every leg between two keys of one kind of height (both on foot or both in the air) runs at a constant
    pace, eased only into and out of a held key; a landing or a take-off is one Hermite segment between holds"""
    t, path = 0.0, []
    for dt, k in L:
        t = round(t + dt, 2)
        k = dict(k)
        k['phone'] = {**phone_of(k['stop']), **k.get('phone', {})}
        k.pop('even', None)
        if path and not k.get('cut') and dt > 0.5:
            a = path[-1]
            same_kind = isinstance(a['y'], str) == isinstance(k['y'], str)
            still = a['at'] == k['at'] and a['look'] == k['look'] and a['y'] == k['y']
            if same_kind and not still:
                path += even_keys(a, k, a['t'], dt, bool(a.get('hold')) or a['t'] == 0, bool(k.get('hold')))
        path.append({'t': t, **k})
    return path, t


def walk_rows(path):
    """WALK.md's table: one row per run of keys with one kind and one stop, cuts as their own rows"""
    rows = []
    for a, b in zip(path, path[1:]):
        kind = 'cut' if b.get('cut') else b['kind']
        if kind == 'turn':
            kind = 'turn (standing)'
        stop = a['stop'] if not b.get('cut') else b['stop']
        if rows and rows[-1]['kind'] == kind and rows[-1]['stop'] == stop and kind != 'cut':
            rows[-1]['to'] = b['t']
        else:
            rows.append({'from': a['t'], 'to': b['t'], 'kind': kind, 'stop': stop})
    return rows


if __name__ == '__main__':
    f = sys.argv[1]
    cams = json.load(open(f))
    path, t = build()
    cams['path'] = path
    cams['endHour'] = END_HOUR
    cams['stops'] = [{'n': n, 'id': v[0], 'name': v[1], 'hour': v[2], 'stops': v[3], **({'figure': v[4]} if v[4] else {})} for n, v in STOPS.items()]
    for s in cams['stops']:
        if not s['stops']:
            del s['stops']
    open(f, 'w').write(json.dumps(cams, indent=1, ensure_ascii=False) + '\n')
    print('duration', t, 'keys', len(path))
    if '--walk' in sys.argv:
        rows = walk_rows(path)
        out = ['| # | from s | to s | kind | stop |', '|---|---|---|---|---|']
        for i, r in enumerate(rows, 1):
            out.append(f"| {i} | {r['from']:.0f} | {r['to']:.0f} | {r['kind']} | {r['stop']} {STOPS[r['stop']][1]} |")
        open(sys.argv[sys.argv.index('--walk') + 1], 'w').write('\n'.join(out) + '\n')
