// Écrans du widget. Les gestes remontent par data-action ; main.js les traite.

import { el, icone, rafraichirVivant } from './dom.js';

const I = {
  jouer: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  flamme: 'M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z',
  plus: 'M12 5v14M5 12h14',
  table: 'M3 5h18v14H3zM3 10h18M9 10v9',
};

const dateDuJour = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function entete(serie) {
  return el('header', { class: 'entete' },
    el('div', {},
      el('h1', { texte: 'Suivi du temps' }),
      el('p', { class: 'discret', texte: dateDuJour() })),
    serie ? el('span', { class: 'pastille' }, icone(I.flamme), serie) : null);
}

function puces(vue) {
  return el('div', { class: 'puces' }, vue.lots.map((l) => el('button', {
    type: 'button', class: 'puce', 'data-action': 'lot', 'data-lot': l.id, 'aria-pressed': l.choisi ? 'true' : 'false',
  },
  el('span', { class: 'puce-ctx', texte: l.contexte || ' ' }),
  el('span', { class: 'puce-nom', texte: l.nom }))));
}

function segments(vue) {
  if (!vue.segments.length) {
    return el('p', { class: 'vide' }, vue.enCours
      ? 'Change de lot pour marquer un temps intermédiaire.'
      : 'Démarre le chrono. Chaque changement de lot crée un temps intermédiaire.');
  }
  return el('ol', { class: 'segments', reversed: true }, vue.segments.map((s, i) => el('li', { class: s.ouvert ? 'ouvert' : '' },
    el('span', { class: 'num', texte: s.num }),
    el('div', { class: 'seg-txt' },
      el('span', { class: 'fort', texte: s.libelle }),
      el('span', { class: 'discret', texte: s.note })),
    el('div', { class: 'seg-temps' },
      el('span', { class: 'fort chiffres', 'data-live': `segments.${i}.duree`, texte: s.duree }),
      el('span', { class: 'discret chiffres', texte: s.a })))));
}

function minuteur(vue) {
  return el('section', { class: 'carte minuteur', 'aria-label': 'Chronomètre' },
    el('div', { class: 'ligne-titre' },
      el('h2', { class: 'surtitre', texte: 'Sur quoi tu travailles' }),
      el('span', { class: 'discret petit', texte: vue.enCours ? 'Change de lot pour marquer un milestone' : 'Choisis un lot puis démarre' })),
    vue.lots.length ? puces(vue) : el('p', { class: 'vide', texte: 'Aucun lot actif. Ajoute ton premier lot plus bas.' }),
    el('div', { class: 'chrono' },
      el('div', { class: 'courant' },
        vue.enCours ? el('span', { class: 'point-vivant', 'aria-hidden': 'true' }) : null,
        el('span', { class: 'discret', texte: vue.libelleCourant })),
      el('div', { class: 'horloge chiffres', 'data-live': 'horloge', role: 'timer', texte: vue.horloge }),
      el('button', {
        type: 'button', class: `bouton-principal${vue.enCours ? ' en-cours' : ''}`, 'data-action': 'basculer',
        disabled: !vue.lotCourant,
      }, icone(vue.enCours ? I.stop : I.jouer, { plein: true }), vue.enCours ? 'Arrêter et enregistrer' : 'Démarrer')),
    el('div', { class: 'zone-note' },
      el('label', { for: 'note', class: 'surtitre', texte: 'Note sur ce que tu fais' }),
      el('input', {
        id: 'note', type: 'text', autocomplete: 'off', disabled: !vue.enCours,
        placeholder: vue.enCours ? 'Optionnelle, enregistrée avec le segment en cours' : 'Disponible pendant le chrono',
        value: vue.ouvert?.Note || '',
      })),
    el('div', { class: 'liste-segments' }, segments(vue)));
}

function carteJour(vue) {
  return el('section', { class: 'carte sombre jour', 'aria-label': 'Aujourd’hui' },
    el('svg', { class: 'anneau', viewBox: '0 0 124 124', 'aria-hidden': 'true' },
      el('circle', { cx: 62, cy: 62, r: 52, class: 'anneau-fond' }),
      el('circle', { cx: 62, cy: 62, r: 52, class: 'anneau-plein', 'data-live-anneau': 'jour.pct', transform: 'rotate(-90 62 62)' })),
    el('div', { class: 'jour-txt' },
      el('span', { class: 'surtitre', texte: 'Aujourd’hui' }),
      el('span', { class: 'jour-total' },
        el('span', { class: 'chiffres', 'data-live': 'jour.totalTxt', texte: vue.jour.totalTxt }),
        el('span', { class: 'jour-sur', texte: ' / 7 h' })),
      el('span', { class: 'jour-msg', 'data-live': 'jour.message', texte: vue.jour.message })));
}

function carteLots(vue) {
  return el('section', { class: 'carte' },
    el('div', { class: 'ligne-titre' },
      el('h2', { texte: 'Vendu vs réel, par lot' }),
      el('span', { class: 'discret petit', texte: '1 jour = 7 h' })),
    vue.lots.map((l, i) => el('div', { class: 'lot', 'data-live-etat': `lots.${i}.etat`, 'data-etat': l.etat },
      el('div', { class: 'lot-tete' },
        el('span', {}, el('span', { class: 'fort', texte: l.nom }), el('span', { class: 'discret', texte: l.contexte ? ` · ${l.contexte}` : '' })),
        el('span', { class: 'chiffres' },
          el('strong', { 'data-live': `lots.${i}.reelTxt`, texte: l.reelTxt }),
          el('span', { class: 'discret', texte: ` / ${l.venduTxt}` }))),
      el('div', { class: 'barre', role: 'presentation' },
        el('div', { class: 'barre-base', 'data-live-w': `lots.${i}.base` }),
        el('div', { class: 'barre-depasse', 'data-live-w': `lots.${i}.depasse` })),
      el('span', { class: 'lot-statut', 'data-live': `lots.${i}.statut`, texte: l.statut }))));
}

function carteEntrees(vue) {
  return el('section', { class: 'carte entrees' },
    el('h2', { texte: 'Entrées du jour' }),
    vue.entrees.length
      ? el('ul', {}, vue.entrees.map((e, i) => el('li', {},
        el('div', { class: 'seg-txt' }, el('span', { class: 'fort', texte: e.libelle }), el('span', { class: 'discret', texte: e.note })),
        el('span', { class: 'fort chiffres', 'data-live': `entrees.${i}.duree`, texte: e.duree }))))
      : el('p', { class: 'vide', texte: 'Rien encore aujourd’hui.' }));
}

function champ(id, libelle, attrs = {}) {
  return el('div', { class: 'champ' },
    el('label', { for: id, texte: libelle }),
    el('input', { id, name: id, type: 'text', autocomplete: 'off', ...attrs }));
}

function formulaireLot(donnees, ouvert, erreur) {
  const clients = el('datalist', { id: 'liste-clients' }, donnees.clients.map((c) => el('option', { value: c.Nom || '' })));
  const projets = el('datalist', { id: 'liste-projets' }, donnees.projets.map((p) => el('option', { value: p.Nom || '' })));
  return el('details', { class: 'carte nouveau-lot', open: ouvert },
    el('summary', {}, icone(I.plus), 'Nouveau lot'),
    el('form', { 'data-action': 'creer-lot', novalidate: true },
      clients, projets,
      el('div', { class: 'grille-champs' },
        champ('f-client', 'Client', { list: 'liste-clients', required: true }),
        champ('f-projet', 'Projet', { list: 'liste-projets', required: true }),
        champ('f-lot', 'Lot ou phase', { required: true, placeholder: 'Maquettes' }),
        champ('f-jours', 'Jours vendus', { inputmode: 'decimal', required: true, placeholder: '4' })),
      erreur ? el('p', { class: 'erreur', role: 'alert', texte: erreur }) : null,
      el('div', { class: 'actions' },
        el('button', { type: 'submit', class: 'bouton' }, 'Ajouter le lot'),
        el('span', { class: 'discret petit' }, 'Le client et le projet sont créés s’ils n’existent pas. Tu peux tout modifier dans les tables Grist.'))));
}

/** Écran principal. */
export function principal(racine, vue, donnees, etat) {
  const focus = document.activeElement?.id;
  const saisie = focus === 'note' ? document.activeElement.value : null;
  racine.replaceChildren(
    entete(etat.serie),
    el('div', { class: 'grille' },
      minuteur(vue),
      el('div', { class: 'colonne' }, carteJour(vue), carteLots(vue), carteEntrees(vue))),
    formulaireLot(donnees, etat.formulaireOuvert, etat.erreurFormulaire));
  rafraichirVivant(racine, vue);
  if (focus === 'note' && !racine.querySelector('#note').disabled) {
    const n = racine.querySelector('#note');
    n.value = saisie;
    n.focus();
  }
}

export const vivant = rafraichirVivant;

/** Écran d'installation : ce que le widget va créer, et le bouton qui le fait. */
export function installation(racine, plan, erreur) {
  const lignes = [
    ...plan.tables.map((t) => `Table ${t}`),
    ...plan.colonnes.map((c) => `Colonne ${c.col.id} dans ${c.table}`),
  ];
  racine.replaceChildren(el('section', { class: 'carte installation' },
    el('h1', {}, icone(I.table), ' Préparer le document'),
    el('p', { texte: 'Le suivi du temps range ses données dans des tables de ce document. Il va créer :' }),
    el('ul', {}, lignes.map((l) => el('li', { texte: l }))),
    el('p', { class: 'discret', texte: 'Rien d’existant n’est modifié ni supprimé. Les calculs (durées, réel par lot, écart) sont des formules Grist que tu peux lire et réutiliser.' }),
    erreur ? el('p', { class: 'erreur', role: 'alert', texte: erreur }) : null,
    el('button', { type: 'button', class: 'bouton-principal', 'data-action': 'installer' }, 'Créer les tables')));
}

/** Message plein écran (chargement, accès manquant, erreur). */
export function message(racine, titre, texte) {
  racine.replaceChildren(el('section', { class: 'carte installation' }, el('h1', { texte: titre }), texte ? el('p', { texte }) : null));
}
