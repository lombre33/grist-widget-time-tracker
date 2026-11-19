# Suivi du temps : widget Grist

Chronomètre le temps passé sur les prestations de tes missions clients et le compare aux jours vendus.
Widget personnalisé pour [Grist](https://www.getgrist.com/), sans framework ni étape de construction.

## Ce qu'il fait

- **Chrono en direct** sur une prestation. Changer de prestation pendant le chrono ferme le segment et en ouvre un autre :
  c'est le milestone, avec son temps intermédiaire.
- **Note** optionnelle sur le segment en cours.
- **Vendu vs réel** par prestation, en jours de 7 h, avec alerte à 85 % et dépassement en orange.
- **Journée** : temps du jour sur 7 h, série de jours d'affilée.
- **Entrées** jour par jour, avec **saisie et correction à la main** (oubli de lancer ou d'arrêter le chrono) :
  ajouter, modifier, supprimer (avec confirmation). Une durée seule suffit (0,25 = 15 min, ou 1h30) : le temps se
  place après le dernier de la journée. Une durée négative (-0,5) retire du temps : c'est une correction (fin avant
  le début dans `Time_tracking`, `Duree_min` négative). Une fin vide (sans durée) relance le chrono depuis l’heure de début.
- Au survol d’une barre « vendu vs réel », le temps en heures.
- Ordinateur et téléphone (une colonne sous 760 px), clair et sombre.

Le chrono vit dans la table `Time_tracking` (une ligne avec un début et sans fin) : il survit à la fermeture de
l'onglet et se voit d'un appareil à l'autre (rafraîchi au retour sur l'onglet, ou toutes les 30 s).

## Branché sur la gestion client

Le widget lit les tables du document de gestion client et n'y change rien :

| Table | Colonnes lues | Rôle |
| --- | --- | --- |
| `CLIENTS` | `Nom` | nom du client affiché sur chaque prestation |
| `MISSIONS` | `numero`, `Client` (`date` pour l'ordre) | la mission d'une prestation |
| `DEVIS` | `Mission`, `prestations`, `Lots` | une prestation suivie = une ligne de devis (`Lots` s'affiche en contexte) |
| `Table1` | `Missions`, `heures` | nom de la prestation et vendu (heures, 7 h = 1 j) |

Il écrit seulement dans `Time_tracking` : au premier lancement, il y ajoute (avec ton accord) les colonnes
`Devis` (la ligne de devis), `Debut`, `Fin`, `Note`, `Session`, et les formules `Duree_min`,
`Mission` et `Prestation` (pour tes résumés Grist par mission ou par prestation). Les colonnes déjà là (`A`, `B`, `C`…)
restent. Si `Time_tracking` n'existe pas, il la crée.

## Installation dans Grist

1. Ajoute une vue « Widget personnalisé » et colle `https://lombre33.github.io/grist-widget-time-tracker/`.
2. Règle l'accès sur **Accès complet au document**.
3. Au premier lancement, accepte « Préparer Time_tracking ».

## Développement

```sh
npm test                    # tests unitaires (logique pure)
npm run test:navigateur     # parcours complet dans Chromium avec un faux Grist (Playwright requis)
```

- `js/format.js`, `js/schema.js`, `js/modele.js`, `js/session.js`, `js/saisie.js`, `js/vue.js` : logique pure, testée.
- `js/grist.js` : seul module qui parle à Grist. `js/ui.js`, `js/dom.js` : affichage. `js/main.js` : gestes.
- Le faux Grist des essais calcule les formules à la main : il ne remplace pas un essai dans un vrai Grist.
  `test/grist/run-time-tracker.mjs` joue le parcours dans un vrai Grist (grist-static, labo de `grist-widget-GFS`) :
  structure de la gestion client, préparation de `Time_tracking`, prestations des devis, chrono, changement de prestation,
  rechargement en cours de chrono, saisie et correction à la main, formules de Grist.
- La politique de sécurité refuse les styles en ligne : le thème que Grist pousse dans le widget est ignoré
  (deux avertissements en console au chargement, sans effet), le widget a ses propres couleurs.

Licence : GPL 3.0.
