// Construit ce que l'écran affiche à partir des lignes Grist et de l'heure. Fonctions pures.

import { MIN_PAR_JOUR, hms, hm, jours, nbJours, ecart } from './format.js';
import { segmentOuvert } from './session.js';
import { PHASES, PHASE_DEFAUT, nomPhase, parPhase } from './phases.js';

/** Données en colonnes de Grist ({id: [...], Nom: [...]}) -> tableau d'objets. */
export function enLignes(colonnes) {
  if (!colonnes || !Array.isArray(colonnes.id)) return [];
  const cles = Object.keys(colonnes);
  return colonnes.id.map((_, i) => Object.fromEntries(cles.map((k) => [k, colonnes[k][i]])));
}

/** Minuit local du jour de `sec`, en secondes. */
export function minuit(sec) {
  const d = new Date(sec * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() / 1000;
}

const fin = (r, maintenant) => (r.Fin ? r.Fin : maintenant);

/** Minutes d'une ligne de Temps comprises après `depuis`. */
/** Une correction : temps retiré, saisi avec une fin avant le début (Duree_min négative). */
export const estCorrection = (r) => Boolean(r.Fin && r.Debut && r.Fin < r.Debut);

export function minutesDepuis(r, depuis, maintenant) {
  if (!r.Debut) return 0;
  if (estCorrection(r)) return r.Debut >= depuis ? (r.Fin - r.Debut) / 60 : 0;
  return Math.max(0, fin(r, maintenant) - Math.max(r.Debut, depuis)) / 60;
}

export function libelleLot(lot) {
  if (!lot) return 'Prestation supprimée';
  const contexte = [lot.Client_nom, lot.Mission_nom ?? lot.Projet_nom].filter(Boolean).join(' · ');
  return contexte ? `${lot.Nom || 'Sans nom'} · ${contexte}` : lot.Nom || 'Sans nom';
}

/** Valeurs par phase d'une prestation ; une prestation sans détail par phase compte tout en dev initial. */
const phasesDe = (lot, detail, total) => parPhase((p) => Number(lot[detail]?.[p.cle] ?? (p.cle === PHASE_DEFAUT ? lot[total] : 0)) || 0);

/**
 * Vendu vs réel d'une prestation sur les phases `cles` (toutes, ou une seule). La barre est découpée par phase,
 * à l'échelle du plus grand du vendu et du réel ; en dépassement, un repère marque le vendu.
 */
function etatLot(lot, ouvert, maintenant, minParJour, cles) {
  const reels = phasesDe(lot, 'Reel_phases', 'Reel_min');
  if (ouvert && ouvert.Lot === lot.id) reels[ouvert.Phase || PHASE_DEFAUT] += (maintenant - ouvert.Debut) / 60;
  const vendus = phasesDe(lot, 'Vendu_phases', 'Jours_vendus');
  // Les corrections ne font passer sous zéro ni une phase ni le total.
  const reel = cles.reduce((t, k) => t + Math.max(0, reels[k]), 0);
  const venduJ = cles.reduce((t, k) => t + vendus[k], 0);
  const vendu = venduJ * minParJour;
  const ratio = vendu > 0 ? reel / vendu : (reel > 0 ? Infinity : 0);
  const depasse = ratio > 1;
  const echelle = Math.max(vendu, reel) || 1;
  let statut = 'Aucun jour vendu';
  if (vendu > 0) {
    if (depasse) statut = `Dépassement de ${ecart(reel - vendu, minParJour)}`;
    else if (ratio > 0.85) statut = `Attention, reste ${ecart(vendu - reel, minParJour)}`;
    else statut = `Reste ${ecart(vendu - reel, minParJour)} sur le vendu`;
  }
  let etat = 'ok';
  if (depasse) etat = 'depasse';
  else if (ratio > 0.85) etat = 'attention';
  const detail = cles.length > 1 && PHASES.filter((p) => reels[p.cle] > 0).length > 1
    ? PHASES.filter((p) => reels[p.cle] > 0).map((p) => ` · ${p.nom} ${hm(reels[p.cle])}`).join('')
    : '';
  return {
    reelMin: reel,
    venduJ,
    venduTxt: `${nbJours(venduJ)} vendus`,
    infoTxt: `Réel ${hm(reel)} sur ${hm(vendu)} vendues${vendu > 0 ? ` (${Math.round(ratio * 100)} %)` : ''}${detail}`,
    reelTxt: jours(reel, minParJour),
    parts: parPhase((p) => (cles.includes(p.cle) ? Math.round((Math.max(0, reels[p.cle]) / echelle) * 1000) / 10 : 0)),
    repere: depasse ? Math.round((vendu / echelle) * 1000) / 10 : 100,
    statut,
    etat,
  };
}

function segmentsDeSession(temps, ouvert, parId, maintenant) {
  let session = ouvert ? ouvert.Session : null;
  if (session == null) {
    const dernier = temps.filter((r) => r.Session).sort((a, b) => b.Debut - a.Debut)[0];
    session = dernier ? dernier.Session : null;
  }
  if (session == null) return [];
  const lignes = temps.filter((r) => r.Session === session).sort((a, b) => a.Debut - b.Debut);
  const depart = lignes.length ? lignes[0].Debut : 0;
  return lignes.map((r, i) => ({
    num: i + 1,
    libelle: libelleLot(parId.get(r.Lot)),
    note: `${nomPhase(r.Phase)} · ${r.Note || (r.Fin ? 'Sans note' : 'En cours')}`,
    duree: estCorrection(r) ? `−${hms(r.Debut - r.Fin)}` : hms(fin(r, maintenant) - r.Debut),
    a: r.Fin ? `à ${hms(r.Fin - depart)}` : 'maintenant',
    ouvert: !r.Fin,
  })).reverse();
}

function vueJour(temps, maintenant, minParJour) {
  const depuis = minuit(maintenant);
  const total = Math.max(0, temps.reduce((s, r) => s + minutesDepuis(r, depuis, maintenant), 0));
  const reste = minParJour - total;
  return {
    totalTxt: hm(total),
    pct: Math.min(100, Math.round((total / minParJour) * 100)),
    message: reste > 0 ? `Encore ${hm(reste)} pour une journée pleine.` : 'Journée complète. Belle séance !',
  };
}

const heureTxt = (sec) => new Date(sec * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Temps d'un jour (minuit `jour`), du plus récent au plus ancien, avec leur plage horaire. */
export function entreesDuJour(temps, parId, maintenant, jour = minuit(maintenant)) {
  const lendemain = minuit(jour + 36 * 3600);
  return temps
    .filter((r) => r.Debut && r.Debut < lendemain && (estCorrection(r) ? r.Debut >= jour : fin(r, maintenant) > jour))
    .sort((a, b) => b.Debut - a.Debut)
    .map((r) => ({
      id: r.id,
      libelle: libelleLot(parId.get(r.Lot)),
      note: `${nomPhase(r.Phase)} · ${r.Note || (r.Fin ? 'Sans note' : 'En cours')}`,
      plage: estCorrection(r) ? `Correction, ${heureTxt(r.Debut)}` : `${heureTxt(r.Debut)} – ${r.Fin ? heureTxt(r.Fin) : 'en cours'}`,
      duree: estCorrection(r) ? `−${hm((r.Debut - r.Fin) / 60)}` : hm(minutesEntre(r, jour, lendemain, maintenant)),
      correction: estCorrection(r),
    }));
}

function minutesEntre(r, de, a, maintenant) {
  return Math.max(0, Math.min(fin(r, maintenant), a) - Math.max(r.Debut, de)) / 60;
}

/**
 * @param {{lots: object[], temps: object[]}} donnees  lignes Grist
 * @param {number} maintenant  secondes
 * @param {number|string|null} choix  lot choisi quand le chrono est arrêté
 * @param {number|null} jourVu  minuit du jour dont on liste les temps (aujourd'hui par défaut)
 * @param {{ mission?: number|null, phase?: string, vuePhase?: string, minParJour?: number }} options  mission affichée
 *   (sinon celle de la prestation courante), phase choisie pour le chrono, phase suivie à droite ('tout' ou une clé)
 */
export function construireVue(donnees, maintenant, choix, jourVu = null, options = {}) {
  const { mission = null, client = null, phase = PHASE_DEFAUT, vuePhase = 'tout', minParJour = MIN_PAR_JOUR } = options;
  const suivie = PHASES.some((p) => p.cle === vuePhase) ? vuePhase : 'tout';
  const cles = suivie === 'tout' ? PHASES.map((p) => p.cle) : [suivie];
  const { lots, temps } = donnees;
  const parId = new Map(lots.map((l) => [l.id, l]));
  const ouvert = segmentOuvert(temps);
  const actifs = lots.filter((l) => !l.Termine);
  const lotCourant = ouvert ? ouvert.Lot : (parId.has(choix) ? choix : actifs[0]?.id ?? null);
  const session = ouvert ? temps.filter((r) => r.Session === ouvert.Session) : [];
  const depart = session.reduce((m, r) => Math.min(m, r.Debut), ouvert ? ouvert.Debut : 0);
  const phaseCourante = ouvert ? ouvert.Phase || PHASE_DEFAUT : phase;
  return {
    enCours: Boolean(ouvert),
    ouvert,
    lotCourant,
    phaseCourante,
    phases: PHASES.map((p) => ({ cle: p.cle, nom: p.nom, choisie: p.cle === phaseCourante })),
    vuePhase: suivie,
    vuesPhase: [{ cle: 'tout', nom: 'Tout' }, ...PHASES].map((p) => ({ cle: p.cle, nom: p.nom, choisie: p.cle === suivie })),
    libelleCourant: lotCourant ? `${libelleLot(parId.get(lotCourant))} · ${nomPhase(phaseCourante)}` : 'Aucune prestation',
    horloge: ouvert ? hms(maintenant - depart) : hms(0),
    ...parMission(actifs, donnees.missions, parId.get(lotCourant), { mission, client }, (l) => ({
      id: l.id,
      nom: l.Nom || 'Sans nom',
      lotTxt: l.Lot_txt || '',
      choisi: l.id === lotCourant,
      ...etatLot(l, ouvert, maintenant, minParJour, cles),
    }), minParJour),
    segments: segmentsDeSession(temps, ouvert, parId, maintenant),
    jour: vueJour(temps, maintenant, minParJour),
    jourVu: jourVu ?? minuit(maintenant),
    jourVuTxt: libelleJour(jourVu ?? minuit(maintenant), maintenant),
    entrees: entreesDuJour(temps, parId, maintenant, jourVu ?? minuit(maintenant)),
    tousLots: lots.map((l) => ({
      id: l.id, libelle: libelleLot(l), mission: libelleMission(l), court: [l.Nom || 'Sans nom', l.Lot_txt].filter(Boolean).join(' · '),
      termine: Boolean(l.Termine),
    })),
  };
}

const libelleMission = (l) => [l.Client_nom, l.Mission_nom].filter(Boolean).join(' · ');

/**
 * Un client puis une de ses missions, et les prestations de celle qu'on regarde, rangées par lot (les titres de lot
 * n'apparaissent que si la mission en a plusieurs), avec le total de la mission. Toutes les missions comptent, même
 * sans ligne de devis ; sans la liste des missions, elles se déduisent des prestations.
 * Mission vue : celle choisie, sinon la première du client choisi, sinon celle de la prestation courante.
 */
function parMission(actifs, toutes, courant, choix, versLot, minParJour) {
  const missions = toutes?.length ? toutes.map((m) => ({ ...m })) : [];
  for (const l of actifs) {
    if (!missions.some((m) => m.id === l.Mission)) missions.push({ id: l.Mission, Nom: l.Mission_nom, Client_nom: l.Client_nom });
  }
  const cleClient = (m) => m.Client_nom || '';
  const avecPrestations = (m) => actifs.some((l) => l.Mission === m.id);
  const duClient = (c) => missions.filter((m) => cleClient(m) === c);
  let vue = missions.find((m) => m.id === choix.mission);
  if (!vue && choix.client != null) vue = duClient(choix.client).find(avecPrestations) || duClient(choix.client)[0];
  if (!vue) vue = missions.find((m) => m.id === courant?.Mission) || missions.find(avecPrestations) || missions[0];
  const client = vue ? cleClient(vue) : '';
  const lots = actifs.filter((l) => l.Mission === vue?.id).map(versLot);
  const titres = [...new Set(lots.map((l) => l.lotTxt))];
  const reel = lots.reduce((t, l) => t + l.reelMin, 0);
  const vendu = lots.reduce((t, l) => t + l.venduJ, 0);
  return {
    clients: [...new Set(missions.map(cleClient))].map((c) => ({ id: c, libelle: c || 'Sans client', choisi: c === client })),
    missions: duClient(client).map((m) => ({ id: m.id, libelle: m.Nom, choisie: m.id === vue?.id })),
    missionVue: vue?.id,
    missionTxt: vue ? [vue.Client_nom, vue.Nom].filter(Boolean).join(' · ') : '',
    lots,
    groupes: titres.map((t) => ({ titre: titres.length > 1 ? t || 'Sans lot' : '', lots: lots.filter((l) => l.lotTxt === t) })),
    totalMission: { reelTxt: jours(reel, minParJour), venduTxt: `${nbJours(vendu)} vendus` },
  };
}

/** Jours consécutifs avec du temps saisi, en finissant aujourd'hui (ou hier si rien encore aujourd'hui). */
export function serie(temps, maintenant) {
  const jours = new Set(temps.filter((r) => r.Debut).map((r) => minuit(r.Debut)));
  let jour = minuit(maintenant);
  if (!jours.has(jour)) jour = minuit(jour - 43200);
  let n = 0;
  while (jours.has(jour)) {
    n += 1;
    jour = minuit(jour - 43200);
  }
  return n;
}

/** « Aujourd’hui », « Hier » ou « lundi 16 novembre ». */
export function libelleJour(jour, maintenant) {
  const auj = minuit(maintenant);
  if (jour === auj) return 'Aujourd’hui';
  if (jour === minuit(auj - 43200)) return 'Hier';
  return new Date(jour * 1000).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
