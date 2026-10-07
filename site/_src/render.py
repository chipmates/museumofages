"""The pages' parts as HTML: the first screen with its place for a showpiece, the wall of wings, a wing's rooms,
the example stop, the four grades, what a wing holds (its picture index), the numbers, the menu. Nothing here names
a wing or assumes one: every word comes from the registry, a wing's data file, its facts file or the word files.
Standard library only."""
import re

from buildlib import ARROW, LAYERS_SCRIPT, NBSP, bind, esc, number, sign_whole

# The sizes of the plates on the wall after the largest, in the order they hang: never a row of equal boxes.
HANG = "msmssmssms"
# From this width a wing's holders stand in two columns: the longest name must fit one line of a column there
# (build.py checks the names against HOLDER_NAME_MAX). The style sheet's breakpoint agrees.
HOLDERS_TWO, HOLDER_NAME_MAX = 1040, 58


def webp_size(path):
    """Pixel size from the file's own header."""
    b = path.read_bytes()[:32]
    if b[:4] != b"RIFF" or b[8:12] != b"WEBP":
        raise SystemExit(f"{path} is not a WebP file")
    kind = b[12:16]
    if kind == b"VP8 ":
        return int.from_bytes(b[26:28], "little") & 0x3FFF, int.from_bytes(b[28:30], "little") & 0x3FFF
    if kind == b"VP8L":
        n = int.from_bytes(b[21:25], "little")
        return (n & 0x3FFF) + 1, ((n >> 14) & 0x3FFF) + 1
    return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1


class Pics:
    """The picture store: sizes are read from the files, and every file a page names is remembered.
    The first folder is the site's own. A test build may add a folder of stand-in pictures after it."""

    def __init__(self, folders):
        self.folders, self.seen, self.used = list(folders), {}, set()

    def find(self, name):
        for folder in self.folders:
            if (folder / name).exists():
                return folder / name
        return None

    def size(self, stem, width):
        key = (stem, width)
        if key not in self.seen:
            path = self.find(f"{stem}-{width}.webp")
            if not path:
                raise SystemExit(f"the picture {stem}-{width}.webp is missing")
            self.seen[key] = webp_size(path)
        return self.seen[key]

    def ratio(self, pic):
        w, h = self.size(pic["stem"], max(pic["widths"]))
        return w / h


def picture(c, sets, alt, cls="", how="lazy"):
    """sets: (media or None, {"stem", "widths"}, sizes), the default last."""
    parts = ["<picture>"]
    for media, pic, sizes in sets:
        big = c.pics.size(pic["stem"], max(pic["widths"]))
        for ext in ("avif", "webp"):
            srcset = ", ".join(f'{c.static}img/{pic["stem"]}-{n}.{ext} {n}w' for n in sorted(pic["widths"]))
            c.pics.used.update(f'img/{pic["stem"]}-{n}.{ext}' for n in pic["widths"])
            m = f' media="{media}"' if media else ""
            parts.append(f'<source type="image/{ext}"{m} srcset="{srcset}" sizes="{sizes}" width="{big[0]}" height="{big[1]}">')
    _, pic, _ = sets[-1]
    big = c.pics.size(pic["stem"], max(pic["widths"]))
    # the first screen's picture asks for the line first, the others wait for the reader's scroll. A piece's
    # further pictures lie in a template and load when the piece takes them out.
    load = {"hero": 'fetchpriority="high"', "lazy": 'loading="lazy" decoding="async"', "late": 'decoding="async"'}[how]
    k = f' class="{cls}"' if cls else ""
    parts.append(f'<img{k} src="{c.static}img/{pic["stem"]}-{max(pic["widths"])}.webp" width="{big[0]}" height="{big[1]}" alt="{alt}" {load}>')
    return "".join(parts) + "</picture>"


def hero_sets(hero, sizes="(min-width: 960px) 62vw, 100vw"):
    sets = [("(max-width: 599px)", hero["phone"], "100vw")] if "phone" in hero else []
    return sets + [(None, hero, sizes)]


def preload(c, sets):
    out = []
    for media, pic, sizes in sets:
        if media is None and len(sets) > 1:
            media = "(min-width: 600px)"
        srcset = ", ".join(f'{c.static}img/{pic["stem"]}-{n}.avif {n}w' for n in sorted(pic["widths"]))
        m = f' media="{media}"' if media else ""
        out.append(f'<link rel="preload" as="image" type="image/avif"{m} imagesrcset="{srcset}" imagesizes="{sizes}" fetchpriority="high">\n')
    return "".join(out)


def label(title, kind=None, what=None, src=None, quote=None, cls="", extra="", src_slot=False):
    """src_slot: the credit line's element stands even when empty, for a piece that fills it slide by slide."""
    out = [f'<figcaption class="label{" " + cls if cls else ""}">', f'<span class="label__title">{title}</span>']
    if kind or what:
        tag = f'<span class="tag">{kind}</span><span class="vh">:</span> ' if kind else ""
        out.append(f'<span class="label__what">{tag}{what or ""}</span>')
    if src or src_slot:
        out.append(f'<span class="label__src{" label__src--slide" if src_slot else ""}">{src or ""}</span>')
    if quote:
        out.append(f'<blockquote class="label__quote"><p>{quote["text"]}</p><footer>{quote["from"]}</footer></blockquote>')
    return "".join(out) + extra + "</figcaption>"


def door(c, href, words, small=False, watch=False):
    k = "door door--small" if small else "door"
    return f'<a class="{k}" href="{href}"><span>{words}</span>{ARROW}</a>'


# ---------- the place of a showpiece: on the first screen, or lower on a page ----------

def place_hooks(c, p):
    """What a place carries for its piece: the piece's name and script, each beat's caption, the four grades in the
    box, the pause control, and the piece's further pictures in a template, which loads nothing by itself."""
    w = c.w
    beats = "".join(f' data-beat-{i + 1}="{b}"' for i, b in enumerate(p.get("beats", [])))
    # a credit that belongs to one slide stands with that slide only (frames.N.src)
    beats += "".join(f' data-src-{i + 1}="{f["src"]}"' for i, f in enumerate(p.get("frames", [])) if f.get("src"))
    piece = p.get("install")
    hook = f' data-piece="{piece["name"]}" data-script="{piece["script"]}"' if piece else ""
    if piece and piece.get("keep_kind"):
        hook += " data-keep-kind"
    if piece and piece.get("clip"):
        hook += f' data-clip="{c.static}media/{piece["clip"]}"'
    for name in (piece or {}).get("loads", []):
        c.pics.used.update(f"img/{name}.{ext}" for ext in ("avif", "webp"))
    grades = "".join(f"<li>{grade_word(c, g)}</li>" for g in GRADES)
    inside = f'<ul class="grades" data-grades hidden>{grades}</ul>'
    if p.get("frames"):
        inside += "<template data-frames>" + "".join(
            picture(c, hero_sets(f["pic"]), f["alt"], cls=f"frame__img frame__img--{i + 1}", how="late")
            for i, f in enumerate(p["frames"])) + "</template>"
    control = (f'<p class="place__controls"><button class="plate-btn" type="button" data-place-toggle data-stop="{piece["pause"]}" '
               f'data-go="{piece["play"]}" hidden>{piece["pause"]}</button></p>') if piece else ""
    return hook + beats, inside, control


# The museum's film on the landing's place, whichever wing hangs there: one film, started by the visitor, with its
# music. Its words are the site's (film.*), its list of wings is written by the build beside its script.
FILM = {"name": "sky-ages", "script": "sky-ages.js", "data": "sky-ages-data.js", "music": "music.mp3", "music_script": "film-music.js"}
MUSIC_BY = ("Scott Buckley", "https://www.scottbuckley.com.au")
# the licence's page in the page's language: its address and the language's deed (languages.json)
MUSIC_LICENCE = ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/")


def film_hooks(c):
    """The film's hooks, its control (the visitor's press starts the whole film) and its music's credit line, which
    stays in sight while the film runs."""
    w, a = c.w, c.a
    hook = (f' data-piece="{FILM["name"]}" data-script="{FILM["script"]}" data-press data-film-title="{a["film.title"]}"'
            f' data-music="{c.static}media/{FILM["music"]}" data-sound-on="{a["film.sound_on"]}" data-sound-off="{a["film.sound_off"]}"')
    grades = "".join(f"<li>{grade_word(c, g)}</li>" for g in GRADES)
    inside = f'<ul class="grades" data-grades hidden>{grades}</ul>'
    control = (f'<p class="place__controls"><button class="plate-btn" type="button" data-place-toggle data-stop="{a["film.pause"]}" '
               f'data-go="{a["film.play"]}" data-go-more="{a["film.watch"]}" hidden>{w["film.pause"]}</button></p>')
    credit = (w["film.music"].replace("{artist}", f'<a href="{MUSIC_BY[1]}" rel="noopener">{MUSIC_BY[0]}</a>')
              .replace("{licence}", f'<a href="{MUSIC_LICENCE[1]}{c.deed}" rel="noopener">{MUSIC_LICENCE[0]}</a>'))
    return hook, inside, control, f'<span class="label__music">{credit}</span>'


def slide_credits(p):
    return bool(p.get("install")) and any(f.get("src") for f in p.get("frames", []))


def place(c, slug, where, how="hero"):
    """The first screen's place: a box of fixed shape with its finished still and its label. With no piece
    installed it is a complete picture. A piece starts from this still after the page has loaded. On the landing
    the place holds the museum's film, which starts from the still on the visitor's press."""
    reg, d = c.wings[slug], c.wd[slug]
    # A wing may hang another picture on the landing than on its own page: then each place has its own still,
    # label, caption lines and piece (pictures.landing in the registry with landing.piece in the data).
    own = where == "landing" and "landing" in reg["pictures"]
    p = d["landing"]["piece"] if own else d["first"]["piece"]
    sets = hero_sets(reg["pictures"]["landing" if own else "hero"])
    if where == "landing":
        hooks, inside, control, music = film_hooks(c)
        slot = False
    else:
        (hooks, inside, control), music, slot = place_hooks(c, p), "", slide_credits(p)
    return (
        f'<figure class="hero__plate plate" data-place="{where}" data-wing="{slug}"{hooks}>'
        f'<div class="hang">{picture(c, sets, p["alt"], cls="hero__img", how=how)}{inside}</div>{control}'
        + label(p["title"], p["kind"], p["what"], src=p.get("src"), cls="hero__label", extra=music, src_slot=slot)
        + "</figure>"
    ), sets


def showpiece(c, slug, p, where):
    """A place lower on a page, under the same contract: its still, its label, its control. Its piece starts
    when the reader comes near it."""
    hooks, inside, control = place_hooks(c, p)
    sets = hero_sets(p["pic"], "(min-width: 960px) 62vw, 100vw")
    return (
        f'<figure class="showpiece plate" data-place="{where}" data-wing="{slug}"{hooks}>'
        f'<div class="hang">{picture(c, sets, p["alt"], cls="showpiece__img")}{inside}</div>'
        + label(p["title"], p["kind"], p["what"], src=p.get("src"), src_slot=slide_credits(p)) + control + "</figure>"
    )


def frame_rules(d):
    """Where each of a piece's further pictures keeps its subject when the box cuts it."""
    out = []
    for i, f in enumerate(d.get("first", {}).get("piece", {}).get("frames", [])):
        focus = f.get("focus", {})
        if focus.get("phone"):
            out.append(f".frame__img--{i + 1}{{object-position:{focus['phone']}}}")
        if focus.get("wide"):
            out.append(f"@media (min-width:600px){{.frame__img--{i + 1}{{object-position:{focus['wide']}}}}}")
    return "".join(out)


def first(c, kind, slug):
    """The first screen. In the page's order: the lettering on the wall, what hangs there, the words beside it."""
    w, reg, d = c.w, c.wings[slug], c.wd[slug]
    plate, sets = place(c, slug, "landing" if kind == "home" else "wing")
    note = f'<p class="hero__note">{w["hero.entry_note"]} <a href="{c.to(c.addr("what"))}">{w["hero.what_link"]}</a></p>'
    go = f'<div class="hero__go" data-door-watch>{door(c, esc(reg["door"][c.lang]), w["hero.enter"])}{note}</div>'
    if kind == "home":
        head = (
            f'<h1 class="hero__title" id="hero-title"><span class="hero__name">{w["hero.name"]}</span></h1>'
            f'<p class="hero__kicker">{w["brand.descriptor"]}</p>'
        )
        text = (
            f'<p class="hero__tagline"><span>{w["hero.tagline_1"]}</span> <span>{w["hero.tagline_2"]}</span></p>'
            f'<p class="hero__today">{c.today}</p>'
        )
        glance = (
            '<div class="glance"><h2 class="vh">' + w["glance.heading"] + '</h2><dl class="glance__facts">'
            + "".join(f'<div><dt>{w[f"glance.f{i}_term"]}</dt><dd>{w[f"glance.f{i}_text"]}</dd></div>' for i in range(1, 5))
            + f'</dl><p class="glance__by"><span>{w["glance.publisher"]}</span> <span class="trust">{w["glance.trust"]}</span></p></div>'
        )
    else:
        coll = c.collection(reg["collection"])
        head = (
            f'<nav class="hero__crumb" aria-label="{w["a11y.crumb"]}"><a href="{c.to(c.addr("home"))}">{w["hero.name"]}</a> '
            f'<span><a href="{c.to(c.addr("home"))}#wings">{w["nav.wings"]}</a></span></nav>'
            f'<h1 class="hero__title" id="hero-title"><span class="hero__name hero__name--wing">{esc(reg["name"][c.lang])}</span></h1>'
        )
        text = (
            f'<dl class="hero__facts"><div><dt>{esc(coll["dates_key"][c.lang])}</dt><dd>{esc(reg["dates"][c.lang])}</dd></div>'
            f'<div><dt>{w["wingpage.k_shows"]}</dt><dd>{esc(reg["shows"]["place"][c.lang])}, {esc(reg["shows"]["day"][c.lang])}</dd></div></dl>'
            f'<p class="hero__lede">{d["first"]["lede"]}</p>'
        )
        glance = ""
    html = (
        f'<section class="hero hero--{kind} wing--{slug}" aria-labelledby="hero-title">\n'
        f'  <div class="hero__first">\n  <div class="hero__head">{head}</div>\n  {plate}\n'
        f'  <div class="hero__text">{text}{go}</div>\n  </div>\n  {glance}\n</section>'
    )
    return html, sets


# ---------- the wall of wings ----------

def card(c, slug, size, level):
    w, reg, d = c.w, c.wings[slug], c.wd[slug]
    lang, pic = c.lang, reg["pictures"]["card"]
    page = c.to(reg["page"][lang].strip("/") + "/")
    sizes = {"feature": "(min-width: 960px) 62vw, 100vw", "m": "(min-width: 960px) 24vw, 56vw", "s": "(min-width: 960px) 16vw, 40vw"}[size]
    use = pic if size == "feature" else dict(pic, widths=sorted(pic["widths"])[:2])
    name = f'<h{level} class="wcard__name"><a href="{page}">{esc(reg["name"][lang])}</a></h{level}>'
    lines = f'<span class="wcard__dates">{esc(reg["dates"][lang])}</span>'
    if size == "feature":
        lines += (
            f'<span class="wcard__shows"><span class="key">{w["wingpage.k_shows"]}</span> '
            f'{esc(reg["shows"]["place"][lang])}, {esc(reg["shows"]["day"][lang])}</span>'
            f'<span class="label__what"><span class="tag">{d["card"]["kind"]}</span><span class="vh">:</span> {d["card"]["what"]}</span>'
            + (f'<span class="label__src">{d["card"]["src"]}</span>' if d["card"].get("src") else "")
            + f'<span class="wcard__go">{door(c, esc(reg["door"][lang]), w["nav.enter"], small=True)} '
            f'<a class="more" href="{page}"><span>{w["wings.to_page"]}</span>{ARROW}</a></span>'
        )
    return (
        f'<article class="wcard wcard--{size} wing--{slug}" data-lit><figure class="plate wcard__plate">'
        f'<div class="hang">{picture(c, [(None, use, sizes)], c.at(d, pic["alt"]))}</div>'
        f'<figcaption class="label wcard__label">{name}{lines}</figcaption></figure></article>'
    )


def wall(c):
    w, lang = c.w, c.lang
    many = len(c.collections) > 1
    level = 4 if many else 3
    groups = []
    for coll in c.collections:
        mine = [s for s, e in c.wings.items() if e["collection"] == coll["slug"]]
        opened = [s for s in mine if c.wings[s]["state"] == "open"]
        if not mine:
            continue
        newest = opened[::-1]
        cards = "".join(card(c, s, "feature" if i == 0 else HANG[(i - 1) % len(HANG)], level) for i, s in enumerate(newest))
        rest = ""
        for state, key in (("making", "wings.making_h"), ("planned", "wings.planned_h")):
            names = [s for s in mine if c.wings[s]["state"] == state]
            if names:
                items = "".join(
                    f'<li><span class="wlist__name">{esc(c.wings[s]["name"][lang])}</span>'
                    + (f' <span class="wlist__dates">{esc(c.wings[s]["dates"][lang])}</span>' if c.wings[s].get("dates") else "")
                    + "</li>" for s in names)
                rest += f'<div class="wlist"><p class="key">{w[key]}</p><ul>{items}</ul></div>'
        head = (f'<h3 class="wgroup__name">{esc(coll["name"][lang])}</h3><p class="wgroup__line">{esc(coll["line"][lang])}</p>'
                if many else "")
        hang = f'<div class="wall" data-wall>{cards}</div>' if cards else ""
        rest = f'<div class="wlists">{rest}</div>' if rest else ""
        groups.append(f'<div class="wgroup" id="c-{coll["slug"]}">{head}{hang}{rest}</div>')
    # what a wing is, in one sentence. No number of wings stands here, whatever the registry holds. While one wing
    # is open, a second line says so and that more are being made.
    now = f'<p class="wings__now">{w["wings.now"]}</p>' if len(c.open) == 1 else ""
    return (
        '<section class="wings band" id="wings" aria-labelledby="wings-h">\n  <div class="wrap">\n'
        f'    <div class="head"><h2 id="wings-h">{w["wings.heading"]}</h2><p class="lead">{w["wings.lead"]}</p>{now}</div>\n    '
        + "\n    ".join(groups) + "\n  </div>\n</section>"
    )


# ---------- a wing's rooms, and every other part that is plates beside text ----------

def plated(d):
    """Every part of a wing's data that hangs plates: its rooms, and the groups of its index that are text."""
    return list(d.get("rooms", [])) + [g for g in d.get("holds", {}).get("groups", []) if g.get("form") == "text"]


def crop_class(room_id, i, plate):
    return f" crop-{room_id}-{i}" if plate.get("crop") else ""


def crop_rules(d):
    """A plate's own cut, as a rule: the policy allows no style attribute."""
    out = []
    for room in plated(d):
        for i, plate in enumerate(room.get("plates", [])):
            for where, value in plate.get("crop", {}).items():
                ratio, x, y = value.split()
                rule = f".crop-{room['id']}-{i} img{{aspect-ratio:{ratio};object-fit:cover;object-position:{x} {y}}}"
                out.append(rule if where == "phone" else f"@media (min-width:960px){{{rule}}}")
    return "".join(out)


def plate_src(c, p):
    """A plate's credit line. Where the plate names a place on the page for more (src_to), a link to it follows."""
    src = p.get("src")
    if src and p.get("src_to"):
        src += f' <a href="#{p["src_to"]}">{c.w["wingpage.more_originals"]}</a>'
    return src


def hung(c, head, side, level=3, more=""):
    """One group of the index: its heading, then its plates and its text, hung by how many plates it has and by
    their shapes. The heading is the first thing on every screen, so no picture stands above the heading it
    belongs to. more: a block of its own that follows the text (lists, rows, a link). Returns the HTML and the
    side count."""
    plates = head.get("plates", [])
    n = len(plates)
    if n == 0:
        layout, kinds, sizes = "text", [], []
    elif n == 1 and head.get("hang") == "wide":
        layout, kinds, sizes = "wide", ["wide"], ["100vw"]
    elif n == 1:
        layout, kinds, sizes = ("side-a", "side-b")[side % 2], ["only"], ["(min-width: 960px) 40vw, 100vw"]
        side += 1
    elif n == 2 and head.get("hang") == "wide":
        # one plate across the wall, a second, smaller one under it beside the text
        layout, kinds, sizes = "lead", ["wide", "second"], ["100vw", "(min-width: 960px) 40vw, 100vw"]
    elif n == 2:
        tall_first = c.pics.ratio(plates[0]["pic"]) < c.pics.ratio(plates[1]["pic"])
        layout = "pair place--tall-first" if tall_first else "pair place--wide-first"
        kinds = ["tall", "wide"] if tall_first else ["wide", "tall"]
        sizes = ["(min-width: 960px) 32vw, 100vw" if k == "tall" else "(min-width: 960px) 66vw, 100vw" for k in kinds]
    else:
        layout, kinds, sizes = "row", ["cell"] * n, ["(min-width: 960px) 32vw, 100vw"] * n
    lamp = " place--lamp-low" if head.get("lamp") == "low" else ""
    figs = "".join(
        f'<figure class="plate place__p place__p--{kinds[i]}{crop_class(head["id"], i, p)}" data-lit>'
        f'<div class="hang">{picture(c, hero_sets(p["pic"], sizes[i]), p["alt"])}</div>'
        + label(p["title"], p["kind"], p["what"], src=plate_src(c, p), quote=p.get("quote")) + "</figure>"
        for i, p in enumerate(plates))
    title = f'<h{level} class="place__h" id="{head["id"]}-h">{head["h"]}</h{level}>'
    text = "".join(f"<p>{x}</p>" for x in head["p"]) + (f'<p class="terms">{head["terms"]}</p>' if head.get("terms") else "")
    return (
        f'<article class="place place--{layout}{lamp}" id="{head["id"]}" aria-labelledby="{head["id"]}-h">'
        f'{title}{figs}<div class="place__text">{text}</div>{more}</article>'
    ), side


def room_hangs(rooms):
    """How each room hangs on a wide screen. A room with one plate is a card, and cards hang three to a row. Where
    a run of cards does not divide by three, its first hang larger: one with its words beside it ("full"), or two
    across the wall ("half"). A room whose one plate is marked wide takes the wall's full width ("wide"), in its
    place in the walk. A room with several plates or none takes a row of its own ("row"). The second value says
    which card of a run stands alone where two hang to a row: the last of an odd run of small cards."""
    out, lone, run = [], set(), 0

    def close():
        nonlocal run
        r = run % 3
        out.extend(["full"] * (r == 1) + ["half"] * (2 * (r == 2)) + ["third"] * (run - r))
        if (run - r) % 2:
            lone.add(len(out) - 1)
        run = 0

    for room in rooms:
        n = len(room.get("plates", []))
        if n == 1 and room.get("hang") != "wide":
            run += 1
        else:
            close()
            out.append("wide" if n == 1 else "row")
    close()
    return out, lone


def rooms(c, slug):
    """A wing's rooms in the order of the walk, each a small hang: its name, its plate with the label, and one or
    two sentences. What a room holds stands lower on the page, in the index."""
    all_rooms = c.wd[slug]["rooms"]
    hangs, lone = room_hangs(all_rooms)
    cards = []
    for n, (room, hang) in enumerate(zip(all_rooms, hangs)):
        sizes = {"third": "(min-width: 960px) 32vw, (min-width: 600px) 46vw, 100vw", "half": "(min-width: 960px) 48vw, (min-width: 600px) 46vw, 100vw",
                 "full": "(min-width: 960px) 64vw, 100vw", "wide": "100vw", "row": "(min-width: 600px) 46vw, 100vw"}[hang]
        if n in lone:
            sizes = "(min-width: 960px) 32vw, 100vw"
        figs = "".join(
            f'<figure class="plate room__p{crop_class(room["id"], i, p)}" data-lit><div class="hang">'
            + picture(c, hero_sets(p["pic"], sizes), p["alt"]) + "</div>"
            + label(p["title"], p["kind"], p["what"], src=plate_src(c, p), quote=p.get("quote")) + "</figure>"
            for i, p in enumerate(room.get("plates", [])))
        if hang == "row" and figs:
            figs = f'<div class="room__plates">{figs}</div>'
        lamp = " room--lamp-low" if room.get("lamp") == "low" else ""
        alone = " room--lone" if n in lone else ""
        # the name is one row, the plate with its words the next: a room's words follow its own caption, however
        # long the caption beside it is
        cards.append(
            f'<article class="room room--{hang}{alone}{lamp}" id="{room["id"]}" aria-labelledby="{room["id"]}-h"><h3 id="{room["id"]}-h">{room["h"]}</h3>'
            f'<div class="room__body">{figs}<div class="room__text">' + "".join(f"<p>{x}</p>" for x in room["p"]) + "</div></div></article>")
    return '<div class="rooms">' + "".join(cards) + "</div>"


def directory(rows):
    """A list of ways down the page: (id, name, note)."""
    items = "".join(f'<div><dt><a href="#{i}">{h}</a></dt><dd>{note}</dd></div>' for i, h, note in rows)
    return f'<div class="directory"><dl>{items}</dl></div>'


def room_directory(c, slug):
    d = c.wd[slug]
    rows = [(r["id"], r["h"], r.get("note", "")) for r in d["rooms"]]
    if d.get("end"):
        rows.append((d["end"]["id"], d["end"].get("dir", d["end"]["h"]), d["end"].get("note", "")))
    return directory(rows)


# ---------- one stop of the newest wing, as the example of how a visit works ----------

def stage(c, st):
    """A stop's picture. With a piece (a model to turn and to split into lines and built) the picture is its
    poster: the piece's script is fetched when the reader comes near, and without it the poster simply stays."""
    pic = st["pic"]
    sets = ([("(min-width: 960px)", pic["wide"], "56vw"), (None, pic, "100vw")] if "wide" in pic
            else [(None, pic, "(min-width: 960px) 56vw, 100vw")])
    p = st.get("piece")
    if p:
        view = (
            f'<div class="stage__view" data-stage data-piece="{p["name"]}" data-script="{p["script"]}" data-label="{p["canvas_label"]}">'
            + picture(c, sets, st["alt"], cls="stage__poster")
            + f'<span class="stage__tag stage__tag--a" aria-hidden="true">{p["tag_a"]}</span>'
            f'<span class="stage__tag stage__tag--b" aria-hidden="true">{p["tag_b"]}</span>'
            '<span class="stage__rule" aria-hidden="true"></span>'
            f'<input class="stage__range" type="range" min="0" max="100" value="40" step="1" aria-label="{p["slider_label"]}" disabled></div>'
        )
        controls = (
            f'<div class="stage__controls"><button class="plate-btn" type="button" data-machine-toggle data-stop="{p["pause"]}" '
            f'data-go="{p["play"]}" hidden>{p["pause"]}</button><span class="label__hint" data-stage-hint hidden>{p["hint"]}</span></div>'
        )
    else:
        view, controls = picture(c, sets, st["alt"]), ""
    return (f'<figure class="stage plate" id="stop-stage" data-lit><div class="hang">{view}</div>'
            + label(st["title"], st["kind"], st["what"], src=st.get("src")) + controls + "</figure>")


def layers(c, s, level=3, terms=""):
    """A stop's three texts, quoted. level: the heading level of the stop's title on this page."""
    w = c.w
    # the age is the museum's own words: where they do not say of what, the page sets its own key in front (age_k)
    key = f'<span class="key">{s["age_k"]}</span><span class="vh">:</span> ' if s.get("age_k") else ""
    age = f'<p class="from__age">{key}{s["age"]}</p>' if s.get("age") else ""
    # how sure the wing is of this stop, as the four grades say it
    if s.get("grade"):
        age += f'<p class="from__sure">{grade_word(c, s["grade"])}</p>'
    names = [w["stop.l1_k"], w["stop.l2_k"], w["stop.l3_k"]]
    h = f"h{level + 1}"
    first_layer = f'<div class="layer layer--1"><{h} class="layer__name">{names[0]}</{h}><blockquote><p>{s["layers"][0]["text"]}</p></blockquote></div>'
    more = "".join(
        f'<details class="layer layer--{i + 1}"><summary><{h} class="layer__name">{names[i]}</{h}></summary>'
        f'<blockquote><p>{s["layers"][i]["text"]}</p></blockquote></details>' for i in (1, 2))
    source = (f'<details class="layer sources"><summary><{h} class="layer__name">{w["stop.sources_h"]}</{h}></summary><p>{s["source"]}</p></details>'
              if s.get("source") else "")
    terms = f'<p class="sample terms">{terms}</p>' if terms else ""
    return (
        f'<div class="layers"><div class="from"><p class="from__k">{w["stop.from_k"]}</p><h{level} class="from__title">{s["title"]}</h{level}>{age}</div>'
        f'{first_layer}{more}{source}<p class="sample">{w["stop.sample_note"]}</p>{terms}</div>{LAYERS_SCRIPT}'
    )


# The four grades in the museum app's order and by its keys. Each is a bead of its grade's colour (tokens.css), and
# its word always stands beside it, so the colour is never the only sign.
GRADES = ("documented", "reconstructed", "conjectural", "unknown")


def bead(i):
    return f'<span class="bead bead--{GRADES[i]}" aria-hidden="true"></span>'


def grade_word(c, grade):
    """A grade's bead and its word, the page's decided word for that grade."""
    i = GRADES.index(grade)
    return f'{bead(i)}<span>{c.w[f"page_what.s2_four_{i + 1}"]}</span>'


def sure(c):
    """How sure the museum is: one sentence and the four grades, each a word behind its bead."""
    w = c.w
    items = "".join(f"<li>{grade_word(c, g)}</li>" for g in GRADES)
    return (f'<div class="sure"><p class="sure__h">{w["sure.h"]}</p><p class="sure__say">{w["sure.text"]}</p>'
            f'<ul class="sure__grades">{items}</ul></div>')


def grades_explained(c):
    """The four grades on the page about the museum: each bead, its word, and what it means in plain words."""
    w = c.w
    return '<dl class="graded">' + "".join(
        f'<div><dt>{grade_word(c, g)}</dt><dd>{w[f"page_what.s2_four_{i + 1}_text"]}</dd></div>'
        for i, g in enumerate(GRADES)) + "</dl>"


def stop_number(c, slug, s):
    """The stop's number in the walk: its place in the facts file's stops, or the number its data gives (n)."""
    stops = c.facts.get(slug, {}).get("stops", [])
    if s.get("id") in stops:
        return stops.index(s["id"]) + 1
    if isinstance(s.get("n"), int):
        return s["n"]
    raise SystemExit(f"the wing {slug!r}: the words name the example stop's number, and its stop has no id in the "
                     f"facts file's stops and no n")


def stop_section(c, slug):
    """How a visit works, on the museum's page: one stop of the newest open wing, with its three layers of text."""
    w, s = c.w, c.wd[slug]["stop"]
    name = esc(c.wings[slug]["name"][c.lang])
    p3 = w["visit.p3"].replace("{name}", name)
    if "{stop}" in p3:
        p3 = bind(p3.replace("{stop}", str(stop_number(c, slug, s))))
    head = (f'<div class="head stop__head"><h2 id="stop-h">{w["visit.heading"]}</h2><p class="lead">{w["visit.p1"]}</p>'
            f'<p>{w["visit.p2"]} {p3}</p></div>')
    return (
        f'<section class="stop band stop--visit" id="stop" aria-labelledby="stop-h">\n  <div class="wrap stop__grid">\n    {head}\n'
        f'    {stage(c, s["stage"])}\n    {layers(c, s, terms=w["visit.terms"])}\n    {sure(c)}\n  </div>\n</section>'
    )


def closing(c):
    """The museum's page closes on the museum itself: a heading and a few words, the door of the newest open wing,
    and beside the words a picture of that wing where its data gives one (landing.close). The first screen has
    already said which wing is open and what it shows, so the close does not say it again."""
    w, reg = c.w, c.wings[c.newest]
    words = (w["closing.p"].replace("{name}", esc(reg["name"][c.lang]).replace(" ", NBSP)).replace("{place}", esc(reg["shows"]["place"][c.lang]))
             .replace("{day}", esc(reg["shows"]["day"][c.lang])))
    go = (f'<div class="close__go" data-door-watch>{door(c, esc(reg["door"][c.lang]), w["hero.enter"])}'
          f'<p class="hero__note">{w["hero.entry_note"]}</p></div>')
    p = c.wd[c.newest].get("landing", {}).get("close")
    plate = ""
    if p:
        plate = ('<figure class="plate close__plate" data-lit><div class="hang">'
                 + picture(c, hero_sets(p["pic"], "(min-width: 960px) 46vw, 100vw"), p["alt"]) + "</div>"
                 + label(p["title"], p["kind"], p["what"], src=p.get("src")) + "</figure>")
    cls = "close close--plain close--home" + (" close--pic" if p else "")
    return (
        f'<section class="{cls}" id="enter" aria-labelledby="close-h">\n  <div class="wrap close__grid">\n'
        f'    <div class="close__text"><h2 id="close-h">{w["closing.heading"]}</h2><p class="lead">{words}</p>{go}</div>\n    {plate}\n  </div>\n</section>'
    )


# ---------- what a wing holds: the picture index, by group, from the wing's facts file ----------

def holder_html(c, facts, key, short=False):
    """A holder as the wing names it: the name in its own language, then its town, a loan or nothing."""
    h = next(x for x in facts["holders"] if x["id"] == key)
    lang = "" if h["lang"][c.lang] == c.lang else f' lang="{h["lang"][c.lang]}"'
    name = f'<span{lang}>{esc(h["name"][c.lang])}</span>'
    note = esc(h["note"][c.lang])
    return name if short or not note else f"{name}, {note}"


def see_it(c, slug, stop):
    """The way from an entry into the wing at its stop. Off until the facts file's switch says otherwise."""
    facts = c.facts[slug]
    if not facts.get("links", {}).get("wing") or not stop:
        return ""
    return f' <a class="seeit" href="{esc(c.wings[slug]["door"][c.lang])}#s={stop}">{c.w["wingpage.seeit"]}</a>'


def named(c, slug, item, words):
    """An entry's name. It leads to the entry's own page once that page exists and the facts file's switch is on."""
    facts, page = c.facts[slug], item.get("page")
    if not facts.get("links", {}).get("pages") or not page:
        return words
    href = c.to(f'{c.wings[slug]["page"][c.lang].strip("/")}/{page[c.lang]}/')
    return f'<a href="{href}">{words}</a>'


def wall_group(c, slug, g):
    """The works on a wall as one numbered list, in the order they hang: each with its holder and its size. A work
    that stands elsewhere (the field) follows with its own words."""
    w, facts = c.w, c.facts[slug]
    items = facts[g["from"]]
    fmt = lambda v: number(v, c.lang)
    lines = []
    for p in items:
        title = named(c, slug, p, esc(p["title"][c.lang])) + (f' <span class="wl__face">{w["wingpage.reverse"]}</span>' if p["face"] == "reverse" else "")
        cls = "" if p["class"] == "documented" else f' <span class="wl__class">{w["class." + p["class"]]}</span>'
        lines.append(
            f'<li value="{p["n"]}"><span class="wl__t">{title}</span><span class="wl__h">{holder_html(c, facts, p["holder"])}</span>'
            f'<span class="wl__s">{fmt(p["h_cm"])}{NBSP}×{NBSP}{fmt(p["w_cm"])}{NBSP}{w["wingpage.cm"]}{cls}</span>{see_it(c, slug, p["stop"])}</li>')
    listed = f'<ol class="wl" start="{items[0]["n"]}">{"".join(lines)}</ol><p class="wl__note">{w["wingpage.sizes_note"]}</p>'
    field = ""
    f = g.get("field")
    if f and facts["wall"].get("supper"):
        field = (
            f'<div class="wfield"><h4>{f["h"]}</h4><p>{f["p"]}</p>'
            f'<p class="wl__h">{w["wingpage.original"]}: {holder_html(c, facts, f["holder"])}{see_it(c, slug, f.get("stop"))}</p></div>')
    text = f'<div class="hgroup__text"><h3 id="{g["id"]}-h">{g["h"]}</h3>' + "".join(f"<p>{x}</p>" for x in g["p"]) + "</div>"
    return f'<article class="hgroup hgroup--wall" id="{g["id"]}" aria-labelledby="{g["id"]}-h">{text}{listed}{field}</article>'


def set_spans(counts, cols):
    """How many columns each place's things take when every tile is one size and the places stand side by side:
    the fewest rows at which all places fit beside each other. Then no place leaves a hole beside another."""
    for rows in range(1, max(counts) + 1):
        spans = [-(-n // rows) for n in counts]
        if sum(spans) <= cols:
            return spans
    return [cols] * len(counts)


def stop_close(c, slug, g):
    """One stop of a set, shown up close: its thing to turn, its three texts as the museum has them, and under
    them what the sheet gives and what the museum chose."""
    w, s = c.w, g["close"]
    q = s.get("quote")
    quote = f'<blockquote class="label__quote upclose__quote"><p>{q["text"]}</p><footer>{q["from"]}</footer></blockquote>' if q else ""
    rows = "".join(
        f'<div><dt>{r["k"]}</dt><dd>' + (f'<span lang="{r["lang"]}">{r["v"]}</span>' if r.get("lang") else r["v"]) + "</dd></div>"
        for r in s.get("rows", []))
    sheet = f'<dl class="sheet upclose__rows">{rows}</dl>' if rows else ""
    return (
        f'<div class="upclose" id="{g["id"]}-close"><div class="upclose__head"><h4>{w["stop.heading"]}</h4><p>{s["intro"]}</p></div>'
        f'{quote}{stage(c, s["stage"])}{layers(c, s, level=5)}{sheet}</div>'
    )


def set_group(c, slug, g):
    """A set of made things: one stop up close where the set has one (or its showpiece), then every thing with the
    museum's own picture as a tile of one size, by where it stands. A thing's plain name stands first (names, by
    its id, or the inventory's name), the sheet it follows second."""
    facts = c.facts[slug]
    items = facts[g["from"]]
    plain = g.get("names", {})
    blocks, counts = [], []
    for where, head in g["places"].items():
        cells = []
        for it in items:
            if it["where"] != where:
                continue
            pic = {"stem": f'm-{it["id"]}', "widths": [360, 720]}
            name = plain.get(it["id"]) or esc(it["name"][c.lang])
            alt = f'{name}. {g["alt_each"]}'
            line = f'{g["after"]} {esc(it["sheet"][c.lang])}' if it["sheet"] else g["no_sheet"]
            still = "" if it["moves"] else f' <span class="mcap__note">{g["still"]}</span>'
            cells.append(
                f'<li class="mitem"><figure class="plate mplate"><div class="hang">'
                + picture(c, [(None, pic, "(min-width: 960px) 18vw, (min-width: 600px) 30vw, 34vw")], alt)
                + f'</div><figcaption class="mcap"><span class="mcap__name">{named(c, slug, it, name)}</span>'
                f'<span class="mcap__sheet">{line}{still}</span>{see_it(c, slug, it["stop"])}</figcaption></figure></li>')
        if cells:
            blocks.append((head, cells))
            counts.append(len(cells))
    spans = set_spans(counts, 5) if counts else []
    # the rows the places share on a wide screen: holds_rules() writes how many each place spans
    rows = max((-(-n // span) for n, span in zip(counts, spans)), default=0)
    grid = "".join(
        f'<div class="mgroup mgroup--s{span}"><h4 class="key">{head}</h4><ul class="mlist">{"".join(cells)}</ul></div>'
        for (head, cells), span in zip(blocks, spans))
    # the note on the set's terms stands with its opening words: a term is explained before the stop uses it
    terms = f'<p class="terms">{g["terms"]}</p>' if g.get("terms") else ""
    text = f'<div class="hgroup__text"><h3 id="{g["id"]}-h">{g["h"]}</h3>' + "".join(f"<p>{x}</p>" for x in g["p"]) + terms + "</div>"
    lead = stop_close(c, slug, g) if g.get("close") else showpiece(c, slug, g["piece"], g["id"]) if g.get("piece") else ""
    return (f'<article class="hgroup hgroup--set" id="{g["id"]}" aria-labelledby="{g["id"]}-h">{text}{lead}'
            f'<div class="mgroups mgroups--r{rows}">{grid}</div></article>')


def fact_lists(c, slug, g):
    """A group's lists from the facts file: names, with a number where the list has one."""
    facts, out = c.facts[slug], []
    for ls in g.get("lists", []):
        rows = []
        for it in facts[ls["from"]]:
            name = it if ls["show"] == "self" else it[ls["show"]]
            words = esc(name[c.lang])
            sub = f' <span class="fl__sub">{esc(it["title"][c.lang])}</span>' if ls["show"] == "name" and "title" in it else ""
            n = f'<span class="fl__n">{number(it[ls["n"]], c.lang)}</span>' if ls.get("n") else ""
            rows.append(f'<li><span class="fl__name">{words}{sub}</span>{n}</li>')
        unit = f'<span class="fl__unit">{ls["unit"]}</span>' if ls.get("unit") else ""
        cls = "fl fl--n" if ls.get("n") else "fl"
        if ls.get("fold"):
            out.append(f'<details class="{cls} fl--fold"><summary><span class="key">{ls["h"]}</span></summary><ul>{"".join(rows)}</ul></details>')
        else:
            out.append(f'<div class="{cls}"><p class="fl__h"><span class="key">{ls["h"]}</span>{unit}</p><ul>{"".join(rows)}</ul></div>')
    return "".join(out)


def text_group(c, slug, g, side):
    rows = "".join(f'<div><dt>{r["k"]}</dt><dd>{r["v"]}{see_it(c, slug, r.get("stop"))}</dd></div>' for r in g.get("rows", []))
    more = fact_lists(c, slug, g) + (f'<dl class="sheet">{rows}</dl>' if rows else "")
    link = see_it(c, slug, g.get("stop"))
    if link:
        more += f'<p class="hgroup__go">{link.strip()}</p>'
    html, side = hung(c, g, side, more=f'<div class="hgroup__more">{more}</div>' if more else "")
    return html.replace('<article class="place ', '<article class="hgroup hgroup--text place ', 1), side


def holds(c, slug):
    """What the wing holds: a picture index by group, in the walk's order. Each group has its own form."""
    w, d = c.w, c.wd[slug]
    h = d.get("holds")
    if not h or slug not in c.facts:
        return ""
    out, side = [], 0
    for g in h["groups"]:
        if g["form"] == "wall":
            out.append(wall_group(c, slug, g))
        elif g["form"] == "set":
            out.append(set_group(c, slug, g))
        else:
            html, side = text_group(c, slug, g, side)
            out.append(html)
    rows = [(g["id"], g["h"], g.get("note", "")) for g in h["groups"]]
    # the index stands apart from the walk, closed, as a museum keeps its checklist: its heading opens it, and a link
    # to anything inside opens it first (site.js)
    return (
        '<section class="holds band" id="holds" aria-labelledby="holds-h">\n  <div class="wrap">\n'
        f'    <details class="fold" id="holds-fold">\n    <summary class="fold__sum"><h2 id="holds-h">{w["wingpage.holds_h"]}</h2><span class="fold__sign" aria-hidden="true"></span></summary>\n'
        f'    <div class="wing__top">\n      <div class="head"><p class="lead">{h["lead"]}</p></div>\n'
        f'      {directory(rows)}\n    </div>\n    ' + "\n    ".join(out) + "\n    </details>\n  </div>\n</section>"
    )


def holds_rules(c, slug):
    """The rules the index needs in the page's own style block."""
    d = c.wd[slug]
    out = ""
    # the holders in two columns that end at one height: the build knows how many rows that takes
    held = len(c.facts.get(slug, {}).get("holders") or d.get("holders", {}).get("items", []))
    if held:
        out += f"@media (min-width:{HOLDERS_TWO}px){{.facts .holders{{grid-template-rows:repeat({-(-held // 2)},auto)}}}}"
    # a set's places share their rows on a wide screen: each place spans its heading's row and its tiles' rows
    rows = sorted({int(n) for n in re.findall(r'class="mgroups mgroups--r(\d+)"', holds(c, slug))})
    if rows:
        out += "@media (min-width:960px){" + "".join(f".mgroups--r{n} .mgroup{{grid-row:span {n + 1}}}" for n in rows) + "}"
    return out


# ---------- a wing in numbers, where the originals are, where to read on ----------

def facts(c, slug):
    """One band: the wing in numbers, a number and its name, and under it every holder of an original. A number's
    row takes a second line only where its data gives one (text). The holders stand in full here and nowhere
    else on the site, each a name and under it its town, or where the wing knows none, its loan or what is known."""
    w, d, lang = c.w, c.wd[slug], c.lang
    parts = []
    if d.get("numbers"):
        rows = "".join(
            f'<div><dt class="tally__term">{it["term"]}</dt>'
            f'<dd class="tally__n">{it["num"].replace("{n}", number(c.count(slug, it["count"]), lang))}</dd>'
            + (f'<dd class="tally__text">{it["text"]}</dd>' if it.get("text") else "") + "</div>" for it in d["numbers"])
        parts.append(f'<div class="facts__numbers"><h2>{w["wingpage.numbers_h"]}</h2><dl class="tally">{rows}</dl></div>')
    h = d.get("holders")
    if h:
        f = c.facts.get(slug, {})
        if f.get("holders"):
            items = "".join(f'<li>{holder_html(c, f, x["id"], short=True)} <span>{esc(x["note"][lang])}</span></li>' for x in f["holders"])
            items = items.replace(" <span></span>", "")
        else:
            items = "".join(
                "<li><span" + ("" if it.get("lang", lang) == lang else f' lang="{it["lang"]}"') + f'>{it["name"]}</span> <span>{it["city"]}</span></li>'
                for it in h.get("items", []))
        after = f'<p class="apart">{h["after"]}</p>' if h.get("after") else ""
        parts.append(f'<div class="facts__holders" id="originals"><h2>{w["wingpage.holders_h"]}</h2><p>{h["p"]}</p><ul class="holders">{items}</ul>{after}</div>')
    if not parts:
        return ""
    return '<section class="facts wallband" id="facts">\n  <div class="wrap facts__grid">\n    ' + "\n    ".join(parts) + "\n  </div>\n</section>"


def go_in(c, slug):
    """The door at a page's end, with the entry note under it."""
    return (f'<div class="close__go" data-door-watch>{door(c, esc(c.wings[slug]["door"][c.lang]), c.w["hero.enter"])}'
            f'<p class="hero__note">{c.w["hero.entry_note"]}</p></div>')


def more(c, slug):
    """The page's last part, a quiet strip of ways on: the pages on this wing, the list of holders on this page,
    what the museum is. The door stands in the end of the walk above it. A wing without that part keeps it here."""
    w, reg, lang = c.w, c.wings[slug], c.lang
    entry = lambda href, name, line: (
        f'<li><a class="more" href="{href}"><span>{name}</span>{ARROW}</a><span class="topics__line">{line}</span></li>')
    items = [entry(c.to(reg["page"][lang].strip("/") + "/" + t["slug"][lang] + "/"), esc(t["name"][lang]), esc(t["line"][lang]))
             for t in reg.get("topics", [])]
    if c.wd[slug].get("holders"):
        items.append(entry("#originals", w["wingpage.more_originals"], w["wingpage.more_originals_line"]))
    items.append(entry(c.to(c.addr("what")), w["nav.what"], w["wingpage.more_what_line"]))
    go = "" if c.wd[slug].get("end") else go_in(c, slug)
    # side by side on a wide screen: up to four in one row, more in two rows
    n = len(items)
    cols = n if n <= 4 else min(4, -(-n // 2))
    return (
        '<section class="after band" id="more" aria-labelledby="more-h">\n  <div class="wrap after__grid">\n'
        f'    <div class="head"><h2 id="more-h">{w["wingpage.more_h"]}</h2><p class="lead">{w["wingpage.more_lead"]}</p>{go}</div>\n'
        f'    <ul class="topics topics--c{cols}">{"".join(items)}</ul>\n  </div>\n</section>'
    )


def end(c, slug):
    """Where the walk ends. It stands after the index, as in the wing. Its last line is the door."""
    e = c.wd[slug].get("end")
    if not e:
        return ""
    sky = e.get("sky")
    back = ""
    if sky:
        back = ('<figure class="close__sky">' + picture(c, [(None, sky["pic"], "100vw")], sky["alt"])
                + label(sky["title"], sky["kind"], sky["what"]) + "</figure>")
    p = e.get("plate")
    hung_plate = ""
    if p:
        hung_plate = ('<figure class="plate close__grave"><div class="hang">'
                      + picture(c, [(None, p["pic"], "(min-width: 960px) 40vw, 100vw")], p["alt"]) + "</div>"
                      + label(p["title"], p["kind"], p["what"], src=p.get("src")) + "</figure>")
    dusk = " data-dusk" if sky else ""
    cls = "close close--end" if sky else "close close--end close--plain"
    return (
        f'<section class="{cls}" id="{e["id"]}" aria-labelledby="close-h"{dusk}>\n  {back}\n  <div class="wrap close__grid">\n'
        f'    <div class="close__text"><h2 id="close-h">{e["h"]}</h2><p class="lead">{e["p"]}</p></div>\n    {hung_plate}\n'
        f'    {go_in(c, slug)}\n  </div>\n</section>'
    )


# ---------- the page about the museum: the way to a wing's holders, the organisation's other site ----------

def originals_links(c):
    """One way to each open wing's list of holders: the list stands on the wing's own page."""
    items = []
    for slug in c.open:
        if not c.wd[slug].get("holders"):
            continue
        name = esc(c.wings[slug]["name"][c.lang]).replace(" ", NBSP)
        href = c.to(c.wings[slug]["page"][c.lang].strip("/") + "/") + "#originals"
        items.append(f'<li><a class="more" href="{href}"><span>{c.w["page_what.s3_link"].replace("{name}", name)}</span>{ARROW}</a></li>')
    return f'<ul class="ways">{"".join(items)}</ul>' if items else ""


def other_sites(c):
    """A wing's way to another site of the organisation, with its line of words, under who runs the museum."""
    out = []
    for slug in c.open:
        link, line = c.wings[slug].get("out"), c.wd[slug].get("out", {}).get("line")
        if link and line:
            # the other site in the page's language where it speaks it (speaks), else in English
            href = esc(link["href"].replace("{lang}", c.lang if c.lang in link.get("speaks", [c.lang]) else "en"))
            out.append(f'<p class="other"><a class="more" href="{href}" rel="noopener"><span>{esc(link["name"])}</span>{ARROW}</a>'
                       f'<span class="other__line">{line}</span></p>')
    return "".join(out)


# ---------- the menu, the same on every page ----------

def nav_wings(c, here=None):
    """The wings in the bar: one open wing stands by its name, several open behind one word."""
    w, lang = c.w, c.lang
    link = lambda s: (f'<a href="{c.to(c.wings[s]["page"][lang].strip("/") + "/")}"'
                      + (' aria-current="page"' if s == here else "") + f'>{esc(c.wings[s]["name"][lang])}</a>')
    if len(c.open) == 1:
        return link(c.open[0])  # one open wing stands by its name
    return f'<details class="drop" data-drop><summary>{w["nav.wings"]}</summary><div class="drop__panel">{grouped(c, link)}</div></details>'


def in_time(c, slugs):
    """Wings in the order of time: by the year each shows (when, in the registry). A wing without one comes last."""
    when = lambda s: c.wings[s].get("when")
    return sorted(slugs, key=lambda s: (when(s) is None, when(s) or 0))


def grouped(c, link):
    many = len(c.collections) > 1
    out = []
    for coll in c.collections:
        mine = in_time(c, [s for s in c.open if c.wings[s]["collection"] == coll["slug"]])
        if not mine:
            continue
        head = f'<p class="menu__h">{esc(coll["name"][c.lang])}</p>' if many else ""
        first = c.wings[mine[0]].get("when")
        out.append(((first is None, first or 0), head + '<ul class="menu__list">' + "".join(f"<li>{link(s)}</li>" for s in mine) + "</ul>"))
    # the collections too, by their earliest wing
    return "".join(html for _, html in sorted(out, key=lambda x: x[0]))


def menu_wings(c, here=None):
    lang = c.lang
    link = lambda s: (f'<a href="{c.to(c.wings[s]["page"][lang].strip("/") + "/")}"'
                      + (' aria-current="page"' if s == here else "") + f'>{esc(c.wings[s]["name"][lang])}</a>')
    head = "" if len(c.collections) > 1 else f'<p class="menu__h">{c.w["nav.wings"]}</p>'
    return head + grouped(c, link)


def prose(c, text):
    """One paragraph of a reading page's data: escaped, with [label](target) as its only mark-up."""
    def link(m):
        words, target = m.group(1), m.group(2)
        if target.startswith("page:"):
            return f'<a href="{c.to(c.addr(target[5:]))}"{c.elsewhere(target[5:])}>{words}</a>'
        if not re.match(r"(https://|mailto:)", target):
            raise SystemExit(f"a reading page links to {target!r}: only https, mailto and page:<name> are allowed")
        rel = "" if target.startswith("mailto:") else ' rel="noopener"'
        return f'<a href="{target}"{rel}>{words}</a>'
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, sign_whole(esc(bind(text, c.lang))))


def reading_sections(c, sections):
    toc, body = [], []
    for i, s in enumerate(sections, 1):
        toc.append(f'<li><a href="#s{i}">{esc(s["h"])}</a></li>')
        blocks = "".join(
            f"<p>{prose(c, b)}</p>" if isinstance(b, str) else '<ul class="bullets">' + "".join(f"<li>{prose(c, x)}</li>" for x in b) + "</ul>"
            for b in s["body"])
        body.append(f'      <section id="s{i}">\n        <h2>{esc(s["h"])}</h2>\n        {blocks}\n      </section>')
    return "".join(toc), "\n".join(body)
