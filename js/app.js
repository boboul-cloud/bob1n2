// Point d'entrée de la version web : ouvre la base (ou la démonstration avec `?demo`), puis l'app.

import { html, render } from '../vendor/preact-htm.js';
import { charger } from './store.js';
import { Racine } from './ui/racine.js';
// Tôt : l'invitation à installer l'app (Chrome, Edge, Android) arrive peu après le chargement.
import './ui/installation.js';

async function demarrer() {
  const parametres = new URLSearchParams(location.search);
  if (parametres.has('demo')) {
    const { ouvrirDemo } = await import('./demo.js');
    ouvrirDemo();
  } else {
    await charger();
  }
  render(html`<${Racine} />`, document.getElementById('app'));

  // Les grilles jouées à distance arrivent toutes seules : la boîte aux lettres du concours est
  // relevée à l'ouverture, puis régulièrement (boite.js). Rien en démonstration.
  if (!parametres.has('demo')) {
    const { demarrerReleves } = await import('./boite.js');
    demarrerReleves();
    // Et l'appareil du bar qui a activé les notifications est prévenu de chaque grille (notifications.js).
    const { demarrerNotifications } = await import('./notifications.js');
    demarrerNotifications();
  }

  // Hors connexion : les fichiers de l'app sont gardés par le navigateur (sw.js).
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !parametres.has('demo')) {
    // Une nouvelle version prend la main (sw.js) : la page se recharge une fois, pour s'en servir.
    const avaitUnGardien = !!navigator.serviceWorker.controller;
    let recharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!avaitUnGardien || recharge) return;
      recharge = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((enregistrement) => {
      // À chaque retour au premier plan (app de l'écran d'accueil laissée ouverte) : y a-t-il du neuf ?
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') enregistrement.update().catch(() => {});
      });
    }).catch(() => {});
  }
}

demarrer();
