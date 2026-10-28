// Fabriqué par Tools/sw-web.mjs : ne pas modifier à la main.
// Garde les fichiers de Bob 1N2 pour qu'il marche sans connexion. Aucune donnée ne passe par ici :
// joueurs, grilles et paris restent dans la base du navigateur (IndexedDB).
const VERSION = 'bob1n2-89d7314aef5d';
const FICHIERS = [
 "./",
 "jouer/",
 "recu/",
 "assistance.html",
 "conditions.html",
 "confidentialite.html",
 "css/app.css",
 "icones/favicon-32.png",
 "icones/icone-180.png",
 "icones/icone-192.png",
 "icones/icone-512.png",
 "index.html",
 "jouer/index.html",
 "js/app.js",
 "js/boite.js",
 "js/caisse.js",
 "js/calcul.js",
 "js/calendrier.js",
 "js/collage.js",
 "js/demo.js",
 "js/ecrans/accueil.js",
 "js/ecrans/calculateur.js",
 "js/ecrans/calendrier-vues.js",
 "js/ecrans/classement.js",
 "js/ecrans/collage-vues.js",
 "js/ecrans/competition-vues.js",
 "js/ecrans/competitions.js",
 "js/ecrans/cotes.js",
 "js/ecrans/distance.js",
 "js/ecrans/imprimables.js",
 "js/ecrans/joueur-actions.js",
 "js/ecrans/joueur.js",
 "js/ecrans/joueurs.js",
 "js/ecrans/journee.js",
 "js/ecrans/journees.js",
 "js/ecrans/mode-emploi.js",
 "js/ecrans/pari-carte.js",
 "js/ecrans/pari-editeur.js",
 "js/ecrans/reglages.js",
 "js/ecrans/saisie-matchs.js",
 "js/exemple.js",
 "js/format.js",
 "js/grille-a-distance.js",
 "js/grille.js",
 "js/mode-emploi-texte.js",
 "js/modele.js",
 "js/pdf-calendrier.js",
 "js/qr.js",
 "js/reglages-defaut.js",
 "js/reglages.js",
 "js/site.js",
 "js/store.js",
 "js/ui/composants.js",
 "js/ui/dialogues.js",
 "js/ui/evenements.js",
 "js/ui/icones-svg.js",
 "js/ui/impression.js",
 "js/ui/installation.js",
 "js/ui/pdf.js",
 "js/ui/racine.js",
 "js/ui/systeme.js",
 "manifest.webmanifest",
 "partage/grille.css",
 "partage/grille.js",
 "partage/style.css",
 "recu/index.html",
 "vendor/html2canvas.min.js",
 "vendor/jspdf.umd.min.js",
 "vendor/pdf.min.mjs",
 "vendor/pdf.worker.min.mjs",
 "vendor/preact-htm.js",
 "vendor/qrcode.js"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((c) => c.startsWith('bob1n2-') && c !== VERSION).map((c) => caches.delete(c))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET' || new URL(requete.url).origin !== location.origin) return;
  // D'abord le réseau : une version publiée s'applique dès l'ouverture. La copie gardée ne sert que
  // sans connexion (ou si le réseau tarde plus de 4 secondes).
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const garde = () => caches.match(requete, { ignoreSearch: requete.mode === 'navigate' })
      .then((r) => r ?? (requete.mode === 'navigate' ? caches.match('./') : undefined));
    try {
      // « no-cache » : le fichier est revérifié auprès du site (le cache HTTP de GitHub dure 10 min).
      const reseau = fetch(requete.url, { cache: 'no-cache', credentials: 'same-origin' }).then((reponse) => {
        if (reponse.ok) cache.put(requete, reponse.clone());
        return reponse;
      });
      const delai = new Promise((_, refuser) => setTimeout(() => refuser(new Error('lent')), 4000));
      return await Promise.race([reseau, delai]);
    } catch {
      return (await garde()) ?? Response.error();
    }
  })());
});
