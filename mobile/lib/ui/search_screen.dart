import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/theme.dart';
import '../player/player_controller.dart';
import '../services/online_service.dart';
import 'widgets/common.dart';

/// Unified search (SearchPalette.tsx): local library matches + iTunes catalog.
/// Typing costs no YouTube quota; a song is resolved only when played.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<Track> _results = [];
  bool _loading = false;
  String? _error;
  int _token = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(q));
    setState(() {});
  }

  Future<void> _search(String q) async {
    final token = ++_token;
    if (q.trim().length < 2) {
      setState(() {
        _results = [];
        _error = null;
        _loading = false;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await context.read<PlayerController>().online.search(q);
      if (token != _token || !mounted) return;
      setState(() => _results = r);
    } on OnlineError catch (e) {
      if (token == _token && mounted) setState(() => _error = e.message);
    } catch (_) {
      if (token == _token && mounted) setState(() => _error = 'Pas de connexion. Réessaie.');
    } finally {
      if (token == _token && mounted) setState(() => _loading = false);
    }
  }

  static String _norm(String s) => s.toLowerCase();

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PlayerController>();
    final q = _norm(_ctrl.text.trim());
    final local = q.length < 2
        ? const <Track>[]
        : p.localTracks.where((t) => _norm('${t.title} ${t.artist} ${t.album}').contains(q)).take(8).toList();
    final recent = p.recent.take(10).toList();

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Glass(
        strong: true,
        radius: AuroraRadius.panel,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 8, 8),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  autofocus: true,
                  onChanged: _onChanged,
                  textInputAction: TextInputAction.search,
                  onSubmitted: _search,
                  style: AuroraText.body(size: 16),
                  decoration: InputDecoration(
                    hintText: 'Artiste, titre, album…',
                    prefixIcon: const Icon(Icons.search_rounded),
                    filled: true,
                    fillColor: Colors.white.withValues(alpha: .06),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(AuroraRadius.control), borderSide: BorderSide.none),
                  ),
                ),
              ),
              RoundIcon(icon: Icons.close_rounded, onTap: () => Navigator.pop(context), tooltip: 'Fermer'),
            ]),
          ),
          Expanded(
            child: ListView(padding: const EdgeInsets.fromLTRB(8, 0, 8, 24), children: [
              if (local.isNotEmpty) ...[
                _Section('DANS TA BIBLIOTHÈQUE'),
                for (final t in local) TrackRow(track: t, onTap: () => _play(p, local, t)),
              ],
              if (_loading)
                for (var i = 0; i < 6; i++) const _SkeletonRow()
              else if (_error != null)
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(children: [
                    Text(_error!, textAlign: TextAlign.center, style: AuroraText.body(size: 14, color: AuroraColors.ink2)),
                    const SizedBox(height: 10),
                    OutlinedButton(onPressed: () => _search(_ctrl.text), child: const Text('Réessayer')),
                  ]),
                )
              else if (_results.isNotEmpty) ...[
                _Section('CATALOGUE'),
                for (final t in _results)
                  TrackRow(
                    track: t,
                    active: p.current?.id == t.id,
                    onTap: () => _play(p, _results, t),
                    trailing: IconButton(
                      icon: Icon(p.isFavorite(t) ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 20),
                      color: p.isFavorite(t) ? AuroraColors.c3 : AuroraColors.ink3,
                      onPressed: () => p.toggleFavorite(t),
                    ),
                  ),
              ] else if (q.length < 2 && recent.isNotEmpty) ...[
                _Section('ÉCOUTÉS RÉCEMMENT'),
                for (final t in recent) TrackRow(track: t, onTap: () => _play(p, recent, t)),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  void _play(PlayerController p, List<Track> list, Track t) {
    p.playList(list, list.indexOf(t));
    Navigator.pop(context);
  }
}

class _Section extends StatelessWidget {
  const _Section(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(10, 14, 10, 6),
        child: Text(text, style: AuroraText.label(size: 10, color: AuroraColors.ink2)),
      );
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow();
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(children: [
          Container(width: 46, height: 46, decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(9))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(height: 12, width: 160, color: Colors.white10),
              const SizedBox(height: 8),
              Container(height: 10, width: 100, color: Colors.white10),
            ]),
          ),
        ]),
      );
}
