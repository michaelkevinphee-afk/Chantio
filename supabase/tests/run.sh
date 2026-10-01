#!/usr/bin/env bash
# Teste la base de données sur un PostgreSQL local (aucun compte Supabase requis).
# Chaque fichier de test part d'une base neuve (migrations + données d'exemple).
# Usage : PGHOST=... PGPORT=... PGUSER=postgres bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="chantio_test_$$"
trap 'dropdb --if-exists "$BASE"' EXIT
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$BASE")
for t in tests/test_*.sql; do
  echo "→ $(basename "$t")"
  dropdb --if-exists "$BASE"
  createdb "$BASE"
  "${PSQL[@]}" -f tests/supabase-simule.sql
  for f in migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
  "${PSQL[@]}" -f seed.sql
  "${PSQL[@]}" -f "$t"
done
echo "Base de données : tous les tests passent."
