"""Reads next/build/measure/m.png (4x) and reports icon-centre vs text-centre (1x px) for every cell. Pass = |dy| <= 1."""
import json, sys
from PIL import Image
import numpy as np
D = "D:/workspaces/speak-it/designs/next/build/measure"
im = np.array(Image.open(D + "/m.png").convert("RGB")).astype(int)
cells = json.load(open(D + "/cells.json"))
S = 4; fails = 0
for i, c in enumerate(cells):
    x0 = (i % 4) * 260 * S; y0 = (i // 4) * 64 * S
    cr = im[y0:y0 + 64 * S, x0:x0 + 260 * S]
    lum = cr.mean(axis=2)
    if c["inv"]:
        # bright pixels on a coloured fill
        fill = lum < 140
        ys, xs = np.where(fill)
        if len(ys) == 0: print(c["name"], "no fill"); continue
        fx0, fx1, fy0, fy1 = xs.min(), xs.max(), ys.min(), ys.max()
        sub = lum[fy0:fy1 + 1, fx0:fx1 + 1] > 200
        inner = np.zeros_like(sub); inner[3:-3, 3:-3] = sub[3:-3, 3:-3]  # ignore antialiased fill edge/corners
        ink = inner; ox, oy = fx0, fy0
        frame_cy = (fy0 + fy1 + 1) / 2 / S
    else:
        ink = lum < 128; ox, oy = 0, 0
        frame_cy = 32.0
    cols = np.where(ink.any(axis=0))[0]
    if len(cols) == 0: print(c["name"], "no ink"); continue
    # split into clusters separated by >= 14 px (3.5 px at 1x)
    groups = [[cols[0]]]
    for x in cols[1:]:
        (groups[-1].append(x) if x - groups[-1][-1] < 14 else groups.append([x]))
    def cy(g):
        sl = ink[:, g[0]:g[-1] + 1]; rows = np.where(sl.any(axis=1))[0]
        return (rows.min() + rows.max() + 1) / 2 / S + oy / S
    if c["kind"] == "icon-only":
        iy = cy([cols[0], cols[-1]]); d = iy - frame_cy
        ok = abs(d) <= 0.5
        print(f"{'OK ' if ok else 'BAD'} {c['name']:28s} icon centre {iy:6.2f}  frame centre {frame_cy:6.2f}  dy {d:+.2f}")
    else:
        icon_g, text_g = (groups[0], [x for g in groups[1:] for x in g]) if c["kind"] == "icon-left" else (groups[-1], [x for g in groups[:-1] for x in g])
        if not text_g: print(c["name"], "clusters", len(groups)); continue
        iy = cy(icon_g); ty = cy([text_g[0], text_g[-1]]); d = iy - ty
        ok = abs(d) <= 1.0
        print(f"{'OK ' if ok else 'BAD'} {c['name']:28s} icon {iy:6.2f}  text {ty:6.2f}  dy {d:+.2f}   (frame centre {frame_cy:.2f}, clusters {len(groups)})")
    fails += 0 if ok else 1
print("FAILS", fails)
sys.exit(1 if fails else 0)
