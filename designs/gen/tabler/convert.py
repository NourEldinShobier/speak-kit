import re, json, glob, os, math
import xml.etree.ElementTree as ET

here = os.path.dirname(os.path.abspath(__file__))
out = {}
fmt = lambda v: ("%.3f" % v).rstrip("0").rstrip(".")

def circle(cx, cy, r):
    return f"M{fmt(cx-r)} {fmt(cy)}a{fmt(r)} {fmt(r)} 0 1 0 {fmt(2*r)} 0a{fmt(r)} {fmt(r)} 0 1 0 {fmt(-2*r)} 0"

def rect(x, y, w, h, rx):
    if rx:
        return f"M{fmt(x+rx)} {fmt(y)}h{fmt(w-2*rx)}a{fmt(rx)} {fmt(rx)} 0 0 1 {fmt(rx)} {fmt(rx)}v{fmt(h-2*rx)}a{fmt(rx)} {fmt(rx)} 0 0 1 {fmt(-rx)} {fmt(rx)}h{fmt(-(w-2*rx))}a{fmt(rx)} {fmt(rx)} 0 0 1 {fmt(-rx)} {fmt(-rx)}v{fmt(-(h-2*rx))}a{fmt(rx)} {fmt(rx)} 0 0 1 {fmt(rx)} {fmt(-rx)}z"
    return f"M{fmt(x)} {fmt(y)}h{fmt(w)}v{fmt(h)}h{fmt(-w)}z"

for f in sorted(glob.glob(os.path.join(here, "*.svg"))):
    style, name = os.path.basename(f)[:-4].split("-", 1)
    root = ET.parse(f).getroot()
    ds = []
    for el in root.iter():
        tag = el.tag.split("}")[1]
        a = el.attrib
        if tag == "path":
            if a.get("stroke") == "none" or a.get("d", "").strip() == "M0 0h24v24H0z":
                continue
            ds.append(a["d"])
        elif tag == "circle":
            ds.append(circle(float(a["cx"]), float(a["cy"]), float(a["r"])))
        elif tag == "rect":
            ds.append(rect(float(a.get("x", 0)), float(a.get("y", 0)), float(a["width"]), float(a["height"]), float(a.get("rx", 0))))
        elif tag == "line":
            ds.append(f"M{a['x1']} {a['y1']}L{a['x2']} {a['y2']}")
    key = name if style == "outline" else name + ":filled"
    out[key] = " ".join(ds)
json.dump(out, open(os.path.join(here, "..", "tabler.json"), "w"), indent=0)
print(len(out), "icons")
