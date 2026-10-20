# a contact sheet: images in a grid, each scaled to a cell width, labelled with its file name
#   python3 sheet.py <out.jpg> <cell width> <columns> <image>...
import sys, os
from PIL import Image, ImageDraw
out, cw, cols, files = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
cells = [im.resize((cw, int(im.height * cw / im.width)), Image.LANCZOS) for im in ims]
rows = [cells[i:i + cols] for i in range(0, len(cells), cols)]
H = sum(max(c.height for c in r) + 16 for r in rows)
sheet = Image.new('RGB', (cw * cols, H), (24, 24, 24))
d = ImageDraw.Draw(sheet)
y = 0
for ri, r in enumerate(rows):
    for ci, c in enumerate(r):
        sheet.paste(c, (ci * cw, y + 16))
        d.text((ci * cw + 4, y + 2), os.path.basename(files[ri * cols + ci]), fill=(230, 230, 230))
    y += max(c.height for c in r) + 16
sheet.save(out, quality=88); print(out, sheet.size)
