<?php
/* ==========================================================================
   BACK-OFFICE : COMPTES CLIENTS (accès à l'Espace client)
   --------------------------------------------------------------------------
   1. Actions (POST + CSRF) :
      - "creer"     : nouveau compte (entreprise, email, mot de passe haché)
      - "supprimer" : suppression du compte (ses demandes sont conservées,
                      simplement détachées du compte)
   2. Liste paginée des comptes (50 par page) avec leur nombre de demandes
   Communiquez ensuite au client son email et son mot de passe : il pourra
   le changer lui-même dans son espace (ou via "Mot de passe oublié").
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-admin.php';
require_once __DIR__ . '/../includes/layout-admin.php';

$admin = exiger_admin();

// 1. Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = champ('action', 20);

    if (!csrf_valide()) {
        flash('erreur', 'Session expirée. Veuillez réessayer.');
        rediriger(url_actuelle());
    }

    try {
        // 1a. Création d'un compte
        if ($action === 'creer') {
            $entreprise   = champ('entreprise', 150);
            $email        = champ('email', 190);
            $mot_de_passe = mot_de_passe_post('mot_de_passe');

            if ($entreprise === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                flash('erreur', "Indiquez le nom de l'entreprise et un email valide.");
            } elseif ($erreur_mdp = erreur_mot_de_passe($mot_de_passe, $mot_de_passe)) {
                flash('erreur', $erreur_mdp);
            } else {
                $requete = db()->prepare('SELECT COUNT(*) FROM clients WHERE email = ?');
                $requete->execute([$email]);

                if ($requete->fetchColumn() > 0) {
                    flash('erreur', 'Un compte existe déjà avec cet email.');
                } else {
                    db()->prepare('INSERT INTO clients (entreprise, email, mot_de_passe) VALUES (?, ?, ?)')
                        ->execute([$entreprise, $email, password_hash($mot_de_passe, PASSWORD_DEFAULT)]);
                    flash('succes', 'Compte créé pour ' . $entreprise . '. Communiquez-lui son email et son mot de passe.');
                }
            }
        }

        // 1b. Suppression d'un compte
        if ($action === 'supprimer') {
            $id  = entier($_POST, 'id');
            $pdo = db();
            $pdo->beginTransaction();
            $pdo->prepare('UPDATE demandes SET client_id = NULL WHERE client_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM reinitialisations WHERE client_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM clients WHERE id = ?')->execute([$id]);
            $pdo->commit();
            flash('succes', 'Compte client supprimé (ses demandes restent visibles dans « Demandes »).');
        }
    } catch (PDOException $erreur) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }
        error_log('[CAFPM] Erreur comptes clients : ' . $erreur->getMessage());
        flash('erreur', 'Une erreur est survenue.');
    }
    rediriger(url_actuelle());
}

// 2. Liste des comptes
$clients = [];
$p = paginer(0);
try {
    $p = paginer((int) db()->query('SELECT COUNT(*) FROM clients')->fetchColumn());
    $clients = db()->query(
        "SELECT c.id, c.entreprise, c.email, c.cree_le,
                (SELECT COUNT(*) FROM demandes d WHERE d.client_id = c.id) AS nb_demandes
         FROM clients c ORDER BY c.entreprise
         LIMIT {$p['limite']} OFFSET {$p['decalage']}"
    )->fetchAll();
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur liste clients : ' . $erreur->getMessage());
    flash('erreur', 'Impossible de charger les comptes clients.');
}

admin_entete('Comptes clients', 'clients', $admin);
?>
        <section class="admin-carte">
            <h2>Créer un compte client</h2>
            <form method="post" action="clients.php" class="espace-form form-grille">
                <?= champ_csrf() ?>
                <input type="hidden" name="action" value="creer">
                <div class="input-group">
                    <label for="entreprise">Entreprise</label>
                    <input type="text" id="entreprise" name="entreprise" required maxlength="150">
                </div>
                <div class="input-group">
                    <label for="email">Email de connexion</label>
                    <input type="email" id="email" name="email" required maxlength="190" autocomplete="off">
                </div>
                <div class="input-group">
                    <label for="mot_de_passe">Mot de passe (8 caractères min.)</label>
                    <input type="text" id="mot_de_passe" name="mot_de_passe" required minlength="8" maxlength="72" autocomplete="off">
                </div>
                <div class="input-group">
                    <button type="submit" class="btn btn-primary">Créer le compte</button>
                </div>
            </form>
        </section>

        <div class="filtres">
            <span class="filtres-total"><?= $p['total'] ?> compte(s)</span>
        </div>

        <?php if (!$clients): ?>
            <p class="espace-vide">Aucun compte client.</p>
        <?php else: ?>
        <div class="tableau-conteneur" tabindex="0">
            <table class="tableau">
                <thead>
                    <tr>
                        <th>Entreprise</th>
                        <th>Email</th>
                        <th>Créé le</th>
                        <th>Demandes</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($clients as $c): ?>
                    <tr>
                        <td><strong><?= e($c['entreprise']) ?></strong></td>
                        <td><a href="mailto:<?= e($c['email']) ?>"><?= e($c['email']) ?></a></td>
                        <td><?= e(date_fr($c['cree_le'], false)) ?></td>
                        <td><?= (int) $c['nb_demandes'] ?></td>
                        <td>
                            <!-- data-confirm : admin.js demande une confirmation avant l'envoi -->
                            <form method="post" action="<?= e(url_actuelle()) ?>" data-confirm="Supprimer le compte de <?= e($c['entreprise']) ?> ?">
                                <?= champ_csrf() ?>
                                <input type="hidden" name="action" value="supprimer">
                                <input type="hidden" name="id" value="<?= (int) $c['id'] ?>">
                                <button type="submit" class="btn btn-danger btn-petit">Supprimer</button>
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
