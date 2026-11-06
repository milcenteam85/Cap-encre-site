// Réglages par client (seuil d'alerte), stockés dans Blobs.
//
//   GET  ?code=...        -> { seuil }
//   POST {code, seuil}    -> enregistre

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
  const headers = event.headers || {};
  const q = event.queryStringParameters || {};
  let corps = {};
  if (event.httpMethod === "POST") {
    try { corps = JSON.parse(event.body || "{}"); } catch { corps = {}; }
  }
  const code = corps.code || q.code || headers["x-prix-code"] || "";
  const nom = client(code);
  if (!nom) {
    if (await bloque(event)) {
      return { statusCode: 429, headers: { "retry-after": "900" }, body: JSON.stringify({ erreur: "trop d'essais" }) };
    }
    return { statusCode: 401, body: JSON.stringify({ erreur: "code invalide" }) };
  }

  const store = magasin();
  const k = `reglages/${cle(nom)}`;

  try {
    if (event.httpMethod === "GET") {
      const r = (await store.get(k, { type: "json" })) || {};
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({
          seuil: typeof r.seuil === "number" ? r.seuil : null,
          modules: r.modules && typeof r.modules === "object" ? r.modules : null,
        }),
      };
    }
    if (event.httpMethod === "POST") {
      const r = (await store.get(k, { type: "json" })) || {};

      if (corps.modules && typeof corps.modules === "object") {
        const fusion = { ...(r.modules || {}) };
        for (const [cle, valeur] of Object.entries(corps.modules)) {
          if (/^[a-z0-9_]{2,24}$/.test(cle)) fusion[cle] = !!valeur;
        }
        r.modules = fusion;
      }

      if (corps.seuil !== undefined) {
        const s = Number(corps.seuil);
        if (!(s >= 0.5 && s <= 100)) {
          return { statusCode: 400, body: JSON.stringify({ erreur: "seuil hors limites" }) };
        }
        r.seuil = Math.round(s * 10) / 10;
      }

      await store.setJSON(k, r);
      return { statusCode: 200, body: JSON.stringify({ ok: true, seuil: r.seuil, modules: r.modules }) };
    }
    return { statusCode: 405, body: JSON.stringify({ erreur: "methode inconnue" }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erreur: "stockage" }) };
  }
};
