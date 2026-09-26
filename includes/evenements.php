<?php
/* ==========================================================================
   ÉVÉNEMENTS / GALERIE DES ACTIVITÉS DE CAFPM
   --------------------------------------------------------------------------
   A. Fonctions pour les PAGES PUBLIQUES (contrat avec le front) :
      - evenements_a_la_une($limite)          : carrousel de l'accueil
      - evenements_publies($page, $par_page)  : page liste paginée
      - evenement_par_slug($slug)             : page détail (evenement.php?e=...)
      Elles ne lèvent JAMAIS d'exception : base indisponible → [] ou null
      (l'erreur est notée dans le journal du serveur avec error_log).

      Format d'un événement :
        ['id', 'titre', 'slug', 'date_evenement' (AAAA-MM-JJ),
         'date_affichee' (ex. "12 septembre 2025"), 'lieu', 'resume',
         'description', 'medias' (liste ordonnée), 'couverture' (1er média ou null)]
      Format d'un média :
        ['id', 'type' => 'image'|'video'|'youtube',
         'url'       => 'medias/evenements/xxx.jpg' (relative à la racine du
                        site, à passer dans lien_site() ; '' pour YouTube),
         'youtube_id'=> identifiant de 11 caractères ('' sinon),
         'miniature' => image d'aperçu (la photo elle-même, la miniature
                        YouTube, ou '' pour une vidéo fichier),
         'legende']

   B. Outils du BACK-OFFICE (admin/evenements.php, admin/evenement-modifier.php) :
      - generer_slug_evenement() : slug unique à partir du titre
      - extraire_youtube_id()    : lien YouTube → identifiant (ou null)
      - fichiers_envoyes()       : remet à plat un <input type="file" multiple>
      - enregistrer_media_fichier() : contrôle et enregistre une photo / vidéo
      - supprimer_fichier_media(), supprimer_evenement()
      - medias_des_evenements()  : médias de plusieurs événements (1 requête)
      - taille_lisible(), octets_ini() : affichage des limites d'envoi
   Les fichiers sont stockés dans medias/evenements/ (dossier PUBLIC, sans
   exécution de script possible : voir medias/evenements/.htaccess).
   ========================================================================== */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fonctions.php';

/* Types de fichiers acceptés : type réel (finfo) => [type de média, extension] */
const TYPES_MEDIAS_ACCEPTES = [
    'image/jpeg' => ['image', 'jpg'],
    'image/png'  => ['image', 'png'],
    'image/webp' => ['image', 'webp'],
    'video/mp4'  => ['video', 'mp4'],
    'video/webm' => ['video', 'webm'],
];

/* ==========================================================================
   A. FONCTIONS DES PAGES PUBLIQUES
   ========================================================================== */

/**
 * Événements publiés ET à la une (carrousel de l'accueil), plus récents d'abord.
 * Chaque événement contient 'medias' (liste ordonnée) et 'couverture'.
 */
function evenements_a_la_une(int $limite = 8): array
{
    try {
        $requete = db()->prepare(
            'SELECT id, titre, slug, date_evenement, lieu, resume, description
             FROM evenements WHERE publie = 1 AND a_la_une = 1
             ORDER BY date_evenement DESC, id DESC LIMIT ?'
        );
        $requete->bindValue(1, max(1, $limite), PDO::PARAM_INT);
        $requete->execute();
        return completer_evenements($requete->fetchAll());
    } catch (Throwable $erreur) {
        error_log('[CAFPM] Erreur événements à la une : ' . $erreur->getMessage());
        return [];
    }
}

/**
 * Liste paginée des événements publiés (plus récents d'abord).
 * Renvoie ['evenements' => [...], 'total' => int, 'pages' => int, 'page' => int]
 * ('page' est ramenée entre 1 et le nombre de pages).
 */
function evenements_publies(int $page = 1, int $par_page = 9): array
{
    $par_page = max(1, $par_page);
    $vide     = ['evenements' => [], 'total' => 0, 'pages' => 1, 'page' => 1];

    try {
        $total = (int) db()->query('SELECT COUNT(*) FROM evenements WHERE publie = 1')->fetchColumn();
        $pages = max(1, (int) ceil($total / $par_page));
        $page  = min($pages, max(1, $page));

        $requete = db()->prepare(
            'SELECT id, titre, slug, date_evenement, lieu, resume, description
             FROM evenements WHERE publie = 1
             ORDER BY date_evenement DESC, id DESC LIMIT ? OFFSET ?'
        );
        $requete->bindValue(1, $par_page, PDO::PARAM_INT);
        $requete->bindValue(2, ($page - 1) * $par_page, PDO::PARAM_INT);
        $requete->execute();

        return [
            'evenements' => completer_evenements($requete->fetchAll()),
            'total'      => $total,
            'pages'      => $pages,
            'page'       => $page,
        ];
    } catch (Throwable $erreur) {
        error_log('[CAFPM] Erreur liste des événements : ' . $erreur->getMessage());
        return $vide;
    }
}

/**
 * Un événement PUBLIÉ avec tous ses médias, d'après son slug (null si inconnu).
 */
function evenement_par_slug(string $slug): ?array
{
    if ($slug === '' || strlen($slug) > 170) {
        return null;
    }
    try {
        $requete = db()->prepare(
            'SELECT id, titre, slug, date_evenement, lieu, resume, description
             FROM evenements WHERE slug = ? AND publie = 1 LIMIT 1'
        );
        $requete->execute([$slug]);
        $evenement = $requete->fetch();
        return $evenement ? completer_evenements([$evenement])[0] : null;
    } catch (Throwable $erreur) {
        error_log('[CAFPM] Erreur événement par slug : ' . $erreur->getMessage());
        return null;
    }
}

/**
 * Ajoute à chaque événement : date_affichee, medias, couverture.
 * (fonction interne, utilisée par les 3 fonctions ci-dessus)
 */
function completer_evenements(array $evenements): array
{
    $medias = medias_des_evenements(array_column($evenements, 'id'));

    foreach ($evenements as $i => $evenement) {
        $liste = $medias[(int) $evenement['id']] ?? [];
        $evenements[$i] = [
            'id'             => (int) $evenement['id'],
            'titre'          => $evenement['titre'],
            'slug'           => $evenement['slug'],
            'date_evenement' => $evenement['date_evenement'],
            'date_affichee'  => date_longue_fr($evenement['date_evenement']),
            'lieu'           => $evenement['lieu'],
            'resume'         => $evenement['resume'],
            'description'    => (string) $evenement['description'],
            'medias'         => $liste,
            'couverture'     => $liste[0] ?? null,
        ];
    }
    return $evenements;
}

/**
 * Médias de plusieurs événements en une seule requête.
 * Renvoie [evenement_id => [média formaté, ...]] trié par ordre puis id.
 * Lève une PDOException en cas d'erreur (à attraper par l'appelant).
 */
function medias_des_evenements(array $ids): array
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) {
        return [];
    }

    $marqueurs = implode(',', array_fill(0, count($ids), '?'));
    $requete   = db()->prepare(
        "SELECT id, evenement_id, type, fichier, youtube_id, legende, ordre
         FROM evenement_medias WHERE evenement_id IN ($marqueurs)
         ORDER BY evenement_id, ordre, id"
    );
    $requete->execute($ids);

    $resultat = [];
    foreach ($requete->fetchAll() as $media) {
        $resultat[(int) $media['evenement_id']][] = formater_media($media);
    }
    return $resultat;
}

/**
 * Met une ligne de evenement_medias au format du contrat (voir en-tête).
 * La clé 'ordre' est ajoutée en plus (utile au back-office).
 */
function formater_media(array $media): array
{
    $url = $media['type'] === 'youtube' ? '' : URL_MEDIAS_EVENEMENTS . rawurlencode($media['fichier']);

    $miniature = '';
    if ($media['type'] === 'image') {
        $miniature = $url;
    } elseif ($media['type'] === 'youtube') {
        $miniature = 'https://img.youtube.com/vi/' . rawurlencode($media['youtube_id']) . '/hqdefault.jpg';
    }

    return [
        'id'         => (int) $media['id'],
        'type'       => $media['type'],
        'url'        => $url,
        'youtube_id' => $media['type'] === 'youtube' ? $media['youtube_id'] : '',
        'miniature'  => $miniature,
        'legende'    => $media['legende'],
        'ordre'      => (int) $media['ordre'],
    ];
}

/**
 * Date longue en français : "2025-09-12" → "12 septembre 2025" ("1er" pour le 1er du mois).
 */
function date_longue_fr(?string $date): string
{
    $moment = $date ? strtotime($date) : false;
    if (!$moment) {
        return '';
    }
    $mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
             'septembre', 'octobre', 'novembre', 'décembre'];
    $jour = (int) date('j', $moment);
    return ($jour === 1 ? '1er' : $jour) . ' ' . $mois[(int) date('n', $moment) - 1] . ' ' . date('Y', $moment);
}

/* ==========================================================================
   B. OUTILS DU BACK-OFFICE
   ========================================================================== */

/**
 * Slug unique à partir d'un titre : "Journée Portes Ouvertes !" → "journee-portes-ouvertes"
 * (suffixe -2, -3... si le slug existe déjà ; $sauf_id = événement à ignorer).
 */
function generer_slug_evenement(string $titre, int $sauf_id = 0): string
{
    // 1. Minuscules sans accents, uniquement lettres, chiffres et tirets
    $texte = function_exists('transliterator_transliterate')
        ? (string) transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $titre)
        : strtolower((string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $titre));
    $base = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($texte)), '-');
    $base = rtrim(substr($base !== '' ? $base : 'evenement', 0, 160), '-');

    // 2. Unicité : on teste base, base-2, base-3...
    $requete = db()->prepare('SELECT COUNT(*) FROM evenements WHERE slug = ? AND id <> ?');
    $slug    = $base;
    for ($n = 2; ; $n++) {
        $requete->execute([$slug, $sauf_id]);
        if ((int) $requete->fetchColumn() === 0) {
            return $slug;
        }
        $slug = $base . '-' . $n;
    }
}

/**
 * Extrait l'identifiant d'une vidéo YouTube depuis un lien. Formats acceptés :
 *   https://youtu.be/ID, https://www.youtube.com/watch?v=ID,
 *   https://www.youtube.com/shorts/ID, https://www.youtube.com/embed/ID
 *   (ainsi que m.youtube.com, youtube-nocookie.com, ou l'identifiant seul).
 * Renvoie null si le lien n'est pas reconnu ou si l'identifiant est invalide.
 */
function extraire_youtube_id(string $lien): ?string
{
    $lien = trim($lien);
    if (preg_match('/^[A-Za-z0-9_-]{11}$/', $lien)) {
        return $lien; // Identifiant collé directement
    }
    if (!preg_match('#^https?://#i', $lien)) {
        $lien = 'https://' . $lien; // "youtu.be/ID" sans https://
    }

    $hote   = strtolower((string) parse_url($lien, PHP_URL_HOST));
    $chemin = (string) parse_url($lien, PHP_URL_PATH);
    $id     = '';

    if ($hote === 'youtu.be') {
        $id = explode('/', trim($chemin, '/'))[0] ?? '';
    } elseif (in_array($hote, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'], true)) {
        if (preg_match('#^/(?:shorts|embed|live|v)/([^/?]+)#', $chemin, $m)) {
            $id = $m[1];
        } elseif ($chemin === '/watch') {
            parse_str((string) parse_url($lien, PHP_URL_QUERY), $parametres);
            $id = is_string($parametres['v'] ?? null) ? $parametres['v'] : '';
        }
    }

    return preg_match('/^[A-Za-z0-9_-]{11}$/', $id) ? $id : null;
}

/**
 * Remet à plat un champ <input type="file" name="x[]" multiple> :
 * renvoie une liste de fichiers [['name', 'tmp_name', 'error', 'size'], ...]
 * (les emplacements laissés vides sont ignorés).
 */
function fichiers_envoyes(string $nom): array
{
    $champ = $_FILES[$nom] ?? null;
    if (!is_array($champ) || !isset($champ['error'])) {
        return [];
    }

    $liste = [];
    foreach ((array) $champ['error'] as $i => $erreur) {
        if ((int) $erreur === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $liste[] = [
            'name'     => (string) ((array) $champ['name'])[$i],
            'tmp_name' => (string) ((array) $champ['tmp_name'])[$i],
            'error'    => (int) $erreur,
            'size'     => (int) ((array) $champ['size'])[$i],
        ];
    }
    return $liste;
}

/**
 * Crée le dossier public des médias s'il n'existe pas, avec sa protection
 * .htaccess (aucun script exécutable, pas de liste des fichiers).
 */
function preparer_dossier_medias(): bool
{
    if (!is_dir(DOSSIER_MEDIAS_EVENEMENTS) && !mkdir(DOSSIER_MEDIAS_EVENEMENTS, 0755, true)) {
        return false;
    }
    $htaccess = DOSSIER_MEDIAS_EVENEMENTS . '.htaccess';
    if (!is_file($htaccess)) {
        file_put_contents($htaccess,
            "# Médias publics des événements : aucun script exécutable, pas de liste des fichiers\n"
            . "Options -Indexes\n"
            . "<FilesMatch \"\\.(php\\d?|phtml|phar|pl|py|cgi|sh|shtml|asp|aspx|jsp|htaccess)$\">\n"
            . "    Require all denied\n"
            . "</FilesMatch>\n");
    }
    return true;
}

/**
 * Contrôle un fichier envoyé (photo ou vidéo) puis l'enregistre dans
 * medias/evenements/ sous un nom aléatoire.
 * 1. erreur d'envoi (fichier trop gros pour le serveur, envoi interrompu)
 * 2. vrai type du fichier (finfo) parmi TYPES_MEDIAS_ACCEPTES
 * 3. image : lisible par getimagesize() ; taille max selon le type
 * 4. nom aléatoire + extension déduite du vrai type, déplacement du fichier
 * Renvoie ['type' => 'image'|'video', 'fichier' => nom] ou ['erreur' => message].
 */
function enregistrer_media_fichier(array $fichier): array
{
    $nom_affiche = mb_substr(basename($fichier['name']), 0, 80);

    // 1. Erreurs d'envoi
    if (in_array($fichier['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
        return ['erreur' => "« $nom_affiche » dépasse la taille maximale acceptée par le serveur ("
            . taille_lisible(octets_ini('upload_max_filesize')) . ' par fichier).'];
    }
    if ($fichier['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($fichier['tmp_name'])) {
        return ['erreur' => "« $nom_affiche » n'a pas pu être reçu (envoi interrompu). Réessayez."];
    }

    // 2. Vrai type du fichier (et pas son extension)
    $type_reel = (string) (new finfo(FILEINFO_MIME_TYPE))->file($fichier['tmp_name']);
    if (!isset(TYPES_MEDIAS_ACCEPTES[$type_reel])) {
        return ['erreur' => "« $nom_affiche » : format refusé. Photos JPEG, PNG ou WebP ; vidéos MP4 ou WebM."];
    }
    [$type, $extension] = TYPES_MEDIAS_ACCEPTES[$type_reel];

    // 3. Taille maximale et contrôle de l'image
    $taille_max = $type === 'image' ? TAILLE_MAX_IMAGE : TAILLE_MAX_VIDEO;
    if ($fichier['size'] > $taille_max) {
        return ['erreur' => "« $nom_affiche » est trop lourd (" . taille_lisible($fichier['size'])
            . ', maximum ' . taille_lisible($taille_max) . ' pour une ' . ($type === 'image' ? 'photo' : 'vidéo') . ').'];
    }
    // Vidéo : refus si du code PHP est caché dans le fichier (le contrôle du type
    // ne lit que l'en-tête ; défense supplémentaire, le dossier n'exécute rien)
    if ($type === 'video') {
        $debut = (string) file_get_contents($fichier['tmp_name'], false, null, 0, 1024 * 1024);
        if (stripos($debut, '<?php') !== false || str_contains($debut, '<?=')) {
            return ['erreur' => "« $nom_affiche » n'est pas une vidéo valide."];
        }
    }
    if ($type === 'image') {
        $infos = @getimagesize($fichier['tmp_name']);
        if (!$infos || $infos[0] < 1 || $infos[1] < 1) {
            return ['erreur' => "« $nom_affiche » n'est pas une image valide."];
        }
    }

    // 4. Enregistrement sous un nom aléatoire
    if (!preparer_dossier_medias()) {
        return ['erreur' => 'Le dossier des médias est introuvable ou protégé en écriture.'];
    }
    $nom_fichier = date('Ymd_His') . '_' . bin2hex(random_bytes(8)) . '.' . $extension;
    if (!move_uploaded_file($fichier['tmp_name'], DOSSIER_MEDIAS_EVENEMENTS . $nom_fichier)) {
        return ['erreur' => "« $nom_affiche » n'a pas pu être enregistré sur le serveur."];
    }
    @chmod(DOSSIER_MEDIAS_EVENEMENTS . $nom_fichier, 0644);

    return ['type' => $type, 'fichier' => $nom_fichier];
}

/**
 * Supprime un fichier de medias/evenements/ (le nom est vérifié : pas de "../").
 */
function supprimer_fichier_media(string $nom_fichier): void
{
    if ($nom_fichier !== '' && preg_match('/^[A-Za-z0-9_.-]+$/', $nom_fichier) && !str_starts_with($nom_fichier, '.')) {
        $chemin = DOSSIER_MEDIAS_EVENEMENTS . $nom_fichier;
        if (is_file($chemin)) {
            @unlink($chemin);
        }
    }
}

/**
 * Supprime un événement, ses médias (lignes) puis leurs fichiers sur le disque.
 * Renvoie false si l'événement n'existe pas. Lève une PDOException en cas d'erreur.
 */
function supprimer_evenement(int $id): bool
{
    $pdo = db();

    // 1. Fichiers à effacer (lus AVANT de supprimer les lignes)
    $requete = $pdo->prepare("SELECT fichier FROM evenement_medias WHERE evenement_id = ? AND fichier <> ''");
    $requete->execute([$id]);
    $fichiers = $requete->fetchAll(PDO::FETCH_COLUMN);

    // 2. Lignes (dans une transaction : tout ou rien)
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM evenement_medias WHERE evenement_id = ?')->execute([$id]);
        $requete = $pdo->prepare('DELETE FROM evenements WHERE id = ?');
        $requete->execute([$id]);
        $existait = $requete->rowCount() > 0;
        $pdo->commit();
    } catch (PDOException $erreur) {
        $pdo->rollBack();
        throw $erreur;
    }

    // 3. Fichiers (seulement une fois la base à jour)
    foreach ($fichiers as $nom_fichier) {
        supprimer_fichier_media($nom_fichier);
    }
    return $existait;
}

/**
 * Valeur d'une limite php.ini en octets ("64M" → 67108864).
 */
function octets_ini(string $cle): int
{
    $valeur = trim((string) ini_get($cle));
    $nombre = (int) $valeur;
    switch (strtoupper(substr($valeur, -1))) {
        case 'G': $nombre *= 1024;
        // no break
        case 'M': $nombre *= 1024;
        // no break
        case 'K': $nombre *= 1024;
    }
    return $nombre;
}

/**
 * Taille lisible : 8388608 → "8 Mo", 1536 → "2 Ko".
 */
function taille_lisible(int $octets): string
{
    if ($octets >= 1024 * 1024 * 1024) {
        return round($octets / (1024 * 1024 * 1024), 1) . ' Go';
    }
    if ($octets >= 1024 * 1024) {
        return round($octets / (1024 * 1024), 1) . ' Mo';
    }
    return max(1, (int) round($octets / 1024)) . ' Ko';
}
