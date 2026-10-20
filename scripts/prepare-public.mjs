import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const destination = new URL('../front-end/public/data/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const filename of ['latest.json', 'forecast.json']) {
  await copyFile(new URL(`../data/${filename}`, import.meta.url), new URL(filename, destination));
}
const data = JSON.parse(await readFile(new URL('latest.json', destination), 'utf8'));
if (data.schemaVersion !== 1 || !data.polls?.length) throw new Error('Dataset is missing or invalid.');
await writeFile(new URL('../front-end/public/.nojekyll', import.meta.url), '');
console.log(`Données publiques préparées : ${data.asOf}`);
