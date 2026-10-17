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
import urllib.parse
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
                     "css/scale.css", "css/several.css", "css/ask.css", "css/life.css"):
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

    def test_a_topic_page_without_the_day_of_its_check(self):
        for lang in ("en", "de"):
            data = self.data(lang)
            del data["page"]["checked"]
            self.save(lang, data)
        self.fails(r"page\.checked")

    def test_a_translation_checked_on_another_day(self):
        data = self.data("de")
        data["page"]["checked"] = "2026-10-01"
        self.save("de", data)
        self.fails(r"another day")

    def test_a_list_of_neighbours_without_its_heading(self):
        page = next((p for p in self.pages if any(b["type"] == "pages" for b in self.data("en", p)["blocks"])
                     and not self.data("en", p)["page"].get("hub")), None)
        if not page:
            self.skipTest("no topic page lists its neighbours")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            del next(b for b in data["blocks"] if b["type"] == "pages")["h"]
            self.save(lang, data, page)
        self.fails(r"pages\.h")

    def test_a_borrowed_picture_must_be_a_plate_of_the_wing(self):
        if "paintings" not in self.pages:
            self.skipTest("no page of the paintings")
        for lang in ("en", "de"):
            data = self.data(lang, "paintings")
            data["page"]["primary_from"] = "wing:rooms.0.plates.99"
            self.save(lang, data, "paintings")
        self.fails(r"page\.primary_from 'wing:rooms\.0\.plates\.99'")

    def test_a_pages_own_picture_of_the_second_tier_stands_on_it_with_its_source(self):
        """A film frame of the second tier the page does not show may not be its own picture (the picture room on the
        paintings page); the Mona Lisa's plate, shown with its source line, may."""
        if "paintings" not in self.pages:
            self.skipTest("no page of the paintings")
        for lang in ("en", "de"):
            data = self.data(lang, "paintings")
            data["page"]["primary_from"] = "wing:rooms.0.plates.0"
            self.save(lang, data, "paintings")
        # a built page's checks read the written files, so this failure comes after the writing
        with self.assertRaises(SystemExit) as caught:
            self.build()
        self.assertRegex(str(caught.exception), r"own picture is \['stop-picture-room'\], a frame of the second rights tier")
        self.assertNotRegex(str(caught.exception), r"mona-lisa")

    def test_a_day_that_is_no_day(self):
        data = self.data("en")
        data["page"]["published"] = "6 October 2026"
        self.save("en", data)
        self.fails(r"page\.published")

    def test_a_change_that_is_no_day(self):
        data = self.data("en")
        data["page"]["changed"] = "today"
        self.save("en", data)
        self.fails(r"page\.changed is 'today'")

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
        page = self.topic_page("biggest_dinosaurs")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", [])
                     if t.get("count") == self.data("en", page)["page"]["topic"])
        # every rule of the topic is met by a phrase of the list, so a rule added without its phrase is seen
        for pattern, *_ in topic["never_say"]:
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
        page = self.topic_page("biggest_dinosaurs")
        cases = [
            (r"(?i)mounted|mount|sculpture|\bcast\b|montierte[ns]?|montage|skulptur|abguss", "thing",
             "39.7 m and 40 m are the mount's"),
            (r"(?i)mounted|mount|sculpture|\bcast\b|montierte[ns]?|montage|skulptur|abguss", "thing",
             "83 tonnes is the scanned mount's"),
            (r"1990s|1990er", "past", "100 tonnes only as the guesses of the 1990s"),
            (r"(?i)adults?|grown|just under|erwachsene[rns]?|knapp unter", "some", "14 m only for a grown Spinosaurus"),
            (r"Giraffatitan", "Brachiosaurus", "the skeleton in Berlin is Giraffatitan"),
            (r"65 (?:to|bis) 80 t", "80 t", "80 tonnes only as the end of a range"),
            (r"Longer, and most likely lighter\.|Länger, und wahrscheinlich leichter\.", "Yes.", "Spinosaurus against T. rex"),
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

    def test_a_rule_that_names_its_languages_holds_only_there(self):
        """SUE is never she in English, and German "her" (von der Hüfte her) is no pronoun."""
        page = self.topic_page("t_rex")
        original = self.data("de", page)
        data = json.loads(json.dumps(original))
        data["top"]["out"]["text"] += " SUE, von der Hüfte her gemessen."
        self.save("de", data, page)
        out, _ = self.build()
        shutil.rmtree(out)
        self.save("de", original, page)

    def topic_page(self, count):
        """The topic page that reaches the count by this key, or a skip."""
        found = next((p for p in self.pages if self.data("en", p)["page"].get("topic") == count), None)
        if not found:
            self.skipTest(f"no page of the topic {count}")
        return found

    # Each claim the T. rex page must never make, by its topic's rules: the canon's NEVER SAY and the facts sheet's.
    NEVER_TREX = {
        "en": ["SUE, the largest T. rex ever found", "the biggest T. rex", "SUE and her skull", "It died out 66 million years ago",
               "T. rex fought Triceratops", "SUE lived beside our Triceratops", "T. rex was discovered on 12 August 1902",
               "T. rex was dark brown with stripes", "T. rex had a top speed of 20 km/h", "It could run at 25 mph",
               "SUE was 11.4 m long", "SUE weighed 9 tonnes", "It came to 9 tonnes", "It reached 15 tonnes",
               "SUE's skin was scaly", "SUE is 90 percent complete", "T. rex had feathers", "T. rex had no feathers anywhere",
               "It was killed by the asteroid", "Our model weighs about 10 tonnes", "Scotty was 13 m long", "SUE was 12.4 m long",
               "As tall as a giraffe", "SUE died at 28", "Our model is built from SUE's bones", "The skull on the mount is real",
               "The holes in its jaw were an infection", "SUE is a Tyrannosaurus imperator", "A teenage T. rex",
               "It holds a Guinness record", "Its roar shook the ground", "Its lips covered the teeth"],
        "de": ["SUE, der größte T. rex", "Er starb vor 66 Millionen Jahren aus", "Der Kampf mit dem Triceratops",
               "SUE lebte neben unserem Triceratops", "Entdeckt am 12. August 1902", "Der T. rex war braun gestreift",
               "Seine Höchstgeschwindigkeit lag bei 25 km/h", "SUE war 11,4 m lang", "SUE wog 9 Tonnen", "Er kam auf 9 t",
               "Er erreichte 15 t", "Die Haut von SUE war schuppig", "SUE ist zu 90 Prozent vollständig", "Der T. rex hatte Federn",
               "Er hatte keine Federn", "Ein Asteroid löschte ihn aus", "Unser Modell wiegt etwa 10 t", "Scotty war 13 m lang",
               "SUE war 12,4 m lang", "So hoch wie eine Giraffe", "SUE starb mit 28", "Unser Modell ist aus den Knochen von SUE gebaut",
               "Der Schädel auf der Montage ist echt", "Die Löcher im Kiefer waren eine Infektion", "Eine größere Art des T. rex",
               "Ein jugendlicher T. rex", "Ein Guinness-Rekord", "Sein Brüllen", "Die Lippen bedeckten die Zähne"],
    }

    def test_the_t_rex_page_refuses_each_never_say_phrase(self):
        page = self.topic_page("t_rex")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "t_rex")
        # every rule of the topic is met by a phrase of the list, so a rule added without its phrase is seen
        for pattern, *_ in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for xs in self.NEVER_TREX.values() for x in xs), pattern)
        for lang, phrases in self.NEVER_TREX.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # the line under the answer carries none of the words a rule lets a number stand with
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    data = json.loads(json.dumps(original))
                    data["top"]["out"]["text"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.out\.text matches")
                    self.save(lang, original, page)

    def test_a_page_that_asks_holds_its_names_by_no_break_spaces(self):
        """WebKit lets a line overflow by the mark after a nowrap name: a page with join_names, and every list of pages,
        hold a name whose only breaks are spaces by no-break spaces; a page without the flag keeps its nowrap spans."""
        page = self.topic_page("t_rex")
        out, written = self.build()
        by_id = {}
        for path in written:
            data, lang = self.page_of(path)
            by_id[(data["page"]["id"], lang)] = (data, self.own_part(path.read_text(encoding="utf-8")))
        for lang in ("en", "de"):
            data, own = by_id[(self.data(lang, page)["page"]["id"], lang)]
            self.assertTrue(data["page"].get("join_names"))
            self.assertIn('<span class="nh">T.\u00a0rex</span>', own)
            self.assertNotIn('class="nw nh">T. rex', own)
            self.assertIn('<i class="nh">Tyrannosaurus\u00a0rex</i>', own)
            # a list of pages joins its names wherever it stands: the hub and both neighbours
            items = [m.group(1) for (pid, code), (other, text) in by_id.items() if code == lang
                     for m in re.finditer(r'<h[23] class="sc-item__h"><a href="[^"]*t-rex/">(.*?)</a>', text)]
            # the hub and the eight pages that name it
            self.assertEqual(len(items), 9)
            for item in items:
                self.assertIn('<span class="nh">T.\u00a0rex</span>', item)
        # a page without the flag keeps the nowrap span in its own sentences
        kept = [own for (pid, code), (d, own) in by_id.items() if not d["page"].get("join_names") and re.search(r'class="nw nh">[^<\u00a0]+ [^<]*<', own)]
        self.assertTrue(kept)
        shutil.rmtree(out)

    def test_a_link_of_the_contents_holds_its_words_in_one_box(self):
        """A link of the page's contents is a flex box: words with a name's span in them stand in one span."""
        self.topic_page("t_rex")
        out, written = self.build()
        wrapped = 0
        for path in written:
            nav = re.search(r'<nav class="sp-toc".*?</nav>', path.read_text(encoding="utf-8"), re.S)
            for words in re.findall(r'<a href="#[\w-]+">(.*?)</a>', nav.group(0) if nav else ""):
                if "<" in words:
                    self.assertRegex(words, r"^<span>(?:[^<]|<(span|i) class=\"[\w ]+\">[^<]*</\1>)*</span>$")
                    wrapped += 1
        self.assertGreaterEqual(wrapped, 4)
        shutil.rmtree(out)

    def test_a_t_rex_number_stands_only_with_the_words_that_say_whose_it_is(self):
        """The page names our pose's 11.4 m, the 15 tonnes of a model, the 90 percent by bone volume, the 13 m of the news,
        the 9 beside the 8.8 or close to it and the lips as most likely on purpose: without those words the same fields
        stop the build."""
        page = self.topic_page("t_rex")
        cases = [
            ({"en": (r" in this pose", ""), "de": (r" in dieser Haltung", "")}, "11.4 m is our model's length"),
            ({"en": (r"\b[Mm]odel\b", "study"), "de": (r"\bModell\b", "Studie")}, "15 tonnes only as a model's guess"),
            ({"en": (r"bone volume", "count"), "de": (r"Knochenvolumen", "Zählung")}, "90 percent only by bone volume"),
            ({"en": (r"\bnews\b", "reports"), "de": (r"Nachrichten", "Berichten")}, "13 m only as the news of 2019"),
            ({"en": (r"8\.8 tonnes, ", ""), "de": (r"8,8 t, 9 US-Tonnen", "9 t")}, "never 9 tonnes flat"),
            ({"en": (r"close to (9 tonnes)", r"\1"), "de": (r"knapp (9 t)", r"\1")}, "never 9 tonnes flat"),
            ({"en": (r"most likely ", ""), "de": (r"sehr wahrscheinlich ", "")}, "the lips most likely covered the teeth"),
            ({"en": (r" that ever lived", "")}, "never the largest T. rex"),
        ]
        out, _ = self.build()
        shutil.rmtree(out)
        for subs, rule in cases:
            for lang, (condition, instead) in subs.items():
                with self.subTest(lang=lang, rule=rule):
                    original = self.data(lang, page)
                    text = json.dumps(original, ensure_ascii=False)
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    # Each claim the Spinosaurus page must never make, by its topic's rules: the canon's NEVER SAY and the facts sheet's.
    NEVER_SPINO = {
        "en": ["Our Spinosaurus is 14 m long", "Spinosaurus came to 14 m", "It is 14 m long", "Our Spinosaurus comes to 7 tonnes",
               "Spinosaurus weighed 7.4 t", "Spinosaurus was 10 m long", "Spinosaurus came to 3 to 4 tonnes",
               "Spinosaurus was 18 m long", "It reached 15 m", "It was 50 feet long", "It weighed 20 tonnes",
               "Spinosaurus was bigger than T. rex", "Spinosaurus was heavier than T. rex", "It was taller than T. rex",
               "Spinosaurus could kill a T. rex", "Who would win", "Spinosaurus met T. rex", "As in Jurassic Park III",
               "The film's 13 m animal", "Found in the Taouz region", "A full grown Spinosaurus", "The Spinosaurus skeleton",
               "A nearly complete skeleton", "The largest predator of all time", "The largest predatory dinosaur",
               "The last ones lived 94 million years ago", "An M-shaped sail", "It swam like a crocodile",
               "It hunted under water", "The first swimming dinosaur", "It walked on four legs",
               "Destroyed on 24 April 1944", "The original bones are in Munich", "The sail was 1.65 m tall",
               "Our model's hip height of 3.51 m", "It had webbed feet", "It had lips", "Like Spinosaurus mirabilis",
               "Eight times faster", "The largest T. rex", "It died out 66 million years ago", "Our T. rex weighs 9 tonnes",
               "SUE and her skull"],
        "de": ["Unser Spinosaurus ist 14 m lang", "Unser Spinosaurus kommt auf 7 t", "Spinosaurus wog 7,4 t",
               "Spinosaurus war 10 m lang", "Er kam auf 3 bis 4 t", "Spinosaurus war 18 m lang", "Er erreichte 15 m",
               "Er wog 20 t", "Der Spinosaurus war größer als der T. rex", "Er war schwerer als ein T. rex",
               "Er war höher als ein T. rex", "Er konnte einen T. rex töten", "Der Kampf der Giganten",
               "Er traf auf einen T. rex", "Wie in Jurassic Park", "Gefunden bei Taouz", "Ein ausgewachsener Spinosaurus",
               "Das Spinosaurus-Skelett", "Ein fast vollständiges Skelett", "Der größte Raubsaurier",
               "Das größte Raubtier aller Zeiten",
               "Die letzten lebten vor 94 Millionen Jahren", "Ein M-förmiges Segel", "Er schwamm wie ein Krokodil",
               "Er jagte unter Wasser", "Der erste schwimmende Dinosaurier", "Er ging auf vier Beinen",
               "Zerstört am 24. April 1944", "Die Originalknochen sind in München", "Das Segel war 1,65 m hoch",
               "Eine Hüfthöhe von 3,51 m", "Er hatte Schwimmhäute", "Er hatte Lippen", "Wie Spinosaurus mirabilis",
               "Achtmal schneller", "Der größte T. rex", "Er starb vor 66 Millionen Jahren aus", "Unser T. rex wiegt 9 t"],
    }

    def test_the_spinosaurus_page_refuses_each_never_say_phrase(self):
        page = self.topic_page("spinosaurus")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "spinosaurus")
        # every rule of the topic is met by a phrase of the list in a language it holds for, so a rule added without
        # its phrase is seen
        for pattern, _, *only in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for lang, xs in self.NEVER_SPINO.items() if not only or lang in only[0]
                                for x in xs), pattern)
        for lang, phrases in self.NEVER_SPINO.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # the line under the answer carries none of the words a rule lets a number stand with
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    data = json.loads(json.dumps(original))
                    data["top"]["out"]["text"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.out\.text matches")
                    self.save(lang, original, page)

    def test_a_spinosaurus_number_stands_only_with_the_words_that_say_whose_it_is(self):
        """The page names the adults' 14 m and the model's tonnes, our young animal's 10 m and 3 to 4 tonnes, the four
        legs of 2014, the swimming headline and the largest predator on purpose: without the words that say whose the
        number is, or what the claim was, the same fields stop the build."""
        page = self.topic_page("spinosaurus")
        cases = [
            ({"en": (r"just under 14", "14"), "de": (r"knapp unter 14", "14")}, "14 m is the largest adults' length"),
            ({"en": (r" in its pose", ""), "de": (r" in seiner Haltung", "")}, "about 10 m is our young animal's length"),
            ({"en": (r"3 to 4 t, by a model", "3 to 4 t"), "de": (r"3 bis 4 t, nach einem Modell", "3 bis 4 t")},
             "3 to 4 tonnes is our young animal's weight"),
            ({"en": (r"A headline of 2020", "A finding of 2020"), "de": (r"Eine Schlagzeile von 2020", "Ein Befund von 2020")},
             "the first swimming dinosaur only as a headline"),
            ({"en": (r"the longest meat-eating dinosaur known", "the longest"),
              "de": (r"der längste bekannte Fleischfresser", "der längste")}, "the longest meat-eating dinosaur known, never"),
            ({"en": (r"the study of 2014", "the study"), "de": (r"der Studie von 2014", "der Studie")}, "it walked on two legs"),
        ]
        out, _ = self.build()
        shutil.rmtree(out)
        for subs, rule in cases:
            for lang, (condition, instead) in subs.items():
                with self.subTest(lang=lang, rule=rule):
                    original = self.data(lang, page)
                    text = json.dumps(original, ensure_ascii=False)
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    # Each claim the woolly mammoth page must never make, by its topic's rules: the canon's NEVER SAY and the facts sheet's.
    NEVER_MAMMOTH = {
        "en": ["Mammoths died out 4,000 years ago", "The last mammoths lived on an island until 4,000 years ago",
               "They died out about 4,000 years ago", "The last mammoth died in 2000 BC",
               "They lived until 10,000 years ago", "They lived on St Paul until 5,600 years ago",
               "Mammoths lived on the mainland until 3,900 years ago",
               "Mammoths were alive when the pyramids were built", "The woolly mammoth stood 3.4 m tall",
               "Bulls reached 3.5 m", "It stood 4 m tall", "It was 4 m long", "A woolly mammoth weighed 6 tonnes",
               "Our mammoth stood about 2.7 to 2.9 m", "Our bull weighed 8 tonnes", "He weighed 4.2 tonnes",
               "He was 4.2 t", "He weighs 4.4 tonnes", "He was 2.8 m tall", "The woolly mammoth stood 2.71 m",
               "The largest mammoth ever found", "Found on 15 August 1900", "A whole frozen mammoth",
               "The museum shows him as he was found", "It was flash-frozen", "Frozen while eating",
               "Its food was unchewed", "His ears were 30 cm high", "Both tusks are his", "This is his skeleton",
               "The coat was ginger", "A skirt of hair 80 to 90 cm long", "A lighter winter coat",
               "Mammoths were the ancestors of elephants", "People hunted them out", "The climate killed them",
               "Dwarf mammoths lived on Wrangel", "Scientists want to clone a mammoth", "He was 45 to 50 years old",
               "He lived 44,000 years ago"],
        "de": ["Mammute starben vor 4.000 Jahren aus", "Die letzten lebten auf einer Insel bis vor 4.000 Jahren",
               "Sie starben vor etwa 4.000 Jahren aus", "Das letzte Mammut starb 2000 vor Christus",
               "Sie lebten bis vor 10.000 Jahren", "Auf St. Paul lebten sie bis vor 5.600 Jahren",
               "Auf dem Festland lebten Mammute bis vor 3.900 Jahren", "Mammute lebten, als die Pyramiden gebaut wurden",
               "Das Wollhaarmammut war 3,4 m hoch", "Bullen erreichten 3,5 m", "Es war 4 m hoch", "Es war 4 m lang",
               "Ein Wollhaarmammut wog 6 t", "Unser Mammut maß etwa 2,7 bis 2,9 m", "Unser Bulle wog 8 t",
               "Er wog 4,2 t", "Er kam auf 4,2 Tonnen", "Er wiegt 4,4 t", "Er war 2,8 m hoch",
               "Das Wollhaarmammut maß 2,71 m", "Das größte Mammut", "Gefunden am 15. August 1900",
               "Ein ganzes gefrorenes Mammut", "Das Museum zeigt ihn, wie er gefunden wurde", "Es wurde schockgefroren",
               "Es fror beim Fressen ein", "Das Futter war unzerkaut", "Seine Ohren waren 30 cm hoch",
               "Seine beiden Stoßzähne", "Das ist sein Skelett", "Das Fell war rotblond",
               "Ein Behang aus 80 bis 90 cm langen Haaren", "Ein helleres Winterfell",
               "Mammute waren die Vorfahren der Elefanten", "Menschen haben sie ausgerottet",
               "Zwergmammute auf der Wrangelinsel", "Forscher wollen ein Mammut klonen", "Er war 45 bis 50 Jahre alt",
               "Er lebte vor 44.000 Jahren"],
    }

    def test_the_woolly_mammoth_page_refuses_each_never_say_phrase(self):
        page = self.topic_page("woolly_mammoth")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "woolly_mammoth")
        # every rule of the topic is met by a phrase of the list in a language it holds for, so a rule added without
        # its phrase is seen
        for pattern, _, *only in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for lang, xs in self.NEVER_MAMMOTH.items() if not only or lang in only[0]
                                for x in xs), pattern)
        for lang, phrases in self.NEVER_MAMMOTH.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # the line under the answer carries none of the words a rule lets a number stand with
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    data = json.loads(json.dumps(original))
                    data["top"]["out"]["text"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.out\.text matches")
                    self.save(lang, original, page)

    def test_a_woolly_mammoth_number_stands_only_with_the_words_that_say_whose_it_is(self):
        """The page names 4,000 years, 3.4 m, 3.5 m, 6 and 8 tonnes, his 4.2 tonnes, the ginger fur, the dwarfs, the
        ancestors and the frozen meal on purpose: without the words that say whose the number is or what the claim
        was, the same fields stop the build."""
        page = self.topic_page("woolly_mammoth")
        cases = [
            ({"en": (r"about 4\.2 t with his coat", "4.2 t with his coat"), "de": (r"etwa 4,2 t mit Fell", "4,2 t mit Fell")},
             "4.2 tonnes only with about"),
            ({"en": (r"Roughly true, and only of the last known population, on Wrangel Island, about", "Roughly true, about"),
              "de": (r"Ungefähr, und nur für die letzte bekannte Population, auf der Wrangelinsel, vor etwa", "Ungefähr, vor etwa")},
             "4,000 years only for the last known population"),
            ({"en": (r"On the common size chart the 4 m animal is the southern mammoth, another species\.", "On the common size chart."),
              "de": (r"Auf der verbreiteten Größentafel ist das Tier mit 4 m das Südmammut, eine andere Art\.",
                     "Auf der verbreiteten Größentafel.")},
             "4 m tall is the southern mammoth"),
            ({"en": (r"A handbook figure of 2007 for a large bull[^\"]*", "A figure of 2007."),
              "de": (r"Eine Handbuchzahl von 2007 für einen großen Bullen[^\"]*", "Eine Zahl von 2007.")},
             "3.4 m only as the handbook's figure"),
            ({"en": (r"Maxima from the museum in St Petersburg[^\"]*", "Old figures."),
              "de": (r"Höchstwerte des Museums in St\. Petersburg[^\"]*", "Alte Zahlen.")}, "3.5 m only as the museum's maximum"),
            ({"en": (r"6 tonnes is the average of the big European bulls[^\"]*", "Both are common."),
              "de": (r"6 t ist der Durchschnitt der großen europäischen Bullen[^\"]*", "Beide sind häufig.")},
             "6 and 8 tonnes only for the big European bulls"),
            ({"en": (r"The ginger of museum hair is a burial colour: [^.]*\.", "The coat was ginger."),
              "de": (r"Das Rotblond der Haare in Museen entstand erst im gefrorenen Boden: [^.]*\.", "Das Fell war rotblond.")},
             "ginger or red only as a colour of burial"),
            ({"en": (r"and they were not dwarfs", "and they were dwarfs"), "de": (r"und Zwerge waren diese Tiere nicht", "und Zwerge waren diese Tiere")},
             "the last herd on Wrangel were not dwarfs"),
            ({"en": (r"and not their ancestor", "and their ancestor"), "de": (r"und nicht ihr Vorfahr", "und ihr Vorfahr")},
             "mammoths were not the elephants' ancestors"),
            ({"en": (r"by the radiocarbon date of the museum", "by the museum"), "de": (r"nach der Radiokarbondatierung des Museums", "nach dem Museum")},
             "about 44,000 years only by the museum's radiocarbon date"),
            ({"en": (r"About 45 to 50 years", "45 to 50 years"), "de": (r"Etwa 45 bis 50 Jahre", "45 bis 50 Jahre")},
             "45 to 50 years only with about"),
            ({"en": (r"Our bull had grass between his teeth\. [^\"]*", "It froze on the spot while eating."),
              "de": (r"Unser Bulle hatte Gras zwischen den Zähnen\. [^\"]*", "Es fror beim Fressen ein.")},
             "not frozen in an instant or while eating"),
            ({"en": (r"The museum that holds our bull gives this figure[^\"]*", "A figure."),
              "de": (r"Diese Zahl nennt das Museum, das unseren Bullen bewahrt[^\"]*", "Eine Zahl.")},
             "no skirt of hair 80 to 90 cm"),
        ]
        out, _ = self.build()
        shutil.rmtree(out)
        for subs, rule in cases:
            for lang, (condition, instead) in subs.items():
                with self.subTest(lang=lang, rule=rule):
                    original = self.data(lang, page)
                    text = json.dumps(original, ensure_ascii=False)
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    # Each claim the Brachiosaurus page must never make, by its topic's rules: the canon's NEVER SAY and the facts sheet's.
    NEVER_BRACHIO = {
        "en": ["The Berlin Brachiosaurus", "The Brachiosaurus skeleton in Berlin",
               "Brachiosaurus brancai stands in Berlin", "Brachiosaurus stood 13 m tall", "Its head was 12 m up",
               "It was 13.27 m tall", "Brachiosaurus held its head 11.8 m up", "Our Brachiosaurus is 11.8 m tall",
               "It was 16 m tall", "It stood 14 m high", "It was 23 metres tall", "Brachiosaurus was 21.5 m long",
               "It was 24.4 m long", "Brachiosaurus held its neck at 42 degrees", "No neck of it was ever found",
               "No neck bone of Brachiosaurus has been found", "Brachiosaurus came to 80 tonnes", "It came to 78 tonnes",
               "Brachiosaurus reached up to 50 tonnes", "It was about 23 to 38 tonnes", "It came to 38 tonnes",
               "It was 22.46 m long", "It had a 9 m neck", "Its neck was about 9 m long",
               "Brachiosaurus weighed 35 tonnes", "Our Brachiosaurus weighs 44 tonnes", "Our model weighs about 40 t",
               "Ultrasaurus was a bigger Brachiosaurus", "It reached over 100 tonnes",
               "The upper arm bone is 2.04 m long", "A nearly complete skeleton was found",
               "Its measured length is 25 m", "The Chicago animal was full-grown", "It was an adult",
               "Both hip blades were found complete", "Its right coracoid was found",
               "Its skeleton is on show in Chicago", "Its real bones are on show", "Our Brachiosaurus skeleton",
               "Its bones were dug up at Tendaguru by the museum", "Brachiosaurus was the largest known dinosaur",
               "It was the biggest dinosaur", "Brachiosaurus was the tallest dinosaur",
               "Brachiosaurus was the tallest dinosaur, wasn't it?",
               "Its nostrils were on top of its head", "It had a hand like an elephant's", "Sauropods were brown",
               "It was green", "It lived in water", "It snorkelled", "It reared up on its hind legs to feed",
               "Its front legs were sprawling", "It had 14 neck vertebrae", "It had a second brain",
               "The film's Brachiosaurus is Giraffatitan", "It lived 150 million years ago",
               "It lived 155.6 million years ago", "It lived 154 to 153 million years ago",
               "It died out 145 million years ago", "Its last fossils are 145 million years old"],
        "de": ["Der Berliner Brachiosaurus", "Das Brachiosaurus-Skelett in Berlin",
               "Brachiosaurus brancai steht in Berlin", "Der Brachiosaurus war 13 m hoch", "Sein Kopf stand 12 m hoch",
               "Er war 13,27 m hoch", "Der Brachiosaurus trug den Kopf 11,8 m hoch",
               "Unser Brachiosaurus ist 11,8 m hoch", "Er war 16 m hoch", "Der Brachiosaurus war 14 m hoch",
               "Er war 23 Meter hoch", "Der Brachiosaurus war 21,5 m lang", "Er war 24,4 m lang",
               "Der Brachiosaurus trug den Hals in 42 Grad", "Von ihm wurde nie ein Hals gefunden",
               "Kein Halswirbel wurde je gefunden", "Der Brachiosaurus kam auf 80 t", "Er kam auf 78 Tonnen",
               "Ein Brachiosaurus kam auf bis zu 50 t", "Er kam auf etwa 23 bis 38 t", "Er kam auf 38 t",
               "Er war 22,46 m lang", "Er hatte einen 9 m langen Hals", "Sein Hals war etwa 9 m lang",
               "Der Brachiosaurus wog 35 t", "Unser Brachiosaurus wiegt 44 t", "Unser Modell wiegt etwa 40 t",
               "Ultrasaurus war ein größerer Brachiosaurus", "Er kam auf über 100 t",
               "Der Oberarmknochen ist 2,04 m lang", "Ein fast vollständiges Skelett",
               "Seine gemessene Länge beträgt 25 m", "Das Tier aus Chicago war ausgewachsen",
               "Es war ein erwachsenes Tier", "Beide Darmbeine wurden vollständig gefunden",
               "Das rechte Rabenbein wurde gefunden", "Sein Skelett ist in Chicago zu sehen",
               "Seine echten Knochen werden ausgestellt", "Unser Brachiosaurus-Skelett",
               "Die Knochen wurden am Tendaguru von Forschern des Museums ausgegraben",
               "Der Brachiosaurus war der größte bekannte Dinosaurier", "Er war der größte Dinosaurier",
               "Der Brachiosaurus war der höchste Dinosaurier", "Der Brachiosaurus war der höchste Dinosaurier, oder?",
               "Die Nasenlöcher saßen oben auf dem Kopf",
               "Eine Hand wie die eines Elefanten", "Sauropoden waren braun", "Er war grün", "Er lebte im Wasser",
               "Er schnorchelte", "Er stellte sich auf die Hinterbeine, um zu fressen",
               "Er hatte gespreizte Vorderbeine", "Er hatte 14 Halswirbel", "Er hatte ein zweites Gehirn",
               "Der Brachiosaurus im Film ist ein Giraffatitan", "Er lebte vor 150 Millionen Jahren",
               "Er lebte vor 155,6 Millionen Jahren", "Er lebte vor 154 bis 153 Millionen Jahren",
               "Er starb vor 145 Millionen Jahren aus", "Seine letzten Fossilien sind 145 Millionen Jahre alt"],
    }

    def test_the_brachiosaurus_page_refuses_each_never_say_phrase(self):
        page = self.topic_page("brachiosaurus")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "brachiosaurus")
        # every rule of the topic is met by a phrase of the list in a language it holds for, so a rule added without
        # its phrase is seen
        for pattern, _, *only in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for lang, xs in self.NEVER_BRACHIO.items() if not only or lang in only[0]
                                for x in xs), pattern)
        for lang, phrases in self.NEVER_BRACHIO.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # the line under the answer carries none of the words a rule lets a number stand with
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    data = json.loads(json.dumps(original))
                    data["top"]["out"]["text"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.out\.text matches")
                    self.save(lang, original, page)

    def test_the_brachiosaurus_page_asks_about_the_tallest_dinosaur_but_never_says_it(self):
        """The How tall heading asks whether Brachiosaurus was the tallest dinosaur. Asked, it builds; said as a claim,
        the same heading stops the build."""
        page = self.topic_page("brachiosaurus")
        self.build()
        for lang in ("en", "de"):
            original = self.data(lang, page)
            n, block = next((n, b) for n, b in enumerate(original["blocks"]) if b["id"] == "how-tall")
            self.assertRegex(block["h"].lower(), r"(?:tallest dinosaur|höchste dinosaurier)\?$")
            with self.subTest(lang=lang):
                shutil.rmtree(self.dir / "out", ignore_errors=True)
                data = json.loads(json.dumps(original))
                data["blocks"][n]["h"] = data["blocks"][n]["h"][:-1] + "."
                self.save(lang, data, page)
                self.fails(r"blocks\.%d\.h matches" % n)
                self.save(lang, original, page)

    def test_a_brachiosaurus_number_stands_only_with_the_words_that_say_whose_it_is(self):
        """The page names our model's 11.5 m head and its 21.3 and 24.0 m, the 80 and 50 tonnes, Berlin's 13 and 12 m, the
        arm bone's 2.04 m, the old name, the nostrils, the swamp, the largest dinosaur and the Tendaguru dig on purpose:
        without the words that say whose the number is or what the claim was, the same fields stop the build."""
        page = self.topic_page("brachiosaurus")
        cases = [
            ({"en": (r"Our model's neck rises", "The neck rises"), "de": (r"Der Hals unseres Modells steigt", "Der Hals steigt")},
             "11.5 m only as ours"),
            ({"en": (r"\(79 ft\) along the backbone, 21\.3 m \(70 ft\) straight with the neck raised", "(79 ft), 21.3 m (70 ft)"),
              "de": (r"24,0 m entlang der Wirbelsäule, 21,3 m gerade mit erhobenem Hals", "24,0 m, 21,3 m")},
             "21.3 m and 24.0 m only as ours"),
            ({"en": (r"A figure of 1962 from[^\"]*", "A figure."), "de": (r"Eine Zahl von 1962 aus[^\"]*", "Eine Zahl.")},
             "80 tonnes only as Colbert's outlier of 1962"),
            ({"en": (r"The Berlin exhibition's label of 2007[^\"]*", "A figure."),
              "de": (r"Das Schild der Berliner Ausstellung von 2007[^\"]*", "Eine Zahl.")},
             "50 tonnes only as the Berlin label"),
            ({"en": (r"Both are the Berlin mount, a Giraffatitan\.[^\"]*", "Both are common."),
              "de": (r"Beides ist die Berliner Montage, ein Giraffatitan\.[^\"]*", "Beides ist häufig.")},
             "13 m and 12 m tall only with the Berlin mount"),
            ({"en": (r" as preserved", ""), "de": (r", wie er erhalten ist", "")}, "2.04 m only as preserved"),
            ({"en": (r"Named Brachiosaurus brancai in 1914, it got", "Brachiosaurus brancai got"),
              "de": (r"1914 Brachiosaurus brancai genannt, bekam das Tier", "Als Brachiosaurus brancai bekam das Tier")},
             "Brachiosaurus brancai only as the Berlin animal's old name"),
            ({"en": (r"Old restorations put[^\"]*", "They did."), "de": (r"Alte Darstellungen setzten[^\"]*", "So war es.")},
             "the nostrils were not on top of the head"),
            ({"en": (r"The old picture of all long-necked dinosaurs\.[^\"]*", "It was."),
              "de": (r"Das alte Bild aller Langhalsdinosaurier\.[^\"]*", "So war es.")},
             "it lived on land: a swamp animal only as the old picture"),
            ({"en": (r"Riggs's own title for it[^\"]*", "It was the largest dinosaur."),
              "de": (r"Riggs' eigener Titel für das Tier[^\"]*", "Er war der größte Dinosaurier.")},
             "the largest known dinosaur only as Riggs's title"),
            ({"en": (r", under German colonial rule, as the museum itself says", ""),
              "de": (r", unter deutscher Kolonialherrschaft, wie das Museum selbst sagt", "")},
             "the Tendaguru dig only with German colonial rule"),
        ]
        out, _ = self.build()
        shutil.rmtree(out)
        for subs, rule in cases:
            for lang, (condition, instead) in subs.items():
                with self.subTest(lang=lang, rule=rule):
                    original = self.data(lang, page)
                    text = json.dumps(original, ensure_ascii=False)
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    # Each claim the Triceratops page must never make, by its topic's rules: the canon's NEVER SAY and the facts sheet's.
    NEVER_TRICERA = {
        "en": ["Triceratops was 9 m long", "It reached 9 metres", "Our Triceratops is 9 m long",
               "Ours is about 9 m", "It weighed 10 tonnes", "It came to 13 t", "Triceratops weighed 12 tonnes",
               "It came to 12 t", "Triceratops was 6.9 m long", "Triceratops was 7.1 m long",
               "Triceratops stood 2.5 m tall", "The frill stood 2.4 m high", "Its hip stood 2.44 m up",
               "Our Triceratops weighs 7 tonnes", "Our model comes to 6.5 to 7.4 t", "It came to 7.4 tonnes",
               "Our Triceratops, about 7 t", "Its thigh bone is 1.19 m long",
               "It had the largest skull of any land animal", "The biggest head of any land animal",
               "Triceratops had a long nose horn", "Its scales were as wide as a hand", "Hand-sized scales",
               "A cheek like a mammal's", "The often reproduced skin photograph",
               "The frill was only for display", "It was only for defence",
               "The frill was nearly one metre across", "Males fought with their horns",
               "The largest horned dinosaur", "Fossilised skin of Triceratops", "A skin impression",
               "Skin was found on this skeleton", "Hatcher was found as one skeleton", "Hatcher is one animal",
               "Hatcher found it in 1888", "The skeleton shows which bones were found",
               "T. rex fought Triceratops", "Triceratops fought T. rex",
               "The battle between T. rex and Triceratops", "They killed each other", "They died fighting",
               "The Dueling Dinosaurs are a T. rex and a Triceratops", "Our Triceratops lived beside SUE",
               "Our two met", "Our Triceratops was counted", "Torosaurus was the grown-up Triceratops",
               "Torosaurus is proven to be its own animal", "It ran at 30 km/h", "It charged like a rhino",
               "Triceratops lived in herds", "It lived alone", "Hundreds of skeletons",
               "The Jurassic Park Triceratops", "In the film", "It was killed by the asteroid",
               "On the last day", "It lived 65 million years ago", "It died out 66 million years ago",
               "It lived 68 million years ago"],
        "de": ["Der Triceratops war 9 m lang", "Er erreichte 9 Meter", "Unser Triceratops ist 9 m lang",
               "Unser Modell ist etwa 9 m", "Er wog 10 t", "Er kam auf 13 Tonnen", "Er wog 12 t",
               "Er kam auf 12 Tonnen", "Der Triceratops war 6,9 m lang", "Der Triceratops war 7,1 m lang",
               "Der Triceratops war 2,5 m hoch", "Der Nackenschild stand 2,4 m hoch",
               "Seine Hüfte stand 2,44 m hoch", "Unser Triceratops wiegt 7 t",
               "Unser Modell käme auf 6,5 bis 7,4 t", "Er kam auf 7,4 t", "Unser Triceratops, etwa 7 t",
               "Sein Oberschenkelknochen ist 1,19 m lang", "Er hatte den größten Schädel aller Landtiere",
               "Der größte Kopf aller Landtiere", "Der Triceratops hatte ein langes Nasenhorn",
               "Seine Schuppen waren so breit wie eine Hand", "Handgroße Schuppen",
               "Eine Wange wie bei einem Säugetier", "Das oft gedruckte Hautfoto",
               "Der Nackenschild war nur zur Abwehr", "Er diente nur zum Imponieren",
               "Der Nackenschild war fast einen Meter breit", "Männchen kämpften mit den Hörnern",
               "Der größte Horndinosaurier", "Versteinerte Haut des Triceratops", "Ein Hautabdruck",
               "Haut wurde an diesem Skelett gefunden", "Hatcher wurde als ein einziges Skelett gefunden",
               "Hatcher ist ein Tier", "Hatcher fand ihn 1888",
               "Das Skelett zeigt, welche Knochen gefunden wurden", "Der T. rex kämpfte gegen den Triceratops",
               "Der Triceratops kämpfte gegen den T. rex", "Der Kampf zwischen T. rex und Triceratops",
               "Sie töteten sich gegenseitig", "Sie starben im Kampf",
               "Die Dueling Dinosaurs sind ein T. rex und ein Triceratops",
               "Unser Triceratops lebte neben SUE", "Unsere beiden trafen sich",
               "Unser Triceratops wurde gezählt", "Torosaurus war der erwachsene Triceratops",
               "Torosaurus ist als eigenes Tier bewiesen", "Er lief 30 km/h", "Er stürmte wie ein Nashorn",
               "Der Triceratops lebte in Herden", "Er war ein Einzelgänger", "Hunderte Skelette",
               "Der Triceratops aus Jurassic Park", "Im Film", "Er wurde vom Asteroiden getötet",
               "Am letzten Tag", "Er lebte vor 65 Millionen Jahren", "Er starb vor 66 Millionen Jahren aus",
               "Er lebte vor 68 Millionen Jahren", "Der Dreihorn"],
    }

    def test_the_triceratops_page_refuses_each_never_say_phrase(self):
        page = self.topic_page("triceratops")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "triceratops")
        # every rule of the topic is met by a phrase of the list in a language it holds for, so a rule added without
        # its phrase is seen
        for pattern, _, *only in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for lang, xs in self.NEVER_TRICERA.items() if not only or lang in only[0]
                                for x in xs), pattern)
        for lang, phrases in self.NEVER_TRICERA.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # the line under the answer carries none of the words a rule lets a number stand with
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    data = json.loads(json.dumps(original))
                    data["top"]["out"]["text"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.out\.text matches")
                    self.save(lang, original, page)

    def test_a_triceratops_number_stands_only_with_the_words_that_say_whose_it_is(self):
        """The page names the largest's 9 m, the 10 and 13 tonnes, our model's 6.9, 7.1 and 2.5 m, the largest head,
        the long nose horn, Torosaurus as an old Triceratops and 66 million years on purpose: without the words that say
        whose the number is or what the claim was, the same fields stop the build."""
        page = self.topic_page("triceratops")
        cases = [
            ({"en": (r", and the largest reached about 9\sm", ", and some reached about 9 m"),
              "de": (r", die größten erreichten etwa 9\sm", ", manche erreichten etwa 9 m")},
             "9 m only as the largest Triceratops's round figure"),
            ({"en": (r"Printed beside the 9\sm, again with no method\. ", ""),
              "de": (r"Im selben Verzeichnis neben den 9\sm, wieder ohne Methode\. ", "")},
             "10 and 13 tonnes only as numbers you may have read"),
            ({"en": (r"biggest dinosaurs, with no method,", "biggest dinosaurs,"),
              "de": (r"größten Dinosauriern, ohne Methode,", "größten Dinosauriern,")},
             "10 and 13 tonnes only as numbers you may have read"),
            ({"en": (r"\"Our Triceratops, 6\.9\sm from beak to tail\"", '"6.9 m from beak to tail"'),
              "de": (r"\"Unser Triceratops, 6,9\sm vom Schnabel bis zum Schwanz\"", '"6,9 m vom Schnabel bis zum Schwanz"')},
             "6.9 m only as ours"),
            ({"en": (r"\(23\sft\) straight, 7\.1\sm", "(23 ft), 7.1 m"), "de": (r"6,9\sm gerade, 7,1\sm", "6,9 m, 7,1 m")},
             "7.1 m only as ours"),
            ({"en": (r"over the hips, 2\.5\sm, ours", "over the hips, 2.5 m"),
              "de": (r"Rücken über der Hüfte, 2,5\sm, unser Modell", "Rücken über der Hüfte, 2,5 m")},
             "2.5 m and 2.4 m only as ours"),
            ({"en": (r"It is one of the largest heads", "It is the largest head"),
              "de": (r"Das ist einer der größten Köpfe", "Das ist der größte Kopf")},
             "never the largest skull or head of any land animal"),
            ({"en": (r"It belongs to T\. prorsus, the later species\. ", ""), "de": (r"Es gehört zu T\. prorsus, der späteren Art\. ", "")},
             "a long nose horn only as the later T. prorsus's"),
            ({"en": (r"An idea of 2010\. ", ""), "de": (r"Eine Idee von 2010\. ", "")},
             "Torosaurus as the old Triceratops only as the idea of 2010"),
            ({"en": (r"the close of the Cretaceous, about 66", "the close of the Cretaceous, 66"),
              "de": (r"Ende der Kreidezeit vor etwa 66", "Ende der Kreidezeit vor 66")},
             "66 or 68 million years only with about"),
        ]
        out, _ = self.build()
        shutil.rmtree(out)
        for subs, rule in cases:
            for lang, (condition, instead) in subs.items():
                with self.subTest(lang=lang, rule=rule):
                    original = self.data(lang, page)
                    text = json.dumps(original, ensure_ascii=False)
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    # Each claim the Ankylosaurus page must never make, by its topic's rules: the canon's NEVER SAY and the facts sheet's.
    NEVER_ANKY = {
        "en": ["Ankylosaurus was 8 m long", "It reached 8 metres", "Our Ankylosaurus is 8 m long",
               "AMNH 5214 was 8 m long", "Ours is about 10 m", "Ankylosaurus was 10 m long",
               "It weighed 8 tonnes", "It came to 8 t", "Ankylosaurus was 9 m long", "It reached 9.99 m",
               "Its club was 1.2 m wide", "a 1.2 m club", "Ankylosaurus was 6.4 m long",
               "Ankylosaurus stood 1.70 m at the hips", "It was 1.7 m tall", "Its shoulders stood 1.5 m high",
               "Our Ankylosaurus weighs 3.5 tonnes", "Our model comes to 3.3 to 3.6 t",
               "It came to 3.59 tonnes", "Our Ankylosaurus, about 4 t", "Its volume is 3.6 m³",
               "Ankylosaurus weighed 5 tonnes", "It was weighed", "Our Ankylosaurus is the largest",
               "Ours was the biggest of the three", "A complete skeleton of Ankylosaurus",
               "Three partial skeletons are known", "The armour was found in place",
               "It was found with its armour in place", "AMNH 5214 was counted",
               "Our Ankylosaurus was one of the two", "It had shoulder spikes", "A spiked ball on its tail",
               "Its armour was a solid shell", "Ankylosaurus was a living tank", "Its club could break bones",
               "A bone-breaking club", "It broke bones with its club", "Its tail dragged on the ground",
               "Its nostrils sat at the front", "It had grinding teeth", "It chewed like a cow",
               "It ate 60 kg a day", "Its hands had four fingers", "Five fingers on each hand",
               "It lived in herds", "It lived alone", "Its colour was known", "Its colour was reddish brown",
               "The males had bigger clubs", "A female Ankylosaurus", "The largest armoured dinosaur",
               "The biggest ankylosaur of all", "The largest of all ankylosaurs", "Ankylosaurus fought T. rex",
               "T. rex fought Ankylosaurus", "The battle between T. rex and Ankylosaurus",
               "The club was made to fight T. rex", "It killed a T. rex with its club",
               "Its club killed T. rex", "It swung its club at rivals, not at T. rex",
               "Clubs were swung only at rivals", "The club was only for defence", "It lived beside SUE",
               "Our Ankylosaurus lived beside our Triceratops", "Ankylosaurus lived alongside Stegosaurus",
               "Stegosaurus and Ankylosaurus lived together", "Stegosaurus and Ankylosaurus met",
               "It was killed by the asteroid", "On the last day", "Its last fossils are 66 million years old",
               "It lived 65 million years ago", "It died out 66 million years ago",
               "It lived 68 million years ago", "Stegosaurus lived 150 million years ago",
               "80 million years lie between them", "The big skull's teeth were 7.5 mm high",
               "The biggest tooth is 9.1 mm", "The bigger skull had smaller teeth",
               "The Jurassic World Ankylosaurus", "In the film", "The Schleich toy"],
        "de": ["Der Ankylosaurus war 8 m lang", "Er erreichte 8 Meter", "Unser Ankylosaurus ist 8 m lang",
               "AMNH 5214 war 8 m lang", "Unser Modell ist etwa 10 m", "Der Ankylosaurus war 10 m lang",
               "Er wog 8 t", "Er kam auf 8 Tonnen", "Der Ankylosaurus war 9 m lang", "Er erreichte 9,99 m",
               "Seine Keule war 1,2 m breit", "Der Ankylosaurus war 6,4 m lang",
               "Der Ankylosaurus war an der Hüfte 1,70 m hoch", "Er war 1,7 m hoch",
               "Die Schultern standen 1,5 m hoch", "Unser Ankylosaurus wiegt 3,5 t",
               "Unser Modell käme auf 3,3 bis 3,6 t", "Er kam auf 3,59 Tonnen", "Unser Ankylosaurus, etwa 4 t",
               "Sein Volumen ist 3,6 m³", "Der Ankylosaurus wurde gewogen", "Er wog 5 Tonnen",
               "Unser Ankylosaurus ist der größte", "Unser Modell ist das größte der drei",
               "Ein vollständiges Skelett des Ankylosaurus", "Drei Teilskelette sind bekannt",
               "Der Panzer wurde an seiner Stelle gefunden", "Die Platten wurden an ihrer Stelle gefunden",
               "AMNH 5214 wurde gezählt", "Unser Ankylosaurus war einer der beiden",
               "Er hatte Schulterstacheln", "Eine Stachelkugel am Schwanz",
               "Sein Panzer war eine feste Schale", "Der Ankylosaurus war ein lebender Panzer",
               "Die Keule konnte Knochen brechen", "Eine knochenbrechende Keule",
               "Seine Keule zertrümmerte Knochen", "Sein Schwanz schleifte über den Boden",
               "Die Nasenlöcher saßen vorn", "Er hatte Mahlzähne", "Er kaute wie eine Kuh",
               "Er fraß 60 kg am Tag", "Seine Hände hatten vier Finger", "Fünf Finger an jeder Hand",
               "Er lebte in Herden", "Er lebte allein", "Seine Farbe war bekannt", "Seine Farbe war rotbraun",
               "Die Männchen hatten größere Keulen", "Ein weiblicher Ankylosaurus",
               "Der größte gepanzerte Dinosaurier", "Der größte Ankylosaurier überhaupt",
               "Der Ankylosaurus kämpfte gegen den T. rex", "Der T. rex kämpfte gegen ihn",
               "Der Kampf zwischen T. rex und Ankylosaurus", "Eine Keule zum Kampf gegen den T. rex",
               "Er erschlug einen T. rex mit der Keule", "Seine Keule tötete den T. rex",
               "Er schlug nicht gegen den T. rex", "Die Keule diente nur zur Abwehr", "Er lebte neben SUE",
               "Unser Ankylosaurus lebte neben unserem Triceratops",
               "Der Ankylosaurus lebte neben dem Stegosaurus", "Stegosaurus und Ankylosaurus lebten zusammen",
               "Er wurde vom Asteroiden getötet", "Am letzten Tag",
               "Seine letzten Fossilien sind 66 Millionen Jahre alt", "Er lebte vor 65 Millionen Jahren",
               "Er starb vor 66 Millionen Jahren aus", "Er lebte vor 68 Millionen Jahren",
               "Zwischen ihnen liegen 80 Millionen Jahre", "Die Zähne des großen Schädels waren 7,5 mm hoch",
               "Der größte Zahn misst 9,1 mm", "Der größere Schädel hatte kleinere Zähne",
               "Der Ankylosaurus aus Jurassic World", "Im Film", "Das Schleich-Spielzeug", "Die Panzerechse"],
    }

    def test_the_ankylosaurus_page_refuses_each_never_say_phrase(self):
        page = self.topic_page("ankylosaurus")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "ankylosaurus")
        # every rule of the topic is met by a phrase of the list in a language it holds for, so a rule added without
        # its phrase is seen
        for pattern, _, *only in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for lang, xs in self.NEVER_ANKY.items() if not only or lang in only[0]
                                for x in xs), pattern)
        for lang, phrases in self.NEVER_ANKY.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # the line under the answer carries none of the words a rule lets a number stand with
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    data = json.loads(json.dumps(original))
                    data["top"]["out"]["text"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.out\.text matches")
                    self.save(lang, original, page)

    # Each claim the Stegosaurus page must never make, by its topic's rules: the canon's NEVER SAY and the facts sheet's.
    NEVER_STEGO = {
        "en": ["Stegosaurus was 9 m long", "It reached 9 metres", "Sophie is 9 m long",
               "Our Stegosaurus is about 9 m long", "Stegosaurus was 5.6 m long",
               "Stegosaurus stood 1.9 m at the hips", "Its plates reached 2.5 m",
               "Stegosaurus stood 2.9 m tall", "Stegosaurus stood 4 m tall", "It weighed 5 tonnes",
               "It came to 7 tonnes", "Some were over 7", "Sophie came to 3.75 tonnes",
               "Our Stegosaurus weighs 2 tonnes", "Our model comes to 1.98 to 2.2 t", "It came to 2.2 tonnes",
               "Our Stegosaurus, about 2 t", "Sophie was weighed", "Stegosaurus weighs about 1.6 tonnes",
               "It was the size of a bus", "She was a young animal", "Her skeleton is in London",
               "Sophie was a female", "A male Stegosaurus", "Sophie was a full-grown Stegosaurus",
               "Sophie was an adult", "Sophie starved", "Sophie was killed", "19 plates were found",
               "Sophie had 19 plates", "The skeleton shows all of its bones",
               "All of Sophie's bones were found", "The most complete Stegosaurus ever found",
               "Victoria the Stegosaurus", "The plates stood in pairs", "Paired plates ran down its back",
               "The plates stood in one row", "Its spikes pointed up", "Spikes standing straight up",
               "Upright spikes", "It had eight spikes", "Eight tail spikes", "Plates that flushed red",
               "The plates changed colour", "The plates were for cooling", "The plates were armour",
               "The plates could move", "The plates were corrected by Gilmore",
               "Thagomizer is the scientific name", "The cartoon of 1982", "Its skin was found",
               "Fossilised skin of Stegosaurus", "Stegosaurus had two brains", "It had a second brain",
               "A brain in its hips", "Its brain weighed 80 g", "A brain the size of a dog's",
               "It had a brain the size of a walnut", "Its hips stored food", "Stegosaurus met T. rex",
               "T. rex fought Stegosaurus", "Stegosaurus and Triceratops lived together",
               "Triceratops met Stegosaurus", "It died out 145 million years ago",
               "The Jurassic ended 145 million years ago", "It lived 152 to 145 million years ago",
               "It died out because it was stupid", "It was wiped out",
               "The Stegosaurus ungulatus from Portugal", "The Portuguese skeleton is S. stenops",
               "It walked at 6 km/h", "It walked a few miles an hour", "It lived in herds", "It lived alone",
               "The Stegosaurus of Jurassic Park", "A bulldozer found it", "In a windstorm"],
        "de": ["Der Stegosaurus war 9 m lang", "Er erreichte 9 Meter", "Sophie ist 9 m lang",
               "Unser Stegosaurus ist etwa 9 m lang", "Der Stegosaurus war 5,6 m lang",
               "Der Rücken stand 1,9 m hoch", "Die Platten reichten 2,5 m hoch",
               "Der Stegosaurus war 2,9 m hoch", "Er war 4 m hoch", "Er wog 5 t", "Er kam auf 7 Tonnen",
               "Manche wogen über 7", "Sophie kam auf 3,75 t", "Unser Stegosaurus wiegt 2 t",
               "Unser Modell käme auf 1,98 bis 2,2 t", "Er kam auf 2,2 t", "Unser Stegosaurus, etwa 2 t",
               "Sophie wurde gewogen", "Der Stegosaurus wiegt 1,6 t", "So groß wie ein Bus",
               "Sophie war jung, als sie starb", "Sophie lebt in London. Ihr Skelett steht dort",
               "Sophie war weiblich", "Ein männlicher Stegosaurus", "Sophie war ausgewachsen",
               "Sophie war erwachsen", "Sophie verhungerte", "Sophie wurde getötet",
               "19 Platten wurden gefunden", "Sophie hatte 19 Platten", "Das Skelett zeigt alle Knochen",
               "Alle Knochen wurden gefunden", "Das vollständigste Skelett", "Victoria, ein Stegosaurus",
               "Die Platten standen paarweise", "Paarweise Platten auf dem Rücken",
               "Die Platten standen in einer Reihe", "Die Stacheln zeigten nach oben",
               "Stacheln standen senkrecht", "Vier Stacheln, die nach oben zeigten", "Er hatte acht Stacheln",
               "Acht Schwanzstacheln", "Platten, die rot anliefen", "Die Platten errötete",
               "Die Platten dienten zur Kühlung", "Die Platten waren ein Panzer",
               "Die Platten konnten sich bewegen", "Die Platten wurden von Gilmore korrigiert",
               "Thagomizer ist der wissenschaftliche Begriff", "Der Cartoon von 1982",
               "Seine Haut wurde gefunden", "Der Stegosaurus hatte zwei Gehirne",
               "Er hatte ein zweites Gehirn", "Ein Gehirn in der Hüfte", "Sein Gehirn wog 80 g",
               "Ein Gehirn wie das eines Hundes", "Ein Gehirn so groß wie eine Walnuss",
               "Die Hüfte war ein Nahrungsspeicher", "Der Stegosaurus traf den T. rex",
               "Der T. rex kämpfte gegen den Stegosaurus", "Stegosaurus und Triceratops lebten zusammen",
               "Der Triceratops begegnete dem Stegosaurus", "Er starb vor 145 Millionen Jahren aus",
               "Der Jura endete vor 145 Millionen Jahren", "Er wurde ausgelöscht",
               "Er starb aus, weil er dumm war", "Der Stegosaurus ungulatus aus Portugal", "Er lief 6 km/h",
               "Er lebte in Herden", "Er war ein Einzelgänger", "Der Stegosaurus aus Jurassic Park",
               "Eine Planierraupe fand ihn", "An einem stürmischen Abend"],
    }

    def test_the_stegosaurus_page_refuses_each_never_say_phrase(self):
        page = self.topic_page("stegosaurus")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "stegosaurus")
        # every rule of the topic is met by a phrase of the list in a language it holds for, so a rule added without
        # its phrase is seen
        for pattern, _, *only in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for lang, xs in self.NEVER_STEGO.items() if not only or lang in only[0]
                                for x in xs), pattern)
        for lang, phrases in self.NEVER_STEGO.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # the line under the answer carries none of the words a rule lets a number stand with
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    data = json.loads(json.dumps(original))
                    data["top"]["out"]["text"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.out\.text matches")
                    self.save(lang, original, page)

    def test_an_ankylosaurus_number_stands_only_with_the_words_that_say_whose_it_is(self):
        """The page names the biggest animals' 8 m, the 10 m and 8 tonnes its authors doubt, our model's 6.4, 1.70 and
        1.5 m, the study's weight, the shoulder spikes, the living tank, the bone-breaking club, the spiked ball, the
        biggest armoured dinosaur, the teeth of 9.1 mm and 66 million years on purpose: without the words that say whose
        the number is or what the claim was, the same fields stop the build."""
        page = self.topic_page("ankylosaurus")
        cases = [
            ({"en": (r"up to about 8\sm\s\(26\sft\) as its study", "about 8 m (26 ft) as its study"),
              "de": (r"bis etwa 8\sm nach dem Urteil", "etwa 8 m nach dem Urteil")},
             "8 m only as the end of a range, for the biggest animals, or a number you may have read"),
            ({"en": (r" but called probably too long by its authors", ""),
              "de": (r" halten die Autoren selbst für wohl zu lang", "")},
             "10 m only with its own authors' doubt: probably too long"),
            ({"en": (r"about 8\st, a rough scaling its own authors doubt", "about 8 t"),
              "de": (r"etwa 8\st, eine grobe Hochrechnung, an der die Autoren selbst zweifeln", "etwa 8 t")},
             "8 tonnes only as the biggest skull's rough scaling, with its authors' doubt"),
            ({"en": (r"6\.4\sm\s\(21\sft\) straight, beak to club", "6.4 m (21 ft), beak to club"),
              "de": (r"6,4\sm gerade, vom Schnabel", "6,4 m, vom Schnabel")},
             "6.4 m only as ours, our model's"),
            ({"en": (r"Top of the back over the hips, 1\.7\sm, ours", "Top of the back over the hips, 1.7 m"),
              "de": (r"Rücken über der Hüfte, 1,7\sm, unser Modell", "Rücken über der Hüfte, 1,7 m")},
             "1.7 m only as ours, at the hips, or the person's height"),
            ({"en": (r"over the shoulders, ours", "over the shoulders"),
              "de": (r"über den Schultern, unser Modell", "über den Schultern")},
             "1.5 m only as ours, over the shoulders"),
            ({"en": (r"About 4\.8 tonnes for the animal ours is built on", "Ours, about 4.8 tonnes"),
              "de": (r"Das Tier, nach dem unser Modell gebaut ist, kommt nach seinen Beinknochen auf etwa 4,8\st",
                     "Unser Modell kommt auf etwa 4,8 t")},
             "never a weight beside our animal, and never its volume: the weight is the study's, about 4.8 tonnes"),
            ({"en": (r"one 2017 study, never weighed", "one 2017 study, weighed"),
              "de": (r"eine Studie von 2017, nie gewogen", "eine Studie von 2017, gewogen")},
             "never weighed: the weight is worked out from its leg bones"),
            ({"en": (r"Old pictures borrowed them from another family of armoured dinosaurs\.", "Ankylosaurus wore them over its shoulders."),
              "de": (r"Alte Bilder haben sie von einer anderen Familie gepanzerter Dinosaurier übernommen\.",
                     "Der Ankylosaurus trug sie über den Schultern.")},
             "shoulder spikes only as what old pictures borrowed from another family"),
            ({"en": (r"An image, not a finding\. ", ""), "de": (r"Ein Bild, kein Befund\. ", "")},
             "a living tank only as an image, explained"),
            ({"en": (r"sits just under the size that could", "is the size that could"),
              "de": (r"liegt knapp unter der Größe, die", "hat die Größe, die")},
             "never that its club could break bones: its knob sits just under the size that could in a model of relatives"),
            ({"en": (r"No known T\.\srex bone carries a club wound, and the one", "The one"),
              "de": (r"An keinem bekannten Knochen eines T\.\srex sitzt eine Keulenwunde, und die einzige", "Die einzige")},
             "never that it killed T. rex: no known T. rex bone carries a club wound"),
            ({"en": (r"19\scm high, with no spikes\.", "19 cm high."), "de": (r"19\scm hoch, ohne Stacheln\.", "19 cm hoch.")},
             "never a spiked ball on the tail: the knob is a low, flat disc"),
            ({"en": (r"The 2017 study calls Ankylosaurus the biggest known ankylosaurid, and possibly the biggest "
                      r"ankylosaur of all\.", "Ankylosaurus was the biggest."),
              "de": (r"Die Studie von 2017 nennt den Ankylosaurus den größten bekannten Ankylosauriden und "
                      r"vielleicht den größten Ankylosaurier überhaupt\.", "Das war der Ankylosaurus.")},
             "never the largest armoured dinosaur as fact: the biggest known ankylosaurid, possibly the biggest ankylosaur of all"),
            ({"en": (r"the biggest is about 9\smm high", "the biggest is about 9.1 mm high"),
              "de": (r"misst der größte Zahn etwa 9\smm", "misst der größte Zahn etwa 9,1 mm")},
             "the teeth of 7.5 and 9.1 mm stand only in the guess's answer"),
            ({"en": (r"Cretaceous, about 66 million", "Cretaceous, 66 million"),
              "de": (r"Kreidezeit vor etwa 66 Millionen", "Kreidezeit vor 66 Millionen")},
             "never 65 million years, and a number of years only with about"),
        ]
        out, _ = self.build()
        shutil.rmtree(out)
        for subs, rule in cases:
            for lang, (condition, instead) in subs.items():
                with self.subTest(lang=lang, rule=rule):
                    original = self.data(lang, page)
                    text = json.dumps(original, ensure_ascii=False)
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    def test_a_stegosaurus_number_stands_only_with_the_words_that_say_whose_it_is(self):
        """The page names the largest's 9 m, Sophie's mount at 5.6 and 2.9 m, our model's 1.9 and 2.5 m, the rejected
        3.75 tonnes, the abstract's over 7, a weight never weighed, the old second brain, the walnut, Sophie's unknown
        sex, one of the most complete skeletons, the old eight spikes, spikes that point out and the bulldozer of the
        guess on purpose: without the words that say whose the number is or what the claim was, the same fields stop
        the build."""
        page = self.topic_page("stegosaurus")
        cases = [
            ({"en": (r"The largest Stegosaurus were about 9\sm", "Stegosaurus were about 9 m"),
              "de": (r"Ein Stegosaurus wurde bis zu etwa 9\sm", "Ein Stegosaurus wurde etwa 9 m")},
             "9 m only as the largest Stegosaurus's round figure"),
            ({"en": (r"skeleton, the mount 5\.6\sm", "skeleton, 5.6 m"), "de": (r"beschreibt, die Montage 5,6\sm", "beschreibt, 5,6 m")},
             "5.6 m only as Sophie's, her mount's or ours"),
            ({"en": (r"over the hips, 1\.9\sm, ours", "over the hips, 1.9 m"),
              "de": (r"Rücken über der Hüfte, 1,9\sm, unser Modell", "Rücken über der Hüfte, 1,9 m")},
             "1.9 m only as ours"),
            ({"en": (r"Tallest plate tip, 2\.5\sm, ours", "Tallest plate tip, 2.5 m"),
              "de": (r"Höchste Plattenspitze, 2,5\sm, unser Modell", "Höchste Plattenspitze, 2,5 m")},
             "2.5 m only as ours"),
            ({"en": (r"animal, the mount 2\.9\sm", "animal, 2.9 m"), "de": (r"die Montage an der höchsten Stelle 2,9\sm", "an der höchsten Stelle 2,9 m")},
             "2.9 m only as the mount's highest point"),
            ({"en": (r", a figure the same study rejected\.", "."), "de": (r", was dieselbe Studie verwarf\.", ".")},
             "3.75 tonnes only as the leg-bone figure its study rejected"),
            ({"en": (r"from a meeting abstract of 2025", "from a study of 2025"), "de": (r"aus einem Tagungsbeitrag von 2025", "aus einer Studie von 2025")},
             "over 7 tonnes only as one stegosaur of a meeting abstract"),
            ({"en": (r"skeleton, never weighed", "skeleton, weighed"), "de": (r"Skeletts, nie gewogen", "Skeletts, gewogen")},
             "no Stegosaurus was ever weighed"),
            ({"en": (r"There was no “second brain”\.", "There was no second brain."),
              "de": (r"Ein „zweites Gehirn“ gab es nicht\.", "Ein zweites Gehirn gab es nicht.")},
             "a second brain only as the old idea, in quotation marks"),
            ({"en": (r"has long been likened to a walnut", "has long been the size of a walnut"),
              "de": (r"verglich man lange mit einer Walnuss", "war lange so groß wie eine Walnuss")},
             "the brain's space was likened to a walnut, never measured as one"),
            ({"en": (r"male or female, nobody knows\.", "male or female."), "de": (r"oder weiblich war, weiß niemand\.", "oder weiblich war.")},
             "Sophie's sex is unknown"),
            ({"en": (r"one of the most complete skeletons", "the most complete skeleton"),
              "de": (r"eines der vollständigsten bekannten Skelette", "das vollständigste bekannte Skelett")},
             "never the most complete without one of"),
            ({"en": (r", and one reconstruction's eight spikes came from two animals", ""),
              "de": (r", und die acht Stacheln einer Rekonstruktion stammten von zwei Tieren", "")},
             "four spikes: eight only as one old reconstruction's, from two animals"),
            ({"en": (r"spikes that pointed out to the sides, not up", "spikes that pointed up"),
              "de": (r"Stacheln, die zur Seite zeigten, nicht nach oben", "Stacheln, die nach oben zeigten")},
             "the spikes pointed out to the sides and back"),
            ({"en": (r"By accident, in 2003\. ", "In 2003. "), "de": (r"Durch Zufall, 2003\. ", "2003. ")},
             "the bulldozer only in the guess's answer"),
        ]
        out, _ = self.build()
        shutil.rmtree(out)
        for subs, rule in cases:
            for lang, (condition, instead) in subs.items():
                with self.subTest(lang=lang, rule=rule):
                    original = self.data(lang, page)
                    text = json.dumps(original, ensure_ascii=False)
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    def test_a_credit_a_picture_owes_stands_under_that_picture(self):
        """A picture lower on a page may carry a source line under its caption (scale.note), with its links: the
        Stegosaurus page sets the Triceratops outline's credit under the picture of the three rows, the one that shows
        our Triceratops, and under no other of its pictures."""
        out, written = self.build()
        seen = set()
        for path in written:
            data, lang = self.page_of(path)
            if data["page"].get("topic") != "stegosaurus":
                continue
            own = self.own_part(path.read_text(encoding="utf-8"))
            figures = re.findall(r'<figure class="plate sc-fig[^"]*".*?</figure>', own, flags=re.S)
            self.assertEqual(len(figures), 4, lang)
            for figure in figures:
                stem = re.search(r"/(animals-stegosaurus-[a-z-]+?)-\d+\.", figure).group(1)
                caption = figure[figure.index("<figcaption"):]
                if stem.endswith("-beside-triceratops-t-rex"):
                    line = re.search(r'</span><span class="label__src">(.*?)</span>(?:<a class="sc-totable"|</figcaption>)', caption, flags=re.S)
                    self.assertIsNotNone(line, lang)
                    self.assertIn('href="https://doi.org/10.6084/m9.figshare.27283401"', line.group(1))
                    self.assertIn('href="https://creativecommons.org/licenses/by/4.0/"', line.group(1))
                else:
                    self.assertNotIn("Dempsey", caption, (lang, stem))
            seen.add(lang)
        self.assertEqual(seen, {"en", "de"})

    def test_a_page_may_set_a_genus_in_italics_that_other_pages_name_upright(self):
        """The Stegosaurus page names Diplodocus beside Allosaurus as genera (page.taxa): there both are italic, while
        the biggest dinosaurs page, which names Diplodocus as an animal of its row, keeps it upright."""
        out, written = self.build()
        seen = {}
        for path in written:
            data, lang = self.page_of(path)
            own = self.own_part(path.read_text(encoding="utf-8"))
            topic = data["page"].get("topic")
            if topic == "stegosaurus":
                self.assertEqual(data["page"]["taxa"], ["Diplodocus"])
                self.assertIn('<i class="nh">Diplodocus</i>', own)
                self.assertIn('<i class="nh">Allosaurus</i>', own)
                self.assertNotRegex(re.sub(r"<i [^>]*>[^<]*</i>", "", own), r"(?<![\w-])Diplodocus")
                seen[topic, lang] = True
            elif topic == "biggest_dinosaurs" or data["page"]["id"] == "animals-biggest-dinosaurs":
                self.assertIn("Diplodocus", own)
                self.assertNotIn(">Diplodocus</i>", own)
                seen["dinosaurs", lang] = True
            else:
                self.assertNotIn("taxa", data["page"])
        self.assertEqual(len(seen), 4, seen)

    # Each claim the blue whale page must never make, by its topic's rules: the canon's NEVER SAY and the facts sheet's.
    NEVER_WHALE = {
        "en": ["Our blue whale weighs 80 tonnes", "Ours would weigh about 75 tonnes",
               "USNM 49757 weighed 70 t", "Our whale, 75 to 85 t", "Its volume is 90 m³",
               "Our model came to 82 tonnes", "Blue whales are 22.9 m long", "A blue whale is 22.86 m",
               "The blue whale grows to 75 ft", "The largest blue whale was 33 m", "They reach 33.27 m",
               "A whale of 110 feet", "The blue whale reaches 35 m", "Blue whales grow up to 40 metres",
               "It weighed 173 tonnes", "A whale of 177 t", "The record is 180 tonnes",
               "One whale weighed 136.4 tonnes", "The heaviest weighed 190 tonnes",
               "190 t for a pregnant female, weighed in pieces", "The heaviest blue whale weighed 200 tonnes",
               "A blue whale can weigh 270 tonnes", "A model gives 270 t", "A blue whale was weighed whole",
               "The whale was weighed at 150 tonnes", "Whole blue whales were weighed",
               "The blue whale weighed 150 t", "Our whale was full grown", "USNM 49757 was a full-grown adult",
               "He was fully grown", "Our blue whale is 25 m long", "Our model is Hope",
               "Our whale was about 30 m", "Our blue whale, 33 m",
               "The blue whale is the largest animal that ever lived", "It is the biggest animal ever.",
               "The largest animal to have ever lived", "Its heart is the size of a car",
               "A heart as big as a small car", "A person could swim through its arteries",
               "A child could crawl through its arteries", "Its tongue weighs 4 tonnes",
               "The tongue weighs as much as an elephant", "A tongue of 7 t", "Perucetus was heavier",
               "Perucetus could outweigh it", "Heavier than the blue whale was Perucetus",
               "An ichthyosaur was as big", "The megalodon hunted blue whales", "Megalodon ate blue whales",
               "Blue whales and megalodon met", "The fight between a megalodon and a blue whale",
               "Megalodon and blue whales lived at the same time", "Its real bones are coloured",
               "It is louder than a jet", "The loudest animal on Earth", "Its call reaches 188 decibels",
               "A newborn weighs 2.7 tonnes", "A calf is 2,700 kg", "About 10,000 are left",
               "There are 5,000 to 10,000 blue whales", "Only 10,000 remain",
               "Blue whales have been protected since 1966", "Protected from whaling since 1967",
               "Blue whales live to 110", "They can live up to 110 years", "Their maximum age is 90",
               "It eats 4 tonnes of krill a day", "Krill a day",
               "Our whale's skeleton is on display in Washington",
               "His skeleton is on display at the Smithsonian", "It was 78 feet long",
               "Blue whales are bright blue", "A yellow belly", "Blue whales have teeth", "Its baleen teeth",
               "It grows over 35 m", "Calves gain 91 kg a day", "It eats 7,000 kg of krill",
               "There are 10,000 to 25,000", "They live 65 to 80 years", "Megalodon was a giant great white",
               "A megalodon skeleton", "Megalodon weighed about 60 tonnes", "Argentinosaurus was 39.7 m",
               "Argentinosaurus was about 40 m", "Argentinosaurus weighed 100 tonnes",
               "The largest land animal ever", "Hope was a male, and he stranded", "The female lost his blood",
               "USNM 49757 and her bones", "She is our blue whale", "The blue whale and his calf",
               "A blue whale opens her mouth"],
        "de": ["Unser Blauwal wiegt 80 t", "Unser Modell käme auf etwa 75 t", "USNM 49757 wog 70 t",
               "Unser Wal, 75 bis 85 t", "Sein Volumen ist 90 m³", "Unser Modell kommt auf 82 Tonnen",
               "Blauwale sind 22,9 m lang", "Ein Blauwal ist 22,86 m lang", "Der größte Blauwal war 33 m lang",
               "Sie erreichen 33,27 m", "Der Blauwal erreicht 35 m", "Blauwale werden bis zu 40 Meter lang",
               "Er wog 173 t", "Ein Wal von 177 t", "Der Rekord sind 180 Tonnen", "Ein Wal wog 136,4 Tonnen",
               "Der schwerste wog 190 t", "190 t für ein trächtiges Weibchen, in Stücken gewogen",
               "Der schwerste Blauwal wog 200 t", "Ein Blauwal kann 270 t wiegen", "Ein Modell ergibt 270 t",
               "Ein ganzer Blauwal wurde gewogen", "Der Wal wog 150 t", "Blauwale wurden im Ganzen gewogen",
               "Unser Wal war ausgewachsen", "USNM 49757 war ein ausgewachsenes Männchen",
               "Unser Blauwal ist 25 m lang", "Unser Modell ist Hope", "Unser Blauwal war etwa 30 m",
               "Der Blauwal ist das größte Tier, das je gelebt hat", "Das größte Tier aller Zeiten",
               "Sein Herz ist so groß wie ein Auto", "Ein Herz so groß wie ein kleiner PKW",
               "Durch seine Adern könnte ein Mensch schwimmen",
               "Ein Kind könnte durch die Hauptschlagader kriechen", "Seine Zunge wiegt 4 t",
               "Die Zunge ist so schwer wie ein Elefant", "Perucetus war schwerer",
               "Schwerer als der Blauwal war Perucetus", "Ein Ichthyosaurier war so groß",
               "Der Megalodon jagte Blauwale", "Blauwale und der Megalodon begegneten sich",
               "Der Kampf zwischen Megalodon und Blauwal", "Megalodon und Blauwal lebten zur selben Zeit",
               "Seine echten Knochen sind gefärbt", "Er ist lauter als ein Düsenjet",
               "Das lauteste Tier der Erde", "Sein Ruf erreicht 188 Dezibel", "Ein Neugeborenes wiegt 2,7 t",
               "Ein Kalb wiegt 2.700 kg", "Es gibt noch etwa 10.000 Blauwale",
               "Es gibt 5.000 bis 10.000 Blauwale", "Etwa 10.000 sind übrig",
               "Blauwale sind seit 1966 geschützt", "Geschützt seit 1967",
               "Blauwale werden bis zu 110 Jahre alt", "Ihr Höchstalter liegt bei 90",
               "Er frisst 4 t Krill am Tag", "Bis 7 Tonnen Krill pro Tag",
               "Sein Skelett ist in Washington ausgestellt", "In Washington ist es zu sehen",
               "Er war 78 Fuß lang", "Blauwale sind leuchtend blau", "Ein gelber Bauch",
               "Blauwale haben Zähne", "Die Bartenzähne", "Ein Panzer aus Barten", "Er wird über 35 m lang",
               "Kälber nehmen 91 kg am Tag zu", "Er frisst 7.000 Kilogramm Krill", "Es gibt 10.000 bis 25.000",
               "Sie werden 65 bis 80 Jahre alt", "Der Megalodon war ein riesiger Weißer Hai",
               "Ein Megalodon-Skelett ist bekannt", "Das Skelett eines Megalodon",
               "Der Megalodon wog etwa 60 t", "Argentinosaurus war 39,7 m lang",
               "Argentinosaurus war etwa 40 m lang", "Argentinosaurus wog 100 t",
               "Das größte Landtier aller Zeiten", "Hope strandete, und er war jung", "Er hieß Hope"],
    }

    def test_the_blue_whale_page_refuses_each_never_say_phrase(self):
        page = self.topic_page("blue_whale")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "blue_whale")
        # every rule of the topic is met by a phrase of the list in a language it holds for, so a rule added without
        # its phrase is seen
        for pattern, _, *only in topic["never_say"]:
            self.assertTrue(any(re.search(pattern, x.lower()) for lang, xs in self.NEVER_WHALE.items() if not only or lang in only[0]
                                for x in xs), pattern)
        for lang, phrases in self.NEVER_WHALE.items():
            original = self.data(lang, page)
            for phrase in phrases:
                with self.subTest(lang=lang, phrase=phrase):
                    # the line under the answer carries none of the words a rule lets a number stand with
                    shutil.rmtree(self.dir / "out", ignore_errors=True)
                    data = json.loads(json.dumps(original))
                    data["top"]["out"]["text"] += f" {phrase}."
                    self.save(lang, data, page)
                    self.fails(r"top\.out\.text matches")
                    self.save(lang, original, page)

    def test_a_blue_whale_number_stands_only_with_the_words_that_say_whose_it_is(self):
        """The page names our whale's 22.86 m, the disputed 33 m record, the 190, 200 and 270 tonnes, the weighings in
        pieces, whether he was full grown, a model's weight at 23 m, the largest animal that ever lived, the heart, the
        arteries and the tongue, Perucetus, the megalodon's time, the newborn's weight, the count and the baleen on
        purpose: without the words that say whose the number is or what the claim was, the same fields stop the build."""
        page = self.topic_page("blue_whale")
        cases = [
            ({"en": (r", snout tip to tail notch, and 2\.86\sm \(9\.4\sft\) deep at its deepest, ours", ""),
              "de": (r", Schnauzenspitze bis Schwanzkerbe, größte Körperhöhe 2,86\sm, unser Modell", "")},
             "22.86 m, 22.9 m and 75 ft only as ours or as the recorded length of the male of 1903"),
            ({"en": (r"A disputed whaling record, one female", "A whaling record, one female"),
              "de": (r"Ein umstrittener Rekord aus dem Walfang, ein einzelnes Weibchen", "Ein Rekord aus dem Walfang, ein einzelnes Weibchen")},
             "33 m, 33.27 m and 110 feet only as the disputed whaling record"),
            ({"en": (r" It is a record we could not read at its source\.", ""),
              "de": (r" Es ist eine Angabe, die wir nicht an ihrer Quelle lesen konnten\.", "")},
             "190 tonnes only as a pregnant female weighed in pieces, a record not read at its source"),
            ({"en": (r"perhaps near 200\st, the top of a model", "near 200 t"),
              "de": (r"vielleicht knapp 200\st, die Obergrenze eines Modells", "knapp 200 t")},
             "200 tonnes only as perhaps, the top of a model"),
            ({"en": (r"model for a whale of 33\sm, the length of the disputed whaling record", "record for a whale of 33 m"),
              "de": (r"Ein Modell von 2024 für einen Wal von 33\sm, die Länge des umstrittenen Rekords aus dem Walfang", "Eine Angabe von 2024 für einen Wal von 33 m")},
             "270 tonnes only as a model's number for the disputed record"),
            ({"en": (r"though none was ever weighed whole", "as one was weighed whole"),
              "de": (r"doch noch nie wurde ein ganzer Blauwal gewogen", "und einmal wurde ein ganzer Blauwal gewogen")},
             "never a whole blue whale weighed: every weight comes from whales weighed in pieces"),
            ({"en": (r"Whether he was full grown is disputed", "He was full grown"),
              "de": (r"Ob dieses Männchen ausgewachsen war, ist umstritten", "Dieses Männchen war ausgewachsen")},
             "never full grown for our whale as certain: whether he was is disputed"),
            ({"en": (r"A model built from 31 whales weighed this way puts a blue whale 23\sm long at", "A model puts our blue whale at"),
              "de": (r"Ein Modell aus 31 so gewogenen Walen ergibt für einen Blauwal von 23\sm Länge", "Ein Modell ergibt für unseren Blauwal")},
             "never a weight beside our whale or USNM 49757, and never its volume: no weight is known for him"),
            ({"en": (r"True with one word added, the largest animal known\.", "True."),
              "de": (r"Mit einem Wort mehr stimmt es, das größte bekannte Tier\.", "Das stimmt.")},
             "the largest animal that ever lived only with known: the largest animal known"),
            ({"en": (r"No measurement we found backs it\..*?by our own comparison\.", "It is true."),
              "de": (r"Keine Messung, die wir fanden, stützt das\..*?nach unserem eigenen Vergleich\.", "Das stimmt.")},
             "a heart the size of a car only with what was measured: far smaller than a car"),
            ({"en": (r"Nothing we read supports it, and we", "We"),
              "de": (r"Nichts, was wir gelesen haben, stützt das, und eine", "Eine")},
             "arteries to swim or crawl through only as a claim nothing we read supports"),
            ({"en": (r"though it is said to weigh 4\stonnes", "though it weighs 4 tonnes"),
              "de": (r"doch sie soll 4\st wiegen", "doch sie wiegt 4 t")},
             "a tongue's weight only as said to: no weighing stands behind it"),
            ({"en": (r"as possibly heavier, comes out far lighter in two later studies", "was heavier"),
              "de": (r"der 2023 als womöglich schwerer vorgestellt wurde, ist nach zwei späteren Studien weit leichter", "war schwerer")},
             "Perucetus heavier only as possibly, with the later studies that brought it down"),
            ({"en": (r"The three never lived at the same time\.", "The three lived at the same time."),
              "de": (r"Die drei lebten nie zur selben Zeit\.", "Die drei lebten zur selben Zeit.")},
             "the megalodon and the blue whale never as meeting, hunting or fighting: they never lived at the same time"),
            ({"en": (r"more or less than a tonne", "a tonne"),
              "de": (r"mehr oder weniger als eine Tonne", "eine Tonne")},
             "the newborn's 2.7 tonnes stand only in the guess's answer"),
            ({"en": (r"Nobody has counted them all: by one estimate, given by the Royal Ontario Museum in 2016, there were then", "There were"),
              "de": (r"Gezählt hat sie niemand vollständig: Nach einer Schätzung, die das Royal Ontario Museum 2016 nannte, waren es damals", "Es waren")},
             "how many are left only by one estimate, with who gave it and its year"),
            ({"en": (r"in place of teeth", "like teeth"),
              "de": (r"anstelle von Zähnen", "wie Zähne")},
             "never teeth: baleen in place of teeth"),
        ]
        out, written = self.build()
        shutil.rmtree(out)
        for subs, rule in cases:
            for lang, (condition, instead) in subs.items():
                with self.subTest(lang=lang, rule=rule):
                    original = self.data(lang, page)
                    text = json.dumps(original, ensure_ascii=False)
                    self.assertRegex(text, condition)
                    self.save(lang, json.loads(re.sub(condition, instead, text)), page)
                    self.fails(re.escape(rule))
                    self.save(lang, original, page)

    def test_a_share_picture_may_set_its_words_beside_the_picture(self):
        """A page whose picture would leave much of the share card empty under its words sets them in a column at the
        left and the picture at the right (page.og_image.layout beside): the picture whole, the words wrapped in their
        column, a number never parted from its unit. Any other form, or the form on an open wing's page, stops the build."""
        spec = importlib.util.spec_from_file_location("chart_beside", self.dir / "chart.py")
        chart = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(chart)
        colours = {k: "#000000" for k in ("linen", "chalk-text", "stone", "frame", "stone-text-2", "chalk", "text-3", "page")}
        words = {"h1": "How big was the woolly mammoth?", "line": "A Siberian bull stood about 2.7 to 2.9 m (9 ft) at the shoulder",
                 "person": "1.70 m", "site": "museumofages.org"}
        for size in ((2438, 1403), (1600, 1600), (3200, 600)):
            svg = chart.picture_still_svg(words, colours, "x.png", size, (0.9, 0.4), beside=True)
            x, y, w, h = (float(v) for v in re.search(r'<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"', svg).groups())
            self.assertAlmostEqual(w / h, size[0] / size[1], places=3)
            self.assertAlmostEqual(x + w, 1140, places=3)
            self.assertTrue(60 <= y and y + h <= 570, (y, h))
            rows = [html.unescape(r) for r in re.findall(r'<text x="60" y="[\d.]+"[^>]*>([^<]*)</text>', svg)][:-1]
            self.assertEqual(" ".join(rows), words["h1"] + " " + words["line"])
            self.assertTrue(all(len(r) * 0.54 * (50 if i < 2 else 34) < x - 60 for i, r in enumerate(rows)), rows)
            self.assertFalse(any(r.endswith(("(9", "2.9")) for r in rows), rows)
            # the last row stands clear of the rule over the address
            self.assertLess(max(float(v) for v in re.findall(r'<text x="60" y="([\d.]+)"', svg)[:-1]), 630 - 62 - 30)
        # a range keeps its two ends, a short name its two parts and a German article its noun
        for short in ({"h1": "How big was T. rex?", "line": "About 12 m (39 ft) long, roughly 8 to 9 tonnes"},
                      {"h1": "Wie groß war ein T. rex?", "line": "Etwa 12 m lang, grob 8 bis 9 t"},
                      {"h1": "Wie groß war der Spinosaurus?", "line": "Etwa 14 m lang und 7 bis 8 Tonnen schwer"}):
            svg = chart.picture_still_svg({**short, "person": "1.70 m", "site": "museumofages.org"}, colours, "x.png",
                                          (1600, 1425), None, beside=True)
            rows = [html.unescape(r) for r in re.findall(r'<text x="60" y="[\d.]+"[^>]*>([^<]*)</text>', svg)][:-1]
            self.assertEqual(" ".join(rows), short["h1"] + " " + short["line"])
            self.assertFalse(any(r.endswith((" T.", " ein", " der", " 8", " to", " bis")) or r.startswith(("rex", "to ", "bis "))
                                 for r in rows), rows)
        self.assertEqual(chart.picture_still_svg(words, colours, "x.png", (2438, 1403), None),
                         chart.picture_still_svg(words, colours, "x.png", (2438, 1403), None, beside=False))
        page = next((p for p in self.scale_pages() if self.data("en", p)["page"]["og_image"].get("layout")), None)
        if not page:
            self.skipTest("no page sets its share picture's words beside it")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            data["page"]["og_image"]["layout"] = "below"
            self.save(lang, data, page)
        self.fails(r"page\.og_image\.layout is 'below'")

    def test_a_key_leads_each_colour_with_a_swatch_of_the_pictures_colour(self):
        """A skeleton coloured by where its bones come from names each colour with a swatch in the colour the picture
        prints (pics.<name>.swatches): the key's square and the bones agree. A page without swatches carries no swatch
        rules, and a swatch without its colour stops the build."""
        page = self.topic_page("spinosaurus")
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            text = path.read_text(encoding="utf-8")
            figs = [b["scale"] for b in data["blocks"] if isinstance(b.get("scale", {}).get("key"), list)]
            if not figs:
                self.assertNotIn(".sc-swatch", text)
                continue
            seen += 1
            # a name in a key's line is held whole (join_names): its no-break span or space, a long word's one break
            # (its two halves in one .brk span)
            text = re.sub(r'<span class="nh">([^<]*)</span>', r"\1", text).replace("&shy;", "").replace("\u00ad", "")
            text = re.sub(r'<span class="brk">([^<]*)</span>', r"\1", text)
            text = text.replace("&nbsp;", " ").replace("\u00a0", " ")
            for fig in figs:
                colours = data["pics"][fig["pic"]]["swatches"]
                keys = [k for k in fig["key"] if isinstance(k, dict)]
                self.assertEqual({k["swatch"] for k in keys}, set(colours))
                for k in keys:
                    self.assertIn(".sc-swatch--%s-%s{background:%s}" % (fig["pic"], k["swatch"], colours[k["swatch"]]), text)
                    self.assertRegex(text, r'<li class="sc-keys__i"><span class="sc-swatch sc-swatch--%s-%s" aria-hidden="true"></span><span>%s'
                                     % (fig["pic"], k["swatch"], re.escape(html.escape(k["text"].split(":")[0], quote=True))))
        # the Spinosaurus, the Brachiosaurus, the Ankylosaurus, the Stegosaurus and the blue whale pages, in both languages
        self.assertEqual(seen, 10)
        shutil.rmtree(out)
        for lang in ("en", "de"):
            data = self.data(lang, page)
            fig = next(b["scale"] for b in data["blocks"] if isinstance(b.get("scale", {}).get("key"), list))
            data["pics"][fig["pic"]]["swatches"].pop(next(k["swatch"] for k in fig["key"] if isinstance(k, dict)))
            self.save(lang, data, page)
        self.fails(r"the key's swatch")

    def test_an_answer_leads_on_and_the_lists_of_a_section_stand_under_their_headings(self):
        page = self.topic_page("t_rex")
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            if data["page"].get("topic") != "t_rex":
                continue
            seen += 1
            own = self.own_part(path.read_text(encoding="utf-8"))
            # a question's answer closes with its way on, which leads to that page in the page's language
            faq = next(b for b in data["blocks"] if b["type"] == "faq")
            section = re.search(r'<section class="sp-sec sp-faq" id="%s">(.*?)</section>' % faq["id"], own, flags=re.S).group(1)
            answers = re.findall(r'<div class="sp-q">(.*?)</div>', section, flags=re.S)
            self.assertEqual(len(answers), len(faq["items"]))
            for item, markup in zip(faq["items"], answers):
                ways = re.findall(r'<p class="sp-more"><a class="more" href="([^"]+)"><span>(.*?)</span>', markup)
                self.assertEqual([w[1] for w in ways], [x["text"] for x in item.get("links", [])])
                for (href, _), link in zip(ways, item.get("links", [])):
                    target = (path.parent / href / "index.html").resolve()
                    self.assertTrue(target.is_file(), href)
                    other, other_lang = self.page_of(target)
                    self.assertEqual((other["page"]["id"], other_lang), (self.data("en", link["page"])["page"]["id"], lang))
            # each list under its own small heading, its points without a lead, the closing line after the lists
            block = next(b for b in data["blocks"] if b.get("subs") and b.get("end"))
            section = re.search(r'<section [^>]*id="%s"[^>]*>(.*?)</section>' % block["id"], own, flags=re.S).group(1)
            heads = re.findall(r"<h3>(.*?)</h3>", section)
            self.assertEqual(heads, [s["h"] for s in block["subs"]])
            lists = re.findall(r'<ul class="sp-points">(.*?)</ul>', section, flags=re.S)
            self.assertEqual([len(re.findall(r"<li>", x)) for x in lists], [len(s["paras"][0]["points"]) for s in block["subs"]])
            self.assertNotIn("sp-points__lead", "".join(lists))
            self.assertIn(self.words(block["end"][0]).strip()[:40], self.words(section[section.rindex("</ul>"):]))
        self.assertEqual(seen, 2)

    def test_a_neighbour_names_a_page_in_its_own_line_and_the_hub_in_the_lists(self):
        page = self.topic_page("t_rex")
        topic = next(t for w in self.wings().values() if isinstance(w, dict) for t in w.get("topics", []) if t.get("count") == "t_rex")
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            pages = next((b for b in data["blocks"] if b["type"] == "pages"), None)
            item = next((x for x in (pages or {}).get("items", []) if x["page"] == page), None)
            if not item:
                continue
            seen += 1
            own = self.own_part(path.read_text(encoding="utf-8"))
            plain = lambda markup: " ".join(html.unescape(re.sub(r"<[^>]+>", "", markup)).replace("\u00a0", " ").split())
            found = [re.search(r'<p class="sc-item__line">(.*?)</p>', x, flags=re.S).group(1)
                     for x in re.findall(r'<li class="sc-item">(.*?)</li>', own, flags=re.S)
                     if plain(re.search(r"<h[23][^>]*>(.*?)</h[23]>", x, flags=re.S).group(1)) == topic["name"][lang]]
            self.assertEqual(len(found), 1, path)
            self.assertEqual(plain(found[0]), item.get("line") or topic["line"][lang])
        # the hub and the eight neighbours, in both languages
        self.assertEqual(seen, 18)

    def test_a_picture_too_tall_for_the_share_card_stands_whole_above_the_address(self):
        spec = importlib.util.spec_from_file_location("chart_share", self.dir / "chart.py")
        chart = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(chart)
        colours = {k: "#000000" for k in ("linen", "chalk-text", "stone", "frame", "stone-text-2", "chalk", "text-3", "page")}
        words = {"h1": "How big?", "line": "About this", "person": "1.70 m", "site": "museumofages.org"}
        for size, whole in (((3200, 800), True), ((2880, 1200), False)):
            svg = chart.picture_still_svg(words, colours, "x.png", size, (0.5, 0.5))
            x, y, w, h = (float(v) for v in re.search(r'<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"', svg).groups())
            self.assertAlmostEqual(w / h, size[0] / size[1], places=3)
            self.assertLessEqual(y + h, 630 - 84 + 0.01)
            self.assertEqual(w == 1080, whole)

    def test_each_label_stands_at_its_animal(self):
        page = self.scale_page("marks")
        # every page with labels at its subjects, each in both languages
        marked = {self.data("en", p)["page"]["id"] for p in self.pages if "marks" in self.data("en", p)["top"].get("scale", {})}
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] not in marked:
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
                    li = '<li class="sc-mark sc-mark--%s-%s%s">' % (fig["pic"], mark["span"],
                                                                      " sc-mark--height" if mark["span"] in (pic.get("tops") or {}) else "")
                    self.assertIn(li, over if mark["span"] in (pic.get("behind") or []) else under)
                    self.assertNotIn(li, under if mark["span"] in (pic.get("behind") or []) else over)
                    self.assertIn(mark["text"], re.sub(r" ([,.:)])", r"\1", " ".join(self.words(figure).replace("\u00a0", " ").split())))
                    # and each label has its lane on every screen
                    self.assertRegex(text, r"\.sc-mark--%s-%s\{grid-row:\d" % (fig["pic"], re.escape(mark["span"])))
                # where the person's height has no open stone over the person on a narrow screen, it leaves the
                # picture there, and a label names the person
                if pic.get("person_from"):
                    self.assertIn("@media (max-width:%dpx){.sc-person--%s{display:none}}" % (pic["person_from"] - 1, fig["pic"]), text)
                    self.assertIn("person", [m["span"] for m in fig["marks"]])
        self.assertEqual(seen, 2 * len(marked))
        # a label the picture does not place stops the build
        shutil.rmtree(out)
        pic = self.data("en", page)["top"]["scale"]["pic"]
        for lang in ("en", "de"):
            data = self.data(lang, page)
            del data["pics"][pic]["marks"][data["top"]["scale"]["marks"][0]["span"]]
            self.save(lang, data, page)
        self.fails(r"the label '\w[\w-]*' needs pics")

    def test_a_label_over_the_picture_may_name_a_height_and_mark_it_in_the_picture(self):
        """A label over the picture may name a height instead of an animal (pics.<name>.tops): its words whole, a
        dotted line from its bracket through the lanes nearer the picture, and in the picture a line down to that
        height with a bar there as wide as the bracket. A height no label over the picture names stops the build."""
        page = next((p for p in self.scale_pages() if any(pic.get("tops") for pic in self.data("en", p)["pics"].values())), None)
        if not page:
            self.skipTest("no picture names a height over it")
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] != self.data("en", page)["page"]["id"]:
                continue
            text = path.read_text(encoding="utf-8")
            for fig in filter(None, [data["top"].get("scale")] + [b.get("scale") for b in data["blocks"]]):
                pic = data["pics"][fig["pic"]]
                for key, at in (pic.get("tops") or {}).items():
                    seen += 1
                    a, b = (float(x) / 100 for x in pic["marks"][key].split("%")[:2])
                    words = next(m["text"] for m in fig["marks"] if m["span"] == key)
                    # its words whole: no comma parts a name from a length
                    li = re.search(r'<li class="sc-mark sc-mark--%s-%s sc-mark--height"><span class="sc-mark__t"><span class="sc-mark__n">(.*?)</span></span></li>'
                                   % (fig["pic"], key), text)
                    self.assertTrue(li, (lang, key))
                    self.assertEqual(html.unescape(li.group(1)).replace("\u00a0", " "), words)
                    self.assertIn('<span class="sc-height sc-height--%s-%s" aria-hidden="true"></span>' % (fig["pic"], key), text)
                    self.assertIn(".sc-height--%s-%s{left:calc(2px + (100%% - 4px) * %g);width:calc((100%% - 4px) * %g);height:calc((100%% - 4px) * %g)}"
                                  % (fig["pic"], key, round(a, 4), round(b - a, 4), round(float(at[:-1]) / 100, 4)), text)
                    self.assertIn(".sc-mark--%s-%s::before{left:calc(2px + (100%% - 4px) * %g)}" % (fig["pic"], key, round((a + b) / 2, 4)), text)
                    self.assertRegex(text, r"\.sc-mark--%s-%s\{grid-row:\d+;--below:\d" % (fig["pic"], key))
        self.assertTrue(seen)
        shutil.rmtree(out)
        for lang in ("en", "de"):
            data = self.data(lang, page)
            pic = next(pic for pic in data["pics"].values() if pic.get("tops"))
            pic["behind"] = [k for k in pic["behind"] if k not in pic["tops"]]
            self.save(lang, data, page)
        self.fails(r"tops\.\w+ is a height a label over the picture names")

    def test_a_picture_may_give_narrow_screens_a_closer_cut_of_the_same_render(self):
        """A picture at one scale may give narrow screens a closer cut of its render (pics.<name>.narrow): its own
        source first in the picture below its width, the person's height and the labels at their places in it there,
        a label it leaves out hidden there, and the whole picture with its own places from that width up."""
        pages = [p for p in self.scale_pages() if any(pic.get("narrow") for pic in self.data("en", p)["pics"].values())]
        if not pages:
            self.skipTest("no page gives a picture a version for narrow screens")
        ids = {self.data("en", p)["page"]["id"] for p in pages}
        out, written = self.build()
        seen = 0
        place = lambda at: [float(v) for v in at.replace("%", "").split()]
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] not in ids:
                continue
            text = path.read_text(encoding="utf-8")
            for name, pic in data["pics"].items():
                narrow = pic.get("narrow")
                if not narrow or f'{pic["stem"]}-' not in self.own_part(text):
                    continue
                seen += 1
                picture = re.search(r'<picture><source media="\(max-width: %dpx\)" type="image/avif" srcset="[^"]*%s-%d\.avif %dw[^>]*>'
                                    r'<source media="[^"]*" type="image/webp"[^>]*><source type="image/avif" srcset="[^"]*%s-%d\.avif'
                                    % (narrow["below"] - 1, re.escape(narrow["stem"]), narrow["widths"][0], narrow["widths"][0],
                                       re.escape(pic["stem"]), pic["widths"][0]), text)
                self.assertTrue(picture, (name, lang))
                x, top = place(narrow["person"])
                fx, ftop = place(pic["person"])
                self.assertIn(".sc-person--%s{left:%g%%;bottom:calc(%g%% + 4px)}@media (min-width:%dpx){.sc-person--%s{left:%g%%;"
                              % (name, x, round(100 - top, 3), narrow["below"], name, fx), text)
                if (pic.get("person_from") or 0) > narrow["below"]:
                    self.assertIn("@media (min-width:%dpx) and (max-width:%dpx){.sc-person--%s{display:none}}"
                                  % (narrow["below"], pic["person_from"] - 1, name), text)
                left_out = set(pic.get("marks") or {}) - set(narrow.get("marks") or {})
                for key, at in (narrow.get("marks") or {}).items():
                    a, b = (v / 100 for v in place(at))
                    self.assertRegex(text, r"@media \(max-width:%dpx\)\{[^@]*\.sc-mark--%s-%s::after\{left:calc\(2px \+ \(100%% - 4px\) \* %g\)"
                                     % (narrow["below"] - 1, name, re.escape(key), round(a, 4)))
                for key in left_out:
                    self.assertRegex(text, r"@media \(max-width:%dpx\)\{[^@]*\.sc-mark--%s-%s\{display:none\}" % (narrow["below"] - 1, name, re.escape(key)))
        self.assertGreaterEqual(seen, 2 * len(pages))
        shutil.rmtree(out)
        # a narrow version that places a label the picture has not, leaves out another than the person's, takes over
        # at a width the sizes do not name, or has no stem of its own stops the build
        changes = [(lambda n: n.update(below=500), r"narrow\.below is the screen width"),
                   (lambda n: n.update(stem=None), r"narrow is a closer cut under its own stem")]
        page, name = next(((p, n) for p in pages for n, pic in self.data("en", p)["pics"].items() if (pic.get("narrow") or {}).get("marks")),
                          (pages[0], next(n for n, pic in self.data("en", pages[0])["pics"].items() if pic.get("narrow"))))
        if self.data("en", page)["pics"][name]["narrow"].get("marks"):
            changes += [(lambda n: n["marks"].update(nobody="1% 2%"), r"narrow\.marks\.nobody places a label"),
                        (lambda n: n["marks"].pop(next(k for k in n["marks"] if k != "person")), r"has no place in pics\.\w+\.narrow\.marks")]
        original = {lang: self.data(lang, page) for lang in ("en", "de")}
        for change, words in changes:
            for lang in ("en", "de"):
                data = json.loads(json.dumps(original[lang]))
                change(data["pics"][name]["narrow"])
                self.save(lang, data, page)
            self.fails(words)

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
        # rows that start on one line (a picture of rows): their labels keep the words' order, the first nearest
        rows = [("m", 0.15, 0.62, None, "Our Ankylosaurus", "6.4 m"), ("s", 0.15, 0.56, None, "Our Stegosaurus", "about 5.6 m")]
        for width, one_line in ((350, False), (792, True)):
            laid, _ = lib.mark_lanes(rows, width, one_line)
            self.assertEqual((laid["m"][0], laid["s"][0]), (0, 1))
        # rows whose subjects start at different places stack by their starts, or in the rows' order where the picture
        # asks for it (pics.<name>.in_order), where a later label (the person) never stands nearer than an earlier one
        rows = [("a", 0.06, 0.95, None, "Our Argentinosaurus", "about 30.6 m"), ("w", 0.08, 0.75, None, "Our blue whale", "22.86 m"),
                ("m", 0.061, 0.55, None, "Our megalodon", "about 16 m"), ("p", 0.81, 0.83, None, "The person", "1.70 m")]
        for width, one_line in ((350, False), (792, True)):
            laid, _ = lib.mark_lanes(rows[:3], width, one_line)
            self.assertEqual([laid[k][0] for k in "awm"], [0, 2, 1])
            laid, _ = lib.mark_lanes(rows, width, one_line, in_order=True)
            self.assertEqual([laid[k][0] for k in "awmp"], [0, 1, 2, 2])
        # a label that keeps its side keeps it
        laid, _ = lib.mark_lanes([("c", 0.80, 0.95, "start", "Spinosaurus", "about 10 m")], 1200, True)
        self.assertEqual(laid["c"][1], "start")
        # the widths the labels are laid for: the narrowest phones and every width the picture's sizes name
        self.assertEqual(lib.size_bands("(min-width: 1280px) 690px, (min-width: 960px) 54vw, calc(100vw - 40px)"),
                         [(360, 320), (390, 350), (960, 518.4), (1280, 690)])

    def test_a_picture_in_the_body_follows_the_paragraph_it_shows(self):
        page = self.topic_page("biggest_dinosaurs")
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
        # a wing grows a page at a time and a page names the ones it was written to sit beside, so not every page
        # names every other: each names only built pages of the wing in its language, two at least, and none is unnamed
        named = set()
        for (page, lang), targets in links.items():
            others = {p for p in pages if p != page}
            built = {os.path.normpath(path.relative_to(out).parent.as_posix()) for path in written
                     if self.page_of(path)[0]["page"]["id"] in {self.data("en", o)["page"]["id"] for o in others} and self.page_of(path)[1] == lang}
            self.assertLessEqual(targets, built, (page, lang))
            self.assertGreaterEqual(len(targets), 2, (page, lang))
            named |= {(t, lang) for t in targets}
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] in ids:
                self.assertIn((os.path.normpath(path.relative_to(out).parent.as_posix()), lang), named, path)

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
            # the edge and the question's script both read the mark: the wing's own page is never asked, a topic page
            # asks, and a yes there counts the visit alone
            if data["page"].get("hub"):
                self.assertRegex(text, r'<main[^>]*\sdata-unasked[\s>]')
                self.assertNotIn('data-asks=', text)
            else:
                self.assertRegex(text, r'<main[^>]*\sdata-asks="visit"')
                self.assertNotRegex(text, r'<main[^>]*\sdata-unasked[\s>]')
            # only its own languages: no alternate, no menu entry and no link to a language it lacks
            for code in re.findall(r'hreflang="([\w-]+)"', text):
                self.assertIn(code, wing["langs"] + ["x-default"])
            self.assertNotRegex(text, r'href="[^"]*/(fr|it|es|pt-br|bg)/')

    def test_a_page_of_a_wing_in_the_making_names_its_crumb_as_shown(self):
        """The structured data's third crumb is the crumb the page shows, not its heading."""
        self.scale_page()
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            if not self.making(data) or data["page"].get("hub"):
                continue
            text = path.read_text(encoding="utf-8")
            shown = re.search(r'<li aria-current="page">(.*?)</li>', text).group(1)
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S)
                               .group(1).replace("<\\/", "</"))["@graph"]
            crumbs = next(n for n in graph if n["@type"] == "BreadcrumbList")["itemListElement"]
            # the page keeps a short name whole with a no-break space; the data names it plainly
            shown = html.unescape(re.sub(r"<[^>]+>", "", shown)).replace("\u00a0", " ").replace("\u00ad", "")
            self.assertEqual(crumbs[2]["name"], shown, path)
            self.assertNotEqual(crumbs[2]["name"], data["top"]["h1"], path)
            seen += 1
        self.assertGreater(seen, 0)
        shutil.rmtree(out)

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

    def test_a_picture_may_leave_the_persons_height_to_the_label_that_names_the_person(self):
        # a null place: no height over the person's head, the label under the picture names it (a closer panel: the
        # first picture's place also draws the share card)
        page = next((p for p in self.pages if "person" in [m["span"] for m in
                     ((self.data("en", p)["top"].get("scale") or {}).get("close") or {}).get("marks", [])]), None)
        if not page:
            self.skipTest("no closer panel names the person in a label")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            fig = data["top"]["scale"]["close"]
            data["pics"][fig["pic"]]["person"] = None
            data["pics"][fig["pic"]].pop("person_from", None)
            self.save(lang, data, page)
        out, written = self.build()
        mine = [path for path in written if self.page_of(path)[0]["page"]["id"] == data["page"]["id"]]
        self.assertEqual(len(mine), 2)
        for path in mine:
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("sc-person--%s" % fig["pic"], text)
            self.assertIn('<li class="sc-mark sc-mark--%s-person">' % fig["pic"], text)
        # a picture that names no person keeps its place
        shutil.rmtree(out)
        page = self.scale_page()
        for lang in ("en", "de"):
            data = self.data(lang, page)
            data["pics"][data["top"]["scale"]["pic"]]["person"] = None
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

    def test_an_empty_cell_says_on_a_phone_that_it_has_no_sourced_figure(self):
        """On a phone a row is a card without the column heads, so an empty cell carries its words: the page's
        labels.no_figure, shown by the sheet after the cell's label. A table with an empty cell and no such words stops."""
        page = next((p for p in self.scale_pages() for b in self.data("en", p)["blocks"]
                     if b["type"] == "numbers" and any(not c for r in b["rows"] for c in r["cells"])), None)
        if not page:
            self.skipTest("no table has an empty cell")
        out, written = self.build()
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] != self.data("en", page)["page"]["id"]:
                continue
            text = path.read_text(encoding="utf-8")
            empty = re.findall(r'<td role="cell" data-k="[^"]*"([^>]*)></td>', text)
            self.assertTrue(empty)
            self.assertEqual(set(empty), {f' data-none="{data["labels"]["no_figure"]}"'})
            self.assertRegex(text, r"\.sc-table td:empty::after\{content:attr\(data-none\)")
            self.assertNotIn("td:empty{display:none}", text)
        shutil.rmtree(out)
        for lang in ("en", "de"):
            data = self.data(lang, page)
            del data["labels"]["no_figure"]
            self.save(lang, data, page)
        self.fails(r"an empty cell needs labels\.no_figure")

    def test_a_table_of_numbers_is_one_grid_with_its_how_sure_line(self):
        """A table of numbers is one table on every screen: its class names how many columns of figures it has (the
        desktop's grid reads it), the how-sure column is marked in every row, the museum's own row carries its mark, and
        a cell's words stand whole in it, in their order, whatever spans set its figure or its grade word apart."""
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            own = self.own_part(path.read_text(encoding="utf-8"))
            plain = lambda m: html.unescape(re.sub(r"<[^>]+>", "", m)).replace("\u00a0", " ").replace("\u00ad", "")
            for block in (b for b in data["blocks"] if b["type"] == "numbers"):
                with self.subTest(page=data["page"]["id"], lang=lang):
                    sure = block["cols"][-1] in ("How sure", "Wie sicher")
                    figures = len(block["cols"]) - 1 - sure
                    self.assertIn(f'<table class="sc-table sc-table--v{figures}" role="table">', own)
                    table = re.search(r'<table class="sc-table.*?</table>', own, flags=re.S).group(0)
                    rows = re.findall(r"<tr role=\"row\"(?: class=\"sc-our\")?><th scope=\"row\" role=\"rowheader\">.*?</tr>", table, flags=re.S)
                    self.assertEqual(len(rows), len(block["rows"]))
                    for row, html_row in zip(block["rows"], rows):
                        cells = re.findall(r"<td[^>]*>(.*?)</td>", html_row, flags=re.S)
                        self.assertEqual([plain(c) for c in cells], [c.replace("\u00a0", " ").replace("\u00ad", "") for c in row["cells"][1:]])
                        self.assertEqual(html_row.startswith('<tr role="row" class="sc-our">'), bool(re.match(r"(?:Unser|Our)\b", row["cells"][0])))
                        if sure:
                            self.assertEqual(len(re.findall(r'<td role="cell" data-k="[^"]*" class="sc-sure"', html_row)), 1)
                    seen += 1
        self.assertGreater(seen, 0, "no page has a table of numbers")
        shutil.rmtree(out)

    def test_a_part_named_in_a_closer_view_stands_whole_and_only_where_it_is_listed(self):
        # a part of the animal (pics.<name>.parts) is named without a size; any other bare name still stops the build
        def close_pic(p):
            fig = ((self.data("en", p)["top"].get("scale") or {}).get("close")) or {}
            return fig.get("pic") if (self.data("en", p)["pics"].get(fig.get("pic")) or {}).get("parts") else None
        page = next((p for p in self.pages if close_pic(p)), None)
        if not page:
            self.skipTest("no closer view names a part")
        pic = close_pic(page)
        out, written = self.build()
        data = self.data("en", page)
        mine = [path for path in written if self.page_of(path)[0]["page"]["id"] == data["page"]["id"]]
        self.assertEqual(len(mine), 2)
        for path in mine:
            text = path.read_text(encoding="utf-8")
            for span in data["pics"][pic]["parts"]:
                self.assertRegex(text, r'<li class="sc-mark sc-mark--%s-%s"><span class="sc-mark__t"><span class="sc-mark__n">'
                                       r'[^<,]+</span></span></li>' % (pic, span))
        shutil.rmtree(out)
        originals = {lang: self.data(lang, page) for lang in ("en", "de")}
        cases = [
            (lambda d: d["pics"][pic].update(parts=d["pics"][pic]["parts"][1:]), r"gives the animal's name, a comma and its length"),
            (lambda d: [m.update(text=m["text"] + ", 1 m") for m in d["top"]["scale"]["close"]["marks"]
                        if m["span"] == d["pics"][pic]["parts"][0]], r"names a part .*: its name only, no comma"),
            (lambda d: d["pics"][pic]["parts"].append("nothing"), r"parts names 'nothing', which no label of the picture is"),
        ]
        for change, words in cases:
            with self.subTest(words=words):
                for lang, original in originals.items():
                    d = json.loads(json.dumps(original))
                    change(d)
                    self.save(lang, d, page)
                self.fails(words)
                for lang, original in originals.items():
                    self.save(lang, original, page)

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
            # a key is one line, or lines each leading with its swatch
            for key in [k if isinstance(k, str) else k["text"] for key in keys for k in ([key] if isinstance(key, str) else key)]:
                self.assertIn(html.escape(key, quote=True)[:12], own)
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
        # a genus alone is one word: nothing to hold on one line, so it is only never hyphenated, as on a page that joins
        single = {n["text"] for n in names if n.get("taxon") and not n.get("whole")}
        if not taxa:
            self.skipTest("no scientific name on the list")
        out, written = self.build()
        found = 0
        for path in written:
            data, _ = self.page_of(path)
            own = self.own_part(path.read_text(encoding="utf-8"))
            for name in taxa:
                if name in self.words(own).replace("\u00a0", " "):
                    found += 1
                    if data["page"].get("join_names") or name in single:
                        joined = html.escape(name, quote=False).replace(" ", "\u00a0")
                        # in a table's row name the two words may wrap (build.py row_name): held there by its class only
                        plain = html.escape(name, quote=False)
                        self.assertRegex(own, f'<i class="nh">{re.escape(joined)}</i>'
                                              f'|role="rowheader">(?:(?!</th>).)*<i class="nh">{re.escape(plain)}</i>')
                    else:
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
                    # a card that sets its words beside its picture wraps the line over several rows
                    said = " ".join(re.findall(r"<text [^>]*>([^<]*)</text>", job["svg"]))
                    self.assertIn(html.escape(line.replace("\u00a0", " "), quote=False), said)
                    # and a second line, under the picture, where the page gives one
                    second = self.data(job["lang"], page)["labels"].get("og_second")
                    if second:
                        self.assertIn(html.escape(second.replace("\u00a0", " "), quote=False), said)
            # beside its words a picture whose person stands clear only on wider screens shows no height over it
            d = self.data("en", page)
            pic = {} if d["page"].get("hub") else d["pics"][d["top"]["scale"]["pic"]]
            if d["page"]["og_image"].get("layout") == "beside" and pic.get("person_from"):
                for job in jobs:
                    person = self.data(job["lang"], page)["labels"]["person"].replace("\u00a0", " ")
                    self.assertNotIn(f">{html.escape(person, quote=False)}</text>", job["svg"], (page, job["lang"]))
        if not lines:
            self.skipTest("no page gives an answer line for its share picture")

    def plate_page(self):
        """The first page whose share picture shows its marked work itself (page.og_image.plate) at the person's scale."""
        return next((p for p in self.pages if self.data("en", p)["page"]["og_image"].get("plate") and "figure" in self.data("en", p)["top"]), None)

    def test_a_sizes_share_picture_shows_its_marked_work(self):
        page = self.plate_page()
        if not page:
            self.skipTest("no share picture shows a plate")
        spec = importlib.util.spec_from_file_location("build_plate", self.dir / "build.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.WINGS_FILE = self.registry
        module.LANGS = tuple(c for c in module.LANGS if c in ("en", "de"))
        jobs = [j for j in module.still_jobs() if j.get("page") == page and j["kind"] == "share"]
        self.assertEqual({j["lang"] for j in jobs}, {"en", "de"})
        stem = self.data("en", page)["page"]["og_image"]["plate"]
        for job in jobs:
            data = self.data(job["lang"], page)
            # the plate's largest cut, kept in full colour, under the page's heading and the work's size
            self.assertTrue(job.get("raster"))
            self.assertRegex(job["svg"], r'xlink:href="@pics@/%s-\d+\.webp"' % re.escape(stem))
            said = " ".join(re.findall(r"<text [^>]*>([^<]*)</text>", job["svg"]))
            self.assertIn(html.escape(data["meta"]["og_title"].split("? ")[-1].replace(" ", " "), quote=False), said)
            self.assertIn(data["labels"]["person"].replace(" ", " "), said)
            # drawn at the person's scale: the work's height to the person's is the facts' own ratio
            tall = lambda tag: float(re.search(tag + r'[^>]*?height="([\d.]+)"', job["svg"]).group(1))
            person = re.search(r'<path transform="translate\([\d.]+ [\d.]+\) scale\(([\d.]+)\)', job["svg"])
            work = tall(r"<image ")
            self.assertAlmostEqual(work / (float(person.group(1)) * 1700), 79.4 / 170, places=3)
        out, written = self.build()
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] != self.data("en", page)["page"]["id"]:
                continue
            text = path.read_text(encoding="utf-8")
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            frame = next(n for n in graph if n.get("@id", "").endswith("#frame"))
            share = data["page"]["og_image"]["file"].replace("{lang}", lang)
            plain = lambda s: s.replace("\u00a0", " ")
            self.assertIn(f'<meta property="og:image" content="https://museumofages.org/static/img/{share}">', text)
            figure = data["page"]["still"].get("figure")
            if figure:
                # the first screen's drawing as a picture without the card's words is the page's own picture
                self.assertTrue(frame["url"].endswith("/" + figure.replace("{lang}", lang)), frame["url"])
                self.assertEqual(frame["description"], plain(data["top"]["figure"]["alt"]))
            else:
                self.assertTrue(frame["url"].endswith("/" + share), frame["url"])
                self.assertEqual((frame["caption"], frame["description"]), (plain(data["meta"]["og_title"]), plain(data["meta"]["og_image_alt"])))
            # the chart's still, which the page links, still ships beside it
            chart = data["page"]["still"]["file"].replace("{lang}", lang)
            self.assertIn(f"static/img/{chart}", text)
            self.assertTrue((out / "static" / "img" / chart).is_file())

    def test_a_share_plate_of_another_work_stops_the_build(self):
        page = self.plate_page()
        if not page:
            self.skipTest("no share picture shows a plate")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            data["page"]["og_image"]["plate"] = "vinci-plate-lady-with-an-ermine"
            self.save(lang, data, page)
        self.fails(r"page\.og_image\.plate 'vinci-plate-lady-with-an-ermine' is of 'lady-with-an-ermine'")

    def test_a_share_plate_keeps_the_works_shape(self):
        page = self.plate_page()
        if not page:
            self.skipTest("no share picture shows a plate")
        spec = importlib.util.spec_from_file_location("build_shape", self.dir / "build.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        stem = self.data("en", page)["page"]["og_image"]["plate"]
        work = module.plates()[stem]["work"]

        class Square:
            def by_id(self, key):
                return {"id": key, "h": 50.0, "w": 50.0}
        self.assertRegex(" ".join(module.share_plate_problems(stem, Square(), work)), r"not the shape of the work's 50 by 50 cm")

    def test_a_page_names_a_picture_further_down_as_its_own(self):
        page = next((p for p in self.pages if self.data("en", p)["page"].get("primary")), None)
        if not page:
            self.skipTest("no page names a picture of its blocks as its own")
        out, written = self.build()
        found = 0
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] != self.data("en", page)["page"]["id"]:
                continue
            found += 1
            text = path.read_text(encoding="utf-8")
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            frame = next(n for n in graph if n.get("@id", "").endswith("#frame"))
            stem = data["pics"][data["page"]["primary"]]["stem"]
            self.assertRegex(frame["contentUrl"], r"/%s-\d+\.webp$" % re.escape(stem))
            # the page and its article both name it, and it is a picture the page shows
            self.assertEqual(next(n for n in graph if n["@type"] == "WebPage")["primaryImageOfPage"]["@id"], frame["@id"])
            self.assertEqual(next(n for n in graph if n["@type"] == "Article")["image"]["@id"], frame["@id"])
            self.assertIn(frame["contentUrl"].rsplit("/", 1)[1], self.own_part(text))
            # the first screen keeps its own picture
            first = re.search(r'<img src="[^"]*/([\w-]+)-\d+\.webp"', self.own_part(text)).group(1)
            self.assertEqual(first, data["pics"][data["top"]["frame"]["pic"]]["stem"])
        self.assertEqual(found, 2)
        shutil.rmtree(out)
        for lang in ("en", "de"):
            data = self.data(lang, page)
            data["page"]["primary"] = "nowhere"
            self.save(lang, data, page)
        self.fails(r"page\.primary 'nowhere' names no picture the page's blocks show with its words")

    def test_a_second_share_line_stands_only_under_a_picture_beside_its_words(self):
        page = next((p for p in self.scale_pages() if self.data("en", p)["page"]["og_image"].get("layout") != "beside"
                     and not self.data("en", p)["page"].get("hub")), None)
        if not page:
            self.skipTest("every scale page sets its share words beside its picture")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            data["labels"]["og_second"] = "a line under the picture"
            self.save(lang, data, page)
        self.fails(r"labels\.og_second, the share picture's line under its picture, stands only with labels\.og_answer")

    def test_each_cell_of_the_numbers_holds_its_words_in_one_element(self):
        out, written = self.build()
        cells = 0
        for path in written:
            for cell in re.findall(r'<td role="cell" data-k="[^"]*">(.*?)</td>', path.read_text(encoding="utf-8")):
                cells += 1
                # empty, or one span around the words, so a name's span never takes a grid place of its own
                if cell:
                    self.assertRegex(cell, r"^<span>.*</span>$", path)
                    # spans inside it (a figure holding a name) are inline: strip them from the innermost out
                    inner, before = cell[6:-7], None
                    while inner != before:
                        before, inner = inner, re.sub(r"<span[^>]*>[^<]*</span>", "", inner)
                    self.assertNotRegex(inner, r"<", path)
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
            # a name held whole (join_names) is its own span: the words around it part by spaces only
            self.assertIn(guess["a"][:40], re.sub(r"\s+", " ", self.words(details.group(1)).replace("\u00a0", " ")))
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
            self.assertNotRegex(self.words(loose), r"(?<!\w)%s(?:'s|’s|s)?(?!\w)" % re.escape(name))

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

    def test_a_page_may_give_a_long_word_its_one_break_point(self):
        """German hyphenates running text on a phone and may break a long name where it reads wrong (Giraf-fatitan). A
        page may give such words their one break point (page.breaks, "Giraffa|titan"): in running text the word is two
        halves never hyphenated, joined by a soft hyphen; in display text (a heading, the answer, a table's cell) it is
        only kept whole. A page without breaks sets no such word."""
        out, written = self.build()
        seen = 0
        for path in written:
            data, lang = self.page_of(path)
            own = self.own_part(path.read_text(encoding="utf-8"))
            breaks = data["page"].get("breaks", [])
            if not breaks:
                self.assertNotIn('</span>&shy;<span class="nh">', own)
                continue
            display = re.findall(r'<h[1-6][\s>].*?</h[1-6]>|<p class="sp-answer">.*?</p>|<td[\s>].*?</td>', own, flags=re.S)
            for word in breaks:
                head, tail = word.split("|")
                self.assertIn(f'<span class="nh">{head}</span>&shy;<span class="nh">{tail}', own)
                seen += 1
                for part in display:
                    self.assertNotIn("&shy;", part)
        self.assertGreater(seen, 0, "no page gives a word its break point")

    def test_a_foreign_name_is_never_hyphenated(self):
        names = json.loads((self.dir / "names.json").read_text(encoding="utf-8"))["names"]
        out, written = self.build()
        for path in written:
            text = path.read_text(encoding="utf-8")
            data, lang = self.page_of(path)
            own = self.own_part(text)
            self.assertIn(".nh{hyphens:none", text)
            spans = re.findall(r'<(?:span|i) class="(?:nw nh|nh)"(?: lang="(\w+)")?>([^<]*)</(?:span|i)>', own)
            # a name held whole by no-break spaces is the same name
            marked = {html.unescape(word).replace("\u00a0", " "): code for code, word in spans}
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
            # the chart is the page's picture, or, where its share picture shows the work itself, described beside it
            data = self.data(lang, self.works_page)
            still = data["page"]["still"]["file"].replace("{lang}", lang)
            image = next(n for n in graph if n["@type"] == "ImageObject" and n.get("url", "").endswith("/" + still))
            chart = next(b for b in data["blocks"] if b["type"] == "chart")
            self.assertTrue(image["@id"].endswith("#chart" if data["page"]["og_image"].get("plate") else "#frame"))
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
            for b, field in ((b, k) for b in data["blocks"] for k in ("paras", "known", "end") if k in b):
                b[field] = ["".join(x if isinstance(x, str) else x["text"] for x in p) if isinstance(p, list) and
                            any(isinstance(x, dict) and x.get("page") == self.works_page for x in p) else p for p in b[field]]
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

    # ---- a page of questions: its answer first, the list of its questions, each answer first, its FAQ data ----

    def ask_page(self):
        """The first page of questions: its first part lists them (top.jump) and its blocks ask them (question). A page
        about one work that hangs its plate in its first part (top.plate) has a test of its own."""
        return next((p for p in self.pages if self.data("en", p)["top"].get("jump") and not self.data("en", p)["top"].get("plate")
                     and any(b["type"] == "question" for b in self.data("en", p)["blocks"])), None)

    def test_a_page_of_questions_answers_first_and_lists_its_questions_in_its_first_part(self):
        page = self.ask_page()
        if not page:
            self.skipTest("no page lists its questions in its first part")
        out, written = self.build()
        for path in written:
            data, lang = self.page_of(path)
            if data["page"]["id"] != self.data("en", page)["page"]["id"]:
                continue
            text = path.read_text(encoding="utf-8")
            own = self.own_part(text)
            top = re.search(r'<header class="sp-top\b.*?</header>', own, flags=re.S).group(0)
            # the first part: the answer, the door, then the list of the page's parts, and no picture
            self.assertNotIn("<img", top)
            self.assertLess(top.index('class="sp-answer"'), top.index('data-door="top"'))
            self.assertLess(top.index('data-door="top"'), top.index('class="sp-toc sp-toc--top"'))
            listed = re.findall(r'<li><a href="#([\w-]+)">', top)
            self.assertEqual(listed, [b["id"] for b in data["blocks"] if b.get("nav")])
            # its text has no column beside it: one list only
            self.assertEqual(own.count('class="sp-toc'), 1)
            self.assertIn('class="sp-grid sp-grid--solo"', own)
            asked = [b for b in data["blocks"] if b["type"] == "question"]
            self.assertGreaterEqual(len(asked), 2)
            # the words as shown: a name's span adds no space
            bare = lambda markup: html.unescape(re.sub(r"<[^>]+>", "", markup)).replace("\u00a0", " ")
            for b in asked:
                section = re.search(r'<section class="sp-sec sp-prose sp-ask" id="%s">(.*?)</section>' % b["id"], own, flags=re.S).group(1)
                # the heading, then the answer before anything else, then what is known and what is not
                first = re.search(r"<h2>.*?</h2>\s*<p class=\"([\w_-]+)\">(.*?)</p>", section, flags=re.S)
                self.assertEqual(first.group(1), "sp-ask__a")
                self.assertEqual(bare(first.group(2)), b["answer"].replace("\u00a0", " "))
                if b.get("open"):
                    self.assertLess(section.index("sp-ask__a"), section.index("sp-ask__open"))
            # the FAQ data: the first heading with the first screen's answer, then each question with its answer, each
            # shown on the page
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            faq = next(n for n in graph if n.get("@type") == "FAQPage")
            want = [(data["top"]["h1"], data["top"]["answer"])] + [(b["h"], b["answer"]) for b in asked]
            nb = lambda s: s.replace(" ", " ")
            self.assertEqual([(nb(q["name"]), nb(q["acceptedAnswer"]["text"])) for q in faq["mainEntity"]], want)
            flat = re.sub(r"\s+", " ", bare(own))
            for q, a in want:
                self.assertIn(re.sub(r"\s+", " ", q), flat)
                self.assertIn(re.sub(r"\s+", " ", a.replace(" ", " ")), flat)
            # the page's picture is the plate the page's words call a reproduction (page.primary), else its share picture,
            # which shows that plate
            frame = next(n for n in graph if n.get("@id", "").endswith("#frame"))
            if data["page"].get("primary"):
                stem = data["pics"][data["page"]["primary"]]["stem"]
                self.assertRegex(frame["url"], r"/%s-\d+\.webp$" % re.escape(stem))
                self.assertIn(f'img/{frame["url"].rsplit("/", 1)[-1]}"', own)
            else:
                self.assertTrue(frame["url"].endswith("/" + data["page"]["og_image"]["file"].replace("{lang}", lang)))
            # every way into the walk opens the wing at the page's stop: the top, the sentence in a section, the end
            wing = self.wings()[data["page"]["wing"]]
            door = re.escape(wing["door"][lang].replace("&", "&amp;") + "#s=" + data["page"]["stop"])
            for place in ("top", "item", "end"):
                self.assertRegex(text, r'<a (?:class="(?:door|more)" )?href="%s"[^>]*data-door="%s"' % (door, place))

    def test_a_plate_under_a_question_carries_the_line_its_record_asks_for(self):
        page = self.ask_page()
        if not page:
            self.skipTest("no page lists its questions in its first part")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            block = next(b for b in data["blocks"] if b.get("pic"))
            block["pic"]["src"] = [p.rsplit(". ", 1)[0] + "." if isinstance(p, str) and p.count(". ") else p for p in block["pic"]["src"]]
            self.save(lang, data, page)
        self.fails(r"carries '(?:Non-profit cultural use|Kulturelle Nutzung ohne Gewinnabsicht)\.' in its source line")

    def test_a_link_into_the_walk_inside_a_sentence_names_a_stop_of_the_facts(self):
        page = self.ask_page()
        if not page:
            self.skipTest("no page lists its questions in its first part")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            for b in data["blocks"]:
                for p in b.get("end", []):
                    for x in p if isinstance(p, list) else []:
                        if isinstance(x, dict) and "stop" in x:
                            x["stop"] = "nowhere"
            self.save(lang, data, page)
        self.fails(r"is 'nowhere', which is no stop of the wing's facts")

    def test_a_list_of_one_languages_entries_stands_in_that_language_alone(self):
        page = self.ask_page()
        if not page:
            self.skipTest("no page lists its questions in its first part")
        data = self.data("en", page)
        block = next(b for b in data["blocks"] if b["type"] == "question")
        block["links"] = [{"text": "One way on", "page": page, "only": "en"}]
        self.save("en", data, page)
        out, written = self.build()
        self.assertEqual(len(written), 2 * len(self.pages))
        data["blocks"][0]["links"][0]["only"] = "de"
        self.save("en", data, page)
        shutil.rmtree(out)
        self.fails(r"an entry marked only 'de' stands in the en file")

    def test_a_list_of_questions_needs_its_parts_in_the_list(self):
        page = self.ask_page()
        if not page:
            self.skipTest("no page lists its questions in its first part")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            for b in data["blocks"]:
                b["nav"] = ""
            self.save(lang, data, page)
        self.fails(r"top\.jump lists the page's questions, and no block names its place in the list")

    # ---- a page of questions with rows inside a question, a short table of words, and only its own questions ----

    def rows_page(self):
        """The first page whose questions carry rows (question.lists)."""
        return next((p for p in self.pages if any(b.get("lists") for b in self.data("en", p)["blocks"])), None)

    def built_of(self, written, page, lang):
        pid = self.data(lang, page)["page"]["id"]
        return next(p for p in written if self.page_of(p)[0]["page"]["id"] == pid and self.page_of(p)[1] == lang)

    def test_rows_inside_a_question_stand_as_the_paintings_page_rows_in_their_groups(self):
        page = self.rows_page()
        if not page:
            self.skipTest("no question carries rows")
        out, written = self.build()
        bare = lambda markup: html.unescape(re.sub(r"<[^>]+>", "", markup)).replace(" ", " ")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            own = self.own_part(self.built_of(written, page, lang).read_text(encoding="utf-8"))
            for b in (b for b in data["blocks"] if b.get("lists")):
                section = re.search(r'<section class="sp-sec sp-prose sp-ask" id="%s">(.*?)</section>' % b["id"], own, flags=re.S).group(1)
                # the answer first, then the rows, then what is open
                self.assertLess(section.index("sp-ask__a"), section.index("sp-ask__rows"))
                if b.get("open"):
                    self.assertLess(section.rindex("sp-ask__rows"), section.index("sp-ask__open"))
                lists = re.findall(r'<div class="sp-notes sp-ask__rows">\s*<dl class="sp-dir sp-dir--long">(.*?)</dl>\s*</div>', section, flags=re.S)
                self.assertEqual(len(lists), len(b["lists"]))
                # a group's heading over its rows, in the list's order; a list without a heading stands bare
                heads = re.findall(r'<div class="sp-ask__group">\s*<h3>(.*?)</h3>', section)
                self.assertEqual([bare(h) for h in heads], [x["h"].replace(" ", " ") for x in b["lists"] if x.get("h")])
                for shown, item in zip(lists, b["lists"]):
                    terms = [bare(t) for t in re.findall(r"<dt>(.*?)</dt>", shown, flags=re.S)]
                    self.assertEqual(len(terms), len(item["rows"]))
                    self.assertEqual(len(re.findall(r"<dd>", shown)), len(item["rows"]))
                if b.get("lists_intro"):
                    before = re.sub(r"\s+", " ", bare(section[:section.index("sp-ask__rows")]))
                    self.assertIn(re.sub(r"\s+", " ", b["lists_intro"].replace("\u00a0", " ")), before)
            # the rows' sheet comes with the page, and only with a page that has rows or a table
            self.assertIn(".sp-ask__group{", self.built_of(written, page, lang).read_text(encoding="utf-8"))
        other = self.ask_page()
        if other and other != page:
            self.assertNotIn(".sp-ask__group{", self.built_of(written, other, "en").read_text(encoding="utf-8"))

    def test_a_short_table_of_words_reads_as_a_table_and_as_cards(self):
        page = next((p for p in self.pages if any(b["type"] == "ledger" for b in self.data("en", p)["blocks"])), None)
        if not page:
            self.skipTest("no page holds a short table of words")
        out, written = self.build()
        bare = lambda markup: html.unescape(re.sub(r"<[^>]+>", "", markup)).replace(" ", " ")
        for lang in ("en", "de"):
            data = self.data(lang, page)
            block = next(b for b in data["blocks"] if b["type"] == "ledger")
            own = self.own_part(self.built_of(written, page, lang).read_text(encoding="utf-8"))
            section = re.search(r'<section class="sp-sec lg-sec" id="%s" aria-labelledby="%s-h">(.*?)</section>' % (block["id"], block["id"]),
                                own, flags=re.S).group(1)
            table = re.search(r'<table class="lg-table" role="table"[^>]*>(.*?)</table>', section, flags=re.S).group(1)
            # the roles stay set, since a table shown as blocks on a phone loses them in some readers
            heads = re.findall(r'<th scope="col" role="columnheader">(.*?)</th>', table)
            self.assertEqual([bare(h) for h in heads], [c.replace(" ", " ") for c in block["cols"]])
            rows = re.findall(r'<tr role="row"><th scope="row" role="rowheader">(.*?)</th>(.*?)</tr>', table)
            self.assertEqual([bare(r[0]) for r in rows], [r["cells"][0].replace(" ", " ") for r in block["rows"]])
            for (_, cells), row in zip(rows, block["rows"]):
                # each cell names its column for the phone's cards, and holds its words in one element
                keys = re.findall(r'<td role="cell" data-k="([^"]*)"><span>', cells)
                self.assertEqual([html.unescape(k) for k in keys], block["cols"][1:])
            self.assertLess(section.index('class="sp-intro"'), section.index("lg-table"))
            self.assertLess(section.index("lg-table"), section.index("lg-note"))
        # a row short of a cell stops the build
        for lang in ("en", "de"):
            data = self.data(lang, page)
            next(b for b in data["blocks"] if b["type"] == "ledger")["rows"][0]["cells"].pop()
            self.save(lang, data, page)
        shutil.rmtree(out)
        self.fails(r"a row of the table has not one cell per column")

    def test_a_page_of_questions_without_its_first_answer_asks_only_its_sections(self):
        page = next((p for p in self.pages if self.data("en", p)["top"].get("jump") and not self.data("en", p)["top"].get("faq")
                     and any(b["type"] == "question" for b in self.data("en", p)["blocks"])), None)
        if not page:
            self.skipTest("every page of questions asks its first heading too")
        out, written = self.build()
        for lang in ("en", "de"):
            data = self.data(lang, page)
            text = self.built_of(written, page, lang).read_text(encoding="utf-8")
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            faqs = [n for n in graph if n.get("@type") == "FAQPage"]
            self.assertEqual(len(faqs), 1)
            nb = lambda s: s.replace(" ", " ")
            self.assertEqual([(nb(q["name"]), nb(q["acceptedAnswer"]["text"])) for q in faqs[0]["mainEntity"]],
                             [(nb(b["h"]), nb(b["answer"])) for b in data["blocks"] if b["type"] == "question"])
            self.assertNotIn(nb(data["top"]["h1"]), [nb(q["name"]) for q in faqs[0]["mainEntity"]])

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
            # the page's picture in the structured data is the drawing: baked without the card's words where the page
            # asks for it (page.still.figure), else its share picture; the share picture stays the preview
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            image = next(n for n in graph if n["@id"].endswith("#frame"))
            share = data["page"]["og_image"]["file"].replace("{lang}", lang)
            own = (data["page"].get("still") or {}).get("figure", share).replace("{lang}", lang)
            self.assertTrue(image["url"].endswith("/" + own), image["url"])
            self.assertIn(f'<meta property="og:image" content="https://museumofages.org/static/img/{share}">', text)

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
                # the class word, with its class for the tally's mark beside it
                self.assertEqual(plain(re.search(r'<span class="pt-class pt-class--(\w+)">(.*?)</span>', body).group(2)), classes[lang][fact["class"]], key)
                self.assertEqual(re.search(r'<span class="pt-class pt-class--(\w+)">', body).group(1), fact["class"] or "field", key)
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

    # ---- a page of questions about one work: its plate in the first part, its story in dated lines ----

    def work_page(self):
        """The first page of questions that hangs its work's plate in its first part (top.plate)."""
        return next((p for p in self.pages if self.data("en", p)["top"].get("plate")
                     and any(b["type"] == "question" for b in self.data("en", p)["blocks"])), None)

    def test_a_page_about_one_work_hangs_its_open_plate_after_the_answer_and_tells_its_story_by_dated_lines(self):
        """The first part: the answer, the work's plate with its source line, the door, then the list of the page's parts.
        The plate is open at its source (the first tier) and loads first. The story's lines stand in the data's order, each
        with its date, the word of its mark and the bead of that mark's grade, and none is a row of the wing's timeline.
        The FAQ data is the first heading with the answer, then each question with its answer."""
        page = self.work_page()
        if not page:
            self.skipTest("no page of questions hangs a plate in its first part")
        beads = {"mark_documented": "documented", "mark_inferred": "reconstructed", "mark_tradition": "conjectural",
                 "mark_report": "conjectural"}
        plain = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).replace("\u00a0", " ").replace("\u00ad", "")
        plates = {x["name"]: x for x in json.loads((HERE / "pictures.json").read_text(encoding="utf-8"))["plates"]}
        out, written = self.build()
        for lang in ("en", "de"):
            data = self.data(lang, page)
            text = self.built_of(written, page, lang).read_text(encoding="utf-8")
            own = self.own_part(text)
            top = re.search(r'<header class="sp-top\b.*?</header>', own, flags=re.S).group(0)
            stem = data["pics"][data["top"]["plate"]["pic"]]["stem"]
            self.assertEqual(plates[stem]["tier"], "TIER1")
            self.assertEqual(len(re.findall(r"<figure\b", top)), 1)
            self.assertLess(top.index('class="sp-answer"'), top.index("<figure"))
            self.assertLess(top.index("</figure>"), top.index('data-door="top"'))
            self.assertLess(top.index('data-door="top"'), top.index('class="sp-toc sp-toc--top"'))
            fig = re.search(r"<figure\b.*?</figure>", top, flags=re.S).group(0)
            self.assertIn(f"img/{stem}-640.webp", fig)
            self.assertIn('fetchpriority="high"', fig)
            self.assertIn(plain(data["top"]["plate"]["title"]), plain(fig))
            self.assertRegex(fig, r'<span class="label__src">[^<]*\S')
            # the story: every dated line in order, its mark's word and bead
            story = next(b for b in data["blocks"] if b["type"] == "years")
            self.assertNotIn("periods", story)
            shown = re.findall(r'<li class="lf-line" id="([\w-]+)">\s*<p class="lf-line__when"><span class="lf-date">(.*?)</span> '
                               r'<span class="lf-mark"><span class="bead bead--(\w+)" aria-hidden="true"></span><span class="vh">.*?</span>'
                               r'(.*?)</span></p>\s*<p class="lf-line__what">(.*?)</p>', own, flags=re.S)
            self.assertEqual([s[0] for s in shown], [x["id"] for x in story["items"]])
            for (_, date, bead, mark, line), x in zip(shown, story["items"]):
                self.assertEqual((plain(date), plain(mark), bead, plain(line)),
                                 (x["date"].replace("\u00a0", " "), data["labels"][x["k"]], beads[x["k"]], x["line"].replace("\u00a0", " ")))
            # the page carries the questions' sheet and the dated lines' sheet
            self.assertIn(".sp-ask__a{", text)
            self.assertIn(".lf-line{", text)
            # the FAQ: the first heading with the first screen's answer, then each question with its answer
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            faq = next(n for n in graph if n.get("@type") == "FAQPage")["mainEntity"]
            want = [(data["top"]["h1"], data["top"]["answer"])] + [(b["h"], b["answer"]) for b in data["blocks"] if b["type"] == "question"]
            nb = lambda s: s.replace("\u00a0", " ")
            self.assertEqual([(nb(q["name"]), nb(q["acceptedAnswer"]["text"])) for q in faq], [(nb(q), nb(a)) for q, a in want])
        # a page of questions without a plate keeps its first part free of pictures and its sheet free of the work's rules
        other = self.ask_page()
        if other:
            text = self.built_of(written, other, "en").read_text(encoding="utf-8")
            self.assertNotIn("<img", re.search(r'<header class="sp-top\b.*?</header>', text, flags=re.S).group(0))
            self.assertNotIn(".lf-lines--story{", text)

    def test_a_line_of_a_works_story_with_a_mark_the_site_has_no_bead_for_stops_the_build(self):
        page = self.work_page()
        if not page:
            self.skipTest("no page of questions hangs a plate in its first part")
        data = self.data("de", page)
        story = next(b for b in data["blocks"] if b["type"] == "years")
        story["items"][0]["k"] = "mark_rumour"
        self.save("de", data, page)
        self.fails(r"the mark 'mark_rumour' is none of")

    # ---- a life told by its periods ----

    def life_page(self):
        page = next((p for p in self.pages if any(b["type"] == "years" and b.get("periods") for b in self.data("en", p)["blocks"])), None)
        if not page:
            self.skipTest("no page tells a life by its periods")
        return page

    def test_a_life_page_shows_each_dated_line_with_its_date_and_mark(self):
        """Each dated line stands in the data's order with its row's address, its date, the word of its mark and the bead
        of that mark's grade; the first screen leads to every period and every question; the questions' structured data
        give each answer as the page shows it, the answer and what is known behind it."""
        page = self.life_page()
        beads = {"mark_documented": "documented", "mark_inferred": "reconstructed", "mark_tradition": "conjectural"}
        plain = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).replace("\u00a0", " ").replace("\u00ad", "")
        out, written = self.build()
        for lang in ("en", "de"):
            data = self.data(lang, page)
            path = next(p for p in written if self.page_of(p) == (data, lang))
            text = path.read_text(encoding="utf-8")
            own = self.own_part(text)
            lines = [x for b in data["blocks"] if b["type"] == "years" for p in b["periods"] for x in p["items"]]
            shown = re.findall(r'<li class="lf-line" id="([\w-]+)">\s*<p class="lf-line__when"><span class="lf-date">(.*?)</span> '
                               r'<span class="lf-mark"><span class="bead bead--(\w+)" aria-hidden="true"></span><span class="vh">.*?</span>'
                               r'(.*?)</span></p>\s*<p class="lf-line__what">(.*?)</p>', own, flags=re.S)
            self.assertEqual([s[0] for s in shown], [x["id"] for x in lines])
            for (_, date, bead, mark, line), x in zip(shown, lines):
                self.assertEqual((plain(date), plain(mark), bead, plain(line)),
                                 (x["date"], data["labels"][x["k"]], beads[x["k"]], x["line"]))
            jump = re.search(r'<div class="lf-jump">(.*?)\n      </div>', own, flags=re.S).group(1)
            parts = [x["id"] for b in data["blocks"] if b["type"] in ("years", "faq") for x in b.get("periods") or b["items"]]
            self.assertTrue(set(parts) <= set(re.findall(r'href="#([\w-]+)"', jump)))
            graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S).group(1).replace("<\\/", "</"))["@graph"]
            faq = next(n for n in graph if n["@type"] == "FAQPage")["mainEntity"]
            items = next(b for b in data["blocks"] if b["type"] == "faq")["items"]
            self.assertEqual([(q["name"], q["acceptedAnswer"]["text"].replace("\u00a0", " ")) for q in faq],
                             [(i["q"], f'{i["a"]} {i["known"]}') for i in items])
            for i in items:
                self.assertIn(f'id="{i["id"]}"', own)

    def test_a_dated_line_off_the_wings_timeline_stops_the_build(self):
        page = self.life_page()
        cases = [("en", "date", "16 April 1452", r"is not the timeline's '15 April 1452'"),
                 ("de", "k", "mark_inferred", r"the mark 'mark_inferred' is not the timeline's 'documented'"),
                 ("en", "id", "life-99", r"no row of the wing's timeline")]
        for lang, key, value, words in cases:
            with self.subTest(key=key):
                data = self.data(lang, page)
                entry = next(b for b in data["blocks"] if b["type"] == "years")["periods"][0]["items"][0]
                keep = entry[key]
                entry[key] = value
                self.save(lang, data, page)
                self.fails(words)
                entry[key] = keep
                self.save(lang, data, page)
        # a date wider than the row's stands only with the row's own date beside it (wing_date)
        data = self.data("en", page)
        entry = next(x for b in data["blocks"] if b["type"] == "years" for p in b["periods"] for x in p["items"] if x.get("wing_date"))
        del entry["wing_date"]
        self.save("en", data, page)
        self.fails(r"the date .* is not the timeline's")


class Built(unittest.TestCase):
    """The site as its own build wrote it (python3 _src/build.py): the topic pages with their count."""

    def test_a_topic_page_reaches_the_count_by_its_key(self):
        wings = json.loads(REGISTRY.read_text(encoding="utf-8"))
        lists = (HERE.parent / "functions" / "_count" / "lists.js").read_text(encoding="utf-8")
        kinds = json.loads(re.search(r"PAGE_KINDS = Object\.freeze\((\[.*?\])\)", lists).group(1))
        table = {e["code"]: e for e in json.loads((SITE_SRC / "languages.json").read_text(encoding="utf-8"))["languages"]}
        found = 0
        for key, wing in wings.items():
            if key.startswith("_") or wing.get("state") != "open":
                continue
            for topic in wing.get("topics", []):
                kind = topic.get("count") or topic["slug"]["en"].replace("-", "_")
                self.assertIn(kind, kinds)
                for lang in topic.get("langs") or ["en", "de"]:
                    # English and German addresses stand in the registry, the other languages' in languages.json
                    if lang in wing["page"]:
                        page = SITE_BUILT / wing["page"][lang].strip("/") / topic["slug"][lang] / "index.html"
                    else:
                        slugs = table[lang]["slugs"]
                        page = (SITE_BUILT / table[lang]["folder"] / slugs["wings"][key] / slugs["topics"][topic["slug"]["en"]]
                                / "index.html")
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

    def test_the_life_page_reaches_the_count_by_its_kind(self):
        lists = (HERE.parent / "functions" / "_count" / "lists.js").read_text(encoding="utf-8")
        kinds = json.loads(re.search(r"PAGE_KINDS = Object\.freeze\((\[.*?\])\)", lists).group(1))
        self.assertIn("life", kinds)
        for path in ("leonardo-da-vinci/life", "de/leonardo-da-vinci/steckbrief"):
            text = (SITE_BUILT / path / "index.html").read_text(encoding="utf-8")
            self.assertIn('data-count="life"', text)
            # one door at the top, one at the end, and one way in at each period that names a stop
            own = text[text.index("<main"):text.index("</main>")]
            self.assertEqual(own.count('data-door="top"'), 1)
            self.assertEqual(own.count('data-door="end"'), 1)
            self.assertEqual(own.count('data-door="item"'), 6)

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
                     "de": self.said(self.story, r"Mann über siebzig, dabei war Leonardo (\d+)\.", "his age at the visit")}
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
                # each house's own site once outside the sources, whose list links the pages read there
                outside = own[:own.index('id="sources"')]
                for host in ("https://www.vinci-closluce.com/", "https://www.chateau-amboise.com/"):
                    self.assertEqual(sum(h.startswith(host) for h in re.findall(r'href="([^"]+)"', outside)), 1, host)

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
        "v-scale-en", "v-scale-de", "v-scale-m",
        # the sizes pages' share pictures hold the Mona Lisa's reproduction
        "vinci-sizes-og-en", "vinci-sizes-og-de"}
    # Of those, the rights list's verdict 2 for the house and its grounds: ours with the map data's credit.
    WITH_MAP_CREDIT = {
        "house", "v-house", "v-court", "v-court-m", "court", "stair", "v-hall", "v-hall-m", "v-lion",
        "vinci-stop-hall", "vinci-view-anemometer", "vinci-view-parachute", "m-parachute"}

    # the shark's body shape credit in a page's own words, where the page's own line stands in for the list's
    OWN_SHAPE_CREDIT = {"de": "Körperform", "es": "forma del cuerpo", "pt-BR": "forma do corpo"}

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
                owed = self.lib.PICTURE_CREDITS.get(self.lib.picture_stem(image.get("contentUrl") or image.get("url")))
                if owed and "license" in image:
                    found += 1
                    # each other work's credit stands once and in the list's order, after the museum's, as the list
                    # gives it or as the page's own line in the page's language; the licence stays the museum's
                    text = image["creditText"]
                    self.assertTrue(text.startswith(self.lib.picture_terms("en", "")["creditText"] + ", "), path)
                    at = [text.find(re.search(r" (?:after|nach) (\w+)", credit).group(1)) for credit in owed]
                    self.assertNotIn(-1, at, (path, owed))
                    self.assertEqual(at, sorted(at), path)
                    for credit in owed:
                        self.assertEqual(text.count(re.search(r" after (\w+)", credit).group(1)), 1, path)
                    self.assertTrue(text.endswith("(CC BY 4.0)"), path)
                    page = path.read_text(encoding="utf-8")
                    shared = re.search(r'<meta property="og:image" content="([^"]+)"', page)
                    lang = re.search(r'<html lang="([\w-]+)"', page[:200]).group(1)
                    if (lang in self.OWN_SHAPE_CREDIT and owed == self.lib.PICTURE_CREDITS.get(self.lib.picture_stem(shared.group(1)))
                            and "Shimada" in owed[0]):
                        self.assertIn(self.OWN_SHAPE_CREDIT[lang], text, path)
                    self.assertEqual(image["license"], "https://creativecommons.org/licenses/by-sa/4.0/", path)
        self.assertGreater(found, 0)

    def test_a_share_picture_in_another_language_owes_what_the_english_one_owes(self):
        # a share picture in another language is the English one with its words in that language: it carries the
        # same rights, so a page's own credit line stands in every language, not in English and German only
        found = 0
        for path in self.pages:
            shared = re.search(r'<meta property="og:image" content="([^"]+)"', path.read_text(encoding="utf-8"))
            stem = self.lib.picture_stem(html.unescape(shared.group(1))) if shared else None
            twin = re.sub(r"-og-[a-z]{2}(?:-[a-z]{2})?$", "-og-en", stem or "")
            if not stem or twin == stem or twin not in self.lib.FREE_PICTURES:
                continue
            found += 1
            self.assertIn(stem, self.lib.FREE_PICTURES, path)
            self.assertEqual(self.lib.PICTURE_CREDITS.get(stem), self.lib.PICTURE_CREDITS.get(twin), path)
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

    def test_the_pages_own_credit_line_stands_only_for_what_its_share_picture_owes(self):
        owing = {}
        for stem, owed in self.lib.PICTURE_CREDITS.items():
            owing.setdefault(tuple(owed), stem)
        if len(owing) < 2 or not any(len(owed) > 1 for owed in owing):
            self.skipTest("no two pictures owe different credits, or none owes two")
        (_, own_stem), (two, other_stem) = sorted(owing.items(), key=lambda kv: len(kv[0]))[:1] + [
            next((k, v) for k, v in owing.items() if len(k) > 1)]
        origin = "https://museumofages.org"
        mine, theirs = f"{origin}/static/img/{own_stem}-1600.webp", f"{origin}/static/img/{other_stem}-1600.webp"
        page = (f'<meta property="og:image" content="{mine}"><img src="{mine}"><img src="{theirs}">'
                f'<script type="application/ld+json">{json.dumps({"@context": "https://schema.org", "@graph": []})}</script>')
        terms = self.lib.picture_terms("de", f"{origin}/x/")
        line = terms["creditText"].split(", ", 1)[0] + ", eine Zeile der Seite"
        images = {i["contentUrl"]: i["creditText"] for i in self.lib.image_objects(self.graph(
            self.lib.with_picture_rights(page, f"{origin}/x/", terms, credit=line)))}
        # the page's own line for its own picture; the other picture's credits as the list gives them, in its order
        self.assertEqual(images[mine], terms["creditText"] + ", eine Zeile der Seite")
        self.assertEqual(images[theirs], terms["creditText"] + ", " + ", ".join(two))

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
        chart = next(i for i in self.lib.image_objects(self.graph(sizes)) if i.get("@id", "").endswith("#chart"))
        self.assertTrue(chart["contentUrl"].endswith(".png") and "license" in chart)

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

    def test_the_sizes_pages_share_their_card_of_the_painting_without_a_licence(self):
        # the card holds the Mona Lisa's reproduction: the link preview, never licensed; the page's own picture is the
        # first screen's drawing, ours, licensed as the chart is
        for path, lang in (("leonardo-da-vinci/sizes", "en"), ("de/leonardo-da-vinci/groessen", "de")):
            text = (SITE_BUILT / path / "index.html").read_text(encoding="utf-8")
            graph = self.graph(text)
            page = next(n for n in graph["@graph"] if n.get("@type") == "WebPage")
            frame = next(i for i in self.lib.image_objects(graph) if i["@id"] == page["primaryImageOfPage"]["@id"])
            card = f"https://museumofages.org/static/img/vinci-sizes-og-{lang}-1200x630.png"
            self.assertEqual(frame["contentUrl"], f"https://museumofages.org/static/img/vinci-sizes-figure-{lang}-1600.png")
            self.assertEqual(frame["license"], "https://creativecommons.org/licenses/by-sa/4.0/", path)
            self.assertIn(f'<meta property="og:image" content="{card}">', text)
            self.assertTrue((SITE_BUILT / "static" / "img" / f"vinci-sizes-og-{lang}-1200x630.png").is_file())
            self.assertTrue(frame["caption"] and frame["description"], path)
            self.assertEqual([i for i in self.lib.image_objects(graph) if i.get("contentUrl") == card], [], path)
            chart = next(i for i in self.lib.image_objects(graph) if i["@id"].endswith("#chart"))
            self.assertEqual(chart["contentUrl"], f"https://museumofages.org/static/img/vinci-sizes-chart-{lang}-1600.png")
            self.assertEqual(chart["license"], "https://creativecommons.org/licenses/by-sa/4.0/", path)
            self.assertEqual(chart["creditText"], self.lib.picture_terms("en", "")["creditText"], path)
            # a licence field put on the card is found, and the site's build stops on it
            for key in self.lib.LICENCE_FIELDS:
                given = text.replace('"@graph":[', f'"@graph":[{{"@type":"ImageObject","contentUrl":"{card}","{key}":"x"}},', 1)
                self.assertNotEqual(given, text)
                self.assertRegex(" ".join(self.lib.licence_problems(given, "page")),
                                 r"vinci-sizes-og-%s-1200x630\.png carries licence data" % lang)

    def test_the_inventions_pages_name_the_aerial_screw(self):
        langs = json.loads((SITE_SRC / "languages.json").read_text(encoding="utf-8"))["languages"]
        pages = sorted(p for p in self.pages if re.search(r"/(inventions|erfindungen|inventos|invenzioni|invencoes|izobreteniya)/index\.html$", str(p)))
        self.assertEqual(len(pages), len([e for e in langs if e["code"] in ("en", "de", "fr", "it", "es", "pt-BR", "bg")]))
        for path in pages:
            graph = self.graph(path.read_text(encoding="utf-8"))
            page = next(n for n in graph["@graph"] if n.get("@type") == "WebPage")
            frame = next(i for i in self.lib.image_objects(graph) if i["@id"] == page["primaryImageOfPage"]["@id"])
            self.assertEqual(frame["contentUrl"], "https://museumofages.org/static/img/vinci-stop-flight-1600.webp", path)
            self.assertEqual(frame["license"], "https://creativecommons.org/licenses/by-sa/4.0/", path)
            self.assertTrue((SITE_BUILT / "static" / "img" / "vinci-stop-flight-1600.webp").is_file())

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


def _pages_build():
    spec = importlib.util.spec_from_file_location("pages_build_test", HERE / "build.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _graph(text):
    nodes = []
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S):
        nodes += json.loads(block.replace("<\\/", "</"))["@graph"]
    return nodes


class SiteWide(unittest.TestCase):
    """What every page shares for search and AI answers, on the site as its own build wrote it."""

    @classmethod
    def setUpClass(cls):
        cls.build = _pages_build()
        cls.pages = {p: p.read_text(encoding="utf-8") for p in sorted(SITE_BUILT.rglob("*.html"))}
        cls.sitemap = (SITE_BUILT / "sitemap.xml").read_text(encoding="utf-8")
        # each page's last change to a shown number after its check (page.changed), by its id and language
        cls.changes = {}
        for f in HERE.glob("*.*.json"):
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("page"), dict) and data["page"].get("changed"):
                cls.changes[(data["page"]["id"], f.name.split(".")[1])] = data["page"]["changed"]

    def changed(self, text):
        label = re.search(r'data-page="([\w-]+)"', text)
        lang = re.search(r'<html lang="([\w-]+)"', text).group(1)
        return self.changes.get((label.group(1) if label else "", lang), "")

    def address(self, path):
        rel = path.relative_to(SITE_BUILT).parent.as_posix()
        return "https://museumofages.org/" + ("" if rel == "." else rel + "/")

    def articles(self):
        for path, text in self.pages.items():
            article = next((n for n in _graph(text) if n.get("@type") == "Article"), None)
            if article:
                yield path, text, article

    def test_the_dated_line_shows_the_day_the_structured_data_gives(self):
        found = 0
        for path, text, article in self.articles():
            lang = re.search(r'<html lang="([\w-]+)"', text).group(1)
            code = next(c for c in self.build.CHECKED_LINE if self.build.L.html(c) == lang)
            self.assertRegex(article.get("dateModified", ""), r"^\d{4}-\d{2}-\d{2}$", path)
            self.assertRegex(article.get("datePublished", ""), r"^\d{4}-\d{2}-\d{2}$", path)
            lines = re.findall(r'<p class="sp-checked">(.*?)</p>', text, flags=re.S)
            self.assertEqual(len(lines), 1, path)
            day = re.search(r'<time class="nw" datetime="([\d-]+)">([^<]+)</time>', lines[0])
            self.assertNotIn("..", lines[0], path)
            # the line names the check day; the page's last change is that day, the day it went live where that is
            # later (a translation keeps its source's check day), or a later change to a shown number
            self.assertEqual(article["dateModified"], max(day.group(1), article["datePublished"], self.changed(text)), path)
            self.assertGreaterEqual(article["dateModified"], article["datePublished"], path)
            self.assertEqual(html.unescape(day.group(2)), self.build.date_words(day.group(1), code)[1], path)
            # the line stands first in the sources, under their heading
            self.assertRegex(text, r'<section class="sp-sec sp-sources"[^>]*>\s*<h2>[^<]*</h2>\s*<p class="sp-checked">', path)
            found += 1
        self.assertGreaterEqual(found, 60)

    def test_every_language_writes_its_dated_line(self):
        for code, line in self.build.CHECKED_LINE.items():
            self.assertEqual(line.count("{date}"), 1, code)
            for day in ("2026-10-01", "2026-10-08", "2026-10-13"):
                before, words = self.build.date_words(day, code)
                self.assertIn("2026", words)
                self.assertNotRegex(before + words, "[—–;]")
                # one stop at the end, also where the day ends on an abbreviation
                shown = re.sub(r"<[^>]+>", "", self.build.checked_html(day, code))
                self.assertRegex(shown, r"[^.]\.$", code)
        self.assertEqual(self.build.date_words("2026-10-08", "it")[0], "l’")
        self.assertEqual(self.build.date_words("2026-10-01", "fr")[1], "1er octobre 2026")
        self.assertEqual(self.build.date_words("2026-10-13", "de")[1], "13. Oktober 2026")

    def test_the_sitemap_gives_each_topic_page_the_day_of_its_check(self):
        lastmod = dict(re.findall(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", self.sitemap))
        checked = {self.address(path): article["dateModified"] for path, _, article in self.articles()}
        self.assertEqual(lastmod, {u: d for u, d in checked.items() if f"<loc>{u}</loc>" in self.sitemap})
        self.assertGreaterEqual(len(lastmod), 60)

    def test_the_sitemap_lists_each_pages_pictures_and_each_is_a_built_file(self):
        import xml.dom.minidom
        dom = xml.dom.minidom.parseString(self.sitemap.encode("utf-8"))
        self.assertEqual(dom.documentElement.getAttribute("xmlns:image"), "http://www.google.com/schemas/sitemap-image/1.1")
        listed = {}
        for entry in re.findall(r"<url>(.*?)</url>", self.sitemap):
            loc = re.search(r"<loc>([^<]+)</loc>", entry).group(1)
            listed[loc] = re.findall(r"<image:image><image:loc>([^<]+)</image:loc></image:image>", entry)
            self.assertEqual(len(listed[loc]), len(set(listed[loc])), loc)
            for image in listed[loc]:
                self.assertTrue(image.startswith("https://museumofages.org/"), image)
                self.assertTrue((SITE_BUILT / image[len("https://museumofages.org/"):]).is_file(), image)
        self.assertGreaterEqual(sum(len(v) for v in listed.values()), 300)
        # every picture a listed page shows, and every one its structured data describes, stands under its address
        for path, text in self.pages.items():
            address = self.address(path)
            if address not in listed:
                continue
            shown = {html.unescape(src) for src in re.findall(r'<img\b[^>]*?\bsrc="([^"]+)"', text)}
            for src in shown:
                self.assertIn(urllib.parse.urljoin(address, src), listed[address], path)
            for node in _graph(text):
                if node.get("@type") == "ImageObject" and node.get("contentUrl"):
                    self.assertIn(node["contentUrl"], listed[address], path)

    def primary(self, text):
        """The page's own picture as its structured data names it: the ImageObject both the page and its Article point at."""
        graph = _graph(text)
        page = next(n for n in graph if n.get("@type") in ("WebPage", "CollectionPage"))
        frame = next(n for n in graph if n.get("@id") == page["primaryImageOfPage"]["@id"])
        article = next((n for n in graph if n.get("@type") == "Article"), None)
        if article:
            self.assertEqual(article["image"]["@id"], frame["@id"])
        return frame

    def test_the_sizes_drawing_is_a_picture_and_the_pages_own(self):
        for rel, lang in (("leonardo-da-vinci/sizes", "en"), ("de/leonardo-da-vinci/groessen", "de")):
            text = (SITE_BUILT / rel / "index.html").read_text(encoding="utf-8")
            data = json.loads((HERE / f"sizes.{lang}.json").read_text(encoding="utf-8"))
            still = data["page"]["still"]["figure"].replace("{lang}", lang)
            frame = re.search(r'<figure class="plate sp-frame sz-frame"[^>]*>(.*?)</figure>', text, flags=re.S).group(1)
            # the drawing is an img in the frame line's picture, with the page's alt, and no inline drawing is left there
            img = re.search(r'<div class="hang"><picture><img class="sz-top" src="([^"]+)" width="(\d+)" height="(\d+)" alt="([^"]+)"', frame)
            self.assertIsNotNone(img, rel)
            self.assertTrue(img.group(1).endswith(f"/static/img/{still}"), img.group(1))
            self.assertEqual(html.unescape(img.group(4)).replace("\u00a0", " "), data["top"]["figure"]["alt"])
            self.assertNotIn("<svg", frame)
            built = (SITE_BUILT / rel / img.group(1)).resolve()
            self.assertEqual(self.build.CHART.png_info(built)[0], (int(img.group(2)), int(img.group(3))))
            self.assertEqual(self.primary(text)["contentUrl"], f"https://museumofages.org/static/img/{still}")
            # the chart keeps its own description beside it, the share card stays the link preview
            self.assertIn(f"https://museumofages.org/static/img/{data['page']['still']['file'].replace('{lang}', lang)}",
                          [n.get("contentUrl") for n in _graph(text)])
            self.assertRegex(text, r'<meta property="og:image" content="[^"]*vinci-sizes-og-%s-1200x630\.png"' % lang)

    def test_the_neighbours_stand_under_one_heading_and_the_list_of_pages_is_the_page(self):
        found = {"topic": 0, "hub": 0}
        for path, text in self.pages.items():
            listed = re.search(r'<section class="sp-sec sc-pages( sc-pages--next)?" id="[\w-]+">(.*?)</section>', text, flags=re.S)
            if not listed:
                continue
            levels = re.findall(r"<h([1-6])\b", listed.group(2))
            items = re.findall(r'<li class="sc-item">\s*<h([1-6]) class="sc-item__h">', listed.group(2))
            self.assertTrue(items, path)
            if listed.group(1):
                # a topic page: one h2 for the list, then each neighbour an h3
                self.assertEqual(levels, ["2"] + ["3"] * len(items), path)
                self.assertRegex(listed.group(2), r"^\s*<h2>(?:(?!</h2>).)+</h2>\s*<ul class=\"sc-list\">", path)
                # and "On this page" names it in the heading's words, so the side list follows the reader through it
                own = re.search(r'<section class="sp-sec sc-pages sc-pages--next" id="([\w-]+)">\s*<h2>(.*?)</h2>', text, flags=re.S)
                toc = re.search(rf'<li><a href="#{own.group(1)}">(.*?)</a></li>', text, flags=re.S)
                self.assertTrue(toc, path)
                self.assertEqual(re.sub(r"<[^>]+>", "", toc.group(1)), re.sub(r"<[^>]+>", "", own.group(2)), path)
                found["topic"] += 1
            else:
                # the wing's list of pages: each page an h2, as the page's own sections
                self.assertEqual(levels, ["2"] * len(items), path)
                found["hub"] += 1
        self.assertGreaterEqual(found["topic"], 40)
        self.assertGreaterEqual(found["hub"], 4)

    def test_the_publisher_names_its_address_and_its_sign(self):
        found = 0
        for path, text in self.pages.items():
            for node in _graph(text):
                if not str(node.get("@id", "")).endswith("#publisher") or node.get("@type") != "NGO":
                    continue
                found += 1
                self.assertEqual(node["url"], "https://museumofages.org/", path)
                self.assertRegex(node["logo"], r"^https://museumofages\.org/static/sign/[\w-]+\.png$", path)
                logo = SITE_BUILT / node["logo"][len("https://museumofages.org/"):]
                self.assertGreaterEqual(min(self.build.CHART.png_info(logo)[0]), 112, path)
                # no link to the code
                self.assertNotRegex(json.dumps(node), r"(?i)github|source|repositor")
        self.assertGreaterEqual(found, 85)

    def test_a_pages_own_picture_carries_no_words(self):
        """The share card, with its heading in it, stays the link preview; the page's own picture (primaryImageOfPage,
        Article image) is one without words wherever the page has one."""
        own = {"vinci-sizes": r"vinci-sizes-figure-{lang}-1600\.png", "vinci-supper": r"vinci-supper-drawing-{lang}-1600\.png",
               "animals": r"animals-biggest-dinosaurs-row-1600\.webp",
               "vinci-mona-lisa": r"vinci-plate-mona-lisa-\d+\.webp",
               "vinci-salvator-mundi": r"vinci-plate-salvator-mundi-\d+\.webp",
               "vinci-lady-with-an-ermine": r"vinci-plate-lady-with-an-ermine-\d+\.webp"}
        seen, cards = set(), set()
        for path, text in self.pages.items():
            label = re.search(r'<main[^>]*class="sp"[^>]*data-page="([\w-]+)"', text)
            if not label:
                continue
            lang = re.search(r'<html lang="([\w-]+)"', text).group(1).lower()
            frame = self.primary(text)
            share = re.search(r'<meta property="og:image" content="([^"]+)"', text).group(1)
            self.assertIn("-og", share, path)
            if label.group(1) in own:
                self.assertRegex(frame["contentUrl"], "/static/img/" + own[label.group(1)].replace("{lang}", lang) + "$", path)
                seen.add(label.group(1))
            if "-og" in frame["contentUrl"]:
                cards.add(label.group(1))
            self.assertTrue((SITE_BUILT / frame["contentUrl"][len("https://museumofages.org/"):]).is_file(), path)
            self.assertTrue(frame.get("width") and frame.get("height"), path)
        self.assertEqual(seen, set(own))
        # the pages without a picture of their own: the life (a fact box and dated lines) and the paintings, whose
        # one picture without words is a film frame of the second tier the page does not show
        self.assertEqual(cards, {"vinci-life", "vinci-paintings"})


class SoftChecks(unittest.TestCase):
    """Two checks that warn and never stop the build: a picture at one scale whose words give no length or not the
    person's height, and an answer whose second or third sentence leans on the one before while it carries a number."""

    @classmethod
    def setUpClass(cls):
        cls.build = _pages_build()

    def page(self, alt, answer, person="1.70 m", key="scale"):
        return {"top": {key: {"alt": alt}, "answer": answer}, "labels": {"person": person}}

    def test_a_scale_picture_names_a_length_and_the_persons_height(self):
        soft = self.build.soft_problems
        good = self.page("A T. rex about 11.4 m (37 ft) long beside a grey person 1.70 m (5 ft 7 in) tall.", "One. Two.")
        self.assertEqual(soft(good, "en"), [])
        bare = soft(self.page("A T. rex beside a grey person who stands far below its hips.", "One."), "en")
        self.assertEqual(len(bare), 2)
        self.assertIn("top.scale.alt names no length with its unit", bare)
        # the person's height alone, with its feet in brackets, is no length of the animal
        only = soft(self.page("A shark beside a grey person 1.70 m (5 ft 7 in) tall.", "One."), "en")
        self.assertEqual(only, ["top.scale.alt names no length with its unit"])
        self.assertEqual(soft(self.page("Ein T. rex, etwa 11,4 Meter lang, neben einem Menschen von 1,70 Metern.", "Eins.",
                                        "1,70 m"), "de"), [])
        self.assertEqual(soft(self.page("Тиранозавър, дълъг 11,4 м, до човек от 1,70 м.", "Едно.", "1,70 м"), "bg"), [])
        drawing = soft(self.page("The Last Supper, 4.6 by 8.8 metres.", "One.", "1.7 m", "drawing"), "en")
        self.assertEqual(drawing, ["top.drawing.alt does not name the person's height (1.7 m)"])

    def test_an_answer_whose_later_sentence_leans_on_a_pronoun_with_a_number(self):
        soft = self.build.soft_problems
        answer = "The Last Supper is in Milan. Leonardo painted it on a wall. He began it in about 1494. It is 8.8 m wide."
        found = soft({"top": {"answer": answer}, "labels": {}}, "en")
        self.assertEqual(len(found), 1)
        self.assertRegex(found[0], r"^top\.answer's sentence 3 opens on 'He' and carries a number")
        # the first sentence and the fourth are never read; a pronoun without a number is no warning
        self.assertEqual(soft({"top": {"answer": "It is 8.8 m wide. It is old. Leonardo made it. It took 3 years."},
                               "labels": {}}, "en"), [])
        self.assertEqual(len(soft({"top": {"answer": "Das Abendmahl ist in Mailand. Er malte es ab 1494."}, "labels": {}},
                                  "de")), 1)
        # an Italian sentence opening on its article is no pronoun
        self.assertEqual(soft({"top": {"answer": "Il Cenacolo è a Milano. Il dipinto misura 8,8 m."}, "labels": {}}, "it"), [])

    def test_the_warnings_never_stop_a_build_and_name_their_page(self):
        build = self.build
        data, wings, info, _ = build.load_pages()
        page, bare = "t-rex", dict(data["t-rex"]["en"])
        bare["top"] = dict(bare["top"], scale=dict(bare["top"]["scale"], alt="A T. rex beside a grey person."))
        wing = build.wing_of(page, bare, wings)
        del build.WARNINGS[:]
        problems = build.lint(page, "en", bare, wing, build.Names([], wing["name"]["en"], "en"), info[page]["topic"])
        self.assertFalse([p for p in problems if "top.scale.alt" in p])
        self.assertIn("t-rex.en: top.scale.alt names no length with its unit", build.WARNINGS)
        self.assertTrue(all(w.startswith(f"{page}.en: ") for w in build.WARNINGS))


if __name__ == "__main__":
    unittest.main(verbosity=1)
