import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hms, hm, jours, nbJours, ecart } from '../js/format.js';
import { SCHEMA, planifier, planVide, actionsDuPlan } from '../js/schema.js';
import { segmentOuvert, demarrer, changer, arreter, noter } from '../js/session.js';
import { enLignes, minuit, minutesDepuis, libelleLot, construireVue } from '../js/vue.js';
import { lireFormulaire, trouverClient, trouverProjet, creerLot } from '../js/nouveau-lot.js';

// ---------- format

test('hms', () => {
  assert.equal(hms(0), '0:00:00');
  assert.equal(hms(59.9), '0:00:59');
  assert.equal(hms(3723), '1:02:03');
  assert.equal(hms(-5), '0:00:00');
  assert.equal(hms(undefined), '0:00:00');
});

test('hm', () => {
  assert.equal(hm(45), '45 min');
  assert.equal(hm(125), '2 h 05');
  assert.equal(hm(59.6), '1 h 00');
  assert.equal(hm(-3), '0 min');
});

test('jours et nbJours', () => {
  assert.equal(jours(420), '1,0 j');
  assert.equal(jours(672), '1,6 j');
  assert.equal(jours(480, 480), '1,0 j');
  assert.equal(nbJours(4), '4 j');
  assert.equal(nbJours(2.5), '2,5 j');
  assert.equal(nbJours(null), '0 j');
});

test('ecart : heures sous un dixième de jour, jours au-delà', () => {
  assert.equal(ecart(10), '10 min');
  assert.equal(ecart(-10), '10 min');
  assert.equal(ecart(41), '41 min');
  assert.equal(ecart(42), '0,1 j');
  assert.equal(ecart(840), '2,0 j');
});

// ---------- schema

const toutExistant = () => Object.fromEntries(SCHEMA.map((d) => [d.table, ['id', ...d.cols.map((c) => c.id)]]));

test('planifier : document vide -> toutes les tables', () => {
  const plan = planifier({});
  assert.deepEqual(plan.tables, ['Clients', 'Projets', 'Lots', 'Temps']);
  assert.equal(plan.colonnes.length, 0);
  assert.equal(planVide(plan), false);
});

test('planifier : tout est là -> rien à faire', () => {
  assert.ok(planVide(planifier(toutExistant())));
});

test('planifier : colonne manquante seulement, colonnes inconnues tolérées', () => {
  const existant = toutExistant();
  existant.Lots = existant.Lots.filter((c) => c !== 'Ecart_j').concat(['Couleur']);
  const plan = planifier(existant);
  assert.deepEqual(plan.tables, []);
  assert.deepEqual(plan.colonnes.map((x) => `${x.table}.${x.col.id}`), ['Lots.Ecart_j']);
});

test('actionsDuPlan : AddTable dans l’ordre, formules marquées', () => {
  const actions = actionsDuPlan(planifier({ Clients: ['id', 'Nom'] }));
  assert.deepEqual(actions.map((a) => a[1]), ['Projets', 'Lots', 'Temps']);
  const temps = actions.find((a) => a[1] === 'Temps')[2];
  const duree = temps.find((c) => c.id === 'Duree_min');
  assert.equal(duree.isFormula, true);
  assert.match(duree.formula, /total_seconds/);
  assert.equal(temps.find((c) => c.id === 'Debut').isFormula, false);
});

test('actionsDuPlan : AddColumn pour une colonne manquante', () => {
  const existant = toutExistant();
  existant.Temps = existant.Temps.filter((c) => c !== 'Note');
  assert.deepEqual(actionsDuPlan(planifier(existant)), [
    ['AddColumn', 'Temps', 'Note', { type: 'Text', isFormula: false }],
  ]);
});

test('les références pointent vers des tables du schéma créées avant elles', () => {
  const ordre = SCHEMA.map((d) => d.table);
  SCHEMA.forEach((d, i) => d.cols.filter((c) => c.type.startsWith('Ref:')).forEach((c) => {
    const cible = c.type.slice(4);
    assert.ok(ordre.indexOf(cible) > -1 && ordre.indexOf(cible) < i, `${d.table}.${c.id}`);
  }));
});

// ---------- session

const T = 1_800_000_000;

test('segmentOuvert : le plus récent sans fin', () => {
  assert.equal(segmentOuvert([]), null);
  const temps = [
    { id: 1, Lot: 1, Debut: T, Fin: T + 60 },
    { id: 2, Lot: 2, Debut: T + 60, Fin: null },
    { id: 3, Lot: 1, Debut: T + 30, Fin: 0 },
    { id: 4, Lot: 1, Debut: null, Fin: null },
  ];
  assert.equal(segmentOuvert(temps).id, 2);
});

test('demarrer', () => {
  assert.deepEqual(demarrer(7, T + 0.5), [['AddRecord', 'Temps', null, { Lot: 7, Debut: T + 0.5, Session: T }]]);
  assert.throws(() => demarrer(null, T));
});

test('changer : ferme le segment et en ouvre un dans la même session', () => {
  const ouvert = { id: 9, Lot: 1, Debut: T, Session: T };
  assert.deepEqual(changer(ouvert, 2, T + 600), [
    ['UpdateRecord', 'Temps', 9, { Fin: T + 600 }],
    ['AddRecord', 'Temps', null, { Lot: 2, Debut: T + 600, Session: T }],
  ]);
});

test('changer : même lot ou rien d’ouvert -> rien', () => {
  assert.deepEqual(changer({ id: 9, Lot: 1, Debut: T, Session: T }, 1, T + 5), []);
  assert.deepEqual(changer(null, 1, T), []);
});

test('changer : session absente reprise du début', () => {
  const a = changer({ id: 9, Lot: 1, Debut: T + 0.7, Session: null }, 2, T + 10);
  assert.equal(a[1][3].Session, T);
});

test('arreter : fin jamais avant le début (horloge décalée)', () => {
  assert.deepEqual(arreter({ id: 3, Debut: T }, T - 5), [['UpdateRecord', 'Temps', 3, { Fin: T }]]);
  assert.deepEqual(arreter(null, T), []);
});

test('noter', () => {
  const o = { id: 3, Note: 'a' };
  assert.deepEqual(noter(o, 'a'), []);
  assert.deepEqual(noter({ id: 3 }, ''), []);
  assert.deepEqual(noter(o, 'b'), [['UpdateRecord', 'Temps', 3, { Note: 'b' }]]);
  assert.deepEqual(noter(null, 'b'), []);
});

// ---------- vue

test('enLignes', () => {
  assert.deepEqual(enLignes({ id: [1, 2], Nom: ['a', 'b'] }), [{ id: 1, Nom: 'a' }, { id: 2, Nom: 'b' }]);
  assert.deepEqual(enLignes(null), []);
});

test('minuit et minutesDepuis', () => {
  const m = minuit(T);
  assert.ok(m <= T && T - m < 86400);
  assert.equal(minutesDepuis({ Debut: m - 600, Fin: m + 600 }, m, T), 10);
  assert.equal(minutesDepuis({ Debut: m + 60, Fin: null }, m, m + 180), 2);
  assert.equal(minutesDepuis({ Debut: null }, m, T), 0);
});

test('libelleLot', () => {
  assert.equal(libelleLot({ Nom: 'Maquettes', Client_nom: 'Mira', Projet_nom: 'Site' }), 'Maquettes · Mira · Site');
  assert.equal(libelleLot({ Nom: 'Seul' }), 'Seul');
  assert.equal(libelleLot(undefined), 'Lot supprimé');
});

const LOTS = [
  { id: 1, Nom: 'Cadrage', Jours_vendus: 2, Reel_min: 420, Client_nom: 'Mira', Projet_nom: 'Site', Termine: false },
  { id: 2, Nom: 'Maquettes', Jours_vendus: 1, Reel_min: 400, Client_nom: 'Mira', Projet_nom: 'Site', Termine: false },
  { id: 3, Nom: 'Ancien', Jours_vendus: 1, Reel_min: 0, Termine: true },
];

test('construireVue : chrono arrêté, lot choisi par défaut = premier actif', () => {
  const v = construireVue({ lots: LOTS, temps: [] }, T, null);
  assert.equal(v.enCours, false);
  assert.equal(v.lotCourant, 1);
  assert.equal(v.horloge, '0:00:00');
  assert.deepEqual(v.lots.map((l) => l.id), [1, 2]);
  assert.equal(v.lots[0].reelTxt, '1,0 j');
  assert.equal(v.lots[0].base, 50);
  assert.equal(v.lots[0].etat, 'ok');
  assert.equal(v.lots[1].etat, 'attention');
  assert.equal(v.segments.length, 0);
});

test('construireVue : le segment ouvert compte en direct et provoque le dépassement', () => {
  const m = minuit(T);
  const temps = [
    { id: 10, Lot: 1, Debut: m + 3600, Fin: m + 4200, Session: m + 3600, Note: 'cadrage' },
    { id: 11, Lot: 2, Debut: m + 4200, Fin: null, Session: m + 3600 },
  ];
  const v = construireVue({ lots: LOTS, temps }, m + 4200 + 1800, 1);
  assert.equal(v.enCours, true);
  assert.equal(v.lotCourant, 2);
  assert.equal(v.horloge, '0:40:00');
  const maq = v.lots.find((l) => l.id === 2);
  assert.equal(maq.etat, 'depasse'); // 400 + 30 > 420
  assert.equal(maq.statut, 'Dépassement de 10 min');
  assert.ok(maq.base + maq.depasse > 99.9);
  assert.equal(v.segments.length, 2);
  assert.equal(v.segments[0].ouvert, true);
  assert.equal(v.segments[0].a, 'maintenant');
  assert.equal(v.segments[1].duree, '0:10:00');
  assert.equal(v.segments[1].a, 'à 0:10:00');
  assert.equal(v.jour.totalTxt, '40 min');
  assert.equal(v.entrees.length, 2);
  assert.equal(v.entrees[0].note, 'En cours');
});

test('construireVue : après arrêt, la dernière session reste visible', () => {
  const temps = [
    { id: 1, Lot: 1, Debut: T - 7200, Fin: T - 7000, Session: T - 7200 },
    { id: 2, Lot: 1, Debut: T - 600, Fin: T - 60, Session: T - 600 },
  ];
  const v = construireVue({ lots: LOTS, temps }, T, 2);
  assert.equal(v.enCours, false);
  assert.equal(v.lotCourant, 2);
  assert.equal(v.segments.length, 1);
});

test('construireVue : lot sans jours vendus', () => {
  const v = construireVue({ lots: [{ id: 5, Nom: 'X', Jours_vendus: 0, Reel_min: 30 }], temps: [] }, T, null);
  assert.equal(v.lots[0].statut, 'Aucun jour vendu');
  assert.ok(Number.isFinite(v.lots[0].base));
});

test('construireVue : aucun lot', () => {
  const v = construireVue({ lots: [], temps: [] }, T, null);
  assert.equal(v.lotCourant, null);
  assert.equal(v.libelleCourant, 'Aucun lot');
});

test('construireVue : journée complète', () => {
  const m = minuit(T);
  const v = construireVue({ lots: LOTS, temps: [{ id: 1, Lot: 1, Debut: m + 60, Fin: m + 60 + 8 * 3600 }] }, m + 9 * 3600, null);
  assert.equal(v.jour.pct, 100);
  assert.match(v.jour.message, /complète/);
});

// ---------- nouveau lot

test('lireFormulaire', () => {
  assert.ok(lireFormulaire({ client: '', projet: 'p', lot: 'l', jours: '1' }).erreur);
  assert.ok(lireFormulaire({ client: 'c', projet: 'p', lot: 'l', jours: '-1' }).erreur);
  assert.ok(lireFormulaire({ client: 'c', projet: 'p', lot: 'l', jours: 'abc' }).erreur);
  assert.deepEqual(lireFormulaire({ client: ' c ', projet: 'p', lot: 'l', jours: '2,5' }), { client: 'c', projet: 'p', lot: 'l', jours: 2.5 });
});

test('trouver client et projet sans tenir compte de la casse ni des accents', () => {
  const clients = [{ id: 1, Nom: 'Élan' }];
  assert.equal(trouverClient(clients, ' elan ').id, 1);
  assert.equal(trouverClient(clients, 'autre'), null);
  const projets = [{ id: 4, Nom: 'Site', Client: 1 }];
  assert.equal(trouverProjet(projets, 1, 'SITE').id, 4);
  assert.equal(trouverProjet(projets, 2, 'Site'), null);
});

test('creerLot : crée seulement ce qui manque', async () => {
  const appels = [];
  let n = 100;
  const appliquer = async (a) => { appels.push(a[0]); return { retValues: [++n] }; };
  const id = await creerLot({ client: 'Élan', projet: 'Neuf', lot: 'Lot A', jours: 3 },
    { clients: [{ id: 1, Nom: 'elan' }], projets: [] }, appliquer);
  assert.equal(id, 102);
  assert.deepEqual(appels, [
    ['AddRecord', 'Projets', null, { Nom: 'Neuf', Client: 1 }],
    ['AddRecord', 'Lots', null, { Nom: 'Lot A', Projet: 101, Jours_vendus: 3 }],
  ]);
});

test('creerLot : tout est nouveau', async () => {
  const appels = [];
  let n = 0;
  await creerLot({ client: 'C', projet: 'P', lot: 'L', jours: 1 }, { clients: [], projets: [] },
    async (a) => { appels.push(a[0][1]); return { retValues: [++n] }; });
  assert.deepEqual(appels, ['Clients', 'Projets', 'Lots']);
});

test('serie : jours consécutifs jusqu’à aujourd’hui ou hier', async () => {
  const { serie } = await import('../js/vue.js');
  const m = minuit(T);
  const j = (k) => ({ Debut: m - k * 86400 + 3600 });
  assert.equal(serie([], T), 0);
  assert.equal(serie([j(0), j(1), j(2), j(4)], m + 7200), 3);
  assert.equal(serie([j(1), j(2)], m + 7200), 2); // rien encore aujourd'hui : la série tient
  assert.equal(serie([j(2)], m + 7200), 0);
});
