// Les réglages du jeu et ce qu'on en déduit : repris de Reglages.swift. Ils sont gardés dans la
// base (`etat.reglages`) ; on les change avec `modifier(e => { e.reglages.… = … })`.

import { lire } from './store.js';
import { pointsDeFidelite } from './calcul.js';
import { arrondi, enEuros, enPoints } from './format.js';

export function reglages() {
  return lire().reglages;
}

/** Points que rapporte un achat, compte tenu de ce que le joueur a déjà dépensé. */
export function pointsFidelite(montant, dejaDepense = 0) {
  const r = reglages();
  if (!r.fideliteActive) return 0;
  return pointsDeFidelite(montant, dejaDepense, r.fideliteDepense, r.fidelitePoints, r.fideliteParTranche);
}

/** « 1 pt pour 1 € dépensé », « 5 pts par tranche de 10 € ». */
export function regleFidelite() {
  const r = reglages();
  const euros = enEuros(r.fideliteDepense);
  return r.fideliteParTranche
    ? `${enPoints(r.fidelitePoints)} par tranche de ${euros}`
    : `${enPoints(r.fidelitePoints)} pour ${euros} dépensé${r.fideliteDepense < 2 ? '' : 's'}`;
}

export function codeActif() {
  return reglages().codeBarman !== '';
}

/** Le titre du jeu, ou « Bob 1N2 ». */
export function titreAffiche() {
  const titre = reglages().titreJeu.trim();
  return titre || 'Bob 1N2';
}

/** Valeur en euros des consommations qu'un solde permet d'offrir (au centime inférieur). */
export function aOffrir(points) {
  const r = reglages();
  if (!(r.pointsParEuro > 0 && points > 0)) return 0;
  return Math.floor(points / r.pointsParEuro * 100) / 100;
}

/** Points débités pour une consommation offerte de ce prix. */
export function coutConsommation(prix) {
  return arrondi(Math.max(0, prix) * reglages().pointsParEuro);
}

/** Une adresse saisie à la main, complétée au besoin de « https:// » ; `null` si ce n'en est pas une. */
export function urlWeb(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return null;
  const complet = brut.includes('://') ? brut : `https://${brut}`;
  try {
    const url = new URL(complet);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) return null;
    // « pas une adresse » : le navigateur l'encode (« pas%20une%20adresse ») au lieu de la refuser.
    if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** « exemple.fr/competitions/d3-b » : l'adresse sans le protocole, pour l'affichage. */
export function urlCourte(texte) {
  const href = urlWeb(texte);
  if (!href) return texte;
  const url = new URL(href);
  return url.hostname + (url.pathname === '/' ? '' : url.pathname);
}

export function urlSiteResultats() {
  return urlWeb(reglages().siteResultats);
}
