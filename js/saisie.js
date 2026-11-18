// Saisie et correction à la main d'un temps (oubli de lancer ou d'arrêter le chrono). Fonctions pures.
// Les heures sont lues et écrites dans le fuseau du navigateur.

import { TABLE_TEMPS } from './schema.js';
import { champsDuLot } from './modele.js';

const pad = (n) => String(n).padStart(2, '0');

/** Secondes -> { date: 'AAAA-MM-JJ', heure: 'HH:MM' } (heure locale). */
export function versChamps(sec) {
  if (!sec) return { date: '', heure: '' };
  const d = new Date(sec * 1000);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, heure: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** 'AAAA-MM-JJ' + 'HH:MM' -> secondes (heure locale), ou null. */
export function depuisChamps(date, heure) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const h = /^(\d{1,2}):(\d{2})$/.exec(heure || '');
  if (!m || !h) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(h[1]), Number(h[2]), 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.getTime() / 1000;
}

/** Valeurs du formulaire pour une ligne existante (ou un nouveau temps le jour `jour`). */
export function valeursInitiales(ligne, jour, lotParDefaut) {
  if (ligne) {
    const debut = versChamps(ligne.Debut);
    return { id: ligne.id, lot: ligne.Lot, date: debut.date, debut: debut.heure, fin: versChamps(ligne.Fin).heure, note: ligne.Note || '' };
  }
  return { id: null, lot: lotParDefaut || '', date: versChamps(jour).date, debut: '', fin: '', note: '' };
}

/**
 * Vérifie le formulaire et rend les actions Grist, ou { erreur }.
 * Une fin vide laisse le segment ouvert (le chrono reprend) : refusé si un autre segment est déjà ouvert.
 * Une fin avant le début passe minuit (fin le lendemain).
 */
export function actionsSaisie(v, { temps, ligne = null }) {
  if (!v.lot) return { erreur: 'Choisis une prestation.' };
  const debut = depuisChamps(v.date, v.debut);
  if (debut == null) return { erreur: 'Indique la date et l’heure de début.' };
  let fin = null;
  if (v.fin) {
    fin = depuisChamps(v.date, v.fin);
    if (fin == null) return { erreur: 'L’heure de fin n’est pas lisible.' };
    if (fin <= debut) fin += 86400;
  } else if (temps.some((r) => r.Debut && !r.Fin && r.id !== ligne?.id)) {
    return { erreur: 'Un chrono tourne déjà : indique une heure de fin.' };
  }
  const champs = { ...champsDuLot(v.lot), Debut: debut, Fin: fin, Note: (v.note || '').trim() };
  if (ligne) return { actions: [['UpdateRecord', TABLE_TEMPS, ligne.id, champs]] };
  return { actions: [['AddRecord', TABLE_TEMPS, null, { ...champs, Session: Math.floor(debut) }]] };
}

export function actionSupprimer(ligne) {
  return ligne ? [['RemoveRecord', TABLE_TEMPS, ligne.id]] : [];
}
