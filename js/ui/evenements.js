// De petits messages entre écrans (les Notification.Name du code Swift) :
//   « nouveauPari » { journeeId?, joueurId? } : ouvre la prise de pari ;
//   « nouveauJoueur » : ouvre la fiche d'un nouveau joueur ;
//   « calendrierRecu » { poules } : un PDF de calendrier lu pendant qu'« Importer un calendrier » est ouvert.

const ecouteurs = new Map();

export function ecouter(nom, fn) {
  if (!ecouteurs.has(nom)) ecouteurs.set(nom, new Set());
  ecouteurs.get(nom).add(fn);
  return () => ecouteurs.get(nom)?.delete(fn);
}

export function emettre(nom, donnees) {
  for (const fn of [...(ecouteurs.get(nom) ?? [])]) fn(donnees);
}
