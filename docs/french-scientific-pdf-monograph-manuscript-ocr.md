# Guide Technique Zotero 7–9 : Traduction d'Articles Scientifiques PDF avec LaTeX, Monographies de 500 Pages & OCR de Manuscrits Historiques

Ce guide technique détaille l'intégration et le fonctionnement de l'extension open source **`zotero-geyi-translator`** dans Zotero 7–9 pour les chercheurs universitaires (CNRS, Sorbonne Université, Université Paris-Saclay, ENS, Université de Montréal, EPFL, ULB), les écoles doctorales et les conservateurs d'archives en France et dans l'espace francophone.

Le moteur de traitement sous-jacent et les modèles d'analyse documentaire sont opérés par **[Geyi.net — Plateforme d'IA pour la Traduction Académique de PDF](https://www.geyi.net/fr)**.

---

## 1. Traduction d'Articles Scientifiques PDF à Double Colonne & Préservation des Formules LaTeX

Lors de la traduction d'articles de recherche (publiés sur HAL, Elsevier, Springer, IEEE, ACM, Cairn, Revues.org ou arXiv), les convertisseurs génériques brisent fréquemment l'ordre de lecture des deux colonnes et corrompent la syntaxe mathématique. L'extension Zotero surmonte ces obstacles grâce à trois étapes de traitement :

### 1.1 Reconstruction Topologique du Document
1. **Segmentation de l'Ordre de Lecture** : Le moteur isole les blocs textuels, les titres de niveau, les figures vectorielles, les tableaux et les notes de bas de page. Un graphe orienté acyclique (DAG) reconstruit le flux de lecture séquentiel sans collision entre colonnes.
2. **Isolation des Équations Mathématiques LaTeX** : Les formules intégrées (`$...$`) et les environnements d'affichage (`$$...$$`, `\begin{align}...\end{align}`) sont gelés sous forme de nœuds typographiques immuables. Les fractions, intégrales, tenseurs et symboles grecs sont préservés à l'identique dans le PDF cible en français.
3. **Génération Bilingue Automatisée dans Zotero** : Depuis votre bibliothèque Zotero, un clic droit sur l'article lance la traduction. Le PDF bilingue (disposition en miroir ou côte à côte) est directement attaché sous la référence bibliographique d'origine ([Traduire des articles scientifiques et revues](https://www.geyi.net/fr/translate/paper)).

---

## 2. Monographies Complètes de 500 Pages & Thèses Doctorales

Le traitement des ouvrages de recherche volumineux nécessite une gestion globale du contexte linguistique :

- **Pipeline Monographie Long Format ($\ge 100$ pages)** : Les livres, actes de colloques et thèses sont traités par un pipeline asynchrone qui maintient la cohérence terminologique d'un chapitre à l'autre ([Traduire des livres complets et monographies](https://www.geyi.net/fr/translate/book)).
- **Synchronisation du Glossaire Personnel** : Vos dictionnaires de termes spécialisés configurés sur Geyi.net sont appliqués automatiquement à l'ensemble du volume, évitant les traductions flottantes des concepts clés.
- **Index et Table des Matières** : La numérotation des chapitres, les renvois bibliographiques et la pagination restent parfaitement synchronisés.

---

## 3. Manuscrits Historiques, Fonds BnF & OCR d'Archives Paléographiques

Pour les chercheurs en histoire, lettres classiques et sciences humaines exploitant des documents numérisés issus de Gallica (Bibliothèque nationale de France - BnF), des Archives nationales ou de bibliothèques municipales :

- **Imprimés Anciens (XVIe–XVIIIe siècles)** : Reconnaissance optique de caractères adaptée aux polices anciennes, ligatures historiques (&ct., st, ct) et variantes orthographiques du moyen et français classique (long s ſ).
- **Manuscrits d'Archives** : Extraction et transcription de documents manuscrits scannés avec préservation des sauts de ligne et annotations marginales.
- **Exportation Structurée en Markdown** : Restitution des textes d'archives sous forme de fichiers Markdown structurés prêts pour l'analyse textuelle et la fouille de données ([Extraction de documents et OCR pour archives historiques](https://www.geyi.net/fr/for/archives)).

---

## 4. Installation et Paramétrage dans Zotero

1. Dans Zotero, ouvrez **Outils → Extensions** et installez l'archive `zotero-geyi-translator.xpi`.
2. Accédez aux préférences de Zotero, volet **Geyi Translator**.
3. Associez votre compte de recherche via l'autorisation sécurisée par navigateur (protocole PKCE avec SHA-256).
4. Sélectionnez **Français (`fr`)** comme langue cible par défaut.
