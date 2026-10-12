"""The sizes of a wing's works at one scale, drawn in code: a page's chart, its list, its table and the chart's stills.

Every size, holder and stop is read from the wing's facts file and the group of the wing's page that a topic page
names (its registry entry, from), never from the page's words. The page's words name a work by its line, and the
build checks that each line carries its work's size as the facts give it.

A shape on the page is an inline SVG whose width and height are set in em, one em being one metre: a panel sets the
font size of its shapes from its own width (container query units), so every shape of a panel stands at one scale,
whatever the screen. The stills are one SVG each, at a fixed size, rendered by make_pictures.py.
Standard library only. This file names no wing and no work.
"""
import hashlib
import html
import re

# One em of a shape is one metre. A panel is this many metres wide, so a wall of 8.8 metres keeps its padding.
PANEL_M = 9.2
# The second panel draws the works under one metre again, this many times larger.
ZOOM = 3
# The works the second panel draws again: those less tall than this, in centimetres.
ZOOM_UNDER_CM = 100
# A standing person, drawn in millimetres: 45 cm wide and as tall as the facts' person (the path is for 170 cm and is
# scaled to the facts' height).
PERSON_W = 450
PERSON_PATH = ("M190 228C176 214 168 194 168 168V118C168 64 194 34 225 34C256 34 282 64 282 118V168C282 194 274 214 260 228"
               "V250C330 262 384 282 398 318L432 610C438 664 436 760 428 1020C426 1046 402 1052 392 1030L372 668"
               "C370 646 362 640 360 664L352 930L336 1684C334 1696 324 1700 314 1700H252C244 1700 238 1694 238 1684L230 1050"
               "C229 1040 221 1040 220 1050L212 1684C212 1694 206 1700 198 1700H136C126 1700 116 1696 114 1684L98 930"
               "L90 664C88 640 80 646 78 668L58 1030C48 1052 24 1046 22 1020C14 760 12 664 18 610L52 318"
               "C66 282 120 262 190 250Z")


def esc(text):
    return html.escape(text, quote=True)


def inches(cm):
    """Centimetres as whole inches, a half rounded up."""
    return int(cm / 2.54 + 0.5)


def cm_of(m):
    """A size in metres as centimetres, without the float's tail."""
    return round(m * 100, 1)


class Works:
    """The works of one group of a wing's page, in the order they hang, with the work that hangs elsewhere (field) last.

    Each work: n, id, face, h and w in centimetres, class, holder (the facts' entry), stop, and title by language."""

    def __init__(self, facts, group):
        holders = {h["id"]: h for h in facts["holders"]}
        self.items = []
        for p in facts[group["from"]]:
            self.items.append({"n": p["n"], "id": p["id"], "face": p["face"], "h": p["h_cm"], "w": p["w_cm"],
                               "class": p["class"], "holder": holders[p["holder"]], "stop": p["stop"], "title": p["title"]})
        field, size = group.get("field"), (facts.get("wall") or {}).get("supper")
        if field and size:
            self.items.append({"n": len(self.items) + 1, "id": "field", "face": "front", "h": cm_of(size["h_m"]),
                               "w": cm_of(size["w_m"]), "class": "", "holder": holders[field["holder"]],
                               "stop": field.get("stop"), "title": None, "field": True})
        self.person_cm = cm_of(facts["set"]["person_m"])

    def shapes(self):
        """One shape per object: a panel shown from both sides is one shape with both numbers."""
        out = {}
        for it in self.items:
            if it["id"] in out:
                out[it["id"]]["ns"].append(it["n"])
            else:
                out[it["id"]] = dict(it, ns=[it["n"]])
        return list(out.values())

    def by_id(self, key):
        return next(it for it in self.items if it["id"] == key)


NBSP = "\u00a0"


def size_text(it, num, lang, unit="cm", space=" "):
    """A work's size, height by width. space=NBSP keeps it on one line where it is shown in running text."""
    return f'{num(it["h"], lang)}{space}×{space}{num(it["w"], lang)}{space}{unit}'


def check_lines(works, lines, num, lang):
    """The page's line for each work names that work's size as the facts give it. Returns the problems."""
    problems = []
    if len(lines) != len(works.items):
        return [f"the list has {len(lines)} lines, the facts {len(works.items)} works"]
    for it, line in zip(works.items, lines):
        want = size_text(it, num, lang)
        if want not in line:
            problems.append(f"line {it['n']} does not carry its size {want!r}: {line[:60]!r}")
        elif lang == "en" and f"({inches(it['h'])} × {inches(it['w'])} in)" not in line:
            problems.append(f"line {it['n']} does not carry its size in inches ({inches(it['h'])} × {inches(it['w'])} in)")
    return problems


def split_line(line, it, num, lang):
    """A line's title (what stands before its size, with its full stop) and the rest."""
    at = line.replace(NBSP, " ").index(size_text(it, num, lang))
    return line[:at].rstrip(), line[at:]


# ---------- the page ----------

def shape_svg(it, cls=""):
    """A work as a frame of its own size: width and height in metres as em, the drawing in millimetres."""
    w, h = round(it["w"] * 10), round(it["h"] * 10)
    return (f'<svg class="sz-s{cls}" width="{it["w"] / 100:g}em" height="{it["h"] / 100:g}em" viewBox="0 0 {w} {h}" '
            f'aria-hidden="true" focusable="false"><rect width="{w}" height="{h}" vector-effect="non-scaling-stroke"/></svg>')


def person_svg(height_cm):
    k = height_cm / 170
    return (f'<svg class="sz-s sz-s--person" width="{PERSON_W * k / 1000:g}em" height="{height_cm / 100:g}em" '
            f'viewBox="0 0 {PERSON_W} 1700" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
            f'<path d="{PERSON_PATH}"/></svg>')


def panel(works, mark, labels, num, lang, zoom=False, rich=esc):
    """One panel: the person (in the first), every shape in the order they hang, and a metre for scale. Under each
    shape its numbers, and under the marked one and the field its name too."""
    cells = []
    if not zoom:
        cells.append(f'<li class="sz-i">{person_svg(works.person_cm)}<span class="sz-n">{esc(labels["person"])}</span></li>')
    for it in works.shapes():
        if zoom and (it.get("field") or it["h"] >= ZOOM_UNDER_CM):
            continue
        cls = " sz-s--mark" if it["id"] == mark else " sz-s--field" if it.get("field") else ""
        key = ", ".join(str(n) for n in it["ns"])
        name = f' <span class="sz-name">{rich(labels["mark"] if it["id"] == mark else labels["field"])}</span>' \
            if it["id"] == mark or it.get("field") else ""
        cells.append(f'<li class="sz-i{" sz-i--wide" if it.get("field") else ""}">{shape_svg(it, cls)}'
                     f'<span class="sz-n">{key}{name}</span></li>')
    cells.append(f'<li class="sz-i sz-i--bar"><span class="sz-bar"></span><span class="sz-n">{num(1, lang)} m</span></li>')
    return f'<ol class="sz-row">{"".join(cells)}</ol>'


def top_figure(works, mark, labels, num, lang):
    """The first screen's drawing: the person and the marked work on one floor, in one SVG of four metres by two."""
    it = works.by_id(mark)
    k = works.person_cm / 170
    pw, ph = PERSON_W * k, works.person_cm * 10
    w, h = it["w"] * 10, it["h"] * 10
    px, mx, floor = 1180, 2050, 1880
    person = (f'<g transform="translate({px:g} {floor - ph:g}) scale({k:g})"><path class="sz-p" d="{PERSON_PATH}"/></g>')
    work = f'<rect class="sz-m" x="{mx}" y="{floor - h:g}" width="{w:g}" height="{h:g}" vector-effect="non-scaling-stroke"/>'
    # the two heights as a draughtsman marks them: a line from the floor to the top, its number beside it
    tick = lambda x, top, words, anchor: (
        f'<path class="sz-d" d="M{x:g} {floor}V{top:g}M{x - 40:g} {top:g}H{x + 40:g}" vector-effect="non-scaling-stroke"/>'
        f'<text class="sz-t" x="{x + (70 if anchor == "start" else -70):g}" y="{top + 60:g}" text-anchor="{anchor}">{words}</text>')
    marks = (tick(px - 120, floor - ph, esc(labels["person"]), "end")
             + tick(mx + w + 120, floor - h, esc(size_text(it, num, lang)), "start"))
    return (f'<svg class="sz-top" viewBox="0 0 4000 2000" role="img" aria-label="{esc(labels["alt"])}">'
            f'<path class="sz-floor" d="M200 {floor}H3800" vector-effect="non-scaling-stroke"/>{person}{work}{marks}</svg>')


def door_href(door, stop):
    return f"{door}#s={stop}" if stop else door


def works_list(works, lines, door, go, arrow, rich, num, lang):
    """Every work's line in the order it hangs, its number first, its title set apart, its own way into the wing."""
    out = []
    for it, line in zip(works.items, lines):
        title, rest = split_line(line, it, num, lang)
        link = (f'<a class="more sz-go" href="{esc(door_href(door, it["stop"]))}" data-door="item"><span>{esc(go)}'
                f'<span class="vh">: {rich(title.rstrip("."))}</span></span>{arrow}</a>') if it["stop"] else ""
        out.append(f'<li id="w{it["n"]}"><span class="sz-k" aria-hidden="true">{it["n"]}</span><div class="sz-e">'
                   f'<p><span class="sz-title">{rich(title)}</span> {rich(rest)}</p>{link}</div></li>')
    return "\n".join(out)


def holder_name(h, lang):
    own = h["lang"][lang]
    attr = "" if own == lang else f' lang="{own}"'
    return f'<span class="nh"{attr}>{esc(h["name"][lang])}</span>'


def table_rows(works, lines, door, go, rich, num, lang):
    rows = []
    for it, line in zip(works.items, lines):
        title = split_line(line, it, num, lang)[0].rstrip(".")
        size = (lambda v: f'{num(v, lang)} ({inches(v)})') if lang == "en" else (lambda v: num(v, lang))
        link = (f'<a href="{esc(door_href(door, it["stop"]))}" data-door="item">{esc(go)}'
                f'<span class="vh">: {rich(title)}</span></a>') if it["stop"] else ""
        rows.append(f'<tr><th scope="row"><span class="sz-k">{it["n"]}</span> {rich(title)}</th>'
                    f'<td>{size(it["h"])}</td><td>{size(it["w"])}</td><td>{holder_name(it["holder"], lang)}</td>'
                    f'<td>{rich(it["holder"]["note"][lang])}</td><td>{link}</td></tr>')
    return "\n".join(rows)


# ---------- the stills ----------

def tokens(css_text):
    """The colour tokens of the site's token file, by name."""
    return dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{3,8})", css_text))


def _text(x, y, words, size, fill, anchor="start", face="Cardo"):
    return (f'<text x="{x:g}" y="{y:g}" font-family="{face}" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}">{esc(words)}</text>')


def _wrap(words, size, width):
    """Lines of a sentence at a face's average letter width: the stills' own measure, a little generous."""
    lines, line = [], ""
    for word in words.split():
        test = f"{line} {word}".strip()
        if len(test) * size * 0.47 > width and line:
            lines.append(line)
            line = word
        else:
            line = test
    return lines + [line] if line else lines


def _rect(x, y, w, h, fill, stroke, width=2):
    """A frame as two filled boxes: ImageMagick's own SVG renderer leaves strokes out."""
    return (f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" fill="{stroke}"/>'
            f'<rect x="{x + width:g}" y="{y + width:g}" width="{max(w - 2 * width, 0):g}" '
            f'height="{max(h - 2 * width, 0):g}" fill="{fill}"/>')


def _floor(x, y, w, colour):
    return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="1.5" fill="{colour}"/>'


def _person(x, floor, height_px, fill):
    k = height_px / 1700
    return f'<path transform="translate({x:g} {floor - height_px:g}) scale({k:g})" d="{PERSON_PATH}" fill="{fill}"/>'


def still_svg(works, mark, words, num, lang, colours, kind):
    """A chart as one picture. kind: "chart" (1600 wide: every work and the field at one scale, a key and the credit)
    or "share" (1200 by 630: the page's question, the marked work's size, the person, the marked work and the field)."""
    c = colours
    ground, ink, soft, quiet = c["page"], c["linen"], c["text-2"], c["text-3"]
    lit, frame, chalk, chalk_text, line = c["wall-lit"], c["frame"], c["chalk"], c["chalk-text"], c["line-strong"]
    field_fill = c["wall"]
    mark_it = works.by_id(mark)
    field = next((it for it in works.items if it.get("field")), None)
    person_w = lambda h: PERSON_W * h / 1700
    parts = []
    if kind == "share":
        W, H, m = 1200, 630, 60
        floor = H - 64
        parts.append(_text(m, 104, words["h1"], 54, ink))
        parts.append(_text(m, 164, size_text(mark_it, num, lang), 36, chalk_text))
        u = (floor - 206) / field["h"] if field else 1.0
        x = m
        ph = works.person_cm * u
        parts.append(_person(x, floor, ph, quiet))
        parts.append(_text(x + person_w(ph) / 2, floor - ph - 14, words["person"], 20, soft, "middle"))
        x += person_w(ph) + 30
        mw, mh = mark_it["w"] * u, mark_it["h"] * u
        parts.append(_rect(x, floor - mh, mw, mh, lit, chalk, 3))
        parts.append(_text(x + mw / 2, floor - mh - 14, words["mark"], 20, ink, "middle"))
        if field:
            fw, fh = field["w"] * u, field["h"] * u
            fx = W - m - fw
            parts.append(_rect(fx, floor - fh, fw, fh, field_fill, frame, 3))
            parts.append(_text(fx + fw / 2, floor + 34, f'{words["field"]}, {size_text(field, num, lang)}', 20, soft, "middle"))
        parts.append(_floor(m, floor, W - 2 * m, line))
        parts.append(_text(m, floor + 34, words["site"], 20, quiet))
    else:
        W, m, gap = 1600, 72, 22
        u = 1.0
        y = m + 52
        parts.append(_text(m, y, words["h1"], 60, ink))
        for row in _wrap(words["caption"], 25, W - 2 * m):
            y += 40
            parts.append(_text(m, y, row, 25, soft))
        y += 46
        # the person and the works on shelves, in the order they hang, at one scale; the field on a shelf of its own
        items = [("person", None)] + [("work", it) for it in works.shapes() if not it.get("field")]
        shelves, shelf, used = [], [], 0
        for kind_, it in items:
            w = person_w(works.person_cm * u) if kind_ == "person" else it["w"] * u
            if shelf and used + w > W - 2 * m:
                shelves.append(shelf)
                shelf, used = [], 0
            shelf.append((kind_, it, w))
            used += w + gap
        shelves.append(shelf)
        if field:
            shelves.append([("work", dict(field, ns=[field["n"]]), field["w"] * u)])
        keys = [(", ".join(str(n) for n in it["ns"]), words["titles"][it["n"]]) for it in works.shapes()]
        for shelf in shelves:
            tall = max((works.person_cm if k == "person" else it["h"]) * u for k, it, _ in shelf)
            floor = y + tall
            x = m
            for k, it, w in shelf:
                if k == "person":
                    parts.append(_person(x, floor, works.person_cm * u, quiet))
                    parts.append(_text(x + w / 2, floor + 30, words["person"], 19, soft, "middle"))
                else:
                    h = it["h"] * u
                    is_mark = it["id"] == mark
                    parts.append(_rect(x, floor - h, w, h, field_fill if it.get("field") else lit, chalk if is_mark else frame,
                                       3 if is_mark else 2))
                    key = ", ".join(str(n) for n in it["ns"])
                    if it.get("field"):
                        key = f'{key} {words["field"]}, {size_text(it, num, lang)}'
                    elif is_mark:
                        key = f'{key} {words["mark"]}'
                    parts.append(_text(x + w / 2, floor + 30, key, 19, ink if is_mark else soft, "middle"))
                x += w + gap
            parts.append(_floor(m, floor, W - 2 * m, line))
            last = (x, y, floor)
            y = floor + 64
        # the key: every number with its title, beside the last shelf where it fits, else under it in two columns
        x0, top, floor = last
        room, rows = W - m - (x0 + 18), floor - top
        step = rows / len(keys)
        size = min(17, step - 2, (room - 48) / (max(len(tt) for _, tt in keys) * 0.45))
        if size >= 14.5:
            for i, (n, title) in enumerate(keys):
                cy = top + size + i * step
                parts.append(_text(x0 + 18, cy, n, f"{size:.1f}", chalk_text if n == str(mark_it["n"]) else quiet))
                parts.append(_text(x0 + 66, cy, title, f"{size:.1f}", soft))
        else:
            half = -(-len(keys) // 2)
            col = (W - 2 * m) / 2
            for i, (n, title) in enumerate(keys):
                cx, cy = m + (i // half) * col, y + (i % half) * 27
                parts.append(_text(cx, cy, n, 18, chalk_text if n == str(mark_it["n"]) else quiet))
                parts.append(_text(cx + 52, cy, title, 18, soft))
            y += half * 27 + 10
        for row in words["credit"]:
            parts.append(_text(m, y, row, 18, quiet))
            y += 27
        H = round(y + m - 40)
    body = "".join(parts)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="{ground}"/>{body}</svg>\n')


def source_mark(svg):
    """The mark a still carries of the drawing it was made from: a still with another mark is older than its chart."""
    return "moa-chart:" + hashlib.sha256(svg.encode("utf-8")).hexdigest()[:24]


def png_info(path):
    """A PNG's size and its text chunks, from its own bytes."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.name} is not a PNG")
    at, texts, size = 8, {}, None
    while at < len(data):
        n = int.from_bytes(data[at:at + 4], "big")
        kind, body = data[at + 4:at + 8], data[at + 8:at + 8 + n]
        if kind == b"IHDR":
            size = (int.from_bytes(body[:4], "big"), int.from_bytes(body[4:8], "big"))
        elif kind == b"tEXt" and b"\0" in body:
            key, _, value = body.partition(b"\0")
            texts[key.decode("latin-1")] = value.decode("latin-1")
        elif kind == b"IEND":
            break
        at += 12 + n
    return size, texts
