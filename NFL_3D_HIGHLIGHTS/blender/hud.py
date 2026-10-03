"""Fictional broadcast graphics, composited onto the rendered frames with Pillow: score bug, down & distance,
play caption, big-moment text (TOUCHDOWN / INTERCEPTION / SACK ...), REPLAY and SLOW-MO indicators, a player
lower-third (name + number), title and end cards, plus a soft vignette. Original design — not any network's."""
import math
from PIL import Image, ImageDraw, ImageFilter
from utils import font, clamp, luminance, hex_rgb

ACCENT = '#c6ff3d'
_vig = {}


def _rgba(h, a=255): r, g, b = (int(c * 255) for c in hex_rgb(h)); return (r, g, b, int(a))
def _back(p): p = clamp(p); return 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2


def _text_img(text, fnt, fill, stroke=0, stroke_fill='#0b0d12', pad=24):
    d = ImageDraw.Draw(Image.new('RGBA', (8, 8))); b = d.textbbox((0, 0), text, font=fnt, stroke_width=stroke)
    im = Image.new('RGBA', (b[2] - b[0] + pad * 2, b[3] - b[1] + pad * 2), (0, 0, 0, 0)); ImageDraw.Draw(im).text((pad - b[0], pad - b[1]), text, font=fnt, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    return im


def _fit(text, name, size, max_w):
    while size > 14:
        f = font(name, size)
        if f.getlength(text) <= max_w: return f
        size -= 2
    return font(name, size)


def _wrap(text, fnt, max_w):
    out, line = [], ''
    for w in str(text).split():
        t = f'{line} {w}'.strip()
        if fnt.getlength(t) > max_w and line: out.append(line); line = w
        else: line = t
    if line: out.append(line)
    return out


def vignette(size):
    if size not in _vig:
        W, H = size; m = Image.new('L', (W // 8, H // 8), 0); d = ImageDraw.Draw(m); d.ellipse([-W // 40, -H // 40, W // 8 + W // 40, H // 8 + H // 40], fill=255)
        m = m.filter(ImageFilter.GaussianBlur(max(W, H) // 55)).resize((W, H)); dark = Image.new('RGBA', (W, H), (0, 0, 0, 105)); dark.putalpha(Image.eval(m, lambda v: int((255 - v) * 0.42))); _vig[size] = dark
    return _vig[size]


def scorebug(im, teams, score, quarter, clock, down=None, flash=None):
    W, H = im.size; u = min(W, H * 1.2) / 720; d = ImageDraw.Draw(im); w = min(W - 40 * u, 640 * u); X = (W - w) / 2; Y = 26 * u; h = 76 * u; cw = w * 0.36
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([X, Y + 6 * u, X + w, Y + h + 6 * u], 18 * u, fill=(0, 0, 0, 120)); im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10 * u)))
    d.rounded_rectangle([X, Y, X + w, Y + h], 18 * u, fill=_rgba('#0d1118'))
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    for i, (t, s) in enumerate(zip(teams, score)):
        tx = X + w - cw if i else X; d.rounded_rectangle([tx + 5 * u, Y + 5 * u, tx + cw - 5 * u, Y + h - 5 * u], 13 * u, fill=_rgba(t['primary']))
        ld.polygon([(tx + cw * 0.55, Y + 5 * u), (tx + cw - 14 * u, Y + 5 * u), (tx + cw * 0.8, Y + h - 5 * u), (tx + cw * 0.35, Y + h - 5 * u)], fill=(255, 255, 255, 30))
        if flash is not None and flash[0] == i: ld.rounded_rectangle([tx + 5 * u, Y + 5 * u, tx + cw - 5 * u, Y + h - 5 * u], 13 * u, fill=(255, 255, 255, int(150 * clamp(flash[1]))))
    im.alpha_composite(lay); d = ImageDraw.Draw(im)
    for i, (t, s) in enumerate(zip(teams, score)):
        tx = X + w - cw if i else X
        col = '#0d1118' if luminance(t['primary']) > 0.62 else '#ffffff'; fa, fs = font('anton', 34 * u), font('anton', 50 * u)
        d.text((tx + cw - 18 * u if i else tx + 18 * u, Y + h / 2 + 1 * u), t['abbr'], font=fa, fill=col, anchor='rm' if i else 'lm'); d.text((tx + 20 * u if i else tx + cw - 20 * u, Y + h / 2 + 1 * u), str(s), font=fs, fill=col, anchor='lm' if i else 'rm')
    d.text((W / 2, Y + h * 0.34), quarter or 'Q1', font=font('bold', 24 * u), fill='#ffffff', anchor='mm'); d.text((W / 2, Y + h * 0.7), clock or '', font=font('bold', 21 * u), fill=ACCENT, anchor='mm')
    if down:
        f = font('bold', 21 * u); tw = f.getlength(down) + 30 * u; d.rounded_rectangle([(W - tw) / 2, Y + h + 8 * u, (W + tw) / 2, Y + h + 40 * u], 16 * u, fill=_rgba('#ffd400')); d.text((W / 2, Y + h + 24 * u), down, font=f, fill='#141000', anchor='mm')


def caption(im, kicker, text, color, k=1.0):
    if not text or k <= 0.02: return
    W, H = im.size; u = min(W, H * 1.2) / 720; pad = 22 * u; w = min(W - 2 * pad, 680 * u); X = (W - w) / 2; f = font('bold', 26 * u); lines = _wrap(text, f, w - 46 * u)[:3]; h = 46 * u + len(lines) * 33 * u; Y = H - h - 30 * u
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay); d.rounded_rectangle([X, Y, X + w, Y + h], 16 * u, fill=(9, 12, 17, 220)); d.rounded_rectangle([X, Y, X + 10 * u, Y + h], 5 * u, fill=_rgba(color))
    d.text((X + 26 * u, Y + 22 * u), ' '.join(kicker.upper()), font=font('bold', 15 * u), fill=ACCENT, anchor='lm')
    for i, l in enumerate(lines): d.text((X + 26 * u, Y + 54 * u + i * 33 * u), l, font=f, fill='#ffffff', anchor='lm')
    if k < 1: lay.putalpha(lay.getchannel('A').point(lambda v: int(v * clamp(k))))
    im.alpha_composite(lay)


def slam(im, text, el, color):
    """Big-moment text that punches in, holds, and fades. el = seconds since the moment."""
    if not text or el < 0 or el > 2.3: return
    W, H = im.size; u = min(W, H * 1.2) / 720; s = 2.1 - 1.1 * _back(clamp(el / 0.32)); a = 1 - (el - 1.9) / 0.4 if el > 1.9 else 1.0
    f = _fit(text, 'anton', 118 * u, W * 0.88); t = _text_img(text, f, '#ffffff', stroke=int(f.size * 0.09), stroke_fill=_rgba(color if luminance(color) < 0.85 else ACCENT), pad=int(f.size * 0.3))
    back = _text_img(text, f, '#0b0d12', stroke=int(f.size * 0.17), stroke_fill='#0b0d12', pad=int(f.size * 0.3)); back.alpha_composite(t); t = back
    t = t.resize((max(1, int(t.width * s)), max(1, int(t.height * s))), Image.BICUBIC).rotate(3.5, expand=True, resample=Image.BICUBIC)
    if a < 1: t.putalpha(t.getchannel('A').point(lambda v: int(v * clamp(a))))
    im.alpha_composite(t, (int(W / 2 - t.width / 2), int(H * (0.3 if W > H else 0.235) - t.height / 2)))


def tag(im, text, color='#ff3d2e', blink=1.0):
    W, H = im.size; u = min(W, H * 1.2) / 720; d = ImageDraw.Draw(im, 'RGBA'); f = font('bold', 21 * u); w = f.getlength(text) + 46 * u; x, y = W - w - 22 * u, 152 * u
    d.rounded_rectangle([x, y, x + w, y + 36 * u], 8 * u, fill=_rgba(color, 235)); d.ellipse([x + 12 * u, y + 12 * u, x + 24 * u, y + 24 * u], fill=(255, 255, 255, int(255 * blink))); d.text((x + 32 * u, y + 18 * u), text, font=f, fill='#ffffff', anchor='lm')


def brand(im, text='SMASH 3D'):
    W, H = im.size; u = min(W, H * 1.2) / 720; ImageDraw.Draw(im, 'RGBA').text((24 * u, 170 * u), text, font=font('anton', 22 * u), fill=(255, 255, 255, 215), anchor='lm', stroke_width=max(1, int(2 * u)), stroke_fill=(0, 0, 0, 120))


def lower_third(im, number, name, team, k=1.0):
    if k <= 0.02: return
    W, H = im.size; u = min(W, H * 1.2) / 720; lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay); h = 84 * u; w = min(W - 44 * u, 560 * u); X = 22 * u - (1 - _back(k)) * 40 * u; Y = H - h - 170 * u
    d.rounded_rectangle([X, Y, X + w, Y + h], 14 * u, fill=(9, 12, 17, 228)); d.rounded_rectangle([X, Y, X + h * 1.15, Y + h], 14 * u, fill=_rgba(team['primary']))
    d.text((X + h * 0.575, Y + h / 2 + 2 * u), str(number), font=font('anton', 54 * u), fill='#0d1118' if luminance(team['primary']) > 0.62 else '#ffffff', anchor='mm')
    d.text((X + h * 1.15 + 18 * u, Y + h * 0.36), (name or f'#{number}').upper(), font=_fit((name or f'#{number}').upper(), 'anton', 36 * u, w - h * 1.15 - 36 * u), fill='#ffffff', anchor='lm')
    d.text((X + h * 1.15 + 18 * u, Y + h * 0.74), team['name'].upper(), font=font('bold', 19 * u), fill=ACCENT, anchor='lm')
    if k < 1: lay.putalpha(lay.getchannel('A').point(lambda v: int(v * clamp(k * 1.5))))
    im.alpha_composite(lay)


def card(size, kicker, title, sub=None, teams=None, score=None, k=1.0, bg=None):
    """Title / end card (full frame). bg = optional frame to dim behind it."""
    W, H = size; u = min(W, H * 1.2) / 720; im = (bg.copy() if bg else Image.new('RGBA', size, (6, 8, 12, 255))).convert('RGBA')
    im.alpha_composite(Image.new('RGBA', size, (5, 8, 13, int(215 * clamp(k)))))
    lay = Image.new('RGBA', size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay); cy = H * 0.42
    if kicker: d.text((W / 2, cy - 112 * u), '  '.join(kicker.upper()), font=font('bold', 22 * u), fill=ACCENT, anchor='mm')
    f = _fit(title, 'anton', 104 * u, W * 0.88); d.text((W / 2, cy), title, font=f, fill='#ffffff', anchor='mm')
    y = cy + f.size * 0.6 + 30 * u
    if sub:
        fs = font('medium', 27 * u)
        for l in _wrap(sub, fs, W * 0.8)[:3]: d.text((W / 2, y), l, font=fs, fill='#c9ced6', anchor='mm'); y += 36 * u
    if teams and score: d.text((W / 2, y + 70 * u), f"{teams[0]['abbr']} {score[0]} – {score[1]} {teams[1]['abbr']}", font=font('anton', 76 * u), fill='#ffffff', anchor='mm')
    if k < 1: lay.putalpha(lay.getchannel('A').point(lambda v: int(v * clamp(k))))
    im.alpha_composite(lay); return im


def compose(frame_path, out_path, g):
    """g: per-frame graphics dict from scene_builder (teams, score, quarter, clock, down, label, desc, color, slam, replay, slow, lower, flash, fade)."""
    im = Image.open(frame_path).convert('RGBA'); im.alpha_composite(vignette(im.size))
    if g.get('white', 0) > 0: im.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, int(150 * clamp(g['white'])))))
    scorebug(im, g['teams'], g['score'], g['quarter'], g['clock'], g.get('down'), g.get('flash')); brand(im)
    if g.get('replay'): tag(im, 'REPLAY', blink=0.35 + 0.65 * (math.sin(g.get('wall', 0) * 7) > 0))
    elif g.get('slow'): tag(im, 'SLOW-MO', color='#2f86ff')
    caption(im, g['label'], g['desc'], g['color'], g.get('cap', 1.0))
    if g.get('slam'): slam(im, g['slam'][0], g['slam'][1], g['color'])
    if g.get('lower'): lower_third(im, *g['lower'])
    if g.get('fade', 0) > 0: im.alpha_composite(Image.new('RGBA', im.size, (4, 6, 10, int(255 * clamp(g['fade'])))))
    im.convert('RGB').save(out_path, quality=93)
