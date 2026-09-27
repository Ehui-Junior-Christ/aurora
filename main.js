document.addEventListener('DOMContentLoaded', () => {
    // Réglage système "Réduire les animations" : on respecte le choix du visiteur
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ==========================================================================
       1. SCROLL REVEAL ANIMATIONS (Intersection Observer)
       Sans animation (réglage système ou navigateur ancien) : tout est affiché.
       ========================================================================== */
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
        revealElements.forEach(el => el.classList.add('active'));
    } else {
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    observer.unobserve(entry.target); // Animate only once
                }
            });
        }, {
            root: null,
            threshold: 0.1,
            rootMargin: "0px 0px -50px 0px"
        });

        revealElements.forEach(el => revealObserver.observe(el));
    }

    /* ==========================================================================
       2. HEADER SHRINK ON SCROLL
       ========================================================================== */
    const header = document.getElementById('header');

    if (header) {
        const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 50);
        window.addEventListener('scroll', updateHeader, { passive: true });
        updateHeader(); // Page rechargée au milieu : état correct dès l'arrivée
    }

    /* ==========================================================================
       3. MODALS & DRAWERS LOGIC (fenêtres accessibles)
       - à l'ouverture : le focus va dans la fenêtre (premier champ)
       - Tab / Maj+Tab restent dans la fenêtre (piège de focus)
       - Échap, la croix ou un clic sur le fond ferment la fenêtre
       - à la fermeture : le focus revient sur le bouton qui l'avait ouverte
       ========================================================================== */
    const overlay = document.getElementById('overlay');
    const modalTriggers = document.querySelectorAll('.modal-trigger');
    const closeButtons = document.querySelectorAll('.modal-close');
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    let activeModal = null;
    let lastTrigger = null; // Élément à qui rendre le focus à la fermeture

    function focusableIn(container) {
        return Array.from(container.querySelectorAll(FOCUSABLE))
            .filter(el => el.offsetParent !== null || el === document.activeElement);
    }

    function openModal(modalId, trigger) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        if (activeModal && activeModal !== modal) closeModal(false);

        lastTrigger = trigger || document.activeElement;
        modal.classList.add('active');
        if (overlay) overlay.classList.add('active');
        activeModal = modal;
        document.body.style.overflow = 'hidden'; // Prevent background scrolling

        // Focus sur le premier champ (sinon sur la fenêtre elle-même).
        // Court délai : la fenêtre doit être visible pour recevoir le focus.
        setTimeout(() => {
            if (activeModal !== modal) return;
            const first = modal.querySelector('input:not([type="hidden"]), select, textarea') || focusableIn(modal)[0];
            (first || modal).focus();
        }, 60);
    }

    function closeModal(restoreFocus = true) {
        if (!activeModal) return;
        activeModal.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        activeModal = null;
        document.body.style.overflow = '';
        if (restoreFocus && lastTrigger && document.contains(lastTrigger)) {
            // Si le déclencheur était dans le menu mobile (désormais fermé), on rend
            // le focus au bouton hamburger, toujours visible
            const target = lastTrigger.offsetParent !== null ? lastTrigger : document.getElementById('hamburger');
            if (target) target.focus();
        }
        lastTrigger = null;
    }

    modalTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = trigger.getAttribute('data-target');
            openModal(targetId, trigger);
        });
        // Indique aux lecteurs d'écran que le bouton ouvre une fenêtre
        trigger.setAttribute('aria-haspopup', 'dialog');
    });

    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => closeModal());
    });

    if (overlay) overlay.addEventListener('click', () => closeModal());

    document.addEventListener('keydown', (e) => {
        // Close on Escape key (fenêtre ouverte, sinon menu mobile)
        if (e.key === 'Escape') {
            if (activeModal) {
                closeModal();
            } else if (mobileNav && mobileNav.classList.contains('is-open')) {
                closeMobileNav(true);
            }
            return;
        }
        // Piège de focus : Tab ne sort pas de la fenêtre ouverte
        if (e.key === 'Tab' && activeModal) {
            const items = focusableIn(activeModal);
            if (!items.length) { e.preventDefault(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === activeModal)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            } else if (!activeModal.contains(document.activeElement)) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    /* ==========================================================================
       4. SMOOTH SCROLLING FOR NAV LINKS
       Le décalage du header fixe est géré en CSS (scroll-margin-top).
       ========================================================================== */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetEl = document.querySelector(targetId);
            if (targetEl) {
                e.preventDefault();
                targetEl.scrollIntoView({
                    behavior: reduceMotion.matches ? 'auto' : 'smooth',
                    block: 'start'
                });
                // Le focus clavier suit le défilement (lien "Aller au contenu", menu)
                if (!targetEl.hasAttribute('tabindex')) targetEl.setAttribute('tabindex', '-1');
                targetEl.focus({ preventScroll: true });
                if (history.replaceState) history.replaceState(null, '', targetId);
            }
        });
    });

    /* ==========================================================================
       5. HAMBURGER MOBILE MENU
       ========================================================================== */
    const hamburger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobile-nav');

    function closeMobileNav(returnFocus) {
        if (!hamburger || !mobileNav) return;
        hamburger.classList.remove('is-open');
        mobileNav.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Ouvrir le menu');
        mobileNav.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (returnFocus) hamburger.focus();
    }

    if (hamburger && mobileNav) {
        hamburger.addEventListener('click', () => {
            const isOpen = hamburger.classList.toggle('is-open');
            mobileNav.classList.toggle('is-open', isOpen);
            hamburger.setAttribute('aria-expanded', String(isOpen));
            hamburger.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
            mobileNav.setAttribute('aria-hidden', String(!isOpen));
            document.body.style.overflow = isOpen ? 'hidden' : '';
            if (isOpen) {
                const firstLink = mobileNav.querySelector('a, button');
                if (firstLink) firstLink.focus();
            }
        });

        // Close menu when clicking a nav link
        mobileNav.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', () => closeMobileNav(false));
        });

        // Close menu when a modal is triggered from inside
        mobileNav.querySelectorAll('.modal-trigger').forEach(btn => {
            btn.addEventListener('click', () => closeMobileNav(false));
        });

        // Menu ouvert puis fenêtre agrandie au-delà du point de rupture : on le referme
        window.matchMedia('(min-width: 1201px)').addEventListener('change', (e) => {
            if (e.matches) closeMobileNav(false);
        });
    }

    /* ==========================================================================
       6. INTERACTIVE ELEMENTS (Toasts & Forms) - CSP Compliant
       Les formulaires sont envoyés au PHP (attribut "action") sans recharger
       la page. Le serveur répond en JSON : { succes: true/false, message: "..." }
       et parfois { redirection: "adresse" } : le visiteur y est alors envoyé
       (ex. après la connexion à l'espace client).
       ========================================================================== */
    const toast = document.getElementById('toast');
    const toastSearch = document.getElementById('toast-search');
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');

    // Affiche une notification. isError = true : version rouge (échec).
    // Les erreurs restent affichées plus longtemps (le temps de les lire).
    function showToast(toastEl, message, isError = false) {
        if (!toastEl) return;
        const messageEl = toastEl.querySelector('.toast-message');
        if (message && messageEl) messageEl.textContent = message;
        toastEl.classList.toggle('toast-erreur', isError);
        toastEl.setAttribute('role', isError ? 'alert' : 'status');
        toastEl.setAttribute('aria-live', isError ? 'assertive' : 'polite');
        toastEl.classList.add('show');
        clearTimeout(toastEl._timer); // Un nouveau message relance le délai
        toastEl._timer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, isError ? 7000 : 5000);
    }

    // Bouton "×" des notifications
    document.querySelectorAll('.toast-fermer').forEach(btn => {
        btn.addEventListener('click', () => {
            const toastEl = btn.closest('.toast');
            clearTimeout(toastEl._timer);
            toastEl.classList.remove('show');
        });
    });

    // Envoie un formulaire au fichier PHP indiqué dans son attribut "action"
    async function sendForm(form) {
        const data = new FormData(form); // Inclut aussi les fichiers (CV)
        if (csrfMeta) data.append('csrf_token', csrfMeta.content);

        try {
            const response = await fetch(form.getAttribute('action'), {
                method: 'POST',
                body: data,
                credentials: 'same-origin'
            });
            return await response.json();
        } catch (error) {
            return { succes: false, message: 'Connexion au serveur impossible. Réessayez.' };
        }
    }

    // État "chargement" du bouton d'envoi : désactivé + roue + libellé "Envoi en cours…"
    function setLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.dataset.libelle = btn.innerHTML; // Libellé d'origine (avec icône éventuelle)
            btn.disabled = true;
            btn.classList.add('is-loading');
            btn.setAttribute('aria-busy', 'true');
            btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> Envoi en cours…';
        } else {
            btn.disabled = false;
            btn.classList.remove('is-loading');
            btn.removeAttribute('aria-busy');
            if (btn.dataset.libelle !== undefined) {
                btn.innerHTML = btn.dataset.libelle;
                delete btn.dataset.libelle;
            }
        }
    }

    // Branche un formulaire : envoi, bouton en chargement pendant l'envoi, message
    function handleForm(form, toastEl, onSuccess) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('[type="submit"]');
            if (submitBtn && submitBtn.disabled) return; // Double clic : un seul envoi
            setLoading(submitBtn, true);

            const result = await sendForm(form);
            const ok = result && result.succes === true;
            showToast(toastEl, result && result.message, !ok);

            // Signale l'envoi réussi (statistiques de visite : assets/js/consentement.js).
            // Émis avant onSuccess, qui peut vider le formulaire.
            if (ok) document.dispatchEvent(new CustomEvent('cafpm:formulaire-envoye', { detail: { form, result } }));

            if (ok && onSuccess) onSuccess(result);

            // Le serveur peut demander une redirection (ex. connexion -> espace-client/) :
            // court délai pour laisser le temps de lire le message, bouton laissé désactivé
            if (ok && result.redirection) {
                setTimeout(() => { window.location.href = result.redirection; }, 1200);
                return;
            }
            setLoading(submitBtn, false);
        });
    }

    // Search form -> api/recherche.php : affiche le nombre de profils disponibles
    // et les cartes des profils (anonymes) sous la barre de recherche
    const searchForm = document.querySelector('.search-form');
    const resultats = document.getElementById('resultats-recherche');
    if (searchForm) handleForm(searchForm, toastSearch, (result) => afficherProfils(result));

    // Crée un élément HTML avec une classe et un texte (textContent = aucun risque XSS)
    function creer(tag, classe, texte) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texte !== undefined) el.textContent = texte;
        return el;
    }

    function afficherProfils(result) {
        if (!resultats) return;
        const grille = document.getElementById('resultats-grille');
        const titre = document.getElementById('resultats-titre');
        const plus = document.getElementById('resultats-plus');
        const profils = Array.isArray(result.profils) ? result.profils : [];
        const total = Number(result.total) || 0;

        titre.textContent = total === 0
            ? 'Aucun profil disponible pour ces critères'
            : total + (total > 1 ? ' profils disponibles' : ' profil disponible');

        grille.replaceChildren();
        profils.forEach((p) => {
            const carte = creer('article', 'profil-carte');
            carte.append(creer('span', 'profil-numero', 'Profil n° ' + p.id));
            carte.append(creer('h4', 'profil-metier', p.metier));
            carte.append(creer('p', 'profil-domaine', p.domaine));

            const infos = creer('ul', 'profil-infos');
            [['Expérience', p.experience], ['Disponibilité', p.disponibilite], ['Ville', p.localisation]]
                .forEach(([libelle, valeur]) => {
                    const li = creer('li');
                    li.append(creer('span', 'profil-libelle', libelle), creer('strong', '', valeur));
                    infos.append(li);
                });
            carte.append(infos);

            const bouton = creer('button', 'btn btn-secondary profil-demander', 'Demander ce profil');
            bouton.type = 'button';
            bouton.dataset.profil = p.metier + ' (profil n° ' + p.id + ')';
            carte.append(bouton);
            grille.append(carte);
        });

        // Plus de résultats que de cartes affichées
        plus.hidden = total <= profils.length;
        plus.textContent = 'Et ' + (total - profils.length) + ' autre(s) profil(s) : affinez votre recherche ou déposez votre besoin.';

        resultats.hidden = false;
        resultats.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }

    // "Demander ce profil" : ouvre "Déposer un besoin" avec le profil déjà rempli
    if (resultats) {
        resultats.addEventListener('click', (e) => {
            const bouton = e.target.closest('.profil-demander');
            if (!bouton) return;
            const champProfil = document.getElementById('demande-profil');
            if (champProfil) champProfil.value = bouton.dataset.profil;
            openModal('drawer-form', bouton);
        });
    }

    // Newsletter form -> api/newsletter.php
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) handleForm(newsletterForm, toast, () => newsletterForm.reset());

    // Interactive forms (Modals / Drawers / page Contact) -> api/connexion.php, demande.php, candidat.php, contact.php
    const interactiveForms = document.querySelectorAll('.interactive-form');
    interactiveForms.forEach(form => {
        handleForm(form, toast, () => {
            form.reset();
            // Ferme la fenêtre seulement si le formulaire est dans une fenêtre
            if (form.closest('.modal, .drawer')) closeModal();
        });
    });
});
