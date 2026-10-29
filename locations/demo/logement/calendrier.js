/* =========================================================================
   Calendrier des disponibilités et des tarifs
   -------------------------------------------------------------------------
   Lit les données dans calendrier-donnees.js et construit le calendrier.
   Aucune bibliothèque, aucun service extérieur.

   Trois modes, réglés dans calendrier-donnees.js :

     « manuel » : les jours réservés sont écrits à la main dans le fichier.
     « auto »   : ils sont relus plusieurs fois par jour depuis le calendrier
                  Airbnb ou Booking du propriétaire.
     « masque » : aucun calendrier ; le visiteur demande ses dates.

   RÈGLE ABSOLUE DU MODE « AUTO » : le pire cas doit être « aucun calendrier
   affiché », jamais « un calendrier faux ». D'où les trois niveaux :

     normal      -> les disponibilités synchronisées s'affichent
     douteux     -> elles s'affichent, avec un avertissement bien visible
     hors-service-> elles disparaissent, remplacées par « appelez-nous »

   Si ce fichier est absent ou en panne, la page reste parfaitement
   utilisable : il ne reste simplement plus de calendrier.
   ========================================================================= */
(function () {
  'use strict';

  var DONNEES = window.CALENDRIER;
  var grille = document.getElementById('cal-grille');
  if (!DONNEES || !grille) return;

  /* --- Réglages de la synchronisation --------------------------------- */
  var SYNC = DONNEES.synchronisation || {};
  var MODE = SYNC.mode || 'manuel';
  var ADRESSE = SYNC.adresse || '/api/disponibilites';
  var REPLI_MANUEL = SYNC.repliManuel === true;
  var DELAI_MAX = SYNC.delaiMax || 8000;

  /* Périodes reçues du serveur, en plus de celles écrites à la main.
     Vide tant que la synchronisation n'a pas répondu. */
  var periodesSync = [];

  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
              'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  var debut = null;   // date d'arrivée choisie, "AAAA-MM-JJ"
  var fin = null;     // date de départ choisie
  var alerte = '';    // message à afficher si le choix est impossible
  var proposition = null;  // la première date valide à proposer, si le choix échoue

  /* Le dernier message que NOUS avons écrit dans le formulaire. Il permet de
     savoir si le texte présent vient de nous ou du visiteur : tant qu'il vient
     de nous, on peut le rafraîchir ; dès que le visiteur l'a modifié, on n'y
     touche plus jamais. */
  var dernierMessageAuto = '';

  /* =====================================================================
     Outils de date — tout est calculé en temps universel (UTC) pour éviter
     les surprises de changement d'heure.
     ===================================================================== */
  function deuxChiffres(n) { return (n < 10 ? '0' : '') + n; }
  function versDate(iso) {
    var p = iso.split('-');
    return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  }
  function versISO(d) {
    return d.getUTCFullYear() + '-' + deuxChiffres(d.getUTCMonth() + 1) +
           '-' + deuxChiffres(d.getUTCDate());
  }
  function plusDeJours(d, n) { return new Date(d.getTime() + n * 86400000); }

  // « Aujourd'hui » est lu sur l'appareil du visiteur, pas sur le serveur.
  function aujourdhui() {
    var n = new Date();
    return n.getFullYear() + '-' + deuxChiffres(n.getMonth() + 1) +
           '-' + deuxChiffres(n.getDate());
  }

  function euros(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
  }
  function avecMajuscule(texte) { return texte.charAt(0).toUpperCase() + texte.slice(1); }
  function dateLongue(iso) {
    var d = versDate(iso);
    return JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()] +
           ' ' + d.getUTCFullYear();
  }

  /* =====================================================================
     Lecture du fichier de données
     ===================================================================== */
  function periodeDe(iso) {
    var moisJour = iso.slice(5);            // « 07-14 »
    for (var i = 0; i < DONNEES.periodes.length; i++) {
      var p = DONNEES.periodes[i];
      if (moisJour >= p.de && moisJour <= p.a) return p;
    }
    return null;                            // hors période d'ouverture
  }

  function motifPrise(iso) {
    var blocs = (DONNEES.indisponible || []).concat(periodesSync);
    for (var i = 0; i < blocs.length; i++) {
      if (iso >= blocs[i].de && iso <= blocs[i].a) return blocs[i].motif || 'Réservé';
    }
    return null;
  }

  // Un jour est : hors saison, passé, déjà pris, ou libre. Par ordre d'importance.
  function etat(iso) {
    if (periodeDe(iso) === null) return 'ferme';
    if (iso < aujourdhui()) return 'passe';
    if (motifPrise(iso)) return 'pris';
    return 'libre';
  }

  /* Le prix affiché SOUS une date. On ne renvoie que le tarif à la nuit, et
     rien d'autre.

     ⚠️ La version précédente renvoyait le tarif À LA SEMAINE quand le tarif à
     la nuit manquait : en juillet-août, chaque case annonçait donc « 1 400 € »
     comme s'il s'agissait du prix d'une nuit. C'est un prix faux — la pire
     chose qu'un calendrier puisse afficher. Mieux vaut AUCUN prix sous les
     dates : le bandeau du mois, au-dessus de la grille, annonce le tarif à la
     semaine. */
  function prixDuJour(iso) {
    var p = periodeDe(iso);
    if (!p) return null;
    return p.prixNuit || null;
  }

  /* =====================================================================
     Les règles de séjour, lues dans les données
     ===================================================================== */
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi',
               'samedi'];

  function jourSemaine(iso) { return versDate(iso).getUTCDay(); }

  /* « tous » n'impose rien. Sinon la valeur peut nommer un seul jour
     (« samedi ») ou plusieurs (« samedi dimanche », ou une liste). */
  function joursAutorises(valeur) {
    if (!valeur || valeur === 'tous') return null;      // null = tous les jours
    var brut = Array.isArray(valeur) ? valeur : String(valeur).split(/[\s,]+/);
    var numeros = [];
    brut.forEach(function (mot) {
      var n = JOURS.indexOf(String(mot).toLowerCase());
      if (n >= 0 && numeros.indexOf(n) === -1) numeros.push(n);
    });
    return numeros.length ? numeros : null;
  }

  function minimumPour(periode) {
    if (periode && typeof periode.nuitsMinimum === 'number') return periode.nuitsMinimum;
    return DONNEES.nuitsMinimum || 1;
  }

  function arriveeAutorisee(iso, periode) {
    var jours = joursAutorises(periode && periode.arrivee);
    return !jours || jours.indexOf(jourSemaine(iso)) >= 0;
  }

  function departAutorise(iso, periode) {
    var jours = joursAutorises(periode && periode.depart);
    return !jours || jours.indexOf(jourSemaine(iso)) >= 0;
  }

  function listeJours(numeros) {
    return numeros.map(function (n) { return JOURS[n]; }).join(' ou ');
  }

  /* La première date d'ARRIVÉE valide à partir de `iso`, incluse. Sert à
     proposer une date plutôt qu'à refuser sèchement. */
  function prochaineArrivee(iso) {
    var d = versDate(iso);
    for (var i = 0; i < 400; i++) {
      var jour = versISO(d);
      var p = periodeDe(jour);
      if (p && etat(jour) === 'libre' && arriveeAutorisee(jour, p)) return jour;
      d = plusDeJours(d, 1);
    }
    return null;
  }

  /* =====================================================================
     Mois consultables
     ===================================================================== */
  function moisConsultables() {
    var liste = [];
    var auj = aujourdhui();
    DONNEES.annees.forEach(function (an) {
      for (var m = 0; m < 12; m++) {
        var dernier = versISO(new Date(Date.UTC(an, m + 1, 0)));
        if (dernier < auj) continue;                    // mois entièrement passé
        var d = new Date(Date.UTC(an, m, 1));
        var contientOuverture = false;
        while (versISO(d) <= dernier) {
          if (periodeDe(versISO(d)) !== null) { contientOuverture = true; break; }
          d = plusDeJours(d, 1);
        }
        if (contientOuverture) liste.push({ annee: an, mois: m });
      }
    });
    return liste;
  }

  var listeMois = moisConsultables();

  // On ouvre le calendrier sur le mois en cours, sinon sur le prochain mois ouvert.
  var indiceMois = (function () {
    var auj = aujourdhui();
    var an = Number(auj.slice(0, 4));
    var mo = Number(auj.slice(5, 7)) - 1;
    for (var i = 0; i < listeMois.length; i++) {
      if (listeMois[i].annee === an && listeMois[i].mois === mo) return i;
    }
    for (var j = 0; j < listeMois.length; j++) {
      if (listeMois[j].annee > an ||
          (listeMois[j].annee === an && listeMois[j].mois > mo)) return j;
    }
    return 0;
  })();

  /* =====================================================================
     Affichage
     ===================================================================== */
  function rendre() {
    if (!listeMois.length) {
      grille.innerHTML = '<p class="cal-vide">Aucune période n\'est ouverte ' +
                         'à la réservation pour le moment.</p>';
      majResume();
      return;
    }

    var cible = listeMois[indiceMois];
    document.getElementById('cal-mois').textContent =
      avecMajuscule(MOIS[cible.mois]) + ' ' + cible.annee;
    document.getElementById('cal-prec').disabled = indiceMois === 0;
    document.getElementById('cal-suiv').disabled = indiceMois === listeMois.length - 1;

    var premier = new Date(Date.UTC(cible.annee, cible.mois, 1));
    var decalage = (premier.getUTCDay() + 6) % 7;        // lundi = 0
    var nbJours = new Date(Date.UTC(cible.annee, cible.mois + 1, 0)).getUTCDate();

    var html = '';
    for (var v = 0; v < decalage; v++) {
      html += '<span class="cal-jour vide" aria-hidden="true"></span>';
    }
    for (var j = 1; j <= nbJours; j++) {
      html += boutonJour(versISO(new Date(Date.UTC(cible.annee, cible.mois, j))), j);
    }
    grille.innerHTML = html;

    var boutons = grille.querySelectorAll('button.cal-jour');
    Array.prototype.forEach.call(boutons, function (b) {
      b.addEventListener('click', function () { choisir(b.getAttribute('data-jour')); });
    });

    document.getElementById('cal-bandeau').innerHTML = bandeauTarifs(cible);
    majResume();
  }

  function boutonJour(iso, numero) {
    var e = etat(iso);
    var classes = 'cal-jour ' + e;
    if (debut && iso === debut) classes += ' debut';
    if (fin && iso === fin) classes += ' fin';
    if (debut && fin && iso > debut && iso < fin) classes += ' dans';

    var prix = prixDuJour(iso);
    var contenu = '<b>' + numero + '</b>';
    if ((e === 'libre') && prix) contenu += '<i>' + euros(prix) + '</i>';

    var description = dateLongue(iso) + ', ';
    if (e === 'ferme') description += 'hors période d\'ouverture';
    else if (e === 'passe') description += 'date passée';
    else if (e === 'pris') description += 'déjà réservé';
    else description += 'disponible' + (prix ? ', ' + euros(prix) : '');

    var actif = (e === 'libre' || e === 'pris');
    return '<button type="button" class="' + classes + '" data-jour="' + iso + '"' +
           (actif ? '' : ' disabled') + ' aria-label="' + description + '">' +
           contenu + '</button>';
  }

  // Petit bandeau qui explique la lecture des prix pour le mois affiché.
  function bandeauTarifs(cible) {
    var vus = [];
    var nbJours = new Date(Date.UTC(cible.annee, cible.mois + 1, 0)).getUTCDate();
    for (var j = 1; j <= nbJours; j++) {
      var p = periodeDe(versISO(new Date(Date.UTC(cible.annee, cible.mois, j))));
      if (p && vus.indexOf(p) === -1) vus.push(p);
    }
    if (!vus.length) return '';
    return vus.map(function (p) {
      var tarifs = [];
      if (p.prixNuit) tarifs.push(euros(p.prixNuit) + ' la nuit');
      if (p.prixSemaine) tarifs.push(euros(p.prixSemaine) + ' la semaine');
      return '<strong>' + p.libelle + '</strong> — ' + tarifs.join(' &middot; ');
    }).join('<br>');
  }

  /* =====================================================================
     Choix des dates par le visiteur
     ===================================================================== */
  function choisir(iso) {
    alerte = '';
    var e = etat(iso);

    // Un jour déjà réservé peut servir de date de DÉPART (on part le matin,
    // le locataire suivant arrive l'après-midi), mais jamais d'ARRIVÉE.
    var peutEtreArrivee = (e === 'libre');

    if (!debut || (debut && fin) || iso <= debut) {
      proposition = null;
      if (!peutEtreArrivee) {
        alerte = 'Le ' + dateLongue(iso) + ' ne peut pas être votre date d\'arrivée : ' +
                 (e === 'pris' ? 'il est déjà réservé.' : 'il est hors de la période d\'ouverture.');
      } else {
        debut = iso;
        fin = null;
      }
    } else {
      // On ne refuse pas sèchement : si la règle n'est pas respectée, on dit
      // pourquoi ET on propose la première date valide.
      var verdict = verifierPlage(debut, iso);
      if (verdict.souci) {
        alerte = verdict.souci;
        proposition = verdict.proposition;
      } else {
        fin = iso;
        proposition = null;
      }
    }
    rendre();
  }

  /* Vérifie une plage et rend {souci, proposition}.
     `souci`        : le message à afficher, ou null si tout va bien.
     `proposition`  : la première date valide à proposer, plutôt qu'un refus sec.

     Les règles suivent la date d'ARRIVÉE : un séjour qui commence en basse
     saison un 28 juin reste un séjour de basse saison, même s'il se termine en
     juillet. C'est la convention des gîtes, et c'est aussi la plus lisible. */
  function verifierPlage(d, f) {
    var d1 = versDate(d), d2 = versDate(f);
    var nuits = Math.round((d2 - d1) / 86400000);
    var periode = periodeDe(d);
    var minimum = minimumPour(periode);

    if (nuits <= 0) {
      return { souci: 'La date de départ doit être après la date d\'arrivée.',
               proposition: null };
    }

    if (!arriveeAutorisee(d, periode)) {
      var joursA = joursAutorises(periode.arrivee);
      var prop = prochaineArrivee(d);
      return {
        souci: 'En ' + periode.libelle.toLowerCase() + ', on arrive le ' +
               listeJours(joursA) + '. Le ' + dateLongue(d) + ' est un ' +
               JOURS[jourSemaine(d)] + '.',
        proposition: prop ? { date: prop, quoi: 'arrivee' } : null
      };
    }

    if (!departAutorise(f, periode)) {
      var joursD = joursAutorises(periode.depart);
      return {
        souci: 'En ' + periode.libelle.toLowerCase() + ', on repart le ' +
               listeJours(joursD) + '. Le ' + dateLongue(f) + ' est un ' +
               JOURS[jourSemaine(f)] + '.',
        proposition: null
      };
    }

    if (nuits < minimum) {
      return {
        souci: 'Séjour minimum de ' + minimum + ' nuit' + (minimum > 1 ? 's' : '') +
               ' en ' + periode.libelle.toLowerCase() + '. Ce séjour en compte ' +
               nuits + '.',
        proposition: { date: versISO(plusDeJours(d1, minimum)), quoi: 'depart' }
      };
    }

    for (var x = new Date(d1); x < d2; x = plusDeJours(x, 1)) {
      var jour = versISO(x);
      var e = etat(jour);
      if (e === 'pris') {
        return {
          souci: 'Votre séjour passe par un jour déjà réservé, le ' +
                 dateLongue(jour) + '. Choisissez d\'autres dates.',
          proposition: null
        };
      }
      if (e === 'ferme') {
        return {
          souci: 'Votre séjour sort de la période d\'ouverture, le ' +
                 dateLongue(jour) + '. Le gîte est ouvert d\'avril à octobre.',
          proposition: null
        };
      }
    }
    return { souci: null, proposition: null };
  }

  /* =====================================================================
     Calcul du prix
     ===================================================================== */
  function calculer(d, f) {
    var d1 = versDate(d), d2 = versDate(f);
    var nuits = [];
    for (var x = new Date(d1); x < d2; x = plusDeJours(x, 1)) nuits.push(versISO(x));

    var periodes = nuits.map(periodeDe);
    var memePeriode = periodes.every(function (p) { return p === periodes[0]; });
    if (!memePeriode) return { type: 'mixte', nbNuits: nuits.length };

    var p = periodes[0];
    var semaines = Math.floor(nuits.length / 7);
    var reste = nuits.length % 7;
    var lignes = [];
    var total = 0;

    if (semaines > 0) {
      if (!p.prixSemaine) {
        return { type: 'incomplet', nbNuits: nuits.length, periode: p,
                 manque: 'le tarif à la semaine' };
      }
      lignes.push({
        libelle: semaines + (semaines > 1 ? ' semaines' : ' semaine') +
                 ' × ' + euros(p.prixSemaine),
        montant: semaines * p.prixSemaine
      });
      total += semaines * p.prixSemaine;
    }
    if (reste > 0) {
      if (!p.prixNuit) {
        return { type: 'incomplet', nbNuits: nuits.length, periode: p,
                 manque: 'le tarif à la nuit' };
      }
      lignes.push({
        libelle: reste + (reste > 1 ? ' nuits' : ' nuit') + ' × ' + euros(p.prixNuit),
        montant: reste * p.prixNuit
      });
      total += reste * p.prixNuit;
    }
    // Le forfait ménage s'ajoute UNE SEULE FOIS, quel que soit le nombre de
    // nuits. Il fait partie du total estimé, et il est affiché sur sa propre
    // ligne : c'est ce qui évite la mauvaise surprise au moment de réserver.
    var forfait = (DONNEES.menage && DONNEES.menage.montant) || 0;
    if (forfait > 0) {
      lignes.push({
        libelle: (DONNEES.menage.libelle || 'Forfait ménage'),
        montant: forfait
      });
      total += forfait;
    }

    return { type: 'ok', nbJours: nuits.length, lignes: lignes, total: total,
             forfait: forfait, totalSejour: total - forfait, periode: p };
  }

  /* =====================================================================
     Panneau récapitulatif
     ===================================================================== */
  function majResume() {
    var zone = document.getElementById('cal-resume');
    if (!zone) return;

    var html = '<h3>Votre séjour</h3>';

    if (alerte) {
      html += '<p class="cal-alerte">' + alerte + '</p>';
    }
    // Une règle non respectée ne s'arrête pas à un refus : on propose la
    // première date qui convient, et le visiteur n'a qu'à cliquer.
    if (proposition) {
      html += '<button type="button" class="btn btn-secondaire" id="cal-proposer" ' +
              'data-proposer="' + proposition.date + '" data-quoi="' + proposition.quoi + '">' +
              'Proposer le ' + dateLongue(proposition.date) + '</button>';
    }

    if (!debut) {
      html += '<p class="cal-vide">Cliquez sur votre <strong>date d\'arrivée</strong> ' +
              'dans le calendrier.</p>';
    } else if (!fin) {
      html += '<p class="cal-choix"><strong>Arrivée :</strong> ' + dateLongue(debut) + '</p>';
      html += '<p class="cal-vide">Cliquez maintenant sur votre <strong>date de ' +
              'départ</strong>.</p>';
      html += '<button type="button" class="btn btn-secondaire" id="cal-effacer">' +
              'Effacer</button>';
    } else {
      var resultat = calculer(debut, fin);
      html += '<p class="cal-choix"><strong>Du</strong> ' + dateLongue(debut) + '<br>' +
              '<strong>Au</strong> ' + dateLongue(fin) + '</p>';

      if (resultat.type === 'ok') {
        html += '<ul class="cal-lignes">';
        resultat.lignes.forEach(function (l) {
          html += '<li><span>' + l.libelle + '</span><span>' + euros(l.montant) + '</span></li>';
        });
        html += '</ul>';
        html += '<p class="cal-total"><span>Total estimé</span> ' + euros(resultat.total) + '</p>';
        html += '<p class="cal-precision">' + resultat.nbJours + ' nuit' +
                (resultat.nbJours > 1 ? 's' : '') + ' — ' + resultat.periode.libelle +
                '. Le prix définitif vous est confirmé par téléphone ou par e-mail.</p>';

        // Ce qui est compris, et ce qui ne l'est pas : c'est ce qui évite les
        // malentendus au moment de réserver, et les réclamations après.
        if (DONNEES.inclus && DONNEES.inclus.length) {
          html += '<div class="cal-compris">';
          html += '<p class="cal-compris-titre">Compris dans le prix</p><ul>' +
                  DONNEES.inclus.map(function (t) { return '<li>' + t + '</li>'; }).join('') +
                  '</ul>';
          if (DONNEES.nonInclus && DONNEES.nonInclus.length) {
            html += '<p class="cal-compris-titre">Non compris</p>' +
                    '<ul class="cal-pas-compris">' +
                    DONNEES.nonInclus.map(function (t) { return '<li>' + t + '</li>'; }).join('') +
                    '</ul>';
          }
          html += '</div>';
        }
      } else if (resultat.type === 'incomplet') {
        html += '<p class="cal-alerte">Ce séjour de ' + resultat.nbNuits + ' nuit' +
                (resultat.nbNuits > 1 ? 's' : '') + ' tombe en ' + resultat.periode.libelle +
                ', et il manque ' + resultat.manque + ' dans la grille tarifaire. ' +
                'Envoyez votre demande : nous vous répondrons avec un prix précis.</p>';
      } else {
        html += '<p class="cal-alerte">Ce séjour à cheval sur deux périodes tarifaires ' +
                '(' + resultat.nbNuits + ' nuits) se calcule au cas par cas. ' +
                'Envoyez votre demande : nous vous répondrons avec un prix précis.</p>';
      }

      html += '<button type="button" class="btn btn-primary btn-block" id="cal-demander">' +
              'Demander ces dates</button>';
      html += '<button type="button" class="btn btn-lien" id="cal-effacer">Effacer</button>';
    }

    zone.innerHTML = html;

    var demander = document.getElementById('cal-demander');
    if (demander) demander.addEventListener('click', reporterVersFormulaire);

    var proposer = document.getElementById('cal-proposer');
    if (proposer) proposer.addEventListener('click', function () {
      var quand = proposer.getAttribute('data-proposer');
      var quoi = proposer.getAttribute('data-quoi');
      // La proposition sait si elle porte sur l'ARRIVÉE ou sur le DÉPART.
      // Les confondre était un vrai défaut : le calendrier proposait un samedi,
      // le visiteur cliquait, et rien ne changeait.
      if (quoi === 'arrivee' || !debut || (fin && quand < fin)) {
        debut = quand; fin = null;
      } else {
        fin = quand;
      }
      alerte = '';
      proposition = null;
      rendre();
    });

    var effacer = document.getElementById('cal-effacer');
    if (effacer) {
      effacer.addEventListener('click', function () {
        debut = null; fin = null; alerte = ''; rendre();
      });
    }
  }

  /* =====================================================================
     Report des dates choisies dans le formulaire de contact
     ===================================================================== */
  /* Écrit la phrase d'introduction à partir des dates PRÉSENTES DANS LE
     FORMULAIRE, et non de celles du calendrier. C'est ce qui permet de la
     rafraîchir aussi quand le visiteur corrige une date à la main.

     Elle n'est remplacée que dans deux cas : le champ est vide, ou il contient
     encore exactement le texte que NOUS avons écrit. Un message rédigé par le
     visiteur est intouchable — c'est la règle la plus importante ici, car
     écraser son texte serait un défaut pire que celui qu'on corrige. */
  function ecrireMessageAuto() {
    var arrivee = document.getElementById('arrivee');
    var depart = document.getElementById('depart');
    var message = document.getElementById('message');
    if (!arrivee || !depart || !message) return;

    var d = arrivee.value;
    var f = depart.value;
    if (!d || !f || f <= d) return;   // une date manque, ou elles sont inversées

    var nuits = Math.round((versDate(f) - versDate(d)) / 86400000);
    var texte = 'Bonjour, je souhaite louer le gîte du ' + dateLongue(d) +
                ' au ' + dateLongue(f) + ', soit ' + nuits + ' nuit' +
                (nuits > 1 ? 's' : '') + '. ';

    if (!message.value.trim() || message.value === dernierMessageAuto) {
      message.value = texte;
      dernierMessageAuto = texte;
    }
  }

  /* Les deux dates du formulaire sont indépendantes : rien n'empêche d'y
     saisir un départ AVANT l'arrivée. On le dit alors clairement.

     On passe par setCustomValidity(), le mécanisme NATIF du navigateur : il
     bloque l'envoi et affiche notre phrase, sans jamais appeler
     preventDefault() sur le formulaire. Sur un formulaire Netlify — ce que ce
     gabarit deviendra chez un client — bloquer l'envoi de cette façon ferait
     perdre des demandes sans que personne ne s'en aperçoive. */
  function controlerDates() {
    var arrivee = document.getElementById('arrivee');
    var depart = document.getElementById('depart');
    if (!arrivee || !depart) return;

    var d = arrivee.value;
    var f = depart.value;
    var incoherent = Boolean(d && f && f <= d);
    var phrase = '';

    if (incoherent) {
      phrase = (f === d)
        ? 'Votre date de départ est la même que votre date d\'arrivée : ' +
          'votre séjour ne ferait aucune nuit. Corrigez l\'une des deux dates.'
        : 'Votre date de départ (' + dateLongue(f) + ') est antérieure à votre ' +
          'date d\'arrivée (' + dateLongue(d) + '). Corrigez l\'une des deux dates.';
    }

    // setCustomValidity rend le champ invalide aux yeux du navigateur : l'envoi
    // est refusé et il affiche notre phrase. Une chaîne vide remet tout à zéro.
    depart.setCustomValidity(phrase);
    arrivee.setCustomValidity(phrase);

    var zone = document.getElementById('dates-alerte');
    if (zone) {
      zone.hidden = !incoherent;
      zone.textContent = phrase;
    }
  }

  /* Si le visiteur corrige une date directement dans le formulaire, la phrase
     d'introduction et l'avertissement doivent suivre. Sans cela, le formulaire
     affichait « du 12 au 16 octobre » pendant que le message annonçait encore
     « du 12 au 14 ». */
  ['arrivee', 'depart'].forEach(function (idChamp) {
    var champ = document.getElementById(idChamp);
    if (champ) champ.addEventListener('change', function () {
      controlerDates();
      ecrireMessageAuto();
    });
  });

  // Au chargement, au cas où les champs seraient déjà remplis (retour arrière
  // du navigateur, par exemple).
  controlerDates();

  function reporterVersFormulaire() {
    var arrivee = document.getElementById('arrivee');
    var depart = document.getElementById('depart');

    if (arrivee) arrivee.value = debut;
    if (depart && fin) depart.value = fin;

    ecrireMessageAuto();

    var contact = document.getElementById('contact');
    if (contact) contact.scrollIntoView({ behavior: 'smooth', block: 'start' });

    var nom = document.getElementById('nom');
    if (nom) window.setTimeout(function () { nom.focus({ preventScroll: true }); }, 700);
  }

  /* =====================================================================
     Synchronisation automatique
     ===================================================================== */

  function afficherBandeauEtat(type, texte) {
    var zone = document.getElementById('cal-etat');
    if (!zone) return;
    if (!texte) { effacerBandeauEtat(); return; }
    zone.hidden = false;
    zone.className = 'cal-etat ' + type;
    zone.textContent = texte;
  }

  function effacerBandeauEtat() {
    var zone = document.getElementById('cal-etat');
    if (!zone) return;
    zone.hidden = true;
    zone.textContent = '';
  }

  // Le message d'attente pendant que la synchronisation répond.
  function afficherAttente() {
    document.getElementById('cal-mois').textContent = 'Chargement…';
    grille.innerHTML = '<p class="cal-vide">Recherche des disponibilités…</p>';
  }

  // Bascule entre le calendrier et le message « indisponible ».
  function basculerIndisponible(actif, motif) {
    var disposition = document.querySelector('.cal-layout');
    var bloc = document.getElementById('cal-indisponible');
    if (!disposition || !bloc) return;
    disposition.hidden = actif;
    bloc.hidden = !actif;
    if (actif && motif) {
      var precision = document.getElementById('cal-indisponible-motif');
      if (precision) precision.textContent = motif;
    }
  }

  function quand(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.getDate() + ' ' + MOIS[d.getMonth()] + ' à ' +
           deuxChiffres(d.getHours()) + 'h' + deuxChiffres(d.getMinutes());
  }

  function heures(age) {
    if (age === null || age === undefined) return null;
    if (age < 1) return 'moins d\'une heure';
    if (age < 48) return Math.round(age) + ' heure' + (Math.round(age) > 1 ? 's' : '');
    return Math.round(age / 24) + ' jours';
  }

  function recupererDisponibilites() {
    if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
      return Promise.reject(new Error('navigateur trop ancien'));
    }

    var controleur = new AbortController();
    var minuteur = window.setTimeout(function () { controleur.abort(); }, DELAI_MAX);

    return fetch(ADRESSE, { signal: controleur.signal })
      .then(function (reponse) {
        window.clearTimeout(minuteur);
        if (!reponse.ok) throw new Error('réponse ' + reponse.status);
        return reponse.json();
      })
      .catch(function (erreur) {
        window.clearTimeout(minuteur);
        throw erreur;
      });
  }

  function appliquerSynchronisation(donnees) {
    var sourcesNommees = (donnees.sources || [])
      .filter(function (s) { return s.ok; })
      .map(function (s) { return s.nom; });
    var listeSources = sourcesNommees.length
      ? sourcesNommees.join(' et ')
      : 'votre calendrier';

    // --- Niveau 3 : on n'affiche AUCUNE disponibilité -------------------
    if (donnees.niveau === 'hors-service') {
      if (REPLI_MANUEL) {
        afficherBandeauEtat('hors-service',
          'Les disponibilités ne sont pas synchronisées en ce moment : ' +
          'les dates ci-dessous sont celles tenues à la main et peuvent avoir changé. ' +
          'Confirmez vos dates par téléphone ou par e-mail.');
        rendre();
        return;
      }
      // Pas de bandeau ici : le bloc de repli dit déjà tout. Deux fois le
      // même message à la suite donne une page bavarde et peu soignée.
      effacerBandeauEtat();
      basculerIndisponible(true);
      return;
    }

    // --- Niveaux 1 et 2 : on affiche, avec ou sans avertissement --------
    periodesSync = (donnees.indisponible || []).map(function (p) {
      return { de: p.de, a: p.a, motif: p.titre || 'Réservé' };
    });

    if (donnees.niveau === 'douteux') {
      var raison;
      if (donnees.motif === 'source-incomplete') {
        var muettes = (donnees.sources || [])
          .filter(function (s) { return !s.ok; })
          .map(function (s) { return s.nom; });
        raison = 'Certaines plateformes n\'ont pas répondu (' +
                 (muettes.join(', ') || 'une source') + ') : des réservations ' +
                 'récentes peuvent manquer.';
      } else {
        raison = 'Dernière mise à jour il y a ' + heures(donnees.ageHeures) +
                 '. Des réservations récentes peuvent manquer.';
      }
      afficherBandeauEtat('douteux',
        raison + ' Confirmez vos dates par téléphone ou par e-mail.');
    } else {
      afficherBandeauEtat('normal',
        'Disponibilités reprises de ' + listeSources +
        (donnees.recupereLe ? ', mises à jour le ' + quand(donnees.recupereLe) : '') +
        '. À titre indicatif : la réservation se confirme par téléphone ou par e-mail.');
    }

    rendre();
  }

  /* =====================================================================
     Mise en route, selon le mode choisi
     ===================================================================== */

  function brancherFleches() {
    var prec = document.getElementById('cal-prec');
    var suiv = document.getElementById('cal-suiv');
    if (prec) prec.addEventListener('click', function () {
      if (indiceMois > 0) { indiceMois--; rendre(); }
    });
    if (suiv) suiv.addEventListener('click', function () {
      if (indiceMois < listeMois.length - 1) { indiceMois++; rendre(); }
    });
  }

  // Note de bas de section : son texte dépend du mode.
  function ajusterNote() {
    var note = document.getElementById('cal-note');
    if (!note) return;
    if (MODE === 'auto') {
      note.textContent = 'Les jours déjà réservés sont relus automatiquement depuis ' +
        'votre calendrier Airbnb ou Booking, plusieurs fois par jour. Les tarifs, eux, ' +
        'se modifient dans le fichier calendrier-donnees.js.';
    } else if (MODE === 'masque') {
      note.hidden = true;
    } else {
      note.textContent = 'Les tarifs et les jours réservés du calendrier se modifient ' +
        'sans toucher au site : tout est regroupé dans le fichier calendrier-donnees.js.';
    }
  }

  if (MODE === 'masque') {
    /* Aucun calendrier : on invite simplement à demander ses dates. */
    basculerIndisponible(true);
    var titre = document.getElementById('cal-indisponible-titre');
    if (titre) titre.textContent = 'Disponibilités sur demande';
    var texte = document.getElementById('cal-indisponible-texte');
    if (texte) texte.textContent = 'Indiquez-nous vos dates : nous vous répondons ' +
      'rapidement pour vous confirmer la disponibilité et le prix.';
    ajusterNote();

  } else if (MODE === 'auto') {
    brancherFleches();
    ajusterNote();
    afficherAttente();

    recupererDisponibilites()
      .then(appliquerSynchronisation)
      .catch(function () {
        // Le réseau a échoué, ou le serveur n'a pas répondu à temps.
        if (REPLI_MANUEL) {
          afficherBandeauEtat('hors-service',
            'Les disponibilités ne sont pas synchronisées en ce moment : ' +
            'les dates ci-dessous sont celles tenues à la main. ' +
            'Confirmez vos dates par téléphone ou par e-mail.');
          rendre();
        } else {
          effacerBandeauEtat();
          basculerIndisponible(true);
        }
      });

  } else {
    brancherFleches();
    ajusterNote();
    rendre();
  }
})();
