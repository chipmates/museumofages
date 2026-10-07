"""The four test registries: today's, three open wings, thirty wings (open and in the making), two collections.
Stand-in wings with reused or drawn pictures, built to _test/<name>/ and never into dist/. Every page of a test
build carries a mark and says noindex. Two of them prove that a showpiece stands on one place only: in "two" the
stand-in animal has its piece on the landing's place and a still on its own page, in "three" the newest stand-in
life has it the other way round, with a clip. Names of real people are used for their length only: nothing here is
a plan or a promise.

How a wing is added, as these stand-ins do it: one entry in the registry, one data file per language, its
pictures. No template, style sheet or script is touched."""
import copy
import json
from pathlib import Path

import languages
import render as R
from . import draw

HERE = Path(__file__).resolve().parent
LIVES = [("Marcus Aurelius", "Mark Aurel", "121", "180"), ("Hildegard von Bingen", None, "1098", "1179"), ("Dante Alighieri", None, "1265", "1321"),
         ("Albrecht Dürer", None, "1471", "1528"), ("Michelangelo Buonarroti", None, "1475", "1564"), ("Nicolaus Copernicus", "Nikolaus Kopernikus", "1473", "1543"),
         ("William Shakespeare", None, "1564", "1616"), ("Galileo Galilei", None, "1564", "1642"), ("Johannes Kepler", None, "1571", "1630"),
         ("René Descartes", None, "1596", "1650"), ("Rembrandt van Rijn", None, "1606", "1669"), ("Blaise Pascal", None, "1623", "1662"),
         ("Baruch Spinoza", None, "1632", "1677"), ("Maria Sibylla Merian", None, "1647", "1717"), ("Johann Sebastian Bach", None, "1685", "1750"),
         ("Immanuel Kant", None, "1724", "1804"), ("Johann Wolfgang von Goethe", None, "1749", "1832"), ("Wolfgang Amadeus Mozart", None, "1756", "1791"),
         ("Alexander von Humboldt", None, "1769", "1859"), ("Ludwig van Beethoven", None, "1770", "1827"), ("Jane Austen", None, "1775", "1817"),
         ("Michael Faraday", None, "1791", "1867"), ("Mary Shelley", None, "1797", "1851"), ("Charles Darwin", None, "1809", "1882"),
         ("Ada Lovelace", None, "1815", "1852"), ("Clara Schumann", None, "1819", "1896"), ("Florence Nightingale", None, "1820", "1910"),
         ("Emily Dickinson", None, "1830", "1886"), ("Vincent van Gogh", None, "1853", "1890"), ("Marie Curie", None, "1867", "1934")]
ANIMALS = [("Musterdon", "open"), ("Musteropteryx", "making"), ("Musterceratops", "planned"), ("Mustersaurus", "open")]
# pictures of the first wing, reused: (stem, widths)
REUSE = [("hall", [800, 1600]), ("court", [800, 1600]), ("v-lion", [800, 1600]), ("v-codex", [800, 1600]), ("v-heart", [800, 1600]),
         ("v-flywheel", [960, 1600]), ("stair", [480, 780]), ("grave-court", [560, 960, 1600]), ("v-house", [480, 800, 1600])]


def slug_of(name):
    table = str.maketrans({"é": "e", "ü": "u", "ö": "o", "ä": "a"})
    return "t-" + name.lower().translate(table).replace(" ", "-")


def registries(real, src, test_out, site_img):
    draw.ensure()
    pics = R.Pics([site_img, HERE / "img"])
    first = next(k for k in real if not k.startswith("_"))
    made = test_out / "_data"
    made.mkdir(parents=True, exist_ok=True)
    # every built language: a stand-in says in English what it has no words for
    built = languages.Languages().built
    langs = languages.Languages()
    base = {lang: json.loads((src / "wings" / f"{first}.{lang}.json").read_text(encoding="utf-8")) for lang in built}

    def every(obj, slug=None):
        """A stand-in's words in every built language: its page and door in the language's folder, the rest in English."""
        for path, leaf in languages.leaves(obj).items():
            for code in built:
                if code in leaf:
                    continue
                if slug and path == "page":
                    leaf[code] = langs.folder(code) + slug
                elif slug and path == "door":
                    leaf[code] = f"/w/{slug}?lang={langs.door_lang(code)}"
                else:
                    leaf[code] = leaf["en"]
        return obj

    def pic(stem, widths):
        return {"stem": stem, "widths": widths, "size": list(pics.size(stem, max(widths)))}

    def life(i, state, piece_on_page=False):
        en, de, born, died = LIVES[i]
        slug = slug_of(en)
        entry = {"collection": "lives", "state": state, "name": {"en": en, "de": de or en}, "when": int(died),
                 "dates": {"en": f"{born} to {died}", "de": f"{born} bis {died}"}}
        if state != "open":
            return slug, every(entry, slug)
        hero, card = REUSE[i % 6], REUSE[(i + 3) % len(REUSE)]
        entry.update(copy.deepcopy({k: real[first][k] for k in ("wall", "about", "never_say", "claim_phrase")}))
        entry.update({
            "page": {"en": slug, "de": f"de/{slug}"}, "door": {"en": f"/w/{slug}", "de": f"/w/{slug}?lang=de"},
            "shows": {"place": {"en": "A test place", "de": "Ein Testort"}, "day": {"en": "a test day", "de": "ein Testtag"}},
            "pictures": {"hero": dict(pic(*hero), alt="first.piece.alt"), "card": dict(pic(*card), alt="card.alt"), "share": real[first]["pictures"]["share"]},
            "note": ["#9c503e", "#2f8478", "#8a6a2c", "#6a62b0", "#a0527a"][i % 5], "wall": ["wall", "deep", "lifted"][i % 3], "topics": [],
        })
        every(entry, slug)
        if piece_on_page:
            entry["pictures"]["landing"] = dict(pic(*card), alt="landing.piece.alt")
        # the first wing's words under the stand-in's name, with its own first screen and card
        for lang in built:
            d = copy.deepcopy(base[lang])
            d.pop("_copied", None)
            if piece_on_page:
                # the other way round from the stand-in animal: a piece on the wing page's place only, with a clip
                d["landing"]["piece"].pop("install", None)
                d["first"]["piece"].pop("frames", None)
                d["first"]["piece"]["install"] = {"name": "stand-in", "script": "stand-in-piece.js", "clip": "stand-in-clip.mp4",
                                                  "pause": "Pause" if lang == "en" else "Anhalten", "play": "Play" if lang == "en" else "Abspielen"}
            else:
                d.pop("landing", None)
            name = entry["name"][lang]
            d["meta"]["title"] = f"{name} | Museum of Ages"
            for at in ("first", "landing"):
                if at in d:
                    d[at]["piece"].update({"title": ("Stand-in piece for " if lang == "en" else "Platzhalter für ") + name,
                                           "kind": "Test", "what": "a reused picture" if lang == "en" else "ein wiederverwendetes Bild"})
            d["card"].update({"kind": "Test", "what": "a reused picture" if lang == "en" else "ein wiederverwendetes Bild"})
            (made / f"{slug}.{lang}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
        # the first wing's facts too, without the name of the tool that checks them against its inventory
        facts = json.loads((src / "wings" / f"{first}.facts.json").read_text(encoding="utf-8"))
        facts.pop("_made_by", None)
        for lang in built:
            own = languages.load_own(src / "wings", f"{first}.facts", lang)
            if own is not None:
                languages.merge_leaves(facts, own, lang, "")
        (made / f"{slug}.facts.json").write_text(json.dumps(every(facts), ensure_ascii=False), encoding="utf-8")
        return slug, every(entry, slug)

    def beast(name, state):
        slug = slug_of(name)
        entry = {"collection": "animals", "state": state, "name": {"en": name, "de": name}, "when": -66000000 - len(name),
                 "dates": {"en": "68 to 66 million years ago", "de": "vor 68 bis 66 Millionen Jahren"}}
        if state != "open":
            return slug, every(entry, slug)
        entry.update({
            "_data": "mustersaurus", "page": {"en": slug, "de": f"de/{slug}"}, "door": {"en": f"/w/{slug}", "de": f"/w/{slug}?lang=de"},
            "shows": {"place": {"en": "A test place", "de": "Ein Testort"}, "day": {"en": "one day in the Cretaceous", "de": "ein Tag in der Kreidezeit"}},
            "pictures": {"hero": dict(pic("t-hero", [960, 1600]), phone=pic("t-hero-m", [780, 1080]), alt="first.piece.alt"),
                         "landing": dict(pic("t-hero", [960, 1600]), phone=pic("t-hero-m", [780, 1080]), alt="landing.piece.alt"),
                         "card": dict(pic("t-card", [480, 800, 1600]), alt="card.alt"), "share": real[first]["pictures"]["share"]},
            "note": "#4f8a4a", "wall": "deep", "counts": {"stops": 9, "bones": 300}, "topics": [],
            "about": {"@type": "Thing", "name": name}, "never_say": [], "claim_phrase": "",
        })
        return slug, every(entry, slug)

    def reg(lives, animals=(), piece_on_page=None):
        out = {"_note": "TEST REGISTRY. Stand-in wings.", "_collections": copy.deepcopy(real["_collections"])}
        if animals:
            out["_collections"].append({"slug": "animals", "state": "open", "name": {"en": "Animals", "de": "Tiere"},
                                        "line": {"en": "Each wing builds one animal up: its bones, its muscles, the complete animal.",
                                                 "de": "Jeder Flügel baut ein Tier auf: die Knochen, die Muskeln, das ganze Tier."},
                                        "dates_key": {"en": "Lived", "de": "Lebte"}})
            every(out["_collections"][-1])
        out[first] = copy.deepcopy(real[first])
        for i, state in lives:
            slug, entry = life(i, state, i == piece_on_page)
            out[slug] = entry
        for name, state in animals:
            slug, entry = beast(name, state)
            out[slug] = entry
        return out

    # the stand-in animal's words in a language it has none in: its English, beside the others
    beasts = HERE / "wings"
    if any(not (beasts / f"mustersaurus.{lang}.json").exists() for lang in built):
        for lang in built:
            have = beasts / f"mustersaurus.{lang}.json"
            (made / have.name).write_bytes((have if have.exists() else beasts / "mustersaurus.en.json").read_bytes())
        beasts = made
    dirs, pic_dirs = [src / "wings", made, beasts], [HERE / "img"]
    yield "today", copy.deepcopy(real), dirs, pic_dirs
    yield "three", reg([(1, "open"), (23, "open")], piece_on_page=23), dirs, pic_dirs
    # thirty wings in one collection: twelve open, eighteen in the making
    yield "thirty", reg([(i, "open" if i in (0, 1, 3, 6, 8, 14, 17, 19, 23, 27, 29) else "making") for i in range(29)]), dirs, pic_dirs
    # two collections: five lives (three open, one in the making, one planned), four animals
    yield "two", reg([(1, "open"), (15, "making"), (23, "open"), (29, "planned")], ANIMALS), dirs, pic_dirs
