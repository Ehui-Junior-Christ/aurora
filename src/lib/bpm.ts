export async function detectBpm(file: File): Promise<number | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    const decodeCtx = new Ctor();
    let audio: AudioBuffer;
    try {
      audio = await decodeCtx.decodeAudioData(arrayBuffer);
    } finally {
      void decodeCtx.close();
    }

    const sr = audio.sampleRate;
    const analysisLength = Math.min(audio.length, sr * 120);
    const offline = new OfflineAudioContext(1, analysisLength, sr);
    const source = offline.createBufferSource();
    source.buffer = audio;
    const filter = offline.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 150;
    filter.Q.value = 1;
    source.connect(filter);
    filter.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    const data = rendered.getChannelData(0);

    const minGap = Math.floor(sr * 0.22);
    let threshold = 0.9;
    let peaks: number[] = [];
    while (threshold > 0.2) {
      peaks = [];
      let lastIdx = -minGap;
      for (let i = 1; i < data.length - 1; i++) {
        const v = data[i];
        if (v > threshold && v >= data[i - 1] && v > data[i + 1]) {
          if (i - lastIdx >= minGap) {
            peaks.push(i);
            lastIdx = i;
          }
        }
      }
      const perSecond = peaks.length / (data.length / sr);
      if (perSecond >= 1 && perSecond <= 4) break;
      threshold -= 0.05;
    }

    if (peaks.length < 6) return null;

    const candidates: number[] = [];
    for (let i = 0; i < peaks.length - 1; i++) {
      const seconds = (peaks[i + 1] - peaks[i]) / sr;
      if (seconds < 0.2 || seconds > 2.2) continue;
      let tempo = 60 / seconds;
      while (tempo < 85) tempo *= 2;
      while (tempo > 185) tempo /= 2;
      candidates.push(tempo);
    }
    if (candidates.length < 4) return null;

    candidates.sort((a, b) => a - b);
    const median = candidates[Math.floor(candidates.length / 2)];
    return Math.round(median);
  } catch {
    return null;
  }
}
