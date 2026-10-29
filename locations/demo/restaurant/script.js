/* ============================================================================
   LE BEURRE NOISETTE — script du gabarit restaurant (Cap Encre)
   ----------------------------------------------------------------------------
   Deux choses, et rien d'autre :
     1. l'ouverture au monogramme, 2,5 s maximum, une fois par session ;
     2. la barre d'appel sur telephone.
   Tout le reste du site fonctionne sans JavaScript. C'est volontaire : une page
   dont le contenu depend du script est une page qui peut arriver vide.
   ========================================================================== */
(function () {
  "use strict";

  /* La classe « js » commande l'affichage de l'ouverture et du zoom eventuel.
     Sans JavaScript, elle n'est jamais posee, et l'ouverture reste invisible :
     le visiteur voit le site directement. */
  document.documentElement.classList.add("js");

  /* ------------------------------------------------ 1. OUVERTURE MONOGRAMME --
     Une fois par session seulement : avec sessionStorage, elle ne se rejoue pas
     a chaque page, mais revient dans un nouvel onglet. Deux secondes et demie au
     maximum, et un filet de securite : si une erreur survient, on masque quand
     meme. Un ecran d'ouverture qui reste bloque est pire que pas d'ouverture. */
  var ouverture = document.getElementById("ouverture");
  var CLE = "bn-ouverture-vue";

  function masquerOuverture() {
    if (!ouverture) return;
    ouverture.classList.add("part");
    window.setTimeout(function () {
      ouverture.parentNode && ouverture.parentNode.removeChild(ouverture);
    }, 450);
  }

  if (ouverture) {
    var dejaVue = false;
    try { dejaVue = sessionStorage.getItem(CLE) === "1"; } catch (e) { dejaVue = false; }

    if (dejaVue) {
      ouverture.parentNode.removeChild(ouverture);
    } else {
      try { sessionStorage.setItem(CLE, "1"); } catch (e) {}
      /* Filet de securite : quoi qu'il arrive, l'ecran degage a 2,5 s. */
      window.setTimeout(masquerOuverture, 2500);
    }
  }

  /* --------------------------------------------------------- 2. BARRE D'APPEL --
     Sur telephone uniquement (la CSS la cache au-dela de 720 px).
     Elle apparait apres une hauteur d'ecran de defilement, et disparait des que
     la section contact entre dans la fenetre : a ce moment-la, le numero est
     sous les yeux du visiteur, la barre n'a plus rien a faire la. */
  var barre = document.getElementById("barre-appel");
  var acces = document.getElementById("acces");

  if (barre && acces && "IntersectionObserver" in window) {
    var contactVisible = false;

    var observateur = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) { contactVisible = e.isIntersecting; });
      maj();
    }, { threshold: 0.15 });
    observateur.observe(acces);

    var dernier = 0;
    function maj() {
      var y = window.scrollY || window.pageYOffset;
      var uneHauteurDecran = window.innerHeight * 0.9;
      var doitEtreLa = y > uneHauteurDecran && !contactVisible;
      if (doitEtreLa !== barre.classList.contains("visible")) {
        barre.classList.toggle("visible", doitEtreLa);
      }
    }

    /* On ne recalcule pas a chaque pixel : une fois par image suffit, et le
       telephone ne chauffe pas. */
    window.addEventListener("scroll", function () {
      if (dernier) return;
      dernier = window.requestAnimationFrame(function () {
        dernier = 0; maj();
      });
    }, { passive: true });

    window.addEventListener("resize", maj, { passive: true });
    maj();
  }
})();
