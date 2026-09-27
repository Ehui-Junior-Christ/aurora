<?php
/* ==========================================================================
   POLITIQUE DE COOKIES
   --------------------------------------------------------------------------
   Liste des cookies et traceurs utilisés par le site, leurs finalités et
   durées, et la manière de donner ou retirer son consentement (bouton
   « Gérer les cookies », géré par assets/js/consentement.js).
   Cadre : loi ivoirienne n° 2013-450 du 19 juin 2013 relative à la
   protection des données à caractère personnel ; autorité : ARTCI.
   Les mentions "[À compléter / À valider]" (classe .a-completer) doivent
   être vérifiées par CAFPM avant la mise en ligne définitive.
   Si un cookie est ajouté au site, il doit être ajouté au tableau ci-dessous.
   ========================================================================== */

require_once __DIR__ . '/partials/amorce.php';

$titre_page       = 'Politique de cookies';
$description_page = "Cookies utilisés sur le site de CAFPM, statistiques de visite hébergées sur le site et gestion de votre consentement.";
$page_active      = 'legal';

$bandeau = [
    'fil'   => [['Accueil', 'index.php'], ['Politique de cookies', null]],
    'titre' => 'Politique de cookies',
    'texte' => 'Quels cookies nous utilisons, pourquoi, pendant combien de temps, et comment changer d’avis à tout moment.',
];

// Cookies et traceurs : [nom, émetteur, finalité, durée, consentement requis ?]
$cookies = [
    ['PHPSESSID', SITE_NOM . ' (cookie technique)', 'Sécurité des formulaires (protection contre les envois frauduleux) et connexion à l’espace client.', 'Fermeture du navigateur', 'Non : indispensable au fonctionnement du site'],
    ['cafpm_consentement', SITE_NOM . ' (cookie technique)', 'Mémoriser votre choix (« oui » ou « non ») dans le bandeau de cookies, pour ne pas vous le redemander à chaque page.', '6 mois', 'Non : sert à respecter votre choix'],
    ['cafpm_visiteur', SITE_NOM . ' (mesure d’audience)', 'Identifiant aléatoire permettant de compter les visiteurs uniques et de relier les pages consultées au cours de vos visites. Il ne contient aucune information sur vous.', '13 mois maximum (jamais prolongé)', 'Oui : déposé seulement si vous cliquez sur « Accepter »'],
    ['Cookies YouTube', 'Google / YouTube (youtube-nocookie.com)', 'Lecture des vidéos YouTube intégrées aux pages des événements. Le lecteur n’est chargé que lorsque vous cliquez sur une vidéo (ou, dans le carrousel de l’accueil, lorsque la diapositive vidéo s’affiche) : aucun cookie YouTube n’est déposé avant.', 'Fixée par YouTube', 'Lecture de la vidéo'],
];

require __DIR__ . '/partials/header.php';
?>
    <main id="contenu">
        <?php require __DIR__ . '/partials/bandeau-page.php'; ?>

        <section class="page-section">
            <div class="container">
                <div class="prose prose-legale">
                    <p>Un cookie est un petit fichier déposé sur votre ordinateur, tablette ou téléphone lorsque vous consultez un site. Cette page explique quels cookies utilise le site de <?= e(SITE_NOM . ' ' . SITE_FORME) ?>, pourquoi, et comment vous pouvez les accepter ou les refuser, conformément à la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel en Côte d'Ivoire.</p>

                    <h2>1. En bref</h2>
                    <ul>
                        <li>Aucun cookie publicitaire, aucun réseau social, aucun Google Analytics.</li>
                        <li>Nos statistiques de visite sont hébergées sur notre propre site et ne sont partagées avec personne.</li>
                        <li>Elles ne sont activées que si vous cliquez sur « Accepter ». Refuser n’a aucune conséquence sur votre navigation.</li>
                        <li>Vous pouvez changer d’avis à tout moment grâce au bouton « Gérer les cookies », en bas de chaque page.</li>
                    </ul>

                    <h2>2. Les cookies utilisés</h2>
                </div>

                <div class="tableau-conteneur" tabindex="0">
                    <table class="tableau-donnees">
                        <thead>
                            <tr>
                                <th scope="col">Cookie</th>
                                <th scope="col">Déposé par</th>
                                <th scope="col">Finalité</th>
                                <th scope="col">Durée</th>
                                <th scope="col">Votre accord est-il demandé ?</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($cookies as [$nom, $emetteur, $finalite, $duree, $accord]): ?>
                            <tr>
                                <th scope="row"><?= e($nom) ?></th>
                                <td><?= e($emetteur) ?></td>
                                <td><?= e($finalite) ?></td>
                                <td><?= e($duree) ?></td>
                                <td><?= e($accord) ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>

                <div class="prose prose-legale">
                    <h2>3. Statistiques de visite (mesure d’audience)</h2>
                    <p>Si vous l’acceptez, nous enregistrons sur notre propre serveur des informations sur votre utilisation du site, afin de savoir quelles pages et quels services intéressent nos visiteurs et d’améliorer le site :</p>
                    <ul>
                        <li>les pages consultées, avec la date et l’heure ;</li>
                        <li>le site d’où vous venez (uniquement son nom de domaine, par exemple « google.com ») ;</li>
                        <li>le type d’appareil utilisé (téléphone, tablette ou ordinateur), déduit de votre navigateur ;</li>
                        <li>certaines actions : ouverture des formulaires « Déposer un besoin », « Créer mon profil » et « Espace client », envoi réussi d’un formulaire (sans son contenu), recherche de profils (le métier recherché et le nombre de résultats), lecture d’une vidéo, clic sur « Voir l’événement », sur le numéro de téléphone, l’adresse email ou WhatsApp.</li>
                    </ul>
                    <p>Ces informations sont rattachées à l’identifiant aléatoire du cookie <strong>cafpm_visiteur</strong>, et non à votre nom. Nous n’enregistrons <strong>pas votre adresse IP</strong>, ni le détail de votre navigateur, ni le contenu des formulaires. Les statistiques ne sont consultables que par le personnel habilité de <?= e(SITE_NOM) ?>, dans l’espace d’administration du site. Elles sont <strong>effacées automatiquement au bout de 13 mois</strong>.</p>
                    <p>Pour mesurer la part des visiteurs qui acceptent ces statistiques, nous comptons aussi, jour par jour, le nombre de clics sur « Accepter » et sur « Refuser ». Ce simple compteur ne contient aucun identifiant et ne permet pas de vous reconnaître.</p>
                    <p>Les visites des robots (moteurs de recherche, outils automatiques) et des pages privées (espace client, administration) ne sont pas comptées.</p>
                    <p class="a-completer">[À valider par CAFPM : durée de conservation des statistiques (13 mois proposés)]</p>

                    <h2>4. Services tiers</h2>
                    <p><strong>Vidéos YouTube.</strong> Certaines pages d’événements contiennent des vidéos hébergées par YouTube, intégrées en mode « confidentialité renforcée » (youtube-nocookie.com). Tant que vous ne lancez pas une vidéo, seule son image d’aperçu est affichée et YouTube ne dépose aucun cookie. Lorsque le lecteur se charge, YouTube (Google) peut déposer des cookies et recevoir votre adresse IP, selon sa propre politique de confidentialité : <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">policies.google.com/privacy</a>.</p>
                    <p><strong>Polices de caractères.</strong> Les polices du site sont chargées depuis le service Google Fonts. Ce service ne dépose pas de cookie, mais votre navigateur transmet à cette occasion votre adresse IP aux serveurs de Google, comme pour tout fichier chargé depuis un autre site.</p>

                    <h2>5. Donner ou retirer votre consentement</h2>
                    <p>Lors de votre première visite, un bandeau vous propose d’accepter ou de refuser les statistiques de visite. Tant que vous n’avez pas fait de choix, rien n’est enregistré. Votre choix est conservé 6 mois, puis la question vous est posée à nouveau.</p>
                    <p>Vous pouvez modifier votre choix à tout moment : <button type="button" class="lien-cookies" data-cookies-gerer aria-controls="cookies-bandeau">Gérer les cookies</button> (ce bouton figure aussi en bas de chaque page). Si vous retirez votre accord, le cookie <strong>cafpm_visiteur</strong> est immédiatement supprimé de votre navigateur et plus aucune statistique n’est enregistrée.</p>
                    <p>Vous pouvez également bloquer ou supprimer les cookies depuis les réglages de votre navigateur (rubrique « Confidentialité » ou « Cookies »). Le blocage du cookie technique PHPSESSID peut empêcher l’envoi des formulaires et la connexion à l’espace client.</p>

                    <h2>6. Base légale et vos droits</h2>
                    <p>Le cookie de session et le cookie mémorisant votre choix sont indispensables au fonctionnement du site et au respect de votre décision. Les statistiques de visite reposent sur votre consentement, que vous pouvez retirer à tout moment, sans justification.</p>
                    <p>Vous disposez des droits d’accès, de rectification, de suppression et d’opposition prévus par la loi n° 2013-450 (voir notre <a href="<?= e(lien_site('confidentialite.php')) ?>">politique de confidentialité</a>). Les statistiques n’étant rattachées qu’à un identifiant aléatoire, nous ne pouvons les retrouver que si vous nous communiquez cet identifiant ; le plus simple est de retirer votre consentement, ce qui supprime le cookie. Vous pouvez introduire une réclamation auprès de l’Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire (ARTCI) : <a href="https://www.artci.ci" target="_blank" rel="noopener">www.artci.ci</a>.</p>

                    <p class="mise-a-jour">Dernière mise à jour : <span class="a-completer">[À compléter : date de mise à jour]</span></p>
                </div>
            </div>
        </section>
    </main>
<?php require __DIR__ . '/partials/fin-page.php'; ?>
