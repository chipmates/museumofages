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
KEYS = ("kicker", "q", "why", "what", "yes", "no", "more", "newtab", "close", "dismiss", "thanks", "undo", "undone", "held", "none")


def section_extra(section):
    """What a privacy section adds to the page: its own id and the button's place, for the section of the question."""
    return (SECTION, '\n        <div class="undo" data-undo hidden></div>') if section.get("ask") is True else (None, "")


def _rule(text, name):
    m = re.search(rf"export const {name} = ([^\n]+)", text)
    return m.group(1).strip() if m else None


def write(out, static, words, privacy_pages):
    """Writes the script, with every built language's words, and its sheet into the built folder. Returns the
    problems found, as a list of lines. words: {html lang: {key: text}}; privacy_pages: {html lang: the privacy
    page's address from the site's root}."""
    out = Path(out)
    problems = []
    source = (SRC / "js" / SCRIPT).read_text(encoding="utf-8")
    table = {}
    for lang, w in words.items():
        missing = [k for k in KEYS if not (w.get(k) or "").strip()]
        if missing:
            problems.append(f"words ({lang}): the question lacks ask.{', ask.'.join(missing)}")
        table[lang] = {k: w.get(k, "") for k in KEYS} | {"privacy": "/" + privacy_pages[lang]}
    if source.count(WORDS_MARK) != 1:
        problems.append(f"js/{SCRIPT}: the place of the words ({WORDS_MARK}) stands {source.count(WORDS_MARK)} times, not once")
    text = source.replace(WORDS_MARK, json.dumps(table, ensure_ascii=False, separators=(",", ":")), 1)
    (out / static / SCRIPT).write_text(text, encoding="utf-8")
    (out / static / SHEET).write_text(css("ask"), encoding="utf-8")
    return problems


def check(out, static, privacy_pages):
    """The built folder against what the entry depends on. Returns the problems found, as a list of lines."""
    out = Path(out)
    problems = []
    source = (SRC / "js" / SCRIPT).read_text(encoding="utf-8")
    rules = RULES.read_text(encoding="utf-8")
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
