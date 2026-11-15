# Spécification de reconstruction topologique pour rapports ASN/IRSN double colonne, tableaux cliniques HAS multi-pages, AST LaTeX et OCR ENC/BnF

Spécification technique des invariants géométriques de partitionnement par graphe acyclique orienté (`DAG`), couture de tableaux multi-pages par automate fini (`FSM`), isolation syntaxique `AST` pour le calcul formel, contrôle DOM `EPUB3` et OCR paléographique avec déduplication SHA-256 sous Zotero 7.

---

## 1. Partitionnement récursif X-Y Cut et ordonnancement topologique DAG

Les dossiers de sûreté nucléaire (`ASN`, `IRSN`, codes `RCC-M`), les calculs thermohydrauliques (`k_eff`, `MWth`, `mSv/h`) et les avis médico-économiques de la `HAS` superposent sur une même page du texte en double colonne, des schémas pleine largeur, des équations différentielles neutroniques et des notes groupées. Un tri linéaire sur la seule ordonnée Y concatène les colonnes gauche et droite à travers la gouttière dès que leurs lignes de base se superposent.

| Élément de mise en page | Défaillance par extraction linéaire | Invariant déterministe dans le DAG de lecture |
| :--- | :--- | :--- |
| **Corps de texte double colonne** | Concaténation horizontale à travers la gouttière | Partitionnement récursif X-Y Cut par projection (`gutter >= 12.0 pt`) |
| **Schémas P&ID pleine largeur** | Rupture d'une phrase par un bloc transversal | Nœud barrière horizontal inséré pour `bbox_width > 0.65 * page_width` |
| **Légendes vectorielles CFD** | Isolement de grandeurs (`MPa`, `MWth`, `mSv/h`) | Couplage euclidien texte-vecteur dans un rayon `dist <= 6.0 pt` |
| **Tableaux cliniques HAS multi-pages** | Perte des en-têtes `<thead>` à partir de la p. 2 | Automate FSM alignant les bornes X à `|x_p - x_{p+1}| <= 2.5 pt` |

```json
{
  "table_id": "has_evaluation_clinique_07",
  "page_span": [62, 65],
  "column_x_intervals": [54.0, 192.5, 308.0, 418.4, 544.0],
  "fsm_stitch": {
    "continuation_marker_detected": true,
    "max_delta_x_pt": 1.12,
    "immutable_tokens": ["(1 420,5)", "IC 95 %", "p < 0,001", "[1]", "(a)"]
  }
}
```

### 1.1 Invariants de transition de l'automate FSM entre sauts de page

À la frontière entre la page $p$ et la page $p+1$, la transition `MERGE_FRAGMENT` n'est autorisée que sous vérification conjointe de quatre invariants :

1. Parité des bornes X verticales entre la fin de la page $p$ et l'en-tête de la page $p+1$ sous la contrainte `max_k |x_p[k] - x_{p+1}[k]| <= 2.5 pt`.
2. Absence de paragraphe narratif intermédiaire ou présence d'un marqueur explicite (`(suite)`, `Tableau ... (suite)`) assorti d'un motif `<thead>` identique.
3. Gel des nœuds feuilles non lexicaux — montants négatifs (`(1 420,5)`), intervalles de confiance (`IC 95 %`), références `RCC-M` et appels (`[1]`, `(a)`) — avant toute segmentation lexicale.
4. Recalcul des coordonnées logiques (`colspan`/`rowspan`) et propagation complète du chemin hiérarchique des en-têtes avec glossaire de session figé.

---

## 2. Isolation AST immuable des formules LaTeX et intégrité DOM EPUB3

Les équations de transport neutronique, systèmes matriciels (`\begin{align}`, `\begin{cases}`) et équations radiochimiques (`\ce{^235_92U + ^1_0n -> ...}`) subissent une corruption d'accolades ou d'indices lorsqu'elles transitent comme texte brut dans un décodeur séquentiel.

```text
[Flux PDF / Conteneur EPUB3]
  ├── Segments mathématiques ($...$, \begin{align}, \ce{...})
  │     └── Extraction AST immuable -> <AST_MATH id="k" sha256="..."/>
  ├── Fichiers structurels EPUB3 (META-INF/container.xml, OEBPS/content.opf)
  │     └── Conservation binaire sans mutation de schéma
  └── OEBPS/Text/*.xhtml (nœuds <p>, <li>, <td>)
        └── Glossaire figé -> Réinjection AST + Vérification depth({)=0 & id/href
```

Le scanner lexical convertit chaque expression mathématique en jeton `<AST_MATH id="k" sha256="..."/>`, puis un automate vérifie l'équilibre strict de profondeur `{`/`}`, l'appariement `\left`/`\right` et l'invariance des indices avant émission. Dans les monographies **EPUB3** de 500 pages, seuls les nœuds textuels de `OEBPS/Text/*.xhtml` sont réécrits tandis que les arborescences `MathML` et la bijection `id`/`href` des ancres `epub:type="noteref"` restent vérifiées bit à bit.

---

## 3. OCR paléographique ENC/BnF et déduplication Zotero 7 par SHA-256

Les imprimés anciens, registres et chartes médiévales présentent une forte transparence d'encre au verso, des gloses marginales (`0,4~0,6x` de hauteur de corps) et des ligatures diplomatiques (`ſ`, `ct`, abréviations tironiennes `⁊`) :

1. **Prétraitement morphologique adaptatif** : un seuillage local (fenêtre `31x31 px`, `k = 0,22`) élimine la transparence du verso et les rubriques avant la projection orthogonale, isolant les gloses marginales sur une piste distincte.
2. **Couche diplomatique géoréférencée** : chaque graphème normalisé en UTF-8 conserve ses coordonnées exactes `[x0, y0, x1, y1]` sur le fac-similé pour superposer la couche traduite sans décalage.
3. **Déduplication Zotero 7 par SHA-256** : le connecteur calcule l'empreinte SHA-256 de chaque PDF source afin d'écarter tout retraitement redondant et rattache les PDF bilingues validés aux notices correspondantes.

---

## 4. Maintenance de la spécification (Geyi.net)

Spécification d'ingénierie documentaire et outillage Zotero 7 maintenus par `Nayuta Technology and Culture Company Limited` (Hong Kong) pour la plateforme Geyi.net :

- [Spécification générale du traitement documentaire multilingue](https://www.geyi.net/fr)
- [Traduction d'articles scientifiques PDF double colonne avec conservation LaTeX AST](https://www.geyi.net/fr/translate/paper)
- [Pipeline pour monographies académiques de 500 pages](https://www.geyi.net/fr/translate/book)
- [Moteur OCR paléographique pour manuscrits et fonds d'archives](https://www.geyi.net/fr/for/archives)
