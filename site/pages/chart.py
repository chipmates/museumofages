"""The sizes of a wing's works at one scale, drawn in code: a page's chart, its list, its table and the chart's stills.

Every size, holder and stop is read from the wing's facts file and the group of the wing's page that a topic page
names (its registry entry, from), never from the page's words. The page's words name a work by its line, and the
build checks that each line carries its work's size as the facts give it.

A shape on the page is an inline SVG whose width and height are set in em, one em being one metre: a panel sets the
font size of its shapes from its own width (container query units), so every shape of a panel stands at one scale,
whatever the screen. The first panel's rows are set here, each opening with the person, once for each band of chart
widths (BANDS); the page shows the band its chart is in. The stills are one SVG each, at a fixed size, rendered by
make_pictures.py.
Standard library only. This file names no wing and no work.
"""
import hashlib
import html
import re

# One em of a shape is one metre. A panel is this many metres wide, so the person and a wall of 8.8 metres share a row
# (chart.css divides the chart's width by the same number).
PANEL_M = 10
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


def line_parts(line, it, num, lang):
    """A line's title (with its full stop), its medium and the rest from its size on. The medium is one word after
    the title ("Drawing."), where the line names one, else ""."""
    at = line.replace(NBSP, " ").index(size_text(it, num, lang))
    head, rest = line[:at].rstrip(), line[at:]
    m = re.fullmatch(r"(.*\.)\s+(\w+\.)", head)
    return (m.group(1), m.group(2), rest) if m else (head, "", rest)


def split_line(line, it, num, lang):
    """A line's title (with its full stop, without its medium) and the rest from its size on."""
    title, _, rest = line_parts(line, it, num, lang)
    return title, rest


# ---------- the page ----------

def shape_svg(it, cls=""):
    """A work as a frame of its own size: width and height in metres as em, the frame filling it."""
    return (f'<svg class="sz-s{cls}" width="{it["w"] / 100:g}em" height="{it["h"] / 100:g}em" aria-hidden="true">'
            f'<rect width="100%" height="100%"/></svg>')


PERSON_ID = "sz-person"


def person_defs():
    """The person drawn once: every row's person is a use of it."""
    return (f'<svg class="sz-defs" width="0" height="0" aria-hidden="true" focusable="false"><symbol id="{PERSON_ID}" '
            f'viewBox="0 0 {PERSON_W} 1700" preserveAspectRatio="none"><path d="{PERSON_PATH}"/></symbol></svg>')


def person_svg(height_cm):
    k = height_cm / 170
    return (f'<svg class="sz-s sz-s--person" width="{PERSON_W * k / 1000:g}em" height="{height_cm / 100:g}em" '
            f'aria-hidden="true"><use href="#{PERSON_ID}"/></svg>')


# The bands of the chart's width, each with its own rows: (the least width of the band, the width its rows are filled
# to, its least). A label is wider than a small shape, and it does not grow with the chart: a label's width is
# reckoned at chart.css's .sz-n (12 px Marcellus, 5 px on each side), a little generous.
BANDS = ((0, 320), (480, 480), (720, 720))
LABEL_CH, LABEL_PAD, SHAPE_PAD = 7.6, 10, 10


def cell_key(it, mark, labels):
    key = ", ".join(str(n) for n in it["ns"])
    if it["id"] == mark:
        return key, labels["mark"]
    return key, labels["field"] if it.get("field") else ""


def cell(it, mark, labels, rich):
    cls = " sz-s--mark" if it["id"] == mark else " sz-s--field" if it.get("field") else ""
    key, name = cell_key(it, mark, labels)
    name = f' <span class="sz-name">{rich(name)}</span>' if name else ""
    return f'<span class="sz-i">{shape_svg(it, cls)}<span class="sz-n">{key}{name}</span></span>'


def label_px(text):
    return len(text) * LABEL_CH + LABEL_PAD if text else 0


def rows_for(works, mark, labels, num, lang, width):
    """The first panel's rows at a chart this wide: each row opens with the person (named in the first), the works
    follow in the order they hang, the field has a row of its own, and the metre ends the last row it fits in."""
    em = width / PANEL_M
    person_w = PERSON_W * works.person_cm / 170 / 1000 * em + SHAPE_PAD
    span = lambda it: max(it["w"] / 100 * em + SHAPE_PAD, label_px(" ".join(x for x in cell_key(it, mark, labels) if x)))
    rows, row, used = [], [("person", True)], max(person_w, label_px(labels["person"]))
    field = None
    for it in works.shapes():
        if it.get("field"):
            field = it
            continue
        w = span(it)
        if used + w > width and len(row) > 1:
            rows.append((row, used))
            row, used = [("person", False)], person_w
        row.append(("work", it))
        used += w
    rows.append((row, used))
    bar = (("bar", None), max(1 * em + SHAPE_PAD, label_px(f"{num(1, lang)} m")))
    if rows[-1][1] + bar[1] <= width:
        rows[-1][0].append(bar[0])
        bar = None
    if field:
        rows.append(([("person", False), ("work", field)], person_w + span(field)))
    if bar:
        rows.append(([bar[0]], bar[1]))
    return [r for r, _ in rows]


def panel_rows(works, mark, labels, num, lang, rich=esc):
    """The first panel, once per band. Under each shape its numbers, and under the marked one and the field its name."""
    def html(kind, it):
        if kind == "person":
            name = esc(labels["person"]) if it else "&#160;"
            return f'<span class="sz-i">{person_svg(works.person_cm)}<span class="sz-n">{name}</span></span>'
        if kind == "bar":
            return f'<span class="sz-i sz-i--bar"><span class="sz-bar"></span><span class="sz-n">{num(1, lang)} m</span></span>'
        return cell(it, mark, labels, rich)
    out = []
    for i, (_, width) in enumerate(BANDS):
        rows = "".join(f'<div class="sz-row">{"".join(html(k, it) for k, it in row)}</div>'
                       for row in rows_for(works, mark, labels, num, lang, width))
        out.append(f'<div class="sz-rows sz-rows--{"abc"[i]}">{rows}</div>')
    return "".join(out)


def panel(works, mark, labels, num, lang, zoom=True, rich=esc):
    """The second panel: the works under a metre, larger, in the order they hang, and its own metre."""
    cells = [cell(it, mark, labels, rich) for it in works.shapes() if not it.get("field") and it["h"] < ZOOM_UNDER_CM]
    cells.append(f'<span class="sz-i sz-i--bar"><span class="sz-bar"></span><span class="sz-n">{num(1, lang)} m</span></span>')
    return f'<div class="sz-row">{"".join(cells)}</div>'


def key_list(works, titles, mark, rich, heading):
    """The chart's key under its heading: each shape's numbers and the title of its work, as the still has it. It is
    folded shut, and chart.css shows it open where the chart is wide: on a phone the list further down names the
    same works."""
    out = []
    for it in works.shapes():
        key = ", ".join(str(n) for n in it["ns"])
        cls = ' class="sz-key__mark"' if it["id"] == mark else ""
        out.append(f'<li{cls}><span class="sz-key__n">{key}</span>{rich(titles[it["n"]])}</li>')
    return f'<details class="sz-keys"><summary><span class="key">{heading}</span></summary><ul class="sz-key">{"".join(out)}</ul></details>'


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


def check_inside(inside, h_m, w_m):
    """The table and the crown of the door's arch a drawing shows inside its wall: the table within the wall, the
    arch within the table's length, springing at or above the table's hem and cresting below its top (no source
    gives the door below it, so the drawing shows only the part a photograph of the wall shows). Returns the
    problems."""
    problems = []
    t, a = (inside or {}).get("table"), (inside or {}).get("arch")
    if t and not (0 <= t["from_m"] < t["to_m"] <= w_m and 0 <= t["hem_m"] < t["top_m"] <= h_m):
        problems.append("top.drawing.inside.table does not lie inside the wall")
    if a and not t:
        problems.append("top.drawing.inside.arch has no table to cut into")
    elif a and not (t["from_m"] < a["from_m"] < a["to_m"] < t["to_m"] and t["hem_m"] <= a["spring_m"] < a["crown_m"] <= t["top_m"]):
        problems.append("top.drawing.inside.arch does not cut into the table from its hem: it must lie within the table's "
                        "length, spring at or above its hem and crest below its top")
    return problems


def _arc(x0, x1, spring, crown):
    """The crown of a segmental arch, from one spring to the other, as a path's arc command."""
    half, rise = (x1 - x0) / 2, spring - crown
    r = (half * half + rise * rise) / (2 * rise)
    return f"A{r:g} {r:g} 0 0 1 {x1:g} {spring:g}"


def wall_figure(h_cm, w_cm, person_cm, labels, num, lang, inside=None):
    """The first screen's drawing of one wall painting: the person and the wall at one scale, three tenths of a
    millimetre a unit, in one SVG of 4000 by 1520, the wall nearly its height (a phone's first screen is short). The
    person stands on a floor line of its own, which stops before the wall: where the wall's lower edge sits above a
    floor is not drawn. The wall's size stands inside it: a mark beside it would leave the drawing. inside may draw
    the table and the crown of the door's arch in metres from the wall's lower left corner, the arch labelled in
    labels["arch"] (its lines): the hem breaks where the arch cuts it, and nothing of the door below is drawn."""
    s = 0.3
    k = person_cm / 170
    ph, pw, w, h = person_cm * 10 * s, PERSON_W * k * s, w_cm * 10 * s, h_cm * 10 * s
    px, floor = 720, 1450
    wx = px + pw + 260
    m = 1000 * s
    person = f'<g transform="translate({px:g} {floor - ph:g}) scale({k * s:g})"><path class="sz-p" d="{PERSON_PATH}"/></g>'
    ground = f'<path class="sz-floor" d="M{px - 220:g} {floor}H{px + pw + 60:g}" vector-effect="non-scaling-stroke"/>'
    wall = f'<rect class="sz-m" x="{wx:g}" y="{floor - h:g}" width="{w:g}" height="{h:g}" vector-effect="non-scaling-stroke"/>'
    tick = (f'<path class="sz-d" d="M{px - 120:g} {floor}V{floor - ph:g}M{px - 160:g} {floor - ph:g}H{px - 80:g}" vector-effect="non-scaling-stroke"/>'
            f'<text class="sz-t" x="{px - 190:g}" y="{floor - ph + 60:g}" text-anchor="end">{esc(labels["person"])}</text>')
    size_y = floor - h / 2 + 50
    drawn = ""
    if inside:
        t, a = inside["table"], inside["arch"]
        tx0, tx1 = wx + t["from_m"] * m, wx + t["to_m"] * m
        top, hem = floor - t["top_m"] * m, floor - t["hem_m"] * m
        x0, x1 = wx + a["from_m"] * m, wx + a["to_m"] * m
        spring, crown = floor - a["spring_m"] * m, floor - a["crown_m"] * m
        # the cloth, its hem broken where the arch comes up through it
        drawn += (f'<path class="sz-d" d="M{x0:g} {hem:g}H{tx0:g}V{top:g}H{tx1:g}V{hem:g}H{x1:g}" '
                  f'vector-effect="non-scaling-stroke"/>')
        drawn += (f'<path class="sz-a" d="M{x0:g} {hem:g}V{spring:g}{_arc(x0, x1, spring, crown)}V{hem:g}" '
                  f'vector-effect="non-scaling-stroke"/>')
        lines = labels.get("arch") or []
        if lines:
            # the label above the table, its leader down through the cloth to the arch's crown
            cx, step = (x0 + x1) / 2, 170
            last = top - 130
            drawn += "".join(f'<text class="sz-t" x="{cx:g}" y="{last - (len(lines) - 1 - i) * step:g}" text-anchor="middle">{esc(line)}</text>'
                             for i, line in enumerate(lines))
            drawn += f'<path class="sz-d" d="M{cx:g} {last + 50:g}V{crown:g}" vector-effect="non-scaling-stroke"/>'
            size_y = floor - h + 330
    size = (f'<text class="sz-t" x="{wx + w / 2:g}" y="{size_y:g}" text-anchor="middle">'
            f'{esc(size_text({"h": h_cm / 100, "w": w_cm / 100}, num, lang, unit="m"))}</text>')
    return (f'<svg class="sz-top" viewBox="0 0 4000 1520" role="img" aria-label="{esc(labels["alt"])}">'
            f'{ground}{person}{wall}{drawn}{tick}{size}</svg>')


def door_href(door, stop):
    return f"{door}#s={stop}" if stop else door


def works_list(works, lines, door, go, arrow, rich, num, lang):
    """Every work's line in the order it hangs, its number first, its title set apart with its medium beside it,
    its own way into the wing."""
    out = []
    for it, line in zip(works.items, lines):
        title, medium, rest = line_parts(line, it, num, lang)
        medium = f' <span class="sz-medium">{rich(medium)}</span>' if medium else ""
        link = (f'<a class="more sz-go" href="{esc(door_href(door, it["stop"]))}" data-door="item"><span>{esc(go)}'
                f'<span class="vh">: {rich(title.rstrip("."))}</span></span>{arrow}</a>') if it["stop"] else ""
        out.append(f'<li id="w{it["n"]}"><span class="sz-k" aria-hidden="true">{it["n"]}</span><div class="sz-e">'
                   f'<p><span class="sz-title">{rich(title)}{medium}</span> {rich(rest)}</p>{link}</div></li>')
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
        rows.append(f'<tr><th scope="row"><span class="sz-k">{it["n"]}</span>&#160;{rich(title)}</th>'
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


def _wrap(words, size, width, sep=None):
    """Lines of a sentence at a face's average letter width: the stills' own measure, a little generous. sep: the one
    character the words are parted at (any space when not given)."""
    lines, line = [], ""
    for word in words.split(sep):
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
        # the works on shelves, in the order they hang, at one scale, each shelf opening with the person; the field on
        # a shelf of its own, the person in front of it too
        pw = person_w(works.person_cm * u)
        shelves, shelf, used = [], [("person", None, pw)], pw + gap
        for it in works.shapes():
            if it.get("field"):
                continue
            w = it["w"] * u
            if used + w > W - 2 * m and len(shelf) > 1:
                shelves.append(shelf)
                shelf, used = [("person", None, pw)], pw + gap
            shelf.append(("work", it, w))
            used += w + gap
        shelves.append(shelf)
        if field:
            shelves.append([("person", None, pw), ("work", dict(field, ns=[field["n"]]), field["w"] * u)])
        keys = [(", ".join(str(n) for n in it["ns"]), words["titles"][it["n"]]) for it in works.shapes()]
        ends = []
        for s, shelf in enumerate(shelves):
            tall = max((works.person_cm if k == "person" else it["h"]) * u for k, it, _ in shelf)
            floor = y + tall
            x = m
            for k, it, w in shelf:
                if k == "person":
                    parts.append(_person(x, floor, works.person_cm * u, quiet))
                    if s == 0:
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
            ends.append((x, floor))
            y = floor + 64
        # a metre for scale at the end of the second shelf (or the first after it with room), as the page has one
        metre = 100 * u
        at = next(((x, f) for x, f in ends[1:] + ends[:1] if x + 40 + metre <= W - m), None)
        if at:
            x1, f = W - m - metre, at[1]
            parts.append(f'<rect x="{x1:g}" y="{f - 1.5:g}" width="{metre:g}" height="3" fill="{soft}"/>')
            parts.append(f'<rect x="{x1:g}" y="{f - 11:g}" width="2" height="11" fill="{soft}"/>')
            parts.append(f'<rect x="{x1 + metre - 2:g}" y="{f - 11:g}" width="2" height="11" fill="{soft}"/>')
            parts.append(_text(x1 + metre / 2, f + 30, f"{num(1, lang)} m", 19, soft, "middle"))
        # the key under the shelves: every number with its title, in two columns, a line and a third apart
        half = -(-len(keys) // 2)
        col, size, step = (W - 2 * m) / 2, 18, 25
        y += 6
        for i, (n, title) in enumerate(keys):
            cx, cy = m + (i // half) * col, y + (i % half) * step
            parts.append(_text(cx, cy, n, size, chalk_text if n == str(mark_it["n"]) else quiet))
            parts.append(_text(cx + 52, cy, title, size, soft))
        y += half * step + 22
        for row in words["credit"]:
            parts.append(_text(m, y, row, 18, quiet))
            y += 27
        H = round(y + m - 40)
    body = "".join(parts)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="{ground}"/>{body}</svg>\n')


def wall_still_svg(h_cm, w_cm, person_cm, words, num, lang, colours, inside=None):
    """One wall painting as the page's share picture, 1200 by 630: the page's heading, the wall's size, and the person
    on its own floor line just before the wall, the wall at the right edge. inside draws the table and the crown of
    the door's arch as the page's drawing does, the arch labelled in one line (words["arch"]) and the drawing's note
    (words["note"]) under the wall."""
    c = colours
    W, H, m = 1200, 630, 60
    floor = H - 64
    u = (floor - 206) / h_cm
    parts = [_text(m, 104, words["h1"], 54, c["linen"]),
             _text(m, 164, size_text({"h": h_cm / 100, "w": w_cm / 100}, num, lang, unit="m"), 36, c["chalk-text"])]
    ww, wh = w_cm * u, h_cm * u
    wx = W - m - ww
    ph = person_cm * u
    pw = PERSON_W * ph / 1700
    px = wx - 56 - pw
    parts.append(_person(px, floor, ph, c["text-3"]))
    parts.append(_text(px + pw / 2, floor - ph - 14, words["person"], 20, c["text-2"], "middle"))
    parts.append(_floor(px - 24, floor, pw + 48, c["line-strong"]))
    parts.append(_rect(wx, floor - wh, ww, wh, c["wall-lit"], c["chalk"], 3))
    if inside:
        mu = 100 * u
        t, a = inside["table"], inside["arch"]
        tx0, tx1 = wx + t["from_m"] * mu, wx + t["to_m"] * mu
        top, hem = floor - t["top_m"] * mu, floor - t["hem_m"] * mu
        x0, x1 = wx + a["from_m"] * mu, wx + a["to_m"] * mu
        spring, crown = floor - a["spring_m"] * mu, floor - a["crown_m"] * mu
        line, ink = 1.5, c["chalk"]
        # the cloth as filled bars, its hem broken at the arch: ImageMagick leaves strokes out
        parts += [f'<rect x="{tx0:g}" y="{top:g}" width="{tx1 - tx0:g}" height="{line:g}" fill="{ink}"/>',
                  f'<rect x="{tx0:g}" y="{top:g}" width="{line:g}" height="{hem - top + line:g}" fill="{ink}"/>',
                  f'<rect x="{tx1 - line:g}" y="{top:g}" width="{line:g}" height="{hem - top + line:g}" fill="{ink}"/>',
                  f'<rect x="{tx0:g}" y="{hem:g}" width="{x0 - tx0:g}" height="{line:g}" fill="{ink}"/>',
                  f'<rect x="{x1:g}" y="{hem:g}" width="{tx1 - x1:g}" height="{line:g}" fill="{ink}"/>']
        # the crown as a thin filled band: the arch's shape in the mark, the same shape a line lower in the wall's own
        for d, fill in ((0, ink), (2, c["wall-lit"])):
            parts.append(f'<path d="M{x0 + d:g} {hem + line:g}V{spring:g}{_arc(x0 + d, x1 - d, spring, crown + d)}'
                         f'V{hem + line:g}Z" fill="{fill}"/>')
        if words.get("arch"):
            cx = (x0 + x1) / 2
            parts.append(_text(cx, top - 22, words["arch"], 20, c["text-2"], "middle"))
            parts.append(f'<rect x="{cx - 0.75:g}" y="{top - 14:g}" width="1.5" height="{crown - top + 14:g}" fill="{c["text-2"]}"/>')
        if words.get("note"):
            parts.append(_text(W - m, floor + 34, words["note"], 18, c["text-3"], "end"))
    parts.append(_text(m, floor + 34, words["site"], 20, c["text-3"]))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="{c["page"]}"/>{"".join(parts)}</svg>\n')


def _mark(x, y, kind, c):
    """One work of a count: a small upright frame, filled, outlined, half filled, round or broken by its class."""
    ink, ground = c["text-2"], c["page"]
    if kind == "field":
        return _rect(x, y, 56, 30, ink, ink)
    if kind == "workshop":
        return (f'<circle cx="{x + 11:g}" cy="{y + 15:g}" r="11" fill="{ink}"/>'
                f'<circle cx="{x + 11:g}" cy="{y + 15:g}" r="8.5" fill="{ground}"/>')
    if kind == "copy":
        # a broken line: ImageMagick's renderer draws no dashes, so the frame is four short bars a side
        bars = "".join(f'<rect x="{x:g}" y="{y + i * 8:g}" width="2.5" height="5" fill="{c["text-3"]}"/>'
                       f'<rect x="{x + 19.5:g}" y="{y + i * 8:g}" width="2.5" height="5" fill="{c["text-3"]}"/>' for i in range(4))
        return bars + "".join(f'<rect x="{x + i * 8:g}" y="{y:g}" width="5" height="2.5" fill="{c["text-3"]}"/>'
                              f'<rect x="{x + i * 8:g}" y="{y + 27.5:g}" width="5" height="2.5" fill="{c["text-3"]}"/>' for i in range(3))
    out = _rect(x, y, 22, 30, ink if kind == "documented" else ground, ink, 2.5)
    if kind == "qualified":
        out += f'<rect x="{x:g}" y="{y + 15:g}" width="22" height="15" fill="{ink}"/>'
    return out


def tally_still_svg(rows, words, c):
    """The share picture of a page that lists its wing's works by period, 1200 by 630: the page's heading, one row per
    period with a mark for each of its works, and the key of the marks."""
    W, H, m = 1200, 630, 60
    parts = [_text(m, 104, words["h1"], 54, c["linen"])]
    y, step = 138, 50
    for label, kinds in rows:
        parts.append(_rect(m, y, W - 2 * m, 1.5, c["line-strong"], c["line-strong"], 0))
        parts.append(_text(m, y + 33, label, 24, c["text-2"]))
        x = W - m - 40 - sum(66 if k == "field" else 32 for k in kinds)
        for kind in kinds:
            parts.append(_mark(x, y + 10, kind, c))
            x += 66 if kind == "field" else 32
        parts.append(_text(W - m, y + 33, str(len(kinds)), 24, c["text-3"], "end"))
        y += step
    parts.append(_rect(m, y, W - 2 * m, 1.5, c["line-strong"], c["line-strong"], 0))
    x, ky = m, y + 48
    for kind, text in words["key"]:
        text = text[:1].upper() + text[1:]
        width = 56 if kind == "field" else 22
        if x + width + 12 + len(text) * 20 * 0.5 > W - m:
            x, ky = m, ky + 42
        parts.append(_mark(x, ky - 23, kind, c))
        parts.append(_text(x + width + 12, ky, text, 20, c["text-2"]))
        x += width + 12 + len(text) * 20 * 0.5 + 30
    parts.append(_rect(m, H - 62, 48, 2, c["chalk"], c["chalk"], 0))
    parts.append(_text(m, H - 30, words["site"], 20, c["text-3"]))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="{c["page"]}"/>{"".join(parts)}</svg>\n')


def facts_still_svg(rows, words, c):
    """The share picture of a page with a fact box, 1200 by 630: the page's heading, then on the ledger under the
    mark's line the box's name and the rows the box marks for its card, each its term and its words, the site's
    address. The type steps down until the heading and the rows fit above the address."""
    W, H, m, pad, term_w = 1200, 630, 60, 26, 204
    floor = H - 62 - 30
    # Cardo sets these words at about 0.43 of its size a letter, so the stills' measure (0.47) is let run 8 % wider
    for head_size, size in ((54, 28), (50, 27), (46, 26), (42, 24)):
        head = _wrap(words["h1"], head_size, (W - 2 * m) * 1.08)
        value_w = W - 2 * m - 2 * pad - term_w
        lines = [_wrap(text, size, value_w * 1.08) for _, text in rows]
        step = round(size * 1.3)
        top = 104 + round(head_size * 1.16) * (len(head) - 1) + 40
        bottom = top + 52 + sum(22 + step * len(x) for x in lines) + 8
        if bottom <= floor:
            break
    parts = [_text(m, 104 + round(head_size * 1.16) * i, row, head_size, c["linen"]) for i, row in enumerate(head)]
    parts.append(_rect(m, top, W - 2 * m, bottom - top, c["wall"], c["wall"], 0))
    parts.append(_rect(m, top, W - 2 * m, 2, c["chalk"], c["chalk"], 0))
    parts.append(_text(m + pad, top + 40, words["h"].upper(), 17, c["text-2"], face="Marcellus"))
    y = top + 52
    for (term, _), wrapped in zip(rows, lines):
        parts.append(_rect(m + pad, y, W - 2 * m - 2 * pad, 1.5, c["line-row-wall"], c["line-row-wall"], 0))
        base = y + 12 + step - round(size * 0.3)
        parts.append(_text(m + pad, base, term, 21, c["text-2"], face="Marcellus"))
        for i, row in enumerate(wrapped):
            parts.append(_text(m + pad + term_w, base + step * i, row, size, c["linen"]))
        y += 22 + step * len(wrapped)
    parts.append(_rect(m, H - 62, 48, 2, c["chalk"], c["chalk"], 0))
    parts.append(_text(m, H - 30, words["site"], 20, c["text-3"]))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="{c["page"]}"/>{"".join(parts)}</svg>\n')


# Where a share picture's drawing names a picture of the pages' own folder: the tool that renders the drawing writes
# the folder in (make_pictures.py), so the drawing, and the mark made from it, are the same on every machine.
PICS_MARK = "@pics@"


def picture_still_svg(words, colours, picture, size, person, beside=False):
    """A page's share picture of one picture at one scale, 1200 by 630: the page's heading and its one line, the
    picture whole on the stone sheet it was made on, framed, the person's height over the person (person: the place of
    the person's centre and the top of its head as shares of the picture), the site's address. beside: the heading
    and the line stand in a column at the left and the picture at the right, for a picture that would leave much
    of the card empty under the words."""
    c = colours
    W, H, m = 1200, 630, 60
    if beside:
        return _picture_beside_svg(words, c, picture, size, person, W, H, m)
    parts = [_text(m, 104, words["h1"], 54, c["linen"])]
    if words.get("line"):
        parts.append(_text(m, 164, words["line"], 36, c["chalk-text"]))
    iw = W - 2 * m
    ih = iw * size[1] / size[0]
    iy = 214 if words.get("line") else 170
    # a picture too tall for the card's width stands whole and narrower, above the address
    if ih > H - 84 - iy:
        ih = H - 84 - iy
        iw = ih * size[0] / size[1]
    parts.append(_rect(m - 3, iy - 3, iw + 6, ih + 6, c["stone"], c["frame"], 3))
    parts.append(f'<image x="{m:g}" y="{iy:g}" width="{iw:g}" height="{ih:g}" xlink:href="{PICS_MARK}/{esc(picture)}"/>')
    if person:
        px, top = person
        parts.append(_text(m + iw * px, iy + ih * top - 12, words["person"], 20, c["stone-text-2"], "middle"))
    parts.append(_rect(m, H - 62, 48, 2, c["chalk"], c["chalk"], 0))
    parts.append(_text(m, H - 30, words["site"], 20, c["text-3"]))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="{c["page"]}"/>{"".join(parts)}</svg>\n')


def _keep(s):
    """A number keeps its unit on its line, a range its two ends (to, bis, and a in Spanish and Portuguese), a short
    name its two parts (T. rex) and a German article its noun: the words are then wrapped at their plain spaces only."""
    return re.sub(r"(\d) (?=(?:m|ft|cm|kg|t|tonnes|Tonnen|toneladas?)\b)|(\d) (to|bis|a) (?=\d)|\b([A-Z]\.) (?=[a-z])"
                  r"|\b(der|die|das|ein|eine) (?=\w)",
                  lambda m: (m.group(1) or "") + (f"{m.group(2)}\u00a0{m.group(3)}" if m.group(2) else "")
                  + (m.group(4) or m.group(5) or "") + "\u00a0", s)


def _beside_words(words, c, column, iy, m, H):
    """The heading and its line in a column at the left of a share picture, from level with the picture's top (iy)."""
    # Cardo's letters run wider than the stills' average measure at these sizes: the column is measured short
    rows = lambda s, size: [r.replace("\u00a0", " ") for r in _wrap(_keep(s).replace(" ", "\n"), size, column * 0.87, "\n")]
    head, line = rows(words["h1"], 50), rows(words["line"], 34) if words.get("line") else []
    # the words start level with the picture's top unless their last row would then reach the address's rule
    last = 58 * (len(head) - 1) + (14 + 44 * len(line) if line else 0)
    parts, y = [], max(m + 44, min(iy + 44, H - 62 - 36 - last))
    for row in head:
        parts.append(_text(m, y, row, 50, c["linen"]))
        y += 58
    y += 14
    for row in line:
        parts.append(_text(m, y, row, 34, c["chalk-text"]))
        y += 44
    return parts


def _picture_beside_svg(words, c, picture, size, person, W, H, m):
    gap, most = 50, 600
    iw = most
    ih = iw * size[1] / size[0]
    if ih > H - 2 * m:
        ih = H - 2 * m
        iw = ih * size[0] / size[1]
    ix, iy = W - m - iw, (H - ih) / 2
    keep = _keep
    parts = _beside_words(words, c, ix - gap - m, iy, m, H)
    parts.append(_rect(ix - 3, iy - 3, iw + 6, ih + 6, c["stone"], c["frame"], 3))
    parts.append(f'<image x="{ix:g}" y="{iy:g}" width="{iw:g}" height="{ih:g}" xlink:href="{PICS_MARK}/{esc(picture)}"/>')
    if person:
        px, top = person
        parts.append(_text(ix + iw * px, iy + ih * top - 12, words["person"], 20, c["stone-text-2"], "middle"))
    # a second line, quieter, under the picture: what the picture shows of ours where the answer speaks of others
    if words.get("second"):
        for i, row in enumerate(r.replace("\u00a0", " ") for r in _wrap(keep(words["second"]).replace(" ", "\n"), 28, iw * 0.87, "\n")):
            parts.append(_text(ix, iy + ih + 44 + 36 * i, row, 28, c["text-2"]))
    parts.append(_rect(m, H - 62, 48, 2, c["chalk"], c["chalk"], 0))
    parts.append(_text(m, H - 30, words["site"], 20, c["text-3"]))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="{c["page"]}"/>{"".join(parts)}</svg>\n')


def painting_share_svg(words, colours, picture, work, person_cm):
    """A sizes page's share picture of its marked work as the work itself, 1200 by 630: the page's heading and the
    work's size in a column at the left, and at the right, on the stone sheet, the reproduction of the work and the
    person standing on one floor line at one scale, the person's height over the person, the site's address.
    picture: a plate of the pages' folder cut to the painted surface (the build checks its shape); work: its h and w
    in centimetres."""
    c = colours
    W, H, m = 1200, 630, 60
    # the sheet fills the card's height; the person fills the sheet's, under its label and over the floor's margin
    ih, top, foot = H - 2 * m, 40, 30
    u = (ih - top - foot) / person_cm
    ww, wh = work["w"] * u, work["h"] * u
    pw, ph = PERSON_W * person_cm / 1700 * u, person_cm * u
    side, gap = 28 * u, 26 * u
    iw = side + ww + gap + pw + side
    ix, iy = W - m - iw, m
    floor = iy + ih - foot
    parts = _beside_words(words, c, ix - 50 - m, iy, m, H)
    parts.append(_rect(ix - 3, iy - 3, iw + 6, ih + 6, c["stone"], c["frame"], 3))
    parts.append(_floor(ix + side / 2, floor, iw - side, c["stone-line-strong"]))
    wx = ix + side
    # the panel's edge as a hair of the frame's colour round it: the picture keeps its true size inside
    parts.append(_rect(wx - 1.5, floor - wh - 1.5, ww + 3, wh + 3, c["frame"], c["frame"], 0))
    parts.append(f'<image x="{wx:g}" y="{floor - wh:g}" width="{ww:g}" height="{wh:g}" preserveAspectRatio="none" '
                 f'xlink:href="{PICS_MARK}/{esc(picture)}"/>')
    px = wx + ww + gap
    parts.append(_person(px, floor, ph, c["line-strong"]))
    parts.append(_text(px + pw / 2, floor - ph - 12, words["person"], 20, c["stone-text-2"], "middle"))
    parts.append(_rect(m, H - 62, 48, 2, c["chalk"], c["chalk"], 0))
    parts.append(_text(m, H - 30, words["site"], 20, c["text-3"]))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="{c["page"]}"/>{"".join(parts)}</svg>\n')


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
