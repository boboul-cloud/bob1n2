// Ce que la version web demande au système : SMS, WhatsApp, choix d'un contact, partage, copie,
// fichiers. Remplace Systeme.swift (MFMessageComposeViewController, CNContactPicker…).
//
// Une page web ne peut pas enchaîner seule plusieurs écrans « Nouveau message » : l'écran qui
// envoie plusieurs messages montre un bouton par message, que l'utilisateur touche l'un après l'autre.

/** iPhone ou iPad (iPadOS se présente comme un Mac : on regarde l'écran tactile). */
export function estIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function estAppareilMobile() {
  return estIOS() || /Android/i.test(navigator.userAgent);
}

/**
 * Le lien qui ouvre « Nouveau message » avec ses destinataires et son texte. Sur iPhone, plusieurs
 * destinataires passent par `sms://open?addresses=…` ; ailleurs, séparés par des virgules.
 */
export function lienSMS(destinataires, texte) {
  const numeros = destinataires.filter(Boolean);
  const corps = encodeURIComponent(texte ?? '');
  if (estIOS()) {
    if (numeros.length > 1) return `sms://open?addresses=${numeros.join(',')}&body=${corps}`;
    return `sms:${numeros[0] ?? ''}&body=${corps}`;
  }
  return `sms:${numeros.join(',')}?body=${corps}`;
}

/** Ouvre « Nouveau message » : l'utilisateur vérifie et touche « Envoyer » lui-même. */
export function ouvrirSMS(destinataires, texte) {
  location.href = lienSMS(destinataires, texte);
}

/** WhatsApp, vers un numéro (au format international si possible) ou sans destinataire. */
export function lienWhatsApp(numero, texte) {
  let n = String(numero ?? '').replace(/[^+0-9]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0') && n.length === 10) n = '33' + n.slice(1);
  const corps = encodeURIComponent(texte ?? '');
  return n ? `https://wa.me/${n}?text=${corps}` : `https://wa.me/?text=${corps}`;
}

/** Le sélecteur de contacts du système existe (Chrome sur Android) ; ailleurs, on tape le numéro. */
export function contactsDisponibles() {
  return 'contacts' in navigator && 'ContactsManager' in window;
}

/** Choisir un contact : rend { prenom, nom, telephone } ou `null`. */
export async function choisirContact() {
  if (!contactsDisponibles()) return null;
  try {
    const [contact] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
    if (!contact) return null;
    const complet = (contact.name?.[0] ?? '').trim();
    const morceaux = complet.split(/\s+/);
    const prenom = morceaux.length > 1 ? morceaux.slice(0, -1).join(' ') : complet;
    const nom = morceaux.length > 1 ? morceaux[morceaux.length - 1] : '';
    return { prenom, nom, telephone: contact.tel?.[0] ?? '' };
  } catch {
    return null;
  }
}

/** Copie un texte ; rend `true` si c'est fait. */
export async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.append(zone);
    zone.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    zone.remove();
    return ok;
  }
}

/** Lit le presse-papiers (« Coller ») ; rend `null` si le navigateur refuse. */
export async function lirePressePapiers() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** La feuille de partage du système (navigator.share) ; sinon le texte est copié. Rend
 *  « partage », « copie » ou `null` si l'utilisateur annule. */
export async function partager({ titre, texte, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title: titre, text: texte, url });
      return 'partage';
    } catch (erreur) {
      if (erreur?.name === 'AbortError') return null;
    }
  }
  return (await copier([texte, url].filter(Boolean).join('\n'))) ? 'copie' : null;
}

/** Ouvre un lien dans un autre onglet (site d'une compétition, recherche du calendrier). */
export function ouvrirLien(url) {
  window.open(url, '_blank', 'noopener');
}

/** Fait choisir un fichier à l'utilisateur ; rend le `File` ou `null`. accept : « application/pdf »… */
export function choisirFichier(accept) {
  return new Promise((resoudre) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = accept;
    champ.style.display = 'none';
    champ.addEventListener('change', () => {
      resoudre(champ.files?.[0] ?? null);
      champ.remove();
    });
    champ.addEventListener('cancel', () => { resoudre(null); champ.remove(); });
    document.body.append(champ);
    champ.click();
  });
}

/** Propose un fichier à enregistrer (sauvegarde, PDF). Sur iPhone et iPad, par la feuille de partage
 *  (« Enregistrer dans Fichiers ») : dans une app de l'écran d'accueil, un téléchargement ne mène nulle part. */
export async function telecharger(nomFichier, contenu, type = 'application/json') {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  if (estIOS() && navigator.canShare) {
    const fichier = new File([blob], nomFichier, { type: blob.type || type });
    if (navigator.canShare({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier] });
        return;
      } catch (erreur) {
        if (erreur?.name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
