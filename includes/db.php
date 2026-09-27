<?php
/* ==========================================================================
   CONNEXION À LA BASE DE DONNÉES (PDO) + MISE À JOUR AUTOMATIQUE DES TABLES
   --------------------------------------------------------------------------
   Utilisation dans n'importe quel fichier :
       $pdo = db();
       $pdo->prepare('SELECT ...')->execute([...]);
   La connexion n'est ouverte qu'une seule fois (grâce à "static").

   Mise à jour automatique de la structure (installer_tables) :
   database/cafpm.sql est la SEULE source de vérité. À chaque connexion on
   compare l'empreinte (md5) de ce fichier avec celle mémorisée dans la table
   `version_schema`. Si elles sont identiques : rien à faire (1 requête
   très rapide). Sinon :
     1. on crée les tables manquantes (CREATE TABLE IF NOT EXISTS) ;
     2. on ajoute les colonnes et index manquants (ALTER TABLE ... ADD) ;
     3. on mémorise la nouvelle empreinte.
   Rien n'est jamais supprimé ni renommé automatiquement.
   ========================================================================== */

require_once __DIR__ . '/../config/config.php';

function db(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOTE . ';port=' . DB_PORT . ';dbname=' . DB_NOM . ';charset=utf8mb4';

        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // Lève une erreur en cas de problème SQL
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,       // Résultats sous forme de tableau associatif
            PDO::ATTR_EMULATE_PREPARES   => false,                  // Vraies requêtes préparées (anti-injection SQL)
            PDO::ATTR_TIMEOUT            => 2,                      // Abandon après 2 s si MySQL ne répond pas (le site reste rapide)
        ]);

        // Même heure que PHP (Abidjan = UTC+0) pour les dates "il y a…" et les statistiques
        $pdo->exec("SET time_zone = '+00:00'");

        installer_tables($pdo);
    }

    return $pdo;
}

/**
 * Met la structure de la base à jour d'après database/cafpm.sql.
 * Ne fait rien si le fichier n'a pas changé depuis la dernière fois.
 */
function installer_tables(PDO $pdo): void
{
    $fichier   = __DIR__ . '/../database/cafpm.sql';
    $empreinte = md5_file($fichier);

    // 1. Structure déjà à jour ? (la table n'existe pas encore sur une base neuve)
    try {
        $actuelle = $pdo->query('SELECT empreinte FROM version_schema WHERE id = 1')->fetchColumn();
        if ($actuelle === $empreinte) {
            return;
        }
    } catch (PDOException $erreur) {
        // Table version_schema absente : première installation, on continue
    }

    // 2. Lecture des requêtes CREATE TABLE du fichier
    $tables = lire_tables_sql((string) file_get_contents($fichier));

    foreach ($tables as $table => $infos) {
        // 2a. Crée la table si elle n'existe pas
        $pdo->exec($infos['requete']);

        // 2b. Colonnes et index déjà présents dans la base
        $colonnes_existantes = $pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_COLUMN);
        $index_existants     = array_unique($pdo->query("SHOW INDEX FROM `$table`")->fetchAll(PDO::FETCH_COLUMN, 2));

        // 2c. Ajoute les colonnes manquantes
        foreach ($infos['colonnes'] as $colonne => $definition) {
            if (!in_array($colonne, $colonnes_existantes, true)) {
                executer_alter($pdo, "ALTER TABLE `$table` ADD COLUMN $definition");
            }
        }

        // 2d. Ajoute les index manquants
        foreach ($infos['index'] as $nom_index => $definition) {
            if (!in_array($nom_index, $index_existants, true)) {
                executer_alter($pdo, "ALTER TABLE `$table` ADD $definition");
            }
        }
    }

    // 3. Mémorise l'empreinte : on ne refera ce travail qu'au prochain changement du fichier
    $requete = $pdo->prepare(
        'INSERT INTO version_schema (id, empreinte) VALUES (1, ?)
         ON DUPLICATE KEY UPDATE empreinte = VALUES(empreinte), mis_a_jour = NOW()'
    );
    $requete->execute([$empreinte]);
}

/**
 * Découpe le fichier SQL et renvoie, pour chaque table :
 *   - 'requete'  : la requête CREATE TABLE complète
 *   - 'colonnes' : [nom_colonne => "nom_colonne TYPE ..."]
 *   - 'index'    : [nom_index   => "INDEX nom_index (...)"]
 * Convention (voir en-tête de cafpm.sql) : une colonne / un index par ligne.
 */
function lire_tables_sql(string $sql): array
{
    $sql    = preg_replace('/--.*$/m', '', $sql); // Retire les commentaires SQL
    $tables = [];

    foreach (explode(';', $sql) as $requete) {
        $requete = trim($requete);

        if (!preg_match('/^CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(/i', $requete, $m)) {
            continue; // Ignore CREATE DATABASE, USE, etc.
        }

        $infos = ['requete' => $requete, 'colonnes' => [], 'index' => []];

        foreach (preg_split('/\R/', $requete) as $ligne) {
            $ligne = rtrim(trim($ligne), ',');

            // Index nommé : "INDEX nom (...)", "KEY nom (...)" ou "UNIQUE KEY nom (...)"
            if (preg_match('/^(?:UNIQUE\s+)?(?:INDEX|KEY)\s+`?(\w+)`?\s*\(/i', $ligne, $i)) {
                $infos['index'][$i[1]] = $ligne;
                continue;
            }

            // Colonne : "nom TYPE ..." (on ignore la 1re ligne, PRIMARY KEY, FOREIGN KEY...)
            if (preg_match('/^`?(\w+)`?\s+[A-Z]+/i', $ligne, $c)
                && !preg_match('/^(CREATE|PRIMARY|FOREIGN|CONSTRAINT|UNIQUE|INDEX|KEY)\b/i', $ligne)
                && $ligne[0] !== ')') {
                $infos['colonnes'][$c[1]] = $ligne;
            }
        }

        $tables[$m[1]] = $infos;
    }

    return $tables;
}

/**
 * Exécute un ALTER TABLE en ignorant l'erreur "existe déjà"
 * (cas où deux visiteurs déclenchent la mise à jour au même moment).
 */
function executer_alter(PDO $pdo, string $requete): void
{
    try {
        $pdo->exec($requete);
    } catch (PDOException $erreur) {
        $code = $erreur->errorInfo[1] ?? 0;
        if (!in_array($code, [1060, 1061], true)) { // 1060 = colonne en double, 1061 = index en double
            throw $erreur;
        }
    }
}
