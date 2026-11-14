# Especificación de Ingeniería: Estudios de Impacto Ambiental (SERNAGEOMIN/ANLA), Autómata FSM Multipágina, AST LaTeX y OCR Paleográfico Histórico (BNE/AGI)

Esta especificación técnica documenta los invariantes geométricos, las reglas de continuidad multipágina mediante autómata de estados finitos (FSM), el aislamiento sintáctico AST de expresiones LaTeX, la conservación estructural DOM en libros electrónicos EPUB3 y el flujo de OCR paleográfico integrado con Zotero 7.

---

## 1. Reconstrucción de flujo mediante partición X-Y Cut y grafo de lectura DAG

Los Estudios de Impacto Ambiental (EIA) presentados ante SERNAGEOMIN, ANLA o SENACE entrelazan normativa técnica a doble columna, cartografía hidrogeológica vectorial con cotas UTM y extensos apéndices de laboratorio. Cuando un analizador secuencial ordena bloques exclusivamente por su coordenada vertical Y, fusiona renglones contiguos de la columna izquierda con la derecha si coinciden sus líneas base, destruyendo la correspondencia entre parámetros fisicoquímicos y valores límite.

| Elemento del EIA | Modo de fallo en extracción lineal | Regla determinista en el DAG geométrico |
| :--- | :--- | :--- |
| **Normativa técnica a doble columna** | Fusión transversal de líneas contiguas entre columnas | Partición recursiva X-Y Cut con medianil mínimo `gutter >= 12.0 pt` |
| **Cartografía hidrogeológica / figuras anchas** | Intercalado entre párrafos parciales de columna | Nodo barrera de ancho completo si `bbox_width > 0.65 * page_width` |
| **Rótulos de perfil estratigráfico** | Desacoplamiento de unidades (`m³/s`, `mg/L`, `µS/cm`) | Vinculación espacial euclidiana frente a segmentos vectoriales (`dist <= 6.0 pt`) |
| **Matrices de laboratorio multipágina** | Pérdida de jerarquía `<thead>` desde la segunda hoja | Autómata FSM multipágina con tolerancia de ejes X `\|x_p - x_{p+1}\| <= 2.5 pt` |

El módulo geométrico extrae primitivas vectoriales y cajas de texto nativas del PDF para ensamblar un grafo acíclico dirigido (DAG) de orden de lectura determinista:

- **Detección de medianiles (`gutter >= 12.0 pt`)**: la partición recursiva X-Y Cut proyecta histogramas verticales para identificar separaciones continuas entre columnas sin fracturar fórmulas centradas.
- **Barreras de ancho completo (`bbox_width > 0.65 * page_width`)**: toda figura panorámica o ecuación ancha actúa como nodo barrera que separa estrictamente los subgrafos superior e inferior antes de generar la secuencia final.
- **Vinculación espacial de rótulos cartográficos (`dist <= 6.0 pt`)**: las anotaciones breves sobre perfiles estratigráficos (`m³/s`, `mg/L`, `µS/cm`) se asocian por distancia euclidiana a sus segmentos vectoriales próximos para conservar la referencia física de la leyenda.

---

## 2. Máquina de estados finitos (FSM) para matrices hidrogeológicas multipágina

Las tablas de balance hídrico, calidad de aguas superficiales y límites máximos permisibles suelen fragmentarse entre tres y doce páginas consecutivas. Si la canalización reinicia el contexto en cada salto de hoja, desaparecen los encabezados jerárquicos `<thead>` a partir de la segunda página y aparecen inconsistencias léxicas entre secciones idénticas.

```json
{
  "block_id": "matriz_hidrogeologica_eia_07",
  "page_span": [21, 22],
  "column_x_bounds": [48.0, 142.5, 276.0, 412.8, 548.0],
  "continuation_match": {
    "header_repeat_detected": true,
    "delta_x_max_pt": 1.32,
    "locked_unit_tokens": ["CAS 7440-38-2", "mg/L", "pH 6,5-8,5"]
  }
}
```

### 2.1 Transiciones de estado del autómata FSM entre páginas

Al detectar un bloque tabular junto al margen inferior de la página $p$ y otro bloque al margen superior de la página $p+1$, el autómata finito evalúa cuatro invariantes deterministas antes de fusionar ambos fragmentos:

1. **Consistencia de límites de columna en el eje X**: verificación geométrica de que los límites horizontales X coinciden dentro de una tolerancia máxima de `2,5 pt` respecto al bloque tabular padre.
2. **Continuidad estructural inter-páginas**: comprobación de ausencia de párrafos narrativos intermedios o detección explícita de indicadores (`Continuación`, `Tabla ... (cont.)`) y fila `<thead>` repetida.
3. **Bloqueo de nodos hoja no modificables**: aislamiento estricto de códigos químicos CAS, identificadores de estaciones de monitoreo, cifras experimentales y unidades SI antes del procesamiento lingüístico.
4. **Propagación de jerarquía y glosario**: herencia completa del árbol de encabezados y de la memoria terminológica de sesión sobre todas las filas concatenadas.

---

## 3. Aislamiento AST de fórmulas LaTeX y conservación DOM en EPUB3

Las ecuaciones hidrodinámicas de flujo subterráneo, operadores diferenciales y fórmulas estequiométricas presentes en tratados de ingeniería o monografías académicas requieren protección sintáctica antes de cruzar cualquier modelo de lenguaje. Un analizador léxico previo aísla cada bloque matemático (`$...$`, `align`, `cases`) dentro de un árbol sintáctico abstracto (AST) y lo reemplaza por un marcador tipado con suma de verificación SHA-256. Tras la generación bilingüe, un validador comprueba el equilibrio exacto de llaves, delimitadores e índices algebraicos frente al AST original.

```text
[Contenedor EPUB3]
  ├── META-INF/container.xml          (Passthrough bit a bit sin mutación)
  ├── OEBPS/content.opf & nav.xhtml   (Estructura preservada; metadatos localizados)
  └── OEBPS/Text/*.xhtml
        ├── Nodos textuales (<p>, <li>, <td>)    -> Traducción con glosario de sesión
        ├── MathML / \begin{align} / \ce{...}    -> Marcadores AST con SHA-256
        └── <a epub:type="noteref" href="...">   -> Verificación biunívoca id / href
```

En obras extensas de más de 400 páginas distribuidas en formato **EPUB3**, la canalización edita únicamente los nodos textuales dentro de `OEBPS/Text/*.xhtml`. Tanto `META-INF/container.xml`, `content.opf` y los subárboles `MathML` como la correspondencia biunívoca de pares `id` / `href` en notas al pie `epub:type="noteref"` pasan validación DOM estricta antes de reempaquetar el archivo destino.

---

## 4. OCR paleográfico para archivos BNE/AGI, deduplicación Zotero 7 y referencias

Los manuscritos coloniales e impresos tempranos depositados en la Biblioteca Nacional de España (BNE) y el Archivo General de Indias (AGI) presentan transparencia de tinta ferrogálica en el reverso, renglones inclinados y abreviaturas notariales (`q̃`, `Dho.`, `ſ` larga). Una etapa de umbralización morfológica adaptativa separa las manchas por transparencia del papel y aísla las glosas marginales antes de segmentar cada renglón. Cada fragmento reconocido conserva sus coordenadas `[x0, y0, x1, y1]` exactas sobre el facsímil junto con formas normalizadas indexables. En flujos bibliográficos con Zotero 7, el cálculo previo de la huella SHA-256 sobre los adjuntos PDF evita reprocesamientos redundantes y vincula automáticamente los ejemplares bilingües.

Documentación técnica de referencia mantenida por `Nayuta Technology and Culture Company Limited` (Hong Kong):

- [Entorno técnico multilingüe en español](https://www.geyi.net/es)
- [Traducción de artículos científicos y expedientes técnicos PDF con LaTeX intacto](https://www.geyi.net/es/translate/paper)
- [Traducción integral de monografías académicas y libros EPUB3/PDF](https://www.geyi.net/es/translate/book)
- [OCR paleográfico para manuscritos históricos y archivos documentales](https://www.geyi.net/es/for/archives)
