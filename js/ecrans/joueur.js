// La feuille personnelle d'un joueur : porte-feuilles, paris, consommations et historique.
// Repris de JoueurDetailView.swift.

import { html, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import { TYPES_MOUVEMENT } from '../modele.js';
import { reglages, aOffrir } from '../reglages.js';
import { enEuros, enPoints, enPointsSignes, heure } from '../format.js';
import { Ecran, Section, Menu, Icone, TuileAction, Vide } from '../ui/composants.js';
import { alerte, confirmer, demanderCode, essayer } from '../ui/dialogues.js';
import { PariCarte } from './pari-carte.js';
import { PariEditeur } from './pari-editeur.js';
import {
  AchatSheet, ConsommationSheet, CorrectionSheet, JoueurFormulaire, RechargeSheet,
  fr,
} from './joueur-actions.js';

export function JoueurDetailView({ id }) {
  useEtat();
  const [feuille, setFeuille] = useState(null);
  const joueur = M.joueur(id);

  if (!joueur) {
    return html`<${Ecran} titre="Joueur" retour="#/joueurs" libelleRetour="Joueurs">
      <${Vide} icone="person.2" titre="Joueur introuvable" texte="Ce joueur n'existe plus : il a peut-être été supprimé." />
    <//>`;
  }

  const r = reglages();
  const parisEnCours = M.parisEnCoursDuJoueur(id);
  const termines = M.parisDuJoueur(id).filter((p) => p.statut !== 'enCours');
  const historique = M.historique(id);
  const taille = M.tailleHistorique(id);
  const fermer = () => setFeuille(null);

  // MARK: Opérations du barman

  const regler = async (pariId) => {
    if (!(await demanderCode('Encaisser le pari'))) return;
    essayer(() => modifier(() => Caisse.regler(M.pari(pariId))));
  };

  const rembourser = async (pariId) => {
    if (!(await demanderCode('Rembourser le pari'))) return;
    essayer(() => modifier(() => Caisse.rembourser(M.pari(pariId))));
  };

  const effacerHistorique = async () => {
    const ok = await confirmer({
      titre: `Supprimer l'historique de ${M.nomComplet(joueur)} ?`,
      message: fr(Caisse.avertissementHistorique([joueur])),
      bouton: "Supprimer l'historique",
      destructif: true,
    });
    if (!ok || !(await demanderCode("Supprimer l'historique"))) return;
    const efface = essayer(() => modifier(() => Caisse.effacerHistorique(M.joueur(id))));
    if (efface) alerte('Historique supprimé', fr(Caisse.bilanHistorique(efface, 1)));
  };

  const options = html`<${Menu} icone="ellipsis.circle" titre="Options" items=${[
    { libelle: 'Modifier le nom et le téléphone…', icone: 'pencil', onClick: () => setFeuille('modification') },
    { libelle: 'Corriger le solde…', icone: 'plusminus.circle', onClick: () => setFeuille('correction') },
    {
      libelle: joueur.archive ? 'Réactiver le joueur' : 'Archiver le joueur', icone: 'archivebox',
      onClick: () => modifier(() => { const j = M.joueur(id); if (j) j.archive = !j.archive; }),
    },
    null,
    {
      libelle: "Supprimer l'historique…", icone: 'clock.badge.xmark', destructif: true,
      desactive: taille.mouvements + taille.parisTermines === 0, onClick: effacerHistorique,
    },
  ]} />`;

  return html`<${Ecran} titre=${M.nomComplet(joueur)} retour actions=${options}>
    <${Section}>
      <${Portefeuilles} joueur=${joueur} parisEnCours=${parisEnCours} />
      <${Actions} joueur=${joueur} fidelite=${r.fideliteActive} onFeuille=${setFeuille} />
    <//>

    ${parisEnCours.length > 0 && html`<${Section} titre="Paris en cours">
      ${parisEnCours.map((p) => html`<div class="ligne" key=${p.id} style="display:block">
        <${PariCarte} pariId=${p.id} onRegler=${() => regler(p.id)} onRembourser=${() => rembourser(p.id)} />
      </div>`)}
    <//>`}

    ${termines.length > 0 && html`<${Section} titre="Paris terminés">
      ${termines.slice(0, 20).map((p) => html`<div class="ligne" key=${p.id} style="display:block">
        <${PariCarte} pariId=${p.id} />
      </div>`)}
    <//>`}

    <${Section} titre="Historique">
      ${historique.length === 0 && html`<div class="ligne secondaire">Aucun mouvement.</div>`}
      ${historique.slice(0, 60).map((m) => html`<${LigneMouvement} key=${m.id} mouvement=${m} />`)}
    <//>

    ${feuille === 'pari' && html`<${PariEditeur} joueurId=${id} onFermer=${fermer} />`}
    ${feuille === 'recharge' && html`<${RechargeSheet} joueurId=${id} onFermer=${fermer} />`}
    ${feuille === 'consommation' && html`<${ConsommationSheet} joueurId=${id} onFermer=${fermer} />`}
    ${feuille === 'correction' && html`<${CorrectionSheet} joueurId=${id} onFermer=${fermer} />`}
    ${feuille === 'modification' && html`<${JoueurFormulaire} joueurId=${id} onFermer=${fermer} />`}
    ${feuille === 'achat' && html`<${AchatSheet} joueurId=${id} onFermer=${fermer} />`}
  <//>`;
}

// MARK: - Porte-feuilles

function Portefeuilles({ joueur, parisEnCours }) {
  const offrable = aOffrir(joueur.points);
  const aGagner = parisEnCours.reduce((s, p) => s + M.evaluation(p).gainMaximum, 0);
  const details = `Joueur n° ${joueur.numero}${joueur.telephone ? ` · ${joueur.telephone}` : ''}${joueur.archive ? ' · archivé' : ''}`;
  return html`<div style="padding:14px 16px 12px">
    <div class="rangee" style="gap:14px">
      <span class="avatar" style="width:56px;height:56px;font-size:22px;color:#fff;background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 80%, #fff), var(--accent))">${M.initiales(joueur)}</span>
      <div class="grandit">
        <div class="tres-petit gras secondaire" style="letter-spacing:0.02em">PORTE-FEUILLES</div>
        <div class="chiffres" style="font-size:34px;font-weight:800;line-height:1.1">${enPoints(joueur.points)}</div>
        <div class="petit secondaire">${details}</div>
      </div>
    </div>
    <div class="grille-3" style="margin-top:12px">
      <${ChiffreAjuste} titre="À offrir" valeur=${enEuros(offrable)} symbole="gift" couleur=${offrable > 0 ? 'vert' : null} />
      <${ChiffreAjuste} titre="Misé" valeur=${enPoints(M.misesEnCours(joueur.id))} symbole="ticket" />
      <${ChiffreAjuste} titre="À gagner" valeur=${enPoints(aGagner)} symbole="sparkles" />
    </div>
  </div>`;
}

/** Le `Chiffre` des composants, dont le texte rapetisse pour tenir dans sa case (le
 *  `minimumScaleFactor(0.6)` du Swift) : « 1 234,5 pts » reste lisible sur un téléphone. */
function ChiffreAjuste({ titre, valeur, symbole, couleur }) {
  const taille = `clamp(12px, ${(100 / (0.62 * Math.max(4, valeur.length))).toFixed(1)}cqi, 20px)`;
  return html`<div class="chiffre" style="container-type:inline-size">
    <div class="chiffre-titre">${symbole && html`<${Icone} nom=${symbole} taille=${13} />`}${titre}</div>
    <div class=${couleur ? `chiffre-valeur ${couleur}` : 'chiffre-valeur'} style=${`font-size:${taille}`}>${valeur}</div>
  </div>`;
}

function Actions({ joueur, fidelite, onFeuille }) {
  const tuiles = [
    html`<${TuileAction} titre="Nouveau pari" symbole="plus.circle.fill" pleine desactive=${joueur.archive} onClick=${() => onFeuille('pari')} />`,
    fidelite && html`<${TuileAction} titre="Achat" symbole="cart" couleur="bleu" desactive=${joueur.archive} onClick=${() => onFeuille('achat')} />`,
    html`<${TuileAction} titre="Conso offerte" symbole="gift" onClick=${() => onFeuille('consommation')} />`,
    html`<${TuileAction} titre="Rajouter des points" symbole="plus.circle" onClick=${() => onFeuille('recharge')} />`,
  ].filter(Boolean);
  return html`<div class="ligne" style="display:block;padding:10px 16px 14px">
    <div style=${`display:grid;grid-template-columns:repeat(${tuiles.length}, minmax(0, 1fr));gap:10px`}>${tuiles}</div>
  </div>`;
}

// MARK: - Historique

function LigneMouvement({ mouvement: m }) {
  const type = TYPES_MOUVEMENT[m.type] ?? TYPES_MOUVEMENT.correction;
  const report = m.type === 'report';
  const positif = m.montant >= 0;
  return html`<div class="ligne">
    <span class=${positif ? 'vert' : 'secondaire'} style="width:24px;display:grid;place-items:center">
      <${Icone} nom=${type.symbole} taille=${19} />
    </span>
    <span class="ligne-texte">
      <div style="font-size:15px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${m.libelle}</div>
      <div class="ligne-sous-titre">${heure(m.date)}</div>
    </span>
    <span class="droite chiffres" style="flex:none">
      <div class=${report ? 'gras secondaire' : (positif ? 'gras vert' : 'gras')} style="font-size:15px">${report ? 'report' : enPointsSignes(m.montant)}</div>
      <div class="petit secondaire">${enPoints(m.soldeApres)}</div>
    </span>
  </div>`;
}
