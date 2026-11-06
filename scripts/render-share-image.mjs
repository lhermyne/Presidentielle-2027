// Photographie la carte de partage du site construit pour produire dist/og.png, l'aperçu des liens.
// Chrome est préinstallé sur les machines GitHub Actions ; CHROME_BIN permet d'en choisir un autre.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const DIST = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const OUTPUT = join(DIST, 'og.png');
const CHROME = process.env.CHROME_BIN ?? 'google-chrome';
const CARD_ROUTE = '/#/carte-partage';
const RENDER_BUDGET_MS = 15000;
const OUTPUT_TIMEOUT_MS = 60000;
const OUTPUT_POLL_MS = 500;
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function startServer() {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^[/\\]+/, '');
    try {
      const body = await readFile(join(DIST, relative));
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(relative)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise(resolvePromise => server.listen(0, '127.0.0.1', () => resolvePromise(server)));
}

function screenshot(url, profile) {
  const args = [
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1200,630',
    `--virtual-time-budget=${RENDER_BUDGET_MS}`,
    `--screenshot=${OUTPUT}`,
    url,
  ];
  return new Promise((resolvePromise, reject) => {
    const chrome = spawn(CHROME, args, { stdio: 'inherit' });
    chrome.on('error', reject);
    chrome.on('exit', code => (code === 0 ? resolvePromise() : reject(new Error(`Chrome a échoué (code ${code}).`))));
  });
}

// Certains navigateurs rendent la main avant d'avoir écrit l'image : on attend le fichier.
async function waitForOutput() {
  const deadline = Date.now() + OUTPUT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const file = await stat(OUTPUT).catch(() => null);
    if (file?.size > 0) return;
    await wait(OUTPUT_POLL_MS);
  }
  throw new Error('L’image n’a pas été produite.');
}

await rm(OUTPUT, { force: true });
const server = await startServer();
const profile = await mkdtemp(join(tmpdir(), 'lhermyne-carte-'));
try {
  await screenshot(`http://127.0.0.1:${server.address().port}${CARD_ROUTE}`, profile);
  await waitForOutput();
  console.log(`Aperçu de lien généré : ${OUTPUT}`);
} finally {
  server.close();
  server.closeAllConnections();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
