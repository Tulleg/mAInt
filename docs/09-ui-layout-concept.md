# UI/UX Spezifikation: Conversational Workspace & Favoriten

## 1. Zielbild & Philosophie

MaintAI verfolgt ein **Conversational-First**-Bedienparadigma:
- **Zentraler Einstiegspunkt:** Ein zentriertes Omni-Eingabefeld verarbeitet natürliche Sprache (Freitext sowie gesprochene Sprache über die Web Speech API).
- **Kontextuelle Aktionsausführung:** Anstatt durch starre Menühierarchien zu navigieren, generiert jede Eingabe kontextuell die passenden UI-Elemente direkt unterhalb der Eingabezeile (gefilterte Datentabellen, Störungs-Entwürfe, Klärungsdialoge oder KPI-Diagramme).
- **Persönliche Favoriten-Navigation:** Über eine dynamische Seitenleiste ("Meine Favoriten") können häufig genutzte Filterzustände und Leitstands-Ansichten mit einem Klick aufgerufen werden.

---

## 2. Kernkomponenten des Conversational Workspace

### 2.1 Single-Input Omni-Bar
- **Freitext & Spracherkennung:** Mikrofon-Button zur Sprachaufzeichnung (`Web Speech API`, `de-DE`) mit visueller Puls-Animation bei aktiver Aufnahme.
- **Multimodaler Intent-Router (`classifyCopilotIntent`):**
  - `QUERY_ORDERS`: Filterung nach Bereich, Anlagen, Status und Prioritäten.
  - `CREATE_ORDER`: Extraktion von Störungsparametern mit Vorschaukarte und Schnelllink nach `/orders/new`.
  - `UPDATE_VIEW_CONFIG`: Dynamische Konfiguration von Aktualisierungsraten und Dichte per Sprachbefehl.
  - `ANALYTICS_CHART`: Generierung von Diagrammen und Aggregationen.
- **Interaktiver Klärungsdialog (Clarification Loop):** Erkennt die KI Mehrdeutigkeiten (z. B. mehrere gleichnamige Aggregate im Werk), blendet das System 1-Klick-Auswahlbuttons ein, um die Anfrage ohne Neueingabe zu präzisieren.

### 2.2 Favoriten-Seitenleiste ("Meine Favoriten")
- **Persistenz in `user_saved_views`:** Mandanten- und benutzerspezifische Speicherung von Name, Icon (`star`, `flame`, `alert`, `wrench`), Filterkriterien, Aktualisierungsrate und Layout-Dichte.
- **Nahtlose Umschaltung:** Klick auf einen Favoriten schaltet die Ansicht ohne Seiten-Reload um und synchronisiert die URL per Deep-Link (`/?viewId=<uuid>`).
- **Workspace-Reset (`[+]`):** Setzt die aktive Sicht zurück und öffnet eine leere Omni-Bar für neue Eingaben.
- **Einklappbare Fachmodule:** Administrative und komplexe Planungsmasken (Auftragsliste, Gantt-Board, Prüfprotokolle, Anlagenverwaltung, SAP-Konfiguration) sind im Bereich *"WEITERE MODULE"* übersichtlich erreichbar.

### 2.3 Dynamische Ergebnistabelle & View-Optionen
- **[⭐ Zu Favoriten hinzufügen]:** Dialog zum Speichern der aktuellen Suchkriterien und Ansichtseinstellungen.
- **Flackerfreies Auto-Refresh-Polling:** Konfigurierbar auf `0s` (Aus), `30s`, `1m` (60s) oder `5m` (300s) über den Hook `useInterval`. Aktualisiert die Auftragsdaten im Hintergrund ohne Flickern und ohne Verlust des Fokus oder des Scroll-Zustands.
- **Dreistufige Informationsdichte (`displayDensity`):**
  - **Kompakt (`compact`):** Für Leitstände und Großmonitore zur simultanen Überwachung vieler Vorgänge.
  - **Standard (`standard`):** Ausgewogenes Standardlayout für Desktop-Monitore.
  - **Detailliert (`detailed`):** Große Touch-Targets (mind. `44px`) und Zusatzdetails für Werkstatt-Tablets vor Ort an der Produktionslinie.
- **Schnellabsprung:** Jede Tabellenzeile besitzt einen Direkt-Button `[Öffnen]`, der unmittelbar in die Detailbearbeitung der Maßnahme (`/orders/[id]`) führt.

### 2.4 Prompt-to-Chart Diagramm-Auswertungsansicht & View-Switcher
- **Direkte Umschaltung Tabellen- vs. Diagrammansicht:**
  - Toolbar mit View-Umschaltgruppe:
    - Button `[📋 Tabellen-Ansicht]` (Outline, Tabellarische Störungsliste)
    - Button `[📊 Diagramm-Ansicht]` (Primär-Aktiv `bg-blue-600 text-white`)
    - **KI-Aktions-Button:** `[✨ Diagramm aus Tabelle generieren]` (Hervorgehoben mit Zauberstab-Icon `lucide: Wand2`, `border-blue-300`, `bg-blue-50 text-blue-700`) zur automatischen Ableitung von Aggregationen und Säulenvisualisierungen aus aktuellen Filterkriterien.
- **Recharts-Container (Moderne Card mit `border-slate-200 p-6 rounded-xl`):**
  - Aufbereitung nach Dringlichkeit/Stillstandsdauer und Gewerk (Mechanik, Pneumatik, Elektrik).
  - Pastellfarbene Säulen nach Prioritätsstufe: Prio 1 (Pastellrot), Prio 2 (Pastellgelb), Prio 3 (Pastellblau).
  - Floating Badges über den Säulen zur schnellen Erfassung kritischer Kennzahlen.
  - **KI-Erkenntnis-Badge (Footer):** Kontextuelle Zusammenfassungen und proaktive Handlungsempfehlungen (z. B. Identifikation von Klumpenrisiken und Prüfung der Ersatzteilverfügbarkeit im Lager).
- **Referenz-Mockup:** Frame 3 ("03 - KI-Diagrammansicht (Prompt-to-Chart)") im Gesamt-Design-System `docs/maint-ai-design-system.figcraft` (Screenshot: `docs/screenshots/03 - KI-Diagrammansicht _Prompt-to-Chart_.png`).

### 2.5 Dynamische KI-Schichtbegrüßung & Kontextbanner
- **Kontextuelle Begrüßungszeile:** Im oberen Bereich des Workspace (`/`) wird der angemeldete Instandhalter oder Schichtleiter mit einer dynamischen, schichtbezogenen Begrüßung empfangen.
- **Server Action `generateDynamicGreetingAction`:**
  - Extrahiert Vorname und Rolle aus der aktiven RBAC-Session (`getCurrentUserRbac`).
  - Erkennt automatisch das Zeitfenster (`MORNING`, `NOON`, `AFTERNOON`, `EVENING`, `NIGHT` bzw. `morgen`, `mahlzeit`, `tag`, `abend`, `nacht`).
  - Ruft den aktiven LLM-Provider mit Low-Temperature (`0.7`) und striktem System-Prompt auf (max. 6-8 Wörter).
  - **Resilienz & Ausfallsicherheit:** Deterministischer 3.5s Timeout mit automatischem Fallback auf den vordefinierten Begrüßungspool (`FALLBACK_GREETINGS`), sodass weder Netzwerkverzögerungen noch Offline-Zustände den Seitenaufbau blockieren.

---

## 3. Navigations- & Detailmasken-Standards

Gemäß den **Design- & Navigationsrichtlinien** (`docs/design-rules.md`) gilt für alle Detailmasken und Subseiten:
1. **Zwingender Zurück-Button:**
   - Jede Detail- und Erfassungsmaske muss links oben im Header einen standardisierten Zurück-Button mit dem Lucide-Icon `ArrowLeft` aufweisen.
   - Beispiele:
     - `/orders/[id]` ➔ `<ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Auftragsliste` (Link nach `/orders`).
     - `/orders/new` ➔ `<ArrowLeft className="w-3.5 h-3.5" /> Zurück zum Planungsboard` (Link nach `/planning`).
     - `/admin/users` ➔ `<ArrowLeft className="w-3.5 h-3.5" /> Zurück zur System-Administration` (Link nach `/admin`).
     - `/analytics` ➔ `<ArrowLeft className="w-4 h-4" /> Zu Aufträge & Störungen` (Link nach `/orders`).
2. **Touch-Ergonomie (44px Regel):**
   - Interaktive Flächen besitzen eine Mindesthöhe von **44px** (`min-h-[44px]`), um auch unter industriellen Bedingungen (Touchscreens, Schutzhandschuhe) zuverlässig bedienbar zu bleiben.
