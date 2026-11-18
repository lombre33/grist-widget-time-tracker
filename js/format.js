// Mise en forme des durées. Fonctions pures, testées dans test/format.test.mjs.

export const MIN_PAR_JOUR = 420; // 1 jour vendu = 7 h

const pad = (n) => String(n).padStart(2, '0');

/** Secondes -> « h:mm:ss ». */
export function hms(secondes) {
  const s = Math.max(0, Math.floor(Number(secondes) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${pad(m)}:${pad(s % 60)}`;
}

/** Minutes -> « 2 h 05 » ou « 45 min ». */
export function hm(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${pad(m)}` : `${m} min`;
}

/** Minutes -> « 1,6 j » (jours de 7 h par défaut). */
export function jours(minutes, minParJour = MIN_PAR_JOUR) {
  const j = (Number(minutes) || 0) / minParJour;
  return `${j.toFixed(1).replace('.', ',')} j`;
}

/** Nombre de jours (vendus) -> « 4 j », « 2,5 j ». */
export function nbJours(n) {
  const v = Number(n) || 0;
  const txt = Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
  return `${txt} j`;
}

/** Écart en minutes -> en jours, ou en heures quand il fait moins d'un dixième de jour. */
export function ecart(minutes, minParJour = MIN_PAR_JOUR) {
  return Math.abs(minutes) < minParJour / 10 ? hm(Math.abs(minutes)) : jours(Math.abs(minutes), minParJour);
}
