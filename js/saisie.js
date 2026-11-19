// Saisie et correction à la main d'un temps (oubli de lancer ou d'arrêter le chrono). Fonctions pures.
// Les heures sont lues et écrites dans le fuseau du navigateur.

import { TABLE_TEMPS } from './schema.js';
import { champsDuLot } from './modele.js';
import { PHASE_DEFAUT, nomPhase } from './phases.js';

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

/**
 * Une durée tapée -> minutes, ou null. Heures décimales (« 0.25 », « 0,25 » = 15 min), « 1h30 », « 1:30 », « 45 min ».
 */
export function lireDuree(texte) {
  // Un signe moins (« -0,5 ») fait une correction : du temps retiré.
  const brut = String(texte || '').trim().toLowerCase().replace(/\s+/g, '');
  const signe = /^[-−]/.test(brut) ? -1 : 1;
  const t = brut.replace(/^[-−+]/, '');
  let m = /^(\d+(?:[.,]\d+)?)h?$/.exec(t);
  let min = null;
  if (m) min = Number(m[1].replace(',', '.')) * 60;
  else if ((m = /^(\d+)[h:](\d{1,2})(?:m|min|mn)?$/.exec(t))) min = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d+)(?:m|min|mn)$/.exec(t))) min = Number(m[1]);
  return min > 0 && min <= 24 * 60 ? (signe * Math.round(min * 100)) / 100 : null;
}

/** Minutes -> heures décimales lisibles (« 1,5 », « 0,25 »). */
export function ecrireDuree(min) {
  return min ? String(Math.round((min / 60) * 100) / 100).replace('.', ',') : '';
}

/** Début d'un temps saisi par sa seule durée : après le dernier temps fini du jour, sinon 9 h. */
export function debutAuto(temps, jour, sauf = null) {
  // Une correction (fin avant le début) n'occupe pas de place : seul son début compte.
  const fins = temps.filter((r) => r.id !== sauf && r.Fin && r.Debut >= jour && r.Debut < jour + 86400).map((r) => Math.max(r.Fin, r.Debut));
  return fins.length ? Math.max(...fins) : jour + 9 * 3600;
}

/**
 * Garde début, fin et durée d'accord pendant la saisie. `source` : le champ qui vient de changer.
 * Rend les champs à réécrire.
 */
export function accorder({ date, debut, fin, duree }, source) {
  const d = depuisChamps(date || '2000-01-01', debut);
  if (source === 'duree' || (source === 'debut' && !fin && duree)) {
    const min = lireDuree(duree);
    if (d == null || min == null || min < 0) return { fin: '' }; // une correction n'a pas d'heure de fin
    return { fin: versChamps(d + min * 60).heure };
  }
  let f = depuisChamps(date || '2000-01-01', fin);
  if (d == null || f == null) return {};
  if (f <= d) f += 86400;
  return { duree: ecrireDuree((f - d) / 60) };
}

/** Valeurs du formulaire pour une ligne existante (ou un nouveau temps le jour `jour`). */
export function valeursInitiales(ligne, jour, lotParDefaut, phaseParDefaut = PHASE_DEFAUT) {
  if (ligne) {
    const debut = versChamps(ligne.Debut);
    return {
      id: ligne.id, lot: ligne.Lot, phase: ligne.Phase || PHASE_DEFAUT, date: debut.date, debut: debut.heure, fin: ligne.Fin > ligne.Debut ? versChamps(ligne.Fin).heure : '',
      duree: ligne.Fin ? ecrireDuree((ligne.Fin - ligne.Debut) / 60) : '', note: ligne.Note || '',
    };
  }
  return { id: null, lot: lotParDefaut || '', phase: phaseParDefaut, date: versChamps(jour).date, debut: '', fin: '', duree: '', note: '' };
}

/**
 * Vérifie le formulaire et rend les actions Grist, ou { erreur }.
 * Une fin vide laisse le segment ouvert (le chrono reprend) : refusé si un autre segment est déjà ouvert.
 * Une fin avant le début passe minuit (fin le lendemain).
 */
export function actionsSaisie(v, { temps, ligne = null }) {
  if (!v.lot) return { erreur: 'Choisis une prestation.' };
  const jour = depuisChamps(v.date, '00:00');
  if (jour == null) return { erreur: 'Indique la date.' };
  let debut = depuisChamps(v.date, v.debut);
  if (v.debut && debut == null) return { erreur: 'L’heure de début n’est pas lisible.' };
  if (!v.fin && v.duree) {
    // Durée seule : la fin suit le début, ou le temps se place après le dernier de la journée.
    const min = lireDuree(v.duree);
    if (min == null) return { erreur: 'La durée n’est pas lisible : tape par exemple 0,25, 1h30 ou -0,5.' };
    if (debut == null) debut = debutAuto(temps, jour, ligne?.id);
    return enregistrer(v, ligne, debut, debut + min * 60);
  }
  if (debut == null) return { erreur: 'Indique une durée, ou une heure de début.' };
  let fin = null;
  if (v.fin) {
    fin = depuisChamps(v.date, v.fin);
    if (fin == null) return { erreur: 'L’heure de fin n’est pas lisible.' };
    if (fin <= debut) fin += 86400;
  } else if (temps.some((r) => r.Debut && !r.Fin && r.id !== ligne?.id)) {
    return { erreur: 'Un chrono tourne déjà : indique une heure de fin.' };
  }
  return enregistrer(v, ligne, debut, fin);
}

function enregistrer(v, ligne, debut, fin) {
  const champs = { ...champsDuLot(v.lot), Phase: nomPhase(v.phase || PHASE_DEFAUT), Debut: debut, Fin: fin, Note: (v.note || '').trim() };
  if (ligne) return { actions: [['UpdateRecord', TABLE_TEMPS, ligne.id, champs]] };
  return { actions: [['AddRecord', TABLE_TEMPS, null, { ...champs, Session: Math.floor(debut) }]] };
}

export function actionSupprimer(ligne) {
  return ligne ? [['RemoveRecord', TABLE_TEMPS, ligne.id]] : [];
}
