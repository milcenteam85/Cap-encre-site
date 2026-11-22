// Crée un brouillon de carte en attente de validation du restaurant.
// POST /api/menu-brouillon
// En-tête : x-menu-maj-secret

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

function store() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  const options = { name: "menus", consistency: "strong" };
  return siteID && token ? getStore({ ...options, siteID, token }) : getStore(options);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST attendu" };
  const secret = process.env.MENU_MAJ_SECRET || "";
  const supplied = event.headers["x-menu-maj-secret"] || event.headers["X-Menu-Maj-Secret"];
  if (!secret || !safeEqual(supplied, secret)) return { statusCode: 401, body: "secret invalide" };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "JSON invalide" }; }
  if (!body.client || !Array.isArray(body.menuGroups) || !body.menuGroups.length) {
    return { statusCode: 400, body: "client et menuGroups requis" };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const draft = {
    token,
    client: String(body.client).slice(0, 160),
    menuGroups: body.menuGroups,
    source: body.source || {},
    destinataire: body.destinataire || "",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    status: "pending",
  };
  await store().setJSON(`drafts/${token}.json`, draft);
  const origin = process.env.URL || "https://capencre.fr";
  const validationUrl = `${origin}/.netlify/functions/menu-validation?token=${token}`;
  return {
    statusCode: 201,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true, validationUrl, expiresAt: draft.expiresAt }),
  };
};
