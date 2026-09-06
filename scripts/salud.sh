#!/usr/bin/env bash
# Estado de la instalacion en el servidor, de un vistazo.
#
#   ./scripts/salud.sh
#
# Responde a las cinco preguntas que se hacen cuando algo va mal, en el orden en
# que conviene hacerselas: contenedores, base, aplicacion, respaldos y espacio.
# Devuelve codigo distinto de cero si algo esta mal, para poder encadenarlo.
set -uo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

elegir_compose
cargar_env

problemas=0
fallo() { rojo "  ✗ $*"; problemas=$((problemas + 1)); }
bien()  { verde "  ✓ $*"; }
nota()  { ambar "  · $*"; }

echo
echo "Plataforma docente de traumatologia — estado"
echo "  compose: $COMPOSE   ·   $(date '+%Y-%m-%d %H:%M')"
echo

echo "Contenedores"
for servicio in db app; do
  if servicio_en_marcha "$servicio"; then
    bien "$servicio en marcha"
  else
    fallo "$servicio NO esta en marcha"
  fi
done
if [ "$TUNEL" = "cloudflare" ]; then
  servicio_en_marcha tunel && bien "tunel en marcha" || fallo "el tunel de Cloudflare no esta en marcha"
fi
echo

echo "Base de datos"
if docker compose -f "$COMPOSE" exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  peso=$(docker compose -f "$COMPOSE" exec -T db \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "select pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null | tr -d '\r ')
  cuentas=$(docker compose -f "$COMPOSE" exec -T db \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from usuarios;" 2>/dev/null | tr -d '\r ')
  bien "acepta conexiones · ${peso:-?} · ${cuentas:-?} cuentas"
else
  fallo "la base no acepta conexiones"
fi
echo

echo "Aplicacion"
respuesta=$(docker compose -f "$COMPOSE" exec -T app wget -qO- http://127.0.0.1:3000/api/salud 2>/dev/null || true)
case "$respuesta" in
  *'"estado":"ok"'*) bien "responde y alcanza la base" ;;
  *'"estado"'*)      fallo "responde pero no alcanza la base: $respuesta" ;;
  *)                 fallo "no responde en /api/salud" ;;
esac
if [ "$TUNEL" = "tailscale" ]; then
  if command -v tailscale >/dev/null && tailscale serve status 2>/dev/null | grep -q 3000; then
    bien "Tailscale publica el puerto 3000"
  else
    nota "Tailscale no publica el 3000 (sudo tailscale serve --bg 3000)"
  fi
fi
echo

echo "Respaldos"
ultimo=$(ls -1t backups/base-*.sql.gz 2>/dev/null | head -1 || true)
if [ -z "$ultimo" ]; then
  fallo "no hay ningun respaldo de la base"
else
  edad=$(( ( $(date +%s) - $(stat -c %Y "$ultimo") ) / 86400 ))
  tam=$(du -h "$ultimo" | cut -f1)
  if [ "$edad" -le 2 ]; then
    bien "$ultimo · $tam · hace $edad dia(s)"
  else
    fallo "el ultimo respaldo tiene $edad dias: $ultimo"
  fi
  echo "    conservados: $(ls -1 backups/base-*.sql.gz 2>/dev/null | wc -l)"
fi
if command -v systemctl >/dev/null 2>&1 && systemctl list-timers plataforma-respaldo.timer >/dev/null 2>&1; then
  if systemctl is-active --quiet plataforma-respaldo.timer; then
    bien "temporizador diario activo"
  else
    fallo "el temporizador de respaldo esta detenido"
  fi
elif crontab -l 2>/dev/null | grep -q respaldar.sh; then
  bien "respaldo programado en cron"
else
  fallo "el respaldo diario no esta programado"
fi
echo

echo "Espacio en disco"
df -h . | tail -1 | awk '{print "  " $4 " libres de " $2 " (" $5 " usado)"}'
uso=$(df --output=pcent . | tail -1 | tr -dc '0-9')
[ "${uso:-0}" -lt 90 ] || fallo "el disco esta al ${uso}%"
echo

if [ "$problemas" -eq 0 ]; then
  verde "Todo en orden."
else
  rojo "$problemas problema(s) detectado(s)."
fi
exit "$problemas"
