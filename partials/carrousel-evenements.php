<?php
/* ==========================================================================
   CARROUSEL D'ÉVÉNEMENTS (réutilisable)
   --------------------------------------------------------------------------
   Utilisé sur l'accueil (section Actualités) et, en grand, sur actualites.php.
   Variables à définir AVANT d'inclure ce fichier :
     $carrousel_evenements : liste d'événements (ex. evenements_a_la_une(8))
     $carrousel_id         : identifiant unique sur la page (ex. 'accueil')
     $carrousel_titre_id   : id du titre qui nomme le carrousel (accessibilité)
     $carrousel_grand      : true = version grand format (photo plein cadre,
                             texte posé en bas sur un dégradé sombre)
   Piloté par assets/js/evenements.js (section CARROUSEL) ; sans JavaScript,
   les diapositives défilent au doigt / à la barre de défilement.
   Liste vide -> rien n'est affiché.
   ========================================================================== */
require_once __DIR__ . '/../includes/evenements-affichage.php';

$nb_diapos = count($carrousel_evenements);
if ($nb_diapos === 0) {
    return; // Aucun événement : pas de carrousel
}
$piste_id = 'carrousel-piste-' . $carrousel_id;
?>
                <div class="carrousel<?= !empty($carrousel_grand) ? ' carrousel-grand' : '' ?>" role="region" aria-roledescription="carrousel" aria-labelledby="<?= e($carrousel_titre_id) ?>" data-carrousel>
                    <div class="carrousel-fenetre">
                        <div class="carrousel-piste" id="<?= e($piste_id) ?>" aria-live="polite">
                            <?php foreach ($carrousel_evenements as $i => $evenement): ?>
                            <?php
                            $couverture = $evenement['couverture'];
                            $medias     = resume_medias_evenement($evenement);
                            $lien       = lien_evenement($evenement['slug']);
                            ?>
                            <div class="carrousel-diapo" role="group" aria-roledescription="diapositive" aria-label="<?= ($i + 1) . ' sur ' . $nb_diapos ?>">
                                <div class="carrousel-media">
                                    <?php if ($couverture !== null && $couverture['type'] === 'youtube'): ?>
                                    <button type="button" class="yt-facade" data-youtube-id="<?= e($couverture['youtube_id']) ?>" data-titre="<?= e($couverture['legende'] !== '' ? $couverture['legende'] : $evenement['titre']) ?>" aria-label="Lire la vidéo : <?= e($evenement['titre']) ?>">
                                        <img src="<?= e($couverture['miniature']) ?>" alt="" loading="<?= $i ? 'lazy' : 'eager' ?>" decoding="async" draggable="false">
                                        <span class="evt-pastille-lecture" aria-hidden="true"><?= icone_lecture() ?></span>
                                    </button>
                                    <?php else: ?>
                                    <a href="<?= e($lien) ?>" class="carrousel-media-lien" tabindex="-1" aria-hidden="true" draggable="false">
                                        <?php afficher_visuel_evenement($evenement, $i === 0); ?>
                                    </a>
                                    <?php endif; ?>
                                    <?php if ($medias !== ''): ?>
                                    <span class="evt-compteur"><?= e($medias) ?></span>
                                    <?php endif; ?>
                                </div>
                                <div class="carrousel-texte">
                                    <div class="carrousel-meta"><time datetime="<?= e($evenement['date_evenement']) ?>"><?= e($evenement['date_affichee']) ?></time><?php if ($evenement['lieu'] !== ''): ?> <span aria-hidden="true">•</span> <?= e($evenement['lieu']) ?><?php endif; ?></div>
                                    <?php if (!empty($carrousel_grand)): ?>
                                    <h3 class="carrousel-titre"><?= e($evenement['titre']) ?></h3>
                                    <?php else: ?>
                                    <h4 class="carrousel-titre"><?= e($evenement['titre']) ?></h4>
                                    <?php endif; ?>
                                    <?php if ($evenement['resume'] !== ''): ?>
                                    <p class="carrousel-resume"><?= e($evenement['resume']) ?></p>
                                    <?php endif; ?>
                                    <a href="<?= e($lien) ?>" class="btn btn-primary" draggable="false">Voir l'événement <span class="sr-only">: <?= e($evenement['titre']) ?></span>&rarr;</a>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>

                    <?php if ($nb_diapos > 1): ?>
                    <!-- Commandes (affichées par le JavaScript : inutiles sans lui) -->
                    <div class="carrousel-commandes" hidden>
                        <button type="button" class="carrousel-bouton carrousel-pause" aria-controls="<?= e($piste_id) ?>" aria-label="Arrêter le défilement automatique">
                            <svg class="icone-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>
                            <svg class="icone-lecture" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z"/></svg>
                        </button>
                        <div class="carrousel-points" role="group" aria-label="Choisir une diapositive">
                            <?php foreach ($carrousel_evenements as $i => $evenement): ?>
                            <button type="button" class="carrousel-point" aria-controls="<?= e($piste_id) ?>" aria-label="Diapositive <?= ($i + 1) . ' : ' . e($evenement['titre']) ?>"<?= $i === 0 ? ' aria-current="true"' : '' ?>></button>
                            <?php endforeach; ?>
                        </div>
                        <div class="carrousel-fleches">
                            <button type="button" class="carrousel-bouton carrousel-prec" aria-controls="<?= e($piste_id) ?>" aria-label="Diapositive précédente">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            <button type="button" class="carrousel-bouton carrousel-suiv" aria-controls="<?= e($piste_id) ?>" aria-label="Diapositive suivante">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>
                    </div>
                    <?php endif; ?>
                </div>
