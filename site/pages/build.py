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
import json
import posixpath
import re
import shutil
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_SRC = HERE.parent / "_src"
SITE_BUILT = HERE.parent / "dist"

# The page of the built site whose header and footer every search page wears, and this folder's
# copy of the last whole site for the time that page is not there.
CHROME_PAGE = {"en": "what-this-museum-is/", "de": "de/was-dieses-museum-ist/"}
LAST_GOOD = HERE / "last-good"
# This folder's own pictures. A picture that is not here is looked for in the site's folder.
PICS = HERE / "pics" / "img"
# Names in another language, kept whole wherever they stand in a displayed sentence.
NAMES_FILE = HERE / "names.json"
# The longest run a heading keeps on one line at the page's size, the longest it keeps at a
# smaller size, in characters. A longer name has to wrap on a phone.
KEEP_WHOLE = 19
KEEP_SMALL = 24

# The addresses, kept here and nowhere else. A wing's own addresses stand in its entry in WINGS_FILE.
ORIGIN = "https://museumofages.org"
WINGS_FILE = SITE_SRC / "registry.json"
WING_KEYS = ("name", "page", "door", "about", "never_say", "claim_phrase")
# A door leads to a wing's own opening: no fragment, no parameter but the language.
DOOR_SHAPE = r"/w/[a-z0-9-]+(?:\?(?:film=[a-z0-9-]+&(?:amp;)?)?lang=[a-z]{2})?"  # the release name opens the wing's early door
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

LANGS = ("en", "de")
# Every pair of data files in this folder is a page.
PAGES = sorted(p.name[:-len(".en.json")] for p in HERE.glob("*.en.json"))

# The style files a search page sets inline, in the site's order: its tokens and base styles, this
# folder's own sheet, then the footer and the rule that stills every transition for readers who ask.
CSS_BEFORE = ["tokens", "base"]
OWN_CSS = ["page"]
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
    (r"\bprivate\b|\bprivat\b", "never Private"),
    (r"\bfree\b(?! entry)|\bkostenlos\b|\bgratis\b", "never Free alone: Free entry, no account"),
    (r"true size|wahre[rn]? größe|originalgröße", "at true size only where it is literally true"),
]
# A wing's claim_phrase is what people type but the sources do not carry ("his inventions").
# It may stand in these keys only: the title, the description, the h1, a question.
CLAIM_ALLOWED = (r"^meta\.", r"^top\.h1$", r"\.q$")
# How the words are made is said once, on the page about the museum. A page here carries no line on it.

BLOCK_TYPES = ("places", "group", "feature", "notes", "faq", "sources", "close")


# ---------- small tools ----------

def esc(text):
    return html.escape(text, quote=True)


class Names:
    """Marks the names that are kept whole in a displayed sentence.

    The wing's own name comes from its entry and never breaks across lines. A name of names.json is
    never hyphenated and carries its language where it differs from the page's, so a screen reader
    says it right. A person's name of that list never breaks either."""

    def __init__(self, entries, wing_name, lang):
        self.lang, self.wing_name = lang, wing_name
        self.table = {e["text"]: e for e in entries}
        self.table[wing_name] = {"text": wing_name, "wing": True}
        # the longest name first, so a full name wins over its last word
        ordered = sorted(self.table, key=len, reverse=True)
        self.find = re.compile(r"(?<!\w)(%s)('s|’s|s)?(?!\w)" % "|".join(re.escape(n) for n in ordered))

    def mark(self, text, wrap_wing=False):
        """The sentence as HTML. wrap_wing lets the wing's name wrap where it is too long for a line."""
        out, last = [], 0
        for m in self.find.finditer(text):
            entry, ending = self.table[m.group(1)], m.group(2) or ""
            out.append(esc(text[last:m.start()]))
            last = m.end()
            if entry.get("wing"):
                kind = "nh" if wrap_wing else "nw"
                out.append(f'<span class="{kind}">{esc(m.group(1) + ending)}</span>')
                continue
            kind = "nw nh" if entry.get("person") else "nh"
            code = entry.get("lang")
            if code and code != self.lang:
                # the ending is the page's own language and stays outside
                out.append(f'<span class="{kind}" lang="{code}">{esc(m.group(1))}</span>{esc(ending)}')
            else:
                out.append(f'<span class="{kind}">{esc(m.group(1) + ending)}</span>')
        out.append(esc(text[last:]))
        return "".join(out)

    def wing_run(self, text):
        """The length of the wing's name with its ending as it stands in a heading, or 0."""
        runs = [len(m.group(0)) for m in self.find.finditer(text) if self.table[m.group(1)].get("wing")]
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
    """The structure of a data file without its words, to compare the two languages."""
    if isinstance(obj, dict):
        return {k: shape(v) for k, v in obj.items() if k != "_note"}
    if isinstance(obj, list):
        return [shape(v) for v in obj]
    return type(obj).__name__


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


def site_chrome(site_built, lang, root, twin, door):
    """The header, the footer, the arrow and the publisher's record, from the site's built statement page."""
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
        # the language switch leads to this page's twin, and no link of the header is the current page
        text = re.sub(r'(<a\b[^>]*?\bhref=")[^"]*("[^>]*\bhreflang="[^"]*")', lambda m: m.group(1) + twin + m.group(2), text)
        text = text.replace(' aria-current="page"', "")
        # every way in leads to this page's wing, whatever door the site's page carried when it was built
        text = re.sub(r'(<a class="door[^"]*" href=")[^"]*"', lambda m: m.group(1) + esc(door) + '"', text)
        text = re.sub(rf'href="(?:{DOOR_SHAPE}|{OLD_DOOR})"', f'href="{esc(door)}"', text)
        out[key] = text
    arrow = re.search(r'<svg class="arrow".*?</svg>', page, flags=re.S)
    if not arrow:
        raise SystemExit(f"{source}: the door's arrow was not found")
    out["arrow"] = arrow.group(0)
    # the licence of the site's own pictures: the footer's licence link once it carries one, before that the
    # statement page's section on rights, which says whose they are; that section also tells how to use them
    rights = f"{ORIGIN}/{name}#open"
    if 'id="open"' not in page:
        raise SystemExit(f"{source}: the section on rights (#open) was not found")
    licence = re.search(r'<a\b(?=[^>]*\brel="license")[^>]*\bhref="(https://[^"]+)"', page)
    out["licence"], out["rights"] = (licence.group(1) if licence else rights), rights
    out["publisher"] = None
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, flags=re.S):
        for node in json.loads(block.replace("<\\/", "</")).get("@graph", []):
            if str(node.get("@id", "")).endswith("#publisher"):
                out["publisher"] = node
    theme = re.search(r'<meta name="theme-color" content="([^"]+)"', page)
    out["theme"] = theme.group(1) if theme else ""
    return out


# ---------- checks on the words ----------

def wing_of(page, data, wings):
    name = data["page"].get("wing")
    if name not in wings:
        raise SystemExit(f"{page}: page.wing is {name!r}, and {WINGS_FILE.name} has no such wing")
    wing = wings[name]
    missing = [k for k in WING_KEYS if k not in wing] + [f"{k}.{c}" for k in ("name", "page", "door") for c in LANGS
                                                         if c not in wing.get(k, {})]
    if missing:
        raise SystemExit(f"{WINGS_FILE.name}: the wing {name!r} lacks {', '.join(missing)}")
    for code in LANGS:
        if not re.fullmatch(DOOR_SHAPE, wing["door"][code]):
            raise SystemExit(f"{WINGS_FILE.name}: the door of {name!r} ({code}) is not a wing's plain opening")
    return wing


def lint(page, lang, data, wing, names):
    problems = []
    words = flatten({k: v for k, v in data.items() if k not in ("_note", "page", "pics")})
    never = BANNED_FACTS + [tuple(rule) for rule in wing["never_say"]]
    for key, text in words.items():
        where = f"{page}.{lang}: {key}"
        if key.endswith(".href"):
            if not re.fullmatch(r"https://[^\s\"<>]+", text):
                problems.append(f"{where} is not a plain https address")
            continue
        if key.endswith(".focus"):
            if not re.fullmatch(r"\d{1,3}% \d{1,3}%", text):
                problems.append(f"{where} is not a place in a picture, as in 50% 80%")
            continue
        if re.search(r"\.(pic|tag|k|type|id|stem|sizes)$", key):
            continue
        if not text.strip() and not key.endswith(".nav"):
            problems.append(f"{where} is empty")
        low = text.lower()
        for bad in BANNED:
            if bad in low:
                problems.append(f"{where} contains {bad!r}")
        for pattern, instead in never:
            if re.search(pattern, low):
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
    ids = [b["id"] for b in data["blocks"]] + [i["id"] for b in data["blocks"] for i in b.get("items", []) if "id" in i]
    if len(ids) != len(set(ids)):
        problems.append(f"{page}.{lang}: an id stands twice in {ids}")
    for block in data["blocks"]:
        if block["type"] != "sources":
            continue
        if "ai" in block:
            problems.append(f"{page}.{lang}: sources.ai is gone from these pages, take the key out")
        for house in block["holders"] + block.get("editions", []):
            if names.left_over(house["name"]):
                problems.append(f"{page}.{lang}: the house {house['name']!r} is not in {NAMES_FILE.name}, "
                                "so its name would be hyphenated and read in the wrong language")
    if kinds.count("sources") != 1:
        problems.append(f"{page}.{lang}: a page needs exactly one sources block")
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
        return [f"{d['stem']}-{n}.{ext}" for n in d["widths"] for ext in ("avif", "webp")]

    def size(self, name):
        d = self.defs[name]
        return webp_size(self.find(f"{d['stem']}-{max(d['widths'])}.webp"))

    def srcset(self, name, ext):
        d = self.defs[name]
        return ", ".join(f"{self.root}{STATIC}/img/{d['stem']}-{n}.{ext} {n}w" for n in d["widths"])

    def picture(self, name, alt, first=False):
        """AVIF with a WebP fallback. Width and height keep the box, so nothing moves when it arrives."""
        d = self.defs[name]
        self.used.add(name)
        w, h = self.size(name)
        how = 'fetchpriority="high"' if first else 'loading="lazy" decoding="async"'
        out = ["<picture>"]
        for ext in ("avif", "webp"):
            out.append(f'<source type="image/{ext}" srcset="{self.srcset(name, ext)}" sizes="{d["sizes"]}" '
                       f'width="{w}" height="{h}">')
        out.append(f'<img src="{self.root}{STATIC}/img/{d["stem"]}-{max(d["widths"])}.webp" width="{w}" height="{h}" '
                   f'alt="{alt}" {how}>')
        out.append("</picture>")
        return "".join(out)

    def preload(self, name):
        d = self.defs[name]
        return (f'<link rel="preload" as="image" type="image/avif" imagesrcset="{self.srcset(name, "avif")}" '
                f'imagesizes="{d["sizes"]}" fetchpriority="high">\n')


def faces(root):
    """The site's two faces and its figures. They swap in after the text is up: no script is needed."""
    rule = ('@font-face{{font-family:"{name}";src:url("{root}{static}/fonts/{file}") format("woff2");'
            "font-weight:400;font-style:normal;font-display:swap{extra}}}")
    return (rule.format(name="Cardo", root=root, static=STATIC, file="cardo-400.woff2", extra="")
            + rule.format(name="Marcellus", root=root, static=STATIC, file="marcellus-400.woff2", extra="")
            + rule.format(name="Moa figures", root=root, static=STATIC, file="cardo-400.woff2",
                          extra=";unicode-range:U+30-39;size-adjust:108%"))


def focus_rule(frame):
    """Where the first picture keeps its subject while a phone's box cuts it. The place is the picture's
    own, so it stands in the data file (top.frame.focus) and not in the style file."""
    if not frame.get("focus"):
        return ""
    return "@media (max-width:599px){.sp-frame img{object-position:%s}}" % frame["focus"]


# ---------- structured data ----------

def jsonld(lang, data, urls, pics, site, wing, licence, rights):
    self_url = urls[lang]
    pub = {"@id": f"{ORIGIN}/#publisher"}
    publisher = site or {
        "@type": "NGO", "@id": pub["@id"], "name": "ChipMates gemeinnützige GmbH",
        "legalName": "ChipMates gemeinnützige GmbH"}
    frame = data["top"]["frame"]
    d = pics.defs[frame["pic"]]
    w, h = pics.size(frame["pic"])
    image_url = f"{ORIGIN}/{STATIC}/img/{d['stem']}-{max(d['widths'])}.webp"
    home = f"{ORIGIN}/" if lang == "en" else f"{ORIGIN}/de/"
    graph = [
        publisher,
        {
            "@type": "WebSite", "@id": f"{ORIGIN}/#website", "url": f"{ORIGIN}/", "name": "Museum of Ages",
            "alternateName": "Museum of Ages, a digital museum" if lang == "en" else "Museum of Ages, ein digitales Museum",
            "inLanguage": ["en", "de"], "publisher": pub,
        },
        {
            "@type": "WebPage", "@id": f"{self_url}#page", "url": self_url, "name": data["meta"]["title"],
            "description": data["meta"]["description"], "inLanguage": lang,
            "isPartOf": {"@id": f"{ORIGIN}/#website"}, "publisher": pub,
            "breadcrumb": {"@id": f"{self_url}#crumbs"}, "primaryImageOfPage": {"@id": f"{self_url}#frame"},
        },
        {
            "@type": "Article", "@id": f"{self_url}#article", "headline": data["top"]["h1"],
            "description": data["meta"]["description"], "inLanguage": lang,
            "mainEntityOfPage": {"@id": f"{self_url}#page"}, "image": {"@id": f"{self_url}#frame"},
            "author": pub, "publisher": pub, "isAccessibleForFree": True,
            "about": wing["about"],
        },
        {
            "@type": "BreadcrumbList", "@id": f"{self_url}#crumbs",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Museum of Ages", "item": home},
                {"@type": "ListItem", "position": 2, "name": wing["name"][lang],
                 "item": f"{ORIGIN}/{wing['page'][lang].strip('/')}/"},
                {"@type": "ListItem", "position": 3, "name": data["top"]["h1"], "item": self_url},
            ],
        },
        {
            "@type": "ImageObject", "@id": f"{self_url}#frame", "url": image_url, "contentUrl": image_url,
            "width": w, "height": h, "caption": f"{frame['title']}, {frame['what']}", "description": frame["alt"],
            "representativeOfPage": True, "creditText": "Museum of Ages",
            "copyrightNotice": "© ChipMates gemeinnützige GmbH",
            # Google's image metadata takes a Person or an Organization here, not the publisher's subtype
            "creator": {"@type": "Organization", "name": publisher["name"], "url": f"{ORIGIN}/"},
            "license": licence, "acquireLicensePage": rights,
        },
    ]
    if data["page"].get("published"):
        graph[3]["datePublished"] = data["page"]["published"]
    for block in data["blocks"]:
        if block["type"] == "faq":
            graph.append({
                "@type": "FAQPage", "@id": f"{self_url}#faq", "inLanguage": lang,
                "mainEntity": [{"@type": "Question", "name": item["q"],
                                "acceptedAnswer": {"@type": "Answer", "text": item["a"]}} for item in block["items"]],
            })
    text = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
    return text.replace("</", "<\\/")


# ---------- one page ----------

def page_path(data, wing, lang):
    """A search page stands one step below its wing's page."""
    return f"{wing['page'][lang].strip('/')}/{data['page']['slug'].strip('/')}"


def render(page, lang, data, shared, out_root):
    parts, labels, wing = shared["parts"], data["labels"], shared["wing"][page]
    other = "de" if lang == "en" else "en"
    path = page_path(data, wing, lang)
    depth = path.count("/") + 1
    root = "../" * depth
    urls = {code: f"{ORIGIN}/{page_path(shared['data'][page][code], wing, code)}/" for code in LANGS}
    pics = Pictures(data["pics"], shared["pic_folders"], root)
    twin = root + page_path(shared["data"][page][other], wing, other) + "/"
    door = wing["door"][lang]
    chrome = site_chrome(shared["chrome_pages"], lang, root, twin, door)
    names = Names(shared["names"], wing["name"][lang], lang)
    rich = names.mark

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
        "href.enter": esc(door),
        "svg.arrow": chrome["arrow"],
    }
    base = dict(href)
    base.update({f"labels.{k}": rich(v) for k, v in labels.items()})
    base["page.id"] = esc(data["page"]["id"])
    base["wing.name"] = rich(wing["name"][lang])

    def words(entry):
        """Every sentence of a block or an entry as HTML. An id is an attribute and stays plain."""
        return {k: esc(v) if k in ("id", "type") else rich(v) for k, v in entry.items() if isinstance(v, str)}

    def rows_html(rows):
        return "\n".join(fill(parts["row"], {"label": rich(labels[r["k"]]), "v": rich(r["v"])}) for r in rows)

    def term_rows(rows):
        return "\n".join(fill(parts["term_row"], {"term": rich(r["term"]), "text": rich(r["text"])}) for r in rows)

    def figure(pic):
        """A plate with its label. A plate that says nothing of its own carries the page's usual line."""
        if not pic:
            return ""
        values = dict(base)
        values.update({"html.picture": pics.picture(pic["pic"], esc(pic["alt"])),
                       "tag": rich(labels[pic["tag"]]), "what": rich(pic.get("what") or labels["plate_what"])})
        return fill(parts["figure"], values)

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
            values["html.items"] = "\n".join(
                fill(parts["faq_item"], {"q": rich(i["q"]), "a": rich(i["a"])}) for i in block["items"])
        elif kind == "sources":
            values["html.holders"] = "\n".join(
                fill(parts["holder"], {"name": rich(h["name"]), "place": rich(h["place"]), "text": rich(h["text"])})
                for h in block["holders"])
            values["html.notes"] = "\n".join(fill(parts["note"], {"text": rich(n)}) for n in block["notes"])
            values["html.editions"] = editions(block["editions"])
        elif kind == "close":
            values.update({"door.text": rich(block["door"]["text"]), "door.note": rich(block["door"]["note"])})
        return fill(parts[f"block:{kind}"], values)

    blocks = "\n\n".join(block_html(b) for b in data["blocks"])
    toc = "\n".join(fill(parts["toc_item"], {"id": esc(b["id"]), "nav": rich(b["nav"])})
                    for b in data["blocks"] if b.get("nav"))

    # The wing's name stays on one line in the h1. Where it is long the h1 is set smaller on a
    # phone, and a name too long for any line may wrap between its words.
    h1, run = data["top"]["h1"], names.wing_run(data["top"]["h1"])
    h1_class = "" if run <= KEEP_WHOLE else ' class="sp-h1--long"' if run <= KEEP_SMALL else ' class="sp-h1--wrap"'

    frame = data["top"]["frame"]
    og = data["page"]["og_image"]
    values = dict(base)
    values.update({
        "lang": lang,
        "og_locale": "en_GB" if lang == "en" else "de_DE",
        "meta.title": esc(data["meta"]["title"]),
        "meta.description": esc(data["meta"]["description"]),
        "meta.og_title": esc(data["meta"]["og_title"]),
        "meta.og_image_alt": esc(data["meta"]["og_image_alt"]),
        "url.self": urls[lang], "url.en": urls["en"], "url.de": urls["de"],
        "url.og_image": f"{ORIGIN}/{STATIC}/img/{og['file']}",
        "og.width": str(og["width"]), "og.height": str(og["height"]),
        "css.inline": shared["css"],
        "css.faces": faces(root) + focus_rule(frame),
        "html.preload": pics.preload(frame["pic"]),
        "html.theme": f'<meta name="theme-color" content="{chrome["theme"]}">\n' if chrome["theme"] else "",
        "html.header": chrome["header"],
        "html.footer": chrome["footer"],
        "attr.h1": h1_class,
        "top.h1": names.mark(h1, wrap_wing=run > KEEP_SMALL),
        "top.answer": rich(data["top"]["answer"]),
        "top.frame.title": rich(frame["title"]),
        "top.frame.tag": rich(labels[frame["tag"]]),
        "top.frame.what": rich(frame["what"]),
        "html.frame_picture": pics.picture(frame["pic"], esc(frame["alt"]), first=True),
        "top.door.text": rich(data["top"]["door"]["text"]),
        "top.door.note": rich(data["top"]["door"]["note"]),
        "top.door.leads": rich(data["top"]["door"]["leads"]),
        "html.toc": toc,
        "html.blocks": blocks,
        "jsonld": jsonld(lang, data, urls, pics, chrome["publisher"], wing, chrome["licence"], chrome["rights"]),
    })
    text = with_policy(fill(parts["page"], values))
    files = {f"img/{f}": pics.find(f) for name in sorted(pics.used) for f in pics.files(name)}
    files[f"img/{og['file']}"] = pics.find(og["file"])
    return out_root / path / "index.html", text, files


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
        loose = shown_text(re.sub(r'<span class="(?:nw|nh|nw nh)"[^>]*>[^<]*</span>', " ", own))
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
    if len(re.findall(r'data-slot="door-', text)) < 1:
        problems.append(f"{name}: no door carries its hook")
    return problems


def links_report(path, text, out_root, site_built, wing):
    """Every link of a built page with where it leads: this folder, the built site, the wing, or outside."""
    rows = []
    wing_pages = {wing["page"][code].strip("/") for code in LANGS}
    for ref in sorted(set(re.findall(r'<a\b[^>]*\bhref="([^"]+)"', text))):
        target = html.unescape(ref)
        if target.startswith("#"):
            rows.append((ref, "on the page"))
        elif re.match(r"https?://", target):
            rows.append((ref, "outside the site, not checked from here"))
        elif re.fullmatch(DOOR_SHAPE, target):
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

def build_pages(out_dir, site_src=SITE_SRC, site_built=SITE_BUILT, pages=PAGES, quiet=False):
    """Builds every page into out_dir with the files it uses under out_dir/static/.
    Returns the list of written pages. Raises SystemExit with the problems when a rule is broken."""
    out_dir, site_src, site_built = Path(out_dir), Path(site_src), Path(site_built)
    parts = parts_of((HERE / "template.html").read_text(encoding="utf-8"))
    data = {p: {lang: json.loads((HERE / f"{p}.{lang}.json").read_text(encoding="utf-8")) for lang in LANGS} for p in pages}
    wings = {k: v for k, v in json.loads(WINGS_FILE.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    names = json.loads(NAMES_FILE.read_text(encoding="utf-8"))["names"]

    def kept(page, lang):
        return Names(names, wing[page]["name"][lang], lang)

    problems, wing = [], {}
    for page, both in data.items():
        a, b = both["en"], both["de"]
        if a["page"].get("wing") != b["page"].get("wing"):
            raise SystemExit(f"{page}: the two languages name different wings")
        wing[page] = wing_of(page, a, wings)
        for lang in LANGS:
            problems += lint(page, lang, both[lang], wing[page], kept(page, lang))
        if shape({k: v for k, v in a.items() if k != "page"}) != shape({k: v for k, v in b.items() if k != "page"}):
            problems.append(f"{page}: the two languages do not hold the same structure")
        if a["pics"] != b["pics"] or a["page"]["id"] != b["page"]["id"] or a["page"]["og_image"] != b["page"]["og_image"]:
            problems.append(f"{page}: the two languages differ in pictures or in the page label")
        for x, y in zip(a["blocks"], b["blocks"]):
            if x["type"] != y["type"] or x["id"] != y["id"]:
                problems.append(f"{page}: block {x['id']} and {y['id']} do not match")
    for name in OWN_CSS:
        body = re.sub(r"/\*.*?\*/", "", (HERE / "css" / f"{name}.css").read_text(encoding="utf-8"), flags=re.S)
        if re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(", body):
            problems.append(f"css/{name}.css: a colour is written outside the site's token file")
    if problems:
        raise SystemExit("\n".join(problems))

    site = site_parts(site_src, site_built)
    shared = {
        "parts": parts, "data": data, "site_built": site_built, "chrome_pages": site["pages"], "wing": wing,
        "names": names,
        "css": css_min(*[site["css"] / f"{n}.css" for n in CSS_BEFORE], *[HERE / "css" / f"{n}.css" for n in OWN_CSS],
                       *[site["css"] / f"{n}.css" for n in CSS_AFTER]),
        "pic_folders": [PICS, site_built / STATIC / "img"],
    }

    # the two faces travel with their licence files
    fonts = site["fonts"]
    files = {f"fonts/{f.name}": f for f in [fonts / "cardo-400.woff2", fonts / "marcellus-400.woff2", *fonts.glob("LICENSE*")]}
    built = []
    for page in pages:
        for lang in LANGS:
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
            data = json.loads((HERE / f"{page}.{lang}.json").read_text(encoding="utf-8"))
            print(f"{page}.{lang}")
            print(f"  title       {len(data['meta']['title']):3}  {data['meta']['title']}")
            print(f"  description {len(data['meta']['description']):3}  {data['meta']['description']}")
            print(f"  h1          {len(data['top']['h1']):3}  {data['top']['h1']}")
            print(f"  answer      {len(data['top']['answer']):3}")
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
