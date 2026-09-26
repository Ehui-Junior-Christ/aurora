<?php
/* ==========================================================================
   LISTE DES ACTUALITÉS : actualites.php
   --------------------------------------------------------------------------
   Affiche toutes les actualités du tableau $actualites (config/contenu.php).
   Chaque carte mène à l'article complet : actualite.php?a=<slug>
   Le sélecteur « Actualités | Événements » en haut mène à evenements.php.
   Tout en haut : grand carrousel des activités de CAFPM (événements publiés
   et « à la une » dans l'admin) ; absent s'il n'y a aucun événement.
   ========================================================================== */

require_once __DIR__ . '/partials/amorce.php';
require_once __DIR__ . '/includes/evenements-affichage.php';

$evenements_une = evenements_a_la_une(8); // Diapositives du grand carrousel

$titre_page       = 'Actualités & opportunités';
$description_page = "Les dernières actualités de CAFPM : offres de missions, formations et services RH à Abidjan.";
$page_active      = 'actualites';

$bandeau = [
    'fil'      => [['Accueil', 'index.php'], ['Actualités', null]],
    'surtitre' => 'En direct de CAFPM',
    'titre'    => 'Actualités & opportunités',
    'texte'    => 'Offres de missions, nouvelles formations, conseils RH : suivez la vie de CAFPM et les opportunités du moment.',
];

require __DIR__ . '/partials/header.php';
?>
    <main id="contenu">
        <?php require __DIR__ . '/partials/bandeau-page.php'; ?>

        <?php if ($evenements_une): ?>
        <!-- GRAND CARROUSEL « NOS ACTIVITÉS EN IMAGES » -->
        <section class="page-section evt-carrousel-page" aria-labelledby="titre-carrousel-page">
            <div class="container">
                <div class="evt-entete">
                    <div>
                        <span class="section-eyebrow">Nos événements</span>
                        <h2 class="evt-carrousel-titre" id="titre-carrousel-page">Nos activités en images</h2>
                    </div>
                    <a href="<?= e(lien_site('evenements.php')) ?>" class="news-link">Tous les événements &rarr;</a>
                </div>
                <?php
                $carrousel_evenements = $evenements_une;
                $carrousel_id         = 'actualites';
                $carrousel_titre_id   = 'titre-carrousel-page';
                $carrousel_grand      = true;
                require __DIR__ . '/partials/carrousel-evenements.php';
                ?>
            </div>
        </section>
        <?php endif; ?>

        <section class="page-section">
            <div class="container">
                <?php $onglet_actif = 'actualites'; require __DIR__ . '/partials/onglets-actualites.php'; ?>

                <div class="news-grid news-grid-page">
                    <?php foreach ($actualites as $actu): ?>
                    <article class="news-card">
                        <div class="news-meta"><time datetime="<?= e($actu['date_iso']) ?>"><?= e($actu['date']) ?></time> • <?= e($actu['categorie']) ?></div>
                        <h2 class="news-card-titre"><a href="<?= e(lien_site('actualite.php?a=' . $actu['slug'])) ?>"><?= e($actu['titre']) ?></a></h2>
                        <p><?= e($actu['texte']) ?></p>
                        <a href="<?= e(lien_site('actualite.php?a=' . $actu['slug'])) ?>" class="news-link" aria-label="Lire la suite : <?= e($actu['titre']) ?>">Lire la suite &rarr;</a>
                    </article>
                    <?php endforeach; ?>
                </div>

                <div class="encart-newsletter">
                    <div>
                        <h2>Ne manquez aucune opportunité</h2>
                        <p>Abonnez-vous à notre newsletter en bas de page, ou créez votre profil candidat pour être contacté dès qu'une mission correspond à vos compétences.</p>
                    </div>
                    <button type="button" class="btn btn-primary modal-trigger" data-target="drawer-candidat">Créer mon profil &rarr;</button>
                </div>
            </div>
        </section>
    </main>
<?php require __DIR__ . '/partials/fin-page.php'; ?>
