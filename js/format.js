// Formats d'affichage, en français : repris de Format.swift.

const LOCALE = 'fr-FR';

/** Arrondi au centième : évite les 19,999999 que produisait le classeur. */
export function arrondi(x) {
  return Math.round(x * 100) / 100;
}

const formatNombre = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const formatCote = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** « 12,5 » : jusqu'à deux décimales. */
export function nombre(x) {
  return formatNombre.format(Object.is(x, -0) ? 0 : x);
}

/** « 12,5 pts », « 1 pt », « 0,5 pt » */
export function enPoints(x) {
  return `${nombre(x)} ${Math.abs(x) <= 1 ? 'pt' : 'pts'}`;
}

/** « +12,5 pts » ou « −4 pts » pour l'historique. */
export function enPointsSignes(x) {
  const signe = x > 0 ? '+' : (x < 0 ? '−' : '');
  return `${signe}${enPoints(Math.abs(x))}`;
}

/** « 6 € », « 12,50 € » : sans décimales quand le montant est rond. */
export function enEuros(x) {
  const rond = Math.round(x * 100) === Math.round(x) * 100;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: rond ? 0 : 2, maximumFractionDigits: rond ? 0 : 2,
  }).format(x);
}

/** « 3,90 » : les cotes gardent toujours deux décimales. */
export function enCote(x) {
  return formatCote.format(x);
}

/** Un nombre tapé à la française ou à l'anglaise (« 2,5 », « 2.5 ») ; `null` s'il n'en est pas un. */
export function lireNombre(texte) {
  if (typeof texte === 'number') return Number.isFinite(texte) ? texte : null;
  const t = String(texte ?? '').trim().replace(/\s| | /g, '').replace(',', '.');
  if (t === '' || !/^[-+]?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// MARK: - Dates

/** Une date stockée (texte ISO) ou un objet Date, toujours rendu en Date. */
export function enDate(valeur) {
  if (valeur instanceof Date) return valeur;
  if (valeur == null) return null;
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(options) {
  const f = new Intl.DateTimeFormat(LOCALE, options);
  return (d) => {
    const date = enDate(d);
    return date ? f.format(date) : '';
  };
}

/** « dimanche 4 octobre 2026 » */
export const jour = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
/** « 4 oct. 2026 » */
export const court = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
/** « 4 oct., 18:30 » */
export const heure = fmt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** « octobre 2026 » */
export const mois = fmt({ month: 'long', year: 'numeric' });

/** « Concours de septembre 2026 », « Concours d'octobre 2026 » : élidé devant une voyelle. */
export function titreDeConcours(d) {
  const m = mois(d);
  const voyelle = /^[aeiouyàâéèêîôûAEIOUYÉ]/.test(m);
  return voyelle ? `Concours d'${m}` : `Concours de ${m}`;
}

/** « 2026-10-04 » pour un champ <input type="date">, à l'heure locale. */
export function versChampDate(d) {
  const date = enDate(d) ?? new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Ce que rend un champ date, à midi (comme les dates du calendrier), en texte ISO. */
export function depuisChampDate(texte) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte ?? '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).toISOString();
}

// MARK: - Textes

/** Un numéro de téléphone pour un SMS : chiffres et « + » seulement (sans le « (0) » de
 *  « +33 (0)6… »), ou `null` s'il est trop court pour en être un. */
export function numeroSMS(texte) {
  const garde = String(texte ?? '').replaceAll('(0)', '').replace(/[^+0-9]/g, '');
  return garde.replace(/\D/g, '').length >= 6 ? garde : null;
}

/** Sans casse ni accents, espaces ramenées à une seule : retrouve une équipe d'un tableau à l'autre. */
export function cle(texte) {
  return String(texte ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/).filter(Boolean).join(' ');
}

/** Comparaison « naturelle » des noms (« Joueur 2 » avant « Joueur 10 »), comme localizedStandardCompare. */
const comparateur = new Intl.Collator(LOCALE, { numeric: true, sensitivity: 'base' });
export function comparerNoms(a, b) {
  return comparateur.compare(a ?? '', b ?? '');
}

/** « 3 matchs », « 1 match » */
export function compte(n, singulier, pluriel) {
  return `${n} ${n > 1 ? (pluriel ?? `${singulier}s`) : singulier}`;
}

/** Échappe un texte pour du HTML écrit à la main (pages imprimées, pages du joueur). */
export function echapper(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
