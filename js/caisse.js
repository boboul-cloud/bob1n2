// Toutes les opérations qui touchent aux porte-feuilles : repris de Caisse.swift (les macros
// « Amiser », « Encaissement », « Reapro_Compte » et « consommation » du classeur). Chaque
// variation de points laisse un mouvement dans l'historique du joueur.
//
// Ces fonctions changent l'état en place : appelez-les dans `modifier(() => …)`. Une opération
// refusée lève une `ErreurCaisse` AVANT tout changement.

import { lire } from './store.js';
import { Calcul, trierJoueurs } from './calcul.js';
import { arrondi, enEuros, enPoints } from './format.js';
import * as M from './modele.js';
import { retirerDesRangs } from './grille.js';
import { liberer } from './calendrier.js';

export class ErreurCaisse extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErreurCaisse';
  }
}

const E = {
  joueurManquant: () => new ErreurCaisse('Choisissez le joueur.'),
  joueurArchive: () => new ErreurCaisse('Ce joueur est archivé.'),
  journeeFermee: () => new ErreurCaisse('Les paris de cette journée sont fermés.'),
  aucunPronostic: () => new ErreurCaisse('Choisissez au moins un match.'),
  matchDejaJoue: (match) => new ErreurCaisse(`Le match ${match} a déjà un résultat.`),
  systemeInvalide: () => new ErreurCaisse('Un système se joue sur 3 à 8 matchs.'),
  niveauxManquants: () => new ErreurCaisse('Cochez au moins une formule (« 2 sur … », « 3 sur … »…).'),
  miseInvalide: () => new ErreurCaisse('La mise se compte en points entiers : au moins 1 point, sans décimale.'),
  soldeInsuffisant: (solde) => new ErreurCaisse(`Solde insuffisant : ${enPoints(solde)} disponibles.`),
  montantInvalide: () => new ErreurCaisse('Le nombre de points doit être supérieur à zéro.'),
  consommationImpossible: (besoin) => new ErreurCaisse(`Il faut ${enPoints(besoin)} pour offrir cette consommation.`),
  pariDejaRegle: () => new ErreurCaisse('Ce pari est déjà réglé.'),
  pariNonTermine: () => new ErreurCaisse('Tous les résultats de ce pari ne sont pas encore connus.'),
};

// MARK: - Joueurs

export function nouveauJoueur({ nom, prenom, points, telephone = '' }) {
  const joueur = M.creerJoueur({ numero: M.prochainNumero(), nom, prenom, points: 0, telephone });
  if (points !== 0) {
    mouvement(joueur, points, 'ouverture', 'Ouverture du porte-feuilles');
  }
  return joueur;
}

/** « RAJOUT DE POINTS » (macro Reapro_Compte). */
export function recharger(joueur, points) {
  if (!(points > 0)) throw E.montantInvalide();
  mouvement(joueur, points, 'recharge', 'Rajout de points');
}

/** Consommation offerte contre des points, à son prix : prix × points pour 1 €. */
export function offrir(joueur, prix, pointsParEuro) {
  if (!(prix > 0 && pointsParEuro > 0)) throw E.montantInvalide();
  const cout = arrondi(prix * pointsParEuro);
  if (cout > joueur.points + 0.0001) throw E.consommationImpossible(cout);
  const ligne = mouvement(joueur, -cout, 'consommation', `Consommation offerte de ${enEuros(arrondi(prix))}`);
  ligne.depense = arrondi(prix);
  return ligne;
}

/** Un achat au comptoir, hors paris : les points gagnés s'ajoutent au porte-feuilles et l'achat
 *  reste dans l'historique avec son montant. */
export function enregistrerAchat(joueur, montant, points) {
  if (!(montant > 0)) throw E.montantInvalide();
  const ligne = mouvement(joueur, Math.max(0, points), 'achat', `Achat de ${enEuros(arrondi(montant))}`);
  ligne.depense = arrondi(montant);
  return ligne;
}

export function corrigerSolde(joueur, nouveauSolde, motif) {
  const ecart = arrondi(nouveauSolde - joueur.points);
  if (ecart === 0) return;
  const libelle = motif.trim() ? motif : 'Correction du solde';
  mouvement(joueur, ecart, 'correction', libelle);
}

/** Efface l'historique d'un joueur : ses mouvements et ses paris terminés (qui disparaissent aussi de
 *  leur journée). Son solde et ses paris en cours restent ; une ligne « solde reporté » ouvre le
 *  nouvel historique et garde le cumul des achats. Rend { mouvements, paris } effacés. */
export function effacerHistorique(joueur) {
  const e = lire();
  const cumul = M.cumulDepenses(joueur.id);
  const taille = M.tailleHistorique(joueur.id);
  e.mouvements = e.mouvements.filter((m) => m.joueurId !== joueur.id);
  for (const p of e.paris.filter((x) => x.joueurId === joueur.id && x.statut !== 'enCours')) {
    M.supprimerPariDonnees(p.id);
  }
  M.creerMouvement({
    joueurId: joueur.id, type: 'report', montant: 0, soldeApres: joueur.points,
    libelle: 'Historique effacé · solde reporté', depense: cumul,
  });
  return { mouvements: taille.mouvements, paris: taille.parisTermines };
}

// MARK: - Paris

/**
 * Enregistre un pari et retire la mise du porte-feuilles. Comme la cellule Q2 du classeur, une mise
 * supérieure au solde est refusée. `choix` : [{ rencontre, issue }]. Rend le pari.
 */
export function placerPari({ joueur, journee, choix, formule, niveaux = [], miseUnitaire, aDistance = false }) {
  if (!joueur) throw E.joueurManquant();
  if (joueur.archive) throw E.joueurArchive();
  if (!journee || journee.statut !== 'ouverte') throw E.journeeFermee();
  if (!choix.length) throw E.aucunPronostic();
  const dejaJoue = choix.find((c) => c.rencontre.resultat != null);
  if (dejaJoue) throw E.matchDejaJoue(M.intitule(dejaJoue.rencontre));

  let niveauxRetenus = null;
  if (formule === 'systeme') {
    if (!Calcul.estTailleSysteme(choix.length)) throw E.systemeInvalide();
    const valides = [...new Set(niveaux)].filter((k) => k >= 2 && k <= choix.length).sort((a, b) => a - b);
    if (!valides.length) throw E.niveauxManquants();
    niveauxRetenus = valides;
  }

  const mise = miseUnitaire;
  if (!(mise >= 1) || mise !== Math.round(mise)) throw E.miseInvalide();
  const combinaisons = Calcul.nombreDeCombinaisons(choix.length, niveauxRetenus);
  const total = arrondi(mise * combinaisons);
  if (total > joueur.points + 0.0001) throw E.soldeInsuffisant(joueur.points);

  const pari = M.creerPari({
    joueurId: joueur.id, journeeId: journee.id, formule, niveaux: niveauxRetenus ?? [],
    miseUnitaire: mise, miseTotale: total,
  });
  for (const { rencontre, issue } of [...choix].sort((a, b) => a.rencontre.ordre - b.rencontre.ordre)) {
    M.creerPronostic({
      pariId: pari.id, rencontreId: rencontre.id, issue,
      cote: M.cote(rencontre, issue), intitule: M.intitule(rencontre),
    });
  }
  mouvement(joueur, -total, 'mise', `${aDistance ? 'Pari à distance' : 'Pari'} · ${journee.titre}`);
  return pari;
}

/** Macro « Encaissement » : verse le gain d'un pari dont tous les résultats sont connus. */
export function regler(pari) {
  if (pari.statut !== 'enCours') throw E.pariDejaRegle();
  const ev = M.evaluation(pari);
  if (!ev.termine) throw E.pariNonTermine();
  const gain = arrondi(ev.gainAcquis);
  pari.gainRegle = gain;
  pari.statut = 'regle';
  pari.dateReglement = new Date().toISOString();
  const joueur = M.joueur(pari.joueurId);
  if (gain > 0 && joueur) {
    mouvement(joueur, gain, 'gain', `Gain · ${M.journee(pari.journeeId)?.titre ?? 'pari'}`);
  }
  return gain;
}

/** Règle d'un coup tous les paris prêts de la journée, puis la clôture si plus rien n'est en jeu.
 *  Rend { nombre, gains }. */
export function reglerTout(journee) {
  let nombre = 0;
  let gains = 0;
  for (const pari of M.parisARegler(journee.id)) {
    try {
      gains += regler(pari);
      nombre += 1;
    } catch { /* déjà réglé */ }
  }
  if (M.tousLesResultats(journee.id) && !M.parisDeLaJournee(journee.id).some((p) => p.statut === 'enCours')) {
    journee.statut = 'cloturee';
  }
  return { nombre, gains: arrondi(gains) };
}

/** Annule un pari en cours et rend la mise. */
export function rembourser(pari) {
  if (pari.statut !== 'enCours') throw E.pariDejaRegle();
  pari.statut = 'rembourse';
  pari.dateReglement = new Date().toISOString();
  const joueur = M.joueur(pari.joueurId);
  if (joueur) {
    mouvement(joueur, pari.miseTotale, 'remboursement', `Pari remboursé · ${M.journee(pari.journeeId)?.titre ?? ''}`);
  }
}

// MARK: - Journées

/** Corrige le titre et la date d'une journée ; un titre vide est refusé. */
export function renommerJournee(journee, titre, date) {
  const propre = titre.trim();
  if (propre) journee.titre = propre;
  journee.date = date;
}

/** Une journée neuve ; `modele` : celle dont on reprend les matchs et les cotes. */
export function nouvelleJournee({ titre, date, modele = null }) {
  const journee = M.creerJournee({ titre, date });
  if (modele) {
    for (const s of M.matchs(modele.id)) {
      M.creerRencontre({
        journeeId: journee.id, ordre: s.ordre, categorie: s.categorie, domicile: s.domicile,
        exterieur: s.exterieur, cote1: s.cote1, coteN: s.coteN, cote2: s.cote2,
      });
    }
  }
  return journee;
}

export function ajouterRencontre(journee) {
  const liste = M.matchs(journee.id);
  const derniere = liste[liste.length - 1];
  return M.creerRencontre({
    journeeId: journee.id, ordre: (derniere?.ordre ?? 0) + 1, categorie: derniere?.categorie ?? '',
  });
}

/** Supprime un match sans pari. Un match déjà joué par quelqu'un s'annule plutôt. */
export function supprimerRencontre(rencontre) {
  if (M.aDesParis(rencontre.id)) return;
  retirerDesRangs([rencontre]);
  liberer([rencontre]);
  const journeeId = rencontre.journeeId;
  M.supprimerRencontreDonnees(rencontre.id);
  M.matchs(journeeId).forEach((m, i) => { m.ordre = i + 1; });
}

/** Supprime une journée en rendant d'abord les mises des paris pas encore réglés. */
export function supprimerJournee(journee) {
  for (const pari of M.parisDeLaJournee(journee.id)) {
    if (pari.statut === 'enCours') rembourser(pari);
  }
  const liste = M.matchs(journee.id);
  retirerDesRangs(liste);
  liberer(liste);
  M.supprimerJourneeDonnees(journee.id);
}

// MARK: - Concours

/** Le classement du concours : joueurs non archivés, par points puis par nom. */
export function classementJoueurs() {
  return trierJoueurs(M.joueurs({ archives: false }), M.nomComplet);
}

/** Clôt le concours : garde le podium au palmarès et remet chaque porte-feuilles au départ.
 *  Les paris en cours ne sont pas touchés : leurs gains iront au nouveau concours. */
export function nouveauConcours({ titre, pointsDepart, enregistrerPodium }) {
  const joueurs = M.joueurs({ archives: false });
  let palmares = null;
  const podium = trierJoueurs(joueurs, M.nomComplet).slice(0, 3);
  if (enregistrerPodium && podium.length) {
    palmares = M.creerPalmares({ titre, noms: podium.map(M.nomComplet), points: podium.map((j) => j.points) });
  }
  for (const joueur of joueurs) {
    const ecart = arrondi(pointsDepart - joueur.points);
    mouvement(joueur, ecart, 'nouveauConcours', `Nouveau concours · ${titre}`);
  }
  return palmares;
}

// MARK: - Historique

export function mouvement(joueur, montant, type, libelle) {
  joueur.points = arrondi(joueur.points + montant);
  return M.creerMouvement({
    joueurId: joueur.id, type, montant: arrondi(montant), soldeApres: joueur.points, libelle,
  });
}

// MARK: - Textes de « Supprimer l'historique » (Historique.swift)

const compter = (n, singulier, pluriel) => `${n} ${n > 1 ? (pluriel ?? `${singulier}s`) : singulier}`;

export function avertissementHistorique(joueurs) {
  const mouvements = joueurs.reduce((s, j) => s + M.tailleHistorique(j.id).mouvements, 0);
  const termines = joueurs.reduce((s, j) => s + M.tailleHistorique(j.id).parisTermines, 0);
  const enCours = joueurs.reduce((s, j) => s + M.parisEnCoursDuJoueur(j.id).length, 0);
  let texte = `Disparaissent : ${compter(mouvements, 'mouvement')} du porte-feuilles et ${compter(termines, 'pari terminé', 'paris terminés')}`;
  texte += ' (y compris dans les journées). Restent : ';
  texte += joueurs.length === 1 ? `le porte-feuilles (${enPoints(joueurs[0].points)})` : 'les porte-feuilles';
  texte += ` et ${compter(enCours, 'pari en cours', 'paris en cours')}, qui s'encaisseront normalement.`;
  return texte;
}

export function bilanHistorique(efface, nombreJoueurs) {
  return `${compter(efface.mouvements, 'mouvement')} et ${compter(efface.paris, 'pari terminé', 'paris terminés')} supprimés`
    + (nombreJoueurs > 1 ? ` pour ${nombreJoueurs} joueurs.` : '.')
    + ' Les soldes et les paris en cours sont intacts.';
}
