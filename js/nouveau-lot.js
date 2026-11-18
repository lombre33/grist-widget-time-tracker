// Ajout d'un lot depuis le widget : retrouve le client et le projet par leur nom, ou les crée.

const cle = (s) => String(s ?? '').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Lit et vérifie le formulaire. Rend { erreur } ou { client, projet, lot, jours }. */
export function lireFormulaire({ client, projet, lot, jours }) {
  const f = {
    client: String(client ?? '').trim(),
    projet: String(projet ?? '').trim(),
    lot: String(lot ?? '').trim(),
    jours: Number(String(jours ?? '').replace(',', '.')),
  };
  if (!f.client || !f.projet || !f.lot) return { erreur: 'Client, projet et lot sont obligatoires.' };
  if (!Number.isFinite(f.jours) || f.jours < 0) return { erreur: 'Les jours vendus doivent être un nombre positif.' };
  return f;
}

export function trouverClient(clients, nom) {
  return clients.find((c) => cle(c.Nom) === cle(nom)) ?? null;
}

export function trouverProjet(projets, clientId, nom) {
  return projets.find((p) => p.Client === clientId && cle(p.Nom) === cle(nom)) ?? null;
}

/**
 * Crée ce qui manque, dans l'ordre client -> projet -> lot.
 * @param {(actions: any[]) => Promise<{retValues: any[]}>} appliquer
 * @returns {Promise<number>} l'identifiant du lot créé
 */
export async function creerLot(f, { clients, projets }, appliquer) {
  let clientId = trouverClient(clients, f.client)?.id;
  if (!clientId) {
    const r = await appliquer([['AddRecord', 'Clients', null, { Nom: f.client }]]);
    clientId = r.retValues[0];
  }
  let projetId = trouverProjet(projets, clientId, f.projet)?.id;
  if (!projetId) {
    const r = await appliquer([['AddRecord', 'Projets', null, { Nom: f.projet, Client: clientId }]]);
    projetId = r.retValues[0];
  }
  const r = await appliquer([['AddRecord', 'Lots', null, { Nom: f.lot, Projet: projetId, Jours_vendus: f.jours }]]);
  return r.retValues[0];
}
