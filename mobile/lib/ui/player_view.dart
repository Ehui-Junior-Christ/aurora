import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/theme.dart';
import '../player/player_controller.dart';
import 'lyrics_view.dart';
import 'widgets/common.dart';

/// "Now playing" hero over the visuals: index, giant title, artist line and
/// the visual mode pill (page.tsx MetaLine / TrackTitle / ArtistLine).
class PlayerView extends StatelessWidget {
  const PlayerView({super.key, required this.lyricsOpen, required this.onCloseLyrics});
  final bool lyricsOpen;
  final VoidCallback onCloseLyrics;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    final t = p.current!;
    if (lyricsOpen) return LyricsView(onClose: onCloseLyrics);

    return LayoutBuilder(builder: (context, c) {
      final long = t.title.length > 28;
      final size = (c.maxWidth * (long ? 0.085 : 0.13)).clamp(26.0, 64.0);
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.end, children: [
          Text(
            '${(p.index + 1).toString().padLeft(2, '0')} / ${p.queue.length.toString().padLeft(2, '0')}',
            style: AuroraText.label(size: 12),
          ),
          const SizedBox(height: 10),
          AnimatedSwitcher(
            duration: AuroraMotion.d4,
            switchInCurve: AuroraMotion.expoOut,
            transitionBuilder: (child, a) => FadeTransition(
              opacity: a,
              child: SlideTransition(position: Tween(begin: const Offset(0, .15), end: Offset.zero).animate(a), child: child),
            ),
            child: Text(
              t.title.toUpperCase(),
              key: ValueKey(t.id),
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: AuroraText.display(size),
            ),
          ),
          const SizedBox(height: 14),
          Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 12, runSpacing: 6, children: [
            Text(t.artist, style: AuroraText.body(size: 20, weight: FontWeight.w600).copyWith(fontFamily: 'Syne')),
            if (t.album.isNotEmpty) Text(t.album, style: AuroraText.body(size: 14, color: AuroraColors.ink2)),
            _Chip(t.isOnline ? 'EN LIGNE' : 'LOCAL'),
          ]),
          const SizedBox(height: 18),
          _ModePill(p: p),
        ]),
      );
    });
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), border: Border.all(color: AuroraColors.line2)),
        child: Text(text, style: AuroraText.label(size: 10, color: AuroraColors.ink2)),
      );
}

class _ModePill extends StatelessWidget {
  const _ModePill({required this.p});
  final PlayerController p;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => showModalBottomSheet<void>(
        context: context,
        backgroundColor: Colors.transparent,
        builder: (_) => ChangeNotifierProvider.value(value: p, child: const _ModeSheet()),
      ),
      child: Glass(
        radius: 99,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.auto_awesome_rounded, size: 16, color: AuroraColors.ink1),
          const SizedBox(width: 8),
          Text(p.visualMode.label, style: AuroraText.body(size: 14, weight: FontWeight.w600)),
          if (p.autoMode) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: AuroraColors.c1.withValues(alpha: .35), borderRadius: BorderRadius.circular(6)),
              child: Text('AUTO', style: AuroraText.label(size: 9, color: Colors.white)),
            ),
          ],
          const SizedBox(width: 6),
          const Icon(Icons.keyboard_arrow_up_rounded, size: 18, color: AuroraColors.ink2),
        ]),
      ),
    );
  }
}

class _ModeSheet extends StatelessWidget {
  const _ModeSheet();

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Glass(
          strong: true,
          radius: AuroraRadius.panel,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('SCÈNES VISUELLES', style: AuroraText.label(size: 11, color: AuroraColors.ink2)),
              const Spacer(),
              Text('Auto', style: AuroraText.body(size: 13, color: AuroraColors.ink2)),
              Switch(value: p.autoMode, onChanged: p.setAutoMode),
            ]),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final m in VisualMode.values)
                ChoiceChip(
                  label: Text(m.label),
                  selected: p.visualMode == m && !p.autoMode,
                  onSelected: (_) => p.setVisualMode(m),
                  showCheckmark: false,
                  selectedColor: Colors.white.withValues(alpha: .18),
                  backgroundColor: Colors.white.withValues(alpha: .05),
                  side: const BorderSide(color: AuroraColors.line2),
                  shape: const StadiumBorder(),
                  labelPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                ),
            ]),
          ]),
        ),
      ),
    );
  }
}
