# AURORA mobile (Flutter)

Version native de l'app AURORA. Même code pour Android, et plus tard Windows (et iOS).

## Construire l'APK Android

```bash
cd mobile
flutter build apk --release --dart-define=YT_API_KEY=<clé YouTube Data API v3>
# → build/app/outputs/flutter-apk/app-release.apk
```

Sans `YT_API_KEY`, tout fonctionne sauf la lecture des titres en ligne qui ne sont pas
dans les Tendances (ceux-là ont déjà leur vidéo YouTube, sans quota).

## Ce que fait la phase 1

- Bibliothèque locale (MediaStore, `MainActivity.kt`) — lecture **en arrière-plan, écran éteint**,
  avec notification et commandes sur l'écran de verrouillage (`just_audio_background`).
- Recherche catalogue iTunes (sans quota), Tendances (Apple Music, `public/trends.json` du dépôt),
  titres en ligne lus par le lecteur YouTube officiel (visible, au premier plan uniquement :
  conditions d'utilisation de YouTube).
- Écran « En lecture », dock, file, favoris, aléatoire / répétition, paroles synchronisées (lrclib).
- Scènes génératives en shaders natifs (`shaders/*.frag`) aux couleurs de la pochette :
  Organisme, Aurore, Liquide, Nébuleuse.

## Structure

- `lib/core` : thème (jetons du design web), modèles.
- `lib/services` : bibliothèque, catalogue / YouTube, paroles, palette.
- `lib/player/player_controller.dart` : état et moteur de lecture.
- `lib/ui` : écrans et composants.
- `shaders/` : scènes visuelles GLSL.
