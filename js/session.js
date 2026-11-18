// Le chrono vit dans la table Time_tracking : un segment ouvert est une ligne avec un Début et sans Fin.
// Il survit donc à la fermeture de l'onglet et se voit depuis un autre appareil.
// Changer de lot pendant le chrono ferme le segment et en ouvre un autre : c'est le milestone.

import { TABLE_TEMPS } from './schema.js';
import { champsDuLot } from './modele.js';

/** Le segment ouvert le plus récent, ou null. */
export function segmentOuvert(temps) {
  let ouvert = null;
  for (const r of temps) {
    if (r.Debut && !r.Fin && (!ouvert || r.Debut > ouvert.Debut)) ouvert = r;
  }
  return ouvert;
}

const ajout = (cle, sec, session) => [
  'AddRecord', TABLE_TEMPS, null, { ...champsDuLot(cle), Debut: sec, Session: session },
];
const fermeture = (ligne, sec) => ['UpdateRecord', TABLE_TEMPS, ligne.id, { Fin: Math.max(sec, ligne.Debut) }];

/** Démarre le chrono sur un lot. `sec` : secondes depuis l'époque Unix. */
export function demarrer(lotId, sec) {
  if (!lotId) throw new Error('Aucun lot choisi');
  return [ajout(lotId, sec, Math.floor(sec))];
}

/** Change de lot pendant le chrono : ferme le segment ouvert et en ouvre un nouveau dans la même session. */
export function changer(ouvert, lotId, sec) {
  if (!ouvert || ouvert.Lot === lotId) return [];
  return [fermeture(ouvert, sec), ajout(lotId, sec, ouvert.Session || Math.floor(ouvert.Debut))];
}

/** Arrête le chrono. */
export function arreter(ouvert, sec) {
  return ouvert ? [fermeture(ouvert, sec)] : [];
}

/** Écrit la note du segment ouvert, si elle a changé. */
export function noter(ouvert, note) {
  if (!ouvert || (ouvert.Note || '') === note) return [];
  return [['UpdateRecord', TABLE_TEMPS, ouvert.id, { Note: note }]];
}
