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
  }

  // Hors connexion : les fichiers de l'app sont gardés par le navigateur (sw.js).
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !parametres.has('demo')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

demarrer();
