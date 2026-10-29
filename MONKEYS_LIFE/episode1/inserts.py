"""Screen inserts made in the edit, not by the AI (the keyframe model needs a reference picture, and drawn UI text comes out
garbled). B07: "The screen, close: SUBJECT 7, the trace climbing."
    python inserts.py B07 <out.mp4>
"""
import math, random, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1280, 720, 24          # finish.py crops to 2.39: keep content within y 95..625
MONO = 'C:/Windows/Fonts/consola.ttf'
BG, GRID, LINE, TXT, DIM = (6, 14, 22), (18, 42, 58), (90, 220, 255), (170, 230, 245), (70, 120, 140)


def b07(t, dur):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    big, mid, small = (ImageFont.truetype(MONO, s) for s in (64, 30, 22))
    d.text((70, 110), 'SUBJECT 7', font=big, fill=TXT)
    d.text((72, 185), 'SESSION 412  ·  RECALL', font=small, fill=DIM)
    x0, y0, x1, y1 = 70, 250, W - 70, H - 110                      # the graph
    for i in range(11): d.line([(x0 + i * (x1 - x0) / 10, y0), (x0 + i * (x1 - x0) / 10, y1)], fill=GRID)
    for i in range(6): d.line([(x0, y0 + i * (y1 - y0) / 5), (x1, y0 + i * (y1 - y0) / 5)], fill=GRID)
    rnd = random.Random(7); n = 240; shown = int(n * min(1, 0.55 + 0.45 * t / dur))
    pts = []
    for i in range(shown):                                           # flat, then climbing
        u = i / n; v = 0.12 + 0.75 * max(0, u - 0.45) ** 1.6 / 0.55 ** 1.6 + 0.02 * math.sin(i * 0.9) + rnd.uniform(-0.01, 0.01)
        pts.append((x0 + u * (x1 - x0), y1 - v * (y1 - y0)))
    if len(pts) > 1: d.line(pts, fill=LINE, width=4)
    x, y = pts[-1]; d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=LINE)
    val = 4 + 13 * max(0, shown / n - 0.45) / 0.55
    d.text((W - 360, 115), f'RECALL  +{val:4.1f}%', font=mid, fill=LINE)
    d.text((W - 360, 160), 'IMPLANT  STABLE', font=small, fill=DIM)
    glow = im.filter(ImageFilter.GaussianBlur(6)); im = Image.blend(im, glow, 0.35)
    d = ImageDraw.Draw(im)
    for yy in range(0, H, 3): d.line([(0, yy), (W, yy)], fill=(0, 0, 0))   # screen lines, seen up close
    return im


def main():
    name, out = sys.argv[1:3]; dur = 3.0
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                          '-i', '-', '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(int(dur * FPS)): p.stdin.write({'B07': b07}[name](f / FPS, dur).tobytes())
    p.stdin.close(); p.wait()


if __name__ == '__main__':
    main()
