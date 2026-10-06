"""Stand-in pictures for the test registries: one invented animal, drawn in lines. Test only: these files never
go into dist/. Run by testdata.py when a picture is missing. Only then it needs PIL, and ImageMagick for the AVIF
copies: the pictures in img/ are kept, so a test build runs on the standard library alone."""
import math
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent / "img"
MAGICK = "magick"
# The tokens' own tones, read from tokens.css so no colour is written twice.
TOKENS = dict(l.strip().rstrip(";").split(":") for l in (Path(__file__).resolve().parents[1] / "css" / "tokens.css").read_text().splitlines()
              if l.strip().startswith("--"))
tone = lambda name: tuple(int(TOKENS["--" + name][i:i + 2], 16) for i in (1, 3, 5))
WALL, EDGE, LINEN, CHALK, SOFT = tone("wall"), tone("edge"), tone("linen"), tone("chalk"), tone("text-3")

# The animal's outline in a box of 100 by 60, head to the right, feet on y = 56.
SPINE = [(4, 30), (14, 27), (26, 24), (38, 22), (50, 21), (60, 20), (68, 17), (75, 12), (82, 8)]
BELLY = [(82, 8), (93, 9), (97, 13), (90, 16), (83, 16), (76, 21), (70, 29), (62, 35), (52, 37), (42, 35), (30, 31), (16, 31), (4, 30)]
LEGS = [[(50, 33), (56, 44), (52, 52), (58, 56), (49, 56), (47, 45), (44, 34)], [(57, 33), (64, 43), (61, 52), (67, 56), (58, 56), (56, 46), (52, 35)]]
ARM = [(72, 25), (76, 30), (79, 30)]


def box(points, x, y, k):
    return [(x + px * k, y + py * k) for px, py in points]


def animal(d, x, y, k, kind):
    body = box(SPINE + BELLY[1:], x, y, k)
    width = max(2, int(k / 5))
    if kind == "skeleton":
        d.line(box(SPINE, x, y, k), fill=LINEN, width=width)
        for i in range(2, 7):
            px, py = SPINE[i]
            d.arc([x + (px - 4) * k, y + py * k, x + (px + 4) * k, y + (py + 13 - abs(4 - i) * 2) * k], 20, 160, fill=LINEN, width=max(1, width - 1))
        for i in range(0, len(SPINE) - 1):
            (ax, ay), (bx, by) = SPINE[i], SPINE[i + 1]
            for t in (0.25, 0.5, 0.75):
                px, py = ax + (bx - ax) * t, ay + (by - ay) * t
                d.line([x + px * k, y + (py - 1.2) * k, x + px * k, y + (py + 1.2) * k], fill=LINEN, width=max(1, width - 1))
        d.polygon(box([(82, 8), (93, 9), (97, 13), (90, 16), (83, 16)], x, y, k), outline=LINEN, width=width)
        for leg in LEGS:
            d.line(box([leg[0], leg[1], leg[2], leg[3]], x, y, k), fill=LINEN, width=width)
        d.line(box(ARM, x, y, k), fill=LINEN, width=width)
    else:
        fill = None if kind == "muscles" else tuple(int(a * .55 + b * .45) for a, b in zip(WALL, LINEN))
        for leg in LEGS:
            d.polygon(box(leg, x, y, k), outline=LINEN, fill=fill, width=width)
        d.polygon(body, outline=LINEN, fill=fill, width=width)
        d.line(box(ARM, x, y, k), fill=LINEN, width=width)
        if kind == "muscles":
            for i in range(8, 80, 3):
                top = min(SPINE, key=lambda p: abs(p[0] - i))[1] + 1
                d.line([x + i * k, y + (top + 1) * k, x + (i - 3) * k, y + (top + 9) * k], fill=CHALK, width=max(1, width - 1))


def sheet(w, h, kind, words):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (w, h), WALL)
    d = ImageDraw.Draw(im)
    for i in range(0, h, 4):  # a light from above, as on the wall
        d.line([0, i, w, i], fill=tuple(int(a + (b - a) * (i / h) ** 1.4) for a, b in zip(WALL, EDGE)))
    k = min(w / 122, h / 78)
    x, y = (w - 100 * k) / 2, (h - 60 * k) / 2 + 2 * k
    d.line([x - 6 * k, y + 56 * k, x + 106 * k, y + 56 * k], fill=SOFT, width=max(1, int(k / 8)))
    if kind == "size":
        animal(d, x + 12 * k, y + 8 * k, k * .86, "animal")
        px = x + 6 * k  # a person of 1.8 m beside an animal twelve metres long
        d.ellipse([px - 1.1 * k, y + 41.6 * k, px + 1.1 * k, y + 43.8 * k], outline=CHALK, width=max(2, int(k / 5)))
        d.line([px, y + 43.8 * k, px, y + 51 * k], fill=CHALK, width=max(2, int(k / 5)))
        d.line([px - 1.6 * k, y + 56 * k, px, y + 51 * k, px + 1.6 * k, y + 56 * k], fill=CHALK, width=max(2, int(k / 5)))
        for i in range(0, 13):
            tx = x + 12 * k + i * 7.16 * k
            d.line([tx, y + 58 * k, tx, y + (60.5 if i % 6 else 62) * k], fill=SOFT, width=max(1, int(k / 8)))
    else:
        animal(d, x, y, k, kind)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", max(13, int(h / 38)))
    except OSError:
        font = ImageFont.load_default()
    d.text((int(w * .03), int(h * .04)), words, fill=SOFT, font=font)
    return im


def make(stem, w, h, kind, widths):
    from PIL import Image
    made = []
    big = sheet(w, h, kind, "STAND-IN PICTURE, TEST ONLY")
    for n in widths:
        im = big if n == w else big.resize((n, round(h * n / w)), Image.LANCZOS)
        path = OUT / f"{stem}-{n}.webp"
        im.save(path, "WEBP", quality=82, method=6)
        subprocess.run([MAGICK, str(path), "-quality", "55", str(path.with_suffix(".avif"))], check=True)
        made.append(path)
    return made


JOBS = {
    "t-hero": (1600, 900, "animal", [960, 1600]), "t-hero-m": (1080, 1080, "animal", [780, 1080]),
    "t-card": (1600, 900, "skeleton", [480, 800, 1600]), "t-skeleton": (1200, 800, "skeleton", [600, 1200]),
    "t-muscles": (1200, 800, "muscles", [600, 1200]), "t-animal": (1200, 800, "animal", [600, 1200]),
    "t-size": (1600, 700, "size", [800, 1600]),
}


def ensure():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, (w, h, kind, widths) in JOBS.items():
        if not all((OUT / f"{stem}-{n}.{e}").exists() for n in widths for e in ("webp", "avif")):
            make(stem, w, h, kind, widths)


if __name__ == "__main__":
    ensure()
    print(sorted(p.name for p in OUT.iterdir()))
