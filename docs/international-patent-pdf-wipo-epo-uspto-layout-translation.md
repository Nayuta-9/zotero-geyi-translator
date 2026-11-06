# International Patent PDF Translation Architecture (WIPO, EPO, USPTO, JPO): Multi-Column Claims, Chemical Markush Structures, and Drawing Callout Preservation

This technical specification details the patent parsing, visual document object reconstruction, and layout-preserving translation architecture developed by **[Geyi.net — AI Academic Translation & Document Engineering Platform](https://www.geyi.net/)** (Nayuta Technology and Culture Company Limited). 

The platform provides dedicated engineering pipelines for patent attorneys, patent examiners, and industrial R&D intelligence teams handling high-stakes intellectual property filings from the World Intellectual Property Organization (WIPO / PCT), the European Patent Office (EPO), the United States Patent and Trademark Office (USPTO), the Japan Patent Office (JPO), and the German Patent and Trade Mark Office (DPMA).

---

## 1. Multi-Column Patent Layout Topologies & Recursive Claims Dependency Trees

Patent publications exhibit some of the most rigid and legally sensitive formatting constraints in technical literature. A single misplaced antecedent basis, altered claim numbering, or dropped paragraph tag can invalidate an entire priority filing or trigger rejection during international examination.

### 1.1 Gazette Document Decomposition & Line Numbering Pruning
Patent specifications (such as USPTO A1/B2 publications, EPO A1/B1 patents, and WIPO WO pamphlets) employ either dense two-column layouts with embedded margin line numbers (5, 10, 15, 20...) or single-column specifications with strictly formatted paragraph identifiers (`[0001]`, `[0002]`, `[0025]`):
1. **Margin Line Number Separation**: Standard OCR engines frequently concatenate margin line numbers into adjacent patent prose, corrupting technical descriptions. The patent parser isolates line numbers via vertical geometric projection grids and spatial margin variance, stripping them during semantic translation while recording their vertical anchoring baselines.
2. **Column Gutter & Topological Reading Order**: When encountering multi-column patent pages, the engine constructs a Directed Acyclic Graph (DAG) across bounding boxes $B_i = (x_0, y_0, x_1, y_1)$. Left-column claim hierarchies are resolved completely before traversing the right-column boundary, ensuring that legal clauses and qualifying phrases remain uninterrupted.
3. **Patent Frontmatter Classification**: International Patent Classification (IPC) codes, CPC classifications, cited patent literature (INID codes `[56]`, `[54]`, `[71]`, `[72]`), and abstract bounding boxes are parsed into structured key-value metadata fields rather than unstructured text.

### 1.2 Claims Dependency Hierarchy Tree Parser
Patent claims constitute the legal boundary of an invention. The claims translation sub-pipeline executes an exhaustive grammatical dependency analysis:
- **Independent Claims Isolation**: Independent claims (e.g., *"1. A semiconductor device comprising..."*) are parsed as root nodes in the claim forest.
- **Dependent Claims Recursive Traversal**: Dependent claims (e.g., *"4. The semiconductor device of claim 1, further comprising..."*) are linked to their respective parent nodes via explicit antecedent pointers. 
- **Punctuation & Semicolon Integrity**: Legal patent practice requires transitional phrases (*"comprising"*, *"consisting essentially of"*) to precede indented subparagraphs delimited by semicolons and ending with a single terminating period. The translation transformer preserves exact punctuation hierarchies and capitalization rules across target languages, preventing syntactical drift that could compromise legal enforceability ([Academic Paper & Patent Translation Engine](https://www.geyi.net/translate/paper)).

---

## 2. Chemical Markush Structures, Reaction Schemes & IUPAC Nomenclature

In pharmaceutical, biotechnology, and material science patents, documents are dominated by chemical structures, generic Markush representations, peptide/nucleotide sequence listings, and multi-step synthetic reaction pathways.

### 2.1 Markush Grouping & Generic Radical Preservation
1. **Core Scaffold & Variable Substituent Segmentation**: Markush structures represent combinatorial chemical classes with generic cores and variable radicals ($R_1, R_2, R_3, X, Y$). The visual parser identifies 2D chemical structure bounding boxes and isolates radical definition tables (e.g., *"wherein $R_1$ is selected from the group consisting of $C_{1}-C_{6}$ alkyl, halogen, and substituted aryl..."*).
2. **Visual Block Freezing**: Chemical diagrams, stereochemical wedges, dotted coordination bonds, and heterocyclic rings are treated as non-textual graphical primitives. The engine assigns cryptographic visual tokens (`<CHEM_VECTOR_SCENE_ID>`) to these regions, rendering them into high-resolution vector layers that bypass text translation entirely.
3. **IUPAC Systematic Name Invariance**: Chemical names spanning multiple lines (e.g., *"(2R,3S)-3-(4-chlorophenyl)-N,N-dimethyl-2-(pyridin-2-yl)butanamide"*) are protected against erroneous hyphenation, word splitting, or literal translation of organic prefixes (*ortho-, meta-, para-, tert-, cis-, trans-*).

### 2.2 Conversion to Searchable Technical Markdown
For patent intelligence analysts conducting freedom-to-operate (FTO) searches or prior-art invalidation studies, the system converts complex multi-column patent gazettes into cleanly structured Markdown and LaTeX files with embedded vector graphics via the **[Scientific PDF to Markdown & LaTeX Converter](https://www.geyi.net/pdf-to-markdown)**.

---

## 3. Engineering Drawings & Numerical Callout Spatial Reconciliation

Mechanical, electrical, and aerospace patents contain extensive technical drawings (Drawings sheets) featuring reference numerals (e.g., `10` chassis, `12a` actuator, `14b` hydraulic manifold) that correspond to detailed description sections in the specification.

### 3.1 Cross-Sheet Callout Indexing & Vector Matching
1. **Reference Numeral Extraction**: During specification parsing, an inverted index of all parenthetical and inline reference numerals is compiled (e.g., *"rotor (104)", "stator (106)"*).
2. **Drawing Sheet Coordinate Mapping**: On patent drawing sheets, optical character recognition identifies standalone alphanumeric callout labels alongside leader lines and arrows pointing to mechanical components.
3. **Bilingual Callout Consistency**: When generating bilingual patent documents, the engine verifies that every reference numeral in the translated description exactly mirrors the original drawing sheet callout. Zero numbers are translated, modified, or omitted.

### 3.2 Dual-Layer Synchronized PDF Typesetting
The output engine generates a synchronized dual-layer or side-by-side patent PDF where:
- The source language column and the translated column align horizontally at every paragraph identifier (`[0015]`, `[0016]`).
- Vector drawing sheets are preserved at original vector fidelity with identical aspect ratios and resolution.
- Font metrics are dynamically recalibrated so that target language text fits strictly within standard patent office margin constraints (e.g., 2.5 cm top/left, 2.0 cm right/bottom).

---

## 4. Integration with Zotero 7–9 via `zotero-geyi-translator`

To support patent attorneys, technology transfer offices (TTO), and university IP licensing teams, the open-source **`zotero-geyi-translator`** extension provides native desktop workflow integration:

### 4.1 Automated Patent Metadata Extraction & Attachment Sync
- **Patent Item Recognition**: When a patent is added to Zotero (via Google Patents, Espacenet, Patentscope, or USPTO PDF import), the plugin automatically detects the publication number, filing date, assignee, and inventor metadata.
- **One-Click Translation**: Right-clicking the patent attachment initiates the background translation pipeline via secure TLS.
- **Automated Dual-Format Output**: Upon task completion, the plugin automatically downloads both a searchable bilingual translated patent PDF and a structured Markdown technical summary, attaching them directly to the parent Zotero metadata record ([Zotero Integration Plugin](https://www.geyi.net/zotero-plugin)).

### 4.2 Security, Confidentiality & Ephemeral Processing
Intellectual property prior to publication or under active examination requires rigorous confidentiality guarantees:
- **Zero Data Retention for Training**: Patent documents processed through the API are never retained for model retraining or persistent corpus caching.
- **End-to-End Encryption**: Document payloads and translation tokens travel over TLS 1.3 with AES-256-GCM encryption.
- **PKCE Authentication**: Desktop authentication relies on local PKCE authorization with ephemeral access tokens, ensuring institutional research credentials remain uncompromised.
