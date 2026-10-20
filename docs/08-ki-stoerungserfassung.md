# 08 - KI-gestützte Störungserfassung & Auftragsanlage

In MaintAI können Instandhaltungsmaßnahmen und Störungsmeldungen über eine moderne, zweigleisige Erfassungsmaske unter `/orders/new` angelegt werden.

---

## 1. Dual-Mode Architektur

Die Erfassungsmaske bietet zwei komplementäre Arbeitsmodi:

### Modus A: 🤖 KI-Prompt-Modus (Sprach- & Freitext-Erfassung)
Für Werker, Meister und Schichtführer direkt an der Linie:
- **Freitext / Spracheingabe:** Eingabe natürlicher Sprache (z. B. *„Kreiselpumpe KSB in Halle 2 verliert massiv Druck, Motorblock ist heiß und vibriert. Linie steht still!“*).
- **Automatisches LLM-Parsing:** Extrahiert strukturiert:
  - Normgerechten Auftragstitel
  - Ausführliche technische Problembeschreibung
  - Equipment-Zuordnung (Abgleich gegen vorhandene Anlagen)
  - Priorität (`1_EMERGENCY`, `2_HIGH`, `3_MEDIUM`, `4_LOW`)
  - SAP-Schadenscode (z. B. `MECH_LAGER`, `HYDR_LECK`)
  - Geschätzte Arbeitsdauer
- **Interaktive KI-Rückfragen (Clarification Loop):** Erkennt die KI unvollständige oder mehrdeutige Angaben (z. B. unklares Aggregat, fehlende Stillstandsinformation), stellt sie gezielte Rückfragen mit 1-Klick-Antwortbuttons direkt in der Maske.
- **Nahtlose Übernahme:** Der aufbereitete Entwurf kann direkt mit einem Klick verbindlich angelegt oder im manuellen Formular feingeschliffen werden.

### Modus B: 📝 Manuelles Formular mit integriertem Copilot
Für klassische Arbeitsvorbereitung und Disponenten:
- Direkte Eingabe von Titel, Equipment, Priorität, Schadensgruppe, Ausführungsdatum und Stillstandszeiten.
- **Integrierter MaintAI Copilot (RAG & PgVector):**
  - **Duplikaterkennung:** Gleicht die Störung in Echtzeit mit offenen Aufträgen ab, um Doppeldispositionen zu vermeiden.
  - **Lösungs- & Ersatzteilvorschläge:** Ermittelt über historische Vektor-Ähnlichkeitssuche bewährte Reparaturmaßnahmen und listet benötigte Ersatzteile samt SAP-Materialnummern.

---

## 2. Offline-First & SAP PM Synchronisation

1. **Dexie.js IndexedDB:** Jeder erfasste Auftrag wird lokal im Browser gecacht (`localDb.orders`).
2. **Idempotente Mutation-Queue:** Offline erstellte Aufträge erhalten eine UUID (`clientMutationId`) und werden bei Wiederverbindung über `/api/sync` mit PostgreSQL synchronisiert.
3. **SAP PM Middleware:** Bei aktiver SAP-Anbindung stößt das System asynchron die Anlage einer SAP-Instandhaltungsmeldung (`sapNotificationNr`) an.

---

## 3. Navigation & Verknüpfung

- **Leitstand-Dashboard:** Schnellstart-Kachel und Direkt-Button `+ Störung melden` auf der Startseite (`/`).
- **Gantt-Planungsboard:** Direkt-Button `+ Neue Störung melden` in der Steuerleiste von `/planning`.
- Nach dem Anlegen führt ein Schnelllink direkt in die Einsatzdisposition des Gantt-Boards.
