#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# use-db.sh — switch the Prisma datasource provider.
#
#   ./scripts/use-db.sh sqlite     # local dev (default, prisma/dev.db)
#   ./scripts/use-db.sh postgres   # production / staging
#
# Prisma bakes the provider into the generated client, so switching requires
# a provider swap + `prisma generate`. The committed schema.prisma stays on
# sqlite by default (developer machines); production deploys run this script
# (or set the provider in CI) with DATABASE_URL pointing at Postgres.
#
# IMPORTANT: prisma/postgres-baseline.sql must be regenerated whenever the
# schema changes AND the provider is currently postgres (migrate diff emits
# the DATASOURCE's dialect):
#   ./scripts/use-db.sh postgres
#   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
#     --script > prisma/postgres-baseline.sql
#   ./scripts/use-db.sh sqlite
#
# Postgres bootstrap:
#   1. createdb pulse
#   2. DATABASE_URL=postgres://... npx prisma db execute --file prisma/postgres-baseline.sql
#      (or `./scripts/copy-sqlite-to-pg.py` to migrate an existing dev DB's
#       schema + data in one step)
#   3. ./scripts/use-db.sh postgres && npm run generate
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
case "$MODE" in
  sqlite)
    sed -i.bak 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
    ;;
  postgres)
    sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
    ;;
  *)
    echo "usage: $0 sqlite|postgres" >&2
    exit 1
    ;;
esac
rm -f prisma/schema.prisma.bak
echo "provider swapped"
npx prisma generate
