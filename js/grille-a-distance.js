// Le jeu à distance, sans serveur ni compte : repris de GrilleADistance.swift.
//
// ① La grille part dans un lien vers la page `jouer/` du site : le joueur y coche ses pronostics
// sur son téléphone, sans l'app. ② Sa grille jouée revient dans un lien vers la page `recu/`, qui
// la rouvre dans l'app (`…/#/grille/<code>`) ; on peut aussi coller le lien dans « Grilles reçues ».
// ③ Le barman choisit le joueur, corrige la mise s'il le faut et valide avec le code barman.
//
// Tout voyage après le « # » des adresses, que le navigateur ne transmet pas au site.
// Un code est du JSON en base64 URL, compressé (DEFLATE brut) et préfixé « z », ou tel quel et
// préfixé « j ». La page web (`partage/grille.js`) et l'app iOS lisent et écrivent le même format.
//
// Tout est synchrone, comme dans le Swift : la compression et la décompression DEFLATE sont faites
// ici même (plus bas), sans CompressionStream, pour que `recevoir` s'appelle dans `modifier` et
// qu'une grille reçue se relise à chaque affichage.
//
// Les fonctions qui écrivent (`attribuerReferences`, `lien`, `grille`, `recevoir`, `valider`,
// `refuser`) s'appellent dans `modifier(() => …)`.

import { lire as lireEtat } from './store.js';
import * as M from './modele.js';
import * as Caisse from './caisse.js';
import { Calcul } from './calcul.js';
import { arrondi, cle, enPoints, numeroSMS, versChampDate } from './format.js';
import { Site } from './site.js';

export const VERSION = 1;

// MARK: - Erreurs

/** Une erreur du jeu à distance : `code` « illisible », « lienAJouer », « versionInconnue » ou « bloquee ». */
export class ErreurDistance extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurDistance';
    this.code = code;
  }
}

export const Erreur = {
  illisible: () => new ErreurDistance('illisible',
    'Aucune grille jouée dans ce texte. Collez le lien envoyé par le joueur, en entier.'),
  lienAJouer: () => new ErreurDistance('lienAJouer',
    "C'est le lien de la grille à jouer, celui que vous envoyez aux joueurs, pas une grille jouée."),
  // L'app web se met à jour en se rechargeant (« mettez l'app à jour » dans le Swift).
  versionInconnue: () => new ErreurDistance('versionInconnue',
    "Cette grille vient d'une version plus récente de la page : rechargez l'app pour la mettre à jour."),
  bloquee: (raison) => new ErreurDistance('bloquee', raison),
};

// MARK: - Formats
//
// Les clés courtes du JSON (CodingKeys du Swift) ; l'app manipule les noms longs.
//
// Grille (ce qui part) : { version, titreJeu, journee (référence), titre, date « 2026-10-03 »,
//   mise, groupes: [{ categorie, matchs: [{ reference, domicile, exterieur, cotes: [1, N, 2 en centièmes] }] }],
//   telephone (facultatif : le téléphone du bar, où la page adresse le retour) }
// Jouee (ce qui revient) : { version, journee, titre, identifiant (tiré par la page à chaque envoi),
//   nom, numero (facultatif), formule « c » / « s », niveaux (facultatif), mise (par combinaison
//   en système), choix: [{ match (référence), issue « 1 » / « N » / « 2 », cote (vue, en centièmes) }] }
// Invite (ajoutée au lien d'un joueur après un « . ») : { nom, numero }

const estEntier = (x) => Number.isInteger(x);
const estTexte = (x) => typeof x === 'string';
const absent = (x) => x === undefined || x === null;
const estObjet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Lève « illisible » si la condition n'est pas remplie (le JSONDecoder du Swift échoue de même). */
function exiger(condition) {
  if (!condition) throw Erreur.illisible();
}

export const FORMATS = {
  grille: {
    versJSON(g) {
      const json = {
        v: g.version ?? VERSION, t: g.titreJeu, j: g.journee, n: g.titre, d: g.date, m: g.mise,
        g: g.groupes.map((groupe) => ({
          c: groupe.categorie,
          r: groupe.matchs.map((m) => ({ k: m.reference, d: m.domicile, e: m.exterieur, c: m.cotes })),
        })),
      };
      if (!absent(g.telephone)) json.tel = g.telephone;
      return json;
    },
    depuisJSON(o) {
      exiger(estObjet(o) && estEntier(o.v) && estTexte(o.t) && estTexte(o.j) && estTexte(o.n)
        && estTexte(o.d) && estEntier(o.m) && Array.isArray(o.g) && (absent(o.tel) || estTexte(o.tel)));
      return {
        version: o.v, titreJeu: o.t, journee: o.j, titre: o.n, date: o.d, mise: o.m,
        groupes: o.g.map((groupe) => {
          exiger(estObjet(groupe) && estTexte(groupe.c) && Array.isArray(groupe.r));
          return {
            categorie: groupe.c,
            matchs: groupe.r.map((m) => {
              exiger(estObjet(m) && estTexte(m.k) && estTexte(m.d) && estTexte(m.e)
                && Array.isArray(m.c) && m.c.every(estEntier));
              return { reference: m.k, domicile: m.d, exterieur: m.e, cotes: [...m.c] };
            }),
          };
        }),
        telephone: absent(o.tel) ? null : o.tel,
      };
    },
  },
  jouee: {
    versJSON(j) {
      const json = { v: j.version ?? VERSION, j: j.journee, n: j.titre, u: j.identifiant, p: j.nom };
      if (!absent(j.numero)) json.no = j.numero;
      json.f = j.formule;
      if (!absent(j.niveaux)) json.k = j.niveaux;
      json.m = j.mise;
      json.c = j.choix.map((c) => ({ k: c.match, i: c.issue, c: c.cote }));
      return json;
    },
    depuisJSON(o) {
      exiger(estObjet(o) && estEntier(o.v) && estTexte(o.j) && estTexte(o.n) && estTexte(o.u)
        && estTexte(o.p) && (absent(o.no) || estEntier(o.no)) && estTexte(o.f)
        && (absent(o.k) || (Array.isArray(o.k) && o.k.every(estEntier))) && estEntier(o.m) && Array.isArray(o.c));
      return {
        version: o.v, journee: o.j, titre: o.n, identifiant: o.u, nom: o.p,
        numero: absent(o.no) ? null : o.no, formule: o.f, niveaux: absent(o.k) ? null : [...o.k], mise: o.m,
        choix: o.c.map((c) => {
          exiger(estObjet(c) && estTexte(c.k) && estTexte(c.i) && estEntier(c.c));
          return { match: c.k, issue: c.i, cote: c.c };
        }),
      };
    },
  },
  invite: {
    versJSON(i) {
      return { p: i.nom, no: i.numero };
    },
    depuisJSON(o) {
      exiger(estObjet(o) && estTexte(o.p) && estEntier(o.no));
      return { nom: o.p, numero: o.no };
    },
  },
};

// MARK: - Envoi

/** Le lien à envoyer aux joueurs pour cette journée (objet ou id), avec le téléphone du bar s'il est
 *  réglé. Donne leur référence à la journée et aux matchs qui n'en ont pas : dans `modifier`. */
export function lien(journee, { titreJeu, mise, telephone = null }) {
  let code = '';
  try {
    code = coder(grille(journee, { titreJeu, mise, telephone }), 'grille');
  } catch { /* lien sans grille, comme le `?? ""` du Swift */ }
  return `${Site.jouer}#${code}`;
}

/** Le lien d'un joueur : celui de la grille, suivi de « . » et de son nom et numéro. Sa grille jouée
 *  revient avec son numéro : l'app le reconnaît à coup sûr. */
export function lienPour(lienGrille, joueur) {
  const nom = [joueur.prenom, joueur.nom].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  try {
    return `${lienGrille}.${coder({ nom, numero: joueur.numero }, 'invite')}`;
  } catch {
    return lienGrille;
  }
}

/** Le texte qui accompagne le lien. Un message groupé demande une réponse en privé,
 *  pour que les grilles n'arrivent pas à tout le groupe. */
export function message({ titreJeu, journee, lien: adresse = null, prenom = null, groupe = false }) {
  const p = (prenom ?? '').trim();
  const bonjour = p ? `Bonjour ${p} ! ` : '';
  const reponse = groupe ? 'renvoyez-moi votre grille en message privé' : 'renvoyez-moi votre grille';
  const texte = `${bonjour}La grille « ${journee} » de ${titreJeu} est ouverte : touchez le lien, cochez vos pronostics et ${reponse}.`;
  return adresse ? `${texte}\n\n${adresse}` : texte;
}

/** La grille envoyée : les matchs sans résultat, groupés comme dans l'app.
 *  Donne d'abord leur référence à la journée et aux matchs qui n'en ont pas. */
export function grille(journee, { titreJeu, mise, telephone = null }) {
  const j = journeeDe(journee);
  attribuerReferences(j);
  const groupes = M.groupes(j.id).map((groupe) => {
    const matchs = groupe.rencontres.filter((r) => r.resultat == null).map((r) => ({
      reference: r.reference, domicile: M.nomDomicile(r), exterieur: M.nomExterieur(r),
      cotes: [r.cote1, r.coteN, r.cote2].map(centiemes),
    }));
    return matchs.length ? { categorie: groupe.titre, matchs } : null;
  }).filter(Boolean);
  return {
    version: VERSION, titreJeu, journee: j.reference, titre: j.titre, date: versChampDate(j.date),
    mise: Math.max(1, Math.round(mise)), groupes, telephone: numeroSMS(telephone),
  };
}

/** Une référence à la journée (6 signes) et à chacun de ses matchs (3 signes) : un second envoi garde
 *  les mêmes, et les grilles déjà jouées restent valables. */
export function attribuerReferences(journee) {
  const j = journeeDe(journee);
  if (!j.reference) j.reference = tirage(6);
  const matchs = M.matchs(j.id);
  const prises = new Set(matchs.map((r) => r.reference).filter(Boolean));
  for (const r of matchs) {
    if (r.reference) continue;
    let reference;
    do { reference = tirage(3); } while (prises.has(reference));
    prises.add(reference);
    r.reference = reference;
  }
}

/** Faut-il encore donner des références à cette journée ? (sans rien changer) */
export function manqueReferences(journee) {
  const j = journeeDe(journee);
  return !j.reference || M.matchs(j.id).some((r) => !r.reference);
}

// MARK: - Réception

/**
 * Range une grille jouée dans « Grilles reçues » (dans `modifier`). Reçue une seconde fois, elle
 * n'est pas doublée. Rend `{ grille, dejaRecue }` ; lève une `ErreurDistance` si le texte n'en
 * contient pas.
 */
export function recevoir(texte) {
  const { code, jouee } = lire(texte);
  const identifiant = jouee.identifiant;
  const dejaLa = lireEtat().grillesRecues.find((g) => g.identifiant === identifiant);
  if (identifiant !== '' && dejaLa) return { grille: dejaLa, dejaRecue: true };
  const grilleRecue = M.creerGrilleRecue({ code, identifiant });
  return { grille: grilleRecue, dejaRecue: false };
}

const A_RETIRER = new Set('<>"\'()[]{}.,;:!?«»');

function rogner(texte) {
  let debut = 0;
  let fin = texte.length;
  while (debut < fin && A_RETIRER.has(texte[debut])) debut++;
  while (fin > debut && A_RETIRER.has(texte[fin - 1])) fin--;
  return texte.slice(debut, fin);
}

/** Le code d'une grille jouée dans ce qu'on a reçu : le lien de la page `recu/`, celui de l'app
 *  (`…/#/grille/<code>`, ou `bob1n2://grille#…` de l'app iOS), le code seul, ou un message qui
 *  contient l'un d'eux. Rend `{ code, jouee }`. */
export function lire(texte) {
  let lienAJouer = false;
  for (const mot of String(texte ?? '').split(/\s+/)) {
    const morceaux = mot.split('#');
    const apresDiese = morceaux[morceaux.length - 1];
    let code = rogner(apresDiese);
    // « …/#/grille/<code> » : le code est le dernier morceau du chemin.
    if (code.includes('/')) code = rogner(code.slice(code.lastIndexOf('/') + 1));
    if (!(code.length > 8 && code.length < 20_000)) continue;
    let jouee = null;
    try { jouee = decoder(code, 'jouee'); } catch { jouee = null; }
    if (jouee) {
      if (jouee.version > VERSION) throw Erreur.versionInconnue();
      return { code, jouee };
    }
    const grilleSeule = code.split('.').find(Boolean) ?? code;
    try {
      decoder(grilleSeule, 'grille');
      lienAJouer = true;
    } catch { /* ni l'un ni l'autre */ }
  }
  throw lienAJouer ? Erreur.lienAJouer() : Erreur.illisible();
}

const cacheContenus = new Map();

/** Le contenu d'une grille reçue (GrilleRecue.contenu), relu à chaque affichage ; `null` si illisible. */
export function contenu(grilleRecue) {
  const code = grilleRecue?.code ?? '';
  if (cacheContenus.has(code)) return cacheContenus.get(code);
  let jouee = null;
  try { jouee = decoder(code, 'jouee'); } catch { jouee = null; }
  if (cacheContenus.size > 500) cacheContenus.clear();
  cacheContenus.set(code, jouee);
  return jouee;
}

// MARK: - Analyse

/** Un match choisi par le joueur. Le pari prend la cote du moment de la validation. */
class Choix {
  constructor(rencontre, issue, coteVue) {
    this.rencontre = rencontre;
    this.issue = issue;
    /** Cote vue par le joueur. */
    this.coteVue = coteVue;
  }

  get cote() { return M.cote(this.rencontre, this.issue); }

  get coteChangee() { return Math.abs(this.cote - this.coteVue) > 0.004; }
}

/** Ce que devient la grille reçue dans la journée telle qu'elle est maintenant. */
export class Analyse {
  constructor({ journee, formule, niveaux, mise }) {
    this.journee = journee;
    /** [Choix], dans l'ordre de la grille. */
    this.choix = [];
    /** Matchs choisis qui ne sont plus dans la journée. */
    this.introuvables = 0;
    /** « combine » ou « systeme ». */
    this.formule = formule;
    this.niveaux = niveaux;
    this.mise = mise;
  }

  get dejaJoues() { return this.choix.map((c) => c.rencontre).filter((r) => r.resultat != null); }

  get cotesChangees() { return this.choix.filter((c) => c.coteChangee); }

  get niveauxRetenus() {
    if (this.formule !== 'systeme') return null;
    return [...new Set(this.niveaux)].filter((k) => k >= 2 && k <= this.choix.length).sort((a, b) => a - b);
  }

  /** Ce qui empêche de valider, dit au barman. */
  get blocage() {
    const journee = this.journee;
    if (!journee) return "Cette journée n'est pas dans cette app.";
    if (journee.statut !== 'ouverte') return `Les paris de « ${journee.titre} » sont fermés.`;
    if (this.introuvables > 0) {
      const matchs = this.introuvables > 1
        ? `${this.introuvables} matchs de cette grille ne sont`
        : "Un match de cette grille n'est";
      return `${matchs} plus dans la journée : demandez au joueur de rejouer.`;
    }
    const joue = this.dejaJoues[0];
    if (joue) return `Le match ${M.intitule(joue)} a déjà un résultat.`;
    if (!this.choix.length) return 'Cette grille ne contient aucun match.';
    return null;
  }

  evaluation(mise) {
    const lignes = this.choix.map((c) => ({ cote: c.cote, etat: 'enAttente' }));
    return Calcul.evaluer(lignes, this.niveauxRetenus, mise);
  }

  miseTotale(mise) {
    return arrondi(mise * Calcul.nombreDeCombinaisons(this.choix.length, this.niveauxRetenus));
  }

  /** « Combiné · 4 matchs », « Multi 5 · 26 combinaisons ». */
  get descriptionFormule() {
    const n = this.choix.length;
    const niveaux = this.niveauxRetenus;
    if (niveaux == null) return n > 1 ? `Combiné · ${n} matchs` : 'Simple · 1 match';
    const combinaisons = Calcul.nombreDeCombinaisons(n, niveaux);
    return `${Calcul.nomSysteme(n, niveaux)} · ${combinaisons} combinaisons`;
  }
}

/** `journees` : celles de l'app, la plus récente d'abord (par défaut toutes). */
export function analyser(jouee, journees = M.journeesTriees()) {
  const journee = journees.find((j) => j.reference && j.reference === jouee.journee) ?? null;
  const analyse = new Analyse({
    journee, formule: jouee.formule === 's' ? 'systeme' : 'combine',
    niveaux: jouee.niveaux ?? [], mise: Math.max(1, jouee.mise),
  });
  if (!journee) {
    analyse.introuvables = jouee.choix.length;
    return analyse;
  }
  const parReference = new Map();
  for (const r of M.matchs(journee.id)) {
    if (r.reference && !parReference.has(r.reference)) parReference.set(r.reference, r);
  }
  const vus = new Set();
  for (const choix of jouee.choix) {
    if (vus.has(choix.match)) continue;
    vus.add(choix.match);
    const rencontre = parReference.get(choix.match);
    if (!rencontre || !M.ISSUES.includes(choix.issue)) {
      analyse.introuvables += 1;
      continue;
    }
    analyse.choix.push(new Choix(rencontre, choix.issue, choix.cote / 100));
  }
  analyse.choix.sort((a, b) => a.rencontre.ordre - b.rencontre.ordre);
  return analyse;
}

/** Le joueur que désigne la grille : son numéro, s'il l'a donné et que le nom concorde ;
 *  sinon son nom, prénom et nom dans un ordre ou l'autre, une initiale suffisant (« Pierre D. »). */
export function joueurPropose({ nom, numero = null, joueurs = M.joueurs() }) {
  const actifs = joueurs.filter((j) => !j.archive);
  const declares = mots(nom);
  const motsDe = (j) => mots(`${j.prenom} ${j.nom}`);
  /** Chaque mot tapé correspond à un mot du joueur, ou en est l'initiale. */
  const concorde = (j) => {
    const siens = motsDe(j);
    return declares.length > 0
      && declares.every((mot) => siens.some((s) => s === mot || ([...mot].length === 1 && s.startsWith(mot))));
  };

  if (numero != null) {
    const joueur = actifs.find((j) => j.numero === numero);
    if (joueur && (declares.length === 0 || concorde(joueur))) return joueur;
  }
  const candidats = actifs.filter(concorde);
  if (candidats.length === 1) return candidats[0];
  const memes = (a, b) => {
    const x = new Set(a);
    const y = new Set(b);
    return x.size === y.size && [...x].every((m) => y.has(m));
  };
  const exacts = candidats.filter((j) => memes(motsDe(j), declares));
  return exacts.length === 1 ? exacts[0] : null;
}

/** « Pierre Dupont » : prénom Pierre, nom Dupont. Un seul mot fait le prénom. */
export function prenomEtNom(texte) {
  const morceaux = String(texte ?? '').split(/\s+/).filter(Boolean);
  if (!morceaux.length) return { prenom: '', nom: '' };
  return { prenom: morceaux[0], nom: morceaux.slice(1).join(' ') };
}

// MARK: - Décision

/** Place le pari au nom du joueur choisi, avec la mise retenue par le barman (dans `modifier`). */
export function valider(grilleRecue, { analyse, joueur, mise }) {
  const blocage = analyse.blocage;
  if (blocage) throw Erreur.bloquee(blocage);
  const pari = Caisse.placerPari({
    joueur, journee: analyse.journee,
    choix: analyse.choix.map((c) => ({ rencontre: c.rencontre, issue: c.issue })),
    formule: analyse.formule, niveaux: analyse.niveaux, miseUnitaire: mise, aDistance: true,
  });
  grilleRecue.statut = 'validee';
  grilleRecue.dateTraitement = new Date().toISOString();
  grilleRecue.bilan = `Pari de ${M.nomComplet(joueur)} · ${enPoints(pari.miseTotale)}`;
  return pari;
}

export function refuser(grilleRecue) {
  grilleRecue.statut = 'refusee';
  grilleRecue.dateTraitement = new Date().toISOString();
  grilleRecue.bilan = 'Refusée';
}

// MARK: - Codage

/** Le code d'une valeur : « z » + DEFLATE brut en base64 URL s'il est plus court, sinon « j » + JSON.
 *  `format` (« grille », « jouee », « invite ») : la valeur est d'abord mise en clés courtes. */
export function coder(valeur, format = null) {
  const json = format ? FORMATS[format].versJSON(valeur) : valeur;
  const octets = new TextEncoder().encode(JSON.stringify(json));
  const compresse = deflerBrut(octets);
  if (compresse.length < octets.length) return `z${versBase64URL(compresse)}`;
  return `j${versBase64URL(octets)}`;
}

/** La valeur d'un code ; avec `format`, vérifiée et rendue avec les noms longs. Lève « illisible ». */
export function decoder(code, format = null) {
  const texte = String(code ?? '');
  const prefixe = texte[0];
  const donnees = depuisBase64URL(texte.slice(1));
  if (!prefixe || !donnees) throw Erreur.illisible();
  let octets;
  if (prefixe === 'z') {
    try { octets = inflerBrut(donnees); } catch { throw Erreur.illisible(); }
  } else if (prefixe === 'j') {
    octets = donnees;
  } else {
    throw Erreur.illisible();
  }
  let valeur;
  try {
    valeur = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets));
  } catch {
    throw Erreur.illisible();
  }
  return format ? FORMATS[format].depuisJSON(valeur) : valeur;
}

/** Base64 sans « + », « / » ni « = » : se glisse tel quel dans une adresse. */
export function versBase64URL(octets) {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) {
    binaire += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
  }
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Les octets d'un texte en base64 URL, ou `null` s'il n'en est pas un. */
export function depuisBase64URL(texte) {
  if (!/^[A-Za-z0-9_-]*$/.test(texte) || texte.length % 4 === 1) return null;
  let base64 = texte.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  let binaire;
  try { binaire = atob(base64); } catch { return null; }
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

// MARK: - Divers

function journeeDe(journee) {
  const j = typeof journee === 'string' ? M.journee(journee) : journee;
  if (!j) throw new Error('Journée introuvable.');
  return j;
}

function centiemes(cote) {
  return Math.round(cote * 100);
}

/** Sans 0, O, 1 ni l : une référence se relit sans hésiter. */
function tirage(longueur) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const hasard = new Uint8Array(longueur);
  crypto.getRandomValues(hasard);
  return Array.from(hasard, (x) => alphabet[x % alphabet.length]).join('');
}

function mots(texte) {
  return cle(texte).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// MARK: - DEFLATE brut (RFC 1951), synchrone
//
// L'app iOS compresse avec zlib (NSData, .zlib = DEFLATE brut), la page du joueur avec
// CompressionStream('deflate-raw') : tout flux DEFLATE valide se relit ici. La compression fait des
// correspondances LZ77 (fenêtre de 32 Kio, évaluation paresseuse) puis prend le plus court d'un bloc à
// codes de Huffman calculés ou d'un bloc à codes fixes.

const BASE_LONGUEUR = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115,
  131, 163, 195, 227, 258];
const EXTRA_LONGUEUR = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const BASE_DISTANCE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
  2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const EXTRA_DISTANCE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** L'ordre dans lequel s'écrivent les longueurs des codes de longueurs. */
const ORDRE_LONGUEURS = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

const LIT_FIXES = (() => {
  const l = new Uint8Array(288);
  l.fill(8, 0, 144);
  l.fill(9, 144, 256);
  l.fill(7, 256, 280);
  l.fill(8, 280, 288);
  return l;
})();
const DIST_FIXES = new Uint8Array(30).fill(5);

/** Le code de chaque longueur de correspondance (3 à 258). */
const CODE_LONGUEUR = (() => {
  const codes = new Uint8Array(259);
  for (let c = 0; c < 29; c++) {
    const fin = c === 28 ? 259 : BASE_LONGUEUR[c + 1];
    for (let l = BASE_LONGUEUR[c]; l < fin; l++) codes[l] = c;
  }
  return codes;
})();

function codeDistance(distance) {
  let c = 29;
  while (BASE_DISTANCE[c] > distance) c--;
  return c;
}

// --- Décompression (d'après puff.c de Mark Adler)

/** Une table de décodage : le nombre de codes de chaque longueur et les symboles dans l'ordre canonique. */
function tableDecodage(longueurs) {
  const compte = new Uint16Array(16);
  for (const l of longueurs) compte[l]++;
  compte[0] = 0;
  let reste = 1;
  for (let l = 1; l <= 15; l++) {
    reste = (reste << 1) - compte[l];
    if (reste < 0) throw new Error('code de Huffman trop rempli');
  }
  const decalage = new Uint16Array(16);
  for (let l = 1; l < 15; l++) decalage[l + 1] = decalage[l] + compte[l];
  const symboles = new Uint16Array(longueurs.length);
  for (let s = 0; s < longueurs.length; s++) {
    if (longueurs[s]) symboles[decalage[longueurs[s]]++] = s;
  }
  return { compte, symboles };
}

let tablesFixes = null;

/** Décompresse un flux DEFLATE brut. `limite` : taille maximale du résultat. */
export function inflerBrut(entree, limite = 4 << 20) {
  let pos = 0;
  let tampon = 0;
  let nb = 0;
  let sortie = new Uint8Array(Math.max(1024, entree.length * 4));
  let taille = 0;

  const bits = (n) => {
    while (nb < n) {
      if (pos >= entree.length) throw new Error('données tronquées');
      tampon |= entree[pos++] << nb;
      nb += 8;
    }
    const valeur = tampon & ((1 << n) - 1);
    tampon >>>= n;
    nb -= n;
    return valeur;
  };
  const place = (n) => {
    if (taille + n <= sortie.length) return;
    if (taille + n > limite) throw new Error('trop long');
    const plus = new Uint8Array(Math.min(limite, Math.max(sortie.length * 2, taille + n)));
    plus.set(sortie.subarray(0, taille));
    sortie = plus;
  };
  const symbole = (table) => {
    let code = 0;
    let premier = 0;
    let index = 0;
    for (let l = 1; l <= 15; l++) {
      code |= bits(1);
      const n = table.compte[l];
      if (code - n < premier) return table.symboles[index + (code - premier)];
      index += n;
      premier = (premier + n) << 1;
      code <<= 1;
    }
    throw new Error('code de Huffman invalide');
  };

  let dernier = 0;
  do {
    dernier = bits(1);
    const type = bits(2);
    if (type === 0) {
      // Bloc stocké : on reprend à l'octet suivant (le tampon garde au plus 7 bits).
      tampon = 0;
      nb = 0;
      if (pos + 4 > entree.length) throw new Error('données tronquées');
      const longueur = entree[pos] | (entree[pos + 1] << 8);
      const complement = entree[pos + 2] | (entree[pos + 3] << 8);
      pos += 4;
      if (longueur !== (~complement & 0xffff)) throw new Error('bloc stocké abîmé');
      if (pos + longueur > entree.length) throw new Error('données tronquées');
      place(longueur);
      sortie.set(entree.subarray(pos, pos + longueur), taille);
      taille += longueur;
      pos += longueur;
      continue;
    }
    if (type === 3) throw new Error('type de bloc inconnu');
    let lit;
    let dist;
    if (type === 1) {
      tablesFixes ??= { lit: tableDecodage(LIT_FIXES), dist: tableDecodage(DIST_FIXES) };
      ({ lit, dist } = tablesFixes);
    } else {
      const hlit = bits(5) + 257;
      const hdist = bits(5) + 1;
      const hclen = bits(4) + 4;
      if (hlit > 286 || hdist > 30) throw new Error('en-tête abîmé');
      const lc = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) lc[ORDRE_LONGUEURS[i]] = bits(3);
      const tableLc = tableDecodage(lc);
      const longueurs = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const s = symbole(tableLc);
        if (s < 16) {
          longueurs[i++] = s;
          continue;
        }
        let repetitions;
        let valeur = 0;
        if (s === 16) {
          if (i === 0) throw new Error('répétition sans longueur');
          valeur = longueurs[i - 1];
          repetitions = 3 + bits(2);
        } else if (s === 17) {
          repetitions = 3 + bits(3);
        } else {
          repetitions = 11 + bits(7);
        }
        if (i + repetitions > hlit + hdist) throw new Error('trop de longueurs');
        longueurs.fill(valeur, i, i + repetitions);
        i += repetitions;
      }
      if (longueurs[256] === 0) throw new Error('pas de fin de bloc');
      lit = tableDecodage(longueurs.subarray(0, hlit));
      dist = tableDecodage(longueurs.subarray(hlit));
    }
    for (;;) {
      const s = symbole(lit);
      if (s < 256) {
        place(1);
        sortie[taille++] = s;
      } else if (s === 256) {
        break;
      } else {
        const c = s - 257;
        if (c >= 29) throw new Error('longueur invalide');
        const longueur = BASE_LONGUEUR[c] + bits(EXTRA_LONGUEUR[c]);
        const d = symbole(dist);
        if (d >= 30) throw new Error('distance invalide');
        const distance = BASE_DISTANCE[d] + bits(EXTRA_DISTANCE[d]);
        if (distance > taille) throw new Error('distance trop grande');
        place(longueur);
        for (let k = 0; k < longueur; k++, taille++) sortie[taille] = sortie[taille - distance];
      }
    }
  } while (!dernier);
  return sortie.slice(0, taille);
}

// --- Compression

/** Les correspondances LZ77 : pour chaque jeton, `longueurs[i]` (0 pour un octet seul) et
 *  `valeurs[i]` (l'octet, ou la distance). */
function lz77(d) {
  const n = d.length;
  const longueurs = [];
  const valeurs = [];
  const TAILLE = 1 << 15;
  const tete = new Int32Array(TAILLE).fill(-1);
  const precedent = new Int32Array(Math.max(1, n));
  const hacher = (i) => ((d[i] << 10) ^ (d[i + 1] << 5) ^ d[i + 2]) & (TAILLE - 1);
  const inserer = (i) => {
    if (i + 2 >= n) return;
    const h = hacher(i);
    precedent[i] = tete[h];
    tete[h] = i;
  };
  const chercher = (i) => {
    if (i + 2 >= n) return [0, 0];
    const max = Math.min(258, n - i);
    let meilleure = 0;
    let distance = 0;
    let j = tete[hacher(i)];
    for (let essais = 512; j >= 0 && i - j <= 32768 && essais > 0; essais--, j = precedent[j]) {
      if (d[j + meilleure] !== d[i + meilleure]) continue;
      let l = 0;
      while (l < max && d[j + l] === d[i + l]) l++;
      if (l > meilleure) {
        meilleure = l;
        distance = i - j;
        if (l === max) break;
      }
    }
    return meilleure >= 3 ? [meilleure, distance] : [0, 0];
  };

  let i = 0;
  while (i < n) {
    const [l, distance] = chercher(i);
    inserer(i);
    // Évaluation paresseuse : une correspondance plus longue un octet plus loin l'emporte.
    if (l >= 3 && l < 258 && i + 1 < n && chercher(i + 1)[0] > l) {
      longueurs.push(0);
      valeurs.push(d[i]);
      i += 1;
      continue;
    }
    if (l >= 3) {
      longueurs.push(l);
      valeurs.push(distance);
      for (let k = i + 1; k < i + l; k++) inserer(k);
      i += l;
    } else {
      longueurs.push(0);
      valeurs.push(d[i]);
      i += 1;
    }
  }
  return { longueurs, valeurs };
}

/** Les longueurs d'un code de Huffman pour ces fréquences, sans dépasser `limite` bits. Au moins deux
 *  symboles ont un code : le code est toujours complet, comme le veut zlib. */
function longueursHuffman(frequences, limite) {
  const f = Array.from(frequences);
  let utilises = f.filter((x) => x > 0).length;
  for (let s = 0; utilises < 2 && s < f.length; s++) {
    if (f[s] === 0) {
      f[s] = 1;
      utilises++;
    }
  }
  for (;;) {
    const longueurs = profondeurs(f);
    if (longueurs.every((l) => l <= limite)) return longueurs;
    // Trop profond : on aplatit les fréquences et on recommence.
    for (let s = 0; s < f.length; s++) if (f[s] > 0) f[s] = Math.max(1, f[s] >> 1);
  }
}

/** La profondeur de chaque symbole dans l'arbre de Huffman (méthode des deux files). */
function profondeurs(f) {
  const feuilles = [];
  f.forEach((poids, symbole) => { if (poids > 0) feuilles.push({ poids, symbole }); });
  feuilles.sort((a, b) => a.poids - b.poids || a.symbole - b.symbole);
  const internes = [];
  let a = 0;
  let b = 0;
  const plusPetit = () => {
    if (a < feuilles.length && (b >= internes.length || feuilles[a].poids <= internes[b].poids)) return feuilles[a++];
    return internes[b++];
  };
  while (feuilles.length - a + internes.length - b > 1) {
    const x = plusPetit();
    const y = plusPetit();
    internes.push({ poids: x.poids + y.poids, gauche: x, droite: y });
  }
  const racine = internes.length ? internes[internes.length - 1] : feuilles[0];
  const longueurs = new Array(f.length).fill(0);
  const pile = [[racine, 0]];
  while (pile.length) {
    const [noeud, profondeur] = pile.pop();
    if (noeud.symbole !== undefined) {
      longueurs[noeud.symbole] = Math.max(1, profondeur);
    } else {
      pile.push([noeud.gauche, profondeur + 1], [noeud.droite, profondeur + 1]);
    }
  }
  return longueurs;
}

/** Les codes canoniques (RFC 1951, 3.2.2), retournés : ils s'écrivent bit de poids faible d'abord. */
function codesCanoniques(longueurs) {
  const compte = new Uint16Array(16);
  for (const l of longueurs) if (l) compte[l]++;
  const suivant = new Uint16Array(16);
  let code = 0;
  for (let l = 1; l <= 15; l++) {
    code = (code + compte[l - 1]) << 1;
    suivant[l] = code;
  }
  const codes = new Uint16Array(longueurs.length);
  for (let s = 0; s < longueurs.length; s++) {
    const l = longueurs[s];
    if (!l) continue;
    let c = suivant[l]++;
    let r = 0;
    for (let k = 0; k < l; k++) {
      r = (r << 1) | (c & 1);
      c >>= 1;
    }
    codes[s] = r;
  }
  return codes;
}

/** Les longueurs de codes, résumées par les symboles 16 (répète la précédente), 17 et 18 (des zéros) :
 *  [symbole, nombre de bits en plus, valeur en plus]. */
function resumerLongueurs(longueurs) {
  const suite = [];
  for (let i = 0; i < longueurs.length;) {
    const l = longueurs[i];
    let r = 1;
    while (i + r < longueurs.length && longueurs[i + r] === l) r++;
    i += r;
    if (l === 0 && r >= 3) {
      while (r >= 11) {
        const k = Math.min(138, r);
        suite.push([18, 7, k - 11]);
        r -= k;
      }
      if (r >= 3) {
        suite.push([17, 3, r - 3]);
        r = 0;
      }
    } else if (l !== 0 && r >= 4) {
      suite.push([l, 0, 0]);
      r -= 1;
      while (r >= 3) {
        const k = Math.min(6, r);
        suite.push([16, 2, k - 3]);
        r -= k;
      }
    }
    for (; r > 0; r--) suite.push([l, 0, 0]);
  }
  return suite;
}

class Ecrivain {
  constructor() {
    this.octets = [];
    this.tampon = 0;
    this.nb = 0;
  }

  ecrire(valeur, n) {
    this.tampon |= valeur << this.nb;
    this.nb += n;
    while (this.nb >= 8) {
      this.octets.push(this.tampon & 0xff);
      this.tampon >>>= 8;
      this.nb -= 8;
    }
  }

  fin() {
    if (this.nb > 0) this.octets.push(this.tampon & 0xff);
    return Uint8Array.from(this.octets);
  }
}

function ecrireBloc({ longueurs, valeurs }, dynamique) {
  const sortie = new Ecrivain();
  let litL = LIT_FIXES;
  let distL = DIST_FIXES;
  sortie.ecrire(1, 1); // dernier bloc
  sortie.ecrire(dynamique ? 2 : 1, 2);
  if (dynamique) {
    const fLit = new Uint32Array(286);
    const fDist = new Uint32Array(30);
    for (let k = 0; k < longueurs.length; k++) {
      if (longueurs[k] === 0) {
        fLit[valeurs[k]]++;
      } else {
        fLit[257 + CODE_LONGUEUR[longueurs[k]]]++;
        fDist[codeDistance(valeurs[k])]++;
      }
    }
    fLit[256]++;
    litL = longueursHuffman(fLit, 15);
    distL = longueursHuffman(fDist, 15);
    let hlit = 286;
    while (hlit > 257 && litL[hlit - 1] === 0) hlit--;
    let hdist = 30;
    while (hdist > 1 && distL[hdist - 1] === 0) hdist--;
    const resume = resumerLongueurs([...litL.slice(0, hlit), ...distL.slice(0, hdist)]);
    const fLc = new Uint32Array(19);
    for (const [s] of resume) fLc[s]++;
    const lcL = longueursHuffman(fLc, 7);
    const lcC = codesCanoniques(lcL);
    let hclen = 19;
    while (hclen > 4 && lcL[ORDRE_LONGUEURS[hclen - 1]] === 0) hclen--;
    sortie.ecrire(hlit - 257, 5);
    sortie.ecrire(hdist - 1, 5);
    sortie.ecrire(hclen - 4, 4);
    for (let i = 0; i < hclen; i++) sortie.ecrire(lcL[ORDRE_LONGUEURS[i]], 3);
    for (const [s, nbPlus, plus] of resume) {
      sortie.ecrire(lcC[s], lcL[s]);
      if (nbPlus) sortie.ecrire(plus, nbPlus);
    }
  }
  const litC = codesCanoniques(litL);
  const distC = codesCanoniques(distL);
  for (let k = 0; k < longueurs.length; k++) {
    const l = longueurs[k];
    if (l === 0) {
      sortie.ecrire(litC[valeurs[k]], litL[valeurs[k]]);
      continue;
    }
    const c = CODE_LONGUEUR[l];
    sortie.ecrire(litC[257 + c], litL[257 + c]);
    if (EXTRA_LONGUEUR[c]) sortie.ecrire(l - BASE_LONGUEUR[c], EXTRA_LONGUEUR[c]);
    const dc = codeDistance(valeurs[k]);
    sortie.ecrire(distC[dc], distL[dc]);
    if (EXTRA_DISTANCE[dc]) sortie.ecrire(valeurs[k] - BASE_DISTANCE[dc], EXTRA_DISTANCE[dc]);
  }
  sortie.ecrire(litC[256], litL[256]);
  return sortie.fin();
}

/** Compresse en un flux DEFLATE brut (un seul bloc, le plus court des deux codages). */
export function deflerBrut(donnees) {
  const jetons = lz77(donnees);
  const dynamique = ecrireBloc(jetons, true);
  const fixe = ecrireBloc(jetons, false);
  return dynamique.length < fixe.length ? dynamique : fixe;
}
