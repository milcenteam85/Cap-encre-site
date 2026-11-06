// Garde contre les essais de codes en série.
//
// Chaque échec incrémente un compteur par adresse IP, remis à zéro après
// quinze minutes. Au-delà de vingt échecs, la fonction répond 429 et ne
// vérifie même plus le code fourni.

const { getStore } = require("@netlify/blobs");

const FENETRE = 15 * 60 * 1000;
const PLAFOND = 20;

function magasin() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token ? getStore({ name: "prix", siteID, token }) : getStore("prix");
}

function adresse(event) {
  const h = event.headers || {};
  return (
    h["x-nf-client-connection-ip"] ||
    (h["x-forwarded-for"] || "").split(",")[0].trim() ||
    "inconnue"
  );
}

// true = trop d'essais, on refuse sans regarder le code
async function bloque(event) {
  try {
    const store = magasin();
    const k = `essais/${adresse(event).replace(/[^a-z0-9.:]/gi, "_")}`;
    const maintenant = Date.now();
    const e = (await store.get(k, { type: "json" })) || { n: 0, debut: maintenant };

    if (maintenant - e.debut > FENETRE) {
      e.n = 0;
      e.debut = maintenant;
    }
    e.n += 1;
    await store.setJSON(k, e);
    return e.n > PLAFOND;
  } catch {
    return false; // le stockage tombe, on ne bloque pas le client légitime
  }
}

module.exports = { bloque };
