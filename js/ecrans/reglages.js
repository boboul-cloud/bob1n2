// Les réglages du jeu : repris de ReglagesView.swift. Tout s'enregistre aussitôt, sans bouton de
// validation (`modifier(e => { e.reglages.x = … })`).
//
// Ce que le web change :
// - « Code oublié ? » : l'app iPhone demandait Face ID, Touch ID ou le code de l'appareil
//   (LocalAuthentication). Ici, une clé d'accès du navigateur (WebAuthn) est proposée quand on
//   enregistre le code ; « Code oublié ? » la demande, et l'appareil vérifie son propriétaire
//   (Face ID, Touch ID ou empreinte). Sans clé, le code ne s'efface qu'en effaçant les données.
// - « Sauvegarde » : les données vivent dans ce navigateur ; un fichier .json les garde à l'abri et
//   permet de passer à un autre appareil.
// - « À propos » : le site, l'assistance, la confidentialité et les conditions sont des pages
//   rangées avec l'app.

import { html, useState } from '../../vendor/preact-htm.js';
import {
  useEtat, modifier, modeDemo, stockageIndisponible, exporter, importer, toutEffacer,
} from '../store.js';
import * as Exemple from '../exemple.js';
import {
  reglages, codeActif, coutConsommation, pointsFidelite, regleFidelite, urlSiteResultats, titreAffiche,
} from '../reglages.js';
import { compte, enPoints, heure, versChampDate } from '../format.js';
import { Site } from '../site.js';
import {
  Ecran, Section, Ligne, LigneValeur, ChampTexte, ChampNombre, Interrupteur, Icone, Encadre,
} from '../ui/composants.js';
import { alerte, annoncer, choisir, confirmer, demanderCode } from '../ui/dialogues.js';
import { choisirFichier, telecharger } from '../ui/systeme.js';
import { fr } from './joueur-actions.js';

const pourcent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

// MARK: - Clé d'accès (code oublié)

/** Octets → texte base64url (l'identifiant de la clé, gardé dans les réglages). */
export function versBase64url(tampon) {
  const octets = tampon instanceof Uint8Array ? tampon : new Uint8Array(tampon);
  let texte = '';
  for (const o of octets) texte += String.fromCharCode(o);
  return btoa(texte).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Texte base64url → octets. */
export function depuisBase64url(texte) {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texte.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** L'appareil sait vérifier son propriétaire (Face ID, Touch ID, empreinte, code de session…). */
export async function cleDAccesPossible() {
  try {
    return !!(globalThis.PublicKeyCredential && globalThis.isSecureContext
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** Crée la clé d'accès du code barman sur cet appareil ; rend son identifiant (base64url). Toujours
 *  le même « utilisateur » : une nouvelle clé remplace l'ancienne dans le trousseau de l'appareil. */
async function creerCle() {
  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { id: location.hostname, name: 'Bob 1N2' },
      user: {
        id: new TextEncoder().encode('bob1n2-code-barman'),
        name: 'Code barman',
        displayName: `Code barman · ${titreAffiche()}`,
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred',
      },
      attestation: 'none',
      timeout: 120000,
    },
  });
  return credential ? versBase64url(credential.rawId) : null;
}

/** Demande la clé d'accès : rend `true` si l'appareil a vérifié son propriétaire. Il n'y a pas de
 *  serveur pour contrôler la signature : comme Face ID dans l'app iPhone, c'est la vérification faite
 *  par l'appareil (drapeau « utilisateur vérifié ») qui compte. */
async function verifierCle(id) {
  const reponse = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: depuisBase64url(id) }],
      userVerification: 'required',
      timeout: 120000,
    },
  });
  const donnees = new Uint8Array(reponse?.response?.authenticatorData ?? new ArrayBuffer(0));
  return donnees.length > 32 && (donnees[32] & 0x04) !== 0;
}

// MARK: - Sauvegarde

/** Ce que contient un fichier de sauvegarde, pour la confirmation ; `null` s'il n'en est pas un. */
export function apercuSauvegarde(texte) {
  try {
    const lu = JSON.parse(texte);
    const donnees = lu?.donnees ?? lu;
    if (!donnees || !Array.isArray(donnees.joueurs) || !Array.isArray(donnees.journees)) return null;
    return { joueurs: donnees.joueurs.length, journees: donnees.journees.length, date: lu?.exporte ?? null };
  } catch {
    return null;
  }
}

export function nomSauvegarde(date = new Date()) {
  return `Bob 1N2 – sauvegarde ${versChampDate(date)}.json`;
}

// MARK: - Écran

export function ReglagesView() {
  useEtat();
  const r = reglages();
  const [codeDeverrouille, setCodeDeverrouille] = useState(false);
  const [nouveauCode, setNouveauCode] = useState('');
  const [, rafraichir] = useState(0);

  const regler = (cle) => (valeur) => modifier((e) => { e.reglages[cle] = valeur; });

  // MARK: Code barman

  const modifierCode = async () => {
    if (!(await demanderCode('Code actuel'))) return;
    setNouveauCode(reglages().codeBarman);
    setCodeDeverrouille(true);
  };

  const enregistrerCode = async () => {
    const code = nouveauCode;
    modifier((e) => { e.reglages.codeBarman = code; });
    setCodeDeverrouille(false);
    if (!code || modeDemo || !(await cleDAccesPossible())) return;
    const existe = !!reglages().cleCodeOublie;
    const ok = await confirmer({
      titre: "Clé d'accès",
      message: fr(existe
        ? "Une clé d'accès permet déjà de choisir un nouveau code s'il est oublié. En créer une nouvelle sur cet appareil ?"
        : "Créer une clé d'accès sur cet appareil ? Si le code est oublié, Face ID, Touch ID ou empreinte prouveront que vous en êtes le propriétaire, et vous pourrez choisir un nouveau code."),
      bouton: 'Créer la clé',
      annuler: existe ? 'Garder la clé' : 'Plus tard',
    });
    if (!ok) return;
    try {
      const id = await creerCle();
      if (!id) return;
      modifier((e) => { e.reglages.cleCodeOublie = id; });
      annoncer("Clé d'accès créée");
    } catch (erreur) {
      if (!['NotAllowedError', 'AbortError'].includes(erreur?.name)) {
        alerte("Clé d'accès", `La clé n'a pas pu être créée : ${erreur?.message ?? erreur}`);
      }
    }
  };

  /** Le propriétaire de l'appareil (Face ID, Touch ID ou empreinte) peut choisir un nouveau code
   *  barman sans connaître l'ancien : un code oublié ne bloque jamais le jeu. Tant que le nouveau
   *  n'est pas enregistré, l'ancien reste valable. */
  const codeOublie = async () => {
    if (modeDemo) {
      alerte('Code barman', "Démonstration : rien n'est enregistré. Rechargez la page pour retrouver la démonstration sans code.");
      return;
    }
    const id = reglages().cleCodeOublie;
    if (id && globalThis.PublicKeyCredential && navigator.credentials) {
      try {
        if (await verifierCle(id)) {
          setNouveauCode('');
          setCodeDeverrouille(true);
          return;
        }
      } catch { /* annulé, ou clé absente de cet appareil */ }
      await sansCle("La clé d'accès n'a pas été reconnue sur cet appareil : impossible de vérifier que vous en êtes le propriétaire.");
      return;
    }
    await sansCle("Aucune clé d'accès (Face ID, Touch ID ou empreinte) n'a été créée sur cet appareil pour le code barman : impossible de vérifier que vous en êtes le propriétaire.");
  };

  const sansCle = async (constat) => {
    const choix = await choisir({
      titre: 'Code oublié',
      message: fr(`${constat}\n\nLe code ne peut alors être effacé qu'en effaçant toutes les données (« Tout effacer », confirmé deux fois) ; vous pourrez ensuite restaurer une sauvegarde, qui remet le code qu'elle contient.`),
      boutons: [{ libelle: 'Tout effacer…', valeur: 'effacer', destructif: true }],
      annuler: 'Fermer',
    });
    // Le code est oublié : l'effacement ne le demande pas, seulement les deux confirmations.
    if (choix === 'effacer') await effacerTout({ avecCode: false });
  };

  const parisSansCode = async (oui) => {
    if (oui) {
      modifier((e) => { e.reglages.codePourLesParis = true; });
      return;
    }
    // Laisser parier sans code : décidé par le barman, pas par un joueur.
    if (await demanderCode('Laisser parier sans code')) {
      modifier((e) => { e.reglages.codePourLesParis = false; });
    } else {
      rafraichir((n) => n + 1); // l'interrupteur revient à sa place
    }
  };

  // MARK: Données

  const chargerExemple = () => {
    const ajoute = modifier(() => Exemple.charger());
    const message = ajoute.journee && ajoute.championnat
      ? 'La grille du classeur est dans Journées, les équipes de R3 et leurs rangs dans Compétitions.'
      : ajoute.journee
        ? 'La grille du classeur est dans Journées. La compétition R3 était déjà là.'
        : ajoute.championnat
          ? 'Les équipes de R3 et leurs rangs sont dans Compétitions. La grille du classeur était déjà là.'
          : "L'exemple est déjà dans l'app : rien n'a été ajouté.";
    alerte('Exemple chargé', fr(message));
  };

  // MARK: Sauvegarde

  const enregistrerSauvegarde = () => {
    telecharger(nomSauvegarde(), exporter());
  };

  const restaurer = async () => {
    const fichier = await choisirFichier('.json,application/json');
    if (!fichier) return;
    let texte;
    try {
      texte = await fichier.text();
    } catch {
      alerte('Restauration impossible', 'Le fichier ne peut pas être lu.');
      return;
    }
    const apercu = apercuSauvegarde(texte);
    if (!apercu) {
      alerte('Restauration impossible', "Ce fichier n'est pas une sauvegarde de Bob 1N2.");
      return;
    }
    const quand = apercu.date ? ` (enregistrée le ${heure(apercu.date)})` : '';
    const ok = await confirmer({
      titre: 'Restaurer la sauvegarde ?',
      message: fr(`« ${fichier.name} »${quand} : ${compte(apercu.joueurs, 'joueur')} et ${compte(apercu.journees, 'journée')}. Toutes les données de cet appareil seront remplacées par les siennes, réglages et code barman compris.`),
      bouton: 'Restaurer',
      destructif: true,
    });
    if (!ok || !(await demanderCode('Restaurer une sauvegarde'))) return;
    try {
      importer(texte);
      setCodeDeverrouille(false);
      setNouveauCode('');
      annoncer('Sauvegarde restaurée');
    } catch (erreur) {
      alerte('Restauration impossible', erreur?.message ?? String(erreur));
    }
  };

  const effacerTout = async ({ avecCode = true } = {}) => {
    const premier = await confirmer({
      titre: 'Tout effacer ?',
      message: fr("Joueurs, porte-feuilles, journées, paris, compétitions, palmarès, grilles reçues et réglages, code barman compris, seront effacés de ce navigateur. Enregistrez d'abord une sauvegarde pour pouvoir les retrouver."),
      bouton: 'Tout effacer',
      destructif: true,
    });
    if (!premier) return;
    const second = await confirmer({
      titre: 'Vraiment tout effacer ?',
      message: 'Sans sauvegarde, rien ne pourra être récupéré.',
      bouton: 'Effacer définitivement',
      destructif: true,
    });
    if (!second) return;
    if (avecCode && !(await demanderCode('Tout effacer'))) return;
    toutEffacer();
    setCodeDeverrouille(false);
    setNouveauCode('');
    annoncer('Toutes les données ont été effacées');
  };

  // MARK: Rendu

  const fideliteExemple = `Chaque consommation payée hors paris rapporte des points (bouton « Achat »), qui s'ajoutent au porte-feuilles. Règle : ${regleFidelite()}. Exemple : un achat de 12,50 € rapporte ${enPoints(pointsFidelite(12.5))}${r.fideliteParTranche ? ' ; le reste compte pour les achats suivants' : ''}.`;
  const site = urlSiteResultats();
  const marge = r.margeCotes;
  const changerMarge = (pas) => {
    const valeur = Math.min(0.8, Math.max(0, Math.round((marge + pas) * 100) / 100));
    modifier((e) => { e.reglages.margeCotes = valeur; });
  };

  return html`<${Ecran} titre="Réglages">
    <${Section} titre="Jeu" pied=${fr("Affiché en tête de l'accueil et des documents imprimés, par exemple le nom de votre établissement.")}>
      <${ChampTexte} libelle="Titre du jeu" placeholder="Bob 1N2" valeur=${r.titreJeu} onInput=${regler('titreJeu')} />
    <//>

    <${Section} titre="Points" pied=${fr("Les points sont virtuels : ils ne s'achètent pas dans l'app. C'est vous qui décidez comment les joueurs les obtiennent et ce qu'ils leur valent.")}>
      <${ChampNombre} libelle="Porte-feuilles de départ" valeur=${r.pointsDepart} onChange=${regler('pointsDepart')} />
      <${ChampNombre} libelle="Rajout de points proposé" valeur=${r.rechargeParDefaut} onChange=${regler('rechargeParDefaut')} />
      <${ChampNombre} libelle="Mise proposée" entier minimum=${1} valeur=${r.miseParDefaut} onChange=${regler('miseParDefaut')} />
    <//>

    <${Section} titre="Consommations offertes"
      pied=${fr(`Les consommations n'ont pas toutes le même prix : on offre au prix, à tant de points pour 1 €. Exemple : une consommation à 3,50 € coûte ${enPoints(coutConsommation(3.5))}.`)}>
      <${ChampNombre} libelle="Points pour 1 € offert" valeur=${r.pointsParEuro} onChange=${regler('pointsParEuro')} />
    <//>

    <${Section} titre="Points de fidélité" pied=${fr(r.fideliteActive ? fideliteExemple : 'Les achats au comptoir ne rapportent pas de points.')}>
      <${Interrupteur} libelle="Les achats rapportent des points" valeur=${r.fideliteActive} onChange=${regler('fideliteActive')} />
      ${r.fideliteActive && html`
        <${ChampNombre} libelle="Pour une dépense de (€)" valeur=${r.fideliteDepense} onChange=${regler('fideliteDepense')} />
        <${ChampNombre} libelle="Points gagnés" valeur=${r.fidelitePoints} onChange=${regler('fidelitePoints')} />
        <${Interrupteur} libelle="Seulement par tranche entière" valeur=${r.fideliteParTranche} onChange=${regler('fideliteParTranche')} />`}
    <//>

    <${Section} titre="Résultats et cotes" pied=${fr("Votre site de résultats, à consulter dans le navigateur : l'app n'en lit rien. Les matchs viennent du calendrier de la saison de chaque compétition, les résultats se saisissent d'un appui et les rangs les suivent. La marge règle les cotes proposées d'après le rang des équipes : plus elle est haute, plus les cotes sont basses.")}>
      <${ChampTexte} libelle="Site de résultats" placeholder="https://…" type="url" inputMode="url"
        valeur=${r.siteResultats} onInput=${regler('siteResultats')} />
      ${site && html`<${LienExterne} href=${site} icone="safari" titre="Ouvrir dans le navigateur" />`}
      <div class="champ">
        <span class="champ-libelle">Marge des cotes proposées</span>
        <span class="pas-a-pas">
          <span class="chiffres secondaire" style="min-width:48px;text-align:right">${pourcent.format(marge)}</span>
          <button type="button" aria-label="Moins" disabled=${marge <= 0} onClick=${() => changerMarge(-0.05)}><${Icone} nom="minus" taille=${16} /></button>
          <button type="button" aria-label="Plus" disabled=${marge >= 0.8} onClick=${() => changerMarge(0.05)}><${Icone} nom="plus" taille=${16} /></button>
        </span>
      </div>
    <//>

    <${Section} titre="Jeu à distance" pied=${fr("Les joueurs qui jouent depuis leur téléphone vous renvoient leur grille à ce numéro, par SMS ou WhatsApp, d'un seul geste. Il figure dans le lien de la grille envoyé aux joueurs.")}>
      <${ChampTexte} libelle="Téléphone du bar" placeholder="06 12 34 56 78" type="tel" inputMode="tel"
        valeur=${r.telephoneBar} onInput=${regler('telephoneBar')} />
    <//>

    <${Section} titre="Code barman" pied=${fr("Demandé pour les rajouts de points, les achats, les consommations, les encaissements, les remboursements, les grilles reçues à distance et les suppressions ; et pour chaque pari au comptoir, sauf si vous décochez « Aussi pour enregistrer un pari » (les joueurs parient alors seuls sur l'appareil du bar). Laissez le code vide pour ne rien demander.")}>
      ${codeActif() && !codeDeverrouille
        ? html`
          <${LigneValeur} libelle="Code barman" valeur="Activé" />
          <${Ligne} action titre="Modifier le code…" onClick=${modifierCode} />
          <${Ligne} action titre="Code oublié ?" onClick=${codeOublie} />
          <${Interrupteur} libelle="Aussi pour enregistrer un pari" valeur=${r.codePourLesParis} onChange=${parisSansCode} />`
        : html`
          <${ChampTexte} libelle="Code barman" type="password" placeholder="Aucun code" autoComplete="new-password"
            valeur=${nouveauCode} onInput=${setNouveauCode} onEntree=${enregistrerCode} />
          <${Ligne} action titre=${nouveauCode ? 'Enregistrer le code' : 'Enregistrer sans code'} onClick=${enregistrerCode} />`}
    <//>

    <${Section} titre="Données" pied=${fr("Ajoute la grille R3 / D3 / R1 de 18 matchs et les rangs des équipes de R3 des classeurs d'origine, s'ils n'y sont pas déjà. Vos données sont conservées sur cet appareil.")}>
      <${Ligne} action titre="Charger l'exemple du classeur" onClick=${chargerExemple} />
    <//>

    <${Section} titre="Sauvegarde" pied=${fr(modeDemo
      ? "Démonstration : la base est en mémoire et rien n'est enregistré, pas même une restauration ; « Tout effacer » n'est pas proposé. Une sauvegarde de la démonstration peut s'enregistrer."
      : "Les données de Bob 1N2 vivent dans ce navigateur, sur cet appareil : rien n'est envoyé ailleurs. Le navigateur peut les effacer (manque de place, nettoyage des données des sites) : une sauvegarde régulière évite de les perdre. Elle sert aussi à passer à un autre appareil : enregistrez-la ici, puis restaurez-la là-bas.")}>
      ${!modeDemo && stockageIndisponible && html`<div class="ligne"><${Encadre} icone="exclamationmark.triangle" couleur="orange">
        Ce navigateur n'enregistre pas les données (navigation privée ?) : enregistrez une sauvegarde avant de fermer la page.
      <//></div>`}
      <${Ligne} action icone="square.and.arrow.down" titre="Enregistrer une sauvegarde" onClick=${enregistrerSauvegarde} />
      <${Ligne} action icone="arrow.up.doc" titre="Restaurer une sauvegarde…" onClick=${restaurer} />
      ${!modeDemo && html`<${Ligne} destructif icone="trash" couleurIcone="var(--rouge)" titre="Tout effacer…" onClick=${() => effacerTout()} />`}
    <//>

    <${Section} titre="À propos" pied=${fr("Bob 1N2 gère des points virtuels : aucune somme d'argent ne peut y être misée, gagnée ni achetée.")}>
      <${Ligne} href="#/aide" icone="book" titre="Mode d'emploi" chevron />
      <${LienExterne} href=${Site.assistance} icone="questionmark.circle" titre="Assistance" />
      <${LienExterne} href=${Site.confidentialite} icone="hand.raised" titre="Confidentialité" />
      <${LienExterne} href=${Site.conditions} icone="doc.text" titre="Conditions d'utilisation" />
      <${LigneValeur} libelle="Version" valeur=${Site.version} />
    <//>
  <//>`;
}

/** Un lien ouvert dans un autre onglet (Link de SwiftUI) : l'app reste ouverte derrière. */
function LienExterne({ href, icone, titre }) {
  return html`<a class="ligne avec-icone" href=${href} target="_blank" rel="noopener">
    <span class="ligne-icone"><${Icone} nom=${icone} taille=${17} /></span>
    <span class="ligne-texte"><div class="ligne-titre">${titre}</div></span>
    <${Icone} nom="square.and.arrow.up" taille=${15} classe="chevron" />
  </a>`;
}
