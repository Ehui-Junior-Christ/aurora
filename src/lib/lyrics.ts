export interface LyricsCue {
  time: number;
  text: string;
}

export function parseLrc(text: string): LyricsCue[] {
  const cues: LyricsCue[] = [];
  const lineRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const rawLine of text.split(/\r?\n/)) {
    lineRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastEnd = 0;
    const stamps: number[] = [];
    while ((match = lineRe.exec(rawLine)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fractionStr = match[3] || "0";
      const fraction = parseInt(fractionStr.padEnd(3, "0"), 10);
      stamps.push(minutes * 60 + seconds + fraction / 1000);
      lastEnd = lineRe.lastIndex;
    }
    if (stamps.length === 0) continue;
    const content = rawLine.slice(lastEnd).trim();
    if (content.length === 0) continue;
    for (const time of stamps) cues.push({ time, text: content });
  }
  cues.sort((a, b) => a.time - b.time);
  return cues;
}

export function currentCueIndex(cues: LyricsCue[], time: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].time <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
