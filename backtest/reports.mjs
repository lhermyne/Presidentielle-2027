// Vérifie la matrice des reports de voix : sur les seconds tours 2017 et 2022 à partir des résultats officiels
// du premier tour, puis sur les duels sondés de la campagne en cours.
// Usage : node backtest/reports.mjs
import { readFile } from 'node:fs/promises';
import { POLITICAL_BLOCS, forecast, allConfigurations } from '../model/forecast.mjs';
import { transferScore } from '../model/transfers.mjs';

const root = new URL('../', import.meta.url);

// Résultats officiels du premier tour (Conseil constitutionnel) et camp de chaque candidat.
const PAST = [
  {
    year: 2022, finalists: ['Macron', 'Le Pen'], result: 58.55,
    scores: { Macron: 27.85, 'Le Pen': 23.15, Mélenchon: 21.95, Zemmour: 7.07, Pécresse: 4.78, Jadot: 4.63, Lassalle: 3.13, Roussel: 2.28, 'Dupont-Aignan': 2.06, Hidalgo: 1.75, Poutou: 0.77, Arthaud: 0.56 },
    blocs: { Macron: 'centre', 'Le Pen': 'extreme-droite', Mélenchon: 'extreme-gauche', Zemmour: 'extreme-droite', Pécresse: 'droite', Jadot: 'gauche', Lassalle: 'droite', Roussel: 'gauche', 'Dupont-Aignan': 'droite', Hidalgo: 'gauche', Poutou: 'extreme-gauche', Arthaud: 'extreme-gauche' },
  },
  {
    year: 2017, finalists: ['Macron', 'Le Pen'], result: 66.10,
    scores: { Macron: 24.01, 'Le Pen': 21.30, Fillon: 20.01, Mélenchon: 19.58, Hamon: 6.36, 'Dupont-Aignan': 4.70, Lassalle: 1.21, Poutou: 1.09, Asselineau: 0.92, Arthaud: 0.64, Cheminade: 0.18 },
    blocs: { Macron: 'centre', 'Le Pen': 'extreme-droite', Fillon: 'droite', Mélenchon: 'extreme-gauche', Hamon: 'gauche', 'Dupont-Aignan': 'droite', Lassalle: 'droite', Poutou: 'extreme-gauche', Asselineau: 'droite', Arthaud: 'extreme-gauche', Cheminade: 'droite' },
  },
];

const format = value => value.toFixed(1).padStart(5);

console.log('== Seconds tours passés, reconstitués depuis le premier tour');
for (const election of PAST) {
  const [first, second] = election.finalists;
  const estimate = transferScore(first, second, election.scores, id => election.blocs[id]);
  console.log(`${election.year} ${first} face à ${second} : estimé ${format(estimate)} · réel ${format(election.result)} · écart ${format(estimate - election.result)}`);
}

const data = JSON.parse(await readFile(new URL('data/latest.json', root), 'utf8'));
const party = Object.fromEntries(data.candidates.map(candidate => [candidate.id, candidate.party]));
const blocOf = id => POLITICAL_BLOCS[party[id]] ?? id;
const result = forecast(data, allConfigurations(data)[0].id, { weights: { polls: 100, polymarket: 0, barometer: 0, wikipedia: 0, trends: 0 } });
const scores = Object.fromEntries(result.rows.map(row => [row.id, row.pollScore]));

console.log('\n== Duels sondés en 2026 : reports de voix face aux sondages du duel');
const errors = [];
for (const duel of result.polledDuels) {
  const [first, second] = duel.estimate.candidateIds;
  const estimate = transferScore(first, second, scores, blocOf);
  if (estimate === null) {
    console.log(`${duel.key} : aucun report mesuré pour ce type de duel`);
    continue;
  }
  const polled = duel.estimate.scores[first];
  errors.push(estimate - polled);
  console.log(`${duel.key.padEnd(40)} reports ${format(estimate)} · sondages ${format(polled)} (${duel.estimate.pollCount} enquêtes) · écart ${format(estimate - polled)}`);
}
const rms = Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length);
console.log(`\nÉcart quadratique moyen sur ${errors.length} duels : ${rms.toFixed(2)} points`);
