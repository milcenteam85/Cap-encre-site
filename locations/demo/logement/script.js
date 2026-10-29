/* =========================================================================
   La Maison dans les Dunes — trois petits comportements, aucune bibliothèque.
   Le site fonctionne entièrement sans ce fichier : il n'ajoute que du confort.
   ========================================================================= */
(function () {
  'use strict';

  /* 1. Le bouton « Demander une disponibilité » place le curseur dans le
        premier champ du formulaire, pour éviter un clic de plus. */
  var champs = document.querySelectorAll('[data-cta-contact]');
  champs.forEach(function (bouton) {
    bouton.addEventListener('click', function () {
      var premier = document.getElementById('nom');
      if (!premier) return;
      window.setTimeout(function () { premier.focus({ preventScroll: true }); }, 650);
    });
  });

  /* 2. Le formulaire n'est relié à aucun service pour le moment : on le dit
        franchement au visiteur au lieu de laisser croire à un envoi réussi.
        Pour l'activer : ajouter data-endpoint="https://..." sur la balise
        <form>. Voir le README, section « Brancher le formulaire ». */
  var formulaire = document.getElementById('form-dispo');
  if (formulaire) {
    formulaire.addEventListener('submit', function (evenement) {
      evenement.preventDefault();

      var adresse = formulaire.getAttribute('data-endpoint');
      if (adresse) {
        formulaire.setAttribute('action', adresse);
        formulaire.submit();  // envoi réel vers le service configuré
        return;
      }

      var message = document.getElementById('form-message');
      if (!message) return;
      message.hidden = false;
      message.focus();
    });
  }

  /* 3. Année automatique dans le pied de page. */
  var annee = document.getElementById('annee');
  if (annee) annee.textContent = String(new Date().getFullYear());

  /* 4. Visionneuse : un clic sur une photo l'agrandit en plein écran.
        On se sert de <dialog>, un élément natif du navigateur : aucune
        bibliothèque, la touche Échap fonctionne toute seule, et le focus
        reste piégé dans la fenêtre. Le site reste utilisable sans ce bloc :
        les photos s'affichent normalement, simplement sans agrandissement. */
  var visionneuse = document.getElementById('visionneuse');
  var imagePleine = document.getElementById('visionneuse-image');
  var legendePleine = document.getElementById('visionneuse-legende');

  if (visionneuse && imagePleine && typeof visionneuse.showModal === 'function') {
    document.querySelectorAll('.cadre[data-plein]').forEach(function (cadre) {
      cadre.addEventListener('click', function () {
        var vignette = cadre.querySelector('img');

        imagePleine.src = cadre.getAttribute('data-plein');
        imagePleine.alt = vignette ? vignette.alt : '';
        /* La légende de la fenêtre plein écran, c'est l'ALT de l'image : le
           texte déjà écrit pour les lecteurs d'écran, réemployé — pas une
           légende inventée pour l'occasion. Les <figcaption> de la galerie ont
           disparu (« La piscine », « La cuisine » : on le voit très bien), mais
           dans une fenêtre plein écran, une ligne aide à se repérer. */
        legendePleine.textContent = vignette ? (vignette.alt || '') : '';
        visionneuse.showModal();
      });
    });

    var fermer = document.getElementById('visionneuse-fermer');
    if (fermer) fermer.addEventListener('click', function () { visionneuse.close(); });

    /* Un clic sur le fond sombre, hors de la photo, ferme aussi. */
    visionneuse.addEventListener('click', function (evenement) {
      if (evenement.target === visionneuse) visionneuse.close();
    });
  }

    /* 5. DES COLONNES EN PIXELS ENTIERS — pour que les filets soient nets.

        La grille des photos se divise en trois. Sur un ecran de 1280 px, chaque
        colonne fait 426,33 px : un nombre a virgule. Un filet dessine sur une
        position a virgule est arrondi par le navigateur tantot a un pixel
        d'ecran, tantot a deux — et l'un des filets parait plus epais que les
        autres. C'est exactement ce qui se voyait.

        On arrondit la largeur de la grille au multiple de 3 inferieur : les
        trois colonnes tombent alors sur des pixels entiers, tous les filets
        sont dessines pareil.

        Le site reste entier sans ce bloc : la grille s'affiche normalement, les
        filets sont seulement un peu moins nets. */
  function colonnesEntieres() {
    document.querySelectorAll('.pg, .pg-fin').forEach(function (g) {
      g.style.width = '';                                  /* on repart du naturel */
      var b = g.getBoundingClientRect().width;
      /* Le conteneur porte un filet de 1 px a droite, DANS sa largeur : la
         place reellement partagee entre les trois colonnes est b - 1. C'est
         ce nombre-la qu'il faut rendre divisible par 3, puis on rajoute le
         filet. Sans ce +1, les colonnes restaient a 425,67 px. */
      var w = Math.floor((b - 1) / 3) * 3 + 1;
      g.style.width = w + 'px';
    });
  }
  if (document.querySelector('.pg')) {
    colonnesEntieres();
    var minuteur;
    window.addEventListener('resize', function () {
      clearTimeout(minuteur);
      minuteur = setTimeout(colonnesEntieres, 150);
    });
  }

/* 5. BARRE D'APPEL SUR TÉLÉPHONE — et seulement quand elle sert.

        Elle n'existe PAS au chargement : elle est créée ici. Si ce fichier ne
        se charge pas, la barre n'existe pas du tout et le site reste
        utilisable. C'est voulu : un élément caché en CSS qui apparaîtrait de
        travers serait pire que pas de barre du tout.

        Elle apparaît après UNE HAUTEUR D'ÉCRAN de défilement — donc quand la
        photo d'accueil a quitté l'écran — et disparaît dès que la section
        contact arrive. Tant qu'on est descendu au moins jusqu'au contact,
        celui-ci est au-dessus du bas de l'écran : c'est ce qui la fait
        disparaître pour de bon sur le formulaire et le pied de page. Si le
        visiteur remonte au-dessus du contact, elle revient : elle suit la
        position, elle ne garde aucune mémoire de ce qu'elle a vu.

        Le seuil est une hauteur d'écran, jamais un nombre de pixels : sur un
        petit téléphone comme sur un grand, le comportement est identique.

        Le numéro est repris du premier lien tel: de la section contact, qui
        est déjà la source de vérité du site : il n'y a donc qu'un seul endroit
        à changer. Sans ce lien, la barre ne se crée pas.

        Rien au-dessus de 768 px de large : sur ordinateur, jamais.
        Pour la désactiver : voir le README, section « Barre d'appel ». */
  var barreAppel = null;
  var barreVoulue = false;
  var minuterieBarre = null;

  function barreDoitEtreLa() {
    if (window.innerWidth >= 768) return false;
    if ((window.scrollY || 0) < window.innerHeight) return false;

    /* La section contact a-t-elle atteint l'écran — ou l'a-t-elle dépassé ?
       Dans les deux cas, elle est au-dessus du bas de l'écran. C'est ce qui
       fait disparaître la barre sur le formulaire et le pied de page, et ce
       qui la fait revenir si le visiteur remonte au-dessus du contact. */
    var contact = document.getElementById('contact');
    if (contact && contact.getBoundingClientRect().top < window.innerHeight) return false;

    return true;
  }

  function majBarre() {
    var voulue = barreDoitEtreLa();

    if (voulue && !barreAppel) {
      var contact = document.getElementById('contact');
      var numero = contact && contact.querySelector('a[href^="tel:"]');
      if (!numero) { barreVoulue = false; return; }   // pas de numéro, pas de barre

      barreAppel = document.createElement('a');
      barreAppel.className = 'barre-appel';
      barreAppel.href = numero.getAttribute('href');
      barreAppel.textContent = 'Appeler — ' + numero.textContent.trim();
      document.body.appendChild(barreAppel);
      void barreAppel.offsetHeight;      // la position de départ est prise en
                                         // compte avant le glissement
    }

    if (voulue === barreVoulue) return;  // rien à changer : aucun clignotement
    barreVoulue = voulue;

    if (minuterieBarre) { window.clearTimeout(minuterieBarre); minuterieBarre = null; }

    if (voulue) { barreAppel.classList.add('visible'); return; }

    barreAppel.classList.remove('visible');
    var aRetirer = barreAppel;
    minuterieBarre = window.setTimeout(function () {
      if (barreVoulue || !aRetirer.parentNode) return;
      aRetirer.parentNode.removeChild(aRetirer);
      if (barreAppel === aRetirer) barreAppel = null;
      minuterieBarre = null;
    }, 200);
  }

  /* Le défilement est fréquent : on ne recalcule qu'une fois par image
     affichée, ce qui évite tout tremblement pendant un défilement rapide. */
  var attenteBarre = false;
  window.addEventListener('scroll', function () {
    if (attenteBarre) return;
    attenteBarre = true;
    window.requestAnimationFrame(function () { attenteBarre = false; majBarre(); });
  }, { passive: true });

  window.addEventListener('resize', majBarre);
  majBarre();                            // au chargement, en haut : rien

  /* 6. LE CARROUSEL DE L'ACCUEIL — un fondu, rien d'autre.

        Trois photos se remplacent toutes les 6 secondes, en 1,2 s de fondu.
        Aucun zoom, aucun déplacement : uniquement l'opacité. C'est la seule
        animation de la page.

        SANS JAVASCRIPT, la première image reste affichée : la classe
        « est-visible » est écrite dans le HTML, et ce script ne fait que la
        déplacer d'une photo à l'autre. Le carrousel est un bonus.

        Si le visiteur a demandé « moins d'animations » dans les réglages de
        son système, on ne lance rien : la première photo reste, immobile. */
  var photos = document.querySelectorAll('.hero-slide');
  var mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)');
  /* Rempli juste en dessous, appelé par l'ouverture (bloc 7) — ou tout de
     suite s'il n'y a pas d'ouverture à jouer. */
  var demarrerCarrousel = null;

  if (photos.length > 1 && !mouvementReduit.matches) {
    var conteneurPhotos = document.querySelector('.hero-images');
    var photoCourante = 0;
    var minuteriePhotos = null;
    var carrouselDemarre = false;

    function montrerPhoto(n) {
      photos[photoCourante].classList.remove('est-visible');
      photos[n].classList.add('est-visible');
      photoCourante = n;
    }

    function photoSuivante() {
      montrerPhoto((photoCourante + 1) % photos.length);
    }

    function lancerPhotos() {
      if (minuteriePhotos) return;
      carrouselDemarre = true;
      minuteriePhotos = window.setInterval(photoSuivante, 6000);
    }

    function arreterPhotos() {
      window.clearInterval(minuteriePhotos);
      minuteriePhotos = null;
    }

    /* Le fondu ne s'active qu'ici : au chargement, la première photo doit
       apparaître d'un coup, sans transition. */
    if (conteneurPhotos) conteneurPhotos.classList.add('anime');

    demarrerCarrousel = lancerPhotos;

    /* Un onglet laissé en arrière-plan ne doit pas avoir fait défiler trois
       photos au retour : on met en pause quand la page n'est pas visible. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) arreterPhotos();
      else if (carrouselDemarre) lancerPhotos();
    });
  }

  /* ---------------------------------------------------------------------
     8. L'OUVERTURE — le monogramme qui se dessine.

     Elle n'existe PAS dans le HTML : elle est créée ici. Si ce fichier ne se
     charge pas, il n'y a pas d'ouverture du tout et le site s'affiche
     immédiatement. C'est la règle première : jamais bloquant.

     Trois garde-fous, dans l'ordre d'importance :
       — une minuterie de sécurité la retire au bout de 3 s quoi qu'il
         arrive, même si une animation ne se terminait jamais. Un écran
         d'ouverture bloqué, c'est un site mort.
       — jamais deux fois dans la même visite (sessionStorage).
       — pas du tout si le visiteur a demandé « moins d'animations ».

     Durées : 1,2 s de dessin + 0,4 s pour le nom + 0,6 s de retrait = 2,2 s.
     Le carrousel démarre pendant le retrait, pour que l'arrivée soit continue.

     POUR LA DÉSACTIVER : mettre `active: false` ci-dessous. Voir aussi le
     README, section « L'ouverture ».
     --------------------------------------------------------------------- */
  var OUVERTURE = {
    active: true,                 // false = aucun écran d'ouverture, jamais
    initiales: 'MD',              // les initiales dans le cercle
    nom: 'Bienvenue',             // le premier mot, sous le monogramme
    suite: 'à la maison dans les dunes'   // apparaît une seconde plus tard
  };

  var SVG = 'http://www.w3.org/2000/svg';

  /* Le monogramme : un cercle et les initiales, tous deux au trait. Il est
     minuscule, et c'est le MÊME dessin qui sert dans l'en-tête. */
  function dessinerMonogramme() {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    /* La classe est indispensable : sans elle, les règles « au trait » ne
       s'appliquent pas et le cercle se remplit de noir. */
    svg.setAttribute('class', 'monogramme');

    var cercle = document.createElementNS(SVG, 'circle');
    cercle.setAttribute('cx', '60');
    cercle.setAttribute('cy', '60');
    cercle.setAttribute('r', '54');
    cercle.setAttribute('class', 'mono-trait mono-cercle');
    svg.appendChild(cercle);

    var lettres = document.createElementNS(SVG, 'text');
    lettres.setAttribute('x', '60');
    lettres.setAttribute('y', '60');
    lettres.setAttribute('text-anchor', 'middle');
    lettres.setAttribute('dominant-baseline', 'central');
    lettres.setAttribute('class', 'mono-trait mono-initiales');
    lettres.textContent = OUVERTURE.initiales;
    svg.appendChild(lettres);

    return svg;
  }

  /* LE MONOGRAMME DE L'EN-TÊTE A ÉTÉ RETIRÉ, sur demande du client : le nom
     suffit. Le monogramme ne vit plus que dans l'écran d'ouverture. */

  /* Sans JavaScript, la classe « avant-ouverture » n'est jamais posée : le
     site s'affiche normalement. Mais si ce fichier se charge, il faut la
     retirer, sinon la page resterait cachée. */
  function leverLeVoileDAttente() {
    var racine = document.documentElement;
    racine.className = racine.className.replace(/\s*avant-ouverture\s*/, ' ').trim();
  }

  function demarrerLeSite() {
    leverLeVoileDAttente();
    if (demarrerCarrousel) demarrerCarrousel();
  }

  var ouvertureDejaVue = false;
  try {
    ouvertureDejaVue = window.sessionStorage.getItem('ouverture-vue') === '1';
  } catch (e) {
    /* Navigation privée : on ne peut pas se souvenir, on la jouera. */
  }

  /* ?ouverture=1 REJOUE L'ÉCRAN D'OUVERTURE.
     Elle ne se joue qu'une fois par onglet : c'est voulu, sinon elle
     retarderait chaque visite. Mais quand on veut la revoir — pour vérifier un
     réglage, ou la montrer à quelqu'un — on ajoute ?ouverture=1 à l'adresse. */
  if (/[?&]ouverture=1/.test(window.location.search)) ouvertureDejaVue = false;

  /* Tout est chronométré depuis l'ARRIVÉE sur la page, pas depuis le
     chargement de ce script. Sans cela, une connexion lente décalerait tout :
     l'ouverture durerait plus de 2,5 s pour le visiteur, alors que le dessin
     ferait toujours 2,2 s sur le papier. */
  var arriveeSurLaPage = window.performance.now();
  function tempsRestant(cible) {
    return Math.max(0, Math.round(cible - arriveeSurLaPage));
  }

  if (!OUVERTURE.active || ouvertureDejaVue || mouvementReduit.matches) {
    demarrerLeSite();
  } else if (arriveeSurLaPage > 1200) {
    /* La page a mis plus d'une seconde à devenir interactive : le visiteur a
       déjà vu quelque chose. Une ouverture tronquée serait pire que pas
       d'ouverture du tout. On passe directement au site. */
    window.__ouverture = {
      ignoree: true,
      raison: 'page trop lente à devenir interactive',
      arrivee: Math.round(arriveeSurLaPage)
    };
    demarrerLeSite();
  } else {
    try { window.sessionStorage.setItem('ouverture-vue', '1'); } catch (e) {}

    var debutOuverture = window.performance.now();

    var ecran = document.createElement('div');
    ecran.className = 'ouverture';
    var interieur = document.createElement('div');
    interieur.className = 'ouverture-dedans';
    interieur.appendChild(dessinerMonogramme());
    var nomMarque = document.createElement('p');
    nomMarque.className = 'ouverture-nom';
    /* Le nom est enveloppé dans une balise : c'est elle qui glisse depuis
       derrière le masque, comme sur le site de référence. Un fondu aurait été
       plus simple et paraît toujours plus pressé. */
    var enveloppe = document.createElement('span');
    enveloppe.textContent = OUVERTURE.nom;
    nomMarque.appendChild(enveloppe);
    interieur.appendChild(nomMarque);

    /* LE DEUXIÈME MOT. Demande du client : « Bienvenue », une seconde
       d'attente, puis « à la maison dans les dunes ». Deux éléments, deux
       animations décalées — aucune minuterie en JavaScript pour ce texte, donc
       il tient même si l'onglet est ralenti au démarrage. */
    var suiteMarque = document.createElement('p');
    suiteMarque.className = 'ouverture-nom ouverture-nom-suite';
    var suiteEnveloppe = document.createElement('span');
    suiteEnveloppe.textContent = OUVERTURE.suite;
    suiteMarque.appendChild(suiteEnveloppe);
    interieur.appendChild(suiteMarque);

    ecran.appendChild(interieur);
    document.body.appendChild(ecran);
    leverLeVoileDAttente();

    /* Les animations CSS comptent leur temps depuis l'INSERTION de l'écran,
       soit une centaine de millisecondes après l'arrivée sur la page. Sans ce
       rattrapage, le nom finissait d'apparaître alors que le retrait avait
       déjà commencé — mesuré : nom visible à 1 731 ms, retrait parti à
       1 615 ms. On décale donc les animations du temps déjà écoulé, ce qui
       les remet sur l'horloge de l'arrivée. */
    ecran.style.setProperty('--decalage', '-' + Math.round(arriveeSurLaPage) + 'ms');

    var terminee = false;
    var minuteurSecurite = null;

    function terminerOuverture() {
      if (terminee) return;
      terminee = true;
      window.clearTimeout(minuteurSecurite);
      if (ecran.parentNode) ecran.parentNode.removeChild(ecran);
      /* Ces deux repères permettent de MESURER la durée réelle, pas de
         l'estimer : voir outils/test-ouverture.py. */
      window.__ouverture = {
        debut: debutOuverture,
        fin: window.performance.now(),
        duree: Math.round(window.performance.now() - debutOuverture),
        depuisNavigation: Math.round(window.performance.now())
      };
    }

    /* 2,4 s : les deux lignes sont arrivées (la première à 0,85 s, la seconde
       150 ms plus tard), et elles ont eu 0,7 s pour être lues. L'écran se
       retire. Sans ce temps d'arrêt, l'ouverture paraît expédiée. */
    window.setTimeout(function () {
      ecran.classList.add('se-retire');
      demarrerLeSite();
    }, tempsRestant(2400));

    /* 3 s : le retrait (0,6 s) est terminé. */
    window.setTimeout(terminerOuverture, tempsRestant(3000));

    /* 3,6 s après l'ARRIVÉE sur la page, quoi qu'il arrive. Si une animation ne
       se termine jamais, ou si l'onglet est ralenti, l'écran est retiré quand
       même : un écran d'ouverture bloqué serait un site mort. */
    minuteurSecurite = window.setTimeout(terminerOuverture, tempsRestant(3600));
  }
})();

/* =====================================================================
   LE PANNEAU DE NAVIGATION
   =====================================================================
   Le bouton à deux traits et le panneau sont CRÉÉS ici, jamais écrits dans
   la page. Conséquence voulue : sans JavaScript, le bouton n'existe pas et
   les liens restent dans l'en-tête — exactement ce qu'on veut. C'est la même
   méthode que la barre d'appel : un élément masqué en CSS qui apparaîtrait de
   travers serait pire que pas d'élément du tout.

   Ce qui est non négociable, et pourquoi :
     · aria-expanded et aria-controls : un lecteur d'écran doit savoir si le
       panneau est ouvert, et ce que le bouton commande ;
     · Échap ferme : c'est le réflexe de tout le monde ;
     · le focus est PIÉGÉ dans le panneau pendant qu'il est ouvert — sinon la
       tabulation repart dans la page derrière et l'utilisateur au clavier ne
       sait plus où il est ;
     · le fond devient INERTE : ni cliquable, ni atteignable au clavier ;
     · à la fermeture, le focus REVIENT au bouton. Sans cela, il retombe dans
       le vide, tout en haut de la page.
   ===================================================================== */
(function () {
  var entete = document.querySelector('.head-inner');
  if (!entete) return;

  var nav = document.querySelector('.nav');
  if (!nav) return;

  var liens = Array.prototype.map.call(nav.querySelectorAll('a'), function (a) {
    return { href: a.getAttribute('href'), texte: a.textContent.trim() };
  });
  if (!liens.length) return;

  var SVG = 'http://www.w3.org/2000/svg';

  /* L'icône : deux barres de 2 px dans une boîte de 50 × 13, une en haut, une
     en bas. Pas de trait du milieu — le brief est explicite. */
  function dessinerLesDeuxTraits() {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 50 13');
    svg.setAttribute('width', '50');
    svg.setAttribute('height', '13');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    [1.5, 11.5].forEach(function (y) {
      var barre = document.createElementNS(SVG, 'rect');
      barre.setAttribute('x', '0');
      barre.setAttribute('y', String(y));
      barre.setAttribute('width', '50');
      barre.setAttribute('height', '2');
      barre.setAttribute('fill', 'currentColor');
      svg.appendChild(barre);
    });
    return svg;
  }

  /* --- Le bouton, dans l'en-tête --- */
  var bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'bouton-panneau';
  bouton.setAttribute('aria-expanded', 'false');
  bouton.setAttribute('aria-controls', 'panneau-nav');
  bouton.setAttribute('aria-label', 'Ouvrir le menu');
  bouton.appendChild(dessinerLesDeuxTraits());
  entete.appendChild(bouton);

  /* --- Le panneau --- */
  var panneau = document.createElement('div');
  panneau.className = 'panneau';
  panneau.id = 'panneau-nav';
  panneau.hidden = true;
  panneau.setAttribute('role', 'dialog');
  panneau.setAttribute('aria-modal', 'true');
  panneau.setAttribute('aria-label', 'Menu du site');

  var fermer = document.createElement('button');
  fermer.type = 'button';
  fermer.className = 'panneau-fermer';
  fermer.setAttribute('aria-label', 'Fermer le menu');
  fermer.innerHTML = '&times;';
  panneau.appendChild(fermer);

  var titre = document.createElement('p');
  titre.className = 'panneau-titre';
  titre.textContent = 'Menu';
  panneau.appendChild(titre);

  var liste = document.createElement('nav');
  liste.className = 'panneau-liens';
  liste.setAttribute('aria-label', 'Sections du site');
  liens.forEach(function (l) {
    var a = document.createElement('a');
    a.href = l.href;
    a.textContent = l.texte;
    liste.appendChild(a);
  });
  panneau.appendChild(liste);

  document.body.appendChild(panneau);

  /* --- Ce qui doit devenir inerte pendant l'ouverture --- */
  var aInertiser = [];
  Array.prototype.forEach.call(document.body.children, function (enfant) {
    if (enfant !== panneau && enfant.tagName !== 'SCRIPT') aInertiser.push(enfant);
  });

  var dernierFocus = null;

  function ouvrir() {
    dernierFocus = document.activeElement;
    panneau.hidden = false;
    /* Une image de retard : sans elle, la transition ne se joue pas, parce que
       l'élément vient d'être affiché dans la même image. */
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { panneau.classList.add('ouvert'); });
    });
    bouton.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('panneau-ouvert');
    aInertiser.forEach(function (e) { e.inert = true; });
    fermer.focus();
  }

  function fermerLePanneau() {
    panneau.classList.remove('ouvert');
    bouton.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('panneau-ouvert');
    aInertiser.forEach(function (e) { e.inert = false; });
    window.setTimeout(function () { panneau.hidden = true; }, 400);
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
    else bouton.focus();
  }

  bouton.addEventListener('click', ouvrir);
  fermer.addEventListener('click', fermerLePanneau);

  /* Un lien du panneau ramène à la page : on referme. */
  Array.prototype.forEach.call(liste.querySelectorAll('a'), function (a) {
    a.addEventListener('click', function () {
      panneau.classList.remove('ouvert');
      bouton.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('panneau-ouvert');
      aInertiser.forEach(function (e) { e.inert = false; });
      panneau.hidden = true;
    });
  });

  document.addEventListener('keydown', function (e) {
    if (panneau.hidden) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      fermerLePanneau();
      return;
    }

    /* Le piège à focus : la tabulation tourne en rond DANS le panneau. */
    if (e.key !== 'Tab') return;
    var focusables = panneau.querySelectorAll('button, a[href]');
    if (!focusables.length) return;
    var premier = focusables[0], dernier = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault(); dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault(); premier.focus();
    }
  });

  /* ------------------------------------------------------------------
     L'ENTRÉE « PHOTOS » DU PANNEAU OUVRE LA GALERIE
     ------------------------------------------------------------------
     Deux façons d'aller aux photos, deux gestes — c'est voulu :
       · le lien « Photos » de l'EN-TÊTE descend jusqu'à la section. C'est du
         HTML pur, il fonctionne même sans JavaScript, et il ne change pas ;
       · l'entrée « Photos » du PANNEAU ouvre la galerie par-dessus la page.

     La galerie est un <dialog> natif : Échap ferme, le focus reste piégé, le
     fond devient inerte, la page ne défile plus. Rien de tout ça n'est écrit
     ici — c'est le navigateur qui s'en charge. Et comme elle s'ouvre
     PAR-DESSUS la visionneuse, Échap referme d'abord la photo agrandie, puis
     la galerie : le bon ordre, du dessus vers le dessous.

     Si la galerie n'est pas dans la page, on ne touche à rien : le lien du
     panneau redevient un lien ordinaire qui descend à la section.
     ------------------------------------------------------------------ */
  var galerieEntiere = document.getElementById('galerie-entiere');
  if (galerieEntiere && typeof galerieEntiere.showModal === 'function') {
    var croix = document.getElementById('ge-fermer');
    if (croix) croix.addEventListener('click', function () { galerieEntiere.close(); });

    /* Un clic sur le voile, hors des photos, ferme aussi. */
    galerieEntiere.addEventListener('click', function (evenement) {
      if (evenement.target === galerieEntiere) galerieEntiere.close();
    });

    Array.prototype.forEach.call(liste.querySelectorAll('a'), function (a) {
      if (a.textContent.trim().toLowerCase() !== 'photos') return;
      a.addEventListener('click', function (evenement) {
        evenement.preventDefault();
        fermerLePanneau();
        galerieEntiere.showModal();
      });
    });
  }
})();
