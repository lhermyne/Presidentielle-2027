# Mesures et validations du modèle

Ce document consigne ce qui a été mesuré, sur quelles données, et ce qui ne l'a pas été.
Tout se rejoue avec les scripts du dossier `backtest/` ; les données sont dans `data/historique/`.

## Données historiques

| Jeu | Contenu | Source | Licence |
|---|---|---|---|
| `sources/pollsposition-tour1.csv` | Sondages de premier tour par camp, présidentielles 1965 à 2017, et résultats | github.com/pollsposition/data | MIT |
| `sources/pollsposition-2017.json` | Sondages 2017 des cinq dernières semaines (dates corrigées de 2021 en 2017) | github.com/pollsposition/data | MIT |
| `sources/nsppolls-2022.csv` | 409 enquêtes par candidat, juin 2020 à avril 2022, deux tours | github.com/nsppolls/nsppolls | MIT |
| `wikipedia-2017.json`, `wikipedia-2022.json` | Consultations quotidiennes des articles des candidats | API Wikimedia Pageviews | CC0 |

Les résultats officiels viennent du Conseil constitutionnel.

## 1. Erreur des sondages selon l'échéance

`python backtest/echeance.py`. Écart entre la moyenne des sondages à J-h et le résultat du premier tour,
présidentielles 2002 à 2022 (camps jusqu'en 2017, candidats en 2022), scores au-dessus de 8 %.

| Échéance | Écart quadratique moyen (points) |
|---|---|
| J-1 | 3,3 (2,3 avec une mémoire de 5 jours) |
| J-30 | 4,8 |
| J-90 | 6,2 |
| J-150 | 6,0 |
| J-300 | 6,4 |

Retenu dans le modèle (`HORIZON_SPREAD`) : écart-type de 2,1 points la veille et de 6,8 points à long
terme, avec une montée sur 75 jours, proportionnel au score sous 10 %, loi log-normale.
Les intervalles à 90 % ainsi construits contiennent 91 % des résultats passés (162 cas à plus de 90 jours).
Limites : cinq scrutins seulement ; le calage et la vérification portent sur les mêmes données.

Second tour : écart de 2,2 à 4,8 points entre les sondages du duel et le résultat, sur 2017 et 2022
seulement. Retenu : 3,5 points (`RUNOFF_HORIZON_SPREAD`). Deux scrutins ne suffisent pas à valider ce chiffre.

Mémoire des sondages : 21 jours est le meilleur réglage pour prédire le sondage suivant en 2026
(erreur moyenne de 1,17 point). Près du scrutin, une mémoire plus courte fait mieux (non encore appliqué).

## 2. Wikipédia

`python backtest/wikipedia.py`. La dynamique des consultations (7 derniers jours face aux 28 précédents)
annonce l'évolution des sondages des semaines suivantes, en 2017 comme en 2022.

| Horizon | Pente | Observations |
|---|---|---|
| 14 jours | +0,06 | 300 |
| 28 jours | +0,10 | 268 |

L'effet reste présent une fois retirée la tendance passée des sondages, et la campagne 2026 donne
+0,08 à 28 jours. La force utilisée dans le modèle (×1, soit 0,10) correspond à cette mesure.
Limites : les observations hebdomadaires se recouvrent, ce qui surestime la significativité ;
la corrélation reste faible (environ 0,3).

## 3. Baromètre des réseaux

`node backtest/soutiens.mjs && python backtest/barometre.py`. Aucun historique sur les élections passées :
le test porte sur la seule campagne 2026 (18 dates, juin à octobre).

| Mesure | Résultat |
|---|---|
| Pente à 28 jours, tous candidats | +0,0046 par ‰ |
| Pente sans David Lisnard | +0,0026 par ‰ (corrélation 0,14) |

Le signal repose surtout sur un candidat. La pente robuste (0,0026) est proche de la force utilisée (×2, soit 0,002).
Social Blade : la collecte automatique de son site est interdite par ses conditions ; son API est payante
(1 à 5 crédits par profil et par plateforme) et ne remonte qu'à la première consultation de chaque profil. Non utilisé.

## 4. Reports de voix

`node backtest/reports.mjs`. Matrice par camp dans `model/transfers.mjs`, d'après les enquêtes Ipsos du jour du vote.

| Scrutin | Duel | Reports mesurés (vers le premier, vers le second, sans choix) |
|---|---|---|
| Présidentielle 2022 | Macron et Le Pen | Mélenchon 42 / 17 / 41 · Jadot 65 / 6 / 29 · Pécresse 53 / 18 / 29 · Zemmour 10 / 73 / 17 |
| Présidentielle 2017 | Macron et Le Pen | Mélenchon 52 / 7 / 41 · Hamon 71 / 2 / 27 · Fillon 48 / 20 / 32 · Dupont-Aignan 27 / 30 / 43 |
| Législatives 2024 | Ensemble et RN | Gauche 72 / 3 / 25 · LR 53 / 25 / 22 |
| Législatives 2024 | LR et RN | Gauche 70 / 2 / 28 · Ensemble 79 / 4 / 17 |
| Législatives 2024 | Gauche hors LFI et RN | Ensemble 54 / 15 / 31 · LR 29 / 34 / 37 |
| Législatives 2024 | LFI et RN | Ensemble 43 / 19 / 38 · LR 26 / 38 / 36 |

Vérification : la matrice reconstitue le second tour 2022 à 1,6 point près et celui de 2017 à 2,3 points près.
Face aux duels sondés de 2026, elle surestime le barrage contre Marine Le Pen (écart moyen de 7,7 points,
12 points pour le duel avec Jean-Luc Mélenchon). Le modèle cale donc les reports sur les duels sondés et
n'utilise la matrice que pour les duels jamais sondés, avec l'erreur mesurée en retirant chaque duel à son tour.
Deux cases ne sont pas mesurées et sont signalées comme hypothèses dans le fichier.

## 5. Polymarket

Aucun historique exploitable pour une présidentielle passée. Pour 2027, l'historique quotidien complet de chaque
marché est désormais conservé (`data/historique/polymarket/`, victoire depuis le 14 novembre 2025) : il permettra
de tester si les mouvements du marché précèdent ceux des sondages. Le marché n'est plus converti en score :
il repondère les simulations selon ses probabilités (victoire, places, qualification).
Sa force reste un réglage, non validé.

## Ce qui reste à faire

- Corriger les biais propres à chaque institut (Cluster17 : −3,7 points sur Le Pen en 2026).
- Raccourcir la mémoire des sondages à l'approche du scrutin.
- Simuler plusieurs listes de candidats selon le marché « sur le bulletin ».
- Suivre chaque nuit l'erreur de la prévision face aux nouveaux sondages.
