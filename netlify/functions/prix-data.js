// Sert les prix d'un client, sur présentation de son code d'accès.
//
// Variable d'environnement PRIX_CODES, au format :
//   ROYAN-2026-4471:Café des Halles|...
//
// Les données ne sont pas dans le dépôt : elles sont poussées par le serveur
// dans Netlify Blobs, via la fonction prix-maj.

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

function magasin() {
  // Sur Netlify, le contexte est fourni automatiquement. En cas de doute,
  // on peut forcer avec BLOBS_SITE_ID et BLOBS_TOKEN.
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token ? getStore({ name: "prix", siteID, token }) : getStore("prix");
}


function codes() {
  const brut = (process.env.PRIX_CODES || "").trim();
  if (!brut) return [];
  return brut
    .split(/[|;,]/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const i = b.indexOf(":");
      const code = (i === -1 ? b : b.slice(0, i)).trim().toUpperCase();
      return { code, nom: i === -1 ? "" : b.slice(i + 1).trim() };
    })
    .filter((e) => e.code.length >= 6);
}

const identiques = (a, b) => {
  const ta = Buffer.from(String(a));
  const tb = Buffer.from(String(b));
  return ta.length === tb.length && crypto.timingSafeEqual(ta, tb);
};

exports.handler = async (event) => {
  const liste = codes();
  const entetes = event.headers || {};
  const fourni = (entetes["x-prix-code"] || "").trim().toUpperCase();

  let trouve = null;
  for (const e of liste) if (fourni && identiques(fourni, e.code)) trouve = e;

  if (!trouve) {
    await new Promise((r) => setTimeout(r, 400));
    return {
      statusCode: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ erreur: "code invalide" }),
    };
  }

  const cle = (trouve.nom || trouve.code).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  try {
    const store = magasin();
    const data = await store.get(cle, { type: "json" });
    if (!data) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ erreur: "aucune donnée pour ce client" }),
      };
    }
    console.log(`prix: acces ${trouve.nom} - ${new Date().toISOString()}`);
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ erreur: "lecture impossible", detail: String(e && e.message || e) }),
    };
  }
};
