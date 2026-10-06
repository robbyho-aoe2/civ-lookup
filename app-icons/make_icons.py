"""Renders the PWA icon PNGs for AoE Auto Scout (needs Pillow). Run from anywhere:
    python app-icons/make_icons.py
The logo (shield, rank chevron, rising bars) is drawn in a 100x100 design space (draw_logo). To change the logo, edit draw_logo()
(and favicon.svg to match), then re-run - nothing else needs to change.
"""
import math
from pathlib import Path
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


def draw_logo(img, ox, oy, k):
    """Shield with a gold rank chevron over three rising bars (option C).
    (ox, oy) = top-left of the 100x100 design box, k = pixels per unit."""
    P = lambda x, y: (ox + x * k, oy + y * k)
    d = ImageDraw.Draw(img)
    outer = [P(x, y) for x, y in _shield()]
    d.polygon(outer, fill=FACE + (255,))
    d.line(outer + [outer[0]], fill=JADE + (255,), width=max(1, round(4.5 * k)), joint="curve")
    px, py = P(50, 11)
    r = 2.25 * k
    d.ellipse([px - r, py - r, px + r, py + r], fill=JADE + (255,))  # closes the join at the peak
    inner = [P(50 + (x - 50) * 0.78, 52 + (y - 52) * 0.78) for x, y in _shield()]
    d.line(inner + [inner[0]], fill=_mix(JADE, FACE, 0.4), width=max(1, round(1.5 * k)), joint="curve")
    w = max(1, round(5 * k))
    chev = [P(36, 36), P(50, 26), P(64, 36)]
    d.line(chev, fill=GOLD + (255,), width=w, joint="curve")
    for x, y in chev:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=GOLD + (255,))
    for x0, top, a in ((34, 56, 0.55), (46, 50, 0.8), (58, 44, 1.0)):
        d.rounded_rectangle([P(x0, top)[0], P(x0, top)[1], P(x0 + 9, 68)[0], P(x0 + 9, 68)[1]], radius=2 * k, fill=_mix(JADE, FACE, a))


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
