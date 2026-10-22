import { analyzeMix } from "../../src/lib/mix/analyze";
import { drumTrack, SR } from "./synth";

const rows: Record<string, unknown>[] = [];
let pass = 0;
const scenarios = [
  { name: "house 16/32/16", bpm: 124, intro: 16, body: 32, outro: 16, db: 0, offset: 0.4 },
  { name: "techno 32/64/32", bpm: 132, intro: 32, body: 64, outro: 32, db: 2, offset: 0.1 },
  { name: "pop 8/40/8", bpm: 104, intro: 8, body: 40, outro: 8, db: 1, offset: 0.9 },
  { name: "no intro 0/48/16", bpm: 128, intro: 0, body: 48, outro: 16, db: 0, offset: 0.2 },
];
for (const s of scenarios) {
  const bars = s.intro + s.body + s.outro;
  const { data, beats } = drumTrack({
    bpm: s.bpm, offset: s.offset, bars, downbeat: s.db, seed: 5,
    layers: (bar) => {
      const body = bar >= s.intro && bar < s.intro + s.body;
      return { kick: true, hat: true, snare: body, bass: body, pad: body };
    },
  });
  const a = analyzeMix(data, SR);
  const barT = (m: number) => beats[s.db + 4 * m];
  const errIntro = (a.introEnd - barT(s.intro)) / (240 / s.bpm);
  const errOutro = (a.outroStart - barT(s.intro + s.body)) / (240 / s.bpm);
  // phrase boundaries should include the intro end (bars multiple of 8 from the downbeat)
  const phraseT = a.beats[a.phraseBeat];
  const phraseBars = (barT(s.intro) - phraseT) / (240 / s.bpm);
  const good = Math.abs(errIntro) < 0.1 && Math.abs(errOutro) < 0.1 && Math.abs(phraseBars - Math.round(phraseBars / 8) * 8) < 0.1;
  if (good) pass++;
  rows.push({ name: s.name, bpm: a.bpm, "introErr(bars)": errIntro.toFixed(2), "outroErr(bars)": errOutro.toFixed(2), phraseAligned: Math.abs(phraseBars % 8) < 0.1 || Math.abs((phraseBars % 8) - 8) < 0.1, energy: a.energy, loud: a.loudnessDb.toFixed(1), key: a.camelot });
}
console.table(rows);
console.log(`Intro/outro/phrase: ${pass}/${scenarios.length}`);
