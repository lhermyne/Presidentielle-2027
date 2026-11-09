// Reports de voix au second tour, par camp. Chaque ligne donne, pour 100 électeurs d'un camp éliminé,
// combien votent pour chaque finaliste ; le reste s'abstient ou vote blanc.
// Mesures : enquêtes Ipsos du jour du vote (présidentielles 2017 et 2022, législatives 2024).
// Détail et liens : data/historique/SOURCES.md. Vérification : node backtest/reports.mjs

// Un finaliste garde presque tous ses électeurs : 98 % et 91 % en 2022 (Ipsos), 98 % et 93 % en 2017 (Harris).
export const LOYALTY = Object.freeze({ own: 95, rival: 2 });

// Électeurs d'un candidat éliminé du même camp qu'un finaliste : Zemmour vers Le Pen en 2022 (73 / 10).
export const SAME_BLOC = Object.freeze({ own: 73, rival: 10 });

const row = (first, second, source) => Object.freeze({ shares: [first, second], source });

// Clé : les deux camps finalistes dans l'ordre alphabétique. Valeurs : [vers le premier, vers le second].
export const TRANSFER_TABLES = Object.freeze({
  'centre|extreme-droite': {
    'extreme-gauche': row(47, 12, 'Mélenchon vers Macron et Le Pen : 52 / 7 en 2017, 42 / 17 en 2022'),
    gauche: row(69, 4, 'Hamon 71 / 2 (2017), Jadot 65 / 6 (2022), gauche vers Ensemble 72 / 3 (2024)'),
    droite: row(51, 21, 'Fillon 48 / 20 (2017), Pécresse 53 / 18 (2022), LR vers Ensemble 53 / 25 (2024)'),
  },
  'droite|extreme-droite': {
    'extreme-gauche': row(70, 2, 'Gauche vers LR face au RN : 70 / 2 (2024)'),
    gauche: row(70, 2, 'Gauche vers LR face au RN : 70 / 2 (2024)'),
    centre: row(79, 4, 'Ensemble vers LR face au RN : 79 / 4 (2024)'),
  },
  'extreme-droite|gauche': {
    centre: row(15, 54, 'Ensemble face à un duel RN et gauche hors LFI : 15 / 54 (2024)'),
    droite: row(34, 29, 'LR face à un duel RN et gauche hors LFI : 34 / 29 (2024)'),
    // Non mesuré séparément (la gauche était unie en 2024) : valeur calée sur les sondages 2026 du duel.
    'extreme-gauche': row(5, 38, 'Calé sur les sondages 2026 de Le Pen face à Glucksmann et Hollande'),
  },
  'extreme-droite|extreme-gauche': {
    centre: row(19, 43, 'Ensemble face à un duel RN et LFI : 19 / 43 (2024)'),
    droite: row(38, 26, 'LR face à un duel RN et LFI : 38 / 26 (2024)'),
    // Jamais mesuré : hypothèse, le report du centre vers LFI en 2024. Le duel Le Pen et Mélenchon est sondé.
    gauche: row(5, 43, 'Hypothèse : comme le centre vers LFI face au RN (2024)'),
  },
});

const pairKey = (first, second) => [first, second].sort().join('|');

function sharesToward(voterBloc, finalistBloc, rivalBloc) {
  if (voterBloc === finalistBloc && voterBloc !== rivalBloc) return SAME_BLOC.own;
  if (voterBloc === rivalBloc && voterBloc !== finalistBloc) return SAME_BLOC.rival;
  const table = TRANSFER_TABLES[pairKey(finalistBloc, rivalBloc)]?.[voterBloc];
  if (!table) return null;
  const finalistIsFirst = [finalistBloc, rivalBloc].sort()[0] === finalistBloc;
  return table.shares[finalistIsFirst ? 0 : 1];
}

export function hasTransferTable(firstBloc, secondBloc) {
  return firstBloc !== secondBloc && pairKey(firstBloc, secondBloc) in TRANSFER_TABLES;
}

// Score du premier finaliste, en % des suffrages exprimés, d'après les scores du premier tour.
// Renvoie null si les deux finalistes sont du même camp ou si aucun report n'est mesuré pour ce duel.
export function transferScore(first, second, scores, blocOf) {
  const blocs = [blocOf(first), blocOf(second)];
  if (!hasTransferTable(...blocs)) return null;
  let towardFirst = 0;
  let towardSecond = 0;
  for (const [id, score] of Object.entries(scores)) {
    if (id === first) {
      towardFirst += score * LOYALTY.own;
      towardSecond += score * LOYALTY.rival;
    } else if (id === second) {
      towardSecond += score * LOYALTY.own;
      towardFirst += score * LOYALTY.rival;
    } else {
      const bloc = blocOf(id);
      // Un camp sans report mesuré pour ce duel est laissé de côté : ni abstention ni vote inventés.
      towardFirst += score * (sharesToward(bloc, blocs[0], blocs[1]) ?? 0);
      towardSecond += score * (sharesToward(bloc, blocs[1], blocs[0]) ?? 0);
    }
  }
  const expressed = towardFirst + towardSecond;
  return expressed > 0 ? 100 * towardFirst / expressed : null;
}
