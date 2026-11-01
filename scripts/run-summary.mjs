import { readFile } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/latest.json', import.meta.url), 'utf8'));
const result = JSON.parse(await readFile(new URL('../data/forecast.json', import.meta.url), 'utf8'));
console.log(`# Actualisation du ${data.asOf}\n\n${result.baseline.pollCount} enquêtes compatibles, ${result.settings.simulations} simulations.\n\n| Source | Statut | Dernier succès |\n|---|---|---|`);
for (const source of data.sources) console.log(`| ${source.title} | ${source.status} | ${source.fetchedAt ?? 'Aucun'} |`);
console.log('\n## Influence des sources\n\n| Source | Curseur | Part retenue après disponibilité |\n|---|---|---|');
for (const [id, source] of Object.entries(result.sourceMix)) console.log(`| ${id} | ${source.requested} | ${source.effective.toFixed(2)} % |`);
console.log(`\nBaromètre : équivalent ×${result.adjustmentLimits.barometerScale.toFixed(2)}, dynamique depuis le terrain du ${result.sourceMix.barometer.anchor ?? 'non disponible'}.\n\nPolymarket : ${result.marketFusion.active ? 'repondération active' : 'pas de repondération exploitable'} ; ${result.marketFusion.compared.length} gagnants comparés. Wikipédia : ${Object.keys(data.wikipedia?.momentum ?? {}).length} série(s) exploitable(s). Google Trends : ${Object.keys(data.trends?.interest ?? {}).length} candidat(s) identifié(s) dans le flux public.`);
console.log('\nModèle expérimental. La calibration historique reste à réaliser.');
