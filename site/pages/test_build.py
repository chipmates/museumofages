#!/usr/bin/env python3
"""Tests of the search pages' build.    python3 pages/test_build.py

Each test works on a copy of this folder's sources under pages/_work/test/, so no test touches
the real data files or pages/out/. The site's source and its built pages are read where they are,
so the site is built first (python3 _src/build.py). The pictures, and the last good copy of the site
where one is kept, are only read, so a test links to them.
The wings come from the site's registry: each test works on a copy of it, as the site's own build
points this build at its registry at run time.
"""
import importlib.util
import html
import json
import os
import re
import shutil
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_SRC = HERE.parent / "_src"
SITE_BUILT = HERE.parent / "dist"
WORK = HERE / "_work" / "test"
SOURCES = ["build.py", "chart.py", "template.html", "names.json", "pictures.json", "css"]
REGISTRY = SITE_SRC / "registry.json"
LINKED = ["pics", "last-good"]
# The two built pages whose header and footer the topic pages wear.
CHROME = ["what-this-museum-is", "de/was-dieses-museum-ist"]


def setUpModule():
    if not all((SITE_BUILT / page / "index.html").is_file() for page in CHROME):
        raise RuntimeError(f"the site is not built: run python3 _src/build.py first ({SITE_BUILT} lacks its statement page)")

# A second wing that exists only in these tests: it shows that nothing is built around one wing.
STAND_IN = {
    "name": {"en": "Stand-in Wing", "de": "Probeflügel"},
    "page": {"en": "stand-in", "de": "de/stand-in"},
    "door": {"en": "/w/standin", "de": "/w/standin?lang=de"},
    "about": {"@type": "Person", "name": "Nobody"},
    "never_say": [],
    "claim_phrase": "",
}


class Case(unittest.TestCase):
    def setUp(self):
        self.dir = WORK / self.id().split(".")[-1]
        shutil.rmtree(self.dir, ignore_errors=True)
        self.dir.mkdir(parents=True)
        for name in SOURCES:
            src = HERE / name
            (shutil.copytree if src.is_dir() else shutil.copy)(src, self.dir / name)
        for name in LINKED:
            if (HERE / name).is_dir():
                os.symlink(HERE / name, self.dir / name, target_is_directory=True)
        self.registry = self.dir / "registry.json"
        shutil.copy(REGISTRY, self.registry)
        for src in HERE.glob("*.??.json"):
            shutil.copy(src, self.dir / src.name)
        self.pages = sorted(p.name[:-len(".en.json")] for p in self.dir.glob("*.en.json"))
        # the first page of film pictures and the first page of a wing's works at one scale
        self.page = next(p for p in self.pages if "topic" not in self.data("en", p)["page"])
        self.works_page = next((p for p in self.pages if {b["type"] for b in self.data("en", p)["blocks"]} & {"chart", "works", "table"}), None)
        # the first page that lists its wing's works one by one, by period
        self.list_page = next((p for p in self.pages if any(b["type"] == "periods" for b in self.data("en", p)["blocks"])), None)
        # the first page whose first screen draws one wall of its wing beside a person
        self.drawing_page = next((p for p in self.pages if "drawing" in self.data("en", p)["top"]), None)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def data(self, lang, page=None):
        return json.loads((self.dir / f"{page or self.page}.{lang}.json").read_text(encoding="utf-8"))

    def page_of(self, path):
        """The data of a built page, by its main element's page label and its language."""
        text = path.read_text(encoding="utf-8")
        label = re.search(r'<main[^>]*data-page="([\w-]+)"', text).group(1)
        lang = re.search(r'<html lang="(\w+)"', text).group(1)
        return next(self.data(lang, p) for p in self.pages if self.data("en", p)["page"]["id"] == label), lang

    def making(self, data):
        """Whether a page's wing is still being built: its pages show a link out where a door would stand."""
        return self.wings()[data["page"]["wing"]].get("state") == "making"

    def save(self, lang, data, page=None):
        (self.dir / f"{page or self.page}.{lang}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def build(self, site_src=SITE_SRC, site_built=SITE_BUILT):
        spec = importlib.util.spec_from_file_location(f"build_{self.dir.name}", self.dir / "build.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.WINGS_FILE = self.registry
        # the fixtures are written in English and German: the build runs in those two, whatever else is built
        module.LANGS = tuple(c for c in module.LANGS if c in ("en", "de"))
        module.LISTED = tuple(c for c in module.LISTED if c in ("en", "de"))
        out = self.dir / "out"
        written = module.build_pages(out, site_src=site_src, site_built=site_built, quiet=True)
        return out, written

    def wings(self):
        return json.loads(self.registry.read_text(encoding="utf-8"))

    def add_wing(self, key, entry, h1):
        """A page of a wing that exists only in this test: the first page's words under another wing."""
        wings = self.wings()
        wings[key] = entry
        self.registry.write_text(json.dumps(wings, ensure_ascii=False), encoding="utf-8")
        for lang, slug in (("en", "topic"), ("de", "thema")):
            data = self.data(lang)
            data["page"].update({"wing": key, "slug": slug, "id": f"{key}-topic"})
            if h1:
                data["top"]["h1"] = h1[lang]
            self.save(lang, data, page="other")

    @staticmethod
    def own_part(text):
        return text[text.index("<main"):text.index("</main>")]

    @staticmethod
    def words(markup):
        return html.unescape(re.sub(r"<[^>]+>", " ", markup))

    def fails(self, words):
        with self.assertRaises((SystemExit, KeyError)) as caught:
            self.build()
        self.assertRegex(str(caught.exception), words)
        self.assertFalse((self.dir / "out").exists(), "a failed build wrote files")

    # ---- the build as it stands ----

    def test_builds_both_languages_with_every_check(self):
        out, written = self.build()
        self.assertEqual(len(written), 2 * len(self.pages))
        for path in written:
            text = path.read_text(encoding="utf-8")
            self.assertEqual(len(re.findall(r"<h1[\s>]", text)), 1)
            self.assertNotIn("{{", text)
            self.assertNotRegex(text, r"""["'(/]assets/""")
            self.assertEqual(text.count('http-equiv="Content-Security-Policy"'), 1)
            self.assertNotRegex(text, r"<[^>]+\sstyle=")
            self.assertNotRegex(text, r'"@type":\s*"[^"]*Museum')
            doors = re.findall(r'<a class="door"[^>]*>', text)
            if self.making(self.page_of(path)[0]):
                # a wing in the making has no door: one plain link to an open wing stands where it would
                self.assertEqual(doors, [])
                self.assertNotIn('href="/w/', text)
                outs = re.findall(r'<a class="more" href="([^"]*)" data-out="wing">', text)
                self.assertGreaterEqual(len(outs), 1)
                self.assertEqual(len(set(outs)), 1, outs)
                self.assertRegex(text, r'<main[^>]*data-page="[\w-]+"')
                continue
            self.assertEqual(len(doors), 2)
            for door in doors:
                self.assertRegex(door, r'data-page="[\w-]+"')
                self.assertRegex(door, r'data-slot="door-(answer|end)"')
            self.assertRegex(text, r'<main[^>]*data-page="[\w-]+"')
        self.assertTrue((out / "static" / "fonts" / "cardo-400.woff2").exists())

    def test_template_build_and_styles_name_no_wing(self):
        wings = json.loads(REGISTRY.read_text(encoding="utf-8"))
        names = set()
        for key, wing in wings.items():
            if key.startswith("_"):
                continue
            names.add(key)
            names |= {part.lower() for name in wing["name"].values() for part in name.split() if len(part) > 3}
        for name in ("template.html", "build.py", "chart.py", "make_pictures.py", "css/page.css", "css/chart.css", "css/list.css",
                     "css/scale.css", "css/several.css"):
            text = (HERE / name).read_text(encoding="utf-8").lower()
            for word in names:
                self.assertNotIn(word, text, f"{name} names a wing: {word}")

    # ---- a rule broken stops the build ----

    def test_key_missing_in_both_languages(self):
        for lang in ("en", "de"):
            data = self.data(lang)
            del data["top"]["door"]["note"]
            self.save(lang, data)
        self.fails(r"note")

    def test_key_missing_in_one_language(self):
        data = self.data("de")
        del data["top"]["frame"]["title"]
        self.save("de", data)
        self.fails(r"same structure")

    def test_dash_in_a_sentence(self):
        data = self.data("en")
        data["top"]["answer"] += " He drew — and wrote."
        self.save("en", data)
        self.fails(r"top\.answer")

    def test_page_speaks_of_the_code(self):
        data = self.data("de")
        data["top"]["door"]["note"] = "Eintritt frei, kein Konto. Open Source."
        self.save("de", data)
        self.fails(r"code")

    def test_free_alone(self):
        data = self.data("en")
        data["top"]["door"]["note"] = "Free, no account."
        self.save("en", data)
        self.fails(r"Free")

    def test_title_too_long(self):
        data = self.data("en")
        data["meta"]["title"] = "x" * 61
        self.save("en", data)
        self.fails(r"title is 61")

    def test_description_too_long(self):
        data = self.data("de")
        data["meta"]["description"] = "x" * 161
        self.save("de", data)
        self.fails(r"description is 161")

    def test_line_on_the_words_came_back(self):
        data = self.data("en")
        for block in data["blocks"]:
            if block["type"] == "sources":
                block["ai"] = "Written by a machine."
        self.save("en", data)
        self.fails(r"sources\.ai is gone")

    def test_colour_outside_the_tokens(self):
        sheet = self.dir / "css" / "page.css"
        sheet.write_text(sheet.read_text(encoding="utf-8") + "\n.sp-x{color:#fff}\n", encoding="utf-8")
        self.fails(r"colour")

    def test_unknown_wing(self):
        for lang in ("en", "de"):
            data = self.data(lang)
            data["page"]["wing"] = "nowhere"
            self.save(lang, data)
        self.fails(r"no such wing")

    def test_door_with_a_fragment(self):
        wings = self.wings()
        first = next(k for k in wings if not k.startswith("_"))
        wings[first]["door"]["en"] += "#s=3"
        self.registry.write_text(json.dumps(wings, ensure_ascii=False), encoding="utf-8")
        self.fails(r"plain opening")

    # ---- a page of another wing needs a wing entry and a data file, nothing else ----

    def test_a_second_wing_builds_from_data_alone(self):
        self.add_wing("standin", STAND_IN, None)
        out, written = self.build()
        self.assertEqual(len(written), 2 * len(self.pages) + 2)
        for lang, rel in (("en", "stand-in/topic/index.html"), ("de", "de/stand-in/thema/index.html")):
            text = (out / rel).read_text(encoding="utf-8")
            door = STAND_IN["door"][lang].replace("&", "&amp;")
            # every way in, the header's and the footer's too, leads to this page's own wing
            for href in re.findall(r'href="(/w/[^"]*)"', text):
                self.assertEqual(href, door)
            self.assertIn(f'<li><a href="../"><span class="nw">{STAND_IN["name"][lang]}</span></a></li>', text)
            self.assertIn('data-page="standin-topic"', text)
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S)
                               .group(1).replace("<\\/", "</"))["@graph"]
            crumbs = next(n for n in graph if n["@type"] == "BreadcrumbList")["itemListElement"]
            self.assertEqual([c["position"] for c in crumbs], [1, 2, 3])
            self.assertTrue(crumbs[1]["item"].endswith("/stand-in/"))
            self.assertEqual(crumbs[1]["name"], STAND_IN["name"][lang])
            article = next(n for n in graph if n["@type"] == "Article")
            self.assertEqual(article["about"], STAND_IN["about"])
            self.assertIn(f'<link rel="canonical" href="https://museumofages.org/{rel[:-len("index.html")]}">', text)

    # ---- a page of a wing in the making ----

    def scale_page(self, kind="bars"):
        """The first page that shows an animal at one scale beside the person, with a length bar (kind bars) or with a
        label at each of several animals (kind marks), or a skip."""
        found = next((p for p in self.pages if kind in self.data("en", p)["top"].get("scale", {})), None)
        if not found:
            self.skipTest(f"no page shows a thing at one scale with {kind}")
        return found

    def scale_pages(self):
        return [p for p in self.pages if "scale" in self.data("en", p)["top"]]

    # Each phrase a page of its wing must never carry, by its rule: the wing's, the topic's and the claim.
    NEVER = {
        "en": ["a giant great white", "the great white's ancestor", "an ancestor of the great white", "about 60 tonnes",
               "60 t", "24.3 m long", "its teeth", "its own teeth", "a top speed", "40 km/h", "25 mph",
               "it may still live", "it is still alive", "opens soon", "opens in spring", "enter the museum",
               "walk in here", "the biggest ever", "the largest ever"],
        "de": ["ein riesiger weißer Hai", "der Riesenhai", "der Vorfahr des Weißen Hais", "60 Tonnen", "24,3 m lang",
               "seine Zähne", "seine eigenen Zähne", "seine Höchstgeschwindigkeit", "40 km/h", "er lebt noch",
               "er lebt heute noch", "bald", "demnächst", "öffnet im Frühling", "ins Museum", "den Flügel betreten",
               "der größte aller Zeiten"],
    }

    def test_a_page_of_a_wing_in_the_making_refuses_each_never_say_phrase(self):
        page = self.scale_page()
        for lang, phrases in self.NEVER.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    sentence = f" {phrase[0].upper()}{phrase[1:]}."
                    for key in ("answer", "answer_more"):
                        data = json.loads(json.dumps(original))
                        data["top"][key] += sentence
                        self.save(lang, data, page)
                        self.fails(r"top\.%s (matches|carries the wing's claim phrase)" % key)
                    # and in a paragraph of the page's body the same
                    data = json.loads(json.dumps(original))
                    at = next(i for i, b in enumerate(data["blocks"]) if b.get("paras"))
                    data["blocks"][at]["paras"][0] += sentence
                    self.save(lang, data, page)
                    self.fails(r"blocks\.%d\.paras\.0 (matches|carries)" % at)
                    self.save(lang, original, page)

    def test_its_large_number_stands_only_with_its_condition(self):
        page = self.scale_page()
        for lang, condition in (("en", r"two broken (?:\w+ )?discs"), ("de", r"zwei (?:an|zer)brochenen? (?:\w+ )?Wirbel")):
            data = self.data(lang, page)
            text = json.dumps(data, ensure_ascii=False)
            if not re.search(r"\b24[.,]3\b", text):
                self.skipTest("the page names no number with a condition")
            self.assertRegex(text, condition)
            self.save(lang, json.loads(re.sub(condition, "zwei Wirbel" if lang == "de" else "two discs", text)), page)
            self.fails(r"24\[\.,\]3")
            self.save(lang, json.loads(text), page)

    # Each claim the page of several animals must never make, by its topic's rules: a famous number stands only where
    # the page says whose it is, a fact rule only where the sources carry it.
    NEVER_MARKS = {
        "en": ["Argentinosaurus was 39.7 m long", "Argentinosaurus was 40 m long", "Argentinosaurus came to 83 tonnes",
               "Argentinosaurus reached 100 tonnes", "It was the largest land animal", "The skeleton was laser-scanned in 2013",
               "Its neck rose at 60 degrees", "The Brachiosaurus in Berlin stands 13 m tall", "Brachiosaurus came to 80 tonnes",
               "Its nostrils sat on top of its head", "Brachiosaurus, the largest known dinosaur", "Our Spinosaurus is 14 m long",
               "Our Spinosaurus comes to 7 tonnes", "Spinosaurus was bigger than T. rex", "Spinosaurus could kill a T. rex",
               "SUE, the largest T. rex ever found", "SUE and her skull", "It died out 66 million years ago",
               "T. rex had a top speed of 20 km/h", "T. rex fought Triceratops", "Triceratops was 9 m long",
               "Triceratops came to 10 tonnes", "Triceratops had a long nose horn", "Ankylosaurus was 8 m long",
               "Ankylosaurus was about 10 m long", "Ankylosaurus came to 8 tonnes", "Argentinosaurus weighed 70 tonnes",
               "One shin bone was found", "The giants of Patagonia", "A monster of its time"],
        "de": ["Argentinosaurus war 39,7 m lang", "Argentinosaurus war 40 m lang", "Argentinosaurus kam auf 83 t",
               "Argentinosaurus erreichte 100 Tonnen", "Das größte Landtier", "Das Skelett wurde 2013 gescannt",
               "Der Hals stand im Winkel von 45 Grad", "Der Berliner Brachiosaurus ist 13 m hoch", "Brachiosaurus kam auf 80 t",
               "Seine Nasenlöcher lagen oben auf dem Kopf", "Der größte bekannte Dinosaurier", "Unser Spinosaurus ist 14 m lang",
               "Unser Spinosaurus kommt auf 7 t", "Der Spinosaurus war größer als der T. rex", "Er konnte einen T. rex töten",
               "SUE, der größte T. rex", "Er starb vor 66 Millionen Jahren aus", "Seine Höchstgeschwindigkeit lag bei 25 km/h",
               "Der Kampf mit dem Triceratops", "Triceratops war 9 m lang", "Triceratops kam auf 10 t", "Ein langes Nasenhorn",
               "Ankylosaurus war 8 m lang", "Ankylosaurus war etwa 10 m lang", "Ankylosaurus kam auf 8 t", "Er wog 70 t",
               "Ein Schienbein wurde gefunden", "Die Riesen Patagoniens", "Ein Monster seiner Zeit"],
    }

    def test_the_page_of_several_animals_refuses_each_never_say_phrase(self):
        page = self.scale_page("marks")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", [])
                     if t.get("count") == self.data("en", page)["page"]["topic"])
        # every rule of the topic is met by a phrase of the list, so a rule added without its phrase is seen
        for pattern, _ in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for xs in self.NEVER_MARKS.values() for x in xs), pattern)
        for lang, phrases in self.NEVER_MARKS.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # each phrase on its own: a phrase let through must not fail the next one
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    self.save(lang, original, page)
                    data = json.loads(json.dumps(original))
                    data["top"]["answer"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.answer matches")
                    self.save(lang, original, page)

    def test_a_famous_number_stands_where_the_page_says_whose_it_is(self):
        """The page names the mount's 39.7 m, the old 100 tonnes and a grown animal's 14 m on purpose: each stands
        with the words that say whose number it is. Without them, the same field stops the build."""
        page = self.scale_page("marks")
        cases = [
            (r"(?i)mounted|mount|sculpture|\bcast\b|montierte[ns]?|montage|skulptur|abguss", "thing",
             "39.7 m and 40 m are the mount's"),
            (r"(?i)mounted|mount|sculpture|\bcast\b|montierte[ns]?|montage|skulptur|abguss", "thing",
             "83 tonnes is the scanned mount's"),
            (r"1990s|1990er", "past", "100 tonnes only as the guesses of the 1990s"),
            (r"(?i)adults?|grown|just under|erwachsene[rns]?|knapp unter", "some", "14 m only for a grown Spinosaurus"),
            (r"Giraffatitan", "Brachiosaurus", "the skeleton in Berlin is Giraffatitan"),
            (r"65 (?:to|bis) 80 t", "80 t", "80 tonnes only as the end of a range"),
            (r"Longer, and most likely lighter\.|Länger, und sehr wahrscheinlich leichter\.", "Yes.", "Spinosaurus against T. rex"),
        ]
        out, _ = self.build()
        shutil.rmtree(out)
        for lang in ("en", "de"):
            original = self.data(lang, page)
            text = json.dumps(original, ensure_ascii=False)
            for condition, instead, rule in cases:
                with self.subTest(lang=lang, rule=rule):
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    def test_each_label_stands_at_its_animal(self):
        page = self.scale_page("marks")
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] != self.data("en", page)["page"]["id"]:
                continue
            seen += 1
            text = path.read_text(encoding="utf-8")
            own = self.own_part(text)
            for fig in filter(lambda f: f and f.get("marks"), (data["top"]["scale"], data["top"]["scale"].get("close"))):
                pic = data["pics"][fig["pic"]]
                figure = next(f for f in re.findall(r'<figure class="plate sc-fig.*?</figure>', own, flags=re.S)
                              if f'sc-mark--{fig["pic"]}-' in f)
                over, _, under = figure.partition('<div class="hang">')
                for mark in fig["marks"]:
                    a, b = (float(x) / 100 for x in pic["marks"][mark["span"]].split("%")[:2])
                    # the bracket spans the animal's place in the picture
                    self.assertIn(".sc-mark--%s-%s::after{left:calc(2px + (100%% - 4px) * %g);width:calc((100%% - 4px) * %g)}"
                                  % (fig["pic"], mark["span"], round(a, 4), round(b - a, 4)), text)
                    # an animal that stands behind another is named over the picture, the rest under it
                    li = '<li class="sc-mark sc-mark--%s-%s">' % (fig["pic"], mark["span"])
                    self.assertIn(li, over if mark["span"] in (pic.get("behind") or []) else under)
                    self.assertNotIn(li, under if mark["span"] in (pic.get("behind") or []) else over)
                    self.assertIn(mark["text"], re.sub(r" ([,.:)])", r"\1", " ".join(self.words(figure).replace("\u00a0", " ").split())))
                    # and each label has its lane on every screen
                    self.assertRegex(text, r"\.sc-mark--%s-%s\{grid-row:\d" % (fig["pic"], re.escape(mark["span"])))
        self.assertEqual(seen, 2)
        # a label the picture does not place stops the build
        shutil.rmtree(out)
        pic = self.data("en", page)["top"]["scale"]["pic"]
        for lang in ("en", "de"):
            data = self.data(lang, page)
            del data["pics"][pic]["marks"][data["top"]["scale"]["marks"][0]["span"]]
            self.save(lang, data, page)
        self.fails(r"the label '\w[\w-]*' needs pics")

    def test_labels_in_one_lane_keep_apart_and_animals_at_one_place_never_share_one(self):
        spec = importlib.util.spec_from_file_location("build_lanes", self.dir / "build.py")
        lib = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(lib)
        # two animals at one place, a third far off: the first two in two lanes, the third beside one of them
        items = [("a", 0.05, 0.40, None, "Argentinosaurus", "about 30.6 m"), ("b", 0.10, 0.35, None, "Triceratops", "about 6.9 m"),
                 ("c", 0.80, 0.95, None, "Spinosaurus", "about 10 m")]
        for width, one_line in ((320, False), (1200, True)):
            laid, lanes = lib.mark_lanes(items, width, one_line)
            self.assertEqual(lanes, 2)
            self.assertNotEqual(laid["a"][0], laid["b"][0])
            # the words end at the animal's end in the picture's right half, start at its start in the left half
            self.assertEqual((laid["a"][1], laid["c"][1]), ("start", "end"))
        # a label that keeps its side keeps it
        laid, _ = lib.mark_lanes([("c", 0.80, 0.95, "start", "Spinosaurus", "about 10 m")], 1200, True)
        self.assertEqual(laid["c"][1], "start")
        # the widths the labels are laid for: the narrowest phones and every width the picture's sizes name
        self.assertEqual(lib.size_bands("(min-width: 1280px) 690px, (min-width: 960px) 54vw, calc(100vw - 40px)"),
                         [(360, 320), (390, 350), (960, 518.4), (1280, 690)])

    def test_a_picture_in_the_body_follows_the_paragraph_it_shows(self):
        page = self.scale_page("marks")
        out, written = self.build()
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] != self.data("en", page)["page"]["id"]:
                continue
            own = self.own_part(path.read_text(encoding="utf-8"))
            for block in data["blocks"]:
                section = re.search(r'<section[^>]*id="%s">(.*?)</section>' % block["id"], own, flags=re.S)
                if block.get("scale", {}).get("after") is not None:
                    before = section.group(1).split("<figure", 1)[0]
                    self.assertEqual(before.count('<p class="sp-does">'), block["scale"]["after"])
                    self.assertEqual(section.group(1).count('<p class="sp-does">'), len(block["paras"]))
                # an answer of several stands under its own small heading
                for sub in block.get("subs", []):
                    self.assertRegex(section.group(1), r"<h3>%s</h3>" % re.escape(html.escape(sub["h"], quote=False)))
        shutil.rmtree(out)
        for lang in ("en", "de"):
            data = self.data(lang, page)
            next(b for b in data["blocks"] if b.get("scale", {}).get("after") is not None)["scale"]["after"] = "1"
            self.save(lang, data, page)
        self.fails(r"after names the paragraph")

    def test_the_pages_of_a_wing_in_the_making_name_each_other(self):
        pages = self.scale_pages()
        if len(pages) < 2:
            self.skipTest("one page at one scale")
        out, written = self.build()
        ids = {self.data("en", p)["page"]["id"]: p for p in pages}
        links = {}
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] not in ids:
                continue
            own = self.own_part(path.read_text(encoding="utf-8"))
            listed = re.search(r'<section class="sp-sec sc-pages sc-pages--next"[^>]*>(.*?)</section>', own, flags=re.S)
            self.assertIsNotNone(listed, path)
            rel = path.relative_to(out).parent
            links[(ids[data["page"]["id"]], lang)] = {os.path.normpath((rel / h).as_posix()) for h in re.findall(r'href="([^"#]+)"', listed.group(1))}
        for (page, lang), targets in links.items():
            others = {p for p in pages if p != page}
            built = {os.path.normpath(path.relative_to(out).parent.as_posix()) for path in written
                     if self.page_of(path)[0]["page"]["id"] in {self.data("en", o)["page"]["id"] for o in others} and self.page_of(path)[1] == lang}
            self.assertEqual(targets, built, (page, lang))

    def test_a_page_of_a_wing_in_the_making_has_no_door_and_its_link_out(self):
        page = self.scale_page()
        out, written = self.build()
        wings = self.wings()
        wing = wings[self.data("en", page)["page"]["wing"]]
        opened = [w for k, w in wings.items() if not k.startswith("_") and w.get("state", "open") == "open" and "door" in w]
        for path in written:
            data, lang = self.page_of(path)
            if not self.making(data):
                continue
            text = path.read_text(encoding="utf-8")
            # no door anywhere, the header's and the footer's included, and no address of a wing's walk
            self.assertNotIn('class="door"', text)
            self.assertNotRegex(text, r'href="[^"]*/w/')
            # the plain link leads to the page of an open wing, in the page's language
            outs = re.findall(r'<a class="more" href="([^"]*)" data-out="wing">', text)
            rel = path.relative_to(out).parent
            targets = {(rel / href).as_posix() for href in outs}
            self.assertEqual(len(targets), 1, targets)
            target = os.path.normpath(targets.pop())
            self.assertIn(target, {w["page"][lang] for w in opened}, path)
            # never asked: the edge and the question's script both read the mark
            self.assertRegex(text, r'<main[^>]*\sdata-unasked[\s>]')
            # only its own languages: no alternate, no menu entry and no link to a language it lacks
            for code in re.findall(r'hreflang="([\w-]+)"', text):
                self.assertIn(code, wing["langs"] + ["x-default"])
            self.assertNotRegex(text, r'href="[^"]*/(fr|it|es|pt-br|bg)/')

    def test_a_door_on_a_page_of_a_wing_in_the_making_stops_the_build(self):
        page = self.scale_page()
        other = self.data("en", self.page)
        for lang in ("en", "de"):
            data = self.data(lang, page)
            data["top"]["door"] = self.data(lang)["top"]["door"]
            self.save(lang, data, page)
        self.fails(r"has no door")
        del other

    def test_a_page_of_a_wing_in_the_making_needs_its_line_and_link(self):
        page = self.scale_page()
        for lang in ("en", "de"):
            data = self.data(lang, page)
            del data["top"]["out"]["link"]
            self.save(lang, data, page)
        self.fails(r"top\.out needs its line and its link")

    def test_the_parts_of_a_page_in_the_making_stand_nowhere_else(self):
        page = self.scale_page()
        for lang in ("en", "de"):
            data = self.data(lang)
            data["top"]["guess"] = self.data(lang, page)["top"]["guess"]
            self.save(lang, data)
        self.fails(r"guess stand only on a page of a wing in the making")

    def test_a_picture_at_one_scale_needs_its_person(self):
        page = self.scale_page()
        for lang in ("en", "de"):
            data = self.data(lang, page)
            del data["pics"][data["top"]["scale"]["pic"]]["person"]
            self.save(lang, data, page)
        self.fails(r"needs pics\.<name>\.person")

    def test_a_table_cell_may_stand_empty_but_never_its_first(self):
        page = self.scale_page()
        out, _ = self.build()
        shutil.rmtree(out)
        for lang in ("en", "de"):
            data = self.data(lang, page)
            block = next(b for b in data["blocks"] if b["type"] == "numbers")
            block["rows"][0]["cells"][0] = " "
            self.save(lang, data, page)
        self.fails(r"rows\.0\.cells\.0 is empty")

    def test_a_row_shorter_than_its_columns_stops_the_build(self):
        page = self.scale_page()
        for lang in ("en", "de"):
            data = self.data(lang, page)
            block = next(b for b in data["blocks"] if b["type"] == "numbers")
            block["rows"][0]["cells"].pop()
            self.save(lang, data, page)
        self.fails(r"row 0 has \d+ cells and the table \d+ columns")

    def test_a_length_bar_stands_where_its_picture_puts_it(self):
        page = self.scale_page()
        bars = self.data("en", page)["top"]["scale"].get("bars")
        if not bars:
            self.skipTest("no picture carries a length bar")
        out, written = self.build()
        pic = self.data("en", page)["top"]["scale"]["pic"]
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] != self.data("en", page)["page"]["id"]:
                continue
            text = path.read_text(encoding="utf-8")
            for bar in data["top"]["scale"]["bars"]:
                # each span is a rule of the page's own sheet, at the shares the picture's data give it
                a, b = (float(x) / 100 for x in data["pics"][pic]["spans"][bar["span"]].rstrip("%").split("% "))
                self.assertIn(".sc-bar--%s-%s{margin-left:calc(2px + (100%% - 4px) * %g);width:calc((100%% - 4px) * %g)}"
                              % (pic, bar["span"], round(a, 4), round(b - a, 4)), text)
                self.assertIn(bar["text"], self.words(self.own_part(text)).replace("\u00a0", " "))
        # a span the picture does not place stops the build
        for lang in ("en", "de"):
            data = self.data(lang, page)
            del data["pics"][pic]["spans"][bars[0]["span"]]
            self.save(lang, data, page)
        shutil.rmtree(out)
        self.fails(r"length bar's span")

    def test_each_picture_at_one_scale_leads_to_its_table_and_a_skeleton_has_its_key(self):
        ids = {self.data("en", p)["page"]["id"] for p in self.scale_pages()}
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] not in ids:
                continue
            seen += 1
            own = self.own_part(path.read_text(encoding="utf-8"))
            table = next(b["id"] for b in data["blocks"] if b["type"] == "numbers")
            self.assertIn(f'<table', own)
            self.assertIn(f'id="{table}"', own)
            figures = re.findall(r'<figure class="plate sc-fig[^"]*"[^>]*>.*?</figure>', own, flags=re.S)
            scales = [data["top"]["scale"]] + [b["scale"] for b in data["blocks"] if b.get("scale")]
            self.assertEqual(len(figures), len(scales) + sum(1 for sc in scales if sc.get("close")))
            for fig in figures:
                self.assertIn(f'<a class="sc-totable" href="#{table}">', fig)
            keys = [b["scale"]["key"] for b in data["blocks"] if b.get("scale", {}).get("key")]
            for key in keys:
                self.assertIn(html.escape(key, quote=False)[:12], own)
            # a closer panel of a figure in the page's body follows it
            closes = [b["scale"]["close"] for b in data["blocks"] if b.get("scale", {}).get("close")]
            for close in closes:
                self.assertIn(data["pics"][close["pic"]]["stem"], own)
        self.assertEqual(seen, 2 * len(ids))

    def test_the_guess_says_what_its_button_does(self):
        ids = {self.data("en", p)["page"]["id"] for p in self.scale_pages()}
        out, written = self.build()
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] not in ids:
                continue
            g = data["top"]["guess"]
            summary = re.search(r'<summary class="sc-guess__btn">(.*?)</summary>', path.read_text(encoding="utf-8"), flags=re.S).group(1)
            self.assertIn(f'<span class="sc-guess__show">{html.escape(g["button"], quote=False)}</span>', summary)
            self.assertIn(f'<span class="sc-guess__hide">{html.escape(g.get("button_open", g["button"]), quote=False)}</span>', summary)
            self.assertIn(".sc-guess__d[open] .sc-guess__show", path.read_text(encoding="utf-8"))

    def test_a_scientific_name_is_set_in_italics(self):
        names = json.loads((self.dir / "names.json").read_text(encoding="utf-8"))["names"]
        taxa = [n["text"] for n in names if n.get("taxon")]
        if not taxa:
            self.skipTest("no scientific name on the list")
        out, written = self.build()
        found = 0
        for path in written:
            own = self.own_part(path.read_text(encoding="utf-8"))
            for name in taxa:
                if name in self.words(own):
                    found += 1
                    self.assertIn(f'<i class="nw nh">{html.escape(name, quote=False)}</i>', own)
        self.assertGreaterEqual(found, 2)

    def test_the_map_credit_stands_only_where_a_picture_uses_the_map(self):
        out, written = self.build()
        for path in written:
            data, lang = self.page_of(path)
            text = path.read_text(encoding="utf-8")
            foot = re.search(r'<footer class="foot".*?</footer>', text, flags=re.S).group(0)
            if self.making(data):
                self.assertNotIn("openstreetmap.org/copyright", foot)
            elif "openstreetmap.org/copyright" in (SITE_BUILT / CHROME[0] / "index.html").read_text(encoding="utf-8"):
                self.assertIn("openstreetmap.org/copyright", foot)

    def test_an_opening_bracket_stays_on_the_line_of_its_link(self):
        out, written = self.build()
        for path in written:
            own = self.own_part(path.read_text(encoding="utf-8"))
            self.assertNotRegex(own, r'(?<!<span class="nw">)\(<a href=')

    def test_a_page_of_a_wing_in_the_making_sends_other_sites_only_its_origin(self):
        out, written = self.build()
        tag = '<meta name="referrer" content="strict-origin-when-cross-origin">'
        for path in written:
            data, lang = self.page_of(path)
            text = path.read_text(encoding="utf-8")
            self.assertEqual(text[:text.index("</head>")].count(tag), 1 if self.making(data) else 0, path)

    def test_the_share_picture_of_a_scale_page_carries_its_answer_line(self):
        spec = importlib.util.spec_from_file_location("build_share", self.dir / "build.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.WINGS_FILE = self.registry
        module.LANGS = tuple(c for c in module.LANGS if c in ("en", "de"))
        every = module.still_jobs()
        lines = 0
        for page in self.scale_pages():
            jobs = [j for j in every if j.get("page") == page and j["kind"] == "share"]
            self.assertEqual({j["lang"] for j in jobs}, {"en", "de"})
            for job in jobs:
                line = self.data(job["lang"], page)["labels"].get("og_answer")
                if line:
                    lines += 1
                    self.assertIn(html.escape(line.replace("\u00a0", " "), quote=False), job["svg"])
        if not lines:
            self.skipTest("no page gives an answer line for its share picture")

    def test_each_cell_of_the_numbers_holds_its_words_in_one_element(self):
        out, written = self.build()
        cells = 0
        for path in written:
            for cell in re.findall(r'<td data-k="[^"]*">(.*?)</td>', path.read_text(encoding="utf-8")):
                cells += 1
                # empty, or one span around the words, so a name's span never takes a grid place of its own
                if cell:
                    self.assertRegex(cell, r"^<span>.*</span>$", path)
                    self.assertNotRegex(re.sub(r"<span[^>]*>[^<]*</span>", "", cell[6:-7]), r"<", path)
        self.assertGreater(cells, 0)

    def test_a_list_of_pages_binds_each_number_to_its_unit(self):
        out, written = self.build()
        lines = 0
        for path in written:
            for line in re.findall(r'<p class="sc-item__line">(.*?)</p>', path.read_text(encoding="utf-8"), flags=re.S):
                lines += 1
                self.assertNotRegex(line, r"\d (?:m|cm|ft|t|kg)\b", path)
        self.assertGreater(lines, 0)

    def test_the_guess_follows_the_answer_and_opens_without_a_script(self):
        ids = {self.data("en", p)["page"]["id"] for p in self.scale_pages()}
        out, written = self.build()
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] not in ids:
                continue
            own = self.own_part(path.read_text(encoding="utf-8"))
            guess = data["top"]["guess"]
            answer = html.escape(data["top"]["answer"].split(".")[0], quote=False)
            self.assertLess(self.words(own).index(data["top"]["answer"].split(" ")[0]), own.index("<details"))
            details = re.search(r"<details[^>]*data-guess[^>]*>(.*?)</details>", own, flags=re.S)
            self.assertIsNotNone(details, path)
            self.assertIn(html.escape(guess["button"], quote=False), details.group(1))
            self.assertRegex(details.group(1), r"<summary[^>]*>")
            self.assertIn(guess["a"][:40], self.words(details.group(1)).replace("\u00a0", " "))
            self.assertNotIn("<script", own.replace('<script type="application/ld+json">', ""))
            # the person's height stands over the person in every picture at one scale
            self.assertGreaterEqual(own.count('class="sc-person '), 2)
            self.assertIn(html.escape(data["labels"]["person"]).replace(" ", "\u00a0"), own.replace("&nbsp;", "\u00a0"))
            del answer

    # ---- a name never breaks ----

    def test_a_name_never_breaks(self):
        out, written = self.build()
        wings = self.wings()
        for path in written:
            text = path.read_text(encoding="utf-8")
            data, lang = self.page_of(path)
            name = wings[data["page"]["wing"]]["name"][lang]
            own = self.own_part(text)
            # the site's rule that the span relies on travels with the page
            self.assertIn(".nw{white-space:nowrap}", text)
            if name not in data["top"]["h1"]:
                # a page whose heading does not name the wing keeps the name whole wherever it stands
                # whole words: a longer word that only starts with the name (Tieren) is not the name
                self.assertNotRegex(self.words(re.sub(r'<span class="nw">[^<]*</span>', " ", own)),
                                    r"(?<!\w)%s(?:'s|’s|s)?(?!\w)" % re.escape(name))
                continue
            # in the h1 the name stands with its ending in one span that cannot wrap
            h1 = re.search(r"<h1[^>]*>(.*?)</h1>", own, flags=re.S).group(1)
            kept = re.findall(r'<span class="nw">([^<]*)</span>', h1)
            self.assertEqual(len(kept), 1, h1)
            self.assertTrue(kept[0].startswith(name))
            self.assertEqual(html.unescape(re.sub(r"<[^>]+>", "", h1)), data["top"]["h1"])
            # and nowhere in the page's own part does the name stand outside such a span
            # (a wing in the making has no door, whose line names it: its heading and its crumb do)
            least = 2 if self.making(data) else 3
            self.assertGreaterEqual(len(re.findall(r'<span class="nw">%s' % re.escape(html.escape(name)), own)), least)
            loose = re.sub(r'<span class="nw">[^<]*</span>', " ", own)
            self.assertNotIn(name, self.words(loose))

    def test_a_name_never_breaks_for_any_wing(self):
        cases = {
            "short": ("Ada of Nowhere", "", True),
            "longer": ("Ada Augusta of Nowhere", ' class="sp-h1--long"', True),
            "longest": ("Ada Augusta Byron of Nowhere Hall", ' class="sp-h1--wrap"', False),
        }
        for key, (name, mark, whole) in cases.items():
            entry = dict(STAND_IN, name={"en": name, "de": name}, page={"en": key, "de": f"de/{key}"})
            self.add_wing(key, entry, {"en": f"{name}'s machines", "de": f"{name}s Maschinen"})
            out, _ = self.build()
            for lang, rel, run in (("en", f"{key}/topic/index.html", f"{name}&#x27;s"),
                                   ("de", f"de/{key}/thema/index.html", f"{name}s")):
                text = (out / rel).read_text(encoding="utf-8")
                h1 = re.search(r"<h1[^>]*>.*?</h1>", text, flags=re.S).group(0)
                self.assertTrue(h1.startswith(f"<h1{mark}>"), h1)
                # a name that fits a line is kept on it. One that fits no line may wrap, and is never hyphenated.
                self.assertIn(f'<span class="{"nw" if whole else "nh"}">{run}</span>', h1)
            shutil.rmtree(out)
            for lang in ("en", "de"):
                (self.dir / f"other.{lang}.json").unlink()

    # ---- a foreign name is never hyphenated ----

    def test_a_foreign_name_is_never_hyphenated(self):
        names = json.loads((self.dir / "names.json").read_text(encoding="utf-8"))["names"]
        out, written = self.build()
        for path in written:
            text = path.read_text(encoding="utf-8")
            data, lang = self.page_of(path)
            own = self.own_part(text)
            self.assertIn(".nh{hyphens:none", text)
            spans = re.findall(r'<(?:span|i) class="(?:nw nh|nh)"(?: lang="(\w+)")?>([^<]*)</(?:span|i)>', own)
            marked = {html.unescape(word): code for code, word in spans}
            loose = self.words(re.sub(r'<(span|i) class="(?:nw|nh|nw nh)"[^>]*>[^<]*</\1>', " ", own))
            found = 0
            for entry in names:
                name = entry["text"]
                # no name of the list stands in a sentence outside a span that forbids hyphenation
                self.assertNotRegex(loose, r"(?<!\w)%s(?!\w)" % re.escape(name))
                hits = [word for word in marked if word == name or word in (name + "s", name + "'s")]
                found += bool(hits)
                for word in hits:
                    # and it carries its language wherever that is not the page's own
                    wanted = entry.get("lang", "")
                    self.assertEqual(marked[word], "" if wanted == lang else wanted, word)
            if self.making(data):
                # a page of a wing in the making names its holders and journals in their own language
                if "scale" in data["top"]:
                    self.assertGreaterEqual(found, 8)
                continue
            self.assertGreaterEqual(found, 15)
            if self.works_page and data["page"]["id"] == self.data("en", self.works_page)["page"]["id"]:
                # a holder a page takes from its wing's facts carries the language the facts give it
                self.assertIn('<span class="nh" lang="fr">Musée du Louvre</span>', own)
                continue
            if data["page"]["id"] != self.data("en")["page"]["id"]:
                continue
            # the holders of the sources list, by name
            self.assertIn('<span class="nh" lang="it">Veneranda Biblioteca Ambrosiana</span>', own)
            self.assertIn('<span class="nh" lang="fr">Bibliothèque de l&#x27;Institut de France</span>', own)
            self.assertIn('<span class="nh" lang="es">Biblioteca Nacional de España</span>', own)
            # a person's name of the list is kept on one line as well
            self.assertRegex(own, r'<span class="nw nh" lang="it">Bartolomeo Della Valle</span>')

    def test_a_house_missing_from_the_names_stops_the_build(self):
        for lang in ("en", "de"):
            data = self.data(lang)
            for block in data["blocks"]:
                if block["type"] == "sources":
                    block["holders"][0]["name"] = "Biblioteca Inventata"
            self.save(lang, data)
        self.fails(r"Biblioteca Inventata.*names\.json")

    def test_a_link_out_must_be_https(self):
        for lang in ("en", "de"):
            data = self.data(lang)
            for block in data["blocks"]:
                if block["type"] == "sources":
                    block["editions"][0]["links"][0]["href"] = "http://example.org/"
            self.save(lang, data)
        self.fails(r"plain https address")

    # ---- the site's header, or the last good copy of it ----

    def test_the_sites_own_header_is_taken_when_its_page_is_there(self):
        site, src = self.dir / "site", self.dir / "src"
        for page in CHROME:
            (site / page).mkdir(parents=True)
            shutil.copy(SITE_BUILT / page / "index.html", site / page / "index.html")
        shutil.copytree(SITE_BUILT / "static" / "fonts", site / "static" / "fonts")
        shutil.copytree(SITE_SRC / "css", src / "css")
        for page in site.rglob("*.html"):
            page.write_text(page.read_text(encoding="utf-8").replace('<header class="masthead"', '<header class="masthead" data-test="here"'),
                            encoding="utf-8")
        out, written = self.build(site_src=src, site_built=site)
        for path in written:
            self.assertIn('data-test="here"', path.read_text(encoding="utf-8"))

    @unittest.skipUnless((HERE / "last-good").is_dir(), "needs pages/last-good/, a copy of the last whole site, which the repository does not keep")
    def test_the_last_good_copy_serves_when_the_sites_page_is_gone(self):
        empty = self.dir / "nothing"
        empty.mkdir()
        out, written = self.build(site_src=empty, site_built=empty)
        for path in written:
            text = path.read_text(encoding="utf-8")
            self.assertIn('<header class="top"', text)
            self.assertIn('<footer class="foot"', text)
        self.assertTrue((out / "static" / "fonts" / "marcellus-400.woff2").exists())


    # ---- a page of its wing's works at one scale ----

    def works_facts(self):
        """The works page's wing, its facts and the registry's topic."""
        data = self.data("en", self.works_page)
        wing = self.wings()[data["page"]["wing"]]
        topic = next(t for t in wing["topics"] if t.get("count") == data["page"]["topic"])
        facts = json.loads((SITE_SRC / "wings" / f'{data["page"]["wing"]}.facts.json').read_text(encoding="utf-8"))
        return wing, topic, facts

    def test_a_works_page_reads_every_size_stop_and_door_from_the_facts(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        out, written = self.build()
        wing, topic, facts = self.works_facts()
        for lang in ("en", "de"):
            rel = f'{wing["page"][lang].strip("/")}/{topic["slug"][lang]}/index.html'
            text = (out / rel).read_text(encoding="utf-8")
            own = self.own_part(text)
            door = wing["door"][lang].replace("&", "&amp;")
            works = facts["paintings"]
            # one row of the table per work, its height and width as the facts give them
            rows = re.findall(r"<tr><th scope=\"row\">(.*?)</tr>", own, flags=re.S)
            self.assertEqual(len(rows), len(works) + 1)
            for p, row in zip(works, rows):
                cells = re.findall(r"<td>(.*?)</td>", row, flags=re.S)
                fmt = lambda v: f"{v:g}".replace(".", "," if lang == "de" else ".")
                self.assertTrue(cells[0].startswith(fmt(p["h_cm"])) and cells[1].startswith(fmt(p["w_cm"])), (p["id"], cells[:2]))
                # and its own way into the wing, at its stop, counted as an item's door
                self.assertIn(f'href="{door}#s={p["stop"]}" data-door="item"', row)
            # every shape of the chart is its work's size, one em a metre
            for p in works:
                self.assertIn(f'width="{p["w_cm"] / 100:g}em" height="{p["h_cm"] / 100:g}em"', own)
            # the first screen's door opens the wing at the stop of the work the page is about
            mark = next(p for p in works if p["id"] == self.data(lang, self.works_page)["top"]["figure"]["work"])
            self.assertRegex(text, r'<a class="door" href="%s#s=%s"[^>]*data-door="top"' % (re.escape(door), mark["stop"]))
            # every way into the walk names its place among the count's doors
            for a in re.findall(r'<a\b[^>]*href="/w/[^"]*"[^>]*>', text):
                self.assertRegex(a, r'data-door="(top|item|end)"')

    def test_every_row_of_the_chart_opens_with_the_person(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        out, written = self.build()
        wing, topic, facts = self.works_facts()
        for lang in ("en", "de"):
            own = self.own_part((out / f'{wing["page"][lang].strip("/")}/{topic["slug"][lang]}/index.html').read_text(encoding="utf-8"))
            panel = re.search(r'<div class="sz-panel" role="img".*?<details class="sz-keys"', own, flags=re.S).group(0)
            bands = re.split(r'<div class="sz-rows sz-rows--\w">', panel)[1:]
            self.assertEqual(len(bands), 3)
            works = len({p["id"] for p in facts["paintings"]}) + 1
            for band in bands:
                rows = [r for r in re.findall(r'<div class="sz-row">(.*?)</div>', band, flags=re.S) if "<svg" in r]
                self.assertGreater(len(rows), 1)
                for row in rows:
                    self.assertTrue(row.startswith('<span class="sz-i"><svg class="sz-s sz-s--person"'), row[:80])
                # every work once in each band
                self.assertEqual(len(re.findall(r'<svg class="sz-s(?: sz-s--mark| sz-s--field)?" width', band)), works)

    def test_a_medium_stands_beside_its_title_and_names_no_work(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        out, written = self.build()
        wing, topic, facts = self.works_facts()
        for lang in ("en", "de"):
            data = self.data(lang, self.works_page)
            lines = next(b["lines"] for b in data["blocks"] if b["type"] == "works")
            media = {m.group(1) for m in (re.fullmatch(r".*?\.\s+(\w+\.)\s+\d.*", line) for line in lines) if m}
            own = self.own_part((out / f'{wing["page"][lang].strip("/")}/{topic["slug"][lang]}/index.html').read_text(encoding="utf-8"))
            slots = re.findall(r'<span class="sz-medium">(.*?)</span>', own)
            self.assertTrue(slots and set(slots) <= media, (lang, slots, media))
            # the key, the table and every link's name carry the title alone
            rest = re.sub(r' <span class="sz-medium">.*?</span>', "", own)
            for medium in media:
                self.assertNotIn(f". {medium.rstrip('.')}", rest, lang)

    def test_a_still_of_the_second_rights_tier_needs_its_source_line(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        if not any(b.get("pic") for b in self.data("en", self.works_page)["blocks"]):
            self.skipTest("the works page hangs no still of the wing")
        for lang in ("en", "de"):
            data = self.data(lang, self.works_page)
            for b in data["blocks"]:
                if b.get("pic"):
                    b["pic"].pop("src", None)
            self.save(lang, data, self.works_page)
        # a built page's checks read the written files, so this failure comes after the writing
        with self.assertRaises(SystemExit) as caught:
            self.build()
        self.assertRegex(str(caught.exception), r"second rights tier, and its label has no source line")

    def test_a_source_line_names_a_file_of_the_wings_record(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        links = [part for b in self.data("en", self.works_page)["blocks"] if b.get("pic")
                 for part in b["pic"].get("src", []) if isinstance(part, dict) and "/wiki/File:" in part["href"]]
        if not links or not (SITE_SRC.parent.parent / "museum").is_dir():
            self.skipTest("no source line links a Commons file, or the repository holds no record")
        for lang in ("en", "de"):
            data = self.data(lang, self.works_page)
            for b in data["blocks"]:
                for part in (b.get("pic") or {}).get("src", []):
                    if isinstance(part, dict) and "/wiki/File:" in part["href"]:
                        part["href"] = "https://commons.wikimedia.org/wiki/File:Not_in_the_record.jpg"
            self.save(lang, data, self.works_page)
        self.fails(r"File:Not in the record\.jpg, which .* does not name")

    def test_the_chart_picture_is_described_by_its_own_caption(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        out, written = self.build()
        wing, topic, facts = self.works_facts()
        for lang in ("en", "de"):
            text = (out / f'{wing["page"][lang].strip("/")}/{topic["slug"][lang]}/index.html').read_text(encoding="utf-8")
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            image = next(n for n in graph if n["@type"] == "ImageObject")
            chart = next(b for b in self.data(lang, self.works_page)["blocks"] if b["type"] == "chart")
            self.assertTrue(image["url"].endswith(".png"))
            self.assertEqual(image["caption"].replace(" ", " "), chart["still_caption"])

    def test_a_line_with_another_size_stops_the_build(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        data = self.data("en", self.works_page)
        block = next(b for b in data["blocks"] if b["type"] == "works")
        block["lines"][0] = re.sub(r"\d+ ×", "178 ×", block["lines"][0], count=1)
        self.save("en", data, self.works_page)
        self.fails(r"line 1 does not carry its size")

    def test_a_still_older_than_its_chart_stops_the_build(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        data = self.data("de", self.works_page)
        next(b for b in data["blocks"] if b["type"] == "chart")["still_caption"] += " Neu."
        self.save("de", data, self.works_page)
        self.fails(r"older than its chart")

    def test_the_address_is_the_topics_one_setting(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        data = self.data("en", self.works_page)
        data["page"]["slug"] = "somewhere-else"
        self.save("en", data, self.works_page)
        self.fails(r"leave the slug to the registry")

    def test_a_page_in_fewer_languages_names_only_those(self):
        if not self.works_page:
            self.skipTest("no page shows a wing's works")
        wings = self.wings()
        key = self.data("en", self.works_page)["page"]["wing"]
        topic = next(t for t in wings[key]["topics"] if t.get("count") == self.data("en", self.works_page)["page"]["topic"])
        topic["langs"] = ["en"]
        self.registry.write_text(json.dumps(wings, ensure_ascii=False), encoding="utf-8")
        # a German link to it from another page would stop the build: it goes in both languages (their structure is
        # one), its words stay
        for other, lang in ((o, l) for o in self.pages if o != self.works_page for l in ("en", "de")):
            data = self.data(lang, other)
            for b in (b for b in data["blocks"] if "paras" in b):
                b["paras"] = ["".join(x if isinstance(x, str) else x["text"] for x in p) if isinstance(p, list) and
                              any(isinstance(x, dict) and x.get("page") == self.works_page for x in p) else p for p in b.get("paras", [])]
            for b in (b for b in data["blocks"] if "links" in b):
                b["links"] = [x for x in b["links"] if x.get("page") != self.works_page]
            self.save(lang, data, other)
        out, written = self.build()
        self.assertEqual(len(written), 2 * len(self.pages) - 1)
        self.assertFalse((out / wings[key]["page"]["de"].strip("/") / topic["slug"]["de"]).exists())
        text = (out / wings[key]["page"]["en"].strip("/") / topic["slug"]["en"] / "index.html").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r'<link rel="alternate" hreflang="([\w-]+)"', text), ["en", "x-default"])
        # its way to German leads to the wing's German page
        self.assertRegex(text, r'href="(?:\.\./)+%s/" lang="de" hreflang="de"' % re.escape(wings[key]["page"]["de"].strip("/")))

    # ---- a page about one wall: its drawing, its doors to the stop, its links ----

    def drawing_facts(self):
        data = self.data("en", self.drawing_page)
        wing = self.wings()[data["page"]["wing"]]
        topic = next(t for t in wing["topics"] if (t.get("count") or t["slug"]["en"].replace("-", "_")) == data["page"]["topic"])
        facts = json.loads((SITE_SRC / "wings" / f'{data["page"]["wing"]}.facts.json').read_text(encoding="utf-8"))
        return wing, topic, facts

    def test_a_drawing_page_draws_its_wall_and_opens_the_wing_at_its_stop(self):
        if not self.drawing_page:
            self.skipTest("no page draws a wall")
        out, written = self.build()
        wing, topic, facts = self.drawing_facts()
        for lang in ("en", "de"):
            data = self.data(lang, self.drawing_page)
            text = (out / wing["page"][lang].strip("/") / topic["slug"][lang] / "index.html").read_text(encoding="utf-8")
            top = re.search(r'<header class="sp-top\b.*?</header>', text, flags=re.S).group(0)
            wall = facts["wall"][data["top"]["drawing"]["wall"]]
            # the wall at three tenths of a millimetre a unit, its size inside it, height by width
            self.assertIn(f'width="{wall["w_m"] * 1000 * 0.3:g}" height="{wall["h_m"] * 1000 * 0.3:g}"', top)
            num = lambda v: f"{v:g}".replace(".", "," if lang == "de" else ".")
            self.assertIn(f'{num(wall["h_m"])} × {num(wall["w_m"])} m</text>', top)
            self.assertNotIn("<img", top)
            # the person's floor line stops before the wall: where the wall's lower edge sits above a floor is not drawn
            wall_x = float(re.search(r'<rect class="sz-m" x="([\d.]+)"', top).group(1))
            floors = re.findall(r'<path class="sz-floor" d="M([\d.]+) [\d.]+H([\d.]+)"', top)
            self.assertEqual(len(floors), 1)
            self.assertLess(float(floors[0][1]), wall_x)
            # the table and the crown of the door's arch at the wall's scale, the hem broken where the arch comes up
            # through it, nothing of the door below the hem, the arch with its label, as the page reads them
            inside = data["top"]["drawing"].get("inside")
            if inside:
                t, a = inside["table"], inside["arch"]
                at = lambda v: f"{wall_x + v * 300:g}"
                hem, spring = f'{1450 - t["hem_m"] * 300:g}', f'{1450 - a["spring_m"] * 300:g}'
                self.assertIn(f'<path class="sz-d" d="M{at(a["from_m"])} {hem}H{at(t["from_m"])}V{1450 - t["top_m"] * 300:g}'
                              f'H{at(t["to_m"])}V{hem}H{at(a["to_m"])}"', top)
                self.assertRegex(top, r'<path class="sz-a" d="M%s %sV%sA[\d.]+ [\d.]+ 0 0 1 %s %sV%s"'
                                 % (at(a["from_m"]), hem, spring, at(a["to_m"]), spring, hem))
                for line in data["top"]["drawing"].get("arch_label", []):
                    self.assertIn(f">{html.escape(line)}</text>", top)
                # what is reconstructed is said under the drawing in words a phone shows too
                note = re.search(r'<span class="sp-frame__note">(.*?)</span>', top)
                self.assertIsNotNone(note)
                self.assertEqual(self.words(note.group(1)).strip(), data["top"]["drawing"]["note"])
                self.assertNotRegex(text, r"\.sp-frame__note\{[^}]*display:none")
            # every way into the walk opens the wing at the page's stop: the top, the part on the wing, the end
            door = re.escape(wing["door"][lang].replace("&", "&amp;") + "#s=" + data["page"]["stop"])
            for place in ("top", "item", "end"):
                self.assertRegex(text, r'<a class="(?:door|more)" href="%s"[^>]*data-door="%s"' % (door, place))
            for a in re.findall(r'<a\b[^>]*href="/w/[^"]*"[^>]*>', self.own_part(text)):
                self.assertRegex(a, r'#s=%s"' % data["page"]["stop"])
            # the page's picture in the structured data is the drawing's share picture, which is also its preview
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            image = next(n for n in graph if n["@type"] == "ImageObject")
            share = data["page"]["og_image"]["file"].replace("{lang}", lang)
            self.assertTrue(image["url"].endswith("/" + share), image["url"])
            self.assertIn(f'<meta property="og:image" content="{image["url"]}">', text)

    def test_a_link_to_another_page_leads_to_it_in_the_pages_language(self):
        if not self.drawing_page:
            self.skipTest("no page draws a wall")
        out, written = self.build()
        found = 0
        for path in written:
            for href in re.findall(r'<a (?:class="more" )?href="(\.\./[^"#]*)"', self.own_part(path.read_text(encoding="utf-8"))):
                target = (path.parent / href).resolve()
                if (target / "index.html").is_file() and str(target).startswith(str(out.resolve())):
                    lang = re.search(r'<html lang="(\w+)"', path.read_text(encoding="utf-8")).group(1)
                    self.assertIn(f'<html lang="{lang}"', (target / "index.html").read_text(encoding="utf-8"), (path, href))
                    found += 1
        # the drawing page links the works page, and the works page links it back, in both languages
        self.assertGreaterEqual(found, 4)

    def test_a_link_to_a_page_this_build_does_not_make_stops_it(self):
        if not self.drawing_page:
            self.skipTest("no page draws a wall")
        data = self.data("en", self.drawing_page)
        part = next(x for b in data["blocks"] for p in b.get("paras", []) if isinstance(p, list) for x in p if isinstance(x, dict) and "page" in x)
        part["page"] = "nowhere"
        self.save("en", data, self.drawing_page)
        self.fails(r"names the page 'nowhere', which this build does not make in en")

    def test_a_stop_or_a_wall_the_facts_do_not_have_stops_the_build(self):
        if not self.drawing_page:
            self.skipTest("no page draws a wall")
        data = self.data("de", self.drawing_page)
        data["page"]["stop"] = "nowhere"
        data["top"]["drawing"]["wall"] = "nowhere"
        self.save("de", data, self.drawing_page)
        self.fails(r"page\.stop is 'nowhere', which is no stop(.|\n)*top\.drawing\.wall is 'nowhere'")

    def test_a_drawing_older_than_its_share_picture_stops_the_build(self):
        if not self.drawing_page:
            self.skipTest("no page draws a wall")
        data = self.data("en", self.drawing_page)
        data["top"]["h1"] += " Anew"
        self.save("en", data, self.drawing_page)
        self.fails(r"the still \S+-en-1200x630\.png is older than its chart")

    def test_a_table_or_an_arch_outside_the_wall_or_one_language_apart_stops_the_build(self):
        if not self.drawing_page or "inside" not in self.data("en", self.drawing_page)["top"]["drawing"]:
            self.skipTest("no drawing shows a table and an arch")
        kept = {lang: self.data(lang, self.drawing_page) for lang in ("en", "de")}
        for lang in ("en", "de"):
            data = self.data(lang, self.drawing_page)
            data["top"]["drawing"]["inside"]["table"]["to_m"] = 99
            data["top"]["drawing"]["inside"]["arch"]["spring_m"] = 0.2
            self.save(lang, data, self.drawing_page)
        self.fails(r"top\.drawing\.inside\.table does not lie inside the wall(.|\n)*"
                   r"top\.drawing\.inside\.arch does not cut into the table from its hem")
        # each sound alone, but the English draws its arch narrower than the German
        kept["en"]["top"]["drawing"]["inside"]["arch"]["to_m"] -= 0.3
        for lang in ("en", "de"):
            self.save(lang, kept[lang], self.drawing_page)
        self.fails(r"top\.drawing\.inside differs from the en file's")

    def test_a_reconstruction_without_its_note_stops_the_build(self):
        if not self.drawing_page or "inside" not in self.data("en", self.drawing_page)["top"]["drawing"]:
            self.skipTest("no drawing shows a table and an arch")
        for lang in ("en", "de"):
            data = self.data(lang, self.drawing_page)
            data["top"]["drawing"]["note"] = " "
            self.save(lang, data, self.drawing_page)
        self.fails(r"top\.drawing\.note, which says so under the drawing, is missing")

    def test_a_german_ordinal_keeps_its_noun_and_a_long_answer_its_door(self):
        if not self.drawing_page:
            self.skipTest("no page draws a wall")
        out, written = self.build()
        wing, topic, facts = self.drawing_facts()
        de = (out / wing["page"]["de"].strip("/") / topic["slug"]["de"] / "index.html").read_text(encoding="utf-8")
        if "17." in self.data("de", self.drawing_page)["top"]["answer"]:
            self.assertIn("17.\u00a0Jahrhundert", de)
            self.assertNotIn("17. Jahrhundert", de)
        # a year that ends a sentence stays free to end a line
        spec = importlib.util.spec_from_file_location("build_ordinal", self.dir / "build.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.ORDINAL_DE.sub("x", "im Jahr 1484. Forscher"), "im Jahr 1484. Forscher")
        self.assertEqual(module.ORDINAL_DE.sub("\\1.#", "am 12. Oktober"), "am 12.#Oktober")
        # only a long answer takes the small phone's type early
        for path in written:
            text = path.read_text(encoding="utf-8")
            data, lang = self.page_of(path)
            long = module.answer_length(data["top"]) > module.LONG_ANSWER
            top = re.search(r'<header class="(sp-top[^"]*)">', text).group(1).split()
            self.assertEqual("sp-top--long" in top, long, path)

    def test_a_source_of_one_language_only_stands_in_that_language(self):
        if not self.drawing_page:
            self.skipTest("no page draws a wall")
        de = self.data("de", self.drawing_page)
        only = [r for b in de["blocks"] for r in b.get("read", []) if "only" in r]
        if not only:
            self.skipTest("no source stands in one language only")
        out, written = self.build()
        wing, topic, facts = self.drawing_facts()
        en_text = (out / wing["page"]["en"].strip("/") / topic["slug"]["en"] / "index.html").read_text(encoding="utf-8")
        de_text = (out / wing["page"]["de"].strip("/") / topic["slug"]["de"] / "index.html").read_text(encoding="utf-8")
        self.assertIn(only[0]["href"], de_text)
        self.assertNotIn(only[0]["href"], en_text)
        # marked for another language, it stops the build, and so does a source one file has and the other lacks
        shutil.rmtree(out)
        only[0]["only"] = "en"
        self.save("de", de, self.drawing_page)
        self.fails(r"an entry marked only 'en' stands in the de file")
        del only[0]["only"]
        self.save("de", de, self.drawing_page)
        self.fails(r"the two languages do not hold the same structure")

    # ---- a page that lists its wing's works one by one, by period ----

    def list_facts(self):
        data = self.data("en", self.list_page)
        wing = self.wings()[data["page"]["wing"]]
        topic = next(t for t in wing["topics"] if (t.get("count") or t["slug"]["en"].replace("-", "_")) == data["page"]["topic"])
        facts = json.loads((SITE_SRC / "wings" / f'{data["page"]["wing"]}.facts.json').read_text(encoding="utf-8"))
        return wing, topic, facts

    def list_entries(self, lang):
        return [x for b in self.data(lang, self.list_page)["blocks"] if b["type"] == "periods" for p in b["periods"] for x in p["items"]]

    def test_a_list_page_shows_each_work_as_the_facts_give_it(self):
        if not self.list_page:
            self.skipTest("no page lists its wing's works by period")
        out, written = self.build()
        wing, topic, facts = self.list_facts()
        works = {p["id"]: p for p in facts["paintings"]}
        holders = {h["id"]: h for h in facts["holders"]}
        german = {"About 1470 to 1475": "Etwa 1470 bis 1475", "About 1472": "Etwa 1472",
                  "Sixteenth century, reworked in the early seventeenth century": "16. Jahrhundert, überarbeitet im frühen 17. Jahrhundert"}
        classes = {"en": {"documented": "Documented", "disputed": "Disputed", "qualified": "Qualified attribution", "workshop": "Workshop", "copy": "Copy"},
                   "de": {"documented": "Belegt", "disputed": "Umstritten", "qualified": "Zuschreibung mit Vorbehalt", "workshop": "Werkstatt", "copy": "Kopie"}}
        for lang in ("en", "de"):
            text = (out / wing["page"][lang].strip("/") / topic["slug"][lang] / "index.html").read_text(encoding="utf-8")
            entries = re.findall(r'<li class="pt-work pt-work--\w+" id="([\w-]+)">(.*?)</li>\n(?=<li class="pt-work|  </ol>)', text, flags=re.S)
            shown = {i for i, _ in entries}
            # every work of the facts once, Ginevra's two faces in one entry, the Last Supper last
            self.assertEqual(shown - {"last-supper"}, set(works))
            self.assertEqual(entries[-1][0], "last-supper")
            for key, body in entries:
                if key == "last-supper":
                    continue
                fact, plain = works[key], lambda m: html.unescape(re.sub(r"<[^>]+>", "", m)).replace("\u00a0", " ")
                self.assertEqual(plain(re.search(r'<h4 class="pt-work__title">(.*?)</h4>', body).group(1)), fact["title"][lang], key)
                when = plain(re.search(r'<span class="pt-when">(.*?)</span><span class="pt-where">', body).group(1))
                want = fact["date"] if lang == "en" else german.get(fact["date"]) or re.sub(r"^About (\d+)(?: to (\d+))?$",
                                                                                                lambda m: "Etwa " + m.group(1) + (" bis " + m.group(2) if m.group(2) else ""), fact["date"])
                self.assertEqual(when, want, key)
                where = plain(re.search(r'<span class="pt-where">(.*?)</span></p>', body, flags=re.S).group(1))
                holder = holders[fact["holder"]]
                self.assertTrue(where.startswith(f'{holder["name"][lang]}, {holder["note"][lang]}'), (key, where))
                self.assertEqual(plain(re.search(r'<span class="pt-class">(.*?)</span>', body).group(1)), classes[lang][fact["class"]], key)
                # its door opens the wing at its stop, tagged for the count
                door = wing["door"][lang].replace("&", "&amp;")
                self.assertIn(f'href="{door}#s={fact["stop"]}" data-door="item"', body, key)
            own = self.own_part(text)
            self.assertEqual(len(re.findall(r'data-door="top"', own)), 1)
            self.assertEqual(len(re.findall(r'data-door="end"', own)), 1)
            # the works are its structured data's list, in the page's order
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            items = next(n for n in graph if n.get("@type") == "ItemList")["itemListElement"]
            self.assertEqual([i["url"].rsplit("#", 1)[1] for i in items], [i for i, _ in entries])

    def test_a_list_entry_off_the_facts_stops_the_build(self):
        if not self.list_page:
            self.skipTest("no page lists its wing's works by period")
        cases = [("de", "when", "Etwa 1471 bis 1475", r"the date"), ("en", "title", "The Baptism", r"the title"),
                 ("de", "where", "Musée du Louvre, Paris", r"where does not begin with the facts' holder"),
                 ("en", "who", "Disputed. " , r"who does not begin with the class word")]
        for lang, key, value, words in cases:
            with self.subTest(key=key):
                data = self.data(lang, self.list_page)
                entry = next(x for b in data["blocks"] if b["type"] == "periods" for p in b["periods"] for x in p["items"])
                keep = entry[key]
                entry[key] = value
                self.save(lang, data, self.list_page)
                self.fails(words)
                entry[key] = keep
                self.save(lang, data, self.list_page)
        data = self.data("en", self.list_page)
        period = next(b for b in data["blocks"] if b["type"] == "periods")["periods"][0]
        period["items"] = period["items"][1:]
        self.save("en", data, self.list_page)
        self.fails(r"the list lacks")

    def test_a_plate_without_the_line_its_record_asks_for_stops_the_build(self):
        if not self.list_page:
            self.skipTest("no page lists its wing's works by period")
        plates = {p["name"]: p for p in json.loads((self.dir / "pictures.json").read_text(encoding="utf-8"))["plates"]}

        def entry_of(data, test):
            pics = data["pics"]
            return next(x for b in data["blocks"] if b["type"] == "periods" for p in b["periods"] for x in p["items"]
                        if x.get("pic") and pics[x["pic"]]["stem"] in plates and test(plates[pics[x["pic"]]["stem"]]))

        cuts = [(lambda p: p["it108"], lambda src: [x.replace(" {museum:it108}", "") if isinstance(x, str) else x for x in src], r"Italian code"),
                (lambda p: p["tier"] == "TIER2", lambda src: [x.replace("The museum labels the reproduction, not the painting.", "") if isinstance(x, str) else x for x in src],
                 r"a plate of tier TIER2 carries"),
                (lambda p: p["licence_url"], lambda src: [x["text"] if isinstance(x, dict) and "creativecommons" in x.get("href", "") else x for x in src], r"does not link the plate's licence"),
                # a record the page reads as open at its source links the licence it reads
                (lambda p: p.get("read_as"), lambda src: [x["text"] if isinstance(x, dict) and "creativecommons" in x.get("href", "") else x for x in src], r"does not link the plate's licence"),
                (lambda p: True, lambda src: [x["text"] if isinstance(x, dict) else x for x in src], r"does not link the plate's source"),
                (lambda p: True, lambda src: [], r"without its source line"),
                # a record without a tier carries the second tier's line, never the bare line
                (lambda p: p["tier"] is None and not p.get("read_as"), lambda src: [x.replace("Non-profit cultural use.", "") if isinstance(x, str) else x for x in src],
                 r"a plate of tier none carries"),
                (lambda p: p["tier"] is None and not p.get("read_as"), lambda src: ["Public domain reproduction from ", next(x for x in src if isinstance(x, dict)), "."],
                 r"bare line of a plate without a tier"),
                # a drawing's plate carries the page's sentence for a drawing, not the painting's
                (lambda p: p.get("tier_line"), lambda src: [x.replace("not the drawing", "not the painting") if isinstance(x, str) else x for x in src],
                 r"not the drawing"),
                # a plate shown through the film's still says so first
                (lambda p: p.get("still"), lambda src: [src[0].split(". ", 1)[1]] + src[1:], r"labels\.still_open"),
                # a plate cut to the painting says so
                (lambda p: p.get("crop"), lambda src: [x.replace(" Here it is cropped to the painting.", "") if isinstance(x, str) else x for x in src],
                 r"carries labels\.salvator_line")]
        for test, cut, words in cuts:
            with self.subTest(words=words):
                data = self.data("en", self.list_page)
                entry = entry_of(data, test)
                keep = entry["src"]
                entry["src"] = cut(keep)
                self.save("en", data, self.list_page)
                self.fails(words)
                entry["src"] = keep
                self.save("en", data, self.list_page)

    def test_a_reproduction_never_stands_in_the_first_part_or_without_its_line(self):
        spec = importlib.util.spec_from_file_location("build_tier", self.dir / "build.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        plates = json.loads((self.dir / "pictures.json").read_text(encoding="utf-8"))["plates"]
        second = next(p["name"] for p in plates if p["tier"] == "TIER2")
        first = next(p["name"] for p in plates if p["tier"] == "TIER1")
        pic = lambda name: f'<picture><img src="../static/img/{name}-240.webp" alt="x" width="1" height="1"></picture>'
        top = f'<main><header class="sp-top"><figure>{pic(second)}<span class="label__src">a line</span></figure></header></main>'
        self.assertRegex(" ".join(module.check_tier(top)), r"first part shows")
        bare = f'<main><figure class="plate">{pic(first)}<figcaption class="label"></figcaption></figure></main>'
        self.assertRegex(" ".join(module.check_tier(bare)), r"a reproduction, and its label has no source line")
        loose = f'<main><p>{pic(first)}</p></main>'
        self.assertRegex(" ".join(module.check_tier(loose)), r"stands outside a plate")
        lined = f'<main><figure class="plate">{pic(second)}<figcaption><span class="label__src">Public domain work.</span></figcaption></figure></main>'
        self.assertEqual(module.check_tier(lined), [])

    def test_each_plate_agrees_with_the_museums_store_where_it_is_at_hand(self):
        store = os.environ.get("MOA_ASSET_STORE")
        if not store or not Path(store).is_dir():
            self.skipTest("MOA_ASSET_STORE does not name the museum's asset store on this machine")
        spec = importlib.util.spec_from_file_location("pictures_tool", HERE / "make_pictures.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        plates = json.loads((HERE / "pictures.json").read_text(encoding="utf-8"))["plates"]
        manifests = {}
        for plate in plates:
            wing = plate["file"].split("/", 1)[0]
            manifests.setdefault(wing, json.loads((Path(store) / wing / "manifest.json").read_text(encoding="utf-8")))
            self.assertEqual(module.plate_problems(plate, manifests[wing], store), [], plate["name"])
        # and a record that changed in the store stops the cut
        changed = dict(plates[0], tier="TIER1" if plates[0]["tier"] != "TIER1" else "TIER2")
        self.assertRegex(" ".join(module.plate_problems(changed, manifests[changed["file"].split("/", 1)[0]], store)), r"tier is")

    def borrowing_page(self):
        """The first page whose pictures take their line from where the site already says it (src_from)."""
        return next((p for p in self.pages if any(isinstance(b.get("pic"), dict) and b["pic"].get("src_from")
                                                  for b in self.data("en", p)["blocks"])), None)

    def test_a_borrowed_line_is_the_wings_or_the_footers_own_words(self):
        page = self.borrowing_page()
        if not page:
            self.skipTest("no page borrows a picture's line")
        out, _ = self.build()
        for lang in ("en", "de"):
            data = self.data(lang, page)
            text = next(t for t in (p.read_text(encoding="utf-8") for p in out.rglob("index.html"))
                        if f'data-page="{data["page"]["id"]}"' in t and f'<html lang="{lang}"' in t)
            foot = json.loads((SITE_SRC / f"words.{lang}.json").read_text(encoding="utf-8"))["footer"]
            wing = json.loads((SITE_SRC / "wings" / f'{data["page"]["wing"]}.{lang}.json').read_text(encoding="utf-8"))
            pics = [data["top"]["frame"]] + [b["pic"] for b in data["blocks"] if isinstance(b.get("pic"), dict)]
            for pic in (p for p in pics if p.get("src_from")):
                with self.subTest(lang=lang, pic=pic["pic"]):
                    stem = data["pics"][pic["pic"]]["stem"]
                    at = text.index(f"/{stem}-")
                    label = text[text.index('<span class="label__src', at):text.index("</figcaption>", at)]
                    shown = " ".join(html.unescape(re.sub(r"<[^>]+>", "", label)).replace(" ", " ").split())
                    if pic["src_from"] == "site:map":
                        said = f'{foot["data_a"]} {foot["data_osm"]} {foot["data_b"]}'
                        self.assertIn('href="https://www.openstreetmap.org/copyright"', label)
                    else:
                        said = wing
                        for key in pic["src_from"].split(":", 1)[1].split("."):
                            said = said[int(key)] if isinstance(said, list) else said[key]
                    self.assertEqual(shown, " ".join(said.replace(" ", " ").split()))

    def test_a_plate_the_wing_labels_is_shown_only_with_the_wings_line(self):
        page = self.borrowing_page()
        plates = {p["name"]: p for p in json.loads((self.dir / "pictures.json").read_text(encoding="utf-8"))["plates"] if p.get("wing_line")}
        data = {lang: self.data(lang, page) for lang in ("en", "de")} if page else {}
        en = data.get("en", {})
        plate = next((b["id"] for b in en.get("blocks", []) if isinstance(b.get("pic"), dict) and en["pics"][b["pic"]["pic"]]["stem"] in plates), None)
        other = next((b["id"] for b in en.get("blocks", []) if isinstance(b.get("pic"), dict) and b["pic"].get("src_from", "").startswith("wing:")
                      and en["pics"][b["pic"]["pic"]]["stem"] not in plates), None)
        if not plate:
            self.skipTest("no page shows a plate the wing's page labels")
        line = plates[en["pics"][next(b for b in en["blocks"] if b.get("id") == plate)["pic"]["pic"]]["stem"]]["wing_line"]
        cuts = [(plate, lambda p, d: p.update(src_from="site:map"), rf"src_from wing:{re.escape(line)}"),
                (plate, lambda p, d: p.update(src=["A line of the page's own."]), r"carries the wing page's own line"),
                (plate, lambda p, d: p.pop("src_from"), r"carries the wing page's own line"),
                (plate, lambda p, d: d["pics"][p["pic"]].update(widths=[640]), r"its widths are not its plate's"),
                # a line borrowed from a key the wing's page does not have, or from nowhere the build knows
                (other, lambda p, d: p.update(src_from="wing:end.nothing"), r"no line at end\.nothing"),
                (other, lambda p, d: p.update(src_from="site:elsewhere"), r"neither wing:<key> nor site:map")]
        for block, cut, words in cuts:
            if not block:
                continue
            with self.subTest(words=words):
                shutil.rmtree(self.dir / "out", ignore_errors=True)
                for lang in ("en", "de"):
                    changed = json.loads(json.dumps(data[lang]))
                    cut(next(b for b in changed["blocks"] if b.get("id") == block)["pic"], changed)
                    self.save(lang, changed, page)
                self.fails(words)
                for lang in ("en", "de"):
                    self.save(lang, data[lang], page)

class Built(unittest.TestCase):
    """The site as its own build wrote it (python3 _src/build.py): the topic pages with their count."""

    def test_a_topic_page_reaches_the_count_by_its_key(self):
        wings = json.loads(REGISTRY.read_text(encoding="utf-8"))
        lists = (HERE.parent / "functions" / "_count" / "lists.js").read_text(encoding="utf-8")
        kinds = json.loads(re.search(r"PAGE_KINDS = Object\.freeze\((\[.*?\])\)", lists).group(1))
        found = 0
        for key, wing in wings.items():
            if key.startswith("_") or wing.get("state") != "open":
                continue
            for topic in wing.get("topics", []):
                kind = topic.get("count") or topic["slug"]["en"].replace("-", "_")
                self.assertIn(kind, kinds)
                for lang in topic.get("langs") or ["en", "de"]:
                    page = SITE_BUILT / wing["page"][lang].strip("/") / topic["slug"][lang] / "index.html"
                    self.assertIn(f'data-count="{kind}"', page.read_text(encoding="utf-8"), page)
                    found += 1
        self.assertGreater(found, 2)

    def test_the_paintings_page_reaches_the_count_by_its_kind(self):
        lists = (HERE.parent / "functions" / "_count" / "lists.js").read_text(encoding="utf-8")
        kinds = json.loads(re.search(r"PAGE_KINDS = Object\.freeze\((\[.*?\])\)", lists).group(1))
        self.assertIn("paintings", kinds)
        for path in ("leonardo-da-vinci/paintings", "de/leonardo-da-vinci/gemaelde"):
            text = (SITE_BUILT / path / "index.html").read_text(encoding="utf-8")
            self.assertIn('data-count="paintings"', text)
            # the count reads its doors by their tags: in the page's own part one at the top, one at the end, one a work
            own = text[text.index("<main"):text.index("</main>")]
            self.assertEqual(own.count('data-door="top"'), 1)
            self.assertEqual(own.count('data-door="end"'), 1)
            self.assertEqual(own.count('data-door="item"'), 25)

    def test_a_topic_page_stands_only_in_its_languages(self):
        wings = json.loads(REGISTRY.read_text(encoding="utf-8"))
        langs = json.loads((SITE_SRC / "languages.json").read_text(encoding="utf-8"))
        for key, wing in wings.items():
            if key.startswith("_") or wing.get("state") != "open":
                continue
            for topic in wing.get("topics", []):
                if "langs" not in topic:
                    continue
                for entry in langs["languages"]:
                    if entry["code"] in topic["langs"] or entry["code"] not in langs["BUILT"]:
                        continue
                    # a built language without the page has no folder of it, and its wing's page does not link it
                    folder = SITE_BUILT / entry["folder"] / entry["slugs"]["wings"][key]
                    self.assertTrue((folder / "index.html").is_file(), folder)
                    for sub in folder.iterdir():
                        self.assertFalse(sub.is_dir() and topic["slug"]["en"] in sub.name and sub.name not in entry["slugs"].get("topics", {}).values(), sub)
                    self.assertNotIn(f'/{topic["slug"]["en"]}/"', (folder / "index.html").read_text(encoding="utf-8"))



MUSEUM_WING = HERE.parent.parent / "museum" / "src" / "wings" / "vinci"


def sentences(chunk):
    """A paragraph's sentences. A German ordinal before its month or century (2. Mai, 19. Jahrhunderts) and a king's
    number (Franz I.) end none."""
    out, start = [], 0
    for m in re.finditer(r"[.?!]\s+(?=([A-ZÄÖÜÉ0-9][\wäöüß]*))", chunk):
        word = re.search(r"(\S*)$", chunk[start:m.start()]).group(1)
        if re.fullmatch(r"[IVX]+", word) or (re.fullmatch(r"\d{1,2}", word) and re.match(r"Jahrhundert|" + "|".join(LastYears.MONTHS["de"]), m.group(1))):
            continue
        out.append(chunk[start:m.start() + 1])
        start = m.end()
    return out + [chunk[start:]]


class LastYears(unittest.TestCase):
    """The page on his last years and his grave as the site's build wrote it, read against the wing's own files.
    Every date the page shows that the wing also states is the wing's. Where the page follows a stronger source than
    the wing, the difference was settled on the page's facts sheet and is listed in SETTLED by name with its reason:
    the wing's files stay as they are until the museum's own lane revises them."""

    PATHS = {"en": "leonardo-da-vinci/death-and-grave", "de": "de/leonardo-da-vinci/tod-und-grab"}
    MONTHS = {"en": "January February March April May June July August September October November December".split(),
              "de": "Januar Februar März April Mai Juni Juli August September Oktober November Dezember".split()}
    SETTLED = {
        "Vasari's 1550": "Vasari first told the deathbed story in the Lives of 1550 and told it again in 1568. "
                         "The wing names 1568 only.",
        "the burial date as a doubted record": "12 August 1519 is known only from a copy of a register entry that "
                                               "surfaced after 1863, which Houssaye printed with the greatest reserve. "
                                               "The wing calls the entry documented.",
        "the medallion's 2000s": "The château dates the bronze medallion only to the 2000s. No source for the wing's "
                                 "single year was found.",
        "May 1517 without a day": "The first dated note at Cloux is given as the 21st and as the 22nd of May. "
                                  "The wing gives one day.",
    }
    # Dates the page shows and the wing does not state, each with where it comes from.
    PAGE_ONLY = {
        ("20 August", "20. August"): "the day of the dig in 1863, in Houssaye's own account",
        ("8 September 2026", "8. September 2026"): "the day the map data was consulted, the site's own credit line",
        ("13 October 2026", "13. Oktober 2026"): "the day the page's sources were read",
    }
    PAGE_ONLY_YEARS = {
        "1490": "the house's own date for the purchase by Charles VIII",
        "1518": "the château's feasts, the Louvre on Salaì and on the three pictures, the will's own date by the old "
                "reckoning",
        "1854": "the house's owners since then", "1862": "the state's listing of the house",
        "1954": "the house's restoration", "1869": "the château's bust in the gardens",
        "1930": "the château's word for the slab remade", "2010": "the Louvre's restoration of the Saint Anne",
        "2012": "the Louvre's restoration of the Saint Anne", "2019": "a medical paper on his hand",
        "2016": "the DNA project, as Smithsonian magazine reports it", "2026": "the sources' read date, the map data",
        "1804": "the printing of Melzi's letter",
    }
    # What a number of days reads as on the page.
    DAYS = {"en": {9: "nine days later"}, "de": {9: "Neun Tage später"}}

    @classmethod
    def setUpClass(cls):
        cls.chunks, cls.own = {}, {}
        for lang, path in cls.PATHS.items():
            text = (SITE_BUILT / path / "index.html").read_text(encoding="utf-8")
            own = re.sub(r"<(script|style)\b.*?</\1>", " ", text[text.index("<main"):text.index("</main>")], flags=re.S)
            cls.own[lang] = own
            # a reader's text: one chunk a paragraph, a heading, a part of a label or a picture's description
            alts = [html.unescape(a) for a in re.findall(r'\salt="([^"]*)"', own)]
            own = re.sub(r"</(?:p|h[1-6]|li|figcaption|dt|dd|div|section)>|<br\b[^>]*>|<span class=\"label__", "\n\\g<0>", own)
            plain = html.unescape(re.sub(r"<[^>]+>", "", own)).split("\n") + alts
            cls.chunks[lang] = [" ".join(c.replace(" ", " ").split()) for c in plain if c.strip()]
        read = lambda *parts: (MUSEUM_WING.joinpath(*parts)).read_text(encoding="utf-8")
        cls.stud = {s["id"]: s for s in json.loads(read("line", "data", "timeline.json"))["studs"]}
        cls.deathbed = json.loads(read("line", "data", "never-said.json"))["deathbed_label"]
        cls.lettering = read("grave", "lettering.ts")
        cls.story = read("story.ts")
        cls.facts = json.loads((SITE_SRC / "wings" / "vinci.facts.json").read_text(encoding="utf-8"))

    def said(self, text, pattern, what):
        """A value the wing states, read from its own words. A wing that no longer says it fails the test by name."""
        found = re.search(pattern, text)
        self.assertIsNotNone(found, f"the wing no longer says {what} ({pattern})")
        return found.groups() if len(found.groups()) > 1 else found.group(1)

    def where(self, lang, anchor):
        """Every sentence of the page that holds the anchor; at least one."""
        found = [s for c in self.chunks[lang] for s in sentences(c) if anchor in s]
        self.assertTrue(found, f"{lang}: the page has no sentence with {anchor!r}")
        return found

    def label(self, stud, lang):
        return self.stud[stud][f"date_label_{lang}"]

    def agreements(self):
        """For each language: (what, the anchor of the page's sentence, what the wing says it holds)."""
        rome = next(p for p in self.facts["periods"] if p["en"].startswith("Rome"))
        visit_age = {"en": self.said(self.story, r"a man over seventy\. He was (\d+)\.", "his age at the visit"),
                     "de": self.said(self.story, r"Mann über siebzig\. Er war (\d+)\.", "his age at the visit")}
        told, died = self.said(self.story, r"giving his age as (\d+)\. He was (\d+)\.", "Vasari's age and his")
        letter = {"en": self.said(self.stud["life-41"]["line_en"], r"letter dated (\d+ \w+)", "the letter's day"),
                  "de": self.said(self.stud["life-41"]["line_de"], r"Brief vom (\d+\. \w+)", "the letter's day")}
        act = {"en": self.said(self.deathbed["record_en"], r"on (\d+ \w+ \d{4}), the day after the death", "the royal act"),
               "de": self.said(self.deathbed["record_de"], r"Am (\d+\. \w+ \d{4}), dem Tag nach dem Tod", "the royal act")}
        salon = self.said(self.deathbed["record_en"], r"a subject in (\d{4})", "the painter of 1781")
        ingres = self.said(self.lettering, r"painter: 'INGRES · (\d{4})'", "the Ingres painting's year")
        dig = self.said(self.lettering, r"dig: '(\d{4})'", "the dig's year")
        light = self.said(self.lettering, r"diagramDate: \{ en: '([^'·]+?) ·.*?de: '([^'·]+?) ·", "the day of the model's light")
        light = dict(zip(("en", "de"), (" ".join(w.capitalize() for w in d.split()) for d in light)))
        down = {"en": {"early 1800s": "Early in the 19th century"}[self.said(self.story, r"church came down in the (early \d{4}s)", "when the church came down")],
                "de": self.said(self.story, r"Die Kirche stand bis (Anfang des \d+\. Jahrhunderts)", "when the church came down")}
        from datetime import date
        days = (date.fromisoformat(self.stud["life-41"]["date"]) - date.fromisoformat(self.stud["life-40"]["date"])).days
        en = [("Rome left", "He left Rome in", [rome["en"].split()[-1]]),
              ("the arrival", "came to Amboise, most likely", [self.label("life-37", "en")]),
              ("the visit", "a cardinal came to see him", [self.label("life-39", "en")]),
              ("the visit, in the wing", "on the day of the cardinal's visit", [self.label("life-39", "en")]),
              ("his age at the visit", "over seventy he guessed", [visit_age["en"]]),
              ("the will", "he made his will at Cloux", [self.label("life-40", "en")]),
              ("the death", "Leonardo da Vinci died on", [self.label("life-41", "en"), died]),
              ("the will to the death", "He died nine days later", [self.label("life-41", "en"), died, self.DAYS["en"][days]]),
              ("Melzi's letter", "Melzi's letter of", [letter["en"]]),
              ("Melzi's letter, the sources", "as printed in", [f'{letter["en"]} {self.stud["life-41"]["date"][:4]}']),
              ("Vasari's age", "gave Leonardo's age as", [told]),
              ("the royal act", "are dated at Saint-Germain-en-Laye", [act["en"]]),
              ("the painter of 1781", "Paris Salon of", [salon]),
              ("Ingres", "Ingres painted the scene again", [ingres]),
              ("Ingres, the label", "as the wing hangs it", [ingres]),
              ("Ingres, the description", "A reproduction of the painting of", [ingres]),
              ("the dig", "Houssaye dug on the site", [dig]),
              ("the dig, the answer", "dug up on the site in", [dig]),
              ("the move to Saint-Hubert", "were reburied in the château's chapel of Saint-Hubert", [self.label("life-49", "en")]),
              ("the model's light", "model of the low sun of", [light["en"]]),
              ("the church pulled down", "church was pulled down", [down["en"]])]
        de = [("Rome left", "Er verließ Rom", [rome["de"].split()[-1]]),
              ("the arrival", "kam nach Amboise, am ehesten", [self.label("life-37", "de")]),
              ("the visit", "kam ein Kardinal zu Besuch", [self.label("life-39", "de")]),
              ("the visit, in the wing", "am Tag des Kardinalsbesuchs", [self.label("life-39", "de")]),
              ("his age at the visit", "über siebzig, schätzte er", [visit_age["de"]]),
              ("the will", "machte er in Cloux sein Testament", [self.label("life-40", "de")]),
              ("the death", "Leonardo da Vinci starb am", [self.label("life-41", "de"), died]),
              ("the will to the death", "Neun Tage später", [self.label("life-41", "de"), died, self.DAYS["de"][days]]),
              ("Melzi's letter", "Melzis Brief vom", [letter["de"]]),
              ("Melzi's letter, the sources", "im Druck von", [f'{letter["de"]} {self.stud["life-41"]["date"][:4]}']),
              ("Vasari's age", "gab Leonardos Alter mit", [told]),
              ("the royal act", "in Saint-Germain-en-Laye bei Paris ausgestellt", [act["de"]]),
              ("the painter of 1781", "im Pariser Salon", [salon]),
              ("Ingres", "Ingres malte die Szene", [ingres]),
              ("Ingres, the label", "so wie der Flügel es", [ingres]),
              ("Ingres, the description", "Reproduktion des Gemäldes von", [ingres]),
              ("the dig", "grub Houssaye dort", [dig]),
              ("the dig, the answer", "auf dem Gelände ausgegraben", [dig]),
              ("the move to Saint-Hubert", "in der Schlosskapelle Saint-Hubert beigesetzt", [self.label("life-49", "de")]),
              ("the model's light", "Modell der tiefen Sonne vom", [light["de"]]),
              ("the church pulled down", "wurde die Kirche abgerissen", [down["de"]])]
        return {"en": en, "de": de}

    def test_the_page_reaches_the_count_and_opens_the_wing_at_the_house(self):
        lists = (HERE.parent / "functions" / "_count" / "lists.js").read_text(encoding="utf-8")
        self.assertIn("last-years", json.loads(re.search(r"PAGE_KINDS = Object\.freeze\((\[.*?\])\)", lists).group(1)))
        stops = set(self.facts["stops"])
        for lang, own in self.own.items():
            with self.subTest(lang=lang):
                self.assertIn('data-count="last-years"', (SITE_BUILT / self.PATHS[lang] / "index.html").read_text(encoding="utf-8"))
                doors = re.findall(r'<a class="[^"]*" href="([^"]*)"[^>]*data-door="(\w+)"', own)
                self.assertEqual(sorted(kind for _, kind in doors), ["end", "item", "top"])
                for href, _ in doors:
                    self.assertIn(re.search(r"#s=([\w-]+)$", href).group(1), stops, href)

    def test_the_page_and_the_leonardo_page_link_each_other(self):
        for lang, path in self.PATHS.items():
            with self.subTest(lang=lang):
                wing = (SITE_BUILT / path.rsplit("/", 1)[0] / "index.html").read_text(encoding="utf-8")
                part = wing[wing.index('id="last-house"'):]
                part = part[:part.index("</section>")]
                self.assertIn(f'/{path.rsplit("/", 1)[1]}/"', part, "the section on the house and the grave links the page")
                own = self.own[lang]
                hrefs = re.findall(r'href="([^"]+)"', own)
                self.assertTrue(any(h.rstrip("/").endswith(("leonardo-da-vinci/#wing", "../#wing")) or h == "../#wing" for h in hrefs), "the Leonardo page")
                supper = next(t for t in json.loads(REGISTRY.read_text(encoding="utf-8"))["vinci"]["topics"] if t.get("count") == "supper")
                self.assertTrue(any(h.endswith(f'/{supper["slug"][lang]}/') for h in hrefs), "the Last Supper page")
                for host in ("https://www.vinci-closluce.com/", "https://www.chateau-amboise.com/"):
                    self.assertEqual(sum(h.startswith(host) for h in hrefs), 1, host)

    def test_the_grave_court_wears_the_wing_pages_tag_and_line(self):
        for lang, own in self.own.items():
            with self.subTest(lang=lang):
                plate = json.loads((SITE_SRC / "wings" / f"vinci.{lang}.json").read_text(encoding="utf-8"))["end"]["plate"]
                figure = own[own.index("/grave-court-"):]
                figure = figure[:figure.index("</figure>")]
                self.assertEqual(html.unescape(re.search(r'<span class="tag">(.*?)<span class="vh">', figure).group(1)), plate["kind"])
                line = html.unescape(re.sub(r"<[^>]+>", "", re.search(r'<span class="label__src">(.*?)</figcaption>', figure, flags=re.S).group(1)))
                self.assertEqual(" ".join(line.replace("\u00a0", " ").split()), " ".join(plate["src"].replace("\u00a0", " ").split()))

    def test_every_date_the_wing_also_states_is_the_wings(self):
        for lang, rows in self.agreements().items():
            for what, anchor, held in rows:
                with self.subTest(lang=lang, what=what):
                    for sentence in self.where(lang, anchor):
                        for value in held:
                            self.assertIn(value, sentence)

    def test_the_settled_differences_stand_as_settled(self):
        self.assertEqual(len(self.SETTLED), 4)
        death = int(self.stud["life-41"]["date"][:4])
        wing_vasari = self.said(self.deathbed["record_en"], r"Vasari told the story in (\d{4})", "Vasari's year")
        medallion = self.said(self.lettering, r"medallion with his profile was set into the slab in (\d{4})", "the medallion's year")
        page_text = {lang: " ".join(self.chunks[lang]) for lang in self.PATHS}
        for lang in self.PATHS:
            with self.subTest(lang=lang, settled="Vasari's 1550"):
                for sentence in self.where(lang, {"en": "Vasari told it first", "de": "Vasari erzählte sie zuerst"}[lang]):
                    # the first telling, how long after the death, and the wing's own year as the second
                    for value in ("1550", str(1550 - death), wing_vasari, "1568"):
                        self.assertIn(value, sentence)
            with self.subTest(lang=lang, settled="the burial date as a doubted record"):
                burial = self.label("life-42", lang)
                doubt = {"en": ("copy", "reserve"), "de": ("Abschrift", "Zurückhaltung")}[lang]
                holding = [s for c in self.chunks[lang] for s in sentences(c) if burial in s]
                self.assertEqual(len(holding), 1, f"{burial} stands once on the page, as a doubted record")
                for word in doubt:
                    self.assertIn(word, holding[0])
            with self.subTest(lang=lang, settled="the medallion's 2000s"):
                for sentence in self.where(lang, {"en": "bronze medallion", "de": "Bronzemedaillon"}[lang]):
                    self.assertIn({"en": "2000s", "de": "2000er"}[lang], sentence)
                self.assertNotIn(medallion, page_text[lang])
            with self.subTest(lang=lang, settled="May 1517 without a day"):
                month_year = self.label("life-38", lang).split(" ", 1)[1]
                for sentence in self.where(lang, {"en": "The first note in his hand", "de": "Die erste Notiz von seiner Hand"}[lang]):
                    self.assertIn(month_year, sentence)
                    self.assertNotRegex(sentence, rf"\b\d{{1,2}}\.? {re.escape(month_year)}")
                self.assertNotIn(self.label("life-38", lang), page_text[lang])

    def test_every_dated_day_month_and_year_on_the_page_is_accounted_for(self):
        vasari = self.said(self.deathbed["record_en"], r"Vasari told the story in (\d{4})", "Vasari's year")
        settled = {lang: ["1550", vasari, self.label("life-42", lang), self.label("life-38", lang).split(" ", 1)[1]] for lang in self.PATHS}
        for lang, rows in self.agreements().items():
            months = "|".join(self.MONTHS[lang])
            known = [v for _, _, held in rows for v in held] + settled[lang] + [k[lang == "de"] for k in self.PAGE_ONLY]
            known_years = {y for v in known for y in re.findall(r"\b1[4-9]\d\d\b|\b20\d\d\b", v)} | set(self.PAGE_ONLY_YEARS)
            text = " ".join(self.chunks[lang])
            for found in sorted(set(re.findall(rf"\b\d{{1,2}}\.? (?:{months})(?: \d{{4}})?|\b(?:{months}) \d{{4}}", text))):
                with self.subTest(lang=lang, date=found):
                    self.assertTrue(any(k == found or k.startswith(found + " ") or k.endswith(" " + found) for k in known),
                                    f"{lang}: {found} is neither the wing's, settled, nor listed with its source")
            for year in sorted(set(re.findall(r"\b1[4-9]\d\d\b|\b20\d\d\b", text))):
                with self.subTest(lang=lang, year=year):
                    self.assertIn(year, known_years, f"{lang}: the year {year} is neither the wing's, settled, nor listed with its source")
            # and the lists name nothing the page no longer shows
            for listed in [k[lang == "de"] for k in self.PAGE_ONLY] + list(self.PAGE_ONLY_YEARS):
                with self.subTest(lang=lang, listed=listed):
                    self.assertIn(listed, text, f"{lang}: {listed} is listed as the page's own, and the page no longer shows it")


def _buildlib():
    spec = importlib.util.spec_from_file_location("site_buildlib_test", SITE_SRC / "buildlib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PictureLicences(unittest.TestCase):
    """Licence data in a form image search reads, only on the pictures the museum may give away (free-pictures.json)."""

    # The rights list's verdicts 2 to 4: pictures that show a reproduction, the house or its grounds (map data), the
    # sky, or the start page's view through the glass. None of them may ever carry our licence.
    NOT_OURS_ALONE = {
        "v-lisa", "v-lisa-m", "v-picture-room", "v-supper", "v-body", "v-valve", "start", "start-m", "sky",
        "house", "v-house", "v-court", "v-court-m", "court", "stair", "v-hall", "v-hall-m", "v-lion",
        "vinci-stop-hall", "vinci-view-anemometer", "vinci-view-parachute", "m-parachute", "v-codex", "v-table",
        "v-table-m", "vinci-stop-reading-table", "v-page-en", "v-page-de", "v-page-m", "grave-court",
        "v-scale-en", "v-scale-de", "v-scale-m"}
    # Of those, the rights list's verdict 2 for the house and its grounds: ours with the map data's credit.
    WITH_MAP_CREDIT = {
        "house", "v-house", "v-court", "v-court-m", "court", "stair", "v-hall", "v-hall-m", "v-lion",
        "vinci-stop-hall", "vinci-view-anemometer", "vinci-view-parachute", "m-parachute"}

    @classmethod
    def setUpClass(cls):
        cls.lib = _buildlib()
        cls.pages = sorted(SITE_BUILT.rglob("*.html"))

    def graph(self, text):
        block = re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S)
        return json.loads(block.group(1).replace("<\\/", "</")) if block else None

    def test_the_list_names_no_picture_the_rights_list_rules_out(self):
        self.assertFalse(self.lib.FREE_PICTURES & self.NOT_OURS_ALONE)
        # a still that shows a reproduction never goes, not even with the map's credit
        self.assertLessEqual(self.lib.MAP_PICTURES, self.WITH_MAP_CREDIT)
        self.assertFalse(self.lib.MAP_PICTURES & self.lib.FREE_PICTURES)

    def test_a_picture_that_rests_on_anothers_work_carries_its_credit(self):
        if not self.lib.PICTURE_CREDITS:
            self.skipTest("no picture rests on another's work")
        self.assertLessEqual(set(self.lib.PICTURE_CREDITS), self.lib.FREE_PICTURES)
        found = 0
        for path in self.pages:
            for image in self.lib.image_objects(self.graph(path.read_text(encoding="utf-8")) or {}):
                credit = self.lib.PICTURE_CREDITS.get(self.lib.picture_stem(image.get("contentUrl") or image.get("url")))
                if credit and "license" in image:
                    found += 1
                    # the other work's credit stands once, the list's own after the museum's or the page's own line in
                    # the page's language, and the licence stays the museum's
                    text = image["creditText"]
                    self.assertTrue(text.startswith(self.lib.picture_terms("en", "")["creditText"] + ", "), path)
                    self.assertEqual(text.count("Shimada"), 1, path)
                    self.assertTrue(text.endswith("(CC BY 4.0)"), path)
                    if '<html lang="de"' in path.read_text(encoding="utf-8")[:200]:
                        self.assertIn("Körperform", text, path)
                    self.assertEqual(image["license"], "https://creativecommons.org/licenses/by-sa/4.0/", path)
        self.assertGreater(found, 0)

    def test_only_the_museums_own_pictures_carry_licence_data(self):
        licensed = 0
        for path in self.pages:
            text = path.read_text(encoding="utf-8")
            self.assertEqual(self.lib.licence_problems(text, path.name), [], path)
            for image in self.lib.image_objects(self.graph(text) or {}):
                stem = self.lib.picture_stem(image.get("contentUrl") or image.get("url"))
                if "license" in image and stem in self.lib.MAP_PICTURES:
                    self.assertIn(self.lib.map_line(), image["creditText"], path)
                elif "license" in image:
                    self.assertIn(stem, self.lib.FREE_PICTURES, path)
                    self.assertNotIn(stem, self.NOT_OURS_ALONE, path)
                    licensed += 1
        self.assertGreater(licensed, 50)

    def test_a_still_of_the_house_goes_only_with_the_maps_credit(self):
        origin = "https://museumofages.org"
        court = f"{origin}/static/img/v-court-1600.webp"
        graph = {"@context": "https://schema.org", "@graph": [{"@type": "ImageObject", "@id": f"{origin}/x/#frame", "url": court, "contentUrl": court}]}
        page = (f'<img src="../static/img/v-house-800.webp"><img src="../static/img/v-lisa-1600.webp">'
                f'<script type="application/ld+json">{json.dumps(graph)}</script>')
        note = f"{origin}/what-this-museum-is/#use-our-pictures"
        given = self.lib.with_picture_rights(page, f"{origin}/x/", self.lib.picture_terms("de", note), self.lib.picture_terms("de", note, map_data=True))
        images = list(self.lib.image_objects(self.graph(given)))
        # the still the page describes takes the licence with the map's credit; a house still it only shows gets no object
        self.assertEqual([i["contentUrl"] for i in images], [court])
        self.assertEqual({k: images[0][k] for k in self.lib.LICENCE_FIELDS}, self.lib.picture_terms("de", note, map_data=True))
        self.assertTrue(images[0]["creditText"].endswith(self.lib.map_line()))
        self.assertEqual(self.lib.licence_problems(given, "page"), [])
        # without the map's credit it is found
        bare = given.replace(json.dumps(self.lib.map_line(), ensure_ascii=False)[1:-1], "")
        self.assertRegex(" ".join(self.lib.licence_problems(bare, "page")), r"v-court-1600\.webp rests on map data")
        # and with no map terms given, a page stays as it was
        self.assertEqual(self.lib.with_picture_rights(page, f"{origin}/x/", self.lib.picture_terms("de", note)), page)

    def test_the_last_years_pages_describe_their_first_picture_with_its_licence(self):
        for path in ("leonardo-da-vinci/death-and-grave", "de/leonardo-da-vinci/tod-und-grab"):
            text = (SITE_BUILT / path / "index.html").read_text(encoding="utf-8")
            frame = next(i for i in self.lib.image_objects(self.graph(text)) if i.get("@id", "").endswith("#frame"))
            self.assertIn(self.lib.picture_stem(frame["contentUrl"]), self.lib.MAP_PICTURES, path)
            self.assertTrue(all(k in frame for k in self.lib.LICENCE_FIELDS), path)
            self.assertTrue(frame["creditText"].endswith(self.lib.map_line()), path)

    def test_each_picture_of_ours_a_page_holds_carries_licence_data(self):
        # shown, linked, shared or already described: the sizes chart is linked, and its own ImageObject holds it
        for path in self.pages:
            text = path.read_text(encoding="utf-8")
            data = self.graph(text)
            if data is None:
                continue
            page_url = "https://museumofages.org/" + str(path.relative_to(SITE_BUILT)).removesuffix("index.html")
            given = {i.get("contentUrl"): i for i in self.lib.image_objects(data)}
            for url in self.lib.free_pictures_of(text, page_url, data):
                self.assertIn("license", given.get(url, {}), (path, url))
        sizes = (SITE_BUILT / "leonardo-da-vinci" / "sizes" / "index.html").read_text(encoding="utf-8")
        frame = next(i for i in self.lib.image_objects(self.graph(sizes)) if i.get("@id", "").endswith("#frame"))
        self.assertTrue(frame["contentUrl"].endswith(".png") and "license" in frame)

    def test_the_lines_to_copy_are_one_form_in_every_language(self):
        # the credit is the image data's creditText, the map line the English as written (no French spacing)
        written = json.loads((SITE_SRC / "words.en.json").read_text(encoding="utf-8"))["page_what"]["use_map"]
        for code in ("en", "de", "fr", "it", "es", "pt-BR", "bg"):
            entry = next(e for e in json.loads((SITE_SRC / "languages.json").read_text(encoding="utf-8"))["languages"] if e["code"] == code)
            text = (SITE_BUILT / entry["folder"] / entry["slugs"]["what"] / "index.html").read_text(encoding="utf-8")
            section = re.search(r'<section id="use-our-pictures">.*?</section>', text, flags=re.S).group(0)
            credit, maps = (html.unescape(re.sub(r"<[^>]+>", "", line)) for line in re.findall(r'<p class="credit"[^>]*>(.*?)</p>', section))
            self.assertEqual(credit, self.lib.picture_terms(code, "")["creditText"], code)
            self.assertEqual(maps, written, code)

    def test_licence_data_on_another_picture_is_found(self):
        image = {"@type": "ImageObject", "contentUrl": "https://museumofages.org/static/img/v-lisa-1600.webp",
                 "license": "https://creativecommons.org/licenses/by-sa/4.0/"}
        page = f'<script type="application/ld+json">{json.dumps({"@graph": [{"@type": "WebPage", "image": image}]})}</script>'
        self.assertRegex(" ".join(self.lib.licence_problems(page, "page")), r"v-lisa-1600\.webp carries licence data")

    def test_each_picture_of_ours_gets_one_object_and_another_none(self):
        origin = "https://museumofages.org"
        share = f"{origin}/static/img/og-1200x630.jpg"
        graph = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "@id": f"{origin}/x/#page", "primaryImageOfPage": {"@type": "ImageObject", "url": share}}]}
        chart = f"{origin}/static/img/vinci-sizes-chart-en-1600.png"
        graph["@graph"].append({"@type": "ImageObject", "@id": f"{origin}/x/#frame", "url": chart, "contentUrl": chart})
        page = (f'<meta property="og:image" content="{share}">'
                f'<img src="../static/img/v-works-1600.webp"><img src="../static/img/v-works-1600.webp">'
                f'<img src="../static/img/v-lisa-1600.webp"><a href="../static/img/vinci-sizes-chart-en-1600.png">chart</a>'
                f'<a href="../static/img/vinci-poster-lathe-1440.webp">lathe</a>'
                f'<script type="application/ld+json">{json.dumps(graph)}</script>')
        terms = self.lib.picture_terms("en", f"{origin}/what-this-museum-is/#use-our-pictures")
        images = list(self.lib.image_objects(self.graph(self.lib.with_picture_rights(page, f"{origin}/x/", terms))))
        urls = [i["contentUrl"] for i in images]
        self.assertEqual(sorted(urls), sorted([share, chart, f"{origin}/static/img/v-works-1600.webp",
                                               f"{origin}/static/img/vinci-poster-lathe-1440.webp"]))
        self.assertTrue(all(i["license"] == terms["license"] and i["creditText"] for i in images))
        # the share picture the page already described took the data: no second object for it
        self.assertEqual(self.graph(self.lib.with_picture_rights(page, f"{origin}/x/", terms))["@graph"][0]
                         ["primaryImageOfPage"]["license"], terms["license"])

    def test_each_licence_page_is_the_note_in_the_pages_language(self):
        langs = {e["html"]: e for e in json.loads((SITE_SRC / "languages.json").read_text(encoding="utf-8"))["languages"]}
        seen = set()
        for path in self.pages:
            text = path.read_text(encoding="utf-8")
            lang = re.search(r'<html lang="([\w-]+)"', text).group(1)
            for image in self.lib.image_objects(self.graph(text) or {}):
                if "acquireLicensePage" not in image:
                    continue
                page, _, anchor = image["acquireLicensePage"].removeprefix("https://museumofages.org/").partition("#")
                self.assertEqual(anchor, "use-our-pictures")
                self.assertEqual(page, f'{langs[lang]["folder"]}{langs[lang]["slugs"]["what"]}/', path)
                note = (SITE_BUILT / page / "index.html").read_text(encoding="utf-8")
                self.assertIn('<section id="use-our-pictures">', note)
                self.assertIn(self.lib.picture_terms(langs[lang]["code"], "")["creditText"], image["creditText"])
                seen.add(lang)
            # the footer's licence line leads to the note on every page
            if '<footer class="foot"' in text:
                self.assertRegex(text, r'<a class="foot__use" href="[^"]*#use-our-pictures">', path)
        self.assertGreaterEqual(len(seen), 7)


if __name__ == "__main__":
    unittest.main(verbosity=1)
