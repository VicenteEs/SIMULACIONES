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

4. Abrir http://localhost:3000/admin y crear la primera cuenta de
   administrador. Recordar marcarla como activa: una cuenta sin activar no ve
   nada (decisión D-020).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas unitarias |
| `npm run test:coverage` | Pruebas con informe de cobertura |
| `npm run typecheck` | Comprobación de tipos |
| `npm run generate:types` | Regenera `src/payload-types.ts` desde las colecciones |
| `npm run build` | Compilación de producción |

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
  blocks/       bloques de contenido reordenables
  collections/  las nueve colecciones de Payload
  uploads/      validación de archivos por su contenido real
  app/
    (payload)/  panel de administración y API
    (frontend)/ sitio que ve el residente
tests/
  unit/         pruebas sin base de datos
  integration/  pruebas que requieren PostgreSQL
  e2e/          recorridos completos con Playwright
docs/testing/   informes de evidencia de cada ciclo de pruebas
archivo/        el prototipo original, como referencia
BITACORA.md     decisiones, observaciones y preguntas abiertas
```
