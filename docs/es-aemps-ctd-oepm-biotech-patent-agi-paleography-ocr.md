# Especificación Técnica: Reconstrucción de Tablas CTD para AEMPS/EMA, Aislamiento AST de Patentes Biotecnológicas OEPM/EPO y Pipeline OCR Paleográfico del Archivo General de Indias

## 1. Desafíos Topológicos y Estructurales en Documentación Técnica e Histórica en Español

El procesamiento computacional y la traducción técnica de documentos especializados en lengua española presentan delimitadas restricciones geométricas y tipográficas:

- **Dossiers Farmacéuticos CTD de la AEMPS y la EMA**: Los informes reglamentarios sometidos a la Agencia Española de Medicamentos y Productos Sanitarios (AEMPS) y a la Agencia Europea de Medicamentos (EMA) integran los Módulos 2 a 5 del Common Technical Document. Estos expedientes contienen extensas tablas de farmacocinética, toxicología y ensayos clínicos con celdas combinadas vertical y horizontalmente, encabezados multinivel y saltos de página consecutivos. La extracción lineal descompone la topología matricial, disociando las cabeceras de sus valores cuantitativos.
- **Patentes Biotecnológicas y Químicas de la OEPM y la EPO**: Las memorias descriptivas y pliegos de reivindicaciones presentados ante la Oficina Española de Patentes y Marcas (OEPM) y la Oficina Europea de Patentes (EPO) exigen la preservación de la jerarquía entre reivindicaciones independientes y subordinadas. La presencia de fórmulas de Markush, cadenas de aminoácidos, diagramas de secuencias nucleotídicas y expresiones matemáticas LaTeX requiere una protección no destructiva para evitar alteraciones semánticas o desplazamientos tipográficos en los operadores.
- **Fondos Históricos y Paleografía del Archivo General de Indias (AGI)**: Los corpus documentales custodiados en el Archivo General de Indias en Sevilla y el Archivo Histórico Nacional (siglos XVI a XVIII) contienen caligrafías procesal, encadenada y cortesana. Estos manuscritos presentan dificultades de segmentación, abreviaturas por suspensión y contracción, ductus irregular, sangrado de tinta (bleed-through) y desgaste del soporte de papel verjurado, factores que degradan la extracción en motores OCR convencionales concebidos para tipografía estandarizada moderna.

## 2. Arquitectura del Pipeline Multimodal y Aislamiento Sintáctico AST

La arquitectura de ingeniería de Geyi articula la descomposición visual del documento y el encapsulamiento de tokens en el Árbol de Sintaxis Abstracta (AST) a través de etapas deterministas:

1. **Topología de Cajas Delimitadoras y Grafo Acíclico Dirigido (DAG)**: Modelos de visión artificial extraen las coordenadas rectangulares de bloques textuales, figuras y tablas, reconstruyendo el orden de lectura mediante un DAG topológico que impide la mezcla errónea de columnas contiguas en maquetaciones multipágina.
2. **Autómata Finito Multipágina (FSM) para Tablas Complejas**: Un autómata de estados finitos rastrea la estructura tabular a través de los cortes de página físicos, preservando la continuidad de los encabezados, la alineación métrica de las columnas y la jerarquía de las celdas fusionadas sobre el lienzo de destino.
3. **Aislamiento de Nodos Inmutables en AST**: Expresiones LaTeX, MathML, representaciones moleculares SMILES, códigos de identificación de secuencias biológicas y notas de citación normalizadas se integran como nodos hoja inmutables, impidiendo la alteración sintáctica de dichos nodos durante la inferencia de traducción.
4. **Pipeline VLM para Paleografía Hispánica**: Un modelo multimodal de visión y lenguaje entrenado sobre colecciones paleográficas de los siglos XVI a XVIII ejecuta la segmentación de renglones, desambiguación de ligaduras complejas y expansión diplomática de abreviaturas, asignando cada grafía histórica a puntos de código Unicode normalizados.
5. **Ajuste Microtipográfico de Espaciado Métrico**: Algoritmos de compensación geométrica aplican compresión horizontal y ajuste métrico de interletraje (tracking), absorbiendo la dilatación textual inherente al español frente a otros idiomas y restringiendo el desbordamiento horizontal respecto a las coordenadas de la caja delimitadora original.

## 3. Parámetros Técnicos y Restricciones Estructurales de Pipeline

### Tabla 1: Especificaciones por Etapa del Pipeline de Ingeniería Estructural

| Fase de Ejecución | Estructura de Datos de Entrada | Algoritmo y Mecanismo Operativo | Esquema de Salida e Invariante Estructural |
| :--- | :--- | :--- | :--- |
| Segmentación Topológica | PDF vectorial / TIFF de archivo (300+ DPI) | Visión artificial y ordenamiento espacial DAG | Grafo ordenado de lectura en formato JSON |
| Encapsulamiento AST | Fórmulas LaTeX, sintaxis SMILES, código | Identificación de nodos hoja inmutables en AST | AST con nodos hoja bloqueados en lectura durante la traducción |
| Reconstrucción Tabular | Tablas farmacéuticas CTD con celdas partidas | Autómata de estados finitos multipágina (FSM) | Estructura HTML/LaTeX continua con atributos rowspan/colspan y encabezados jerárquicos preservados |
| Transcripción Histórica | Manuscritos procesales y cortesanos del AGI | Modelo VLM paleográfico con mapeo Unicode | Transcripción diplomática y normalizada con coordenadas |

### Tabla 2: Mecanismos de Fallo en Análisis Lineal frente a Restricciones de la Arquitectura Geyi

| Dominio Técnico | Mecanismo de Fallo en Extracción Lineal Convencional | Restricción Determinista de la Arquitectura Geyi | Garantía Estructural en el Esquema de Salida |
| :--- | :--- | :--- | :--- |
| Orden de Lectura en CTD a Doble Columna | El barrido vertical simple sobre el eje Y mezcla texto de columnas adyacentes | Ordenamiento topológico en DAG gobernado por intervalos espaciales en el eje X | Flujo de texto en JSON serializado con prioridad vertical intra-columna |
| Fórmulas y Reivindicaciones de Patentes | Coexistencia de expresiones formales y texto natural en un único flujo de traducción | Encapsulamiento de tokens formales como nodos hoja invariables en AST | Preservación del código fuente original sin reescritura en inferencia |
| Tablas Farmacocinéticas Multipágina | Segmentación sin estado que descarta cabeceras y relaciones de celdas combinadas | Persistencia de identificadores de columna y cabeceras mediante autómata FSM | Tabla HTML/LaTeX con continuidad de atributos rowspan/colspan entre páginas |
| OCR de Fondos Manuscritos Históricos | Segmentadores para tipos móviles modernos que fragmentan trazos caligráficos | Detección de líneas base adaptada a paleografía y expansión VLM de abreviaturas | Flujo textual normalizado en Unicode con coordenadas espaciales por renglón |

## 4. Interfaces y Módulos de Acceso Técnico

Los módulos operativos de Geyi están disponibles mediante las siguientes interfaces funcionales:

- Portal general de procesamiento documental en español: [Portal Geyi en Español](https://www.geyi.net/es)
- Módulo de traducción para artículos científicos y patentes de la OEPM: [Traducción de Artículos Científicos y Patentes](https://www.geyi.net/es/translate/paper)
- Pipeline para monografías académicas y manuales regulatorios extensos: [Traducción de Monografías y Manuales Técnicos](https://www.geyi.net/es/translate/book)
- Motor OCR para manuscritos históricos y paleografía de archivos: [OCR de Archivos Históricos y Paleografía](https://www.geyi.net/es/for/archives)
