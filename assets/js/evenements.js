/* ==========================================================================
   ÉVÉNEMENTS : comportements des pages publiques
   --------------------------------------------------------------------------
   Chargé par partials/fin-page.php (attribut defer) sur toutes les pages :
   chaque partie ne s'active que si ses éléments sont présents.
   1. VIDÉOS YOUTUBE EN « FAÇADE » : miniature + bouton lecture, remplacés
      au clic par le lecteur YouTube (youtube-nocookie.com). Rien n'est
      chargé depuis YouTube tant que le visiteur ne lance pas la vidéo.
   2. CARROUSEL de l'accueil (« Nos activités en images ») : flèches, points,
      glisser au doigt / à la souris, défilement automatique lent mis en
      pause au survol, au focus clavier ou avec le bouton pause (désactivé
      si le réglage système « Réduire les animations » est actif).
   3. VISIONNEUSE plein écran des photos (page evenement.php) : suivant /
      précédent, clavier ←/→/Échap, glisser, piège de focus, retour du focus.
   ========================================================================== */
(() => {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const inertDisponible = 'inert' in HTMLElement.prototype;

    /* ==========================================================================
       1. VIDÉOS YOUTUBE EN « FAÇADE »
       ========================================================================== */
    const facadesRemplacees = new Map(); // iframe créée -> bouton façade d'origine

    // auto = true : lancement automatique par le carrousel (sans le son, les
    // navigateurs refusant la lecture automatique avec le son ; le focus reste en place)
    function lancerYoutube(facade, auto = false) {
        const id = facade.dataset.youtubeId || '';
        if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;

        const iframe = document.createElement('iframe');
        iframe.className = 'yt-iframe';
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1'
            + (auto ? '&mute=1' : '');
        iframe.title = facade.dataset.titre || 'Vidéo YouTube';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.loading = 'lazy';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin'; // YouTube exige l'origine du site

        facadesRemplacees.set(iframe, facade);
        facade.replaceWith(iframe);
        if (!auto) iframe.focus(); // Clic du visiteur : le focus clavier suit le lecteur
        return iframe;
    }

    document.addEventListener('click', (e) => {
        const facade = e.target.closest('.yt-facade');
        if (facade) lancerYoutube(facade);
    });

    /* ==========================================================================
       2. CARROUSEL
       ========================================================================== */
    const DELAI_DEFILEMENT = 5000; // Millisecondes entre deux diapositives (photos ET vidéos)
    const FOCUSABLES = 'a[href], button, video[controls], iframe, [tabindex]';

    // Masque (ou réaffiche) une diapositive pour tous : yeux, clavier, lecteurs d'écran
    function masquerDiapo(diapo, masquee) {
        diapo.setAttribute('aria-hidden', String(masquee));
        if (inertDisponible) {
            diapo.inert = masquee;
            return;
        }
        // Navigateur ancien sans "inert" : on retire les éléments de l'ordre de tabulation
        diapo.querySelectorAll(FOCUSABLES).forEach(el => {
            if (masquee) {
                if (!el.hasAttribute('data-tabindex-origine')) {
                    el.setAttribute('data-tabindex-origine', el.getAttribute('tabindex') ?? '');
                }
                el.setAttribute('tabindex', '-1');
            } else if (el.hasAttribute('data-tabindex-origine')) {
                const origine = el.getAttribute('data-tabindex-origine');
                if (origine === '') el.removeAttribute('tabindex');
                else el.setAttribute('tabindex', origine);
                el.removeAttribute('data-tabindex-origine');
            }
        });
    }

    function initialiserCarrousel(carrousel) {
        const fenetre = carrousel.querySelector('.carrousel-fenetre');
        const piste = carrousel.querySelector('.carrousel-piste');
        const diapos = Array.from(carrousel.querySelectorAll('.carrousel-diapo'));
        const total = diapos.length;
        if (!fenetre || !piste || total === 0) return;

        carrousel.classList.add('carrousel-actif');
        if (total < 2) {
            // Une seule diapositive : ni flèches, ni points, ni défilement ;
            // sa vidéo éventuelle se lance quand même toute seule (sans le son, en boucle)
            if (!reduceMotion.matches) {
                const video = diapos[0].querySelector('video');
                const facade = diapos[0].querySelector('.yt-facade');
                if (video) {
                    video.muted = true;
                    video.loop = true;
                    const lecture = video.play();
                    if (lecture && lecture.catch) lecture.catch(() => {});
                } else if (facade) {
                    lancerYoutube(facade, true);
                }
            }
            return;
        }

        const commandes = carrousel.querySelector('.carrousel-commandes');
        const points = Array.from(carrousel.querySelectorAll('.carrousel-point'));
        const boutonPrec = carrousel.querySelector('.carrousel-prec');
        const boutonSuiv = carrousel.querySelector('.carrousel-suiv');
        const boutonPause = carrousel.querySelector('.carrousel-pause');
        if (commandes) commandes.hidden = false;

        let index = 0;
        let enLecture = !reduceMotion.matches; // Choix du visiteur (bouton pause)
        let survol = false;                    // Souris au-dessus du carrousel
        let focusDedans = false;               // Focus clavier dans le carrousel
        let minuterie = null;

        /* --- Vidéos : lecture automatique (sans le son) de la diapositive affichée ---
           Le carrousel garde son rythme régulier (toutes les 5 s) : la vidéo joue
           pendant que sa diapositive est affichée, puis s'arrête quand on la quitte.
           (Les navigateurs n'autorisent la lecture automatique que sans le son.) */
        function lancerVideoAuto(diapo) {
            if (!enLecture || reduceMotion.matches) return;

            const video = diapo.querySelector('video');
            if (video) {
                video.muted = true;
                video.playsInline = true;
                video.dataset.auto = '1'; // Distingue ce lancement d'un clic du visiteur
                const lecture = video.play();
                if (lecture && lecture.catch) lecture.catch(() => { /* lecture bloquée : on reste sur l'image */ });
                return;
            }
            const facade = diapo.querySelector('.yt-facade');
            if (facade) lancerYoutube(facade, true);
        }

        /* --- Affichage d'une diapositive --- */
        function afficher(numero) {
            const precedent = index;
            index = (numero + total) % total;
            piste.style.transform = 'translateX(' + (-index * 100) + '%)';

            diapos.forEach((diapo, i) => masquerDiapo(diapo, i !== index));
            points.forEach((point, i) => {
                if (i === index) point.setAttribute('aria-current', 'true');
                else point.removeAttribute('aria-current');
            });
            if (precedent !== index) arreterVideos(diapos[precedent]);
            lancerVideoAuto(diapos[index]);

            // Images des diapositives voisines chargées à l'avance (pas d'image vide en arrivant)
            [index - 1, index + 1].forEach(n => {
                diapos[(n + total) % total].querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
            });
        }

        /* --- Défilement automatique --- */
        function actualiserDefilement() {
            const actif = enLecture && !survol && !focusDedans && !document.hidden;
            if (actif && !minuterie) {
                minuterie = setInterval(() => afficher(index + 1), DELAI_DEFILEMENT);
            } else if (!actif && minuterie) {
                clearInterval(minuterie);
                minuterie = null;
            }
            // Lecteurs d'écran : annonce des changements seulement hors défilement automatique
            piste.setAttribute('aria-live', enLecture ? 'off' : 'polite');
        }

        function relancerMinuterie() {
            if (minuterie) {
                clearInterval(minuterie);
                minuterie = null;
            }
            actualiserDefilement();
        }

        function changerLecture(lecture) {
            enLecture = lecture;
            if (boutonPause) {
                boutonPause.classList.toggle('en-pause', !lecture);
                boutonPause.setAttribute('aria-label', lecture ? 'Arrêter le défilement automatique' : 'Démarrer le défilement automatique');
            }
            actualiserDefilement();
        }

        // Réglage "Réduire les animations" : pas de défilement automatique ni de bouton pause
        function appliquerPreferenceMouvement() {
            if (boutonPause) boutonPause.hidden = reduceMotion.matches;
            changerLecture(!reduceMotion.matches);
        }

        /* --- Boutons --- */
        if (boutonPrec) boutonPrec.addEventListener('click', () => { afficher(index - 1); relancerMinuterie(); });
        if (boutonSuiv) boutonSuiv.addEventListener('click', () => { afficher(index + 1); relancerMinuterie(); });
        if (boutonPause) boutonPause.addEventListener('click', () => changerLecture(!enLecture));
        points.forEach((point, i) => point.addEventListener('click', () => { afficher(i); relancerMinuterie(); }));

        /* --- Pause au survol, au focus, onglet masqué --- */
        carrousel.addEventListener('mouseenter', () => { survol = true; actualiserDefilement(); });
        carrousel.addEventListener('mouseleave', () => { survol = false; actualiserDefilement(); });
        carrousel.addEventListener('focusin', () => { focusDedans = true; actualiserDefilement(); });
        carrousel.addEventListener('focusout', (e) => {
            if (!carrousel.contains(e.relatedTarget)) {
                focusDedans = false;
                actualiserDefilement();
            }
        });
        document.addEventListener('visibilitychange', actualiserDefilement);

        // Une vidéo lancée dans une diapositive arrête le défilement automatique
        piste.addEventListener('click', (e) => {
            if (e.target.closest('.yt-facade')) changerLecture(false);
        });
        piste.addEventListener('play', (e) => {
            if (e.target.dataset && e.target.dataset.auto === '1') return; // Lancement automatique
            changerLecture(false);
        }, true);

        /* --- Glisser au doigt (ou à la souris) : pointer events --- */
        let depart = null;       // Position du doigt au début du geste
        let decalage = 0;        // Déplacement horizontal en pixels
        let glisse = false;      // Le geste est un glissement horizontal
        let ignorerClic = false; // Un glissement ne doit pas ouvrir le lien survolé

        fenetre.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            depart = { x: e.clientX, y: e.clientY, id: e.pointerId };
            decalage = 0;
            glisse = false;
        });

        fenetre.addEventListener('pointermove', (e) => {
            if (!depart || e.pointerId !== depart.id) return;
            decalage = e.clientX - depart.x;
            const vertical = e.clientY - depart.y;
            if (!glisse && Math.abs(decalage) > 8 && Math.abs(decalage) > Math.abs(vertical)) {
                glisse = true;
                piste.classList.add('en-glisse');
                try { fenetre.setPointerCapture(e.pointerId); } catch (erreur) { /* pointeur déjà relâché */ }
            }
            if (glisse) {
                piste.style.transform = 'translateX(calc(' + (-index * 100) + '% + ' + decalage + 'px))';
            }
        });

        function finGeste(annule) {
            if (!depart) return;
            depart = null;
            if (!glisse) return;
            piste.classList.remove('en-glisse');
            ignorerClic = true;
            setTimeout(() => { ignorerClic = false; }, 0);

            const seuil = Math.max(50, fenetre.clientWidth * 0.15);
            if (!annule && Math.abs(decalage) > seuil) {
                afficher(index + (decalage < 0 ? 1 : -1));
            } else {
                afficher(index); // Pas assez loin : retour à la diapositive actuelle
            }
            glisse = false;
            relancerMinuterie();
        }
        fenetre.addEventListener('pointerup', () => finGeste(false));
        fenetre.addEventListener('pointercancel', () => finGeste(true));
        // Capture perdue par la fenêtre elle-même (pas l'événement remonté d'une image
        // enfant, qui perd sa capture implicite au début du glissement tactile)
        fenetre.addEventListener('lostpointercapture', (e) => {
            if (e.target === fenetre) finGeste(false);
        });

        // Phase de capture : bloque le clic qui suit un glissement (lien, vidéo)
        fenetre.addEventListener('click', (e) => {
            if (ignorerClic) {
                e.preventDefault();
                e.stopPropagation();
                ignorerClic = false;
            }
        }, true);
        // Pas de "fantôme" d'image ou de lien déplacé à la souris
        fenetre.addEventListener('dragstart', (e) => e.preventDefault());

        /* --- Démarrage --- */
        appliquerPreferenceMouvement();
        afficher(0); // Lance aussi la vidéo de la 1re diapositive s'il y en a une
        if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', appliquerPreferenceMouvement);
    }

    document.querySelectorAll('[data-carrousel]').forEach(initialiserCarrousel);

    /* ==========================================================================
       3. VISIONNEUSE (photos de la galerie, page evenement.php)
       ========================================================================== */
    const visionneuse = document.getElementById('visionneuse');
    const vignettes = Array.from(document.querySelectorAll('[data-visionneuse]'));

    if (visionneuse && vignettes.length) {
        const image = visionneuse.querySelector('.visionneuse-image');
        const legende = visionneuse.querySelector('.visionneuse-legende');
        const compteur = visionneuse.querySelector('.visionneuse-compteur');
        const boutonFermer = visionneuse.querySelector('.visionneuse-fermer');
        const boutonPrec = visionneuse.querySelector('.visionneuse-prec');
        const boutonSuiv = visionneuse.querySelector('.visionneuse-suiv');
        const scene = visionneuse.querySelector('.visionneuse-scene');
        const total = vignettes.length;
        let position = 0;
        let declencheur = null; // Vignette à qui rendre le focus à la fermeture

        function montrer(numero) {
            position = (numero + total) % total;
            const vignette = vignettes[position];
            image.src = vignette.dataset.src;
            image.alt = vignette.dataset.alt || '';
            legende.textContent = vignette.dataset.legende || '';
            legende.hidden = !vignette.dataset.legende;
            compteur.textContent = 'Photo ' + (position + 1) + ' sur ' + total;

            // Photo suivante préchargée : passage instantané
            if (total > 1) {
                const suivante = new Image();
                suivante.src = vignettes[(position + 1) % total].dataset.src;
            }
        }

        function ouvrir(numero, vignette) {
            declencheur = vignette;
            montrer(numero);
            boutonPrec.hidden = total < 2;
            boutonSuiv.hidden = total < 2;
            visionneuse.hidden = false;
            document.body.style.overflow = 'hidden'; // Pas de défilement de la page derrière
            boutonFermer.focus();
        }

        function fermer() {
            visionneuse.hidden = true;
            document.body.style.overflow = '';
            if (declencheur && document.contains(declencheur)) declencheur.focus();
            declencheur = null;
        }

        vignettes.forEach((vignette, i) => vignette.addEventListener('click', () => ouvrir(i, vignette)));
        boutonFermer.addEventListener('click', fermer);
        boutonPrec.addEventListener('click', () => montrer(position - 1));
        boutonSuiv.addEventListener('click', () => montrer(position + 1));

        // Clic sur le fond (en dehors de la photo et des boutons) : fermeture
        // (sauf juste après un glissement, qui se termine parfois sur le fond)
        let apresGlisse = false;
        visionneuse.addEventListener('click', (e) => {
            if (apresGlisse) {
                apresGlisse = false;
                return;
            }
            if (e.target === visionneuse || e.target === scene) fermer();
        });

        document.addEventListener('keydown', (e) => {
            if (visionneuse.hidden) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                fermer();
            } else if (e.key === 'ArrowLeft' && total > 1) {
                e.preventDefault();
                montrer(position - 1);
            } else if (e.key === 'ArrowRight' && total > 1) {
                e.preventDefault();
                montrer(position + 1);
            } else if (e.key === 'Tab') {
                // Piège de focus : Tab / Maj+Tab restent dans la visionneuse
                const boutons = [boutonFermer, boutonPrec, boutonSuiv].filter(b => !b.hidden);
                const premier = boutons[0];
                const dernier = boutons[boutons.length - 1];
                if (!visionneuse.contains(document.activeElement)) {
                    e.preventDefault();
                    premier.focus();
                } else if (e.shiftKey && document.activeElement === premier) {
                    e.preventDefault();
                    dernier.focus();
                } else if (!e.shiftKey && document.activeElement === dernier) {
                    e.preventDefault();
                    premier.focus();
                }
            }
        });

        // Glisser au doigt sur la photo : suivante / précédente
        let departX = null;
        scene.addEventListener('pointerdown', (e) => { departX = e.clientX; });
        scene.addEventListener('pointerup', (e) => {
            if (departX === null || total < 2) return;
            const decalage = e.clientX - departX;
            departX = null;
            if (Math.abs(decalage) > 50) {
                apresGlisse = true;
                setTimeout(() => { apresGlisse = false; }, 0);
                montrer(position + (decalage < 0 ? 1 : -1));
            }
        });
        scene.addEventListener('pointercancel', () => { departX = null; });
        image.addEventListener('dragstart', (e) => e.preventDefault());
    }

    /* ==========================================================================
       4. PROTECTION DES PHOTOS ET VIDÉOS DES ÉVÉNEMENTS
       Rend le téléchargement direct plus difficile : pas de menu du clic droit
       ("Enregistrer l'image sous..."), pas de glisser-déposer, pas de bouton
       de téléchargement dans les lecteurs vidéo. (Le serveur refuse aussi
       l'accès direct aux fichiers : voir medias/evenements/.htaccess.)
       Une capture d'écran reste toujours possible : aucune protection web
       ne peut l'empêcher.
       ========================================================================== */
    const MEDIAS_PROTEGES = '.evt-visuel, .carrousel img, .carrousel video, .evt-galerie img, .evt-galerie video, .visionneuse img, .yt-facade img';

    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest(MEDIAS_PROTEGES)) e.preventDefault();
    });
    document.addEventListener('dragstart', (e) => {
        if (e.target.closest(MEDIAS_PROTEGES)) e.preventDefault();
    });
    document.querySelectorAll('video').forEach(video => {
        video.setAttribute('controlslist', 'nodownload noremoteplayback');
        video.disablePictureInPicture = true;
    });
})();
