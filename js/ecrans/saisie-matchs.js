// La « FEUILLE DE SAISIE MATCH » : tous les matchs de la journée et leurs cotes, d'un seul écran ;
// la fiche d'un match (équipes, cotes, résultat et score) ; le choix de sa compétition.
// Repris de SaisieMatchsView.swift.

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import { suivreResultats } from '../grille.js';
import { lireNombre, nombre } from '../format.js';
import { ChampNombre, ChampTexte, Feuille, Ligne, Menu, PastilleNumero, Section, Segment } from '../ui/composants.js';
import { alerte } from '../ui/dialogues.js';

export function SaisieMatchsView({ journeeId, onFermer }) {
  useEtat();
  const journee = M.journee(journeeId);
  if (!journee) return null;

  const supprimer = (rencontre) => {
    if (M.aDesParis(rencontre.id)) {
      alerte('Match déjà joué par des joueurs',
        "Des paris portent sur ce match : saisissez plutôt le résultat « Match annulé » (cote 1) dans l'onglet Résultats.");
    } else {
      modifier(() => Caisse.supprimerRencontre(rencontre));
    }
  };

  return html`<${Feuille} titre="Saisie des matchs" large onFermer=${onFermer} gauche=${null}
    droite=${{ libelle: 'Terminé', onClick: onFermer }}>
    <${Section} classe="jrs-avec-menus">
      ${M.matchs(journeeId).map((rencontre) => html`<${LigneSaisie} key=${rencontre.id} rencontre=${rencontre}
        onSupprimer=${() => supprimer(rencontre)} />`)}
      <${Ligne} action icone="plus.circle.fill" titre="Ajouter un match"
        onClick=${() => modifier(() => Caisse.ajouterRencontre(journee))} />
    <//>
  <//>`;
}

/** Une ligne de la feuille de saisie ; le menu (⋯) remplace le glissement et le menu contextuel. */
function LigneSaisie({ rencontre, onSupprimer }) {
  const changer = (cle) => (valeur) => modifier(() => { rencontre[cle] = valeur; });
  return html`<div class="ligne sai-ligne-saisie">
    <div class="sai-saisie-equipes">
      <${PastilleNumero} numero=${rencontre.ordre} />
      <${Saisie} classe="sai-saisie-categorie" placeholder="Cat." valeur=${rencontre.categorie} majuscules
        onInput=${changer('categorie')} />
      <${Saisie} placeholder="Domicile" valeur=${rencontre.domicile} majuscules onInput=${changer('domicile')} />
      <span class="sai-saisie-vs">VS</span>
      <${Saisie} placeholder="Extérieur" valeur=${rencontre.exterieur} majuscules onInput=${changer('exterieur')} />
    </div>
    <div class="sai-saisie-cotes">
      <${ChampCote} titre="1" valeur=${rencontre.cote1} onChange=${changer('cote1')} />
      <${ChampCote} titre="N" valeur=${rencontre.coteN} onChange=${changer('coteN')} />
      <${ChampCote} titre="2" valeur=${rencontre.cote2} onChange=${changer('cote2')} />
      <${Menu} icone="ellipsis" titre="Actions sur le match" items=${[
        { libelle: 'Supprimer le match', icone: 'trash', destructif: true, onClick: onSupprimer },
      ]} />
    </div>
  </div>`;
}

/** Un champ de la feuille de saisie, encadré. `majuscules` : noms d'équipes en capitales, comme
 *  dans le classeur. */
function Saisie({ valeur, onInput, placeholder, majuscules, classe }) {
  return html`<input type="text" class=${`entree sai-saisie ${classe ?? ''}`} value=${valeur ?? ''} placeholder=${placeholder}
    aria-label=${placeholder} autocomplete="off" autocorrect="off" spellcheck="false"
    autocapitalize=${majuscules ? 'characters' : 'off'}
    onInput=${(e) => onInput(majuscules ? e.currentTarget.value.toUpperCase() : e.currentTarget.value)} />`;
}

/** « 1 [ 3,9 ] » : une cote, jusqu'à deux décimales. Le texte tapé reste tel quel pendant la saisie. */
function ChampCote({ titre, valeur, onChange }) {
  const [texte, setTexte] = useState(nombre(valeur));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTexte(nombre(valeur)); }, [valeur, focus]);
  return html`<label class="sai-saisie-cote">
    <span class="sai-saisie-issue">${titre}</span>
    <input type="text" class="entree sai-saisie chiffres" inputmode="decimal" value=${texte} aria-label=${`Cote ${titre}`}
      onFocus=${(e) => { setFocus(true); e.currentTarget.select(); }}
      onBlur=${() => setFocus(false)}
      onInput=${(e) => {
        const t = e.currentTarget.value;
        setTexte(t);
        const n = lireNombre(t);
        if (n != null) onChange(n);
      }} />
  </label>`;
}

// MARK: - Fiche d'un match

const CHOIX_RESULTAT = [
  { valeur: null, libelle: '—' },
  ...M.RESULTATS.map((r) => ({ valeur: r, libelle: M.libelleResultat(r) })),
];

/** Fiche d'un match : équipes, cotes, résultat et score. */
export function RencontreEditeur({ rencontreId, onFermer }) {
  useEtat();
  const rencontre = M.rencontre(rencontreId);
  // Un score qui ne s'accorde plus avec le résultat (changé depuis) n'a plus cours.
  const perime = (r) => r.score != null && M.scoreRetenu(r) == null;
  const [scoreTape, setScoreTape] = useState(() => (rencontre && !perime(rencontre) ? rencontre.score ?? '' : ''));
  useEffect(() => {
    if (rencontre && perime(rencontre)) modifier(() => { rencontre.score = null; reporterResultats(rencontre); });
  }, []);
  if (!rencontre) return null;

  const changer = (cle) => (valeur) => modifier(() => { rencontre[cle] = valeur; });
  const aDesParis = M.aDesParis(rencontre.id);

  const choisirResultat = (nouveau) => {
    let retire = false;
    modifier(() => {
      rencontre.resultat = nouveau;
      // Un score qui ne s'accorde plus avec le résultat est retiré.
      if (perime(rencontre)) {
        rencontre.score = null;
        retire = true;
      }
      reporterResultats(rencontre);
    });
    if (retire) setScoreTape('');
  };

  /** Un score complet (« 2-1 ») fixe le résultat ; un champ vidé retire le score. Un score en cours
   *  de frappe (« 2- ») ne change rien. */
  const poserLeScore = (texte) => {
    setScoreTape(texte);
    if (!texte.trim()) {
      modifier(() => { rencontre.score = null; reporterResultats(rencontre); });
      return;
    }
    const b = M.buts(texte);
    if (!b) return;
    modifier(() => {
      rencontre.score = `${b.domicile}-${b.exterieur}`;
      rencontre.resultat = b.domicile > b.exterieur ? '1' : (b.domicile === b.exterieur ? 'N' : '2');
      reporterResultats(rencontre);
    });
  };

  const supprimer = () => {
    // La feuille se ferme d'abord : elle ne doit plus lire un match supprimé.
    onFermer();
    modifier(() => Caisse.supprimerRencontre(rencontre));
  };

  return html`<${Feuille} titre=${M.intitule(rencontre)} onFermer=${onFermer} gauche=${null}
    droite=${{ libelle: 'OK', onClick: onFermer }}>
    <${Section} titre=${`Match n° ${rencontre.ordre}`} classe="jrs-avec-menus">
      <${ChoixCompetition} valeur=${rencontre.categorie} onChange=${changer('categorie')} />
      <${ChampTexte} plein majuscules libelle="Équipe à domicile" valeur=${rencontre.domicile} onInput=${changer('domicile')} />
      <${ChampTexte} plein majuscules libelle="Équipe à l'extérieur" valeur=${rencontre.exterieur} onInput=${changer('exterieur')} />
    <//>

    <${Section} titre="Cotes"
      pied=${aDesParis ? 'Les paris déjà enregistrés gardent la cote du moment où ils ont été pris.' : null}>
      <${ChampNombre} libelle=${`1 · ${M.nomDomicile(rencontre)}`} valeur=${rencontre.cote1} largeur=${90} onChange=${changer('cote1')} />
      <${ChampNombre} libelle="N · Match nul" valeur=${rencontre.coteN} largeur=${90} onChange=${changer('coteN')} />
      <${ChampNombre} libelle=${`2 · ${M.nomExterieur(rencontre)}`} valeur=${rencontre.cote2} largeur=${90} onChange=${changer('cote2')} />
    <//>

    <${Section} titre="Résultat" pied="Le score est facultatif : il fixe le résultat, et les buts des deux équipes le suivent.">
      <div class="ligne"><${Segment} classe="grandit" options=${CHOIX_RESULTAT} valeur=${rencontre.resultat ?? null}
        onChange=${choisirResultat} /></div>
      <label class="champ plein">
        <input type="text" value=${scoreTape} placeholder="Score, par exemple 2-1" aria-label="Score"
          inputmode="text" autocomplete="off" autocorrect="off" spellcheck="false"
          onInput=${(e) => poserLeScore(e.currentTarget.value)} />
      </label>
    <//>

    ${!aDesParis && html`<${Section}>
      <${Ligne} destructif titre="Supprimer le match" onClick=${supprimer} />
    <//>`}
  <//>`;
}

/** Après un résultat ou un score posé, changé ou effacé : les rangs de sa compétition le suivent
 *  (comme le onChange de JourneeDetailView.swift). À appeler dans `modifier`. */
function reporterResultats(rencontre) {
  const journee = M.journee(rencontre.journeeId);
  if (journee) suivreResultats(journee);
}

// MARK: - Compétition d'un match

/** La compétition d'un match : tapée, ou choisie parmi celles de l'onglet Compétitions. */
export function ChoixCompetition({ valeur, onChange }) {
  useEtat();
  const competitions = M.championnatsTries();
  return html`<div class="champ plein sai-choix-competition">
    <input type="text" value=${valeur ?? ''} placeholder="Compétition (R3, Coupe du bar…)" aria-label="Compétition"
      autocomplete="off" autocorrect="off" spellcheck="false" onInput=${(e) => onChange(e.currentTarget.value)} />
    ${competitions.length > 0 && html`<${Menu} icone="list.bullet.circle" titre="Choisir la compétition"
      items=${competitions.map((c) => ({ libelle: c.nom, onClick: () => onChange(c.nom) }))} />`}
  </div>`;
}

// MARK: - Style propre à la saisie

injecterStyle('style-saisie-matchs', `
.ligne.sai-bloc { display: block; }
.ligne.sai-ligne-saisie { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding-top: 12px; padding-bottom: 12px; }
.sai-saisie-equipes { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sai-saisie-equipes .sai-saisie { flex: 1; min-width: 0; }
.sai-saisie-equipes .sai-saisie-categorie { flex: none; width: 64px; }
.entree.sai-saisie { min-height: 36px; padding: 6px 9px; border-radius: 8px; font-size: 15px; background: var(--surface); }
.entree.sai-saisie::placeholder { color: var(--texte-3); text-transform: none; }
.sai-saisie-vs { font-size: 12px; font-weight: 700; color: var(--texte-2); flex: none; }
.sai-saisie-cotes { display: flex; align-items: center; gap: 12px; padding-left: 34px; }
.sai-saisie-cote { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; max-width: 94px; }
.sai-saisie-cote .sai-saisie { width: 100%; text-align: right; }
.sai-saisie-issue { width: 14px; font-size: 15px; font-weight: 800; flex: none; text-align: center; }
.sai-saisie-cotes > .menu-ancre { margin-left: auto; }
.sai-choix-competition > input { flex: 1; }
@media (max-width: 480px) {
  .ligne.sai-ligne-saisie { padding-left: 12px; padding-right: 10px; }
  .sai-saisie-equipes { gap: 6px; }
  .entree.sai-saisie { font-size: 14px; padding: 6px 7px; }
  .sai-saisie-equipes .sai-saisie-categorie { width: 54px; }
  .sai-saisie-cotes { gap: 8px; padding-left: 32px; }
}
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
