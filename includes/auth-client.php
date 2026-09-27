<?php
/* ==========================================================================
   GARDE D'ACCÈS DE L'ESPACE CLIENT
   --------------------------------------------------------------------------
   À placer en haut de chaque page réservée aux clients connectés :
       require_once __DIR__ . '/../includes/auth-client.php';
       $client = exiger_client();   // ['id', 'entreprise', 'email']
   Si personne n'est connecté (ou si le compte a été supprimé entre-temps),
   le visiteur est renvoyé vers la page d'accueil du site.
   Sécurité :
   - une empreinte du mot de passe est gardée en session : si le mot de passe
     change (changement ou "mot de passe oublié"), toutes les AUTRES sessions
     ouvertes avec l'ancien mot de passe sont aussitôt déconnectées ;
   - déconnexion automatique après 2 h sans activité.
   ========================================================================== */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fonctions.php';

const CLIENT_INACTIVITE_MAX = 2 * 3600; // Déconnexion après 2 h sans activité (en secondes)

/**
 * Empreinte courte du mot de passe (haché) d'un compte, gardée en session.
 * Elle change dès que le mot de passe change.
 */
function empreinte_mot_de_passe(string $hash): string
{
    return substr(hash('sha256', $hash), 0, 32);
}

/**
 * Mémorise en session le client qui vient de se connecter (ou de changer son mot de passe).
 */
function memoriser_client(int $id, string $entreprise, string $hash): void
{
    $_SESSION['client_id']         = $id;
    $_SESSION['client_entreprise'] = $entreprise;
    $_SESSION['client_empreinte']  = empreinte_mot_de_passe($hash);
    $_SESSION['client_activite']   = time();
}

function exiger_client(): array
{
    $client = null;

    // Trop longtemps inactif : déconnexion
    if (!empty($_SESSION['client_id']) && time() - (int) ($_SESSION['client_activite'] ?? 0) > CLIENT_INACTIVITE_MAX) {
        unset($_SESSION['client_id']);
        flash('info', 'Session expirée après une longue inactivité. Reconnectez-vous.');
    }

    if (!empty($_SESSION['client_id'])) {
        try {
            // On relit le compte à chaque page : un compte supprimé par l'admin est aussitôt déconnecté
            $requete = db()->prepare('SELECT id, entreprise, email, mot_de_passe FROM clients WHERE id = ? LIMIT 1');
            $requete->execute([(int) $_SESSION['client_id']]);
            $client = $requete->fetch() ?: null;

            // Mot de passe changé depuis la connexion de CETTE session : déconnexion
            if ($client && !hash_equals(empreinte_mot_de_passe($client['mot_de_passe']), (string) ($_SESSION['client_empreinte'] ?? ''))) {
                $client = null;
            }
        } catch (PDOException $erreur) {
            error_log('[CAFPM] Erreur espace client : ' . $erreur->getMessage());
            http_response_code(500);
            exit('Service momentanément indisponible. Réessayez plus tard.');
        }
    }

    if (!$client) {
        unset($_SESSION['client_id'], $_SESSION['client_entreprise'], $_SESSION['client_empreinte'], $_SESSION['client_activite']);
        rediriger('../index.php');
    }

    $_SESSION['client_activite'] = time();
    unset($client['mot_de_passe']); // Le mot de passe haché ne sort pas de ce fichier
    return $client;
}
