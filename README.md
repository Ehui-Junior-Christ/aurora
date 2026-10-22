<div align="center">
  <img src="./public/icons/icon-512x512.png" alt="Aurora Logo" width="128" />
  <h1>✨ AURORA</h1>
  <p><b>Le lecteur de musique génératif offline-first.</b></p>
  
  <p>
    <a href="#télécharger">📥 Télécharger</a> •
    <a href="#fonctionnalités">🔥 Fonctionnalités</a> •
    <a href="#technologies">🛠️ Technologies</a>
  </p>
</div>

---

## 🌟 Présentation
**Aurora** est bien plus qu'un simple lecteur de musique. C'est une expérience immersive conçue pour s'adapter à votre bibliothèque musicale. 
Il lit vos fichiers `.mp3`, `.flac`, `.wav` locaux et hybride intelligemment l'expérience avec les résultats en ligne via YouTube (grâce à l'API Invidious) tout en offrant des visualisations réactives et des paroles synchronisées.

## 🚀 Télécharger & Utiliser
Vous pouvez essayer l'application directement depuis votre navigateur ou télécharger les versions natives :

* 🌐 **[Web (Vercel)](https://aurora-theta-rust.vercel.app/)**
* 📱 **[Android (.apk)](https://github.com/Ehui-Junior-Christ/aurora/releases/latest/download/aurora-mobile.apk)**
* 💻 **[Windows (.exe)](https://github.com/Ehui-Junior-Christ/aurora/releases/latest/download/AURORA.exe)**

## 🔥 Fonctionnalités
- 🎵 **Offline-first** : Lisez vos musiques stockées sur votre appareil sans aucune connexion internet.
- 🌍 **Recherche en Ligne** : Impossible de trouver un morceau ? Aurora bascule automatiquement sur les flux YouTube pour le jouer.
- 🎨 **Fonds Génératifs (WebGL)** : Le fond s'adapte en temps réel aux fréquences audio et aux couleurs de la pochette de l'album !
- 📝 **Paroles Synchronisées (LRC)** : Affichage automatique des paroles, avec possibilité de décaler la synchronisation pour les musiques vidéo (YouTube).
- 🎛️ **Égaliseur (EQ)** : Contrôlez les Basses, Médiums et Aigus.
- 🗂️ **Playlists & Favoris** : Organisez vos musiques comme bon vous semble, le tout sauvegardé dans votre navigateur/téléphone (IndexedDB).
- 🎧 **Aurora Mix** : transitions DJ automatiques (panneau audio → « Aurora Mix ») — voir ci-dessous.

## 🎧 Aurora Mix

Chaque piste locale est analysée une seule fois (worker, cache IndexedDB) :
carte de tempo et grille de temps, premier temps fort, phrases de 8 mesures,
enveloppe d'énergie, intro / outro, tonalité (Krumhansl-Schmuckler → Camelot)
et loudness. Les transitions démarrent sur une frontière de phrase de la piste
sortante, l'entrante est calée sur un temps fort, son tempo est aligné
(`playbackRate`, hauteur préservée, ±6 % ou demi/double tempo) puis verrouillé
en phase, et revient doucement à son tempo natif après le mix. Styles choisis
automatiquement (ou forcés) : **Blend** avec échange des basses sur le temps
fort, **Filtre** (passe-haut / passe-bas), **Écho** (sortie en delay), **Cut**
(bascule sur le drop) et **Fondu** à puissance constante pour les morceaux
incompatibles. Un limiteur protège le master. « Mix harmonique » réordonne la
lecture aléatoire (tonalité, BPM, énergie) sans toucher la bibliothèque ni la
file d'attente. Pistes YouTube : fondus de volume entre deux lecteurs IFrame
officiels (aucune capture audio).

API pour les visuels (lecture par frame, sans re-render) :

```ts
import { getBeatClock, getMixProgress, usePlayer } from "@/store/player-store";
const clock = getBeatClock(trackId); // { bpm, beat, phase, bar, barPhase, phrasePhase, confidence } | null
const progress = getMixProgress();   // 0..1 pendant une transition, sinon null
const mix = usePlayer((s) => s.mixTransition); // { style, progress, toTitle, sync, bars, harmonic } | null (~10 Hz)
```

Tests DSP sur signaux synthétiques : `node --import ./tests/mix/register.mjs tests/mix/<tempo|key|structure|planner|sync|short>.test.ts`.

## 🛠️ Technologies
Aurora est construit avec des technologies modernes et performantes :
- **Framework** : [Next.js 15](https://nextjs.org/) + React 19
- **Style** : [Tailwind CSS 4](https://tailwindcss.com/)
- **Visualisations 3D** : [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) & Three.js
- **Animations** : [GSAP](https://gsap.com/) & Lenis (Smooth Scroll)
- **Base de Données Locale** : IndexedDB
- **Applications Natives** : [Capacitor](https://capacitorjs.com/) (Android) & [Electron](https://www.electronjs.org/) (Windows)

## 🏗️ Développement

1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Lancer le serveur de développement :
   ```bash
   npm run dev
   ```

## 📜 Licence
Développé avec passion.
