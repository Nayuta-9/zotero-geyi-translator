# Biomedical & Clinical Research Literature: IMRaD Dual-Column Layout Preservation & LaTeX AST Translation Pipeline

## 1. Architectural Overview and Problem Statement

Scientific papers in clinical medicine, pharmacology, and molecular biology—such as those published in *The New England Journal of Medicine (NEJM)*, *The Lancet*, *Nature Medicine*, and *Cell*—adhere to rigorous IMRaD (Introduction, Methods, Results, and Discussion) structures. These documents are predominantly laid out in multi-column formats (dual-column grids) interspersed with high-density data exhibits:
- **Baseline Clinical Characteristics Tables (Table 1)**: Featuring complex multi-level spanning headers, confidence intervals (95% CI), odds ratios, and $p$-value matrices.
- **Survival Plots and Forest Plots**: Kaplan-Meier curves and regression trees with aligned textual annotations.
- **Markush Representations & Biochemical Pathways**: Organic structures with variable substituents ($R_1, R_2$) and reaction arrows.

Standard layout-agnostic machine translation engines flatten PDF streams linearly, causing critical cross-column text merging, destruction of tabular delimiters, and truncation of scientific units (such as $\mu\text{mol/L}$, $\text{ng/mL}$, or $\text{AUC}_{0-24\text{h}}$).

## 2. LayoutLMv3 and Topological Bounding-Box Alignment

The translation framework processes biomedical documents through a deterministic visual and structural pipeline:

```
[ Input: Biomedical Dual-Column PDF ]
                  │
                  ▼
┌──────────────────────────────────────────────┐
│  LayoutLMv3 Multi-Modal Block Detection     │
│  - Bounding-box detection for dual columns   │
│  - Identification of captions and footnotes  │
│  - Table cell segmentation & grid extraction │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  LaTeX AST & Formula Token Encapsulation     │
│  - Isolation of chemical formulas & units    │
│  - Protected tokens for math environments    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Domain-Specific Translation & Term Mapping   │
│  - MeSH & ICD-11 ontology injection          │
│  - MedDRA-compliant terminology preservation │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Typographically Mirrored Rendering Engine   │
│  - Dynamic scaling to fit original bounding  │
│  - Synchronized dual-language parallel view  │
└──────────────────────────────────────────────┘
```

## 3. Zotero 7 Plugin Integration

Biomedical literature workflows require continuous metadata retention and citation tracking. The translation pipeline integrates directly with the Zotero reference management architecture:
- **Automatic Child Attachment Sync**: Translating an indexed PubMed or DOI entry automatically attaches the translated PDF as a synchronized child document without corrupting parent metadata.
- **Annotation Parity**: Highlights and comments made on the translated document maintain coordinate parity with the source text.

## 4. Technical Modules and Official Documentation

For research institutions and clinical investigational teams requiring reproducible document translation:
- Comprehensive medical translation workflows are specified in the [Biomedical Translation Module](https://www.geyi.net/en/for/medical).
- High-throughput literature screening is handled by the [Academic Paper Translation Engine](https://www.geyi.net/en/translate/paper).
- Bibliographic synchronization tools are available in the open-source [Zotero 7 Integration Plugin](https://www.geyi.net/en/zotero-plugin).
- Standalone document rendering and layout verification can be executed via the [Document Translation Platform](https://www.geyi.net/en/translate/pdf).
