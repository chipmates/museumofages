#!/usr/bin/env python3
"""Cuts the site's sans font from the full file, with the letters a holder's name may need.

    python3 _src/tools/make_fonts.py                 write _src/fonts/marcellus-400.woff2 and _src/fonts.json
    python3 _src/tools/make_fonts.py --rename        give the existing cut its own names
    python3 _src/tools/make_fonts.py --check         say what the two font files hold, write nothing
    python3 _src/tools/make_fonts.py --narrow-space  add the narrow no-break space French takes to both cuts
    python3 _src/tools/make_fonts.py --list          write fonts.json from the font files as they are

The sans was the common Latin cut, which has no Polish letters: a holder's name in Polish fell back to another
typeface. This cut keeps every letter of the old file and adds the Polish ones. The serif stays as it is: a
holder's name is only ever set in the sans. fonts.json lists what each file holds, so the build (standard library
only) can check a name against it. The two fonts it cuts from stay outside the repository: MOA_FONT_FULL names the
full Marcellus file, MOA_FONT_BASE the Latin cut it replaces. Needs fontTools with brotli.

A language's own faces stand in fonts/<code>/ (buildlib.LANG_FACES). fonts.json lists what they hold too, under
their keys, so the build checks a language's words against the faces it is set in. The narrow no-break space
(U+202F) is not in either source font: --narrow-space adds it to each cut as an empty letter as wide as the thin
space, or half the word space where the font has no thin space. It needs neither outside file.
"""
import json
import os
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from buildlib import LANG_FACES  # noqa: E402
FONTS = HERE.parent / "fonts"
LIST = HERE.parent / "fonts.json"
# Read only, from outside the repository: MOA_FONT_FULL, the full file, the same revision and the same widths as
# the cut it replaces. MOA_FONT_BASE, the cut as it came: the letters it holds are the base of every new cut.
MORE = "ĄąĆćĘęŁłŃńÓóŚśŹźŻż"
FEATURES = ["kern", "liga", "frac"]


def outside(var):
    """A font file this tool reads from outside the repository, by the variable that names it."""
    path = Path(os.environ.get(var, ""))
    if not os.environ.get(var) or not path.is_file():
        raise SystemExit(f"make_fonts: set {var} to its font file (it is not part of the repository). "
                         "The fonts in _src/fonts/ are enough to build the site.")
    return path


def held(path):
    return sorted(TTFont(path).getBestCmap())


def ranges(points):
    out, start, last = [], None, None
    for p in points:
        if start is None:
            start = last = p
        elif p == last + 1:
            last = p
        else:
            out.append([start, last])
            start = last = p
    if start is not None:
        out.append([start, last])
    return out


# The cut adds letters, so under the OFL it is a Modified Version and may not carry the Reserved
# Font Name: its own names say "Ages Display". The copyright, trademark and licence notices stay.
SANS_NAME = "Ages Display"


def rename(font):
    for record in font["name"].names:
        if record.nameID in (1, 4, 16):
            record.string = SANS_NAME
        elif record.nameID == 3:
            record.string = f"ChipMates: {SANS_NAME}: 2026"
        elif record.nameID == 6:
            record.string = SANS_NAME.replace(" ", "") + "-Regular"


NARROW = 0x202F
NOTE = "What the site's font files hold, as ranges of code points. Written by tools/make_fonts.py, read by the build."


def write_list(sans, serif):
    """fonts.json: the two cuts and every language's own faces."""
    out = {"_note": NOTE, "sans": ranges(held(sans)), "serif": ranges(held(serif))}
    for faces in LANG_FACES.values():
        for _, file, key in faces:
            if (FONTS / file).is_file():
                out[key] = ranges(held(FONTS / file))
    LIST.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")


def narrow_space(path):
    """Adds U+202F to a cut as an empty letter, as wide as its thin space or half its word space. A cut that has it
    is left as it is."""
    font = TTFont(path, recalcTimestamp=False)
    cmap = font.getBestCmap()
    if NARROW in cmap:
        return f"{path.name}: has U+202F already"
    if "glyf" not in font:
        raise SystemExit(f"make_fonts: {path.name} has no TrueType outlines, and this step adds a TrueType letter")
    width = font["hmtx"][cmap[0x2009]][0] if 0x2009 in cmap else round(font["hmtx"][cmap[0x20]][0] / 2)
    name = "uni202F"
    order = font.getGlyphOrder() + [name]
    font.setGlyphOrder(order)
    font["glyf"].glyphs[name] = Glyph()
    font["glyf"].glyphOrder = order
    font["hmtx"].metrics[name] = (width, 0)
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[NARROW] = name
    for tag in ("hdmx", "LTSH", "VDMX"):
        if tag in font:
            del font[tag]
    font.flavor = "woff2"
    font.save(path)
    return f"{path.name}: U+202F added, {width} units wide of {font['head'].unitsPerEm}"


def main():
    sans, serif = FONTS / "marcellus-400.woff2", FONTS / "cardo-400.woff2"
    if "--list" in sys.argv:
        write_list(sans, serif)
        print(f"{LIST.name}: written")
        return
    if "--narrow-space" in sys.argv:
        for path in (serif, sans):
            print(narrow_space(path))
        write_list(sans, serif)
        return
    if "--rename" in sys.argv:
        font = TTFont(sans)
        rename(font)
        font.save(sans)
        print(f"{sans.name}: named {SANS_NAME}")
        return
    if "--check" in sys.argv:
        for path in (sans, serif):
            points = set(held(path))
            print(f"{path.name}: {len(points)} letters, Polish: " + "".join(c for c in MORE if ord(c) in points) or "none")
        return
    BASE, FULL = outside("MOA_FONT_BASE"), outside("MOA_FONT_FULL")
    old, full = TTFont(BASE), TTFont(FULL)
    for key in ("fontRevision", "unitsPerEm"):
        if getattr(old["head"], key) != getattr(full["head"], key):
            raise SystemExit(f"make_fonts: the full file differs from the cut in {key}")
    a, b = old.getBestCmap(), full.getBestCmap()
    moved = [chr(c) for c in a if c not in b or old["hmtx"][a[c]][0] != full["hmtx"][b[c]][0]]
    if moved:
        raise SystemExit(f"make_fonts: these letters are missing or of another width in the full file: {moved}")
    want = sorted(set(a) | {ord(c) for c in MORE})
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = FEATURES
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = subset.load_font(str(FULL), options)
    cutter = subset.Subsetter(options)
    cutter.populate(unicodes=want)
    cutter.subset(font)
    rename(font)
    subset.save_font(font, str(sans), options)
    write_list(sans, serif)
    print(f"{sans.name}: {sans.stat().st_size} bytes, {len(held(sans))} letters (the cut before: {BASE.stat().st_size} bytes, {len(a)})")


if __name__ == "__main__":
    main()
