// Le tableau de bord (« TABLEAU DE BORD LOTO LCDM ») : la journée en cours, le podium du concours
// et qui a déjà joué (« A JOUER » de la feuille Feuil1). Repris de AccueilView.swift.

import { html, useState } from '../../vendor/preact-htm.js';
import { lire, useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import * as Exemple from '../exemple.js';
import { reglages, titreAffiche } from '../reglages.js';
import { enDate, enEuros, enPoints, jour } from '../format.js';
import {
  Badge, BadgeStatutJournee, Bouton, Carte, Chiffre, Ecran, PastilleNumero,
} from '../ui/composants.js';
import { NouvelleJourneeSheet } from './journees.js';
import { PariEditeur } from './pari-editeur.js';
import { JoueurFormulaire, AchatSheet } from './joueur-actions.js';
import { MatchsDuCalendrierSheet } from './calendrier-vues.js';
import { BoutonEcranDAccueil, CartePasserASafari } from '../ui/installation.js';

export function AccueilView() {
  const etat = useEtat();
  const r = reglages();
  const journees = M.journeesTriees();
  const joueurs = [...etat.joueurs].sort((a, b) => a.numero - b.numero);
  const actifs = joueurs.filter((j) => !j.archive);
  const journeeEnCours = journees.find((j) => j.statut !== 'cloturee') ?? null;

  // Les feuilles ouvertes depuis l'accueil.
  const [pariSur, setPariSur] = useState(null);
  const [creationJournee, setCreationJournee] = useState(false);
  const [creationJoueur, setCreationJoueur] = useState(false);
  const [calendrierDe, setCalendrierDe] = useState(null);
  const [achat, setAchat] = useState(false);

  const nouveauPari = () => {
    // La plus récente qui accepte les paris : celle en cours peut avoir fermé les siens.
    const ouverte = journees.find((j) => j.statut === 'ouverte');
    if (ouverte) setPariSur(ouverte.id);
    else setCreationJournee(true);
  };

  const actions = html`
    ${r.fideliteActive && joueurs.length > 0 && html`<${Bouton} variante="lien" icone="cart" titre="Achat"
      onClick=${() => setAchat(true)} />`}
    <${Bouton} variante="lien" icone="plus" titre="Nouveau pari" onClick=${nouveauPari} />`;

  const aValider = etat.grillesRecues.filter((g) => g.statut === 'aValider').length;

  return html`<${Ecran} titre=${titreAffiche()} actions=${actions}>
    <div class="acc-accueil">
      <${CartePasserASafari} />
      ${journees.length === 0 && joueurs.length === 0
        ? html`<${PremiersPas} onJournee=${() => setCreationJournee(true)} onJoueur=${() => setCreationJoueur(true)} />`
        : html`
          ${journeeEnCours
            ? html`<${CarteJournee} journee=${journeeEnCours} onPari=${() => setPariSur(journeeEnCours.id)}
                onCalendrier=${() => setCalendrierDe(journeeEnCours.id)} />`
            : html`<${CarteSansJournee} onJournee=${() => setCreationJournee(true)} />`}
          ${aValider > 0 && html`<${CarteGrillesRecues} nombre=${aValider} />`}
          ${actifs.length > 0 && html`<${Carte} titre="Classement du concours" symbole="trophy">
            <div class="acc-carte-corps">
              <${PodiumView} joueurs=${Caisse.classementJoueurs().slice(0, 3)} />
              <a class="acc-lien-carte" href="#/classement">Voir tout le classement</a>
            </div>
          <//>`}
          ${journeeEnCours && actifs.length > 0 && html`<${Participation} journee=${journeeEnCours} actifs=${actifs} />`}
          <${Chiffres} actifs=${actifs} />`}
      <${BoutonEcranDAccueil} />
    </div>
    ${pariSur && html`<${PariEditeur} journeeId=${pariSur} onFermer=${() => setPariSur(null)} />`}
    ${creationJournee && html`<${NouvelleJourneeSheet} onFermer=${() => setCreationJournee(false)} />`}
    ${creationJoueur && html`<${JoueurFormulaire} onFermer=${() => setCreationJoueur(false)} />`}
    ${achat && html`<${AchatSheet} onFermer=${() => setAchat(false)} />`}
    ${calendrierDe && html`<${MatchsDuCalendrierSheet} journeeId=${calendrierDe} onFermer=${() => setCalendrierDe(null)} />`}
  <//>`;
}

// MARK: - Blocs

function PremiersPas({ onJournee, onJoueur }) {
  return html`<${Carte} titre=${`Bienvenue dans ${titreAffiche()}`} symbole="hand.wave">
    <div class="acc-carte-corps">
      <p class="secondaire">Le jeu de pronostics du comptoir : chaque semaine, une grille de matchs avec leurs cotes 1 / N / 2. Les joueurs misent leurs points, les gains s'ajoutent à leur porte-feuilles et se changent en consommations.</p>
      <div class="acc-etapes">
        <div class="rangee"><${IconeNumero} numero=${1} />Créez la grille de la semaine (Journées)</div>
        <div class="rangee"><${IconeNumero} numero=${2} />Inscrivez les joueurs (Joueurs)</div>
        <div class="rangee"><${IconeNumero} numero=${3} />Enregistrez leurs paris, puis saisissez les résultats</div>
      </div>
      <div class="acc-boutons-carte">
        <${Bouton} variante="principal" icone="soccerball" onClick=${onJournee}>Nouvelle journée<//>
        <${Bouton} icone="person.badge.plus" onClick=${onJoueur}>Nouveau joueur<//>
        <${Bouton} icone="tablecells" onClick=${() => modifier(() => Exemple.charger())}>Charger l'exemple du classeur<//>
        <${Bouton} icone="book" href="#/aide">Mode d'emploi<//>
      </div>
    </div>
  <//>`;
}

function CarteJournee({ journee, onPari, onCalendrier }) {
  const matchs = M.matchs(journee.id);
  const actifs = M.parisActifs(journee.id);
  const prets = M.parisARegler(journee.id).length;
  return html`<${Carte}>
    <div class="acc-carte-corps">
      <div class="rangee espace acc-entete-journee">
        <div class="grandit">
          <h2 class="acc-titre-journee">${journee.titre}</h2>
          <div class="secondaire acc-petit-plus">${jour(journee.date)}</div>
        </div>
        <${BadgeStatutJournee} statut=${journee.statut} />
      </div>
      <div class="acc-grille-chiffres" style="--min: 130px">
        <${Chiffre} titre="Matchs" valeur=${String(matchs.length)} symbole="soccerball" />
        <${Chiffre} titre="Résultats" valeur=${`${M.nombreResultats(journee.id)} / ${matchs.length}`} symbole="flag.checkered" />
        <${Chiffre} titre="Paris" valeur=${String(actifs.length)} symbole="ticket" />
        <${Chiffre} titre="Mises" valeur=${enPoints(actifs.reduce((s, p) => s + p.miseTotale, 0))} symbole="circle.grid.cross" />
      </div>
      <div class="acc-boutons-carte">
        ${journee.statut === 'ouverte' && html`<${Bouton} variante="principal" icone="plus.circle.fill" onClick=${onPari}>Nouveau pari<//>`}
        <${Bouton} icone="list.bullet.rectangle" href=${`#/journee/${journee.id}`}>Grille et résultats<//>
        <${Bouton} icone="calendar" onClick=${onCalendrier}>Matchs du calendrier<//>
        ${prets > 0 && html`<${Badge} texte=${prets > 1 ? `${prets} paris à encaisser` : '1 pari à encaisser'}
          symbole="banknote" couleur="orange" />`}
      </div>
    </div>
  <//>`;
}

function CarteGrillesRecues({ nombre }) {
  return html`<${Carte} titre="Grilles reçues" symbole="tray.and.arrow.down">
    <div class="acc-carte-corps">
      <p class="secondaire">${nombre > 1 ? `${nombre} grilles jouées à distance attendent votre validation.`
        : 'Une grille jouée à distance attend votre validation.'}</p>
      <div class="acc-boutons-carte"><${Bouton} variante="principal" icone="tray.full" href="#/grilles">Voir les grilles<//></div>
    </div>
  <//>`;
}

function CarteSansJournee({ onJournee }) {
  return html`<${Carte} titre="Aucune journée en cours" symbole="soccerball">
    <div class="acc-carte-corps">
      <p class="secondaire">Créez la grille de la semaine pour ouvrir les paris.</p>
      <div class="acc-boutons-carte"><${Bouton} variante="principal" icone="plus" onClick=${onJournee}>Nouvelle journée<//></div>
    </div>
  <//>`;
}

function Participation({ journee, actifs }) {
  const ontJoue = actifs.filter((j) => M.aJoue(j.id, journee.id));
  const restants = actifs.filter((j) => !M.aJoue(j.id, journee.id));
  return html`<${Carte} titre=${`Participation · ${journee.titre}`} symbole="person.2">
    <div class="acc-carte-corps">
      ${ontJoue.length > 0 && html`<div class="acc-intitule-participation vert">Ont joué (${ontJoue.length})</div>
        <${GrilleJoueurs} liste=${ontJoue} />`}
      ${restants.length > 0 && html`<div class="acc-intitule-participation secondaire">Pas encore joué (${restants.length})</div>
        <${GrilleJoueurs} liste=${restants} />`}
    </div>
  <//>`;
}

function GrilleJoueurs({ liste }) {
  return html`<div class="acc-puces-joueurs">
    ${liste.map((joueur) => html`<a key=${joueur.id} class="acc-puce-joueur" href=${`#/joueur/${joueur.id}`}>
      <${PastilleNumero} numero=${joueur.numero} />
      <span class="acc-nom">${M.nomComplet(joueur)}</span>
    </a>`)}
  </div>`;
}

function Chiffres({ actifs }) {
  const r = reglages();
  const dernier = M.palmaresTries()[0];
  const depuis = dernier ? enDate(dernier.date).getTime() : -Infinity;
  const ids = new Set(actifs.map((j) => j.id));
  let offert = 0;
  let achats = 0;
  let pointsEnJeu = 0;
  let misesEnCours = 0;
  for (const joueur of actifs) {
    pointsEnJeu += joueur.points;
    misesEnCours += M.misesEnCours(joueur.id);
  }
  for (const mouvement of lire().mouvements) {
    if (!ids.has(mouvement.joueurId) || !((enDate(mouvement.date)?.getTime() ?? -Infinity) > depuis)) continue;
    if (mouvement.type === 'consommation') offert += mouvement.depense ?? 0;
    if (mouvement.type === 'achat') achats += mouvement.depense ?? 0;
  }
  return html`<${Carte} titre="Le concours en chiffres" symbole="chart.bar">
    <div class="acc-grille-chiffres" style="--min: 150px">
      <${Chiffre} titre="Joueurs" valeur=${String(actifs.length)} symbole="person.2" />
      <${Chiffre} titre="Points en jeu" valeur=${enPoints(pointsEnJeu)} symbole="circle.grid.cross" />
      <${Chiffre} titre="Mises en cours" valeur=${enPoints(misesEnCours)} symbole="ticket" />
      <${Chiffre} titre="Consos offertes" valeur=${enEuros(offert)} symbole="gift" />
      ${r.fideliteActive && html`<${Chiffre} titre="Achats au comptoir" valeur=${enEuros(achats)} symbole="cart" />`}
    </div>
  <//>`;
}

// MARK: - Podium

/** Les couleurs des marches : or, argent, bronze. */
const COULEURS_PODIUM = { 1: '#edb821', 2: '#9ea8b8', 3: '#c27d45' };

/** Le podium du concours mensuel (feuille « CLASSEMENT » : 1er au centre, 2e à gauche, 3e à droite).
 *  `joueurs` : les trois premiers, dans l'ordre (objets joueur, ou leurs `id`). */
export function PodiumView({ joueurs }) {
  const liste = (joueurs ?? []).map((j) => (typeof j === 'string' ? M.joueur(j) : j)).filter(Boolean);
  const marche = (rang, hauteur) => {
    const joueur = liste.length >= rang ? liste[rang - 1] : null;
    const couleur = COULEURS_PODIUM[rang];
    return html`<div class="acc-podium-marche" key=${rang}>
      ${joueur && html`
        <span style=${`color:${couleur}`}>${rang === 1
          ? html`<${IconeLocale} dessin=${COURONNE} taille=${30} plein />`
          : html`<${IconeLocale} dessin=${MEDAILLE} taille=${24} />`}</span>
        <div class="acc-podium-nom">${M.nomComplet(joueur)}</div>
        <div class="acc-podium-points">${enPoints(joueur.points)}</div>`}
      <div class="acc-podium-socle" style=${`height:${hauteur}px;background:linear-gradient(180deg, color-mix(in srgb, ${couleur} 78%, #fff), ${couleur});opacity:${joueur ? 0.9 : 0.25}`}>
        ${rang}
      </div>
    </div>`;
  };
  return html`<div class="acc-podium">${marche(2, 70)}${marche(1, 100)}${marche(3, 50)}</div>`;
}

// MARK: - Icônes absentes de icones-svg.js

const COURONNE = '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>';
const MEDAILLE = '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>';

/** Une icône dessinée ici (couronne, médaille, chiffres cerclés). `plein` : remplie. */
function IconeLocale({ dessin, taille = 18, plein }) {
  return html`<svg class="icone" width=${taille} height=${taille} viewBox="0 0 24 24" fill=${plein ? 'currentColor' : 'none'}
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: dessin }}></svg>`;
}

/** « 1.circle », « 2.circle », « 3.circle » */
function IconeNumero({ numero }) {
  return html`<span class="accent"><${IconeLocale} taille=${20} dessin=${`<circle cx="12" cy="12" r="10"/><text x="12" y="16.3" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui, sans-serif">${numero}</text>`} /></span>`;
}

// MARK: - Style propre à l'accueil

injecterStyle('style-accueil', `
.acc-accueil { display: flex; flex-direction: column; gap: 18px; padding: 6px 0 8px; }
.acc-accueil .carte + .carte { margin-top: 0; }
.acc-carte-corps { display: flex; flex-direction: column; gap: 12px; }
.acc-carte-corps p { line-height: 1.4; }
.acc-titre-journee { font-size: 22px; font-weight: 700; line-height: 1.2; }
.acc-entete-journee { align-items: flex-start; }
.acc-petit-plus { font-size: 15px; margin-top: 2px; }
.acc-grille-chiffres { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(var(--min, 130px), 40%), 1fr)); gap: 10px; }
.acc-boutons-carte { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.acc-etapes { display: flex; flex-direction: column; gap: 10px; font-size: 15px; }
.acc-etapes .rangee { align-items: flex-start; gap: 10px; }
.acc-lien-carte { font-size: 15px; font-weight: 600; text-decoration: none; }
.acc-lien-carte:hover { text-decoration: underline; }
.acc-intitule-participation { font-size: 15px; font-weight: 600; }
.acc-puces-joueurs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); gap: 8px; }
.acc-puce-joueur { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 6px; border-radius: 10px;
  background: var(--surface-3); color: var(--texte); text-decoration: none; font-size: 15px; }
.acc-puce-joueur:hover { filter: brightness(0.97); }
.acc-puce-joueur .acc-nom { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acc-podium { display: flex; align-items: flex-end; gap: 10px; width: 100%; max-width: 520px; margin: 0 auto; }
.acc-podium-marche { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.acc-podium-nom { font-size: 15px; font-weight: 600; line-height: 1.2; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.acc-podium-points { font-size: 12px; font-weight: 700; color: var(--texte-2); font-variant-numeric: tabular-nums; }
.acc-podium-socle { width: 100%; display: grid; place-items: center; border-radius: 10px 10px 0 0;
  color: #fff; font-size: 28px; font-weight: 900; }
`);

/** Une feuille de style propre au module, posée une seule fois. */
function injecterStyle(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}
