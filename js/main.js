// Point d'entrée : charge, dessine, traite les gestes.

import * as G from './grist.js';
import { planifier, planVide, actionsDuPlan } from './schema.js';
import { segmentOuvert, demarrer, changer, arreter, noter } from './session.js';
import { construireVue, serie } from './vue.js';
import { lireFormulaire, creerLot } from './nouveau-lot.js';
import { principal, installation, message, vivant } from './ui.js';

const racine = document.getElementById('app');
const alerte = document.getElementById('alerte');

const etat = {
  ecran: 'chargement',
  donnees: null,
  plan: null,
  choix: null,
  occupe: false,
  formulaireOuvert: false,
  erreurFormulaire: null,
  erreurInstallation: null,
};

const maintenant = () => Date.now() / 1000;
const vue = () => construireVue(etat.donnees, maintenant(), etat.choix);

function signaler(texte) {
  alerte.textContent = texte;
  alerte.hidden = !texte;
  if (texte) setTimeout(() => { if (alerte.textContent === texte) signaler(''); }, 6000);
}

function dessiner() {
  if (etat.ecran !== 'principal') return;
  const s = serie(etat.donnees.temps, maintenant());
  principal(racine, vue(), etat.donnees, {
    serie: s >= 2 ? `${s} jours d’affilée` : null,
    formulaireOuvert: etat.formulaireOuvert,
    erreurFormulaire: etat.erreurFormulaire,
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
    if (!etat.occupe) charger().catch((e) => signaler(`Lecture impossible : ${e.message}`));
  }, 300);
}

async function agir(actions) {
  if (!actions.length || etat.occupe) return;
  etat.occupe = true;
  try {
    await G.appliquer(actions);
    etat.donnees = await G.lireDonnees();
  } catch (e) {
    console.error(e);
    signaler(`Enregistrement impossible : ${e.message}`);
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

async function soumettreLot(form) {
  const champ = (n) => form.querySelector(`[name="${n}"]`).value;
  const f = lireFormulaire({ client: champ('f-client'), projet: champ('f-projet'), lot: champ('f-lot'), jours: champ('f-jours') });
  if (f.erreur) {
    etat.erreurFormulaire = f.erreur;
    dessiner();
    return;
  }
  etat.occupe = true;
  try {
    etat.choix = await creerLot(f, etat.donnees, G.appliquer);
    etat.erreurFormulaire = null;
    etat.formulaireOuvert = false;
    etat.donnees = await G.lireDonnees();
  } catch (e) {
    etat.erreurFormulaire = `Création impossible : ${e.message}`;
  } finally {
    etat.occupe = false;
    dessiner();
  }
}

racine.addEventListener('click', (ev) => {
  const cible = ev.target.closest('[data-action]');
  if (!cible || cible.tagName === 'FORM') return;
  const action = cible.dataset.action;
  if (action === 'lot') surLot(Number(cible.dataset.lot));
  else if (action === 'basculer') basculer();
  else if (action === 'installer') installer();
});

racine.addEventListener('submit', (ev) => {
  ev.preventDefault();
  soumettreLot(ev.target);
});

racine.addEventListener('change', (ev) => {
  if (ev.target.id !== 'note') return;
  agir(noter(segmentOuvert(etat.donnees.temps), ev.target.value.trim()));
});

racine.addEventListener('toggle', (ev) => {
  if (ev.target.classList?.contains('nouveau-lot')) etat.formulaireOuvert = ev.target.open;
}, true);

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
