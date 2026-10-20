# 📶 5. Offline-First & Mobile Synchronisation

Pfad im Header: Sync-Status-Badge (Oben rechts in der Navigation)

## Konzept
Volle Arbeitsfähigkeit auch in funkisolierten Produktionsbereichen (Keller, Schaltschränke, Hallen ohne WLAN).

---

## 1. Lokale Speicherung (IndexedDB via Dexie.js)
Beim Öffnen der PWA synchronisiert das Endgerät automatisch:
- Zugewiesene Instandhaltungsaufträge
- Relevante Equipment-Stammdaten
- Prüfprotokoll-Vorlagen
- Lokale Ersatzteil-Kataloge

---

## 2. Die lokale Mutations-Outbox
Befindet sich das Gerät im **Offline-Modus** (`navigator.onLine === false`):
- Können Aufträge weiterhin erstellt, bearbeitet, mit Fotos und Unterschriften versehen werden.
- Ersatzteile können aus dem lokalen Bestand entnommen werden.
- Jede Aktion wird mit einer eindeutigen clientseitigen Idempotency-UUID in die Tabelle `mutationOutbox` abgelegt.

---

## 3. Automatischer Hintergrund-Sync
Sobald wieder eine Netzwerkverbindung erkannt wird:
1. Der Navigations-Indikator wechselt auf **"Synchronisiere..."**.
2. Die Queue wird streng chronologisch an `/api/sync` übertragen.
3. Idempotente Endpunkte verhindern doppelte Buchungen oder Statuskonflikte.
4. Bei aktivem SAP-Modus werden nachgelagerte SAP-Warenbewegungen und TABG-Abschlüsse getriggert.
