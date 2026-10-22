import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/theme.dart';
import '../player/player_controller.dart';
import 'dock.dart';
import 'home_view.dart';
import 'library_sheet.dart';
import 'now_playing.dart';
import 'player_view.dart';
import 'search_screen.dart';
import 'widgets/common.dart';
import 'widgets/visual_background.dart';

/// Root layout (page.tsx): generative backdrop, header, start page or
/// "now playing" hero, the dock, the "En lecture" sheet and the YouTube video.
/// The YouTube player widget lives here once and is only moved/resized, so
/// online playback survives screen changes (sheets are overlays, not routes).
class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  bool _sheetOpen = false;
  bool _lyricsOpen = false;

  void _openSearch() => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black54,
        builder: (_) => const SearchScreen(),
      );

  void _openLibrary() => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black54,
        builder: (_) => const LibrarySheet(),
      );

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    final hasTrack = p.current != null;
    final media = MediaQuery.of(context);
    final showVideo = hasTrack && p.current!.isOnline && p.videoVisible;

    return PopScope(
      canPop: !_sheetOpen && !_lyricsOpen,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        setState(() {
          if (_sheetOpen) {
            _sheetOpen = false;
          } else {
            _lyricsOpen = false;
          }
        });
      },
      child: Scaffold(
        resizeToAvoidBottomInset: false,
        body: Stack(children: [
          Positioned.fill(child: VisualBackground(homeMode: !hasTrack)),
          // Readability veil at the bottom where text sits.
          const Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0x00000000), Color(0x00000000), Color(0x8C06060B)],
                    stops: [0, .45, 1],
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(children: [
              _Header(onSearch: _openSearch, onLibrary: _openLibrary),
              Expanded(
                child: AnimatedSwitcher(
                  duration: AuroraMotion.d4,
                  child: hasTrack
                      ? PlayerView(
                          key: const ValueKey('player'),
                          lyricsOpen: _lyricsOpen,
                          onCloseLyrics: () => setState(() => _lyricsOpen = false),
                        )
                      : HomeView(key: const ValueKey('home'), onSearch: _openSearch),
                ),
              ),
              if (hasTrack)
                Dock(
                  onOpen: () => setState(() => _sheetOpen = true),
                  lyricsOpen: _lyricsOpen,
                  onToggleLyrics: () => setState(() => _lyricsOpen = !_lyricsOpen),
                ),
            ]),
          ),
          if (hasTrack)
            NowPlayingSheet(
              open: _sheetOpen,
              onClose: () => setState(() => _sheetOpen = false),
              onLyrics: () => setState(() {
                _sheetOpen = false;
                _lyricsOpen = true;
              }),
            ),
          // The one YouTube player: big in the sheet, otherwise a floating card.
          // Mounted only once an online song is played (an idle WebView would
          // show as a black box), then kept mounted so its audio continues.
          if (p.youtubeUsed)
          _VideoStage(
            visible: showVideo,
            inSheet: _sheetOpen,
            top: media.padding.top + 76,
            bottom: media.padding.bottom + 104,
            onHide: () => p.setVideoVisible(false),
          ),
          if (p.error != null) _ErrorToast(message: p.error!, onClose: p.dismissError),
        ]),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onSearch, required this.onLibrary});
  final VoidCallback onSearch, onLibrary;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    final count = p.localTracks.length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 12, 6),
      child: Row(children: [
        Container(
          width: 12,
          height: 12,
          decoration: const BoxDecoration(shape: BoxShape.circle, gradient: AuroraColors.gradient),
        ),
        const SizedBox(width: 12),
        Text('AURORA', style: AuroraText.display(20).copyWith(letterSpacing: 6, height: 1)),
        const Spacer(),
        RoundIcon(icon: Icons.search_rounded, onTap: onSearch, filled: true, tooltip: 'Rechercher'),
        const SizedBox(width: 8),
        RoundIcon(
          icon: Icons.queue_music_rounded,
          onTap: onLibrary,
          filled: true,
          tooltip: 'Bibliothèque',
          badge: count > 0 ? '$count' : null,
        ),
      ]),
    );
  }
}

class _VideoStage extends StatelessWidget {
  const _VideoStage({required this.visible, required this.inSheet, required this.top, required this.bottom, required this.onHide});
  final bool visible, inSheet;
  final double top, bottom;
  final VoidCallback onHide;

  @override
  Widget build(BuildContext context) {
    final p = context.read<PlayerController>();
    final size = MediaQuery.of(context).size;
    // In the sheet: wide video where the cover sits. Floating: 200 px tall card.
    final w = inSheet ? size.width - 40 : 356.0.clamp(0, size.width - 32).toDouble();
    final h = inSheet ? w * 9 / 16 : 200.0;
    final left = inSheet ? 20.0 : size.width - w - 16;
    // Floating: just under the header, where the hero leaves empty space.
    final topPos = inSheet ? top + 40 : top + 4;
    return AnimatedPositioned(
      duration: AuroraMotion.d4,
      curve: AuroraMotion.expoOut,
      left: visible ? left : size.width * 2, // kept mounted off-screen so audio continues
      top: topPos,
      width: w,
      height: h,
      child: IgnorePointer(
        ignoring: !visible,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AuroraRadius.card),
            boxShadow: const [BoxShadow(color: Color(0xCC000000), blurRadius: 40, offset: Offset(0, 18))],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AuroraRadius.card),
            child: Stack(children: [
              Positioned.fill(child: WebViewWidget(controller: p.yt.web)),
              if (!inSheet)
                Positioned(
                  right: 6,
                  top: 6,
                  child: RoundIcon(
                    icon: Icons.close_rounded,
                    size: 32,
                    iconSize: 16,
                    filled: true,
                    tooltip: 'Masquer la vidéo (le son continue)',
                    onTap: onHide,
                  ),
                ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _ErrorToast extends StatelessWidget {
  const _ErrorToast({required this.message, required this.onClose});
  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 16,
      right: 16,
      top: MediaQuery.of(context).padding.top + 70,
      child: Glass(
        strong: true,
        radius: AuroraRadius.card,
        padding: const EdgeInsets.fromLTRB(16, 10, 6, 10),
        child: Row(children: [
          const Icon(Icons.error_outline_rounded, color: AuroraColors.c3, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: AuroraText.body(size: 13))),
          TextButton(onPressed: onClose, child: const Text('OK')),
        ]),
      ),
    );
  }
}
