# 📅 3. Zyklische Wartungspläne & Batch-Pflege

Pfad in der Anwendung: `Wartung > Wartungspläne & Batch-Grid` (`/maintenance-plans`)

## Konzept
Verwaltung hunderter wiederkehrender Prüfpositionen (`maintenance_plan_items`) in einer hochperformanten TanStack-Data-Grid-Oberfläche.

---

## 1. Inline-Editing im Grid
Wartungsplaner müssen keine zeitraubenden Detaildialoge öffnen:
- **Tastatur-Navigation:** Direkte Eingabe von Positionstiteln und Sollzeiten in die Tabellenzelle. Ein Klick außerhalb (`onBlur`) oder `Enter` speichert den Wert automatisch per Server Action.
- **Direkt-Dropdowns:** Schnelle Zuordnung von **Equipment**, **zuständiger Techniker-Rolle** und verknüpfter **Prüfprotokoll-Vorlage** direkt in der jeweiligen Zelle mit sofortiger optimistischer UI-Rückmeldung.

---

## 2. Sticky Bulk-Action-Bar (Massenänderungen)

Sobald eine oder mehrere Zeilen über die linken Checkboxen ausgewählt werden (oder alle über den Tabellenkopf), schiebt sich am oberen Rand die **Bulk-Action-Bar** ein:

### Durchführbare Massenoperationen:
1. **Prüfintervall simultan anpassen:**
   - Ändert das Zyklus-Intervall für alle markierten Positionen (z. B. von `30 DAYS` auf `90 DAYS` oder `500 OPERATING_HOURS`).
   - Aktualisiert die übergeordneten Wartungspläne automatisch in der Datenbank.
2. **Fachrolle gebündelt zuweisen:**
   - Übergibt alle markierten Positionen auf Knopfdruck an eine Fachgruppe (z. B. "Mechanik-Schlosser").
3. **Protokoll-Vorlage verknüpfen:**
   - Weist allen Positionen eine standardisierte Prüfcheckliste zu.
