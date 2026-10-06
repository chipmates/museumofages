#!/usr/bin/env python3
"""Cuts the film's stills into the sizes the search pages serve: AVIF first, WebP as the fallback.

    python3 pages/make_pictures.py [name ...]      all pictures, or only the named ones
    python3 pages/make_pictures.py --list          the names

What is cut, and from which frame, stands in pictures.json: this file names no picture and no wing.
Output: pages/pics/img/. The repository keeps neither the pictures nor the film's stills: _src/tools/fetch.py
fetches the cut pictures from the live site, and MOA_FILM_STILLS names the stills' folder for a new cut. Needs ImageMagick with AVIF, the same
settings as the site's own pictures. A file that exists is kept: delete it to make it again.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "pics" / "img"
KINDS = (("avif", ["-quality", "58", "-define", "heic:speed=2"]), ("webp", ["-quality", "80", "-define", "webp:method=6"]))


def run(args):
    subprocess.run(["nice", "-n", "15"] + args, check=True)


def made(out):
    print(f"{out.name:44s} {out.stat().st_size / 1024:7.1f} KB", flush=True)


def main():
    jobs = json.loads((HERE / "pictures.json").read_text(encoding="utf-8"))
    if "--list" in sys.argv:
        print("\n".join(job["name"] for job in jobs["pictures"] + jobs["share"]))
        return
    if not os.environ.get("MOA_FILM_STILLS") or not Path(os.environ["MOA_FILM_STILLS"]).is_dir():
        raise SystemExit("make_pictures: set MOA_FILM_STILLS to the folder of the film's stills (it is not part of the "
                         "repository). To build the pages, _src/tools/fetch.py fetches the cut pictures.")
    source = Path(os.environ["MOA_FILM_STILLS"]).resolve()
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
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


if __name__ == "__main__":
    main()
