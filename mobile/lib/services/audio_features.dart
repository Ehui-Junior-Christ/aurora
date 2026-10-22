import 'dart:typed_data';

/// Bass / mid / high energies (0..1).
class Bands {
  const Bands(this.bass, this.mid, this.high);
  final double bass, mid, high;
}

/// Offline analysis of a track: band energies at a fixed frame rate
/// (format written by AudioAnalyzer.kt: fps, u16 count, then 3 bytes/frame).
class AudioFeatures {
  AudioFeatures._(this.fps, this.frames);
  final int fps;
  final Uint8List frames;

  int get length => frames.length ~/ 3;

  static AudioFeatures? parse(Uint8List b) {
    if (b.length < 6) return null;
    final fps = b[0];
    final n = b[1] | (b[2] << 8);
    if (fps <= 0 || b.length < 3 + n * 3) return null;
    return AudioFeatures._(fps, Uint8List.sublistView(b, 3, 3 + n * 3));
  }

  /// Interpolated bands at [seconds]; a tiny look-ahead compensates output latency.
  Bands at(double seconds) {
    final x = (seconds + 0.04) * fps;
    final i = x.floor();
    if (i < 0 || i >= length - 1) return const Bands(0, 0, 0);
    final f = x - i;
    double v(int k) => (frames[i * 3 + k] * (1 - f) + frames[(i + 1) * 3 + k] * f) / 255;
    return Bands(v(0), v(1), v(2));
  }
}
