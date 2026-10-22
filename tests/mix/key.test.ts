import { chromagram, estimateKey, keyName, toCamelot, harmonicCompat } from "../../src/lib/mix/key";
import { decimate } from "../../src/lib/mix/dsp";
import { chordTrack, SR } from "./synth";

let ok = 0;
let relOk = 0;
const fails: string[] = [];
for (let tonic = 0; tonic < 12; tonic++) {
  for (const minor of [false, true]) {
    for (const detune of [0, 0.3]) {
      let x = chordTrack(tonic, minor, 32, tonic * 7 + (minor ? 1 : 0));
      if (detune) {
        // resample to simulate a +30 cents detuned master (432/440-ish)
        const f = Math.pow(2, detune / 12);
        const y = new Float32Array(Math.floor(x.length / f));
        for (let i = 0; i < y.length; i++) y[i] = x[Math.floor(i * f)];
        x = y;
      }
      const d = decimate(x, SR);
      const { key } = estimateKey(chromagram(d.data, d.sr));
      const truth = minor ? tonic + 12 : tonic;
      if (key === truth) ok++;
      else {
        const rel = harmonicCompat(key, truth);
        if (rel.relation === "same" || rel.score >= 0.85) relOk++;
        fails.push(`${keyName(truth)}${detune ? " (+30c)" : ""} → ${keyName(key)}`);
      }
    }
  }
}
console.log(`Key exact: ${ok}/48 · relative/neighbour: ${relOk} · misses: ${fails.join(", ") || "none"}`);
const camelotChecks: [number, string][] = [[0, "8B"], [7, "9B"], [5, "7B"], [21, "8A"], [16, "9A"], [11, "1B"], [20, "1A"]];
for (const [k, c] of camelotChecks) if (toCamelot(k) !== c) throw new Error(`camelot ${keyName(k)} ${toCamelot(k)} != ${c}`);
console.log("Camelot mapping OK:", camelotChecks.map(([k, c]) => `${keyName(k)}=${c}`).join(" "));
const pairs: [number, number][] = [[21, 21], [21, 16], [21, 0], [21, 14], [0, 6]];
console.log(pairs.map(([a, b]) => `${toCamelot(a)}→${toCamelot(b)}: ${harmonicCompat(a, b).relation} ${harmonicCompat(a, b).score}`).join(" · "));
