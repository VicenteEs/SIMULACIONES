#!/usr/bin/env bash
# Arranque del entorno de desarrollo local.
#
# Levanta PostgreSQL, espera a que responda, aplica el esquema y deja la
# aplicación lista. Es idempotente: se puede ejecutar tantas veces como haga
# falta sin romper nada.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Comprobando Docker"
if ! docker info >/dev/null 2>&1; then
  cat <<'AYUDA'
El motor de Docker no responde.

En Windows suele deberse a que el servicio com.docker.service esta detenido y
necesita privilegios de administrador. Abra PowerShell como administrador y
ejecute:

    Set-Service com.docker.service -StartupType Automatic
    Start-Service com.docker.service

Despues vuelva a lanzar este script.
AYUDA
  exit 1
fi

echo "==> Comprobando el archivo .env"
if [ ! -f .env ]; then
  echo "No existe .env. Copie .env.example y complete los valores." >&2
  exit 1
fi

echo "==> Levantando PostgreSQL"
docker compose up -d db

echo "==> Esperando a que la base acepte conexiones"
for intento in $(seq 1 60); do
  if docker compose exec -T db pg_isready -q 2>/dev/null; then
    echo "    lista tras ${intento}s"
    break
  fi
  if [ "$intento" -eq 60 ]; then
    echo "La base no respondio en 60 segundos." >&2
    docker compose logs --tail 30 db >&2
    exit 1
  fi
  sleep 1
done

echo "==> Instalando dependencias si hace falta"
[ -d node_modules ] || npm install --no-audit --no-fund

echo "==> Generando tipos desde las colecciones"
npm run generate:types

echo
echo "Listo. Arranque la aplicacion con:"
echo "    npm run dev"
echo
echo "Y abra http://localhost:3000/admin para crear la primera cuenta."
echo "Recuerde marcarla como activa: una cuenta sin activar no ve nada."
