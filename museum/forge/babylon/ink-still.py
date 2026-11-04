"""THE INK STILL: a stop's held frame turned to ink on the paper kit's paper, offline.

A paper feature opens by turning the stop's own frame to ink: the lines where the frame's light changes, a thin wash
where it is dark, on the paper token, in the ink token. Both colours are read from the kit's one place
(src/wings/babylon/paper/tokens.ts), never typed here. No hatch: on paper a hatch means "guessed", and the ink still
claims nothing; it is the place, drawn.

  python3 -I forge/babylon/ink-still.py <held frame> <out .jpg> [--tokens <tokens.ts>] [--line 1.0] [--wash 0.32]
  python3 -I forge/babylon/ink-still.py --self-test
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
TOKENS = HERE.parent.parent / 'src/wings/babylon/paper/tokens.ts'


def tokens(path=TOKENS):
    """the paper's two colours as 0..1 RGB, from the kit's own file"""
    text = Path(path).read_text(encoding='utf-8')
    out = {}
    for name in ('paper', 'ink'):
        m = re.search(r"^\s*%s:\s*'#([0-9a-fA-F]{6})'" % name, text, re.M)
        if not m:
            raise SystemExit(f'no {name} token in {path}')
        h = m.group(1)
        out[name] = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255
    return out


def blur(a, sigma):
    """a float plane blurred by a separable Gaussian, edges replicated"""
    if sigma <= 0.05:
        return a
    r = max(1, int(np.ceil(3 * sigma)))
    x = np.arange(-r, r + 1, dtype=np.float32)
    k = np.exp(-x * x / (2 * sigma * sigma))
    k /= k.sum()
    for axis in (0, 1):
        p = np.pad(a, [(r, r) if d == axis else (0, 0) for d in (0, 1)], mode='edge')
        n = a.shape[axis]
        out = np.zeros_like(a)
        for i, w in enumerate(k):
            out += w * (p[i:i + n, :] if axis == 0 else p[:, i:i + n])
        a = out
    return a


def gradient(a):
    """Sobel magnitude, edges replicated"""
    p = np.pad(a, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    return np.hypot(gx, gy) / 8


def ink(frame, tok, line=1.0, wash=0.24):
    rgb = np.asarray(frame.convert('RGB'), dtype=np.float32) / 255
    h, w = rgb.shape[:2]
    k = w / 1600  # the frame's own pixel against a 1600 px wide stage
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # the frame's light, normalised: its own dark and light ends
    lo, hi = np.percentile(lum, [1, 99.5])
    n = np.clip((lum - lo) / max(1e-4, hi - lo), 0, 1)
    # lines: fine edges and the large shapes' edges, each against its own spread
    fine, broad = gradient(blur(n, 0.9 * k)), gradient(blur(n, 2.6 * k))
    def soft(g, q0, q1):
        a, b = np.percentile(g, [q0, q1])
        return np.clip((g - a) / max(1e-5, b - a), 0, 1)
    # a strong edge is the fine one's line alone; the broad one only finds what the fine one misses, at half weight
    edges = np.maximum(soft(fine, 91, 99.7), 0.45 * soft(broad, 90, 99.8))
    edges = blur(edges, 0.3 * k) * line
    edges = np.clip(edges * 1.1, 0, 1) ** 1.4
    # the wash: the dark of the frame as a thin ink tone, the sky and the sun left as paper
    tone = np.clip(1 - n, 0, 1) ** 1.6 * wash
    a = 1 - (1 - edges) * (1 - tone)
    out = tok['paper'][None, None, :] * (1 - a[..., None]) + tok['ink'][None, None, :] * a[..., None]
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB')


def self_test():
    tok = tokens()
    assert tok['paper'].mean() > 0.8 and tok['ink'].mean() < 0.2, tok
    # a dark square on a light ground: its edge is ink, the light ground stays paper
    a = np.full((200, 320, 3), 220, np.uint8)
    a[60:140, 100:220] = 60
    img = ink(Image.fromarray(a), tok)
    o = np.asarray(img, dtype=np.float32) / 255
    paper_at, edge_at = o[10, 10], o[100, 100]
    assert np.abs(paper_at - tok['paper']).max() < 0.03, paper_at
    assert edge_at.mean() < tok['paper'].mean() - 0.3, edge_at
    print('ink-still self-test: ok')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('held', nargs='?')
    ap.add_argument('out', nargs='?')
    ap.add_argument('--tokens', default=str(TOKENS))
    ap.add_argument('--line', type=float, default=1.0)
    ap.add_argument('--wash', type=float, default=0.24)
    ap.add_argument('--self-test', action='store_true')
    o = ap.parse_args()
    if o.self_test:
        self_test()
        return
    if not o.held or not o.out:
        ap.error('<held frame> <out .jpg>')
    img = ink(Image.open(o.held), tokens(o.tokens), o.line, o.wash)
    img.save(o.out, quality=90)
    print(f'{o.out}: {img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    main()
