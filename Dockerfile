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
RUN DATABASE_URI=postgres://relleno:relleno@localhost:5432/relleno \
    PAYLOAD_SECRET=valor-de-relleno-solo-para-compilar \
    npm run build

# --- ejecucion ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# El cliente de PostgreSQL viaja en la imagen para que el panel pueda respaldar
# la base sin abrir una sesion SSH. Son unos pocos megabytes y evitan que el
# unico camino al respaldo sea la linea de comandos del servidor.
RUN apk add --no-cache postgresql17-client

# La aplicacion no corre como root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Directorios de escritura, propiedad del usuario de la aplicacion. Ambos se
# montan como volumen en produccion; se crean aqui para que la imagen funcione
# tambien sin montarlos.
RUN mkdir -p ./public/media/modelos /backups \
    && chown -R nextjs:nodejs ./public/media /backups

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV RESPALDOS_DIR=/backups

# Un contenedor que responde en el puerto pero no alcanza la base esta caido
# para todos los efectos practicos: /api/salud consulta PostgreSQL antes de
# declararse sano, y de ahi lo lee tanto compose como el script de despliegue.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud >/dev/null || exit 1

CMD ["node", "server.js"]
