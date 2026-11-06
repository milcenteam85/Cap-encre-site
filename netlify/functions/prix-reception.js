// Contrôle à la réception.
// Le restaurateur saisit le bon de livraison (fournisseur, date, montant).
// L'écran rapproche ensuite chaque bon de la facture arrivée par mail.

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
  const k = `receptions/${cle(nom)}`;

  try {
    const actuel = (await store.get(k, { type: "json" })) || { receptions: [] };
    const receptions = Array.isArray(actuel.receptions) ? actuel.receptions : [];

    if (event.httpMethod === "GET") {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ receptions: receptions.slice(-500) }),
      };
    }

    if (event.httpMethod === "POST") {
      const r = corps.reception || {};
      const fournisseur = String(r.fournisseur || "").trim().slice(0, 80);
      const montant = Number(r.montant);
      if (!fournisseur || !(montant > 0)) {
        return { statusCode: 400, body: JSON.stringify({ erreur: "fournisseur ou montant manquant" }) };
      }
      const reception = {
        id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) ? r.date : new Date().toISOString().slice(0, 10),
        fournisseur,
        montant: Math.round(montant * 100) / 100,
        colis: Math.max(0, Math.min(999, Number(r.colis) || 0)),
        note: String(r.note || "").slice(0, 160),
      };
      receptions.push(reception);
      await store.setJSON(k, { receptions: receptions.slice(-500) });
      return { statusCode: 200, body: JSON.stringify({ ok: true, reception }) };
    }

    if (event.httpMethod === "DELETE") {
      const id = String(corps.id || q.id || "");
      await store.setJSON(k, { receptions: receptions.filter((x) => x.id !== id) });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ erreur: "methode inconnue" }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erreur: "stockage" }) };
  }
};
