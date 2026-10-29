#!/usr/bin/env python3
"""Cuts the site's sans font from the full file, with the letters a holder's name may need.

    python3 _src/tools/make_fonts.py                 write _src/fonts/marcellus-400.woff2 and _src/fonts.json
    python3 _src/tools/make_fonts.py --rename        give the existing cut its own names
    python3 _src/tools/make_fonts.py --check         say what the two font files hold, write nothing
    python3 _src/tools/make_fonts.py --narrow-space  add the narrow no-break space French takes to both cuts
    python3 _src/tools/make_fonts.py --list          write fonts.json from the font files as they are
    python3 _src/tools/make_fonts.py --lang tr       cut a language's own faces: the site's two cuts with its letters
    python3 _src/tools/make_fonts.py --ttf <folder>  write the share pictures' TrueType files there (MOA_FONT_TTF)

The sans was the common Latin cut, which has no Polish letters: a holder's name in Polish fell back to another
typeface. This cut keeps every letter of the old file and adds the Polish ones. The serif stays as it is: a
holder's name is only ever set in the sans. fonts.json lists what each file holds, so the build (standard library
only) can check a name against it. The two fonts it cuts from stay outside the repository: MOA_FONT_FULL names the
full Marcellus file, MOA_FONT_BASE the Latin cut it replaces. Needs fontTools with brotli.

A language's own faces stand in fonts/<code>/ (buildlib.LANG_FACES). fonts.json lists what they hold too, under
their keys, so the build checks a language's words against the faces it is set in. The narrow no-break space
(U+202F) is not in either source font: --narrow-space adds it to each cut as an empty letter as wide as the thin
space, or half the word space where the font has no thin space. It needs neither outside file.

A language whose letters the two cuts lack but whose typefaces are the site's (Turkish: Ğ ğ İ Ş ş) gets the two cut
again from the full files with those letters added, under names of their own (--lang): MOA_FONT_FULL names the full
Marcellus and MOA_SERIF_FULL the full Cardo. Every letter of the site's cut keeps its width, its outline and the
cut's own features (Cardo's cut sets no kerning), and the step stops if one would not. --ttf writes the TrueType files
the share pictures are drawn with (make_pictures.py): the site's cuts, or with --lang a language's own, which hold every
letter of the site's cuts as they are.
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
from buildlib import LANG_FACES, LANG_LETTERS  # noqa: E402
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


def rename(font, name=SANS_NAME):
    for record in font["name"].names:
        if record.nameID in (1, 4, 16):
            record.string = name
        elif record.nameID == 3:
            record.string = f"ChipMates: {name}: 2026"
        elif record.nameID == 6:
            record.string = name.replace(" ", "") + "-Regular"


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
    add_empty(font, NARROW, width)
    font.flavor = "woff2"
    font.save(path)
    return f"{path.name}: U+202F added, {width} units wide of {font['head'].unitsPerEm}"


def add_empty(font, point, width):
    """An empty letter at a code point, this many units wide."""
    name = f"uni{point:04X}"
    order = font.getGlyphOrder() + [name]
    font.setGlyphOrder(order)
    font["glyf"].glyphs[name] = Glyph()
    font["glyf"].glyphOrder = order
    font["hmtx"].metrics[name] = (width, 0)
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[point] = name
    for tag in ("hdmx", "LTSH", "VDMX"):
        if tag in font:
            del font[tag]


# The letters a language adds to the site's two cuts, by language (buildlib.LANG_FACES names its faces).
ADD = LANG_LETTERS


def features(font):
    """The layout features a cut carries, so a new cut of the same face sets its letters as the old one does."""
    tags = set()
    for tag in ("GSUB", "GPOS"):
        if tag in font and font[tag].table.FeatureList:
            tags |= {r.FeatureTag for r in font[tag].table.FeatureList.FeatureRecord}
    return sorted(tags)


def outline(font, glyph):
    """A letter's drawing: its points, where its contours end and which points lie on the curve."""
    coords, ends, flags = font["glyf"][glyph].getCoordinates(font["glyf"])
    return list(coords), list(ends), [f & 1 for f in flags]


def unlike(base, cut):
    """The letters of the site's cut that a new cut sets otherwise: missing, of another width or another drawing."""
    a, b = base.getBestCmap(), cut.getBestCmap()
    out = []
    for point, glyph in sorted(a.items()):
        if point not in b:
            out.append(f"U+{point:04X} missing")
        elif base["hmtx"][glyph][0] != cut["hmtx"][b[point]][0]:
            out.append(f"U+{point:04X} {base['hmtx'][glyph][0]} wide, now {cut['hmtx'][b[point]][0]}")
        elif outline(base, glyph) != outline(cut, b[point]):
            out.append(f"U+{point:04X} drawn otherwise")
    return out


def grow(base_path, full_path, letters, name):
    """The site's cut made again from the full file with these letters added, under its own name: every letter of
    the cut at its width, in its drawing and with the cut's features. Stops where the full file would change one."""
    base, full = TTFont(base_path), TTFont(full_path)
    for key in ("fontRevision", "unitsPerEm"):
        if getattr(base["head"], key) != getattr(full["head"], key):
            raise SystemExit(f"make_fonts: {full_path.name} differs from {base_path.name} in {key}")
    a, b = base.getBestCmap(), full.getBestCmap()
    # the narrow space is this tool's own letter (--narrow-space), in no full file
    own = [p for p in a if p not in b]
    if [p for p in own if p != NARROW]:
        raise SystemExit(f"make_fonts: {full_path.name} lacks {[chr(p) for p in own if p != NARROW]} of {base_path.name}")
    lacking = [c for c in letters if ord(c) not in b]
    if lacking:
        raise SystemExit(f"make_fonts: {full_path.name} lacks {lacking}")
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = features(base)
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = subset.load_font(str(full_path), options)
    cutter = subset.Subsetter(options)
    cutter.populate(unicodes=sorted((set(a) - set(own)) | {ord(c) for c in letters}))
    cutter.subset(font)
    rename(font, name)
    for point in own:
        add_empty(font, point, base["hmtx"][a[point]][0])
    font.flavor = "woff2"
    moved = unlike(base, font)
    if moved:
        raise SystemExit(f"make_fonts: the new cut of {base_path.name} would change {moved[:8]}")
    return font


def lang_faces(lang):
    """A language's own two faces (buildlib.LANG_FACES), cut from the full files with its letters (ADD)."""
    if lang not in ADD or lang not in LANG_FACES:
        raise SystemExit(f"make_fonts: no letters to add for {lang!r} (ADD, and its faces in buildlib.LANG_FACES)")
    (serif_name, serif_file, _), (sans_name, sans_file, _) = LANG_FACES[lang]
    for base, var, name, file in ((FONTS / "cardo-400.woff2", "MOA_SERIF_FULL", serif_name, serif_file),
                                  (FONTS / "marcellus-400.woff2", "MOA_FONT_FULL", sans_name, sans_file)):
        font = grow(base, outside(var), ADD[lang], name)
        (FONTS / file).parent.mkdir(parents=True, exist_ok=True)
        font.save(FONTS / file)
        print(f"{file}: {(FONTS / file).stat().st_size} bytes, {len(held(FONTS / file))} letters, "
              f"{ADD[lang]} added, every letter of {base.name} as it was")


def ttf(folder, lang=None):
    """The share pictures' TrueType files (make_pictures.py FACES): the site's cuts unpacked, or a language's own,
    which set every letter of the site's cuts as those do."""
    folder.mkdir(parents=True, exist_ok=True)
    own = {f: file for f, (_, file, _) in zip(("cardo-400", "marcellus-400"), LANG_FACES[lang])} if lang else {}
    for stem in ("cardo-400", "marcellus-400"):
        font = TTFont(FONTS / own.get(stem, f"{stem}.woff2"))
        font.flavor = None
        font.save(folder / f"{stem}.ttf")
        print(f"{folder / (stem + '.ttf')}: {len(font.getBestCmap())} letters")


def main():
    sans, serif = FONTS / "marcellus-400.woff2", FONTS / "cardo-400.woff2"
    if "--list" in sys.argv:
        write_list(sans, serif)
        print(f"{LIST.name}: written")
        return
    lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv[:-1] else None
    if "--ttf" in sys.argv[:-1]:
        ttf(Path(sys.argv[sys.argv.index("--ttf") + 1]), lang)
        return
    if lang:
        lang_faces(lang)
        write_list(sans, serif)
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
