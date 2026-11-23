"""Builds MapLibre glyph PBFs (SDF, 24px, 3px buffer) from a TTF.

usage: python -I build-glyphs.py <font.ttf> "<Fontstack Name>" <out_dir> [fallback.ttf]
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt

SIZE, BUFFER, RADIUS, CUTOFF, SS = 24, 3, 8, 0.25, 4


def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def field(num, wire, payload):
    return varint((num << 3) | wire) + payload


def f_uint(num, v):
    return field(num, 0, varint(v))


def f_sint(num, v):
    return field(num, 0, varint(v << 1 if v >= 0 else ((-v) << 1) - 1))


def f_bytes(num, b):
    return field(num, 2, varint(len(b)) + b)


def sdf(mask):
    """mask: bool array at supersampled res, padded. Returns uint8 SDF at 1x."""
    inside = distance_transform_edt(mask)
    outside = distance_transform_edt(~mask)
    d = (outside - inside) / SS  # positive outside, in 1x pixels
    h, w = d.shape
    d = d.reshape(h // SS, SS, w // SS, SS).mean(axis=(1, 3))
    v = 255 - 255 * (d / RADIUS + CUTOFF)
    return np.clip(np.round(v), 0, 255).astype(np.uint8)


def glyph(font_ss, font_1x, cp):
    ch = chr(cp)
    advance = int(round(font_1x.getlength(ch)))
    box = font_ss.getbbox(ch, anchor='ls')  # relative to baseline-left, y down
    if box[2] <= box[0] or box[3] <= box[1]:
        return f_uint(1, cp) + f_uint(3, 0) + f_uint(4, 0) + f_sint(5, 0) + f_sint(6, -SIZE) + f_uint(7, advance)
    x0, y0 = box[0] // SS * SS, box[1] // SS * SS  # align to 1x grid
    x1, y1 = -(-box[2] // SS) * SS, -(-box[3] // SS) * SS
    w, h = (x1 - x0) // SS, (y1 - y0) // SS
    pad = BUFFER * SS
    img = Image.new('L', ((w + 2 * BUFFER) * SS, (h + 2 * BUFFER) * SS), 0)
    ImageDraw.Draw(img).text((pad - x0, pad - y0), ch, font=font_ss, fill=255, anchor='ls')
    bitmap = sdf(np.array(img) > 127).tobytes()
    left, top = x0 // SS, -(y0 // SS) - SIZE  # top: distance above baseline, minus the 24px ascent
    return f_uint(1, cp) + f_bytes(2, bitmap) + f_uint(3, w) + f_uint(4, h) + f_sint(5, left) + f_sint(6, top) + f_uint(7, advance)


def main():
    ttf, name, out = sys.argv[1], sys.argv[2], sys.argv[3]
    fallback = sys.argv[4] if len(sys.argv) > 4 else None
    from fontTools.ttLib import TTFont
    # Each code point is drawn from the first font that has it: the primary, then the fallback.
    fonts = []
    for path in [ttf] + ([fallback] if fallback else []):
        fonts.append((set(TTFont(path).getBestCmap().keys()), ImageFont.truetype(path, SIZE * SS), ImageFont.truetype(path, SIZE)))
    cmap = set().union(*(f[0] for f in fonts))
    os.makedirs(os.path.join(out, name), exist_ok=True)
    made = 0
    for start in range(0, 65536, 256):
        end = start + 255
        body = f_bytes(1, name.encode()) + f_bytes(2, f'{start}-{end}'.encode())
        for cp in range(start, end + 1):
            if cp in cmap and cp >= 32:
                _, font_ss, font_1x = next(f for f in fonts if cp in f[0])
                body += f_bytes(3, glyph(font_ss, font_1x, cp))
                made += 1
        with open(os.path.join(out, name, f'{start}-{end}.pbf'), 'wb') as fh:
            fh.write(f_bytes(1, body))
    print(name, made, 'glyphs')


main()
