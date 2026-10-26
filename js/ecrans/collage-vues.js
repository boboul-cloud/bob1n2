// Les textes collés : la zone où l'on colle, le classement d'une compétition, des matchs pour la
// grille, les résultats de la journée. Repris de CollageViews.swift. Rien n'est téléchargé :
// c'est l'utilisateur qui copie le texte, sur le site de résultats ou ailleurs.

import { html, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Collage from '../collage.js';
import { ajouterMatchs, appliquer, correspondances, remplacerClassement, suivreResultats } from '../grille.js';
import { reglages, urlSiteResultats, urlWeb } from '../reglages.js';
import { cle, enCote } from '../format.js';
import { Bouton, Feuille, Icone, Interrupteur, Menu, Section } from '../ui/composants.js';
import { alerte } from '../ui/dialogues.js';
import { lirePressePapiers } from '../ui/systeme.js';

/**
 * Zone où l'on colle le texte copié sur le site de résultats. `placeholder` : l'exemple affiché
 * dans la zone vide ; `page` : l'adresse à ouvrir (« Ouvrir la page »), facultative ; `aide` : une
 * explication sous la zone, facultative. À poser dans une `Section`.
 */
export function ZoneCollage({ valeur, onInput, placeholder, aide, page }) {
  const texte = valeur ?? '';
  const lien = page ? urlWeb(String(page)) : null;
  const coller = async () => {
    const lu = await lirePressePapiers();
    if (lu == null) {
      alerte('Coller', "Le navigateur ne laisse pas lire le presse-papiers : touchez la zone de texte et collez-y le texte (appui long › Coller, ou ⌘V / Ctrl+V).");
      return;
    }
    onInput(lu);
  };
  return html`<div class="col-zone-collage">
    <div class="rangee">
      <${Bouton} taille="petit" icone="doc.on.clipboard" onClick=${coller}>Coller<//>
      ${lien && html`<${Bouton} taille="petit" icone="safari" href=${lien}>Ouvrir la page<//>`}
      <span class="grandit"></span>
      ${texte && html`<${Bouton} taille="petit" variante="lien" classe="destructif" onClick=${() => onInput('')}>Effacer<//>`}
    </div>
    <textarea class="col-zone-collage-texte" rows="7" placeholder=${placeholder} value=${texte} aria-label="Texte collé"
      spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"
      onInput=${(e) => onInput(e.currentTarget.value)}></textarea>
    ${aide && html`<div class="note">${aide}</div>`}
  </div>`;
}

/** Un message en orange : rien n'a été reconnu dans le texte. */
function RienDeReconnu({ texte }) {
  return html`<${Section}>
    <div class="ligne col-orange-ligne"><${Icone} nom="exclamationmark.triangle" taille=${18} /><span>${texte}</span></div>
  <//>`;
}

// MARK: - Classement

/** Colle le classement copié sur la page du championnat, comme la macro « enregistrement_classement »
 *  du tableau de bord. */
export function CollerClassementSheet({ championnatId, onFermer }) {
  useEtat();
  const championnat = M.championnat(championnatId);
  const [texte, setTexte] = useState('');
  if (!championnat) return null;
  const lignes = Collage.classement(texte);

  const remplacer = () => {
    modifier(() => remplacerClassement(championnat, lignes));
    onFermer();
  };

  return html`<${Feuille} titre="Coller les rangs" large onFermer=${onFermer}
    droite=${{ libelle: 'Remplacer', onClick: remplacer, desactive: lignes.length < 2 }}>
    <${Section} pied="Sur la page de la compétition, sélectionnez le tableau des équipes (de la 1re à la dernière ligne), copiez-le, puis touchez « Coller ». Colonnes reconnues : Pl, Équipe, Pts, J, G, N, P, F, Bp, Bc, Dif, Pe.">
      <${ZoneCollage} valeur=${texte} onInput=${setTexte} page=${championnat.adresse}
        placeholder=${'Pl Équipe Pts J G N P F Bp Bc Dif Pe\n1 ÉQUIPE A 6 2 2 0 0 0 9 0 9 0\n2 ÉQUIPE B 4 2 1 1 0 0 5 2 3 0'} />
    <//>
    ${lignes.length > 0
      ? html`<${Section} titre=${`Aperçu · ${lignes.length} équipes`}>
          ${lignes.map((ligne, index) => html`<div class="ligne col-apercu-rang" key=${index}>
            <span class="col-rang-apercu chiffres secondaire">${index + 1}</span>
            <span class="grandit gras ligne-unique">${ligne.equipe}</span>
            ${ligne.joues != null && html`<span class="secondaire chiffres">${ligne.joues} J</span>`}
            <span class="gras chiffres">${ligne.points != null ? `${ligne.points} pts` : '—'}</span>
          </div>`)}
        <//>`
      : texte && html`<${RienDeReconnu} texte="Aucune équipe reconnue dans ce texte." />`}
  <//>`;
}

// MARK: - Matchs

/** Remplit la grille avec la liste des matchs copiée sur le site, ou tapée à la main. */
export function CollerMatchsSheet({ journeeId, onFermer }) {
  useEtat();
  const journee = M.journee(journeeId);
  const championnats = M.championnatsTries();
  const [texte, setTexte] = useState('');
  const [categorie, setCategorie] = useState(() => {
    const derniere = M.matchs(journeeId).at(-1);
    return derniere ? derniere.categorie : (championnats[0]?.nom ?? '');
  });
  const [proposer, setProposer] = useState(true);
  const [ecartes, setEcartes] = useState(() => new Set());
  if (!journee) return null;

  const matchs = Collage.matchs(texte);
  const retenus = matchs.filter((_, i) => !ecartes.has(i));
  const pageDeLaCategorie = urlWeb(championnats.find((c) => cle(c.nom) === cle(categorie))?.adresse ?? '');

  const changerTexte = (t) => {
    setTexte(t);
    setEcartes(new Set());
  };
  const basculer = (index, garde) => {
    const suivants = new Set(ecartes);
    if (garde) suivants.delete(index);
    else suivants.add(index);
    setEcartes(suivants);
  };
  const ajouter = () => {
    modifier(() => ajouterMatchs(retenus, journee, { categorie, proposer, marge: reglages().margeCotes }));
    onFermer();
  };

  return html`<${Feuille} titre="Coller des matchs" large onFermer=${onFermer}
    droite=${{ libelle: `Ajouter ${retenus.length}`, onClick: ajouter, desactive: retenus.length === 0 }}>
    <${Section} pied="Copiez la liste des matchs de la journée sur votre site de résultats, ou tapez un match par ligne : « Équipe A - Équipe B », suivi si vous voulez des trois cotes 1, N, 2.">
      <${ZoneCollage} valeur=${texte} onInput=${changerTexte} page=${pageDeLaCategorie ?? urlSiteResultats()}
        placeholder=${'ÉQUIPE A - ÉQUIPE B\nÉQUIPE C - ÉQUIPE D 1,8 3,2 4\n…'} />
    <//>

    <${Section} titre="Réglages" classe="jrs-avec-menus">
      <div class="champ plein">
        <input type="text" value=${categorie} placeholder="Catégorie (R3 - A, D1…)" aria-label="Catégorie"
          autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="characters"
          onInput=${(e) => setCategorie(e.currentTarget.value.toUpperCase())} />
        ${championnats.length > 0 && html`<${Menu} icone="list.bullet" titre="Choisir la compétition"
          items=${championnats.map((c) => ({ libelle: c.nom, onClick: () => setCategorie(c.nom) }))} />`}
      </div>
      <${Interrupteur} libelle="Proposer les cotes" valeur=${proposer} onChange=${setProposer} />
    <//>

    ${matchs.length > 0
      ? html`<${Section} titre=${`Aperçu · ${retenus.length} matchs retenus`}>
          ${matchs.map((match, index) => html`<${Interrupteur} key=${index}
            libelle=${html`<span class="gras">${match.domicile} – ${match.exterieur}</span>`}
            aide=${match.cotes
              ? `Cotes ${match.cotes.map(enCote).join(' · ')}`
              : (match.score ? html`<span class="orange">Déjà joué (${match.score}) : le résultat n'est pas repris ici</span>` : null)}
            valeur=${!ecartes.has(index)} onChange=${(garde) => basculer(index, garde)} />`)}
        <//>`
      : texte && html`<${RienDeReconnu} texte="Aucun match reconnu dans ce texte." />`}
  <//>`;
}

// MARK: - Résultats

/** Pose les résultats de la journée à partir des scores copiés sur le site. */
export function CollerResultatsSheet({ journeeId, onFermer }) {
  useEtat();
  const journee = M.journee(journeeId);
  const [texte, setTexte] = useState('');
  if (!journee) return null;
  const liste = correspondances(Collage.matchs(texte), journee);
  const applicables = liste.filter((c) => c.applicable).length;

  const poser = () => {
    modifier(() => {
      appliquer(correspondances(Collage.matchs(texte), journee));
      // Les rangs des compétitions suivent les résultats collés (JourneeDetailView.swift).
      suivreResultats(journee);
    });
    onFermer();
  };

  return html`<${Feuille} titre="Coller les résultats" large onFermer=${onFermer}
    droite=${{ libelle: `Poser ${applicables}`, onClick: poser, desactive: applicables === 0 }}>
    <${Section} pied="Copiez les résultats de la journée sur votre site (la liste des matchs avec leurs scores), ou tapez « Équipe A 2 - 1 Équipe B ». Les matchs sont retrouvés dans la grille par le nom des équipes.">
      <${ZoneCollage} valeur=${texte} onInput=${setTexte} page=${urlSiteResultats()}
        placeholder=${'ÉQUIPE A 2 - 1 ÉQUIPE B\nÉQUIPE C 0 - 0 ÉQUIPE D\n…'} />
    <//>
    ${liste.length > 0
      ? html`<${Section} titre=${`Aperçu · ${applicables} résultats à poser`}>
          ${liste.map((c, index) => html`<${LigneCorrespondance} key=${index} correspondance=${c} />`)}
        <//>`
      : texte && html`<${RienDeReconnu} texte="Aucun score reconnu dans ce texte." />`}
  <//>`;
}

/** Un score lu et le match de la grille auquel il se rattache. */
export function LigneCorrespondance({ correspondance: c }) {
  return html`<div class="ligne">
    <span class=${`col-symbole-correspondance ${couleur(c)}`}><${Icone} nom=${symbole(c)} taille=${20} /></span>
    <span class="ligne-texte">
      <div class="gras col-petit-plus">${c.lu.domicile} ${c.lu.score ?? ''} ${c.lu.exterieur}</div>
      <div class="tres-petit secondaire">${explication(c)}</div>
    </span>
    ${c.lu.resultat && html`<span class="gras col-resultat-correspondance">${M.libelleResultat(c.lu.resultat)}</span>`}
  </div>`;
}

function symbole(c) {
  if (!c.rencontre) return 'questionmark.circle';
  if (c.conflit) return 'exclamationmark.triangle.fill';
  return c.applicable ? 'checkmark.circle.fill' : 'checkmark.circle';
}

function couleur(c) {
  if (!c.rencontre) return 'secondaire';
  if (c.conflit) return 'orange';
  return 'vert';
}

function explication(c) {
  const r = c.rencontre;
  if (!r) return 'Match absent de la grille';
  if (c.conflit) return `Match n° ${r.ordre} : déjà saisi « ${r.resultat ? M.libelleResultat(r.resultat) : ''} », non modifié`;
  if (!c.applicable) return `Match n° ${r.ordre} : résultat déjà saisi`;
  if (r.resultat != null) return `Match n° ${r.ordre} : résultat déjà saisi, son score s'ajoute`;
  return `Match n° ${r.ordre}`;
}

// MARK: - Style propre au collage

injecterStyle('style-collage', `
.col-zone-collage { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; }
.col-zone-collage-texte { width: 100%; min-height: 130px; height: 150px; max-height: 320px; resize: vertical;
  padding: 10px 12px; border: 0; border-radius: 10px; outline: none; background: var(--surface-3); color: var(--texte);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 13px; line-height: 1.4; tab-size: 4; }
.col-zone-collage-texte::placeholder { color: var(--texte-3); }
.col-zone-collage-texte:focus { box-shadow: 0 0 0 2px var(--accent-doux); }
.col-apercu-rang { gap: 10px; font-size: 15px; }
.col-rang-apercu { width: 26px; flex: none; }
.col-symbole-correspondance { width: 22px; flex: none; display: grid; place-items: center; }
.col-resultat-correspondance { font-size: 17px; flex: none; }
.col-petit-plus { font-size: 15px; }
.ligne.col-orange-ligne { color: var(--orange); }
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
