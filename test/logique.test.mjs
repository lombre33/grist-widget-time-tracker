import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hms, hm, jours, nbJours, ecart } from '../js/format.js';
import { SOURCES, COLONNES_TEMPS, planifier, planVide, actionsDuPlan } from '../js/schema.js';
import { segmentOuvert, demarrer, changer, arreter, noter } from '../js/session.js';
import { enLignes, minuit, minutesDepuis, libelleLot, construireVue } from '../js/vue.js';
import { champsDuLot, texteChoix, tempsDuChrono, construireModele } from '../js/modele.js';
import { versChamps, depuisChamps, valeursInitiales, actionsSaisie, actionSupprimer, lireDuree, ecrireDuree, debutAuto, accorder } from '../js/saisie.js';

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

const complet = () => ({
  ...Object.fromEntries(Object.entries(SOURCES).map(([t, c]) => [t, ['id', ...c]])),
  Time_tracking: ['id', 'A', 'B', 'C', ...COLONNES_TEMPS.map((c) => c.id)],
});

test('planifier : tout est là -> rien à faire', () => {
  const plan = planifier(complet());
  assert.deepEqual(plan.manquantes, []);
  assert.ok(planVide(plan));
});

test('planifier : Time_tracking avec A, B, C seulement -> colonnes ajoutées, A B C gardées', () => {
  const ex = complet();
  ex.Time_tracking = ['id', 'A', 'B', 'C'];
  const plan = planifier(ex);
  assert.equal(plan.table, false);
  assert.deepEqual(plan.colonnes.map((c) => c.id), COLONNES_TEMPS.map((c) => c.id));
  const actions = actionsDuPlan(plan);
  assert.ok(actions.every((a) => a[0] === 'AddColumn' && a[1] === 'Time_tracking'));
  assert.deepEqual(actions.find((a) => a[2] === 'Duree_min')[3].isFormula, true);
  assert.deepEqual(actions.find((a) => a[2] === 'Devis')[3], { type: 'Ref:DEVIS', isFormula: false });
  assert.deepEqual(actions.find((a) => a[2] === 'Mission')[3], { type: 'Ref:MISSIONS', isFormula: true, formula: '$Devis.Mission' });
});

test('planifier : Time_tracking absente -> AddTable', () => {
  const ex = complet();
  delete ex.Time_tracking;
  const actions = actionsDuPlan(planifier(ex));
  assert.equal(actions.length, 1);
  assert.equal(actions[0][0], 'AddTable');
  assert.deepEqual(actions[0][2].map((c) => c.id), COLONNES_TEMPS.map((c) => c.id));
});

test('planifier : sources manquantes listées, rien créé chez elles', () => {
  const ex = complet();
  delete ex.DEVIS;
  ex.Table1 = ['id', 'Missions'];
  const plan = planifier(ex);
  assert.deepEqual(plan.manquantes, ['table DEVIS', 'colonne Table1.heures']);
});

// ---------- modèle (gestion client -> prestations)

test('champs d’une prestation et texte d’un choix', () => {
  assert.deepEqual(champsDuLot('3'), { Devis: 3 });
  assert.equal(texteChoix('A'), 'A');
  assert.equal(texteChoix(['L', 'A', 'B']), 'A, B');
  assert.equal(texteChoix(null), '');
});

test('tempsDuChrono : lignes sans devis ignorées (A, B, C)', () => {
  const t = tempsDuChrono([{ id: 1, Devis: 2, Debut: 1 }, { id: 2, Devis: 0, A: null }]);
  assert.deepEqual(t.map((r) => [r.id, r.Lot]), [[1, 2]]);
});

const SRC = {
  clients: [{ id: 1, Nom: 'Atelier Mira' }],
  missions: [{ id: 10, numero: 'M-001', date: 100, Client: 1 }, { id: 11, numero: 'M-002', date: 200, Client: 0 }],
  prestations: [{ id: 5, Missions: 'Ateliers', heures: 14 }, { id: 6, Missions: 'Écrans', heures: 7 }],
  devis: [
    { id: 1, Mission: 10, prestations: 5, Lots: 'Cadrage' },
    { id: 2, Mission: 10, prestations: 6, Lots: '' },
    { id: 3, Mission: 11, prestations: 6, Lots: ['L', 'A', 'B'] },
    { id: 4, Mission: 0, prestations: 6, Lots: 'X' },
  ],
  temps: [{ id: 1, Devis: 1, Debut: 1000, Fin: 4600, Duree_min: 60 }, { id: 2, Devis: 1, Debut: 5000, Fin: 5600, Duree_min: 10 }, { id: 3, Devis: 0 }],
};

test('construireModele : une prestation par ligne de devis, vendu = heures de la prestation', () => {
  const { lots, temps } = construireModele(SRC);
  const parId = Object.fromEntries(lots.map((l) => [l.id, l]));
  assert.deepEqual(lots.map((l) => l.id), [3, 1, 2], 'mission la plus récente d’abord, puis l’ordre du devis');
  assert.equal(parId[1].Nom, 'Ateliers');
  assert.equal(parId[1].Jours_vendus, 2);
  assert.equal(parId[1].Reel_min, 70);
  assert.equal(parId[1].Client_nom, 'Atelier Mira');
  assert.equal(parId[1].Projet_nom, 'M-001 · Cadrage');
  assert.equal(parId[2].Projet_nom, 'M-001');
  assert.equal(parId[3].Projet_nom, 'M-002 · A, B');
  assert.equal(parId[3].Client_nom, '');
  assert.equal(temps.length, 2);
});

test('construireModele : prestation absente de Table1', () => {
  const { lots } = construireModele({ ...SRC, devis: [{ id: 9, Mission: 10, prestations: 0 }], temps: [] });
  assert.deepEqual(lots.map((l) => [l.Nom, l.Jours_vendus]), [['Prestation 9', 0]]);
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
  assert.deepEqual(demarrer(7, T + 0.5), [['AddRecord', 'Time_tracking', null, { Devis: 7, Debut: T + 0.5, Session: T }]]);
  assert.throws(() => demarrer(null, T));
});

test('changer : ferme le segment et en ouvre un dans la même session', () => {
  const ouvert = { id: 9, Lot: 1, Debut: T, Session: T };
  assert.deepEqual(changer(ouvert, 2, T + 600), [
    ['UpdateRecord', 'Time_tracking', 9, { Fin: T + 600 }],
    ['AddRecord', 'Time_tracking', null, { Devis: 2, Debut: T + 600, Session: T }],
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
  assert.deepEqual(arreter({ id: 3, Debut: T }, T - 5), [['UpdateRecord', 'Time_tracking', 3, { Fin: T }]]);
  assert.deepEqual(arreter(null, T), []);
});

test('noter', () => {
  const o = { id: 3, Note: 'a' };
  assert.deepEqual(noter(o, 'a'), []);
  assert.deepEqual(noter({ id: 3 }, ''), []);
  assert.deepEqual(noter(o, 'b'), [['UpdateRecord', 'Time_tracking', 3, { Note: 'b' }]]);
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
  assert.equal(libelleLot(undefined), 'Prestation supprimée');
});

const LOTS = [
  { id: 1, Nom: 'Cadrage', Jours_vendus: 2, Reel_min: 420, Client_nom: 'Mira', Projet_nom: 'Site', Termine: false },
  { id: 2, Nom: 'Maquettes', Jours_vendus: 1, Reel_min: 400, Client_nom: 'Mira', Projet_nom: 'Site', Termine: false },
  { id: 3, Nom: 'Ancien', Jours_vendus: 1, Reel_min: 0, Termine: true },
];

test('construireVue : une mission à la fois, prestations rangées par lot', () => {
  const L = [
    { id: 1, Nom: 'A', Mission: 10, Mission_nom: 'M-1', Client_nom: 'Mira', Lot_txt: 'included', Jours_vendus: 1, Reel_min: 210 },
    { id: 2, Nom: 'B', Mission: 10, Mission_nom: 'M-1', Client_nom: 'Mira', Lot_txt: 'Options', Jours_vendus: 1, Reel_min: 0 },
    { id: 3, Nom: 'C', Mission: 20, Mission_nom: 'M-2', Client_nom: '', Lot_txt: 'included', Jours_vendus: 2, Reel_min: 0 },
  ];
  let v = construireVue({ lots: L, temps: [] }, T, 3);
  assert.deepEqual(v.missions.map((m) => [m.libelle, m.choisie]), [['Mira · M-1', false], ['M-2', true]], 'la mission de la prestation choisie');
  assert.deepEqual(v.lots.map((l) => l.id), [3]);
  assert.deepEqual(v.groupes.map((g) => g.titre), [''], 'pas de titre quand la mission n’a qu’un lot');
  v = construireVue({ lots: L, temps: [] }, T, 3, null, { mission: 10 });
  assert.deepEqual(v.groupes.map((g) => [g.titre, g.lots.map((l) => l.id)]), [['included', [1]], ['Options', [2]]]);
  assert.equal(v.missionTxt, 'Mira · M-1');
  assert.deepEqual(v.totalMission, { reelTxt: '0,5 j', venduTxt: '2 j vendus' });
  assert.equal(construireVue({ lots: L, temps: [] }, T, 3, null, { mission: 99 }).missionVue, 20, 'mission inconnue : retour à la courante');
});

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

test('construireVue : le temps en heures pour le survol des barres', () => {
  const v = construireVue({ lots: LOTS, temps: [] }, T, null);
  assert.equal(v.lots[0].infoTxt, 'Réel 7 h 00 sur 14 h 00 vendues (50 %)');
});

test('construireVue : lot sans jours vendus', () => {
  const v = construireVue({ lots: [{ id: 5, Nom: 'X', Jours_vendus: 0, Reel_min: 30 }], temps: [] }, T, null);
  assert.equal(v.lots[0].statut, 'Aucun jour vendu');
  assert.ok(Number.isFinite(v.lots[0].base));
});

test('construireVue : aucun lot', () => {
  const v = construireVue({ lots: [], temps: [] }, T, null);
  assert.equal(v.lotCourant, null);
  assert.equal(v.libelleCourant, 'Aucune prestation');
});

test('construireVue : journée complète', () => {
  const m = minuit(T);
  const v = construireVue({ lots: LOTS, temps: [{ id: 1, Lot: 1, Debut: m + 60, Fin: m + 60 + 8 * 3600 }] }, m + 9 * 3600, null);
  assert.equal(v.jour.pct, 100);
  assert.match(v.jour.message, /complète/);
});

// ---------- saisie à la main

test('versChamps et depuisChamps : aller-retour en heure locale', () => {
  const sec = new Date(2026, 10, 18, 9, 5).getTime() / 1000;
  assert.deepEqual(versChamps(sec), { date: '2026-11-18', heure: '09:05' });
  assert.equal(depuisChamps('2026-11-18', '09:05'), sec);
  assert.equal(depuisChamps('2026-11-18', ''), null);
  assert.equal(depuisChamps('18/11/2026', '09:05'), null);
  assert.deepEqual(versChamps(null), { date: '', heure: '' });
});

const S = (h, m = 0) => new Date(2026, 10, 18, h, m).getTime() / 1000;

test('valeursInitiales : ligne existante ou nouveau temps', () => {
  assert.deepEqual(valeursInitiales({ id: 4, Lot: 1, Debut: S(9), Fin: S(10, 30), Note: 'n' }, 0, null),
    { id: 4, lot: 1, date: '2026-11-18', debut: '09:00', fin: '10:30', duree: '1,5', note: 'n' });
  assert.deepEqual(valeursInitiales(null, S(0), 2), { id: null, lot: 2, date: '2026-11-18', debut: '', fin: '', duree: '', note: '' });
});

test('actionsSaisie : nouveau temps', () => {
  const r = actionsSaisie({ lot: '1', date: '2026-11-18', debut: '09:00', fin: '10:30', note: ' oubli ' }, { temps: [] });
  assert.deepEqual(r.actions, [['AddRecord', 'Time_tracking', null, { Devis: 1, Debut: S(9), Fin: S(10, 30), Note: 'oubli', Session: S(9) }]]);
});

test('actionsSaisie : correction d’une ligne, fin après minuit', () => {
  const ligne = { id: 4, Lot: 1, Debut: S(9), Fin: null };
  const r = actionsSaisie({ lot: '2', date: '2026-11-18', debut: '23:00', fin: '01:00', note: '' }, { temps: [ligne], ligne });
  assert.deepEqual(r.actions, [['UpdateRecord', 'Time_tracking', 4, { Devis: 2, Debut: S(23), Fin: S(25), Note: '' }]]);
});

test('actionsSaisie : refus lisibles', () => {
  assert.match(actionsSaisie({ lot: '', date: '2026-11-18', debut: '09:00' }, { temps: [] }).erreur, /prestation/);
  assert.match(actionsSaisie({ lot: '1', date: '', debut: '09:00' }, { temps: [] }).erreur, /date/);
  assert.match(actionsSaisie({ lot: '1', date: '2026-11-18' }, { temps: [] }).erreur, /durée, ou une heure de début/);
  assert.match(actionsSaisie({ lot: '1', date: '2026-11-18', duree: 'beaucoup' }, { temps: [] }).erreur, /0,25 ou 1h30/);
  assert.match(actionsSaisie({ lot: '1', date: '2026-11-18', debut: '09:00', fin: '9h' }, { temps: [] }).erreur, /fin/);
  const ouvert = { id: 8, Debut: S(8), Fin: null };
  assert.match(actionsSaisie({ lot: '1', date: '2026-11-18', debut: '09:00', fin: '' }, { temps: [ouvert] }).erreur, /chrono tourne/);
  // corriger le segment ouvert lui-même sans fin reste permis
  assert.ok(actionsSaisie({ lot: '1', date: '2026-11-18', debut: '07:30', fin: '' }, { temps: [ouvert], ligne: ouvert }).actions);
});

test('lireDuree : heures décimales, h et min', () => {
  assert.equal(lireDuree('0.25'), 15);
  assert.equal(lireDuree('0,25'), 15);
  assert.equal(lireDuree(' 1,5 h '), 90);
  assert.equal(lireDuree('2'), 120);
  assert.equal(lireDuree('1h30'), 90);
  assert.equal(lireDuree('1:05'), 65);
  assert.equal(lireDuree('45 min'), 45);
  for (const x of ['', '0', 'abc', '-1', '25', '1h3x']) assert.equal(lireDuree(x), null, x);
  assert.equal(ecrireDuree(15), '0,25');
  assert.equal(ecrireDuree(90), '1,5');
  assert.equal(ecrireDuree(0), '');
});

test('debutAuto : après le dernier temps fini du jour, sinon 9 h', () => {
  const j = S(0);
  assert.equal(debutAuto([], j), S(9));
  const temps = [{ id: 1, Debut: S(10), Fin: S(11) }, { id: 2, Debut: S(14), Fin: S(15, 30) }, { id: 3, Debut: S(16), Fin: null }, { id: 4, Debut: S(-10), Fin: S(-9) }];
  assert.equal(debutAuto(temps, j), S(15, 30));
  assert.equal(debutAuto(temps, j, 2), S(11), 'la ligne corrigée ne compte pas');
});

test('actionsSaisie : durée seule ou avec un début', () => {
  const temps = [{ id: 1, Debut: S(10), Fin: S(11) }];
  let r = actionsSaisie({ lot: '1', date: '2026-11-18', duree: '0,25', note: '' }, { temps });
  assert.deepEqual(r.actions, [['AddRecord', 'Time_tracking', null, { Devis: 1, Debut: S(11), Fin: S(11, 15), Note: '', Session: S(11) }]]);
  r = actionsSaisie({ lot: '1', date: '2026-11-18', debut: '14:00', duree: '1h30' }, { temps });
  assert.deepEqual([r.actions[0][3].Debut, r.actions[0][3].Fin], [S(14), S(15, 30)]);
  r = actionsSaisie({ lot: '1', date: '2026-11-18', debut: '14:00', fin: '15:00', duree: '3' }, { temps });
  assert.equal(r.actions[0][3].Fin, S(15), 'une fin tapée l’emporte');
  const ligne = { id: 1, Lot: 1, Debut: S(10), Fin: S(11) };
  assert.equal(valeursInitiales(ligne, 0, null).duree, '1');
});

test('accorder : la durée donne la fin, début et fin donnent la durée', () => {
  assert.deepEqual(accorder({ date: '2026-11-18', debut: '09:00', fin: '', duree: '1,5' }, 'duree'), { fin: '10:30' });
  assert.deepEqual(accorder({ date: '2026-11-18', debut: '', fin: '10:00', duree: '1' }, 'duree'), { fin: '' });
  assert.deepEqual(accorder({ date: '2026-11-18', debut: '09:00', fin: '09:15', duree: '' }, 'fin'), { duree: '0,25' });
  assert.deepEqual(accorder({ date: '2026-11-18', debut: '23:00', fin: '01:00', duree: '' }, 'debut'), { duree: '2' });
  assert.deepEqual(accorder({ date: '2026-11-18', debut: '09:00', fin: '', duree: '2' }, 'debut'), { fin: '11:00' });
});

test('actionSupprimer', () => {
  assert.deepEqual(actionSupprimer({ id: 3 }), [['RemoveRecord', 'Time_tracking', 3]]);
  assert.deepEqual(actionSupprimer(null), []);
});

test('entrées d’un autre jour, avec plage horaire', async () => {
  const { entreesDuJour, libelleJour } = await import('../js/vue.js');
  const hier = minuit(S(12)) - 86400;
  const temps = [{ id: 1, Lot: 'x', Debut: hier + 9 * 3600, Fin: hier + 10 * 3600 }, { id: 2, Lot: 'x', Debut: S(9), Fin: S(9, 30) }];
  const e = entreesDuJour(temps, new Map(), S(12), hier);
  assert.deepEqual(e.map((x) => [x.id, x.duree, x.plage]), [[1, '1 h 00', '09:00 – 10:00']]);
  assert.equal(libelleJour(hier, S(12)), 'Hier');
  assert.equal(libelleJour(minuit(S(12)), S(12)), 'Aujourd’hui');
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
