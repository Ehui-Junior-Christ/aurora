<?php
/* ==========================================================================
   BACK-OFFICE : CANDIDATS (CVthèque)
   --------------------------------------------------------------------------
   1. Action (POST + CSRF) : changer le statut d'un candidat
      (seuls les "Disponible" apparaissent dans la recherche publique du site)
   2. Recherche : mot-clé (métier, domaine ou nom) + filtres domaine et statut
   3. Pagination (50 par page)
   4. Tableau des candidats avec lien de téléchargement du CV
      (admin/cv.php : les CV ne sont jamais accessibles directement)
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-admin.php';
require_once __DIR__ . '/../includes/layout-admin.php';
require_once __DIR__ . '/../config/contenu.php'; // Liste $domaines

$admin = exiger_admin();

// 1. Changement de statut d'un candidat
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $id     = entier($_POST, 'id');
    $statut = champ('statut', 20);

    if (!csrf_valide()) {
        flash('erreur', 'Session expirée. Veuillez réessayer.');
    } elseif (!isset(STATUTS_CANDIDAT[$statut])) {
        flash('erreur', 'Statut inconnu.');
    } else {
        try {
            db()->prepare('UPDATE candidats SET statut = ? WHERE id = ?')->execute([$statut, $id]);
            flash('succes', 'Candidat n°' . $id . ' : statut « ' . STATUTS_CANDIDAT[$statut] . ' ».');
        } catch (PDOException $erreur) {
            error_log('[CAFPM] Erreur statut candidat : ' . $erreur->getMessage());
            flash('erreur', 'Une erreur est survenue.');
        }
    }
    rediriger(url_actuelle()); // Retour à la même page, mêmes filtres
}

// 2. Construction de la recherche (les conditions ne sont ajoutées que si elles sont remplies)
$q       = parametre_get('q', 100);
$domaine = parametre_get('domaine', 100);
$statut  = parametre_get('statut', 20);

$conditions = [];
$params     = [];
if ($q !== '') {
    $conditions[] = '(metier LIKE ? OR domaine LIKE ? OR nom LIKE ?)';
    array_push($params, "%$q%", "%$q%", "%$q%");
}
if ($domaine !== '') {
    $conditions[] = 'domaine = ?';
    $params[]     = $domaine;
}
if (isset(STATUTS_CANDIDAT[$statut])) {
    $conditions[] = 'statut = ?';
    $params[]     = $statut;
}
$where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

// 3. Comptage + page demandée
$candidats = [];
$p = paginer(0);
try {
    $requete = db()->prepare("SELECT COUNT(*) FROM candidats $where");
    $requete->execute($params);
    $p = paginer((int) $requete->fetchColumn());

    $requete = db()->prepare(
        "SELECT id, nom, telephone, metier, domaine, experience, disponibilite, localisation, statut, cree_le FROM candidats
         $where ORDER BY cree_le DESC, id DESC
         LIMIT {$p['limite']} OFFSET {$p['decalage']}"
    );
    $requete->execute($params);
    $candidats = $requete->fetchAll();
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur liste candidats : ' . $erreur->getMessage());
    flash('erreur', 'Impossible de charger les candidats.');
}

// 4. Affichage
admin_entete('Candidats', 'candidats', $admin);
?>
        <form method="get" action="candidats.php" class="filtres filtres-recherche">
            <input type="search" name="q" value="<?= e($q) ?>" placeholder="Métier, domaine ou nom..." aria-label="Rechercher">
            <select name="domaine" aria-label="Domaine">
                <option value="">Tous les domaines</option>
                <?php foreach ($domaines as $d): ?>
                    <option<?= $d === $domaine ? ' selected' : '' ?>><?= e($d) ?></option>
                <?php endforeach; ?>
            </select>
            <select name="statut" aria-label="Statut">
                <option value="">Tous les statuts</option>
                <?php foreach (STATUTS_CANDIDAT as $cle => $libelle): ?>
                    <option value="<?= e($cle) ?>"<?= $cle === $statut ? ' selected' : '' ?>><?= e($libelle) ?></option>
                <?php endforeach; ?>
            </select>
            <button type="submit" class="btn btn-primary btn-petit">Rechercher</button>
            <?php if ($q !== '' || $domaine !== '' || $statut !== ''): ?>
                <a href="candidats.php" class="filtre">Effacer</a>
            <?php endif; ?>
            <span class="filtres-total"><?= $p['total'] ?> candidat(s)</span>
        </form>

        <?php if (!$candidats): ?>
            <p class="espace-vide">Aucun candidat trouvé.</p>
        <?php else: ?>
        <div class="tableau-conteneur" tabindex="0">
            <table class="tableau">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Nom</th>
                        <th>Téléphone</th>
                        <th>Métier</th>
                        <th>Domaine</th>
                        <th>Expérience</th>
                        <th>Disponibilité</th>
                        <th>Ville</th>
                        <th>CV</th>
                        <th>Statut</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($candidats as $c): ?>
                    <tr>
                        <td class="nowrap"><?= e(date_fr($c['cree_le'], false)) ?></td>
                        <td><strong><?= e($c['nom']) ?></strong></td>
                        <td class="nowrap"><a href="tel:<?= e(preg_replace('/[^0-9+]/', '', $c['telephone'])) ?>"><?= e($c['telephone']) ?></a></td>
                        <td><?= e($c['metier']) ?></td>
                        <td><?= e($c['domaine']) ?></td>
                        <td class="nowrap"><?= e($c['experience'] ?: '-') ?></td>
                        <td class="nowrap"><?= e($c['disponibilite'] ?: '-') ?></td>
                        <td><?= e($c['localisation'] ?: '-') ?></td>
                        <td><a href="cv.php?id=<?= (int) $c['id'] ?>" class="btn btn-secondary btn-petit">Télécharger</a></td>
                        <td>
                            <form method="post" action="<?= e(url_actuelle()) ?>" class="form-inline">
                                <?= champ_csrf() ?>
                                <input type="hidden" name="id" value="<?= (int) $c['id'] ?>">
                                <select name="statut" aria-label="Statut du candidat <?= (int) $c['id'] ?>">
                                    <?php foreach (STATUTS_CANDIDAT as $cle => $libelle): ?>
                                        <option value="<?= e($cle) ?>"<?= $cle === $c['statut'] ? ' selected' : '' ?>><?= e($libelle) ?></option>
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
