// Jeu de démonstration (DemoData.swift) : ouvert avec `?demo` dans l'adresse, l'app travaille sur une
// base en mémoire ; ni les vrais joueurs ni les vrais réglages ne sont lus ou modifiés. Les prénoms
// sont inventés ; les numéros sont réservés à la fiction par l'ARCEP (06 39 98…).

import { activerDemo, lire } from './store.js';
import * as M from './modele.js';
import * as Caisse from './caisse.js';
import * as Exemple from './exemple.js';
import { marquerComptes } from './grille.js';
import { trierClassement } from './calcul.js';

const EQUIPE = [
  ['Camille', 'Le Gall'], ['Hugo', 'Madec'], ['Inès', 'Morvan'],
  ['Karim', 'Tanguy'], ['Léa', 'Guivarch'], ['Noah', 'Le Bris'],
  ['Zoé', 'Abgrall'], ['Yann', 'Quéré'], ['Maëlle', 'Floch'],
];

const JOUR = 86_400_000;
const ilYa = (jours) => new Date(Date.now() - jours * JOUR).toISOString();

export function ouvrirDemo() {
  activerDemo((etat) => {
    etat.reglages.titreJeu = 'Pronos du Comptoir';
    remplir();
  });
}

function remplir() {
  // Concours précédent, pour le palmarès.
  M.creerPalmares({
    titre: "Concours d'août", date: ilYa(27),
    noms: ['Yann QUÉRÉ', 'Inès MORVAN', 'Hugo MADEC'], points: [184.6, 131.2, 96],
  });

  const joueurs = EQUIPE.map(([prenom, nom]) => Caisse.nouveauJoueur({ nom, prenom, points: 20 }));
  joueurs.forEach((j, i) => {
    if (i !== 4) j.telephone = `06 39 98 00 ${String(i + 1).padStart(2, '0')}`;
  });
  Caisse.recharger(joueurs[2], 20);
  Caisse.recharger(joueurs[7], 40);

  const jouer = (joueur, journee, choix, { formule = 'combine', niveaux = [], mise }) => {
    const liste = M.matchs(journee.id);
    try {
      Caisse.placerPari({
        joueur, journee, formule, niveaux, miseUnitaire: mise,
        choix: choix.map(([i, issue]) => ({ rencontre: liste[i], issue })),
      });
    } catch { /* comme le try? du Swift */ }
  };

  // Journée passée, entièrement réglée.
  const passee = Exemple.chargerJournee('Journée 5', ilYa(7));
  jouer(joueurs[0], passee, [[0, '2'], [1, '2'], [3, '1']], { mise: 5 });
  jouer(joueurs[1], passee, [[5, '1'], [6, '1']], { mise: 8 });
  jouer(joueurs[2], passee, [[0, '2'], [3, '1'], [5, '1'], [6, '1']], { formule: 'systeme', niveaux: [2, 3, 4], mise: 1 });
  jouer(joueurs[7], passee, [[1, '2'], [6, '1'], [12, '1']], { mise: 10 });
  jouer(joueurs[4], passee, [[2, '1']], { mise: 4 });
  const resultats = ['2', '2', 'N', '1', '1', '1', '1', '2', 'N', '1', '2', '2', '1', 'N', '1', '2', '1', 'N'];
  M.matchs(passee.id).forEach((m, i) => { m.resultat = resultats[i]; });
  passee.statut = 'fermee';
  Caisse.reglerTout(passee);

  // Journée en cours : paris ouverts, quelques résultats déjà connus.
  const enCours = Exemple.chargerJournee('Journée 6', new Date().toISOString());
  enCours.reference = 'demo06';
  M.matchs(enCours.id).forEach((m, i) => { m.reference = `d${String(i + 1).padStart(2, '0')}`; });
  jouer(joueurs[0], enCours, [[0, '2'], [2, '2'], [4, '1'], [5, '1']], { mise: 5 });
  jouer(joueurs[2], enCours, [[1, '2'], [3, '1'], [6, '1'], [7, '2'], [12, '1']], { formule: 'systeme', niveaux: [2, 3, 4, 5], mise: 1 });
  jouer(joueurs[3], enCours, [[3, '1'], [5, '1']], { mise: 6 });
  jouer(joueurs[5], enCours, [[8, 'N'], [9, '1'], [10, '2']], { mise: 4 });
  jouer(joueurs[7], enCours, [[0, '1'], [1, '2'], [3, 'N'], [6, '1'], [12, '1'], [13, '1']], { formule: 'systeme', niveaux: [2, 3, 4, 5, 6], mise: 1 });
  jouer(joueurs[8], enCours, [[6, '1'], [14, '1']], { mise: 10 });
  const matchs = M.matchs(enCours.id);
  matchs[3].resultat = '1';
  matchs[5].resultat = '1';
  matchs[6].resultat = '1';

  // Consommations payées au comptoir : 1 point par euro.
  for (const [i, montant] of [[0, 7.5], [0, 4.0], [3, 12.0], [5, 6.5], [8, 9.0]]) {
    Caisse.enregistrerAchat(joueurs[i], montant, montant);
  }

  const r3 = Exemple.chargerChampionnat();
  ajouterCalendrier(r3);
  // Le classement d'exemple tient déjà compte des résultats de démonstration.
  marquerComptes(lire().rencontres);
}

/** Un calendrier aller fictif pour la R3 d'exemple (méthode du cercle), une journée par semaine :
 *  celle de la semaine est la 6e. Les journées passées sont marquées mises en grille. */
function ajouterCalendrier(competition) {
  const equipes = trierClassement(M.lignesDe(competition.id)).map((l) => l.equipe);
  if (equipes.length < 4 || equipes.length % 2) return;
  let tournantes = equipes.slice(1);
  for (let numero = 1; numero < equipes.length; numero++) {
    const date = new Date(Date.now() + (numero - 6) * 7 * JOUR).toISOString();
    const ordre = [equipes[0], ...tournantes];
    for (let i = 0; i < equipes.length / 2; i++) {
      const [a, b] = [ordre[i], ordre[equipes.length - 1 - i]];
      const [domicile, exterieur] = (numero + i) % 2 === 0 ? [a, b] : [b, a];
      const m = M.creerMatchCalendrier({ championnatId: competition.id, numeroJournee: numero, date, domicile, exterieur });
      m.ajoute = numero < 6;
    }
    tournantes = [tournantes[tournantes.length - 1], ...tournantes.slice(0, -1)];
  }
}
