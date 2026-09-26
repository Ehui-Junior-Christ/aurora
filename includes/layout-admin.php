<?php
/* ==========================================================================
   MISE EN PAGE DU BACK-OFFICE (dossier admin/)
   --------------------------------------------------------------------------
   Utilisation dans une page d'administration :
       admin_entete('Demandes', 'demandes', $admin);
       ... contenu HTML ...
       admin_pied();
   Outils de liste :
       $p = paginer($total);            // 50 lignes par page (?page=2, ...)
       ... LIMIT $p['limite'] OFFSET $p['decalage'] ...
       afficher_pagination($p);
       url_actuelle()                   // adresse de la page + filtres (retour après POST)
   Styles : style.css + assets/css/admin.css (classes "admin-", "tableau", ...)
   JavaScript : admin/admin.js (confirmation avant suppression, sans script inline)
   ========================================================================== */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fonctions.php';

/* Menu latéral : fichier => [clé, libellé] */
const MENU_ADMIN = [
    'index.php'      => ['accueil',    'Tableau de bord'],
    'demandes.php'   => ['demandes',   'Demandes'],
    'candidats.php'  => ['candidats',  'Candidats'],
    'evenements.php' => ['evenements', 'Événements'],
    'messages.php'   => ['messages',   'Messages'],
    'newsletter.php' => ['newsletter', 'Newsletter'],
    'clients.php'    => ['clients',    'Comptes clients'],
];

/**
 * Début de page : <head>, menu latéral, titre et messages flash.
 * $admin = null pour la page de connexion (pas de menu).
 */
function admin_entete(string $titre, string $page_active = '', ?array $admin = null): void
{
    entetes_pages_privees();
    $a_traiter = $admin ? compteurs_menu() : [];
    ?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title><?= e($titre) ?> - Administration <?= e(SITE_NOM) ?></title>
    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="../style.css">
    <link rel="stylesheet" href="../assets/css/admin.css">
    <script src="admin.js" defer></script>
</head>
<body class="admin-body<?= $admin ? '' : ' admin-body-connexion' ?>">
    <?php if ($admin): ?>
    <aside class="admin-sidebar">
        <a href="index.php" class="admin-brand">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <rect width="40" height="40" fill="#FCE303"/>
                <path d="M10 28L30 10V22L20 32L10 28Z" fill="white"/>
            </svg>
            <span><?= e(SITE_NOM) ?> <small>Admin</small></span>
        </a>
        <nav class="admin-nav">
            <?php foreach (MENU_ADMIN as $fichier => [$cle, $libelle]): ?>
                <a href="<?= e($fichier) ?>"<?= $cle === $page_active ? ' class="actif" aria-current="page"' : '' ?>>
                    <?= e($libelle) ?>
                    <?php if (!empty($a_traiter[$cle])): ?>
                        <span class="nav-pastille" title="À traiter"><?= (int) $a_traiter[$cle] ?></span>
                    <?php endif; ?>
                </a>
            <?php endforeach; ?>
            <a href="../index.php" class="admin-nav-site">Voir le site &rarr;</a>
        </nav>
        <div class="admin-utilisateur">
            <span><?= e($admin['nom']) ?></span>
            <form action="deconnexion.php" method="post">
                <?= champ_csrf() ?>
                <button type="submit" class="admin-lien-bouton">Déconnexion</button>
            </form>
        </div>
    </aside>
    <?php endif; ?>

    <main class="admin-main">
        <?php if ($admin): ?>
        <h1 class="admin-titre"><?= e($titre) ?></h1>
        <?php endif; ?>
        <?php foreach (lire_flash() as $flash): ?>
            <div class="flash flash-<?= e($flash['type']) ?>" role="status"><?= e($flash['message']) ?></div>
        <?php endforeach; ?>
    <?php
}

/**
 * Nombre d'éléments à traiter, affiché en pastille dans le menu :
 * nouvelles demandes et messages non lus. [] en cas d'erreur (menu sans pastille).
 */
function compteurs_menu(): array
{
    try {
        $pdo = db();
        return [
            'demandes' => (int) $pdo->query("SELECT COUNT(*) FROM demandes WHERE statut = 'nouvelle'")->fetchColumn(),
            'messages' => (int) $pdo->query('SELECT COUNT(*) FROM messages WHERE lu = 0')->fetchColumn(),
        ];
    } catch (PDOException $erreur) {
        return [];
    }
}

/**
 * Fin de page.
 */
function admin_pied(): void
{
    ?>
    </main>
</body>
</html>
    <?php
}

/**
 * Calcule la pagination d'une liste (page demandée dans ?page=).
 * Renvoie : page, pages (nombre total), limite, decalage, total.
 */
function paginer(int $total, int $par_page = 50): array
{
    $pages = max(1, (int) ceil($total / $par_page));
    $page  = min($pages, max(1, (int) ($_GET['page'] ?? 1)));

    return [
        'page'     => $page,
        'pages'    => $pages,
        'limite'   => $par_page,
        'decalage' => ($page - 1) * $par_page,
        'total'    => $total,
    ];
}

/**
 * Affiche les liens de pagination (en conservant les filtres de recherche).
 */
function afficher_pagination(array $p): void
{
    if ($p['pages'] <= 1) {
        return;
    }
    echo '<nav class="pagination" aria-label="Pagination">';
    $points = false;
    for ($n = 1; $n <= $p['pages']; $n++) {
        // On affiche la 1re page, la dernière et 2 pages autour de la page actuelle ; "…" pour le reste
        if ($n !== 1 && $n !== $p['pages'] && abs($n - $p['page']) > 2) {
            if (!$points) {
                echo '<span class="points">&hellip;</span>';
                $points = true;
            }
            continue;
        }
        $points = false;
        $url = '?' . http_build_query(array_merge($_GET, ['page' => $n]));
        if ($n === $p['page']) {
            echo '<span class="actif">' . $n . '</span>';
        } else {
            echo '<a href="' . e($url) . '">' . $n . '</a>';
        }
    }
    echo '</nav>';
}

/**
 * Adresse de la page actuelle avec ses filtres (ex. "demandes.php?statut=nouvelle&page=2").
 * Sert de retour après une action POST, pour rester au même endroit.
 */
function url_actuelle(): string
{
    $page  = basename($_SERVER['SCRIPT_NAME']);
    $query = $_SERVER['QUERY_STRING'] ?? '';
    return $query !== '' ? $page . '?' . $query : $page;
}
