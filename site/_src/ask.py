"""The question for visitors from our Google Ad Grants ads (js/ask.js and css/ask.css). The edge puts the script on an
asked page (functions/_entry/rules.js), and the privacy page carries it for the button that takes a yes back. The
build writes the script with every built language's words in it and the card's sheet beside it, then checks what
the entry depends on: the script, the walk's sender and the function name the same rules, every privacy page has
its section and its button's place, and every way into the walk opens in the same tab, where the tab's entry is.
Standard library only."""
import json
import re
from pathlib import Path

from buildlib import css

SRC = Path(__file__).resolve().parent
SCRIPT = "ask.js"
SHEET = "ask.css"
WORDS_MARK = "{/*words*/}"
RULES = SRC.parent / "functions" / "_entry" / "rules.js"
WALK_SENDER = SRC.parent.parent / "museum" / "src" / "core" / "museum-entry.ts"
# The privacy section the card links to, and the place of its button.
SECTION = "question"
# What every language holds: the privacy page's button and its lines work in each, card or none.
KEYS = ("held", "none", "undo", "undone")
# The card asks only in a language that holds every one of these. The first layer is the question, the two paragraphs,
# the line on age, the two answers and the two visible links; the second layer (how_*) opens inside the card, and its
# last line links to the privacy page.
CARD_KEYS = ("kicker", "question", "text", "text2", "under16", "tell", "decline", "more", "google", "newtab", "close",
             "dismiss", "how_number", "how_sent", "how_account", "how_age", "full", "told")
# The card on a topic page of a wing in the making, where a yes counts the visit alone: its own words for what a yes
# sends, for the second layer and for the line after a yes.
VISIT_KEYS = ("visit_text", "visit_text2", "visit_how_sent", "visit_how_account", "visit_how_age", "visit_told")
# The keys of the card that asked on arrival, which lacked the lines the legal read requires: a language still
# holding them shows no card until its translator writes the keys above in their place.
RETIRED_KEYS = ("q", "why", "what", "whom", "age", "yes", "no", "thanks", "visit_what", "visit_whom", "visit_thanks")
# Of the card's keys, those the old card held too, with the same words: they alone do not make a card.
KEPT_KEYS = ("kicker", "more", "google", "newtab", "close", "dismiss")
# The two languages the card's words are written in first: the build stops if either lacks the card.
CARD_FIRST = ("en", "de")


def section_extra(section):
    """What a privacy section adds to the page: its own id and the button's place, for the section of the question."""
    return (SECTION, '\n        <div class="undo" data-undo hidden></div>') if section.get("ask") is True else (None, "")


def _rule(text, name):
    m = re.search(rf"export const {name} = ([^\n]+)", text)
    return m.group(1).strip() if m else None


def write(out, static, words, privacy_pages, visit_langs=()):
    """Writes the script, with every built language's words, and its sheet into the built folder. Returns the
    problems found, as a list of lines. words: {html lang: {key: text}}; privacy_pages: {html lang: the privacy
    page's address from the site's root}; visit_langs: the html langs of the pages where a yes counts the visit alone."""
    out = Path(out)
    problems = []
    source = (SRC / "js" / SCRIPT).read_text(encoding="utf-8")
    table = {}
    for lang, w in words.items():
        missing = [k for k in KEYS if not (w.get(k) or "").strip()]
        if missing:
            problems.append(f"words ({lang}): the privacy page's button lacks ask.{', ask.'.join(missing)}")
        new = [k for k in CARD_KEYS + VISIT_KEYS if k in w and k not in KEPT_KEYS]
        card = [k for k in CARD_KEYS + (VISIT_KEYS if lang in visit_langs else ()) if not (w.get(k) or "").strip()]
        if lang in CARD_FIRST and card:
            problems.append(f"words ({lang}): the question lacks ask.{', ask.'.join(card)}")
        elif new and card:
            problems.append(f"words ({lang}): the question is half written, it lacks ask.{', ask.'.join(card)}")
        old = [k for k in RETIRED_KEYS if k in w]
        if new and old:
            problems.append(f"words ({lang}): the question's new words stand beside the old ask.{', ask.'.join(old)}")
        table[lang] = {k: w[k] for k in KEYS + CARD_KEYS + VISIT_KEYS if w.get(k) is not None} | {"privacy": "/" + privacy_pages[lang]}
    if source.count(WORDS_MARK) != 1:
        problems.append(f"js/{SCRIPT}: the place of the words ({WORDS_MARK}) stands {source.count(WORDS_MARK)} times, not once")
    text = source.replace(WORDS_MARK, json.dumps(table, ensure_ascii=False, separators=(",", ":")), 1)
    (out / static / SCRIPT).write_text(text, encoding="utf-8")
    (out / static / SHEET).write_text(css("ask"), encoding="utf-8")
    return problems


# The script's guard: a page of a wing in the making (its main element marked) is never asked.
UNASKED_GUARD = "if (doc.querySelector('main[data-unasked]')) return;"
# Where the script learns that a yes on this page counts the visit alone.
VISIT_GUARD = "doc.querySelector('main[data-asks=\"visit\"]')"


def check(out, static, privacy_pages, unasked=(), asked=None, topics_built=True):
    """The built folder against what the entry depends on. unasked: the addresses (from the site's root) under
    which pages are never asked, as the count's lists name them for the edge; asked: {kind: [address, ...]}, the
    pages among them that ask all the same, a yes there counting the visit alone; topics_built: whether this build made
    the topic pages (a test registry and --no-topics do not). Returns the problems found, as a list of lines."""
    out = Path(out)
    problems = []
    source = (SRC / "js" / SCRIPT).read_text(encoding="utf-8")
    rules = RULES.read_text(encoding="utf-8")
    if UNASKED_GUARD not in source:
        problems.append(f"js/{SCRIPT}: does not hold its guard for the pages that are never asked ({UNASKED_GUARD})")
    if "import { ASKED_MAKING, UNASKED } from '../_count/lists.js'" not in rules or "!unasked(pathname)" not in rules \
            or "if (askedMaking(rest)) return false" not in rules:
        problems.append(f"{RULES.name}: the edge does not leave out the pages the count's lists name as never asked, "
                        "or does not ask the topic pages of a wing in the making")
    if VISIT_GUARD not in source:
        problems.append(f"js/{SCRIPT}: does not tell the pages where a yes counts the visit alone ({VISIT_GUARD})")
    asking = {a for pages in (asked or {}).values() for a in pages}
    for path in sorted(out.rglob("index.html")):
        page = ("/" + str(path.parent.relative_to(out)).replace(".", "", 1).strip("/") + "/").replace("//", "/")
        text = path.read_text(encoding="utf-8")
        if re.search(r"<main\b[^>]*\sdata-unasked[\s>]", text) and (not any(page.startswith(u) for u in unasked) or page in asking):
            problems.append(f"{page}: the page is marked never to be asked, and the edge would ask it (UNASKED in the count's lists)")
        marked = bool(re.search(r'<main\b[^>]*\sdata-asks="visit"', text))
        if marked != (page in asking):
            problems.append(f"{page}: the page is {'' if marked else 'not '}marked to count a yes as the visit alone, and the "
                            f"count's lists {'do not name it' if marked else 'name it'} (ASKED_MAKING)")
        if marked and re.search(r'\sdata-door=|href="[^"]*/w/', text):
            problems.append(f"{page}: a yes there counts the visit alone, and the page has a way into the walk")
    for page in sorted(asking) if topics_built else ():
        if not (out / page.strip("/") / "index.html").is_file():
            problems.append(f"{page}: the count's lists name a page that asks, and it is not built")
    shared = {"CLICK": _rule(rules, "CLICK"), "ENTRY_KEY": _rule(rules, "ENTRY_KEY"), "GRANT_PREFIX": _rule(rules, "GRANT_PREFIX"),
              "WALK_PREFIX": _rule(rules, "WALK_PREFIX"), "YES_MAX_AGE_MS": _rule(rules, "YES_MAX_AGE_MS")}
    if None in shared.values():
        return problems + [f"{RULES.name}: the entry's rules cannot be read"]
    script_rules = {"CLICK": f"var CLICK = {shared['CLICK']};", "ENTRY_KEY": f"var ENTRY_KEY = {shared['ENTRY_KEY']};",
                    "GRANT_PREFIX": f"var GRANT = {shared['GRANT_PREFIX']}, WALK = {shared['WALK_PREFIX']};",
                    "YES_MAX_AGE_MS": f"var YES_MAX_AGE_MS = {shared['YES_MAX_AGE_MS']};"}
    for name, line in script_rules.items():
        if line not in source:
            problems.append(f"js/{SCRIPT}: does not hold the entry's rule {name} as {RULES.name} does ({line})")
    if WALK_SENDER.is_file():
        walk = WALK_SENDER.read_text(encoding="utf-8")
        for name in ("CLICK", "ENTRY_KEY", "YES_MAX_AGE_MS"):
            if f"const {name} = {shared[name]}" not in walk:
                problems.append(f"{WALK_SENDER.name}: does not hold the entry's rule {name} as {RULES.name} does")

    for lang, page in privacy_pages.items():
        path = out / page / "index.html"
        if not path.is_file():
            problems.append(f"{page}: the privacy page of {lang} is not built")
            continue
        html = path.read_text(encoding="utf-8")
        if html.count(f'<section id="{SECTION}">') != 1 or html.count("data-undo") != 1:
            problems.append(f"{page}: the privacy page has no one section #{SECTION} with the place of its button")
        if not re.search(rf'<script src="[^"]*{re.escape(static)}/{SCRIPT}" defer></script>', html):
            problems.append(f"{page}: the privacy page does not carry {SCRIPT}")
    # the tab's entry is in this tab only: a way into the walk that opened another would lose it
    for path in sorted(out.rglob("*.html")):
        for a in re.findall(r"<a\b[^>]*\bdata-door=[^>]*>", path.read_text(encoding="utf-8")):
            if re.search(r"\starget=", a):
                problems.append(f"{path.relative_to(out)}: a way into the walk opens another tab or window ({a})")
    return problems
