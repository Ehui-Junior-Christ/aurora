import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:provider/provider.dart';

import '../../core/models.dart';
import '../../player/player_controller.dart';
import '../../visuals/scenes.dart';
import '../../visuals/visual_kit.dart';

/// Fullscreen generative scene: the 15 scenes of the web app (shaders in
/// /shaders ported from src/components/scenes, geometry projected by the
/// drivers in lib/visuals/scenes.dart), tinted by the cover palette and
/// driven by bass / mid / treble + a beat pulse like the web kit.ts.
///
/// Each frame the scene is rendered offscreen at the mode's density (render
/// px per logical px), then stretched to the screen; the geometry overlay is
/// rendered first and sampled by the shader (linear-light compositing and
/// bloom approximation happen in the shader).
///
/// Performance: repaints at most 45 times per second while music plays (30
/// otherwise); the audio frame is still updated every vsync.
class VisualBackground extends StatefulWidget {
  const VisualBackground({super.key, this.homeMode = false});

  /// Start page: always the organism scene (ambient motion).
  final bool homeMode;

  @override
  State<VisualBackground> createState() => _VisualBackgroundState();
}

class _VisualBackgroundState extends State<VisualBackground> with SingleTickerProviderStateMixin {
  static final Map<String, ui.FragmentProgram> _programs = {};
  static ui.Image? _blank;
  late final Ticker _ticker;
  final _frame = ValueNotifier<int>(0);
  double _t = 0, _last = 0, _lastPaint = -1;
  final AudioFrame audio = AudioFrame();
  final CommonUniforms uniforms = CommonUniforms();
  SceneDriver? driver;
  VisualMode? _driverMode;
  /// Context of the last paint (size, palette...): drivers integrate their
  /// state every vsync with it, paints only render.
  SceneCtx? ctx;

  List<Color> _shown = const [Color(0xFF6D4DFF), Color(0xFF22E4FF), Color(0xFFFF4ECD)];
  List<Color> _from = const [Color(0xFF6D4DFF), Color(0xFF22E4FF), Color(0xFFFF4ECD)];
  double _paletteK = 1;
  List<Color>? _trioSrc;
  List<Lin> _trio = const [];

  /// Adaptive resolution (the web PerfGuard): scales every mode's density
  /// from the measured raster time, between 0.5 and 1.
  double quality = 1;
  double _rasterMs = 0, _lastQualityChange = 0;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_tick)..start();
    SchedulerBinding.instance.addTimingsCallback(_onTimings);
    _load();
  }

  void _onTimings(List<ui.FrameTiming> timings) {
    for (final t in timings) {
      final ms = t.rasterDuration.inMicroseconds / 1000;
      _rasterMs = _rasterMs == 0 ? ms : _rasterMs * 0.8 + ms * 0.2;
    }
    if (_t - _lastQualityChange < 0.8) return;
    if (_rasterMs > 24 && quality > 0.5) {
      quality = math.max(0.5, quality * 0.85);
      _lastQualityChange = _t;
    } else if (_rasterMs < 11 && quality < 1) {
      quality = math.min(1.0, quality * 1.08);
      _lastQualityChange = _t;
    }
  }

  VisualMode _modeOf(PlayerController p) => widget.homeMode ? VisualMode.organism : p.visualMode;

  void _tick(Duration elapsed) {
    _t = elapsed.inMicroseconds / 1e6;
    final dt = (_t - _last).clamp(0.0, 0.1);
    _last = _t;
    if (_paletteK < 1) _paletteK = (_paletteK + dt / 1.2).clamp(0, 1);
    final p = context.read<PlayerController>();
    final b = p.bandsNow(_t);
    audio.update(dt, _t, b.bass, b.mid, b.high, ambientMode: widget.homeMode, isPlaying: p.playing);
    final c = ctx, d = driver;
    if (c != null && d != null) {
      d.update(audio, c, uniforms..fromFrame(audio, c.seed));
    }
    if (_t - _lastPaint >= (p.playing ? 1 / 45 : 1 / 30) - 0.002) {
      _lastPaint = _t;
      _frame.value++;
    }
  }

  Future<void> _load() async {
    for (final m in {...VisualMode.values.map((m) => m.shader)}) {
      if (_programs.containsKey(m)) continue;
      try {
        _programs[m] = await ui.FragmentProgram.fromAsset('shaders/$m.frag');
      } catch (e) {
        debugPrint('shader $m: $e');
      }
    }
    if (_blank == null) {
      final rec = ui.PictureRecorder();
      Canvas(rec).drawRect(const Rect.fromLTWH(0, 0, 2, 2), Paint()..color = const Color(0x00000000));
      _blank = rec.endRecording().toImageSync(2, 2);
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    SchedulerBinding.instance.removeTimingsCallback(_onTimings);
    _ticker.dispose();
    _frame.dispose();
    super.dispose();
  }

  List<Color> _paletteNow(List<Color> target) {
    if (!identical(target, _shown)) {
      _from = [for (var i = 0; i < 3; i++) Color.lerp(_from[i], _shown[i], _paletteK)!];
      _shown = target;
      _paletteK = 0;
    }
    final k = Curves.easeInOut.transform(_paletteK);
    return [for (var i = 0; i < 3; i++) Color.lerp(_from[i], _shown[i], k)!];
  }

  /// Linear palette (identical list while it does not change, so drivers can
  /// cache per-palette work).
  List<Lin> trioNow(List<Color> palette) {
    final now = _paletteNow(palette);
    final src = _trioSrc;
    if (src == null || _paletteK < 1 || src.length != 3 || src[0] != now[0] || src[1] != now[1] || src[2] != now[2]) {
      _trioSrc = now;
      _trio = [for (final c in now) Lin.of(c)];
    }
    return _trio;
  }

  /// Test builds only (`--dart-define=AURORA_NO_VISUALS=true`): a flat
  /// background, for slow software-rendered emulators. Off in real builds.
  static const _noVisuals = bool.fromEnvironment('AURORA_NO_VISUALS');

  @override
  Widget build(BuildContext context) {
    if (_noVisuals) return const ColoredBox(color: Color(0xFF15122E));
    final p = context.watch<PlayerController>();
    final mode = _modeOf(p);
    if (_driverMode != mode) {
      _driverMode = mode;
      driver = SceneDriver.create(mode);
    }
    final program = _programs[mode.shader];
    if (program == null || _blank == null) return const ColoredBox(color: Color(0xFF06060B));
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 650),
      child: RepaintBoundary(
        key: ValueKey(mode),
        child: CustomPaint(
          size: Size.infinite,
          painter: _ScenePainter(
            repaint: _frame,
            program: program,
            driver: driver!,
            state: this,
            cover: p.coverImage,
            palette: widget.homeMode ? const [Color(0xFF6D4DFF), Color(0xFF22E4FF), Color(0xFFFF4ECD)] : p.palette,
            seed: widget.homeMode ? 0 : (p.current?.seed ?? 0),
            progress: p.duration.inMilliseconds > 0 ? p.position.inMilliseconds / p.duration.inMilliseconds : 0,
            playing: p.playing,
          ),
        ),
      ),
    );
  }
}

class _ScenePainter extends CustomPainter {
  _ScenePainter({
    required Listenable repaint,
    required this.program,
    required this.driver,
    required this.state,
    required this.cover,
    required this.palette,
    required this.seed,
    required this.progress,
    required this.playing,
  }) : super(repaint: repaint);
  final ui.FragmentProgram program;
  final SceneDriver driver;
  final _VisualBackgroundState state;
  final ui.Image? cover;
  final List<Color> palette;
  final int seed;
  final double progress;
  final bool playing;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final dpr = ui.PlatformDispatcher.instance.views.first.devicePixelRatio;
    final density = math.min(driver.density * state.quality, dpr);
    final ctx = SceneCtx(
      size: size,
      density: density,
      trio: state.trioNow(palette),
      seed: seed,
      cover: cover,
      progress: progress,
      playing: playing,
    );
    final u = state.uniforms;
    if (!identical(state.ctx?.cover, cover) || state.ctx == null || state.ctx!.size != size || state.ctx!.seed != seed) {
      // First frame of this context: prime the driver once.
      state.ctx = ctx;
      driver.update(state.audio, ctx, u..fromFrame(state.audio, seed));
    }
    state.ctx = ctx;
    final img = renderScene(program, driver, ctx, u, _VisualBackgroundState._blank!);
    if (img == null) return;
    final rs = ctx.renderSize;
    canvas.drawImageRect(img, Offset.zero & rs, Offset.zero & size, Paint()..filterQuality = FilterQuality.medium);
    img.dispose();
  }

  @override
  bool shouldRepaint(_ScenePainter old) => true;
}

/// Renders one frame of a scene offscreen at ctx.renderSize: the driver's
/// overlay geometry first, then the fragment shader with the uniform layout
/// documented in shaders/common.glsl. [blank] stands in for a missing cover.
ui.Image? renderScene(ui.FragmentProgram program, SceneDriver driver, SceneCtx ctx, CommonUniforms u, ui.Image blank) {
  final rs = ctx.renderSize;
  final w = rs.width.toInt(), h = rs.height.toInt();
  if (w <= 0 || h <= 0) return null;

  ui.Image? overlay;
  if (driver.hasOverlay) {
    final rec = ui.PictureRecorder();
    final oc = Canvas(rec, Offset.zero & rs);
    driver.paintOverlay(oc, rs, ctx);
    overlay = rec.endRecording().toImageSync(w, h);
  }

  final shader = program.fragmentShader();
  var i = 0;
  void f(double v) => shader.setFloat(i++, v);
  f(rs.width); // 0-1 uSize
  f(rs.height);
  f(u.time); // 2
  f(u.clock); // 3
  f(u.bass); // 4
  f(u.mid); // 5
  f(u.treble); // 6
  f(u.energy); // 7
  f(u.beat); // 8
  f(u.seed); // 9
  for (final c in ctx.trio) {
    // 10-18 uColorA/B/C (linear)
    f(c.r);
    f(c.g);
    f(c.b);
  }
  for (final v in u.params) {
    f(v); // 19-34 uP0..uP3
  }
  f(driver.bloom); // 35
  var s = 0;
  if (driver.hasOverlay) shader.setImageSampler(s++, overlay!);
  if (driver.hasCover) shader.setImageSampler(s++, ctx.cover ?? blank);

  final rec = ui.PictureRecorder();
  Canvas(rec, Offset.zero & rs).drawRect(Offset.zero & rs, Paint()..shader = shader);
  final img = rec.endRecording().toImageSync(w, h);
  overlay?.dispose();
  shader.dispose();
  return img;
}
