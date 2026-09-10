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
npx vitest run
npm run build
```

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
