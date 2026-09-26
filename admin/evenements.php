<?php
/* ==========================================================================
   BACK-OFFICE : ÉVÉNEMENTS (galerie des activités de CAFPM)
   --------------------------------------------------------------------------
   1. Action (POST + CSRF) : "supprimer" un événement
      (ses médias sont effacés : lignes en base ET fichiers sur le disque)
   2. Liste paginée (50 par page), plus récents d'abord, avec vignette,
      nombre de médias, publié / à la une
   3. Tableau : Modifier (evenement-modifier.php?id=), Voir sur le site
      (../evenement.php?e=<slug>), Supprimer (confirmation data-confirm)
   Création et modification : admin/evenement-modifier.php
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-admin.php';
require_once __DIR__ . '/../includes/layout-admin.php';
require_once __DIR__ . '/../includes/evenements.php';

$admin = exiger_admin();

// 1. Suppression d'un événement
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = champ('action', 20);
    $id     = (int) ($_POST['id'] ?? 0);

    if (!csrf_valide()) {
        flash('erreur', 'Session expirée. Veuillez réessayer.');
    } elseif ($action === 'supprimer') {
        try {
            if (supprimer_evenement($id)) {
                flash('succes', 'Événement supprimé, avec ses photos et vidéos.');
            } else {
                flash('erreur', 'Événement introuvable (déjà supprimé ?).');
            }
        } catch (PDOException $erreur) {
            error_log('[CAFPM] Erreur suppression événement : ' . $erreur->getMessage());
            flash('erreur', 'Une erreur est survenue.');
        }
    }
    rediriger(url_actuelle());
}

// 2. Liste des événements
$evenements = [];
$medias     = [];
$p = paginer(0);
try {
    $p = paginer((int) db()->query('SELECT COUNT(*) FROM evenements')->fetchColumn());
    $evenements = db()->query(
        "SELECT e.id, e.titre, e.slug, e.date_evenement, e.lieu, e.publie, e.a_la_une,
                (SELECT COUNT(*) FROM evenement_medias m WHERE m.evenement_id = e.id) AS nb_medias
         FROM evenements e ORDER BY e.date_evenement DESC, e.id DESC
         LIMIT {$p['limite']} OFFSET {$p['decalage']}"
    )->fetchAll();
    $medias = medias_des_evenements(array_column($evenements, 'id'));
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur liste événements : ' . $erreur->getMessage());
    flash('erreur', 'Impossible de charger les événements.');
}

/**
 * Vignette d'un événement : 1re image (ou miniature YouTube), sinon icône vidéo.
 */
function vignette_evenement(array $liste): string
{
    foreach ($liste as $media) {
        if ($media['miniature'] !== '') {
            $source = $media['type'] === 'image' ? '../' . $media['miniature'] : $media['miniature'];
            return '<img src="' . e($source) . '" alt="" class="evt-vignette" loading="lazy">';
        }
    }
    if ($liste) {
        return '<span class="evt-vignette evt-vignette-icone" title="Vidéo">&#9654;</span>';
    }
    return '<span class="evt-vignette evt-vignette-icone" title="Aucun média">&ndash;</span>';
}

// 3. Affichage
admin_entete('Événements', 'evenements', $admin);
?>
        <div class="filtres">
            <a href="evenement-modifier.php" class="btn btn-primary btn-petit">+ Nouvel événement</a>
            <span class="filtres-total"><?= $p['total'] ?> événement(s)</span>
        </div>

        <?php if (!$evenements): ?>
            <p class="espace-vide">Aucun événement. <a href="evenement-modifier.php">Créer le premier</a></p>
        <?php else: ?>
        <div class="tableau-conteneur" tabindex="0">
            <table class="tableau">
                <thead>
                    <tr>
                        <th></th>
                        <th>Titre</th>
                        <th>Date</th>
                        <th>Lieu</th>
                        <th>Médias</th>
                        <th>Publié</th>
                        <th>À la une</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($evenements as $ev): ?>
                    <tr>
                        <td><?= vignette_evenement($medias[(int) $ev['id']] ?? []) ?></td>
                        <td><strong><?= e($ev['titre']) ?></strong></td>
                        <td class="nowrap"><?= e(date_fr($ev['date_evenement'], false)) ?></td>
                        <td><?= e($ev['lieu'] ?: '-') ?></td>
                        <td><?= (int) $ev['nb_medias'] ?></td>
                        <td><span class="badge <?= $ev['publie'] ? 'badge-traitee' : 'badge-client' ?>"><?= $ev['publie'] ? 'Oui' : 'Non' ?></span></td>
                        <td><span class="badge <?= $ev['a_la_une'] ? 'badge-nouvelle' : 'badge-client' ?>"><?= $ev['a_la_une'] ? 'Oui' : 'Non' ?></span></td>
                        <td>
                            <div class="evt-actions">
                                <a href="evenement-modifier.php?id=<?= (int) $ev['id'] ?>" class="btn btn-secondary btn-petit">Modifier</a>
                                <?php if ($ev['publie']): ?>
                                    <a href="../evenement.php?e=<?= e(rawurlencode($ev['slug'])) ?>" class="btn btn-secondary btn-petit" target="_blank" rel="noopener">Voir sur le site</a>
                                <?php endif; ?>
                                <!-- data-confirm : admin.js demande une confirmation avant l'envoi -->
                                <form method="post" action="<?= e(url_actuelle()) ?>" data-confirm="Supprimer l'événement « <?= e($ev['titre']) ?> » et tous ses médias ?">
                                    <?= champ_csrf() ?>
                                    <input type="hidden" name="action" value="supprimer">
                                    <input type="hidden" name="id" value="<?= (int) $ev['id'] ?>">
                                    <button type="submit" class="btn btn-danger btn-petit">Supprimer</button>
                                </form>
                            </div>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php afficher_pagination($p); ?>
        <?php endif; ?>
<?php
admin_pied();
