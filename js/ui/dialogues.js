// Les alertes de l'app (alert, confirmationDialog de SwiftUI) et le code barman (CodeBarman.swift),
// sous forme de promesses : `if (await confirmer({ … })) { … }`. Un seul hôte, <HoteDialogues />,
// est posé à la racine de l'app.

import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { reglages } from '../reglages.js';

let file = [];
let rafraichir = null;
let annonceCourante = null;
let rafraichirAnnonce = null;

function ouvrir(dialogue) {
  return new Promise((resoudre) => {
    file.push({ ...dialogue, resoudre });
    rafraichir?.();
  });
}

function fermer(dialogue, valeur) {
  file = file.filter((d) => d !== dialogue);
  rafraichir?.();
  dialogue.resoudre(valeur);
}

/** Une alerte d'information : un titre, un message, « OK ». */
export function alerte(titre, message = '') {
  return ouvrir({ type: 'alerte', titre, message, boutons: [{ libelle: 'OK', valeur: true, principal: true }] });
}

/** Demande une confirmation. Rend `true` si l'utilisateur touche le bouton d'action. */
export async function confirmer({ titre, message = '', bouton = 'OK', destructif = false, annuler = 'Annuler' }) {
  const valeur = await ouvrir({
    type: 'alerte', titre, message,
    boutons: [
      { libelle: annuler, valeur: false },
      { libelle: bouton, valeur: true, principal: !destructif, destructif },
    ],
  });
  return valeur === true;
}

/** Plusieurs choix (confirmationDialog) : rend la `valeur` du bouton touché, ou `null`.
 *  boutons : [{ libelle, valeur, destructif }]. */
export function choisir({ titre, message = '', boutons, annuler = 'Annuler' }) {
  return ouvrir({
    type: 'alerte', titre, message, empiles: true,
    boutons: [...boutons, { libelle: annuler, valeur: null, principal: true }],
  });
}

/** Une saisie dans une alerte : rend le texte, ou `null` si l'on annule. */
export function saisir({ titre, message = '', valeur = '', placeholder = '', secret = false, bouton = 'OK', inputMode }) {
  return ouvrir({ type: 'saisie', titre, message, valeur, placeholder, secret, bouton, inputMode });
}

/**
 * Le code barman avant une opération réservée (les InputBox des macros « consommation »,
 * « Encaissement »…). Sans code réglé, rend `true` tout de suite. Code faux : « Code incorrect »
 * puis `false`.
 */
export async function demanderCode(titre = 'Code barman') {
  const code = reglages().codeBarman;
  if (!code) return true;
  const saisie = await saisir({
    titre, message: 'Demandez au barman de saisir le code pour valider.',
    placeholder: 'Code barman', secret: true, bouton: 'Valider',
  });
  if (saisie == null) return false;
  if (saisie === code) return true;
  await alerte('Code incorrect', "L'opération doit être validée par le barman.");
  return false;
}

/** Un message bref en bas de l'écran (« 3 paris encaissés »), qui disparaît seul. */
export function annoncer(message, duree = 2600) {
  annonceCourante = { message, id: Math.random() };
  rafraichirAnnonce?.();
  const id = annonceCourante.id;
  setTimeout(() => {
    if (annonceCourante?.id === id) {
      annonceCourante = null;
      rafraichirAnnonce?.();
    }
  }, duree);
}

/** Exécute une modification ; une erreur (ErreurCaisse…) s'affiche dans une alerte. Rend le
 *  résultat, ou `undefined` en cas d'erreur. */
export function essayer(fn, titreErreur = 'Opération impossible') {
  try {
    return fn();
  } catch (erreur) {
    alerte(titreErreur, erreur?.message ?? String(erreur));
    return undefined;
  }
}

// MARK: - Hôte

function DialogueSaisie({ d }) {
  const [texte, setTexte] = useState(d.valeur ?? '');
  const ref = useRef();
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50); }, []);
  const valider = () => fermer(d, texte);
  return html`<div class="alerte" role="alertdialog" aria-label=${d.titre}>
    <div class="alerte-texte">
      <h2>${d.titre}</h2>
      ${d.message && html`<p>${d.message}</p>`}
      <input ref=${ref} class="entree" type=${d.secret ? 'password' : 'text'} value=${texte}
        placeholder=${d.placeholder} inputmode=${d.inputMode} autocomplete="off"
        onInput=${(e) => setTexte(e.currentTarget.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') fermer(d, null); }} />
    </div>
    <div class="alerte-boutons">
      <button type="button" onClick=${() => fermer(d, null)}>Annuler</button>
      <button type="button" class="principal" onClick=${valider}>${d.bouton}</button>
    </div>
  </div>`;
}

function DialogueAlerte({ d }) {
  useEffect(() => {
    const touche = (e) => {
      if (e.key === 'Escape') fermer(d, d.boutons.find((b) => b.valeur === false || b.valeur === null)?.valeur ?? true);
      if (e.key === 'Enter') fermer(d, d.boutons.find((b) => b.principal)?.valeur ?? true);
    };
    addEventListener('keydown', touche);
    return () => removeEventListener('keydown', touche);
  }, []);
  const empiles = d.empiles || d.boutons.length > 2;
  return html`<div class="alerte" role="alertdialog" aria-label=${d.titre}>
    <div class="alerte-texte">
      <h2>${d.titre}</h2>
      ${d.message && html`<p>${d.message}</p>`}
    </div>
    <div class=${empiles ? 'alerte-boutons empiles' : 'alerte-boutons'}>
      ${d.boutons.map((b) => html`<button type="button"
        class=${[b.principal && 'principal', b.destructif && 'destructif'].filter(Boolean).join(' ')}
        onClick=${() => fermer(d, b.valeur)}>${b.libelle}</button>`)}
    </div>
  </div>`;
}

export function HoteDialogues() {
  const [, setN] = useState(0);
  useEffect(() => {
    rafraichir = () => setN((n) => n + 1);
    rafraichirAnnonce = () => setN((n) => n + 1);
    return () => { rafraichir = null; rafraichirAnnonce = null; };
  }, []);
  const d = file[file.length - 1];
  return html`
    ${d && html`<div class="voile pour-alerte">
      ${d.type === 'saisie' ? html`<${DialogueSaisie} key=${file.length} d=${d} />` : html`<${DialogueAlerte} key=${file.length} d=${d} />`}
    </div>`}
    ${annonceCourante && html`<div class="annonce" role="status">${annonceCourante.message}</div>`}`;
}
