// Les QR codes de l'app : l'équivalent de `enum CodeQR` (GrilleADistance.swift), qui passait par le
// filtre CIQRCodeGenerator de Core Image avec le niveau de correction « L » (le plus bas : le lien
// du jeu à distance est long, il faut le plus de place possible pour les données).
//
// La bibliothèque est qrcode-generator (vendor/qrcode.js), un script classique (UMD), pas un module
// ES : dans le navigateur, elle est chargée une seule fois par une balise <script> et laisse la
// fonction `qrcode` sur `window` ; sous Node (tests), le fichier est lu et évalué.
//
// API (toutes les fonctions sont asynchrones : la première charge la bibliothèque) :
//
//   svgQR(texte, { taille = 256, marge = 4, correction = 'L', couleur = '#000', fond = '#fff' })
//     → le QR code en texte SVG, carré, noir sur blanc, fond blanc compris (lisible aussi en sombre).
//       `taille` : un nombre (pixels) ou une longueur CSS (« 320pt », « 100% ») ; `marge` : la zone
//       blanche autour, en modules (4 selon la norme). Le texte est codé en UTF-8, comme
//       Data(texte.utf8) dans le Swift. Lève une erreur si le texte est trop long pour un QR code.
//   matriceQR(texte, { correction = 'L' }) → { modules, sombre(ligne, colonne) } pour dessiner
//       soi-même (canvas…).
//   chargerQR() → la fonction `qrcode` de la bibliothèque (rarement utile directement).
//
// Dans un écran Préact :
//   const [svg, setSvg] = useState('');
//   useEffect(() => { svgQR(lien, { taille: 220 }).then(setSvg).catch(() => setSvg('')); }, [lien]);
//   html`<div class="code-qr" dangerouslySetInnerHTML=${{ __html: svg }}></div>`
//
// Hors connexion : sw.js doit garder vendor/qrcode.js avec les autres fichiers de l'app.

const ADRESSE = new URL('../vendor/qrcode.js', import.meta.url);

let chargement = null;

/** Charge qrcode-generator une seule fois ; rend sa fonction `qrcode`. */
export function chargerQR() {
  if (globalThis.qrcode?.stringToBytesFuncs) return Promise.resolve(preparer(globalThis.qrcode));
  if (!chargement) {
    chargement = (typeof document !== 'undefined' ? parBalise() : parLecture())
      .then(preparer)
      .catch((erreur) => {
        chargement = null; // un nouvel essai reste possible (réseau revenu…)
        throw erreur;
      });
  }
  return chargement;
}

/** Navigateur : une balise <script>, que le navigateur (et sw.js) garde en cache. */
function parBalise() {
  return new Promise((resoudre, rejeter) => {
    const balise = document.createElement('script');
    balise.src = ADRESSE.href;
    balise.async = true;
    balise.onload = () => (globalThis.qrcode ? resoudre(globalThis.qrcode)
      : rejeter(new Error('Bibliothèque QR introuvable.')));
    balise.onerror = () => rejeter(new Error('Impossible de charger la bibliothèque QR.'));
    document.head.append(balise);
  });
}

/** Node (tests) : le fichier est lu et évalué ; `qrcode` y est une variable du script. */
async function parLecture() {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(ADRESSE, 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(`${source}\nreturn qrcode;`)();
}

/** Les textes sont codés en UTF-8 (par défaut, la bibliothèque ne garde que l'octet bas). */
function preparer(qrcode) {
  if (qrcode.stringToBytesFuncs?.['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  return qrcode;
}

function construire(qrcode, texte, correction) {
  const qr = qrcode(0, correction); // 0 : la plus petite version qui contient le texte
  qr.addData(String(texte ?? ''), 'Byte');
  qr.make();
  return qr;
}

async function fabriquer(texte, correction) {
  return construire(await chargerQR(), texte, correction);
}

/** La bibliothèque est déjà chargée : `svgQRImmediat` peut servir. */
export function qrPret() {
  return !!globalThis.qrcode?.stringToBytesFuncs;
}

/** La matrice du QR code : `modules` de côté, `sombre(ligne, colonne)` vrai pour un module noir. */
export async function matriceQR(texte, { correction = 'L' } = {}) {
  const qr = await fabriquer(texte, correction);
  return { modules: qr.getModuleCount(), sombre: (ligne, colonne) => qr.isDark(ligne, colonne) };
}

/** Le QR code en SVG (texte), carré de `taille`, avec sa marge blanche. */
export async function svgQR(texte, options = {}) {
  return dessiner(await fabriquer(texte, options.correction ?? 'L'), options);
}

/** Le même, tout de suite, sans attendre : `null` si la bibliothèque n'est pas encore chargée.
 *  Sert à l'impression, que Safari n'ouvre que dans le geste même de l'utilisateur. */
export function svgQRImmediat(texte, options = {}) {
  if (!qrPret()) return null;
  return dessiner(construire(preparer(globalThis.qrcode), texte, options.correction ?? 'L'), options);
}

function dessiner(qr, { taille = 256, marge = 4, couleur = '#000', fond = '#fff' } = {}) {
  const n = qr.getModuleCount();
  const cote = n + 2 * marge;
  // Un rectangle par suite de modules noirs d'une même ligne : un chemin court.
  let chemin = '';
  for (let ligne = 0; ligne < n; ligne++) {
    let colonne = 0;
    while (colonne < n) {
      if (!qr.isDark(ligne, colonne)) { colonne++; continue; }
      const debut = colonne;
      while (colonne < n && qr.isDark(ligne, colonne)) colonne++;
      const longueur = colonne - debut;
      chemin += `M${debut + marge} ${ligne + marge}h${longueur}v1h-${longueur}z`;
    }
  }
  const dimension = typeof taille === 'number' ? `${taille}` : String(taille);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dimension}" height="${dimension}" `
    + `viewBox="0 0 ${cote} ${cote}" shape-rendering="crispEdges" role="img" aria-label="Code QR">`
    + `<rect width="${cote}" height="${cote}" fill="${fond}"/><path d="${chemin}" fill="${couleur}"/></svg>`;
}
