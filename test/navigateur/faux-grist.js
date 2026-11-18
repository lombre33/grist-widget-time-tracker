// Faux Grist minimal pour essayer l'interface dans un navigateur sans document Grist.
// Il ne remplace pas un essai dans un vrai Grist : il calcule les formules du schéma à la main.
(() => {
  // Le document de gestion client tel qu'il est avant le widget (Time_tracking n'a que A, B, C).
  const tables = {
    CLIENTS: [{ id: 1, Nom: 'Atelier Mira' }],
    MISSIONS: [{ id: 1, numero: 'M-2026-01', date: 1790000000, Client: 1 }],
    Table1: [{ id: 1, Missions: 'Ateliers', heures: 14 }, { id: 2, Missions: 'Écrans', heures: 21 }],
    DEVIS: [{ id: 1, Mission: 1, prestations: 1, Lots: 'Cadrage' }, { id: 2, Mission: 1, prestations: 2, Lots: 'Maquettes' }],
    Time_tracking: [],
  };
  const colonnes = {
    CLIENTS: ['Nom', 'Adresse', 'Siret'], MISSIONS: ['numero', 'date', 'Client'], Table1: ['Missions_EN', 'Missions', 'heures'],
    DEVIS: ['Mission', 'prestations', 'Lots'], Time_tracking: ['A', 'B', 'C'],
  };
  const suivant = { CLIENTS: 2, MISSIONS: 2, Table1: 3, DEVIS: 3, Time_tracking: 1 };
  const ecouteurs = [];

  function formules() {
    for (const r of tables.Time_tracking || []) r.Duree_min = r.Fin && r.Debut ? (r.Fin - r.Debut) / 60 : 0;
  }
  function enColonnes(lignes, cols) {
    const out = { id: lignes.map((r) => r.id) };
    for (const c of cols) out[c] = lignes.map((r) => r[c] ?? null);
    return out;
  }
  function appliquer(a) {
    const [type, table] = a;
    if (type === 'AddTable') { tables[table] = []; suivant[table] = 1; colonnes[table] = a[2].map((c) => c.id); return { table_id: table }; }
    if (type === 'AddColumn') { colonnes[table].push(a[2]); return null; }
    if (type === 'AddRecord') { const id = suivant[table]++; tables[table].push({ id, ...a[3] }); return id; }
    if (type === 'UpdateRecord') { Object.assign(tables[table].find((r) => r.id === a[2]), a[3]); return null; }
    if (type === 'RemoveRecord') { tables[table].splice(tables[table].findIndex((r) => r.id === a[2]), 1); return null; }
    throw new Error(`Action inconnue ${type}`);
  }
  window.__fauxGrist = { tables, appliquer, formules };
  window.grist = {
    ready() {},
    onRecords(fn) { ecouteurs.push(fn); },
    docApi: {
      async listTables() { return Object.keys(tables); },
      async fetchTable(t) { formules(); return enColonnes(tables[t], colonnes[t]); },
      async applyUserActions(actions) { const retValues = actions.map(appliquer); formules(); return { retValues }; },
    },
  };
})();
