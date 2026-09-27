<?php
/* ==========================================================================
   EN-TÊTE : balises <head>, logo, menu principal et menu mobile
   --------------------------------------------------------------------------
   Variables facultatives à définir AVANT d'inclure ce fichier :
     $titre_page       : ex. "Contact"  -> <title>Contact | CAFPM</title>
     $description_page : meta description propre à la page
     $page_active      : accueil | solutions | actualites | contact | autre
   Les liens du menu pointent vers "#section" sur l'accueil (défilement doux)
   et vers "index.php#section" depuis les autres pages (voir amorce.php).
   ========================================================================== */

require_once __DIR__ . '/amorce.php';

$titre_complet = !empty($titre_page) ? $titre_page . ' | ' . SITE_NOM . ' ' . SITE_FORME : SITE_TITRE;
$description   = !empty($description_page) ? $description_page : SITE_DESC;
$lien_accueil  = (($page_active ?? '') === 'accueil') ? '#hero' : lien_site('index.php');

// En-têtes de sécurité : pas d'affichage du site dans une iframe externe,
// pas de devinette du type de fichier, adresse d'origine limitée
if (!headers_sent()) {
    header('X-Frame-Options: SAMEORIGIN');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="<?= e($description) ?>">
    <!-- Jeton de sécurité lu par main.js et envoyé avec chaque formulaire -->
    <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
    <title><?= e($titre_complet) ?></title>
    <link rel="icon" href="<?= e(lien_site('assets/favicon.svg')) ?>" type="image/svg+xml">
    <link rel="stylesheet" href="<?= e(lien_site('style.css') . version_fichier('style.css')) ?>">
    <!-- Styles des pages intérieures (solutions, actualités, contact, pages légales) -->
    <link rel="stylesheet" href="<?= e(lien_site('assets/css/pages.css') . version_fichier('assets/css/pages.css')) ?>">
    <!-- Événements : carrousel de l'accueil, liste, galerie et visionneuse -->
    <link rel="stylesheet" href="<?= e(lien_site('assets/css/evenements.css') . version_fichier('assets/css/evenements.css')) ?>">
</head>
<body>

    <!-- Lien d'évitement : visible au clavier, mène directement au contenu -->
    <a href="#contenu" class="lien-evitement">Aller au contenu</a>

    <!-- Grain Overlay for premium print feel -->
    <div class="noise-overlay" aria-hidden="true"></div>

    <!-- Header (Glassmorphism) -->
    <header class="site-header" id="header">
        <div class="container header-inner">
            <a href="<?= e($lien_accueil) ?>" class="brand" aria-label="<?= e(SITE_NOM) ?> - Retour à l'accueil">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo-icon" aria-hidden="true">
                    <rect width="40" height="40" fill="var(--color-gold)"/>
                    <path d="M10 28L30 10V22L20 32L10 28Z" fill="white"/>
                </svg>
                <div class="brand-text">
                    <span class="brand-name"><?= e(SITE_NOM) ?></span>
                    <span class="brand-suffix"><?= e(strtolower(SITE_FORME)) ?></span>
                </div>
            </a>
            <nav class="main-nav" aria-label="Menu principal">
                <a href="<?= e($lien_accueil) ?>"<?= aria_page('accueil') ?>>Accueil</a>
                <a href="<?= e(lien_section('apropos')) ?>">À propos</a>
                <a href="<?= e(lien_section('solutions')) ?>"<?= aria_page('solutions') ?>>Nos solutions</a>
                <a href="<?= e(lien_section('secteurs')) ?>">Secteurs</a>
                <a href="<?= e(lien_site('actualites.php')) ?>"<?= aria_page('actualites') ?>>Actualités</a>
                <a href="<?= e(lien_site('contact.php')) ?>"<?= aria_page('contact') ?>>Contact</a>
            </nav>
            <div class="header-actions">
                <button type="button" class="btn btn-secondary modal-trigger" data-target="modal-login">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Espace client
                </button>
                <button type="button" class="btn btn-primary modal-trigger" data-target="drawer-form">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                    Déposer un besoin
                </button>
                <!-- Bouton hamburger (visible uniquement sur mobile) -->
                <button type="button" class="hamburger" id="hamburger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="mobile-nav">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>
        </div>
        <!-- Menu mobile -->
        <nav class="mobile-nav" id="mobile-nav" aria-hidden="true" aria-label="Menu mobile">
            <a href="<?= e($lien_accueil) ?>" class="mobile-nav-link"<?= aria_page('accueil') ?>>Accueil</a>
            <a href="<?= e(lien_section('apropos')) ?>" class="mobile-nav-link">À propos</a>
            <a href="<?= e(lien_section('solutions')) ?>" class="mobile-nav-link"<?= aria_page('solutions') ?>>Nos solutions</a>
            <a href="<?= e(lien_section('secteurs')) ?>" class="mobile-nav-link">Secteurs</a>
            <a href="<?= e(lien_site('actualites.php')) ?>" class="mobile-nav-link"<?= aria_page('actualites') ?>>Actualités</a>
            <a href="<?= e(lien_section('references')) ?>" class="mobile-nav-link">Témoignages</a>
            <a href="<?= e(lien_site('contact.php')) ?>" class="mobile-nav-link"<?= aria_page('contact') ?>>Contact</a>
            <div class="mobile-nav-actions">
                <button type="button" class="btn btn-secondary modal-trigger" data-target="modal-login">Espace client</button>
                <button type="button" class="btn btn-primary modal-trigger" data-target="drawer-form">Déposer un besoin</button>
            </div>
        </nav>
    </header>
