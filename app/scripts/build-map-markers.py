"""Draws the map's marker art: flat diamonds, faceted gems and the floating (dotted-stem) variants.

Port of the approved mockup (docs/superpowers/mockups/2026-11-23-map-looks). All images are 2x pixels, drawn at 4x
and downsampled for anti-aliasing. Run from app/:  python -I scripts/build-map-markers.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "map"
SS = 4  # supersampling factor
STEM = 64  # 2x px a floating marker hovers above its spot
INK = (10, 10, 11, 255)


def hexc(h, a=255):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)


VOLT_FACES = ["#DDFF85", "#C6FF3D", "#8CBD20", "#668A16"]
RED_FACES = ["#FF8A8D", "#E5484D", "#B8343A", "#8C252A"]
GOLD_FACES = ["#FFF27A", "#FFD60A", "#F5B800", "#B88700"]
PURPLE_FACES = ["#F0E0FF", "#C9A4FF", "#9B5DE5", "#6B35AD"]


def finish(img):
    return img.resize((img.width // SS, img.height // SS), Image.LANCZOS)


def blend_layer(base, layer):
    base.alpha_composite(layer)


def flat_diamond(fill):
    s = 40 * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = s / 2
    half = 10 * SS
    r = half * math.sqrt(2)
    outer = [(c, c - r), (c + r, c), (c, c + r), (c - r, c)]
    d.polygon(outer, fill=INK)
    # 3 px edge centred on the path: the ink reaches 1.5 px past the square, the fill stops 1.5 px inside it.
    ri = (half - 1.5 * SS) * math.sqrt(2)
    ro = (half + 1.5 * SS) * math.sqrt(2)
    d.polygon([(c, c - ro), (c + ro, c), (c, c + ro), (c - ro, c)], fill=INK)
    d.polygon([(c, c - ri), (c + ri, c), (c, c + ri), (c - ri, c)], fill=hexc(fill))
    return finish(img)


def line(d, pts, width, fill):
    """A polyline with round joins, like canvas lineJoin=round."""
    for a, b in zip(pts, pts[1:]):
        d.line([a, b], fill=fill, width=round(width))
    r = width / 2
    for p in pts[1:-1]:
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def gem(faces):
    img = Image.new("RGBA", (44 * SS, 58 * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    P = lambda x, y: (x * SS, y * SS)
    T, L, F, R, B = P(22, 3), P(3, 25), P(22, 31), P(41, 25), P(22, 55)
    for pts, f in (([T, L, F], faces[0]), ([T, F, R], faces[1]), ([L, F, B], faces[2]), ([F, R, B], faces[3])):
        d.polygon(pts, fill=hexc(f))
    # inner facet lines, 60% ink, composited so they stay translucent
    inner = Image.new("RGBA", img.size, (0, 0, 0, 0))
    di = ImageDraw.Draw(inner)
    ink60 = (10, 10, 11, round(255 * 0.6))
    line(di, [L, F, R], 1.2 * SS, ink60)
    line(di, [T, F, B], 1.2 * SS, ink60)
    blend_layer(img, inner)
    # outline on top (canvas strokes it after the faces, before the inner lines; the inner lines never reach it visibly)
    d = ImageDraw.Draw(img)
    line(d, [T, R, B, L, T, R], 2.5 * SS, INK)
    return finish(img)


def floating(art, stem_rgba):
    w, h = art.size
    big = Image.new("RGBA", (w * SS, (h + STEM) * SS), (0, 0, 0, 0))
    big.alpha_composite(art.resize((w * SS, h * SS), Image.LANCZOS), (0, 0))
    layer = Image.new("RGBA", big.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = w / 2
    y = h + 2
    end = h + STEM
    while y < end:
        y2 = min(y + 3, end)
        d.rectangle([(x - 1) * SS, y * SS, (x + 1) * SS - 1, y2 * SS - 1], fill=stem_rgba)
        y += 7
    big.alpha_composite(layer)
    return finish(big)


def rgba(h, a):
    r, g, b, _ = hexc(h)
    return (r, g, b, round(a * 255))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    runner, chaser, ghost = (Image.open(OUT / f"j-{n}.png").convert("RGBA") for n in ("runner", "chaser", "ghost"))
    penjara, start = (Image.open(OUT / f"{n}.png").convert("RGBA") for n in ("penjara", "start"))
    images = {
        "dia-volt": flat_diamond("#C6FF3D"),
        "dia-red": flat_diamond("#E5484D"),
        "dia-gold": flat_diamond("#FFD60A"),
        "dia-purple": flat_diamond("#C9A4FF"),
        "gem-volt-float": floating(gem(VOLT_FACES), rgba("#C6FF3D", 0.45)),
        "gem-gold-float": floating(gem(GOLD_FACES), rgba("#FFD60A", 0.45)),
        "gem-purple-float": floating(gem(PURPLE_FACES), rgba("#C9A4FF", 0.45)),
        "gem-red": gem(RED_FACES),
        "j-runner-float": floating(runner, rgba("#C6FF3D", 0.5)),
        "j-chaser-float": floating(chaser, rgba("#F5F5F3", 0.5)),
        "j-ghost-float": floating(ghost, rgba("#C6FF3D", 0.25)),
        # Penjara and the start float in 3D like the gems (owner, 2026-11-24).
        "penjara-float": floating(penjara, rgba("#F5F5F3", 0.5)),
        "start-float": floating(start, rgba("#F5F5F3", 0.5)),
    }
    for name, im in images.items():
        im.save(OUT / f"{name}.png", optimize=True)
        print(name, im.size)


main()
