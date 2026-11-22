// Affiche un brouillon et traite la validation du restaurant.
// Le lien est valable 72 heures et ne peut être utilisé qu'une fois.

const { getStore } = require("@netlify/blobs");

function store() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  const options = { name: "menus", consistency: "strong" };
  return siteID && token ? getStore({ ...options, siteID, token }) : getStore(options);
}

function escape(value) {
  return String(value || "").replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function page(title, content) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Cap Encre</title><style>body{margin:0;background:#f8f3eb;color:#24352f;font:16px Arial,sans-serif}main{max-width:720px;margin:0 auto;padding:48px 22px}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:42px}h2{color:#a7643d;border-bottom:1px solid #d9cbbb;padding-bottom:8px;margin-top:36px}li{padding:7px 0}.bandeau{background:#a7643d;color:white;padding:12px;text-align:center;letter-spacing:.1em;text-transform:uppercase;font-size:12px}.actions{display:flex;gap:12px;margin-top:36px;flex-wrap:wrap}button{border:0;border-radius:5px;padding:14px 22px;font-size:16px;cursor:pointer}.ok{background:#24352f;color:white}.non{background:white;color:#a7643d;border:1px solid #a7643d}</style></head><body><div class="bandeau">Validation de votre carte</div><main>${content}</main></body></html>`;
}

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  const decision = event.queryStringParameters && event.queryStringParameters.decision;
  if (!token) return { statusCode: 400, body: "Lien incomplet" };
  const blob = store();
  const draft = await blob.get(`drafts/${token}.json`, { type: "json" });
  if (!draft) return { statusCode: 404, body: "Brouillon introuvable ou lien expiré" };
  if (draft.status !== "pending" || new Date(draft.expiresAt) < new Date()) {
    return { statusCode: 410, headers: { "content-type": "text/html; charset=utf-8" }, body: page("Lien expiré", "<h1>Ce lien n'est plus disponible</h1><p>La carte a déjà été traitée ou le lien a expiré.</p>") };
  }

  if (decision === "reject") {
    draft.status = "rejected";
    draft.decidedAt = new Date().toISOString();
    await blob.setJSON(`drafts/${token}.json`, draft);
    return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: page("Carte refusée", "<h1>Carte refusée</h1><p>Merci. Cap Encre a été informé et aucune modification n'a été publiée.</p>") };
  }

  if (decision === "approve") {
    const key = String(draft.client).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    const current = await blob.get(`current/${key}.json`, { type: "json" });
    if (current) await blob.setJSON(`history/${key}/${Date.now()}.json`, current);
    const published = { client: draft.client, menuGroups: draft.menuGroups, source: draft.source, valideeLe: new Date().toISOString() };
    await blob.setJSON(`current/${key}.json`, published);
    draft.status = "approved";
    draft.decidedAt = published.valideeLe;
    await blob.setJSON(`drafts/${token}.json`, draft);
    return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: page("Carte validée", "<h1>Carte validée</h1><p>Merci. La nouvelle carte a été enregistrée avec succès.</p>") };
  }

  const groups = draft.menuGroups.map((group) => `<h2>${escape(group.title)}</h2><ul>${(group.items || []).map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`).join("");
  const base = `?token=${encodeURIComponent(token)}`;
  return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: page(draft.client, `<h1>${escape(draft.client)}</h1><p>Merci de vérifier cette nouvelle carte.</p>${groups}<div class="actions"><a href="${base}&decision=approve"><button class="ok">Valider la carte</button></a><a href="${base}&decision=reject"><button class="non">Refuser la carte</button></a></div><p><small>Ce lien expire le ${escape(new Date(draft.expiresAt).toLocaleString("fr-FR"))}.</small></p>`) };
};
