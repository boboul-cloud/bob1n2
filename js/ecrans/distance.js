// Le jeu à distance dans l'app : envoyer la grille aux joueurs (lien, QR code, SMS), la page
// « Grilles reçues », et la fiche d'une grille reçue qu'on valide avec le code barman.
// Repris de DistanceViews.swift (EnvoiGrilleSheet, DestinatairesView, GrillesRecuesView,
// LigneGrilleRecue, GrilleRecueFiche ; GrilleAOuvrir devient `{ grilleId, dejaRecue }`).
//
// Ce que le web change :
// - « Un message par joueur » : une page web ne peut pas enchaîner seule les écrans « Nouveau
//   message ». La liste des joueurs s'affiche avec un bouton « Envoyer » par joueur (son lien
//   personnel, qui préremplit son nom et son numéro) ; le joueur est coché « Envoyé » une fois touché.
// - « Coller » lit le presse-papiers ; si le navigateur refuse, une zone de texte reçoit le lien.

import { html, useEffect, useMemo, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier, modeDemo } from '../store.js';
import * as M from '../modele.js';
import * as Caisse from '../caisse.js';
import * as D from '../grille-a-distance.js';
import { reglages, titreAffiche } from '../reglages.js';
import { compte, enCote, enDate, enPoints, heure, numeroSMS } from '../format.js';
import {
  Badge, BadgeStatutJournee, Bouton, Choix, ChampEntier, ChampTexte, ChampZone, Ecran, Feuille, Icone,
  Ligne, LigneValeur, Menu, PastilleNumero, Section, Vide,
} from '../ui/composants.js';
import { alerte, annoncer, confirmer, demanderCode } from '../ui/dialogues.js';
import { copier, estAppareilMobile, lirePressePapiers, ouvrirSMS, partager } from '../ui/systeme.js';
import { svgQR } from '../qr.js';
import { imprimerAffichette } from './imprimables.js';

/** « Voir la page du joueur » : la page s'ouvre à la place de l'app, en aperçu (« ?apercu » avant
 *  le « # », jamais dans la grille) ; elle montre alors « Retour à l'accueil », que les joueurs
 *  ne voient pas. Dans l'app de l'écran d'accueil, sans barre de navigation, c'est le seul retour. */
function voirLaPageDuJoueur(lien) {
  const [adresse, code = ''] = String(lien).split('#');
  location.href = `${adresse}?apercu${modeDemo ? '=demo' : ''}#${code}`;
}

// Quelques styles propres à ces écrans (QR code, étapes, choix d'une grille reçue).
const STYLE = `
.dist-tete { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; text-align: center; }
.dist-qr { width: min(284px, 100%); padding: 12px; background: #fff; border-radius: 14px; line-height: 0; }
.dist-qr svg { width: 100%; height: auto; display: block; }
.dist-titre { font-size: 17px; font-weight: 600; }
.dist-petit .ligne { font-size: 14px; }
.dist-petit .ligne .ligne-titre { font-weight: 400; }
.dist-etapes { display: flex; flex-direction: column; gap: 9px; padding: 14px 16px 6px; font-size: 15px; }
.dist-etape { display: flex; gap: 10px; align-items: flex-start; }
.dist-numero { flex: none; width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; border: 1.5px solid var(--accent);
  color: var(--accent); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.dist-coller { padding: 8px 16px 14px; }
.dist-issue { flex: none; min-width: 32px; min-height: 30px; display: grid; place-items: center; border-radius: 8px;
  background: var(--accent-doux); font-weight: 800; font-size: 17px; }
.dist-cote { flex: none; min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; font-size: 15px; }
.dist-decision { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dist-raccourcis { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; }
.dist-legende { font-size: 12px; color: var(--texte-2); margin-top: 2px; }
.dist-legende.rouge { color: var(--rouge); }
.dist-legende.orange { color: var(--orange); }
.dist-zone { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('style-distance')) {
  const balise = document.createElement('style');
  balise.id = 'style-distance';
  balise.textContent = STYLE;
  document.head.append(balise);
}

const parNumero = (a, b) => a.numero - b.numero;
const temps = (iso) => enDate(iso)?.getTime() ?? 0;

/** « Pierre D. · n° 12 » (GrilleRecueFiche.nomDeclare). */
export function nomDeclare(jouee) {
  const nom = (jouee.nom ?? '').trim();
  const numero = jouee.numero != null ? ` · n° ${jouee.numero}` : '';
  return (nom || 'Sans nom') + numero;
}

// MARK: - Envoi

/**
 * « Envoyer la grille aux joueurs » : par SMS aux joueurs qui ont un numéro, ou le lien et son
 * QR code, à partager, copier ou imprimer.
 */
export function EnvoiGrilleSheet({ journeeId, onFermer }) {
  useEtat();
  const journee = M.journee(journeeId);
  const r = reglages();
  const numeroBar = numeroSMS(r.telephoneBar);

  // Les références de la journée et de ses matchs, données une fois pour toutes avant le premier envoi.
  const [pret, setPret] = useState(() => !!journee && !D.manqueReferences(journee));
  useEffect(() => {
    if (journee && D.manqueReferences(journee)) modifier(() => D.attribuerReferences(journee));
    setPret(true);
  }, []);

  // Le lien est refait quand le téléphone du bar change (il y est écrit).
  const lien = useMemo(() => (pret && journee
    ? D.lien(journee, { titreJeu: titreAffiche(), mise: r.miseParDefaut, telephone: r.telephoneBar })
    : null), [pret, numeroBar]);

  const [qr, setQr] = useState(null);
  useEffect(() => {
    if (!lien) return undefined;
    let actif = true;
    svgQR(lien, { taille: 260 })
      .then((svg) => { if (actif) setQr({ lien, svg }); })
      .catch((erreur) => {
        if (!actif) return;
        const chargement = /charger|introuvable/i.test(erreur?.message ?? '');
        setQr({ lien, erreur: chargement ? 'chargement' : 'trop' });
      });
    return () => { actif = false; };
  }, [lien]);

  const actifs = M.joueurs({ archives: false }).sort(parNumero);
  const avecNumero = actifs.filter((j) => M.telephoneSMS(j) != null);
  const [selection, setSelection] = useState(() => new Set(avecNumero.map((j) => j.id)));
  const [envoyes, setEnvoyes] = useState(() => new Set());
  const [bilanEnvoi, setBilanEnvoi] = useState(null);
  const [destinataires, setDestinataires] = useState(false);
  /** La série « Un message par joueur » en cours : les joueurs, dans l'ordre. */
  const [serie, setSerie] = useState(null);
  const [copie, setCopie] = useState(false);

  if (!journee) return null;
  const choisis = avecNumero.filter((j) => selection.has(j.id));
  const nombreDeMatchs = M.matchs(journee.id).filter((m) => m.resultat == null).length;
  const titreJeu = titreAffiche();

  /** Les joueurs atteints sont décochés : un second envoi va aux suivants. */
  const noter = (ids) => {
    setEnvoyes((avant) => new Set([...avant, ...ids]));
    setSelection((avant) => new Set([...avant].filter((id) => !ids.includes(id))));
  };

  const envoyerUnParUn = () => {
    setBilanEnvoi(null);
    setSerie(choisis.map((j) => j.id));
  };

  const finirSerie = () => {
    const total = serie.length;
    const faits = serie.filter((id) => envoyes.has(id)).length;
    const texte = faits > 1 ? `${faits} messages envoyés` : `${faits} message envoyé`;
    setBilanEnvoi(faits < total ? `Série arrêtée : ${texte} sur ${total}. Les autres joueurs restent cochés.` : `${texte}.`);
    setSerie(null);
  };

  const envoyerGroupe = () => {
    const groupe = choisis;
    ouvrirSMS(groupe.map(M.telephoneSMS), D.message({ titreJeu, journee: journee.titre, lien, groupe: true }));
    noter(groupe.map((j) => j.id));
    setBilanEnvoi(`Message groupé envoyé à ${groupe.length} joueurs.`);
  };

  const partagerLien = async () => {
    const fait = await partager({
      titre: `${titreJeu} · ${journee.titre}`,
      texte: D.message({ titreJeu, journee: journee.titre }),
      url: lien,
    });
    if (fait === 'copie') annoncer('Message et lien copiés : collez-les où vous voulez.');
  };

  const sectionRetour = html`<${Section} titre="Les grilles vous reviennent au"
    pied=${numeroBar == null
      ? "Indiquez votre numéro : sur sa grille, le joueur n'aura qu'à toucher « Envoyer par SMS au bar » ou « Envoyer par WhatsApp », le message vous sera déjà adressé. Aussi dans Réglages › Jeu à distance."
      : "Sur sa grille, le joueur touche « Envoyer par SMS au bar » ou « Envoyer par WhatsApp » : le message vous est déjà adressé. Ce numéro figure dans le lien : quiconque a le lien, ou scanne l'affichette, peut le lire."}>
    <${ChampTexte} libelle="Téléphone du bar" placeholder="06 12 34 56 78" type="tel" inputMode="tel"
      autoComplete="tel" valeur=${r.telephoneBar}
      onInput=${(v) => modifier(() => { reglages().telephoneBar = v; })} />
  <//>`;

  const piedSMS = avecNumero.length === 0 ? null
    : `Un message par joueur : touchez « Envoyer » devant chacun ; « Nouveau message » s'ouvre avec son lien personnel, son nom et son numéro déjà remplis sur sa grille. Envoyez-le, puis revenez ici pour le suivant. Message groupé : un seul envoi, mais chacun voit le numéro des autres, et les réponses arrivent à tout le groupe.${estAppareilMobile() ? '' : " Sur un ordinateur, « Nouveau message » ne s'ouvre que si une app de messages y répond aux liens SMS (Messages sur un Mac avec iMessage, par exemple) ; sinon, partagez le lien."}`;

  const sectionSMS = html`<${Section} titre="Par SMS" pied=${piedSMS}>
    ${avecNumero.length === 0
      ? html`<${Ligne} icone="phone" classe="secondaire"
          titre="Ajoutez le téléphone des joueurs dans leur fiche pour leur envoyer la grille d'un coup : Joueurs › le joueur › ⋯ › Modifier le nom et le téléphone." />`
      : html`
        <${Ligne} titre="Destinataires" detail=${`${choisis.length} sur ${avecNumero.length}`} chevron
          onClick=${() => setDestinataires(true)} />
        <${Ligne} action icone="person.2" titre=${`Un message par joueur (${choisis.length})`}
          desactive=${choisis.length === 0} onClick=${envoyerUnParUn} />
        <${Ligne} action icone="bubble.left.and.bubble.right" titre=${`Message groupé (${choisis.length})`}
          desactive=${choisis.length === 0} onClick=${envoyerGroupe} />
        ${bilanEnvoi && html`<${Ligne} icone="checkmark.circle" couleurIcone="var(--vert)" classe="vert" titre=${bilanEnvoi} />`}`}
  <//>`;

  return html`<${Feuille} titre="Envoyer la grille" onFermer=${onFermer} gauche=${null}
      droite=${{ libelle: 'OK', onClick: onFermer }}>
    <${Section} pied="Les joueurs scannent ce code ou touchent le lien : ils cochent leurs pronostics sur leur téléphone, sans l'app, puis vous renvoient leur grille. Elle arrive dans « Grilles reçues », où vous la validez.">
      <div class="dist-tete">
        ${qr?.lien === lien && qr.svg && html`<div class="dist-qr" role="img" aria-label="QR code de la grille"
          dangerouslySetInnerHTML=${{ __html: qr.svg }}></div>`}
        ${qr?.lien === lien && qr.erreur && html`<div class="rangee secondaire"><${Icone} nom="qrcode" />
          ${qr.erreur === 'trop' ? 'Grille trop longue pour un QR code : partagez le lien.' : 'QR code indisponible pour le moment : partagez le lien.'}</div>`}
        <div class="dist-titre">${journee.titre} · ${compte(nombreDeMatchs, 'match')}</div>
      </div>
    <//>

    ${sectionRetour}

    ${lien && sectionSMS}

    ${lien && html`<${Section}>
      <${Ligne} action icone="square.and.arrow.up" titre="Partager le lien…" onClick=${partagerLien} />
      <${Ligne} action icone=${copie ? 'checkmark' : 'doc.on.doc'} titre=${copie ? 'Lien copié' : 'Copier le lien'}
        onClick=${async () => { if (await copier(lien)) setCopie(true); }} />
      <${Ligne} action icone="printer" titre="Affichette à imprimer" onClick=${() => imprimerAffichette(journee.id, lien)} />
      <${Ligne} action icone="safari" titre="Voir la page du joueur" onClick=${() => voirLaPageDuJoueur(lien)} />
    <//>`}

    <${Section} titre="Bon à savoir" classe="dist-petit">
      <${Ligne} icone="soccerball" titre="Les matchs qui ont déjà un résultat ne sont pas envoyés." />
      <${Ligne} icone="slider.horizontal.3" titre="Une cote changée après l'envoi : le pari prend la cote du moment, et l'app vous montre l'écart avant de valider. Renvoyez le lien pour que les joueurs voient les nouvelles cotes." />
      <${Ligne} icone="lock" titre="Fermer les paris de la journée arrête le jeu à distance : une grille reçue ensuite ne peut plus être validée." />
    <//>

    ${destinataires && html`<${DestinatairesSheet} journeeId=${journee.id} joueurs=${actifs} selection=${selection}
      onSelection=${setSelection} envoyes=${envoyes} onFermer=${() => setDestinataires(false)} />`}
    ${serie && html`<${SerieSheet} journee=${journee} lien=${lien} titreJeu=${titreJeu} ids=${serie} envoyes=${envoyes}
      onEnvoye=${(id) => noter([id])} onFermer=${finirSerie} />`}
  <//>`;
}

/** Qui reçoit la grille par SMS : les joueurs qui ont un numéro, cochés au départ. */
function DestinatairesSheet({ journeeId, joueurs, selection, onSelection, envoyes, onFermer }) {
  const avecNumero = joueurs.filter((j) => M.telephoneSMS(j) != null);
  const basculer = (id) => {
    const suivante = new Set(selection);
    if (suivante.has(id)) suivante.delete(id); else suivante.add(id);
    onSelection(suivante);
  };
  return html`<${Feuille} titre="Destinataires" onFermer=${onFermer} gauche=${null} droite=${{ libelle: 'OK', onClick: onFermer }}>
    <${Section}>
      <div class="dist-raccourcis">
        <${Bouton} taille="petit" onClick=${() => onSelection(new Set(avecNumero.map((j) => j.id)))}>Tout cocher<//>
        <${Bouton} taille="petit" onClick=${() => onSelection(new Set(avecNumero.filter((j) => !M.aJoue(j.id, journeeId)).map((j) => j.id)))}>Pas encore joué<//>
        <${Bouton} taille="petit" onClick=${() => onSelection(new Set())}>Aucun<//>
      </div>
    <//>
    <${Section} pied="Pour ajouter un numéro : Joueurs › le joueur › ⋯ › Modifier le nom et le téléphone.">
      ${joueurs.map((j) => {
        const coche = selection.has(j.id);
        const sansNumero = M.telephoneSMS(j) == null;
        let badge = null;
        if (envoyes.has(j.id)) badge = html`<${Badge} texte="Envoyé" symbole="checkmark" couleur="vert" />`;
        else if (M.aJoue(j.id, journeeId)) badge = html`<${Badge} texte="A joué" />`;
        return html`<${Ligne} key=${j.id} desactive=${sansNumero} onClick=${() => basculer(j.id)}
          avant=${html`<span class=${coche ? 'accent' : 'tertiaire'} aria-hidden="true">
            <${Icone} nom=${coche ? 'checkmark.circle.fill' : 'circle'} taille=${22} /></span>`}
          titre=${`${j.numero} · ${M.nomComplet(j)}`} sousTitre=${sansNumero ? 'Pas de numéro' : j.telephone}
          detail=${badge} />`;
      })}
    <//>
  <//>`;
}

/** « Un message par joueur » : un bouton « Envoyer » par joueur, l'un après l'autre. */
function SerieSheet({ journee, lien, titreJeu, ids, envoyes, onEnvoye, onFermer }) {
  const joueurs = ids.map((id) => M.joueur(id)).filter(Boolean);
  const faits = ids.filter((id) => envoyes.has(id)).length;
  const envoyer = (joueur) => {
    const numero = M.telephoneSMS(joueur);
    if (!numero) return;
    const sien = D.lienPour(lien, joueur);
    ouvrirSMS([numero], D.message({ titreJeu, journee: journee.titre, lien: sien, prenom: joueur.prenom }));
    onEnvoye(joueur.id);
  };
  return html`<${Feuille} titre="Un message par joueur" onFermer=${onFermer} gauche=${null}
      droite=${{ libelle: 'Terminé', onClick: onFermer }}>
    <${Section} titre=${`${faits} sur ${ids.length}`}
      pied="Chaque message porte le lien personnel du joueur : son nom et son numéro sont déjà remplis sur sa grille. Touchez « Envoyer » dans « Nouveau message », puis revenez ici pour le joueur suivant. Ceux que vous n'avez pas touchés restent cochés pour la suite.">
      ${joueurs.map((j) => {
        const fait = envoyes.has(j.id);
        return html`<${Ligne} key=${j.id} titre=${`${j.numero} · ${M.nomComplet(j)}`} sousTitre=${j.telephone}
          detail=${html`<span class="rangee">
            ${fait && html`<${Badge} texte="Envoyé" symbole="checkmark" couleur="vert" />`}
            <${Bouton} taille="petit" variante=${fait ? null : 'principal'} icone="paperplane"
              onClick=${() => envoyer(j)}>${fait ? 'Renvoyer' : 'Envoyer'}<//>
          </span>`} />`;
      })}
    <//>
  <//>`;
}

// MARK: - Grilles reçues

/** La page « Grilles reçues » : les grilles jouées à distance, à valider, puis traitées. */
export function GrillesRecuesView() {
  const etat = useEtat();
  /** La grille ouverte (GrilleAOuvrir) : { grilleId, dejaRecue }. */
  const [ouverte, setOuverte] = useState(null);
  /** La zone de texte, quand le navigateur ne laisse pas lire le presse-papiers. */
  const [zone, setZone] = useState(null);

  const grilles = [...etat.grillesRecues].sort((a, b) => temps(b.dateReception) - temps(a.dateReception));
  const journees = M.journeesTriees();
  const aValider = grilles.filter((g) => g.statut === 'aValider');
  const traitees = grilles.filter((g) => g.statut !== 'aValider');

  const recevoir = (texte) => {
    try {
      const recu = modifier(() => D.recevoir(texte));
      setZone(null);
      setOuverte({ grilleId: recu.grille.id, dejaRecue: recu.dejaRecue });
    } catch (erreur) {
      alerte('Grille non reçue', erreur?.message ?? String(erreur));
    }
  };

  const coller = async () => {
    const texte = await lirePressePapiers();
    if (texte == null) {
      setZone('');
      return;
    }
    recevoir(texte);
  };

  const effacerTraitees = () => modifier((e) => {
    e.grillesRecues = e.grillesRecues.filter((g) => g.statut === 'aValider');
  });

  const ligne = (g) => html`<${LigneGrilleRecue} key=${g.id} grille=${g} journees=${journees}
    onClick=${() => setOuverte({ grilleId: g.id, dejaRecue: false })} />`;

  return html`<${Ecran} titre="Grilles reçues" actions=${traitees.length > 0 && html`<${Menu} titre="Options" items=${[
    { libelle: 'Effacer les grilles traitées', icone: 'trash', destructif: true, onClick: effacerTraitees },
  ]} />`}>
    <${Section} pied="« Coller » lit le lien ou le message reçu du joueur.">
      <div class="dist-etapes">
        <div class="dist-etape"><span class="dist-numero">1</span><span>Dans une journée ouverte : « Envoyer la grille aux joueurs »</span></div>
        <div class="dist-etape"><span class="dist-numero">2</span><span>Chaque joueur coche sa grille sur son téléphone et vous renvoie un lien</span></div>
        <div class="dist-etape"><span class="dist-numero">3</span><span>Touchez ce lien, ou collez-le ici : choisissez le joueur, vérifiez la mise, validez</span></div>
      </div>
      <div class="dist-coller">
        <${Bouton} variante="principal" icone="doc.on.clipboard" onClick=${coller}>Coller<//>
      </div>
    <//>

    ${zone != null && html`<${Section} titre="Coller le lien"
        pied="Ce navigateur ne laisse pas l'app lire le presse-papiers : collez ici le lien ou le message du joueur (appui long › Coller, ou ⌘V / Ctrl+V).">
      <div class="dist-zone">
        <${ChampZone} valeur=${zone} onInput=${setZone} lignes=${4} autoFocus
          placeholder="Ma grille pour Journée 6 (Pierre Dupont) : https://…/recu/#z…" />
        <div class="rangee">
          <${Bouton} variante="principal" desactive=${!zone.trim()} onClick=${() => recevoir(zone)}>Lire la grille<//>
          <${Bouton} variante="lien" onClick=${() => setZone(null)}>Annuler<//>
        </div>
      </div>
    <//>`}

    ${grilles.length === 0 && html`<${Section}><${Vide} icone="tray" titre="Aucune grille reçue"
      texte="Les grilles que les joueurs vous renvoient apparaîtront ici." /><//>`}
    ${aValider.length > 0 && html`<${Section} titre=${`À valider (${aValider.length})`}>${aValider.map(ligne)}<//>`}
    ${traitees.length > 0 && html`<${Section} titre=${`Traitées (${traitees.length})`}>${traitees.map(ligne)}<//>`}

    ${ouverte && html`<${GrilleRecueFiche} grilleId=${ouverte.grilleId} dejaRecue=${ouverte.dejaRecue}
      onFermer=${() => setOuverte(null)} />`}
  <//>`;
}

const COULEUR_STATUT = { aValider: 'var(--orange)', validee: 'var(--vert)', refusee: 'var(--texte-2)' };

/** Une ligne de « Grilles reçues » : qui l'a envoyée, pour quelle journée, où elle en est. */
function LigneGrilleRecue({ grille, journees, onClick }) {
  const jouee = D.contenu(grille);
  const statut = M.STATUTS_GRILLE_RECUE[grille.statut] ?? M.STATUTS_GRILLE_RECUE.aValider;
  const avant = html`<span style=${`color:${COULEUR_STATUT[grille.statut] ?? COULEUR_STATUT.aValider};flex:none;width:28px;display:grid;place-items:center`}>
    <${Icone} nom=${statut.symbole} taille=${22} /></span>`;
  if (!jouee) {
    return html`<${Ligne} avant=${avant} titre="Grille illisible" onClick=${onClick} chevron=${grille.statut === 'aValider'} />`;
  }
  let details;
  if (grille.statut === 'aValider') {
    const analyse = D.analyser(jouee, journees);
    const blocage = analyse.blocage;
    details = html`
      <div class="dist-legende">${analyse.journee?.titre ?? jouee.titre} · ${analyse.descriptionFormule} · ${enPoints(analyse.miseTotale(analyse.mise))}</div>
      ${blocage && html`<div class="dist-legende rouge">${blocage}</div>`}
      <div class="dist-legende">Reçue le ${heure(grille.dateReception)}</div>`;
  } else {
    details = html`
      <div class="dist-legende">${jouee.titre} · ${grille.bilan}</div>
      <div class="dist-legende">${statut.libelle} le ${heure(grille.dateTraitement ?? grille.dateReception)}</div>`;
  }
  return html`<${Ligne} avant=${avant} titre=${nomDeclare(jouee)} onClick=${onClick}
    chevron=${grille.statut === 'aValider'}>${details}<//>`;
}

// MARK: - Une grille reçue

/** Une grille reçue : le joueur, ses pronostics, la mise ; « Valider le pari » avec le code barman. */
export function GrilleRecueFiche({ grilleId, dejaRecue = false, onFermer }) {
  useEtat();
  const r = reglages();
  const grille = M.grilleRecue(grilleId);
  const jouee = grille ? D.contenu(grille) : null;

  // preparer() du Swift : la mise demandée, et le joueur que désigne la grille.
  const [depart] = useState(() => {
    if (!jouee) return { choix: 'aucun', propose: false, mise: 1 };
    const joueur = D.joueurPropose({ nom: jouee.nom, numero: jouee.numero, joueurs: M.joueurs() });
    return { choix: joueur ? joueur.id : 'aucun', propose: !!joueur, mise: Math.max(1, jouee.mise) };
  });
  /** « aucun », « nouveau » ou l'id d'un joueur. */
  const [choixJoueur, setChoixJoueur] = useState(depart.choix);
  const [mise, setMise] = useState(depart.mise);
  const propose = depart.propose;

  if (!grille) return null;
  const illisible = html`<${Feuille} titre="Grille reçue" onFermer=${onFermer} gauche=${{ libelle: 'Fermer', onClick: onFermer }} large>
    <${Vide} icone="exclamationmark.triangle" titre="Grille illisible" />
  <//>`;
  if (!jouee) return illisible;

  const analyse = D.analyser(jouee);
  const aValider = grille.statut === 'aValider';
  const actifs = M.joueurs({ archives: false }).sort(parNumero);
  const joueurChoisi = choixJoueur !== 'aucun' && choixJoueur !== 'nouveau' ? M.joueur(choixJoueur) : null;
  const choix = joueurChoisi || choixJoueur === 'nouveau' ? choixJoueur : 'aucun';
  const statut = M.STATUTS_GRILLE_RECUE[grille.statut] ?? M.STATUTS_GRILLE_RECUE.aValider;

  let solde = Infinity;
  if (joueurChoisi) solde = joueurChoisi.points;
  else if (choix === 'nouveau') solde = r.pointsDepart;

  const valider = async () => {
    if (!(await demanderCode(`Valider le pari de ${nomDeclare(jouee)}`))) return;
    try {
      modifier(() => {
        let cree = null;
        try {
          let joueur;
          if (choix === 'nouveau') {
            const noms = D.prenomEtNom(jouee.nom);
            joueur = Caisse.nouveauJoueur({ nom: noms.nom, prenom: noms.prenom, points: reglages().pointsDepart });
            cree = joueur;
          } else if (joueurChoisi) {
            joueur = joueurChoisi;
          } else {
            throw new Caisse.ErreurCaisse('Choisissez le joueur.');
          }
          D.valider(grille, { analyse: D.analyser(jouee), joueur, mise });
        } catch (erreur) {
          if (cree) M.supprimerJoueur(cree.id);
          throw erreur;
        }
      });
      onFermer();
    } catch (erreur) {
      alerte('Pari impossible', erreur?.message ?? String(erreur));
    }
  };

  const refuser = async () => {
    const oui = await confirmer({
      titre: 'Refuser cette grille ?',
      message: "Aucun pari n'est enregistré. Prévenez le joueur s'il doit rejouer.",
      bouton: 'Refuser la grille', destructif: true,
    });
    if (!oui) return;
    modifier(() => D.refuser(grille));
    onFermer();
  };

  const supprimer = () => {
    onFermer();
    modifier((e) => { e.grillesRecues = e.grillesRecues.filter((g) => g.id !== grille.id); });
  };

  // Joueur
  let sectionJoueur = null;
  if (aValider) {
    const options = [{ valeur: 'aucun', libelle: 'Choisir…' }];
    if ((jouee.nom ?? '').trim()) options.push({ valeur: 'nouveau', libelle: `Nouveau joueur : ${jouee.nom}` });
    for (const j of actifs) options.push({ valeur: j.id, libelle: `${j.numero} · ${M.nomComplet(j)}` });
    let pied = null;
    if (propose && joueurChoisi) pied = 'Proposé d\'après le nom et le numéro donnés par le joueur : vérifiez avant de valider.';
    else if (!propose) pied = 'Aucun joueur ne correspond au nom donné : choisissez-le dans la liste, ou créez-le.';
    sectionJoueur = html`<${Section} titre="Joueur" pied=${pied}>
      <${Choix} libelle="Joueur" valeur=${choix} options=${options} onChange=${setChoixJoueur} />
      ${joueurChoisi && html`<${LigneValeur} libelle="Porte-feuilles" valeur=${enPoints(joueurChoisi.points)} />`}
      ${joueurChoisi && analyse.journee && M.aJoue(joueurChoisi.id, analyse.journee.id) && html`<${Ligne}
        icone="info.circle" couleurIcone="var(--orange)" classe="orange" titre="A déjà un pari sur cette journée." />`}
      ${choix === 'nouveau' && html`<${LigneValeur} libelle="Porte-feuilles de départ" valeur=${enPoints(r.pointsDepart)} />`}
    <//>`;
  }

  // Mise
  let sectionMise = null;
  if (aValider) {
    const systeme = analyse.niveauxRetenus != null;
    const total = analyse.miseTotale(mise);
    const demandee = Math.max(1, jouee.mise);
    sectionMise = html`<${Section} titre="Mise" pied=${mise !== demandee
      ? `Le joueur demandait ${enPoints(demandee)}${systeme ? ' par combinaison' : ''}.`
      : 'La mise demandée par le joueur : vous pouvez la corriger avant de valider.'}>
      <${ChampEntier} libelle=${systeme ? 'Mise par combinaison' : 'Mise'} valeur=${mise} minimum=${1} maximum=${99999}
        onChange=${(n) => setMise(Math.max(1, n))} />
      <${LigneValeur} libelle="Mise totale" valeur=${html`<span class=${total > solde + 0.0001 ? 'rouge' : ''}>${enPoints(total)}</span>`} />
      <${LigneValeur} libelle="Gains potentiels" valeur=${html`<span class="vert">${enPoints(analyse.evaluation(mise).gainMaximum)}</span>`} />
    <//>`;
  }

  const blocage = analyse.blocage;
  const pied = aValider && html`<div class="dist-decision">
    <${Bouton} variante="destructif" taille="grand" icone="xmark" onClick=${refuser}>Refuser<//>
    <${Bouton} variante="principal" taille="grand" icone="checkmark.circle.fill"
      desactive=${blocage != null || choix === 'aucun'} onClick=${valider}>Valider le pari<//>
  </div>`;

  return html`<${Feuille} titre="Grille reçue" onFermer=${onFermer} gauche=${{ libelle: 'Fermer', onClick: onFermer }}
      large pied=${pied}>
    <${Section}>
      <${LigneValeur} libelle="Envoyée par" valeur=${nomDeclare(jouee)} />
      <${LigneValeur} libelle="Journée" valeur=${html`<span class="rangee" style="justify-content:flex-end">
        ${analyse.journee?.titre ?? jouee.titre}
        ${analyse.journee && html`<${BadgeStatutJournee} statut=${analyse.journee.statut} />`}</span>`} />
      <${LigneValeur} libelle="Reçue le" valeur=${heure(grille.dateReception)} />
      ${!aValider && html`<${LigneValeur} libelle=${`${statut.libelle} le`} valeur=${heure(grille.dateTraitement ?? grille.dateReception)} />`}
      ${!aValider && html`<${Ligne} classe="gras" titre=${grille.bilan} />`}
    <//>

    ${dejaRecue && html`<${Section}><${Ligne} icone="info.circle"
      titre="Cette grille était déjà arrivée : elle n'a pas été ajoutée une seconde fois." /><//>`}

    ${aValider && blocage && html`<${Section}><${Ligne} icone="exclamationmark.triangle.fill" couleurIcone="var(--rouge)"
      classe="rouge gras" titre=${blocage} /><//>`}

    ${sectionJoueur}

    <${Section} titre=${analyse.descriptionFormule}
      pied=${aValider && analyse.cotesChangees.length > 0
        ? "Des cotes ont changé depuis l'envoi : le pari prend les cotes affichées, pas celles que le joueur a vues."
        : null}>
      ${analyse.choix.map((c) => html`<div class="ligne" key=${c.rencontre.id}>
        <${PastilleNumero} numero=${c.rencontre.ordre} />
        <span class="ligne-texte">
          <div class="ligne-titre gras">${M.intitule(c.rencontre)}</div>
          ${aValider && c.coteChangee && html`<div class="dist-legende orange">Cote vue par le joueur : ${enCote(c.coteVue)}</div>`}
        </span>
        <span class="dist-issue">${c.issue}</span>
        <span class="dist-cote">${enCote(c.cote)}</span>
      </div>`)}
      ${analyse.introuvables > 0 && html`<${Ligne} icone="questionmark.circle" couleurIcone="var(--rouge)" classe="rouge"
        titre=${analyse.introuvables > 1 ? `${analyse.introuvables} matchs introuvables` : '1 match introuvable'} />`}
    <//>

    ${aValider ? sectionMise : html`<${Section}>
      <${Ligne} destructif titre="Supprimer la grille" onClick=${supprimer} />
    <//>`}
  <//>`;
}
