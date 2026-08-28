# Evidencia de pruebas · Fase 1 · Control de acceso y subidas

**Fecha:** 2026-08-28
**Origen:** plan de desarrollo acordado en sesión; decisiones D-020, D-022 y observación O-008 de `BITACORA.md`.
**Comando de pruebas:** `npx vitest run` · **Cobertura:** `npx vitest run --coverage`

## Recorridos de usuario cubiertos

1. Como residente sin cuenta, no debo poder ver nada del contenido.
2. Como residente con cuenta recién creada y aún no activada, tampoco.
3. Como residente activo, quiero leer las fichas publicadas, pero no los borradores.
4. Como traumatólogo, quiero redactar y publicar contenido, sin poder crear ni activar cuentas.
5. Como administrador, quiero que desactivar cualquier cuenta la deje sin acceso de inmediato, incluida otra cuenta de administrador.
6. Como administrador, quiero que un archivo que no sea realmente un modelo 3D sea rechazado aunque su nombre diga `.glb`.

## Ciclo ejecutado

| Etapa | Comando | Resultado |
|---|---|---|
| ROJO | `npx vitest run` | 2 suites fallan: `Cannot find package '@/access/reglas'` y `'@/uploads/validarModelo3D'`. Sin implementación, ningún test se ejecuta. |
| VERDE | `npx vitest run` | `Test Files 2 passed (2)` · `Tests 30 passed (30)` |
| Cobertura | `npx vitest run --coverage` | Sentencias 97,36% · Ramas 96,42% · Funciones 100% · Líneas 97,22% |

Umbral exigido: 80% en las cuatro métricas. Superado.

## Un fallo que el test atrapó de verdad

La primera implementación de `nombreSeguroDeArchivo` separaba rutas sólo por barra normal.
El caso `..\..\Windows\System32\algo.glb` devolvía `..-..-Windows-System32-algo.glb`, es decir,
conservaba los saltos de directorio en un servidor Windows. La clase de caracteres estaba
escrita como `[\/]` en lugar de `[\/]`. Corregido y verificado.

## Garantías que las pruebas sostienen

| # | Qué queda garantizado | Prueba | Tipo | Resultado |
|---|---|---|---|---|
| 1 | Sin sesión no se lee contenido | `tests/unit/acceso.test.ts` › niega el acceso cuando no hay sesión | unitaria | PASA |
| 2 | Una cuenta sin activar no lee, sea cual sea su rol | › niega el acceso a una cuenta que el administrador no ha activado | unitaria | PASA |
| 3 | Desactivar a un administrador lo bloquea igual que a cualquiera | › niega el acceso a un administrador desactivado | unitaria | PASA |
| 4 | El lector no puede editar contenido | › niega la edición a un lector, aunque esté activo | unitaria | PASA |
| 5 | El editor no puede crear ni activar cuentas | › niega la administración al editor | unitaria | PASA |
| 6 | El lector nunca alcanza un borrador: lo impide la consulta, no la interfaz | › restringe al lector a lo publicado | unitaria | PASA |
| 7 | Un ejecutable renombrado a `.glb` es rechazado | `tests/unit/validarModelo3D.test.ts` › rechaza un ejecutable renombrado | unitaria | PASA |
| 8 | Un glTF de versión no soportada es rechazado | › rechaza un glTF binario de una versión que el visor no soporta | unitaria | PASA |
| 9 | Se respeta el techo de 5 MB por modelo (O-008) | › rechaza un archivo más pesado que el límite | unitaria | PASA |
| 10 | Un nombre con saltos de directorio no escapa del directorio de subidas, en Unix y en Windows | › normaliza el nombre / › neutraliza una ruta al estilo de Windows | unitaria | PASA |

## Huecos conocidos

- **Pruebas de integración: pendientes.** Requieren PostgreSQL en marcha, y el demonio de Docker no estaba disponible en esta sesión. Cubrirán que la API rechace peticiones sin sesión y que un borrador no salga por la API pública.
- **Pruebas de extremo a extremo: pendientes.** Playwright está declarado pero aún no hay interfaz que recorrer.
- La línea 67 de `validarModelo3D.ts` queda sin cubrir: es la rama de tamaño excesivo con el peso declarado por el llamador, redundante con la que sí se prueba.
