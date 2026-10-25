# 🏛️ MaintAI – Softwarearchitekturdokument (SAD)

> **Status:** Aktiv / Lebendes Dokument (Living Architecture Document)  
> **System:** MaintAI – Industrielles CMMS & SAP PM/MM Middleware  
> **Version:** 1.5.0  
> **Letzte Aktualisierung:** 2026-10-23  
> **Referenzierte Richtlinie:** [Entwicklungsrichtlinien](../.gemini.md)

---

## Inhaltsverzeichnis
1. [Einführung & Ziele](#1-einführung--ziele)
   - 1.1 Zweck des Systems
   - 1.2 Qualitätsziele & Architekturtreiber
   - 1.3 Stakeholder & Rollen
2. [Randbedingungen & Technische Rahmenparameter](#2-randbedingungen--technische-rahmenparameter)
3. [Kontextabgrenzung & Systemübersicht](#3-kontextabgrenzung--systemübersicht)
   - 3.1 Fachlicher Kontext
   - 3.2 Technischer Kontext
   - 3.3 Systemkontext-Diagramm
4. [Bausteinsicht (Component Architecture)](#4-bausteinsicht-component-architecture)
   - 4.1 Schichtenarchitektur (Overview)
   - 4.2 Core Subsysteme im Detail
     - 4.2.1 Workflow- & State-Engine (`src/lib/workflow-engine.ts`)
     - 4.2.2 Rollen- & Berechtigungskonzept (RBAC) (`src/lib/rbac/`)
     - 4.2.3 SAP PM/MM Middleware & Integration (`src/lib/sap/`)
     - 4.2.4 Offline-First Sync Engine (`src/lib/offline/`)
     - 4.2.5 KI-Copilot, RAG & Analytics Agent (`src/lib/ai/`)
     - 4.2.6 Dynamischer Prüfprotokoll- & Checklisten-Builder
     - 4.2.7 Wartungsplanung & Dispositionsboard (Gantt & Batch Grid)
     - 4.2.8 Hierarchische Anlagenverwaltung & Stammdaten-Governance (`src/actions/asset-actions.ts`)
     - 4.2.9 Conversational Single-Input Workspace & Intent-Router (`src/lib/ai/copilot.ts`)
     - 4.2.10 Dynamische KI-Schichtbegrüßung & Schichtkontext-Engine (`src/actions/greeting-actions.ts`, `src/lib/ai/greeting.ts`, `src/lib/greeting-utils.ts`)
     - 4.2.11 Client-seitige Multi-Format-Export-Engine (`src/lib/export-utils.ts`)
5. [Datenarchitektur & Persistenz](#5-datenarchitektur--persistenz)
   - 5.1 Drizzle ORM Schema & Mandantenfähigkeit (inkl. `user_saved_views`)
   - 5.2 Vektordatenbank & RAG (`pgvector`)
   - 5.3 Client-seitige Speicherung (Dexie.js / IndexedDB)
   - 5.4 Datenmodell-Diagramm (ERD)
6. [Laufzeitsicht (Runtime & Sequence Workflows)](#6-laufzeitsicht-runtime--sequence-workflows)
   - 6.1 Störungserfassung mit KI-Copilot & Deduplizierung
   - 6.2 Statusübergang mit Guard-Prüfungen & Audit-Trail
   - 6.3 Offline-Bearbeitung & Reconnect-Synchronisation
   - 6.4 Ersatzteilbuchung mit SAP-Outbox-Failover
   - 6.5 Dynamische Schichtbegrüßung mit Resilienz-Fallback & Timeout
7. [Verteilungssicht & Infrastruktur (Deployment)](#7-verteilungssicht--infrastruktur-deployment)
8. [Querschnittliche Konzepte & Entwurfsentscheidungen](#8-querschnittliche-konzepte--entwurfsentscheidungen)
   - 8.1 Mandantenisolation (Tenant Isolation)
   - 8.2 Auditierbarkeit & Compliance
   - 8.3 Resilienz & Outbox-Pattern
   - 8.4 Sicherheit & Zero Trust
9. [Architecture Decision Records (ADRs)](#9-architecture-decision-records-adrs)
10. [Aktualisierungs- & Pflegeprotokoll](#10-aktualisierungs--pflegeprotokoll)

---

## 1. Einführung & Ziele

### 1.1 Zweck des Systems
**MaintAI** ist eine cloud-fähige, industrietaugliche Computerized Maintenance Management System (CMMS)- und Instandhaltungs-Plattform. Sie schlägt die Brücke zwischen modernster Webtechnologie (Next.js 15, React 19, TypeScript), lückenloser Offline-Fähigkeit für Techniker vor Ort in Werkshallen und einer bidirektionalen Middleware-Anbindung an Enterprise ERP-Systeme (insbesondere **SAP Plant Maintenance / PM** und **SAP Materials Management / MM**).

Zusätzlich integriert MaintAI eine KI-gestützte Wissens- und Assistenzschicht (RAG via `pgvector`, automatisierte Störungserfassung, Text-to-SQL Analytics, Predictive Maintenance).

### 1.2 Qualitätsziele & Architekturtreiber

| Priorität | Qualitätsziel | Beschreibung & Realisierung |
|---|---|---|
| **1** | **Offline-Autonomie (Offline-First)** | Vollständige Arbeitsfähigkeit von Servicetechnikern in funkisolierten Bereichen (Ex-Zonen, Kellerräume). Lokale Datenhaltung via IndexedDB/Dexie.js mit Mutations-Outbox und deterministischer Re-Synchronisation. |
| **2** | **SAP-Resilienz & Datenkonsistenz** | Entkopplung von SAP PM/MM. Bei Netzwerk- oder BAPI/OData-Ausfällen werden Buchungen (z. B. Warenentnahme Bewegungsart 261) über eine persistente Queue (`sap_sync_queue`) gepuffert und atomar nachgeführt. |
| **3** | **Compliance & Revisionssicherheit** | Jeder Statusübergang eines Instandhaltungsauftrags wird auditierbar (`order_status_audit_logs`) mit Zeitstempel, Benutzer, Übergangs-ID und Offline-Erfassungszeitpunkt protokolliert. |
| **4** | **Strikte Mandantenfähigkeit (Multi-Tenancy)** | Vollständige logische Mandantentrennung auf DB-Ebene (`tenant_id`), um Standorte oder Konzerngesellschaften strikt isoliert auf einer Instanz zu betreiben. |
| **5** | **Datensouveräne KI-Integration** | Abstrahierte Multi-Provider-Schnittstelle (`ILlmProvider`), die sowohl lokale On-Premise LLMs (Ollama, vLLM) in geschlossenen Firmennetzen als auch Cloud-Modelle (OpenAI, Gemini) unterstützt. |

### 1.3 Stakeholder & Rollen
Das System implementiert ein granuläres Role-Based Access Control (RBAC) System (`src/lib/rbac/`):

- **Instandhaltungsplaner / Meister (`MAINT_PLANNER`)**: Konfiguriert Zyklen, prüft Kosten, terminiert Aufträge im Gantt-Board, erteilt kaufmännische Freigaben (`ABGS`).
- **Servicetechniker / Facharbeiter (`TECHNICIAN`)**: Nimmt Aufträge an (`INAR`), füllt Prüfprotokolle digital aus, bucht Ersatzteile (`spare_parts:book`) und setzt den Status auf technisch abgeschlossen (`TABG`).
- **Schichtleiter (`SHIFT_LEAD`)**: Erfasst akute Notfallstörungen, priorisiert Einsätze und überwacht Schichtberichte.
- **Fremdfirmen-Monteur (`EXTERNAL_CONTRACTOR`)**: Eingeschränkter Zugriff auf explizit zugewiesene Gewerke mit Pflicht zur digitalen Signatur.
- **System- / SAP-Administrator (`ADMIN`)**: Verwaltet Workflows, Mandanten, SAP-Endpunkte, AI-Provider-Verbindungen und Audit-Logs.

---

## 2. Randbedingungen & Technische Rahmenparameter

| Kategorie | Technologie / Framework | Version / Anmerkung |
|---|---|---|
| **Frontend & Backend** | [Next.js](https://nextjs.org/) (App Router & Server Actions) | `15.1.7` (React `19.0.0`) |
| **Programmiersprache** | [TypeScript](https://www.typescriptlang.org/) | `5.7.3` mit strikter Typisierung (`strict: true`) |
| **Primäre Datenbank** | [PostgreSQL](https://www.postgresql.org/) mit [`pgvector`](https://github.com/pgvector/pgvector) | PostgreSQL 16, Vektorsuche (`vector(1536)`) |
| **Object-Relational Mapping** | [Drizzle ORM](https://orm.drizzle.team/) & Drizzle Kit | `drizzle-orm 0.39.0`, schema-driven migrations |
| **Cache / Queue Infrastructure** | [Redis](https://redis.io/) | Redis 7 Alpine via Docker |
| **Client-seitige DB (Offline)** | [Dexie.js](https://dexie.js.org/) | `4.0.11` (IndexedDB Wrapper für PWA / Browser) |
| **Styling & UI-Komponenten** | [Tailwind CSS](https://tailwindcss.com/) & Lucide Icons | `tailwindcss 3.4.17`, `lucide-react` |
| **Tabellen & Data Grids** | [TanStack React Table](https://tanstack.com/table) | `8.21.2` (für Batch-Wartungsplanpflege) |
| **Visualisierung / Charts** | [Recharts](https://recharts.org/) | `2.15.1` (für Analytics & Prompt-to-Chart) |
| **Validierung & Schemata** | [Zod](https://zod.dev/) | `3.24.1` (Formular- & Schema-Validierung) |
| **Testing** | [Vitest](https://vitest.dev/) | `5.0.5` für TDD & automatisierte Guard-Tests |

---

## 3. Kontextabgrenzung & Systemübersicht

### 3.1 Fachlicher Kontext
MaintAI integriert sich in die industrielle Instandhaltungslandschaft:
1. **Feld- & Werkstattebene:** Techniker vor Ort erfassen Diagnosen, Messwerte, Fotos und Unterschriften über mobile Endgeräte.
2. **Leitstandebene:** Meister überwachen Stillstände, Kapazitäten, MTBF-Kennzahlen und steuern Wartungspläne.
3. **Unternehmensebene (ERP):** SAP PM/MM fungiert als kaufmännisch führendes System für Anlagenstamm, Materialbestände, Kostenstellen und offizielle IH-Aufträge.

### 3.2 Technischer Kontext
- **Clients:** Webbrowser (Desktop & Mobile PWA), Service Worker & IndexedDB.
- **MaintAI Server:** Next.js Server Actions & API Routes (z. B. `/api/sync`, `/api/sap/*`, `/api/ai/*`).
- **Persistenz:** PostgreSQL-Instanz mit relationalen Tabellen und Vektorindizes.
- **Enterprise-Schnittstellen:** REST / OData v4 Endpunkte oder SAP RFC / BAPI Konnektoren via `src/lib/sap/adapters/`.
- **KI-Services:** On-Premise LLM-Instanzen (Ollama, vLLM) oder Cloud-APIs (OpenAI, Gemini).
- **Benachrichtigungen:** SMTP-Transaktionsserver via `nodemailer`.

### 3.3 Systemkontext-Diagramm

```mermaid
flowchart TD
    subgraph Clients["Clients & Benutzer"]
        TECH["👨‍🔧 Servicetechniker (Tablet / PWA - Offline/Online)"]
        PLANNER["👷 Instandhaltungsleiter (Desktop Leitstand)"]
        ADMIN["💻 Systemadministrator"]
    end

    subgraph MaintAISystem["MaintAI Plattform (Next.js 15 App)"]
        UI["UI Layer: Dashboard, Gantt, Forms, Protocol Builder"]
        ACTIONS["Server Actions (src/actions/*)"]
        API["REST / JSON API (/api/*)"]
        
        subgraph CoreEngines["Core Service Layer (src/lib/*)"]
            WF["Workflow Engine & Guards"]
            RBAC_CORE["RBAC & Permission Check"]
            AI_CORE["KI-Copilot & RAG (pgvector)"]
            OFFLINE_MGR["Offline Sync Engine & Conflict Resolver"]
            SAP_CONN["SAP Connector & Adapter Engine"]
        end
    end

    subgraph Storage["Persistenz & Infrastruktur"]
        PG[("PostgreSQL 16 + pgvector\n(Drizzle ORM)")]
        REDIS[("Redis Caching & Queue")]
        IDB[("IndexedDB / Dexie.js\n(Lokaler Client-Speicher)")]
    end

    subgraph External["Externe Systeme & Partner"]
        SAP["🏢 SAP ERP (PM / MM)\nOData v4 / RFC BAPI"]
        LLM["🧠 AI Provider\n(Ollama / vLLM / OpenAI / Gemini)"]
        SMTP["✉️ E-Mail Server (SMTP Reports)"]
    end

    TECH <-->|"HTTPS / Service Worker"| UI
    TECH <-->|"Direkte IndexedDB-Speicherung"| IDB
    PLANNER <-->|"HTTPS (Desktop Browser)"| UI
    ADMIN <-->|"HTTPS (Admin Konfiguration)"| UI

    UI --> ACTIONS
    UI --> API
    ACTIONS --> CoreEngines
    API --> CoreEngines

    CoreEngines <--> PG
    CoreEngines <--> REDIS
    SAP_CONN <-->|"OData / RFC mit Outbox-Failover"| SAP
    AI_CORE <-->|"Embedding & Inferenz"| LLM
    ACTIONS -->|"Automatisierte Berichte"| SMTP
    OFFLINE_MGR <-->|"Batch-Sync der Outbox"| API
```

---

## 4. Bausteinsicht (Component Architecture)

### 4.1 Schichtenarchitektur (Overview)

Das System folgt einer strikt modularen Schichtenarchitektur innerhalb des Next.js Ökosystems:

```
src/
├── app/                  # Next.js App Router (Pages, Layouts, API Endpunkte)
│   ├── (dashboard)/      # Authentifizierte Ansichten (Workspace "/", Orders, Planning, Protocols, etc.)
│   └── api/              # HTTP-Routen für Sync, SAP und AI Micro-Endpoints
├── components/           # UI-Komponenten (Atoms bis komplexe Domänenmodule)
│   ├── ui/               # Basis-Design-System (Card, Button, Input, Badge, etc.)
│   ├── dashboard/        # Conversational Single-Input Workspace (Omni-Bar, Vorschläge, Filter-Header)
│   ├── layout/           # App-Shell, dynamische Favoritenleiste, Workspace-Context & Offline-Indikator
│   ├── orders/           # Dashboard, Filter, Formulare & KI-Störungserfassung
│   ├── equipments/       # 4-Stufen Anlagenbaum, SourceBadges & Detailkarten
│   ├── gantt/            # Grafisches Dispositions- und Planungsboard
│   ├── protocol-builder/ # Visueller JSON-Schema Checklisten-Editor
│   ├── maintenance-plans/# TanStack Batch Data-Grid
│   └── workflows/        # Interaktive Berechtigungs- und Übergangsmatrix
├── actions/              # Server Actions ("use server") mit RBAC-Sicherheitsprüfung
│   ├── copilot-actions.ts# Intent-Klassifikation & Conversational Single-Input Router
│   ├── saved-view-actions.ts # CRUD & Sortierung von Benutzer-Favoriten (user_saved_views)
│   ├── asset-actions.ts  # 4-stufige Hierarchie, Schutz-Guards & SAP-Sync
│   ├── equipment-actions.ts # Anlagen- & Bereichsverwaltung (Admin)
│   ├── order-actions.ts  # Auftrags-CRUD, Statuswechsel & dynamische Tabellenabfragen
│   ├── workflow-actions.ts
│   ├── maintenance-plan-actions.ts
│   └── analytics-actions.ts
├── lib/                  # Domänen- & Infrastruktur-Logik (Framework-unabhängig)
│   ├── workflow-engine.ts# Zustandsautomat für Auftragslebenszyklen
│   ├── export-utils.ts   # 100% client-seitige Multi-Format-Exporte (PNG, PDF, CSV, Excel)
│   ├── rbac/             # Rollen- & Rechteprüfung
│   ├── sap/              # Adapter für OData, BAPI und Noop
│   ├── offline/          # Dexie.js IndexedDB & Sync-Manager
│   ├── ai/               # Intent-Router (copilot.ts), RAG, Text-to-SQL, Vektor-Suche, LLM-Provider
│   └── db/               # Datenbankverbindung & Drizzle Re-Exports
└── db/                   # Schema-Definitionen & Seeds
    ├── schema.ts         # Zentrales relationales Drizzle Schema (inkl. user_saved_views)
    └── seed.ts           # Demodaten (Werke, Rollen, Vorlagen, Equipment)
```

---

### 4.2 Core Subsysteme im Detail

#### 4.2.1 Workflow- & State-Engine (`src/lib/workflow-engine.ts`)
Die Workflow-Engine steuert alle Statusänderungen von Instandhaltungsaufträgen. Statusübergänge sind nicht fest verdrahtet, sondern werden mandanten- und auftragsartspezifisch aus der Datenbank (`workflow_transitions`) gelesen:

- **Dynamische Validierung:** Prüft, ob ein Übergang von `fromStatusId` nach `toStatusId` für die spezifische Auftragsart (`orderTypeId`) definiert und aktiv ist.
- **Rollen-Guards:** Überprüft, ob der ausführende Benutzer die in `requiredRoleId` geforderte Rolle besitzt.
- **Bedingungs-Guards (`WorkflowGuardCondition`):**
  - `requireChecklistCompleted`: Verhindert Übergang nach `COMPLETED`/`TABG`, wenn Pflichtprüffelder der Checkliste fehlen oder out-of-bounds sind.
  - `requireRootCauseFilled`: Erzwingt Dokumentation von Ursachencode und Schadensbeschreibung.
  - `requireActualDurationFilled`: Erzwingt Rückmeldung der Ist-Zeiten (Minuten/Stunden).
  - `requireDigitalSignature`: Verlangt Base64-Signatur des Technikers oder Kunden.
  - `requireAllSparePartsSynced`: Prüft, ob alle Lagerbuchungen erfolgreich an SAP übermittelt wurden.
- **Transaktionssicherheit & Audit-Log:** Statusaktualisierung und der Eintrag in `order_status_audit_logs` erfolgen atomar innerhalb einer Datenbanktransaktion (`db.transaction`).
- **Post-Transition Trigger:** Bei Erreichen des Status `COMPLETED` wird automatisch die Knowledge-Base für den RAG-Copilot mit Vektor-Embeddings angereichert (`indexOrderKnowledgeOnCompletion`).

#### 4.2.2 Rollen- & Berechtigungskonzept (RBAC) (`src/lib/rbac/`)
- Vollständig datenbankgestütztes Modell (`roles`, `permissions`, `user_roles`, `role_permissions`).
- Berechtigungsprüfung über Hilfsfunktionen: `hasPermission(userId, tenantId, permissionCode)`, `assertUserHasRole(...)`.
- Typisierte Rollencodes: `ADMIN`, `MAINT_PLANNER`, `TECHNICIAN`, `SHIFT_LEAD`, `EXTERNAL_CONTRACTOR`.
- Alle Server Actions validieren Berechtigungen server-seitig vor jeglicher Datenmodifikation.

#### 4.2.3 SAP PM/MM Middleware & Integration (`src/lib/sap/`)
Die Anbindung an SAP PM/MM erfolgt über das **Adapter-Entwurfsmuster** mit standardisiertem Interface:

```mermaid
classDiagram
    class SapConnector {
        <<interface>>
        +getMode() SapSyncMode
        +testConnection() Promise~SapConnectionStatus~
        +syncEquipments(plantCode) Promise~SapEquipmentResult[]~
        +bookSparePartMovement(booking) Promise~SapBookingResult~
        +replicateOrder(order) Promise~SapOrderSyncResult~
        +updateOrderStatus(sapOrderNumber, status) Promise~boolean~
    }

    class NoopSapAdapter {
        +getMode() "STANDALONE"
    }

    class ODataV4SapAdapter {
        +getMode() "ODATA_V4"
        -client: Axios/Fetch
        -csrfToken: string
    }

    class BapiRfcSapAdapter {
        +getMode() "RFC_BAPI"
        -connectionPool: SAPNWRFC
    }

    SapConnector <|.. NoopSapAdapter : implements
    SapConnector <|.. ODataV4SapAdapter : implements
    SapConnector <|.. BapiRfcSapAdapter : implements
```

- **Resilienz & Outbox-Muster (`sap_sync_queue`):** Schlägt ein Aufruf gegen SAP fehl (z. B. Timeout oder Server nicht erreichbar), wird der Datensatz mit Status `PENDING` in der Datenbank-Queue abgelegt. Ein Cron/Worker führt automatische Retries durch.
- **Warenentnahme:** Bewegungsart 261 (Warenausgang für Auftrag) bucht Material vom Lagerplatz ab und verknüpft die SAP-Belegnummer.

#### 4.2.4 Offline-First Sync Engine (`src/lib/offline/`)
Für Techniker vor Ort wird eine Client-seitige Persistenzschicht bereitgestellt:
- **Speicher:** IndexedDB über Dexie.js (`localDb`).
- **Tabellen im Client:** `orders`, `equipments`, `templates`, `spareParts`, `outbox`.
- **Mutations-Outbox:** Jede Offline-Aktion (neuer Auftrag, Messwert, Statusübergang) erzeugt einen Eintrag in der `outbox` mit Operation (`CREATE_ORDER`, `TRANSITION_STATUS`, `RECORD_CHECKLIST`), Payload und lokalem Zeitstempel.
- **SyncManager (`sync-manager.ts`):** Überwacht den Verbindungsstatus (`navigator.onLine` & Ping), leert die Outbox sequentiell per HTTPS-POST an `/api/sync` und löst Konflikte via "Last Write Wins mit Server-Validierung" auf.

#### 4.2.5 KI-Copilot, RAG & Analytics Agent (`src/lib/ai/`)
Das KI-Subsystem teilt sich in drei primäre Anwendungsfälle:
1. **Störungs-Copilot & RAG (`src/lib/ai/fault-copilot.ts`):**
   - Extrahiert Fehlerbeschreibungen und erzeugt ein Vektor-Embedding (`ILlmProvider.createEmbedding`).
   - Führt eine Ähnlichkeitssuche (`pgvector` Cosine-Distance) über historische Reparaturen durch.
   - Erkennt Duplikate bei offenen Meldungen und schlägt bewährte Lösungen sowie Ersatzteile inklusive Konfidenzwert vor.
2. **Prompt-to-Chart / Natural Language SQL (`src/lib/ai/analytics-agent.ts`):**
   - Übersetzt freitextliche Anfragen (z. B. *"Zeige mir die Ausfallzeiten der Stanzen im 3. Quartal"*) in sichere, schreibgeschützte SQL-Queries gegen PostgreSQL.
   - **Geführter Klärungsdialog (Clarification Loop):** Erkennt unvollständige Anfragen (*"Zeige mir ein Diagramm"*) und schaltet in den Status `NEEDS_CLARIFICATION` mit strukturierten 1-Klick-Optionen für Diagrammtyp, Kennzahlen, Bereich/Maschine, Trendlinie und Farben.
   - Validiert das SQL über gehärtete AST-Guards (strikter Schreibschutz: Verbot von `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, Mandanten-Isolation `tenant_id`).
   - Formatiert das Ergebnis in konfigurierte Recharts-Visualisierungen (Balken-, Linien-, Torten- und Composed-Diagramme mit Trendlinien-Overlay) unter Übergabe von `hasTrendline`, `trendlineKey` und `colorPalette`.
3. **Predictive Maintenance Analyzer (`src/lib/ai/predictive.ts`):**
   - Berechnet MTBF (Mean Time Between Failures), MTTR (Mean Time To Repair) und Ausfallwahrscheinlichkeiten basierend auf Zyklen und Betriebsstunden.

#### 4.2.6 Dynamischer Prüfprotokoll- & Checklisten-Builder
- Ermöglicht das visuelle Modellieren von Prüfvorlagen als versioniertes JSON-Schema (`InspectionTemplateSchema`).
- Unterstützte Feldtypen: `BOOLEAN` (i.O. / n.i.O.), `NUMERIC` (mit Min/Max/Sollwert-Toleranzen), `TEXT`, `SELECT`, `PHOTO` und `SIGNATURE`.
- **Auto-Defect Trigger:** Überschreitet ein numerischer Messwert den Grenzwert (`isOutOfBounds`) oder wird ein kritischer Check mit n.i.O. markiert, erzeugt das System bei Bedarf automatisch einen Folge-Störauftrag.

#### 4.2.7 Wartungsplanung & Dispositionsboard (Gantt & Batch Grid)
- **Batch Grid (`batch-grid.tsx`):** Nutzt TanStack Table für die gleichzeitige Massenbearbeitung von 50+ Wartungsplanpositionen per Tastaturnavigation.
- **Gantt-Board (`gantt-planning-board.tsx`):** Dispositionsansicht mit Drag-&-Drop-Verschiebung, Kapazitätsauslastung pro Techniker und visueller Warnung bei Terminüberlappung oder Materialmangel.

#### 4.2.8 Hierarchische Anlagenverwaltung & Stammdaten-Governance (`src/actions/asset-actions.ts`)
Die Anlagenverwaltung bildet die physische und logische Struktur von Industrieanlagen gemäß DIN 31051 und SAP PM in vier hierarchischen Stufen ab:
1. **Bereiche (`areas` / 1. Stufe):** Liegenschaften, Werke oder Hallenabschnitte (`AREA-01`).
2. **Technische Plätze (`functional_locations` / 2. Stufe):** Funktions- und prozessorientierte Einbauorte mit optionaler hierarchischer Selbstverknüpfung (`parentFunctionalLocationId`), `sapTplnr` und Kostenstellen (`costCenter`).
3. **Equipments (`equipments` / 3. Stufe):** Physische Maschinen, Anlagen und Geräte mit Betriebsstundenzählern, Kritikalitätsbewertung (A/B/C), SAP-Equipmentnummer (`sapEquipmentNr`) und Unter-Equipments (`parentEquipmentId`).
4. **Baugruppen (`assemblies` / 4. Stufe):** Diskrete Komponenten und Untermodule (`equipmentId -> equipments.id`).

**Governance- & Schutz-Guards:**
- **Schreibschutz im aktiven SAP-Modus (`assertManualAssetModificationAllowed`):**  
  Befindet sich das System im Modus `ODATA_V4` oder `RFC_BAPI`, führt SAP PM die Stammdatenhoheit. Sämtliche schreibenden Aktionen (`create*`, `update*`, `delete*`) werden serverseitig mit einem Fehler abgewiesen und im UI ausgeblendet.
- **Herkunfts-Schutz (`assertNotSapSource`):**  
  Datensätze mit dem Herkunftsflag `source === 'SAP'` sind unveränderlich geschützt und dürfen auch bei zwischenzeitlichem Standalone-Betrieb nicht manuell überschrieben oder gelöscht werden.
- **RBAC-Berechtigungsschutz (`assertAssetWritePermission`):**  
  Im Standalone-Modus erfordern manuelle Mutationen zwingend die administrative Rolle `ADMIN` bzw. die Berechtigung `assets:manage`.
- **SAP PM Stammdatensynchronisation (`syncAssetsFromSapAction`):**  
  Führt einen automatisierten Abgleich und Upsert von Technischen Plätzen und Equipments durch und setzt atomar `source = "SAP"` sowie Synchronisationszeitstempel (`lastSyncedAt`, `sapLastSyncedAt`).

#### 4.2.9 Conversational Single-Input Workspace & Intent-Router (`src/lib/ai/copilot.ts`, `src/actions/copilot-actions.ts`)
Der Conversational Workspace fungiert ab Version 1.1.0 als primäre Einstiegsoberfläche (`/`) von MaintAI und transformiert starre Menüs in ein intentionen-basiertes Arbeits-Cockpit:

```mermaid
flowchart TD
    User["Benutzer (Freitext oder Web Speech Voice)"] --> OmniInput["Single-Input Omni-Bar (single-input-workspace.tsx)"]
    OmniInput --> Action["copilot-actions.ts: classifyCopilotInputAction()"]
    Action --> IntentRouter["Intent-Router (copilot.ts: classifyCopilotIntent)"]

    IntentRouter --> Decision{"Mehrdeutigkeit / Klärung?"}
    Decision -- "Ja" --> Clarification["Clarification Loop (Klärungsoptionen für Bereich / Equipment)"]
    Clarification --> OmniInput

    Decision -- "Nein" --> Classifier{"Intent-Typ"}
    Classifier --> |QUERY_ORDERS| QueryAction["order-actions.ts: queryOrdersAction()"]
    Classifier --> |CREATE_ORDER| CreateFlow["Störungserfassungs-Flow & Vorbefüllung"]
    Classifier --> |UPDATE_VIEW_CONFIG| ViewConfig["UI-State: Auto-Refresh & Dichte"]
    Classifier --> |ANALYTICS_CHART| AnalyticsAgent["analytics-agent.ts: Prompt-to-Chart"]

    QueryAction --> DynamicTable["Interaktive Ergebnistabelle (Dichte, Filter, Schnellabsprung)"]
    DynamicTable -.-> |"⭐ Favorit speichern"| SavedViewsDB[("PostgreSQL: user_saved_views")]
    SavedViewsDB -.-> |Reaktive Sync| Sidebar["Linke Favoritenleiste ('Meine Favoriten')"]
```

1. **Single-Input Omni-Bar & Multimodale Erfassung (`single-input-workspace.tsx`):**
   - Zentrales Eingabefeld mit Unterstützung für Tastatur-Freitext, Spracheingabe über die `Web Speech API` (Voice-to-Text mit visueller Pegelanzeige) und Foto-Uploads für Schadensbilder.
   - Schnellauswahl über kontextsensitive Action-Chips (z. B. *"Akute Prio 1 Notfälle"*, *"Störungen Rohbau"*, *"Wartungen heute"*).

2. **Intent-Klassifikation & Intent-Router (`classifyCopilotIntent`):**
   - Analysiert Benutzereingaben mithilfe des konfigurierten `ILlmProvider` (Gemini, Claude, OpenAI oder lokales Ollama-Modell) und mappt diese strukturiert auf vier Kern-Intents:
     - `QUERY_ORDERS`: Extrahiert strukturierte Filterparameter (`areaId`, `areaName`, `statusList`, `priorityList`, `searchQuery`, `equipmentKeyword`) und leitet diese an `queryOrdersAction` weiter.
     - `CREATE_ORDER`: Extrahiert Titel, Beschreibung, Equipment-Referenz, Schadenscode sowie Priorität und leitet die Störungserfassung ein.
     - `UPDATE_VIEW_CONFIG`: Passt Laufzeitparameter der Benutzeroberfläche dynamisch an (`refreshInterval`: 0, 30s, 60s, 300s; `displayDensity`: `compact`, `standard`, `detailed`).
     - `ANALYTICS_CHART`: Generiert Diagramme und leitet KPI-Abfragen an den Analytics-Agenten weiter.
   - **Deterministische Resilienz-Engine:** Fällt der KI-Provider aus (Netzwerkausfall, Offline-Betrieb oder API-Fehler), greift eine robuste Regex- und Keyword-Fallback-Logik, die Standardabfragen (Notfälle, Status, Bereiche) ohne LLM deterministisch klassifiziert.

3. **Interaktiver Klärungsdialog (Clarification Loop):**
   - Erkennt der Intent-Router Mehrdeutigkeiten bei Bereichs- oder Anlagennamen (z. B. wenn mehrere Pumpen oder Roboter im Werk existieren), wird ein strukturierter Auswahldialog (`ClarificationResult`) generiert.
   - Der Anwender kann die zutreffende Anlage oder den Bereich mit einem Klick auflösen, woraufhin die Intent-Verarbeitung mit den geklärten Daten nahtlos fortgesetzt wird.

4. **Reaktive Favoritenverwaltung & Workspace-Context (`workspace-context.tsx`):**
   - Der `WorkspaceContext` synchronisiert aktive Ansichten, Benutzerrollen (`CurrentUserRbacInfo`) und KI-Provider-Status über die gesamte Applikation.
   - Benutzer können beliebige gefilterte Tabellenansichten inklusive Auto-Refresh-Intervall und Dichte über die Server Action `createSavedView` in der Tabelle `user_saved_views` ablegen.
   - Die linke Favoritenleiste ("Meine Favoriten" in `app-shell.tsx`) erlaubt den sofortigen Wechsel zwischen gespeicherten Sichten ohne Page-Reload und spiegelt den aktiven Zustand in der URL wider (`/?viewId=<uuid>`).

5. **Auto-Refresh & Dichte-Steuerung:**
   - **Auto-Refresh:** Hintergrund-Polling über den Hook `useInterval` aktualisiert Auftragsdaten geräuschlos ohne UI-Flickern oder Reset des Tastaturfokus.
   - **Informationsdichte (`displayDensity`):** Steuert die tabellarische Informationsdichte in drei Stufen (`compact` für dichte Leitstand-Übersichten, `standard` für Desktop-Arbeitsplätze, `detailed` für Touch-fähige mobile Industrie-Tablets).

6. **Responsives Widescreen- & Leitstand-Layout (`single-input-workspace.tsx`):**
   - **Breitbild-Container:** Der Chat-Scrollbereich (`chatScrollContainerRef`) skaliert über `max-w-7xl 2xl:max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8` dynamisch auf Widescreen- und Leitstand-Monitoren (z. B. 1440p, 4K, Ultra-Wide 21:9).
   - **Entfesselte KI-Visualisierungen & Tabellen:** Die künstliche Breitenbeschränkung früherer Versionen (`max-w-3xl` / 768px) wurde aufgehoben. Assistenten-Karten für Diagramme (Prompt-to-Chart), tabellarische Auftragslisten (`table_view`) und Störungs-Drafts nutzen nun `max-w-5xl xl:max-w-6xl 2xl:max-w-7xl w-full space-y-3`, wodurch komplexe Tabellenspalten und Zeitreihen ohne erzwungenes horizontales Scrollen im Leitstandbetrieb lesbar bleiben.
   - **Bündige Sticky-Bottom-Eingabeleiste:** Die fixierte Eingabeleiste ist auf `max-w-7xl 2xl:max-w-[1600px] mx-auto w-full space-y-2` mit kongruentem horizontalen Padding (`px-4 sm:px-6 lg:px-8`) austariert und fluchtet pixelgenau mit dem Chat-Verlauf.
   - **Proportionale Nutzer-Prompts & Hero-Screen:** Benutzer-Nachrichten wachsen harmonisch mit (`max-w-2xl xl:max-w-3xl text-right`) und der Begrüßungs-Screen skaliert auf `max-w-4xl mx-auto w-full` für eine ausgewogene Ästhetik im Ruhezustand.

#### 4.2.10 Dynamische KI-Schichtbegrüßung & Schichtkontext-Engine (`src/actions/greeting-actions.ts`, `src/lib/ai/greeting.ts`, `src/lib/greeting-utils.ts`)
Zur Verbesserung der User Experience im industriellen Schichtbetrieb begrüßt MaintAI Werker, Techniker und Meister im Header des Conversational Workspace mit einer tageszeit- und schichtabhängigen Ansprache.

1. **Server Action `generateDynamicGreetingAction`:**
   - Schnittstelle: Nimmt optional Vornamen, Rolle, Schichtkontext, Werk/Standort und Mandanten-ID entgegen.
   - **Automatische RBAC-Session-Auflösung:** Fehlt der Vorname, ermittelt die Server Action den Benutzer und Vornamen automatisch über `getCurrentUserRbac(tenantId)`.
2. **Schichtkontext- & Zeitfenster-Erkennung (`determineShiftContext`, `getGreetingTimeSlot`):**
   - `MORNING` / `morgen`: 05:00 - 10:59 Uhr (Frühschicht)
   - `NOON` / `mahlzeit`: 11:00 - 13:59 Uhr (Mittagsschicht & Schichtübergabe)
   - `AFTERNOON` / `tag`: 14:00 - 17:59 Uhr (Nachmittagsschicht)
   - `EVENING` / `abend`: 18:00 - 21:59 Uhr (Spätschicht)
   - `NIGHT` / `nacht`: 22:00 - 04:59 Uhr (Nachtschicht)
3. **Resilientes LLM-Prompting mit 3.5s Timeout-Guard:**
   - Ruft den aktiven `ILlmProvider` mit Task-Typ `"greeting"`, Low-Temperature (`0.7`) und maximal 50 Tokens auf.
   - **Timeout-Rennen (`Promise.race`):** Ein 3500ms-Timeout stellt sicher, dass Netzwerkverzögerungen oder LLM-Kaltstarts den Seitenaufbau niemals blockieren.
4. **Deterministischer Fallback-Pool (`FALLBACK_GREETINGS` / `FALLBACK_GREETING_POOL`):**
   - Bei Timeouts, Offline-Status oder API-Fehlern liefert `getDeterministicFallbackGreeting` sofort eine handwerklich geprüfte, industrielle Begrüßung aus dem Pool (4 Varianten je Zeitfenster).
   - Rückgabe-Objekt signalisiert über `isFallback: true` und `isAiGenerated: false` transparent den Status an das Frontend.

#### 4.2.11 Client-seitige Multi-Format-Export-Engine (`src/lib/export-utils.ts`)

Das Modul `src/lib/export-utils.ts` kapselt leichtgewichtige, performante Export-Funktionen für Diagramme (Recharts-SVGs) und tabellarische Auftragsdaten (`OrderWithRelations`). Gemäß den Architekturleitlinien für **PWA-Offline-Fähigkeit** und **DSGVO-Compliance** erfolgen sämtliche Konvertierungen, Rasterisierungen und Dokumentengenerierungen zu 100 % client-seitig direkt im Browser des Anwenders – ohne Latenz, ohne Server-Roundtrip und ohne Weiterleitung sensibler Instandhaltungsdaten an externe Konvertierungsdienste.

##### 1. Schnittstellendefinitionen (TypeScript Interfaces & Signaturen)

```typescript
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import type { OrderWithRelations } from "@/actions/order-actions";

/**
 * Wandelt einen technischen Prioritäts-Enum in eine verständliche deutsche Bezeichnung um.
 *
 * @param priority Technischer DB-Wert ('1_EMERGENCY' | '2_HIGH' | '3_MEDIUM' | '4_LOW' | null | undefined)
 * @returns Formatierte Bezeichnung (z. B. "1 - Notfall", "2 - Hoch", "3 - Mittel", "4 - Niedrig" oder "-")
 */
export function formatPriorityLabel(priority: string | null | undefined): string;

/**
 * Hilfsfunktion: Konvertiert ein SVG-Element in ein HTMLCanvasElement mit 2-facher Retina-Auflösung
 * und deckendem weißen Hintergrund (#ffffff).
 *
 * @param svgElement Das zu rendernde SVGElement aus dem DOM
 * @returns Promise auf das gerenderte HTMLCanvasElement
 */
export async function svgToCanvas(svgElement: SVGElement): Promise<HTMLCanvasElement>;

/**
 * Exportiert ein Recharts-SVG als hochauflösendes PNG (Rastergrafik).
 *
 * @param svgElement Das gerenderte SVG-Element des Diagramms (aus Inline-Card oder Zoom-Modal)
 * @param filename Dateiname für den Download (Dateiendung .png wird bei Bedarf automatisch ergänzt)
 */
export async function exportChartToPng(svgElement: SVGElement, filename: string): Promise<void>;

/**
 * Exportiert ein Recharts-SVG als druckfertiges DIN-A4-Querformat-PDF mit standardisiertem MaintAI-Kopf.
 *
 * @param svgElement Das gerenderte SVG-Element des Diagramms
 * @param filename Dateiname für den Download (Dateiendung .pdf wird bei Bedarf automatisch ergänzt)
 * @param title Optionaler individueller Diagrammtitel im PDF-Header (Standard: "Ausfallzeiten nach Equipment (Halle 1)")
 */
export async function exportChartToPdf(
  svgElement: SVGElement,
  filename: string,
  title?: string
): Promise<void>;

/**
 * Exportiert Auftragsdaten als RFC-4180-konforme CSV-Datei mit Semikolon (;) und UTF-8-BOM.
 *
 * @param orders Array der zu exportierenden Auftragsdatensätze (OrderWithRelations)
 * @param filename Dateiname für den Download (Dateiendung .csv wird bei Bedarf automatisch ergänzt)
 */
export function exportTableToCsv(orders: OrderWithRelations[], filename: string): void;

/**
 * Exportiert Auftragsdaten als strukturierte Excel-Arbeitsmappe (.xlsx) mit optimierten Spaltenbreiten.
 *
 * @param orders Array der zu exportierenden Auftragsdatensätze (OrderWithRelations)
 * @param filename Dateiname für den Download (Dateiendung .xlsx wird bei Bedarf automatisch ergänzt)
 */
export function exportTableToExcel(orders: OrderWithRelations[], filename: string): void;
```

##### 2. Baustein-Architektur & Funktionsweise

```mermaid
flowchart LR
    subgraph UI["Benutzeroberfläche (Workspace & Leitstand)"]
        ChartUI["Recharts SVG (Inline / Zoom-Modal)"]
        TableUI["TanStack / Dynamic Order Table"]
    end

    subgraph ExportEngine["Client-seitige Export-Engine (src/lib/export-utils.ts)"]
        S2C["svgToCanvas (2x Retina, #fff BG)"]
        PNG["exportChartToPng"]
        PDF["exportChartToPdf (jsPDF A4 Landscape)"]
        CSV["exportTableToCsv (RFC-4180, Semikolon, UTF-8 BOM)"]
        XLSX_MOD["exportTableToExcel (SheetJS, Auto-Breiten)"]
    end

    subgraph ClientBrowser["Lokaler Browser (Download Trigger)"]
        DL_PNG["Download: *.png"]
        DL_PDF["Download: *.pdf"]
        DL_CSV["Download: *.csv"]
        DL_XLSX["Download: *.xlsx"]
    end

    ChartUI --> S2C
    S2C --> PNG --> DL_PNG
    S2C --> PDF --> DL_PDF
    TableUI --> CSV --> DL_CSV
    TableUI --> XLSX_MOD --> DL_XLSX
```

##### 3. Technische Spezifikationen der Export-Routinen

- **`exportChartToPng`:**
  - **Retina-Skalierung (`scale = 2`):** Verdoppelt die physikalische Pixelanzahl der Leinwand (`canvas.width = Math.round(width * 2)`), um Unschärfen auf hochauflösenden Displays oder beim Einfügen in Präsentationsfolien zu eliminieren.
  - **Weißer Hintergrund (`ctx.fillStyle = '#ffffff'`):** Verhindert transparente Artefakte bei SVGs ohne eigene Hintergrundfarbe.
  - **Browser-Download:** Wandelt den Canvas-Inhalt via `toDataURL("image/png")` in einen Data-URL-Link um und triggert einen klickbaren Anchor-Download (`<a download="...">`).

- **`exportChartToPdf`:**
  - **A4-Querformat (297 mm × 210 mm):** Initiiert ein `jsPDF`-Dokument mit Maßen `297x210mm`.
  - **MaintAI Corporate Header:** Zeichnet einen dunkelblauen/schieferfarbenen Header-Balken (`slate-800` / `doc.setFillColor(30, 41, 59)`, 16 mm Höhe) über die volle Seitenbreite mit weißem Titel *"MaintAI Analyse-Export"* und lokalisiertem Zeitstempel (`toLocaleDateString('de-DE')` + `toLocaleTimeString('de-DE')`).
  - **Inhaltsbereich & Aspect-Ratio-Preservation:** Berechnet die maximal verfügbare Zeichenfläche (`267 mm × 150 mm`) und skaliert das Diagrammbild unter strikter Einhaltung des nativen Breiten-/Höhenverhältnisses zentriert in den Inhaltsbereich.
  - **Compliance-Footer:** Schließt das Dokument mit einem standardisierten Revisionshinweis ab: *"MaintAI Smart Maintenance Platform • Vertraulich • Nur für interne Instandhaltungszwecke • Seite 1 von 1"*.

- **`exportTableToCsv`:**
  - **DACH-Kompatibilität (Semikolon-Trennzeichen):** Verwendet Semikolons (`;`) anstelle von Kommas, um fehlerhafte Spaltentrennungen in deutschsprachigen Betriebssystemen und Tabellenprogrammen zu vermeiden.
  - **UTF-8 Byte Order Mark (`\uFEFF`):** Setzt die UTF-8-BOM an den Dateianfang, sodass Microsoft Excel den Zeichensatz automatisch als UTF-8 erkennt und deutsche Umlaute (ä, ö, ü, ß) ohne Zeichensatzkonvertierungs-Dialog darstellt.
  - **RFC-4180 Escaping:** Kapselt Zellenwerte mit Trennzeichen, Anführungszeichen oder Zeilenumbrüchen in doppelte Hochkommas (`"..."` mit `""`-Escaping).

- **`exportTableToExcel`:**
  - **OpenXML-Generierung via SheetJS (`xlsx`):** Erzeugt eine standardkonforme `.xlsx`-Arbeitsmappe mit dem Tabellenblatt *"Aufträge"*.
  - **Ergonomische Spaltenbreiten (`worksheet["!cols"]`):** Hinterlegt vordefinierte Spaltenbreiten zur Vermeidung abgeschnittener Inhalte (Auftragsnummer: 18, Priorität: 14, Titel: 42, Equipment: 26, Status: 16, ErstelltAm: 20 Zeichen).
  - **Sprechende Feldwerte:** Prioritäts-Codes werden vor dem Schreiben über `formatPriorityLabel` formatiert; Zeitstempel werden als lokalisierte Datumsstrings serialisiert.

##### 4. Offline- & DSGVO-Vorgaben

| Kriterium | Realisierung | Sicherheits- & Compliance-Vorteil |
|---|---|---|
| **Datenlokalität** | 100 % In-Memory im Browser | Keine Übertragung von Auftragsdaten, Störungsursachen oder Equipmentdaten an Drittanbieter-Server |
| **PWA-Offline-Fähigkeit** | Reines Client-JS (`jsPDF`, `xlsx`, DOM Canvas) | Vollständig funktionsfähig auf Hallen-Tablets ohne Internet-/Netzwerkverbindung |
| **Performance** | Asynchrone Canvas-/Blob-Generierung | Keine Belastung der Next.js Server Actions oder Datenbankverbindungen |
| **DSGVO / GDPR** | Keine Server-Logs & keine Dritt-APIs | Keine Auftragsverarbeitungsverträge (AVV) für Export-Pipelines erforderlich |

---

## 5. Datenarchitektur & Persistenz

### 5.1 Drizzle ORM Schema & Mandantenfähigkeit
Alle Tabellen sind in `src/db/schema.ts` deklariert. Jede geschäftsrelevante Tabelle besitzt zwingend:
- Eine Primärschlüssel-UUID (`id: uuid("id").defaultRandom().primaryKey()`).
- Eine Fremdschlüsselbeziehung auf `tenants.id` (`tenantId: uuid("tenant_id").notNull().references(() => tenants.id)`).
- Zeitstempel für Auditierung (`createdAt`, `updatedAt`).

#### Benutzer-Favoriten & Dynamische Ansichten (`user_saved_views`)
Zur Personalisierung des Conversational Workspace speichert `user_saved_views` (Export-Alias: `savedViews`) individuelle Filterkombinationen und Ansichtseinstellungen:
- **`tenantId` & `userId`:** Mandanten- und Benutzertrennung mit Kaskadierung (`onDelete: "cascade"`).
- **`name` & `icon`:** Anzeigename und Symbol (Standard: `"star"`, optional `"flame"`, `"alert"`, `"wrench"`) für die linke Favoritenleiste.
- **`intent`:** Auslösender Intent (Standard: `"ORDERS_QUERY"`).
- **`filterPayload` (`jsonb`):** Strukturierte Filterkriterien (`statusList`, `priorityList`, `areaId`, `searchQuery`, `equipmentId`).
- **`refreshInterval` (`integer`):** Automatisches Aktualisierungsintervall in Sekunden (0 = aus, 30s, 60s, 300s).
- **`displayDensity` (`text`):** Informationsdichte der Tabelle (`compact`, `standard`, `detailed`).
- **`position` (`integer`):** Reihenfolge / Priorität in der Favoritenleiste.
- **Indizes:** `idx_user_saved_views_user` (auf `userId`), `idx_user_saved_views_tenant` (auf `tenantId`), `idx_user_saved_views_user_name` (Unique auf `[userId, name]`).

#### 4-stufige Anlagenstruktur & Herkunftsflag (`source`)
Die Anlagenhierarchie wird über vier Drizzle-Tabellen mit strikter relationaler Integrität modelliert:
- **`areas` (1. Stufe):** Schlüssel (`code`), Name, Beschreibung, `source: asset_source`, `sapId`, `lastSyncedAt`.
- **`functional_locations` (2. Stufe):** Fremdschlüssel `areaId -> areas.id`, Selbstreferenz `parentFunctionalLocationId`, Platzcode (`code`), `sapTplnr`, Kostenstelle (`costCenter`), `plantSection`, `source: asset_source`, `sapSyncStatus`.
- **`equipments` (3. Stufe):** Fremdschlüssel `functionalLocationId -> functionalLocations.id`, Selbstreferenz `parentEquipmentId`, `equipmentNumber`, `sapEquipmentNr`, Kritikalität (`criticality`), Status (`status`), `operatingHoursCounter`, `source: asset_source`, `sapSyncStatus`.
- **`assemblies` (4. Stufe):** Fremdschlüssel `equipmentId -> equipments.id` (mit `onDelete: "cascade"`), Baugruppencode (`code`), `name`, `source: asset_source`, `sapId`, `lastSyncedAt`.

Das Herkunftsflag basiert auf dem PostgreSQL-Enum `asset_source` (`'SAP' | 'MANUAL'`) und stellt sicher, dass sowohl auf DB- als auch auf UI-Ebene jederzeit transparent ist, welches System die Hoheit über das jeweilige Objekt besitzt.

### 5.2 Vektordatenbank & RAG (`pgvector`)
Die Tabelle `order_history_embeddings` speichert 1536-dimensionale Einbettungsvektoren:
```sql
CREATE TABLE order_history_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    maintenance_order_id UUID NOT NULL REFERENCES maintenance_orders(id),
    equipment_id UUID REFERENCES equipments(id),
    embedding vector(1536) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_order_embeddings_cosine ON order_history_embeddings USING ivfflat (embedding vector_cosine_ops);
```

### 5.3 Client-seitige Speicherung (Dexie.js / IndexedDB)
```ts
// src/lib/offline/indexed-db.ts
class MaintAiLocalDatabase extends Dexie {
  orders!: Table<LocalMaintenanceOrder, string>;
  equipments!: Table<LocalEquipment, string>;
  templates!: Table<LocalInspectionTemplate, string>;
  spareParts!: Table<LocalSparePart, string>;
  outbox!: Table<LocalMutationOutboxItem, string>;
}
```

### 5.4 Datenmodell-Diagramm (ERD)

```mermaid
erDiagram
    TENANTS ||--o{ USERS : "beherbergt"
    TENANTS ||--o{ AREAS : "gliedert_in"
    TENANTS ||--o{ FUNCTIONAL_LOCATIONS : "besitzt"
    TENANTS ||--o{ EQUIPMENTS : "verwaltet"
    TENANTS ||--o{ ASSEMBLIES : "beinhaltet"
    TENANTS ||--o{ ORDER_TYPES : "definiert"
    TENANTS ||--o{ WORKFLOW_STATUSES : "besitzt"
    TENANTS ||--o{ MAINTENANCE_ORDERS : "führt"
    TENANTS ||--o{ SPARE_PARTS : "lagert"
    TENANTS ||--o{ SAP_SYNC_QUEUE : "puffert"
    TENANTS ||--o{ USER_SAVED_VIEWS : "beherbergt"

    USERS ||--o{ USER_ROLES : "hat"
    USERS ||--o{ USER_SAVED_VIEWS : "speichert_ab"
    ROLES ||--o{ USER_ROLES : "zugewiesen"
    ROLES ||--o{ ROLE_PERMISSIONS : "besitzt"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "zugeordnet"

    AREAS ||--o{ FUNCTIONAL_LOCATIONS : "1_zu_2_stufe"
    FUNCTIONAL_LOCATIONS ||--o{ FUNCTIONAL_LOCATIONS : "hierarchisch_untergeordnet"
    FUNCTIONAL_LOCATIONS ||--o{ EQUIPMENTS : "2_zu_3_stufe"
    EQUIPMENTS ||--o{ EQUIPMENTS : "sub_equipments"
    EQUIPMENTS ||--o{ ASSEMBLIES : "3_zu_4_stufe"

    ORDER_TYPES ||--o{ WORKFLOW_TRANSITIONS : "regelt"
    WORKFLOW_STATUSES ||--o{ WORKFLOW_TRANSITIONS : "from"
    WORKFLOW_STATUSES ||--o{ WORKFLOW_TRANSITIONS : "to"
    ROLES ||--o{ WORKFLOW_TRANSITIONS : "erfordert"

    ORDER_TYPES ||--o{ MAINTENANCE_ORDERS : "typisiert"
    WORKFLOW_STATUSES ||--o{ MAINTENANCE_ORDERS : "aktueller_status"
    EQUIPMENTS ||--o{ MAINTENANCE_ORDERS : "betrifft"
    INSPECTION_TEMPLATES ||--o{ MAINTENANCE_ORDERS : "prüft_gemäß"
    USERS ||--o{ MAINTENANCE_ORDERS : "bearbeitet"

    MAINTENANCE_ORDERS ||--o{ ORDER_STATUS_AUDIT_LOGS : "historisiert"
    MAINTENANCE_ORDERS ||--o{ ORDER_SPARE_PART_BOOKINGS : "verbraucht"
    SPARE_PARTS ||--o{ ORDER_SPARE_PART_BOOKINGS : "abgebucht"

    MAINTENANCE_ORDERS ||--o{ ORDER_HISTORY_EMBEDDINGS : "vektorisiert"
    EQUIPMENTS ||--o{ ORDER_HISTORY_EMBEDDINGS : "referenziert"

    MAINTENANCE_PLANS ||--o{ MAINTENANCE_PLAN_ITEMS : "umfasst"
    MAINTENANCE_PLAN_ITEMS ||--o{ MAINTENANCE_ORDERS : "generiert"

    AREAS {
        uuid id PK
        uuid tenant_id FK
        string code
        string name
        asset_source source
        string sap_id
        timestamp last_synced_at
    }

    FUNCTIONAL_LOCATIONS {
        uuid id PK
        uuid tenant_id FK
        uuid area_id FK
        uuid parent_functional_location_id FK
        string code
        string name
        asset_source source
        string sap_tplnr
        sap_sync_status sap_sync_status
    }

    EQUIPMENTS {
        uuid id PK
        uuid tenant_id FK
        uuid functional_location_id FK
        uuid parent_equipment_id FK
        string equipment_number
        string name
        asset_source source
        string sap_equipment_nr
        asset_criticality criticality
        asset_status status
    }

    ASSEMBLIES {
        uuid id PK
        uuid tenant_id FK
        uuid equipment_id FK
        string code
        string name
        asset_source source
        string sap_id
        timestamp last_synced_at
    }

    USER_SAVED_VIEWS {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        string name
        string icon
        string intent
        jsonb filter_payload
        integer refresh_interval
        string display_density
        integer position
        timestamp created_at
        timestamp updated_at
    }
```

---

## 6. Laufzeitsicht (Runtime & Sequence Workflows)

### 6.1 Störungserfassung mit KI-Copilot & Deduplizierung

```mermaid
sequenceDiagram
    autonumber
    actor Tech as Techniker / Melder
    participant UI as Störungs-Formular (UI)
    participant Action as order-actions.ts
    participant AI as Fault-Copilot (src/lib/ai)
    participant PG as PostgreSQL (pgvector)
    participant DB as Maintenance Orders

    Tech->>UI: Eingabe von Freitext / Symptomen
    UI->>Action: analyzeFaultInput(title, description, equipmentId)
    Action->>AI: Vectorize Text & Query Nearest Neighbors
    AI->>PG: Cosine Distance Query auf order_history_embeddings
    PG-->>AI: Top Matches & historische Störberichte
    AI->>AI: Duplikatprüfung & Lösungsgenerierung
    AI-->>UI: Duplikat-Warnung, Lösungsvorschläge, Teile, Prio
    Tech->>UI: Bestätigen / Anpassen & "Auftrag anlegen"
    UI->>Action: createMaintenanceOrder(input)
    Action->>DB: INSERT into maintenance_orders (Status: OPEN / DRAFT)
    DB-->>UI: Erfolgsmeldung & Auftragsnummer (z. B. "WO-2026-0042")
```

### 6.2 Statusübergang mit Guard-Prüfungen & Audit-Trail

```mermaid
sequenceDiagram
    autonumber
    actor Tech as Servicetechniker
    participant Action as order-actions.ts
    participant Engine as Workflow-Engine (src/lib)
    participant Guards as Guard Validator
    participant DB as PostgreSQL (Drizzle TX)
    participant SAP as SAP Connector

    Tech->>Action: transitionOrder(orderId, targetStatus: "TABG")
    Action->>Engine: transitionOrderStatus(orderId, "TABG", userId)
    Engine->>DB: Lade Auftrag, Auftragsart, Zielstatus
    Engine->>DB: Lade Übergangsdefinition & RBAC-Rolle
    Engine->>Guards: Prüfe Guard-Conditions (Checkliste, Unterschrift, Zeiten)
    alt Ungültige Guard-Bedingung oder fehlende Rolle
        Guards-->>Engine: WorkflowViolationError / RbacPermissionError
        Engine-->>Action: Transaktionsabbruch & UI Fehlermeldung
    else Alle Bedingungen erfüllt
        Guards-->>Engine: OK
        Engine->>DB: BEGIN TRANSACTION
        Engine->>DB: UPDATE maintenance_orders SET current_status_id = "TABG"
        Engine->>DB: INSERT INTO order_status_audit_logs
        Engine->>DB: COMMIT TRANSACTION
        opt SAP-Synchronisation aktiv
            Engine->>SAP: updateOrderStatus(sapOrderNr, "TABG")
            alt SAP nicht erreichbar
                SAP-->>DB: INSERT INTO sap_sync_queue (Status: PENDING)
            end
        end
        Engine-->>Action: Erfolgsmeldung
    end
```

### 6.3 Offline-Bearbeitung & Reconnect-Synchronisation

```mermaid
sequenceDiagram
    autonumber
    actor Tech as Techniker (Offline)
    participant IDB as Dexie.js (IndexedDB)
    participant Sync as SyncManager
    participant API as /api/sync
    participant Server as MaintAI Server Engine

    Note over Tech,IDB: Gerät verliert Funkverbindung (z. B. Kellergeschoss)
    Tech->>IDB: Bearbeitet Checkliste & setzt Status "INAR"
    IDB->>IDB: Update lokale Tabelle `orders`
    IDB->>IDB: Insert Operation in Tabelle `outbox` (Status: PENDING)
    Note over Tech,Sync: Gerät verbindet sich wieder mit WLAN
    Sync->>Sync: Event: window.onLine / Polling
    Sync->>IDB: Lese alle ungesendeten Outbox-Einträge
    Sync->>API: POST /api/sync (Payload: Outbox-Items mit Timestamps)
    API->>Server: Führe Mutationen chronologisch aus
    Server->>Server: Validiere Guards & Konfliktprüfung (Server-State)
    Server-->>API: Status pro Outbox-Item (PROCESSED / CONFLICT)
    API-->>Sync: Sync-Ergebnis
    Sync->>IDB: Lösche bestätigte Einträge aus `outbox`
    Sync->>IDB: Aktualisiere lokalen Zustand mit Serverdaten
```

### 6.4 Ersatzteilbuchung mit SAP-Outbox-Failover & Idempotenz-Schutz

```mermaid
sequenceDiagram
    autonumber
    actor Tech as Servicetechniker
    participant UI as Ersatzteil-Maske
    participant Action as spare-parts-actions.ts
    participant DB as PostgreSQL
    participant SAP as SAP MM Connector
    participant Queue as sap_sync_queue

    Tech->>UI: Buche Material (MatNr, Menge, clientBookingOfflineId)
    UI->>Action: bookSparePartAction(payload)
    Action->>DB: Prüfe Idempotenz (clientBookingOfflineId)
    alt Bereits gebucht (Idempotenz-Treffer)
        DB-->>Action: Bestehender Buchungsdatensatz
        Action-->>UI: Erfolgsmeldung (Idempotent bestätigt, kein Doppelabzug)
    else Erstbuchung
        Action->>DB: Lokaler Bestandsabzug (BEGIN TRANSACTION)
        Action->>SAP: BAPI_GOODSMVT_CREATE (Bewegungsart 261)
        alt SAP Online
            SAP-->>Action: Belegnummer Materialbeleg
            Action->>DB: Speichere sapDocumentNr & COMMIT
        else SAP Timeout / Offline
            Action->>Queue: INSERT INTO sap_sync_queue (Payload, Status: PENDING)
            Action->>DB: COMMIT TRANSACTION (Lokal reserviert, SAP asynchron)
        end
        Action-->>UI: Buchung erfolgreich bestätigt
    end
```

### 6.5 Dynamische Schichtbegrüßung mit Resilienz-Fallback & Timeout

```mermaid
sequenceDiagram
    autonumber
    actor User as Werker / Techniker
    participant Shell as App-Shell / Workspace UI
    participant Action as greeting-actions.ts
    participant Engine as greeting.ts (determineShiftContext)
    participant AI as ILlmProvider (Gemini/Ollama)
    participant Pool as Deterministic Fallback Pool

    User->>Shell: Öffnet Dashboard (/)
    Shell->>Action: generateDynamicGreetingAction({ firstName, role, plantName })
    Action->>Engine: determineShiftContext(new Date()) -> MORNING/NOON/...
    Action->>AI: Promise.race([ createChatCompletion(prompt), timeout(3500ms) ])
    alt LLM antwortet innerhalb 3.5s
        AI-->>Action: "Guten Morgen Tobias! Auf einen sicheren Produktionstag."
        Action-->>Shell: { success: true, greeting, isAiGenerated: true, isFallback: false }
    else Timeout (>3500ms) oder Provider-Fehler
        Action->>Pool: getDeterministicFallbackGreeting(shiftContext, name)
        Pool-->>Action: "Guten Morgen, Tobias! Bereit für deine Schicht?"
        Action-->>Shell: { success: true, greeting, isAiGenerated: false, isFallback: true }
    end
    Shell-->>User: Rendert Begrüßungszeile im Header
```

### 6.6 Analytics-Pipeline: Prompt-to-Chart mit interaktivem Klärungsdialog (Clarification Loop)

```mermaid
sequenceDiagram
    autonumber
    actor User as Instandhalter / Meister
    participant UI as SingleInputWorkspace (UI)
    participant Action as copilot-actions.ts (executeSingleInputCopilotAction)
    participant Router as copilot.ts (classifyCopilotIntent)
    participant Agent as analytics-agent.ts (executeAnalyticsPrompt)
    participant DB as PostgreSQL (Drizzle)

    User->>UI: Eingabe: "Zeige mir ein Diagramm"
    UI->>Action: executeSingleInputCopilotAction({ prompt, chatHistory })
    Action->>Router: classifyCopilotIntent(prompt) -> Intent: ANALYTICS_CHART
    Action->>Agent: executeAnalyticsPrompt({ tenantId, userPrompt, chatHistory })
    
    alt Unvollständige Anfrage (Fehlender Typ, Metrik oder Bereich)
        Agent->>Agent: status = "NEEDS_CLARIFICATION"
        Agent-->>Action: { status: "NEEDS_CLARIFICATION", clarificationQuestion, suggestedClarifications }
        Action-->>UI: { needsClarification: true, clarificationQuestion, clarificationOptions }
        UI-->>User: Rendert Klärungsfrage & 1-Klick-Chips (Typ, Werte, Bereich, Trend, Farben)
        
        User->>UI: Klick auf Chip: "Liniendiagramm mit Trendlinie: Störungen letzte 30 Tage (Gesamtes Werk, Blau/Grün)"
        UI->>Action: executeSingleInputCopilotAction({ prompt: Chip-Text, conversationHistory })
        Action->>Router: classifyCopilotIntent(followUp) -> Intent: ANALYTICS_CHART
        Action->>Agent: executeAnalyticsPrompt({ tenantId, followUp, chatHistory: [...] })
    end

    Note over Agent,DB: Vollständige Parameter vorhanden -> SQL-Generierung & Ausführung
    Agent->>Agent: Parsen: chartType = "line", hasTrendline = true, colorPalette = ["#3B82F6", "#10B981"]
    Agent->>Agent: Validiere Read-Only Guard & injiziere tenantId = '...'
    Agent->>DB: SELECT TO_CHAR(created_at, 'IW') AS tag, COUNT(id) AS stoerungen FROM maintenance_orders...
    DB-->>Agent: Result Rows
    opt hasTrendline aktiv
        Agent->>Agent: ensureTrendData(): Berechne lineare Regression (trend)
    end
    Agent-->>Action: { status: "SUCCESS", chartType: "line", data, series, hasTrendline: true, colorPalette, summaryInsight }
    Action->>Action: Baue ChartViewWidgetPayload (type: "chart_view", config, series, colors)
    Action-->>UI: SingleInputExecutionResult mit widget: ChartViewWidgetPayload
    UI-->>User: Rendert Recharts-Liniendiagramm mit Trendlinie & Toolbar (Export, Favorit, Zoom)
```

---

## 7. Verteilungssicht & Infrastruktur (Deployment)

### Docker-Compose-Infrastruktur (`docker-compose.yml`)

Das System kann als containerisierte Umgebung für Produktion und On-Premise-Umgebungen betrieben werden:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: maintai_postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d maintai"]

  redis:
    image: redis:alpine
    container_name: maintai_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  maintai-app:
    build: .
    container_name: maintai_web
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgrespassword@postgres:5432/maintai
      - REDIS_URL=redis://redis:6379
```

---

## 8. Querschnittliche Konzepte & Entwurfsentscheidungen

### 8.1 Mandantenisolation (Tenant Isolation)
Jede Query filtert primär nach `tenantId`. Dadurch wird sichergestellt, dass keine Daten zwischen Werken oder externen Mandanten austreten können.

### 8.2 Auditierbarkeit & Compliance
- Jeder Statuswechsel hinterlässt einen unveränderlichen Datensatz in `order_status_audit_logs`.
- Messwerte aus Checklisten speichern den Erfassungszeitpunkt, Prüfer-ID und Out-of-Bounds-Flags.
- Die Historie kann für ISO-Audits (z. B. ISO 9001, ISO 55001) als lückenloser Bericht exportiert werden.

### 8.3 Resilienz & Outbox-Pattern
- Sowohl der Web-Client (Dexie Outbox) als auch das Backend (SAP Sync Queue) arbeiten mit dem **Transactional Outbox Pattern**.
- Dies verhindert Datenverlust bei Verbindungsabbrüchen zwischen Browser und Server bzw. zwischen Server und SAP.

### 8.4 Sicherheit & Zero Trust
- Server Actions prüfen systematisch die RBAC-Rollen (`src/lib/rbac/`).
- Kein ungefiltertes SQL durch KI: Der Analytics-Agent generiert ausschließlich validiertes, schreibgeschütztes SQL.
- Keine sensiblen SAP-Zugangsdaten im Frontend-Code; Authentifizierung gegen SAP erfolgt ausschließlich server-seitig über isolierte Umgebungsvariablen / Vault.

---

## 9. Architecture Decision Records (ADRs)

### ADR-01: Next.js 15 App Router & Server Actions statt separatem Backend
- **Status:** Angenommen
- **Kontext:** Schnelle Entwicklung, einheitliche TypeScript-Typisierung zwischen UI und Geschäftslogik, Reduktion von REST-Boilerplate.
- **Entscheidung:** Nutzung von Next.js 15 Server Actions für Datenmutationen und API Routes für maschinelle Endpunkte (Sync, Webhooks, SAP).
- **Konsequenz:** Höhere Entwicklungsgeschwindigkeit; Server Actions müssen strikte Guard- und Rollenprüfungen selbst durchführen.

### ADR-02: Drizzle ORM mit PostgreSQL + pgvector
- **Status:** Angenommen
- **Kontext:** Benötigt wird eine performante relationale Datenbank mit striktem Schema und nativer Unterstützung für hochdimensionale Vektoren (RAG).
- **Entscheidung:** PostgreSQL 16 mit Erweiterung `pgvector` und Drizzle ORM.
- **Konsequenz:** Keine separate Vektordatenbank (wie Pinecone oder Qdrant) notwendig. Vektoren und Geschäftsdaten liegen in denselben ACID-Transaktionen.

### ADR-03: Adapter-Pattern für SAP PM/MM Integration
- **Status:** Angenommen
- **Kontext:** Kunden betreiben unterschiedliche SAP-Landschaften (S/4HANA OData v4, ECC 6.0 RFC/BAPI oder Standalone ohne SAP).
- **Entscheidung:** Implementierung eines universellen `SapConnector`-Interfaces mit austauschbaren Adaptern (`NoopSapAdapter`, `ODataV4SapAdapter`, `BapiRfcSapAdapter`).
- **Konsequenz:** MaintAI kann modular in jeder Kundenumgebung ohne Code-Refactoring deployed werden.

### ADR-04: Offline-First mit Dexie.js (IndexedDB) & Mutations-Outbox
- **Status:** Angenommen
- **Kontext:** Instandhaltung findet oft in Funklöchern statt.
- **Entscheidung:** Vollständige lokale Datenbankreplikation der zugewiesenen Aufträge auf dem Client via Dexie.js mit synchronisierter Outbox.
- **Konsequenz:** Robuster Betrieb vor Ort; erhöhte Komplexität bei der Konfliktauflösung (gelöst über Last-Write-Wins mit Server-Validierung).

### ADR-05: Hybrides LLM-Provider-Konzept (On-Premise & Cloud)
- **Status:** Angenommen
- **Kontext:** Viele Industrieunternehmen verbieten die Übertragung von Anlagendaten an US-Cloud-Provider.
- **Entscheidung:** Abstraktion `ILlmProvider` mit Unterstützung für lokale Open-Source-Modelle via Ollama/vLLM sowie Cloud-Modelle (OpenAI, Gemini).
- **Konsequenz:** Volle Datensouveränität für Kunden mit On-Premise-Compliance-Anforderungen.

### ADR-06: Conversational-First Single-Input UI & Intent-Routing
- **Status:** Angenommen
- **Kontext:** Traditionelle Instandhaltungs- und ERP-Systeme (wie SAP PM GUI) sind durch unübersichtliche Menübäume, überladene Masken und Medienbrüche geprägt. Für Instandhalter, Schichtleiter und Werker in der Fertigung führt dies zu hohem Schulungsaufwand und zeitintensiven Störungserfassungen vor Ort. Gleichzeitig erfordern heterogene Endgeräte (große Leitstand-Monitore vs. mobile Industrie-Tablets) dynamisch konfigurierbare Aktualisierungsraten und optimierte Informationsdichten.
- **Entscheidung:** Einführung eines **Conversational-First-Prinzips** als primäre Benutzerschnittstelle mit zentralem Single-Input-Workspace (`/`):
  1. **Multimodale Omni-Bar:** Ein zentriertes Single-Input-Feld nimmt Freitext und gesprochene Sprache (`Web Speech API`) entgegen.
  2. **KI-gestützter Intent-Router mit Fallback:** Das Modul `classifyCopilotIntent` analysiert Eingaben über den aktiven LLM-Provider und mappt diese auf vier Kern-Intents (`QUERY_ORDERS`, `CREATE_ORDER`, `UPDATE_VIEW_CONFIG`, `ANALYTICS_CHART`). Bei Offline-Betrieb oder Provider-Ausfällen sichert eine deterministische Regex- und Keyword-Fallback-Logik die Basisfunktionen ab.
  3. **Interaktiver Klärungsdialog (Clarification Loop):** Bei mehrdeutigen Angaben (z. B. unklare Aggregatbezeichnung) wird vor der Ausführung ein strukturierter Rückfragedialog mit 1-Klick-Auswahlbuttons (`ClarificationResult`) generiert.
  4. **Personalisierte Favoriten & Deep-Linking (`user_saved_views`):** Sichten, strukturierte Filterkriterien, Auto-Refresh-Intervalle (0s, 30s, 1m, 5m) und Informationsdichten (`compact`, `standard`, `detailed`) werden mandanten- und benutzerspezifisch in `user_saved_views` persistiert, in der linken Favoritenleiste bereitgestellt und über URL-Parameter (`?viewId=...`) deep-link-fähig gemacht.
  5. **Direktübergang in Störungsmaske:** Bei Erkennung von `CREATE_ORDER` wird eine interaktive Störungs-Entwurfskarte erzeugt, die alle extrahierten Parameter per Deep-Link (`/orders/new?...`) vorbefüllt an die zweigleisige Erfassungsmaske übergibt.
  6. **Widescreen- & Leitstand-Skalierung:** Skalierung des zentralen Workspace-Containers auf `2xl:max-w-[1600px]` sowie der KI-Datenkarten (Tabellen, Recharts-Diagramme, Störungs-Drafts) auf bis zu `2xl:max-w-7xl`, um auf Leitstand-Monitoren und Ultra-Wide-Displays maximale Datenübersicht ohne horizontales Stauchen zu gewährleisten.
- **Konsequenz:** Maximale Erfassungsgeschwindigkeit ohne Menühürden. Leitstände können den Workspace völlig bedienungsfrei als Live-Monitor nutzen. Erhöhte Resilienzanforderungen an das System werden durch deterministische Fallbacks und offline-fähige Caches abgefangen.

### ADR-07: Resiliente KI-Schichtbegrüßung mit deterministischem Fallback-Pool & Timeout-Guard
- **Status:** Angenommen
- **Kontext:** Beim Starten der Anwendung und Betreten des Conversational Workspace (`/`) soll der Instandhalter oder Schichtleiter persönlich und schichtbezogen empfangen werden, um Nutzerakzeptanz und Arbeitsfluss zu stärken. Da LLM-Aufrufe (Gemini, Claude, lokale Ollama-Instanzen) Kaltstarts, Latenzschwankungen oder Offline-Zuständen unterliegen können, darf die Begrüßungsgenerierung unter keinen Umständen den Ladevorgang des Dashboards blockieren oder bei Netzwerkfehlern zu leeren/fehlerhaften UI-Zuständen führen.
- **Entscheidung:**
  1. Kapselung in der Next.js Server Action `generateDynamicGreetingAction` mit automatischer Vorname-/Rollenauflösung über die RBAC-Session (`getCurrentUserRbac`).
  2. Implementierung einer deterministischen Schichtkontext-Erkennung (`determineShiftContext`) nach Uhrzeit (`MORNING`, `NOON`, `AFTERNOON`, `EVENING`, `NIGHT`).
  3. Absicherung des LLM-Aufrufs (`ILlmProvider`) durch ein striktes 3,5-Sekunden-Rennen (`Promise.race([completionPromise, timeoutPromise])`).
  4. Bereitstellung eines statischen, handwerklich geprüften Fallback-Pools (`FALLBACK_GREETINGS`) mit 4 spezifischen Grußformeln pro Schicht, die bei Timeouts, Fehlern oder Offline-Betrieb verzögerungsfrei ausgeliefert werden.
- **Konsequenz:** Ladezeiten des Dashboards bleiben garantiert performant; maximale Resilienz im 24/7-Schichtbetrieb bei voller Personalisierung.

---

## 10. Aktualisierungs- & Pflegeprotokoll

Dieses Dokument unterliegt der verbindlichen Entwicklungsrichtlinie gemäß [`.gemini.md`](../.gemini.md).

> [!IMPORTANT]
> **Pflicht zur Nachführung:**  
> Bei jeder Änderung an folgenden Komponenten **MUSS** dieses Dokument im selben Commit/Arbeitsschritt aktualisiert werden:
> 1. Änderungen am Datenmodell (`src/db/schema.ts` oder Drizzle-Migrationen).
> 2. Neue oder modifizierte Subsysteme in `src/lib/` (z. B. Workflow-Engine, SAP-Adapter, Sync-Engine, KI-Agenten).
> 3. Neue externe Schnittstellen, Rollen, Berechtigungen oder Sicherheits-Guards.
> 4. Änderungen an Infrastruktur und Deployment (`docker-compose.yml`, Dockerfile, Umgebungsvariablen).

| Version | Datum | Bearbeiter / Agent | Durchgeführte Änderungen |
|---|---|---|---|
| **1.6.0** | 2026-10-25 | Technical Documentation & Compliance Agent | **Interaktiver Diagramm-Assistent, Clarification Loop & DB-Indizierung:**<br>1. **Geführter Klärungsdialog (Clarification Loop & Subsystem 4.2.5):** Erweiterung des Analytics-Agenten (`analytics-agent.ts`) und der Server Action `executeSingleInputCopilotAction` um den Zweig `status === "NEEDS_CLARIFICATION"`. Bei unvollständigen Diagrammwünschen erfolgt eine strukturierte Rückfrage nach den 5 Dimensionen (Diagrammtyp, Werte/Kennzahlen, Bereich/Maschine, Trendlinie, Farben) inkl. 1-Klick-Chips (`field: "general"`).<br>2. **Laufzeit- & Sequenzsicht (Abschnitt 6.6):** Neues Sequenzdiagramm 6.6 für die vollständige Analytics-Pipeline mit Klärungsschleife, Multi-Turn-Auflösung und Parameterübergabe (`hasTrendline`, `trendlineKey`, `colorPalette`).<br>3. **Recharts-Visualisierung:** Unterstützung von `bar`, `line`, `pie` (mit Ampelfarben-Segmenten) und `composed` mit dynamischem Trend-Overlay (`ensureTrendData`).<br>4. **Datenbank-Härtung (Schema & Indizes):** Ergänzung hochperformanter Indizes für `maintenance_orders` (`floc`, `priority`, `created_at`, `downtime`), `equipments` (`name`), `functional_locations` (`name`, `area`) sowie `order_spare_part_bookings` & `spare_parts` (`moving_average_price`, `quantity_consumed`, `tenant_id`). |
| **1.5.0** | 2026-10-23 | Technical Documentation & Compliance Agent | **Widescreen- & Leitstand-Optimierung des Conversational Assistant Workspace:**<br>1. **Großbildschirm-Layout (Subsystem 4.2.9 & ADR-06):** Dokumentation der dynamischen Skalierung des zentralen Chat-Scrollcontainers und der Sticky-Eingabeleiste auf bis zu `2xl:max-w-[1600px]` (`px-4 sm:px-6 lg:px-8`).<br>2. **Aufhebung der Breitenbegrenzung für Datenkarten:** Erweiterung des KI-Karten-Wrappers von `max-w-3xl` (768px) auf `max-w-5xl xl:max-w-6xl 2xl:max-w-7xl` für Recharts-Analytics-Diagramme, interaktive Auftragstabellen und Störungs-Drafts.<br>3. **Fluchtendes UI-Design & Hero-Screen:** Ausrichtung der Benutzer-Prompts (`max-w-2xl xl:max-w-3xl`), Angleichung der Begrüßungs-Hero-Breite (`max-w-4xl`) und bündige Fluchtung der Sticky-Bottom-Leiste mit dem Chat-Stream.<br>4. **Anwender-Synchronisation:** Nachführung im Betriebshandbuch `docs/08-ki-stoerungserfassung.md` und in `docs/design-rules.md`. |
| **1.4.0** | 2026-10-23 | Technical Documentation & Compliance Agent | **Client-seitige Multi-Format-Export-Engine (Diagramme & Tabellen):**<br>1. **Subsystem 4.2.11 (`src/lib/export-utils.ts`):** Dokumentation der Schnittstellendefinitionen für `exportChartToPng`, `exportChartToPdf`, `exportTableToCsv` und `exportTableToExcel` inklusive Typisierungen, Funktionssignaturen und Formatierungs-Pipelines.<br>2. **Offline- & DSGVO-Compliance:** Festhaltung der 100% browser- und client-seitigen Rendering-Architektur (DOM Canvas, `jsPDF`, SheetJS/`xlsx`) ohne externe Cloud-Dienste oder Datenübertragungen.<br>3. **Anwender-Handbuch:** Synchronisation mit `docs/05-ai-copilot-analytics.md` bezüglich der UI-Dropdowns im Workspace und Vollbild-Zoom-Modal (A4-Querformat Management-Summary mit Zeitstempel, 2x Retina-PNG, Excel-Auto-Breiten und RFC-4180 CSV mit UTF-8-BOM). |
| **1.3.0** | 2026-10-23 | Technical Documentation & Compliance Agent | **Resiliente KI-Schichtbegrüßung, Offline-Idempotenz & AST-SQL-Security-Guards:**<br>1. **KI-Schichtbegrüßung & ADR-07:** Verankerung von ADR-07 und Dokumentation des Subsystems 4.2.10 (`src/actions/greeting-actions.ts`, `src/lib/ai/greeting.ts`, `src/lib/greeting-utils.ts`) inklusive 3.5s Timeout-Guard und deterministischem Fallback-Pool.<br>2. **Laufzeit- & Sequenzsicht:** Ergänzung der Sequenzdiagramme 6.4 (Ersatzteilbuchung mit SAP-Outbox-Failover & Idempotenz) und 6.5 (Dynamische Schichtbegrüßung mit Timeout-Schutz).<br>3. **Security- & Idempotenz-Härtungen:** Dokumentation der Idempotenz-Absicherung (`clientMutationId` & `clientBookingOfflineId`) gegen Doppelbuchungen sowie des AST-Level Read-Only Guards gegen SQL-Injections im Analytics-Agenten. |
| **1.2.0** | 2026-10-22 | Technical Documentation & Compliance Agent | **Conversational-UI-Architektursynchronisation & ADR-06:**<br>1. **Architektur-Entscheidung (ADR-06):** Verankerung von ADR-06 für die Conversational-First Single-Input UI, den multimodalen Intent-Router und die dynamische Favoritenverwaltung.<br>2. **ERD-Validierung & Konsolidierung:** Vollständige synchrone Abbildung der Tabelle `user_saved_views` (inkl. `filter_payload`, `refresh_interval`, `display_density`, `position` und Unique Index `[user_id, name]`) im arc42-Datenmodell.<br>3. **Anwenderdokumentation:** Aktualisierung und Synchronisation der Anwender- und Betriebshandbücher (`docs/README.md`, `docs/08-ki-stoerungserfassung.md`) bezüglich Omni-Bar, Favoritenleiste, Störungsabsprung, flackerfreiem Auto-Refresh und Dichte-Steuerung. |
| **1.1.0** | 2026-10-21 | Technical Documentation & Compliance Agent | **Conversational Workspace & Anlagenhierarchie:**<br>1. **Conversational Workspace:** Einführung des zentralen Single-Input-First Workspace (`/`) mit Omni-Bar (Freitext & Web Speech API Voice), dynamischer Favoritenleiste ("Meine Favoriten"), URL-Deep-Linking (`?viewId=...`), flackerfreiem Auto-Refresh-Polling (0, 30s, 1m, 5m) und dreistufiger Informationsdichte (`compact`, `standard`, `detailed`).<br>2. **Intent-Router:** Implementierung des KI-gestützten Intent-Routers (`classifyCopilotIntent`) mit Klassifikation von 4 Kern-Intents (`QUERY_ORDERS`, `CREATE_ORDER`, `UPDATE_VIEW_CONFIG`, `ANALYTICS_CHART`), interaktivem Klärungsdialog (`ClarificationResult`) und deterministischer Regex-/Keyword-Fallback-Engine.<br>3. **Datenmodell (ERD):** Ergänzung der relationalen Tabelle `user_saved_views` (Alias `savedViews`) im Drizzle-Schema und im ERD zur Speicherung benutzerindividueller Sichten und Ansichtsfilter.<br>4. **Anlagenhierarchie:** Abbildung der 4-stufigen Struktur (`areas` ➔ `functional_locations` ➔ `equipments` ➔ `assemblies`) inklusive Herkunftsflag `source` (`asset_source`: `SAP` vs. `MANUAL`), SAP-Schreibschutz (`assertManualAssetModificationAllowed`), SAP-Origin-Schutz (`assertNotSapSource`) und Standalone-Verwaltung. |
| **1.0.0** | 2026-10-21 | Antigravity AI | Initiale Erstellung des ganzheitlichen Softwarearchitekturdokuments (arc42/IEEE-konform) inklusive aller Subsysteme, Diagramme und ADRs. |
