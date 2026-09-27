<?php
/* ==========================================================================
   BACK-OFFICE : STATISTIQUES DE FRÉQUENTATION
   --------------------------------------------------------------------------
   Données enregistrées par api/statistiques.php, uniquement pour les
   visiteurs ayant accepté les cookies de mesure d'audience (voir cookies.php).
   Période au choix : 7, 30 ou 90 derniers jours (?periode=7|30|90).
   1. Chiffres clés (visiteurs, pages vues, pages par visiteur, actions,
      taux d'acceptation du bandeau de cookies)
   2. Graphique des visiteurs par jour (barres SVG générées ici, sans
      bibliothèque ni script : compatible avec la CSP des pages privées)
   3. Pages les plus vues, provenance, appareils
   4. Actions des visiteurs et métiers les plus recherchés
   5. 20 dernières activités
   Tout texte venant de la base est échappé avec e().
   ========================================================================== */

require_once __DIR__ . '/../includes/auth-admin.php';
require_once __DIR__ . '/../includes/layout-admin.php';
require_once __DIR__ . '/../includes/statistiques.php';

$admin = exiger_admin();

const PERIODES_STATS = [7 => '7 jours', 30 => '30 jours', 90 => '90 jours'];
const APPAREILS_STATS = ['ordinateur' => 'Ordinateur', 'mobile' => 'Téléphone', 'tablette' => 'Tablette'];

$periode = (int) parametre_get('periode', 3);
if (!array_key_exists($periode, PERIODES_STATS)) {
    $periode = 30;
}

$vues = $visiteurs = $nb_actions = 0;
$consentement = ['oui' => 0, 'non' => 0];
$jours = $pages = $provenances = $appareils = $actions = $recherches = $dernieres = [];

try {
    $pdo = db();

    // Premier jour de la période (aujourd'hui inclus), selon l'horloge de MySQL
    $requete = $pdo->prepare('SELECT CURDATE() - INTERVAL ? DAY, CURDATE()');
    $requete->execute([$periode - 1]);
    [$premier_jour, $aujourdhui] = $requete->fetch(PDO::FETCH_NUM);
    $debut = $premier_jour . ' 00:00:00';

    // Petite aide : exécute une requête préparée avec la date de début
    $lire = function (string $sql, array $valeurs = []) use ($pdo, $debut): PDOStatement {
        $requete = $pdo->prepare($sql);
        $requete->execute(array_merge([$debut], $valeurs));
        return $requete;
    };

    // 1. Chiffres clés
    [$vues, $visiteurs] = $lire('SELECT COUNT(*), COUNT(DISTINCT visiteur) FROM stats_vues WHERE cree_le >= ?')->fetch(PDO::FETCH_NUM);
    $nb_actions = (int) $lire('SELECT COUNT(*) FROM stats_evenements WHERE cree_le >= ?')->fetchColumn();

    $requete = $pdo->prepare('SELECT choix, SUM(nombre) FROM stats_consentements WHERE jour >= ? GROUP BY choix');
    $requete->execute([$premier_jour]);
    foreach ($requete->fetchAll(PDO::FETCH_KEY_PAIR) as $choix => $nombre) {
        if (isset($consentement[$choix])) {
            $consentement[$choix] = (int) $nombre;
        }
    }

    // 2. Par jour (les jours sans visite sont ajoutés à 0)
    $par_jour = [];
    foreach ($lire('SELECT DATE(cree_le) AS jour, COUNT(*) AS vues, COUNT(DISTINCT visiteur) AS visiteurs
                    FROM stats_vues WHERE cree_le >= ? GROUP BY DATE(cree_le)') as $ligne) {
        $par_jour[$ligne['jour']] = $ligne;
    }
    for ($i = $periode - 1; $i >= 0; $i--) {
        $jour = date('Y-m-d', strtotime($aujourdhui . " -$i day"));
        $jours[] = [
            'jour'      => $jour,
            'vues'      => (int) ($par_jour[$jour]['vues'] ?? 0),
            'visiteurs' => (int) ($par_jour[$jour]['visiteurs'] ?? 0),
        ];
    }

    // 3. Pages, provenance (arrivées sur le site), appareils
    $pages = $lire('SELECT chemin, COUNT(*) AS vues, COUNT(DISTINCT visiteur) AS visiteurs
                    FROM stats_vues WHERE cree_le >= ? GROUP BY chemin ORDER BY vues DESC, chemin LIMIT 10')->fetchAll();
    $provenances = $lire('SELECT referent, COUNT(*) AS nombre
                          FROM stats_vues WHERE cree_le >= ? AND entree = 1
                          GROUP BY referent ORDER BY nombre DESC, referent LIMIT 8')->fetchAll();
    $appareils = $lire('SELECT appareil, COUNT(DISTINCT visiteur) AS nombre
                        FROM stats_vues WHERE cree_le >= ? GROUP BY appareil ORDER BY nombre DESC')->fetchAll();

    // 4. Actions (toutes celles de la liste blanche, même à 0) et recherches
    $comptes = [];
    foreach ($lire('SELECT nom, COUNT(*) AS nombre, COUNT(DISTINCT visiteur) AS visiteurs
                    FROM stats_evenements WHERE cree_le >= ? GROUP BY nom') as $ligne) {
        $comptes[$ligne['nom']] = $ligne;
    }
    foreach (STATS_EVENEMENTS as $nom => $libelle) {
        $actions[] = [
            'libelle'   => $libelle,
            'nombre'    => (int) ($comptes[$nom]['nombre'] ?? 0),
            'visiteurs' => (int) ($comptes[$nom]['visiteurs'] ?? 0),
        ];
    }
    usort($actions, fn($a, $b) => $b['nombre'] <=> $a['nombre']);

    $recherches = $lire("SELECT detail, COUNT(*) AS nombre, ROUND(AVG(valeur)) AS resultats
                         FROM stats_evenements WHERE cree_le >= ? AND nom = 'recherche_profils'
                         GROUP BY detail ORDER BY nombre DESC, detail LIMIT 10")->fetchAll();

    // 5. Dernières activités (pages vues et actions mélangées, toutes périodes)
    $dernieres = $pdo->query(
        "(SELECT 'vue' AS type, visiteur, chemin, '' AS nom, '' AS detail, NULL AS valeur, cree_le, id
            FROM stats_vues ORDER BY cree_le DESC, id DESC LIMIT 20)
         UNION ALL
         (SELECT 'evt' AS type, visiteur, chemin, nom, detail, valeur, cree_le, id
            FROM stats_evenements ORDER BY cree_le DESC, id DESC LIMIT 20)
         ORDER BY cree_le DESC, id DESC LIMIT 20"
    )->fetchAll();
} catch (PDOException $erreur) {
    error_log('[CAFPM] Erreur statistiques admin : ' . $erreur->getMessage());
    flash('erreur', 'Impossible de charger les statistiques.');
}

$vues      = (int) $vues;
$visiteurs = (int) $visiteurs;
$total_choix = $consentement['oui'] + $consentement['non'];

/**
 * Nombre au format français (1 234).
 */
function nombre_fr(float $nombre, int $decimales = 0): string
{
    return number_format($nombre, $decimales, ',', "\u{202F}");
}

/**
 * Petite barre de proportion (SVG, sans style inline) : $valeur sur $maximum.
 */
function barre_proportion(int $valeur, int $maximum): string
{
    $pourcentage = $maximum > 0 ? round($valeur / $maximum * 100, 1) : 0;
    // Largeurs en pourcentage, sans viewBox : aucune déformation à l'affichage
    return '<svg class="stats-barre" aria-hidden="true" focusable="false">'
        . '<rect class="stats-barre-fond" x="0" y="0" width="100%" height="6" rx="3"/>'
        . '<rect class="stats-barre-valeur" x="0" y="0" width="' . $pourcentage . '%" height="6" rx="3"/></svg>';
}

// Graphique : hauteur de l'échelle arrondie (1, 2, 5, 10, 20, 50...) au-dessus du maximum
$max_jour = max(array_column($jours, 'visiteurs') ?: [0]);
$echelle = 1;
foreach ([1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000] as $palier) {
    $echelle = $palier;
    if ($palier >= $max_jour && $palier >= 4) {
        break;
    }
}
// Dates affichées sous le graphique : une sur N, plus le dernier jour
// (la date régulière trop proche du dernier jour est retirée pour éviter un chevauchement)
$pas_etiquettes = $periode === 7 ? 1 : ($periode === 30 ? 5 : 15);
$dernier_index = count($jours) - 1;
$index_etiquettes = [$dernier_index];
for ($i = 0; $i < $dernier_index; $i += $pas_etiquettes) {
    if ($pas_etiquettes === 1 || $dernier_index - $i >= $pas_etiquettes / 2) {
        $index_etiquettes[] = $i;
    }
}

admin_entete('Statistiques', 'statistiques', $admin);
?>
        <p class="admin-intro">Fréquentation du site public, mesurée uniquement auprès des visiteurs qui ont accepté les statistiques dans le bandeau de cookies. Pas d'adresse IP, pas de service tiers ; données effacées au bout de <?= (int) STATS_DUREE_MOIS ?> mois.</p>

        <nav class="filtres" aria-label="Période">
            <?php foreach (PERIODES_STATS as $jours_periode => $libelle): ?>
                <a href="?periode=<?= $jours_periode ?>" class="filtre<?= $jours_periode === $periode ? ' actif' : '' ?>"<?= $jours_periode === $periode ? ' aria-current="page"' : '' ?>><?= e($libelle) ?></a>
            <?php endforeach; ?>
        </nav>

        <!-- 1. Chiffres clés -->
        <div class="chiffres-bande">
            <div class="chiffre chiffre-fixe">
                <strong><?= e(nombre_fr($visiteurs)) ?></strong>
                <span>Visiteurs uniques</span>
            </div>
            <div class="chiffre chiffre-fixe">
                <strong><?= e(nombre_fr($vues)) ?></strong>
                <span>Pages vues</span>
            </div>
            <div class="chiffre chiffre-fixe">
                <strong><?= $visiteurs > 0 ? e(nombre_fr($vues / $visiteurs, 1)) : '&ndash;' ?></strong>
                <span>Pages par visiteur</span>
            </div>
            <div class="chiffre chiffre-fixe">
                <strong><?= e(nombre_fr($nb_actions)) ?></strong>
                <span>Actions enregistrées</span>
            </div>
            <div class="chiffre chiffre-fixe">
                <strong><?= $total_choix > 0 ? e(nombre_fr($consentement['oui'] / $total_choix * 100)) . '&nbsp;%' : '&ndash;' ?></strong>
                <span>Acceptent les statistiques<?= $total_choix > 0 ? ' (' . e(nombre_fr($consentement['oui'])) . ' sur ' . e(nombre_fr($total_choix)) . ' choix)' : '' ?></span>
            </div>
        </div>

        <!-- 2. Visiteurs par jour -->
        <section class="panneau stats-panneau-graphique">
            <header class="panneau-entete">
                <h2>Visiteurs par jour</h2>
                <span class="stats-sous-titre"><?= e(PERIODES_STATS[$periode]) ?> &middot; détail au survol ou dans le tableau</span>
            </header>
            <?php if ($vues === 0): ?>
                <p class="panneau-vide">Aucune visite enregistrée sur cette période.</p>
            <?php else: ?>
            <div class="stats-graphique">
                <div class="stats-axe" aria-hidden="true">
                    <span><?= e(nombre_fr($echelle)) ?></span>
                    <span><?= e(nombre_fr($echelle / 2, $echelle % 2 ? 1 : 0)) ?></span>
                    <span>0</span>
                </div>
                <div class="stats-trace">
                    <svg viewBox="0 0 <?= count($jours) * 10 ?> 100" preserveAspectRatio="none" role="img"
                         aria-label="Visiteurs uniques par jour sur <?= e(PERIODES_STATS[$periode]) ?> (détail dans le tableau ci-dessous)">
                        <line class="stats-repere" x1="0" y1="50" x2="<?= count($jours) * 10 ?>" y2="50" vector-effect="non-scaling-stroke"/>
                        <line class="stats-repere" x1="0" y1="0.5" x2="<?= count($jours) * 10 ?>" y2="0.5" vector-effect="non-scaling-stroke"/>
                        <?php foreach ($jours as $i => $j):
                            $hauteur = $j['visiteurs'] > 0 ? max(1.5, round($j['visiteurs'] / $echelle * 100, 2)) : 0; ?>
                        <g class="stats-jour">
                            <title><?= e(date_fr($j['jour'], false)) ?> : <?= $j['visiteurs'] ?> visiteur<?= $j['visiteurs'] > 1 ? 's' : '' ?>, <?= $j['vues'] ?> page<?= $j['vues'] > 1 ? 's' : '' ?> vue<?= $j['vues'] > 1 ? 's' : '' ?></title>
                            <rect class="stats-zone" x="<?= $i * 10 ?>" y="0" width="10" height="100"/>
                            <?php if ($hauteur > 0): ?>
                            <rect class="stats-colonne" x="<?= $i * 10 + 1.5 ?>" y="<?= 100 - $hauteur ?>" width="7" height="<?= $hauteur ?>"/>
                            <?php endif; ?>
                        </g>
                        <?php endforeach; ?>
                        <line class="stats-base" x1="0" y1="99.5" x2="<?= count($jours) * 10 ?>" y2="99.5" vector-effect="non-scaling-stroke"/>
                    </svg>
                    <div class="stats-dates stats-dates-<?= count($jours) ?>" aria-hidden="true">
                        <?php foreach ($jours as $i => $j): ?>
                            <span><?= in_array($i, $index_etiquettes, true) ? e(date('d/m', strtotime($j['jour']))) : '' ?></span>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>
            <details class="stats-details">
                <summary>Voir les chiffres jour par jour</summary>
                <div class="tableau-conteneur">
                    <table class="tableau tableau-stats">
                        <thead><tr><th scope="col">Jour</th><th scope="col" class="nombre">Visiteurs</th><th scope="col" class="nombre">Pages vues</th></tr></thead>
                        <tbody>
                            <?php foreach (array_reverse($jours) as $j): ?>
                            <tr><td><?= e(date_fr($j['jour'], false)) ?></td><td class="nombre"><?= $j['visiteurs'] ?></td><td class="nombre"><?= $j['vues'] ?></td></tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </details>
            <?php endif; ?>
        </section>

        <!-- 3. Pages, provenance, appareils -->
        <div class="stats-grille">
            <section class="panneau">
                <header class="panneau-entete"><h2>Pages les plus vues</h2></header>
                <?php if (!$pages): ?>
                    <p class="panneau-vide">Aucune page vue sur cette période.</p>
                <?php else: $max = (int) $pages[0]['vues']; ?>
                <div class="tableau-conteneur stats-tableau">
                    <table class="tableau tableau-stats">
                        <thead><tr><th scope="col">Page</th><th scope="col" class="nombre">Vues</th><th scope="col" class="nombre">Visiteurs</th></tr></thead>
                        <tbody>
                            <?php foreach ($pages as $p): ?>
                            <tr>
                                <td>
                                    <strong class="stats-libelle"><?= e(stats_libelle_page($p['chemin'])) ?></strong>
                                    <span class="stats-chemin"><?= e($p['chemin']) ?></span>
                                    <?= barre_proportion((int) $p['vues'], $max) ?>
                                </td>
                                <td class="nombre"><?= (int) $p['vues'] ?></td>
                                <td class="nombre"><?= (int) $p['visiteurs'] ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <?php endif; ?>
            </section>

            <div class="tdb-cote">
                <section class="panneau">
                    <header class="panneau-entete"><h2>Provenance des visites</h2></header>
                    <?php if (!$provenances): ?>
                        <p class="panneau-vide">Aucune arrivée sur le site enregistrée.</p>
                    <?php else: $max = (int) max(array_column($provenances, 'nombre')); ?>
                    <ul class="stats-liste">
                        <?php foreach ($provenances as $p): ?>
                        <li>
                            <span class="stats-liste-texte"><?= $p['referent'] === '' ? '<em>Accès direct</em> <small>(adresse tapée, favori, application)</small>' : e($p['referent']) ?></span>
                            <strong><?= (int) $p['nombre'] ?></strong>
                            <?= barre_proportion((int) $p['nombre'], $max) ?>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                    <?php endif; ?>
                </section>

                <section class="panneau">
                    <header class="panneau-entete"><h2>Appareils</h2><span class="stats-sous-titre">visiteurs</span></header>
                    <?php if (!$appareils): ?>
                        <p class="panneau-vide">Aucune donnée.</p>
                    <?php else: $total_appareils = (int) array_sum(array_column($appareils, 'nombre')); ?>
                    <ul class="stats-liste">
                        <?php foreach ($appareils as $a): ?>
                        <li>
                            <span class="stats-liste-texte"><?= e(APPAREILS_STATS[$a['appareil']] ?? $a['appareil']) ?></span>
                            <strong><?= (int) $a['nombre'] ?> <small>(<?= e(nombre_fr($total_appareils > 0 ? $a['nombre'] / $total_appareils * 100 : 0)) ?>&nbsp;%)</small></strong>
                            <?= barre_proportion((int) $a['nombre'], $total_appareils) ?>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                    <?php endif; ?>
                </section>
            </div>
        </div>

        <!-- 4. Actions et recherches -->
        <div class="stats-grille">
            <section class="panneau">
                <header class="panneau-entete"><h2>Actions des visiteurs</h2></header>
                <?php $max = (int) max(array_column($actions, 'nombre') ?: [0]); ?>
                <div class="tableau-conteneur stats-tableau">
                    <table class="tableau tableau-stats">
                        <thead><tr><th scope="col">Action</th><th scope="col" class="nombre">Nombre</th><th scope="col" class="nombre">Visiteurs</th></tr></thead>
                        <tbody>
                            <?php foreach ($actions as $a): ?>
                            <tr<?= $a['nombre'] === 0 ? ' class="stats-zero"' : '' ?>>
                                <td><?= e($a['libelle']) ?><?= $a['nombre'] > 0 ? barre_proportion($a['nombre'], $max) : '' ?></td>
                                <td class="nombre"><?= $a['nombre'] ?></td>
                                <td class="nombre"><?= $a['visiteurs'] ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="panneau">
                <header class="panneau-entete"><h2>Profils les plus recherchés</h2></header>
                <?php if (!$recherches): ?>
                    <p class="panneau-vide">Aucune recherche de profils sur cette période.</p>
                <?php else: ?>
                <div class="tableau-conteneur stats-tableau">
                    <table class="tableau tableau-stats">
                        <thead><tr><th scope="col">Recherche</th><th scope="col" class="nombre">Fois</th><th scope="col" class="nombre">Résultats (moy.)</th></tr></thead>
                        <tbody>
                            <?php foreach ($recherches as $r): ?>
                            <tr>
                                <td><?= $r['detail'] === '' ? '<em>Recherche trop longue (non détaillée)</em>' : e($r['detail']) ?></td>
                                <td class="nombre"><?= (int) $r['nombre'] ?></td>
                                <td class="nombre<?= $r['resultats'] !== null && (int) $r['resultats'] === 0 ? ' stats-alerte' : '' ?>"><?= $r['resultats'] === null ? '&ndash;' : (int) $r['resultats'] ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <p class="stats-note">Une moyenne de 0 résultat signale un profil demandé mais absent du vivier.</p>
                <?php endif; ?>
            </section>
        </div>

        <!-- 5. Dernières activités -->
        <section class="panneau">
            <header class="panneau-entete"><h2>Dernières activités</h2><span class="stats-sous-titre">20 plus récentes</span></header>
            <?php if (!$dernieres): ?>
                <p class="panneau-vide">Aucune activité enregistrée pour le moment.</p>
            <?php else: ?>
            <ul class="liste-simple">
                <?php foreach ($dernieres as $d): ?>
                <li class="ligne">
                    <span class="ligne-principal">
                        <?php if ($d['type'] === 'vue'): ?>
                            <strong>Page vue : <?= e(stats_libelle_page($d['chemin'])) ?></strong>
                        <?php else: ?>
                            <strong><?= e(STATS_EVENEMENTS[$d['nom']] ?? $d['nom']) ?><?= $d['detail'] !== '' ? ' : ' . e($d['detail']) : '' ?><?= $d['valeur'] !== null ? ' (' . (int) $d['valeur'] . ' résultat' . ((int) $d['valeur'] > 1 ? 's' : '') . ')' : '' ?></strong>
                        <?php endif; ?>
                        <span>Visiteur <?= e(substr($d['visiteur'], 0, 6)) ?><?= $d['chemin'] !== '' ? ' &middot; ' . e($d['chemin']) : '' ?></span>
                    </span>
                    <time class="ligne-meta" datetime="<?= e($d['cree_le']) ?>" title="<?= e(date_fr($d['cree_le'])) ?>"><?= e(il_y_a($d['cree_le'])) ?></time>
                </li>
                <?php endforeach; ?>
            </ul>
            <?php endif; ?>
        </section>
<?php
admin_pied();
