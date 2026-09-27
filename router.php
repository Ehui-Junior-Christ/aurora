<?php
/* ==========================================================================
   ROUTEUR POUR LE SERVEUR LOCAL (php -S, utilisé par lancer.bat)
   --------------------------------------------------------------------------
   Le serveur intégré de PHP ignore les fichiers .htaccess : ce routeur
   reproduit leurs règles :
   1. bloque les dossiers privés (403), tout ce qui n'est pas une photo ou
      une vidéo dans medias/ (403) et le script admin/creer-admin.php (404)
   2. laisse PHP servir les fichiers et dossiers qui existent
      (en ajoutant le "/" final aux dossiers, comme Apache)
   3. affiche la page 404.php pour toute adresse inconnue
   Inutile sur un vrai hébergement Apache (le .htaccess s'en charge).
   ========================================================================== */

$chemin_brut = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH); // Tel que tapé (ex. /mon%20fichier)
$chemin      = rawurldecode($chemin_brut);                                   // Décodé (ex. /mon fichier)

// 0. Antislash "\" ou octet nul dans l'adresse : sous Windows, "\" sert de separateur de
//    dossiers et permettrait de contourner les regles ci-dessous (ex. /uploads%5ccv%5c...)
if (strpbrk($chemin, "\\\0") !== false) {
    http_response_code(404);
    exit('Page introuvable');
}

// 1a. Dossiers interdits au navigateur (CV des candidats, configuration, etc.)
if (preg_match('#^/(config|includes|partials|database|uploads)(/|$)#i', $chemin)) {
    http_response_code(403);
    exit('Accès interdit');
}

// 1b. Dossier public des médias d'événements (medias/) : seuls les photos et vidéos
//     sont servies. Tout le reste (.php, .htaccess...) est refusé : sans cette règle,
//     le serveur local EXÉCUTERAIT un fichier .php déposé dans ce dossier.
if (preg_match('#^/medias(/|$)#i', $chemin) && !preg_match('#^/medias/[^/]+/[A-Za-z0-9_-]+\.(jpe?g|png|webp|mp4|webm)$#i', $chemin)) {
    http_response_code(403);
    exit('Accès interdit');
}
// 1b bis. Anti-téléchargement direct (même règle que medias/evenements/.htaccess) :
//     une photo / vidéo n'est servie que si elle est demandée par une page du site
if (preg_match('#^/medias/#i', $chemin)) {
    $origine = parse_url($_SERVER['HTTP_REFERER'] ?? '', PHP_URL_HOST);
    $site    = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '');
    if (!$origine || strcasecmp($origine, $site) !== 0) {
        http_response_code(403);
        exit('Accès interdit');
    }
}

// 1c. Script réservé à la ligne de commande et fichiers techniques (dossiers cachés
//     comme .git, lanceur .bat, script SQL, ce routeur) : on fait comme s'ils n'existaient pas
if (preg_match('#^/admin/creer-admin\.php$#i', $chemin)
    || preg_match('#/\.(?!well-known)|\.(bat|sql|md)$|^/router\.php$#i', $chemin)) {
    $chemin = '/__introuvable__';
}

// 2a. Dossier demandé sans "/" final (ex. /admin) : on ajoute le "/" comme le fait Apache,
//     sinon les liens relatifs de la page (connexion.php, ../style.css) seraient faux
$fichier = __DIR__ . $chemin;
if ($chemin !== '/' && substr($chemin, -1) !== '/' && is_dir($fichier)) {
    $query = parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY);
    header('Location: ' . $chemin_brut . '/' . ($query ? '?' . $query : ''), true, 301);
    exit;
}

// 2b. Fichier existant, ou dossier contenant un index.php (ex. /admin/) : PHP le sert normalement
if (is_file($fichier) || is_file(rtrim($fichier, '/') . '/index.php')) {
    return false;
}

// 3. Adresse inconnue : page 404 du site (si elle existe)
http_response_code(404);
if (is_file(__DIR__ . '/404.php')) {
    require __DIR__ . '/404.php';
} else {
    echo 'Page introuvable';
}
