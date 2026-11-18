// Structure des tables que le widget crée dans le document Grist, et calcul de ce qui manque.
// Les calculs (durées, réel par lot, écart) sont des formules Grist : visibles et réutilisables dans le document.

const TZ = 'Europe/Paris';

export const SCHEMA = [
  {
    table: 'Clients',
    cols: [{ id: 'Nom', type: 'Text' }],
  },
  {
    table: 'Projets',
    cols: [
      { id: 'Nom', type: 'Text' },
      { id: 'Client', type: 'Ref:Clients' },
    ],
  },
  {
    table: 'Lots',
    cols: [
      { id: 'Nom', type: 'Text' },
      { id: 'Projet', type: 'Ref:Projets' },
      { id: 'Jours_vendus', type: 'Numeric' },
      { id: 'Termine', type: 'Bool' },
      { id: 'Client_nom', type: 'Text', formula: '$Projet.Client.Nom' },
      { id: 'Projet_nom', type: 'Text', formula: '$Projet.Nom' },
      { id: 'Reel_min', type: 'Numeric', formula: 'SUM(Temps.lookupRecords(Lot=$id).Duree_min)' },
      { id: 'Reel_j', type: 'Numeric', formula: 'round($Reel_min / 420, 2)' },
      { id: 'Ecart_j', type: 'Numeric', formula: 'round($Reel_j - ($Jours_vendus or 0), 2)' },
    ],
  },
  {
    table: 'Temps',
    cols: [
      { id: 'Lot', type: 'Ref:Lots' },
      { id: 'Debut', type: `DateTime:${TZ}` },
      { id: 'Fin', type: `DateTime:${TZ}` },
      { id: 'Note', type: 'Text' },
      { id: 'Session', type: 'Int' },
      {
        id: 'Duree_min',
        type: 'Numeric',
        formula: 'round(($Fin - $Debut).total_seconds() / 60, 2) if $Fin and $Debut else 0',
      },
    ],
  },
];

/**
 * Compare la structure existante à SCHEMA.
 * @param {Record<string, string[]>} existant  table -> identifiants de colonnes présents
 * @returns {{ tables: string[], colonnes: {table: string, col: object}[] }}
 */
export function planifier(existant, schema = SCHEMA) {
  const tables = [];
  const colonnes = [];
  for (const def of schema) {
    const cols = existant[def.table];
    if (!cols) {
      tables.push(def.table);
      continue;
    }
    const presentes = new Set(cols);
    for (const col of def.cols) {
      if (!presentes.has(col.id)) colonnes.push({ table: def.table, col });
    }
  }
  return { tables, colonnes };
}

export const planVide = (plan) => plan.tables.length === 0 && plan.colonnes.length === 0;

function infoColonne(col) {
  return col.formula
    ? { type: col.type, isFormula: true, formula: col.formula }
    : { type: col.type, isFormula: false };
}

/** Actions Grist qui créent ce que le plan dit manquant (ajouts seulement). */
export function actionsDuPlan(plan, schema = SCHEMA) {
  const actions = [];
  for (const nom of plan.tables) {
    const def = schema.find((d) => d.table === nom);
    actions.push(['AddTable', nom, def.cols.map((c) => ({ id: c.id, ...infoColonne(c) }))]);
  }
  for (const { table, col } of plan.colonnes) {
    actions.push(['AddColumn', table, col.id, infoColonne(col)]);
  }
  return actions;
}
