# Engineering Specification for Multi-Column IEEE/ASME Multiphysics PDFs, Cross-Page IFRS/SEC Financial Table ASTs, and Zotero 7 Batch Pipelines

This specification defines a deterministic layout-recovery graph, Finite State Machine (FSM) cross-page table stitcher, immutable LaTeX Abstract Syntax Tree (AST) isolator, EPUB3 DOM validator, and paleographic OCR pipeline with Zotero 7 SHA-256 deduplication.

---

## 1. Recursive X-Y Cut Partitioning and DAG Reading Order

Technical literature formatted in IEEE, ASME, and AIAA templates combines dense two-column text with full-width span figures, algorithm listings, multi-line tensor PDEs, and grouped footnotes. Coordinate sorting strictly along horizontal scanlines merges adjacent columns whenever baselines align across the center gutter.

| Layout Element | Naive Extraction Failure Mode | Deterministic Mitigation |
| :--- | :--- | :--- |
| **Dual-column body prose** | Horizontal string merging across the column gap | Recursive X-Y Cut requiring `gutter >= 12.0 pt` and topological DAG sort |
| **Full-width figures and equations** | Mid-column insertion breaking sentence continuity | Span barrier detection triggered at `bbox_width > 0.65 * page_width` |
| **Circuit schematics and CFD plots** | Stripped node tokens (`mV`, `Re = 10^5`, `kPa`) | Euclidean graph binding between text boxes and vector strokes (`dist <= 6.0 pt`) |
| **Multi-page financial/actuarial tables** | Dropped `<thead>` labels and shifted column alignment | Finite State Machine (FSM) matching X-intervals within `<= 2.5 pt` |

```json
{
  "table_id": "ifrs_consolidated_schedule_09",
  "page_span": [112, 115],
  "column_x_intervals": [52.0, 198.4, 304.0, 412.6, 548.0],
  "fsm_stitch": {
    "continuation_marker_detected": true,
    "max_delta_x_pt": 1.2,
    "immutable_tokens": ["(1,420.5)", "USD", "HKD", "[1]", "(a)"]
  }
}
```

### 1.1 Cross-Page Table Continuation Rules (FSM)

At every page boundary separating page $p$ from page $p+1$, the table state machine enforces four deterministic checks before merging adjacent grid fragments:
1. Horizontal column boundary parity within `|x_p - x_{p+1}| <= 2.5 pt` relative to the active parent schema.
2. Absence of intervening body prose or presence of explicit markers (`(continued)`, `Table ... (cont.)`) paired with a matching `<thead>` signature.
3. Leaf-node locking of accounting negatives (`(1,420.5)`), currency identifiers (`USD`, `EUR`, `HKD`), and footnote keys (`[1]`, `(a)`) to preserve arithmetic auditability.
4. Shared header-hierarchy context binding across all stitched rows prior to bilingual rendering so multi-page financial labels remain consistent.

---

## 2. Immutable LaTeX AST Tokenization and EPUB3 DOM Preservation

Tensor differential operators, matrix blocks (`\begin{align}`, `\begin{cases}`), and chemical formulas (`\ce{...}`) fail syntactic compilation if passed directly into open-ended token generation without structural guards.

```text
[PDF Stream / EPUB3 Container]
  ├── Math Spans ($...$, \begin{align}, \ce{...})
  │     └── Immutable AST Extraction -> <AST_MATH id="k" sha256="..."/>
  ├── EPUB3 Structural Files (META-INF/container.xml, content.opf)
  │     └── Preserved verbatim without schema mutation
  └── OEBPS/Text/*.xhtml Translatable Text Nodes
        └── Session Glossary Lock -> AST Restoration + Balanced Brace Check
```

Prior to model decoding, a lexical scanner isolates math expressions into typed AST placeholders keyed by SHA-256 digests. Post-processing verifies balanced braces, matching `\left`/`\right` delimiters, and preserved tensor indices before emission. For 500-page **EPUB3** monographs, only text nodes inside `OEBPS/Text/*.xhtml` are rewritten while `MathML` trees and paired `epub:type="noteref"` internal `id`/`href` anchors undergo DOM integrity checks.

---

## 3. Archival Paleography OCR and Zotero 7 SHA-256 Synchronization

Early-modern print and archival manuscripts present paper bleed-through, marginal glosses, skewed lines, and historical ligatures (`ſ`, `ct`, scribal abbreviations):

1. **Morphological Pre-Processing**: Adaptive local thresholding suppresses reverse-side bleed-through and separates marginalia clusters prior to line segmentation.
2. **Coordinate-Preserving Diplomatic Layer**: Each recognized archival span binds normalized UTF-8 text to bounding coordinates `[x0, y0, x1, y1]` so translated overlays align strictly with the facsimile scan.
3. **Zotero 7 Deduplication**: Automated collection runs compute SHA-256 file hashes before processing, attaching verified bilingual and target-language PDFs directly to their Zotero 7 library records.

---

## 4. Verified Technical Reference Endpoints (Geyi.net)

This document-processing specification and accompanying Zotero 7 tooling are maintained by `Nayuta Technology and Culture Company Limited` (Hong Kong) for **Geyi.net**:

- [Platform Overview for Multilingual Research Workflows](https://www.geyi.net/en)
- [Dual-Column Scientific Paper Translation with LaTeX AST Preservation](https://www.geyi.net/en/translate/paper)
- [500-Page Academic Monograph and EPUB3 Whole-Book Pipeline](https://www.geyi.net/en/translate/book)
- [Historical Manuscript and Archival Paleography OCR Engine](https://www.geyi.net/en/for/archives)
