// Fonction Netlify : sert les données de la veille uniquement à qui présente
// le code d'accès. Le code vit dans une variable d'environnement (VEILLE_CODE),
// jamais dans le dépôt — qui est public.

const crypto = require("crypto");
const permis = require("./_data/permis.json");
const communes = require("./_data/communes.json");

const egaux = (a, b) => {
  const ta = Buffer.from(String(a));
  const tb = Buffer.from(String(b));
  if (ta.length !== tb.length) return false;
  return crypto.timingSafeEqual(ta, tb);
};

exports.handler = async (event) => {
  const attendu = process.env.VEILLE_CODE || "";
  if (!attendu) {
    return { statusCode: 500, body: JSON.stringify({ erreur: "code non configuré" }) };
  }

  const entetes = event.headers || {};
  const fourni = (entetes["x-veille-code"] || entetes["X-Veille-Code"] || "").trim();

  if (!fourni || !egaux(fourni, attendu)) {
    await new Promise((r) => setTimeout(r, 400)); // ralentit les essais
    return {
      statusCode: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ erreur: "code invalide" }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
    body: JSON.stringify({ permis, communes }),
  };
};
