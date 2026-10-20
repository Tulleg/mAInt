# 📖 MaintAI – Benutzer- & Administratorhandbuch

Willkommen im zentralen Anwender- und Betriebshandbuch für **MaintAI**, der industriellen Instandhaltungsplattform (CMMS & SAP PM Middleware).

---

## 📑 Inhaltsübersicht

1. [Systemübersicht & Erste Schritte](#1-systemübersicht--erste-schritte)
2. [Workflow- & Auftragsarten-Konfiguration (Admin)](./01-workflow-admin.md)
   - Anlegen von Auftragsarten (IH01, IH02 etc.)
   - Visuelle Berechtigungs-Matrix (Rollen vs. Statuswechsel)
   - Guards & Prüfbedingungen (Pflichtprotokoll, Ist-Zeiten, SAP-Sync)
3. [SAP-Integration: Standalone vs. Enterprise-Sync](./02-sap-integration.md)
   - Umschaltung der Betriebsmodi (Standalone, OData v4, BAPI)
   - Materialbuchungen (Bewegungsart 261) & Failover in die `sap_sync_queue`
   - Anlagenabgleich aus SAP PM
4. [Visueller Prüfprotokoll-Vorlagen-Editor](./03-protocol-builder.md)
   - Designer für Inspektionschecklisten (JSON-Schema)
   - Messwerterfassung mit Min/Max-Toleranzen & Auto-Störungs-Trigger
   - Pflichtfotos und digitale Handunterschrift (Canvas)
   - Vorschau-Simulator (Mobile PWA vs. Desktop)
5. [Zyklische Wartungspläne & Batch-Pflege](./04-maintenance-plans-batch.md)
   - Zeit- und betriebsstundenbasierte Wartungszyklen
   - TanStack Data-Grid mit Inline-Editing per Tastatur
   - Sticky Bulk-Action-Bar für 50+ Positionen simultan
6. [KI-Leitstand, RAG-Copilot & Prompt-to-Chart](./05-ai-copilot-analytics.md)
   - Störungs-Copilot mit Duplikaterkennung & mitlernendem `pgvector`-Gedächtnis
   - Predictive Maintenance Analyzer (MTBF & Intervall-Drift-Warnungen)
   - Prompt-to-Chart: Natürlichsprachliche Abfragen in schreibgeschütztes SQL
   - Automatisierte E-Mail-Berichte (Cron-Scheduler)
7. [Grafisches Gantt-Planungsboard & Leitstand](./06-gantt-planning.md)
   - Ressourcen-Disposition nach Techniker & Qualifikationsmatrix
   - Drag-&-Drop, Einsatzdauer-Resize und Überbuchungswarnungen
   - Materialkonflikt-Erkennung (SAP-Bestände)
8. [Offline-First & Mobile Synchronisation](./07-offline-sync.md)
   - Arbeiten ohne Netzwerk (Dexie.js / IndexedDB)
   - Lokale Mutations-Outbox & automatische Hintergrund-Synchronisation
   - Visueller Statusindikator in der Navigation

---

## 1. Systemübersicht & Erste Schritte

MaintAI wurde speziell für anspruchsvolle Produktionsumgebungen entwickelt, in denen Werkstatt- und Leitstand-Mitarbeiter sowohl an High-End-Arbeitsplätzen als auch mit mobilen Tablets in funkisolierten Hallenbereichen (Ex-Zonen, Kellerebenen) zuverlässig arbeiten müssen.

### Authentifizierung & Rollen
Der Zugriff erfolgt rollenbasiert (RBAC). Standardmäßig unterscheidet das System folgende Hauptrollen:
- **Instandhaltungsplaner / Meister (`MAINT_PLANNER`)**: Volle Berechtigung zur Terminierung, Budgetfreigabe und kaufmännischen Auftragsabnahme.
- **Servicetechniker / Facharbeiter (`TECHNICIAN`)**: Führt Reparaturen durch, erfasst Messwerte, bucht Ersatzteile aus dem Lager und schließt Aufträge technisch ab (`TABG`).
- **Fremdfirmen-Monteur (`EXTERNAL_CONTRACTOR`)**: Eingeschränkte Sicht auf explizit zugewiesene Gewerke.
