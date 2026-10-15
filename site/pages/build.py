#!/usr/bin/env python3
"""Builds the museum's search pages: one template, one data file per page and language.

    python3 pages/build.py                  build every page into pages/out/, then run every check
    python3 pages/build.py --out <folder>   build into another folder (the site's main build can do the same
                                            by calling build_pages(<folder>))
    python3 pages/build.py --facts          print title, description and heading lengths

Standard library only. The tokens and the shared styles are read from the site's source (_src/css/),
and the header, the footer and the publisher's record are taken from the site's own built statement
page, exactly as the site built them. So a page wears the site's look, and its footer is the site's
footer, unchanged. When the statement page is not at the address this build knows (CHROME_PAGE),
all of these come from last-good/, a copy of the last whole site beside this file where one is kept
(it is no part of the repository), and the build says so.
The build stops, and writes nothing, when a data file breaks a rule.

This file, the template and the style file name no wing. A page names its wing in its data file
(page.wing), and the wing's name, its page's address, its door and its own fact rules come from
that wing's entry in the site's registry (WINGS_FILE). Names in another language stand in names.json.

A new page: add <name>.en.json and <name>.de.json beside this file and its pictures to
pictures.json (make_pictures.py writes them to pics/img/, and _src/tools/fetch.py --record lists them, since the
repository keeps no picture). Nothing else: every pair of data files is built.
"""
import base64
import hashlib
import html
import importlib.util
import json
import math
import posixpath
import re
import shutil
import struct
import sys
import unicodedata
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_SRC = HERE.parent / "_src"
SITE_BUILT = HERE.parent / "dist"


def _site_module(name):
    """A module of the site's source (_src), found from here upward: a test runs a copy of this file further down."""
    for folder in (HERE, *HERE.parents):
        path = folder / "_src" / f"{name}.py"
        if path.is_file():
            spec = importlib.util.spec_from_file_location(f"site_{name}", path)
            mod = importlib.util.module_from_spec(spec)
            keep, sys.dont_write_bytecode = sys.dont_write_bytecode, True
            try:
                spec.loader.exec_module(mod)
            finally:
                sys.dont_write_bytecode = keep
            return mod
    raise SystemExit(f"_src/{name}.py was not found above {HERE}")


# The site's languages (languages.json): a page is built in every built language its topic is written in (the
# registry's topic, langs), the listed ones are live.
LANG = _site_module("languages")
# the site's shared tools: a language's own faces, French punctuation
LIB = _site_module("buildlib")
L = LANG.Languages()
if L.problems:
    raise SystemExit("\n".join(L.problems))


def _own_module(name):
    """A module beside this file, found from here: a test runs a copy of this folder."""
    spec = importlib.util.spec_from_file_location(f"pages_{name}", HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    keep, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.dont_write_bytecode = keep
    return mod


# the works of a wing at one scale: a page's chart, its list, its table and its stills
CHART = _own_module("chart")

# The page of the built site whose header and footer every search page wears, and this folder's
# copy of the last whole site for the time that page is not there.
CHROME_PAGE = {code: L.page(code, "what") for code in L.built}
LAST_GOOD = HERE / "last-good"
# This folder's own pictures. A picture that is not here is looked for in the site's folder.
PICS = HERE / "pics" / "img"
# Names in another language, kept whole wherever they stand in a displayed sentence.
NAMES_FILE = HERE / "names.json"
# The longest run a heading keeps on one line at the page's size, the longest it keeps at a
# smaller size, in characters. A longer name has to wrap on a phone.
KEEP_WHOLE = 19
KEEP_SMALL = 24
# An answer longer than this, in characters, takes the small phone's type on a phone up to 389 px wide, so the first
# door still shows on a 360 by 780 screen.
LONG_ANSWER = 400
# A German ordinal before a century or a month never ends a line: "Im 17." there reads as a sentence's end.
ORDINAL_DE = re.compile(r"\b(\d{1,2})\. (?=(?:Jahrhunderts?|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|"
                        r"November|Dezember)\b)")

# The addresses, kept here and nowhere else. A wing's own addresses stand in its entry in WINGS_FILE.
ORIGIN = "https://museumofages.org"
USE_PICTURES = "use-our-pictures"
WINGS_FILE = SITE_SRC / "registry.json"
WING_KEYS = ("name", "page", "door", "about", "never_say", "claim_phrase")
# A wing in the making has no door yet: where a door would stand, its pages link the newest open wing's page.
MAKING_KEYS = ("name", "page", "about", "never_say", "claim_phrase")
# A door leads to a wing's own opening: no fragment, no parameter but the language.
DOOR_SHAPE = r"/w/[a-z0-9-]+(?:\?(?:film=[a-z0-9-]+&(?:amp;)?)?lang=[a-z]{2}(?:-[a-z]{2})?)?"  # the release name opens the wing's early door
# A page's way to one stop of its wing: the wing's door with the stop, as the wing's own page writes it.
STOP_DOOR = DOOR_SHAPE + r"#s=[a-z0-9-]+"
# The door's placeholder in the site's first build.
OLD_DOOR = r"/enter(?:\?lang=[a-z]{2})?"
# The folder of the static pages' files at the site's root. The museum app owns /assets/.
STATIC = "static"
# The site's other pages, as paths from the site's root. The second entry of a pair is used
# until the first exists in the built site.
SITE_PAGES = {
    "home": {"en": ("",), "de": ("de/",)},
    "what": {"en": ("what-this-museum-is/", "what-this-museum-is.html"),
             "de": ("de/was-dieses-museum-ist/", "de/was-dieses-museum-ist.html")},
    "privacy": {"en": ("privacy/",), "de": ("de/datenschutz/", "privacy/")},
    "imprint": {"en": ("imprint/",), "de": ("de/impressum/", "imprint/")},
}
# every other language's from the table (a language without a legal notice of its own links the English one)
for _kind, _pages in SITE_PAGES.items():
    for _code in L.built:
        _pages.setdefault(_code, (L.page(_code, _kind),))

LANGS, LISTED = L.built, L.listed
# Every pair of data files in this folder is a page.
PAGES = sorted(p.name[:-len(".en.json")] for p in HERE.glob("*.en.json") if not p.name.startswith("names."))

# The style files a search page sets inline, in the site's order: its tokens and base styles, this
# folder's own sheet, then the footer and the rule that stills every transition for readers who ask.
CSS_BEFORE = ["tokens", "base"]
OWN_CSS = ["page"]
# and on a page that shows its wing's works at one scale, the sheet of its chart, list and table
CHART_CSS = ["chart"]
# and on a page that lists its wing's works one by one, by period, the sheet of that list after the chart's
LIST_CSS = ["list"]
# and on every page of a wing in the making, the sheet of its pictures at one scale, its table and its list of pages
SCALE_CSS = ["scale"]
CSS_AFTER = ["foot", "motion"]
CSP_MARK = "<!--csp-->"

TITLE_MAX = 60
DESCRIPTION_MAX = 160

# Characters and words no displayed sentence may carry.
BANNED = ["—", "–", ";", "delve", "tapestry", "landscape", "leverage", "quelloffen", "utilize", "multifaceted",
          "it's worth noting", "immersive", "journey"]
# What no page of the museum says, whatever its wing. (pattern, what to say instead)
# A wing's own fact rules stand in its entry (never_say) and are checked the same way.
BANNED_FACTS = [
    (r"\bfoyer\b", "the museum's word is Lobby"),
    (r"open.source|offenen quellen|offener quelle|github|source code|quellcode|repositor",
     "the page says nothing about the museum's code and links to no code"),
    (r"nothing records|nichts belegt", "say no record is known"),
    # a holder's name from the wing's facts (Private collection) is a name, not a claim
    (r"\bprivate\b(?! collection)|\bprivat\b", "never Private"),
    (r"\bfree\b(?! entry)|\bkostenlos\b|\bgratis\b", "never Free alone: Free entry, no account"),
    (r"true size|wahre[rn]? größe|(?<!annähernd in )originalgröße", "at true size only where it is literally true: "
     "near real size, annähernd in Originalgröße"),
]
# A wing's claim_phrase is what people type but the sources do not carry ("his inventions").
# It may stand in these keys only: the title, the description, the h1, a question.
CLAIM_ALLOWED = (r"^meta\.", r"^top\.h1$", r"\.q$")
# How the words are made is said once, on the page about the museum. A page here carries no line on it.

# What is no sentence in a data file: its page, its pictures, addresses and keys.
NOT_SPACED = r"^(_|page\.|pics\.)|\.(href|focus|pic|pic_back|tag|k|type|id|stem|sizes|work|wall|stop|page|only|at|wing|shape|src_from|span|swatch)$"
# The keys of a data file that hold no displayed words (lint() passes them by).
NOT_WORDS = r"\.(pic|pic_back|tag|k|type|id|stem|sizes|work|wall|stop|page|only|at|wing|shape|src_from|span|swatch)$"
# The two halves of a pair a fact rule reads together (lint): a number named in a row's term is explained in its text.
PAIRS = {"term": "text", "text": "term", "q": "a", "a": "q"}
# A cell of a table of numbers may stand empty where no sourced figure exists (its unit line says so), never its first.
MAY_BE_EMPTY = r"\.rows\.\d+\.cells\.[1-9]\d*$"

BLOCK_TYPES = ("places", "group", "feature", "notes", "faq", "sources", "close", "chart", "works", "table", "text", "periods",
               "numbers", "pages")

# The pictures of the search pages (make_pictures.py cuts them). Its plates are the reproductions a wing hangs, each
# with the record the build checks its source line against.
PICTURES_FILE = HERE / "pictures.json"
# What a plate's source line must say, by the plate's tier (RIGHTS-POLICY): the second tier's line word for word, also
# for a record without a tier (the wing hung those before its tiers, and its rights list reads them as the second), and
# the licence's words for a plate open at its source. The bare line such records once carried is no tier's line.
TIER_LINE = {
    "TIER2": {"en": ("Public domain work.", "Reproduction from ", "The museum labels the reproduction, not the painting.",
                     "Non-profit cultural use."),
              "de": ("Gemeinfreies Werk.", "Reproduktion aus ", "Das Museum kennzeichnet die Reproduktion, nicht das Gemälde.",
                     "Kulturelle Nutzung ohne Gewinnabsicht.")},
    "TIER1": {"en": ("public domain",), "de": ("gemeinfrei",)},
}
BARE_LINE = {"en": re.compile(r"\bpublic domain reproductions? from\b", re.I),
             "de": re.compile(r"\bgemeinfreie reproduktion(?:en)? aus\b", re.I)}
# Units an animal's numbers carry beside the site's own (buildlib.UNIT), and the things they count: a number keeps
# them on its line.
MORE_UNITS = r"(?:ft|in|t|feet|tonnes|Tonnen|kg|million|Millionen|discs|Wirbeln?)"
# The wing's dates are written in English: the German page writes them by these rules.
DATE_DE = {"Sixteenth century, reworked in the early seventeenth century": "16. Jahrhundert, überarbeitet im frühen 17. Jahrhundert"}


# ---------- small tools ----------

def esc(text):
    return html.escape(text, quote=True)


def straight(name):
    return name.replace("’", "'")


class Names:
    """Marks the names that are kept whole in a displayed sentence.

    The wing's own name comes from its entry and never breaks across lines. A name of names.json is
    never hyphenated and carries its language where it differs from the page's, so a screen reader
    says it right. A person's name of that list never breaks either, nor a short place name marked whole."""

    def __init__(self, entries, wing_name, lang, join=False, breaks=()):
        self.lang, self.wing_name, self.join = lang, wing_name, join
        # a name is found whichever apostrophe a language's typography sets in it (l'Institut, l’Institut)
        self.table = {straight(e["text"]): e for e in entries}
        # a page's long word with its one break point ("Giraffa|titan"), for a language that hyphenates on its own
        for word in breaks:
            self.table.setdefault(straight(word.replace("|", "")), {"text": word.replace("|", ""), "split": word.split("|")})
        self.table[straight(wing_name)] = {"text": wing_name, "wing": True}
        # the longest name first, so a full name wins over its last word
        ordered = sorted(self.table, key=len, reverse=True)
        self.find = re.compile(r"(?<!\w)(%s)('s|’s|s)?(?!\w)" % "|".join(re.escape(n).replace("'", "['’]") for n in ordered))

    def mark(self, text, wrap_wing=False, split=False):
        """The sentence as HTML. wrap_wing lets the wing's name wrap where it is too long for a line. split sets a page's
        long words (breaks) with their one break point, for running text that hyphenates; elsewhere they stay whole."""
        out, last = [], 0
        for m in self.find.finditer(text):
            entry, ending = self.table[straight(m.group(1))], m.group(2) or ""
            out.append(esc(text[last:m.start()]))
            last = m.end()
            if entry.get("wing"):
                kind = "nh" if wrap_wing else "nw"
                out.append(f'<span class="{kind}">{esc(m.group(1) + ending)}</span>')
                continue
            if entry.get("split"):
                # two halves never hyphenated, joined by a soft hyphen: the word breaks there or nowhere; display text
                # (a heading, the answer, a label) never hyphenates, so there the word is only kept whole
                head, tail = entry["split"]
                out.append(f'<span class="nh">{esc(head)}</span>&shy;<span class="nh">{esc(tail + ending)}</span>' if split
                           else f'<span class="nh">{esc(m.group(1) + ending)}</span>')
                continue
            kind = "nw nh" if entry.get("person") or entry.get("whole") else "nh"
            name = m.group(1)
            if self.join and kind == "nw nh" and not entry.get("person") and re.fullmatch(r"[^\s-]+(?: [^\s-]+)+", name):
                # WebKit lets a line run past its column by the mark that follows a nowrap name; a name whose
                # only breaks are spaces is held whole by no-break spaces instead
                kind, name = "nh", name.replace(" ", LIB.NBSP)
            # a scientific name (taxon) is set in italics, as biology writes it
            tag = "i" if entry.get("taxon") else "span"
            code = entry.get("lang")
            if code and code != self.lang:
                # the ending is the page's own language and stays outside
                out.append(f'<{tag} class="{kind}" lang="{code}">{esc(name)}</{tag}>{esc(ending)}')
            else:
                out.append(f'<{tag} class="{kind}">{esc(name + ending)}</{tag}>')
        out.append(esc(text[last:]))
        return "".join(out)

    def wing_run(self, text):
        """The length of the wing's name with its ending as it stands in a heading, or 0."""
        runs = [len(m.group(0)) for m in self.find.finditer(text) if self.table[straight(m.group(1))].get("wing")]
        return max(runs, default=0)

    def left_over(self, text):
        """What of a name is not on the list: the name's commas and spaces, if all of it is."""
        return re.sub(r"[\s,]+", "", self.find.sub("", text))


def flatten(obj, prefix=""):
    """Every displayed string of a data file by its key path. Lists count their entries."""
    out = {}
    if isinstance(obj, dict):
        for key, value in obj.items():
            out.update(flatten(value, f"{prefix}{key}."))
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            out.update(flatten(value, f"{prefix}{i}."))
    elif isinstance(obj, str):
        out[prefix[:-1]] = obj
    return out


def shape(obj):
    """The structure of a data file without its words, to compare the two languages. An entry of a list that only
    one language has (only: its code, a source in that language) is no part of it."""
    if isinstance(obj, dict):
        return {k: shape(v) for k, v in obj.items() if k != "_note"}
    if isinstance(obj, list):
        return [shape(v) for v in obj if not (isinstance(v, dict) and "only" in v)]
    return type(obj).__name__


def only_entries(obj):
    """Every entry of a data file that stands in one language only (only: its code)."""
    if isinstance(obj, dict):
        return ([obj] if "only" in obj else []) + [e for v in obj.values() for e in only_entries(v)]
    if isinstance(obj, list):
        return [e for v in obj for e in only_entries(v)]
    return []


def fill(template, values):
    """Every {{key}} needs a value. A missing key stops the build."""
    def sub(match):
        key = match.group(1)
        if key not in values:
            raise KeyError(f"no value for {{{{{key}}}}}")
        return values[key]

    return re.sub(r"\{\{([a-zA-Z0-9_.:]+)\}\}", sub, template)


def parts_of(text):
    """The template's pieces by name: a piece starts at a line <!--@ name -->."""
    pieces = re.split(r"^<!--@ ([\w:.-]+) -->\n", text, flags=re.M)
    return {name: body.rstrip("\n") for name, body in zip(pieces[1::2], pieces[2::2])}


def css_min(*paths):
    text = "".join(p.read_text(encoding="utf-8") for p in paths)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*([{};])\s*", r"\1", text)
    return text.replace(";}", "}").strip()


def webp_size(path):
    """Pixel size from the file's own header, so no size is typed by hand."""
    head = path.read_bytes()[:32]
    if head[:4] != b"RIFF" or head[8:12] != b"WEBP":
        raise ValueError(f"{path.name} is not a WebP file")
    kind = head[12:16]
    if kind == b"VP8X":
        return 1 + int.from_bytes(head[24:27], "little"), 1 + int.from_bytes(head[27:30], "little")
    if kind == b"VP8 ":
        w, h = struct.unpack("<HH", head[26:30])
        return w & 0x3FFF, h & 0x3FFF
    if kind == b"VP8L":
        bits = int.from_bytes(head[21:25], "little")
        return 1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)
    raise ValueError(f"{path.name}: unknown WebP kind {kind!r}")


def with_policy(text):
    """The site's content security policy for this page: its own files, and each inline style by its hash.
    The page carries no script. Its one script element is a data block, which a policy does not run."""
    marks = []
    for body in re.findall(r"<style\b[^>]*>(.*?)</style>", text, flags=re.S):
        mark = "'sha256-%s'" % base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
        if mark not in marks:
            marks.append(mark)
    policy = (f"default-src 'none'; script-src 'self'; style-src 'self' {' '.join(marks)}; "
              "img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'")
    return text.replace(CSP_MARK, f'<meta http-equiv="Content-Security-Policy" content="{policy}">')


def moved(url, prefix):
    """A link of a page at the site's root (or in /de/), as it reads from a page further down."""
    if re.match(r"(?:[a-z][a-z0-9+.-]*:|/|#)", url) or not url:
        return url
    path, sep, rest = re.match(r"([^?#]*)([?#]?)(.*)", url, flags=re.S).groups()
    clean = posixpath.normpath(prefix + path)
    return clean + ("/" if path.endswith("/") else "") + sep + rest


def chrome_file(base, lang):
    name = CHROME_PAGE[lang]
    return base / name / "index.html" if name.endswith("/") else base / name


def site_parts(site_src, site_built):
    """Where the header, the footer, the styles and the fonts come from: the site, or this folder's
    last good copy of it while the site's statement page is not at the address this build knows."""
    if all(chrome_file(site_built, lang).is_file() for lang in LANGS):
        return {"pages": site_built, "css": site_src / "css", "fonts": site_built / STATIC / "fonts", "note": ""}
    if not all(chrome_file(LAST_GOOD / "site", lang).is_file() for lang in LANGS):
        raise SystemExit(f"{chrome_file(site_built, 'en')} is missing, and {LAST_GOOD} holds no copy of it")
    return {"pages": LAST_GOOD / "site", "css": LAST_GOOD / "css", "fonts": LAST_GOOD / STATIC / "fonts",
            "note": (f"The site's statement page is not at {CHROME_PAGE['en']}: the header, the footer, the shared "
                     f"styles and the fonts are taken from {LAST_GOOD.name}/.")}


def site_chrome(site_built, lang, root, twins, door):
    """The header, the footer, the arrow and the publisher's record, from the site's built statement page. Without a
    door (a wing in the making) the header carries no way into the walk, and the lists of languages only the page's own
    (twins)."""
    name = CHROME_PAGE[lang]
    source = chrome_file(site_built, lang)
    page = source.read_text(encoding="utf-8")
    prefix = root + (name if name.endswith("/") else name.rsplit("/", 1)[0] + "/" if "/" in name else "")
    out = {}
    for key, pattern in (("header", r'<a class="skip".*?</header>'), ("footer", r'<footer class="foot".*?</footer>')):
        found = re.search(pattern, page, flags=re.S)
        if not found:
            raise SystemExit(f"{source}: no {key} found")
        text = re.sub(r'\b(href|src)="([^"]*)"', lambda m: f'{m.group(1)}="{moved(m.group(2), prefix)}"', found.group(0))
        # each way to another language leads to this page's twin in it, and no link of the header is the current page
        text = re.sub(r'(<a\b[^>]*?\bhref=")[^"]*("[^>]*\blang="([^"]*)" hreflang="\3")',
                      lambda m: m.group(1) + twins[m.group(3)] + m.group(2) if m.group(3) in twins else m.group(0), text)
        text = text.replace(' aria-current="page"', "")
        # in the list of languages, this page's own is the current one
        own = re.escape(L.html(lang))
        text = re.sub(r'(<li><a href="[^"]*" lang="%s" hreflang="%s")>' % (own, own), r'\1 aria-current="page">', text)
        if door:
            # every way in leads to this page's wing, whatever door the site's page carried when it was built
            text = re.sub(r'(<a class="door[^"]*" href=")[^"]*"', lambda m: m.group(1) + esc(door) + '"', text)
            text = re.sub(rf'href="(?:{DOOR_SHAPE}|{OLD_DOOR})"', f'href="{esc(door)}"', text)
        else:
            # no button stands for a way into a wing that is not open, and no language leads to a page that is not there
            text = re.sub(r'[ \t]*<!--[^>]*-->\n(?=[ \t]*<a class="door)', "", text)
            text = re.sub(r'[ \t]*<a class="door[^"]*"[^>]*>.*?</a>\n?', "", text, flags=re.S)
            text = re.sub(rf'[ \t]*<li><a href="(?:{DOOR_SHAPE}|{OLD_DOOR})"[^>]*>[^<]*</a></li>\n?', "", text)
            text = re.sub(r'<li><a href="[^"]*" lang="([\w-]+)" hreflang="\1"[^>]*>[^<]*</a></li>',
                          lambda m: m.group(0) if m.group(1) in twins else "", text)
            # the credit for the map data the open wing's house is built from: no picture of a wing in the making uses it
            text = re.sub(r'[ \t]*<p>(?:(?!</p>).)*href="%s"(?:(?!</p>).)*</p>\n?' % re.escape(MAP_LINK), "", text, flags=re.S)
        out[key] = text
    arrow = re.search(r'<svg class="arrow".*?</svg>', page, flags=re.S)
    if not arrow:
        raise SystemExit(f"{source}: the door's arrow was not found")
    out["arrow"] = arrow.group(0)
    # the licence of the site's own pictures: the footer's licence link once it carries one, before that the
    # statement page's section on rights, which says whose they are
    rights = f"{ORIGIN}/{name}#open"
    if 'id="open"' not in page:
        raise SystemExit(f"{source}: the section on rights (#open) was not found")
    licence = re.search(r'<a\b(?=[^>]*\bdata-licence\b)[^>]*\bhref="(https://[^"]+)"', page)
    out["licence"] = licence.group(1) if licence else rights
    # the section that tells how to reuse the museum's own pictures, while the site states their licence: each of
    # them names it in the page's structured data
    out["use_pictures"] = f"{ORIGIN}/{name}#{USE_PICTURES}" if f'id="{USE_PICTURES}"' in page else None
    # the language menu and the line on how the words were made take the site's language rules, with the bar's
    # height as the site's page sets it for them
    by = re.search(r":root\{--by:[^}]*\}", page)
    out["langs"] = 'class="langs' in out["header"] or 'class="aitag"' in out["header"] or 'class="hint' in out["header"]
    out["by"] = by.group(0) if by else ""
    out["publisher"], out["alternate_name"] = None, "Museum of Ages"
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, flags=re.S):
        for node in json.loads(block.replace("<\\/", "</")).get("@graph", []):
            if str(node.get("@id", "")).endswith("#publisher"):
                out["publisher"] = node
            # the museum's name with what it is, as the site's page in this language gives it
            if node.get("@type") == "WebSite" and node.get("alternateName"):
                out["alternate_name"] = node["alternateName"]
    theme = re.search(r'<meta name="theme-color" content="([^"]+)"', page)
    out["theme"] = theme.group(1) if theme else ""
    return out


# ---------- checks on the words ----------

def making(wing):
    """A wing in the making: its pages stand before it opens, and none of them has a door."""
    return wing.get("state") == "making"


def newest_open(wings):
    """The key of the newest open wing: the registry lists the wings in the order they opened."""
    found = [k for k, w in wings.items() if w.get("state") == "open"]
    if not found:
        raise SystemExit(f"{WINGS_FILE.name}: no wing is open, so a page of a wing in the making has nowhere to link")
    return found[-1]


def wing_of(page, data, wings):
    name = data["page"].get("wing")
    if name not in wings:
        raise SystemExit(f"{page}: page.wing is {name!r}, and {WINGS_FILE.name} has no such wing")
    wing = wings[name]
    keys, own = (MAKING_KEYS if making(wing) else WING_KEYS), LANG.wing_langs(wing, LANGS)
    missing = [k for k in keys if k not in wing] + [f"{k}.{c}" for k in ("name", "page", "door") if k in keys for c in own
                                                    if c not in wing.get(k, {})]
    if missing:
        raise SystemExit(f"{WINGS_FILE.name}: the wing {name!r} lacks {', '.join(missing)}")
    if making(wing):
        if "door" in wing:
            raise SystemExit(f"{WINGS_FILE.name}: the wing {name!r} is in the making and names a door: it has no way in yet")
        return wing
    for code in LANGS:
        if not re.fullmatch(DOOR_SHAPE, wing["door"][code]):
            raise SystemExit(f"{WINGS_FILE.name}: the door of {name!r} ({code}) is not a wing's plain opening")
    return wing


def lint(page, lang, data, wing, names, topic=None):
    problems = []
    words = flatten({k: v for k, v in data.items() if k not in ("_note", "page", "pics")})
    own = LANG.LANG_DIR / f"{lang}.json"
    rows = json.loads(own.read_text(encoding="utf-8")) if own.is_file() else {}
    # a topic page's own rules (its entry's never_say) hold for that page beside its wing's
    never = (BANNED_FACTS + [tuple(rule) for rule in wing["never_say"]] + [tuple(rule) for rule in (topic or {}).get("never_say", [])]
             + [tuple(x) for x in rows.get("never", [])])
    banned = BANNED + rows.get("banned", [])
    for key, text in words.items():
        # a rule that refuses a number unless its field says where it came from also reads the other half of the
        # field's pair: a row's term with its text, a question with its answer
        head, _, last = key.rpartition(".")
        pair = words.get(f"{head}.{PAIRS[last]}") if last in PAIRS else None
        where = f"{page}.{lang}: {key}"
        if key.endswith(".href"):
            if not re.fullmatch(r"https://[^\s\"<>]+", text):
                problems.append(f"{where} is not a plain https address")
            continue
        if key.endswith(".focus"):
            if not re.fullmatch(r"\d{1,3}% \d{1,3}%", text):
                problems.append(f"{where} is not a place in a picture, as in 50% 80%")
            continue
        if re.search(NOT_WORDS, key):
            continue
        if not text.strip() and not key.endswith(".nav") and not re.search(MAY_BE_EMPTY, key):
            problems.append(f"{where} is empty")
        low = text.lower()
        for bad in banned:
            if bad in low:
                problems.append(f"{where} contains {bad!r}")
        for pattern, instead, *only in never:
            # a rule may name the languages it holds for: German "her" is not the English pronoun
            if only and lang not in only[0]:
                continue
            if re.search(pattern, low) and (pair is None or re.search(pattern, f"{low}\n{pair.lower()}")):
                problems.append(f"{where} matches /{pattern}/ ({instead})")
        if wing["claim_phrase"] and re.search(wing["claim_phrase"], low) and not any(re.search(ok, key) for ok in CLAIM_ALLOWED):
            problems.append(f"{where} carries the wing's claim phrase outside a heading people search for")
    if len(data["meta"]["title"]) > TITLE_MAX:
        problems.append(f"{page}.{lang}: the title is {len(data['meta']['title'])} characters, the limit is {TITLE_MAX}")
    if len(data["meta"]["description"]) > DESCRIPTION_MAX:
        problems.append(f"{page}.{lang}: the description is {len(data['meta']['description'])} characters, "
                        f"the limit is {DESCRIPTION_MAX}")
    kinds = [b["type"] for b in data["blocks"]]
    for kind in kinds:
        if kind not in BLOCK_TYPES:
            problems.append(f"{page}.{lang}: unknown block type {kind!r}")
    ids = ([b["id"] for b in data["blocks"]] + [i["id"] for b in data["blocks"] for i in b.get("items", []) if "id" in i]
           + [x["id"] for b in data["blocks"] for p in b.get("periods", []) for x in [p] + p["items"]])
    if len(ids) != len(set(ids)):
        problems.append(f"{page}.{lang}: an id stands twice in {ids}")
    for block in data["blocks"]:
        if block["type"] != "sources":
            continue
        if "ai" in block:
            problems.append(f"{page}.{lang}: sources.ai is gone from these pages, take the key out")
        for house in block.get("holders", []) + block.get("editions", []):
            if names.left_over(house["name"]):
                problems.append(f"{page}.{lang}: the house {house['name']!r} is not in {NAMES_FILE.name}, "
                                "so its name would be hyphenated and read in the wrong language")
    # a wing's list of its pages names no source of its own: each page it lists carries its sources
    if kinds.count("sources") != (0 if data["page"].get("hub") else 1):
        problems.append(f"{page}.{lang}: a page needs exactly one sources block, a wing's list of pages none")
    for entry in only_entries(data):
        if entry["only"] != lang:
            problems.append(f"{page}.{lang}: an entry marked only {entry['only']!r} stands in the {lang} file")
    return problems


# ---------- pictures ----------

class Pictures:
    def __init__(self, defs, folders, root):
        self.defs, self.folders, self.root, self.used = defs, folders, root, set()

    def find(self, file):
        for folder in self.folders:
            if (folder / file).is_file():
                return folder / file
        raise SystemExit(f"the picture {file} is in none of: {', '.join(str(f) for f in self.folders)}. The repository "
                         "does not keep the pictures: python3 _src/tools/fetch.py fetches them (make_pictures.py cuts them)")

    def files(self, name):
        d = self.defs[name]
        return [f"{c['stem']}-{n}.{ext}" for c in (d, d.get("narrow")) if c for n in c["widths"] for ext in ("avif", "webp")]

    def cut(self, name, narrow=False):
        """The picture's cuts, or those of its version for narrow screens (pics.<name>.narrow)."""
        return self.defs[name]["narrow"] if narrow else self.defs[name]

    def size(self, name, narrow=False):
        d = self.cut(name, narrow)
        return webp_size(self.find(f"{d['stem']}-{max(d['widths'])}.webp"))

    def srcset(self, name, ext, narrow=False):
        d = self.cut(name, narrow)
        return ", ".join(f"{self.root}{STATIC}/img/{d['stem']}-{n}.{ext} {n}w" for n in d["widths"])

    def picture(self, name, alt, first=False):
        """AVIF with a WebP fallback. Width and height keep the box, so nothing moves when it arrives. A picture with
        a version for narrow screens (pics.<name>.narrow, a closer cut of the same render) gives it to them first."""
        d = self.defs[name]
        self.used.add(name)
        w, h = self.size(name)
        how = 'fetchpriority="high"' if first else 'loading="lazy" decoding="async"'
        out = ["<picture>"]
        if d.get("narrow"):
            nw, nh = self.size(name, True)
            for ext in ("avif", "webp"):
                out.append(f'<source media="(max-width: {d["narrow"]["below"] - 1}px)" type="image/{ext}" '
                           f'srcset="{self.srcset(name, ext, True)}" sizes="{d["sizes"]}" width="{nw}" height="{nh}">')
        for ext in ("avif", "webp"):
            out.append(f'<source type="image/{ext}" srcset="{self.srcset(name, ext)}" sizes="{d["sizes"]}" '
                       f'width="{w}" height="{h}">')
        out.append(f'<img src="{self.root}{STATIC}/img/{d["stem"]}-{max(d["widths"])}.webp" width="{w}" height="{h}" '
                   f'alt="{alt}" {how}>')
        out.append("</picture>")
        return "".join(out)

    def preload(self, name):
        d = self.defs[name]
        link = lambda narrow, media: (f'<link rel="preload" as="image" type="image/avif" imagesrcset="{self.srcset(name, "avif", narrow)}" '
                                      f'imagesizes="{d["sizes"]}"{media} fetchpriority="high">\n')
        if d.get("narrow"):
            below = d["narrow"]["below"]
            return link(True, f' media="(max-width: {below - 1}px)"') + link(False, f' media="(min-width: {below}px)"')
        return link(False, "")


def faces(root, lang=None):
    """The site's two faces and its figures, and a language's own. They swap in after the text is up: no script is needed."""
    rule = ('@font-face{{font-family:"{name}";src:url("{root}{static}/fonts/{file}") format("woff2");'
            "font-weight:400;font-style:normal;font-display:swap{extra}}}")
    own = "".join(rule.format(name=name, root=root, static=STATIC, file=file, extra="") for name, file, _ in LIB.LANG_FACES.get(lang, ()))
    return own + (rule.format(name="Cardo", root=root, static=STATIC, file="cardo-400.woff2", extra="")
            + rule.format(name="Marcellus", root=root, static=STATIC, file="marcellus-400.woff2", extra="")
            + rule.format(name="Moa figures", root=root, static=STATIC, file="cardo-400.woff2",
                          extra=";unicode-range:U+30-39;size-adjust:108%"))


def person_rules(defs):
    """Where the person's height stands over the person in each picture at one scale: centred over the person, just
    above the head (pics.<name>.person, the person's centre and the top of the head as shares of the picture). Where
    the picture leaves it open stone only from a screen width (pics.<name>.person_from), it stands from there on. A
    version for narrow screens (pics.<name>.narrow) has the person at its own place there, or no height if it has none."""
    rules = []
    place = lambda at: re.fullmatch(r"(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%", at or "")
    for name, d in defs.items():
        found = place(d.get("person"))
        if not found:
            continue
        rule = lambda f: ".sc-person--%s{left:%g%%;bottom:calc(%g%% + 4px)}" % (name, float(f.group(1)), round(100 - float(f.group(2)), 3))
        narrow, start = d.get("narrow"), d.get("person_from") or 0
        if not narrow:
            rules.append(rule(found))
            if start:
                rules.append("@media (max-width:%dpx){.sc-person--%s{display:none}}" % (start - 1, name))
            continue
        below, near = narrow["below"], place(narrow.get("person"))
        if near:
            rules.append(rule(near) + "@media (min-width:%dpx){%s}" % (below, rule(found)))
            if start > below:
                rules.append("@media (min-width:%dpx) and (max-width:%dpx){.sc-person--%s{display:none}}" % (below, start - 1, name))
        else:
            rules.append(rule(found) + "@media (max-width:%dpx){.sc-person--%s{display:none}}" % (max(below, start) - 1, name))
    return "".join(rules)


def span_rules(defs):
    """Where each span of a picture's length bar starts and ends (pics.<name>.spans, shares of the picture's width).
    The bar stands under the picture, whose frame is two pixels each side, so the shares are of the width inside it."""
    rules = []
    for name, d in defs.items():
        for key, at in (d.get("spans") or {}).items():
            found = re.fullmatch(r"(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%", at)
            if found:
                a, b = float(found.group(1)) / 100, float(found.group(2)) / 100
                rules.append(".sc-bar--%s-%s{margin-left:calc(2px + (100%% - 4px) * %g);width:calc((100%% - 4px) * %g)}"
                             % (name, key, round(a, 4), round(b - a, 4)))
    return "".join(rules)


# A key's swatch: its square, and the line it leads, on a page whose key has swatches only
SWATCH = (".sc-keys{display:grid;gap:4px;margin:4px 0 0;padding:0;list-style:none}"
          ".sc-keys__i{display:flex;align-items:baseline;gap:8px}"
          ".sc-swatch{flex:none;width:.8em;height:.8em;transform:translateY(.1em);box-shadow:inset 0 0 0 1px var(--hair-strong)}")


def swatch_rules(defs):
    """The colour of each swatch in a picture's key (pics.<name>.swatches, the colour as the picture prints it, so the
    key's words and the picture agree), with the swatch's own rules, only where a key has swatches."""
    rules = []
    for name, d in defs.items():
        for key, colour in (d.get("swatches") or {}).items():
            if re.fullmatch(r"#[0-9a-f]{6}", colour):
                rules.append(".sc-swatch--%s-%s{background:%s}" % (name, key, colour))
    return SWATCH + "".join(rules) if rules else ""


MARK_AT = r"(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%(?: (start|end))?"
# The phones the labels are laid for besides the widths a picture's sizes name: from the first up, no words touch
MARK_SCREENS = (360, 390)
# From this screen width a label under a picture stands on one line, its name and length joined by a comma, as one
# over it always does (several.css says the same)
MARK_ONE_LINE = 960
# The label face's widths in thousandths of its size: the letters of Marcellus, the figures of Cardo at 108%; any
# other letter counts as wide, an accented one as its letter. Then its size, its spacing and a margin.
MARK_FACE = {**dict(zip("abcdefghijklmnopqrstuvwxyz", (517, 584, 505, 604, 542, 320, 584, 568, 241, 237, 486, 241, 884,
                                                        568, 601, 584, 584, 392, 354, 384, 568, 476, 751, 523, 501, 466))),
             **dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (678, 561, 677, 714, 490, 466, 742, 727, 265, 249, 646, 460, 1018,
                                                        739, 806, 512, 806, 591, 455, 597, 710, 658, 1014, 698, 621, 642))),
             **dict(zip(" \u00a0.,;:()-'\u2019/\u00df", (300, 300, 205, 205, 235, 235, 301, 301, 410, 178, 174, 436, 513))),
             **dict.fromkeys("0123456789", 553)}
MARK_WIDE, MARK_PX, MARK_SPACING, MARK_SAFE = 900, 12, 20, 1.04
# The least room between two labels in one lane, and the least width a label's words may wrap to
MARK_GAP, MARK_LEAST = 8, 64


def mark_at(at):
    """A label's place (pics.<name>.marks.<span>): the animal's start and end as shares of the picture's width, and
    the side its words must keep to (start or end) when the place names one, else None."""
    found = re.fullmatch(MARK_AT, at or "")
    if not found:
        return None
    return float(found.group(1)) / 100, float(found.group(2)) / 100, found.group(3)


def mark_split(text):
    """A label's name and its length: the words before its first comma, and the rest."""
    name, _, rest = text.partition(", ")
    return name, rest


def size_bands(sizes):
    """The picture's width at each screen width its labels are laid for: the narrowest phones (MARK_SCREENS) and each
    width from which its sizes give another rule, read as a browser reads them, the first rule that holds."""
    rules = []
    for part in re.split(r",\s*(?![^()]*\))", sizes):
        found = re.fullmatch(r"\s*(?:\(min-width:\s*(\d+)px\)\s*)?(.+?)\s*", part)
        rules.append((int(found.group(1) or 0), found.group(2)))

    def width(screen):
        value = next(v for least, v in rules if screen >= least)
        calc = re.fullmatch(r"calc\((\d+(?:\.\d+)?)vw - (\d+)px\)", value)
        if calc:
            return float(calc.group(1)) * screen / 100 - int(calc.group(2))
        return float(value[:-2]) * screen / 100 if value.endswith("vw") else float(value.removesuffix("px"))

    screens = sorted(set(MARK_SCREENS) | {least for least, _ in rules if least > MARK_SCREENS[0]})
    return [(screen, width(screen)) for screen in screens]


def mark_lanes(items, width, one_line):
    """Several labels laid into lanes for a picture this wide: each label's words start at its animal's start or end
    at its end, and no two in one lane come near each other's words or brackets. Returns each label's lane (0 the one
    nearest the picture), side and the width its words may take, and the number of lanes."""
    est = lambda t: MARK_PX * MARK_SAFE * sum(MARK_FACE.get(unicodedata.normalize("NFD", c)[0], MARK_WIDE) + MARK_SPACING for c in t) / 1000
    apart = lambda p, q, gap: p[1] + gap <= q[0] or q[1] + gap <= p[0]
    inner = width - 4
    lanes, out = [], {}
    for key, a, b, keep, name, value in sorted(items, key=lambda it: (it[1], it[2])):
        want = est(f"{name}, {value}") if one_line else max(est(name), est(value))
        bracket = 2 + inner * a, 2 + inner * b
        first = keep or ("start" if a + b < 1 else "end")
        sides = [first] if keep else [first, "end" if first == "start" else "start"]
        # a side the words fit at: the name whole on its line, the rest on two lines at most
        least = min(want, max(MARK_LEAST, est(name), 0.6 * (est(f"{name}, {value}") if one_line else est(value))))
        room = lambda side: min(want, width - bracket[0] if side == "start" else bracket[1])
        words = lambda side, w: (bracket[0], bracket[0] + w) if side == "start" else (bracket[1] - w, bracket[1])
        # words keep a gap from words and brackets from brackets; a bracket stands above the words of its lane, so
        # it may come nearer to another label's words
        fits = lambda side, w, lane: all(
            apart(words(side, w), o, MARK_GAP) and apart(bracket, k, MARK_GAP) and apart(words(side, w), k, MARK_GAP / 2)
            and apart(bracket, o, MARK_GAP / 2) for o, k in lanes[lane])
        # the widest the words may take in a lane, wrapping no narrower than least
        widest = lambda side, lane: next((w for w in [room(side)] + list(range(math.floor(room(side)), math.ceil(least) - 1, -4))
                                          if w >= least and fits(side, w, lane)), None)
        placed = next(((lane, side, widest(side, lane)) for lane in range(len(lanes)) for side in sides
                       if widest(side, lane)), None)
        if not placed:
            lanes.append([])
            side = max(sides, key=lambda side: room(side) >= least)
            placed = len(lanes) - 1, side, room(side)
        lane, side, w = placed
        lanes[lane].append((words(side, w), bracket))
        out[key] = (lane, side, math.ceil(w))
    return out, len(lanes)


def has_points(data):
    """Whether a text block of the page sets a short list of points."""
    return any(isinstance(p, dict) for b in data["blocks"] if b["type"] == "text"
               for p in b.get("paras", []) + [q for sub in b.get("subs", []) for q in sub["paras"]])


def marked_figures(data):
    """Every picture of a page that carries a label at each of its subjects, the first picture's closer panel included."""
    top = data["top"].get("scale")
    figs = [top, (top or {}).get("close")] + [b["scale"] for b in data["blocks"] if b.get("scale")]
    figs += [f.get("close") for f in figs[2:] if f]
    return [f for f in figs if f and f.get("marks")]


def mark_rules(data):
    """Where each label at a picture of several subjects stands, for each band of screens the picture's sizes name:
    its bracket over or under the animal's place (pics.<name>.marks), its lane, and its words from the bracket's
    start or ending at its end. An animal that stands behind another (pics.<name>.behind) is named over the
    picture, the rest under it, so two at one place are never named on one side."""
    rules = []
    bracket = lambda name, key, a, b: (".sc-mark--%s-%s::after{left:calc(2px + (100%% - 4px) * %g);width:calc((100%% - 4px) * %g)}"
                                        % (name, key, round(a, 4), round(b - a, 4)))
    for fig in marked_figures(data):
        pic = data["pics"][fig["pic"]]
        behind = set(pic.get("behind") or [])
        # a version for narrow screens (pics.<name>.narrow) places its own labels below its width and leaves out
        # those it does not place
        narrow = pic.get("narrow") or {}
        near, below = narrow.get("marks") or {}, narrow.get("below", 0)

        def grouped(places):
            groups = {}
            for m in fig["marks"]:
                if m["span"] in places:
                    groups.setdefault(m["span"] in behind, []).append((m["span"], *mark_at(places[m["span"]]), *mark_split(m["text"])))
            return groups
        for key, (a, b, _) in ((k, mark_at(v)) for k, v in pic["marks"].items()):
            rules.append(bracket(fig["pic"], key, a, b))
        if narrow:
            rules.append("@media (max-width:%dpx){%s}" % (below - 1, "".join(
                bracket(fig["pic"], key, *mark_at(near[key])[:2]) if key in near else ".sc-mark--%s-%s{display:none}" % (fig["pic"], key)
                for key in pic["marks"])))
        last = {}
        for screen, width in size_bands(pic["sizes"]):
            band = []
            if screen == below:
                # the full picture's labels restate every part over the narrow version's
                last = {}
            for over, items in grouped(near if screen < below else pic["marks"]).items():
                # those over the picture are the few long ones behind: their words on one line on every screen
                laid, n = mark_lanes(items, width, over or screen >= MARK_ONE_LINE)
                for key, (lane, side, w) in laid.items():
                    a, b, _ = mark_at((near if screen < below else pic["marks"])[key])
                    parts = {
                        "lane": ("grid-row:%d" % (n - lane if over else lane + 1), ""),
                        "side": ("padding-left:calc(2px + (100%% - 4px) * %g);padding-right:0;justify-content:flex-start" % round(a, 4),
                                 "text-align:left") if side == "start" else
                                ("padding-left:0;padding-right:calc(2px + (100%% - 4px) * %g);justify-content:flex-end" % round(1 - b, 4),
                                 "text-align:right"),
                        "width": ("", "max-width:%dpx" % w)}
                    # a band says only what changed since the narrower one
                    changed = [part for name, part in parts.items() if last.get((key, name)) != part]
                    last.update(((key, name), part) for name, part in parts.items())
                    for at, i in (("", 0), (">span", 1)):
                        said = ";".join(part[i] for part in changed if part[i])
                        if said:
                            band.append(".sc-mark--%s-%s%s{%s}" % (fig["pic"], key, at, said))
            if band:
                rules.append("".join(band) if screen <= MARK_SCREENS[0] else "@media (min-width:%dpx){%s}" % (screen, "".join(band)))
    return "".join(rules)


def focus_rule(frame):
    """Where the first picture keeps its subject while a phone's box cuts it. The place is the picture's
    own, so it stands in the data file (top.frame.focus) and not in the style file."""
    if not frame.get("focus"):
        return ""
    return "@media (max-width:599px){.sp-frame img{object-position:%s}}" % frame["focus"]


# ---------- the source line of a still the wing shows too ----------

# The museum's record of every reproduction its walk shows, by wing (relative to the repository): a plate's source line
# that names a Commons file must name one the record names for that wing.
RECORD = "museum/src/wings/{wing}/pictures/data/store-audit.json"


def museum_words(text, lang):
    """A sentence with the museum's own words ({museum:key}) filled in."""
    museum = json.loads((LANG.HERE / "museum-texts.json").read_text(encoding="utf-8"))[lang]
    return re.sub(r"\{museum:(\w+)\}", lambda m: museum[m.group(1)], text)


def plates():
    """The plates of pictures.json by name: the reproductions a wing hangs, each with its record."""
    if not PICTURES_FILE.is_file():
        return {}
    return {p["name"]: p for p in json.loads(PICTURES_FILE.read_text(encoding="utf-8")).get("plates", [])}


def source_line(parts, wing, lang, rich):
    """A plate's source line: its words with the museum's own filled in, and a link where a part gives one. A link to
    a Commons file is checked against the wing's record, where the repository holds it, or against a plate's record
    (pictures.json, plates), which make_pictures.py checked against the museum's store when it cut the plate."""
    record = LANG.HERE.parent.parent / RECORD.format(wing=wing)
    sources = {p["source"] for p in plates().values()}
    out = []
    for part in parts:
        if isinstance(part, str):
            out.append(rich(museum_words(part, lang)))
            continue
        if part.get("br"):
            out.append("<br>")
            continue
        name = re.search(r"/wiki/File:(.+)$", part["href"])
        if name and record.is_file() and part["href"] not in sources:
            listed = urllib.parse.unquote(name.group(1)).replace("_", " ")
            if f"File:{listed}" not in record.read_text(encoding="utf-8"):
                raise SystemExit(f"a plate names File:{listed}, which {RECORD.format(wing=wing)} does not name")
        out.append(f'<a href="{esc(part["href"])}">{rich(part["text"])}</a>')
    # the site's source link is an inline block (its touch target), which would let a line break before the
    # stop that follows it: the link and that stop stay together
    return re.sub(r'(<a href="[^"]*">(?:(?!</a>).)*</a>)([.,:)]+)', r'<span class="nw">\1\2</span>', "".join(out))


def plate_problems(src, names, lang, labels=None):
    """What a source line lacks for the plates it stands under (names): the link to each plate's source, its tier's
    line (the tier its record holds, or the one the page reads it as, read_as), the link to its licence, the Italian
    code's line where its record asks for it, and the page's labels the plate names: the line it carries word for word
    (line, which a cropped plate needs), the sentence that stands for the second tier's 'not the painting' (tier_line),
    and for a plate shown through the film's still the opening that says so (still_open). Returns the problems."""
    labels = labels or {}
    still_open = labels.get("still_open")
    known, problems = plates(), []
    links = {part["href"] for part in src if isinstance(part, dict) and "href" in part}
    words = "".join(part if isinstance(part, str) else part.get("text", " ") for part in src).replace(LIB.NBSP, " ")
    # a source line broken in two (a work's two faces) holds one line per plate: each plate's tier is read in its own
    segments, cur = [], ""
    for part in src + [{"br": True}]:
        if isinstance(part, dict) and part.get("br"):
            segments.append(cur.replace(LIB.NBSP, " "))
            cur = ""
        else:
            cur += part if isinstance(part, str) else part["text"]
    for name in names:
        plate = known.get(name)
        if plate is None:
            problems.append(f"{name} is no plate of {PICTURES_FILE.name}")
            continue
        read = plate.get("read_as") or {}
        if plate["source"] not in links:
            problems.append(f"{name}: the source line does not link the plate's source {plate['source']}")
        for url in (plate["licence_url"], read.get("licence_url")):
            if url and url not in links:
                problems.append(f"{name}: the source line does not link the plate's licence {url}")
        if plate["it108"] and "{museum:it108}" not in words:
            problems.append(f"{name}: the plate's record asks for the Italian code's line ({{museum:it108}})")
        tier = read.get("tier") or plate["tier"]
        tier = tier if tier in TIER_LINE else "TIER2"
        mine = labels.get(plate.get("line") or "")
        own = next((s for s in segments if mine and mine in s), words) if len(segments) > 1 else words
        want = list(TIER_LINE[tier][lang])
        if tier == "TIER2" and plate.get("tier_line"):
            want[2] = labels.get(plate["tier_line"]) or f"labels.{plate['tier_line']}"
        for line in want:
            if (line.lower() not in own.lower()) if tier == "TIER1" else (line not in own):
                problems.append(f"{name}: a plate of tier {plate['tier'] or 'none'} carries {line!r} in its source line")
        bare = BARE_LINE[lang].search(own)
        if bare and tier == "TIER2":
            problems.append(f"{name}: {bare.group(0)!r} is the bare line of a plate without a tier, which carries the second tier's line")
        if plate.get("line") and not (labels.get(plate["line"]) and labels[plate["line"]] in words):
            problems.append(f"{name}: the plate's source line carries labels.{plate['line']} word for word")
        if plate.get("crop") and not plate.get("line"):
            problems.append(f"{name}: the plate is cut to the painting ({plate['crop']}), and names the label that says so (line)")
        if plate.get("still") and not (still_open and words.startswith(still_open)):
            problems.append(f"{name}: the plate is shown through the film's still, and its label opens with labels.still_open")
    return problems


# The licence page of the map data the house and its grounds are built from, as the site's footer links it.
MAP_LINK = "https://www.openstreetmap.org/copyright"


def borrowed_line(spec, lang, wing_key):
    """A label's line taken word for word from where the site already says it (a picture's src_from): the wing page's
    own words at a key (wing:<key>, the museum's own texts filled in) or the footer's credit for the map data
    (site:map). Returns the line's parts as a data file writes them."""
    kind, _, key = spec.partition(":")
    if kind == "wing" and key:
        value = json.loads((LANG.HERE / "wings" / f"{wing_key}.{lang}.json").read_text(encoding="utf-8"))
        for part in key.split("."):
            if isinstance(value, list) and part.isdigit() and int(part) < len(value):
                value = value[int(part)]
            elif isinstance(value, dict) and part in value:
                value = value[part]
            else:
                raise SystemExit(f"src_from {spec!r}: the wing's {lang} page has no line at {key}")
        if not isinstance(value, str) or re.search(r"\{(?!museum:)\w+:\w+\}", value):
            raise SystemExit(f"src_from {spec!r}: the wing's {lang} page holds no plain line at {key}")
        parts = [value]
    elif spec == "site:map":
        foot = json.loads((LANG.HERE / f"words.{lang}.json").read_text(encoding="utf-8"))["footer"]
        parts = [foot["data_a"] + " ", {"text": foot["data_osm"], "href": MAP_LINK}, " " + foot["data_b"]]
    else:
        raise SystemExit(f"src_from {spec!r} is neither wing:<key> nor site:map")
    if lang == "de":
        parts = [ORDINAL_DE.sub("\\1." + LIB.NBSP, p) if isinstance(p, str) else p for p in parts]
    return parts


def line_problems(pic, pic_def):
    """A plate of pictures.json that the wing's page already labels (wing_line) carries that line, taken from the wing's
    page (src_from), and is shown at the widths it was cut at."""
    stem = pic_def["stem"]
    plate = plates().get(stem)
    if not plate or not plate.get("wing_line"):
        return []
    problems = []
    if pic.get("src_from") != f"wing:{plate['wing_line']}" or pic.get("src"):
        problems.append(f"{stem}: the plate carries the wing page's own line, src_from wing:{plate['wing_line']}")
    if pic_def["widths"] != plate.get("widths"):
        problems.append(f"{stem}: its widths are not its plate's {plate.get('widths')}")
    return problems


TALLY_KINDS = ("documented", "disputed", "qualified", "workshop", "copy", "field")


def tally_rows(d, works, ids=False):
    """Per period of a page's list of works: its heading and the class of each of its works (field: one that hangs
    elsewhere), and with ids its id first."""
    block = next(b for b in d["blocks"] if b["type"] == "periods")
    kind = {}
    for it in works.items:
        kind.setdefault(it["id"], it["class"] or "field")
    return [((period["id"],) if ids else ()) + (period["h"], [kind[x["work"]] for x in period["items"]]) for period in block["periods"]]


def check_tally(d, works, facts):
    """The first screen's count of the list: each key names the number of its class as the facts count it."""
    problems = []
    counts = {k: sum(kinds.count(k) for _, kinds in tally_rows(d, works)) for k in TALLY_KINDS}
    for kind in TALLY_KINDS:
        text = d["top"]["tally"]["key"].get(kind, "")
        want = (facts.get("counts") or {}).get(f"class_{kind}", counts[kind])
        if counts[kind] != want:
            problems.append(f"the list holds {counts[kind]} works of the class {kind}, the facts count {want}")
        if kind != "field" and counts[kind] and not re.match(rf"{counts[kind]}\b", text.replace(LIB.NBSP, " ")):
            problems.append(f"top.tally.key.{kind} {text!r} does not begin with its number, {counts[kind]}")
    return problems


def date_in(lang, date):
    """The wing's date (English) as a page in lang writes it, or None where no rule knows it."""
    if lang == "en":
        return date
    if lang != "de":
        return None
    if date in DATE_DE:
        return DATE_DE[date]
    m = re.fullmatch(r"About (\d{4})(?: to (\d{4}))?", date)
    return f"Etwa {m.group(1)}" + (f" bis {m.group(2)}" if m.group(2) else "") if m else None


def check_periods(d, lang, works, facts, field_title, pics):
    """A list of works by period: every work of the facts once, in a period of the facts, each with its title, date,
    holder and class as the facts give them, and each plate under the source line its record asks for."""
    problems = []
    plain = lambda t: t.replace(LIB.NBSP, " ")
    dates = {p["id"]: p["date"] for p in facts["paintings"]}
    periods = {x[lang] for x in facts.get("periods", [])}
    first = {}
    for it in works.items:
        first.setdefault(it["id"], it)
    seen = []
    for block in (b for b in d["blocks"] if b["type"] == "periods"):
        for period in block["periods"]:
            fields = [x for x in period["items"] if x["work"] == "field"]
            if plain(period["h"]) not in periods and not fields:
                problems.append(f"{period['id']}: {period['h']!r} is no period of the wing's facts")
            for x in period["items"]:
                where = f"{period['id']}.{x['id']}"
                seen.append(x["work"])
                it = first.get(x["work"])
                if it is None:
                    problems.append(f"{where}: {x['work']!r} is no work of the facts")
                    continue
                title = field_title if it.get("field") else it["title"][lang]
                if plain(x["title"]) != title:
                    problems.append(f"{where}: the title {x['title']!r} is not the facts' {title!r}")
                if not it.get("field"):
                    want = date_in(lang, dates[x["work"]])
                    if want is None or plain(x["when"]) != want:
                        problems.append(f"{where}: the date {x['when']!r} is not the facts' {want or dates[x['work']]!r}")
                holder = f'{it["holder"]["name"][lang]}, {it["holder"]["note"][lang]}'
                if not plain(x["where"]).startswith(holder):
                    problems.append(f"{where}: where does not begin with the facts' holder {holder!r}")
                word = d["labels"].get(f"class_{it['class'] or 'field'}")
                if not word or not plain(x["who"]).startswith(word):
                    problems.append(f"{where}: who does not begin with the class word of the facts' class {it['class'] or 'field'!r}")
                shown = [x[k] for k in ("pic", "pic_back") if x.get(k)]
                stems = [pics[n]["stem"] for n in shown if n in pics]
                if len(stems) != len(shown):
                    problems.append(f"{where}: a picture is not in the page's pics")
                if not shown:
                    continue
                if not x.get("src"):
                    problems.append(f"{where}: a reproduction stands without its source line (src)")
                    continue
                for stem in stems:
                    plate = plates().get(stem)
                    if plate and plate["work"] != x["work"] and not it.get("field"):
                        problems.append(f"{where}: the plate {stem} is of {plate['work']}")
                problems += [f"{where}: {p}" for p in plate_problems(x["src"], [s for s in stems if s in plates()], lang,
                                                                       d["labels"])]
    missing = sorted(set(first) - set(seen))
    twice = sorted({w for w in seen if seen.count(w) > 1})
    if missing:
        problems.append(f"the list lacks {', '.join(missing)}")
    if twice:
        problems.append(f"the list names {', '.join(twice)} twice")
    for name, pic in pics.items():
        plate = plates().get(pic["stem"])
        if plate and plate.get("widths") and pic["widths"] != plate["widths"]:
            problems.append(f"pics.{name}: its widths are not its plate's {plate['widths']}")
    return problems


# ---------- structured data ----------

def jsonld(lang, data, urls, pics, site, wing, alternate_name, frame, folders, topic=None, shared=None):
    self_url = urls[lang]
    pub = {"@id": f"{ORIGIN}/#publisher"}
    publisher = site or {
        "@type": "NGO", "@id": pub["@id"], "name": "ChipMates gemeinnützige GmbH",
        "legalName": "ChipMates gemeinnützige GmbH"}
    if frame.get("still"):
        found = next((f / frame["still"] for f in folders if (f / frame["still"]).is_file()), None)
        w, h = CHART.png_info(found)[0]
        image_url = f"{ORIGIN}/{STATIC}/img/{frame['still']}"
    else:
        d = pics.defs[frame["pic"]]
        w, h = pics.size(frame["pic"])
        image_url = f"{ORIGIN}/{STATIC}/img/{d['stem']}-{max(d['widths'])}.webp"
    home = f"{ORIGIN}/{L.folder(lang)}"
    graph = [
        publisher,
        {
            "@type": "WebSite", "@id": f"{ORIGIN}/#website", "url": f"{ORIGIN}/", "name": "Museum of Ages",
            "alternateName": alternate_name,
            "inLanguage": [L.html(x) for x in LISTED], "publisher": pub,
        },
        {
            "@type": "WebPage", "@id": f"{self_url}#page", "url": self_url, "name": data["meta"]["title"],
            "description": data["meta"]["description"], "inLanguage": L.html(lang),
            "isPartOf": {"@id": f"{ORIGIN}/#website"}, "publisher": pub,
            "breadcrumb": {"@id": f"{self_url}#crumbs"}, "primaryImageOfPage": {"@id": f"{self_url}#frame"},
        },
        {
            "@type": "Article", "@id": f"{self_url}#article", "headline": data["top"]["h1"],
            "description": data["meta"]["description"], "inLanguage": L.html(lang),
            "mainEntityOfPage": {"@id": f"{self_url}#page"}, "image": {"@id": f"{self_url}#frame"},
            "author": pub, "publisher": pub, "isAccessibleForFree": True,
            # a topic page about one thing of its wing names that thing (its entry's about), else the wing's
            "about": (topic or {}).get("about") or wing["about"],
        },
        {
            "@type": "BreadcrumbList", "@id": f"{self_url}#crumbs",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Museum of Ages", "item": home},
                {"@type": "ListItem", "position": 2, "name": wing["name"][lang],
                 "item": f"{ORIGIN}/{wing['page'][lang].strip('/')}/"},
                # the third crumb as the page shows it; the open wing's pages keep their heading here until their
                # own pass, so their files stay as they are
                {"@type": "ListItem", "position": 3,
                 "name": data["labels"]["crumb_here"] if making(wing) else data["top"]["h1"], "item": self_url},
            ],
        },
        {
            "@type": "ImageObject", "@id": f"{self_url}#frame", "url": image_url, "contentUrl": image_url,
            "width": w, "height": h, "caption": frame.get("caption") or f"{frame['title']}, {frame['what']}",
            "description": frame.get("description") or frame["alt"],
            "representativeOfPage": True,
        },
    ]
    if data["page"].get("hub"):
        # a wing in the making's list of its pages: a collection page with the list, its crumbs the museum and itself
        graph[2]["@type"] = "CollectionPage"
        items = [x for b in data["blocks"] if b["type"] == "pages" for x in b["items"]]
        graph[2]["mainEntity"] = {"@id": f"{self_url}#pages"}
        graph[3] = {
            "@type": "ItemList", "@id": f"{self_url}#pages", "name": data["top"]["h1"], "inLanguage": L.html(lang),
            "numberOfItems": len(items),
            "itemListElement": [{"@type": "ListItem", "position": n, "name": shared["topics"][x["page"]]["name"][lang],
                                 "url": f"{ORIGIN}/{page_path(shared['data'][x['page']][lang], wing, lang)}/"} for n, x in enumerate(items, 1)],
        }
        graph[4]["itemListElement"] = graph[4]["itemListElement"][:1] + [
            {"@type": "ListItem", "position": 2, "name": wing["name"][lang], "item": self_url}]
    if data["page"].get("published"):
        graph[3]["datePublished"] = data["page"]["published"]
    for block in data["blocks"]:
        if block["type"] == "periods":
            # the works the page lists, each by its entry on the page
            items = [x for period in block["periods"] for x in period["items"]]
            graph.append({
                "@type": "ItemList", "@id": f"{self_url}#{block['id']}", "name": block["h"], "inLanguage": L.html(lang),
                "numberOfItems": len(items), "itemListOrder": "https://schema.org/ItemListOrderAscending",
                "itemListElement": [{"@type": "ListItem", "position": n, "name": x["title"], "url": f"{self_url}#{x['id']}"}
                                    for n, x in enumerate(items, 1)],
            })
            graph[3]["mainEntity"] = {"@id": f"{self_url}#{block['id']}"}
        if block["type"] == "faq":
            graph.append({
                "@type": "FAQPage", "@id": f"{self_url}#faq", "inLanguage": L.html(lang),
                "mainEntity": [{"@type": "Question", "name": item["q"],
                                "acceptedAnswer": {"@type": "Answer", "text": item["a"]}} for item in block["items"]],
            })
    text = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
    return text.replace("</", "<\\/")


# ---------- one page ----------

def alternates(lang, urls):
    """One line per listed language and English for any other, as the site's own pages carry them. A page of a
    language that is not listed names none."""
    if lang not in LISTED:
        return ""
    lines = [(L.html(x), urls[x]) for x in LISTED if x in urls] + [("x-default", urls["en"])]
    return "".join(f'<link rel="alternate" hreflang="{tag}" href="{url}">\n' for tag, url in lines)


def page_path(data, wing, lang):
    """A search page stands one step below its wing's page. A wing in the making's list of its pages (page.hub) is
    that page itself."""
    if data["page"].get("hub"):
        return wing["page"][lang].strip("/")
    return f"{wing['page'][lang].strip('/')}/{data['page']['slug'].strip('/')}"


def render(page, lang, data, shared, out_root):
    parts, labels, wing = shared["parts"], data["labels"], shared["wing"][page]
    path = page_path(data, wing, lang)
    depth = path.count("/") + 1
    root = "../" * depth
    own = shared["langs"][page]
    urls = {code: f"{ORIGIN}/{page_path(shared['data'][page][code], wing, code)}/" for code in own}
    pics = Pictures(data["pics"], shared["pic_folders"], root)
    # a language the page is not written in leads to the wing's own page in that language; a wing in the making has
    # no page there, so the page offers its own languages only
    twins = {L.html(code): root + (page_path(shared["data"][page][code], wing, code) if code in own else wing["page"][code].strip("/")) + "/"
             for code in LANGS if code in own or not making(wing)}
    door = None if making(wing) else wing["door"][lang]
    chrome = site_chrome(shared["chrome_pages"], lang, root, twins, door)
    hub = data["page"].get("hub")
    names = Names(shared["names"] + shared["own_names"][lang], wing["name"][lang], lang, join=data["page"].get("join_names", False),
                  breaks=data["page"].get("breaks", ()))
    rich = names.mark
    # running text that hyphenates (a paragraph, a list's point, a note's text, an answer to a question)
    prose = lambda text: names.mark(text, split=True)
    # the list of pages is new on every page that carries one, so its names are held by no-break spaces
    joined = Names(shared["names"] + shared["own_names"][lang], wing["name"][lang], lang, join=True).mark

    def site_page(name, code=lang):
        options = SITE_PAGES[name][code]
        for option in options:
            target = shared["site_built"] / option
            if (target / "index.html").exists() if option.endswith("/") else target.exists():
                return root + option
        return root + options[-1]

    href = {
        "href.home": site_page("home"),
        "href.wing": "../",
        "href.what": site_page("what"),
        "href.privacy": site_page("privacy"),
        "href.imprint": site_page("imprint"),
        "attr.imprint_lang": "" if L.has_imprint(lang) else ' hreflang="en"',
        # a page about one stop (page.stop) opens the wing there at its end as well
        "href.enter": esc(CHART.door_href(door, data["page"].get("stop"))) if door else "",
        "svg.arrow": chrome["arrow"],
        # where a door would stand on a page of a wing in the making: the newest open wing's own page
        "href.out": root + shared["out"][lang] if making(wing) else "",
    }
    works = shared["works"].get(page)
    # the first screen's door may open the wing at a stop: the page's own, or the stop of the work the page is about
    top_stop = data["page"].get("stop") or (works.by_id(data["top"]["figure"]["work"])["stop"] if works and "figure" in data["top"] else None)
    href["href.top"] = esc(CHART.door_href(door, top_stop)) if door else ""
    base = dict(href)
    base.update({f"labels.{k}": rich(v) for k, v in labels.items()})
    base["page.id"] = esc(data["page"]["id"])
    base["wing.name"] = rich(wing["name"][lang])

    def words(entry):
        """Every sentence of a block or an entry as HTML. An id is an attribute and stays plain."""
        return {k: esc(v) if k in ("id", "type") else rich(v) for k, v in entry.items() if isinstance(v, str)}

    def page_href(name):
        """Another page of this build in the page's language, from here."""
        if lang not in shared["data"].get(name, {}):
            raise SystemExit(f"{page}.{lang}: a link names the page {name!r}, which this build does not make in {lang}")
        return f'{root}{page_path(shared["data"][name][lang], wing, lang)}/'

    def part_href(part):
        """A link's address: outside (href), another page (page), an entry of this page (at), a part of the wing's page (wing)."""
        if "href" in part:
            return part["href"]
        if "at" in part:
            return f'#{part["at"]}'
        if "wing" in part:
            return f'{href["href.wing"]}#{part["wing"]}'
        return page_href(part["page"])

    def linked(para, words=None):
        """A paragraph: its words, or its parts, where a part is a link to an address (href) or to another page (page).
        A link, an opening bracket before it and the stop after it stay on one line. words marks the text (rich)."""
        words = words or rich
        if isinstance(para, str):
            return words(para)
        out = "".join(words(part) if isinstance(part, str) else
                      f'<a href="{esc(part_href(part))}">{words(part["text"])}</a>'
                      for part in para)
        out = re.sub(r'\((<a href="[^"]*">(?:(?!</a>).)*</a>[.,:)]*)', r'<span class="nw">(\1</span>', out)
        return re.sub(r'(?<!\()(<a href="[^"]*">(?:(?!</a>).)*</a>)([.,:)]+)', r'<span class="nw">\1\2</span>', out)

    def ways(links):
        """A block's ways on, each a line of its own: into the wing at a stop (stop), or to another page (page)."""
        out = []
        for link in links:
            if "stop" in link:
                href, attr = CHART.door_href(door, link["stop"]), ' data-door="item"'
            elif link.get("out"):
                # a wing in the making: the plain link to the newest open wing's page, counted as a way out
                href, attr = href_out(), ' data-out="wing"'
            else:
                href, attr = part_href(link), ""
            out.append(f'\n<p class="sp-more"><a class="more" href="{esc(href)}"{attr}><span>{rich(link["text"])}</span>{chrome["arrow"]}</a></p>')
        return "".join(out)

    def href_out():
        if not making(wing):
            raise SystemExit(f"{page}.{lang}: a link out (out) stands on a page of an open wing, which has its door")
        return href["href.out"]

    def person_html(name):
        """The person's height over the person in a picture at one scale (its place is the picture's: pics.<name>.person)."""
        if not data["pics"][name].get("person"):
            return ""
        return fill(parts["person"], {"key": esc(name), "text": rich(labels["person"])})

    table = next((b["id"] for b in data["blocks"] if b["type"] == "numbers"), None)

    def to_table():
        """The way from a picture's caption to the table that holds its numbers in words."""
        if not table or not labels.get("to_table"):
            return ""
        return fill(parts["to_table"], {"id": esc(table), "text": rich(labels["to_table"])})

    def scale_fig(fig, first=False):
        """A picture at one scale, whole and never cut, with the person's height and its label; a closer panel of
        it follows at its own scale."""
        out = fill(parts["scale_fig"], {"html.picture": pics.picture(fig["pic"], esc(fig["alt"]), first=first),
                                        "html.above": marks_html(fig, True), "html.below": marks_html(fig, False),
                                        "html.person": person_html(fig["pic"]), "tag": rich(labels[fig["tag"]]),
                                        "what": rich(fig["what"]), "html.totable": to_table(),
                                        "html.key": key_html(fig)})
        return out + (scale_fig(fig["close"]) if fig.get("close") else "")

    def key_html(fig):
        """A picture's key: one line, or a list whose lines each lead with the swatch of the colour they name."""
        key = fig.get("key")
        if not key:
            return ""
        if isinstance(key, str):
            return fill(parts["scale_key"], {"text": rich(key)})
        return fill(parts["scale_keys"], {"html.items": "".join(
            fill(parts["scale_key_item"], {"key": esc(f'{fig["pic"]}-{k["swatch"]}'), "text": prose(k["text"])}) if isinstance(k, dict)
            else fill(parts["scale_key_line"], {"text": rich(k)}) for k in key)})

    def bars_html(fig):
        """The length bar under a picture at one scale: each span where the picture's own places put it."""
        if not fig.get("bars"):
            return ""
        return fill(parts["scale_bars"], {"html.spans": "".join(
            fill(parts["scale_bar"], {"key": esc(f'{fig["pic"]}-{b["span"]}'), "kind": esc(b["span"]), "text": rich(b["text"])})
            for b in fig["bars"])})

    def marks_html(fig, over):
        """The labels at a picture of several subjects, those over the picture (over) or those under it: each the
        animal's name and length at a bracket over its place in the picture."""
        if not fig.get("marks"):
            return ""
        behind = set(data["pics"][fig["pic"]].get("behind") or [])
        items = "".join(fill(parts["scale_mark"], {"key": esc(f'{fig["pic"]}-{m["span"]}'), "html.name": rich(mark_split(m["text"])[0]),
                                                   "html.value": rich(mark_split(m["text"])[1])})
                        for m in fig["marks"] if (m["span"] in behind) == over)
        return fill(parts["scale_marks"], {"side": "over" if over else "under", "html.items": items}) if items else ""

    def rows_html(rows):
        return "\n".join(fill(parts["row"], {"label": rich(labels[r["k"]]), "v": rich(r["v"])}) for r in rows)

    def term_rows(rows):
        return "\n".join(fill(parts["term_row"], {"term": rich(r["term"]), "text": prose(r["text"])}) for r in rows)

    def figure(pic):
        """A plate with its label. A plate that says nothing of its own carries the page's usual line, and one that
        shows a reproduction carries its source line (src)."""
        if not pic:
            return ""
        found = line_problems(pic, data["pics"][pic["pic"]])
        if found:
            raise SystemExit("\n".join(f"{page}.{lang}: {x}" for x in found))
        values = dict(base)
        src = label_src(pic)
        values.update({"html.picture": pics.picture(pic["pic"], esc(pic["alt"])),
                       "tag": rich(labels[pic["tag"]]), "what": rich(pic.get("what") or labels["plate_what"]),
                       "html.title": f'<span class="label__title">{rich(pic["title"])}</span>' if pic.get("title") else "",
                       "html.src": f'<span class="label__src">{src}</span>' if src else "",
                       # a painting shown whole, never cut to the plate's frame
                       "attr.plate": " sp-plate--whole" if pic.get("shape") == "whole" else ""})
        return fill(parts["figure"], values)

    def label_src(pic):
        """A picture's source line: its own (src), or one the site already says (src_from)."""
        if pic.get("src"):
            return source_line(pic["src"], data["page"]["wing"], lang, rich)
        if pic.get("src_from"):
            return source_line(borrowed_line(pic["src_from"], lang, wing.get("_data", data["page"]["wing"])), data["page"]["wing"], lang, rich)
        return ""

    def place(text):
        values = dict(base)
        values["place"] = rich(text)
        return fill(parts["place"], values)

    def stands(rows):
        out = []
        for row in rows:
            values = dict(base)
            values.update({"term": rich(row["term"]), "text": rich(row["text"]), "html.pic": figure(row.get("pic"))})
            out.append(fill(parts["stand"], values))
        return "\n".join(out)

    def editions(entries):
        out = []
        for entry in entries:
            links = "\n".join(fill(parts["link"], {"href": esc(link["href"]), "label": rich(link["label"])})
                              for link in entry["links"])
            out.append(fill(parts["edition"], {"name": rich(entry["name"]), "text": rich(entry["text"]),
                                               "html.links": links}))
        return "\n".join(out)

    def plate_html(item):
        """A work's plate, or its two faces, with the label every reproduction carries: the tag and its source line."""
        shown = [(item[k], item[a]) for k, a in (("pic", "alt"), ("pic_back", "alt_back")) if item.get(k)]
        if not shown:
            return ""
        values = dict(base)
        values.update({"html.picture": "".join(pics.picture(name, esc(alt)) for name, alt in shown),
                       "tag": rich(labels["tag_still"]), "html.src": source_line(item["src"], data["page"]["wing"], lang, rich)})
        return fill(parts["plate"], values)

    def period_html(block, period):
        items = []
        for item in period["items"]:
            it = next(x for x in works.items if x["id"] == item["work"])
            word = labels[f"class_{it['class'] or 'field'}"]
            who = item["who"]
            values = dict(base)
            values.update(words(item))
            go = block["go"].replace("{work}", item["door"])
            values.update({
                "shape": esc(item["shape"]),
                "html.figure": plate_html(item),
                # the class word, as the facts give it, stands apart at the head of its sentence
                "html.who": f'<span class="pt-class">{rich(word)}</span>{rich(who[len(word):])}',
                # a tightened entry says it all in two paragraphs
                "html.worth": f'\n    <p>{rich(item["worth_knowing"])}</p>' if item.get("worth_knowing") else "",
                "href.go": esc(CHART.door_href(door, it["stop"])),
                # the door's line names the work, and a line begins with a capital in every language
                "go": rich(go[:1].upper() + go[1:]),
                "html.more": ways(item.get("links", [])),
            })
            items.append(fill(parts["work"], values))
        values = dict(base)
        values.update(words(period))
        values["html.p"] = f'<p class="pt-period__p">{rich(period["p"])}</p>' if period.get("p") else ""
        values["html.items"] = "\n".join(items)
        return fill(parts["period"], values)

    def block_html(block):
        kind = block["type"]
        values = dict(base)
        values.update(words(block))
        if kind == "places":
            values["html.rows"] = stands(block["rows"])
        elif kind == "notes":
            values["html.rows"] = term_rows(block["rows"])
        elif kind == "group":
            items = []
            for item in block["items"]:
                iv = dict(base)
                iv.update(words(item))
                iv.update({"html.place": place(item["place"]), "html.rows": rows_html(item["rows"]),
                           "html.pic": figure(item.get("pic"))})
                items.append(fill(parts["item"], iv))
            values["html.items"] = "\n".join(items)
        elif kind == "feature":
            values.update({
                "html.place": place(block["place"]),
                "html.paras": "\n".join(fill(parts["para"], {"text": rich(p)}) for p in block["paras"]),
                "html.rows": rows_html(block["rows"]),
                "html.pic": figure(block.get("pic")),
            })
        elif kind == "faq":
            # an answer may close with a way on to another page (links), as a block's own ways
            values["html.items"] = "\n".join(
                fill(parts["faq_item"], {"q": rich(i["q"]), "a": prose(i["a"]), "html.links": ways(i.get("links", []))})
                for i in block["items"])
        elif kind == "sources":
            values["html.holders"] = "\n".join(
                fill(parts["holder"], {"name": rich(h["name"]), "place": rich(h["place"]), "text": rich(h["text"])})
                for h in block.get("holders", []))
            values["html.notes"] = "\n".join(fill(parts["note"], {"text": rich(n)}) for n in block.get("notes", []))
            values["html.editions"] = editions(block.get("editions", []))
        elif kind == "close":
            values.update({"door.text": rich(block["door"]["text"]), "door.note": rich(block["door"]["note"])})
        elif kind == "text":
            def points(p):
                """A short list: a point leads with its own words ([lead, text]) or is its words alone."""
                return fill(parts["text_points"], {"html.items": "\n".join(
                    fill(parts["text_point"], {"lead": rich(x[0]), "text": linked(x[1], prose)}) if isinstance(x, list)
                    else fill(parts["text_point_plain"], {"text": linked(x, prose)}) for x in p["points"])})
            paras = [points(p) if isinstance(p, dict) else fill(parts["text_para"], {"text": linked(p, prose)})
                     for p in block.get("paras", [])]
            # answers or lists under their own small headings, then the section's closing lines (end)
            paras += [fill(parts["text_sub"], {"h": rich(sub["h"]), "html.paras": "\n".join(
                points(p) if isinstance(p, dict) else fill(parts["sub_para"], {"text": linked(p, prose)}) for p in sub["paras"])})
                for sub in block.get("subs", [])]
            paras += [fill(parts["text_para"], {"text": linked(p, prose)}) for p in block.get("end", [])]
            sc = block.get("scale")
            if sc and "after" in sc:
                # the picture after the paragraph it shows, not after the whole section
                paras.insert(sc["after"], scale_fig(sc).rstrip("\n"))
            values["html.paras"] = "\n".join(paras)
            values["html.pic"] = figure(block.get("pic")) + (scale_fig(sc) if sc and "after" not in sc else "")
            values["html.links"] = ways(block.get("links", []))
        elif kind == "numbers":
            # the pictures' numbers as a table: a row's first cell names it, an empty cell has no sourced figure
            values["html.head"] = "".join(f'<th scope="col">{rich(c)}</th>' for c in block["cols"])
            # on a phone a row is a card without the column heads: an empty cell says in words that it is empty
            none = f' data-none="{esc(labels["no_figure"])}"' if any(not c for r in block["rows"] for c in r["cells"]) else ""
            values["html.rows"] = "\n".join(
                f'      <tr><th scope="row">{rich(row["cells"][0])}</th>'
                # a cell's words in one span: on a phone the cell is a grid of its label and its words, and a name's
                # own span would otherwise take a grid place of its own
                + "".join(f'<td data-k="{esc(block["cols"][i])}"{"" if c else none}>{f"<span>{rich(c)}</span>" if c else ""}</td>'
                          for i, c in enumerate(row["cells"][1:], 1)) + "</tr>"
                for row in block["rows"])
        elif kind == "pages":
            # a wing in the making's list of its pages: each by its topic's name and line in the registry
            items = []
            for item in block["items"]:
                topic = shared["topics"].get(item["page"])
                if not topic or lang not in shared["data"][item["page"]]:
                    raise SystemExit(f"{page}.{lang}: the list names {item['page']!r}, which is no topic page of this wing in {lang}")
                # the registry's line binds a number to its unit as the page's own words do
                # a page may name a neighbour with a line of its own (line), else the list's line
                line = re.sub(rf"(\d) (?={MORE_UNITS}\b)", "\\1" + LIB.NBSP, item.get("line") or topic["line"][lang])
                items.append(fill(parts["page_item"], {"href": page_href(item["page"]), "name": joined(topic["name"][lang]),
                                                       "line": joined(LIB.bind(line, lang)),
                                                       "html.pic": pics.picture(item["pic"], esc(item["alt"])) if item.get("pic") else ""}))
            values["html.items"] = "\n".join(items)
            # on a topic page the list names its neighbours after the page's own sections; the wing's list is the page
            values["attr.pages"] = "" if hub else " sc-pages--next"
        elif kind == "chart":
            values.update({
                "zoom": rich(block["zoom"].replace("{n}", LIB.number(CHART.ZOOM, lang))),
                # the panel's text alternative is an attribute: plain text, no name's span
                "alt": esc(block["alt"]),
                "html.defs": CHART.person_defs(),
                "html.all": CHART.panel_rows(works, mark, chart_words, LIB.number, lang, rich=rich),
                "html.key": CHART.key_list(works, chart_words["titles"], mark, rich, rich(block["key_h"])),
                "html.zoom": CHART.panel(works, mark, chart_words, LIB.number, lang, rich=rich),
                "href.still": f"{root}{STATIC}/img/{shared['stills'][page][lang]['chart']}",
                "href.licence": esc(chrome["licence"]),
            })
        elif kind == "works":
            values["html.items"] = CHART.works_list(works, block["lines"], door, block["go"], chrome["arrow"], rich, LIB.number, lang)
        elif kind == "periods":
            values["html.periods"] = "\n".join(period_html(block, period) for period in block["periods"])
            values["html.links"] = ways(block.get("links", []))
        elif kind == "table":
            values.update({f"cols.{k}": rich(v) for k, v in block["cols"].items()})
            values["html.rows"] = CHART.table_rows(works, lines, door, block["go"], rich, LIB.number, lang)
        if kind == "sources":
            values["html.holders_part"] = fill(parts["sources_holders"], values) if block.get("holders") else ""
            values["html.editions_part"] = fill(parts["sources_editions"], values) if block.get("editions") else ""
            # what the page was written from, each a link of its own, or a plain line where no one address carries it
            values["html.read_part"] = ("\n" + fill(parts["sources_read"], {"html.read": "\n".join(
                fill(parts["read"], {"href": esc(r["href"]), "text": prose(r["text"])}) if r.get("href") else
                fill(parts["read_plain"], {"text": prose(r["text"])}) for r in block["read"])})) if block.get("read") else ""
        return fill(parts[f"block:{kind}"], values)

    # the works' lines name each work: its title is what stands before its size
    lines = next((b["lines"] for b in data["blocks"] if b["type"] == "works"), None)
    mark = data["top"].get("figure", {}).get("work")
    chart_words = {}
    if works and lines:
        titles = {it["n"]: CHART.split_line(line, it, LIB.number, lang)[0].rstrip(".") for it, line in zip(works.items, lines)}
        field = next((it for it in works.items if it.get("field")), None)
        chart_words = {"person": labels["person"], "mark": titles[works.by_id(mark)["n"]] if mark else "",
                       "field": titles[field["n"]] if field else "", "alt": data["top"].get("figure", {}).get("alt", ""),
                       "titles": titles}
    blocks = "\n\n".join(block_html(b) for b in data["blocks"])
    def toc_words(nav):
        # a link of the list is a flex box, where a name's span would stand as an item of its own: one span holds them all
        words = rich(nav)
        return f"<span>{words}</span>" if "<" in words else words

    toc = "\n".join(fill(parts["toc_item"], {"id": esc(b["id"]), "nav": toc_words(b["nav"])})
                    for b in data["blocks"] if b.get("nav"))

    # The wing's name stays on one line in the h1. Where it is long the h1 is set smaller on a
    # phone, and a name too long for any line may wrap between its words.
    after_html = ""
    h1, run = data["top"]["h1"], names.wing_run(data["top"]["h1"])
    h1_class = "" if run <= KEEP_WHOLE else ' class="sp-h1--long"' if run <= KEEP_SMALL else ' class="sp-h1--wrap"'

    og = dict(data["page"]["og_image"], file=data["page"]["og_image"]["file"].replace("{lang}", L.html(lang).lower()))
    if "figure" in data["top"]:
        fig = data["top"]["figure"]
        it = works.by_id(fig["work"])
        chart = next(b for b in data["blocks"] if b["type"] == "chart")
        # the page's picture in the structured data is the whole chart (the still), so its words are the chart's
        frame = {"title": chart_words["mark"], "what": f'{CHART.size_text(it, LIB.number, lang, space=LIB.NBSP)}, {fig["what"]}', "alt": fig["alt"],
                 "tag": fig["tag"], "still": shared["stills"][page][lang]["chart"],
                 "caption": chart["still_caption"], "description": chart["still_caption"]}
        frame_html = fill(parts["frame:chart"], {"html.figure": CHART.top_figure(works, mark, chart_words, LIB.number, lang),
                                                 "title": rich(frame["title"]), "tag": rich(labels[frame["tag"]]),
                                                 "what": rich(frame["what"]), "html.note": ""})
        preload, focus = "", ""
    elif "drawing" in data["top"]:
        dr, facts = data["top"]["drawing"], shared["facts"][page]
        size = facts["wall"][dr["wall"]]
        h_cm, w_cm, person_cm = CHART.cm_of(size["h_m"]), CHART.cm_of(size["w_m"]), CHART.cm_of(facts["set"]["person_m"])
        what = f'{CHART.size_text({"h": h_cm / 100, "w": w_cm / 100}, LIB.number, lang, unit="m", space=LIB.NBSP)}, {dr["what"]}'
        # the page's picture in the structured data is the drawing as its share picture
        plain = lambda s: s.replace(LIB.NBSP, " ")
        frame = {"title": dr["title"], "what": what, "alt": dr["alt"], "tag": dr["tag"], "still": og["file"],
                 "caption": plain(f'{dr["title"]}, {what}'), "description": plain(dr["alt"])}
        frame_html = fill(parts["frame:chart"], {"html.figure": CHART.wall_figure(h_cm, w_cm, person_cm, {"person": labels["person"], "alt": dr["alt"],
                                                                                    "arch": dr.get("arch_label")},
                                                                                   LIB.number, lang, dr.get("inside")),
                                                 "title": rich(dr["title"]), "tag": rich(labels[dr["tag"]]), "what": rich(what),
                                                 # what the drawing reconstructs stands under it at every width
                                                 "html.note": f'<span class="sp-frame__note">{rich(dr["note"])}</span>' if dr.get("note") else ""})
        preload, focus = "", ""
    elif "tally" in data["top"]:
        ta = data["top"]["tally"]
        mark = lambda kind: f'<span class="pt-m pt-m--{kind}"></span>'
        rows = "\n".join(fill(parts["tally_row"], {"id": esc(key), "period": rich(h), "n": str(len(kinds)),
                                                     "html.marks": "".join(mark(k) for k in kinds)})
                         for key, h, kinds in tally_rows(data, works, ids=True))
        key = "\n".join(fill(parts["tally_key"], {"kind": kind, "text": rich(ta["key"][kind])}) for kind in TALLY_KINDS if ta["key"].get(kind))
        # the page's picture in the structured data is the count as its share picture
        frame = {"title": ta["title"], "what": "", "alt": data["meta"]["og_image_alt"], "tag": ta["tag"], "still": og["file"],
                 "caption": data["meta"]["og_title"], "description": data["meta"]["og_image_alt"]}
        # after the door: on a phone the answer and the way in come first
        after_html = "\n" + fill(parts["frame:tally"], {"html.rows": rows, "html.key": key, "title": rich(ta["title"]),
                                                       "tag": rich(labels[ta["tag"]])})
        frame_html, preload, focus = "", "", ""
    elif "scale" in data["top"]:
        # our own animal at one scale beside the person, whole, then a closer panel and the guess beside it
        sc = data["top"]["scale"]
        plain = lambda t: t.replace(LIB.NBSP, " ")
        frame = {"pic": sc["pic"], "alt": sc["alt"], "caption": plain(sc["what"]), "description": plain(sc["alt"])}
        guess = data["top"].get("guess")
        frame_html = fill(parts["frame:scale"], {
            "html.picture": pics.picture(sc["pic"], esc(sc["alt"]), first=True), "html.person": person_html(sc["pic"]),
            "tag": rich(labels[sc["tag"]]), "what": rich(sc["what"]), "note": linked(sc["note"]),
            "html.above": marks_html(sc, True), "html.bars": bars_html(sc) + marks_html(sc, False), "html.totable": to_table(),
            "html.close": scale_fig(sc["close"]) if sc.get("close") else "",
            "html.guess": fill(parts["guess"], {**{k: rich(guess[k]) for k in ("h", "q", "button", "a")},
                                                "button_open": rich(guess.get("button_open") or guess["button"])}) if guess else ""})
        preload, focus = pics.preload(sc["pic"]), ""
    elif hub:
        # a wing in the making's list of its pages: its picture in the structured data is its share picture
        frame = {"alt": data["meta"]["og_image_alt"], "still": og["file"], "caption": data["meta"]["og_title"],
                 "description": data["meta"]["og_image_alt"]}
        frame_html, preload, focus = "", "", ""
    else:
        frame = data["top"]["frame"]
        src = label_src(frame)
        frame_html = fill(parts["frame:picture"], {"html.picture": pics.picture(frame["pic"], esc(frame["alt"]), first=True),
                                                   "title": rich(frame["title"]), "tag": rich(labels[frame["tag"]]),
                                                   "what": rich(frame["what"]),
                                                   "html.src": f'<span class="label__src sp-frame__src">{src}</span>' if src else ""})
        preload, focus = pics.preload(frame["pic"]), focus_rule(frame)
    values = dict(base)
    values.update({
        "lang": L.html(lang),
        "og_locale": L.entries[lang]["og"],
        "html.og_alternates": "".join(f'<meta property="og:locale:alternate" content="{L.entries[x]["og"]}">\n'
                                      for x in LISTED if x != lang and x in own) if len(LISTED) > 2 else "",
        "html.robots": "" if lang in LISTED else '<meta name="robots" content="noindex">\n',
        # a page of a wing in the making leaves a click number in its address, so its links send only the site's origin
        "html.referrer": '<meta name="referrer" content="strict-origin-when-cross-origin">\n' if making(wing) else "",
        "html.alternates": alternates(lang, urls),
        "meta.title": esc(data["meta"]["title"]),
        "meta.description": esc(data["meta"]["description"]),
        "meta.og_title": esc(data["meta"]["og_title"]),
        "meta.og_image_alt": esc(data["meta"]["og_image_alt"]),
        "url.self": urls[lang],
        "url.og_image": f"{ORIGIN}/{STATIC}/img/{og['file']}",
        "og.width": str(og["width"]), "og.height": str(og["height"]),
        "css.inline": shared["css_scale" if making(wing) else "css_list" if any(b["type"] == "periods" for b in data["blocks"]) else
                             "css_chart" if works or "drawing" in data["top"] or any(b["type"] == "text" for b in data["blocks"]) else "css"]
                      + (shared["langs_css"] + chrome["by"] if chrome["langs"] else ""),
        "css.faces": faces(root, lang) + focus + person_rules(data["pics"]) + span_rules(data["pics"]) + swatch_rules(data["pics"])
                     + (shared["css_several"] + mark_rules(data) if marked_figures(data) or has_points(data) else ""),
        "html.preload": preload,
        "html.theme": f'<meta name="theme-color" content="{chrome["theme"]}">\n' if chrome["theme"] else "",
        "html.header": chrome["header"],
        "html.footer": chrome["footer"],
        "attr.h1": h1_class,
        "attr.top": (" sp-top--long" if answer_length(data["top"]) > LONG_ANSWER else "") + (" sc-top" if making(wing) else ""),
        "top.h1": names.mark(h1, wrap_wing=run > KEEP_SMALL),
        "top.answer": linked(data["top"]["answer"]),
        # an answer in two paragraphs: the second, with its links, under the first
        "html.answer_more": f'<p class="sp-answer">{linked(data["top"]["answer_more"])}</p>' if data["top"].get("answer_more") else "",
        # the one place a sizes page says in which order its sizes stand
        "html.order": f'<p class="sz-order">{rich(data["top"]["order"])}</p>' if data["top"].get("order") else "",
        "html.frame": frame_html,
        "html.after": after_html,
        # the crumbs: the museum, the wing's page, this page; a wing's own list of pages is the wing's page
        "html.crumb_wing": "" if hub else fill(parts["crumb_wing"], base),
        "html.toc_part": fill(parts["toc"], dict(base, **{"html.toc": toc})) if toc else "",
        "attr.grid": "" if toc else " sp-grid--solo",
        # the question for the ads' visitors is never asked on a page of a wing in the making (_src/js/ask.js)
        "attr.main": " data-unasked" if making(wing) else "",
        "html.blocks": blocks,
        "jsonld": jsonld(lang, data, urls, pics, chrome["publisher"], wing, chrome["alternate_name"],
                         frame, shared["pic_folders"], shared["topics"].get(page), shared),
    })
    if making(wing):
        out = data["top"]["out"]
        values["html.way"] = fill(parts["way:out"], dict(values, text=rich(out["text"]), link=rich(out["link"])))
    else:
        values.update({"top.door.text": rich(data["top"]["door"]["text"]), "top.door.note": rich(data["top"]["door"]["note"]),
                       "top.door.leads": rich(data["top"]["door"]["leads"])})
        values["html.way"] = fill(parts["way:door"], values)
    text = with_policy(fill(parts["page"], values))
    if chrome["use_pictures"]:
        text = LIB.with_picture_rights(text, urls[lang], LIB.picture_terms(lang, chrome["use_pictures"]),
                                       LIB.picture_terms(lang, chrome["use_pictures"], map_data=True), data["meta"].get("credit"))
    files = {f"img/{f}": pics.find(f) for name in sorted(pics.used) for f in pics.files(name)}
    files[f"img/{og['file']}"] = pics.find(og["file"])
    if frame.get("still"):
        files[f"img/{frame['still']}"] = pics.find(frame["still"])
    return out_root / path / "index.html", text, files


def answer_text(answer):
    """The first screen's answer as plain words: a string, or parts where a part is a link."""
    return answer if isinstance(answer, str) else "".join(p if isinstance(p, str) else p["text"] for p in answer)


def answer_length(top):
    """The first screen's answer in characters, both its paragraphs where it has two (answer_more)."""
    return len(answer_text(top["answer"])) + len(answer_text(top.get("answer_more", "")))


# ---------- checks on a built page ----------

def shown_text(text):
    shown = re.sub(r"<(script|style|noscript)\b.*?</\1>", " ", text, flags=re.S)
    shown = re.sub(r"<!--.*?-->", " ", shown, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", shown))


def check_built(path, text, out_root, names=None):
    problems = []
    name = path.relative_to(out_root)
    if names:
        # a name of the wing or of the names list that stands outside a span could break or be hyphenated
        own = text[text.index("<main"):text.index("</main>")]
        loose = shown_text(re.sub(r'<(span|i) class="(?:nw|nh|nw nh)"[^>]*>[^<]*</\1>', " ", own))
        for found in sorted({m.group(1) for m in names.find.finditer(loose)}):
            problems.append(f"{name}: the name {found!r} stands in the page without its span")
        for span in re.findall(r'<span class="nh">([^<]*)</span>', own):
            if span == names.wing_name and 'class="sp-h1--wrap"' not in own:
                problems.append(f"{name}: the wing's name may wrap, and the page does not ask for it")
    if "{{" in text:
        problems.append(f"{name}: an unfilled placeholder is left")
    if len(re.findall(r"<h1[\s>]", text)) != 1:
        problems.append(f"{name}: the page does not have exactly one h1")
    levels = [int(n) for n in re.findall(r"<h([1-6])[\s>]", text)]
    if any(b > a + 1 for a, b in zip(levels, levels[1:])):
        problems.append(f"{name}: a heading level is skipped ({levels})")
    if re.search(r"<[^>]+\sstyle=", text):
        problems.append(f"{name}: a style attribute is set (the content security policy forbids it)")
    if text.count('http-equiv="Content-Security-Policy"') != 1 or CSP_MARK in text:
        problems.append(f"{name}: the page does not carry its content security policy")
    if re.search(r"<[^>]+\son[a-z]+=", text):
        problems.append(f"{name}: an inline event handler is set")
    for attrs in re.findall(r"<script\b([^>]*)>", text):
        if 'type="application/ld+json"' not in attrs:
            problems.append(f"{name}: a script stands in the page: it must read without one")
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S):
        graph = json.loads(block.replace("<\\/", "</"))["@graph"]
        for node in graph:
            if "Museum" in str(node.get("@type")):
                problems.append(f"{name}: the structured data uses a Museum type")
    if re.search(r"""["'(/]assets/""", text):
        problems.append(f"{name}: a file is asked from assets/, the museum app's folder")
    plain = shown_text(text)
    for bad in ("—", "–", ";"):
        if bad in plain:
            problems.append(f"{name}: the displayed text contains {bad!r}")
    # the site's footer is taken as it stands, so this looks at the page's own part and its data block only
    own = text[text.index("<main"):text.index("</main>")] + "".join(
        re.findall(r'<script type="application/ld\+json">.*?</script>', text, flags=re.S))
    if re.search(r"open.source|github|quellcode|source code|repositor", own, flags=re.I):
        problems.append(f"{name}: the page's own part speaks of the museum's code or links to it")
    for img in re.findall(r"<img\b[^>]*>", text):
        if not re.search(r'\balt="[^"]', img) or " width=" not in img or " height=" not in img:
            problems.append(f"{name}: an img lacks alt, width or height")
    refs = set(re.findall(r'(?:src|href)="([^"#?:]*%s/[^"#?]+)"' % STATIC, text))
    refs |= set(re.findall(r"((?:\.\./)*%s/[\w./-]+)\s+\d+w" % STATIC, text))
    refs |= set(re.findall(r'url\("([^"]+)"\)', text))
    for ref in refs:
        if not (path.parent / ref).resolve().exists():
            problems.append(f"{name}: {ref} is missing")
    for anchor in re.findall(r'href="#([\w-]+)"', text):
        if f' id="{anchor}"' not in text:
            problems.append(f"{name}: the link #{anchor} has no target on the page")
    for door in re.findall(r'<a class="door[^>]*>', text):
        if "data-slot=" in door and "data-page=" not in door:
            problems.append(f"{name}: a door carries a slot without the page label")
    if re.search(r'<main\b[^>]*\sdata-unasked[\s>]', text):
        # a wing in the making: no door and no way into any walk, a plain link to an open wing's page where the door
        # would stand, and the same at the page's end where the page has an end
        if re.search(r'class="door\b', text) or re.search(r'href="/w/', text):
            problems.append(f"{name}: a page of a wing in the making carries a door or a way into the walk")
        outs = re.findall(r'<a class="more" href="([^"]*)" data-out="wing">', text)
        if not outs or len(set(outs)) != 1:
            problems.append(f"{name}: a page of a wing in the making lacks its plain link to an open wing (data-out)")
    elif len(re.findall(r'data-slot="door-', text)) < 1:
        problems.append(f"{name}: no door carries its hook")
    problems += [f"{name}: {x}" for x in check_tier(text)]
    return problems


_TIER = {}


def check_tier(text):
    """As on the site's own pages: a frame of the second rights tier never stands in the page's first part, and below
    it only in a plate whose label carries a source line (make_images.py names the frames). A plate of pictures.json
    is a reproduction: every one carries its source line, and one that is not open at its source (its tier is not the
    first) counts as a frame of the second tier."""
    if not _TIER:
        spec = importlib.util.spec_from_file_location("image_jobs", LANG.HERE / "tools" / "make_images.py")
        mod = importlib.util.module_from_spec(spec)
        keep, sys.dont_write_bytecode = sys.dont_write_bytecode, True
        try:
            spec.loader.exec_module(mod)
        finally:
            sys.dont_write_bytecode = keep
        known = plates()
        read = lambda p: (p.get("read_as") or {}).get("tier") or p["tier"]
        _TIER.update(frame=mod.frames(), second=set(mod.SECOND_TIER) | {n for n, p in known.items() if read(p) != "TIER1"},
                     plates=set(known))
    frame, second = _TIER["frame"], _TIER["second"]
    stems = lambda part: {frame.get(s, s) for s in re.findall(r"img/([a-z0-9-]+?)-\d+\.(?:avif|webp)\b", part)}
    shows = lambda part: stems(part) & second
    body = text[text.index("<main"):text.index("</main>")]
    problems = []
    top = re.search(r'<header class="sp-top\b.*?</header>', body, flags=re.S)
    if top and shows(top.group(0)):
        problems.append(f"the first part shows {sorted(shows(top.group(0)))}, a frame of the second rights tier")
    for fig in re.findall(r"<figure\b.*?</figure>", body, flags=re.S):
        if shows(fig) and not re.search(r'<span class="label__src">[^<]*\S', fig):
            problems.append(f"a plate shows {sorted(shows(fig))}, a frame of the second rights tier, and its label has no source line")
        elif stems(fig) & _TIER["plates"] and not re.search(r'<span class="label__src">[^<]*\S', fig):
            problems.append(f"a plate shows {sorted(stems(fig) & _TIER['plates'])}, a reproduction, and its label has no source line")
    # a reproduction never stands outside its plate, where no label could carry its line
    loose = re.sub(r"<figure\b.*?</figure>", " ", body, flags=re.S)
    if stems(loose) & (second | _TIER["plates"]):
        problems.append(f"{sorted(stems(loose) & (second | _TIER['plates']))} stands outside a plate with a label")
    return problems


def links_report(path, text, out_root, site_built, wing):
    """Every link of a built page with where it leads: this folder, the built site, the wing, or outside."""
    rows = []
    wing_pages = {wing["page"][code].strip("/") for code in LANG.wing_langs(wing, LANGS)}
    for ref in sorted(set(re.findall(r'<a\b[^>]*\bhref="([^"]+)"', text))):
        target = html.unescape(ref)
        if target.startswith("#"):
            rows.append((ref, "on the page"))
        elif re.match(r"https?://", target):
            rows.append((ref, "outside the site, not checked from here"))
        elif re.fullmatch(DOOR_SHAPE, target) or re.fullmatch(STOP_DOOR, target):
            rows.append((ref, "the wing: not in this folder, the join brings it"))
        else:
            clean = target.split("#")[0].split("?")[0]
            rel = (path.parent / clean).resolve()
            try:
                inside = rel.relative_to(out_root.resolve())
            except ValueError:
                rows.append((ref, "LEAVES THE SITE'S ROOT"))
                continue
            def there(base):
                p = base / inside
                return p.is_file() or (p / "index.html").is_file()
            if there(out_root):
                rows.append((ref, "found in this build"))
            elif there(site_built):
                rows.append((ref, "found in the built site"))
            elif there(LAST_GOOD / "site"):
                rows.append((ref, "a link of the last good header: the site has moved this page since"))
            elif str(inside).strip("/") in wing_pages:
                rows.append((ref, "the wing's own page: not built yet, the site's wing template brings it"))
            else:
                rows.append((ref, "NOT FOUND"))
    return rows


# ---------- the build ----------

def topic_key(topic):
    """A topic page's key: its count key in the registry, else its English address with underscores (as the site's
    count names it)."""
    return topic.get("count") or topic["slug"]["en"].replace("-", "_")


def load_pages(pages=PAGES):
    """Every page's words by language, with what the registry and the wing's facts say of it. A page that names its
    topic (page.topic, the topic's key in its wing's entry) is written in that topic's languages, stands at that
    topic's address, and, where the topic names a group of the wing's page (from), shows that group's works.
    Returns (data, wings, info, problems): info[page] holds wing, topic, langs and works."""
    registry = json.loads(WINGS_FILE.read_text(encoding="utf-8"))
    merged = LANG.merge_registry(registry, WINGS_FILE.parent, L, LANGS)
    if merged:
        raise SystemExit("\n".join(merged))
    wings = {k: v for k, v in registry.items() if not k.startswith("_")}
    info, problems = {}, []
    for p in pages:
        english = json.loads((HERE / f"{p}.en.json").read_text(encoding="utf-8"))
        head = english["page"]
        topic, works, facts, field = None, None, None, {}
        entry = wings.get(head.get("wing")) or {}
        # a wing in the making is written in its own languages only (langs), and so are its pages
        wing_codes = LANG.wing_langs(entry, LANGS)
        if head.get("hub") and not making(entry):
            raise SystemExit(f"{p}: page.hub lists the pages of a wing in the making: an open wing's own page does that")
        if head.get("topic"):
            topic = next((t for t in entry.get("topics", []) if topic_key(t) == head["topic"]), None)
            if topic is None:
                raise SystemExit(f"{p}: page.topic is {head['topic']!r}, and the wing's entry in {WINGS_FILE.name} has no such topic page")
            key = entry.get("_data", head["wing"])
            # the wing's facts: its stops, and the sizes a page's drawing or chart shows
            if (LANG.HERE / "wings" / f"{key}.facts.json").is_file():
                facts = json.loads((LANG.HERE / "wings" / f"{key}.facts.json").read_text(encoding="utf-8"))
            wing_words = json.loads((LANG.HERE / "wings" / f"{key}.en.json").read_text(encoding="utf-8")) if topic.get("from") else {}
            group = next((g for g in wing_words.get("holds", {}).get("groups", []) if g["id"] == topic.get("from")), {})
            # a group of works (its own from) gives the page its works; a group of text only links the page
            if group.get("from"):
                works = CHART.Works(facts, group)
                # the title of the work that hangs elsewhere, as the wing's page writes it in each language
                for code in LANG.topic_langs(topic, LANGS):
                    own = LANG.HERE / "wings" / f"{key}.{code}.json"
                    if own.is_file():
                        g = next(g for g in json.loads(own.read_text(encoding="utf-8"))["holds"]["groups"] if g["id"] == topic["from"])
                        field[code] = (g.get("field") or {}).get("h")
        info[p] = {"topic": topic, "langs": LANG.topic_langs(topic, wing_codes) if topic else wing_codes, "works": works, "facts": facts, "field": field,
                   "drawing": "drawing" in english["top"], "hub": bool(head.get("hub")), "wing_key": head.get("wing"),
                   # a page of pictures at one scale binds its numbers to their units, as a page of sizes does
                   "pairs": bool(works) or "drawing" in english["top"] or "scale" in english["top"] or bool(head.get("hub"))}
    missing = [f"{p}.{lang}.json" for p in pages for lang in info[p]["langs"] if not (HERE / f"{p}.{lang}.json").is_file()]
    if missing:
        raise SystemExit(f"{', '.join(missing)} missing: every built language (languages.json) a page is written in has its file")

    # French punctuation takes its narrow spaces here, as on the site's own pages: in the words, never in a
    # picture's sizes, an address or a key
    # A page of sizes binds its pairs as the site's own pages do (a number and its unit, a size of two numbers), so no
    # size breaks across two lines.
    def spaced(obj, lang, path="", pairs=False, more=False):
        if isinstance(obj, dict):
            return {k: spaced(v, lang, f"{path}.{k}" if path else k, pairs, more) for k, v in obj.items()}
        if isinstance(obj, list):
            return [spaced(v, lang, f"{path}.{i}", pairs, more) for i, v in enumerate(obj)]
        if isinstance(obj, str) and not re.search(NOT_SPACED, path):
            if lang == "de":
                obj = ORDINAL_DE.sub("\\1." + LIB.NBSP, obj)
            if more:
                obj = re.sub(rf"(\d) (?={MORE_UNITS}\b)", "\\1" + LIB.NBSP, obj)
            return LIB.bind(obj, lang) if pairs else LIB.space(obj, lang)
        return obj
    data = {p: {lang: spaced(json.loads((HERE / f"{p}.{lang}.json").read_text(encoding="utf-8")), lang, pairs=info[p]["pairs"],
                             more=making(wings.get(info[p]["wing_key"]) or {}))
                for lang in info[p]["langs"]} for p in pages}
    for p in pages:
        topic, works = info[p]["topic"], info[p]["works"]
        for lang in info[p]["langs"]:
            d = data[p][lang]
            if topic:
                # the address is one setting, the topic's slug in the registry
                if d["page"].get("slug") not in (None, topic["slug"][lang]):
                    problems.append(f"{p}.{lang}: page.slug {d['page']['slug']!r} is not its topic's address {topic['slug'][lang]!r}: "
                                    "leave the slug to the registry")
                d["page"]["slug"] = topic["slug"][lang]
            problems += [f"{p}.{lang}: {x}" for x in check_wing_facts(d, info[p]["facts"])]
            # what the drawing shows inside its wall is one reading of the wall, the same in every language
            if info[p]["drawing"] and d["top"]["drawing"].get("inside") != data[p][info[p]["langs"][0]]["top"]["drawing"].get("inside"):
                problems.append(f"{p}.{lang}: top.drawing.inside differs from the {info[p]['langs'][0]} file's: the drawing is one")
            blocks = {b["type"] for b in d["blocks"]}
            wants = blocks & {"chart", "works", "table", "periods"} or ("figure" in d["top"]) or ("tally" in d["top"])
            if wants and not works:
                problems.append(f"{p}.{lang}: a chart, a list of works or a table needs a topic that names a group of its wing (from)")
                continue
            if not works:
                continue
            if "periods" in blocks:
                # a list of the works one by one: its entries are checked against the facts, it draws no sizes
                problems += [f"{p}.{lang}: {x}" for x in check_periods(d, lang, works, info[p]["facts"], info[p]["field"].get(lang), d["pics"])]
                if "tally" in d["top"]:
                    problems += [f"{p}.{lang}: {x}" for x in check_tally(d, works, info[p]["facts"])]
                continue
            if "works" not in blocks:
                problems.append(f"{p}.{lang}: a page with works has a works block: its lines name every work")
                continue
            lines = [x.replace(LIB.NBSP, " ") for b in d["blocks"] if b["type"] == "works" for x in b["lines"]]
            problems += [f"{p}.{lang}: {x}" for x in CHART.check_lines(works, lines, LIB.number, lang)]
            person = re.search(r"\d+(?:[.,]\d+)?", d["labels"].get("person", ""))
            if not person or float(person.group(0).replace(",", ".")) * 100 != works.person_cm:
                problems.append(f"{p}.{lang}: labels.person does not give the facts' person of {works.person_cm:g} cm")
            mark = d["top"].get("figure", {}).get("work")
            if mark and mark not in {it["id"] for it in works.items}:
                problems.append(f"{p}.{lang}: top.figure.work {mark!r} is no work of the facts")
    return data, wings, info, problems


def narrow_problems(fig, pic):
    """A picture's version for narrow screens (pics.<name>.narrow): a closer cut of the same render under its own
    stem and widths, the screen width from which the whole picture stands instead (below, a width its sizes name),
    the person's place in it if it shows the person, and a place for each label it keeps. A label it leaves out is
    the person's, whose height then stands on the picture. Returns the problems."""
    where, narrow = f"pics.{fig.get('pic')}.narrow", pic["narrow"]
    if not isinstance(narrow, dict) or not isinstance(narrow.get("stem"), str) or narrow["stem"] == pic.get("stem"):
        return [f"{where} is a closer cut under its own stem, with its widths, below and the person's place"]
    problems = []
    if not (isinstance(narrow.get("widths"), list) and narrow["widths"] and all(type(w) is int for w in narrow["widths"])):
        problems.append(f"{where}.widths lists the widths it is cut to")
    named = {int(w) for w in re.findall(r"\(min-width:\s*(\d+)px\)", pic.get("sizes") or "")}
    if not (type(narrow.get("below")) is int and narrow["below"] > max(MARK_SCREENS) and narrow["below"] in named):
        problems.append(f"{where}.below is the screen width from which the whole picture stands, one its sizes name "
                        f"and wider than the phones ({', '.join(map(str, MARK_SCREENS))})")
    if "person" in narrow and not re.fullmatch(r"\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%", narrow["person"] or ""):
        problems.append(f"{where}.person is the person's place in it")
    near = narrow.get("marks") or {}
    for key, at in near.items() if isinstance(near, dict) else []:
        if key not in (pic.get("marks") or {}) or not mark_at(at):
            problems.append(f"{where}.marks.{key} places a label of the picture: the animal's start and end in the narrow version")
    for mark in fig.get("marks", []):
        if mark.get("span") not in near and not (mark.get("span") == "person" and narrow.get("person")):
            problems.append(f"the label {mark.get('span')!r} has no place in {where}.marks: only the person's label may "
                            "leave the narrow version, whose person then carries its height")
    return problems


def making_problems(d, wing, data):
    """What a page of a wing in the making needs, and what no other page may carry: its line and link where the door
    would stand (top.out), its pictures at one scale with the person's place, its table's rows as long as its columns,
    and its list of pages. Returns the problems."""
    problems, top = [], d["top"]
    layout = d["page"].get("og_image", {}).get("layout")
    if not making(wing):
        found = [k for k in ("out", "scale", "guess") if k in top] + [b["id"] for b in d["blocks"] if b["type"] in ("numbers", "pages")]
        found += ["page.og_image.layout"] if layout else []
        return [f"{', '.join(found)} stand only on a page of a wing in the making"] if found else []
    if layout not in (None, "beside"):
        problems.append(f"page.og_image.layout is {layout!r}: the share picture's one other form is 'beside'")
    if "door" in top or any(b["type"] == "close" for b in d["blocks"]):
        problems.append("a page of a wing in the making has no door: its line and link stand in top.out")
    if not (top.get("out") or {}).get("text") or not (top.get("out") or {}).get("link"):
        problems.append("top.out needs its line and its link's words")
    figs = [top["scale"], top["scale"].get("close")] if "scale" in top else []
    figs += [b["scale"] for b in d["blocks"] if b.get("scale")]
    figs += [f.get("close") for f in figs if f and f is not top.get("scale")]
    for fig in filter(None, figs):
        pic = d["pics"].get(fig.get("pic"))
        if not pic or not re.fullmatch(r"\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%", pic.get("person") or ""):
            problems.append(f"the picture {fig.get('pic')!r} at one scale needs pics.<name>.person, the person's place in it")
        for bar in fig.get("bars", []):
            at = ((pic or {}).get("spans") or {}).get(bar.get("span"))
            if not at or not re.fullmatch(r"\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%", at):
                problems.append(f"the length bar's span {bar.get('span')!r} needs pics.{fig.get('pic')}.spans.<span>, its start and end in the picture")
        for mark in fig.get("marks", []):
            if not mark_at(((pic or {}).get("marks") or {}).get(mark.get("span"))):
                problems.append(f"the label {mark.get('span')!r} needs pics.{fig.get('pic')}.marks.<span>, the animal's start and end in the picture")
            if not mark_split(mark.get("text", ""))[1]:
                problems.append(f"the label {mark.get('span')!r} gives the animal's name, a comma and its length")
        for name in (pic or {}).get("behind") or []:
            if name not in {m.get("span") for m in fig.get("marks", [])}:
                problems.append(f"pics.{fig.get('pic')}.behind names {name!r}, which no label of the picture is")
        if (pic or {}).get("person_from") is not None and not (
                isinstance(pic["person_from"], int) and pic["person_from"] > MARK_SCREENS[0]
                and "person" in {m.get("span") for m in fig.get("marks", [])}):
            problems.append(f"pics.{fig.get('pic')}.person_from is a screen width, and where the person's height leaves the "
                            "picture on a narrower screen, a label of the picture names the person")
        if (pic or {}).get("narrow") is not None:
            problems += narrow_problems(fig, pic)
        for k in fig.get("key") if isinstance(fig.get("key"), list) else []:
            colour = ((pic or {}).get("swatches") or {}).get(k.get("swatch")) if isinstance(k, dict) else ""
            if colour is None or (isinstance(k, dict) and not re.fullmatch(r"#[0-9a-f]{6}", colour)):
                problems.append(f"the key's swatch {k.get('swatch')!r} needs pics.{fig.get('pic')}.swatches.<swatch>, "
                                "the colour as the picture prints it (#rrggbb)")
        if fig.get("marks") and not (pic or {}).get("sizes"):
            problems.append(f"the picture {fig.get('pic')!r} with labels needs its sizes: the labels are laid for its widths")
        if "after" in fig and not (isinstance(fig["after"], int) and fig is not top.get("scale")):
            problems.append(f"the picture {fig.get('pic')!r}: after names the paragraph a picture in the page's body follows")
        if not re.search(r"\d", d["labels"].get("person", "")):
            problems.append("labels.person gives the person's height")
    for b in d["blocks"]:
        if b["type"] == "numbers":
            for i, row in enumerate(b["rows"]):
                if len(row["cells"]) != len(b["cols"]):
                    problems.append(f"{b['id']}: row {i} has {len(row['cells'])} cells and the table {len(b['cols'])} columns")
            if any(not c for r in b["rows"] for c in r["cells"]) and not d["labels"].get("no_figure"):
                problems.append(f"{b['id']}: an empty cell needs labels.no_figure, the words a phone shows for it")
        if b["type"] == "pages":
            for item in b["items"]:
                if item["page"] not in data:
                    problems.append(f"{b['id']}: {item['page']!r} is no page of this build")
    return problems


def check_wing_facts(d, facts):
    """A page's way to a stop and its drawing of a wall stand in its wing's facts: the stop among its stops, the wall
    among its walls, and the drawing's person the facts' person. Returns the problems."""
    problems = []
    stops = (facts or {}).get("stops", [])
    wanted = [("page.stop", d["page"].get("stop"))] + [
        (f"{b['id']}.links", link["stop"]) for b in d["blocks"] for link in b.get("links", []) if "stop" in link]
    for where, stop in wanted:
        if stop is not None and stop not in stops:
            problems.append(f"{where} is {stop!r}, which is no stop of the wing's facts")
    drawing = d["top"].get("drawing")
    if drawing:
        if drawing.get("wall") not in ((facts or {}).get("wall") or {}):
            problems.append(f"top.drawing.wall is {drawing.get('wall')!r}, which is no wall of the wing's facts")
        person = re.search(r"\d+(?:[.,]\d+)?", d["labels"].get("person", ""))
        if not facts or not person or float(person.group(0).replace(",", ".")) != facts["set"]["person_m"]:
            problems.append("labels.person does not give the facts' person")
        if d["page"].get("still"):
            problems.append("page.still is a chart's: a page with a drawing shares the drawing (page.og_image)")
        size = ((facts or {}).get("wall") or {}).get(drawing.get("wall"))
        if size and drawing.get("inside"):
            problems += CHART.check_inside(drawing["inside"], size["h_m"], size["w_m"])
        if drawing.get("arch_label") and not (drawing.get("inside") or {}).get("arch"):
            problems.append("top.drawing.arch_label labels an arch the drawing does not draw")
        if drawing.get("inside") and not drawing.get("note", "").strip():
            problems.append("top.drawing.inside draws a reconstruction, and top.drawing.note, which says so under the drawing, is missing")
    return problems


def still_jobs(pages=PAGES, loaded=None):
    """Every still of every page with a chart, by language: the chart (1600 wide) and the share picture
    (1200 by 630), each as {file, svg}; of every page with a drawing of a wall, its share picture; and of every page
    that lists its wing's works by period, its count as its share picture.
    make_pictures.py renders them, and the build checks each against its drawing."""
    data, wings, info, _ = loaded or load_pages(pages)
    colours = CHART.tokens((LANG.HERE / "css" / "tokens.css").read_text(encoding="utf-8"))
    jobs = []
    for page in pages:
        works = info[page]["works"]
        for lang in info[page]["langs"]:
            d = data[page][lang]
            code = L.html(lang).lower()
            if making(wings.get(info[page]["wing_key"]) or {}):
                # a page of a wing in the making shares its first picture at one scale, the list of pages its first page's
                jobs.append(dict(scale_share(d, data, lang, colours), file=d["page"]["og_image"]["file"].replace("{lang}", code),
                                 page=page, lang=lang, kind="share", raster=True))
                continue
            if info[page]["drawing"]:
                wall, facts = d["top"]["drawing"]["wall"], info[page]["facts"]
                size = facts["wall"][wall]
                words = {"h1": d["top"]["h1"].replace(LIB.NBSP, " "), "person": d["labels"]["person"].replace(LIB.NBSP, " "),
                         "site": ORIGIN.split("://", 1)[1],
                         "arch": " ".join(d["top"]["drawing"].get("arch_label") or []).replace(LIB.NBSP, " "),
                         "note": d["top"]["drawing"].get("note", "").replace(LIB.NBSP, " ")}
                jobs.append({"file": d["page"]["og_image"]["file"].replace("{lang}", code), "page": page, "lang": lang, "kind": "share",
                             "svg": CHART.wall_still_svg(CHART.cm_of(size["h_m"]), CHART.cm_of(size["w_m"]), CHART.cm_of(facts["set"]["person_m"]),
                                                         words, LIB.number, lang, colours, d["top"]["drawing"].get("inside"))})
                continue
            unbound = lambda s: s.replace(LIB.NBSP, " ")
            if "tally" in d["top"] and works:
                ta = d["top"]["tally"]
                words = {"h1": unbound(d["top"]["h1"]), "site": ORIGIN.split("://", 1)[1],
                         "key": [(k, unbound(ta["key"][k])) for k in TALLY_KINDS if ta["key"].get(k)]}
                rows = [(unbound(h), kinds) for h, kinds in tally_rows(d, works)]
                jobs.append({"file": d["page"]["og_image"]["file"].replace("{lang}", code), "page": page, "lang": lang, "kind": "share",
                             "svg": CHART.tally_still_svg(rows, words, colours)})
                continue
            if not d["page"].get("still") or not works:
                continue
            lines = [unbound(x) for b in d["blocks"] if b["type"] == "works" for x in b["lines"]]
            chart = next(b for b in d["blocks"] if b["type"] == "chart")
            titles = {it["n"]: CHART.split_line(line, it, LIB.number, lang)[0].rstrip(".") for it, line in zip(works.items, lines)}
            mark = d["top"]["figure"]["work"]
            field = next((it for it in works.items if it.get("field")), None)
            address = f"{ORIGIN}/{page_path(d, wings[d['page']['wing']], lang)}/".split("://", 1)[1]
            words = {"h1": unbound(d["top"]["h1"]), "caption": unbound(chart["still_caption"]), "person": unbound(d["labels"]["person"]),
                     "mark": titles[works.by_id(mark)["n"]], "field": titles[field["n"]] if field else "", "titles": titles,
                     "site": ORIGIN.split("://", 1)[1], "credit": [f"Museum of Ages, {address}", unbound(chart["licence"])]}
            for kind, name in (("chart", d["page"]["still"]["file"]), ("share", d["page"]["og_image"]["file"])):
                jobs.append({"file": name.replace("{lang}", code), "page": page, "lang": lang, "kind": kind,
                             "svg": CHART.still_svg(works, mark, words, LIB.number, lang, colours, kind)})
    return jobs


def scale_share(d, data, lang, colours):
    """The share picture of a page of a wing in the making: its heading, under it the page's answer line for the link
    preview (labels.og_answer) or else the line its share title adds to it, and its first picture at one scale (a list
    of pages: the first listed page's). Returns {svg}."""
    plain = lambda t: t.replace(LIB.NBSP, " ")
    source = d
    if d["page"].get("hub"):
        first = next(x for b in d["blocks"] if b["type"] == "pages" for x in b["items"])
        source = data[first["page"]][lang]
    pic = source["pics"][source["top"]["scale"]["pic"]]
    width = 1600 if 1600 in pic["widths"] else max(pic["widths"])
    name = f'{pic["stem"]}-{width}.webp'
    found = next((f / name for f in (PICS,) if (f / name).is_file()), None)
    if not found:
        raise SystemExit(f"the picture {name} is not cut: python3 pages/make_pictures.py {pic['stem']} (needs MOA_FILM_STILLS)")
    place = re.fullmatch(r"([\d.]+)% ([\d.]+)%", pic.get("person") or "")
    h1, og = plain(d["top"]["h1"]), plain(d["meta"]["og_title"])
    answer = d["labels"].get("og_answer")
    # a title that repeats the heading gives the rest as the line, without the colon that joined them
    rest = og[len(h1):].lstrip(" :").strip() if og.startswith(h1) else ""
    words = {"h1": h1, "line": plain(answer) if answer else rest[:1].upper() + rest[1:],
             "person": plain(d["labels"]["person"]),
             "site": ORIGIN.split("://", 1)[1]}
    beside = source["page"]["og_image"].get("layout") == "beside"
    # beside its words the picture is narrow: a person whose picture leaves open stone over it only on wider screens
    # (pics.<name>.person_from) has no height there either
    if beside and pic.get("person_from"):
        place = None
    return {"svg": CHART.picture_still_svg(words, colours, name, webp_size(found),
                                           (float(place.group(1)) / 100, float(place.group(2)) / 100) if place else None,
                                           beside=beside)}


def build_pages(out_dir, site_src=SITE_SRC, site_built=SITE_BUILT, pages=PAGES, quiet=False):
    """Builds every page into out_dir with the files it uses under out_dir/static/.
    Returns the list of written pages. Raises SystemExit with the problems when a rule is broken."""
    out_dir, site_src, site_built = Path(out_dir), Path(site_src), Path(site_built)
    parts = parts_of((HERE / "template.html").read_text(encoding="utf-8"))
    data, wings, info, problems = load_pages(pages)
    names = json.loads(NAMES_FILE.read_text(encoding="utf-8"))["names"]
    # a language may add names of its own (names.<code>.json beside names.json)
    own_names = {lang: json.loads((HERE / f"names.{lang}.json").read_text(encoding="utf-8"))["names"]
                 if (HERE / f"names.{lang}.json").is_file() else [] for lang in LANGS}

    def kept(page, lang):
        return Names(names + own_names[lang], wing[page]["name"][lang], lang)

    wing = {}
    for page, every in data.items():
        a = every["en"]
        wing[page] = wing_of(page, a, wings)
        for lang in info[page]["langs"]:
            b = every[lang]
            problems += lint(page, lang, b, wing[page], kept(page, lang), info[page]["topic"])
            problems += [f"{page}.{lang}: {x}" for x in making_problems(b, wing[page], data)]
            if lang == "en":
                continue
            if a["page"].get("wing") != b["page"].get("wing"):
                raise SystemExit(f"{page}: {lang} names another wing than English")
            if shape({k: v for k, v in a.items() if k != "page"}) != shape({k: v for k, v in b.items() if k != "page"}):
                problems.append(f"{page}: {lang} does not hold the same structure as English" if lang != "de" else
                                f"{page}: the two languages do not hold the same structure")
            if (a["pics"] != b["pics"] or a["page"]["id"] != b["page"]["id"] or a["page"]["og_image"] != b["page"]["og_image"]
                    or a["page"].get("still") != b["page"].get("still")):
                problems.append(f"{page}: {lang} differs from English in pictures or in the page label" if lang != "de" else
                                f"{page}: the two languages differ in pictures or in the page label")
            for x, y in zip(a["blocks"], b["blocks"]):
                if x["type"] != y["type"] or x["id"] != y["id"]:
                    problems.append(f"{page}: block {x['id']} and {y['id']} do not match")
    for name in OWN_CSS + CHART_CSS + LIST_CSS + SCALE_CSS:
        body = re.sub(r"/\*.*?\*/", "", (HERE / "css" / f"{name}.css").read_text(encoding="utf-8"), flags=re.S)
        if re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(", body):
            problems.append(f"css/{name}.css: a colour is written outside the site's token file")
    if problems:
        raise SystemExit("\n".join(problems))
    # a chart's stills: each must be made from the drawing the page would make now
    stills = {}
    for page in pages:
        stills[page] = {}
        for lang in info[page]["langs"]:
            d = data[page][lang]
            if not d["page"].get("still"):
                continue
            code = L.html(lang).lower()
            stills[page][lang] = {"chart": d["page"]["still"]["file"].replace("{lang}", code),
                                  "share": d["page"]["og_image"]["file"].replace("{lang}", code)}
    folders = [PICS, site_built / STATIC / "img"]
    for job in still_jobs(pages, (data, wings, info, [])):
        found = next((f / job["file"] for f in folders if (f / job["file"]).is_file()), None)
        if not found:
            problems.append(f"the still {job['file']} is not made: python3 pages/make_pictures.py {job['file']} (needs MOA_FONT_TTF)")
        elif CHART.png_info(found)[1].get("comment") != CHART.source_mark(job["svg"]):
            problems.append(f"the still {job['file']} is older than its chart: python3 pages/make_pictures.py {job['file']}")
    if problems:
        raise SystemExit("\n".join(problems))

    site = site_parts(site_src, site_built)
    shared = {
        "parts": parts, "data": data, "site_built": site_built, "chrome_pages": site["pages"], "wing": wing,
        "langs": {p: info[p]["langs"] for p in pages}, "works": {p: info[p]["works"] for p in pages if info[p]["works"]},
        "stills": stills, "facts": {p: info[p]["facts"] for p in pages},
        "names": names, "own_names": own_names,
        "css": css_min(*[site["css"] / f"{n}.css" for n in CSS_BEFORE], *[HERE / "css" / f"{n}.css" for n in OWN_CSS],
                       *[site["css"] / f"{n}.css" for n in CSS_AFTER]),
        "css_chart": css_min(*[site["css"] / f"{n}.css" for n in CSS_BEFORE], *[HERE / "css" / f"{n}.css" for n in OWN_CSS + CHART_CSS],
                             *[site["css"] / f"{n}.css" for n in CSS_AFTER]),
        "css_list": css_min(*[site["css"] / f"{n}.css" for n in CSS_BEFORE],
                            *[HERE / "css" / f"{n}.css" for n in OWN_CSS + CHART_CSS + LIST_CSS],
                            *[site["css"] / f"{n}.css" for n in CSS_AFTER]),
        # the pages' own cuts, then the site's pictures (a still the wing shows too): built, else their source folder
        "pic_folders": [PICS, site_built / STATIC / "img", LANG.HERE / "img"],
        "css_scale": css_min(*[site["css"] / f"{n}.css" for n in CSS_BEFORE], *[HERE / "css" / f"{n}.css" for n in OWN_CSS + CHART_CSS + SCALE_CSS],
                             *[site["css"] / f"{n}.css" for n in CSS_AFTER]),
        # a page of several subjects at one scale: only the pages whose picture carries labels take its rules
        "css_several": css_min(HERE / "css" / "several.css"),
        # a page of a wing in the making links the newest open wing's own page, in its language
        "out": {code: wings[newest_open(wings)]["page"][code].strip("/") + "/" for code in LANGS} if any(making(w) for w in wing.values()) else {},
        "topics": {p: info[p]["topic"] for p in pages},
        "langs_css": css_min(site["css"] / "langs.css") if (site["css"] / "langs.css").is_file() else "",
    }

    # the two faces travel with their licence files
    fonts = site["fonts"]
    files = {f"fonts/{f.name}": f for f in [fonts / "cardo-400.woff2", fonts / "marcellus-400.woff2", *fonts.glob("LICENSE*")]}
    # a built language's own faces, with their licences, in their folder
    for code in LANGS:
        if (fonts / code).is_dir():
            files.update({f"fonts/{code}/{f.name}": f for f in (fonts / code).iterdir() if f.is_file()})
    built = []
    for page in pages:
        for lang in info[page]["langs"]:
            path, text, used = render(page, lang, data[page][lang], shared, out_dir)
            built.append((path, text, page, lang))
            files.update(used)

    for rel, src in sorted(files.items()):
        dst = out_dir / STATIC / rel
        if not src.exists():
            raise SystemExit(f"{src} is missing")
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists() or dst.read_bytes() != src.read_bytes():
            shutil.copyfile(src, dst)
    for path, text, _, _ in built:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    problems = []
    for path, text, page, lang in built:
        problems += check_built(path, text, out_dir, kept(page, lang))
    if problems:
        raise SystemExit("\n".join(problems))

    if not quiet:
        if site["note"]:
            print(site["note"])
        for path, text, page, lang in built:
            words = len(shown_text(text[text.index("<main"):text.index("</main>")]).split())
            print(f"{str(path.relative_to(out_dir)):52} {len(text.encode('utf-8')):6} bytes, {words} words in the page's own part")
            for ref, where in links_report(path, text, out_dir, site_built, wing[page]):
                if where.isupper() or "wing" in where or "outside" in where or "moved" in where:
                    print(f"    link {ref}: {where}")
        print(f"static files copied: {len(files)}. All checks passed.")
    return [path for path, _, _, _ in built]


def facts(pages=PAGES):
    for page in pages:
        for lang in LANGS:
            if not (HERE / f"{page}.{lang}.json").is_file():
                continue
            data = json.loads((HERE / f"{page}.{lang}.json").read_text(encoding="utf-8"))
            print(f"{page}.{lang}")
            print(f"  title       {len(data['meta']['title']):3}  {data['meta']['title']}")
            print(f"  description {len(data['meta']['description']):3}  {data['meta']['description']}")
            print(f"  h1          {len(data['top']['h1']):3}  {data['top']['h1']}")
            print(f"  answer      {answer_length(data['top']):3}")
            for block in data["blocks"]:
                print(f"  h2  {block['h']}")
                for item in block.get("items", []):
                    print(f"      h3  {item.get('name') or item.get('q')}")


if __name__ == "__main__":
    if "--facts" in sys.argv:
        facts()
    else:
        out = HERE / "out"
        if "--out" in sys.argv:
            out = Path(sys.argv[sys.argv.index("--out") + 1])
        build_pages(out)
