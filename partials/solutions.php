<?php /* ==========================================================================
   SECTION NOS SOLUTIONS : cartes solutions, barre de recherche, CAFPM Match,
   et les deux blocs "Vous êtes une entreprise / un candidat"
   Chaque carte mène à sa page de détail : solution.php?s=<slug>
   ========================================================================== */ ?>
    <section class="solutions" id="solutions">
        <div class="container">
            <div class="section-head reveal">
                <span class="section-eyebrow">Nos solutions</span>
                <h2>Des solutions adaptées<br>à chaque besoin</h2>
            </div>

            <!-- Cartes solutions (boucle sur $solutions) -->
            <div class="solutions-grid">
                <?php foreach ($solutions as $i => $solution): ?>
                <a href="<?= e(lien_site('solution.php?s=' . $solution['slug'])) ?>" class="solution-card reveal<?= $i ? ' delai-' . min($i, 6) : '' ?>">
                    <div class="sol-icon-wrapper<?= !empty($solution['mise_en_avant']) ? ' sol-icon-vedette' : '' ?>">
                        <?= icone($solution['icone'], 28) ?>
                    </div>
                    <h3><?= e($solution['titre']) ?></h3>
                    <p><?= e($solution['texte']) ?></p>
                    <span class="link-arrow">En savoir plus <span aria-hidden="true">&rarr;</span></span>
                </a>
                <?php endforeach; ?>
            </div>

            <!-- Barre de recherche (envoyée à api/recherche.php) -->
            <div class="search-banner reveal-scale">
                <div class="search-left">
                    <h3>Trouvez le profil qu'il vous faut</h3>
                    <p>Recherchez parmi plus de 1 000 profils qualifiés, en précisant le métier, l'expérience, la disponibilité et la localisation souhaitées.</p>
                    <form class="search-form" action="<?= e(lien_site('api/recherche.php')) ?>" method="post">
                        <div class="search-main-input">
                            <label for="recherche-q" class="sr-only">Métier ou poste recherché</label>
                            <input type="text" id="recherche-q" name="q" placeholder="Métier (ou vide pour tout voir)">
                            <button type="submit" class="btn btn-primary">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                Rechercher
                            </button>
                        </div>
                        <div class="search-filters">
                            <select name="secteur" aria-label="Secteur d'activité">
                                <option value="">Secteur d'activité</option>
                                <?php foreach ($domaines as $domaine): ?>
                                <option><?= e($domaine) ?></option>
                                <?php endforeach; ?>
                            </select>
                            <select name="experience" aria-label="Niveau d'expérience">
                                <option value="">Expérience</option>
                                <?php foreach ($niveaux_experience as $niveau): ?>
                                <option><?= e($niveau) ?></option>
                                <?php endforeach; ?>
                            </select>
                            <select name="disponibilite" aria-label="Disponibilité">
                                <option value="">Disponibilité</option>
                                <?php foreach ($disponibilites as $disponibilite): ?>
                                <option><?= e($disponibilite) ?></option>
                                <?php endforeach; ?>
                            </select>
                            <select name="localisation" aria-label="Localisation">
                                <option value="">Localisation</option>
                                <?php foreach ($localisations as $groupe => $lieux): ?>
                                <optgroup label="<?= e($groupe) ?>">
                                    <?php foreach ($lieux as $lieu): ?>
                                    <option><?= e($lieu) ?></option>
                                    <?php endforeach; ?>
                                </optgroup>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </form>
                </div>
                <div class="match-right">
                    <h4>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        CAFPM MATCH
                    </h4>
                    <p>La bonne personne au bon poste. Notre méthode de rapprochement croise vos critères avec les profils qualifiés de notre vivier pour vous proposer les candidats les plus pertinents.</p>
                    <a href="<?= e(lien_site('cafpm-match.php')) ?>" class="btn btn-blanc">Découvrir CAFPM Match &rarr;</a>
                </div>
            </div>

            <!-- Résultats de la recherche (remplis par main.js avec la réponse de api/recherche.php).
                 Profils ANONYMES : ni nom, ni téléphone, ni CV. -->
            <div class="resultats-recherche" id="resultats-recherche" aria-live="polite" hidden>
                <div class="resultats-entete">
                    <div>
                        <h3 id="resultats-titre">Profils disponibles</h3>
                        <p class="resultats-note">Profils anonymes. Cliquez sur « Demander ce profil » : un conseiller CAFPM vous met en relation sous 24 h.</p>
                    </div>
                    <button type="button" class="btn btn-primary modal-trigger" data-target="drawer-form">Déposer un besoin &rarr;</button>
                </div>
                <div class="resultats-grille" id="resultats-grille"></div>
                <p class="resultats-plus" id="resultats-plus" hidden></p>
            </div>

            <!-- Blocs Entreprise / Candidat -->
            <div class="target-split">
                <div class="target-card reveal-left">
                    <div class="tc-content tc-entreprise">
                        <h3>
                            <?= icone('calendrier') ?>
                            Vous êtes une entreprise&nbsp;?
                        </h3>
                        <p>Trouvez rapidement le personnel qu'il vous faut et bénéficiez d'un accompagnement personnalisé, du premier échange jusqu'au suivi de la mission.</p>
                        <ul class="tc-list">
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg> Profils qualifiés</li>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg> Gestion administrative simplifiée</li>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg> Réactivité et proximité</li>
                        </ul>
                        <button type="button" class="btn btn-blanc modal-trigger" data-target="drawer-form">Déposer un besoin &rarr;</button>
                    </div>
                    <div class="tc-image tc-image-entreprise" aria-hidden="true"></div>
                </div>

                <div class="target-card reveal-right delai-2">
                    <div class="tc-content tc-candidat">
                        <h3>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            Vous êtes un candidat&nbsp;?
                        </h3>
                        <p>Créez votre profil en quelques minutes et soyez contacté pour des missions et des emplois adaptés à vos compétences.</p>
                        <ul class="tc-list">
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-navy)" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg> Offres d'emploi</li>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-navy)" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg> Accompagnement personnalisé</li>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-navy)" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg> Accès à des formations</li>
                        </ul>
                        <button type="button" class="btn btn-blanc modal-trigger" data-target="drawer-candidat">Créer mon profil &rarr;</button>
                    </div>
                    <div class="tc-image tc-image-candidat" aria-hidden="true"></div>
                </div>
            </div>
        </div>
    </section>
