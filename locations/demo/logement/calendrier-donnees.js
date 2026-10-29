/* =========================================================================
   La Maison dans les Dunes — DONNÉES DU CALENDRIER
   -------------------------------------------------------------------------
   C'EST LE SEUL FICHIER À MODIFIER pour changer un tarif, marquer des dates
   comme réservées, ou activer la synchronisation automatique.
   Tout est expliqué au fur et à mesure.

   Règle de prudence : on ne change que des nombres, des dates entre
   guillemets, et les mots « auto », « manuel » ou « masque ». Rien d'autre.
   Et on ne supprime jamais une virgule en fin de ligne : c'est elle qui
   sépare les blocs entre eux.
   ========================================================================= */

window.CALENDRIER = {

  /* --- Années à afficher dans le calendrier ---------------------------
     Le gîte est ouvert d'avril à octobre. On liste ici les années que le
     client peut consulter. Ajouter « 2028 » le moment venu, c'est tout. */
  annees: [2026, 2027],

  /* --- Tarifs ---------------------------------------------------------
     Les tarifs se répètent tout seuls chaque année : « 04-01 » veut dire
     le 1er avril, quelle que soit l'année. Pas besoin de tout réécrire.

     prixNuit    : prix pour une nuit. Mettre null si aucun prix à la nuit.
     prixSemaine : prix pour 7 nuits. Mettre null si aucun prix à la semaine.

     ⚠️ EN HAUTE SAISON, ON NE LOUe QU'À LA SEMAINE. PrixNuit reste donc à
     null : le calendrier n'affiche alors AUCUN prix sous les dates, plutôt
     qu'un prix à la nuit qui n'existe pas. C'est la règle la plus importante
     de ce fichier — un prix affiché faux est pire que pas de prix.

     --- LES RÈGLES DE SÉJOUR, PAR PÉRIODE -------------------------------

     nuitsMinimum : nombre de nuits minimum si le séjour COMMENCE dans cette
                    période. Mettre 1 pour n'imposer aucune limite.

     arrivee / depart : jours de la semaine autorisés. Écrire un ou plusieurs
                    jours parmi :
                      "lundi" "mardi" "mercredi" "jeudi" "vendredi"
                      "samedi" "dimanche"
                    ou "tous" pour n'imposer aucun jour.

                    Exemple : arrivee: "samedi", depart: "samedi" — c'est la
                    règle de la plupart des gîtes en juillet-août.

     La première période qui correspond à la date s'applique. Les périodes
     doivent être classées dans l'ordre de l'année. */
    periodes: [
      { de: "04-01", a: "06-30", libelle: "Basse saison",
        prixNuit: 200,  prixSemaine: 850,
        nuitsMinimum: 2, arrivee: "tous", depart: "tous" },

      { de: "07-01", a: "08-31", libelle: "Juillet-août",
        prixNuit: null, prixSemaine: 1400,
        nuitsMinimum: 7, arrivee: "samedi", depart: "samedi" },

      { de: "09-01", a: "10-31", libelle: "Basse saison",
        prixNuit: 200,  prixSemaine: 850,
        nuitsMinimum: 2, arrivee: "tous", depart: "tous" }
    ],

    /* --- Forfait ménage --------------------------------------------------
       Ajouté une seule fois au total, quel que soit le nombre de nuits.
       Mettre 0 si le ménage est déjà compris dans le prix. */
    menage: { libelle: "Forfait ménage", montant: 80 },

    /* --- Ce qui est compris, et ce qui ne l'est pas ----------------------
       Ces deux listes s'affichent sous le détail du prix. Elles évitent les
       malentendus au moment de la réservation — et les réclamations après.
       Pour n'afficher aucune liste, écrire : inclus: [],                 */
    inclus: [
      "Draps, linge de toilette et linge de maison",
      "Ménage de fin de séjour",
      "Chauffage et électricité"
    ],
    nonInclus: [
      "Taxe de séjour, à régler sur place",
      "Caution, restituée après le départ"
    ],

  /* --- Synchronisation automatique -------------------------------------
     mode :

       "auto"   -> les jours réservés sont relus plusieurs fois par jour
                   depuis votre calendrier Airbnb ou Booking. C'est ce que
                   vend la formule « Direct ». Le site doit alors être
                   installé chez Netlify : voir le README, section
                   « Synchroniser le calendrier ».

       "manuel" -> vous écrivez les jours réservés à la main, juste en
                   dessous. Aucune installation particulière. Ne fonctionne
                   qu'avec les exemples donnés ici. C'est le réglage par
                   défaut.

       "masque" -> aucun calendrier n'est affiché. Les visiteurs vous
                   demandent leurs dates par téléphone ou par le formulaire.

     repliManuel : en mode « auto » seulement. Si la synchronisation tombe
                   en panne, faut-il afficher quand même la liste écrite à
                   la main, avec un avertissement ?

                     false -> NON (recommandé) : le calendrier disparaît et
                              laisse la place à « appelez-nous ». C'est le
                              réglage sûr : on n'affiche jamais de dates
                              dont on n'est pas sûr.
                     true  -> OUI, à condition de tenir la liste à la main
                              en parallèle. */
  synchronisation: {
    mode: "auto",
    adresse: "/api/disponibilites",
    repliManuel: true,
    delaiMax: 8000
  },

  /* --- Jours déjà réservés, écrits à la main ---------------------------
     Un bloc = une période indisponible. Les dates vont du premier au
     dernier jour indisponibles, INCLUS.

     En mode « auto », ces blocs s'AJOUTENT à ceux venus d'Airbnb : pratique
     pour bloquer des jours que les plateformes ne connaissent pas (travaux,
     usage personnel).

     ⚠️ LES DEUX BLOCS CI-DESSOUS SONT DES EXEMPLES de démonstration.
     Remplacez-les par vos vraies réservations. Pour n'en garder aucun,
     écrivez : indisponible: [],                                  */
  indisponible: [
    { de: "2026-10-17", a: "2026-10-24", motif: "Réservé" },
    { de: "2027-04-11", a: "2027-04-18", motif: "Réservé" }
  ],

  /* --- Règles de séjour -----------------------------------------------
     Les règles se règlent maintenant DANS CHAQUE PÉRIODE, plus haut :
     nuitsMinimum, arrivee, depart. C'est là qu'il faut aller.

     nuitsMinimum : conservé ici comme filet de sécurité, pour le cas où une
                    période aurait oublié de préciser le sien.
                    Mettre 1 pour n'imposer aucune limite. */
  nuitsMinimum: 1

};
