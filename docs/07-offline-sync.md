# 📶 7. Offline-First & Mobile Synchronisation

Pfad im Header: Sync-Status-Badge (Oben rechts im Header aller Masken)

## Konzept
Volle Arbeitsfähigkeit auch in funkisolierten Produktionsbereichen (Keller, Schaltschränke, Ex-Zonen, Hallen ohne WLAN).

---

## 1. Lokale Speicherung (IndexedDB via Dexie.js)
Beim Öffnen der PWA synchronisiert das Endgerät automatisch:
- Zugewiesene Instandhaltungsaufträge
- Relevante Equipment-Stammdaten und Technische Plätze
- Prüfprotokoll-Vorlagen (`inspection_templates`)
- Lokale Ersatzteil-Kataloge und Bestände

---

## 2. Die lokale Mutations-Outbox & Idempotenz-Garantie
Befindet sich das Gerät im **Offline-Modus** (`navigator.onLine === false`):
- Aufträge können weiterhin neu angelegt, editiert und mit Prüfprotokollen, Messwerten und Unterschriften versehen werden.
- Ersatzteile können aus dem lokalen Bestand abgebucht werden.
- Jede Aktion wird mit einer clientseitigen Idempotency-UUID in die Tabelle `mutationOutbox` abgelegt.

### Härtung & Idempotency-Schutz (Bugfix / Security)
- **Doppelbuchungs-Schutz:** Beim Abgleich mit `/api/sync` prüft das Backend anhand von `clientMutationId` (für Aufträge) und `clientBookingOfflineId` (für Ersatzteilbuchungen), ob die Mutation bereits verarbeitet wurde.
- **Transaktionssicherheit:** Selbst bei instabiler Funkverbindung mit wiederholten Sendeversuchen wird jede Materialentnahme exakt einmal verbucht.

---

## 3. Automatischer Hintergrund-Sync
Sobald wieder eine Netzwerkverbindung erkannt wird:
1. Der Navigations-Indikator wechselt auf **"Synchronisiere..."**.
2. Die Queue wird chronologisch an `/api/sync` übertragen.
3. Idempotente Endpunkte verhindern doppelte Buchungen oder Statuskonflikte.
4. Bei aktivem SAP-Modus werden nachgelagerte SAP-Warenbewegungen (Bewegungsart 261) und TABG-Abschlüsse zuverlässig getriggert.

---

## 4. Navigationsstandards im Offline-Modus

Gemäß den **Design- & Navigationsrichtlinien** (`docs/design-rules.md`):
- **Header-Status:** Der `OfflineSyncStatusIndicator` ist im Header verankert und signalisiert den aktuellen Verbindungsstatus (`Online`, `Offline`, `Synchronisiere...`).
- **Autonome Navigation:**
  - Sämtliche Detailmasken (`/orders/[id]`, `/orders/new`) bleiben auch ohne Internetverbindung vollständig navigierbar.
  - Der standardisierte Zurück-Button mit dem Lucide-Icon **`ArrowLeft`** und mindestens **44px Touch-Höhe** (`min-h-[44px]`) erlaubt jederzeit den reibungslosen Rücksprung zur Auftragsübersicht (`/orders`) oder zum Planungsboard (`/planning`).
