import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

/// Dart port of the web visual plumbing (src/components/scenes/kit.ts,
/// src/lib/beat.ts, src/lib/hash.ts) plus the small 3D helpers the
/// recreated scenes need to project their geometry like three.js does.

// ------------------------------------------------------------------ hashing
/// fnv1a of the web (src/lib/hash.ts), 32-bit unsigned.
int fnv1a(String input) {
  var hash = 0x811c9dc5;
  for (final unit in input.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return hash;
}

int _imul(int a, int b) => (a * b) & 0xffffffff;

/// seededRandom of the web: deterministic value in [0, 1) per key.
double Function(int) seededRandom(int seed) {
  return (int k) {
    var h = (seed ^ _imul(k + 1, 0x9e3779b9)) & 0xffffffff;
    h = _imul(h ^ (h >> 16), 2246822507);
    h = _imul(h ^ (h >> 13), 3266489909);
    return ((h ^ (h >> 16)) & 0xffffffff) / 4294967296;
  };
}

// ------------------------------------------------------------------- colour
double srgbToLinear(double c) => c < 0.04045 ? c * 0.0773993808 : math.pow(c * 0.9478672986 + 0.0521327014, 2.4).toDouble();
double linearToSrgb(double c) {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c < 0.0031308 ? c * 12.92 : 1.055 * math.pow(c, 0.41666) - 0.055;
}

/// A linear-light colour (what THREE.Color holds after .set(hex)).
class Lin {
  const Lin(this.r, this.g, this.b);
  factory Lin.of(Color c) => Lin(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b));
  final double r, g, b;
  Lin operator *(double k) => Lin(r * k, g * k, b * k);
  Lin operator +(Lin o) => Lin(r + o.r, g + o.g, b + o.b);
  Lin mix(Lin o, double t) => Lin(r + (o.r - r) * t, g + (o.g - g) * t, b + (o.b - b) * t);
  static const white = Lin(1, 1, 1);

  /// Overlay colours are stored sRGB-encoded (opaque ARGB int).
  int argb([double alpha = 1]) {
    final a = (alpha.clamp(0.0, 1.0) * 255).round();
    final rr = (linearToSrgb(r) * 255).round();
    final gg = (linearToSrgb(g) * 255).round();
    final bb = (linearToSrgb(b) * 255).round();
    return (a << 24) | (rr << 16) | (gg << 8) | bb;
  }
}

// ---------------------------------------------------------------- beat.ts
class BeatDetector {
  final List<double> _history = [];
  double _lastBeat = -10;
  double value = 0;

  void update(double bass, double time, double delta) {
    _history.add(bass);
    if (_history.length > 60) _history.removeAt(0);
    var avg = 0.0;
    for (final v in _history) {
      avg += v;
    }
    avg /= _history.isEmpty ? 1 : _history.length;
    final threshold = avg * 1.42 + 0.015;
    if (bass > threshold && time - _lastBeat > 0.28 && _history.length > 14) {
      _lastBeat = time;
      value = 1;
    }
    value = math.max(0, value - delta * 3.4);
  }
}

// ------------------------------------------------------------- AudioFrame
/// kit.ts AudioFrame: smoothed bands (attack 16/s, release 5/s), energy,
/// beat pulse, scene clock. `raw*` are the unsmoothed bands (engine.bands()).
class AudioFrame {
  double bass = 0, mid = 0, treble = 0, energy = 0, beat = 0;
  bool kick = false;
  double rawBass = 0, rawMid = 0, rawTreble = 0;
  double time = math.Random().nextDouble() * 40;
  double dt = 0, rawDt = 0, elapsed = 0;
  bool ambient = false, playing = false;
  // VisualTuner knobs and Aurora Mix swell: neutral on mobile.
  final double freq = 1, amp = 1, speed = 1, mix = 0;
  final bool reduced = false;
  final _beat = BeatDetector();

  void update(double delta, double elapsedTime, double rb, double rm, double rt, {required bool ambientMode, required bool isPlaying}) {
    final d = math.min(delta, 0.05);
    elapsed = elapsedTime;
    ambient = ambientMode;
    playing = isPlaying;
    if (ambient) {
      rb = 0.16 + 0.08 * math.sin(elapsed * 0.35);
      rm = 0.1 + 0.04 * math.sin(elapsed * 0.21 + 1.3);
      rt = 0.07 + 0.03 * math.sin(elapsed * 0.27 + 2.1);
    }
    rawBass = rb;
    rawMid = rm;
    rawTreble = rt;
    double follow(double cur, double target) => cur + (target - cur) * math.min(1, d * (target > cur ? 16 : 5));
    bass = follow(bass, rb);
    mid = follow(mid, rm);
    treble = follow(treble, rt);
    energy = bass * 0.5 + mid * 0.35 + treble * 0.15;
    final before = _beat.value;
    _beat.update(ambient ? 0 : rb, elapsed, d);
    kick = _beat.value > before + 0.5;
    beat = _beat.value;
    final scale = speed * (ambient ? 0.5 : 1);
    rawDt = d;
    dt = d * scale;
    time += dt;
  }
}

// --------------------------------------------------------------- 3D maths
class V3 {
  const V3(this.x, this.y, this.z);
  final double x, y, z;
  V3 operator +(V3 o) => V3(x + o.x, y + o.y, z + o.z);
  V3 operator -(V3 o) => V3(x - o.x, y - o.y, z - o.z);
  V3 operator *(double k) => V3(x * k, y * k, z * k);
  double dot(V3 o) => x * o.x + y * o.y + z * o.z;
  V3 cross(V3 o) => V3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x);
  double get length => math.sqrt(x * x + y * y + z * z);
  V3 get normalized {
    final l = length;
    return l > 0 ? this * (1 / l) : this;
  }
}

/// Row-major 3x3 matrix.
class M3 {
  const M3(this.m);
  final List<double> m;

  /// three.js Euler 'XYZ' rotation matrix (Rx * Ry * Rz).
  factory M3.euler(double x, double y, double z) {
    final a = math.cos(x), b = math.sin(x);
    final c = math.cos(y), d = math.sin(y);
    final e = math.cos(z), f = math.sin(z);
    final ae = a * e, af = a * f, be = b * e, bf = b * f;
    return M3([
      c * e, -c * f, d, //
      af + be * d, ae - bf * d, -b * c,
      bf - ae * d, be + af * d, a * c,
    ]);
  }
  V3 apply(V3 v) => V3(m[0] * v.x + m[1] * v.y + m[2] * v.z, m[3] * v.x + m[4] * v.y + m[5] * v.z, m[6] * v.x + m[7] * v.y + m[8] * v.z);
  M3 operator *(M3 o) {
    final r = List<double>.filled(9, 0);
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        r[i * 3 + j] = m[i * 3] * o.m[j] + m[i * 3 + 1] * o.m[3 + j] + m[i * 3 + 2] * o.m[6 + j];
      }
    }
    return M3(r);
  }
  M3 get transposed => M3([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);

  /// GLSL mat3 column-major floats of this matrix.
  List<double> get glsl => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/// Perspective camera (fov 42 like the web Canvas) with lookAt.
class Cam {
  Cam(this.pos, this.target, {this.fov = 42});
  V3 pos, target;
  final double fov;
  late V3 _f, _r, _u;
  double _focal = 1, _cx = 0, _cy = 0;

  void setup(Size size) {
    _f = (target - pos).normalized;
    _r = _f.cross(const V3(0, 1, 0)).normalized;
    _u = _r.cross(_f);
    _focal = size.height / 2 / math.tan(fov * math.pi / 360);
    _cx = size.width / 2;
    _cy = size.height / 2;
  }

  /// Screen point (logical px) and view depth; depth <= 0.1 is behind.
  double depthOf(V3 w) => (w - pos).dot(_f);
  Offset project(V3 w, [double? depth]) {
    final d = w - pos;
    final z = depth ?? d.dot(_f);
    return Offset(_cx + d.dot(_r) / z * _focal, _cy - d.dot(_u) / z * _focal);
  }

  /// Pixel size of a world length at a depth (three sizeAttenuation).
  double pixels(double world, double depth) => world * _focal / depth;
  double get focal => _focal;
}

/// Eases a camera toward a pose (kit.ts easeCamera).
void easeCamera(Cam cam, V3 to, double dt, V3 look) {
  final k = math.min(1.0, dt * 2.4);
  cam.pos = cam.pos + (to - cam.pos) * k;
  cam.target = look;
}

// ------------------------------------------------------------ geometry batch
/// Triangles with per-vertex colours, drawn in one drawVertices call.
class TriBatch {
  TriBatch([int capacity = 1024]) : _pos = Float32List(capacity * 2), _col = Int32List(capacity);
  Float32List _pos;
  Int32List _col;
  Float32List? _tex;
  int n = 0;

  void clear() => n = 0;

  void _grow(int extra, {bool tex = false}) {
    if (n + extra <= _col.length && (!tex || (_tex != null && _tex!.length >= _col.length * 2))) return;
    final cap = math.max(_col.length * 2, n + extra);
    final p = Float32List(cap * 2)..setRange(0, n * 2, _pos);
    final c = Int32List(cap)..setRange(0, n, _col);
    _pos = p;
    _col = c;
    if (tex || _tex != null) {
      final t = Float32List(cap * 2);
      if (_tex != null) t.setRange(0, n * 2, _tex!);
      _tex = t;
    }
  }

  void _v(double x, double y, int c) {
    _pos[n * 2] = x;
    _pos[n * 2 + 1] = y;
    _col[n] = c;
    n++;
  }

  void quad(Offset a, Offset b, Offset c, Offset d, int ca, int cb, int cc, int cd) {
    _grow(6);
    _v(a.dx, a.dy, ca);
    _v(b.dx, b.dy, cb);
    _v(c.dx, c.dy, cc);
    _v(a.dx, a.dy, ca);
    _v(c.dx, c.dy, cc);
    _v(d.dx, d.dy, cd);
  }

  /// Quad with texture coordinates (image pixels).
  void texQuad(Offset a, Offset b, Offset c, Offset d, Offset ta, Offset tb, Offset tc, Offset td, int ca, int cb, int cc, int cd) {
    _grow(6, tex: true);
    final t = _tex!;
    void tx(Offset o) {
      t[n * 2] = o.dx;
      t[n * 2 + 1] = o.dy;
    }

    tx(ta);
    _v(a.dx, a.dy, ca);
    tx(tb);
    _v(b.dx, b.dy, cb);
    tx(tc);
    _v(c.dx, c.dy, cc);
    tx(ta);
    _v(a.dx, a.dy, ca);
    tx(tc);
    _v(c.dx, c.dy, cc);
    tx(td);
    _v(d.dx, d.dy, cd);
  }

  void square(double x, double y, double half, int color) {
    quad(Offset(x - half, y - half), Offset(x + half, y - half), Offset(x + half, y + half), Offset(x - half, y + half), color, color, color, color);
  }

  /// Segment of a given pixel width with colours at both ends.
  void line(Offset a, Offset b, double width, int ca, int cb) {
    final dx = b.dx - a.dx, dy = b.dy - a.dy;
    final l = math.sqrt(dx * dx + dy * dy);
    if (l < 1e-3) return;
    final nx = -dy / l * width / 2, ny = dx / l * width / 2;
    quad(Offset(a.dx + nx, a.dy + ny), Offset(b.dx + nx, b.dy + ny), Offset(b.dx - nx, b.dy - ny), Offset(a.dx - nx, a.dy - ny), ca, cb, cb, ca);
  }

  /// Draws the batch. Colours are modulated with an opaque white paint (or
  /// the paint's image shader), which is order-independent across backends.
  void draw(Canvas canvas, {BlendMode blend = BlendMode.srcOver, Shader? shader}) {
    if (n == 0) return;
    final v = Vertices.raw(
      VertexMode.triangles,
      Float32List.sublistView(_pos, 0, n * 2),
      colors: Int32List.sublistView(_col, 0, n),
      textureCoordinates: shader != null && _tex != null ? Float32List.sublistView(_tex!, 0, n * 2) : null,
    );
    final paint = Paint()
      ..color = const Color(0xFFFFFFFF)
      ..blendMode = blend
      ..shader = shader;
    canvas.drawVertices(v, BlendMode.modulate, paint);
    v.dispose();
  }
}

/// Synthetic spectrum (0..1) at a fraction of the web getSpectrum() bins,
/// built from the three bands: the mobile app has no live FFT.
double synthSpectrum(double frac, int bin, AudioFrame f) {
  final x = frac.clamp(0.0, 1.0);
  final wob = 0.5 + 0.5 * math.sin(bin * 12.9898 + f.elapsed * (3.1 + (bin % 7) * 0.9));
  final lows = f.rawBass * math.exp(-x * 5.0) * 1.1;
  final mids = f.rawMid * math.exp(-math.pow((x - 0.32) / 0.3, 2).toDouble()) * 0.95;
  final highs = f.rawTreble * (0.35 + 0.5 * x) * math.exp(-math.pow((x - 0.75) / 0.35, 2).toDouble());
  final v = (lows + mids + highs) * (0.78 + 0.32 * wob);
  return (v * 1.15).clamp(0.0, 1.0);
}
