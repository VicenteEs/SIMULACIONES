#!/usr/bin/env bash
# Cada 5 s, mientras corra el contenedor «carga»: CPU y memoria de la aplicación,
# de la base y del propio generador, la carga del sistema y las conexiones abiertas
# a PostgreSQL. Escribe en ~/carga/muestras.txt.
set -u
SALIDA="$HOME/carga/muestras.txt"
: > "$SALIDA"
sleep 3
while docker ps --format '{{.Names}}' | grep -qx carga; do
  {
    printf '%s carga=%s ' "$(date +%H:%M:%S)" "$(cut -d' ' -f1 /proc/loadavg)"
    docker stats --no-stream --format '{{.Name}}={{.CPUPerc}}/{{.MemUsage}}' traumahub-app trauma-db carga 2>/dev/null | tr '\n' ' '
    printf 'conexiones=%s\n' "$(docker exec trauma-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select count(*) from pg_stat_activity where datname = current_database()"' < /dev/null 2>/dev/null)"
  } >> "$SALIDA"
  sleep 5
done
echo fin >> "$SALIDA"
