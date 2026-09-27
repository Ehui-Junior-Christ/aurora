<?php
/* ==========================================================================
   POLITIQUE DE CONFIDENTIALITÉ (protection des données personnelles)
   --------------------------------------------------------------------------
   Cadre : loi ivoirienne n° 2013-450 du 19 juin 2013 relative à la
   protection des données à caractère personnel ; autorité de contrôle :
   ARTCI. Les mentions "[À compléter / À valider]" (classe .a-completer)
   doivent être vérifiées par CAFPM avant la mise en ligne.
   ========================================================================== */

require_once __DIR__ . '/partials/amorce.php';

$titre_page       = 'Politique de confidentialité';
$description_page = "Comment CAFPM collecte, utilise et protège vos données personnelles (candidatures, demandes, contact, newsletter).";
$page_active      = 'legal';

$bandeau = [
    'fil'   => [['Accueil', 'index.php'], ['Politique de confidentialité', null]],
    'titre' => 'Politique de confidentialité',
    'texte' => 'Vos données personnelles nous sont confiées : voici comment nous les utilisons et les protégeons.',
];

// Données collectées par formulaire : [formulaire, données, finalité, durée de conservation]
$traitements = [
    ['Demande de personnel (« Déposer un besoin »)', "Nom de l'entreprise, email ou téléphone de contact, secteur d'activité, profil recherché, nombre de postes, message", 'Étudier votre besoin, vous recontacter, établir une proposition commerciale', '3 ans à compter du dernier contact'],
    ['Profil candidat (« Créer mon profil »)', "Nom, téléphone, métier, domaine d'expertise, expérience, disponibilité, ville, CV (PDF) et les informations qu'il contient", 'Constituer notre vivier de candidats, vous proposer des missions, des emplois ou des formations adaptés, présenter votre profil de façon anonyme dans la recherche de profils du site', '2 ans à compter du dernier contact, sauf demande de suppression'],
    ['Formulaire de contact', 'Nom, email, téléphone (facultatif), sujet, message', 'Répondre à votre demande', '1 an à compter du dernier échange'],
    ['Newsletter', 'Adresse email', 'Vous envoyer nos actualités, offres et dates de formation', "Jusqu'à votre désinscription"],
    ['Espace client', 'Adresse email, mot de passe (enregistré sous forme chiffrée, jamais en clair)', 'Vous permettre de suivre vos demandes en toute sécurité', 'Pendant la durée de la relation commerciale'],
    ['Statistiques de visite (uniquement si vous les acceptez, voir la section 7)', "Identifiant aléatoire, pages consultées, site de provenance (domaine), type d'appareil, actions effectuées sur le site (sans le contenu des formulaires), date et heure. Pas d'adresse IP", 'Mesurer la fréquentation du site et améliorer nos services', '13 mois, puis effacement automatique'],
];

require __DIR__ . '/partials/header.php';
?>
    <main id="contenu">
        <?php require __DIR__ . '/partials/bandeau-page.php'; ?>

        <section class="page-section">
            <div class="container">
                <div class="prose prose-legale">
                    <p>La présente politique explique comment <?= e(SITE_NOM . ' ' . SITE_FORME) ?> collecte et traite les données personnelles des utilisateurs de ce site, conformément à la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel en Côte d'Ivoire.</p>

                    <h2>1. Responsable du traitement</h2>
                    <p>Le responsable du traitement est <?= e(SITE_NOM . ' ' . SITE_FORME) ?>, dont le siège est situé à <?= e(SITE_ADRESSE) ?>, Côte d'Ivoire (<a href="mailto:<?= e(EMAIL_RECEPTION) ?>"><?= e(EMAIL_RECEPTION) ?></a>, <?= e(SITE_TELEPHONE) ?>).</p>
                    <p>Formalités auprès de l'ARTCI : <span class="a-completer">[À compléter : référence du récépissé de déclaration ou de l'autorisation délivrée par l'ARTCI]</span></p>

                    <h2>2. Données collectées, finalités et durées de conservation</h2>
                    <p>Nous collectons uniquement les données que vous nous transmettez volontairement via les formulaires du site, ainsi que, si vous les acceptez, des statistiques de visite rattachées à un identifiant aléatoire (et non à votre identité) :</p>
                </div>

                <div class="tableau-conteneur" tabindex="0">
                    <table class="tableau-donnees">
                        <thead>
                            <tr>
                                <th scope="col">Formulaire</th>
                                <th scope="col">Données collectées</th>
                                <th scope="col">Finalité</th>
                                <th scope="col">Durée de conservation</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($traitements as [$formulaire, $donnees, $finalite, $duree]): ?>
                            <tr>
                                <th scope="row"><?= e($formulaire) ?></th>
                                <td><?= e($donnees) ?></td>
                                <td><?= e($finalite) ?></td>
                                <td><?= e($duree) ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>

                <div class="prose prose-legale">
                    <p class="a-completer">[À valider par CAFPM : durées de conservation proposées ci-dessus]</p>
                    <p>Les critères saisis dans la barre de recherche de profils servent à afficher les profils anonymes correspondants. Ils ne sont pas conservés, sauf si vous avez accepté les statistiques de visite : le métier recherché et le nombre de résultats sont alors comptés, sans aucune donnée permettant de vous identifier (voir la section 7). En cas d'échec de connexion à l'espace client, l'adresse IP et l'email saisi sont conservés au maximum 24 heures, afin de protéger les comptes contre les tentatives d'intrusion.</p>

                    <h2>3. Base légale des traitements</h2>
                    <p>Selon les cas, le traitement de vos données repose sur :</p>
                    <ul>
                        <li>votre consentement, exprimé lors de l'envoi d'un formulaire ou de l'inscription à la newsletter ;</li>
                        <li>l'exécution de mesures précontractuelles ou d'un contrat (demande de personnel, mission, espace client) ;</li>
                        <li>le respect de nos obligations légales, notamment en matière de droit du travail.</li>
                    </ul>

                    <h2>4. Destinataires des données</h2>
                    <p>Vos données sont destinées au personnel habilité de <?= e(SITE_NOM) ?>, dans la limite de ses attributions. Les profils des candidats (y compris le CV) ne sont communiqués qu'aux entreprises clientes concernées par une mission ou un poste correspondant, dans le cadre d'une proposition de candidature. Dans la recherche de profils accessible à tous sur le site, un profil apparaît uniquement sous forme anonyme (numéro de profil, métier, domaine, expérience, disponibilité et ville) : le nom, le téléphone et le CV n'y sont jamais affichés. Seuls les profils marqués « disponibles » y figurent.</p>
                    <p>Vos données ne sont jamais vendues ni louées. Elles peuvent être hébergées par notre prestataire d'hébergement (<span class="a-completer">[À compléter : nom et pays d'hébergement]</span>). Tout transfert hors de Côte d'Ivoire est effectué dans le respect des conditions prévues par la loi n° 2013-450.</p>

                    <h2>5. Sécurité</h2>
                    <p>Nous mettons en œuvre des mesures techniques et organisationnelles adaptées pour protéger vos données : formulaires protégés contre les envois frauduleux, CV stockés dans un espace non accessible au public, accès limité aux seules personnes habilitées.</p>

                    <h2>6. Vos droits</h2>
                    <p>Conformément à la loi n° 2013-450, vous disposez des droits suivants sur vos données :</p>
                    <ul>
                        <li>droit d'information et d'accès : savoir quelles données nous détenons à votre sujet et en obtenir une copie ;</li>
                        <li>droit de rectification : faire corriger des données inexactes ou incomplètes ;</li>
                        <li>droit de suppression : demander l'effacement de vos données (par exemple, retirer votre profil candidat) ;</li>
                        <li>droit d'opposition : vous opposer, pour un motif légitime, au traitement de vos données, et à tout moment à la réception de la newsletter.</li>
                    </ul>
                    <p>Pour exercer ces droits, écrivez-nous à <a href="mailto:<?= e(EMAIL_RECEPTION) ?>"><?= e(EMAIL_RECEPTION) ?></a> ou via notre <a href="<?= e(lien_site('contact.php?sujet=Autre')) ?>">formulaire de contact</a>, en précisant votre demande. Une preuve d'identité pourra vous être demandée. Nous vous répondons dans les meilleurs délais.</p>
                    <p>Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de l'Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire (ARTCI), autorité de protection des données à caractère personnel : <a href="https://www.artci.ci" target="_blank" rel="noopener">www.artci.ci</a>.</p>

                    <h2>7. Cookies et statistiques de visite</h2>
                    <p>Le site utilise un cookie technique de session, indispensable à la sécurité des formulaires et à la connexion à l'espace client (supprimé à la fermeture du navigateur), ainsi qu'un cookie qui mémorise pendant 6 mois votre choix dans le bandeau de cookies. Aucun cookie publicitaire n'est utilisé.</p>
                    <p>Avec votre accord uniquement, nous mesurons la fréquentation du site à l'aide de statistiques hébergées sur notre propre serveur, sans service tiers : pages consultées, site de provenance (nom de domaine seulement), type d'appareil et certaines actions (ouverture et envoi réussi des formulaires, recherche de profils, lecture de vidéos, clics sur nos coordonnées). Ces informations sont rattachées à un identifiant aléatoire (cookie <strong>cafpm_visiteur</strong>, 13 mois maximum) et non à votre identité ; votre adresse IP n'est pas enregistrée. Elles sont <strong>conservées 13 mois</strong>, puis effacées automatiquement. <span class="a-completer">[À valider par CAFPM : durée de conservation des statistiques]</span></p>
                    <p>Les polices de caractères du site sont chargées depuis le service Google Fonts, et les vidéos des événements peuvent être lues avec le lecteur YouTube : à cette occasion, votre adresse IP est transmise à Google.</p>
                    <p>Le détail des cookies, leurs durées et la manière de retirer votre consentement à tout moment figurent dans notre <a href="<?= e(lien_site('cookies.php')) ?>">politique de cookies</a>.</p>

                    <h2>8. Modification de la politique</h2>
                    <p>Cette politique peut être mise à jour pour tenir compte de l'évolution de nos services ou de la réglementation. La date de dernière mise à jour figure ci-dessous.</p>

                    <p class="mise-a-jour">Dernière mise à jour : <span class="a-completer">[À compléter : date de mise à jour]</span></p>
                </div>
            </div>
        </section>
    </main>
<?php require __DIR__ . '/partials/fin-page.php'; ?>
