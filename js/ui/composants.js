// Les briques communes des écrans : l'équivalent de Composants.swift et des vues SwiftUI de base
// (List, Section, LabeledContent, Toggle, Picker, sheet, Menu…). Préact + htm, sans compilation :
//   import { html, useState } from '../../vendor/preact-htm.js';
//   html`<${Ligne} titre="Joueurs" chevron onClick=${…} />`

import { html, render, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { ICONES } from './icones-svg.js';
import { enCote, lireNombre, nombre, versChampDate, depuisChampDate } from '../format.js';
import { EXPLICATION_ISSUE, STATUTS_JOURNEE } from '../modele.js';
import { ETATS_PRONOSTIC } from '../calcul.js';

const classes = (...noms) => noms.filter(Boolean).join(' ');

// MARK: - Icône

/** Une icône, sous le nom du symbole SF du code Swift (« soccerball », « person.2 »…). */
export function Icone({ nom, taille = 18, classe = '', epaisseur = 2 }) {
  const contenu = ICONES[nom] ?? '<circle cx="12" cy="12" r="9"/>';
  return html`<svg class=${classes('icone', classe)} width=${taille} height=${taille} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width=${epaisseur} stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" dangerouslySetInnerHTML=${{ __html: contenu }}></svg>`;
}

// MARK: - Écran

/**
 * Un écran : grand titre, bouton retour (`retour` : true pour revenir en arrière, ou un chemin
 * « #/journees »), actions à droite (boutons, menus).
 */
export function Ecran({ titre, sousTitre, retour, libelleRetour = 'Retour', actions, large, children }) {
  const revenir = () => {
    if (typeof retour === 'string') {
      location.hash = retour;
    } else if (history.length > 1) {
      history.back();
    } else {
      location.hash = '#/accueil';
    }
  };
  useEffect(() => {
    document.title = titre && titre !== 'Bob 1N2' ? `${titre} · Bob 1N2` : 'Bob 1N2';
  }, [titre]);
  return html`<div class=${classes('ecran', large && 'large')}>
    <header class="entete">
      <div class="entete-barre">
        ${retour && html`<button class="bouton-retour" onClick=${revenir}>
          <${Icone} nom="chevron.left" taille=${22} />${libelleRetour}</button>`}
        <div class="actions">${actions}</div>
      </div>
      ${titre && html`<h1>${titre}</h1>`}
      ${sousTitre && html`<div class="sous-titre">${sousTitre}</div>`}
    </header>
    ${children}
  </div>`;
}

// MARK: - Listes groupées

/** Une section de liste groupée : titre au-dessus, note en dessous. `nue` : sans fond blanc. */
export function Section({ titre, pied, actions, nue, classe, children }) {
  return html`<section class=${classes('section', classe)}>
    ${(titre || actions) && html`<div class="section-titre"><span>${titre}</span>
      ${actions && html`<span class="actions">${actions}</span>`}</div>`}
    ${nue ? children : html`<div class="liste">${children}</div>`}
    ${pied && html`<div class="section-pied">${pied}</div>`}
  </section>`;
}

/**
 * Une ligne de liste. Avec `onClick` (ou `href`), elle se touche. `icone` : symbole dans une pastille
 * de couleur ; `detail` : texte ou élément à droite ; `chevron` : flèche de navigation.
 */
export function Ligne({ titre, sousTitre, detail, icone, couleurIcone, avant, chevron, onClick, href,
  destructif, action, desactive, classe, children }) {
  const contenu = html`
    ${avant}
    ${icone && html`<span class="ligne-icone" style=${couleurIcone ? `color:${couleurIcone};background:color-mix(in srgb, ${couleurIcone} 15%, transparent)` : ''}>
      <${Icone} nom=${icone} taille=${17} /></span>`}
    <span class="ligne-texte">
      ${titre != null && html`<div class="ligne-titre">${titre}</div>`}
      ${sousTitre && html`<div class="ligne-sous-titre">${sousTitre}</div>`}
      ${children}
    </span>
    ${detail != null && html`<span class="ligne-detail">${detail}</span>`}
    ${chevron && html`<${Icone} nom="chevron.right" taille=${16} classe="chevron" />`}`;
  const cls = classes('ligne', icone && 'avec-icone', destructif && 'destructif', action && 'action', desactive && 'desactive', classe);
  if (href) return html`<a class=${cls} href=${href}>${contenu}</a>`;
  if (onClick) return html`<button type="button" class=${cls} onClick=${onClick} disabled=${desactive}>${contenu}</button>`;
  return html`<div class=${cls}>${contenu}</div>`;
}

/** « Libellé ……… valeur » (LabeledContent). */
export function LigneValeur({ libelle, valeur, classe }) {
  return html`<div class=${classes('ligne', classe)}><span class="ligne-texte">${libelle}</span>
    <span class="ligne-detail chiffres">${valeur}</span></div>`;
}

// MARK: - Boutons

/** variante : « principal », « destructif », « plein » (avec destructif), « lien » ; taille : « petit », « grand ». */
export function Bouton({ onClick, href, icone, variante, taille, bloc, desactive, titre, type = 'button', classe, children }) {
  const cls = classes('bouton', variante, variante === 'plein' && 'destructif', taille, bloc && 'bloc',
    !children && icone && 'icone-seule', desactive && 'desactive', classe);
  const contenu = html`${icone && html`<${Icone} nom=${icone} taille=${taille === 'petit' ? 16 : 18} />`}${children}`;
  if (href) return html`<a class=${cls} href=${href} title=${titre} target=${href.startsWith('http') ? '_blank' : undefined} rel="noopener">${contenu}</a>`;
  return html`<button type=${type} class=${cls} onClick=${onClick} disabled=${desactive} title=${titre} aria-label=${titre}>${contenu}</button>`;
}

/** Bouton d'issue 1 / N / 2 avec sa cote. style : « choix » (pari) ou « resultat » (vert). */
export function BoutonIssue({ issue, cote, selectionne, style = 'choix', desactive, onClick }) {
  const cls = classes('bouton-issue', selectionne && 'selectionne', style === 'resultat' && 'resultat', cote == null && 'sans-cote');
  return html`<button type="button" class=${cls} disabled=${desactive} onClick=${onClick}
    aria-pressed=${!!selectionne} aria-label=${`${EXPLICATION_ISSUE[issue] ?? 'Annulé'}${cote != null ? `, cote ${enCote(cote)}` : ''}`}>
    <span class="issue">${issue}</span>
    ${cote != null && html`<span class="cote">${enCote(cote)}</span>`}
  </button>`;
}

/** Bouton carré, icône au-dessus du libellé : les actions d'une fiche, côte à côte.
 *  couleur : « vert », « orange », « rouge », « bleu », « violet » (accent par défaut). */
export function TuileAction({ titre, symbole, couleur, pleine, desactive, onClick }) {
  return html`<button type="button" class=${classes('tuile', couleur, pleine && 'pleine')} disabled=${desactive} onClick=${onClick}>
    <${Icone} nom=${symbole} taille=${22} />
    <span>${titre}</span>
  </button>`;
}

// MARK: - Pastilles et badges

export function PastilleNumero({ numero }) {
  return html`<span class="pastille">${numero}</span>`;
}

/** couleur : « vert », « orange », « rouge », « bleu », « accent » ; secondaire par défaut. */
export function Badge({ texte, symbole, couleur }) {
  return html`<span class=${classes('badge', couleur)}>${symbole && html`<${Icone} nom=${symbole} taille=${12} />`}${texte}</span>`;
}

export function BadgeStatutJournee({ statut }) {
  const s = STATUTS_JOURNEE[statut] ?? STATUTS_JOURNEE.ouverte;
  return html`<${Badge} texte=${s.libelle} symbole=${s.symbole} couleur=${s.couleur === 'secondaire' ? null : s.couleur} />`;
}

export function IconeEtat({ etat }) {
  const e = ETATS_PRONOSTIC[etat] ?? ETATS_PRONOSTIC.enAttente;
  const couleur = { vert: 'vert', rouge: 'rouge', orange: 'orange' }[e.couleur] ?? 'tertiaire';
  return html`<span class=${couleur} title=${e.libelle}><${Icone} nom=${e.symbole} taille=${18} /></span>`;
}

/** Une valeur mise en avant : « PORTE-FEUILLES 120 pts ». couleur : classe de couleur du texte. */
export function Chiffre({ titre, valeur, symbole, couleur }) {
  return html`<div class="chiffre">
    <div class="chiffre-titre">${symbole && html`<${Icone} nom=${symbole} taille=${13} />`}${titre}</div>
    <div class=${classes('chiffre-valeur', couleur)}>${valeur}</div>
  </div>`;
}

/** Carte de fond des blocs de l'accueil. */
export function Carte({ titre, symbole, actions, classe, children }) {
  return html`<div class=${classes('carte', classe)}>
    ${(titre || actions) && html`<div class="carte-titre">${symbole && html`<${Icone} nom=${symbole} taille=${18} classe="accent" />`}
      <span>${titre}</span>${actions && html`<span class="actions">${actions}</span>`}</div>`}
    ${children}
  </div>`;
}

/** Écran vide : « Aucun joueur », une explication et une action (ContentUnavailableView). */
export function Vide({ icone, titre, texte, children }) {
  return html`<div class="vide">
    ${icone && html`<${Icone} nom=${icone} taille=${44} epaisseur=${1.6} />`}
    ${titre && html`<h3>${titre}</h3>`}
    ${texte && html`<p>${texte}</p>`}
    ${children}
  </div>`;
}

/** Un encadré d'explication ou d'avertissement. couleur : « orange », « rouge ». */
export function Encadre({ icone = 'info.circle', couleur, children }) {
  return html`<div class=${classes('encadre', couleur)}><${Icone} nom=${icone} taille=${18} />
    <div class="grandit">${children}</div></div>`;
}

// MARK: - Champs de formulaire (à poser dans une Section)

/** Champ texte. `plein` : sans libellé à gauche, le champ prend toute la ligne. */
export function ChampTexte({ libelle, valeur, onInput, placeholder, type = 'text', majuscules, autoFocus,
  plein, aide, inputMode, autoComplete, desactive, onEntree }) {
  const ref = useRef();
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, []);
  return html`<label class=${classes('champ', plein && 'plein', majuscules && 'majuscules')}>
    ${!plein && html`<span class="champ-libelle">${libelle}${aide && html`<span class="champ-aide">${aide}</span>`}</span>`}
    <input ref=${ref} type=${type} value=${valeur ?? ''} placeholder=${placeholder ?? (plein ? libelle : '')}
      inputmode=${inputMode} autocomplete=${autoComplete ?? 'off'} autocapitalize=${majuscules ? 'characters' : 'sentences'}
      disabled=${desactive}
      onInput=${(e) => onInput?.(majuscules ? e.currentTarget.value.toUpperCase() : e.currentTarget.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter' && onEntree) { e.preventDefault(); onEntree(); } }} />
  </label>`;
}

/** Zone de texte sur plusieurs lignes (texte collé). */
export function ChampZone({ valeur, onInput, placeholder, lignes = 8, autoFocus }) {
  const ref = useRef();
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, []);
  return html`<div class="champ plein"><textarea ref=${ref} rows=${lignes} placeholder=${placeholder}
    value=${valeur} onInput=${(e) => onInput(e.currentTarget.value)} spellcheck="false"></textarea></div>`;
}

/**
 * Champ numérique à virgule (cotes, points). `entier` : nombre entier seulement (une mise).
 * Le texte tapé est gardé tel quel pendant la saisie ; la valeur suit dès qu'elle est lisible.
 */
export function ChampNombre({ libelle, valeur, onChange, entier, minimum, aide, largeur, desactive, autoFocus }) {
  const [texte, setTexte] = useState(valeur == null ? '' : nombre(valeur));
  const [focus, setFocus] = useState(false);
  const ref = useRef();
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, []);
  useEffect(() => {
    if (!focus) setTexte(valeur == null ? '' : nombre(valeur));
  }, [valeur, focus]);
  const lire = (t) => {
    let n = lireNombre(t);
    if (n == null) return null;
    if (entier) n = Math.round(n);
    if (minimum != null) n = Math.max(minimum, n);
    return n;
  };
  return html`<label class="champ">
    <span class="champ-libelle">${libelle}${aide && html`<span class="champ-aide">${aide}</span>`}</span>
    <input ref=${ref} type="text" inputmode=${entier ? 'numeric' : 'decimal'} value=${texte} disabled=${desactive}
      style=${largeur ? `width:${largeur}px` : 'width:110px'}
      onFocus=${(e) => { setFocus(true); e.currentTarget.select(); }}
      onBlur=${() => { setFocus(false); const n = lire(texte); if (n != null) onChange(n); }}
      onInput=${(e) => { const t = e.currentTarget.value; setTexte(t); const n = lire(t); if (n != null) onChange(n); }} />
  </label>`;
}

/** Champ entier avec boutons − / + (classements). */
export function ChampEntier({ libelle, valeur, onChange, minimum = 0, maximum = 999, aide }) {
  const borner = (n) => Math.min(maximum, Math.max(minimum, n));
  return html`<div class="champ">
    <span class="champ-libelle">${libelle}${aide && html`<span class="champ-aide">${aide}</span>`}</span>
    <span class="pas-a-pas">
      <button type="button" aria-label="Moins" onClick=${() => onChange(borner(valeur - 1))} disabled=${valeur <= minimum}><${Icone} nom="minus" taille=${16} /></button>
      <input type="text" inputmode="numeric" value=${valeur}
        onInput=${(e) => { const n = parseInt(e.currentTarget.value, 10); if (!Number.isNaN(n)) onChange(borner(n)); }} />
      <button type="button" aria-label="Plus" onClick=${() => onChange(borner(valeur + 1))} disabled=${valeur >= maximum}><${Icone} nom="plus" taille=${16} /></button>
    </span>
  </div>`;
}

/** Interrupteur (Toggle). */
export function Interrupteur({ libelle, valeur, onChange, aide, desactive }) {
  return html`<label class="champ">
    <span class="champ-libelle">${libelle}${aide && html`<span class="champ-aide">${aide}</span>`}</span>
    <span class="interrupteur"><input type="checkbox" checked=${!!valeur} disabled=${desactive}
      onChange=${(e) => onChange(e.currentTarget.checked)} /><span class="piste"></span></span>
  </label>`;
}

/** Liste déroulante (Picker). options : [{ valeur, libelle }] ; les valeurs peuvent être des nombres. */
export function Choix({ libelle, valeur, options, onChange, aide, desactive }) {
  const index = options.findIndex((o) => o.valeur === valeur);
  return html`<label class="champ">
    <span class="champ-libelle">${libelle}${aide && html`<span class="champ-aide">${aide}</span>`}</span>
    <select disabled=${desactive} value=${index < 0 ? '' : String(index)}
      onChange=${(e) => { const o = options[Number(e.currentTarget.value)]; if (o) onChange(o.valeur); }}>
      ${index < 0 && html`<option value="" disabled selected hidden>—</option>`}
      ${options.map((o, i) => html`<option value=${String(i)} selected=${i === index}>${o.libelle}</option>`)}
    </select>
    <${Icone} nom="chevron.down" taille=${14} classe="fleche-choix" />
  </label>`;
}

/** Choix segmenté (Picker .segmented). options : [{ valeur, libelle }]. */
export function Segment({ options, valeur, onChange, classe }) {
  return html`<div class=${classes('segment', classe)} role="tablist">
    ${options.map((o) => html`<button type="button" role="tab" aria-selected=${o.valeur === valeur}
      class=${o.valeur === valeur ? 'actif' : ''} onClick=${() => onChange(o.valeur)}>${o.libelle}</button>`)}
  </div>`;
}

/** Champ date (jour seulement) ; valeur et rendu en texte ISO, à midi. */
export function ChampDate({ libelle, valeur, onChange }) {
  return html`<label class="champ">
    <span class="champ-libelle">${libelle}</span>
    <input type="date" value=${versChampDate(valeur)}
      onInput=${(e) => { const iso = depuisChampDate(e.currentTarget.value); if (iso) onChange(iso); }} />
  </label>`;
}

/** Barre de recherche (searchable). */
export function Recherche({ valeur, onInput, placeholder = 'Rechercher' }) {
  return html`<label class="recherche"><${Icone} nom="magnifyingglass" taille=${16} />
    <input type="search" value=${valeur} placeholder=${placeholder} onInput=${(e) => onInput(e.currentTarget.value)} /></label>`;
}

// MARK: - Feuille modale

/** Les feuilles ouvertes, de la plus ancienne à celle du dessus : seule celle du dessus répond à Échap. */
const pileFeuilles = [];

/**
 * Feuille modale (sheet) : titre au centre, « Annuler » à gauche, action principale à droite.
 * gauche / droite : { libelle, onClick, desactive } (droite en gras, sauf `gras: false`) ; `onFermer` :
 * touche Échap ou clic sur le voile.
 * `pied` : élément fixé en bas (un gros bouton de validation, par exemple). `large` : plus large.
 */
export function Feuille({ titre, onFermer, gauche, droite, pied, large, compacte, children }) {
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  useEffect(() => {
    const moi = {};
    pileFeuilles.push(moi);
    document.body.classList.add('feuille-ouverte');
    const touche = (e) => {
      // Une alerte ou un menu ouvert par-dessus traite Échap lui-même.
      if (e.key !== 'Escape' || pileFeuilles[pileFeuilles.length - 1] !== moi) return;
      if (document.querySelector('.voile.pour-alerte, .menu-liste')) return;
      if (fermer.current) {
        e.stopPropagation();
        fermer.current();
      }
    };
    addEventListener('keydown', touche);
    return () => {
      removeEventListener('keydown', touche);
      pileFeuilles.splice(pileFeuilles.indexOf(moi), 1);
      if (!pileFeuilles.length) document.body.classList.remove('feuille-ouverte');
    };
  }, []);
  const g = gauche === undefined && onFermer ? { libelle: 'Annuler', onClick: onFermer } : gauche;
  return html`<div class="voile" onClick=${(e) => { if (e.target === e.currentTarget) onFermer?.(); }}>
    <div class=${classes('feuille', large && 'large', compacte && 'compacte')} role="dialog" aria-modal="true" aria-label=${titre}>
      <div class="feuille-entete">
        <span class="gauche">${g && html`<${Bouton} variante="lien" onClick=${g.onClick} desactive=${g.desactive}>${g.libelle}<//>`}</span>
        <h2>${titre}</h2>
        <span class="droite">${droite && html`<${Bouton} variante="lien" classe=${droite.gras === false ? '' : 'gras'} onClick=${droite.onClick} desactive=${droite.desactive}>${droite.libelle}<//>`}</span>
      </div>
      <div class="feuille-corps">${children}</div>
      ${pied && html`<div class="feuille-pied">${pied}</div>`}
    </div>
  </div>`;
}

// MARK: - Menu

/**
 * Menu déroulant (Menu SwiftUI). items : [{ libelle, icone, onClick, destructif, desactive }],
 * `null` pour un séparateur, { titre } pour un intitulé. Le bouton : `libelle` et/ou `icone`.
 */
export function Menu({ libelle, icone = 'ellipsis.circle', items, variante = 'lien', aGauche, auDessus, titre }) {
  const [ouvert, setOuvert] = useState(null);
  const ref = useRef();
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (!ref.current?.contains(e.target)) setOuvert(null); };
    const touche = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOuvert(null); } };
    // Le menu est posé par-dessus tout, au droit du bouton : il se ferme si la page défile.
    const defile = (e) => { if (!ref.current?.contains(e.target)) setOuvert(null); };
    document.addEventListener('pointerdown', dehors);
    addEventListener('keydown', touche, true);
    addEventListener('scroll', defile, true);
    addEventListener('resize', defile);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      removeEventListener('keydown', touche, true);
      removeEventListener('scroll', defile, true);
      removeEventListener('resize', defile);
    };
  }, [ouvert]);
  const ouvrir = () => {
    if (ouvert) { setOuvert(null); return; }
    const r = ref.current.getBoundingClientRect();
    const enHaut = auDessus || (innerHeight - r.bottom < 280 && r.top > innerHeight - r.bottom);
    const position = { position: 'fixed', top: 'auto', bottom: 'auto', left: 'auto', right: 'auto', zIndex: 400 };
    if (enHaut) position.bottom = `${innerHeight - r.top + 6}px`; else position.top = `${r.bottom + 6}px`;
    if (aGauche || r.left + r.width / 2 < innerWidth / 2) position.left = `${Math.max(8, r.left)}px`;
    else position.right = `${Math.max(8, innerWidth - r.right)}px`;
    position.maxHeight = `${Math.max(160, enHaut ? r.top - 16 : innerHeight - r.bottom - 16)}px`;
    position.overflowY = 'auto';
    setOuvert(position);
  };
  const visibles = items.filter((x) => x !== undefined && x !== false);
  const style = ouvert ? Object.entries(ouvert).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`).join(';') : '';
  // La liste est rendue à part, au niveau de la page (un en-tête flouté ou une zone qui défile la
  // couperait ou la décalerait) ; `ref` la compte comme faisant partie du menu.
  return html`<span class="menu-ancre" ref=${ref}>
    <${Bouton} variante=${variante} icone=${icone} titre=${titre ?? libelle ?? 'Plus'} onClick=${ouvrir}>${libelle}<//>
    ${ouvert && html`<${Portail} ancre=${ref}><div class="menu-liste" style=${style} role="menu">
      ${visibles.map((item) => {
        if (item === null) return html`<div class="menu-separateur"></div>`;
        if (item.titre) return html`<div class="menu-titre">${item.titre}</div>`;
        return html`<button type="button" role="menuitem" class=${classes('menu-element', item.destructif && 'destructif')}
          disabled=${item.desactive} onClick=${() => { setOuvert(null); item.onClick?.(); }}>
          <span>${item.libelle}</span>${item.icone && html`<${Icone} nom=${item.icone} taille=${17} />`}
        </button>`;
      })}
    </div><//>`}
  </span>`;
}

/** Rend ses enfants dans un conteneur posé sur <body> (Préact sans compat n'a pas createPortal).
 *  Le conteneur est rattaché à `ancre` pour que les clics dedans comptent comme « dans le menu ». */
function Portail({ ancre, children }) {
  const hote = useRef(null);
  if (!hote.current && typeof document !== 'undefined') {
    hote.current = document.createElement('div');
    hote.current.className = 'portail';
  }
  useEffect(() => {
    document.body.append(hote.current);
    const contient = ancre.current.contains.bind(ancre.current);
    // Les clics dans la liste ne ferment pas le menu avant d'avoir agi.
    ancre.current.contains = (n) => contient(n) || hote.current.contains(n);
    return () => {
      render(null, hote.current);
      hote.current.remove();
      if (ancre.current) delete ancre.current.contains;
    };
  }, []);
  useEffect(() => { render(children, hote.current); });
  return null;
}

// MARK: - Petits utilitaires

/** Un nom d'équipe ou de joueur en initiales dans un rond. */
export function Avatar({ texte }) {
  return html`<span class="avatar">${texte}</span>`;
}

/** Garde la valeur du champ pendant la saisie et ne la rend qu'à la fin (texte d'un formulaire). */
export function useBrouillon(initial) {
  const [valeur, setValeur] = useState(initial);
  return [valeur, setValeur];
}
