<?php
/* ==========================================================================
   FIN DE PAGE COMMUNE : pied de page, fenêtres (connexion, tiroirs),
   bandeau de cookies, scripts et fermeture du HTML.
   À inclure en dernier sur chaque page publique :
       require __DIR__ . '/partials/fin-page.php';
   ========================================================================== */
require __DIR__ . '/footer.php';        // Pied de page + newsletter + liens légaux
require __DIR__ . '/modales.php';       // Connexion, tiroirs entreprise/candidat, notifications
require __DIR__ . '/consentement.php';  // Bandeau de consentement aux cookies
?>

    <script src="<?= e(lien_site('main.js')) ?>"></script>
    <!-- Événements : carrousel, visionneuse photo, vidéos YouTube (sans effet sur les autres pages) -->
    <script src="<?= e(lien_site('assets/js/evenements.js')) ?>" defer></script>
    <!-- Bandeau de cookies + statistiques de visite (uniquement avec l'accord du visiteur) -->
    <script src="<?= e(lien_site('assets/js/consentement.js')) ?>" defer data-api="<?= e(lien_site('api/statistiques.php')) ?>"></script>
</body>
</html>
