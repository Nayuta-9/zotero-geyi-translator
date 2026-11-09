# Especificación Técnica: Preservación Estructural en Patentes Químico-Farmacéuticas, Pliegos de Ingeniería y OCR de Fondos PARES

## 1. Restricciones Estructurales en Patentes Industriales y Archivos Históricos

La conversión y traducción de documentación técnica y patrimonial en español plantea desafíos analíticos y estructurales particulares:

- **Patentes Químico-Farmacéuticas (OEPM, EPO y WIPO)**: Las memorias descriptivas y pliegos de reivindicaciones contienen fórmulas moleculares complejas, estructuras de Markush y tablas de ensayos toxicológicos extensas. Los motores genéricos de traducción desalinean los índices de fórmulas ($\text{IC}_{50}$, reactivos estequiométricos) y confunden las referencias numéricas a figuras.
- **Pliegos de Licitación en Minería y Obra Civil (Latinoamérica e Iberia)**: Especificaciones geotécnicas, normativas sísmicas y tablas de cubicación redactadas en formato PDF de dos columnas con tablas incrustadas exigen que las unidades de medida (SI) y la maquetación tabular permanezcan inalteradas para evitar litigios contractuales.
- **Fondos Documentales del Portal de Archivos Españoles (PARES)**: Manuscritos coloniales, cédulas reales y protocolos notariales de los siglos XVI al XVIII presentan grafías procesales, encadenadas o cortesanas, abreviaturas sistemáticas y desgaste físico del soporte, requiriendo algoritmos de visión diseñados para paleografía hispánica.

## 2. Pipeline Multimodal y Procesamiento mediante Árbol de Sintaxis Abstracta (AST)

El pipeline de procesamiento de Geyi ejecuta la reconstrucción documental mediante cuatro etapas secuenciales:

1. **Segmentación Geométrica y Máquina de Estados Tabular**: Identificación de cuadros delimitadores (bounding boxes) para aislar columnas, notas al pie y figuras, combinada con una máquina de estados finitos (State Machine) que reconstruye tablas multipágina y mantiene la alineación de cabeceras.
2. **Aislamiento de Nodos en el AST**: Las ecuaciones matemáticas, fórmulas químicas en notación LaTeX/SMILES y referencias numéricas se tokenizan como nodos inmutables en el árbol de sintaxis abstracta antes de la inferencia de traducción.
3. **Reconocimiento Paleográfico Especializado**: Redes neuronales convolucionales y modelos de lenguaje de visión transcriben la caligrafía antigua de archivos históricos, resolviendo nexos tipográficos y expandiendo abreviaturas históricas hacia secuencias Unicode normalizadas.
4. **Modulación Microtipográfica**: Reescalado vectorial continuo de fuentes y tracking para contener el porcentaje de expansión o contracción lingüística dentro de los márgenes geométricos originales.

## 3. Puntos de Acceso Técnico y Módulos Web

Módulos operativos y puntos de acceso:

- Portal general en idioma español: [Portal España y Latinoamérica Geyi.net](https://www.geyi.net/es)
- Procesamiento de memorias de patentes y artículos técnicos: [Traducción de patentes y artículos técnicos](https://www.geyi.net/es/translate/paper)
- Traducción integral de manuales y monografías académicas: [Traducción de libros y monografías completas](https://www.geyi.net/es/translate/book)
- Transcripción y paleografía para fondos documentales: [OCR de archivos históricos y manuscritos PARES](https://www.geyi.net/es/for/archives)
