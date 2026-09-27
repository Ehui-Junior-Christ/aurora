<?php
/* ==========================================================================
   MENTIONS LÉGALES
   --------------------------------------------------------------------------
   Les informations entre crochets "[À compléter : ...]" (classe .a-completer)
   doivent être renseignées par CAFPM avant la mise en ligne : elles ne
   peuvent pas être devinées (RCCM, capital, hébergeur...).
   ========================================================================== */

require_once __DIR__ . '/partials/amorce.php';

$titre_page       = 'Mentions légales';
$description_page = "Mentions légales du site de CAFPM SARL : éditeur, hébergement, propriété intellectuelle et responsabilité.";
$page_active      = 'legal';

$bandeau = [
    'fil'   => [['Accueil', 'index.php'], ['Mentions légales', null]],
    'titre' => 'Mentions légales',
    'texte' => 'Informations relatives à l’éditeur du site et aux conditions d’utilisation.',
];

$telephone_lien = preg_replace('/[^0-9+]/', '', SITE_TELEPHONE);

require __DIR__ . '/partials/header.php';
?>
    <main id="contenu">
        <?php require __DIR__ . '/partials/bandeau-page.php'; ?>

        <section class="page-section">
            <div class="container">
                <div class="prose prose-legale">
                    <h2>1. Éditeur du site</h2>
                    <p>Le présent site est édité par :</p>
                    <ul class="liste-infos">
                        <li><strong>Raison sociale :</strong> <?= e(SITE_NOM) ?></li>
                        <li><strong>Forme juridique :</strong> Société à responsabilité limitée (<?= e(SITE_FORME) ?>)</li>
                        <li><strong>Capital social :</strong> <span class="a-completer">[À compléter : montant du capital social en FCFA]</span></li>
                        <li><strong>Siège social :</strong> <?= e(SITE_ADRESSE) ?>, Côte d'Ivoire <span class="a-completer">[À compléter : adresse postale complète / boîte postale]</span></li>
                        <li><strong>RCCM :</strong> <span class="a-completer">[À compléter : numéro RCCM]</span></li>
                        <li><strong>Numéro de compte contribuable (NCC) :</strong> <span class="a-completer">[À compléter : numéro de compte contribuable]</span></li>
                        <li><strong>Agrément / autorisation d'exercer :</strong> <span class="a-completer">[À compléter : référence de l'agrément d'entreprise de travail temporaire ou de placement, le cas échéant]</span></li>
                        <li><strong>Téléphone :</strong> <a href="tel:<?= e($telephone_lien) ?>"><?= e(SITE_TELEPHONE) ?></a></li>
                        <li><strong>Email :</strong> <a href="mailto:<?= e(EMAIL_RECEPTION) ?>"><?= e(EMAIL_RECEPTION) ?></a></li>
                    </ul>

                    <h2>2. Directeur de la publication</h2>
                    <p><span class="a-completer">[À compléter : nom et fonction du directeur de la publication]</span></p>

                    <h2>3. Hébergement</h2>
                    <p>Le site est hébergé par :</p>
                    <ul class="liste-infos">
                        <li><strong>Hébergeur :</strong> <span class="a-completer">[À compléter : nom de l'hébergeur]</span></li>
                        <li><strong>Adresse :</strong> <span class="a-completer">[À compléter : adresse de l'hébergeur]</span></li>
                        <li><strong>Contact :</strong> <span class="a-completer">[À compléter : téléphone ou site web de l'hébergeur]</span></li>
                    </ul>

                    <h2>4. Propriété intellectuelle</h2>
                    <p>L'ensemble des éléments du site (textes, logo, visuels, mise en page, code) est la propriété de <?= e(SITE_NOM . ' ' . SITE_FORME) ?> ou de ses partenaires, et est protégé par la législation applicable en matière de propriété intellectuelle. Toute reproduction, représentation ou adaptation, totale ou partielle, sans autorisation écrite préalable de <?= e(SITE_NOM) ?> est interdite.</p>

                    <h2>5. Responsabilité</h2>
                    <p><?= e(SITE_NOM) ?> s'efforce de fournir des informations exactes et à jour. Toutefois, les informations présentées sur ce site (offres, descriptions de services, actualités) sont données à titre indicatif et peuvent être modifiées à tout moment. <?= e(SITE_NOM) ?> ne saurait être tenue responsable d'une erreur, d'une omission ou d'une indisponibilité temporaire du site.</p>
                    <p>Les liens vers des sites externes (par exemple Google Maps) sont fournis pour faciliter la navigation. <?= e(SITE_NOM) ?> n'exerce aucun contrôle sur leur contenu et décline toute responsabilité à leur égard.</p>

                    <h2>6. Données personnelles et cookies</h2>
                    <p>Les données collectées via les formulaires du site (demandes de personnel, candidatures, contact, newsletter) sont traitées conformément à la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel. Pour tout savoir sur leur utilisation et sur vos droits, consultez notre <a href="<?= e(lien_site('confidentialite.php')) ?>">politique de confidentialité</a>.</p>
                    <p>Le site utilise un cookie technique de session, nécessaire à la sécurité des formulaires et au fonctionnement de l'espace client, ainsi que, avec votre accord uniquement, un cookie de mesure d'audience servant à des statistiques de visite hébergées sur le site. Aucun cookie publicitaire n'est déposé. Le détail figure dans notre <a href="<?= e(lien_site('cookies.php')) ?>">politique de cookies</a>.</p>

                    <h2>7. Droit applicable</h2>
                    <p>Les présentes mentions légales sont régies par le droit ivoirien. En cas de litige, et à défaut de solution amiable, les juridictions d'Abidjan seront seules compétentes.</p>

                    <p class="mise-a-jour">Dernière mise à jour : <span class="a-completer">[À compléter : date de mise à jour]</span></p>
                </div>
            </div>
        </section>
    </main>
<?php require __DIR__ . '/partials/fin-page.php'; ?>
