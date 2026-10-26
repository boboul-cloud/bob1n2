// Un ticket de pari : les matchs choisis, leur état, la cote et le gain. Repris de PariCarte.swift.
//
// La carte se pose comme une ligne dans une Section (liste groupée) :
//   <${Section} titre="En cours">${paris.map((p) => html`<${PariCarte} key=${p.id} pariId=${p.id}
//     afficherJoueur afficherJournee=${false} onRegler=${() => …} />`)}<//>
// `onRegler` et `onRembourser` (facultatifs) ne reçoivent rien : l'appelant sait de quel pari il
// s'agit et demande lui-même le code barman s'il le faut. « Ticket » imprime le ticket du pari (la
// fenêtre d'impression du navigateur l'enregistre aussi en PDF, à la place du partage du PDF).

import { html } from '../../vendor/preact-htm.js';
import { useEtat } from '../store.js';
import * as M from '../modele.js';
import { Calcul } from '../calcul.js';
import { enCote, enPoints, heure, nombre } from '../format.js';
import { Badge, Bouton, IconeEtat } from '../ui/composants.js';
import { imprimerTicket } from './imprimables.js';

export function PariCarte({ pariId, afficherJoueur = false, afficherJournee = true, onRegler, onRembourser }) {
  useEtat();
  const pari = M.pari(pariId);
  if (!pari) return null;
  const evaluation = M.evaluation(pari);
  const pronostics = M.pronosticsDuPari(pari.id);
  const enCours = pari.statut === 'enCours';

  return html`<div class="pari-carte">
    <div class="pc-entete">
      <div class="grandit">
        <div class="pc-titre">${titre(pari, afficherJoueur, afficherJournee)}</div>
        <div class="pc-formule">${M.descriptionFormule(pari)}</div>
      </div>
      ${badge(pari, evaluation)}
    </div>

    <div class="pc-pronostics">
      ${pronostics.map((p) => html`<div key=${p.id} class="pc-pronostic">
        <span class="pc-etat"><${IconeEtat} etat=${M.etatPronostic(p)} /></span>
        <span class="pc-match">${M.libelleMatch(p)}</span>
        <span class="pc-issue">${p.issue}</span>
        <span class="pc-cote">${enCote(p.cote)}</span>
      </div>`)}
    </div>

    <div class="pc-valeurs">
      ${valeur('Mise', mise(pari, pronostics.length))}
      ${valeur(evaluation.combinaisons > 1 ? 'Total des cotes' : 'Cote', enCote(evaluation.coteTotale))}
      ${gain(pari, evaluation)}
    </div>

    <div class="pc-actions">
      ${enCours && onRegler && evaluation.termine && html`<${Bouton} variante="principal" icone="banknote"
        classe=${evaluation.gainAcquis > 0 ? 'pc-encaisser' : 'pc-clore'} onClick=${() => onRegler()}>
        ${evaluation.gainAcquis > 0 ? `Encaisser ${enPoints(evaluation.gainAcquis)}` : 'Clore le pari perdu'}<//>`}
      ${enCours && onRembourser && html`<${Bouton} variante="lien" classe="destructif" icone="arrow.uturn.backward"
        onClick=${() => onRembourser()}>Rembourser<//>`}
      <span class="grandit"></span>
      <${Bouton} variante="lien" taille="petit" icone="printer" classe="pc-ticket"
        titre="Imprimer le ticket de pari" onClick=${() => imprimerTicket(pari.id)}>Ticket<//>
    </div>
  </div>`;
}

/** « Joueur · Journée », l'un des deux, ou l'heure du pari si l'on n'affiche ni l'un ni l'autre. */
function titre(pari, afficherJoueur, afficherJournee) {
  const morceaux = [];
  if (afficherJoueur) {
    const joueur = M.joueur(pari.joueurId);
    morceaux.push(joueur ? M.nomComplet(joueur) : 'Joueur supprimé');
  }
  if (afficherJournee) morceaux.push(M.journee(pari.journeeId)?.titre ?? 'Journée supprimée');
  return morceaux.length ? morceaux.join(' · ') : heure(pari.dateCreation);
}

/** « 1 × 26 = 26 pts » pour un système, la mise tout court sinon. */
function mise(pari, nombreDePronostics) {
  const combinaisons = Calcul.nombreDeCombinaisons(nombreDePronostics, pari.formule === 'systeme' ? pari.niveaux : null);
  if (combinaisons > 1) return `${nombre(pari.miseUnitaire)} × ${combinaisons} = ${enPoints(pari.miseTotale)}`;
  return enPoints(pari.miseTotale);
}

function valeur(titre, texte, couleur = '') {
  return html`<div class=${`pc-valeur ${couleur}`}>
    <div class="pc-valeur-titre">${titre}</div>
    <div class="pc-valeur-texte">${texte}</div>
  </div>`;
}

function gain(pari, evaluation) {
  switch (pari.statut) {
    case 'regle':
      return valeur('Gain encaissé', enPoints(pari.gainRegle), pari.gainRegle > 0 ? 'vert' : '');
    case 'rembourse':
      return valeur('Remboursé', enPoints(pari.miseTotale));
    default:
      return valeur(evaluation.termine ? 'Gain' : 'Gain potentiel',
        enPoints(evaluation.termine ? evaluation.gainAcquis : evaluation.gainMaximum),
        evaluation.etat === 'perdu' ? 'secondaire' : 'vert');
  }
}

function badge(pari, evaluation) {
  switch (pari.statut) {
    case 'regle':
      return pari.gainRegle > 0
        ? html`<${Badge} texte="Gagné" symbole="trophy.fill" couleur="vert" />`
        : html`<${Badge} texte="Perdu" symbole="xmark" couleur="rouge" />`;
    case 'rembourse':
      return html`<${Badge} texte="Remboursé" symbole="arrow.uturn.backward" />`;
    default:
      if (evaluation.etat === 'gagne') return html`<${Badge} texte="À encaisser" symbole="banknote" couleur="orange" />`;
      if (evaluation.etat === 'perdu') return html`<${Badge} texte="Perdu" symbole="xmark" couleur="rouge" />`;
      return html`<${Badge} texte="En cours" symbole="clock" couleur="bleu" />`;
  }
}

// MARK: - Apparence (classes propres à la carte : pc-…)

const STYLE = `
.pari-carte { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; }
.liste > * + .pari-carte::before {
  content: ""; position: absolute; top: 0; right: 0; left: 16px; border-top: 0.5px solid var(--separateur);
}
/* Posée dans une .ligne (qui a déjà ses marges et son filet) : la carte n'ajoute pas les siennes. */
.ligne > .pari-carte { padding: 2px 0; }
.pc-entete { display: flex; align-items: flex-start; gap: 10px; }
.pc-entete .badge { margin-top: 2px; }
.pc-titre { font-size: 17px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
.pc-formule { margin-top: 2px; font-size: 12px; color: var(--texte-2); }
.pc-pronostics {
  display: flex; flex-direction: column; gap: 5px;
  padding: 10px; border-radius: 10px; background: var(--surface-3);
}
.pc-pronostic { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 15px; }
.pc-etat { flex: none; width: 18px; display: inline-flex; justify-content: center; }
.pc-match { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pc-issue { flex: none; width: 18px; text-align: center; font-weight: 800; }
.pc-cote { flex: none; width: 40px; text-align: right; font-size: 12px; color: var(--texte-2); font-variant-numeric: tabular-nums; }
.pc-valeurs { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.pc-valeur { min-width: 0; }
.pc-valeur-titre { font-size: 11px; color: var(--texte-2); }
.pc-valeur-texte { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pc-valeur.vert .pc-valeur-texte { color: var(--vert); }
.pc-valeur.vert .pc-valeur-titre { color: var(--vert); opacity: 0.75; }
.pc-valeur.secondaire .pc-valeur-texte { color: var(--texte-2); }
.pc-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 15px; }
.pc-actions .bouton.principal.pc-encaisser { background: var(--vert); color: #fff; }
.pc-actions .bouton.principal.pc-clore { background: #8e8e93; color: #fff; }
.pc-actions .bouton.lien.destructif { padding-left: 0; }
.pc-actions .pc-ticket { margin-left: auto; font-size: 13px; padding-right: 0; }
`;

if (typeof document !== 'undefined' && !document.getElementById('style-pari-carte')) {
  const style = document.createElement('style');
  style.id = 'style-pari-carte';
  style.textContent = STYLE;
  document.head.append(style);
}
