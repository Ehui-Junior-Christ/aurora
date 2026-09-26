<?php
/* ==========================================================================
   FIN DE PAGE COMMUNE : pied de page, fenêtres (connexion, tiroirs),
   script principal et fermeture du HTML.
   À inclure en dernier sur chaque page publique :
       require __DIR__ . '/partials/fin-page.php';
   ========================================================================== */
require __DIR__ . '/footer.php';   // Pied de page + newsletter + liens légaux
require __DIR__ . '/modales.php';  // Connexion, tiroirs entreprise/candidat, notifications
?>

    <script src="<?= e(lien_site('main.js')) ?>"></script>
    <!-- Événements : carrousel, visionneuse photo, vidéos YouTube (sans effet sur les autres pages) -->
    <script src="<?= e(lien_site('assets/js/evenements.js')) ?>" defer></script>
</body>
</html>
