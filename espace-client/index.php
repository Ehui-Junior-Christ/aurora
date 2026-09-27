<?php
/* ==========================================================================
   ESPACE CLIENT : TABLEAU DE BORD
   --------------------------------------------------------------------------
   Page réservée aux clients connectés (sinon retour à l'accueil).
   1. Vérifie la connexion et récupère le compte du client
   2. Charge SES demandes de personnel (colonne demandes.client_id)
   3. Affiche : en-tête de l'entreprise, résumé, suivi de chaque demande
      (étapes Reçue -> En recrutement -> Pourvue) et contact CAFPM
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-client.php';
require_once __DIR__ . '/../includes/layout-espace.php';

// 1. Client connecté obligatoire
$client = exiger_client();

// 2. Ses demandes, de la plus récente à la plus ancienne
try {
    $requete = db()->prepare(
        'SELECT id, profil, secteur, nombre_postes, statut, cree_le
         FROM demandes WHERE client_id = ? ORDER BY cree_le DESC, id DESC'
    );
    $requete->execute([$client['id']]);
    $demandes = $requete->fetchAll();
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur tableau de bord client : ' . $erreur->getMessage());
    $demandes = [];
    flash('erreur', 'Impossible de charger vos demandes pour le moment.');
}

// Étapes du suivi, dans l'ordre (clé = statut de la demande)
$etapes = [
    'nouvelle' => 'Reçue',
    'en_cours' => 'En recrutement',
    'traitee'  => 'Pourvue',
];
// Phrase expliquant où en est la demande
$explications = [
    'nouvelle' => 'Un conseiller vous recontacte sous 24 h pour préciser votre besoin.',
    'en_cours' => 'Nous sélectionnons les profils. Vous recevrez une proposition dès que possible.',
    'traitee'  => 'Demande clôturée. Un nouveau besoin ? Déposez-le en un clic.',
];

// Résumé : nombre de demandes par statut
$en_cours = count(array_filter($demandes, fn($d) => $d['statut'] !== 'traitee'));

// 3. Affichage
espace_entete('Tableau de bord', $client);
?>
        <div class="espace-entete-page">
            <div>
                <h1><?= e($client['entreprise']) ?></h1>
                <p class="espace-texte-doux">
                    <?php if (!$demandes): ?>
                        Aucune demande pour le moment.
                    <?php else: ?>
                        <?= count($demandes) ?> demande<?= count($demandes) > 1 ? 's' : '' ?>
                        &middot; <?= $en_cours ?> non terminée<?= $en_cours > 1 ? 's' : '' ?>
                    <?php endif; ?>
                </p>
            </div>
            <a href="nouvelle-demande.php" class="btn btn-primary">Déposer un nouveau besoin</a>
        </div>

        <div class="espace-grille">
            <section aria-labelledby="titre-demandes">
                <h2 id="titre-demandes" class="espace-section-titre">Suivi de mes demandes</h2>

                <?php if (!$demandes): ?>
                    <div class="espace-vide">
                        <p>Vous n'avez encore déposé aucune demande de personnel.</p>
                        <a href="nouvelle-demande.php">Déposer mon premier besoin</a>
                    </div>
                <?php else: ?>
                    <ol class="suivi-liste">
                        <?php foreach ($demandes as $d):
                            $rang_actuel = array_search($d['statut'], array_keys($etapes), true);
                            if ($d['statut'] === 'traitee') {
                                $rang_actuel = count($etapes); // Demande pourvue : toutes les étapes sont terminées
                            }
                            $quand = il_y_a($d['cree_le']);
                            $quand = ctype_digit($quand[0]) ? 'le ' . $quand : $quand; // "le 12 sept." / "hier" ?>
                        <li class="suivi-demande">
                            <div class="suivi-entete">
                                <div>
                                    <h3><?= (int) $d['nombre_postes'] ?> &times; <?= e($d['profil']) ?></h3>
                                    <p class="espace-texte-doux"><?= e($d['secteur']) ?> &middot; déposée <?= e($quand) ?></p>
                                </div>
                                <span class="suivi-ref">N° <?= (int) $d['id'] ?></span>
                            </div>

                            <!-- Étapes : terminées, étape actuelle, à venir -->
                            <ol class="suivi-etapes" aria-label="Avancement de la demande">
                                <?php foreach (array_values($etapes) as $rang => $libelle):
                                    $etat = $rang < $rang_actuel ? 'faite' : ($rang === $rang_actuel ? 'actuelle' : 'a-venir'); ?>
                                <li class="etape etape-<?= $etat ?>"<?= $etat === 'actuelle' ? ' aria-current="step"' : '' ?>><?= e($libelle) ?></li>
                                <?php endforeach; ?>
                            </ol>
                            <p class="suivi-explication"><?= e($explications[$d['statut']] ?? '') ?></p>
                        </li>
                        <?php endforeach; ?>
                    </ol>
                <?php endif; ?>
            </section>

            <aside class="espace-contact" aria-labelledby="titre-contact">
                <h2 id="titre-contact">Une question sur une demande&nbsp;?</h2>
                <p>Appelez-nous ou écrivez-nous en indiquant le numéro de la demande.</p>
                <a class="espace-contact-tel" href="tel:<?= e(preg_replace('/[^0-9+]/', '', SITE_TELEPHONE)) ?>"><?= e(SITE_TELEPHONE) ?></a>
                <a class="espace-contact-mail" href="mailto:<?= e(EMAIL_RECEPTION) ?>"><?= e(EMAIL_RECEPTION) ?></a>
                <p class="espace-texte-doux espace-contact-compte">Connecté avec <?= e($client['email']) ?></p>
            </aside>
        </div>
<?php
espace_pied();
