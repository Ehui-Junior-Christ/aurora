"""AURORA promo soundtrack, synthesised from scratch (no samples, no rights).
120 BPM, A minor (Am - F - C - G), 46 s. Writes a 44.1 kHz stereo WAV.
Structure (bars of 2 s): intro 0-2 | groove 2-9 | build 9 | DROP 10-15 |
DJ filter break 16-17 | full 18-20 | outro hit 21-22."""
import numpy as np, wave, sys

SR, BPM = 44100, 120
BEAT = 60 / BPM
BAR = 4 * BEAT
DUR = 46.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def t_(n): return np.arange(n) / SR
def idx(sec): return int(sec * SR)
def add(sig, at, pan=0.0, gain=1.0):
    i = idx(at); n = min(len(sig), N - i)
    if n <= 0: return
    l = gain * np.sqrt(0.5 * (1 - pan)); r = gain * np.sqrt(0.5 * (1 + pan))
    L[i:i+n] += sig[:n] * l; R[i:i+n] += sig[:n] * r

def onepole_lp(x, cutoff):
    """One-pole low-pass; cutoff may be an array (sweeps)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s += a[i] * (x[i] - s); y[i] = s
    return y

def hp(x, cutoff): return x - onepole_lp(x, cutoff)

def saw(f, n, detune=0.0):
    ph = np.cumsum(np.full(n, f * (1 + detune)) / SR)
    return 2 * (ph % 1) - 1

def env_ad(n, a, d):
    t = t_(n); return np.minimum(t / max(a, 1e-4), 1) * np.exp(-t / d)

NOTE = lambda m: 440 * 2 ** ((m - 69) / 12)
# Am, F, C, G  (root midi for bass, chord tones for pads/arp)
CHORDS = [(45, [57, 60, 64]), (41, [53, 57, 60]), (48, [55, 60, 64]), (43, [55, 59, 62])]

def section(bar):
    if bar < 2: return "intro"
    if bar < 9: return "groove"
    if bar < 10: return "build"
    if bar < 16: return "drop"
    if bar < 18: return "break"
    if bar < 21: return "full"
    return "outro"

# --- drums -----------------------------------------------------------------
def kick():
    n = idx(0.45); t = t_(n)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.25
    return np.tanh((body + click) * 1.8) * 0.9
def clap():
    n = idx(0.3); t = t_(n); x = rng.standard_normal(n)
    e = sum(np.exp(-np.maximum(t - k * 0.011, 0) * 60) * (t >= k * 0.011) for k in range(3)) + np.exp(-t * 18) * 0.6
    return hp(onepole_lp(x, 4500), 900) * e * 0.55
def hat(open_=False):
    n = idx(0.25 if open_ else 0.06); t = t_(n)
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * (14 if open_ else 70)) * 0.22
K, C, H, HO = kick(), clap(), hat(), hat(True)

kick_times = []
nbars = int(DUR / BAR)
for bar in range(nbars):
    sec = section(bar); b0 = bar * BAR
    for beat in range(4):
        t0 = b0 + beat * BEAT
        if sec in ("groove", "drop", "full") or (sec == "build" and True):
            add(K, t0, gain=1.0); kick_times.append(t0)
        if sec in ("drop", "full") and beat in (1, 3): add(C, t0, pan=0.05)
        if sec in ("groove", "drop", "full", "break"):
            add(H, t0 + BEAT / 2, pan=0.3, gain=0.9)
            if sec in ("drop", "full"):
                add(H, t0 + BEAT / 4, pan=-0.25, gain=0.45); add(H, t0 + 3 * BEAT / 4, pan=0.25, gain=0.45)
            if beat == 3 and sec != "break": add(HO, t0 + BEAT / 2, pan=-0.2, gain=0.7)
    if sec == "build":  # snare roll accelerating into the drop
        for k in range(16):
            add(C, b0 + k * BAR / 16, gain=0.25 + 0.05 * k, pan=0.0)
kick_times = np.array(kick_times)

# sidechain envelope from the kicks (pumping)
side = np.ones(N)
for kt in kick_times:
    i = idx(kt); n = min(idx(0.42), N - i)
    side[i:i+n] = np.minimum(side[i:i+n], 1 - 0.75 * np.exp(-t_(n) / 0.11))

# --- bass, pads, arp ----------------------------------------------------------
music_L = np.zeros(N); music_R = np.zeros(N)
def addm(sig, at, pan=0.0, gain=1.0):
    i = idx(at); n = min(len(sig), N - i)
    if n <= 0: return
    music_L[i:i+n] += sig[:n] * gain * np.sqrt(0.5 * (1 - pan)); music_R[i:i+n] += sig[:n] * gain * np.sqrt(0.5 * (1 + pan))

for bar in range(nbars):
    sec = section(bar); root, tones = CHORDS[bar % 4]; b0 = bar * BAR
    if sec == "outro":
        if bar == 21:
            n = idx(4.0); pad = sum(saw(NOTE(m), n, d) for m in tones + [root + 12] for d in (-0.004, 0.004))
            addm(onepole_lp(pad, 1800) * env_ad(n, 0.01, 1.4) * 0.08, b0)
        continue
    # pad (whole bar, detuned saws, lowpassed; opens up over the song)
    n = idx(BAR + 0.05)
    pad = sum(saw(NOTE(m), n, d) for m in tones for d in (-0.005, 0.0, 0.006))
    cut = {"intro": 700, "groove": 1300, "build": 1600, "drop": 2600, "break": 900, "full": 2800}[sec]
    padf = onepole_lp(pad, cut) * np.minimum(t_(n) / 0.08, 1) * 0.045
    addm(padf, b0, pan=-0.35); addm(padf * 0.9, b0 + 0.012, pan=0.35)
    # bass on eighths
    if sec in ("groove", "build", "drop", "full"):
        for e in range(8):
            n = idx(BEAT / 2)
            f = NOTE(root - 12 + (12 if (sec in ("drop", "full") and e % 2) else 0))
            s = np.tanh(2.2 * saw(f, n)) * env_ad(n, 0.004, 0.18)
            addm(onepole_lp(s, 420 if sec == "groove" else 650) * 0.22, b0 + e * BEAT / 2)
    # arp (16ths) in drop/full and second half of groove
    if sec in ("drop", "full") or (sec == "groove" and bar >= 5):
        pattern = [0, 1, 2, 1, 2, 0, 1, 2] * 2
        for s16, k in enumerate(pattern):
            n = idx(BEAT / 4 * 0.95)
            m = tones[k] + (12 if s16 % 8 >= 4 else 0)
            tri = 2 * np.abs(2 * (np.cumsum(np.full(n, NOTE(m))) / SR % 1) - 1) - 1
            pl = tri * env_ad(n, 0.002, 0.07) * (0.055 if sec != "groove" else 0.035)
            addm(pl, b0 + s16 * BEAT / 4, pan=0.45 if s16 % 2 else -0.45)
            addm(pl * 0.35, b0 + s16 * BEAT / 4 + 3 * BEAT / 4, pan=-0.45 if s16 % 2 else 0.45)  # dotted echo

# apply sidechain pumping to the musical layers
music_L *= side; music_R *= side

# DJ break (bars 16-17): low-pass sweep closing then opening
b0, b1 = idx(16 * BAR), idx(18 * BAR)
seg = np.linspace(0, 1, b1 - b0)
cut = 400 + 6000 * (np.cos(seg * np.pi * 2) * 0.5 + 0.5) ** 2
music_L[b0:b1] = onepole_lp(music_L[b0:b1], cut); music_R[b0:b1] = onepole_lp(music_R[b0:b1], cut)
L += music_L; R += music_R

# --- FX: risers, impacts, sub drops -----------------------------------------------
def riser(dur):
    n = idx(dur); t = t_(n)
    x = rng.standard_normal(n); c = 300 + 9000 * (t / dur) ** 2
    return hp(onepole_lp(x, c), 200) * (t / dur) ** 2.2 * 0.35
def impact():
    n = idx(2.2); t = t_(n)
    sub = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 6)) / SR) * np.exp(-t * 2.2)
    nz = onepole_lp(rng.standard_normal(n), 2500) * np.exp(-t * 5) * 0.4
    return np.tanh((sub + nz) * 1.5) * 0.7
add(riser(1.8), 0.0, gain=0.5)                       # intro swell
add(impact(), 1.15, gain=0.8)                        # voice in
add(riser(2.0), 2 * BAR - 2.0, gain=0.6); add(impact(), 2 * BAR, gain=0.6)
add(riser(BAR), 9 * BAR, gain=1.0); add(impact(), 10 * BAR, gain=1.1)   # DROP
add(riser(2.0), 18 * BAR - 2.0, gain=0.8); add(impact(), 18 * BAR, gain=0.9)
add(impact(), 21 * BAR, gain=1.0)

# --- master: soft clip + normalise --------------------------------------------------
mix = np.stack([L, R], axis=1)
fade = np.ones(N); fn = idx(2.5); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None]
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.89
pcm = (mix * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("ok", DUR, "s")
