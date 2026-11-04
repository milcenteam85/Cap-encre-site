// Reçoit les données d'un client depuis le serveur et les range dans Blobs.
// Protégée par un secret partagé (variable PRIX_MAJ_SECRET).
//
//   curl -X POST https://capencre.fr/.netlify/functions/prix-maj \
//        -H "x-maj-secret: ..." -H "content-type: application/json" \
//        -d '{"client":"Café des Halles","data":{...}}'

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

const identiques = (a, b) => {
  const ta = Buffer.from(String(a));
  const tb = Buffer.from(String(b));
  return ta.length === tb.length && crypto.timingSafeEqual(ta, tb);
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ erreur: "POST attendu" }) };
  }

  const secret = process.env.PRIX_MAJ_SECRET || "";
  const fourni = (event.headers || {})["x-maj-secret"] || "";
  if (!secret || !identiques(fourni, secret)) {
    return { statusCode: 401, body: JSON.stringify({ erreur: "secret invalide" }) };
  }

  let corps;
  try {
    corps = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ erreur: "json invalide" }) };
  }

  const client = (corps.client || "").trim();
  if (!client || !corps.data) {
    return { statusCode: 400, body: JSON.stringify({ erreur: "client ou data manquant" }) };
  }

  const cle = client.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const store = getStore("prix");
  await store.setJSON(cle, corps.data);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, cle, produits: (corps.data.produits || []).length }),
  };
};
