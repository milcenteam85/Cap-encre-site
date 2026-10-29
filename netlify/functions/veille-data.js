// Fonction Netlify : sert les données de la veille aux clients qui présentent
// leur code d'accès personnel.
//
// Variable d'environnement VEILLE_CODES, au format :
//   CAP-AAAA-1111:Menuiserie Lefèvre|CAP-BBBB-2222:Dupont Couverture
// (le nom après ":" est facultatif ; séparateur "|" — ";" et "," acceptés)
//
// Pour couper l'accès à un client : supprimez son entrée, redéployez.

const crypto = require("crypto");
const permis = require("./_data/permis.json");
const communes = require("./_data/communes.json");

const MAX_ENTREES = 300;

function entrees() {
  const brut = (process.env.VEILLE_CODES || process.env.VEILLE_CODE || "").trim();
  if (!brut) return [];
  return brut
    .split(/[|;,]/)
    .map((bloc) => bloc.trim())
    .filter(Boolean)
    .slice(0, MAX_ENTREES)
    .map((bloc) => {
      const i = bloc.indexOf(":");
      const code = (i === -1 ? bloc : bloc.slice(0, i)).trim().toUpperCase();
      const nom = i === -1 ? "" : bloc.slice(i + 1).trim();
      return { code, nom };
    })
    .filter((e) => e.code.length >= 6);
}

function identiques(a, b) {
  const ta = Buffer.from(String(a));
  const tb = Buffer.from(String(b));
  if (ta.length !== tb.length) return false;
  return crypto.timingSafeEqual(ta, tb);
}

exports.handler = async (event) => {
  const liste = entrees();
  if (!liste.length) {
    return { statusCode: 500, body: JSON.stringify({ erreur: "aucun code configuré" }) };
  }

  const entetes = event.headers || {};
  const fourni = (entetes["x-veille-code"] || entetes["X-Veille-Code"] || "").trim().toUpperCase();

  // on parcourt toute la liste, sans sortie anticipée
  let trouve = null;
  for (const e of liste) {
    if (fourni && identiques(fourni, e.code)) trouve = e;
  }

  if (!trouve) {
    await new Promise((r) => setTimeout(r, 400)); // ralentit les essais
    return {
      statusCode: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ erreur: "code invalide" }),
    };
  }

  // trace utile pour la facturation : visible dans les logs de la fonction
  console.log(`veille: acces ${trouve.nom || "(sans nom)"} - ${new Date().toISOString()}`);

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
    body: JSON.stringify({ permis, communes, client: trouve.nom || "" }),
  };
};
