// Parcours complet dans Chromium avec le faux Grist : installation, lots, chrono, changement de lot, arrêt.
// Lancer : npm run test:navigateur (il faut Playwright ; l'essai est sauté sans lui).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

import { createRequire } from 'node:module';

let playwright = null;
try { playwright = createRequire(import.meta.url)('playwright'); } catch { /* sauté */ }

function serveur() {
  const s = http.createServer(async (req, res) => {
    try {
      const p = path.join(racine, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      res.writeHead(200, { 'content-type': types[path.extname(p)] || 'text/plain' });
      res.end(await readFile(p.endsWith('/') ? path.join(p, 'index.html') : p));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => s.listen(0, () => ok(s)));
}

test('parcours du chrono', { skip: !playwright && 'Playwright absent' }, async () => {
  const s = await serveur();
  const nav = await playwright.chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1200, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('https://docs.getgrist.com/**', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('https://fonts.**', (r) => r.fulfill({ body: '' }));
  await page.addInitScript({ path: path.join(racine, 'test/navigateur/faux-grist.js') });
  await page.goto(`http://localhost:${s.address().port}/index.html`);

  await page.getByRole('button', { name: 'Créer les tables' }).click();
  await page.getByText('Nouveau lot').click();
  for (const [c, p, l, j] of [['Atelier Mira', 'Refonte site', 'Cadrage', '2'], ['Atelier Mira', 'Refonte site', 'Maquettes', '4']]) {
    await page.getByLabel('Client').fill(c);
    await page.getByLabel('Projet').fill(p);
    await page.getByLabel('Lot ou phase').fill(l);
    await page.getByLabel('Jours vendus').fill(j);
    await page.getByRole('button', { name: 'Ajouter le lot' }).click();
    await page.getByText('Nouveau lot').click();
  }
  const clients = await page.evaluate(() => window.__fauxGrist.tables.Clients.length);
  assert.equal(clients, 1, 'le client existant est réutilisé');

  await page.locator('.puce', { hasText: 'Cadrage' }).click();
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await page.locator('#note').fill('Atelier de cadrage');
  await page.locator('#note').press('Enter');
  await page.locator('#note').blur();
  await page.waitForTimeout(1200);
  await page.locator('.puce', { hasText: 'Maquettes' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(racine, 'test/navigateur/ordinateur.png') });

  const temps = await page.evaluate(() => window.__fauxGrist.tables.Temps);
  assert.equal(temps.length, 2);
  assert.ok(temps[0].Fin, 'le premier segment est fermé');
  assert.equal(temps[0].Note, 'Atelier de cadrage');
  assert.equal(temps[1].Session, temps[0].Session);
  assert.equal(await page.locator('.segments li').count(), 2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(racine, 'test/navigateur/telephone.png'), fullPage: true });

  await page.getByRole('button', { name: 'Arrêter et enregistrer' }).click();
  await page.waitForTimeout(300);
  const fin = await page.evaluate(() => window.__fauxGrist.tables.Temps.every((r) => r.Fin));
  assert.ok(fin, 'tous les segments sont fermés');
  assert.deepEqual(erreurs, []);
  await nav.close();
  s.close();
});
