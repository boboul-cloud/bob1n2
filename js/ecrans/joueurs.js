// La feuille « gestion clients » : tous les joueurs et leur porte-feuilles. Repris de JoueursView.swift.
//
// Sur iPhone, glisser une ligne proposait « Achat », « Archiver » et « Supprimer » (et l'appui long
// les mêmes) : ici, le menu ⋯ au bout de chaque ligne.

import { html, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import { trierJoueurs } from '../calcul.js';
import { reglages, aOffrir } from '../reglages.js';
import { cle, comparerNoms, compte, enEuros, enPoints } from '../format.js';
import { Ecran, Section, Bouton, Menu, Icone, Recherche, Vide } from '../ui/composants.js';
import { alerte, confirmer, demanderCode } from '../ui/dialogues.js';
import { AchatSheet, JoueurFormulaire, LigneAvecMenu, fr } from './joueur-actions.js';

export const TRIS = [
  { valeur: 'numero', libelle: 'Numéro' },
  { valeur: 'nom', libelle: 'Nom' },
  { valeur: 'points', libelle: 'Points' },
];

/** Les joueurs affichés : archivés ou non, filtrés par la recherche (nom ou numéro exact, sans casse
 *  ni accents), puis triés. `joueurs` arrive trié par numéro. */
export function joueursAffiches(joueurs, { recherche = '', tri = 'numero', voirArchives = false } = {}) {
  let liste = joueurs.filter((j) => voirArchives || !j.archive);
  const texte = cle(recherche);
  if (texte) {
    liste = liste.filter((j) => cle(M.nomComplet(j)).includes(texte) || String(j.numero) === texte);
  }
  if (tri === 'nom') return [...liste].sort((a, b) => comparerNoms(a.nom, b.nom));
  if (tri === 'points') return trierJoueurs(liste, M.nomComplet);
  return liste;
}

/** La journée en cours : la plus récente qui n'est pas clôturée. */
function journeeEnCours() {
  return M.journeesTriees().find((j) => j.statut !== 'cloturee') ?? null;
}

export function JoueursView() {
  useEtat();
  const r = reglages();
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState('numero');
  const [voirArchives, setVoirArchives] = useState(false);
  const [creation, setCreation] = useState(false);
  const [achat, setAchat] = useState(null); // id du joueur, ou true : achat sans joueur choisi

  const joueurs = [...M.joueurs()].sort((a, b) => a.numero - b.numero);
  const affiches = joueursAffiches(joueurs, { recherche, tri, voirArchives });
  const enCours = journeeEnCours();

  const supprimer = async (joueur) => {
    const ok = await confirmer({
      titre: 'Supprimer le joueur ?',
      message: fr("Son porte-feuilles, ses paris et son historique disparaîtront. Pour le garder au palmarès sans qu'il joue, archivez-le plutôt."),
      bouton: `Supprimer ${M.nomComplet(joueur)}`,
      destructif: true,
    });
    if (!ok || !(await demanderCode('Supprimer le joueur'))) return;
    modifier(() => M.supprimerJoueur(joueur.id));
  };

  const archiver = (joueur) => modifier(() => {
    const j = M.joueur(joueur.id);
    if (j) j.archive = !j.archive;
  });

  const effacerTout = async () => {
    const tous = M.joueurs();
    const ok = await confirmer({
      titre: "Supprimer l'historique de tous les joueurs ?",
      message: fr(Caisse.avertissementHistorique(tous)),
      bouton: `Supprimer l'historique de ${compte(tous.length, 'joueur')}`,
      destructif: true,
    });
    if (!ok || !(await demanderCode('Supprimer tous les historiques'))) return;
    const total = modifier(() => {
      const somme = { mouvements: 0, paris: 0 };
      for (const joueur of M.joueurs()) {
        const efface = Caisse.effacerHistorique(joueur);
        somme.mouvements += efface.mouvements;
        somme.paris += efface.paris;
      }
      return somme;
    });
    alerte('Historiques supprimés', fr(Caisse.bilanHistorique(total, tous.length)));
  };

  const menuAffichage = html`<${Menu} icone="line.3.horizontal.decrease.circle" titre="Affichage" items=${[
    { titre: 'Trier par' },
    ...TRIS.map((t) => ({ libelle: t.libelle, icone: tri === t.valeur ? 'checkmark' : null, onClick: () => setTri(t.valeur) })),
    null,
    { libelle: 'Afficher les archivés', icone: voirArchives ? 'checkmark' : null, onClick: () => setVoirArchives(!voirArchives) },
    null,
    {
      libelle: "Supprimer l'historique de tous les joueurs…", icone: 'clock.badge.xmark', destructif: true,
      desactive: joueurs.length === 0, onClick: effacerTout,
    },
  ]} />`;

  const actions = html`
    ${menuAffichage}
    ${r.fideliteActive && html`<${Bouton} variante="lien" icone="cart" titre="Achat" onClick=${() => setAchat(true)} />`}
    <${Bouton} variante="lien" icone="person.badge.plus" titre="Nouveau joueur" onClick=${() => setCreation(true)} />`;

  let contenu;
  if (joueurs.length === 0) {
    contenu = html`<${Vide} icone="person.2" titre="Aucun joueur"
        texte=${fr(`Inscrivez les clients qui jouent : chacun reçoit un porte-feuilles de ${enPoints(r.pointsDepart)}.`)}>
      <${Bouton} variante="principal" onClick=${() => setCreation(true)}>Nouveau joueur<//>
    <//>`;
  } else if (affiches.length === 0) {
    contenu = html`<${Vide} icone="magnifyingglass"
      titre=${recherche.trim() ? `Aucun résultat pour « ${recherche.trim()} »` : 'Aucun résultat'}
      texte="Vérifiez l'orthographe ou lancez une nouvelle recherche." />`;
  } else {
    contenu = html`<${Section} classe="menus-visibles">
      ${affiches.map((joueur, index) => html`<${LigneJoueur} key=${joueur.id} joueur=${joueur}
        aJoue=${enCours ? M.aJoue(joueur.id, enCours.id) : false}
        auDessus=${affiches.length > 4 && index >= affiches.length - 2}
        onAchat=${() => setAchat(joueur.id)} onArchiver=${() => archiver(joueur)} onSupprimer=${() => supprimer(joueur)} />`)}
    <//>`;
  }

  return html`<${Ecran} titre="Joueurs" actions=${actions}>
    ${joueurs.length > 0 && html`<div style="margin:4px 0 6px"><${Recherche} valeur=${recherche} onInput=${setRecherche} placeholder="Nom ou numéro" /></div>`}
    ${contenu}
    ${achat === true && html`<${AchatSheet} onFermer=${() => setAchat(null)} />`}
    ${typeof achat === 'string' && html`<${AchatSheet} joueurId=${achat} onFermer=${() => setAchat(null)} />`}
    ${creation && html`<${JoueurFormulaire} onFermer=${() => setCreation(false)} />`}
  <//>`;
}

/** Une ligne : numéro, nom, « A joué » (journée en cours), ce que son solde permet d'offrir, son solde. */
function LigneJoueur({ joueur, aJoue, auDessus, onAchat, onArchiver, onSupprimer }) {
  const r = reglages();
  const offrable = aOffrir(joueur.points);
  const items = [
    r.fideliteActive && !joueur.archive && { libelle: 'Enregistrer un achat…', icone: 'cart', onClick: onAchat },
    { libelle: joueur.archive ? 'Réactiver' : 'Archiver', icone: 'archivebox', onClick: onArchiver },
    null,
    { libelle: 'Supprimer…', icone: 'trash', destructif: true, onClick: onSupprimer },
  ];
  const pastille = joueur.archive
    ? html`<span class="pastille" style="color:var(--texte-2);background:var(--surface-3)">${joueur.numero}</span>`
    : html`<span class="pastille">${joueur.numero}</span>`;
  return html`<${LigneAvecMenu} href=${`#/joueur/${joueur.id}`} items=${items} titreMenu=${`Actions pour ${M.nomComplet(joueur)}`} auDessus=${auDessus}>
    ${pastille}
    <span class="ligne-texte">
      <div class=${joueur.archive ? 'ligne-titre secondaire' : 'ligne-titre'}>${M.nomComplet(joueur)}</div>
      <div class="ligne-sous-titre rangee envelopper" style="gap:2px 8px">
        ${joueur.archive
          ? html`<span>Archivé</span>`
          : html`
            ${aJoue && html`<span class="rangee vert" style="gap:3px"><${Icone} nom="checkmark.circle.fill" taille=${13} />A joué</span>`}
            ${offrable > 0 && html`<span>${enEuros(offrable)} à offrir</span>`}`}
      </div>
    </span>
    <span class="gras chiffres" style="white-space:nowrap">${enPoints(joueur.points)}</span>
  <//>`;
}
