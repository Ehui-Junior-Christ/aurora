<?php
/* ==========================================================================
   BACK-OFFICE : CRÉER / MODIFIER UN ÉVÉNEMENT (et gérer ses médias)
   --------------------------------------------------------------------------
   evenement-modifier.php        → nouvel événement
   evenement-modifier.php?id=12  → modification de l'événement n°12
   1. Chargement de l'événement demandé (id inconnu → retour à la liste)
   2. Actions (POST + CSRF), puis redirection (POST → redirection → GET) :
      2a. envoi trop lourd pour le serveur (post_max_size dépassé : PHP vide
          alors $_POST et $_FILES, jeton CSRF compris) → message clair
      2b. "enregistrer"     : infos de l'événement + ajout de médias
                              (photos / vidéos multiples + lien YouTube)
      2c. "medias_maj"      : légendes et ordre des médias existants
      2d. "media_supprimer" : suppression d'un média (ligne + fichier)
   3. Affichage : formulaire, puis médias existants (aperçu, légende, ordre)
   Contrôle des fichiers et liens YouTube : includes/evenements.php
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-admin.php';
require_once __DIR__ . '/../includes/layout-admin.php';
require_once __DIR__ . '/../includes/evenements.php';

$admin = exiger_admin();

// 1. Événement demandé (0 = création)
$id        = max(0, (int) ($_GET['id'] ?? 0));
$evenement = null;
$medias    = [];

try {
    if ($id > 0) {
        $requete = db()->prepare('SELECT * FROM evenements WHERE id = ? LIMIT 1');
        $requete->execute([$id]);
        $evenement = $requete->fetch() ?: null;
        if (!$evenement) {
            flash('erreur', 'Événement introuvable.');
            rediriger('evenements.php');
        }
    }
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur chargement événement : ' . $erreur->getMessage());
    flash('erreur', "Impossible de charger l'événement.");
    rediriger('evenements.php');
}

$retour = $id > 0 ? 'evenement-modifier.php?id=' . $id : 'evenement-modifier.php';

// 2. Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // 2a. Envoi plus lourd que post_max_size : PHP a tout ignoré (champs ET fichiers)
    $taille_envoi = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if (!$_POST && !$_FILES && $taille_envoi > 0) {
        flash('erreur', 'Envoi trop lourd (' . taille_lisible($taille_envoi) . ') : le serveur accepte au maximum '
            . taille_lisible(octets_ini('post_max_size')) . ' par envoi et '
            . taille_lisible(octets_ini('upload_max_filesize')) . ' par fichier. Rien n\'a été enregistré : '
            . 'envoyez les fichiers en plusieurs fois.');
        rediriger($retour);
    }

    if (!csrf_valide()) {
        flash('erreur', 'Session expirée. Veuillez réessayer.');
        rediriger($retour);
    }

    $action = champ('action', 20);

    try {
        // 2b. Enregistrement des informations + ajout de médias
        if ($action === 'enregistrer') {
            $saisie = [
                'titre'          => champ('titre', 150),
                'date_evenement' => champ('date_evenement', 10),
                'lieu'           => champ('lieu', 150),
                'resume'         => champ('resume', 300),
                'description'    => champ('description', 20000),
                'publie'         => isset($_POST['publie']) ? 1 : 0,
                'a_la_une'       => isset($_POST['a_la_une']) ? 1 : 0,
            ];
            $date_ok = DateTime::createFromFormat('!Y-m-d', $saisie['date_evenement']);

            if ($saisie['titre'] === '' || !$date_ok || $date_ok->format('Y-m-d') !== $saisie['date_evenement']) {
                // Saisie conservée pour réafficher le formulaire rempli (les fichiers, eux, sont à renvoyer)
                $_SESSION['evenement_saisie'] = $saisie;
                flash('erreur', 'Indiquez au moins un titre et une date valide. Les fichiers éventuels sont à sélectionner de nouveau.');
                rediriger($retour);
            }

            $pdo = db();
            if ($evenement) {
                $pdo->prepare(
                    'UPDATE evenements SET titre = ?, date_evenement = ?, lieu = ?, resume = ?, description = ?, publie = ?, a_la_une = ?
                     WHERE id = ?'
                )->execute([$saisie['titre'], $saisie['date_evenement'], $saisie['lieu'], $saisie['resume'],
                            $saisie['description'], $saisie['publie'], $saisie['a_la_une'], $id]);
            } else {
                $pdo->prepare(
                    'INSERT INTO evenements (titre, slug, date_evenement, lieu, resume, description, publie, a_la_une)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([$saisie['titre'], generer_slug_evenement($saisie['titre']), $saisie['date_evenement'],
                            $saisie['lieu'], $saisie['resume'], $saisie['description'], $saisie['publie'], $saisie['a_la_une']]);
                $id     = (int) $pdo->lastInsertId();
                $retour = 'evenement-modifier.php?id=' . $id;
            }

            // Médias ajoutés : ordre à la suite des médias existants
            $requete = $pdo->prepare('SELECT COALESCE(MAX(ordre), 0) FROM evenement_medias WHERE evenement_id = ?');
            $requete->execute([$id]);
            $ordre   = (int) $requete->fetchColumn();
            $legende = champ('legende_defaut', 300);
            $ajout   = $pdo->prepare(
                'INSERT INTO evenement_medias (evenement_id, type, fichier, youtube_id, legende, ordre) VALUES (?, ?, ?, ?, ?, ?)'
            );
            $nb_ajoutes = 0;

            // Photos et vidéos (plusieurs fichiers possibles)
            $fichiers = fichiers_envoyes('medias');
            if (count($fichiers) >= (int) ini_get('max_file_uploads')) {
                flash('info', 'Le serveur accepte ' . (int) ini_get('max_file_uploads') . ' fichiers par envoi : les fichiers suivants ont pu être ignorés.');
            }
            foreach ($fichiers as $fichier) {
                $resultat = enregistrer_media_fichier($fichier);
                if (isset($resultat['erreur'])) {
                    flash('erreur', $resultat['erreur']);
                    continue;
                }
                try {
                    $ajout->execute([$id, $resultat['type'], $resultat['fichier'], '', $legende, ++$ordre]);
                    $nb_ajoutes++;
                } catch (PDOException $erreur) {
                    supprimer_fichier_media($resultat['fichier']); // Pas de fichier orphelin
                    throw $erreur;
                }
            }

            // Lien YouTube
            $lien_youtube = champ('youtube', 300);
            if ($lien_youtube !== '') {
                $youtube_id = extraire_youtube_id($lien_youtube);
                if ($youtube_id === null) {
                    flash('erreur', 'Lien YouTube non reconnu. Exemples acceptés : https://youtu.be/XXXXXXXXXXX ou https://www.youtube.com/watch?v=XXXXXXXXXXX');
                } else {
                    $ajout->execute([$id, 'youtube', '', $youtube_id, $legende, ++$ordre]);
                    $nb_ajoutes++;
                }
            }

            flash('succes', ($evenement ? 'Événement enregistré.' : 'Événement créé.')
                . ($nb_ajoutes ? ' ' . $nb_ajoutes . ' média(s) ajouté(s).' : ''));
        }

        // 2c. Légendes et ordre des médias existants
        if ($action === 'medias_maj' && $evenement) {
            $legendes = is_array($_POST['legendes'] ?? null) ? $_POST['legendes'] : [];
            $ordres   = is_array($_POST['ordres'] ?? null) ? $_POST['ordres'] : [];
            $maj      = db()->prepare('UPDATE evenement_medias SET legende = ?, ordre = ? WHERE id = ? AND evenement_id = ?');

            foreach ($legendes as $media_id => $legende) {
                $legende = is_string($legende) ? mb_substr(trim($legende), 0, 300) : '';
                $ordre   = max(-9999, min(9999, (int) ($ordres[$media_id] ?? 0)));
                $maj->execute([$legende, $ordre, (int) $media_id, $id]);
            }
            flash('succes', 'Légendes et ordre des médias enregistrés.');
        }

        // 2d. Suppression d'un média (vérifie qu'il appartient bien à cet événement)
        if ($action === 'media_supprimer' && $evenement) {
            $media_id = (int) ($_POST['media_id'] ?? 0);
            $requete  = db()->prepare('SELECT fichier FROM evenement_medias WHERE id = ? AND evenement_id = ?');
            $requete->execute([$media_id, $id]);
            $fichier = $requete->fetchColumn();

            if ($fichier === false) {
                flash('erreur', 'Média introuvable.');
            } else {
                db()->prepare('DELETE FROM evenement_medias WHERE id = ? AND evenement_id = ?')->execute([$media_id, $id]);
                supprimer_fichier_media((string) $fichier);
                flash('succes', 'Média supprimé.');
            }
        }
    } catch (PDOException $erreur) {
        error_log('[CAFPM] Erreur enregistrement événement : ' . $erreur->getMessage());
        flash('erreur', 'Une erreur est survenue.');
    }
    rediriger($retour);
}

// 3. Données du formulaire : saisie refusée (une seule fois), sinon l'événement, sinon valeurs par défaut
$valeurs = $_SESSION['evenement_saisie'] ?? $evenement ?? [
    'titre' => '', 'date_evenement' => date('Y-m-d'), 'lieu' => '', 'resume' => '',
    'description' => '', 'publie' => 1, 'a_la_une' => 1,
];
unset($_SESSION['evenement_saisie']);

if ($evenement) {
    try {
        $medias = medias_des_evenements([$id])[$id] ?? [];
    } catch (PDOException $erreur) {
        error_log('[CAFPM] Erreur médias événement : ' . $erreur->getMessage());
        flash('erreur', 'Impossible de charger les médias.');
    }
}

admin_entete($evenement ? "Modifier l'événement" : 'Nouvel événement', 'evenements', $admin);
?>
        <p class="admin-intro">
            <a href="evenements.php">&larr; Tous les événements</a>
            <?php if ($evenement && $evenement['publie']): ?>
                &middot; <a href="../evenement.php?e=<?= e(rawurlencode($evenement['slug'])) ?>" target="_blank" rel="noopener">Voir sur le site</a>
            <?php endif; ?>
        </p>

        <!-- Informations + ajout de médias (un seul formulaire, envoi de fichiers) -->
        <section class="admin-carte">
            <h2>Informations</h2>
            <form method="post" action="<?= e($retour) ?>" enctype="multipart/form-data" class="espace-form evt-form">
                <?= champ_csrf() ?>
                <input type="hidden" name="action" value="enregistrer">

                <div class="input-group evt-pleine">
                    <label for="titre">Titre</label>
                    <input type="text" id="titre" name="titre" required maxlength="150" value="<?= e($valeurs['titre']) ?>">
                </div>
                <div class="input-group">
                    <label for="date_evenement">Date</label>
                    <input type="date" id="date_evenement" name="date_evenement" required value="<?= e($valeurs['date_evenement']) ?>">
                </div>
                <div class="input-group">
                    <label for="lieu">Lieu</label>
                    <input type="text" id="lieu" name="lieu" maxlength="150" value="<?= e($valeurs['lieu']) ?>" placeholder="Ex. Abidjan, Cocody">
                </div>
                <div class="input-group evt-pleine">
                    <label for="resume">Résumé (texte court affiché dans le carrousel, 300 caractères max.)</label>
                    <textarea id="resume" name="resume" rows="2" maxlength="300"><?= e($valeurs['resume']) ?></textarea>
                </div>
                <div class="input-group evt-pleine">
                    <label for="description">Description complète</label>
                    <textarea id="description" name="description" rows="7" maxlength="20000"><?= e((string) $valeurs['description']) ?></textarea>
                </div>
                <div class="input-group evt-pleine evt-cases">
                    <label class="evt-case"><input type="checkbox" name="publie" value="1"<?= $valeurs['publie'] ? ' checked' : '' ?>> Publié (visible sur le site)</label>
                    <label class="evt-case"><input type="checkbox" name="a_la_une" value="1"<?= $valeurs['a_la_une'] ? ' checked' : '' ?>> À la une (carrousel de l'accueil)</label>
                </div>

                <fieldset class="evt-pleine evt-ajout">
                    <legend>Ajouter des médias</legend>
                    <div class="input-group">
                        <label for="medias">Photos et vidéos (plusieurs fichiers possibles)</label>
                        <input type="file" id="medias" name="medias[]" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">
                        <p class="texte-doux">
                            Photos JPEG, PNG ou WebP : <?= e(taille_lisible(TAILLE_MAX_IMAGE)) ?> max. &middot;
                            Vidéos MP4 ou WebM : <?= e(taille_lisible(TAILLE_MAX_VIDEO)) ?> max.<br>
                            Limites du serveur : <?= e(taille_lisible(octets_ini('upload_max_filesize'))) ?> par fichier,
                            <?= e(taille_lisible(octets_ini('post_max_size'))) ?> par envoi,
                            <?= (int) ini_get('max_file_uploads') ?> fichiers par envoi.
                        </p>
                    </div>
                    <div class="input-group">
                        <label for="youtube">Lien d'une vidéo YouTube (facultatif)</label>
                        <input type="url" id="youtube" name="youtube" maxlength="300" placeholder="https://youtu.be/...">
                    </div>
                    <div class="input-group">
                        <label for="legende_defaut">Légende des médias ajoutés (facultatif, modifiable ensuite)</label>
                        <input type="text" id="legende_defaut" name="legende_defaut" maxlength="300">
                    </div>
                </fieldset>

                <div class="evt-pleine">
                    <button type="submit" class="btn btn-primary"><?= $evenement ? 'Enregistrer' : "Créer l'événement" ?></button>
                </div>
            </form>
        </section>

        <?php if ($evenement): ?>
        <!-- Médias existants : légendes et ordre dans le formulaire "form-medias"
             (les champs y sont rattachés par l'attribut form=, car chaque carte
             contient aussi son propre petit formulaire de suppression) -->
        <section class="admin-carte">
            <h2>Médias (<?= count($medias) ?>)</h2>
            <?php if (!$medias): ?>
                <p class="texte-doux">Aucun média pour le moment : ajoutez des photos, vidéos ou un lien YouTube ci-dessus.</p>
            <?php else: ?>
                <p class="texte-doux">Ordre d'affichage : du plus petit numéro au plus grand. Le premier média sert de couverture.</p>
                <form id="form-medias" method="post" action="<?= e($retour) ?>">
                    <?= champ_csrf() ?>
                    <input type="hidden" name="action" value="medias_maj">
                </form>

                <ul class="evt-medias">
                    <?php foreach ($medias as $m): ?>
                    <li class="evt-media">
                        <div class="evt-apercu">
                            <?php if ($m['type'] === 'image'): ?>
                                <img src="../<?= e($m['url']) ?>" alt="<?= e($m['legende']) ?>" loading="lazy">
                            <?php elseif ($m['type'] === 'video'): ?>
                                <video controls preload="metadata" src="../<?= e($m['url']) ?>"></video>
                            <?php else: ?>
                                <a href="https://www.youtube.com/watch?v=<?= e($m['youtube_id']) ?>" target="_blank" rel="noopener" title="Ouvrir sur YouTube">
                                    <img src="<?= e($m['miniature']) ?>" alt="Miniature YouTube" loading="lazy">
                                </a>
                            <?php endif; ?>
                            <span class="evt-type"><?= e(['image' => 'Photo', 'video' => 'Vidéo', 'youtube' => 'YouTube'][$m['type']] ?? $m['type']) ?></span>
                        </div>
                        <div class="espace-form evt-media-champs">
                            <label for="legende-<?= $m['id'] ?>">Légende</label>
                            <textarea id="legende-<?= $m['id'] ?>" name="legendes[<?= $m['id'] ?>]" rows="2" maxlength="300" form="form-medias"><?= e($m['legende']) ?></textarea>
                            <div class="evt-media-bas">
                                <label for="ordre-<?= $m['id'] ?>">Ordre</label>
                                <input type="number" id="ordre-<?= $m['id'] ?>" name="ordres[<?= $m['id'] ?>]" value="<?= $m['ordre'] ?>" min="-9999" max="9999" form="form-medias">
                                <form method="post" action="<?= e($retour) ?>" data-confirm="Supprimer ce média ?">
                                    <?= champ_csrf() ?>
                                    <input type="hidden" name="action" value="media_supprimer">
                                    <input type="hidden" name="media_id" value="<?= $m['id'] ?>">
                                    <button type="submit" class="btn btn-danger btn-petit">Supprimer</button>
                                </form>
                            </div>
                        </div>
                    </li>
                    <?php endforeach; ?>
                </ul>
                <button type="submit" form="form-medias" class="btn btn-primary">Enregistrer légendes et ordre</button>
            <?php endif; ?>
        </section>
        <?php endif; ?>
<?php
admin_pied();
