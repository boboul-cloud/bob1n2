// Les pages imprimées : l'équivalent de DocumentPDF.swift. Les pages (des éléments htm, chacun
// dans un <div class="page-a4">) sont posées dans #impression, puis le navigateur imprime ; sa
// fenêtre d'impression permet aussi d'enregistrer en PDF (iPhone : Partager › Imprimer, ou
// Options › PDF). Le nom du fichier PDF proposé est le titre du document.

import { html, render } from '../../vendor/preact-htm.js';
import { Menu } from './composants.js';

/**
 * Imprime des pages. `pages` : un élément htm (ou une liste) fait de <div class="page-a4">…</div>.
 * Les styles propres aux pages peuvent être donnés par `style` (texte CSS).
 */
export function imprimer({ titre, pages, style = '' }) {
  let hote = document.getElementById('impression');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'impression';
    document.body.append(hote);
  }
  render(html`${style && html`<style>${style}</style>`}${pages}`, hote);
  // Pendant ce travail, l'impression ne montre que ces pages (sinon : l'écran, comme une page web).
  document.body.classList.add('impression-en-cours');
  const ancienTitre = document.title;
  document.title = titre.replace(/[/:]/g, '-');
  const finir = () => {
    document.title = ancienTitre;
    removeEventListener('afterprint', finir);
    // Les pages restent posées jusqu'au prochain geste dans l'app : sur iPhone, la fenêtre
    // d'impression peut encore les relire (format du papier, aperçu).
    addEventListener('pointerdown', () => {
      document.body.classList.remove('impression-en-cours');
      render(null, hote);
    }, { once: true, capture: true });
  };
  addEventListener('afterprint', finir);
  // Tout de suite, dans le geste de l'utilisateur : Safari (iPhone, iPad, Mac) ignore une impression
  // demandée après coup. Les pages sont déjà posées (rendu synchrone) ; print() les met en forme.
  window.print();
}

/** Le menu « Imprimer » des pages imprimables (MenuDocument.swift). `onImprimer` fabrique et imprime.
 *  `iconeSeule` : l'imprimante sans texte (barre d'un écran sur téléphone), le titre en infobulle. */
export function MenuDocument({ titre = 'Imprimer', onImprimer, iconeSeule = false }) {
  return html`<${Menu} libelle=${iconeSeule ? undefined : titre} titre=${titre} icone="printer" items=${[
    { libelle: 'Imprimer…', icone: 'printer', onClick: onImprimer },
    { libelle: 'Enregistrer en PDF…', icone: 'square.and.arrow.down', onClick: onImprimer },
  ]} />`;
}
