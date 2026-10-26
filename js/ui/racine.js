// La racine de l'app (RootView.swift) : la navigation par adresses, la barre d'onglets sur téléphone
// et la barre latérale sur tablette et ordinateur, l'onglet « Plus », et les feuilles ouvertes de
// partout (nouveau pari, nouveau joueur, grille jouée à distance reçue).
//
// Adresses : #/accueil, #/journees, #/joueurs, #/classement, #/grilles, #/calculateur,
// #/competitions, #/reglages, #/aide, #/plus ; détails : #/journee/<id>, #/joueur/<id>,
// #/competition/<id>, #/aide/<chapitre> ; lien d'une grille jouée : #/grille/<code>.

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier, modeDemo } from '../store.js';
import { Icone, Ecran, Section, Ligne } from './composants.js';
import { HoteDialogues, alerte } from './dialogues.js';
import { ecouter } from './evenements.js';

import { AccueilView } from '../ecrans/accueil.js';
import { JourneesView } from '../ecrans/journees.js';
import { JourneeDetailView } from '../ecrans/journee.js';
import { JoueursView } from '../ecrans/joueurs.js';
import { JoueurDetailView } from '../ecrans/joueur.js';
import { JoueurFormulaire } from '../ecrans/joueur-actions.js';
import { ClassementView } from '../ecrans/classement.js';
import { GrillesRecuesView, GrilleRecueFiche } from '../ecrans/distance.js';
import { recevoir } from '../grille-a-distance.js';
import { CalculateurView } from '../ecrans/calculateur.js';
import { ChampionnatsView, ChampionnatDetailView } from '../ecrans/competitions.js';
import { ImportCalendrierSheet } from '../ecrans/calendrier-vues.js';
import { ReglagesView } from '../ecrans/reglages.js';
import { ModeDEmploiView } from '../ecrans/mode-emploi.js';
import { PariEditeur } from '../ecrans/pari-editeur.js';
import { FeuillePDF } from './pdf.js';

export const RUBRIQUES = {
  accueil: { titre: 'Accueil', symbole: 'house', vue: () => html`<${AccueilView} />` },
  journees: { titre: 'Journées', symbole: 'soccerball', vue: () => html`<${JourneesView} />` },
  joueurs: { titre: 'Joueurs', symbole: 'person.2', vue: () => html`<${JoueursView} />` },
  classement: { titre: 'Classement', symbole: 'trophy', vue: () => html`<${ClassementView} />` },
  grilles: { titre: 'Grilles reçues', symbole: 'tray.and.arrow.down', vue: () => html`<${GrillesRecuesView} />` },
  calculateur: { titre: 'Calculateur Multi', symbole: 'square.grid.3x3', vue: () => html`<${CalculateurView} />` },
  competitions: { titre: 'Compétitions', symbole: 'list.number', vue: () => html`<${ChampionnatsView} />` },
  reglages: { titre: 'Réglages', symbole: 'gearshape', vue: () => html`<${ReglagesView} />` },
  aide: { titre: "Mode d'emploi", symbole: 'book', vue: () => html`<${ModeDEmploiView} />` },
};

/** Sur téléphone, quatre onglets ; le reste passe sous « Plus ». */
export const PRINCIPALES = ['accueil', 'journees', 'joueurs', 'classement'];
export const SECONDAIRES = ['grilles', 'calculateur', 'competitions', 'reglages', 'aide'];

/** La rubrique à laquelle appartient un écran de détail, pour l'onglet allumé. */
const PARENT = { journee: 'journees', joueur: 'joueurs', competition: 'competitions', aide: 'aide' };

function lireAdresse() {
  const brut = decodeURIComponent((location.hash || '#/accueil').replace(/^#\/?/, ''));
  const [nom, ...reste] = brut.split('/');
  return { nom: nom || 'accueil', parametre: reste.join('/') || null };
}

/** La position de défilement de chaque adresse déjà vue : un retour la retrouve, un nouvel écran
 *  s'ouvre en haut. */
const defilements = new Map();

export function useAdresse() {
  const [adresse, setAdresse] = useState(lireAdresse);
  useEffect(() => {
    const suivre = (e) => {
      if (e?.oldURL) defilements.set(new URL(e.oldURL).hash, scrollY);
      setAdresse(lireAdresse());
      const garde = defilements.get(location.hash);
      requestAnimationFrame(() => scrollTo(0, garde ?? 0));
    };
    addEventListener('hashchange', suivre);
    return () => removeEventListener('hashchange', suivre);
  }, []);
  return adresse;
}

/** Va à une adresse (« #/journee/… ») ; `remplacer` : sans laisser l'adresse courante dans l'historique. */
export function naviguer(adresse, { remplacer = false } = {}) {
  const cible = adresse.startsWith('#') ? adresse : `#${adresse}`;
  if (remplacer) {
    history.replaceState(null, '', cible);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = cible;
  }
}

function ecranPour({ nom, parametre }) {
  if (nom === 'journee' && parametre) return html`<${JourneeDetailView} key=${parametre} id=${parametre} />`;
  if (nom === 'joueur' && parametre) return html`<${JoueurDetailView} key=${parametre} id=${parametre} />`;
  if (nom === 'competition' && parametre) return html`<${ChampionnatDetailView} key=${parametre} id=${parametre} />`;
  if (nom === 'aide') return html`<${ModeDEmploiView} key=${parametre ?? 'aide'} chapitre=${parametre} />`;
  if (nom === 'plus') return html`<${PlusView} />`;
  return (RUBRIQUES[nom] ?? RUBRIQUES.accueil).vue();
}

/** L'onglet « Plus » du téléphone. */
function PlusView() {
  return html`<${Ecran} titre="Plus">
    <${Section}>
      ${SECONDAIRES.map((cle) => html`<${Ligne} key=${cle} href=${`#/${cle}`} icone=${RUBRIQUES[cle].symbole}
        titre=${RUBRIQUES[cle].titre} chevron />`)}
    <//>
  <//>`;
}

function rubriqueActive(nom) {
  if (RUBRIQUES[nom] || nom === 'plus') return nom;
  return PARENT[nom] ?? 'accueil';
}

export function Racine() {
  const etat = useEtat();
  const adresse = useAdresse();
  const [pari, setPari] = useState(null);
  const [nouveauJoueur, setNouveauJoueur] = useState(false);
  const [grilleRecue, setGrilleRecue] = useState(null);
  const [calendrierRecu, setCalendrierRecu] = useState(null);
  const [documentPDF, setDocumentPDF] = useState(null);

  useEffect(() => ecouter('nouveauPari', (d) => setPari(d ?? {})), []);
  useEffect(() => ecouter('nouveauJoueur', () => setNouveauJoueur(true)), []);
  useEffect(() => ecouter('ouvrirCalendrierRecu', (d) => setCalendrierRecu(d)), []);
  // Un document imprimé sur iPhone ou iPad : en PDF, par la feuille de partage (impression.js).
  useEffect(() => ecouter('documentPDF', (d) => setDocumentPDF({ ...d, cle: Math.random() })), []);

  // Une grille jouée à distance : le lien « …/#/grille/<code> » de la page recu/.
  useEffect(() => {
    if (adresse.nom !== 'grille' || !adresse.parametre) return;
    const code = adresse.parametre;
    naviguer('#/grilles', { remplacer: true });
    try {
      const recu = modifier(() => recevoir(code));
      setGrilleRecue({ grilleId: recu.grille.id, dejaRecue: recu.dejaRecue });
    } catch (erreur) {
      alerte('Document non reconnu', erreur?.message ?? String(erreur));
    }
  }, [adresse.nom, adresse.parametre]);

  const active = rubriqueActive(adresse.nom);
  const ongletActif = PRINCIPALES.includes(active) ? active : 'plus';
  const aValider = etat.grillesRecues.filter((g) => g.statut === 'aValider').length;

  return html`
    <div class="app">
      <nav class="barre-laterale" aria-label="Rubriques">
        <div class="titre-app"><img src="icones/icone-180.png" alt="" />Bob 1N2</div>
        ${PRINCIPALES.map((cle) => html`<a key=${cle} class=${`lien-lateral ${active === cle ? 'actif' : ''}`} href=${`#/${cle}`}>
          <${Icone} nom=${RUBRIQUES[cle].symbole} />${RUBRIQUES[cle].titre}</a>`)}
        <div class="groupe-titre">Outils</div>
        ${SECONDAIRES.map((cle) => html`<a key=${cle} class=${`lien-lateral ${active === cle ? 'actif' : ''}`} href=${`#/${cle}`}>
          <${Icone} nom=${RUBRIQUES[cle].symbole} />${RUBRIQUES[cle].titre}
          ${cle === 'grilles' && aValider > 0 && html`<span class="compteur">${aValider}</span>`}</a>`)}
        ${modeDemo && html`<div class="groupe-titre">Démonstration</div>
          <div class="note" style="padding:0 12px">Base de démonstration en mémoire : rien n'est enregistré.</div>`}
      </nav>
      <main class="contenu" id="contenu">${ecranPour(adresse)}</main>
      <nav class="barre-onglets" aria-label="Onglets">
        ${PRINCIPALES.map((cle) => html`<a key=${cle} class=${`onglet ${ongletActif === cle ? 'actif' : ''}`} href=${`#/${cle}`}>
          <${Icone} nom=${RUBRIQUES[cle].symbole} taille=${24} epaisseur=${1.8} />${RUBRIQUES[cle].titre}</a>`)}
        <a class=${`onglet ${ongletActif === 'plus' ? 'actif' : ''}`} href="#/plus">
          <${Icone} nom="ellipsis.circle" taille=${24} epaisseur=${1.8} />Plus</a>
      </nav>
    </div>
    ${pari && html`<${PariEditeur} journeeId=${pari.journeeId} joueurId=${pari.joueurId} onFermer=${() => setPari(null)} />`}
    ${nouveauJoueur && html`<${JoueurFormulaire} onFermer=${() => setNouveauJoueur(false)} />`}
    ${grilleRecue && html`<${GrilleRecueFiche} grilleId=${grilleRecue.grilleId} dejaRecue=${grilleRecue.dejaRecue}
      onFermer=${() => setGrilleRecue(null)} />`}
    ${calendrierRecu && html`<${ImportCalendrierSheet} poules=${calendrierRecu.poules} onFermer=${() => setCalendrierRecu(null)} />`}
    ${documentPDF && html`<${FeuillePDF} key=${documentPDF.cle} document=${documentPDF} onFermer=${() => setDocumentPDF(null)} />`}
    <${HoteDialogues} />`;
}
