#!/usr/bin/env python3
"""Draws the grain tile that keeps the pools of light from banding: linen at an alpha of 0 to 5 of 255.

    python3 _src/tools/make_grain.py

The colour is read from css/tokens.css, so the tile follows the palette. Seeded: the same tile every run."""
import random
import re
from pathlib import Path
from PIL import Image

SRC = Path(__file__).resolve().parent.parent
OUT = SRC / "img" / "grain.png"
SIZE, LEVELS = 128, 6

linen = re.search(r"--linen:\s*#([0-9a-fA-F]{6})", (SRC / "css" / "tokens.css").read_text()).group(1)
rgb = tuple(int(linen[i:i + 2], 16) for i in (0, 2, 4))
rnd = random.Random(20261005)
tile = Image.new("P", (SIZE, SIZE))
tile.putpalette(list(rgb) * LEVELS)
tile.putdata([rnd.randrange(LEVELS) for _ in range(SIZE * SIZE)])
OUT.parent.mkdir(parents=True, exist_ok=True)
tile.save(OUT, optimize=True, transparency=bytes(range(LEVELS)))
print(OUT, OUT.stat().st_size, "bytes")
