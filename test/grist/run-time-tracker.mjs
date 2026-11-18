// Essai dans un vrai Grist (grist-static), à la vraie souris, avec le labo de lombre33/grist-widget-GFS.
// Copier ce fichier dans prototype/labo/ de ce dépôt, puis :
//   npm install && REPO_DIR=<chemin de ce dépôt> node lab-server.mjs &  puis  node run-time-tracker.mjs
// Le document du labo a déjà une table Clients (Nom, Ville) : le widget la réutilise, comme il le ferait chez toi.
import { startLab } from './lab-setup.mjs';

const WIDGET = 'http://127.0.0.1:8911/index.html';
const lab = await startLab({ widget: WIDGET, lang: 'fr', colorScheme: process.env.LAB_SCHEME || 'light' });
const { page } = lab;
await page.setViewportSize({ width: 1500, height: 1000 });
const out = (...a) => console.log(...a);
const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
const f = () => page.frames().find((x) => x.url().startsWith(WIDGET) && !x.isDetached());
let ok = true;
const check = (nom, cond, info) => { out(cond ? 'OK   ' : 'ÉCHEC', nom, cond ? '' : JSON.stringify(info)); if (!cond) ok = false; };

await f().waitForSelector('text=Créer les tables', { timeout: 30000 });
await f().evaluate(() => document.addEventListener('securitypolicyviolation', (e) => console.error('VIOL', e.violatedDirective, e.sourceFile, e.lineNumber, e.columnNumber, e.sample)));
await lab.shotPanel('tt', '1-installation', f());
await f().getByRole('button', { name: 'Créer les tables' }).click();
await f().waitForSelector('text=Nouveau lot', { timeout: 20000 });
const tables = await f().evaluate(() => grist.docApi.listTables());
check('les quatre tables sont créées sous leur nom', ['Clients', 'Projets', 'Lots', 'Temps'].every((t) => tables.includes(t)), tables);

for (const [c, p, l, j] of [['Atelier Mira', 'Refonte site', 'Cadrage', '2'], ['Atelier Mira', 'Refonte site', 'Maquettes', '0,0001']]) {
  if (!(await f().locator('details.nouveau-lot[open]').count())) await f().getByText('Nouveau lot').click();
  await f().getByLabel('Client').fill(c);
  await f().getByLabel('Projet').fill(p);
  await f().getByLabel('Lot ou phase').fill(l);
  await f().getByLabel('Jours vendus').fill(j);
  await f().getByRole('button', { name: 'Ajouter le lot' }).click();
  await page.waitForTimeout(1500);
}
const clients = await f().evaluate(async () => (await grist.docApi.fetchTable('Clients')).id.length);
check('un seul client ajouté, réutilisé (le document du labo en a déjà deux)', clients === 3, clients);

await f().locator('.puce', { hasText: 'Cadrage' }).click();
await f().getByRole('button', { name: 'Démarrer' }).click();
await page.waitForTimeout(1500);
await f().locator('#note').fill('Atelier de cadrage');
await f().locator('#note').press('Tab');
await page.waitForTimeout(3000);
await f().locator('.puce', { hasText: 'Maquettes' }).click();
await page.waitForTimeout(6000);
await lab.shotPanel('tt', '2-en-cours', f());

const pendant = await f().evaluate(async () => grist.docApi.fetchTable('Temps'));
check('deux segments, le premier fermé avec sa note, même session', pendant.id.length === 2 && pendant.Fin[0] && !pendant.Fin[1]
  && pendant.Note[0] === 'Atelier de cadrage' && pendant.Session[0] === pendant.Session[1], pendant);
check('la formule Duree_min de Grist calcule le premier segment', pendant.Duree_min[0] > 0 && pendant.Duree_min[1] === 0, pendant.Duree_min);

// Recharger le widget : le chrono doit reprendre depuis Grist.
await f().evaluate(() => location.reload());
await page.waitForTimeout(4000);
const repris = await f().locator('.bouton-principal').innerText();
check('après rechargement, le chrono tourne toujours', /Arrêter/.test(repris), repris);

await f().getByRole('button', { name: 'Arrêter et enregistrer' }).click();
await page.waitForTimeout(2000);
const lots = await f().evaluate(async () => grist.docApi.fetchTable('Lots'));
const temps = await f().evaluate(async () => grist.docApi.fetchTable('Temps'));
out('Lots', JSON.stringify(lots));
check('tous les segments sont fermés', temps.Fin.every(Boolean), temps.Fin);
check('formules des lots : réel, client, projet', lots.Reel_min.every((x) => x > 0) && lots.Client_nom[0] === 'Atelier Mira' && lots.Projet_nom[1] === 'Refonte site', lots);
const statut = await f().locator('.lot', { hasText: 'Maquettes' }).getAttribute('data-etat');
check('le lot de 0,0001 j est en dépassement', statut === 'depasse', statut);
await lab.shotPanel('tt', '3-arrete', f());
await page.setViewportSize({ width: 820, height: 1400 });
await page.waitForTimeout(800);
await lab.shotPanel('tt', '4-etroit', f());
check('aucune erreur de console', erreurs.length === 0, erreurs);
out(ok ? 'TOUT OK' : 'ÉCHECS');
await lab.browser.close();
process.exit(ok ? 0 : 1);
