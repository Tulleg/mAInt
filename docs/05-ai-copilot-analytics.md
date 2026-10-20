# 🤖 4. KI-Leitstand, RAG-Copilot & Prompt-to-Chart

Pfad in der Anwendung: `Analytics > KI-Leitstand` (`/analytics`)

## Konzept
Kombination aus **Retrieval-Augmented Generation (RAG)** über PostgreSQL `pgvector`, **Predictive Maintenance** und einem **schreibgeschützten NL-to-SQL Agenten**.

---

## 1. Störungs-Copilot & Mitlernendes RAG
Beim Tippen einer Störungsmeldung analysiert das System den Text und bietet drei Soforthilfen:
1. **Duplikaterkennung:** Prüft offene Aufträge am selben Equipment auf inhaltliche Überschneidung und warnt vor Doppel-Meldungen.
2. **Historische Lösungen:** Durchsucht den Vektor-Index (`order_history_embeddings`) nach den 3 ähnlichsten erfolgreich behobenen Störungen inkl. damals verbauter Ersatzteile.
3. **Dokumentations-Entwurf:** Formuliert automatisch einen normgerechten, strukturierten Text mit Schadenscode-Vorschlag.

> **Kontinuierliches Lernen:** Sobald ein Techniker einen Auftrag abschließt (`TABG`), wird das Paar *(Symptom + Ursache + durchgeführte Lösung + Ersatzteile)* automatisch im HNSW-Index vektorisiert.

---

## 2. Predictive Maintenance
- **MTBF-Trend:** Berechnet die mittlere Betriebszeit zwischen zwei Ausfällen.
- **Intervall-Drift:** Verkürzen sich die Ausfallintervalle um mehr als 20 %, generiert das System eine priorisierte Warnung für den Wartungsplaner.

---

## 3. Prompt-to-Chart (Natürliche Sprache -> Diagramm)
Geben Sie beliebige Fragen in die Suchleiste ein, z. B.:
> *"Vergleiche die Stillstandszeiten und Anzahl der Aufträge nach Anlage im aktuellen Monat"*

- Der Agent generiert eine sichere PostgreSQL-Abfrage (strikt **Read-Only / SELECT**).
- Die Daten werden automatisch als passendes Diagramm (**Recharts**: Bar, Line, Pie) oder sortierbare Datentabelle gerendert.
- **Geplanter E-Mail-Report:** Über den Button *"Als E-Mail-Report planen"* kann die Abfrage als periodischer Cron-Job (z. B. montags 07:00 Uhr) hinterlegt werden.
