// Le classeur MULTI : de MULTI-3 à GOLIATH-8, les combinaisons « k sur n », leurs mises et leurs
// gains, avant et après les résultats (macros « Jouez » et « resultat »). Repris de CalculateurView.swift.
//
// Rien n'est enregistré : comme dans l'app, le calculateur repart de son exemple à chaque ouverture.
// Le balayage pour supprimer un match devient une corbeille sur sa ligne ; les menus imbriqués
// « Depuis une journée » deviennent une feuille (journée, puis match et issue).

import { html, useState } from '../../vendor/preact-htm.js';
import { useEtat } from '../store.js';
import * as M from '../modele.js';
import { Calcul, ETATS_PRONOSTIC } from '../calcul.js';
import { enCote, lireNombre, nombre } from '../format.js';
import {
  Bouton, BoutonIssue, ChampNombre, Choix, Ecran, Feuille, Icone, IconeEtat, Interrupteur, Ligne, Section, Vide,
} from '../ui/composants.js';

const MAXIMUM = 8;
const ETATS = ['enAttente', 'gagne', 'perdu', 'annule'];

let prochainId = 1;
const nouvelleLigne = (libelle, cote, etat = 'enAttente') => ({ id: prochainId++, libelle, cote, etat });

/** 2, 3, …, n */
const deDeuxA = (n) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 2);

/** Quand la formule couvrait tout (le Multi complet), elle s'étend au match ajouté. */
export function ajusterNiveauxCalculateur(niveaux, n, ajout = false) {
  let tailles = [...new Set(niveaux)];
  const precedent = deDeuxA(n - 1);
  if (ajout && n >= 3 && tailles.length === precedent.length && precedent.every((k) => tailles.includes(k))) {
    tailles.push(n);
  }
  tailles = tailles.filter((k) => k <= n);
  if (!tailles.length && n >= 2) tailles = deDeuxA(n);
  return tailles.sort((a, b) => a - b);
}

export function CalculateurView() {
  useEtat();
  const [lignes, setLignes] = useState(() => [
    nouvelleLigne('Match 1', 1.8),
    nouvelleLigne('Match 2', 2.1),
    nouvelleLigne('Match 3', 1.6),
    nouvelleLigne('Match 4', 2.4),
  ]);
  const [niveaux, setNiveaux] = useState([2, 3, 4]);
  const [mise, setMise] = useState(1);
  const [depuisJournee, setDepuisJournee] = useState(false);

  const n = lignes.length;
  const journees = M.journeesTriees();
  const lignesCalcul = lignes.map((l) => ({ cote: l.cote, etat: l.etat }));
  const niveauxValides = niveaux.filter((k) => k >= 2 && k <= n).sort((a, b) => a - b);
  const detail = Calcul.detail(lignesCalcul, niveauxValides, mise);
  const evaluation = Calcul.evaluer(lignesCalcul, niveauxValides, mise);

  const changer = (id, champs) => setLignes(lignes.map((l) => (l.id === id ? { ...l, ...champs } : l)));
  const ajouterLigne = (ligne) => {
    const suivantes = [...lignes, ligne];
    setLignes(suivantes);
    setNiveaux(ajusterNiveauxCalculateur(niveaux, suivantes.length, true));
  };
  const supprimer = (id) => {
    const suivantes = lignes.filter((l) => l.id !== id);
    setLignes(suivantes);
    setNiveaux(ajusterNiveauxCalculateur(niveaux, suivantes.length));
  };
  const basculerNiveau = (taille, coche) => {
    setNiveaux(coche ? [...new Set([...niveaux, taille])].sort((a, b) => a - b) : niveaux.filter((k) => k !== taille));
  };

  /** Reprend une cote de la grille, avec son résultat s'il est connu. */
  const ajouterDepuis = (rencontre, issue) => {
    let etat = 'enAttente';
    if (rencontre.resultat != null) {
      const gagnante = M.issueDuResultat(rencontre.resultat);
      etat = gagnante ? (gagnante === issue ? 'gagne' : 'perdu') : 'annule';
    }
    ajouterLigne(nouvelleLigne(`${M.intitule(rencontre)} · ${issue}`, M.cote(rencontre, issue), etat));
  };

  return html`<${Ecran} titre="Calculateur Multi">
    <${Section} titre=${`Pronostics (${n} / ${MAXIMUM})`}
      pied="Passez chaque match en « Gagné », « Perdu » ou « Annulé » pour voir ce que rapporte le système une fois les résultats connus.">
      ${lignes.map((ligne) => html`<div key=${ligne.id} class="calc-ligne">
        <div class="calc-haut">
          <input class="calc-libelle" type="text" value=${ligne.libelle} placeholder="Match" aria-label="Match"
            onInput=${(e) => changer(ligne.id, { libelle: e.currentTarget.value })} />
          <${Bouton} variante="lien" classe="destructif calc-supprimer" icone="trash" titre="Supprimer"
            onClick=${() => supprimer(ligne.id)} />
        </div>
        <div class="calc-bas">
          <span class="secondaire">Cote</span>
          <${EntreeNombre} valeur=${ligne.cote} onChange=${(cote) => changer(ligne.id, { cote })} libelle="Cote" />
          <span class="grandit"></span>
          <${IconeEtat} etat=${ligne.etat} />
          <label class="calc-etat">
            <select aria-label="Résultat" value=${ligne.etat} onChange=${(e) => changer(ligne.id, { etat: e.currentTarget.value })}>
              ${ETATS.map((etat) => html`<option value=${etat} selected=${etat === ligne.etat}>${ETATS_PRONOSTIC[etat].libelle}</option>`)}
            </select>
            <${Icone} nom="chevron.down" taille=${14} />
          </label>
        </div>
      </div>`)}
      <div class="ligne calc-boutons">
        <${Bouton} variante="lien" icone="plus.circle.fill" desactive=${n >= MAXIMUM}
          onClick=${() => ajouterLigne(nouvelleLigne(`Match ${n + 1}`, 2))}>Ajouter un match<//>
        <span class="grandit"></span>
        <${Bouton} variante="lien" icone="soccerball" desactive=${journees.length === 0 || n >= MAXIMUM}
          onClick=${() => setDepuisJournee(true)}>Depuis une journée<//>
      </div>
    <//>

    ${n >= 2 && html`
      <${Section} titre=${`Formule · ${Calcul.nomSysteme(n, niveauxValides)}`}>
        ${deDeuxA(n).map((taille) => html`<${Interrupteur} key=${taille} valeur=${niveaux.includes(taille)}
          onChange=${(coche) => basculerNiveau(taille, coche)}
          libelle=${html`<span class="calc-taille"><span>${taille} sur ${n}</span>
            <span class="secondaire chiffres">${Calcul.combinaisons(n, taille)} combinaisons</span></span>`} />`)}
        <${ChampNombre} libelle="Mise par combinaison" valeur=${mise} onChange=${setMise} />
      <//>

      <${Section} titre="Gains">
        <div class="defilement-x">
          <table class="tableau calc-gains">
            <thead><tr><th></th><th>Comb.</th><th>Mise</th><th>Maximum</th><th>Acquis</th></tr></thead>
            <tbody>
              ${detail.map((niveau) => html`<tr key=${niveau.taille}>
                <td class="gras">${niveau.taille} sur ${n}</td>
                <td>${niveau.combinaisons}</td>
                <td>${nombre(niveau.combinaisons * mise)}</td>
                <td>${nombre(niveau.gainMaximum)}</td>
                <td class=${niveau.gainAcquis > 0 ? 'vert' : 'secondaire'}>${nombre(niveau.gainAcquis)}</td>
              </tr>`)}
              <tr class="calc-total">
                <td class="tres-gras">Total</td>
                <td>${evaluation.combinaisons}</td>
                <td>${nombre(evaluation.combinaisons * mise)}</td>
                <td>${nombre(evaluation.gainMaximum)}</td>
                <td class=${evaluation.gainAcquis > 0 ? 'vert' : 'secondaire'}>${nombre(evaluation.gainAcquis)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      <//>`}

    <${Section}>
      <${Ligne} action titre="Remettre les résultats en attente"
        onClick=${() => setLignes(lignes.map((l) => ({ ...l, etat: 'enAttente' })))} />
      <${Ligne} destructif titre="Vider" onClick=${() => { setLignes([]); setNiveaux([]); }} />
    <//>

    ${depuisJournee && html`<${DepuisJournee} journees=${journees.slice(0, 4)}
      onChoisir=${(rencontre, issue) => { ajouterDepuis(rencontre, issue); setDepuisJournee(false); }}
      onFermer=${() => setDepuisJournee(false)} />`}
  <//>`;
}

/** Les quatre dernières journées : on choisit la journée, puis l'issue d'un match (avec sa cote). */
function DepuisJournee({ journees, onChoisir, onFermer }) {
  const [journeeId, setJourneeId] = useState(journees[0]?.id ?? null);
  const journee = journees.find((j) => j.id === journeeId) ?? journees[0];
  const matchs = journee ? M.matchs(journee.id) : [];
  return html`<${Feuille} titre="Depuis une journée" onFermer=${onFermer}>
    <${Section}>
      <${Choix} libelle="Journée" valeur=${journee?.id ?? null} onChange=${setJourneeId}
        options=${journees.map((j) => ({ valeur: j.id, libelle: j.titre }))} />
    <//>
    ${matchs.length === 0
      ? html`<${Vide} icone="soccerball" titre="Aucun match" texte="Cette journée n'a pas encore de matchs." />`
      : html`<${Section} titre="Matchs">
        ${matchs.map((r) => html`<div key=${r.id} class="calc-match">
          <div class="calc-match-titre">${r.ordre}. ${M.intitule(r)}</div>
          <div class="issues">
            ${M.ISSUES.map((issue) => html`<${BoutonIssue} key=${issue} issue=${issue} cote=${M.cote(r, issue)}
              onClick=${() => onChoisir(r, issue)} />`)}
          </div>
        </div>`)}
      <//>`}
  <//>`;
}

/** Un nombre à virgule dans une ligne (la cote) : le texte tapé est gardé pendant la saisie. */
function EntreeNombre({ valeur, onChange, libelle }) {
  const [texte, setTexte] = useState(null);
  const affiche = (x) => (x == null ? '' : nombre(x));
  return html`<input class="entree chiffres calc-cote" type="text" inputmode="decimal" aria-label=${libelle}
    value=${texte ?? affiche(valeur)}
    onFocus=${(e) => { setTexte(affiche(valeur)); e.currentTarget.select(); }}
    onInput=${(e) => { const t = e.currentTarget.value; setTexte(t); const x = lireNombre(t); if (x != null) onChange(x); }}
    onBlur=${() => setTexte(null)}
    onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />`;
}

// MARK: - Apparence (classes propres au calculateur : calc-…)

const STYLE = `
.calc-ligne { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 8px 8px 10px 16px; }
.liste > * + .calc-ligne::before, .liste > * + .calc-boutons::before {
  content: ""; position: absolute; top: 0; right: 0; left: 16px; border-top: 0.5px solid var(--separateur);
}
.calc-haut { display: flex; align-items: center; gap: 6px; }
.calc-libelle {
  flex: 1; min-width: 0; padding: 4px 0; border: 0; outline: none; background: none;
  font-size: 15px; font-weight: 600; color: var(--texte);
}
.calc-libelle::placeholder { color: var(--texte-3); font-weight: 500; }
.calc-supprimer { padding: 4px 8px; min-height: 30px; }
.calc-bas { display: flex; align-items: center; gap: 8px; padding-right: 8px; }
.calc-cote { width: 76px; min-height: 34px; padding: 5px 10px; text-align: right; }
.calc-etat { position: relative; display: inline-flex; align-items: center; color: var(--texte-2); }
.calc-etat select {
  appearance: none; -webkit-appearance: none; border: 0; background: none; cursor: pointer;
  padding: 6px 20px 6px 2px; color: var(--texte); font-size: 15px;
}
.calc-etat .icone { position: absolute; right: 0; pointer-events: none; }
.calc-boutons { flex-wrap: wrap; gap: 4px; padding-left: 8px; padding-right: 8px; }
.calc-taille { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding-right: 12px; }
.calc-gains td:first-child, .calc-gains th:first-child { text-align: left; }
.calc-gains .calc-total td { border-top: 1px solid var(--texte-3); font-weight: 600; }
.calc-match { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 10px 16px 12px; }
.liste > * + .calc-match::before {
  content: ""; position: absolute; top: 0; right: 0; left: 16px; border-top: 0.5px solid var(--separateur);
}
.calc-match-titre { font-size: 15px; font-weight: 600; }
`;

if (typeof document !== 'undefined' && !document.getElementById('style-calculateur')) {
  const style = document.createElement('style');
  style.id = 'style-calculateur';
  style.textContent = STYLE;
  document.head.append(style);
}
