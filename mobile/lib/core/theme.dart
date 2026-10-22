import 'package:flutter/material.dart';

/// AURORA design tokens (mirrors src/app/globals.css of the web app).
class AuroraColors {
  static const bg = Color(0xFF06060B);
  static const c1 = Color(0xFF6D4DFF);
  static const c2 = Color(0xFF22E4FF);
  static const c3 = Color(0xFFFF4ECD);

  static const ink1 = Color(0xFFF5F5F7);
  static const ink2 = Color(0xB8F5F5F7); // 72 %
  static const ink3 = Color(0x85F5F5F7); // 52 %
  static const line = Color(0x17FFFFFF);
  static const line2 = Color(0x2EFFFFFF);
  static const surface1 = Color(0x0BFFFFFF);
  static const surface2 = Color(0x9E0C0C14);
  static const surfaceSolid = Color(0xF908080D);

  static const gradient = LinearGradient(colors: [c1, c2, c3], stops: [0, .45, 1]);
}

class AuroraRadius {
  static const control = 12.0;
  static const card = 16.0;
  static const panel = 24.0;
}

class AuroraMotion {
  static const d1 = Duration(milliseconds: 120);
  static const d2 = Duration(milliseconds: 220);
  static const d3 = Duration(milliseconds: 380);
  static const d4 = Duration(milliseconds: 600);
  static const expoOut = Cubic(0.16, 1, 0.3, 1);
}

class AuroraText {
  /// Big extrabold uppercase titles (Syne).
  static TextStyle display(double size, {Color color = AuroraColors.ink1}) => TextStyle(
        fontFamily: 'Syne',
        fontSize: size,
        fontWeight: FontWeight.w800,
        fontVariations: const [FontVariation('wght', 800)],
        height: 0.9,
        letterSpacing: -0.01 * size,
        color: color,
      );

  /// Mono uppercase labels with wide tracking.
  static TextStyle label({double size = 11, Color color = AuroraColors.ink3}) => TextStyle(
        fontFamily: 'Mono',
        fontSize: size,
        letterSpacing: size * 0.3,
        color: color,
      );

  static TextStyle body({double size = 15, FontWeight weight = FontWeight.w500, Color color = AuroraColors.ink1}) =>
      TextStyle(
        fontFamily: 'Space',
        fontSize: size,
        fontWeight: weight,
        fontVariations: [FontVariation('wght', weight.value.toDouble())],
        color: color,
      );
}

ThemeData buildAuroraTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: AuroraColors.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: AuroraColors.c2,
      secondary: AuroraColors.c3,
      surface: AuroraColors.bg,
    ),
    textTheme: base.textTheme.apply(fontFamily: 'Space', bodyColor: AuroraColors.ink1, displayColor: AuroraColors.ink1),
    splashFactory: InkSparkle.splashFactory,
    sliderTheme: const SliderThemeData(
      trackHeight: 3,
      thumbShape: RoundSliderThumbShape(enabledThumbRadius: 6),
      overlayShape: RoundSliderOverlayShape(overlayRadius: 14),
      activeTrackColor: AuroraColors.ink1,
      inactiveTrackColor: Color(0x29FFFFFF),
      thumbColor: Colors.white,
    ),
  );
}
