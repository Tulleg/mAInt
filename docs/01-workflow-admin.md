# ⚙️ 1. Workflow- & Auftragsarten-Konfiguration (Admin)

Pfad in der Anwendung: `Administration > Workflows & Auftragsarten` (`/admin/workflows`)

## Ziel & Konzept
In **MaintAI** sind Auftragsarten, Status und Statusübergänge nicht im Quellcode fest verdrahtet. Jeder Mandant kann eigene Betriebs- und Freigabeprozesse abbilden, ohne dass ein System-Update oder Neustart erforderlich ist.

---

## 1. Auftragsarten verwalten
Über den Button **"Neue Auftragsart anlegen"** können Administratoren neue Kategorien definieren:
- **Kürzel (Code)**: z. B. `IH01` (Korrektiv), `IH02` (Präventiv), `IH03` (Kalibrierung), `IH04` (UVV-Prüfung).
- **Bezeichnung**: Aussagekräftiger Name für den Techniker vor Ort.
- **SAP AUART (optional)**: Zuordnung zur SAP-Auftragsart (z. B. `PM01`, `PM02`, `PM03`).
- **Farbe & Icon**: Zur visuellen Kennzeichnung im Gantt-Board und in den Auftragslisten.

> **Automatisches Seeding:** Beim Anlegen einer neuen Auftragsart erzeugt das System automatisch einen Standard-Pfad:
> `Erfasst (Meldung) -> Freigegeben -> In Arbeit -> Technisch Abgeschlossen (TABG) -> Kaufmännisch Abgeschlossen`.

---

## 2. Die interaktive Workflow-Matrix

Die Kreuztabelle zeigt in den Zeilen den **Ausgangs-Status (Von)** und in den Spalten den **Ziel-Status (Nach)**.

### Rollen-Zuweisung pro Übergang
In jeder Tabellenzelle kann über das Dropdown-Menü gesteuert werden:
- ❌ **Deaktiviert**: Dieser Übergang ist für die gewählte Auftragsart unzulässig.
- 🌐 **Jeder Mitarbeiter**: Jeder authentifizierte Benutzer mit Auftragszugriff darf diesen Status setzen.
- 🔒 **Rollen-Restriktion**: Nur Benutzer, die über die ausgewählte Rolle verfügen (z. B. `Instandhaltungsplaner`), dürfen den Button im UI betätigen.

### Guard-Conditions (Bedingte Übergänge)
Für sicherheitskritische Übergänge (z. B. *Technisch Abschließen*) greifen automatische Schutzregeln:
1. **Checkliste / Prüfprotokoll Pflicht:** Der Übergang wird verweigert, falls dem Auftrag ein Prüfprotokoll zugeordnet ist, dieses aber noch nicht vollständig ausgefüllt oder digital signiert wurde.
2. **Ursachen-Pflicht (Root Cause):** Erzwingt die Erfassung eines Fehler- und Schadenscodes vor dem Abschluss.
3. **Ist-Zeiterfassung:** Blockiert den Abschluss ohne Eingabe der geleisteten Arbeitsminuten.
4. **SAP-Sync-Trigger:** Löst beim Erreichen des Zielstatus (z. B. `TABG`) automatisiert die OData-Meldung an SAP aus.
