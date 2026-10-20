# Publication autonome sur GitHub

Compte de destination confirmé le 20 octobre 2026 : **lhermyne**.
La connexion de ce compte et la publication finale restent à vérifier.

- Dépôt cible : https://github.com/lhermyne/Presidentielle-2027
- Site cible : https://lhermyne.github.io/Presidentielle-2027/
- Branche prévue : `main`.
- GitHub Pages : mode **GitHub Actions**.
- Workflow : `.github/workflows/daily-pages.yml`.

Le workflow définit une collecte quotidienne à 05:17 UTC : 06:17 en hiver,
07:17 en été à Paris. GitHub peut retarder le démarrage.
Il installe les dépendances, exécute les 30 tests, récupère les sources publiques,
recalcule la référence, archive les données dans Git et publie le site statique.
Aucun PC, bot Discord, modèle d’IA ou token personnel stocké dans le dépôt n’est requis.
Les permissions déclarées utilisent le `GITHUB_TOKEN` éphémère de GitHub Actions.

Les sources sont Sondax, les historiques Instagram/X/TikTok/Facebook,
Polymarket et le flux Google Trends. Un flux disponible ne signifie pas forcément
qu’il existe un signal exploitable pour les candidats retenus.

## Après activation

Dans Actions, ouvrir **Actualisation et publication** puis **Run workflow** sur `main`
pour actualiser manuellement. Les dates et statuts figurent sur la page Sources et
dans le résumé de l’exécution. Une erreur conserve le dernier cache valide ; sans
socle sondé exploitable, la publication préserve le dernier site valide.

Pour développer : récupérer d’abord les commits automatiques de données avec
`git pull --ff-only`, puis modifier, tester, commiter et pousser vers `main`.
Un push de code déclenche la publication. Les modifications portant uniquement
sur les données, les documents ou le README ne redéclenchent pas le site.

Le serveur `http://127.0.0.1:4197/` reste un aperçu local de test.
