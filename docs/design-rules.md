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
- **Omni-Input & Workspace-Container:** Hero-Zustand: `max-w-4xl w-full mx-auto`; Chat-Scrollbereich & Sticky-Eingabeleiste: responsiv `max-w-7xl 2xl:max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8`; KI-Visualisierungskarten (Diagramme/Tabellen): `max-w-5xl xl:max-w-6xl 2xl:max-w-7xl w-full`.
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
    - Dropdown: `🔄 Auto-Refresh: 30s ▾` (Intervall-Optionen: Aus, 30s, 1m, 5m)
    - Button: `[⭐ Zu Favoriten hinzufügen]` (bzw. `[⭐ Zu Favoriten]`)

### 5.1 UI-Standards: Favoriten-Button & Auto-Refresh im Chart-Header
- **`[⭐ Zu Favoriten]`-Button:**
  - **Token & Styling:** `inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold transition-colors shadow-2xs`
  - **Icon:** Lucide `Star` (`h-4 w-4 text-amber-500 fill-amber-500 shrink-0`)
  - **Label:** `Zu Favoriten hinzufügen` (bzw. `Zu Favoriten`)
  - **Touch-Target & Ergonomie:** Mindestens `min-h-[44px]` für fehlerfreie Touch-Bedienung an Werkstatt-Terminals und Mobilgeräten.
  - **Feedback-Status (Quittierung):** Nach erfolgreichem Speichern wechselt der Text temporär (2.500 ms) auf `Gespeichert!`, begleitet vom gefüllten Stern-Icon (`fill-amber-500`).
- **`🔄 Auto-Refresh`-Dropdown:**
  - **Container-Tokens:** `flex items-center gap-2 text-xs text-slate-700 bg-white px-3 min-h-[44px] rounded-lg border border-slate-300 shadow-2xs`
  - **Icon:** Lucide `RefreshCw` (`h-3.5 w-3.5 text-blue-600 shrink-0`)
  - **Label:** `Auto-Refresh:` (`hidden sm:inline`)
  - **Select-Element:** `bg-transparent text-slate-900 text-xs font-medium cursor-pointer outline-none min-h-[44px]`
  - **Konfigurierbare Optionen:** `Aus` (0s), `30s` (30s Polling), `1m` (60s Polling), `5m` (300s Polling).

### 5.2 UI-Standards: Sidebar-Favoriteneinträge & Intervall-Pill
- **Favoriten-Eintrag in der linken Seitenleiste (`app-shell.tsx`):**
  - **Container:** `w-full flex items-center justify-between px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium transition-all text-left group`
  - **Inaktiv:** `text-slate-700 hover:text-slate-900 hover:bg-slate-50 border border-transparent`
    - Icon: Lucide `Star` (`h-3.5 w-3.5 shrink-0 transition-colors text-amber-500 fill-amber-500/30 group-hover:fill-amber-500`)
  - **Aktiv (Ausgewählt):** `bg-blue-50 text-blue-700 border border-blue-200 font-medium shadow-xs`
    - Icon: Lucide `Star` (`h-3.5 w-3.5 shrink-0 text-blue-600 fill-blue-600`)
- **Intervall-Pill (Auto-Refresh Badge):**
  - **Bedingung:** Wird automatisch rechtsbündig im Favoriteneintrag gerendert, wenn für die Ansicht ein aktives Polling-Intervall (`refreshInterval > 0`) hinterlegt ist.
  - **Token & Styling:** `text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0`
  - **Typografie:** Technische Monospace-Schrift (`font-mono`) zur klaren Kennzeichnung von Systemzeit-Intervallen.
  - **Textformat:** `{interval}s` (z. B. `30s`, `60s`, `300s`).
  - **Layout-Stabilität:** `shrink-0` stellt sicher, dass die Pill bei längeren Titeln nicht gestaucht wird; der Favoritentitel links wird automatisch mit `truncate` gekürzt.
  - **Kontrast & Lesbarkeit:** Fügt sich unaufdringlich in das helle Designsystem ein und behält sowohl im inaktiven Zustand als auch im aktiven Status (`bg-blue-50`) exzellente Kontrastwerte nach WCAG 2.1 AA.

### 5.3 UI-Standards: Diagramm-Großansicht & ChartZoomModal
- **Trigger im Chart-Header (`[⛶ Vergrößern]`):**
  - **Button-Token:** `inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] sm:min-h-[44px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer`
  - **Icon:** Lucide `Maximize2` (`h-3.5 w-3.5 text-slate-500`)
  - **Label:** `⛶ Vergrößern` (mit Tooltip *"Diagramm vergrößern"*)
- **Backdrop & Overlay-Layering:**
  - **Token & Styling:** `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200`
  - **Verhalten:** Dunkler Backdrop mit 60 % Deckkraft (`bg-black/60`) und sanftem Unschärfefilter (`backdrop-blur-sm`) fokussiert die Auswertung. Klick auf den Backdrop löst `onClose` aus.
- **Modal-Shell (Industrial Light Theme):**
  - **Container:** `w-full max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-slate-900`
  - Klicks im Modal werden per `e.stopPropagation()` isoliert.
- **Header & Interaktionssteuerung (Barrierefreiheit & Touch-Ergonomie):**
  - **Schließen-Button (`✕`):** Mindest-Touch-Target von 44px (`h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer`) mit Lucide `X` (`h-5 w-5`).
  - **Tastatursteuerung:** `Escape`-Taste schließt das Modal zuverlässig per globalem Event-Listener (`window.addEventListener('keydown')`).
  - **Modal-Aktionsbuttons:**
    - `[⭐ Zu Favoriten]`: `inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-amber-50 hover:border-amber-300 hover:text-amber-800 text-slate-700 text-xs sm:text-sm font-semibold transition-all shadow-2xs`
    - `[📋 Als Tabelle]`: `inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-all shadow-2xs`
  - **Live-Status Badge:** `Vollbild-Analyse` mit grün pulsierendem Indikator (`h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse`).
- **Vergrößerte Recharts-Canvas:**
  - **Container:** `h-[60vh] sm:h-[65vh] w-full bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col`
  - **Achsen & Typografie:** X-Achsenbeschriftung mit vollen Equipments/Anlagen ohne Verkrüppelung (`interval={0}`, `fontSize={12}`, `fontWeight={600}`, `#334155`), Y-Achse mit Einheit (`unit="h"`).
  - **Interaktiver Tooltip:** Floating Card (`bg-white p-4 border border-slate-200 rounded-2xl shadow-xl text-xs min-w-[240px] animate-in zoom-in-95`) mit Stillstandsstunden, Vorfallanzahl und Prioritätsstufe.
- **Footer mit KI-Erkenntnis & Zeitraum-Filter:**
  - **KI-Erkenntnis Pill:** `flex-1 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center gap-2.5 text-xs sm:text-sm` mit Lucide `Lightbulb`.
  - **Zeitraum-Filter:** Schnellumschaltung (`7 Tage`, `30 Tage`, `90 Tage`) in Segmented Control (`bg-slate-100 p-1 rounded-xl border border-slate-200`), aktive Option `bg-white text-blue-700 font-bold shadow-xs`, barrierefreie Touch-Höhe.
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




