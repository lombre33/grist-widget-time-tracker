// Seul module qui parle à Grist (API des widgets : window.grist).

import { SOURCES, TABLE_TEMPS } from './schema.js';
import { enLignes } from './vue.js';
import { construireModele } from './modele.js';

const api = () => window.grist;

/** Annonce le widget à Grist et branche le rafraîchissement. */
export function brancher(surChangement) {
  api().ready({ requiredAccess: 'full', allowSelectBy: false });
  // Grist prévient quand la table liée change ; ça suffit pour suivre une saisie faite ailleurs dans le document.
  api().onRecords(() => surChangement());
}

/** Tables et colonnes existantes, pour celles que le widget utilise. */
export async function lireStructure() {
  const tables = await api().docApi.listTables();
  const utiles = new Set([...Object.keys(SOURCES), TABLE_TEMPS]);
  const existant = {};
  for (const t of tables) {
    if (utiles.has(t)) existant[t] = Object.keys(await api().docApi.fetchTable(t));
  }
  return existant;
}

/** Lit les tables de gestion client et rend les prestations suivies et le temps du chrono. */
export async function lireDonnees() {
  const [clients, missions, devis, prestations, temps] = await Promise.all(
    ['CLIENTS', 'MISSIONS', 'DEVIS', 'Table1', TABLE_TEMPS].map((t) => api().docApi.fetchTable(t).then(enLignes)),
  );
  return construireModele({ clients, missions, devis, prestations, temps });
}

export function appliquer(actions) {
  return api().docApi.applyUserActions(actions);
}

/**
 * Crée Time_tracking ou ses colonnes manquantes, puis vérifie que Grist a gardé le nom demandé
 * (il renomme une table dont le nom est déjà pris).
 */
export async function installer(actions) {
  const res = await appliquer(actions);
  actions.forEach((a, i) => {
    if (a[0] !== 'AddTable') return;
    const obtenu = res.retValues?.[i]?.table_id;
    if (obtenu && obtenu !== a[1]) {
      throw new Error(`Grist a créé la table « ${obtenu} » au lieu de « ${a[1]} ». Renomme-la puis recharge le widget.`);
    }
  });
}

/** Le widget a-t-il l'accès complet au document ? */
export async function accesComplet() {
  try {
    await api().docApi.listTables();
    return true;
  } catch {
    return false;
  }
}
