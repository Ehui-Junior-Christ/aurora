<?php /* ==========================================================================
   SECTION ACTUALITÉS & OPPORTUNITÉS (boucle sur $actualites)
   "Lire la suite" mène à l'article complet : actualite.php?a=<slug>
   Sous les cartes : carrousel « Nos activités en images » (événements
   publiés ET à la une dans l'admin). Aucun événement -> pas de carrousel.
   Le carrousel lui-même est dans partials/carrousel-evenements.php
   (piloté par assets/js/evenements.js, section CARROUSEL).
   ========================================================================== */
require_once __DIR__ . '/../includes/evenements-affichage.php';
$evenements_une = evenements_a_la_une(8);
$nb_diapos      = count($evenements_une);
?>
    <section class="news-section" id="actualites">
        <div class="container">
            <div class="section-head reveal">
                <span class="section-eyebrow">En direct de CAFPM</span>
                <h2>Actualités & opportunités</h2>
            </div>

            <div class="news-grid">
                <?php foreach ($actualites as $i => $actu): ?>
                <article class="news-card reveal<?= $i ? ' delai-' . min($i, 6) : '' ?>">
                    <div class="news-meta"><time datetime="<?= e($actu['date_iso']) ?>"><?= e($actu['date']) ?></time> • <?= e($actu['categorie']) ?></div>
                    <h3><a href="<?= e(lien_site('actualite.php?a=' . $actu['slug'])) ?>"><?= e($actu['titre']) ?></a></h3>
                    <p><?= e($actu['texte']) ?></p>
                    <a href="<?= e(lien_site('actualite.php?a=' . $actu['slug'])) ?>" class="news-link" aria-label="Lire la suite : <?= e($actu['titre']) ?>">Lire la suite &rarr;</a>
                </article>
                <?php endforeach; ?>
            </div>

            <?php if ($nb_diapos): ?>
            <!-- CARROUSEL « NOS ACTIVITÉS EN IMAGES » -->
            <div class="evt-carrousel-bloc reveal">
                <div class="evt-entete">
                    <div>
                        <span class="section-eyebrow">Nos événements</span>
                        <h3 class="evt-carrousel-titre" id="titre-carrousel">Nos activités en images</h3>
                    </div>
                    <a href="<?= e(lien_site('evenements.php')) ?>" class="news-link">Tous les événements &rarr;</a>
                </div>

                <?php
                // Carrousel commun (partials/carrousel-evenements.php), format normal
                $carrousel_evenements = $evenements_une;
                $carrousel_id         = 'accueil';
                $carrousel_titre_id   = 'titre-carrousel';
                $carrousel_grand      = false;
                require __DIR__ . '/carrousel-evenements.php';
                ?>
            </div>
            <?php endif; ?>

            <div class="section-cta reveal">
                <a href="<?= e(lien_site('actualites.php')) ?>" class="btn btn-secondary">Toutes les actualités &rarr;</a>
            </div>
        </div>
    </section>
