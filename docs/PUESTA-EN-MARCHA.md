# Puesta en marcha

## Requisitos

- Node.js 20.9 o superior (probado en 22.20)
- Docker Desktop con su servicio en marcha
- npm 11

## Desarrollo local

1. Copiar `.env.example` a `.env` y completar los valores.
   El archivo `.env` está ignorado por git y nunca debe versionarse.

2. Levantar la base de datos:

   ```
   docker compose up -d
   ```

3. Instalar dependencias y arrancar:

   ```
   npm install
   npm run dev
   ```

4. Abrir http://localhost:3000/instalar y crear la primera cuenta. El
   formulario pide nombre, correo y una contraseña de doce caracteres, nada
   más: no hay dónde marcar el rol ni la casilla de cuenta activa. El gancho
   `ajustarPrimerUsuario` (`src/collections/hooks/primerUsuario.ts`) la deja
   como administradora y activa, porque quien instala la plataforma no tiene a
   nadie que lo active y si naciera desactivada quedaría encerrado fuera de su
   propio panel.

   Las demás cuentas no funcionan así. Toda cuenta nace lectora y desactivada
   (decisión D-020), y mientras esté desactivada no ve nada, de modo que hay que
   activarla a mano en `/admin-panel/usuarios`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas unitarias y de integración |
| `npm run test:integration` | Solo las de integración |
| `npm run test:e2e` | Recorridos completos con Playwright |
| `npm run test:coverage` | Pruebas con informe de cobertura |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint sobre todo el repositorio |
| `npm run generate:types` | Regenera `src/payload-types.ts` desde las colecciones |
| `npm run build` | Compilación de producción |

`npm test` incluye las pruebas de integración porque `vitest.config.ts` las
recoge junto a las unitarias. Si PostgreSQL no está en marcha no fallan: se
omiten solas y avisan por consola de la causa.

`npm run test:e2e` necesita antes los navegadores de Playwright:

```
npx playwright install chromium
```

`npm install` no los baja, porque `package.json` no tiene guion `postinstall`, y
sin ellos el comando falla en la primera prueba. Basta `chromium`:
`playwright.config.ts` no declara ningún otro. La aplicación sí se levanta sola
desde ese mismo archivo, que arranca `npm run dev` y reutiliza el servidor que
ya esté escuchando en el 3000.

## Si Docker no arranca en Windows

El motor de Docker necesita el servicio `com.docker.service`, que exige
privilegios de administrador. Si el panel queda cargando indefinidamente:

1. Cerrar Docker Desktop por completo, incluido el icono de la bandeja.
2. Abrirlo con el botón derecho, "Ejecutar como administrador".
3. Aceptar el diálogo de control de cuentas de usuario.

Comprobación: `docker info` debe responder en menos de un segundo.

## Estructura

```
src/
  access/       reglas de acceso, puras y probadas
  admin/        esquema del panel propio: qué campos tiene cada colección
  atlas/        catálogo, carga y selección de piezas del atlas anatómico
  blocks/       bloques de contenido reordenables
  collections/  las doce colecciones de Payload
  components/   componentes de React: sitio, panel (admin/) y visores (atlas/)
  lib/          lógica compartida: sesión, búsqueda, respaldos, encuadre
  migrations/   migraciones de esquema; en producción se aplican al arrancar
  uploads/      validación de archivos por su contenido real
  app/
    (payload)/  solo la API de Payload, en api/[...slug]/route.ts
    (frontend)/ el sitio del residente y el panel propio, en admin-panel/
tests/
  unit/         pruebas sin base de datos
  integration/  pruebas que requieren PostgreSQL
  e2e/          recorridos completos con Playwright
docs/testing/   informes de evidencia de cada ciclo de pruebas
medios/         los archivos subidos, fuera de public/ y fuera de git
archivo/        el prototipo original, como referencia
BITACORA.md     decisiones, observaciones y preguntas abiertas
```

Dos cosas sorprenden al llegar:

**El panel no es el de Payload.** La interfaz de administración de Payload se
retiró (decisión D-038) y el panel es propio: vive en
`src/app/(frontend)/admin-panel`, con su guardia única en `acceso.ts`. La ruta
`/admin` solo redirige. De `(payload)/` queda únicamente la API.

**Los archivos subidos no están en `public/`.** Están en `medios/` y
`medios/modelos/`, porque dentro de `public/` Next los servía como estáticos
sin comprobar la sesión. Payload los entrega por
`/api/<colección>/file/<nombre>`, que sí comprueba el acceso.
