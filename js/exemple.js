// Les données des classeurs d'origine, pour démarrer sans rien saisir : la grille de « FEUILLE DE
// SAISIE MATCH » (Saisie.xlsm) et un classement de R3 inventé. Repris de Exemple.swift.

import { cle } from './format.js';
import { lire } from './store.js';
import * as M from './modele.js';

const GRILLE = [
  ['R3', 'CARENTEC', 'LANDERNEAU', 3.9, 2.7, 1.9],
  ['R3', 'GUICLAN', 'PLOUGERNEAU', 2.8, 2.2, 1.3],
  ['R3', 'LESNEVEN', 'PLOUDANIEL', 2.9, 2.3, 1.8],
  ['R3', 'PLOUVORN', 'LE FOLGOET', 1.5, 1.6, 2.1],
  ['R3', 'ESPK', 'PLOUVIEN', 1.7, 2.0, 2.4],
  ['R3', 'CLEDER', 'SANTEC', 1.4, 2.0, 2.7],
  ['D3', 'PLOUGUIN', 'MAHOR B', 1.2, 2.3, 2.8],
  ['D3', 'LANRIVOARE B', 'LEGION B', 2.8, 2.0, 1.5],
  ['D3', 'ARZELIZ B', 'ESPK B', 1.9, 1.8, 2.1],
  ['D3', 'MANCHE ETLAN', 'PLOUZANE D', 2.2, 2.0, 1.8],
  ['D3', 'PLOURIN', 'LAMPAUL FC', 2.8, 2.2, 1.7],
  ['D3', 'PLOUARZEL B', 'PL BERGOT B', 2.6, 2.0, 1.4],
  ['R1', 'CLEDER', 'BOURG BLANC', 1.5, 1.9, 1.8],
  ['R1', 'MILIZAC', 'LESNEVEN', 1.6, 2.1, 2.6],
  ['R1', 'ASB', 'BODILIS', 1.4, 1.8, 2.1],
  ['R1', 'BOHARS', 'PLOUZANE B', 1.9, 2.1, 1.5],
  ['R1', 'GUIPAVAS B', 'PLOUVORN', 1.9, 2.1, 1.5],
  ['R1', 'PLOUDANIEL', 'LANDI FC', 2.6, 2.0, 1.7],
];

/** Equipe, G, N, P, F, Bp, Bc, Pe : chiffres inventés mais cohérents (11 matchs chacun). */
const CLASSEMENT_R3 = [
  ['LE FOLGOET', 8, 2, 1, 0, 24, 11, 0],
  ['SANTEC', 6, 3, 2, 0, 21, 10, 0],
  ['PORTSALL KERSAINT', 5, 3, 3, 0, 17, 15, 0],
  ['CLEDER', 5, 3, 3, 0, 19, 12, 0],
  ['PLOUGUERNEAU', 5, 2, 4, 0, 18, 14, 0],
  ['LANDERNEAU FC (B)', 5, 2, 4, 0, 20, 18, 0],
  ['LESNEVEN (B)', 4, 4, 3, 0, 15, 14, 0],
  ['PLOUVIEN', 4, 2, 5, 0, 13, 16, 0],
  ['PLOUVORN (B)', 3, 3, 5, 0, 12, 17, 0],
  ['GUICLAN FC', 2, 4, 5, 0, 11, 17, 0],
  ['PLOUDANIEL', 2, 2, 7, 0, 10, 21, 0],
  ['CARANTEC HENVIC', 1, 2, 8, 0, 8, 23, 0],
];

export const TITRE_GRILLE = 'Grille du classeur';

/** L'exemple complet, la grille et la R3, sans doublon. Rend { journee, championnat } : ce qui a
 *  été ajouté. À appeler dans `modifier`. */
export function charger() {
  const e = lire();
  const journee = !e.journees.some((j) => cle(j.titre) === cle(TITRE_GRILLE));
  const championnat = !e.championnats.some((c) => cle(c.nom) === 'r3');
  if (journee) chargerJournee();
  if (championnat) chargerChampionnat();
  return { journee, championnat };
}

export function chargerJournee(titre = TITRE_GRILLE, date = new Date().toISOString()) {
  const journee = M.creerJournee({ titre, date });
  GRILLE.forEach(([categorie, domicile, exterieur, cote1, coteN, cote2], index) => {
    M.creerRencontre({ journeeId: journee.id, ordre: index + 1, categorie, domicile, exterieur, cote1, coteN, cote2 });
  });
  return journee;
}

export function chargerChampionnat(ordre = 0) {
  const championnat = M.creerChampionnat({ nom: 'R3', ordre });
  for (const [equipe, gagnes, nuls, perdus, forfaits, butsPour, butsContre, penalites] of CLASSEMENT_R3) {
    M.creerLigne({ championnatId: championnat.id, equipe, gagnes, nuls, perdus, forfaits, butsPour, butsContre, penalites });
  }
  return championnat;
}
