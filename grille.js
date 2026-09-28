/* Bob 1N2 — le jeu à distance, côté joueur.
 *
 * Même format que l'app (Sources/Core/GrilleADistance.swift) : du JSON en base64 URL,
 * compressé (DEFLATE brut) et préfixé « z », ou tel quel et préfixé « j ».
 * Tout se passe après le « # » de l'adresse, que le navigateur n'envoie pas au site :
 * la grille ne quitte le téléphone que par le lien que le joueur choisit d'envoyer.
 */
(function (racine) {
  'use strict';

  var VERSION = 1;

  // ---- Codage -------------------------------------------------------------

  function versBase64URL(octets) {
    var binaire = '';
    for (var i = 0; i < octets.length; i += 0x8000) {
      binaire += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    }
    return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function depuisBase64URL(texte) {
    var base64 = texte.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    var binaire = atob(base64);
    var octets = new Uint8Array(binaire.length);
    for (var i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets;
  }

  async function transformer(octets, flux) {
    var sortie = new Blob([octets]).stream().pipeThrough(flux);
    return new Uint8Array(await new Response(sortie).arrayBuffer());
  }

  async function coder(valeur) {
    var json = new TextEncoder().encode(JSON.stringify(valeur));
    if (typeof CompressionStream === 'function') {
      try {
        var compresse = await transformer(json, new CompressionStream('deflate-raw'));
        if (compresse.length < json.length) return 'z' + versBase64URL(compresse);
      } catch (e) { /* envoyé sans compression */ }
    }
    return 'j' + versBase64URL(json);
  }

  /** Erreurs : « illisible », « navigateur » (trop ancien pour décompresser), « version ». */
  async function decoder(code) {
    var prefixe = code.charAt(0);
    var octets;
    try {
      octets = depuisBase64URL(code.slice(1));
    } catch (e) {
      throw new Error('illisible');
    }
    if (prefixe === 'z') {
      if (typeof DecompressionStream !== 'function') throw new Error('navigateur');
      try {
        octets = await transformer(octets, new DecompressionStream('deflate-raw'));
      } catch (e) {
        throw new Error('illisible');
      }
    } else if (prefixe !== 'j') {
      throw new Error('illisible');
    }
    var valeur;
    try {
      valeur = JSON.parse(new TextDecoder().decode(octets));
    } catch (e) {
      throw new Error('illisible');
    }
    if (!valeur || typeof valeur !== 'object') throw new Error('illisible');
    if (valeur.v > VERSION) throw new Error('version');
    return valeur;
  }

  /** Le code après le « # » d'une adresse (ou le texte entier). */
  function codeDe(adresse) {
    var diese = adresse.indexOf('#');
    var code = diese >= 0 ? adresse.slice(diese + 1) : adresse;
    try { code = decodeURIComponent(code); } catch (e) { /* laissé tel quel */ }
    return code.trim();
  }

  /** Le lien envoyé à un joueur : la grille, puis « . » et son nom et numéro (GrilleADistance.lien(_:pour:)). */
  function morceaux(adresse) {
    var code = codeDe(adresse);
    var point = code.indexOf('.');
    return point < 0 ? { grille: code, invite: '' } : { grille: code.slice(0, point), invite: code.slice(point + 1) };
  }

  // ---- Calculs (Sources/Core/Calcul.swift) ------------------------------------

  var SYSTEME_MIN = 3;
  var SYSTEME_MAX = 8;

  function arrondi(x) { return Math.round(x * 100) / 100; }

  function combinaisons(n, k) {
    if (n < 0 || k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    var resultat = 1;
    for (var i = 0; i < k; i++) resultat = resultat * (n - i) / (i + 1);
    return Math.round(resultat);
  }

  function sousEnsembles(n, k) {
    var resultat = [];
    var courant = [];
    function explorer(debut) {
      if (courant.length === k) { resultat.push(courant.slice()); return; }
      for (var i = debut; i < n && n - i >= k - courant.length; i++) {
        courant.push(i);
        explorer(i + 1);
        courant.pop();
      }
    }
    if (k > 0 && k <= n) explorer(0);
    return resultat;
  }

  function tailles(niveaux) {
    return Array.from(new Set(niveaux)).sort(function (a, b) { return a - b; });
  }

  /** `niveaux` null : un combiné. */
  function nombreDeCombinaisons(n, niveaux) {
    if (!niveaux) return n > 0 ? 1 : 0;
    return tailles(niveaux).reduce(function (total, k) { return total + combinaisons(n, k); }, 0);
  }

  /** « Multi 5 », « Goliath », « Système 2, 3 sur 5 ». */
  function nomSysteme(n, niveaux) {
    var liste = tailles(niveaux);
    var complet = n >= 3 && liste.length === n - 1 && liste.every(function (k, i) { return k === i + 2; });
    if (complet) return n === 8 ? 'Goliath' : 'Multi ' + n;
    return 'Système ' + liste.join(', ') + ' sur ' + n;
  }

  /** Cote totale et gain maximal, tous les matchs encore à jouer. */
  function evaluer(cotes, niveaux, mise) {
    var n = cotes.length;
    var combos = [];
    if (n > 0) {
      if (!niveaux) combos = [cotes.map(function (_, i) { return i; })];
      else tailles(niveaux).forEach(function (k) { combos = combos.concat(sousEnsembles(n, k)); });
    }
    var coteTotale = 0;
    combos.forEach(function (combo) {
      coteTotale += combo.reduce(function (produit, i) { return produit * cotes[i]; }, 1);
    });
    return { combinaisons: combos.length, coteTotale: coteTotale, gainMaximum: arrondi(coteTotale * mise) };
  }

  // ---- Retour au bar ------------------------------------------------------------

  /** Un SMS déjà adressé : « ?& » passe sur iPhone comme sur Android. */
  function lienSMS(telephone, texte) {
    var numero = String(telephone || '').replace(/[^\d+]/g, '');
    return 'sms:' + numero + '?&body=' + encodeURIComponent(texte);
  }

  /** WhatsApp veut le numéro international sans « + » : un 06… est pris pour un numéro français. */
  function numeroWhatsApp(telephone) {
    var numero = String(telephone || '').replace(/[^\d+]/g, '');
    if (numero.charAt(0) === '+') return numero.slice(1).replace(/\D/g, '');
    if (numero.slice(0, 2) === '00') return numero.slice(2);
    if (/^0\d{9}$/.test(numero)) return '33' + numero.slice(1);
    return numero;
  }

  function lienWhatsApp(telephone, texte) {
    return 'https://wa.me/' + numeroWhatsApp(telephone) + '?text=' + encodeURIComponent(texte);
  }

  // ---- Divers -----------------------------------------------------------------

  /** Sans 0, O, 1 ni l, comme les références de l'app. */
  function identifiant(longueur) {
    var alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
    var hasard = new Uint8Array(longueur || 8);
    crypto.getRandomValues(hasard);
    return Array.prototype.map.call(hasard, function (x) { return alphabet[x % alphabet.length]; }).join('');
  }

  var nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  var cote = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function enPoints(x) { return nombre.format(x) + (Math.abs(x) <= 1 ? ' pt' : ' pts'); }
  function enCote(x) { return cote.format(x); }

  /** « samedi 3 octobre 2026 » depuis « 2026-10-03 ». */
  function jour(iso) {
    var morceaux = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!morceaux) return '';
    var date = new Date(+morceaux[1], +morceaux[2] - 1, +morceaux[3]);
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  racine.CodeGrille = {
    VERSION: VERSION, SYSTEME_MIN: SYSTEME_MIN, SYSTEME_MAX: SYSTEME_MAX,
    coder: coder, decoder: decoder, codeDe: codeDe, morceaux: morceaux,
    arrondi: arrondi, combinaisons: combinaisons, nombreDeCombinaisons: nombreDeCombinaisons,
    nomSysteme: nomSysteme, evaluer: evaluer,
    lienSMS: lienSMS, numeroWhatsApp: numeroWhatsApp, lienWhatsApp: lienWhatsApp,
    identifiant: identifiant, enPoints: enPoints, enCote: enCote, jour: jour
  };
})(typeof window !== 'undefined' ? window : globalThis);
