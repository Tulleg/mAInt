# 🤖 5. KI-Leitstand, RAG-Copilot & Prompt-to-Chart

Pfad in der Anwendung: `SYSTEM > KI-Leitstand (Analytics)` (`/analytics`)

## Konzept
Kombination aus **Retrieval-Augmented Generation (RAG)** über PostgreSQL `pgvector`, **Predictive Maintenance** und einem **schreibgeschützten NL-to-SQL Agenten** mit gehärtetem AST-Sicherheitsfilter.

---

## 1. Störungs-Copilot & Mitlernendes RAG
Beim Tippen einer Störungsmeldung analysiert das System den Text und bietet drei Soforthilfen:
1. **Duplikaterkennung:** Prüft offene Aufträge am selben Equipment auf inhaltliche Überschneidung und warnt vor Doppel-Meldungen.
2. **Historische Lösungen:** Durchsucht den Vektor-Index (`order_history_embeddings`) nach den 3 ähnlichsten erfolgreich behobenen Störungen inkl. damals verbauter Ersatzteile.
3. **Dokumentations-Entwurf:** Formuliert automatisch einen normgerechten, strukturierten Text mit Schadenscode-Vorschlag.

> **Kontinuierliches Lernen:** Sobald ein Techniker einen Auftrag abschließt (`TABG`), wird das Paar *(Symptom + Ursache + durchgeführte Lösung + Ersatzteile)* automatisch im HNSW-Index vektorisiert.

---

## 2. Predictive Maintenance
- **MTBF-Trend:** Berechnet die mittlere Betriebszeit zwischen zwei Ausfällen.
- **Intervall-Drift:** Verkürzen sich die Ausfallintervalle um mehr als 20 %, generiert das System eine priorisierte Warnung für den Wartungsplaner.

---

## 3. Prompt-to-Chart & Gehärteter SQL Analytics Agent
Geben Sie beliebige Fragen in die Suchleiste ein, z. B.:
> *"Vergleiche die Stillstandszeiten und Anzahl der Aufträge nach Anlage im aktuellen Monat"*

### 3.1 Gehärtete Sicherheits-Guards (Security & Injection-Schutz)
Um schädliche Befehle oder unbefugte Datenabflüsse auszuschließen, prüft der Agent jede generierte SQL-Abfrage vor der Ausführung:
1. **Strikte Read-Only Whitelist:** Ausschließlich `SELECT`- und `WITH` (CTE)-Statements sind zulässig.
2. **Keyword-Sperrliste:** DDL- und DML-Befehle wie `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `GRANT`, `CREATE`, `EXEC`, `COPY`, `CALL`, `SET` sowie PostgreSQL-Funktionen (`pg_sleep`, `pg_read_file`, `information_schema`, `pg_catalog`) sind strikt verboten und lösen sofort eine Ausnahme aus.
3. **Mandanten-Isolation (Tenant Guard):** Jede Abfrage muss zwingend nach der aktuellen Mandanten-ID (`tenantId`) filtern.
4. **Schutz sensitiver Daten:** Spalten wie `password_hash`, `users`, `api_key` und `secret` sind vollständig gesperrt.

### 3.2 Visualisierung & Planung
- Die Daten werden automatisch als passendes Diagramm (**Recharts**: Bar, Line, Pie) oder sortierbare Datentabelle gerendert.
- **Geplanter E-Mail-Report:** Über den Button *"Als E-Mail-Report planen"* kann die Abfrage als periodischer Cron-Job (z. B. montags 07:00 Uhr) hinterlegt werden.

### 3.3 Diagramm-Favoriten & Live-Refresh (Auto-Polling)
Um wiederkehrende Auswertungen und Leitstand-Dashboards im Schichtbetrieb nicht jedes Mal neu anfragen zu müssen, können KI-generierte Recharts-Diagramme dauerhaft in die linke Seitenleiste angepinnt und mit automatischen Live-Polling-Intervallen versehen werden.

#### 3.3.1 Diagramme anpinnen (Zu Favoriten hinzufügen)
- **Aktion im Chart-Header:** Über den Button `[⭐ Zu Favoriten hinzufügen]` (bzw. `[⭐ Zu Favoriten]`) wird das aktuell visualisierte Recharts-Diagramm im Profil des angemeldeten Benutzers (`user_saved_views`) persistiert.
- **Persistierte Parameter:**
  - Gewählter Diagrammtyp (`bar` für Säulen-, `line` für Linien-, `pie` für Kreisdiagramm oder `table` für Datentabelle)
  - Vollständige SQL-Analyseabfrage & Filterparameter
  - Titel der Auswertung und Aggregationsdimensionen
  - Konfiguriertes Auto-Refresh-Intervall (`refreshInterval`)
- **Sofortige Verfügbarkeit in der linken Seitenleiste:**
  - Nach dem Speichern erscheint die Ansicht unmittelbar in der linken Seitenleiste unter der Sektion **Favoriten**.
  - Ein Klick auf den Favoriteneintrag in der Seitenleiste stellt das Diagramm inklusive aller Parameter, Farbcodierungen und Filterwerte direkt im Workspace wieder her, ohne dass die Abfrage erneut formuliert oder vom LLM synthetisiert werden muss.

#### 3.3.2 Konfigurierbare Polling-Intervalle (Live-Refresh)
Über das Dropdown `🔄 Auto-Refresh:` im Header der Diagrammansicht lässt sich eine zyklische Aktualisierung für Dashboards und Werkstatt-Monitore festlegen:
- **`Aus` (0s):** Standard-Einstellung für Ad-hoc-Auswertungen ohne zyklische Hintergrundabfragen.
- **`30s` (30 Sekunden):** Schneller Takt für operative Schichtmonitore, akute Stillstandsüberwachung und Prio-1-Notfälle.
- **`60s` / `1m` (60 Sekunden):** Standard-Intervall für Fertigungsleitstände und Schichtleiter-Übersichten.
- **`300s` / `5m` (300 Sekunden / 5 Minuten):** Ressourcenschonender Intervallmodus für Großbildschirme, Hallen-Terminals und Langzeit-Trends.

#### 3.3.3 Technischer Hintergrund & Barrierefreiheit
- **Hintergrund-Polling (`useInterval`):** Das Polling wird im Client über einen entkoppelten Hook (`useInterval`) gesteuert. Bei Ablauf des Intervalls werden die Kennzahlen im Hintergrund asynchron neu abgefragt und das Recharts-Diagramm ohne Flackern oder Neuladen der Gesamtanwendung aktualisiert.
- **Lifecycle & Speicherbereinigung:** Beim Verlassen der Ansicht oder Unmounten der Diagrammkomponente wird der Timer garantiert bereinigt (`clearInterval`), um Memory-Leaks oder unnötige Serverlast zu verhindern.
- **Visuelle Indikation in der Seitenleiste:** Sobald ein aktives Refresh-Intervall (`refreshInterval > 0`) für einen Favoriten konfiguriert ist, wird am rechten Rand des Sidebar-Eintrags eine dezent-prägnante Monospace-Intervall-Pill (z. B. `30s`, `60s`, `300s`) eingeblendet.
- **Copilot-Steuerung per Prompt:** Nutzer können das Intervall alternativ über natürliche Sprache anpassen (z. B. *"Aktualisiere dieses Diagramm alle 30 Sekunden"* oder *"Auto-Refresh ausschalten"* ➔ Copilot-Intent `UPDATE_VIEW_CONFIG`).

### 3.4 Vergrößerungs- & Vollbild-Inspektion (Chart-Zoom-Modal)

Für fundierte Root-Cause-Analysen im Schichtbetrieb reicht eine kompakte Inline-Diagrammansicht oft nicht aus. Über das Vergrößern-Icon **`Maximize2`** (`[⛶ Vergrößern]`) im Chart-Header können Instandhalter, Planer und Schichtleiter jedes Diagramm direkt im Conversational Workspace in eine hochauflösende Vollbild-Inspektionsansicht überführen.

#### 3.4.1 Einsatzszenarien auf Hallen-Terminals & Industrie-Tablets
- **Touch-optimierte Peak-Analyse:** Auf Werkstatt-Terminals und robusten Industrie-Tablets (z. B. Panasonic Toughbook, iPad in Schutzhülle) vergrößert das Modal die Arbeitsfläche auf bis zu `92vh` Bildschirmhöhe und bietet mindestens `60vh` bis `65vh` reine Recharts-Rendering-Fläche.
- **Feingranulare Differenzierung:** Kleine Säulen oder feine Linienausschläge (z. B. Mikrostillstände von 5–15 Minuten an Roboterachsen oder Förderstrecken), die in der Inline-Card übersehen werden könnten, werden mit deutlichen Abständen, vollen Beschriftungen und individueller Farbkodierung isolierbar.
- **Detaillierte Tooltip-Inspektion:** Beim Berühren oder Hovern einer Säule liefert ein erweitertes Tooltip-Panel sofort:
  - Exakte Stillstandsdauer in Stunden und Minuten
  - Betroffene Baugruppe / Komponente
  - Anzahl der kumulierten Einzelstörungen / Vorfälle
  - Zugewiesene Prioritätsstufe (Prio 1 Notfall bis Prio 4 Niedrig)

#### 3.4.2 Interaktive Steuerungsoptionen im Zoom-Modal
- **Zeitraum-Schnellumschaltung:** Über die integrierte Zeitraum-Leiste im Modal-Footer kann die Analyse direkt zwischen verschiedenen Zeitfenstern umgeschaltet werden:
  - `7 Tage` (Kurzfristige Schichttrends & akute Brennpunkte)
  - `30 Tage` (Standard: Monatlicher Stillstandsvergleich)
  - `90 Tage` (Quartalsauswertung & Bad-Actor-Erkennung)
- **Dynamische KI-Erkenntnis:** Passend zum gewählten Betrachtungszeitraum aktualisiert das Modal die KI-Erkenntniszeile (z. B. *"50% der Stillstände betreffen Antriebsüberlastungen in Zelle 1"*).
- **Direktes Favorisieren & Tabellen-Sprung:**
  - `[⭐ Zu Favoriten]`: Das Diagramm kann direkt aus der Großansicht für die linke Seitenleiste gespeichert werden.
  - `[📋 Als Tabelle]`: Schaltet das Modal sofort in die zugrundeliegende tabellarische Detailansicht mit Filtermöglichkeit um.

### 3.5 Client-seitige Multi-Format-Exporte (Diagramme & Tabellen)

Für Berichte an die Betriebsleitung, Schichtübergaben, Audits sowie vertiefende Detailanalysen in externen Tabellenkalkulationen bietet der KI-Leitstand und Conversational Workspace standardisierte Multi-Format-Export-Funktionen für Diagramme und Auftragstabellen.

Die Export-Aktionen sind über intuitive Dropdown-Menüs (`[📥 Exportieren]`) direkt im Header jeder Diagrammansicht (sowohl in der Inline-Ansicht als auch im Vollbild-Zoom-Modal) sowie im Header dynamischer Tabellen integriert.

#### 3.5.1 Diagramm-Exporte: PNG & Management-PDF
- **PNG-Export (`exportChartToPng`):**
  - **Einsatzbereich:** Erstellung hochauflösender Rastergrafiken für Präsentationen (z. B. PowerPoint, Keynote), Schichtübergabeberichte, Intranet-Artikel oder E-Mails.
  - **Hohe Auflösung (Retina / 2x):** Das Recharts-SVG wird geklont, serialisiert und auf ein temporäres HTML5-Canvas mit doppelter Skalierung (`scale = 2`) gezeichnet.
  - **Deckender Hintergrund:** Automatisches Rendern eines neutralweißen Hintergrunds (`#ffffff`), sodass Diagramme auch auf dunklen Folien oder transparenten Dokumenten optimal lesbar und kontrastreich bleiben.
  - **Dateibenennung:** Automatische Normalisierung des Titels mit aktuellem Datumsstempel (z. B. `ausfallzeiten_nach_equipment_2026-10-23.png`).

- **PDF-Export (`exportChartToPdf`):**
  - **Einsatzbereich:** Druckfertige A4-Management-Summary für Abteilungsleiter, Instandhaltungsleiter und Werksleitung.
  - **Format & Layout:** DIN A4 Querformat (`297mm × 210mm`), client-seitig erzeugt mit `jsPDF`.
  - **MaintAI Corporate Header:** Markanter, professioneller Kopfbereich in Schiefergrau (`slate-800`), MaintAI-Branding und rechtsbündigem, minutengenauem Zeitstempel im deutschen Format (`Exportiert am: DD.MM.YYYY, HH:MM Uhr`).
  - **Typografie & Struktur:** Titel (16pt fett), Kontext-Untertitel (*"Stillstandszeiten- & Störungsanalyse • MaintAI Conversational Workspace"*), feine Trennlinie sowie zentriert skaliertes Diagramm unter exakter Wahrung des Seitenverhältnisses.
  - **Audit-Footer:** Integrierter Vertraulichkeitshinweis (*"MaintAI Smart Maintenance Platform • Vertraulich • Nur für interne Instandhaltungszwecke"*) und Paginierung (*"Seite 1 von 1"*).

#### 3.5.2 Tabellen-Exporte: Excel (.xlsx) & CSV (RFC-4180 mit UTF-8-BOM)
- **Excel-Export (`exportTableToExcel`):**
  - **Einsatzbereich:** Strukturierte Weiterverarbeitung in Microsoft Excel oder LibreOffice Calc ohne Formatierungsaufwand.
  - **Ergonomische Auto-Spaltenbreiten:** Die generierte `.xlsx`-Arbeitsmappe (`Aufträge`) definiert optimierte Spaltenbreiten für industrielle Kennungen (`Auftragsnummer`: 18 Zeichen, `Priorität`: 14 Zeichen, `Titel`: 42 Zeichen, `Equipment`: 26 Zeichen, `Status`: 16 Zeichen, `ErstelltAm`: 20 Zeichen).
  - **Prioritäts-Mapping:** Roh-Enums werden in verständliche deutsche Bezeichnungen formatiert (`1 - Notfall`, `2 - Hoch`, `3 - Mittel`, `4 - Niedrig`).

- **CSV-Export (`exportTableToCsv`):**
  - **Einsatzbereich:** Universeller Datenaustausch für ERP-Systeme, Skripte, relationale Importe und Tabellenkalkulationen.
  - **Deutsches Format (Semikolon):** Verwendet das in der DACH-Region übliche Semikolon (`;`) als Trennzeichen (Standard für deutsche Excel-Installationen, bei denen das Komma als Dezimaltrenner dient).
  - **UTF-8-BOM (`\uFEFF`):** Der CSV-Payload wird mit einer expliziten UTF-8 Byte Order Mark versehen. Dies garantiert, dass Microsoft Excel unter Windows und macOS die Datei ohne manuelle Kodierungsauswahl direkt mit korrekten deutschen Umlauten (ä, ö, ü, ß) öffnet.
  - **RFC-4180-Konformität:** Sicheres Escaping (`escapeCsvCell`) von Feldern bei enthaltenen Semikolons, Anführungszeichen (`""`) und Zeilenumbrüchen (`\r\n`).

#### 3.5.3 100% Client-seitige Ausführung: Offline-Fähigkeit & DSGVO-Konformität

> [!IMPORTANT]
> **Datenschutz & PWA-Offline-Souveränität:**  
> Sämtliche Export-Routinen (`exportChartToPng`, `exportChartToPdf`, `exportTableToCsv`, `exportTableToExcel`) laufen **vollständig client-seitig im Browser des Anwenders** ab. Es findet zu keinem Zeitpunkt eine Übertragung von Bilddaten, Tabellenwerten, Personalbezügen oder Anlagenparametern an externe Rendering-Server oder Cloud-Dienste statt.

1. **DSGVO / GDPR-Compliance:** Höchster Schutz für sensible Betriebs- und Störungsdaten. Betriebsgeheimnisse, Ausfallursachen und Auftragsdaten verlassen niemals den lokalen Arbeitsspeicher des Client-Endgeräts.
2. **Offline-Fähigkeit (PWA):** Techniker und Meister auf Hallen-Tablets können Auswertungen und Auftragsübersichten auch dann als PDF, Bild, CSV oder Excel exportieren, wenn das Gerät im Funkloch (z. B. Reinraum, Untergeschoss, abgeschirmte Produktionszelle) vorübergehend offline ist.
3. **Null Latenz & Keine Serverlast:** Der Export erfolgt ohne HTTP-Roundtrip in wenigen Millisekunden und entlastet das Backend vollständig.

---

## 4. Navigationsstandards & Absprünge

Gemäß den **Design- & Navigationsrichtlinien** (`docs/design-rules.md`):
- **Einstieg:** Über die Seitenleiste unter `SYSTEM > KI-Leitstand (Analytics)` (`/analytics`) oder per Direktsprung aus dem Conversational Workspace.
- **Standardisierter Rücksprung:**
  - Jede Auswertungsansicht bietet einen barrierefreien Rücksprung-Button mit dem Lucide-Icon **`ArrowLeft`** und mindestens **44px Touch-Höhe** (`min-h-[44px]`).
  - Direkte Absprungpfade:
    - `[Zu Aufträge & Störungen]` ➔ `/orders`
    - `[Gantt-Board]` ➔ `/planning`

---

## 5. KI-gestützte dynamische Schicht- & Workspace-Begrüßung

Auf dem Dashboard und im Conversational Workspace (`/`) wird der angemeldete Instandhalter oder Schichtleiter mit einer kontextuellen Begrüßungszeile empfangen.

### 5.1 Funktionsweise & Server Action (`generateDynamicGreetingAction`)
- **Server Action:** `generateDynamicGreetingAction(params)` (`src/actions/greeting-actions.ts`)
- **Parameter:** `{ firstName: string, role?: string, shiftContext?: 'MORNING' | 'NOON' | 'AFTERNOON' | 'EVENING' | 'NIGHT', plantName?: string }`
- **Zeitfenster-Erkennung (ShiftContext):**
  - `MORNING`: 05:00 - 10:59 Uhr (Frühschicht)
  - `NOON`: 11:00 - 13:59 Uhr (Mittag / Schichtübergabe)
  - `AFTERNOON`: 14:00 - 17:59 Uhr (Nachmittagsschicht)
  - `EVENING`: 18:00 - 21:59 Uhr (Spätschicht)
  - `NIGHT`: 22:00 - 04:59 Uhr (Nachtschicht)
- **KI-Generierung:** Ruft den konfigurierten Provider (`ILlmProvider` via Gemini, OpenAI oder Ollama) mit Low-Temperature (`0.7`) und striktem System-Prompt auf:
  > *"Du bist der humorvolle, aber professionelle KI-Assistent einer industriellen Fertigung (MaintAI). Generiere eine einzige kurze Begrüßungszeile (maximal 6 bis 8 Wörter) für {firstName} ({role}), passend zur Tageszeit {shiftContext}. Antworte NUR mit dem Begrüßungssatz, keine Anführungszeichen, keine Erklärungen."*
- **Deterministischer Fallback-Pool:**
  - Jeweils 4 feste, erprobte Varianten pro Zeitfenster (z. B. *"Moin {name}! Bereit für die Frühschicht?"* oder *"Gute Nachtschicht {name}! Die Hallen laufen stabil."*).
  - Garantiert verzögerungsfreie und konsistente Auslieferung bei Offline-Betrieb oder API-Timeouts.

