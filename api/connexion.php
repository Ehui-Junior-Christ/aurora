<?php
/* ==========================================================================
   TRAITEMENT : connexion à l'Espace client (modale "Connexion Espace Client")
   --------------------------------------------------------------------------
   1. Vérifie la sécurité (POST + jeton CSRF) et les champs
   2. Bloque temporairement après trop d'échecs (anti-force brute)
   3. Cherche le client par son email dans la table `clients`
   4. Compare le mot de passe avec le hash enregistré (password_verify)
   5. Si c'est correct, mémorise le client dans la session et renvoie
      l'adresse du tableau de bord (main.js y redirige automatiquement)
   Les comptes clients se créent dans le back-office : admin/clients.php
   ========================================================================== */

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/fonctions.php';
require_once __DIR__ . '/../includes/anti-force-brute.php';
require_once __DIR__ . '/../includes/auth-client.php'; // memoriser_client()

// 1. Sécurité et champs
exiger_post();
verifier_csrf();

$email        = champ('email', 190);
$mot_de_passe = mot_de_passe_post('mot_de_passe');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $mot_de_passe === '') {
    repondre_json(false, 'Email ou mot de passe incorrect.', 422);
}

try {
    // 2. Trop d'échecs récents pour cet email depuis cette adresse IP ?
    if (trop_de_tentatives('client', $email)) {
        repondre_json(false, 'Trop de tentatives. Réessayez dans ' . TENTATIVES_MINUTES . ' minutes.', 429);
    }

    // 3. Recherche du client
    $requete = db()->prepare('SELECT id, entreprise, mot_de_passe FROM clients WHERE email = ? LIMIT 1');
    $requete->execute([$email]);
    $client = $requete->fetch();

    // 4. Même message d'erreur que l'email existe ou non (on ne donne pas d'indice aux pirates)
    if (!$client || !password_verify($mot_de_passe, $client['mot_de_passe'])) {
        noter_echec('client', $email);
        repondre_json(false, 'Email ou mot de passe incorrect.', 401);
    }

    effacer_tentatives('client', $email);
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur connexion : ' . $erreur->getMessage());
    repondre_json(false, 'Une erreur est survenue. Veuillez réessayer plus tard.', 500);
}

// 5. Connexion réussie : nouvel identifiant de session (sécurité) + mémorisation du client
session_regenerate_id(true);
memoriser_client((int) $client['id'], $client['entreprise'], $client['mot_de_passe']);

// Adresse du tableau de bord à partir de la racine du site (ex. "/espace-client/", ou
// "/cafpm/espace-client/" si le site est dans un sous-dossier) : fonctionne depuis n'importe quelle page
$racine = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'], 2)), '/');
repondre_json(true, 'Bienvenue ' . $client['entreprise'] . ' !', 200, ['redirection' => $racine . '/espace-client/']);
