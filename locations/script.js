/* =========================================================================
   Cap Encre — le site fonctionne entièrement sans ce fichier.
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     LE FORMULAIRE DE DEVIS

     Il est pris en charge par Netlify : la balise <form> porte l'attribut
     data-netlify="true". C'est Netlify qui reçoit le message, l'enregistre
     dans le tableau de bord du compte et redirige vers merci.html.

     ATTENTION : ne JAMAIS appeler preventDefault() sur ce formulaire.
     Cela empêcherait purement et simplement les demandes d'arriver.

     Le même mécanisme se réutilise tel quel sur un site client :
     voir modeles/formulaire-netlify.html et la section « Formulaire »
     du README.
     --------------------------------------------------------------------- */
  var formulaire = document.getElementById('form-devis');

  /* ⚠️ PIÈGE VÉRIFIÉ LE 13 OCTOBRE 2026 — NE PAS REVENIR EN ARRIÈRE.
     En production, NETLIFY RETIRE LUI-MÊME l'attribut data-netlify de la
     balise <form> : il est donc TOUJOURS absent de la page servie. Un
     garde-fou qui testait sa présence bloquait toutes les demandes, en
     annonçant au visiteur que le formulaire n'était pas relié.
     On teste donc un attribut que le site possède en propre et que Netlify
     ne touche pas : data-form-en-ligne, posé sur le <form>. */
  if (formulaire && formulaire.getAttribute('data-form-en-ligne') !== 'true') {
    // Filet de sécurité : si l'attribut Netlify venait à disparaître, on le dit
    // franchement au visiteur au lieu de laisser croire que le message est parti.
    formulaire.addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      window.alert('Le formulaire n\'est pas encore relié.\n\n' +
                   'Appelez le 06 62 67 44 14 ou écrivez à ' +
                   'milcent-benjamin@orange.fr.');
    });
  }

  /* Année automatique dans le pied de page. */
  var annee = document.getElementById('annee');
  if (annee) annee.textContent = String(new Date().getFullYear());

  /* ---------------------------------------------------------------------
     BARRE D'APPEL SUR TÉLÉPHONE — et seulement quand elle sert.

     Elle n'existe PAS au chargement : elle est créée ici. Si ce fichier ne
     se charge pas, la barre n'existe pas du tout et le site reste utilisable.
     C'est voulu : un élément caché en CSS qui apparaîtrait de travers serait
     pire que pas de barre du tout.

     Elle apparaît après UNE HAUTEUR D'ÉCRAN de défilement — donc quand la
     bannière d'accueil a quitté l'écran — et disparaît dès que la section
     contact arrive. Tant qu'on est descendu au moins jusqu'au contact, celui-ci
     est au-dessus du bas de l'écran : c'est ce qui la fait disparaître pour de
     bon sur le formulaire et le pied de page. Si le visiteur remonte au-dessus
     du contact, elle revient : elle suit la position, elle ne garde aucune
     mémoire de ce qu'elle a vu.

     Le seuil est une hauteur d'écran, jamais un nombre de pixels : sur un
     petit téléphone comme sur un grand, le comportement est identique.

     Le numéro est repris du premier lien tel: de la section contact, qui est
     déjà la source de vérité du site : il n'y a donc qu'un seul endroit à
     changer. Sans ce lien, la barre ne se crée pas.

     Rien au-dessus de 768 px de large : sur ordinateur, jamais.
     Pour désactiver la barre : voir le README, section « Barre d'appel ».
     --------------------------------------------------------------------- */
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
})();
