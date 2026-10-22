import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// YouTube player states (same codes as the IFrame API).
enum YtState { unknown, unstarted, ended, playing, paused, buffering, cued }

/// Official YouTube player for online songs, running in a WebView that opens
/// AURORA's hosted player page (public/yt-player.html on the website).
///
/// The page is served from the real web origin, exactly like the website where
/// the embed works. A locally generated page (the youtube_player_iframe
/// package) had a fake origin: YouTube's iframe refused to talk to it, so the
/// player never became ready and videos never loaded.
class YtWebPlayer {
  YtWebPlayer() {
    final params = WebViewPlatform.instance is AndroidWebViewPlatform
        ? AndroidWebViewControllerCreationParams()
        : const PlatformWebViewControllerCreationParams();
    web = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..addJavaScriptChannel('AuroraYT', onMessageReceived: (m) => _onMessage(m.message))
      ..setNavigationDelegate(NavigationDelegate(
        // Stay on the player page (and the host's anti-bot redirect); links
        // such as the YouTube logo must not navigate the player away.
        onNavigationRequest: (r) {
          if (!r.isMainFrame) return NavigationDecision.navigate; // the YouTube iframe
          final host = Uri.tryParse(r.url)?.host ?? '';
          return host == pageHost || host.isEmpty
              ? NavigationDecision.navigate
              : NavigationDecision.prevent;
        },
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? false) debugPrint('AURORA-YT page error: ${e.description}');
        },
      ))
      ..setOnConsoleMessage((m) => debugPrint('AURORA-YT console: ${m.message}'));
    final platform = web.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
    }
    web.loadRequest(Uri.parse(pageUrl));
  }

  static const pageHost = 'aurora-music.free.je';
  static const pageUrl = 'https://$pageHost/yt-player.html';

  late final WebViewController web;
  final Completer<void> _ready = Completer<void>();

  YtState state = YtState.unknown;
  Duration position = Duration.zero;
  Duration duration = Duration.zero;
  int? errorCode;

  final _changes = StreamController<void>.broadcast();

  /// Fires on every state / time / error update.
  Stream<void> get changes => _changes.stream;

  bool get isReady => _ready.isCompleted;

  void _onMessage(String raw) {
    Object? msg;
    try {
      msg = jsonDecode(raw);
    } catch (_) {
      return;
    }
    if (msg is! Map) return;
    switch (msg['type']) {
      case 'ready':
        if (!_ready.isCompleted) _ready.complete();
        if (state == YtState.unknown) state = YtState.unstarted;
      case 'state':
        state = switch (msg['s']) {
          -1 => YtState.unstarted,
          0 => YtState.ended,
          1 => YtState.playing,
          2 => YtState.paused,
          3 => YtState.buffering,
          5 => YtState.cued,
          _ => state,
        };
        if (state == YtState.playing) errorCode = null;
      case 'time':
        final t = msg['t'], d = msg['d'];
        if (t is num && t.isFinite) position = Duration(milliseconds: (t * 1000).round());
        if (d is num && d.isFinite && d > 0) duration = Duration(milliseconds: (d * 1000).round());
      case 'error':
        final c = msg['code'];
        errorCode = c is num ? c.toInt() : -1;
      case 'blocked':
        debugPrint('AURORA-YT autoplay blocked');
      default:
        return;
    }
    _changes.add(null);
  }

  Future<void> _js(String code) async {
    if (!_ready.isCompleted) {
      try {
        await _ready.future.timeout(const Duration(seconds: 25));
      } catch (_) {
        debugPrint('AURORA-YT not ready, sending anyway: $code');
      }
    }
    try {
      await web.runJavaScript(code);
    } catch (e) {
      debugPrint('AURORA-YT js failed: $e');
    }
  }

  static final _id = RegExp(r'^[A-Za-z0-9_-]{11}$');

  Future<void> load(String videoId, {double start = 0}) async {
    if (!_id.hasMatch(videoId)) {
      errorCode = 2;
      _changes.add(null);
      return;
    }
    errorCode = null;
    position = Duration.zero;
    duration = Duration.zero;
    await _js("window.aurora && window.aurora.load('$videoId', ${start.toStringAsFixed(2)})");
  }

  Future<void> play() => _js('window.aurora && window.aurora.play()');
  Future<void> pause() => _js('window.aurora && window.aurora.pause()');
  Future<void> stop() => _js('window.aurora && window.aurora.stop()');
  Future<void> seek(Duration to) => _js('window.aurora && window.aurora.seek(${(to.inMilliseconds / 1000).toStringAsFixed(2)})');

  void dispose() {
    _changes.close();
  }
}

/// French message for a YouTube player error code.
String youtubeErrorMessage(int code) => switch (code) {
      2 => 'Vidéo YouTube introuvable pour ce titre.',
      5 => 'Ce titre ne peut pas être lu sur ce téléphone.',
      100 => 'Cette vidéo YouTube a été supprimée ou est privée.',
      101 || 150 => 'L\'artiste n\'autorise pas la lecture de ce titre hors de YouTube.',
      152 || 153 => 'YouTube a refusé le lecteur intégré pour ce titre.',
      _ => 'Lecture YouTube impossible pour ce titre (code $code).',
    };
