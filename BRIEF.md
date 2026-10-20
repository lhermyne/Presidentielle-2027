# L'Hermyne : observatoire de la présidentielle 2027

## Confirmé par l'utilisateur, 20 octobre 2026
- Projet indépendant de PatriBot. GitHub Pages et mises à jour autonomes sur GitHub.
- Tests locaux seulement pendant le développement ; aucun PC nécessaire en production.
- Prévisions nationales à deux tours, sondages, historique du baromètre, Polymarket,
  intérêt pour Google Trends et les élections précédentes.
- Pondérations explorables dans le navigateur et référence prudente.
- Historique complet du baromètre déjà publié sur GitHub Pages.

## Périmètre de la première version
Collecte réelle de sondages, quatre historiques sociaux et marchés publics.
Configurations électorales issues des sondages, jamais fusionnées arbitrairement.
Simulation du premier tour, probabilités de qualification, duels et bornes de victoire
lorsque certains duels manquent. Sources, méthode, export et scénarios partageables.
Référence à trois poids 73/20/7 : sondages/Polymarket/Google Trends,
total 100 %, redistribution proportionnelle. Baromètre hors de ces 100 %, multiplicateur indépendant ×0 à ×5. Les sondages restent le socle électoral ;
baromètre = bonus/malus de dynamique, Polymarket = anticipation de victoire finale.
Une dynamique seule ne devient pas une intention de vote.
Paramètres d'incertitude explicitement heuristiques, modèle non calibré.
Google Trends : collecte automatique du RSS public des recherches en forte hausse.
Aucun effet si moins de deux candidats identifiés ; accès comparatif alpha non disponible.
Pas de compte utilisateur, base de données, serveur, génération d'images ni API d'IA.

## Recherche et benchmark
Sources consultées le 20 octobre 2026 :
- https://sondages2027.fr/ : configuration, dates et nombre de mesures visibles.
- https://repere2027.fr/ : provenance des chiffres et séparation premier/second tour.
- https://sondax.fr/donnees.html : CSV documenté, licence CC BY-SA 4.0 et attribution.
- https://www.lemonde.fr/resultats-presidentielle-2022/ : hiérarchie des résultats,
  comparaison des candidats et séparation des tours (consultation textuelle).
- https://yougov.co.uk/politics : enquêtes d'opinion et contexte (consultation web).
- https://www.datawrapper.de/ : graphiques lisibles, légendes et sources.
- https://observablehq.github.io/plot/ : graphiques construits à partir d'échelles.
- https://ourworldindata.org/democracy : explication, définitions et traçabilité.
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://vite.dev/guide/static-deploy.html : base relative pour un dépôt Pages.
- https://developers.google.com/search/apis/trends : accès alpha sur candidature.
- https://docs.polymarket.com/market-data/discover-markets : données publiques.

Limites de recherche : Europe Elects, Politico, FT et Reuters non accessibles depuis
l'outil web ; The Economist exigeait un accès. Aucun audit visuel de ces pages n'est revendiqué.
Les règles de recherche orientées commerces du skill OverFlo sont adaptées à un
outil de données : pas de photos d'illustration ni de parcours commercial artificiel.

## Sources techniques vérifiées
- Baromètre : https://lhermyne.github.io/L_Hermyne/data/{platform}_history.json
  (instagram, twitter, tiktok, facebook), JSON par date/accounts/followers.
- Sondages : https://sondax.fr/donnees/sondages-presidentielle-2027.csv
  découvert via le catalogue data.gouv.fr, configurations explicites et dates de terrain.
- Polymarket : https://gamma-api.polymarket.com/events?slug=next-french-presidential-election
  événement national, prix de victoire inconditionnels, distincts des scores électoraux.

## Incertitudes et suites
Nom de dépôt et URL publique finaux inconnus : base relative et aucune URL inventée.
Liste officielle des candidats non supposée connue. Pas de probabilité de candidature
automatique. Les scénarios sont conditionnels à une liste testée dans les sondages.
Il reste à calibrer sur des archives de campagnes antérieures, vérifier l'erreur commune
des instituts et évaluer prospectivement les signaux sociaux. Les résultats historiques
ne sont pas utilisés comme un pourcentage arbitraire des intentions de vote actuelles.

## Précision de l’utilisateur : nature des sources
La première place de David Lisnard en dynamique ne prédit pas une victoire. Reprendre
la formule de dynamique du baromètre, borner les corrections autour des sondages.
Les prix Polymarket portent sur la victoire finale : agir sur les trajectoires de victoire,
puis éventuellement sur le premier tour par repondération, sans conversion prix/voix.

## Boost relatif proposé et retenu
Appliquer la dynamique en ‰ à la propre part sondée du candidat, avec amplification ×3
par défaut (60 ‰ → +18 % relatif avec ×3). Mesurer depuis le dernier terrain
compatible, date de publication indisponible, et repartir du socle à chaque calcul.
Plafond de sensibilité ±50 % relatif, facteur réglable de ×0 à ×5, méthode non calibrée.

## Correction explicite : baromètre indépendant
Retirer le poids social du budget de 100 %. Conserver un seul curseur pour le baromètre,
réglant directement ×0 à ×5, défaut ×3. Formule : score en ‰ / 1 000 × multiplicateur,
sans facteur de poids ni effet des indisponibilités des autres sources.
