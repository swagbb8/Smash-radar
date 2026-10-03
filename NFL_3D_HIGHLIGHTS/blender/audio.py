"""Sound bed, synthesized with numpy (no samples): stadium crowd that swells on big moments, pads popping on
hits, the thud of a kick, a referee's whistle and a touchdown horn. Written as a WAV that render.py muxes in."""
import wave
import numpy as np

SR = 44100


def _noise(n, seed): return np.random.default_rng(seed).standard_normal(n)


def _band(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, len(x))


def _env(n, a, d): t = np.arange(n) / SR; return np.minimum(t / max(a, 1e-4), 1) * np.exp(-np.maximum(t - a, 0) / d)


def build(path, total, cues):
    """cues: [(wall_time, type, big)] ; total seconds."""
    n = int(total * SR) + SR // 2; out = np.zeros(n); t = np.arange(n) / SR
    crowd = _band(_noise(n, 1), 250, 2600); crowd /= np.abs(crowd).max() + 1e-9; level = np.full(n, 0.10) + 0.02 * np.sin(t * 0.9) + 0.015 * np.sin(t * 2.3 + 1)
    def add(at, sig):
        i = int(max(0, at) * SR); j = min(n, i + len(sig)); out[i:j] += sig[: j - i]
    def swell(at, peak, hold):
        i = int(max(0, at) * SR); m = int((hold + 2.0) * SR); e = np.concatenate([np.linspace(0, 1, int(0.25 * SR)), np.ones(int(hold * SR)), np.linspace(1, 0, int(1.75 * SR))])[:m]; j = min(n, i + len(e)); level[i:j] = np.maximum(level[i:j], 0.10 + (peak - 0.10) * e[: j - i])
    for at, typ, big in cues:
        if typ == 'snap': add(at, 0.18 * _band(_noise(SR // 8, 5), 1500, 6000) * _env(SR // 8, 0.004, 0.03))
        elif typ == 'throw': add(at, 0.12 * _band(_noise(SR // 2, 6), 800, 2400) * _env(SR // 2, 0.05, 0.12))
        elif typ in ('catch', 'recover', 'int'): m = SR // 5; add(at, 0.5 * np.sin(2 * np.pi * 150 * np.arange(m) / SR) * _env(m, 0.003, 0.035) + 0.3 * _band(_noise(m, 7), 200, 1200) * _env(m, 0.002, 0.03)); swell(at, 0.34 if typ == 'int' else 0.22, 1.2 if typ == 'int' else 0.7)
        elif typ in ('tackle', 'sack', 'miss', 'move'):
            g = 0.25 if typ == 'miss' else 0.9 if big else 0.6; m = SR // 3; f = np.linspace(140, 40, m)
            add(at, g * (np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(m, 0.003, 0.07) + 0.7 * _band(_noise(m, 8), 80, 900) * _env(m, 0.002, 0.045)))
            if typ != 'miss': swell(at, 0.3 if big else 0.2, 0.8)
        elif typ in ('kick', 'kickoff'): m = SR // 4; f = np.linspace(200, 55, m); add(at, 0.8 * np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(m, 0.002, 0.05))
        elif typ == 'fumble': swell(at, 0.32, 1.0)
        elif typ == 'whistle':
            m = int(0.55 * SR); tt = np.arange(m) / SR; add(at, 0.09 * (np.sin(2 * np.pi * 2150 * tt) + np.sin(2 * np.pi * 2890 * tt)) * (1 + 0.6 * np.sin(2 * np.pi * 38 * tt)) * np.minimum(tt / 0.03, 1) * np.minimum((0.55 - tt) / 0.08, 1))
        elif typ in ('td', 'two_pt', 'fg_good'):
            swell(at, 0.6, 3.0); m = int(1.3 * SR); tt = np.arange(m) / SR
            add(at + 0.05, 0.10 * sum(np.sign(np.sin(2 * np.pi * f * tt)) * 0.5 + np.sin(2 * np.pi * f * tt) for f in (196, 247, 294, 392)) * np.minimum(tt / 0.02, 1) * np.exp(-tt / 0.6))
        elif typ == 'fg_miss' or typ == 'incomplete': swell(at, 0.2, 0.8)
        elif typ == 'whoosh': m = int(0.5 * SR); add(at, 0.25 * _band(_noise(m, 9), 300, 1800) * np.sin(np.pi * np.arange(m) / m) ** 2)
    out += crowd * level; out = np.tanh(out * 1.4) * 0.85; fade = int(0.4 * SR); out[-fade:] *= np.linspace(1, 0, fade); out[: SR // 10] *= np.linspace(0, 1, SR // 10)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())
    return path
