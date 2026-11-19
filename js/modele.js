// Passe des tables de gestion client (CLIENTS, MISSIONS, DEVIS, Table1, Time_tracking) aux prestations que le chrono
// affiche. Une prestation suivie = une ligne de DEVIS (une mission + une prestation de Table1) ; son vendu, par phase,
// vient de DEVIS (voir phases.js). Dans les lignes du chrono, `Lot` porte l'identifiant de cette ligne de devis et
// `Phase` la clé de sa phase. Fonctions pures.

import { heuresParPhase, parPhase, phaseDe } from './phases.js';

/** Champs à écrire dans Time_tracking pour une prestation (identifiant de ligne de DEVIS). */
export const champsDuLot = (id) => ({ Devis: Number(id) });

/** Une valeur de colonne Choix (texte) ou Choix multiple (['L', 'a', 'b']) -> texte. */
export function texteChoix(v) {
  if (Array.isArray(v)) return (v[0] === 'L' ? v.slice(1) : v).join(', ');
  return v == null ? '' : String(v);
}

/** Lignes de Time_tracking -> lignes du chrono ({ Lot: id de la ligne de devis, Phase: clé, ... }). Sans devis : ignorées. */
export function tempsDuChrono(lignes) {
  return lignes
    .filter((r) => r.Devis)
    .map((r) => ({
      id: r.id, Lot: r.Devis, Phase: phaseDe(r.Phase), Debut: r.Debut, Fin: r.Fin, Note: r.Note, Session: r.Session, Duree_min: r.Duree_min,
    }));
}

/**
 * @param {{ clients?: object[], missions: object[], devis: object[], prestations: object[], temps: object[] }} sources  lignes Grist
 * @returns {{ lots: object[], temps: object[] }}  ce qu'attend construireVue
 */
export function construireModele({ clients = [], missions, devis, prestations, temps }) {
  const parMission = new Map(missions.map((m) => [m.id, m]));
  const parClient = new Map(clients.map((c) => [c.id, c]));
  const parPrestation = new Map(prestations.map((p) => [p.id, p]));
  const tps = tempsDuChrono(temps);
  const reel = new Map();
  for (const r of tps) {
    if (!reel.has(r.Lot)) reel.set(r.Lot, parPhase(() => 0));
    reel.get(r.Lot)[r.Phase] += Number(r.Duree_min) || 0;
  }
  return {
    lots: devis
      .filter((d) => d.Mission)
      .map((d) => {
        const m = parMission.get(d.Mission);
        const lot = texteChoix(d.Lots);
        const vendus = parPhase((p) => heuresParPhase(d)[p.cle] / 7);
        const reels = reel.get(d.id) || parPhase(() => 0);
        return {
          id: d.id,
          Nom: parPrestation.get(d.prestations)?.Missions || `Prestation ${d.id}`,
          Projet_nom: [m?.numero || `Mission ${d.Mission}`, lot].filter(Boolean).join(' · '),
          Mission: d.Mission,
          Mission_nom: m?.numero || `Mission ${d.Mission}`,
          Lot_txt: lot,
          Client_nom: parClient.get(m?.Client)?.Nom || '',
          Vendu_phases: vendus,
          Jours_vendus: Object.values(vendus).reduce((a, b) => a + b, 0),
          Reel_phases: reels,
          Reel_min: Object.values(reels).reduce((a, b) => a + b, 0),
          date: m?.date || 0,
          numero: m?.numero || '',
        };
      })
      // Mission la plus récente d'abord ; dans une mission, l'ordre des lignes du devis (le tri de JavaScript est stable).
      .sort((a, b) => b.date - a.date || a.numero.localeCompare(b.numero, 'fr'))
      .map(({ date, numero, ...l }) => l),
    temps: tps,
  };
}
