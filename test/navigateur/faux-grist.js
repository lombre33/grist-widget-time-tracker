// Faux Grist minimal pour essayer l'interface dans un navigateur sans document Grist.
// Il ne remplace pas un essai dans un vrai Grist : il calcule les formules du schéma à la main.
(() => {
  const tables = {};
  const suivant = {};
  const ecouteurs = [];

  function formules() {
    const L = tables.Lots; const T = tables.Temps;
    if (T) for (const r of T) r.Duree_min = r.Fin && r.Debut ? (r.Fin - r.Debut) / 60 : 0;
    if (L) for (const l of L) {
      const p = (tables.Projets || []).find((x) => x.id === l.Projet);
      const c = p && (tables.Clients || []).find((x) => x.id === p.Client);
      l.Projet_nom = p ? p.Nom : ''; l.Client_nom = c ? c.Nom : '';
      l.Reel_min = (T || []).filter((r) => r.Lot === l.id).reduce((s, r) => s + r.Duree_min, 0);
    }
  }
  function enColonnes(lignes, cols) {
    const out = { id: lignes.map((r) => r.id) };
    for (const c of cols) out[c] = lignes.map((r) => r[c] ?? null);
    return out;
  }
  const colonnes = {};
  function appliquer(a) {
    const [type, table] = a;
    if (type === 'AddTable') { tables[table] = []; suivant[table] = 1; colonnes[table] = a[2].map((c) => c.id); return { table_id: table }; }
    if (type === 'AddColumn') { colonnes[table].push(a[2]); return null; }
    if (type === 'AddRecord') { const id = suivant[table]++; tables[table].push({ id, ...a[3] }); return id; }
    if (type === 'UpdateRecord') { Object.assign(tables[table].find((r) => r.id === a[2]), a[3]); return null; }
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
