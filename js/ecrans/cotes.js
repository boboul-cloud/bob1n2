// La mise en place des cotes d'une journée : proposées d'après les classements, puis ajustées
// d'un appui sur − ou +, avec la marge de chaque match sous les yeux. Repris de CotesView.swift.

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import { Cotes, Equipes, pointsLigne, rangsClassement } from '../calcul.js';
import { proposerCotes } from '../grille.js';
import { reglages } from '../reglages.js';
import { enCote, lireNombre } from '../format.js';
import { Bouton, Feuille, Icone, Ligne, PastilleNumero, Section } from '../ui/composants.js';
import { alerte, choisir } from '../ui/dialogues.js';

const pourcentage = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

export function CotesView({ journeeId, onFermer }) {
  useEtat();
  const journee = M.journee(journeeId);
  if (!journee) return null;
  const marge = reglages().margeCotes;
  const matchs = M.matchs(journeeId);
  const sansCompetition = M.championnatsTries().length === 0;

  // Le pas de la marge : 5 %, entre 0 et 80 %.
  const changerMarge = (pas) => modifier((e) => {
    const valeur = Math.round((e.reglages.margeCotes + pas) * 100) / 100;
    e.reglages.margeCotes = Math.min(0.8, Math.max(0, valeur));
  });

  const proposerTout = () => {
    const inconnus = modifier(() => {
      const championnats = M.championnatsAvecLignes();
      let n = 0;
      for (const rencontre of M.matchs(journeeId)) {
        if (!proposerCotes(rencontre, reglages().margeCotes, championnats)) n += 1;
      }
      return n;
    });
    if (inconnus > 0) {
      alerte('Cotes proposées', inconnus > 1
        ? `${inconnus} matchs opposent des équipes sans rang connu : leurs cotes sont celles d'un match équilibré, à ajuster.`
        : "Un match oppose des équipes sans rang connu : ses cotes sont celles d'un match équilibré, à ajuster.");
    }
  };

  const demanderTout = async () => {
    const ok = await choisir({
      titre: `Remplacer les cotes des ${matchs.length} matchs ?`,
      message: 'Les paris déjà enregistrés gardent la cote du moment où ils ont été pris.',
      boutons: [{ libelle: 'Proposer toutes les cotes', valeur: true }],
    });
    if (ok) proposerTout();
  };

  return html`<${Feuille} titre=${`Cotes · ${journee.titre}`} large onFermer=${onFermer} gauche=${null}
    droite=${{ libelle: 'Terminé', onClick: onFermer }}>
    <${Section} pied=${sansCompetition
      ? "Sans les rangs des équipes, les cotes proposées sont celles d'un match équilibré. Importez le calendrier de la compétition, ou collez le tableau de ses équipes : leurs résultats servent alors aux cotes."
      : "Les cotes proposées tiennent compte des points et de la différence de buts de chaque équipe, par match joué, et de l'avantage du terrain. Plus la marge est haute, plus les cotes sont basses."}>
      <div class="champ">
        <span class="champ-libelle">Marge des cotes proposées</span>
        <span class="secondaire chiffres">${pourcentage.format(marge)}</span>
        <span class="pas-a-pas">
          <button type="button" aria-label="Baisser la marge" disabled=${marge <= 0} onClick=${() => changerMarge(-0.05)}>
            <${Icone} nom="minus" taille=${16} /></button>
          <button type="button" aria-label="Monter la marge" disabled=${marge >= 0.8} onClick=${() => changerMarge(0.05)}>
            <${Icone} nom="plus" taille=${16} /></button>
        </span>
      </div>
      <${Ligne} action icone="wand.and.stars" titre="Proposer toutes les cotes" desactive=${matchs.length === 0}
        onClick=${demanderTout} />
    <//>

    ${matchs.length === 0 && html`<${Section}>
      <div class="ligne secondaire">Aucun match dans cette journée.</div>
    <//>`}

    ${M.groupes(journeeId).map((groupe) => html`<${Section} key=${groupe.id} titre=${groupe.titre}>
      ${groupe.rencontres.map((rencontre) => html`<${LigneCotes} key=${rencontre.id} rencontre=${rencontre}
        onProposer=${() => modifier(() => proposerCotes(rencontre, reglages().margeCotes))} />`)}
    <//>`)}
  <//>`;
}

function LigneCotes({ rencontre, onProposer }) {
  const marge = Cotes.marge(rencontre.cote1, rencontre.coteN, rencontre.cote2);
  const changer = (cle) => (valeur) => modifier(() => { rencontre[cle] = valeur; });
  return html`<div class="ligne cot-ligne-cotes">
    <div class="rangee cot-entete-cotes">
      <${PastilleNumero} numero=${rencontre.ordre} />
      <div class="grandit">
        <${EquipeCotes} nom=${M.nomDomicile(rencontre)} brut=${rencontre.domicile} categorie=${rencontre.categorie} />
        <${EquipeCotes} nom=${M.nomExterieur(rencontre)} brut=${rencontre.exterieur} categorie=${rencontre.categorie} />
      </div>
      <div class="cot-proposer-cotes">
        <${Bouton} taille="petit" icone="wand.and.stars" onClick=${onProposer}>Proposer<//>
        <span class=${`tres-petit chiffres ${marge < 0.05 ? 'rouge' : 'secondaire'}`}>marge ${pourcentage.format(marge)}</span>
      </div>
    </div>
    <div class="cot-reglages-cotes">
      <${ReglageCote} issue="1" cote=${rencontre.cote1} onChange=${changer('cote1')} />
      <${ReglageCote} issue="N" cote=${rencontre.coteN} onChange=${changer('coteN')} />
      <${ReglageCote} issue="2" cote=${rencontre.cote2} onChange=${changer('cote2')} />
    </div>
  </div>`;
}

/** Le nom d'une équipe et, si elle est au classement de sa compétition, son rang et ses points. */
function EquipeCotes({ nom, brut, categorie }) {
  const ligne = Equipes.ligne(brut, categorie, M.championnatsAvecLignes());
  let rang = null;
  if (ligne) {
    const classement = M.classementDe(ligne.championnatId);
    const index = classement.findIndex((l) => l.id === ligne.id);
    if (index >= 0) rang = rangsClassement(classement)[index];
  }
  return html`<div class="rangee cot-equipe-cotes">
    <span class="gras ligne-unique">${nom}</span>
    ${rang != null && html`<span class="tres-petit secondaire cot-nowrap">${rang === 1 ? '1er' : `${rang}e`} · ${pointsLigne(ligne)} pts</span>`}
  </div>`;
}

/** Une cote et ses boutons − / + (au dixième). On peut aussi la taper directement. */
export function ReglageCote({ issue, cote, onChange }) {
  const [texte, setTexte] = useState(enCote(cote));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTexte(enCote(cote)); }, [cote, focus]);
  return html`<div class="cot-reglage-cote">
    <span class="cot-issue-cote">${issue}</span>
    <div class="cot-reglage-cote-boutons">
      <button type="button" aria-label=${`Baisser la cote ${issue}`}
        onClick=${() => onChange(Math.max(Cotes.coteMinimum, Math.round((cote - 0.1) * 10) / 10))}>
        <${Icone} nom="minus" taille=${16} /></button>
      <input type="text" inputmode="decimal" class="chiffres" value=${texte} aria-label=${`Cote ${issue}`}
        onFocus=${(e) => { setFocus(true); e.currentTarget.select(); }}
        onBlur=${() => setFocus(false)}
        onInput=${(e) => {
          const t = e.currentTarget.value;
          setTexte(t);
          const n = lireNombre(t);
          if (n != null) onChange(n);
        }} />
      <button type="button" aria-label=${`Monter la cote ${issue}`}
        onClick=${() => onChange(Math.min(Cotes.coteMaximum * 2, Math.round((cote + 0.1) * 10) / 10))}>
        <${Icone} nom="plus" taille=${16} /></button>
    </div>
  </div>`;
}

// MARK: - Style propre aux cotes

injecterStyle('style-cotes', `
.ligne.cot-bloc { display: block; }
.ligne.cot-ligne-cotes { display: flex; flex-direction: column; align-items: stretch; gap: 10px; padding-top: 12px; padding-bottom: 12px; }
.cot-entete-cotes { align-items: flex-start; }
.cot-entete-cotes .pastille { margin-top: 1px; }
.cot-equipe-cotes { gap: 4px; font-size: 15px; min-width: 0; }
.cot-equipe-cotes + .cot-equipe-cotes { margin-top: 2px; }
.cot-nowrap { white-space: nowrap; }
.cot-proposer-cotes { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
.cot-reglages-cotes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cot-reglage-cote { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
.cot-issue-cote { font-size: 12px; font-weight: 800; color: var(--texte-2); }
.cot-reglage-cote-boutons { display: flex; align-items: center; width: 100%; border-radius: 9px; background: var(--surface-3); }
.cot-reglage-cote-boutons button { flex: none; width: 30px; height: 36px; border: 0; background: none; color: var(--accent);
  display: grid; place-items: center; }
.cot-reglage-cote-boutons input { flex: 1; min-width: 0; width: 100%; border: 0; background: none; outline: none;
  text-align: center; font-weight: 700; font-size: 16px; padding: 6px 0; color: var(--texte); }
`);

function injecterStyle(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}
