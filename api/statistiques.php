<?php
/* ==========================================================================
   TRAITEMENT : enregistrement des statistiques de fréquentation
   --------------------------------------------------------------------------
   Appelé en arrière-plan par assets/js/consentement.js (navigator.sendBeacon,
   ou fetch "keepalive" en secours) : le visiteur n'attend jamais cette
   requête. Trois types d'envoi (champ "type") :
     - "vue"   : une page vue          (chemin, ref = adresse d'origine)
     - "evt"   : une action            (nom, detail, valeur, chemin)
     - "choix" : choix dans le bandeau (choix = oui / non), compteur anonyme
   Réponse : 204 (aucun contenu) quand tout va bien, simple code d'erreur
   sinon. Jamais de message d'erreur détaillé ; si la base est indisponible,
   on ne fait rien (le site n'est pas affecté).

   PROTECTION CHOISIE (pourquoi) :
   sendBeacon envoie un FormData avec les cookies du site : le jeton CSRF de
   la session (balise <meta name="csrf-token">) peut donc être joint comme
   pour les autres formulaires. On le vérifie, et on ajoute :
     1. l'origine : l'en-tête Origin (ou Sec-Fetch-Site) doit désigner notre
        propre site, pour refuser les envois venus d'autres sites ;
     2. le consentement relu côté serveur (cookie cafpm_consentement = oui)
        et un identifiant visiteur au format attendu (32 caractères hexa) ;
     3. une limitation de débit par session (60 envois / 10 minutes) ;
     4. des tailles bornées et une liste blanche des noms d'actions
        (STATS_EVENEMENTS dans includes/statistiques.php) ;
     5. robots évidents, pages privées et administrateurs connectés ignorés.
   ========================================================================== */

require_once __DIR__ . '/../includes/fonctions.php';
require_once __DIR__ . '/../includes/statistiques.php';

const STATS_ENVOIS_MAX    = 60;  // Envois maximum par session...
const STATS_FENETRE_DEBIT = 600; // ...sur 10 minutes (en secondes)

/**
 * Termine la requête avec un simple code HTTP, sans contenu.
 */
function stats_fin(int $code = 204): void
{
    http_response_code($code);
    header('Cache-Control: no-store');
    exit;
}

// 1. Méthode, jeton CSRF et origine
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    stats_fin(405);
}
if (!csrf_valide()) {
    stats_fin(403);
}

$hote    = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$origine = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origine !== '') {
    if (strtolower((string) parse_url($origine, PHP_URL_HOST) . (parse_url($origine, PHP_URL_PORT) ? ':' . parse_url($origine, PHP_URL_PORT) : '')) !== $hote) {
        stats_fin(403);
    }
} elseif (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] !== 'same-origin') {
    stats_fin(403);
}

// 2. Limitation de débit (compteur conservé dans la session)
$maintenant = time();
$debit = $_SESSION['stats_debit'] ?? ['debut' => $maintenant, 'nombre' => 0];
if (!is_array($debit) || $maintenant - (int) ($debit['debut'] ?? 0) > STATS_FENETRE_DEBIT) {
    $debit = ['debut' => $maintenant, 'nombre' => 0];
}
$debit['nombre'] = (int) $debit['nombre'] + 1;
$_SESSION['stats_debit'] = $debit;
if ($debit['nombre'] > STATS_ENVOIS_MAX) {
    stats_fin(429);
}

// 3. Robots et administrateurs connectés : pas de statistiques
$user_agent = substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500);
if (stats_est_robot($user_agent) || !empty($_SESSION['admin_id'])) {
    stats_fin(204);
}

$type = champ('type', 10);

try {
    // 4a. Choix dans le bandeau : compteur par jour, sans identifiant.
    //     Compté une seule fois par session (changer d'avis ne gonfle pas les chiffres).
    if ($type === 'choix') {
        $choix = champ('choix', 3);
        if (!in_array($choix, ['oui', 'non'], true)) {
            stats_fin(400);
        }
        if (empty($_SESSION['stats_choix_compte'])) {
            require_once __DIR__ . '/../includes/db.php';
            $requete = db()->prepare(
                'INSERT INTO stats_consentements (jour, choix, nombre) VALUES (CURDATE(), ?, 1)
                 ON DUPLICATE KEY UPDATE nombre = nombre + 1'
            );
            $requete->execute([$choix]);
            $_SESSION['stats_choix_compte'] = true;
        }
        stats_fin(204);
    }

    if ($type !== 'vue' && $type !== 'evt') {
        stats_fin(400);
    }
    // Session libérée tout de suite : les pages ouvertes en parallèle n'attendent pas
    session_write_close();

    // 4b. Pages vues et actions : seulement avec le consentement du visiteur
    if (($_COOKIE['cafpm_consentement'] ?? '') !== 'oui') {
        stats_fin(403);
    }
    $visiteur = (string) ($_COOKIE['cafpm_visiteur'] ?? '');
    if (!preg_match('/^[a-f0-9]{32}$/', $visiteur)) {
        stats_fin(400);
    }

    $chemin = stats_nettoyer_chemin(champ('chemin', 500));

    if ($type === 'vue') {
        if ($chemin === null) {
            stats_fin(204); // Page privée ou adresse invalide : ignorée
        }
        $ref_brut = champ('ref', 500);
        $referent = stats_domaine_referent($ref_brut, $hote);
        // Entrée sur le site = toute arrivée qui ne vient pas d'une autre page du site
        $entree = stats_referent_interne($ref_brut, $hote) ? 0 : 1;

        require_once __DIR__ . '/../includes/db.php';
        $pdo = db();
        $requete = $pdo->prepare(
            'INSERT INTO stats_vues (visiteur, chemin, referent, entree, appareil) VALUES (?, ?, ?, ?, ?)'
        );
        $requete->execute([$visiteur, $chemin, $referent, $entree, stats_appareil($user_agent)]);
    } else {
        $nom = champ('nom', 40);
        if (!array_key_exists($nom, STATS_EVENEMENTS)) {
            stats_fin(400); // Action inconnue : refusée
        }
        $detail = stats_texte_court(champ('detail', 200));
        $valeur_brute = champ('valeur', 10);
        $valeur = preg_match('/^\d{1,7}$/', $valeur_brute) ? (int) $valeur_brute : null;

        require_once __DIR__ . '/../includes/db.php';
        $pdo = db();
        $requete = $pdo->prepare(
            'INSERT INTO stats_evenements (visiteur, nom, detail, valeur, chemin) VALUES (?, ?, ?, ?, ?)'
        );
        $requete->execute([$visiteur, $nom, $detail, $valeur, $chemin ?? '']);
    }

    // 5. Ménage occasionnel : efface les données de plus de 13 mois
    if (random_int(1, STATS_PURGE_CHANCE) === 1) {
        stats_purger($pdo);
    }
} catch (Throwable $erreur) {
    // Base indisponible ou autre souci : silencieux pour le visiteur, noté dans le journal
    error_log('[CAFPM] Erreur statistiques : ' . $erreur->getMessage());
    stats_fin(204);
}

stats_fin(204);
