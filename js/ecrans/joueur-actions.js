// Les opérations sur un joueur : inscription et modification (JoueurFormulaire), rajout de points
// (macro Reapro_Compte), consommation offerte, correction du solde et achat au comptoir. Repris de
// JoueurActions.swift. Chaque opération du barman demande le code barman, comme les `InputBox` des
// macros du classeur.
//
// Ce module rend aussi deux petites aides des écrans Joueurs et Classement : `LigneAvecMenu` (les
// glissements et l'appui long d'iOS deviennent un menu ⋯ au bout de la ligne) et la classe
// `menus-visibles` d'une section, pour que ce menu ne soit pas coupé par le bord de la liste.

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import { reglages, aOffrir, coutConsommation, pointsFidelite, regleFidelite } from '../reglages.js';
import { arrondi, enEuros, enPoints, enPointsSignes, lireNombre, nombre } from '../format.js';
import {
  Section, Ligne, LigneValeur, Bouton, Feuille, Menu, Icone, ChampTexte, ChampNombre, Choix,
} from '../ui/composants.js';
import { demanderCode, essayer } from '../ui/dialogues.js';
import { contactsDisponibles, choisirContact } from '../ui/systeme.js';

// MARK: - Styles propres à ces écrans

const STYLE = `
.ligne.ligne-menu { padding: 0; gap: 0; align-items: stretch; }
.ligne-menu > .ligne-lien {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 4px 10px 16px;
  color: inherit; text-decoration: none;
}
.ligne-menu > .ligne-lien:hover, .ligne-menu > .ligne-lien:active { background: var(--surface-3); }
.ligne-menu > .ligne-lien.inerte:hover { background: none; }
.ligne-menu > .menu-ancre { align-self: center; padding: 0 8px 0 2px; }
.section.menus-visibles > .liste { overflow: visible; }
.section.menus-visibles > .liste > :first-child,
.section.menus-visibles > .liste > :first-child > .ligne-lien { border-top-left-radius: var(--rayon); }
.section.menus-visibles > .liste > :first-child { border-top-right-radius: var(--rayon); }
.section.menus-visibles > .liste > :last-child,
.section.menus-visibles > .liste > :last-child > .ligne-lien { border-bottom-left-radius: var(--rayon); }
.section.menus-visibles > .liste > :last-child { border-bottom-right-radius: var(--rayon); }
.boutons-ajout { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
.boutons-ajout .bouton { flex: 1 1 0; min-width: 56px; }
.champ-montant { display: inline-flex; align-items: baseline; gap: 4px; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.champ .champ-montant input[type="text"] { width: 96px; max-width: none; color: var(--texte); font-weight: 600; }
`;

if (typeof document !== 'undefined' && !document.getElementById('style-joueurs')) {
  const style = document.createElement('style');
  style.id = 'style-joueurs';
  style.textContent = STYLE;
  document.head.append(style);
}

/** Espaces insécables de la typographie française : un deux-points, un point-virgule ou un guillemet
 *  ne se retrouve jamais seul en début ou en fin de ligne (pieds de section, messages). */
const INSECABLE = String.fromCharCode(0xa0);

export function fr(texte) {
  if (texte == null) return texte;
  return String(texte)
    .replace(/ ([:;?!»])/g, `${INSECABLE}$1`)
    .replace(/« /g, `«${INSECABLE}`)
    .replace(/ €/g, `${INSECABLE}€`)
    .replace(/(\d) (pts?)\b/g, `$1${INSECABLE}$2`);
}

/**
 * Une ligne qui mène quelque part (`href`) avec, au bout, un menu ⋯ : ce que faisaient sur iPhone
 * les glissements et l'appui long. La section qui la contient prend `classe="menus-visibles"`.
 * `auDessus` : le menu s'ouvre vers le haut (dernières lignes de l'écran).
 */
export function LigneAvecMenu({ href, items, titreMenu = 'Actions', auDessus, children }) {
  const contenu = href
    ? html`<a class="ligne-lien" href=${href}>${children}</a>`
    : html`<div class="ligne-lien inerte">${children}</div>`;
  return html`<div class="ligne ligne-menu">
    ${contenu}
    <${Menu} icone="ellipsis.circle" titre=${titreMenu} items=${items} auDessus=${auDessus} />
  </div>`;
}

/** Les boutons qui remplacent ou augmentent une valeur (« +10 », « +2 € »), côte à côte. */
function BoutonsAjout({ valeurs, libelle, onClick }) {
  return html`<div class="ligne"><div class="boutons-ajout">
    ${valeurs.map((v) => html`<${Bouton} key=${v} taille="petit" onClick=${() => onClick(v)}>${libelle(v)}<//>`)}
  </div></div>`;
}

/** « Prix de la consommation … 3,50 € » : un montant en euros, en gros chiffres. */
function ChampMontant({ libelle, valeur, onChange }) {
  const affiche = (v) => (v ? nombre(v) : '');
  const [texte, setTexte] = useState(affiche(valeur));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setTexte(affiche(valeur));
  }, [valeur, focus]);
  return html`<label class="champ">
    <span class="champ-libelle">${libelle}</span>
    <span class="champ-montant">
      <input type="text" inputmode="decimal" placeholder="0" value=${texte} aria-label=${libelle}
        onFocus=${(e) => { setFocus(true); e.currentTarget.select(); }}
        onBlur=${() => { setFocus(false); const n = lireNombre(texte); onChange(n ?? 0); }}
        onInput=${(e) => { const t = e.currentTarget.value; setTexte(t); const n = lireNombre(t); onChange(n ?? 0); }} />
      <span>€</span>
    </span>
  </label>`;
}

/** Le joueur d'une feuille ouverte : s'il a disparu entre-temps, la feuille se ferme. */
function useJoueur(joueurId, onFermer) {
  useEtat();
  const joueur = joueurId ? M.joueur(joueurId) : null;
  useEffect(() => {
    if (joueurId && !joueur) onFermer();
  }, [joueurId, joueur]);
  return joueur;
}

// MARK: - Inscription ou modification

/** Inscription ou modification d'un joueur (colonnes NOM et PRENOM de « gestion clients »).
 *  Sans `joueurId` : un nouveau joueur. */
export function JoueurFormulaire({ joueurId, onFermer }) {
  useEtat();
  const joueur = joueurId ? M.joueur(joueurId) : null;
  const [prenom, setPrenom] = useState(joueur?.prenom ?? '');
  const [nom, setNom] = useState(joueur?.nom ?? '');
  const [telephone, setTelephone] = useState(joueur?.telephone ?? '');
  const [points, setPoints] = useState(reglages().pointsDepart);
  const nouveau = !joueurId;
  const vide = !prenom.trim() && !nom.trim();

  const contact = async () => {
    const choisi = await choisirContact();
    if (!choisi) return;
    setTelephone(choisi.telephone);
    setPrenom((p) => (p.trim() ? p : choisi.prenom));
    setNom((n) => (n.trim() ? n : choisi.nom));
  };

  const enregistrer = () => {
    if (vide) return;
    const p = prenom.trim();
    const n = nom.trim();
    const t = telephone.trim();
    const fait = essayer(() => modifier(() => {
      const existant = joueurId ? M.joueur(joueurId) : null;
      if (existant) {
        existant.prenom = p;
        existant.nom = n;
        existant.telephone = t;
      } else {
        Caisse.nouveauJoueur({ nom: n, prenom: p, points: Math.max(0, points), telephone: t });
      }
      return true;
    }));
    if (fait) onFermer();
  };

  return html`<${Feuille} titre=${nouveau ? 'Nouveau joueur' : 'Modifier le joueur'} onFermer=${onFermer} compacte
      droite=${{ libelle: nouveau ? 'Inscrire' : 'OK', onClick: enregistrer, desactive: vide }}>
    <${Section}>
      <${ChampTexte} libelle="Prénom" plein valeur=${prenom} onInput=${setPrenom} autoFocus=${nouveau}
        autoComplete="off" onEntree=${enregistrer} />
      <${ChampTexte} libelle="Nom" plein valeur=${nom} onInput=${setNom} onEntree=${enregistrer} />
    <//>
    <${Section} pied=${fr("Facultatif : pour lui envoyer la grille par SMS (Journées › la journée › Envoyer la grille aux joueurs).")}>
      <${ChampTexte} libelle="Téléphone" plein type="tel" inputMode="tel" autoComplete="tel"
        valeur=${telephone} onInput=${setTelephone} onEntree=${enregistrer} />
      ${contactsDisponibles() && html`<${Ligne} action icone="person.crop.circle" titre="Choisir dans les contacts" onClick=${contact} />`}
    <//>
    ${nouveau && html`<${Section} pied=${fr("Le joueur reçoit un numéro à la suite des autres.")}>
      <${ChampNombre} libelle="Porte-feuilles de départ" valeur=${points} onChange=${setPoints} />
    <//>`}
  <//>`;
}

// MARK: - Rajout de points

/** « RAJOUT DE POINTS » (macro Reapro_Compte), validé par le barman. */
export function RechargeSheet({ joueurId, onFermer }) {
  const joueur = useJoueur(joueurId, onFermer);
  const [points, setPoints] = useState(reglages().rechargeParDefaut);
  if (!joueur) return null;

  const valider = async () => {
    if (!(points > 0)) return;
    if (!(await demanderCode('Rajout de points'))) return;
    essayer(() => modifier(() => Caisse.recharger(M.joueur(joueurId), points)));
    onFermer();
  };

  return html`<${Feuille} titre="Rajout de points" onFermer=${onFermer} compacte
      droite=${{ libelle: 'Valider', onClick: valider, desactive: !(points > 0) }}>
    <${Section}>
      <${LigneValeur} libelle="Solde actuel" valeur=${enPoints(joueur.points)} />
      <${ChampNombre} libelle="Points à rajouter" valeur=${points} onChange=${setPoints} />
      <${BoutonsAjout} valeurs=${[10, 20, 50, 100]} libelle=${(v) => `+${nombre(v)}`} onClick=${setPoints} />
      <${LigneValeur} libelle=${html`<span class="gras">Nouveau solde</span>`}
        valeur=${html`<span class="gras" style="color:var(--texte)">${enPoints(joueur.points + Math.max(0, points))}</span>`} />
    <//>
  <//>`;
}

// MARK: - Consommation offerte

/** Consommation offerte contre des points, à son prix : les consommations n'ont pas toutes le même
 *  prix, on compte donc tant de points pour 1 € (Réglages › Consommations offertes). */
export function ConsommationSheet({ joueurId, onFermer }) {
  const joueur = useJoueur(joueurId, onFermer);
  const [prix, setPrix] = useState(0);
  if (!joueur) return null;
  const r = reglages();
  const possible = aOffrir(joueur.points);
  const cout = coutConsommation(prix);
  const suffisant = cout <= joueur.points + 0.0001;

  const valider = async () => {
    if (!(prix > 0) || !suffisant) return;
    if (!(await demanderCode(`Offrir ${enEuros(prix)}`))) return;
    essayer(() => modifier(() => Caisse.offrir(M.joueur(joueurId), prix, reglages().pointsParEuro)));
    onFermer();
  };

  return html`<${Feuille} titre="Consommation offerte" onFermer=${onFermer}
      droite=${{ libelle: 'Valider', onClick: valider, desactive: !(prix > 0) || !suffisant }}>
    <${Section} pied=${fr(`Règle : ${enPoints(r.pointsParEuro)} pour 1 € de consommation.`)}>
      <div class="ligne">
        ${possible > 0
          ? html`<span class="rangee gras vert" style="font-size:17px"><${Icone} nom="party.popper" taille=${20} />Félicitations, vous pouvez consommer !</span>`
          : html`<span class="rangee gras secondaire" style="font-size:17px"><${Icone} nom="hourglass" taille=${20} />Pas encore assez de points</span>`}
      </div>
      <${LigneValeur} libelle="Solde" valeur=${enPoints(joueur.points)} />
      <${LigneValeur} libelle="Le solde permet d'offrir" valeur=${enEuros(possible)} />
    <//>
    <${Section} pied=${fr("Plusieurs consommations offertes d'un coup : additionnez leurs prix.")}>
      <${ChampMontant} libelle="Prix de la consommation" valeur=${prix} onChange=${setPrix} />
      <${BoutonsAjout} valeurs=${[0.5, 1, 2, 5]} libelle=${(v) => `+${nombre(v)} €`}
        onClick=${(v) => setPrix((p) => arrondi(p + v))} />
      ${prix > 0 && html`<${Ligne} destructif titre="Remettre à zéro" onClick=${() => setPrix(0)} />`}
    <//>
    ${prix > 0 && html`<${Section} pied=${suffisant ? null : fr(`Il manque ${enPoints(cout - joueur.points)} pour offrir cette consommation.`)}>
      <${LigneValeur} libelle="Points débités" valeur=${enPoints(cout)} />
      <${LigneValeur} libelle=${html`<span class="gras">Solde après</span>`}
        valeur=${html`<span class=${suffisant ? 'gras' : 'gras rouge'} style=${suffisant ? 'color:var(--texte)' : ''}>${enPoints(joueur.points - cout)}</span>`} />
    <//>`}
  <//>`;
}

// MARK: - Correction du solde

/** Correction manuelle du porte-feuilles, tracée dans l'historique. */
export function CorrectionSheet({ joueurId, onFermer }) {
  const joueur = useJoueur(joueurId, onFermer);
  const [solde, setSolde] = useState(joueur?.points ?? 0);
  const [motif, setMotif] = useState('');
  if (!joueur) return null;

  const valider = async () => {
    if (!(await demanderCode('Corriger le solde'))) return;
    essayer(() => modifier(() => Caisse.corrigerSolde(M.joueur(joueurId), Math.max(0, solde), motif)));
    onFermer();
  };

  return html`<${Feuille} titre="Corriger le solde" onFermer=${onFermer} compacte
      droite=${{ libelle: 'Valider', onClick: valider }}>
    <${Section} pied=${fr("L'écart est inscrit dans l'historique du joueur.")}>
      <${LigneValeur} libelle="Solde actuel" valeur=${enPoints(joueur.points)} />
      <${ChampNombre} libelle="Nouveau solde" valeur=${solde} onChange=${setSolde} />
      <${ChampTexte} libelle="Motif (facultatif)" plein valeur=${motif} onInput=${setMotif} />
    <//>
  <//>`;
}

// MARK: - Achat au comptoir

/** Un achat au comptoir, hors paris : le montant payé rapporte des points de fidélité (règle réglée
 *  dans Réglages › Points de fidélité), validés par le barman. `joueurId` : joueur déjà choisi
 *  (fiche ou liste) ; sinon, on le choisit ici. */
export function AchatSheet({ joueurId, onFermer }) {
  useEtat();
  const joueurInitial = joueurId ? M.joueur(joueurId) : null;
  const [choisiId, setChoisiId] = useState(joueurId ?? null);
  const [montant, setMontant] = useState(0);
  const joueur = choisiId ? M.joueur(choisiId) : null;
  const r = reglages();
  const cumul = joueur ? M.cumulDepenses(joueur.id) : 0;
  const points = pointsFidelite(montant, cumul);

  useEffect(() => {
    if (joueurId && !joueurInitial) onFermer();
  }, [joueurId, joueurInitial]);

  const actifs = [...M.joueurs({ archives: false })].sort((a, b) => a.numero - b.numero);
  const options = [
    { valeur: null, libelle: 'Choisir…' },
    ...actifs.map((j) => ({ valeur: j.id, libelle: `${j.numero} · ${M.nomComplet(j)}` })),
  ];

  const valider = async () => {
    if (!joueur || !(montant > 0)) return;
    const gagnes = points;
    const id = joueur.id;
    if (!(await demanderCode(`Achat de ${enEuros(montant)}`))) return;
    essayer(() => modifier(() => Caisse.enregistrerAchat(M.joueur(id), montant, gagnes)));
    onFermer();
  };

  const regle = r.fideliteParTranche
    ? `Règle : ${regleFidelite()}. Le reste compte pour les achats suivants (déjà dépensé : ${enEuros(cumul)}).`
    : `Règle : ${regleFidelite()}. À régler dans Réglages › Points de fidélité.`;

  return html`<${Feuille} titre="Achat" onFermer=${onFermer}
      droite=${{ libelle: 'Valider', onClick: valider, desactive: !joueur || !(montant > 0) }}>
    ${!joueurId && html`<${Section}>
      <${Choix} libelle="Joueur" valeur=${choisiId} options=${options} onChange=${setChoisiId} />
    <//>`}
    <${Section} titre=${joueurInitial ? `Achat de ${M.nomComplet(joueurInitial)}` : 'Achat au comptoir'}
      pied=${fr("Consommations payées hors paris. Les boutons s'ajoutent : trois cafés à 2 €, trois fois « +2 € ».")}>
      <${ChampMontant} libelle="Montant payé" valeur=${montant} onChange=${setMontant} />
      <${BoutonsAjout} valeurs=${[1, 2, 5, 10, 20]} libelle=${(v) => `+${nombre(v)} €`}
        onClick=${(v) => setMontant((m) => arrondi(m + v))} />
      ${montant > 0 && html`<${Ligne} destructif titre="Remettre à zéro" onClick=${() => setMontant(0)} />`}
    <//>
    <${Section} pied=${fr(regle)}>
      <${LigneValeur} libelle="Points gagnés"
        valeur=${html`<span class=${points > 0 ? 'gras vert' : 'gras secondaire'} style="font-size:17px">${enPointsSignes(points)}</span>`} />
      ${joueur && html`<${LigneValeur} libelle="Porte-feuilles"
        valeur=${`${enPoints(joueur.points)} → ${enPoints(joueur.points + points)}`} />`}
    <//>
  <//>`;
}
