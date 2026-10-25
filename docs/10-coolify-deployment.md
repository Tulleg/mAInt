# Coolify Deployment Guide für MaintAI

Diese Anleitung beschreibt Schritt für Schritt, wie Sie **MaintAI** auf einer eigenen [Coolify](https://coolify.io/)-Instanz deployen.

---

## 1. Voraussetzungen

1. Eine laufende Coolify-Instanz (v4.x).
2. GitHub-Zugriff auf das Repository [`git@github.com:Tulleg/mAInt.git`](https://github.com/Tulleg/mAInt).
3. Mindestens 2 GB RAM auf dem Zielserver (für Next.js Build, PostgreSQL mit `pgvector` und Redis).

---

## 2. Empfohlene Bereitstellung: Docker Compose (All-in-One)

Die schnellste und sauberste Methode in Coolify ist der **Docker Compose** Modus. Hierbei werden die Web-App, PostgreSQL (inklusive `pgvector`) und Redis automatisch im gleichen internen Docker-Netzwerk gestartet.

### Schritt 2.1: Neue Ressource anlegen
1. Öffnen Sie Ihr Projekt / Environment in Coolify.
2. Klicken Sie auf **+ New Resource** → **Docker Compose**.
3. Wählen Sie als Quelle **GitHub / Git Repository**:
   - **Repository URL**: `git@github.com:Tulleg/mAInt.git` (oder via Coolify GitHub App / Token)
   - **Branch**: `main`
   - **Docker Compose Location**: `/docker-compose.yml`

### Schritt 2.2: Domains & SSL konfigurieren
1. In den Ressourceneinstellungen unter **Domains**:
   - Tragen Sie Ihre gewünschte Domain ein (z. B. `https://maintai.ihre-domain.de`).
   - Coolify leitet den Traffic automatisch an Port `3000` des `web`-Services weiter und erstellt ein Let's Encrypt SSL-Zertifikat.

### Schritt 2.3: Umgebungsvariablen definieren
Fügen Sie im Reiter **Environment Variables** folgende Variablen hinzu:

| Variable | Beschreibung | Beispielwert |
| :--- | :--- | :--- |
| `NODE_ENV` | Produktionsmodus | `production` |
| `POSTGRES_USER` | DB Benutzer | `postgres` |
| `POSTGRES_PASSWORD` | DB Kennwort | *Sicheres Passwort generieren* |
| `POSTGRES_DB` | DB Name | `maintai` |
| `AI_ENCRYPTION_KEY` | 32-Byte Secret für Token-Verschlüsselung | `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | Session Secret | `openssl rand -base64 32` |
| `GEMINI_API_KEY` | Google Gemini API Key für KI-Copilot | `AIzaSy...` |
| `AI_PROVIDER` | Bevorzugter Provider | `GEMINI` *(oder OPENAI, OLLAMA)* |
| `SAP_MODE` | SAP-Synchronisationsmodus | `STANDALONE` |

> [!NOTE]
> `DATABASE_URL` und `REDIS_URL` werden im `docker-compose.yml` automatisch anhand der Compose-Dienstnamen aufgelöst (`postgres:5432` und `redis:6379`).

### Schritt 2.4: Deploy ausführen
1. Klicken Sie oben rechts auf **Deploy**.
2. Coolify baut das Multi-Stage-Docker-Image, startet PostgreSQL + Redis, führt automatische DB-Migrationen aus und schaltet die Domain frei.

---

## 3. Alternative: Coolify Application (Dockerfile) + Managed DBs

Falls Sie Datenbanken lieber separat in Coolify verwalten möchten:

1. **PostgreSQL anlegen**:
   - In Coolify **+ New Resource** → **PostgreSQL** wählen.
   - **Wichtig**: MaintAI nutzt Vektorsuche (`pgvector`). Stellen Sie sicher, dass das Docker-Image `pgvector/pgvector:pg16` verwendet wird.
2. **Redis anlegen**:
   - **+ New Resource** → **Redis**.
3. **Application anlegen**:
   - **+ New Resource** → **Public/Private Repository** (`git@github.com:Tulleg/mAInt.git`).
   - **Build Pack**: `Dockerfile`.
   - **Port**: `3000`.
   - **Environment Variables**:
     - `DATABASE_URL`: Interne Verbindungs-URL der Coolify-Postgres-Instanz.
     - `REDIS_URL`: Interne Redis-URL.
     - `GEMINI_API_KEY`, `AI_ENCRYPTION_KEY`, etc.
4. **Deployen**.

---

## 4. Automatische Migrationen & Initial-Seed

- **Automatische Migration**: Der Container führt beim Booten via `docker-entrypoint.sh` und `scripts/migrate.js` automatisch `CREATE EXTENSION IF NOT EXISTS vector;` und alle anstehenden Drizzle-Schema-Migrationen aus.
- **Initial-Seed (Demodaten)**:
  Wenn Sie Beispieldaten (Mandant, Equipments, Wartungspläne) in die neue Instanz einspielen möchten:
  1. Öffnen Sie in Coolify das Terminal des `web`-Containers (Execute Command).
  2. Führen Sie aus:
     ```bash
     node -e "require('./src/db/seed.ts')" # bzw. npx tsx src/db/seed.ts
     ```

---

## 5. Automatisches Deployment bei Git Push (CI/CD)

1. Öffnen Sie in Coolify die Webhooks-Einstellungen Ihrer Ressource.
2. Kopieren Sie die **Deploy Webhook URL**.
3. Gehen Sie auf GitHub zu Ihrem Repository `Tulleg/mAInt` → **Settings** → **Webhooks** → **Add webhook**.
4. Fügen Sie die URL ein. Bei jedem `git push origin main` rollt Coolify die neueste Version automatisch ohne Ausfallzeit aus.
