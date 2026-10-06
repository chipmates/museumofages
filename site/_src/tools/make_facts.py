#!/usr/bin/env python3
"""Makes the one facts file of the Leonardo wing's page from the wing's inventory.

    python3 _src/tools/make_facts.py            write _src/wings/vinci.facts.json
    python3 _src/tools/make_facts.py --check    compare the file with the inventory, write nothing

Every name, number, size and holder on the wing's page is read from that file, and the build runs derive() below
and stops when the file and the inventory differ. What the inventory does not hold in a usable form stands in the
tables here: the language of a holder's name, its German form as the wing's own data writes it, the two frames whose place on the wall
is narrower or wider than the picture (from the wing's hang), and the German names of the sheets.
A value under "set", the two switches under "links" and an entry's "page" are kept when the file is written again.
The values under "set" are the few the inventory gives in a sentence and not in a column (its parts 3, 5, 6 and 8).
The inventory, a table of everything the wing shows, stays outside the repository: MOA_INVENTORY names it.
Without it the build skips the comparison and the file stands as it is. Standard library only.
"""
import csv
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "wings" / "vinci.facts.json"
INVENTORY = Path(os.environ.get("MOA_INVENTORY", ""))
# The wing's own hang and layout in the museum app beside the site (read only): the build compares the wall's
# drawing with them when they are there.
WING = HERE.parent.parent.parent / "museum" / "src" / "wings" / "vinci" / "collection"
HANG = WING / "hang.ts"
LAYOUT = WING / "layout.ts"

# The houses: (key, how the inventory begins the holder, name, language of the name, what stands after the name in
# English, the same in German). Their order on the page is not this table's: derive() orders them by the stop at
# which the walk first meets one of their works. Where the wing's own German data writes a holder
# differently from the English (pictures/data/paintings.json, holder_de), the name is a pair: (English, German),
# each read in its own language. A house whose name carries its town in its own language has the town after it
# too, for a reader who does not read that language.
HOLDERS = [
    ("uffizi", "Gallerie degli Uffizi", "Gallerie degli Uffizi", "it", "Florence", "Florenz"),
    ("nga", "National Gallery of Art", "National Gallery of Art", "en", "Washington", "Washington"),
    ("pinakothek", "Bayerische Staatsgemäldesammlungen", "Bayerische Staatsgemäldesammlungen, Alte Pinakothek", "de", "Munich", "München"),
    ("hermitage", "State Hermitage Museum", ("State Hermitage Museum", "Staatliche Eremitage"), None, "Saint Petersburg", "Sankt Petersburg"),
    ("vaticana", "Pinacoteca Vaticana", "Pinacoteca Vaticana", "it", "Vatican City", "Vatikanstadt"),
    ("louvre", "Musée du Louvre", "Musée du Louvre", "fr", "Paris", "Paris"),
    ("ambrosiana", "Veneranda Biblioteca Ambrosiana", "Veneranda Biblioteca Ambrosiana", "it", "Milan", "Mailand"),
    ("czartoryski", "Muzeum Narodowe w Krakowie", "Muzeum Narodowe w Krakowie, Muzeum Książąt Czartoryskich", "pl", "Kraków", "Krakau"),
    ("national-gallery", "National Gallery, London", "National Gallery", "en", "London", "London"),
    ("buccleuch", "Buccleuch collection", ("Buccleuch collection", "Sammlung Buccleuch"), None,
     "on loan to National Galleries of Scotland", "Leihgabe an die National Galleries of Scotland"),
    ("griffin", "Kenneth C. Griffin Collection", "Kenneth C. Griffin Collection", "en",
     "on loan to The Metropolitan Museum of Art", "Leihgabe an das Metropolitan Museum of Art"),
    ("owner", "Private collection", ("Private collection", "Privatsammlung"), None, "present location unconfirmed", "heutiger Aufenthaltsort unbestätigt"),
    ("parma", "Galleria Nazionale di Parma", "Galleria Nazionale di Parma, Complesso della Pilotta", "it", "Parma", "Parma"),
    ("institut", "Bibliothèque de l’Institut de France", "Bibliothèque de l'Institut de France", "fr", "Paris", "Paris"),
    ("bne", "Biblioteca Nacional de España", "Biblioteca Nacional de España", "es", "Madrid", "Madrid"),
    ("vam", "Victoria and Albert Museum", "Victoria and Albert Museum, National Art Library", "en", "London", "London"),
    ("reale", "Biblioteca Reale", "Biblioteca Reale", "it", "Turin", "Turin"),
    ("trivulziana", "Biblioteca Trivulziana", "Biblioteca Trivulziana, Castello Sforzesco", "it", "Milan", "Mailand"),
    ("british-library", "British Library", "British Library", "en", "London", "London"),
    ("royal-collection", "Royal Collection", "Royal Collection", "en", "Windsor", "Windsor"),
    ("cenacolo", "Museo del Cenacolo Vinciano", "Museo del Cenacolo Vinciano, Santa Maria delle Grazie", "it", "Milan", "Mailand"),
    ("petit-palais", "Petit Palais", "Petit Palais, Musée des Beaux-Arts de la Ville de Paris", "fr", "Paris", "Paris"),
]
# Two of the hung works are drawings, by their holders' own words: the count of
# paintings leaves them out, so a page can say how many works hang, how many are paintings and how many drawings.
DRAWINGS = ("burlington-house-cartoon", "anghiari-copy")
# Two frames keep the place on the wall of an earlier record of their size (the wing's hang says why).
SLOTS = {"adoration-of-the-magi": 240.0, "yarnwinder-lansdowne": 36.4}
# The stop a painting is seen from, where it is not the room's first.
PAINTING_STOP = {"mona-lisa": "picture-room-lisa"}
ROOM_OF = (("The court", "court"), ("The mechanism hall", "hall"), ("The house", "house"))
# The shelf's books: how each is named in German where its name is not the same word in both languages.
BOOK_DE = {"Codex on the Flight of Birds": "Kodex über den Vogelflug", "Paris manuscript A, fifteen faces": "Pariser Manuskript A",
           "Codex Atlanticus, excerpts": "Codex Atlanticus, Auszüge"}
BOOK_EN = {"Paris manuscript A, fifteen faces": "Paris Manuscript A"}


def rows():
    with open(INVENTORY, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def holder_key(text):
    for key, starts, *_ in HOLDERS:
        if text.startswith(starts):
            return key
    return None


def num(text):
    value = float(text)
    return int(value) if value == int(value) else value


def sheet_de(sheet):
    return sheet.replace("Paris Manuscript", "Pariser Manuskript").replace("Manuscript", "Manuskript").replace(", detail", ", Detail")


def derive():
    """Everything the inventory settles, in the shape the facts file keeps it."""
    data = rows()
    group = lambda name: [r for r in data if r["group"] == name]
    one = lambda rid: next((r for r in data if r["id"] == rid), None)
    met = {}
    stops = [r["id"].split("/", 1)[1] for r in group("stop")]

    def house(text, stop, order=(0, 0)):
        """The holder's key. It is met at the stop its work is seen from: the earliest such place is kept."""
        key = holder_key(text)
        if key is None:
            raise SystemExit(f"make_facts: the holder {text!r} is not in the table of houses")
        at = (stops.index(stop),) + tuple(order)
        if key not in met or at < met[key]:
            met[key] = at
        return key

    paintings = []
    for r in group("painting"):
        m = re.match(r"hung face (\d+) of 25 .*?; ([\d.]+) x ([\d.]+) cm hung \(height x width\); date (.*?); attribution class (\w+)", r["note"])
        if not m:
            continue
        work, face = r["id"].split("/")[1:3]
        w = num(m.group(3))
        paintings.append({
            "n": int(m.group(1)), "id": work, "face": face, "title": {"en": r["name_en"], "de": r["name_de"]},
            "h_cm": num(m.group(2)), "w_cm": w, "slot_cm": SLOTS.get(work, w), "date": m.group(4), "class": m.group(5),
            "holder": house(r["original_at"], "picture-room", (0, int(m.group(1)))), "stop": PAINTING_STOP.get(work, "picture-room"), "page": None})
    paintings.sort(key=lambda p: p["n"])
    for work in DRAWINGS:
        if work not in {p["id"] for p in paintings}:
            raise SystemExit(f"make_facts: the drawing {work!r} is not among the hung works of the inventory")
    machines = []
    for r in group("machine"):
        place, station, at = [x.strip() for x in r["where_in_the_wing"].split(";")]
        sheet = re.search(r"sheet (.*?); sheet date", r["note"]).group(1)
        has_sheet = sheet != "no folio"
        n, stop = int(at.rsplit(" ", 1)[1]), station.replace("film station ", "")
        machines.append({
            "n": n, "id": r["id"].split("/", 1)[1], "name": {"en": r["name_en"], "de": r["name_de"]},
            "where": next(k for starts, k in ROOM_OF if place.startswith(starts)), "stop": stop,
            "moves": "static, no motion" not in r["note"],
            "sheet": {"en": sheet, "de": sheet_de(sheet)} if has_sheet else None,
            "holder": house(r["original_at"], stop, (1, n)) if has_sheet else None, "page": None})
    machines.sort(key=lambda m: m["n"])
    topics = [{"id": r["id"].split("/", 1)[1], "name": {"en": r["name_en"], "de": r["name_de"]},
               "pages": int(re.match(r"(\d+) pages", r["note"]).group(1))} for r in group("reading table topic")]
    volume, shelf = None, []
    for r in group("book or edition"):
        official = re.search(r"official name '([^']+)'", r["note"]).group(1)
        if "whole edition" in r["id"]:
            volume = {"pages": int(re.search(r"all (\d+) printed pages", r["what_opens"]).group(1)),
                      "holder": house(r["original_at"], "reading-table")}
            continue
        shelf.append({"id": r["id"].split("/", 1)[1], "title": {"en": r["name_en"], "de": r["name_de"]},
                      "name": {"en": BOOK_EN.get(official, official), "de": BOOK_DE.get(official, official)},
                      "sides": int(re.search(r"(\d+) sides to turn", r["what_opens"]).group(1)),
                      "holder": house(r["original_at"], "reading-table", (1, len(shelf)))})
    sheets = []
    for r in group("anatomy sheet"):
        apart = "apart from the four courses" in r["where_in_the_wing"]
        sheets.append({"id": r["id"].split("/", 1)[1], "title": {"en": r["name_en"], "de": r["name_de"]},
                       "stop": "body-valve" if apart else "body", "apart": apart})
        house(r["original_at"], "body", (0, len(sheets)))
    supper, grave_painting = one("picture/last-supper/front"), one("picture/deathbed-painting/front")
    # in the court the wall painting's field is the stop itself, the three machines stand beside it
    house(supper["original_at"], "supper-wall")
    house(grave_painting["original_at"], "grave")
    dates = [r for r in data if r["id"].startswith("date/")]
    named = lambda prefix: [{"en": r["name_en"], "de": r["name_de"]} for r in data if r["id"].startswith(prefix)]
    film = one("film/glass-heart")
    # the works a visitor can step up to: the hung faces, the wall painting's field, the sheets on the body wall,
    # the machines, and five single things (the sheet under the study's window, the slab, the model of the light,
    # the painting at the grave, the book on the table)
    singles = [one("place/grave"), one("place/grave-diagram"), grave_painting, one("codex/paris-B (whole edition: codex/edition)"),
               one("study-sheet/deluge")]
    if any(x is None for x in singles):
        raise SystemExit("make_facts: one of the five single works is not in the inventory")
    sides = volume_sides(data)
    counts = {
        "stops": len(stops), "works": len(paintings) + 1 + len(sheets) + len(machines) + len(singles),
        "pictures": len(paintings), "hung_works": len({p["id"] for p in paintings}),
        "hung_paintings": len({p["id"] for p in paintings if p["id"] not in DRAWINGS}),
        "hung_drawings": len({p["id"] for p in paintings if p["id"] in DRAWINGS}),
        "machines": len(machines), "moving": sum(m["moves"] for m in machines), "from_sheets": sum(1 for m in machines if m["sheet"]),
        "hall": sum(m["where"] == "hall" for m in machines), "court": sum(m["where"] == "court" for m in machines),
        "house": sum(m["where"] == "house" for m in machines),
        "sheets": len(sheets), "topics": len(topics), "topic_pages": sum(t["pages"] for t in topics),
        "volume_pages": volume["pages"], "volume_sides": sides["all"], "volume_b_sides": sides["b"], "volume_d_sides": sides["d"],
        "shelf_books": len(shelf), "shelf_sides": sum(b["sides"] for b in shelf),
        "dates": len(dates), "dates_floor": sum("cut into the floor" in r["where_in_the_wing"] for r in dates),
        "periods": len(named("period/")), "people": len(named("person/")), "holders": len(met),
    }
    for cls in ("documented", "disputed", "qualified", "workshop", "copy"):
        counts[f"class_{cls}"] = len({p["id"] for p in paintings if p["class"] == cls})
    return {
        "counts": counts, "stops": stops, "paintings": paintings, "machines": machines, "topics": topics, "shelf": shelf,
        "sheets": sheets, "periods": named("period/"), "people": named("person/"),
        "holders": sorted(met, key=met.get),
        "heart_film_seconds": float(re.match(r"([\d.]+) s", film["note"]).group(1)),
    }


def volume_sides(data):
    """The sides of the printed volume that show the notebooks themselves, by notebook."""
    sides = [r for r in data if r["group"] == "other sheet" and r["id"].startswith("edition/")]
    return {"all": len(sides), "b": sum("manuscript B" in r["name_en"] for r in sides), "d": sum("manuscript D" in r["name_en"] for r in sides)}


def wall():
    """The wall's own measures, from the wing's hang and layout when they can be read."""
    if not (HANG.exists() and LAYOUT.exists()):
        return None
    hang, layout = HANG.read_text(encoding="utf-8"), LAYOUT.read_text(encoding="utf-8")
    a, b = (float(x) for x in re.search(r"span: \[number, number\] = \[(-[\d.]+) \+ ([\d.]+),", hang).groups())
    c, d = (float(x) for x in re.search(r", (-[\d.]+) - ([\d.]+)\]", hang).groups())
    field = re.search(r"field: \{ width: ([\d.]+), height: ([\d.]+), sill: ([\d.]+) \}", layout)
    works = [(m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(5)) if m.group(5) else float(m.group(2)))
             for m in re.finditer(r"w\('([a-z-]+)', ([\d.]+), ([\d.]+)(?:, '(front|reverse)')?(?:, ([\d.]+))?\)", hang)]
    return {
        "span_m": round((c - d) - (a + b), 3), "moulding_m": float(re.search(r"MOULDING = ([\d.]+)", hang).group(1)),
        "datum_m": float(re.search(r"HANG_DATUM = FLOOR \+ ([\d.]+)", layout).group(1)),
        "supper": {"w_m": float(field.group(1)), "h_m": float(field.group(2)), "sill_m": float(field.group(3))},
        "works": works,
    }


def make(old=None):
    d = derive()
    w = wall() or (old or {}).get("wall")
    if w is None:
        raise SystemExit("make_facts: the wing's hang cannot be read and no earlier file holds the wall's measures")
    hung = w.pop("works", None)
    if hung:
        for p, (work, width, height, slot) in zip(d["paintings"], hung):
            if (p["id"], p["w_cm"], p["h_cm"], p["slot_cm"]) != (work, num(str(width)), num(str(height)), num(str(slot))):
                raise SystemExit(f"make_facts: hang number {p['n']} differs between the inventory and the wing's hang: {p} / {(work, width, height, slot)}")
    keep = old or {}
    pages = {(k, x["id"], x.get("face")): x.get("page") for k in ("paintings", "machines") for x in keep.get(k, [])}
    for k in ("paintings", "machines"):
        for x in d[k]:
            x["page"] = pages.get((k, x["id"], x.get("face")))
    houses = {}
    for key, _, name, lang, en, de in HOLDERS:
        pair = isinstance(name, tuple)
        houses[key] = {"name": {"en": name[0] if pair else name, "de": name[1] if pair else name},
                       "lang": {"en": "en" if pair else lang, "de": "de" if pair else lang}, "note": {"en": en, "de": de}}
    return {
        "_note": "THE FACTS OF THIS WING'S PAGE. Every number, name, size and holder the page shows is read from here. Made from the "
                 "wing's inventory by tools/make_facts.py, which the build runs again to compare: a value here that the inventory does "
                 "not carry stops the build. Set by hand, in one edit each: the values under set, the two switches under links (pages: "
                 "an entry with a page links to it. wing: every entry says 'see it in the wing' and opens the wing at its stop), and an "
                 "entry's page (its address under the wing's page, per language). In the wing's words a number is written "
                 "{count:<name>} for digits and {word:<name>} or {Word:<name>} for the word.",
        "_made_by": "tools/make_facts.py",
        "links": keep.get("links", {"pages": False, "wing": False}),
        "set": keep.get("set", {
            "wall_m": 34, "wall_long_m": 34.6, "person_m": 1.7, "supper_w_m": w["supper"]["w_m"], "supper_h_m": w["supper"]["h_m"],
            "volume_year": "1883", "sheet_from": "1487", "sheet_to": "1489", "heart_seconds": 30,
            "chimney_year": "1500", "chapel_year": "1492", "line_m": 26, "hour": 9,
        }),
        "counts": d["counts"], "wall": w, "stops": d["stops"], "paintings": d["paintings"], "machines": d["machines"],
        "topics": d["topics"], "shelf": d["shelf"], "sheets": d["sheets"], "periods": d["periods"], "people": d["people"],
        "holders": [dict(houses[k], id=k) for k in d["holders"]], "heart_film_seconds": d["heart_film_seconds"],
    }


def skipped():
    """What compare() leaves out here because its file is not at hand, as lines (the build prints them)."""
    if not os.environ.get("MOA_INVENTORY") or not INVENTORY.is_file():
        return ["the comparison with the wing's inventory: MOA_INVENTORY names no file (the inventory is not part "
                "of the repository)"]
    if not (HANG.exists() and LAYOUT.exists()):
        return [f"the comparison of the wall with the wing's hang: {HANG.parent} is not there"]
    return []


def compare(facts):
    """What differs between a facts file and the inventory, as lines. Empty when they agree, or when the
    inventory is not at hand."""
    if not os.environ.get("MOA_INVENTORY") or not INVENTORY.is_file():
        return []
    d, out = derive(), []
    for key, value in d["counts"].items():
        if facts.get("counts", {}).get(key) != value:
            out.append(f"counts.{key} is {facts.get('counts', {}).get(key)!r}, the inventory gives {value!r}")
    strip = lambda items: [{k: v for k, v in x.items() if k != "page"} for x in items]
    for key in ("stops", "topics", "shelf", "sheets", "periods", "people"):
        if facts.get(key) != d[key]:
            out.append(f"{key} differs from the inventory")
    for key in ("paintings", "machines"):
        if strip(facts.get(key, [])) != strip(d[key]):
            out.append(f"{key} differs from the inventory")
    if [h.get("id") for h in facts.get("holders", [])] != d["holders"]:
        out.append("holders differs from the inventory")
    w = wall()
    if w:
        w.pop("works")
        if facts.get("wall") != w:
            out.append("wall differs from the wing's hang and layout")
    return out


def main():
    if not os.environ.get("MOA_INVENTORY") or not INVENTORY.is_file():
        raise SystemExit("make_facts: set MOA_INVENTORY to the wing's inventory (a TSV file that is not part of the "
                         "repository). The facts file in wings/ is enough to build the site.")
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
    if "--check" in sys.argv:
        problems = compare(old or {})
        print("\n".join(problems) or "the facts file agrees with the inventory")
        sys.exit(1 if problems else 0)
    facts = make(old)
    OUT.write_text(json.dumps(facts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.name}: " + ", ".join(f"{k} {v}" for k, v in facts["counts"].items()))


if __name__ == "__main__":
    main()
