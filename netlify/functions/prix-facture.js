// Stocke et sert les factures PDF.
//
//  POST  (x-maj-secret)   { client, fichier, base64 }  -> range le PDF
//  GET   (x-prix-code)    ?fichier=...&client=...      -> renvoie le PDF
//
// Les PDF ne sont jamais dans le dépôt : ils vivent dans Netlify Blobs,
// et ne sortent qu'avec le code du client.

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

const cle = (client) => String(client).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const cleFichier = (fichier) => String(fichier).toLowerCase().replace(/[^a-z0-9.]+/g, "-");

function codes() {
  const brut = (process.env.PRIX_CODES || "").trim();
  return brut.split(/[|;,]/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const i = b.indexOf(":");
    return {
      code: (i === -1 ? b : b.slice(0, i)).trim().toUpperCase(),
      nom: i === -1 ? "" : b.slice(i + 1).trim(),
    };
  });
}

exports.handler = async (event) => {
  const entetes = event.headers || {};
  const store = magasin();

  // --- dépôt depuis le serveur ---
  if (event.httpMethod === "POST") {
    const secret = process.env.PRIX_MAJ_SECRET || "";
    if (!secret || !identiques(entetes["x-maj-secret"] || "", secret)) {
      return { statusCode: 401, body: JSON.stringify({ erreur: "secret invalide" }) };
    }
    let corps;
    try {
      corps = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ erreur: "json invalide" }) };
    }
    if (!corps.client || !corps.fichier || !corps.base64) {
      return { statusCode: 400, body: JSON.stringify({ erreur: "champs manquants" }) };
    }
    const buffer = Buffer.from(corps.base64, "base64");
    const k = `facture/${cle(corps.client)}/${cleFichier(corps.fichier)}`;
    await store.set(k, buffer, { metadata: { fichier: corps.fichier, client: corps.client } });
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, cle: k, octets: buffer.length }),
    };
  }

  // --- lecture par le client ---
  const q = event.queryStringParameters || {};
  const fourni = (entetes["x-prix-code"] || q.code || "").trim().toUpperCase();
  let client = null;
  for (const c of codes()) if (fourni && identiques(fourni, c.code)) client = c.nom || c.code;

  if (!client || !q.fichier) {
    return { statusCode: 401, body: JSON.stringify({ erreur: "acces refuse" }) };
  }

  try {
    const k = `facture/${cle(client)}/${cleFichier(q.fichier)}`;
    const data = await store.get(k, { type: "arrayBuffer" });
    if (!data) return { statusCode: 404, body: JSON.stringify({ erreur: "facture inconnue" }) };
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${q.fichier}"`,
        "cache-control": "private, max-age=600",
      },
      body: Buffer.from(data).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erreur: "lecture impossible" }) };
  }
};
