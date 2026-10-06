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
SOURCES = ["build.py", "template.html", "names.json", "css"]
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
        self.page = self.pages[0]

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def data(self, lang, page=None):
        return json.loads((self.dir / f"{page or self.page}.{lang}.json").read_text(encoding="utf-8"))

    def save(self, lang, data, page=None):
        (self.dir / f"{page or self.page}.{lang}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def build(self, site_src=SITE_SRC, site_built=SITE_BUILT):
        spec = importlib.util.spec_from_file_location(f"build_{self.dir.name}", self.dir / "build.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.WINGS_FILE = self.registry
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
        for name in ("template.html", "build.py", "css/page.css"):
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
            lang = re.search(r'<html lang="(\w+)"', text).group(1)
            data = self.data(lang)
            name = wings[data["page"]["wing"]]["name"][lang]
            own = self.own_part(text)
            # the site's rule that the span relies on travels with the page
            self.assertIn(".nw{white-space:nowrap}", text)
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
            lang = re.search(r'<html lang="(\w+)"', text).group(1)
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


if __name__ == "__main__":
    unittest.main(verbosity=1)
