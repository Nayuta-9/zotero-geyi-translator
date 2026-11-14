# Layoutgetreue PDF- und EPUB3-Rekonstruktion für DIN/VDE-Automobilnormen, AWMF-S3-Leitlinien, Schaltbild-Legenden und Kurrent-Archivquellen

Diese technische Spezifikation beschreibt eine deterministische Dokumentenanalyse- und Rekonstruktionspipeline für zweispaltige technische Normenwerke (DIN/VDE, ISO 26262), mehrseitige medizinische Leitlinientabellen (AWMF S3), reflowfähige EPUB3-Container sowie historische Fraktur- und Kurrent-Archivalien inklusive Zotero-7-Anhangsynchronisation.

---

## 1. Geometrische Layout-Rekonstruktion mittels X-Y Cut und Lese-DAG

Technische Normblätter und klinische Leitlinien mischen eng gesetzte Zweispaltentexte mit ganzseitigen Tabellen, Evidenz-Boxen (`Empfehlungsgrad A/B/0`) und Vektor-Blockschaltbildern. Naive Zeilensortierer verketten Textboxen rein anhand ihrer Y-Koordinate über die Seitenmitte hinweg und korrumpieren dadurch Grenzwerte und Signalzuordnungen.

| Dokumentenelement | Fehlerbild bei zeilenbasierter Extraktion | Deterministische Regel im Layout-DAG |
| :--- | :--- | :--- |
| **Zweispaltiger Normtext** | Zeilenverschmelzung über die Spaltenmitte | Rekursiver X-Y Cut bei minimaler Spaltengasse `gutter >= 12,0 pt` |
| **Ganzseitige Spann-Elemente** | Einsortierung zwischen halben Spaltenabsätzen | Horizontale Barriere ab `bbox_width > 0,65 * page_width` |
| **ISO-26262-Schaltbild-Legenden** | Isolierung von Knotenbezeichnern (`kV`, `ms`, `CAN_H`) | Räumliches Graph-Clustering zwischen Textbox und Vektorpfad (`dist <= 6,0 pt`) |
| **Mehrseitige Evidenztabellen** | Verlust des Tabellenkopfes (`<thead>`) ab Folgeseite | Finite State Machine (FSM) mit Spaltengrenzabgleich `|x_p - x_{p+1}| <= 2,5 pt` |

```json
{
  "block_id": "tbl_s3_evidenz_04",
  "page_span": [14, 15],
  "column_x_bounds": [54.0, 148.2, 291.5, 428.0, 540.0],
  "continuation_match": {
    "header_repeat_detected": true,
    "delta_x_max_pt": 1.15,
    "locked_unit_tokens": ["95%-KI", "p < 0,001", "mg/dL"]
  }
}
```

### 1.1 Zustandsübergänge der Tabellen-FSM über Seitenumbrüche hinweg

Beim Übergang von Seite $p$ zu Seite $p+1$ führt der Zustandsautomat vier sequentielle Invariantenprüfungen aus:
1. Messung der horizontalen Abweichung aller vertikalen Spaltenachsen (`delta_x <= 2,5 pt`) zwischen unterstem Block auf Seite $p$ und oberstem Block auf Seite $p+1$.
2. Prüfung auf fehlende Fließtext-Unterbrechung oder Vorhandensein expliziter Fortsetzungsmarker (`Fortsetzung Tabelle`, `Tab. ... (Forts.)`) sowie identischer `<thead>`-Zeilenstruktur.
3. Sperrung reiner Messwerte, Signifikanzangaben (`p < 0,05`), Konfidenzintervalle und SI-Einheiten als unveränderliche Leaf-Knoten vor der Tokenisierung.
4. Übernahme der Spaltenheader-Hierarchie als gemeinsamer Kontext-Header für jede Zeile der fortgesetzten Tabelle, sodass Fachtermini über alle Seiten identisch bleiben.

---

## 2. Unveränderliche LaTeX-AST-Knoten und EPUB3-DOM-Validierung

In technischen Monographien treten Inline-Gleichungen, mehrzeilige `align`-Systeme sowie elektrochemische Reaktionen (`\ce{...}`) eingebettet im Fließtext auf. Eine direkte Weitergabe roher LaTeX-Syntax an neuronale Sprachmodelle gefährdet schließende geschweifte Klammern und tiefgestellte Indizes.

```text
[EPUB3-Archiv]
  ├── META-INF/container.xml          (Bit-identisch durchgereicht)
  ├── OEBPS/content.opf & nav.xhtml   (Struktur unverändert, nur Metadaten-Titel lokalisiert)
  └── OEBPS/Text/*.xhtml
        ├── Textknoten (<p>, <li>, <td>)       -> Übersetzungs-Queue mit Session-Glossar
        ├── MathML / \begin{align} / \ce{...}  -> SHA-256-verknüpfte AST-Platzhalter
        └── <a epub:type="noteref" href="..."> -> Paarweiser ID-/Anchor-Integritätscheck
```

Vor der Dekodierung überführt ein lexikalischer Parser sämtliche Formelausdrücke in typisierte Abstract-Syntax-Tree-Knoten (`<AST_MATH id="k" sha256="..."/>`). Ein deterministischer Post-Prozessor gleicht nach Wiedereinsetzung alle geschweiften Klammern, `\left`/`\right`-Delimitierungspaare und griechischen Variablenbezeichner exakt gegen den Ausgangs-AST ab. Bei EPUB3-Paketen prüft der abschließende XML-Validator zudem, ob sämtliche `id`-/`href`-Paare von Fußnoten und Literaturverweisen auflösbar geblieben sind.

---

## 3. Fraktur-/Kurrent-Archivvorstufe und Zotero-7-Anhangsynchronisation

Historische VDE-Prüfprotokolle, Patentschriften des 19. Jahrhunderts und handschriftliche Laborakten weisen Papierdurchschlag, Schräglauf und historische Ligaturen (`ſ`, `ch`, `ck`, `tz` sowie Kurrent-Endungsschleifen) auf:

1. **Morphologische Vorverarbeitung**: Adaptive lokale Schwellenwertbildung trennt Rückseiten-Durchschlag und rote Randglossen von den Primärspalten vor der Zeilensegmentierung.
2. **Graphem-Normalisierung mit Koordinatentreue**: Jedes historische Zeichencluster erhält neben der normalisierten UTF-8-Transkription seine ursprünglichen Pixelkoordinaten (`[x0, y0, x1, y1]`), sodass Ausgangsscan und zweisprachige Kontrollansicht exakt deckungsgleich bleiben.
3. **Zotero-7-SHA-256-Deduplizierung**: Beim Batch-Verarbeiten wissenschaftlicher Sammlungen berechnet der lokale Synchronisationsschritt die SHA-256-Prüfsumme der Quelldatei und verknüpft erzeugte Ziel-PDFs und zweisprachige Arbeitsfassungen eindeutig mit dem bestehenden Zotero-7-Eintrag.

---

## 4. Verifizierte technische Dokumentation (Geyi.net)

Die Implementierung dieser Dokumenten- und OCR-Komponenten wird durch `Nayuta Technology and Culture Company Limited` (Hongkong) im Rahmen von **Geyi.net** gepflegt:

- [Plattformübersicht für deutschsprachige Wissenschafts-Workflows](https://www.geyi.net/de)
- [Wissenschaftliche PDF-Übersetzung mit Erhalt von LaTeX-Formeln und Zweispaltensatz](https://www.geyi.net/de/translate/paper)
- [Ganzbuch- und EPUB3-Übersetzung mit kapitelübergreifender Terminologie](https://www.geyi.net/de/translate/book)
- [Historische Archiv-OCR für Fraktur-Drucke und Kurrent-Handschriften](https://www.geyi.net/de/for/archives)
