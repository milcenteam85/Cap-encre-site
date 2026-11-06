// Pertes et gaspillage : déclaration, valorisation au prix d'achat, total du mois.

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");
const { bloque } = require("./_garde");

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

const MOTIFS = ["casse", "date depassee", "erreur", "offert", "autre"];

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  let corps = {};
  try { corps = JSON.parse(event.body || "{}"); } catch { corps = {}; }

  const code = corps.code || q.code || (event.headers || {})["x-prix-code"] || "";
  const nom = client(code);
  if (!nom) {
    if (await bloque(event)) {
      return { statusCode: 429, headers: { "retry-after": "900" }, body: JSON.stringify({ erreur: "trop d'essais" }) };
    }
    return { statusCode: 401, body: JSON.stringify({ erreur: "code invalide" }) };
  }

  const store = magasin();
  const k = `pertes/${cle(nom)}`;

  try {
    const actuel = (await store.get(k, { type: "json" })) || { pertes: [] };
    const pertes = Array.isArray(actuel.pertes) ? actuel.pertes : [];

    if (event.httpMethod === "GET") {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ pertes: pertes.slice(-500) }),
      };
    }

    if (event.httpMethod === "POST") {
      const p = corps.perte || {};
      const nomProduit = String(p.nom || "").trim().slice(0, 120);
      const qte = Number(p.qte);
      const prix = Number(p.prix_kg);
      if (!nomProduit || !(qte > 0)) {
        return { statusCode: 400, body: JSON.stringify({ erreur: "produit ou quantite manquant" }) };
      }
      const perte = {
        id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.date)) ? p.date : new Date().toISOString().slice(0, 10),
        nom: nomProduit,
        qte: Math.round(qte * 1000) / 1000,
        unite: p.unite === "piece" ? "piece" : "kg",
        prix_kg: Math.max(0, Math.min(10000, prix || 0)),
        motif: MOTIFS.includes(p.motif) ? p.motif : "autre",
        note: String(p.note || "").slice(0, 200),
      };
      perte.montant = Math.round(perte.qte * perte.prix_kg * 100) / 100;
      pertes.push(perte);
      await store.setJSON(k, { pertes: pertes.slice(-500) });
      return { statusCode: 200, body: JSON.stringify({ ok: true, perte }) };
    }

    if (event.httpMethod === "DELETE") {
      const id = String(corps.id || q.id || "");
      const restantes = pertes.filter((x) => x.id !== id);
      await store.setJSON(k, { pertes: restantes });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ erreur: "methode inconnue" }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erreur: "stockage" }) };
  }
};
