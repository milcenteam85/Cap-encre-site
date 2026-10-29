#!/usr/bin/env python3
"""Construit les données de la veille permis (Vendée) depuis les CSV Sitadel.

Entrées : data/logements85.csv, data/nonres85.csv, data/communes85.csv
Sorties : data/permis.js, data/communes.js
"""
import csv, json, os, re, sys, unicodedata
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SORTIE = os.path.join(HERE, "..", "netlify", "functions", "_data")
MOIS = int(os.environ.get("MOIS", "30"))

def limitrophe(annee, mois):
    """Décalage de N mois vers l'arrière, en 'AAAA-MM'."""
    total = annee * 12 + (mois - 1) - MOIS
    return f"{total // 12:04d}-{total % 12 + 1:02d}"

AUJOURDHUI = date.today()
SEUIL = limitrophe(AUJOURDHUI.year, AUJOURDHUI.month)

def norme(s):
    s = (s or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def nombre(v, defaut=0.0):
    try:
        return float(str(v).replace(",", ".").replace(" ", ""))
    except Exception:
        return defaut

CLUSTER = re.compile("\u00c3\u0082\u00c2([\u0080-\u009f])")

def adresse_propre(s):
    """Les libellés d'adresse de Sitadel contiennent des séquences mal décodées
    (accents passés par deux encodages successifs). On les répare, puis on
    translittère ce qui reste : mieux vaut "VENDEE" que "VENDAÃÂ‰E"."""
    if not s:
        return ""
    s = CLUSTER.sub(lambda m: chr(ord(m.group(1)) + 0x40), s)
    s = s.replace("\u00c2", "").replace("\u0082", "")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = "".join(c if ord(c) < 128 else " " for c in s)
    return re.sub(r"\s{2,}", " ", s).strip()


def mois_iso(v):
    v = (v or "").strip()
    if len(v) >= 7 and v[4] == "-":
        return v[:7]
    return ""

def nature_courte(row):
    """Nature du projet, déduite des codes Sitadel et des drapeaux du dossier.

    NATURE_PROJET_COMPLETEE (depuis mai 2022) :
      1 = nouvelle construction          4 = transformation avec diminution
      2 = transformation sans extension  5 = extension sans transformation
      3 = transformation avec extension  6 = diminution sans transformation
    """
    def drapeau(nom): return str(row.get(nom) or "").strip().lower() in ("1", "true", "oui")
    code = str(row.get("NATURE_PROJET_COMPLETEE") or "").strip()

    if drapeau("I_PISCINE"): return "Piscine"
    if drapeau("I_ABRI_JARDIN"): return "Abri de jardin"
    if drapeau("I_GARAGE"): return "Garage"
    if code in ("3", "5") or drapeau("I_EXTENSION"): return "Extension"
    if nombre(row.get("SURF_LOC_CREEE")) > 0 and nombre(row.get("SURF_HAB_CREEE")) == 0:
        return "Local / bâtiment"
    if code == "1": return "Maison"
    if code in ("2", "4", "6"): return "Rénovation"
    if nombre(row.get("SURF_HAB_CREEE")) > 0: return "Maison"
    return "Travaux divers"

def lire(nom):
    chemin = os.path.join(DATA, nom)
    if not os.path.exists(chemin):
        print(f"  ! {nom} absent"); return []
    with open(chemin, newline="", encoding="utf-8", errors="replace") as f:
        lignes = list(csv.DictReader(f, delimiter=";"))
    print(f"  {nom} : {len(lignes)} lignes"); return lignes

def construire():
    permis, vus = [], set()
    for nom in ("logements85.csv", "nonres85.csv"):
        for row in lire(nom):
            type_dau = (row.get("TYPE_DAU") or "").strip().upper()
            if type_dau not in ("PC", "DP", "PA"): continue
            d = mois_iso(row.get("DPC_AUT"))
            annee_seule = False
            annee = (row.get("AN_DEPOT") or "").strip()[:4]
            if not d and annee.isdigit():
                d = f"{annee}-01"; annee_seule = True
            if not d or d < SEUIL: continue

            commune = (row.get("COMM") or "").strip()
            cle = f"{type_dau}-{commune}-{(row.get('NUM_DAU') or '').strip()}"
            if cle in vus: continue
            vus.add(cle)

            surf = max(nombre(row.get("SURF_HAB_CREEE")), nombre(row.get("SURF_LOC_CREEE")),
                       nombre(row.get("EMPRISE_SOL_CREEE")))
            adresse = adresse_propre(" ".join(x for x in [(row.get("ADR_NUM_TER") or "").strip(),
                                           (row.get("ADR_LIBVOIE_TER") or "").strip(),
                                           (row.get("ADR_LIEUDIT_TER") or "").strip()] if x))
            parcelle = ""
            if (row.get("SEC_CADASTRE1") or "").strip():
                parcelle = f"{(row.get('SEC_CADASTRE1') or '').strip()} {(row.get('NUM_CADASTRE1') or '').strip()}".strip()

            permis.append({
                "d": d, "c": commune, "t": type_dau, "n": nature_courte(row),
                "s": round(surf, 1), "a": adresse, "p": parcelle,
                "l": int(nombre(row.get("NB_LGT_TOT_CREES"))),
                "e": "A" if (row.get("ETAT_DAU") or "").strip().lower().startswith("autor") else "E",
                **({"m": 1} if annee_seule else {}),
            })

    permis.sort(key=lambda x: x["d"], reverse=True)
    print(f"  => {len(permis)} autorisations retenues depuis {SEUIL}")
    return permis

def communes():
    chemin = os.path.join(DATA, "communes85.csv")
    if not os.path.exists(chemin):
        print("  ! communes85.csv absent — pas de coordonnées"); return {}
    with open(chemin, newline="", encoding="utf-8") as f:
        lignes = list(csv.DictReader(f))
    return {r["code"]: {"n": r["nom"], "lat": round(float(r["lat"]), 4), "lon": round(float(r["lon"]), 4),
                        "pop": int(float(r.get("population") or 0))} for r in lignes}

def main():
    permis = construire()
    comm = communes()
    if not permis:
        print("Rien à écrire.")
        return 1
    os.makedirs(SORTIE, exist_ok=True)
    with open(os.path.join(SORTIE, "permis.json"), "w", encoding="utf-8") as f:
        json.dump(permis, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(SORTIE, "communes.json"), "w", encoding="utf-8") as f:
        json.dump(comm, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  permis.json : {os.path.getsize(os.path.join(SORTIE,'permis.json'))/1024:.0f} Ko")
    print(f"  communes.json : {os.path.getsize(os.path.join(SORTIE,'communes.json'))/1024:.0f} Ko")
    return 0


if __name__ == "__main__":
    sys.exit(main())
