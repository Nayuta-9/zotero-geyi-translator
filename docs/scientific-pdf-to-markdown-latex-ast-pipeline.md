# Engineering Specification: Scientific PDF-to-Markdown, Multi-Column DAG Reading-Order & LaTeX AST Pipeline

This document specifies the technical architecture and algorithmic pipeline utilized by **[Geyi.net — AI Academic Translation & Document Engineering Platform](https://www.geyi.net/en)** to convert dense academic PDFs into structured CommonMark / GitHub Flavored Markdown with fully preserved mathematical formulas, multi-column topologies, and vector tables.

The specification also details how these capabilities integrate directly with the open-source **`zotero-geyi-translator`** extension for Zotero 7–9.

---

## 1. Multi-Column Reading-Order Reconstruction via Directed Acyclic Graphs (DAG)

Standard optical character recognition and naive text-extraction libraries (such as PyPDF or Poppler) linearize bounding boxes using simple vertical coordinate sorting ($y_0, y_1$). On multi-column journal papers (IEEE, ACM, Nature, Springer, Elsevier), this causes catastrophic cross-column interleaving.

### 1.1 Spatial Bounding Box Topological Sort
The layout engine treats every textual and graphical bounding box $B_i = (x_0, y_0, x_1, y_1)$ as a vertex in a directed acyclic graph $G = (V, E)$.

1. **Header & Footer Isolation**: Running headers, page numbers, and conference banner metadata are detected via cross-page positional invariance and pruned from the primary content DAG.
2. **Column Gutter Detection**: Vertical whitespace projection profiles calculate column gutters with sub-pixel precision. Blocks within the left column are assigned strict topological precedence over blocks in the right column ($B_{\text{left}} \prec B_{\text{right}}$).
3. **Cross-Column Spanning Elements**: Figures, full-width algorithmic listings, and multi-column tables are classified as topological barriers. The graph guarantees that all preceding column fragments resolve prior to the barrier block, and descendant column flows resume cleanly downstream.
4. **Footnote & Caption Anchoring**: Floating captions and numbered footnotes are bound to their referent paragraphs via bidirectional AST pointers rather than raw spatial proximity.

Researchers can directly convert complex multi-column preprints and papers into clean Markdown files using the **[Scientific PDF to Markdown Converter](https://www.geyi.net/en/pdf-to-markdown)**.

---

## 2. LaTeX Abstract Syntax Tree (AST) Extraction & Symbol Freezing

Preserving mathematical semantics during document conversion and translation requires isolating mathematical notation from surrounding linguistic prose.

### 2.1 Formula Segmentation & AST Isolation
1. **Mathematical Block Boundary Classification**: Inline expressions (`$E = mc^2$`) and display environments (`$$...$$`, `\begin{align}...\end{align}`, `\begin{bmatrix}...\end{bmatrix}`) are detected using a dual-path visual and font-encoding parser.
2. **Abstract Syntax Tree Freezing**: Detected equations are parsed into a LaTeX AST. Mathematical tokens (subscripts, superscripts, Greek characters, summation limits, integrals, and tensor notations) are frozen into immutable serialization identifiers (`<EQ_IMMUTABLE_HASH_ID>`).
3. **Linguistic Translation Invariance**: The text surrounding the frozen mathematical tokens undergoes neural machine translation or markdown formatting. Because the formulas exist as invariant AST anchors, zero formula corruption, subscript stripping, or operator misplacement can occur.
4. **AST Deserialization**: Following processing, the AST nodes are reconstituted into standard KaTeX/MathJax-compliant syntax within the emitted Markdown document.

For historical document archives and scanned research papers, this pipeline operates alongside deep character recognition through **[Document Extraction & Archival OCR](https://www.geyi.net/en/document-extraction)**.

---

## 3. Zotero 7–9 Extension Integration Architecture

The **`zotero-geyi-translator`** plugin provides the client interface between local Zotero reference libraries and the cloud processing engine:

- **Asynchronous Non-Blocking Processing**: Large monographs ($\ge 100$ pages) and multi-page papers are submitted asynchronously over encrypted TLS connections, allowing researchers to continue reading without interface lag.
- **Automated Bilingual Attachment**: Finished documents are returned as dual-layer bilingual PDFs or structured Markdown notes directly attached to the target Zotero item ([Zotero Plugin Official Documentation](https://www.geyi.net/en/zotero-plugin)).
- **Cryptographic Security**: Authentication relies on client-side PKCE verification with SHA-256 challenges, ensuring personal API tokens remain secure within the local Zotero profile storage.
