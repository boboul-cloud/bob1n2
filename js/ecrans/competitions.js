// Les compétitions : championnat de district ou de ligue, coupe du bar, tournoi. Chacune a ses équipes,
// leurs rangs (la feuille « classementr3 » du tableau de bord), son calendrier de la saison et ses
// matchs. Repris de ChampionnatsView.swift.
//
// Adresses : #/competitions (la liste), #/competition/<id> (une compétition),
// #/competition/<id>/calendrier (son calendrier, CalendrierView).

import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Exemple from '../exemple.js';
import { ajouterEquipe, matchsDe, ordonner, renommerCompetition } from '../grille.js';
import { journeesDe } from '../calendrier.js';
import { differenceLigne, jouesLigne, pointsLigne, rangsClassement } from '../calcul.js';
import { urlCourte } from '../reglages.js';
import { cle } from '../format.js';
import {
  BadgeStatutJournee, Bouton, ChampEntier, ChampTexte, Ecran, Feuille, Icone, Ligne, Menu, Section, Vide,
} from '../ui/composants.js';
import { confirmer, demanderCode, saisir } from '../ui/dialogues.js';
import { ouvrirLien } from '../ui/systeme.js';
import { naviguer } from '../ui/racine.js';
import { CollerClassementSheet } from './collage-vues.js';
import { AjoutMatchsCompetition, NouvelleCompetitionSheet, SectionSiteWeb, adresseWeb } from './competition-vues.js';
import { CalendrierView, CollerCalendrierSheet, ImportCalendrierSheet } from './calendrier-vues.js';

/** Ce que la suppression d'une compétition emporte, et ce qu'elle laisse. */
export const EFFETS_DE_LA_SUPPRESSION = 'Ses équipes, leurs rangs et son calendrier disparaissent. Les matchs déjà dans les journées restent, avec leurs paris.';

const AIDE_ORDRE = "Pour changer l'ordre : « Modifier », puis faites glisser une compétition par sa poignée (ou touchez ses flèches). Les autres écrans suivent cet ordre.";

/** Supprimer une compétition : confirmation, puis code barman. Rend `true` si c'est fait. */
async function supprimerCompetition(competition, avant) {
  const oui = await confirmer({
    titre: `Supprimer « ${competition.nom} » ?`,
    message: EFFETS_DE_LA_SUPPRESSION,
    bouton: 'Supprimer la compétition',
    destructif: true,
  });
  if (!oui || !(await demanderCode('Supprimer la compétition'))) return false;
  avant?.();
  modifier(() => M.supprimerChampionnatDonnees(competition.id));
  return true;
}

// MARK: - La liste

export function ChampionnatsView() {
  const etat = useEtat();
  const championnats = M.championnatsTries();
  const [creation, setCreation] = useState(false);
  const [importCalendrier, setImportCalendrier] = useState(false);
  const [rangement, setRangement] = useState(false);

  useEffect(() => {
    if (rangement && championnats.length < 2) setRangement(false);
  });

  const matchsDeLa = (competition) => {
    const c = cle(competition.nom);
    return etat.rencontres.filter((r) => cle(r.categorie) === c).length;
  };

  const actions = html`
    ${championnats.length > 1 && html`<${Bouton} variante="lien" classe=${rangement ? 'gras' : ''}
      onClick=${() => setRangement(!rangement)}>${rangement ? 'OK' : 'Modifier'}<//>`}
    <${Bouton} variante="lien" icone="calendar.badge.plus" titre="Importer un calendrier" onClick=${() => setImportCalendrier(true)} />
    <${Bouton} variante="lien" icone="plus" titre="Créer une compétition" onClick=${() => setCreation(true)} />`;

  return html`<${Ecran} titre="Compétitions" actions=${actions}>
    ${championnats.length === 0
      ? html`<${Vide} icone="list.number" titre="Aucune compétition"
          texte="Créez vos compétitions (championnat de district ou de ligue, coupe du bar, tournoi…) et collez leur calendrier de la saison : chaque semaine, les matchs s'ouvrent aux paris d'un geste, et les équipes servent à proposer les cotes.">
          <div class="cpt-actions-vide">
            <${Bouton} variante="principal" onClick=${() => setImportCalendrier(true)}>Importer un calendrier (PDF)<//>
            <${Bouton} variante="lien" onClick=${() => setCreation(true)}>Créer une compétition à la main<//>
            <${Bouton} variante="lien" onClick=${() => modifier(() => Exemple.chargerChampionnat())}>Charger l'exemple R3 du classeur<//>
          </div>
        <//>`
      : rangement
        ? html`<${ListeRangeable} championnats=${championnats} />`
        : html`<${Section} classe="cpt-avec-menus" pied=${championnats.length > 1 ? AIDE_ORDRE : null}>
            ${championnats.map((c) => html`<div class="ligne cpt-ligne-menu" key=${c.id}>
              <a class="ligne cpt-lien" href=${`#/competition/${c.id}`}>
                <${LigneCompetition} competition=${c} matchs=${matchsDeLa(c)} />
                <${Icone} nom="chevron.right" taille=${16} classe="chevron" />
              </a>
              <${Menu} icone="ellipsis" titre=${`Options de ${c.nom || 'la compétition'}`}
                items=${[{ libelle: 'Supprimer…', icone: 'trash', destructif: true, onClick: () => supprimerCompetition(c) }]} />
            </div>`)}
          <//>`}
    ${creation && html`<${NouvelleCompetitionSheet} onFermer=${() => setCreation(false)} />`}
    ${importCalendrier && html`<${ImportCalendrierSheet} onFermer=${() => setImportCalendrier(false)} />`}
  <//>`;
}

function LigneCompetition({ competition, matchs }) {
  const equipes = M.lignesDe(competition.id).length;
  const calendrier = journeesDe(competition);
  return html`<span class="ligne-texte">
    <div class="ligne-titre cpt-nom">${competition.nom || 'Sans nom'}</div>
    <div class="ligne-sous-titre">${equipes} équipe${equipes > 1 ? 's' : ''} · ${matchs} match${matchs > 1 ? 's' : ''}</div>
    <div class="cpt-calendrier tertiaire">
      ${calendrier.length
        ? html`<${Icone} nom="calendar" taille=${12} /><span>Calendrier · ${calendrier.length} journées</span>`
        : html`<${IconeCalendrierManquant} /><span>Sans calendrier</span>`}
    </div>
  </span>`;
}

/** « calendar.badge.exclamationmark », absente des icônes de l'app. */
function IconeCalendrierManquant() {
  return html`<svg class="icone" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 2v4" /><path d="M16 2v4" /><path d="M21 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
    <path d="M3 10h18" /><path d="M19 15v3" /><path d="M19 21h.01" /></svg>`;
}

/**
 * « Modifier » : les compétitions se rangent en les faisant glisser par leur poignée (souris ou doigt),
 * ou d'une flèche. Le nouvel ordre est enregistré au lâcher (Grille.deplacer → `ordonner`).
 */
function ListeRangeable({ championnats }) {
  const [ordre, setOrdre] = useState(null);
  const [glisse, setGlisse] = useState(null);
  const lignes = useRef(new Map());
  const ids = ordre ?? championnats.map((c) => c.id);
  const parId = new Map(championnats.map((c) => [c.id, c]));
  const liste = ids.map((id) => parId.get(id)).filter(Boolean);

  const enregistrer = (nouveauxIds) => {
    const actuel = championnats.map((c) => c.id).join();
    if (nouveauxIds.join() !== actuel) {
      modifier(() => ordonner(nouveauxIds.map((id) => M.championnat(id)).filter(Boolean)));
    }
    setOrdre(null);
  };

  const deplacer = (index, sens) => {
    const cible = index + sens;
    if (cible < 0 || cible >= liste.length) return;
    const nouveaux = liste.map((c) => c.id);
    [nouveaux[index], nouveaux[cible]] = [nouveaux[cible], nouveaux[index]];
    enregistrer(nouveaux);
  };

  const commencer = (e, id) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* pointeur déjà relâché */ }
    setOrdre(liste.map((c) => c.id));
    setGlisse(id);
  };

  const suivre = (e) => {
    if (!glisse) return;
    const y = e.clientY;
    const courants = ordre ?? liste.map((c) => c.id);
    const depuis = courants.indexOf(glisse);
    // La place visée : la ligne sous le pointeur (ou la première, ou la dernière).
    let vers = depuis;
    courants.forEach((id, index) => {
      const element = lignes.current.get(id);
      if (!element) return;
      const cadre = element.getBoundingClientRect();
      if (y >= cadre.top && y <= cadre.bottom) vers = index;
      if (index === 0 && y < cadre.top) vers = 0;
      if (index === courants.length - 1 && y > cadre.bottom) vers = courants.length - 1;
    });
    if (vers !== depuis) {
      const nouveaux = [...courants];
      nouveaux.splice(depuis, 1);
      nouveaux.splice(vers, 0, glisse);
      setOrdre(nouveaux);
    }
  };

  const finir = () => {
    if (!glisse) return;
    setGlisse(null);
    enregistrer(ordre ?? liste.map((c) => c.id));
  };

  return html`<${Section} pied=${AIDE_ORDRE}>
    ${liste.map((c, index) => html`<div key=${c.id} ref=${(el) => { if (el) lignes.current.set(c.id, el); else lignes.current.delete(c.id); }}
      class=${`ligne cpt-rangee ${glisse === c.id ? 'cpt-glisse' : ''}`}>
      <span class="cpt-poignee" title="Faire glisser" aria-hidden="true"
        onPointerDown=${(e) => commencer(e, c.id)} onPointerMove=${suivre} onPointerUp=${finir} onPointerCancel=${finir}>
        <${Icone} nom="line.3.horizontal" taille=${20} /></span>
      <span class="ligne-texte"><div class="ligne-titre cpt-nom">${c.nom || 'Sans nom'}</div></span>
      <button type="button" class="cpt-fleche" aria-label=${`Monter ${c.nom}`} disabled=${index === 0}
        onClick=${() => deplacer(index, -1)}><${Icone} nom="chevron.down" taille=${18} classe="cpt-haut" /></button>
      <button type="button" class="cpt-fleche" aria-label=${`Descendre ${c.nom}`} disabled=${index === liste.length - 1}
        onClick=${() => deplacer(index, 1)}><${Icone} nom="chevron.down" taille=${18} /></button>
    </div>`)}
  <//>`;
}

// MARK: - Une compétition

/** La page d'une compétition, en trois blocs : son nom (et son site web), ses équipes et leurs rangs,
 *  son calendrier de la saison et ses matchs. */
export function ChampionnatDetailView({ id }) {
  const [competitionId, sousPage] = String(id).split('/');
  if (sousPage === 'calendrier') return html`<${CalendrierView} competitionId=${competitionId} />`;
  return html`<${DetailCompetition} id=${competitionId} />`;
}

function DetailCompetition({ id }) {
  useEtat();
  const championnat = M.championnat(id);
  const [nom, setNom] = useState(championnat?.nom ?? '');
  const [edition, setEdition] = useState(null);
  const [feuille, setFeuille] = useState(null);
  const nomCourant = useRef(nom);
  nomCourant.current = nom;

  const renommer = (texte = nomCourant.current) => {
    const c = M.championnat(id);
    if (c && texte.trim() && texte.trim() !== c.nom) modifier(() => renommerCompetition(c, texte));
  };
  // En quittant la page, le nom tapé est gardé (onDisappear du Swift).
  useEffect(() => () => renommer(), []);

  if (!championnat) {
    return html`<${Ecran} titre="Compétition" retour="#/competitions">
      <${Vide} icone="list.number" titre="Compétition introuvable" texte="Elle a été supprimée." />
    <//>`;
  }

  const equipes = M.classementDe(championnat.id);
  const rangs = rangsClassement(equipes);
  const parJournee = matchsDe(championnat);
  const calendrier = journeesDe(championnat);
  const page = adresseWeb(championnat.adresse);

  const supprimer = () => supprimerCompetition(championnat, () => naviguer('#/competitions', { remplacer: true }));

  const nouvelleEquipe = async () => {
    const nomEquipe = await saisir({ titre: 'Nouvelle équipe', placeholder: "Nom de l'équipe", bouton: 'Ajouter' });
    if (nomEquipe != null) modifier(() => ajouterEquipe(nomEquipe, M.championnat(id)));
  };

  const options = html`<${Menu} icone="ellipsis.circle" titre="Options" items=${[
    { libelle: championnat.adresse ? 'Changer de site web…' : 'Ajouter un site web…', icone: 'safari', onClick: () => setFeuille('lien') },
    { libelle: 'Coller le calendrier de la saison…', icone: 'calendar.badge.plus', onClick: () => setFeuille('calendrier') },
    { libelle: "Coller un tableau d'équipes…", icone: 'doc.on.clipboard', onClick: () => setFeuille('classement') },
    null,
    { libelle: 'Supprimer la compétition…', icone: 'trash', destructif: true, onClick: supprimer },
  ]} />`;

  const prochaine = calendrier.find((j) => j.restants.length);

  return html`<${Ecran} titre=${championnat.nom || 'Compétition'} retour="#/competitions" libelleRetour="Compétitions" actions=${options}>
    <${Section} titre="Compétition">
      <label class="champ plein cpt-champ-nom">
        <input type="text" value=${nom} placeholder="Nom de la compétition" aria-label="Nom de la compétition"
          autocomplete="off" spellcheck="false" onInput=${(e) => setNom(e.currentTarget.value)}
          onBlur=${() => renommer()} onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
      </label>
      ${page && html`<${Ligne} action avant=${html`<${Icone} nom="safari" />`} onClick=${() => ouvrirLien(page)}
        titre=${html`<span class="ligne-unique cpt-site">${urlCourte(championnat.adresse)}</span>`} />`}
    <//>

    <${Section} titre=${`Équipes · ${equipes.length}`}
      pied="Rangées par points (victoire 3, nul 1), puis différence de buts, puis buts marqués ; elles servent à proposer les cotes. Les rangs suivent les résultats que vous saisissez dans vos journées. Touchez une équipe pour corriger ses résultats ou ajouter ses buts.">
      ${equipes.length > 0 && html`<div class="defilement-x"><table class="tableau cpt-tableau">
        <thead><tr>
          <th class="cpt-rang"><span class="masque">Rang</span></th><th class="equipe">Équipe</th><th>Pts</th><th>J</th>
          <th class="cpt-large">G</th><th class="cpt-large">N</th><th class="cpt-large">P</th>
          <th class="cpt-large">Bp</th><th class="cpt-large">Bc</th><th>Dif</th>
        </tr></thead>
        <tbody>
          ${equipes.map((equipe, index) => {
            const points = pointsLigne(equipe);
            const joues = jouesLigne(equipe);
            const difference = differenceLigne(equipe);
            return html`<tr key=${equipe.id} class="cpt-equipe" tabindex="0" role="button"
              aria-label=${`${equipe.equipe}, ${points} points`}
              onClick=${() => setEdition(equipe.id)} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEdition(equipe.id); } }}>
              <td class="cpt-rang secondaire gras">${joues === 0 && points === 0 ? '–' : rangs[index]}</td>
              <td class="equipe gras">${equipe.equipe}</td>
              <td class="gras">${points} pts</td>
              <td class="secondaire">${joues} J</td>
              <td class="cpt-large secondaire">${equipe.gagnes}</td>
              <td class="cpt-large secondaire">${equipe.nuls}</td>
              <td class="cpt-large secondaire">${equipe.perdus}</td>
              <td class="cpt-large secondaire">${equipe.butsPour}</td>
              <td class="cpt-large secondaire">${equipe.butsContre}</td>
              <td class="secondaire">${difference > 0 ? '+' : ''}${difference}</td>
            </tr>`;
          })}
        </tbody>
      </table></div>`}
      <${Ligne} action avant=${html`<${Icone} nom="plus.circle.fill" taille=${20} />`} titre="Ajouter une équipe" onClick=${nouvelleEquipe} />
    <//>

    <${Section} titre="Calendrier et matchs" pied=${calendrier.length
      ? 'Chaque semaine, dans la journée, « Calendrier » ouvre aux paris les matchs de la journée qui vient. Touchez une journée pour ses paris, ses résultats et ses cotes.'
      : 'Collez une fois le calendrier de la saison (document du district ou de la ligue) : chaque semaine, « Calendrier » dans la journée ouvre ses matchs aux paris d\'un geste. Ou ajoutez les matchs un à un.'}>
      ${calendrier.length === 0
        ? html`<${Ligne} action avant=${html`<${Icone} nom="calendar.badge.plus" />`} titre="Coller le calendrier de la saison…"
            onClick=${() => setFeuille('calendrier')} />`
        : html`<${Ligne} href=${`#/competition/${championnat.id}/calendrier`} chevron
            titre=${html`<span class="cpt-titre-calendrier"><${Icone} nom="calendar" taille=${16} classe="accent" />Calendrier · ${calendrier.length} journées</span>`}
            sousTitre=${prochaine ? `Prochaine à mettre en grille : ${prochaine.intitule}` : 'Tous ses matchs sont passés dans vos grilles.'} />`}
      ${parJournee.map(({ journee, matchs }) => html`<${Ligne} key=${journee.id} href=${`#/journee/${journee.id}`} chevron>
        <div class="rangee espace"><span class="gras cpt-titre-journee">${journee.titre}</span><${BadgeStatutJournee} statut=${journee.statut} /></div>
        <div class="ligne-sous-titre cpt-deux-lignes">${matchs.slice(0, 3).map(M.intitule).join(' · ') + (matchs.length > 3 ? ' · …' : '')}</div>
        <div class="tres-petit secondaire">${matchs.length} match${matchs.length > 1 ? 's' : ''}</div>
      <//>`)}
      <${Ligne} action avant=${html`<${Icone} nom="plus.circle.fill" taille=${20} />`} titre="Ajouter des matchs"
        onClick=${() => { renommer(); setFeuille('matchs'); }} />
    <//>

    ${edition && html`<${LigneClassementEditeur} ligneId=${edition} championnatId=${championnat.id} onFermer=${() => setEdition(null)} />`}
    ${feuille === 'matchs' && html`<${AjoutMatchsCompetition} competitionId=${championnat.id} onTermine=${() => setFeuille(null)} />`}
    ${feuille === 'lien' && html`<${LienPageSheet} competitionId=${championnat.id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'classement' && html`<${CollerClassementSheet} championnatId=${championnat.id} onFermer=${() => setFeuille(null)} />`}
    ${feuille === 'calendrier' && html`<${CollerCalendrierSheet} competitionId=${championnat.id} onFermer=${() => setFeuille(null)} />`}
  <//>`;
}

// MARK: - Site web

/** L'adresse de la compétition sur un site (la cellule « R-3 » du classeur), pour la consulter dans le
 *  navigateur. Facultatif. Comme dans l'app, l'adresse tapée est gardée même sans « OK ». */
function LienPageSheet({ competitionId, onFermer }) {
  const competition = M.championnat(competitionId);
  const [adresse, setAdresse] = useState(competition?.adresse ?? '');
  const garder = (normaliser) => {
    const c = M.championnat(competitionId);
    if (c) {
      const valeur = normaliser ? (adresseWeb(adresse) ?? '') : adresse;
      if (valeur !== c.adresse) modifier(() => { c.adresse = valeur; });
    }
    onFermer();
  };
  return html`<${Feuille} titre="Site web" compacte gauche=${null} onFermer=${() => garder(false)}
    droite=${{ libelle: 'OK', onClick: () => garder(true) }}>
    <${SectionSiteWeb} adresse=${adresse} onChange=${setAdresse} />
  <//>`;
}

// MARK: - Une équipe

function LigneClassementEditeur({ ligneId, championnatId, onFermer }) {
  useEtat();
  // Relue à chaque dessin : les champs écrivent directement dans l'équipe, comme le @Bindable du Swift.
  const actuelle = M.lignesDe(championnatId).find((l) => l.id === ligneId);
  if (!actuelle) return null;

  const changer = (champ) => (valeur) => modifier(() => { actuelle[champ] = valeur; });
  const ok = () => {
    modifier(() => {
      const c = M.championnat(championnatId);
      if (c) c.miseAJour = new Date().toISOString();
    });
    onFermer();
  };
  const retirer = async () => {
    const oui = await confirmer({
      titre: `Retirer « ${actuelle.equipe} » ?`,
      message: 'Elle quitte la compétition avec ses résultats et ses buts. Ses matchs restent dans le calendrier et dans les journées.',
      bouton: "Retirer l'équipe",
      destructif: true,
    });
    if (!oui) return;
    onFermer();
    modifier(() => M.supprimerLigne(ligneId));
  };

  return html`<${Feuille} titre=${actuelle.equipe || 'Nouvelle équipe'} gauche=${null} onFermer=${onFermer}
    droite=${{ libelle: 'OK', onClick: ok }}>
    <${Section}>
      <${ChampTexte} plein majuscules libelle="Équipe" valeur=${actuelle.equipe} onInput=${changer('equipe')} />
    <//>
    <${Section} titre="Matchs joués" pied=${`${pointsLigne(actuelle)} points : victoire 3, nul 1, défaite 0, forfait −1, moins les pénalités.`}>
      <${ChampEntier} libelle="Gagnés" valeur=${actuelle.gagnes} onChange=${changer('gagnes')} />
      <${ChampEntier} libelle="Nuls" valeur=${actuelle.nuls} onChange=${changer('nuls')} />
      <${ChampEntier} libelle="Perdus" valeur=${actuelle.perdus} onChange=${changer('perdus')} />
      <${ChampEntier} libelle="Forfaits" valeur=${actuelle.forfaits} onChange=${changer('forfaits')} />
    <//>
    <${Section} titre="Buts et pénalités">
      <${ChampEntier} libelle="Buts pour" valeur=${actuelle.butsPour} onChange=${changer('butsPour')} />
      <${ChampEntier} libelle="Buts contre" valeur=${actuelle.butsContre} onChange=${changer('butsContre')} />
      <${ChampEntier} libelle="Points de pénalité" valeur=${actuelle.penalites} onChange=${changer('penalites')} />
    <//>
    <${Section}>
      <${Ligne} destructif titre="Retirer l'équipe" onClick=${retirer} />
    <//>
  <//>`;
}

// MARK: - Style propre à ces écrans

injecterStyle('style-competitions', `
.cpt-actions-vide { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 8px; }
.cpt-ligne-menu { padding: 0 8px 0 0; gap: 0; }
.cpt-ligne-menu > .cpt-lien { flex: 1; min-width: 0; align-self: stretch; }
.section.cpt-avec-menus > .liste > :first-child > .cpt-lien { border-top-left-radius: var(--rayon); }
.section.cpt-avec-menus > .liste > :last-child > .cpt-lien { border-bottom-left-radius: var(--rayon); }
.cpt-nom { font-weight: 600; font-size: 17px; }
.cpt-calendrier { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cpt-rangee { gap: 10px; }
.cpt-rangee.cpt-glisse { background: var(--accent-doux); z-index: 2; }
.cpt-poignee { flex: none; display: grid; place-items: center; width: 36px; height: 36px; margin-left: -8px;
  color: var(--texte-3); cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
.cpt-glisse .cpt-poignee { cursor: grabbing; color: var(--accent); }
.cpt-fleche { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 8px;
  background: var(--surface-3); color: var(--accent); }
.cpt-fleche:disabled { opacity: 0.35; }
.cpt-haut { transform: rotate(180deg); }
.cpt-champ-nom input { font-size: 20px; font-weight: 600; padding: 8px 0; }
.cpt-site { display: block; font-size: 15px; }
.cpt-tableau tbody tr { cursor: pointer; }
.cpt-tableau tbody tr:hover, .cpt-tableau tbody tr:focus-visible { background: var(--surface-3); outline: none; }
.cpt-tableau .cpt-rang { width: 34px; text-align: left; }
.cpt-tableau .equipe { width: 100%; min-width: 120px; }
.cpt-tableau th:nth-child(2) { text-align: left; }
@media (max-width: 599px) { .cpt-tableau .cpt-large { display: none; } }
.cpt-titre-calendrier { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.cpt-titre-journee { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpt-deux-lignes { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
`);

/** Une feuille de style propre au module, posée une seule fois. */
function injecterStyle(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}
