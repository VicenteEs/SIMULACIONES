#!/usr/bin/env bash
# Los guiones de respaldo del anfitrion con la llave de cifrado puesta y sin
# ella (D-295), con un docker y un age de mentira.
#
#   bash tests/guiones/respaldosCifrados.sh <raiz-del-repositorio>
#
# Lo corre tests/unit/guionesDeRespaldo.test.ts, y se puede correr a mano.
#
# En bash y no en TypeScript porque lo que se prueba son los guiones tal como
# los corre el cron —respaldar.sh, restaurar.sh y salud.sh, con comun.sh—, con
# sus trampas de salida y sus temporales, y eso solo se ve corriendolos. La
# promesa es una: con la llave puesta, ningun volcado en claro queda en el
# disco, ni cuando age falla ni cuando la llave no es la buena.
#
# Docker y age son de mentira para que corra en cualquier equipo con bash, sin
# base y sin contenedores, y para que no pueda tocar nada de verdad: el docker
# falso responde solo a las ordenes que usan los guiones y falla con cualquier
# otra. El age falso escribe la cabecera de verdad y deja el contenido detras
# sin cifrar: que age cifre no se prueba aqui, es age. Lo que si comprueba al
# abrir es que la llave privada corresponda a la publica para la que se cifro,
# que es el error que se comete de verdad.
#
# Todo pasa en una carpeta temporal que se borra al salir: los guiones se copian
# ahi con un .env propio, y su backups/ es el de esa copia.
set -uo pipefail

RAIZ="${1:?Uso: bash tests/guiones/respaldosCifrados.sh <raiz-del-repositorio>}"
[ -f "$RAIZ/scripts/respaldar.sh" ] || { echo "No hay scripts/respaldar.sh en $RAIZ" >&2; exit 2; }

# Lo que los guiones leen del entorno antes que del .env. Una COPIA_REMOTA
# olvidada en la shell de quien prueba mandaria el respaldo de mentira por
# rsync a una maquina de verdad.
unset CIFRAR COMPOSE COPIA_REMOTA DIAS_A_CONSERVAR PREFIJO RESPALDOS_DESTINATARIO \
  RESPALDO_FINAL TUNEL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD

AQUI="$(mktemp -d)"
trap 'rm -rf "$AQUI"' EXIT
BIN="$AQUI/bin"
mkdir -p "$BIN"

PUB="age1$(printf 'q%.0s' $(seq 1 58))"
OTRA="age1$(printf 'z%.0s' $(seq 1 58))"

# --- age falso: misma interfaz, cabecera real, y comprueba que la llave case ---
cat > "$BIN/age" <<'AGE'
#!/usr/bin/env bash
modo=cifrar; destino=""; llave=""; receptor=""; entrada=""
while [ $# -gt 0 ]; do
  case "$1" in
    -d) modo=descifrar ;;
    -r) receptor="$2"; shift ;;
    -i) llave="$2"; shift ;;
    -o) destino="$2"; shift ;;
    *) entrada="$1" ;;
  esac
  shift
done
if [ -n "${FALLO_AGE:-}" ]; then echo "age: error: fallo simulado" >&2; exit 1; fi
if [ "$modo" = cifrar ]; then
  if [ -n "$destino" ]; then exec > "$destino"; fi
  printf 'age-encryption.org/v1\n-> X25519 %s\n---\n' "$receptor"
  cat "${entrada:-/dev/stdin}"
else
  [ "$(head -c 21 "$entrada")" = "age-encryption.org/v1" ] || { echo "age: error: no es un archivo de age" >&2; exit 1; }
  para=$(sed -n '2s/^-> X25519 //p' "$entrada")
  grep -q "^# public key: $para\$" "$llave" 2>/dev/null || { echo "age: error: no identity matched any of the recipients" >&2; exit 1; }
  if [ -n "$destino" ]; then exec > "$destino"; fi
  tail -n +4 "$entrada"
fi
AGE

# --- docker falso: solo las ordenes que usan los guiones ----------------------
cat > "$BIN/docker" <<'DOCKER'
#!/usr/bin/env bash
echo "docker $*" >> "$REGISTRO_DOCKER"
a="$*"
case "$a" in
  "compose ps db --status running -q") echo id-db ;;
  "compose ps app --status running -q") [ -n "${APP_PARADA:-}" ] || echo id-app ;;
  *"pg_dump"*)
    printf -- '--\n-- PostgreSQL database dump\n--\n'
    head -c 6000 /dev/urandom | base64 ;;
  *"tar czf - -C /app medios"*) tar czf - -C "$MEDIOS_FALSOS" medios ;;
  *"--single-transaction"*)
    cat > "$RESTAURADO"
    grep -q "PostgreSQL database dump" "$RESTAURADO" || exit 3 ;;
  *"select count(*) from usuarios"*) echo 3 ;;
  *"pg_size_pretty"*) echo "12 MB" ;;
  *"pg_isready"*) exit 0 ;;
  *"tar xf - -C /app"*) tar tf - > "$MEDIOS_RESTAURADOS" ;;
  *"printenv RESPALDOS_DESTINATARIO"*) printf '%s\n' "${DESTINATARIO_EN_LA_APP:-}" ;;
  *"printenv NEXT_PUBLIC_BASE_PATH"*) echo "" ;;
  *"wget"*) echo '{"estado":"ok"}' ;;
  *"command -v age"*) [ -z "${APP_SIN_AGE:-}" ] ;;
  "compose stop app"|"compose start app") exit 0 ;;
  *) echo "docker falso: orden no prevista: $a" >&2; exit 99 ;;
esac
DOCKER
chmod +x "$BIN/age" "$BIN/docker"

fallos=0
comprobar() {  # comprobar "descripcion" condicion...
  local d="$1"; shift
  if "$@"; then echo "  OK    $d"; else echo "  FALLA $d"; fallos=$((fallos + 1)); fi
}

nuevo_proyecto() {
  P="$AQUI/proyecto"
  rm -rf "$P"; mkdir -p "$P/scripts" "$P/medios-falsos/medios"
  cp "$RAIZ"/scripts/*.sh "$P/scripts/"
  head -c 3000 /dev/urandom > "$P/medios-falsos/medios/modelo.glb"
  cat > "$P/.env" <<ENV
POSTGRES_USER=trauma
POSTGRES_PASSWORD=x
POSTGRES_DB=trauma
RESPALDOS_DESTINATARIO=$1
ENV
  export MEDIOS_FALSOS="$P/medios-falsos" REGISTRO_DOCKER="$P/docker.log"
  export RESTAURADO="$P/restaurado.sql" MEDIOS_RESTAURADOS="$P/medios-restaurados.txt"
  printf '# created: 2026-11-05T00:00:00Z\n# public key: %s\nAGE-SECRET-KEY-1FALSA\n' "$PUB" > "$P/llave.txt"
  printf '# created: 2026-11-05T00:00:00Z\n# public key: %s\nAGE-SECRET-KEY-1OTRA\n' "$OTRA" > "$P/otra-llave.txt"
}

parciales() { ls -A "$P/backups" 2>/dev/null | grep -c '\.parcial$'; }
cuantos() { ls "$P/backups" 2>/dev/null | grep -Ec "$1"; }
es_age() { [ "$(head -c 21 "$1")" = "age-encryption.org/v1" ]; }

export PATH="$BIN:$PATH"

echo "== 1. respaldar con llave publica =="
nuevo_proyecto "$PUB"
salida=$(bash "$P/scripts/respaldar.sh" --verificar 2>&1); codigo=$?
comprobar "sale con 0" [ "$codigo" -eq 0 ]
comprobar "un volcado cifrado" [ "$(cuantos '^base-.*\.sql\.gz\.age$')" -eq 1 ]
comprobar "un paquete de medios cifrado" [ "$(cuantos '^medios-.*\.tar\.gz\.age$')" -eq 1 ]
comprobar "ningun respaldo en claro" [ "$(cuantos '\.gz$')" -eq 0 ]
comprobar "ningun temporal" [ "$(parciales)" -eq 0 ]
comprobar "la cabecera es de age" es_age "$(ls "$P"/backups/base-*.age)"
comprobar "dice la llave por su final" grep -q "se cifra para la llave ...qqqqqqqq" <<<"$salida"
comprobar "verifico antes de cifrar" grep -q "integro y con la cabecera esperada" <<<"$salida"
cp "$(ls "$P"/backups/base-*.age)" "$AQUI/volcado-cifrado.age"
cp "$(ls "$P"/backups/medios-*.age)" "$AQUI/medios-cifrado.age"

echo "== 2. respaldar sin llave publica =="
nuevo_proyecto ""
salida=$(bash "$P/scripts/respaldar.sh" --verificar 2>&1); codigo=$?
comprobar "sale con 0" [ "$codigo" -eq 0 ]
comprobar "avisa que queda sin cifrar" grep -q "SIN CIFRAR" <<<"$salida"
comprobar "un volcado en claro" [ "$(cuantos '^base-.*\.sql\.gz$')" -eq 1 ]
comprobar "ningun .age" [ "$(cuantos '\.age$')" -eq 0 ]
comprobar "ningun temporal" [ "$(parciales)" -eq 0 ]

echo "== 3. llave publica mal copiada =="
nuevo_proyecto "age1esto-no-es-una-llave"
salida=$(bash "$P/scripts/respaldar.sh" --verificar 2>&1); codigo=$?
comprobar "sale con error" [ "$codigo" -ne 0 ]
comprobar "lo explica" grep -q "no es una llave publica de age" <<<"$salida"
comprobar "no deja nada en backups/" [ -z "$(ls -A "$P/backups")" ]
comprobar "no llego a volcar la base" bash -c "! grep -q pg_dump '$P/docker.log' 2>/dev/null"

echo "== 4. llave puesta pero sin age =="
nuevo_proyecto "$PUB"
salida=$(PATH="$(printf '%s' "$PATH" | sed "s#$BIN:##")" bash -c '
  # Un PATH sin el age falso; si el sistema tuviera uno de verdad, la prueba no vale.
  command -v age >/dev/null && { echo "HAY-AGE-EN-EL-SISTEMA"; exit 0; }
  mkdir -p "'"$AQUI"'/solo-docker"; cp "'"$BIN"'/docker" "'"$AQUI"'/solo-docker/"
  PATH="'"$AQUI"'/solo-docker:$PATH" bash "'"$P"'/scripts/respaldar.sh" --verificar' 2>&1); codigo=$?
if grep -q "HAY-AGE-EN-EL-SISTEMA" <<<"$salida"; then
  echo "  (omitida: hay un age instalado en el sistema)"
else
  comprobar "sale con error" [ "$codigo" -ne 0 ]
  comprobar "lo explica" grep -q "falta age en este servidor" <<<"$salida"
  comprobar "no deja nada en backups/" [ -z "$(ls -A "$P/backups")" ]
fi

echo "== 5. age falla al cifrar =="
nuevo_proyecto "$PUB"
salida=$(FALLO_AGE=1 bash "$P/scripts/respaldar.sh" --verificar 2>&1); codigo=$?
comprobar "sale con error" [ "$codigo" -ne 0 ]
comprobar "dice que no se guarda en claro" grep -q "no se guarda en claro" <<<"$salida"
comprobar "ningun temporal en claro" [ "$(parciales)" -eq 0 ]
comprobar "ningun respaldo" [ "$(cuantos '^(base|medios)-')" -eq 0 ]

echo "== 6. restaurar un cifrado con la llave buena =="
nuevo_proyecto "$PUB"
mkdir -p "$P/backups"
nombre="base-20261105-030000.sql.gz.age"
cp "$AQUI/volcado-cifrado.age" "$P/backups/$nombre"
cp "$AQUI/medios-cifrado.age" "$P/backups/medios-20261105-030000.tar.gz.age"
salida=$(cd "$P" && echo RESTAURAR | bash scripts/restaurar.sh "backups/$nombre" "$P/llave.txt" 2>&1); codigo=$?
comprobar "sale con 0" [ "$codigo" -eq 0 ]
comprobar "psql recibio el volcado" grep -q "PostgreSQL database dump" "$RESTAURADO"
comprobar "los medios llegaron al contenedor" grep -q "medios/modelo.glb" "$MEDIOS_RESTAURADOS"
comprobar "el respaldo previo salio cifrado" [ "$(cuantos '^base-.*\.sql\.gz\.age$')" -eq 2 ]
comprobar "ningun temporal en claro" [ "$(parciales)" -eq 0 ]
comprobar "recuerda borrar la llave" grep -q "Borre ahora la llave privada" <<<"$salida"
comprobar "recuerda repetir las supresiones" grep -q "Vuelva a eliminar las cuentas" <<<"$salida"
comprobar "detuvo y levanto la app" bash -c "grep -q 'compose stop app' '$P/docker.log' && grep -q 'compose start app' '$P/docker.log'"

echo "== 7. restaurar un cifrado con otra llave =="
nuevo_proyecto "$PUB"
mkdir -p "$P/backups"
cp "$AQUI/volcado-cifrado.age" "$P/backups/$nombre"
salida=$(cd "$P" && echo RESTAURAR | bash scripts/restaurar.sh "backups/$nombre" "$P/otra-llave.txt" 2>&1); codigo=$?
comprobar "sale con error" [ "$codigo" -ne 0 ]
comprobar "lo explica" grep -q "No se pudo abrir con esa llave" <<<"$salida"
comprobar "no toco la base" bash -c "! grep -q -- '--single-transaction' '$P/docker.log' 2>/dev/null"
comprobar "no detuvo la app" bash -c "! grep -q 'compose stop app' '$P/docker.log' 2>/dev/null"
comprobar "ningun temporal en claro" [ "$(parciales)" -eq 0 ]

echo "== 8. restaurar un cifrado sin llave =="
salida=$(cd "$P" && echo RESTAURAR | bash scripts/restaurar.sh "backups/$nombre" 2>&1); codigo=$?
comprobar "sale con error" [ "$codigo" -ne 0 ]
comprobar "pide la llave" grep -q "falta la llave privada" <<<"$salida"

echo "== 9. restaurar uno en claro en un servidor sin llave =="
nuevo_proyecto ""
mkdir -p "$P/backups"
{ printf -- '--\n-- PostgreSQL database dump\n--\n'; head -c 6000 /dev/urandom | base64; } | gzip -9 > "$P/backups/base-20261104-030000.sql.gz"
salida=$(cd "$P" && echo RESTAURAR | bash scripts/restaurar.sh backups/base-20261104-030000.sql.gz 2>&1); codigo=$?
comprobar "sale con 0" [ "$codigo" -eq 0 ]
comprobar "el previo salio en claro, con aviso" bash -c "[ \"\$(ls '$P/backups' | grep -Ec '^base-.*\.sql\.gz$')\" -eq 2 ] && grep -q 'SIN CIFRAR' <<<\"\$0\"" "$salida"
comprobar "ningun temporal" [ "$(parciales)" -eq 0 ]
comprobar "recuerda repetir las supresiones" grep -q "Vuelva a eliminar las cuentas" <<<"$salida"
comprobar "no pide borrar una llave que no hubo" bash -c "! grep -q 'Borre ahora la llave privada' <<<\"\$0\"" "$salida"

echo "== 10. salud con todo en orden =="
nuevo_proyecto "$PUB"
bash "$P/scripts/respaldar.sh" >/dev/null 2>&1
salida=$(DESTINATARIO_EN_LA_APP="$PUB" bash "$P/scripts/salud.sh" 2>&1)
comprobar "la llave por su final" grep -q "se cifra para la llave ...qqqqqqqq" <<<"$salida"
comprobar "el panel cifra para la misma llave" grep -q "el panel cifra para la misma llave" <<<"$salida"
comprobar "no se queja del cifrado" bash -c "! grep -E 'SIN CIFRAR|otra llave|no trae age' <<<\"\$0\"" "$salida"
comprobar "cuenta el volcado cifrado" grep -q "conservados: 1" <<<"$salida"

echo "== 11. salud: la app sin la llave, la imagen sin age, y un respaldo viejo en claro =="
{ printf -- '--\n-- PostgreSQL database dump\n--\n'; } | gzip > "$P/backups/base-20261001-030000.sql.gz"
touch -d '2026-10-01 03:00' "$P/backups/base-20261001-030000.sql.gz"
salida=$(DESTINATARIO_EN_LA_APP="" APP_SIN_AGE=1 bash "$P/scripts/salud.sh" 2>&1)
comprobar "el panel respalda sin cifrar" grep -q "el panel respalda SIN CIFRAR" <<<"$salida"
comprobar "la imagen sin age" grep -q "la imagen de la app no trae age" <<<"$salida"
comprobar "cuenta el viejo en claro" grep -q "1 respaldo(s) de antes del cifrado" <<<"$salida"
comprobar "el ultimo sigue siendo el cifrado" bash -c "! grep -q 'el ultimo respaldo esta SIN CIFRAR' <<<\"\$0\"" "$salida"
salida=$(DESTINATARIO_EN_LA_APP="$OTRA" bash "$P/scripts/salud.sh" 2>&1)
comprobar "la app con otra llave" grep -q "el panel cifra para otra llave (...zzzzzzzz)" <<<"$salida"

echo "== 12. salud sin llave en el .env =="
nuevo_proyecto ""
bash "$P/scripts/respaldar.sh" >/dev/null 2>&1
salida=$(bash "$P/scripts/salud.sh" 2>&1)
comprobar "lo marca como problema" grep -q "los respaldos salen SIN CIFRAR: falta RESPALDOS_DESTINATARIO" <<<"$salida"

echo
if [ "$fallos" -eq 0 ]; then echo "TODO BIEN"; else echo "$fallos FALLO(S)"; fi
exit "$fallos"
