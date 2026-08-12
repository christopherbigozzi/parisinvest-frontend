// api/image.js — proxy d'images, fonction serverless Vercel.
//
// Remplace le petit serveur HTTP qui tournait à côté du collecteur. Les
// portails renvoient une erreur quand l'image est demandée depuis un autre
// site que le leur ; on relaie donc la requête depuis Vercel, avec les
// en-têtes qui vont bien.
//
// Appelée par le front via REACT_APP_IMAGE_PROXY_URL, qui doit valoir
// l'origine du site lui-même — par exemple https://parisinvest.vercel.app
// — puisque la fonction est servie depuis /api/image.

const DOMAINES_AUTORISES = [
  'bienici.com',
  'seloger.com',
  'leboncoin.fr',
  'jinka.fr',
  'pap.fr',
  'apimo.pro',
  'amazonaws.com',
  'storage.googleapis.com',
];

const EN_TETES = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

export default async function handler(req, res) {
  const cible = req.query.url;

  if (!cible) {
    return res.status(400).json({ erreur: 'Paramètre url manquant' });
  }

  let hote;
  try {
    const analysee = new URL(cible);
    // Sans cette vérification, la fonction relaierait n'importe quelle URL :
    // elle deviendrait un proxy ouvert utilisable par n'importe qui.
    if (!['http:', 'https:'].includes(analysee.protocol)) {
      return res.status(400).json({ erreur: 'Protocole non autorisé' });
    }
    hote = analysee.hostname;
  } catch {
    return res.status(400).json({ erreur: 'URL invalide' });
  }

  const autorise = DOMAINES_AUTORISES.some(
    (d) => hote === d || hote.endsWith(`.${d}`)
  );
  if (!autorise) {
    return res.status(403).json({ erreur: `Domaine non autorisé : ${hote}` });
  }

  try {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 8000);

    const reponse = await fetch(cible, {
      headers: EN_TETES,
      signal: controleur.signal,
      redirect: 'follow',
    });
    clearTimeout(minuteur);

    if (!reponse.ok) {
      return res.status(reponse.status).json({ erreur: 'Image indisponible' });
    }

    const typeContenu = reponse.headers.get('content-type') || '';
    if (!typeContenu.startsWith('image/')) {
      return res.status(415).json({ erreur: 'La cible n’est pas une image' });
    }

    const donnees = Buffer.from(await reponse.arrayBuffer());

    res.setHeader('Content-Type', typeContenu);
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Un an de cache : l'URL d'une photo d'annonce ne change pas de contenu.
    res.setHeader(
      'Cache-Control',
      'public, max-age=31536000, s-maxage=31536000, immutable'
    );
    return res.status(200).send(donnees);
  } catch (e) {
    const expire = e.name === 'AbortError';
    return res
      .status(expire ? 504 : 502)
      .json({ erreur: expire ? 'Délai dépassé' : 'Récupération impossible' });
  }
}
