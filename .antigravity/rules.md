# Projekt-Konventionen: MaintAI (CMMS & SAP Middleware)

1. **Single Source of Truth (DB)**: `src/db/schema.ts` ist das verbindliche Datenbankschema.
2. **Single Source of Truth (Actions)**: Alle Next.js Server Actions liegen zentral in `src/actions/`.
3. **Design-System & Theme-Vorgaben**:
   - Standard-Theme: **Modern Industrial Light Theme** (Canvas: `bg-slate-50`, Panels/Cards: `bg-white` mit `border-slate-200`, Akzent: `bg-blue-600`).
   - Alle Komponenten in `src/components/` und `src/app/` müssen `docs/design-rules.md` und `docs/09-ui-layout-concept.md` folgen.
   - Touch-Targets: Mindestens `min-h-[44px]` für Buttons und Inputs. Icons ausschließlich aus `lucide-react`.
4. **FigCraft MCP Integration**:
   - Nutze bei UI-Aufgaben den MCP-Server `figcraft` (via `figcraft-cli mcp`), um Vektor-Frames zu prüfen, Mockup-Screenshots zu ziehen oder Layout-Maße auszulesen.
5. **Verbindliche Dokumentations-Pflicht**:
   - Funktionale Änderungen an UI, Rollen oder Workflows müssen parallel in `docs/` nachgeführt werden.
   - Schema- und Backend-Änderungen müssen in `docs/software-architecture.md` (inkl. ERD und ADRs) dokumentiert werden.
6. **Strikte Dateigrenzen für parallele Agenten**:
   - Agent 1 (DB & Seed): `src/db/`, `drizzle.config.ts`, `docker-compose.yml`, `package.json`, `tests/`
   - Agent 2 (Backend, RBAC & SAP): `src/actions/`, `src/lib/workflow-engine.ts`, `src/lib/rbac/`, `src/lib/sap/`
   - Agent 3 (Frontend, UI & PWA): `src/app/(dashboard)/`, `src/components/`, `src/lib/offline/`
   - Agent 4 (AI & Analytics): `src/lib/ai/`, `src/app/api/ai/`, `src/components/analytics/`
   - Agent 5 (Docs & Compliance): `docs/`, `README.md`
7. **Verifikation**: Nach jeder Aufgabe müssen `npx tsc --noEmit` und `npx vitest run` fehlerfrei durchlaufen.
8. **Git Commit:** Committe deine Änderungen mit aussagekräftigen Beschreibeungen

# Strikte Git-Commit-Pflicht für alle Agenten:
- Sobald deine Änderungen implementiert sind und `npx tsc --noEmit` fehlerfrei durchläuft, MUSST du deine Arbeit unaufgefordert per Git committen.
- Führe dafür direkt im Terminal aus:
  1. `git status`
  2. `git add <nur geänderte/erstellte Dateien deiner Domäne>`
  3. `git commit -m "<agent-kürzel>: <präzise beschreibung der änderung>"`
- Beende eine Aufgabe niemals mit ungespeicherten oder uncommitted Git-Diffs.
