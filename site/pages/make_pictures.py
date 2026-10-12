#!/usr/bin/env python3
"""Cuts the film's stills into the sizes the search pages serve (AVIF first, WebP as the fallback), and renders the
stills of a page's chart (PNG).

    python3 pages/make_pictures.py [name ...]      all pictures, or only the named ones (a chart's still by its file)
    python3 pages/make_pictures.py --list          the names
    python3 pages/make_pictures.py --charts        only the charts' stills, made anew where their drawing changed

What is cut, and from which frame, stands in pictures.json: this file names no picture and no wing. A chart's stills
are drawn by the pages' build (build.py, still_jobs) from the same facts and words as the page's own chart; this file
renders each drawing with ImageMagick's own SVG renderer and writes the drawing's mark into the PNG, so the build
knows a still that is older than its chart.
Output: pages/pics/img/. The repository keeps neither the pictures nor the film's stills: _src/tools/fetch.py
fetches the cut pictures from the live site, and MOA_FILM_STILLS names the stills' folder for a new cut. Needs ImageMagick with AVIF, the same
settings as the site's own pictures. A file that exists is kept: delete it to make it again. A chart's still is
made again whenever its drawing changed. The charts' text is set in the site's two faces: MOA_FONT_TTF names a folder
with them as TrueType files (cardo-400.ttf and marcellus-400.ttf, the site's woff2 cuts unpacked), which ImageMagick
reads through a font map written into pages/_work/fonts/.
"""
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "pics" / "img"
WORK = HERE / "_work"
KINDS = (("avif", ["-quality", "58", "-define", "heic:speed=2"]), ("webp", ["-quality", "80", "-define", "webp:method=6"]))
FACES = {"Cardo": "cardo-400.ttf", "Marcellus": "marcellus-400.ttf"}


def run(args, env=None):
    subprocess.run(["nice", "-n", "15"] + args, check=True, env=env)


def made(out):
    print(f"{out.name:44s} {out.stat().st_size / 1024:7.1f} KB", flush=True)


def pages_build():
    spec = importlib.util.spec_from_file_location("pages_build", HERE / "build.py")
    mod = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    spec.loader.exec_module(mod)
    return mod


def font_map():
    """An ImageMagick font map naming the site's two faces, so a drawing's font-family finds them. Returns the
    environment ImageMagick runs in."""
    folder = Path(os.environ.get("MOA_FONT_TTF", ""))
    missing = [f for f in FACES.values() if not (folder / f).is_file()]
    if not os.environ.get("MOA_FONT_TTF") or missing:
        raise SystemExit("make_pictures: set MOA_FONT_TTF to a folder with the site's two faces as TrueType files "
                         f"({', '.join(FACES.values())}); they are not part of the repository")
    where = WORK / "fonts"
    where.mkdir(parents=True, exist_ok=True)
    rows = "".join(f'  <type name="{name}" fullname="{name}" family="{name}" style="Normal" stretch="Normal" weight="400" '
                   f'glyphs="{(folder / file).resolve()}"/>\n' for name, file in FACES.items())
    (where / "type.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<typemap>\n{rows}</typemap>\n', encoding="utf-8")
    return dict(os.environ, MAGICK_CONFIGURE_PATH=str(where))


def charts(only):
    build = pages_build()
    jobs = [j for j in build.still_jobs() if not only or j["file"] in only]
    if not jobs:
        return
    env = font_map()
    OUT.mkdir(parents=True, exist_ok=True)
    (WORK / "stills").mkdir(parents=True, exist_ok=True)
    for job in jobs:
        out = OUT / job["file"]
        mark = build.CHART.source_mark(job["svg"])
        if out.exists() and build.CHART.png_info(out)[1].get("comment") == mark:
            continue
        drawing = WORK / "stills" / (out.stem + ".svg")
        drawing.write_text(job["svg"], encoding="utf-8")
        # no strip: it would drop the mark too. The chunks that would change from run to run stay out.
        run(["magick", f"msvg:{drawing}", "-set", "comment", mark, "-define", "png:exclude-chunks=date,time,bKGD,pHYs",
             "-define", "png:compression-level=9", f"png:{out}"], env=env)
        made(out)


def main():
    jobs = json.loads((HERE / "pictures.json").read_text(encoding="utf-8"))
    if "--list" in sys.argv:
        print("\n".join(job["name"] for job in jobs["pictures"] + jobs["share"]))
        print("\n".join(job["file"] for job in pages_build().still_jobs()))
        return
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    if "--charts" in sys.argv or (only and all(a.endswith(".png") for a in only)):
        charts([a for a in only if a.endswith(".png")])
        return
    if not os.environ.get("MOA_FILM_STILLS") or not Path(os.environ["MOA_FILM_STILLS"]).is_dir():
        raise SystemExit("make_pictures: set MOA_FILM_STILLS to the folder of the film's stills (it is not part of the "
                         "repository). To build the pages, _src/tools/fetch.py fetches the cut pictures.")
    source = Path(os.environ["MOA_FILM_STILLS"]).resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    for job in jobs["pictures"]:
        if only and job["name"] not in only:
            continue
        crop = jobs["crops"].get(job.get("crop"), job.get("crop"))
        for width in job["widths"]:
            base = ["magick", str(source / job["file"])]
            if crop:
                base += ["-crop", crop, "+repage"]
            base += ["-filter", "Lanczos", "-resize", f"{width}x", "-strip"]
            for ext, extra in KINDS:
                out = OUT / f"{job['name']}-{width}.{ext}"
                if not out.exists():
                    run(base + extra + [str(out)])
                    made(out)
    for job in jobs["share"]:
        out = OUT / f"{job['name']}.jpg"
        if (only and job["name"] not in only) or out.exists():
            continue
        run(["magick", str(source / job["file"]), "-crop", job["crop"], "+repage", "-filter", "Lanczos",
             "-resize", "1200x630!", "-strip", "-interlace", "JPEG", "-quality", "82", str(out)])
        made(out)
    charts(only)


if __name__ == "__main__":
    main()
