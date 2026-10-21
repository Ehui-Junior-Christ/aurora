# Mockups marketing

Captures de l'app avec 12 morceaux **fictifs** (titres, artistes et pochettes
générés : aucun droit d'auteur ni droit à l'image en jeu), puis mise en cadre
ordinateur / téléphone en 4K. Sortie : `marketing/mockups/` (ignoré par git).

1. Build spécial : `NEXT_PUBLIC_MOCKUP=1 npm run build` (expose l'état de l'app
   au script ; sans cette variable, rien n'est exposé).
2. Pochettes : `node marketing/tools/covers.mjs out/mock-covers`
3. Servir : `npx serve out -l 4177`
4. Captures : `node marketing/tools/capture.mjs out/mock-covers marketing/mockups/screens`
5. Cadres : `node marketing/tools/frames.mjs marketing/mockups/screens marketing/mockups`

Les scripts utilisent Edge (`channel: "msedge"`) via Playwright.
