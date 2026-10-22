/** Synthetic test signals for the mix analysis (deterministic PRNG). */

export const SR = 44100;

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface DrumOptions {
  bpm: number;
  /** Time of the first beat (seconds). */
  offset: number;
  bars: number;
  seed?: number;
  /** Beat index (0..3) that carries the downbeat accent (bass note change). */
  downbeat?: number;
  /** Sections: per bar, which layers play. Defaults to everything. */
  layers?: (bar: number) => { kick: boolean; hat: boolean; snare: boolean; bass: boolean; pad: boolean };
  /** Chord roots (pitch classes) per bar for the bass / pad. */
  chord?: (bar: number) => number[];
  /** Tempo drift (fraction per minute), for "live" tests. */
  drift?: number;
  tail?: number;
}

function addTone(out: Float32Array, t0: number, dur: number, hz: number, amp: number, decay: number) {
  const a = Math.max(0, Math.floor(t0 * SR));
  const b = Math.min(out.length, Math.floor((t0 + dur) * SR));
  for (let i = a; i < b; i++) {
    const t = (i - a) / SR;
    const env = Math.exp(-t / decay) * Math.min(1, t * 400);
    out[i] += amp * env * Math.sin(2 * Math.PI * hz * t);
  }
}

export function drumTrack(o: DrumOptions): { data: Float32Array; beats: number[] } {
  const r = rng(o.seed ?? 1);
  const period = 60 / o.bpm;
  const totalBeats = o.bars * 4;
  const beatTimes: number[] = [];
  let t = o.offset;
  for (let k = 0; k < totalBeats; k++) {
    beatTimes.push(t);
    const drift = o.drift ? 1 + (o.drift * t) / 60 : 1;
    t += period / drift;
  }
  const len = Math.ceil((t + (o.tail ?? 2)) * SR);
  const out = new Float32Array(len);
  const db = o.downbeat ?? 0;
  const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  for (let k = 0; k < totalBeats; k++) {
    const bt = beatTimes[k];
    const next = k + 1 < totalBeats ? beatTimes[k + 1] : bt + period;
    const barIdx = Math.floor((k - db) / 4);
    const posInBar = (((k - db) % 4) + 4) % 4;
    const L = o.layers ? o.layers(Math.max(0, barIdx)) : { kick: true, hat: true, snare: true, bass: true, pad: true };
    // kick: pitch-dropping sine
    if (L.kick) {
      const a = Math.floor(bt * SR);
      for (let i = 0; i < Math.floor(0.25 * SR) && a + i < len; i++) {
        const tt = i / SR;
        const f = 50 + 90 * Math.exp(-tt * 30);
        out[a + i] += 0.8 * Math.exp(-tt * 12) * Math.sin(2 * Math.PI * f * tt);
      }
    }
    // hats on the off-beats
    if (L.hat) {
      const ht = (bt + next) / 2;
      const a = Math.floor(ht * SR);
      for (let i = 0; i < Math.floor(0.05 * SR) && a + i < len; i++) {
        out[a + i] += 0.15 * (r() * 2 - 1) * Math.exp(-(i / SR) * 80);
      }
    }
    // snare on 2 and 4
    if (L.snare && (posInBar === 1 || posInBar === 3)) {
      const a = Math.floor(bt * SR);
      for (let i = 0; i < Math.floor(0.15 * SR) && a + i < len; i++) {
        const tt = i / SR;
        out[a + i] += Math.exp(-tt * 25) * (0.3 * (r() * 2 - 1) + 0.2 * Math.sin(2 * Math.PI * 190 * tt));
      }
    }
    const roots = o.chord ? o.chord(Math.max(0, barIdx)) : [[0, 5, 7, 0][((barIdx % 4) + 4) % 4]];
    // bass: new note on each downbeat, sustained over the bar
    if (L.bass && posInBar === 0) {
      addTone(out, bt, period * 4 * 0.95, midiHz(36 + roots[0]), 0.35, period * 3);
    }
    if (L.pad && posInBar === 0) {
      for (const pc of roots.length > 1 ? roots : [roots[0], roots[0] + 4, roots[0] + 7]) {
        addTone(out, bt, period * 4, midiHz(60 + pc), 0.06, period * 6);
        addTone(out, bt, period * 4, midiHz(72 + pc), 0.03, period * 6);
      }
    }
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.99) for (let i = 0; i < len; i++) out[i] *= 0.99 / peak;
  return { data: out, beats: beatTimes };
}

/** Chord progression with harmonic partials (key detection tests). */
export function chordTrack(tonic: number, minor: boolean, seconds: number, seed = 1): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * SR));
  const third = minor ? 3 : 4;
  // i/I - iv/IV - V - i/I (harmonic minor V has a major third)
  const prog = [
    [0, third, 7],
    [5, 5 + (minor ? 3 : 4), 12],
    [7, 11, 14],
    [0, third, 7],
  ];
  const chordDur = 2;
  for (let c = 0; c * chordDur < seconds; c++) {
    const chord = prog[c % prog.length];
    const t0 = c * chordDur;
    for (const iv of chord) {
      const midi = 48 + tonic + iv + (r() < 0.3 ? 12 : 0);
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      for (let h = 1; h <= 5; h++) {
        const a = Math.floor(t0 * SR);
        const b = Math.min(out.length, Math.floor((t0 + chordDur) * SR));
        const amp = 0.08 / h;
        for (let i = a; i < b; i++) {
          const t = (i - a) / SR;
          out[i] += amp * Math.exp(-t * 0.8) * Math.sin(2 * Math.PI * hz * h * t);
        }
      }
    }
    // melody note from the scale
    const scale = minor ? [0, 2, 3, 5, 7, 8, 11] : [0, 2, 4, 5, 7, 9, 11];
    for (let n = 0; n < 4; n++) {
      const midi = 72 + tonic + scale[Math.floor(r() * scale.length)];
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      const a = Math.floor((t0 + n * 0.5) * SR);
      for (let i = a; i < Math.min(out.length, a + 0.45 * SR); i++) {
        const t = (i - a) / SR;
        out[i] += 0.05 * Math.exp(-t * 3) * Math.sin(2 * Math.PI * hz * t);
      }
    }
  }
  return out;
}
