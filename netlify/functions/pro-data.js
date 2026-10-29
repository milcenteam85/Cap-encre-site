// Stockage des données d'un client Cap Encre Pro (chantiers, clients, réglages).
//
// - authentification : même code que la veille, envoyé dans l'en-tête x-veille-code
// - chaque client a son propre espace, identifié par une empreinte de son code
// - lecture  : GET  /.netlify/functions/pro-data
// - écriture : POST /.netlify/functions/pro-data   (corps : { data: {...} })

const crypto = require("crypto");

let getStore = null;
let errBlobs = "";
try {
  ({ getStore } = require("@netlify/blobs"));
} catch (e) {
  errBlobs = String(e && e.message || e);
}

function codes() {
  const brut = (process.env.VEILLE_CODES || process.env.VEILLE_CODE || "").trim();
  if (!brut) return [];
  return brut.split(/[|;,]/).map(b => b.trim()).filter(Boolean).map(bloc => {
    const i = bloc.indexOf(":");
    return {
      code: (i === -1 ? bloc : bloc.slice(0, i)).trim().toUpperCase(),
      nom: i === -1 ? "" : bloc.slice(i + 1).trim(),
    };
  }).filter(e => e.code.length >= 6);
}

function identiques(a, b) {
  const ta = Buffer.from(String(a)), tb = Buffer.from(String(b));
  if (ta.length !== tb.length) return false;
  return crypto.timingSafeEqual(ta, tb);
}

function clientDeLaRequete(event) {
  const h = event.headers || {};
  const fourni = (h["x-veille-code"] || h["X-Veille-Code"] || "").trim().toUpperCase();
  if (!fourni) return null;
  let trouve = null;
  for (const e of codes()) if (identiques(fourni, e.code)) trouve = e;
  if (!trouve) return null;
  // identifiant stable et non réversible : le code lui-même ne sert jamais de clé
  const id = crypto.createHash("sha256").update(trouve.code + "|capencre").digest("hex").slice(0, 24);
  return { id, nom: trouve.nom, code: trouve.code };
}

const vide = () => ({ clients: [], chantiers: [], reglages: {} });

exports.handler = async (event) => {
  const client = clientDeLaRequete(event);
  if (!client) {
    await new Promise(r => setTimeout(r, 300));
    return { statusCode: 401, body: JSON.stringify({ erreur: "code invalide" }) };
  }
  if (!getStore) {
    return { statusCode: 503, body: JSON.stringify({ erreur: "stockage indisponible", detail: errBlobs }) };
  }

  // Sur Netlify, le contexte Blobs n'est pas toujours injecté : on le reconstitue
  // avec l'identifiant du site et le jeton fourni au runtime des fonctions.
  const options = { name: "capencre-pro", consistency: "strong" };
  if (!process.env.NETLIFY_BLOBS_CONTEXT && process.env.SITE_ID) {
    options.siteID = process.env.SITE_ID;
    options.token = process.env.BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || "";
  }
  const store = getStore(options);
  const cle = `client/${client.id}.json`;

  try {
    if (event.httpMethod === "GET") {
      const brut = await store.get(cle, { type: "json" });
      return {
        statusCode: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        body: JSON.stringify({ client: client.nom, data: brut || vide() }),
      };
    }

    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
      const corps = JSON.parse(event.body || "{}");
      const d = corps.data;
      if (!d || typeof d !== "object" || Array.isArray(d)) {
        return { statusCode: 400, body: JSON.stringify({ erreur: "données attendues" }) };
      }
      // on ne garde que ce qu'on sait lire, et on borne la taille
      const propre = {
        clients: Array.isArray(d.clients) ? d.clients.slice(0, 500) : [],
        chantiers: Array.isArray(d.chantiers) ? d.chantiers.slice(0, 2000) : [],
        reglages: (d.reglages && typeof d.reglages === "object") ? d.reglages : {},
      };
      const taille = JSON.stringify(propre).length;
      if (taille > 2_000_000) {
        return { statusCode: 413, body: JSON.stringify({ erreur: "données trop volumineuses" }) };
      }
      await store.setJSON(cle, propre);
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ ok: true, taille }),
      };
    }

    return { statusCode: 405, body: JSON.stringify({ erreur: "méthode non autorisée" }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erreur: "stockage: " + e.message }) };
  }
};
