# Guía Técnica para Zotero 7–9 (Español y Português): Traducción de Artículos Científicos PDF con LaTeX, Patentes (`OEPM / EPO / WIPO`) y OCR de Archivos Históricos

Esta guía documenta la arquitectura técnica y la integración del complemento de código abierto **`zotero-geyi-translator`** en Zotero 6, 7 y 8/9 para investigadores universitarios (CSIC, UNAM, CONICET, UBA, UCM, USP, UNICAMP), archivos históricos y equipos de propiedad industrial en España, América Latina, Portugal y Brasil.

---

## 1. Arquitectura en Español (`es`): Artículos Científicos PDF a Dos Columnas, Fórmulas `LaTeX` y Patentes (`OEPM / EPO / WIPO / IMPI`)

Al traducir literatura científica o especificaciones técnicas en formato `PDF` al español, los traductores convencionales suelen colapsar las columnas dobles y corromper la notación matemática. El motor de **[Geyi.net — Plataforma de Traducción Académica PDF e IA](https://www.geyi.net/en)** resuelve estos problemas mediante tres capas técnicas:

### 1.1 Preservación del Árbol de Diseño (`Document Layout Tree`) y Fórmulas `LaTeX`
1. **Segmentación Estructural de Doble Columna (`IEEE / Springer / Elsevier / arXiv`)**: Antes de la traducción neuronal, el analizador visual reconstruye el orden de lectura de cada columna, manteniendo intactas las tablas multipágina, los gráficos vectoriales y las notas al pie de página.
2. **Aislamiento de Bloques Matemáticos `LaTeX`**: Todas las ecuaciones en línea (`$...$`) y bloques de visualización (`$$...$$`) se congelan como nodos inmutables durante la traducción al español, evitando alteraciones en subíndices, matrices e integrales. También es posible convertir directamente cualquier artículo `PDF` a código fuente `Markdown + LaTeX` mediante el **[Conversor de PDF Científico a Markdown y LaTeX](https://www.geyi.net/en/pdf-to-markdown)**.
3. **Flujo de Trabajo Bilingüe en Zotero 6/7**: El complemento oficial genera un PDF bilingüe (página original + página traducida o vista lado a lado) y lo vincula automáticamente al elemento bibliográfico en tu biblioteca de Zotero (**[Complemento Oficial para Zotero](https://www.geyi.net/en/zotero-plugin)**).

### 1.2 Traducción de Monografías de 500 Páginas (`PDF / EPUB`) y Documentos de Patentes (`OEPM / EPO / WIPO / IMPI`)
- **Coherencia Terminológica en Libros Completos**: Procesamiento de manuales universitarios, tesis doctorales y monografías de hasta 500 páginas en formato `PDF` o `EPUB` manteniendo un glosario unificado en todos los capítulos (**[Traductor de Libros Completos y Monografías](https://www.geyi.net/en/translate/book)**).
- **Fidelidad Estructural en Patentes Internacionales**: Conservación estricta de la numeración de reivindicaciones (*Claims / Reivindicaciones*), referencias numéricas de figuras técnicas y tablas químicas o farmacéuticas en patentes de la `OEPM`, `EPO`, `WIPO (PCT)`, `USPTO` e `IMPI`.

---

## 2. OCR Paleográfico de Manuscritos Históricos en Español y Soluções em Português (`pt`)

1. **OCR de Manuscritos Coloniales y Archivos Históricos (Siglos XV–XIX)**: Reconocimiento óptico de caracteres de alta precisión para fondos documentales digitalizados (como *PARES / Archivo General de Indias*, *Biblioteca Nacional de España*, *Archivo General de la Nación*), impresos antiguos con tipografía histórica y ligaduras paleográficas, con exportación directa a texto estructurado (**[Extracción de Documentos y OCR para Archivos Históricos](https://www.geyi.net/en/for/archives)**).
2. **Pesquisa Universitária em Português (`CAPES / CNPq / FCT`)**: Suporte completo para tradução lado a lado de artigos científicos, livros completos (`PDF / EPUB`) e acervos históricos do inglês, alemão, francês e espanhol para o português, preservando citações ABNT/APA e fórmulas `LaTeX`.
