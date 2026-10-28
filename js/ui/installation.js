// Mettre Bob 1N2 sur l'écran d'accueil (ou l'installer sur un ordinateur), d'après le navigateur :
//  - Chrome, Edge, Android : le navigateur propose lui-même l'installation (`beforeinstallprompt`),
//    que le bouton déclenche ;
//  - iPhone, iPad : aucune page ne peut le faire elle-même ; seul Partager › « Sur l'écran
//    d'accueil » de Safari (ou de Chrome) l'ajoute : la feuille montre les gestes. L'icône ouvre
//    Bob 1N2 dans Safari (manifest-safari.webmanifest), avec sa mémoire : les grilles renvoyées par
//    les joueurs, dont le lien s'ouvre toujours dans Safari, arrivent ainsi directement dans le
//    concours, comme avec le lien bob1n2:// de l'app iPhone. Une app ouverte hors de Safari (les
//    icônes d'avant) a sa propre mémoire : `CartePasserASafari` aide à en sortir ;
//  - Safari sur Mac : Fichier › « Ajouter au Dock… » (l'app du Dock a sa propre mémoire).

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { lire, exporter } from '../store.js';
import { Feuille, Section, Ligne, Bouton, Icone, Encadre } from './composants.js';
import { copier, estIOS, telecharger } from './systeme.js';
import { Site } from '../site.js';
import { annoncer } from './dialogues.js';
import { versChampDate } from '../format.js';

/** L'invitation du navigateur, gardée pour le bouton (Chrome, Edge, Android). */
let invitation = null;
const suivants = new Set();

if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    invitation = e;
    suivants.forEach((f) => f());
  });
  addEventListener('appinstalled', () => {
    invitation = null;
    suivants.forEach((f) => f());
  });
}

/** Déjà ouverte depuis l'écran d'accueil (ou installée) : le bouton n'a plus lieu d'être. */
export function estInstallee() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** « ios-safari », « ios-autre », « android », « mac-safari », « ordinateur ». */
export function plateforme() {
  const ua = navigator.userAgent;
  if (estIOS()) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-autre' : 'ios-safari';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari';
  return 'ordinateur';
}

/** Le libellé du bouton : « Sur l'écran d'accueil » sur téléphone et tablette, « Installer l'app » ailleurs. */
export function libelleInstallation() {
  return ['ordinateur', 'mac-safari'].includes(plateforme()) ? "Installer l'app" : "Sur l'écran d'accueil";
}

/** Pour un composant : redessine quand le navigateur propose (ou retire) son invitation. */
function useInvitation() {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    suivants.add(f);
    return () => suivants.delete(f);
  }, []);
  return invitation;
}

/** La base contient quelque chose qui vaut une sauvegarde. */
function aDesDonnees() {
  const e = lire();
  return e.joueurs.length + e.journees.length + e.championnats.length > 0;
}

/** « Déjà fait » : l'icône est sur l'écran d'accueil (elle ouvre Safari, l'app ne peut le savoir). */
const CLE_DEJA_FAIT = 'bob1n2.iconeAjoutee';
function dejaFait() {
  try { return localStorage.getItem(CLE_DEJA_FAIT) === '1'; } catch { return false; }
}

/** Le bouton de l'accueil ; absent quand l'app est déjà ouverte depuis l'écran d'accueil, ou quand
 *  l'utilisateur a dit l'avoir fait. */
export function BoutonEcranDAccueil() {
  const [ouverte, setOuverte] = useState(false);
  const [masque, setMasque] = useState(dejaFait);
  if (estInstallee() || masque) return null;
  return html`
    <${Bouton} bloc taille="grand" icone="iphone" onClick=${() => setOuverte(true)}>${libelleInstallation()}<//>
    ${ouverte && html`<${FeuilleEcranDAccueil} onFermer=${() => setOuverte(false)}
      onDejaFait=${() => { try { localStorage.setItem(CLE_DEJA_FAIT, '1'); } catch { /* sans importance */ } setOuverte(false); setMasque(true); }} />`}`;
}

export function FeuilleEcranDAccueil({ onFermer, onDejaFait }) {
  const invite = useInvitation();
  const quelle = plateforme();
  const ios = quelle === 'ios-safari' || quelle === 'ios-autre';
  // Sur Mac, l'app du Dock a sa propre mémoire ; sur iPhone et iPad, l'icône ouvre Safari.
  const memoireAPart = quelle === 'mac-safari';

  const installer = async () => {
    if (!invitation) return;
    const e = invitation;
    e.prompt();
    const { outcome } = await e.userChoice;
    invitation = null;
    if (outcome === 'accepted') {
      annoncer('Bob 1N2 est installé.');
      onFermer();
    }
  };

  const sauvegarder = () => {
    telecharger(`Bob 1N2 – sauvegarde ${versChampDate(new Date())}.json`, exporter());
    annoncer('Sauvegarde enregistrée');
  };

  const etape = (n, contenu) => html`<li class="inst-etape"><span class="inst-numero">${n}</span><span>${contenu}</span></li>`;
  const partager = html`<span class="inst-symbole"><${Icone} nom="square.and.arrow.up" taille=${16} /></span>`;

  let corps;
  // Safari (iPhone, iPad, Mac) ne propose jamais d'installation à une page : ses propres gestes.
  if (invite && !ios && !memoireAPart) {
    corps = html`<${Section} pied="Bob 1N2 s'ouvre alors comme une app, avec son icône, même sans connexion.">
      <${Ligne} action icone="square.and.arrow.down" titre="Installer Bob 1N2" onClick=${installer} />
    <//>`;
  } else if (quelle === 'ios-safari' || quelle === 'ios-autre') {
    corps = html`<${Section} titre=${quelle === 'ios-safari' ? 'Dans Safari' : 'Dans votre navigateur'} nue>
      <ol class="inst-etapes">
        ${etape(1, html`Touchez Partager ${partager} : en bas de l'écran sur iPhone, en haut sur iPad${quelle === 'ios-autre' ? ' (dans Chrome, à droite de la barre d\'adresse)' : ''}.`)}
        ${etape(2, html`Faites défiler, puis touchez « Sur l'écran d'accueil ». Si l'interrupteur « Ouvrir en tant qu'app web » apparaît, désactivez-le.`)}
        ${etape(3, html`Touchez « Ajouter » : l'icône de Bob 1N2 rejoint vos apps.`)}
      </ol>
      <p class="note" style="padding: 8px 4px 0">L'icône ouvre Bob 1N2 dans Safari, avec ses données : une grille renvoyée par un joueur s'ouvre directement dans le concours, d'un toucher sur son lien.</p>
    <//>`;
  } else if (quelle === 'mac-safari') {
    corps = html`<${Section} titre="Dans Safari" nue>
      <ol class="inst-etapes">
        ${etape(1, html`Menu Fichier › « Ajouter au Dock… ».`)}
        ${etape(2, html`« Ajouter » : Bob 1N2 s'ouvre depuis le Dock, dans sa propre fenêtre.`)}
      </ol>
    <//>`;
  } else if (quelle === 'android') {
    corps = html`<${Section} titre="Dans votre navigateur" nue>
      <ol class="inst-etapes">
        ${etape(1, html`Ouvrez le menu du navigateur (⋮).`)}
        ${etape(2, html`Touchez « Installer l'application » ou « Ajouter à l'écran d'accueil ».`)}
      </ol>
    <//>`;
  } else {
    corps = html`<${Section} titre="Dans votre navigateur" nue>
      <ol class="inst-etapes">
        ${etape(1, html`Chrome ou Edge : l'icône d'installation au bout de la barre d'adresse, ou le menu › « Installer Bob 1N2 ».`)}
        ${etape(2, html`Un autre navigateur ne sait pas toujours installer une app : ouvrez cette adresse dans Chrome ou Edge, ou gardez-la en favori.`)}
      </ol>
    <//>`;
  }

  return html`<${Feuille} titre=${libelleInstallation()} onFermer=${onFermer} gauche=${null}
      droite=${{ libelle: 'OK', onClick: onFermer }} compacte>
    ${corps}
    ${memoireAPart && html`<${Section} titre="Vos données" nue>
      <${Encadre} icone="exclamationmark.triangle" couleur="orange">
        L'app du Dock a sa propre mémoire, séparée de Safari : les joueurs, journées et paris saisis ici n'y
        seront pas. Pour les y retrouver : enregistrez une sauvegarde, puis, dans l'app du Dock, Réglages ›
        Sauvegarde › « Restaurer une sauvegarde… ». Ensuite, tenez le concours toujours dans l'app du Dock.
      <//>
      ${aDesDonnees() && html`<div style="margin-top:12px">
        <${Bouton} bloc icone="square.and.arrow.down" onClick=${sauvegarder}>Enregistrer une sauvegarde<//>
      </div>`}
    <//>`}
    ${onDejaFait && html`<${Section}>
      <${Ligne} action icone="checkmark" titre="C'est fait : ne plus proposer ce bouton" onClick=${onDejaFait} />
    <//>`}
    <style>
      .inst-etapes { list-style: none; margin: 0; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;
        background: var(--surface); border-radius: var(--rayon); }
      .inst-etape { display: flex; gap: 10px; align-items: baseline; line-height: 1.45; }
      .inst-numero { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
        background: var(--accent); color: #fff; font-size: 12px; font-weight: 700; transform: translateY(-1px); }
      .inst-symbole { display: inline-grid; place-items: center; width: 26px; height: 24px; border-radius: 6px;
        background: var(--surface-3); color: var(--bleu); vertical-align: -6px; }
    </style>
  <//>`;
}

/**
 * iPhone, iPad, dans une app de l'écran d'accueil ouverte hors de Safari (les icônes d'avant) : sa
 * mémoire est à part, et les grilles renvoyées par les joueurs (leur lien s'ouvre dans Safari) ne
 * l'atteignent qu'en copiant-collant. La carte guide le passage, une fois, vers Safari.
 */
export function CartePasserASafari() {
  const [copie, setCopie] = useState(false);
  if (!(estIOS() && estInstallee())) return null;
  const sauvegarder = () => {
    telecharger(`Bob 1N2 – sauvegarde ${versChampDate(new Date())}.json`, exporter());
  };
  const copierAdresse = async () => { if (await copier(Site.accueil)) setCopie(true); };
  const etape = (n, contenu) => html`<li class="inst-etape"><span class="inst-numero">${n}</span><span>${contenu}</span></li>`;
  return html`<div class="carte">
    <div class="carte-titre"><${Icone} nom="safari" taille=${18} classe="accent" /><span>Recevoir les grilles d'un toucher</span></div>
    <p style="margin-bottom:10px">Cette icône ouvre Bob 1N2 hors de Safari, avec sa propre mémoire : les grilles renvoyées
      par les joueurs s'ouvrent dans Safari et ne vous arrivent ici qu'en copiant-collant. Passez le concours dans
      Safari, une fois pour toutes : une grille s'ouvrira alors directement, comme dans l'app iPhone.</p>
    <ol class="inst-etapes" style="padding: 0; background: none">
      ${etape(1, html`« Enregistrer une sauvegarde » ci-dessous (« Enregistrer dans Fichiers »).`)}
      ${etape(2, html`Dans Safari, ouvrez l'adresse de Bob 1N2 (« Copier l'adresse »), puis Réglages › Sauvegarde › « Restaurer une sauvegarde… ».`)}
      ${etape(3, html`Supprimez cette icône (appui long › « Supprimer le signet »), puis, dans Safari, en bas de l'accueil : « Sur l'écran d'accueil ».`)}
    </ol>
    <div class="pile" style="margin-top:14px; gap:8px">
      <${Bouton} bloc variante="principal" icone="square.and.arrow.down" onClick=${sauvegarder}>Enregistrer une sauvegarde<//>
      <${Bouton} bloc icone=${copie ? 'checkmark' : 'doc.on.doc'} onClick=${copierAdresse}>${copie ? 'Adresse copiée' : "Copier l'adresse"}<//>
    </div>
    <style>
      .inst-etapes { list-style: none; margin: 0; display: flex; flex-direction: column; gap: 10px; }
      .inst-etape { display: flex; gap: 10px; align-items: baseline; line-height: 1.45; }
      .inst-numero { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
        background: var(--accent); color: #fff; font-size: 12px; font-weight: 700; transform: translateY(-1px); }
    </style>
  </div>`;
}
