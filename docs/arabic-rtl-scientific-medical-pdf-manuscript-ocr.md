# Academic Arabic RTL Document Processing & Classical Islamic Manuscript OCR Pipeline

## 1. Engineering Challenges in Arabic Academic & Historical Documents

Processing scientific papers and historical manuscripts in Arabic involves distinct architectural requirements that standard optical character recognition and translation engines fail to address:
- **Bi-Directional (BiDi) Layout Recomposition**: When translating left-to-right (LTR) English or French scientific papers into Arabic, the overall document orientation flips to right-to-left (RTL). However, embedded mathematical equations, tensor variables, chemical formulas, and Latin citations must strictly maintain LTR directionality. Linear token flipping results in inverted mathematical expressions and corrupted equations.
- **Dual-Column Grid Alignment**: Clinical and engineering publications in journals like *IEEE* or *Springer* feature narrow multi-column grids. Inversion of reading order without visual bounding-box remapping causes severe paragraph interleaving and graphic clipping.
- **Complex Cursive Calligraphy in Archival Manuscripts**: Historical manuscripts across Ottoman, Andalusian, and Maghrebi archives written in Ruq'ah, Naskh, and Diwani scripts feature non-horizontal baseline drifts, ligatures, and diacritics (Harakat) that defy standard horizontal segmentation.

## 2. Multi-Modal Parsing & Directional Bounding-Box Matrix

The pipeline decouples textual flow from visual block coordinates to achieve bidirectional layout integrity:

```
[ Scientific Dual-Column PDF or Archival Manuscript ]
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│  Multi-Modal Visual Segmenter (YOLOv8-Doc)       │
│  - Bounding-box coordinate extraction            │
│  - Identification of RTL paragraphs vs. LTR math │
│  - Isolation of tables, captions, and references │
└────────────────────────┬─────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│  Classical Arabic Glyph Recognizer (ResNet-CTC)  │
│  - Baseline tracking for non-linear calligraphy  │
│  - Disambiguation of complex historical ligatures│
│  - Mapping to Unicode Arabic presentation forms  │
└────────────────────────┬─────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│  RTL Typographical Layout Rebuilder              │
│  - Mirroring column progression (Right to Left)  │
│  - Embedding protected LTR formulas via Typst    │
└──────────────────────────────────────────────────┘
```

## 3. Specialized Academic Workflows & Tool Access

To support academic researchers, translation bureaus, and historical manuscript archivists:
- Full-text academic research translation is provided by the [Academic Research Paper Translation Portal](https://www.geyi.net/ar/translate/paper).
- Digital extraction and transcription of classical manuscripts is supported via the [Historical Archives and Manuscript OCR System](https://www.geyi.net/ar/for/archives).
- Standardized medical translation compliant with the Unified Medical Dictionary (UMD) is available through the [Medical and Clinical Translation Module](https://www.geyi.net/ar/for/medical).
- General document layout preservation for technical reports is accessible via the [Document Translation Platform](https://www.geyi.net/ar/translate/pdf).
