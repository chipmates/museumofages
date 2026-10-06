#!/usr/bin/env python3
"""Cuts the plates into the sizes the page serves: AVIF first, WebP as the fallback.

    python3 _src/tools/make_images.py [name ...]
    python3 _src/tools/make_images.py --from <picture> --stem <name> --widths 1600,960 [--crop WxH+X+Y]

The cut pictures go to _src/img/, which the repository does not keep: tools/fetch.py fetches the current cuts
from the live site, so the build never needs this tool, and tools/fetch.py --record lists a new cut. Its sources
stay outside the repository too, read only, each folder named by a variable: MOA_FILM_STILLS (the film's stills and its own
lossless renders), MOA_FILM_UPRIGHT (the film release's upright frames) and MOA_CROPS (older lossless crops
of film stills). The build imports this file for frames() and SECOND_TIER, which need none of them.
The second form cuts one picture that is not in the list, a showpiece's still for one.
Needs ImageMagick with AVIF. The machine's posters are made by make_posters.sh.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "img"))
# A job's source is a file name in one of three folders: FILM and UPRIGHT mark the first two, a bare name
# lies in the crops' folder. The marks keep the file's own name, by which a frame is known.
FILM = "film:"
# the film release's upright frames: a phone's cut of a stop whose wide frame shows more than it may
UPRIGHT = "upright:"
FOLDERS = ((FILM, "MOA_FILM_STILLS"), (UPRIGHT, "MOA_FILM_UPRIGHT"), ("", "MOA_CROPS"))

# name: (source crop, further crop "WxH+X+Y" or None, widths)
JOBS = {
    # the first screen from 600 px up: the still from the lock gate's edge to the right wall
    "hero":         ("hero-wide.png", "1160x1080+760+0", [1160, 800]),
    "hero-m":       ("hero-sq.png", None, [1080, 780]),
    "stair":        ("stair-head.png", None, [780, 480]),
    "court":        ("pavilion.png", None, [1600, 800]),
    "picture-room": ("picture-room.png", None, [640]),
    "hall":         ("hall.png", None, [1600, 800]),
    # the grave court: the release's own rest frame at the stop, drawn at rest by the wing's engine at 3840x2160
    "grave-court":  (FILM + "/grave-court-still.png", "2400x1350+900+380", [1600, 960, 560]),
    "sky":          ("sky.png", None, [960]),
    # frames of the film wing's current release (pics-film/README.md says what each is and how it is credited)
    # the mechanism hall from the flywheel: another side of the hall than the wing page's first picture
    "v-flywheel":   (FILM + "/master/view-flywheel.png", None, [1600, 960]),
    "house":        (FILM + "/master/stop-study.png", None, [1600, 800, 480]),
    # the wing from the head of the stair: whole from 600 px up, and for narrow screens the right
    # three quarters, so a tall box still holds the pyramid
    "start":        (FILM + "/master/start-stair-head.png", None, [1600, 960]),
    "start-m":      (FILM + "/master/start-stair-head.png", "1440x1080+480+0", [1200, 800]),
    # ---- A first screen takes only frames in which no reproduction hangs. ----
    # the museum's page: the great hall, whole from 600 px up, and for narrow screens the lion, the windows and the table
    "v-hall":       (FILM + "/master/stop-hall.png", None, [1600, 960]),
    "v-hall-m":     (FILM + "/master/stop-hall.png", "1440x1080+400+0", [1080, 780]),
    # the wing page's walk of five pictures, each whole and in a cut for narrow screens
    "v-works":      (FILM + "/master/stop-works.png", None, [1600, 960]),
    "v-works-m":    (FILM + "/master/stop-works.png", "1440x1080+300+0", [1080, 780]),
    "v-table":      (FILM + "/master/stop-reading-table.png", None, [1600, 960]),
    "v-table-m":    (FILM + "/master/stop-reading-table.png", "1440x1080+240+0", [1080, 780]),
    # the dates in the floor: the whole frame shows the wall of sheets from Windsor at its upper left, so the
    # wide cut starts right of it and under it, and the narrow cut comes from the upright frame, which never sees it
    "v-line":       (FILM + "/master/stop-line-early.png", "1228x691+692+250", [1228, 800]),
    "v-line-m":     (UPRIGHT + "/stop-line-early.7bcc37463f975ed1.webp", "720x720+0+400", [720, 480]),
    "v-court":      (FILM + "/master/stop-courtyard.png", None, [1600, 960]),
    "v-court-m":    (FILM + "/master/stop-courtyard.png", "1440x1080+240+0", [1080, 780]),
    "v-chamber":    (FILM + "/master/stop-chamber.png", None, [1600, 960]),
    "v-chamber-m":  (FILM + "/master/stop-chamber.png", "1440x1080+100+0", [1080, 780]),
    # the same frame as a wing's plate on the wall of wings: the house from outside, no sheet and no painting in it
    "v-house":      (FILM + "/master/stop-chamber.png", None, [1600, 800, 480]),
    # below the first screen, each with its label: the picture room, the wall of sheets, the Last Supper's field
    "v-picture-room": (FILM + "/master/stop-picture-room.png", None, [1600, 800]),
    "v-body":       (FILM + "/master/stop-body.png", None, [1600, 800]),
    "v-supper":     (FILM + "/master/stop-supper-wall.png", None, [1600, 800]),
    # the printed facsimile of 1883 on the reading table
    "v-codex":      (FILM + "/master/view-codex-paris-B.png", None, [1600, 800]),
    # the Mona Lisa on her wall from further back: frame 125 of the film's walk, drawn again at rest by the wing's
    # engine at 3840x2160 (sharp). One 4:3 window for both cuts, keeping her and the run of frames to her left. Its
    # right edge stops 45 px short of the near painting's frame, a CC BY plate that no cut may show
    "v-lisa":       (FILM + "/lisa-wall-still.png", "2000x1500+40+300", [1280, 800]),
    "v-lisa-m":     (FILM + "/lisa-wall-still.png", "2000x1500+40+300", [1000, 720]),
    # the wing's own close view of a painting with its scale bar: a screenshot per language (2880x1800), whole
    "v-scale-de":   (FILM + "/scale-lady-with-an-ermine.de.png", None, [1600, 960]),
    "v-scale-en":   (FILM + "/scale-lady-with-an-ermine.en.png", None, [1600, 960]),
    # for narrow screens the painting with its bar alone: the window holds no words, and its pixels are the same
    # in both languages' screenshots, so one cut serves both pages
    "v-scale-m":    (FILM + "/scale-lady-with-an-ermine.de.png", "1100x1270+890+30", [800, 560]),
    # the reading table's close view of the 1883 facsimile at B 83v, a screenshot per language (2880x1800), whole;
    # for narrow screens the printed plate alone, a window without words that is the same in both screenshots
    "v-page-de":    (FILM + "/volume-b-83v.de.png", None, [1600, 960]),
    "v-page-en":    (FILM + "/volume-b-83v.en.png", None, [1600, 960]),
    "v-page-m":     (FILM + "/volume-b-83v.de.png", "1180x1210+870+24", [800, 560]),
    # the great hall's lion by the window, a frame made for the page (lossless)
    "v-lion":       (FILM + "/hall-lion-view.png", None, [1600, 800]),
    # the heart valve's sheet on its own wall, cut so the sheet is large enough to be seen as a sheet
    "v-valve":      (FILM + "/master/stop-body-valve.png", "960x720+490+155", [960, 640]),
    # the museum's own glass model of the heart valve, whole and upright for narrow screens
    "v-heart":      (FILM + "/poster-glass-heart-wide.webp", None, [1600, 800]),
    "v-heart-m":    (FILM + "/poster-glass-heart-wide.webp", "864x1080+523+0", [864, 600]),
    # stop-study and stop-arrival show the stand of a Windsor sheet, a second-tier reproduction: low on a page only.
    # the parachute under its canopy, in the shape of the machines' small plates
    "m-parachute":  (FILM + "/master/view-parachute.png", "1563x1080+178+0", [720, 360]),
}
# the fourteen machines alone on the plain floor: one cut for all, so the small plates hang in one line
MACHINES = ("aerial-screw", "anemometer", "ball-bearing", "camera-obscura", "flywheel", "inclinometer", "lathe",
            "mechanical-lion", "miter-lock-gates", "multi-barrel-gun", "proportional-compass", "revolving-crane",
            "rolling-mill", "water-lifting-screw")
JOBS.update({f"m-{name}": (FILM + f"/poster-{name}.webp", "1470x1016+330+0", [720, 360]) for name in MACHINES})

# Older crops that are the same frame as a film still: a frame counts once, whatever its file.
SAME_FRAME = {"room.png": "stop-hall"}
# Frames in which a reproduction of the second rights tier can be seen (pics-film/README.md and the rights look):
# never in a page's first section, lower only with a label that carries a source line. The build reads this.
SECOND_TIER = ("stop-picture-room", "stop-picture-room-lisa", "stop-picture-room-west", "lisa-wall", "lisa-wall-still",
               "scale-lady-with-an-ermine", "stop-supper-wall", "stop-body", "stop-body-valve", "start-stair-head",
               "stop-study", "stop-arrival")


def frame_of(source):
    """The film frame a source file is, by name: the folder, the release's hash and the extension go."""
    name = os.path.basename(source)
    if name in SAME_FRAME:
        return SAME_FRAME[name]
    stem = name.rsplit(".", 1)[0]
    return stem.split(".", 1)[0]


def frames():
    """{stem: frame} for every picture this tool cuts."""
    return {name: frame_of(src) for name, (src, _, _) in JOBS.items()}


def source(src):
    """A job's source file on this machine, from the folder its variable names."""
    if os.path.isabs(src):
        return src
    for mark, var in FOLDERS:
        if src.startswith(mark):
            folder = os.environ.get(var)
            if not folder or not os.path.isdir(folder):
                sys.exit(f"make_images: set {var} to its folder (it is not part of the repository). "
                         "To build the site, tools/fetch.py fetches the cut pictures.")
            return os.path.join(folder, src[len(mark):].lstrip("/"))


def run(args):
    subprocess.run(["nice", "-n", "15"] + args, check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    only, jobs = sys.argv[1:], JOBS
    if "--from" in only:
        arg = lambda flag: only[only.index(flag) + 1] if flag in only else None
        stem, widths = arg("--stem"), sorted((int(w) for w in arg("--widths").split(",")), reverse=True)
        if not stem or stem in JOBS:
            sys.exit("--stem needs a name that is not in the list")
        jobs, only = {stem: (os.path.abspath(arg("--from")), arg("--crop"), widths)}, []
    for name, (src, crop, widths) in jobs.items():
        if only and name not in only:
            continue
        for w in widths:
            base = ["magick", source(src)]
            if crop:
                base += ["-crop", crop, "+repage"]
            base += ["-filter", "Lanczos", "-resize", f"{w}x", "-strip"]
            for ext, extra in (
                ("avif", ["-quality", "58", "-define", "heic:speed=2"]),
                ("webp", ["-quality", "80", "-define", "webp:method=6"]),
            ):
                out = os.path.join(OUT, f"{name}-{w}.{ext}")
                run(base + extra + [out])
                print(f"{os.path.basename(out):28s} {os.path.getsize(out) / 1024:7.1f} KB")


if __name__ == "__main__":
    main()
