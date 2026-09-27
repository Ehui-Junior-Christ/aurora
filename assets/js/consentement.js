/* ==========================================================================
   BANDEAU DE COOKIES + STATISTIQUES DE VISITE (hébergées sur le site)
   --------------------------------------------------------------------------
   Chargé sur toutes les pages publiques (partials/fin-page.php), en "defer".
   1. Bandeau (partials/consentement.php) :
      - affiché tant que le visiteur n'a pas choisi ;
      - « Accepter » / « Refuser » : choix gardé 6 mois (cookie cafpm_consentement) ;
      - rouvert par tout bouton [data-cookies-gerer] (« Gérer les cookies »).
   2. Statistiques, UNIQUEMENT si cafpm_consentement = "oui" :
      - cookie cafpm_visiteur : identifiant aléatoire (13 mois, jamais prolongé) ;
      - une "vue" par page affichée ;
      - des "actions" : clics repérés automatiquement (boutons des fenêtres,
        téléphone, email, WhatsApp, « Voir l'événement », vidéos) ou via
        l'attribut data-stat="nom_action" (data-stat-detail="précision"),
        et les formulaires envoyés avec succès (événement
        "cafpm:formulaire-envoye" émis par main.js).
      Les noms d'actions autorisés sont listés dans includes/statistiques.php.
   Envoi : navigator.sendBeacon (ou fetch keepalive) vers api/statistiques.php,
   en arrière-plan : aucune attente pour le visiteur.
   Aucun script inline : compatible avec la politique de sécurité (CSP).
   ========================================================================== */
(() => {
    'use strict';

    const script = document.currentScript;
    const API = (script && script.dataset.api) || 'api/statistiques.php';

    const COOKIE_CHOIX = 'cafpm_consentement';
    const COOKIE_VISITEUR = 'cafpm_visiteur';
    const DUREE_CHOIX = 182 * 24 * 3600;    // 6 mois (en secondes)
    const DUREE_VISITEUR = 395 * 24 * 3600; // 13 mois

    /* ---------- Cookies ---------- */
    function lireCookie(nom) {
        const trouve = document.cookie.split('; ').find(c => c.startsWith(nom + '='));
        return trouve ? decodeURIComponent(trouve.slice(nom.length + 1)) : null;
    }

    function ecrireCookie(nom, valeur, duree) {
        const securise = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = nom + '=' + encodeURIComponent(valeur) + '; Max-Age=' + duree + '; Path=/; SameSite=Lax' + securise;
    }

    function supprimerCookie(nom) {
        document.cookie = nom + '=; Max-Age=0; Path=/; SameSite=Lax';
    }

    const choixActuel = () => lireCookie(COOKIE_CHOIX);        // "oui", "non" ou null
    const suiviActif = () => choixActuel() === 'oui';

    // Identifiant aléatoire du visiteur (32 caractères hexadécimaux, aucune donnée personnelle)
    function identifiantVisiteur() {
        let id = lireCookie(COOKIE_VISITEUR);
        if (id && /^[a-f0-9]{32}$/.test(id)) return id;

        const octets = new Uint8Array(16);
        if (window.crypto && crypto.getRandomValues) {
            crypto.getRandomValues(octets);
        } else {
            for (let i = 0; i < 16; i++) octets[i] = Math.floor(Math.random() * 256);
        }
        id = Array.from(octets, o => o.toString(16).padStart(2, '0')).join('');
        ecrireCookie(COOKIE_VISITEUR, id, DUREE_VISITEUR);
        return id;
    }

    /* ---------- Envoi vers api/statistiques.php ---------- */

    // Adresse de la page sans ses paramètres, sauf ?s= ?a= ?e= (solution, actualité, événement)
    function cheminPage() {
        const params = new URLSearchParams(location.search);
        const gardes = new URLSearchParams();
        ['s', 'a', 'e'].forEach(nom => { if (params.has(nom)) gardes.set(nom, params.get(nom)); });
        const query = gardes.toString();
        return location.pathname + (query ? '?' + query : '');
    }

    function envoyer(donnees) {
        // Vues et actions : jamais sans consentement (le serveur le vérifie aussi)
        if (donnees.type !== 'choix') {
            if (!suiviActif()) return;
            identifiantVisiteur(); // Cookie présent avant l'envoi (retrait puis nouvel accord)
        }

        const formulaire = new FormData();
        const csrf = document.querySelector('meta[name="csrf-token"]');
        if (csrf) formulaire.append('csrf_token', csrf.content);
        Object.keys(donnees).forEach(cle => {
            if (donnees[cle] !== undefined && donnees[cle] !== null) formulaire.append(cle, String(donnees[cle]).slice(0, 200));
        });

        try {
            if (navigator.sendBeacon && navigator.sendBeacon(API, formulaire)) return;
        } catch (erreur) { /* on tente fetch */ }
        try {
            fetch(API, { method: 'POST', body: formulaire, credentials: 'same-origin', keepalive: true }).catch(() => {});
        } catch (erreur) { /* statistiques : jamais bloquant */ }
    }

    const envoyerVue = () => envoyer({ type: 'vue', chemin: cheminPage(), ref: document.referrer || '' });

    function envoyerAction(nom, detail, valeur) {
        envoyer({ type: 'evt', nom, detail: detail || '', valeur: Number.isFinite(valeur) ? valeur : '', chemin: cheminPage() });
    }

    /* ---------- Bandeau ---------- */
    const bandeau = document.getElementById('cookies-bandeau');
    const etat = document.getElementById('cookies-etat');
    let declencheur = null; // Bouton « Gérer les cookies » à qui rendre le focus

    function ajusterEspace() {
        // Espace réservé en bas de page : le bandeau ne cache pas la fin du contenu
        const hauteur = bandeau && !bandeau.hidden ? bandeau.offsetHeight : 0;
        document.documentElement.style.setProperty('--cookies-hauteur', hauteur + 'px');
        document.body.classList.toggle('cookies-ouvert', hauteur > 0);
    }

    function ouvrirBandeau(depuis) {
        if (!bandeau) return;
        const choix = choixActuel();
        // Rappel du choix en cours quand le visiteur revient sur sa décision
        if (etat) {
            etat.hidden = !choix;
            etat.textContent = choix === 'oui'
                ? 'Votre choix actuel : statistiques de visite acceptées.'
                : 'Votre choix actuel : statistiques de visite refusées.';
        }
        bandeau.querySelectorAll('[data-consentement]').forEach(bouton => {
            bouton.setAttribute('aria-pressed', String(bouton.dataset.consentement === choix));
        });

        // Placé juste après le lien d'évitement : atteint rapidement au clavier
        const evitement = document.querySelector('.lien-evitement');
        if (evitement && evitement.nextElementSibling !== bandeau) evitement.after(bandeau);

        bandeau.hidden = false;
        ajusterEspace();
        if (depuis) {
            declencheur = depuis;
            bandeau.focus();
        }
    }

    function fermerBandeau() {
        if (!bandeau) return;
        const focusDedans = bandeau.contains(document.activeElement);
        bandeau.hidden = true;
        ajusterEspace();
        if (declencheur && document.contains(declencheur)) {
            declencheur.focus();
        } else if (focusDedans) {
            const contenu = document.getElementById('contenu');
            if (contenu) {
                if (!contenu.hasAttribute('tabindex')) contenu.setAttribute('tabindex', '-1');
                contenu.focus({ preventScroll: true });
            }
        }
        declencheur = null;
    }

    function choisir(choix) {
        const avant = choixActuel();
        ecrireCookie(COOKIE_CHOIX, choix, DUREE_CHOIX);

        if (choix === 'oui') {
            identifiantVisiteur();
            if (avant !== 'oui') envoyerVue(); // La page affichée compte dès l'accord
        } else {
            supprimerCookie(COOKIE_VISITEUR); // Retrait : l'identifiant disparaît
        }
        if (avant !== choix) envoyer({ type: 'choix', choix }); // Compteur anonyme oui / non
        fermerBandeau();
    }

    if (bandeau) {
        bandeau.addEventListener('click', (e) => {
            const bouton = e.target.closest('[data-consentement]');
            if (bouton) choisir(bouton.dataset.consentement === 'oui' ? 'oui' : 'non');
        });
        // Échap : referme le bandeau rouvert sans changer le choix déjà fait
        bandeau.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && choixActuel()) {
                e.stopPropagation();
                fermerBandeau();
            }
        });
        window.addEventListener('resize', ajusterEspace, { passive: true });
    }

    document.addEventListener('click', (e) => {
        const gerer = e.target.closest('[data-cookies-gerer]');
        if (gerer) {
            e.preventDefault();
            ouvrirBandeau(gerer);
        }
    });

    /* ---------- Actions suivies (clics) ---------- */
    // Fenêtres ouvertes par les boutons .modal-trigger (data-target) -> nom de l'action
    const FENETRES = {
        'drawer-form': 'clic_deposer_besoin',
        'drawer-candidat': 'clic_creer_profil',
        'modal-login': 'ouverture_espace_client',
    };

    document.addEventListener('click', (e) => {
        if (!suiviActif() || !e.target.closest) return;

        // 1. Attribut explicite data-stat="nom_action"
        const marque = e.target.closest('[data-stat]');
        if (marque) {
            envoyerAction(marque.dataset.stat, marque.dataset.statDetail);
            return;
        }

        // 2. Boutons ouvrant une fenêtre (Déposer un besoin, Créer mon profil, Espace client)
        const declencheurFenetre = e.target.closest('.modal-trigger[data-target]');
        if (declencheurFenetre && FENETRES[declencheurFenetre.dataset.target]) {
            envoyerAction(FENETRES[declencheurFenetre.dataset.target]);
            return;
        }

        // 3. « Demander ce profil » (résultats de la recherche de profils)
        if (e.target.closest('.profil-demander')) {
            envoyerAction('clic_demander_profil');
            return;
        }

        // 4. Vidéo YouTube lancée par le visiteur (façade remplacée par le lecteur)
        if (e.target.closest('.yt-facade') && e.isTrusted) {
            envoyerAction('lecture_video', 'YouTube');
            return;
        }

        // 5. Liens : téléphone, email, WhatsApp, « Voir l'événement »
        const lien = e.target.closest('a[href]');
        if (!lien) return;
        const href = lien.getAttribute('href') || '';
        if (/^tel:/i.test(href)) {
            envoyerAction('clic_telephone');
        } else if (/^mailto:/i.test(href)) {
            envoyerAction('clic_email');
        } else if (/^(whatsapp:|https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/)/i.test(href)) {
            envoyerAction('clic_whatsapp');
        } else {
            const evenement = href.match(/evenement\.php\?(?:.*&)?e=([A-Za-z0-9_-]{1,80})/);
            if (evenement) envoyerAction('clic_voir_evenement', evenement[1]);
        }
    }, true); // Phase de capture : compté même si un autre script arrête le clic

    // Vidéos du site (<video>) : lecture lancée par le visiteur, comptée une fois par vidéo.
    // Les lectures automatiques sans le son du carrousel (data-auto="1") sont ignorées.
    const videosComptees = new WeakSet();
    document.addEventListener('play', (e) => {
        const video = e.target;
        if (!suiviActif() || !(video instanceof HTMLVideoElement) || videosComptees.has(video)) return;
        if (video.dataset.auto === '1' && video.muted) return;
        videosComptees.add(video);
        envoyerAction('lecture_video', 'Vidéo du site');
    }, true);

    /* ---------- Formulaires envoyés avec succès (signalés par main.js) ---------- */
    const FORMULAIRES = {
        'demande.php': 'envoi_demande',
        'candidat.php': 'envoi_candidature',
        'contact.php': 'envoi_contact',
        'newsletter.php': 'envoi_newsletter',
        'connexion.php': 'connexion_client',
        'recherche.php': 'recherche_profils',
    };

    document.addEventListener('cafpm:formulaire-envoye', (e) => {
        if (!suiviActif() || !e.detail || !e.detail.form) return;
        const form = e.detail.form;
        const fichier = (form.getAttribute('action') || '').split('?')[0].split('/').pop();
        const nom = FORMULAIRES[fichier];
        if (!nom) return;

        if (nom === 'recherche_profils') {
            // Métier recherché (s'il est court) ou secteur choisi, et nombre de résultats
            const motCle = ((form.elements.q && form.elements.q.value) || '').trim();
            const secteur = ((form.elements.secteur && form.elements.secteur.value) || '').trim();
            let detail = motCle && motCle.length <= 60 ? motCle : '';
            if (!detail) detail = secteur ? 'Secteur : ' + secteur : (motCle ? '' : 'Tous les profils');
            const total = Number(e.detail.result && e.detail.result.total);
            envoyerAction(nom, detail.slice(0, 100), Number.isFinite(total) ? total : undefined);
            return;
        }
        envoyerAction(nom);
    });

    /* ---------- Démarrage ---------- */
    function demarrer() {
        const choix = choixActuel();
        if (choix !== 'oui' && choix !== 'non') {
            ouvrirBandeau(null); // Premier passage : on demande (aucun suivi en attendant)
        } else if (choix === 'oui') {
            envoyerVue();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', demarrer);
    } else {
        demarrer();
    }
})();
