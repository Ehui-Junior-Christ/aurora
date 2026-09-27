<?php
/* ==========================================================================
   BACK-OFFICE : MESSAGES DE LA PAGE CONTACT
   --------------------------------------------------------------------------
   1. Action (POST + CSRF) : marquer un message comme lu / non lu
   2. Filtre (?filtre=non_lus) + pagination (50 par page)
   3. Liste des messages (non lus en évidence), bouton "Répondre" par email
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-admin.php';
require_once __DIR__ . '/../includes/layout-admin.php';

$admin = exiger_admin();

// 1. Marquer lu / non lu
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = entier($_POST, 'id');
    $lu = ($_POST['lu'] ?? '') === '1' ? 1 : 0;

    if (!csrf_valide()) {
        flash('erreur', 'Session expirée. Veuillez réessayer.');
    } else {
        try {
            db()->prepare('UPDATE messages SET lu = ? WHERE id = ?')->execute([$lu, $id]);
            flash('succes', $lu ? 'Message marqué comme lu.' : 'Message marqué comme non lu.');
        } catch (PDOException $erreur) {
            error_log('[CAFPM] Erreur message lu : ' . $erreur->getMessage());
            flash('erreur', 'Une erreur est survenue.');
        }
    }
    rediriger(url_actuelle());
}

// 2. Filtre et pagination
$non_lus = parametre_get('filtre', 20) === 'non_lus';
$where   = $non_lus ? 'WHERE lu = 0' : '';

$messages = [];
$p = paginer(0);
try {
    $p = paginer((int) db()->query("SELECT COUNT(*) FROM messages $where")->fetchColumn());
    $messages = db()->query(
        "SELECT * FROM messages $where ORDER BY cree_le DESC, id DESC
         LIMIT {$p['limite']} OFFSET {$p['decalage']}"
    )->fetchAll();
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur liste messages : ' . $erreur->getMessage());
    flash('erreur', 'Impossible de charger les messages.');
}

// 3. Affichage
admin_entete('Messages', 'messages', $admin);
?>
        <div class="filtres">
            <a href="messages.php" class="filtre<?= $non_lus ? '' : ' actif' ?>">Tous</a>
            <a href="?filtre=non_lus" class="filtre<?= $non_lus ? ' actif' : '' ?>">Non lus</a>
            <span class="filtres-total"><?= $p['total'] ?> message(s)</span>
        </div>

        <?php if (!$messages): ?>
            <p class="espace-vide">Aucun message.</p>
        <?php else: ?>
        <div class="liste-messages">
            <?php foreach ($messages as $m): ?>
            <article class="message-carte<?= $m['lu'] ? '' : ' non-lu' ?>">
                <header class="message-entete">
                    <div>
                        <?php if (!$m['lu']): ?><span class="badge badge-nouvelle">Non lu</span><?php endif; ?>
                        <strong class="message-sujet"><?= e($m['sujet']) ?></strong>
                        <div class="texte-doux">
                            <?= e($m['nom']) ?> &middot;
                            <a href="mailto:<?= e($m['email']) ?>"><?= e($m['email']) ?></a>
                            <?php if ($m['telephone']): ?> &middot; <?= e($m['telephone']) ?><?php endif; ?>
                            &middot; <?= e(date_fr($m['cree_le'])) ?>
                        </div>
                    </div>
                    <div class="message-actions">
                        <a href="mailto:<?= e($m['email']) ?>?subject=<?= e(rawurlencode('Re: ' . $m['sujet'])) ?>" class="btn btn-secondary btn-petit">Répondre</a>
                        <form method="post" action="<?= e(url_actuelle()) ?>">
                            <?= champ_csrf() ?>
                            <input type="hidden" name="id" value="<?= (int) $m['id'] ?>">
                            <input type="hidden" name="lu" value="<?= $m['lu'] ? '0' : '1' ?>">
                            <button type="submit" class="btn btn-primary btn-petit"><?= $m['lu'] ? 'Marquer non lu' : 'Marquer lu' ?></button>
                        </form>
                    </div>
                </header>
                <p class="message-texte"><?= nl2br(e($m['message'])) ?></p>
            </article>
            <?php endforeach; ?>
        </div>
        <?php afficher_pagination($p); ?>
        <?php endif; ?>
<?php
admin_pied();
