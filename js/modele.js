// Passe des tables de gestion client (CLIENTS, MISSIONS, DEVIS, Table1, Time_tracking) aux lots que le chrono affiche.
// Un lot = une mission + une valeur de la colonne Lots de DEVIS. Le vendu d'un lot = la somme des heures des
// prestations de ses lignes de devis. Fonctions pures.

export const SANS_LOT = 'Sans lot';

/** Clé d'un lot : « idMission|lot ». */
export const cleLot = (missionId, lot) => `${missionId}|${lot ?? ''}`;

/** Champs à écrire dans Time_tracking pour un lot. */
export function champsDuLot(cle) {
  const i = String(cle).indexOf('|');
  return { Mission: Number(cle.slice(0, i)), Lot: cle.slice(i + 1) };
}

/** Une valeur de colonne Choix (texte) ou Choix multiple (['L', 'a', 'b']) -> liste de lots. */
export function valeursLot(v) {
  if (Array.isArray(v)) return v[0] === 'L' ? v.slice(1) : v;
  return v == null || v === '' ? [''] : [String(v)];
}

/** Lignes de Time_tracking -> lignes du chrono ({ Lot: clé, ... }). Les lignes sans mission sont ignorées. */
export function tempsDuChrono(lignes) {
  return lignes
    .filter((r) => r.Mission)
    .map((r) => ({ id: r.id, Lot: cleLot(r.Mission, r.Lot || ''), Debut: r.Debut, Fin: r.Fin, Note: r.Note, Session: r.Session, Duree_min: r.Duree_min }));
}

function ajouter(lots, missions, clients, missionId, lot) {
  const cle = cleLot(missionId, lot);
  if (!lots.has(cle)) {
    const m = missions.get(missionId);
    const c = m && clients.get(m.Client);
    lots.set(cle, {
      id: cle,
      Nom: lot || SANS_LOT,
      Projet_nom: m ? m.numero || `Mission ${missionId}` : `Mission ${missionId}`,
      Client_nom: c?.Nom || '',
      heures: 0,
      Reel_min: 0,
      dateMission: m?.date || 0,
    });
  }
  return lots.get(cle);
}

/**
 * @param {{ clients?: object[], missions: object[], devis: object[], prestations: object[], temps: object[] }} sources  lignes Grist
 * @returns {{ lots: object[], temps: object[] }}  ce qu'attend construireVue
 */
export function construireModele({ clients = [], missions, devis, prestations, temps }) {
  const parMission = new Map(missions.map((m) => [m.id, m]));
  const parClient = new Map(clients.map((c) => [c.id, c]));
  const heures = new Map(prestations.map((p) => [p.id, Number(p.heures) || 0]));
  const lots = new Map();
  for (const d of devis) {
    if (!d.Mission) continue;
    const valeurs = valeursLot(d.Lots);
    // Une ligne de devis rangée dans plusieurs lots compte ses heures dans chacun.
    for (const v of valeurs) ajouter(lots, parMission, parClient, d.Mission, v).heures += heures.get(d.prestations) || 0;
  }
  const tps = tempsDuChrono(temps);
  for (const r of tps) {
    const { Mission, Lot } = champsDuLot(r.Lot);
    ajouter(lots, parMission, parClient, Mission, Lot).Reel_min += Number(r.Duree_min) || 0;
  }
  const liste = [...lots.values()]
    .map(({ heures: h, dateMission, ...l }) => ({ ...l, Jours_vendus: h / 7, dateMission }))
    .sort((a, b) => (b.dateMission || 0) - (a.dateMission || 0) || a.Projet_nom.localeCompare(b.Projet_nom, 'fr') || a.Nom.localeCompare(b.Nom, 'fr'))
    .map(({ dateMission, ...l }) => l);
  return { lots: liste, temps: tps };
}
