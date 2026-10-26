// Une journée : sa grille de cotes, la saisie des résultats et les paris des joueurs.
// Repris de JourneeDetailView.swift (avec LigneGrille, LigneResultat et TitreJourneeSheet).

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { lire, useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import { suivreResultats } from '../grille.js';
import { enCote, enPoints, jour } from '../format.js';
import {
  BadgeStatutJournee, Bouton, BoutonIssue, ChampDate, ChampTexte, Ecran, Feuille, Ligne, Menu, PastilleNumero,
  Section, Segment, TuileAction, Vide,
} from '../ui/composants.js';
import { alerte, demanderCode, essayer } from '../ui/dialogues.js';
import { SaisieMatchsView, RencontreEditeur } from './saisie-matchs.js';
import { CotesView } from './cotes.js';
import { CollerMatchsSheet, CollerResultatsSheet } from './collage-vues.js';
import { PariEditeur } from './pari-editeur.js';
import { PariCarte } from './pari-carte.js';
import { imprimerGrille } from './imprimables.js';
import { MatchsDuCalendrierSheet } from './calendrier-vues.js';
import { EnvoiGrilleSheet } from './distance.js';
import { contenu } from '../grille-a-distance.js';

const AFFICHAGES = [
  { valeur: 'grille', libelle: 'Grille' },
  { valeur: 'resultats', libelle: 'Résultats' },
  { valeur: 'paris', libelle: 'Paris' },
];

export function JourneeDetailView({ id }) {
  useEtat();
  const journee = M.journee(id);
  const [affichage, setAffichage] = useState('grille');
  // Les feuilles ouvertes depuis la journée : saisie, cotes, collerMatchs, collerResultats, pari,
  // calendrier, envoi, titre.
  const [feuille, setFeuille] = useState(null);
  const [edition, setEdition] = useState(null);

  // Les rangs des compétitions suivent chaque résultat (et chaque score) saisi, effacé ou collé.
  // Chaque saisie de ces écrans les reporte déjà ; ceci rattrape un changement venu d'ailleurs.
  const signature = journee ? M.matchs(id).map((r) => `${r.resultat ?? ''}|${r.score ?? ''}`).join(',') : '';
  useEffect(() => {
    if (journee && resultatsAReporter(id)) modifier(() => suivreResultats(journee));
  }, [signature]);

  if (!journee) {
    return html`<${Ecran} titre="Journée" retour>
      <${Vide} icone="soccerball" titre="Journée introuvable" texte="Elle a été supprimée." />
    <//>`;
  }

  const matchs = M.matchs(id);

  const encaisser = async () => {
    const n = M.parisARegler(id).length;
    if (!(await demanderCode(n > 1 ? `Encaisser ${n} paris` : 'Encaisser le pari'))) return;
    const resultat = essayer(() => modifier(() => Caisse.reglerTout(journee)));
    if (!resultat) return;
    const paris = resultat.nombre > 1 ? `${resultat.nombre} paris réglés` : '1 pari réglé';
    alerte('Encaissement', `${paris} · ${enPoints(resultat.gains)} versés aux porte-feuilles.`);
  };

  const ajouterUnMatch = () => {
    const rencontre = modifier(() => Caisse.ajouterRencontre(journee));
    setEdition(rencontre.id);
  };

  const actions = html`
    <${Menu} icone="printer" titre="Imprimer la grille" items=${[
      { libelle: 'Imprimer…', icone: 'printer', onClick: () => imprimerGrille(id) },
      { libelle: 'Enregistrer en PDF…', icone: 'square.and.arrow.down', onClick: () => imprimerGrille(id) },
    ]} />
    <${Menu} icone="ellipsis.circle" titre="Options" items=${[
      { libelle: 'Titre et date…', icone: 'pencil', onClick: () => setFeuille('titre') },
      null,
      { libelle: 'Matchs du calendrier…', icone: 'calendar', onClick: () => setFeuille('calendrier') },
      null,
      { libelle: 'Coller des matchs…', icone: 'doc.on.clipboard', onClick: () => setFeuille('collerMatchs') },
      { libelle: 'Coller les résultats…', icone: 'flag.checkered', onClick: () => setFeuille('collerResultats') },
      { libelle: 'Cotes…', icone: 'slider.horizontal.3', onClick: () => setFeuille('cotes') },
      { libelle: 'Saisie des matchs…', icone: 'square.and.pencil', onClick: () => setFeuille('saisie') },
      { libelle: 'Ajouter un match', icone: 'plus', onClick: ajouterUnMatch },
      { libelle: 'Envoyer la grille aux joueurs…', icone: 'paperplane', onClick: () => setFeuille('envoi'),
        desactive: journee.statut !== 'ouverte' || matchs.length === 0 },
      null,
      { titre: 'Statut' },
      ...Object.entries(M.STATUTS_JOURNEE).map(([statut, s]) => ({
        libelle: s.libelle,
        icone: journee.statut === statut ? 'checkmark' : s.symbole,
        onClick: () => modifier(() => { journee.statut = statut; }),
      })),
    ]} />`;

  return html`<${Ecran} titre=${journee.titre} retour actions=${actions}>
    <${Section}>
      <div class="ligne jrn-bloc"><${Entete} journee=${journee} onFeuille=${setFeuille} onEncaisser=${encaisser} /></div>
      <div class="ligne"><${Segment} classe="grandit" options=${AFFICHAGES} valeur=${affichage} onChange=${setAffichage} /></div>
    <//>

    ${affichage === 'grille' && journee.statut === 'ouverte' && matchs.length > 0
      && html`<${JeuADistance} journee=${journee} onEnvoi=${() => setFeuille('envoi')} />`}

    ${affichage === 'paris'
      ? html`<${ParisDeLaJournee} journee=${journee} />`
      : html`
        ${matchs.length === 0 && html`<${Section}>
          <${Vide} icone="soccerball" titre="Grille vide"
            texte="Prenez les matchs de la semaine dans le calendrier de vos compétitions (collé une fois pour la saison, onglet Compétitions), ou saisissez-les.">
            <div class="jrn-boutons-vide">
              <${Bouton} variante="principal" onClick=${() => setFeuille('calendrier')}>Matchs du calendrier<//>
              <${Bouton} variante="lien" onClick=${() => setFeuille('saisie')}>Saisir les matchs<//>
            </div>
          <//>
        <//>`}
        ${M.groupes(id).map((groupe) => html`<${Section} key=${groupe.id} titre=${groupe.titre}
          classe=${affichage === 'resultats' ? 'jrs-avec-menus' : ''}>
          ${groupe.rencontres.map((rencontre) => (affichage === 'grille'
            ? html`<${LigneGrille} key=${rencontre.id} rencontre=${rencontre} colonneResultat=${M.nombreResultats(id) > 0}
                onClick=${() => setEdition(rencontre.id)} />`
            : html`<${LigneResultat} key=${rencontre.id} rencontre=${rencontre} />`))}
        <//>`)}`}

    ${feuille === 'saisie' && html`<${SaisieMatchsView} journeeId=${id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'cotes' && html`<${CotesView} journeeId=${id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'collerMatchs' && html`<${CollerMatchsSheet} journeeId=${id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'collerResultats' && html`<${CollerResultatsSheet} journeeId=${id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'pari' && html`<${PariEditeur} journeeId=${id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'calendrier' && html`<${MatchsDuCalendrierSheet} journeeId=${id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'envoi' && html`<${EnvoiGrilleSheet} journeeId=${id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'titre' && html`<${TitreJourneeSheet} journee=${journee} onFermer=${() => setFeuille(null)} />`}
    ${edition && html`<${RencontreEditeur} rencontreId=${edition} onFermer=${() => setEdition(null)} />`}
  <//>`;
}

/** Un résultat ou un score pas encore reporté dans les rangs de sa compétition. */
function resultatsAReporter(journeeId) {
  return M.matchs(journeeId).some((r) => (r.resultat ?? null) !== (r.resultatCompte ?? null)
    || M.scoreRetenu(r) !== (r.scoreCompte ?? null));
}

// MARK: - En-tête

function Entete({ journee, onFeuille, onEncaisser }) {
  const matchs = M.matchs(journee.id);
  const actifs = M.parisActifs(journee.id);
  const prets = M.parisARegler(journee.id);
  const tuiles = [
    journee.statut === 'ouverte' && html`<${TuileAction} titre="Nouveau pari" symbole="plus.circle.fill" pleine
      desactive=${matchs.length === 0} onClick=${() => onFeuille('pari')} />`,
    prets.length > 0 && html`<${TuileAction} titre=${`Encaisser (${prets.length})`} symbole="banknote" couleur="orange"
      onClick=${onEncaisser} />`,
    html`<${TuileAction} titre="Calendrier" symbole="calendar" onClick=${() => onFeuille('calendrier')} />`,
    html`<${TuileAction} titre="Cotes" symbole="slider.horizontal.3" desactive=${matchs.length === 0}
      onClick=${() => onFeuille('cotes')} />`,
  ].filter(Boolean);
  return html`<div class="jrn-entete-journee-detail">
    <div class="rangee espace">
      <span class="secondaire jrn-petit-plus">${jour(journee.date)}</span>
      <${BadgeStatutJournee} statut=${journee.statut} />
    </div>
    <div class="tres-petit secondaire">${matchs.length} matchs · ${M.nombreResultats(journee.id)} résultats · ${actifs.length} paris · ${enPoints(actifs.reduce((s, p) => s + p.miseTotale, 0))} misés</div>
    <div class="jrn-rangee-tuiles" style=${`grid-template-columns: repeat(${tuiles.length}, minmax(0, 1fr))`}>${tuiles}</div>
  </div>`;
}

// MARK: - Jeu à distance

function JeuADistance({ journee, onEnvoi }) {
  const aValider = grillesAValider(journee);
  return html`<${Section} pied="Les joueurs cochent leur grille sur leur téléphone et vous la renvoient.">
    <${Ligne} action icone="paperplane" titre="Envoyer la grille aux joueurs" onClick=${onEnvoi} />
    ${aValider > 0 && html`<${Ligne} classe="jrn-orange-ligne" icone="tray.and.arrow.down" couleurIcone="var(--orange)" chevron href="#/grilles"
      titre=${aValider > 1 ? `${aValider} grilles reçues à valider` : '1 grille reçue à valider'} />`}
  <//>`;
}

/** Grilles reçues pour cette journée, pas encore validées. */
function grillesAValider(journee) {
  if (!journee.reference) return 0;
  return lire().grillesRecues.filter((g) => g.statut === 'aValider' && contenu(g)?.journee === journee.reference).length;
}

// MARK: - Paris

function ParisDeLaJournee({ journee }) {
  const paris = M.parisDeLaJournee(journee.id).filter((p) => p.statut !== 'rembourse');
  if (paris.length === 0) {
    return html`<${Section}>
      <${Vide} icone="ticket" titre="Aucun pari" texte="Les paris enregistrés sur cette journée apparaîtront ici." />
    <//>`;
  }
  const enCours = paris.filter((p) => p.statut === 'enCours');
  const regles = paris.filter((p) => p.statut === 'regle');
  const demanderReglement = async (pari) => {
    if (!(await demanderCode('Encaisser le pari'))) return;
    try { modifier(() => Caisse.regler(pari)); } catch { /* comme le try? du Swift */ }
  };
  return html`
    ${enCours.length > 0 && html`<${Section} titre=${`En cours (${enCours.length})`}>
      ${enCours.map((pari) => html`<${PariCarte} key=${pari.id} pariId=${pari.id} afficherJoueur afficherJournee=${false}
        onRegler=${() => demanderReglement(pari)} />`)}
    <//>`}
    ${regles.length > 0 && html`<${Section} titre=${`Réglés (${regles.length})`}>
      ${regles.map((pari) => html`<${PariCarte} key=${pari.id} pariId=${pari.id} afficherJoueur afficherJournee=${false} />`)}
    <//>`}`;
}

// MARK: - Lignes

/** Un match et ses trois cotes, comme une ligne de la feuille de saisie. `colonneResultat` : la
 *  place du résultat est gardée sur chaque ligne, pour que les cotes restent alignées. */
export function LigneGrille({ rencontre, onClick, colonneResultat }) {
  const issue = M.issueDuResultat(rencontre.resultat);
  return html`<button type="button" class="ligne jrn-ligne-grille" onClick=${onClick}>
    <${PastilleNumero} numero=${rencontre.ordre} />
    <span class="ligne-texte">
      <div class="ligne-unique jrn-equipe-grille gras">${M.nomDomicile(rencontre)}</div>
      <div class="ligne-unique jrn-equipe-grille secondaire">${M.nomExterieur(rencontre)}</div>
    </span>
    <span class="jrn-cotes-grille">
      ${M.ISSUES.map((i) => html`<span class="jrn-cote-grille" key=${i}>
        <span class="jrn-issue-grille">${i}</span>
        <span class=${issue === i ? 'chiffres gras vert' : 'chiffres'}>${enCote(M.cote(rencontre, i))}</span>
      </span>`)}
    </span>
    ${(rencontre.resultat || colonneResultat) && html`<span class=${`jrn-resultat-grille ${rencontre.resultat === 'A' ? 'orange' : 'vert'}`}>
      ${rencontre.resultat ? M.libelleResultat(rencontre.resultat) : ''}</span>`}
  </button>`;
}

/** Saisie du résultat d'un match : un appui sur l'issue gagnante, un second pour effacer. */
export function LigneResultat({ rencontre }) {
  const poser = (resultat) => modifier(() => {
    rencontre.resultat = resultat;
    reporterResultats(rencontre);
  });
  const annule = rencontre.resultat === 'A';
  const issue = M.issueDuResultat(rencontre.resultat);
  return html`<div class="ligne jrn-ligne-resultat">
    <div class="rangee">
      <${PastilleNumero} numero=${rencontre.ordre} />
      <span class="grandit gras jrn-equipe-grille jrn-deux-lignes">${M.intitule(rencontre)}</span>
      <span class=${annule ? 'jrn-menu-teinte orange' : 'jrn-menu-teinte secondaire'}>
        <${Menu} icone=${annule ? 'minus.circle' : 'ellipsis.circle'} titre="Résultat" items=${[
          { libelle: annule ? 'Rétablir le match' : 'Match annulé (cote 1)', icone: 'minus.circle',
            onClick: () => poser(annule ? null : 'A') },
          rencontre.resultat != null && { libelle: 'Effacer le résultat', icone: 'eraser', destructif: true,
            onClick: () => poser(null) },
        ]} />
      </span>
    </div>
    <div class="issues">
      ${M.ISSUES.map((i) => html`<${BoutonIssue} key=${i} issue=${i} cote=${M.cote(rencontre, i)} style="resultat"
        selectionne=${issue === i} onClick=${() => poser(rencontre.resultat === i ? null : i)} />`)}
    </div>
  </div>`;
}

/** Après un résultat posé, changé ou effacé : les rangs de sa compétition le suivent. À appeler
 *  dans `modifier`. */
function reporterResultats(rencontre) {
  const journee = M.journee(rencontre.journeeId);
  if (journee) suivreResultats(journee);
}

// MARK: - Titre et date

/** Le titre et la date d'une journée, à corriger après coup. Les grilles déjà envoyées aux joueurs
 *  restent valables : elles retrouvent la journée par sa référence, pas par son titre. */
function TitreJourneeSheet({ journee, onFermer }) {
  const [titre, setTitre] = useState(journee.titre);
  const [date, setDate] = useState(journee.date);
  const valide = titre.trim() !== '';
  const ok = () => {
    if (!valide) return;
    modifier(() => Caisse.renommerJournee(journee, titre, date));
    onFermer();
  };
  return html`<${Feuille} titre="Titre et date" onFermer=${onFermer} compacte
    droite=${{ libelle: 'OK', onClick: ok, desactive: !valide }}>
    <${Section} pied="Les grilles déjà envoyées aux joueurs restent valables.">
      <${ChampTexte} plein libelle="Titre" valeur=${titre} onInput=${setTitre} onEntree=${ok} autoFocus />
      <${ChampDate} libelle="Date" valeur=${date} onChange=${setDate} />
    <//>
  <//>`;
}

// MARK: - Style propre à la journée

injecterStyle('style-journee', `
.ligne.jrn-bloc { display: block; }
.jrn-petit-plus { font-size: 15px; }
.jrn-boutons-vide { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 8px; }
.jrn-entete-journee-detail { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }
.jrn-rangee-tuiles { display: grid; gap: 10px; }
.jrn-rangee-tuiles .tuile { min-height: 74px; }
.jrn-ligne-grille { gap: 10px; }
.jrn-equipe-grille { font-size: 15px; }
.jrn-deux-lignes { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.jrn-cotes-grille { display: flex; gap: 6px; flex: none; }
.jrn-cote-grille { width: 44px; display: flex; flex-direction: column; align-items: center; gap: 1px; font-size: 15px; }
.jrn-issue-grille { font-size: 11px; font-weight: 700; color: var(--texte-2); }
.jrn-resultat-grille { min-width: 26px; text-align: center; font-size: 12px; font-weight: 700; flex: none; }
.ligne.jrn-ligne-resultat { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.jrn-ligne-resultat > .rangee { gap: 10px; }
.jrn-ligne-resultat .issues { gap: 8px; }
.jrn-menu-teinte .bouton { color: inherit; }
.ligne.jrn-orange-ligne { color: var(--orange); }
@media (max-width: 380px) { .jrn-cote-grille { width: 38px; font-size: 14px; } }
`);
injecterStyle('style-jrs-avec-menus', `
.section.jrs-avec-menus > .liste { overflow: visible; }
.section.jrs-avec-menus > .liste > :first-child { border-top-left-radius: var(--rayon); border-top-right-radius: var(--rayon); }
.section.jrs-avec-menus > .liste > :last-child { border-bottom-left-radius: var(--rayon); border-bottom-right-radius: var(--rayon); }
.section.jrs-avec-menus > .liste > :first-child > .jrs-ligne-lien { border-top-left-radius: var(--rayon); }
.section.jrs-avec-menus > .liste > :last-child > .jrs-ligne-lien { border-bottom-left-radius: var(--rayon); }
`);

function injecterStyle(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}
