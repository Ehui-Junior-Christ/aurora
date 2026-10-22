import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/models.dart';

/// Synced lyrics from lrclib.net (port of src/lib/lyrics-fetcher.ts):
/// retries when busy, main artist for duos, featuring stripped from titles.
class LyricsService {
  final Map<String, List<LyricsCue>?> _cache = {};

  Future<List<LyricsCue>?> fetch(String artist, String title) async {
    final key = '$artist|$title';
    if (_cache.containsKey(key)) return _cache[key];
    final clean = title
        .replaceAll(RegExp(r'\([^)]*(official|video|audio|lyrics|visuali[sz]er|remaster)[^)]*\)', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*[(\[]\s*(feat|ft)\.?[^)\]]*[)\]]', caseSensitive: false), '')
        .trim();
    final lead = artist.split(RegExp(r'\s*(?:&|,|\bfeat\.?|\bft\.?|\bx\b|\bet\b)\s*', caseSensitive: false)).first.trim();
    List<LyricsCue>? cues;
    try {
      if (lead.isNotEmpty && lead != 'Artiste inconnu') {
        cues = await _query({'artist_name': lead, 'track_name': clean}) ?? await _query({'q': '$lead $clean'});
      }
      cues ??= await _query({'q': clean});
    } catch (_) {
      cues = null;
    }
    _cache[key] = cues;
    return cues;
  }

  Future<List<LyricsCue>?> _query(Map<String, String> params) async {
    final uri = Uri.https('lrclib.net', '/api/search', params);
    var res = await http.get(uri, headers: {'Accept': 'application/json'}).timeout(const Duration(seconds: 8));
    for (final wait in const [700, 1800]) {
      if (res.statusCode != 429 && res.statusCode < 500) break;
      await Future<void>.delayed(Duration(milliseconds: wait));
      res = await http.get(uri).timeout(const Duration(seconds: 8));
    }
    if (res.statusCode != 200) return null;
    final list = jsonDecode(utf8.decode(res.bodyBytes));
    if (list is! List) return null;
    for (final r in list) {
      final synced = r is Map ? r['syncedLyrics'] : null;
      if (synced is String && synced.trim().isNotEmpty && synced.length < 200000) {
        final cues = parseLrc(synced);
        if (cues.isNotEmpty) return cues;
      }
    }
    return null;
  }

  static List<LyricsCue> parseLrc(String text) {
    final out = <LyricsCue>[];
    final tag = RegExp(r'\[(\d+):(\d+(?:\.\d+)?)\]');
    for (final line in const LineSplitter().convert(text)) {
      final tags = tag.allMatches(line).toList();
      if (tags.isEmpty) continue;
      final words = line.replaceAll(tag, '').trim();
      for (final m in tags) {
        out.add(LyricsCue(int.parse(m.group(1)!) * 60 + double.parse(m.group(2)!), words));
      }
    }
    out.sort((a, b) => a.time.compareTo(b.time));
    return out;
  }
}
