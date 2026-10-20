# Vérification du 20 octobre 2026 — version 0.3

## Données et modèle

- Collecte réelle réussie : CSV Sondax, quatre historiques du baromètre,
  API Gamma Polymarket, RSS public Google Trends France. Aucun appel d’IA.
- 276 groupes sondage/configuration, 27 personnalités, zéro groupe rejeté.
- Configuration initiale : 4 enquêtes compatibles, 14 candidats, 16 000 trajectoires.
- Trois poids demandés 73/20/7 (sondages/Polymarket/Google Trends), total 100 % ;
  poids retenus 78,49/21,51/0 %, Google RSS ne contenant aucun candidat exploitable.
  Le baromètre est hors du budget ; son multiplicateur reste exactement ×3.
- Baromètre : formule de dynamique pondérée reprise sans import du bot.
  Fenêtre électorale ancrée sur la fin du dernier terrain compatible ; période et
  relevés exacts conservés. Repère hebdomadaire présenté séparément.
- Boost relatif ×3 par défaut, curseur ×0 à ×5, indépendant de toute pondération des autres sources.
  Exemple vérifié : 60 ‰ ×2 transforme 10 % en 11,2 % avant
  renormalisation ; aucune conversion en douze points de vote.
- À la collecte actuelle, Lisnard : +59,56 ‰ sur le repère hebdomadaire,
  +11,56 ‰ depuis le terrain du 19 octobre ; boost relatif +3.47 %, soit
  +0.166 point sur son socle de 4.775 %, puis renormalisation à 4.885 %.
  Ce n’est pas un score de victoire : le calcul conserve les duels manquants.
- Polymarket repondère les trajectoires avec gagnant documenté, sans convertir
  les prix en intentions de vote. Effet actif dans la référence réelle.
- `npm test` : 20 tests réussis (répartitions, exclusions de source, corrections,
  influence du marché, probabilités cohérentes, données manquantes/futures,
  boost relatif, remise à zéro après sondage, multiplicateur ×0 à ×5 indépendant
  des poids et des pannes, migration des anciens réglages à quatre sources).
- Python unittest : 10 tests réussis (CSV, cache, dates, formule du baromètre,
  fenêtre entre sondages, RSS, dédoublonnage et absence de faux zéros).
- `npm run forecast` et `npm run build` : réussis, Vite 8.3.4.

## Interface

- Vue d’ensemble, Sources, Méthode et ancre de méthode vérifiées dans le navigateur.
- Premier tour, qualification et victoire vérifiés sur les données réelles.
- Préréglage 100 % sondages : poids 100/0/0, boost inchangé ; ×0 le désactive.
- Un seul curseur baromètre, affiché hors du groupe à 100 % ; aucun poids social.
- Classement de dynamique brute conservé dans le détail des sources.
- Curseurs de sources au clavier : redistribution exacte entre trois sources ; multiplicateur inchangé.
- Boost : valeurs ×0 et ×5 vérifiées au clavier, retour au défaut ×3.
- Amplification conservée au rechargement par le lien de scénario.
- Export téléchargé et relu : observations exactes, version du moteur et pondérations.
- Détail du socle, dynamique en ‰, boost relatif, points, renormalisation et résultat.
- Rendus ordinateur 1440 px, tablette 768 px, mobile 390 et 360 px : aucune
  largeur globale débordante observée. Les grands tableaux défilent localement.
- Les tests antérieurs de base Pages sous `/presidentielle-2027/` ont confirmé le
  chargement relatif des observations, du Web Worker et des portraits.

## Revue d’interface

Règles relues : https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

Contrôles natifs nommés, sorties associées aux curseurs, focus visible, tableaux
avec en-têtes, régions défilantes accessibles au clavier, états d’erreur avec action,
annonces de calcul, mouvement réduit, ressources locales et icônes décoratives masquées.
La revue de code et de rendu n’est pas une certification WCAG ou un score Lighthouse.

## Destination GitHub

- Compte confirmé par l’utilisateur : **lhermyne**, exclusivement.
- Dépôt cible : https://github.com/lhermyne/Presidentielle-2027
- Site cible : https://lhermyne.github.io/Presidentielle-2027/
- La publication sur ce compte reste à vérifier après sa connexion.
- Les contrôles locaux du modèle et du build restent valides.

## Limites restantes

- Pas de calibration historique : poids, plafond relatif ±50 %, facteur, erreurs et
  repondération du marché restent des hypothèses de sensibilité.
- Date de publication des sondages absente du CSV : fin du terrain utilisée
  explicitement comme approximation pour la fenêtre de dynamique.
- Google RSS mesure les recherches en hausse, pas toutes les recherches. Son
  signal peut rester inexploitable ; l’API comparative officielle n’est pas disponible.
- Les tendances X et les vues YouTube ne sont pas encore intégrées.
- Fraîcheur et exhaustivité dépendent des publications des sources amont.
