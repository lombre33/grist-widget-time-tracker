// Les phases d'une prestation, telles que DEVIS les vend : le dev initial (Heures_retenues), puis des retours et un
// imprévu calculés en pourcentage du dev. Le pourcentage est relu dans les colonnes en euros de DEVIS
// (retour_user / Prix…), pour suivre les formules du document si elles changent. Fonctions pures.

export const PHASES = [
  { cle: 'dev', nom: 'Dev initial', colonne: null, defaut: 1 },
  { cle: 'retour_user', nom: 'Retour user', colonne: 'retour_user', defaut: 0.2 },
  { cle: 'retour_finaux', nom: 'Retours finaux', colonne: 'retour_finaux', defaut: 0.1 },
  { cle: 'imprevu', nom: 'Imprévu', colonne: 'Imprevu_buffer', defaut: 0.1 },
];

export const PHASE_DEFAUT = 'dev';

/** Valeur de la colonne Phase (nom) ou clé -> clé. Vide ou inconnue : le dev initial (temps saisis avant les phases). */
export const phaseDe = (valeur) => PHASES.find((p) => p.nom === valeur || p.cle === valeur)?.cle || PHASE_DEFAUT;

export const nomPhase = (cle) => PHASES.find((p) => p.cle === cle)?.nom || PHASES[0].nom;

/** Une valeur par phase. */
export const parPhase = (fn) => Object.fromEntries(PHASES.map((p) => [p.cle, fn(p)]));

/** Heures vendues par phase pour une ligne de DEVIS. */
export function heuresParPhase(d) {
  const h = Number(d.Heures_retenues) || 0;
  const prix = Number(d.Prix) || 0;
  return parPhase((p) => {
    if (!p.colonne) return h;
    return h * (prix > 0 && d[p.colonne] != null ? (Number(d[p.colonne]) || 0) / prix : p.defaut);
  });
}
