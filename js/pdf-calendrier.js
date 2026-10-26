// Un calendrier en PDF : repris de CalendrierPDF.swift. D'abord les formats officiels français que le
// logiciel de la FFF édite pour tous les districts et toutes les ligues (« FOOT 2000 - FFF » en pied de
// page) : « Calendriers par journée » et « Calendriers par date » ; puis les affiches, cases « J1 ·
// date » en colonnes (la R1 de la Ligue de Bretagne, voir `lireAffiche`) ; sinon, n'importe quel
// calendrier : les lignes de la page, reconstituées d'après la position du texte (cellules séparées
// par des tabulations), passent à la lecture souple de calendrier.js (« Journée 3 », dates, « A - B »,
// tableaux), qui vaut pour tous les pays.
//
// Copié-collé, ce document sort colonne par colonne. Il est donc lu d'après la position du texte sur
// la page, ligne par ligne comme on le voit. Par journée, chaque ligne de match donne le match aller de
// la journée de gauche ; le match retour, dans la journée de droite, en est l'inverse. Par date, chaque
// ligne est un match tel qu'il se joue sous « Date match : … », et les journées suivent l'ordre des
// dates. Un nom trop long passe à la ligne : sa fin est recollée d'après sa position (et, s'il ne
// manque que quelques lettres, complétée d'après la liste imprimée en tête de poule, où plusieurs noms
// d'une même ligne peuvent se fondre en un seul fragment). Les équipes d'une poule sont celles de ses
// matchs ; « Non affecté », l'exempt d'une poule impaire, est ignoré. Un document couvre souvent
// plusieurs poules : chacune est rendue à part.
//
// Le texte et sa position viennent de pdf.js (`getTextContent`), là où l'app lisait ceux de PDFKit.
// pdf.js réunit en un seul morceau deux textes séparés de moins de 0,6 cadratin (avec une espace) :
// `separer` redécoupe ces morceaux là où PDFKit les rendait à part (le tiret entre deux équipes, le
// numéro de terrain ou « Aller » collés à un nom, le trait d'une affiche).
//
// Objets rendus :
//  - fragment : { texte, x, y } (y croît vers le haut, comme dans un PDF ; `largeur` facultative) ;
//  - poule : { id, titre, equipes, journees } (journées au format de calendrier.js `lire`).

import { cle } from './format.js';
import * as M from './modele.js';
import { lire as lireTexte, dateDans, anneeDeSaison, enregistrer, _interne } from './calendrier.js';
import { creerCompetition } from './grille.js';

// MARK: - Lire un fichier

let pdfjsCharge = null;

/** pdf.js n'est chargé qu'au premier PDF (il pèse plus que toute l'app). */
async function pdfjs() {
  if (!pdfjsCharge) {
    pdfjsCharge = import('../vendor/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
      return lib;
    });
  }
  return pdfjsCharge;
}

/**
 * Lit un PDF de calendrier (un `File`, un `Blob`, un `ArrayBuffer` ou des octets) et rend la promesse
 * de ses poules : [] si rien n'est reconnu (image scannée, document illisible…). `nom` : le nom du
 * fichier, quand `fichier` n'en a pas (il sert de titre à un document sans titre).
 */
export async function lirePDF(fichier, { nom, maintenant = new Date() } = {}) {
  let donnees;
  if (fichier instanceof ArrayBuffer) donnees = new Uint8Array(fichier);
  else if (ArrayBuffer.isView(fichier)) donnees = new Uint8Array(fichier.buffer, fichier.byteOffset, fichier.byteLength);
  else if (fichier && typeof fichier.arrayBuffer === 'function') donnees = new Uint8Array(await fichier.arrayBuffer());
  else return [];
  const lib = await pdfjs();
  let document;
  try {
    document = await lib.getDocument({ data: donnees, verbosity: lib.VerbosityLevel?.ERRORS ?? 0, isEvalSupported: false }).promise;
  } catch {
    return [];
  }
  try {
    const pages = [];
    for (let numero = 1; numero <= document.numPages; numero++) {
      const page = await document.getPage(numero);
      const contenu = await page.getTextContent();
      pages.push(fragmentsDeLaPage(contenu.items));
      page.cleanup();
    }
    let propose = null;
    try {
      propose = (await document.getMetadata())?.info?.Title ?? null;
    } catch { /* sans titre */ }
    const fichierNom = String(nom ?? fichier?.name ?? '').replace(/\.[^.]*$/, '');
    return lirePages(pages, titre(propose, fichierNom), maintenant);
  } catch {
    return [];
  } finally {
    document.destroy();
  }
}

/** Les pages lues, dans l'ordre des formats : officiel, affiche, puis la lecture de secours. */
export function lirePages(pages, titreDocument = 'Calendrier', maintenant = new Date()) {
  const officielles = lireOfficiel(pages);
  if (officielles.length) return officielles;
  const affiches = lireAffiche(pages, titreDocument, maintenant);
  if (affiches.length) return affiches;
  const autre = lireAutrement(pages, titreDocument, maintenant);
  return autre ? [autre] : [];
}

/** Le nombre de matchs d'une poule. */
export function nombreDeMatchs(poule) {
  return poule.journees.reduce((s, j) => s + j.matchs.length, 0);
}

// MARK: - Les morceaux de texte d'une page (pdf.js)

/** Les éléments de `getTextContent()` en fragments : texte sans espaces autour, position du début du
 *  texte, y au milieu de la hauteur des lettres (comme le milieu du cadre d'une sélection PDFKit). */
export function fragmentsDeLaPage(items) {
  const fragments = [];
  for (const item of items) {
    const brut = String(item.str ?? '');
    const texte = brut.trim();
    if (!texte || !item.transform) continue;
    const longueur = [...brut].length || 1;
    const largeur = Math.abs(item.width ?? 0);
    const avant = [...brut].length - [...brut.trimStart()].length;
    const hauteur = Math.abs(item.height ?? 0) || Math.hypot(item.transform[2], item.transform[3]) || 0;
    fragments.push(...separer({
      texte,
      x: item.transform[4] + (largeur * avant) / longueur,
      y: item.transform[5] + hauteur * 0.35,
      largeur: (largeur * [...texte].length) / longueur,
    }));
  }
  return fragments;
}

/** Un fragment coupé à la position `debut` de son texte (en caractères) : la position du second
 *  morceau est estimée d'après la largeur du fragment. */
function couper(fragment, morceaux) {
  const total = [...fragment.texte].length || 1;
  const largeur = fragment.largeur ?? 0;
  const rendus = [];
  let debut = 0;
  for (const morceau of morceaux) {
    const position = fragment.texte.indexOf(morceau, debut);
    const index = position < 0 ? debut : position;
    const texte = morceau.trim();
    if (texte) {
      // Le début du texte, espaces de tête comprises.
      const avant = [...fragment.texte.slice(0, index + morceau.indexOf(texte))].length;
      rendus.push({
        texte,
        x: fragment.x + (largeur * avant) / total,
        y: fragment.y,
        largeur: (largeur * [...texte].length) / total,
      });
    }
    debut = index + morceau.length;
  }
  return rendus;
}

const SEPARATEUR = '[-–—|¦│ǀ｜∣]';
const QUEUES = [
  // Le tiret entre deux équipes, collé à la fin d'un nom.
  new RegExp(String.raw`^(.*\S)(\s+${SEPARATEUR})$`, 'u'),
  // Le numéro de terrain ou de club (« 56000002 »), collé à la fin d'un nom.
  /^(.*\S)(\s+\d{5,}(?:\.\d{0,2})?)$/u,
  // L'heure (« 15H30 », « 15:00 »).
  /^(.*\p{L}.*?)(\s+\d{1,2}\s*[hH:]\s*\d{2})$/u,
  // « Aller », « Retour » du format par date.
  /^(.*\S)(\s+(?:Aller|Retour|ALLER|RETOUR|aller|retour))$/u,
];
const TETES = [
  new RegExp(String.raw`^(${SEPARATEUR})(\s+.*)$`, 'u'),
];

/** Redécoupe ce que pdf.js a réuni et que PDFKit rendait à part : le tiret ou le numéro collés à un
 *  nom d'équipe. Un nom qui contient un tiret (« Saint-Marc », « A - B ») reste entier. */
export function separer(fragment) {
  if (!/\p{L}/u.test(fragment.texte)) return [fragment];
  for (const motif of QUEUES) {
    const m = motif.exec(fragment.texte);
    if (m && /\p{L}/u.test(m[1])) {
      const [debut, fin] = couper(fragment, [m[1], m[2]]);
      return [...separer(debut), fin].filter(Boolean);
    }
  }
  for (const motif of TETES) {
    const m = motif.exec(fragment.texte);
    if (m && /\p{L}/u.test(m[2])) {
      const [debut, fin] = couper(fragment, [m[1], m[2]]);
      return [debut, ...separer(fin)].filter(Boolean);
    }
  }
  return [fragment];
}

// MARK: - Les lignes de la page

/** Les fragments regroupés en lignes, de haut en bas, chacune de gauche à droite. */
export function lignes(fragments) {
  const rangees = [];
  for (const fragment of [...fragments].sort((a, b) => b.y - a.y)) {
    const derniere = rangees[rangees.length - 1];
    if (derniere && Math.abs(derniere[0].y - fragment.y) < 3) derniere.push(fragment);
    else rangees.push([fragment]);
  }
  return rangees.map((l) => l.sort((a, b) => a.x - b.x));
}

const texteDe = (ligne, separateur = ' ') => ligne.map((f) => f.texte).join(separateur);

function capture(motif, texte) {
  const m = motif.exec(texte);
  return m ? m[1] : null;
}

// MARK: - Les formats officiels (FFF)

/** Les formats « Calendriers par journée » et « Calendriers par date » des districts et des ligues. */
export function lireOfficiel(pages) {
  const poules = [];
  /** La liste imprimée en tête de chaque poule, pour compléter un nom tronqué. */
  const listes = [];
  let index = null;
  let listeDesEquipes = false;
  let aller = null;
  let retour = null;
  let matchs = [];

  const ranger = () => {
    if (index == null) {
      matchs = [];
      return;
    }
    for (const match of matchs) {
      if (match.exempt) continue;
      const domicile = nomComplet(match.domicile.texte, listes[index]);
      const exterieur = nomComplet(match.exterieur.texte, listes[index]);
      if (match.aller) ajouter(domicile, exterieur, match.aller, poules[index]);
      if (match.retour) ajouter(exterieur, domicile, match.retour, poules[index]);
    }
    matchs = [];
  };

  for (const page of pages) {
    const lignesPage = lignes(page);
    lignesPage.forEach((ligne, rang) => {
      const premier = ligne[0];
      if (!premier) return;

      // L'en-tête de la poule : « Poule A », sous « District 1 / Unique ».
      if (cle(premier.texte).startsWith('poule')) {
        ranger();
        const division = rang > 0 ? (lignesPage[rang - 1][0]?.texte ?? '') : '';
        const titrePoule = [division, premier.texte].filter(Boolean).join(' · ');
        const existante = poules.findIndex((p) => p.titre === titrePoule);
        if (existante >= 0) {
          index = existante;
        } else {
          poules.push({ id: titrePoule, titre: titrePoule, equipes: [], journees: [] });
          listes.push([]);
          index = poules.length - 1;
        }
        listeDesEquipes = true;
        aller = null;
        retour = null;
        return;
      }

      // Le format « Calendriers par date » des ligues : « Date match : 06/09/2026 », puis les matchs
      // tels qu'ils se jouent ce jour-là. Les journées de la poule suivent l'ordre des dates.
      const date = dateDeMatch(ligne);
      if (date) {
        ranger();
        listeDesEquipes = false;
        if (index != null) {
          const journees = poules[index].journees;
          const numero = journees.find((j) => j.date === date)?.numero
            ?? journees.reduce((m, j) => Math.max(m, j.numero), 0) + 1;
          aller = { numero, date };
        } else {
          aller = null;
        }
        retour = null;
        return;
      }

      // « Journée 01 - Aller 06/09/2026   Journée 22 - Retour 30/05/2027 »
      const intitules = intitulesDeJournee(ligne);
      if (intitules.length) {
        ranger();
        listeDesEquipes = false;
        const a = intitules.find((x) => !x.retour);
        const r = intitules.find((x) => x.retour);
        aller = a ? { numero: a.numero, date: a.date } : null;
        retour = r ? { numero: r.numero, date: r.date } : null;
        return;
      }

      const equipes = ligne.filter((f) => estEquipe(f.texte));
      if (listeDesEquipes && index != null) {
        listes[index].push(...equipes.map((f) => f.texte));
        return;
      }

      // Une ligne de match : son numéro, puis les deux équipes de part et d'autre du tiret (l'une
      // peut être « Non affecté », l'exempt).
      const deuxCamps = ligne.filter((f) => estEquipe(f.texte) || estExempt(f.texte));
      if (/^\d{4,6}(\.\d{0,2})?$/.test(premier.texte) && deuxCamps.length === 2 && (aller || retour)) {
        matchs.push({
          domicile: { ...deuxCamps[0] }, exterieur: { ...deuxCamps[1] }, aller, retour,
          exempt: deuxCamps.some((f) => estExempt(f.texte)),
        });
        return;
      }

      // La fin d'un nom passé à la ligne (« 1 » sous « Brest Queliverzan As »).
      const dernier = matchs[matchs.length - 1];
      if (dernier && ligne.every((f) => [...f.texte].length <= 6)) {
        for (const morceau of ligne) {
          if (Math.abs(morceau.x - dernier.domicile.x) < 6) {
            dernier.domicile.texte = `${dernier.domicile.texte} ${morceau.texte}`;
          } else if (Math.abs(morceau.x - dernier.exterieur.x) < 6) {
            dernier.exterieur.texte = `${dernier.exterieur.texte} ${morceau.texte}`;
          }
        }
      }
    });
    ranger();
  }

  return poules.map(rangee).filter((p) => p.journees.length);
}

/** Les journées dans l'ordre, les équipes dans l'ordre où elles apparaissent dans les matchs. */
function rangee(poule) {
  const journees = [...poule.journees].sort((a, b) => a.numero - b.numero);
  const vues = new Set();
  const equipes = journees.flatMap((j) => j.matchs).flatMap((m) => [m.domicile, m.exterieur])
    .filter((e) => {
      const c = cle(e);
      if (vues.has(c)) return false;
      vues.add(c);
      return true;
    });
  return { ...poule, journees, equipes };
}

function intitulesDeJournee(ligne) {
  const texte = cle(texteDe(ligne));
  const motif = /journee\s+(\d{1,2})\s*-?\s*(aller|retour)?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})?/g;
  return [...texte.matchAll(motif)].map((m) => ({
    numero: Number(m[1]),
    retour: m[2] === 'retour',
    date: m[3] ? dateDans(m[3], 2000) : null,
  }));
}

/** « Date match : 06/09/2026 » */
function dateDeMatch(ligne) {
  const texte = cle(texteDe(ligne));
  if (!texte.startsWith('date match')) return null;
  const morceau = /\d{1,2}\/\d{1,2}\/\d{2,4}/.exec(texte);
  return morceau ? dateDans(morceau[0], 2000) : null;
}

/** Un nom d'équipe : des lettres, et ni « ... », ni une heure (« 15H30 »), ni un tiret, ni la mention
 *  « Aller » ou « Retour » du format par date. */
function estEquipe(texte) {
  if (!/[\p{L}\p{M}]/u.test(texte)) return false;
  if (/^\d{1,2}\s*[hH]\s*\d{0,2}$/.test(texte)) return false;
  const c = cle(texte);
  if (c === 'aller' || c === 'retour') return false;
  return !['district', 'ligue ', 'calendriers par', 'poule', 'journee', 'date match', '* match', 'd matin',
    'foot 2000', 'page ', 'non affecte', 'exempt'].some((x) => c.startsWith(x));
}

function estExempt(texte) {
  const c = cle(texte);
  return c.startsWith('non affecte') || c.startsWith('exempt');
}

/** Le nom tel qu'il figure dans la liste de la poule, s'il n'y manque que quelques lettres
 *  (« Brest Queliverzan As » pour « Brest Queliverzan As 1 ») et qu'un seul nom convient. */
function nomComplet(nom, equipes) {
  const c = cle(nom);
  if (equipes.some((e) => cle(e) === c)) return nom;
  const candidats = equipes.filter((e) => cle(e).startsWith(c) && [...e].length - [...nom].length <= 4);
  return candidats.length === 1 ? candidats[0] : nom;
}

function ajouter(domicile, exterieur, journee, poule) {
  const match = { domicile, exterieur, date: journee.date };
  const existante = poule.journees.find((j) => j.numero === journee.numero);
  if (existante) {
    const dejaLa = existante.matchs.some((m) => cle(m.domicile) === cle(domicile) && cle(m.exterieur) === cle(exterieur));
    if (!dejaLa) existante.matchs.push(match);
  } else {
    poule.journees.push({ numero: journee.numero, date: journee.date, matchs: [match], numeroExplicite: true });
  }
}

// MARK: - Les affiches

/**
 * Une affiche de calendrier, comme celle de la R1 de la Ligue de Bretagne (faite sur Canva) : des cases
 * « J1 · DIM 23 AOÛT 2026 » sur plusieurs colonnes, chacune avec ses matchs « Domicile | Extérieur ».
 * Une ligne de la page traverse donc plusieurs cases : c'est le trait entre les deux noms (souvent lu
 * « i ») qui tient chaque match, le nom juste à sa gauche reçoit, celui juste à sa droite se déplace,
 * et le match revient à la case au-dessus de lui, dans sa colonne. La poule (« Poule A ») est lue sur
 * la page, le championnat (« R1 ») dans le titre du document ; les pages d'une même poule (phase
 * aller, phase retour) sont réunies.
 */
export function lireAffiche(pages, titreDocument, maintenant = new Date()) {
  const nomChampionnat = championnat(titreDocument);
  const poules = [];
  for (const brute of pages) {
    const lignesPage = lignes(brute.flatMap(separerAffiche));
    const texte = cle(lignesPage.map((l) => texteDe(l)).join('\n'));
    const lue = capture(/(?:saison|season)\s*(\d{4})/, texte);
    const saison = lue ? Number(lue) : anneeDeSaison(maintenant);

    const cases = [];
    for (const ligne of lignesPage) {
      ligne.forEach((morceau, rang) => {
        const numero = numeroDeCase(morceau.texte);
        if (numero == null) return;
        const suite = [];
        for (const f of ligne.slice(rang + 1)) {
          if (numeroDeCase(f.texte) != null) break;
          suite.push(f.texte);
        }
        cases.push({ numero, date: dateDeCase(suite.join(' '), saison), x: morceau.x, y: morceau.y });
      });
    }
    if (!cases.length) continue;

    const groupe = capture(/\b((?:poule|groupe|group)\s+[a-z0-9]{1,2})\b/, texte);
    const nom = groupe ? `${nomChampionnat} · ${majuscules(groupe)}` : nomChampionnat;
    let poule = poules.find((p) => p.titre === nom);
    if (!poule) {
      poule = { id: nom, titre: nom, equipes: [], journees: [] };
      poules.push(poule);
    }

    for (const ligne of lignesPage) {
      for (let rang = 1; rang < ligne.length - 1; rang++) {
        if (!estTrait(ligne[rang].texte)) continue;
        const domicile = ligne[rang - 1].texte;
        const exterieur = ligne[rang + 1].texte;
        if (estTrait(domicile) || estTrait(exterieur) || !estEquipe(domicile) || !estEquipe(exterieur)) continue;
        const journee = caseAuDessus(ligne[rang], cases);
        if (!journee) continue;
        ajouter(domicile.toUpperCase(), exterieur.toUpperCase(), { numero: journee.numero, date: journee.date }, poule);
      }
    }
  }
  return poules.map(rangee).filter((p) => vraisemblable(p.journees, p.equipes));
}

/** « poule a » devient « Poule A » (comme `capitalized`). */
function majuscules(texte) {
  return texte.split(' ').map((mot) => (mot ? mot[0].toUpperCase() + mot.slice(1).toLowerCase() : mot)).join(' ');
}

/** Le championnat d'après le titre du document : « R1 » dans « Calendrier R1 H&F », sinon le titre
 *  sans « Calendrier ». */
export function championnat(titreDocument) {
  const division = /\b[RDN]\s?\d{1,2}\b/i.exec(titreDocument);
  if (division) return division[0].toUpperCase().replaceAll(' ', '');
  const reste = titreDocument.replace(/^\s*calendriers?\b\s*/i, '');
  return reste || titreDocument;
}

/** « J1 », « J 12 », « Journée 3 » : l'étiquette d'une case, seule dans son fragment. */
function numeroDeCase(texte) {
  const lu = capture(/^(?:j|journee)\s*\.?\s*(\d{1,2})$/, cle(texte));
  const numero = lu == null ? null : Number(lu);
  return numero > 0 ? numero : null;
}

/** « DIM 06 SEPT . 2026 » : le point détaché du mois est recollé. */
function dateDeCase(intitule, saison) {
  return dateDans(intitule.replace(/\s+\./g, '.'), saison);
}

/** Les traits que pdf.js peut rendre à la place du « | » d'une affiche (selon la police). */
const TRAITS = ['i', '|', '¦', '│', 'ǀ', '｜', '∣', 'ı', 'l', '-', '–', '—', '/', 'vs'];

/** Le trait entre les deux équipes d'un match : « | », que PDFKit rend souvent « i », ou un tiret. */
function estTrait(texte) {
  const t = texte.trim();
  return TRAITS.includes(t.toLowerCase());
}

/** Sur une affiche, pdf.js peut aussi réunir les deux noms et leur trait (« AS KERVEN i FC LANDIVIAU »),
 *  ou l'étiquette d'une case et sa date (« J2 DIM 06 SEPT. 2026 ») : ils sont redécoupés. */
function separerAffiche(fragment) {
  const etiquette = /^((?:J|j|Journée|journée|JOURNÉE)\s*\.?\s*\d{1,2})(\s+\D.*)$/u.exec(fragment.texte);
  if (etiquette) return couper(fragment, [etiquette[1], etiquette[2]]);
  // Les mots du fragment ; un trait seul entre deux mots sépare deux noms.
  const mots = [...fragment.texte.matchAll(/\S+/gu)].map((m) => ({ texte: m[0], debut: m.index, fin: m.index + m[0].length }));
  if (mots.length < 2 || !mots.some((m) => TRAITS_COLLES.includes(m.texte))) return [fragment];
  const morceaux = [];
  let nom = null;
  for (const mot of mots) {
    if (TRAITS_COLLES.includes(mot.texte)) {
      if (nom) morceaux.push(nom);
      nom = null;
      morceaux.push(mot);
    } else if (nom) {
      nom.fin = mot.fin;
    } else {
      nom = { debut: mot.debut, fin: mot.fin };
    }
  }
  if (nom) morceaux.push(nom);
  const textes = morceaux.map((m) => fragment.texte.slice(m.debut, m.fin));
  // Seulement entre de vrais noms (« Lundi i » ne veut rien dire, mais ne se coupe pas non plus).
  if (!textes.filter((t) => !TRAITS_COLLES.includes(t)).every((t) => /\p{L}.*\p{L}/u.test(t))) return [fragment];
  return couper(fragment, textes);
}

/** Les traits redécoupés quand ils sont collés à un nom (« l » et « I » restent : ils finissent des noms). */
const TRAITS_COLLES = ['i', '|', '¦', '│', 'ǀ', '｜', '∣'];

/** La case d'un match : dans la colonne de son trait (les cases qui commencent le plus près à sa
 *  gauche), la plus proche au-dessus de lui. */
function caseAuDessus(trait, cases) {
  const auDessus = cases.filter((c) => c.y > trait.y && c.x <= trait.x);
  if (!auDessus.length) return null;
  const colonne = Math.max(...auDessus.map((c) => c.x));
  return auDessus.filter((c) => colonne - c.x < 30).reduce((min, c) => (c.y < min.y ? c : min));
}

// MARK: - Les autres formats

/**
 * Un calendrier d'un autre format : ses lignes, cellules séparées par des tabulations, lues comme un
 * texte collé. Une seule « poule », au titre du document. En-têtes et pieds de page répétés (« Page 3
 * / 60 », nom de la ligue) sont écartés, et rien n'est rendu si le résultat ne ressemble pas à un
 * calendrier : mieux vaut « document non reconnu » qu'une compétition de titres de page.
 */
export function lireAutrement(pages, titreDocument, maintenant = new Date()) {
  const textes = pages.map((page) => lignes(page).map((l) => texteDe(l, '\t')));
  const repetees = lignesRepetees(textes);
  const texte = textes.flat().filter((l) => !repetees.has(motif(l)) && !estMention(l)).join('\n');
  const journees = lireTexte(texte, maintenant);
  const vues = new Set();
  const equipes = journees.flatMap((j) => j.matchs).flatMap((m) => [m.domicile, m.exterieur]).filter((e) => {
    const c = cle(e);
    if (vues.has(c)) return false;
    vues.add(c);
    return true;
  });
  if (!vraisemblable(journees, equipes)) return null;
  return { id: titreDocument, titre: titreDocument, equipes, journees };
}

/** Les lignes qui reviennent en haut ou en bas de la moitié des pages au moins : en-têtes et pieds de
 *  page, chiffres compris (« Page 3 / 60 »). Un intitulé de journée (« Round 4 · Sun 27 Sep »), qui
 *  ouvre souvent la page et ne change que par ses chiffres, n'en est pas un (écart avec l'app, qui
 *  l'écartait : ses matchs passaient alors à la journée précédente). */
function lignesRepetees(pages) {
  if (pages.length < 2) return new Set();
  const compte = new Map();
  for (const page of pages) {
    const bords = new Set([...page.slice(0, 3), ...page.slice(-3)]
      .filter((l) => !_interne.intituleDeJournee(l)).map(motif));
    for (const bord of bords) compte.set(bord, (compte.get(bord) ?? 0) + 1);
  }
  const seuil = Math.max(2, Math.floor(pages.length / 2));
  return new Set([...compte.entries()].filter(([, n]) => n >= seuil).map(([bord]) => bord));
}

function motif(ligne) {
  return cle(ligne).replace(/\d+/g, '#');
}

/** Numéro de page, logiciel, adresse web, date d'édition : jamais un match. */
function estMention(ligne) {
  const c = cle(ligne);
  return /\bpage\s*\d+\s*(\/|sur|of|de|von|van|di)\s*\d+/.test(c)
    || ['foot 2000', 'http', 'www.', '©', 'imprime le', 'edite le', 'printed on'].some((x) => c.includes(x));
}

/** Un calendrier : au moins deux matchs de vraies équipes, presque jamais une équipe deux fois dans la
 *  même journée (une semaine à deux matchs, regroupée par date, peut arriver) et, sur plusieurs
 *  journées, la plupart des équipes présentes plus d'une fois. */
function vraisemblable(journees, equipes) {
  if (equipes.length < 4 || !equipes.every((e) => [...e].length <= 40)) return false;
  const nomsDe = (j) => j.matchs.flatMap((m) => [cle(m.domicile), cle(m.exterieur)]);
  const doublons = journees.filter((j) => {
    const noms = nomsDe(j);
    return new Set(noms).size < noms.length;
  });
  if (doublons.length * 4 > journees.length) return false;
  if (journees.length < 3) return true;
  const presences = journees.flatMap((j) => [...new Set(nomsDe(j))]);
  const habituees = equipes.filter((e) => presences.filter((p) => p === cle(e)).length >= 2);
  return habituees.length * 2 >= equipes.length;
}

/** Le titre du document, sinon le nom du fichier s'il veut dire quelque chose : « Calendriers R3 2026
 *  2027 », pas « 43801751d ». Une adresse (« about:blank » d'une page imprimée depuis un navigateur)
 *  n'est pas un titre (écart avec l'app, qui la prenait pour le nom du championnat). */
export function titre(propose, fichier) {
  const lisible = (texte) => {
    if (texte == null || /^\s*(?:about|https?|file|blob|data):/i.test(texte)) return null;
    const propre = String(texte).replace(/[_-]+/g, ' ').split(' ').filter(Boolean).join(' ');
    const lettres = (propre.match(/[\p{L}\p{M}]/gu) ?? []).length;
    return lettres >= 4 ? propre : null;
  };
  return lisible(propose) ?? lisible(fichier) ?? 'Calendrier';
}

// MARK: - Trouver le PDF

/** Une recherche web du calendrier de la saison (« calendrier 2026-2027 Finistère football »), ouverte
 *  dans le navigateur, pour tout district, toute ligue, tout pays : en France, les sites des districts
 *  et des ligues sortent en tête. */
export function recherche(district, maintenant = new Date()) {
  const nom = String(district ?? '').trim();
  if (!nom) return null;
  const debut = maintenant.getMonth() + 1 >= 7 ? maintenant.getFullYear() : maintenant.getFullYear() - 1;
  const adresse = new URL('https://www.google.fr/search');
  adresse.searchParams.set('q', `calendrier ${debut}-${debut + 1} ${nom} football`);
  return adresse.href;
}

// MARK: - Importer une poule

/** « District 1 / Unique · Poule A » devient « District 1 · Poule A ». */
export function nomCourt(titrePoule) {
  return titrePoule.replace(/ \/ Unique/gi, '').replaceAll('  ', ' ').trim();
}

/** La compétition qui a déjà au moins la moitié des équipes de la poule (au moins trois). */
export function competitionExistante(poule, championnats = M.championnatsTries()) {
  const siennes = new Set(poule.equipes.map(cle));
  const seuil = Math.max(3, Math.floor(siennes.size / 2));
  let meilleure = null;
  let communes = -1;
  for (const competition of championnats) {
    const n = M.lignesDe(competition.id).filter((l) => siennes.has(cle(l.equipe))).length;
    if (n >= seuil && n > communes) {
      meilleure = competition;
      communes = n;
    }
  }
  return meilleure;
}

/** Met la poule dans l'app d'un geste : la compétition qui lui correspond reçoit ce calendrier (il
 *  remplace l'ancien), sinon une compétition est créée, avec ses équipes. Rend { competition,
 *  nouvelle }. À appeler dans `modifier`. */
export function importer(poule, championnats = M.championnatsTries()) {
  const existante = competitionExistante(poule, championnats);
  if (existante) {
    enregistrer(poule.journees, existante);
    return { competition: existante, nouvelle: false };
  }
  const competition = creerCompetition({ nom: nomCourt(poule.titre), equipes: poule.equipes });
  enregistrer(poule.journees, competition);
  return { competition, nouvelle: true };
}
