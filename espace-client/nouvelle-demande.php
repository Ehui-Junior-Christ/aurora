<?php
/* ==========================================================================
   ESPACE CLIENT : DÉPOSER UN NOUVEAU BESOIN
   --------------------------------------------------------------------------
   Même formulaire que "Déposer un besoin" du site, mais le nom de
   l'entreprise est repris du compte et la demande est reliée au client
   (elle apparaît ensuite dans son tableau de bord).
   1. Vérifie la connexion
   2. À l'envoi (POST) : jeton CSRF, contrôle des champs, enregistrement,
      email à CAFPM, puis retour au tableau de bord
   3. Sinon : affiche le formulaire
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-client.php';
require_once __DIR__ . '/../includes/layout-espace.php';
require_once __DIR__ . '/../config/contenu.php'; // Liste $domaines (secteurs)

// 1. Client connecté obligatoire
$client = exiger_client();

// Valeurs du formulaire (reprises en cas d'erreur pour ne pas tout retaper)
$valeurs = ['contact' => $client['email'], 'secteur' => '', 'profil' => '', 'nombre_postes' => '1', 'message' => ''];

// 2. Traitement du formulaire
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $valeurs = [
        'contact'       => champ('contact', 150),
        'secteur'       => champ('secteur', 100),
        'profil'        => champ('profil', 150),
        'nombre_postes' => champ('nombre_postes', 5),
        'message'       => champ('message', 2000),
    ];
    $nombre_postes = (int) $valeurs['nombre_postes'];

    if (!csrf_valide()) {
        flash('erreur', 'Session expirée. Veuillez renvoyer le formulaire.');
    } elseif ($valeurs['contact'] === '' || !in_array($valeurs['secteur'], $domaines, true) || $valeurs['profil'] === ''
              || $nombre_postes < 1 || $nombre_postes > 9999) {
        flash('erreur', 'Merci de remplir tous les champs obligatoires.');
    } else {
        try {
            $requete = db()->prepare(
                'INSERT INTO demandes (client_id, entreprise, contact, secteur, profil, nombre_postes, message)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $requete->execute([
                $client['id'], $client['entreprise'], $valeurs['contact'], $valeurs['secteur'],
                $valeurs['profil'], $nombre_postes, $valeurs['message'],
            ]);

            envoyer_email(
                'Nouvelle demande de personnel (espace client) : ' . $client['entreprise'],
                "Entreprise : {$client['entreprise']}\nContact : {$valeurs['contact']}\nSecteur : {$valeurs['secteur']}\n"
                . "Profil recherché : {$valeurs['profil']}\nNombre de postes : $nombre_postes\n\nMessage :\n{$valeurs['message']}"
            );

            flash('succes', 'Demande envoyée ! Un conseiller vous recontacte sous 24h.');
            rediriger('index.php');
        } catch (PDOException $erreur) {
            error_log('[CAFPM] Erreur demande espace client : ' . $erreur->getMessage());
            flash('erreur', 'Une erreur est survenue. Veuillez réessayer plus tard.');
        }
    }
}

// 3. Affichage du formulaire
espace_entete('Déposer un besoin', $client);
?>
        <section class="espace-carte espace-carte-etroite">
            <h1>Déposer un besoin</h1>
            <p class="espace-texte-doux">Décrivez votre besoin en personnel pour <strong><?= e($client['entreprise']) ?></strong>.
                Un conseiller CAFPM vous recontactera sous 24h.</p>

            <form method="post" action="nouvelle-demande.php" class="espace-form">
                <?= champ_csrf() ?>
                <div class="input-group">
                    <label for="contact">Email ou téléphone de contact</label>
                    <input type="text" id="contact" name="contact" required maxlength="150" value="<?= e($valeurs['contact']) ?>">
                </div>
                <div class="input-group">
                    <label for="secteur">Secteur d'activité</label>
                    <select id="secteur" name="secteur" required>
                        <option value="">Sélectionner...</option>
                        <?php foreach ($domaines as $domaine): ?>
                        <option<?= $domaine === $valeurs['secteur'] ? ' selected' : '' ?>><?= e($domaine) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="input-group">
                    <label for="profil">Profil recherché</label>
                    <input type="text" id="profil" name="profil" required maxlength="150" placeholder="Ex: Chef de chantier" value="<?= e($valeurs['profil']) ?>">
                </div>
                <div class="input-group">
                    <label for="nombre_postes">Nombre de postes</label>
                    <input type="number" id="nombre_postes" name="nombre_postes" min="1" max="9999" required value="<?= e($valeurs['nombre_postes']) ?>">
                </div>
                <div class="input-group">
                    <label for="message">Message (optionnel)</label>
                    <textarea id="message" name="message" rows="4" maxlength="2000"><?= e($valeurs['message']) ?></textarea>
                </div>
                <div class="espace-actions">
                    <button type="submit" class="btn btn-primary">Envoyer la demande</button>
                    <a href="index.php" class="btn btn-secondary">Annuler</a>
                </div>
            </form>
        </section>
<?php
espace_pied();
