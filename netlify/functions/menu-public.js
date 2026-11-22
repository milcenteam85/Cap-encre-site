// Lecture publique de la dernière carte validée d'un restaurant.
// Exemple : /.netlify/functions/menu-public?client=Le%20Petit%20Exemple

const { getStore } = require("@netlify/blobs");

function store() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  const options = { name: "menus", consistency: "strong" };
  return siteID && token ? getStore({ ...options, siteID, token }) : getStore(options);
}

function clientKey(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 80);
}

exports.handler = async (event) => {
  const client = event.queryStringParameters && event.queryStringParameters.client;
  if (!client) return { statusCode: 400, body: JSON.stringify({ error: "client requis" }) };

  const menu = await store().get(`current/${clientKey(client)}.json`, { type: "json" });
  if (!menu) return { statusCode: 404, body: JSON.stringify({ error: "aucune carte validée" }) };

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(menu),
  };
};
