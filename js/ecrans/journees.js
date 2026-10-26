// La liste des grilles de matchs, de la plus récente à la plus ancienne, et la création d'une
// grille, vide ou reprise de la précédente. Repris de JourneesView.swift.

import { html, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import * as Exemple from '../exemple.js';
import { AUCUNE, ajouterALaGrille, journeeChoisie, journeesDe } from '../calendrier.js';
import { reglages } from '../reglages.js';
import { jour } from '../format.js';
import {
  BadgeStatutJournee, Bouton, ChampDate, ChampTexte, Choix, Ecran, Feuille, Icone, Ligne, Menu, Section, Vide,
} from '../ui/composants.js';
import { choisir, demanderCode, essayer } from '../ui/dialogues.js';

export function JourneesView() {
  useEtat();
  const journees = M.journeesTriees();
  const [creation, setCreation] = useState(false);

  const supprimer = async (journee) => {
    const enCours = M.parisDeLaJournee(journee.id).filter((p) => p.statut === 'enCours').length;
    const ok = await choisir({
      titre: 'Supprimer la journée ?',
      message: enCours > 0
        ? `Les ${enCours} paris pas encore réglés seront remboursés à leurs joueurs.`
        : "La grille et l'historique de ses paris disparaîtront. Les points déjà versés restent acquis.",
      boutons: [{ libelle: `Supprimer « ${journee.titre} »`, valeur: true, destructif: true }],
    });
    if (!ok || !(await demanderCode('Supprimer la journée'))) return;
    essayer(() => modifier(() => Caisse.supprimerJournee(journee)));
  };

  const actions = html`<${Bouton} variante="lien" icone="plus" titre="Nouvelle journée" onClick=${() => setCreation(true)} />`;

  return html`<${Ecran} titre="Journées" actions=${actions}>
    ${journees.length === 0
      ? html`<${Vide} icone="soccerball" titre="Aucune journée"
          texte="Créez la grille de la semaine : les matchs, leurs cotes 1 / N / 2, puis les résultats.">
          <div class="jrs-boutons-vide">
            <${Bouton} variante="principal" onClick=${() => setCreation(true)}>Nouvelle journée<//>
            <${Bouton} variante="lien" onClick=${() => modifier(() => Exemple.chargerJournee())}>Charger l'exemple du classeur<//>
          </div>
        <//>`
      : html`<${Section} classe="jrs-avec-menus">
          ${journees.map((journee) => html`<${LigneJournee} key=${journee.id} journee=${journee}
            onSupprimer=${() => supprimer(journee)} />`)}
        <//>`}
    ${creation && html`<${NouvelleJourneeSheet} onFermer=${() => setCreation(false)} />`}
  <//>`;
}

/** Une journée de la liste ; le menu (⋯) remplace le glissement et le menu contextuel d'iOS. */
function LigneJournee({ journee, onSupprimer }) {
  return html`<div class="ligne jrs-ligne-menu">
    <a class="jrs-ligne-lien" href=${`#/journee/${journee.id}`}>
      <span class="ligne-texte">
        <span class="rangee espace">
          <span class="ligne-titre gras">${journee.titre}</span>
          <${BadgeStatutJournee} statut=${journee.statut} />
        </span>
        <div class="ligne-sous-titre jrs-petit-plus">${jour(journee.date)}</div>
        <div class="tres-petit secondaire">${M.matchs(journee.id).length} matchs · ${M.nombreResultats(journee.id)} résultats · ${M.parisActifs(journee.id).length} paris</div>
      </span>
      <${Icone} nom="chevron.right" taille=${16} classe="chevron" />
    </a>
    <${Menu} icone="ellipsis" titre="Actions" items=${[
      { libelle: 'Supprimer…', icone: 'trash', destructif: true, onClick: onSupprimer },
    ]} />
  </div>`;
}

// MARK: - Nouvelle journée

/** D'où viennent les matchs de la nouvelle grille : « calendrier », « precedente », « exemple », « vide ». */
const PIEDS_DEPART = {
  calendrier: null,
  precedente: "Les équipes et les cotes sont recopiées sans les résultats : il ne reste qu'à corriger ce qui change.",
  exemple: "La grille R3 / D3 / R1 des classeurs d'origine.",
  vide: 'La grille démarre vide.',
};

/** Création d'une grille, vide ou reprise de la précédente. `onCreee(journeeId)` : facultatif. */
export function NouvelleJourneeSheet({ onFermer, onCreee }) {
  useEtat();
  const journees = M.journeesTriees();
  const avecCalendrier = M.championnatsTries().filter((c) => M.calendrierDe(c.id).length > 0);

  const [titre, setTitre] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString());
  const [depart, setDepart] = useState(() => (avecCalendrier.length > 0 ? 'calendrier'
    : (journees.length === 0 ? 'vide' : 'precedente')));
  // La journée choisie à la main pour une compétition ; les autres suivent la date de la grille.
  const [numeros, setNumeros] = useState({});

  const choisie = (competition) => journeeChoisie(numeros[competition.id], competition, date);
  const derniere = journees[0] ?? null;

  const options = [
    avecCalendrier.length > 0 && { valeur: 'calendrier', libelle: 'Ceux du calendrier' },
    derniere && { valeur: 'precedente', libelle: `Ceux de « ${derniere.titre} »` },
    { valeur: 'exemple', libelle: 'La grille du classeur' },
    { valeur: 'vide', libelle: 'Aucun' },
  ].filter(Boolean);

  const creer = () => {
    const nom = titre.trim() ? titre : `Journée ${journees.length + 1}`;
    const journee = essayer(() => modifier(() => {
      switch (depart) {
        case 'exemple':
          return Exemple.chargerJournee(nom, date);
        case 'precedente':
          return Caisse.nouvelleJournee({ titre: nom, date, modele: derniere });
        case 'calendrier': {
          const nouvelle = Caisse.nouvelleJournee({ titre: nom, date });
          for (const competition of avecCalendrier) {
            const aVenir = choisie(competition);
            if (!aVenir) continue;
            ajouterALaGrille(aVenir.restants, competition, nouvelle, reglages().margeCotes);
          }
          return nouvelle;
        }
        default:
          return Caisse.nouvelleJournee({ titre: nom, date });
      }
    }));
    onFermer();
    if (journee) onCreee?.(journee.id);
  };

  return html`<${Feuille} titre="Nouvelle journée" onFermer=${onFermer} droite=${{ libelle: 'Créer', onClick: creer }}>
    <${Section}>
      <${ChampTexte} plein libelle="Titre" placeholder=${`Journée ${journees.length + 1}`} valeur=${titre} onInput=${setTitre}
        onEntree=${creer} />
      <${ChampDate} libelle="Date" valeur=${date} onChange=${setDate} />
    <//>
    <${Section} titre="Matchs de départ" pied=${PIEDS_DEPART[depart]}>
      ${options.map((o) => html`<${Ligne} key=${o.valeur} titre=${o.libelle} onClick=${() => setDepart(o.valeur)}
        detail=${o.valeur === depart ? html`<span class="accent"><${Icone} nom="checkmark" taille=${18} /></span>` : ''} />`)}
    <//>
    ${depart === 'calendrier' && html`<${Section} titre="Journée de chaque compétition"
      pied="Proposée : la journée du calendrier à moins de 4 jours de la date, sinon la première qui a encore des matchs à mettre en grille. Les groupes n'en sont pas tous au même numéro : changez-la au besoin, ou « Aucune ». Cotes proposées d'après les rangs.">
      ${avecCalendrier.map((competition) => html`<${ChoixDeJournee} key=${competition.id} competition=${competition}
        valeur=${choisie(competition)?.numero ?? AUCUNE}
        onChange=${(numero) => setNumeros({ ...numeros, [competition.id]: numero })} />`)}
    <//>`}
  <//>`;
}

/** « R1 : J8 · 11 oct. » ; ✓ : tous ses matchs sont déjà passés dans une grille. */
function ChoixDeJournee({ competition, valeur, onChange }) {
  const options = [
    { valeur: AUCUNE, libelle: 'Aucune' },
    ...journeesDe(competition).map((j) => ({ valeur: j.numero, libelle: j.intitule + (j.restants.length ? '' : ' ✓') })),
  ];
  return html`<${Choix} libelle=${competition.nom} valeur=${valeur} options=${options} onChange=${onChange} />`;
}

// MARK: - Style propre aux listes de journées

injecterStyle('style-journees', `
.jrs-boutons-vide { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 8px; }
.jrs-petit-plus { font-size: 15px; }
.ligne.jrs-ligne-menu { padding: 0 6px 0 0; gap: 0; align-items: stretch; }
.jrs-ligne-menu > .jrs-ligne-lien { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 10px 8px 10px 16px;
  color: var(--texte); text-decoration: none; }
.jrs-ligne-menu > .jrs-ligne-lien:hover { background: var(--surface-3); }
.jrs-ligne-menu > .menu-ancre { align-self: center; }
.jrs-ligne-menu .ligne-texte > .rangee { gap: 8px; }
`);
// Une liste dont les lignes ont un menu (⋯) : le menu déborde de la liste au lieu d'y être coupé
// (.liste coupe ce qui dépasse, pour ses coins arrondis).
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
