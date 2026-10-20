#!/usr/bin/env python3
"""Builds the whole site from the registry, the wings' data files, the word files and the templates.

    python3 _src/build.py                build dist/, run every check, then build the topic pages into it
    python3 _src/build.py --test         build the four test registries into _test/<name>/ (never into dist/)
    python3 _src/build.py --test three   one of them
    python3 _src/build.py --switches     build every other state of the switches below into _test/switch-<name>/

A new wing is one entry in registry.json, one data file per language in wings/ and its pictures in
_src/img/, listed in fetch-list.json. A wing with a picture index has a facts file beside them (wings/<wing>.facts.json): every number,
name, size and holder of its page is read from there, and the build compares that file with the wing's inventory.
No template, style sheet or script names a wing. The build stops, and says why, when an open wing lacks a key, a
picture or a word. Standard library only.
"""
import copy
import hashlib
import html
import importlib.util
import json
import math
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

import ask
import buildlib
import languages
import placed
import render as R
from buildlib import (ARROW, BANNED, CSP_MARK, FACES_SCRIPT, LANG_FACES, LOOSE_PAIR, NBSP, NNBSP, REST_SCRIPT, WORDS, bind, css,
                      dump, esc, faces, fill, flatten, grain, keep_whole, number, number_word, shown_text, space, tail,
                      whole_names, hold_names, held, day_month, with_policy, LD_BLOCK, free_pictures_of, image_objects, licence_problems, picture_terms,
                      with_picture_rights)

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent
# The repository's root: the museum app stands beside this folder, in museum/.
REPO = ROOT.parent
SITE = ROOT / "dist"
TEST_OUT = ROOT / "_test"
# The pictures the pages serve and the film's music are not part of the repository: fetch-list.json names each file
# the build needs, tools/fetch.py fetches them into img/ and media/ (tools/make_images.py cuts them where the film's
# stills are at hand), and the build stops when one is missing. The fonts are kept here.
IMG = SRC / "img"
FONTS = SRC / "fonts"
FETCH_LIST = SRC / "fetch-list.json"
# The checks that read a file outside this folder (the museum app, the wing's inventory) run where it is there.
# Where it is not, the build says once which check it skipped and why.
SKIPPED = []
ORIGIN = "https://museumofages.org"
# The languages, from languages.json: LANGS are built and checked, LISTED are live.
L = languages.Languages()
if L.problems:
    raise SystemExit("\n".join(L.problems))
LANGS, LISTED = L.built, L.listed
# True: every page says noindex and robots.txt closes the site. For a hidden test address.
HIDDEN = False
# The line on every page's first screen that says whose project the museum is (project.line). It is temporary:
# False takes it off every page, and that is the one change. PROJECT_LINE_AT is where it stands while it is on:
# "under" the bar or "over" it. Either way it leaves the screen with the page, and the bar stays.
PROJECT_LINE = False
PROJECT_LINE_AT = "under"
# The rule that tells a first screen the line is there (its height is --by-h in base.css).
BY_RULE = ":root{--by:var(--by-h)}"
# The link to the source code. False while the repository is not public: no page links to it, the host forwards
# nothing, and the page about the museum says page_what.s6_before instead of page_what.s6_p.
SOURCE_LINK = True
# The folder of the static pages' own files. The museum app owns /assets/.
STATIC = "static"
# The museum's sign: its drawing's files are set as they are and never edited, so the build checks their hashes.
SIGN = SRC / "sign"
SIGN_FILES = {
    "tab.svg": "3786880aa48892fac655dec3d949e1bb22e440e7a77233aa0ea70ef9f9a3cca1",
    "app.svg": "6e6c75c75567b75391880d29172a65a63b9a46600d95ce5f458093167c23debd",
    "lockup-wall.svg": "f8a08486f1810c4dedc9dc98fd0d8abb6634219013ece8aaf86fe633c34ee618",
    "lockup-wall-name.svg": "19c2881e102c00541267154b3e3755cf1ab0c28c75973d08f9ccd0d5b99ce365",
}
# The drawing by its rule of sizes: the header's slot beside the name and the small line takes the master on 32,
# a place with the name alone the cut on 24. Each is read from the lockup it stands in, in px.
SIGN_CUTS = {"block": ("lockup-wall.svg", 32), "name": ("lockup-wall-name.svg", 24)}
# What every page names in static/sign/: the tab's own cut on 16, its picture at 32 for a browser that takes no
# SVG icon, at 96 for search results (a multiple of 48 px), and a phone's home screen. The pictures are made by
# tools/make_icons.py (icons.json records from what).
ICONS = (("icon", 'sizes="32x32" type="image/png"', "tab-32.png", 32), ("icon", 'sizes="96x96" type="image/png"', "tab-96.png", 96),
         ("icon", 'type="image/svg+xml"', "tab.svg", None),
         ("apple-touch-icon", "", "home-180.png", 180))
# The publisher's logo in the structured data: the home screen's picture of the sign (search asks for 112 px at least).
PUBLISHER_LOGO = "home-180.png"
# The empty icon the topic pages' own template carries: the build sets the site's icons in its place.
EMPTY_ICON = '<link rel="icon" href="data:,">'
# The museum app's own list of wings: an open wing's slug must stand in it. Read only, and only where it is there.
APP_WINGS = REPO / "museum" / "src" / "wings" / "registry.ts"
# The museum app's shell (read only): the four grade colours the site's tokens mirror (--ui-sure-*).
APP_SHELL = REPO / "museum" / "index.html"
# The tool that cuts the pictures: it knows the film frame each picture comes from, and the frames of the second
# rights tier. A frame stands once across the museum's page and a wing's page, whatever its picture's name.
IMAGE_JOBS = SRC / "tools" / "make_images.py"
# The topic pages' build (read only: it has its own checks) and the privacy page's words.
PAGES_BUILD = ROOT / "pages" / "build.py"
PRIVACY_WORDS = SRC
# The museum's own texts are copies of a wing's words. The file names the files they must stand in word for word,
# by their paths from the repository's root.
MUSEUM_TEXTS = SRC / "museum-texts.json"
# The one place the "Source code" link is set (while SOURCE_LINK is on): an address of the site itself, which the
# host forwards (_redirects).
SOURCE = "/source"
SOURCE_TO = "https://github.com/chipmates/museumofages"
# The museum's own count (../functions/): every page that has a kind carries the count's script with that kind,
# every way into the walk names its place, and the function checks each row against lists written here from the
# registry, so the function and the site cannot name different pages, wings or stops.
COUNT_SCRIPT = "count.js"
COUNT_LISTS = ROOT / "functions" / "_count" / "lists.js"
COUNT_KINDS = {"home": "home", "what": "statement", "privacy": "privacy", "imprint": "imprint"}
DOOR_PLACES = ("top", "item", "end")
# IndexNow: the key a search engine fetches from the site's root to trust our pings (public by design).
INDEXNOW_KEY = "f8c88732c7bce7f2bf169a1877ed44e2"
# Where the host runs the functions: every address but the files of the pages and of the walk's bundle, so a
# picture or a script never costs a function's run. The count's edge needs the pages, the count its own route.
ROUTES = {"version": 1, "include": ["/*"], "exclude": [f"/{STATIC}/*", "/assets/*", "/basis/*", "/favicon.svg", "/sitemap.xml",
                                                       "/robots.txt", f"/{INDEXNOW_KEY}.txt", "/na-manifest.json",
                                                       "/third-party-licenses.md"]}
# The licence of the museum's own texts and pictures, named in the footer once the code is open.
CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/"
# The statement page's section on reusing the museum's own pictures: the footer's licence line links it, and each of
# those pictures names it in the page's structured data as the page that tells how to license it.
USE_PICTURES = "use-our-pictures"
# The address a visitor writes to, on every page that names one. No built file may carry any other address.
MAIL = "contact@museumofages.org"
MAIL_SHAPE = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}"
WHAT_DIR = {c: e["slugs"]["what"] for c, e in L.entries.items()}
IMPRINT_DIR = {c: e["slugs"]["imprint"] for c, e in L.entries.items() if e["slugs"]["imprint"]}
PRIVACY_DIR = {c: e["slugs"]["privacy"] for c, e in L.entries.items()}
STATES = ("open", "making", "planned")
# The palette's rule for a wing: the depth of its wall, and one note inside these bounds.
WALLS = {"deep": "var(--ground-wall)", "wall": None, "lifted": "color-mix(in srgb,var(--ground-lit) 84%,var(--ink))"}
NOTE_L, NOTE_C = (0.46, 0.62), (0.075, 0.126)
# A door may name the film release, so the wing's early door shows the first still before the app arrives.
DOOR_SHAPE = r"/w/[a-z0-9-]+(?:\?(?:film=[a-z0-9-]+&)?lang=[a-z]{2}(?:-[a-z]{2})?)?"
# Keys that exist in one language only: the German legal notice carries the organisation's own notes.
ONE_LANGUAGE = {
    "de": {"imprint.content_h", "imprint.content_p", "imprint.links_h", "imprint.links_p", "imprint.copy_h", "imprint.copy_p",
           "imprint.copy_p_before"},
    "en": {"imprint.s8_p", "imprint.s8_link"},
}
# A language without a legal notice of its own lacks the words of that page. The details the footer and the page
# about the museum show stay. It carries one line instead, which leads to the English legal notice.
IMPRINT_PAGE = r"^imprint\.(?!(?:street|city|country|register_court|register_no|rep_name|email)$)"
NO_IMPRINT = {"footer.imprint_elsewhere"}
# Keys only English and German carry: the short link to the other one, while they are the only two listed.
TWO_ONLY = {"a11y.lang_switch"}
# The slot of the line that says a language's words were translated with AI and read by no person yet: only a
# language whose status is ai carries it, and it is exempt from the rule that says once how the words are made.
AI_TAG = "ai.tag"
# The locked lines of each language, word for word, from its approved file (lang/<code>.locked.json). A language
# without one is built, never listed. The tagline is two texts in two sizes: the line, and the note under it.
LOCKED_KEYS = ("tagline", "tagline_note", "trust", "trust_before", "descriptor", "title", "mission", "purpose", "project", "grades",
               "made", "honesty")


TRUST_KEYS = ("glance.trust", "page_what.trust")


def trust_breaks(text, key):
    """A trust line breaks only after a dot, and a short word (three letters or fewer) stays with its neighbour."""
    if key not in TRUST_KEYS:
        return text
    parts = [re.sub(r"(?<!\S)(\S{1,3}) (?=\S)", "\\1" + NBSP, p) for p in text.split(" · ")]
    parts = [re.sub(r"(\S) (\S{1,3})$", "\\1" + NBSP + "\\2", p) for p in parts]
    return (NBSP + "· ").join(parts)


def locked_lines():
    out = {}
    for code in L.order:
        path = languages.LANG_DIR / f"{code}.locked.json"
        if path.is_file():
            lines = {k: v for k, v in json.loads(path.read_text(encoding="utf-8")).items() if not k.startswith("_")}
            if set(lines) != set(LOCKED_KEYS) or len(lines["grades"]) != 4:
                raise SystemExit(f"lang/{path.name}: an approved file holds every locked line ({', '.join(LOCKED_KEYS)}), four grades")
            lines["grades"] = tuple(lines["grades"])
            out[code] = lines
    return out


LOCKED = locked_lines()


# The house's words for open source (each language adds its own in lang/<code>.json), and the one place that may say
# them while the repository is closed: the licence is an open source licence, whoever can read the code.
OPEN_WORD = r"open[ -]source|quelloffen"
OF_THE_LICENCE = r"open[ -]source[ -]?(?:licen[cs]e|lizenz)"


def lang_rules():
    """Each language's own rows of the house rules, its number words, and what it adds to bind() (lang/<code>.json)."""
    out = {}
    for code in L.order:
        path = languages.LANG_DIR / f"{code}.json"
        data = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        out[code] = {"never": [tuple(x) for x in data.get("never", [])], "for_the_writer": [tuple(x) for x in data.get("for_the_writer", [])],
                     "gone": tuple(data.get("gone", [])), "banned": list(data.get("banned", [])),
                     # the trust line's middle term, and the language's own words for open source beside the house's
                     "trust_middle": data.get("trust_middle", "Open Source"),
                     "open_word": OPEN_WORD + ("|" + data["open_word"] if data.get("open_word") else ""),
                     "of_the_licence": OF_THE_LICENCE + ("|" + data["of_the_licence"] if data.get("of_the_licence") else "")}
        if data.get("number_words"):
            WORDS[code] = list(data["number_words"])
        buildlib.MORE[code] = {k: list(data[k]) for k in ("units", "stop") if data.get(k)}
    return out


RULES = lang_rules()
# Listed means live: a listed language needs its approved locked lines.
if [c for c in LISTED if c not in LOCKED]:
    raise SystemExit("languages.json lists " + ", ".join(c for c in LISTED if c not in LOCKED) + " without approved locked lines "
                     "(lang/<code>.locked.json): a language is listed only with them, and built until then")


def many(lang):
    """From three languages on a page, the bar offers them behind one control and the menu and the footer list them
    all. With English and German alone, the bar keeps its one short link."""
    return len(L.shown(lang)) > 2 or set(L.shown(lang)) != {"en", "de"}


# While the link to the code is off, the repository is closed and no page says the code is open. The trust line
# then stands without its middle term, and each of these slots gives way to its twin, <key>_before.
BEFORE = ("page_what.m_bar_3_text", "imprint.copy_p")
# A decided line is read for the forbidden signs only: its wording is fixed above, word for word.
DECIDED = ("project.line",)
# Slots that may stand empty: the page then shows nothing in their place and leaves no gap. The lead under "What
# this museum is", a second line under one of a wing's numbers, the page's own key in front of a stop's age, the
# credit of one slide of a piece, the note on terms under the example stop.
MAY_BE_EMPTY = r"^what\.lead$|^visit\.terms$|^wing:numbers\.\d+\.text$|^wing:.*\.age_k$|^wing:.*\.frames\.\d+\.src$"
# Short sentences that end a paragraph begun by another slot: their last words are bound like a paragraph's.
ENDS = ("what.i4_pays", "page_what.s5_pays")
# The rule every page carries for short last lines on a phone (base.css), as the build writes it.
PHONE_LINES = "p,dd,li,.label__what,.label__src{text-wrap:balance}"
# A number before the word for the museum's wings, in a figure or in a word: no page counts them. The words after
# it keep a machine's two wings and a gate's two leaves (German: Flügel) out of the rule.
SOME = r"(?:\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwanzig|dreißig)"
# The rule that says once how the words are made: the slot of a translated language's own line is exempt (AI_TAG).
MADE_ONCE = r"with the help of ai|mithilfe von ki|written with ai, checked|mit ki geschrieben"
# Statements no page may make, whatever wing it is about. A wing's own rules stand in its registry entry (never_say).
# They are read against every sentence of the word files and of the wings' data, and against every built page.
NEVER = [
    (r"\blobby\b|\bfoyer\b", "there is no lobby: a wing ends under its stars"),
    (r"eclipse|sonnenfinsternis|\bfinsternis\b", "there is no eclipse"),
    (SOME + r" (?:open |more |new |further )?wings (?:are|were|will|open|planned|in the making|to come)\b|"
     + SOME + r" (?:offene |weitere |neue )?flügel (?:sind|waren|werden|offen|geöffnet|geplant|im entstehen|entstehen|folgen)\b|"
     r"\bthirty (?:wings|are)\b|dreißig (?:flügel|sind)\b", "no page names a number of wings"),
    (r"(every|each|a) wing tells (a|one) life|(jeder|ein) flügel erzählt ein leben", "a wing is one place at one moment, not always a life"),
    (r"every wing ends|jeder flügel endet", "say what one wing does, not what every wing does"),
    (r"from (an )?open sources?|open sources\b|offenen quellen|offener quelle", "never say every image comes from an open source"),
    (r"public list|öffentliche liste", "the list is published with the museum"),
    (MADE_ONCE, "how the words are made is said once, on the page about the museum"),
    (r"second check|zweite prüfung|zweiten prüfung", "the sentence about a second check is gone"),
    (r"nothing records|nichts belegt", "say no record is known"),
    (r"stands at|steht am", "no sentence places a wing at a real place"),
    (r"photograph(s)? of (a |works)|fotografien gemeinfreier", "say reproductions"),
    (r"further reading|weiterführende", "further reading is not built yet"),
    (r"\bprivate\b|\bprivat\b", "never Private"),
    (r"twenty-nine|neunundzwanzig", "no sentence promises a number of wings"),
    (r"\b(der|des|dem) chipmates\b", "the company's name is not bent: build the sentence so it stands in the nominative"),
    # the topic's name (Barrierefreiheit) and the standard's kind (barrierefreie Websites) may stand: neither says the site is so
    (r"barrier-free|\bbarrierefrei\b|\bbarrierefreie[rsnm]? (seite|website|museum|flügel|rundgang|film)\b"
     r"|\b(is|are) (fully |now )?accessible\b|\bist (vollständig |jetzt )?zugänglich\b",
     "no page says the site is barrier-free or accessible as a fact: the aim may be named"),
]
# Wording that still wants a change. The build names it and passes: a note on the words, not a failure.
FOR_THE_WRITER = [
    (r"historical figures|historischen persönlichkeiten", "a description says historical figures"),
    (r"true scale|wahrem maßstab", "a description says true scale"),
]
# Lines of an earlier state that no built page may carry, whoever built it.
GONE = ("The privacy notice for this site is being written.", "Die Datenschutzerklärung für diese Website wird gerade geschrieben.",
        "ec.europa.eu/consumers/odr", "Written with AI, checked by us.", "Mit KI geschrieben, von uns geprüft.",
        "A reconstruction says so, a type stays a type, nothing is his that is not.",
        "Eine Rekonstruktion heißt Rekonstruktion, ein Typus bleibt ein Typus, und nichts gilt als das Seine, was es nicht ist.")
# Of the statements above, those that every built page is read for once more, the topic pages included.
ON_EVERY_PAGE = NEVER[:5]
# Length limits in characters, first match wins, set for German at 320 px. Paths of a wing's data file start with "wing:".
# A trust line breaks only after a dot (trust_breaks), so it may run to three short rows.
LIMITS = [
    (r"^film\.(title|watch)$", 28), (r"^film\.(pause|play|sound_on|sound_off)$", 20), (r"^film\.music$", 140),
    (r"(^|:)meta\.title$|page_what\.title$|imprint\.title$", 76), (r"description$", 180), (r"alt$", 300), (r"alt_each$", 90),
    (r"a11y\.lang_switch$", 8), (r"a11y\.", 40), (r"brand\.descriptor$", 20), (r"project\.line$", 48), (r"nav\.enter$|hero\.enter$", 20), (r"nav\.", 22),
    (r"hero\.name$", 14), (r"hero\.tagline_", 60), (r"hero\.entry_note$", 30), (r"hero\.what_link$", 26),
    (r"today\.", 70), (r"glance\.f\d_term$", 18), (r"glance\.f\d_text$", 56), (r"glance\.publisher$", 120), (r"trust$", 84),
    (r"wings\.heading$|visit\.heading$|closing\.heading$|wingpage\.(holds_h|more_h)$", 32), (r"wings\.lead$", 110), (r"wings\.now$", 80),
    (r"wings\.(to_page|making_h|planned_h)$", 24), (r"wingpage\.(seeit|more_originals)$", 28), (r"wingpage\.more_", 130),
    (r"wingpage\.sizes_note$", 60), (r"wingpage\.", 28), (r"class\.", 28),
    (r"stop\.(heading|sources_h)$", 32), (r"visit\.terms$", 160), (r"stop\.(from_k|l\d_k)$", 44), (r"sure\.h$", 24), (r"sure\.text$", 150), (r"closing\.p$", 120),
    (r"label\.", 38), (r"page_what\.honesty$", 40), (r"page_what\.s2_four_\d$", 20), (r"page_what\.s2_four_\d_text$", 130),
    (r"page_what\.who_role$", 90), (r"page_what\.m_(h|role_h|bar_h|not_h)$", 32), (r"page_what\.m_one$", 140),
    (r"page_what\.m_role_\d$", 90), (r"page_what\.m_bar_\d_text(_before)?$", 110), (r"page_what\.m_close_em$", 40),
    (r"page_what\.s3_link$", 60), (r"what\.i4_pays$|page_what\.s5_pays$", 90), (r"_term$", 26), (r"footer\.(what|privacy|imprint|source|enter)$", 24),
    (r"imprint\.(content|links|copy)_p(_before)?$", 1100),
    (r"wing:first\.lede$", 200), (r"wing:(first|landing)\.piece\.title$|wing:.*\.piece\.title$", 44),
    (r"wing:first\.piece\.(what|beats\.\d)$", 34), (r"wing:landing\.piece\.what$", 76), (r"wing:.*beats\.\d$", 64),
    (r"wing:card\.what$", 70), (r"wing:.*\.kind$", 30), (r"wing:(rooms|holds\.groups)\.\d+\.h$", 32),
    (r"wing:(rooms|holds\.groups)\.\d+\.note$|wing:end\.note$", 34),
    (r"wing:.*plates\.\d+\.title$|wing:end\.(plate|sky)\.title$|wing:.*stage\.title$|wing:landing\.close\.title$", 40),
    (r"wing:.*\.names\.[\w-]+$", 34), (r"wing:.*\.terms$", 240), (r"wing:.*\.close\.intro$", 300), (r"wing:.*\.source$", 160),
    (r"wing:.*piece\.(tag_a|tag_b|pause|play)$", 20), (r"wing:.*piece\.(hint|slider_label|canvas_label)$", 90),
    (r"wing:.*quote\.from$", 44), (r"wing:.*\.age$", 60), (r"wing:.*\.age_k$", 24), (r"wing:numbers\.\d+\.num$", 16),
    (r"wing:.*\.src$", 290), (r"wing:.*\.what$", 190), (r"wing:.*\.key\.(full|quiet)$", 150),
    (r"wing:.*\.p\.\d+$|wing:end\.p$|wing:.*field\.p$", 490), (r"wing:.*rows\.\d+\.k$", 32), (r"wing:.*rows\.\d+\.v$", 190),
    (r"wing:.*places\.\w+$|wing:.*lists\.\d+\.h$", 28), (r"wing:holds\..*\.(after|unit)$", 14), (r"wing:.*\.(still|no_sheet)$", 60),
    (r"wing:numbers\.\d+\.term$", 22), (r"wing:numbers\.\d+\.text$", 110), (r"wing:out\.line$", 130), (r"page_what\.s6_p$", 460),
    # the note on our pictures keeps its first and third paragraphs whole, as written (German runs to 471)
    (r"page_what\.use_p[13]$", 480), (r"", 420),
]
# A showpiece's one clip is fetched after the page has loaded, on a phone's connection too.
CLIP_MAX = 1_500_000
# What an open wing's entry and its data file must hold.
WING_KEYS = ("collection", "state", "name", "page", "door", "dates", "shows", "when", "pictures", "wall", "note", "topics",
             "about", "never_say", "claim_phrase")
# What is no sentence in a wing's data file: names of pictures and scripts, cuts, the names of other keys.
# A quote's own credit (quote.from) is words; every other "from" names the list a group reads.
NOT_WORDS = r"(^_|\.pic\.|\.crop\.|\.focus\.|\.loads\.\d+$|(?<!\.quote)\.from$|\.(id|form|show|n|stop|holder|count|script|clip|name|lang|hang|lamp|href|src_to|grade)$)"
# The running text of a wing's data: a paragraph's last words are kept together, and a wing's name is never broken.
PROSE = r"(^|\.)(p(\.\d+)?|lede|what|src|text|v|intro|line|terms|after|lead|stills|source)$"
# A key of the site's words that holds running text (a paragraph's _p, a line, a note): there a long name holds its
# last words (hold_names); a heading, a button or a label keeps it whole.
RUNNING_KEY = r"(^|[._])(p\d*|lede|lead|what|text|line|note|intro|after|src|terms|source|stills)$"


def person_names(lang):
    """The persons' names of three or more words in the pages' names files (pages/names.json and its language's own)."""
    files = [SRC.parent / "pages" / "names.json", SRC.parent / "pages" / f"names.{lang}.json"]
    return sorted({e["text"] for f in files if f.is_file() for e in load(f)["names"] if e.get("person") and len(e["text"].split()) >= 3},
                  key=len, reverse=True)
# Where a wing's sentence may carry digits: a credit line, a shelf mark, the explanation of a leaf number, the
# rows that quote what a sheet gives, and a model's spoken name (it says 3D).
DIGITS_OK = r"\.(src|source|terms|canvas_label)$|\.close\.rows\.\d+\.v$"
DATA_KEYS = ("meta.title", "meta.description", "meta.share_alt", "first.lede", "first.piece.title", "first.piece.kind",
             "first.piece.what", "first.piece.alt", "card.kind", "card.what", "card.alt", "intro.p", "stop.title",
             "stop.stage.title", "stop.stage.alt", "end.h", "end.p")


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def local_imprint():
    """The legal notice's details the repository leaves out, from the nearest .museum-local.json at or above the
    site (git ignores it): {"imprint": {"rep_name": "..."}}. Without one, the word files' placeholders show."""
    for folder in (SRC, *SRC.parents):
        if (folder / ".museum-local.json").exists():
            return load(folder / ".museum-local.json").get("imprint") or {}
    return {}


def skip(why):
    if why not in SKIPPED:
        SKIPPED.append(why)


def outside_files():
    """Every file the build needs that the repository does not keep, by its path in this folder."""
    return [ROOT / f["path"] for f in load(FETCH_LIST)["files"]]


def check_outside():
    listed = outside_files()
    missing = [p for p in listed if not p.is_file()]
    if missing:
        raise SystemExit(f"{len(missing)} of the {len(listed)} pictures and media files the build needs are not here "
                         f"(the first: {missing[0].relative_to(ROOT)}). The repository does not keep them: run "
                         f"python3 site/_src/tools/fetch.py from the repository's root to fetch them from {ORIGIN}, or "
                         "site/_src/tools/make_images.py to cut them where the film's stills are at hand.")


def museum_missing(site):
    """The first of the wing's own files under _from that is not there, or None. A merged record that holds
    only this checkout's records counts as not there: a dev server without a store wrote it, and the texts
    the museum quotes from the store's records are not in it."""
    for f in site.museum.get("_from", []):
        if not (REPO / f).exists():
            return f
        if f.endswith("na-manifest.json") and checkout_only(REPO / f):
            return f
    return None


def checkout_only(path):
    """True when every record of a merged na-manifest.json came from this checkout's own assets/."""
    try:
        assets = json.loads(path.read_text(encoding="utf-8")).get("assets", [])
    except (OSError, ValueError, AttributeError):
        return False
    return bool(assets) and all(a.get("origin") == "app" for a in assets)


def walk(obj, fn, path=""):
    """A copy of obj with fn(path, text) applied to every string."""
    if isinstance(obj, dict):
        return {k: walk(v, fn, f"{path}.{k}" if path else k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [walk(v, fn, f"{path}.{i}") for i, v in enumerate(obj)]
    return fn(path, obj) if isinstance(obj, str) else obj


def strings(obj):
    out = {}
    walk(obj, lambda p, t: out.__setitem__(p, t))
    return out


def shape(obj):
    if isinstance(obj, dict):
        return {k: shape(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [shape(v) for v in obj]
    return "words" if isinstance(obj, str) else obj


def oklch(value):
    r, g, b = (int(value[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = lin(r), lin(g), lin(b)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            math.hypot(1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s))


# Bulgarian sets about 15 percent wider than German in its face: its limits are the German ones divided by this.
# The museum's name is the same Latin letters in every language.
WIDER = {"bg": 1.149}
SAME_WIDTH = r"^hero\.name$"


def limit_for(key, lang="en"):
    for pattern, limit in LIMITS:
        if re.search(pattern, key):
            return math.floor(limit / WIDER[lang]) if lang in WIDER and not re.search(SAME_WIDTH, key) else limit


class Ctx:
    """What a page's parts read: its language, its words, the registry, and how to link from where it stands."""

    def __init__(self, site, lang, here):
        self.__dict__.update(site.__dict__)
        self.site, self.lang, self.here = site, lang, here
        self.deed = L.entries[lang]["deed"]
        self.w, self.a, self.raw = site.words_html[lang], site.words_attr[lang], site.words[lang]
        self.wd = {slug: both[lang] for slug, both in site.data.items()}
        self.facts = site.facts
        depth = here.count("/")
        self.absolute = here.endswith("404.html")
        self.root = "/" if self.absolute else "../" * depth
        self.static = f"{self.root}{STATIC}/"
        self.held = site.held[lang]
        name = esc(hold_names(self.wings[self.newest]["name"][lang], self.held))
        self.today = tail(self.w["today.one" if len(self.open) == 1 else "today.many"].replace("{name}", name), short=True)

    def count(self, slug, name):
        """One number of a wing: from its facts file, or from its registry entry where it has none."""
        return self.site.count(slug, name)

    def to(self, address):
        """A link from this page to an address from the site's root ("" is the English front page)."""
        return (self.root + address) or "./"

    def addr(self, kind, lang=None):
        return L.page(lang or self.lang, kind)

    def elsewhere(self, kind):
        """A link to a page the language does not have (its legal notice) leads to the English one, and says so."""
        return ' hreflang="en"' if kind == "imprint" and not L.has_imprint(self.lang) else ""

    def collection(self, slug):
        return next(x for x in self.collections if x["slug"] == slug)

    def at(self, data, path):
        for step in path.split("."):
            data = data[int(step)] if step.isdigit() else data[step]
        return data


class Site:
    def __init__(self, registry, wing_dirs, pic_dirs, mark=None):
        # every built language's share of the registry: English and German in it, the others beside it
        self.problems = languages.merge_registry(registry, SRC, L)
        self.collections = registry["_collections"]
        self.wings = {k: v for k, v in registry.items() if not k.startswith("_")}
        self.open = [s for s, e in self.wings.items() if e.get("state") == "open"]
        self.mark, self.pics, self.notes = mark, R.Pics(pic_dirs), []
        self.newest = self.open[-1] if self.open else None
        self.written = {}
        for lang in LANGS:
            if not (SRC / f"words.{lang}.json").is_file():
                raise SystemExit(f"words.{lang}.json is missing: {lang} is built (languages.json) and has no words")
            self.written[lang] = flatten(load(SRC / f"words.{lang}.json"))
        # French punctuation takes its narrow spaces here, so every use of a sentence carries them
        self.words = {lang: {k: space(v, lang) if isinstance(v, str) else v for k, v in self.written[lang].items()} for lang in LANGS}
        self.imprint_local = local_imprint()
        for lang in LANGS:
            self.words[lang].pop("_note", None)
            for key, value in self.imprint_local.items():
                if f"imprint.{key}" not in self.words[lang]:
                    raise SystemExit(f'.museum-local.json names "imprint": "{key}", a detail the legal notice does not have')
                self.words[lang][f"imprint.{key}"] = value
        self.words_attr = {lang: {k: esc(v) for k, v in self.words[lang].items()} for lang in LANGS}
        # a name of several words never breaks, and no paragraph ends on a word alone
        self.names = {lang: sorted({e["name"][lang] for e in self.wings.values() if " " in e.get("name", {}).get(lang, "")}, key=len, reverse=True)
                      for lang in LANGS}
        # running text holds a long name by its last words (hold_names): the wing's name and a person's from names.json
        spelt = sorted({n for e in self.wings.values() for n in e.get("name", {}).values() if len(n.split()) >= 3}, key=len, reverse=True)
        self.held = {lang: self.names[lang] + [n for n in spelt + person_names(lang) if held(n)[0] and n not in self.names[lang]]
                     for lang in LANGS}
        self.words_html = {lang: {k: keep_whole(esc(trust_breaks(
            hold_names(tail(day_month(bind(v, lang), lang), short=k in ENDS), self.held[lang]) if re.search(RUNNING_KEY, k) else
            whole_names(tail(day_month(bind(v, lang), lang), short=k in ENDS), self.names[lang]), k))) for k, v in self.words[lang].items()} for lang in LANGS}
        if not SOURCE_LINK:
            for lang in LANGS:
                shown = self.words_html[lang]
                shown["glance.trust"] = shown["page_what.trust"] = keep_whole(esc(trust_breaks(space(self.locked(lang)["trust_before"], lang), "glance.trust")))
                shown.update({key: shown[key + "_before"] for key in BEFORE if key + "_before" in shown})
        self.privacy = {lang: walk(load(PRIVACY_WORDS / f"privacy.{lang}.json"), lambda p, t, l=lang: day_month(space(t, l), l)) for lang in LANGS}
        self.museum = load(MUSEUM_TEXTS)
        for lang in LANGS:
            # the museum's texts in a language the file does not hold: museum-texts.<code>.json beside it
            if lang not in self.museum and (SRC / f"{MUSEUM_TEXTS.stem}.{lang}.json").is_file():
                self.museum[lang] = load(SRC / f"{MUSEUM_TEXTS.stem}.{lang}.json")
        # a wing's words: as written (for the checks), with every number and quoted text filled in, and ready
        # for the page (escaped). Its facts file lies beside its two data files.
        self.data_written, self.data_raw, self.data, self.facts, self.facts_at, self.facts_file = {}, {}, {}, {}, {}, {}
        for slug in self.open:
            entry = self.wings[slug]
            name = entry.get("_data", slug)
            found = [d for d in wing_dirs if all((d / f"{name}.{lang}.json").exists() for lang in LANGS)]
            if not found:
                continue
            if (found[0] / f"{name}.facts.json").exists():
                self.facts_at[slug] = found[0] / f"{name}.facts.json"
                self.facts[slug] = load(self.facts_at[slug])
                self.facts_file[slug] = copy.deepcopy(self.facts[slug])
                # the facts' names and titles in another language: <wing>.facts.<code>.json beside it
                for lang in LANGS:
                    self.problems += languages.merge_leaves(self.facts[slug], languages.load_own(found[0], f"{name}.facts", lang), lang,
                                                            f"wings/{name}.facts.{lang}.json")
            self.data_written[slug] = {lang: load(found[0] / f"{name}.{lang}.json") for lang in LANGS}
            self.data_raw[slug] = {lang: walk(self.data_written[slug][lang], lambda p, t, s=slug, l=lang: self.filled(s, l, t) if
                                              re.search(NOT_WORDS, p) else space(self.filled(s, l, t), l)) for lang in LANGS}
            self.data[slug] = {lang: walk(self.data_raw[slug][lang], lambda p, t, l=lang: self.ready(p, t, l)) for lang in LANGS}
        self.wing_dirs = wing_dirs

    def locked(self, lang):
        """The language's locked lines, with the narrow spaces its punctuation takes. Empty while none are approved."""
        return {k: (space(v, lang) if isinstance(v, str) else v) for k, v in LOCKED.get(lang, {}).items()}

    def ready(self, path, text, lang):
        """A sentence of a wing as the page carries it: escaped, with its pairs bound (a number and its unit), and
        where it is running text, with its last words kept together and every wing's name whole."""
        if not re.search(NOT_WORDS, path):
            text = day_month(bind(text, lang), lang)
            if re.search(PROSE, path):
                text = hold_names(tail(text), self.held[lang])
        return esc(text)

    def count(self, slug, name):
        f = self.facts.get(slug, {})
        for part in (f.get("counts", {}), f.get("set", {}), self.wings[slug].get("counts", {})):
            if name in part:
                return part[name]
        raise SystemExit(f"the wing {slug!r} has no number called {name!r} (its facts file, or counts in the registry)")

    def filled(self, slug, lang, text):
        """A sentence of a wing with what it points at written in: a number of its facts, in digits or as a word,
        the place and day the wing shows, one of the museum's own texts."""
        def sub(m):
            kind, name = m.group(1), m.group(2)
            if kind == "museum":
                if name not in self.museum.get(lang, {}):
                    raise SystemExit(f"the wing {slug!r} quotes the museum's text {name!r}, which is not in {MUSEUM_TEXTS.name}")
                return self.museum[lang][name]
            if kind == "shows":
                return self.wings[slug]["shows"][name][lang]
            value = self.count(slug, name)
            if kind == "count":
                return number(value, lang)
            word = number_word(value, lang)
            return word.capitalize() if kind == "Word" else word
        return re.sub(r"\{(count|word|Word|shows|museum):(\w+)\}", sub, text)

    def media(self, name):
        """A showpiece's clip: in media/. A test's stand-in lies beside the test data."""
        for folder in [SRC / "media"] + ([SRC / "testdata" / "media"] if self.mark else []):
            if (folder / name).is_file():
                return folder / name
        return None


# ---------- checks before anything is written ----------

def expected_keys(site, lang):
    """The keys a language's words file holds: the English set, less what only English holds, with the German
    legal notice's own notes in German, without the legal notice's page where the language has none, and with the
    slot for the line on how its words were made while its status is ai."""
    english = set(site.words["en"])
    if lang == "en":
        return english
    keys = english - ONE_LANGUAGE["en"] - {AI_TAG} | ONE_LANGUAGE.get(lang, set())
    if not L.has_imprint(lang):
        keys = {k for k in keys if not re.search(IMPRINT_PAGE, k)} | NO_IMPRINT
    if lang not in ("en", "de"):
        keys -= TWO_ONLY
    if L.entries[lang]["status"] == "ai":
        keys |= {AI_TAG}
    return keys


def check_words(site):
    problems = []
    for lang in LANGS:
        raw, lock = site.words[lang], site.locked(lang)
        want = expected_keys(site, lang)
        if lang != "en" and set(raw) - want:
            problems.append(f"words: keys present in {lang} only: {sorted(set(raw) - want)}")
        if lang != "en" and want - set(raw):
            problems.append(f"words: keys missing in {lang}: {sorted(want - set(raw))}")
        # the narrow spaces of French punctuation are the build's: a writer's own would be set twice
        typed = sorted(k for k, v in site.written[lang].items() if isinstance(v, str) and NNBSP in v)
        if typed:
            problems.append(f"words.{lang}: {typed[:3]} carry a narrow no-break space, which the build sets")
        if not lock:
            # no approved locked lines yet: built and checked, never listed (languages.json)
            problems += lint(site, f"words.{lang}", {k: v for k, v in raw.items() if not k.startswith("hero.tagline_")}, "", lang=lang)
            continue
        if raw["hero.tagline_1"] != lock["tagline"]:
            problems.append(f"{lang}: hero.tagline_1 is not the locked line")
        if raw["hero.tagline_2"] != lock["tagline_note"]:
            problems.append(f"{lang}: hero.tagline_2 is not the locked note under the line")
        for key in ("glance.trust", "page_what.trust"):
            if raw[key] != lock["trust"]:
                problems.append(f"{lang}: {key} is not the locked trust wording")
        if lock["trust"].replace(" · " + RULES[lang]["trust_middle"], "") != lock["trust_before"]:
            problems.append(f"{lang}: the trust line before the code opens is not the locked line without its middle term")
        if raw["brand.descriptor"] != lock["descriptor"]:
            problems.append(f"{lang}: brand.descriptor is not the decided line under the name")
        for key in BEFORE:
            if key in raw and key + "_before" not in raw:
                problems.append(f"{lang}: {key} has no twin {key}_before for the time before the code opens")
            elif key in raw and re.search(RULES[lang]["open_word"], raw[key + "_before"], flags=re.I):
                problems.append(f"{lang}: {key}_before says open source, and it stands while the repository is closed")
        if re.search(RULES[lang]["open_word"], re.sub(RULES[lang]["of_the_licence"], "", raw["page_what.s6_before"], flags=re.I), flags=re.I):
            problems.append(f"{lang}: page_what.s6_before may call the licence open source, not the museum's code")
        if raw["meta.title"] != lock["title"]:
            problems.append(f"{lang}: meta.title is not the decided title of the museum's page")
        # the mission stands under "Our mission" and in the footer: who runs the museum need not say it again
        for key in ("footer.mission",):
            if lock["mission"] not in raw[key]:
                problems.append(f"{lang}: {key} does not carry the locked mission sentence")
        if raw["page_what.m_one"] != lock["mission"]:
            problems.append(f"{lang}: page_what.m_one is not the locked mission sentence")
        # the formal word stands once on the site: in the line about the company
        if [k for k, v in raw.items() if lock["purpose"] in v] != ["page_what.s5_p1"]:
            problems.append(f"{lang}: the company's purpose ({lock['purpose']!r}) stands once, in page_what.s5_p1")
        if raw["project.line"] != lock["project"]:
            problems.append(f"{lang}: project.line is not the decided line")
        # the four grades are the same words wherever a page shows them, and the sentence beside them says them
        for i, word in enumerate(lock["grades"], 1):
            if raw[f"page_what.s2_four_{i}"] != word:
                problems.append(f"{lang}: page_what.s2_four_{i} is not the decided grade {word!r}")
            if word.lower() not in raw["sure.text"].lower():
                problems.append(f"{lang}: sure.text does not say the grade {word!r} that stands beside it")
        if raw["page_what.s4_made"] != lock["made"]:
            problems.append(f"{lang}: page_what.s4_made is not the locked sentence on how the words are made")
        if raw["page_what.honesty"] != lock["honesty"]:
            problems.append(f"{lang}: page_what.honesty is not the locked honesty line")
        if raw.get("imprint.email") != MAIL:
            problems.append(f"{lang}: imprint.email is not the museum's contact address")
        if raw["hero.name"] != "Museum of Ages":
            problems.append(f"{lang}: hero.name is not the museum's name")
        problems += lint(site, f"words.{lang}", {k: v for k, v in raw.items() if not k.startswith("hero.tagline_")}, "", lang=lang)
        for key in ("page_what.description",):
            for pattern, what in FOR_THE_WRITER + RULES[lang]["for_the_writer"]:
                if re.search(pattern, raw[key].lower()):
                    site.notes.append(f"words.{lang}: {key}: {what}")
    for lang in LANGS:
        for key, text in strings(site.museum.get(lang, {})).items():
            if not text.strip():
                problems.append(f"{MUSEUM_TEXTS.name}: {lang}.{key} is empty")
    # the museum's own texts stand word for word in the wing's own files, wherever those can be read
    sources = [REPO / f for f in site.museum.get("_from", [])]
    if sources and not site.mark and museum_missing(site):
        missing = museum_missing(site)
        made = ""
        if missing.endswith("na-manifest.json"):
            made = (" with the store's records (a dev server without a store writes this checkout's records only)"
                    if (REPO / missing).exists() else " (the museum's dev server or build writes it)")
        skip(f"the museum's texts, the grades' words and the example stop against the wing's own files: {missing} is not there{made}")
    for lang in LANGS:
        if lang not in site.museum:
            problems.append(f"{MUSEUM_TEXTS.name}: {lang} is built and the museum's texts in it are not there "
                            f"({MUSEUM_TEXTS.stem}.{lang}.json, copied from the wing's own words)")
    for lang in [x for x in LANGS if x not in ("en", "de") and x in site.museum and not site.mark]:
        skip(f"the museum's texts in {lang} against the wing's own words in {lang}: the wing's files hold English and German")
    if sources and not museum_missing(site) and not site.mark:
        source = "".join(f.read_text(encoding="utf-8") for f in sources)
        for lang in ("en", "de"):
            for key, text in site.museum[lang].items():
                if text not in source and json.dumps(text, ensure_ascii=False)[1:-1] not in source:
                    problems.append(f"{MUSEUM_TEXTS.name}: {lang}.{key} is not word for word in the wing's own files")
    kinds = lambda d: [[("list", len(x)) if isinstance(x, list) else "p" for x in s["body"]] for s in d["sections"]]
    for lang in LANGS:
        if kinds(site.privacy[lang]) != kinds(site.privacy["en"]):
            problems.append(f"privacy words: {lang} differs from English in the number of sections or in the shape of a body")
        flat = {k: v for k, v in strings(site.privacy[lang]).items() if not k.startswith("_")}
        problems += [p for p in lint(site, f"privacy.{lang}", flat, "", limits=False, lang=lang)]
    return problems


def lint(site, where, flat, prefix, limits=True, wing=None, lang="en"):
    problems = []
    never = list(NEVER) + RULES[lang]["never"]
    for slug in ([wing] if wing else site.open):
        never += [tuple(x) for x in site.wings[slug].get("never_say", [])]
    for key, text in flat.items():
        low = text.lower()
        for bad in BANNED + RULES[lang]["banned"]:
            if bad in low and not (bad == ";" and key.startswith("sections")):
                problems.append(f"{where}: {key} contains {bad!r}")
        for pattern, instead in never:
            if key not in DECIDED and re.search(pattern, low) and not (key == AI_TAG and pattern == MADE_ONCE):
                problems.append(f"{where}: {key} matches /{pattern}/ ({instead})")
        if not text.strip() and not re.search(MAY_BE_EMPTY, prefix + key):
            problems.append(f"{where}: {key} is empty")
        limit = limit_for(prefix + key, lang)
        if limits and len(text) > limit:
            problems.append(f"{where}: {key} is {len(text)} characters, the limit is {limit}")
    return problems


def check_registry(site):
    problems = []
    app = set(re.findall(r"slug:\s*'([a-z0-9-]+)'", APP_WINGS.read_text(encoding="utf-8"))) if APP_WINGS.exists() else None
    if app is None and not site.mark:
        skip(f"an open wing's slug against the museum app's list: {APP_WINGS.relative_to(REPO)} is not there")
    slugs = {c.get("slug") for c in site.collections}
    for c in site.collections:
        for key in ("slug", "state", "name", "line", "dates_key"):
            if key not in c or (key in ("name", "line", "dates_key") and not set(LANGS) <= set(c[key])):
                problems.append(f"registry: a collection lacks {key} in a built language")
    if not site.open:
        return problems + ["registry: no wing is open"]
    pages = set()
    for slug, e in site.wings.items():
        where = f"registry: the wing {slug!r}"
        if e.get("state") not in STATES:
            problems.append(f"{where} has the state {e.get('state')!r}, not one of {STATES}")
        if "langs" in e and (not isinstance(e["langs"], list) or "en" not in e["langs"] or set(e["langs"]) - set(L.order)):
            problems.append(f"{where}: its langs {e['langs']!r} is not a list of the table's languages with English")
        if e.get("pages_only"):
            problems += check_pages_only(site, slug, e, pages)
            continue
        if e.get("collection") not in slugs:
            problems.append(f"{where} names the collection {e.get('collection')!r}, which is not listed")
        if not set(LANGS) <= set(e.get("name", {})):
            problems.append(f"{where} lacks its name in a built language")
        if e.get("state") != "open":
            continue
        missing = [k for k in WING_KEYS if k not in e]
        if missing:
            problems.append(f"{where} is open and lacks {', '.join(missing)}")
            continue
        for lang in LANGS:
            page = e["page"].get(lang, "")
            if not page.startswith(L.folder(lang)) or not re.fullmatch(r"[a-z0-9-]+", page[len(L.folder(lang)):]) or page in pages:
                problems.append(f"{where}: its {lang} page address {page!r} is not a free folder of that language")
            pages.add(page)
            if not re.fullmatch(DOOR_SHAPE, e["door"].get(lang, "")):
                problems.append(f"{where}: its {lang} door is not a wing's plain opening")
            if not e["dates"].get(lang) or not e["shows"].get("place", {}).get(lang) or not e["shows"].get("day", {}).get(lang):
                problems.append(f"{where} lacks its dates, or the place and day it shows, in {lang}")
            for t in e["topics"]:
                if lang in languages.topic_langs(t, LANGS) and not all(t.get(k, {}).get(lang) for k in ("slug", "name", "line")):
                    problems.append(f"{where}: a topic page lacks its slug, name or line in {lang}")
        groups = {g["id"] for g in (site.data.get(slug, {}).get("en", {}).get("holds") or {}).get("groups", [])}
        for t in e["topics"]:
            # a page in fewer languages always has English: its other languages link the English page
            if "langs" in t and (not isinstance(t["langs"], list) or "en" not in t["langs"] or set(t["langs"]) - set(L.order)):
                problems.append(f"{where}: a topic page's langs {t['langs']!r} is not a list of the table's languages with English")
            if "from" in t and t["from"] not in groups:
                problems.append(f"{where}: a topic page is linked from the group {t['from']!r}, which the wing's page does not hold")
        if app is not None and not site.mark and slug not in app:
            problems.append(f"{where} is not in the museum app's own list ({APP_WINGS.name})")
        if not isinstance(e["when"], int) or isinstance(e["when"], bool):
            problems.append(f"{where}: when is the year the wing shows, a whole number: the menu lists the wings in the order of time")
        if e["wall"] not in WALLS:
            problems.append(f"{where}: its wall is {e['wall']!r}, not one of {sorted(WALLS)}")
        if not re.fullmatch(r"#[0-9a-f]{6}", e["note"]):
            problems.append(f"{where}: its note is not a colour of six hex digits")
        else:
            l, c = oklch(e["note"])
            if not (NOTE_L[0] <= l <= NOTE_L[1] and NOTE_C[0] <= c <= NOTE_C[1]):
                problems.append(f"{where}: its note {e['note']} has lightness {l:.2f} and chroma {c:.3f}, "
                                f"outside the palette's bounds ({NOTE_L}, {NOTE_C})")
        pics = e["pictures"]
        for name in ("hero", "card", "share"):
            if name not in pics:
                problems.append(f"{where} lacks the picture {name}")
        for pic in [pics.get("hero"), pics.get("hero", {}).get("phone"), pics.get("landing"),
                    pics.get("landing", {}).get("phone"), pics.get("card")]:
            if not pic:
                continue
            for n in pic["widths"]:
                for ext in ("webp", "avif"):
                    if not site.pics.find(f'{pic["stem"]}-{n}.{ext}'):
                        problems.append(f'{where}: the picture {pic["stem"]}-{n}.{ext} is missing')
            big = site.pics.find(f'{pic["stem"]}-{max(pic["widths"])}.webp')
            if big and list(R.webp_size(big)) != pic.get("size"):
                problems.append(f'{where}: {big.name} is {R.webp_size(big)}, the registry says {pic.get("size")}')
        if "share" in pics and not site.pics.find(pics["share"]["file"]):
            problems.append(f'{where}: the share picture {pics["share"]["file"]} is missing')
        if slug not in site.data:
            problems.append(f"{where} is open and lacks its two data files in {site.wing_dirs[0].name}/")
            continue
        if slug not in site.facts and "counts" not in e:
            problems.append(f"{where} has neither a facts file nor counts in the registry")
        problems += check_wing_data(site, slug)
    return problems


def check_pages_only(site, slug, e, pages):
    """A wing in the making with pages of its own (pages_only): its name, its page and its topic pages in each of its
    languages, a free folder for each, and no key of an open wing's first screen. It stands on no wall and in no film,
    so it names no collection. Its pages are built by the topic pages' build."""
    where, problems = f"registry: the wing {slug!r}", []
    if e.get("state") != "making":
        problems.append(f"{where} has pages only and is {e.get('state')!r}: only a wing in the making stands without its own first screen")
    own = languages.wing_langs(e, LANGS)
    for key in ("door", "pictures", "collection"):
        if key in e:
            problems.append(f"{where} has pages only and names {key}: it has no door, no wall and no film before it opens")
    for key in ("name", "page", "about", "never_say", "claim_phrase", "topics"):
        if key not in e:
            problems.append(f"{where} has pages only and lacks {key}")
    if problems:
        return problems
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,47}", wing_count_kind(slug, e)):
        problems.append(f"{where}: its page's kind in the count {wing_count_kind(slug, e)!r} is not a plain word")
    for lang in own:
        page = e["page"].get(lang, "")
        if not e["name"].get(lang):
            problems.append(f"{where} lacks its name in {lang}")
        if not page.startswith(L.folder(lang)) or not re.fullmatch(r"[a-z0-9-]+", page[len(L.folder(lang)):]) or page in pages:
            problems.append(f"{where}: its {lang} page address {page!r} is not a free folder of that language")
        pages.add(page)
        for t in e["topics"]:
            if lang in languages.topic_langs(t, own) and not all(t.get(k, {}).get(lang) for k in ("slug", "name", "line")):
                problems.append(f"{where}: a topic page lacks its slug, name or line in {lang}")
    for t in e["topics"]:
        if set(t.get("langs") or own) - set(own):
            problems.append(f"{where}: a topic page names a language its wing is not written in")
        for rule in t.get("never_say", []):
            if not (isinstance(rule, list) and (len(rule) == 2 or (len(rule) == 3 and isinstance(rule[2], list)
                                                                   and set(rule[2]) <= set(own)))):
                problems.append(f"{where}: a topic page's never_say holds a rule that is not [pattern, what to say instead]"
                                " with at most a list of its wing's languages")
    return problems


def pieces_of(d):
    """Every place of a wing's data that may carry a piece: (path, its data)."""
    out = [(f"{at}.piece", d[at]["piece"]) for at in ("first", "landing") if "piece" in d.get(at, {})]
    return out + [(f"holds.groups.{i}.piece", g["piece"]) for i, g in enumerate(d.get("holds", {}).get("groups", [])) if "piece" in g]


def check_wing_data(site, slug):
    problems, e = [], site.wings[slug]
    where = f"wings/{e.get('_data', slug)}"
    plain = lambda d: shape({k: v for k, v in d.items() if k != "_note"})
    odd = [lang for lang in LANGS if plain(site.data_written[slug][lang]) != plain(site.data_written[slug]["en"])]
    if odd:
        return [f"{where}: {', '.join(odd)} does not hold the same structure as English"]
    facts = site.facts.get(slug)
    for lang in LANGS:
        d, written = site.data_raw[slug][lang], site.data_written[slug][lang]
        flat = {k: v for k, v in strings(d).items() if not re.search(NOT_WORDS, k)}
        for key in DATA_KEYS:
            if not flat.get(key, "").strip():
                problems.append(f"{where}.{lang}: {key} is missing")
        if not d.get("rooms") or len(d.get("stop", {}).get("layers", [])) != 3:
            problems.append(f"{where}.{lang}: a wing needs at least one room and a stop with three layers")
        named = [e["pictures"][k]["alt"] for k in ("hero", "landing", "card", "share") if k in e["pictures"]]
        for path in named:
            if path not in strings(d):
                problems.append(f"{where}.{lang}: the registry's picture names the alt text {path!r}, which is not there")
        if "landing" in e["pictures"]:
            for key in ("title", "kind", "what", "alt"):
                if not flat.get(f"landing.piece.{key}", "").strip():
                    problems.append(f"{where}.{lang}: the registry hangs the wing's own picture on the landing, and landing.piece.{key} is missing")
        elif "landing" in d and not site.mark:
            problems.append(f"{where}.{lang}: landing.piece has no picture: the registry lacks pictures.landing")
        for at, piece in pieces_of(d):
            for i, f in enumerate(piece.get("frames", [])):
                for pic in (f["pic"], f["pic"].get("phone")):
                    problems += [f"{where}.{lang}: {at}.frames.{i}: {x}" for x in missing_pics(site, pic)]
            if "pic" in piece:
                for pic in (piece["pic"], piece["pic"].get("phone")):
                    problems += [f"{where}.{lang}: {at}: {x}" for x in missing_pics(site, pic)]
            inst = piece.get("install")
            if inst is None:
                continue
            if not all(inst.get(k) for k in ("name", "script", "pause", "play")) or not (SRC / "js" / inst["script"]).is_file():
                problems.append(f"{where}.{lang}: {at}.install needs name, script, pause and play, and its script in js/")
                continue
            clip = inst.get("clip")
            if clip and (not re.fullmatch(r"[a-z0-9-]+\.(mp4|webm)", clip) or not site.media(clip)):
                problems.append(f"{where}.{lang}: the clip {clip!r} of {at} is not a .mp4 or .webm file in media/")
            elif clip and site.media(clip).stat().st_size > CLIP_MAX:
                problems.append(f"{where}.{lang}: the clip {clip} is larger than {CLIP_MAX} bytes")
            # the pictures a piece's script fetches by itself are listed with it, so they are checked like any other
            script = (SRC / "js" / inst["script"]).read_text(encoding="utf-8")
            for name in inst.get("loads", []):
                stem, _, size = name.rpartition("-")
                if f"'{stem}'" not in script or not re.search(rf"\b{size}\b", script):
                    problems.append(f"{where}.{lang}: {at}.install lists the picture {name}, which its script {inst['script']} does not name")
                for ext in ("avif", "webp"):
                    if not site.pics.find(f"{name}.{ext}"):
                        problems.append(f"{where}.{lang}: the picture {name}.{ext} that {inst['script']} loads is missing")
            for stem, sizes in re.findall(r"stem: '([a-z0-9-]+)', sizes: \[([\d, ]+)\]", script):
                for size in sizes.split(","):
                    if f"{stem}-{size.strip()}" not in inst.get("loads", []):
                        problems.append(f"{where}.{lang}: {inst['script']} loads {stem}-{size.strip()}, which {at}.install does not list")
        shut = d.get("landing", {}).get("close")
        if shut:
            if not all(shut.get(k) for k in ("pic", "title", "kind", "what", "alt")):
                problems.append(f"{where}.{lang}: landing.close needs pic, title, kind, what and alt")
            else:
                for pic in (shut["pic"], shut["pic"].get("phone")):
                    problems += [f"{where}.{lang}: landing.close: {x}" for x in missing_pics(site, pic)]
        # the example stop: one of the wing's stops, graded with one of the four grades
        st = d.get("stop", {})
        if st.get("grade") and st["grade"] not in R.GRADES:
            problems.append(f"{where}.{lang}: stop.grade is {st['grade']!r}, not one of the four grades {R.GRADES}")
        if st.get("id") and facts is not None and st["id"] not in facts.get("stops", []):
            problems.append(f"{where}.{lang}: stop.id {st['id']!r} is not a stop of the wing (the facts file's stops)")
        for pic in (st.get("stage", {}).get("pic"), st.get("stage", {}).get("pic", {}).get("wide")):
            problems += [f"{where}.{lang}: stop.stage: {x}" for x in missing_pics(site, pic)]
        for it in d.get("numbers", []):
            if not all(it.get(k) for k in ("count", "num", "term")) or "{n}" not in it["num"]:
                problems.append(f"{where}.{lang}: a row of numbers needs count, num (with {{n}}) and term")
        if e.get("out") and not d.get("out", {}).get("line"):
            problems.append(f"{where}.{lang}: the registry gives the wing a way to another site (out), and out.line is missing")
        for g in d.get("holds", {}).get("groups", []):
            at = f"holds.{g.get('id')}"
            near = g.get("close")
            if near:
                st = near.get("stage", {})
                if len(near.get("layers", [])) != 3 or not all(st.get(k) for k in ("pic", "alt", "title", "kind", "what")) or not near.get("title"):
                    problems.append(f"{where}.{lang}: {at}.close needs a title, three layers and a stage with pic, alt, title, kind and what")
                else:
                    for pic in (st["pic"], st["pic"].get("wide")):
                        problems += [f"{where}.{lang}: {at}.close: {x}" for x in missing_pics(site, pic)]
                    part = st.get("piece")
                    keys = ("name", "script", "tag_a", "tag_b", "hint", "slider_label", "canvas_label", "pause", "play")
                    if part and (not all(part.get(k) for k in keys) or not (SRC / "js" / part["script"]).is_file()):
                        problems.append(f"{where}.{lang}: {at}.close.stage.piece needs {', '.join(keys)}, and its script in js/")
            if g.get("form") not in ("wall", "set", "text"):
                problems.append(f"{where}.{lang}: {at} has the form {g.get('form')!r}, not wall, set or text")
            if facts is None:
                problems.append(f"{where}.{lang}: the wing has a picture index and no facts file ({e.get('_data', slug)}.facts.json)")
                break
            lists = [g["from"]] if "from" in g else []
            lists += [x["from"] for x in g.get("lists", [])]
            for name in lists:
                if not isinstance(facts.get(name), list) or not facts[name]:
                    problems.append(f"{where}.{lang}: {at} reads the list {name!r}, which the facts file does not hold")
            stops = [g.get("stop"), g.get("field", {}).get("stop")] + [r.get("stop") for r in g.get("rows", [])]
            for stop in stops:
                if stop and stop not in facts.get("stops", []):
                    problems.append(f"{where}.{lang}: {at} names the stop {stop!r}, which is not a stop of the wing")
            if g.get("form") == "set":
                for it in facts.get(g["from"], []):
                    problems += [f"{where}.{lang}: {at}: {x}" for x in missing_pics(site, {"stem": f'm-{it["id"]}', "widths": [360, 720]})]
                unknown = sorted(set(g.get("names", {})) - {it["id"] for it in facts.get(g["from"], [])})
                if unknown:
                    problems.append(f"{where}.{lang}: {at}.names gives a plain name to {unknown}, which the facts file does not hold")
        if not site.mark:
            problems += lint(site, f"{where}.{lang}", flat, "wing:", wing=slug, lang=lang)
            # every number of a wing's page is read from its facts file: none is written into a sentence
            values = {v for part in ("counts", "set") for v in (facts or {}).get(part, {}).values() if isinstance(v, int)}
            words = [WORDS[lang][v] for v in sorted(values) if 7 <= v < len(WORDS.get(lang, []))]
            for key, text in strings(written).items():
                if re.search(NOT_WORDS, key) or re.search(DIGITS_OK, key):
                    continue
                plain = re.sub(r"\{(count|word|Word|shows|museum):\w+\}", "", text)
                if re.search(r"\d", plain):
                    problems.append(f"{where}.{lang}: {key} carries a number in digits. Write {{count:<name>}}: the number stands in the facts file")
                for word in words:
                    if re.search(rf"\b{word}\b", plain, flags=re.I):
                        problems.append(f"{where}.{lang}: {key} writes the number {word!r} out. Write {{word:<name>}}: the number stands in the facts file")
            for it in d.get("numbers", []):
                site.count(slug, it["count"])
    if facts is not None:
        problems += check_facts(site, slug)
    return problems


def missing_pics(site, pic):
    if not pic:
        return []
    return [f'the picture {pic["stem"]}-{n}.{ext} is missing' for n in pic["widths"] for ext in ("webp", "avif")
            if not site.pics.find(f'{pic["stem"]}-{n}.{ext}')]


def check_facts(site, slug):
    """A wing's facts file against the wing's inventory. The file names the tool that made it. That tool counts
    the inventory again, and every count, name, size and holder that differs stops the build. Each entry of the
    index carries the stop it is seen from, and an entry's page, where it has one, has an address in both languages."""
    facts, at = site.facts[slug], site.facts_at[slug]
    problems, where = [], f"wings/{at.name}"
    for key in ("counts", "set", "links"):
        if not isinstance(facts.get(key), dict):
            problems.append(f"{where}: {key} is missing")
    if problems:
        return problems
    for switch in ("pages", "wing"):
        if not isinstance(facts["links"].get(switch), bool):
            problems.append(f"{where}: links.{switch} is true or false")
    for key in ("paintings", "machines", "sheets"):
        for it in facts.get(key, []):
            if it.get("stop") not in facts.get("stops", []):
                problems.append(f"{where}: {key}: {it.get('id')} names the stop {it.get('stop')!r}, which is not a stop of the wing")
            page = it.get("page")
            if page is not None and (not set(LANGS) <= set(page) or not all(re.fullmatch(r"[a-z0-9-]+", page[l]) for l in LANGS)):
                problems.append(f"{where}: {key}: the page of {it.get('id')} needs one plain address per language")
    for it in facts.get("paintings", []) + [m for m in facts.get("machines", []) if m.get("holder")] + facts.get("shelf", []):
        if it["holder"] not in [h["id"] for h in facts.get("holders", [])]:
            problems.append(f"{where}: {it.get('id')} names the holder {it['holder']!r}, which is not in the list of holders")
    tool = at.parent.parent / facts.get("_made_by", "")
    if site.mark or not facts.get("_made_by"):
        return problems
    if not tool.is_file():
        return problems + [f"{where}: the tool that made it ({facts['_made_by']}) is missing"]
    spec = importlib.util.spec_from_file_location("wing_facts_tool", tool)
    mod = importlib.util.module_from_spec(spec)
    keep, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.dont_write_bytecode = keep
    for why in getattr(mod, "skipped", lambda: [])():
        skip(f"{where}: {why}")
    return problems + [f"{where}: {x}" for x in mod.compare(site.facts_file[slug])]


def check_css():
    problems, defined, used = [], set(), {}
    for path in sorted((SRC / "css").glob("*.css")):
        body = re.sub(r"/\*.*?\*/", "", path.read_text(encoding="utf-8"), flags=re.S)
        if path.name != "tokens.css" and re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(", body):
            problems.append(f"css/{path.name}: a colour is written outside tokens.css")
        defined |= set(re.findall(r"(--[\w-]+)\s*:", body))
        for var, rest in re.findall(r"var\((--[\w-]+)\s*([,)])", body):
            if rest == ")":
                used.setdefault(var, path.name)
    # set by a script or by this build, never by a style sheet
    defined |= {"--arc", "--day", "--stars", "--i", "--note"}
    for var, where in sorted(used.items()):
        if var not in defined:
            problems.append(f"css/{where}: {var} is read and never set")
    # the film's plates paint in their own colours: its chrome reads tokens.css
    for path in sorted(p for p in (SRC / "js").glob("*.js") if p.name != R.FILM["script"]):
        if re.search(r"#[0-9a-fA-F]{6}\b|rgba?\(\s*\d", path.read_text(encoding="utf-8")):
            problems.append(f"js/{path.name}: a colour is written outside tokens.css")
    return problems


def check_no_wing_named(site):
    """No template, style sheet or script of the site names a wing: a wing is data."""
    problems = []
    words = set()
    for slug, e in site.wings.items():
        words.add(slug)
        for name in e.get("name", {}).values():
            words |= {x for x in re.findall(r"[A-Za-zÀ-ÿ]{5,}", name)}
    # a piece names its own subjects: the film's plates name their makers, a painter among them
    pieces = {R.FILM["script"]} | {p for d in site.data_raw.values() for p in re.findall(r'"script": "([^"]+)"', json.dumps(d))}
    files = [p for p in SRC.glob("*.html")] + [p for p in SRC.glob("*.py")] + list((SRC / "css").glob("*.css")) + [
        p for p in (SRC / "js").glob("*.js") if p.name not in pieces]
    for path in files:
        text = path.read_text(encoding="utf-8")
        for word in sorted(words):
            if re.search(rf"\b{re.escape(word)}\b", text, flags=re.I):
                problems.append(f"{path.name} names a wing ({word}): a wing is data, never a template's or a style's word")
    return problems


# ---------- the grades, the example stop, the pictures and the colours ----------

def museum_sources(site):
    """The wing's own files the museum's quoted texts come from, read once, or None where they cannot be read."""
    files = [REPO / f for f in site.museum.get("_from", [])]
    if not files or museum_missing(site):
        return None
    return {f: f.read_text(encoding="utf-8") for f in files}


def check_grade_marks(site):
    """The site names and colours the four grades as the museum app does: its words for them (the app's table of
    certainty words, in the wing's own files) and its four colours (--ui-sure-* in the app's shell), which the
    tokens mirror. Read only where those files can be read, and never for a test's stand-ins."""
    problems = []
    sheets = "".join(p.read_text(encoding="utf-8") for p in sorted((SRC / "css").glob("*.css")))
    for g in R.GRADES:
        if not re.search(rf"\.bead--{g}\{{--sure:var\(--sure-{g}\)\}}", sheets):
            problems.append(f"css: the bead of the grade {g!r} does not take its colour from --sure-{g}")
    if site.mark:
        return problems
    tokens = token_values()
    if not APP_SHELL.exists():
        skip(f"the grades' colours against the museum app's: {APP_SHELL.relative_to(REPO)} is not there")
    if APP_SHELL.exists():
        app = dict(re.findall(r"--ui-sure-(\w+):\s*(#[0-9a-fA-F]{6})", APP_SHELL.read_text(encoding="utf-8")))
        for g in R.GRADES:
            if g not in app or tokens.get(f"--sure-{g}") != app[g].lower():
                problems.append(f"css/tokens.css: --sure-{g} is {tokens.get(f'--sure-{g}')}, the museum app's --ui-sure-{g} is {app.get(g)}")
    sources = museum_sources(site) or {}
    table = next((m.group(1) for text in sources.values()
                  for m in [re.search(r"CertaintyWords\b[^=]*=\s*\{(.*?)\n\};", text, flags=re.S)] if m), None)
    if sources and table is None:
        problems.append(f"{MUSEUM_TEXTS.name}: none of the wing's files under _from holds the app's table of certainty words")
    elif table:
        for i, g in enumerate(R.GRADES):
            found = re.search(rf"\b{g}: \{{ en: '([^']+)', de: '([^']+)' \}}", table)
            for lang, n in (("en", 1), ("de", 2)):
                said = LOCKED[lang]["grades"][i]
                if not found or said != found.group(n)[:1].upper() + found.group(n)[1:]:
                    problems.append(f"{lang}: the grade {g!r} reads {said!r} on the site and "
                                    f"{found.group(n) if found else None!r} in the museum app")
    return problems


def check_stop_quotes(site):
    """The example stop on the museum's page quotes the wing: its title, age, line and drawer stand word for word in
    that stop's own entry of the wing's story, and its grade is the grade the story gives it."""
    problems, sources = [], museum_sources(site)
    if site.mark or not sources:
        return problems
    for slug in site.open:
        written = site.data_written.get(slug, {})
        st = written.get("en", {}).get("stop", {})
        if not st.get("id"):
            continue
        block = next((m.group(1) for text in sources.values()
                      for m in [re.search(rf'\bid: "{re.escape(st["id"])}",(.*?)\n  \}},', text, flags=re.S)] if m), None)
        if block is None:
            problems.append(f"wings/{slug}: the stop {st['id']!r} has no entry in the wing's story ({MUSEUM_TEXTS.name}, _from)")
            continue
        for lang in LANGS:
            s = written[lang]["stop"]
            quoted = [s.get("title", ""), s.get("age", "")] + [x["text"] for x in s.get("layers", [])]
            for i, text in enumerate(quoted):
                if text and not re.fullmatch(r"(?:\{museum:\w+\} ?)+", text):
                    problems.append(f"wings/{slug}.{lang}: the stop's {('title', 'age', 'line', 'drawer', 'record')[i]} is not "
                                    f"the museum's own text (write {{museum:<key>}})")
            for text in quoted[:4] if lang in ("en", "de") else ():
                for key in re.findall(r"\{museum:(\w+)\}", text):
                    words = site.museum[lang].get(key, "")
                    if words not in block and json.dumps(words, ensure_ascii=False)[1:-1] not in block:
                        problems.append(f"{MUSEUM_TEXTS.name}: {lang}.{key} is not word for word in the story's entry for {st['id']!r}")
        sure = re.search(r'\bcertainty: "(\w+)"', block)
        if st.get("grade") and (not sure or sure.group(1) != st["grade"]):
            problems.append(f"wings/{slug}: the stop {st['id']!r} is graded {st['grade']!r}, the wing's story gives "
                            f"{sure.group(1) if sure else None!r}")
    return problems


def picture_jobs():
    """{picture's stem: its film frame}, and the frames of the second rights tier, from the tool that cuts them."""
    spec = importlib.util.spec_from_file_location("image_jobs", IMAGE_JOBS)
    mod = importlib.util.module_from_spec(spec)
    keep, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.dont_write_bytecode = keep
    return mod.frames(), set(mod.SECOND_TIER)


def frames_in(html, frame):
    """The film frames one piece of a page shows: every picture file it names, by the frame it is cut from."""
    return {frame.get(stem, stem) for stem in re.findall(r"img/([a-z0-9-]+?)-\d+\.(?:avif|webp)\b", html)}


def check_pictures(out, built, site):
    """One frame, one place: no film frame stands twice on the museum's page or on a wing's page, and none stands on
    both (a frame counts once whatever its picture's name, so a cut and its whole frame are one). A frame of the
    second rights tier never stands in a page's first section, and below it only in a plate whose label carries a
    source line. A test's stand-in wings reuse pictures on purpose: they are read for the second tier only."""
    problems = []
    frame, second = picture_jobs()
    shown = {}
    for path, text, kind, lang in built:
        if kind not in ("home", "wing"):
            continue
        name = path.relative_to(out)
        body = text[text.index("<main"):text.index("</main>")]
        places = [frames_in(p, frame) for p in re.findall(r"<picture>.*?</picture>", body, flags=re.S)]
        if not site.mark:
            seen = {}
            for f in places:
                for x in f:
                    seen[x] = seen.get(x, 0) + 1
            twice = sorted(x for x, n in seen.items() if n > 1)
            if twice:
                problems.append(f"{name}: the frame {twice} stands in more than one place on the page")
        shown[(kind, lang, str(name))] = set().union(*places) if places else set()
        first = re.search(r'<section class="hero\b.*?</section>', body, flags=re.S)
        early = sorted(frames_in(first.group(0), frame) & second) if first else []
        if early:
            problems.append(f"{name}: the first section shows {early}, a frame of the second rights tier")
        for fig in re.findall(r"<figure\b.*?</figure>", body, flags=re.S):
            tier = sorted(frames_in(fig, frame) & second)
            src = re.search(r'<span class="label__src">([^<]*\S)', fig)
            if tier and not src:
                problems.append(f"{name}: a plate shows {tier}, a frame of the second rights tier, and its label has no source line")
    if not site.mark:
        for (kind, lang, home), seen in shown.items():
            if kind != "home":
                continue
            for (k2, l2, page), there in shown.items():
                both = sorted(seen & there)
                if k2 == "wing" and l2 == lang and both:
                    problems.append(f"{home} and {page}: the frame {both} stands on both pages")
    return problems


def check_colours(out, built, site):
    """No colour value on a page that is not a token's: the inline styles carry tokens.css itself, and the one other
    value a page may hold is a wing's own note, which the registry gives as data."""
    problems = []
    allowed = set(token_values().values()) | {e["note"].lower() for e in site.wings.values() if e.get("note")}
    for path in sorted(SRC.glob("*.html")):
        if re.search(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|rgba?\(|hsla?\(|oklch\(|oklab\(', re.sub(r'href="[^"]*"', "", path.read_text(encoding="utf-8"))):
            problems.append(f"{path.name}: a colour is written in a template")
    for path, text, kind, lang in built:
        styles = " ".join(re.findall(r"<style\b[^>]*>(.*?)</style>", text, flags=re.S))
        attrs = " ".join(re.findall(r'\s(?:fill|stroke|stop-color|color|content|style)="(#[0-9a-fA-F]{3,8})"', text))
        odd = sorted({c.lower() for c in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])", styles + " " + attrs)} - allowed)
        if odd or re.search(r"rgba?\(|hsla?\(|oklch\(|oklab\(", styles):
            problems.append(f"{path.relative_to(out)}: a colour that is no token's value ({', '.join(odd) or 'a colour function'})")
    return problems


# ---------- the sign ----------

def token_values():
    """{name: value} of every colour in tokens.css, values in lower case."""
    text = (SRC / "css" / "tokens.css").read_text(encoding="utf-8")
    return {k: v.lower() for k, v in re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b", text)}


def png_size(path):
    """Width and height from a PNG's own header."""
    head = path.read_bytes()[:24]
    if head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
        return None
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def check_sign_sources():
    """The sign's files are its drawing, unchanged; its colours are the page's tokens; the two pictures
    were made from the files as they stand now, at their sizes."""
    problems = []
    for name, digest in SIGN_FILES.items():
        path = SIGN / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            problems.append(f"sign/{name}: not the sign's own drawing (the files are set as they are, never edited)")
    if problems:
        return problems
    tokens = set(token_values().values())
    for name in ("tab.svg", "app.svg"):
        body = re.sub(r"<!--.*?-->", "", (SIGN / name).read_text(encoding="utf-8"), flags=re.S)
        odd = sorted({c.lower() for c in re.findall(r"#[0-9a-fA-F]{6}\b", body)} - tokens)
        if odd or re.search(r"#[0-9a-fA-F]{3}\b|rgba?\(|hsla?\(", body):
            problems.append(f"sign/{name}: a colour that is not a token's value ({', '.join(odd) or 'a short or functional form'})")
    record = SIGN / "icons.json"
    made = json.loads(record.read_text(encoding="utf-8")) if record.is_file() else {}
    for rel, attrs, name, size in ICONS:
        if size is None:
            continue
        entry, path = made.get(name), SIGN / name
        if (not entry or not path.is_file() or entry.get("size") != size or png_size(path) != (size, size)
                or hashlib.sha256(path.read_bytes()).hexdigest() != entry.get("sha256")
                or hashlib.sha256((SIGN / entry["from"]).read_bytes()).hexdigest() != entry.get("source_sha256")):
            problems.append(f"sign/{name}: missing, not {size} by {size}, or made from another drawing: run tools/make_icons.py")
    return problems


def sign_drawings():
    """The sign as the page draws it, one setting per place: the drawing's own paths, unchanged, and its two colours
    given to the page's linen and chalk by name."""
    tokens = token_values()
    out = {}
    for kind, (name, size) in SIGN_CUTS.items():
        found = re.search(r'<g transform="translate\(16 \d+\)"><path d="([^"]+)" fill="(#[0-9a-fA-F]{6})"/>'
                          r'<path d="([^"]+)" fill="none" stroke="(#[0-9a-fA-F]{6})" stroke-width="(\d+)"/></g>',
                          (SIGN / name).read_text(encoding="utf-8"))
        if not found:
            raise SystemExit(f"sign/{name}: the sign's group (its built part and its drawn line) was not found")
        built, linen, drawn, chalk, width = found.groups()
        if (linen.lower(), chalk.lower()) != (tokens.get("--linen"), tokens.get("--chalk")):
            raise SystemExit(f"sign/{name}: drawn in {linen} and {chalk}, and the page's linen and chalk are "
                             f"{tokens.get('--linen')} and {tokens.get('--chalk')}: the page adds no colour")
        out[kind] = (f'<svg class="sign" viewBox="0 0 {size} {size}" width="{size}" height="{size}" aria-hidden="true" '
                     f'focusable="false"><path class="sign__built" d="{built}"/>'
                     f'<path class="sign__drawn" d="{drawn}" fill="none" stroke-width="{width}"/></svg>')
    return out


def icon_links(static):
    """The tab's icons and the home screen's. The picture names its size, so a browser that takes the SVG keeps it."""
    return "\n".join(f'<link rel="{rel}" href="{static}sign/{name}"{" " + attrs if attrs else ""}>' for rel, attrs, name, _ in ICONS)


def check_sign(out, signs):
    """Every page of the built folder, the topic pages included: the sign in the header's slot (the master on 32) and
    in the footer's (the cut on 24), drawn into the page, hidden from a screen reader, in the page's tokens only, no
    slot left empty and no frame left; the icons each page names, there in the build as the source holds them."""
    problems = []
    for rel, attrs, name, size in ICONS:
        built = out / STATIC / "sign" / name
        if not built.is_file() or built.read_bytes() != (SIGN / name).read_bytes():
            problems.append(f"{STATIC}/sign/{name}: missing from the build or not the source's file")
    for path in sorted(out.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        name = path.relative_to(out)
        head = re.search(r'<header class="masthead">.*?</header>', text, flags=re.S)
        brand = re.search(r'<a class="brand" href="[^"]*">\s*(?:<!--.*?-->\s*)?<span class="brand__mark is-set" data-slot="mark" '
                          r'aria-hidden="true">(.*?)</span>\s*<span class="brand__text">', head.group(0) if head else "", flags=re.S)
        if not brand or brand.group(1) != signs["block"]:
            problems.append(f"{name}: the header's slot does not carry the sign beside the name and the small line (the master on 32)")
        foot = re.search(r'<p class="foot__brand">\s*<span class="brand__mark is-set" data-slot="mark" aria-hidden="true">(.*?)</span>'
                         r'\s*<span class="brand__name">', text, flags=re.S)
        if not foot or foot.group(1) != signs["name"]:
            problems.append(f"{name}: the footer's slot does not carry the sign beside the name alone (the cut on 24)")
        if any("is-set" not in slot or not inner.startswith('<svg class="sign"')
               for slot, inner in re.findall(r'(<span class="brand__mark\b[^>]*>)(.{0,17})', text, flags=re.S)):
            problems.append(f"{name}: a slot for the sign is left empty")
        if "--tick" in text or "linear-gradient(var(--tick)" in text:
            problems.append(f"{name}: the frame that marked the slot is still in the page's style")
        if not re.search(r"\.brand\{[^}]*\bmin-height:44px", text):
            problems.append(f"{name}: the link around the sign and the name lost its 44 px touch area")
        for svg in re.findall(r'<svg class="sign".*?</svg>', text, flags=re.S):
            if re.search(r'#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|\sstyle=|\s(?:fill|stroke)="(?!none")', svg):
                problems.append(f"{name}: the sign carries a colour of its own (it takes the page's tokens)")
            if 'aria-hidden="true"' not in svg[:svg.index(">")]:
                problems.append(f"{name}: the sign is not hidden from a screen reader")
        named = []
        for rel, attrs in re.findall(r'<link rel="(icon|apple-touch-icon|shortcut icon)"([^>]*)>', text):
            ref = (re.search(r'href="([^"]*)"', attrs) or re.search("()", "")).group(1)
            target = ((out / ref.lstrip("/")) if ref.startswith("/") else (path.parent / ref)).resolve()
            if not ref or ref.startswith("data:") or not target.is_file() or out.resolve() not in target.parents:
                problems.append(f"{name}: the icon {ref or '(no address)'} is not a file of the build")
            named.append((rel, re.sub(r'\s*href="[^"]*"', "", attrs).strip(), ref.rsplit("/", 1)[-1]))
        if named != [(rel, attrs, file) for rel, attrs, file, _ in ICONS]:
            problems.append(f"{name}: the page does not name the tab's icons and the home screen's ({named})")
    return problems


# ---------- the pages ----------

def head_values(c, kind, title, description, canon, twins, og_title, share, share_alt, preload="", index=True, deferred=False):
    # a built language that is not listed is checked here and found by no search engine
    noindex = HIDDEN or c.mark or not index or c.lang not in LISTED
    rest = f'<link rel="stylesheet" href="{c.static}site.css" media="print" id="rest">{REST_SCRIPT}\n' if deferred else ""
    return {
        # an indexed page lets search show its pictures large in a result
        "head.csp": CSP_MARK, "head.robots": '<meta name="robots" content="noindex">\n' if noindex
        else '<meta name="robots" content="max-image-preview:large">\n',
        "head.preload": preload, "head.title": esc(title), "head.description": esc(description),
        "head.rest_noscript": f'<link rel="stylesheet" href="{c.static}site.css">' if deferred else "", "head.rest_link": rest,
        "head.canonical": canon, "head.alternates": alternates(c, kind, twins),
        "head.og_alternates": "".join(f'<meta property="og:locale:alternate" content="{L.entries[x]["og"]}">\n'
                                      for x in LISTED if x != c.lang) if len(LISTED) > 2 else "",
        "head.scheme": "dark" if deferred else "light dark", "head.og_type": "website" if kind == "home" else "article",
        "head.og_title": esc(og_title), "head.og_image": f"{ORIGIN}/{STATIC}/img/{share['file']}",
        "head.og_w": str(share["size"][0]), "head.og_h": str(share["size"][1]), "head.og_alt": share_alt,
    }


def alternates(c, kind, twins):
    """The page's twins for a search engine: one line per listed language that has this page, and English for any
    other. A page of a language that is not listed names none, and no page names it."""
    if c.lang not in LISTED:
        return ""
    have = [x for x in LISTED if kind != "imprint" or L.has_imprint(x)]
    lines = [(L.html(x), twins[x]) for x in have] + [("x-default", twins["en"])]
    return "".join(f'<link rel="alternate" hreflang="{tag}" href="{url}">\n' for tag, url in lines)


def switcher(c, twin, kind):
    """The ways to the page's twins in the other languages: (the bar's, the menu's item, the menu's list, the footer's
    item, the footer's list). With English and German alone, one short link to the other one, as the site had it.
    From three languages on, the bar shows the page's own and opens the list, without a script, and the menu and the
    footer list them all. Each in its own name and language, no flags."""
    if not many(c.lang):
        other = "de" if c.lang == "en" else "en"
        link = (f'<a href="{c.to(twin[other])}" lang="{other}" hreflang="{other}">{c.w["a11y.lang_switch"]}</a>')
        return (f'    <a class="lang" href="{c.to(twin[other])}" lang="{other}" hreflang="{other}">{c.w["a11y.lang_switch"]}</a>\n',
                f"            <li>{link}</li>\n", "", f"        <li>{link}</li>\n", "")
    names = []
    for x in L.shown(c.lang):
        tag, here = L.html(x), ' aria-current="page"' if x == c.lang else ""
        names.append(f'<li><a href="{c.to(twin[x])}" lang="{tag}" hreflang="{tag}"{here}>{esc(L.entries[x]["name"])}</a></li>')
    spoken = c.w["a11y.language"]
    bar = (f'    <details class="langs" data-drop><summary class="lang langs__btn"><span class="vh">{spoken} </span>'
           f'{c.lang.split("-")[0].upper()}</summary><ul class="langs__list">{"".join(names)}</ul></details>\n')
    menu = f'\n          <p class="menu__h">{spoken}</p>\n          <ul class="menu__list menu__list--langs">{"".join(names)}</ul>'
    foot = f'\n      <p class="foot__h">{spoken}</p>\n      <ul class="foot__langs">{"".join(names)}</ul>'
    return bar, "", menu, "", foot


def lang_css(c, kind):
    """The rules a page needs beyond the shared ones: the switcher's from three languages on, the line on how a
    translated language's words were made, the hint on the English front page. None for English and German alone."""
    ai = L.entries[c.lang]["status"] == "ai"
    if not (many(c.lang) or ai or hint_on(c, kind)):
        return ""
    by = ":root{--by:calc(var(--by-h) + var(--ai-h))}" if PROJECT_LINE else ":root{--by:var(--ai-h)}"
    return css("langs") + (by if ai else "")


def hint_on(c, kind):
    return kind == "home" and c.lang == "en" and len(LISTED) > 2


def hint(c, kind):
    """One line on the English front page for a visitor whose browser asks for another listed language, which leads
    to it. No redirect, nothing stored, and off while English and German are the only two."""
    if not hint_on(c, kind):
        return ""
    table = {}
    for x in LISTED[1:]:
        tag = L.html(x)
        entry = [c.site.words[x]["hint.line"], c.to(L.page(x, "home")), tag]
        table.setdefault(tag.lower(), entry)
        table.setdefault(tag.split("-")[0].lower(), entry)
    return (f'<p class="hint" data-hint="{esc(json.dumps(table, ensure_ascii=False, separators=(",", ":")))}" hidden></p>'
            f"<script>{HINT_SCRIPT}</script>")


# Reads the browser's languages in order: English shows nothing, the first listed one shows its line.
HINT_SCRIPT = ("(function(){var h=document.querySelector('[data-hint]');if(!h)return;var t=JSON.parse(h.getAttribute('data-hint')),"
               "n=navigator.languages||[navigator.language||''];for(var i=0;i<n.length;i++){var l=String(n[i]).toLowerCase(),"
               "p=l.split('-')[0],e=t[l]||t[p];if(p==='en')return;if(e){var a=document.createElement('a');a.href=e[1];"
               "a.textContent=e[0];a.lang=e[2];a.hreflang=e[2];h.appendChild(a);h.hidden=false;return}}})()")


def wing_rules(site, slugs, first):
    """Each wing's note and the depth of its wall, as rules: the registry is the one place they are written.
    first: the place on this page and the wing that hangs there, ("landing" or "wing", slug)."""
    out = []
    for s in slugs:
        e = site.wings[s]
        lit = f";--lit:{WALLS[e['wall']]}" if WALLS[e["wall"]] else ""
        out.append(f".wing--{s}{{--note:{e['note']}{lit}}}")
    # where the first screen's picture keeps its subject when the box cuts it: narrow screens, then wide ones
    where, s = first
    pics = site.wings[s]["pictures"]
    focus = pics["landing" if where == "landing" and "landing" in pics else "hero"].get("focus", {})
    if focus.get("phone"):
        out.append(f".hero__img{{object-position:{focus['phone']}}}")
    if focus.get("wide"):
        out.append(f"@media (min-width:600px){{.hero__img{{object-position:{focus['wide']}}}}}")
    return "".join(out)


def use_pictures(c, w):
    """The statement page's section on reusing the museum's own pictures, and its line in the page's contents. The
    two lines to copy (the credit, the map data) stand apart in boxes, as written, in the one form every language
    and the image data share."""
    deed = f"{CC_BY_SA}{L.entries[c.lang]['deed']}"
    cc = "CC\u00a0BY-SA\u00a04.0"
    linked = lambda key, text, plain, link: text.replace(plain, link, 1) if plain in text else sys.exit(
        f"words.{c.lang}.json: page_what.{key} does not name {plain!r} as written")
    # a no-break space holds the licence's name, but not its hyphen
    hold = lambda html: re.sub(cc, lambda m: f'<span class="nw">{m.group(0)}</span>', html)
    p2 = linked("use_p2", w["page_what.use_p2"], cc, f'<a class="nw" href="{deed}">{cc}</a>')
    p4 = linked("use_p4", w["page_what.use_p4"], MAIL, w["html.mail"])
    # the lines to copy are English as written (no French spacing, plain spaces: they are copied); spans hold the names
    own, as_written = ("" if c.lang == "en" else ' lang="en"'), c.written[c.lang]
    names = re.compile(r"CC BY-SA 4\.0|© \w+|RGE ALTI®|Licence Ouverte 2\.0")
    held = lambda m: f'<span class="nw">{m.group(0)}</span>'
    box = lambda text: f'\n        <p class="credit"{own}>{names.sub(held, esc(text))}</p>'
    section = (f'\n      <section id="{USE_PICTURES}">\n        <h2>{w["page_what.use_h"]}</h2>'
               f'\n        <p>{hold(w["page_what.use_p1"])}</p>\n        <p>{w["page_what.use_credit_lead"]}</p>'
               f'{box(as_written["pictures.credit_text"])}\n        <p>{p2}</p>{box(as_written["page_what.use_map"])}'
               f'\n        <p>{w["page_what.use_p3"]}</p>\n        <p>{p4}</p>\n      </section>\n')
    return f'\n        <li><a href="#{USE_PICTURES}">{w["page_what.use_h"]}</a></li>', section


def check_picture_licences(out):
    """Licence data only on the museum's own pictures (free-pictures.json), and, while the site states its licence,
    on each of them that a page with structured data shows or shares, naming a page that tells how to use them."""
    problems = []
    for path in sorted(out.rglob("*.html")):
        text, name = path.read_text(encoding="utf-8"), path.relative_to(out)
        problems += licence_problems(text, name)
        block = LD_BLOCK.search(text)
        if not block or not SOURCE_LINK:
            continue
        page_url = f"{ORIGIN}/{str(name).removesuffix('index.html')}"
        data = json.loads(block.group(2).replace("<\\/", "</"))
        given = {i.get("contentUrl"): i for i in image_objects(data)}
        for url in free_pictures_of(text, page_url, data):
            if "license" not in given.get(url, {}):
                problems.append(f"{name}: {url} is the museum's own and carries no licence data")
        for image in given.values():
            target = image.get("acquireLicensePage")
            if target:
                page, _, anchor = target.removeprefix(f"{ORIGIN}/").partition("#")
                found = out / page / "index.html"
                if not found.is_file() or f'id="{anchor}"' not in found.read_text(encoding="utf-8"):
                    problems.append(f"{name}: the licence page {target} is not in the build")
    return problems


def publisher():
    # the logo is the sign the header draws, in its one served picture of at least 112 px (the home screen's); no link
    # to the code
    return {"@type": "NGO", "@id": f"{ORIGIN}/#publisher", "name": "ChipMates gemeinnützige GmbH",
            "legalName": "ChipMates gemeinnützige GmbH", "url": f"{ORIGIN}/", "logo": f"{ORIGIN}/{STATIC}/sign/{PUBLISHER_LOGO}"}


def imprint_lang(c):
    return c.elsewhere("imprint")


def website(c, description):
    return {"@type": "WebSite", "@id": f"{ORIGIN}/#website", "url": f"{ORIGIN}/", "name": "Museum of Ages",
            "alternateName": f'Museum of Ages, {c.raw["brand.descriptor"]}',
            "description": description, "inLanguage": [L.html(x) for x in LISTED], "publisher": {"@id": f"{ORIGIN}/#publisher"}}


def build(out, registry, wing_dirs, mark=None, topics=True, quiet=False, more_pics=()):
    """Builds one site into out. Returns the list of (path, text, kind, lang)."""
    out = Path(out)
    site = Site(registry, list(wing_dirs), [IMG, *more_pics], mark)
    problems = site.problems or check_registry(site)
    if not problems:
        problems += check_words(site)
    problems += check_css() + check_no_wing_named(site) + check_sign_sources() + check_grade_marks(site) + check_stop_quotes(site)
    if problems:
        raise SystemExit("\n".join(problems))
    signs = sign_drawings()

    read = lambda name: (SRC / name).read_text(encoding="utf-8")
    t = {k: read(f"{k}.html") for k in ("landing", "wing", "what", "legal", "privacy", "404", "head", "header", "footer")}
    theme = re.search(r"--page:\s*(#[0-9a-fA-F]{6})", read("css/tokens.css")).group(1)
    # with the project line on, a first screen is shorter by the line's height, so its door stays in sight
    by = BY_RULE if PROJECT_LINE else ""
    first_css, doc_css = css("tokens", "base", "first") + by, css("tokens", "base", "doc", "foot", "motion") + by
    marker = ""
    if mark:
        rule = (".testmark{position:fixed;left:8px;bottom:8px;z-index:60;margin:0;padding:4px 8px;background:var(--ground-edge);"
                "color:var(--ink-soft);font:12px/1.3 var(--sans);box-shadow:0 0 0 1px var(--hair-strong)}")
        first_css, doc_css = first_css + rule, doc_css + rule
        marker = f'<p class="testmark">{esc(mark)}</p>'

    built = []
    newest = site.wings[site.newest]

    def common(c, kind, wing=None):
        w = dict(c.w)
        entry = site.wings[wing] if wing else None
        twin = {l: (entry["page"][l].strip("/") + "/" if wing else c.addr("home" if kind == "lost" else kind, l)) for l in LANGS}
        if kind == "imprint":
            # a language without a legal notice of its own goes to its front page
            twin.update({l: c.addr("home", l) for l in LANGS if not L.has_imprint(l)})
        door_of = entry or newest
        raw = c.raw
        if ORG_FILLED:
            dd = lambda text: f"<dd>{esc(text)}</dd>"
            w["org.address_dd"] = dd(f'{raw["imprint.street"]}, {raw["imprint.city"]}, {raw["imprint.country"]}')
            w["org.register_dd"] = dd(f'{raw["imprint.register_court"]}, {raw["imprint.register_no"]}')
        else:
            w["org.address_dd"] = f'<dd class="todo">{esc(raw["footer.address_value"])}</dd>'
            w["org.register_dd"] = f'<dd class="todo">{esc(raw["footer.register_value"])}</dd>'
        who = c.to(c.addr("what")) + "#who"
        line = f'<p class="project project--{PROJECT_LINE_AT}"><a href="{who}">{w["project.line"]}</a></p>' if PROJECT_LINE else ""
        # a language whose words no person has read yet says so on the first screen, under the project line
        tag = f'<p class="aitag" id="translation">{w[AI_TAG]}</p>' if L.entries[c.lang]["status"] == "ai" else ""
        bar, menu_item, menu_list, foot_item, foot_list = switcher(c, twin, kind)
        w.update({
            "html.project_over": line if PROJECT_LINE_AT == "over" else "",
            "html.project": (line if PROJECT_LINE_AT != "over" else "") + tag + hint(c, kind),
            # the skip link lands on the tag where a page carries one, so nobody jumps past it
            "html.skip_to": "#translation" if tag else "#main",
            "html.lang_bar": bar, "html.lang_menu": menu_item, "html.lang_menu_list": menu_list,
            "html.lang_foot": foot_item, "html.lang_foot_list": foot_list,
            "html.imprint_elsewhere": "" if L.has_imprint(c.lang) else f'<p class="foot__else">{w["footer.imprint_elsewhere"]}</p>',
            "html.source_item": f'<li><a href="{SOURCE}">{w["footer.source"]}</a></li>' if SOURCE_LINK else "",
            "html.licence": (f' <span>{w["footer.licence_a"]} <a data-licence href="{CC_BY_SA}{L.entries[c.lang]["deed"]}">CC\u00a0BY-SA\u00a04.0</a>.'
                             f' <a class="foot__use" href="{c.to(c.addr("what"))}#{USE_PICTURES}">{w["footer.use"]}</a></span>') if SOURCE_LINK else "",
            "lang": L.html(c.lang), "og_locale": L.entries[c.lang]["og"], "theme_color": theme,
            "static": c.static, "svg.arrow": ARROW, "script.faces": FACES_SCRIPT,
            "href.home": c.to(c.addr("home")), "href.what": c.to(c.addr("what")), "href.imprint": c.to(c.addr("imprint")),
            "href.privacy": c.to(c.addr("privacy")), "href.enter": esc(door_of["door"][c.lang]),
            "attr.what_current": ' aria-current="page"' if kind == "what" else "", "attr.imprint_lang": imprint_lang(c),
            "html.nav_wings": R.nav_wings(c, wing), "html.menu_wings": R.menu_wings(c, wing), "html.mark": marker,
            "css.faces": faces(c.static, c.lang), "page.kind": kind,
            "svg.sign": signs["block"], "svg.sign_name": signs["name"], "head.icons": icon_links(c.static),
        })
        return w, twin

    def finish(c, kind, w, template, path):
        w["head"] = fill(t["head"], w)
        w["header"] = fill(t["header"], w)
        w["footer"] = fill(t["footer"], w)
        counted = wing_count_kind(w["wing.slug"], site.wings[w["wing.slug"]]) if kind == "wing" else COUNT_KINDS[kind]
        text = with_count(fill(template, w), c.static, counted)
        if SOURCE_LINK:
            note = f"{ORIGIN}/{L.page(c.lang, 'what')}#{USE_PICTURES}"
            text = with_picture_rights(text, f"{ORIGIN}/{str(path).removesuffix('index.html')}", picture_terms(c.lang, note),
                                       picture_terms(c.lang, note, map_data=True))
        built.append((out / path, with_policy(text), kind, c.lang))

    for lang in LANGS:
        # the museum's page
        c = Ctx(site, lang, L.folder(lang) + "index.html")
        w, twin = common(c, "home")
        # the line is a description with no full stop of its own: running text gives it one before the note
        line, tagline = c.raw["hero.tagline_1"], f'{c.raw["hero.tagline_1"]}. {c.raw["hero.tagline_2"]}'
        # a wing may name itself more plainly for the landing's description, while it is the only open wing
        lt = (c.wd[site.newest].get("meta") or {}).get("landing_today") if len(c.open) == 1 else None
        today = html_text(lt) if lt else html_text(c.today)
        named = f'Museum of Ages, {c.raw["hero.kind_inline"]}.'  # the name never stands without what it is
        desc = f'{named} {tagline} {today} {c.raw["hero.entry_note"]}'
        share = newest["pictures"]["share"]
        first, sets = R.first(c, "home", site.newest)
        w.update(head_values(c, "home", c.raw["meta.title"], desc, f"{ORIGIN}/{twin[lang]}", {l: f"{ORIGIN}/{twin[l]}" for l in LANGS},
                             f"{named} {line}", share, c.at(c.wd[site.newest], share["alt"]), R.preload(c, sets), deferred=True))
        w.update({
            "css.inline": first_css + lang_css(c, "home") + grain(c.static) + wing_rules(site, site.open, ("landing", site.newest)),
            "html.first": first, "html.wall": R.wall(c), "html.visit": R.stop_section(c, site.newest), "html.closing": R.closing(c),
            "script.film": f'<script src="{c.static}{R.FILM["music_script"]}" defer></script>',
            # an empty lead leaves no paragraph behind
            "html.what_lead": f'<p class="lead">{w["what.lead"]}</p>' if c.raw["what.lead"].strip() else "",
            "jsonld": dump([publisher(), website(c, desc), {
                "@type": "CollectionPage", "@id": f"{ORIGIN}/{twin[lang]}#page", "url": f"{ORIGIN}/{twin[lang]}", "name": c.raw["meta.title"],
                "description": desc, "inLanguage": L.html(lang), "isPartOf": {"@id": f"{ORIGIN}/#website"},
                "publisher": {"@id": f"{ORIGIN}/#publisher"}, "isAccessibleForFree": True,
                "hasPart": [{"@type": "WebPage", "name": site.wings[s]["name"][lang],
                             "url": f'{ORIGIN}/{site.wings[s]["page"][lang].strip("/")}/'} for s in site.open],
            }]),
        })
        finish(c, "home", w, t["landing"], c.here)

        # one page per open wing, all from one template
        for slug in site.open:
            e, d = site.wings[slug], site.data[slug][lang]
            c = Ctx(site, lang, e["page"][lang].strip("/") + "/index.html")
            w, twin = common(c, "wing", slug)
            url = f"{ORIGIN}/{twin[lang]}"
            share = e["pictures"]["share"]
            first, sets = R.first(c, "wing", slug)
            raw_d = site.data_raw[slug][lang]
            w.update(head_values(c, "wing", raw_d["meta"]["title"], raw_d["meta"]["description"], url, {l: f"{ORIGIN}/{twin[l]}" for l in LANGS},
                                 raw_d["meta"]["title"], share, c.at(d, share["alt"]), R.preload(c, sets), deferred=True))
            intro = "".join(f'<p class="wing__film">{d["intro"][k]}</p>' for k in ("film",) if d["intro"].get(k))
            if d["intro"].get("film") or d["intro"].get("stills"):
                intro = f'<p class="wing__film">{d["intro"].get("film", "")} {d["intro"].get("stills", "")}</p>'
            w.update({
                "css.inline": (first_css + lang_css(c, "wing") + grain(c.static) + wing_rules(site, [slug], ("wing", slug)) + R.crop_rules(d)
                               + R.frame_rules(d) + R.holds_rules(c, slug)),
                "wing.slug": slug, "html.first": first, "wing.intro": d["intro"]["p"], "html.intro_more": intro,
                "html.directory": R.room_directory(c, slug), "html.rooms": R.rooms(c, slug), "html.holds": R.holds(c, slug),
                "html.facts": R.facts(c, slug), "html.end": R.end(c, slug), "html.more": R.more(c, slug),
                "jsonld": dump([publisher(), website(c, raw_d["meta"]["description"]), {
                    "@type": "WebPage", "@id": f"{url}#page", "url": url, "name": raw_d["meta"]["title"],
                    "description": raw_d["meta"]["description"], "inLanguage": L.html(lang), "isPartOf": {"@id": f"{ORIGIN}/#website"},
                    "publisher": {"@id": f"{ORIGIN}/#publisher"}, "isAccessibleForFree": True, "about": e["about"],
                    "breadcrumb": {"@id": f"{url}#crumbs"},
                    "primaryImageOfPage": {"@type": "ImageObject", "url": f"{ORIGIN}/{STATIC}/img/{share['file']}",
                                           "width": share["size"][0], "height": share["size"][1],
                                           "caption": raw_d["meta"]["share_alt"]},
                }, {
                    "@type": "BreadcrumbList", "@id": f"{url}#crumbs", "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "Museum of Ages", "item": f"{ORIGIN}/{c.addr('home')}"},
                        {"@type": "ListItem", "position": 2, "name": e["name"][lang], "item": url}],
                }]),
            })
            finish(c, "wing", w, t["wing"], c.here)

        # the reading pages
        share = newest["pictures"]["share"]
        share_alt = Ctx(site, lang, "index.html").at(site.data[site.newest][lang], share["alt"])
        for kind in ("what", "imprint", "privacy"):
            if kind == "imprint" and not L.has_imprint(lang):
                continue
            c = Ctx(site, lang, c_addr(lang, kind) + "index.html")
            w, twin = common(c, kind)
            url = f"{ORIGIN}/{twin[lang]}"
            if kind == "privacy":
                p = site.privacy[lang]
                title, desc = p["title"], p["description"]
                toc, body = R.reading_sections(c, p["sections"])
                w.update({"privacy.h1": esc(p["h1"]), "privacy.lead": esc(p["lead"]), "privacy.updated": f'{esc(p["updated_label"])} {esc(p["updated"])}',
                          "html.toc": toc, "html.sections": body})
            else:
                group = {"what": "page_what", "imprint": "imprint"}[kind]
                title, desc = c.raw[f"{group}.title"], c.raw[f"{group}.description"]
            w.update(head_values(c, kind, title, desc, url, {l: f"{ORIGIN}/{twin[l]}" for l in LANGS}, title, share, share_alt))
            w["css.inline"] = doc_css + lang_css(c, kind) + grain(c.static)
            if kind == "what":
                d = site.data[site.newest][lang]
                name = esc(newest["name"][lang])
                w["html.today"] = c.today
                # the holders stand in full on a wing's own page: here one sentence and the way to each list
                w["html.originals"] = R.originals_links(c)
                w["html.other"] = R.other_sites(c)
                code = w["page_what.s6_p"] if SOURCE_LINK else w["page_what.s6_before"]
                link = f'\n        <p><a class="more" href="{SOURCE}"><span>{w["footer.source"]}</span>{ARROW}</a></p>' if SOURCE_LINK else ""
                w["html.code"] = f"<p>{code}</p>{link}"
                w["html.grades"] = R.grades_explained(c)
                # who answers for the museum, in one line, with the legal notice behind the name
                w["html.who"] = (f'<p class="who"><a href="{c.to(c.addr("imprint"))}"{imprint_lang(c)}>{w["imprint.rep_name"]}</a> {w["page_what.who_role"]}</p>')
                w["html.mail"] = f'<a href="mailto:{MAIL}">{MAIL}</a>'
                w["html.use_toc"], w["html.use"] = use_pictures(c, w) if SOURCE_LINK else ("", "")
                card = newest["pictures"]["card"]
                w["html.plate"] = (
                    '<figure class="plate statement__plate wallband"><div class="hang">'
                    + R.picture(c, [(None, card, "(min-width: 960px) 56vw, 100vw")], c.at(d, card["alt"]))
                    + "</div>" + R.label(name, d["card"]["kind"], d["card"]["what"], src=d["card"].get("src")) + "</figure>")
                w["jsonld"] = dump([publisher(), website(c, desc), {
                    "@type": "AboutPage", "@id": f"{url}#page", "url": url, "name": title, "description": desc, "inLanguage": L.html(lang),
                    "isPartOf": {"@id": f"{ORIGIN}/#website"}, "about": {"@id": f"{ORIGIN}/#website"},
                    "publisher": {"@id": f"{ORIGIN}/#publisher"}}])
            if kind == "imprint":
                w["legal.body"] = legal_body(lang, w, c.to(c.addr("imprint", "de")))
            finish(c, kind, w, t["legal" if kind == "imprint" else kind], c.here)

    # the page for a wrong address is served at any depth: every link and file starts at the site's root. The host
    # serves the nearest 404.html up the path: the root's speaks English and German, every other language's folder
    # has its own.
    for lang in ("en",) + tuple(x for x in LANGS if x not in ROOT_404):
        c = Ctx(site, lang, L.folder(lang) + "404.html")
        w, _ = common(c, "lost")
        a = site.words_attr[lang]
        w.update({"css": doc_css + lang_css(c, "lost") + grain(c.static), "head.csp": CSP_MARK,
                  "own_descriptor": a["brand.descriptor"], "html.others": lost_others(site, lang) if lang == "en" else ""})
        for key in ("title", "p", "back", "enter"):
            w[f"own_{key}"] = a[f"notfound.{key}"]
        w["header"] = fill(t["header"], w)
        w["footer"] = fill(t["footer"], w)
        built.append((out / L.folder(lang) / "404.html", with_policy(fill(t["404"], w)), "lost", lang))

    # write: the pages, the deferred sheet, the scripts, the sitemap, the robots file
    static_dir = out / STATIC
    static_dir.mkdir(parents=True, exist_ok=True)
    for path, text, kind, lang in built:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    (static_dir / "site.css").write_text(css("rest", "foot", "motion"), encoding="utf-8")
    (static_dir / "sign").mkdir(exist_ok=True)
    for _, _, name, _ in ICONS:
        shutil.copyfile(SIGN / name, static_dir / "sign" / name)
    scripts = {"site.js", COUNT_SCRIPT, R.FILM["script"], R.FILM["music_script"]} | {
        p for d in site.data_raw.values() for p in re.findall(r'"script": "([^"]+)"', json.dumps(d))}
    for name in sorted(scripts):
        shutil.copyfile(SRC / "js" / name, static_dir / name)
    # the question for visitors from our grant ads: its script carries every built language's words
    ask_problems = ask.write(out, STATIC, {L.html(l): {k[4:]: v for k, v in site.words[l].items() if k.startswith("ask.")} for l in LANGS},
                             {L.html(l): L.page(l, "privacy") for l in LANGS},
                             {L.html(l) for s in paged(site) for l in languages.wing_langs(site.wings[s], LANGS)})
    (static_dir / R.FILM["data"]).write_text(film_data(site), encoding="utf-8")
    clips = {p for d in site.data_raw.values() for p in re.findall(r'"clip": "([^"]+)"', json.dumps(d))}
    for name in sorted(clips | {R.FILM["music"]}):
        (static_dir / "media").mkdir(exist_ok=True)
        shutil.copyfile(site.media(name), static_dir / "media" / name)
    if out == SITE:
        # the site serves every listed picture of img/: a piece's script may fetch one that no page names
        (static_dir / "img").mkdir(exist_ok=True)
        for path in outside_files():
            if path.parent == IMG:
                shutil.copyfile(path, static_dir / "img" / path.name)
    else:
        # a test site carries its own copy of the pictures it uses
        for rel in sorted(site.pics.used | {f"img/{site.wings[s]['pictures']['share']['file']}" for s in site.open} | {"img/grain.png"}):
            dst = static_dir / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            if not dst.exists():
                shutil.copyfile(site.pics.find(rel.split("/", 1)[1]), dst)
    # a language's own faces (fonts/<code>/) travel only while it is built
    unbuilt = [c for c in L.order if c not in LANGS]
    shutil.copytree(FONTS, static_dir / "fonts", dirs_exist_ok=True, ignore=lambda d, names: [n for n in names if n in unbuilt])

    # the host forwards the site's own address of the code to the repository, once the repository is public, and each
    # page of a language that has left the site to its English twin
    (out / "_redirects").write_text(redirects(site), encoding="utf-8")
    (out / "_routes.json").write_text(json.dumps(ROUTES, indent=1) + "\n", encoding="utf-8")

    listed = [(k, l, p) for p, _, k, l in built if k in ("home", "wing", "what", "imprint", "privacy")]
    if topics and PAGES_BUILD.exists() and not mark:
        listed += [("topic", l, p) for l, p in build_topics(out, site)]
    # a built language that is not listed stands in no sitemap
    write_sitemap(out, site, [x for x in listed if x[1] in LISTED])

    lists, problems = count_lists(site)
    problems += ask_problems
    for path, text, kind, lang in built:
        problems += check_built(out, path, text, kind, site) + check_doors(path.relative_to(out), text)
    for name in ["site.css"] + sorted(scripts):
        if "assets/" in (static_dir / name).read_text(encoding="utf-8"):
            problems.append(f"{STATIC}/{name}: something still points at assets/")
    problems += check_menu(out, built, site) + crawl(out, site) + check_gone(out, site) + check_mail(out) + check_switches(out, site) + check_fonts(site)
    problems += check_sign(out, signs) + check_pictures(out, built, site) + check_colours(out, built, site)
    problems += check_picture_licences(out) + placed.finish(out, STATIC, ORIGIN)
    problems += ask.check(out, STATIC, {L.html(l): L.page(l, "privacy") for l in LANGS}, unasked_pages(site), asked_making(site),
                          topics_built=bool(topics and PAGES_BUILD.exists() and not mark))
    if (out / "_redirects").read_text(encoding="utf-8") != redirects(site):
        problems.append("_redirects does not agree with the switch for the link to the code and the languages that left")
    problems += check_forwards(out, site, topics_built=bool(topics and PAGES_BUILD.exists() and not mark))
    if problems:
        raise SystemExit("\n".join(problems))
    # the count's lists follow the real registry only, never a test registry
    rewritten = out == SITE and (not COUNT_LISTS.is_file() or COUNT_LISTS.read_text(encoding="utf-8") != lists)
    if rewritten:
        COUNT_LISTS.write_text(lists, encoding="utf-8")
    if not quiet:
        if rewritten:
            print(f"The count's lists changed with the registry and are written anew: {COUNT_LISTS.relative_to(REPO)}")
        for path, text, kind, lang in built:
            print(f"{str(path.relative_to(out)):46} {len(text.encode('utf-8')):6} bytes")
        print(f"{STATIC + '/site.css':46} {(static_dir / 'site.css').stat().st_size:6} bytes")
        for note in site.notes:
            print(f"For the writer (not a failure): {note}")
        print("The legal notice names its representative from .museum-local.json." if site.imprint_local.get("rep_name") else
              "The legal notice shows a placeholder for its representative (no .museum-local.json names one): not for the live site.")
        print(f"The project line is {'on, ' + PROJECT_LINE_AT + ' the bar' if PROJECT_LINE else 'off'}. "
              f"The link to the source code is {'on' if SOURCE_LINK else 'off'}.")
        print(f"{len(built)} pages, {len(site.open)} open wing(s), {len(site.collections)} collection(s). All checks passed.")
    return built


ORG_FILLED = True  # the footer's and the statement's address and register show the legal notice's details


def c_addr(lang, kind):
    return L.page(lang, kind)


# The languages the root's 404 page speaks in full. Every other one has a page in its folder.
ROOT_404 = ("en", "de")


def lost_others(site, lang):
    """Under the English block of the root's 404: the German one, then one line in each other listed language."""
    a = site.words_attr["de"]
    out = ("    <hr>\n    <div lang=\"de\">\n"
           f'      <h2>{a["notfound.title"]}</h2>\n      <p class="lead">{a["notfound.p"]}</p>\n'
           f'      <p><a class="more more--back" href="/{L.folder("de")}"><span>{a["notfound.back"]}</span></a></p>\n    </div>\n')
    for x in LISTED:
        if x in ROOT_404:
            continue
        a, tag = site.words_attr[x], L.html(x)
        out += (f'    <p class="stub__row" lang="{tag}">{a["notfound.p"]} '
                f'<a href="/{L.folder(x)}" hreflang="{tag}">{a["notfound.back"]}</a></p>\n')
    return out


def html_text(text):
    import html
    return html.unescape(re.sub(r"<[^>]+>", "", text)).replace(NBSP, " ")


def legal_body(lang, w, to_german):
    """The legal notice. The details are the organisation's own, by key. The German page carries its notes whole,
    the English page points to them."""
    lines = lambda *parts: '<p class="lines">' + "".join(f"<span>{x}</span>" for x in parts) + "</p>"
    section = lambda head, *body: f'      <section>\n        <h2>{head}</h2>\n        ' + "\n        ".join(body) + "\n      </section>"
    mail = f'<a href="mailto:{w["imprint.email"]}">{w["imprint.email"]}</a>'
    out = [
        section(w["imprint.s1_h"], lines(w["imprint.org_name"], w["imprint.street"], w["imprint.city"], w["imprint.country"])),
        section(w["imprint.s2_h"], f'<p>{w["imprint.rep_name"]}</p>'),
        section(w["imprint.s3_h"], lines(f'{w["imprint.phone_k"]}: {w["imprint.phone"]}', f'{w["imprint.email_k"]}: {mail}')),
        section(w["imprint.s4_h"], lines(w["imprint.register_court"], f'{w["imprint.register_no_k"]}: {w["imprint.register_no"]}')),
        section(w["imprint.s5_h"], f'<p>{w["imprint.vat"]}</p>'),
        section(w["imprint.s6_h"], lines(w["imprint.rep_name"], w["imprint.street"], w["imprint.city"])),
    ]
    if lang == "de":
        out += [
            section(w["imprint.content_h"], f'<p>{w["imprint.content_p"]}</p>'),
            section(w["imprint.links_h"], f'<p>{w["imprint.links_p"]}</p>'),
            section(w["imprint.copy_h"], f'<p>{w["imprint.copy_p"]}</p>'),
        ]
    else:
        out.append(f'      <section>\n        <p>{w["imprint.s8_p"]}</p>\n        <p><a class="more" href="{to_german}" lang="en" hreflang="de">'
                   f'<span>{w["imprint.s8_link"]}</span>{ARROW}</a></p>\n      </section>')
    return "\n".join(out)


def build_topics(out, site):
    """The topic pages, built by their own build into the same folder. That build reads this registry and takes
    its header and footer from the statement page, by its own two settings, so they carry the sign. What it wrote
    stays as written, with two exceptions: the switch that closes the whole site adds its line (no outside address
    may come out changed), and the site's icons take the place of the empty icon in the page's head."""
    spec = importlib.util.spec_from_file_location("topic_pages", PAGES_BUILD)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(PAGES_BUILD.parent))
    # nothing is written into the topic pages' folder, not even Python's cache of the module
    keep, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.dont_write_bytecode = keep
        sys.path.remove(str(PAGES_BUILD.parent))
    chrome = {code: L.page(code, "what") for code in LANGS}
    if Path(mod.WINGS_FILE).resolve() != (SRC / "registry.json").resolve() or mod.CHROME_PAGE != chrome:
        raise SystemExit(f"The site's own pages are built. The topic pages' build ({PAGES_BUILD}) does not read this registry "
                         f"or does not take its header from the statement page: WINGS_FILE {mod.WINGS_FILE}, CHROME_PAGE {mod.CHROME_PAGE}")
    try:
        paths = mod.build_pages(out, site_src=SRC, site_built=out, quiet=True)
    except SystemExit as stop:
        raise SystemExit(f"The site's own pages are built. The topic pages' build ({PAGES_BUILD}) stopped:\n{stop}")
    except Exception as error:
        raise SystemExit(f"The site's own pages are built. The topic pages' build ({PAGES_BUILD}) broke: {type(error).__name__}: {error}")
    # the topic pages' soft checks warn and never stop the build: their count goes to the writer's notes
    if getattr(mod, "WARNINGS", None):
        site.notes.append(f"{len(mod.WARNINGS)} warnings to improve: python3 site/pages/build.py --warnings")
    # every address with a scheme, in the order it stands on the page
    outside = lambda page: re.findall(r'="([a-z][a-z0-9+.-]*:[^"]*)"', page)
    found, problems = [], []
    topic_kinds = {f'{e["page"][l].strip("/")}/{t["slug"][l]}': topic_count_kind(t) for e in site.wings.values() if e.get("state") == "open" for t in e.get("topics", [])
                   for l in languages.topic_langs(t, LANGS)}
    # a wing with pages only: its own page is the list of its topic pages, and every page of it is one of the count's
    for s in paged(site):
        e = site.wings[s]
        topic_kinds.update({e["page"][l].strip("/"): wing_count_kind(s, e) for l in languages.wing_langs(e, LANGS)})
        topic_kinds.update({f'{e["page"][l].strip("/")}/{t["slug"][l]}': topic_count_kind(t) for t in e["topics"]
                            for l in languages.topic_langs(t, languages.wing_langs(e, LANGS))})
    for path in paths:
        text = path.read_text(encoding="utf-8")
        name = path.relative_to(out)
        # a folder's page is the folder: the page's own build names no file, and nothing here rewrites a link
        for ref in re.findall(r'href="([^"]*)"', text):
            if not re.match(r"[a-z][a-z0-9+.-]*:", ref) and re.search(r"(^|/)index\.html([#?]|$)", ref):
                problems.append(f"{name}: the link {ref} names a file where the site names the folder")
        new = text
        if HIDDEN:
            # the switch closes every page of the site, the topic pages too
            closed = re.sub(r'<meta name="robots"[^>]*>\n?', "", text).replace("<title>", '<meta name="robots" content="noindex">\n<title>', 1)
            if outside(closed) != outside(text):
                problems.append(f"{name}: closing the page changed an outside address")
            else:
                new = closed
        if new.count(EMPTY_ICON) != 1:
            problems.append(f"{name}: the page's head does not carry its one empty icon ({EMPTY_ICON}) for the site's icons to replace")
        else:
            new = new.replace(EMPTY_ICON, icon_links("../" * (len(name.parts) - 1) + f"{STATIC}/"))
        # the count: the page's script with its kind, and a policy that lets it send to its own address
        kind = topic_kinds.get(str(name.parent))
        policy = "content=\"default-src 'none';"
        if not kind or new.count(policy) != 1 or "</body>" not in new:
            problems.append(f"{name}: the count's script could not be set (kind {kind!r}, its policy or its body not found)")
        else:
            new = with_count(new, "../" * (len(name.parts) - 1) + f"{STATIC}/", kind).replace(policy, policy + " connect-src 'self';")
        problems += check_doors(name, new)
        if new != text:
            path.write_text(new, encoding="utf-8")
        lang = next((c for c in LANGS if c != "en" and name.parts[0] + "/" == L.folder(c)), "en")
        found.append((lang, path))
    if problems:
        raise SystemExit("\n".join(problems))
    return found


def paged(site):
    """The wings in the making with pages of their own (pages_only): the topic pages' build makes their pages."""
    return [s for s, e in site.wings.items() if e.get("pages_only") and e.get("state") == "making"]


def unasked_pages(site):
    """The pages never asked the ads' question, whatever their address carries (_entry/rules.js reads them from the
    count's lists): every page of a wing in the making, by the address of its own page, but those asked_making names."""
    return [f'/{site.wings[s]["page"][l].strip("/")}/' for s in paged(site) for l in languages.wing_langs(site.wings[s], LANGS)]


def asked_making(site):
    """The topic pages of a wing in the making, which ask the ads' question though their wing's own page does not. A
    yes there counts the visit alone: such a wing has no way in, so no entry follows. Returns {kind: [address, ...]},
    each address in every language the page stands in."""
    found = {}
    for s in paged(site):
        e = site.wings[s]
        for t in e.get("topics", []):
            found[topic_count_kind(t)] = [f'/{e["page"][l].strip("/")}/{t["slug"][l]}/'
                                          for l in languages.topic_langs(t, languages.wing_langs(e, LANGS))]
    return found


def wing_count_kind(slug, entry):
    """A wing's page in the count: its count key in the registry, else the wing's own key. Never derived from an
    address, so a new wing never renames an old one's rows."""
    return entry.get("count") or slug


def topic_count_kind(topic):
    """A topic page in the count: its count key in the registry, else its English address with underscores. A page
    whose address is still to be settled names its key, so a new address never renames its rows."""
    return topic.get("count") or topic["slug"]["en"].replace("-", "_")


def count_langs():
    """The count's languages: every one built, and every one whose pages have left the site, since the walk may still
    be read in it (languages.json LEFT)."""
    return [c for c in L.order if c in LANGS or c in L.left]


def forwards(site):
    """The pages of each language that has left the site, each with its English twin, as (address, twin, kind) from
    the site's root: its front page, its pages about the museum, and each wing's page and topic page its entry has a
    slug for, where the wing and the topic were written in it. kind is "topic" for a topic page."""
    out = []
    for code in L.left:
        slugs = L.entries[code]["slugs"]
        kinds = ("home", "what", "privacy") + (("imprint",) if L.has_imprint(code) else ())
        out += [(f"/{L.page(code, k)}", f"/{L.page('en', k)}", k) for k in kinds]
        for key, slug in slugs.get("wings", {}).items():
            wing = site.wings.get(key)
            if not wing or key not in site.open + paged(site) or code not in languages.wing_langs(wing, (code,)):
                continue
            mine, twin = f"/{L.folder(code)}{slug}/", f'/{wing["page"]["en"].strip("/")}/'
            out.append((mine, twin, "wing"))
            for topic in wing.get("topics", []):
                own = slugs.get("topics", {}).get(topic["slug"]["en"])
                if own and code in languages.topic_langs(topic, (code,)):
                    out.append((f"{mine}{own}/", f'{twin}{topic["slug"]["en"]}/', "topic"))
    return out


def redirects(site):
    """The host's forwards (_redirects): the address of the code while the switch is on, then each page of a language
    that left, with its slash and without, once and straight to its twin (301)."""
    lines = [f"{SOURCE} {SOURCE_TO} 302"] if SOURCE_LINK else []
    for old, twin, _ in forwards(site):
        lines += [f"{old.rstrip('/')} {twin} 301", f"{old} {twin} 301"]
    return "".join(f"{line}\n" for line in lines)


def check_forwards(out, site, topics_built):
    """Each forwarded address is no page of the build and is named once; each twin is a page of the build and is not
    forwarded itself, so a visitor arrives in one step. A topic page's twin is checked where the topic pages are built."""
    problems, seen = [], set()
    pairs = forwards(site)
    olds = {old for old, _, _ in pairs}
    for old, twin, kind in pairs:
        if old in seen:
            problems.append(f"_redirects: {old} is forwarded twice")
        seen.add(old)
        if (out / old.lstrip("/")).exists():
            problems.append(f"_redirects: {old} is forwarded, but the built site still holds it")
        if twin in olds:
            problems.append(f"_redirects: {old} forwards to {twin}, which is forwarded again")
        if (kind != "topic" or topics_built) and not (out / twin.lstrip("/") / "index.html").is_file():
            problems.append(f"_redirects: {old} forwards to {twin}, which the build does not write")
    return problems


def count_lists(site):
    """The count's closed lists as the function's module: each open wing with the number of its stops, every page
    kind, every language built or left (count_langs), and the pages the edge never asks. Returns (text, problems)."""
    wings = {s: site.count(s, "stops") for s in site.open}
    kinds = list(COUNT_KINDS.values())
    for s in site.open + paged(site):
        kinds.append(wing_count_kind(s, site.wings[s]))
        kinds += [topic_count_kind(t) for t in site.wings[s].get("topics", [])]
    problems = [f"the count's page kind {k!r} stands twice" for k in sorted({k for k in kinds if kinds.count(k) > 1})]
    problems += [f"the count's page kind {k!r} is not a plain word" for k in kinds if not re.fullmatch(r"[a-z][a-z0-9_-]{0,47}", k)]
    problems += [f"the wing {s!r} has no whole number of stops for the count" for s, n in wings.items() if not isinstance(n, int) or n < 1]
    unasked = unasked_pages(site)
    asked = asked_making(site)
    text = ("// Written by site/_src/build.py from the site's registry, its wings' facts and its languages. Not edited by hand.\n"
            f"export const WING_STOPS = Object.freeze({json.dumps(wings, separators=(', ', ': '))})\n"
            f"export const PAGE_KINDS = Object.freeze({json.dumps(kinds, separators=(', ', ': '))})\n"
            f"export const LANGUAGES = Object.freeze({json.dumps(count_langs(), separators=(', ', ': '))})\n"
            f"export const UNASKED = Object.freeze({json.dumps(unasked, separators=(', ', ': '))})\n"
            f"export const ASKED_MAKING = Object.freeze({json.dumps(asked, ensure_ascii=False, separators=(', ', ': '))})\n")
    return text, problems


def count_tag(static, kind):
    """The count's script on a page of this kind. Its one attribute names the kind; the policy then allows the page
    to send to its own address (with_policy)."""
    return f'<script src="{static}{COUNT_SCRIPT}" data-count="{kind}" defer></script>\n'


def with_count(text, static, kind):
    return text.replace("</body>", count_tag(static, kind) + "</body>", 1) if kind else text


def check_doors(name, text):
    """Every way into the walk names its place among the count's doors."""
    problems = []
    for a in re.findall(r'<a\b[^>]*\bhref="/w/[^"]*"[^>]*>', text):
        place = re.search(r'\sdata-door="([^"]*)"', a)
        if not place or place.group(1) not in DOOR_PLACES:
            problems.append(f"{name}: a way into the walk names no place of the count ({a})")
    return problems


def film_data(site):
    """The museum's film's list of wings, from the registry: every open or coming wing's name and year, and for an
    open one the pictures the film looks at and its own lines (film in its entry). A new wing appears in the film
    with no change to the film. The pictures it names are kept like any picture a page shows."""
    def pic(p, want):
        if not p:
            return None
        name = f'{p["stem"]}-{min(p["widths"], key=lambda n: abs(n - want))}.webp'
        site.pics.used.add(f"img/{name}")
        return name

    def share(text, default):
        m = re.match(r"\s*([\d.]+)%\s+([\d.]+)%", text or "")
        return [float(m.group(1)) / 100, float(m.group(2)) / 100] if m else default

    def year(e):
        if isinstance(e.get("when"), int) and not isinstance(e.get("when"), bool):
            return e["when"]
        dates = (e.get("dates") or {}).get("en", "")
        if "million years ago" in dates:
            return -int(float(re.findall(r"[\d.]+", dates)[-1]) * 1e6)
        found = re.findall(r"\b(\d{3,4})\b", dates)
        return int(found[-1]) if found else None

    wings = []
    for slug, e in site.wings.items():
        # a wing with pages only is in no film before it opens
        if e.get("state") not in ("open", "making") or e.get("pages_only"):
            continue
        w = {"slug": slug, "state": e["state"], "name": e["name"], "year": year(e)}
        if e["state"] == "open":
            pics, film = e["pictures"], e.get("film", {})
            hero, land = pics["hero"], pics.get("landing") or pics["hero"]
            focus = lambda p, k: share((p.get("focus") or {}).get(k), [0.5, 0.5])
            w["place"] = e["shows"]["place"]
            w["ground"] = {"file": pic(pics["card"], 800), **film.get("ground", {})}
            w["inside"] = {"wide": pic(hero, 1600), "phone": pic(hero.get("phone"), 780),
                           "focusWide": focus(hero, "wide"), "focusPhone": focus(hero, "phone"), **film.get("inside", {})}
            w["room"] = {"wide": pic(land, 1600), "phone": pic(land.get("phone"), 1080),
                         "focusWide": focus(land, "wide"), "focusPhone": focus(land, "phone")}
            w.update({k: film[k] for k in ("line", "offer", "sky", "held") if k in film})
        wings.append(w)
    # plain ASCII, as the film's script is: no server setting can break a letter
    return "window.MoaFilmData = " + json.dumps({"wings": wings}, separators=(",", ":")) + ";\n"


def page_graph(text):
    """A built page's structured data as one list of nodes (none where it has none)."""
    nodes = []
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S):
        data = json.loads(block.replace("<\\/", "</"))
        nodes += data.get("@graph", [data])
    return nodes


def checked_day(text):
    """The day a topic page's facts were last checked, as its Article gives it (dateModified), or None."""
    return next((n["dateModified"] for n in page_graph(text) if n.get("@type") == "Article" and n.get("dateModified")), None)


def page_pictures(text, page_url):
    """Every picture a built page shows (img) and every one its structured data describes (an ImageObject's contentUrl),
    as addresses on the site, once each in the order met. A picture a page may show may be listed: the list adds no
    picture the page does not already serve."""
    found = [urllib.parse.urljoin(page_url, html.unescape(src)) for src in re.findall(r'<img\b[^>]*?\bsrc="([^"]+)"', text)]
    found += [i.get("contentUrl") or i.get("url") or "" for i in image_objects(page_graph(text))]
    return [u for u in dict.fromkeys(found) if u.startswith(f"{ORIGIN}/")]


def write_sitemap(out, site, listed):
    rel = lambda p: str(Path(p).relative_to(out).parent).replace(".", "", 1).strip("/")
    url = lambda p: f"{ORIGIN}/{rel(p)}/".replace("//", "/").replace("https:/", "https://")
    urls = sorted({url(p) for _, _, p in listed})
    # a topic page's last change that counts is the day its facts were checked: the day its dated line shows
    lastmod, pictures = {}, {}
    for kind, _, p in listed:
        text = Path(p).read_text(encoding="utf-8")
        day = checked_day(text) if kind == "topic" else None
        if day:
            lastmod[url(p)] = f"<lastmod>{day}</lastmod>"
        # Google reads one image:loc per picture, a thousand at most per address
        pictures[url(p)] = "".join(f"<image:image><image:loc>{html.escape(u, quote=False)}</image:loc></image:image>"
                                   for u in page_pictures(text, url(p))[:1000])
    # From three listed languages on, each address names its twins, as the pages' heads do. With two, the heads alone.
    twins = {}
    if len(LISTED) > 2:
        for page in pages_by_twin(out, listed):
            for _, p in page:
                twins[url(p)] = [(L.html(l), url(q)) for l, q in page] + [("x-default", url(dict(page)["en"]))] if "en" in dict(page) else []
    link = lambda u: "".join(f'<xhtml:link rel="alternate" hreflang="{tag}" href="{v}"/>' for tag, v in twins.get(u, []))
    body = "".join(f"  <url><loc>{u}</loc>{lastmod.get(u, '')}{link(u)}{pictures.get(u, '')}</url>\n" for u in urls)
    space = (' xmlns:xhtml="http://www.w3.org/1999/xhtml"' if twins else "") + (
        ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' if any(pictures.values()) else "")
    (out / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"{space}>\n' + body + "</urlset>\n",
        encoding="utf-8")
    closed = HIDDEN or site.mark
    (out / "robots.txt").write_text(
        "User-agent: *\nDisallow: /\n" if closed else f"User-agent: *\nAllow: /\n\nSitemap: {ORIGIN}/sitemap.xml\n", encoding="utf-8")
    if not closed:
        (out / f"{INDEXNOW_KEY}.txt").write_text(INDEXNOW_KEY, encoding="utf-8")


def pages_by_twin(out, listed):
    """The listed pages grouped by the page they are a twin of: [[(lang, path), ...], ...], read from each page's own
    hreflang lines, so the sitemap says what the heads say."""
    groups = {}
    for _, lang, p in listed:
        text = Path(p).read_text(encoding="utf-8")
        canon = re.search(r'<link rel="canonical" href="([^"]+)"', text)
        twins = tuple(sorted(re.findall(r'<link rel="alternate" hreflang="(?!x-default)[\w-]+" href="([^"]+)"', text)))
        groups.setdefault(twins or (canon.group(1) if canon else str(p),), []).append((lang, p))
    return list(groups.values())


# ---------- checks on what was built ----------

def page_lang(text):
    """The code of a built page's language, from its lang attribute."""
    tag = re.search(r'<html lang="([\w-]+)"', text).group(1)
    return next(c for c in L.order if L.html(c) == tag)


def check_built(out, path, text, kind, site):
    problems = []
    name = path.relative_to(out)
    if "{{" in text or CSP_MARK in text:
        problems.append(f"{name}: an unfilled placeholder is left")
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, flags=re.S):
        for node in json.loads(block.replace("<\\/", "</"))["@graph"]:
            if "Museum" in str(node.get("@type")):
                problems.append(f"{name}: the structured data uses a Museum type")
    if len(re.findall(r"<h1[\s>]", text)) != 1:
        problems.append(f"{name}: the page does not have exactly one h1")
    plain = shown_text(text)
    for bad in ("—", "–") + ((";",) if kind != "privacy" else ()):
        if bad in plain:
            problems.append(f"{name}: the displayed text contains {bad!r}")
    refs = set(re.findall(r'(?:src|href)="([^"#?]*%s/[^"#?]+)"' % STATIC, text)) | set(
        re.findall(r"((?:\.\./|/)*%s/img/[\w.-]+)\s+\d+w" % STATIC, text)) | set(re.findall(r'url\("([^"]*%s/[^"]+)"\)' % STATIC, text))
    for ref in refs:
        target = (out / ref.lstrip("/")) if ref.startswith("/") else (path.parent / ref)
        if not target.resolve().exists():
            problems.append(f"{name}: {ref} is missing")
    if re.search(r'["(/ ]assets/', text):
        problems.append(f"{name}: something still points at assets/ (the museum app's folder)")
    for img in re.findall(r"<img\b[^>]*>", text):
        if not re.search(r'\balt="[^"]', img) or " width=" not in img or " height=" not in img:
            problems.append(f"{name}: an img lacks alt, width or height")
    tags = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", " ", text, flags=re.S)
    if re.search(r"<[^>]*\sstyle\s*=", tags):
        problems.append(f"{name}: a style attribute is left (the policy forbids it)")
    if re.search(r"<[^>]*\son[a-z]+\s*=", tags):
        problems.append(f"{name}: an inline event handler is left (the policy forbids it)")
    if 'http-equiv="Content-Security-Policy"' not in text or "'unsafe-inline'" in text:
        problems.append(f"{name}: the content security policy is missing or weak")
    levels = [int(n) for n in re.findall(r"<h([1-6])[\s>]", text)]
    if any(b > a + 1 for a, b in zip(levels, levels[1:])):
        problems.append(f"{name}: a heading level is skipped ({levels})")
    foot = text[text.index('<footer class="foot"'):]
    if re.search(r"<h[1-6][\s>]", foot):
        problems.append(f"{name}: the footer carries a heading")
    if "ChipMates" not in foot or not re.search(r'<p class="foot__by">.*?<a href="[^"]*(?:%s)/"' % "|".join(IMPRINT_DIR.values()), foot, flags=re.S):
        problems.append(f"{name}: the footer lacks the publisher line with the link to the legal notice")
    if re.search(r'="[^"]*<span', text):
        problems.append(f"{name}: a span stands inside an attribute")
    ids = re.findall(r'\sid="([^"]+)"', tags)
    twice = sorted({i for i in ids if ids.count(i) > 1})
    if twice:
        problems.append(f"{name}: the id {twice} stands more than once")
    # the menu's button is three lines and no word: its name is spoken, in the page's language
    lang = page_lang(text)
    if not re.search(r'<summary class="menu__btn"><span class="vh">%s</span><span class="menu__layers" aria-hidden="true">'
                     r'(<span></span>){3}</span></summary>' % re.escape(site.words_html[lang]["nav.menu"]), text):
        problems.append(f"{name}: the menu's button needs its spoken name and its three lines")
    problems += check_switcher(name, text, lang, kind)
    # the four grades, wherever a page shows them: the decided words, in their order (a language without approved
    # locked lines is read for its beads and their order only)
    for block in re.findall(r'<ul class="(?:sure__grades|grades)"[^>]*>(.*?)</ul>', text, flags=re.S) + re.findall(r'<dl class="graded">(.*?)</dl>', text, flags=re.S):
        items = re.findall(r"<(?:li|dt)>(.*?)</(?:li|dt)>", block, flags=re.S)
        shown = [html_text(re.sub(r"<svg\b.*?</svg>", "", x, flags=re.S)) for x in items]
        if kind != "lost" and lang in LOCKED and tuple(shown) != LOCKED[lang]["grades"]:
            problems.append(f"{name}: the four grades read {shown}, not the decided words")
        # each word behind the bead of its own grade, in the museum app's order
        if [re.match(r'<span class="bead bead--(\w+)" aria-hidden="true"></span><span>', x) and
                re.match(r'<span class="bead bead--(\w+)"', x).group(1) for x in items] != list(R.GRADES):
            problems.append(f"{name}: the four grades do not each stand behind their bead, in the order {R.GRADES}")
    # a stop's own grade: its bead and the decided word for it
    for g, word in re.findall(r'<p class="from__sure"><span class="bead bead--(\w+)" aria-hidden="true"></span><span>(.*?)</span></p>', text):
        if g not in R.GRADES or (lang in LOCKED and html_text(word) != LOCKED[lang]["grades"][R.GRADES.index(g)]):
            problems.append(f"{name}: a stop's grade {g!r} reads {html_text(word)!r}, not the decided word")
    # the grades are beads now: no line marks are left
    if re.search(r'class="[^"]*\bgline\b|\.gline\b', text):
        problems.append(f"{name}: a grade still stands behind a line mark (the wing marks a grade with a bead)")
    # no picture stands above the heading it belongs to: in every part that hangs plates, the heading comes first
    for part in re.findall(r'<article class="(?:room|place|hgroup)\b.*?</article>', text, flags=re.S):
        head, fig = re.search(r"<h[2-5][\s>]", part), part.find("<figure")
        if fig != -1 and (not head or head.start() > fig):
            problems.append(f"{name}: a picture stands above its heading ({part[:80]})")
    # pairs that may not break: no text of the page leaves one loose
    for node in re.split(r"<[^>]+>", re.sub(r"<(script|style|template|title)\b.*?</\1>", " ", text, flags=re.S)):
        loose = LOOSE_PAIR.search(node.replace("&nbsp;", NBSP))
        if loose:
            problems.append(f"{name}: {loose.group(0)!r} can break between its parts (buildlib.bind sets the fixed space)")
    # short last lines on a phone are the browser's to mend: every page carries the rule
    if kind != "lost" and PHONE_LINES not in text:
        problems.append(f"{name}: the page's style lacks the phone's rule for last lines ({PHONE_LINES})")
    if kind in ("home", "wing"):
        # one door a screen: the first screen's, the closing's and the phone's dock
        if len(re.findall(r'<a class="door" ', text)) != 3 or len(re.findall(r'<a class="door menu__door" ', text)) != 1:
            problems.append(f"{name}: the page needs its doors: the first screen's, the closing's, the phone's dock and the menu's")
        if 'loading="lazy"' in re.search(r"<img\b[^>]*hero__img[^>]*>", text).group(0):
            problems.append(f"{name}: the first screen's picture must not be lazy")
        if not re.search(r'<figure class="hero__plate plate" data-place="(landing|wing)"', text):
            problems.append(f"{name}: the first screen lacks its place for a showpiece")
    if kind == "wing":
        if not re.search(r'<section\b[^>]*\sid="more"', text):
            problems.append(f"{name}: a wing's page needs its section with the id more, where the wing's last step leads")
        # the order of a wing's page: its rooms, what it holds, its numbers and holders, the end of the walk, and
        # last where to read on, with the door
        main = text[text.index("<main"):text.index("</main>")]
        order = [i for i in re.findall(r'<section\b[^>]*\sid="([\w-]+)"', main)]
        want = [i for i in ("wing", "holds", "facts", "more") if i in order]
        if [i for i in order if i in want] != want or (order and order[-1] != "more"):
            problems.append(f"{name}: the page's parts stand in the order {order}: rooms, index, numbers, the end, then more, last")
        if "data-dusk" in main and main.index("data-dusk") > main.index('id="more"'):
            problems.append(f"{name}: the end of the walk stands after the part where to read on")
        # the door at the page's end stands in the end of the walk, as its last line, and the strip of ways after
        # it carries none. A wing without that part keeps the door in the strip.
        last = main[main.index('id="more"'):]
        ending = re.search(r'<section class="close close--end\b.*?</section>', main, flags=re.S)
        if ending:
            if not re.search(r'<a class="door" [^>]*>(?:(?!<a ).)*</a><p class="hero__note">(?:(?!<p).)*</p></div>\s*</div>\s*</section>$', ending.group(0), flags=re.S):
                problems.append(f"{name}: the end of the walk does not close on the door")
            if '<a class="door" ' in last:
                problems.append(f"{name}: the strip after the end of the walk carries a second door")
        elif '<a class="door" ' not in last:
            problems.append(f"{name}: the page's last part lacks the door")
        if main.count('class="tally"') > 1 or main.count('<ul class="holders">') > 1:
            problems.append(f"{name}: the numbers and the holders each stand once")
        # the ways to the rooms stand under the first screen, before what the wing shows: one line a room, and one
        # for the walk's end
        ways = re.search(r'<nav class="roomnav"[^>]*>.*?</nav>', main, flags=re.S)
        index = re.search(r'<div class="directory"><dl>(.*?)</dl>', ways.group(0), flags=re.S) if ways else None
        rooms = len(re.findall(r'<article class="room\b', main)) + (1 if ending else 0)
        if not index or len(re.findall(r'<dt><a href="#', index.group(1))) != rooms:
            problems.append(f"{name}: the ways to the rooms under the first screen are missing or lack a room")
        elif main.index('<nav class="roomnav"') > main.index('id="wing"'):
            problems.append(f"{name}: the ways to the rooms stand after what the wing shows, not under the first screen")
        # what the wing holds stands closed, its heading the way to open it
        if 'id="holds"' in main and not re.search(r'<section class="holds band" id="holds"[^>]*>\s*<div class="wrap">\s*<details class="fold" id="holds-fold">\s*<summary class="fold__sum"><h2 id="holds-h">', main):
            problems.append(f"{name}: what the wing holds does not stand closed under its heading")
        # a number's second line shows only where it has words, and every holder's row is a name over one more line
        if '<dd class="tally__text"></dd>' in main:
            problems.append(f"{name}: a number carries an empty second line")
        held = re.search(r'<ul class="holders">(.*?)</ul>', main, flags=re.S)
        if held and any(row.count("<span") != 2 for row in re.findall(r"<li>(.*?)</li>", held.group(1), flags=re.S)):
            problems.append(f"{name}: a holder's row is not a name and one line under it")
        if '<a href="#originals">' in last and 'id="originals"' not in main:
            problems.append(f"{name}: the strip leads to a list of holders the page does not carry")
    if kind == "what":
        # the holders stand in full on a wing's page only: here one sentence and the way there
        if '<ul class="holders">' in text or not re.search(r'<section id="originals">.*?<a class="more" href="[^"]*#originals"', text, flags=re.S):
            problems.append(f"{name}: the page about the museum carries the way to a wing's list of holders, never the list")
        # the way to the list is that part's first line, the sentence follows
        if not re.search(r'<section id="originals">\s*<h2>[^<]*</h2>\s*(?:<!--.*?-->\s*)?<ul class="ways">', text, flags=re.S):
            problems.append(f"{name}: under where the originals are, the link to a wing's list is not the first line")
        for part in ("mission", "who"):
            if not re.search(rf'<section id="{part}"', text):
                problems.append(f"{name}: the page about the museum lacks its part {part}")
    return problems


def check_switcher(name, text, lang, kind):
    """The ways to the other languages: with English and German alone, the one short link in the bar, the menu and the
    footer. From three on, the bar's list and the menu's and the footer's, each the languages the page offers, in the
    table's order, each in its own name, language and hreflang, the page's own marked, no other language anywhere."""
    problems = []
    shown = L.shown(lang)
    links = re.findall(r'<a\b[^>]*\shreflang="([\w-]+)"[^>]*>(.*?)</a>', text)
    named = [(tag, html_text(t)) for tag, t in links if html_text(t) in {e["name"] for e in L.entries.values()}]
    if not many(lang):
        other = L.html("de" if lang == "en" else "en")
        if [tag for tag, _ in named] != [other] * 3 or len(re.findall(r'<a [^>]*lang="%s" hreflang="%s">' % (other, other), text)) != 3:
            problems.append(f"{name}: the short link to the other language does not stand in the bar, the menu and the footer")
        return problems
    want = [(L.html(x), L.entries[x]["name"]) for x in shown]
    lists = re.findall(r'<ul class="(langs__list|menu__list menu__list--langs|foot__langs)">(.*?)</ul>', text, flags=re.S)
    if [k for k, _ in lists] != ["langs__list", "menu__list menu__list--langs", "foot__langs"]:
        problems.append(f"{name}: the languages do not stand in the bar's list, the menu's and the footer's")
    for where, block in lists:
        got = re.findall(r'<li><a href="[^"]*" lang="([\w-]+)" hreflang="\1"( aria-current="page")?>([^<]*)</a></li>', block)
        if [(tag, html_text(n)) for tag, _, n in got] != want or [tag for tag, cur, _ in got if cur] != [L.html(lang)]:
            problems.append(f"{name}: the list {where} is not {[n for _, n in want]} with the page's own marked")
    others = sorted({tag for tag, _ in named} - {t for t, _ in want})
    if others:
        problems.append(f"{name}: links to {others}, which the page does not offer")
    if not re.search(r'<summary class="lang langs__btn"><span class="vh">[^<]+ </span>%s</summary>' % lang.split("-")[0].upper(), text):
        problems.append(f"{name}: the bar's control does not show the page's own language")
    return problems


def check_switches(out, site):
    """The two switches, on every page of the built folder, the topic pages included. The project line: once on
    a page, inside the header, linked to who runs the museum, or on no page at all. The link to the code: on no
    page while its switch is off."""
    problems = []
    for path in sorted(out.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        name = path.relative_to(out)
        lines = re.findall(r'<p class="project project--(\w+)"><a href="([^"]*)">(.*?)</a></p>', text)
        if not PROJECT_LINE:
            if lines or 'class="project' in text or BY_RULE in text:
                problems.append(f"{name}: the project line is switched off and the page still carries it")
        else:
            lang = page_lang(text)
            head = re.search(r'<header class="masthead">.*?</header>', text, flags=re.S)
            if len(lines) != 1 or not head or 'class="project' not in head.group(0):
                problems.append(f"{name}: the project line stands {len(lines)} times, or not in the header")
            elif lines[0][0] != PROJECT_LINE_AT or not lines[0][1].endswith("/#who") or (
                    lang in LOCKED and html_text(lines[0][2]) != space(LOCKED[lang]["project"], lang)):
                problems.append(f"{name}: the project line is not the decided line, linked to who runs the museum")
        # the trust line of the state on every page, and while the repository is closed no other word of open
        # source anywhere in the file (attributes and data included) but the sentence that names the licence
        lang = page_lang(text)
        bare = " ".join(html_text(re.sub(r"<(script|style)\b.*?</\1>", "", text, flags=re.S)).split())
        if lang in LOCKED and space(LOCKED[lang]["trust" if SOURCE_LINK else "trust_before"], lang) not in bare:
            problems.append(f"{name}: the trust line of this state ({'with' if SOURCE_LINK else 'without'} Open Source) is not on the page")
        if "quelloffen" in text.lower():
            problems.append(f"{name}: the page says quelloffen (the house writes Open Source)")
        if not SOURCE_LINK:
            licence = " ".join(html_text(site.words_html[lang]["page_what.s6_before"]).split())
            opened = RULES[lang]["open_word"] if lang in RULES else OPEN_WORD
            allowed = len(re.findall(opened, licence, flags=re.I)) if licence in bare else 0
            said = len(re.findall(opened, text, flags=re.I))
            if said != allowed:
                problems.append(f"{name}: the repository is closed and the page says open source {said} times "
                                f"({allowed} allowed, in the sentence that names the licence)")
        linked = f'href="{SOURCE}"' in text or SOURCE_TO in text
        if linked and not SOURCE_LINK:
            problems.append(f"{name}: the link to the source code is switched off and the page still carries it")
        if SOURCE_LINK and f'href="{SOURCE}"' not in text:
            problems.append(f"{name}: the link to the source code is switched on and the page's footer lacks it")
    return problems


def check_fonts(site):
    """A holder's name is set in the sans. Every letter of every holder's name must be in the site's cut of that
    font (fonts.json, written by tools/make_fonts.py): a letter outside it would come from another typeface.
    Every holder's row has one form, a name and one line under it, and in two columns each stays on one line:
    a holder without that second line, or with a name too long for a column, stops the build."""
    at = SRC / "fonts.json"
    if not at.is_file():
        return ["fonts.json is missing: run tools/make_fonts.py"]
    cuts = {k: {c for a, b in v for c in range(a, b + 1)} for k, v in load(at).items() if not k.startswith("_")}
    problems = []
    for lang in LANGS:
        missing = [key for _, _, key in LANG_FACES.get(lang, ()) if key not in cuts]
        if missing:
            problems.append(f"fonts.json lacks {missing}, the faces {lang} is set in: run tools/make_fonts.py --list")
    if problems:
        return problems
    for lang in LISTED:
        # every letter a listed language's words carry, the narrow spaces the build sets included, is in its faces
        serif, sans = face_keys(lang)
        texts = list(site.words[lang].values()) + list(strings(site.privacy[lang]).values())
        texts += [t for d in site.data_raw.values() for t in strings(d[lang]).values()]
        letters = {ch for t in texts if isinstance(t, str) for ch in bind(t, lang)} - set("\n\t")
        lost = sorted(ch for ch in letters if ord(ch) not in cuts[serif] | cuts[sans])
        if lost:
            problems.append(f"{lang}: {''.join(lost)!r} ({', '.join(f'U+{ord(c):04X}' for c in lost)}) is in neither of its faces "
                            f"({serif}, {sans} in fonts.json): another typeface would set it")
    for slug, facts in site.facts.items():
        for h in facts.get("holders", []):
            for lang in LANGS:
                held = cuts[face_keys(lang)[1]]
                if not h["note"][lang].strip():
                    problems.append(f"wings: the holder {h['id']} ({lang}) has no town or note: every row of the list is a name and a line under it")
                long = max(len(h["name"][lang]), len(h["note"][lang]))
                if long > R.HOLDER_NAME_MAX:
                    problems.append(f"wings: the holder {h['id']} ({lang}) has a line of {long} characters: over {R.HOLDER_NAME_MAX} it "
                                    f"does not fit one line of a column at {R.HOLDERS_TWO} px (render.py, HOLDERS_TWO, and rest.css)")
                missing = sorted({ch for ch in h["name"][lang] + h["note"][lang] if ord(ch) not in held})
                if missing:
                    problems.append(f"wings: the holder {h['id']} ({lang}) uses {''.join(missing)!r}, which the site's sans does not hold")
    return problems


def face_keys(lang):
    """The keys in fonts.json of the serif and the sans a language is set in."""
    own = LANG_FACES.get(lang)
    return (own[0][2], own[1][2]) if own else ("serif", "sans")


def check_gone(out, site):
    """No page in the built folder, the topic pages included, carries a line of an earlier state, or one of the
    statements no page may make."""
    problems = []
    for path in sorted(out.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        plain = " ".join(shown_text(text).split())
        for line in GONE + tuple(x for code in L.order for x in RULES[code]["gone"]):
            if line in text or line in plain:
                problems.append(f"{path.relative_to(out)}: the page still carries {line!r}")
        low = plain.lower()
        for pattern, instead in ON_EVERY_PAGE:
            # a test's stand-in wings carry stand-in words: they are read for the real wings' statements only
            found = re.search(pattern, low)
            if found and not (site.mark and "stand-in" in low):
                problems.append(f"{path.relative_to(out)}: the page says {found.group(0)!r} ({instead})")
    return problems


def check_mail(out):
    """Every mail address in every page and every other text file the build writes, the topic pages included, is
    the museum's own, as written and with its entities resolved. The fonts' licence texts stay as their authors
    wrote them."""
    import html
    problems = []
    for path in sorted(p for p in out.rglob("*") if p.is_file() and not p.name.startswith("LICENSE")
                       and (p.suffix in (".html", ".js", ".css", ".xml", ".txt") or p.name == "_redirects")):
        text = path.read_text(encoding="utf-8")
        for found in sorted(set(re.findall(MAIL_SHAPE, text)) | set(re.findall(MAIL_SHAPE, html.unescape(text)))):
            if found != MAIL:
                problems.append(f"{path.relative_to(out)}: the mail address {found!r} is not the museum's ({MAIL})")
    return problems


def check_menu(out, built, site):
    """The same menu on every page: the same entries in the same order, whatever the page's depth. Its wings stand
    in the order of time, by the year each shows."""
    problems, seen = [], {}
    by_name = {lang: {e["name"][lang]: e.get("when") for s, e in site.wings.items() if s in site.open} for lang in LANGS}
    for path, text, kind, lang in built:
        if kind == "lost":
            continue
        menu = re.search(r'<details class="menu".*?</details>', text, flags=re.S)
        if not menu:
            problems.append(f"{path.relative_to(out)}: the menu is missing")
            continue
        entries = [html_text(x) for x in re.findall(r"<a\b[^>]*>(.*?)</a>", menu.group(0), flags=re.S)]
        entries = [e for e in entries if e not in {x["name"] for x in L.entries.values()}]
        if seen.setdefault(lang, entries) != entries:
            problems.append(f"{path.relative_to(out)}: its menu differs from the other {lang} pages")
        for block in re.findall(r'<ul class="menu__list">(.*?)</ul>', menu.group(0), flags=re.S):
            years = [by_name[lang].get(html_text(x)) for x in re.findall(r"<a\b[^>]*>(.*?)</a>", block, flags=re.S)]
            if None in years or years != sorted(years):
                problems.append(f"{path.relative_to(out)}: the menu's wings are not in the order of time ({years})")
    return problems


def crawl(out, site):
    """Every link of every built page leads to a built page, to a wing's door, or out of the site."""
    problems = []
    doors = {e["door"][l] for e in site.wings.values() if e.get("state") == "open" for l in LANGS}
    stops = {stop for f in site.facts.values() for stop in f.get("stops", [])}
    # a test build leaves the topic pages out: their addresses stand in the registry and are built by their own build
    topics = {f'{e["page"][l].strip("/")}/{t["slug"][l]}' for e in site.wings.values() if e.get("state") == "open"
              for t in e.get("topics", []) for l in languages.topic_langs(t, LANGS)} if site.mark else set()
    for path in sorted(out.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        name = path.relative_to(out)
        ids = set(re.findall(r'\sid="([^"]+)"', text))
        for ref in sorted(set(re.findall(r'<a\b[^>]*\bhref="([^"]+)"', text))):
            import html as _h
            ref = _h.unescape(ref)
            if re.match(r"(https?:|mailto:)", ref) or ref in doors or (ref == SOURCE and SOURCE_LINK):
                continue
            door, _, at = ref.partition("#s=")
            if door in doors and at in stops:
                continue
            if ref.startswith("/w/"):
                problems.append(f"{name}: the door {ref} belongs to no open wing")
                continue
            target, _, frag = ref.partition("#")
            if not target:
                if frag and frag not in ids:
                    problems.append(f"{name}: #{frag} has no target on the page")
                continue
            there = (out / target.lstrip("/")) if target.startswith("/") else (path.parent / target)
            there = there.resolve()
            page = there / "index.html" if there.is_dir() else there
            if topics and out.resolve() in there.parents and str(there.relative_to(out.resolve())) in topics:
                continue
            if not page.is_file() or out.resolve() not in page.parents:
                problems.append(f"{name}: the link {ref} leads nowhere")
            elif frag and f'id="{frag}"' not in page.read_text(encoding="utf-8"):
                problems.append(f"{name}: {ref} has no target on that page")
    return problems


def main():
    check_outside()
    try:
        run()
    finally:
        for why in SKIPPED:
            print(f"Skipped, its file is not at hand (not a failure): {why}")


def run():
    if "--test" in sys.argv:
        from testdata import registries as testdata
        only = [a for a in sys.argv[sys.argv.index("--test") + 1:] if not a.startswith("-")]
        for name, registry, wing_dirs, pic_dirs in testdata.registries(load(SRC / "registry.json"), SRC, TEST_OUT, IMG):
            if only and name not in only:
                continue
            out = TEST_OUT / name
            if out.exists():
                shutil.rmtree(out)
            build(out, registry, wing_dirs, mark=f"Test registry: {name}. Stand-in wings, never public.", quiet=True, more_pics=pic_dirs)
            print(f"_test/{name}: built, {sum(1 for _ in out.rglob('*.html'))} pages")
        return
    if "--switches" in sys.argv:
        # every other state of the switches builds and passes too: into _test/, never into dist/
        global PROJECT_LINE, PROJECT_LINE_AT, SOURCE_LINK
        keep = (PROJECT_LINE, PROJECT_LINE_AT, SOURCE_LINK)
        other_at = "over" if PROJECT_LINE_AT == "under" else "under"
        for name, state in (("line-off", (not keep[0], keep[1], keep[2])), (f"line-{other_at}", (True, other_at, keep[2])),
                            ("source-" + ("off" if keep[2] else "on"), (keep[0], keep[1], not keep[2]))):
            PROJECT_LINE, PROJECT_LINE_AT, SOURCE_LINK = state
            out = TEST_OUT / f"switch-{name}"
            if out.exists():
                shutil.rmtree(out)
            build(out, load(SRC / "registry.json"), [SRC / "wings"], quiet=True)
            print(f"_test/switch-{name}: built, {sum(1 for _ in out.rglob('*.html'))} pages, all checks passed")
        PROJECT_LINE, PROJECT_LINE_AT, SOURCE_LINK = keep
        return
    # what an earlier build left behind and no page asks for any more
    asked = {"site.js", COUNT_SCRIPT, ask.SCRIPT, R.FILM["script"], R.FILM["music_script"]} | set(re.findall(r'"script": "([^"]+)"', "".join(p.read_text(encoding="utf-8") for p in (SRC / "wings").glob("*.json"))))
    for old in [(SITE / WHAT_DIR["en"]).with_suffix(".html"), (SITE / "de" / WHAT_DIR["de"]).with_suffix(".html")] + [
            p for p in (SITE / STATIC).glob("*.js") if p.name not in asked and (SRC / "js" / p.name).is_file()]:
        if old.exists():
            old.unlink()
    # the pages and faces of a language that has left the site
    for code in L.left:
        for gone in (SITE / L.folder(code), SITE / STATIC / "fonts" / code):
            if gone.is_dir():
                shutil.rmtree(gone)
    # --no-topics builds the site's own pages only, for work on them while the topic pages are being changed
    build(SITE, load(SRC / "registry.json"), [SRC / "wings"], topics="--no-topics" not in sys.argv)


if __name__ == "__main__":
    main()
