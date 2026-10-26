// Ce que l'on fait d'un texte collé : remplir la grille, poser les résultats, remplacer un
// classement ; les cotes proposées d'après les classements ; les compétitions et des rangs qui
// suivent les résultats saisis. Repris de Grille.swift. À appeler dans `modifier(() => …)`.

import { lire } from './store.js';
import { Cotes, Equipes, pointsLigne } from './calcul.js';
import { cle } from './format.js';
import * as M from './modele.js';
import { urlWeb } from './reglages.js';

// MARK: - Cotes

export function forces(rencontre, championnats = M.championnatsAvecLignes()) {
  const domicile = Equipes.ligne(rencontre.domicile, rencontre.categorie, championnats);
  const exterieur = Equipes.ligne(rencontre.exterieur, rencontre.categorie, championnats);
  return [domicile ? Cotes.force(domicile) : null, exterieur ? Cotes.force(exterieur) : null];
}

/** Pose les cotes proposées sur un match. Rend `false` si aucune des deux équipes n'est au
 *  classement : on ne peut alors proposer que les cotes d'un match équilibré. */
export function proposerCotes(rencontre, marge, championnats = M.championnatsAvecLignes()) {
  const [domicile, exterieur] = forces(rencontre, championnats);
  const c = Cotes.proposer(domicile, exterieur, marge);
  rencontre.cote1 = c.un;
  rencontre.coteN = c.nul;
  rencontre.cote2 = c.deux;
  return domicile != null || exterieur != null;
}

// MARK: - Matchs collés

/** Ajoute les matchs (lus par collage.js) à la suite de la grille. Un match déjà présent (mêmes
 *  équipes) est ignoré. Les cotes collées sont gardées ; sinon, proposées si on le demande.
 *  Rend le nombre de matchs ajoutés. */
export function ajouterMatchs(lus, journee, { categorie = '', proposer = false, marge = 0.3 } = {}) {
  let ajoutes = 0;
  const existants = M.matchs(journee.id);
  let ordre = existants.length ? existants[existants.length - 1].ordre : 0;
  const championnats = M.championnatsAvecLignes();
  for (const lu of lus) {
    const dejaLa = M.matchs(journee.id).some((r) => Equipes.meme(r.domicile, lu.domicile) && Equipes.meme(r.exterieur, lu.exterieur));
    if (dejaLa) continue;
    ordre += 1;
    const r = M.creerRencontre({
      journeeId: journee.id, ordre, categorie: categorie.trim(),
      domicile: lu.domicile.toUpperCase(), exterieur: lu.exterieur.toUpperCase(),
    });
    if (lu.cotes && lu.cotes.length === 3) {
      [r.cote1, r.coteN, r.cote2] = lu.cotes;
    } else if (proposer) {
      proposerCotes(r, marge, championnats);
    }
    ajoutes += 1;
  }
  return ajoutes;
}

// MARK: - Résultats collés

/** Associe chaque score collé au match de la grille qui a les mêmes équipes :
 *  [{ lu, rencontre, conflit, applicable }]. */
export function correspondances(lus, journee) {
  const liste = M.matchs(journee.id);
  return lus.filter((lu) => lu.resultat != null).map((lu) => {
    const rencontre = liste.find((r) => Equipes.meme(r.domicile, lu.domicile) && Equipes.meme(r.exterieur, lu.exterieur)) ?? null;
    // Le match a déjà un autre résultat : on ne l'écrase pas sans le dire.
    const conflit = !!(rencontre && rencontre.resultat != null && rencontre.resultat !== lu.resultat);
    // À poser : un résultat qui manque, ou le score d'un résultat déjà saisi à la main.
    const applicable = !!(rencontre && !conflit && (rencontre.resultat == null || rencontre.score == null));
    return { lu, rencontre, conflit, applicable };
  });
}

/** Pose les résultats des matchs retrouvés qui n'en avaient pas encore, avec leur score.
 *  Rend le nombre de matchs complétés. */
export function appliquer(liste) {
  let poses = 0;
  for (const c of liste) {
    if (!c.applicable) continue;
    if (c.rencontre.resultat == null) c.rencontre.resultat = c.lu.resultat;
    if (c.rencontre.score == null) c.rencontre.score = c.lu.score;
    poses += 1;
  }
  return poses;
}

// MARK: - Compétitions saisies à la main

/** Une compétition créée de toutes pièces : son nom, et ses équipes à zéro point. */
export function creerCompetition({ nom, equipes = [], adresse = '' }) {
  const ordre = lire().championnats.reduce((m, c) => Math.max(m, c.ordre), 0) + 1;
  const competition = M.creerChampionnat({ nom: nom.trim(), ordre, adresse: urlWeb(adresse) ?? '' });
  for (const equipe of equipes) ajouterEquipe(equipe, competition);
  return competition;
}

/** Range les compétitions : `liste` dans le nouvel ordre ; toutes sont numérotées à la suite. */
export function ordonner(liste) {
  liste.forEach((c, i) => { c.ordre = i + 1; });
}

/** Ajoute une équipe, sauf si elle y est déjà (sans tenir compte des majuscules ni des accents). */
export function ajouterEquipe(nom, competition) {
  const propre = String(nom).split(/\s+/).filter(Boolean).join(' ');
  if (!propre) return null;
  const deja = M.lignesDe(competition.id).find((l) => cle(l.equipe) === cle(propre));
  if (deja) return deja;
  const ligne = M.creerLigne({ championnatId: competition.id, equipe: propre.toUpperCase() });
  competition.miseAJour = new Date().toISOString();
  return ligne;
}

/** Renomme la compétition et les matchs qui portent son nom, pour qu'ils lui restent rattachés. */
export function renommerCompetition(competition, nouveau) {
  const nom = nouveau.trim();
  if (!nom || nom === competition.nom) return;
  const ancien = cle(competition.nom);
  for (const r of lire().rencontres) {
    if (cle(r.categorie) === ancien) r.categorie = nom;
  }
  competition.nom = nom;
}

/** Les matchs de la compétition, journée par journée : [{ journee, matchs }]. */
export function matchsDe(competition, journees = M.journeesTriees()) {
  const c = cle(competition.nom);
  return journees.map((journee) => ({
    journee, matchs: M.matchs(journee.id).filter((r) => cle(r.categorie) === c),
  })).filter((x) => x.matchs.length);
}

/** Victoires, nuls et défaites recomptés d'après les résultats posés dans les journées (buts,
 *  forfaits et pénalités gardés). Une équipe des matchs absente y est ajoutée. Rend le nombre de
 *  résultats comptés. */
export function recalculerRangs(competition) {
  for (const l of M.lignesDe(competition.id)) {
    l.gagnes = 0;
    l.nuls = 0;
    l.perdus = 0;
    l.ajustement = 0;
  }
  let comptes = 0;
  const tous = matchsDe(competition).flatMap((x) => x.matchs);
  for (const r of tous) {
    const issue = M.issueDuResultat(r.resultat);
    if (!issue) continue;
    const domicile = equipe(r.domicile, competition);
    const exterieur = equipe(r.exterieur, competition);
    if (!domicile || !exterieur) continue;
    if (issue === '1') { domicile.gagnes += 1; exterieur.perdus += 1; }
    if (issue === 'N') { domicile.nuls += 1; exterieur.nuls += 1; }
    if (issue === '2') { domicile.perdus += 1; exterieur.gagnes += 1; }
    comptes += 1;
  }
  marquerComptes(tous);
  competition.miseAJour = new Date().toISOString();
  return comptes;
}

// MARK: - Rangs qui suivent les résultats

/** Chaque résultat nouveau, changé ou effacé d'un match de la journée est reporté sur les deux
 *  équipes de sa compétition, une seule fois (`resultatCompte`), et son score sur leurs buts
 *  (`scoreCompte`). Rend le nombre de matchs reportés. */
export function suivreResultats(journee) {
  let reportes = 0;
  for (const r of M.matchs(journee.id)) {
    const retenu = M.scoreRetenu(r);
    if (r.resultat === r.resultatCompte && retenu === r.scoreCompte) continue;
    const competition = M.championnatNomme(r.categorie);
    const domicile = competition ? equipeConnue(r.domicile, competition) : null;
    const exterieur = competition ? equipeConnue(r.exterieur, competition) : null;
    if (domicile && exterieur) {
      compter(r.resultatCompte, domicile, exterieur, -1);
      compter(r.resultat, domicile, exterieur, 1);
      compterButs(r.scoreCompte, domicile, exterieur, -1);
      compterButs(retenu, domicile, exterieur, 1);
      competition.miseAJour = new Date().toISOString();
      reportes += 1;
    }
    r.resultatCompte = r.resultat;
    r.scoreCompte = retenu;
  }
  return reportes;
}

/** Avant de supprimer des matchs (ou leur journée) : leurs résultats sortent des rangs. */
export function retirerDesRangs(rencontres) {
  for (const r of rencontres) {
    if (r.resultatCompte == null && r.scoreCompte == null) continue;
    const competition = M.championnatNomme(r.categorie);
    const domicile = competition ? equipeConnue(r.domicile, competition) : null;
    const exterieur = competition ? equipeConnue(r.exterieur, competition) : null;
    if (domicile && exterieur) {
      compter(r.resultatCompte, domicile, exterieur, -1);
      compterButs(r.scoreCompte, domicile, exterieur, -1);
    }
    r.resultatCompte = null;
    r.scoreCompte = null;
  }
}

/** Ces résultats sont déjà dans les rangs (classement collé, recompte, données d'origine). */
export function marquerComptes(rencontres) {
  for (const r of rencontres) {
    r.resultatCompte = r.resultat;
    r.scoreCompte = M.scoreRetenu(r);
  }
}

function compterButs(score, domicile, exterieur, sens) {
  const b = M.buts(score);
  if (!b) return;
  domicile.butsPour = Math.max(0, domicile.butsPour + sens * b.domicile);
  domicile.butsContre = Math.max(0, domicile.butsContre + sens * b.exterieur);
  exterieur.butsPour = Math.max(0, exterieur.butsPour + sens * b.exterieur);
  exterieur.butsContre = Math.max(0, exterieur.butsContre + sens * b.domicile);
}

function compter(resultat, domicile, exterieur, sens) {
  const issue = M.issueDuResultat(resultat);
  if (issue === '1') {
    domicile.gagnes = Math.max(0, domicile.gagnes + sens);
    exterieur.perdus = Math.max(0, exterieur.perdus + sens);
  } else if (issue === 'N') {
    domicile.nuls = Math.max(0, domicile.nuls + sens);
    exterieur.nuls = Math.max(0, exterieur.nuls + sens);
  } else if (issue === '2') {
    domicile.perdus = Math.max(0, domicile.perdus + sens);
    exterieur.gagnes = Math.max(0, exterieur.gagnes + sens);
  }
}

/** L'équipe d'un match dans la compétition, même écrite un peu autrement ; jamais ajoutée. */
function equipeConnue(nom, competition) {
  const lignes = M.lignesDe(competition.id);
  const exacte = lignes.find((l) => cle(l.equipe) === cle(nom));
  if (exacte) return exacte;
  const proches = lignes.filter((l) => Equipes.meme(l.equipe, nom));
  return proches.length === 1 ? proches[0] : null;
}

/** L'équipe d'un match dans la liste, même écrite un peu autrement, sinon ajoutée. */
function equipe(nom, competition) {
  return equipeConnue(nom, competition) ?? ajouterEquipe(nom, competition);
}

// MARK: - Classement collé

/** Remplace les équipes de la compétition par celles d'un classement collé (collage.js). */
export function remplacerClassement(championnat, lues) {
  const e = lire();
  e.lignes = e.lignes.filter((l) => l.championnatId !== championnat.id);
  for (const lue of lues) {
    const ligne = M.creerLigne({
      championnatId: championnat.id, equipe: lue.equipe, gagnes: lue.gagnes, nuls: lue.nuls,
      perdus: lue.perdus, forfaits: lue.forfaits, butsPour: lue.butsPour, butsContre: lue.butsContre,
      penalites: lue.penalites, jouesSaisis: lue.joues ?? 0,
    });
    if (lue.points != null) ligne.ajustement = lue.points - pointsLigne(ligne);
  }
  // Le classement collé inclut les résultats déjà posés : ils ne se recomptent pas.
  const c = cle(championnat.nom);
  marquerComptes(e.rencontres.filter((r) => cle(r.categorie) === c));
  championnat.miseAJour = new Date().toISOString();
}
