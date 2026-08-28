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
# Las variables se definen solo para este comando y no se graban en la imagen.
# Payload exige que existan para poder leer su configuracion, pero la
# compilacion no toca la base de datos: son valores de relleno.
RUN DATABASE_URI=postgres://relleno:relleno@localhost:5432/relleno     PAYLOAD_SECRET=valor-de-relleno-solo-para-compilar     npm run build

# --- ejecucion ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# La aplicacion no corre como root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Directorio de subidas, propiedad del usuario de la aplicacion.
RUN mkdir -p ./public/media/modelos && chown -R nextjs:nodejs ./public/media

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
