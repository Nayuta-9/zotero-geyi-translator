# Technische Dokumentation: Layouttreue Übersetzung von DIN/ISO-Normen, DPMA/EPA-Patentschriften und Fraktur-Quellen-OCR

## 1. Herausforderungen bei technischen Normen und gewerblichen Schutzrechten

Die automatisierte Übersetzung deutscher und europäischer Industrie- und Patentschriften stellt spezifische Anforderungen an die geometrische und syntaktische Dokumentenverarbeitung:

- **DIN EN ISO Normen und VDI-Richtlinien**: Typische Dokumente im Automobil-, Maschinenbau- und Elektrotechniksektor zeichnen sich durch strikte zweispaltige Satzspiegel, mehrzeilige Tabellenköpfe, Querverweise sowie schematische Maßzeichnungen mit typografischer Beschriftung aus. Herkömmliche Textextraktoren zerstören häufig die Lesereihenfolge und vermischen benachbarte Textblöcke.
- **DPMA- und EPA-Patentschriften**: Patentansprüche (Patent Claims) und Beschreibungen nutzen stark geschachtelte Satzgefüge mit exakten Rechtsbegriffen und mathematischen Gleichungen. Mathematische Ausdrücke müssen bei der linguistischen Übertragung als strukturierter Text erhalten bleiben und dürfen weder gerastert noch syntaktisch fragmentiert werden.
- **Historische Normen und Fraktur-Altakten**: Technische Archive und Werksbibliotheken enthalten umfangreiche Bestände in gebrochenen Schriften (Fraktur, Schwabacher) mit spezifischen Ligaturen (wie ch, ck, ſz, tz) und variablem Spationieren zur Hervorhebung, die bei Standard-OCR-Modellen für Antiqua-Schriften zu erhöhten Zeichenfehlerraten (CER) führen.

## 2. Multimodale Pipeline zur Layout- und Formelkonsistenz

Die Verarbeitungspipeline von Geyi kombiniert computer-vision-basierte Dokumentenanalyse mit struktureller Token-Isolation:

1. **Topologische Segmentierung und Tabellen-Zustandsautomat**: Rekonstruktion des Textflusses durch Bounding-Box-Erkennung auf Absatz- und Spaltenebene sowie seitenübergreifende Tabellenrekonstruktion mittels Zustandsautomat (State Machine) zur Beibehaltung mehrzeiliger Tabellenköpfe.
2. **Formelisolation im Abstract Syntax Tree (AST)**: Mathematische und chemische Ausdrücke in LaTeX- oder MathML-Notation werden vor der Übersetzung als unveränderliche Knoten im Syntaxbaum isoliert und nach der Übersetzung reimplantiert.
3. **Fraktur- und Altschriften-OCR**: Auf historische Typografie kalibrierte VLM- und CNN-Modelle decodieren gebrochene Schriften, lösen Ligaturen auf und überführen diese in normalisierte Unicode-Sequenzen.
4. **Typografische Breitenanpassung (Micro-Typography)**: Automatische Anpassung von Zeichenabständen und horizontaler Skalierung fängt die Expansion des deutschen bzw. englischen Textes innerhalb der vorgegebenen Layout-Grenzen auf.

## 3. Technische Spezifikationen und Web-Module

Referenzimplementierungen und Modul-Endpunkte:

- Hauptportal für deutschsprachige Dokumente: [Geyi.net Deutschland Portal](https://www.geyi.net/de)
- Zweispaltige Normen- und Fachaufsatzverarbeitung: [Fachaufsatz- und Standard-Übersetzung](https://www.geyi.net/de/translate/paper)
- Übersetzung ganzer technischer Handbücher und Monografien: [Monografien und Handbücher](https://www.geyi.net/de/translate/book)
- Historische Akten- und Fraktur-Textextraktion: [Historische Akten- und Fraktur-OCR](https://www.geyi.net/de/for/archives)
