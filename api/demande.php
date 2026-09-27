<?php
/* ==========================================================================
   TRAITEMENT : "Déposer un besoin" (formulaire entreprise)
   --------------------------------------------------------------------------
   1. Vérifie la sécurité (POST + jeton CSRF)
   2. Récupère et contrôle les champs
   3. Enregistre la demande dans la table `demandes` (reliée au compte
      client si un client est connecté à son Espace client)
   4. Prévient CAFPM par email
   5. Répond au JavaScript en JSON
   ========================================================================== */

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/fonctions.php';

// 1. Sécurité
exiger_post();
verifier_csrf();

// 2. Récupération des champs du formulaire
$entreprise    = champ('entreprise', 150);
$contact       = champ('contact', 150);
$secteur       = champ('secteur', 100);
$profil        = champ('profil', 150);
$nombre_postes = entier($_POST, 'nombre_postes');
$message       = champ('message', 2000);

// Contrôle : champs obligatoires
if ($entreprise === '' || $contact === '' || $secteur === '' || $profil === '' || $nombre_postes < 1 || $nombre_postes > 9999) {
    repondre_json(false, 'Merci de remplir tous les champs obligatoires.', 422);
}

// Client connecté ? La demande apparaîtra dans son Espace client (sinon NULL)
$client_id = isset($_SESSION['client_id']) ? (int) $_SESSION['client_id'] : null;

// 3. Enregistrement en base de données (requête préparée = protection anti-injection SQL)
try {
    $requete = db()->prepare(
        'INSERT INTO demandes (client_id, entreprise, contact, secteur, profil, nombre_postes, message)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $requete->execute([$client_id, $entreprise, $contact, $secteur, $profil, $nombre_postes, $message]);
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur demande : ' . $erreur->getMessage());
    repondre_json(false, 'Une erreur est survenue. Veuillez réessayer plus tard.', 500);
}

// 4. Notification email à CAFPM
envoyer_email(
    'Nouvelle demande de personnel : ' . $entreprise,
    "Entreprise : $entreprise\nContact : $contact\nSecteur : $secteur\n"
    . "Profil recherché : $profil\nNombre de postes : $nombre_postes\n\nMessage :\n$message"
);

// 5. Réponse
repondre_json(true, 'Demande envoyée ! Un conseiller vous recontacte sous 24h.');
