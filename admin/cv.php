<?php
/* ==========================================================================
   BACK-OFFICE : TÉLÉCHARGEMENT D'UN CV (admin/cv.php?id=12)
   --------------------------------------------------------------------------
   Les CV sont rangés dans uploads/cv/, dossier fermé au navigateur.
   Seul ce script, après vérification de la connexion admin, peut les lire :
   1. Vérifie que l'administrateur est connecté
   2. Cherche le candidat et le nom de son fichier en base
   3. Vérifie que le fichier existe bien DANS uploads/cv/ (pas ailleurs)
   4. Envoie le PDF au navigateur en téléchargement
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-admin.php';

// 1. Administrateur connecté obligatoire
exiger_admin();

// 2. Recherche du candidat
$id = entier($_GET, 'id');
try {
    $requete = db()->prepare('SELECT nom, fichier_cv FROM candidats WHERE id = ? LIMIT 1');
    $requete->execute([$id]);
    $candidat = $requete->fetch();
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur téléchargement CV : ' . $erreur->getMessage());
    $candidat = false;
}

// 3. Contrôles : nom de fichier attendu (généré par api/candidat.php) et chemin réel dans uploads/cv/
$dossier = realpath(DOSSIER_CV);
$chemin  = ($candidat && preg_match('/^[\w-]+\.pdf$/', $candidat['fichier_cv']))
    ? realpath(DOSSIER_CV . $candidat['fichier_cv'])
    : false;

if (!$dossier || !$chemin || !str_starts_with($chemin, $dossier . DIRECTORY_SEPARATOR) || !is_file($chemin)) {
    http_response_code(404);
    exit('CV introuvable.');
}

// 4. Envoi du fichier : nom lisible (ex. "CV_Kouame_Jean.pdf"), jamais affiché dans le navigateur
$accents    = ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
               'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ÿ' => 'y',
               'À' => 'A', 'Â' => 'A', 'Ç' => 'C', 'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Î' => 'I', 'Ô' => 'O', 'Û' => 'U'];
$nom_simple = strtr($candidat['nom'], $accents);                                  // "Kouamé" → "Kouame"
$nom_simple = trim(preg_replace('/[^A-Za-z0-9]+/', '_', $nom_simple), '_');      // Espaces et symboles → "_"
$nom_telechargement = 'CV_' . ($nom_simple !== '' ? $nom_simple : 'candidat') . '.pdf';

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $nom_telechargement . '"');
header('Content-Length: ' . filesize($chemin));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
readfile($chemin);
exit;
