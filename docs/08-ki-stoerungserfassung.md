# 08 - KI-gestützte Störungserfassung & Auftragsanlage

In MaintAI können Instandhaltungsmaßnahmen, Notfälle und Störungsmeldungen nahtlos über das zentrale **Conversational-UI-Konzept** auf der Startseite (`/`) oder über die zweigleisige Erfassungsmaske unter `/orders/new` erfasst und überwacht werden.

---

## 1. Direkteingabe im Conversational Workspace (Single-Input Omni-Bar)

Der schnellste Weg zur Erfassung einer Störung führt über das zentrale **Single-Input-Eingabefeld (Omni-Bar)** des Dashboards (`/`):

1. **Multimodale Eingabe (Freitext & Sprache):**
   - Werker oder Meister können Störungen in natürlicher Sprache eingeben oder über das Mikrofonsymbol (`Web Speech API`) direkt an der Maschine einsprechen (z. B. *„Kreiselpumpe KSB in Halle 2 verliert massiv Druck, Motorblock ist heiß und vibriert. Sofort Stillstand erfassen!“*).
2. **Automatisches Intent-Routing (`CREATE_ORDER`):**
   - Der integrierte Intent-Router (`classifyCopilotIntent`) erkennt automatisch, dass eine Störungsmeldung vorliegt, und extrahiert:
     - Einen prägnanten, normgerechten Titel.
     - Eine ausführliche technische Problembeschreibung.
     - Die betroffene Anlage bzw. das Equipment.
     - Die Dringlichkeit bzw. Priorität (`1_EMERGENCY`, `2_HIGH`, `3_MEDIUM`, `4_LOW`).
3. **Interaktiver Klärungsdialog (Clarification Loop):**
   - Ist die Eingabe mehrdeutig (z. B. wenn im Werk mehrere *„KSB Pumpen“* existieren oder der Hallenbereich unklar ist), blendet das System strukturierte 1-Klick-Auswahloptionen ein. Ein Klick präzisiert die Anlage ohne lästiges Nachtippen.
4. **Störungs-Entwurfskarte & Direktübergang:**
   - Direkt unter dem Eingabefeld erscheint eine visuelle Vorschaukarte der erkannten Störung.
   - Über den Button **[Im Erfassungsdialog öffnen]** werden alle Parameter per URL-Deep-Linking vorbefüllt an die Erfassungsmaske übergeben:
     ```text
     /orders/new?title=...&description=...&priority=...&equipmentId=...
     ```

---

## 2. Dual-Mode Erfassungsmaske (`/orders/new`)

Wird der vollständige Erfassungsdialog geöffnet, stehen zwei komplementäre Arbeitsmodi bereit:

### Modus A: 🤖 KI-Prompt-Modus (Sprach- & Freitext-Erfassung)
Für Werker, Meister und Schichtführer direkt an der Linie:
- **Freitext- und Audio-Eingabe:** Ermöglicht die formlose Beschreibung der Fehlerursache und beobachteter Symptome.
- **Automatisches LLM-Parsing:** Extrahiert normgerechte Titel, Beschreibung, Equipment-Referenz, Priorität und passende SAP-Schadenscodes (z. B. `MECH_LAGER`, `HYDR_LECK`).
- **Interaktive Pflichtfeld-Rückfragen:** Fehlende Stillstandsinformationen oder unklare Baugruppen werden im Dialog interaktiv geklärt.
- **1-Klick-Übernahme:** Der generierte Entwurf kann direkt verbindlich angelegt oder im manuellen Modus nachbearbeitet werden.

### Modus B: 📝 Manuelles Formular mit integriertem Copilot
Für klassische Arbeitsvorbereitung, Meister und Disponenten:
- Strukturierte Eingabefelder für Auftragstitel, Equipment, Priorität, Schadensgruppe, geplante Dauer und Stillstandszeiten.
- **Integrierter MaintAI Copilot (RAG via `pgvector`):**
  - **Echtzeit-Duplikaterkennung:** Vergleicht die Störung in Echtzeit mit offenen Aufträgen und historischen Berichten, um Doppeldispositionen zuverlässig zu verhindern.
  - **Reparatur- & Ersatzteilvorschläge:** Ermittelt über Vektor-Ähnlichkeitssuche bewährte Lösungswege und listet benötigte Ersatzteile samt SAP-Materialnummern und Lagerbeständen auf.

---

## 3. Störungsüberwachung mit der Favoritenleiste ("Meine Favoriten")

Um akute Störungen, Schichtschwerpunkte oder spezifische Anlagenbereiche im Blick zu behalten, nutzt MaintAI benutzerspezifische Favoriten (`user_saved_views`):

1. **Sichten per Sprache oder Prompt filtern:**
   - Eine Abfrage in der Omni-Bar wie *„Zeige alle Notfälle in Halle 1“* oder *„Offene Störungen der Pumpenlinie“* lädt die passenden Datensätze direkt in die interaktive Ergebnistabelle.
2. **Zu Favoriten hinzufügen:**
   - Über den Button **[⭐ Zu Favoriten hinzufügen]** öffnet sich ein Dialog zur dauerhaften Sicherung.
   - Konfigurierbar sind: **Name der Sicht**, **Icon** (Stern, Flamme, Warnung, Schraubenschlüssel), **Auto-Refresh-Intervall** und **Informationsdichte**.
3. **Favoritenleiste (Linke Sidebar):**
   - Gespeicherte Sichten erscheinen unter **"Meine Favoriten"** in der linken Navigationsleiste.
   - Ein Klick wechselt sofort und ohne Seiten-Reload in die Sicht und aktualisiert die URL (`/?viewId=<uuid>`).
   - Über das **`[+]`**-Symbol lässt sich der Workspace jederzeit wieder auf eine frische Eingabe zurücksetzen.
   - Fachmodule (Gantt-Planung, Protokolle, Stammdaten) bleiben im einklappbaren Bereich *„WEITERE MODULE“* jederzeit erreichbar.

---

## 4. View-Optionen: Auto-Refresh & Informationsdichte

Für unterschiedliche Einsatzszenarien (vom Großbildschirm im Leitstand bis zum Tablet im Außeneinsatz) bietet MaintAI flexible View-Optionen:

### Flackerfreies Auto-Refresh-Polling
- **Intervalle:** Aus (`0s`), `30s`, `1m` (60 Sekunden) oder `5m` (300 Sekunden).
- **Geräuschlose Aktualisierung:** Über den Hook `useInterval` werden Auftrags- und Störungsdaten im Hintergrund aktualisiert, ohne die Seite neu zu laden, den Scroll-Zustand zu verwerfen oder den Tastaturfokus zu stören.
- **Leitstand-Einsatz:** Ermöglicht den vollautomatischen Betrieb als permanenter Alarm- und Störungsmonitor auf Großbildschirmen.

### Dreistufige Informationsdichte (`displayDensity`)
- **Kompakt (`compact`):**
  - Minimale Zeilenhöhe, komprimierte Paddings.
  - Maximale Übersicht bei vielen parallelen Störungen für Disponenten und Leitstände.
- **Standard (`standard`):**
  - Ausgewogene Typografie und Abstände für den klassischen Desktop- und Büro-Arbeitsplatz.
- **Detailliert (`detailed`):**
  - Großzügige Zeilenabstände, vergrößerte Touch-Targets (mindestens `44px` gemäß Industrie-Designrichtlinie).
  - Zusätzliche Kontextzeilen (Standort, Baugruppe, Schadensursache).
  - Optimiert für Servicetechniker und Meister mit Schutzhandschuhen an mobilen Industrie-Tablets.

---

## 5. Offline-First & SAP PM Synchronisation

1. **Lokale Replikation (Dexie.js / IndexedDB):** Jeder erfasste Auftrag wird sofort lokal im Browser gecacht (`localDb.orders`), sodass Störungen auch bei vollständigem Netzwerkausfall in Ex-Zonen oder Kellerebenen erfasst werden können.
2. **Idempotente Mutations-Queue:** Offline erstellte Störungen erhalten eine eindeutige UUID (`clientMutationId`) und werden bei Wiederverbindung über `/api/sync` verlustfrei mit der PostgreSQL-Datenbank abgeglichen.
3. **SAP PM Middleware:** Bei aktiver SAP-Anbindung generiert das System asynchron eine SAP-Instandhaltungsmeldung (`sapNotificationNr`) bzw. puffert den Aufruf bei SAP-Ausfall in der resilienten `sap_sync_queue`.

---

## 6. Navigation, Detailmasken-Standards & Querverbindungen

Gemäß den **Design- & Navigationsrichtlinien** (`docs/design-rules.md`) sind alle Detailmasken mit einheitlichen Absprüngen und standardisierten Zurück-Buttons ausgestattet:

- **Conversational Workspace (`/`):** Omni-Bar für Schnellabfragen, Spracheingabe und direkte Störungserfassung.
- **Erfassungsmaske (`/orders/new`):**
  - Vorbefüllung aus dem Störungs-Entwurf per Deep-Link (`/orders/new?title=...&priority=...`).
  - **Standardisierter Zurück-Button:** Links oben im Header verankert mit Lucide-Icon `ArrowLeft` (`<ArrowLeft className="w-3.5 h-3.5" />`) und mindestens **44px Touch-Höhe** (`Zurück zum Planungsboard` ➔ `/planning`).
- **Auftragsdetailmaske (`/orders/[id]`):**
  - Direkter Absprung aus Auftragslisten und Tabellen über die Schaltfläche **[Öffnen]**.
  - **Standardisierter Zurück-Button:** Integriert in die Breadcrumb-Leiste mit Lucide-Icon `ArrowLeft` und mindestens **44px Touch-Höhe** (`Zurück zur Auftragsliste` ➔ `/orders`), gefolgt von der Auftragsnummer (z. B. `/ MO-2026-00104`).
- **Gantt-Planungsboard (`/planning`):**
  - Header-Button **[+ Neue Störung melden]** springt nach `/orders/new`.
  - Detail-Modal eines Auftrags bietet den Schnellabsprung **[Vollständigen Auftrag öffnen]** nach `/orders/[id]`.

