// Le mode d'emploi intégré (ModeDEmploiView.swift, ModeDEmploi.swift) : les chapitres, et une
// recherche dans tout le texte. Lisible sans connexion. Adresses : #/aide, #/aide/<chapitre>,
// #/aide/<chapitre>/<numéro de partie> (ouvert depuis une recherche, il se place sur la partie).

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { Ecran, Section, Ligne, Icone, Recherche, Vide } from '../ui/composants.js';
import { cle } from '../format.js';
import { CHAPITRES } from '../mode-emploi-texte.js';

/** Espaces insécables de la typographie française : un guillemet ou un deux-points ne se retrouve
 *  jamais seul en début ou en fin de ligne. */
function insecable(texte) {
  return String(texte ?? '')
    .replaceAll('« ', '« ')
    .replaceAll(' »', ' »')
    .replaceAll(' :', ' :')
    .replaceAll(' ;', ' ;')
    .replaceAll(' ?', ' ?')
    .replaceAll(' !', ' !');
}

/** Les chapitres qui parlent du texte cherché (sans casse ni accents), avec leurs parties concernées :
 *  [{ chapitre, parties: [{ partie, index }] }]. */
export function rechercher(texte) {
  const mots = cle(texte).split(' ').filter(Boolean);
  if (!mots.length) return [];
  const contient = (s) => {
    const c = cle(s);
    return mots.every((m) => c.includes(m));
  };
  return CHAPITRES.map((chapitre) => {
    const parties = chapitre.parties.map((partie, index) => ({ partie, index }))
      .filter(({ partie }) => contient([partie.titre, partie.texte, ...(partie.etapes ?? []), partie.exemple ?? ''].join(' ')));
    if (parties.length) return { chapitre, parties };
    return contient(`${chapitre.titre} ${chapitre.resume}`)
      ? { chapitre, parties: chapitre.parties.map((partie, index) => ({ partie, index })) }
      : null;
  }).filter(Boolean);
}

export function ModeDEmploiView({ chapitre }) {
  if (chapitre) {
    const [id, partie] = chapitre.split('/');
    const trouve = CHAPITRES.find((c) => c.id === id);
    if (trouve) return html`<${ChapitreView} chapitre=${trouve} partie=${partie == null ? null : Number(partie)} />`;
  }
  return html`<${Sommaire} />`;
}

function Sommaire() {
  const [recherche, setRecherche] = useState('');
  const vide = !recherche.trim();
  const trouves = vide ? [] : rechercher(recherche);
  return html`<${Ecran} titre="Mode d'emploi">
    <div style="margin: 4px 0 8px">
      <${Recherche} valeur=${recherche} onInput=${setRecherche} placeholder="Chercher dans le mode d'emploi" />
    </div>
    ${vide ? html`
      <${Section} nue>
        <p class="note" style="padding: 4px 4px 0">Tout Bob 1N2, chapitre par chapitre, lisible sans connexion. Touchez un chapitre, ou cherchez un mot : calendrier, Goliath, code barman…</p>
      <//>
      <${Section} titre="Chapitres">
        ${CHAPITRES.map((c) => html`<${Ligne} key=${c.id} href=${`#/aide/${c.id}`} icone=${c.symbole}
          titre=${c.titre} sousTitre=${insecable(c.resume)} chevron />`)}
      <//>` : html`
      ${trouves.length === 0 && html`<${Vide} icone="magnifyingglass" titre=${`Aucun résultat pour « ${recherche.trim()} »`}
        texte="Vérifiez l'orthographe ou essayez un autre mot." />`}
      ${trouves.map(({ chapitre, parties }) => html`<${Section} key=${chapitre.id} titre=${chapitre.titre}>
        ${parties.map(({ partie, index }) => html`<${Ligne} key=${index} href=${`#/aide/${chapitre.id}/${index}`}
          titre=${partie.titre} sousTitre=${html`<span class="deux-lignes">${insecable(partie.texte)}</span>`} chevron />`)}
      <//>`)}`}
    <style>.deux-lignes{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}</style>
  <//>`;
}

/** Un chapitre : ses parties, étapes numérotées et exemples en police fixe. */
function ChapitreView({ chapitre, partie }) {
  useEffect(() => {
    if (partie == null) {
      window.scrollTo(0, 0);
      return;
    }
    // Ouvert depuis une recherche : se place sur la partie trouvée.
    requestAnimationFrame(() => document.getElementById(`partie-${partie}`)?.scrollIntoView({ block: 'start' }));
  }, [chapitre.id, partie]);
  return html`<${Ecran} titre=${chapitre.titre} retour="#/aide" libelleRetour="Mode d'emploi">
    <article class="chapitre">
      <div class="chapitre-entete">
        <${Icone} nom=${chapitre.symbole} taille=${38} classe="accent" epaisseur=${1.7} />
        <p>${insecable(chapitre.resume)}</p>
      </div>
      ${chapitre.parties.map((p, index) => html`<section key=${index} id=${`partie-${index}`} class="partie">
        <h2>${p.titre}</h2>
        <p>${insecable(p.texte)}</p>
        ${p.etapes?.length > 0 && html`<ol class="etapes">
          ${p.etapes.map((etape, i) => html`<li key=${i}><span class="numero">${i + 1}</span><span>${insecable(etape)}</span></li>`)}
        </ol>`}
        ${p.exemple && html`<pre class="exemple">${p.exemple}</pre>`}
      </section>`)}
    </article>
    <style>
      .chapitre { max-width: 720px; padding: 4px 2px 24px; }
      .chapitre-entete { display: flex; align-items: center; gap: 12px; margin: 4px 0 18px; }
      .chapitre-entete p { font-size: 17px; font-weight: 600; color: var(--texte-2); }
      .partie { margin-top: 22px; scroll-margin-top: 120px; }
      .partie h2 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
      .partie p { line-height: 1.5; }
      .etapes { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .etapes li { display: flex; gap: 10px; align-items: baseline; line-height: 1.45; }
      .etapes .numero { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
        background: var(--accent); color: #fff; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; transform: translateY(-1px); }
      .exemple { margin: 12px 0 0; padding: 12px; border-radius: 10px; background: var(--surface-3); white-space: pre-wrap;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 14px; user-select: text; }
    </style>
  <//>`;
}
