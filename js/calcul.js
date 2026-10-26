// Les formules du classeur : repris de Calcul.swift, Cotes.swift, Fidelite.swift et du
// classement des joueurs (Caisse.swift).

import { arrondi, cle, comparerNoms } from './format.js';

// MARK: - État d'un pronostic

export const ETATS_PRONOSTIC = {
  enAttente: { libelle: 'En attente', symbole: 'clock', couleur: 'secondaire' },
  gagne: { libelle: 'Gagné', symbole: 'checkmark.circle.fill', couleur: 'vert' },
  perdu: { libelle: 'Perdu', symbole: 'xmark.circle.fill', couleur: 'rouge' },
  annule: { libelle: 'Annulé', symbole: 'minus.circle', couleur: 'orange' },
};

// MARK: - Calcul

/** Combiné : produit des cotes. Système : toutes les combinaisons « k sur n », de MULTI-3 à GOLIATH-8. */
export const Calcul = {
  /** Le classeur MULTI allait de MULTI-3 à GOLIATH-8. */
  systemeMin: 3,
  systemeMax: 8,

  estTailleSysteme(n) {
    return n >= Calcul.systemeMin && n <= Calcul.systemeMax;
  },

  /** Nombre de combinaisons de k éléments parmi n. */
  combinaisons(n, k) {
    if (n < 0 || k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let resultat = 1;
    for (let i = 0; i < k; i++) resultat = (resultat * (n - i)) / (i + 1);
    return Math.round(resultat);
  },

  /** Les indices de chaque combinaison de `k` éléments parmi `n`, dans l'ordre. */
  sousEnsembles(n, k) {
    if (k <= 0 || k > n) return [];
    const resultat = [];
    const courant = [];
    const explorer = (debut) => {
      if (courant.length === k) {
        resultat.push([...courant]);
        return;
      }
      for (let i = debut; i < n && n - i >= k - courant.length; i++) {
        courant.push(i);
        explorer(i + 1);
        courant.pop();
      }
    };
    explorer(0);
    return resultat;
  },

  /** `niveaux === null` désigne un combiné : une seule combinaison, tous les matchs. */
  nombreDeCombinaisons(n, niveaux) {
    if (niveaux == null) return n > 0 ? 1 : 0;
    return [...new Set(niveaux)].reduce((somme, k) => somme + Calcul.combinaisons(n, k), 0);
  },

  /** Nom de la formule, repris des onglets du classeur MULTI. */
  nomSysteme(n, niveaux) {
    const tailles = [...new Set(niveaux)].sort((a, b) => a - b);
    const tous = Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 2);
    if (n >= 3 && tailles.length === tous.length && tailles.every((t, i) => t === tous[i])) {
      return n === 8 ? 'Goliath' : `Multi ${n}`;
    }
    return `Système ${tailles.join(', ')} sur ${n}`;
  },

  /**
   * `lignes` : [{ cote, etat }] ; `niveaux` : null pour un combiné.
   * Rend { combinaisons, coteTotale, gainMaximum, gainAcquis, termine, etat }.
   */
  evaluer(lignes, niveaux, miseUnitaire) {
    const combos = indices(lignes.length, niveaux);
    let coteTotale = 0;
    let maximum = 0;
    let acquis = 0;
    let termine = combos.length > 0;
    for (const combo of combos) {
      coteTotale += combo.reduce((p, i) => p * facteur(lignes[i]), 1);
      const b = bilan(combo, lignes);
      maximum += b.maximum;
      acquis += b.acquis;
      if (!b.decidee) termine = false;
    }
    const evaluation = {
      combinaisons: combos.length,
      coteTotale,
      gainMaximum: arrondi(maximum * miseUnitaire),
      gainAcquis: arrondi(acquis * miseUnitaire),
      termine,
    };
    evaluation.etat = termine
      ? (evaluation.gainAcquis > 0 ? 'gagne' : 'perdu')
      : (evaluation.gainMaximum > 0 ? 'enCours' : 'perdu');
    return evaluation;
  },

  /** Le détail par taille de combinaison, présenté comme dans les feuilles MULTI :
   *  [{ taille, combinaisons, gainMaximum, gainAcquis }]. */
  detail(lignes, niveaux, miseUnitaire) {
    return [...new Set(niveaux)].sort((a, b) => a - b).map((taille) => {
      const combos = Calcul.sousEnsembles(lignes.length, taille);
      if (combos.length === 0) return null;
      let maximum = 0;
      let acquis = 0;
      for (const combo of combos) {
        const b = bilan(combo, lignes);
        maximum += b.maximum;
        acquis += b.acquis;
      }
      return {
        taille,
        combinaisons: combos.length,
        gainMaximum: arrondi(maximum * miseUnitaire),
        gainAcquis: arrondi(acquis * miseUnitaire),
      };
    }).filter(Boolean);
  },
};

function indices(n, niveaux) {
  if (n <= 0) return [];
  if (niveaux == null) return [Array.from({ length: n }, (_, i) => i)];
  return [...new Set(niveaux)].sort((a, b) => a - b).flatMap((k) => Calcul.sousEnsembles(n, k));
}

/** Un match annulé compte pour 1, les autres pour leur cote. */
function facteur(ligne) {
  return ligne.etat === 'annule' ? 1 : ligne.cote;
}

function bilan(combo, lignes) {
  let produit = 1;
  let enAttente = false;
  for (const index of combo) {
    const ligne = lignes[index];
    switch (ligne.etat) {
      case 'perdu':
        return { maximum: 0, acquis: 0, decidee: true };
      case 'annule':
        break;
      case 'gagne':
        produit *= ligne.cote;
        break;
      default: // enAttente
        produit *= ligne.cote;
        enAttente = true;
    }
  }
  return { maximum: produit, acquis: enAttente ? 0 : produit, decidee: !enAttente };
}

// MARK: - Cotes proposées

/**
 * Proposition de cotes 1 / N / 2 d'après les classements, pour ne pas partir d'une page blanche.
 * La force d'une équipe est ses points par match et sa différence de buts par match, ramenées
 * vers la moyenne en début de saison. La marge du barman transforme les probabilités en cotes.
 */
export const Cotes = {
  moyenne: 1.35,
  lissage: 3.0,
  avantageTerrain: 0.25,
  coteMinimum: 1.1,
  coteMaximum: 10.0,

  /** `ligne` : une ligne de classement (voir modele.js : pointsLigne, jouesLigne, differenceLigne). */
  force(ligne) {
    const matchs = jouesLigne(ligne) + Cotes.lissage;
    return {
      pointsParMatch: (pointsLigne(ligne) + Cotes.moyenne * Cotes.lissage) / matchs,
      differenceParMatch: differenceLigne(ligne) / matchs,
    };
  },

  /** Probabilités de victoire à domicile, de nul et de victoire à l'extérieur.
   *  Une équipe absente des classements compte pour une équipe moyenne. */
  probabilites(domicile, exterieur) {
    const neutre = { pointsParMatch: Cotes.moyenne, differenceParMatch: 0 };
    const a = domicile ?? neutre;
    const b = exterieur ?? neutre;
    const ecart = (a.pointsParMatch - b.pointsParMatch) + 0.15 * (a.differenceParMatch - b.differenceParMatch)
      + Cotes.avantageTerrain;
    const attendu = 1 / (1 + Math.pow(10, -ecart * 0.4));
    const nul = 0.12 + 0.16 * (1 - Math.abs(2 * attendu - 1));
    const un = Math.max(attendu - nul / 2, 0.07);
    const deux = Math.max(1 - attendu - nul / 2, 0.07);
    const total = un + nul + deux;
    return { un: un / total, nul: nul / total, deux: deux / total };
  },

  proposer(domicile, exterieur, marge) {
    const p = Cotes.probabilites(domicile, exterieur);
    const f = 1 + Math.max(0, marge);
    return {
      un: Cotes.arrondir(1 / (p.un * f)),
      nul: Cotes.arrondir(1 / (p.nul * f)),
      deux: Cotes.arrondir(1 / (p.deux * f)),
    };
  },

  /** Au dixième, comme les cotes du classeur, entre 1,10 et 10. */
  arrondir(cote) {
    return Math.min(Math.max(Math.round(cote * 10) / 10, Cotes.coteMinimum), Cotes.coteMaximum);
  },

  /** Marge contenue dans trois cotes : 1/c1 + 1/cN + 1/c2 − 1. */
  marge(un, nul, deux) {
    if (!(un > 0 && nul > 0 && deux > 0)) return 0;
    return 1 / un + 1 / nul + 1 / deux - 1;
  },
};

// MARK: - Lignes de classement (LigneClassement.swift)

/** Barème du football amateur : victoire 3, nul 1, défaite 0, forfait −1. */
export function pointsLigne(l) {
  return l.gagnes * 3 + l.nuls - l.forfaits - l.penalites + (l.ajustement ?? 0);
}

/** Matchs joués, lus sur le site quand le tableau collé ne détaille pas G / N / P. */
export function jouesLigne(l) {
  return Math.max(l.gagnes + l.nuls + l.perdus, l.jouesSaisis ?? 0);
}

export function differenceLigne(l) {
  return l.butsPour - l.butsContre;
}

function triplet(l) {
  return [pointsLigne(l), differenceLigne(l), l.butsPour];
}

export function devance(a, b) {
  const x = triplet(a);
  const y = triplet(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}

export function aLeMemeRang(a, b) {
  const x = triplet(a);
  const y = triplet(b);
  return x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
}

/** Tri du classement : points, puis différence de buts, puis buts marqués, enfin le nom. */
export function trierClassement(lignes) {
  return [...lignes].sort((a, b) => {
    if (!aLeMemeRang(a, b)) return devance(a, b) ? -1 : 1;
    return comparerNoms(a.equipe, b.equipe);
  });
}

/** Le rang de chaque ligne d'un classement trié : ex æquo seulement à égalité des trois (1, 2, 2, 4…). */
export function rangsClassement(classement) {
  const rangs = [];
  classement.forEach((ligne, index) => {
    rangs.push(index > 0 && aLeMemeRang(ligne, classement[index - 1]) ? rangs[index - 1] : index + 1);
  });
  return rangs;
}

// MARK: - Équipes

/** Retrouver une équipe d'un tableau à l'autre : la grille écrit « PLOUVIEN », le classement « AS PLOUVIEN ». */
export const Equipes = {
  meme(a, b) {
    const x = cle(a);
    const y = cle(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [court, long] = x.length <= y.length ? [x, y] : [y, x];
    if (court.length < 4) return false;
    return long.split(' ').includes(court)
      || long.startsWith(court + ' ') || long.endsWith(' ' + court) || long.includes(' ' + court + ' ')
      || (court.includes(' ') && long.includes(court));
  },

  /**
   * La ligne de classement d'une équipe, en cherchant d'abord dans le championnat dont le nom est
   * la catégorie du match (« R3 - A »). `championnats` : [{ championnat, lignes }].
   */
  ligne(equipe, categorie, championnats) {
    const prioritaires = championnats.filter((c) => categorie && cle(c.championnat.nom) === cle(categorie));
    for (const c of [...prioritaires, ...championnats]) {
      const exacte = c.lignes.find((l) => cle(l.equipe) === cle(equipe));
      if (exacte) return exacte;
      const proche = c.lignes.find((l) => Equipes.meme(l.equipe, equipe));
      if (proche) return proche;
    }
    return null;
  },
};

// MARK: - Points de fidélité

/** Au prorata (12,50 € à 1 pt l'euro → 12,5 pts), ou par tranche entière : seules les tranches
 *  franchies comptent, en tenant compte de ce que le joueur avait déjà dépensé. */
export function pointsDeFidelite(montant, dejaDepense, depense, points, parTranche) {
  if (!(montant > 0 && depense > 0 && points > 0)) return 0;
  if (!parTranche) return arrondi(montant / depense * points);
  const avant = Math.floor(Math.max(0, dejaDepense) / depense + 1e-9);
  const apres = Math.floor((Math.max(0, dejaDepense) + montant) / depense + 1e-9);
  return arrondi((apres - avant) * points);
}

// MARK: - Classement du concours

/** Joueurs triés par points, puis par nom. `nomComplet` : fonction qui donne le nom d'un joueur. */
export function trierJoueurs(joueurs, nomComplet) {
  return [...joueurs].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    return comparerNoms(nomComplet(a), nomComplet(b));
  });
}

/** Rangs avec ex æquo : 1, 2, 2, 4… */
export function rangsPoints(points) {
  const rangs = [];
  points.forEach((valeur, index) => {
    rangs.push(index > 0 && points[index - 1] === valeur ? rangs[index - 1] : index + 1);
  });
  return rangs;
}
