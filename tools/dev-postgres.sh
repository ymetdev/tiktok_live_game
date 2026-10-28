#!/bin/bash
# Throwaway local Postgres for tests/dev (needs the Debian/Ubuntu postgresql-16 binaries). Usage: tools/dev-postgres.sh [start|stop]
# Prints the connection string to export as TEST_DATABASE_URL / DATABASE_URL.
BIN=/usr/lib/postgresql/16/bin; DIR=${PGDIR:-/tmp/redblue-pg}; PORT=${PGPORT:-5545}
case "${1:-start}" in
  start)
    if [ ! -d "$DIR/data" ]; then mkdir -p "$DIR" && chown postgres "$DIR" && su postgres -c "$BIN/initdb -D $DIR/data -A trust >/dev/null"; fi
    su postgres -c "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null" 2>&1 | tail -1
    su postgres -c "$BIN/psql -h $DIR -p $PORT -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname='redblue'\" | grep -q 1 || $BIN/createdb -h $DIR -p $PORT redblue"
    echo "postgresql://postgres@localhost:$PORT/redblue";;
  stop) su postgres -c "$BIN/pg_ctl -D $DIR/data -m fast stop" ;;
esac
