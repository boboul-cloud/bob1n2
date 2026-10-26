// Créer une compétition de toutes pièces, ses matchs, son site web : repris de CompetitionViews.swift.

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier, nouvelId } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import * as Collage from '../collage.js';
import { ajouterEquipe, ajouterMatchs, creerCompetition, renommerCompetition } from '../grille.js';
import { reglages, urlWeb } from '../reglages.js';
import { cle, comparerNoms, court } from '../format.js';
import { Bouton, ChampDate, ChampTexte, Choix, Feuille, Icone, Interrupteur, Ligne, Section } from '../ui/composants.js';
import { saisir } from '../ui/dialogues.js';
import { ouvrirLien } from '../ui/systeme.js';

// MARK: - Nouvelle compétition

/** Créer une compétition de toutes pièces, en deux étapes :
 *  ① son nom et ses équipes, ② ses matchs, ouverts aux paris dans une journée. */
export function NouvelleCompetitionSheet({ onFermer }) {
  const [nom, setNom] = useState('');
  const [equipes, setEquipes] = useState('');
  const [adresse, setAdresse] = useState('');
  /** La compétition, créée au premier « Suivant » (un retour en arrière la complète). */
  const [competitionId, setCompetitionId] = useState(null);
  const [etapeMatchs, setEtapeMatchs] = useState(false);

  const vues = new Set();
  const listeEquipes = equipes.split(/\r?\n/).map((l) => l.trim()).filter((l) => {
    if (!l || vues.has(cle(l))) return false;
    vues.add(cle(l));
    return true;
  });

  const suivant = () => {
    const existante = competitionId ? M.championnat(competitionId) : null;
    if (existante) {
      modifier(() => {
        renommerCompetition(existante, nom);
        for (const equipe of listeEquipes) ajouterEquipe(equipe, existante);
        existante.adresse = adresseWeb(adresse) ?? '';
      });
    } else {
      const nouvelle = modifier(() => creerCompetition({ nom, equipes: listeEquipes, adresse: adresseWeb(adresse) ?? '' }));
      setCompetitionId(nouvelle.id);
    }
    setEtapeMatchs(true);
  };

  if (etapeMatchs && competitionId) {
    return html`<${AjoutMatchsCompetition} competitionId=${competitionId} fermeture="Plus tard" onTermine=${onFermer}
      onRetour=${() => setEtapeMatchs(false)} />`;
  }

  return html`<${Feuille} titre="Nouvelle compétition" large onFermer=${onFermer}
    droite=${{ libelle: 'Suivant', onClick: suivant, desactive: !nom.trim() }}>
    <${Section} titre="① Nom de la compétition">
      <${ChampTexte} plein libelle="Nom de la compétition" placeholder="Coupe du bar, D3 - Groupe B…" valeur=${nom}
        onInput=${setNom} autoFocus onEntree=${() => { if (nom.trim()) suivant(); }} />
    <//>
    <${Section} titre=${`Équipes · ${listeEquipes.length}`}
      pied="Une équipe par ligne. Facultatif : vous pourrez aussi créer les équipes en saisissant les matchs, ou les ajouter plus tard.">
      <div class="champ plein">
        <textarea class="cpt-equipes" rows="8" value=${equipes} placeholder=${'AS KERVEN\nFC LANDIVIAU\nUS TREMEUR\n…'}
          aria-label="Équipes, une par ligne" autocapitalize="characters" autocomplete="off" spellcheck="false"
          onInput=${(e) => setEquipes(e.currentTarget.value)}></textarea>
      </div>
    <//>
    <${SectionSiteWeb} adresse=${adresse} onChange=${setAdresse} />
  <//>`;
}

// MARK: - Les matchs d'une compétition

const NOUVELLE = '__nouvelle__';

const ligneVide = () => ({ id: nouvelId(), domicile: '', exterieur: '' });

/**
 * ② Les matchs d'une compétition : la journée des paris, puis domicile et extérieur choisis dans la
 * liste des équipes. Les cotes sont proposées d'office. `fermeture` : le libellé du bouton de gauche
 * (« Annuler », ou « Plus tard » à la création) ; `onRetour` : revenir à l'étape ①, s'il y en a une.
 */
export function AjoutMatchsCompetition({ competitionId, fermeture = 'Annuler', onTermine, onRetour }) {
  useEtat();
  const competition = M.championnat(competitionId);
  const ouvertes = M.journeesTriees().filter((j) => j.statut === 'ouverte');
  const [destination, setDestination] = useState(() => ouvertes[0]?.id ?? null);
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString());
  const [lignes, setLignes] = useState(() => [ligneVide(), ligneVide(), ligneVide()]);
  const [proposer, setProposer] = useState(true);

  // La journée choisie a pu être supprimée ou fermée entre-temps.
  useEffect(() => {
    if (destination && !ouvertes.some((j) => j.id === destination)) setDestination(null);
  });

  if (!competition) return null;

  const equipes = M.lignesDe(competition.id).map((l) => l.equipe).sort(comparerNoms);
  const prets = lignes.filter((l) => l.domicile && l.exterieur && cle(l.domicile) !== cle(l.exterieur));
  const titreParDefaut = `Journée du ${court(date)}`;

  const changer = (id, cote, valeur) => setLignes((liste) => liste.map((l) => (l.id === id ? { ...l, [cote]: valeur } : l)));

  /** « Nouvelle équipe… » : elle rejoint la compétition et prend la case qui l'attendait. */
  const creerEquipe = async (id, cote) => {
    const nomEquipe = await saisir({
      titre: 'Nouvelle équipe',
      message: `Elle rejoint les équipes de « ${competition.nom} ».`,
      placeholder: "Nom de l'équipe",
      bouton: 'Ajouter',
    });
    if (nomEquipe == null) return;
    const ligne = modifier(() => ajouterEquipe(nomEquipe, M.championnat(competitionId)));
    if (ligne) changer(id, cote, ligne.equipe);
  };

  const choix = (ligne, cote, libelle) => {
    const valeur = ligne[cote];
    return html`<label class=${`cpt-case ${valeur ? 'choisie' : ''}`}>
      <span class="cpt-case-texte">${valeur || libelle}</span>
      <select aria-label=${valeur ? `${libelle} : ${valeur}` : libelle} value=${valeur}
        onChange=${(e) => {
          const v = e.currentTarget.value;
          if (v === NOUVELLE) {
            e.currentTarget.value = valeur;
            creerEquipe(ligne.id, cote);
          } else {
            changer(ligne.id, cote, v);
          }
        }}>
        <option value="" disabled selected=${!valeur}>${libelle}</option>
        ${equipes.map((equipe) => html`<option value=${equipe} selected=${equipe === valeur}>${equipe === valeur ? `✓ ${equipe}` : equipe}</option>`)}
        <option value=${NOUVELLE}>Nouvelle équipe…</option>
      </select>
    </label>`;
  };

  const ajouter = () => {
    modifier(() => {
      const cible = (destination && M.journee(destination))
        || Caisse.nouvelleJournee({ titre: titre.trim() ? titre : titreParDefaut, date });
      const matchs = prets.map((l) => Collage.matchLu(l.domicile, l.exterieur));
      ajouterMatchs(matchs, cible, { categorie: competition.nom, proposer, marge: reglages().margeCotes });
    });
    onTermine();
  };

  const options = [
    { valeur: null, libelle: 'Nouvelle journée' },
    ...ouvertes.map((j) => ({ valeur: j.id, libelle: `${j.titre} · ${M.matchs(j.id).length} matchs` })),
  ];

  return html`<${Feuille} titre=${competition.nom ? `Matchs · ${competition.nom}` : 'Matchs'} large onFermer=${onTermine}
    gauche=${{ libelle: fermeture, onClick: onTermine }}
    droite=${{ libelle: prets.length > 1 ? `Ouvrir ${prets.length} matchs aux paris` : 'Ouvrir aux paris', onClick: ajouter, desactive: !prets.length }}>
    ${onRetour && html`<div class="cpt-retour"><${Bouton} variante="lien" icone="chevron.left" onClick=${onRetour}>Nouvelle compétition<//></div>`}
    <${Section} titre="② Journée des paris" pied="Les matchs rejoignent cette journée et y sont aussitôt ouverts aux paris.">
      <${Choix} libelle="Journée" valeur=${destination} options=${options} onChange=${setDestination} />
      ${destination == null && html`
        <${ChampTexte} libelle="Titre" valeur=${titre} onInput=${setTitre} placeholder=${titreParDefaut} />
        <${ChampDate} libelle="Date" valeur=${date} onChange=${setDate} />`}
    <//>
    <${Section} titre=${`Matchs · ${prets.length} prêt${prets.length > 1 ? 's' : ''}`}
      pied=${equipes.length
        ? 'Touchez une case pour choisir l\'équipe, ou « Nouvelle équipe… ». Le bouton ⊖ retire un match.'
        : 'Touchez « Domicile » puis « Nouvelle équipe… » : les équipes se créent au fil des matchs.'}>
      ${lignes.map((ligne) => html`<div class="ligne cpt-match" key=${ligne.id}>
        ${choix(ligne, 'domicile', 'Domicile')}
        <span class="secondaire">–</span>
        ${choix(ligne, 'exterieur', 'Extérieur')}
        <button type="button" class="cpt-retirer" title="Retirer ce match" aria-label="Retirer ce match"
          onClick=${() => setLignes((liste) => liste.filter((l) => l.id !== ligne.id))}>
          <${Icone} nom="minus.circle" taille=${20} /></button>
      </div>`)}
      <${Ligne} action avant=${html`<${Icone} nom="plus.circle.fill" taille=${20} />`} titre="Ajouter un match"
        onClick=${() => setLignes((liste) => [...liste, ligneVide()])} />
    <//>
    <${Section} pied="Proposées d'après les rangs des équipes ; elles s'ajustent ensuite dans la journée, bouton « Cotes ».">
      <${Interrupteur} libelle="Proposer les cotes" valeur=${proposer} onChange=${setProposer} />
    <//>
  <//>`;
}

// MARK: - Site web

/** L'adresse complétée (« https://… »), ou `null` si ce n'en est pas une. Comme `urlWeb`, mais un nom de
 *  domaine à espaces est refusé : Chrome l'accepte en l'encodant (« pas%20une%20adresse »). */
export function adresseWeb(texte) {
  const url = urlWeb(texte);
  if (!url) return null;
  const domaine = new URL(url).hostname;
  return /^[a-z0-9.-]+$/i.test(domaine) ? url : null;
}

/** Le site web d'une compétition : une adresse, ouverte dans le navigateur pour consulter. Facultatif. */
export function SectionSiteWeb({ adresse, onChange }) {
  const texte = adresse ?? '';
  const url = adresseWeb(texte);
  return html`<${Section} titre="Site web (facultatif)"
    pied="La page de la compétition, pour la consulter dans votre navigateur. L'app n'en lit rien : les matchs viennent du calendrier de la saison, les résultats se saisissent d'un appui.">
    <${ChampTexte} plein type="url" inputMode="url" libelle="Adresse du site web" placeholder="https://…" valeur=${texte}
      onInput=${onChange} autoComplete="url" />
    ${texte && (url
      ? html`
        <${Ligne} action avant=${html`<${Icone} nom="safari" />`} titre="Ouvrir dans le navigateur" onClick=${() => ouvrirLien(url)} />
        <${Ligne} destructif titre="Retirer l'adresse" onClick=${() => onChange('')} />`
      : html`<div class="ligne orange petit"><${Icone} nom="exclamationmark.triangle" taille=${16} />
          <span>Cette adresse n'est pas valable.</span></div>`)}
  <//>`;
}

// MARK: - Style propre à ces écrans

injecterStyle('style-competition-vues', `
.champ textarea.cpt-equipes { flex: 1; width: 100%; min-height: 180px; border: 0; outline: none; background: none; resize: vertical;
  padding: 8px 0; color: var(--texte); line-height: 1.45; font-family: var(--police); font-size: 16px; }
.cpt-equipes::placeholder { color: var(--texte-3); }
.cpt-retour { margin: 6px 0 -10px; }
.cpt-match { gap: 8px; padding-top: 8px; padding-bottom: 8px; }
.cpt-case { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center;
  min-height: 36px; padding: 4px 8px; border-radius: 8px; background: var(--surface-3); color: var(--texte-2);
  font-size: 15px; cursor: pointer; }
.cpt-case.choisie { color: var(--texte); font-weight: 600; }
.cpt-case-texte { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }
.cpt-case select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;
  font-size: 16px; appearance: none; -webkit-appearance: none; }
.cpt-case:focus-within { box-shadow: 0 0 0 2px var(--accent-doux); }
.cpt-retirer { flex: none; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0;
  border-radius: 50%; background: none; color: var(--rouge); }
.cpt-retirer:hover { background: color-mix(in srgb, var(--rouge) 12%, transparent); }
`);

/** Une feuille de style propre au module, posée une seule fois. */
function injecterStyle(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}
