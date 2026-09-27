<?php
/* ==========================================================================
   DÉTAIL D'UN ÉVÉNEMENT : evenement.php?e=<slug>
   --------------------------------------------------------------------------
   Description complète + galerie de tous les médias (ordre choisi dans
   l'admin) :
   - photos        : grille cliquable, ouverture dans la visionneuse plein
                     écran (assets/js/evenements.js, section VISIONNEUSE)
   - vidéos fichier: lecteur <video controls>
   - vidéos YouTube: « façade » (miniature + bouton lecture) remplacée par le
                     lecteur YouTube au clic : rien n'est chargé depuis
                     YouTube tant que le visiteur ne lance pas la vidéo.
   Événement inconnu ou non publié -> page 404.
   ========================================================================== */

require_once __DIR__ . '/partials/amorce.php';
require_once __DIR__ . '/includes/evenements-affichage.php';

$slug      = parametre_get('e', 170); // Texte uniquement (un tableau ?e[]= est ignoré)
$evenement = evenement_par_slug($slug);

// Événement inconnu ou non publié : page 404 (AVANT tout affichage)
if ($evenement === null) {
    require __DIR__ . '/404.php';
    exit;
}

// Adresse écrite autrement (majuscules, espace final...) : redirection vers l'adresse
// officielle, pour qu'un événement n'ait qu'une seule adresse (référencement, partages)
if (($_GET['e'] ?? null) !== $evenement['slug']) {
    header('Location: ' . lien_evenement($evenement['slug']), true, 301);
    exit;
}

// Photos (visionneuse) et vidéos, dans l'ordre de l'admin
$medias      = $evenement['medias'];
$nb_photos   = count(array_filter($medias, fn ($m) => $m['type'] === 'image'));
$resume      = resume_medias_evenement($evenement);

// Autres événements publiés (les plus récents, sauf celui-ci)
$autres = array_slice(array_values(array_filter(
    evenements_publies(1, 4)['evenements'],
    fn ($autre) => $autre['id'] !== $evenement['id']
)), 0, 3);

// Balises <title> et meta description
$titre_page       = $evenement['titre'];
$description_page = $evenement['resume'] !== ''
    ? $evenement['resume']
    : mb_substr(trim((string) preg_replace('/\s+/u', ' ', $evenement['description'])), 0, 160);
$page_active      = 'actualites';

$bandeau = [
    'fil'   => [['Accueil', 'index.php'], ['Actualités', 'actualites.php'], ['Événements', 'evenements.php'], [$evenement['titre'], null]],
    'meta'  => meta_evenement($evenement),
    'titre' => $evenement['titre'],
    'texte' => $evenement['resume'],
];

require __DIR__ . '/partials/header.php';
?>
    <main id="contenu">
        <?php require __DIR__ . '/partials/bandeau-page.php'; ?>

        <section class="page-section">
            <div class="container grille-article">
                <article class="prose article-corps">
                    <p class="article-date">Événement du <time datetime="<?= e($evenement['date_evenement']) ?>"><?= e($evenement['date_affichee']) ?></time><?= $evenement['lieu'] !== '' ? ' • ' . e($evenement['lieu']) : '' ?></p>
                    <?php if (trim($evenement['description']) !== ''): ?>
                    <?php afficher_description_evenement($evenement['description']); ?>
                    <?php elseif ($evenement['resume'] !== ''): ?>
                    <p><?= e($evenement['resume']) ?></p>
                    <?php endif; ?>

                    <p class="article-retour"><a href="<?= e(lien_site('evenements.php')) ?>">&larr; Tous les événements</a></p>
                </article>

                <aside class="article-aside">
                    <div class="carte">
                        <h2>En bref</h2>
                        <ul class="liste-criteres">
                            <li><strong>Date</strong><span><?= e($evenement['date_affichee']) ?></span></li>
                            <?php if ($evenement['lieu'] !== ''): ?>
                            <li><strong>Lieu</strong><span><?= e($evenement['lieu']) ?></span></li>
                            <?php endif; ?>
                            <?php if ($resume !== ''): ?>
                            <li><strong>Galerie</strong><span><?= e($resume) ?></span></li>
                            <?php endif; ?>
                        </ul>
                        <?php if ($medias): ?>
                        <a href="#galerie" class="btn btn-primary btn-bloc">Voir la galerie &darr;</a>
                        <?php endif; ?>
                    </div>
                    <div class="carte carte-accent">
                        <h2>Participer à nos activités</h2>
                        <p>Créez votre profil candidat pour être informé de nos prochaines journées de recrutement et formations.</p>
                        <button type="button" class="btn btn-secondary btn-bloc modal-trigger" data-target="drawer-candidat">Créer mon profil &rarr;</button>
                    </div>
                </aside>
            </div>
        </section>

        <?php if ($medias): ?>
        <!-- GALERIE : photos (visionneuse), vidéos, YouTube (façade) -->
        <section class="page-section page-section-blanche" id="galerie" aria-labelledby="titre-galerie">
            <div class="container">
                <div class="section-head">
                    <span class="section-eyebrow">En images</span>
                    <h2 id="titre-galerie">Galerie <span class="evt-galerie-nb">(<?= e($resume) ?>)</span></h2>
                    <?php if ($nb_photos): ?>
                    <p class="evt-galerie-aide">Cliquez sur une photo pour l'afficher en plein écran.</p>
                    <?php endif; ?>
                </div>

                <ul class="evt-galerie">
                    <?php foreach ($medias as $media): ?>
                    <?php $alt = $media['legende'] !== '' ? $media['legende'] : $evenement['titre']; ?>
                    <li class="evt-galerie-item evt-galerie-<?= e($media['type']) ?>">
                        <figure>
                            <?php if ($media['type'] === 'image'): ?>
                            <button type="button" class="evt-galerie-bouton" data-visionneuse data-src="<?= e(lien_site($media['url'])) ?>" data-legende="<?= e($media['legende']) ?>" data-alt="<?= e($alt) ?>" aria-label="Agrandir la photo : <?= e($alt) ?>">
                                <img src="<?= e(lien_site($media['miniature'])) ?>" alt="<?= e($alt) ?>" loading="lazy" decoding="async">
                                <span class="evt-galerie-loupe" aria-hidden="true">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                                </span>
                            </button>
                            <?php elseif ($media['type'] === 'video'): ?>
                            <div class="evt-galerie-cadre">
                                <video src="<?= e(lien_site($media['url'])) ?>" controls controlslist="nodownload noremoteplayback" disablepictureinpicture preload="metadata" playsinline aria-label="<?= e($alt) ?>"></video>
                            </div>
                            <?php else: ?>
                            <div class="evt-galerie-cadre">
                                <button type="button" class="yt-facade" data-youtube-id="<?= e($media['youtube_id']) ?>" data-titre="<?= e($alt) ?>" aria-label="Lire la vidéo : <?= e($alt) ?>">
                                    <img src="<?= e($media['miniature']) ?>" alt="" loading="lazy" decoding="async">
                                    <span class="evt-pastille-lecture" aria-hidden="true"><?= icone_lecture() ?></span>
                                </button>
                            </div>
                            <?php endif; ?>
                            <?php if ($media['legende'] !== ''): ?>
                            <figcaption><?= e($media['legende']) ?></figcaption>
                            <?php endif; ?>
                        </figure>
                    </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </section>
        <?php endif; ?>

        <?php if ($autres): ?>
        <!-- AUTRES ÉVÉNEMENTS -->
        <section class="page-section" aria-labelledby="titre-autres">
            <div class="container">
                <div class="section-head evt-entete">
                    <div>
                        <span class="section-eyebrow">À découvrir aussi</span>
                        <h2 id="titre-autres">Autres événements</h2>
                    </div>
                    <a href="<?= e(lien_site('evenements.php')) ?>" class="news-link">Tous les événements &rarr;</a>
                </div>
                <div class="evt-grille">
                    <?php foreach ($autres as $autre): ?>
                    <?php afficher_carte_evenement($autre, 'h3'); ?>
                    <?php endforeach; ?>
                </div>
            </div>
        </section>
        <?php endif; ?>

        <?php if ($nb_photos): ?>
        <!-- VISIONNEUSE PLEIN ÉCRAN (remplie et pilotée par assets/js/evenements.js) -->
        <div class="visionneuse" id="visionneuse" role="dialog" aria-modal="true" aria-label="Visionneuse de photos" hidden>
            <div class="visionneuse-haut">
                <span class="visionneuse-compteur" aria-live="polite"></span>
                <button type="button" class="visionneuse-bouton visionneuse-fermer" aria-label="Fermer la visionneuse (Échap)">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <figure class="visionneuse-scene">
                <img class="visionneuse-image" src="data:," alt="">
                <figcaption class="visionneuse-legende"></figcaption>
            </figure>
            <button type="button" class="visionneuse-bouton visionneuse-prec" aria-label="Photo précédente">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button type="button" class="visionneuse-bouton visionneuse-suiv" aria-label="Photo suivante">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <?php endif; ?>
    </main>
<?php require __DIR__ . '/partials/fin-page.php'; ?>
