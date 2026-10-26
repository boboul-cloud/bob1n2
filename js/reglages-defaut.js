// Les réglages d'une base neuve : ceux du classeur (porte-feuilles de 20 points, rajout de
// 20 points) ; voir Reglages.swift. Fichier à part pour que store.js n'importe rien d'autre.

export const REGLAGES_PAR_DEFAUT = {
  /** Titre affiché en tête de l'accueil et des documents imprimés. */
  titreJeu: '',
  pointsDepart: 20,
  rechargeParDefaut: 20,
  miseParDefaut: 5,
  /** Consommations offertes : tant de points pour 1 € de consommation. */
  pointsParEuro: 10,
  /** Marge prise sur les cotes proposées (0,30 = 30 %). */
  margeCotes: 0.30,
  /** Site où l'on consulte les résultats : un simple lien ouvert dans le navigateur. */
  siteResultats: '',
  /** Points de fidélité : chaque consommation payée hors paris rapporte des points. */
  fideliteActive: true,
  fideliteDepense: 1,
  fidelitePoints: 1,
  fideliteParTranche: false,
  /** Le téléphone du bar : les joueurs qui jouent à distance y renvoient leur grille. */
  telephoneBar: '',
  /** Le code est aussi demandé pour enregistrer un pari au comptoir. */
  codePourLesParis: true,
  /** Le district ou la ligue des compétitions (« Finistère ») : pour chercher son calendrier. */
  districtCalendrier: '',
  /** Code demandé pour les opérations du barman. Vide : rien n'est demandé. */
  codeBarman: '',
  /** Version web : identifiant de la clé d'accès (Face ID, Touch ID…) qui permet d'effacer un
   *  code oublié, s'il en a été créé une. */
  cleCodeOublie: '',
};
