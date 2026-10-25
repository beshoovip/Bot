#!/usr/bin/env bash
# يطبّق الترحيلات والبذور على قاعدة مؤقتة ويشغّل tests/db/economy.sql. يتطلب psql وخادم PostgreSQL.
# المتغيرات: PGHOST/PGUSER/PGPASSWORD/PGPORT كالمعتاد، أو DATABASE_ADMIN_URL. يعمل كـ postgres محليًا إن كنت root.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="caravan_test_$$"
if [ "$(id -u)" = "0" ] && [ -z "${PGHOST:-}" ]; then RUN() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 $*"; }; ROOT="$PWD"
else RUN() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }; ROOT="$PWD"; fi
RUN "-d postgres -c 'CREATE DATABASE $DB'"
trap 'RUN "-d postgres -c \"DROP DATABASE IF EXISTS $DB\"" >/dev/null 2>&1 || true' EXIT
for f in database/migrations/*.sql database/seeds/*.sql tests/db/economy.sql; do
  echo "== $f"; RUN "-d $DB -f $ROOT/$f"
done
echo "DB TESTS PASSED"
