"""The build's shared tools: escaping, numbers as a language writes them, the style and font rules, the content
security policy and the template filler. Standard library only. build.py imports from here."""
import base64
import hashlib
import html
import json
import re
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
UNIT = (r"(?:Metern?|metres?|meters?|Zentimetern?|centimetres?|Kilometern?|kilometres?|cm|mm|km|m|Kilowatt|kilowatts?|"
        r"Sekunden?|seconds?|Tagen?|days?|Jahren?|years?|Uhr|Prozent|percent)")
TIMES = r"(?:mal|by|×)"
LOOSE_PAIR = re.compile(rf"(?i:\b(?:Station|Stop)) \d|\d {TIMES}[ {NBSP}]\d|\d{NBSP}{TIMES} \d|\d {UNIT}\b")


def bind(text):
    """Sets a fixed space inside every pair that may not break: "Station 7", "34 Meter", "8,8 mal 4,6 Meter"."""
    text = re.sub(r"\b(Station|Stop) (?=\d)", "\\1" + NBSP, text, flags=re.I)
    text = re.sub(rf"(\d) ({TIMES}) (?=\d)", "\\1" + NBSP + "\\2" + NBSP, text)
    return re.sub(rf"(\d) (?={UNIT}\b)", "\\1" + NBSP, text)


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


def number(value, lang, places=None):
    """A number as the language writes it: 1,158 and 8.8 in English, 1.158 and 8,8 in German. A text stays as it is."""
    if isinstance(value, str):
        return value
    sep, point = (",", ".") if lang == "en" else (".", ",")
    if places is not None:
        text = f"{value:,.{places}f}"
    elif isinstance(value, float) and value != int(value):
        text = f"{value:,}"
    else:
        text = f"{int(value):,}"
    return text.replace(",", "\x00").replace(".", point).replace("\x00", sep)


def number_word(value, lang):
    if not isinstance(value, int) or not 0 <= value < len(WORDS[lang]):
        raise SystemExit(f"{value!r} has no word here: write it in digits, with {{count:<name>}}")
    return WORDS[lang][value]


def dump(graph):
    text = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
    return text.replace("</", "<\\/")


def css(*names):
    text = "".join((SRC / "css" / f"{n}.css").read_text(encoding="utf-8") for n in names)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*([{};])\s*", r"\1", text)
    return text.replace(";}", "}").strip()


def faces(static):
    rule = (
        '@font-face{{font-family:"{name}";src:url("{static}fonts/{file}") format("woff2");'
        "font-weight:400;font-style:normal;font-display:swap}}"
    )
    # The sans draws its zero as a round O. Its digits come from the serif instead, which has lining
    # figures and a narrow zero: the same file, so no further request. 108% lifts them to the sans's cap height.
    figures = (
        '@font-face{{font-family:"Moa figures";src:url("{static}fonts/cardo-400.woff2") format("woff2");'
        "font-weight:400;font-style:normal;font-display:swap;unicode-range:U+30-39;size-adjust:108%}}"
    ).format(static=static)
    return rule.format(name="Cardo", static=static, file="cardo-400.woff2") + rule.format(
        name="Marcellus", static=static, file="marcellus-400.woff2"
    ) + figures


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
    policy = (
        f"default-src 'none'; script-src 'self' {hashes('script')}; style-src 'self' {hashes('style')}; "
        f"img-src 'self' data:;{media} font-src 'self'; base-uri 'none'; form-action 'none'"
    )
    return text.replace(CSP_MARK, f'<meta http-equiv="Content-Security-Policy" content="{policy}">\n')


def fill(template, values):
    def sub(match):
        key = match.group(1)
        if key not in values:
            raise KeyError(f"no value for {{{{{key}}}}}")
        return values[key]

    return re.sub(r"\{\{([a-zA-Z0-9_.:]+)\}\}", sub, template)
