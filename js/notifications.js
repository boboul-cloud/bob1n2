// Les notifications de la boîte aux lettres : l'appareil du bar est prévenu dès qu'un joueur touche
// « Envoyer au bar », même l'app fermée. Le navigateur donne une adresse de notification (chez Apple,
// Google ou Mozilla) que la boîte garde ; à chaque grille déposée, elle y envoie un court message
// chiffré pour cet appareil seul, que sw.js affiche. Le service : dossier boite/ du projet.
//
// Sur iPhone et iPad : seulement dans l'app ajoutée à l'écran d'accueil (iOS 16.4 et plus), et
// l'autorisation se demande au toucher d'un bouton. Rien en mode démonstration.

import { lire, modeDemo } from './store.js';
import { Site } from './site.js';
import { preparerBoite, relever } from './boite.js';
import { estIOS } from './ui/systeme.js';
import { estInstallee } from './ui/installation.js';

/** La clé publique du service (VAPID) : la boîte signe ses messages avec la clé privée qui va avec
 *  (secret VAPID_PRIVE du projet Pages). */
const CLE_PUBLIQUE = 'BGaEom-xbmVc6Wr1l0RX6WX6FFFpy1CVziCesBQ3CvxNERvCXAHovD-cGxYtzc0nDgEeChFnefWqpO3l8wXClrg';

function deBase64URL(texte) {
  const binaire = atob(texte.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texte.length + 3) % 4));
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0));
}

function possibles() {
  return !modeDemo && isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function abonnementActuel() {
  const enregistrement = await navigator.serviceWorker.getRegistration();
  return { enregistrement, abonnement: await enregistrement?.pushManager.getSubscription() };
}

/**
 * « actives », « inactives », « refusees » (refusées dans les réglages de l'appareil), « ecranAccueil »
 * (iPhone, iPad : depuis l'app de l'écran d'accueil seulement) ou « impossibles ».
 */
export async function etatNotifications() {
  if (!possibles()) return !modeDemo && estIOS() && !estInstallee() ? 'ecranAccueil' : 'impossibles';
  if (Notification.permission === 'denied') return 'refusees';
  try {
    const { abonnement } = await abonnementActuel();
    return abonnement && Notification.permission === 'granted' ? 'actives' : 'inactives';
  } catch {
    return 'inactives';
  }
}

/** Donne l'abonnement de cet appareil à la boîte du concours ; rend la réponse de la boîte. */
async function donnerALaBoite(abonnement, essai) {
  const cle = lire().reglages.cleBoite;
  const reponse = await fetch(`${Site.boite}/abonner`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...abonnement.toJSON(), essai }),
  });
  if (!reponse.ok) throw new Error(`La boîte aux lettres refuse l'abonnement (${reponse.status}).`);
  return reponse.json();
}

/**
 * Active les notifications sur cet appareil. À appeler au toucher d'un bouton : l'autorisation est
 * demandée tout de suite (Safari l'exige). Rend « actives », « refusees » ou « inactives » (question
 * laissée sans réponse), et `essai` : vrai si la notification d'essai est partie.
 */
export async function activerNotifications() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { etat: permission === 'denied' ? 'refusees' : 'inactives' };
  const { enregistrement, abonnement: deja } = await abonnementActuel();
  if (!enregistrement) throw new Error("Ouvrez d'abord l'app une fois avec une connexion, puis réessayez.");
  const abonnement = deja ?? await enregistrement.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deBase64URL(CLE_PUBLIQUE) });
  await preparerBoite();
  const { essai } = await donnerALaBoite(abonnement, true);
  return { etat: 'actives', essai: essai >= 200 && essai < 300 };
}

/** Plus de notifications sur cet appareil : la boîte oublie son adresse. */
export async function desactiverNotifications() {
  const { abonnement } = await abonnementActuel();
  if (!abonnement) return;
  const cle = lire().reglages.cleBoite;
  if (cle) {
    await fetch(`${Site.boite}/desabonner`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: abonnement.endpoint }),
    }).catch(() => {});
  }
  await abonnement.unsubscribe();
}

/** À l'ouverture de l'app : l'abonnement est redonné à la boîte (il peut changer, et la boîte oublie
 *  au bout de 90 jours un appareil qui n'ouvre plus l'app). Une notification touchée ou reçue app
 *  ouverte : la boîte est relevée tout de suite, et la notification touchée ouvre « Grilles reçues ». */
export function demarrerNotifications() {
  if (!possibles()) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'grilleRecue') relever();
    if (e.data?.type === 'ouvrir') {
      location.hash = e.data.ecran ?? '#/grilles';
      relever();
    }
  });
  if (Notification.permission !== 'granted' || !lire().reglages.cleBoite) return;
  abonnementActuel()
    .then(({ abonnement }) => abonnement && donnerALaBoite(abonnement, false))
    .catch(() => {});
}
