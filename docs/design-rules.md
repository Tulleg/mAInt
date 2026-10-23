# Design-System: MaintAI (Modern Light Theme)

## 1. Farbpalette & Semantik (Tailwind CSS Tokens)
- **App-Canvas (Hintergrund):** `bg-slate-50` (#f8fafc)
- **Cards, Modals & Dropdowns:** `bg-white` (#ffffff) mit Schatten `shadow-sm` und Rand `border-slate-200` (#e2e8f0)
- **Hover / Aktive Flächen:** `bg-slate-100` / `hover:bg-slate-100`
- **Typografie Primär:** `text-slate-900` (#0f172a)
- **Typografie Sekundär (Muted):** `text-slate-500` (#64748b)
- **Primär-Akzent (Buttons & Ringe):** `bg-blue-600 hover:bg-blue-700 text-white focus-visible:ring-blue-500`

## 2. Status- & Prioritäten-Badges (Freundlich & Kontrastreich)
- **Prio 1 (Notfall / Stillstand):** `bg-rose-100 text-rose-700 border-rose-200`
- **Prio 2 (Hoch):** `bg-amber-100 text-amber-800 border-amber-200`
- **Prio 3 (Mittel) / 4 (Niedrig):** `bg-slate-100 text-slate-700 border-slate-200`
- **Status ERFASST / NEU:** `bg-sky-100 text-sky-800 border-sky-200`
- **Status IN_ARBEIT:** `bg-amber-100 text-amber-800 border-amber-200`
- **Status TABG (Erledigt):** `bg-emerald-100 text-emerald-800 border-emerald-200`
- **Herkunft SAP:** `bg-indigo-100 text-indigo-700 border-indigo-200`
- **Herkunft Manuell:** `bg-slate-100 text-slate-600 border-slate-200`

## 3. UI-Elemente & Startseite (Conversational Workspace)
- **Omni-Input:** `max-w-3xl w-full mx-auto bg-white rounded-2xl shadow-md border-slate-200`
- **Touch-Targets:** Mindestens `min-h-[44px]` für Buttons und Klickbereiche.
- **Icons:** Ausschließlich aus `lucide-react`.
- **FigCraft Vektor-Mockup:** Frame 1 ("01 - Startseite (Workspace initial)") in `docs/maint-ai-design-system.figcraft` (Screenshot: `docs/screenshots/01 - Startseite _Workspace initial_.png`).

## 4. Login- & Authentifizierungsmaske (Modern Industrial Light Theme)
- **Canvas:** Desktop 1920x1080 px, Canvas: Sanftes Slate-50 (`#F8FAFC`).
- **Zentrierte Card:** `max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-md`.
- **Branding Header:** MaintAI Logo (Blue Dot Akzent `#2563EB`), Titel *"Industrieller Instandhaltungs-Leitstand"*, Subline *"Melden Sie sich mit Ihrem Werks-Account an"*.
- **Enterprise SSO:** Großer Primärzugang `[ 🏢 Mit Firmen-SSO / Azure AD anmelden ]` (Variant Outline, Border `border-slate-300`, min-h-[46px]).
- **Trennlinie:** `— oder mit Kennung anmelden —` (`border-slate-200`, `text-slate-400`).
- **Formularfelder:**
  - *Personalnummer / Benutzername:* Input mit Icon `lucide: User` (`min-h-[44px]`, `bg-slate-50 border-slate-300`).
  - *Passwort:* Input mit Icon `lucide: Lock` und Link *Passwort vergessen?* (`text-blue-600`).
  - *Terminal-Persistenz:* Checkbox `[x] Auf diesem Werkstatt-Terminal angemeldet bleiben`.
  - *Primärer Anmelde-Button:* `[ Anmelden → ]` (`bg-blue-600 text-white font-medium min-h-[46px]`).
- **Status & Offline-Indikator (Footer):** Dezent zentriert `MaintAI v1.1.0 • Offline-Sync aktiv • Server: Online` mit pulsierendem Emerald-Online-Indikator.
- **FigCraft Vektor-Mockup:** Frame 4 ("04 - Login & SSO") in `docs/maint-ai-design-system.figcraft` (Screenshot: `docs/screenshots/04 - Login _ SSO.png`).

## 5. Diagramm-Auswertungsansicht (Prompt-to-Chart)
- **Kontext:** Entsteht direkt aus einer Tabellenabfrage im Conversational Workspace (`QUERY_ORDERS` ➔ `ANALYTICS_CHART`).
- **Toolbar über dem Chart (Die Umschalter):**
  - Links: View-Umschaltgruppe:
    - `[📋 Tabellen-Ansicht]` (Inaktiv, Outline, `border-slate-300 text-slate-700`)
    - `[📊 Diagramm-Ansicht]` (Aktiv, `bg-blue-600 text-white font-semibold`)
    - **KI-Aktions-Button:** `[✨ Diagramm aus Tabelle generieren]` (Hervorgehoben mit Zauberstab-Icon `lucide: Wand2`, `border-blue-300`, `bg-blue-50 text-blue-700 font-bold`)
  - Rechts:
    - Dropdown: `Diagrammtyp: Säulendiagramm ▾`
    - Dropdown: `🔄 Auto-Refresh: 30s ▾`
    - Button: `[⭐ Zu Favoriten hinzufügen]`
- **Chart-Fläche (Recharts-Container auf weißer Card):**
  - Weißer Card-Container mit `border-slate-200 p-6 rounded-xl shadow-sm bg-white`.
  - Titel: *"Offene Störungen nach Gewerk & Priorität (Halle 1)"* (`text-slate-900 font-bold text-lg`).
  - Subtitel: *"4 offene Meldungen • 2x Mechanik, 1x Pneumatik, 1x Elektrik"* (`text-slate-500 text-sm`).
  - Bar-Chart mit freundlichen Pastellfarben:
    - *KUKA Roboter KR210 (Achse 2):* Pastellrote Säule (`#FCA5A5` / `#EF4444`, Prio 1/Notfall, 1h 45m Stillstand, Gewerk Mechanik).
    - *Förderband B3:* Pastellrote Säule (`#FCA5A5` / `#EF4444`, Prio 1/Notfall, 2h 10m Stillstand, Gewerk Mechanik).
    - *Pneumatik Zelle 3:* Pastellgelbe Säule (`#FCD34D` / `#F59E0B`, Prio 2/Mittel, 45m Druckabfall, Gewerk Pneumatik).
    - *Schutzgitter Roboter 4:* Pastellblaue Säule (`#93C5FD` / `#3B82F6`, Prio 3/Niedrig, 20m Störung, Gewerk Elektrik).
  - Unten integriertes Zusammenfassungs-Badge der KI:
    - `💡 KI-Erkenntnis: 50% der Störungen betreffen Antriebsüberlastungen in Zelle 1. Dichtsatz KUKA im Lager verfügbar.` (`bg-emerald-50 border-emerald-200 text-emerald-800 rounded-xl`).
- **FigCraft Vektor-Mockup:** Frame 3 ("03 - KI-Diagrammansicht (Prompt-to-Chart)") in `docs/maint-ai-design-system.figcraft` (Screenshot: `docs/screenshots/03 - KI-Diagrammansicht _Prompt-to-Chart_.png`).

## 6. Admin- & Grundkonfigurations-Screen (`/admin/settings`)
- **Canvas:** Desktop 1920x1080 px, Canvas: Sanftes Slate-50 (`#F8FAFC`).
- **Sidebar links (260px):**
  - Header: Logo 'MaintAI' mit blauem Akzent-Dot (`#2563EB`) und Subline 'Werk 01 - Rohbau'.
  - Favoriten: '⭐ Störungen Rohbau 1', '⭐ Meine offenen Tasks', '⭐ Wartungen KW 43'.
  - Unten fixiert: '⚙️ Admin Settings' im aktiven Zustand (`bg-blue-50 text-blue-700 font-semibold rounded-lg`).
- **Top Navbar:**
  - Status: Grüner Punkt `● Online`.
  - Cloud-Sync-Badge: `SAP PM: Verbunden / Standalone bereit`.
  - Profil-Pill: `👤 Max Mustermann (Super-Admin)`.
- **Hauptbereich (Admin-Settings Shell):**
  - Header mit Titel, Subline und Button `[💾 Alle Änderungen speichern]` (`bg-blue-600 text-white shadow-sm`).
  - Horizontale Tab-Leiste:
    - Tab 1: `[ 🏢 SAP ERP & Betriebsmodus ]` (Aktiv / Selected mit blauem Indikator)
    - Tab 2: `[ 🤖 KI-Provider & RAG ]`
    - Tab 3: `[ 🏷️ Schadenscodes & Auftragsarten ]`
    - Tab 4: `[ 🔀 Workflow- & Rollenmatrix ]`
    - Tab 5: `[ 👥 Benutzerverwaltung & SSO / AD ]`
- **Konfigurations-Cards (2-Spalten-Layout):**
  - **Spalte Links (SAP & ERP-Schnittstelle):**
    - Radio-Gruppe: `STANDALONE (Autark)`, `SAP ODATA V4 (Enterprise Sync)` (aktiv, schreibgeschützt), `SAP RFC / BAPI (Legacy ERP)`.
    - Gateway Host URL (`https://s4hana.werk.internal:8443/sap/opu/odata4/`), Mandant (`100`), System-ID (`PRD`), Auth (`Technischer User`), Sync (`60 Min`).
    - Actions: `[ 🔌 Verbindung testen ]`, `[ 🔄 Delta-Sync der Anlagenstruktur starten ]`.
    - Status: `🟢 Verbunden: Vor 12 Min. synchronisiert (1.420 Equipments, 0 Queue-Fehler)`.
  - **Spalte Rechts – Oben (KI-Provider & Inferenz-Backend):**
    - Toggle: `Cloud Provider` vs. `Self-Hosted On-Premise (Datensouverän)` (aktiv).
    - Grid: LLM Endpoint (`http://ollama-service.internal:11434/v1`), Chat-Modell (`llama3.3:70b-instruct-q4_K_M`), pgvector Embedding (`nomic-embed-text`), Intent-Threshold (`0.85`).
    - Actions: `[ ⚡ Ping LLM Backend ]` mit Badge `Antwortzeit: 48ms (Online)`.
  - **Spalte Rechts – Unten (3 Kacheln):**
    - Kachel 1 (Kataloge): Codes `IH01` bis `IH04`, Schadensgruppen `MECH`, `HYDR`, `ELEK`, Link `[Kataloge bearbeiten →]`.
    - Kachel 2 (Workflow): `ERFASST` ➔ `FREIGEGEBEN` (Planer), `IN_ARBEIT` ➔ `TABG` (Techniker), Guards & Eskalation Level 2/3 aktiv, Link `[Matrix-Editor öffnen →]`.
    - Kachel 3 (Benutzer & SSO): `48 Benutzer aktiv`, 3 Rollen, Azure AD Sync aktiv, Button `[ 👥 Benutzer & AD-Import verwalten ]`.
- **FigCraft Vektor-Mockup:** Frame 5 ("05 - Admin & Grundkonfiguration") in `docs/maint-ai-design-system.figcraft` (Screenshot: `docs/screenshots/05 - Admin _ Grundkonfiguration.png`).

---

## 7. Konsolidiertes Gesamt-Design-System (Zentrale Projektdatei)

Alle 5 Kern-Screens sind in einer einzigen zentralen Vektordatei zusammengeführt und auf demselben Canvas nebeneinander angeordnet:
- **Zentrale Projektdatei:** `docs/maint-ai-design-system.figcraft`
- **Panorama-Screenshot (Gesamtansicht 10320×1080 px):** `docs/screenshots/maint-ai-design-system-overview.png`
- **Einzelexporte der 5 Frames (jeweils 1920×1080 px, 180 px horizontaler Abstand / 2100 px Versatz):**
  1. `docs/screenshots/01 - Startseite _Workspace initial_.png` (x: 0, y: 0)
  2. `docs/screenshots/02 - Abfrageergebnis _Dynamische Ergebnistabelle_.png` (x: 2100, y: 0)
  3. `docs/screenshots/03 - KI-Diagrammansicht _Prompt-to-Chart_.png` (x: 4200, y: 0)
  4. `docs/screenshots/04 - Login _ SSO.png` (x: 6300, y: 0)
  5. `docs/screenshots/05 - Admin _ Grundkonfiguration.png` (x: 8400, y: 0)




