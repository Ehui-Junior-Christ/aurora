<?php
/* ==========================================================================
   MISE EN PAGE DE L'ESPACE CLIENT (dossier espace-client/)
   --------------------------------------------------------------------------
   Utilisation dans une page :
       espace_entete('Titre de la page', $client);  // $client = null si non connecté
       ... contenu HTML de la page ...
       espace_pied();
   Styles : style.css (couleurs, boutons .btn) + assets/css/admin.css
   (toutes les classes commençant par "espace-").
   Les chemins commencent par "../" car les pages sont dans espace-client/.
   ========================================================================== */

require_once __DIR__ . '/fonctions.php';

/**
 * Début de page : <head>, barre du haut (logo + menu) et messages flash.
 */
function espace_entete(string $titre, ?array $client = null): void
{
    entetes_pages_privees();
    ?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title><?= e($titre) ?> - Espace client <?= e(SITE_NOM) ?></title>
    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="../style.css<?= version_fichier('style.css') ?>">
    <link rel="stylesheet" href="../assets/css/admin.css<?= version_fichier('assets/css/admin.css') ?>">
</head>
<body class="espace-body">

    <header class="espace-header">
        <div class="espace-header-inner">
            <a href="<?= $client ? 'index.php' : '../index.php' ?>" class="espace-brand">
                <svg width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                    <rect width="40" height="40" fill="#FCE303"/>
                    <path d="M10 28L30 10V22L20 32L10 28Z" fill="white"/>
                </svg>
                <span class="espace-brand-nom"><?= e(SITE_NOM) ?></span>
                <span class="espace-brand-suffixe">Espace client</span>
            </a>

            <nav class="espace-nav">
                <?php if ($client): ?>
                    <?php $page = basename($_SERVER['SCRIPT_NAME']); // Page actuelle (lien mis en évidence) ?>
                    <a href="index.php"<?= $page === 'index.php' ? ' aria-current="page"' : '' ?>>Tableau de bord</a>
                    <a href="mot-de-passe.php"<?= $page === 'mot-de-passe.php' ? ' aria-current="page"' : '' ?>>Mot de passe</a>
                    <!-- Déconnexion : formulaire POST avec jeton CSRF (un simple lien pourrait être déclenché par un autre site) -->
                    <form action="deconnexion.php" method="post" class="espace-nav-form">
                        <?= champ_csrf() ?>
                        <button type="submit" class="btn btn-secondary btn-petit">Déconnexion</button>
                    </form>
                <?php else: ?>
                    <a href="../index.php">&larr; Retour au site</a>
                <?php endif; ?>
            </nav>
        </div>
    </header>

    <main class="espace-main">
        <?php foreach (lire_flash() as $flash): ?>
            <div class="flash flash-<?= e($flash['type']) ?>" role="status"><?= e($flash['message']) ?></div>
        <?php endforeach; ?>
    <?php
}

/**
 * Fin de page : pied de page et fermeture des balises.
 */
function espace_pied(): void
{
    ?>
    </main>

    <footer class="espace-footer">
        &copy; <?= date('Y') ?> <?= e(SITE_NOM . ' ' . SITE_FORME) ?> &middot; <?= e(SITE_ADRESSE) ?> &middot; <?= e(SITE_TELEPHONE) ?>
    </footer>
</body>
</html>
    <?php
}
