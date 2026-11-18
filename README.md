# Suivi du temps : widget Grist

Chronomètre le temps passé sur les lots de tes projets clients et le compare aux jours vendus.
Widget personnalisé pour [Grist](https://www.getgrist.com/), sans framework ni étape de construction.

## Ce qu'il fait

- **Chrono en direct** sur un lot. Changer de lot pendant le chrono ferme le segment et en ouvre un autre :
  c'est le milestone, avec son temps intermédiaire.
- **Note** optionnelle sur le segment en cours.
- **Vendu vs réel** par lot, en jours de 7 h, avec alerte à 85 % et dépassement en orange.
- **Journée** : temps du jour sur 7 h, série de jours d'affilée, entrées du jour.
- **Nouveau lot** depuis le widget : le client et le projet sont créés s'ils n'existent pas.
- Ordinateur et téléphone (mise en page qui passe sur une colonne sous 760 px), clair et sombre.

Le chrono vit dans la table `Temps` (une ligne avec un début et sans fin) : il survit à la fermeture de l'onglet et
se voit d'un appareil à l'autre (rafraîchi au retour sur l'onglet, ou toutes les 30 s).

## Installation dans Grist

1. Ajoute une vue « Widget personnalisé » et colle l'adresse du site GitHub Pages de ce dépôt.
2. Règle l'accès sur **Accès complet au document**.
3. Au premier lancement, le widget propose de créer ses tables. Il ne modifie ni ne supprime rien d'existant.

## Tables créées

| Table | Colonnes saisies | Formules |
| --- | --- | --- |
| `Clients` | `Nom` | |
| `Projets` | `Nom`, `Client` | |
| `Lots` | `Nom`, `Projet`, `Jours_vendus`, `Termine` | `Client_nom`, `Projet_nom`, `Reel_min`, `Reel_j`, `Ecart_j` |
| `Temps` | `Lot`, `Debut`, `Fin`, `Note`, `Session` | `Duree_min` |

Un lot coché `Termine` disparaît du widget. Les formules restent utilisables dans tes propres vues et tableaux de synthèse.

## Développement

```sh
npm test                    # tests unitaires (logique pure)
npm run test:navigateur     # parcours complet dans Chromium avec un faux Grist (Playwright requis)
```

- `js/format.js`, `js/schema.js`, `js/session.js`, `js/vue.js`, `js/nouveau-lot.js` : logique pure, testée.
- `js/grist.js` : seul module qui parle à Grist. `js/ui.js`, `js/dom.js` : affichage. `js/main.js` : gestes.
- Le faux Grist des essais calcule les formules à la main : il ne remplace pas un essai dans un vrai Grist.

Licence : GPL 3.0.
