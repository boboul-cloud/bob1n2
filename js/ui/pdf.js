// Les pages imprimées en vrai fichier PDF, pour l'iPhone et l'iPad : Safari n'imprime qu'une fois
// par page, et l'app ajoutée à l'écran d'accueil n'imprime pas du tout. Le PDF part par la feuille
// de partage d'iOS (« Imprimer », « Enregistrer dans Fichiers », Messages, AirDrop…), comme le
// « Partager le PDF… » de l'app native.
//
// Les pages sont celles de l'impression (impression.js) : posées hors de l'écran, dessinées par
// html2canvas, puis réunies par jsPDF, une image par page A4. Les deux bibliothèques (licence MIT)
// ne sont chargées qu'au premier PDF, et gardées hors connexion par sw.js.

import { html, render, useEffect, useState } from '../../vendor/preact-htm.js';
import { Feuille, Section, Ligne, Encadre } from './composants.js';
import { telecharger } from './systeme.js';

const BIBLIOTHEQUES = {
  html2canvas: new URL('../../vendor/html2canvas.min.js', import.meta.url).href,
  jspdf: new URL('../../vendor/jspdf.umd.min.js', import.meta.url).href,
};
const chargements = {};

/** Charge une bibliothèque (script UMD) une seule fois ; rend son objet global. */
function charger(nom) {
  if (globalThis[nom]) return Promise.resolve(globalThis[nom]);
  if (!chargements[nom]) {
    chargements[nom] = new Promise((resoudre, rejeter) => {
      const balise = document.createElement('script');
      balise.src = BIBLIOTHEQUES[nom];
      balise.async = true;
      balise.onload = () => (globalThis[nom] ? resoudre(globalThis[nom]) : rejeter(new Error(`${nom} introuvable`)));
      balise.onerror = () => {
        chargements[nom] = null;
        rejeter(new Error("Impossible de charger l'outil PDF."));
      };
      document.head.append(balise);
    });
  }
  return chargements[nom];
}

/** Charge d'avance les outils PDF (le premier PDF n'attend plus que le dessin des pages). */
export function prechargerPDF() {
  charger('html2canvas').catch(() => {});
  charger('jspdf').catch(() => {});
}

/** Le document ({ titre, pages, style } d'impression.js) en fichier PDF (File). */
export async function fabriquerPDF({ titre, pages, style = '' }) {
  const [html2canvas, jspdf] = await Promise.all([charger('html2canvas'), charger('jspdf')]);
  const hote = document.createElement('div');
  // Hors de l'écran, à la largeur d'une page A4, toujours en noir sur blanc.
  hote.style.cssText = 'position:absolute;left:-12000px;top:0;width:210mm;background:#fff;color:#000;color-scheme:light';
  document.body.append(hote);
  try {
    render(html`${style && html`<style>${style}</style>`}${pages}`, hote);
    await document.fonts?.ready;
    const feuilles = [...hote.querySelectorAll('.page-a4')];
    const pdf = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: titre, creator: 'Bob 1N2' });
    for (let i = 0; i < feuilles.length; i++) {
      const toile = await html2canvas(feuilles[i], { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (i > 0) pdf.addPage();
      // Toute la largeur de la page ; la hauteur suit, sans dépasser la page.
      const hauteur = Math.min(297, (toile.height / toile.width) * 210);
      pdf.addImage(toile, 'PNG', 0, 0, 210, hauteur, undefined, 'FAST');
    }
    const nom = `${titre.replace(/[/:\\?*"<>|]/g, '-')}.pdf`;
    return new File([pdf.output('blob')], nom, { type: 'application/pdf' });
  } finally {
    render(null, hote);
    hote.remove();
  }
}

/**
 * La feuille du PDF : il se prépare, puis « Imprimer ou partager… » ouvre la feuille de partage
 * (dans un toucher neuf, comme iOS l'exige). Sans partage de fichiers : « Enregistrer le PDF ».
 */
export function FeuillePDF({ document: doc, onFermer }) {
  const [fichier, setFichier] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    let vivant = true;
    fabriquerPDF(doc).then((f) => { if (vivant) setFichier(f); })
      .catch((e) => { if (vivant) setErreur(e?.message ?? String(e)); });
    return () => { vivant = false; };
  }, []);

  const peutPartager = fichier && navigator.canShare?.({ files: [fichier] });
  const partager = async () => {
    try {
      await navigator.share({ files: [fichier], title: doc.titre });
    } catch (e) {
      if (e?.name !== 'AbortError') setErreur("Le partage n'a pas abouti : enregistrez le PDF, puis imprimez-le depuis Fichiers.");
    }
  };
  const enregistrer = () => telecharger(fichier.name, fichier, 'application/pdf');

  return html`<${Feuille} titre=${doc.titre} onFermer=${onFermer} gauche=${null} droite=${{ libelle: 'OK', onClick: onFermer }} compacte>
    ${!fichier && !erreur && html`<${Section} pied="Les pages sont dessinées sur l'appareil : rien n'est envoyé nulle part.">
      <${Ligne} icone="hourglass" titre="Préparation du PDF…" />
    <//>`}
    ${erreur && html`<${Section} nue><${Encadre} icone="exclamationmark.triangle" couleur="orange">${erreur}<//><//>`}
    ${fichier && html`<${Section} pied=${peutPartager
        ? "Dans la feuille de partage : « Imprimer », ou « Enregistrer dans Fichiers », Messages, AirDrop…"
        : 'Le PDF va dans vos téléchargements ; ouvrez-le pour l\'imprimer.'}>
      ${peutPartager && html`<${Ligne} action icone="printer" titre="Imprimer ou partager…" onClick=${partager} />`}
      <${Ligne} action icone="square.and.arrow.down" titre="Enregistrer le PDF" onClick=${enregistrer} />
    <//>`}
  <//>`;
}
