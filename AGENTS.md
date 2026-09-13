# Cómo se trabaja en TraumaHub

El mapa del repositorio y el arranque local están en `README.md`. Las decisiones
del proyecto, en `BITACORA.md`.

## Todo en español

Código, comentarios, nombres de función y de variable, y mensajes de commit. Sin
mezclar idiomas. Las únicas excepciones son las que impone el marco: `page.tsx`,
`layout.tsx`, `route.ts`, `icon.png`, `use client`, los nombres de la API de
Payload, y el prefijo de tipo del commit (`feat:`, `fix:`, `docs:`, `chore:`),
que sigue la convención de siempre para que el historial se pueda filtrar.

## Los comentarios explican el porqué, no el qué

Lo que hace la línea ya se lee en la línea. El comentario dice por qué está así,
qué se intentó antes y qué se rompe si se cambia. Para calibrar el tono, mirar
cualquier archivo de `src/lib` o de `src/collections/hooks`.

## El panel de administración es propio

Vive en `src/app/(frontend)/admin-panel`, con su guardia única en `acceso.ts`.
La interfaz de Payload se retiró (D-038) y no se vuelve a usar: de `(payload)/`
queda solo la API, y la ruta `/admin` únicamente redirige. Dos administraciones
sobre los mismos datos pueden mostrar cosas distintas, y esa es exactamente la
razón de haber quitado una.

## Lo que se escribe a mano pasa por `ruta()`

La plataforma puede vivir bajo un prefijo (`/traumahub`), porque comparte dominio
y puerto con otras páginas detrás del mismo proxy. Next.js resuelve solo el
prefijo de `<Link>`, `redirect()`, `router.push()` y `next/image`, pero no el de
lo que se escribe a mano:

- `<img src="/logo.png">`
- `fetch('/api/…')` y `new EventSource('/api/…')`
- `<a href="/api/…">`
- los iconos declarados en `metadata`

Para todo eso está `ruta()`, en `src/lib/rutas.ts`. Olvidarla no falla donde se
nota: en desarrollo funciona igual, y en el servidor la petición sale sin el
prefijo, la atiende otra página del mismo dominio y devuelve un 404 que no
explica nada.

## Toda decisión va a `BITACORA.md`

Con su porqué y su consecuencia, buena y mala. Las entradas no se borran: se
marcan como superadas y se enlaza la que las reemplaza. Un cambio que no deje su
entrada condena al siguiente a repetir el error.

## Antes de subir

```bash
npm run typecheck
npm run lint
npm run test:coverage
npm run test:integration
npm run build
```

`npm run test:coverage` sustituye al `npx vitest run` de antes. Corre la misma
suite —el `include` de `vitest.config.ts` son `tests/unit` y `tests/integration`
juntas— y encima comprueba el umbral de cobertura, así que no cuesta una pasada
más. El umbral es el suelo real medido y no una aspiración: mientras pidió un
80 % sobre una suite al 70, fallaba siempre y por eso no estaba en esta lista.
Una puerta que falla siempre es una puerta por la que nadie pasa, y no guarda
nada.

`npm run test:integration` repite las seis pruebas de acceso que la orden
anterior ya corrió, pero declarándose obligatoria ella misma
(`EXIGIR_INTEGRACION=1`). Son las únicas que comprueban que los permisos llegan
hasta la consulta y no se quedan en la interfaz: sin esa insistencia, un
`OMITIR_INTEGRACION=1` olvidado en la shell las omite, las dos órdenes salen
verdes y quien va a desplegar cree haber comprobado el control de acceso sin
haber comprobado nada. Las dos variables están explicadas en `README.md`.

Las de integración hablan con PostgreSQL, así que hace falta `npm run db:up`. Y
sobre una base recién creada, además `npm run db:migrate`: las migraciones no se
aplican solas fuera de producción, y sin ellas el fallo es `relation "segmentos"
does not exist`, que no menciona ni el esquema ni las migraciones.

`npm run db:migrate` solo vale para esa base recién creada, y conviene saber por
qué antes de escribirlo en ningún guion. En cuanto la base ha arrancado una vez
en desarrollo, Payload le deja una fila con `batch = -1` en
`payload-migrations` —la marca de que el esquema se ajustó al vuelo—, y a partir
de ahí `payload migrate` abre una pregunta interactiva antes de hacer nada:

> It looks like you've run Payload in dev mode… If you'd like to run migrations,
> data loss will occur. Would you like to proceed? (y/N)

No hay bandera que la salte: `--force-accept-warning` existe para
`migrate:create` y para `migrate:fresh`, y `migrate` no la mira
(`@payloadcms/drizzle/dist/migrate.js`). Sin terminal delante —una tarea
programada, un gancho, una integración continua— el proceso se queda ahí
esperando para siempre, sin escribir una línea y sin morirse. Es la misma forma
del arranque colgado del servidor de D-061: el servicio dice «Running» y no
sirve nada.

Sobre una base de desarrollo que ya trae ese estado, lo que se quiere casi
siempre es tirarla y rehacerla (`npm run db:down && npm run db:up`), no migrar
encima.

## Un cambio de esquema necesita su migración

En desarrollo Payload ajusta la base al vuelo, así que un campo nuevo funciona
sin hacer nada más. En producción solo se aplican las migraciones: sin la suya,
ese campo falla al desplegar o, peor, arranca y deja de guardarse en silencio.

```bash
npx payload migrate:create
```

`tests/unit/migraciones.test.ts` lo vigila y falla si el esquema y la última
migración se separan.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
