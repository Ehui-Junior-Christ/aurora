import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../player/player_controller.dart';
import 'widgets/common.dart';

/// Synced lyrics (LyricsPanel.tsx): the current line is lit and kept centred.
class LyricsView extends StatefulWidget {
  const LyricsView({super.key, required this.onClose});
  final VoidCallback onClose;

  @override
  State<LyricsView> createState() => _LyricsViewState();
}

class _LyricsViewState extends State<LyricsView> {
  final _scroll = ScrollController();
  int _last = -1;
  // One key per line: lines wrap to any height, so the active one is brought
  // into view by measuring it rather than by a fixed row height.
  List<GlobalKey> _keys = const [];

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    return ValueListenableBuilder<Duration>(valueListenable: p.positionN, builder: (context, pos, _) => _build(context, p, pos));
  }

  Widget _build(BuildContext context, PlayerController p, Duration pos) {
    final t = p.current!;
    final now = pos.inMilliseconds / 1000;
    var active = -1;
    for (var i = 0; i < p.lyrics.length; i++) {
      if (p.lyrics[i].time <= now + 0.15) active = i;
    }
    if (_keys.length != p.lyrics.length) {
      _keys = List.generate(p.lyrics.length, (_) => GlobalKey());
      _last = -1;
    }
    if (active != _last && active >= 0) {
      _last = active;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = active < _keys.length ? _keys[active].currentContext : null;
        if (ctx != null) {
          Scrollable.ensureVisible(ctx, alignment: 0.4, duration: AuroraMotion.d4, curve: AuroraMotion.expoOut);
        }
      });
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
      child: Glass(
        radius: AuroraRadius.panel,
        padding: const EdgeInsets.fromLTRB(20, 14, 8, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('PAROLES', style: AuroraText.label(size: 11)),
                const SizedBox(height: 6),
                Text(t.title.toUpperCase(), maxLines: 2, overflow: TextOverflow.fade, style: AuroraText.display(20)),
                Text(t.artist, style: AuroraText.body(size: 13, color: AuroraColors.ink2)),
              ]),
            ),
            RoundIcon(icon: Icons.close_rounded, onTap: widget.onClose, tooltip: 'Fermer les paroles'),
          ]),
          const SizedBox(height: 10),
          Expanded(
            child: p.lyrics.isEmpty
                ? Center(child: Text('Pas de paroles synchronisées pour ce titre.', style: AuroraText.body(size: 14, color: AuroraColors.ink3)))
                : SingleChildScrollView(
                    controller: _scroll,
                    padding: const EdgeInsets.only(right: 12, bottom: 120),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var i = 0; i < p.lyrics.length; i++)
                          GestureDetector(
                            key: _keys[i],
                            behavior: HitTestBehavior.opaque,
                            onTap: () => p.seek(Duration(milliseconds: (p.lyrics[i].time * 1000).round())),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 7),
                              child: AnimatedDefaultTextStyle(
                                duration: AuroraMotion.d3,
                                style: AuroraText.body(
                                  size: i == active ? 21 : 17,
                                  weight: i == active ? FontWeight.w700 : FontWeight.w500,
                                  color: i == active ? AuroraColors.ink1 : AuroraColors.ink3,
                                ).copyWith(height: 1.3),
                                // Full line, wrapped: never cut with "…".
                                child: Text(p.lyrics[i].text.isEmpty ? '♪' : p.lyrics[i].text, softWrap: true),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
        ]),
      ),
    );
  }
}
