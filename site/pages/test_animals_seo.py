#!/usr/bin/env python3
"""The animal search pages' rules for search: the size comparison in three shapes, what ranks today, and the words each
batch brings.    python3 pages/test_animals_seo.py    (test_build.py runs these classes in its own step)

Most tests read the site as its own build wrote it (python3 _src/build.py first) and hold only the pages that carry
page.shapes; a page without it is held to what ranks today alone. What ranks today is frozen in testdata/, written once
from a build of main 1e93bfb4. The words checks hold a page once its words for the shapes stand without "draft".
The machinery is also built in a copy of this folder with stand-in files, so it is tested before any picture exists.
"""
import html
import importlib.util
import json
import os
import re
import shutil
import struct
import sys
import unittest
import urllib.parse
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_SRC = HERE.parent / "_src"
SITE_BUILT = HERE.parent / "dist"
FROZEN = HERE / "testdata"
WORK = HERE / "_work" / "test-seo"
ORIGIN = "https://museumofages.org"
WING = "animals"
LANGS = ("en", "de", "es", "pt-BR")
# a shape's ratio, and the person's least share of its height (PLAN section 2, rule 3)
RATIO = {"size_1x1": 1, "size_4x3": 4 / 3, "size_16x9": 16 / 9}
GATE = {"size_1x1": 0.13, "size_4x3": 0.12, "size_16x9": 0.08}
EDGE, BAND, PERSON_M = 0.06, 1.91, 1.70
FILE_NAME = re.compile(r"animals-([a-z0-9]+(?:-[a-z0-9]+)*)-size-comparison-(1x1|4x3|16x9)-(\d+)\.(avif|webp)$")
LICENCE = ("license", "acquireLicensePage", "creditText", "copyrightNotice", "creator")
# the owner's taste words, in the four languages (PLAN section 4, item 17)
TASTE = ("cheap", "a toy", "toys", "an old game", "billig", "Spielzeug", "ein altes Spiel", "barato", "juguete", "brinquedo")
YES_NO = r"(?:yes|no|ja|nein|sí|si|sim|não|nao)\b"


def _module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _graph(text):
    nodes = []
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S):
        nodes += json.loads(block.replace("<\\/", "</"))["@graph"]
    return nodes


def _frozen(name):
    return json.loads((FROZEN / name).read_text(encoding="utf-8"))


# Every picture that shows our T. rex, cut again from its newer model: their hashes and the side view's height follow
# the new outline, and the lead alt carries the new length in its pose.
REDRAWN = {"animals-t-rex-side", "animals-t-rex-close", "animals-t-rex-og", "animals-t-rex-size-comparison-1x1",
           "animals-t-rex-size-comparison-4x3", "animals-t-rex-size-comparison-16x9", "animals-spinosaurus-beside-t-rex",
           "animals-spinosaurus-beside-t-rex-narrow", "animals-triceratops-beside-t-rex",
           "animals-stegosaurus-beside-triceratops-t-rex", "animals-ankylosaurus-beside", "animals-biggest-dinosaurs-row",
           "animals-biggest-dinosaurs-close", "animals-biggest-dinosaurs-og", "animals-biggest-dinosaurs-size-comparison-16x9"}


def _redrawn_stem(path):
    name = path.rsplit("/", 1)[-1]
    return re.sub(r"(-(en|de|es|pt-br)-1200x630\.png|-\d+\.(avif|webp))$", "", name) in REDRAWN


def _redrawn_alt(alt):
    return re.sub(r"11[.,]4(\s)m( \(37(\s)ft\))?", lambda m: f"11{m[1]}m" + (f" (36{m[3]}ft)" if m[2] else ""), alt)


def _main(text):
    return text[text.index("<main"):text.index("</main>")]


def _first_sentence(text):
    text = html.unescape(re.sub(r"<[^>]+>", "", text)).replace(" ", " ").strip()
    # a decimal point or an abbreviation's stop is no sentence's end
    found = re.search(r"(?<!\d)(?<!\b[A-Z])[.!?](?=\s+[A-ZÄÖÜÁÉÍÓÚÂÊÔ¿¡\"(])", text)
    return text[:found.end()] if found else text


def _numbers(text):
    return {n.replace(",", ".") for n in re.findall(r"\d+(?:[.,]\d+)?", text)}


def _data_files():
    """The animal wing's page files, by page and language."""
    found = {}
    for path in sorted(HERE.glob("*.json")):
        parts = path.name[:-len(".json")].rsplit(".", 1)
        if len(parts) != 2 or parts[1] not in LANGS:
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data.get("page"), dict) and data["page"].get("wing") == WING:
            found[(parts[0], parts[1])] = data
    return found


def _shape_words(data):
    if data["page"].get("hub"):
        return data["top"].get("shapes")
    return next((b.get("shapes") for b in data["blocks"] if b["id"] == "pictures"), None)


class Site(unittest.TestCase):
    """The animal pages as the site's build wrote them."""

    @classmethod
    def setUpClass(cls):
        if not (SITE_BUILT / "sitemap.xml").is_file():
            raise unittest.SkipTest(f"the site is not built: run python3 _src/build.py first ({SITE_BUILT})")
        cls.build = _module("pages_build_seo", HERE / "build.py")
        cls.lib = cls.build.LIB
        cls.data = _data_files()
        by_id = {(d["page"]["id"], lang): (name, d) for (name, lang), d in cls.data.items()}
        cls.pages = []
        for path in sorted(SITE_BUILT.rglob("index.html")):
            text = path.read_text(encoding="utf-8")
            label = re.search(r'<main[^>]*data-page="([\w-]+)"', text)
            lang = re.search(r'<html lang="([\w-]+)"', text)
            if not label or not lang or (label.group(1), lang.group(1)) not in by_id:
                continue
            rel = path.relative_to(SITE_BUILT).parent.as_posix()
            name, d = by_id[(label.group(1), lang.group(1))]
            cls.pages.append({"path": path, "address": f"{ORIGIN}/{rel}/", "text": text, "name": name,
                              "lang": lang.group(1), "data": d, "graph": _graph(text)})
        cls.shaped = [p for p in cls.pages if p["data"]["page"].get("shapes")]

    def need_shapes(self):
        if not self.shaped:
            self.skipTest("no animal page carries page.shapes yet")

    def node(self, page, ref):
        return next(n for n in page["graph"] if n.get("@id") == ref)

    def built_file(self, url):
        self.assertTrue(url.startswith(f"{ORIGIN}/"), url)
        return SITE_BUILT / urllib.parse.unquote(url[len(ORIGIN) + 1:])

    def shape_objects(self, page):
        """Each shape's key and its ImageObject, in page.shapes.list order."""
        shapes = page["data"]["page"]["shapes"]
        return [(k, self.node(page, f"{page['address']}#{self.build.shape_id(page['data'], k)}")) for k in shapes["list"]]


class Shapes(Site):
    """The three shapes in the structured data, the files and the page (PLAN section 4, items 1 to 3, 7 to 9, 11)."""

    def test_the_article_lists_three_shapes_each_a_file_of_its_size(self):
        self.need_shapes()
        for page in self.shaped:
            owner = next(n for n in page["graph"] if n.get("@type") == ("CollectionPage" if page["data"]["page"].get("hub") else "Article"))
            refs = [r["@id"] for r in owner["image"]]
            objects = self.shape_objects(page)
            self.assertEqual(refs, [o["@id"] for _, o in objects], page["path"])
            self.assertEqual(sorted(k for k, _ in objects), sorted(RATIO), page["path"])
            for key, obj in objects:
                where = (page["path"], key)
                self.assertAlmostEqual(obj["width"] / obj["height"], RATIO[key], delta=RATIO[key] * 0.005, msg=where)
                self.assertGreaterEqual(obj["width"], 1200, where)
                self.assertEqual(obj["url"], obj["contentUrl"], where)
                # the size the data gives is the file's own
                self.assertEqual(self.build.webp_size(self.built_file(obj["contentUrl"])), (obj["width"], obj["height"]), where)
                self.assertTrue(obj["caption"] and obj["description"], where)

    def test_the_square_is_the_pages_own_picture_and_only_one_is(self):
        for page in self.pages:
            marked = [n for n in page["graph"] if n.get("representativeOfPage")]
            self.assertEqual(len(marked), 1, page["path"])
            self.assertTrue(marked[0]["@id"].endswith("#frame"), page["path"])
        self.need_shapes()
        for page in self.shaped:
            shapes = page["data"]["page"]["shapes"]
            own = next(n for n in page["graph"] if n.get("@type") in ("WebPage", "CollectionPage"))
            self.assertEqual(own["primaryImageOfPage"]["@id"], f"{page['address']}#frame", page["path"])
            frame = self.node(page, f"{page['address']}#frame")
            stem = page["data"]["pics"][shapes["primary"]]["stem"]
            self.assertEqual(self.lib.picture_stem(frame["contentUrl"]), stem, page["path"])
            self.assertEqual(shapes["primary"], "size_1x1", f"{page['path']}: the plan's primary is the square; a switch says so here")

    def test_the_side_view_keeps_its_own_object_with_its_words(self):
        self.need_shapes()
        for page in self.shaped:
            if page["data"]["page"].get("hub"):
                continue
            side = self.node(page, f"{page['address']}#scale")
            scale = page["data"]["top"]["scale"]
            pic = page["data"]["pics"][scale["pic"]]
            self.assertEqual(side["contentUrl"], f"{ORIGIN}/static/img/{pic['stem']}-{max(pic['widths'])}.webp", page["path"])
            self.assertEqual(side["caption"], scale["what"].replace(" ", " "), page["path"])
            self.assertEqual(side["description"], scale["alt"].replace(" ", " "), page["path"])
            self.assertNotIn("representativeOfPage", side, page["path"])

    def test_each_shape_carries_the_licence_and_the_credit_its_model_owes(self):
        self.need_shapes()
        for page in self.shaped:
            side = None if page["data"]["page"].get("hub") else self.node(page, f"{page['address']}#scale")
            for key, obj in self.shape_objects(page):
                where = (page["path"], key)
                for field in LICENCE:
                    self.assertIn(field, obj, where)
                stem = self.lib.picture_stem(obj["contentUrl"])
                self.assertIn(stem, self.lib.FREE_PICTURES, where)
                if side:
                    # the shape shows the page's own animal: it owes what the side view owes, word for word
                    self.assertEqual(self.lib.PICTURE_CREDITS.get(stem), self.lib.PICTURE_CREDITS.get(self.lib.picture_stem(side["contentUrl"])), where)
                    self.assertEqual(obj["creditText"], side["creditText"], where)

    def test_the_shapes_files_are_named_for_their_shape_and_resolve_to_their_stem(self):
        self.need_shapes()
        for page in self.shaped:
            for key in page["data"]["page"]["shapes"]["list"]:
                pic = page["data"]["pics"][key]
                for width in pic["widths"]:
                    for ext in ("avif", "webp"):
                        name = f"{pic['stem']}-{width}.{ext}"
                        found = FILE_NAME.fullmatch(name)
                        self.assertIsNotNone(found, name)
                        self.assertEqual(found.group(2), key.split("_", 1)[1], name)
                        if not page["data"]["page"].get("hub"):
                            self.assertEqual(found.group(1), page["name"], name)
                        self.assertEqual(self.lib.picture_stem(f"{ORIGIN}/static/img/{name}"), pic["stem"], name)
                        self.assertTrue((SITE_BUILT / "static" / "img" / name).is_file(), name)
        for path in (SITE_BUILT / "static" / "img").glob("*-size-comparison-*"):
            self.assertTrue(FILE_NAME.fullmatch(path.name) or re.fullmatch(r"animals-[a-z0-9-]+-size-comparison-og-1200x630\.jpg", path.name), path.name)

    def test_a_shape_is_a_still_without_words(self):
        self.need_shapes()
        jobs = json.loads((HERE / "pictures.json").read_text(encoding="utf-8"))
        stills = {j["name"] for j in jobs["pictures"]}
        shares = {j["name"] for j in jobs["share"]}
        for page in self.shaped:
            for key in page["data"]["page"]["shapes"]["list"]:
                stem = page["data"]["pics"][key]["stem"]
                self.assertIn(stem, stills, (page["path"], key))
                self.assertNotIn(stem, shares, (page["path"], key))
                self.assertNotIn("-og", stem, (page["path"], key))

    def test_the_provenance_file_holds_each_shape_and_the_person_reads(self):
        self.need_shapes()
        record = json.loads((HERE / "animals-shapes.json").read_text(encoding="utf-8"))["pages"]
        for page in self.shaped:
            if page["lang"] != "en":
                continue
            name, shapes = page["name"], page["data"]["page"]["shapes"]
            self.assertIn(name, record)
            live, kept = record[name]["live"], record[name]["shapes"]
            self.assertEqual(sorted(kept), sorted(shapes["list"]), name)
            for key in shapes["list"]:
                shot, pic, where = kept[key], page["data"]["pics"][key], (name, key)
                self.assertEqual(shot["stem"], pic["stem"], where)
                # the page's own animal: the round, the model and its hash its live pictures show
                self.assertEqual((shot["round"], shot["model"], shot["sha256"]), (live["round"], live["model"], live["sha256"]), where)
                w, h = shot["w"], shot["h"]
                self.assertEqual(self.build.webp_size(SITE_BUILT / "static" / "img" / f"{pic['stem']}-{max(pic['widths'])}.webp"), (w, h), where)
                left, top, right, bottom = shot["person_px"]
                self.assertLessEqual(abs((bottom - top) - PERSON_M * shot["ppm"]), 1, f"{where}: the person is 1.70 m within 1 px")
                if not shot.get("exception"):
                    self.assertGreaterEqual((bottom - top) / h, GATE[key], f"{where}: the person's share of the height")
                else:
                    self.assertIsInstance(shot["exception"], str, where)
                self.assertGreaterEqual(left, EDGE * w, f"{where}: the person's distance from the left edge")
                self.assertLessEqual(right, (1 - EDGE) * w, f"{where}: the person's distance from the right edge")
                self.assertTrue(0 <= top < bottom <= h, where)
                if key == "size_16x9":
                    # the share cut keeps the centred 1.91:1 band, so the person and the animal stand inside it
                    margin = (h - w / BAND) / 2
                    for box in (shot["person_px"], shot["animal_px"]):
                        self.assertGreaterEqual(box[1], margin - 0.5, where)
                        self.assertLessEqual(box[3], h - margin + 0.5, where)

    def test_use_our_pictures_shows_the_wide_shape_and_links_all_three(self):
        self.need_shapes()
        for page in self.shaped:
            shapes, data, main = page["data"]["page"]["shapes"], page["data"], _main(page["text"])
            self.assertEqual(main.count('data-slot="shape"'), 1, page["path"])
            figure = re.search(r'<figure class="plate sc-fig" data-slot="shape">(.*?)</figure>', main, flags=re.S).group(1)
            img = re.search(r"<img\b[^>]*>", figure).group(0)
            pic = data["pics"][shapes["figure"]]
            src = re.search(r'src="([^"]+)"', img).group(1)
            self.assertTrue(src.endswith(f"/static/img/{pic['stem']}-{max(pic['widths'])}.webp"), src)
            w, h = self.build.webp_size((page["path"].parent / src).resolve())
            self.assertIn(f'width="{w}" height="{h}"', img, page["path"])
            words = _shape_words(data)
            alt = html.unescape(re.search(r'alt="([^"]*)"', img).group(1))
            self.assertEqual(alt.replace("\u00a0", " "), words["alts"][shapes["figure"]].replace("\u00a0", " "), page["path"])
            if data["page"].get("hub"):
                # the list's own picture is the first in its main part, under the answer
                self.assertEqual(re.search(r"<img\b[^>]*>", main).group(0), img, page["path"])
                listed = next(n for n in page["graph"] if n.get("@type") == "ItemList")
                self.assertEqual(listed["numberOfItems"], 10, page["path"])
                continue
            self.assertIn('loading="lazy"', img, page["path"])
            section = re.search(r'<section class="sp-sec sp-prose" id="pictures">(.*?)</section>', main, flags=re.S).group(1)
            self.assertIn('data-slot="shape"', section, page["path"])
            # the licence line first, then the figure, then the lead and one link per shape
            self.assertLess(section.index("CC BY-SA"), section.index('data-slot="shape"'), page["path"])
            links = re.findall(r'<a class="more" href="([^"]+)"><span>([^<]+)</span>', section[section.index("</figure>"):])
            self.assertEqual(len(links), len(shapes["list"]), page["path"])
            for (href, label), key in zip(links, shapes["list"]):
                stem = data["pics"][key]["stem"]
                self.assertTrue(href.endswith(f"/static/img/{stem}-{max(data['pics'][key]['widths'])}.webp"), href)
                self.assertTrue((page["path"].parent / href).resolve().is_file(), href)
                self.assertEqual(html.unescape(label).replace(" ", " "), words["links"][key].replace(" ", " "))


class WhatRanks(Site):
    """What ranks today stays (PLAN section 4, items 4 to 6 and 18): frozen from a build of main 1e93bfb4."""

    def test_the_first_picture_of_every_animal_page_is_mains(self):
        frozen = _frozen("animals-first-picture.json")["pages"]
        reviewed = _frozen("animals-first-picture-reviewed.json")["alts"]
        found = {p["address"]: p for p in self.pages}
        self.assertEqual(len(frozen), 40)
        for address, was in frozen.items():
            self.assertIn(address, found, address)
            page = found[address]
            redrawn = _redrawn_stem(was["src"])
            if redrawn:
                was = {**was, "alt": _redrawn_alt(was["alt"])}
            img = re.search(r"<img\b[^>]*>", _main(page["text"])).group(0)
            attr = dict(re.findall(r'(\w[\w-]*)="([^"]*)"', img))
            self.assertEqual(urllib.parse.urljoin(address, html.unescape(attr["src"])), was["src"], address)
            self.assertEqual(attr.get("fetchpriority"), "high", address)
            self.assertEqual((int(attr["width"]), int(attr["height"])) if not redrawn else int(attr["width"]),
                             (was["width"], was["height"]) if not redrawn else was["width"], address)
            alt = html.unescape(attr["alt"])
            if page["lang"] != "en" and address in reviewed:
                # a reviewed edit beyond the comparison words, named word for word (testdata/animals-first-picture-reviewed.json)
                want = _redrawn_alt(reviewed[address]) if redrawn else reviewed[address]
                self.assertEqual(alt.replace("\u00a0", " "), want.replace("\u00a0", " "), address)
            elif page["lang"] == "en" or alt == was["alt"]:
                # the English lead alts stay word for word: those pages carry most image impressions
                self.assertEqual(alt, was["alt"], address)
            else:
                # another language may open with the comparison words, the rest kept (PLAN L3)
                head, sep, rest = alt.partition(": ")
                self.assertTrue(sep and 3 <= len(head) <= 60, f"{address}: the lead alt changed: {alt!r}")
                self.assertEqual(rest[:1].lower() + rest[1:], was["alt"][:1].lower() + was["alt"][1:], address)
            stem = was["src"].rsplit("/", 1)[-1].rsplit("-", 1)[0]
            preload = re.findall(r'<link rel="preload" as="image"[^>]*imagesrcset="([^"]+)"', page["text"])
            self.assertTrue(any(f"/{stem}-" in p for p in preload), f"{address}: the preload names {stem}")

    def test_the_image_sitemap_keeps_mains_pictures_and_the_side_view_first(self):
        frozen = _frozen("animals-sitemap-images.json")["addresses"]
        first = _frozen("animals-first-picture.json")["pages"]
        sitemap = (SITE_BUILT / "sitemap.xml").read_text(encoding="utf-8")
        listed = {}
        for entry in re.findall(r"<url>(.*?)</url>", sitemap):
            loc = re.search(r"<loc>([^<]+)</loc>", entry).group(1)
            listed[loc] = re.findall(r"<image:image><image:loc>([^<]+)</image:loc></image:image>", entry)
        self.assertEqual(len(frozen), 44)
        for address, was in frozen.items():
            self.assertIn(address, listed)
            self.assertLessEqual(set(was), set(listed[address]), address)
            if address in first:
                self.assertEqual(listed[address][0], first[address]["src"], address)

    def test_no_file_of_mains_list_is_missing_or_cut_again(self):
        frozen = _frozen("fetch-list-names.json")["files"]
        now = {f["path"]: f["sha256"] for f in json.loads((SITE_SRC / "fetch-list.json").read_text(encoding="utf-8"))["files"]}
        self.assertGreaterEqual(len(frozen), 600)
        for path, sha in frozen.items():
            self.assertIn(path, now, path)
            if sha and not _redrawn_stem(path):
                self.assertEqual(now[path], sha, f"{path} is served and ranks: never cut again")

    def test_every_anchor_of_mains_animal_pages_stays(self):
        frozen = _frozen("animals-anchors.json")["addresses"]
        found = {p["address"]: set(re.findall(r'\bid="([^"]+)"', _main(p["text"]))) for p in self.pages}
        for address, ids in frozen.items():
            self.assertIn(address, found, address)
            self.assertLessEqual(set(ids), found[address], address)


class Share(Site):
    """The link preview is the word card unless a page cuts it from a shape (PLAN section 4, item 10)."""

    def test_the_link_preview_is_the_card_unless_the_page_cuts_it_from_a_shape(self):
        self.assertEqual(len(self.pages), 44)
        for page in self.pages:
            og = page["data"]["page"]["og_image"]
            card = og["file"].replace("{lang}", page["lang"].lower())
            shown = re.search(r'<meta property="og:image" content="([^"]+)"', page["text"]).group(1)
            self.assertTrue((SITE_BUILT / "static" / "img" / card).is_file(), card)
            if not og.get("from"):
                self.assertEqual(shown, f"{ORIGIN}/static/img/{card}", page["path"])
                continue
            cut = self.build.og_cut(page["data"])
            self.assertEqual(shown, f"{ORIGIN}/static/img/{cut}", page["path"])
            self.assertEqual(self.build.jpeg_size(SITE_BUILT / "static" / "img" / cut), (1200, 630), cut)
            self.assertIn(f'<meta property="og:image:width" content="1200">', page["text"])
            card_object = self.node(page, f"{page['address']}#card")
            self.assertEqual(card_object["contentUrl"], f"{ORIGIN}/static/img/{card}", page["path"])

    def test_a_topic_pages_card_sets_its_square_shape_in_its_middle(self):
        """Each topic page's card holds its 1:1 shape in the middle 630 by 630, so the square a messenger cuts from the
        card's centre is that picture alone, and says it in og:image:alt; the question and the answer line stand in the
        column at the left, nothing over the picture. The list of pages keeps its card."""
        self.need_shapes()
        jobs = {(j["page"], j["lang"]): j["svg"] for j in self.build.still_jobs() if j["kind"] == "share"}
        plain = lambda t: t.replace(" ", " ")
        held = 0
        for page in self.pages:
            d, svg = page["data"], jobs[(page["name"], page["lang"])]
            if d["page"].get("hub"):
                self.assertNotIn('<image x="285" y="0" width="630" height="630"', svg, page["path"])
                continue
            stem = d["pics"]["size_1x1"]["stem"]
            self.assertIn(f'<image x="285" y="0" width="630" height="630" xlink:href="@pics@/{stem}-1600.webp"/>', svg)
            texts = [(float(x), int(size), html.unescape(t)) for x, size, t in
                     re.findall(r'<text x="([\d.]+)" y="[\d.]+" font-family="Cardo" font-size="(\d+)"[^>]*>([^<]*)</text>', svg)]
            self.assertFalse([t for x, _, t in texts if x >= 285], page["path"])
            for x, size, row in texts:
                self.assertLessEqual(x + self.build.CHART._cardo_px(row, size), 285 - 22, (page["path"], row))
            said = " ".join(t for _, _, t in texts[:-1]).replace("- ", "-")
            self.assertEqual(said, plain(d["top"]["h1"]) + " " + plain(d["labels"]["og_answer"]), page["path"])
            alt = re.search(r'<meta property="og:image:alt" content="([^"]*)"', page["text"]).group(1)
            self.assertEqual(plain(html.unescape(alt)), plain(_shape_words(d)["alts"]["size_1x1"]), page["path"])
            held += 1
        self.assertEqual(held, 40)


class Words(Site):
    """The words each batch brings, once a page's words for its shapes stand without "draft" (items 12 to 17)."""

    def final(self, name):
        pages = [p for p in self.pages if p["name"] == name]
        ready = [p for p in pages if _shape_words(p["data"]) and not _shape_words(p["data"]).get("draft")]
        if not ready:
            self.skipTest(f"{name}: its words for the shapes are not final yet")
        return ready

    def block_after(self, data, kind):
        blocks = data["blocks"]
        at = next(i for i, b in enumerate(blocks) if b["type"] == kind)
        return blocks[at + 1] if at + 1 < len(blocks) else None

    @staticmethod
    def first_text(block):
        if block.get("answer"):
            return block["answer"] if isinstance(block["answer"], str) else "".join(
                x if isinstance(x, str) else x["text"] for x in block["answer"])
        para = (block.get("paras") or block.get("known") or [""])[0]
        return para if isinstance(para, str) else "".join(x if isinstance(x, str) else x.get("text", "") for x in para)

    def test_the_german_tables_are_named_as_germans_search(self):
        ready = [p for p in self.pages if p["lang"] == "de" and not p["data"]["page"].get("hub")
                 and _shape_words(p["data"]) and not _shape_words(p["data"]).get("draft")]
        if not ready:
            self.skipTest("no German page's words are final yet")
        for page in ready:
            table = next(b for b in page["data"]["blocks"] if b["type"] == "numbers")
            self.assertIn("Vergleich" if page["name"] == "biggest-dinosaurs" else "Steckbrief", table["h"], page["path"])

    def test_megalodon_answers_whether_it_still_lives_after_its_table(self):
        heads = {"en": r"(?i)still alive", "de": r"Lebt der Megalodon noch", "es": r"(?i)todavía", "pt-BR": r"(?i)ainda existe"}
        million = {"en": "million", "de": "Millionen", "es": "millones", "pt-BR": "milhões"}
        for page in self.final("megalodon"):
            block = self.block_after(page["data"], "numbers")
            self.assertRegex(block.get("h", ""), heads[page["lang"]], page["path"])
            first = _first_sentence(self.first_text(block))
            self.assertRegex(first, r"3[.,]6", page["path"])
            self.assertIn(million[page["lang"]], first, page["path"])

    def test_spinosaurus_names_the_new_species_apart(self):
        for page in self.final("spinosaurus"):
            block = next((b for b in page["data"]["blocks"] if "Spinosaurus mirabilis" in b.get("h", "") and "2026" in b.get("h", "")), None)
            self.assertIsNotNone(block, page["path"])
            self.assertRegex(json.dumps(block, ensure_ascii=False), "N[ií]ger", page["path"])
            sources = next(b for b in page["data"]["blocks"] if b["type"] == "sources")
            self.assertIn("10.1126/science.adx5486", json.dumps(sources), page["path"])

    def test_brachiosaurus_answers_its_weight_with_the_tables_numbers(self):
        heads = {"en": r"(?i)how heavy", "de": r"Wie schwer", "es": r"(?i)cuánto pesaba", "pt-BR": r"(?i)quanto pesava"}
        for page in self.final("brachiosaurus"):
            block = next((b for b in page["data"]["blocks"] if re.search(heads[page["lang"]], b.get("h", ""))), None)
            self.assertIsNotNone(block, page["path"])
            table = next(b for b in page["data"]["blocks"] if b["type"] == "numbers")
            col = next(i for i, c in enumerate(table["cols"]) if re.search(r"(?i)weight|gewicht|peso", c))
            said = _numbers(_first_sentence(self.first_text(block)))
            self.assertTrue(said, page["path"])
            self.assertTrue(any(said <= _numbers(r["cells"][col]) for r in table["rows"]), f"{page['path']}: {said}")

    def test_the_list_is_named_for_the_size_comparison(self):
        words = {"en": r"(?i)size comparison", "de": r"Größenvergleich", "es": r"(?i)comparación de tamaño", "pt-BR": r"(?i)comparação de tamanho"}
        for page in self.final(next(p["name"] for p in self.pages if p["data"]["page"].get("hub"))):
            self.assertRegex(page["data"]["top"]["h1"], words[page["lang"]], page["path"])
            answer = page["data"]["top"]["answer"]
            answer = answer if isinstance(answer, str) else "".join(x if isinstance(x, str) else x["text"] for x in answer)
            self.assertRegex(_first_sentence(answer), r"1[.,]70\s?m", page["path"])

    def test_the_wing_never_says_the_owners_taste_words(self):
        wing = json.loads((SITE_SRC / "registry.json").read_text(encoding="utf-8"))[WING]
        for word in TASTE:
            self.assertTrue(any(re.search(rule[0], f"it looks like {word}.".lower()) for rule in wing["never_say"]), word)
        # and the build's lint refuses them in any of the wing's page words
        data = dict(self.data[("megalodon", "de")])
        data["top"] = dict(data["top"], answer="Ein billiges Spielzeug.")
        wing_of = self.build.wing_of("megalodon", data, self.build.load_pages()[1])
        problems = self.build.lint("megalodon", "de", data, wing_of, self.build.Names([], wing_of["name"]["de"], "de"))
        self.assertTrue(any("top.answer" in p for p in problems), problems)


class SoftQuestions(Site):
    """Warns, never fails (item 20): the first sentence under a question heading carries a number or a plain yes or no."""

    def test_a_question_heading_is_answered_by_a_number_or_a_yes_or_no(self):
        self.assertTrue(self.answers("<h2>How long?</h2>\n<p>About 16 m long.</p>"))
        self.assertTrue(self.answers("<h3>Lebt er noch?</h3><p>Nein. Er starb aus.</p>"))
        self.assertFalse(self.answers("<h2>Why so big?</h2><p>Because the sea was rich.</p>"))
        missing = []
        for page in self.pages:
            for found in re.finditer(r"<h([23])\b[^>]*>([^<]*\?)\s*</h\1>", _main(page["text"])):
                if not self.answers(_main(page["text"])[found.start():]):
                    missing.append(f"{page['address']}: {html.unescape(found.group(2))}")
        for line in missing:
            print(f"warning: a question heading is not answered by a number or a yes or no: {line}", file=sys.stderr)

    @staticmethod
    def answers(text):
        para = re.search(r"</h[23]>\s*(?:<[^p][^>]*>\s*)*<p\b[^>]*>(.*?)</p>", text, flags=re.S)
        if not para:
            return False
        first = _first_sentence(para.group(1))
        return bool(re.search(r"\d", first) or re.match(YES_NO, first.lower()))


# ---------- the machinery, built in a copy of this folder with stand-in files ----------

SOURCES = ["build.py", "chart.py", "template.html", "names.json", "pictures.json", "css"]
SIZES = "(min-width: 1280px) 690px, (min-width: 960px) 54vw, (min-width: 600px) calc(100vw - 64px), calc(100vw - 40px)"
TEST_SHAPES = {"size_1x1": ((1600, 1600), [1600]), "size_4x3": ((1600, 1200), [1600]), "size_16x9": ((2400, 1350), [800, 1600, 2400])}


def fake_webp(w, h):
    """A WebP header of the size given: the build reads a picture's size from its header alone."""
    body = b"VP8X" + struct.pack("<I", 10) + b"\0" * 4 + (w - 1).to_bytes(3, "little") + (h - 1).to_bytes(3, "little")
    return b"RIFF" + struct.pack("<I", 4 + len(body)) + b"WEBP" + body


def fake_jpeg(w, h):
    return b"\xff\xd8\xff\xc0" + struct.pack(">HBHHB", 17, 8, h, w, 3) + b"\x01\x11\x00\x02\x11\x00\x03\x11\x00\xff\xd9"


def fake_png(w, h, mark):
    """A PNG of the size given carrying a still's mark, without pixels: the build reads only those two."""
    chunk = lambda kind, body: struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"tEXt", b"comment\0" + mark.encode("latin-1")) + chunk(b"IEND", b""))


class Machinery(unittest.TestCase):
    """The build's three shapes and its share switch, on a page and on the list of pages, before any picture exists."""

    @classmethod
    def setUpClass(cls):
        cls.dir = WORK / "machinery"
        shutil.rmtree(cls.dir, ignore_errors=True)
        cls.dir.mkdir(parents=True)
        for name in SOURCES:
            src = HERE / name
            (shutil.copytree if src.is_dir() else shutil.copy)(src, cls.dir / name)
        for src in HERE.glob("*.??.json"):
            data = json.loads(src.read_text(encoding="utf-8"))
            if isinstance(data.get("page"), dict) and data["page"].get("shapes"):
                # the machinery starts from pages without shapes, whatever pictures have landed
                for key in data["page"].pop("shapes")["list"]:
                    data["pics"].pop(key, None)
                data["page"]["og_image"].pop("from", None)
            (cls.dir / src.name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        shutil.copy(SITE_SRC / "registry.json", cls.dir / "registry.json")
        if (HERE / "last-good").is_dir():
            os.symlink(HERE / "last-good", cls.dir / "last-good", target_is_directory=True)
        # the pictures: each of the real ones linked, and stand-in shapes of the right size for two pages
        img = cls.dir / "pics" / "img"
        img.mkdir(parents=True)
        for src in (HERE / "pics" / "img").iterdir():
            os.symlink(src, img / src.name)
        cls.stems = {}
        for page, slug in (("megalodon", "test-shark"), ("wing-animals", "test-group")):
            for key, ((w, h), widths) in TEST_SHAPES.items():
                stem = f"animals-{slug}-size-comparison-{key.split('_', 1)[1]}"
                cls.stems[(page, key)] = stem
                for width in widths:
                    (img / f"{stem}-{width}.webp").write_bytes(fake_webp(width, round(width * h / w)))
                    (img / f"{stem}-{width}.avif").write_bytes(b"stand-in")
        (img / "animals-test-shark-size-comparison-og-1200x630.jpg").write_bytes(fake_jpeg(1200, 630))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, ignore_errors=True)

    def setUp(self):
        self.saved = {p: p.read_bytes() for p in self.dir.glob("*.??.json")}

    def tearDown(self):
        for path, body in self.saved.items():
            path.write_bytes(body)
        shutil.rmtree(self.dir / "out", ignore_errors=True)

    def data(self, page, lang):
        return json.loads((self.dir / f"{page}.{lang}.json").read_text(encoding="utf-8"))

    def save(self, page, lang, data):
        (self.dir / f"{page}.{lang}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def shape(self, page, og=False, words=True):
        """page.shapes and the stand-in pictures on a page in both languages, with words."""
        for lang in ("en", "de"):
            data = self.data(page, lang)
            for key, ((w, h), widths) in TEST_SHAPES.items():
                data["pics"][key] = {"stem": self.stems[(page, key)], "widths": widths, "sizes": SIZES, "person": "80% 60%"}
            data["page"]["shapes"] = {"primary": "size_1x1", "list": list(TEST_SHAPES), "figure": "size_16x9"}
            if og:
                data["page"]["og_image"]["from"] = "size_16x9"
            said = {"caption": f"{lang} caption of the wide one", "lead": f"{lang} lead for slides and posts",
                    "alts": {k: f"{lang} alt of {k}" for k in TEST_SHAPES}, "links": {k: f"{lang} {k}" for k in TEST_SHAPES}}
            block = data["top"] if data["page"].get("hub") else next(b for b in data["blocks"] if b["id"] == "pictures")
            block.pop("shapes", None)
            if words:
                block["shapes"] = said
            self.save(page, lang, data)

    def build(self, stems=()):
        module = _module(f"build_seo_{self.id().split('.')[-1]}", self.dir / "build.py")
        module.WINGS_FILE = self.dir / "registry.json"
        module.LANGS = tuple(c for c in module.LANGS if c in ("en", "de"))
        module.LISTED = tuple(c for c in module.LISTED if c in ("en", "de"))
        # the stand-ins are the museum's own, as seat P's files will be, and the shark's owe its credit
        module.LIB.FREE_PICTURES = module.LIB.FREE_PICTURES | set(self.stems.values()) | {"animals-test-shark-size-comparison-og"}
        owed = module.LIB.PICTURE_CREDITS["animals-megalodon-side"]
        for (page, _), stem in self.stems.items():
            if page == "megalodon":
                module.LIB.PICTURE_CREDITS[stem] = owed
        module.LIB.PICTURE_CREDITS["animals-test-shark-size-comparison-og"] = owed
        # a share card drawn from the stand-in pages (without their square shape, or with a stand-in one) is not the
        # one cut for the pages: it gets a stand-in still with its drawing's mark, the link to the real one dropped
        img = self.dir / "pics" / "img"
        for job in module.still_jobs():
            path, mark = img / job["file"], module.CHART.source_mark(job["svg"])
            if path.is_file() and module.CHART.png_info(path)[1].get("comment") == mark:
                continue
            size = module.CHART.png_info(path)[0] if path.is_file() else (1200, 630)
            if path.is_symlink():
                path.unlink()
            path.write_bytes(fake_png(*size, mark))
        out = self.dir / "out"
        module.build_pages(out, site_src=SITE_SRC, site_built=SITE_BUILT, quiet=True)
        self.module = module
        return out

    def fails(self, words):
        with self.assertRaises(SystemExit) as caught:
            self.build()
        self.assertRegex(str(caught.exception), words)

    def page(self, out, rel):
        text = (out / rel / "index.html").read_text(encoding="utf-8")
        return text, _graph(text), f"{ORIGIN}/{rel}/"

    def test_a_page_with_shapes_names_three_and_keeps_its_side_view(self):
        self.shape("megalodon")
        out = self.build()
        text, graph, url = self.page(out, "animals/megalodon")
        article = next(n for n in graph if n.get("@type") == "Article")
        self.assertEqual([r["@id"] for r in article["image"]], [f"{url}#frame", f"{url}#frame-4x3", f"{url}#frame-16x9"])
        frame = next(n for n in graph if n.get("@id") == f"{url}#frame")
        self.assertEqual((frame["width"], frame["height"], frame["representativeOfPage"]), (1600, 1600, True))
        self.assertEqual(frame["caption"], "en alt of size_1x1")
        wide = next(n for n in graph if n.get("@id") == f"{url}#frame-16x9")
        self.assertEqual((wide["caption"], wide["description"]), ("en caption of the wide one", "en alt of size_16x9"))
        side = next(n for n in graph if n.get("@id") == f"{url}#scale")
        self.assertNotIn("representativeOfPage", side)
        self.assertEqual(sum(1 for n in graph if n.get("representativeOfPage")), 1)
        self.assertEqual(wide["creditText"], side["creditText"])
        for field in LICENCE:
            self.assertIn(field, wide)
        # the first screen is today's: its picture first, preloaded, loaded first
        first = re.search(r"<img\b[^>]*>", _main(text)).group(0)
        self.assertIn("animals-megalodon-side-2400.webp", first)
        self.assertIn('fetchpriority="high"', first)
        section = re.search(r'id="pictures">(.*?)</section>', text, flags=re.S).group(1)
        self.assertIn('loading="lazy"', section)
        self.assertIn('alt="en alt of size_16x9"', section)
        self.assertEqual(re.findall(r'<a class="more" href="[^"]*/static/img/([^"]+)"', section),
                         ["animals-test-shark-size-comparison-1x1-1600.webp", "animals-test-shark-size-comparison-4x3-1600.webp",
                          "animals-test-shark-size-comparison-16x9-2400.webp"])
        self.assertIn("en lead for slides and posts", section)
        # the person's height stands over the person in the figure only
        self.assertIn("sc-person--size_16x9{", text)
        self.assertNotIn("sc-person--size_1x1", text)
        for width in (800, 1600, 2400):
            self.assertTrue((out / "static" / "img" / f"animals-test-shark-size-comparison-16x9-{width}.avif").is_file())
        self.assertTrue((out / "static" / "img" / "animals-test-shark-size-comparison-1x1-1600.avif").is_file())
        # the share card stays the link preview
        self.assertRegex(text, r'<meta property="og:image" content="[^"]*animals-megalodon-og-en-1200x630\.png">')

    def test_the_share_switch_cuts_the_preview_from_the_wide_shape_and_keeps_the_card(self):
        self.shape("megalodon", og=True)
        out = self.build()
        text, graph, url = self.page(out, "de/tiere/megalodon")
        self.assertIn(f'<meta property="og:image" content="{ORIGIN}/static/img/animals-test-shark-size-comparison-og-1200x630.jpg">', text)
        self.assertIn('<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">', text)
        self.assertIn('<meta property="og:image:alt" content="de alt of size_16x9">', text)
        card = next(n for n in graph if n.get("@id") == f"{url}#card")
        self.assertEqual(card["contentUrl"], f"{ORIGIN}/static/img/animals-megalodon-og-de-1200x630.png")
        self.assertTrue((out / "static" / "img" / "animals-megalodon-og-de-1200x630.png").is_file())
        self.assertTrue((out / "static" / "img" / "animals-test-shark-size-comparison-og-1200x630.jpg").is_file())
        self.assertIn("license", card)

    def test_the_list_of_pages_shows_its_wide_shape_under_the_answer(self):
        self.shape("wing-animals")
        out = self.build()
        text, graph, url = self.page(out, "animals")
        collection = next(n for n in graph if n.get("@type") == "CollectionPage")
        self.assertEqual(collection["primaryImageOfPage"]["@id"], f"{url}#frame")
        self.assertEqual([r["@id"] for r in collection["image"]], [f"{url}#frame", f"{url}#frame-4x3", f"{url}#frame-16x9"])
        self.assertFalse([n for n in graph if n.get("@type") == "Article"])
        first = re.search(r"<img\b[^>]*>", _main(text)).group(0)
        self.assertIn("animals-test-group-size-comparison-16x9-2400.webp", first)
        self.assertIn('fetchpriority="high"', first)
        self.assertIn("animals-test-group-size-comparison-16x9", re.search(r'<link rel="preload"[^>]*>', text).group(0))
        self.assertEqual(next(n for n in graph if n.get("@type") == "ItemList")["numberOfItems"], 10)

    def test_a_page_without_shapes_builds_as_before(self):
        out = self.build()
        text, graph, url = self.page(out, "animals/megalodon")
        self.assertEqual(next(n for n in graph if n.get("@type") == "Article")["image"], {"@id": f"{url}#frame"})
        self.assertNotIn('data-slot="shape"', text)
        self.assertFalse([n for n in graph if n.get("@id", "").endswith("#scale")])

    def test_shapes_without_their_words_stop_the_build(self):
        self.shape("megalodon", words=False)
        self.fails(r"megalodon\.en: page\.shapes stands, and the page's words for its shapes")

    def test_a_shape_in_another_shape_than_its_name_stops_the_build(self):
        self.shape("megalodon")
        for lang in ("en", "de"):
            data = self.data("megalodon", lang)
            data["pics"]["size_4x3"]["stem"] = self.stems[("megalodon", "size_1x1")]
            self.save("megalodon", lang, data)
        self.fails(r"pics\.size_4x3: its stem ends in another shape than its name")

    def test_the_switch_needs_a_shape(self):
        for lang in ("en", "de"):
            data = self.data("megalodon", lang)
            data["page"]["og_image"]["from"] = "size_16x9"
            self.save("megalodon", lang, data)
        self.fails(r"og_image\.from names a shape, and the page has no page\.shapes")

    def test_the_shapes_are_the_same_in_every_language(self):
        self.shape("megalodon")
        data = self.data("megalodon", "de")
        data["page"]["shapes"]["primary"] = "size_16x9"
        self.save("megalodon", "de", data)
        self.fails(r"megalodon: the two languages differ in pictures or in the page label")


if __name__ == "__main__":
    unittest.main(verbosity=1)
