// La boîte aux lettres du concours : les grilles jouées à distance y sont déposées par la page du
// joueur (« Envoyer au bar ») et l'app les relève toute seule, à l'ouverture, au retour au premier
// plan et toutes les minutes. Elles arrivent dans « Grilles reçues », sans lien à toucher ni
// copier-coller, même dans l'app ajoutée à l'écran d'accueil de l'iPhone, qui a sa propre mémoire.
//
// La clé du concours est tirée au hasard au premier envoi d'une grille et gardée dans les réglages ;
// la boîte en est l'empreinte (SHA-256). Le lien de la grille donne la boîte (on y dépose), jamais la
// clé (seule cette app relève). Le service : dossier boite/ du projet (Cloudflare Pages + D1).
// Rien en mode démonstration.

import { lire, modifier, modeDemo } from './store.js';
import { Site } from './site.js';
import * as D from './grille-a-distance.js';
import { annoncer } from './ui/dialogues.js';
import { emettre } from './ui/evenements.js';

function base64URL(octets) {
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** La boîte d'une clé : l'empreinte SHA-256, 22 signes (comme le service). */
async function boiteDeLaCle(cle) {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cle));
  return base64URL(new Uint8Array(empreinte)).slice(0, 22);
}

/** L'adresse de la boîte du concours, à écrire dans le lien des grilles ; `null` en démonstration. */
export function boiteActuelle() {
  if (modeDemo) return null;
  return lire().reglages.boite || null;
}

/** Crée la boîte du concours si elle n'existe pas encore ; rend son adresse (ou `null` en démo). */
export async function preparerBoite() {
  if (modeDemo || !globalThis.crypto?.subtle) return null;
  const r = lire().reglages;
  if (r.cleBoite && r.boite) return r.boite;
  const cle = base64URL(crypto.getRandomValues(new Uint8Array(32)));
  const boite = await boiteDeLaCle(cle);
  modifier((e) => {
    e.reglages.cleBoite = cle;
    e.reglages.boite = boite;
  });
  return boite;
}

/** La dernière relève : { date, ok, erreur }. */
export let derniereReleve = null;
let enCours = null;

/**
 * Relève la boîte : chaque grille arrive dans « Grilles reçues » (une grille déjà reçue n'est pas
 * doublée), puis la boîte est vidée de ce qui est rangé. Rend le nombre de grilles nouvelles.
 * `discret` : sans annonce s'il n'y a rien (relève automatique).
 */
export function relever({ discret = true } = {}) {
  if (enCours) return enCours;
  enCours = releverMaintenant(discret).finally(() => { enCours = null; });
  return enCours;
}

async function releverMaintenant(discret) {
  const cle = modeDemo ? '' : lire().reglages.cleBoite;
  if (!cle) return 0;
  try {
    const reponse = await fetch(`${Site.boite}/relever`, { headers: { Authorization: `Bearer ${cle}` }, cache: 'no-store' });
    if (!reponse.ok) throw new Error(`boîte : ${reponse.status}`);
    const { grilles = [] } = await reponse.json();
    let nouvelles = 0;
    const rangees = [];
    for (const g of grilles) {
      try {
        const recu = modifier(() => D.recevoir(g.code));
        if (!recu.dejaRecue) nouvelles += 1;
      } catch {
        // Illisible (lien abîmé, version plus récente de la page) : elle ne servira jamais.
      }
      rangees.push(g.id);
    }
    if (rangees.length) {
      await fetch(`${Site.boite}/accuser`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: rangees }),
      });
    }
    derniereReleve = { date: new Date(), ok: true };
    if (nouvelles) annoncer(nouvelles > 1 ? `${nouvelles} grilles reçues` : '1 grille reçue');
    else if (!discret) annoncer('Aucune nouvelle grille');
    emettre('boiteRelevee', derniereReleve);
    return nouvelles;
  } catch (erreur) {
    derniereReleve = { date: new Date(), ok: false, erreur: erreur?.message ?? String(erreur) };
    if (!discret) annoncer('Boîte injoignable : pas de connexion ?');
    emettre('boiteRelevee', derniereReleve);
    return 0;
  }
}

/** Les relèves automatiques : à l'ouverture, au retour au premier plan, au retour du réseau, et toutes
 *  les minutes tant que l'app est à l'écran. */
export function demarrerReleves() {
  if (modeDemo) return;
  relever();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') relever();
  });
  addEventListener('online', () => relever());
  setInterval(() => {
    if (document.visibilityState === 'visible') relever();
  }, 60_000);
}
