// Lecture du calendrier de la saison, collé ou tapé une fois : repris de Calendrier.swift
// (LectureCalendrier). Aucun site n'est lu : c'est du texte, quelle que soit sa source.
//
// Un calendrier de rencontres n'est pas protégé par le droit d'auteur (CJUE, 1er mars 2012,
// Football Dataco, C-604/10) : c'est l'utilisateur qui recopie ces faits pour son concours.
//
// Objets rendus par `lire` : journée lue { numero, date (ISO)|null, matchs: [{ domicile, exterieur,
// date|null }], numeroExplicite }.

import { lire as lireEtat } from './store.js';
import { cle, court, enDate } from './format.js';
import * as M from './modele.js';
import * as Collage from './collage.js';
import { ajouterEquipe, ajouterMatchs } from './grille.js';

const JOUR = 86_400_000;
const t = (iso) => enDate(iso)?.getTime() ?? null;

/** Trois jours d'écart au plus : la même journée. */
function proches(a, b, jours) {
  const x = t(a);
  const y = t(b);
  return x != null && y != null && Math.abs(x - y) <= jours * JOUR;
}

/** Comme `trimmingCharacters(in: .whitespaces)` : espaces et tabulations. */
function rogner(s) {
  return s.replace(/^[ \t ]+|[ \t ]+$/g, '');
}

export function lire(texte, maintenant = new Date()) {
  const saison = anneeDeSaison(maintenant);
  const journees = [];
  let avecIntitules = false;
  let dateEnCours = null;
  /** La ligne précédente n'était qu'une date : les deux lignes suivantes peuvent être un match. */
  let apresUneDate = false;
  const lignes = Collage.lignes(texte).map(rogner);

  const ajouter = (domicile, exterieur, dateMatch) => {
    if (estIntitule(domicile) || estIntitule(exterieur) || cle(domicile) === cle(exterieur)) return;
    const date = dateMatch ?? dateEnCours;
    // Sans intitulés, une nouvelle journée commence quand la date change de plus de trois jours.
    let nouvelle;
    const derniere = journees[journees.length - 1];
    if (derniere) {
      if (avecIntitules) nouvelle = false;
      else if (date && derniere.date) nouvelle = Math.abs(t(date) - t(derniere.date)) > 3 * JOUR;
      else nouvelle = false;
    } else {
      nouvelle = true;
    }
    if (nouvelle) {
      journees.push({ numero: (derniere?.numero ?? 0) + 1, date, matchs: [], numeroExplicite: false });
    }
    const j = journees[journees.length - 1];
    if (j.date == null) j.date = date;
    const dejaLa = j.matchs.some((m) => cle(m.domicile) === cle(domicile) && cle(m.exterieur) === cle(exterieur));
    if (!dejaLa) j.matchs.push({ domicile, exterieur, date });
  };

  const lireMatch = (texteLigne, date) => {
    const reste = nettoyer(texteLigne);
    if (!contientDesLettres(reste)) return false;
    const lu = Collage.matchSurUneLigne(reste);
    if (!lu) return false;
    ajouter(lu.domicile, lu.exterieur, date);
    return true;
  };

  let i = 0;
  while (i < lignes.length) {
    const ligne = lignes[i];
    i += 1;
    if (!ligne) continue;
    const date = dateDans(ligne, saison);
    const suitUneDate = apresUneDate;
    apresUneDate = false;

    const intitule = intituleDeJournee(ligne);
    if (intitule) {
      avecIntitules = true;
      const index = journees.findIndex((j) => j.numero === intitule.numero);
      if (index >= 0) {
        if (journees[index].date == null) journees[index].date = date;
        // Remise en dernière position : les matchs qui suivent la rejoignent.
        journees.push(...journees.splice(index, 1));
      } else {
        journees.push({ numero: intitule.numero, date, matchs: [], numeroExplicite: true });
      }
      dateEnCours = date;
      if (intitule.reste) lireMatch(intitule.reste, date);
      continue;
    }

    const reste = nettoyer(ligne);
    if (!contientDesLettres(reste)) {
      // Une date seule : celle des matchs qui suivent.
      if (date) {
        dateEnCours = date;
        apresUneDate = true;
        const derniere = journees[journees.length - 1];
        if (derniere && derniere.date == null && derniere.matchs.length === 0) derniere.date = date;
      }
      continue;
    }
    if (lireMatch(ligne, date)) continue;

    // Sur plusieurs lignes : « A », puis au plus deux lignes d'heure, de « - » ou de score, puis « B ».
    // Juste après une date, « A » et « B » peuvent se suivre.
    if (Collage.estEquipe(reste)) {
      let j = i;
      let separateurs = 0;
      while (j < lignes.length) {
        if (!lignes[j]) j += 1;
        else if (separateurs < 2 && estSeparateur(lignes[j])) { separateurs += 1; j += 1; }
        else break;
      }
      if (j < lignes.length && (separateurs > 0 || suitUneDate) && !estSeparateur(lignes[j])) {
        const suivante = nettoyer(lignes[j]);
        if (Collage.estEquipe(suivante)) {
          ajouter(reste, suivante, date);
          i = j + 1;
          continue;
        }
      }
    }
  }
  return journees.filter((j) => j.matchs.length).sort((a, b) => a.numero - b.numero);
}

// MARK: - Enregistrement

/** Remplace le calendrier de la compétition. Ses équipes absentes y sont ajoutées (à zéro point).
 *  Rend le nombre de matchs enregistrés. À appeler dans `modifier`. */
export function enregistrer(journeesLues, competition) {
  const e = lireEtat();
  e.calendrier = e.calendrier.filter((m) => m.championnatId !== competition.id);
  let nombre = 0;
  for (const j of journeesLues) {
    for (const lu of j.matchs) {
      inserer(lu, j.numero, lu.date ?? j.date, competition);
      nombre += 1;
    }
  }
  competition.miseAJour = new Date().toISOString();
  return nombre;
}

/** Ajoute des journées au calendrier sans toucher aux autres. Une journée numérotée dans le texte
 *  garde son numéro ; sinon elle rejoint la journée de même date (à trois jours près), ou prend le
 *  numéro suivant. Un match déjà présent n'est pas doublé. Rend le nombre de matchs ajoutés. */
export function completer(lues, competition) {
  const connues = journeesDe(competition).map((j) => ({ numero: j.numero, date: j.date }));
  let nombre = 0;
  const loin = Number.MAX_SAFE_INTEGER;
  const triees = [...lues].sort((a, b) => ((t(a.date) ?? loin) - (t(b.date) ?? loin)) || (a.numero - b.numero));
  for (const lue of triees) {
    let numero;
    if (lue.numeroExplicite) {
      numero = lue.numero;
    } else {
      const proche = lue.date ? connues.find((c) => c.date && proches(c.date, lue.date, 3)) : null;
      numero = proche ? proche.numero : connues.reduce((m, c) => Math.max(m, c.numero), 0) + 1;
    }
    if (!connues.some((c) => c.numero === numero)) connues.push({ numero, date: lue.date });
    for (const lu of lue.matchs) {
      const dejaLa = M.calendrierDe(competition.id).some((m) => m.numeroJournee === numero
        && cle(m.domicile) === cle(lu.domicile) && cle(m.exterieur) === cle(lu.exterieur));
      if (dejaLa) continue;
      inserer(lu, numero, lu.date ?? lue.date, competition);
      nombre += 1;
    }
  }
  competition.miseAJour = new Date().toISOString();
  return nombre;
}

function inserer(lu, numero, date, competition) {
  M.creerMatchCalendrier({
    championnatId: competition.id, numeroJournee: numero, date: date ?? null,
    domicile: lu.domicile.toUpperCase(), exterieur: lu.exterieur.toUpperCase(),
  });
  ajouterEquipe(lu.domicile, competition);
  ajouterEquipe(lu.exterieur, competition);
}

// MARK: - La journée qui vient

/** Les journées du calendrier enregistré : [{ numero, date, matchs, restants, intitule }]. */
export function journeesDe(competition) {
  const parNumero = new Map();
  for (const m of M.calendrierDe(competition.id)) {
    if (!parNumero.has(m.numeroJournee)) parNumero.set(m.numeroJournee, []);
    parNumero.get(m.numeroJournee).push(m);
  }
  const loin = Number.MIN_SAFE_INTEGER;
  return [...parNumero.entries()].map(([numero, liste]) => {
    const dates = liste.map((m) => m.date).filter(Boolean).sort((a, b) => t(a) - t(b));
    const matchsTries = [...liste].sort((a, b) => ((t(a.date) ?? loin) - (t(b.date) ?? loin))
      || (a.domicile < b.domicile ? -1 : a.domicile > b.domicile ? 1 : 0));
    const date = dates[0] ?? null;
    return {
      numero,
      date,
      matchs: matchsTries,
      restants: matchsTries.filter((m) => !m.ajoute),
      intitule: `J${numero}` + (date ? ` · ${court(date)}` : ''),
    };
  }).sort((a, b) => a.numero - b.numero);
}

/** La journée à mettre dans la grille du `jour` : celle dont la date en est à moins de quatre
 *  jours, sinon la première qui a encore des matchs à ajouter. */
export function journeeQuiVient(competition, jour) {
  const toutes = journeesDe(competition);
  const cible = enDate(jour).getTime();
  const pres = toutes.filter((j) => j.date && Math.abs(t(j.date) - cible) < 4 * JOUR)
    .sort((a, b) => Math.abs(t(a.date) - cible) - Math.abs(t(b.date) - cible));
  return pres[0] ?? toutes.find((j) => j.restants.length) ?? null;
}

/** Le choix « Aucune » d'un sélecteur de journée : aucun numéro de journée ne vaut 0. */
export const AUCUNE = 0;

/** La journée choisie à la main (les groupes n'en sont pas tous au même numéro), sinon celle qui
 *  vient (`numero` nul). `AUCUNE` : la compétition reste hors de la grille. */
export function journeeChoisie(numero, competition, jour) {
  if (numero == null) return journeeQuiVient(competition, jour);
  return journeesDe(competition).find((j) => j.numero === numero) ?? null;
}

/** Met les matchs choisis dans la grille, cotes proposées d'après les rangs, et les marque ajoutés. */
export function ajouterALaGrille(matchsCalendrier, competition, journee, marge) {
  const lus = matchsCalendrier.map((m) => Collage.matchLu(m.domicile, m.exterieur));
  const ajoutes = ajouterMatchs(lus, journee, { categorie: competition.nom, proposer: true, marge });
  for (const m of matchsCalendrier) m.ajoute = true;
  return ajoutes;
}

/** Avant de supprimer des matchs de grille (ou leur journée) : leurs matchs du calendrier
 *  redeviennent « à mettre en grille », sauf s'ils sont encore dans une autre grille. */
export function liberer(rencontres) {
  const e = lireEtat();
  const retirees = new Set(rencontres.map((r) => r.id));
  const restantes = e.rencontres.filter((r) => !retirees.has(r.id));
  const meme = (r, m) => cle(r.domicile) === cle(m.domicile) && cle(r.exterieur) === cle(m.exterieur);
  for (const r of rencontres) {
    const competition = M.championnatNomme(r.categorie);
    if (!competition) continue;
    for (const m of M.calendrierDe(competition.id)) {
      if (!m.ajoute || !meme(r, m)) continue;
      const ailleurs = restantes.some((x) => cle(x.categorie) === cle(competition.nom) && meme(x, m));
      if (!ailleurs) m.ajoute = false;
    }
  }
}

// MARK: - Détails

export function anneeDeSaison(date) {
  const d = enDate(date);
  return d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

/** Les mois en toutes lettres ou abrégés, en français et en anglais (sans accents). */
const MOIS = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fevr: 2, fev: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, avr: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juillet: 7, juil: 7, jul: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};

/** Les mêmes mots, pour les retirer d'une ligne (accents permis). */
const MOTIF_MOIS = '(?:janvier|janv|january|jan|f[ée]vrier|f[ée]vr|f[ée]v|february|feb|mars|march|mar|avril|avr|april|apr|mai|may|juin|june|jun|juillet|juil|july|jul|ao[uû]t|august|aug|septembre|september|sept|sep|octobre|october|oct|novembre|november|nov|d[ée]cembre|december|d[ée]c)';

/** Groupes capturés, sans ceux qui n'ont rien capturé (comme le `compactMap` du Swift). */
function groupes(m) {
  return m.slice(1).filter((g) => g !== undefined);
}

/** La date écrite dans la ligne : « 21/09/2026 », « 21.09.26 », « 2026-09-21 », « 21 septembre
 *  2026 », « dimanche 21 sept. ». Sans année, celle de la saison. Rend un texte ISO ou `null`. */
export function dateDans(ligne, saison) {
  const texte = cle(ligne);
  let jour = null;
  let numeroMois = null;
  let annee = null;
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(texte);
  if (m) {
    [annee, numeroMois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /(?<![\d/.])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?(?![\d/.])/.exec(texte))) {
    const g = groupes(m);
    [jour, numeroMois] = [Number(g[0]), Number(g[1])];
    annee = g.length > 2 ? Number(g[2]) : null;
  } else {
    // Le premier « nombre + mot » dont le mot est un mois (« Round 1 Sun 6 Sep » : pas « 1 sun »).
    const motif = /(?<!\d)(\d{1,2})(?:er|st|nd|rd|th)?\s+([a-z]{3,9})\b\.?(?:\s+(\d{4}))?/g;
    for (const x of texte.matchAll(motif)) {
      const g = groupes(x);
      if (MOIS[g[1]] != null) {
        [jour, numeroMois] = [Number(g[0]), MOIS[g[1]]];
        annee = g.length > 2 ? Number(g[2]) : null;
        break;
      }
    }
  }
  if (jour == null || numeroMois == null || jour < 1 || jour > 31 || numeroMois < 1 || numeroMois > 12) return null;
  let an = annee ?? (numeroMois >= 7 ? saison : saison + 1);
  if (an < 100) an += 2000;
  return new Date(an, numeroMois - 1, jour, 12).toISOString();
}

/** Sans casse ni accents, caractère par caractère : la même longueur que la ligne. */
function plier(ligne) {
  return [...ligne].map((c) => {
    const p = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return p.length === 1 ? p : c.toLowerCase();
  }).join('');
}

const MOTIFS_INTITULE = [
  // « Journée 3 », et ses équivalents d'autres pays (Matchday, Round, Jornada, Giornata…).
  /^(?:.*?\s)?(?:journee|matchday|gameweek|round|jornada|giornata|spieltag|speeldag|speelronde|runde|kolejka)\s*(?:n\s*[°o]\.?\s*)?(\d{1,2})\b/,
  /^(?:.*?\s)?(\d{1,2})\s*(?:e|er|ere|eme|re)\s+journee\b/,
  /^j\.?\s*(\d{1,2})\b/,
];

/** « Journée 3 », « Journée n°3 », « 3e journée », « J3 » ; `reste` : ce qui suit sur la ligne. */
function intituleDeJournee(ligne) {
  const pliee = plier(ligne);
  const caracteres = [...ligne];
  if ([...pliee].length !== caracteres.length) return null;
  for (const motif of MOTIFS_INTITULE) {
    const m = motif.exec(pliee);
    if (!m) continue;
    const numero = Number(m[1]);
    if (!(numero > 0)) continue;
    const fin = [...m[0]].length;
    const reste = caracteres.slice(fin).join('').replace(/^[ :\-–—]+|[ :\-–—]+$/g, '');
    return { numero, reste };
  }
  return null;
}

const MOTIFS_NETTOYAGE = [
  /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b\.?,?\s+(?=\d)/gi,
  new RegExp(String.raw`\b\d{1,2}(?:er|st|nd|rd|th)?\s+` + MOTIF_MOIS + String.raw`\b\.?(?:\s+\d{4})?`, 'gi'),
  /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
  /(?<![\d/.])\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?(?![\d/.])/g,
  /\b\d{1,2}\s*[h:]\s*\d{0,2}\b/gi,
  /\b(?:match|rencontre)\s*(?:n\s*[°o]\.?\s*)?\d+\b/gi,
  /(?:^|\s)(?:n°|#)\s*\d+\b/gi,
];

/** Retire dates, jours, heures et numéros de match ; garde les tabulations (tableaux). */
function nettoyer(ligne) {
  let texte = ligne;
  for (const motif of MOTIFS_NETTOYAGE) texte = texte.replace(motif, ' ');
  // « A / B » : la barre sépare les équipes comme le tiret.
  texte = texte.replace(/\s+\/\s+/g, ' - ');
  const lignePropre = texte.split('\t').map((c) => c.split(' ').filter(Boolean).join(' ')).join('\t');
  return lignePropre.replace(/^[ :\-–—,;]+|[ :\-–—,;]+$/g, '');
}

/** Entre les deux équipes d'un match écrit sur trois lignes. */
function estSeparateur(ligne) {
  const s = rogner(ligne).toLowerCase();
  if (['-', '–', '—', '/', 'vs', 'vs.', 'contre'].includes(s)) return true;
  // Une heure, un score « 2 - 1 », ou un score seul sur sa ligne (« 2 », puis « 1 »).
  return /^\d{1,2}\s*[h:]\s*\d{0,2}$|^\d{1,2}\s*[-–]\s*\d{1,2}$|^\d{1,2}$/.test(s);
}

/** Titres et menus pris à tort pour un match (« D3 - Groupe B », « Phase aller - Poule A »…). */
function estIntitule(equipe) {
  const c = cle(equipe);
  return ['poule', 'groupe', 'group', 'championnat', 'division', 'phase', 'saison', 'season', 'calendrier',
    'fixtures', 'aller', 'retour', 'home', 'away', 'round', 'matchday',
    'journee', 'exempt', 'equipe', 'domicile', 'exterieur', 'visiteur', 'recevant', 'federation',
    'ligue', 'district', 'fff', 'resultats', 'classement', 'accueil', 'semaine', 'navigation',
    'competition', 'recherche'].some((x) => c === x || c.startsWith(x + ' '));
}

function contientDesLettres(s) {
  return /\p{L}/u.test(s);
}

/** Pour les tests : la base d'état n'est pas lue par `lire` ni par `dateDans`. */
export const _interne = { nettoyer, intituleDeJournee, estSeparateur, estIntitule };
