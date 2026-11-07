# Pharmaceutical & Chemical Patent Specifications: Markush Structure Preservation & Claims Translation Pipeline

## 1. Technical & Legal Requirements in Patent Translation

Patent specifications filed under the Patent Cooperation Treaty (PCT) via WIPO, the European Patent Office (EPO), and the USPTO require strict adherence to formal and legal conventions. In pharmaceutical and chemical disclosures, translations must preserve complex structural interdependencies:
- **Hierarchical Claim Trees**: Independent claims establish broad scopes of protection, whereas dependent claims introduce progressive narrowing of chemical moieties. Any change in punctuation, indentation, or claim numbering invalidates legal validity.
- **Markush Group Structures**: Generalized chemical representations where variable groups ($R_1, R_2, \dots, R_n$) encompass aliphatic, aromatic, and heterocyclic substituents, often presented within large compound matrices.
- **Biotechnological Sequence Listings**: WIPO Standard ST.26 compliance, requiring that nucleotide and amino acid sequences remain unmodified while legal annotations are translated accurately.

## 2. Parsing Pipeline and Markush Formula Isolation

To avoid structural corruption during machine translation, the pipeline isolates chemical and mathematical entities prior to text processing:

```
[ PCT / EPO / USPTO Patent PDF Specification ]
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Section & INID Code Structural Identification│
│  - Field segmentation: (54) Title, (57) Abstract│
│  - Separation of Description and Claims      │
│  - Detection of independent claim boundaries │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Chemical Graph & SMILES Token Isolation     │
│  - Markush variable extraction               │
│  - Vectorization of molecular structural SVGs│
│  - Preservation of synthesis yield tables    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Legal Domain Transformer Translation        │
│  - Specialized industrial property ontology   │
│  - Strict preservation of modal verbs (shall) │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Dual-Column Recomposition & AST Export      │
│  - Identical paragraph-by-paragraph layout    │
└──────────────────────────────────────────────┘
```

## 3. Workflow for Intellectual Property & R&D Teams

For patent attorneys, patent agents, and corporate intellectual property departments conducting freedom-to-operate (FTO) surveys and prior art analyses:
- Formal patent documentation is processed via the [Legal and Patent Translation Portal](https://www.geyi.net/en/for/legal).
- Related technical non-patent literature is analyzed using the [Technical Literature Translation Engine](https://www.geyi.net/en/translate/paper).
- Multi-format extraction for patent databases and docketing systems is supported through the [Multi-Format Conversion System](https://www.geyi.net/en/format-convert).
- Deep document data extraction for chemical compounds and tabular data is available via the [Document Extraction Framework](https://www.geyi.net/en/document-extraction).
