#!/usr/bin/env bash
# El estado del servidor para la pestaña «Monitoreo» del panel (P-016 E7, D-408).
#
#   ./scripts/estado-del-servidor.sh
#
# Lo corre el cron de quien despliega, cada minuto (`preparar-monitoreo.sh` lo
# instala). Deja en `estado/` dos archivos que la aplicación lee y no escribe:
#
#   servidor.json   la última foto: carga, CPU, memoria, disco y contenedores
#   historial.csv   una línea por minuto, de las últimas 24 horas
#
# Un guion del anfitrión y no la aplicación preguntándole a Docker (D-408): ver
# los contenedores pide el socket de Docker, y quien tiene el socket manda en el
# servidor entero. La aplicación abre imágenes que suben los editores (`sharp`);
# si alguien consiguiera ejecutar algo dentro de ella, con el socket montado
# saldría del contenedor. Así lo único que la aplicación recibe es una carpeta
# de solo lectura con dos archivos, y la foto llega con un minuto de retraso.
#
# Si `docker` falla, la foto sale sin contenedores y con el error anotado: el
# resto del estado sigue sirviendo, y el panel dice qué faltó.
set -euo pipefail

cd "$(dirname "$0")/.."
DESTINO="estado"
mkdir -p "$DESTINO"

# Un solo guion a la vez: `docker stats` puede tardar si el servidor está
# ahogado, que es justo cuando más se mira, y el cron no espera a que termine
# el minuto anterior. Si el anterior sigue, este se retira sin escribir.
exec 9>"$DESTINO/.candado"
flock -n 9 || exit 0

command -v python3 >/dev/null 2>&1 || { echo "falta python3" >&2; exit 1; }

error_docker=""
contenedores=""
consumo=""
if ! contenedores=$(timeout 20 docker ps -a --format '{{json .}}' 2>&1); then
  error_docker="docker ps: ${contenedores:0:200}"
  contenedores=""
elif ! consumo=$(timeout 20 docker stats --no-stream --format '{{json .}}' 2>&1); then
  error_docker="docker stats: ${consumo:0:200}"
  consumo=""
fi

CONTENEDORES="$contenedores" CONSUMO="$consumo" ERROR_DOCKER="$error_docker" \
  python3 -I - "$DESTINO" <<'PY'
import json, os, sys, time
from datetime import datetime, timezone

destino = sys.argv[1]

def leer_cpu():
    with open('/proc/stat') as f:
        partes = [int(x) for x in f.readline().split()[1:]]
    # idle + iowait: el tiempo en que el procesador no hizo nada propio.
    return sum(partes), partes[3] + (partes[4] if len(partes) > 4 else 0)

def memoria():
    datos = {}
    with open('/proc/meminfo') as f:
        for linea in f:
            clave, _, resto = linea.partition(':')
            datos[clave] = int(resto.split()[0]) * 1024
    return datos

def bytes_de(texto):
    # «123.4MiB», «1.2GiB», «512kB», «0B»: lo que escribe `docker stats`.
    texto = texto.strip()
    unidades = [('KiB', 1024), ('MiB', 1024 ** 2), ('GiB', 1024 ** 3), ('TiB', 1024 ** 4),
                ('kB', 1000), ('KB', 1000), ('MB', 1000 ** 2), ('GB', 1000 ** 3), ('TB', 1000 ** 4), ('B', 1)]
    for sufijo, factor in unidades:
        if texto.endswith(sufijo):
            try:
                return int(float(texto[: -len(sufijo)]) * factor)
            except ValueError:
                return None
    return None

def porcentaje(texto):
    try:
        return round(float(texto.strip().rstrip('%')), 2)
    except (ValueError, AttributeError):
        return None

# Un segundo entre las dos lecturas: /proc/stat cuenta desde el arranque, y lo
# que interesa es lo de ahora.
total_a, libre_a = leer_cpu()
time.sleep(1)
total_b, libre_b = leer_cpu()
paso = total_b - total_a
cpu = round(100 * (1 - (libre_b - libre_a) / paso), 1) if paso > 0 else None

with open('/proc/loadavg') as f:
    carga = [float(x) for x in f.read().split()[:3]]
with open('/proc/uptime') as f:
    encendido = int(float(f.read().split()[0]))

mem = memoria()
disco = os.statvfs('/')

consumo = {}
for linea in os.environ.get('CONSUMO', '').splitlines():
    try:
        fila = json.loads(linea)
    except ValueError:
        continue
    usado = (fila.get('MemUsage') or '').split('/')[0]
    consumo[fila.get('Name')] = {
        'cpu': porcentaje(fila.get('CPUPerc')),
        'memoria': bytes_de(usado),
        'memoriaPct': porcentaje(fila.get('MemPerc')),
    }

contenedores = []
for linea in os.environ.get('CONTENEDORES', '').splitlines():
    try:
        fila = json.loads(linea)
    except ValueError:
        continue
    nombre = fila.get('Names') or ''
    contenedores.append({
        'nombre': nombre,
        'imagen': fila.get('Image') or '',
        'estado': fila.get('State') or '',
        'detalle': fila.get('Status') or '',
        **consumo.get(nombre, {'cpu': None, 'memoria': None, 'memoriaPct': None}),
    })
contenedores.sort(key=lambda c: c['nombre'])

ahora = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
foto = {
    'formato': 'traumahub/estado-del-servidor',
    'fecha': ahora,
    'nucleos': os.cpu_count(),
    'carga': carga,
    'cpu': cpu,
    'encendidoSegundos': encendido,
    'memoria': {'total': mem.get('MemTotal'), 'disponible': mem.get('MemAvailable')},
    'intercambio': {'total': mem.get('SwapTotal'), 'libre': mem.get('SwapFree')},
    'discos': [{'punto': '/', 'total': disco.f_blocks * disco.f_frsize, 'libre': disco.f_bavail * disco.f_frsize}],
    'contenedores': contenedores,
    'errorDocker': os.environ.get('ERROR_DOCKER') or None,
}

def escribir(nombre, texto):
    # Primero a un temporal y luego `replace`: la aplicación puede leer en
    # cualquier momento, y un archivo a medio escribir sería un JSON roto.
    ruta = os.path.join(destino, nombre)
    temporal = ruta + '.nuevo'
    with open(temporal, 'w', encoding='utf-8') as f:
        f.write(texto)
    os.chmod(temporal, 0o644)
    os.replace(temporal, ruta)

escribir('servidor.json', json.dumps(foto, ensure_ascii=False))

# El historial: una línea por minuto, las últimas 1440 (24 horas).
memoria_pct = None
if mem.get('MemTotal'):
    memoria_pct = round(100 * (1 - mem.get('MemAvailable', 0) / mem['MemTotal']), 1)
disco_pct = round(100 * (1 - disco.f_bavail / disco.f_blocks), 1) if disco.f_blocks else None
fila = ','.join('' if v is None else str(v) for v in (ahora, cpu, memoria_pct, disco_pct, carga[0]))
ruta = os.path.join(destino, 'historial.csv')
lineas = []
if os.path.exists(ruta):
    with open(ruta, encoding='utf-8') as f:
        lineas = [l.rstrip('\n') for l in f if l.strip() and not l.startswith('fecha')]
lineas = (lineas + [fila])[-1440:]
escribir('historial.csv', 'fecha,cpu,memoria,disco,carga\n' + '\n'.join(lineas) + '\n')
PY
