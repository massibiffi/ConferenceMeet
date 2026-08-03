#!/usr/bin/env bash
#
# Run the pgTAP RLS tests against a throwaway Postgres container.
# Requires Docker running. This is the "no Supabase CLI needed" path; if you have
# the Supabase CLI, `supabase test db` is the more idiomatic runner.
#
#   ./supabase/tests/local/run.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA="$HERE/../../schema.sql"
TEST="$HERE/../rls_test.sql"
C=cm_pg_test

docker rm -f "$C" >/dev/null 2>&1 || true
echo ">> starting postgres:16"
docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app postgres:16 >/dev/null

echo ">> waiting for readiness"
for _ in $(seq 1 60); do
  docker exec "$C" pg_isready -U postgres -d app >/dev/null 2>&1 && break
  sleep 1
done

echo ">> installing pgTAP"
docker exec "$C" bash -c "apt-get update -qq && apt-get install -y -qq postgresql-16-pgtap" >/dev/null

echo ">> copying sql"
docker cp "$HERE/shims.sql"  "$C:/shims.sql"
docker cp "$SCHEMA"          "$C:/schema.sql"
docker cp "$HERE/grants.sql" "$C:/grants.sql"
docker cp "$TEST"            "$C:/rls_test.sql"

echo ">> applying shims + schema + grants"
docker exec "$C" psql -U postgres -d app -v ON_ERROR_STOP=1 -q -f /shims.sql
docker exec "$C" psql -U postgres -d app -v ON_ERROR_STOP=1 -q -f /schema.sql
docker exec "$C" psql -U postgres -d app -v ON_ERROR_STOP=1 -q -f /grants.sql

echo ">> running RLS tests"
docker exec "$C" psql -U postgres -d app -f /rls_test.sql

echo ">> cleaning up"
docker rm -f "$C" >/dev/null 2>&1 || true
