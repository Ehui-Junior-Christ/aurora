<?php
/* ==========================================================================
   STATISTIQUES DE FRÉQUENTATION : RÈGLES ET OUTILS COMMUNS
   --------------------------------------------------------------------------
   Utilisé par :
   - api/statistiques.php    : enregistrement (pages vues, actions, choix du bandeau)
   - admin/statistiques.php  : consultation dans le back-office
   Principes (voir aussi cookies.php, politique de cookies) :
   - rien n'est enregistré sans le consentement du visiteur (cookie
     cafpm_consentement = "oui"), sauf un simple compteur des choix du
     bandeau, sans aucun identifiant ;
   - aucune adresse IP, aucun user-agent complet : seulement le type
     d'appareil (mobile / tablette / ordinateur) ;
   - les données de plus de 13 mois sont effacées automatiquement
     (ménage occasionnel lors d'un enregistrement : pas de tâche planifiée
     chez l'hébergeur).
   ========================================================================== */

/* Liste blanche des actions suivies : nom technique => libellé affiché dans l'admin.
   Tout autre nom envoyé par le navigateur est refusé par api/statistiques.php.
   Pour suivre une nouvelle action : l'ajouter ici, puis soit mettre
   data-stat="nom" sur le bouton/lien, soit compléter assets/js/consentement.js. */
const STATS_EVENEMENTS = [
    'clic_deposer_besoin'     => 'Clic « Déposer un besoin »',
    'clic_creer_profil'       => 'Clic « Créer mon profil »',
    'clic_demander_profil'    => 'Clic « Demander ce profil »',
    'ouverture_espace_client' => 'Ouverture « Espace client »',
    'recherche_profils'       => 'Recherche de profils',
    'envoi_demande'           => 'Demande de personnel envoyée',
    'envoi_candidature'       => 'Profil candidat créé',
    'envoi_contact'           => 'Message de contact envoyé',
    'envoi_newsletter'        => 'Inscription à la newsletter',
    'connexion_client'        => 'Connexion à l\'espace client',
    'lecture_video'           => 'Lecture d\'une vidéo',
    'clic_voir_evenement'     => 'Clic « Voir l\'événement »',
    'clic_telephone'          => 'Clic sur le téléphone',
    'clic_email'              => 'Clic sur l\'email',
    'clic_whatsapp'           => 'Clic sur WhatsApp',
];

const STATS_DUREE_MOIS = 13;  // Durée de conservation des statistiques
const STATS_PURGE_CHANCE = 200; // Ménage 1 fois sur 200 enregistrements (en moyenne)

/* Paramètres d'adresse conservés dans le chemin enregistré : ce sont des
   identifiants de contenu publics (solution, actualité, événement). Tous les
   autres (jetons, emails, filtres...) sont retirés. */
const STATS_PARAMETRES_GARDES = ['s', 'a', 'e'];

/**
 * Indique si le navigateur est un robot évident (moteur de recherche,
 * outil d'aperçu de lien, script automatique...). User-agent vide = robot.
 */
function stats_est_robot(string $user_agent): bool
{
    if (trim($user_agent) === '') {
        return true;
    }
    return (bool) preg_match(
        '/bot|crawl|spider|slurp|scrap|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp\/|telegram|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|phantom|selenium|puppeteer|playwright|monitor|uptime|feedfetcher/i',
        $user_agent
    );
}

/**
 * Type d'appareil déduit du user-agent (le user-agent lui-même n'est pas stocké).
 */
function stats_appareil(string $user_agent): string
{
    if (preg_match('/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i', $user_agent)) {
        return 'tablette';
    }
    if (preg_match('/Mobi|iPhone|iPod|Android|BlackBerry|Opera Mini|IEMobile|Windows Phone/i', $user_agent)) {
        return 'mobile';
    }
    return 'ordinateur';
}

/**
 * Nettoie le chemin d'une page envoyé par le navigateur.
 * Renvoie null si le chemin est invalide ou doit être ignoré
 * (back-office, espace client, API).
 * Ex. "/solution.php?s=interim&utm=x" -> "/solution.php?s=interim"
 */
function stats_nettoyer_chemin(string $brut): ?string
{
    $brut = trim($brut);
    if ($brut === '' || strlen($brut) > 500 || $brut[0] !== '/' || str_starts_with($brut, '//')) {
        return null;
    }

    $chemin = (string) parse_url($brut, PHP_URL_PATH);
    $query  = (string) parse_url($brut, PHP_URL_QUERY);

    // Caractères d'une adresse encodée par le navigateur uniquement
    if ($chemin === '' || !preg_match('#^/[A-Za-z0-9/_.~%-]*$#', $chemin) || strlen($chemin) > 200) {
        return null;
    }
    // Pages privées : jamais suivies
    if (preg_match('#(^|/)(admin|espace-client|api)(/|$)#i', $chemin)) {
        return null;
    }

    // "/index.php" et "/" désignent la même page : on garde une seule écriture
    if (str_ends_with($chemin, '/index.php')) {
        $chemin = substr($chemin, 0, -strlen('index.php'));
    }

    // Paramètres conservés : uniquement les identifiants de contenu (slugs)
    parse_str($query, $parametres);
    $gardes = [];
    foreach (STATS_PARAMETRES_GARDES as $nom) {
        $valeur = $parametres[$nom] ?? null;
        if (is_string($valeur) && preg_match('/^[A-Za-z0-9_-]{1,80}$/', $valeur)) {
            $gardes[$nom] = $valeur;
        }
    }

    return $gardes ? $chemin . '?' . http_build_query($gardes) : $chemin;
}

/**
 * Domaine du site d'origine (ex. "www.google.com"), sans le reste de l'adresse.
 * '' si l'adresse est vide, invalide ou s'il s'agit de notre propre site.
 */
function stats_domaine_referent(string $adresse, string $notre_hote): string
{
    $hote = strtolower((string) parse_url(trim($adresse), PHP_URL_HOST));
    $hote = preg_replace('/^www\./', '', $hote);

    if ($hote === '' || strlen($hote) > 100 || !preg_match('/^[a-z0-9.-]+$/', $hote)) {
        return '';
    }
    $notre_hote = preg_replace('/^www\./', '', strtolower(preg_replace('/:\d+$/', '', $notre_hote)));
    return $hote === $notre_hote ? '' : $hote;
}

/**
 * Indique si l'adresse d'origine est une page de notre propre site
 * (navigation interne : ce n'est pas une nouvelle arrivée sur le site).
 */
function stats_referent_interne(string $adresse, string $notre_hote): bool
{
    $hote = preg_replace('/^www\./', '', strtolower((string) parse_url(trim($adresse), PHP_URL_HOST)));
    $notre_hote = preg_replace('/^www\./', '', strtolower(preg_replace('/:\d+$/', '', $notre_hote)));
    return $hote !== '' && $hote === $notre_hote;
}

/**
 * Texte court et propre (précision d'une action) : caractères de contrôle
 * retirés, espaces normalisés, longueur bornée.
 */
function stats_texte_court(string $texte, int $longueur_max = 100): string
{
    $texte = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $texte) ?? '';
    $texte = trim(preg_replace('/\s+/u', ' ', $texte) ?? '');
    return mb_substr($texte, 0, $longueur_max);
}

/**
 * Efface les statistiques de plus de 13 mois. Appelée de temps en temps
 * (1 fois sur STATS_PURGE_CHANCE) par api/statistiques.php.
 */
function stats_purger(PDO $pdo): void
{
    $mois = (int) STATS_DUREE_MOIS;
    $pdo->exec("DELETE FROM stats_vues WHERE cree_le < NOW() - INTERVAL $mois MONTH");
    $pdo->exec("DELETE FROM stats_evenements WHERE cree_le < NOW() - INTERVAL $mois MONTH");
    $pdo->exec("DELETE FROM stats_consentements WHERE jour < CURDATE() - INTERVAL $mois MONTH");
}

/**
 * Libellé lisible d'une page du site pour le back-office.
 * Ex. "/solution.php?s=interim" -> "Solution : interim"
 */
function stats_libelle_page(string $chemin): string
{
    $fichier = basename((string) parse_url($chemin, PHP_URL_PATH));
    parse_str((string) parse_url($chemin, PHP_URL_QUERY), $parametres);

    $pages = [
        ''                     => 'Accueil',
        'index.php'            => 'Accueil',
        'actualites.php'       => 'Actualités',
        'actualite.php'        => 'Actualité',
        'solution.php'         => 'Solution',
        'evenements.php'       => 'Événements',
        'evenement.php'        => 'Événement',
        'contact.php'          => 'Contact',
        'cafpm-match.php'      => 'CAFPM Match',
        'confidentialite.php'  => 'Politique de confidentialité',
        'mentions-legales.php' => 'Mentions légales',
        'cookies.php'          => 'Politique de cookies',
    ];
    // Adresse de dossier ("/" ou "/sous-dossier/") = page d'accueil
    if (str_ends_with((string) parse_url($chemin, PHP_URL_PATH), '/')) {
        $fichier = '';
    }
    $libelle = $pages[$fichier] ?? $fichier;

    foreach (STATS_PARAMETRES_GARDES as $nom) {
        if (isset($parametres[$nom]) && is_string($parametres[$nom])) {
            return $libelle . ' : ' . $parametres[$nom];
        }
    }
    return $libelle;
}
