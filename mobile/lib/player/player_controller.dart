import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/models.dart';
import '../services/audio_features.dart';
import '../services/library_service.dart';
import '../services/lyrics_service.dart';
import '../services/online_service.dart';
import '../services/palette.dart';
import '../services/yt_web_player.dart';

/// App state + playback engine (port of the web store, phase 1).
/// Local files: just_audio (background, lock screen, notification).
/// Online songs: the official YouTube player (visible, foreground only).
class PlayerController extends ChangeNotifier {
  PlayerController(this._prefs)
      : library = LibraryService(),
        online = OnlineService(_prefs),
        lyricsService = LyricsService(),
        paletteService = PaletteService();

  final SharedPreferences _prefs;
  final LibraryService library;
  final OnlineService online;
  final LyricsService lyricsService;
  final PaletteService paletteService;

  final AudioPlayer audio = AudioPlayer();
  /// Created on the first online song only: an idle YouTube WebView showed up
  /// as a black 16:9 box over the start page.
  YtWebPlayer? _yt;
  YtWebPlayer get yt {
    final existing = _yt;
    if (existing != null) return existing;
    final c = YtWebPlayer();
    _yt = c;
    _listenYoutube(c);
    return c;
  }

  // ------------------------------------------------------------------ state
  List<Track> localTracks = [];
  bool scanning = false;
  bool libraryLoaded = false;
  String? libraryError;

  List<Track> queue = [];
  int index = -1;
  Track? get current => index >= 0 && index < queue.length ? queue[index] : null;

  bool playing = false;
  bool loading = false;
  /// Playback position, published separately so that ticking time does not
  /// rebuild the whole UI (only widgets listening to [positionN] update).
  final ValueNotifier<Duration> positionN = ValueNotifier(Duration.zero);
  Duration get position => positionN.value;
  set position(Duration v) => positionN.value = v;

  /// Band energies of the current local track (offline analysis, 50 fps).
  AudioFeatures? _features;
  Duration duration = Duration.zero;
  bool shuffle = false;
  RepeatMode repeat = RepeatMode.off;
  VisualMode visualMode = VisualMode.organism;
  bool autoMode = true;
  bool videoVisible = true;
  String? error;

  List<Color> palette = PaletteService.fallback;

  /// Cover of the current track as a GPU texture (Vinyle / Mosaïque scenes).
  ui.Image? coverImage;
  List<LyricsCue> lyrics = const [];
  bool lyricsLoading = false;

  Map<String, List<Track>> trends = {};
  List<Track> favorites = [];
  List<Track> recent = [];

  /// True once an online song was played: the Shell then mounts the player.
  bool youtubeUsed = false;

  final List<StreamSubscription<dynamic>> _subs = [];
  bool _ytActive = false;
  int _windowCenter = 0;
  bool _settingWindow = false;
  int _playToken = 0;

  // ------------------------------------------------------------------- init
  Future<void> init() async {
    visualMode = VisualMode.values.firstWhere((m) => m.name == _prefs.getString('visualMode'),
        orElse: () => VisualMode.organism);
    autoMode = _prefs.getBool('autoMode') ?? true;
    videoVisible = _prefs.getBool('videoVisible') ?? true;
    shuffle = _prefs.getBool('shuffle') ?? false;
    repeat = RepeatMode.values[(_prefs.getInt('repeat') ?? 0).clamp(0, 2)];
    favorites = _loadList('favorites');
    recent = _loadList('recent');

    _subs.add(audio.playerStateStream.listen((s) {
      if (_ytActive) return;
      playing = s.playing && s.processingState != ProcessingState.completed;
      loading = s.processingState == ProcessingState.loading || s.processingState == ProcessingState.buffering;
      if (s.processingState == ProcessingState.completed) _onEnded();
      notifyListeners();
    }));
    _subs.add(audio.positionStream.listen((p) {
      if (_ytActive) return;
      position = p;
    }));
    // Notification / lock-screen previous & next: the player holds a small
    // window [previous, current, next]; when the system moves to a neighbour,
    // we play that track (which rebuilds the window around it).
    _subs.add(audio.currentIndexStream.listen((ci) {
      if (_ytActive || _settingWindow || ci == null || ci == _windowCenter || queue.isEmpty) return;
      if (repeat == RepeatMode.one && ci > _windowCenter) {
        scheduleMicrotask(() => _playAt(index));
        return;
      }
      final n = queue.length;
      final target = ((ci < _windowCenter ? index - 1 : index + 1) % n + n) % n;
      scheduleMicrotask(() => _playAt(target));
    }));
    _subs.add(audio.durationStream.listen((d) {
      if (_ytActive || d == null) return;
      duration = d;
      notifyListeners();
    }));
    unawaited(loadTrends());
    if (_prefs.getBool('libraryGranted') ?? false) unawaited(scanLibrary(ask: false));
  }

  void _listenYoutube(YtWebPlayer c) {
    YtState last = YtState.unknown;
    int? lastError;
    _subs.add(c.changes.listen((_) {
      if (!_ytActive) return;
      position = c.position;
      final st = c.state;
      final changed = st != last || c.errorCode != lastError;
      if (c.duration > Duration.zero && c.duration != duration) {
        duration = c.duration;
        notifyListeners();
      }
      if (!changed) return;
      last = st;
      lastError = c.errorCode;
      debugPrint('AURORA-YT state $st error ${c.errorCode}');
      playing = st == YtState.playing;
      loading = st == YtState.buffering || st == YtState.unstarted;
      if (st == YtState.ended) _onEnded();
      if (c.errorCode != null) {
        error = youtubeErrorMessage(c.errorCode!);
        loading = false;
      }
      notifyListeners();
    }));
  }

  List<Track> _loadList(String key) {
    try {
      final raw = jsonDecode(_prefs.getString(key) ?? '[]');
      return raw is List ? raw.map(Track.fromJson).whereType<Track>().toList() : [];
    } catch (_) {
      return [];
    }
  }

  void _saveList(String key, List<Track> list) =>
      _prefs.setString(key, jsonEncode(list.map((t) => t.toJson()).toList()));

  // ---------------------------------------------------------------- library
  Future<void> scanLibrary({bool ask = true}) async {
    if (scanning) return;
    scanning = true;
    libraryError = null;
    notifyListeners();
    try {
      final ok = ask ? await library.requestPermission() : true;
      if (!ok) {
        libraryError = 'Autorise l\'accès à ta musique pour lire tes fichiers.';
        return;
      }
      await _prefs.setBool('libraryGranted', true);
      localTracks = await library.scan();
      libraryLoaded = true;
      if (localTracks.isEmpty) libraryError = 'Aucun morceau trouvé sur cet appareil.';
    } catch (e) {
      libraryError = 'Lecture de la bibliothèque impossible : $e';
    } finally {
      scanning = false;
      notifyListeners();
    }
  }

  /// Charts from GitHub; retried with back-off (a busy start-up or a slow
  /// network made the single attempt fail and the section never appeared).
  Future<void> loadTrends() async {
    for (final wait in const [0, 4, 12, 30]) {
      if (wait > 0) await Future<void>.delayed(Duration(seconds: wait));
      try {
        trends = await online.trends();
        notifyListeners();
        return;
      } catch (_) {
        // try again; offline: the section just stays hidden
      }
    }
  }

  // --------------------------------------------------------------- playback
  /// Plays [list] starting at [start] (it becomes the queue).
  Future<void> playList(List<Track> list, int start) async {
    if (list.isEmpty) return;
    queue = List.of(list);
    if (shuffle) {
      final first = queue.removeAt(start);
      queue.shuffle(math.Random());
      queue.insert(0, first);
      start = 0;
    }
    await _playAt(start);
  }

  Future<void> playTrack(Track t) => playList([t], 0);

  Future<void> _playAt(int i) async {
    if (i < 0 || i >= queue.length) return;
    final token = ++_playToken;
    index = i;
    final t = queue[i];
    error = null;
    position = Duration.zero;
    duration = Duration(milliseconds: t.durationMs ?? 0);
    lyrics = const [];
    _features = null;
    loading = true;
    // Web: MODE_KEYS[track.seed % MODE_KEYS.length] with a stable fnv1a seed.
    if (autoMode) visualMode = VisualMode.forSeed(t.seed);
    notifyListeners();
    unawaited(_loadArtAndPalette(t));
    unawaited(_loadLyrics(t));
    if (!t.isOnline && t.mediaId != null) unawaited(_loadFeatures(t));

    try {
      if (t.isOnline) {
        // Never await stop() on an idle player: with the background audio
        // service it may never complete, which froze online playback.
        if (audio.processingState != ProcessingState.idle) unawaited(audio.stop());
        final id = await online.resolveVideo(t);
        if (token != _playToken) return;
        _ytActive = true;
        if (!youtubeUsed) {
          youtubeUsed = true;
          notifyListeners();
        }
        debugPrint('AURORA-YT load $id (ready ${yt.isReady})');
        await yt.load(id);
        if (token != _playToken) return;
        _remember(t);
        // Safety net: if it did not start (autoplay refused), ask again.
        unawaited(Future<void>.delayed(const Duration(seconds: 5), () async {
          if (token != _playToken || !_ytActive) return;
          final st = yt.state;
          if (yt.errorCode == null && st != YtState.playing && st != YtState.buffering && st != YtState.paused) {
            await yt.play();
          }
        }));
      } else {
        if (_ytActive) {
          _ytActive = false;
          await _yt?.stop();
        }
        final artUri = await _artFileUri(t);
        if (token != _playToken) return;
        final n = queue.length;
        final wrap = repeat == RepeatMode.all && n > 1;
        final prevT = i > 0 ? queue[i - 1] : (wrap ? queue[n - 1] : null);
        final nextT = i + 1 < n ? queue[i + 1] : (wrap ? queue[0] : null);
        _windowCenter = prevT != null ? 1 : 0;
        _settingWindow = true;
        try {
          await audio.setAudioSource(
            ConcatenatingAudioSource(children: [
              if (prevT != null) _sourceFor(prevT),
              _sourceFor(t, art: artUri),
              if (nextT != null) _sourceFor(nextT),
            ]),
            initialIndex: _windowCenter,
          );
        } finally {
          _settingWindow = false;
        }
        await audio.play();
      }
    } on OnlineError catch (e) {
      if (token != _playToken) return;
      error = e.message;
      loading = false;
      notifyListeners();
    } catch (e) {
      if (token != _playToken) return;
      error = 'Lecture impossible : $e';
      loading = false;
      notifyListeners();
    }
  }

  /// Player source for a queue neighbour. Online songs get a short silent
  /// placeholder: reaching it switches to the YouTube player.
  AudioSource _sourceFor(Track t, {Uri? art}) {
    final item = MediaItem(
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      artUri: art ?? (t.artworkUrl != null ? Uri.parse(t.artworkUrl!) : null),
      duration: t.durationMs != null ? Duration(milliseconds: t.durationMs!) : null,
    );
    if (t.isOnline || t.uri == null) {
      return SilenceAudioSource(duration: const Duration(seconds: 1), tag: item);
    }
    return AudioSource.uri(Uri.parse(t.uri!), tag: item);
  }

  Future<void> toggle() async {
    if (current == null) return;
    if (_ytActive) {
      playing ? await yt.pause() : await yt.play();
    } else {
      playing ? await audio.pause() : await audio.play();
    }
  }

  Future<void> next({bool auto = false}) async {
    if (queue.isEmpty) return;
    if (auto && repeat == RepeatMode.one) {
      await seek(Duration.zero);
      if (_ytActive) await yt.play();
      return;
    }
    if (index + 1 < queue.length) {
      await _playAt(index + 1);
    } else if (repeat == RepeatMode.all || !auto) {
      await _playAt(0);
    } else {
      playing = false;
      notifyListeners();
    }
  }

  Future<void> prev() async {
    if (position > const Duration(seconds: 3)) return seek(Duration.zero);
    await _playAt(index > 0 ? index - 1 : 0);
  }

  Future<void> seek(Duration to) async {
    if (_ytActive) {
      await yt.seek(to);
    } else {
      await audio.seek(to);
    }
    position = to;
    notifyListeners();
  }

  void _onEnded() {
    // Defer: stream callbacks must not start new loads synchronously.
    scheduleMicrotask(() => next(auto: true));
  }

  void toggleShuffle() {
    shuffle = !shuffle;
    _prefs.setBool('shuffle', shuffle);
    notifyListeners();
  }

  void cycleRepeat() {
    repeat = RepeatMode.values[(repeat.index + 1) % 3];
    _prefs.setInt('repeat', repeat.index);
    notifyListeners();
  }

  void setVisualMode(VisualMode m) {
    visualMode = m;
    autoMode = false;
    _prefs.setString('visualMode', m.name);
    _prefs.setBool('autoMode', false);
    notifyListeners();
  }

  void setAutoMode(bool v) {
    autoMode = v;
    _prefs.setBool('autoMode', v);
    final t = current;
    if (v && t != null) visualMode = VisualMode.forSeed(t.seed);
    notifyListeners();
  }

  void setVideoVisible(bool v) {
    videoVisible = v;
    _prefs.setBool('videoVisible', v);
    notifyListeners();
  }

  void dismissError() {
    error = null;
    notifyListeners();
  }

  // -------------------------------------------------------------- favorites
  bool isFavorite(Track t) => favorites.any((f) => f.id == t.id);

  void toggleFavorite(Track t) {
    if (isFavorite(t)) {
      favorites.removeWhere((f) => f.id == t.id);
    } else {
      favorites.insert(0, t);
    }
    _saveList('favorites', favorites);
    notifyListeners();
  }

  void _remember(Track t) {
    if (!t.isOnline) return;
    recent.removeWhere((r) => r.id == t.id);
    recent.insert(0, t);
    if (recent.length > 50) recent = recent.sublist(0, 50);
    _saveList('recent', recent);
  }

  // ----------------------------------------------------- art, palette, lyrics
  Future<void> _loadArtAndPalette(Track t) async {
    List<Color> p = PaletteService.fallback;
    Uint8List? bytes;
    if (!t.isOnline && t.mediaId != null) {
      bytes = t.artworkBytes ??= await library.artwork(t.mediaId!);
      if (bytes != null) p = await paletteService.fromBytes(t.id, bytes);
    } else if (t.artworkUrl != null) {
      try {
        final res = await http.get(Uri.parse(t.artworkUrl!)).timeout(const Duration(seconds: 8));
        if (res.statusCode == 200) bytes = res.bodyBytes;
      } catch (_) {}
      p = bytes != null ? await paletteService.fromBytes(t.artworkUrl!, bytes) : PaletteService.fallback;
    }
    ui.Image? img;
    if (bytes != null) {
      try {
        final codec = await ui.instantiateImageCodec(bytes, targetWidth: 512);
        img = (await codec.getNextFrame()).image;
      } catch (_) {}
    }
    t.palette = p;
    if (current?.id == t.id) {
      palette = p;
      coverImage?.dispose();
      coverImage = img;
      notifyListeners();
    } else {
      img?.dispose();
    }
  }

  Future<void> _loadLyrics(Track t) async {
    lyricsLoading = true;
    final cues = await lyricsService.fetch(t.artist, t.title);
    if (current?.id != t.id) return;
    lyrics = cues ?? const [];
    lyricsLoading = false;
    notifyListeners();
  }

  /// Lock-screen artwork needs a file:// URI.
  Future<Uri?> _artFileUri(Track t) async {
    if (t.mediaId == null) return null;
    final bytes = t.artworkBytes ?? await library.artwork(t.mediaId!);
    if (bytes == null) return null;
    t.artworkBytes = bytes;
    final dir = await getTemporaryDirectory();
    final f = File('${dir.path}/art_${t.mediaId}.jpg');
    if (!await f.exists()) await f.writeAsBytes(bytes, flush: true);
    return f.uri;
  }

  Future<void> _loadFeatures(Track t) async {
    final f = await library.analyze(t.mediaId!);
    if (current?.id == t.id) _features = f;
  }

  /// Live band energies (bass, mid, high, 0..1) for the visuals at the exact
  /// playback position. Local tracks use the offline analysis; YouTube audio
  /// cannot be analysed, so online songs get a soft 120 BPM estimate.
  Bands bandsNow(double clock) {
    if (!playing) return const Bands(0, 0, 0);
    final f = _features;
    if (f != null && !_ytActive) {
      final pos = audio.position.inMicroseconds / 1e6;
      return f.at(pos);
    }
    const beat = 0.5;
    final k = math.exp(-((clock % beat) / beat) * 6);
    return Bands(k * .8, .35 + .15 * math.sin(clock * 1.3), .25 + .15 * k);
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    audio.dispose();
    positionN.dispose();
    _yt?.dispose();
    super.dispose();
  }
}
