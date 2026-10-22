import 'dart:typed_data';
import 'dart:ui';

import '../visuals/visual_kit.dart' show fnv1a;

/// A playable track: a local MediaStore file or an online catalog song
/// (played through the official YouTube player once resolved).
class Track {
  Track({
    required this.id,
    required this.title,
    required this.artist,
    this.album = '',
    this.uri,
    this.mediaId,
    this.durationMs,
    this.artworkUrl,
    this.videoId,
    this.addedAt,
  });

  /// `local:<mediaId>` or `cat:<itunesId>`.
  final String id;
  final String title;
  final String artist;
  final String album;

  /// content:// URI of a local file.
  final String? uri;
  final int? mediaId;
  final int? durationMs;

  /// https artwork of an online song.
  final String? artworkUrl;

  /// Resolved YouTube video id (online songs).
  String? videoId;
  final int? addedAt;

  /// Cover bytes of a local file (loaded lazily).
  Uint8List? artworkBytes;

  /// Palette extracted from the cover (3 colours) once known.
  List<Color>? palette;

  bool get isOnline => uri == null;

  /// Stable per-track seed (fnv1a like the web's track.seed).
  int get seed => fnv1a(id);

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'artist': artist,
        'album': album,
        if (uri != null) 'uri': uri,
        if (mediaId != null) 'mediaId': mediaId,
        if (durationMs != null) 'durationMs': durationMs,
        if (artworkUrl != null) 'artworkUrl': artworkUrl,
        if (videoId != null) 'videoId': videoId,
        if (addedAt != null) 'addedAt': addedAt,
      };

  static Track? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'], title = raw['title'], artist = raw['artist'];
    if (id is! String || title is! String || artist is! String) return null;
    return Track(
      id: id,
      title: title,
      artist: artist,
      album: raw['album'] is String ? raw['album'] as String : '',
      uri: raw['uri'] is String ? raw['uri'] as String : null,
      mediaId: raw['mediaId'] is int ? raw['mediaId'] as int : null,
      durationMs: raw['durationMs'] is int ? raw['durationMs'] as int : null,
      artworkUrl: _https(raw['artworkUrl']),
      videoId: _videoId(raw['videoId']),
      addedAt: raw['addedAt'] is int ? raw['addedAt'] as int : null,
    );
  }

  static String? _https(Object? v) => v is String && v.startsWith('https://') ? v : null;
  static final _vid = RegExp(r'^[A-Za-z0-9_-]{11}$');
  static String? _videoId(Object? v) => v is String && _vid.hasMatch(v) ? v : null;

  @override
  bool operator ==(Object other) => other is Track && other.id == id;
  @override
  int get hashCode => id.hashCode;
}

class LyricsCue {
  const LyricsCue(this.time, this.text);
  final double time;
  final String text;
}

enum RepeatMode { off, all, one }

/// The 15 scenes of the web app, in the order of MODE_KEYS
/// (src/store/player-store.ts), labelled like ModeSwitcher.tsx.
enum VisualMode {
  organism('Organisme', 'organism'),
  tunnel('Tunnel', 'backdrop'),
  metaballs('Métaballs', 'metaballs'),
  particles('Particules', 'backdrop'),
  galaxy('Galaxie', 'backdrop'),
  nebula('Nébuleuse', 'nebula'),
  waves('Ondes', 'backdrop'),
  borealis('Aurore', 'borealis'),
  prism('Prisme', 'prism'),
  liquid('Liquide', 'liquid'),
  spectrum('Spectre', 'spectrum'),
  vinyl('Vinyle', 'vinyl'),
  warp('Hyperespace', 'warp'),
  mosaic('Mosaïque', 'backdrop'),
  constellation('Constellation', 'backdrop');

  const VisualMode(this.label, this.shader);
  final String label;

  /// Fragment program in /shaders (scenes made of points / instances share
  /// the backdrop shader and draw their geometry in its overlay).
  final String shader;

  /// Auto mode of the web: MODE_KEYS[track.seed % MODE_KEYS.length].
  static VisualMode forSeed(int seed) => values[seed % values.length];
}

String formatDuration(Duration d) {
  final s = d.inSeconds;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}
