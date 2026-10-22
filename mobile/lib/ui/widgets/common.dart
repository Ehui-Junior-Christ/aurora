import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../core/theme.dart';

/// Dark glass surface (.glass / .glass-strong of the web app).
class Glass extends StatelessWidget {
  const Glass({super.key, required this.child, this.radius = AuroraRadius.panel, this.padding, this.strong = false});
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry? padding;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    // No BackdropFilter: re-blurring the animated scene behind every panel on
    // each frame was the main cost on phones. Tinted surfaces read the same.
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: strong ? const Color(0xE00E0E17) : const Color(0x8C12121C),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: AuroraColors.line2),
      ),
      child: child,
    );
  }
}

/// Text painted with the brand gradient.
class GradientText extends StatelessWidget {
  const GradientText(this.text, {super.key, required this.style, this.textAlign});
  final String text;
  final TextStyle style;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) => ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (r) => AuroraColors.gradient.createShader(r),
        child: Text(text, style: style, textAlign: textAlign),
      );
}

/// Round icon button with press feedback.
class RoundIcon extends StatelessWidget {
  const RoundIcon({
    super.key,
    required this.icon,
    required this.onTap,
    this.size = 44,
    this.iconSize = 20,
    this.tooltip,
    this.active = false,
    this.filled = false,
    this.badge,
  });
  final IconData icon;
  final VoidCallback? onTap;
  final double size, iconSize;
  final String? tooltip;
  final bool active, filled;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final btn = Material(
      color: filled ? Colors.white.withValues(alpha: .08) : Colors.transparent,
      shape: CircleBorder(side: BorderSide(color: filled ? AuroraColors.line2 : Colors.transparent)),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: size,
          height: size,
          child: Icon(icon, size: iconSize, color: active ? AuroraColors.c2 : AuroraColors.ink1.withValues(alpha: onTap == null ? .3 : .9)),
        ),
      ),
    );
    final withBadge = badge == null
        ? btn
        : Stack(clipBehavior: Clip.none, children: [
            btn,
            Positioned(
              right: -2,
              top: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
                child: Text(badge!, style: AuroraText.body(size: 10, weight: FontWeight.w700, color: Colors.black)),
              ),
            ),
          ]);
    return tooltip == null ? withBadge : Tooltip(message: tooltip!, child: withBadge);
  }
}

/// Track artwork: local bytes, online URL, or a gradient placeholder.
class Cover extends StatelessWidget {
  const Cover({super.key, required this.track, this.size = 48, this.radius = 10});
  final Track? track;
  final double size, radius;

  @override
  Widget build(BuildContext context) {
    final t = track;
    Widget child;
    if (t?.artworkBytes != null) {
      child = Image.memory(t!.artworkBytes!, fit: BoxFit.cover, gaplessPlayback: true);
    } else if (t?.artworkUrl != null) {
      child = Image.network(t!.artworkUrl!, fit: BoxFit.cover, gaplessPlayback: true,
          errorBuilder: (_, __, ___) => const _Placeholder());
    } else {
      child = const _Placeholder();
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(width: size, height: size, child: child),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder();
  @override
  Widget build(BuildContext context) => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AuroraColors.c1, AuroraColors.c3]),
        ),
        child: Center(child: Icon(Icons.music_note_rounded, color: Colors.white70)),
      );
}

/// A track row (title / artist / duration) used by lists.
class TrackRow extends StatelessWidget {
  const TrackRow({super.key, required this.track, required this.onTap, this.active = false, this.trailing, this.rank});
  final Track track;
  final VoidCallback onTap;
  final bool active;
  final Widget? trailing;
  final int? rank;

  @override
  Widget build(BuildContext context) {
    final d = track.durationMs;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AuroraRadius.control),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(children: [
          if (rank != null)
            SizedBox(width: 28, child: Text('$rank', style: AuroraText.label(size: 12, color: AuroraColors.ink3))),
          Cover(track: track, size: 46, radius: 9),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(track.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AuroraText.body(size: 15, weight: FontWeight.w600, color: active ? AuroraColors.c2 : AuroraColors.ink1)),
              const SizedBox(height: 2),
              Text(track.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: AuroraText.body(size: 13, color: AuroraColors.ink2)),
            ]),
          ),
          if (d != null) Text(formatDuration(Duration(milliseconds: d)), style: AuroraText.label(size: 11)),
          if (trailing != null) trailing!,
        ]),
      ),
    );
  }
}
