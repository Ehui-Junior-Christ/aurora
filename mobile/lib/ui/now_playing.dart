import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/theme.dart';
import '../player/player_controller.dart';
import 'dock.dart';
import 'widgets/common.dart';

/// Fullscreen "En lecture" sheet: big cover (or the YouTube video, placed by
/// the Shell over the cover area), timeline, transport and secondary row.
class NowPlayingSheet extends StatefulWidget {
  const NowPlayingSheet({super.key, required this.open, required this.onClose, required this.onLyrics});
  final bool open;
  final VoidCallback onClose, onLyrics;

  @override
  State<NowPlayingSheet> createState() => _NowPlayingSheetState();
}

class _NowPlayingSheetState extends State<NowPlayingSheet> {
  double _drag = 0;
  double? _scrub;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    final t = p.current!;
    final size = MediaQuery.of(context).size;
    final pad = MediaQuery.of(context).padding;
    final total = p.duration.inMilliseconds.toDouble();
    final coverSize = size.width - 40;
    final videoArea = t.isOnline && p.videoVisible;

    return AnimatedPositioned(
      duration: _drag > 0 ? Duration.zero : AuroraMotion.d4,
      curve: AuroraMotion.expoOut,
      left: 0,
      right: 0,
      top: widget.open ? _drag : size.height,
      height: size.height,
      child: GestureDetector(
        onVerticalDragUpdate: (d) => setState(() => _drag = (_drag + d.delta.dy).clamp(0, size.height)),
        onVerticalDragEnd: (d) {
          if (_drag > 110 || (d.primaryVelocity ?? 0) > 600) widget.onClose();
          setState(() => _drag = 0);
        },
        child: Container(
          color: const Color(0xFF08080E),
          padding: EdgeInsets.fromLTRB(20, pad.top + 6, 20, pad.bottom + 16),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -1.1),
                radius: 1.2,
                colors: [p.palette.first.withValues(alpha: .28), Colors.transparent],
              ),
            ),
            child: Column(children: [
              Row(children: [
                RoundIcon(icon: Icons.keyboard_arrow_down_rounded, onTap: widget.onClose, tooltip: 'Réduire le lecteur', iconSize: 28),
                Expanded(child: Center(child: Text('EN LECTURE', style: AuroraText.label(size: 11, color: AuroraColors.ink2)))),
                RoundIcon(
                  icon: p.isFavorite(t) ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                  active: p.isFavorite(t),
                  onTap: () => p.toggleFavorite(t),
                  tooltip: 'Favori',
                ),
              ]),
              const SizedBox(height: 28),
              // Cover area (the Shell lays the YouTube video over it when online).
              SizedBox(
                width: coverSize,
                height: videoArea ? coverSize * 9 / 16 : coverSize,
                child: videoArea
                    ? const SizedBox.shrink()
                    : Hero(tag: 'cover', child: Cover(track: t, size: coverSize, radius: AuroraRadius.panel)),
              ),
              const Spacer(),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(t.title.toUpperCase(), maxLines: 2, overflow: TextOverflow.ellipsis, style: AuroraText.display(30)),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  [t.artist, if (t.album.isNotEmpty) t.album].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AuroraText.body(size: 15, color: AuroraColors.ink2),
                ),
              ),
              const SizedBox(height: 18),
              ValueListenableBuilder<Duration>(
                valueListenable: p.positionN,
                builder: (context, position, _) {
                  final pos = _scrub ?? position.inMilliseconds.toDouble().clamp(0, total > 0 ? total : 1);
                  return Column(children: [
              Slider(
                value: pos.toDouble(),
                max: total > 0 ? total : 1,
                onChanged: total > 0 ? (v) => setState(() => _scrub = v) : null,
                onChangeEnd: (v) {
                  p.seek(Duration(milliseconds: v.round()));
                  setState(() => _scrub = null);
                },
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(children: [
                  Text(formatDuration(Duration(milliseconds: pos.round())), style: AuroraText.label(size: 11)),
                  const Spacer(),
                  Text(formatDuration(p.duration), style: AuroraText.label(size: 11)),
                ]),
              ),
                  ]);
                },
              ),
              const SizedBox(height: 14),
              Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                RoundIcon(icon: Icons.skip_previous_rounded, size: 60, iconSize: 34, onTap: p.prev, tooltip: 'Précédent'),
                PlayPause(size: 76, playing: p.playing, loading: p.loading, onTap: p.toggle),
                RoundIcon(icon: Icons.skip_next_rounded, size: 60, iconSize: 34, onTap: p.next, tooltip: 'Suivant'),
              ]),
              const SizedBox(height: 18),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                RoundIcon(icon: Icons.lyrics_outlined, onTap: p.lyrics.isNotEmpty ? widget.onLyrics : null, tooltip: 'Paroles'),
                RoundIcon(icon: Icons.shuffle_rounded, active: p.shuffle, onTap: p.toggleShuffle, tooltip: 'Lecture aléatoire'),
                RoundIcon(
                  icon: p.repeat == RepeatMode.one ? Icons.repeat_one_rounded : Icons.repeat_rounded,
                  active: p.repeat != RepeatMode.off,
                  onTap: p.cycleRepeat,
                  tooltip: 'Répéter',
                ),
                RoundIcon(
                  icon: p.videoVisible ? Icons.videocam_rounded : Icons.videocam_off_outlined,
                  active: t.isOnline && p.videoVisible,
                  onTap: t.isOnline ? () => p.setVideoVisible(!p.videoVisible) : null,
                  tooltip: p.videoVisible ? 'Masquer la vidéo' : 'Afficher la vidéo',
                ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}
