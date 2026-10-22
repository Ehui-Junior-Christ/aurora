import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

import '../core/models.dart';
import 'visual_kit.dart';

/// What a scene knows about the app this frame.
class SceneCtx {
  SceneCtx({
    required this.size,
    required this.density,
    required this.trio,
    required this.seed,
    required this.cover,
    required this.progress,
    required this.playing,
  });

  /// Logical size of the background and render pixels per logical pixel.
  final Size size;
  final double density;

  /// Palette in linear light (THREE.Color.set(hex) equivalent).
  final List<Lin> trio;
  final int seed;
  final ui.Image? cover;
  final double progress;
  final bool playing;

  double get aspect => size.width / math.max(1, size.height);
  Size get renderSize => Size((size.width * density).roundToDouble(), (size.height * density).roundToDouble());
}

/// Values of the common uniform block (layout in shaders/common.glsl).
class CommonUniforms {
  double time = 0, clock = 0, bass = 0, mid = 0, treble = 0, energy = 0, beat = 0, seed = 0;
  final params = Float32List(16);

  void fromFrame(AudioFrame f, int trackSeed) {
    time = f.time;
    clock = f.elapsed;
    bass = f.bass * f.amp;
    mid = f.mid * f.amp;
    treble = f.treble * f.amp;
    energy = (f.energy + f.mix * 0.25) * f.amp;
    beat = f.beat * math.min(1.5, f.amp);
    seed = (trackSeed % 997) / 997;
    params.fillRange(0, 16, 0);
  }

  void setMat3(int at, List<double> glsl) {
    for (var i = 0; i < 9; i++) {
      params[at + i] = glsl[i];
    }
  }
}

/// One web scene: updates its per-frame state (the JS useFrame logic),
/// fills the shader parameters and optionally paints overlay geometry.
abstract class SceneDriver {
  /// Bloom intensity (Visualizer.tsx BLOOM map, default 1.2).
  double get bloom => 1.2;

  /// Render pixels per logical pixel of the offscreen target.
  double get density => 1.0;
  bool get hasOverlay => false;
  bool get hasCover => false;

  void update(AudioFrame f, SceneCtx c, CommonUniforms u);
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {}

  static SceneDriver create(VisualMode m) {
    switch (m) {
      case VisualMode.organism:
        return OrganismScene();
      case VisualMode.tunnel:
        return TunnelScene();
      case VisualMode.metaballs:
        return MetaballsScene();
      case VisualMode.particles:
        return ParticlesScene();
      case VisualMode.galaxy:
        return GalaxyScene();
      case VisualMode.nebula:
        return NebulaScene();
      case VisualMode.waves:
        return WavesScene();
      case VisualMode.borealis:
        return BorealisScene();
      case VisualMode.prism:
        return PrismScene();
      case VisualMode.liquid:
        return LiquidScene();
      case VisualMode.spectrum:
        return SpectrumScene();
      case VisualMode.vinyl:
        return VinylScene();
      case VisualMode.warp:
        return WarpScene();
      case VisualMode.mosaic:
        return MosaicScene();
      case VisualMode.constellation:
        return ConstellationScene();
    }
  }
}

// =================================================== full-screen shader ports

/// Borealis.tsx: uFlow integrates the mids. 22 slices (the web low-quality
/// path) keep the 40-slice raymarch affordable on phones.
class BorealisScene extends SceneDriver {
  double _flow = 0;
  @override
  double get bloom => 0.22;
  @override
  double get density => 0.8;
  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    _flow += f.dt * (0.6 + f.mid * f.amp * 2.2 + f.mix * 2.5);
    u.params
      ..[0] = _flow
      ..[1] = 1
      ..[2] = f.freq;
  }
}

/// Liquid.tsx: vortex angle integrates the bass, kicks send a ripple.
class LiquidScene extends SceneDriver {
  double _stir = 0, _ripple = 1;
  @override
  double get bloom => 0.8;
  @override
  double get density => 0.8;
  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    _stir += f.dt * (0.05 + f.bass * f.amp * 1.4 + f.mix * 1.2);
    if (f.kick && !f.reduced) _ripple = 0;
    _ripple = math.min(1, _ripple + f.rawDt * 0.9);
    u.params
      ..[0] = math.sin(_stir * 0.35) * 2.4
      ..[1] = _ripple
      ..[2] = 0
      ..[3] = f.freq
      // Derivative scale: render height vs the web's ~1830 device px.
      ..[4] = c.renderSize.height / 1830;
  }
}

/// Metaballs.tsx: raw bands, own clock, seed % 997 (not normalised).
class MetaballsScene extends SceneDriver {
  double _time = 0;
  final _beat = BeatDetector();
  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    _beat.update(f.rawBass, f.elapsed, f.rawDt);
    _time += f.rawDt * (0.5 + f.rawBass * 0.6);
    u
      ..time = _time
      ..bass = f.rawBass
      ..mid = f.rawMid
      ..treble = f.rawTreble
      ..beat = _beat.value
      ..seed = (c.seed % 997).toDouble();
  }
}

/// Nebula.tsx: raw bands (own ambient formula), uTime += d, seed % 991.
class NebulaScene extends SceneDriver {
  double _time = 0;
  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    var b = f.rawBass, m = f.rawMid, t = f.rawTreble;
    if (f.ambient) {
      b = 0.16 + 0.08 * math.sin(_time * 0.3);
      m = 0.1;
      t = 0.07;
    }
    _time += f.rawDt * (f.ambient ? 0.4 : 1);
    u
      ..time = _time
      ..bass = b
      ..mid = m
      ..treble = t
      ..seed = (c.seed % 991).toDouble();
  }
}

/// Prism.tsx: kick angular momentum, Euler spin, scale and dispersion.
class PrismScene extends SceneDriver {
  double _x = 0.4, _y = 0, _z = 0.15, _v = 0;
  @override
  double get bloom => 0.6;
  @override
  double get density => 1.1;
  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    if (f.kick && !f.reduced) _v += 0.9;
    _v *= math.exp(-f.rawDt * 2.2);
    _y += f.dt * (0.22 + f.mid * 0.5) + f.rawDt * _v * 0.6;
    _x = 0.35 + math.sin(f.time * 0.21) * 0.25;
    _z = math.sin(f.time * 0.13) * 0.2;
    // uRot = Matrix3.setFromMatrix4(rotation).transpose().
    u.setMat3(0, M3.euler(_x, _y, _z).transposed.glsl);
    u.params
      ..[9] = (0.56 + f.bass * 0.08 * f.amp + f.beat * 0.03) * math.min(1, c.aspect * 1.25)
      ..[10] = 0.02 + f.beat * 0.07 + f.treble * 0.03 + f.mix * 0.08
      ..[11] = 0;
  }
}

/// Warp.tsx: jump speed / boost / travel, background uSpeed, and the
/// instanced streaks projected into the additive overlay.
class WarpScene extends SceneDriver {
  static const _count = 2600, _depth = 70.0;
  final _stars = Float32List(_count * 4);
  double _travel = 0, _speed = 6, _boost = 0, _rotZ = 0, _treble = 0, _beat = 0;
  final _batch = TriBatch(_count * 18);
  late final Cam _cam = Cam(const V3(0, 0, 1), const V3(0, 0, -20));

  WarpScene() {
    final r = math.Random(11);
    for (var i = 0; i < _count; i++) {
      _stars[i * 4] = r.nextDouble() * math.pi * 2;
      _stars[i * 4 + 1] = 0.35 + math.pow(r.nextDouble(), 0.6) * 7.5;
      _stars[i * 4 + 2] = r.nextDouble();
      _stars[i * 4 + 3] = r.nextDouble();
    }
  }

  @override
  double get density => 1.25;
  @override
  bool get hasOverlay => true;

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    if (f.kick && !f.reduced) _boost = math.min(2, _boost + 1);
    _boost *= math.exp(-f.rawDt * 3);
    final target = 5 + f.energy * f.amp * 42 + _boost * 18 + f.mix * 55;
    _speed += (target - _speed) * math.min(1, f.rawDt * 3);
    _travel += _speed * f.rawDt * f.speed;
    _rotZ += f.dt * (0.04 + f.mid * 0.12);
    _treble = f.treble * f.amp;
    _beat = f.beat;
    u.params
      ..[0] = _speed
      ..[1] = 4 * c.density
      ..[2] = 0.9;
  }

  static double _smooth(double e0, double e1, double x) {
    final t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    return t * t * (3 - 2 * t);
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {
    _cam.setup(px);
    _batch.clear();
    final stretch = 0.25 + _speed * 0.16;
    final gain = 0.8 + _treble * 1.4 + _beat * 0.6;
    final cr = math.cos(_rotZ), sr = math.sin(_rotZ);
    const alongs = [0.0, 0.18, 0.45, 1.0];
    final a = c.trio[0], b = c.trio[1], cc = c.trio[2];
    for (var i = 0; i < _count; i++) {
      final ang = _stars[i * 4], rad = _stars[i * 4 + 1], ph = _stars[i * 4 + 2], w = _stars[i * 4 + 3];
      final zHead = -_depth + ((ph * _depth + _travel * (0.75 + w * 0.5)) % (_depth + 2));
      final fade = _smooth(-_depth, -_depth * 0.55, zHead) * _smooth(1.5, -0.5, zHead);
      if (fade <= 0.002) continue;
      final len = stretch * (0.6 + w * 0.8);
      final dx0 = math.cos(ang), dy0 = math.sin(ang);
      final dx = dx0 * cr - dy0 * sr, dy = dx0 * sr + dy0 * cr;
      final width = 0.018 + w * 0.02;
      final tint = w < 0.5 ? a.mix(b, w * 2) : b.mix(cc, w * 2 - 1);
      final head = tint.mix(Lin.white, 0.65);
      Offset? prevL, prevR;
      int prevC = 0;
      for (final along in alongs) {
        var z = zHead - along * len;
        // Clip at the camera near plane.
        if (1 - z < 0.12) z = 1 - 0.12;
        final cx = dx * rad, cy = dy * rad;
        final center = V3(cx, cy, z);
        final depth = 1 - z;
        final p = _cam.project(center, depth);
        final half = math.max(0.5, _cam.pixels(width, depth) / 2);
        // Tangent is perpendicular to the radial direction on screen.
        final l = Offset(p.dx - dy * half, p.dy - dx * half);
        final r = Offset(p.dx + dy * half, p.dy + dx * half);
        final col = head.mix(tint, _smooth(0, 0.35, along));
        final al = (1 - along) * (1 - along) * fade;
        final k = (col * (al * al * gain));
        final ci = k.argb();
        if (prevL != null) _batch.quad(prevL, prevR!, r, l, prevC, prevC, ci, ci);
        prevL = l;
        prevR = r;
        prevC = ci;
      }
    }
    _batch.draw(canvas, blend: BlendMode.plus);
  }
}

// ======================================================= recreated 3D scenes

/// Particles.tsx: 1300 points on a shell, additive square sprites.
class _Particles {
  static const count = 1300;
  final _pos = Float32List(count * 3);
  double rotY = 0, rotX = 0, opacity = 0.35, size = 0.028;
  final _batch = TriBatch(count * 6);

  _Particles() {
    final r = math.Random(5);
    for (var i = 0; i < count; i++) {
      final theta = r.nextDouble() * math.pi * 2;
      final phi = math.acos(2 * r.nextDouble() - 1);
      final radius = 2.3 + math.pow(r.nextDouble(), 0.7) * 3.6;
      _pos[i * 3] = radius * math.sin(phi) * math.cos(theta);
      _pos[i * 3 + 1] = radius * math.sin(phi) * math.sin(theta);
      _pos[i * 3 + 2] = radius * math.cos(phi);
    }
  }

  void update(AudioFrame f) {
    rotY += f.rawDt * (f.ambient ? 0.015 : 0.02 + f.rawTreble * 0.18 + f.beat * 0.12);
    rotX = math.sin(rotY * 0.4) * 0.08;
    opacity = f.ambient ? 0.18 : math.min(1, 0.22 + f.rawTreble * 0.5 + f.beat * 0.4);
    size = 0.028 + f.rawBass * 0.02 + f.beat * 0.015;
  }

  void paint(Canvas canvas, Size px, Cam cam, Lin color) {
    cam.setup(px);
    _batch.clear();
    final m = M3.euler(rotX, rotY, 0);
    final ci = (color * opacity).argb();
    // three: gl_PointSize = size * (bufferHeight / 2) / depth.
    final scale = px.height / 2;
    for (var i = 0; i < count; i++) {
      final w = m.apply(V3(_pos[i * 3], _pos[i * 3 + 1], _pos[i * 3 + 2]));
      final d = cam.depthOf(w);
      if (d < 0.2) continue;
      final p = cam.project(w, d);
      final s = math.max(0.6, size * scale / d);
      _batch.square(p.dx, p.dy, s / 2, ci);
    }
    _batch.draw(canvas, blend: BlendMode.plus);
  }
}

class ParticlesScene extends SceneDriver {
  final _p = _Particles();
  final _cam = Cam(const V3(0, 0, 4.4), const V3(0, 0, 0));
  @override
  double get density => 1.5;
  @override
  bool get hasOverlay => true;
  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    _p.update(f);
    u.params
      ..[0] = 0
      ..[1] = 4 * c.density
      ..[2] = 0.8;
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) => _p.paint(canvas, px, _cam, c.trio[1]);
}

/// Blob.tsx + Particles.tsx. The blob is raymarched in organism.frag with
/// the web displacement/shading; this driver ports its useFrame logic.
class OrganismScene extends SceneDriver {
  final _p = _Particles();
  final _cam = Cam(const V3(0, 0, 4.4), const V3(0, 0, 0));
  double _time = math.Random().nextDouble() * 100, _sb = 0, _sm = 0, _st = 0, _ry = 0, _rz = 0;
  final _beat = BeatDetector();

  @override
  double get density => 1.0;
  @override
  bool get hasOverlay => true;

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    final d = f.rawDt;
    final k = math.min(1.0, d * (f.ambient ? 2 : 9));
    final rb = f.ambient ? 0.16 + 0.1 * math.sin(f.elapsed * 0.4) : f.rawBass;
    final rm = f.ambient ? 0.1 + 0.06 * math.sin(f.elapsed * 0.27 + 1.3) : f.rawMid;
    final rt = f.ambient ? 0.07 + 0.04 * math.sin(f.elapsed * 0.19 + 2.1) : f.rawTreble;
    _sb += (rb - _sb) * k;
    _sm += (rm - _sm) * k;
    _st += (rt - _st) * k;
    _beat.update(rb, f.elapsed, d);
    _time += d * (0.4 + _sb * 0.85);
    _ry += d * (0.06 + _sm * 0.12);
    _rz += d * 0.03;
    _p.update(f);

    final rand = seededRandom(c.seed);
    final beat = _beat.value;
    u
      ..time = _time
      ..bass = _sb
      ..mid = _sm
      ..treble = _st
      ..beat = beat;
    // World -> object: inverse (transpose) of the mesh rotation.
    u.setMat3(0, M3.euler(0, _ry, _rz).transposed.glsl);
    u.params
      ..[9] = 1 + _sb * 0.08 + beat * 0.05
      ..[10] = (1.25 + rand(2) * 1.5) * f.freq
      ..[11] = (0.32 + rand(3) * 0.55) * f.speed
      ..[12] = rand(1) * 80
      ..[13] = f.amp
      ..[14] = f.ambient ? 0.16 : 0.2 + _sb * 0.35 + beat * 0.18
      ..[15] = 5 + _sb * 1.2 + beat * 0.6;
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) => _p.paint(canvas, px, _cam, c.trio[1]);
}

/// Galaxy.tsx: 5000 points on 3 arms, vertex colours from the palette.
class GalaxyScene extends SceneDriver {
  static const _count = 5000, _arms = 3;
  final _pos = Float32List(_count * 3);
  final _base = Float32List(_count * 2);
  final _cols = List<Lin>.filled(_count, Lin.white);
  List<Lin>? _trio;
  double _rotY = 0, _rotX = 0.45, _size = 0.022, _opacity = 0.8;
  final _batch = TriBatch(_count * 6);
  final _cam = Cam(const V3(0, 0, 4.4), const V3(0, 0, 0));

  GalaxyScene() {
    final r = math.Random(3);
    for (var i = 0; i < _count; i++) {
      final t = math.pow(r.nextDouble(), 0.65) * 3.4;
      final arm = i % _arms;
      final jitter = (r.nextDouble() - 0.5) * (0.5 - t * 0.09);
      final angle = t * 2.1 + (arm * math.pi * 2) / _arms + jitter;
      final y = (r.nextDouble() - 0.5) * 0.32 * (1.4 - t / 3.4);
      _pos[i * 3] = math.cos(angle) * t;
      _pos[i * 3 + 1] = y;
      _pos[i * 3 + 2] = math.sin(angle) * t;
      _base[i * 2] = t / 3.4;
      _base[i * 2 + 1] = r.nextDouble();
    }
  }

  @override
  double get density => 1.5;
  @override
  bool get hasOverlay => true;

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    if (!identical(_trio, c.trio)) {
      _trio = c.trio;
      for (var i = 0; i < _count; i++) {
        final frac = _base[i * 2], rnd = _base[i * 2 + 1];
        _cols[i] = frac < 0.25 ? c.trio[2].mix(Lin.white, 0.55 - frac) : c.trio[0].mix(c.trio[1], frac).mix(Lin.white, rnd * 0.18);
      }
    }
    final mid = f.ambient ? 0.08 + 0.04 * math.sin(f.elapsed * 0.3) : f.rawMid;
    final bass = f.ambient ? 0.14 : f.rawBass;
    final treble = f.ambient ? 0.06 : f.rawTreble;
    _rotY += f.rawDt * (0.06 + mid * 0.3 + f.beat * 0.1);
    _rotX = 0.45 + math.sin(f.elapsed * 0.1) * 0.06;
    _size = 0.02 + bass * 0.022 + f.beat * 0.012;
    _opacity = f.ambient ? 0.5 : 0.75 + treble * 0.25;
    u.params
      ..[0] = 0
      ..[1] = 3 * c.density
      ..[2] = 1.0;
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {
    _cam.setup(px);
    _batch.clear();
    final m = M3.euler(_rotX, _rotY, 0);
    final scale = px.height / 2;
    for (var i = 0; i < _count; i++) {
      final w = m.apply(V3(_pos[i * 3], _pos[i * 3 + 1], _pos[i * 3 + 2]));
      final d = _cam.depthOf(w);
      if (d < 0.2) continue;
      final p = _cam.project(w, d);
      final s = math.max(0.6, _size * scale / d);
      _batch.square(p.dx, p.dy, s / 2, (_cols[i] * _opacity).argb());
    }
    _batch.draw(canvas, blend: BlendMode.plus);
  }
}

/// Waves.tsx: 220 points on a ring pushed out by the spectrum.
class WavesScene extends SceneDriver {
  static const _bins = 220;
  final _smoothed = Float32List(_bins);
  double _rotZ = 0, _rotX = -0.35, _size = 0.035, _elapsed = 0;
  final _batch = TriBatch(_bins * 6);
  final _cam = Cam(const V3(0, 0, 4.4), const V3(0, 0, 0));

  @override
  double get density => 1.5;
  @override
  bool get hasOverlay => true;

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    _elapsed = f.elapsed;
    var sum = 0.0;
    for (var i = 0; i < _bins; i++) {
      if (f.ambient) {
        _smoothed[i] = 0.12 + 0.08 * math.sin(_elapsed * 0.6 + (i / _bins) * math.pi * 4) + 0.05 * math.sin(_elapsed * 0.35 + i * 0.12);
      } else {
        final v = math.pow(synthSpectrum(i / _bins, i, f), 1.3).toDouble();
        _smoothed[i] += (v - _smoothed[i]) * math.min(1, f.rawDt * 14);
      }
      sum += _smoothed[i];
    }
    _rotZ += f.rawDt * 0.08;
    _rotX = -0.35 + math.sin(_elapsed * 0.15) * 0.08;
    _size = 0.03 + sum / _bins * 0.05;
    u.params
      ..[0] = 0
      ..[1] = 4 * c.density
      ..[2] = 1.0;
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {
    _cam.setup(px);
    _batch.clear();
    final m = M3.euler(_rotX, 0, _rotZ);
    final ci = (c.trio[1] * 0.9).argb();
    final scale = px.height / 2;
    for (var i = 0; i < _bins; i++) {
      final angle = (i / _bins) * math.pi * 2;
      final r = 1.45 + _smoothed[i] * 1.15;
      final w = m.apply(V3(math.cos(angle) * r, math.sin(angle) * r * 0.62, math.sin(angle * 2 + _elapsed * 0.4) * 0.12));
      final d = _cam.depthOf(w);
      final p = _cam.project(w, d);
      _batch.square(p.dx, p.dy, math.max(0.6, _size * scale / d) / 2, ci);
    }
    _batch.draw(canvas, blend: BlendMode.plus);
  }
}

/// Tunnel.tsx: 64 thin tori (radius 1.15, tube .03) rushing at the camera.
/// Each torus faces the camera, so it projects to a circle.
class TunnelScene extends SceneDriver {
  static const _count = 64, _spacing = 1.35, _total = _count * _spacing;
  double _scroll = 0, _bass = 0;
  final _cam = Cam(const V3(0, 0, 2.2), const V3(0, 0, -30));

  @override
  double get density => 1.5;
  @override
  bool get hasOverlay => true;

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    _bass = f.rawBass;
    _scroll += f.rawDt * (2.2 + _bass * 5.5);
    u.params
      ..[0] = 1
      ..[1] = 5 * c.density
      ..[2] = 1.2;
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {
    _cam.setup(px);
    final rings = <List<double>>[];
    for (var i = 0; i < _count; i++) {
      final wrapped = (((i * _spacing + _scroll) % _total) + _total) % _total;
      final z = 2.2 - wrapped;
      final depth = 2.2 - z;
      if (depth < 0.25) continue;
      final prox = math.max(0.0, 1 - (z + 4).abs() / 16);
      final s = 0.9 + _bass * 0.55 + prox * 0.65;
      rings.add([depth, i.toDouble(), z, s]);
    }
    rings.sort((a, b) => b[0].compareTo(a[0]));
    final paint = Paint()..style = PaintingStyle.stroke;
    for (final r in rings) {
      final i = r[1].toInt();
      final center = _cam.project(V3(math.sin(i * 0.7) * 0.35, math.cos(i * 0.9) * 0.35, r[2]), r[0]);
      final radius = _cam.pixels(1.15 * r[3], r[0]);
      paint
        ..strokeWidth = math.max(0.8, _cam.pixels(0.06 * r[3], r[0]))
        ..color = Color(c.trio[i % 3].argb(0.85));
      canvas.drawCircle(center, radius, paint);
    }
  }
}

/// Spectrum.tsx: circular city of mirrored FFT bars (the floor is in
/// spectrum.frag). The mobile app has no live FFT: synthSpectrum().
class SpectrumScene extends SceneDriver {
  static const _count = 128, _bins = 96, _radius = 1.55;
  final _heights = Float32List(_count);
  double _orbit = 0.4, _beat = 0, _ringR = _radius;
  final _cam = Cam(const V3(0, 3, 5), const V3(0, 0.3, 0));
  bool _placed = false;
  final _bars = TriBatch(_count * 30);
  final _mirror = TriBatch(_count * 30);

  @override
  double get density => 1.5;
  @override
  bool get hasOverlay => true;

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    final half = _count / 2;
    for (var i = 0; i < _count; i++) {
      final k = i < half ? i : _count - 1 - i;
      final bin = math.min(_bins - 1, (k / half * _bins * 0.92).floor());
      final spec = f.ambient
          ? 0.18 + 0.12 * math.sin(f.time * 0.9 + bin * 0.21) * math.sin(f.time * 0.37 + bin * 0.05)
          : synthSpectrum(bin / _bins, bin, f);
      final v = math.pow(spec.clamp(0.0, 1.0), 1.4) * (1 + (bin / _bins) * 0.9) * f.amp;
      final fall = f.rawDt * (f.reduced ? 0.6 : 1.3);
      _heights[i] = v > _heights[i] ? _heights[i] + (v - _heights[i]) * math.min(1, f.rawDt * 9) : math.max(v, _heights[i] - fall).toDouble();
    }
    _beat = f.beat;
    _ringR = _radius * (1 + f.beat * 0.035);
    _orbit += f.dt * (0.07 + f.mix * 0.6);
    final dist = 4.9 / math.min(1, math.max(0.5, c.aspect * 1.6));
    final o = _orbit;
    final to = V3(math.sin(o) * dist, 2.2 + math.sin(o * 0.7) * 0.25 + dist * 0.14, math.cos(o) * dist);
    if (!_placed) {
      _cam.pos = to;
      _placed = true;
    }
    easeCamera(_cam, to, f.rawDt, const V3(0, 0.3, 0));
    u.params
      ..[0] = _cam.pos.x
      ..[1] = _cam.pos.y
      ..[2] = _cam.pos.z
      ..[3] = _ringR
      ..[4] = 0
      ..[5] = 0.3
      ..[6] = 0;
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {
    _cam.setup(px);
    _bars.clear();
    _mirror.clear();
    final a = c.trio[0], b = c.trio[1], cc = c.trio[2];
    final width = (math.pi * 2 * _ringR) / _count * 0.62;
    final order = List<int>.generate(_count, (i) => i);
    final depths = Float32List(_count);
    for (var i = 0; i < _count; i++) {
      final ang = (i / _count) * math.pi * 2 + math.pi / 2;
      depths[i] = _cam.depthOf(V3(math.cos(ang) * _ringR, 0, math.sin(ang) * _ringR));
    }
    order.sort((x, y) => depths[y].compareTo(depths[x]));
    for (final i in order) {
      final lvl = _heights[i];
      final h = 0.04 + lvl * 1.05;
      final ang = (i / _count) * math.pi * 2 + math.pi / 2;
      final side = 0.5 + 0.5 * math.cos((i / _count) * math.pi * 2);
      final low = a.mix(cc, side);
      final gain = 0.3 + lvl * 0.85 + _beat * 0.2;
      Lin colAt(double vy) {
        var col = (low * 0.18).mix(b, math.pow(vy, 1.4).toDouble()) * gain;
        if (vy > 0.95) col = col + b.mix(Lin.white, 0.5) * ((vy - 0.95) / 0.05 * (0.15 + lvl * 0.6));
        return col;
      }

      // Box axes: rotation.y = -a puts local x along (cos a, 0, sin a)... the
      // web box is square in plan, so only its orientation matters.
      final ux = V3(math.cos(ang), 0, math.sin(ang)) * (width / 2);
      final uz = V3(-math.sin(ang), 0, math.cos(ang)) * (width / 2);
      final center = V3(math.cos(ang) * _ringR, 0, math.sin(ang) * _ringR);
      for (var mirror = 0; mirror < 2; mirror++) {
        final sgn = mirror == 0 ? 1.0 : -1.0;
        final batch = mirror == 0 ? _bars : _mirror;
        const rows = [0.0, 0.5, 1.0];
        int colorOf(double vy) {
          final col = colAt(vy);
          if (mirror == 0) return col.argb();
          final fade = math.exp(-vy * 4) * 0.28;
          return (col * fade).argb(fade);
        }

        // 4 side faces, keep the ones facing the camera.
        final faces = [
          [ux, uz],
          [ux * -1, uz * -1],
          [uz, ux * -1],
          [uz * -1, ux],
        ];
        for (final fc in faces) {
          final n = fc[0], t = fc[1];
          final fcenter = center + n + V3(0, sgn * h / 2, 0);
          if (n.dot(_cam.pos - fcenter) <= 0) continue;
          for (var r = 0; r < 2; r++) {
            final y0 = rows[r] * h * sgn, y1 = rows[r + 1] * h * sgn;
            final p0 = _cam.project(center + n + t + V3(0, y0, 0));
            final p1 = _cam.project(center + n - t + V3(0, y0, 0));
            final p2 = _cam.project(center + n - t + V3(0, y1, 0));
            final p3 = _cam.project(center + n + t + V3(0, y1, 0));
            final c0 = colorOf(rows[r]), c1 = colorOf(rows[r + 1]);
            batch.quad(p0, p1, p2, p3, c0, c0, c1, c1);
          }
        }
        if (mirror == 0) {
          final top = V3(0, h, 0);
          final ct = colorOf(1);
          batch.quad(_cam.project(center + ux + uz + top), _cam.project(center + ux - uz + top), _cam.project(center - ux - uz + top),
              _cam.project(center - ux + uz + top), ct, ct, ct, ct);
        }
      }
    }
    _mirror.draw(canvas, blend: BlendMode.plus);
    _bars.draw(canvas);
  }
}

/// Vinyl.tsx: platter spin (33 1/3 rpm, motor ramp), needle on the playback
/// position, tilted group; record/halo/platter in vinyl.frag, tonearm here.
class VinylScene extends SceneDriver {
  static const _pivot = [1.62, 1.18], _arm = 1.95, _recordR = 1.5;
  double _angle = 0, _speed = 0, _armRot = -2.2;
  double _scale = 0.84, _gx = -0.02, _rx = -0.92, _rz = 0.12;
  final _cam = Cam(const V3(0, 0.15, 4.4), const V3(0, -0.05, 0));
  final _batch = TriBatch(512);

  @override
  double get bloom => 0.55;
  @override
  double get density => 1.4;
  @override
  bool get hasOverlay => true;
  @override
  bool get hasCover => true;

  static double _armAngle(double px, double py, double length, double target) {
    final d = math.sqrt(px * px + py * py);
    final c = (target * target - d * d - length * length) / (2 * length);
    final phi = math.atan2(py, px);
    return phi - math.acos((c / d).clamp(-1.0, 1.0));
  }

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    final target = c.playing || f.ambient ? (33.333 / 60) * math.pi * 2 * (f.ambient ? 0.5 : 1) * (1 - f.mix * 0.12) : 0.0;
    _speed += (target - _speed) * math.min(1, f.rawDt * (target > _speed ? 2.5 : 0.9));
    _angle += _speed * f.rawDt * f.speed;
    final needle = 0.94 - c.progress.clamp(0.0, 1.0) * 0.56;
    final theta = _armAngle(_pivot[0], _pivot[1], _arm, needle * _recordR);
    _armRot += (theta - math.pi / 2 - _armRot) * math.min(1, f.rawDt * 3);
    final fit = math.min(1.0, c.aspect * 0.95);
    _scale = fit * 0.84 * (1 + f.beat * 0.012);
    _gx = c.aspect < 1 ? -0.02 : -0.12;
    _rx = -0.92 + math.sin(f.time * 0.2) * 0.04;
    _rz = 0.12 + math.sin(f.time * 0.13) * 0.03;

    u.setMat3(0, M3.euler(_rx, 0, _rz).transposed.glsl);
    var sx = 1.0, sy = 1.0;
    final cover = c.cover;
    if (cover != null) {
      final w = cover.width.toDouble(), h = cover.height.toDouble();
      sx = w > h ? h / w : 1;
      sy = h > w ? w / h : 1;
    }
    u.params
      ..[9] = _scale
      ..[10] = _gx
      ..[11] = sx
      ..[12] = _angle
      ..[13] = needle
      ..[14] = cover != null ? 1 : 0
      ..[15] = sy;
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {
    _cam.setup(px);
    _batch.clear();
    final g = M3.euler(_rx, 0, _rz);
    final gp = V3(_gx, -0.1, 0);
    final ca = math.cos(_armRot), sa = math.sin(_armRot);
    V3 world(double x, double y, double z) {
      // Arm group: rotation z then pivot offset, then the turntable group.
      final ax = x * ca - y * sa, ay = x * sa + y * ca;
      return gp + g.apply(V3(_pivot[0] + ax, _pivot[1] + ay, 0.1 + z)) * _scale;
    }

    V3 base(double x, double y, double z) => gp + g.apply(V3(_pivot[0] + x, _pivot[1] + y, 0.1 + z)) * _scale;
    final dark = const Lin(0.012, 0.013, 0.018).argb();
    final darkTop = const Lin(0.03, 0.031, 0.04).argb();
    final metal = const Lin(0.62, 0.64, 0.7).argb();
    final metalShade = const Lin(0.3, 0.31, 0.36).argb();

    // Pivot base: cylinder (r .16 top / .19 bottom, height .12) along z.
    const segs = 28;
    for (var i = 0; i < segs; i++) {
      final a0 = i / segs * math.pi * 2, a1 = (i + 1) / segs * math.pi * 2;
      final b0 = _cam.project(base(math.cos(a0) * 0.19, math.sin(a0) * 0.19, -0.06));
      final b1 = _cam.project(base(math.cos(a1) * 0.19, math.sin(a1) * 0.19, -0.06));
      final t0 = _cam.project(base(math.cos(a0) * 0.16, math.sin(a0) * 0.16, 0.06));
      final t1 = _cam.project(base(math.cos(a1) * 0.16, math.sin(a1) * 0.16, 0.06));
      _batch.quad(b0, b1, t1, t0, dark, dark, dark, dark);
    }
    final topC = _cam.project(base(0, 0, 0.06));
    for (var i = 0; i < segs; i++) {
      final a0 = i / segs * math.pi * 2, a1 = (i + 1) / segs * math.pi * 2;
      final t0 = _cam.project(base(math.cos(a0) * 0.16, math.sin(a0) * 0.16, 0.06));
      final t1 = _cam.project(base(math.cos(a1) * 0.16, math.sin(a1) * 0.16, 0.06));
      _batch.quad(topC, t0, t1, t1, darkTop, darkTop, darkTop, darkTop);
    }
    double widthAt(V3 w, double r) => _cam.pixels(r * 2 * _scale, _cam.depthOf(w));
    // Counterweight (r .09, length .2 along the arm, behind the pivot).
    final w0 = world(0, -0.32, 0.08), w1 = world(0, -0.12, 0.08);
    _batch.line(_cam.project(w0), _cam.project(w1), widthAt(w0, 0.09), metalShade, metal);
    // Tube.
    final a0 = world(0, 0, 0.08), a1 = world(0, _arm, 0.08);
    _batch.line(_cam.project(a0), _cam.project(a1), math.max(1.5, widthAt(a0, 0.022)), metal, metal);
    // Headshell box .1 x .22 x .06 (top face + a shaded side).
    final h0 = world(-0.05, _arm - 0.11, 0.09), h1 = world(0.05, _arm - 0.11, 0.09);
    final h2 = world(0.05, _arm + 0.11, 0.09), h3 = world(-0.05, _arm + 0.11, 0.09);
    final s0 = world(-0.05, _arm - 0.11, 0.03), s3 = world(-0.05, _arm + 0.11, 0.03);
    _batch.quad(_cam.project(s0), _cam.project(h0), _cam.project(h3), _cam.project(s3), metalShade, metalShade, metalShade, metalShade);
    _batch.quad(_cam.project(h0), _cam.project(h1), _cam.project(h2), _cam.project(h3), metal, metal, metal, metal);
    _batch.draw(canvas);
  }
}

/// Mosaic.tsx: the cover broken into 34x34 tiles. The vertex shader maths
/// (spectrum level by distance, kick wave, flip, per-tile rotation, light)
/// run per tile in Dart; faces are projected and drawn textured.
class MosaicScene extends SceneDriver {
  static const _grid = 34, _bins = 64, _extent = 2.5;
  final _levels = Float32List(_bins);
  double _wave = 1, _flip = 0, _time = 0, _beat = 0, _energy = 0, _treble = 0;
  double _gsc = 1, _grx = 0, _gry = 0;
  final _cam = Cam(const V3(0, 0, 4.4), const V3(0, 0, 0));
  final _sides = TriBatch(_grid * _grid * 12);
  final _fronts = TriBatch(_grid * _grid * 6);
  final _glow = TriBatch(1024);
  ui.Image? _shaderImage;
  ImageShader? _shader;

  @override
  double get bloom => 0.45;
  @override
  double get density => 1.5;
  @override
  bool get hasOverlay => true;

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    for (var i = 0; i < _bins; i++) {
      final s = f.ambient ? 0.12 + 0.1 * math.sin(f.time * 0.8 - i * 0.18) : synthSpectrum(i / _bins, i, f);
      final target = math.min(1.0, s * f.amp * (1 + i / _bins));
      _levels[i] += (target - _levels[i]) * math.min(1, f.rawDt * 12);
    }
    if (f.kick && !f.reduced) _wave = 0;
    _wave = math.min(1, _wave + f.rawDt * 1.1);
    final flipTarget = ((f.time / 20).floor() % 2).toDouble();
    _flip += (flipTarget - _flip) * math.min(1, f.dt * 0.9);
    _time = f.time;
    _beat = f.beat;
    _energy = f.energy * f.amp;
    _treble = f.treble * f.amp;
    _gsc = math.min(1, c.aspect * 1.05);
    _grx = -0.18 + math.sin(f.time * 0.23) * 0.06;
    _gry = math.sin(f.time * 0.17) * 0.12;
    u.params
      ..[0] = 1
      ..[1] = 4 * c.density
      ..[2] = 0.5;
  }

  double _spec(double x) {
    final p = (x * _bins - 0.5).clamp(0.0, _bins - 1.0);
    final i = p.floor(), fr = p - i;
    return _levels[i] + (_levels[math.min(_bins - 1, i + 1)] - _levels[i]) * fr;
  }

  static double _smooth(double e0, double e1, double x) {
    final t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    return t * t * (3 - 2 * t);
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {
    _cam.setup(px);
    _sides.clear();
    _fronts.clear();
    _glow.clear();
    final cover = c.cover;
    if (!identical(cover, _shaderImage)) {
      _shaderImage = cover;
      _shader = cover == null ? null : ImageShader(cover, TileMode.clamp, TileMode.clamp, Float64List.fromList([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    }
    var sx = 1.0, sy = 1.0;
    if (cover != null) {
      final w = cover.width.toDouble(), h = cover.height.toDouble();
      sx = w > h ? h / w : 1;
      sy = h > w ? w / h : 1;
    }
    final grp = M3.euler(_grx, _gry, 0);
    const tileUnit = _extent / _grid;
    final light = const V3(-0.4, 0.5, 0.8).normalized;
    final a = c.trio[0], b = c.trio[1], cc = c.trio[2];
    final tiles = <List<double>>[];
    for (var y = 0; y < _grid; y++) {
      for (var x = 0; x < _grid; x++) {
        final cx = (x + 0.5) / _grid - 0.5, cy = (y + 0.5) / _grid - 0.5;
        final cpos = grp.apply(V3(cx * _extent, cy * _extent, 0)) * _gsc;
        tiles.add([_cam.depthOf(cpos), cx, cy]);
      }
    }
    tiles.sort((p, q) => q[0].compareTo(p[0]));
    for (final t in tiles) {
      final cx = t[1], cy = t[2];
      final d = (math.sqrt(cx * cx + cy * cy) * 1.414).clamp(0.0, 1.0);
      final lvl = _spec(0.02 + d * 0.9);
      final wave = math.exp(-math.pow((d - _wave * 1.3) * 5.0, 2)) * (1 - _wave);
      final n = math.sin(cx * 9 + _time * 0.7) * math.cos(cy * 7 - _time * 0.5);
      final s = tileUnit * (0.9 - _beat * 0.14 + lvl * 0.06);
      final zs = tileUnit * 0.45;
      final dl = math.sqrt(cx * cx + cy * cy) + 1e-9;
      final dirx = cx / dl, diry = cy / dl;
      final k = wave * 1.4 + lvl * 0.35 + n * 0.08;
      final ax = -diry * k;
      final ay = dirx * k + 6.2831853 * _smooth(0, 1, (_flip * 2 - d).clamp(0.0, 1.0));
      // rot() of the vertex shader: ry * rx.
      final r = M3.euler(0, ay, 0) * M3.euler(ax, 0, 0);
      final center = V3(cx * _extent * (1 + _energy * 0.07 + wave * 0.05), cy * _extent * (1 + _energy * 0.07 + wave * 0.05), lvl * 0.55 + wave * 0.35 + n * 0.04);
      V3 corner(double px, double py, double pz) => grp.apply(center + r.apply(V3(px * s, py * s, pz * zs))) * _gsc;
      Offset proj(V3 w) => _cam.project(w);
      final bright = 0.75 + lvl * 0.9;
      // Faces: normal, then 4 corners in local (x, y, z) of the unit box.
      final faces = <List<double>>[
        [0, 0, 1, -.5, -.5, .5, .5, -.5, .5, .5, .5, .5, -.5, .5, .5],
        [0, 0, -1, -.5, .5, -.5, .5, .5, -.5, .5, -.5, -.5, -.5, -.5, -.5],
        [1, 0, 0, .5, -.5, .5, .5, -.5, -.5, .5, .5, -.5, .5, .5, .5],
        [-1, 0, 0, -.5, -.5, -.5, -.5, -.5, .5, -.5, .5, .5, -.5, .5, -.5],
        [0, 1, 0, -.5, .5, .5, .5, .5, .5, .5, .5, -.5, -.5, .5, -.5],
        [0, -1, 0, -.5, -.5, -.5, .5, -.5, -.5, .5, -.5, .5, -.5, -.5, .5],
      ];
      for (final fc in faces) {
        final nLocal = V3(fc[0], fc[1], fc[2]);
        final n3 = r.apply(nLocal);
        final nWorld = grp.apply(n3);
        final fcen = corner(fc[0] * 0.5, fc[1] * 0.5, fc[2] * 0.5);
        if (nWorld.dot(_cam.pos - fcen) <= 0) continue;
        final vLight = 0.45 + 0.55 * math.max(0.0, n3.dot(light));
        final front = fc[2] > 0.5;
        final ps = <Offset>[];
        final uvs = <Offset>[];
        for (var k2 = 0; k2 < 4; k2++) {
          final lx = fc[3 + k2 * 3], ly = fc[4 + k2 * 3], lz = fc[5 + k2 * 3];
          ps.add(proj(corner(lx, ly, lz)));
          // vUv = aCell + 0.5 + position.xy / uGrid.
          uvs.add(Offset(cx + 0.5 + lx / _grid, cy + 0.5 + ly / _grid));
        }
        if (front) {
          final shade = vLight * bright;
          if (_shader != null) {
            final g = Lin(shade, shade, shade).argb();
            final img = cover!;
            Offset tex(Offset uv) => Offset(((uv.dx - 0.5) * sx + 0.5) * img.width, (1 - ((uv.dy - 0.5) * sy + 0.5)) * img.height);
            _fronts.texQuad(ps[0], ps[1], ps[2], ps[3], tex(uvs[0]), tex(uvs[1]), tex(uvs[2]), tex(uvs[3]), g, g, g, g);
          } else {
            int art(Offset uv) {
              final gg = uv.dx * 0.6 + uv.dy * 0.4 + 0.08 * math.sin(uv.dy * 9 + _time * 0.3);
              final col = a.mix(b, _smooth(0.1, 0.6, gg)).mix(cc, _smooth(0.55, 1.0, gg));
              return (col * shade).argb();
            }

            _sides.quad(ps[0], ps[1], ps[2], ps[3], art(uvs[0]), art(uvs[1]), art(uvs[2]), art(uvs[3]));
          }
          final add = b.mix(Lin.white, 0.4) * (wave * 0.45) + Lin.white * (lvl * lvl * _treble * 0.6);
          if (add.r + add.g + add.b > 0.02) {
            final ai = add.argb();
            _glow.quad(ps[0], ps[1], ps[2], ps[3], ai, ai, ai, ai);
          }
        } else {
          int side(Offset uv) => (a.mix(cc, uv.dy) * (0.25 * vLight * bright)).argb();
          _sides.quad(ps[0], ps[1], ps[2], ps[3], side(uvs[0]), side(uvs[1]), side(uvs[2]), side(uvs[3]));
        }
      }
    }
    _sides.draw(canvas);
    if (_shader != null) _fronts.draw(canvas, shader: _shader);
    _glow.draw(canvas, blend: BlendMode.plus);
  }
}

/// Constellation.tsx: drifting star cloud that gathers into the cover's
/// Sobel contours (or a seeded rose), links between close stars.
class ConstellationScene extends SceneDriver {
  static const _count = 230, _maxLinks = 1400, _shapeR = 1.35;
  final _cloud = Float32List(_count * 4);
  final _sizes = Float32List(_count);
  final _arr = Float32List(_count * 3);
  Float32List _shape = Float32List(_count * 3);
  List<Lin>? _shapeCols;
  final _cols = List<Lin>.filled(_count, Lin.white);
  double _scatter = 0, _rot = 0, _gather = 0, _time = 0, _treble = 0, _beat = 0, _gain = 0, _thr = 0.36;
  final _cam = Cam(const V3(0, 0, 4.4), const V3(0, 0, 0));
  final _lines = TriBatch(_maxLinks * 6);
  Object? _shapeKey;
  bool _sampling = false;
  ui.Image? _sprite;

  ConstellationScene() {
    final r = math.Random(9);
    for (var i = 0; i < _count; i++) {
      final u = r.nextDouble() * 2 - 1;
      final th = r.nextDouble() * math.pi * 2;
      final rr = 0.9 + math.sqrt(r.nextDouble()) * 1.4;
      final s = math.sqrt(1 - u * u);
      _cloud[i * 4] = s * math.cos(th) * rr * 1.35;
      _cloud[i * 4 + 1] = u * rr * 0.8;
      _cloud[i * 4 + 2] = s * math.sin(th) * rr;
      _cloud[i * 4 + 3] = r.nextDouble() * 100;
      _sizes[i] = 0.35 + math.pow(r.nextDouble(), 3) * 0.9;
    }
  }

  @override
  double get density => 1.5;
  @override
  bool get hasOverlay => true;

  void _fallback(int seed) {
    final petals = 3 + (seed % 5);
    _shape = Float32List(_count * 3);
    for (var i = 0; i < _count; i++) {
      final t = (i / _count) * math.pi * 2;
      final inner = i % 4 == 0;
      final r = inner ? 0.45 : 0.75 + 0.45 * math.cos(petals * t);
      _shape[i * 3] = math.cos(t * (inner ? 4 : 1)) * r * _shapeR * 0.8;
      _shape[i * 3 + 1] = math.sin(t * (inner ? 4 : 1)) * r * _shapeR * 0.8;
    }
    _shapeCols = null;
  }

  Future<void> _sampleCover(ui.Image img) async {
    _sampling = true;
    try {
      final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (data == null) return;
      final px = data.buffer.asUint8List();
      const S = 96;
      final w = img.width, h = img.height;
      final side = math.min(w, h);
      final ox = (w - side) / 2, oy = (h - side) / 2;
      final lum = Float32List(S * S);
      final rgb = Uint8List(S * S * 3);
      for (var y = 0; y < S; y++) {
        for (var x = 0; x < S; x++) {
          final sx = (ox + (x + 0.5) / S * side).floor().clamp(0, w - 1);
          final sy = (oy + (y + 0.5) / S * side).floor().clamp(0, h - 1);
          final o = (sy * w + sx) * 4;
          final i = y * S + x;
          rgb[i * 3] = px[o];
          rgb[i * 3 + 1] = px[o + 1];
          rgb[i * 3 + 2] = px[o + 2];
          lum[i] = (px[o] * 0.299 + px[o + 1] * 0.587 + px[o + 2] * 0.114) / 255;
        }
      }
      final rnd = math.Random(img.width * 31 + img.height);
      final cand = <List<double>>[];
      for (var y = 1; y < S - 1; y++) {
        for (var x = 1; x < S - 1; x++) {
          double at(int dx, int dy) => lum[(y + dy) * S + x + dx];
          final gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
          final gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
          final wv = math.sqrt(gx * gx + gy * gy) + at(0, 0) * 0.05;
          if (wv > 0.12) cand.add([(y * S + x).toDouble(), wv * (0.5 + rnd.nextDouble())]);
        }
      }
      if (cand.length < _count * 0.5) return;
      cand.sort((p, q) => q[1].compareTo(p[1]));
      final minD = (S / math.sqrt(_count)) * 0.55;
      final picked = <int>[];
      for (final cnd in cand) {
        if (picked.length >= _count) break;
        final i = cnd[0].toInt();
        final x = i % S, y = i ~/ S;
        var ok = true;
        for (final p in picked) {
          final dx = p % S - x, dy = p ~/ S - y;
          if (dx * dx + dy * dy < minD * minD) {
            ok = false;
            break;
          }
        }
        if (ok) picked.add(i);
      }
      for (var k = 0; picked.length < _count && k < cand.length; k++) {
        final i = cand[k][0].toInt();
        if (!picked.contains(i)) picked.add(i);
      }
      final shape = Float32List(_count * 3);
      final cols = <Lin>[];
      for (var k = 0; k < picked.length && k < _count; k++) {
        final p = picked[k];
        shape[k * 3] = ((p % S) / S - 0.5) * 2 * _shapeR;
        shape[k * 3 + 1] = -((p ~/ S) / S - 0.5) * 2 * _shapeR;
        shape[k * 3 + 2] = (rnd.nextDouble() - 0.5) * 0.12;
        // Lift dark pixels so every star glows (HSL lightness >= .45).
        final hsl = HSLColor.fromColor(Color.fromARGB(255, rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]));
        final lifted = hsl.withSaturation(math.min(1.0, hsl.saturation * 1.2)).withLightness(math.max(0.45, hsl.lightness)).toColor();
        cols.add(Lin.of(lifted));
      }
      while (cols.length < _count) {
        cols.add(Lin.white);
      }
      if (identical(_shapeKey, img)) {
        _shape = shape;
        _shapeCols = cols;
      }
    } catch (_) {
    } finally {
      _sampling = false;
    }
  }

  ui.Image _makeSprite() {
    const n = 64;
    final rec = ui.PictureRecorder();
    final cv = Canvas(rec);
    final paint = Paint();
    for (var r = n ~/ 2; r > 0; r--) {
      final d = r / n; // 0 .. .5
      double ss(double e0, double e1, double x) {
        final t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
        return t * t * (3 - 2 * t);
      }

      final core = ss(0.16, 0.02, d);
      final halo = math.exp(-d * d * 22) * 0.55;
      final a = ((core + halo) * ss(0.5, 0.35, d)).clamp(0.0, 1.0);
      // Additive with SrcAlpha: contribution = colour * a * a.
      paint.color = Color.fromARGB(255, 255, 255, 255).withValues(alpha: (a * a).clamp(0.0, 1.0));
      paint.blendMode = BlendMode.src;
      cv.drawCircle(const Offset(n / 2, n / 2), r.toDouble(), paint);
    }
    return rec.endRecording().toImageSync(n, n);
  }

  @override
  void update(AudioFrame f, SceneCtx c, CommonUniforms u) {
    final key = c.cover ?? c.seed;
    if (!identical(key, _shapeKey) && !_sampling) {
      _shapeKey = key;
      _fallback(c.seed);
      if (c.cover != null) _sampleCover(c.cover!);
    }
    for (var i = 0; i < _count; i++) {
      final sc = _shapeCols;
      _cols[i] = sc != null ? sc[i] : c.trio[i % 3];
    }
    if (f.kick && !f.reduced) _scatter = math.min(1, _scatter + 0.35);
    _scatter *= math.exp(-f.rawDt * 2.5);
    final phase = (f.time % 26) / 26;
    double ss(double x, double a, double b) {
      final t = ((x - a) / (b - a)).clamp(0.0, 1.0);
      return t * t * (3 - 2 * t);
    }

    _gather = ss(phase, 0.3, 0.45) * (1 - ss(phase, 0.82, 0.97)) * (1 - f.mix);
    _rot += f.dt * (0.08 + f.mid * 0.25) * (1 - _gather);
    final cr = math.cos(_rot), sr = math.sin(_rot);
    final t = f.time;
    for (var i = 0; i < _count; i++) {
      final cx = _cloud[i * 4], cy = _cloud[i * 4 + 1], cz = _cloud[i * 4 + 2], ph = _cloud[i * 4 + 3];
      final wx = cx + math.sin(t * 0.3 + ph) * 0.12;
      final wy = cy + math.cos(t * 0.25 + ph * 1.3) * 0.12;
      final rx = wx * cr - cz * sr;
      final rz = wx * sr + cz * cr;
      final jitter = _scatter * 0.25;
      final g = _gather * (1 - _scatter * 0.6);
      _arr[i * 3] = rx + (_shape[i * 3] - rx) * g + math.sin(ph * 7.1) * jitter;
      _arr[i * 3 + 1] = wy + (_shape[i * 3 + 1] - wy) * g + math.cos(ph * 5.3) * jitter;
      _arr[i * 3 + 2] = rz + (_shape[i * 3 + 2] - rz) * g;
    }
    _thr = 0.36 + f.mid * f.amp * 0.3 - _gather * 0.12;
    _gain = 0.35 + f.mid * 0.9 + f.beat * 0.4;
    _time = t;
    _treble = f.treble * f.amp;
    _beat = f.beat;
    u.params
      ..[0] = 0
      ..[1] = 4 * c.density
      ..[2] = 1.0;
  }

  @override
  void paintOverlay(Canvas canvas, Size px, SceneCtx c) {
    _cam.setup(px);
    _sprite ??= _makeSprite();
    final gs = math.min(1.0, c.aspect * 1.1);
    final pts = List<Offset>.filled(_count, Offset.zero);
    final dep = Float32List(_count);
    for (var i = 0; i < _count; i++) {
      final w = V3(_arr[i * 3], _arr[i * 3 + 1], _arr[i * 3 + 2]) * gs;
      dep[i] = _cam.depthOf(w);
      pts[i] = _cam.project(w, dep[i]);
    }
    // Links (1 device px wide WebGL lines, additive).
    _lines.clear();
    final thr = _thr, thr2 = thr * thr;
    final lw = math.max(1.0, c.density * 0.6);
    var links = 0;
    for (var i = 0; i < _count && links < _maxLinks; i++) {
      final ax = _arr[i * 3], ay = _arr[i * 3 + 1], az = _arr[i * 3 + 2];
      for (var j = i + 1; j < _count && links < _maxLinks; j++) {
        final dx = _arr[j * 3] - ax, dy = _arr[j * 3 + 1] - ay, dz = _arr[j * 3 + 2] - az;
        final d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > thr2) continue;
        final k = (1 - math.sqrt(d2) / thr) * _gain;
        _lines.line(pts[i], pts[j], lw, (_cols[i] * k).argb(), (_cols[j] * k).argb());
        links++;
      }
    }
    _lines.draw(canvas, blend: BlendMode.plus);

    // Stars: point sprites, gl_PointSize = aSize * uScale * (1 + beat*.6) * tw / depth.
    final img = _sprite!;
    final logicalH = c.size.height;
    final uScale = 150 * (logicalH / 900 * 0.6 + 0.4) * c.density;
    final rst = Float32List(_count * 4);
    final rects = Float32List(_count * 4);
    final colors = Int32List(_count);
    for (var i = 0; i < _count; i++) {
      final sz = _sizes[i];
      final tw = 0.75 + 0.25 * math.sin(_time * (2 + sz * 5) + sz * 60) * (0.4 + _treble * 2);
      final pxSize = sz * uScale * (1 + _beat * 0.6) * tw / dep[i];
      final scos = pxSize / img.width;
      rst[i * 4] = scos;
      rst[i * 4 + 1] = 0;
      rst[i * 4 + 2] = pts[i].dx - pxSize / 2;
      rst[i * 4 + 3] = pts[i].dy - pxSize / 2;
      rects[i * 4 + 2] = img.width.toDouble();
      rects[i * 4 + 3] = img.height.toDouble();
      colors[i] = (_cols[i].mix(Lin.white, 0.3) * tw).argb();
    }
    canvas.drawRawAtlas(img, rst, rects, colors, BlendMode.modulate, null, Paint()..blendMode = BlendMode.plus);
  }
}
