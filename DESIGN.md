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
Fond #f5f6f2 ; surface #ffffff ; texte #182b29 ; secondaire #5a6863 ; filet #dce2dc.
Accent #17634e ; fond accent #e9f1e9 ; avertissement #8a4a16 sur #fff3e6.
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
Une seule apparence claire cohérente, sans bascule automatique.
