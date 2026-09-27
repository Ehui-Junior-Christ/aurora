<?php
/* ==========================================================================
   CONFIGURATION GÉNÉRALE DU SITE CAFPM
   --------------------------------------------------------------------------
   C'est le SEUL fichier à modifier lors de l'installation sur un serveur :
   identifiants de la base de données, email de réception, etc.
   ========================================================================== */

/* --- 1. Informations de l'entreprise (affichées sur le site) --- */
define('SITE_NOM',       'CAFPM');
define('SITE_FORME',     'SARL');
define('SITE_TITRE',     'CAFPM - Les bonnes compétences au bon moment');
define('SITE_DESC',      "CAFPM SARL - Votre partenaire en solutions RH en Côte d'Ivoire. Intérim, placement, formation.");
define('SITE_ADRESSE',   'Abidjan, Cocody Riviera Bonoumin');
define('SITE_TELEPHONE', '(+225) 07 07 57 08 37');

/* --- 2. Base de données MySQL ---
   Les identifiants sont dans config/config.local.php (fichier NON envoyé
   sur Git, pour ne jamais publier le mot de passe).
   Modèle à copier : config/config.local.example.php */
require_once __DIR__ . '/config.local.php';

/* --- 3. Emails : adresse qui reçoit les notifications (demandes, candidatures) --- */
define('EMAIL_RECEPTION', 'contact@cafpm.ci');
define('EMAIL_EXPEDITEUR', 'no-reply@cafpm.ci');

/* --- 4. Upload des CV --- */
define('DOSSIER_CV',   __DIR__ . '/../uploads/cv/'); // Dossier de stockage des CV
define('TAILLE_MAX_CV', 5 * 1024 * 1024);             // 5 Mo maximum

/* --- 4b. Médias des événements (photos / vidéos PUBLIQUES, voir includes/evenements.php)
   Les limites du serveur (upload_max_filesize, post_max_size) sont dans .user.ini --- */
define('DOSSIER_MEDIAS_EVENEMENTS', __DIR__ . '/../medias/evenements/'); // Stockage sur le disque
define('URL_MEDIAS_EVENEMENTS',     'medias/evenements/');               // Adresse relative à la racine du site
define('TAILLE_MAX_IMAGE',  8 * 1024 * 1024);                            // 8 Mo par photo
define('TAILLE_MAX_VIDEO', 50 * 1024 * 1024);                            // 50 Mo par vidéo

/* --- Fuseau horaire d'Abidjan (dates "il y a 2 h", dates des demandes...) --- */
date_default_timezone_set('Africa/Abidjan');

/* --- 5. Mode développement ---
   Défini dans config/config.local.php (non versionné) : true sur votre PC,
   false (ou absent) en production. Par sécurité, il vaut false par défaut :
   en mode dev, les erreurs PHP et le lien "mot de passe oublié" s'affichent. */
if (!defined('MODE_DEV')) {
    define('MODE_DEV', false);
}

if (MODE_DEV) {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
}

/* --- 6. Adresse publique du site (utilisée dans les liens envoyés par email,
   ex. "mot de passe oublié"), sans "/" final.
   Se règle dans config/config.local.php pour chaque serveur (ex. hébergement
   de test : define('SITE_URL', 'https://cafpm.alwaysdata.net');).
   Valeur par défaut ci-dessous si elle n'y est pas définie. --- */
if (!defined('SITE_URL')) {
    define('SITE_URL', MODE_DEV ? 'http://localhost:8000' : 'https://www.cafpm.ci');
}

/* --- 7. Démarrage de la session (sécurité CSRF, espace client, back-office admin)
   Pas de session en ligne de commande (ex. script admin/creer-admin.php). --- */
if (PHP_SAPI !== 'cli' && session_status() === PHP_SESSION_NONE) {
    ini_set('session.gc_maxlifetime', '7200'); // Sessions gardées 2 h (comme la déconnexion pour inactivité)
    session_start([
        'cookie_httponly' => true,   // Cookie inaccessible au JavaScript
        'cookie_samesite' => 'Lax',  // Protection contre les requêtes externes
        'cookie_secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', // Cookie envoyé en HTTPS uniquement (si le site est en HTTPS)
        'use_strict_mode' => true,   // Refuse les identifiants de session inventés (anti-fixation)
    ]);
}
