"""Contact sheets for review: python _sheets.py <next dir> [cols rows cellW cellH]"""
import json, sys, os
from PIL import Image, ImageDraw
d = sys.argv[1]
cols, rows, cw, ch = (int(x) for x in sys.argv[2:6]) if len(sys.argv) > 5 else (2, 2, 880, 560)
m = json.load(open(d + "/manifest.json"))["screens"]
out = d + "/build/sheets"; os.makedirs(out, exist_ok=True)
for f in os.listdir(out): os.remove(out + "/" + f)
per = cols * rows
for si in range(0, len(m), per):
    sheet = Image.new("RGB", (cols * (cw + 8) + 8, rows * (ch + 28) + 8), "#888888")
    dr = ImageDraw.Draw(sheet)
    for i, s in enumerate(m[si:si + per]):
        im = Image.open(f"{d}/screens/{s['id']}.png").convert("RGB")
        k = min(cw / im.width, ch / im.height); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        x = 8 + (i % cols) * (cw + 8); y = 8 + (i // cols) * (ch + 28)
        dr.text((x, y + 4), f"{s['id']} {s['title']}", fill="white")
        sheet.paste(im, (x, y + 22))
    sheet.save(f"{out}/s{si // per + 1:02d}.png")
print(len(m), "screens", (len(m) + per - 1) // per, "sheets")
