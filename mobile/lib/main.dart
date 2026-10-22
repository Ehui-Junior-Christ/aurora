import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/theme.dart';
import 'player/player_controller.dart';
import 'ui/shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await JustAudioBackground.init(
    androidNotificationChannelId: 'com.aurora.audio',
    androidNotificationChannelName: 'Lecture AURORA',
    androidNotificationOngoing: true,
    androidNotificationIcon: 'drawable/ic_stat_aurora',
  );
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: AuroraColors.bg,
  ));
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  final prefs = await SharedPreferences.getInstance();
  final player = PlayerController(prefs);
  await player.init();
  runApp(ChangeNotifierProvider.value(value: player, child: const AuroraApp()));
}

class AuroraApp extends StatelessWidget {
  const AuroraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AURORA',
      debugShowCheckedModeBanner: false,
      theme: buildAuroraTheme(),
      home: const Shell(),
    );
  }
}
