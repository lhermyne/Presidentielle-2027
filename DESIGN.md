# Direction : le duel en une, la rigueur en dessous

Nom affiché : L'Hermyne - Présidentielle 2027.

Refonte validée par l'utilisateur le 6 novembre 2026, à partir de trois maquettes
(A La Une, B Le Duel, C La Table). Retenu : un mélange.
- De B : le hero avec le duel en grand, portraits et scores, halos aux couleurs des finalistes ; les polices.
- De A : la liste à filets fins du premier tour, le fond noir chaud, le vermillon.
- De C : le reclassement animé des barres.
Objectif : comprendre en quelques secondes de quoi il s'agit, sans surcharge.

Références observées dans le navigateur : sondages2027.fr, ourworldindata.org/democracy, pudding.cool.
Lues en texte seulement : The Economist (modèle 2024), 538/ABC (Information is Beautiful Awards).
Non retenu : Higgsfield, scroll-world, photographie stock, carte (aucune estimation locale fabriquée).

## Tokens
Sombre par défaut : fond #100e0b ; surface #17140f ; texte #f3ecdf ; secondaire #b7ad9c ;
atténué #978d7d ; filet #2a2519 ; accent #ef7655 (texte) et #c6472a (fonds pleins).
Clair sur choix du visiteur : fond #f6f2ea ; surface #fffdf8 ; texte #1c1812 ; secondaire #5d5548 ;
filet #e0d9cb ; accent #b23c1c. Toutes les couleurs passent par les variables de styles.css.
En sombre, les couleurs de candidats sont éclaircies de 30 % (color-mix) pour le contraste.
Couleurs de candidats réservées aux séries, aux repères et aux halos, toujours avec noms et valeurs.
Bricolage Grotesque (titres, chiffres) et Instrument Sans (texte), auto-hébergées ; chiffres tabulaires.
Largeur de contenu 1140px ; marges 20 à 48px ; texte minimal 12px ; cibles de 44px.

## Composition
Accueil : hero duel, onglets (Premier tour, Qualification, Second tour probable) avec choix
Toutes les sources / Sondages seuls, invitation au laboratoire, tendance des sondages.
Le laboratoire (curseurs, liste de candidats, effet de chaque source, export, partage) s'ouvre
dans un panneau latéral natif <dialog> avec les premiers scores en direct.
Second tour : duels des simulations, puis autres duels sondés, ajustés par les mêmes sources.
Le hero suit le duel le plus probable ; un duel non sondé n'affiche aucun score.
Mention « expérimental, non calibré » visible dans le hero. Pas de faux graphique ni de logo de partenaire.
Portraits : ressources locales du baromètre en 128px, affichées à 132px au plus ; initiales si absentes.

## Mouvement
CSS et Web Animations, sans bibliothèque. Chaque effet a un rôle :
- nombres qui défilent vers leur valeur, avec minuteur de secours pour la valeur exacte ;
- barres qui se remplissent, barre de duel partant de 50 % ;
- reclassement FLIP des lignes quand l'ordre change ;
- indicateur d'onglet glissant, apparition des sections au défilement, tracé des courbes ;
- halos à dérive lente, ouverture du panneau latéral.
prefers-reduced-motion coupe tout ; aucune animation ne cache durablement un contenu.

## Composants 21st
Bar Race Chart, dhxwhy, https://21st.dev/@dhxwhy/components/bar-race-chart, id 37544 :
code lu, seule la technique FLIP est reprise et réécrite dans components/Motion.jsx.
Licence du composant non précisée par le catalogue : aucun fichier copié tel quel.
Génération IA 21st désactivée sur le compte, non utilisée.

## Adaptation
Tablette : même composition, baromètre retiré de l'en-tête. Mobile : finalistes en colonne,
barres sous le nom, libellé d'onglet raccourci, panneau du laboratoire en pleine largeur.
Tableaux consultables sans débordement global. Sombre par défaut, choix conservé en localStorage
et appliqué avant le premier rendu. Clavier : flèches dans les onglets, Échap ferme le panneau.
