// La prise de pari : la feuille du joueur (2 à 21) où l'on touche 1, N ou 2 sur chaque match,
// avec la cote totale et les gains potentiels calculés en direct. Repris de PariEditeur.swift.
//
// PariEditeur({ journeeId, joueurId, onFermer }) : les deux identifiants sont facultatifs. Sans
// journée, la plus récente qui accepte les paris est proposée. Ouvert de partout par
// `emettre('nouveauPari', { journeeId, joueurId })` (la racine pose la feuille).

import { html, useEffect, useLayoutEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import { Calcul, rangsClassement } from '../calcul.js';
import { arrondi, cle, enCote, enPoints, lireNombre } from '../format.js';
import { reglages } from '../reglages.js';
import {
  Badge, BoutonIssue, Bouton, Choix, Feuille, Icone, Interrupteur, LigneValeur, PastilleNumero, Section, Segment,
} from '../ui/composants.js';
import { demanderCode, essayer } from '../ui/dialogues.js';

const SYSTEME_MIN = Calcul.systemeMin; // 3
const SYSTEME_MAX = Calcul.systemeMax; // 8
const MISE_MAX = 10_000;

/** 2, 3, …, n */
const deDeuxA = (n) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 2);

/**
 * Les tailles cochées suivent le nombre de matchs ; par défaut, toutes (le « Multi » complet).
 * Un Multi complet le reste quand on ajoute un match : « Multi 4 » devient « Multi 5 ».
 * `avant` : le nombre de matchs avant le changement (absent quand c'est la formule qui change).
 */
export function ajusterNiveaux(niveaux, n, formule, avant = null) {
  if (formule !== 'systeme' || n < 2) return niveaux;
  let tailles = [...new Set(niveaux)];
  const complet = (m) => tailles.length === m - 1 && deDeuxA(m).every((k) => tailles.includes(k));
  if (avant != null && avant >= 2 && n > avant && complet(avant)) tailles = deDeuxA(n);
  tailles = tailles.filter((k) => k <= n);
  if (!tailles.length) tailles = deDeuxA(n);
  return tailles.sort((a, b) => a - b);
}

/** Rang de chaque équipe dans les classements saisis, pour aider à choisir : { cle(équipe): rang }. */
function rangsDesEquipes() {
  const rangs = {};
  for (const championnat of M.championnatsTries()) {
    const classement = M.classementDe(championnat.id);
    const places = rangsClassement(classement);
    classement.forEach((ligne, index) => {
      const c = cle(ligne.equipe);
      if (rangs[c] == null) rangs[c] = places[index];
    });
  }
  return rangs;
}

export function PariEditeur({ journeeId, joueurId, onFermer }) {
  useEtat();
  const joueursActifs = [...M.joueurs({ archives: false })].sort((a, b) => a.numero - b.numero);
  const journeesOuvertes = M.journeesTriees().filter((j) => j.statut === 'ouverte');

  const [idJoueur, setIdJoueur] = useState(joueurId ?? null);
  const [idJournee, setIdJournee] = useState(() => journeeId ?? journeesOuvertes[0]?.id ?? null);
  /** rencontreId → issue choisie */
  const [choix, setChoix] = useState({});
  const [formule, setFormule] = useState('combine');
  const [niveaux, setNiveaux] = useState([]);
  const [mise, setMise] = useState(() => Math.max(1, Math.round(reglages().miseParDefaut)));

  const joueur = idJoueur ? M.joueur(idJoueur) : null;
  const journee = idJournee ? M.journee(idJournee) : null;
  const matchs = journee ? M.matchs(journee.id) : [];

  /** Les matchs choisis, dans l'ordre de la grille. */
  const selection = matchs.filter((r) => choix[r.id]).map((r) => ({ rencontre: r, issue: choix[r.id] }));
  const n = selection.length;
  const niveauxRetenus = formule === 'systeme' ? niveaux.filter((k) => k <= n).sort((a, b) => a - b) : null;
  const evaluation = Calcul.evaluer(
    selection.map((s) => ({ cote: M.cote(s.rencontre, s.issue), etat: 'enAttente' })), niveauxRetenus, mise,
  );
  const miseTotale = arrondi(mise * Calcul.nombreDeCombinaisons(n, niveauxRetenus));
  const plein = formule === 'systeme' && n >= SYSTEME_MAX;
  const rangs = rangsDesEquipes();

  /** Les choix changent : les tailles du système suivent le nombre de matchs (onChange de selection.count). */
  const changerChoix = (nouveaux) => {
    const compte = matchs.filter((r) => nouveaux[r.id]).length;
    if (compte !== n) setNiveaux(ajusterNiveaux(niveaux, compte, formule, n));
    setChoix(nouveaux);
  };

  /** Un appui choisit l'issue, un second appui sur la même la retire (macros Vider_1 à Vider_18). */
  const basculer = (rencontre, issue) => {
    const suivants = { ...choix };
    if (choix[rencontre.id] === issue) {
      delete suivants[rencontre.id];
    } else {
      if (formule === 'systeme' && !choix[rencontre.id] && n >= SYSTEME_MAX) return;
      suivants[rencontre.id] = issue;
    }
    changerChoix(suivants);
  };

  const choisirJournee = (id) => {
    if (id === idJournee) return;
    // Une autre journée : ses matchs ne sont plus les mêmes, les choix repartent de zéro.
    if (idJournee != null) setChoix({});
    setIdJournee(id);
  };

  const choisirFormule = (f) => {
    setFormule(f);
    setNiveaux(ajusterNiveaux(niveaux, n, f));
  };

  const basculerNiveau = (taille, coche) => {
    setNiveaux(coche ? [...new Set([...niveaux, taille])].sort((a, b) => a - b) : niveaux.filter((k) => k !== taille));
  };

  /** Avec un code barman, le barman valide chaque pari (sauf si Réglages le laisse libre). */
  const demanderValidation = async () => {
    if (reglages().codePourLesParis) {
      const nom = joueur ? M.nomComplet(joueur) : 'joueur';
      if (!(await demanderCode(`Valider le pari de ${nom}`))) return;
    }
    valider();
  };

  const valider = () => {
    // Relu au moment de valider : le joueur, la journée et les matchs tels qu'ils sont maintenant.
    const j = idJoueur ? M.joueur(idJoueur) : null;
    const jour = idJournee ? M.journee(idJournee) : null;
    const liste = jour ? M.matchs(jour.id).filter((r) => choix[r.id]).map((r) => ({ rencontre: r, issue: choix[r.id] })) : [];
    const pari = essayer(() => modifier(() => Caisse.placerPari({
      joueur: j, journee: jour, choix: liste, formule, niveaux, miseUnitaire: mise,
    })), 'Pari impossible');
    if (pari) onFermer?.();
  };

  // Le joueur ou la journée demandés, même archivé ou fermée : le choix reste visible (le pari sera refusé
  // avec son explication, comme dans l'app).
  const optionsJoueurs = [{ valeur: null, libelle: 'Choisir…' },
    ...joueursActifs.map((x) => ({ valeur: x.id, libelle: `${x.numero} · ${M.nomComplet(x)}` }))];
  if (joueur && !joueursActifs.includes(joueur)) optionsJoueurs.push({ valeur: joueur.id, libelle: `${joueur.numero} · ${M.nomComplet(joueur)}` });
  const optionsJournees = [{ valeur: null, libelle: 'Choisir…' },
    ...journeesOuvertes.map((x) => ({ valeur: x.id, libelle: x.titre }))];
  if (journee && !journeesOuvertes.includes(journee)) optionsJournees.push({ valeur: journee.id, libelle: journee.titre });

  const pied = html`<${Recapitulatif} n=${n} evaluation=${evaluation} miseTotale=${miseTotale} joueur=${joueur}
    mise=${mise} onMise=${setMise} onValider=${demanderValidation}
    desactive=${!joueur || !journee || n === 0 || mise < 1} />`;

  return html`<${Feuille} titre="Nouveau pari" onFermer=${onFermer} pied=${pied}
      droite=${{ libelle: 'Vider', onClick: () => changerChoix({}), desactive: Object.keys(choix).length === 0 }}>
    <${Section}>
      <${Choix} libelle="Joueur" valeur=${joueur ? joueur.id : null} options=${optionsJoueurs} onChange=${setIdJoueur} />
      <${Choix} libelle="Journée" valeur=${journee ? journee.id : null} options=${optionsJournees} onChange=${choisirJournee} />
      ${joueur && html`<${LigneValeur} libelle="Porte-feuilles" valeur=${enPoints(joueur.points)} />`}
    <//>

    <${Section} pied=${formule === 'combine'
      ? 'Combiné : tous les matchs choisis doivent être gagnés. Gain = mise × produit des cotes.'
      : 'Système (3 à 8 matchs) : chaque combinaison cochée est un petit combiné. Quelques erreurs sont permises.'}>
      <div class="ligne"><${Segment} classe="grandit" valeur=${formule} onChange=${choisirFormule}
        options=${[{ valeur: 'combine', libelle: M.FORMULES.combine.libelle }, { valeur: 'systeme', libelle: M.FORMULES.systeme.libelle }]} /></div>
    <//>

    ${formule === 'systeme' && html`<${Section} titre="Formule du système"
        pied=${n >= SYSTEME_MIN ? "Toutes les tailles cochées : c'est un « Multi », et sur 8 matchs le Goliath (247 combinaisons). La mise s'entend par combinaison." : null}>
      <${ReglageSysteme} n=${n} niveaux=${niveaux} onBasculer=${basculerNiveau} />
    <//>`}

    ${journee
      ? html`
        ${matchs.length === 0 && html`<${Section}><div class="ligne"><span class="ligne-texte secondaire">Cette journée n'a pas encore de matchs.</span></div><//>`}
        ${M.groupes(journee.id).map((groupe) => html`<${Section} key=${groupe.id} titre=${groupe.titre}>
          ${groupe.rencontres.map((r) => html`<${LigneChoix} key=${r.id} rencontre=${r} choix=${choix[r.id] ?? null}
            rangDomicile=${rangs[cle(r.domicile)]} rangExterieur=${rangs[cle(r.exterieur)]} plein=${plein}
            onChoisir=${(issue) => basculer(r, issue)} />`)}
        <//>`)}`
      : journeesOuvertes.length === 0 && html`<${Section}><div class="ligne"><span class="ligne-texte secondaire">Aucune journée n'accepte les paris. Créez une grille ou rouvrez les paris d'une journée.</span></div><//>`}
  <//>`;
}

// MARK: - Système

function ReglageSysteme({ n, niveaux, onBasculer }) {
  if (n < SYSTEME_MIN) {
    return html`<div class="ligne"><span class="ligne-texte secondaire pe-note">Choisissez de 3 à 8 matchs : ${n} pour l'instant.</span></div>`;
  }
  if (n > SYSTEME_MAX) {
    // Possible en passant au système après un combiné de plus de 8 matchs.
    return html`<div class="ligne orange pe-note"><${Icone} nom="exclamationmark.triangle" taille=${17} />
      <span class="ligne-texte">Un système se joue sur 8 matchs au plus : retirez-en ${n - SYSTEME_MAX}.</span></div>`;
  }
  return html`
    <${LigneValeur} libelle="Formule" valeur=${html`<span class="pe-formule">${Calcul.nomSysteme(n, niveaux)}</span>`} />
    ${deDeuxA(n).map((taille) => html`<${Interrupteur} key=${taille} valeur=${niveaux.includes(taille)}
      onChange=${(coche) => onBasculer(taille, coche)}
      libelle=${html`<span class="pe-taille"><span class="gras">${taille} sur ${n}</span>
        <span class="secondaire chiffres">${Calcul.combinaisons(n, taille)} comb.</span></span>`} />`)}`;
}

// MARK: - Un match de la grille avec ses trois boutons 1 / N / 2

function LigneChoix({ rencontre, choix, rangDomicile, rangExterieur, plein, onChoisir }) {
  const joue = rencontre.resultat != null;
  return html`<div class="pe-match">
    <div class="pe-equipes">
      <${PastilleNumero} numero=${rencontre.ordre} />
      <${Equipe} nom=${M.nomDomicile(rencontre)} rang=${rangDomicile} />
      <span class="pe-vs">VS</span>
      <${Equipe} nom=${M.nomExterieur(rencontre)} rang=${rangExterieur} />
      <span class="grandit"></span>
      ${joue && html`<${Badge} texte="Joué" />`}
    </div>
    <div class="issues">
      ${M.ISSUES.map((issue) => html`<${BoutonIssue} key=${issue} issue=${issue} cote=${M.cote(rencontre, issue)}
        selectionne=${choix === issue} desactive=${joue || (plein && choix == null)} onClick=${() => onChoisir(issue)} />`)}
    </div>
  </div>`;
}

function Equipe({ nom, rang }) {
  return html`<span class="pe-equipe" title=${nom}>
    <span class="pe-nom">${nom}</span>
    ${rang != null && html`<span class="pe-rang">${rang === 1 ? '1er' : `${rang}e`}</span>`}
  </span>`;
}

// MARK: - Récapitulatif (en bas de la feuille)

function Recapitulatif({ n, evaluation, miseTotale, joueur, mise, onMise, onValider, desactive }) {
  const solde = joueur?.points ?? 0;
  return html`<div class="pe-recap">
    <div class="pe-recap-ligne">
      <span class="pe-compte"><${Icone} nom="soccerball" taille=${16} />${n > 1 ? `${n} matchs` : `${n} match`}</span>
      <span class="grandit"></span>
      ${evaluation.combinaisons > 1
        ? html`<span class="secondaire pe-petit">${evaluation.combinaisons} combinaisons</span>`
        : n > 0 && html`<span class="gras chiffres pe-petit">Cote ${enCote(evaluation.coteTotale)}</span>`}
    </div>
    <div class="pe-recap-ligne pe-replie">
      <span class="pe-petit pe-libelle-mise">${evaluation.combinaisons > 1 ? 'Mise par comb.' : 'Mise'}</span>
      <${ChampMise} valeur=${mise} onChange=${onMise} />
      <span class="grandit"></span>
      <span class="pe-total">
        <${TexteAjuste} classe=${`gras chiffres pe-petit ${miseTotale > solde + 0.0001 ? 'rouge' : ''}`}>Total ${enPoints(miseTotale)}<//>
        ${joueur && html`<${TexteAjuste} classe="secondaire chiffres tres-petit">Reste ${enPoints(arrondi(solde - miseTotale))}<//>`}
      </span>
    </div>
    <div class="pe-recap-ligne pe-replie">
      <span class="pe-gains">
        <span class="pe-gains-titre">GAINS POTENTIELS</span>
        <${TexteAjuste} classe="pe-gains-valeur vert chiffres">${enPoints(evaluation.gainMaximum)}<//>
      </span>
      <span class="grandit"></span>
      <${Bouton} variante="principal" taille="grand" icone="checkmark.circle.fill" desactive=${desactive}
        onClick=${onValider}>Valider le pari<//>
    </div>
  </div>`;
}

/** Un texte sur une ligne, réduit jusqu'à `minimum` × sa taille s'il ne tient pas (minimumScaleFactor),
 *  puis coupé de « … ». */
function TexteAjuste({ classe = '', minimum = 0.7, children }) {
  const ref = useRef();
  const ajuster = () => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = '';
    const largeur = el.clientWidth;
    const besoin = el.scrollWidth;
    if (largeur > 0 && besoin > largeur + 0.5) {
      const taille = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(minimum, largeur / besoin) * taille}px`;
    }
  };
  useLayoutEffect(ajuster);
  useEffect(() => {
    addEventListener('resize', ajuster);
    return () => removeEventListener('resize', ajuster);
  }, []);
  return html`<span ref=${ref} class=${`pe-ajuste ${classe}`}>${children}</span>`;
}

/** La mise se compte en points entiers : ni décimale, ni moins d'un point (champ et − / +). */
function ChampMise({ valeur, onChange }) {
  const [texte, setTexte] = useState(null); // le texte tapé, le temps de la saisie
  const borner = (x) => Math.min(MISE_MAX, Math.max(1, x));
  const lire = (t) => {
    const x = lireNombre(t);
    return x == null ? null : borner(Math.trunc(x));
  };
  return html`<span class="pe-mise">
    <input class="entree chiffres" type="text" inputmode="numeric" aria-label="Mise"
      value=${texte ?? String(valeur)}
      onFocus=${(e) => { setTexte(String(valeur)); e.currentTarget.select(); }}
      onInput=${(e) => { const t = e.currentTarget.value; setTexte(t); const x = lire(t); if (x != null) onChange(x); }}
      onBlur=${() => setTexte(null)}
      onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    <span class="pas-a-pas">
      <button type="button" aria-label="Moins" disabled=${valeur <= 1} onClick=${() => onChange(borner(valeur - 1))}><${Icone} nom="minus" taille=${16} /></button>
      <button type="button" aria-label="Plus" disabled=${valeur >= MISE_MAX} onClick=${() => onChange(borner(valeur + 1))}><${Icone} nom="plus" taille=${16} /></button>
    </span>
  </span>`;
}

// MARK: - Apparence (classes propres à la feuille : pe-…)

const STYLE = `
.pe-note { font-size: 15px; }
.pe-formule { font-size: 17px; font-weight: 600; color: var(--texte); }
.pe-taille { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding-right: 12px; font-size: 15px; }
.pe-match { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 10px 16px 12px; }
.liste > * + .pe-match::before {
  content: ""; position: absolute; top: 0; right: 0; left: 16px; border-top: 0.5px solid var(--separateur);
}
.pe-equipes { display: flex; align-items: center; gap: 8px; min-width: 0; }
.pe-equipe { display: inline-flex; align-items: baseline; gap: 3px; min-width: 0; }
.pe-nom { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pe-rang { flex: none; font-size: 11px; font-weight: 600; color: var(--texte-2); }
.pe-vs { flex: none; font-size: 11px; font-weight: 700; color: var(--texte-2); }
.pe-equipes .badge { flex: none; }

.pe-recap { display: flex; flex-direction: column; gap: 10px; }
.pe-recap-ligne { display: flex; align-items: center; gap: 10px; min-width: 0; }
/* Sur un petit écran, le total (ou le bouton) passe sous la mise plutôt que d'être coupé. */
.pe-recap-ligne.pe-replie { flex-wrap: wrap; row-gap: 6px; }
.pe-replie > .pe-total, .pe-replie > .bouton { margin-left: auto; }
.pe-petit { font-size: 15px; }
.pe-compte { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; }
.pe-libelle-mise { flex: none; white-space: nowrap; }
.pe-mise { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.pe-mise .entree { width: 64px; min-height: 36px; padding: 6px 10px; text-align: right; }
.pe-mise .pas-a-pas { gap: 2px; }
.pe-mise .pas-a-pas button { width: 36px; height: 32px; }
.pe-ajuste { display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pe-total { display: flex; flex-direction: column; align-items: flex-end; min-width: 0; text-align: right; }
.pe-gains { display: flex; flex-direction: column; min-width: 0; flex: 0 1 auto; }
.pe-gains-titre { font-size: 11px; font-weight: 600; color: var(--texte-2); }
.pe-gains-valeur { font-size: 24px; font-weight: 800; line-height: 1.15; white-space: nowrap; }
.pe-recap .bouton.grand { flex: none; padding-left: 18px; padding-right: 18px; }
@media (max-width: 380px) {
  .pe-recap-ligne { gap: 8px; }
  .pe-mise .entree { width: 56px; }
  .pe-mise .pas-a-pas button { width: 32px; }
  .pe-recap .bouton.grand { padding-left: 12px; padding-right: 12px; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('style-pari-editeur')) {
  const style = document.createElement('style');
  style.id = 'style-pari-editeur';
  style.textContent = STYLE;
  document.head.append(style);
}
