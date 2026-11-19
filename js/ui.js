// Écrans du widget. Les gestes remontent par data-action ; main.js les traite.

import { el, icone, rafraichirVivant } from './dom.js';

const I = {
  jouer: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  flamme: 'M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z',
  table: 'M3 5h18v14H3zM3 10h18M9 10v9',
  gauche: 'M15 18l-6-6 6-6',
  droite: 'M9 18l6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  crayon: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
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
  const puce = (l) => el('button', {
    type: 'button', class: 'puce', 'data-action': 'lot', 'data-lot': l.id, 'aria-pressed': l.choisi ? 'true' : 'false', texte: l.nom,
  });
  return el('div', { class: 'groupes' }, vue.groupes.map((g) => el('div', { class: 'groupe' },
    g.titre ? el('span', { class: 'groupe-titre', texte: g.titre }) : null,
    el('div', { class: 'puces' }, g.lots.map(puce)))));
}

/** Boutons à une seule valeur choisie (phases). */
function segmente(items, action, etiquette) {
  return el('div', { class: 'segmente', role: 'group', 'aria-label': etiquette }, items.map((p) => el('button', {
    type: 'button', 'data-action': action, 'data-phase': p.cle, 'aria-pressed': p.choisie ? 'true' : 'false',
  }, p.cle !== 'tout' ? el('span', { class: `pastille-phase phase-${p.cle}`, 'aria-hidden': 'true' }) : null, p.nom)));
}

/** Choix de la mission affichée, ou son nom quand il n'y en a qu'une. */
function choixMission(vue) {
  if (vue.missions.length < 2) return el('span', { class: 'discret petit', texte: vue.missionTxt });
  return el('select', { id: 'mission', class: 'choix-mission', 'aria-label': 'Mission' },
    vue.missions.map((m) => el('option', { value: m.id, selected: m.choisie, texte: m.libelle })));
}

function segments(vue) {
  if (!vue.segments.length) {
    return el('p', { class: 'vide' }, vue.enCours
      ? 'Change de prestation pour marquer un temps intermédiaire.'
      : 'Démarre le chrono. Chaque changement de prestation crée un temps intermédiaire.');
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
    el('h2', { class: 'surtitre', texte: 'Sur quoi tu travailles' }),
    // La phase d'abord, puis la mission et ses prestations (demandé dans cet ordre).
    segmente(vue.phases, 'phase', 'Phase'),
    choixMission(vue),
    vue.lots.length ? puces(vue) : el('p', { class: 'vide', texte: 'Aucune prestation : ajoute une ligne de devis avec sa mission et sa prestation (table DEVIS).' }),
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
      el('h2', { texte: 'Vendu vs réel' }),
      el('span', { class: 'discret petit', texte: vue.missionTxt })),
    segmente(vue.vuesPhase, 'vue-phase', 'Phase suivie'),
    el('div', { class: 'total-mission' },
      el('span', { class: 'discret', texte: 'Mission' }),
      el('span', { class: 'chiffres' },
        el('strong', { 'data-live': 'totalMission.reelTxt', texte: vue.totalMission.reelTxt }),
        el('span', { class: 'discret', texte: ` / ${vue.totalMission.venduTxt}` }))),
    vue.groupes.flatMap((g) => [
      g.titre ? el('span', { class: 'groupe-titre', texte: g.titre }) : null,
      ...g.lots.map((l) => ligneLot(l, vue.lots.indexOf(l))),
    ]));
}

function ligneLot(l, i) {
  return el('div', { class: 'lot', 'data-live-etat': `lots.${i}.etat`, 'data-etat': l.etat },
    el('div', { class: 'lot-tete' },
      el('span', { class: 'fort', texte: l.nom }),
      el('span', { class: 'chiffres' },
        el('strong', { 'data-live': `lots.${i}.reelTxt`, texte: l.reelTxt }),
        el('span', { class: 'discret', texte: ` / ${l.venduTxt}` }))),
    // Au survol (ou au toucher), le temps en heures.
    el('div', { class: 'barre-zone', role: 'img', tabindex: '0', 'data-info': l.infoTxt, 'data-live-info': `lots.${i}.infoTxt`, 'aria-label': l.infoTxt },
      el('div', { class: 'barre', role: 'presentation' },
        el('div', { class: 'remplissage' },
          Object.keys(l.parts).map((k) => el('div', { class: `part phase-${k}`, 'data-live-w': `lots.${i}.parts.${k}` }))),
        el('div', { class: 'barre-repere', 'data-live-left': `lots.${i}.repere` }))),
    el('span', { class: 'lot-statut', 'data-live': `lots.${i}.statut`, texte: l.statut }));
}

function carteEntrees(vue) {
  const estAujourdhui = vue.jourVuTxt === 'Aujourd’hui';
  return el('section', { class: 'carte entrees' },
    el('div', { class: 'ligne-titre' },
      el('h2', { texte: 'Entrées' }),
      el('div', { class: 'nav-jour' },
        el('button', { type: 'button', class: 'icone-btn', 'data-action': 'jour-prec', 'aria-label': 'Jour précédent' }, icone(I.gauche)),
        el('span', { class: 'jour-vu', texte: vue.jourVuTxt }),
        el('button', { type: 'button', class: 'icone-btn', 'data-action': 'jour-suiv', 'aria-label': 'Jour suivant', disabled: estAujourdhui }, icone(I.droite)))),
    vue.entrees.length
      ? el('ul', {}, vue.entrees.map((e, i) => el('li', {},
        el('div', { class: 'seg-txt' },
          el('span', { class: 'fort', texte: e.libelle }),
          el('span', { class: 'discret', texte: `${e.plage} · ${e.note}` })),
        el('span', { class: `fort chiffres${e.correction ? ' correction' : ''}`, 'data-live': `entrees.${i}.duree`, texte: e.duree }),
        el('button', { type: 'button', class: 'icone-btn', 'data-action': 'modifier', 'data-id': e.id, 'aria-label': `Modifier ${e.libelle}, ${e.plage}` }, icone(I.crayon, { taille: 18 })))))
      : el('p', { class: 'vide', texte: estAujourdhui ? 'Rien encore aujourd’hui.' : 'Aucun temps ce jour-là.' }),
    el('button', { type: 'button', class: 'bouton-secondaire', 'data-action': 'ajouter-temps' }, icone(I.plus, { taille: 18 }), 'Ajouter un temps'));
}

function champSaisie(id, libelle, attrs) {
  return el('div', { class: 'champ' }, el('label', { for: id, texte: libelle }), el('input', { id, name: id, ...attrs }));
}

/** Fenêtre de saisie ou de correction d'un temps. */
function fenetreSaisie(vue, saisie) {
  const v = saisie.valeurs;
  // Une liste par mission : le nom de la prestation suffit dans chaque option.
  const option = (l) => el('option', { value: l.id, selected: String(l.id) === String(v.lot), texte: l.court });
  const missions = [...new Set(vue.tousLots.map((l) => l.mission))];
  const options = missions.map((m) => el('optgroup', { label: m || 'Sans mission' }, vue.tousLots.filter((l) => l.mission === m).map(option)));
  return el('dialog', { class: 'fenetre', 'aria-labelledby': 'titre-saisie' },
    el('form', { 'data-action': 'enregistrer-temps', novalidate: true },
      el('h2', { id: 'titre-saisie', texte: v.id ? 'Corriger un temps' : 'Ajouter un temps' }),
      el('div', { class: 'champ' },
        el('label', { for: 's-lot', texte: 'Prestation' }),
        el('select', { id: 's-lot', name: 's-lot' }, el('option', { value: '', texte: '— Choisir une prestation —' }), options)),
      el('div', { class: 'grille-champs' },
        el('div', { class: 'champ' },
          el('label', { for: 's-phase', texte: 'Phase' }),
          el('select', { id: 's-phase', name: 's-phase' },
            vue.phases.map((p) => el('option', { value: p.cle, selected: p.cle === (v.phase || 'dev'), texte: p.nom })))),
        champSaisie('s-date', 'Date', { type: 'date', value: v.date })),
      champSaisie('s-duree', 'Durée (h)', { type: 'text', autocomplete: 'off', placeholder: '0,25', value: v.duree }),
      el('p', { class: 'discret petit', texte: 'En heures : 0,25 = 15 min, 1,5 ou 1h30 = 1 h 30, -0,5 retire 30 min. Sans heure de début, le temps se place après le dernier de la journée.' }),
      el('div', { class: 'grille-champs' },
        champSaisie('s-debut', 'Début (facultatif)', { type: 'time', value: v.debut }),
        champSaisie('s-fin', 'Fin (facultatif)', { type: 'time', value: v.fin })),
      champSaisie('s-note', 'Note', { type: 'text', value: v.note, autocomplete: 'off' }),
      saisie.erreur ? el('p', { class: 'erreur', role: 'alert', texte: saisie.erreur }) : null,
      el('div', { class: 'actions' },
        el('button', { type: 'submit', class: 'bouton' }, 'Enregistrer'),
        el('button', { type: 'button', class: 'bouton-secondaire', 'data-action': 'annuler-saisie' }, 'Annuler'),
        v.id ? el('button', { type: 'button', class: `bouton-danger${saisie.confirmer ? ' confirmer' : ''}`, 'data-action': 'supprimer-temps' },
          saisie.confirmer ? 'Confirmer la suppression' : 'Supprimer') : null)));
}

export function principal(racine, vue, etat) {
  const focus = document.activeElement?.id;
  const saisie = focus === 'note' ? document.activeElement.value : null;
  const fenetre = etat.saisie ? fenetreSaisie(vue, etat.saisie) : null;
  racine.replaceChildren(
    entete(etat.serie),
    el('div', { class: 'grille' },
      minuteur(vue),
      el('div', { class: 'colonne' }, carteJour(vue), carteLots(vue), carteEntrees(vue))),
    ...(fenetre ? [fenetre] : [])); // replaceChildren écrirait « null »
  rafraichirVivant(racine, vue);
  if (fenetre) {
    fenetre.showModal();
    (fenetre.querySelector('.erreur') ? fenetre.querySelector('#s-lot') : fenetre.querySelector(etat.saisie.valeurs.lot ? '#s-duree' : '#s-lot')).focus();
    return;
  }
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
    ...(plan.table ? ['La table Time_tracking'] : []),
    ...plan.colonnes.map((c) => `La colonne ${c.id} dans Time_tracking`),
  ];
  racine.replaceChildren(el('section', { class: 'carte installation' },
    el('h1', {}, icone(I.table), ' Préparer le document'),
    el('p', { texte: 'Le suivi du temps lit tes missions et tes devis, et range le temps dans la table Time_tracking. Il va créer :' }),
    el('ul', {}, lignes.map((l) => el('li', { texte: l }))),
    el('p', { class: 'discret', texte: 'Rien d’existant n’est modifié ni supprimé : les colonnes déjà là (A, B, C…) restent. La durée de chaque segment est une formule Grist.' }),
    erreur ? el('p', { class: 'erreur', role: 'alert', texte: erreur }) : null,
    el('button', { type: 'button', class: 'bouton-principal', 'data-action': 'installer' }, 'Préparer Time_tracking')));
}

/** Message plein écran (chargement, accès manquant, erreur). */
export function message(racine, titre, texte) {
  racine.replaceChildren(el('section', { class: 'carte installation' }, el('h1', { texte: titre }), texte ? el('p', { texte }) : null));
}
