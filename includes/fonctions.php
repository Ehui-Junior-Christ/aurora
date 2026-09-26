<?php
/* ==========================================================================
   FONCTIONS UTILITAIRES
   --------------------------------------------------------------------------
   Petites fonctions réutilisées partout dans le site :
   - e()              : sécurise un texte avant de l'afficher dans le HTML
   - csrf_token()     : génère le jeton anti-falsification des formulaires
   - csrf_valide()    : indique si le jeton reçu est correct (true / false)
   - verifier_csrf()  : vérifie ce jeton (réponse JSON d'erreur sinon)
   - champ_csrf()     : champ caché <input> à placer dans les formulaires classiques
   - champ()          : récupère et nettoie un champ envoyé en POST
   - mot_de_passe_post() : récupère un mot de passe envoyé en POST (non modifié)
   - parametre_get()  : récupère et nettoie un paramètre de l'adresse (?filtre=...)
   - repondre_json()  : renvoie une réponse au JavaScript puis arrête le script
   - exiger_post()    : refuse tout ce qui n'est pas un envoi de formulaire
   - envoyer_email()  : envoie un email (à CAFPM par défaut)
   - rediriger()      : redirige le navigateur vers une autre page
   - flash() / lire_flash() : messages affichés une seule fois (après redirection)
   - entetes_pages_privees() : en-têtes de sécurité (espace client, admin)
   - date_fr()        : affiche une date au format français
   - il_y_a()         : date relative ("il y a 2 h", "hier", "12 sept.")
   - date_du_jour()   : date du jour en toutes lettres ("jeudi 24 septembre")
   - erreur_mot_de_passe() : contrôle la solidité d'un nouveau mot de passe
   - libelle_statut() : texte lisible d'un statut de demande
   ========================================================================== */

require_once __DIR__ . '/../config/config.php';

/* Statuts possibles d'une demande de personnel (colonne demandes.statut) */
const STATUTS_DEMANDE = [
    'nouvelle' => 'Nouvelle',
    'en_cours' => 'En cours',
    'traitee'  => 'Traitée',
];

// Statuts d'un candidat : seuls les "disponible" apparaissent dans la recherche publique
const STATUTS_CANDIDAT = [
    'disponible' => 'Disponible',
    'en_mission' => 'En mission',
    'inactif'    => 'Inactif',
];

/**
 * Échappe un texte pour l'afficher sans risque dans une page HTML (anti-XSS).
 */
function e(?string $texte): string
{
    return htmlspecialchars($texte ?? '', ENT_QUOTES, 'UTF-8');
}

/**
 * Retourne le jeton CSRF de la session (le crée s'il n'existe pas encore).
 * Il est placé dans une balise <meta> et renvoyé par chaque formulaire.
 */
function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Indique si le jeton CSRF envoyé avec le formulaire est le bon.
 */
function csrf_valide(): bool
{
    $jeton = $_POST['csrf_token'] ?? '';
    return is_string($jeton) && hash_equals(csrf_token(), $jeton);
}

/**
 * Vérifie que le formulaire reçu provient bien de notre site (appels api/).
 * Arrête le script avec une erreur JSON si ce n'est pas le cas.
 */
function verifier_csrf(): void
{
    if (!csrf_valide()) {
        repondre_json(false, 'Session expirée. Veuillez recharger la page.', 403);
    }
}

/**
 * Champ caché contenant le jeton CSRF, pour les formulaires classiques
 * (espace client, back-office). Utilisation : <?= champ_csrf() ?>
 */
function champ_csrf(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

/**
 * Récupère un champ POST, retire les espaces inutiles et limite sa longueur.
 */
function champ(string $nom, int $longueur_max = 255): string
{
    $valeur = $_POST[$nom] ?? '';
    $valeur = is_string($valeur) ? trim($valeur) : '';
    return mb_substr($valeur, 0, $longueur_max);
}

/**
 * Récupère un mot de passe envoyé en POST, tel quel (sans retirer les espaces).
 * Renvoie '' si le champ est absent ou n'est pas un texte (ex. mot_de_passe[]=...).
 */
function mot_de_passe_post(string $nom): string
{
    $valeur = $_POST[$nom] ?? '';
    return is_string($valeur) ? $valeur : '';
}

/**
 * Même chose que champ(), mais pour un paramètre de l'adresse (?nom=valeur),
 * par exemple un filtre de recherche.
 */
function parametre_get(string $nom, int $longueur_max = 100): string
{
    $valeur = $_GET[$nom] ?? '';
    $valeur = is_string($valeur) ? trim($valeur) : '';
    return mb_substr($valeur, 0, $longueur_max);
}

/**
 * Envoie une réponse JSON au JavaScript (main.js) et arrête le script.
 * Exemple de réponse : {"succes": true, "message": "Demande envoyée"}
 * $donnees permet d'ajouter des informations, par exemple :
 *     repondre_json(true, 'Bienvenue', 200, ['redirection' => 'espace-client/']);
 * main.js redirige alors automatiquement le visiteur vers cette adresse.
 */
function repondre_json(bool $succes, string $message, int $code_http = 200, array $donnees = []): void
{
    http_response_code($code_http);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['succes' => $succes, 'message' => $message], $donnees), JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Accepte uniquement les requêtes POST (les formulaires). Bloque le reste.
 */
function exiger_post(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        repondre_json(false, 'Méthode non autorisée.', 405);
    }
}

/**
 * Envoie un email simple.
 * - $destinataire : adresse qui reçoit l'email (par défaut : CAFPM, EMAIL_RECEPTION)
 * - $repondre_a   : adresse utilisée quand on clique sur "Répondre" (ex. le visiteur)
 * Remarque : la fonction mail() nécessite un serveur configuré (fonctionne
 * chez la plupart des hébergeurs, mais pas en local).
 */
function envoyer_email(string $sujet, string $contenu, ?string $destinataire = null, ?string $repondre_a = null): bool
{
    $entetes  = 'From: ' . SITE_NOM . ' <' . EMAIL_EXPEDITEUR . ">\r\n";
    if ($repondre_a !== null && filter_var($repondre_a, FILTER_VALIDATE_EMAIL)) {
        $entetes .= 'Reply-To: ' . $repondre_a . "\r\n"; // Email validé : pas d'injection d'en-tête possible
    }
    $entetes .= "Content-Type: text/plain; charset=UTF-8\r\n";

    return @mail($destinataire ?? EMAIL_RECEPTION, '=?UTF-8?B?' . base64_encode($sujet) . '?=', $contenu, $entetes);
}

/**
 * Redirige vers une autre page puis arrête le script.
 * Utilisé après l'envoi d'un formulaire classique (principe POST → redirection → GET :
 * un rafraîchissement de la page ne renvoie pas le formulaire une deuxième fois).
 */
function rediriger(string $url): void
{
    header('Location: ' . $url);
    exit;
}

/**
 * Mémorise un message à afficher sur la prochaine page (une seule fois).
 * $type : 'succes', 'erreur' ou 'info' (classes CSS .flash-succes, etc.)
 */
function flash(string $type, string $message): void
{
    $_SESSION['flash'][] = ['type' => $type, 'message' => $message];
}

/**
 * Récupère (et efface) les messages flash en attente.
 */
function lire_flash(): array
{
    $messages = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $messages;
}

/**
 * En-têtes de sécurité des pages privées (espace client, back-office) :
 * - Content-Security-Policy : seuls nos propres fichiers (et Google Fonts)
 *   sont autorisés, aucun script inline ; seule exception : les images de
 *   img.youtube.com (miniatures des vidéos YouTube des événements, admin) ;
 *   media-src 'self' = vidéos des événements servies par le site lui-même ;
 * - page non affichable dans une iframe (anti-clickjacking) ;
 * - pas de mise en cache (données personnelles) ;
 * - Referrer-Policy : l'adresse de la page (qui peut contenir un jeton de
 *   réinitialisation) n'est jamais transmise à un autre site.
 */
function entetes_pages_privees(): void
{
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://img.youtube.com; media-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('Cache-Control: no-store, no-cache, must-revalidate');
}

/**
 * Affiche une date MySQL (2026-09-24 14:30:00) au format 24/09/2026 14:30.
 */
function date_fr(?string $date, bool $avec_heure = true): string
{
    if (!$date) {
        return '';
    }
    return date($avec_heure ? 'd/m/Y H:i' : 'd/m/Y', strtotime($date));
}

/**
 * Date relative, plus parlante dans les tableaux de bord :
 * "à l'instant", "il y a 25 min", "il y a 3 h", "hier", puis "12 sept.".
 */
function il_y_a(?string $date): string
{
    if (!$date) {
        return '';
    }
    $moment = strtotime($date);
    $ecart  = time() - $moment;

    if ($ecart < 60) {
        return "à l'instant";
    }
    if ($ecart < 3600) {
        return 'il y a ' . floor($ecart / 60) . ' min';
    }
    if (date('Y-m-d', $moment) === date('Y-m-d')) {
        return 'il y a ' . floor($ecart / 3600) . ' h';
    }
    if (date('Y-m-d', $moment) === date('Y-m-d', strtotime('-1 day'))) {
        return 'hier';
    }
    $mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    $texte = (int) date('j', $moment) . ' ' . $mois[(int) date('n', $moment) - 1];
    return date('Y', $moment) === date('Y') ? $texte : $texte . ' ' . date('Y', $moment);
}

/**
 * Date du jour en toutes lettres, ex. "jeudi 24 septembre".
 */
function date_du_jour(): string
{
    $jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    $mois  = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
              'septembre', 'octobre', 'novembre', 'décembre'];
    return $jours[(int) date('w')] . ' ' . (int) date('j') . ' ' . $mois[(int) date('n') - 1];
}

/**
 * Contrôle un nouveau mot de passe. Renvoie le message d'erreur, ou null si tout va bien.
 * Règles : 8 caractères minimum, 72 maximum (limite de password_hash), confirmation identique.
 */
function erreur_mot_de_passe(string $mot_de_passe, string $confirmation): ?string
{
    if (mb_strlen($mot_de_passe) < 8) {
        return 'Le mot de passe doit contenir au moins 8 caractères.';
    }
    if (strlen($mot_de_passe) > 72) {
        return 'Le mot de passe est trop long (72 caractères maximum).';
    }
    if ($mot_de_passe !== $confirmation) {
        return 'Les deux mots de passe ne sont pas identiques.';
    }
    return null;
}

/**
 * Texte lisible d'un statut de demande ('en_cours' → 'En cours').
 */
function libelle_statut(string $statut): string
{
    return STATUTS_DEMANDE[$statut] ?? $statut;
}
