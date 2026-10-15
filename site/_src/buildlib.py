"""The build's shared tools: escaping, numbers as a language writes them, the style and font rules, the content
security policy and the template filler. Standard library only. build.py imports from here."""
import base64
import hashlib
import html
import json
import re
import urllib.parse
from pathlib import Path

SRC = Path(__file__).resolve().parent


# Characters and words no displayed sentence may carry.
BANNED = ["—", "–", ";", "delve", "tapestry", "landscape", "leverage", "quelloffen", "utilize", "multifaceted"]


ARROW = (
    '<svg class="arrow" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'
    '<path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" '
    'stroke-linecap="square"/></svg>'
)


# The web fonts come in after the first paint: the rules wait in a style block the browser ignores,
# and this switches it on once the first screen's picture is in (or at once where there is none).
FACES_SCRIPT = (
    "<script>(function(){var f=document.getElementById('faces'),i=document.querySelector('.hero__img'),d=0;"
    "function on(){if(!d){d=1;f.media='all'}}"
    "if(!i){requestAnimationFrame(function(){setTimeout(on,0)});return}"
    "if(i.complete)on();else{i.addEventListener('load',on);i.addEventListener('error',on);setTimeout(on,2500)}"
    "})()</script>"
)


# The styles below the first screen load as a print sheet, which blocks nothing, and this turns them on.
REST_SCRIPT = (
    "<script>(function(){var l=document.getElementById('rest');if(!l)return;"
    "function on(){l.media='all'}if(l.sheet)on();else l.addEventListener('load',on)})()</script>"
)


def flatten(obj, prefix=""):
    out = {}
    for key, value in obj.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            out.update(flatten(value, path + "."))
        else:
            out[path] = value
    return out


def esc(text):
    return html.escape(text, quote=True)


# The layers behind disclosures stand closed in the HTML, as the phone wants them. The desktop opens them
# here, straight after the block and before it is ever painted. Without scripts they open on a click.
LAYERS_SCRIPT = (
    "<script>(function(){var m=window.matchMedia&&matchMedia('(min-width:960px)');if(!m)return;"
    "function set(){var d=document.querySelectorAll('.layers details');"
    "for(var i=0;i<d.length;i++)d[i].open=m.matches}"
    "if(m.matches)set();if(m.addEventListener)m.addEventListener('change',set)})()</script>"
)


# The company's name is never hyphenated, in whatever case it stands. The compound of the German trust line never
# breaks at its hyphen, and in the trust line its article stays with it, so the line breaks after "Open Source ·".
ORG_RE = re.compile(r"gemeinnützigen?\b")


WHOLE_WORD = "Tracking-Cookies"


WHOLE_RE = re.compile(r"(?:Keine )?" + WHOLE_WORD)


def sign_whole(text):
    """A reference to a law keeps each sign with its number at a line's end: § 5, Art. 6, Abs. 1, Nr. 2, lit. f."""
    return re.sub(r"(§§?|\b(?:Art|Abs|Nr|lit)\.) (?=[0-9a-z])", "\\1\u00a0", text)


def keep_whole(text):
    text = ORG_RE.sub(lambda m: f'<span class="nh">{m.group(0)}</span>', sign_whole(text))
    return WHOLE_RE.sub(lambda m: f'<span class="nw">{m.group(0)}</span>', text)


NBSP = "\u00a0"


# Pairs a line never breaks inside: a stop and its number, a number and its unit, a size of two numbers. The build
# binds them in every sentence it sets, so no slot carries a special character. build.py reads every built page
# for a pair left loose (LOOSE_PAIR).
# The units of the other languages. A language's own file (lang/<code>.json, "units") may add more.
UNITS_MORE = {
    "fr": "mètres?|centimètres?|kilomètres?|secondes?|jours?|ans|années?|heures?|pour cent",
    "it": "metri|metro|centimetri|chilometri|secondi|giorni|anni|ore|per cento",
    "es": "metros?|centímetros?|kilómetros?|segundos?|días?|años?|horas?|por ciento",
    "pt-BR": "metros?|centímetros?|quilômetros?|segundos?|dias?|anos?|horas?|por cento",
    "bg": "метра|метър|сантиметра|километра|секунди|секунда|дни|ден|години|година|часа|процента|м|см|км",
}
UNIT = (r"(?:Metern?|metres?|meters?|Zentimetern?|centimetres?|Kilometern?|kilometres?|cm|mm|km|m|Kilowatt|kilowatts?|"
        r"Sekunden?|seconds?|Tagen?|days?|Jahren?|years?|Uhr|Prozent|percent)")
TIMES = r"(?:mal|by|×)"
# The other languages' units are read for a loose pair too, on every page.
ANY_UNIT = "(?:" + UNIT[3:-1] + "|" + "|".join(UNITS_MORE.values()) + ")"
LOOSE_PAIR = re.compile(rf"(?i:\b(?:Station|Stop)) \d|\d {TIMES}[ {NBSP}]\d|\d{NBSP}{TIMES} \d|\d {ANY_UNIT}\b")
# What a language may add to its pairs, from its own file (lang/<code>.json): units and the word for a stop.
MORE = {}


def bind(text, lang=None):
    """Sets a fixed space inside every pair that may not break: "Station 7", "34 Meter", "8,8 mal 4,6 Meter".
    In French it also sets the narrow space its punctuation takes (space())."""
    more = MORE.get(lang, {})
    stops = "|".join(["Station", "Stop"] + more.get("stop", []))
    text = re.sub(rf"\b({stops}) (?=\d)", "\\1" + NBSP, text, flags=re.I)
    text = re.sub(rf"(\d) ({TIMES}) (?=\d)", "\\1" + NBSP + "\\2" + NBSP, text)
    extra = [UNITS_MORE[lang]] if lang in UNITS_MORE else []
    extra += more.get("units", [])
    unit = "(?:" + UNIT[3:-1] + "".join("|" + u for u in extra) + ")" if extra else UNIT
    return space(re.sub(rf"(\d) (?={unit}\b)", "\\1" + NBSP, text), lang)


NNBSP = "\u202f"


def space(text, lang):
    """French punctuation as the build sets it, never the writer: a narrow no-break space before : ! ? and inside
    « ». A colon between digits or in an address stays as it is."""
    if lang != "fr":
        return text
    text = re.sub(r"«[ \u00a0\u202f]*", "«" + NNBSP, text)
    text = re.sub(r"[ \u00a0\u202f]*»", NNBSP + "»", text)
    return re.sub(r"(?<=[^\s\u202f:!?])[ \u00a0]?([:!?]+)(?=[\s»)\]]|$)", NNBSP + r"\1", text)


def tail(text, least=12, most=26, short=False):
    """A paragraph never ends on a line of one or two short words: its last words are bound to each other until
    they are `least` characters long. A browser's own care for last lines does not reach this far. A line under
    sixty characters is left alone unless short is set."""
    if (len(text) < 60 and not short) or " " not in text:
        return text
    words = text.split(" ")
    n, size = 1, len(words[-1])
    while size < least and n < min(len(words) - 1, 4):
        n += 1
        size += 1 + len(words[-n])
    if size > most and n > 2:
        n -= 1
    return text if n == 1 else " ".join(words[:-n]) + " " + NBSP.join(words[-n:])


def whole_names(text, names):
    """A name of several words never breaks inside a sentence."""
    for name in names:
        if name in text:
            text = text.replace(name, name.replace(" ", NBSP))
    return text


# Numbers as words, for a wing's {word:<name>}: a number in a sentence is read from the facts file either way.
WORDS = {
    "en": "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen "
          "eighteen nineteen twenty".split(),
    "de": "null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn "
          "achtzehn neunzehn zwanzig".split(),
}


# How each language writes a number: the mark between thousands, the decimal mark, and the fewest digits the
# whole part needs before it takes the mark (Spanish groups from five).
NUMBERS = {"en": (",", ".", 4), "de": (".", ",", 4), "fr": (NNBSP, ",", 4), "it": (".", ",", 4), "es": (NNBSP, ",", 5),
           "pt-BR": (".", ",", 4), "bg": (NBSP, ",", 4)}


def number(value, lang, places=None):
    """A number as the language writes it: 1,158 and 8.8 in English, 1.158 and 8,8 in German. A text stays as it is."""
    if isinstance(value, str):
        return value
    sep, point, least = NUMBERS[lang]
    if places is not None:
        text = f"{value:,.{places}f}"
    elif isinstance(value, float) and value != int(value):
        text = f"{value:,}"
    else:
        text = f"{int(value):,}"
    whole, _, part = text.partition(".")
    if len(whole.replace(",", "").lstrip("-")) < least:
        whole = whole.replace(",", "")
    return whole.replace(",", sep) + (point + part if part else "")


def number_word(value, lang):
    words = WORDS.get(lang) or []
    if not words:
        raise SystemExit(f"{lang} has no number words yet: lang/{lang}.json lists them from zero to twenty (number_words)")
    if not isinstance(value, int) or not 0 <= value < len(words):
        raise SystemExit(f"{value!r} has no word here: write it in digits, with {{count:<name>}}")
    return words[value]


def dump(graph):
    text = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
    return text.replace("</", "<\\/")


# ---------- the licence of the museum's own pictures, in a form image search reads ----------

FREE_PICTURES = frozenset(json.loads((SRC / "free-pictures.json").read_text(encoding="utf-8"))["stems"])
# Stills of the house or its grounds: ours under CC BY-SA 4.0 only together with the credit of the map data they rest on.
MAP_PICTURES = frozenset(json.loads((SRC / "free-pictures.json").read_text(encoding="utf-8"))["with_map_credit"])
# Pictures that rest on others' works whose licences ask for credit: those credits by the picture's stem, in the
# list's order.
PICTURE_CREDITS = {}
for _credit, _stems in json.loads((SRC / "free-pictures.json").read_text(encoding="utf-8")).get("credits", {}).items():
    for _stem in _stems:
        PICTURE_CREDITS.setdefault(_stem, []).append(_credit)
PICTURE_FILE = re.compile(r"^(.+?)-\d+(?:x\d+)?\.(?:webp|avif|jpg|png)$")
LICENCE_FIELDS = ("license", "acquireLicensePage", "creditText", "copyrightNotice", "creator")
LD_BLOCK = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', flags=re.S)


def picture_stem(url):
    found = PICTURE_FILE.match(url.split("?", 1)[0].rsplit("/", 1)[-1])
    return found.group(1) if found else None


def image_objects(node):
    """Every ImageObject in a graph, nested ones too."""
    if isinstance(node, dict):
        if node.get("@type") == "ImageObject":
            yield node
        for value in node.values():
            yield from image_objects(value)
    elif isinstance(node, list):
        for value in node:
            yield from image_objects(value)


def licence_problems(text, name):
    """Licence data on a picture that is not the museum's own to give away, or on a still of the house without the
    credit of its map data."""
    problems = []
    for block in LD_BLOCK.findall(text):
        for image in image_objects(json.loads(block[1].replace("<\\/", "</"))):
            url = image.get("contentUrl") or image.get("url") or ""
            stem = picture_stem(url)
            if not any(k in image for k in LICENCE_FIELDS) or stem in FREE_PICTURES:
                continue
            if stem not in MAP_PICTURES:
                problems.append(f"{name}: {url or 'an image'} carries licence data, and free-pictures.json does not name it")
            elif map_line() not in image.get("creditText", ""):
                problems.append(f"{name}: {url} rests on map data, and its creditText does not name it")
    return problems


def map_line():
    """The credit of the map data, as the note on our pictures gives it to copy (the same English in every language)."""
    return json.loads((SRC / "words.en.json").read_text(encoding="utf-8"))["page_what"]["use_map"]


def picture_terms(lang, note_url, map_data=False):
    """The licence data of each of the museum's own pictures, in a page's language: the licence, the page that tells
    how to use them, and the credit and the notice from the site's words (pictures). A still of the house or its
    grounds (map_data) adds the map data's credit to its own."""
    words = json.loads((SRC / f"words.{lang}.json").read_text(encoding="utf-8"))["pictures"]
    return {"license": "https://creativecommons.org/licenses/by-sa/4.0/", "acquireLicensePage": note_url,
            "creditText": words["credit_text"] + (f". {map_line()}" if map_data else ""),
            "copyrightNotice": words["copyright_notice"],
            # Google's image metadata takes a Person or an Organization here, not the publisher's subtype
            "creator": {"@type": "Organization", "name": "ChipMates gemeinnützige GmbH", "url": "https://museumofages.org/"}}


def free_pictures_of(text, page_url, data):
    """The museum's own pictures a page holds, once each in the order met: those it shows (img), links (a href to a
    picture file) or shares (og:image), and those its structured data already describes."""
    found = []
    for src in (re.findall(r'<img\b[^>]*?\bsrc="([^"]+)"', text) + re.findall(r'<a\b[^>]*?\bhref="([^"]+)"', text)
                + re.findall(r'<meta property="og:image" content="([^"]+)"', text)):
        found.append(urllib.parse.urljoin(page_url, html.unescape(src)))
    found += [i.get("contentUrl") or i.get("url") or "" for i in image_objects(data)]
    return list(dict.fromkeys(u for u in found if picture_stem(u) in FREE_PICTURES))


def with_picture_rights(text, page_url, terms, map_terms=None, credit=None):
    """Gives each of the museum's own pictures that the page holds (free_pictures_of) its licence data, once per
    picture: an ImageObject the page already describes takes the data, any other gets one of its own. terms holds
    license, acquireLicensePage, creditText, copyrightNotice and creator. A still of the house that the page already
    describes takes map_terms, the same with the map data's credit. A picture that rests on others' works (credits in
    free-pictures.json) adds their credits to its own in the list's order; the page's own line (credit) stands in
    their place for the pictures that owe what the page's share picture owes, in the page's words and language. A
    page without structured data stays as it is."""
    block = LD_BLOCK.search(text)
    if not block:
        return text
    data = json.loads(block.group(2).replace("<\\/", "</"))
    urls = free_pictures_of(text, page_url, data)
    houses = [i for i in image_objects(data) if map_terms and picture_stem(i.get("contentUrl") or i.get("url") or "") in MAP_PICTURES]
    for image in houses:
        image.update(map_terms)
    if not urls and not houses:
        return text
    known = {}
    for image in image_objects(data):
        for key in ("contentUrl", "url"):
            if image.get(key):
                known.setdefault(image[key], image)
    for url in urls:
        image = known.get(url)
        if image is None:
            image = {"@type": "ImageObject", "@id": f"{page_url}#picture-{url.rsplit('/', 1)[-1].rsplit('.', 1)[0]}"}
            data["@graph"].append(image)
        image.setdefault("contentUrl", url)
        image.update(terms)
    shared = re.search(r'<meta property="og:image" content="([^"]+)"', text)
    page_owes = PICTURE_CREDITS.get(picture_stem(html.unescape(shared.group(1)))) if shared else None
    for image in image_objects(data):
        owed = PICTURE_CREDITS.get(picture_stem(image.get("contentUrl") or image.get("url") or ""))
        if not owed or "creditText" not in image:
            continue
        # the page's own line, in its language, after the museum's full credit; a line that starts with the museum's
        # name does not repeat it
        head = image["creditText"].split(", ", 1)[0] + ", "
        own = (credit[len(head):] if credit.startswith(head) else credit) if credit and owed == page_owes else None
        line = own or ", ".join(owed)
        if line not in image["creditText"]:
            image["creditText"] += f", {line}"
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return text[:block.start(2)] + body + text[block.end(2):]


def css(*names):
    text = "".join((SRC / "css" / f"{n}.css").read_text(encoding="utf-8") for n in names)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*([{};])\s*", r"\1", text)
    return text.replace(";}", "}").strip()


# The faces a language sets instead of the site's two: files in fonts/<code>/, set under :lang() by css/langs.css.
# Bulgarian: cuts of Source Serif 4 (text and headings) and Source Sans 3 (labels) with the Cyrillic letters and
# their Bulgarian forms, under names of their own (the licence reserves the name Source).
LANG_FACES = {"bg": (("Museum Bulgarian Serif", "bg/bulgarian-serif-400.woff2", "bg_serif"),
                     ("Museum Bulgarian Sans", "bg/bulgarian-sans-400.woff2", "bg_sans"))}


def faces(static, lang=None):
    rule = (
        '@font-face{{font-family:"{name}";src:url("{static}fonts/{file}") format("woff2");'
        "font-weight:400;font-style:normal;font-display:swap}}"
    )
    own = "".join(rule.format(name=name, static=static, file=file) for name, file, _ in LANG_FACES.get(lang, ()))
    # The sans draws its zero as a round O. Its digits come from the serif instead, which has lining
    # figures and a narrow zero: the same file, so no further request. 108% lifts them to the sans's cap height.
    figures = (
        '@font-face{{font-family:"Moa figures";src:url("{static}fonts/cardo-400.woff2") format("woff2");'
        "font-weight:400;font-style:normal;font-display:swap;unicode-range:U+30-39;size-adjust:108%}}"
    ).format(static=static)
    return rule.format(name="Cardo", static=static, file="cardo-400.woff2") + rule.format(
        name="Marcellus", static=static, file="marcellus-400.woff2"
    ) + figures + own


def grain(static):
    """The grain over the pools of light comes in after load, so the first paint asks for one picture only."""
    return f'.is-loaded{{--grain:url("{static}img/grain.png")}}'


def shown_text(text):
    shown = re.sub(r"<(script|style|noscript)\b.*?</\1>", " ", text, flags=re.S)
    shown = re.sub(r"<!--.*?-->", " ", shown, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", shown))


CSP_MARK = "<!--csp-->"


def with_policy(text):
    """Sets the page's content security policy: its own files, and each inline script and style by its hash."""
    def hashes(tag):
        out = []
        for attrs, body in re.findall(rf"<{tag}\b([^>]*)>(.*?)</{tag}>", text, flags=re.S):
            if tag == "script" and ("src=" in attrs or "application/ld+json" in attrs):
                continue
            mark = "'sha256-%s'" % base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
            if mark not in out:
                out.append(mark)
        return " ".join(out)

    # only a page whose place names a clip or music may load media, and only this site's own
    media = " media-src 'self';" if " data-clip=" in text or " data-music=" in text else ""
    # only a page that carries the count's script may send, and only to its own address
    connect = " connect-src 'self';" if " data-count=" in text else ""
    policy = (
        f"default-src 'none'; script-src 'self' {hashes('script')}; style-src 'self' {hashes('style')}; "
        f"img-src 'self' data:;{media}{connect} font-src 'self'; base-uri 'none'; form-action 'none'"
    )
    return text.replace(CSP_MARK, f'<meta http-equiv="Content-Security-Policy" content="{policy}">\n')


def fill(template, values):
    def sub(match):
        key = match.group(1)
        if key not in values:
            raise KeyError(f"no value for {{{{{key}}}}}")
        return values[key]

    return re.sub(r"\{\{([a-zA-Z0-9_.:]+)\}\}", sub, template)
