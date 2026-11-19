"""A test fixture, never published: one made-up answer page on the questions shelf, its topic, its picture's record and
its picture. install() puts them beside a copy of the pages' build (a test's folder, or a local test build), never
into the site's own pages, registry, pictures.json or pictures (install() refuses them; the pages build refuses
a test page, page.fixture, in the site's own build). The tests run on the standard library alone, so the
picture is one plain colour written by hand; --drawn draws the plan itself (Pillow) for a local build to look at.

    python3 pages/testdata/question_fixture.py [--drawn] <pages folder> <registry.json> <pictures.json> <picture folder>
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NAME = "question-fixture"
SHELF = "questions"
TOPIC = {
    "slug": {"en": "fixture-sample-wall", "de": "testseite-probemauer"},
    "name": {"en": "Fixture: how long is the sample wall?", "de": "Testseite: Wie lang ist die Probemauer?"},
    "line": {"en": "A made-up question for the tests, never published.",
             "de": "Eine erfundene Frage für die Tests, nie veröffentlicht."},
    "count": "question_fixture",
    "about": {"@type": "Thing", "name": "Sample wall, a test fixture"},
}
WIDTHS = (640, 1080, 1600)
SIZE = (1600, 1000)
OSM = "https://www.openstreetmap.org/copyright"
ODBL = "https://opendatacommons.org/licenses/odbl/"


def record(lang):
    """The picture's record, as a shelf's picture stands in pictures.json: in the shelf's own folder of the store."""
    stem = f"{SHELF}-fixture-plan-{lang}"
    return {"name": stem, "work": f"{SHELF}-fixture-plan", "record": f"{SHELF}/page-figure/{stem}__1600x1000",
            "file": f"{SHELF}/pages/{stem}__1600x1000.png", "sha256": "0" * 64, "tier": "TIER1", "source": OSM,
            "licence_url": ODBL, "it108": False, "shape": "wide", "widths": list(WIDTHS), "made": True}


def plain_webp(width, height, rgb):
    """A lossless WebP (VP8L) of one colour from the standard library: no transform, no colour cache, and one prefix
    code of a single symbol for each channel, so no pixel takes a bit."""
    bits, n = 0, 0

    def put(value, count):
        nonlocal bits, n
        bits |= value << n
        n += count
    put(width - 1, 14)
    put(height - 1, 14)
    # no alpha, version 0; then no transform, no colour cache, one group of prefix codes
    put(0, 1)
    put(0, 3)
    put(0, 3)
    for symbol in (rgb[1], rgb[0], rgb[2], 255, 0):
        # a simple code of one symbol, written in eight bits: green, red, blue, alpha, distance
        put(0b101, 3)
        put(symbol, 8)
    data = b"\x2f" + bits.to_bytes((n + 7) // 8, "little")
    chunk = b"VP8L" + len(data).to_bytes(4, "little") + data + b"\x00" * (len(data) % 2)
    return b"RIFF" + (4 + len(chunk)).to_bytes(4, "little") + b"WEBP" + chunk


def plain_jpeg(width, height):
    """A baseline JPEG of one grey (every block's coefficients zero) from the standard library: one Huffman code of one
    bit for the DC difference 0 and one for the end of block, so each 8 by 8 block takes two bits."""
    def segment(marker, body):
        return bytes([0xFF, marker]) + (len(body) + 2).to_bytes(2, "big") + body
    blocks = -(-width // 8) * -(-height // 8)
    bits = 2 * blocks
    # the scan's bits are all 0; the last byte is padded with 1s, as JPEG asks
    data = bytes(bits // 8) + (bytes([(1 << (8 - bits % 8)) - 1]) if bits % 8 else b"")
    one_code = bytes([1] + [0] * 15) + b"\x00"
    return (b"\xff\xd8" + segment(0xDB, b"\x00" + bytes([1] * 64))
            + segment(0xC0, b"\x08" + height.to_bytes(2, "big") + width.to_bytes(2, "big") + b"\x01\x01\x11\x00")
            + segment(0xC4, b"\x00" + one_code) + segment(0xC4, b"\x10" + one_code)
            + segment(0xDA, b"\x01\x01\x00\x00\x3f\x00") + data + b"\xff\xd9")


def share(lang):
    """The share card's line, as a card cut in the store stands in pictures.json (share), in the shelf's own folder."""
    name = f"{SHELF}-fixture-og-{lang}-1200x630"
    return {"name": name, "record": f"{SHELF}/page-share/{name}", "file": f"{SHELF}/pages/{name}.png", "sha256": "0" * 64}


def draw(lang, folder, drawn=False):
    """The plan: a straight wall from above, its measured stretch solid in the known colour, its guessed stretch dashed
    in the guessed colour (the colours the page's swatches name), cut to the page's widths as WebP and AVIF. Without
    drawn: each cut one plain colour of the same size, its AVIF a copy of its WebP (no test decodes either)."""
    stem = record(lang)["name"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{share(lang)['name']}.jpg").write_bytes(plain_jpeg(1200, 630))
    if not drawn:
        for w in WIDTHS:
            picture = plain_webp(w, round(w * SIZE[1] / SIZE[0]), (0x1d, 0x1b, 0x19))
            (folder / f"{stem}-{w}.webp").write_bytes(picture)
            (folder / f"{stem}-{w}.avif").write_bytes(picture)
        return
    from PIL import Image, ImageDraw, ImageFont
    words = {"en": ("measured", "guessed"), "de": ("gemessen", "vermutet")}[lang]
    pics = json.loads((HERE / f"{NAME}.en.json").read_text(encoding="utf-8"))["pics"]["plan"]
    known, guessed = pics["swatches"]["known"], pics["swatches"]["guessed"]
    img = Image.new("RGB", SIZE, "#1d1b19")
    d = ImageDraw.Draw(img)
    for x in range(0, SIZE[0], 80):
        d.line([(x, 0), (x, SIZE[1])], fill="#26231f", width=2)
    for y in range(0, SIZE[1], 80):
        d.line([(0, y), (SIZE[0], y)], fill="#26231f", width=2)
    y, x0, x1, x2 = 500, 160, 1000, 1440
    d.line([(x0, y), (x1, y)], fill=known, width=28)
    for x in range(x1 + 20, x2, 70):
        d.line([(x, y), (min(x + 40, x2), y)], fill=guessed, width=28)
    font = ImageFont.load_default(size=56)
    d.text((x0, y - 110), words[0], fill=known, font=font)
    d.text((x1 + 20, y - 110), words[1], fill=guessed, font=font)
    for w in WIDTHS:
        cut = img.resize((w, round(w * SIZE[1] / SIZE[0])), Image.LANCZOS)
        webp = folder / f"{stem}-{w}.webp"
        cut.save(webp, "WEBP", quality=80)
        avif = folder / f"{stem}-{w}.avif"
        magick = shutil.which("magick")
        if magick:
            subprocess.run([magick, str(webp), str(avif)], check=True)
        else:
            # no encoder at hand: the build only serves the file, a browser never sees a test build without one
            shutil.copyfile(webp, avif)


def install(pages, registry, pictures, img, drawn=False):
    pages, registry, pictures, img = Path(pages), Path(registry), Path(pictures), Path(img)
    # never into the tree this file stands in: its pages, its registry, its pictures.json or its pictures
    own = {HERE.parent.resolve(), (HERE.parent.parent / "_src" / "registry.json").resolve(), (HERE.parent / "pictures.json").resolve()}
    for target in (pages, registry, pictures, img):
        where = target.resolve()
        if where in own or HERE.parent.parent.resolve() in where.parents and (HERE.parent / "_work").resolve() not in where.parents:
            raise SystemExit(f"the test page is installed into a test's own folder, never into the site's own tree: {target}")
    for lang in ("en", "de"):
        shutil.copyfile(HERE / f"{NAME}.{lang}.json", pages / f"{NAME}.{lang}.json")
        draw(lang, img, drawn)
    wings = json.loads(registry.read_text(encoding="utf-8"))
    wings[SHELF]["topics"] = [t for t in wings[SHELF]["topics"] if t.get("count") != TOPIC["count"]] + [TOPIC]
    registry.write_text(json.dumps(wings, ensure_ascii=False, indent=2), encoding="utf-8")
    known = json.loads(pictures.read_text(encoding="utf-8"))
    names = {record(lang)["name"] for lang in ("en", "de")}
    known["plates"] = [p for p in known["plates"] if p["name"] not in names] + [record(lang) for lang in ("en", "de")]
    cards = {share(lang)["name"] for lang in ("en", "de")}
    known["share"] = [s for s in known["share"] if s["name"] not in cards] + [share(lang) for lang in ("en", "de")]
    pictures.write_text(json.dumps(known, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--drawn"]
    if len(args) != 4:
        raise SystemExit(__doc__)
    install(*args, drawn="--drawn" in sys.argv)
