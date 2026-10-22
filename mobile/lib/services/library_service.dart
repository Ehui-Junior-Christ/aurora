import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

import '../core/models.dart';
import 'audio_features.dart';

/// Device music library through the native MediaStore channel (MainActivity.kt).
class LibraryService {
  static const _channel = MethodChannel('aurora/media');
  final Map<int, Uint8List?> _artCache = {};

  /// Asks for the audio permission (READ_MEDIA_AUDIO on Android 13+).
  Future<bool> requestPermission() async {
    final audio = await Permission.audio.request();
    if (audio.isGranted) return true;
    final storage = await Permission.storage.request(); // Android 12 and older
    return storage.isGranted;
  }

  Future<bool> get permanentlyDenied async =>
      await Permission.audio.isPermanentlyDenied && await Permission.storage.isPermanentlyDenied;

  Future<List<Track>> scan() async {
    final raw = await _channel.invokeListMethod<Map<dynamic, dynamic>>('scan') ?? const [];
    return [
      for (final m in raw)
        Track(
          id: 'local:${m['id']}',
          mediaId: (m['id'] as num).toInt(),
          uri: m['uri'] as String,
          title: _clean(m['title'] as String? ?? '', 'Titre inconnu'),
          artist: _clean(m['artist'] as String? ?? '', 'Artiste inconnu'),
          album: _clean(m['album'] as String? ?? '', ''),
          durationMs: (m['durationMs'] as num?)?.toInt(),
          addedAt: (m['addedAt'] as num?)?.toInt(),
        ),
    ];
  }

  Future<Uint8List?> artwork(int mediaId, {int size = 512}) async {
    if (_artCache.containsKey(mediaId)) return _artCache[mediaId];
    Uint8List? bytes;
    try {
      bytes = await _channel.invokeMethod<Uint8List>('artwork', {'id': mediaId, 'size': size});
    } catch (_) {
      bytes = null;
    }
    _artCache[mediaId] = bytes;
    return bytes;
  }

  /// Offline band analysis of a local file (AudioAnalyzer.kt), or null.
  Future<AudioFeatures?> analyze(int mediaId) async {
    try {
      final bytes = await _channel.invokeMethod<Uint8List>('analyze', {'id': mediaId});
      return bytes == null ? null : AudioFeatures.parse(bytes);
    } catch (_) {
      return null;
    }
  }

  static String _clean(String v, String fallback) {
    final t = v.trim();
    return t.isEmpty || t == '<unknown>' ? fallback : t;
  }
}
