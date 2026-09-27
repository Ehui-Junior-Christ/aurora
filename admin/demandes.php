<?php
/* ==========================================================================
   BACK-OFFICE : DEMANDES DE PERSONNEL
   --------------------------------------------------------------------------
   1. Action (POST + CSRF) : changer le statut d'une demande
      (nouvelle → en cours → traitée)
   2. Filtre par statut (?statut=nouvelle) + pagination (50 par page)
   3. Tableau des demandes (le message complet s'ouvre en cliquant)
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-admin.php';
require_once __DIR__ . '/../includes/layout-admin.php';

$admin = exiger_admin();

// 1. Changement de statut
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $id     = entier($_POST, 'id');
    $statut = champ('statut', 20);

    if (!csrf_valide()) {
        flash('erreur', 'Session expirée. Veuillez réessayer.');
    } elseif (!isset(STATUTS_DEMANDE[$statut])) {
        flash('erreur', 'Statut inconnu.');
    } else {
        try {
            db()->prepare('UPDATE demandes SET statut = ? WHERE id = ?')->execute([$statut, $id]);
            flash('succes', 'Demande n°' . $id . ' : statut « ' . libelle_statut($statut) . ' ».');
        } catch (PDOException $erreur) {
            error_log('[CAFPM] Erreur statut demande : ' . $erreur->getMessage());
            flash('erreur', 'Une erreur est survenue.');
        }
    }
    rediriger(url_actuelle()); // Retour à la même page, mêmes filtres
}

// 2. Filtre et pagination
$filtre = parametre_get('statut', 20);
$where  = isset(STATUTS_DEMANDE[$filtre]) ? 'WHERE d.statut = ?' : '';
$params = $where ? [$filtre] : [];

$demandes = [];
$p = paginer(0);
try {
    $requete = db()->prepare("SELECT COUNT(*) FROM demandes d $where");
    $requete->execute($params);
    $p = paginer((int) $requete->fetchColumn());

    // LEFT JOIN : récupère l'email du compte client quand la demande vient de l'espace client
    $requete = db()->prepare(
        "SELECT d.*, c.email AS client_email
         FROM demandes d LEFT JOIN clients c ON c.id = d.client_id
         $where ORDER BY d.cree_le DESC, d.id DESC
         LIMIT {$p['limite']} OFFSET {$p['decalage']}"
    );
    $requete->execute($params);
    $demandes = $requete->fetchAll();
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur liste demandes : ' . $erreur->getMessage());
    flash('erreur', 'Impossible de charger les demandes.');
}

// 3. Affichage
admin_entete('Demandes de personnel', 'demandes', $admin);
?>
        <div class="filtres">
            <a href="demandes.php" class="filtre<?= $filtre === '' ? ' actif' : '' ?>">Toutes</a>
            <?php foreach (STATUTS_DEMANDE as $cle => $libelle): ?>
                <a href="?statut=<?= e($cle) ?>" class="filtre<?= $filtre === $cle ? ' actif' : '' ?>"><?= e($libelle) ?></a>
            <?php endforeach; ?>
            <span class="filtres-total"><?= $p['total'] ?> demande(s)</span>
        </div>

        <?php if (!$demandes): ?>
            <p class="espace-vide">Aucune demande pour le moment.</p>
        <?php else: ?>
        <div class="tableau-conteneur" tabindex="0">
            <table class="tableau">
                <thead>
                    <tr>
                        <th>N°</th>
                        <th>Date</th>
                        <th>Entreprise</th>
                        <th>Contact</th>
                        <th>Besoin</th>
                        <th>Statut</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($demandes as $d): ?>
                    <tr>
                        <td><?= (int) $d['id'] ?></td>
                        <td class="nowrap"><?= e(date_fr($d['cree_le'])) ?></td>
                        <td>
                            <strong><?= e($d['entreprise']) ?></strong>
                            <?php if ($d['client_email']): ?>
                                <br><span class="badge badge-client" title="Demande faite depuis l'espace client">Client : <?= e($d['client_email']) ?></span>
                            <?php endif; ?>
                        </td>
                        <td><?= e($d['contact']) ?></td>
                        <td>
                            <?= (int) $d['nombre_postes'] ?> &times; <?= e($d['profil']) ?>
                            <br><span class="texte-doux"><?= e($d['secteur']) ?></span>
                            <?php if (trim((string) $d['message']) !== ''): ?>
                                <details class="details-message">
                                    <summary>Voir le message</summary>
                                    <p><?= nl2br(e($d['message'])) ?></p>
                                </details>
                            <?php endif; ?>
                        </td>
                        <td>
                            <form method="post" action="<?= e(url_actuelle()) ?>" class="form-inline">
                                <?= champ_csrf() ?>
                                <input type="hidden" name="id" value="<?= (int) $d['id'] ?>">
                                <select name="statut" aria-label="Statut de la demande <?= (int) $d['id'] ?>">
                                    <?php foreach (STATUTS_DEMANDE as $cle => $libelle): ?>
                                        <option value="<?= e($cle) ?>"<?= $cle === $d['statut'] ? ' selected' : '' ?>><?= e($libelle) ?></option>
                                    <?php endforeach; ?>
                                </select>
                                <button type="submit" class="btn btn-secondary btn-petit">OK</button>
                            </form>
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
