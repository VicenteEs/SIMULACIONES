#!/usr/bin/env bash
# Abre la sesión de la cuenta de la prueba de carga (P-016 E4, D-392) con la
# imagen de guiones. Se corre en el servidor, desde el clon del repositorio;
# ver `LEEME.md`.
#
# La dirección de la base la arma el compose, no el `.env`: se arma aquí igual
# que en `ensayar-casos.sh`, y pasa por el entorno para no verse en `ps`. Con
# `--env-file .env`, Payload buscaría la base en localhost.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/comun.sh
cargar_env
export DATABASE_URI="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}"
export DUENO="$(id -u):$(id -g)"
timeout 300 docker run --rm --network traumahub_default \
  -e NODE_ENV=production -e DATABASE_URI -e PAYLOAD_SECRET -e DUENO -e DIRECTORIO_DE_MEDIOS=/app/medios \
  -v traumahub_medios:/app/medios:ro -v "$HOME/carga:/carga" \
  traumahub-guiones npx tsx scripts/carga/abrir-sesion.ts </dev/null 2>&1 | grep -v -i -E "password|token" | tail -15
