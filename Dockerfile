# Imagen de produccion. Construccion en varias etapas para que la imagen final
# no arrastre ni las dependencias de compilacion ni el codigo fuente.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- dependencias ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- compilacion ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# La compilacion no necesita una base real, pero Payload exige que las
# variables existan para poder leer la configuracion.
ENV DATABASE_URI=postgres://build:build@localhost:5432/build
ENV PAYLOAD_SECRET=solo-para-compilar
RUN npm run build

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
