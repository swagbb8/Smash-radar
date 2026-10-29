"""One review page for a batch of keyframes: each picture with its shot name and the checklist it must pass.
    python review.py <shots folder> B03,D03,B04 [<out.jpg>]
The checklist (keys.json "must") comes from ai_scene.must_have, so it says what the script needs, not what came out.
Verdicts go in <shots folder>/review.json by hand or by Claude after looking: {"B03": {"ok": false, "why": "..."}}.
"""
import json, os, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

W = 640


def tile(folder, name):
    jpg = os.path.join(folder, name + '.jpg'); meta = os.path.join(folder, name + '.keys.json')
    im = Image.open(jpg).convert('RGB') if os.path.exists(jpg) else Image.new('RGB', (W, 360), '#300')
    im = im.resize((W, int(im.height * W / im.width)))
    must = json.load(open(meta)).get('must', []) if os.path.exists(meta) else []
    verdict = json.load(open(os.path.join(folder, 'review.json'))).get(name) if os.path.exists(os.path.join(folder, 'review.json')) else None
    lines = [name + ('' if verdict is None else '  APPROVED' if verdict['ok'] else '  REJECTED: ' + verdict['why'])]
    lines += textwrap.wrap('must show: ' + '; '.join(must), 80)
    font = ImageFont.load_default(size=15)
    out = Image.new('RGB', (W, im.height + 20 * len(lines) + 10), '#111'); out.paste(im, (0, 0))
    d = ImageDraw.Draw(out)
    for i, l in enumerate(lines): d.text((8, im.height + 5 + 20 * i), l, fill='#ffd36b' if i == 0 else '#ddd', font=font)
    return out


def main():
    folder, names = sys.argv[1], sys.argv[2].split(',')
    out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(folder, 'review_' + '_'.join(names[:4]) + '.jpg')
    tiles = [tile(folder, n) for n in names]; cols = 2 if len(tiles) > 1 else 1
    rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    hs = [max(t.height for t in r) for r in rows]
    sheet = Image.new('RGB', (W * cols, sum(hs)), '#000')
    y = 0
    for r, h in zip(rows, hs):
        for c, t in enumerate(r): sheet.paste(t, (c * W, y))
        y += h
    sheet.save(out, quality=88); print(out)


if __name__ == '__main__':
    main()
