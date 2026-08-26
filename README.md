# AURORA — Lecteur de musique génératif

PWA de lecture musicale 100 % hors-ligne. Chaque piste génère un organisme WebGL unique : shader bruit simplex 3D, paramétré par le hash des métadonnées, coloré par la palette de la pochette.

## Stack

Next.js 15 (App Router) · React 19 · Tailwind v4 + CSS Modules · GSAP (SplitText) + Lenis · Three.js / R3F + post-processing · Web Audio API · File System Access API · IndexedDB · Web Worker · Playwright

## Lancer

```bash
npm install
npm run dev        # http://localhost:3000 (Chrome/Edge requis)
npm run build && npm run start
npm run test:e2e   # tests Playwright (npx playwright install d'abord)
```

## Fonctionnalités

**Bibliothèque** — multi-dossiers persistés (IndexedDB), restauration automatique au lancement, **4 vues** : File (recherche + drag & drop + virtualisation), Albums (grille pochettes), Playlists personnalisées, Stats d'écoute (temps total + top titres).

**Audio** — crossfade réglable (double élément + ramps de gain), égaliseur 3 bandes + **8 presets** (Rock, Pop, Jazz, Bass, Vocal…), normalisation du volume par piste (RMS), vitesse 0.5–1.5× (pitch préservé), skip silence, minuterie sommeil, boucle **A-B** (touche `B`), détection beat + **BPM réel**.

**Visuel** — 4 modes (Organisme / Tunnel / Métaballs / Particules) avec transition morphing, bloom post-processing, réglage fin par piste (fréquence/vitesse/amplitude, mémorisé), mode **ambient** (économie d'écran après 3 min d'inactivité), qualité adaptative FPS.

**Contenu & OS** — paroles `.lrc` synchronées (détection auto à côté des fichiers), export **PNG**, enregistrement **WebM**, **mini-lecteur Picture-in-Picture**, glisser-déposer un dossier depuis l'explorateur.

**PWA** — installable, offline, toast de mise à jour, onboarding première visite, UI française.

## Raccourcis

`Espace` lecture · `Shift+←/→` piste · `1-4` modes · `F` plein écran · `B` boucle A-B

## Architecture

```
src/
├── app/                  layout, page (orchestration), globals
├── components/
│   ├── Visualizer.tsx    Canvas + bloom + morph + routage modes
│   ├── Blob/Particles/Rig, scenes/{Backdrop,Tunnel,Metaballs}
│   ├── PerfGuard.tsx     qualité adaptative
│   ├── TrackList.tsx     4 onglets + virtualisation + DnD
│   ├── Timeline.tsx      waveform + seek + A-B + skip silence
│   ├── EqPanel.tsx       presets + vitesse/crossfade/sleep/…
│   ├── LyricsPanel.tsx   paroles .lrc synchronisées
│   ├── PipPlayer.tsx     Picture-in-Picture
│   ├── VisualTuner.tsx   réglages visuels par piste
│   └── … (Header, PlayerBar, Onboarding, UpdateToast, CustomCursor…)
├── lib/
│   ├── audio-engine.ts   double élément, crossfade, EQ, gains
│   ├── metadata.worker.ts Web Worker (tags + palette OffscreenCanvas)
│   ├── analysis.ts       peaks + RMS (waveform, normalisation)
│   ├── bpm.ts / beat.ts / lyrics.ts / db.ts / fs-scanner.ts
│   └── shaders/          GLSL (simplex, vertex, fragment)
├── store/player-store.ts zustand (bibliothèque, lecture, préférences)
tests/e2e/               smoke Playwright
.github/workflows/ci.yml build + e2e
```

## Déploiement

L'app est 100 % client-side : déployable tel quel sur Vercel/Netlify (HTTPS requis pour la File System Access API). Chaque visiteur choisit son propre dossier musical — rien ne transite par un serveur.
