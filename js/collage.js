// Lecture des textes collés : tableau de classement, liste de matchs, scores. Repris de
// Collage.swift. Rien n'est téléchargé : c'est l'utilisateur qui copie le texte.
//
// Objets rendus :
//  - ligne lue : { equipe, points|null, joues|null, gagnes, nuls, perdus, forfaits, butsPour, butsContre, penalites }
//  - match lu : { domicile, exterieur, butsDomicile|null, butsExterieur|null, cotes|null, resultat|null, score|null }

import { cle } from './format.js';

// MARK: - Nettoyage

/** Les navigateurs glissent des séparateurs Unicode et des caractères de remplacement d'image (￼) :
 *  on les ramène à de simples retours à la ligne. */
export function lignes(texte) {
  return String(texte ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll(' ', '\n')
    .replaceAll(' ', '\n')
    .replaceAll('￼', '')
    .replaceAll(' ', ' ')
    .replaceAll('−', '-')
    .split('\n');
}

const PUCES = new Set(['◦', '•', '·', '▪', '▫', '‣', '○', '●', '*']);

/** Espaces (y compris tabulations) ramenées à une seule. Comme `components(separatedBy: .whitespaces)`. */
export function propre(cellule) {
  return String(cellule).split(/[ \t  -​  　]+/).filter(Boolean).join(' ');
}

function estEntier(s) {
  const t = s.startsWith('+') ? s.slice(1) : s;
  return /^-?\d+$/.test(t);
}

function entier(s) {
  return estEntier(s) ? Number(s.startsWith('+') ? s.slice(1) : s) : null;
}

/** Au moins deux lettres. */
function contientDesLettres(s) {
  return (String(s).match(/\p{L}/gu) ?? []).length >= 2;
}

/** Les groupes capturés de la première correspondance, sans ceux qui n'ont rien capturé
 *  (comme le `compactMap` de Collage.swift), chacun nettoyé. `null` si rien ne correspond. */
function capture(motif, texte) {
  const m = motif.exec(texte);
  if (!m) return null;
  return m.slice(1).filter((g) => g !== undefined).map(propre);
}

// MARK: - Classement

/** Ordre des colonnes du site et de la feuille « classementr3 », sans ligne d'en-tête. */
export const COLONNES_PAR_DEFAUT = ['pts', 'jo', 'g', 'n', 'p', 'f', 'bp', 'bc', 'dif', 'pe'];

export function classement(texte) {
  const brutes = lignes(texte);
  let colonnes = COLONNES_PAR_DEFAUT;

  // 1. Une ligne par équipe (tableau copié : tabulations, ou espaces).
  const parLigne = brutes.map(cellulesClassement);
  const entete = parLigne.find(estEntete);
  if (entete) colonnes = colonnesDEntete(entete);
  let lues = parLigne.map((c) => ligneClassement(c, colonnes)).filter(Boolean);
  if (lues.length >= 2) return dedoublonne(lues);

  // 2. Une cellule par ligne : on reconstitue les rangées.
  const jetons = brutes.flatMap((l) => l.split('\t')).map(propre).filter((j) => j && !PUCES.has(j));
  let i = 0;
  const debut = jetons.findIndex((j) => cle(j) === 'pts');
  if (debut >= 0) {
    let fin = jetons.findIndex((j, k) => k >= debut && estEntier(j));
    if (fin < 0) fin = jetons.length;
    colonnes = colonnesDEntete(['equipe', ...jetons.slice(debut, fin)]);
    i = fin;
  }
  lues = [];
  while (i < jetons.length) {
    const jeton = jetons[i];
    if (estEntier(jeton) || !contientDesLettres(jeton) || estMotDEntete(jeton)) {
      i += 1;
      continue;
    }
    const nombres = [];
    let j = i + 1;
    while (j < jetons.length && entier(jetons[j]) != null && nombres.length < colonnes.length) {
      // Un nombre suivi d'un nom est le rang de l'équipe suivante.
      const suiviDUnNom = j + 1 < jetons.length && !estEntier(jetons[j + 1]) && contientDesLettres(jetons[j + 1]);
      if (suiviDUnNom && nombres.length >= 3) break;
      nombres.push(entier(jetons[j]));
      j += 1;
    }
    if (nombres.length) lues.push(ligne(jeton, nombres, colonnes));
    i = j;
  }
  return dedoublonne(lues);
}

function cellulesClassement(l) {
  if (l.includes('\t')) {
    return l.split('\t').map(propre).filter((c) => c && !PUCES.has(c));
  }
  const texte = propre(l);
  if (!texte) return [];
  // « 1 ST PLABENNÉCOIS (B) 6 2 2 0 0 0 9 0 9 0 » : rang, nom, puis une suite de nombres.
  const mots = texte.split(' ');
  const nombres = [];
  while (mots.length && estEntier(mots[mots.length - 1])) nombres.unshift(mots.pop());
  const debut = [];
  if (mots.length && (estEntier(mots[0]) || (mots[0].endsWith('.') && estEntier(mots[0].slice(0, -1))))) {
    const premier = mots.shift();
    debut.push(premier.endsWith('.') ? premier.slice(0, -1) : premier);
  }
  const nom = mots.join(' ');
  return nom ? [...debut, nom, ...nombres] : [...debut, ...nombres];
}

function estMotDEntete(s) {
  return ['equipe', 'equipes', 'club', 'clubs', 'pl', 'rang', 'pts', 'points', 'classement',
    'jo', 'bp', 'bc', 'dif', 'diff', 'pe', 'pen'].includes(cle(s));
}

function estEntete(cellules) {
  const cles = cellules.map(cle);
  return cles.some((c) => c === 'pts' || c === 'points')
    && cles.some((c) => ['equipe', 'equipes', 'club', 'clubs'].includes(c));
}

function colonnesDEntete(cellules) {
  const cles = cellules.map(cle);
  const nom = cles.findIndex((c) => ['equipe', 'equipes', 'club', 'clubs'].includes(c));
  if (nom < 0) return COLONNES_PAR_DEFAUT;
  const apres = cles.slice(nom + 1).map(cleColonne);
  return apres.length ? apres : COLONNES_PAR_DEFAUT;
}

function cleColonne(c) {
  switch (c) {
    case 'pts': case 'points': case 'pt': return 'pts';
    case 'jo': case 'j': case 'mj': case 'joues': case 'j.': return 'jo';
    case 'g': case 'v': case 'gagnes': case 'victoires': return 'g';
    case 'n': case 'nuls': return 'n';
    case 'p': case 'd': case 'perdus': case 'defaites': return 'p';
    case 'f': case 'forf': case 'forfaits': return 'f';
    case 'bp': case 'bm': case 'buts pour': case 'p.': return 'bp';
    case 'bc': case 'be': case 'buts contre': case 'c.': return 'bc';
    case 'dif': case 'diff': case '+/-': case 'db': case 'difference': return 'dif';
    case 'pe': case 'pen': case 'penalites': case 'pen.': return 'pe';
    default: return '?';
  }
}

function ligneClassement(cellules, colonnes) {
  let reste = cellules;
  if (reste.length && estEntier(reste[0])) reste = reste.slice(1);
  const nom = reste[0];
  if (nom == null || estEntier(nom) || !contientDesLettres(nom) || estMotDEntete(nom)) return null;
  const nombres = reste.slice(1).map(entier).filter((n) => n != null);
  if (!nombres.length || nombres.length !== reste.length - 1) return null;
  return ligne(nom, nombres, colonnes);
}

function ligne(equipe, nombres, colonnes) {
  const lue = {
    equipe: propre(equipe), points: null, joues: null, gagnes: 0, nuls: 0, perdus: 0, forfaits: 0,
    butsPour: 0, butsContre: 0, penalites: 0,
  };
  colonnes.forEach((colonne, i) => {
    if (i >= nombres.length) return;
    const v = nombres[i];
    switch (colonne) {
      case 'pts': lue.points = v; break;
      case 'jo': lue.joues = v; break;
      case 'g': lue.gagnes = v; break;
      case 'n': lue.nuls = v; break;
      case 'p': lue.perdus = v; break;
      case 'f': lue.forfaits = v; break;
      case 'bp': lue.butsPour = v; break;
      case 'bc': lue.butsContre = v; break;
      case 'pe': lue.penalites = v; break;
      default: break;
    }
  });
  return lue;
}

function dedoublonne(lues) {
  const vues = new Set();
  return lues.filter((l) => {
    const c = cle(l.equipe);
    if (vues.has(c)) return false;
    vues.add(c);
    return true;
  });
}

// MARK: - Matchs

/** Un match lu, avec son résultat et son score s'il a ses buts. */
export function matchLu(domicile, exterieur, butsDomicile = null, butsExterieur = null, cotes = null) {
  const m = { domicile, exterieur, butsDomicile, butsExterieur, cotes, resultat: null, score: null };
  if (butsDomicile != null && butsExterieur != null) {
    m.resultat = butsDomicile > butsExterieur ? '1' : (butsDomicile === butsExterieur ? 'N' : '2');
    m.score = `${butsDomicile}-${butsExterieur}`;
  }
  return m;
}

/** `stricte` : texte d'une page quelconque, où deux lignes de menu se suivent souvent. Seuls comptent
 *  alors les matchs accompagnés de leur score (ou de « - » s'ils sont à venir). */
export function matchs(texte, { stricte = false } = {}) {
  const lus = [];
  const restantes = [];
  for (const l of lignes(texte)) {
    const m = matchSurUneLigne(l);
    if (m && (!stricte || m.resultat != null)) lus.push(m);
    else restantes.push(l);
  }
  return [...lus, ...matchsEnCartes(restantes, stricte)];
}

const NOMBRE_DECIMAL = String.raw`(\d+(?:[.,]\d+)?)`;
const MOTIF_RESULTAT = /^(.+?)\s+(\d{1,2})\s*[-–:]\s*(\d{1,2})\s+(.+)$/;
const MOTIF_MATCH = new RegExp(String.raw`^(.+?)\s+(?:-|–|—|vs\.?|VS\.?|contre)\s+(.+?)(?:\s+${NOMBRE_DECIMAL}\s+${NOMBRE_DECIMAL}\s+${NOMBRE_DECIMAL})?$`);

export function matchSurUneLigne(brute) {
  // Tableau : « A <tab> B », « A <tab> - <tab> B », « A <tab> 2 <tab> 1 <tab> B », « A <tab> B <tab> 1,8 <tab> 3 <tab> 4 ».
  if (brute.includes('\t')) {
    const cellules = brute.split('\t').map(propre)
      .filter((c) => c && !PUCES.has(c) && !['-', '–', '—', 'vs', 'VS'].includes(c));
    const equipes = cellules.filter(estEquipe);
    if (equipes.length === 2) {
      const autres = cellules.filter((c) => !estEquipe(c));
      const buts = autres.filter((c) => /^-?\d+$/.test(c)).map(Number);
      const cotes = autres.map(decimal).filter((c) => c != null);
      if (buts.length === 2 && autres.length === 2) return matchLu(equipes[0], equipes[1], buts[0], buts[1]);
      return matchLu(equipes[0], equipes[1], null, null, cotes.length === 3 ? cotes : null);
    }
    if (cellules.length === 1) return matchSurUneLigne(cellules[0]);
    return null;
  }

  let l = propre(brute).replace(/^\d{1,2}[.)]?\s+(?=\D)/, '');
  if (!l) return null;

  // « A 2 - 1 B » : un résultat.
  let m = capture(MOTIF_RESULTAT, l);
  if (m && estEquipe(m[0]) && estEquipe(m[3])) {
    return matchLu(m[0], m[3], Number(m[1]), Number(m[2]));
  }
  // « A - B », éventuellement suivi des trois cotes.
  m = capture(MOTIF_MATCH, l);
  if (m && estEquipe(m[0]) && estEquipe(m[1])) {
    if (m.length === 5) {
      const c = [decimal(m[2]), decimal(m[3]), decimal(m[4])];
      if (c.every((x) => x != null)) return matchLu(m[0], m[1], null, null, c);
    }
    return matchLu(m[0], m[1]);
  }
  return null;
}

/** La liste du site copiée telle quelle : pour chaque match, les deux scores (ou « - »), puis les
 *  deux équipes. */
function matchsEnCartes(restantes, stricte) {
  const jetons = restantes.flatMap((l) => l.split('\t')).map(propre).filter((j) => j && !PUCES.has(j));
  const cartes = paires(jetons);
  // Page entière copiée : seules les paires précédées de leurs scores (ou de « - ») sont des matchs.
  if (stricte || cartes.some((c) => c.precedeDeScores)) {
    return cartes.filter((c) => c.precedeDeScores).map((c) => c.match);
  }
  return cartes.map((c) => c.match);
}

function paires(jetons) {
  const lus = [];
  let scores = [];
  let i = 0;
  while (i < jetons.length) {
    const jeton = jetons[i];
    if (estScore(jeton)) {
      scores.push(jeton);
      if (scores.length > 2) scores.shift();
      i += 1;
      continue;
    }
    if (estEquipe(jeton) && i + 1 < jetons.length && estEquipe(jetons[i + 1])) {
      const [d, e] = butsDepuis(scores);
      lus.push({ match: matchLu(jeton, jetons[i + 1], d, e), precedeDeScores: scores.length > 0 });
      scores = [];
      i += 2;
      continue;
    }
    scores = [];
    i += 1;
  }
  return lus;
}

function estScore(s) {
  return s === '-' || s === '–' || (s.length <= 2 && /^\d+$/.test(s));
}

/** Deux scores séparés, ou collés (« 70 » pour 7-0) quand la copie les a joints. */
function butsDepuis(scores) {
  if (scores.length === 2 && /^\d+$/.test(scores[0]) && /^\d+$/.test(scores[1])) {
    return [Number(scores[0]), Number(scores[1])];
  }
  if (scores.length === 1 && /^\d\d$/.test(scores[0])) {
    return [Number(scores[0][0]), Number(scores[0][1])];
  }
  return [null, null];
}

/** Un jour suivi d'une date (« dim. 4 oct. », « samedi 12 ») ; pas « MARSEILLE 13 ». */
const JOURS_ET_MOIS = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\.?\s+\d/;

/** Un nom d'équipe plausible : des lettres, et pas un intitulé de journée, une date ou une heure. */
export function estEquipe(s) {
  const t = propre(s);
  if (!contientDesLettres(t) || t.length > 60) return false;
  // Menus, liens et mentions du site, pas des équipes.
  if ([':', '>', '@', '©', 'http', 'www.'].some((x) => t.includes(x))) return false;
  const c = cle(t);
  if (c.startsWith('journee') || c.startsWith('phase') || c.startsWith('tour ')) return false;
  if (JOURS_ET_MOIS.test(c)) return false;
  if (['direct', 'class.', 'classement', 'der. matchs', 'buteurs', 'vs', 'contre', 'match nul',
    'reporte', 'exempt'].includes(c)) return false;
  return true;
}

function decimal(s) {
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return null;
  return Number(s.replace(',', '.'));
}
