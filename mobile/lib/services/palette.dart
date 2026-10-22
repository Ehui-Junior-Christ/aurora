import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:http/http.dart' as http;

/// Three vivid colours from a cover (the web app's cover palette, simplified):
/// downscale, bucket by hue, keep the most saturated, populated buckets.
class PaletteService {
  static const fallback = [Color(0xFF6D4DFF), Color(0xFF22E4FF), Color(0xFFFF4ECD)];
  final Map<String, List<Color>> _cache = {};

  Future<List<Color>> fromBytes(String key, Uint8List bytes) async {
    if (_cache[key] != null) return _cache[key]!;
    try {
      final codec = await ui.instantiateImageCodec(bytes, targetWidth: 48, targetHeight: 48);
      final frame = await codec.getNextFrame();
      final data = await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba);
      frame.image.dispose();
      if (data == null) return fallback;
      return _cache[key] = _extract(data.buffer.asUint8List());
    } catch (_) {
      return fallback;
    }
  }

  Future<List<Color>> fromUrl(String url) async {
    if (_cache[url] != null) return _cache[url]!;
    try {
      final res = await http.get(Uri.parse(url.replaceAll('600x600bb', '100x100bb'))).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return fallback;
      return fromBytes(url, res.bodyBytes);
    } catch (_) {
      return fallback;
    }
  }

  static List<Color> _extract(Uint8List rgba) {
    final buckets = List.generate(12, (_) => <HSVColor>[]);
    for (var i = 0; i + 3 < rgba.length; i += 4) {
      final hsv = HSVColor.fromColor(Color.fromARGB(255, rgba[i], rgba[i + 1], rgba[i + 2]));
      if (hsv.saturation < 0.25 || hsv.value < 0.2) continue;
      buckets[(hsv.hue / 30).floor() % 12].add(hsv);
    }
    buckets.sort((a, b) => b.length.compareTo(a.length));
    final picked = <Color>[];
    for (final b in buckets) {
      if (b.isEmpty || picked.length == 3) break;
      double h = 0, s = 0, v = 0;
      for (final c in b) {
        h += c.hue;
        s += c.saturation;
        v += c.value;
      }
      final n = b.length.toDouble();
      // Lift dull colours so the generative visuals stay luminous.
      picked.add(HSVColor.fromAHSV(1, h / n, math.max(s / n, 0.55), math.max(v / n, 0.75)).toColor());
    }
    for (var i = 0; picked.length < 3; i++) {
      picked.add(fallback[i % 3]);
    }
    return picked;
  }
}
