"""The gate's picture numbers: contact sheets, brightness, fixed-box 1:1 crops, thumbnails.

  python3 -I measure.py sheet <folder> [--out SHEET.jpg] [--width 2400] [--only a,b]   every PNG/JPG in the folder on one sheet, names under each
  python3 -I measure.py stats <folder> [--boxes crop-boxes.json] [--md NUMBERS.md]    median, p1, p99 of luma per still (and of the door box)
  python3 -I measure.py crops <still> <crop-boxes.json> <framing> <outdir> [--suffix]  the 1:1 crops at the fixed boxes
  python3 -I measure.py thumb <still> <width> <out>
  python3 -I measure.py frames <folder> <prefix> <out> [--cols 8]                     a sheet of sketch frames (1 fps)
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont


def luma_stats(img, box=None):
    g = img.convert('RGB')
    if box:
        g = g.crop(tuple(box))
    px = g.get_flattened_data() if hasattr(g, 'get_flattened_data') else g.getdata()
    hist = [0] * 256
    for r, gg, b in px:
        hist[min(255, round(0.2126 * r + 0.7152 * gg + 0.0722 * b))] += 1
    n = sum(hist)

    def at(f):
        acc = 0
        for v in range(256):
            acc += hist[v]
            if acc >= f * n:
                return v
        return 255

    return {'median': at(0.5), 'p1': at(0.01), 'p99': at(0.99)}


def font(size):
    for f in ('/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def sheet(folder, out, width=2400, only=None):
    names = sorted(n for n in os.listdir(folder) if n.lower().endswith(('.png', '.jpg')) and n != os.path.basename(out) and not n.startswith('SHEET'))
    if only:
        names = [n for n in names if any(o in n for o in only)]
    imgs = [(n, Image.open(os.path.join(folder, n)).convert('RGB')) for n in names]
    if not imgs:
        print('no pictures')
        return
    # rows of up to 3, each picture scaled to the row's height
    rows, row = [], []
    for it in imgs:
        row.append(it)
        if len(row) == 3:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    f = font(22)
    pad, label = 10, 30
    rendered = []
    for r in rows:
        ratio = sum(im.width / im.height for _, im in r)
        h = int((width - pad * (len(r) + 1)) / ratio)
        h = min(h, 900)
        canvas = Image.new('RGB', (width, h + label + pad), (18, 18, 18))
        x = pad
        d = ImageDraw.Draw(canvas)
        for n, im in r:
            w = int(im.width * h / im.height)
            canvas.paste(im.resize((w, h), Image.LANCZOS), (x, pad))
            d.text((x, h + pad + 2), n, fill=(220, 220, 220), font=f)
            x += w + pad
        rendered.append(canvas)
    H = sum(c.height for c in rendered)
    out_img = Image.new('RGB', (width, H), (18, 18, 18))
    y = 0
    for c in rendered:
        out_img.paste(c, (0, y))
        y += c.height
    out_img.save(out, quality=88)
    print(f'sheet {out} {out_img.width}x{out_img.height}')


def stats(folder, boxes=None, md=None):
    bx = json.load(open(boxes)) if boxes else None
    lines = ['| still | pixels | median | p1 | p99 | door box median |', '|---|---|---|---|---|---|']
    for n in sorted(os.listdir(folder)):
        if not n.lower().endswith('.png'):
            continue
        im = Image.open(os.path.join(folder, n))
        s = luma_stats(im)
        door = ''
        if bx and n.startswith('phone-390x664') and 'door' in bx.get('phone', {}).get('boxes', {}):
            b = bx['phone']['boxes']['door']['box']
            if im.width == bx['phone']['devicePixels'][0]:
                door = str(luma_stats(im, b)['median'])
        lines.append(f'| {n} | {im.width}x{im.height} | {s["median"]} | {s["p1"]} | {s["p99"]} | {door} |')
    text = '\n'.join(lines)
    print(text)
    if md:
        open(md, 'w').write(text + '\n')


def crops(still, boxes, framing, outdir, suffix=''):
    bx = json.load(open(boxes))[framing]
    im = Image.open(still)
    if im.width != bx['devicePixels'][0]:
        raise SystemExit(f'{still} is {im.width} wide, the boxes are for {bx["devicePixels"][0]}')
    os.makedirs(outdir, exist_ok=True)
    for name, b in bx['boxes'].items():
        out = os.path.join(outdir, f'crop-{name}{suffix}.png')
        im.crop(tuple(b['box'])).save(out)
        print(f'{out} {b["box"]}')


def thumb(still, width, out):
    im = Image.open(still).convert('RGB')
    h = round(im.height * width / im.width)
    im.resize((width, h), Image.LANCZOS).save(out)
    print(f'{out} {width}x{h}')


def frames(folder, prefix, out, cols=8, lo=None, hi=None):
    names = sorted(n for n in os.listdir(folder) if n.startswith(prefix) and n.endswith('.jpg'))
    if lo is not None:
        names = [n for n in names if lo <= int(n[len(prefix):-4]) <= hi]
    if not names:
        print('no frames')
        return
    ims = [Image.open(os.path.join(folder, n)).convert('RGB') for n in names]
    w = 240 if ims[0].width > ims[0].height else 120
    h = round(ims[0].height * w / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    f = font(16)
    canvas = Image.new('RGB', (cols * (w + 4) + 4, rows * (h + 24) + 4), (18, 18, 18))
    d = ImageDraw.Draw(canvas)
    for i, (n, im) in enumerate(zip(names, ims)):
        x, y = 4 + (i % cols) * (w + 4), 4 + (i // cols) * (h + 24)
        canvas.paste(im.resize((w, h), Image.LANCZOS), (x, y))
        d.text((x, y + h + 2), n.replace(prefix, '').replace('.jpg', ''), fill=(220, 220, 220), font=f)
    canvas.save(out, quality=86)
    print(f'frames {out} {len(ims)}')


def main():
    a = sys.argv[1:]
    opt = {}
    pos = []
    i = 0
    while i < len(a):
        if a[i].startswith('--'):
            if i + 1 < len(a) and not a[i + 1].startswith('--'):
                opt[a[i][2:]] = a[i + 1]
                i += 2
            else:
                opt[a[i][2:]] = True
                i += 1
        else:
            pos.append(a[i])
            i += 1
    cmd = pos[0]
    if cmd == 'sheet':
        sheet(pos[1], opt.get('out', os.path.join(pos[1], 'SHEET.jpg')), int(opt.get('width', 2400)), opt['only'].split(',') if 'only' in opt else None)
    elif cmd == 'stats':
        stats(pos[1], opt.get('boxes'), opt.get('md'))
    elif cmd == 'crops':
        crops(pos[1], pos[2], pos[3], pos[4], opt.get('suffix', ''))
    elif cmd == 'thumb':
        thumb(pos[1], int(pos[2]), pos[3])
    elif cmd == 'frames':
        frames(pos[1], pos[2], pos[3], int(opt.get('cols', 8)), int(opt['from']) if 'from' in opt else None, int(opt['to']) if 'to' in opt else None)
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
