# TraumaHub

Plataforma docente de traumatología en español, para residentes, traumatólogos
y kinesiólogos. Es cerrada: nada se ve sin sesión, y ninguna cuenta entra sin que
la active un administrador (decisión D-020). La cuenta la crea el administrador o
la pide la propia persona en `/registro`, y queda pendiente hasta que la revisen
(D-119). Sin sesión se ven solo la portada comercial y `/planes`, con el
formulario «Cotizar» que llega a la pestaña *Cotizaciones* del panel, y las
pantallas para entrar y pedir la cuenta (D-236); el contenido, nunca. Las fotos
y los textos de esas dos páginas se cambian desde *Medios de la página*, sin
tocar código (D-235). El correo que manda la plataforma está en
`docs/CORREO.md`.

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
| `npm run test:coverage` | Lo mismo, midiendo cobertura contra el umbral de `vitest.config.ts` |
| `npm run test:integration` | Solo las de acceso contra PostgreSQL, sin permiso para omitirse |
| `npm run test:e2e` | Recorridos completos con Playwright |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint sobre todo el repositorio |
| `npm run generate:types` | Regenera `src/payload-types.ts` desde las colecciones |
| `npm run build` | Compilación de producción |
| `npx tsx scripts/importar-ingesta.ts` | Importa las fichas de `data_traumahub/listos` como borradores en revisión. Sin `--ejecutar` solo comprueba (D-144) |
| `npx tsx scripts/sembrar-estructuras.ts` | Crea la ficha vacía de cada pieza del atlas en el listado de estructuras. Sin `--aplicar` solo simula; no pisa nada escrito (D-179) |
| `npx tsx scripts/pierna-derecha-en-el-caso.ts` | Exporta una preparación del atlas con la tibia partida según la fractura del caso y la pone en el caso de prueba. `--tibia izquierda`, `--nuevo "<nombre>"` (un caso nuevo, copia del de prueba), `--clasificacion A3` (la fractura del nuevo) y `--separar` (cada estructura como objeto propio). Sin `--aplicar` solo simula (D-241) |

Las pruebas de integración hablan con PostgreSQL, y la base tiene que existir
**y tener el esquema**. `npm run db:up` solo levanta el contenedor: las
migraciones no se aplican solas fuera de producción —bajo Vitest `NODE_ENV`
vale `test`, así que no corre ni el `push` de desarrollo ni las migraciones de
producción—, y quien las está poniendo hoy, sin que se note, es el `npm run dev`
de ayer. Sobre una base recién creada hay que ejecutar `npm run db:migrate`
antes de la suite; sin eso el fallo es `relation "segmentos" does not exist`, un
error que no menciona ni el esquema ni las migraciones.

Sin base, la suite **no** sale en verde. Esas pruebas son las únicas que
comprueban que la política de acceso llega hasta la consulta, así que su
ausencia se anuncia en rojo con la causa en vez de desaparecer en silencio. Dos
variables de entorno gobiernan la excepción, y no hay más:

| Variable | Para qué |
|---|---|
| `OMITIR_INTEGRACION=1` | Permiso escrito a mano para trabajar sin base: las de integración se omiten y el resultado queda verde |
| `EXIGIR_INTEGRACION=1` | Lo contrario: las declara obligatorias, y ahí el permiso anterior ya no vale. Un servidor de integración consigue lo mismo con `CI` |

`npm run test:integration` se pone `EXIGIR_INTEGRACION=1` a sí mismo, para que un
`OMITIR_INTEGRACION=1` olvidado en la shell no silencie justamente la orden cuyo
único propósito es correr esas pruebas. El rodeo con `node -e` que se ve en
`package.json` es por Windows: npm ejecuta los guiones con `cmd`, que no entiende
el prefijo `VARIABLE=1 orden`. Lo toma como el nombre del programa y corta con
`"EXIGIR_INTEGRACION" no se reconoce como un comando interno o externo`, así que
Vitest no llega a lanzarse y la orden falla sin haber comprobado nada.
`cross-env` haría lo mismo más corto, pero hoy solo está en `node_modules` como
dependencia de otro paquete, y depender de eso es depender de lo que instale un
tercero.

`npm run test:e2e` necesita antes `npx playwright install chromium`: la
instalación de dependencias no baja los navegadores, porque `package.json` no
tiene guion `postinstall`, y sin ellos el comando falla en la primera prueba.

El detalle, incluido qué hacer cuando Docker no arranca en Windows, está en
[docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md).

## Mapa del repositorio

| Carpeta | Qué hay |
|---|---|
| `src/` | La aplicación entera |
| `tests/` | `unit/` sin base de datos, `integration/` con PostgreSQL, `e2e/` con Playwright, y `guiones/`, el banco en bash de los guiones de respaldo, que corre una prueba de `unit/` (D-295) |
| `scripts/` | Operación: arranque local, instalación del servidor, despliegue, actualización, respaldo, restauración y salud |
| `docs/` | La documentación |
| `public/` | Estáticos que se sirven sin comprobar sesión, incluido `public/atlas/` con la geometría del atlas anatómico |
| `medios/` | Los archivos subidos, los modelos 3D en `medios/modelos/` y las fotos de la portada en `medios/pagina/`. Fuera de `public/` a propósito; su contenido no se versiona |
| `backups/` | Respaldos `base-AAAAMMDD-HHMMSS.sql.gz` y `medios-AAAAMMDD-HHMMSS.tar.gz`, con `.age` al final cuando van cifrados (D-295). Ignorada por git |
| `despliegue/` | Plantillas para convivir con las demás páginas del servidor compartido |
| `archivo/` | El prototipo original, como referencia. No se ejecuta ni se despliega |
| `.claude/` | Permisos locales del asistente de código |

`.next/`, `coverage/`, `test-results/`, `node_modules/` y `.vendor/` se generan
y no se versionan. `.vendor/` guarda el material de terceros del que se parte
para preparar el atlas; lo que viaja en el repositorio es el resultado.

**Regenerar el atlas ya no basta.** Las fascias no vienen en BodyParts3D: se calculan de su geometría con
`scripts/atlas/fascias/` (Python, con `numpy` y `scipy`; Blender solo para decimar) y se suman al catálogo con
`scripts/atlas/agregar-fascias.mjs`. Si se vuelve a correr `preparar.mjs`, hay que correr después
`python scripts/atlas/fascias/generar.py` (si cambió una receta o el atlas), `node scripts/atlas/agregar-fascias.mjs --aplicar` y
`node scripts/atlas/atribucion.mjs`; sin eso, el catálogo vuelve a las 2.231 piezas de origen y las fascias desaparecen
del taller y de lo que se exporta. Las decisiones están en D-218 y el plan, en P-006 de `BITACORA.md`.

Con la piel pasa lo mismo (D-224): `preparar.mjs` devuelve la de BodyParts3D, tosca y atravesada por lo de debajo.
Y las dos cosas dependen una de otra, así que **el orden importa**: la piel se empuja hasta cubrir las fascias
profundas, y la fascia superficial se calcula a partir de la piel ya hecha.

```bash
python scripts/atlas/piel/generar.py
python scripts/atlas/fascias/generar.py
node scripts/atlas/agregar-fascias.mjs --aplicar
node scripts/atlas/recalcular-piel.mjs --aplicar
python scripts/atlas/fascias/generar.py fascia-superficial
node scripts/atlas/fascias/bajo-la-piel.mjs --aplicar
node scripts/atlas/agregar-fascias.mjs --aplicar
```

`generar.py` de la piel hace la superficie lisa; `recalcular-piel.mjs` la empuja hasta cubrirlo todo, le pone la cara de
dentro, comprueba lo que exige `tests/unit/geometriaDePiel.test.ts` y no escribe si no se cumple (unos doce minutos).
`bajo-la-piel.mjs` hunde o recorta lo poco de la fascia superficial que la rejilla de `capas.py` deja asomar en los
pliegues (entre los dedos, la entrepierna, el ángulo de los ojos). La misma prueba falla si la fascia superficial asoma
por la piel, que es lo que pasa si se saltan los tres últimos pasos o el penúltimo.

**La pigmentación depende de la piel (D-227).** Lo que el exportador pinta —codos, labios, areolas, párpados— se ancla a
setenta puntos medidos sobre la piel de arriba, en `src/atlas/referenciasDelCuerpo.json`. Si la piel se regenera, hay que
volver a medirlos, y `tests/unit/pigmentacion.test.ts` falla si alguno queda a más de 3 mm de ella:

```bash
python scripts/atlas/pigmentacion/medir.py
```

**Capturas del modelo para la página y Figma (D-229).** `scripts/atlas/capturas/capas_y_cortes.py` dibuja en Blender (Cycles, fondo
transparente) las capas del cuerpo —piel, sin piel, músculos, esqueleto, vasos, órganos— y los cortes sagital, coronal y axiales
del `.blend` del atlas completo, y `portada-a-png.mjs` dibuja la portada de Figma. Los PNG van en `capturas-del-modelo/`, con su
`LEEME.md`; son del modelo del día en que se hicieron y hay que rehacerlos si cambian la piel o las fascias.

| Carpeta de `src/` | Qué hay |
|---|---|
| `app/(frontend)/` | El sitio del residente y el panel propio, en `admin-panel/` |
| `app/(payload)/` | Solo la API de Payload, en `api/[...slug]/route.ts` |
| `access/` | Reglas de acceso, puras y probadas |
| `admin/` | Esquema del panel propio: qué campos tiene cada colección y cómo se editan |
| `atlas/` | Catálogo, carga y selección de piezas del atlas anatómico |
| `blocks/` | Los bloques de contenido que el autor apila y reordena |
| `collections/` | Las treinta colecciones de Payload —veinticinco archivos más los cinco catálogos del simulador, que viven juntos en `catalogos.ts`—, con sus ganchos en `hooks/` |
| `components/` | Componentes de React: el sitio, el panel en `admin/`, los visores en `atlas/`, la portada pública y `/planes` en `portada/`, y las pantallas de entrar y pedir la cuenta en `acceso/` |
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

La primera vez que un residente entra pasa por `/bienvenida`, que le ofrece
cuatro recorridos hacia estos módulos (D-237). Lo que decide qué enseñan sus
pantallas vive en funciones puras de `src/lib`, con sus pruebas: `bienvenida.ts`,
`dondeSeQuedo.ts` (el «Continúa leyendo» del inicio), `listaDeManiobras.ts` (la
lista del examen físico), `clasificacionAO.ts` (el ejercicio de la lectura de
imágenes) y `encuadreDelSegmento.ts` (el recorte del atlas de cada tarjeta).

Cómo se escribe una ficha, paso a paso, está en
[docs/COMO-ESCRIBIR-UNA-FICHA.md](docs/COMO-ESCRIBIR-UNA-FICHA.md).

## La revisión del contenido

El contenido que llega hecho —redactado con inteligencia artificial a partir de
libros— entra **en revisión** (D-142): se guarda su versión original y, desde
ese momento, se mide cuánto se edita cada ficha y cuánto tiempo de revisión
activa le dedica cada revisor. El revisor no publica: pulsa «Listo para
publicar» y publica un administrador. Lo que llega escrito a mano no pasa por
aquí.

| Archivo | Qué hace |
|---|---|
| `src/lib/revision.ts` | Lo puro: palabras por sección, cuánto se editó, cuándo una validación es sospechosa y los umbrales |
| `src/lib/revisionServidor.ts` | Registrar una ficha en revisión, medir cada guardado, sumar el tiempo, firmar (médico y kinesiólogo, D-240), devolver, asignar |
| `src/lib/firmas.ts` | Las dos firmas de una ficha: quién puede firmar, qué falta y la huella del texto firmado (puro) |
| `src/components/admin/useSeguimientoDeRevision.ts` | El medidor del editor: tiempo abierto y activo, y por qué pestaña |
| `src/app/(frontend)/admin-panel/revision/` | «Por revisar», la cola de quien revisa |
| `src/app/(frontend)/admin-panel/auditoria/` | «Auditoría», solo administrador: gráficos, tablas y la planilla |
| `src/lib/planilla.ts` | La planilla de Excel, escrita a mano (D-143) |
| `src/lib/leerPlanilla.ts` | Su lector: lee un `.xlsx` subido, con la suma de control del ZIP comprobada (D-179) |

La ingesta de contenido entra por `registrarParaRevision`, con el libro, el
capítulo, las páginas y el lote de cada ficha.

## El listado de estructuras anatómicas

Cada pieza del atlas —2.231— tiene una ficha con nombre latino, definición, origen,
inserción, inervación, acción e irrigación, que se escribe **una vez** y sirve en el
taller, en el simulador y en el modelo exportado (D-179). La clave es el identificador
del atlas (`FJ…`), único en la base, y no una cirugía ni un caso.

| Archivo | Qué hace |
|---|---|
| `src/collections/EstructurasAnatomicas.ts` | La colección: acceso, versiones (veinte por ficha) y qué campos no se reescriben por la API |
| `src/lib/estructuras.ts` | Lo puro: campos, qué cuenta para «completa» según el sistema, estados y contador |
| `src/lib/estructurasServidor.ts` | Sincronizar con el atlas (sin pisar nada), leer, guardar sin pisar a otra persona, versiones |
| `src/lib/planillaDeEstructuras.ts` | La planilla por región y el plan de lo que cambiaría una que se sube (puro) |
| `src/lib/subirPlanillaDeEstructuras.ts` | Vista previa y aplicar: recalcula con una huella y escribe todo o nada |
| `src/app/(frontend)/admin-panel/estructuras/` | La pantalla «Estructuras» del panel |
| `src/app/(frontend)/api/estructuras/planilla/route.ts` | Descargar y subir la planilla de Excel |
| `src/components/admin/estructuras/FichaEditable.tsx` | La ficha editable: ventana del panel y pestaña «Info» del taller |

Subir una planilla nunca sobrescribe en silencio: se ve antes qué se llenaría y qué
cambiaría, una celda vacía no borra y lo ya escrito solo se reemplaza si se marca. Tras
desplegar, el administrador abre «Estructuras» y pulsa «Cargar las piezas del atlas». El
manual está en `docs/MANUAL-DE-USO.md`, sección 7b.

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

El paciente se puede poner de pie, en decúbito supino o en decúbito prono (se mueve la
vista, no el modelo), y cada instrumento hace en él lo que hace en pabellón: las pinzas de
Adson van de a dos, los separadores se apoyan en la piel o en el músculo, la tijera de
Metzenbaum corta o diseca por tensión, y la fluoroscopia enseña su imagen en un recuadro sin
tocar la escena (D-173). En «Mover», el trozo de hueso que se agarra trae flechas para moverlo
y aros para girarlo en cada eje (D-174). La fluoroscopia se acerca hasta 4× y su recuadro se
ensancha a gusto; el seguimiento del panel separa al equipo de los residentes (D-175).

El convenio del que depende todo: **el modelo se exporta reducido** y el caso
declara cuánto está desplazado al empezar. La posición correcta es siempre el
cero, y lo que la consola mide es cuánto falta para llegar.

| Archivo | Qué hace |
|---|---|
| `src/lib/simulador.ts` | El motor. Los cuatro objetivos de un paso, sin interfaz |
| `src/lib/reduccion.ts` | La geometría: desplazamiento, diástasis, angulación y largo del trazo |
| `src/lib/exposicion.ts`, `diseccionRoma.ts`, `posicionDelPaciente.ts` | Separadores y pinzas por plano, disección roma con la Metzenbaum y posición del paciente: la aritmética, sin three |
| `src/lib/casoQuirurgico.ts` | Aplana el documento de Payload en lo que la consola necesita |
| `src/components/simulador/LienzoQuirurgico.tsx` | El lienzo three.js: capas, trazo, arrastre y fluoroscopia |
| `src/components/simulador/exposicionEnLaEscena.ts` | Separadores y pinzas puestos en la escena: el labio que sostiene cada uno y las heridas que abre |
| `src/components/simulador/nodosDelModelo.ts` | Las mallas de un modelo con su `userData` (lo que el taller lee al abrirlo) y lo que cuelga de ellas sin ser pieza; sin estilos, para que lo lean también los guiones |
| `src/components/simulador/sondaDelLienzo.ts` | Solo en desarrollo: `window.__sondaDelLienzo`, para que una prueba sepa dónde cae una pieza en pantalla y a cuánto queda un separador de su labio |
| `src/components/simulador/ConsolaQuirurgica.tsx` | La consola: bandeja, medidas, pasos y bitácora |
| `src/collections/catalogos.ts` | Los cinco catálogos |

Cómo preparar el hueso en Blender y armar un caso está en
[docs/COMO-SUBIR-UN-MODELO.md](docs/COMO-SUBIR-UN-MODELO.md).

## Despliegue

Se clona en un Ubuntu y se ejecuta `./scripts/instalar-servidor.sh`, que instala
Docker si falta, genera los secretos, construye la imagen, levanta los
contenedores, programa el respaldo diario y comprueba que todo responda. Por
omisión queda como en `ved` y en Contabo: el `docker-compose.yml` más el
override de `despliegue/paginas`, sin puertos en el anfitrión y detrás del
proxy del servidor, que pone el HTTPS. Para usar Cloudflare hay que decírselo
a cada guion con `TUNEL=cloudflare` (D-223).

La imagen trae Chromium: con él el servidor imprime el PDF de «Guardar PDF»
(D-244). Fuera de Docker se busca en los sitios de siempre (Chromium, Chrome o
Edge), y `NAVEGADOR_PDF` apunta a otro si hace falta. Sin navegador, todo
funciona menos ese botón, que lo dice.

Guía completa: [docs/SERVIDOR.md](docs/SERVIDOR.md).

## Documentación

| Archivo | Para qué sirve |
|---|---|
| [docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md) | Requisitos, arranque local, comandos y qué hacer si Docker no parte en Windows |
| [docs/SERVIDOR.md](docs/SERVIDOR.md) | Guía única para dejar la plataforma en un servidor Ubuntu propio: instalación, operación diaria, respaldos y qué mirar cuando algo falla |
| [docs/SERVIDOR-WINDOWS.md](docs/SERVIDOR-WINDOWS.md) | El despliegue que hubo en Windows sin Docker, tras Tailscale Funnel y bajo un prefijo de ruta. Ese servidor se retiró al pasar a Ubuntu (D-123); sus guiones de respaldo siguen en uso para la base local de un equipo Windows |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Los dos modos de publicación según la variable `TUNEL`, lo que hace falta antes de desplegar y qué quedó verificado en el ensayo |
| [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) | Exponer el servicio con un túnel de Cloudflare, sin abrir puertos del router |
| [docs/CORREO.md](docs/CORREO.md) | Correo saliente. Sin él, quien olvide su clave depende de un administrador |
| [docs/MANUAL-DE-USO.md](docs/MANUAL-DE-USO.md) | Manual del panel para editores y administradores: qué hace cada pantalla, cuentas y permisos, y las trampas que hacen perder trabajo |
| [docs/MANUAL-DEL-EDITOR.docx](docs/MANUAL-DEL-EDITOR.docx) | Manual general en Word, con el logotipo, para quien escribe contenido en cualquier módulo: reglas de oro, fichas, revisión, estructuras, taller, simulador, comentarios y, para administradores, cuentas y auditoría |
| [docs/MANUAL-DEL-SIMULADOR-QUIRURGICO.docx](docs/MANUAL-DEL-SIMULADOR-QUIRURGICO.docx) | Manual en Word, con capturas, para quien escribe las cirugías simuladas: crear el caso, preparar las piezas y la bandeja, escribir y probar los pasos, usar cada instrumento, rayos X y fluoroscopia, copiar pasos entre cirugías y publicar |
| [docs/MANUAL-DEL-TALLER-ANATOMICO.docx](docs/MANUAL-DEL-TALLER-ANATOMICO.docx) | Manual en Word, paso a paso y con ejemplos, para editores y administradores: preparar piezas del atlas, fracturar huesos y llevarlos a las fichas |
| [docs/GUION-DE-RECORRIDO.md](docs/GUION-DE-RECORRIDO.md) | Guion para presentar la plataforma a quienes la van a llenar: una ficha de cero a publicada, en 45 minutos, más 15 solo para administradores |
| [docs/COMO-ESCRIBIR-UNA-FICHA.md](docs/COMO-ESCRIBIR-UNA-FICHA.md) | Guía para el traumatólogo: segmentos, bloques, borrador y publicación |
| [docs/COMO-SUBIR-UN-MODELO.md](docs/COMO-SUBIR-UN-MODELO.md) | Guía para el traumatólogo: preparar el hueso en Blender y armar un caso quirúrgico paso a paso |
| [docs/ESQUEMA-DE-LA-BASE-DE-DATOS.md](docs/ESQUEMA-DE-LA-BASE-DE-DATOS.md) | Foto del esquema de PostgreSQL al 21 de octubre: cómo parte Payload cada colección en tablas, el mapa de relaciones y las tablas por grupo. Para leer la base a mano; la verdad sigue siendo `src/collections` |
| [docs/DOCUMENTO-BASE-PARA-POSTULACIONES.docx](docs/DOCUMENTO-BASE-PARA-POSTULACIONES.docx) | Texto base para postular a fondos (también en [PDF](docs/DOCUMENTO-BASE-PARA-POSTULACIONES.pdf)): resumen, problema, alternativas y estado del proyecto al 18 de octubre, con lo que falta marcado «por completar» |
| [docs/marca/](docs/marca/) | Los dos logotipos originales en alta resolución, con fondo transparente |
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
