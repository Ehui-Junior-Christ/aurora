export class BeatDetector {
  private history: number[] = [];
  private lastBeat = -10;
  value = 0;

  update(bass: number, time: number, delta: number): void {
    this.history.push(bass);
    if (this.history.length > 60) this.history.shift();
    let avg = 0;
    for (const v of this.history) avg += v;
    avg /= this.history.length || 1;
    const threshold = avg * 1.42 + 0.015;
    if (
      bass > threshold &&
      time - this.lastBeat > 0.28 &&
      this.history.length > 14
    ) {
      this.lastBeat = time;
      this.value = 1;
    }
    this.value = Math.max(0, this.value - delta * 3.4);
  }
}
