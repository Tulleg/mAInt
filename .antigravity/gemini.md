# 📜 Strikte Entwicklungs- und Dokumentationsrichtlinien

Ihr müsst diese Regeln bei JEDER Code-Änderung oder Implementierung einer neuen Funktion ohne Ausnahme befolgen:

## 1. 🧪 Testgetriebene Entwicklung (TDD-Pflicht)
* **Regel:** Sobald eine neue Funktion, Methode oder API-Endpunkt erstellt oder modifiziert wird, MÜSSEN im selben Arbeitsschritt die passenden Testfälle (Unit Tests / Integration Tests) geschrieben oder aktualisiert werden.
* **Aktion:** Nutze das Test-Framework des Projekts. Ein Feature-Commit ohne korrespondierende Testdatei ist ungültig.

## 2. 📝 Parallele Benutzerdokumentation (User Docs)
* **Regel:** Jede funktionale Änderung oder neue Funktion erfordert die parallele Aktualisierung oder Neuerstellung der Anwenderdokumentation im Ordner `/docs`.
* **Stil:** Die Dokumentation muss in verständlicher, klarer Sprache geschrieben sein und direkt die neuen Parameter, UI-Elemente oder Workflows beschreiben.

## 3. 🛡️ Kontinuierliches Sicherheits-Audit
* **Regel:** Es darf kein Code vorgeschlagen werden, der typische Sicherheitslücken (z. B. OWASP Top 10) enthält. Jede Modifikation wird automatisch einer adversariellen Prüfung unterzogen.

## 4. 🏛️ Softwarearchitekturdokumentation (Architecture Docs)
* **Regel:** Sobald strukturelle, datenbankseitige, sicherheits- oder schnittstellentechnische Änderungen vorgenommen werden (z. B. Tabellen/Enums in `src/db/schema.ts`, neue Subsysteme/Services in `src/lib/`, neue SAP-Adapter, API-Routen, Rollen/Guards oder Infrastrukturänderungen), MUSS das zentrale Softwarearchitekturdokument `docs/software-architecture.md` im selben Arbeitsschritt aktualisiert und nachgeführt werden.
