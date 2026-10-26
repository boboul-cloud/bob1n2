// La base de l'app : un seul document, gardé dans le navigateur (IndexedDB), jamais envoyé
// nulle part. Remplace la base SwiftData et les préférences de l'app native.
//
// Lecture : `lire()` (ou `useEtat()` dans un écran, qui redessine à chaque changement).
// Écriture : toujours dans `modifier(etat => { … })`, qui sauvegarde et redessine.

import { useEffect, useState } from '../vendor/preact-htm.js';
import { REGLAGES_PAR_DEFAUT } from './reglages-defaut.js';

export const VERSION_DONNEES = 1;

/** Le document vide : une liste par type d'objet, liés entre eux par leurs `id`. */
export function etatVide() {
  return {
    version: VERSION_DONNEES,
    reglages: { ...REGLAGES_PAR_DEFAUT },
    joueurs: [],
    journees: [],
    rencontres: [],
    paris: [],
    pronostics: [],
    mouvements: [],
    championnats: [],
    lignes: [],
    calendrier: [],
    palmares: [],
    grillesRecues: [],
    drapeaux: {},
  };
}

let etat = etatVide();
let revision = 0;
const abonnes = new Set();

export function lire() {
  return etat;
}

/** Le numéro de la dernière modification : change à chaque `modifier`. */
export function revisionCourante() {
  return revision;
}

/**
 * Toute modification passe par ici : `fn` change l'état en place ; l'app est redessinée et la
 * base sauvegardée. Une erreur levée par `fn` est relancée après coup (l'écran l'affiche).
 */
export function modifier(fn) {
  let resultat;
  try {
    resultat = fn(etat);
  } finally {
    revision += 1;
    planifierSauvegarde();
    notifier();
  }
  return resultat;
}

export function abonner(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

function notifier() {
  for (const fn of [...abonnes]) fn(revision);
}

/** Dans un composant : rend l'état et redessine le composant à chaque modification. */
export function useEtat() {
  const [, setRevision] = useState(revision);
  useEffect(() => abonner(setRevision), []);
  return etat;
}

// MARK: - Identifiants

export function nouvelId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// MARK: - Sauvegarde dans le navigateur

const BASE = 'bob1n2';
const MAGASIN = 'donnees';
const CLE = 'etat';
const CLE_SECOURS = 'bob1n2.etat';

let base = null;
let minuterie = null;
export let stockageIndisponible = false;

function ouvrirBase() {
  return new Promise((resoudre, rejeter) => {
    if (!globalThis.indexedDB) return rejeter(new Error('IndexedDB indisponible'));
    const demande = indexedDB.open(BASE, 1);
    demande.onupgradeneeded = () => demande.result.createObjectStore(MAGASIN);
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  });
}

function lireBase() {
  return new Promise((resoudre, rejeter) => {
    const t = base.transaction(MAGASIN, 'readonly');
    const d = t.objectStore(MAGASIN).get(CLE);
    d.onsuccess = () => resoudre(d.result ?? null);
    d.onerror = () => rejeter(d.error);
  });
}

function ecrireBase(valeur) {
  return new Promise((resoudre, rejeter) => {
    const t = base.transaction(MAGASIN, 'readwrite');
    t.objectStore(MAGASIN).put(valeur, CLE);
    t.oncomplete = () => resoudre();
    t.onerror = () => rejeter(t.error);
  });
}

/** Ouvre la base au lancement. Les objets gardés sont complétés des champs ajoutés depuis. */
export async function charger() {
  let brut = null;
  try {
    base = await ouvrirBase();
    brut = await lireBase();
  } catch {
    base = null;
    try {
      brut = JSON.parse(localStorage.getItem(CLE_SECOURS) ?? 'null');
    } catch {
      stockageIndisponible = true;
    }
  }
  etat = completer(brut);
  revision += 1;
  // Demande au navigateur de ne pas effacer la base quand l'appareil manque de place.
  try { await navigator.storage?.persist?.(); } catch { /* sans importance */ }
  return etat;
}

function completer(brut) {
  const vide = etatVide();
  if (!brut || typeof brut !== 'object') return vide;
  const complet = { ...vide, ...brut };
  complet.reglages = { ...REGLAGES_PAR_DEFAUT, ...(brut.reglages ?? {}) };
  for (const cle of Object.keys(vide)) {
    if (Array.isArray(vide[cle]) && !Array.isArray(complet[cle])) complet[cle] = [];
  }
  complet.drapeaux = { ...(brut.drapeaux ?? {}) };
  complet.version = VERSION_DONNEES;
  return complet;
}

/** Mode démonstration (`?demo` dans l'adresse) : une base en mémoire, jamais sauvegardée ; la vraie
 *  base n'est ni lue ni modifiée. `remplir` reçoit l'état vide et y met le jeu de démonstration. */
export let modeDemo = false;
export function activerDemo(remplir) {
  modeDemo = true;
  etat = etatVide();
  remplir(etat);
  revision += 1;
  notifier();
}

function planifierSauvegarde() {
  if (modeDemo) return;
  clearTimeout(minuterie);
  minuterie = setTimeout(sauvegarderMaintenant, 150);
}

export async function sauvegarderMaintenant() {
  if (modeDemo) return;
  clearTimeout(minuterie);
  minuterie = null;
  const copie = JSON.parse(JSON.stringify(etat));
  try {
    if (base) {
      await ecrireBase(copie);
      return;
    }
    localStorage.setItem(CLE_SECOURS, JSON.stringify(copie));
  } catch (erreur) {
    stockageIndisponible = true;
    console.error('Sauvegarde impossible', erreur);
  }
}

// Avant que la page ne disparaisse (onglet fermé, app mise en arrière-plan) : rien ne se perd.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && minuterie) sauvegarderMaintenant();
  });
  addEventListener('pagehide', () => {
    if (minuterie) sauvegarderMaintenant();
  });
}

// MARK: - Fichier de sauvegarde

/** Le contenu d'un fichier de sauvegarde : toute la base, réglages compris. */
export function exporter() {
  return JSON.stringify({ app: 'Bob 1N2', exporte: new Date().toISOString(), donnees: etat }, null, 1);
}

/** Remplace toute la base par celle d'un fichier de sauvegarde. Lève une erreur s'il n'en est pas un. */
export function importer(texte) {
  let lu;
  try {
    lu = JSON.parse(texte);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde de Bob 1N2.");
  }
  const donnees = lu?.donnees ?? lu;
  if (!donnees || typeof donnees !== 'object' || !Array.isArray(donnees.joueurs) || !Array.isArray(donnees.journees)) {
    throw new Error("Ce fichier n'est pas une sauvegarde de Bob 1N2.");
  }
  modifier(() => {
    etat = completer(donnees);
  });
  return etat;
}

/** Efface toute la base (réglages compris). */
export function toutEffacer() {
  modifier(() => {
    etat = etatVide();
  });
}
