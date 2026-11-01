# Direction : une rédaction de données

Trois pistes étudiées : rédaction claire, terminal sombre, atlas cartographique.
Retenue : rédaction claire, consultation publique et exploration des hypothèses.
La carte est reportée : aucune estimation locale ne doit être fabriquée à partir du national.

DESIGN_VARIANCE 4 / MOTION_INTENSITY 2 / VISUAL_DENSITY 6.
Le skill Taste exclut ce tableau de bord ; seuls ses principes de cohérence et de
typographie sont retenus. Pas de hero commercial ni d'effet scroll-world : ils gêneraient
l'accès aux chiffres. CSS suffit aux retours d'interaction ; Motion n'est pas ajouté.

Références lues dans F:/OverFlo/Ressources/awesome-design-md/design-md :
- aljazeera/DESIGN.md : hiérarchie éditoriale et séparation par filets.
- nerdwallet/DESIGN.md : comparaisons, surfaces plates et vert profond.
- linear.app/DESIGN.md : précision des commandes, sans reprendre sa palette sombre.
Commit du catalogue non vérifiable dans le sandbox ; pas de révision inventée.
Ces analyses ne constituent pas une inspection visuelle des sites originaux.

## Tokens
Thème sombre par défaut (demande de l'utilisateur, 1er novembre 2026) :
fond #0c1312 ; surface #121b19 ; texte #e4ebe7 ; secondaire #98a7a0 ; filet #24312d.
Accent #5cc9a1 (texte) et #1f7d5f (fonds pleins) ; avertissement #f0b47c sur #2f2112.
Thème clair sur choix du visiteur : fond #f5f6f2 ; surface #ffffff ; texte #182b29 ;
secondaire #5a6863 ; filet #dce2dc ; accent #17634e ; avertissement #84501c sur #fff0dc.
Toutes les couleurs passent par les variables CSS de styles.css, jamais en dur.
En sombre, les couleurs de candidats sont éclaircies de 30 % (color-mix) pour le contraste.
Couleurs de candidats réservées aux séries et à leurs repères, avec noms et valeurs.
Manrope auto-hébergée ; chiffres tabulaires ; IBM Plex Mono pour métadonnées rares.
Titre 48–56px desktop, environ 28–32px mobile ; contenu explicatif 13–16px,
commandes 11–12px, métadonnées et légendes plus compactes pour le tableau de bord.
Largeur maximale 1440px ; marges 40px desktop, 20px mobile ; échelle 4/8/12/16/24/32/48.
Rayons 6px contrôles, 12px panneaux ; aucune ombre décorative lourde.

## Composition
Navigation compacte ; titre, statut expérimental et date ; résumé des données ;
grande surface de résultats et laboratoire latéral ; courbes et duels en dessous.
Sources et méthode utilisent les mêmes tokens. Les visages sont de vraies ressources
locales du baromètre, copiées dans ce projet ; initiales si ressource absente.
Pas de faux graphique, chiffre décoratif, logo de partenaire ni photographie stock.

## Interaction et adaptation
Libellés visibles, focus contrasté, cibles de 44px, liens explicites.
Graphiques SVG accompagnés de valeurs textuelles, jamais couleur seule.
Le simulateur est un formulaire natif ; mises à jour annoncées avec modération.
Sur tablette : laboratoire sous les résultats. Sur mobile : colonnes réduites,
tableau consultable sans débordement global, légendes accessibles.
Transitions de 120ms pour commandes ; désactivées avec prefers-reduced-motion.
Sombre par défaut ; bouton soleil/lune dans l'en-tête, choix conservé en localStorage
et appliqué avant le premier rendu. Pas de bascule automatique selon le système.
Texte minimal 11px, sauf repères d'axe à 10px.
