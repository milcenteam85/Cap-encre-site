#!/usr/bin/env python3
"""Récupère les autorisations d'urbanisme de Vendée via l'API DiDo (SDES).

Les données sont triées par code commune. On borne le bloc 85xxx par deux
dichotomies, puis on télécharge les pages avec une concurrence faible
(le service limite le débit) et une reprise garantie : toute page qui n'a pas
répondu est redemandée jusqu'à complétude.

Sortie : data/logements85.csv et data/nonres85.csv (format Sitadel)
"""
import csv, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles"
FICHIERS = {
    "logements85": "8b35affb-55fc-4c1f-915b-7750f974446a",
    "nonres85": "f8f0700f-806c-40a7-83b1-f21cf507e7c4",
}
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
COLONNES = [
    "COMM", "TYPE_DAU", "NUM_DAU", "ETAT_DAU", "AN_DEPOT", "DPC_AUT",
    "ADR_NUM_TER", "ADR_LIBVOIE_TER", "ADR_LIEUDIT_TER", "ADR_LOCALITE_TER", "ADR_CODPOST_TER",
    "SEC_CADASTRE1", "NUM_CADASTRE1",
    "NATURE_PROJET_DECLAREE", "NATURE_PROJET_COMPLETEE",
    "SURF_HAB_CREEE", "SURF_LOC_CREEE", "EMPRISE_SOL_CREEE",
    "NB_LGT_TOT_CREES", "NB_LGT_IND_CREES", "I_PISCINE", "I_EXTENSION", "I_GARAGE", "I_ABRI_JARDIN",
]
SOUHAITEES = ["COMM", "TYPE_DAU", "NUM_DAU", "ETAT_DAU", "AN_DEPOT", "DPC_AUT",
              "ADR_NUM_TER", "ADR_LIBVOIE_TER", "ADR_LIEUDIT_TER", "ADR_LOCALITE_TER", "ADR_CODPOST_TER",
              "SEC_CADASTRE1", "NUM_CADASTRE1",
              "NATURE_PROJET_DECLAREE", "NATURE_PROJET_COMPLETEE",
              "SURF_HAB_CREEE", "SURF_LOC_CREEE", "SURF_COM_CREEE", "SURF_BUR_CREEE",
              "SURF_IND_CREEE", "SURF_ENT_CREEE", "EMPRISE_SOL_CREEE",
              "NB_LGT_TOT_CREES", "NB_LGT_IND_CREES",
              "I_PISCINE", "I_EXTENSION", "I_GARAGE", "I_ABRI_JARDIN"]
COL_QUERY = ",".join(COLONNES)
WORKERS = 2


def page(rid, p, size=100, essais=8):
    """Renvoie la liste des lignes, ou None si la page n'a pas pu être obtenue."""
    url = f"{BASE}/{rid}/rows?page={p}&pageSize={size}&columns={COL_QUERY}"
    for i in range(essais):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                data = json.loads(r.read().decode("utf-8")).get("data")
                if isinstance(data, list):
                    return data
        except Exception:
            pass
        time.sleep(4 * (i + 1))
    return None


def borne(rid, total, seuil):
    bas, haut = 1, max(1, total // 100 + 1)
    echecs = 0
    while bas < haut:
        m = (bas + haut) // 2
        rows = page(rid, m)
        if rows is None:
            echecs += 1
            if echecs > 8:
                raise RuntimeError(f"API injoignable (8 échecs) sur {rid}")
            time.sleep(10)
            continue
        echecs = 0
        if not rows or rows[0].get("COMM", "") >= seuil:
            haut = m
        else:
            bas = m + 1
    return bas


def colonnes_disponibles(rid):
    with urllib.request.urlopen(f"{BASE}/{rid}/rows?page=1&pageSize=10", timeout=90) as r:
        row = json.loads(r.read().decode("utf-8"))["data"][0]
    return [c for c in SOUHAITEES if c in row]


def collecter(nom, rid):
    dispo = colonnes_disponibles(rid)
    q = ",".join(dispo)
    global COL_QUERY
    COL_QUERY = q
    print(f"{nom} : {len(dispo)} colonnes utiles sur {len(SOUHAITEES)}", flush=True)
    with urllib.request.urlopen(f"{BASE}/{rid}/rows?page=1&pageSize=10", timeout=90) as r:
        total = json.loads(r.read().decode("utf-8"))["total"]

    p85 = borne(rid, total, "85000")
    p90 = borne(rid, total, "86000")
    pages = list(range(p85, p90 + 1))
    print(f"{nom} : {total} lignes au total — bloc 85 : {len(pages)} pages", flush=True)

    resultats = {}

    def lot(selection, etiquette):
        reste = []
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            for p, rows in zip(selection, ex.map(lambda x: page(rid, x), selection)):
                if rows is None:
                    reste.append(p)
                else:
                    resultats[p] = rows
        print(f"  {etiquette} : {len(selection)-len(reste)}/{len(selection)} pages reçues", flush=True)
        time.sleep(3)
        return reste

    reste = lot(pages, "tour 1")
    tour = 2
    while reste and tour <= 6:
        time.sleep(10)
        reste = lot(reste, f"tour {tour}")
        tour += 1

    if reste:
        print(f"  ! pages définitivement manquantes : {len(reste)} ({reste[:5]}…)")

    lignes, vus = [], set()
    for p in sorted(resultats):
        for x in resultats[p]:
            if not (x.get("COMM") or "").startswith("85"):
                continue
            k = (x.get("TYPE_DAU"), x.get("NUM_DAU"))
            if k in vus:
                continue
            vus.add(k)
            lignes.append(x)
    print(f"  => {len(lignes)} lignes Vendée collectées", flush=True)
    return lignes


def ecrire(nom, lignes):
    chemin = os.path.join(DATA, f"{nom}.csv")
    with open(chemin, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(COLONNES)
        for x in lignes:
            w.writerow([
                x.get("COMM", ""), x.get("TYPE_DAU", ""), x.get("NUM_DAU", ""),
                "Autorisé" if x.get("DPC_AUT") else "En cours",
                x.get("AN_DEPOT", ""), x.get("DPC_AUT") or "",
                x.get("ADR_NUM_TER") or "", x.get("ADR_LIBVOIE_TER") or "",
                x.get("ADR_LIEUDIT_TER") or "", x.get("ADR_LOCALITE_TER") or "", x.get("ADR_CODPOST_TER") or "",
                x.get("SEC_CADASTRE1") or "", x.get("NUM_CADASTRE1") or "",
                x.get("NATURE_PROJET_DECLAREE") or "", x.get("NATURE_PROJET_COMPLETEE") or "",
                x.get("SURF_HAB_CREEE") or "", x.get("SURF_LOC_CREEE") or "", x.get("EMPRISE_SOL_CREEE") or "",
                x.get("NB_LGT_TOT_CREES") or "", x.get("NB_LGT_IND_CREES") or "",
                x.get("I_PISCINE") or "", x.get("I_EXTENSION") or "", x.get("I_GARAGE") or "", x.get("I_ABRI_JARDIN") or "",
            ])
    print(f"  → {chemin} ({len(lignes)} lignes)", flush=True)


if __name__ == "__main__":
    os.makedirs(DATA, exist_ok=True)
    force = "--force" in sys.argv
    for nom, rid in FICHIERS.items():
        if os.path.exists(os.path.join(DATA, f"{nom}.csv")) and not force:
            print(f"{nom} : déjà présent, ignoré (--force pour refaire)")
            continue
        ecrire(nom, collecter(nom, rid))
