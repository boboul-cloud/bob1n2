// Les adresses de la version web (Site.swift). L'app et ses pages publiques vivent au même endroit :
// tout se déduit de l'adresse où l'app est ouverte, quel que soit l'hébergement.

/** Le dossier de l'app (« https://exemple.fr/bob1n2/ »). */
export function base() {
  return new URL('./', location.href.split('#')[0]).href;
}

export const Site = {
  get accueil() { return base(); },
  /** La page où le joueur coche sa grille, sans l'app (jeu à distance). */
  get jouer() { return new URL('jouer/', base()).href; },
  /** La page qui rend la grille jouée au bar. */
  get recu() { return new URL('recu/', base()).href; },
  get assistance() { return new URL('assistance.html', base()).href; },
  get confidentialite() { return new URL('confidentialite.html', base()).href; },
  get conditions() { return new URL('conditions.html', base()).href; },
  version: '1.0 (web)',
};

/** Le lien qui ouvre une grille jouée dans l'app : « …/#/grille/<code> ». */
export function lienGrilleRecue(code) {
  return `${base()}#/grille/${code}`;
}
