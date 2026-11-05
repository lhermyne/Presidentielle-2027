# L'Hermyne · Présidentielle 2027

Observatoire national expérimental, autonome, conçu pour **GitHub Pages + GitHub Actions**.
Aucun import de PatriBot, aucun serveur permanent, aucun PC allumé en production.

Dépôt dédié : https://github.com/lhermyne/Presidentielle-2027

Publication GitHub Pages : https://lhermyne.github.io/Presidentielle-2027/

La collecte et la publication quotidiennes s’exécutent dans le workflow
[Actualisation et publication](https://github.com/lhermyne/Presidentielle-2027/actions/workflows/daily-pages.yml).

## Ce qui fonctionne

- Collecte du CSV public de sondages Sondax et de ses configurations exactes.
- Collecte des quatre historiques publics du baromètre et conservation des observations.
- Collecte directe des prix, spreads et liquidités publics de Polymarket.
- Collecte du flux public Google Trends France, dédoublonnage et archivage quotidien.
- Collecte des consultations Wikipédia (API Wikimedia gratuite, sans clé) de chaque personnalité.
- Simulation reproductible du premier tour, fréquence de présence parmi les deux premiers,
  duels sondés et bornes de victoire lorsqu'un duel manque.
- Laboratoire : cinq curseurs indépendants (0 à 100, sondages ≥ 1), parts d’influence affichées,
  source sans signal verrouillée, répartition de base, 100 % sondages, configuration, mémoire et incertitude.
- Projections : premier tour, qualification, score au second tour et victoire.
- Effet de chaque source vérifiable par candidat, dynamique brute, calcul dans un Web Worker.
- Liens de scénarios partageables, export JSON, pages Sources et Méthode.
- Thème sombre par défaut, thème clair au choix ; bloc « L’essentiel » en tête de page.
- Workflow quotidien : collecte, contrôles, archivage Git, build et publication Pages.

**Le modèle n'est pas encore calibré sur les campagnes précédentes.** Ses probabilités
sont celles d'un scénario à paramètres heuristiques, pas une prévision validée.
Les sources conservent leur rôle : les sondages donnent le socle électoral, la dynamique
du baromètre apporte des bonus/malus bornés, Polymarket ajuste les trajectoires de
victoire finale. Aucun classement social ni prix de victoire n’est converti en part de voix.
Google Trends utilise les recherches en forte hausse, avec une couverture politique
intermittente ; ce n’est pas une série comparative de toutes les recherches Google.

## Structure autonome

```text
front-end/             React, React Router, Tailwind CSS et ressources locales
model/                 moteur JavaScript partagé navigateur / Node
pipeline/              collecte et normalisation Python, sans dépendance tierce
scripts/               calcul de référence, préparation du build, résumé CI
data/latest.json       dernière photographie normalisée des données
data/forecast.json     référence calculée
data/cache/            derniers succès par source, conservés dans Git
data/archive/DATE/     observations et prévision de chaque journée
tests/                 contrôles scientifiques et contrôles des connecteurs
.github/workflows/     actualisation et publication autonomes
BRIEF.md / DESIGN.md   cadrage et direction, selon les conventions OverFlo
```

Le dossier complet constitue la racine du dépôt dédié. Il peut être déplacé seul.
Les seules références à l'ancien baromètre sont ses URL publiques et les crédits des
portraits copiés ; aucune lecture du dossier du bot n'existe à l'exécution.
La contrainte GitHub Pages remplace volontairement Docker/Caddy et le backend Go des
projets OverFlo classiques. Le frontend reprend React, React Router, JavaScript et Tailwind.
Le routage utilise un hash pour supporter les liens directs sur Pages, sans serveur de repli.

## Tester localement

Prérequis : Node 24 (ou >=22.12), npm et Python >=3.12.
Les observations réelles et le lockfile sont inclus. Depuis la racine du projet :

```sh
npm ci
npm run dev
```

Ouvrir l'adresse annoncée, normalement `http://127.0.0.1:5197/`.
La première commande de build prépare les JSON publics ; si nécessaire avant `dev` :

```sh
node scripts/prepare-public.mjs
```

Actualisation complète et vérifications :

```sh
python pipeline/collect.py
npm run forecast
npm test
python -m unittest discover -s tests -p "test_*.py"
npm run build
npm run preview
```

L'aperçu de production utilise `http://127.0.0.1:4197/`.
Pour recalculer sans réseau : `python pipeline/collect.py --offline`, puis `npm run forecast`.
La collecte affiche alors explicitement des statuts de cache. Aucun secret n'est requis.
Une absence de donnée n'est jamais convertie en zéro.

## Déploiement GitHub et réinstallation

Le dépôt `lhermyne/Presidentielle-2027` et GitHub Pages sont configurés sur le compte **lhermyne**.
La collecte et la publication sur ce compte ont été vérifiées le 20 octobre 2026.
Voir [le fonctionnement et les commandes de publication](docs/DEPLOIEMENT.md).
Les étapes suivantes permettent de réinstaller le projet dans un autre dépôt :

1. Créer un **dépôt dédié**, public si GitHub Free est utilisé, avec `main` comme branche
   par défaut. Mettre **le contenu de ce dossier à sa racine**, pas le dossier PatriBot.
   Inclure `.github/`, `data/`, les portraits et `package-lock.json`. Exclure `node_modules`,
   `dist`, `.env` et `output` via le `.gitignore` fourni.
2. Dans **Settings → Pages → Build and deployment → Source**, choisir **GitHub Actions**.
3. Autoriser les workflows du dépôt. Le workflow déclare les permissions nécessaires
   pour archiver les données et publier Pages, en utilisant le `GITHUB_TOKEN` éphémère
   fourni automatiquement par GitHub. Aucun token personnel à ajouter.
4. Dans **Actions**, exécuter **Actualisation et publication → Run workflow**.
5. Vérifier les étapes et ouvrir l'URL fournie par le job `deploy`.

L'exécution programmée est à **23:30 UTC chaque jour**, soit 00:30 en hiver et 01:30 en
été à Paris, juste après le baromètre (vers 00:15). Elle se déroule entièrement sur les serveurs GitHub. Les heures de départ
peuvent être retardées par GitHub. Les workflows planifiés d'un dépôt public peuvent
être désactivés après 60 jours sans activité : vérifier l'onglet Actions si la date du
site cesse d'avancer. L'archivage quotidien crée normalement une activité régulière.
Une règle de protection de `main` empêchant les commits automatiques nécessitera
d'adapter l'archivage à cette politique ; le workflow ne contourne pas ces protections.

Le workflow de publication ne se relance pas pour les commits contenant uniquement
les données. Un groupe de concurrence évite deux collectes/publications simultanées.
Les vérifications des pull requests utilisent les observations incluses sans accès réseau
aux sources. Aucun déploiement GitHub n'est effectué par les commandes de test locales.

Le site statique peut être publié sous n'importe quel nom de dépôt : les chemins du build
sont relatifs. Aucun domaine, compte GitHub ou nom de dépôt final n'est codé en dur.

## Comportement en cas d'incident

- Source disponible : format contrôlé, cache remplacé atomiquement, date et SHA-256 conservés.
- Source en échec avec cache : ancien succès conservé ; statut et date signalés sur le site.
- Source en échec sans cache : indisponible, aucun effet inventé. Son poids demandé
  est réaffecté au prorata des sources disponibles ; les deux répartitions sont affichées.
- Aucun sondage valide : sortie non nulle, dernière publication préservée.
- Données sociales de plus de trois jours : effet désactivé même avec un poids demandé.
- Flux Google disponible mais moins de deux candidats identifiés : signal inexploitable,
  poids utilisé nul ; absence du flux ne signifie pas absence d’intérêt.
- Pondération sans sondages : signaux bruts consultables, aucun score électoral fabriqué.
- Duels manquants : bornes explicites, pas de reports de voix déduits arbitrairement.

Les archives quotidiennes conservent la dernière collecte de chaque journée ; Git conserve
les révisions si plusieurs collectes sont commitées le même jour. Les caches sociaux
fusionnent les dates pour conserver l'historique même si la source le raccourcit ensuite.

## Méthode et reproductibilité

**Tous les sondages de premier tour** (120 jours, toutes listes) alimentent un modèle de choix
à deux niveaux (`fitSupport`) : poids de chaque camp politique, puis répartition dans le camp.
Un absent reporte ses voix d'abord dans son camp, au prorata. La liste par défaut (`field`) réunit
les candidats testés avec au moins 15 % sur le bulletin ou 1 % de victoire sur Polymarket ; chaque
liste réellement testée reste choisissable. Décroissance exponentielle (demi-vie 21 jours), poids
d'échantillon en racine carrée et atténuation des instituts fréquents. Pas de biais d'institut appris.

Depuis le 1er novembre 2026, **chaque source a un curseur indépendant** (0 à 100, baromètre de ×0 à ×5) :
sondages, baromètre, Polymarket, Wikipédia et Google Trends. Seule leur proportion compte
(sondages 100 et Polymarket 100 donnent 50 % chacun). Les sondages restent le socle :
leur curseur ne descend pas sous **1**. Une source sans signal exploitable pour la liste
choisie est **verrouillée** et sort du calcul des parts.
Référence : **sondages 100, Polymarket 50, baromètre ×2, Wikipédia ×1, Trends 10**, soit sans
Google Trends environ **48 % sondages, 24 % Polymarket, 19 % baromètre, 10 % Wikipédia**.
Mémoire des sondages 21 jours. Incertitude mesurée par candidat, sans réglage manuel : précision de la moyenne des sondages et bruit
irrégulier de chaque source sur la mémoire, en somme quadratique. Elle ne couvre pas les évolutions de campagne. « Sondages seuls » met toutes les autres sources à 0.
Les liens partagés avant ce changement (sans `poids-barometer`) reviennent à la référence.
La répartition est expérimentale, pas optimisée historiquement.

Le signal social reprend la formule autonome de dynamique pondérée du baromètre :
variation en ‰ × audience/max plateforme, moyenne entre plateformes pondérée par les
audiences relatives du candidat. **La fenêtre part du dernier sondage de chaque candidat**,
faute de date de publication dans le CSV, jusqu’au dernier relevé. Le relevé de départ
peut précéder le terrain de trois jours au maximum ; les dates réelles sont conservées.
Au moins deux plateformes récentes par candidat et deux candidats observés sont requis.
Le score hebdomadaire sur sept relevés reste un repère consultable séparément.

Le boost relatif est `dynamique / 1 000 × multiplicateur`, réglé directement de **×0 à ×5**
(×2 par défaut). Dans la barre d’influence, ×5 pèse autant qu’un curseur à 100.
À ×3, 60 ‰ donnent +18 % du propre score : **10 % devient 11,8 %
avant renormalisation** (11,2 % à ×2).
Sous 0,5 ‰ (5 % environ pour Wikipédia), une dynamique n'a pas d'effet. Pas de plafond brutal : les très
fortes variations sont comprimées en douceur, puis l’ensemble est renormalisé à 100 %.
Un nouveau terrain compatible réinitialise le point de départ. Chaque calcul repart du
socle sondé ; les boosts quotidiens ne sont pas composés plusieurs fois. Une dynamique
manquante n’entraîne aucune correction propre. Être premier en dynamique n’est pas
être favori électoral. Fenêtre, facteur et plafond restent des hypothèses à calibrer.

Wikipédia : API publique Wikimedia Pageviews, consultations humaines quotidiennes de
l’article en français de chaque personnalité. Seule l’évolution compte :
`log(moyenne 7 derniers jours / moyenne des 21 précédents)`, au moins 30 vues/jour en
référence, série de moins de trois jours. Comme le baromètre, c’est un bonus ou malus
relatif : `évolution × 0,1 × multiplicateur` (×1 par défaut), avec compression douce des très gros pics.
Une consultation n’est pas une intention de vote.

Google Trends : RSS public France, titres contenant le nom complet d’un candidat,
volumes minimums, dédoublonnage titre/date, fenêtre 28 jours et demi-vie 7 jours.
Au moins deux candidats identifiés et une collecte de moins de trois jours sont requis.
La correction est relative : `signal centré borné à ±1 × part de Google Trends`. Elle ne mesure pas
l’adhésion. L’accès public de comparaison a renvoyé HTTP 429 ; l’API comparative officielle
reste en alpha sur invitation (vérifié le 1er novembre 2026). Aucun contournement n’est implémenté.

16 000 trajectoires reproductibles avec une graine fixe : premier tour autour du socle
corrigé (scores positifs, total 100 %), puis sondages de second tour par paire exacte.
Les duels non documentés conservent des bornes de victoire, sans reports inventés.
Avant les simulations, le score est tiré vers la cible du marché (victoire finale pour moitié, places
cumulées pour l'autre moitié) selon `1 − (1 − part de Polymarket)²`, sans dépasser le prix de victoire. Le marché de la victoire déplace aussi les duels : l'écart entre son prix
et la fréquence de victoire simulée et l'élan du baromètre et de Wikipédia déplacent le score du duel, qui peut basculer. Après les
simulations, la qualification repondère les trajectoires, pour les candidats cotés ayant au moins dix occurrences simulées
(au moins deux candidats comparables). Le rapport prix relatif/fréquence de victoire est plafonné à
[0,05 ; 20], puis élevé à la puissance `poids marché / 100`. Les multiplicateurs sont
normalisés pour conserver la masse des trajectoires comparées. Les autres trajectoires
restent inchangées. Les prix bruts, le sous-ensemble comparé et la taille effective des
tirages sont conservés pour audit. Le premier tour et la qualification peuvent évoluer
indirectement puisque les moyennes sont recalculées sur les trajectoires repondérées.
Cette fusion est une sensibilité heuristique, pas une calibration bayésienne démontrée :
les univers de candidature diffèrent et les marchés peuvent déjà incorporer les sondages.

Les intervalles sont les quantiles pondérés à 5 et 95 %. Le moteur du navigateur et
celui de GitHub Actions sont identiques. Les scripts de collecte/calcul sont déterministes
hors données téléchargées, sans IA et sans saisie manuelle quotidienne des sondages.
Sondax est un agrégateur public de résultats d’instituts, pas une API gouvernementale ;
l’automatisation dépend de l’actualisation et de la disponibilité des sources amont.

Le paramètre `--as-of` sert uniquement à filtrer les terrains pour examiner les données.
Il ne reconstitue pas ce qui était réellement publié à cette date : ce n'est **pas** un
backtest, notamment parce que les corrections rétrospectives et dates de publication ne
sont pas encore archivées en profondeur. Un lien partagé utilise les données courantes ;
un export JSON inclut les observations exactes et les réglages du scénario.

## Sources et attributions

- **Sondax, d'après Wikipédia** : https://sondax.fr/donnees.html et
  https://sondax.fr/donnees/sondages-presidentielle-2027.csv.
  Données sous **CC BY-SA 4.0** ; les données dérivées de sondages conservent cette licence
  et l'attribution. Voir `data/LICENSE.md`. Chaque observation renvoie au document de l'institut.
- **Baromètre L'Hermyne** : https://lhermyne.github.io/L_Hermyne/monitor_dashboard.html,
  fichiers `data/{instagram,twitter,tiktok,facebook}_history.json` du même site.
- **Polymarket** : https://polymarket.com/event/next-french-presidential-election,
  lecture publique de Gamma. Les montants et prix sont bruts, avec leur date de capture.
- **Google Trends** : https://trends.google.com/trending/rss?geo=FR ; flux public
  « Trending Now », distinct de l’API comparative alpha. Les observations quotidiennes
  sont conservées dans `data/cache/google-trends.json` et les archives.
- **Wikipédia** : https://wikimedia.org/api/rest_v1/metrics/pageviews/ ; API Pageviews de la
  Wikimedia Foundation, gratuite et sans clé, données CC0. Séries dans `data/cache/wikipedia.json`.
- **Polymarket, marchés complémentaires** : vainqueur du premier tour, 2e et 3e place,
  qualification au second tour, présence sur le bulletin (API Gamma, `data/cache/polymarket-*.json`).
  Les lignes de remplissage (« Candidate A », « Other ») sont écartées. Les quatre premiers
  repondèrent les simulations ; le dernier est consultatif.
- **Portraits** : ressources existantes du baromètre fournies dans le projet utilisateur ;
  leur réutilisation publique reste soumise aux droits des images d'origine.

## Étapes scientifiques suivantes

1. Réunir les sondages historiques et leur disponibilité réelle à chaque date.
2. Calibrer les erreurs et leurs corrélations, puis mesurer la couverture des intervalles.
3. Tester prospectivement si le baromètre anticipe des variations au-delà des sondages.
4. Intégrer participation, solidité du choix et reports publiés lorsqu'ils sont disponibles.
5. Obtenir un accès comparatif Google Trends officiel et comparer au signal Wikipédia.
6. Évaluer YouTube Data API (gratuite avec clé en secret GitHub). X est payant à l’usage,
   la recherche Bluesky refuse les appels anonymes et GDELT a renvoyé des réponses vides
   (essais du 1er novembre 2026). Éviter de doubler des signaux d’attention corrélés.

Avant ces vérifications, conserver la mention expérimentale et ne pas présenter le mélange de référence comme validé.
