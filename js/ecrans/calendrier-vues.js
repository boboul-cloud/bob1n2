// Le calendrier de la saison : le coller, l'importer d'un PDF, le consulter, et en mettre les matchs
// dans la grille d'une journée. Repris de CalendrierViews.swift.

import { html, useEffect, useMemo, useState } from '../../vendor/preact-htm.js';
import { useEtat, modifier } from '../store.js';
import * as M from '../modele.js';
import { ajouterALaGrille, completer, enregistrer, journeeQuiVient, journeesDe, lire as lireCalendrier } from '../calendrier.js';
import { competitionExistante, importer as importerPoule, lirePDF, nomCourt, nombreDeMatchs, recherche } from '../pdf-calendrier.js';
import { reglages } from '../reglages.js';
import { cle, court, enDate, jour } from '../format.js';
import { Badge, Bouton, ChampTexte, Choix, Ecran, Feuille, Icone, Interrupteur, Ligne, Section, Segment, Vide } from '../ui/composants.js';
import { alerte } from '../ui/dialogues.js';
import { ecouter } from '../ui/evenements.js';
import { choisirFichier, ouvrirLien } from '../ui/systeme.js';
import { ZoneCollage } from './collage-vues.js';

// MARK: - Choisir un PDF

/** Le PDF choisi (ou déposé), lu : rend ses poules, [] si rien n'y est reconnu, `null` si l'on annule. */
async function choisirPDF() {
  const fichier = await choisirFichier('application/pdf,.pdf');
  if (!fichier) return null;
  return lirePDF(fichier);
}

/** Un PDF glissé sur la feuille (ordinateur) : `surFichier(fichier)` le reçoit. */
function depot(surFichier) {
  return {
    onDragOver: (e) => {
      if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    onDrop: (e) => {
      const fichier = [...(e.dataTransfer?.files ?? [])].find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      if (!fichier) return;
      e.preventDefault();
      surFichier(fichier);
    },
  };
}

/** Une souris (ordinateur) : on peut y glisser un fichier. */
function avecSouris() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
}

// MARK: - Coller le calendrier

const EXEMPLE = 'Journée 1 - 07/09/2026\nAS KERVEN - FC LANDIVIAU\nUS TREMEUR - ES PLOUNEOUR\n\nJournée 2 - 14/09/2026\n…';

/**
 * Le calendrier de la saison d'une compétition : le PDF officiel « Calendriers par journée » (ou « par
 * date », ou une affiche en cases) du district ou de la ligue (« Importer le PDF du calendrier… », une
 * poule au choix), ou un texte collé ou tapé, d'un coup ou une semaine après l'autre (« Ajouter ces
 * journées »).
 */
export function CollerCalendrierSheet({ competitionId, onFermer }) {
  useEtat();
  const competition = M.championnat(competitionId);
  const [texte, setTexte] = useState('');
  const [mode, setMode] = useState('ajouter');
  /** Les poules lues dans le PDF importé, et celle retenue. */
  const [poules, setPoules] = useState([]);
  const [poule, setPoule] = useState(null);
  const [lecture, setLecture] = useState(false);
  const lues = useMemo(() => lireCalendrier(texte), [texte]);
  if (!competition) return null;

  const aDejaUnCalendrier = M.calendrierDe(competition.id).length > 0;
  const pouleChoisie = poules.find((p) => p.id === poule) ?? null;
  const journees = pouleChoisie?.journees ?? lues;
  const matchs = journees.reduce((s, j) => s + j.matchs.length, 0);
  const equipes = new Set(journees.flatMap((j) => j.matchs).flatMap((m) => [cle(m.domicile), cle(m.exterieur)])).size;

  /** La poule qui partage le plus d'équipes avec la compétition, sinon la première. */
  const pouleLaPlusProche = (liste) => {
    const siennes = new Set(M.lignesDe(competition.id).map((l) => cle(l.equipe)));
    const communes = (p) => p.equipes.filter((e) => siennes.has(cle(e))).length;
    return liste.reduce((meilleure, p) => (communes(p) > communes(meilleure) ? p : meilleure), liste[0]);
  };

  const recevoir = (liste) => {
    if (liste == null) return;
    if (!liste.length) {
      alerte('PDF non reconnu', 'Aucun calendrier reconnu dans ce PDF. Copiez son texte dans la zone ci-dessous, ou tapez les matchs.');
      return;
    }
    setPoules(liste);
    setPoule(pouleLaPlusProche(liste).id);
  };
  const lirePuis = async (promesse) => {
    setLecture(true);
    try {
      recevoir(await promesse);
    } finally {
      setLecture(false);
    }
  };

  const valider = () => {
    modifier(() => {
      const c = M.championnat(competitionId);
      if (aDejaUnCalendrier && mode === 'ajouter') completer(journees, c);
      else enregistrer(journees, c);
    });
    onFermer();
  };

  const libelle = !aDejaUnCalendrier ? 'Enregistrer' : (mode === 'ajouter' ? 'Ajouter' : 'Remplacer');

  return html`<${Feuille} titre="Calendrier de la saison" large onFermer=${onFermer}
    droite=${{ libelle, onClick: valider, desactive: matchs === 0 }}>
    <div ...${depot((f) => lirePuis(lirePDF(f)))}>
      <${Section} titre="Le PDF officiel"
        pied="Le calendrier « par journée » ou « par date » que publie votre district ou votre ligue (ou son affiche en cases « J1, J2… »), enregistré sur l'appareil : l'app le lit tel qu'il s'affiche, matchs aller et retour. S'il couvre plusieurs poules, choisissez la vôtre.">
        <${Ligne} action desactive=${lecture} avant=${html`<${Icone} nom="doc.richtext" />`}
          titre=${lecture ? 'Lecture du PDF…' : 'Importer le PDF du calendrier…'} onClick=${() => lirePuis(choisirPDF())} />
        ${poules.length > 1 && html`<${Choix} libelle="Poule" valeur=${poule} onChange=${setPoule}
          options=${poules.map((p) => ({ valeur: p.id, libelle: `${p.titre} · ${p.equipes.length} équipes` }))} />`}
        ${pouleChoisie && html`
          <div class="ligne"><span class="petit secondaire">${pouleChoisie.equipes.join(' · ')}</span></div>
          <${Ligne} destructif titre="Revenir au texte collé" onClick=${() => { setPoules([]); setPoule(null); }} />`}
      <//>
      <${Section} titre="Ou un texte" classe=${pouleChoisie ? 'cal-inactif' : ''}
        pied="Un calendrier tapé ou copié, ou une page qui montre les matchs d'une semaine, copiée en entier : touchez « Coller », ou tapez-le. Reconnus : « Journée 3 », « J3 », les dates, et les matchs « A - B », « A / B » ou « A contre B », sur une ligne, en tableau ou sur plusieurs lignes.">
        <div inert=${pouleChoisie ? true : undefined}>
          <${ZoneCollage} valeur=${texte} onInput=${setTexte} placeholder=${EXEMPLE} page=${competition.adresse} />
        </div>
      <//>
      ${aDejaUnCalendrier && html`<${Section} pied=${mode === 'ajouter'
        ? 'Les journées collées rejoignent le calendrier : une journée de même date le complète, un match déjà présent n\'est pas doublé. Pratique pour ajouter les semaines une à une.'
        : 'Le calendrier actuel est effacé et remplacé par celui-ci.'}>
        <div class="ligne"><${Segment} classe="grandit" valeur=${mode} onChange=${setMode}
          options=${[{ valeur: 'ajouter', libelle: 'Ajouter ces journées' }, { valeur: 'remplacer', libelle: 'Remplacer le calendrier' }]} /></div>
      <//>`}
      ${journees.length > 0
        ? html`<${Section} titre=${`Aperçu · ${journees.length} journées · ${matchs} matchs · ${equipes} équipes`}
            pied=${pouleChoisie
              ? 'Vérifiez les journées et les équipes. Les équipes absentes de la compétition y seront ajoutées.'
              : "Vérifiez les journées et les équipes : corrigez le texte au besoin, l'aperçu suit. Les équipes absentes de la compétition y seront ajoutées."}>
            ${journees.slice(0, 40).map((j) => html`<div class="ligne" key=${j.numero}><span class="ligne-texte">
              <div class="rangee espace">
                <span class="gras">${j.numeroExplicite ? `Journée ${j.numero}` : (j.date ? `Matchs du ${court(j.date)}` : 'Matchs')}</span>
                ${j.date && html`<span class="petit secondaire">${court(j.date)}</span>`}
              </div>
              <div class="ligne-sous-titre cal-trois-lignes">${j.matchs.map((m) => `${m.domicile} – ${m.exterieur}`).join(' · ')}</div>
            </span></div>`)}
          <//>`
        : texte && html`<${Section}>
            <div class="ligne orange"><${Icone} nom="exclamationmark.triangle" taille=${18} />
              <span>Aucun match reconnu dans ce texte : un match par ligne, « AS KERVEN - FC LANDIVIAU ».</span></div>
          <//>`}
    </div>
  <//>`;
}

// MARK: - Importer un calendrier (PDF)

const NON_RECONNU = "Aucun match reconnu dans ce PDF (une image scannée, peut-être). Prenez le calendrier de votre division sur le site de votre district ou de votre ligue, ou collez-en le texte dans une compétition.";

/** Les feuilles « Importer un calendrier » ouvertes. Un PDF reçu pendant que l'une d'elles est à l'écran
 *  y arrive directement (événement « calendrierRecu ») : une autre feuille ne s'ouvre pas par-dessus. */
let importsOuverts = 0;
export function importCalendrierOuvert() {
  return importsOuverts > 0;
}

/**
 * « Importer un calendrier » : le PDF « Calendriers par journée » ou « par date » du district ou de la
 * ligue (ou son affiche en cases), puis un appui sur sa poule. La compétition est créée d'office (ou
 * mise à jour), avec ses équipes et toutes ses journées. `poules` : celles d'un PDF déjà lu.
 */
export function ImportCalendrierSheet({ poules: initiales, onFermer }) {
  useEtat();
  const [poules, setPoules] = useState(initiales ?? []);
  const [lecture, setLecture] = useState(false);
  const district = reglages().districtCalendrier;
  const lienRecherche = recherche(district);

  const recevoir = (lues) => {
    if (lues == null) return;
    if (!lues.length) alerte('PDF non reconnu', NON_RECONNU);
    else setPoules(lues);
  };
  const lirePuis = async (promesse) => {
    setLecture(true);
    try {
      recevoir(await promesse);
    } finally {
      setLecture(false);
    }
  };

  useEffect(() => {
    importsOuverts += 1;
    const fin = ecouter('calendrierRecu', (d) => recevoir(d?.poules ?? []));
    return () => {
      importsOuverts -= 1;
      fin();
    };
  }, []);

  const importer = async (poule) => {
    const { competition, nouvelle } = modifier(() => importerPoule(poule));
    await alerte('Calendrier importé', `« ${competition.nom} » ${nouvelle ? 'créée' : 'mise à jour'} : ${poule.equipes.length} équipes, ${poule.journees.length} journées, ${nombreDeMatchs(poule)} matchs. Chaque semaine, « Nouvelle journée » prend les matchs de la journée qui vient.`);
    onFermer();
  };

  const boutonChoisir = (libelle) => html`<${Ligne} action desactive=${lecture} avant=${html`<${Icone} nom="folder" />`}
    titre=${lecture ? 'Lecture du PDF…' : libelle} onClick=${() => lirePuis(choisirPDF())} />`;

  return html`<${Feuille} titre="Importer un calendrier" large gauche=${{ libelle: 'Fermer', onClick: onFermer }} onFermer=${onFermer}>
    <div class="cal-depot" ...${depot((f) => lirePuis(lirePDF(f)))}>
      ${poules.length === 0
        ? html`
          <${Section} titre="① Trouver le PDF"
            pied="La recherche s'ouvre dans votre navigateur : prenez la page des calendriers de votre district, de votre ligue ou de votre fédération, puis le PDF de votre division. En France, c'est le PDF « Calendriers par journée » ou « Calendriers par date », parfois une affiche en cases « J1, J2… ».">
            <${ChampTexte} plein libelle="Votre district ou votre ligue" placeholder="Finistère, Ille-et-Vilaine, Bretagne…"
              valeur=${district} onInput=${(v) => modifier((e) => { e.reglages.districtCalendrier = v; })} />
            ${lienRecherche && html`<${Ligne} action avant=${html`<${Icone} nom="magnifyingglass" />`}
              titre=${html`<span class="gras">Chercher le calendrier</span>`} onClick=${() => ouvrirLien(lienRecherche)} />`}
          <//>
          <${Section} titre="② Le donner à Bob 1N2">
            <div class="ligne petit"><${Icone} nom="arrow.down.doc" taille=${18} classe="accent" />
              <span>Enregistrez le PDF de votre division (D1, D2…) sur l'appareil, puis choisissez-le ici${avecSouris() ? ' (ou déposez-le dans cette fenêtre)' : ''} : il est lu sur l'appareil, sans être envoyé nulle part.</span></div>
            ${boutonChoisir('Choisir le PDF…')}
          <//>
          <${Section} titre="③ Choisir sa poule">
            <div class="ligne petit"><${Icone} nom="hand.tap" taille=${18} classe="accent" />
              <span>Touchez votre poule : la compétition est créée avec ses équipes et toutes ses journées.</span></div>
          <//>`
        : html`
          <${Section} titre="Touchez votre poule"
            pied="La compétition est créée avec ses équipes et toutes ses journées, aller et retour ; si elle existe déjà, son calendrier est remplacé.">
            ${poules.map((poule) => html`<${LignePoule} key=${poule.id} poule=${poule} onClick=${() => importer(poule)} />`)}
          <//>
          <${Section}>${boutonChoisir('Choisir un autre PDF…')}<//>`}
    </div>
  <//>`;
}

function LignePoule({ poule, onClick }) {
  const cible = competitionExistante(poule, M.championnatsTries());
  return html`<${Ligne} onClick=${onClick} chevron>
    <div class="rangee espace envelopper">
      <span class="gras">${nomCourt(poule.titre)}</span>
      ${cible && html`<${Badge} texte=${`Met à jour « ${cible.nom} »`} couleur="orange" />`}
    </div>
    <div class="ligne-sous-titre cal-trois-lignes">${poule.equipes.join(' · ')}</div>
    <div class="tres-petit secondaire">${poule.equipes.length} équipes · ${poule.journees.length} journées</div>
  <//>`;
}

// MARK: - Le calendrier d'une compétition

/** Toutes les journées du calendrier ; une coche pour les matchs déjà mis dans une grille. */
export function CalendrierView({ competitionId }) {
  useEtat();
  const competition = M.championnat(competitionId);
  const [coller, setColler] = useState(false);
  if (!competition) {
    return html`<${Ecran} titre="Calendrier" retour="#/competitions">
      <${Vide} icone="calendar" titre="Compétition introuvable" texte="Elle a été supprimée." />
    <//>`;
  }
  const journees = journeesDe(competition);
  const actions = html`<${Bouton} variante="lien" icone="doc.on.clipboard" titre="Coller des journées" onClick=${() => setColler(true)} />`;

  return html`<${Ecran} titre=${`Calendrier · ${competition.nom}`} retour=${`#/competition/${competition.id}`}
    libelleRetour=${competition.nom || 'Compétition'} actions=${actions}>
    ${journees.length === 0 && html`<${Vide} icone="calendar" titre="Pas de calendrier"
      texte="Collez le calendrier de la saison : chaque semaine, ses matchs rejoindront la grille d'un geste.">
      <${Bouton} variante="principal" onClick=${() => setColler(true)}>Coller le calendrier…<//>
    <//>`}
    ${journees.map((j) => html`<${Section} key=${j.numero} titre=${`Journée ${j.numero}`}
      actions=${j.date ? html`<span class="petit">${jour(j.date)}</span>` : null}>
      ${j.matchs.map((m) => html`<div class="ligne" key=${m.id}>
        <span class="ligne-texte cal-deux-lignes">${M.intituleCalendrier(m)}</span>
        ${m.ajoute && html`<span class="vert" title="Dans une grille" aria-label="Dans une grille"><${Icone} nom="checkmark.circle.fill" taille=${20} /></span>`}
      </div>`)}
    <//>`)}
    ${coller && html`<${CollerCalendrierSheet} competitionId=${competition.id} onFermer=${() => setColler(false)} />`}
  <//>`;
}

// MARK: - Les matchs de la semaine

const temps = (iso) => enDate(iso)?.getTime() ?? Number.NEGATIVE_INFINITY;

/**
 * « Matchs du calendrier » : pour chaque compétition qui a son calendrier, la journée qui vient, ses
 * matchs cochés ; « Ajouter » les ouvre aux paris, cotes proposées.
 */
export function MatchsDuCalendrierSheet({ journeeId, onFermer }) {
  useEtat();
  const journee = M.journee(journeeId);
  /** Journée du calendrier choisie pour chaque compétition. */
  const [numeros, setNumeros] = useState({});
  const [choisis, setChoisis] = useState(() => new Set());
  const [importer, setImporter] = useState(false);
  const [preparation, setPreparation] = useState(0);

  const avecCalendrier = M.championnatsTries().filter((c) => M.calendrierDe(c.id).length > 0);

  /** Les matchs de la journée `numero` pas encore ajoutés, cochés à la place de ceux de la compétition. */
  const cocher = (competition, numero, depuis) => {
    const siens = new Set(M.calendrierDe(competition.id).map((m) => m.id));
    const suite = new Set([...depuis].filter((id) => !siens.has(id)));
    for (const m of M.calendrierDe(competition.id)) {
      if (m.numeroJournee === numero && !m.ajoute) suite.add(m.id);
    }
    return suite;
  };

  // Pour chaque compétition, la journée qui vient, ses matchs pas encore ajoutés cochés (à l'ouverture,
  // et de nouveau après un import).
  useEffect(() => {
    if (!journee) return;
    const nouveaux = {};
    let suite = new Set(choisis);
    for (const competition of avecCalendrier) {
      const vient = journeeQuiVient(competition, journee.date);
      if (!vient) continue;
      nouveaux[competition.id] = vient.numero;
      suite = cocher(competition, vient.numero, suite);
    }
    setNumeros((avant) => ({ ...avant, ...nouveaux }));
    setChoisis(suite);
  }, [preparation]);

  if (!journee) return null;

  const ajouter = () => {
    modifier(() => {
      for (const competition of avecCalendrier) {
        const matchs = M.calendrierDe(competition.id).filter((m) => choisis.has(m.id))
          .sort((a, b) => (temps(a.date) - temps(b.date)) || (a.domicile < b.domicile ? -1 : a.domicile > b.domicile ? 1 : 0));
        if (!matchs.length) continue;
        ajouterALaGrille(matchs, competition, journee, reglages().margeCotes);
      }
    });
    onFermer();
  };

  const basculer = (id, oui) => setChoisis((avant) => {
    const suite = new Set(avant);
    if (oui) suite.add(id);
    else suite.delete(id);
    return suite;
  });

  return html`<${Feuille} titre="Matchs du calendrier" large onFermer=${onFermer}
    droite=${{ libelle: `Ajouter (${choisis.size})`, onClick: ajouter, desactive: choisis.size === 0 }}>
    ${avecCalendrier.length === 0 && html`<${Section}>
      <${Vide} icone="calendar" titre="Aucun calendrier"
        texte="Importez le calendrier de votre division, une fois pour toute la saison : le PDF de votre district ou de votre ligue.">
        <${Bouton} variante="principal" onClick=${() => setImporter(true)}>Importer un calendrier…<//>
      <//>
    <//>`}
    ${avecCalendrier.map((competition) => {
      const journees = journeesDe(competition);
      const numero = numeros[competition.id] ?? journees[0]?.numero ?? 1;
      const courante = journees.find((j) => j.numero === numero);
      return html`<${Section} key=${competition.id} titre=${competition.nom}>
        <${Choix} libelle="Journée" valeur=${numero}
          options=${journees.map((j) => ({ valeur: j.numero, libelle: j.intitule + (j.restants.length ? '' : ' ✓') }))}
          onChange=${(n) => {
            setNumeros((avant) => ({ ...avant, [competition.id]: n }));
            setChoisis((avant) => cocher(competition, n, avant));
          }} />
        ${(courante?.matchs ?? []).map((m) => html`<${Interrupteur} key=${m.id} libelle=${M.intituleCalendrier(m)}
          aide=${m.ajoute ? 'Déjà dans une grille' : null} valeur=${choisis.has(m.id)} onChange=${(oui) => basculer(m.id, oui)} />`)}
      <//>`;
    })}
    ${importer && html`<${ImportCalendrierSheet} onFermer=${() => { setImporter(false); setPreparation((n) => n + 1); }} />`}
  <//>`;
}

// MARK: - Style propre à ces écrans

injecterStyle('style-calendrier-vues', `
.cal-inactif > .liste { opacity: 0.45; }
.cal-trois-lignes { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.cal-deux-lignes { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 15px; }
.cal-depot { min-height: 100%; }
`);

/** Une feuille de style propre au module, posée une seule fois. */
function injecterStyle(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}
