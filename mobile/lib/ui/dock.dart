import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../player/player_controller.dart';
import 'widgets/common.dart';

/// Mobile dock (PlayerBar.tsx): one row — cover, title/artist, play with halo,
/// next — and a hairline progress on its top edge. Tap opens "En lecture".
class Dock extends StatelessWidget {
  const Dock({super.key, required this.onOpen, required this.lyricsOpen, required this.onToggleLyrics});
  final VoidCallback onOpen;
  final bool lyricsOpen;
  final VoidCallback onToggleLyrics;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    final t = p.current!;
    final total = p.duration.inMilliseconds;

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: GestureDetector(
        onTap: onOpen,
        onVerticalDragEnd: (d) {
          if ((d.primaryVelocity ?? 0) < -200) onOpen();
        },
        child: Glass(
          strong: true,
          radius: AuroraRadius.panel,
          child: Stack(children: [
            Positioned(
              left: 0,
              top: 0,
              right: 0,
              child: ValueListenableBuilder<Duration>(
                valueListenable: p.positionN,
                builder: (_, pos, __) => Align(
                  alignment: Alignment.centerLeft,
                  child: FractionallySizedBox(
                    widthFactor: total > 0 ? (pos.inMilliseconds / total).clamp(0.0, 1.0) : 0.0,
                    child: Container(height: 2, decoration: const BoxDecoration(gradient: AuroraColors.gradient)),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
              child: Row(children: [
                Cover(track: t, size: 46, radius: 10),
                const SizedBox(width: 12),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: AuroraMotion.d3,
                    child: Column(
                      key: ValueKey(t.id),
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: AuroraText.body(size: 15, weight: FontWeight.w700)),
                        Text(t.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: AuroraText.body(size: 13, color: AuroraColors.ink2)),
                      ],
                    ),
                  ),
                ),
                RoundIcon(
                  icon: Icons.lyrics_outlined,
                  size: 40,
                  iconSize: 19,
                  active: lyricsOpen,
                  tooltip: 'Paroles',
                  onTap: p.lyrics.isNotEmpty ? onToggleLyrics : null,
                ),
                _PlayButton(size: 50),
                RoundIcon(icon: Icons.skip_next_rounded, size: 44, iconSize: 26, onTap: p.next, tooltip: 'Suivant'),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _PlayButton extends StatelessWidget {
  const _PlayButton({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    return PlayPause(size: size, playing: p.playing, loading: p.loading, onTap: p.toggle);
  }
}

/// Round play/pause with the accent halo.
class PlayPause extends StatelessWidget {
  const PlayPause({super.key, required this.size, required this.playing, required this.loading, required this.onTap});
  final double size;
  final bool playing, loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: AuroraColors.c2.withValues(alpha: playing ? .45 : .2), blurRadius: playing ? 26 : 12)],
      ),
      child: Material(
        color: const Color(0xFF16161F),
        shape: const CircleBorder(side: BorderSide(color: AuroraColors.line2)),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: size,
            height: size,
            child: Center(
              child: loading
                  ? SizedBox(width: size * .36, height: size * .36, child: const CircularProgressIndicator(strokeWidth: 2))
                  : AnimatedSwitcher(
                      duration: AuroraMotion.d2,
                      transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                      child: Icon(
                        playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                        key: ValueKey(playing),
                        size: size * .5,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
