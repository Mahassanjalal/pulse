#!/usr/bin/env python3
"""
copy-sqlite-to-pg.py — one-shot migration of a SQLite dev database into
Postgres (schema + data), preserving ids and timestamps.

Usage:
    pip install "psycopg[binary]"
    DATABASE_URL=postgres://user:pass@host:5432/pulse \
        ./scripts/copy-sqlite-to-pg.py [--sqlite prisma/dev.db] [--schema-only]

Prisma cannot migrate between providers (SQLite -> Postgres) directly —
the SQL dialects differ. This script:
  1. applies prisma/postgres-baseline.sql (the PG schema generated from the
     same Prisma schema), and
  2. copies every table's rows with explicit column lists, converting
     SQLite's integer epoch datetimes into real timestamps.

Ordering follows Prisma's declared relations (children after parents).
Re-runs are safe: schema is reset first, inserts use ON CONFLICT DO NOTHING.
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime, timezone

try:
    import psycopg
except ImportError:
    sys.exit('psycopg not installed — run: pip install "psycopg[binary]"')

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)

# Parent-before-child order (FK targets first).
TABLE_ORDER = [
    "User",
    "PrivacySettings",
    "UserPreferences",
    "RefreshToken",
    "Match",
    "Message",
    "Friend",
    "FriendRequest",
    "Notification",
    "BlockedUser",
    "Report",
    "Subscription",
    "LoginHistory",
    "ProfileView",
    "UserAchievement",
    "OtpCode",
    "ResetToken",
    "CoinTransaction",
    "PaymentEvent",
]


def to_py(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default=os.path.join(BACKEND, "prisma", "dev.db"))
    ap.add_argument("--schema-only", action="store_true")
    args = ap.parse_args()

    pg_url = os.environ.get("DATABASE_URL")
    if not pg_url or not pg_url.startswith(("postgres://", "postgresql://")):
        sys.exit("DATABASE_URL must point at a postgres:// instance")

    baseline = os.path.join(BACKEND, "prisma", "postgres-baseline.sql")
    if not os.path.exists(baseline):
        sys.exit("prisma/postgres-baseline.sql missing — generate it with:\n"
                 "  npx prisma migrate diff --from-empty "
                 "--to-schema-datamodel prisma/schema.prisma --script "
                 "> prisma/postgres-baseline.sql")

    src = sqlite3.connect(args.sqlite)
    src.row_factory = sqlite3.Row
    total = 0

    with psycopg.connect(pg_url) as pg, pg.cursor() as cur:
        print("[1/3] applying PG baseline schema ({})".format(os.path.basename(baseline)))
        # Idempotent: reset public schema so re-runs start clean.
        cur.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
        cur.execute(open(baseline).read())

        # Discover timestamp columns so SQLite's integer epoch values can be
        # converted per-column instead of hardcoding table knowledge.
        cur.execute(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'"
        )
        ts_cols = {(t, c) for t, c in cur.fetchall()}

        # Discover boolean columns so SQLite's 0/1 integers are cast properly.
        cur.execute(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND data_type = 'boolean'"
        )
        bool_cols = {(t, c) for t, c in cur.fetchall()}

        if args.schema_only:
            pg.commit()
            print("schema-only: done")
            return 0

        def convert(table, col, v):
            if v is None:
                return None
            if (table, col) in bool_cols:
                return bool(v)
            if (table, col) in ts_cols:
                if isinstance(v, (int, float)):
                    # Heuristic: > 1e12 is milliseconds, else seconds.
                    return datetime.fromtimestamp(
                        v / 1000 if v > 1e12 else v, tz=timezone.utc
                    )
                if isinstance(v, str):
                    try:
                        return datetime.fromisoformat(v)
                    except ValueError:
                        return v
            return v

        print("[2/3] copying rows (FK order)")
        for table in TABLE_ORDER:
            try:
                rows = src.execute('SELECT * FROM "{}"'.format(table)).fetchall()
            except sqlite3.OperationalError:
                print("  {}: skipped (absent in SQLite)".format(table))
                continue
            if not rows:
                print("  {}: 0 rows".format(table))
                continue
            cols = list(rows[0].keys())
            col_sql = ", ".join('"{}"'.format(c) for c in cols)
            placeholders = ", ".join(["%s"] * len(cols))
            sql = ('INSERT INTO "{t}" ({c}) VALUES ({p}) ON CONFLICT DO NOTHING'
                   .format(t=table, c=col_sql, p=placeholders))
            for row in rows:
                values = [convert(table, c, to_py(row[c])) for c in cols]
                cur.execute(sql, values)
            total += len(rows)
            print("  {}: {} rows".format(table, len(rows)))

        print("[3/3] committing")
        pg.commit()

    print("done — {} rows copied into Postgres".format(total))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
