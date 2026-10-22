import 'dart:convert';
import 'dart:ui';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../core/models.dart';

/// Online songs: iTunes catalog search (free, no quota), the bundled
/// "Tendances" charts, and YouTube video resolution at play time only
/// (the YouTube Data API quota is shared by every user of the app).
class OnlineService {
  OnlineService(this._prefs);
  final SharedPreferences _prefs;

  static const _ytKey = String.fromEnvironment('YT_API_KEY');
  static const trendsUrl =
      'https://raw.githubusercontent.com/Ehui-Junior-Christ/aurora/feat/overhaul/public/trends.json';
  static const _timeout = Duration(seconds: 10);

  String get _country {
    final cc = PlatformDispatcher.instance.locale.countryCode?.toLowerCase();
    return (cc != null && cc.length == 2) ? cc : 'fr';
  }

  // ---------------------------------------------------------------- catalog
  Future<List<Track>> search(String query) async {
    final q = query.trim();
    if (q.length < 2) return const [];
    final uri = Uri.https('itunes.apple.com', '/search', {
      'term': q,
      'entity': 'song',
      'limit': '30',
      'country': _country,
    });
    final res = await http.get(uri).timeout(_timeout);
    if (res.statusCode != 200) throw OnlineError('Recherche indisponible (HTTP ${res.statusCode}).');
    final json = jsonDecode(utf8.decode(res.bodyBytes));
    final results = json is Map && json['results'] is List ? json['results'] as List : const [];
    return results.map(_fromItunes).whereType<Track>().toList();
  }

  Track? _fromItunes(Object? r) {
    if (r is! Map) return null;
    final id = r['trackId'], title = r['trackName'], artist = r['artistName'];
    if (id == null || title is! String || artist is! String) return null;
    final art = r['artworkUrl100'];
    return Track(
      id: 'cat:$id',
      title: title,
      artist: artist,
      album: r['collectionName'] is String ? r['collectionName'] as String : '',
      durationMs: r['trackTimeMillis'] is int ? r['trackTimeMillis'] as int : null,
      artworkUrl: art is String && art.startsWith('https://') ? art.replaceAll('100x100bb', '600x600bb') : null,
    );
  }

  // ----------------------------------------------------------------- trends
  Future<Map<String, List<Track>>> trends() async {
    final res = await http.get(Uri.parse(trendsUrl)).timeout(_timeout);
    if (res.statusCode != 200) throw OnlineError('Tendances indisponibles.');
    final json = jsonDecode(utf8.decode(res.bodyBytes));
    final charts = json is Map && json['charts'] is Map ? json['charts'] as Map : const {};
    final out = <String, List<Track>>{};
    for (final cc in ['fr', 'us', 'gb']) {
      final list = charts[cc];
      if (list is! List) continue;
      out[cc] = [
        for (final e in list)
          if (e is Map && e['id'] != null && e['title'] is String && e['artist'] is String)
            Track(
              id: 'cat:${e['id']}',
              title: e['title'] as String,
              artist: e['artist'] as String,
              album: e['album'] is String ? e['album'] as String : '',
              durationMs: e['durationMs'] is int ? e['durationMs'] as int : null,
              artworkUrl: e['artwork'] is String && (e['artwork'] as String).startsWith('https://')
                  ? e['artwork'] as String
                  : null,
              videoId: e['videoId'] is String ? e['videoId'] as String : null,
            ),
      ];
    }
    return out;
  }

  // ------------------------------------------------------------ YouTube id
  static final _norm = RegExp(r'[^a-z0-9]+');
  String _key(Track t) =>
      'yt:${t.artist.toLowerCase().replaceAll(_norm, ' ').trim()}|${t.title.toLowerCase().replaceAll(_norm, ' ').trim()}';

  /// Returns the YouTube video id for [t]: bundled id, device cache, then one
  /// search (100 quota units) + one videos.list (1 unit), remembered forever.
  Future<String> resolveVideo(Track t) async {
    if (t.videoId != null) return t.videoId!;
    final cached = _prefs.getString(_key(t));
    if (cached != null) return t.videoId = cached;
    if (_ytKey.isEmpty) throw OnlineError('Clé API YouTube manquante dans cette version de l\'app.');

    final search = await http
        .get(Uri.https('www.googleapis.com', '/youtube/v3/search', {
          'part': 'snippet',
          'type': 'video',
          'maxResults': '8',
          'videoEmbeddable': 'true',
          'videoCategoryId': '10',
          'q': '${t.artist} ${t.title} audio',
          'key': _ytKey,
        }))
        .timeout(_timeout);
    if (search.statusCode == 403 || search.statusCode == 429) {
      throw OnlineError('Quota YouTube du jour épuisé. Réessaie plus tard.');
    }
    if (search.statusCode != 200) throw OnlineError('YouTube indisponible (HTTP ${search.statusCode}).');
    final items = (jsonDecode(search.body)['items'] as List?) ?? const [];
    final candidates = <({String id, String title, String channel})>[];
    for (final it in items) {
      final idMap = it is Map ? it['id'] : null;
      final id = idMap is Map ? idMap['videoId'] : null;
      final sn = it is Map ? it['snippet'] : null;
      if (id is String && sn is Map) {
        candidates.add((id: id, title: _unescape('${sn['title']}'), channel: '${sn['channelTitle']}'));
      }
    }
    if (candidates.isEmpty) throw OnlineError('Aucune vidéo trouvée pour ce titre.');

    // Durations (1 unit) to prefer the studio version.
    final durations = <String, int>{};
    try {
      final v = await http
          .get(Uri.https('www.googleapis.com', '/youtube/v3/videos',
              {'part': 'contentDetails', 'id': candidates.map((c) => c.id).join(','), 'key': _ytKey}))
          .timeout(_timeout);
      for (final it in (jsonDecode(v.body)['items'] as List?) ?? const []) {
        durations['${it['id']}'] = _isoSeconds('${it['contentDetails']?['duration']}');
      }
    } catch (_) {}

    final want = (t.durationMs ?? 0) / 1000;
    final title = t.title.toLowerCase();
    final artist = t.artist.toLowerCase().split(RegExp(r'\s*(&|,|feat\.?|ft\.?)\s*')).first;
    var best = candidates.first;
    var bestScore = -1e9;
    for (final c in candidates) {
      final ct = c.title.toLowerCase();
      var s = 0.0;
      if (ct.contains(title)) s += 30;
      if (ct.contains(artist) || c.channel.toLowerCase().contains(artist)) s += 20;
      if (c.channel.endsWith(' - Topic') || c.channel.toLowerCase().contains('vevo')) s += 15;
      for (final bad in ['live', 'cover', 'karaoke', 'remix', 'sped up', '8d', 'slowed', 'reverb']) {
        if (ct.contains(bad) && !title.contains(bad)) s -= 25;
      }
      final d = durations[c.id];
      if (want > 0 && d != null && d > 0) s -= (d - want).abs() / 2;
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    await _prefs.setString(_key(t), best.id);
    return t.videoId = best.id;
  }

  static int _isoSeconds(String iso) {
    final m = RegExp(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?').firstMatch(iso);
    if (m == null) return 0;
    int g(int i) => int.tryParse(m.group(i) ?? '') ?? 0;
    return g(1) * 3600 + g(2) * 60 + g(3);
  }

  static String _unescape(String s) => s
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');
}

class OnlineError implements Exception {
  OnlineError(this.message);
  final String message;
  @override
  String toString() => message;
}
