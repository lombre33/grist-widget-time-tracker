// Parcours complet dans Chromium avec le faux Grist : préparation de Time_tracking, prestations des devis, chrono,
// changement de prestation, arrêt, puis saisie, correction et suppression d'un temps à la main.
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

test('parcours du chrono', { skip: !playwright && 'Playwright absent', timeout: 120000 }, async () => {
  const s = await serveur();
  const nav = await playwright.chromium.launch();
  try {
    await parcours(nav, s);
  } finally {
    await nav.close();
    s.close();
  }
});

async function parcours(nav, s) {
  const page = await nav.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(8000);
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('https://docs.getgrist.com/**', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('https://fonts.**', (r) => r.fulfill({ body: '' }));
  await page.addInitScript({ path: path.join(racine, 'test/navigateur/faux-grist.js') });
  await page.goto(`http://localhost:${s.address().port}/index.html`);

  await page.getByRole('button', { name: 'Préparer Time_tracking' }).click();
  await page.locator('.puce').first().waitFor();
  const cols = await page.evaluate(() => window.__fauxGrist.tables);
  assert.equal(await page.locator('.puce').count(), 2, 'une prestation par ligne de devis');
  assert.match(await page.locator('.lot', { hasText: 'Écrans' }).innerText(), /3 j vendus/, '21 h = 3 j');
  assert.equal(cols.Time_tracking.length, 0);

  await page.locator('.puce', { hasText: 'Ateliers' }).click();
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await page.locator('#note').fill('Atelier de cadrage');
  await page.locator('#note').press('Enter');
  await page.locator('#note').blur();
  await page.waitForTimeout(1200);
  await page.locator('.puce', { hasText: 'Écrans' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(racine, 'test/navigateur/ordinateur.png') });

  const temps = await page.evaluate(() => window.__fauxGrist.tables.Time_tracking);
  assert.equal(temps.length, 2);
  assert.deepEqual([temps[0].Devis, temps[1].Devis, temps[0].Mission, temps[1].Prestation], [1, 2, 1, 2]);
  assert.ok(temps[0].Fin, 'le premier segment est fermé');
  assert.equal(temps[0].Note, 'Atelier de cadrage');
  assert.equal(temps[1].Session, temps[0].Session);
  assert.equal(await page.locator('.segments li').count(), 2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(racine, 'test/navigateur/telephone.png'), fullPage: true });

  await page.getByRole('button', { name: 'Arrêter et enregistrer' }).click();
  await page.waitForTimeout(300);
  const fin = await page.evaluate(() => window.__fauxGrist.tables.Time_tracking.every((r) => r.Fin));
  assert.ok(fin, 'tous les segments sont fermés');

  // Saisie à la main : un oubli d'hier, puis correction et suppression.
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.getByRole('button', { name: 'Jour précédent' }).click();
  await page.getByRole('button', { name: 'Ajouter un temps' }).click();
  await page.getByLabel('Prestation', { exact: true }).selectOption({ label: 'Ateliers · Atelier Mira · M-2026-01 · Cadrage' });
  await page.getByLabel('Début').fill('09:00');
  await page.getByLabel('Fin', { exact: true }).fill('10:30');
  await page.locator('#s-note').fill('Oubli du chrono');
  await page.screenshot({ path: path.join(racine, 'test/navigateur/saisie.png') });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForTimeout(300);
  let lignes = await page.evaluate(() => window.__fauxGrist.tables.Time_tracking);
  const oubli = lignes.find((r) => r.Note === 'Oubli du chrono');
  assert.ok(oubli && oubli.Fin - oubli.Debut === 5400, 'une heure et demie la veille');
  assert.ok(Date.now() / 1000 - oubli.Debut > 12 * 3600);
  assert.match(await page.locator('.entrees').innerText(), /1 h 30/);

  await page.getByRole('button', { name: /^Modifier Ateliers/ }).click();
  await page.getByLabel('Fin', { exact: true }).fill('11:00');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForTimeout(300);
  lignes = await page.evaluate(() => window.__fauxGrist.tables.Time_tracking);
  assert.equal(lignes.find((r) => r.id === oubli.id).Fin - oubli.Debut, 7200, 'fin corrigée');

  await page.getByRole('button', { name: /^Modifier Ateliers/ }).click();
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await page.waitForTimeout(300);
  lignes = await page.evaluate(() => window.__fauxGrist.tables.Time_tracking);
  assert.ok(!lignes.some((r) => r.id === oubli.id), 'ligne supprimée après confirmation');

  // Refus lisible : fin vide alors qu'aucun chrono ne tourne est permis, mais pas sans prestation.
  await page.getByRole('button', { name: 'Ajouter un temps' }).click();
  await page.getByLabel('Prestation', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  assert.match(await page.getByRole('alert').innerText(), /Choisis une prestation/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.deepEqual(erreurs, []);
}
