import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/theme.dart';
import '../player/player_controller.dart';
import 'widgets/common.dart';

/// Start page (LibraryGate.tsx): hero, search entry, local library, Tendances.
class HomeView extends StatefulWidget {
  const HomeView({super.key, required this.onSearch});
  final VoidCallback onSearch;

  @override
  State<HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<HomeView> {
  String _country = 'fr';
  static const _labels = {'fr': 'France', 'us': 'États-Unis', 'gb': 'Royaume-Uni'};

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    final chart = p.trends[_country] ?? const <Track>[];
    final width = MediaQuery.of(context).size.width;
    final heroSize = (width * 0.115).clamp(30.0, 56.0);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
      children: [
        Text('AURORA // LECTEUR GÉNÉRATIF HYBRIDE', textAlign: TextAlign.center, style: AuroraText.label(size: 10)),
        const SizedBox(height: 18),
        FittedBox(fit: BoxFit.scaleDown, child: Text('CHAQUE PISTE', style: AuroraText.display(heroSize))),
        FittedBox(fit: BoxFit.scaleDown, child: GradientText('RESPIRE', style: AuroraText.display(heroSize))),
        FittedBox(fit: BoxFit.scaleDown, child: GradientText('DIFFÉREMMENT.', style: AuroraText.display(heroSize))),
        const SizedBox(height: 18),
        Text(
          'Cherche le titre ou l\'artiste de ton choix, et AURORA se charge du reste. Des visuels génératifs accompagnent chaque musique en temps réel.',
          textAlign: TextAlign.center,
          style: AuroraText.body(size: 14, color: AuroraColors.ink2).copyWith(height: 1.5),
        ),
        const SizedBox(height: 28),
        // Search entry
        GestureDetector(
          onTap: widget.onSearch,
          child: Glass(
            strong: true,
            radius: AuroraRadius.panel,
            padding: const EdgeInsets.all(14),
            child: Column(children: [
              Text('RECHERCHE UNIFIÉE', style: AuroraText.label(size: 10, color: AuroraColors.ink2)),
              const SizedBox(height: 10),
              Container(
                height: 50,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .06),
                  borderRadius: BorderRadius.circular(AuroraRadius.control),
                  border: Border.all(color: AuroraColors.line2),
                ),
                child: Row(children: [
                  const Icon(Icons.search_rounded, color: AuroraColors.ink3, size: 20),
                  const SizedBox(width: 10),
                  Text('Artiste, titre, album…', style: AuroraText.body(size: 15, color: AuroraColors.ink3)),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 14),
        _LocalLibraryCard(p: p),
        if (chart.isNotEmpty) ...[
          const SizedBox(height: 34),
          Row(children: [
            Text('TENDANCES', style: AuroraText.label(size: 11, color: AuroraColors.ink2)),
            const Spacer(),
            TextButton.icon(
              onPressed: () => p.playList(chart.where((t) => t.videoId != null).toList(), 0),
              icon: const Icon(Icons.play_arrow_rounded, size: 18),
              label: const Text('Tout lire'),
            ),
          ]),
          const SizedBox(height: 6),
          Wrap(spacing: 8, children: [
            for (final cc in _labels.keys)
              ChoiceChip(
                label: Text(_labels[cc]!),
                selected: _country == cc,
                onSelected: (_) => setState(() => _country = cc),
                showCheckmark: false,
                selectedColor: Colors.white.withValues(alpha: .16),
                backgroundColor: Colors.white.withValues(alpha: .04),
                side: const BorderSide(color: AuroraColors.line2),
                shape: const StadiumBorder(),
              ),
          ]),
          const SizedBox(height: 12),
          Glass(
            strong: true,
            radius: AuroraRadius.panel,
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            child: Column(children: [
              for (var i = 0; i < chart.length && i < 25; i++)
                TrackRow(
                  track: chart[i],
                  rank: i + 1,
                  active: p.current?.id == chart[i].id,
                  onTap: () => p.playList(chart, i),
                ),
            ]),
          ),
        ],
      ],
    );
  }
}

class _LocalLibraryCard extends StatelessWidget {
  const _LocalLibraryCard({required this.p});
  final PlayerController p;

  @override
  Widget build(BuildContext context) {
    final n = p.localTracks.length;
    return Glass(
      radius: AuroraRadius.panel,
      padding: const EdgeInsets.all(16),
      child: Row(children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), gradient: AuroraColors.gradient),
          child: const Icon(Icons.library_music_rounded, color: Colors.white),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Ma musique', style: AuroraText.body(size: 16, weight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(
              p.scanning
                  ? 'Analyse de la bibliothèque…'
                  : p.libraryError ?? (n > 0 ? '$n morceaux · lecture même écran éteint' : 'Tes fichiers MP3, FLAC, WAV… hors connexion'),
              style: AuroraText.body(size: 12.5, color: p.libraryError != null ? AuroraColors.c3 : AuroraColors.ink2),
            ),
          ]),
        ),
        if (p.scanning)
          const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
        else
          FilledButton(
            onPressed: n > 0 ? () => p.playList(p.localTracks, 0) : () => p.scanLibrary(),
            style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Colors.black),
            child: Text(n > 0 ? 'Lire' : 'Ouvrir'),
          ),
      ]),
    );
  }
}
