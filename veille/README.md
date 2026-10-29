# Veille permis de construire — Vendée

Outil destiné aux artisans : liste des autorisations d'urbanisme déposées autour
de leur commune, filtrable par rayon, période, nature de projet et surface.

## Ce que c'est

Un fichier `index.html` autonome, sans serveur, qui affiche des données
préparées à l'avance. Aucune requête externe à l'ouverture.

## D'où viennent les données

Source officielle : **Sitadel / SDES**, jeu de données « Liste des permis de
construire et autres autorisations d'urbanisme », publié sur data.gouv.fr and
mis à jour chaque mois.

Deux fichiers sont utilisés :
- *autorisations créant des logements* (maisons, extensions, piscines…)
- *autorisations créant des locaux non résidentiels* (bâtiments agricoles,
  commerces, hangars…)

On ne conserve que le département **85 (Vendée)**, les types **PC / DP / PA**,
et les **30 derniers mois**.

## Mise à jour mensuelle

```bash
cd ~/projets/cap-encre/veille
python3 fetch85.py     # récupère le bloc Vendée via l'API DiDo (SDES)
python3 build.py       # produit data/permis.js et data/communes.js
git add -A && git commit -m "Veille : mise à jour $(date +%Y-%m)" && git push
```

`fetch85.py` exploite le fait que les données de l'API sont **triées par code
commune** : une dichotomie localise la première page du bloc `85xxx`, puis on
avance jusqu'à la fin du bloc. Cela évite de télécharger le fichier national
(plus de 600 Mo).

## Fichiers

| Fichier | Rôle |
|---|---|
| `fetch85.py` | récupère les lignes Vendée depuis l'API SDES |
| `build.py` | nettoie, catégorise et compacte les données |
| `data/permis.js` | `window.PERMIS` — les autorisations |
| `data/communes.js` | `window.COMMUNES` — nom, coordonnées, population |
| `data/communes85.csv` | source des coordonnées (geo.api.gouv.fr) |
| `index.html` | l'outil |

## Limites à connaître

- **Précision de la date** : le mois de la décision (`DPC_AUT`). Pour les
  dossiers en cours, seule l'année de dépôt est connue.
- **Distance** : calculée depuis le **centre de la commune**, pas depuis
  l'adresse exacte. C'est une indication, pas une mesure.
- **Pas de nom du pétitionnaire** : volontairement exclu. Le jeu de données
  public le contient, mais le republier poserait un problème RGPD et
  transformerait l'outil en fichier de prospection.
- **Délai** : Sitadel est publié avec environ un mois de retard.
- Les surfaces ne sont pas toujours renseignées ; l'outil affiche alors la
  mention « non renseignée » plutôt qu'un zéro trompeur.
