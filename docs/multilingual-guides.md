# Configuring Zotero 7–9 Translation Pipelines, LaTeX Preservation & Terminology Glossaries

This technical guide explains how `zotero-geyi-translator` handles multi-column academic PDF layouts, mathematical notation, and scanned historical documents across supported languages.

---

## 1. Two-Column Layout Reconstruction & LaTeX Equation Preservation

Standard PDF translation tools often flatten two-column academic papers or corrupt inline mathematical symbols, subscripts, and numbered equation environments. When submitting a PDF from Zotero:

1. **Structural Block Detection**: Page regions are segmented into body paragraphs, two-column reading flows, figure/table captions, footnotes, and mathematical formula blocks.
2. **Formula Isolation**: Inline symbols (`$\alpha, \beta, \nabla$`) and display equations are preserved in place while surrounding prose is translated into the target language.
3. **Side-by-Side Bilingual Output**: Selecting the **Bilingual (`双语对照`)** output mode generates a synchronized side-by-side PDF attachment inside Zotero so researchers can verify equations and citations against the original source page ([Zotero Plugin Documentation](https://www.geyi.net/en/zotero-plugin)).

---

## 2. Handling 100–500 Page Monographs vs. Journal Articles

- **Journal Articles (< 100 pages)**: Processed via the real-time translation pipeline for rapid turnaround during literature reviews ([Academic Paper Translation](https://www.geyi.net/en/translate/paper)).
- **Academic Books & Dissertations ($\ge 100$ pages)**: Automatically routed to the asynchronous monograph pipeline ([Full-Book Translation](https://www.geyi.net/en/translate/book)), which enforces unified terminology and chapter-level layout continuity across up to 500 pages.

---

## 3. Scanned Archival PDFs & Structured Markdown Extraction

For non-born-digital PDFs (such as scanned archival holdings, vertical East Asian scripts, or historical European typefaces):

- Enable the high-precision OCR pipeline to extract structured text before translation, or convert complex scientific PDFs directly into clean Markdown and `LaTeX` source files via [Scientific PDF to Markdown](https://www.geyi.net/en/pdf-to-markdown).

---

## 4. In-Depth Language & Engineering Specifications

For specialized domain pipelines and language-specific OCR documentation, consult our detailed technical guides:

- [MFDS CTD Dossiers, KIPO Battery Patent AST & Gyujanggak Paleography OCR (식약처 CTD 규제 문서·특허청 배터리 특허 AST·규장각 고문서 OCR)](ko-mfds-ctd-kipo-battery-patent-gyujanggak-ocr.md)
- [AEMPS CTD Tables, OEPM Biotech Patent AST & Archivo General de Indias OCR (Tablas CTD AEMPS, Patentes OEPM & Paleografía AGI OCR)](es-aemps-ctd-oepm-biotech-patent-agi-paleography-ocr.md)
- [BfArM CTD Tables, DPMA Machinery Patent AST & Kurrentschrift Archival OCR (BfArM CTD-Tabellen, DPMA-Patente & Kurrentschrift-OCR)](de-bfarm-ctd-dpma-machinery-patent-kurrent-ocr.md)
- [TFDA CTD Dossiers, TIPO Semiconductor Patent AST & Qing Archival Vertical OCR (TFDA藥政CTD·TIPO專利AST·清代淡新檔案直排OCR)](zh-hant-tfda-ctd-tipo-patent-qing-archival-ocr.md)
- [INPI/EPO Patents, ANVISA Dossiers, SciELO Monographs & Luso-Brazilian Paleography OCR (Patentes INPI, ANVISA & OCR Paleográfico)](pt-inpi-patent-scielo-monograph-paleography-ocr.md)
- [Arabic BiDi RTL/LTR Mathematical AST, Regulatory Dossiers & Kufic/Naskh/Maghribi Manuscript OCR (معالجة الوثائق العلمية BiDi وعزل AST والمخطوطات العربية)](ar-bidi-math-ast-engineering-manuscript-ocr.md)
- [PMDA CTD Pharmaceutical Dossiers, JPO Chemical Patent Claims & Kuzushiji Vertical OCR (PMDA医薬品CTD・JPO化学特許・くずし字OCR)](ja-pmda-ctd-jis-patent-kuzushiji-ocr.md)
- [FDA/EMA Regulatory CTD Submissions, ICC Arbitration Bundles, LaTeX AST & Classical Paleography OCR](en-fda-ema-ctd-icc-arbitration-paleography-ocr.md)
- [DIN/ISO Engineering Standards & DPMA/EPA Patent Fraktur OCR Specification (DIN/ISO-Normen, DPMA/EPA-Patente & Fraktur-OCR)](de-din-iso-patent-fraktur-ocr.md)
- [AFNOR Aerospace Standards, Arbitration Legal Contracts & BnF Manuscript OCR (Normes Aérospatiales AFNOR, Droit & BnF OCR)](fr-afnor-aerospace-legal-bnf-ocr.md)
- [OEPM Pharma Patents, Civil Engineering Tenders & PARES Paleography OCR (Patentes OEPM, Licitaciones & PARES OCR)](es-oepm-pharma-patent-pares-ocr.md)
- [Traditional Chinese Monograph Translation, LaTeX AST & Classical Vertical OCR (臺灣與港澳原文書雙語精譯、LaTeX AST 與善本豎排 OCR)](zh-hant-monograph-medical-law-ocr.md)
- [International Law & Cross-Border Arbitration Contract PDF Bilingual Translation](international-law-arbitration-contract-pdf-bilingual-translation.md)
- [Semiconductor & IEEE Engineering Datasheet PDF LaTeX AST Translation](semiconductor-ieee-engineering-datasheet-pdf-latex-translation.md)
- [Japanese Legal/Patent Specification & Kuzushiji Archive OCR (日本語法務・特許明細書・くずし字OCR)](japanese-legal-patent-specification-kuzushiji-archive-ocr.md)
- [Korean Semiconductor/Patent/Medical PDF & Hanja OCR Pipeline (한국어 반도체·특허·의학 PDF 및 한자 OCR)](korean-semiconductor-patent-medical-pdf-hanja-ocr-pipeline.md)
- [Biomedical & Clinical PDF (IMRaD & Tables) Translation](biomedical-clinical-pdf-imrad-table-translation.md)
- [Pharmaceutical & Chemical Patent (Markush) Translation](pharmaceutical-chemical-patent-markush-pdf-translation.md)
- [Traditional Chinese Medical/Legal Monographs & Paleography OCR](traditional-chinese-medical-legal-textbooks-paleography-ocr.md)
- [Academic Arabic RTL Scientific PDF & Manuscript OCR](arabic-rtl-scientific-medical-pdf-manuscript-ocr.md)
- [Simplified Chinese (简体中文) Academic PDF, Monograph & Ancient OCR Guide](simplified-chinese-academic-pdf-book-ancient-ocr.md)
- [International Patent (WIPO/EPO/USPTO/JPO) Layout & Claims Architecture](international-patent-pdf-wipo-epo-uspto-layout-translation.md)
- [500-Page Academic Monograph & University Textbook Pipeline](whole-book-500-page-academic-monograph-pdf-epub-pipeline.md)
- [European Historical Archives (IT/NL/PL) Paleography & Monograph OCR](european-historical-archives-it-nl-pl-paleography-ocr.md)
- [Scientific PDF-to-Markdown, Multi-Column DAG & LaTeX AST Pipeline](scientific-pdf-to-markdown-latex-ast-pipeline.md)
- [Japanese Academic PDF & Kuzushiji OCR Guide](japanese-kuzushiji-academic-pdf.md)
- [Traditional Chinese Monographs & Classical OCR Guide](traditional-chinese-monographs-ocr.md)
- [Korean Academic PDF & Hanja OCR Guide](korean-academic-pdf-hanja-ocr.md)
- [German Academic PDF, EPA/DPMA Patents & Fraktur OCR](german-academic-pdf-fraktur-patent-ocr.md)
- [French Scientific PDF, Monographs & BnF Archival OCR](french-scientific-pdf-monograph-manuscript-ocr.md)
- [Russian Scientific PDF, GOST Layout & Archival OCR](russian-scientific-pdf-gost-archival-ocr.md)
- [Spanish Academic PDF, Patent & Archival OCR](spanish-portuguese-academic-patents.md)
- [Portuguese Academic PDF, EPUB & Archival OCR](portuguese-academic-pdf-epub-archives.md)
- [Arabic & Persian RTL Manuscript OCR](arabic-persian-rtl-manuscript-ocr.md)
- [Classical Latin & Ancient Greek Manuscript OCR](classical-latin-greek-manuscript-ocr.md)

