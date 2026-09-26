<?php
/* ==========================================================================
   AFFICHAGE DES ÉVÉNEMENTS (pages publiques)
   --------------------------------------------------------------------------
   Petites fonctions d'affichage partagées par :
     - partials/actualites.php  : carrousel « Nos activités en images »
     - evenements.php           : liste paginée des événements
     - evenement.php?e=<slug>   : page détail + galerie
   Les données viennent de includes/evenements.php (voir son en-tête).
   Tout texte affiché passe par e() (protection contre l'injection HTML).
   ========================================================================== */

require_once __DIR__ . '/evenements.php';

/**
 * Lien vers la page détail d'un événement : evenement.php?e=<slug>
 */
function lien_evenement(string $slug): string
{
    return lien_site('evenement.php?e=' . rawurlencode($slug));
}

/**
 * Nombre de photos / vidéos d'un événement, en toutes lettres :
 * "3 photos · 1 vidéo", "1 photo", "" (aucun média).
 */
function resume_medias_evenement(array $evenement): string
{
    $photos = 0;
    $videos = 0;
    foreach ($evenement['medias'] as $media) {
        $media['type'] === 'image' ? $photos++ : $videos++;
    }

    $morceaux = [];
    if ($photos) {
        $morceaux[] = $photos . ' photo' . ($photos > 1 ? 's' : '');
    }
    if ($videos) {
        $morceaux[] = $videos . ' vidéo' . ($videos > 1 ? 's' : '');
    }
    return implode(' · ', $morceaux);
}

/**
 * "18 septembre 2026 • Abidjan, Cocody" (le lieu est facultatif).
 */
function meta_evenement(array $evenement): string
{
    return $evenement['date_affichee'] . ($evenement['lieu'] !== '' ? ' • ' . $evenement['lieu'] : '');
}

/**
 * Adresse d'une image de média : chemin local (via lien_site) ou URL https
 * absolue (miniature YouTube) laissée telle quelle.
 */
function src_media(string $chemin): string
{
    return preg_match('#^https://#', $chemin) ? $chemin : lien_site($chemin);
}

/**
 * Affiche le VISUEL de couverture d'un événement (non cliquable) :
 *   - photo              : <img> (object-fit: cover)
 *   - vidéo YouTube      : sa miniature + pastille "lecture"
 *   - vidéo fichier      : <video muted preload="metadata"> (1re image)
 *   - aucun média        : visuel de remplacement aux couleurs de CAFPM
 * $prioritaire = true : image chargée tout de suite (1re diapositive),
 * sinon chargement différé (loading="lazy").
 */
function afficher_visuel_evenement(array $evenement, bool $prioritaire = false): void
{
    $media   = $evenement['couverture'];
    $alt     = $media && $media['legende'] !== '' ? $media['legende'] : $evenement['titre'];
    $loading = $prioritaire ? 'eager' : 'lazy';

    if ($media === null) {
        echo '<div class="evt-visuel evt-visuel-vide" aria-hidden="true"><span>' . e(SITE_NOM) . "</span></div>\n";
        return;
    }

    if ($media['type'] === 'video') {
        // #t=0.1 : le navigateur affiche la première image de la vidéo
        echo '<video class="evt-visuel" src="' . e(lien_site($media['url'])) . '#t=0.1" muted preload="metadata" playsinline'
            . ' aria-label="' . e($alt) . '"></video>' . "\n";
        echo '<span class="evt-pastille-lecture" aria-hidden="true">' . icone_lecture() . "</span>\n";
        return;
    }

    echo '<img class="evt-visuel" src="' . e(src_media($media['miniature'])) . '" alt="' . e($alt) . '"'
        . ' loading="' . $loading . '" decoding="async" draggable="false">' . "\n";
    if ($media['type'] === 'youtube') {
        echo '<span class="evt-pastille-lecture" aria-hidden="true">' . icone_lecture() . "</span>\n";
    }
}

/**
 * Icône "lecture" (triangle) en SVG, décorative.
 */
function icone_lecture(): string
{
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z"/></svg>';
}

/**
 * Affiche la description (texte brut saisi dans l'admin) :
 * un paragraphe par bloc séparé d'une ligne vide, retours à la ligne conservés.
 */
function afficher_description_evenement(string $description): void
{
    $blocs = preg_split('/\R\s*\R/u', trim($description)) ?: [];
    foreach ($blocs as $bloc) {
        if (trim($bloc) !== '') {
            echo '<p>' . nl2br(e(trim($bloc)), false) . "</p>\n";
        }
    }
}

/**
 * Carte d'un événement (liste evenements.php et « Autres événements »).
 * $niveau : balise du titre (h2 sur la liste, h3 sous un intertitre).
 */
function afficher_carte_evenement(array $evenement, string $niveau = 'h2'): void
{
    $lien   = lien_evenement($evenement['slug']);
    $medias = resume_medias_evenement($evenement);
    ?>
                    <article class="evt-carte">
                        <div class="evt-carte-media">
                            <?php afficher_visuel_evenement($evenement); ?>
                            <?php if ($medias !== ''): ?>
                            <span class="evt-compteur"><?= e($medias) ?></span>
                            <?php endif; ?>
                        </div>
                        <div class="evt-carte-corps">
                            <div class="news-meta"><time datetime="<?= e($evenement['date_evenement']) ?>"><?= e($evenement['date_affichee']) ?></time><?= $evenement['lieu'] !== '' ? ' • ' . e($evenement['lieu']) : '' ?></div>
                            <<?= $niveau ?> class="evt-carte-titre"><a href="<?= e($lien) ?>"><?= e($evenement['titre']) ?></a></<?= $niveau ?>>
                            <?php if ($evenement['resume'] !== ''): ?>
                            <p><?= e($evenement['resume']) ?></p>
                            <?php endif; ?>
                            <span class="news-link" aria-hidden="true">Voir l'événement &rarr;</span>
                        </div>
                    </article>
    <?php
}
