# TraumaHub

Plataforma docente de traumatología en español, para residentes, traumatólogos
y kinesiólogos. Es cerrada: nada se ve sin sesión, y las cuentas las crea y las
activa un administrador (decisión D-020).

La llevan dos personas con papeles distintos (D-008). El traumatólogo redacta y
publica desde la propia aplicación, sin depender de nadie; el desarrollador
construye el motor, el diseño y los modelos 3D. De ahí sale casi todo lo demás,
empezando por el panel de administración propio.

Nació como un prototipo navegable de un solo archivo HTML, que se conserva en
`archivo/`. De aquello quedan la estructura de los cinco módulos y cuatro fichas
clínicas ya redactadas, que por decisión D-016 no se cargan solas: la plataforma
nace vacía y el contenido se escribe desde dentro. El resto se reescribió sobre
Next.js 16, Payload CMS 3 y PostgreSQL, en contenedores.

La plataforma está construida y **vacía**. El cuello de botella del proyecto es
la redacción clínica, no el código (D-013): conviene tenerlo presente antes de
sacar conclusiones sobre rendimiento.

## Levantarlo en local

Hace falta Node.js 20.9 o superior, Docker Desktop con su servicio en marcha y
npm.

```bash
cp .env.example .env    # poner PAYLOAD_SECRET y la contraseña de la base
docker compose up -d    # solo PostgreSQL: la aplicación corre fuera del contenedor
npm install
npm run dev
```

La contraseña va en dos sitios del `.env`, `POSTGRES_PASSWORD` y dentro de
`DATABASE_URI`, y tienen que coincidir: con la primera, docker compose crea el
usuario de PostgreSQL; con la segunda se conecta la aplicación. Si difieren, la
base arranca igual y es la aplicación la que no entra. El `.env` está ignorado
por git y nunca se versiona.

Después, abrir http://localhost:3000/instalar y crear la primera cuenta. Esa
primera queda administradora y activa (D-028), y la pantalla desaparece en
cuanto existe. Las siguientes nacen desactivadas y las habilita un administrador
desde el panel.

`bash scripts/arrancar-local.sh` deja todo listo salvo el `npm run dev`: levanta
la base, espera a que acepte conexiones, instala dependencias si faltan y
regenera los tipos. Exige que el `.env` ya exista. En Windows, `iniciar.bat`
levanta la base y arranca el servidor con doble clic.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas unitarias y de integración |
| `npm run test:e2e` | Recorridos completos con Playwright |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint sobre todo el repositorio |
| `npm run generate:types` | Regenera `src/payload-types.ts` desde las colecciones |
| `npm run build` | Compilación de producción |

`npm run test:e2e` necesita antes `npx playwright install chromium`: la
instalación de dependencias no baja los navegadores, porque `package.json` no
tiene guion `postinstall`, y sin ellos el comando falla en la primera prueba.

El detalle, incluido qué hacer cuando Docker no arranca en Windows, está en
[docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md).

## Mapa del repositorio

| Carpeta | Qué hay |
|---|---|
| `src/` | La aplicación entera |
| `tests/` | `unit/` sin base de datos, `integration/` con PostgreSQL, `e2e/` con Playwright |
| `scripts/` | Operación: arranque local, instalación del servidor, despliegue, actualización, respaldo, restauración y salud |
| `docs/` | La documentación |
| `public/` | Estáticos que se sirven sin comprobar sesión, incluido `public/atlas/` con la geometría del atlas anatómico |
| `medios/` | Los archivos subidos, y los modelos 3D en `medios/modelos/`. Fuera de `public/` a propósito; su contenido no se versiona |
| `backups/` | Respaldos `base-AAAAMMDD-HHMMSS.sql.gz` y `medios-AAAAMMDD-HHMMSS.tar.gz`. Ignorada por git |
| `despliegue/` | Plantillas para convivir con las demás páginas del servidor compartido |
| `archivo/` | El prototipo original, como referencia. No se ejecuta ni se despliega |
| `.claude/` | Permisos locales del asistente de código |

`.next/`, `coverage/`, `test-results/`, `node_modules/` y `.vendor/` se generan
y no se versionan. `.vendor/` guarda el material de terceros del que se parte
para preparar el atlas; lo que viaja en el repositorio es el resultado.

| Carpeta de `src/` | Qué hay |
|---|---|
| `app/(frontend)/` | El sitio del residente y el panel propio, en `admin-panel/` |
| `app/(payload)/` | Solo la API de Payload, en `api/[...slug]/route.ts` |
| `access/` | Reglas de acceso, puras y probadas |
| `admin/` | Esquema del panel propio: qué campos tiene cada colección y cómo se editan |
| `atlas/` | Catálogo, carga y selección de piezas del atlas anatómico |
| `blocks/` | Los bloques de contenido que el autor apila y reordena |
| `collections/` | Las doce colecciones de Payload, con sus ganchos en `hooks/` |
| `components/` | Componentes de React: el sitio, el panel en `admin/` y los visores en `atlas/` |
| `lib/` | Lógica compartida: sesión, rutas, búsqueda, respaldos, encuadre, simulador |
| `migrations/` | Migraciones de esquema; en producción se aplican al arrancar |
| `uploads/` | Validación de los modelos 3D subidos: se mira la firma del archivo, no solo su extensión |

En la raíz de `src/` están `payload.config.ts`, que junta todo, y
`payload-types.ts`, que se genera y no se edita a mano.

Dos cosas sorprenden al llegar. El panel **no** es el de Payload: esa interfaz
se retiró (D-038) y el panel es propio, con su guardia única en
`src/app/(frontend)/admin-panel/acceso.ts`. Y los archivos subidos **no** están
en `public/`: allí Next los servía como estáticos, sin comprobar la sesión;
ahora los entrega Payload por `/api/<colección>/file/<nombre>`, que sí comprueba
el acceso. Esa dirección la pone Payload en el campo `url` de cada archivo, ya
con el prefijo si la plataforma vive bajo uno, y se usa tal cual. Añadírselo
otra vez en `routes.api` fue justo lo que dejó un 404 en toda imagen, todo vídeo
y todo modelo 3D del servidor: ver el comentario de `routes` en
`src/payload.config.ts`.

## Los cinco módulos

| # | Módulo | Ruta pública | Colección |
|---|---|---|---|
| 01 | Biblioteca de patologías | `/biblioteca` | `src/collections/Patologias.ts` |
| 02 | Examen físico | `/examen-fisico` | `src/collections/Maniobras.ts` |
| 03 | Técnica AO | `/tecnica-ao` | `src/collections/CasosAO.ts` |
| 04 | Simulador quirúrgico | `/simulador` | `src/collections/Cirugias.ts` |
| 05 | Lectura de imágenes | `/imagenes` | `src/collections/EstudiosIA.ts` |

Los cinco se redactan en `/admin-panel/contenido` y los cinco avisan al publicar
con el mismo gancho, `src/collections/hooks/avisarAlPublicar.ts`. El inventario
de colecciones vive en un solo sitio, `src/collections/index.ts`, que además
declara `SLUGS_DE_MODULOS` con estos cinco.

Cómo se escribe una ficha, paso a paso, está en
[docs/COMO-ESCRIBIR-UNA-FICHA.md](docs/COMO-ESCRIBIR-UNA-FICHA.md).

## La consola quirúrgica

El módulo de simulación abre un caso en un lienzo 3D y lo evalúa. El residente
enciende y apaga capas —piel, músculo, hueso—, elige instrumental de una bandeja
y ejecuta los pasos: traza la incisión sobre el modelo, reduce el fragmento
arrastrándolo y graduando la angulación, y gradúa la fuerza. La consola mide el
resultado y lo puntúa. Quedarse corto es un reintento; pasarse es una
complicación, y queda registrada.

El vocabulario con el que se escriben los casos —huesos AO, clasificaciones AO,
técnicas, fases e instrumental— son cinco colecciones que el traumatólogo edita
desde el panel, con los mismos permisos que el resto del contenido.

El convenio del que depende todo: **el modelo se exporta reducido** y el caso
declara cuánto está desplazado al empezar. La posición correcta es siempre el
cero, y lo que la consola mide es cuánto falta para llegar.

| Archivo | Qué hace |
|---|---|
| `src/lib/simulador.ts` | El motor. Los cuatro objetivos de un paso, sin interfaz |
| `src/lib/reduccion.ts` | La geometría: desplazamiento, diástasis, angulación y largo del trazo |
| `src/lib/casoQuirurgico.ts` | Aplana el documento de Payload en lo que la consola necesita |
| `src/components/simulador/LienzoQuirurgico.tsx` | El lienzo three.js: capas, trazo, arrastre y fluoroscopia |
| `src/components/simulador/ConsolaQuirurgica.tsx` | La consola: bandeja, medidas, pasos y bitácora |
| `src/collections/catalogos.ts` | Los cinco catálogos |

Cómo preparar el hueso en Blender y armar un caso está en
[docs/COMO-SUBIR-UN-MODELO.md](docs/COMO-SUBIR-UN-MODELO.md).

## Despliegue

Se clona en un Ubuntu y se ejecuta `./scripts/instalar-servidor.sh`, que instala
Docker si falta, genera los secretos, construye la imagen, levanta los
contenedores, programa el respaldo diario y comprueba que todo responda. Por
omisión sale por Tailscale, porque `scripts/comun.sh` hace
`TUNEL="${TUNEL:-tailscale}"`; para usar Cloudflare hay que decírselo a cada
guion.

Guía completa: [docs/SERVIDOR.md](docs/SERVIDOR.md).

## Documentación

| Archivo | Para qué sirve |
|---|---|
| [docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md) | Requisitos, arranque local, comandos y qué hacer si Docker no parte en Windows |
| [docs/SERVIDOR.md](docs/SERVIDOR.md) | Guía única para dejar la plataforma en un servidor Ubuntu propio: instalación, operación diaria, respaldos y qué mirar cuando algo falla |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Los tres modos de publicación según la variable `TUNEL`, lo que hace falta antes de desplegar y qué quedó verificado en el ensayo |
| [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) | Exponer el servicio con un túnel de Cloudflare, sin abrir puertos del router |
| [docs/CORREO.md](docs/CORREO.md) | Correo saliente. Sin él, quien olvide su clave depende de un administrador |
| [docs/COMO-ESCRIBIR-UNA-FICHA.md](docs/COMO-ESCRIBIR-UNA-FICHA.md) | Guía para el traumatólogo: segmentos, bloques, borrador y publicación |
| [docs/COMO-SUBIR-UN-MODELO.md](docs/COMO-SUBIR-UN-MODELO.md) | Guía para el traumatólogo: preparar el hueso en Blender y armar un caso quirúrgico paso a paso |
| [docs/testing/fase-1-acceso.tdd.md](docs/testing/fase-1-acceso.tdd.md) | Evidencia del ciclo de pruebas de la fase 1, control de acceso y subidas |
| [despliegue/paginas/LEEME.md](despliegue/paginas/LEEME.md) | Cómo encaja esta plataforma junto a las otras páginas del servidor compartido |
| [archivo/LEEME.md](archivo/LEEME.md) | Qué es el prototipo que se conserva y por qué su contenido no se cargó |

Las convenciones de trabajo están en [AGENTS.md](AGENTS.md).

## La bitácora

> **`BITACORA.md` es la memoria del proyecto. Toda decisión va ahí**, con su
> porqué y su consecuencia, buena y mala. Las entradas no se borran: se marcan
> como superadas y se enlaza la que las reemplaza.

Si algo del código parece raro, la explicación casi siempre está ahí: las
decisiones (`D-nnn`) dicen qué se eligió y por qué; las observaciones (`O-nnn`),
qué se rompió y cómo se vio. Un cambio que no deje su entrada condena al
siguiente a repetir el error.
