# Imagen de produccion. Construccion en varias etapas para que la imagen final
# no arrastre ni las dependencias de compilacion ni el codigo fuente.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- dependencias ---
FROM base AS deps
COPY package.json package-lock.json ./
# Se usa "npm install" y no "npm ci" a proposito: el lockfile se genera en
# Windows y lista binarios opcionales de otras plataformas (esbuild para aix,
# darwin y demas). "npm ci" los valida de forma estricta y falla al construir
# sobre linux/amd64, aunque esos paquetes jamas se usen aqui.
RUN npm install --no-audit --no-fund

# --- compilacion ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Prefijo bajo el que se sirve la aplicacion. Next.js lo incrusta en cada
# enlace y en cada recurso al compilar, de modo que no se puede cambiar
# despues arrancando el contenedor con otra variable: hay que reconstruir.
#   docker compose build --build-arg BASE_PATH=/traumahub app
ARG BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$BASE_PATH
# Las variables se definen solo para este comando y no se graban en la imagen.
# Payload exige que existan para poder leer su configuracion, pero la
# compilacion no toca la base de datos: son valores de relleno.
#
# SALIDA_AUTOCONTENIDA=1 es la que enciende `output: 'standalone'` en
# next.config.mjs, y esta imagen es el unico sitio que la pone. Estaba
# encendida para todos, y el servidor de Windows, que arranca con `next start`,
# avisaba en cada arranque de que esa no era la forma de lanzar la construccion.
# Aqui si hace falta: la etapa de ejecucion copia `.next/standalone`, y sin la
# variable ese directorio no se genera.
#
# Por eso la comprobacion del final. Sin ella, olvidar la variable -o que alguien
# la renombre en un solo lado- no fallaria aqui sino tres pasos mas abajo, en un
# COPY que dice «not found» sin nombrar la variable ni este archivo. Se mira
# `server.js` y no el directorio a secas porque es lo que ejecuta el CMD.
RUN DATABASE_URI=postgres://relleno:relleno@localhost:5432/relleno \
    PAYLOAD_SECRET=valor-de-relleno-solo-para-compilar \
    SALIDA_AUTOCONTENIDA=1 \
    npm run build \
 && if [ ! -f .next/standalone/server.js ]; then \
      echo "La compilacion no dejo .next/standalone/server.js: revise que next.config.mjs siga leyendo SALIDA_AUTOCONTENIDA=1." >&2; \
      exit 1; \
    fi

# --- ejecucion ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# El prefijo se repite aqui porque las variables no cruzan de una etapa a otra,
# y esta etapa lo necesita para que la comprobacion de salud consulte la ruta
# real. Sin esto el contenedor queda «unhealthy» aunque este sirviendo bien:
# pregunta por /api/salud cuando el extremo vive en /traumahub/api/salud.
ARG BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$BASE_PATH

# El cliente de PostgreSQL viaja en la imagen para que el panel pueda respaldar
# la base sin abrir una sesion SSH. Son unos pocos megabytes y evitan que el
# unico camino al respaldo sea la linea de comandos del servidor.
#
# Y age, para que «Respaldar ahora» cifre como cifra el respaldo de cada noche
# (D-295): sin el, el boton se niega en un servidor configurado para cifrar,
# que es mejor que dejar en el disco un volcado en claro que nadie esperaba.
RUN apk add --no-cache postgresql17-client age

# Chromium para «Guardar PDF» (D-244): el servidor imprime la ficha con la
# misma hoja de estilos de impresion y entrega el archivo hecho, en vez de
# dejarlo al dialogo de cada navegador. Son unos 250 MB de imagen. La fuente
# es la de reserva: el texto va en Inter, que la pagina trae consigo, y sin
# ninguna fuente del sistema un simbolo que Inter no tenga saldria en cuadros.
# Si un dia se quita, «Guardar PDF» contesta que el servidor no tiene con que
# preparar el PDF; no se cae nada mas.
# No se fija NAVEGADOR_PDF: segun la version, Alpine deja el ejecutable como
# `chromium` o como `chromium-browser`, y `src/lib/pdfServidor.ts` busca los dos.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

# La aplicacion no corre como root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Directorios de escritura, propiedad del usuario de la aplicacion. Ambos se
# montan como volumen en produccion; se crean aqui para que la imagen funcione
# tambien sin montarlos.
RUN mkdir -p ./medios/modelos ./medios/pagina /backups \
    && chown -R nextjs:nodejs ./medios /backups

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV RESPALDOS_DIR=/backups

# Un contenedor que responde en el puerto pero no alcanza la base esta caido
# para todos los efectos practicos: /api/salud consulta PostgreSQL antes de
# declararse sano, y de ahi lo lee tanto compose como el script de despliegue.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3000${NEXT_PUBLIC_BASE_PATH}/api/salud" >/dev/null || exit 1

CMD ["node", "server.js"]
