// Niveau de soutien de chaque candidat à des dates passées de la campagne en cours, d'après les seuls
// sondages connus à chaque date. Sert de référence pour tester le baromètre et Wikipédia.
// Usage : node backtest/soutiens.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fitSupport } from '../model/forecast.mjs';

const STEP_DAYS = 7;
const HALF_LIFE = 14;
const DAY = 86400000;
const root = new URL('../', import.meta.url);

const data = JSON.parse(await readFile(new URL('data/latest.json', root), 'utf8'));
const firstField = data.polls.map(poll => poll.fieldEnd).sort()[0];

function supportAt(day) {
  const known = { ...data, asOf: day, polls: data.polls.filter(poll => poll.fieldEnd <= day) };
  const fit = fitSupport(known, day, HALF_LIFE);
  if (!fit || fit.pollCount < 4) return null;
  const total = Object.values(fit.support).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(fit.support).map(([id, value]) => [id, 100 * value / total]));
}

const series = {};
for (let time = Date.parse(firstField) + 30 * DAY; time <= Date.parse(data.asOf); time += STEP_DAYS * DAY) {
  const day = new Date(time).toISOString().slice(0, 10);
  const support = supportAt(day);
  if (support) series[day] = support;
}

await writeFile(new URL('data/historique/soutiens-2026.json', root), `${JSON.stringify(series)}\n`);
console.log(`${Object.keys(series).length} dates, du ${Object.keys(series)[0]} au ${Object.keys(series).at(-1)}`);
