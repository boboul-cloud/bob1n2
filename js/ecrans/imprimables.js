// Les documents imprimables : la grille à cocher (feuille « impression » du classeur), l'affichette
// du jeu à distance, le ticket d'un pari et le tableau d'honneur. Repris de Imprimables.swift.
//
// Le Swift dessinait des pages A4 de 595 × 842 points dans un PDF (DocumentPDF.swift) ; ici, les
// mêmes pages sont des <div class="page-a4"> mesurées en points (pt) et confiées à la fenêtre
// d'impression du navigateur, qui sait aussi « Enregistrer en PDF ». Toujours en noir sur blanc.
//
// Chaque document existe en deux temps : `documentX(…)` rend { titre, pages, style } (pour un essai
// ou un aperçu), `imprimerX(…)` l'imprime.

import { html } from '../../vendor/preact-htm.js';
import * as M from '../modele.js';
import { ETATS_PRONOSTIC, rangsPoints, trierJoueurs } from '../calcul.js';
import { enCote, enEuros, enPoints, heure, jour } from '../format.js';
import { aOffrir, titreAffiche } from '../reglages.js';
import { imprimer } from '../ui/impression.js';
import { chargerQR, qrPret, svgQR, svgQRImmediat } from '../qr.js';

// La bibliothèque du QR code est chargée d'avance : l'affichette s'imprime alors sans attendre.
if (typeof document !== 'undefined') chargerQR().catch(() => {});

export const LIGNES_PAR_PAGE_GRILLE = 24;
export const LIGNES_PAR_PAGE_CLASSEMENT = 32;

// MARK: - Impression

/** La grille à cocher de la journée, avec ses cotes (et ses résultats dès qu'il y en a un). */
export function imprimerGrille(journeeId) {
  const doc = documentGrille(journeeId);
  if (doc) imprimer(doc);
}

/** À afficher au comptoir : le QR code qui ouvre la grille sur le téléphone des joueurs.
 *  Safari n'ouvre l'impression que dans le geste même de l'utilisateur : quand la bibliothèque du QR
 *  code est là (elle l'est dès que l'écran d'envoi montre le QR), tout se fait sans attendre. */
export function imprimerAffichette(journeeId, lien) {
  if (qrPret()) {
    const doc = affichette(journeeId, lien, qrDeLAffichette(() => svgQRImmediat(String(lien ?? ''), OPTIONS_QR)));
    if (doc) imprimer(doc);
    return;
  }
  documentAffichette(journeeId, lien).then((doc) => { if (doc) imprimer(doc); });
}

export function imprimerTicket(pariId) {
  const doc = documentTicket(pariId);
  if (doc) imprimer(doc);
}

/** `joueurs` : les joueurs (objets ou identifiants) à classer, d'ordinaire ceux qui ne sont pas archivés. */
export function imprimerClassement(joueurs) {
  imprimer(documentClassement(joueurs));
}

// MARK: - Documents

export function documentGrille(journeeId) {
  const journee = M.journee(journeeId);
  if (!journee) return null;
  const titreJeu = titreAffiche();
  const elements = [];
  for (const groupe of M.groupes(journee.id)) {
    elements.push({ categorie: groupe.titre });
    for (const match of groupe.rencontres) {
      elements.push({
        ordre: match.ordre, domicile: M.nomDomicile(match), exterieur: M.nomExterieur(match),
        cotes: [match.cote1, match.coteN, match.cote2],
        resultat: match.resultat != null ? M.libelleResultat(match.resultat) : null,
      });
    }
  }
  const avecResultats = M.nombreResultats(journee.id) > 0;
  const pages = decouper(elements, LIGNES_PAR_PAGE_GRILLE);
  return {
    titre: `Grille – ${journee.titre}`,
    style: STYLE,
    pages: pages.map((morceau, index) => html`<${PageGrille} key=${index} titreJeu=${titreJeu}
      titreJournee=${journee.titre} date=${journee.date} elements=${morceau} avecResultats=${avecResultats}
      page=${index + 1} totalPages=${pages.length} />`),
  };
}

/** Comme CodeQR.image : niveau de correction « L », marge d'un module. */
const OPTIONS_QR = { taille: '100%', marge: 1, correction: 'L' };

/** Le QR code de l'affichette, ou '' si le lien est trop long : elle part alors sans image, comme
 *  dans le Swift. */
function qrDeLAffichette(fabriquer) {
  try {
    return fabriquer() ?? '';
  } catch {
    return '';
  }
}

export async function documentAffichette(journeeId, lien) {
  let qr = '';
  try {
    qr = await svgQR(String(lien ?? ''), OPTIONS_QR);
  } catch {
    qr = '';
  }
  return affichette(journeeId, lien, qr);
}

function affichette(journeeId, lien, qr) {
  const journee = M.journee(journeeId);
  if (!journee) return null;
  return {
    titre: `Affichette – ${journee.titre}`,
    style: STYLE,
    pages: html`<${PageAffichette} titreJeu=${titreAffiche()} titreJournee=${journee.titre} date=${journee.date} qr=${qr} />`,
  };
}

export function documentTicket(pariId) {
  const pari = M.pari(pariId);
  if (!pari) return null;
  const joueur = M.joueur(pari.joueurId);
  const journee = M.journee(pari.journeeId);
  return {
    titre: `Ticket – ${joueur ? M.nomComplet(joueur) : 'Joueur'} – ${journee?.titre ?? ''}`,
    style: STYLE,
    pages: html`<${PageTicket} titreJeu=${titreAffiche()} pari=${instantane(pari)} />`,
  };
}

export function documentClassement(joueurs = []) {
  const titreJeu = titreAffiche();
  const liste = joueurs.map((j) => (typeof j === 'string' ? M.joueur(j) : j)).filter(Boolean);
  const tries = trierJoueurs(liste, M.nomComplet);
  const rangs = rangsPoints(tries.map((j) => j.points));
  const lignes = tries.map((joueur, index) => ({
    rang: rangs[index], nom: M.nomComplet(joueur), points: joueur.points, aOffrir: aOffrir(joueur.points),
  }));
  const pages = decouper(lignes, LIGNES_PAR_PAGE_CLASSEMENT);
  return {
    titre: `Classement – ${titreJeu}`,
    style: STYLE,
    pages: pages.map((morceau, index) => html`<${PageClassement} key=${index} titreJeu=${titreJeu}
      lignes=${morceau} page=${index + 1} totalPages=${pages.length} />`),
  };
}

/** Valeurs figées d'un pari, lues une fois au moment du rendu (InstantanePari). */
function instantane(pari) {
  const joueur = M.joueur(pari.joueurId);
  const journee = M.journee(pari.journeeId);
  const evaluation = M.evaluation(pari);
  return {
    joueur: joueur ? `N° ${joueur.numero} · ${M.nomComplet(joueur)}` : '—',
    journee: journee?.titre ?? '—',
    dateJournee: journee?.date ?? null,
    datePari: pari.dateCreation,
    formule: M.descriptionFormule(pari),
    lignes: M.pronosticsDuPari(pari.id).map((p) => ({
      ordre: (p.rencontreId ? M.rencontre(p.rencontreId)?.ordre : null) ?? null,
      match: M.libelleMatch(p), issue: p.issue, cote: p.cote, etat: M.etatPronostic(p),
    })),
    miseUnitaire: pari.miseUnitaire,
    miseTotale: pari.miseTotale,
    combinaisons: evaluation.combinaisons,
    coteTotale: evaluation.coteTotale,
    gainMaximum: evaluation.gainMaximum,
    statut: pari.statut,
    gainRegle: pari.gainRegle,
  };
}

function decouper(elements, taille) {
  if (!elements.length) return [[]];
  const morceaux = [];
  for (let i = 0; i < elements.length; i += taille) morceaux.push(elements.slice(i, i + taille));
  return morceaux;
}

const majuscules = (texte) => String(texte ?? '').toLocaleUpperCase('fr-FR');

// MARK: - Texte réduit pour tenir sur une ligne (minimumScaleFactor)

let toile = null;

/** La taille (pt) à laquelle `texte` tient dans `largeur` (pt), sans descendre sous `minimum` × `taille`.
 *  Les pages ne sont pas affichées à l'écran : le texte est mesuré sur une toile. */
function tailleAjustee(texte, largeur, taille, graisse = 600, minimum = 0.7) {
  if (typeof document === 'undefined' || !texte) return taille;
  try {
    toile ??= document.createElement('canvas').getContext('2d');
    const police = getComputedStyle(document.documentElement).getPropertyValue('--police').trim()
      || '-apple-system, system-ui, sans-serif';
    toile.font = `${graisse} ${taille}pt ${police}`;
    const mesure = toile.measureText(texte).width * 0.75; // pixels CSS → points
    if (mesure <= largeur) return taille;
    return Math.max(minimum, largeur / mesure) * taille;
  } catch {
    return taille;
  }
}

// MARK: - Éléments communs

function EnteteImpression({ titre, sousTitre }) {
  return html`<div class="imp-entete">
    <div class="imp-entete-titre">${majuscules(titre)}</div>
    <div class="imp-entete-sous">${sousTitre}</div>
    <div class="imp-entete-trait"></div>
  </div>`;
}

function PiedImpression({ page, totalPages }) {
  return html`<div class="imp-pied">
    <span>Imprimé le ${heure(new Date())}</span>
    ${totalPages > 1 && html`<span>Page ${page} / ${totalPages}</span>`}
  </div>`;
}

const CaseACocher = () => html`<span class="imp-case"></span>`;

// MARK: - Grille

/** Largeur (pt) de la page sans ses marges de 36 pt. */
const LARGEUR_UTILE = 595 - 72;

function PageGrille({ titreJeu, titreJournee, date, elements, avecResultats, page, totalPages }) {
  // Les deux colonnes d'équipes se partagent ce que laissent N°, VS, 1 / N / 2 et RÉS.
  const largeurEquipe = (LARGEUR_UTILE - 26 - 30 - 3 * 54 - (avecResultats ? 36 : 0)) / 2;
  const equipe = (nom, classe) => {
    const taille = tailleAjustee(nom, largeurEquipe, 9);
    return html`<span class=${classe} style=${taille < 9 ? `font-size:${taille.toFixed(2)}pt` : ''}>${nom}</span>`;
  };
  return html`<div class="page-a4 imp-page">
    <${EnteteImpression} titre=${titreJeu} sousTitre=${`${titreJournee} · ${jour(date)}`} />
    <div class="imp-colonnes">
      <span class="imp-n">N°</span>
      <span class="imp-dom">DOMICILE</span>
      <span class="imp-vs"></span>
      <span class="imp-ext">EXTÉRIEUR</span>
      ${M.ISSUES.map((issue) => html`<span class="imp-issue">${issue}</span>`)}
      ${avecResultats && html`<span class="imp-res">RÉS.</span>`}
    </div>
    ${elements.map((element, index) => (element.categorie != null
      ? html`<div key=${index} class="imp-categorie">${majuscules(element.categorie)}</div>`
      : html`<div key=${index} class="imp-match">
          <span class="imp-n">${element.ordre}</span>
          ${equipe(element.domicile, 'imp-dom')}
          <span class="imp-vs">VS</span>
          ${equipe(element.exterieur, 'imp-ext')}
          ${element.cotes.map((cote) => html`<span class="imp-issue"><${CaseACocher} /><span class="imp-cote">${enCote(cote)}</span></span>`)}
          ${avecResultats && html`<span class="imp-res">${element.resultat ?? ''}</span>`}
        </div>`))}
    <div class="imp-espace"></div>
    ${page === totalPages && html`<div class="imp-joueur">
      <span class="imp-champ">Nom :<span class="imp-champ-trait"></span></span>
      <span class="imp-champ">Mise :<span class="imp-champ-trait"></span></span>
      <span class="imp-coche"><${CaseACocher} />Combiné</span>
      <span class="imp-coche"><${CaseACocher} />Système</span>
    </div>`}
    <${PiedImpression} page=${page} totalPages=${totalPages} />
  </div>`;
}

// MARK: - Affichette

function PageAffichette({ titreJeu, titreJournee, date, qr }) {
  const etape = (numero, texte) => html`<div class="imp-etape">
    <span class="imp-etape-numero">${numero}</span><span class="imp-etape-texte">${texte}</span></div>`;
  return html`<div class="page-a4 imp-page">
    <${EnteteImpression} titre=${titreJeu} sousTitre=${`${titreJournee} · ${jour(date)}`} />
    <div class="imp-affichette">
      <div class="imp-affichette-titre">Jouez la grille${'\n'}depuis votre téléphone</div>
      ${qr && html`<div class="imp-qr" dangerouslySetInnerHTML=${{ __html: qr }}></div>`}
      <div class="imp-etapes">
        ${etape(1, "Scannez le code avec l'appareil photo.")}
        ${etape(2, 'Touchez 1, N ou 2 sur vos matchs, choisissez votre mise.')}
        ${etape(3, '« Envoyer ma grille » : envoyez le lien au bar.')}
        ${etape(4, "Votre pari compte dès que le barman l'a validé.")}
      </div>
    </div>
    <div class="imp-espace"></div>
    <div class="imp-mention">Points virtuels : aucun argent n'est misé ni gagné.</div>
    <${PiedImpression} page=${1} totalPages=${1} />
  </div>`;
}

// MARK: - Ticket

function PageTicket({ titreJeu, pari }) {
  const total = (titre, valeur) => html`<div class="imp-total">
    <span class="imp-total-titre">${titre}</span><span class="imp-total-valeur">${valeur}</span></div>`;
  return html`<div class="page-a4 imp-page imp-ticket">
    <${EnteteImpression} titre=${titreJeu} sousTitre=${`Ticket de pari · ${heure(pari.datePari)}`} />
    <div class="imp-ticket-infos">
      <div class="imp-ticket-joueur">${pari.joueur}</div>
      <div class="imp-ticket-journee">${pari.journee}${pari.dateJournee ? ` · ${jour(pari.dateJournee)}` : ''}</div>
      <div class="imp-ticket-formule">${pari.formule}</div>
    </div>
    ${pari.lignes.map((ligne, index) => html`<div key=${index} class="imp-ticket-ligne">
      <span class="imp-t-ordre">${ligne.ordre ?? '–'}</span>
      <span class="imp-t-match">${ligne.match}</span>
      <span class="imp-t-issue">${ligne.issue}</span>
      <span class="imp-t-cote">${enCote(ligne.cote)}</span>
      <span class="imp-t-etat">${ligne.etat === 'enAttente' ? '' : ETATS_PRONOSTIC[ligne.etat]?.libelle}</span>
    </div>`)}
    <div class="imp-totaux">
      ${pari.combinaisons > 1
        ? html`${total('Mise', `${enPoints(pari.miseUnitaire)} × ${pari.combinaisons} = ${enPoints(pari.miseTotale)}`)}
            ${total('Total des cotes', enCote(pari.coteTotale))}`
        : html`${total('Mise', enPoints(pari.miseTotale))}${total('Cote totale', enCote(pari.coteTotale))}`}
      ${pari.statut === 'enCours' && total('Gain potentiel', enPoints(pari.gainMaximum))}
      ${pari.statut === 'regle' && total('Gain encaissé', enPoints(pari.gainRegle))}
      ${pari.statut === 'rembourse' && total('Pari remboursé', enPoints(pari.miseTotale))}
    </div>
    <div class="imp-espace imp-espace-nul"></div>
    <${PiedImpression} page=${1} totalPages=${1} />
  </div>`;
}

// MARK: - Classement

function PageClassement({ titreJeu, lignes, page, totalPages }) {
  return html`<div class="page-a4 imp-page">
    <${EnteteImpression} titre=${titreJeu}
      sousTitre=${`Tableau d'honneur · classement du concours au ${jour(new Date())}`} />
    <div class="imp-cl-colonnes">
      <span class="imp-cl-rang">PL.</span>
      <span class="imp-cl-nom">JOUEUR</span>
      <span class="imp-cl-offrir">À OFFRIR</span>
      <span class="imp-cl-points">POINTS</span>
    </div>
    ${lignes.map((ligne, index) => html`<div key=${index} class=${`imp-cl-ligne${ligne.rang <= 3 ? ' imp-cl-podium' : ''}`}>
      <span class="imp-cl-rang">${ligne.rang}</span>
      <span class="imp-cl-nom">${ligne.nom}</span>
      <span class="imp-cl-offrir">${ligne.aOffrir > 0 ? enEuros(ligne.aOffrir) : ''}</span>
      <span class="imp-cl-points">${enPoints(ligne.points)}</span>
    </div>`)}
    <div class="imp-espace imp-espace-nul"></div>
    <${PiedImpression} page=${page} totalPages=${totalPages} />
  </div>`;
}

// MARK: - Mise en page (points d'une page A4 de 595 × 842)

export const STYLE = `
.imp-page {
  height: 297mm; padding: 36pt;
  display: flex; flex-direction: column;
  background: #fff; color: #000;
  line-height: 1.2;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.imp-page * { box-sizing: border-box; }
.imp-ticket { height: auto; min-height: 297mm; }
.imp-espace { flex: 1 0 12pt; }
.imp-espace-nul { flex-basis: 0; }

.imp-entete { padding-bottom: 10pt; }
.imp-entete-titre { font-size: 20pt; font-weight: 800; line-height: 1.15; }
.imp-entete-sous { margin-top: 4pt; font-size: 10pt; font-weight: 500; color: #4d4d4d; }
.imp-entete-trait { margin-top: 8pt; border-top: 1.5pt solid #000; }

.imp-pied { display: flex; justify-content: space-between; gap: 8pt; padding-top: 8pt; font-size: 7pt; color: #737373; }

.imp-case { flex: none; display: inline-block; width: 10pt; height: 10pt; border: 0.8pt solid #000; border-radius: 2pt; }

.imp-colonnes, .imp-match { display: flex; align-items: center; white-space: nowrap; }
.imp-colonnes { padding-bottom: 4pt; font-size: 8pt; font-weight: 700; color: #666; }
.imp-n { flex: none; width: 26pt; text-align: left; }
.imp-dom { flex: 1 1 0; min-width: 0; text-align: right; overflow: hidden; text-overflow: ellipsis; }
.imp-vs { flex: none; width: 30pt; text-align: center; }
.imp-ext { flex: 1 1 0; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.imp-issue { flex: none; width: 54pt; display: flex; align-items: center; justify-content: center; gap: 4pt; }
.imp-res { flex: none; width: 36pt; text-align: center; }
.imp-match { height: 24pt; font-size: 9pt; font-weight: 600; border-bottom: 0.5pt solid #d1d1d1; }
.imp-match .imp-n { font-weight: 700; }
.imp-match .imp-vs { font-size: 7pt; font-weight: 700; color: #737373; }
.imp-match .imp-res { font-weight: 700; }
.imp-cote { font-size: 9pt; font-weight: 400; font-variant-numeric: tabular-nums; }
.imp-categorie {
  display: flex; align-items: center; min-height: 18pt; padding: 0 6pt;
  background: #e6e6e6; font-size: 9pt; font-weight: 800;
}
.imp-joueur {
  align-self: flex-start; display: flex; align-items: flex-end; gap: 18pt;
  padding: 12pt; border: 0.8pt solid #000; border-radius: 6pt;
  font-size: 9pt; font-weight: 600;
}
.imp-champ { display: flex; align-items: flex-end; gap: 4pt; }
.imp-champ-trait { width: 120pt; border-bottom: 0.6pt solid #000; }
.imp-coche { display: flex; align-items: center; gap: 5pt; }

.imp-affichette { display: flex; flex-direction: column; align-items: center; gap: 24pt; padding-top: 20pt; }
.imp-affichette-titre { font-size: 30pt; font-weight: 800; line-height: 1.15; text-align: center; white-space: pre-line; }
.imp-qr { width: 320pt; height: 320pt; }
.imp-qr svg { display: block; width: 100%; height: 100%; }
.imp-etapes { width: 400pt; max-width: 100%; display: flex; flex-direction: column; gap: 12pt; }
.imp-etape { display: flex; align-items: baseline; gap: 10pt; }
.imp-etape-numero {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 24pt; height: 24pt; border: 1.2pt solid #000; border-radius: 50%;
  font-size: 13pt; font-weight: 800;
}
.imp-etape-texte { font-size: 14pt; font-weight: 500; }
.imp-mention { font-size: 9pt; color: #666; text-align: center; }

.imp-ticket-infos { display: flex; flex-direction: column; gap: 3pt; padding-bottom: 12pt; }
.imp-ticket-joueur { font-size: 13pt; font-weight: 700; }
.imp-ticket-journee { font-size: 9pt; }
.imp-ticket-formule { font-size: 9pt; font-weight: 600; }
.imp-ticket-ligne {
  display: flex; align-items: center; gap: 8pt; height: 22pt; white-space: nowrap;
  font-size: 9pt; font-weight: 500; border-bottom: 0.5pt solid #d1d1d1;
}
.imp-t-ordre { flex: none; width: 22pt; font-weight: 700; }
.imp-t-match { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.imp-t-issue { flex: none; width: 24pt; text-align: center; font-size: 11pt; font-weight: 800; }
.imp-t-cote { flex: none; width: 40pt; text-align: right; font-weight: 400; font-variant-numeric: tabular-nums; }
.imp-t-etat { flex: none; width: 50pt; text-align: right; font-size: 8pt; font-weight: 600; }
.imp-totaux {
  margin-top: 16pt; padding: 12pt; display: flex; flex-direction: column; gap: 5pt;
  border: 0.8pt solid #000; border-radius: 6pt;
}
.imp-total { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
.imp-total-titre { font-size: 10pt; font-weight: 500; }
.imp-total-valeur { font-size: 11pt; font-weight: 700; font-variant-numeric: tabular-nums; }

.imp-cl-colonnes, .imp-cl-ligne { display: flex; align-items: center; gap: 8pt; white-space: nowrap; }
.imp-cl-colonnes { padding-bottom: 4pt; font-size: 8pt; font-weight: 700; color: #666; }
.imp-cl-ligne { height: 21pt; border-bottom: 0.5pt solid #d9d9d9; }
.imp-cl-ligne.imp-cl-podium { background: #ededed; }
.imp-cl-rang { flex: none; width: 34pt; }
.imp-cl-nom { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.imp-cl-offrir { flex: none; width: 60pt; text-align: right; }
.imp-cl-points { flex: none; width: 80pt; text-align: right; }
.imp-cl-ligne .imp-cl-rang { font-size: 11pt; font-weight: 800; }
.imp-cl-ligne .imp-cl-nom { font-size: 11pt; font-weight: 500; }
.imp-cl-ligne.imp-cl-podium .imp-cl-nom { font-weight: 700; }
.imp-cl-ligne .imp-cl-offrir { font-size: 10pt; font-variant-numeric: tabular-nums; }
.imp-cl-ligne .imp-cl-points { font-size: 11pt; font-weight: 700; font-variant-numeric: tabular-nums; }
`;
