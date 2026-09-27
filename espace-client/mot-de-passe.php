<?php
/* ==========================================================================
   ESPACE CLIENT : CHANGER SON MOT DE PASSE (client connecté)
   --------------------------------------------------------------------------
   1. Vérifie la connexion
   2. À l'envoi (POST) : jeton CSRF, vérification du mot de passe actuel,
      contrôle du nouveau, enregistrement du nouveau hash
   3. Sinon : affiche le formulaire
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-client.php';
require_once __DIR__ . '/../includes/layout-espace.php';

// 1. Client connecté obligatoire
$client = exiger_client();

// 2. Traitement du formulaire
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $actuel       = mot_de_passe_post('actuel');
    $nouveau      = mot_de_passe_post('nouveau');
    $confirmation = mot_de_passe_post('confirmation');

    try {
        $requete = db()->prepare('SELECT mot_de_passe FROM clients WHERE id = ?');
        $requete->execute([$client['id']]);
        $hash_actuel = (string) $requete->fetchColumn();

        if (!csrf_valide()) {
            flash('erreur', 'Session expirée. Veuillez renvoyer le formulaire.');
        } elseif (!password_verify($actuel, $hash_actuel)) {
            flash('erreur', 'Le mot de passe actuel est incorrect.');
        } elseif ($erreur_mdp = erreur_mot_de_passe($nouveau, $confirmation)) {
            flash('erreur', $erreur_mdp);
        } else {
            // Nouveau hash + annulation des éventuels liens "mot de passe oublié" encore valides
            $nouveau_hash = password_hash($nouveau, PASSWORD_DEFAULT);
            db()->prepare('UPDATE clients SET mot_de_passe = ? WHERE id = ?')
                ->execute([$nouveau_hash, $client['id']]);
            db()->prepare('UPDATE reinitialisations SET utilise = 1 WHERE client_id = ?')
                ->execute([$client['id']]);

            session_regenerate_id(true); // Nouvel identifiant de session par sécurité
            // Cette session reste connectée ; les autres sessions (ancien mot de passe) sont déconnectées
            memoriser_client((int) $client['id'], $client['entreprise'], $nouveau_hash);
            flash('succes', 'Votre mot de passe a bien été modifié.');
            rediriger('index.php');
        }
    } catch (PDOException $erreur) {
        error_log('[CAFPM] Erreur changement mot de passe : ' . $erreur->getMessage());
        flash('erreur', 'Une erreur est survenue. Veuillez réessayer plus tard.');
    }
}

// 3. Affichage du formulaire
espace_entete('Changer mon mot de passe', $client);
?>
        <section class="espace-carte espace-carte-etroite">
            <h1>Changer mon mot de passe</h1>
            <p class="espace-texte-doux">8 caractères minimum. Évitez un mot de passe déjà utilisé ailleurs.</p>

            <form method="post" action="mot-de-passe.php" class="espace-form">
                <?= champ_csrf() ?>
                <div class="input-group">
                    <label for="actuel">Mot de passe actuel</label>
                    <input type="password" id="actuel" name="actuel" required autocomplete="current-password">
                </div>
                <div class="input-group">
                    <label for="nouveau">Nouveau mot de passe</label>
                    <input type="password" id="nouveau" name="nouveau" required minlength="8" maxlength="72" autocomplete="new-password">
                </div>
                <div class="input-group">
                    <label for="confirmation">Confirmer le nouveau mot de passe</label>
                    <input type="password" id="confirmation" name="confirmation" required minlength="8" maxlength="72" autocomplete="new-password">
                </div>
                <div class="espace-actions">
                    <button type="submit" class="btn btn-primary">Enregistrer</button>
                    <a href="index.php" class="btn btn-secondary">Annuler</a>
                </div>
            </form>
        </section>
<?php
espace_pied();
