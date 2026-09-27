<?php
/* ==========================================================================
   BANDEAU DE CONSENTEMENT AUX COOKIES (toutes les pages publiques)
   --------------------------------------------------------------------------
   Inclus par partials/fin-page.php. Caché par défaut (attribut hidden) :
   assets/js/consentement.js l'affiche tant que le visiteur n'a pas fait de
   choix, ou quand il clique sur « Gérer les cookies » (pied de page,
   page cookies.php). Sans JavaScript, aucune statistique n'est collectée :
   le bandeau n'a alors pas lieu d'être.
   Les deux boutons ont volontairement la même apparence : refuser doit être
   aussi simple qu'accepter.
   ========================================================================== */
?>
    <section class="cookies-bandeau" id="cookies-bandeau" role="dialog" aria-modal="false"
             aria-labelledby="cookies-titre" aria-describedby="cookies-texte" tabindex="-1" hidden>
        <div class="cookies-contenu">
            <p class="cookies-titre" id="cookies-titre">Cookies et statistiques de visite</p>
            <p class="cookies-texte" id="cookies-texte">
                Avec votre accord, nous mesurons la fréquentation du site (pages consultées, actions effectuées) afin de l'améliorer.
                Ces statistiques restent chez <?= e(SITE_NOM) ?> : aucune publicité, aucun service tiers, aucune adresse IP enregistrée.
                <a href="<?= e(lien_site('cookies.php')) ?>">En savoir plus</a>
            </p>
            <p class="cookies-etat" id="cookies-etat" hidden></p>
        </div>
        <div class="cookies-actions">
            <button type="button" class="cookies-bouton" data-consentement="non">Refuser</button>
            <button type="button" class="cookies-bouton" data-consentement="oui">Accepter</button>
        </div>
    </section>
