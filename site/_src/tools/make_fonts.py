#!/usr/bin/env python3
"""Cuts the site's sans font from the full file, with the letters a holder's name may need.

    python3 _src/tools/make_fonts.py            write _src/fonts/marcellus-400.woff2 and _src/fonts.json
    python3 _src/tools/make_fonts.py --check    say what the two font files hold, write nothing

The sans was the common Latin cut, which has no Polish letters: a holder's name in Polish fell back to another
typeface. This cut keeps every letter of the old file and adds the Polish ones. The serif stays as it is: a
holder's name is only ever set in the sans. fonts.json lists what each file holds, so the build (standard library
only) can check a name against it. The two fonts it cuts from stay outside the repository: MOA_FONT_FULL names the
full Marcellus file, MOA_FONT_BASE the Latin cut it replaces. Needs fontTools with brotli.
"""
import json
import os
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent
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


def main():
    sans, serif = FONTS / "marcellus-400.woff2", FONTS / "cardo-400.woff2"
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
    subset.save_font(font, str(sans), options)
    LIST.write_text(json.dumps({
        "_note": "What the site's two font files hold, as ranges of code points. Written by tools/make_fonts.py, read by the build.",
        "sans": ranges(held(sans)), "serif": ranges(held(serif))}, indent=1) + "\n", encoding="utf-8")
    print(f"{sans.name}: {sans.stat().st_size} bytes, {len(held(sans))} letters (the cut before: {BASE.stat().st_size} bytes, {len(a)})")


if __name__ == "__main__":
    main()
