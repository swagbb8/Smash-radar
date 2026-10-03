"""Shared helpers: units, math, colors, paths, fonts. No Blender dependency so the simulator and parser also run in plain Python."""
import math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
RENDERS = os.path.join(ROOT, 'renders')
YD = 0.9144                 # metres per yard — the simulator thinks in yards, Blender in metres
G = 10.72                   # gravity in yards / s^2
FIELD_LEN, FIELD_WID, ENDZONE = 120.0, 53.333, 10.0     # yards, including both end zones


def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def lerp(a, b, k): return a + (b - a) * k
def smooth(k): k = clamp(k); return k * k * (3 - 2 * k)
def hyp(x, y): return math.hypot(x, y)
def ang_diff(a, b): return ((b - a + math.pi * 3) % (math.pi * 2)) - math.pi


def hex_rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def srgb_to_linear(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hex_linear(h, a=1.0): return tuple(srgb_to_linear(c) for c in hex_rgb(h)) + (a,)
def luminance(h): r, g, b = hex_rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b


COLOR_NAMES = {'red': '#c8102e', 'blue': '#0b3d91', 'navy': '#0b162a', 'white': '#f4f4f4', 'silver': '#a5acaf', 'black': '#101214', 'gold': '#ffb612', 'yellow': '#ffd21f',
               'green': '#0f6b3a', 'orange': '#e64100', 'purple': '#4f2683', 'teal': '#0b6e7a', 'maroon': '#7a1232', 'gray': '#6b7480', 'grey': '#6b7480', 'sky': '#4b92db', 'brown': '#4b2e19', 'pink': '#e75480'}


def color(v, default='#888888'):
    """Accept '#rrggbb' or a colour name like 'red'."""
    if not v: return default
    v = str(v).strip().lower()
    if v.startswith('#') and len(v) == 7: return v
    return COLOR_NAMES.get(v, default)


def font(name='anton', size=64):
    from PIL import ImageFont
    f = {'anton': 'anton.woff2', 'bold': 'oswald-700.woff2', 'medium': 'oswald-500.woff2'}[name]
    return ImageFont.truetype(os.path.join(ASSETS, 'fonts', f), int(size))


def log(*a): print('[3DFH]', *a, flush=True)
