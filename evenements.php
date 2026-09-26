<?php
/* ==========================================================================
   LISTE DES ÉVÉNEMENTS : evenements.php (?page=2, 3...)
   --------------------------------------------------------------------------
   Tous les événements PUBLIÉS (gérés dans l'admin : Événements), 9 par page,
   les plus récents d'abord. Chaque carte mène au détail :
   evenement.php?e=<slug>. Le sélecteur « Actualités | Événements » permet
   de revenir à la liste des actualités.
   ========================================================================== */

require_once __DIR__ . '/partials/amorce.php';
require_once __DIR__ . '/includes/evenements-affichage.php';

const EVENEMENTS_PAR_PAGE = 9;

// Numéro de page demandé (ramené entre 1 et le nombre de pages par evenements_publies)
$page_demandee = (int) parametre_get('page', 6);
$liste         = evenements_publies(max(1, $page_demandee), EVENEMENTS_PAR_PAGE);
$page          = $liste['page'];
$pages         = $liste['pages'];

$titre_page       = 'Nos événements' . ($page > 1 ? ' (page ' . $page . ')' : '');
$description_page = "Journées de recrutement, formations, rencontres : revivez en photos et en vidéos les activités de CAFPM à Abidjan.";
$page_active      = 'actualites';

$bandeau = [
    'fil'      => [['Accueil', 'index.php'], ['Actualités', 'actualites.php'], ['Événements', null]],
    'surtitre' => 'Nos activités en images',
    'titre'    => 'Événements',
    'texte'    => 'Journées de recrutement, sessions de formation, rencontres avec nos partenaires : revivez les activités de CAFPM en photos et en vidéos.',
];

/**
 * Lien vers une page de la liste (la page 1 n'a pas de paramètre).
 */
function lien_page_evenements(int $numero): string
{
    return lien_site('evenements.php' . ($numero > 1 ? '?page=' . $numero : ''));
}

require __DIR__ . '/partials/header.php';
?>
    <main id="contenu">
        <?php require __DIR__ . '/partials/bandeau-page.php'; ?>

        <section class="page-section">
            <div class="container">
                <?php $onglet_actif = 'evenements'; require __DIR__ . '/partials/onglets-actualites.php'; ?>

                <?php if (!$liste['evenements']): ?>
                <!-- Aucun événement publié (ou base de données indisponible) -->
                <div class="evt-vide">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <h2>Aucun événement publié pour le moment</h2>
                    <p>Les photos et vidéos de nos prochaines activités (journées de recrutement, formations, rencontres) seront publiées ici. En attendant, retrouvez nos dernières actualités.</p>
                    <a href="<?= e(lien_site('actualites.php')) ?>" class="btn btn-secondary">Voir les actualités &rarr;</a>
                </div>
                <?php else: ?>
                <p class="evt-total"><?= $liste['total'] ?> événement<?= $liste['total'] > 1 ? 's' : '' ?> publié<?= $liste['total'] > 1 ? 's' : '' ?><?= $pages > 1 ? ' · page ' . $page . ' sur ' . $pages : '' ?></p>

                <div class="evt-grille">
                    <?php foreach ($liste['evenements'] as $evenement): ?>
                    <?php afficher_carte_evenement($evenement, 'h2'); ?>
                    <?php endforeach; ?>
                </div>

                <?php if ($pages > 1): ?>
                <nav class="pagination" aria-label="Pages des événements">
                    <?php if ($page > 1): ?>
                    <a href="<?= e(lien_page_evenements($page - 1)) ?>" class="pagination-lien" rel="prev" aria-label="Page précédente">&larr; <span class="pagination-texte">Précédente</span></a>
                    <?php endif; ?>
                    <ol>
                        <?php for ($n = 1; $n <= $pages; $n++): ?>
                        <li><a href="<?= e(lien_page_evenements($n)) ?>" class="pagination-lien"<?= $n === $page ? ' aria-current="page"' : '' ?>><span class="sr-only">Page </span><?= $n ?></a></li>
                        <?php endfor; ?>
                    </ol>
                    <?php if ($page < $pages): ?>
                    <a href="<?= e(lien_page_evenements($page + 1)) ?>" class="pagination-lien" rel="next" aria-label="Page suivante"><span class="pagination-texte">Suivante</span> &rarr;</a>
                    <?php endif; ?>
                </nav>
                <?php endif; ?>
                <?php endif; ?>
            </div>
        </section>
    </main>
<?php require __DIR__ . '/partials/fin-page.php'; ?>
