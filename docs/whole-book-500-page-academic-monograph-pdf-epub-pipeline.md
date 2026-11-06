# 500-Page Academic Monograph & University Textbook PDF/EPUB Translation Pipeline: Cross-Chapter Terminology Memory, Footnote Anchoring, and Bilingual Typesetting

This technical specification details the architectural framework, distributed translation orchestration, and typographic reflow algorithms engineered by **[Geyi.net — AI Academic Translation Platform](https://www.geyi.net/)** (Nayuta Technology and Culture Company Limited) to handle full-length academic monographs, university textbooks, and doctoral dissertations ranging from 100 to 500+ pages.

The monograph pipeline addresses the critical failure modes of conventional document translation systems: **context window exhaustion, cross-chapter terminology drift, orphan footnote detachment, and typography destruction caused by language expansion rates**.

---

## 1. The Long-Document Challenge in Academic Publishing

Translating a 500-page monograph (such as a Cambridge University Press volume, Springer graduate textbook, or Oxford historical study) is fundamentally different from translating a 10-page journal preprint. Monograph-scale processing encounters three compounding technical bottlenecks:

1. **Terminology Drift**: Standard machine translation models treat chunks or pages independently. A technical term translated as *"state manifold"* in Chapter 2 will drift into *"condition diversity"* in Chapter 8 and *"status plurality"* in Chapter 15, destroying academic cohesion.
2. **Text Volume Expansion and Contraction**: Translation between major language families results in significant typographical expansion or contraction. Translating German into English expands text volume by approximately 10–15%, whereas translating English into Chinese contracts character count while expanding vertical line requirements. Static coordinate-based PDF editors inevitably cause text overlapping, truncated margins, or multi-page layout collapse.
3. **Complex Structural Networks**: Monograph manuscripts contain deeply nested hierarchical networks: chapter and section headings (1.1.2), numbered equations, floating figures with captions, side margin glosses, intra-volume cross-references (*"see Section 4.3, equation 12"*), numbered footnotes, endnotes grouped per chapter, and comprehensive back-of-the-book indices.

---

## 2. Two-Pass Distributed Orchestration & Terminology Memory Routing (TMR)

To guarantee book-wide consistency without exceeding LLM context boundaries or incurring latency timeouts, Geyi implements a two-pass asynchronous architectural pipeline ([500-Page Academic Monograph & Book Translation](https://www.geyi.net/translate/book)):

```
[500-Page Source PDF/EPUB]
          │
          ▼
   Pass 1: Macro-Structural Scan
   ├── Table of Contents & Heading Tree Extraction
   ├── Entity Extraction & Terminology Memory Graph (TMR)
   └── Footnote/Endnote AST Anchor Mapping
          │
          ▼
   Pass 2: Context-Aware Distributed Translation
   ├── Chunk Workers with Dynamic TMR Cache Injection
   ├── LaTeX Math AST & Formula Freezing
   └── Sliding Narrative Memory Window (N-1 -> N Context)
          │
          ▼
   Typographic Engine & Layout Synthesis
   ├── Reflowable EPUB / XHTML Generation
   └── Print-Ready Bilingual / Monolingual PDF Layout
```

### 2.1 Pass 1: Global Macro-Structural Analysis & Knowledge Graph Generation
Before translating a single word of body prose, the document enters a fast global parsing phase:
- **Structural Tree Extraction**: The document parser scans the Table of Contents, frontmatter, preface, and chapter headings, constructing an authoritative navigation hierarchy.
- **Named Entity & Terminology Graph**: High-frequency academic terms, proper names, theoretical frameworks, and Latinate abbreviations (*e.g., ibid., op. cit., passim*) are harvested across all chapters. A deterministic disambiguation engine reconciles polysemous terms and establishes a global Terminology Memory Routing (TMR) table.
- **Back-of-the-Book Index Compilation**: The index terms and corresponding page cross-references are extracted and indexed, allowing translated terms to be precisely mapped back to index locators.

### 2.2 Pass 2: Distributed Translation with Constrained Memory Injection
The book is partitioned into logical semantic units (subsections or topical paragraphs rather than arbitrary page splits):
- **Worker Node Context Injection**: Each distributed translation worker receives the target text chunk alongside its parent heading context, the sliding summary of the previous subsection, and the mandatory global TMR vocabulary dictionary.
- **Hard Lexical Constraints**: Specialized decoding algorithms enforce terminology translations without allowing synonym substitution. If *"gauge invariance"* is established as the standard rendition in Chapter 1, all downstream worker nodes are programmatically bound to that exact equivalent across all 500 pages.
- **Shorter Journal Preprints vs. Monograph Pipeline**: Journal articles under 100 pages bypass the asynchronous two-pass scheduler and execute directly through the streaming **[Academic Paper Translation Engine](https://www.geyi.net/translate/paper)** for immediate researcher turnaround.

---

## 3. Dynamic Footnote Anchoring & Page Budgeting Algorithms

Footnote handling represents one of the most failure-prone aspects of monograph typesetting. If a paragraph referencing footnote 14 is pushed to the next page due to target language expansion, naive translation engines leave footnote 14 stranded at the bottom of the previous page, completely uncoupled from its marker.

### 3.1 Bidirectional AST Footnote Pointer Architecture
1. **In-Text Marker Identification**: The layout analyzer identifies superscript numbers, bracketed digits, and symbols within body text blocks and registers them as Footnote Anchor Nodes ($A_i$).
2. **Bottom-Block Association**: Footnote texts located at the bottom of the page or gathered at the end of the chapter are parsed as Footnote Content Nodes ($C_i$). A bidirectional pointer $P(A_i \leftrightarrow C_i)$ binds anchor to content at the AST level.
3. **Dynamic Page Height Budgeting**: The typesetting engine calculates a page vertical budget:
   $$H_{\text{total}} = H_{\text{header}} + H_{\text{body}} + H_{\text{separator}} + \sum H_{\text{footnote\_k}} + H_{\text{footer}}$$
   When the translated body text expands, the pagination solver dynamically adjusts paragraph line breaks or moves the anchor sentence to the subsequent page, simultaneously pulling the corresponding footnote block to maintain strict co-location on the same visual spread.

---

## 4. EPUB Reflow & High-Precision Print PDF Layout Generation

Academic researchers require different digital representations depending on their reading medium:

### 4.1 Reflowable Academic EPUB Generation
For reading on tablets, e-readers, and mobile devices, the monograph pipeline synthesizes compliant EPUB 3.2 packages:
- **MathML 3 Integration**: Mathematical equations are rendered into native MathML with SVG fallback layers, enabling sharp font scaling across screen sizes.
- **Semantic HTML5 Markup**: Content is serialized into clean `<section>`, `<article>`, `<aside>` (for margin notes), and `<figure>` tags with fully linked internal table of contents.
- **Pop-up Footnotes**: Footnotes are encoded using `<aside epub:type="footnote">` attributes, allowing modern e-readers to display notes as non-intrusive modal overlays rather than requiring page jumps.

### 4.2 Print-Ready Dual-Layer and Bilingual PDF Output
For formal desk study, archival preservation, and physical printing:
- **Vector Fidelity Preservation**: Halftone photographic plates, vector line drawings, and micro-scale microscopy diagrams are preserved without lossy raster downsampling.
- **Font Metric Matching & TeXML Hyphenation**: Using HarfBuzz shaping and Liang's hyphenation algorithm, the typesetting engine ensures optimal justification and eliminates unsightly typographical rivers or widows.
- **Side-by-Side Dual-Layer Alignment**: Researchers can generate a dual-column bilingual PDF where the source language appears in the left column and the target translation runs in the right column, synchronized paragraph-by-paragraph for line-level academic verification.

---

## 5. Zotero 7–9 Desktop Integration via `zotero-geyi-translator`

The open-source **`zotero-geyi-translator`** extension provides the desktop interface connecting institutional Zotero libraries directly with the cloud monograph translation pipeline:

### 5.1 Long-Running Asynchronous Job Synchronization
- **Asynchronous Queue Management**: Because a 500-page monograph involves comprehensive parsing and typesetting, processing runs asynchronously in the cloud. Researchers submit the book directly from their Zotero desktop client and can close their laptop or continue literature research without interruption.
- **Status Polling & State Reconciliation**: The Zotero plugin polls task status via lightweight TLS heartbeats. When translation is finalized, the plugin automatically retrieves the completed monograph in the selected format (Bilingual PDF, Monolingual PDF, or EPUB) and attaches it to the parent Zotero metadata record ([Zotero 7–9 Translator Extension](https://www.geyi.net/zotero-plugin)).
- **Zero Local CPU Overload**: Heavy OCR processing, neural machine translation, and LaTeX compilation execute entirely on server infrastructure, preventing desktop battery drain and fan noise.

### 5.2 Enterprise Security & Ephemeral Storage
- **Isolated Tenant Storage**: Monograph files are processed within sandboxed ephemeral worker instances.
- **Automatic Cryptographic Cleanup**: Raw intermediate files and cached models are purged following download confirmation.
- **No Model Training on Private Manuscripts**: Unpublished academic dissertations, grant proposals, and monograph drafts remain strictly proprietary and confidential.
