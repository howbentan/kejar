"""Builds kejar's handwriting font (public/fonts/kejar-hand.ttf) from the owner's drawn alphabet.

a-z, 1-9 and the slashed 0 come from alphabet.webp; k, e, j and a come from the logo itself (public/home and
public/logo-ink.png), so "kejar" always matches it. Run from app/:
    python scripts/hand-font/trace.py scripts/hand-font/alphabet.webp public/fonts/kejar-hand.ttf preview.png public
"""
import sys
import cv2
import numpy as np
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

SRC, OUT, PREVIEW = sys.argv[1], sys.argv[2], sys.argv[3]
UP = 4  # upscale before tracing, for smoother outlines

img = cv2.imread(SRC, cv2.IMREAD_COLOR)
b, g, r = [c.astype(np.int16) for c in cv2.split(img)]
ink = ((r - np.maximum(g, b)) > 45).astype(np.uint8) * 255
ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))

n, labels, stats, cents = cv2.connectedComponentsWithStats(ink, 8)
comps = [dict(i=i, x=stats[i, 0], y=stats[i, 1], w=stats[i, 2], h=stats[i, 3], cy=cents[i][1]) for i in range(1, n) if stats[i, 4] > 25]

# Rows: split on big vertical gaps between component centres.
comps.sort(key=lambda c: c['cy'])
rows, cur = [], [comps[0]]
for c in comps[1:]:
    if c['cy'] - cur[-1]['cy'] > 45:
        rows.append(cur)
        cur = [c]
    else:
        cur.append(c)
rows.append(cur)

# Glyphs: components in a row that overlap in x belong together (the dots on i and j).
def top_cx(c):
    # Where the top of a stroke sits: the j's hook curls under the i, so whole-box overlap can't place dots.
    m = labels[c['y']:c['y'] + max(2, int(c['h'] * 0.35)), c['x']:c['x'] + c['w']] == c['i']
    xs = np.nonzero(m)[1]
    return c['x'] + (xs.mean() if len(xs) else c['w'] / 2)

def glyphs_of(row):
    tall = max(c['h'] for c in row)
    bodies = sorted([c for c in row if c['h'] > tall * 0.3], key=lambda c: c['x'])
    out = [dict(parts=[c], x0=c['x'], x1=c['x'] + c['w'], tcx=top_cx(c)) for c in bodies]
    for d in row:
        if d['h'] > tall * 0.3:
            continue
        dcx = d['x'] + d['w'] / 2
        gl = min(out, key=lambda o: abs(o['tcx'] - dcx))
        gl['parts'].append(d)
        gl['x0'] = min(gl['x0'], d['x'])
        gl['x1'] = max(gl['x1'], d['x'] + d['w'])
    return out

names = [list('abcdefghijk'), list('lmnopqrstuv'), list('wxyz'), list('123456789'), ['0']]
rowglyphs = [glyphs_of(r) for r in rows]
print('rows:', [len(r) for r in rowglyphs])
assert [len(r) for r in rowglyphs] == [len(x) for x in names], 'unexpected layout'

DESC = set('gjpqy')
XH = set('acemnorsuvwxz')
glyphs = {}
for rg, nm in zip(rowglyphs, names):
    for gl, ch in zip(rg, nm):
        ys = [p['y'] for p in gl['parts']]
        ye = [p['y'] + p['h'] for p in gl['parts']]
        gl['top'], gl['bot'] = min(ys), max(ye)
        gl['ids'] = [p['i'] for p in gl['parts']]
        glyphs[ch] = gl
    base = [glyphs[ch]['bot'] for ch in nm if ch not in DESC]
    baseline = float(np.median(base))
    # Every letter sits on the line (the k, r and z were drawn a little high); descenders hang from the row's line.
    for ch in nm:
        glyphs[ch]['baseline'] = baseline if ch in DESC else glyphs[ch]['bot']

xh_px = float(np.median([glyphs[c]['baseline'] - glyphs[c]['top'] for c in XH]))
digit_px = float(np.median([glyphs[c]['baseline'] - glyphs[c]['top'] for c in '123456789']))
print('x-height px', xh_px, 'digit px', digit_px)
UPM = 1000
S = 520 / xh_px  # font units per source pixel: x-height 520
SB = 30  # side bearing

def contours_of(ch):
    gl = glyphs[ch]
    mask = np.isin(labels, gl['ids']).astype(np.uint8) * 255
    x0, y0 = gl['x0'] - 4, gl['top'] - 4
    crop = mask[y0:gl['bot'] + 4, x0:gl['x1'] + 4]
    big = cv2.resize(crop, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), UP * 0.9)
    _, big = cv2.threshold(big, 127, 255, cv2.THRESH_BINARY)
    cs, hier = cv2.findContours(big, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for k, c in enumerate(cs):
        if cv2.contourArea(c) < (UP * 2) ** 2:
            continue
        c = cv2.approxPolyDP(c, UP * 0.35, True)[:, 0, :].astype(float)
        pts = [((px / UP + x0 - gl['x0']) * S, (gl['baseline'] - (py / UP + y0)) * S) for px, py in c]
        hole = hier[0][k][3] != -1
        out.append((pts, hole))
    return out, (gl['x1'] - gl['x0']) * S

def area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2

traced = {ch: contours_of(ch) for ch in glyphs}

# k, e, j, a and r come from the logo itself, so words like "kejar" match it. The logo's letters are separate
# images (the j is the logo with the other four taken out), drawn with a thinner stroke for their size than the
# marker, so they are thickened to the marker's weight.
from PIL import Image as _Image
LOGO = sys.argv[4] if len(sys.argv) > 4 else 'public'
def alpha(f):
    return (np.array(_Image.open(f).convert('RGBA'))[:, :, 3] > 127).astype(np.uint8) * 255
def stroke(mask):
    d = cv2.distanceTransform((mask > 0).astype(np.uint8), cv2.DIST_L2, 5)
    return 2 * float(np.percentile(d[d > 0], 95))
logo_masks = {l: alpha(f'{LOGO}/home/letter-{l}.png') for l in 'kear'}
# The r stays the hand-drawn one (owner's call); the logo's R is only used to cut the j out of the logo.
logo_r = logo_masks['r']
whole = alpha(f'{LOGO}/logo-ink.png')
others = cv2.dilate(np.maximum.reduce(list(logo_masks.values())), np.ones((7, 7), np.uint8))
jm = cv2.morphologyEx(np.where(others > 0, 0, whole).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
logo_masks['j'] = jm
del logo_masks['r']
ys, _ = np.nonzero(logo_masks['e'])
logo_xh, logo_base = float(ys.max() - ys.min()), float(ys.max())
hand_ratio = stroke(ink) / xh_px
grow = int(round((hand_ratio * logo_xh * 0.85 - stroke(whole)) / 2))  # a touch lighter: the logo's round shapes read heavier
print('logo x-height', logo_xh, 'thicken by', grow, 'px')
SL = 520 / logo_xh
asc_units = float(np.median([glyphs[c]['baseline'] - glyphs[c]['top'] for c in 'bdhl'])) * S
for l, m in logo_masks.items():
    if grow > 0:
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
    m = cv2.GaussianBlur(m, (0, 0), 1.5)
    _, m = cv2.threshold(m, 127, 255, cv2.THRESH_BINARY)
    ys, xs = np.nonzero(m)
    x0, bot = xs.min(), ys.max()
    base = logo_base + grow if l == 'j' else bot  # the j hangs from the logo's line; the rest sit on their own
    # In the logo the a and R bounce above the line on purpose; in a sentence they'd poke up mid-word. Each is
    # sized to the hand's own height for it: a, e and r to the x-height, k to the tall letters.
    target = {'a': 520, 'e': 520, 'r': 540, 'k': asc_units}.get(l)
    sl = target / float(bot - ys.min()) if target else SL
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for k, c in enumerate(cs):
        if cv2.contourArea(c) < 40:
            continue
        c = cv2.approxPolyDP(c, 1.2, True)[:, 0, :].astype(float)
        out.append(([((px - x0) * sl, (base - py) * sl) for px, py in c], hier[0][k][3] != -1))
    traced[l] = (out, (xs.max() - x0) * sl)
# Letters whose tail curls left (g, j, q, y) are spaced by their body, not their tail: the tail tucks under the
# letter before, instead of pushing a gap in front ("chan ge").
for ch in 'gjqy':
    cs, w = traced[ch]
    above = [x for pts, _ in cs for x, y in pts if y >= 0]
    bx0, bx1 = min(above), max(above)
    traced[ch] = ([([(x - bx0, y) for x, y in pts], hole) for pts, hole in cs], bx1 - bx0)

digit_adv = max(w for ch, (_, w) in traced.items() if ch in '0123456789') + 2 * SB

def draw(ch):
    cs, w = traced[ch]
    adv = int(round(digit_adv)) if ch.isdigit() else int(round(w + 2 * SB))
    dx = (adv - w) / 2
    pen = TTGlyphPen(None)
    for pts, hole in cs:
        # TrueType: outer contours clockwise (negative area in y-up), holes counter-clockwise.
        if (area(pts) > 0) != hole:
            pts = pts[::-1]
        pen.moveTo((round(pts[0][0] + dx), round(pts[0][1])))
        for p in pts[1:]:
            pen.lineTo((round(p[0] + dx), round(p[1])))
        pen.closePath()
    return pen.glyph(), adv

order = ['.notdef'] + [f'g_{c}' for c in sorted(glyphs)]
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap({ord(c): f'g_{c}' for c in glyphs})
gl, mt = {}, {}
empty = TTGlyphPen(None)
gl['.notdef'] = empty.glyph()
mt['.notdef'] = (500, 0)
for c in glyphs:
    g, adv = draw(c)
    gl[f'g_{c}'] = g
    mt[f'g_{c}'] = (adv, 0)
fb.setupGlyf(gl)
fb.setupHorizontalMetrics({k: (v[0], gl[k].xMin if hasattr(gl[k], 'xMin') and gl[k].numberOfContours else 0) for k, v in mt.items()})
fb.setupHorizontalHeader(ascent=920, descent=-280)
fb.setupNameTable({'familyName': 'Kejar Hand', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=920, sTypoDescender=-280, usWinAscent=920, usWinDescent=280, sxHeight=520)
fb.setupPost()
fb.save(OUT)

# A preview sheet of what was traced, for checking by eye.
sheet = np.full((260, 1400), 255, np.uint8)
xx = 10
for ch in sorted(glyphs):
    m = np.isin(labels, glyphs[ch]['ids']).astype(np.uint8) * 255
    gg = glyphs[ch]
    crop = 255 - m[gg['top']:gg['bot'], gg['x0']:gg['x1']]
    h, w = crop.shape
    s = 0.7
    crop = cv2.resize(crop, (max(1, int(w * s)), max(1, int(h * s))))
    h, w = crop.shape
    y = 120 - int((gg['baseline'] - gg['top']) * s)
    if xx + w > 1390:
        break
    sheet[max(0, y):y + h, xx:xx + w] = np.minimum(sheet[max(0, y):y + h, xx:xx + w], crop[: sheet[max(0, y):y + h].shape[0]])
    cv2.putText(sheet, ch, (xx, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 1)
    xx += w + 12
cv2.line(sheet, (0, 120), (1400, 120), 180, 1)
cv2.imwrite(PREVIEW, sheet)
print('saved', OUT)
