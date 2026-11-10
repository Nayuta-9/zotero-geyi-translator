# Engineering Specification: Layout-Preserving Translation for FDA/EMA Regulatory CTD Submissions, ICC Cross-Border Arbitration Evidentiary Bundles, LaTeX AST Isolation, and Classical Paleography OCR

## 1. Structural and Geometric Constraints in Regulatory, Legal, and Archival Documentation

Automated translation and digital extraction of regulatory, legal, and historical records require strict adherence to geometric layout topologies and syntactic invariant constraints:

- **FDA and EMA Regulatory Submissions**: Common Technical Document (CTD) dossiers submitted to the US Food and Drug Administration (FDA) and European Medicines Agency (EMA) encompass hundreds of pages across Modules 2 to 5. These files feature dense pharmacokinetic tables, multi-tiered header rows, split cells across page breaks, and complex cross-references. Traditional linear machine translation pipelines disrupt reading orders, decouple table captions from data cells, and invalidate page numbering schemes.
- **ICC Cross-Border Arbitration Bundles**: International commercial arbitration proceedings under ICC, LCIA, or UNCITRAL rules involve dense multilingual evidentiary bundles. Documents frequently feature bilingual side-by-side columns, contractual clauses with exact paragraph numbering, and interspersed signature blocks. Geometric displacement during translation creates ambiguities in contractual interpretation and evidentiary validity.
- **Archival Manuscripts and Classical Paleography**: Historical collections preserved in national archives contain scribal hands spanning Carolingian minuscule, Gothic bookhands, and diplomatic cursive scripts. These documents exhibit heavy abbreviation systems (suspensions, brevigraphs, superscript contractions), variable line spacing, ink bleed-through, and physical parchment deterioration, which induce elevated character error rates (CER) in standard commercial OCR engines.

## 2. Multimodal Pipeline Architecture and Syntactic Isolation

The engineering architecture of Geyi couples computer vision document decomposition with abstract syntax tree (AST) token encapsulation across four deterministic stages:

1. **Bounding-Box Topology and Reading-Order Directed Acyclic Graphs (DAG)**: High-resolution spatial segmentation models detect bounding boxes for text blocks, headings, formulas, and floating graphics. The system constructs a topological DAG to establish the exact reading sequence, eliminating cross-column bleed in multi-column layouts.
2. **Finite-State Machine (FSM) for Spanning Tables**: A stateful table parser tracks tabular structures across physical page breaks. Column hierarchies, cell boundaries, numeric alignments, and merged headers are stored and reconstructed deterministically in the target language layout canvas.
3. **Immutable Node Isolation in Abstract Syntax Trees (AST)**: Inline and block mathematical formulas (LaTeX and MathML notations), chemical SMILES strings, Markush representations, program source code, and citation anchors are parsed into the document AST as immutable leaf nodes. The translation layer processes only translatable natural language nodes, guaranteeing zero mathematical formula distortion or operator transposition.
4. **Paleographic Vision-Language OCR Pipeline**: Specialized neural OCR models trained on historical scribal corpora perform line segmentation, baseline normalization, and ligature expansion. Historical character variants are mapped directly to standardized Unicode representations, outputting dual diplomatic and normalized transcriptions.
5. **Micro-Typographical Kerning and Scaling Compensation**: Dynamic character tracking and horizontal font-compression algorithms adjust for linguistic expansion between source and target texts, ensuring all translated blocks fit precisely within their original bounding box constraints.

## 3. Technical Specifications and Web Endpoints

The core processing engines and architectural endpoints are accessible via the following operational interfaces:

- Central document processing portal: [Geyi.net Translation Portal](https://www.geyi.net/)
- Two-column academic papers and patent claims pipeline: [Academic Paper and Patent Translation](https://www.geyi.net/translate/paper)
- 500-page monographs, regulatory dossiers, and technical manuals: [Monograph and Technical Manual Pipeline](https://www.geyi.net/translate/book)
- Paleographic manuscript extraction and archival OCR engine: [Historical Manuscript and Archival OCR](https://www.geyi.net/for/archives)
