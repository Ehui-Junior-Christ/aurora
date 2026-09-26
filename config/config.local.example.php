<?php
/* ==========================================================================
   MODÈLE D'IDENTIFIANTS DE LA BASE DE DONNÉES
   --------------------------------------------------------------------------
   Copiez ce fichier sous le nom "config.local.php" (même dossier),
   puis remplacez les valeurs par vos vrais identifiants.
   ========================================================================== */

define('DB_HOTE', 'localhost');        // Adresse du serveur MySQL
define('DB_PORT', 3306);               // Port MySQL (3306 par défaut)
define('DB_NOM',  'nom_de_la_base');   // Nom de la base (schéma)
define('DB_USER', 'utilisateur');      // Utilisateur MySQL
define('DB_PASS', 'mot_de_passe');     // Mot de passe

// Mode développement : true UNIQUEMENT sur votre PC (jamais en production)
define('MODE_DEV', false);

// Adresse publique du site, sans "/" final (liens envoyés par email)
define('SITE_URL', 'https://www.cafpm.ci');
