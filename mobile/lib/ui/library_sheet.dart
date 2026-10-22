import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../player/player_controller.dart';
import 'widgets/common.dart';

/// Library sheet (TrackList.tsx, phase 1): Titres / File / Favoris.
class LibrarySheet extends StatefulWidget {
  const LibrarySheet({super.key});

  @override
  State<LibrarySheet> createState() => _LibrarySheetState();
}

class _LibrarySheetState extends State<LibrarySheet> {
  int _tab = 0;
  String _filter = '';

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    final f = _filter.toLowerCase();
    final local = f.isEmpty
        ? p.localTracks
        : p.localTracks.where((t) => '${t.title} ${t.artist} ${t.album}'.toLowerCase().contains(f)).toList();

    Widget body;
    switch (_tab) {
      case 0:
        if (!p.libraryLoaded) {
          body = _Empty(
            icon: Icons.library_music_rounded,
            text: p.libraryError ?? 'Lis tes fichiers MP3, FLAC, WAV… même hors connexion et écran éteint.',
            action: p.scanning ? null : 'Ouvrir ma musique',
            onAction: () => p.scanLibrary(),
            busy: p.scanning,
          );
        } else {
          body = Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
              child: TextField(
                onChanged: (v) => setState(() => _filter = v),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: 'Filtrer ${p.localTracks.length} titres…',
                  prefixIcon: const Icon(Icons.filter_list_rounded, size: 20),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: .05),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(AuroraRadius.control), borderSide: BorderSide.none),
                ),
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(6, 0, 6, 24),
                itemCount: local.length,
                itemExtent: 62,
                itemBuilder: (_, i) => TrackRow(
                  track: local[i],
                  active: p.current?.id == local[i].id,
                  onTap: () => p.playList(local, i),
                ),
              ),
            ),
          ]);
        }
      case 1:
        body = p.queue.isEmpty
            ? const _Empty(icon: Icons.queue_music_rounded, text: 'La file est vide. Lance un titre pour la remplir.')
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(6, 0, 6, 24),
                itemCount: p.queue.length,
                itemBuilder: (_, i) => TrackRow(
                  track: p.queue[i],
                  rank: i + 1,
                  active: i == p.index,
                  onTap: () => p.playList(p.queue, i),
                ),
              );
      default:
        body = p.favorites.isEmpty
            ? const _Empty(icon: Icons.favorite_border_rounded, text: 'Touche le cœur d\'un titre pour le retrouver ici.')
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(6, 0, 6, 24),
                itemCount: p.favorites.length,
                itemBuilder: (_, i) => TrackRow(
                  track: p.favorites[i],
                  active: p.current?.id == p.favorites[i].id,
                  onTap: () => p.playList(p.favorites, i),
                ),
              );
    }

    return FractionallySizedBox(
      heightFactor: .9,
      child: Glass(
        strong: true,
        radius: AuroraRadius.panel,
        child: Column(children: [
          const SizedBox(height: 8),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 8, 10),
            child: Row(children: [
              Text('BIBLIOTHÈQUE', style: AuroraText.label(size: 11, color: AuroraColors.ink2)),
              const Spacer(),
              RoundIcon(icon: Icons.close_rounded, onTap: () => Navigator.pop(context), tooltip: 'Fermer'),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 0, label: Text('Titres')),
                ButtonSegment(value: 1, label: Text('File')),
                ButtonSegment(value: 2, label: Text('Favoris')),
              ],
              selected: {_tab},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _tab = s.first),
            ),
          ),
          Expanded(child: body),
        ]),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.text, this.action, this.onAction, this.busy = false});
  final IconData icon;
  final String text;
  final String? action;
  final VoidCallback? onAction;
  final bool busy;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), gradient: AuroraColors.gradient),
              child: Icon(icon, color: Colors.white, size: 30),
            ),
            const SizedBox(height: 16),
            Text(text, textAlign: TextAlign.center, style: AuroraText.body(size: 14, color: AuroraColors.ink2)),
            if (busy) const Padding(padding: EdgeInsets.only(top: 16), child: CircularProgressIndicator(strokeWidth: 2)),
            if (action != null) ...[
              const SizedBox(height: 16),
              FilledButton(
                onPressed: onAction,
                style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Colors.black),
                child: Text(action!),
              ),
            ],
          ]),
        ),
      );
}
