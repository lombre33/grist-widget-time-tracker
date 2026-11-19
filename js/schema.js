// Tables du document de gestion client que le widget lit, et colonnes qu'il ajoute à Time_tracking.
// Le widget ne crée qu'une table (Time_tracking, si elle manque) et n'ajoute que des colonnes : rien n'est modifié ni supprimé.

import { PHASES } from './phases.js';

const TZ = 'Europe/Paris';

export const TABLE_TEMPS = 'Time_tracking';

/** Tables lues, avec les colonnes dont le widget a besoin. Il ne les crée pas : elles sont à toi. */
export const SOURCES = {
  CLIENTS: ['Nom'],
  MISSIONS: ['numero', 'Client'],
  // Vendu : Heures_retenues (dev initial) ; les autres phases au pourcentage de leur colonne en euros sur Prix.
  DEVIS: ['Mission', 'prestations', 'Lots', 'Heures_retenues', 'Prix', 'retour_user', 'retour_finaux', 'Imprevu_buffer'],
  Table1: ['Missions'],
};

/** Colonnes de Time_tracking (ajoutées si elles manquent ; A, B, C et toute autre colonne restent telles quelles). */
export const COLONNES_TEMPS = [
  { id: 'Devis', type: 'Ref:DEVIS' },
  { id: 'Phase', type: 'Choice', choix: PHASES.map((p) => p.nom) },
  // Rappels en formule, pour les résumés de Grist par mission ou par prestation.
  { id: 'Mission', type: 'Ref:MISSIONS', formula: '$Devis.Mission' },
  { id: 'Prestation', type: 'Ref:Table1', formula: '$Devis.prestations' },
  { id: 'Debut', type: `DateTime:${TZ}` },
  { id: 'Fin', type: `DateTime:${TZ}` },
  { id: 'Note', type: 'Text' },
  { id: 'Session', type: 'Int' },
  {
    id: 'Duree_min',
    type: 'Numeric',
    formula: 'round(($Fin - $Debut).total_seconds() / 60, 2) if $Fin and $Debut else 0',
  },
];

/**
 * Compare la structure existante à ce qu'il faut.
 * @param {Record<string, string[]>} existant  table -> identifiants de colonnes présents
 * @returns {{ manquantes: string[], table: boolean, colonnes: object[] }}
 *   manquantes : tables ou colonnes sources absentes (le widget ne peut pas démarrer) ;
 *   table : Time_tracking est à créer ; colonnes : colonnes à ajouter à Time_tracking.
 */
export function planifier(existant) {
  const manquantes = [];
  for (const [table, cols] of Object.entries(SOURCES)) {
    if (!existant[table]) manquantes.push(`table ${table}`);
    else cols.filter((c) => !existant[table].includes(c)).forEach((c) => manquantes.push(`colonne ${table}.${c}`));
  }
  const temps = existant[TABLE_TEMPS];
  return {
    manquantes,
    table: !temps,
    colonnes: temps ? COLONNES_TEMPS.filter((c) => !temps.includes(c.id)) : [],
  };
}

export const planVide = (plan) => !plan.table && plan.colonnes.length === 0;

function infoColonne(col) {
  if (col.formula) return { type: col.type, isFormula: true, formula: col.formula };
  return col.choix
    ? { type: col.type, isFormula: false, widgetOptions: JSON.stringify({ choices: col.choix }) }
    : { type: col.type, isFormula: false };
}

/** Actions Grist qui créent ce que le plan dit manquant (ajouts seulement). */
export function actionsDuPlan(plan) {
  if (plan.table) {
    return [['AddTable', TABLE_TEMPS, COLONNES_TEMPS.map((c) => ({ id: c.id, ...infoColonne(c) }))]];
  }
  return plan.colonnes.map((c) => ['AddColumn', TABLE_TEMPS, c.id, infoColonne(c)]);
}
