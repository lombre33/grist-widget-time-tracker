// Petits outils DOM, sans bibliothèque.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Crée un élément : el('button', { class: 'x', 'data-action': 'y' }, 'Texte', autreEl). */
export function el(tag, attrs = {}, ...enfants) {
  const svg = ['svg', 'circle', 'path', 'g'].includes(tag);
  const n = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'texte') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const e of enfants.flat()) {
    if (e == null || e === false) continue;
    n.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return n;
}

/** Icône au trait (chemins SVG 24 × 24). */
export function icone(d, { plein = false, taille = 20 } = {}) {
  return el('svg', {
    width: taille, height: taille, viewBox: '0 0 24 24', 'aria-hidden': 'true',
    fill: plein ? 'currentColor' : 'none', stroke: plein ? 'none' : 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, el('path', { d }));
}

/** Lit « lots.2.reelTxt » dans un objet. */
export function valeurChemin(objet, chemin) {
  return chemin.split('.').reduce((o, k) => (o == null ? undefined : o[k]), objet);
}

/**
 * Met à jour sans reconstruire : textes [data-live], largeurs [data-live-w] (en %),
 * états [data-live-etat] et anneau [data-live-anneau] (pourcentage).
 */
export function rafraichirVivant(racine, vue) {
  racine.querySelectorAll('[data-live]').forEach((n) => {
    const v = valeurChemin(vue, n.dataset.live);
    if (v !== undefined && n.textContent !== String(v)) n.textContent = v;
  });
  racine.querySelectorAll('[data-live-w]').forEach((n) => {
    const v = valeurChemin(vue, n.dataset.liveW);
    if (v !== undefined) n.style.width = `${v}%`;
  });
  racine.querySelectorAll('[data-live-etat]').forEach((n) => {
    const v = valeurChemin(vue, n.dataset.liveEtat);
    if (v !== undefined) n.dataset.etat = v;
  });
  racine.querySelectorAll('[data-live-anneau]').forEach((n) => {
    const pct = Number(valeurChemin(vue, n.dataset.liveAnneau)) || 0;
    const c = 2 * Math.PI * Number(n.getAttribute('r'));
    n.setAttribute('stroke-dasharray', `${(c * pct) / 100} ${c}`);
    n.style.opacity = pct > 0 ? '1' : '0'; // un trait vide laisserait un point (bout arrondi)
  });
}
