#!/usr/bin/env python3
"""TODAY'S COASTS AND RIVERS for feature 2's map, cut from Natural Earth (public domain, naturalearthdata.com).

  python3 -I coasts.py <ne_50m_coastline.zip> <ne_50m_rivers_lake_centerlines.zip> <out.json> [--box W,S,E,N] [--tol 0.03]
  python3 -I coasts.py --self-test

Reads the two published zips as they are (the shapefiles' polylines and the rivers' names from the dbf), keeps what
falls inside the box, simplifies each line (Douglas-Peucker, degrees) and writes lon/lat pairs to three decimals: the
coasts as open lines, and the three rivers the map names by its places (Euphrates, Tigris, Nile). Standard library only.
The data are today's: the map says so; nothing here is the coast of 570 BC.
"""
import io
import json
import struct
import sys
import zipfile

RIVERS = ('Euphrates', 'Tigris', 'Nile')


def shp_lines(data):
    """every polyline part of a shapefile (type 3 or 13), as lists of (lon, lat)"""
    out = []
    pos = 100
    while pos + 8 <= len(data):
        _, words = struct.unpack('>ii', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + words * 2]
        pos += 8 + words * 2
        kind = struct.unpack('<i', body[:4])[0]
        if kind not in (3, 13):
            out.append([])
            continue
        nparts, npts = struct.unpack('<ii', body[36:44])
        parts = list(struct.unpack('<%di' % nparts, body[44:44 + 4 * nparts]))
        at = 44 + 4 * nparts
        pts = [struct.unpack('<dd', body[at + 16 * i:at + 16 * i + 16]) for i in range(npts)]
        rec = []
        for k, start in enumerate(parts):
            end = parts[k + 1] if k + 1 < nparts else npts
            rec.append(pts[start:end])
        out.append(rec)
    return out


def dbf_rows(data):
    """the dbf's records as dicts of stripped strings"""
    n, head, size = struct.unpack('<IHH', data[4:12])
    fields, at = [], 32
    while data[at] != 0x0D:
        name = data[at:at + 11].split(b'\0')[0].decode('latin-1')
        fields.append((name, data[at + 16]))
        at += 32
    rows = []
    for r in range(n):
        rec = data[head + r * size:head + (r + 1) * size]
        off, row = 1, {}
        for name, length in fields:
            row[name] = rec[off:off + length].decode('utf-8', 'replace').strip()
            off += length
        rows.append(row)
    return rows


def read_zip(path, stem):
    with zipfile.ZipFile(path) as z:
        names = {n.rsplit('/', 1)[-1]: n for n in z.namelist()}
        shp = z.read(names[stem + '.shp'])
        dbf = z.read(names[stem + '.dbf']) if stem + '.dbf' in names else None
    return shp, dbf


def clip(line, box):
    """the runs of a line inside the box, each with the first point outside on either end kept, so a coast reaches the edge"""
    w, s, e, n = box
    inside = [w <= x <= e and s <= y <= n for x, y in line]
    runs, cur = [], []
    for i, (p, ok) in enumerate(zip(line, inside)):
        if ok:
            if not cur and i > 0:
                cur.append(line[i - 1])
            cur.append(p)
        elif cur:
            cur.append(p)
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2]


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    dx, dy = bx - ax, by - ay
    norm = (dx * dx + dy * dy) ** 0.5
    best, at = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs(dy * px - dx * py + bx * ay - by * ax) / norm if norm else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        if d > best:
            best, at = d, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:at + 1], tol)[:-1] + simplify(pts[at:], tol)


def cut(coast_zip, river_zip, box, tol):
    shp, _ = read_zip(coast_zip, 'ne_50m_coastline')
    coasts = []
    for rec in shp_lines(shp):
        for part in rec:
            for run in clip(part, box):
                s = simplify(run, tol)
                if len(s) >= 2:
                    coasts.append([[round(x, 3), round(y, 3)] for x, y in s])
    shp, dbf = read_zip(river_zip, 'ne_50m_rivers_lake_centerlines')
    rows = dbf_rows(dbf)
    rivers = []
    for rec, row in zip(shp_lines(shp), rows):
        name = row.get('name_en') or row.get('name') or ''
        hit = next((r for r in RIVERS if r.lower() in name.lower()), None)
        if not hit:
            continue
        for part in rec:
            for run in clip(part, box):
                s = simplify(run, tol)
                if len(s) >= 2:
                    rivers.append({'name': hit, 'line': [[round(x, 3), round(y, 3)] for x, y in s]})
    return coasts, rivers


def self_test():
    # a polyline shapefile of one record with two parts, and a dbf of one field
    pts = [(0.0, 0.0), (1.0, 0.0), (2.0, 0.001), (3.0, 0.0), (5.0, 5.0), (6.0, 5.0)]
    body = struct.pack('<i4d', 3, 0, 0, 6, 5) + struct.pack('<ii', 2, 6) + struct.pack('<2i', 0, 4)
    body += b''.join(struct.pack('<dd', *p) for p in pts)
    shp = b'\0' * 100 + struct.pack('>ii', 1, len(body) // 2) + body
    lines = shp_lines(shp)
    assert lines == [[pts[:4], pts[4:]]], lines
    assert simplify(pts[:4], 0.01) == [pts[0], pts[3]]
    assert clip([(-1, 0), (0.5, 0.5), (2, 0)], (0, 0, 1, 1)) == [[(-1, 0), (0.5, 0.5), (2, 0)]]
    head = struct.pack('<BBBBIHH', 3, 26, 11, 4, 1, 32 + 32 + 1, 1 + 8) + b'\0' * 20
    field = b'name_en'.ljust(11, b'\0') + b'C' + b'\0' * 4 + bytes([8]) + b'\0' * 15
    dbf = head + field + b'\x0d' + b' ' + b'Nile'.ljust(8)
    assert dbf_rows(dbf) == [{'name_en': 'Nile'}]
    print('self-test: ok')


def main(argv):
    if argv[:1] == ['--self-test']:
        self_test()
        return 0
    if len(argv) < 3:
        print(__doc__)
        return 2
    box, tol = (24.5, 27.0, 48.5, 41.5), 0.03
    if '--box' in argv:
        box = tuple(float(v) for v in argv[argv.index('--box') + 1].split(','))
    if '--tol' in argv:
        tol = float(argv[argv.index('--tol') + 1])
    coasts, rivers = cut(argv[0], argv[1], box, tol)
    out = {
        'about': "Today's coastlines and three rivers (Natural Earth 1:50m, version 4.0.0 as published), cut to the "
                 "box and simplified; drawn as today's, never as the coast of 570 BC.",
        'source': 'Natural Earth, naturalearthdata.com, ne_50m_coastline and ne_50m_rivers_lake_centerlines',
        'licence': 'public domain (naturalearthdata.com/about/terms-of-use)',
        'box': list(box), 'tolerance_deg': tol,
        'coasts': coasts, 'rivers': rivers,
    }
    with open(argv[2], 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print('coasts %d lines, %d points; rivers %s' % (len(coasts), sum(len(c) for c in coasts),
          ', '.join('%s %d pts' % (r['name'], len(r['line'])) for r in rivers)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
