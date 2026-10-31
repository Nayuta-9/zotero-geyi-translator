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
