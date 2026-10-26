// Les objets de la base et ce qu'on en déduit : repris des modèles SwiftData (Models/*.swift).
//
// Chaque objet est un simple objet JSON rangé dans une liste de l'état (store.js), lié aux
// autres par leur `id` (`journeeId`, `joueurId`…). Les fonctions `creer…` ajoutent un objet et le
// rendent ; les `supprimer…` retirent aussi ce qui en dépend, comme les règles de suppression
// de SwiftData (cascade, ou lien remis à `null`). Toutes s'appellent dans `modifier(…)`.

import { lire, nouvelId } from './store.js';
import { Calcul, trierClassement } from './calcul.js';
import { arrondi, cle, comparerNoms, enDate, numeroSMS } from './format.js';

// MARK: - Énumérations (Types.swift)

/** Les trois issues d'un match : les colonnes 1 / N / 2 de la feuille de saisie. */
export const ISSUES = ['1', 'N', '2'];

export const EXPLICATION_ISSUE = {
  1: 'Victoire à domicile',
  N: 'Match nul',
  2: "Victoire à l'extérieur",
};

/** Résultat saisi par le barman : une issue, ou « A » pour un match annulé (compte pour une cote de 1). */
export const RESULTATS = ['1', 'N', '2', 'A'];

export function libelleResultat(r) {
  return r === 'A' ? 'Annulé' : r;
}

/** L'issue d'un résultat, ou `null` pour un match annulé ou pas encore joué. */
export function issueDuResultat(r) {
  return r && r !== 'A' ? r : null;
}

export const STATUTS_JOURNEE = {
  ouverte: { libelle: 'Paris ouverts', symbole: 'lock.open', couleur: 'vert' },
  fermee: { libelle: 'Paris fermés', symbole: 'lock', couleur: 'orange' },
  cloturee: { libelle: 'Clôturée', symbole: 'checkmark.seal', couleur: 'secondaire' },
};

export const FORMULES = {
  combine: { libelle: 'Combiné' },
  systeme: { libelle: 'Système' },
};

/** enCours, regle, rembourse */
export const STATUTS_PARI = ['enCours', 'regle', 'rembourse'];

/** Chaque mouvement du porte-feuilles, pour garder l'historique que le classeur n'avait pas. */
export const TYPES_MOUVEMENT = {
  ouverture: { libelle: 'Ouverture', symbole: 'person.badge.plus' },
  recharge: { libelle: 'Rajout de points', symbole: 'plus.circle' },
  mise: { libelle: 'Mise', symbole: 'ticket' },
  gain: { libelle: 'Gain', symbole: 'trophy' },
  remboursement: { libelle: 'Remboursement', symbole: 'arrow.uturn.backward.circle' },
  consommation: { libelle: 'Consommation offerte', symbole: 'gift' },
  achat: { libelle: 'Achat', symbole: 'cart' },
  correction: { libelle: 'Correction', symbole: 'pencil.circle' },
  nouveauConcours: { libelle: 'Nouveau concours', symbole: 'arrow.counterclockwise.circle' },
  report: { libelle: 'Solde reporté', symbole: 'clock.arrow.circlepath' },
};

export const STATUTS_GRILLE_RECUE = {
  aValider: { libelle: 'À valider', symbole: 'tray.and.arrow.down' },
  validee: { libelle: 'Validée', symbole: 'checkmark.seal' },
  refusee: { libelle: 'Refusée', symbole: 'xmark.circle' },
};

const maintenant = () => new Date().toISOString();
const temps = (iso) => enDate(iso)?.getTime() ?? 0;

/** Du plus récent au plus ancien ; à la même milliseconde (deux opérations à la suite), le dernier
 *  créé d'abord, comme les dates du Swift, plus fines que la milliseconde. */
function plusRecentsDabord(liste, dateDe) {
  return liste.map((x, i) => [x, i])
    .sort(([a, i], [b, j]) => (temps(dateDe(b)) - temps(dateDe(a))) || (j - i))
    .map(([x]) => x);
}

// MARK: - Joueurs (Joueur.swift)

export function creerJoueur({ numero, nom = '', prenom = '', points = 0, telephone = '' }) {
  const joueur = {
    id: nouvelId(), numero, nom, prenom, points, telephone,
    dateCreation: maintenant(), archive: false,
  };
  lire().joueurs.push(joueur);
  return joueur;
}

export function joueur(id) {
  return lire().joueurs.find((j) => j.id === id) ?? null;
}

export function joueurs({ archives = true } = {}) {
  return lire().joueurs.filter((j) => archives || !j.archive);
}

/** « Pierre DUPONT », comme l'en-tête « 2-nom-prénom » de la feuille du joueur. */
export function nomComplet(j) {
  if (!j) return '';
  const morceaux = [j.prenom.trim(), j.nom.trim().toUpperCase()].filter(Boolean);
  return morceaux.length ? morceaux.join(' ') : `Joueur n° ${j.numero}`;
}

export function initiales(j) {
  const lettres = [j.prenom, j.nom].map((s) => s.trim()[0]).filter(Boolean);
  return lettres.length ? lettres.join('').toUpperCase() : String(j.numero);
}

/** Le numéro pour un SMS : chiffres et « + » seulement, ou `null` s'il est trop court. */
export function telephoneSMS(j) {
  return numeroSMS(j.telephone);
}

/** Ses paris, du plus récent au plus ancien. */
export function parisDuJoueur(joueurId) {
  return plusRecentsDabord(lire().paris.filter((p) => p.joueurId === joueurId), (p) => p.dateCreation);
}

export function parisEnCoursDuJoueur(joueurId) {
  return parisDuJoueur(joueurId).filter((p) => p.statut === 'enCours');
}

/** Ses mouvements, du plus récent au plus ancien. */
export function historique(joueurId) {
  return plusRecentsDabord(lire().mouvements.filter((m) => m.joueurId === joueurId), (m) => m.date);
}

/** Total des achats au comptoir enregistrés, en euros (report d'un historique effacé compris). */
export function cumulDepenses(joueurId) {
  return lire().mouvements
    .filter((m) => m.joueurId === joueurId && (m.type === 'achat' || m.type === 'report'))
    .reduce((s, m) => arrondi(s + (m.depense ?? 0)), 0);
}

/** Ce qu'efface « Supprimer l'historique » : les mouvements et les paris terminés. */
export function tailleHistorique(joueurId) {
  const e = lire();
  return {
    mouvements: e.mouvements.filter((m) => m.joueurId === joueurId && m.type !== 'report').length,
    parisTermines: e.paris.filter((p) => p.joueurId === joueurId && p.statut !== 'enCours').length,
  };
}

/** Total des mises engagées sur des paris pas encore réglés. */
export function misesEnCours(joueurId) {
  return parisEnCoursDuJoueur(joueurId).reduce((s, p) => s + p.miseTotale, 0);
}

export function aJoue(joueurId, journeeId) {
  return lire().paris.some((p) => p.joueurId === joueurId && p.journeeId === journeeId && p.statut !== 'rembourse');
}

export function prochainNumero() {
  return lire().joueurs.reduce((max, j) => Math.max(max, j.numero), 0) + 1;
}

/** Un joueur et tout ce qui lui appartient : ses paris (et leurs pronostics) et ses mouvements. */
export function supprimerJoueur(joueurId) {
  const e = lire();
  const paris = new Set(e.paris.filter((p) => p.joueurId === joueurId).map((p) => p.id));
  e.pronostics = e.pronostics.filter((p) => !paris.has(p.pariId));
  e.paris = e.paris.filter((p) => !paris.has(p.id));
  e.mouvements = e.mouvements.filter((m) => m.joueurId !== joueurId);
  e.joueurs = e.joueurs.filter((j) => j.id !== joueurId);
}

// MARK: - Mouvements (Mouvement.swift)

export function creerMouvement({ joueurId, type, montant, soldeApres, libelle, date = maintenant(), depense = 0 }) {
  const m = { id: nouvelId(), joueurId, type, montant, soldeApres, libelle, date, depense };
  lire().mouvements.push(m);
  return m;
}

// MARK: - Journées (Journee.swift)

export function creerJournee({ titre, date = maintenant() }) {
  const j = { id: nouvelId(), titre, date, statut: 'ouverte', reference: '' };
  lire().journees.push(j);
  return j;
}

export function journee(id) {
  return lire().journees.find((j) => j.id === id) ?? null;
}

/** Les journées, la plus récente d'abord. */
export function journeesTriees() {
  return plusRecentsDabord(lire().journees, (j) => j.date);
}

/** Les matchs de la grille, dans l'ordre. */
export function matchs(journeeId) {
  return lire().rencontres.filter((r) => r.journeeId === journeeId).sort((a, b) => a.ordre - b.ordre);
}

/** Les paris de la journée, du plus ancien au plus récent. */
export function parisDeLaJournee(journeeId) {
  return lire().paris.filter((p) => p.journeeId === journeeId)
    .sort((a, b) => temps(a.dateCreation) - temps(b.dateCreation));
}

export function parisActifs(journeeId) {
  return parisDeLaJournee(journeeId).filter((p) => p.statut !== 'rembourse');
}

export function nombreResultats(journeeId) {
  return matchs(journeeId).filter((r) => r.resultat != null).length;
}

export function tousLesResultats(journeeId) {
  const liste = matchs(journeeId);
  return liste.length > 0 && liste.every((r) => r.resultat != null);
}

/** Paris en cours dont tous les résultats sont connus : prêts à être encaissés. */
export function parisARegler(journeeId) {
  return parisDeLaJournee(journeeId).filter((p) => p.statut === 'enCours' && evaluation(p).termine);
}

/** Les matchs regroupés par catégorie consécutive, comme les intitulés R3 / D3 / R1 de la feuille :
 *  [{ id, categorie, titre, rencontres }]. */
export function groupes(journeeId) {
  const liste = [];
  for (const r of matchs(journeeId)) {
    const dernier = liste[liste.length - 1];
    if (dernier && dernier.categorie === r.categorie) {
      dernier.rencontres.push(r);
    } else {
      liste.push({ id: r.ordre, categorie: r.categorie, rencontres: [r] });
    }
  }
  for (const g of liste) g.titre = g.categorie.trim() ? g.categorie : 'Matchs';
  return liste;
}

/** Une journée et ce qui en dépend : ses matchs et ses paris (et leurs pronostics). */
export function supprimerJourneeDonnees(journeeId) {
  const e = lire();
  const rencontres = new Set(e.rencontres.filter((r) => r.journeeId === journeeId).map((r) => r.id));
  const paris = new Set(e.paris.filter((p) => p.journeeId === journeeId).map((p) => p.id));
  e.pronostics = e.pronostics.filter((p) => !paris.has(p.pariId))
    .map((p) => (rencontres.has(p.rencontreId) ? { ...p, rencontreId: null } : p));
  e.paris = e.paris.filter((p) => !paris.has(p.id));
  e.rencontres = e.rencontres.filter((r) => !rencontres.has(r.id));
  e.journees = e.journees.filter((j) => j.id !== journeeId);
}

// MARK: - Rencontres (Rencontre, dans Journee.swift)

export function creerRencontre({ journeeId, ordre, categorie = '', domicile = '', exterieur = '', cote1 = 1, coteN = 1, cote2 = 1 }) {
  const r = {
    id: nouvelId(), journeeId, ordre, categorie, domicile, exterieur, cote1, coteN, cote2,
    resultat: null, reference: '', resultatCompte: null, score: null, scoreCompte: null,
  };
  lire().rencontres.push(r);
  return r;
}

export function rencontre(id) {
  return lire().rencontres.find((r) => r.id === id) ?? null;
}

/** « 2-1 », « 2 - 1 », « 2:1 » : les buts de chaque équipe, ou `null`. */
export function buts(score) {
  if (score == null) return null;
  // Comme `split(whereSeparator:)` du Swift : les morceaux vides ne comptent pas (« 2--1 » se lit).
  const morceaux = String(score).split(/[-–:]/).map((s) => s.trim()).filter((s) => s !== '');
  if (morceaux.length !== 2 || !/^\d+$/.test(morceaux[0]) || !/^\d+$/.test(morceaux[1])) return null;
  return { domicile: Number(morceaux[0]), exterieur: Number(morceaux[1]) };
}

/** Le score qui compte : seulement s'il s'accorde avec le résultat posé. */
export function scoreRetenu(r) {
  const b = buts(r.score);
  const issue = issueDuResultat(r.resultat);
  if (!b || !issue) return null;
  const selonLeScore = b.domicile > b.exterieur ? '1' : (b.domicile === b.exterieur ? 'N' : '2');
  return selonLeScore === issue ? `${b.domicile}-${b.exterieur}` : null;
}

export function cote(r, issue) {
  return issue === '1' ? r.cote1 : (issue === 'N' ? r.coteN : r.cote2);
}

export function nomDomicile(r) {
  return r.domicile.trim() ? r.domicile : 'Domicile ?';
}

export function nomExterieur(r) {
  return r.exterieur.trim() ? r.exterieur : 'Extérieur ?';
}

export function intitule(r) {
  return `${nomDomicile(r)} – ${nomExterieur(r)}`;
}

/** Le match figure dans un pari qui n'est pas remboursé. */
export function aDesParis(rencontreId) {
  const e = lire();
  return e.pronostics.some((p) => {
    if (p.rencontreId !== rencontreId) return false;
    const pari = e.paris.find((x) => x.id === p.pariId);
    return pari && pari.statut !== 'rembourse';
  });
}

/** Retire un match ; les pronostics qui le visaient le perdent (ils comptent alors comme annulés). */
export function supprimerRencontreDonnees(rencontreId) {
  const e = lire();
  e.pronostics = e.pronostics.map((p) => (p.rencontreId === rencontreId ? { ...p, rencontreId: null } : p));
  e.rencontres = e.rencontres.filter((r) => r.id !== rencontreId);
}

// MARK: - Paris (Pari.swift)

export function creerPari({ joueurId, journeeId, formule, niveaux, miseUnitaire, miseTotale }) {
  const p = {
    id: nouvelId(), joueurId, journeeId, formule, niveaux, miseUnitaire, miseTotale,
    dateCreation: maintenant(), statut: 'enCours', gainRegle: 0, dateReglement: null,
  };
  lire().paris.push(p);
  return p;
}

export function pari(id) {
  return lire().paris.find((p) => p.id === id) ?? null;
}

export function creerPronostic({ pariId, rencontreId, issue, cote: valeur, intitule: libelle }) {
  const p = { id: nouvelId(), pariId, rencontreId, issue, cote: valeur, intitule: libelle };
  lire().pronostics.push(p);
  return p;
}

/** Les matchs choisis dans un pari, dans l'ordre de la grille (un match supprimé à la fin). */
export function pronosticsDuPari(pariId) {
  const e = lire();
  const ordre = (p) => e.rencontres.find((r) => r.id === p.rencontreId)?.ordre ?? Number.MAX_SAFE_INTEGER;
  return e.pronostics.filter((p) => p.pariId === pariId).sort((a, b) => ordre(a) - ordre(b));
}

/** Cote si gagné, 0 si perdu, 1 si pas encore joué : « enAttente », « gagne », « perdu », « annule ».
 *  Un match supprimé de la grille est neutralisé comme un match annulé. */
export function etatPronostic(p) {
  const r = p.rencontreId ? rencontre(p.rencontreId) : null;
  if (!r) return 'annule';
  if (r.resultat == null) return 'enAttente';
  const gagnante = issueDuResultat(r.resultat);
  if (!gagnante) return 'annule';
  return gagnante === p.issue ? 'gagne' : 'perdu';
}

export function libelleMatch(p) {
  const r = p.rencontreId ? rencontre(p.rencontreId) : null;
  return r ? intitule(r) : p.intitule;
}

export function lignesDuPari(pariId) {
  return pronosticsDuPari(pariId).map((p) => ({ cote: p.cote, etat: etatPronostic(p) }));
}

/** { combinaisons, coteTotale, gainMaximum, gainAcquis, termine, etat } */
export function evaluation(p) {
  return Calcul.evaluer(lignesDuPari(p.id), p.formule === 'systeme' ? p.niveaux : null, p.miseUnitaire);
}

/** « Combiné · 4 matchs », « Goliath · 247 combinaisons »… */
export function descriptionFormule(p) {
  const n = lire().pronostics.filter((x) => x.pariId === p.id).length;
  if (p.formule === 'systeme') {
    const combinaisons = Calcul.nombreDeCombinaisons(n, p.niveaux);
    return `${Calcul.nomSysteme(n, p.niveaux)} · ${combinaisons} combinaisons`;
  }
  return n > 1 ? `Combiné · ${n} matchs` : 'Simple · 1 match';
}

/** Un pari et ses pronostics. */
export function supprimerPariDonnees(pariId) {
  const e = lire();
  e.pronostics = e.pronostics.filter((p) => p.pariId !== pariId);
  e.paris = e.paris.filter((p) => p.id !== pariId);
}

// MARK: - Compétitions (Championnat.swift)

export function creerChampionnat({ nom, ordre = 0, adresse = '' }) {
  const c = { id: nouvelId(), nom, ordre, miseAJour: maintenant(), adresse };
  lire().championnats.push(c);
  return c;
}

export function championnat(id) {
  return lire().championnats.find((c) => c.id === id) ?? null;
}

/** Les compétitions dans l'ordre choisi, puis par nom. */
export function championnatsTries() {
  return [...lire().championnats].sort((a, b) => (a.ordre - b.ordre) || comparerNoms(a.nom, b.nom));
}

/** La compétition dont le nom est la catégorie d'un match (« R3 »), ou `null`. */
export function championnatNomme(nom) {
  const c = cle(nom);
  return championnatsTries().find((x) => cle(x.nom) === c) ?? null;
}

export function lignesDe(championnatId) {
  return lire().lignes.filter((l) => l.championnatId === championnatId);
}

/** Les équipes triées : points, différence de buts, buts marqués, puis nom. */
export function classementDe(championnatId) {
  return trierClassement(lignesDe(championnatId));
}

/** Pour `Equipes.ligne` et les cotes proposées : [{ championnat, lignes }], dans l'ordre. */
export function championnatsAvecLignes() {
  return championnatsTries().map((c) => ({ championnat: c, lignes: lignesDe(c.id) }));
}

export function creerLigne({ championnatId, equipe, gagnes = 0, nuls = 0, perdus = 0, forfaits = 0,
  butsPour = 0, butsContre = 0, penalites = 0, ajustement = 0, jouesSaisis = 0 }) {
  const l = {
    id: nouvelId(), championnatId, equipe, gagnes, nuls, perdus, forfaits,
    butsPour, butsContre, penalites, ajustement, jouesSaisis,
  };
  lire().lignes.push(l);
  return l;
}

export function supprimerLigne(ligneId) {
  const e = lire();
  e.lignes = e.lignes.filter((l) => l.id !== ligneId);
}

/** Une compétition, ses équipes et son calendrier. Les matchs des grilles restent. */
export function supprimerChampionnatDonnees(championnatId) {
  const e = lire();
  e.lignes = e.lignes.filter((l) => l.championnatId !== championnatId);
  e.calendrier = e.calendrier.filter((m) => m.championnatId !== championnatId);
  e.championnats = e.championnats.filter((c) => c.id !== championnatId);
}

// MARK: - Calendrier de la saison (MatchCalendrier.swift)

export function creerMatchCalendrier({ championnatId, numeroJournee, date = null, domicile, exterieur }) {
  const m = { id: nouvelId(), championnatId, numeroJournee, date, domicile, exterieur, ajoute: false };
  lire().calendrier.push(m);
  return m;
}

export function calendrierDe(championnatId) {
  return lire().calendrier.filter((m) => m.championnatId === championnatId);
}

export function intituleCalendrier(m) {
  return `${m.domicile} – ${m.exterieur}`;
}

// MARK: - Palmarès (Palmares.swift)

export function creerPalmares({ titre, date = maintenant(), noms, points }) {
  const p = { id: nouvelId(), titre, date, noms, points };
  lire().palmares.push(p);
  return p;
}

/** Le palmarès, le plus récent d'abord. */
export function palmaresTries() {
  return plusRecentsDabord(lire().palmares, (p) => p.date);
}

/** [{ nom, points }] */
export function podiumDu(p) {
  return p.noms.map((nom, i) => ({ nom, points: p.points[i] ?? 0 }));
}

// MARK: - Grilles reçues (GrilleRecue.swift)

export function creerGrilleRecue({ code, identifiant }) {
  const g = {
    id: nouvelId(), code, identifiant, dateReception: maintenant(),
    statut: 'aValider', dateTraitement: null, bilan: '',
  };
  lire().grillesRecues.push(g);
  return g;
}

export function grilleRecue(id) {
  return lire().grillesRecues.find((g) => g.id === id) ?? null;
}
