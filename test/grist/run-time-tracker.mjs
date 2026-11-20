// Essai dans un vrai Grist (grist-static), à la vraie souris, avec le labo de lombre33/grist-widget-GFS.
// Copier ce fichier dans prototype/labo/ de ce dépôt-là, puis :
//   npm install && REPO_DIR=<chemin de ce dépôt> node lab-server.mjs &  puis  node run-time-tracker.mjs
// Le document du labo est d'abord mis dans la forme de la gestion client (CLIENTS, MISSIONS, DEVIS, Table1, Time_tracking avec A, B, C).
import { startLab } from './lab-setup.mjs';

const WIDGET = 'http://127.0.0.1:8911/index.html';
const lab = await startLab({ widget: WIDGET, lang: 'fr', colorScheme: process.env.LAB_SCHEME || 'light' });
const { page } = lab;
await page.setViewportSize({ width: 1500, height: 1000 });
const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/inline style/.test(m.text())) erreurs.push(m.text()); });
const f = () => page.frames().find((x) => x.url().startsWith(WIDGET) && !x.isDetached());
let ok = true;
const check = (nom, cond, info) => { console.log(cond ? 'OK   ' : 'ÉCHEC', nom, cond ? '' : JSON.stringify(info)); if (!cond) ok = false; };

// ----- Le document de gestion client, tel que le décrit son code Python.
await page.waitForTimeout(2000);
await f().evaluate(async () => {
  const col = (id, type, formula) => (formula ? { id, type, isFormula: true, formula } : { id, type, isFormula: false });
  await grist.docApi.applyUserActions([
    ['RenameTable', 'Clients', 'CLIENTS'],
    ['AddTable', 'MISSIONS', [col('numero', 'Text'), col('date', 'DateTime:Europe/Paris'), col('Client', 'Ref:CLIENTS')]],
    ['AddTable', 'Table1', [col('Missions_EN', 'Text'), col('Missions', 'Text'), col('heures', 'Numeric')]],
    ['AddTable', 'DEVIS', [col('Mission', 'Ref:MISSIONS'), col('prestations', 'Ref:Table1'), col('Lots', 'Choice'), col('heure_reelle', 'Numeric'),
      col('Heures_retenues', 'Numeric', 'rec.heure_reelle or rec.prestations.heures'), col('Prix', 'Numeric', '$Heures_retenues * 100'),
      col('retour_user', 'Numeric', '$Prix * .2'), col('retour_finaux', 'Numeric', '$Prix * .1'), col('Imprevu_buffer', 'Numeric', '$Prix * .1')]],
    ['AddTable', 'Time_tracking', [col('A', 'Any', 'None'), col('B', 'Any', 'None'), col('C', 'Any', 'None')]],
  ]);
  const clients = await grist.docApi.fetchTable('CLIENTS');
  await grist.docApi.applyUserActions([
    ['AddRecord', 'MISSIONS', null, { numero: 'M-2026-01', date: 1790000000, Client: clients.id[0] }],
    ['AddRecord', 'MISSIONS', null, { numero: 'N-01', date: 1780000000, Client: clients.id[1] }],
    ['AddRecord', 'Table1', null, { Missions: 'Ateliers', heures: 14 }],
    ['AddRecord', 'Table1', null, { Missions: 'Écrans', heures: 0.0005 }],
    ['AddRecord', 'DEVIS', null, { Mission: 1, prestations: 1, Lots: 'Cadrage' }],
    ['AddRecord', 'DEVIS', null, { Mission: 1, prestations: 2, Lots: 'Maquettes' }],
  ]);
});
await f().evaluate(() => location.reload());
await f().waitForSelector('text=Préparer Time_tracking', { timeout: 30000 });
await lab.shotPanel('tt', '1-preparation', f());
await f().getByRole('button', { name: 'Préparer Time_tracking' }).click();
await f().locator('.puce').first().waitFor({ timeout: 20000 });
const cols = await f().evaluate(async () => Object.keys(await grist.docApi.fetchTable('Time_tracking')));
check('Time_tracking garde A, B, C et reçoit ses colonnes', ['A', 'B', 'C', 'Devis', 'Phase', 'Mission', 'Prestation', 'Debut', 'Fin', 'Note', 'Session', 'Duree_min'].every((c) => cols.includes(c)), cols);
check('une prestation par ligne de devis', (await f().locator('.puce').count()) === 2, await f().locator('.puce').count());
const cadrage = await f().locator('.lot', { hasText: 'Ateliers' }).innerText();
check('toutes phases : 14 h × 1,4 = 2,8 j, lu dans les formules de DEVIS', /2,8 j vendus/.test(cadrage), cadrage);
const choix = await f().evaluate(async () => {
  const c = await grist.docApi.fetchTable('_grist_Tables_column');
  return c.widgetOptions[c.colId.indexOf('Phase')];
});
check('la colonne Phase est un choix avec les quatre phases', /Dev initial.*Retour user.*Retours finaux.*Imprévu/.test(choix), choix);

const clientsTxt = await f().evaluate(async () => (await grist.docApi.fetchTable('CLIENTS')).Nom);
await f().locator('#client').selectOption({ label: clientsTxt[1] });
await page.waitForTimeout(500);
check('changer de client montre sa mission, même sans devis', /Aucune prestation pour cette mission/.test(await f().locator('.minuteur').innerText())
  && (await f().locator('.choix-seul').innerText()) === 'N-01');
await f().locator('#client').selectOption({ label: clientsTxt[0] });
await page.waitForTimeout(500);

// ----- Le chrono.
await f().locator('.puce', { hasText: 'Ateliers' }).click();
await f().getByRole('button', { name: 'Démarrer' }).click();
await page.waitForTimeout(1500);
await f().locator('#note').fill('Atelier de cadrage');
await f().locator('#note').press('Tab');
await page.waitForTimeout(3000);
await f().locator('.puce', { hasText: 'Écrans' }).click();
await page.waitForTimeout(3000);
await f().getByRole('group', { name: 'Phase', exact: true }).getByRole('button', { name: 'Retour user' }).click();
await page.waitForTimeout(3000);
await lab.shotPanel('tt', '2-en-cours', f());
const pendant = await f().evaluate(async () => grist.docApi.fetchTable('Time_tracking'));
check('trois segments (prestation puis phase), devis et phase écrits, mission et prestation par formule', pendant.id.length === 3
  && pendant.Devis.join() === '1,2,2' && pendant.Phase.join() === 'Dev initial,Dev initial,Retour user'
  && pendant.Mission.every((m) => m === 1) && pendant.Prestation.join() === '1,2,2' && pendant.Fin[0] && pendant.Fin[1] && !pendant.Fin[2] && pendant.Note[0] === 'Atelier de cadrage', pendant);
check('la formule Duree_min de Grist calcule le premier segment', pendant.Duree_min[0] > 0, pendant.Duree_min);
await f().evaluate(() => location.reload());
await page.waitForTimeout(4000);
check('après rechargement, le chrono tourne toujours', /Arrêter/.test(await f().locator('.bouton-principal').innerText()));
await f().getByRole('button', { name: 'Arrêter et enregistrer' }).click();
await page.waitForTimeout(2000);
check('la prestation de 0,0005 h est en dépassement', (await f().locator('.lot', { hasText: 'Écrans' }).getAttribute('data-etat')) === 'depasse');

// ----- Saisie à la main d'un oubli, la veille, puis correction.
await f().getByRole('button', { name: 'Jour précédent' }).click();
await f().getByRole('button', { name: 'Ajouter un temps' }).click();
await f().locator('#s-lot').selectOption({ label: 'Ateliers · Cadrage' }).catch(async () => f().locator('#s-lot').selectOption({ index: 1 }));
await f().locator('#s-debut').fill('09:00');
await f().locator('#s-fin').fill('10:30');
await f().locator('#s-note').fill('Oubli du chrono');
await lab.shotPanel('tt', '3-saisie', f());
await f().getByRole('button', { name: 'Enregistrer' }).click();
await page.waitForTimeout(2000);
let t = await f().evaluate(async () => grist.docApi.fetchTable('Time_tracking'));
const i = t.Note.indexOf('Oubli du chrono');
check('le temps oublié est écrit, 90 min selon la formule de Grist', i >= 0 && Math.round(t.Duree_min[i]) === 90, t);
await f().getByRole('button', { name: /^Modifier / }).first().click();
await f().locator('#s-fin').fill('11:00');
await f().getByRole('button', { name: 'Enregistrer' }).click();
await page.waitForTimeout(2000);
t = await f().evaluate(async () => grist.docApi.fetchTable('Time_tracking'));
check('la correction passe : 120 min', Math.round(t.Duree_min[t.Note.indexOf('Oubli du chrono')]) === 120, t.Duree_min);
await lab.shotPanel('tt', '4-hier', f());
await f().getByRole('button', { name: 'Ajouter un temps' }).click();
await f().locator('#s-duree').fill('0,25');
await f().locator('#s-note').fill('Appel rapide');
await lab.shotPanel('tt', '5-duree', f());
await f().getByRole('button', { name: 'Enregistrer' }).click();
await page.waitForTimeout(2000);
t = await f().evaluate(async () => grist.docApi.fetchTable('Time_tracking'));
check('saisie par la seule durée : 0,25 h = 15 min selon Grist', Math.round(t.Duree_min[t.Note.indexOf('Appel rapide')]) === 15, t.Duree_min);
await f().getByRole('button', { name: 'Ajouter un temps' }).click();
await f().locator('#s-duree').fill('-0,25');
await f().locator('#s-note').fill('Retrait');
await f().getByRole('button', { name: 'Enregistrer' }).click();
await page.waitForTimeout(2000);
t = await f().evaluate(async () => grist.docApi.fetchTable('Time_tracking'));
check('correction : -0,25 h = -15 min selon Grist', Math.round(t.Duree_min[t.Note.indexOf('Retrait')]) === -15, t.Duree_min);
await f().locator('.barre-zone').first().hover();
await lab.shotPanel('tt', '6-survol', f());
check('aucune erreur de console', erreurs.length === 0, erreurs);
console.log(ok ? 'TOUT OK' : 'ÉCHECS');
await lab.browser.close();
process.exit(ok ? 0 : 1);
