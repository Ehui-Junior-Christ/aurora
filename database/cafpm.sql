-- ==========================================================================
-- BASE DE DONNÉES CAFPM (source de vérité de la structure)
-- --------------------------------------------------------------------------
-- INSTALLATION AUTOMATIQUE : inutile d'exécuter ce fichier à la main.
-- Au premier chargement du site, includes/db.php lit ce fichier et :
--   1. crée chaque table manquante (CREATE TABLE IF NOT EXISTS) ;
--   2. ajoute les colonnes et index manquants aux tables existantes.
-- Dès que ce fichier est modifié, la mise à jour est rejouée une seule fois
-- (une "empreinte" du fichier est mémorisée dans la table version_schema).
--
-- RÈGLES POUR MODIFIER CE FICHIER (sinon la mise à jour auto ne suit pas) :
--   - une colonne par ligne, terminée par une virgule (sauf la dernière) ;
--   - index nommés : "INDEX nom_index (colonne)" ou "UNIQUE KEY nom (col)" ;
--   - pour AJOUTER une colonne : ajoutez simplement une ligne, elle sera
--     créée automatiquement (renommer / supprimer = à faire à la main).
--
-- Installation manuelle possible avec MySQL Workbench :
--   File > Open SQL Script... > ce fichier > éclair (Execute).
-- ==========================================================================

CREATE DATABASE IF NOT EXISTS cafpm_work_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cafpm_work_db;

-- --------------------------------------------------------------------------
-- Table des demandes de personnel (formulaire "Déposer un besoin")
-- client_id = compte client qui a fait la demande (NULL = visiteur anonyme)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demandes (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_id      INT UNSIGNED NULL,
    entreprise     VARCHAR(150) NOT NULL,
    contact        VARCHAR(150) NOT NULL,
    secteur        VARCHAR(100) NOT NULL,
    profil         VARCHAR(150) NOT NULL,
    nombre_postes  INT UNSIGNED NOT NULL DEFAULT 1,
    message        TEXT NULL,
    statut         ENUM('nouvelle', 'en_cours', 'traitee') NOT NULL DEFAULT 'nouvelle',
    cree_le        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_client (client_id),
    INDEX idx_statut (statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Table des candidats (formulaire "Créer mon profil")
-- fichier_cv = nom du fichier PDF stocké dans uploads/cv/
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidats (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nom         VARCHAR(150) NOT NULL,
    telephone   VARCHAR(30)  NOT NULL,
    metier      VARCHAR(150) NOT NULL,
    domaine     VARCHAR(100) NOT NULL,
    fichier_cv  VARCHAR(255) NOT NULL,
    experience     VARCHAR(30)  NOT NULL DEFAULT '',           -- ex. "1 à 3 ans" (liste dans config/contenu.php)
    disponibilite  VARCHAR(30)  NOT NULL DEFAULT '',           -- ex. "Immédiate"
    localisation   VARCHAR(100) NOT NULL DEFAULT '',           -- commune d'Abidjan ou ville
    statut         VARCHAR(20)  NOT NULL DEFAULT 'disponible', -- disponible | en_mission | inactif (géré dans l'admin)
    cree_le     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metier (metier),
    INDEX idx_domaine (domaine),
    INDEX idx_statut_candidat (statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Table des inscrits à la newsletter (un email = une seule inscription)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter (
    id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email    VARCHAR(190) NOT NULL UNIQUE,
    cree_le  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Table des messages reçus par la page Contact (api/contact.php)
-- lu = 0 tant que l'administrateur ne l'a pas marqué comme lu
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nom        VARCHAR(150) NOT NULL,
    email      VARCHAR(190) NOT NULL,
    telephone  VARCHAR(30)  NULL,
    sujet      VARCHAR(150) NOT NULL,
    message    TEXT NOT NULL,
    lu         TINYINT(1) NOT NULL DEFAULT 0,
    cree_le    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lu (lu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Table des clients (Espace client)
-- Le mot de passe n'est JAMAIS stocké en clair : on stocke un "hash".
-- Les comptes se créent depuis le back-office : admin/clients.php
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entreprise    VARCHAR(150) NOT NULL,
    email         VARCHAR(190) NOT NULL UNIQUE,
    mot_de_passe  VARCHAR(255) NOT NULL,
    cree_le       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Table des demandes de "mot de passe oublié" (Espace client)
-- jeton_hash = empreinte SHA-256 du jeton envoyé par email (le jeton en
-- clair n'est jamais stocké). Valable 1 heure, utilisable une seule fois.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reinitialisations (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_id   INT UNSIGNED NOT NULL,
    jeton_hash  CHAR(64) NOT NULL,
    expire_le   DATETIME NOT NULL,
    utilise     TINYINT(1) NOT NULL DEFAULT 0,
    cree_le     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_jeton (jeton_hash),
    INDEX idx_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Table des administrateurs (back-office admin/)
-- Création : php admin/creer-admin.php email motdepasse "Nom"
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nom           VARCHAR(150) NOT NULL,
    email         VARCHAR(190) NOT NULL UNIQUE,
    mot_de_passe  VARCHAR(255) NOT NULL,
    cree_le       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Journal des tentatives échouées (protection anti-force brute)
-- espace = 'client', 'admin' ou 'oubli' (mot de passe oublié)
-- Les lignes de plus d'un jour sont effacées automatiquement.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tentatives (
    id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    espace   VARCHAR(10)  NOT NULL,
    ip       VARCHAR(45)  NOT NULL,
    email    VARCHAR(190) NOT NULL,
    cree_le  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_recherche (espace, ip, email),
    INDEX idx_date (cree_le)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Table des événements / activités de CAFPM (galerie, carrousel de l'accueil)
-- Gérés dans le back-office : admin/evenements.php
-- slug      = adresse lisible (evenement.php?e=<slug>), générée depuis le titre
--             à la création, unique, puis conservée (les liens restent valides)
-- resume    = texte court affiché dans le carrousel ; description = texte complet
-- publie    = 1 : visible sur le site ; a_la_une = 1 : dans le carrousel
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evenements (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    titre           VARCHAR(150) NOT NULL,
    slug            VARCHAR(170) NOT NULL,
    date_evenement  DATE NOT NULL,
    lieu            VARCHAR(150) NOT NULL DEFAULT '',
    resume          VARCHAR(300) NOT NULL DEFAULT '',
    description     TEXT NULL,
    publie          TINYINT(1) NOT NULL DEFAULT 1,
    a_la_une        TINYINT(1) NOT NULL DEFAULT 1,
    cree_le         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mis_a_jour_le   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_slug_evenement (slug),
    INDEX idx_publie_date (publie, date_evenement)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Médias (photos, vidéos, liens YouTube) d'un événement
-- type       = 'image' | 'video' | 'youtube'
-- fichier    = nom du fichier stocké dans medias/evenements/ (image, video)
-- youtube_id = identifiant de 11 caractères de la vidéo (type youtube)
-- ordre      = ordre d'affichage (du plus petit au plus grand)
-- Pas de clé étrangère : la suppression d'un événement efface ses médias
-- (lignes + fichiers) depuis le back-office (includes/evenements.php).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evenement_medias (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    evenement_id  INT UNSIGNED NOT NULL,
    type          VARCHAR(10)  NOT NULL,
    fichier       VARCHAR(255) NOT NULL DEFAULT '',
    youtube_id    VARCHAR(20)  NOT NULL DEFAULT '',
    legende       VARCHAR(300) NOT NULL DEFAULT '',
    ordre         INT NOT NULL DEFAULT 0,
    cree_le       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_evenement (evenement_id, ordre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- STATISTIQUES DE FRÉQUENTATION (hébergées sur le site, sans service tiers)
-- Enregistrées par api/statistiques.php UNIQUEMENT si le visiteur a accepté
-- les cookies de mesure d'audience (bandeau de consentement), consultées
-- dans admin/statistiques.php. Aucune adresse IP ni user-agent complet.
-- visiteur = identifiant aléatoire du cookie cafpm_visiteur (32 caractères)
-- Lignes de plus de 13 mois effacées automatiquement (includes/statistiques.php).
-- --------------------------------------------------------------------------

-- Pages vues
-- chemin   = adresse de la page sans paramètres (sauf ?s=, ?a=, ?e= : slugs)
-- referent = domaine du site d'où vient le visiteur ('' = accès direct)
-- entree   = 1 si le visiteur arrive de l'extérieur (1re page d'une visite)
-- appareil = 'mobile' | 'tablette' | 'ordinateur' (déduit du navigateur)
CREATE TABLE IF NOT EXISTS stats_vues (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    visiteur   CHAR(32)     NOT NULL,
    chemin     VARCHAR(255) NOT NULL,
    referent   VARCHAR(100) NOT NULL DEFAULT '',
    entree     TINYINT(1)   NOT NULL DEFAULT 0,
    appareil   VARCHAR(12)  NOT NULL DEFAULT 'ordinateur',
    cree_le    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vues_date (cree_le, visiteur),
    INDEX idx_vues_chemin (chemin, cree_le)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Actions des visiteurs (clics, envois de formulaires, lectures de vidéo...)
-- nom    = nom de l'action (liste blanche STATS_EVENEMENTS, includes/statistiques.php)
-- detail = précision courte (métier recherché, événement consulté...)
-- valeur = nombre associé (ex. nombre de résultats d'une recherche), sinon NULL
CREATE TABLE IF NOT EXISTS stats_evenements (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    visiteur   CHAR(32)     NOT NULL,
    nom        VARCHAR(40)  NOT NULL,
    detail     VARCHAR(100) NOT NULL DEFAULT '',
    valeur     INT NULL,
    chemin     VARCHAR(255) NOT NULL DEFAULT '',
    cree_le    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_evt_date (cree_le),
    INDEX idx_evt_nom (nom, cree_le)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Choix exprimés dans le bandeau de cookies : simple compteur par jour
-- (aucun identifiant), pour calculer le taux d'acceptation. choix = 'oui' | 'non'
CREATE TABLE IF NOT EXISTS stats_consentements (
    jour       DATE NOT NULL,
    choix      VARCHAR(3) NOT NULL,
    nombre     INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (jour, choix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- Version de la structure (utilisée par includes/db.php, ne pas modifier)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS version_schema (
    id         TINYINT UNSIGNED PRIMARY KEY,
    empreinte  CHAR(32) NOT NULL,
    mis_a_jour DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
