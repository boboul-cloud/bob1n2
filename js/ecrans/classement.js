// Le tableau d'honneur : classement du concours par porte-feuilles, podium et palmarès ; et la clôture
// du concours (NouveauConcoursSheet). Repris de ClassementView.swift.
//
// Sur iPhone, glisser une ligne du palmarès la supprimait (sans code) : ici, son menu ⋯.

import { html, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import { rangsPoints } from '../calcul.js';
import { reglages, aOffrir } from '../reglages.js';
import { court, enEuros, enPoints, titreDeConcours } from '../format.js';
import {
  Ecran, Section, Bouton, Icone, Vide, Feuille, ChampTexte, ChampNombre, Interrupteur,
} from '../ui/composants.js';
import { ICONES } from '../ui/icones-svg.js';
import { MenuDocument } from '../ui/impression.js';
import { demanderCode, essayer } from '../ui/dialogues.js';
import { PodiumView } from './accueil.js';
import { imprimerClassement } from './imprimables.js';
import { LigneAvecMenu, fr } from './joueur-actions.js';

// La couronne et la médaille du palmarès (« crown.fill », « medal.fill » du Swift), absentes de
// icones-svg.js : les mêmes tracés Lucide que le podium de l'accueil. Si ces symboles y sont ajoutés,
// ils sont pris à la place.
const COURONNE = '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>';
const MEDAILLE = '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>';

function IconePodium({ premier }) {
  const nom = premier ? 'crown.fill' : 'medal.fill';
  if (ICONES[nom]) return html`<${Icone} nom=${nom} taille=${16} />`;
  return html`<svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill=${premier ? 'currentColor' : 'none'}
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: premier ? COURONNE : MEDAILLE }}></svg>`;
}

export function ClassementView() {
  useEtat();
  const [nouveauConcours, setNouveauConcours] = useState(false);
  const classement = Caisse.classementJoueurs();
  const rangs = rangsPoints(classement.map((j) => j.points));
  const palmares = M.palmaresTries();

  const actions = html`
    <${MenuDocument} titre="Imprimer" onImprimer=${() => imprimerClassement(M.joueurs({ archives: false }))} />
    <${Bouton} variante="lien" icone="arrow.counterclockwise.circle" titre="Nouveau concours…"
      desactive=${classement.length === 0} onClick=${() => setNouveauConcours(true)} />`;

  return html`<${Ecran} titre="Classement" actions=${actions}>
    ${classement.length === 0
      ? html`<${Vide} icone="trophy" titre="Aucun joueur" texte="Le classement se remplit dès que des joueurs sont inscrits." />`
      : html`
        <${Section}>
          <div style="padding:16px 12px 12px"><${PodiumView} joueurs=${classement.slice(0, 3)} /></div>
        <//>
        <${Section} titre="Concours en cours">
          ${classement.map((joueur, index) => html`<${LigneClassement} key=${joueur.id} joueur=${joueur} rang=${rangs[index]} />`)}
        <//>`}

    ${palmares.length > 0 && html`<${Section} titre="Palmarès" classe="menus-visibles">
      ${palmares.map((entree, index) => html`<${LignePalmares} key=${entree.id} entree=${entree}
        auDessus=${palmares.length > 2 && index === palmares.length - 1} />`)}
    <//>`}

    ${nouveauConcours && html`<${NouveauConcoursSheet} onFermer=${() => setNouveauConcours(false)} />`}
  <//>`;
}

function LigneClassement({ joueur, rang }) {
  const offrable = aOffrir(joueur.points);
  const podium = rang <= 3;
  return html`<a class="ligne" href=${`#/joueur/${joueur.id}`}>
    <span class=${podium ? 'gras chiffres accent' : 'gras chiffres secondaire'} style="width:30px;font-size:17px;flex:none">${rang}</span>
    <span class="ligne-texte">
      <div style=${podium ? 'font-weight:600' : 'font-weight:400'}>${M.nomComplet(joueur)}</div>
      ${offrable > 0 && html`<div class="ligne-sous-titre">${enEuros(offrable)} à offrir</div>`}
    </span>
    <span class="gras chiffres" style="white-space:nowrap">${enPoints(joueur.points)}</span>
    <${Icone} nom="chevron.right" taille=${16} classe="chevron" />
  </a>`;
}

/** Un concours terminé : son titre, sa date et son podium, figés. */
function LignePalmares({ entree, auDessus }) {
  const supprimer = () => modifier((e) => {
    e.palmares = e.palmares.filter((p) => p.id !== entree.id);
  });
  return html`<${LigneAvecMenu} items=${[{ libelle: 'Supprimer', icone: 'trash', destructif: true, onClick: supprimer }]}
      titreMenu=${`Actions pour ${entree.titre}`} auDessus=${auDessus}>
    <div class="grandit" style="padding:2px 0">
      <div class="rangee espace" style="margin-bottom:6px">
        <span class="gras" style="font-size:17px">${entree.titre}</span>
        <span class="petit secondaire" style="white-space:nowrap">${court(entree.date)}</span>
      </div>
      ${M.podiumDu(entree).map((ligne, index) => html`<div class="rangee" style="font-size:15px;padding:2px 0">
        <span style=${`width:22px;display:grid;place-items:center;color:${index === 0 ? '#e0a800' : 'var(--texte-2)'}`}>
          <${IconePodium} premier=${index === 0} />
        </span>
        <span class="grandit">${ligne.nom}</span>
        <span class="chiffres secondaire">${enPoints(ligne.points)}</span>
      </div>`)}
    </div>
  <//>`;
}

// MARK: - Nouveau concours

/** Clôture du concours mensuel : podium au palmarès, porte-feuilles remis au départ. */
export function NouveauConcoursSheet({ onFermer }) {
  const [titre, setTitre] = useState(() => titreDeConcours(new Date()));
  const [points, setPoints] = useState(reglages().pointsDepart);
  const [enregistrer, setEnregistrer] = useState(true);

  const demarrer = async () => {
    if (points < 0) return;
    if (!(await demanderCode('Nouveau concours'))) return;
    essayer(() => modifier(() => Caisse.nouveauConcours({ titre, pointsDepart: points, enregistrerPodium: enregistrer })));
    onFermer();
  };

  return html`<${Feuille} titre="Nouveau concours" onFermer=${onFermer} compacte
      droite=${{ libelle: 'Démarrer', onClick: demarrer, desactive: points < 0 }}>
    <${Section} pied=${fr("Le podium actuel est enregistré sous ce titre.")}>
      <${ChampTexte} libelle="Titre du concours terminé" plein valeur=${titre} onInput=${setTitre} />
      <${Interrupteur} libelle="Garder le podium au palmarès" valeur=${enregistrer} onChange=${setEnregistrer} />
    <//>
    <${Section} pied=${fr("Chaque joueur actif repart avec ce nombre de points. Les paris en cours ne sont pas touchés : leurs gains iront au nouveau concours.")}>
      <${ChampNombre} libelle="Porte-feuilles de départ" valeur=${points} onChange=${setPoints} />
    <//>
  <//>`;
}
