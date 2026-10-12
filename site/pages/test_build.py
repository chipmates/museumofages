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
SOURCES = ["build.py", "chart.py", "template.html", "names.json", "css"]
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
        self.works_page = next((p for p in self.pages if "topic" in self.data("en", p)["page"]), None)

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
        for name in ("template.html", "build.py", "chart.py", "make_pictures.py", "css/page.css", "css/chart.css"):
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
                self.assertNotIn(name, self.words(re.sub(r'<span class="nw">[^<]*</span>', " ", own)))
                continue
            # in the h1 the name stands with its ending in one span that cannot wrap
            h1 = re.search(r"<h1[^>]*>(.*?)</h1>", own, flags=re.S).group(1)
            kept = re.findall(r'<span class="nw">([^<]*)</span>', h1)
            self.assertEqual(len(kept), 1, h1)
            self.assertTrue(kept[0].startswith(name))
            self.assertEqual(html.unescape(re.sub(r"<[^>]+>", "", h1)), data["top"]["h1"])
            # and nowhere in the page's own part does the name stand outside such a span
            self.assertGreater(len(re.findall(r'<span class="nw">%s' % re.escape(html.escape(name)), own)), 3)
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
            spans = re.findall(r'<span class="(?:nw nh|nh)"(?: lang="(\w+)")?>([^<]*)</span>', own)
            marked = {html.unescape(word): code for code, word in spans}
            loose = self.words(re.sub(r'<span class="(?:nw|nh|nw nh)"[^>]*>[^<]*</span>', " ", own))
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
            self.assertGreater(found, 15)
            if data["page"]["id"] != self.data("en")["page"]["id"]:
                # a holder a page takes from its wing's facts carries the language the facts give it
                self.assertIn('<span class="nh" lang="fr">Musée du Louvre</span>', own)
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
        next(b for b in data["blocks"] if b["type"] == "chart")["caption"] += " Neu."
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
        out, written = self.build()
        self.assertEqual(len(written), 2 * len(self.pages) - 1)
        self.assertFalse((out / wings[key]["page"]["de"].strip("/") / topic["slug"]["de"]).exists())
        text = (out / wings[key]["page"]["en"].strip("/") / topic["slug"]["en"] / "index.html").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r'<link rel="alternate" hreflang="([\w-]+)"', text), ["en", "x-default"])
        # its way to German leads to the wing's German page
        self.assertRegex(text, r'href="(?:\.\./)+%s/" lang="de" hreflang="de"' % re.escape(wings[key]["page"]["de"].strip("/")))


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


if __name__ == "__main__":
    unittest.main(verbosity=1)
