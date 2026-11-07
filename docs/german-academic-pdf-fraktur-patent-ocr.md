# Zotero 7–9 Leitfaden: Zweispaltige PDF-Übersetzung mit LaTeX-Erhalt, EPA/DPMA-Patentschriften & Fraktur/Kurrent-OCR

Dieser technische Leitfaden beschreibt die Architektur und Arbeitsabläufe des Open-Source-Plugins **`zotero-geyi-translator`** in Zotero 7–9 für Universitätsinstitute (unter anderem Max-Planck-Gesellschaft, TU München, RWTH Aachen, ETH Zürich, Universität Wien), Patentanwaltskanzleien sowie Staatsarchive und Bibliotheken im deutschsprachigen Raum (DACH).

Die zugrundeliegende Übersetzungs- und Dokumentenanalyseplattform wird bereitgestellt von **[Geyi.net — KI-Plattform für akademische PDF-Übersetzung](https://www.geyi.net/de)**.

---

## 1. Zweispaltige wissenschaftliche PDF-Übersetzung & Erhalt von LaTeX-Gleichungen

Bei der Übersetzung englischer Fachaufsätze (IEEE, ACM, Springer, Wiley, Elsevier, arXiv) ins Deutsche führen herkömmliche Machine-Translation-Engines häufig zu Spaltenkollisionen, abgeschnittenen Formeln und unbrauchbaren mathematischen Symbolen. Das Zotero-Plugin löst diese Herausforderungen auf Dokumentenebene:

### 1.1 Strukturierte Spaltenerkennung & Lesefluss-Rekonstruktion
1. **Topologische Segmentierung**: Der Dokumenten-Parser analysiert Bounding-Boxen von Textabschnitten, Kopf- und Fußzeilen, Fußnoten und Bildunterschriften. Bei zweispaltigem Satz wird die Leserichtung pro Seite über einen gerichteten azyklischen Graphen (DAG) exakt rekonstruiert.
2. **Einfrieren mathematischer LaTeX-Kerne**: Alle Inline-Symbole (`$...$`) sowie Display-Formeln (`$$...$$`, `\begin{equation}...\end{equation}`) werden vor der Übergabe an das neuronale Sprachmodell in unveränderliche Token serialisiert. Indizes, Exponenten, Summenzeichen und Matrizen bleiben im Ziel-PDF typografisch exakt an ihrer Originalposition erhalten.
3. **Direkte Verarbeitung in Zotero**: Nach Auswahl eines Eintrags in Zotero genügt ein Klick auf „Mit Geyi übersetzen“. Der Dienst erzeugt ein zweisprachiges PDF (Gegenüberstellung oder synchrone Ausrichtung) und hängt es direkt an den übergeordneten Bibliothekseintrag an ([Wissenschaftliche Zeitschriftenaufsätze übersetzen](https://www.geyi.net/de/translate/paper)).

---

## 2. 500-Seiten-Monographien & EPA/DPMA-Patentschriften

Für umfangreiche Forschungsliteratur und gewerbliche Schutzrechte greift das Plugin auf spezialisierte Langdokument-Pipelines zu:

### 2.1 Monographien, Dissertationen und Fachbücher bis 500 Seiten
Wissenschaftliche Monographien und Lehrbücher ab 100 Seiten werden automatisch an die asynchrone Buch-Pipeline übergeben. Diese stellt sicher, dass ein einheitliches Fachglossar über alle Kapitel hinweg konsistent angewendet wird und Inhaltsverzeichnisse sowie Querverweise synchron bleiben ([Fachbücher und Monographien übersetzen](https://www.geyi.net/de/translate/book)).

### 2.2 Patentschriften (EPA, DPMA, WIPO, USPTO)
Bei technischen Offenlegungsschriften und Patentschriften ist absolute Präzision gefordert:
- **Erhalt der Patentansprüche (Claims)**: Die hierarchische Nummerierung der Haupt- und Unteransprüche bleibt unverändert erhalten.
- **Bezugszeichen und Zeichnungen**: Sämtliche Bezugszeichen in der Beschreibung werden exakt mit den technischen Zeichnungen abgeglichen, ohne dass Satzstrukturen fragmentiert werden.
- **Nomenklatur in Chemie und Pharmazie**: IUPAC-Namen, Strukturformeln und Mengenangaben werden ohne Interpretationsdrift übertragen.

---

## 3. Historische Archive: OCR für Fraktur, Schwabacher und Kurrentschrift

Für historische Bestände aus Staatsarchiven, Universitätsbibliotheken und Kirchenbüchern (16. bis frühes 20. Jahrhundert) bietet das System eine spezialisierte OCR-Architektur:

- **Gebrochene Schriften**: Zuverlässige Erkennung historischer Druckschriften (Fraktur, Schwabacher, Gotisch) einschließlich historischer Ligaturen (ch, ck, ſz/ß, tz) und des langen s (ſ).
- **Deutsche Handschriften**: Verarbeitung digitalisierter Kurrent- und Sütterlin-Manuskripte aus Archivbeständen.
- **Strukturierte Bereitstellung**: Extrahierte Texte können als bereinigtes Markdown mit Erhalt der Seiten- und Absatzstrukturen exportiert werden ([Historische Archive & Dokumenten-OCR](https://www.geyi.net/de/for/archives)).

---

## 4. Konfiguration im Zotero-Zusatzmodul

1. Öffnen Sie in Zotero **Werkzeuge → Plugins** und installieren Sie das Release `zotero-geyi-translator.xpi`.
2. Öffnen Sie die Zotero-Einstellungen im Reiter **Geyi-Übersetzer**.
3. Verknüpfen Sie Ihr Benutzerkonto über die passwortlose Browser-Autorisierung (PKCE mit SHA-256).
4. Wählen Sie als Zielsprache **Deutsch (`de`)** und aktivieren Sie bei Bedarf die zweisprachige PDF-Generierung.
