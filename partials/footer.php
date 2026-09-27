<?php
/* ==========================================================================
   PIED DE PAGE : logo, navigation, contact, newsletter, liens légaux
   La newsletter est envoyée à api/newsletter.php (via main.js)
   Les liens "Espace client / Candidat / Entreprise" ouvrent les fenêtres
   de modales.php ; leur href (contact.php) sert de secours sans JavaScript.
   « Gérer les cookies » rouvre le bandeau de consentement (partials/consentement.php).
   ========================================================================== */
$lien_accueil_pied = (($page_active ?? '') === 'accueil') ? '#hero' : lien_site('index.php');
?>
    <footer class="site-footer" id="contact">
        <div class="container">
            <div class="footer-top reveal">
                <div class="footer-brand">
                    <a href="<?= e($lien_accueil_pied) ?>" class="footer-logo" aria-label="<?= e(SITE_NOM) ?> - Retour à l'accueil">
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo-icon" aria-hidden="true">
                            <rect width="40" height="40" fill="var(--color-gold)"/>
                            <path d="M10 28L30 10V22L20 32L10 28Z" fill="white"/>
                        </svg>
                        <span class="footer-logo-texte"><?= e(SITE_NOM) ?> <small><?= e(SITE_FORME) ?></small></span>
                    </a>
                    <p>Votre partenaire en intérim, placement, mise à disposition de personnel et formation professionnelle en Côte d'Ivoire.</p>
                </div>

                <div class="footer-col">
                    <h4>Navigation</h4>
                    <ul>
                        <li><a href="<?= e($lien_accueil_pied) ?>">Accueil</a></li>
                        <li><a href="<?= e(lien_section('apropos')) ?>">À propos</a></li>
                        <li><a href="<?= e(lien_section('solutions')) ?>">Nos solutions</a></li>
                        <li><a href="<?= e(lien_section('secteurs')) ?>">Secteurs</a></li>
                        <li><a href="<?= e(lien_site('actualites.php')) ?>">Actualités</a></li>
                        <li><a href="<?= e(lien_site('contact.php')) ?>">Contact</a></li>
                    </ul>
                </div>

                <div class="footer-col">
                    <h4>Espace</h4>
                    <ul>
                        <li><a href="<?= e(lien_site('contact.php')) ?>" class="modal-trigger" data-target="modal-login">Espace client</a></li>
                        <li><a href="<?= e(lien_site('contact.php?sujet=Candidature')) ?>" class="modal-trigger" data-target="drawer-candidat">Candidat</a></li>
                        <li><a href="<?= e(lien_site('contact.php?sujet=Demande+de+personnel')) ?>" class="modal-trigger" data-target="drawer-form">Entreprise</a></li>
                        <li><a href="<?= e(lien_site('cafpm-match.php')) ?>">CAFPM Match</a></li>
                    </ul>
                </div>

                <div class="footer-col">
                    <h4>Contact</h4>
                    <ul>
                        <li class="footer-contact-item">
                            <?= icone('lieu', 16) ?>
                            <a href="<?= e(LIEN_GOOGLE_MAPS) ?>" target="_blank" rel="noopener"><?= e(SITE_ADRESSE) ?></a>
                        </li>
                        <li class="footer-contact-item">
                            <?= icone('telephone', 16) ?>
                            <a href="tel:<?= e(preg_replace('/[^0-9+]/', '', SITE_TELEPHONE)) ?>"><?= e(SITE_TELEPHONE) ?></a>
                        </li>
                        <li class="footer-contact-item">
                            <?= icone('email', 16) ?>
                            <a href="mailto:<?= e(EMAIL_RECEPTION) ?>"><?= e(EMAIL_RECEPTION) ?></a>
                        </li>
                    </ul>
                </div>

                <div class="footer-newsletter">
                    <h4>Newsletter</h4>
                    <p>Recevez nos actualités, nos offres et les dates de nos prochaines formations.</p>
                    <form class="newsletter-form" action="<?= e(lien_site('api/newsletter.php')) ?>" method="post">
                        <label for="newsletter-email" class="sr-only">Votre adresse email</label>
                        <input type="email" id="newsletter-email" name="email" placeholder="Votre email" autocomplete="email" required>
                        <button type="submit" class="btn btn-primary">S'abonner &rarr;</button>
                    </form>
                    <p class="form-mention form-mention-sombre">Désinscription possible à tout moment. <a href="<?= e(lien_site('confidentialite.php')) ?>">Protection de vos données</a></p>
                </div>
            </div>

            <div class="footer-bottom">
                <!-- L'année se met à jour automatiquement -->
                <div>&copy; <?= date('Y') ?> <?= e(SITE_NOM . ' ' . SITE_FORME) ?> - Tous droits réservés</div>
                <nav class="footer-legal" aria-label="Informations légales">
                    <a href="<?= e(lien_site('mentions-legales.php')) ?>">Mentions légales</a>
                    <a href="<?= e(lien_site('confidentialite.php')) ?>">Politique de confidentialité</a>
                    <a href="<?= e(lien_site('cookies.php')) ?>">Cookies</a>
                    <!-- Rouvre le bandeau de cookies (assets/js/consentement.js) -->
                    <button type="button" class="lien-cookies" data-cookies-gerer aria-controls="cookies-bandeau">Gérer les cookies</button>
                    <a href="<?= e(lien_site('contact.php')) ?>">Contact</a>
                </nav>
            </div>
        </div>
    </footer>
