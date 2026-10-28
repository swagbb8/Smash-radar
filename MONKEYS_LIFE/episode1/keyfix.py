"""Clean-up the keyframe model needs on Seven: the edit model copies wet-fur glints off his reference as white specks.
    python keyfix.py <keyframe.jpg> ...     (the raw picture is kept as <name>_raw.jpg)
A speck = a small grey dot much brighter than its neighbourhood on dark fur; it gets the neighbourhood's median back.
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter


def despeckle(path):
    raw = os.path.splitext(path)[0] + '_raw.jpg'
    if not os.path.exists(raw): Image.open(path).save(raw, quality=97)
    im = Image.open(raw).convert('RGB'); a = np.asarray(im).astype(np.float32) / 255
    med = np.asarray(im.filter(ImageFilter.MedianFilter(7))).astype(np.float32) / 255
    mx = a.max(-1); sat = (mx - a.min(-1)) / (mx + 1e-6)
    spk = (mx - med.max(-1) > 0.18) & (sat < 0.4) & (med.max(-1) < 0.45)
    spk = np.asarray(Image.fromarray((spk * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    Image.fromarray((np.where(spk[..., None], med, a) * 255).astype(np.uint8)).save(path, quality=95)
    return int(spk.sum())


if __name__ == '__main__':
    for f in sys.argv[1:]: print(os.path.basename(f), despeckle(f), 'px fixed')
