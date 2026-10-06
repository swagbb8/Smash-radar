"""The soundtrack of the cold open, made from nothing: every sound is built here out of sines and noise (no samples, no
recordings, nothing to license). Cues are placed from the cut list in post.py, so the sound follows the picture if the cut changes.

    python sound.py out.wav            # 48 kHz stereo, the length of the film

Layers: the air of the swamp (insects, frogs, drips, far calls), his body (heart, breath, mud, water), the branch,
the thing in his arm (a low wrong hum that wakes when he touches it), and the hit under the title.
"""
import math, os, sys, wave
import numpy as np
from scipy import signal
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import post

SR = 48000


# ------------------------------------------------------------------------------------------------ building blocks
def _n(sec): return int(round(sec * SR))
def tone(f, sec, phase=0.0):
    t = np.arange(_n(sec)) / SR; return np.sin(2 * np.pi * f * t + phase)
def sweep(f0, f1, sec, kind='exp'):
    t = np.arange(_n(sec)) / SR; u = t / max(sec, 1e-6); f = f0 * (f1 / f0) ** u if kind == 'exp' else f0 + (f1 - f0) * u; return np.sin(2 * np.pi * np.cumsum(f) / SR)
def noise(sec, rng): return rng.normal(0, 1, _n(sec))
def band(x, lo=None, hi=None, order=2):
    if lo and hi: sos = signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos')
    elif lo: sos = signal.butter(order, lo, 'highpass', fs=SR, output='sos')
    else: sos = signal.butter(order, hi, 'lowpass', fs=SR, output='sos')
    return signal.sosfilt(sos, x)
def env(n, attack, decay, hold=0.0, curve=4.0):
    """Rises in `attack` seconds, holds, dies away over `decay` (exponentially)."""
    t = np.arange(n) / SR; a = np.clip(t / max(attack, 1e-4), 0, 1); d = np.exp(-np.clip(t - attack - hold, 0, None) * curve / max(decay, 1e-4)); return a * d
def swell(n, up, down):
    t = np.arange(n) / SR; T = n / SR; return np.clip(t / up, 0, 1) ** 1.5 * np.clip((T - t) / down, 0, 1) ** 1.5
def sweep_filter(x, f0, f1, q=2.0, kind='bandpass'):
    """A filter whose centre moves from f0 to f1 over the sound (done in short blocks)."""
    out = np.zeros_like(x); n = len(x); B = 512; zi = None
    for i in range(0, n, B):
        u = i / max(1, n - 1); f = f0 * (f1 / f0) ** u; w = min(f, SR * 0.45)
        sos = signal.butter(2, [w / (1 + 0.5 / q), min(w * (1 + 0.5 / q), SR * 0.49)], 'bandpass', fs=SR, output='sos') if kind == 'bandpass' else signal.butter(2, w, 'lowpass', fs=SR, output='sos')
        if zi is None or zi.shape != (sos.shape[0], 2): zi = np.zeros((sos.shape[0], 2))
        out[i:i + B], zi = signal.sosfilt(sos, x[i:i + B], zi=zi)
    return out


class Mix:
    def __init__(self, sec): self.n = _n(sec); self.dry = np.zeros((self.n, 2)); self.wet = np.zeros((self.n, 2)); self.sec = sec

    def add(self, x, t, gain=1.0, pan=0.0, wet=0.0):
        """Lay a mono sound in at time t. pan -1 left .. 1 right; wet = how much of it goes to the reverb (the far wood)."""
        i = _n(t)
        if i >= self.n or i + len(x) <= 0: return
        if i < 0: x = x[-i:]; i = 0
        x = x[:self.n - i] * gain; l, r = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
        self.dry[i:i + len(x), 0] += x * l * (1 - wet * 0.6); self.dry[i:i + len(x), 1] += x * r * (1 - wet * 0.6)
        if wet > 0: self.wet[i:i + len(x), 0] += x * l * wet; self.wet[i:i + len(x), 1] += x * r * wet

    def out(self, rng):
        ir = np.stack([band(rng.normal(0, 1, _n(2.6)), 180, 5200) for _ in range(2)], 1) * np.exp(-np.arange(_n(2.6)) / SR * 3.2)[:, None]; ir[:_n(0.012)] = 0; ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
        rev = np.stack([signal.fftconvolve(self.wet[:, c], ir[:, c])[:self.n] for c in range(2)], 1)
        return self.dry + rev * 0.9


# ------------------------------------------------------------------------------------------------ the sounds
def heart(rng, strength=1.0, low=55.0):
    thud = lambda f, sec: tone(f, sec) + 0.55 * tone(2 * f, sec, 0.3) + 0.35 * tone(3 * f, sec, 0.7) + 0.2 * tone(4.1 * f, sec, 1.1)              # the upper parts are what a phone's speaker can carry
    a = thud(low, 0.16) * env(_n(0.16), 0.008, 0.12, curve=5); b = thud(low * 1.28, 0.13) * env(_n(0.13), 0.006, 0.09, curve=5) * 0.7
    x = np.zeros(_n(0.45)); x[:len(a)] += a; i = _n(0.24); x[i:i + len(b)] += b; x += band(noise(0.45, rng), None, 120) * 0.05 * env(len(x), 0.01, 0.3)
    return x * strength


def breath(rng, sec=1.5, inhale=0.45, rough=0.0):
    """In (thinner, higher) then out (fuller, lower). rough > 0 adds the rattle of effort."""
    n = _n(sec); ni = int(n * inhale); x = np.zeros(n); a = sweep_filter(noise(ni / SR, rng), 900, 1700, q=1.2) * swell(ni, ni / SR * 0.6, ni / SR * 0.35); b = sweep_filter(noise((n - ni) / SR, rng), 1100, 520, q=1.0) * swell(n - ni, 0.08, (n - ni) / SR * 0.8)
    x[:ni] = a * 0.7; x[ni:] = b
    if rough: t = np.arange(n) / SR; x *= 1 + rough * signal.sawtooth(2 * np.pi * (38 + 6 * np.sin(t * 9)) * t) * (t > ni / SR)
    return band(x, 250, 5000)


def gasp(rng, sec=0.55):
    n = _n(sec); return sweep_filter(noise(sec, rng), 700, 2400, q=1.3) * env(n, 0.05, 0.4, hold=0.1, curve=3)


def squelch(rng, sec=0.5, depth=1.0):
    """Mud letting go of something: a wet suck, a couple of pops, a low pull under it."""
    n = _n(sec); x = sweep_filter(noise(sec, rng), 380, 1500 * depth + 300, q=3.0) * swell(n, sec * 0.5, sec * 0.25); x = sweep_filter(x, 2400, 600, q=1.0, kind='lowpass')
    for _ in range(int(rng.integers(3, 7))):
        i = int(rng.uniform(0.1, 0.9) * n); m = _n(rng.uniform(0.012, 0.03)); p = sweep(rng.uniform(260, 520), rng.uniform(700, 1400), m / SR) * env(m, 0.002, m / SR, curve=5); x[i:i + m] += p[:n - i] * rng.uniform(0.5, 1.2)
    return x + tone(72, sec) * swell(n, sec * 0.3, sec * 0.5) * 0.5


def slosh(rng, sec=0.8):
    n = _n(sec); x = sweep_filter(noise(sec, rng), 500, 2600, q=0.8) * swell(n, sec * 0.25, sec * 0.6); t = np.arange(n) / SR
    return sweep_filter(x * (1 + 0.5 * np.sin(2 * np.pi * 7 * t + rng.uniform(0, 6))), 4200, 1200, kind='lowpass') + band(noise(sec, rng), 60, 240) * swell(n, 0.1, sec * 0.7) * 0.6


def drip(rng, f=None):
    f = f or rng.uniform(900, 2300); m = _n(rng.uniform(0.03, 0.06)); return sweep(f, f * rng.uniform(1.25, 1.7), m / SR) * env(m, 0.002, m / SR, curve=5)


def splash(rng, size=1.0):
    """Something heavy going into water: the slap, the collapse of the hole, the spray coming back down."""
    sec = 2.2 * size ** 0.5; n = _n(sec); x = sweep_filter(noise(sec, rng), 9000, 700, kind='lowpass') * env(n, 0.004, 0.55 * size, curve=4.5); x += band(noise(sec, rng), 1500, 9000) * env(n, 0.03, 0.9 * size, curve=4) * 0.35
    x += tone(58, sec) * env(n, 0.004, 0.30, curve=5) * 1.6
    th = sweep(150, 46, 0.4) * env(_n(0.4), 0.003, 0.32, curve=5) * 1.2; x[:len(th)] += th
    for _ in range(int(60 * size)):
        i = int(rng.uniform(0.25, 1.0) ** 0.7 * n * 0.95); d = drip(rng, rng.uniform(1500, 4200)) * rng.uniform(0.05, 0.25); x[i:i + len(d)] += d[:n - i]
    return x


def bubbles(rng, sec=2.0, rate=14):
    n = _n(sec); x = np.zeros(n)
    for _ in range(int(sec * rate)):
        i = int(rng.uniform(0, 0.97) * n); f = rng.uniform(260, 900); m = _n(rng.uniform(0.04, 0.09)); b = sweep(f, f * rng.uniform(1.3, 2.0), m / SR) * env(m, 0.004, m / SR, curve=4) * rng.uniform(0.3, 1.0); x[i:i + m] += b[:n - i]
    return band(x, None, 1400)


def creak(rng, sec=0.5, pitch=1.0):
    """Wood under load: stick-slip pulses through the hollow of the branch."""
    n = _n(sec); t = np.arange(n) / SR; rate = (16 + 26 * (t / sec) ** 0.7 + 5 * np.sin(t * 31)) * pitch; ph = np.cumsum(rate) / SR; pulses = (np.diff(np.floor(ph), prepend=0) > 0).astype(float)
    x = signal.lfilter([1], [1, -0.6], pulses * rng.uniform(0.6, 1.0, n)); x = band(x, 240 * pitch, 380 * pitch, 1) * 1.0 + band(x, 700 * pitch, 900 * pitch, 1) * 0.7 + band(x, 1700, 2300, 1) * 0.35
    return x * swell(n, sec * 0.15, sec * 0.5)


def whoosh(rng, sec=0.35): return sweep_filter(noise(sec, rng), 300, 2600, q=0.9) * swell(_n(sec), sec * 0.6, sec * 0.4)
def slap(rng): m = _n(0.09); return band(noise(0.09, rng), 300, 3200) * env(m, 0.001, 0.06, curve=5) + tone(110, 0.09) * env(m, 0.001, 0.07, curve=5)
def scrape(rng, sec=0.3): n = _n(sec); t = np.arange(n) / SR; return band(noise(sec, rng), 1200, 6000) * swell(n, 0.02, sec * 0.7) * (0.6 + 0.4 * signal.square(2 * np.pi * 55 * t))


def cricket(rng, f=4700.0, pulses=3):
    m = _n(0.012); gap = _n(0.011); x = np.zeros((m + gap) * pulses)
    for k in range(pulses): x[k * (m + gap):k * (m + gap) + m] = tone(f, m / SR) * np.hanning(m)
    return x


def frog(rng, f=None):
    f = f or rng.uniform(420, 820); sec = rng.uniform(0.16, 0.30); n = _n(sec); t = np.arange(n) / SR; x = (tone(f, sec) + 0.5 * tone(f * 2.02, sec) + 0.25 * tone(f * 3.1, sec)) * (0.5 + 0.5 * signal.square(2 * np.pi * rng.uniform(24, 38) * t, 0.4)) * swell(n, 0.02, sec * 0.5)
    y = np.zeros(n * 2 + _n(0.07)); y[:n] = x; y[n + _n(0.07):] = x * 0.8; return band(y, 250, 2600)


def bird(rng):
    out = np.zeros(_n(1.4)); f = rng.uniform(1500, 2100)
    for k in range(int(rng.integers(2, 4))):
        sec = rng.uniform(0.18, 0.32); n = _n(sec); t = np.arange(n) / SR; x = np.sin(2 * np.pi * np.cumsum(f * (1 - 0.22 * t / sec) * (1 + 0.012 * np.sin(2 * np.pi * 24 * t))) / SR) * swell(n, 0.03, sec * 0.5); i = _n(k * 0.36); out[i:i + n] += x; f *= 0.84
    return out


def moan(rng, sec=3.2):
    n = _n(sec); t = np.arange(n) / SR; f = 64 * (0.80) ** (t / sec); x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) + 0.18 * np.sin(2 * np.pi * np.cumsum(f * 3.02) / SR)
    return x * (1 + 0.25 * np.sin(2 * np.pi * 4.6 * t)) * swell(n, sec * 0.35, sec * 0.5)


def hum(sec, level, rng):
    """The thing in his arm. level = an array (or number) 0..1 over time: asleep it is barely a pressure in the ears; awake it sings."""
    n = _n(sec); t = np.arange(n) / SR; lv = np.broadcast_to(np.asarray(level, float), (n,)) if np.ndim(level) else np.full(n, float(level))
    x = np.sin(2 * np.pi * 49.0 * t) + 0.9 * np.sin(2 * np.pi * 51.6 * t + 1.0) + 0.35 * np.sin(2 * np.pi * 98.9 * t) + 0.22 * np.sin(2 * np.pi * 148.7 * t + 0.4) * lv
    x = x + sum(np.sin(2 * np.pi * 49.0 * k * (1 + 0.004 * (k % 3)) * t + k) / k for k in range(4, 13)) * 0.9 * (0.3 + 0.7 * lv)                           # the buzz on top: mains hum has teeth
    hi = (np.sin(2 * np.pi * 2931 * t + 3 * np.sin(2 * np.pi * 0.7 * t)) * 0.035 + np.sin(2 * np.pi * 4402 * t) * 0.012) * lv ** 2
    chat = np.zeros(n)
    for _ in range(int(sec * 5)):
        i = int(rng.uniform(0, 0.98) * n); m = _n(rng.uniform(0.004, 0.02)); chat[i:i + m] += signal.square(2 * np.pi * rng.uniform(3000, 7000) * np.arange(min(m, n - i)) / SR) * 0.02
    return (x * 0.5 + hi + band(chat, 2500, 9000) * lv) * lv


def flicker(rng):
    x = np.zeros(_n(0.4))
    for k, i in enumerate((0.0, 0.11, 0.2, 0.26)): m = _n(0.035); b = signal.square(2 * np.pi * (97 + 40 * k) * np.arange(m) / SR) * np.hanning(m); x[_n(i):_n(i) + m] += b
    return band(x, 80, 5200) + band(noise(0.4, rng), 3000, 9000) * (np.abs(x) > 0.2) * 0.3


def wake(rng):
    """He touches it: a click, a tone climbing out of nowhere, the bottom dropping away, and a cold chord that stays."""
    sec = 9.5; n = _n(sec); x = np.zeros(n); t = np.arange(n) / SR; c = band(noise(0.02, rng), 1500, 9000) * env(_n(0.02), 0.0005, 0.015, curve=5); x[:len(c)] += c * 0.8
    up = sweep(170, 1320, 0.6); up = (up + 0.4 * sweep(340, 2640, 0.6) + 0.2 * sweep(510, 3960, 0.6)) * swell(_n(0.6), 0.45, 0.12); x[_n(0.03):_n(0.03) + len(up)] += up * 0.5
    x += np.sin(2 * np.pi * 38 * t) * env(n, 0.5, 3.0, hold=0.4, curve=3) * 0.9
    for f, a, ph in ((659.3, 1.0, 0.0), (987.8, 0.8, 1.0), (1318.5, 0.7, 2.0), (1568.0, 0.45, 0.5), (1975.5, 0.35, 1.5), (2637.0, 0.22, 2.5)):
        x += np.sin(2 * np.pi * f * (1 + 0.0016 * np.sin(2 * np.pi * 0.31 * t + ph)) * t + ph) * a * 0.12 * (0.65 + 0.35 * np.sin(2 * np.pi * (0.55 + 0.13 * ph) * t + ph)) * np.clip((t - 0.45) / 1.3, 0, 1)
    return x


def boom(rng):
    """Under the title: the floor goes, and a dark chord hangs in the room."""
    sec = 6.0; n = _n(sec); t = np.arange(n) / SR; f = 30 + 34 * np.exp(-t * 2.6); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.004, 3.2, curve=3.5) * 1.5
    x += band(noise(sec, rng), None, 170) * env(n, 0.003, 0.5, curve=4) * 1.3 + band(noise(sec, rng), 900, 6000) * env(n, 0.001, 0.09, curve=5) * 0.5 + band(noise(sec, rng), 180, 1300) * env(n, 0.002, 0.7, curve=4) * 0.8
    for f0, a in ((311.0, 0.10), (466.2, 0.07), (739.9, 0.04)): x += np.sin(2 * np.pi * f0 * t) * a * env(n, 0.002, 2.6, curve=3)                              # a struck, slightly sour ring
    for f0, a in ((73.42, 1.0), (110.0, 0.8), (146.83, 0.6), (174.61, 0.5), (220.0, 0.25)):
        x += band(signal.sawtooth(2 * np.pi * f0 * (1 + 0.002 * np.sin(2 * np.pi * 0.4 * t + f0)) * t), None, 620) * a * 0.16 * env(n, 0.06, 4.6, hold=0.6, curve=3)
    return x


# ------------------------------------------------------------------------------------------------ the track
def build(out):
    rng = np.random.default_rng(7); tl, total = post.timeline(); at = {}
    for name, a, b, T in tl: at.setdefault(name, []).append((T, a, b))
    def cue(shot, t, k=0):                                                                          # a moment of a shot -> film time
        if shot == 's03_rise': t += 1.5                                                             # that shot opens with a beat of lying still; its cues are on the action's clock
        if shot not in at: shot, t = 's03_rise', 0.2 + 0.25 * t                                     # a shot that is out of the cut: its sounds fall in the lying-still beat
        T, a, b = at[shot][k]; return T + (t - a)
    M = Mix(total + 0.5); air = Mix(total + 0.5); n = M.n; t = np.arange(n) / SR
    wake_t, look_t, up_t, arm_t, fall_t, under_t, pull_t = cue('s01_wake', 0), cue('s04_look', 0), cue('s06_up', 0), cue('s08_arm', 0), cue('s09_fall', 0), cue('s10_under', 0), cue('s12_pull', 0)
    study_t, dev_t, wide_t, title_t = cue('s13_study', 0), cue('s14_device', 0.3), cue('s15_wide', 0), cue('title', 0); cut_t = wide_t + 5.0; touch_t = cue('s14_device', 5.6 - 4.4)

    # ---- the air of the swamp (its own bus, so it can be closed down when his ears are full of something else)
    bed = band(rng.normal(0, 1, n), 120, 900) * 0.010 + band(rng.normal(0, 1, n), 5500, 9500) * 0.0035 * (0.6 + 0.4 * np.sin(2 * np.pi * 41 * t)) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.07 * t))
    air.dry[:, 0] += bed; air.dry[:, 1] += np.roll(bed, 977)
    for voice in range(5):                                                                        # crickets, each with its own pitch, place and patience
        f = rng.uniform(4100, 5600); pan = rng.uniform(-0.9, 0.9); g = rng.uniform(0.004, 0.011); tt = rng.uniform(0, 2)
        while tt < total: air.add(cricket(rng, f * rng.uniform(0.995, 1.005)), tt, g, pan, wet=0.25); tt += rng.uniform(0.38, 0.62) if rng.random() > 0.08 else rng.uniform(1.5, 4.0)
    tt = 3.0
    while tt < total: air.add(frog(rng), tt, rng.uniform(0.012, 0.03), rng.uniform(-1, 1), wet=0.6); tt += rng.uniform(1.2, 4.5)
    tt = 2.0
    while tt < total: air.add(drip(rng), tt, rng.uniform(0.02, 0.06), rng.uniform(-0.8, 0.8), wet=0.5); tt += rng.uniform(0.5, 2.6)
    for tb in (look_t + 1.9, up_t + 0.8, wide_t + 1.2): air.add(bird(rng), tb, 0.022, rng.uniform(-0.7, 0.7), wet=0.8)
    for tm, g in ((look_t + 5.1, 0.10), (wide_t + 2.6, 0.07)): air.add(moan(rng), tm, g, rng.uniform(-0.4, 0.4), wet=0.9)
    lv = lambda pts: np.interp(t, [p[0] for p in pts], [p[1] for p in pts])
    air_gain = lv([(0, 0.0), (wake_t + 0.7, 0.0), (wake_t + 4.3, 0.8), (look_t, 1.0), (arm_t + 0.4, 1.0), (arm_t + 1.5, 0.22), (fall_t, 0.3), (under_t, 0.0), (pull_t, 0.0), (pull_t + 0.4, 0.9), (study_t + 1.5, 0.55), (dev_t, 0.25), (wide_t, 0.6), (cut_t - 0.01, 0.9), (cut_t, 0.0), (total + 1, 0.0)])
    a = air.out(rng) * air_gain[:, None]
    dull = lv([(0, 1.0), (wake_t + 1.0, 1.0), (wake_t + 4.5, 0.0), (total + 1, 0.0)])               # coming round: the world arrives muffled, then clears
    a = a * (1 - dull[:, None]) + np.stack([band(a[:, c], None, 420) for c in range(2)], 1) * dull[:, None] * 1.6
    M.dry += a

    # ---- low bed under everything: a held breath of a note
    drone = (np.sin(2 * np.pi * 55 * t) * 0.5 + np.sin(2 * np.pi * 82.6 * t + 1) * 0.3 + np.sin(2 * np.pi * 110.4 * t + 2) * 0.12) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.11 * t))
    M.dry += (drone * lv([(0, 0.0), (1.2, 0.035), (look_t, 0.03), (arm_t, 0.02), (under_t, 0.06), (pull_t, 0.02), (cut_t - 0.01, 0.03), (cut_t, 0.0), (total + 1, 0.0)]))[:, None]

    # ---- heart
    beats = [(0.5, 50, 0.20), (wake_t + 4.0, 56, 0.17), (look_t - 9.0, 64, 0.06), (look_t, 66, 0.07), (up_t, 62, 0.05), (arm_t + 0.3, 70, 0.07), (arm_t + 1.3, 112, 0.22), (fall_t, 126, 0.26), (under_t, 84, 0.34), (pull_t, 118, 0.12), (study_t, 92, 0.08), (dev_t, 80, 0.10), (touch_t, 76, 0.16), (cut_t, 76, 0.0)]
    tt = beats[0][0]; r = np.random.default_rng(3)
    while tt < cut_t:
        bpm = np.interp(tt, [b[0] for b in beats], [b[1] for b in beats]); g = np.interp(tt, [b[0] for b in beats], [b[2] for b in beats]); M.add(heart(r), tt, g * 1.6); tt += 60.0 / bpm

    # ---- his breath, and what his body does to the mud and the water
    for tb, sec, g, rough in ((wake_t + 1.9, 1.9, 0.05, 0), (wake_t + 4.4, 1.7, 0.06, 0), (cue('s02_eyes', 0.6), 1.8, 0.07, 0), (cue('s02_eyes', 2.9), 1.5, 0.08, 0), (cue('s03_rise', 0.9), 1.3, 0.09, 0.3), (cue('s03_rise', 2.5), 1.2, 0.11, 0.5),
                              (cue('s03_rise', 4.4), 1.2, 0.10, 0.4), (cue('s03_rise', 6.3), 1.4, 0.09, 0.2), (cue('s03_rise', 7.9), 1.6, 0.07, 0), (cue('s05_stand', 0.6), 1.3, 0.09, 0.3), (cue('s05_stand', 2.4), 1.5, 0.07, 0), (cue('s05_stand', 4.2), 1.6, 0.06, 0),
                              (cue('s07_jump', 1.5), 0.9, 0.09, 0.3), (cue('s08_arm', 0.0), 0.9, 0.09, 0.3), (pull_t + 0.95, 0.9, 0.12, 0.5), (pull_t + 1.9, 0.9, 0.13, 0.6), (pull_t + 2.8, 0.9, 0.12, 0.5),
                              (study_t + 0.2, 1.1, 0.10, 0.3), (study_t + 1.5, 1.3, 0.08, 0.1), (study_t + 3.1, 1.6, 0.06, 0), (cue('s13_study', 7.6, 1), 1.8, 0.05, 0)):
        M.add(breath(rng, sec, rough=rough), tb, g * 1.0, 0.0, wet=0.12)
    for tg, g in ((cue('s08_arm', 1.25), 0.10), (cue('s09_fall', 0.2), 0.12), (pull_t + 0.42, 0.20), (touch_t + 0.12, 0.12)): M.add(gasp(rng), tg, g, 0.0, wet=0.15)
    for ts, sec, g, d in ((cue('s02_eyes', 4.3), 0.4, 0.07, 0.6), (cue('s03_rise', 1.3), 0.6, 0.12, 0.8), (cue('s03_rise', 2.6), 0.5, 0.14, 1.0), (cue('s03_rise', 4.6), 0.6, 0.13, 0.9), (cue('s03_rise', 6.5), 0.5, 0.10, 0.7), (cue('s05_stand', 2.0), 0.7, 0.14, 1.0), (cue('s07_jump', 0.98), 0.35, 0.14, 1.2)):
        M.add(squelch(rng, sec, d), ts, g, rng.uniform(-0.2, 0.2), wet=0.15)
    for ts, g in ((cue('s05_stand', 0.5), 0.10), (cue('s05_stand', 1.2), 0.09), (cue('s07_jump', 0.55), 0.10), (pull_t + 1.4, 0.06), (pull_t + 2.5, 0.05)): M.add(slosh(rng), ts, g, rng.uniform(-0.2, 0.2), wet=0.2)

    # ---- the branch
    c0 = cue('s07_jump', 1.24); M.add(whoosh(rng), c0 - 0.22, 0.08); M.add(slap(rng), c0, 0.32, 0.1, wet=0.25); M.add(creak(rng, 0.55), c0 + 0.02, 0.10, 0.1, wet=0.3); M.add(creak(rng, 0.4, 0.9), c0 + 0.75, 0.06, 0.1, wet=0.3)
    M.add(creak(rng, 0.5, 1.1), cue('s08_arm', 3.3), 0.06, -0.1, wet=0.3); M.add(scrape(rng, 0.5), cue('s08_arm', 3.75), 0.05); M.add(scrape(rng, 0.22), cue('s09_fall', 0.16), 0.10)
    hit = cue('s09_fall', 0.59); M.add(splash(rng, 1.25), hit, 0.55, 0.0, wet=0.3)
    up = pull_t + 0.38; M.add(splash(rng, 0.7), up, 0.36, 0.0, wet=0.3); M.add(slap(rng), pull_t + 0.72, 0.30, 0.0, wet=0.25); M.add(creak(rng, 0.6), pull_t + 0.74, 0.11, 0.0, wet=0.3); M.add(creak(rng, 0.9, 0.85), pull_t + 1.6, 0.09, 0.0, wet=0.3)
    tt = pull_t + 0.8
    while tt < study_t + 4.0: M.add(drip(rng), tt, 0.07 * max(0.15, 1 - (tt - pull_t) / 7.5), rng.uniform(-0.4, 0.4), wet=0.3); tt += rng.uniform(0.06, 0.28) * (1 + (tt - pull_t) * 0.5)

    # ---- under water: everything he hears is his own head
    M.add(band(noise(2.6, rng), None, 210) * swell(_n(2.6), 0.15, 0.3), under_t, 0.16); M.add(bubbles(rng, 2.3), under_t + 0.05, 0.16, 0.0)

    # ---- the thing in his arm
    M.add(flicker(rng), arm_t + 0.40, 0.11)
    level = lv([(0, 0.0), (arm_t + 0.4, 0.0), (arm_t + 0.75, 0.25), (arm_t + 1.6, 0.6), (fall_t + 0.5, 0.65), (under_t, 0.9), (pull_t, 0.9), (pull_t + 0.4, 0.28), (study_t, 0.22), (study_t + 1.6, 0.38), (dev_t, 0.5), (touch_t - 0.02, 0.55), (touch_t + 0.1, 1.0), (cut_t - 0.01, 0.9), (cut_t, 0.0), (total + 1, 0.0)])
    puls = 0.78 + 0.22 * np.sin(2 * np.pi * 0.62 * t); h = hum(M.sec, level * puls, rng); M.dry += (h * 0.085)[:, None]
    w = wake(rng); w = w[:max(0, _n(cut_t - touch_t))]; M.add(w, touch_t, 0.30, 0.0, wet=0.45)

    # ---- title
    M.add(boom(rng), title_t, 0.62, 0.0, wet=0.35)

    x = M.out(rng); gate = lv([(0, 1.0), (cut_t - 0.004, 1.0), (cut_t, 0.0), (title_t - 0.002, 0.0), (title_t, 1.0), (total - 1.0, 1.0), (total, 0.0), (total + 1, 0.0)]); x = x * gate[:, None]      # the smash cut is silence; the title lands in it
    x = x[:_n(total)]; x = np.stack([band(x[:, c], 24, None) for c in range(2)], 1)
    # ride the level: quiet passages come up (it will be heard on a phone), loud ones are left alone, silence stays silent
    w = _n(0.5); e = np.sqrt(signal.fftconvolve((x ** 2).mean(1), np.ones(w) / w, 'same') + 1e-12); e = np.maximum(e, signal.fftconvolve(e, np.ones(_n(2.0)) / _n(2.0), 'same')); ref = 0.055
    g = np.clip((ref / np.maximum(e, 1e-5)) ** 0.62, 0.7, 7.0) * np.clip(e / 4e-4, 0, 1); x = x * g[:, None] * gate[:len(x), None]
    peak = np.abs(x).max(); x = np.tanh(x / peak * 2.0) / np.tanh(2.0) * 0.89                                                                              # gentle saturation, then headroom
    rms = np.sqrt((x ** 2).mean()); print(f'sound: {total:.1f}s, peak {20 * math.log10(np.abs(x).max()):.1f} dBFS, rms {20 * math.log10(rms):.1f} dBFS')
    with wave.open(out, 'wb') as f: f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    return x


if __name__ == '__main__': build(sys.argv[1])
