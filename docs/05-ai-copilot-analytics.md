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

