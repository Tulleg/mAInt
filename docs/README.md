# 📖 MaintAI – Benutzer- & Administratorhandbuch

Willkommen im zentralen Anwender- und Betriebshandbuch für **MaintAI**, der industriellen Instandhaltungsplattform (CMMS & SAP PM Middleware).

---

## 📑 Inhaltsübersicht

0. [Softwarearchitekturdokument (Architecture & Engineering)](./software-architecture.md)
   - Schichtenarchitektur, Drizzle Schema & pgvector RAG
   - Workflow-State-Engine, Guards & Audit-Trail
   - SAP PM/MM Adapter & Offline-First Sync-Engine
   - Architecture Decision Records (ADRs)
1. [Design-System & Navigationsrichtlinien](./design-rules.md)
   - Farbpalette, Industrial Dark Theme & WCAG Touch-Ergonomie
   - **Zwingender Standard-Zurück-Button (Lucide `ArrowLeft`, mind. 44px Touch-Höhe)**
   - Vollständige Pfad- und Absprung-Matrix
2. [Systemübersicht & Erste Schritte](#1-systemübersicht--erste-schritte)
3. [Workflow- & Auftragsarten-Konfiguration (Admin)](./01-workflow-admin.md)
   - Anlegen von Auftragsarten (IH01, IH02 etc.)
   - Visuelle Berechtigungs-Matrix (Rollen vs. Statuswechsel)
   - Guards & Prüfbedingungen (Pflichtprotokoll, Ist-Zeiten, SAP-Sync)
   - Standardisierter Rücksprung zur Administration
4. [SAP-Integration: Standalone vs. Enterprise-Sync & Anlagenverwaltung](./02-sap-integration.md)
   - Umschaltung der Betriebsmodi (Standalone, OData v4, BAPI)
   - 4-stufige Anlagenhierarchie (`Bereiche` ➔ `Plätze` ➔ `Equipments` ➔ `Baugruppen`) & Herkunftsflag (`source`)
   - Schreibschutz im aktiven SAP-Modus vs. manuelle Standalone-Pflege (RBAC `ADMIN`)
   - Materialbuchungen (Bewegungsart 261) & Failover in die `sap_sync_queue`
   - Idempotenter Warenausgang & Stammdatenabgleich aus SAP PM
5. [Visueller Prüfprotokoll-Vorlagen-Editor](./03-protocol-builder.md)
   - Designer für Inspektionschecklisten (JSON-Schema)
   - Messwerterfassung mit Min/Max-Toleranzen & Auto-Störungs-Trigger
   - Pflichtfotos und digitale Handunterschrift (Canvas)
   - Vorschau-Simulator (Mobile PWA vs. Desktop)
   - Direkte Verknüpfung aus der Auftragsdetailmaske
6. [Zyklische Wartungspläne & Batch-Pflege](./04-maintenance-plans-batch.md)
   - Zeit- und betriebsstundenbasierte Wartungszyklen
   - TanStack Data-Grid mit Inline-Editing per Tastatur
   - Sticky Bulk-Action-Bar für 50+ Positionen simultan
   - Schnelle Absprünge zu Equipments und Protokollen
7. [KI-Leitstand, RAG-Copilot & Gehärteter SQL Analytics Agent](./05-ai-copilot-analytics.md)
   - Störungs-Copilot mit Duplikaterkennung & mitlernendem `pgvector`-Gedächtnis
   - Predictive Maintenance Analyzer (MTBF & Intervall-Drift-Warnungen)
   - Prompt-to-Chart mit **AST-Level Read-Only SQL-Guard (Injection-Schutz)**
   - Automatisierte E-Mail-Berichte (Cron-Scheduler)
   - Schnelle Rückkehr zu Aufträgen und Planungsboard
8. [Grafisches Gantt-Planungsboard & Leitstand](./06-gantt-planning.md)
   - Ressourcen-Disposition nach Techniker & Qualifikationsmatrix
   - **Klickbarer Kalender-Header mit nativer `showPicker()`-API**
   - **Striktes 15-Minuten Magnet-Snap-to-Grid mit Mouse-Offset-Kompensation**
   - **Mehrtägige Großmaßnahmen bis 60 Tage** mit kontinuierlicher Monatsdarstellung
   - Unplanned Backlog Inbox Pool & Interaktives Detail-Popup-Modal
   - Nahtlose Verknüpfung mit Störungserfassung und Auftragsdetails
9. [Offline-First & Mobile Synchronisation](./07-offline-sync.md)
   - Arbeiten ohne Netzwerk (Dexie.js / IndexedDB)
   - Lokale Mutations-Outbox & automatische Hintergrund-Synchronisation
   - **Idempotenz-Härtung (`clientMutationId` & `clientBookingOfflineId`)** gegen Doppelbuchungen
   - Visueller Statusindikator in der Navigation & autonome Maskenführung
10. [KI-gestützte Störungserfassung & Auftragsanlage](./08-ki-stoerungserfassung.md)
    - Direkteingabe im Conversational Workspace (Omni-Bar mit Intent `CREATE_ORDER` & Clarification Loop)
    - Vorbefüllter Schnellabsprung nach `/orders/new` via URL-Deep-Linking
    - Dual-Mode Erfassungsmaske: KI-Prompt-Modus vs. manuelles Formular mit Echtzeit-Copilot
    - **Standardisierter 44px Zurück-Button mit Lucide `ArrowLeft`** auf `/orders/new` und `/orders/[id]`
    - Kontinuierliche Störungsüberwachung via Favoritenleiste, flackerfreiem Auto-Refresh & Dichte-Steuerung
11. [Conversational Single-Input Workspace & Favoriten](./09-ui-layout-concept.md)
    - Zentrales Omni-Eingabefeld (Sprach- & Freitext-Intents)
    - Dynamische KI-Schichtbegrüßung & Schichtkontext-Engine
    - Dynamische Favoritenleiste ("Meine Favoriten") & Deep-Linking (`?viewId=...`)
    - Auto-Refresh (0s, 30s, 1m, 5m) für Live-Leitstandmonitore
    - Dichte-Steuerung (Compact, Standard, Detailed) für Desktop & Werkstatt-Tablets
    - Interaktive dynamische Ergebnistabellen mit Direktabsprung

---

## 1. Systemübersicht & Erste Schritte

MaintAI wurde speziell für anspruchsvolle Produktionsumgebungen entwickelt, in denen Werkstatt- und Leitstand-Mitarbeiter sowohl an High-End-Arbeitsplätzen als auch mit mobilen Tablets in funkisolierten Hallenbereichen (Ex-Zonen, Kellerebenen) zuverlässig arbeiten müssen.

### Authentifizierung & Rollen
Der Zugriff erfolgt rollenbasiert (RBAC). Standardmäßig unterscheidet das System folgende Hauptrollen:
- **Instandhaltungsplaner / Meister (`MAINT_PLANNER`)**: Volle Berechtigung zur Terminierung, Budgetfreigabe und kaufmännischen Auftragsabnahme.
- **Servicetechniker / Facharbeiter (`TECHNICIAN`)**: Führt Reparaturen durch, erfasst Messwerte, bucht Ersatzteile aus dem Lager und schließt Aufträge technisch ab (`TABG`).
- **Schichtleiter / Meister (`SHIFT_LEAD`)**: Operative Schichtüberwachung, Ad-hoc-Disposition und Störungsanalyse.
- **Fremdfirmen-Monteur (`EXTERNAL_CONTRACTOR`)**: Eingeschränkte Sicht auf explizit zugewiesene Gewerke.
- **System-Administrator (`ADMIN`)**: Voller Konfigurationszugriff auf Workflows, Stammdaten und SAP-Konnektoren.

---

## 2. Einheitliche Pfade, Absprünge & Detailmasken-Standards

### 2.1 Anwendungsweite Modul- & Pfad-Übersicht

| Kategorie | Modul | URL-Pfad | Typische Absprünge | Standard-Rücksprung (min. 44px) |
|---|---|---|---|---|
| **Zentral** | Conversational Workspace | `/` | Omni-Bar ➔ `/orders/new`, Klick auf Zeile ➔ `/orders/[id]` | Startseite / Reset `[+]` |
| **Operativ** | Aufträge & Störungen | `/orders` | Klick auf Zeile / `[Öffnen]` ➔ `/orders/[id]` | Seitenleiste: `/` |
| **Operativ** | Auftragsdetailmaske | `/orders/[id]` | Checklisten, Ersatzteile, Statuswechsel | `ArrowLeft` ➔ `Zurück zur Auftragsliste` (`/orders`) |
| **Operativ** | Störungsmeldung erfassen | `/orders/new` | Absenden ➔ `/orders/[id]` | `ArrowLeft` ➔ `Zurück zum Planungsboard` (`/planning`) |
| **Operativ** | Gantt Planungsboard | `/planning` | `[+ Neue Störung]` ➔ `/orders/new`, Klick ➔ Modal ➔ `/orders/[id]` | Seitenleiste: `/` |
| **Operativ** | Bediener-Terminal | `/operator` | Schnellerfassung Störung | Seitenleiste: `/` |
| **Operativ** | Techniker-Dashboard | `/technician` | Klick auf zugewiesenen Auftrag ➔ `/orders/[id]` | Seitenleiste: `/` |
| **Wartung** | Wartungs-Hub | `/maintenance` | Kacheln ➔ `/maintenance-plans`, `/inspections` | Seitenleiste: `/` |
| **Wartung** | Wartungspläne (Batch) | `/maintenance-plans` | Klick auf Equipment ➔ `/equipments` | `ArrowLeft` ➔ `Zurück zum Wartungs-Hub` (`/maintenance`) |
| **Wartung** | Protokoll-Vorlagen | `/inspections` | Schema-Editor, Mobile/Desktop-Simulator | `ArrowLeft` ➔ `Zurück zum Wartungs-Hub` (`/maintenance`) |
| **Stammdaten**| Anlagen & Equipments | `/equipments` | Technische Plätze, Wartungshistorie | Seitenleiste: `/` |
| **Stammdaten**| Technische Plätze | `/functional-locations` | Strukturbaum ➔ Filterung nach Equipments | Seitenleiste: `/` |
| **Stammdaten**| Ersatzteile & Lager | `/spare-parts` | Bestandsanzeige, SAP MM Bewegungsart 261 | Seitenleiste: `/` |
| **System** | KI-Leitstand (Analytics) | `/analytics` | Prompt-to-Chart mit AST-Guard | `ArrowLeft` ➔ `Zu Aufträge & Störungen` (`/orders`) |
| **System** | Workflow-Matrix | `/admin/workflows` | Matrix-Editor für Status & Guards | `ArrowLeft` ➔ `Zurück zur Administration` (`/admin`) |
| **System** | Benutzer & Rollen (RBAC) | `/admin/users` | Benutzerrechte, Rollenzuweisung | `ArrowLeft` ➔ `Zurück zur System-Administration` (`/admin`) |
| **System** | Administration & SAP | `/admin` | Mandanteneinstellungen, SAP-Sync | Seitenleiste: `/` |
| **System** | KI-Provider Steuerung | `/admin/ai-settings` | Cloud (Gemini) vs. On-Premise (Ollama/vLLM) | `ArrowLeft` ➔ `Zurück zur Administration` (`/admin`) |

### 2.2 Zwingende Navigations-Vorgabe für alle Detailmasken
Gemäß den [Design- & Navigationsrichtlinien](./design-rules.md) gilt für sämtliche Detail- und Untermasken:
1. **Lucide-Icon `ArrowLeft`:** Ausschließlich das offizielle Pfeilsymbol `<ArrowLeft className="..." />` ist für Zurück-Aktionen zu verwenden.
2. **Mindestens 44px Klick-/Touch-Höhe:** Interaktive Elemente müssen mindestens `min-h-[44px]` messen, damit sie auf rauen Werkstatt-Tablets auch mit Schutzhandschuhen zielsicher bedient werden können.
3. **Präzise Beschriftung & Breadcrumb-Integration:** Jeder Zurück-Button nennt sein konkretes Sprungziel (z. B. *"Zurück zur Auftragsliste"* oder *"Zurück zum Planungsboard"*).

---

## 3. Neueste System-Härtungen & Fehlerbehebungen

1. **Gantt Planungsboard (`/planning`):**
   - **Klickbarer Kalender-Header:** Integriertes Datumsfeld triggert direkt die standardisierte HTML5 `showPicker()` API zur bequemen Datumsauswahl.
   - **Magnetisches 15-Minuten-Raster:** Exaktes Einrasten beim Verschieben per Drag-&-Drop mit automatischer Maus-Offset-Kompensation.
   - **Mehrtägige Einsätze:** Störungsbehebungen und Revisionen von bis zu 60 Tagen werden kontinuierlich und monatsübergreifend dargestellt.
2. **Sicherheitsfilter im KI-Leitstand (`/analytics`):**
   - **AST-Level Read-Only Guard:** Striktes Whitelisting von `SELECT`/`WITH`-Abfragen. Schädliche DDL/DML-Operationen (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`) sowie sensitive Systemtabellen werden auf AST-Ebene zuverlässig blockiert.
   - **Mandanten-Isolation:** Jede KI-generierte Abfrage wird zwingend auf die aktuelle `tenantId` geprüft.
3. **Idempotenz im Offline-Sync (`/api/sync`):**
   - **Doppelbuchungs-Schutz:** Verwendung von `clientMutationId` für Aufträge und `clientBookingOfflineId` für Ersatzteilverbräuche (SAP-Bewegungsart 261) garantiert, dass selbst bei instabilen Netzwerken keine doppelten Buchungen im ERP entstehen.
4. **Zweigleisige Störungserfassung (`/orders/new`):**
   - **Clarification Loop:** Interaktive 1-Klick-Auswahl bei mehrdeutigen Prompts im KI-Modus.
   - **Standardisierter Rücksprung:** Sichere Rückkehr zum Planungsboard (`/planning`) über den standardisierten 44px `ArrowLeft`-Button.
5. **Dynamische KI-Schichtbegrüßung (`src/actions/greeting-actions.ts`):**
   - **Kontextsensitive Ansprache:** Server Action `generateDynamicGreetingAction` ermittelt den Schichtkontext (`MORNING`, `NOON`, `AFTERNOON`, `EVENING`, `NIGHT`) sowie Vornamen/Rolle aus der RBAC-Session.
   - **Resilienz & Ausfallsicherheit:** 3.5s Timeout-Guard und deterministischer Fallback-Pool garantieren verzögerungsfreie Auslieferung bei Offline-Zuständen oder Provider-Ausfällen.
