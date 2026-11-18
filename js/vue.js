// Construit ce que l'écran affiche à partir des lignes Grist et de l'heure. Fonctions pures.

import { MIN_PAR_JOUR, hms, hm, jours, nbJours, ecart } from './format.js';
import { segmentOuvert } from './session.js';

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
export function minutesDepuis(r, depuis, maintenant) {
  if (!r.Debut) return 0;
  return Math.max(0, fin(r, maintenant) - Math.max(r.Debut, depuis)) / 60;
}

export function libelleLot(lot) {
  if (!lot) return 'Lot supprimé';
  const contexte = [lot.Client_nom, lot.Projet_nom].filter(Boolean).join(' · ');
  return contexte ? `${lot.Nom || 'Sans nom'} · ${contexte}` : lot.Nom || 'Sans nom';
}

function etatLot(lot, ouvert, maintenant, minParJour) {
  const vivant = ouvert && ouvert.Lot === lot.id ? (maintenant - ouvert.Debut) / 60 : 0;
  const reel = (Number(lot.Reel_min) || 0) + vivant;
  const vendu = (Number(lot.Jours_vendus) || 0) * minParJour;
  const ratio = vendu > 0 ? reel / vendu : (reel > 0 ? Infinity : 0);
  const depasse = ratio > 1;
  const base = depasse ? (vendu / reel) * 100 : ratio * 100;
  let statut = 'Aucun jour vendu';
  if (vendu > 0) {
    if (depasse) statut = `Dépassement de ${ecart(reel - vendu, minParJour)}`;
    else if (ratio > 0.85) statut = `Attention, reste ${ecart(vendu - reel, minParJour)}`;
    else statut = `Reste ${ecart(vendu - reel, minParJour)} sur le vendu`;
  }
  let etat = 'ok';
  if (depasse) etat = 'depasse';
  else if (ratio > 0.85) etat = 'attention';
  return {
    reelTxt: jours(reel, minParJour),
    base: Math.round(base * 10) / 10,
    depasse: depasse ? Math.round((100 - base) * 10) / 10 : 0,
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
    note: r.Note || (r.Fin ? 'Sans note' : 'En cours'),
    duree: hms(fin(r, maintenant) - r.Debut),
    a: r.Fin ? `à ${hms(r.Fin - depart)}` : 'maintenant',
    ouvert: !r.Fin,
  })).reverse();
}

function vueJour(temps, maintenant, minParJour) {
  const depuis = minuit(maintenant);
  const total = temps.reduce((s, r) => s + minutesDepuis(r, depuis, maintenant), 0);
  const reste = minParJour - total;
  return {
    totalTxt: hm(total),
    pct: Math.min(100, Math.round((total / minParJour) * 100)),
    message: reste > 0 ? `Encore ${hm(reste)} pour une journée pleine.` : 'Journée complète. Belle séance !',
  };
}

function entreesDuJour(temps, parId, maintenant) {
  const depuis = minuit(maintenant);
  return temps
    .filter((r) => r.Debut && fin(r, maintenant) > depuis)
    .sort((a, b) => b.Debut - a.Debut)
    .map((r) => ({
      libelle: libelleLot(parId.get(r.Lot)),
      note: r.Note || (r.Fin ? 'Sans note' : 'En cours'),
      duree: hm(minutesDepuis(r, depuis, maintenant)),
    }));
}

/**
 * @param {{lots: object[], temps: object[]}} donnees  lignes Grist
 * @param {number} maintenant  secondes
 * @param {number|null} choix  lot choisi quand le chrono est arrêté
 */
export function construireVue(donnees, maintenant, choix, minParJour = MIN_PAR_JOUR) {
  const { lots, temps } = donnees;
  const parId = new Map(lots.map((l) => [l.id, l]));
  const ouvert = segmentOuvert(temps);
  const actifs = lots.filter((l) => !l.Termine);
  const lotCourant = ouvert ? ouvert.Lot : (parId.has(choix) ? choix : actifs[0]?.id ?? null);
  const session = ouvert ? temps.filter((r) => r.Session === ouvert.Session) : [];
  const depart = session.reduce((m, r) => Math.min(m, r.Debut), ouvert ? ouvert.Debut : 0);
  return {
    enCours: Boolean(ouvert),
    ouvert,
    lotCourant,
    libelleCourant: lotCourant ? libelleLot(parId.get(lotCourant)) : 'Aucun lot',
    horloge: ouvert ? hms(maintenant - depart) : hms(0),
    lots: actifs.map((l) => ({
      id: l.id,
      nom: l.Nom || 'Sans nom',
      contexte: [l.Client_nom, l.Projet_nom].filter(Boolean).join(' · '),
      venduTxt: `${nbJours(l.Jours_vendus)} vendus`,
      choisi: l.id === lotCourant,
      ...etatLot(l, ouvert, maintenant, minParJour),
    })),
    segments: segmentsDeSession(temps, ouvert, parId, maintenant),
    jour: vueJour(temps, maintenant, minParJour),
    entrees: entreesDuJour(temps, parId, maintenant),
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
