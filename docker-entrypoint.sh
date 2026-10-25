#!/bin/sh
set -e

# Run database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "🚀 [MaintAI] Checking and running database migrations..."
  node ./scripts/migrate.js || {
    echo "⚠️ [MaintAI] Migration warning (app will continue booting): check logs above"
  }
fi

exec "$@"
