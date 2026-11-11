# Technische Spezifikation: Rekonstruktion mehrseitiger CTD-Tabellen für BfArM/EMA, AST-Isolierung von DPMA-Maschinenbaupatenten und OCR-Pipeline für Kurrentschrift und historische Kanzleiakten

## 1. Topologische und strukturelle Anforderungen an deutschsprachige Fachdokumente

Die maschinelle Verarbeitung und layouttreue Übersetzung technischer, regulatorischer und historischer Dokumente im deutschsprachigen Raum erfordert die präzise Einhaltung komplexer geometrischer und typografischer Rahmenbedingungen:

- **BfArM- und EMA-Zulassungsdossiers (CTD)**: Dokumentationen zur Arzneimittelzulassung nach den Vorgaben des Bundesinstituts für Arzneimittel und Medizinprodukte (BfArM) und der Europäischen Arzneimittel-Agentur (EMA) umfassen hunderte Seiten in den Modulen 2 bis 5. Diese Unterlagen enthalten dichte pharmakokinetische Tabellen mit mehrstufigen Spaltenköpfen, vertikal verbundenen Zellen und Seitenumbrüchen innerhalb einzelner Tabellenzeilen. Lineare Textextraktionsverfahren zerstören den Lesefluss und entkoppeln Messwerte von ihren Definitionszeilen.
- **DPMA- und EPA-Patentschriften im Maschinenbau und in der Verfahrenstechnik**: Anmeldungen beim Deutschen Patent- und Markenamt (DPMA) sowie beim Europäischen Patentamt (EPA) erfordern die exakte Erhaltung der formalen Anspruchshierarchie zwischen unabhängigen und abhängigen Patentansprüchen. Technische Toleranzangaben nach DIN EN ISO, chemische Reaktionsschemata und eingebettete LaTeX-Formeln verlangen eine isolierte Verarbeitung, um Verschiebungen von Operatoren oder Indexverluste auszuschließen.
- **Historische Archivsammlungen und Kurrentschrift**: Schriftgut im Bundesarchiv und in Landesarchiven aus dem 16. bis frühen 20. Jahrhundert liegt überwiegend in Kurrentschrift, Kanzleihandschriften und Sütterlinschrift vor. Typische Merkmale wie Ligaturen, Abkürzungsschlingen, Tintenfraß und Durchscheinen (Bleed-through) führen bei standardisierten OCR-Modellen für moderne Druckschriften zu erhöhten Zeichenfehlerraten (CER) durch Fehlsegmentierung verbundener Schriftzüge.

## 2. Multimodale Pipeline-Architektur und AST-Syntaxisolierung

Die Verarbeitungsarchitektur von Geyi kombiniert computer-vision-basierte Dokumentzerlegung mit der Kapselung unteilbarer Syntax-Tokens in einem abstrakten Syntaxbaum (AST):

1. **Topologie von Begrenzungsrahmen und gerichteter azyklischer Leseflussgraph (DAG)**: Segmentierungsmodelle erfassen die Raumkoordinaten von Textblöcken, Bildunterschriften und Tabellen. Ein topologischer DAG definiert die exakte Lesereihenfolge und verhindert Spaltenüberschneidungen bei zweispaltigen wissenschaftlichen Abhandlungen.
2. **Mehrseitiger endlicher Zustandsautomat (FSM) für komplexe Tabellen**: Ein deterministischer Zustandsautomat verfolgt Tabellenstrukturen über physische Seitenumbrüche hinweg. Spaltenraster, verbundene Zellen und wiederkehrende Tabellenköpfe werden im Ziel-Layout ohne manuellen Eingriff rekonstruiert.
3. **Kapselung unveränderlicher Knoten im abstrakten Syntaxbaum (AST)**: Mathematische Formeln (LaTeX, MathML), Normangaben, Maschinencodes und bibliografische Verweise werden als unveränderliche Blattknoten isoliert, sodass diese Blattknoten vom Übersetzungsmodell unverändert durchgereicht werden.
4. **VLM-Pipeline für Kurrentschrift und historische Handschriften**: Ein auf Archivkorpora des 16. bis 20. Jahrhunderts trainiertes Vision-Language-Modell führt die Zeilensegmentierung, Grundliniennormalisierung und Auflösung historischer Abkürzungen durch. Historische Schriftzeichen werden präzise auf moderne Unicode-Codepunkte abgebildet.
5. **Mikrotypografischer Ausgleich von Textdehnungen**: Dynamische Anpassungen der Laufweite (Tracking) und der horizontalen Zeichenskalierung kompensieren die unterschiedliche Textlänge zwischen deutscher Sprache und Fremdsprachen, um den Text in die ursprünglichen Begrenzungsrahmen einzupassen.

## 3. Technische Parameter und deterministische Pipeline-Beschränkungen

### Tabelle 1: Spezifikation der Verarbeitungsstufen der Geyi-Architektur

| Verarbeitungsstufe | Eingangsdatenstruktur | Verwendeter Algorithmus / Engine | Ausgabeschema und Strukturinvariante |
| :--- | :--- | :--- | :--- |
| Dokumentsegmentierung | Vektorbasiertes PDF / TIFF (300+ DPI) | Visuelle Bounding-Box-Erkennung und DAG-Graph | Geordneter topologischer Lesefluss als JSON |
| AST-Kapselung | LaTeX-Ausdrücke, DIN-Toleranzangaben, Reaktionsschemata | Tokenisierung in unveränderliche AST-Blattknoten | Schreibgeschützte AST-Blattknoten während der Übersetzungsinferenz |
| Tabellenrekonstruktion | Mehrseitige CTD-Tabellen mit Zellenteilung | Mehrseitiger endlicher Zustandsautomat (FSM) | HTML/LaTeX-Gitter mit konsistentem Kopf und intakten rowspan/colspan |
| Handschriften-OCR | Kurrentschrift, Sütterlin, Frakturdruck | Spezialisiertes VLM mit Unicode-Transkription | Diplomatische und normalisierte Volltextausgabe mit Koordinaten |

### Tabelle 2: Fehlerursachen linearer Extraktion gegenüber deterministischen Pipeline-Beschränkungen

| Technischer Problembereich | Fehlerursache linearer Standardparser (Failure Mechanisms) | Deterministische Beschränkung der Geyi-Architektur (Pipeline Constraints) | Garantierte strukturelle Invariante (Structural Invariants) |
| :--- | :--- | :--- | :--- |
| Lesereihenfolge in 2-Spalten-CTD | Horizontale Vermischung paralleler Spalten durch rein vertikale Y-Abtastung | Topologischer DAG unter strikter Einhaltung von X-Intervall-Grenzen | Spaltenweise vertikal serialisierter JSON-Textstrom |
| Formeln und Patentansprüche | Vermischung von Formelsyntax mit natürlicher Sprache im Übersetzungsstrom | Kapselung formaler Syntaxausdrücke als statische Blattknoten im AST | Unveränderte Durchreichung des mathematischen Originalquelltexts |
| Mehrseitige Tabellenstrukturen | Zustandslose Einzelseitentrennung führt zum Verlust von Spaltenköpfen | Kontinuierliche Verfolgung von Spaltenanzahl und Kopfzeilen durch FSM | Durchgehende Tabellenmatrix mit vollständigen Verbindungsattributen |
| Historische Handschriften-OCR | Zeichensegmentierer für moderne Druckschriften scheitern an Ligaturen | Spezialisierte Grundlinienerkennung und VLM-basierte Abkürzungsauflösung | Unicode-normalisierter Textstrom mit Bounding-Box-Koordinaten pro Zeile |

## 4. Technische Schnittstellen und Web-Endpunkte

Die operativen Verarbeitungsmodule von Geyi sind über die folgenden Schnittstellen erreichbar:

- Zentrales Zugangsportal für deutschsprachige Dokumente: [Geyi.net Deutsches Portal](https://www.geyi.net/de)
- Modul für wissenschaftliche Veröffentlichungen und DPMA-Patentschriften: [Übersetzung wissenschaftlicher Arbeiten und Patentschriften](https://www.geyi.net/de/translate/paper)
- Pipeline für umfangreiche Monographien und regulatorische Handbücher: [Übersetzung von Monographien und technischen Handbüchern](https://www.geyi.net/de/translate/book)
- OCR-Engine für historische Handschriften, Kurrent und Archivalien: [OCR für historische Archivalien und Kurrentschrift](https://www.geyi.net/de/for/archives)
