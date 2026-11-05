// Recettes : lecture et enregistrement, protégés par le code du client.
//
//   GET    ?code=...            -> liste des recettes
//   POST   {code, recette}      -> enregistre ou met à jour une recette
//   DELETE ?code=...&id=...     -> supprime
//
// Stockage dans Netlify Blobs, clé recettes/<client>.

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

function magasin() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token ? getStore({ name: "prix", siteID, token }) : getStore("prix");
}

const identiques = (a, b) => {
  const ta = Buffer.from(String(a));
  const tb = Buffer.from(String(b));
  return ta.length === tb.length && crypto.timingSafeEqual(ta, tb);
};

const cle = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");

function client(code) {
  const brut = (process.env.PRIX_CODES || "").trim();
  for (const bloc of brut.split(/[|;,]/)) {
    const b = bloc.trim();
    if (!b) continue;
    const i = b.indexOf(":");
    const c = (i === -1 ? b : b.slice(0, i)).trim().toUpperCase();
    if (code && identiques(String(code).toUpperCase(), c)) {
      return i === -1 ? c : b.slice(i + 1).trim();
    }
  }
  return null;
}

exports.handler = async (event) => {
  const headers = event.headers || {};
  const q = event.queryStringParameters || {};
  let corps = {};
  if (event.httpMethod === "POST") {
    try { corps = JSON.parse(event.body || "{}"); } catch { corps = {}; }
  }
  const code = corps.code || q.code || headers["x-prix-code"] || "";
  const nom = client(code);
  if (!nom) return { statusCode: 401, body: JSON.stringify({ erreur: "code invalide" }) };

  const store = magasin();
  const k = `recettes/${cle(nom)}`;

  try {
    if (event.httpMethod === "GET") {
      const liste = (await store.get(k, { type: "json" })) || [];
      return {
        statusCode: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        body: JSON.stringify({ recettes: liste }),
      };
    }

    if (event.httpMethod === "POST") {
      const r = corps.recette;
      if (!r || !r.nom) return { statusCode: 400, body: JSON.stringify({ erreur: "recette incomplete" }) };
      const liste = (await store.get(k, { type: "json" })) || [];
      const id = r.id || `${Date.now()}`;
      const propre = {
        id,
        nom: String(r.nom).slice(0, 120),
        categorie: String(r.categorie || "").slice(0, 60),
        portions: Number(r.portions) || 1,
        prix_vente: Number(r.prix_vente) || 0,
        lignes: (r.lignes || []).slice(0, 60).map(l => ({
          nom: String(l.nom).slice(0, 120),
          qte_g: Number(l.qte_g) || 0,
          prix_kg: Number(l.prix_kg) || 0,
        })),
        maj_le: new Date().toISOString(),
      };
      const i = liste.findIndex(x => x.id === id);
      if (i >= 0) liste[i] = propre; else liste.push(propre);
      await store.setJSON(k, liste);
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, id }),
      };
    }

    if (event.httpMethod === "DELETE") {
      const liste = (await store.get(k, { type: "json" })) || [];
      await store.setJSON(k, liste.filter(x => x.id !== q.id));
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ erreur: "methode inconnue" }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erreur: "stockage " + String(e && e.message || e) }) };
  }
};
