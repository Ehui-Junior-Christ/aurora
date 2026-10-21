# Vidéo promo AURORA (motion design)

- `index.html` : l'animation (GSAP + canvas), pilotée image par image par `window.renderAt(t)`.
  Les scènes sont calées sur la voix off (décalée de 1,2 s) et sur le tempo (120 BPM).
- `music.py` : la musique, synthétisée de zéro (aucun sample, aucun droit) → `marketing/video/musique.wav`.
- `render.mjs` : rend les images (`node marketing/video-src/render.mjs <dossier> 30`), via Edge + Playwright.

Assemblage (ffmpeg) : voix off normalisée et décalée de 1,2 s, musique baissée sous la voix
(sidechain), mixage à -14 LUFS, puis H.264 1080p30. Utilise les mockups de `marketing/mockups/`.
