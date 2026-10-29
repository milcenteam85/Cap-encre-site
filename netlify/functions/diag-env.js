// Fonction de diagnostic temporaire : liste les variables d'environnement
// liées à Netlify (noms seulement, aucune valeur secrète).
exports.handler = async () => {
  const noms = Object.keys(process.env)
    .filter(k => /NETLIFY|BLOBS|SITE|CONTEXT|TOKEN|AWS/i.test(k))
    .sort();
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      node: process.version,
      variables: noms,
      contexte: process.env.CONTEXT || null,
      site: process.env.SITE_ID ? "SITE_ID présent" : "SITE_ID absent",
      blobsContext: process.env.NETLIFY_BLOBS_CONTEXT ? "présent (" + process.env.NETLIFY_BLOBS_CONTEXT.length + " car.)" : "absent",
    }, null, 2),
  };
};
