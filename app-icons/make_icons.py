"""Renders the PWA icon PNGs for AoE Auto Scout (needs Pillow). Run from anywhere:
    python app-icons/make_icons.py
The logo (silver shield, gold rank chevron, bars rising from silver to gold) is drawn in a 100x100 design space (draw_logo). To change the logo, edit draw_logo()
(and favicon.svg to match), then re-run - nothing else needs to change.
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).parent
BG, EDGE = (16, 14, 12), (54, 46, 36)          # obsidian, border
JADE, GOLD = (95, 184, 140), (224, 187, 112)
SS = 4                                          # supersampling factor


def _bez(p0, p1, p2, p3, n=24):
    return [((1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t ** 3 * p3[0],
             (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t ** 3 * p3[1])
            for t in [i / n for i in range(n + 1)]]


def _shield(inset=0.0):
    """Heater shield outline in the 100x100 design box; inset > 0 shrinks it toward the centre."""
    pts = (_bez((50, 11), (60, 15), (72, 17), (82, 17))[:-1] + [(82, 17), (82, 48)] +
           _bez((82, 48), (82, 68), (68, 82), (50, 91))[:-1] + _bez((50, 91), (32, 82), (18, 68), (18, 48))[:-1] +
           [(18, 48), (18, 17)] + _bez((18, 17), (28, 17), (40, 15), (50, 11)))
    if inset:
        pts = [(50 + (x - 50) * (1 - inset), 52 + (y - 52) * (1 - inset)) for x, y in pts]
    return pts


def _mix(fg, bg, a):
    return tuple(int(bg[i] + (fg[i] - bg[i]) * a) for i in range(3)) + (255,)


FACE = (23, 19, 15)
# Silver rim (the AUTO half of the wordmark), gold chevron (SCOUT), bars that warm from silver to gold as they rise.
SILVER_HI, SILVER_LO = (238, 240, 245), (150, 156, 168)
GOLD_HI, GOLD_LO = (255, 214, 92), (214, 150, 20)


def _paint(mask, top, bot, y0, y1):
    """A vertical gradient top->bot between rows y0 and y1, shown only where mask is set."""
    S = mask.size[0]
    ys = np.clip((np.arange(S) - y0) / max(1.0, y1 - y0), 0, 1)[:, None, None]
    t, b = np.array(top)[None, None, :], np.array(bot)[None, None, :]
    layer = Image.fromarray((t + (b - t) * ys).repeat(S, axis=1).astype("uint8"), "RGB").convert("RGBA")
    layer.putalpha(mask)
    return layer


def draw_logo(img, ox, oy, k):
    """Shield with a gold rank chevron over three rising bars, silver and gold.
    (ox, oy) = top-left of the 100x100 design box, k = pixels per unit."""
    S = img.size[0]
    P = lambda x, y: (ox + x * k, oy + y * k)
    d = ImageDraw.Draw(img)
    outer = [P(x, y) for x, y in _shield()]
    d.polygon(outer, fill=FACE + (255,))
    m = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(m)
    md.line(outer + [outer[0]], fill=255, width=max(1, round(5 * k)), joint="curve")
    px, py = P(50, 11)
    r = 2.5 * k
    md.ellipse([px - r, py - r, px + r, py + r], fill=255)  # closes the join at the peak
    img.alpha_composite(_paint(m, SILVER_HI, SILVER_LO, oy + 8 * k, oy + 92 * k))
    d = ImageDraw.Draw(img)
    inner = [P(50 + (x - 50) * 0.78, 52 + (y - 52) * 0.78) for x, y in _shield()]
    d.line(inner + [inner[0]], fill=_mix(SILVER_LO, FACE, 0.45), width=max(1, round(1.5 * k)), joint="curve")
    w = max(1, round(5.5 * k))
    chev = [P(36, 36), P(50, 25), P(64, 36)]
    cm = Image.new("L", (S, S), 0)
    cd = ImageDraw.Draw(cm)
    cd.line(chev, fill=255, width=w, joint="curve")
    for x, y in chev:
        cd.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    img.alpha_composite(_paint(cm, GOLD_HI, GOLD_LO, oy + 22 * k, oy + 40 * k))
    for x0, top, t in ((34, 56, 0.0), (46, 50, 0.5), (58, 44, 1.0)):
        one = Image.new("L", (S, S), 0)
        ImageDraw.Draw(one).rounded_rectangle([*P(x0, top), *P(x0 + 9, 68)], radius=2 * k, fill=255)
        mix = lambda a, b: tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
        img.alpha_composite(_paint(one, mix(SILVER_HI, GOLD_HI), mix(SILVER_LO, GOLD_LO), oy + 44 * k, oy + 68 * k))


def tile(size, rounded=True, content=1.0):
    """size x size icon. rounded=True: rounded tile on transparent corners (normal icon);
    rounded=False: full-bleed square (maskable / apple-touch). content < 1 shrinks the logo
    toward the centre (maskable icons keep the logo inside the central ~80% safe zone)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BG + (255,), outline=EDGE + (255,), width=max(1, S // 100))
    else:
        d.rectangle([0, 0, S, S], fill=BG + (255,))
    k = S * content / 100
    off = S * (1 - content) / 2
    draw_logo(img, off, off, k)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    tile(192).save(OUT / "icon-192.png")
    tile(512).save(OUT / "icon-512.png")
    tile(512, rounded=False, content=0.72).save(OUT / "icon-maskable-512.png")
    tile(180, rounded=False, content=0.86).save(OUT / "apple-touch-icon.png")
    tile(32).save(OUT / "favicon-32.png")
    print("wrote icons to", OUT)
