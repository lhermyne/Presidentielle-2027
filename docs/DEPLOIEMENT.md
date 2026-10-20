# Publication autonome sur GitHub

Vérifiée le 20 octobre 2026.

- Dépôt public : https://github.com/OverFlo-dev/Presidentielle-2027
- Site : https://overflo-dev.github.io/Presidentielle-2027/
- Branche : `main`.
- Source GitHub Pages : **GitHub Actions**, HTTPS imposé.
- Workflow : https://github.com/OverFlo-dev/Presidentielle-2027/actions/workflows/daily-pages.yml
- Première publication réussie : https://github.com/OverFlo-dev/Presidentielle-2027/actions/runs/39492900873

## Fonctionnement quotidien

Le workflow est actif et programmé chaque jour à 05:17 UTC : 06:17 en hiver,
07:17 en été à Paris. GitHub peut retarder le démarrage.
Il installe les dépendances, exécute les 30 tests, récupère les sources publiques,
recalcule la référence, archive les données dans Git et publie le site statique.
Aucun PC, bot Discord, modèle d’IA ou token personnel stocké dans le dépôt n’est requis.
Les permissions déclarées utilisent le `GITHUB_TOKEN` éphémère de GitHub Actions.

Le premier passage a réellement collecté Sondax, les historiques Instagram/X/TikTok/Facebook,
Polymarket et le flux Google Trends, tous avec le statut `ok`. Un flux disponible ne
signifie pas forcément qu’il existe un signal exploitable pour les candidats retenus.

## Actualiser manuellement

Ouvrir le workflow ci-dessus, cliquer sur **Run workflow**, choisir `main` et lancer.
La date de collecte et les statuts sont visibles sur la page Sources du site et dans
le résumé de chaque exécution. Une erreur conserve le dernier cache valide ; sans
socle sondé exploitable, la publication s’arrête pour préserver le dernier site valide.

## Développer et publier une modification

Le dossier autonome est `F:/Patriote/l’hermyne/Presidentielle-2027` (l’apostrophe du nom
réel est une apostrophe droite). Récupérer d’abord les commits automatiques de données
avec `git pull --ff-only`, puis modifier, tester, commiter et pousser vers `main`.
Un push de code déclenche une nouvelle collecte et publication. Les modifications
portant uniquement sur `data/`, les documents ou le README ne redéclenchent pas le site.

Le serveur local `http://127.0.0.1:4197/` reste un aperçu de test. L’adresse publique
ci-dessus fonctionne indépendamment de ce serveur et reste accessible lorsque le PC est éteint.
