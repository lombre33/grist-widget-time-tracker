// Point d'entrée : charge, dessine, traite les gestes.

import * as G from './grist.js';
import { planifier, planVide, actionsDuPlan } from './schema.js';
import { segmentOuvert, demarrer, changer, arreter, noter } from './session.js';
import { construireVue, serie, minuit } from './vue.js';
import { valeursInitiales, actionsSaisie, actionSupprimer } from './saisie.js';
import { principal, installation, message, vivant } from './ui.js';

const racine = document.getElementById('app');
const alerte = document.getElementById('alerte');

const etat = {
  ecran: 'chargement',
  donnees: null,
  plan: null,
  choix: null,
  occupe: false,
  erreurInstallation: null,
  jourVu: null, // minuit du jour listé dans « Entrées » ; null = aujourd'hui
  saisie: null, // { valeurs, erreur, confirmer } quand la fenêtre de saisie est ouverte
};

const maintenant = () => Date.now() / 1000;
const vue = () => construireVue(etat.donnees, maintenant(), etat.choix, etat.jourVu);

function signaler(texte) {
  alerte.textContent = texte;
  alerte.hidden = !texte;
  if (texte) setTimeout(() => { if (alerte.textContent === texte) signaler(''); }, 6000);
}

function dessiner() {
  if (etat.ecran !== 'principal') return;
  const s = serie(etat.donnees.temps, maintenant());
  principal(racine, vue(), {
    serie: s >= 2 ? `${s} jours d’affilée` : null,
    saisie: etat.saisie,
  });
}

async function charger() {
  if (!(await G.accesComplet())) {
    etat.ecran = 'acces';
    message(racine, 'Accès complet nécessaire',
      'Dans le panneau de droite de Grist, règle l’accès du widget sur « Accès complet au document ».');
    return;
  }
  const plan = planifier(await G.lireStructure());
  if (plan.manquantes.length) {
    etat.ecran = 'manque';
    message(racine, 'Il manque des tables ou des colonnes',
      `Le suivi du temps lit ta gestion client et n’y trouve pas : ${plan.manquantes.join(', ')}.`);
    return;
  }
  if (!planVide(plan)) {
    etat.ecran = 'installation';
    etat.plan = plan;
    installation(racine, plan, etat.erreurInstallation);
    return;
  }
  etat.donnees = await G.lireDonnees();
  etat.ecran = 'principal';
  dessiner();
}

let rechargement = null;
function recharger() {
  clearTimeout(rechargement);
  rechargement = setTimeout(() => {
    if (!etat.occupe && !etat.saisie) charger().catch((e) => signaler(`Lecture impossible : ${e.message}`));
  }, 300);
}

async function agir(actions, avant = () => {}) {
  if (!actions.length || etat.occupe) return false;
  etat.occupe = true;
  try {
    await G.appliquer(actions);
    avant();
    etat.donnees = await G.lireDonnees();
    return true;
  } catch (e) {
    console.error(e);
    signaler(`Enregistrement impossible : ${e.message}`);
    return false;
  } finally {
    etat.occupe = false;
    dessiner();
  }
}

function surLot(id) {
  const ouvert = segmentOuvert(etat.donnees.temps);
  if (ouvert) return agir(changer(ouvert, id, maintenant()));
  etat.choix = id;
  dessiner();
  return null;
}

function basculer() {
  const ouvert = segmentOuvert(etat.donnees.temps);
  if (ouvert) return agir(arreter(ouvert, maintenant()));
  const lot = vue().lotCourant;
  return lot ? agir(demarrer(lot, maintenant())) : null;
}

async function installer() {
  try {
    await G.installer(actionsDuPlan(etat.plan));
    etat.erreurInstallation = null;
  } catch (e) {
    etat.erreurInstallation = e.message;
  }
  await charger();
}

// ----- Saisie et correction à la main

const ligneTemps = (id) => etat.donnees.temps.find((r) => r.id === Number(id)) || null;

function ouvrirSaisie(id) {
  const ligne = id ? ligneTemps(id) : null;
  etat.saisie = { valeurs: valeursInitiales(ligne, etat.jourVu ?? minuit(maintenant()), vue().lotCourant), erreur: null, confirmer: false };
  dessiner();
}

function fermerSaisie() {
  etat.saisie = null;
  dessiner();
}

function lireSaisie(form) {
  const val = (n) => form.querySelector(`[name="${n}"]`).value;
  return { id: etat.saisie.valeurs.id, lot: val('s-lot'), date: val('s-date'), debut: val('s-debut'), fin: val('s-fin'), note: val('s-note') };
}

async function enregistrerSaisie(form) {
  const valeurs = lireSaisie(form);
  const r = actionsSaisie(valeurs, { temps: etat.donnees.temps, ligne: valeurs.id ? ligneTemps(valeurs.id) : null });
  if (r.erreur) {
    etat.saisie = { valeurs, erreur: r.erreur, confirmer: false };
    dessiner();
    return;
  }
  etat.saisie = null;
  if (!(await agir(r.actions))) etat.saisie = { valeurs, erreur: 'Enregistrement impossible, réessaie.', confirmer: false };
  dessiner();
}

async function supprimerSaisie(form) {
  if (!etat.saisie.confirmer) {
    etat.saisie = { valeurs: lireSaisie(form), erreur: null, confirmer: true };
    dessiner();
    return;
  }
  const ligne = ligneTemps(etat.saisie.valeurs.id);
  etat.saisie = null;
  await agir(actionSupprimer(ligne));
}

function changerJour(sens) {
  const auj = minuit(maintenant());
  const jour = minuit((etat.jourVu ?? auj) + sens * 86400 + 43200); // midi du jour visé : sûr aux changements d’heure
  etat.jourVu = jour >= auj ? null : jour;
  dessiner();
}

const GESTES = {
  lot: (c) => surLot(Number(c.dataset.lot)),
  basculer: () => basculer(),
  installer: () => installer(),
  'jour-prec': () => changerJour(-1),
  'jour-suiv': () => changerJour(1),
  'ajouter-temps': () => ouvrirSaisie(null),
  modifier: (c) => ouvrirSaisie(c.dataset.id),
  'annuler-saisie': () => fermerSaisie(),
  'supprimer-temps': (c) => supprimerSaisie(c.closest('form')),
};

racine.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (ev.target.dataset.action === 'enregistrer-temps') enregistrerSaisie(ev.target);
});

// Échap ferme la fenêtre : on oublie la saisie pour qu'elle ne revienne pas au prochain dessin.
racine.addEventListener('cancel', (ev) => {
  if (ev.target.classList?.contains('fenetre')) {
    ev.preventDefault();
    fermerSaisie();
  }
}, true);

racine.addEventListener('click', (ev) => {
  const cible = ev.target.closest('[data-action]');
  if (!cible || cible.tagName === 'FORM') return;
  GESTES[cible.dataset.action]?.(cible);
});

racine.addEventListener('change', (ev) => {
  if (ev.target.id !== 'note') return;
  agir(noter(segmentOuvert(etat.donnees.temps), ev.target.value.trim()));
});

// Chaque seconde : l'horloge et les compteurs, sans reconstruire l'écran.
setInterval(() => {
  if (etat.ecran === 'principal' && segmentOuvert(etat.donnees.temps)) vivant(racine, vue());
}, 1000);

// Un chrono lancé sur un autre appareil apparaît ici au retour sur l'onglet, ou au plus tard après 30 s.
document.addEventListener('visibilitychange', () => { if (!document.hidden) recharger(); });
setInterval(() => { if (!document.hidden) recharger(); }, 30000);

if (!window.grist) {
  message(racine, 'À ouvrir dans Grist',
    'Ajoute cette page comme widget personnalisé dans un document Grist (adresse de la page, accès complet).');
} else {
  G.brancher(recharger);
  charger().catch((e) => message(racine, 'Erreur au chargement', e.message));
}
