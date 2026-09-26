<?php
/* ==========================================================================
   SÉLECTEUR « ACTUALITÉS | ÉVÉNEMENTS »
   --------------------------------------------------------------------------
   Affiché en haut de actualites.php et de evenements.php pour passer d'une
   liste à l'autre. Définir $onglet_actif ('actualites' ou 'evenements')
   avant d'inclure ce fichier. Ce sont de simples liens (deux pages
   distinctes) : l'onglet de la page affichée porte aria-current="page".
   ========================================================================== */

$onglets = [
    'actualites' => ['Actualités', 'actualites.php'],
    'evenements' => ['Événements', 'evenements.php'],
];
?>
                <nav class="onglets-pages" aria-label="Actualités ou événements">
                    <?php foreach ($onglets as $cle => [$libelle, $lien]): ?>
                    <a href="<?= e(lien_site($lien)) ?>" class="onglet-page"<?= ($onglet_actif ?? '') === $cle ? ' aria-current="page"' : '' ?>><?= e($libelle) ?></a>
                    <?php endforeach; ?>
                </nav>
