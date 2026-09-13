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
| `npm run test:integration` | Solo las de integración, sin permiso para omitirse |
| `npm run test:e2e` | Recorridos completos con Playwright |
| `npm run test:coverage` | Pruebas con informe de cobertura |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint sobre todo el repositorio |
| `npm run generate:types` | Regenera `src/payload-types.ts` desde las colecciones |
| `npm run build` | Compilación de producción |

`npm test` incluye las pruebas de integración porque `vitest.config.ts` las
recoge junto a las unitarias. Y si PostgreSQL no está en marcha, **fallan**: eso
cambió a propósito. Antes se omitían solas y el aviso salía por consola, donde
Vitest ni siquiera lo imprime, de modo que la suite entera daba verde con las
seis pruebas de acceso desaparecidas; son las únicas que comprueban que los
permisos llegan hasta la consulta, así que su ausencia tiene que verse.

Para trabajar sin base a sabiendas está `OMITIR_INTEGRACION=1`: con esa variable
puesta se omiten y el resultado queda verde, porque alguien lo escribió a mano.
Es una variable de entorno, y ahí Windows se porta distinto: `OMITIR_INTEGRACION=1
npm test` solo funciona en bash. En PowerShell va en su propia línea,
`$env:OMITIR_INTEGRACION = '1'`; escrita delante de la orden no llega a correr
nada, porque PowerShell toma `OMITIR_INTEGRACION=1` por el nombre del programa
(«is not recognized as a name of a cmdlet…»). Es el mismo motivo por el que
`npm run test:integration` se pone su variable con un `node -e` y no con un
prefijo: los guiones de npm los ejecuta `cmd`, que corta igual.

Lo contrario es `EXIGIR_INTEGRACION=1`, que las declara obligatorias y anula ese
permiso. Es lo que se pone `npm run test:integration` a sí mismo, y lo que trae
por su cuenta cualquier servidor de integración con `CI`.

Sobre una base **recién creada** hay que aplicarle antes el esquema con
`npm run db:migrate`: `npm run db:up` solo levanta el contenedor y las
migraciones no corren solas fuera de producción. Sin eso el fallo es
`relation "segmentos" does not exist`, que no menciona ni el esquema ni las
migraciones.

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
    (payload)/  lo que queda de la API de Payload: solo el archivo subido
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

Tres cosas sorprenden al llegar:

**El panel no es el de Payload.** La interfaz de administración de Payload se
retiró (decisión D-038) y el panel es propio: vive en
`src/app/(frontend)/admin-panel`, con su guardia única en `acceso.ts`. La ruta
`/admin` solo redirige.

**Y la API REST de Payload tampoco sigue abierta.** Retirar la interfaz dejó su
API en pie, o sea una segunda administración de los mismos datos por la que no
miraba nadie: `PATCH /api/<colección>/<id>` escribía sin pasar por las
comprobaciones del panel, `GET /api/medios?limit=500` devolvía el inventario de
archivos —borradores incluidos— a cualquier cuenta activa, y
`POST /api/usuarios/login` dejaba la cookie de sesión en `/`. De todo
`(payload)/` queda **una sola ruta**, la del archivo subido; el resto contesta
403 con el motivo escrito. El comodín que lo hace cumplir es
`src/app/(payload)/api/[...slug]/route.ts`, y la frontera la fija
`tests/unit/apiDePayload.test.ts`.

**Los archivos subidos no están en `public/`.** Están en `medios/` y
`medios/modelos/`, porque dentro de `public/` Next los servía como estáticos
sin comprobar la sesión. Payload los entrega por
`/api/<colección>/file/<nombre>`, que sí comprueba el acceso. Esa es la ruta que
quedó abierta y la que no se puede cerrar: la llevan los `<img>`, los `<video>`
y el cargador de glTF de toda la plataforma, así que cerrarla dejaría toda ficha
sin ilustraciones.
