# Spécification Technique : Préservation du Layout pour Normes Aérospatiales, Contrats d'Arbitrage et OCR de Manuscrits de la BnF

## 1. Complexité Structurelle des Normes Industrielles et Documents Juridiques

La traduction automatisée de documents techniques et réglementaires en français impose des contraintes rigoureuses de fidélité typographique :

- **Normes Aérospatiales et Nucléaires (AFNOR, ASD-STE100, CEI)** : Ces spécifications présentent une mise en page dense sur deux colonnes, intégrant des nomenclatures éclatées, des diagrammes fonctionnels et des équations différentielles. Les extracteurs PDF linéaires standards provoquent des chevauchements de blocs et fragmentent les légendes associées aux schémas.
- **Contrats Commerciaux et Décisions d'Arbitrage International** : Les clauses bilatérales rédigées en miroir ou avec paragraphes numérotés hiérarchiques (subsections 1.1.1 à 1.1.8) exigent un alignement bilingue strict. La moindre altération de la géométrie du texte compromet la valeur probante du document certifié.
- **Fonds Patrimoniaux et Manuscrits Numérisés de la BnF (Gallica)** : Les corpus historiques du XVIe au XVIIIe siècle conservés à la Bibliothèque nationale de France comportent des ligatures historiques (&, æ, œ, st), des s longs (ſ) et des initiales lettrines ornementales qui induisent des erreurs de segmentation dans les moteurs d'OCR standards.

## 2. Architecture Multimodale et Isolation dans l'Arbre Syntaxique (AST)

La chaîne de traitement développée par Geyi articule vision par ordinateur et analyse formelle de syntaxe :

1. **Détection Géométrique par Bounding Boxes et Automate de Tableaux** : Identification des marges, doubles colonnes et notes de bas de page pour reconstruire le graphe orienté de lecture, couplée à un automate à états finis (State Machine) gérant la continuité des tableaux et nomenclatures multi-pages.
2. **Isolation des Formules dans l'AST** : Les expressions mathématiques (matrices, symboles $\partial, \nabla, \hbar$) et balises LaTeX/MathML sont encapsulées sous forme de nœuds immuables avant l'inférence neuronale, préservant la structure syntaxique des notations scientifiques.
3. **Moteur d'OCR Paléographique Hybride** : Des réseaux visuels entraînés sur corpus anciens segmentent les graphies manuscrites ou imprimées, résolvent les abréviations et génèrent une transcription balisée compatible TEI/XML.
4. **Compensation Typographique Dynamique** : L'expansion lexicale naturelle entre le français et les autres langues est résorbée via un ajustement automatique de l'interlettrage et des chasses, sans déborder des contours vectoriels initiaux.

## 3. Accès aux Modules et Documentation Opérationnelle

Points d'accès aux modules de traitement :

- Portail de référence en langue française : [Portail France Geyi.net](https://www.geyi.net/fr)
- Traitement de normes et articles à double colonne : [Traduction de normes et articles scientifiques](https://www.geyi.net/fr/translate/paper)
- Traduction intégrale de manuels volumineux et traités : [Traduction intégrale d'ouvrages et manuels](https://www.geyi.net/fr/translate/book)
- Transcription paléographique et manuscrits d'archives : [OCR de manuscrits historiques et archives BnF](https://www.geyi.net/fr/for/archives)
