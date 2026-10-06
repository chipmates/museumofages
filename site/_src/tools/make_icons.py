#!/usr/bin/env python3
"""Makes the sign's PNG icons from its own files, without a browser.

    python3 _src/tools/make_icons.py

    sign/tab.svg -> sign/tab-32.png    the tab's cut on 16 at twice its size, for a browser that takes no SVG icon
    sign/tab.svg -> sign/tab-96.png    the same at six times, for search results, which ask a multiple of 48 px
    sign/app.svg -> sign/home-180.png  a phone's home screen
and sign/icons.json with the hash of each source and each picture: the build reads it, so a picture made from an
older drawing stops the build.

The files are read as they are. The tool draws what these files use and nothing more (one rect, paths of absolute
M L H V A Z, a group's translate and scale, fill and stroke, one class shown from a width on) and stops on anything
else. A pixel takes the share of it that a shape covers, from 16 by 16 samples, as a browser blends. Needs Pillow.
"""
import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw

SIGN = Path(__file__).resolve().parent.parent / "sign"
MADE = (("tab.svg", "tab-32.png", 32), ("tab.svg", "tab-96.png", 96), ("app.svg", "home-180.png", 180))
SAMPLES = 16
NS = "{http://www.w3.org/2000/svg}"
NUM = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
# SVG's default miter limit: a sharper join would be bevelled, which this tool does not draw
MITER_LIMIT = 4


def stop(message):
    raise SystemExit(f"make_icons: {message}")


def colour(value, where):
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value or ""):
        stop(f"{where}: the colour {value!r} is not a six-digit hex value")
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


def arc(x1, y1, rx, ry, phi, large, sweep, x2, y2):
    """Points along an SVG arc, from its end points (the SVG specification's implementation notes)."""
    if (x1, y1) == (x2, y2):
        return []
    if rx == 0 or ry == 0:
        return [(x2, y2)]
    rx, ry, p = abs(rx), abs(ry), math.radians(phi)
    c, s = math.cos(p), math.sin(p)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    xp, yp = c * dx + s * dy, -s * dx + c * dy
    grow = xp * xp / (rx * rx) + yp * yp / (ry * ry)
    if grow > 1:
        rx, ry = rx * math.sqrt(grow), ry * math.sqrt(grow)
    num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    k = math.sqrt(max(0.0, num / (rx * rx * yp * yp + ry * ry * xp * xp)))
    if large == sweep:
        k = -k
    cxp, cyp = k * rx * yp / ry, -k * ry * xp / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2
    angle = lambda ux, uy, vx, vy: math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    ux, uy = (xp - cxp) / rx, (yp - cyp) / ry
    t1 = angle(1, 0, ux, uy)
    dt = angle(ux, uy, (-xp - cxp) / rx, (-yp - cyp) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    n = max(2, math.ceil(abs(dt) / math.radians(0.25)))
    out = []
    for i in range(1, n + 1):
        t = t1 + dt * i / n
        out.append((cx + rx * math.cos(t) * c - ry * math.sin(t) * s, cy + rx * math.cos(t) * s + ry * math.sin(t) * c))
    out[-1] = (x2, y2)
    return out


def subpaths(d):
    """[(points, closed)] of a path's data."""
    tokens = re.findall(rf"[A-Za-z]|{NUM}", d)
    if re.sub(rf"[A-Za-z]|{NUM}|[\s,]", "", d):
        stop(f"path data this tool does not read: {d[:40]}")
    out, cur, cmd, x, y, i = [], None, None, 0.0, 0.0, 0

    def take(n):
        nonlocal i
        part = tokens[i:i + n]
        if len(part) < n or any(re.fullmatch(r"[A-Za-z]", t) for t in part):
            stop(f"a command lacks its numbers: {d[:40]}")
        i += n
        return [float(t) for t in part]

    while i < len(tokens):
        if re.fullmatch(r"[A-Za-z]", tokens[i]):
            cmd = tokens[i]
            i += 1
            if cmd not in "MLHVAZz":
                stop(f"the command {cmd} (only absolute M L H V A Z are drawn)")
            if cmd in "Zz":
                cur[1] = True
                x, y = cur[0][0]
                cmd = None
                continue
        elif cmd is None:
            stop(f"numbers without a command: {d[:40]}")
        if cmd == "M":
            x, y = take(2)
            cur = [[(x, y)], False]
            out.append(cur)
            cmd = "L"
        elif cmd == "L":
            x, y = take(2)
            cur[0].append((x, y))
        elif cmd == "H":
            (x,) = take(1)
            cur[0].append((x, y))
        elif cmd == "V":
            (y,) = take(1)
            cur[0].append((x, y))
        elif cmd == "A":
            rx, ry, phi, large, sweep, nx, ny = take(7)
            cur[0].extend(arc(x, y, rx, ry, phi, int(large), int(sweep), nx, ny))
            x, y = nx, ny
    return [(pts, closed) for pts, closed in out]


def outline(points, width):
    """An open line of the given width with butt ends, as one polygon."""
    pts = [points[0]]
    for q in points[1:]:
        if math.hypot(q[0] - pts[-1][0], q[1] - pts[-1][1]) > 1e-9:
            pts.append(q)
    if len(pts) < 2:
        return []
    normals = []
    for a, b in zip(pts, pts[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        normals.append((-dy / length, dx / length))
    half, left, right = width / 2, [], []
    for i, q in enumerate(pts):
        if i in (0, len(pts) - 1):
            n, m = normals[0 if i == 0 else -1], 1.0
        else:
            n1, n2 = normals[i - 1], normals[i]
            sx, sy = n1[0] + n2[0], n1[1] + n2[1]
            length = math.hypot(sx, sy)
            if length < 1e-9:
                stop("a line turns back on itself")
            n = (sx / length, sy / length)
            cos = n[0] * n1[0] + n[1] * n1[1]
            if 1 / cos > MITER_LIMIT:
                stop("a sharp join this tool does not draw")
            m = 1 / cos
        left.append((q[0] + n[0] * half * m, q[1] + n[1] * half * m))
        right.append((q[0] - n[0] * half * m, q[1] - n[1] * half * m))
    return left + right[::-1]


def transform(text):
    """A group's transform as (scale, dx, dy): translate and a single scale, applied right to left."""
    s, tx, ty = 1.0, 0.0, 0.0
    parts = re.findall(r"(translate|scale)\(([^)]*)\)", text or "")
    if re.sub(r"(translate|scale)\([^)]*\)|\s", "", text or ""):
        stop(f"a transform this tool does not read: {text}")
    for kind, args in reversed(parts):
        v = [float(a) for a in re.findall(NUM, args)]
        if kind == "scale":
            if len(v) != 1:
                stop("a scale of two values")
            s, tx, ty = s * v[0], tx * v[0], ty * v[0]
        else:
            tx, ty = tx + v[0], ty + (v[1] if len(v) > 1 else 0.0)
    return s, tx, ty


def hidden_rule(root):
    """The one style rule the files carry: a class hidden, then shown from a width on. {class: width}."""
    rules = {}
    for style in root.iter(f"{NS}style"):
        text = re.sub(r"\s+", "", style.text or "")
        found = re.fullmatch(r"\.(\w+)\{display:none\}@media\(min-width:(\d+)px\)\{\.\1\{display:inline\}\}", text)
        if not found:
            stop(f"a style rule this tool does not read: {style.text}")
        rules[found.group(1)] = int(found.group(2))
    return rules


def render(svg_path, size):
    root = ET.parse(svg_path).getroot()
    box = [float(v) for v in root.get("viewBox", "").split()]
    if len(box) != 4 or box[:2] != [0, 0] or box[2] != box[3]:
        stop(f"{svg_path.name}: the view box is not a square from 0 0")
    k = size * SAMPLES / box[2]
    shown_from = hidden_rule(root)
    big = size * SAMPLES
    rgb, mask, tile = None, None, None
    used = set()

    def inside_tile(x, y):
        x0, y0, w, h, r = tile
        cx, cy = min(max(x, x0 + r), x0 + w - r), min(max(y, y0 + r), y0 + h - r)
        return math.hypot(x - cx, y - cy) <= r + 1e-6

    def paint(el, s, tx, ty):
        nonlocal rgb, mask, tile
        tag = el.tag.replace(NS, "")
        if tag in ("style", "title", "desc"):
            return
        cls = el.get("class")
        if cls and cls in shown_from and size < shown_from[cls]:
            return
        if tag == "g":
            gs, gx, gy = transform(el.get("transform"))
            for child in el:
                paint(child, s * gs, s * gx + tx, s * gy + ty)
            return
        at = lambda p: ((p[0] * s + tx) * k, (p[1] * s + ty) * k)
        if tag == "rect":
            if rgb is not None:
                stop(f"{svg_path.name}: a second rect")
            x, y = float(el.get("x", 0)), float(el.get("y", 0))
            w, h, r = float(el.get("width")), float(el.get("height")), float(el.get("rx", 0))
            if (x, y, w, h, s, tx, ty) != (0, 0, box[2], box[2], 1, 0, 0):
                stop(f"{svg_path.name}: the rect is not the whole tile")
            fill = colour(el.get("fill"), svg_path.name)
            used.add(el.get("fill").lower())
            rgb = Image.new("RGB", (big, big), fill)
            mask = Image.new("L", (big, big), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=r * k, fill=255)
            tile = (0, 0, w, h, r)
            return
        if tag != "path":
            stop(f"{svg_path.name}: the element {tag}")
        if rgb is None:
            stop(f"{svg_path.name}: a path before the tile")
        draw = ImageDraw.Draw(rgb)
        parts = subpaths(el.get("d"))
        polys = []
        fill = el.get("fill", "#000000")
        if fill != "none":
            used.add(fill.lower())
            polys += [(pts, colour(fill, svg_path.name)) for pts, _ in parts]
        stroke = el.get("stroke")
        if stroke and stroke != "none":
            used.add(stroke.lower())
            width = float(el.get("stroke-width", 1))
            for pts, closed in parts:
                if closed:
                    stop(f"{svg_path.name}: a closed stroke")
                polys.append((outline(pts, width), colour(stroke, svg_path.name)))
        for pts, ink in polys:
            if not all(inside_tile(*p) for p in [((q[0] * s + tx), (q[1] * s + ty)) for q in pts]):
                stop(f"{svg_path.name}: a shape reaches past the tile")
            draw.polygon([at(p) for p in pts], fill=ink)

    for child in root:
        paint(child, 1.0, 0.0, 0.0)
    if rgb is None:
        stop(f"{svg_path.name}: no tile")
    rgb, mask = rgb.reduce(SAMPLES), mask.reduce(SAMPLES)
    if mask.getextrema() == (255, 255):
        return rgb, used, shown_from
    out = rgb.convert("RGBA")
    out.putalpha(mask)
    return out, used, shown_from


def main():
    record = {}
    for source, name, size in MADE:
        path = SIGN / source
        picture, used, shown_from = render(path, size)
        target = SIGN / name
        picture.save(target, optimize=True)
        record[name] = {"from": source, "size": size, "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                        "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}
        rule = "; ".join(f".{c} drawn from {w} px: {'yes' if size >= w else 'no'}" for c, w in shown_from.items()) or "no rule"
        print(f"{source} -> {name}: {size} by {size}, {picture.mode}, colours {', '.join(sorted(used))}, {rule}")
    (SIGN / "icons.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(f"{SIGN / 'icons.json'} written")


if __name__ == "__main__":
    main()
