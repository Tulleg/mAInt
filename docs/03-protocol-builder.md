# 📋 3. Visueller Prüfprotokoll-Vorlagen-Editor

Pfad in der Anwendung: `WARTUNG & PRÜFUNGEN > Protokoll-Vorlagen` (`/inspections`)

## Konzept
Papierlose, rechtssichere Checklisten mit strukturierter Datenerfassung im JSON-Format (`InspectionTemplateSchema`).

---

## 1. Unterstützte Feldtypen

| Typ | Symbol | Beschreibung & Konfiguration |
|---|---|---|
| **Numerischer Messwert** | `#` | Erfasst Prozessparameter (Druck, Temperatur, Vibration). Unterstützt: Sollwert, Einheit (`bar`, `°C`, `mm/s`), Min/Max-Grenzwerte. |
| **i.O. / n.i.O. Switch** | `☑` | Schnellauswahl für optische und funktionale Zustände (Grün: *in Ordnung*, Rot: *mangelhaft*). |
| **Dropdown (Auswahl)** | `☰` | Vordefinierte Werte (z. B. Zustandsklassen "Sehr gut", "Lesbar", "Defekt"). |
| **Freitext** | `📄` | Für individuelle Feststellungen und detaillierte Befunde. |
| **Pflichtfoto** | `📷` | Startet am mobilen Endgerät die Kamera zur Beweissicherung. Wird offline in IndexedDB zwischengespeichert. |
| **Digitale Unterschrift** | `✒` | HTML5-Canvas zur Erfassung der Handunterschrift per Stift oder Finger. |

---

## 2. Automatischer Folgestörungs-Trigger (`triggerDefectOnFail`)

Wird an einem Messwert- oder Prüffeld die Option **"Auto-Störungsauftrag erzeugen"** aktiviert, überwacht das System die Eingaben des Technikers in Echtzeit:
- Liegt ein Messwert außerhalb des definierten Min/Max-Fensters (z. B. Lagertemperatur 92 °C bei max. 85 °C), färbt sich das Eingabefeld rot.
- Beim Einreichen des Protokolls erzeugt MaintAI im Hintergrund automatisch einen neuen Reparaturauftrag der Priorität **Hoch (`2_HIGH`)** am selben Equipment.

---

## 3. Simulator-Vorschau (Mobile vs. Desktop)
Über die obere Umschaltleiste kann der Formular-Designer direkt in den **Live-Simulator** wechseln:
- **Mobile Client (PWA):** Simuliert ein Smartphone/Tablet mit Canvas-Touch-Unterschrift.
- **Desktop:** Standard-Formularansicht für Leitstand- und Werkstatt-Terminals.

---

## 4. Navigationsstandards & Absprünge

Gemäß den **Design- & Navigationsrichtlinien** (`docs/design-rules.md`):
- **Menü-Verankerung:** Unter `WARTUNG > Protokoll-Vorlagen` (`/inspections`) sowie aus dem Wartungs-Hub (`/maintenance`).
- **Verknüpfung mit Aufträgen:**
  - In der Auftragsdetailmaske (`/orders/[id]`) verweist die Sektion *Prüfprotokoll* direkt auf die zugewiesene Vorlage.
  - Der Techniker füllt die Checkliste digital aus und springt nach Fertigstellung über den standardisierten **`ArrowLeft`**-Button (mindestens **44px** Touch-Höhe) fehlklickfrei zurück zur Auftragsbearbeitung (`/orders/[id]`).
- **Editor-Rücksprung:**
  - Innerhalb des Vorlagen-Designers führt der Zurück-Button links oben mit Lucide-Icon `ArrowLeft` verlässlich zurück zur Vorlagenübersicht (`/inspections`) bzw. zum Wartungs-Hub (`/maintenance`).
