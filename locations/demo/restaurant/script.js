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

  /* --------------------------------------------------------- 0. CARTE VALIDEE --
     Le gabarit garde son HTML de secours. Si une carte validée existe dans
     Netlify Blobs, seuls les groupes, plats et prix sont remplacés : le CSS,
     les polices et la mise en page restent ceux du restaurant. */
  function chargerCarteValidee() {
    var cible = document.getElementById("menu-dynamique");
    if (!cible) return;

    fetch("/.netlify/functions/menu-public?client=Le%20Petit%20Exemple", { cache: "no-store" })
      .then(function (reponse) {
        if (!reponse.ok) throw new Error("Aucune carte validée");
        return reponse.json();
      })
      .then(function (menu) {
        if (!Array.isArray(menu.menuGroups) || !menu.menuGroups.length) return;
        var colonnes = [document.createElement("div"), document.createElement("div")];
        colonnes.forEach(function (colonne) { colonne.className = "carte-colonne"; });

        menu.menuGroups.forEach(function (groupe, index) {
          if (!groupe || !groupe.title) return;
          var titre = document.createElement("h3");
          titre.className = "carte-groupe";
          titre.textContent = groupe.title;
          var liste = document.createElement("ul");
          liste.className = "plats";

          (Array.isArray(groupe.items) ? groupe.items : []).forEach(function (item) {
            var donnees;
            if (typeof item === "string") {
              var morceaux = item.split(/\s·\s/);
              donnees = morceaux.length > 1
                ? { name: morceaux.slice(0, -1).join(" · "), price: morceaux[morceaux.length - 1] }
                : { name: item };
            } else {
              donnees = item || {};
            }
            var ligne = document.createElement("li");
            var plat = document.createElement("span");
            plat.className = "plat";
            plat.textContent = donnees.name || donnees.title || donnees.nom || donnees.label || "";
            var points = document.createElement("span");
            points.className = "points";
            var prix = document.createElement("span");
            prix.className = "prix";
            prix.textContent = donnees.price || donnees.prix || donnees.priceText || "";
            ligne.appendChild(plat);
            ligne.appendChild(points);
            ligne.appendChild(prix);
            liste.appendChild(ligne);
          });

          colonnes[index % 2].appendChild(titre);
          colonnes[index % 2].appendChild(liste);
        });

        cible.replaceChildren(colonnes[0], colonnes[1]);
      })
      .catch(function () {
        /* En cas de premier déploiement ou d'absence de carte, le contenu HTML
           de démonstration reste visible. */
      });
  }

  chargerCarteValidee();

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
