# Bitácora — Plataforma docente de traumatología

Registro de decisiones y observaciones del proyecto. Una entrada por decisión,
una por observación. No se borran entradas: se marcan como superadas y se
enlaza la que las reemplaza.

- **Inicio de la bitácora:** 2026-08-28
- **Origen:** `prototipo-traumatologia_4.html`, el prototipo de un solo archivo
  con el que empezó todo (2.732 líneas, 242 KB)
- **Cómo leerla:** las decisiones (`D-nnn`) dicen qué se eligió y por qué; las
  observaciones (`O-nnn`) dicen qué se rompió y cómo se vio. Si algo del código
  parece raro, casi siempre está explicado en una de las dos.

---

## 1. Qué es esto (lectura del estado actual)

*Actualizado el 2026-09-10. Esta sección es una foto y se reescribe; lo que no
se reescribe nunca son las decisiones y las observaciones de más abajo.*

Plataforma docente de traumatología en español, cerrada, para residentes,
traumatólogos y kinesiólogos. Next.js 16 con Payload CMS 3 sobre PostgreSQL,
en contenedores. **Nada es visible sin sesión** y ninguna cuenta entra sin que
la active un administrador (D-020); desde el 2026-09-14 la cuenta también se
puede pedir en `/registro` y queda pendiente de revisión (D-119).

Nació como un prototipo navegable en un solo archivo HTML autocontenido, con el
contenido clínico escrito dentro y los gráficos generados por JavaScript. De
aquello queda la estructura de los cinco módulos y el contenido redactado; todo
lo demás se reescribió.

### Cómo está armada hoy

| Pieza | Dónde | Qué hay que saber |
|---|---|---|
| Plataforma pública | `src/app/(frontend)` | Lo que ve el residente. Cada página comprueba la sesión por su cuenta |
| Panel propio | `src/app/(frontend)/admin-panel` | Contenido, cuentas, permisos, estadísticas, respaldos y sistema. La interfaz de Payload se retiró (D-038) |
| Taller anatómico | `/admin-panel/atlas` | 2.234 piezas de BodyParts3D. Se apaga lo que estorba y se guarda como preparación con nombre (D-048) |
| Modelo de datos | `src/collections` | Doce colecciones. Payload manda aquí y solo aquí |
| Esquema del editor | `src/admin/esquema.ts` | Paralelo al de Payload, no derivado. Pruebas atan los dos (D-042) |
| Operación | `scripts/` | Despliegue, respaldo, restauración y salud, con un `LEEME` por guion |

Puede vivir bajo un prefijo (`/traumahub`) para compartir dominio y puerto con
otras páginas detrás del mismo proxy. Eso condiciona más de lo que parece: ver
`src/lib/rutas.ts`, y las observaciones O-018 y O-019, que son los dos fallos
que costó encontrar por esa razón.

### Los cinco módulos

| # | Módulo | Ruta pública | Qué es |
|---|---|---|---|
| 01 | Biblioteca de patologías | `/biblioteca` | Fichas por segmento con 6 pestañas: Definición, Mecanismo, Clasificación, Evaluación, Manejo, Rehabilitación |
| 02 | Examen físico | `/examen-fisico` | Maniobras por segmento: objetivo, técnica, qué es positivo, nota |
| 03 | Técnica AO | `/tecnica-ao` | Pasos quirúrgicos con el principio AO de cada gesto |
| 04 | Simulador quirúrgico | `/simulador` | Pabellón paso a paso, con instrumental y capas |
| 05 | Lectura de imágenes | `/imagenes` | Clasificación AO/OTA propuesta y opciones de manejo |

### La idea de fondo

Los cuatro primeros módulos son la cadena completa de una decisión clínica:
**estudio → exploración → técnica → ejecución**. El quinto cierra el circuito
por el lado de la imagen. La biblioteca y el examen físico son el contenido que
alimenta a los demás; el simulador y la lectura de imágenes son lo que
diferencia la plataforma de un libro digital.

La pestaña de **Rehabilitación** en cada ficha no es un anexo: es la puerta que
abre el producto al kinesiólogo y amplía el público sin duplicar el contenido
base.

### Estado real del contenido

Contado en la base de desarrollo el 2026-09-10:

| Colección | Documentos |
|---|---|
| Patologías | 1 |
| Maniobras, casos AO, cirugías, estudios | 0 |
| Segmentos anatómicos | 4 |
| Modelos 3D | 1 |
| Preparaciones anatómicas | 0 |
| Cuentas | 5, una por rol más las de prueba |

Conviene mirar este cuadro antes de sacar conclusiones sobre rendimiento. Casi
todo lo que parece lento en una revisión de código se apoya en un corpus
imaginario: la plataforma está construida y **vacía**. El cuello de botella del
proyecto sigue siendo la redacción clínica, no el código (D-013).

Las cuatro fichas escritas para el prototipo —fractura de diáfisis femoral (32),
fractura de radio distal (23), lesión del LCA y luxación glenohumeral— están
redactadas a alto nivel de detalle y todavía no se han cargado.

---

## 2. Decisiones

Formato: `D-nnn · fecha · estado`. Estados: **vigente**, **superada**, **en revisión**.

### D-001 · 2026-08-28 · superada por D-008 · vigente solo como pieza de presentación
**Un solo archivo HTML autocontenido para el prototipo.**
Contexto: hay que mostrar el concepto a terceros sin instalar nada.
Consecuencia buena: se envía por correo, se abre offline, no hay servidor ni
build que mantener. Consecuencia mala: 242 KB en un archivo y creciendo; cada
ficha nueva lo engorda. Ver O-005.

### D-002 · 2026-08-28 · vigente
**Todo el gráfico es SVG generado en JavaScript, no imágenes ni video.**
Consecuencia: peso mínimo, escalable, animable por capas (`opacity` y
`transform` sobre grupos con id). Es lo que permite el sistema de transparencias
del simulador y las cinco escenas de cada mecanismo. Los textos del prototipo
declaran que en la versión final esas escenas serán animación 3D real.

### D-003 · 2026-08-28 · superada por D-012
**Bilingüe español/inglés desde el diseño, no como traducción posterior.**
Cada dato lleva su par `{es, en}` y la interfaz vive en el objeto `T`.
Consecuencia: no hay deuda de internacionalización. Costo: cada ficha clínica se
escribe dos veces. Es el principal multiplicador de esfuerzo del proyecto. Ver
Q-002.

### D-004 · 2026-08-28 · vigente
**El simulador enseña por error, no por acierto.**
Cada paso tiene instrumento correcto y un rango de fuerza útil `[mín, máx]`. Por
debajo del rango la maniobra falla (`misses`), por encima produce una
complicación (`comps`), y cada desenlace tiene su texto clínico propio. El
registro quirúrgico conserva los últimos 5 eventos. Es la decisión de diseño más
valiosa del prototipo: convierte una animación en un ejercicio evaluable.

### D-005 · 2026-08-28 · vigente
**Las estructuras nobles arrancan en semitransparente** (`S.lay.nv = 1`), no
ocultas. El estudiante ve dónde está el ciático y el paquete vascular desde el
primer paso, antes de equivocarse. Es coherente con el discurso del módulo.

### D-006 · 2026-08-28 · vigente
**Advertencias de alcance visibles en tres lugares**: pie de la barra lateral,
tarjeta "Alcance de esta versión" en el inicio y banda de advertencia del módulo
de IA. Declaran sin ambigüedad: no hay backend, no se procesan DICOM reales, no
se guarda nada, no es apto para uso clínico y los textos son de demostración.
Bien resuelto y hay que mantenerlo así en cualquier versión que salga del
computador.

### D-007 · 2026-08-28 · vigente
**Las fichas sin desarrollar se muestran, no se esconden.** Aparecen como
tarjetas deshabilitadas con la etiqueta "Ficha por desarrollar". Muestran el
alcance previsto sin fingir que ya existe. Misma lógica en los casos del
simulador ("En preparación").

### D-008 · 2026-08-28 · vigente
**El prototipo pasa a ser una plataforma editable en línea con dos roles.**
Contexto: el proyecto lo llevan dos personas —un desarrollador y un
traumatólogo— y el contenido clínico no puede depender del desarrollador para
publicarse. Decisión: el traumatólogo redacta y publica desde la propia
aplicación; el desarrollador construye el motor, el diseño y los modelos 3D.
Consecuencia: el prototipo de un solo archivo (D-001) deja de ser el producto y
pasa a ser especificación visual y fuente de contenido para la migración. D-001
queda **superada** para el producto, vigente sólo como pieza de presentación.

### D-009 · 2026-08-28 · vigente
**Stack: Next.js 15 + TypeScript + Payload 3 + PostgreSQL, autoalojado en Docker.**
Alternativas descartadas: admin construido a mano (duplica la duración del
proyecto para un desarrollador solo) y CMS headless separado tipo Directus o
Strapi (más piezas que operar, vista previa en vivo más cara de conectar).
Payload aporta ya hechos: panel de administración, autenticación, roles,
gestor de medios, versionado, borradores, vista previa en vivo y campos
traducibles. Consecuencia: se ahorran del orden de cuatro a cinco meses de
trabajo a cambio de aceptar las convenciones del framework.

### D-010 · 2026-08-28 · superada por D-034
**Producción en el servidor propio, expuesto mediante Cloudflare Tunnel.**
No se abre ningún puerto del router: la IP doméstica no queda expuesta y se
obtienen HTTPS y protección de borde sin costo. Consecuencia asumida: la
disponibilidad depende de la luz y del internet residencial. Si más adelante
la plataforma tiene uso real por parte de terceros, se reevalúa mover
producción a un VPS y dejar la máquina propia para desarrollo, compresión de
modelos 3D y el futuro módulo 05.

### D-011 · 2026-08-28 · vigente
**Frontera cerrada entre contenido y diseño.**
El traumatólogo controla: bloques ilimitados y reordenables, texto rico
(negrita, cursiva, listas, encabezados, tablas, citas), imágenes con
alineación, cajas de advertencia, videos y modelos 3D. No controla: colores,
tipografías ni figuras arbitrarias, que viven en el código.
*Por qué:* un editor visual libre es un producto en sí mismo y multiplica el
plazo; además el tiempo del traumatólogo es el recurso más escaso del proyecto
y no debe gastarse en diseñar. Esta frontera es la decisión que mantiene el
proyecto viable con un solo desarrollador, y no se mueve sin registrar una
decisión que supere ésta.

### D-012 · 2026-08-28 · vigente en la decisión, corregida en los hechos el 2026-09-10
**Se redacta sólo en español.**
Consecuencia: se detiene la duplicación del costo de redacción, que era el mayor
costo oculto. El contenido inglés ya escrito en las cuatro fichas completas se
conserva y se carga en la migración; no se descarta.

*Corrección del 2026-09-10.* Esta entrada añadía «los campos quedan traducibles
desde el inicio», y el comentario de cabecera de `src/payload.config.ts` lo
repetía. No es cierto: un `grep` de `localized` en todo `src/` no devuelve un
solo resultado. Ningún campo de ninguna de las doce colecciones está marcado
como localizable. Lo que sí existe es el bloque `localization` de la
configuración, que declara los idiomas es/en, pero sin campos marcados no
guarda ni una traducción: hoy es decoración.

Que quede escrito con su consecuencia real, porque es lo contrario de lo que la
entrada prometía: **añadir el inglés sí exigirá tocar la estructura de datos.**
Habrá que marcar campo por campo y generar una migración, porque Payload crea
tablas `_locales` aparte. No es un trabajo enorme, pero no es gratis, y la
decisión de cuándo hacerlo debe tomarse sabiéndolo.

### D-013 · 2026-08-28 · vigente
**El traumatólogo empieza a escribir el día uno, no cuando la plataforma esté lista.**
El cuello de botella del proyecto es la redacción clínica, no el código: hay 4
fichas de 13 y el autor tiene consulta y pabellón. Se acuerda una plantilla de
redacción en Word o Docs con la estructura definitiva de la ficha, y él redacta
en paralelo durante las fases 1 y 2. En la fase 3 se migra lo escrito y se muda
al CMS. Consecuencia: se gana del orden de dos meses de redacción que de otro
modo se perderían esperando.

### D-014 · 2026-08-28 · vigente
**El editor guarda JSON estructurado, nunca HTML del usuario.**
El cuerpo de cada bloque se almacena como árbol de nodos de Lexical y se
renderiza con componentes propios. No existe `innerHTML` con contenido de
autor en ninguna parte de la plataforma. Consecuencia: la vía de inyección
descrita en O-003 desaparece por diseño en lugar de mitigarse con saneamiento.

### D-015 · 2026-08-28 · vigente en la intención, superada en el mecanismo por D-032
**Publicar no reescribe la pantalla de quien está leyendo.**
Al publicar se incrementa la versión del contenido y el servidor la reenvía por
SSE a los navegadores conectados, que muestran un aviso discreto de contenido
actualizado con opción de recargar. La actualización instantánea queda
reservada a la vista previa del administrador.
*Por qué:* a un residente al que se le mueve el texto a media lectura le parece
que la plataforma falla.
*Aclaración registrada:* el disparador es el botón Publicar del CMS, no un push
al repositorio. El repositorio guarda código; el contenido vive en base de datos.

*Corrección del 2026-09-10.* Esta entrada decía que «Postgres emite `NOTIFY`».
Eso no se implementó nunca: un `grep` de NOTIFY o LISTEN en `src/` no devuelve
una sola línea de código. Lo que hay es un contador en memoria del proceso
(`src/lib/publicaciones.ts`) que el flujo de eventos reenvía cada 15 segundos,
de modo que el aviso puede tardar ese tiempo en aparecer. D-032 ya lo describía
bien un mes después, sin que nadie marcara que superaba a ésta. Queda marcado.
El transporte por SSE sí es cierto; lo que no existe es el empujón desde la
base. Hará falta cuando haya más de una instancia del servidor, y no antes.

### D-016 · 2026-08-28 · vigente
**La plataforma nace con la base de datos vacía. Las cuatro fichas del prototipo no se migran.**
El traumatólogo redacta todo el contenido desde el CMS, sin material precargado.
*Por qué:* empezar limpio evita arrastrar una estructura de datos pensada para
un prototipo, y obliga a que el modelo de contenido se valide con uso real desde
la primera ficha. *Consecuencia asumida:* el trabajo de redacción bilingüe ya
hecho —diáfisis femoral, radio distal, LCA y luxación glenohumeral— no se
recupera automáticamente. El archivo del prototipo se conserva en `archivo/`
por si se quisiera rescatar ese material a mano.

### D-017 · 2026-08-28 · vigente
**El proyecto ocupa la raíz de la carpeta; el prototipo se archiva.**
`prototipo-traumatologia_4.html` pasa a `archivo/`. La bitácora permanece en la
raíz porque es documentación viva. El código de la plataforma se organiza en
`src/`, `docs/` y `scripts/`.

### D-018 · 2026-08-28 · vigente
**Repositorio git privado en GitHub: `VicenteEs/SIMULACIONES`, rama `main`.**
Puntos de control por etapa del ciclo de pruebas, historial y respaldo fuera de
la máquina de desarrollo. El despliegue en el servidor Linux se hace clonando
este repositorio, no copiando archivos a mano.

### D-019 · 2026-08-28 · vigente
**El despliegue en el servidor es un script versionado, no una secuencia manual.**
`scripts/deploy.sh` deja el servidor Linux operativo desde un clon limpio:
dependencias, contenedores, migraciones, primer administrador y túnel. *Por qué:*
un despliegue que sólo existe en la memoria de una persona no se puede repetir
ni recuperar después de un incidente.

### D-020 · 2026-08-28 · vigente · corregida el 2026-09-10 (ver D-053) · ampliada por D-119
**Nada es visible sin sesión, y las cuentas las activa el administrador.**
No hay registro abierto ni contenido público: toda lectura exige usuario
autenticado y con la cuenta marcada como activa. Consecuencia grata: la
plataforma queda fuera del alcance de buscadores mientras se construye, y el
asunto de datos personales se reduce al mínimo.

*Corrección del 2026-09-10.* Esta entrada decía que se implementaba en tres
capas: acceso por colección, **middleware** que redirige al inicio de sesión, y
comprobación en cada ruta de API. Ese middleware nunca existió: no hay
`src/middleware.ts` en el repositorio y el contorno de `(frontend)` no redirige
a nadie, solo decide si pinta la navegación. Lo que de verdad protege son dos
capas, y cada página se guarda a sí misma:

1. El control de acceso de cada colección, que Payload aplica a la API y a toda
   lectura que no pase por `overrideAccess`.
2. Una comprobación al principio de cada página. En el panel es una sola,
   `exigirPanel` (D-052); en la plataforma pública, `obtenerSesion` en cada
   `page.tsx`.

Se sirven sin sesión, a propósito y comprobado una por una: `/entrar`,
`/clave`, `/instalar`, `/creditos` y `/api/salud`. Las cuatro primeras son las
pantallas para entrar o para volver a entrar; `/creditos` cumple la atribución
que exige la licencia del atlas y no muestra contenido clínico.

Y una tercera cosa que esta entrada daba por hecha sin serlo: durante meses los
archivos subidos se sirvieron sin sesión. Ver D-053.

*Sobre los buscadores.* En el servidor compartido, `public/robots.txt` se sirve
bajo el prefijo, como `/traumahub/robots.txt`, dirección que ningún buscador
consulta: robots.txt solo se lee en la raíz del origen, y esa raíz es de otra
página. Lo que de verdad sostiene esta parte es la cabecera
`X-Robots-Tag: noindex, nofollow` de `next.config.mjs`.

### D-021 · 2026-08-28 · vigente
**El primer módulo que se construye es la Biblioteca de patologías.**
Es el módulo con más contenido y el que alimenta a los demás; su modelo de
bloques se reutiliza después en examen físico, técnica AO y simulador. Empezar
por él es lo que antes revela si la estructura de contenido resiste el uso real.

### D-022 · 2026-08-28 · vigente
**Los modelos 3D provienen de TC y RM segmentadas con MONAI, no de maquetas.**
El flujo es: imagen médica → segmentación con MONAI sobre la GPU local →
malla → decimación y compresión → `.glb` servido a la web. Es la decisión que
más diferencia esta plataforma de cualquier atlas ilustrado, y la única parte
del proyecto donde la GPU del servidor trabaja de verdad.
*Consecuencia obligatoria:* entre la malla cruda y la web hay un paso de
reducción que no es opcional. Ver O-008.

### D-023 · 2026-08-28 · vigente
**El servidor de producción es Ubuntu Server 22.04 o 24.04 LTS.**
El script de despliegue se escribe para esa base: `apt`, repositorio oficial de
Docker y `systemd`. No se soportan otras distribuciones sin registrar una
decisión que supere a ésta.

### D-024 · 2026-08-28 · vigente
**Gestor de paquetes: npm.**
`corepack enable pnpm` falla por permisos de escritura en `C:\Program Files
odejs`.
npm 11 ya está instalado y funciona bien con Payload. Se evita añadir una
herramienta más por una ganancia de velocidad que no es el cuello de botella
del proyecto.

### D-025 · 2026-08-28 · vigente
**El proyecto se construye a mano, sin `create-payload-app`.**
El generador oficial exige terminal interactiva y falla en un entorno
automatizado (`uv_tty_init returned EBADF`). Escribir la estructura a mano
tiene una ventaja propia: el control de acceso de D-020 queda escrito desde el
primer archivo en lugar de añadirse sobre una plantilla abierta por omisión.

### D-026 · 2026-08-28 · vigente
**El despliegue en producción no publica ningún puerto en el anfitrión.**
`docker-compose.prod.yml` deja la aplicación y la base en una red interna del
compose; el único camino de entrada es el contenedor de `cloudflared`, que abre
una conexión saliente. Ni siquiera el anfitrión puede alcanzar la aplicación por
un puerto local. La imagen de producción corre con un usuario sin privilegios y
se construye en varias etapas para no arrastrar el código fuente.

### D-027 · 2026-08-28 · vigente
**El despliegue respalda la base antes de tocar nada.**
`scripts/deploy.sh` vuelca la base a `backups/` antes de reconstruir, y aborta
si falta una variable de entorno o si `PAYLOAD_SECRET` conserva el valor de
ejemplo. *Por qué:* el momento en que se pierde una base de datos es siempre un
despliegue apurado, y una comprobación que falla temprano cuesta segundos
mientras que una restauración cuesta días.

### D-028 · 2026-08-28 · vigente
**El primer usuario de la plataforma nace administrador y activo.**
Toda cuenta nace lectora y desactivada por D-020, y esa regla es correcta salvo
para la primera de todas: quien instala la plataforma no tiene a nadie que lo
active, de modo que si se crea a sí mismo como lector inactivo queda encerrado
fuera de su propio panel y hay que rescatarlo a mano desde la base de datos. Un
gancho detecta que no existen cuentas y promueve esa primera. La lógica vive
aislada de Payload para poder probarla sin base de datos.

### D-029 · 2026-08-29 · vigente
**El panel de administración se muestra en español.**
Quien redacta a diario es el traumatólogo. *Consecuencia observada de
inmediato:* dos pruebas de integración se rompieron porque comprobaban el texto
del error de permiso, que ahora llega traducido. Se corrigieron para mirar el
código de estado 403, que no depende del idioma. Regla que queda fijada: una
prueba nunca debe depender de un mensaje traducible.

### D-030 · 2026-08-29 · vigente
**El despliegue se ensaya con la imagen real antes de tocar el servidor.**
Se construye la imagen de producción, se levanta el conjunto completo en un
proyecto Docker aislado y se comprueban cinco cosas: que la aplicación no corre
como root, que la base no publica puerto en el anfitrión, que la API responde
403 sin sesión, que se prohíbe la indexación y que llegan las cabeceras de
seguridad. Recién entonces se despliega. *Por qué:* el ensayo destapó tres
fallos que ni las pruebas ni el modo desarrollo mostraban. Ver O-011.

### D-031 · 2026-08-29 · vigente
**La vista previa de rol solo baja privilegios, nunca los sube.**
El conmutador «ver como residente» guarda el rol simulado en una cookie, y la
cookie la puede escribir cualquiera desde el navegador. Por eso la validación
ocurre en el servidor y la jerarquía es estricta: un lector que envíe
`rol=admin` sigue siendo lector. Sin esa comprobación, un conmutador de
comodidad se convertiría en una escalada de privilegios.
*Detalle que la hace útil:* el rol efectivo se pasa a las consultas, de modo que
el filtrado lo hace la base y la vista previa enseña exactamente lo que el
residente recibiría, no una imitación dibujada por la página.

### D-032 · 2026-08-29 · vigente
**Publicar avisa, no recarga.**
Al publicar se incrementa una versión que los navegadores reciben por un flujo
de eventos, y aparece un aviso discreto con la opción de recargar. La página
nunca se recarga sola. *Por qué:* a un residente que está leyendo no se le mueve
el texto bajo los ojos; eso se percibe como una avería y no como una mejora.
Guardar un borrador no avisa a nadie: solo la publicación.
*Límite conocido:* el contador vive en memoria del proceso. Con una sola
instancia basta; si algún día hay varias, hará falta un canal compartido y el
`LISTEN/NOTIFY` de PostgreSQL es el camino natural.

### D-033 · 2026-08-29 · vigente
**El instrumental del simulador se deduce de los pasos.**
La lista de instrumentos disponibles se arma con los que aparecen en el guion,
en lugar de mantenerla aparte. Así el autor no puede dejar dos listas
desincronizadas ni ofrecer un instrumento que ningún paso admite.

### D-034 · 2026-08-29 · vigente · supera a D-010
**El túnel de producción es Tailscale, no Cloudflare.**
El servidor ya publica varios servicios por Tailscale y se mantiene esa vía por
coherencia operativa: una sola herramienta que administrar en lugar de dos.
Cloudflare queda documentado y soportado en el código para cuando exista un
dominio propio.

*Diferencia técnica que hay que tener presente:* con Cloudflare el túnel corre
como contenedor dentro de la red del compose, de modo que la aplicación no
publica **ningún** puerto en el anfitrión. Con Tailscale el demonio corre en el
anfitrión, fuera de esa red, así que la aplicación debe publicar un puerto para
que `tailscale serve` lo alcance. Ese puerto se publica en `127.0.0.1` y nunca
en `0.0.0.0`: queda accesible para el propio servidor y para Tailscale, y sigue
invisible desde la red local y desde internet.

*Cómo se elige:* `scripts/deploy.sh` usa Tailscale por omisión y acepta
`TUNEL=cloudflare` para la otra vía. Cada uno con su archivo de compose.

### D-035 · 2026-08-31 · vigente
**Sin segundo factor por ahora.**
Se descarta el TOTP que preveía la fase 1. El acceso queda protegido por
contraseña con bloqueo tras cinco intentos, cuentas que un administrador debe
activar y, cuando exista dominio, la puerta adicional de Cloudflare Access.
*Riesgo asumido:* si una contraseña de administrador se filtra, no hay segunda
barrera. Conviene reconsiderarlo antes de dar de alta a residentes ajenos al
equipo.

### D-036 · 2026-08-31 · vigente · corregida el 2026-09-10
**El respaldo diario se programa solo al instalar.**
`scripts/respaldar.sh` vuelca base y archivos subidos, descarta lo anterior a
treinta días y aborta si el volcado sale sospechosamente pequeño.
`scripts/restaurar.sh` hace el camino inverso, pero exige escribir RESTAURAR y
respalda el estado actual antes de sobrescribir nada.
*Probado de verdad:* el respaldo se ejecutó contra la base de desarrollo y se
verificó su integridad; no es un script que solo parezca correcto.

*Corrección del 2026-09-10.* Esta entrada decía que quien lo programa es
`scripts/deploy.sh`. No programa nada: en sus 150 líneas no aparece `crontab`,
`systemd` ni `.timer`. Quien lo hace es `scripts/instalar-servidor.sh`, que
escribe un temporizador de systemd a las 03:00 —con `Persistent=true`, para que
un servidor apagado a esa hora respalde al encender— y, si no hay systemd, cae
a una línea de cron. Importa saber cuál de los dos, porque quien busque el
respaldo programado en el guion equivocado concluirá que no existe.

*Y una promesa que no se cumplía.* Decía «hace el camino inverso», y hasta el
2026-09-10 la restauración solo devolvía la base: los archivos subidos se
respaldaban desde el primer día y no se restauraban nunca. Una base restaurada
dejaba cada ficha con las imágenes rotas y los modelos ausentes, que es justo
lo irreemplazable: la base se puede volver a escribir, una resonancia segmentada
no. Ahora `restaurar.sh` restaura los dos, y busca el respaldo de medios de la
misma marca de tiempo que el volcado, porque medios de otro día contra una base
de hoy deja documentos apuntando a archivos que no existen.

### D-037 · 2026-08-31 · vigente
**El encuadre de un modelo 3D se ajusta arrastrando, no escribiendo números.**
Un componente propio del panel muestra el modelo, deja girarlo con el ratón y
escribe los valores en el formulario al pulsar «Capturar encuadre». *Por qué:*
pedirle al traumatólogo que adivine que la escala es 1,4 y el giro 35 grados, y
que guarde para ver el resultado, era exactamente lo que R5 pedía evitar.


### D-038 · 2026-09-06 · vigente · supera la parte de interfaz de D-025
**La administración es propia; de Payload solo queda el motor de datos.**
Se retiró la interfaz de Payload (`@payloadcms/next/views`) y con ella la ruta
`/admin`, que hoy solo redirige. El panel entero —listados, editor de fichas,
editor de bloques, editor de texto con formato, medios, cuentas, permisos,
actividad, estadísticas, respaldos y estado del sistema— vive en
`/admin-panel`, y las pantallas de sesión en `/entrar`, `/clave` e `/instalar`.

*Por qué:* dos administraciones sobre los mismos datos acaban mostrando cosas
distintas, y la de Payload hablaba otro idioma visual, no conocía los permisos
por módulo ni podía ofrecer respaldos ni estadísticas. *Coste asumido:* cada
campo nuevo hay que describirlo en `src/admin/esquema.ts` además de en la
colección; `tests/unit/esquema.test.ts` comprueba que los dos no se separen.
*Lo que NO se reescribió:* el almacenamiento, las versiones, el control de
acceso, el cifrado de contraseñas y el formato del texto rico siguen siendo de
Payload. La cáscara es propia; el motor no.

### D-039 · 2026-09-06 · vigente
**El contenido rico se sigue guardando en el formato de Lexical.**
El editor propio trabaja con un modelo intermedio de párrafos y fragmentos, y
`src/lib/textoRico.ts` traduce en las dos direcciones. *Por qué:* cambiar el
formato de almacenamiento habría obligado a migrar todo lo escrito y a rehacer
el renderizador público, que pinta el árbol con componentes propios y sin
`dangerouslySetInnerHTML`. Esa promesa —el contenido del autor es texto, nunca
marcado— se mantiene intacta, y el editor la respeta: escribe en el DOM con
`createTextNode`, y lo que se pega entra como texto llano.

### D-040 · 2026-09-06 · vigente · precisada por D-107: editar un módulo exige verlo
**Los permisos tienen dos capas: el rol dice qué, los módulos dicen sobre qué.**
Sobre los tres roles se añadió una lista opcional de módulos visibles y otra de
módulos editables por cuenta. La capa de módulos solo restringe, nunca amplía.
*Regla que hay que tener presente:* una lista vacía significa **todos**, no
ninguno; es lo que evita que una cuenta recién creada no vea nada sin que se
entienda por qué, y obliga a que restringir sea un acto deliberado.

### D-041 · 2026-09-06 · vigente
**La paleta sale del logotipo.**
El sistema visual pasa del verde quirúrgico al azul de TraumaHub: el marino del
wordmark, el azul del libro y el cian de los nodos. Los tokens se renombraron
de `--campo*` a `--marca*`. El ámbar y el rojo se quedan fuera de la familia a
propósito: si todo es azul menos lo que exige atención, lo que exige atención
se ve sin leer nada.

### D-042 · 2026-09-06 · vigente
**Al eliminar una cuenta, su actividad se borra y sus comentarios se conservan
sin autor.**
Antes el borrado fallaba con un error de la base en cuanto la persona había
abierto una ficha. *Por qué así:* la actividad es seguimiento de lectura de
alguien concreto y sin esa persona no significa nada; los comentarios son
observaciones sobre el contenido y valen por lo que dicen, no por quién las
dijo. Borrarlos castigaría al contenido por un cambio en el personal.


### D-043 · 2026-09-06 · vigente · matiza a D-011
**El editor de texto es TipTap, y lo que se guarda sigue siendo Lexical.**
Se adopta el mismo editor que ya usa la página de cursos del equipo, para que
escribir en las dos sea la misma experiencia y no haya que aprender dos cosas.
La barra trae deshacer y rehacer, negrita, cursiva, subrayado, tachado, tres
niveles de encabezado, viñetas, lista numerada, cita, las cuatro alineaciones,
enlace y quitar formato.

*Lo que no trae, y es deliberado:* imagen y tabla. La plataforma ya tiene
bloques de Imagen, Video, Tabla de clasificación y Modelo 3D, que se presentan
mejor dentro de una ficha que un archivo suelto en mitad de un párrafo, y
tenerlos en los dos sitios daría dos formas de hacer lo mismo con resultados
distintos.

*Lo que no cambia:* el almacenamiento. `src/lib/textoRico.ts` traduce entre el
documento de TipTap y el árbol de Lexical en las dos direcciones. Así el
renderizador público sigue pintando el contenido con componentes propios y sin
`dangerouslySetInnerHTML`, que es lo que impide que un autor introduzca
comportamiento en la página, y no hubo que migrar nada de lo ya escrito.

### D-044 · 2026-09-06 · vigente
**Los campos largos también tienen formato.**
La técnica, el positivo y la nota de una maniobra; el procedimiento de un caso
AO y el resumen de una cirugía; y la descripción y la nota de cada paso dejan
de ser un área de texto plano. *Por qué:* son textos de párrafos, con pasos
enumerados y términos que conviene destacar, y escribirlos sin formato obligaba
a inventar convenciones con guiones y mayúsculas.

*Coste:* cambia el tipo de la columna en PostgreSQL, de texto a `jsonb`, y ese
cambio no lo puede hacer el arranque solo. Para eso está
`scripts/migrar-a-texto-rico.ts`, que rescata lo escrito, cambia el tipo y lo
devuelve convertido en párrafos.

### D-045 · 2026-09-06 · vigente
**La marca visible es TraumaHub.**
El logotipo dice TraumaHub y la barra decía «Traumatología» al lado: dos
nombres compitiendo en el mismo sitio. Se adopta el del logotipo como nombre
visible y «Plataforma docente de traumatología» queda como descripción. En la
barra se usa la marca sola —`icon.png`—, porque `logo.png` ya lleva el nombre
escrito y ponerlo junto a un texto lo repetía.


### D-046 · 2026-09-06 · vigente · matiza a D-034
**En el servidor compartido, la plataforma cuelga de `/traumahub`.**
El servidor `ved` sirve varias páginas tras un mismo Nginx Proxy Manager,
detrás de un Funnel de Tailscale en el 10000. La raíz es de APCE, así que
TraumaHub se monta bajo un prefijo, y su API queda en `/traumahub/api` sin
chocar con el `/api` que ya usa APCE.

*Cómo:* `basePath` de Next, fijado al compilar mediante el argumento
`BASE_PATH` del Dockerfile. Lo que Next no prefija solo —imágenes escritas a
mano, `fetch`, el flujo de eventos— pasa por `ruta()` de `src/lib/rutas.ts`.

*Por qué todo relativo:* si un enlace fuera absoluto, mandaría al mismo dominio
**sin el puerto**, y en el 443 no hay nada. Manteniéndolo relativo, el
navegador nunca sale del origen por el que entró.

*La ruta del proxy* se da de alta como fragmento en
`data/nginx/custom/server_proxy.conf` y no desde el panel, para no tocar la
configuración de las páginas que ya funcionan. El destino va en una variable a
propósito: con un `proxy_pass` literal, un TraumaHub caído impediría arrancar a
nginx y se caerían todas las demás.

### D-047 · 2026-09-06 · vigente
**El esquema de producción se crea con migraciones, no con `push`.**
El primer despliegue levantó la aplicación contra una base de cero tablas: el
`push` de Drizzle solo actúa en desarrollo y el proyecto no tenía migraciones.
Se congeló el esquema en `src/migrations` y se le pasa al adaptador como
`prodMigrations`, de modo que la imagen aplica al arrancar lo que falte.
*Consecuencia que hay que recordar:* en desarrollo sigue mandando el `push`, y
cada cambio de esquema hay que congelarlo con `npx payload migrate:create`.


### D-048 · 2026-09-10 · vigente
**Una «copia» del cuerpo es una selección de piezas, no geometría duplicada.**
El taller anatómico deja abrir el atlas completo, apagar lo que estorbe y
guardar el resto como una *preparación* que después se inserta en una ficha.
Esa preparación guarda **qué piezas sobreviven**, no una copia de las mallas.

*Por qué así:* con una selección, «el original se mantiene» deja de ser una
promesa de la interfaz y pasa a ser estructural —el atlas es material estático y
no existe ninguna acción de servidor capaz de escribirlo—; borrar se vuelve
reversible, porque la pieza que se quitó nunca se perdió; preparar una tibia
ocupa cuatro identificadores en vez de decenas de megabytes; y el navegador
descarga el atlas una sola vez para todas las preparaciones de todas las fichas.

*Coste asumido:* una preparación no puede reutilizar el bloque de Modelo 3D,
que exige un archivo subido. Hubo que añadir un bloque propio a los dos
esquemas paralelos y un visor de solo lectura.

### D-049 · 2026-09-10 · vigente · acota a O-008
**El atlas tiene su propio presupuesto de rendimiento.**
O-008 fija de 50.000 a 150.000 triángulos y menos de 5 MB por modelo. El atlas
son 2,29 millones de triángulos y 31 MB. No es una contradicción sino un caso
distinto, y conviene dejarlo escrito: aquel presupuesto rige para los modelos
que se suben por ficha y se cargan dentro de una lección; el atlas es material
compartido, se dibuja en **quince llamadas** —una por sistema, no una por
pieza—, se sirve con caché permanente y solo se descargan los paquetes que
contienen las piezas que se van a ver.

### D-050 · 2026-09-10 · vigente · matizada el mismo día
**La región anatómica se deduce en dos pasos, y se distingue cuál se usó.**
BodyParts3D clasifica por sistema pero no por región, y «déjame solo la tibia»
es una pregunta de región. Se resuelve primero con los conceptos FMA del propio
atlas —`right lower limb` y compañía, que son anatomía verificable— y lo que
queda fuera cae en una regla sobre la caja envolvente. Cada pieza queda marcada
con cuál de los dos caminos la clasificó, y el árbol muestra las estimadas con
una marca: presentar una estimación como un dato es lo que no se puede hacer en
material clínico.

*Matiz del 2026-09-10, contado sobre `public/atlas/catalogo.json`.* La entrada
decía «sobre todo vasos y nervios», y eso hace pensar en una excepción. No lo
es: de las 2.234 piezas, **1.359 tienen la región deducida, el 60,8 %**. Solo
875 vienen del concepto anatómico. Vasos y nervios son 774 de esas 1.359, poco
más de la mitad; el segundo grupo son los músculos, de los que están estimados
345 de 402, el 86 %.

Eso no invalida la decisión, y conviene decir por qué: la marca del árbol
cumple exactamente para esto. Pero cambia cómo hay que leerla. La regla no es
un remiendo para unos pocos casos raros, es el camino por el que pasa la
mayoría del atlas, y el día que alguien se plantee afinarla debe saber que está
tocando seis de cada diez piezas y no unas cuantas arterias.

*Calibración:* la regla mira la **separación lateral** antes que la altura.
Medido sobre los propios conceptos, con los brazos caídos la mano queda a
0,74–0,86 m, más abajo que buena parte del muslo; lo que nunca se solapa es la
distancia al eje —brazo 0,22–0,32 m frente a pierna 0,07–0,17 m.


### D-051 · 2026-09-10 · vigente
**Una sola guardia para las páginas del panel, y el editor entra de verdad.**
La comprobación de acceso estaba copiada en las doce páginas del panel y había
divergido: casi todas exigían `rol === 'admin'`, incluidas las cuatro de la
sección «Trabajo» que la barra lateral le ofrece al editor, y algunas se habían
olvidado de mirar `activo`. Se sustituye por `exigirPanel('editor' | 'admin')`
en `src/app/(frontend)/admin-panel/acceso.ts`, con `exigirPanelPara(coleccion)`
para lo que además depende de los permisos por módulo.

*Por qué importaba más de lo que parece.* El rol de editor era inalcanzable
desde la interfaz. El traumatólogo entraba al panel, veía «Contenido», pulsaba y
volvía al inicio sin una palabra de explicación. Las acciones de servidor lo
aceptaban perfectamente, así que el sistema de permisos por módulo que existía
desde D-040 no lo había podido usar nadie. Un fallo que no da error y solo
devuelve a la portada se lee como «esto no es para mí», no como una avería.

*Y los permisos por módulo llegan a las páginas.* Antes solo los aplicaban las
acciones: un editor restringido veía el módulo ajeno en el listado, abría la
ficha, la rellenaba entera y el «no tiene permiso» le llegaba al pulsar guardar.

### D-052 · 2026-09-10 · vigente
**Los cinco módulos avisan al publicar, y a cada cuenta se le cuenta lo suyo.**
El gancho que avisa estaba escrito a mano dentro de la colección de patologías y
las otras cuatro no lo tenían: publicar una maniobra, un caso AO, una cirugía o
un estudio no interrumpía a nadie. Ahora es un gancho compartido y **sin
parámetros**: el módulo y el campo que da título salen de la propia colección,
que es justo lo que impedía copiar el de patologías —cuatro módulos titulan con
`nombre` y los casos AO con `titulo`—. Añadir un módulo es ponerle la línea, y
una prueba lo vigila.

*Lo que apareció al hacerlo.* Si el aviso dice de qué módulo viene, un lector
con `modulosVisibles` restringido se entera de que se publicó algo que no puede
ver, y al recargar no encuentra nada. Así que el registro se guarda por módulo y
el flujo filtra con `puedeVerModulo` antes de contar nada (D-020). Efecto útil
de paso: a quien no ve ese módulo tampoco se le mueve la versión.

### D-053 · 2026-09-10 · vigente · corrige un incumplimiento de D-020
**Los archivos subidos viven fuera de `public/`.**
Payload ya servía cada archivo por una ruta con control de acceso —
`<api>/<colección>/file/<nombre>`, que ejecuta el `access.read` de la colección
y responde 403 sin sesión—, pero `staticDir` apuntaba dentro de `public/`, así
que Next servía además una copia idéntica en `/media/<nombre>` sin preguntar
nada a nadie. Comprobado con `curl`: 200 y 76.232 bytes sin una sola cookie.
Cualquiera con la dirección de una radiografía la descargaba sin entrar.

*Por qué nadie lo vio.* El control de acceso de la colección estaba bien puesto
y protegía el registro en la base. Lo que no protegía era el archivo en disco,
y esa distinción no se ve leyendo la colección: hay que saber que `public/` de
Next es un directorio servido tal cual. En producción es peor de lo que parece,
porque Next lee la lista de `public/` una vez al arrancar: quedaba expuesto todo
lo subido antes del último arranque, que tras cualquier despliegue es todo.

*Consecuencia operativa.* La carpeta pasa a `medios/`, el volumen se monta en
`/app/medios` y el respaldo empaqueta desde ahí. Las fichas ya escritas no
necesitan ninguna migración: el campo `url` de Payload es virtual y se recalcula
en cada lectura. Los archivos se sirven con `private, max-age=3600,
must-revalidate` y `Vary: Cookie`: sin cabecera, cada imagen se volvía a pedir
en cada página; con `public`, un proxy compartido se la habría dado a quien no
tiene sesión, deshaciendo lo que se acababa de cerrar.

### D-054 · 2026-09-10 · vigente · supera a D-037
**El encuadre de un modelo 3D se elige en el mismo visor que ve el residente.**
D-037 decidió esto mismo en 2026-08-31 y se implementó como un componente de la
interfaz de administración de Payload. Al retirarla (D-038) el editor dejó de
renderizarse, y nadie lo notó: el texto de ayuda siguió pidiendo «gire el modelo
y pulse capturar» durante meses mientras en pantalla solo había cinco casillas
numéricas y ningún botón que pulsar.

El editor nuevo es del panel propio y usa **el mismo componente** que la ficha
del residente, no una imitación. Una vista previa que no coincide con el
resultado es peor que no tener editor: engaña con confianza.

*Lo que apareció al mirarlo de cerca.* Dos de los cinco números no hacían nada.
El visor envolvía el modelo en `Bounds`, cuyo `reset()` calcula la distancia
desde la caja del modelo y solo conserva la *dirección* de la cámara: descartaba
`distanciaCamara` sin decirlo, y como la caja crece con el modelo, `escala` se
cancelaba contra esa distancia recalculada. `Bounds` se conserva solo para las
fichas antiguas, que no tienen encuadre guardado y dependen de que algo las
encuadre por ellas.

*Y una lección sobre dónde poner la aritmética.* El cálculo del encuadre vive
aparte, en `src/lib/encuadre.ts`, porque es la parte que puede estar mal sin que
se note: un signo cambiado da números de aspecto razonable y le enseña al
residente el hueso del revés. Al escribir su prueba apareció un fallo recién
introducido: la escala se redondeaba a dos decimales, y un modelo en milímetros
necesita 0,002, que redondeado es cero. El botón que existe para hacerlo visible
lo hacía invisible.

### D-055 · 2026-09-10 · vigente
**El taller anatómico es de escritorio, y lo dice.**
Necesita tres cosas a la vez —el árbol de 2.234 piezas, el visor y la ficha de
la preparación— y en un teléfono no caben ni apiladas: el visor quedaba en 152
píxeles de alto, que no da para distinguir una tibia de un peroné. En vez de
fingir que funciona, en pantallas de menos de 900 píxeles se muestra un mensaje
que dice que hace falta un computador.

Esto **no** toca el visor de una preparación dentro de una ficha: el residente
sí lee fichas en el móvil, y ahí girar un hueso con el dedo funciona bien. Son
dos componentes distintos y conviene no confundirlos al tocar los estilos.

*Y el trabajo sin guardar se avisa.* Apagar piezas hasta dejar la tibia sola es
media hora, y se perdía en silencio: «Cuerpo completo» reiniciaba sin preguntar,
abrir otra preparación pisaba la anterior, y cerrar la pestaña se lo llevaba.
Nada de eso daba error, que es lo que lo hacía peor.

### D-056 · 2026-09-10 · vigente
**La plataforma pasa el linter, y las migraciones tienen quien las vigile.**
`npm run lint` ejecutaba `next lint`, orden que Next 16 retiró, así que fallaba
con «no such directory: lint»; ESLint no estaba ni instalado. Y como `next
build` tampoco pasa ya el linter, la plataforma llevaba tiempo sin revisar una
sola regla: los `eslint-disable` repartidos por el código no desactivaban nada,
porque no había nadie a quien desactivar. Se instala con el conjunto
`core-web-vitals` y las reglas se dejan como vienen: bajar el listón para que
salga verde el primer día convierte al linter en un adorno.

*Y la deriva del esquema.* En desarrollo Payload ajusta la base al vuelo, así
que un campo nuevo sin migración funciona en el portátil y falla al desplegar, o
peor, arranca y deja de guardar ese campo en silencio. Ya pasó una vez: la base
del servidor arrancó con cero tablas. `tests/unit/migraciones.test.ts` lee la
instantánea que Payload escribe junto a cada migración y comprueba que describa
lo que declaran las colecciones hoy. Se verificó que falla al añadir un campo
sin migración; una prueba que nunca falla no protege de nada.

*Y las pruebas dejan de tocar la base de desarrollo.* El `push` de Drizzle, si
cree que puede perder datos, **pregunta** y se queda esperando. Una suite que
espera una respuesta que nadie va a dar no falla: se cuelga.


### D-057 · 2026-09-10 · vigente
**El vocabulario del simulador lo escribe el traumatólogo, no el programador.**
Los pasos de una cirugía nombraban su instrumento en un campo de texto libre.
Escrito así, «Bisturí N°10», «bisturí n10» y «Bisturi 10» son tres instrumentos
distintos para la máquina y el mismo para quien lo escribe, de modo que la
bandeja se llena de duplicados y ningún caso se puede comparar con otro. Se
crean cinco catálogos —huesos AO, clasificaciones AO, técnicas, fases e
instrumental— y los pasos pasan a **apuntar** a ellos.

La parte que importa no es la normalización, es de quién son los catálogos: se
editan desde el panel como cualquier otra colección, con los mismos permisos por
módulo. El médico que sube la data añade un instrumento nuevo cuando lo necesita,
sin pedirle nada a nadie y sin tocar código. Un vocabulario cerrado que hay que
recompilar para ampliarlo se queda corto la primera semana y entonces vuelve el
texto libre por la puerta de atrás.

*Consecuencia:* añadir un campo al vocabulario ahora es una migración, no una
línea. A cambio, el código AO de un caso se compone solo —el número del hueso y
el de la clasificación, «42» y «A2», dan «42-A2»— y la bandeja de cada caso sale
de sus propios pasos, sin escribirla aparte.

### D-058 · 2026-09-10 · vigente
**El modelo se exporta reducido y el caso declara cuánto está desplazado.**
Hacía falta un convenio para saber dónde está «bien». La alternativa era exportar
dos estados del hueso —roto y reducido— y hacerlos coincidir, que es trabajo
manual del médico para resolver un problema del código. Se elige el contrario: el
traumatólogo exporta el hueso **en su sitio anatómico** y escribe en el caso
cuántos milímetros y grados lo separa de ahí al empezar. La posición correcta es
siempre el cero, y lo que la consola mide es cuánto falta.

*Consecuencia:* el mismo modelo sirve para varios casos con desplazamientos
distintos, y cambiar la dificultad de un caso es cambiar seis números, no
reexportar en Blender. A cambio, el modelo tiene que estar bien centrado: si el
hueso exportado no está reducido, todo el caso mide contra un cero equivocado y
los números salen creíbles y falsos. Por eso `docs/COMO-SUBIR-UN-MODELO.md`
empieza por ahí.

### D-059 · 2026-09-10 · vigente
**Cada paso declara qué se le mide, y son cuatro cosas distintas.**
La primera versión medía siempre lo mismo, una fuerza en newtons, y obligaba a
inventar un rango de fuerza para el gesto de trazar una incisión. Los cuatro
objetivos son elegir el instrumento, trazar con la longitud correcta, reducir
dentro de tolerancia y aplicar la fuerza correcta. Los cuatro exigen además el
instrumento en la mano.

La distinción que sostiene el módulo es la que separa el fallo inocuo del que
deja secuelas: quedarse corto es reintento, pasarse es **complicación** y queda
registrada. Un simulador en el que equivocarse no cuesta nada no enseña nada.

*Consecuencia:* el motor vive en `src/lib/simulador.ts`, aislado de la interfaz y
probado entero sin navegador. Y cuando un paso antiguo no declara objetivo, se
**deduce** de lo que sí declara: un rango de fuerza guardado y no evaluado sería
una regla que el residente cree estar cumpliendo.


### D-060 · 2026-09-12 · vigente · su deuda de respaldo, cerrada por D-113
**La plataforma corre también en un Windows de casa, sin Docker y tras Tailscale
Funnel.**
El servidor de referencia sigue siendo el Ubuntu con Docker de `docs/SERVIDOR.md`.
Pero la máquina disponible —faraday, alias `blanco`— es un Windows 11 sin Docker,
sin WSL y sin PostgreSQL, y no había razón para instalar una capa de
virtualización entera solo para arrancar un proceso de Node y una base. Se monta
nativo: PostgreSQL desde los binarios en ZIP, la aplicación como servicio con
NSSM, y el túnel con Tailscale Funnel, que la máquina ya tenía.

*Consecuencia buena:* la publicación no necesita dominio, ni certificado, ni
abrir un puerto del router. Funnel emite el certificado y entra por localhost, y
tanto la aplicación como la base escuchan solo en `127.0.0.1`.

*Consecuencia mala, y hay que decirla:* ahora existen dos caminos de despliegue y
solo uno está automatizado. Los scripts `.sh` del repositorio —instalar, desplegar,
respaldar, salud— suponen bash y Docker, así que en Windows no corre ninguno.
Mientras eso siga así, **este despliegue no tiene respaldo automático**, que es la
deuda concreta que deja esta decisión. Está anotada en `docs/SERVIDOR-WINDOWS.md`
junto al volcado a mano que la tapa entretanto.

*Y una advertencia que no es técnica:* Funnel publica en internet abierto, no en
la red privada de Tailscale. Lo que protege el contenido es que sin sesión no se
ve nada (D-020), no el túnel.


### D-061 · 2026-09-12 · vigente
**Las piezas de un caso se señalan en el modelo, no se escriben de memoria.**
El autor de un caso tenía que teclear el nombre exacto de cada objeto de Blender
—`tibia_distal`, con guion bajo y sin tilde— y los seis números del
desplazamiento inicial. Las dos cosas fallan en silencio: una letra distinta deja
una capa que no se enciende ni se apaga, y un desplazamiento imaginado da una
fractura que no se parece a la que se quería enseñar. Ninguna de las dos da
error, y por eso ninguna se encuentra mirando la pantalla.

El taller de piezas abre el modelo **que ya está subido** dentro del propio
formulario. Se pincha cada trozo y se añade con su nombre exacto; se le pone su
papel; se aísla para comprobar que era ese; y el desplazamiento se captura
arrastrando el fragmento, igual que el encuadre de una ficha. El visor es el
mismo que ve el residente, no una imitación.

*Consecuencia:* un modelo subido una vez sirve para muchos casos sin volver a
Blender para nada que no sea partir el hueso. Reutilizar ya se podía —el campo
siempre fue un desplegable— pero describir el archivo otra vez en cada caso era
el trabajo que lo hacía parecer imposible.

*Lo que sigue exigiendo Blender:* separar los trozos. La plataforma no corta
geometría, y la postura no cambia. Señalar un nodo y moverlo es trivial; una
operación booleana sobre malla de hueso esponjoso es otro proyecto, y uno cuyo
resultado no está claro que sirva para enseñar.


### D-062 · 2026-09-12 · vigente
**La bandeja de un caso se declara, y sirve sobre todo para poner señuelos.**
Hasta ahora la bandeja se deducía sola de los pasos: siete pasos con siete
instrumentos daban una bandeja de siete botones, **todos correctos en algún
momento**. Eso convierte el último paso en un acertijo por eliminación, porque
queda un solo botón sin usar. Y deja sin sentido el mensaje de error del motor,
que dice el nombre del instrumento elegido «porque en la bandeja hay
instrumentos que se parecen»: hoy no los hay.

El caso puede declarar ahora su bandeja, y lo que se gana no es control sino
**instrumentos que no usa ningún paso** —el Hohmann, el Farabeuf, la tijera de
Mayo— que en pabellón estarían ahí. Elegir vuelve a ser una decisión.

*La regla que no se toca:* nunca es el catálogo entero. Y nunca deja fuera lo
que un paso necesita: lo declarado se **suma** a lo deducido, no lo sustituye.
Un caso con un paso cuyo instrumento no está en la bandeja no se puede terminar,
y no habría forma de saber por qué; descuidarse al declararla no puede dejar el
caso sin salida.

*Y de paso:* cada instrumento admite su modelo 3D, que se enseña solo cuando el
residente lo coge, uno cada vez. Trece modelos cargando a la vez en la bandeja
dejarían la consola inservible en el portátil que es el equipo de referencia.


### D-063 · 2026-09-13 · vigente
**La auditoría se aplicó en cuatro olas de lotes de archivos que no se pisan.**
Una revisión de 203 agentes sobre el código dejó más hallazgos de los que caben
en una sentada, y aplicarlos en fila habría tardado más que escribirlos. El
método fue el mismo cuatro veces: repartir el trabajo en lotes de archivos
**disjuntos**, un agente por lote, un verificador adversario por lote que lee el
diff de verdad y no el resumen de quien lo escribió, y una fase de reparación
para los lotes con reparos. Cuarenta y un lotes, 122 agentes, 279 arreglos, tres
migraciones y la suite de 150 pruebas a 865.

*Consecuencia buena, y es la que paga al verificador:* **101 hallazgos del
informe se tumbaron por falsos**, cada uno con la línea que lo demuestra —15 en
la primera ola, 18 en la segunda, 41 en la tercera, 27 en la cuarta—. Un informe
de auditoría que se aplica sin comprobar mete tantos defectos como quita. El
caso propio, y el más caro, está en D-066: la petición equivocada la escribí yo.

*Consecuencia mala, y es estructural, no de esta jornada:* un agente no puede
cerrar un defecto cuyo otro extremo vive en un archivo que no es suyo. Los lotes
disjuntos evitan que dos agentes se pisen el mismo archivo, y a cambio cortan
justo por donde pasan los defectos que cruzan: la barra que ponía
`aria-current="page"` mientras ninguna hoja de estilos lo pintaba, las medidas
que Payload ya guardaba de cada imagen y el marcado no usaba, el botón de
reiniciar que solo se puede juzgar mirando el marcador que tiene a ocho píxeles.
Ninguno de esos lo podía ver un lote solo. Por eso hicieron falta cuatro olas y
no una: la tercera fue sobre todo convergencia —de sus 41 descartes, la mayoría
son hallazgos que otro lote de la misma ola ya había cerrado por el otro
extremo— y la cuarta, lo que quedaba. Quien repita el método que cuente las olas
desde el principio; con una sola queda un informe a medio aplicar y la falsa
impresión de haberlo terminado.


### D-064 · 2026-09-13 · vigente
**El modelo de texto rico es plano a propósito, y por eso el tabulador ya no
anida dentro de una lista.**
El modelo de en medio —el que viaja entre el editor del panel y la ficha
pública— tiene una lista que es `Fragmento[][]`: puntos y nada dentro de un
punto. El editor no lo respetaba. `ListItem` de TipTap admite `paragraph
block*`, así que el tabulador metía una sublista dentro del punto, y al
convertir se aplanaba **encima** del padre: «Reducir», con los subpuntos «con
tracción» y «bajo anestesia», se guardaba como un único «Reducircon
traccionbajo anestesia». El autor no vio romperse nada, porque el editor
reconstruye lo que él acaba de escribir; lo roto estaba en la base y en la
página del residente.

*Qué se hizo.* El editor deja de ofrecer la sublista (`SinSublistas`, en
`EditorTextoRico.tsx`) y las cuatro conversiones despliegan la que ya exista en
puntos propios, a la altura del resto. Entre dos bloques hermanos —los dos
párrafos de una cita, el párrafo que envuelve un punto— se mete un salto: perder
el nivel es perder forma, pegar las palabras es perder texto, y lo segundo no se
recupera.

*Consecuencia buena:* lo que se pega desde Word, que trae listas anidadas, entra
sin destruir nada; y lo que ya estaba guardado con sublistas se lee bien sin
tocar la base.

*Consecuencia mala, y es la que hay que decirle al siguiente:* **no hay
sublistas, y no las habrá mientras el modelo sea plano.** Quien las quiera no
puede añadirlas en el editor: tiene que cambiar el modelo y las **cuatro**
conversiones a la vez —`desdeLexical`, `haciaLexical`, `desdeTipTap`,
`haciaTipTap`, en `src/lib/textoRico.ts`—, y decidir además qué hacer con lo ya
guardado. `puntosDeListaLexical` y `puntosDeListaTipTap` son el sitio por donde
se empieza.

*Y dos parientes del mismo sitio, por la misma razón —contenido que se
corrompía sin dar error—:* un salto simple se guarda como nodo `linebreak` y no
como `\n` dentro del texto, porque el HTML colapsa el `\n` a un espacio y las
cuatro fases de una maniobra escritas con Mayús+Intro salían fundidas en un
párrafo corrido; y `estaVacio` mira el árbol y no el texto llano, porque un
campo cuyo contenido fuese una radiografía o una línea divisoria se daba por
vacío y la nota entera desaparecía de la ficha.


### D-065 · 2026-09-13 · vigente
**El prefijo de un enlace interno se pone al pintar, y nunca se guarda en la
base.**
Lo que el autor escribe es `/biblioteca/12`, y eso es exactamente lo que queda
guardado. El `/traumahub` lo pone `ruta()` en el momento de pintar, dentro de
`conversoresRicos` (`src/components/Rico.tsx`). El convertidor que trae Payload
emite `<a href={fields.url}>` tal cual, y Next no resuelve el prefijo de un
`<a>`: sin esto, un enlace del autor salía en el servidor sin prefijo, lo
atendía otra página del mismo dominio detrás del proxy y devolvía un 404 que no
menciona TraumaHub.

*Por qué al pintar y no al guardar,* que es lo que alguien propondrá tarde o
temprano porque parece más barato: el prefijo es del despliegue, no del
contenido. Escrito en la base, la misma ficha deja de servir para un despliegue
sin prefijo —el de desarrollo, sin ir más lejos—, un cambio de prefijo obliga a
reescribir todo lo publicado, y el valor guardado se vuelve indistinguible del
que ya lo traía puesto, que es el camino directo a O-019.

*Y de paso, la comprobación de la dirección baja aquí.* `enlaceSeguro` se
aplicaba solo al convertir desde el panel, y el panel no era la única vía de
escritura. Ahora también comprueba el renderizador público, que es el que
entrega el enlace al navegador. Un enlace que no pasa se pinta como texto, sin
`<a>`: se lee igual y no queda nada muerto que pulsar. En la propia función se
cerró además `/<tabulador>/servidor.externo`, que el navegador limpia y resuelve
como `//servidor.externo`, o sea fuera de la plataforma.

*Consecuencia mala:* olvidarlo no falla donde se nota. Cualquier pantalla nueva
que pinte un campo rico tiene que usar `conversoresRicos` y no el renderizador
pelado; en desarrollo, con el prefijo vacío, las dos se ven idénticas. Por eso
el objeto se exporta en vez de repetirse: dos renderizadores con criterios
distintos sobre el mismo contenido acaban siendo dos comportamientos que nadie
recuerda comparar.


### D-066 · 2026-09-13 · vigente · no lo vuelvas a intentar · ver O-019
**La `url` de un archivo subido NO pasa por `ruta()`.**
Payload la arma con `formatAdminURL`, que antepone por su cuenta el `basePath`
de Next —`withPayload` lo copia a `NEXT_BASE_PATH` al compilar—, de modo que
llega con el prefijo ya puesto. Ponérselo otra vez es reproducir **O-019**, el
apagón en que el prefijo salía dos veces y toda imagen, todo vídeo y todo modelo
3D de toda ficha era un 404 en el servidor.

*Por qué esta entrada existe, y no es un detalle de estilo.* En esta misma
jornada le pedí a un agente que «arreglara» esa `url`, que «no lleva el
prefijo». Era falso. Le pedí también que lo comprobara antes de tocar nada, y
eso es lo único que lo evitó. Esa es exactamente la forma en que el error vuelve:
alguien lee un `<img src={imagen.url}>` sin contexto, ve que ahí no hay `ruta()`
donde el resto del repositorio la tiene, y lo corrige. La petición viene de
arriba y suena razonable.

*Y taparlo sería fácil, que es lo peor.* Con `NEXT_PUBLIC_SERVER_URL` puesta esa
`url` es absoluta y `ruta()` la devuelve intacta, así que un `ruta()` de más no
rompe nada hoy; el día que `serverURL` quedara vacía pasaría a ser relativa y el
prefijo se doblaría. Rompe mañana, sin que nada avise.

*Consecuencia:* `ruta()` **no es idempotente y no debe serlo**. Hacerla
tolerante al prefijo doblado taparía justo el error que hay que ver. El porqué
quedó escrito en `src/lib/rutas.ts` —no solo aquí— y atado con
`tests/unit/archivosSubidos.test.ts`, que llama a la propia función de Payload
con `NEXT_BASE_PATH=/traumahub`.


### D-067 · 2026-09-13 · vigente · matiza D-059
**`objetivoDelPaso` solo deduce cuando el paso llega sin objetivo ninguno.**
D-059 dejó escrito que un paso que no declara objetivo se deduce de lo que sí
declara. La deducción miraba también las tres tolerancias de reducción, y las
tres llevan `defaultValue: 5` en `Cirugias.ts` y `DEFAULT 5` en su migración: las
trae **toda** fila. El resultado era que cualquier paso de instrumento se
convertía en uno de reducción, y de reducción imposible —el caso de prueba
arranca con 9,8° de angulación, la consola solo pinta los mandos de girar cuando
el paso dice `reduccion`, y el segundo paso, que solo pedía coger el punzón, no
se podía superar—.

*La regla que queda.* Las tolerancias solo hablan si el paso llega sin objetivo.
Los cuatro números de la fuerza y del trazo sí prueban una intención, porque sus
columnas se crearon sin `DEFAULT` y sus campos no tienen `defaultValue`: un
número ahí lo tecleó alguien. Y `'instrumento'` no se toma como declaración,
porque es lo que la migración de D-059 escribió en toda fila anterior.

*Su migración de datos,* `20260913_041920_objetivo_de_los_pasos_antiguos`. Todo
paso creado entre el 6 y el 10 de septiembre quedó con `objetivo='instrumento'`
**más** su rango de fuerza, que es justo lo que rechaza la validación nueva: el
traumatólogo abría uno de esos, corregía una coma y ya no podía publicarlo, por
unos números que él no tecleó. El `CASE` es la transcripción literal de
`objetivoDelPaso`, así que no cambia ni una evaluación: escribe en la columna lo
que la aplicación ya deducía en memoria. Toca también
`_cirugias_v_version_pasos`, que es donde viven los borradores, porque publicar
un borrador viejo era el gesto que se quedaba bloqueado.

*Consecuencia mala, aceptada a sabiendas:* el precio es el inverso. Quien elija
«elegir el instrumento» y deje escrito además el rango de la fuerza obtiene
fuerza. Ese descuido sí se ve —sale en la instrucción de pantalla—; el silencio
del caso contrario no se veía en ninguna parte. *Y no se deshace:* la columna no
guarda quién escribió su valor, así que revertir arrastraría también los pasos
que un médico marcó como de fuerza a propósito.


### D-068 · 2026-09-13 · vigente
**La cobertura mide `src/app/**`, y el umbral es el suelo real medido.**
`src/app/**` estaba excluido entero de la medida, y con él las siete acciones de
servidor, que son **toda** la superficie de escritura del panel: lo que no se
mide no se echa de menos, y así se pudo quedar sin una sola prueba el único
sitio donde se comprueban los permisos por módulo. Ahora entra.

*Y el umbral baja de 80 a 58, que es lo que parece un retroceso y no lo es.*
Estaba en 80 con la suite en 70: `npm run test:coverage` fallaba siempre, así
que no estaba en «Antes de subir» ni en ninguna integración continua. **Una
puerta que falla siempre es una puerta por la que nadie pasa, y no guarda
nada.** Al dejar de esconder `src/app/**`, la medida honesta bajó a ~60, y el
umbral se pone dos puntos por debajo: es el suelo medido sin base levantada, que
es cuando la suite de integración se omite y la cifra es la más baja posible.
Este número solo sube, y se sube detrás de cada hueco que se cierra.

*Lo que sigue fuera, y por qué no es un descuido:* los 69 componentes `.tsx`. El
entorno de estas pruebas es `node` y no hay jsdom, así que medirlos los pondría
a cero y arrastraría el umbral a un número que no significaría nada. Meterlos
empieza por añadir el entorno, y exige **dos** cambios a la vez —quitar
`src/**/*.tsx` del `exclude` y ampliar el `include` a `{ts,tsx}`—: con uno solo
la cifra vuelve a mentir, porque el filtro de cobertura casa sin anclar el final
y el barrido de no probados sí lo ancla. Está escrito entero en
`vitest.config.ts`.

*Consecuencia:* `npm run test:coverage` sustituye al `npx vitest run` de antes en
«Antes de subir» y corre la misma suite, así que no cuesta una pasada más.


### D-069 · 2026-09-13 · vigente
**Las pruebas de integración no se omiten solas: política de tres estados.**
Las seis pruebas de control de acceso son las **únicas** que comprueban que los
permisos llegan hasta la consulta y no se quedan en la interfaz. Se omitían
solas: un `.env` sin `PAYLOAD_SECRET`, el contenedor de Postgres apagado o un
clon recién hecho dejaban `npx vitest run` en verde, con las seis desaparecidas
y código de salida 0. El `console.warn` que lo avisaba ni siquiera se veía,
porque Vitest no lo imprime cuando sale durante la recolección. Quien iba a
desplegar creía haber comprobado el control de acceso sin haber comprobado nada.

Los tres estados:

- **sin nada puesto:** si la base no responde, una guardia falla en rojo con la
  causa y con qué hacer. Es el caso que protege al que está por desplegar.
- **`OMITIR_INTEGRACION=1`:** permiso por escrito para trabajar sin base. Se
  omiten y el resultado queda verde, porque alguien lo escribió a mano.
- **`CI` o `EXIGIR_INTEGRACION=1`:** obligatorias, y ahí el permiso anterior ya
  no vale, para que nadie lo cuele en el entorno del servidor de integración.
  `npm run test:integration` se lo pone a sí mismo.

*Un detalle que costó y conviene no deshacer:* con Postgres apagado, el
adaptador de Payload rechaza una promesa interna que nadie espera, y Vitest la
recoge como «Unhandled Rejection» y devuelve 1 aunque las seis queden omitidas
con permiso —o sea que `OMITIR_INTEGRACION=1` no servía justo en el caso para el
que se escribió—. El silenciador se instala **solo** en la rama de fallo, que es
donde ya se sabe que no hay nada legítimo que esconder; subirlo al ámbito del
archivo taparía también los de la suite que sí corre.

*Consecuencia mala:* «Antes de subir» pasa a tener cinco órdenes en vez de
cuatro, y `npm run test:integration` repite pruebas que la anterior ya corrió.
Se acepta: lo que aporta no es la ejecución, es la insistencia.


### D-070 · 2026-09-13 · vigente · amplía D-056
**Una comprobación que no puede fallar no es una comprobación.**
Dos vigilantes del repositorio miraban menos de lo que su nombre prometía, y las
dos veces el defecto era invisible porque se manifiesta no pasando nada.

*La guardia de migraciones* solo miraba el primer nivel del esquema. Un campo
nuevo dentro de un grupo, de un arreglo, de un bloque o de una pestaña con
nombre entraba sin migración y la prueba seguía verde, que es exactamente el
fallo que D-056 la puso a vigilar. Ahora `columnasDe`, `relacionesMultiples` y
`tablasHijas` bajan por todos esos, una relación polimórfica cuenta como
múltiple aunque no declare `hasMany`, y se exige también el `_rels` de la
familia de versiones. **Y hay cuatro pruebas que vigilan al vigilante** con
campos de mentira: si la guardia dejara de ver, esas caen.

*Las dependencias sin declarar.* `three-stdlib` en `Visor3D.tsx`,
`@payloadcms/translations` en `payload.config.ts` y `pg` en un guion de
`scripts/` se importaban sin estar en `package.json`. Funcionaban de arrastre,
porque npm aplana `node_modules` y la dependencia de una dependencia queda a la
vista. El día que cualquiera de las tres cambie de versión, la construcción se
cae con un «Cannot find module» que no nombra por ninguna parte a quien de
verdad la traía. `tests/unit/dependencias.test.ts` recorre `src/` y `scripts/`,
mira también los `import type` —uno de los que faltaban era de esos, y quien se
cae entonces no es `build` sino `typecheck`— y deja escrito lo único que no
puede ver: `@types/pg`, que no aparece en ninguna línea y se mueve junto a `pg`.

*Consecuencia mala:* las dos guardias son caras de mantener y ninguna de las dos
entiende de matices. La de migraciones falla también cuando el esquema y la
última migración se separan por una razón legítima, y entonces hay que crear una
migración vacía; ya pasó con la de D-067, cuya instantánea es copia de la
anterior porque no hay cambio de esquema que describir.


### D-071 · 2026-09-13 · vigente
**El invariante de «siempre un administrador activo» pasa a tener dos capas, y
la de la base es la única que cierra la carrera.**
`impedirAutobloqueo` e `impedirBorradoDelUltimoAdmin` cuentan cuántos
administradores activos quedan aparte del que se toca y, si son cero, cortan.
Eso son dos operaciones, una consulta y después una escritura: dos
administradores que se desactivan a la vez ven cada uno al otro todavía activo,
los dos pasan la comprobación y la plataforma se queda sin nadie que pueda crear
cuentas, activar a nadie ni entrar al panel. La única salida sería entonces
editar la tabla `usuarios` con `psql` en un servidor compartido. **Ningún código
de aplicación puede cerrar esa ventana: tiene que arbitrar quien escribe.**

`20260913_043401_ultimo_administrador_activo` añade dos disparadores de
restricción `DEFERRABLE INITIALLY DEFERRED` sobre `usuarios`, con
`pg_advisory_xact_lock` dentro. Diferido, porque relevar a un administrador
—desactivar al saliente y activar al entrante en la misma transacción— pasa por
un estado intermedio inválido que tiene que seguir siendo legal. Con cerrojo,
porque sin él las dos transacciones pueden contar antes de que ninguna se haya
hecho visible y la carrera vuelve, solo que más estrecha. Probado a mano contra
una base desechable: dos sesiones desactivando cada una a un administrador
distinto dejan pasar a la primera y deshacen la segunda.

*El disparador solo mira cuando la fila **dejaba** de ser administrador activo,*
y eso es deliberado dos veces: una base que hoy ya esté sin administradores
activos no puede quedar bloqueada —se impide el paso de «hay uno» a «no hay
ninguno», no el estado en sí—, y sin ese filtro cada inicio de sesión de un
administrador pagaría el recuento y el cerrojo.

*Consecuencias malas, las tres que hay:* en desarrollo **no existe**, porque
allí manda el `push` de Drizzle y no se aplican migraciones, así que nadie lo va
a ver funcionar antes de desplegarlo. El mensaje llega al panel como error de
servidor sin traducir, porque no es un `APIError` de Payload; se lanza con
SQLSTATE 23514 justamente para que las acciones puedan reconocerlo por el código
y darlo en español, y eso queda pendiente. Y depende de `READ COMMITTED`, que es
el nivel por omisión: quien suba el aislamiento tiene que volver a mirar esto.


### D-072 · 2026-09-13 · vigente
**Una sola fila de actividad por usuario y ficha, y lo sostiene la base.**
La cabecera de la colección prometía «un registro por usuario y ficha» y no lo
sostenía nadie: había índices sueltos y ninguno compuesto. `anotar` consulta y,
si no hay fila, crea; entre esas dos operaciones caben dos pestañas —abrir una
ficha y marcarla enseguida son dos llamadas que viajan en paralelo— y quedaban
dos filas. Entonces marcar como leída tocaba una y la otra se quedaba en
`completado: false` para siempre: la portada seguía ofreciendo en «Continúa
leyendo» una ficha que el residente marcaba una vez y otra sin entender por qué,
y el resumen contaba la lectura dos veces.

*La migración lleva un `DELETE` escrito a mano que no se puede quitar.* Con un
solo duplicado, `CREATE UNIQUE INDEX` falla, la transacción se deshace y el
despliegue se queda a medias sin que el mensaje diga de qué ficha se trata.
Sobrevive la fila marcada como leída —perder eso sería devolverle al residente
una lectura que ya hizo— y, entre iguales, la de visita más reciente; el `id`
deshace el empate para que el resultado no dependa del orden en que PostgreSQL
devuelva las filas. Se registra cuántas se retiraron, porque esto destruye datos
en producción sin preguntar y el registro del despliegue es el único sitio donde
queda constancia.

*Y dos módulos no registraban una sola lectura.* Técnica AO y Lectura de
imágenes no montaban el rastreador. Como la cifra «por leer» de la portada se
calcula sobre los cinco módulos, cada caso AO y cada estudio contaba como
pendiente para siempre y ese número no podía bajar por mucho que se leyera.

*Consecuencia mala, y sigue abierta:* con eso son cuatro módulos de cinco. El
examen físico no tiene página por documento —las maniobras se pintan todas
juntas en el listado—, así que sus fichas cuentan en el total y nunca en las
leídas: **«por leer» tiene hoy un suelo igual al número de maniobras publicadas
y no puede llegar a cero.** Cerrarlo pide una ficha por maniobra o un rastreador
por maniobra dentro del listado. Y la consulta de «¿ya la leyó?» está copiada en
cuatro páginas: su sitio es una función de `src/lib`.


### D-073 · 2026-09-13 · vigente · amplía D-038
**De la API REST de Payload solo queda lo que sirve archivos.**
D-038 retiró la interfaz de Payload, pero no su API, y eso dejó en pie
exactamente lo que D-038 existía para quitar: una segunda administración sobre
los mismos datos por la que no miraba nadie. Un `PATCH /api/patologias/<id>`
guardaba texto rico sin pasar por `depurarDocumento` ni por `faltantes()`, que
son las dos comprobaciones del panel. Un `GET /api/medios?limit=500` devolvía
nombre, tipo y dirección de todos los archivos a cualquier cuenta activa,
borradores incluidos. Y `POST /api/usuarios/login` escribía la cookie con
`path: '/'` a fuego, reabriendo el choque que describe D-074.

Queda abierto `/<coleccion>/file/<nombre>`, tres segmentos exactos: es la ruta
con la que Payload sirve cada imagen, cada vídeo y cada modelo 3D, y la que
llevan los `<img>` de toda la plataforma. Cerrarla dejaría toda ficha sin
ilustraciones. Sigue pidiendo sesión. Se responde **403 y no 404** a propósito:
la dirección existe, lo que pasa es que esta plataforma no la ofrece.

*Por qué apretar el `access.read` de Medios no era la salida,* que es lo primero
que se intenta: las páginas leen con `overrideAccess: false` y Payload propaga
ese valor al poblar relaciones, así que negarle la lectura al residente lo
dejaría sin las imágenes de las fichas publicadas. Lo que sobraba era el
listado, no el permiso.

*Y la regla de D-020 baja a la colección.* «Una cuenta desactivada no ve
absolutamente nada» vivía solo en `entrar()`, la pantalla propia. Ahora la
rechaza un gancho `beforeLogin`, que es el punto por el que pasan todas las
autenticaciones; la comprobación de la pantalla se conserva como segunda
cerradura, con el mensaje sacado del mismo sitio para que las dos capas no
puedan discrepar.

*Y por el lado del panel, el mismo desajuste al revés.* Los cinco catálogos del
simulador declaran `escrituraDeModulo('cirugias')`, y eso gobierna la API REST;
pero el panel escribe con la API local, cuyo `overrideAccess` vale `true`, así
que lo único que le pregunta algo es `puedeEditar`. Un editor apartado del
simulador no podía tocar un instrumento con `curl` y seguía borrándolo desde el
panel —y borrar uno deja a nulo el campo `instrumento` de cada paso que lo
pedía, o sea un caso sin salida—. Los catálogos se gobiernan ahora con el
permiso del módulo 04, en una tabla aparte de `SLUGS_DE_MODULOS`: meterlos en
esa lista los convertiría en módulos para la barra, la portada y las opciones de
permisos, y aparecerían cinco entradas que no llevan a ninguna parte.

*Consecuencia mala:* cualquier integración futura contra esta API está cerrada
de entrada, y reabrirla exige escribir un extremo concreto con su motivo, no
devolver los seis métodos. Las escrituras se declaran —en vez de no
exportarlas— precisamente para que la respuesta explique el motivo: sin ellas
Next contestaría un 405 pelado y el siguiente creería que se equivocó de método.


### D-074 · 2026-09-13 · vigente
**La cookie de sesión se llama `traumahub-token`, y la de vista previa se muda
al prefijo con ella.**
No es cosmético: es la única salida al choque de cookies. Las sesiones
anteriores a 66bdc2d dejaron un testigo con `path: '/'` que sigue vivo hasta
caducar, y es **ese** el que manda —el navegador manda primero la del path más
específico y quien analiza la cabecera se queda con la última—. Mientras las dos
se llamen igual, la del prefijo no se lee nunca, y pasan dos cosas que no se
ven: quien entra con **otra** cuenta queda autenticado como el usuario anterior
—que en una estación compartida de hospital es una anotación firmada por quien
no la hizo—, y si el testigo viejo deja de verificar sin morirse su cookie, al
rotar `PAYLOAD_SECRET`, entrar responde «éxito» sobre una plataforma cerrada.
Con otro nombre, la vieja se vuelve invisible para Payload y se muere sola.

*La de vista previa viaja con ella, y tiene que ser a la vez.* También se
escribía en la raíz, así que las páginas vecinas del proxy recibían el
`vista-previa-rol` de quien estuviera mirando «como residente». Si un lado se
muda y el otro no, el borrado apunta a un path donde no hay nada, la cookie
sobrevive y la sesión siguiente empieza simulando el rol de la anterior.

*Consecuencia mala:* al desplegar esto, **las sesiones abiertas dejan de valer y
todos tienen que volver a entrar**. Se paga una vez. Y queda un cabo: la cookie
de vista previa que dejaron en `/` las sesiones anteriores sigue ganando
mientras viva; el cabo es corto —cuatro horas y solo puede rebajar el rol— y
cortarlo exigiría cambiarle también el nombre, que no compensa. Nadie escribe
`traumahub-token` a mano: se le pregunta a la configuración, y una prueba vigila
que siga siendo así.


### D-075 · 2026-09-13 · vigente en la intención, superada en las cifras y en la vía por D-088
**El techo de subida es una sola cifra, y sale del panel.**
Había tres números distintos diciendo cosas distintas: `upload.limits` anunciaba
50 MB, el panel prometía 50 MB, y Next cortaba el cuerpo de la acción en 8 MB
**antes** de invocarla, de modo que el `try/catch` no llegaba a ejecutarse y la
pantalla se quedaba muda. Ahora la cifra vive donde estaba decidida —junto a la
frase que el traumatólogo lee antes de elegir el archivo, en
`src/admin/esquema.ts`— y `payload.config.ts` la importa de allí en vez de
copiarla. Pedir por comentario que dos números se muevan juntos no es atarlos.

*Y el límite pasa a rechazar de verdad.* El analizador multiparte de Payload
trae `abortOnLimit: false`: dejaba de acumular bytes, marcaba el archivo como
`truncated` —bandera que Payload escribe y nadie lee— y respondía 201. El
registro quedaba creado y el archivo cortado en seco: un vídeo que se reproduce
hasta la mitad, sin un error en ninguna parte. Truncar en silencio es peor que
no tener límite.

*Consecuencia mala, y es una limitación de producto:* **un vídeo de quirófano de
verdad, de 20 MB para arriba, no cabe y no se arregla subiendo el número.** Una
acción de servidor retiene el cuerpo entero en memoria; recibir archivos grandes
pide una ruta que los reciba en flujo, y eso es otra decisión, todavía sin
tomar. Mientras tanto el techo es 7 MB anunciados, 7 MB en la configuración y 8
de cuerpo, que va por encima para que quepa el sobre multiparte.


### D-076 · 2026-09-13 · vigente
**La plataforma no se deja enmarcar por nadie, ni siquiera por sus vecinas del
dominio.**
`X-Frame-Options` decía `SAMEORIGIN`, y bajo prefijo «mismo origen» no es esta
plataforma: es el servidor entero, que sirve además otras tres páginas en `/`,
`/equipo` y `/senales` —despliegues aparte, que `auto-update.sh` trae del remoto
cada treinta minutos sin que nadie de aquí mire qué entró—. O sea que la
cabecera le daba permiso de enmarcado justo a los tres vecinos y no se lo negaba
a nadie que importara: uno de ellos podía montar un marco invisible de
`/traumahub/admin-panel/usuarios` sobre un botón propio y conseguir que el
administrador pulsara «Eliminar» creyendo que pulsaba otra cosa. Pasa a `DENY`,
con `Content-Security-Policy: frame-ancestors 'none'` al lado para los
navegadores que ya ignoran la primera. No le quita nada: no hay un solo `iframe`
en `src/`.

*Y HTTPS obligatorio un año.* Sin `Strict-Transport-Security`, quien teclea el
nombre del servidor sin `https://` hace la primera petición en claro, la
pantalla de `/entrar` se pinta sin cifrar y la contraseña se escribe ahí. Y
encima no deja entrar, porque el navegador descarta una cookie `Secure` servida
por http: el residente vuelve al formulario sin mensaje y entrega la contraseña
una segunda vez por el mismo canal.

*Consecuencia mala, y es de vecindad:* el nombre de máquina se comparte, así que
esta cabecera obliga a HTTPS **también a las otras tres páginas**. Hoy todas
entran por el mismo túnel cifrado y no cambia nada, pero es una decisión que
afecta a terceros y por eso va sin `includeSubDomains` ni `preload`. Y solo en
producción: en desarrollo dejaría el navegador sin poder abrir `http://localhost`
hasta limpiar el estado HSTS a mano.


### D-077 · 2026-09-13 · vigente · sostiene D-011
**Lo obligatorio se exige entero al publicar y solo por encima al guardar
borrador.**
`faltantes()` recorría el primer nivel y nada más, así que lo obligatorio de
dentro de una fila —`pasos[].titulo`, `piezas[].nodo`— o de dentro de un bloque
—el `texto` de una advertencia— pasaba de largo y moría después en el validador
de Payload, que contesta «El siguiente campo es inválido: definicion.0.texto»:
el nombre interno y el índice crudo, que es justo el mensaje que esta función
existe para evitar. Ahora desciende a listas, grupos y bloques, y nombra la fila
por su posición, como se ve en el editor: «Falta «objetivo» en paso 3».

*Y esa misma revisión profunda no puede correr al guardar un borrador,* que es
la mitad que sostiene D-011. El traumatólogo escribe una ficha a lo largo de
varios días, y «Guardar borrador» tiene que aceptar una maniobra con la técnica
en blanco. Si la revisión profunda corriera ahí, el botón devolvería «Falta
«técnica».» y no guardaría nada: lo escrito esa tarde se perdería al cerrar la
pestaña. De ahí `profundo`: en superficie al guardar, entero al publicar, que es
cuando Payload sí va a exigirlos.

*Un caso que se escapaba por la forma:* un texto rico vacío no es `null` ni `''`
—siempre hay un árbol con un párrafo en blanco dentro—, así que la comprobación
de forma no podía ser cierta nunca para un campo rico. A un texto rico se le
pregunta por su contenido, no por su forma.

*Consecuencia mala:* hay dos validaciones sobre lo mismo, la del panel y la de
la colección, y separarse es fácil. Ya pasó: la regla que **prohíbe** llegó a la
colección y no al panel, y durante ese tiempo el caso se rechazaba en inglés con
el español encerrado donde no se enseña. Por eso la lista es una sola
—`REGLAS_DEL_OBJETIVO_DEL_PASO`, en `src/admin/esquema.ts`— y las dos la
importan. Vive en el esquema y no en la colección porque el esquema lo carga
también el navegador y la colección arrastra el adaptador de Payload: es la
excepción declarada a «esquema y colección son paralelos, no derivados»
(D-042), y sale barata porque lo que se comparte son datos sin código.


### D-078 · 2026-09-13 · vigente
**En la consola quirúrgica manda el paso, no el interruptor.**
El lienzo podía quedarse en negro, y era el modo de fallar más caro que tenía la
pantalla donde el residente opera. Un paso que declara ver la piel —una incisión
se traza sobre la piel: es exactamente lo que el traumatólogo va a escribir— con
la piel apagada de salida daba lista vacía, y encender una lista vacía apaga
**todas** las mallas: gris, sin error, «Encuadrar» mudo porque no hay caja que
encuadrar, y la única salida en una casilla del panel izquierdo que nadie
relaciona con lo que acaba de pasar. Ahora el cruce tiene suelo: lo que el paso
declara se enciende, se dice qué capa hubo que devolver a la vista, y un cruce
vacío devuelve el modelo entero explicando por qué. Antes que no enseñar nada,
se enseña algo y se dice.

*De la misma familia, y todos por la misma razón —el paso sabe lo que necesita y
tiene que ponerlo él—:* el modo de ratón lo fija el objetivo al entrar en el
paso, porque venir de un trazo a una reducción dejaba el ratón en «trazar» y
arrastrar el fragmento dibujaba una raya que además se medía; el deslizador de
fuerza se acota al rango del paso en vez de a un 0-120 inventado, con el que un
paso de 200 N era insuperable; y el puntaje se decide por los **fallos** y no
por los resueltos, porque un paso se acierta una sola vez y después se avanza,
de modo que la guarda anterior nunca se cumplía y daba lo mismo acertar a la
primera que a la octava.

*Consecuencia buena de dónde se puso la lógica:* `visibilidadDelPaso`,
`capasQueEnciendeElPaso` y `rangoDelDeslizadorDeFuerza` son funciones puras
exportadas y probadas sin navegador. *Consecuencia mala:* viven dentro del
componente de la consola y su sitio es `src/lib`, junto a sus hermanas; mientras
no se muden, son reglas de dominio escondidas en un archivo de interfaz, que es
donde nadie las busca.

*El margen del deslizador no se puede quitar,* y conviene dejarlo dicho: un
deslizador que empieza y acaba dentro de la ventana buena aprueba cualquier
posición, y un paso en el que no se puede fallar no enseña nada, que es lo
contrario de D-059.


### D-079 · 2026-09-13 · vigente
**Ninguna pantalla se queda sin red, y ninguna consulta que falle se convierte
en un cero.**
No había un solo `error.tsx` en el repositorio, así que cualquier excepción que
subiera desde una página —un módulo vetado consultado sin `catch`, una relación
rota, una consulta que se va de tiempo— la atendía la pantalla genérica de Next:
en inglés, sin barra de navegación y sin más salida que el botón «atrás». Para
un residente eso es indistinguible de «la plataforma se cayó». El reparto queda
así, y conviene no confundirlo al tocar cualquiera de las piezas: lo que falla
**dentro** de una página se queda en `(frontend)/error.tsx`, con la plataforma
entera alrededor; lo que falla **antes** de que llegue a haber página —el
layout, o sea la base caída— se va a `global-error.tsx`, que pinta su propio
documento. Y lo mismo por el lado del «no encontrado», con su vuelta de tuerca
en O-042.

*La otra mitad, que es la que más engaña:* la página de estadísticas se tragaba
la excepción y devolvía lista vacía, indistinguible de una colección de verdad
vacía. Con la tabla de actividad caída decía «0 lecturas registradas» y dibujaba
los doce meses a cero, **que es una afirmación sobre los residentes y no sobre
la base**, y lo hacía sin dejar nada en el registro del servidor. Ahora una
consulta que no se pudo hacer devuelve `null` y la pantalla lo dice. En una
pantalla cuyo único trabajo es contar, un cero inventado no es un dato
degradado: es una respuesta falsa a la pregunta que se vino a hacer.

*Consecuencia mala:* el marcado se llena de `=== null` y de estados que hay que
escribir y mantener, y cada pantalla nueva que cuente algo tiene que decidir lo
mismo. Es el precio de no mentir con un número.


### D-080 · 2026-09-13 · vigente
**El taller del atlas exporta la preparación como modelo de un caso.**
El motor estaba desde `209bf83` y le faltaba la pantalla. El puente va del atlas
a la consola y no al revés, porque son dos motores distintos: el atlas funde
todas las piezas de un sistema en una malla y decide qué se ve con una textura;
la consola abre un archivo con objetos con nombre, mueve uno y mide milímetros.
Lo que se prepara en el taller se **escribe** como un `.glb` igual que el que
sale de Blender, y para la consola es un modelo más.

Se marcan las piezas que tienen que salir **sueltas** —la que se va a fracturar,
el fragmento que hay que reducir— y el resto se funde en un objeto por sistema,
que es lo que hace que el archivo pese poco (Q-006).

*Exige la preparación guardada y sin cambios sueltos,* porque el servidor
exporta lo que hay en la base y no lo que se ve en pantalla: exportar con la
pantalla por delante entregaría un archivo que no se parece a lo que el
traumatólogo está mirando, y nada lo avisaría.

*Al terminar enseña los nombres de nodo saneados,* que son los que hay que
escribir en las piezas del caso: three.js cambia los espacios por guiones bajos
al cargar, y escribir el nombre anatómico deja una pieza que no se enciende
nunca y ningún error que lo explique. Es el mismo fallo mudo que D-061 vino a
quitar, por la otra puerta.

*Consecuencia mala:* la lista de candidatas enseña cien y dice cuántas quedan
fuera —el cuerpo completo son ciento treinta y nueve piezas encendidas y
pintarlas todas hace el panel irrecorrible—, así que con el cuerpo entero hay
que filtrar por nombre para llegar a la que se busca. Callar el recorte habría
sido peor: parecería que la pieza no está encendida.


### D-081 · 2026-09-13 · vigente
**El mapa corporal no se va a dibujar, y sus cuatro columnas se sueltan.**
La pregunta llevaba abierta desde la migración inicial y la contestó hoy el
traumatólogo: no hay silueta que pulsar ni la va a haber. Lo que él quería de
esa idea era otra cosa, y está en D-082. El grupo `zonaMapa` —`x`, `y`, `ancho`,
`alto`— se retira de `src/collections/Segmentos.ts` y del esquema del panel, y
`20260913_111605_pose_del_modelo_complicaciones_y_fuera_el_mapa` suelta las
cuatro columnas.

*Por qué no se dejaban «por si acaso», que es lo que se hizo la vez anterior.*
Lo que costaban no era el espacio: era que el panel pedía cuatro coordenadas por
segmento —veintitantos— para una pantalla que no existe, y adivinarlas sin una
silueta delante no es trabajo que nadie pueda hacer bien. La advertencia de que
no servían para nada había que escribirla **dos veces** —en la colección y en el
esquema del panel, porque desde D-038 el texto que se lee es el segundo— y aun
así la sección salía en el formulario con su título. Si el mapa vuelve algún
día, vuelve con su pantalla y con su migración.

*Consecuencia mala, y hay que aceptarla entera:* volver a tenerlo exige crear
otra vez las cuatro columnas, y **las coordenadas que hubiera guardadas no
vuelven**. El `down` repone las columnas vacías, que no es lo mismo que
deshacer. En la base de desarrollo estaban vacías; de la del servidor no ha
mirado nadie, y por eso la migración lo deja dicho en el registro del despliegue
en vez de darlo por sabido: es la parte que destruye datos sin preguntar y ese
registro es el único sitio donde va a constar que ocurrió. Quien quiera
conservarlas, el momento es antes de aplicarla, con `npm run respaldar`.

*Y deja un cabo que esta entrada no cierra:* la guardia de migraciones solo
comprueba que exista la columna que la colección declara, nunca que sobre una
que ya no declara nadie. Ver O-043.


### D-082 · 2026-09-13 · vigente · amplía D-054
**Un modelo 3D guarda la pose desde la que se abre, con la forma `Encuadre` y no
con la del atlas.**
«No así, pero es para enfocar el punto de vista del alumno, dejarle el modelo de
la pierna por ejemplo en una pose.» Eso era lo que había detrás del mapa
corporal, y no era un mapa. Hasta hoy el ángulo lo decidía el visor —mide la
caja del modelo y lo abarca entero—, que es honesto y es la vista de nadie: la
fractura puede quedar detrás, y el residente que no sabe qué busca no gira el
modelo, mira el que le enseñan. `modelos-3d` estrena el grupo `encuadre`, que se
captura con el mismo editor arrastrable de D-054 y en el mismo visor que ve el
residente.

*Se elegía entre dos formas que ya existían, y elegir mal era crear la tercera.*
`VistaDeInstancia` (`src/atlas/formato.ts`) guarda dos puntos del espacio
—cámara y objetivo— más la separación de las piezas, y puede permitírselo porque
el atlas es **una** escena compartida, un cuerpo entero en metros, donde una
coordenada absoluta significa siempre lo mismo. Un `.glb` subido viene en las
unidades del estudio del que salió y centrado donde quiso Blender, de modo que
«cámara en (0.6, 1.1, 2.6)» no dice nada sobre él; y `separacion` no tiene aquí
equivalente, porque no hay piezas que apartar. `Encuadre` guarda lo que sí es
propio del modelo: cuánto girarlo, a qué distancia mirarlo y con qué escala. Es
lo que produce `encuadreCapturado`, lo que consume `Visor3D` y lo que ya
guardaba el bloque «Modelo 3D» de una ficha, con estos cinco nombres. Compartir
nombre y forma es lo que permite que un lector caiga de uno al otro sin traducir
nada.

*La precedencia es bloque, luego modelo, luego automático.* Manda el del bloque,
porque quien coloca esa pieza en esa ficha la está mirando para esa ficha; si el
bloque no dice nada, manda la pose del catálogo, que el traumatólogo capturó una
vez para todas las fichas; y si ninguno dice nada, el visor abarca la pieza por
su cuenta, que es lo que la plataforma ha hecho siempre. La regla vive una sola
vez, en `encuadreVigente` (`src/lib/encuadre.ts`), y **no puede escribirse como
un `??`**: `depurarCampos` reconstruye el documento recorriendo el esquema y
escribe siempre las cinco claves del grupo, así que un bloque guardado desde el
panel trae un `encuadre` que es un objeto aunque esté entero a nulos. El `??` no
caería jamás al modelo y el respaldo quedaría escrito, probado y muerto. La
pregunta que sí distingue los dos casos es `tieneEncuadre`, que mira
`distanciaCamara` porque es la única de las cinco sin valor neutro: los giros
valen cero en la pose frontal, que es una pose legítima, y la escala vale uno en
casi todas.

*Y es todo o nada.* Un bloque con los giros escritos y la distancia en blanco
cae **entero** al del modelo. Juntar la mitad de uno con la mitad del otro
compone una pose que nadie vio nunca, ni en el editor del bloque ni en la ficha
del modelo, y el traumatólogo no tendría dónde ir a corregirla.

*Consecuencia mala, y se paga el primer día:* los bloques «Modelo 3D» ya
insertados traen los `defaultValue` de Payload —escala 1, giros 0, distancia 3—
sin que nadie los haya capturado, de modo que para `tieneEncuadre` **tienen
encuadre** y ganan. La pose que se capture en el catálogo no llegará a esas
fichas hasta que alguien las abra y capture allí, o vacíe la distancia del
bloque. No hay forma de distinguir un 3 puesto por omisión de un 3 elegido, y
por eso el campo de la colección nace **sin `defaultValue`**: vacío significa
«encuádralo tú», y un valor por omisión aquí habría hecho que todo modelo
naciera con una pose que nadie eligió y que los modelos en milímetros se
abrieran como un punto en el centro de la pantalla.

*Y la regla la llama hoy un solo renderizador,* que es la mitad que queda
suelta: el paso de un caso AO y el instrumento de la consola abren su modelo sin
preguntar por la pose. Ver O-045.

*Y una de arquitectura, que conviene saber antes de mirar el peso del paquete:*
desde que `Bloques.tsx` —que se pinta en el servidor— lee de
`src/lib/encuadre.ts`, el `import * as THREE` de ese módulo entra con él en el
paquete del servidor, donde no se dibuja nada. No llega al navegador del
residente —los visores siguen viajando aparte, por `VisoresPerezosos`— y no
cambia ningún comportamiento; el día que ese peso moleste, lo que hay que sacar
es `encuadreCapturado`, que es la única función de ahí que necesita three.
`tieneEncuadre` bajó del visor a `src/lib` por esto mismo: llamar desde el
servidor a algo que vive en un archivo `'use client'` no queda feo, falla, y se
lleva la ficha entera.


### D-083 · 2026-09-13 · vigente
**El suelo de la escala es 0,0001, y el catálogo y el bloque lo declaran igual.**
Con `min: 0.01` el tope impedía justo el caso para el que existía.
`encuadreQueLoAbarca` devuelve `1/radio`, y un fémur de 250 mm de radio da
0,004. Guardando desde el panel eso no daba error: `depurarCampo` recorta contra
el tope **sin decir nada**, así que «Ajustar al modelo» capturaba 0,004, se
guardaba 0,01 y el hueso se abría dos veces y media más grande de lo que el
traumatólogo acababa de dejar en pantalla —y el factor crece con la pieza: un
modelo del doble de radio se abría cinco veces más grande—. Por la API local o
por un guion era peor de otra manera: el mismo número se rechazaba de plano.
0,0001 sigue impidiendo el cero, que es lo único que había que impedir —con
escala cero el modelo desaparece—, y deja pasar los milímetros.

*Dónde actuaba de verdad el tope, que no es donde se lo busca.* En el bloque de
una ficha el `min` de Payload era el **único** que actuaba, porque
`src/admin/bloques.ts` declara esa escala sin `min` ni `max` y `depurarCampo` la
deja pasar tal cual: quien rechazaba era Payload, en inglés y sin que `accion()`
desenvuelva el mensaje. O sea, el recorrido completo del defecto: insertar un
fémur en milímetros, pulsar «Ajustar al modelo» —el botón que existe
precisamente para hacer visible el modelo—, pulsar Guardar y no poder guardar lo
que el botón acababa de capturar.

*Consecuencia mala:* el mismo número está escrito en tres sitios —la colección,
el bloque de Payload y el esquema del panel— y tiene que seguir estándolo,
porque el panel recorta antes de que Payload llegue a validar y un tope más
estrecho arriba devuelve el recorte mudo. Los atan `tests/unit/esquema.test.ts`
y `tests/unit/encuadreDelModelo.test.ts`; ya se separaron una vez dentro de esta
misma jornada —el catálogo bajó a 0,0001 y el bloque se quedó en 0,01—, que es
exactamente la mitad de un arreglo dándose por hecha estando viva.


### D-084 · 2026-09-13 · vigente · amplía D-078
**El puntaje y las complicaciones sobreviven al recargado, y son seguimiento y
no una nota.**
La respuesta del traumatólogo fue una palabra: «sobreviven». Hasta hoy vivían en
estado local de `ConsolaQuirurgica.tsx` y morían con la pestaña, con dos precios
que se pagaban juntos: pasarse y quedarse corto acababan valiendo lo mismo —la
única señal que los distinguía era una línea de un registro de diez que se
perdía al recargar— y el «registro de complicaciones» que la portada promete
desde el primer día no existía en ninguna parte. `actividad` estrena `puntaje`,
`puntajeMaximo` y la lista `complicaciones`, en la misma fila que ya guardaba la
lectura de esa ficha.

*La fila guarda el último recorrido, no un historial, y eso es lo que cuesta.*
Es una por usuario y ficha —el índice único de D-072— y describe un estado, como
`completado`: la lista que llega reemplaza entera a la anterior. Acumular
intentos pide otra colección y otra decisión, que no se ha tomado. Tampoco es un
punto de guardado: no se guarda por dónde iba el recorrido, así que al volver el
marcador cuenta desde cero y lo de la vez anterior se enseña aparte, en «Su
recorrido anterior». Reponerlo dentro del marcador y dejar repetir los mismos
pasos los cobraría dos veces, y el número subiría solo con recargar.

*`puntajeMaximo` se guarda junto al puntaje porque el guion lo edita el
traumatólogo.* Sin esa copia, añadir un paso a un caso publicado convierte «18
de 20» en «18 de 30» en el historial de quien ya lo había terminado, sin que él
hubiera hecho nada. El numerador y el denominador de un marcador se guardan
juntos o mienten por separado. Por lo mismo, cada complicación se lleva el
número y el título con los que el residente vio el paso: `pasos[].id` deja de
encontrar nada en cuanto el guion se reordena, y entonces esas dos columnas son
lo único que permite nombrarla.

*Consecuencia mala, y hay que decirla en voz alta:* **el puntaje lo calcula el
navegador.** `puntosDelPaso` corre en la consola y el servidor no lo puede
recalcular sin repetir la simulación entera, así que un residente puede escribir
el que quiera con un `PATCH` a su propia fila —igual que hasta hoy podía
inspeccionar la consola—. Se acepta porque esto es seguimiento del propio
progreso y no una calificación: sirve para que él vea lo que le costó el caso y
para que el profesor sepa quién ha recorrido qué. Por eso la cifra se enseña
acompañada de esa frase en las dos pantallas donde aparece (D-086). El día que
cuente como evaluación no basta con cerrar el campo: la cuenta tiene que mudarse
al servidor, porque lo que viaja es el gesto.

*Y el desenlace se guarda como texto, no como `select`.* Un `select` de Payload
es un tipo enumerado de PostgreSQL, así que cada desenlace nuevo del motor
exigiría su migración, y ese olvido no lo caza nadie:
`tests/unit/migraciones.test.ts` compara nombres de columna y dice en su propia
cabecera que no mira tipos ni valores. El fallo aparecería en el servidor, al
guardar, como un `invalid input value for enum` sin traducir y con el residente
delante. En texto, la columna y las dos comprobaciones —la de la colección y la
de la acción— derivan de `RESULTADOS`, de modo que un desenlace nuevo se acepta
solo. Se pierde la garantía del motor de base de datos; se gana que la garantía
siga siendo cierta.


### D-085 · 2026-09-13 · vigente
**El recorrido se guarda en cada hito: un paso superado o una complicación.**
Ni en cada gesto —eso es una escritura por clic, y pulsar «Aplicar paso» sin
instrumento no cambia nada que guardar— ni solo al terminar, que pierde entero
al que cierra la pestaña a mitad, que es el caso corriente en un módulo que se
recorre entre dos turnos. Un caso de diez pasos son unas diez escrituras
repartidas en la media hora que se tarda en recorrerlo. No se intenta nada al
cerrar la pestaña: `beforeunload` no es sitio para una acción de servidor —el
navegador corta la petición— y prometerlo sería peor que no tenerlo.

*Una escritura en vuelo y siempre la última.* Dos gestos seguidos son dos
llamadas, y la fila es una: viajan por HTTP y nada garantiza el orden, así que
la del paso 3 podía aterrizar después de la del 4 y dejar guardado el puntaje de
antes. Mientras haya una en vuelo, la siguiente espera en `porMandar` —pisando a
la que hubiera, que ya no interesa— y sale cuando la anterior vuelve. La
escritura idéntica a la anterior se descarta, que es lo que evita el viaje del
paso que no sumó nada.

*El botón de reiniciar no borra lo guardado.* Está a ocho píxeles del marcador y
se pulsa sin querer: vaciar la fila dejaría al residente sin el registro de
complicaciones del recorrido que acaba de hacer, que es justo lo que iba a
repasar, y esta vez sin vuelta atrás. Lo sustituye el primer hito del recorrido
nuevo, porque la lista que se manda es la entera.

*Consecuencia mala:* lo hecho desde el último paso superado se pierde si se
cierra la pestaña, y cada hito reescribe la lista entera de complicaciones en
lugar de añadir una fila. Y cuando una escritura falla, la consola lo dice y
vuelve a intentarlo en el hito siguiente con el recorrido entero: callar ahí
sería dejar al residente terminando un caso que no se guardó, con un marcador en
pantalla que sigue subiendo.


### D-086 · 2026-09-13 · vigente
**Lo que la consola guarda se enseña en tres pantallas, y la advertencia va
delante de la primera cifra.**
Este repositorio ya escribió una vez la mitad de esto —tres columnas declaradas,
migradas y probadas, sin nadie que las escribiera ni las leyera—, y un campo que
se llena y no se lee es peor que uno que falta: se ve lleno en el panel y quien
lo rellena cree que ha dejado algo puesto. Así que el recorrido sale por tres
sitios: la propia consola, con «Su recorrido anterior» entero y sin recortar a
diez líneas; la portada del residente, en «Su paso por el simulador», que es
donde estaba prometido el registro de complicaciones; y el panel de actividad,
con la tabla de los pasos donde se atasca la gente.

*Veces y residentes se cuentan aparte, y esa es la columna que informa.* Un paso
donde una persona insistió seis veces es un tropiezo suyo; uno donde tropezaron
seis personas es el guion, y es el que hay que reescribir. Por eso el orden es
por gestos y, en empate, por personas. El desenlace se enseña en castellano
—`NOMBRE_DEL_DESENLACE`, un `Record<Resultado, string>` para que el compilador
pida el nombre el día que el motor estrene uno— y no como la constante cruda,
que es el nombre de una variable y no una frase.

*La advertencia va antes de la tabla y no debajo.* Quien mira una columna de
números la interpreta mientras la lee, y un puntaje se parece demasiado a una
nota; puesta detrás llegaría tarde. Dice lo que D-084 explica: que lo calcula el
navegador del residente, que el servidor no lo puede recalcular y que sirve para
ver dónde se atasca la gente, no para evaluar a nadie.

*Consecuencia mala:* el resumen del panel se calcula sobre las últimas 1.000
filas de `cirugias` —el mismo tope de la actividad reciente y con la misma letra
pequeña—, así que pasado ese número deja de ser un recuento y es un suelo.
Subirlo sin más es traerse la tabla a la memoria del servidor; contar en la base
tampoco sirve tal cual, porque el agrupado por paso que necesita esta tabla no
se pide con `count`. Y el `ilegible` del simulador es propio y no el de la
actividad: una avería leyendo recorridos no puede poner «—» en las cifras de
lectura, que se leyeron perfectamente.


### D-087 · 2026-09-13 · vigente · cierra el cabo abierto de D-072 · su tope de lectura, retirado por D-104
**El examen físico registra lectura desde el listado, con una casilla por
maniobra. Esta la eligió el equipo.**
La pregunta se le hizo al traumatólogo y contestó «no entiendo, haz lo que mejor
te parezca». **La decisión es del ingeniero y no del médico**, y conviene que
conste: cambia la forma del módulo y deshacerla cuesta trabajo. D-072 había
dejado el cabo escrito —cuatro módulos de cinco anotaban lectura, y las fichas
del quinto contaban en el total de la portada y nunca en las leídas, de modo que
«por leer» tenía un suelo igual al número de maniobras publicadas— con sus dos
salidas posibles: una ficha por maniobra, o un rastreador por `<article>` en el
listado. Se eligió la segunda. La primera inventa una pantalla que nadie pidió y
parte en treinta páginas un módulo que se lee de corrido.

*Lo que hubo que separar para que la cifra no mintiera de otra manera.* Montar
treinta rastreadores es anotar treinta visitas de golpe, y «Continúa leyendo»
—que ordena por `ultimaVisita`— se habría llenado de maniobras que nadie miró,
tapando justo las fichas que el residente sí dejó a medias. De ahí que el
listado pase `anotarVisita={false}` y que la visita la anote
`VisitaDeManiobraEnlazada`, una sola vez y solo cuando la navegación nombró una
maniobra concreta —lo que llega desde «Ver publicado ↗», desde «abrir ficha →»
de un comentario y desde la propia portada—. Se comprueba contra las maniobras
que el listado acaba de pintar, porque el ancla la escribe quien quiera en la
barra de direcciones y un `#maniobra-9999` a mano dejaba una fila apuntando a
una ficha inexistente. Marcar «leída» no depende de nada de esto: es un gesto
del residente sobre una maniobra concreta, no una suposición nuestra.

*Y tres cosas que estaban rotas y no se veían porque de este módulo no salía
nunca una ficha.* El destino de «Continúa leyendo» se componía pegando
`${ruta}/${id}`, y no existe `examen-fisico/[id]`: habría estrenado el 404 en
inglés de Next en cuanto la sección pudiera ofrecer una maniobra; ahora sale de
`rutaPublica`, que es quien sabe que ese módulo se enlaza por ancla. Las dos
mitades de la resta «por leer» hablaban de conjuntos distintos —el total cuenta
solo los módulos que la cuenta ve y lo leído contaba todas sus filas—, así que a
una cuenta con un módulo retirado le salía una cifra más baja de la que era. Y
una maniobra sin segmento no se pintaba en ninguna parte, porque el reparto
recorría los segmentos y filtraba dentro: una ficha publicada que contaba en el
total y a la que nadie podía llegar a leer, comentar ni marcar.
`agruparManiobrasPorSegmento` (`src/lib/maniobras.ts`) las junta en «Otras
maniobras» y vive fuera del JSX porque lo que hay que sostener —que las
maniobras que entran son exactamente las que salen— no se ve leyendo la página.

*Consecuencia mala, y es de tope:* el listado pide ahora 300 maniobras y las 300
filas de lectura correspondientes, con el mismo número a propósito —un tope más
bajo en la segunda consulta dejaría maniobras ya leídas con la casilla en
blanco, y eso no se ve: la página carga y el residente vuelve a marcar lo que ya
tenía marcado—. Pasadas las 300 publicadas, las de más no se pintan. Y son N
casillas seguidas bajo un `<h1>` que dice «Examen físico» y nada más, así que
cada una necesita su `nombreDeLaFicha`: sin él un lector de pantalla recita N
veces «casilla de verificación, Marcar como leída» y marcar la que se acaba de
leer queda en contar casillas desde arriba.


### D-088 · 2026-09-13 · vigente · supera a D-075 · la vía de `Campos.tsx` y la cadena 50 ≤ 52 ≤ 64, superadas por D-099
**El techo de subida son 50 MB, y el archivo entra por una ruta y no por una
acción de servidor.**
La pregunta era si cabe un vídeo de quirófano de verdad, y la respuesta vino
condicionada: «si es posible subir los límites adelante, de lo contrario no
tengo pensado dejar vídeos, solo haré simulaciones con los modelos 3D». O sea
que de esto dependía que el módulo tuviera vídeo o no lo tuviera. D-075 dejó el
techo en 7 MB y dejó escrito por qué subir el número no bastaba: una acción de
servidor recibe el cuerpo ya reunido —el archivo entero en la memoria del
servidor durante toda la subida, que por un túnel doméstico son minutos— y Next
lo descarta **antes** de invocarla, así que el `try/catch` de `accion()` no
llega a ejecutarse y la pantalla se queda muda.

*La salida es un manejador de ruta*,
`src/app/(frontend)/api/subidas/[coleccion]/route.ts`, que no lleva ese límite y
escribe a disco según recibe. El cuerpo son **los bytes del archivo y nada
más**: un `multipart/form-data` habría obligado a llamar a `peticion.formData()`,
que reúne el cuerpo entero en memoria y deshace lo que se venía a ganar. Lo
demás viaja en cabeceras y no en la dirección, porque el nombre de un archivo
clínico no tiene por qué quedar escrito en el registro de accesos de un proxy.
El archivo va a un directorio temporal propio por subida —dos personas subiendo
a la vez un archivo llamado igual dejarían un registro apuntando a un vídeo que
es mitad de cada uno— y se borra pase lo que pase.

*Lo que una ruta no trae puesto y una acción sí.* Next comprueba el origen de
sus acciones; un manejador de ruta, no. Sin esa comprobación, la cookie de
sesión —acotada al prefijo, pero compartida con las páginas vecinas del mismo
dominio— dejaría que un guion inyectado en cualquiera de ellas subiera archivos
con la sesión del traumatólogo. Se comprueba **igual que la comprueba Next**, a
propósito: más estricta, subir fallaría en un despliegue donde el resto del
panel funciona y nadie relacionaría las dos cosas; más laxa, sería la puerta
abierta al lado de la que las acciones ya cierran.

*La cadena de números, que es lo que hay que entender antes de tocar ninguno:*
**50 ≤ 52 ≤ 64**. Cincuenta megas de techo del archivo en `medios`
(`TECHO_DE_MEDIOS_BYTES`, en `src/admin/esquema.ts`, de donde salen también la
frase que se lee en el panel, la comprobación del navegador, la del servidor y
el `upload.limits` de Payload); cincuenta y dos de cuerpo de acción
(`next.config.mjs`); sesenta y cuatro de `client_max_body_size` en el nginx del
otro despliegue. Tiene que crecer hacia fuera para que quien corte sea siempre
la plataforma, que sabe decir en español qué pasó y cuánto pesaba el archivo: un
proxy que corta antes devuelve un 413 sin una palabra dentro. Lo compara
`tests/unit/subidaDeVideo.test.ts`, que abre los tres archivos —el esquema,
`next.config.mjs` y `despliegue/paginas/LEEME.md`— y los lee.

*Por qué 50 y no 64, que es la pregunta que se hará el siguiente.* El eslabón
corto vive en una máquina que **este repositorio no versiona**
(`nginx-proxy-manager/data/nginx/custom/server_proxy.conf`), así que un número
subido aquí no lo pone allá, y así es exactamente como nacen dos cifras que no
se hablan. El techo de la aplicación se queda por debajo del proxy en lugar de
empujarlo. Si algún día hicieran falta más de 64 MB, el orden es al revés y no
se puede saltar: primero el proxy, después esto. Y con cuidado, porque ese
fragmento se incluye en **cada** server que genera NPM: subirlo se lo sube
también a las otras tres páginas del dominio sin que lo hayan pedido.

*El techo de los modelos 3D no se mueve con este, y por eso están escritos
juntos.* Un `.glb` lo carga **entero** el navegador del residente antes de
pintar el primer triángulo, así que los 5 MB no son tacañería: por encima, la
consola deja de abrirse en el equipo de referencia (O-008, Q-006). Separados en
dos archivos, el día que alguien suba el de los vídeos se lleva por delante el
de los modelos «ya que estamos».

*Y la barra de progreso no es un adorno.* Un vídeo de 40 MB por un túnel
doméstico dejaba el botón en «Subiendo…» durante minutos sin una sola señal, y
lo que hace cualquiera entonces es volver a pulsar o cerrar la pestaña. Va con
`XMLHttpRequest`, anticuado a sabiendas, porque `fetch` no informa del avance de
la **subida**. Al llegar al 100 % dice «Procesando en el servidor…», que es
verdad —falta escribir el archivo, sacar las miniaturas y crear el registro— y
evita la lectura contraria. La lista de formatos se queda en MP4 y WEBM aunque
la cámara de pabellón grabe en otra cosa: un QuickTime no se reproduce en
`<video>` fuera de Safari, así que admitirlo sería dejar subir un archivo que la
mitad de los residentes ve como un recuadro negro.

*Consecuencias malas, dos y las dos abiertas.* `formulario/Campos.tsx` sigue
insertando archivos dentro de un bloque por la acción vieja, y por eso
`bodySizeLimit` tiene que quedarse en 52: mientras siga ahí, una inserción de
50 MB desde el editor de bloques se queda 50 MB en la memoria del servidor, y
ese número solo se va el día que esa pantalla suba por la ruta como ya sube el
listado de medios. Y los 50 MB no están probados por el túnel por el que hoy
entra la plataforma: ver O-044.


### D-089 · 2026-09-13 · vigente
**Los subtítulos en los vídeos se descartan, y queda escrito para que no vuelvan
a proponerse.**
No existían: eran una propuesta de la auditoría de esta mañana. El traumatólogo
contestó «no, quítalos», y como no había nada que quitar del código —ni un
`<track>`, ni un `.vtt`, ni un campo—, **esta entrada es lo único que queda de
la propuesta**. Sin ella, la próxima revisión de accesibilidad la levanta otra
vez y alguien la implementa, que es precisamente lo que la bitácora existe para
evitar.

*El porqué es de producto y no técnico.* Hoy no hay un solo vídeo publicado, y
si los límites no hubieran subido no iba a haberlos nunca (D-088). Un subtítulo
pide un archivo por vídeo, escrito a mano y minuto a minuto por la misma persona
que redacta las fichas, que es el trabajo más caro del proyecto; y el público es
un grupo cerrado que habla un solo idioma (D-012).

*Consecuencia mala, y no es menor:* la plataforma exige `alt` en toda imagen y
acaba de ampliar esa exigencia al vídeo —«qué gesto se hace en el video»—, así
que la accesibilidad queda sostenida por un lado y soltada por otro, a
sabiendas: quien no oye no tiene con qué seguir lo que se dice dentro de un
vídeo. Se acepta mientras el vídeo sea lo que hoy se piensa que va a ser, un
gesto quirúrgico de veinte segundos con su explicación escrita al lado. Lo que
reabriría esto es que el vídeo pase de ilustración a contenido —una clase
grabada, una explicación hablada que no esté escrita en ninguna parte— o que la
plataforma salga del grupo que hoy tiene el enlace (Q-001).


### D-090 · 2026-09-13 · vigente
**El campo `notas` de una cuenta se conecta, y son notas del administrador sobre
la cuenta.**
«Conéctalo.» Estaba declarado en la colección desde el principio y no lo pintaba
ninguna pantalla desde que se retiró la interfaz de Payload (D-038): un campo
que se guarda y no se ve, de la misma familia que `zonaMapa` pero con la
decisión contraria. Ahora se escribe y se lee en la pantalla de cuentas, en
cuatro sitios: el modal de crear, porque el dato que el campo existe para
guardar —quién pidió esta cuenta y con qué autorización— se sabe exactamente ahí
y se olvida en una semana; el de editar; resumido dentro de la fila, porque una
nota que solo aparece al abrir un modal no se abre nunca y ese dato se consulta
justo mirando la lista, antes de reactivar a nadie; y la búsqueda, para que
buscando al jefe de servicio salgan las cuatro cuentas que pidió.

*Quién las ve, dicho en los dos formularios:* solo un administrador, que es lo
que esta pantalla exige entera. **La persona titular no las ve nunca.** Esa
frase es parte del campo: una nota sobre alguien se escribe distinta según quien
vaya a leerla, y dejarlo a la interpretación de cada uno es la manera de que
acabe habiendo las dos cosas en la misma columna.

*La nota solo se manda si se tocó,* y es el único campo del formulario con ese
trato. El modal se abre con la nota tal como estaba al abrirlo y puede quedarse
abierto media hora: mandándola siempre, quien solo venía a corregir un correo
reescribiría además la nota con la copia vieja que tiene delante, borrando sin
decir nada lo que otro administrador escribió entretanto desde su pestaña.
`actualizarUsuario` ignora el campo que no viene, así que omitirla es
exactamente «no tocar». Y cuando sí se toca, lo que se guarda es `?? null`:
`undefined` no viaja en el cuerpo de la escritura y Payload dejaría el texto
anterior en su sitio, de modo que vaciar el cuadro contestaba «Cuenta
actualizada» sobre una nota intacta.

*Consecuencia mala, y hay dos.* El techo de 2.000 caracteres está escrito dos
veces —en la acción y en la pantalla— y no se puede importar de una a otra,
porque un módulo `'use server'` solo exporta funciones asíncronas; los ata
`tests/unit/notasDeCuenta.test.ts`. Y más de fondo: la plataforma estrena un
sitio donde queda escrito por qué se desactivó una cuenta, o sea un dato
personal sobre una persona identificada que viaja en cada respaldo. Eso entra de
lleno en lo que Q-005 tiene pendiente decidir, y conviene que la respuesta llegue
antes de que la columna tenga quinientas filas escritas.


### D-091 · 2026-09-13 · vigente
**`src/payload-types.ts` se regenera en el mismo cambio que el esquema, y ahora
hay quien lo vigile.**
Pasó en este mismo lote: se añadieron `encuadre` a `modelos-3d` y `puntaje`,
`puntajeMaximo` y `complicaciones` a `actividad`, se retiró `zonaMapa` de
`segmentos`, y los tipos se quedaron como estaban. **No rompe nada el día que se
atrasa**, y ahí está la trampa: `tsc` pasa, la suite pasa y el archivo sigue
describiendo el esquema de la semana pasada. La factura la paga el siguiente,
que abre `Actividad` para escribir el puntaje del caso, no encuentra el campo y
tiene que decidir si el tipo está mal o el campo no existe.
`tests/unit/tiposGenerados.test.ts` compara los nombres de primer nivel de cada
colección contra la configuración y dice qué orden ejecutar
—`npm run generate:types`, que no necesita la base levantada—.

*Lo que no comprueba, para que nadie confíe de más:* el tipo de cada campo —un
`text` que pasa a `number` no lo ve—, lo que hay dentro de un grupo o de un
arreglo, y los bloques. Reimplementar el generador de Payload dentro de una
prueba habría sido inventar una segunda fuente de verdad para comprobar la
primera. Se busca por el comentario `via the definition "<slug>"` y no por el
nombre de la interfaz, que Payload compone con sus propias reglas.

*Consecuencia mala:* una guardia más que puede fallar por una razón legítima —un
campo recién declarado, antes de regenerar— y que hay que atender aunque se sepa
la causa. Es el mismo precio que D-070 paga por la de migraciones, y se acepta
por lo mismo: una convención que solo vive en la cabeza de quien la recuerda
dura hasta el siguiente lote. Este lote es la prueba.


### D-092 · 2026-09-13 · vigente · amplía D-012 y D-050
**Las estructuras del atlas se enseñan en español, con una tabla aparte indexada
por el nombre original.**
«Quiero que haya un match entre los nombres de mi aplicación con los nombres del
atlas.» Hasta hoy el taller enseñaba «Right tibia», el archivo exportado llevaba
un objeto `Right_tibia` y la consola, que habla en español desde el primer día
(D-012), no tenía con qué casarlo. La regla contraria estaba escrita, pero no
aquí: vivía en la cabecera de `scripts/atlas/preparar.mjs` —«traducir 2.234
nombres a mano introduciría errores en el único sitio donde no se pueden
permitir»— y en `public/atlas/ATRIBUCION.md`. Ese riesgo no desaparece: se
acepta, y lo que se hizo para pagarlo está más abajo.

El atlas trae 2.234 piezas con 1.674 nombres distintos.
`src/atlas/nombres-es.json` traduce 1.663, y **once se quedan en inglés a
propósito**, porque nadie pudo asegurar su equivalente: el músculo perineal
superficial, los ocho segmentos hepatovenosos y los dos segmentos ureterales de
la arteria renal. Lo que no tiene traducción se enseña con su nombre original y
no con una traducción a ciegas: presentar una terminología inventada como
terminología es lo mismo que D-050 prohíbe con las regiones estimadas.

*El criterio es el de un traumatólogo en consulta, no el de un diccionario.*
Peroné y no fíbula, peroneo y no fibular, rótula y no patela, hallux. Los huesos
van sin «Hueso» delante salvo donde hace falta para no confundir: hueso
temporal, hueso trapecio —el músculo trapecio existe—, hueso grande. Quien añada
una fila tiene que seguir esa convención, y no la sostiene nada más que esta
entrada.

*Cómo se hizo, y lo que encontró la parte que parecía de sobra.* Dieciocho
tandas de traducción, cada una con su revisión clínica, y encima dos pasadas de
coherencia sobre la tabla entera. Esas dos pasadas encontraron fallos reales que
ninguna tanda podía ver desde dentro: el pie izquierdo decía «dedo gordo» y el
derecho «hallux», porque cada lado lo tradujo una tanda distinta; y 29 parejas
derecha/izquierda no se correspondían —una errata («Genihioideo»), concordancias
distintas, «Hueso cuboides» frente a «Cuboides»—. Medido sobre la tabla final:
632 parejas, ninguna discrepa.

*Por qué una tabla aparte y no dentro de `public/atlas/catalogo.json`.* Ese
archivo lo reescribe entero `preparar.mjs` cada vez que se regenera el atlas, y
una traducción escrita allí desaparecería sin aviso. Indexada por el nombre
original, sobrevive a cualquier regeneración que no cambie la anatomía. Por eso
el catálogo **sigue guardando el original**: es la clave de esta tabla y de las
correcciones de D-093, y un catálogo con los nombres ya traducidos dejaría las
dos sin casar con nada, sin un solo error.

*Por qué el original no se tira.* Es lo que se busca en la bibliografía y en la
Foundational Model of Anatomy, así que el árbol y el taller lo enseñan al pasar
el ratón, y la búsqueda casa en los dos idiomas: «perone» y «fibula» encuentran
la misma pieza. Y CC BY 4.0 permite traducir pero obliga a declararlo, cosa que
ahora hace `ATRIBUCION.md` (D-093).

*La búsqueda tuvo que cambiar con la tabla.* Traducidos, los nombres llevan
palabras en medio y el lado detrás —«Peroneo corto derecho»—, y buscar la
consulta de corrido dejaba «peroneo derecho» sin nada: el árbol se quedaba vacío
y el taller decía que la pieza no estaba encendida. `casaConLaBusqueda`
(`src/atlas/nombres.ts`) exige todas las palabras, en cualquier orden y sin
tildes, dentro del nombre en español o dentro del original —no media consulta en
cada uno—, y la usan el árbol y el taller, para que un buscador no encuentre lo
que el otro no. El árbol ordena con `localeCompare` en español, que pone
«Órbita» donde va y no detrás de «Zigomático». Las equivalencias español→inglés
de `buscarPiezas` se quedan: son lo único que encuentra las once sin traducir
escribiendo en español.

*Consecuencias malas, y son de mantenimiento.* **La tabla se mantiene a mano.**
Si el atlas se regenera con estructuras nuevas o renombradas, esas salen en
inglés hasta que alguien las añada, y lo único que lo delata es el aviso de la
exportación (D-094), no una prueba. **La coherencia entre lados sí la vigila
una prueba**, `tests/unit/simetriaDeLasTraducciones.test.ts`, que compara las
más de seiscientas parejas derecha/izquierda: la sostuvo primero una pasada de
revisión, y una pasada no protege la próxima fila que se corrija de un solo
lado. Se comprobó que salta rompiendo a propósito el extensor largo del hallux. Y conviene decir
con exactitud quién la revisó, porque se llegó a escribir mal: la tradujeron
agentes automáticos, dieciocho tandas con un segundo agente que hizo de revisor
clínico, más dos comprobaciones de coherencia hechas con un guion. **Ningún
médico la ha leído fila a fila.** Durante unas horas tres comentarios del código
la llamaron «revisada por un traumatólogo», porque así se describió en un
encargo, y se corrigieron antes de subir. Lo que la termina de validar es que el
traumatólogo la use y diga dónde no le suena.


### D-093 · 2026-09-13 · vigente · amplía D-050 · las ocho correcciones son catorce desde D-117
**Cada sistema del atlas cae en una capa de la simulación, y todo lo que no es
piel ni hueso es «músculo». Ocho estructuras se cambian de sistema al leer el
catálogo.**
Son dos vocabularios que nacieron por separado. El atlas clasifica por sistema
anatómico, con los identificadores de su origen —`skeletal`, `muscular`,
`integumentary`—, y la consola apaga y enciende por papel: piel, músculo, hueso,
fragmento, implante. Un modelo exportado llegaba con objetos llamados `skeletal`
o `arterial` que ningún filtro de la consola reconocía, y el traumatólogo tenía
que adivinar qué papel ponerle a cada uno. La correspondencia vive una sola vez,
`ROL_DE_SISTEMA` en `src/atlas/clasificacion.ts`, y la leen el exportador, que
la escribe dentro del archivo, y el taller de piezas, que la usa para rellenar
el caso (D-094). Con dos copias, un sistema nuevo acabaría en una capa en un
sitio y en otra en el otro.

*Por qué casi todo va a «músculo».* La consola tiene tres capas de tejido y las
ordena por profundidad, que es como se opera: se incide la piel, se separan las
partes blandas y se llega al hueso. «Músculo» es en la práctica la capa de
partes blandas, y ahí van también vasos, nervios, tendones, ligamentos y
vísceras: en un abordaje de pierna aparecen entre la piel y la tibia. Un sistema
que el atlas estrene y la tabla no conozca cae también en «músculo» y no en
«hueso»: una estructura desconocida tratada como hueso fijo quedaría encendida
debajo de todo y el residente la atravesaría sin poder apagarla.

*Las ocho correcciones.* BodyParts3D mete en el esqueleto los tres peroneos de
cada lado —corto, largo y tercero, que son músculos— y la cintilla iliotibial,
que es fascia. En el atlas era un color raro; con capas es un error clínico: con
la de músculo apagada, el peroneo corto seguía encendido pegado al peroné, como
si fuera hueso. Los peroneos pasan a músculo y la cintilla a tejido conectivo,
en `src/atlas/correcciones-de-sistema.json`, por nombre original, que es lo que
se comprueba a ojo contra la anatomía.

*Se corrige al leer, y en las dos puertas.* No en `catalogo.json`, por lo mismo
que la tabla de D-092. Y a la vez en `cargarCatalogo`, del navegador, y en
`leerCatalogo`, del servidor, que es el que exporta: corregido solo en uno, el
taller pintaría el peroneo como músculo y el archivo lo seguiría fundiendo con
el esqueleto, con el papel de hueso escrito dentro. `atlasEnEspanol.test.ts`
recorre el código y falla si alguien lee `catalogo.json` sin pasar por
`corregirCatalogo`.

*La declaración de la licencia tenía el mismo defecto, y mejor escondido.* CC BY
4.0 obliga a decir qué se modificó, y `ATRIBUCION.md` lo reescribe
`preparar.mjs` en cada regeneración. Se corrigió el archivo a mano, y la
plantilla —dentro de `preparar.mjs`, que prepara el atlas entero en cuanto se
importa, así que ninguna prueba podía llamarla— se quedó diciendo que los
nombres «se conservan en su forma original». La siguiente regeneración habría
borrado la declaración de la traducción y de las correcciones sin que nada
fallase. La plantilla se muda a `scripts/atlas/atribucion.mjs`, lee la misma
lista que la plataforma —por eso la lista es JSON y no TypeScript: el guion es
node a secas— y cuenta las cifras de regiones sobre el catálogo ya corregido;
`plantillaDeAtribucion.test.ts` compara lo que genera con lo que hay escrito. Y
la página de créditos agrupa las líneas en bloques: el archivo va cortado a
ochenta columnas y cada punto de «Cambios realizados», justo lo que la licencia
obliga a declarar, se pintaba partido en un `<li>` con media frase y un párrafo
suelto con la otra media.

*Consecuencias malas.* **«Músculo» mezcla vasos y nervios con músculos**: apagar
la capa apaga también la arteria tibial anterior, y un caso que quiera enseñar a
proteger una estructura neurovascular mientras se aparta el músculo no puede.
Separarlos exige un papel nuevo en el `select` de `src/collections/Cirugias.ts`,
con su migración, y termina en esta tabla. Las correcciones son las que se
vieron preparando una pierna, no el resultado de revisar los quince sistemas:
habrá más, y cada una pide su línea en el JSON y su porqué en la plantilla, que
eso no se deduce de la lista. Y como van por nombre, un atlas regenerado que
renombre una de las ocho la dejaría sin aplicar; la prueba que lo caza solo
corre donde el atlas está preparado.


### D-094 · 2026-09-13 · vigente · amplía D-080 y D-061 · matizada por D-109: con un corte, el atlas sí marca el fragmento
**El modelo exportado del atlas trae dentro el nombre en español y el papel de
cada objeto, y el taller de piezas rellena el caso con eso.**
D-080 tendió el puente y dejó al médico el último tramo: el taller le enseñaba
los nombres de nodo y él los copiaba al caso fila a fila, con el papel de cada
uno. Ese tramo era justo donde se rompía el «match»: los nodos venían en inglés
y el papel había que adivinarlo.

*El nombre del nodo, en español y sin tildes; la etiqueta, con ellas.* El nodo
es un identificador que se compara a mano, y «Peroné» tecleado puede llegar con
la tilde como carácter aparte —otra forma de Unicode— y no casar con el del
archivo aunque en pantalla sean idénticos, sin ningún error. Así que el nodo es
`Perone_derecho` y la etiqueta, «Peroné derecho». Los nombres que chocan se
desambiguan con `_2`, `_3`: el atlas trae 231 nombres repetidos en piezas
distintas, y «Skin» se traduce «Piel», que es también el nombre del sistema
tegumentario; con dos nodos iguales, `getObjectByName` devuelve siempre el
primero y el segundo no se puede encender ni marcar. Se empieza en `_2` porque
`_1` es el sufijo que el cargador de three pone a las mallas repetidas. El orden
es fijo, así que exportar dos veces la misma preparación da los mismos nombres y
el caso escrito contra el primer archivo vale con el segundo.

*El papel viaja en los `extras` de glTF, pegado al nodo.* `rol`, `etiqueta` y
`sistema` en cada objeto, y además `nombreOriginal` y `fma` en las piezas
sueltas, que la licencia obliga a poder rastrear. En el nodo y no en la malla
por dos lectores a la vez: `GLTFLoader` los copia al `userData` del mismo objeto
que la consola enciende por nombre, y Blender los importa como propiedades
personalizadas del objeto, visibles en su panel lateral. No hace falta
migración: todo vive en el archivo.

*«Rellenar desde el modelo».* El taller de piezas del caso lee esos `extras` y,
si el modelo los trae, ofrece llenar la lista entera. Con tres reglas que
protegen lo que el médico ya decidió: una fila que ya existe no se toca —solo se
le pone la etiqueta si la tenía vacía, porque el papel siempre tiene valor y no
hay forma de distinguir el elegido del que quedó por omisión—; un solo
fragmento, como siempre; y los objetos sin propuesta no entran, así que con un
modelo de Blender el taller se queda exactamente como estaba. El atlas **no
marca ningún fragmento**, porque qué trozo se reduce es una decisión clínica y
no anatómica, y el aviso lo recuerda. Señalar a mano un objeto del atlas también
usa su papel: con la regla de antes, el primer clic sobre «Esqueleto» —el
esqueleto entero fundido en una malla— lo convertía en el fragmento que el
residente arrastra. Y una propuesta exige uno de los cinco papeles exactos y una
etiqueta con texto, para que un `rol: "Hueso"` puesto a mano en Blender no entre
como una fila que ningún filtro reconoce; los cinco están copiados en
`ROLES_DE_PIEZA`, y `exportarAlSimulador.test.ts` los compara con el `select` de
la colección.

*Lo que se enseña al exportar, y lo que queda escrito.* El taller del atlas
pinta cada nodo con su etiqueta y su capa, con el nombre de la capa leído del
esquema del caso (`src/admin/etiquetaDeRol.ts`): las tablas escritas a mano ya
se habían separado —el taller de piezas decía «Hueso fijo» donde el formulario
dice «Hueso (fijo)»—, y un peroneo metido en el hueso tiene que verse aquí y no
dentro del simulador con la capa de músculo apagada. Las notas del modelo
repiten la lista, dicen qué salió sin traducir y cuánto se desplazó el centro
(D-096), para quien lo abra meses después.

*Consecuencias malas, las tres de uso.* **Los modelos exportados antes de hoy
conservan los nombres en inglés y no traen `extras`**: no ofrecen «Rellenar» y
hay que volver a exportarlos. Exportar crea un modelo nuevo y no toca el viejo,
así que los casos escritos contra el anterior siguen funcionando con él;
pasarlos al nuevo es cambiar el modelo del caso, y sus filas con nodos en inglés
se quedan huérfanas y hay que rellenar otra vez. **Si alguien lo reexporta desde
Blender sin marcar «Propiedades personalizadas»** (Include → Custom Properties,
desmarcada por omisión en el exportador glTF), los nombres sobreviven pero los
papeles se pierden sin aviso: el botón simplemente no aparece y el taller vuelve
al trabajo a mano. Eso no está escrito en `docs/COMO-SUBIR-UN-MODELO.md`, que es
donde lo buscaría quien lo haga. Y rellenar no corrige una fila mal puesta: si
el papel ya estaba, gana el que estaba.


### D-095 · 2026-09-13 · vigente · amplía D-048
**En el taller del atlas, el punto sobre el que gira la cámara sigue a lo que
está encendido.**
«Si dejo solo la pierna no me toma el centro de gravedad de la pierna sino todo
el cuerpo aunque no se vea.» Era literal. OrbitControls gira y acerca siempre
hacia su objetivo, y ese punto nacía en el de `VISTA_INICIAL` —el centro del
cuerpo entero, a la altura de la pelvis— y no lo movía nadie salvo «Encuadrar».
Con la pierna sola, la pierna giraba alrededor de una pelvis apagada y la rueda
acercaba la cámara a un hueco.

*Cómo se mueve, y por qué así.* Cuando cambian las piezas encendidas o la
separación, cámara y objetivo se trasladan juntos, con el mismo desplazamiento,
hasta el centro de lo visible. Mover solo el objetivo gira la imagen de golpe;
acercar la cámara, como hace «Encuadrar», cambia el tamaño; trasladar las dos
conserva dirección y distancia, y lo visible se desliza al centro sin crecer ni
encoger. Espera 250 ms sin cambios y desliza en 300: apagar veinte piezas
seguidas en el árbol es un deslizamiento y no veinte. No se recoloca si el
objetivo ya está dentro del 5 % del tamaño de lo visible, con un milímetro de
suelo, y con esa holgura el cuerpo completo no se mueve nunca —su centro está a
3,5 cm del de `VISTA_INICIAL`—, que es lo que evita que el taller dé la cámara
por movida nada más abrir y pregunte por cambios sin guardar que nadie hizo. Con
`prefers-reduced-motion`, la duración es cero. La cuenta vive en
`src/atlas/pivote.ts`, fuera del componente, para poder probarla con números sin
montar nada.

*Guardar a media espera guarda donde va a quedar.* `vistaActual()` devuelve el
destino si hay un deslizamiento pendiente; sin eso, apagar la última pieza y
pulsar Guardar enseguida guardaba el objetivo de la pelvis. Y es una pregunta
sin efectos: cuando adelantaba la espera, cada clic sobre el lienzo deslizaba la
escena bajo el cursor mientras se apuntaba a la siguiente pieza, y el clic
siguiente apagaba otra.

*Las preparaciones guardadas antes de hoy se recolocan al abrirse, también en la
ficha del residente.* Traen el objetivo del cuerpo entero: el de omisión, o el
que dejó «Encuadrar» antes de apagar el resto. Se recoloca si el objetivo es el
de omisión o si cae fuera de la caja de lo visible con un milímetro de margen
(`src/atlas/vistaGuardada.ts`), y no con el 5 % del pivote: con los cuatro
huesos de la pierna derecha la caja llega casi a la línea media por la cabeza
del fémur, y ampliada un 5 % se tragaba la pelvis entera. Un objetivo dentro de
lo visible se respeta aunque esté lejos del centro, porque el foco de fractura
llevado a mano sobre la tibia distal está casi tan lejos del centro de la pierna
como la pelvis, y es una decisión de quien preparó la vista.

*Consecuencias malas.* La cámara se mueve sola, y quien estaba mirando un
detalle ve deslizarse la escena al apagar una pieza. Las preparaciones viejas
**se corrigen al pintarse y no en la base**: su vista guardada sigue apuntando a
la pelvis hasta que alguien las vuelva a guardar. Un objetivo puesto a propósito
fuera de toda anatomía encendida se pierde al abrir. Y el precio en código es
alto: para que una cámara que se mueve sola no cuente como trabajo del
traumatólogo hicieron falta tres piezas —`irA` devuelve la vista con la que se
quedó, el visor avisa con `alAsentarVista` al terminar la descarga y el taller
vuelve a asentar su referencia—, y cada una tapa un caso en que saltaba «cambios
sin guardar» sin que nadie hubiera tocado nada, y guardar escribía encima el
encuadre movido. `cajaDeLoVisible` repite además la traslación de la separación
que ya hace `picking.ts`: dos copias de una regla que tienen que moverse juntas.


### D-096 · 2026-09-13 · vigente · amplía D-080
**El archivo exportado se centra en lo que se exporta, y la piel del cuerpo
entero se recorta a esa zona.**
La otra mitad de la misma queja, fuera del taller. Las piezas del atlas vienen
en coordenadas del cuerpo, con el origen entre los pies: una pierna derecha
exportada sola quedaba a un lado y a medio metro de altura, y cualquier visor
que gire sobre el origen —Blender, el de las fichas, el de la biblioteca— la
hacía orbitar alrededor de un punto vacío.

*El centro es el de todos los objetos juntos, y sin la piel.* Todos se trasladan
con el mismo desplazamiento, así que la tibia sigue exactamente donde estaba
respecto del peroné; centrar cada objeto por su lado los apilaría en el origen,
uno dentro de otro. La piel no cuenta para la caja porque la del atlas es **una
sola malla** de 1,72 m: con ella, una pierna exportada con su piel —justo lo que
un caso necesita para poder incidir— volvía a quedar centrada a sesenta
centímetros por encima de la tibia. Lo desplazado queda en las notas del modelo,
en milímetros: es lo que hay que sumar para devolverlo a su sitio en el cuerpo,
y la única forma de alinear dos exportaciones en Blender.

*Y la piel se recorta.* Exportar «solo la pierna» con la piel encendida metía en
el simulador una carcasa hueca con forma de persona alrededor de una tibia, y la
capa que el residente tiene que incidir no era la de la pierna. Se quedan los
triángulos cuyos **tres** vértices caen dentro de la caja de lo demás ampliada 5
cm por lado —con que bastara uno, el borde saldría dentado un centímetro más
allá—, y los vértices se compactan y se reindexan: quitar triángulos sin quitar
vértices deja en el archivo los veintitrés mil de la piel entera, y quitar
vértices sin reindexar da una malla cosida al azar que abre sin un error. Los 5
cm están medidos con el atlas instalado: la piel de una pierna con sus músculos
queda como mucho a 4,4 cm de su caja; a 6 cm empiezan a colarse trozos de la
otra pierna, y a 8 son cuatrocientos vértices. Las piezas tegumentarias que
quedan enteras fuera —cejas, pelo, labios— no se escriben, y las notas dicen
cuáles: exportar de menos en silencio es entregar una pierna a la que le falta
algo.

*El orden importa, y vive en `prepararExportacion`
(`src/lib/exportarAtlas.ts`)*: agrupar, que escribe el papel; recortar, que
necesita saber qué es piel y medir en las coordenadas del cuerpo; nombrar, para
que un objeto que se cae no reserve un nombre; y centrar al final. La acción no
llama a otra cosa, y una prueba lo comprueba.

*Consecuencias malas.* **La piel recortada deja un borde abierto**: no se cierra
por arriba ni por abajo, se ve el corte y, al mirar dentro, el músculo. Para una
pieza de disección es lo esperable y no se intenta tapar, pero en Blender parece
una malla rota, y por eso las notas del modelo lo dicen. **Donde la caja no
alcanza es el muslo**: los dos se tocan por dentro, y un fémur o un miembro
inferior entero se lleva una franja de la cara interna del otro muslo y del
periné; separar dos pieles a un centímetro pide mirar hacia dónde apunta cada
triángulo, y eso ya no es recortar sino segmentar. Con solo los huesos de la
pierna sale el 94 % de su piel: falta la cara posterior del gemelo, que no es
por donde se aborda una tibia. Y los modelos exportados antes de hoy siguen
descentrados y con la piel del cuerpo entero: se arreglan volviendo a exportar,
igual que los nombres (D-094).


### D-097 · 2026-09-13 · vigente
**Dos personas sobre la misma ficha: guardar encima de lo que otro guardó se
rechaza, con la marca de tiempo que Payload ya pone.**
`guardarDocumento` escribía el documento entero sin mirar qué había en la base.
Con dos editores en la misma patología —o el mismo traumatólogo con la ficha
abierta en dos pestañas, que es el caso corriente—, el segundo que guardaba
borraba lo del primero y los dos leían «Borrador guardado.». Lo perdido aparecía
días después, leyendo la ficha publicada.

*Por qué `updatedAt` y no un número de versión.* Payload lo pone en cada
escritura y lo devuelve en cada lectura, así que no hay campo nuevo ni
migración. El formulario manda la marca con la que abrió; el servidor lee la de
ahora —con `draft` si la colección se versiona, que es como la leyó el editor—
y, si no es la misma, no escribe. Se comparan instantes y no cadenas, porque la
misma hora llega con `Z` o con `+00:00` según la ruta; y cualquier diferencia
cuenta, también una marca anterior, que es una ficha restaurada que tampoco ha
visto quien escribe. Está en `src/admin/concurrencia.ts`.

*La trampa de guardar dos veces.* El formulario no se vuelve a montar al
guardar, así que con la marca de la apertura su segundo guardado chocaría
consigo mismo. `guardarDocumento` y `cambiarPublicacion` devuelven la marca
nueva y el formulario la adopta: la de lo que **esta pantalla** acaba de
escribir, nunca la del refresco siguiente, que podría traer ya lo de la otra
persona sin que nadie lo haya visto. Comprobado en `payload@3.88` contra
PostgreSQL: borrador, otro borrador, retirar, publicar y borrador tras publicar
dan la misma marca al escribir y al leer, al milisegundo.

*Lo que ve quien choca.* Que no se guardó y por qué, que lo suyo sigue en
pantalla, y dos salidas dentro del propio aviso: «Recargar sin perder lo
escrito», que adopta la marca de la base sin tocar los valores, y «Ver la
versión guardada ↗», en otra pestaña porque en la misma se llevaría el
formulario. El aviso no se borra con cada tecla, como los demás: mientras no se
resuelva, cualquier guardado vuelve a chocar. Y dice «otra persona, u otra
pestaña suya», porque acusar a un tercero despistaría a quien tiene dos pestañas
abiertas.

*Consecuencias malas.* **No hay fusión**: recargar conservando lo escrito y
guardar reemplaza entera la otra versión, y quien quiera conservar lo de los dos
tiene que copiarlo a mano desde la otra pestaña. Queda una ventana entre la
lectura y la escritura, y dos guardados en el mismo instante pasan los dos:
cerrarla pide la condición dentro de la consulta, y Payload no lo ofrece para un
borrador, que vive en la tabla de versiones. Una llamada sin marca se deja
pasar, para no romper a quien no abrió ninguna ficha, así que un llamador nuevo
que la olvide escribe encima como antes. No cubre las preparaciones del atlas ni
las cuentas, salvo lo que ya hace D-090 con las notas. Y depende de que Payload
siga devolviendo la misma marca al escribir que al leer: si una actualización lo
rompe, el síntoma será que cada segundo guardado del mismo editor pide recargar.


### D-098 · 2026-09-13 · vigente · amplía D-055 · el Atrás del navegador, cubierto por D-115
**La barra lateral del panel pregunta antes de sacar de una pantalla con cambios
sin guardar.**
El editor de fichas ya preguntaba en sus migas y en «Duplicar», y el taller del
atlas al cerrar la pestaña. La barra lateral, a la vista todo el rato, navegaba
sin consultar a nadie: «Comentarios» para mirar uno se llevaba media hora de
redacción o de apagar piezas. `beforeunload` no sirve, porque una navegación de
cliente del App Router no lo dispara.

*Un registro y no un contexto.* Las pantallas con trabajo pendiente se apuntan
en `src/admin/salidaDelEditor.ts` y la barra le pregunta a él, sin saber qué
pantallas existen; un contexto obligaría a envolver en un proveedor de cliente
el `layout`, que es de servidor. Cada pantalla apunta **una pregunta** y no una
bandera, por el taller del atlas: lo que puede perder incluye el encuadre, y la
cámara vive dentro de three.js y no pasa por un pintado, así que una bandera
puesta desde un efecto se quedaba con un «nada que perder» de antes de girar el
modelo. La pregunta se hace en el instante del clic, que es cuando la respuesta
vale.

*Los detalles que la hacen cierta.* Va en `onNavigate` y no en `onClick`, para
que un Ctrl+clic, que abre otra pestaña y no se lleva nada, no pregunte. «Volver
a la plataforma» y «Salir» los pinta el `layout` de servidor, que no puede
pasarle una función a un `<Link>`, y por eso se escaparon de la primera versión;
ahora van dentro de `EnlaceConGuardia` y `GuardiaDeSalida`. La frase es una
sola, `PREGUNTA_DE_SALIDA`, para las migas y para la barra: con dos redacciones,
la que suena menos grave es la que se acepta sin leer. Y una pregunta que lanza
cuenta como «hay algo que perder»: preguntar de más cuesta un clic; callar de
más, el trabajo.

*Consecuencias malas.* La pregunta es un `window.confirm`, bloqueante y sin el
aspecto del panel, porque la navegación tiene que esperar la respuesta para
poder cancelarse. La guardia cubre los enlaces del panel y no todas las salidas:
el botón «atrás» del navegador no pasa por ningún `onNavigate`. Y la siguiente
pantalla con trabajo sin guardar tiene que apuntarse ella: si no lo hace, nada
lo avisa.


### D-099 · 2026-09-13 · vigente · supera en la vía a D-088 y cierra su primer cabo · el archivo sin elegir al plegar, cerrado por D-116
**Todas las subidas van por la ruta: `subirArchivo` se retira y el cuerpo de las
acciones de servidor baja de 52 MB a 4 MB.**
D-088 dejó escrito el precio de no terminar la mudanza: mientras el selector de
archivo de un bloque (`formulario/Campos.tsx`) siguiera subiendo por la acción
vieja, `bodySizeLimit` tenía que quedarse en 52 MB, y eso significaba que
**cualquier** cuerpo de hasta 52 MB —de quien fuera, a cualquier acción— se
aceptaba y se retenía entero en la memoria del servidor. El selector sube ahora
por `api/subidas/[coleccion]`, con la misma barra de progreso que el listado de
medios.

*La acción se retira aunque ya nadie la llamara.* Una función exportada desde un
archivo `'use server'` es un extremo HTTP aunque ninguna pantalla la use:
aceptaba archivos de cualquiera con sesión de editor y escribía en la base.
Dejarla «por si acaso» obligaba además a mantener alto el límite que se venía a
bajar. `subidaDeVideo.test.ts` falla si una acción vuelve a recibir un archivo.

*Por qué 4 MB.* La acción más pesada que queda es `guardarDocumento`, con la
ficha entera y su texto rico en el árbol de Lexical. Medido con la conversión
real, una ficha de 48.000 palabras —cuarenta bloques de 1.200, con negritas cada
pocas— ocupa 1 MB, y eso ya es un libro; una ficha de verdad son unos cien
kilobytes. El 1 MB por omisión de Next no vale justo por ese libro. 4 MB son
cuatro veces el libro y trece veces menos de lo que antes podía quedarse
retenido. Y el número sale de la cadena de topes: con 52 tenía que ir por encima
de los 50 del techo de medios, y con 4, citado allí, haría creer a quien opera
el servidor que Next corta los vídeos en 4. La cadena queda en **50 ≤ 64**, y
`subidaDesdeElEditor.test.ts` lee los documentos y falla si alguien vuelve a
meter este número en ella.

*Lo que costó mudar el selector, que no era cambiar una llamada.* Con la acción,
subir eran segundos; por la ruta, un vídeo por un túnel doméstico son minutos, y
en minutos se sigue escribiendo. El `alCambiar` del selector se compone con el
arreglo de bloques del momento del clic, y llamarlo al terminar habría escrito
aquel arreglo viejo encima de todo lo tecleado durante la subida. Se lee el
último al terminar, y si el bloque se desmontó entretanto —quitado o
**plegado**, que también lo desmonta— no se escribe nada. La descripción y el
nombre del archivo se rellenan con su nombre sin extensión en vez de pedirlos
antes de subir: quien inserta una radiografía a mitad de un bloque está
escribiendo la ficha, y un cuadro que le exige «descripción» se rellena con
«aaa».

*Consecuencias malas.* Una ficha que pase de 4 MB falla con el corte mudo de
siempre: Guardar no hace nada y no dice nada. Con texto no la hay, pero queda
escrito en `docs/DESPLIEGUE.md` para que sea el primer sospechoso si pasa. El
texto alternativo de lo subido desde un bloque es el nombre del archivo
—`IMG_2034`— hasta que alguien lo corrija en Medios, que no es lo que la
exigencia de `alt` de la plataforma pide (D-089). Si se pliega el bloque a mitad
de subida, el archivo queda subido pero no insertado: aparece en el desplegable
y hay que elegirlo. Y los 50 MB siguen sin probarse por el túnel (O-044); esto
no lo cambia.


### D-100 · 2026-09-13 · vigente · cierra lo que O-040 dejó abierto
**`output: 'standalone'` solo lo pide la imagen de Docker.**
Estaba puesto para todos, y el servidor de Windows (D-060) arranca con `next
start` sobre el `.next` de siempre: `next start` vuelve a leer la configuración,
ve `standalone` y avisa en cada arranque de que esa no es la forma de lanzar la
construcción. Funcionaba igual, y justo por eso hacía daño: un aviso que sale
siempre y no significa nada enseña a no leer el registro, y es el mismo registro
donde O-040 escondió el `(y/N)` que dejaba el servidor sin servir. De paso, cada
`npm run build` en Windows copiaba un árbol de `node_modules` que nadie iba a
usar.

*Lo pide quien lo usa.* El `Dockerfile` pone `SALIDA_AUTOCONTENIDA=1` en la
misma orden que compila, y `next.config.mjs` solo enciende la salida
autocontenida con exactamente `'1'`: aceptar cualquier cosa no vacía convertiría
`SALIDA_AUTOCONTENIDA=0` en un sí. No se decide por `NODE_ENV`, que es lo
primero que se ocurre, porque `next build` y `next start` lo dejan en
`production` en las dos máquinas. Y el `Dockerfile` comprueba después que exista
`.next/standalone/server.js`, para que olvidar o renombrar la variable falle con
su nombre y no tres pasos más abajo, en un `COPY` que dice «not found».

*Consecuencia mala:* las dos máquinas ya no ejecutan la misma construcción. Lo
que solo falle en la salida autocontenida —un archivo que el trazado de
dependencias de Next no copie— no se verá en Windows ni en desarrollo, solo al
construir o arrancar la imagen. Y es una variable más que existe en un único
sitio: quien construya la imagen por un camino que no sea ese `Dockerfile` tiene
que saberla.


### D-101 · 2026-09-13 · vigente · amplía D-084 · la decisión es del equipo
**Terminar un caso quirúrgico lo da por leído.**
Hasta hoy terminar la consola guardaba puntaje y complicaciones (D-084) pero no
la lectura, así que un caso operado entero seguía contando «por leer» en la
portada hasta que el residente encontraba la casilla. Lo contrario estaba
decidido, aunque solo en un comentario de `simulador/[id]/page.tsx`: «leída» la
marca el residente cuando da la ficha por estudiada, y terminar con tres
complicaciones no es haberla estudiado. Se cambia dentro del «si hay otro punto
que no se resolvió antes, realízalo» del traumatólogo, así que **conviene que
conste que la eligió el equipo**, como D-087. El argumento: la ficha de un caso
quirúrgico es la consola, y recorrerla hasta el final es lo que el módulo pide;
las complicaciones no se pierden, se quedan en «Su recorrido anterior» y en la
portada (D-086).

*Con la misma acción que la casilla, y solo pone.* `marcarComoLeida`, y no una
escritura propia: un segundo camino hacia `completado` acabaría validando otra
cosa. Nunca quita: si el residente la desmarca a mano, esa decisión es suya
hasta que termine el caso otra vez. Va fuera de la cola de `guardarRecorrido`
porque escribe otro campo y Payload solo actualiza los que recibe, así que las
dos escrituras pueden cruzarse sin borrarse nada. Y el fallo se dice, en el
registro de la consola y en el panel de «Caso terminado»: callarlo dejaría a ese
panel afirmando que el caso cuenta como leído.

*La casilla tiene que enterarse sin recargar.* La pinta `RastreadorActividad`,
que toma su estado una vez al montar, y con la consola marcando por su cuenta
decía «Marcar como leída» seiscientos píxeles por encima de un panel que decía
lo contrario. `CasoConSuLectura` junta las dos piezas en el cliente y vuelve a
montar la casilla con cada marca de la consola; cuenta las marcas y no guarda un
booleano, por el caso de ida y vuelta —ya leído, desmarcado a mano, terminado
otra vez—. `router.refresh()` no servía: recargaría el modelo 3D y enseñaría el
recorrido recién hecho como «Su recorrido anterior» encima del marcador que lo
está contando.

*Consecuencia mala, y es exactamente el argumento de antes:* el caso terminado
con complicaciones sale de «Continúa leyendo», que es justo cuando más le
convendría al residente volver a él. Y volver a montar la casilla anota una
visita más: adelanta la `ultimaVisita` de una ficha que el residente tiene
abierta delante, que es verdad, pero es una escritura.


### D-102 · 2026-09-13 · vigente · amplía D-079
**Entrar por la dirección a un módulo que la cuenta no tiene dice «no tiene
acceso», y «Crear el primero» solo se ofrece a quien puede crear.**
La barra y la portada esconden los módulos que una cuenta no tiene, pero
esconder un enlace no cierra una dirección: llega igual quien la escribe a mano,
la guarda o la recibe de un compañero. Y lo que encontraba mentía de dos
maneras. En un listado, la regla de lectura devuelve `false` y Payload no
contesta con una lista vacía sino que lanza `Forbidden`, así que acababa en
`error.tsx` pidiendo reintentar una avería que no existe. En una ficha era peor
y más transitado —lo que se pasa un compañero es el enlace a una ficha—: el
`.catch` que convierte una ficha retirada en `notFound()` se tragaba también el
`Forbidden`, y el residente leía «Esta ficha ya no está… No es un fallo de la
plataforma» sobre un caso publicado.

*Una guardia antes de consultar, en las nueve páginas.* Los cinco listados y las
cuatro fichas preguntan a `puedeVerModulo` con el **usuario efectivo** —el que
va a la consulta: con el real, un administrador en vista previa pasaría la
guardia y se estrellaría igual— y pintan `SinAccesoAlModulo`
(`src/components/Estados.tsx`), con un solo texto que dice qué falta y a quién
pedírselo. No se arregla afinando el `.catch`: distinguir `Forbidden` de
`NotFound` por la clase del error ata la página a los nombres internos de
Payload. Las pruebas sacan la lista de páginas de `admin-panel/modulos.ts`, para
que un sexto módulo entre solo en la vigilancia.

*Se contesta con un 200 y no con un 403.* El `forbidden()` de Next es
experimental en esta versión y exige `experimental.authInterrupts`; sin la
bandera lanza un error corriente que acaba en `error.tsx`, la misma pantalla de
la que se venía huyendo. En una plataforma cerrada quien lee la respuesta es una
persona y no un buscador. Si la bandera se pone algún día, el cambio es este
componente por un `forbidden()` y un `forbidden.tsx` con el mismo texto.

*Y el estado vacío.* «Crear el primero» llevaba al panel, y el panel devuelve a
la portada sin una palabra a quien no es administrador ni editor. Para el
residente del primer día, en una plataforma que nace vacía (D-016), era el único
botón de la pantalla, y pulsarlo parecía una avería. Quedaban Técnica AO e
Imágenes: ahora se ofrece solo con `rolReal` de administrador o editor **y**
permiso sobre ese módulo, y al resto se le dice que el equipo docente lo está
preparando.

*Consecuencias malas:* la guardia está repetida en nueve páginas y la próxima
tiene que acordarse; lo que se lo recuerda es una prueba que lee el disco, no el
compilador. Y con el 200, cualquier herramienta que mire códigos de estado ve
éxito donde hay un acceso denegado.


### D-103 · 2026-09-13 · vigente · amplía D-071 y D-073
**El panel comprueba, releyendo la cuenta, que el cambio a un administrador se
aplicó, porque Payload se traga el rechazo del disparador.**
D-071 dejó pendiente traducir el rechazo del disparador del último administrador
—SQLSTATE 23514—, dando por hecho que llegaría como error. Al ir a traducirlo se
vio que casi nunca llega: el disparador es diferido y salta al confirmar, y el
adaptador de Payload (`@payloadcms/drizzle`, `transactions/beginTransaction.js`)
cuelga un `.catch` de la transacción que se traga el error del `COMMIT`.
**`payload.update` y `payload.delete` resolvían como si todo hubiera ido bien
mientras PostgreSQL deshacía el cambio.** Comprobado contra un PostgreSQL 17 de
verdad: el panel pintaba «Se retiró el acceso» en verde, recargaba la lista y la
cuenta seguía activa, sin una línea en el registro.

*Por eso se relee.* `escribirSinDejarSinAdministradores` (`acciones/admin.ts`)
escribe, vuelve a leer la cuenta y comprueba que el cambio está. Si no está y la
cuenta sigue siendo la última administradora activa, es la carrera; si no, dice
lo único cierto —que la base no confirmó— sin inventarle una causa. Si algún día
el rechazo sí sale de la llamada —sin transacción, o cuando Payload deje de
tragárselo—, se reconoce por el código recorriendo la cadena de `cause`, porque
arriba Drizzle deja un «Failed query: update "usuarios"…» con los parámetros
detrás, que era lo que llegaba al panel en crudo. Solo se relee donde el
disparador puede actuar: quitar el rol, desactivar y borrar.

*Y el mensaje decía una cosa falsa a la única persona que lo leía:* que la
cuenta tocada era la única administradora y que creara otra. Nadie puede
retirarse a sí mismo desde el panel, y el disparador, el gancho y la
comprobación previa cuentan a quien llama; si aun así no queda ninguno, la
cuenta que retiró la otra sesión **es la de quien lee el aviso**, y ya no puede
crear a nadie. Se lee su cuenta en vez de deducirlo, y se le dice así.
`TablaUsuarios` no recarga en esa rama, porque la recarga pasa por
`exigirPanel('admin')`, que lo manda al inicio y se lleva la explicación
consigo. Y un rechazo se trae a la vista aunque la región de avisos esté fuera
de pantalla: un rechazo no cambia la fila, y lo que se deduce entonces es que el
clic no entró y hay que volver a pulsar.

*Refuerza D-073.* Con la API REST de `usuarios` abierta, un `PATCH` o un
`DELETE` contestaría con éxito sobre un cambio que la base no guardó, y ahí no
hay nadie que relea. Queda escrito en la cabecera de
`(payload)/api/[...slug]/route.ts`: reabrir cualquier escritura de esa API es
reabrir también esto.

*Consecuencias malas.* Una consulta más en cada cambio de rol, desactivación o
borrado, y alguna más en la rama del rechazo. La corrección se apoya en un
detalle interno de Payload que puede cambiar en cualquier versión, en un sentido
o en el otro; lo fija `ultimoAdministradorEnElPanel.test.ts`. Y cualquier otra
restricción diferida que se añada a la base tendrá el mismo problema: Payload
dirá que la escritura fue bien.


### D-104 · 2026-09-13 · vigente · cierra el cabo de D-072 · retira el tope de lectura de D-087
**Lo que estaba copiado entre pantallas, y ya había empezado a discrepar, se
contesta en un solo sitio: la lectura, el título de una ficha, el enlace de
contraseña y el path de las cookies.**
Las cuatro tenían la misma historia: una copia por archivo, un comentario en
cada una prometiendo la mudanza, y las copias separándose antes de que llegara.

*«¿Ya la leyó?», en `src/lib/lecturas.ts`.* Estaba en las cinco páginas de
módulo, y los criterios ya eran dos: cuatro miraban la primera fila con `limit:
1` y la del examen físico se conformaba con que una dijera que sí, así que con
dos filas gemelas —las de antes del índice único de D-072— una maniobra salía
marcada y una patología en el mismo estado podía salir en blanco. La función
pregunta siempre por **una lista** en una sola consulta, porque el examen físico
pinta treinta casillas y preguntar por maniobra serían treinta viajes; va sin
tope, porque lo acota el propio `in:`, y eso retira el de 300 filas que D-087
tenía que igualar a mano con el de las maniobras; y nunca lanza, pero deja el
fallo en el registro, porque «todas las casillas en blanco» es un síntoma que
nadie relaciona con una consulta caída.

*El título de una ficha, en `admin-panel/titulosDeFichas.ts`.* `actividad` y
`comentarios` apuntan a su ficha con dos campos sueltos, y ninguna profundidad
de consulta la trae. «Fichas más leídas» rotulaba con el número de fila,
`Biblioteca de patologías · #12`; la pantalla de actividad hacía un `findByID`
por fila con un `catch` vacío que no distinguía ficha borrada de base caída, y
con la tabla sin responder pintaba las cincuenta filas «Ficha eliminada» y
mandaba a buscar en los respaldos algo que estaba en su sitio. Ahora es una
consulta por colección y cuatro estados que no se mezclan —título, sin título,
eliminada, ilegible—, con la misma redacción en estadísticas, actividad y
comentarios.

*El enlace de contraseña.* `enlaceDeClave` decía en su comentario que el panel
la llamaba, y el panel armaba su copia a mano: la misma que un día se dejó el
recorte de la barra final y entregaba `…/traumahub//clave/<testigo>`, que
atiende otra página del servidor con un 404. Ahora la llama, y pregunta
**antes** si hay dirección pública (`direccionPublica`), porque cada
`forgotPassword` invalida el testigo anterior y fallar después dejaría muerto un
enlace que quizá ya estaba entregado.

*El path de las cookies, en `src/lib/pathDeLasCookies.ts` (D-074).* Estaba
escrito en `acciones/sesion.ts` y en `api/vista-previa/route.ts`, porque ninguno
de los dos puede exportar una constante. Si se separan, borrar la cookie de
vista previa apunta a un path vacío, la simulación de rol sobrevive a cerrar la
sesión y la siguiente persona de la estación compartida empieza viendo la
plataforma con el rol de la anterior. En desarrollo no se nota: sin prefijo, las
dos copias valen `/`.

*Consecuencias malas.* Cada una de las cuatro se sostiene con una prueba que lee
el código fuente y falla si alguien vuelve a copiar, y esas pruebas son frágiles
ante un renombrado. La redacción de «Ficha eliminada» sigue escrita dos veces,
porque la tabla de comentarios corre en el navegador y no puede importarla de
una página de servidor. Y la consulta de lectura sin tope confía en que el
índice único de `actividad` siga en pie: sin él, el `in:` deja de acotar nada.


### D-105 · 2026-09-13 · vigente · amplía D-048
**Borrar una preparación del atlas se niega si alguna ficha la usa, y dice
cuáles.**
D-048 hizo reversible apagar una pieza, pero no borrar la preparación entera, y
la base no protege nada: la columna de cada tabla de bloques es `ON DELETE set
null`, así que el borrado pasa sin quejarse y deja la ficha publicada con un
visor vacío y el editor con un campo obligatorio en blanco que no deja guardar,
sin que nadie sepa qué preparación había ahí. El taller se limitaba a advertirlo
en la confirmación, y un aviso que se acepta cada vez enseña a leerlo como un
riesgo asumido.

*Dónde buscar sale de la configuración montada, no de una lista*
(`src/lib/usosDeLaPreparacion.ts`). El bloque puede ir en diez pilas —seis
pestañas de patologías y el material adicional de cuatro módulos—, y una lista
escrita a mano dejaría de estar completa, sin avisar, el día que alguien añada
una pila a un módulo nuevo. En las colecciones con borradores se mira dos veces,
con y sin `draft`: una ficha publicada con la preparación y un borrador que ya
la quitó sigue enseñándola, y la contraria la perdería al publicar. Comprobado
contra PostgreSQL, y en esa comprobación salió además que el adaptador no
distingue la pestaña —las seis comparten tabla—, por eso el mensaje nombra la
ficha y no la pestaña: esa respuesta no sería de fiar.

*Consecuencias malas.* Son una veintena de consultas pequeñas por cada borrado.
Un bloque de preparación metido dentro de otro bloque no se busca, porque esa
consulta no se escribe con `where`; hoy no existe ninguno, y el día que exista
ese es el sitio. Cada ruta trae como mucho cien fichas. Y se busca con
`overrideAccess: true` —una ficha que el editor no puede ver se rompe igual—,
así que **un editor restringido a un módulo lee en el rechazo títulos de fichas
de otros módulos**, borradores incluidos. Son títulos y no contenido, pero es la
única pantalla del panel donde pasa.


### D-106 · 2026-09-13 · vigente · amplía D-083
**Las flechas de la casilla de la escala del caso no bajan de 1, y ese suelo no
va al esquema.**
«Milímetros por unidad» tenía su guardián y su aviso en el taller de piezas,
donde el número se gasta, y la casilla donde se teclea seguía sin mínimo: la
flecha hacia abajo pasaba de 1 a 0 y de 0 a −1, que es justo el número que
espeja los seis valores del desplazamiento, sin que la casilla se diera por
enterada.

*Por qué 1 y no un número diminuto, medido en Chromium.* Con `step="any"`, una
flecha que dejaría el valor por debajo del mínimo no hace nada, y con la casilla
**vacía** cualquier flecha escribe el mínimo. Con 0,001 de suelo, pulsar una
flecha en la casilla vacía escribía una escala que encoge el hueso mil veces y
que el guardián da por buena. 1 es «exporté en milímetros», que la ayuda nombra.

*Por qué no es un `min` en `src/admin/esquema.ts`, aunque parezca su sitio.* Es
la lección de D-083: `depurarCampo` recorta contra ese `min` al guardar sin
decir nada, y un 0 guardado se volvería 1 en vez de caer al respaldo de 1000,
con el caso mil veces más pequeño y ninguna pantalla que lo enseñe. El suelo es
de la casilla y solo de la casilla; lo que decide si una escala vale sigue
siendo `escalaDelCaso`, lo mismo que decide la consola. Lo ata
`escalaEnSuCasilla.test.ts`.

*Consecuencia mala:* un 0,5 **tecleado** se sigue usando, y el navegador lo
considera por debajo del mínimo. No bloquea nada, porque el panel no valida con
el formulario nativo, pero un lector de pantalla lo anunciaría como erróneo
mientras la plataforma lo usa; por eso la casilla declara `aria-invalid`
siempre, según la plataforma y no según el navegador. Son dos criterios de
validez sobre el mismo campo, a sabiendas.


### D-107 · 2026-09-14 · vigente · amplía D-020, D-040 y D-051
**Qué puede cada rol, dicho en filas: el administrador, todo; el editor, todo el
contenido; el lector, nada del contenido pero sí lo suyo.**
El dueño lo pidió así: «que el editor pueda editar todo el contenido de la
página, el admin tenga acceso a todo y que el lector no pueda modificar nada».
`src/access/reglas.ts` ya decía algo parecido, pero lo decía función a función,
y al preguntarle a la base qué contestaba de verdad salieron seis sitios donde no
coincidía (O-046). Esta entrada es la política que los ordena; D-108, cómo se
demuestra.

*«El lector no modifica nada» quiere decir nada del contenido.* Fichas,
catálogos del simulador, medios, modelos, preparaciones del atlas y cuentas: ni
crear, ni editar, ni publicar, ni borrar. Lo que sí escribe es lo suyo —marcar
una ficha como leída, el recorrido de un caso (D-084), un comentario— y solo en
sus propias filas. Al pie de la letra, «nada» apagaba la casilla de leída, el
marcador del simulador y los comentarios, que son la mitad de lo que la
plataforma le ofrece al residente, y no es lo que se pidió.

*Editar un módulo exige verlo.* Las dos listas de D-040 se miraban por separado,
y como una lista vacía es «todos», el editor al que un administrador solo le
restringió la lectura seguía editando lo que no podía abrir. `puedeEditarModulo`
pide ahora las dos, y `puedeEditar` (`src/lib/guardias.ts`), que es a quien
pregunta el panel, también. Así se cumple lo que D-040 prometía: la capa de
módulos solo restringe, y restringir una lista nunca amplía la otra. Los
catálogos del simulador siguen colgando de cirugías (D-073), y el material de
apoyo —segmentos, medios, modelos y preparaciones— no se reparte por módulos.

*Un borrador lo lee quien puede editarlo; lo publicado, quien ve el módulo.* Era
la regla de `readVersions`, y la lectura corriente de la misma colección no la
seguía.

*El seguimiento es del administrador.* `actividad` —la lectura y el puntaje de
cada residente— solo se enseñaba en dos pantallas de administrador (D-051), pero
la colección usaba la regla de los comentarios y el editor alcanzaba las filas
de todos. Ahora va por `filtroDeSeguimiento`: el administrador, todas; cualquier
otra cuenta, las suyas, editor incluido, que también lee fichas y juega casos.

*Los comentarios los atiende el editor, pero lo escrito es de quien lo firmó.*
El editor lee y resuelve todos, porque la bandeja es suya. El texto lo reescribe
su autor y nadie más, tampoco el administrador (`soloSuAutor`, un acceso de
campo): el panel sigue enseñando cada comentario con el nombre y el correo de
quien lo escribió, y cambiarle las palabras es firmar por él. Un comentario que
sobra se borra, y borrar es del administrador.

*Escribir una fila de un módulo exige ver el módulo, y la regla es una sola.*
`creacionEnModuloVisible` (`src/access/payload.ts`) la usan `actividad` y
`comentarios`, y `anotar` y `crearComentario` le hacen la misma pregunta antes de
abrir la base, porque escriben por la API local, cuyo `overrideAccess` vale
`true` y se salta la regla de la colección. Con el usuario efectivo, como las
páginas: es el que decide qué módulos se le enseñaron.

*Y una sesión que no es de ningún rol conocido no obtiene nada.* Toda regla pasa
por `usuarioDeSesion`, que devuelve `null` ante un rol que no sea uno de los
tres. La conversión copiada a mano en `Actividad.ts`, que no lo miraba, se retira.

*Consecuencias malas.* **El editor ya no ve la actividad de los residentes: solo
el administrador.** Hoy no pierde ninguna pantalla —ya eran de administrador—,
pero ahora también se lo cierra la base, y si el traumatólogo que sigue a sus
residentes tiene cuenta de editor, que es la que `reglas.ts` le reserva, no
tiene por dónde saber quién leyó qué ni cómo le fue a cada uno en un caso.
Abrírselo pide decidir quién sigue a quién, no deshacer esta línea. **Nadie
corrige un comentario ajeno**, tampoco una errata o un dato de un paciente que se
escapó al escribirlo: la única salida es borrarlo entero, y eso solo el
administrador. Restringir la lectura de un editor le quita también la edición de
ese módulo y, si es el simulador, la del instrumental y los demás catálogos:
«corrige cirugías pero no las ve en la plataforma» ya no se puede configurar, a
propósito. «Solo lo suyo» no es «solo lo cierto»: el lector sigue escribiendo en
su propia fila el puntaje que quiera (D-084). Y lo que dejó escrito D-105 sigue
igual: un editor restringido lee títulos de otros módulos en el rechazo de borrar
una preparación.


### D-108 · 2026-09-14 · vigente · amplía D-069 y D-073
**Los permisos se demuestran llamando, y el inventario de lo que se demuestra
sale del código: una colección, una acción o una pantalla nueva sin política
declarada pone la suite en rojo.**
Los seis huecos de O-046 pasaban todas sus pruebas. Las de `reglas.ts` dicen lo
que devuelve una función, no lo que devuelve la base cuando Payload la combina
con los borradores, el acceso de campo y los ganchos, ni lo que hace una acción
que escribe con `overrideAccess: true`. Se escriben tres pruebas, una por puerta.

*`tests/integration/roles.test.ts`, contra PostgreSQL.* Ocho actores
—administrador, editor, editor restringido en la edición, editor restringido en
la lectura, lector, lector restringido, una cuenta dada de baja y nadie— por cada
colección de `COLECCIONES` y cada operación de su clase: módulo, catálogo del
simulador, material de apoyo, cuentas o filas propias. Cuatro reglas la hacen
creíble:

- **Lo esperado se escribe a mano, en términos de actores**, y no llamando a
  `reglas.ts`: calculado con la regla, un error en ella saldría en verde por los
  dos lados.
- **Se mira el efecto y no la excepción.** Una escritura rechazada es una base
  que sigue como estaba: el acceso de campo descarta el valor sin lanzar, y un
  filtro contesta cero filas en vez de un 403.
- **Las sesiones son sesiones**: cuentas creadas en la base, `payload.login` y
  `payload.auth` desde la cookie, el camino de `obtenerSesion`. La cuenta dada de
  baja es una administradora que tenía la sesión abierta cuando la desactivaron.
- **La clase de cada colección se ata a lo que la colección declara**
  —borradores, `auth`, catálogos—, para que marcar un módulo como «apoyo» no le
  quite en silencio la restricción por módulo.

Las colecciones se toman **antes** de arrancar Payload: `buildConfig` añade sus
tablas internas al mismo arreglo, y leído después la matriz pedía política para
`payload-preferences`. El último bloque repite D-073 con el manejador de verdad y
cookies de verdad: ni el administrador lista, escribe ni entra por la API REST.

*`tests/unit/accionesConGuardia.test.ts`.* Importa todo lo que exportan los
archivos de `acciones/` —cada exportación de un archivo `'use server'` es un
extremo HTTP— y lo llama con siete sesiones, vista previa incluida en los dos
sentidos, contra un doble de Payload que apunta cada método que se le pide. Una
sesión que no debe pasar tiene que salir sin haber tocado nada. Cada acción está
clasificada por guardia, y las de `contenido.ts` y `atlas.ts` no pueden
clasificarse «de sesión»: sería la forma más corta de poner verde una acción sin
guardia.

*`tests/unit/panelPorRol.test.ts`.* Las pantallas del panel se descubren del
disco y se llaman con cada sesión: la que no deja entrar tiene que echar sin
haber consultado nada. Buscar `exigirPanel('admin')` en el texto aprobaría una
página que la llama después de leer las cuentas. Va también la descarga de un
respaldo, que es la base entera y no pasa por `exigirPanel`.

*Un detalle que roza D-071.* La matriz crea su propio administrador y lo borra
al terminar. Sobre una base recién migrada ese es el último, y el disparador lo
impide, como tiene que hacer; dejarlo vivo apagaría `/instalar` con una cuenta
cuya clave nadie conoce. Así que, **solo si antes de la prueba no había ningún
administrador activo**, se borra con el disparador apagado dentro de una única
transacción: `ALTER TABLE … DISABLE TRIGGER` es transaccional, y ninguna otra
sesión llega a verlo apagado.

*Consecuencias malas.* **La política está escrita dos veces a propósito**, en
`reglas.ts` y en la matriz, y cambiarla es cambiar las dos: quien toque solo una
verá un rojo que parece un fallo y es el aviso. La matriz escribe en la base
donde corre —cuentas, fichas y archivos en `medios/`— y lo retira al terminar;
si el proceso muere a medias se queda todo, con `roles-` en el nombre, así que
conviene una base desechable. Es lenta: cada operación por ocho actores, cada
una con su propio documento. Las dos pruebas unitarias usan un doble de Payload:
demuestran que la guardia corre antes de tocar, no que la base obedezca, y eso
solo lo dice la matriz, que necesita PostgreSQL. El camino del disparador apagado
es código de prueba tocando la única garantía de D-071, y hay que leerlo con ese
respeto. Y `AGENTS.md` sigue diciendo que `npm run test:integration` son «las
seis pruebas de acceso»: la carpeta trae ya la matriz entera.


### D-109 · 2026-09-14 · vigente · amplía D-080 y matiza D-094
**El taller del atlas exporta un hueso partido por un plano, con un corte limpio
y tapado, y enseña el plano sobre el hueso antes de exportar.**
El traumatólogo lo pidió —«quiero poder por ejemplo quebrar el hueso o la malla
que tengo»— y, al preguntarle, eligió «un corte limpio sirve». Hasta hoy el
fragmento que reduce el residente tenía que llegar ya partido de Blender: era la
única pieza de un caso que no se podía armar desde la plataforma.

*Cómo se pide.* En el panel de exportar, junto a una pieza suelta que sea hueso,
«Partir con un corte», con cuatro mandos: la altura, del 5 al 95 % de proximal a
distal; la inclinación, de 0 a 60°; la cara por la que el trazo sube más
proximal, y el trozo que se mueve. Nace transversal, a media diáfisis y moviendo
el distal, que es el que se tracciona en quirófano. Los límites dejan fuera el
casquete articular de milímetros y la lámina casi longitudinal. Uno por archivo:
el caso mueve un único fragmento, y la regla se comprueba sobre lo que va a
salir, para que se ponga roja el día que alguien convierta el corte en una lista.
El servidor se niega, con palabras, si la pieza no está en la preparación
guardada, si no es suelta —el «fragmento» sería el esqueleto entero—, si no es
hueso o si el plano no la corta.

*Lo que sale.* Dos objetos, `Tibia_derecha_fragmento_proximal` y `…_distal`,
cerrados por la cara del corte y encajados: el hueso se sigue exportando
reducido, y el desplazamiento lo pone el caso. El elegido lleva ya el papel de
`fragmento`, así que «Rellenar desde el modelo» lo marca solo. **Matiza D-094**,
que dejó escrito que el atlas no marca fragmento porque qué trozo se reduce es
una decisión clínica: sigue sin marcarlo por su cuenta, y lo marca cuando el
traumatólogo ya la tomó en los mandos.

*Tres decisiones del corte, las que se ven al separar el fragmento*
(`src/lib/osteotomia.ts`). Los triángulos que cruzan el plano se parten por él:
quedarse con los enteros deja un borde en dientes de sierra que no encaja. Se
tapa en los dos trozos, porque el hueso del atlas es una cáscara y se vería hueco
justo donde mira el residente; la tapa se triangula con el Earcut de three,
decidiendo qué contorno es agujero de cuál, y se reabre en abanico donde Earcut
quita puntos alineados, que si no dejan una grieta de anchura cero. Y cada trozo
sale cerrado: los vértices se sueldan por posición, a una décima de micra, porque
el atlas repite vértices en las costuras y por índice la tibia parece abierta; y
el plano se aparta una micra de todo vértice que caiga encima, para que cada
vértice sea de un lado. `osteotomia.test.ts` lo mide con volúmenes: los dos
trozos suman el hueso, y una malla que no cierra no tiene volumen que cuadre.

*El eje se mide en la forma, no en la caja.* La caja va alineada con el cuerpo, y
el fémur lleva su eje a unos siete grados de la vertical: un «transversal» de
caja saldría oblicuo. `ejeDelHueso` toma la dirección principal de la
superficie, ponderada por área para que las epífisis, con más vértices, no tiren
de él. Proximal es el extremo de arriba si el eje va más vertical que
horizontal, y el más cercano al eje del cuerpo si no; la cara lateral se orienta
por el lado de la pieza, así que 90° es lateral en las dos piernas. Por eso se
parte **antes** de centrar: centrada, la tibia derecha queda en x = 0 y lo
lateral saldría medial sin un error.

*Lo que se ve es lo que sale.* La vista previa dibuja un disco magenta —no rojo,
que es el color del músculo y de las arterias del atlas; no azul, que es el
resaltado—, con un aro que se ve a través del hueso y una bola en el trozo que se
mueve, calculados con las mismas funciones y los mismos vértices que el
servidor. Esas funciones viven en `src/lib/planoDeCorte.ts`, que se prohíbe
importar three para que el taller las use sin deshacer el `dynamic()` de su
visor; la parte que parte la malla sí lo necesita, y el taller no la importa.

*Consecuencias malas.* **Es un plano.** No hace una fractura conminuta, ni una
en cuña, ni una compleja —las B y C de AO dejan tres fragmentos o más—, ni una
espiroidea, que se aproxima con una oblicua y se ve recta; y **no parte dos
huesos a la vez**, así que la tibia y el peroné de una fractura de pierna no
salen rotos juntos. La cara del corte es plana como la de una sierra, no un trazo
de fractura. Un hueso redondo —la rótula, el carpo— no tiene eje largo, y el que
sale es el que sea; la regla de proximal no significa gran cosa en una costilla o
en la pelvis. Si la malla del atlas trae algún agujero, el contorno que no cierra
se queda sin tapa, y lo dice la primera línea de las notas del modelo. Y la vista
previa solo mide piezas que estaban encendidas al cargar la escena: sin
geometría, no hay plano que dibujar.


### D-110 · 2026-09-14 · vigente · amplía D-096 y D-109
**El fragmento sale con el origen de su nodo en el foco de la fractura, no en el
centro del modelo.**
La consola mueve el fragmento con `position` y lo gira con `rotation`, y three
gira un objeto alrededor del origen de su nodo. `escribirGlb` escribía todos los
nodos sin traslación, así que ese origen era el centro del archivo (D-096): con
la tibia y el peroné derechos y el corte al 30 %, a 8,6 cm del foco. Corregir 15°
de angulación desplazaba entonces el trozo más de 2 cm en arco, y el residente lo
veía irse de lado al enderezarlo. Un fragmento hecho en Blender trae el origen
donde lo dejó su autor, así que el modelo armado en la plataforma se manejaba
peor que uno traído de fuera, que es lo contrario de lo que se buscaba.

*Cómo.* `pivoteEnElFoco` resta a las posiciones del fragmento el punto del eje
por el que pasa el plano y lo escribe como `translation` del nodo: cada vértice
sigue en el mismo sitio del mundo, el archivo se ve igual y pesa lo mismo. Va
**después** de centrar, porque centrar resta a las posiciones y no sabe de
traslaciones: hecho antes, el fragmento quedaría descentrado dos veces. Solo el
fragmento, que es lo único que la consola gira; el resto conserva el origen en
el centro, que es lo que D-096 promete. Sin traslación `escribirGlb` no escribe
la clave, y un archivo sin corte sale igual byte a byte. La consola ya medía el
desplazamiento contra la posición con la que carga el nodo
(`origenDelFragmento`, en `LienzoQuirurgico.tsx`), así que no hubo que tocarla.

*Consecuencias malas.* El pivote es el centro de la sección sobre el eje: en una
oblicua larga, las puntas del trazo quedan lejos de él. Un lector del archivo que
ignore la traslación del nodo vería el fragmento desplazado; three y Blender la
respetan, pero si en Blender alguien aplica las transformaciones del objeto antes
de reexportar, el origen vuelve al centro y el fragmento vuelve a girar lejos del
foco, sin aviso. Y un caso que cambie a un modelo con el origen en otro sitio
conserva sus giros y su desplazamiento como números, pero ahora giran sobre otro
punto: la pose de partida se parece a la de antes y no es la misma, y hay que
mirarla una vez en la consola.


### D-111 · 2026-09-14 · vigente · amplía D-080
**Exportar una preparación se puede llamar sin sesión: la acción se queda en la
guardia y una llamada, y el trabajo vive en `src/lib/exportarPreparacion.ts`.**
Todo estaba dentro de la acción `exportarComoModelo`, y una acción de servidor
lee la cookie antes de hacer nada: un guion lanzado con `npx tsx` no tiene
cookie que leer. Para armar un caso entero sin salir de la plataforma (D-112), el
guion necesita llamar a lo mismo que el botón, no a una copia que se desvíe con
el tiempo. La acción conserva `exigirEditor`, la llamada y `revalidatePath`, que
fuera de Next no existe.

*Sin guardia a propósito, y sin `'use server'` nunca.* Quien la importa desde una
acción ya pasó por `exigirEditor`; quien la importa desde un guion ya tiene la
base en la mano. Con esa línea arriba, cada exportación del archivo sería un
extremo HTTP abierto. Lee y crea con `overrideAccess: true` escrito, que era lo
que la acción hacía por omisión; con `usuario`, en su nombre, y sin él, sin nadie
detrás. El catálogo se recuerda ya corregido y por directorio, porque un guion
puede apuntar a otro atlas en el mismo proceso.

*Tres pruebas se quitaron en vez de mudarse.* Leían el texto de la acción —que
llamaba a `prepararExportacion`, que escribía los avisos, que leía el catálogo
corregido— y se pusieron rojas con la conducta intacta: vigilaban dónde estaba
escrita una línea. La conducta ya se prueba llamando, y `exportarConCorte.test.ts`
añade la puerta sin sesión con la tibia de verdad, abriendo el archivo con el
cargador del navegador.

*Consecuencias malas.* Hay en `src/lib` una función que crea documentos
saltándose los permisos, y lo único que la separa de un extremo abierto es que
nadie la importe mal: una ruta de `api/` o una acción nueva que la llame sin
guardia la abre, y `accionesConGuardia.test.ts` solo mira la carpeta `acciones/`.
Un modelo creado por un guion no lleva autor. Y la guardia ya no está junto al
trabajo que protege: quien lea `exportarPreparacion` tiene que fiarse de su
cabecera.


### D-112 · 2026-09-14 · vigente · amplía D-109 y D-111 · el corte lo eligió el equipo, no el traumatólogo
**La «pierna derecha» del traumatólogo entra en el caso de prueba con un guion
que simula por omisión y que se puede lanzar las veces que haga falta.**
Lo pidió así: «actualmente tengo uno llamado pierna derecha, quiero que ese esté
en el caso de prueba». La preparación existe solo en la base del servidor, así
que no se puede hacer desde el portátil de desarrollo:
`scripts/pierna-derecha-en-el-caso.ts` se ejecuta allí, desde la carpeta del
proyecto. Busca la preparación, comprueba que trae la tibia derecha, la exporta
partida con `exportarPreparacion` —la misma función que el botón— y pone el
modelo en el caso: rellena las piezas como «Rellenar desde el modelo» y traduce
lo que ve cada paso.

*Simular no es un `if` delante de cada escritura.* Sin `--aplicar`, el guion
recibe una base envuelta que no deja escribir: `create` devuelve un documento de
mentira y cualquier otra escritura es un error. Así, la escritura que alguien
añada mañana y se olvide de condicionar falla al simular en vez de escribir, y lo
que se imprime —nodos, papeles, peso— sale de la exportación de verdad y no de
una estimación.

*Idempotente comparando el archivo.* Cada pasada exporta en memoria y reutiliza
un modelo ya creado solo si su archivo en el disco es, byte a byte, el que acaba
de salir. La primera versión decidía por las notas y por la fecha de guardado de
la preparación, y ninguna de las dos mira dentro: una corrección del atlas
(D-117) o un arreglo del exportador cambian el archivo sin cambiar ni la versión
del atlas ni la preparación, y el guion contestaba «el caso ya está así» con el
modelo viejo. La exportación es determinista, así que el archivo responde
exactamente a la pregunta: ¿es este el modelo que saldría hoy?

*El corte sale de la clasificación del caso* (`corteParaLaFractura`). 42-A3,
transversa: 0°. 42-A2, oblicua —la del caso de prueba—: 45°, lejos del borde de
los 30° de AO y del tope de 60° de los mandos. 42-A1, espiroidea: la misma
oblicua, con un aviso de que el trazo sale recto. B y C: se para. A media
diáfisis; más proximal por la cara lateral, porque la consola abre mirando la
pierna de frente y así el trazo se ve oblicuo sin girar la cámara; y moviendo el
distal, que es el que el caso ya movía.

*Lo que no toca, y dónde se para.* Primero quita las piezas que nombran objetos
que el modelo nuevo no trae y después rellena: con `tibia_distal` todavía de
fragmento, la regla de uno solo metería el trozo nuevo como hueso fijo. Cada paso
cambia sus objetos por los del modelo nuevo con el mismo papel, y lo que se queda
sin equivalente se dice, porque un paso sin lo que enseñaba hereda lo del
anterior sin ningún error. El desplazamiento inicial y las tolerancias no se
tocan: van en milímetros, y la escala del modelo es otro número. Se para sin
escribir si hay cero o varias preparaciones con ese nombre —no elige cuál de dos
«pierna derecha» va al caso—, si la fractura no se hace con un corte o si el caso
tiene cambios en borrador, que guardarlo publicaría. Y todo lo que imprime pasa
por `sinSecretos`: un error de conexión de PostgreSQL puede traer la clave dentro.

*Consecuencias malas.* **La inclinación de 45°, la cara lateral y la media
diáfisis las eligió el equipo leyendo AO**, no el traumatólogo, y conviene que
conste, como en D-101: es la fractura que va a ver el residente. Cada vez que
cambie lo que sale del exportador, el guion crea otro modelo y el caso pasa a él:
el encuadre capturado sobre el anterior (D-082) se queda allí, y los modelos
viejos se acumulan en el catálogo sin que nadie los retire. El desplazamiento
conservado gira ahora sobre el foco (D-110), así que la pose de partida hay que
mirarla una vez. Sirve para la diáfisis tibial y nada más. Y el nombre del caso
está copiado de `scripts/caso-de-prueba.ts`, porque aquel se ejecuta al
importarlo; si allí cambia, aquí no se encuentra el caso, y lo dice.


### D-113 · 2026-09-14 · vigente · amplía D-036 · cierra la deuda de respaldo de D-060
**El servidor Windows se respalda solo cada noche con el gemelo en PowerShell de
`respaldar.sh`, y lo dice en cada línea del registro mientras la copia viva en el
mismo disco que la base.**
D-060 dejó escrito el precio de montar la plataforma sin Docker: los guiones
`.sh` no corren allí y **ese despliegue no tenía respaldo automático**. El dueño
lo describió como «si el disco falla o alguien borra algo, no hay copia». Se
escriben `scripts/respaldar.ps1`, `restaurar.ps1` e
`instalar-respaldo-programado.ps1`, y lo que comparten, en `respaldo-comun.ps1`.

*Gemelo, no primo.* Los mismos dos archivos —`base-AAAAMMDD-HHMMSS.sql.gz`, en
texto plano con `--clean --if-exists`, y `medios-….tar.gz`—, en el mismo
`RESPALDOS_DIR`, con la misma retención de 30 días contada como `find -mtime
+30`. El panel los lista sin saber de dónde vienen, y un volcado de aquí se
restaura allí y al revés. `respaldoEnWindows.test.ts` compara el nombre con el
patrón del panel: si se separan, se respalda cada noche y la pantalla dice que no
hay ninguno.

*Un respaldo no es bueno hasta que se ha leído entero.* Se escribe como
`….parcial` y solo se renombra comprobado, para que un corte de luz no deje un
volcado cortado con nombre de respaldo bueno. Y comprobado quiere decir tres
cosas, porque cada una se vio fallar sola: el tamaño que declara el pie del
gzip, ya que el `GZipStream` de .NET lee un archivo cortado hasta donde llega sin
protestar; la cabecera y el pie de `pg_dump`; y que el `\restrict` del principio
se cierre con su `\unrestrict`, que desde PostgreSQL 17.6 va **detrás** del pie,
de modo que cortar veinte bytes dejaba el pie intacto y el archivo fallaba en la
última línea de `psql`. Se probó cortando 4, 8, 12, 20 y 200 bytes de un volcado
real. La retención solo corre tras un respaldo bueno: si llevara un mes fallando,
no se lleva el último que sirve.

*La clave no se escribe en ningún sitio.* `DATABASE_URI` se lee del `.env` al
ejecutarse, y solo de ahí, para que una variable olvidada en la consola de quien
lo lanza no desvíe el respaldo a otra base. Viaja a `pg_dump` en `PGPASSWORD`,
con `--no-password` —sin él, a un `pg_dump` sin clave le da por preguntarla y la
tarea se queda «En ejecución» para siempre, la forma de D-061 y O-041—, y todo lo
que llega al registro pasa por un filtro que la tapa aunque `pg_dump` la repita
en su error.

*Tarea como SYSTEM, a las 03:00.* SYSTEM porque es la cuenta de `postgresql-17` y
de `traumahub`: lee el `.env` sin tocar permisos, crea archivos que el panel
puede borrar, y no pide contraseña, que con una cuenta de usuario habría que
guardar y dejaría de funcionar en silencio el día que se cambiara. Con
`-StartWhenAvailable` para el equipo apagado a esa hora, sin instancias dobles y
con un límite de tiempo. El instalador se puede repetir, y ejecuta la tarea una
vez esperando a que acabe, que es lo único que demuestra que SYSTEM puede con
todo antes de la noche en que haga falta.

*Restaurar es todo o nada.* `restaurar.ps1` comprueba antes de tocar, pide
escribir `RESTAURAR`, respalda lo actual, para el servicio, carga en una sola
transacción con `ON_ERROR_STOP` entregando los bytes a `psql` sin pasar por la
tubería de PowerShell —que cambia cada tilde por `?`—, extrae los medios de la
misma marca y vuelve a levantar el servicio pase lo que pase. Se probó con
PowerShell 5.1 contra PostgreSQL 17.11 en una base desechable: se estropeó, se
restauró, y volvieron las filas con sus tildes y el mismo md5.

*Los `.ps1` van sin tildes ni eñes.* PowerShell 5.1 lee un archivo sin BOM como
ANSI, y basta un clon de git para perder el BOM. Es una excepción al «todo en
español» que impone el intérprete, como en los `.sh`.

*Consecuencias malas.* **Sin más, los respaldos viven en el mismo disco que la
base**: protegen de un borrado o de una migración que sale mal, no de que el
disco muera, que es la mitad de lo que se pidió. Hace falta una segunda
ubicación, `RESPALDOS_COPIA_DIR` en otro disco físico, y **eso lo decide el
dueño**: un USB que se quede enchufado vale; una letra de red no, porque SYSTEM
no la ve, y una carpeta compartida de otro equipo de casa casi nunca le da
permiso. Mientras no esté, cada línea del registro dice `AVISO sin copia fuera
del disco`, comparando el disco físico y no la letra, porque un `D:` del mismo
disco muere con él. Esa copia, además, saca del equipo la base entera, con
correos y contraseñas cifradas. **No hay ningún respaldo hasta que alguien
ejecuta el instalador** desde una consola de administrador. Quien pueda escribir
en `scripts\` ejecuta código como SYSTEM esa noche; no abre nada que el servicio
no abriera ya, pero es la razón para no dar escritura sobre esa carpeta a nadie
más. `C:\PostgreSQL\17\bin` cambia con la versión mayor, y el día que se
actualice la tarea falla con su línea en el registro hasta reinstalarla con
`-BinPostgres`. Restaurar extrae los medios encima: no borra lo subido después,
pero tampoco lo que sobraba. Y la ejecución real de los guiones solo se prueba en
Windows; en cualquier otra máquina esa parte de la suite se omite.


### D-114 · 2026-09-14 · vigente · amplía D-113
**«Respaldar ahora» deja la clave de la base fuera de la línea de órdenes y
encuentra `pg_dump` en el servidor Windows.**
Dos arreglos del botón del panel que salieron al escribir D-113. `crearRespaldo`
llamaba a `pg_dump --dbname <uri>` con la URI entera, y la línea de órdenes de un
proceso se lee desde fuera de él mientras dura —en Linux, cualquier usuario de la
máquina la ve en `/proc`—. `separarClave` la parte en dos: la URI sin clave va en
los argumentos y la clave en `PGPASSWORD`, en el entorno del proceso hijo, que es
lo que recomienda PostgreSQL y lo que ya hace el guion nocturno.
`claveFueraDeLosArgumentos.test.ts` mira lo que recibe `spawn` de verdad, no el
texto de la fuente.

*Y el botón salía apagado justo donde hacía falta.* Buscaba `pg_dump` en el
`PATH`, y el PostgreSQL del servidor se instaló desde el ZIP en
`C:\PostgreSQL\17\bin` sin añadir esa carpeta al `PATH` del servicio.
`rutaDePgDump` mira primero `PG_DUMP`, después esa carpeta en Windows y por
último el `PATH`.

*Consecuencias malas.* La carpeta lleva la versión escrita: al pasar a
PostgreSQL 18 el botón vuelve a salir apagado sin decir por qué, hasta poner
`PG_DUMP`, que es una variable más que solo conoce este archivo. Una clave
pasada como parámetro de la URI (`?password=`) y no en sus credenciales seguiría
viajando en los argumentos. Y el botón sigue respaldando **solo la base**: los
medios, que son lo irreemplazable, los lleva el guion nocturno, y un respaldo
«de antes de una maniobra» hecho desde el panel no los incluye.


### D-115 · 2026-09-14 · vigente · amplía D-098
**Atrás y Adelante del navegador preguntan antes de sacar de una pantalla del
panel con cambios sin guardar.**
D-098 lo dejó escrito como consecuencia mala: la guardia cubría los enlaces del
panel, y los dos botones del navegador no pasan por ningún `onNavigate`. Tampoco
por `beforeunload`, porque dentro del App Router son un `popstate`. Y un
`popstate` no se puede cancelar: cuando llega, la dirección ya cambió.

*Se deja pasar el viaje, se pregunta y, si la respuesta es quedarse, se hace el
viaje contrario* (`vigilarSalidasDelNavegador`, `src/admin/salidaDelEditor.ts`).
Para volver hay que saber cuántas entradas se saltó —Atrás mantenido abre un menú
y salta varias de golpe—, y eso lo da la Navigation API: `currententrychange`
trae la entrada de la que se sale y `currentEntry` la de llegada, las dos con su
índice. Solo los viajes por el historial: los `push` y `replace` son de un
enlace que ya preguntó, y un cambio de solo ancla no desmonta nada.

*El router de Next no puede ver ni la ida ni la vuelta.* Si ve la ida, pinta la
otra pantalla y desmonta el editor con la pregunta abierta; y cualquier viaje que
ve **descarta la acción del router que haya en cola**, que puede ser el
`router.refresh()` de guardar o el `router.replace()` que lleva una ficha nueva a
su dirección definitiva. No se puede pasar antes que su oyente —en `window`
corren por orden de registro, medido en Chrome 152— ni cambiar un evento ya
creado. Lo que sí hace Next es ignorar un `popstate` sin `state`, y
`currententrychange` llega antes: así que, decidido volver, se tapa el `state`
del prototipo de `PopStateEvent` hasta la tarea siguiente, cuando ya han corrido
todos los oyentes. Ni al final del propio oyente, que a veces corre antes que el
de Next, ni en una microtarea, que el navegador vacía entre oyente y oyente.

*Por qué no una entrada de historial de más*, que es la técnica habitual. Hay
que quitarla al guardar, y quitarla es un `history.back()` que Next vería justo
con el `refresh` del guardado en cola: una ficha nueva se quedaría en `/nuevo` ya
creada en la base, y el siguiente guardado crearía otra.

*Una sola guardia, en el `layout.tsx` del panel* (`GuardiaDeAtras`), y no una
por pantalla: dos preguntarían dos veces por el mismo viaje, y la pantalla nueva
con trabajo sin guardar no tiene que acordarse de nada más que de apuntarse al
registro de D-098. Pone además un `beforeunload` para quien no tuviera el suyo.

*Cómo se prueba.* `atrasDelNavegador.test.ts`, con un navegador de juguete que
reproduce lo medido y que lee de `app-router.js` las dos líneas de Next de las
que todo depende, para que una actualización que las cambie falle aquí y no en la
pantalla. Y `tests/e2e/atrasDelNavegador.spec.ts`, en un Chromium de verdad, con
un último grupo contra el panel y el editor de fichas. Ese grupo pide una cuenta
(`E2E_CORREO` y `E2E_CLAVE`): sin ella se omite, y con `EXIGIR_E2E_PANEL=1` falla,
que es la trampa de D-069 con el mismo remedio.

*Consecuencias malas.* **Sin Navigation API no hace nada con Atrás**: Firefox
antes del 147 y Safari antes del 26.2 siguen saliendo sin preguntar. Se parchea
un prototipo global del navegador mientras el panel está montado, y todo se
apoya en un detalle interno de Next —`if (!event.state) return`— que puede
cambiar en cualquier versión; lo vigila una prueba que lee su código, no el
compilador. Mientras la pregunta está abierta la barra de direcciones ya enseña
el destino, porque el viaje ocurrió, y al cancelar puede verse un salto de
desplazamiento de un fotograma. La pregunta sigue siendo un `window.confirm`.
Solo cubre el panel: un comentario a medio escribir en una ficha de la
plataforma se sigue perdiendo con Atrás. Y las pruebas de extremo a extremo con
cuenta no están en «Antes de subir»: nada las corre si nadie se acuerda.


### D-116 · 2026-09-14 · vigente · cierra el cabo del plegado de D-099
**Plegar, mover o guardar un bloque mientras sube su archivo ya no deja el
archivo sin elegir: lo apunta el editor de bloques, que busca el bloque por su
clave en el momento de escribir.**
D-099 lo dejó como consecuencia mala. El editor no pinta el cuerpo de un bloque
plegado —con doce bloques de texto rico serían doce TipTap montados—, así que
plegar desmontaba el selector con la subida en marcha, y al terminar no quedaba
nadie que pudiera escribir sin estropear algo: el `alCambiar` que se llevó
cerraba sobre el arreglo de antes, y llamarlo borraba lo tecleado después o, con
los bloques reordenados, apuntaba el archivo en el que ocupaba ahora aquel
sitio. El archivo quedaba subido, y había que buscarlo en el desplegable sabiendo
que había que hacerlo.

*Escribe quien sigue montado.* `EditorDeBloques` presta a cada campo directo de
un bloque un escritor (`escritorPorClave`, `src/admin/identidadDeBloques.ts`) que
lee el arreglo **al escribir**: busca el bloque por su clave estable y, si ya no
está —porque se quitó—, no escribe, para no resucitarlo. Lo último pintado se
guarda en `useLayoutEffect`, que corre dentro del mismo commit, porque entre un
commit y sus efectos pasivos cabe la tarea que cierra la subida. Montado, el
selector también escribe primero por ahí: su propio `alCambiar` puede ir un
pintado por detrás.

*Guardar durante la subida le cambiaba el nombre al bloque.* Un bloque nuevo se
llama `c7` hasta que se guarda, y vuelve del servidor con `id` y sin `_clave`,
que no viaja por diseño. La subida no lo encontraba, y además el `key` de React
cambiaba: el bloque se desmontaba, la barra de «Subiendo…» desaparecía —que se
lee como una subida cancelada y se contesta subiendo otra vez— y un bloque
plegado se desplegaba solo. `clavesQueRecibieronId` empareja lo enviado con lo
recibido por posición y conserva el nombre de pila, y lo hace todo o nada: si una
sola posición no cuadra, no empareja ninguna, porque apuntar el archivo en otro
bloque es peor que no apuntarlo. No estaba en la primera versión: lo encontró un
revisor leyendo, y la prueba de entonces, que imitaba `Campos.tsx` con una ficha
de mentira y vigilaba el cable con expresiones regulares, no lo habría visto
nunca. Por eso `plegarDuranteLaSubida.test.ts` monta el componente de verdad, en
`happy-dom` y en `StrictMode`, y `tests/e2e/plegarDuranteLaSubida.spec.ts` lo
repite contra la aplicación con la subida retenida hasta terminar de plegar y
mover.

*Consecuencias malas.* **Cambiar de pestaña en la ficha desmonta el editor de
bloques entero**, y entonces la subida no tiene a quién pedirle el arreglo
vigente: el archivo queda subido y sin elegir, como antes, y así seguirá
mientras cada pestaña monte su propio editor. Tampoco llega a un campo metido en
un grupo o una lista dentro del bloque, ni a un bloque sin clave estable: en los
dos casos, lo de antes. Si el guardado devuelve los bloques con otro largo u
otro orden, el emparejamiento se rinde y el archivo queda sin elegir. Y
`happy-dom` no está en `devDependencies`: llega con el editor de Payload, y el
día que desaparezca la prueba fallará al arrancar.


### D-117 · 2026-09-14 · vigente · amplía D-093
**Seis estructuras más cambian de sistema al leer el catálogo: los tibiales
anterior y posterior pasan a músculos, y las encías, a aparato digestivo.**
D-093 lo anunció en sus consecuencias malas: las ocho correcciones eran las que
se vieron preparando una pierna, y habría más. Salieron partiendo esa misma
pierna. BodyParts3D guarda en el esqueleto el tibial anterior y el posterior de
cada lado, y en la reducción de la tibia derecha (D-112) salían fundidos con el
hueso y se veían pegados a él con la capa de músculo apagada. Las encías de los
dos maxilares vienen con los dientes, y en la simulación entraban en la capa de
hueso.

*El mismo camino, sin tocar nada más.* Una línea por estructura en
`src/atlas/correcciones-de-sistema.json`, por nombre original, y su porqué en la
plantilla de `scripts/atlas/atribucion.mjs`, que regenera la declaración de
cambios que exige CC BY 4.0: pasa de ocho correcciones a catorce, y las cifras de
piezas sin región se recuentan sobre el catálogo corregido.

*Consecuencias malas.* **Los modelos ya exportados siguen con los tibiales
dentro del esqueleto**, y un caso escrito contra uno de ellos los enseña pegados
a la tibia hasta que se vuelva a exportar; el guion de D-112 lo recoge solo,
porque compara el archivo. Siguen yendo por nombre, así que un atlas regenerado
que renombre una la deja sin aplicar. Siguen siendo las que se han visto, no el
resultado de revisar los quince sistemas. Y el párrafo nuevo del porqué salió
con una línea mucho más larga que las ochenta columnas del resto, en la plantilla
y en `ATRIBUCION.md`: no rompe nada, pero es la clase de desigualdad que la
siguiente edición a mano copia.

### D-118 · 2026-09-14 · vigente · amplía O-022
**Todos los correos salen por un solo sitio, con una plantilla, desde la cuenta
del hosting.**
El dueño quiere que la plataforma escriba desde `contacto@chesscore.cl`, una
cuenta de su hosting con cPanel, y que los correos se vean profesionales. Hasta
hoy cada remitente armaba su HTML a mano —el de comentarios eran tres párrafos
sueltos— y decidía por su cuenta si había servidor.

*Qué se hizo.* `src/correo/plantilla.ts` convierte la descripción de un correo
(`Correo`: título, bloques, botón, nota) en HTML de tablas con estilos en línea,
que es lo único que Gmail y el Outlook de escritorio pintan igual, más su versión
en texto plano. `src/correo/mensajes.ts` tiene el texto de cada uno.
`src/correo/enviar.ts` es la única salida: `enviarCorreo` espera y lanza,
`enviarSinEsperar` no retiene a nadie y anota el fallo, y los dos adjuntan el
logotipo dentro del mensaje (`cid:`), porque Outlook bloquea las imágenes remotas
y la plataforma vive detrás de un túnel. La plantilla no importa nada de servidor:
la vista previa de la difusión (D-120) es la misma función. El remitente sale de
`SMTP_NOMBRE` y `SMTP_DESDE`, que cae en `SMTP_USUARIO`, porque Exim rechaza un
remitente distinto de la cuenta autenticada. La recuperación de contraseña, el
enlace del panel y el aviso de comentarios pasaron a esta salida: piden el
testigo con `disableEmail` y mandan ellos.

*Lo que se encontró al revisarlo.* Los datos que escribe otra persona —el nombre
y la institución de una solicitud, el nombre de quien comenta— salían enlazados
si traían una dirección: un anónimo podía mandar desde el dominio de la
plataforma un «su clave vence hoy, renuévela en https://…». Las filas de datos y
el saludo se escapan sin enlazar, y `solicitarCuenta` rechaza esos textos al
pedir la cuenta (D-119). `explicarFalloDeCorreo` traduce los fallos de nodemailer
a qué variable tocar; al principio tachaba la clave con asteriscos dentro de la
frase, y una clave que fuera parte del nombre del servidor quedaba deducible
(«mail.********.cl»): ahora, si la respuesta del servidor contiene la clave, se
omite ese detalle entero.

*Consecuencias buenas.* Un solo tono y una sola marca en todo lo que llega al
buzón; cambiar una frase no toca marcado ni transporte; *Sistema* tiene
«Enviarme un correo de prueba», que prueba credenciales y remitente, lo que el
saludo SMTP no puede. *Malas.* Los colores de `estilos.css` están repetidos en la
plantilla, porque un correo no lee variables CSS: cambiar la paleta exige tocar
los dos sitios. Y la vista en clientes reales no la ha mirado nadie todavía; lo
comprobado es un navegador.

### D-119 · 2026-09-14 · vigente · amplía D-020
**Una persona puede pedir su cuenta, y la activación sigue siendo del
administrador.**
El dueño no quiere crear a mano la cuenta de cada residente, pero sí decidir
quién entra, y conservar la creación manual.

*Qué se hizo.* `/registro` (enlazado desde `/entrar` y la portada) llama a
`solicitarCuenta`, que crea la cuenta **lectora, desactivada y con `pendiente`**
—campos nuevos `origen`, `pendiente`, `motivoDeSolicitud` y `solicitadaEn`—, sin
aceptar de la llamada ni rol ni estado. Avisa a quien la pidió y a los
administradores. En *Usuarios y permisos* las solicitudes salen aparte, con lo
que escribió la persona, un selector de rol y **Activar** o **Rechazar** (que
borra la cuenta); las dos avisan por correo. La barra del panel y el Resumen
cuentan las pendientes. La creación manual sigue igual, con una opción más:
mandarle a la persona un correo de bienvenida para que elija su contraseña, con
un enlace de 72 horas, en vez de ponerle una.

*Las decisiones de la acción pública, que es la primera que escribe sin sesión.*
- **Se niega sin ninguna cuenta en la base**: `ajustarPrimerUsuario` haría
  administradora a la primera, y el registro sería una puerta para fabricar el
  primer administrador de una instalación recién desplegada.
- **Contesta lo mismo y tarda lo mismo** se cree la cuenta, exista ya o la
  rellene un robot: un suelo de 1,5 s desde que llega. Sin él, el `pbkdf2` de la
  cuenta nueva delataba por tiempo quién tiene acceso. La verdad se le dice al
  titular en su buzón («ya tiene una cuenta»), y a quien repite una solicitud
  pendiente se le repite el acuse.
- **Freno de ritmo en memoria**: cinco por dirección y treinta en total por hora
  (`src/lib/ritmo.ts`). La cuota de envío del hosting es la misma de la
  recuperación de contraseña, y un bucle contra esta acción la vaciaría. El
  global existe porque el primero se burla cambiando `X-Forwarded-For`.
- **Campo trampa** para robots, que contesta éxito sin tocar nada y antes del
  freno, para no gastar el cupo de las personas.
- **Nombre e institución sin direcciones, correos ni saltos de línea**, para que
  el acuse no sirva para mandar enlaces falsos a direcciones ajenas. Un dominio
  suelto solo se rechaza en minúsculas, porque en mayúsculas choca con
  abreviaturas reales («Dra.Soto», «U.Chile»); «EVIL.COM» en mayúsculas pasa, y
  un texto engañoso sin enlace dentro de 120 caracteres también.
- `pedirEnlaceDeClave` **ya no pide el testigo sin SMTP**: cada `forgotPassword`
  anula el anterior, y sin correo el anterior es el enlace que el administrador
  entregó a mano.

Con esto `/registro` se suma a las páginas que D-020 sirve sin sesión.

*Consecuencias buenas.* El administrador revisa en vez de teclear, y la persona
elige su contraseña desde el principio. *Malas.* **La plataforma no verifica la
identidad** de quien pide la cuenta ni que el correo sea suyo hasta que alguien
lo activa: cualquiera puede escribir un nombre y un hospital. El aviso a los
administradores lo recuerda, pero la decisión es humana. El freno vive en
memoria y un reinicio lo vacía. Una solicitud basura queda en la base hasta que
alguien la rechace.

### D-120 · 2026-09-14 · vigente
**«Difusión»: un correo a todas las cuentas, despacio y con la cola guardada.**
El dueño quiere avisar a todos los usuarios de una novedad desde el panel.

*Qué se hizo.* Pestaña nueva del administrador, `/admin-panel/difusion`: asunto,
mensaje (línea en blanco separa párrafos, «- » hace lista, las direcciones se
enlazan), botón opcional, grupo (todas las cuentas activas o un rol), vista
previa con la plantilla real en un `<iframe sandbox="">`, «Enviarme una prueba» y
envío con confirmación que dice cuántas personas y cuánto tardará. Colección
nueva `difusiones` con la cola (`pendientes`) y los fallos. El trabajador
(`src/correo/difusion.ts`) manda **un correo por persona**, con su nombre y sin
la lista de direcciones a la vista.

*Por qué despacio.* El hosting limita los correos por hora y la cuota es la de la
recuperación de contraseña. `DIFUSION_CORREOS_POR_HORA` (200 si no se pone: uno
cada 18 s) espacia los envíos. Cinco fallos seguidos la detienen, porque son el
servidor caído o la cuota agotada y seguir marcaría como fallida a toda la lista.
Una a la vez: dos trabajadores duplicarían el ritmo, y dos «Enviar» cruzados se
cierran con una reserva que se toma sin ceder el hilo. La prueba lleva el mismo
freno que la de *Sistema*, cinco en diez minutos.

*Por qué no se reanuda sola.* Un servicio reiniciado deja la difusión en
«enviando» sin trabajador, y el panel la enseña «Interrumpida» para que el
administrador pulse **Reanudar**. Un servicio que se reinicia en bucle no debe
decidir volver a escribirle a cien personas.

*Consecuencias buenas.* Un aviso llega a todos sin copiar direcciones a mano, y
un corte no obliga a repetirlo entero. *Malas.* Envía y después anota: si el
proceso cae entre las dos cosas, **esa última persona lo recibe dos veces** al
reanudar (anotar antes cambiaría el duplicado por alguien que se queda sin aviso
y sin constar). No hay baja voluntaria de las difusiones: son avisos de servicio a
cuentas de la plataforma, no publicidad, pero si algún día se usan para otra
cosa hará falta. El límite real del hosting no se conoce: 200 es una suposición.

### D-121 · 2026-09-14 · vigente
**La autoría queda escrita en la plataforma, y el logotipo, algo más grande.**
«Desarrollado por Vicente Andrés Escudero Durana · vescudero@chesscore.cl» sale
en un pie de página en toda la plataforma, en la barra del panel, en la página de
créditos y en el pie de cada correo. El nombre y el correo viven solo en
`src/lib/autoria.ts`; `tests/unit/autoria.test.ts` falla si alguien los escribe a
mano en otro archivo o si el pie deja de pintarse. Dentro del panel el pie se
oculta con CSS (`body:has(.admin-layout)`), porque el contorno es de servidor y
no conoce la ruta.

El logotipo crece: la marca de la barra de 30 a 40 px (quedaba en dos reglas que
se pisaban, y queda en una), la del panel de 32 a 42, el de las pantallas de
acceso de 190 a 240 y el de la portada de 260 a 320. Esas dos últimas pasan a
`logo-hd.png`, porque `logo.png` mide 220 px y agrandado se ve borroso.
*Mala:* `:has()` no existe en navegadores anteriores a 2022-2023; en uno de esos
el pie se vería también dentro del panel, que es feo pero no rompe nada.

### D-122 · 2026-09-20 · vigente
**Un manual del panel y un guion de recorrido, para quienes van a llenar la
plataforma.**
Van a entrar editores y administradores que no son ni el traumatólogo ni el
desarrollador. Las dos guías que había cuentan cómo se redacta una ficha y cómo
se arma un caso, pero ninguna cuenta el panel entero —cuentas, permisos,
comentarios, difusión, respaldos— ni qué hacer cuando dos guardados chocan
(D-097), que es lo primero que le pasa a un equipo.

*Qué se hizo.* `docs/MANUAL-DE-USO.md`, que nombra cada botón con el texto de la
interfaz y abre con las seis cosas que hacen perder trabajo; remite a las dos
guías en vez de repetirlas. Y `docs/GUION-DE-RECORRIDO.md`, 45 minutos más 15
solo para administradores, ordenado alrededor de escribir una ficha de verdad
hasta verla publicada en la ventana de un lector, en lugar de enseñar pantallas
una por una. Todo lo que la sesión crea se titula «DEMO» para poder borrarlo.

*Consecuencias buenas.* Quien llega tiene un solo sitio donde mirar. *Malas.* Son
dos documentos más que citan textos de la interfaz, y ninguna prueba los ata al
código como `esquema.test.ts` ata el esquema: un botón que cambie de nombre los
deja mintiendo en silencio. De paso quedó a la vista que las guías anteriores ya
lo hacen: COMO-SUBIR-UN-MODELO.md manda a «Modelos 3D → + Nuevo», que no existe
—es «Gestionar» y después «+ Subir archivo»—, y las dos dicen «+ Nueva» donde el
listado dice «+ Agregar …». El manual no afirma qué ve el lector de una ficha
publicada mientras tiene un borrador más nuevo encima, porque no se pudo
comprobar sin escribir en producción (O-048).

### D-123 · 2026-09-21 · vigente
**El paso de Windows a Ubuntu se hace con un respaldo restaurado, y queda
escrito.**
La plataforma se muda al Ubuntu del dueño y lo que ya hay en `faraday` —las
fichas de ejemplo que sirven de plantilla, los catálogos, las preparaciones del
atlas, la cuenta y los archivos subidos— tiene que llegar. Nada de eso está en
git, a propósito: un `git clone` deja la plataforma vacía.

*Qué se hizo.* Sección nueva en `docs/SERVIDOR.md`, «Traer los datos desde el
servidor de Windows»: respaldo final con el servicio parado, instalar en Ubuntu
**sin crear la primera cuenta**, copiar `base-` y `medios-` de la misma marca y
`restaurar.sh`. No hizo falta código: `respaldar.ps1` nació gemelo de
`respaldar.sh` (D-113) y deja lo que `restaurar.sh` sabe cargar.

*Qué se comprobó, mirando dentro de un volcado real de producción.* PostgreSQL
17 en los dos lados; las 305 tablas con dueño `trauma`, que es el usuario que
crea el instalador; las 12 migraciones del código, sin la fila `batch = -1`; el
`.tar` con rutas relativas `medios/…`, que es lo que espera el `tar xzf -C /app`;
y que el `/simulaciones` guardado en la columna `url` no estorba, porque Payload
recalcula esa dirección al leer (`uploads/getBaseFields.js`, gancho `afterRead`).

*Consecuencias buenas.* El traslado es el mismo gesto que una restauración, que
ya estaba probado. *Malas.* **No se ensayó de punta a punta**: desde `faraday` no
hay un Ubuntu donde restaurar, así que la primera restauración de verdad es la
mudanza. Por eso el paso 5 manda comprobar antes de retirar el Windows. El
volcado exige `psql` 17.6 o posterior por el `\restrict`, y una imagen
`17-alpine` vieja en caché lo rechaza.

*Hecho el mismo día, en `ved`.* No fue una instalación nueva: TraumaHub ya
corría allí desde el 6 de septiembre bajo `/traumahub`, con el montaje de
`despliegue/paginas/`, sin contenido y con cuatro cuentas. El dueño decidió que
mandaba la de Windows entera; de la base vieja queda copia en
`backups/base-20260920-202235.sql.gz`, por si hubiera que recuperar las tres
cuentas que no estaban en Windows. Llegaron 1 cuenta, 1 patología, 3 maniobras,
2 casos AO, 2 cirugías, 2 estudios, 8 segmentos, 2 preparaciones del atlas, 1
imagen y 3 modelos, y cada archivo que la base nombra se comprobó en el volumen.
El ensayo que faltaba encontró tres cosas que no eran de la mudanza: O-053,
O-054 y O-055. Desde fuera, las redirecciones salen relativas (`Location:
/traumahub/admin-panel`) y `/entrar` no trae ni una dirección absoluta, así que
el `:10000` no se puede perder.

### D-124 · 2026-09-21 · vigente
**La figura de la portada pasa del fémur dibujado al cuerpo completo del atlas,
como nube de puntos.**
El dueño pidió cambiar el fémur esquemático de la portada por «el modelo del
cuerpo completo», sin tanta animación: algo sutil.

*Por qué no el atlas de verdad.* Son 33 MB y 2,3 millones de triángulos. Y no se
puede pedir una parte: los paquetes no están ordenados por sistema, así que solo
el esqueleto obliga a bajar 9 de los 15, 19 MB. La portada es lo primero que abre
cada persona, a veces desde el teléfono y por un túnel doméstico.

*Qué se hizo.* `scripts/atlas/portada.mjs` muestrea, a razón del área, 60.000
puntos sobre los huesos y 25.000 sobre la piel del atlas real y los guarda en
`public/atlas/portada.bin.gz` (275 KB), con su descripción en
`src/atlas/portada.json`. Se ejecuta una vez y el resultado se versiona, como el
atlas. `CuerpoDePortada.tsx` lo pinta con `three`, que se importa dentro del
efecto para que no entre en el paquete de la portada. El movimiento es un vaivén
de unos veinte grados con un periodo de 32 s; con «reducir movimiento» se queda
quieto, y fuera de pantalla o con la pestaña oculta no se pinta. No responde al
ratón. `Femur.tsx` y su CSS se retiraron. El pie de la tarjeta lleva ahora el
crédito de BodyParts3D, que la licencia exige donde se muestre el material.

*Dos cosas que salieron mal antes de salir bien.* Guardado como «xyz» en 16 bits
el archivo no comprimía nada (497 KB de 498): puntos al azar son ruido. Ordenados
por altura, con la altura como diferencias, en 12 bits y por planos, baja a 275.
Y con opacidad 0,85 el esqueleto salía quemado en blanco, porque con mezcla
aditiva los puntos se suman; a 0,16 es la densidad la que dibuja.

*Consecuencias buenas.* La figura es el atlas —sus proporciones y sus huesos— y
cuesta menos que una fotografía. *Malas.* Son dos archivos generados que solo
sirven juntos; `tests/unit/cuerpoDePortada.test.ts` los ata, y vigila también el
peso. Se comprobó en un banco de pruebas estático y no con la aplicación en
marcha, porque en `faraday` un `npm run dev` ajustaría el esquema de la base de
producción (O-048): dentro de la portada real se ve por primera vez en `ved`. Sin
WebGL la tarjeta se queda con su fondo y su pie, sin mensaje.

---

## 3. Observaciones

Formato: `O-nnn · fecha · severidad · estado`. Severidad: **alta**, **media**, **baja**.
Estados: **abierta**, **resuelta**, **descartada**.

### O-001 · 2026-08-28 · media · abierta
**El texto dice cuatro módulos y hay cinco.**
`heroLead` ("Cuatro módulos que conectan…") y `modulesEyebrow` ("Los cuatro
módulos") quedaron del momento en que el simulador aún no existía. Hoy la
cuadrícula muestra cinco tarjetas. Ocurre en español y en inglés.
*Dónde:* `T.es.heroLead`, `T.es.modulesEyebrow`, `T.en.heroLead`, `T.en.modulesEyebrow`.
*Impacto:* se nota en la primera pantalla, que es justo la que se muestra al
presentar el proyecto.

### O-002 · 2026-08-28 · media · abierta
**El texto de la hoja de ruta describe el módulo 04 como el de IA.**
`roadmapBody` dice: "El módulo 04 se aborda en una fase tardía… el volumen de
estudios etiquetados que el modelo necesita". Eso describe al módulo de IA, que
tras la inserción del simulador pasó a ser el 05. Hoy el 04 es el simulador y
está marcado como fase intermedia, de modo que el párrafo se contradice con el
diagrama que tiene al lado.
*Dónde:* `T.es.roadmapBody`, `T.en.roadmapBody`.

### O-003 · 2026-08-28 · baja hoy, alta al conectar backend · abierta
**La función de escape no escapa nada.** `const esc = s => s;` es un no-op, y
todo el contenido se inyecta con `innerHTML`. Hoy no hay riesgo porque cada
carácter que se renderiza es un literal escrito en el propio archivo. En el
momento en que el contenido venga de un CMS, de un formulario docente o de una
API, esto se convierte en una vía directa de inyección.
*Vía de solución adoptada:* D-014. En la plataforma el contenido de autor se
guarda como JSON estructurado y se renderiza con componentes propios, de modo
que nunca existe `innerHTML` con contenido de usuario. La observación queda
abierta sólo para el archivo del prototipo, que conserva el no-op.

### O-004 · 2026-08-28 · media · abierta
**El fémur no tiene examen físico.** `REGIONS` incluye "Fémur", pero el mapa
corporal (`bodyMapSVG`) no dibuja zona clicable para él y `EXAM` no tiene su
entrada. El resultado es coherente —no se puede seleccionar algo que no
existe— pero deja sin exploración física justamente al segmento que tiene la
ficha más desarrollada, el caso AO y la única cirugía simulable. Es el hueco más
visible si alguien recorre la plataforma en vertical por un mismo segmento.

### O-005 · 2026-08-28 · media · abierta
**El archivo único empieza a pesar.** 2.732 líneas y 242 KB con 4 fichas de 13.
Extrapolando, las 13 fichas llevan el archivo cerca de 600–700 KB. Sigue siendo
manejable para un navegador, pero deja de serlo para editarlo a mano y hace
imposible que dos personas escriban contenido en paralelo.
*Umbral que propongo:* mientras el prototipo sea la herramienta de presentación,
se mantiene el archivo único (D-001). Cuando entre la primera persona ajena a
escribir fichas, el contenido se separa a JSON y el HTML queda como motor.

### O-006 · 2026-08-28 · baja · abierta
**No hay persistencia.** Al recargar se pierde el idioma elegido, el progreso
del simulador y la ficha abierta. Correcto para un prototipo. Se anota porque el
progreso del residente —qué fichas leyó, cuántas complicaciones acumuló en el
simulador— es un requisito de producto real y probablemente el gancho de
fidelización más fuerte que tiene la plataforma.

### O-007 · 2026-08-28 · observación de valor · abierta
**El contenido clínico escrito es la parte más difícil de replicar y la más
frágil legalmente.** Las cuatro fichas completas están redactadas a nivel de
manual, no de resumen. El propio prototipo advierte que el contenido definitivo
"debe ser redactado por el equipo docente o licenciado a su titular"
(`scopeBody`). Esa frase es correcta y hay que sostenerla: es la diferencia entre
un producto propio y un problema de derechos de autor. Conviene decidir pronto
quién firma cada ficha.

### O-008 · 2026-08-28 · alta · abierta
**Una malla recién salida de una segmentación no se puede servir a la web.**
El algoritmo de superficie sobre una TC produce del orden de millones de
triángulos por hueso, que son cientos de megabytes. El objetivo para navegador
está entre 50.000 y 150.000 triángulos, y por debajo de 5 MB comprimido con
Draco o Meshopt. Entre MONAI y la plataforma hace falta, por tanto, una etapa de
reducción y compresión que conviene automatizar como script desde el principio,
porque hacerla a mano modelo por modelo no escala.
*Dónde se resolverá:* `scripts/malla-a-glb.py` y `scripts/optimizar-glb.sh`.

### O-009 · 2026-08-28 · alta · abierta
**Las imágenes médicas de origen exigen anonimización antes de entrar al flujo.**
Un archivo DICOM lleva en sus metadatos nombre, identificador nacional, fecha de
nacimiento e institución, y esos campos viajan con el archivo aunque la imagen
se vea anónima. Además, una reconstrucción tridimensional de cráneo o cara es
identificable por sí misma; en huesos largos el riesgo es bajo, pero los
metadatos siguen siendo el problema. Antes de procesar el primer estudio hay que
fijar de dónde salen las imágenes y con qué autorización. Ver Q-007.

### O-010 · 2026-08-28 · media · resuelta
**Docker no arrancaba por tres fallos encadenados; solo el tercero era el de fondo.**

*Primero.* `com.docker.service` estaba detenido con arranque manual y exigía
elevación. La cuenta sí pertenece al grupo de administradores, pero el control
de cuentas entrega un token filtrado donde ese grupo figura como «usado solo
para denegar»: por eso una consola normal recibía «Acceso denegado» siendo el
usuario administrador. Resuelto lanzando el proceso con elevación explícita.

*Segundo.* WSL estaba instalado y sano pero **sin ninguna distribución**, y
Docker Desktop aloja su motor dentro de una propia. Resuelto con `wsl --update`
y `wsl --install --no-distribution`.

*Tercero, el verdadero.* Cada cierre abrupto de Docker Desktop deja **sockets
huérfanos** que el propio Docker intenta borrar al arrancar y no puede, lo que
tumba un servicio distinto en cada intento. El error iba avanzando por la fila
—Inference Manager, luego Secrets Engine— y esa progresión fue la pista: cada
limpieza arreglaba un servicio y destapaba el siguiente. Windows no permite
borrar esos puntos de reanálisis, pero **sí permite renombrar la carpeta que los
contiene**, y esa es la maniobra que funciona:

    %LOCALAPPDATA%\Docker
un
    %LOCALAPPDATA%\docker-secrets-engine

Se renombran con sufijo y se recrean vacías. Con ambas limpias, el motor arrancó
a la primera.

*Lecciones que conviene recordar:*
- Que Docker Desktop aparezca entre los procesos no significa que el motor
  exista. El estado real se comprueba con `docker info` y `wsl --list`.
- Un error que cambia entre intentos indica progreso, no un fallo nuevo.
- No hubo antivirus de terceros ni protección de carpetas de por medio: se
  descartaron ambos antes de seguir.

*Descartado:* reinstalar Docker. Los dos primeros fallos eran de permisos y de
WSL, y el tercero se resolvió en segundos apartando dos carpetas.


### O-011 · 2026-08-29 · alta · resuelta
**Construir la imagen de producción destapó tres fallos que nada más mostraba.**

*Uno.* La portada consultaba la sesión pero Next intentaba prerenderizarla. En
la máquina de desarrollo pasaba inadvertido porque la base estaba accesible; al
construir la imagen, sin base, la compilación fallaba. El fondo era peor que un
fallo de compilación: **una portada estática habría servido el mismo HTML a
todo el mundo sin comprobar quién entra.** Resuelto con `force-dynamic` y el
comentario que explica por qué no debe quitarse.

*Dos.* `npm ci` falla dentro del contenedor. El lockfile se genera en Windows y
lista binarios opcionales de otras plataformas —esbuild para aix, darwin y
demás— que `npm ci` valida de forma estricta y no encuentra en linux/amd64,
aunque jamás se usen. Resuelto usando `npm install` en la etapa de dependencias.

*Tres.* El typecheck de producción rechazaba `access.admin`, que exige un
booleano estricto y no admite un filtro de consulta como el resto de las
operaciones. El modo desarrollo no comprueba tipos y lo dejaba pasar. Resuelto
con una función `accesoAlPanel` del tipo correcto, en lugar de forzarlo con una
aserción.

*Lección:* `npm run dev` no prueba el despliegue. La compilación de producción,
la construcción de la imagen y el arranque del conjunto son tres puertas
distintas, y cada una atrapó algo que las otras dos no.

### O-012 · 2026-08-29 · alta · resuelta
**El filtro de publicados se aplicaba a colecciones que no tienen ese campo.**
`filtroDeLectura` devuelve `{ _status: { equals: 'published' } }` para el
lector, y ese filtro consulta una columna que solo existe donde hay borradores
activados. Al aplicarlo también a `segmentos`, `medios` y `modelos-3d`, la
consulta reventaba con «Cannot find field for path at _status» y **un lector se
quedaba sin poder leer nada de esas tres colecciones**, es decir, sin segmentos
ni imágenes en la biblioteca.

No lo detectaron las pruebas anteriores porque no había datos: el fallo apareció
al crear la primera ficha con su segmento y consultarla como lector.

Resuelto separando `lecturaDeContenido`, que filtra por estado, de
`lecturaSimple`, que exige lo mismo pero responde con un booleano. El invariante
de `tests/unit/colecciones.test.ts` comprueba ahora que ninguna colección filtre
por `_status` sin tener borradores, de modo que no puede repetirse.

*Lección:* una suite verde sobre una base vacía prueba menos de lo que parece.

### O-013 · 2026-08-31 · media · resuelta
**La verificación del respaldo fallaba por SIGPIPE, no por un respaldo malo.**
`gzip -dc archivo | head -50 | grep -q ...` bajo `set -o pipefail` devuelve
error: `head` cierra el conducto, `gzip` recibe SIGPIPE y el conducto entero se
considera fallido aunque `grep` haya encontrado lo que buscaba. El respaldo era
correcto —27 KB con su cabecera— y el script lo declaraba inválido.
Resuelto capturando la salida en una variable antes de examinarla.

Del mismo episodio salió un segundo arreglo: si `pg_dump` fallaba a mitad,
`gzip` ya había creado el archivo y quedaba un respaldo truncado de 20 bytes con
aspecto de respaldo bueno en el listado. Ahora una trampa de salida lo descarta.

*Lección:* un script de respaldo no probado es peor que ninguno, porque da
tranquilidad sin darla.

---

### O-014 · 2026-09-06 · alta · resuelta
**Anotar el último acceso dejaba el inicio de sesión colgado varios minutos.**
El gancho `afterLogin` escribía la fecha con `payload.update` sin pasarle el
`req`, de modo que Payload abría una transacción nueva que intentaba escribir
la misma fila que el propio login tenía tomada. La segunda esperaba a que la
primera terminara, y la primera esperaba a que terminara el gancho. Se vio en
la base: la transacción del login en `idle in transaction` y todas las demás
encoladas detrás. Entrar tardaba entre uno y tres minutos.
*Arreglo:* pasar `req` al update, para que la escritura entre en la transacción
que ya está abierta. Comprobado: de 3 minutos a 1 segundo.

### O-015 · 2026-09-06 · alta · resuelta
**El editor de texto se borraba solo mientras se escribía.**
El `ref` del `contenteditable` era una función nueva en cada render, así que
React lo desmontaba y lo volvía a montar; el registro creía que era un renglón
nuevo y lo repintaba con su contenido inicial, que estaba vacío. Cada tecla
borraba lo escrito. *Arreglo:* recordar qué renglones ya se volcaron al DOM y
no repintarlos nunca más; el nodo se olvida solo cuando el renglón se elimina
de verdad.

### O-016 · 2026-09-06 · media · resuelta
**Los desplegables de relación entregaban el identificador como texto.**
Un `<select>` siempre devuelve cadenas y las claves de PostgreSQL son enteros:
Payload rechazaba la relación con un «campo inválido» que no señalaba nada
tocable en pantalla. *Arreglo:* `depurarDocumento` convierte a entero lo que lo
parece, y el editor salta a la pestaña donde está el campo que falta en lugar
de mostrar el aviso arriba y dejar a la persona buscándolo.

---

### O-017 · 2026-09-06 · alta · resuelta
**PostgreSQL no convierte texto a `jsonb` por su cuenta, y con razón.**
Al pasar los campos largos a texto con formato, el arranque de la aplicación
falló con `ALTER TABLE "casos_ao_pasos" ALTER COLUMN "descripcion" SET DATA
TYPE jsonb`. La base se niega porque «fractura conminuta» no es un documento
JSON. *Arreglo:* `scripts/migrar-a-texto-rico.ts`, que hace los tres pasos en
el orden correcto —rescatar lo escrito, cambiar el tipo con `USING NULL`,
devolver el contenido convertido en párrafos— y cubre también las tablas de
versiones y las de filas de arreglo, que es donde se olvida.

---

### O-018 · 2026-09-06 · alta · resuelta
**Las páginas cargaban y todas las acciones respondían «acceso denegado».**
En el servidor, el panel se abría y mostraba la cuenta como administradora,
pero cualquier acción —activar a alguien, generar un enlace de clave, crear una
cuenta— fallaba con «se requiere rol de administrador».

*Causa:* la protección CSRF de Payload. `sanitize.js` mete `serverURL` en la
lista `csrf`, y `extractJWT` **descarta la cookie de sesión** cuando la petición
trae una cabecera `Origin` que no está en esa lista. Con
`serverURL = https://servidor:10000/traumahub` la comparación no podía casar
nunca, porque un `Origin` jamás lleva ruta.

*Por qué costó verlo:* la misma función admite la cookie cuando **no** hay
`Origin`, cayendo en `Sec-Fetch-Site`. Una navegación normal no manda `Origin`
y manda `Sec-Fetch-Site: none` → la página se pintaba con sesión válida. Una
acción de servidor es un POST del navegador y **sí** manda `Origin` → sesión
descartada. De ahí el síntoma exacto: se ve todo, no se puede hacer nada.

*Cómo se aisló:* el mismo testigo funcionaba en `Authorization: JWT …` y no en
`Cookie:`, lo que descartaba el testigo, la base y el rol, y dejaba solo la
lectura de la cookie.

*Arreglo:* `serverURL` pasa a ser únicamente el origen, y el prefijo se declara
en `routes.api`, que es lo que Payload antepone al construir las URLs
absolutas de los archivos subidos.

---

---

### O-019 · 2026-09-10 · alta · resuelta
**El prefijo salía dos veces en la dirección de cada archivo subido.**
En el servidor, toda imagen, todo vídeo y todo modelo 3D de toda ficha era un
404. La dirección que publicaba Payload era
`https://servidor:10000/traumahub/traumahub/api/medios/file/foto.png`.

*Causa:* `routes.api` llevaba el prefijo escrito a mano —`${PREFIJO}/api`—
mientras que `formatAdminURL`, la función de Payload que arma esas
direcciones, antepone por su cuenta `process.env.NEXT_BASE_PATH`, que
`withPayload` rellena con el `basePath` de Next al compilar. El prefijo se
sumaba dos veces.

*Por qué costó verlo, y por qué llegó a producción.* Tres cosas a la vez. El
campo `url` es virtual: Payload lo recalcula en cada lectura y no queda escrito
en ninguna fila que uno pueda mirar. Apenas había archivos subidos, así que
nadie tropezó. Y la API REST **sí funcionaba** con el prefijo doblado, porque
su envoltorio construye la ruta entrante con la misma función y el doblez
aparecía a los dos lados de la comparación, cancelándose. Solo fallaba lo que
resuelve el navegador de verdad.

*Cómo se comprobó:* llamando a `generateFilePathOrURL` de Payload con
`NEXT_BASE_PATH=/traumahub` y las dos configuraciones posibles, y comparando la
salida. Está atado en `tests/unit/archivosSubidos.test.ts`.

*Lección:* la corrección de O-018 dejó escrito que «el prefijo se declara en
`routes.api`, que es lo que Payload antepone». Era media verdad, y la otra
media costó este fallo. Cuando una biblioteca ya hace algo por su cuenta,
hacerlo también a mano no lo refuerza: lo duplica.

---

### O-020 · 2026-09-10 · alta · resuelta
**«Retirar de publicación» no retiraba nada.**
El botón respondía «retirada», el panel mostraba la ficha como borrador, y el
residente la seguía viendo.

*Causa:* la acción escribía con `draft: true`, y en Payload eso guarda una
versión de borrador nueva **dejando intacto el documento publicado**. Es lo
correcto para «guardar sin publicar» y lo contrario de lo que hace falta para
«dejar de publicar», que necesita `draft: false`.

*Cómo se comprobó:* creando una ficha publicada contra la base de desarrollo,
llamando exactamente a lo que llama el panel y preguntando después por el
estado. Tras la llamada, `_status` seguía siendo `published` y una consulta de
lector la devolvía igual.

*Por qué nadie lo notó:* porque todo lo visible decía que había funcionado. El
único sitio donde se veía la verdad era la sesión de un residente.

---

### O-021 · 2026-09-10 · alta · resuelta
**Duplicar una ficha con contenido fallaba siempre.**
«El siguiente campo es inválido: id», sin más.

*Causa:* cada bloque y cada fila de un documento lleva un `id` propio que en
PostgreSQL es la clave primaria de su tabla. Al copiar, viajaban dentro de la
copia y Payload rechazaba el documento entero. La ficha de demostración, con
dos bloques y una lista de tres puntos, arrastraba catorce.

*Arreglo:* se limpian solo en el camino de copia. Al **guardar**, ese
identificador es lo que dice «esta es la misma fila de antes» y hay que
conservarlo: quitarlo allí haría que cada guardado borrase y recreara todas las
filas.

---

### O-022 · 2026-09-10 · baja · resuelta · **corregida el mismo día**
**El correo de contraseña nueva dependía de una ruta que estaba a punto de irse.**

*Primero, la corrección, porque esta entrada llegó a decir algo falso.* Se
escribió aquí que el enlace «apuntaba a la raíz del dominio, es decir a otra
página, llevándole el testigo». **No era cierto.** Al revisar la documentación
se comprobó llamando a la propia función de Payload: `formatAdminURL` sí antepone
el prefijo, de modo que el enlace salía como
`https://servidor:10000/traumahub/admin/reset/<testigo>`, dentro de la
aplicación. Y la ruta de compatibilidad `/admin` lo reenviaba a
`/clave/<testigo>`. **El restablecimiento de contraseña funcionaba.**

Queda registrado el error y no se borra, porque tiene su propia lección: el
razonamiento era «`serverURL` no lleva el prefijo, luego el enlace tampoco», y
saltó por encima de que quien arma la dirección no usa solo `serverURL`. Es el
mismo descuido que causó O-019, en el otro sentido. Con esa función hay que
ejecutarla, no razonarla.

*Lo que sí estaba mal, y por qué se cambió igualmente.* El correo era el de
Payload: en inglés, y colgado de `/admin`, una ruta que existe solo como
redirector de enlaces viejos y que en la limpieza del mismo día perdió
precisamente la rama de `reset`. Un enlace de contraseña que rebota por un 308
en una ruta retirada es una dependencia que nadie querría descubrir el día que
haga falta.

*Arreglo:* el correo se arma en la propia colección de usuarios, en español, y
apunta directamente a `/clave/<testigo>`, la pantalla propia. Atado con pruebas.
El testigo caduca en una hora, así que ningún enlace anterior al cambio sigue
vivo y no hacía falta conservar el redirector.

---

### O-023 · 2026-09-10 · alta · resuelta
**Un «-f» de más dejaba a los guiones de operación sin encontrar la aplicación.**
Todos pasaban `-f docker-compose.yml` de forma explícita, y con `-f` Compose
deja de fusionar `docker-compose.override.yml`, que es exactamente donde vive
el servicio `app` en el servidor de páginas compartido.

*Lo que provocaba, todo junto y todo en silencio:* el respaldo de los archivos
subidos se saltaba siempre y se informaba como éxito; `salud.sh` daba por caída
una aplicación sana; y `restaurar.sh` no llegaba a detener la aplicación antes
de sobrescribir la base, que es el peor de los tres.

*Y su gemelo, que hacía más daño.* `deploy.sh` consultaba la salud con
`$BASE_PATH`, una variable que ningún compose ni ninguna plantilla de `.env`
define en el anfitrión: solo existe como argumento de compilación. En el
servidor no obtenía respuesta en 90 segundos y **revertía un despliegue sano** a
la imagen anterior.

*Arreglo:* una función `dc` que solo pone `-f` cuando hace falta, y el prefijo
preguntado al contenedor, que es quien lo sabe porque lo lleva grabado.

---

### O-024 · 2026-09-10 · media · resuelta
**Reabrir una preparación anatómica y volver a guardarla borraba su encuadre.**
El visor lee la vista solo al montar la escena, y abrir una preparación no
cambia el catálogo, así que la cámara se quedaba donde estuviera. Como al
guardar se escribe la cámara actual, volver a guardar sustituía en silencio el
encuadre bueno por el que hubiera en pantalla.

*Arreglo:* una orden `irA` en el mando del visor. No una prop que se aplique al
cambiar de valor: con eso, reabrir dos veces la misma preparación no habría
movido nada —que es justo lo que se hace cuando uno se ha perdido girando— y
además el visor público construye ese objeto en cada pintado, de modo que la
cámara se le habría devuelto sola al residente mientras intentaba girarla.

---

### O-025 · 2026-09-10 · media · resuelta
**Cada ficha de puro texto descargaba el motor 3D entero.**
`Bloques.tsx` importaba los dos visores de forma normal y pinta todas las
fichas, así que three.js, `@react-three/fiber` y `drei` viajaban a cada página.
Medido sobre la compilación, antes y después:

| Ruta | Antes | Después |
|---|---|---|
| `/biblioteca/[id]` | 1049 KB | 37 KB |
| `/tecnica-ao/[id]` | 1047 KB | 34 KB |
| `/examen-fisico` | 1047 KB | 34 KB |

*El detalle que importa al arreglarlo:* la envoltura tiene que ser un
componente de cliente. Un componente de servidor que importa dinámicamente uno
de cliente **no** divide el paquete, y `ssr: false` solo tiene efecto dentro de
uno de cliente. Hacerlo en `Bloques.tsx` habría dado la sensación de arreglarlo
sin arreglar nada.

---

### O-026 · 2026-09-10 · media · resuelta
**La caché de un año del atlas estaba puesta sobre nombres que no cambian.**
Los paquetes se sirven como inmutables durante un año y se llaman
`cuerpo-0.bin.gz`, `cuerpo-1.bin.gz`… sin versión en el nombre. El comentario
del `next.config.mjs` afirmaba lo contrario: «si cambia, cambia su versión y
con ella el nombre».

*Lo que habría pasado:* regenerar el atlas dejaba a quien ya lo hubiera
visitado con la geometría vieja y el catálogo nuevo durante un año, que es la
manera silenciosa de enseñar el hueso equivocado.

*Arreglo:* la versión del catálogo viaja en la dirección, y el catálogo pasa a
revalidarse siempre, porque es la pieza que decide qué versión se pide. Además,
esa versión se calcula ahora sobre el catálogo entero y no solo sobre la lista
de identificadores: un atlas reempaquetado con las mismas piezas conservaba la
versión y no habría cambiado nada.

### O-027 · 2026-09-10 · alta · resuelta
**Una tolerancia guardada en la base no llegaba al navegador.**
El paso de reducción del caso de prueba acepta 4 mm de diástasis. En la tabla
estaba el 4; en pantalla la consola aceptaba 5, que es el valor por omisión.
`src/lib/casoQuirurgico.ts` aplanaba el documento de Payload y no copiaba ese
campo, así que llegaba nulo y el motor caía al valor por omisión sin decir nada.

*Cómo apareció:* recorriendo el caso en el navegador y comparando la instrucción
en pantalla contra lo que decía la fila. No hay error, no hay aviso y los números
son creíbles: es exactamente la clase de fallo que no se encuentra mirando el
código. Es la tercera vez en el día que aparece la misma forma —un dato escrito
que nadie lee—, y por eso ahora hay una prueba que compara las tres tolerancias
del documento contra las que recibe la consola.

### O-028 · 2026-09-10 · media · resuelta
**El desplazamiento se enseñaba como un solo número y se podía llegar a un
callejón sin salida.**
Recorriendo el caso entero me quedé atascado en 8,7 mm de desplazamiento: lo que
faltaba por corregir estaba en profundidad, perpendicular al plano que estaba
mirando, y arrastrar de lado no bajaba el número. Sin desglose, la única pista
era que el número no se movía.

*Arreglo:* la medida se muestra ahora también eje por eje. Además de destrabar la
maniobra, es lo que se hace en pabellón: cuando una proyección no basta, se pide
la otra. La consola ya tenía el modo Orbitar; lo que faltaba era la razón para
usarlo.

### O-029 · 2026-09-10 · alta · resuelta
**Subir un modelo de más de 1 MB fallaba sin explicar por qué.**
El límite por omisión de las acciones de servidor de Next son 1 MB. Un GLB de
tibia realista pasa de eso con facilidad, y el error que llegaba a pantalla no
mencionaba ningún tamaño. Es el bloqueo que impedía al médico usar su propio
material, que es el punto entero del módulo.

*Arreglo:* `bodySizeLimit` a 8 MB en `next.config.mjs`. El techo se deja
explícito y no infinito a propósito: **Q-006** fija el presupuesto por modelo en
5 MB comprimido, y un límite generoso pero visible es lo que mantiene esa
conversación viva. Si un modelo no cabe en 8 MB, el problema es el modelo.

### O-030 · 2026-09-12 · alta · resuelta
**Tailscale Funnel recorta el prefijo, y con `basePath` puesto eso da 404 en
todo.**
La forma evidente de publicar la plataforma bajo `/simulaciones` era
`tailscale funnel --set-path /simulaciones`. Hace lo contrario de lo que hace
falta: monta el servicio en esa ruta y **la recorta** antes de reenviar. Una
petición a `/simulaciones/api/salud` llega al proceso como `/api/salud`.

Con `basePath` puesto, la aplicación espera el prefijo y recibe la ruta pelada:
404 en todo. Sin `basePath`, las rutas entran bien pero cada enlace que Next
escribe sale sin prefijo, el navegador pide `https://host/algo` y ahí no hay
nada montado. Ninguna de las dos mitades encaja, y las dos fallan de formas que
parecen otra cosa.

*Cómo apareció:* antes de compilar, con un servidor de siete líneas que solo
devuelve la ruta que recibe. El prefijo se incrusta al construir, así que
averiguarlo después habría costado una reconstrucción entera y un rato largo
buscando el 404 en el sitio equivocado.

*Arreglo:* el túnel se monta en la **raíz** y el prefijo lo pone la aplicación,
que es la única pieza que puede ponerlo también en los enlaces que genera.

### O-031 · 2026-09-12 · media · resuelta
**El instalador de PostgreSQL no se puede ejecutar por SSH.**
El instalador de EnterpriseDB es un BitRock y necesita una sesión de escritorio.
Por SSH sale con código 1 y no deja registro; con `-RedirectStandardOutput` deja
uno, y lo que dice es que no pudo escribir su propio `.bat` temporal. Tampoco
sirve `winget install --custom`: winget ya pasa sus argumentos silenciosos y el
instalador rechaza el juego duplicado. Antes de eso falló una tercera vez, porque
`Start-Process -ArgumentList` con un arreglo no entrecomilla los elementos con
espacios y `C:\Program Files\PostgreSQL` llegaba partido en dos.

*Arreglo:* los binarios en ZIP, `initdb` y `pg_ctl register`. No instalan nada,
no necesitan escritorio y el proceso entero cabe en un script.

### O-032 · 2026-09-12 · media · resuelta
**Renombrar la máquina en Tailscale no renombra el túnel ni la aplicación.**
Se cambió el nombre de la máquina de `faraday` a `traumahub` para que la
dirección pública se pudiera dictar en voz alta. El nombre DNS cambió al
instante, pero ni el túnel ni la plataforma se enteraron:

- `tailscale funnel status` seguía anunciando el nombre viejo. La configuración
  del túnel guarda el nombre con el que se creó, así que hubo que `funnel reset`
  y volver a montarlo para que pidiera certificado sobre el nombre nuevo.
- La aplicación seguía escribiendo la dirección vieja en cada enlace absoluto,
  porque `NEXT_PUBLIC_SERVER_URL` se incrusta al compilar. Sin reconstruir, la
  mitad de la plataforma habría apuntado a un nombre que ya no existe.

*Por qué se anota:* las tres piezas parecen una sola cosa y son tres, y las dos
que no se actualizan solas fallan sin dar error. El procedimiento completo quedó
en `docs/SERVIDOR-WINDOWS.md`.

*Lo que no se puede:* el `tailc2094f` de en medio no se elige. Tailscale ofrece
cambiarlo por otro aleatorio de dos palabras y nada más, y Funnel no admite
dominios propios. Un nombre de verdad exige Cloudflare Tunnel y un dominio
delegado (**Q-008**).

### O-033 · 2026-09-12 · alta · resuelta
**Los desplegables del vocabulario del simulador abrían vacíos.**
Al escribir un caso, los cinco desplegables de hueso, clasificación AO, técnica,
fase e instrumental salían sin una sola opción, con los catálogos llenos. El
formulario del panel precarga las listas de relación a partir de una lista de
colecciones que estaba **escrita a mano**, y no se actualizó al añadir los cinco
catálogos con la consola quirúrgica (D-057). Tres de esos campos son
obligatorios, así que el caso no se podía guardar y la pantalla no decía por qué.

*Lo que lo hizo invisible:* el modelo 3D sí estaba en esa lista, de antes. Su
desplegable funcionaba, y un formulario donde un desplegable va bien y otro sale
vacío parece un problema de datos, no de código.

*Arreglo:* la lista se deriva del esquema en vez de escribirse, de modo que un
campo de relación nuevo trae consigo su precarga. Dos pruebas lo vigilan, y se
comprobó que fallan con la lista antigua: una prueba que nunca falla no protege
de nada.

### O-034 · 2026-09-12 · alta · resuelta
**El fragmento se colocaba en coordenadas absolutas.**
El desplazamiento de un caso se aplicaba como posición, no como diferencia
respecto de donde estaba la pieza al cargar. Funcionaba solo porque el modelo de
prueba sale de Blender centrado en el origen. Con un modelo de verdad —una
pierna entera, donde la tibia está donde le toca— la primera pieza colocada
habría aparecido teletransportada al abrir el caso, sin ningún mensaje.

*Por qué salió ahora:* el taller de piezas añade un botón que **escribe** ese
número. Un fallo que hasta ahora solo deformaba la vista habría pasado a quedar
grabado en los datos del caso.

*Arreglo:* el visor recuerda dónde estaba el fragmento al cargar y trabaja con la
diferencia. La aritmética se movió a `src/lib/reduccion.ts`, que es donde vive lo
que puede estar mal sin que se note, y se prueba sin navegador.

### O-035 · 2026-09-12 · baja · resuelta
**La guía del médico decía que el límite de un modelo eran 8 MB, y son 5.**
Ocho megas es el techo del envío, que tiene que ser mayor porque en la misma
petición viaja el formulario (O-029). El que decide sobre el archivo es el de
`validarModelo3D.ts`, que son cinco, y existe porque el modelo se descarga en el
portátil del residente. La guía daba el número equivocado en dos sitios, de modo
que un modelo de 7 MB parecía válido y lo rechazaba la plataforma.

### O-036 · 2026-09-12 · alta · resuelta
**La consola no sabía abrir un modelo comprimido, y la guía pedía comprimirlo.**
`LienzoQuirurgico` creaba su `GLTFLoader` a pelo, sin decodificador de Draco ni
de Meshopt. Un `.glb` exportado con «Comprimir» desde Blender no se abría. Y
`docs/COMO-SUBIR-UN-MODELO.md` le decía al traumatólogo que encendiera esa
casilla en cuanto el archivo pasara de unos pocos MB, que es justo lo que hace
falta para que una pierna entera quepa bajo el techo de 5 MB. Seguir la guía
daba un caso que no abre.

*Y no avisaba.* El manejador de error de la carga estaba vacío, con un comentario
que decía que «el componente de arriba ya avisa». Era falso: arriba solo se avisa
cuando el caso no declara ningún modelo. Con el archivo presente e ilegible, el
residente veía un lienzo vacío, la cámara encuadrando la nada, y ni un mensaje.

*Arreglo:* los dos decodificadores registrados, con el de Draco servido desde la
propia plataforma —`public/draco/`, 750 KB versionados— y no desde un CDN: atarlo
a que el hospital deje salir a otro dominio convierte un cortafuegos en un modelo
que no carga, otra vez en silencio. Y el fallo de carga ahora se escribe en la
bitácora del caso y en el taller.

### O-037 · 2026-09-12 · alta · resuelta
**Actualizar el servidor con el servicio en marcha dejó el sitio caído.**
El procedimiento documentado era el de siempre: `git pull`, `npm ci`,
`npm run build`, `Restart-Service`. En Linux funciona. En Windows un archivo
abierto no se puede borrar, y el servicio tenía medio `node_modules` abierto:
`npm ci`, que empieza borrándolo entero, se quedó a medias, el build falló, y el
servicio ya no encontró el binario de Next. El sitio estuvo caído hasta
reinstalar con el servicio parado.

*Por qué se coló:* el orden equivocado es el correcto en Linux, que es de donde
viene la costumbre, y el `npm ci` falló **sin escribir nada**: el paso siguiente
dio el error, tres líneas más abajo y hablando de otra cosa.

*Arreglo:* el servicio se para antes y se arranca al final. Corregido en
`docs/SERVIDOR-WINDOWS.md`, junto con la señal que lo delata en el registro.

### O-038 · 2026-09-12 · alta · resuelta
**El guardián de las migraciones se saltaba las relaciones múltiples.**
`tests/unit/migraciones.test.ts` comprueba que todo campo de una colección tenga
su columna en la última instantánea, y lleva una línea que dice: «muchos a
muchos: también tabla aparte», seguida de un `continue`. Es decir, los saltaba
para no buscar una columna que no existe, y con eso se saltaba la comprobación
entera.

*Lo que habría pasado:* un campo de relación múltiple añadido sin migración pasa
las pruebas en verde y llega al servidor a una base sin la tabla `..._rels`. Es
exactamente el fallo silencioso que D-056 existe para impedir, con un agujero
justo en el tipo de campo que más fácil es añadir sin pensar.

*Cómo apareció:* añadiendo la bandeja declarada de un caso (D-062), que es el
primer campo múltiple del proyecto.

*Arreglo:* una prueba nueva que exige la tabla de enlaces y su columna de
destino. Se comprobó que falla al quitar la migración.

### O-039 · 2026-09-12 · media · resuelta
**El «para qué sirve» de cada instrumento no llegaba a ninguna pantalla.**
El catálogo de instrumental tiene un campo de descripción desde que se creó, se
rellenó para los trece instrumentos sembrados, y no se mostraba en ningún sitio.
El residente elegía instrumento sin poder leer para qué era ninguno, que es
justo lo que hace falta para elegir bien. Ahora se lee al cogerlo, junto a su
modelo.

### O-040 · 2026-09-12 · alta · resuelta
**El servidor arrancaba, quedaba «Running» y no servía una sola petición.**
`push` estaba escrito como «distinto de `test`», que en el servidor es
verdadero, de modo que producción sincronizaba el esquema al vuelo. El
comentario de al lado decía justo lo contrario. Ganaba el código.

La consecuencia no fue la obvia. Al sincronizar, Payload deja escrita en
`payload_migrations` una fila llamada `dev`, y a partir de ahí **cada arranque**
ve esa marca y pregunta por consola si aplicar las migraciones con riesgo de
pérdida de datos. A un servicio de Windows no le contesta nadie: el servicio
quedaba en «Running», el registro terminaba en un `(y/N)` y la plataforma no
respondía. Sin error, sin caída, sin nada que mirar salvo el registro.

Es la misma trampa que D-056 describe para las pruebas —un proceso esperando una
respuesta que nadie va a dar no falla, se cuelga— aparecida en el sitio donde más
caro sale, y el mismo día en que se dio por cerrada.

*Arreglo:* `push` solo en desarrollo, y la fila `dev` borrada de la tabla. El
esquema que representaba ya estaba en la base, puesto por el propio push.

*Lo que queda abierto:* el registro también avisa de que `next start` no es la
forma de arrancar una construcción `output: standalone`. Funciona, pero es otra
discrepancia entre lo que se configura y lo que se ejecuta, de la misma familia
que esta. Anotado para arreglarlo aparte.

---

### O-041 · 2026-09-13 · media · abierta · mismo mecanismo que D-061
**`npm run db:migrate` se cuelga en una pregunta que nadie va a contestar.**
Apareció al probar la lista nueva de «Antes de subir» (D-068, D-069): la orden
que la propia lista añade se quedó sin escribir una línea y sin morirse.

*Causa.* En cuanto la base ha arrancado una vez en desarrollo, Payload le deja
una fila con `batch = -1` en `payload-migrations` —la marca de que el esquema se
ajustó al vuelo—, y a partir de ahí `payload migrate` abre una pregunta
interactiva antes de hacer nada: «It looks like you've run Payload in dev mode…
Would you like to proceed? (y/N)».

*Y no hay bandera que la salte.* `--force-accept-warning` existe para
`migrate:create` y para `migrate:fresh`; `migrate` no la mira
(`@payloadcms/drizzle/dist/migrate.js`). Sin terminal delante —una tarea
programada, un gancho, una integración continua— el proceso espera para siempre.

*Por qué se anota aquí y no solo en AGENTS.md.* **Es la misma forma del arranque
colgado de D-061:** el servicio dice «Running» y no sirve nada, el proceso dice
que está trabajando y está esperando. Las dos veces el síntoma es la ausencia de
síntoma, y las dos veces se pierde la tarde buscando en el sitio equivocado.
Cualquier automatización que vaya a tocar la base tiene que dar por hecho que
una orden de Payload puede preguntar.

*Qué hacer en su lugar.* Sobre una base de desarrollo que ya trae ese estado, lo
que casi siempre se quiere es tirarla y rehacerla (`npm run db:down && npm run
db:up`), no migrar encima. `npm run db:migrate` solo vale para una base recién
creada. Queda escrito en AGENTS.md.

*Lo que queda abierto:* no hay un `pretest` en `package.json`, así que sobre una
base recién creada la suite revienta con `relation "segmentos" does not exist`,
un error que no menciona ni migraciones ni `push` y manda a buscar muy lejos. El
esquema lo está poniendo, por accidente, el `npm run dev` de ayer.

---

### O-042 · 2026-09-13 · media · abierta
**`src/app/global-not-found.tsx` está escrito y no está encendido.**
La pantalla que atiende una dirección que no casa con ninguna ruta
—`/traumahub/bibliotecaa`, un enlace copiado a medias, una URL vieja de antes de
renombrar un módulo— se escribió en la cuarta ola y hoy **no la usa nadie**:
`experimental.globalNotFound` no está puesto en `next.config.mjs`, y con la
bandera apagada Next ni siquiera busca el archivo
(`node_modules/next/dist/build/entries.js`). El residente que se equivoca de
dirección sigue viendo la pantalla por omisión del marco: en inglés, sin barra y
sin salida.

*Por qué pasó desapercibido.* La bandera va en `next.config.mjs`, que no era de
ese lote —es la consecuencia mala de D-063 en estado puro—. El archivo no rompe
la compilación, no avisa de nada y se queda inerte. Y la prueba que lo acompaña
comprueba que la **cabecera mencione** la bandera, no que la bandera esté
puesta: vigila que no se borre el aviso, no que el aviso se haya atendido.

*Arreglo, que es una línea* dentro del `experimental` que ya existe al lado de
`serverActions`:

```js
experimental: {
  globalNotFound: true,
  serverActions: { bodySizeLimit: '8mb' },
}
```

*Lo que conviene añadir con ella:* una prueba que lea `next.config.mjs` y exija
la bandera. Tal como está, el día que la bandera cambie de nombre al subir de
versión mayor el síntoma será exactamente este —parece cubierto y no lo está— y
no habrá nada rojo que lo delate. Los otros dos «no encontrado»
—`(frontend)/not-found.tsx` y `admin-panel/not-found.tsx`— sí funcionan: atienden
las llamadas a `notFound()` desde una página que existe, que es la otra mitad
del problema.

---

### O-043 · 2026-09-13 · media · abierta
**Las guardias del esquema solo miran en una dirección: una columna que sobra no
la ve nadie.**
Apareció al retirar `zonaMapa` (D-081). `tests/unit/migraciones.test.ts`
comprueba que toda columna que una colección declara exista en la última
migración; lo contrario —una columna que está en la base y ya no la declara
nadie— pasa en verde. O sea que un campo retirado **sin** su `DROP COLUMN` se
queda ahí para siempre.

*Dónde se vería:* en ninguna parte, y eso es lo que la hace anotable. La
aplicación no la lee, Payload no la escribe, la suite no protesta y el respaldo
se la lleva cada noche. La única señal es acordarse de mirar la migración cuando
se borra un campo, y la memoria no es una guardia.

*Por qué no se cerró en esta jornada.* La instantánea de Drizzle sí sabe qué
columnas hay, pero comparar en esa dirección obliga a decidir qué se hace con lo
que Payload crea por su cuenta —los `_rels`, la familia de versiones, los
`_order`—, y cada excepción que se escriba es la puerta por la que se colará
justo el caso que importaba. Lo que sí se hizo fue dejarlo escrito en la
cabecera de `columnasDe`, que es donde va a mirar quien toque esa prueba.

---

### O-044 · 2026-09-13 · media · abierta
**Los 50 MB no se han probado por el túnel, y si fallan el síntoma no será un
413.**
El techo nuevo (D-088) se midió contra el nginx del despliegue de `paginas/`,
que declara 64 MB. Por las otras dos vías no ha subido nadie todavía un archivo
grande: Cloudflare aplica 100 MB en el borde —no es del túnel ni de
`cloudflared`, y no se sube con configuración— y Tailscale no publica ningún
tope de cuerpo, aunque su documentación dice que Funnel no está pensado para
tráfico de alto volumen. Hoy la plataforma entra por Funnel.

*Lo que hay que saber antes de ir a buscarlo donde no está:* si esto falla no
habrá un 413 sino una conexión cortada a mitad de la barra de progreso, y el
panel dirá «Se cortó la conexión durante la subida», que es el mensaje de una
red y no el de un límite. Quien lo lea va a buscar el fallo dentro de la
aplicación. La forma de separar los dos lados es subir el mismo archivo contra
`http://localhost:3000` desde el propio servidor: si ahí entra, el corte es del
túnel.

*Qué haría falta para cerrarla:* un vídeo de pabellón de verdad, de los 40 MB
para arriba, subido por la dirección pública. Es una prueba de cinco minutos y
no se puede hacer desde aquí.

---

### O-045 · 2026-09-13 · media · cerrada por 030a59a
**La pose que se captura en el catálogo llega al bloque de una ficha y a ningún
otro sitio.**
D-082 tendió el cable por `encuadreVigente`, y hoy lo llama **un solo**
renderizador: `src/components/Bloques.tsx`. Los otros dos que abren un modelo
del catálogo siguen encuadrándose solos:

- `src/app/(frontend)/tecnica-ao/[id]/page.tsx`, línea 122: el modelo que el
  traumatólogo cuelga de un **paso** de un caso AO se pinta con
  `<Visor3D url={modelo.url} nombre={modelo.nombre} />`, sin encuadre.
- `src/components/simulador/ConsolaQuirurgica.tsx`, el visor del instrumento que
  el residente coge: ahí ni siquiera hay pose que pasar, porque
  `casoQuirurgico.ts` solo se trae `modeloUrl` de la relación.

*Por qué es anotable y no un detalle.* Es la forma exacta de la regresión que
esta bitácora ya tiene contada dos veces (D-054, O-042): el campo se declara, la
ayuda dice «gire el modelo y pulse capturar», el traumatólogo captura y guarda,
y en la pantalla donde lo iba a ver no cambia nada. **No hay error, no hay
prueba roja y lo que se ve es indistinguible de un encuadre mal capturado**, así
que lo que va a intentar es capturarlo otra vez.

*Qué cuesta cerrarlo.* Lo primero es una línea —leer el `encuadre` del modelo y
pasarlo—, con la advertencia de que ahí la relación tiene que llegar poblada.
Lo segundo es más: hay que subir el campo por `casoParaLaConsola`, y conviene
decidir antes si un instrumento debe tener pose propia o si el visor de la
bandeja está mejor abarcando la pieza, que es lo que hace hoy.

---

### O-046 · 2026-09-14 · alta · resuelta
**Seis huecos de permisos que pasaban todas sus pruebas, y los seis por lo mismo:
la regla estaba escrita en un sitio y la puerta la abría otro.**
Aparecieron al pasar la política del dueño (D-107) a una matriz contra la base y
al llamar a cada acción con cada sesión (D-108). Tres se alcanzaban hoy; los
otros tres eran reglas abiertas a las que todavía no llegaba ningún pasillo.

*Alcanzables.*

1. **Un editor restringido a unos módulos leía los borradores de los demás.**
   `filtroDeLecturaDeModulo` delegaba en `filtroDeLectura`, que mira el rol y
   nada más, así que `find`, `draft: true` y `findByID` le daban el borrador
   entero mientras `readVersions` de la misma colección se lo negaba. Las
   páginas leen por la puerta abierta: el simulador le pintaba la lista con la
   etiqueta «Borrador». Con la restricción puesta en la lectura y no en la
   edición era peor: `puedeEditarModulo` y `puedeEditar` solo miraban los
   editables, y el panel le dejaba listar, reescribir, publicar y borrar las
   cirugías que la plataforma no le dejaba abrir.
2. **Un lector comentaba en un módulo que no tiene visible.** La colección solo
   pedía una cuenta activa y `crearComentario` no preguntaba por el módulo:
   llamada la acción desde la consola del navegador, el comentario le llegaba al
   traumatólogo desde un módulo que para esa cuenta no existe.
3. **`anotar` decía validar el módulo y no lo hacía.** Lo afirmaba un comentario
   de `Actividad.ts`, y `exigirSlugDeModulo` dice que el módulo existe, no que la
   cuenta lo vea. `marcarComoLeida('cirugias', …)` con el simulador vetado hacía
   que el panel le contara casos que no puede abrir.

*Latentes.*

4. **El editor leía y podía reescribir la lectura y el puntaje de todos los
   residentes**: `actividad` usaba `accesoDePropiedad`, la regla de los
   comentarios. Ninguna pantalla se lo ofrecía y la API REST está cerrada
   (D-073), pero era la regla con la que habría contestado la primera consulta
   hecha con sus permisos.
5. **Administrador y editor podían reescribir el texto de un comentario ajeno**,
   que el panel seguía firmando con el nombre del autor. El acceso de colección
   decide qué fila se toca, no qué se escribe dentro, y `texto` no tenía acceso
   propio. El panel solo manda `estado`, y por eso no había pasado.
6. **Una sesión con un rol desconocido obtenía permiso de creación.** La regla de
   `comentarios` era `Boolean(user && user.activo)`, y la de `actividad`
   rearmaba el usuario a mano sin mirar el rol. Hoy el `select` de la base no
   admite otro valor; el día que exista un cuarto rol, habría nacido pudiendo
   escribir.

*El porqué común.* Las funciones de `reglas.ts` estaban bien probadas, y ninguna
prueba miraba lo que llega a la consulta. Debajo hay cinco formas de lo mismo: la
API local escribe con `overrideAccess: true`, así que una acción no consulta la
regla de su colección por buena que sea (2, 3); una lista vacía es «todos»
(D-040), y una función que mira una sola de las dos listas amplía con la otra
(1); una regla elegida por parecido —la de propiedad para el seguimiento— hereda
una política que no era la suya (4); un acceso de colección no protege un campo
(5); y una copia hecha a mano de algo que ya existía se queda atrás de la
original (6).

*Arreglo:* D-107, y D-108 para que no vuelva. *Lo que conviene no olvidar:* un
comentario que dice «eso ya se valida allí» no es una guardia. El tercero vivió
detrás de uno.

### O-047 · 2026-09-14 · media · abierta · la arregla el dueño en cPanel
**El dominio `chesscore.cl` tiene dos registros DMARC, y con dos es como no
tener ninguno.**
Visto al preparar D-118, consultando el DNS: `_dmarc.chesscore.cl` devuelve
`v=DMARC1; p=none; rua=mailto:contacto@chesscore.cl` y, además,
`v=DMARC1; p=none;`. RFC 7489 (§6.6.3) manda descartar la política cuando hay más
de un registro, así que Gmail y Outlook tratan los correos de la plataforma como
de un dominio sin DMARC, y eso pesa para caer en «no deseado». SPF
(`v=spf1 +a +mx +ip4:201.148.104.29 ~all`) y DKIM (`default._domainkey`) están
bien. El DNS lo sirve el hosting (`dns1.freehost.cl`), así que se arregla en
cPanel → Editor de zona, borrando el registro sin `rua`. El paso a paso está en
`docs/CORREO.md`. Desde `blanco`, `mail.chesscore.cl` contesta en 465 y 587, con
un certificado válido para `*.chesscore.cl`.

### O-048 · 2026-09-20 · media · abierta
**La carpeta de producción no admite la lista de «Antes de subir», y nada lo
dice.**
Visto al revisar el estado de `faraday`. `C:\Users\vicen\simulaciones` es a la
vez el repositorio y lo que sirve el servicio `traumahub`, y su `.env` es el de
producción. `tests/setup.ts` carga ese `.env`, así que `npm run test:coverage` y
`npm run test:integration` lanzados ahí hablan con la base real —las de
integración crean y borran cuentas y documentos—, y `npm run build` reescribe el
`.next` del que está sirviendo el servicio. No se ejecutó ninguna de las tres.
Las unitarias se corrieron con `OMITIR_INTEGRACION=1` y una `DATABASE_URI` que
no apunta a nada: 2162 pasan y 6 fallan, las seis por el entorno y ninguna por el
producto:
- `rutas.test.ts` y `subidaDeVideo.test.ts` (una cada una) esperan `ruta()` sin
  prefijo, y el `.env` trae `NEXT_PUBLIC_BASE_PATH=/simulaciones`. Las pruebas no
  son herméticas respecto de esa variable.
- `subidaDeVideo.test.ts`, «el panel pinta el avance»: busca en la fuente un
  texto con `\n`, y aquí git tiene `core.autocrlf=true` y el archivo está en CRLF.
- `respaldoEnWindows.test.ts` (tres): ver O-049 y O-050.

*Impacto:* quien siga AGENTS.md al pie de la letra en esta máquina escribe en la
base de producción. *Salida posible:* que `tests/setup.ts` se niegue a arrancar
si `NEXT_PUBLIC_SERVER_URL` no es `localhost`, y un `.gitattributes` con
`* text=auto eol=lf`.

### O-049 · 2026-09-20 · media · abierta
**`restaurar.ps1` le manda a `psql` un BOM delante del volcado si la consola está
en UTF-8.**
`Invocar-Proceso` (`scripts/respaldo-comun.ps1`) escribe en
`$proceso.StandardInput.BaseStream`. En .NET Framework, el `StreamWriter` de
`StandardInput` se crea con `Console.InputEncoding`, y con la página 65001 esa
codificación trae preámbulo: al activarse `AutoFlush` escribe `EF BB BF` antes
del primer byte del volcado, aunque después se escriba por debajo, en el
`BaseStream`. Comprobado: con la consola en 65001 fallan «entrega a psql el
volcado byte a byte» y «rechaza un volcado cortado»; con `chcp 850`, el mismo
código y la misma máquina, pasan. La tarea nocturna no restaura, y respaldar no
usa la entrada, así que **los respaldos de cada noche no están afectados**. El
riesgo es una restauración a mano desde una consola en UTF-8 —Windows Terminal
con `chcp 65001`—. `psql` salta un BOM en la primera línea cuando la codificación
del cliente es UTF-8, así que lo probable es que restaure bien igual; no se
probó contra un `psql` de verdad, y una restauración no es el momento de
averiguarlo. *Salida posible:* fijar `[Console]::InputEncoding` a un
`UTF8Encoding($false)` alrededor de `Process.Start` y devolverlo después.

### O-050 · 2026-09-20 · baja · abierta
**La aplicación vive en hora de Santiago y la máquina en hora de Madrid, y los
respaldos llevan las dos.**
`.env` dice `TZ=America/Santiago`; Windows está en «Romance Standard Time». La
tarea nocturna nombra sus archivos con el reloj de Windows
(`base-20260920-043001`), y el panel lee esa marca como hora local de *su*
proceso, que es Santiago: cinco horas de diferencia en septiembre. Es lo que
hace fallar «deja base y medios con nombres que el panel lista», que exige que
la fecha leída esté a menos de cinco minutos de ahora. Consecuencias: un
respaldo de la tarea y uno del botón del panel hechos a la misma hora llevan
marcas separadas cinco horas, y el respaldo «de las 04:30» corre a las 22:30 o
23:30 de Chile, que es hora de trabajo de quien redacta, no la madrugada que se
quería. No se pierde nada. *Salida:* poner Windows en la zona de Chile, o mover
la tarea con `-Hora`.

### O-051 · 2026-09-20 · baja · abierta
**La pantalla «Respaldos» describe el servidor de Linux, y el que corre es el de
Windows.**
`PanelDeRespaldos.tsx` dice «un respaldo diario programado a las 03:00» y manda a
restaurar con `./scripts/restaurar.sh`. En `faraday` la tarea corre a las 04:30
(`registros\respaldos.log`) y el guion que existe es `restaurar.ps1`. El texto lo
lee un administrador justo cuando algo ha ido mal. Además, las seis últimas
líneas del registro traen `AVISO sin copia fuera del disco`: `RESPALDOS_COPIA_DIR`
sigue sin ponerse y todos los respaldos viven en el disco que protegen (D-113).
`docs/MANUAL-DE-USO.md` lo suple pidiendo una descarga mensual a mano, que es un
parche y no la solución.

### O-052 · 2026-09-21 · alta · resuelta
**Los guiones de `scripts/` estaban en git sin permiso de ejecución.**
Visto al actualizar el Ubuntu: `./scripts/actualizar.sh` respondió `Permiso
denegado`. Los ocho `.sh` figuraban como `100644`. Se escribieron y se
confirmaron desde Windows, donde el bit no existe y git no lo inventa; en la
máquina donde se probaron alguien hizo `chmod +x` a mano, y eso no viaja.
Llamarlos con `bash scripts/x.sh` no bastaba, porque se llaman entre ellos con
`./scripts/deploy.sh` y `exec ./scripts/salud.sh`. Y un `chmod +x` en el servidor
deja el árbol con cambios, que es justo lo que `actualizar.sh` se niega a pisar.
*Arreglo:* `git update-index --chmod=+x` sobre los ocho. Un `.sh` nuevo creado
desde Windows nacerá otra vez sin el bit: hay que repetirlo al añadirlo.
*Lo que tapaba:* el `crontab` de `ved` llama a `./scripts/respaldar.sh` cada
noche, y `backups/respaldo.log` solo tenía líneas de `Permission denied`. **El
Ubuntu no tuvo un solo respaldo nocturno desde que se instaló el 6 de
septiembre.** Tras el arreglo se lanzó a mano tal como lo lanza cron
(`TUNEL=local … --verificar`) y dejó base y medios, verificados.

### O-053 · 2026-09-21 · alta · resuelta
**`restaurar.sh` restauraba la base y nunca los archivos subidos.**
Visto en la mudanza a `ved` (D-123): «no se pudieron restaurar los medios». La
línea hacía `gzip -dc medios.tar.gz | … tar xzf -`: descomprimía dos veces. El
`tar` de la imagen recibía un tar ya descomprimido, salía con `invalid magic`, y
el `2>/dev/null` de la misma línea se lo callaba. Reproducido en el servidor
listando sin escribir: con `tzf` falla, con `tf` lista. Las dos órdenes «a mano»
que el guion sugiere, y la de `docs/DESPLIEGUE.md`, tenían el mismo error, así
que el plan B tampoco funcionaba. *Arreglo:* `tar xf` en los cuatro sitios. D-113
cuenta que la restauración se probó con archivos subidos, pero por el camino de
PowerShell; el de bash con medios no se había ejecutado nunca con éxito.
*Pendiente:* ninguna prueba lo cubre, porque hace falta Docker.

### O-054 · 2026-09-21 · alta · resuelta en `ved`
**En `ved`, los archivos subidos vivían dentro del contenedor y se borraban en
cada despliegue.**
El `docker-compose.override.yml` del servidor era la copia del 6 de septiembre y
montaba el volumen en `/app/public/media`. Cuando los medios salieron de
`public/` a `/app/medios`, la plantilla de `despliegue/paginas/` se corrigió,
pero el archivo del servidor **no se versiona** —es lo que permite el `git pull`
sin choques— y nadie lo volvió a copiar. `auto-update.sh` reconstruye el
contenedor con cada commit: cualquier imagen o modelo subido habría durado hasta
el siguiente. No se perdió nada porque el Ubuntu estaba sin contenido.
*Arreglo:* se copió la plantilla vigente y se comprobó el montaje con `docker
inspect` y escribiendo en `/app/medios` como el uid 1001. *Lo que sigue
abierto:* el mecanismo. La próxima vez que cambie la plantilla volverá a pasar,
en silencio. Haría falta que `deploy.sh` o `salud.sh` compararan el override con
su plantilla y avisaran.

### O-055 · 2026-09-21 · alta · resuelta, con la causa sin cerrar
**El proxy de `ved` llevaba tres días caído, y con él todas las páginas.**
Al comprobar la mudanza desde fuera, 502 en todo, también en la raíz de APCE.
`ved` se reinició el 2026-09-17 a las 16:20 y el contenedor
`nginx-proxy-manager` arrancó **sin ninguna red conectada** (`docker inspect`
daba la lista vacía). Sin red no resuelve `apce-backend`, y nginx se niega a
arrancar con `host not found in upstream`: en bucle desde las 16:21 de ese día.
`start-all.log` dice «levantado OK», porque el contenedor sí arrancó. Es el
fallo que `despliegue/paginas/LEEME.md` describe para justificar el `set
$traumahub`, solo que por la puerta de otro proyecto: el `proxy_pass` literal es
el de APCE, en `proxy_host/1.conf`, que genera el panel de NPM.
*Arreglo:* `docker compose up -d --force-recreate` en `nginx-proxy-manager/`;
volvió con sus dos redes y las cuatro páginas responden. *Causa probable, no
demostrada:* el compose publica el panel en `100.76.92.40:8181`, la IP de
Tailscale, que al arrancar la máquina todavía no existe. *Pendiente:* que
`start-all.sh` espere a Tailscale o compruebe el proxy después de levantarlo, y
algo que avise: tres días caído sin que nadie lo supiera es el dato.

---

## 4. Preguntas abiertas

### Q-008 · ¿Merece la pena un dominio propio para la plataforma?
Hoy la dirección es `traumahub.tailc2094f.ts.net/simulaciones`: el nombre de la
máquina se eligió, el resto no. Tailscale Funnel no admite dominios propios, así
que un `traumahub.cl` exige cambiar de túnel a Cloudflare, que el repositorio ya
documenta. El costo es un dominio al año y media tarde de configuración; el
beneficio es una dirección que un residente pueda escribir de memoria. La
pregunta no es técnica, es si la plataforma va a repartirse fuera del grupo que
ya tiene el enlace guardado.

### Q-001 · ¿A quién se le presenta este prototipo?
No es lo mismo pulir para una jefatura de servicio, para una universidad, para
una sociedad científica o para inversión. Cambia qué módulo se muestra primero y
cuánto se invierte en el módulo 05, que hoy es humo declarado.

### Q-002 · ¿Se sostiene el bilingüe? · RESUELTA 2026-08-28 por D-012
Duplica el costo de redacción de cada ficha, que ya es la tarea más cara. La
alternativa es escribir todo en español y traducir cuando exista tracción, a
costa de reescribir la estructura de datos más adelante (barato) y de retraducir
todo lo escrito (caro). Decisión que conviene tomar antes de la quinta ficha.

### Q-003 · ¿El módulo 04 se demuestra con una sola cirugía o con tres?
Hoy hay una completa y dos anunciadas. Una cirugía bien hecha demuestra el
mecanismo; tres a medias no demuestran nada. Mi lectura: mantener una hasta que
el guion quirúrgico de la segunda esté escrito por completo.

### Q-004 · ¿Quién firma la autoría del contenido y bajo qué licencia?
Abierta y con fecha límite propuesta: **antes de la quinta ficha**. Hoy el
prototipo declara que el contenido definitivo debe ser redactado por el equipo
docente o licenciado a su titular (O-007). Con dos personas y una plataforma
que puede tener uso público, conviene un acuerdo escrito de autoría, licencia y
qué ocurre con el contenido si la colaboración termina. No es papeleo: es lo
que separa un producto propio de un litigio.

### Q-005 · ¿Qué datos personales se van a recolectar de los usuarios?
Si la plataforma registra residentes y guarda su progreso (O-006), entra en el
ámbito de la ley chilena de protección de datos. La respuesta barata es
recolectar el mínimo: correo institucional, nada de datos sensibles, y ningún
dato de paciente en las imágenes que se suban. Decidirlo antes de escribir la
primera pantalla de registro sale gratis; después, no.

### Q-006 · ¿Cuál es el equipo de referencia del residente?
El 3D se renderiza en el navegador del estudiante, no en el servidor. Hay que
fijar un equipo mínimo de prueba —un notebook modesto, no la máquina de
desarrollo— y un presupuesto por modelo de 5 MB comprimido. Sin ese objetivo
explícito, los modelos crecen hasta que la plataforma deja de abrirse en la
mitad de los equipos.

### Q-007 · ¿De dónde salen las TC y RM que se van a segmentar?
Es la pregunta que hay que responder antes de procesar el primer estudio, no
después. Tres caminos, de menor a mayor fricción: conjuntos públicos ya
anonimizados y con licencia clara —TotalSegmentator trae 1.200 tomografías con
117 estructuras ya segmentadas bajo CC BY 4.0—; estudios del hospital
anonimizados con autorización del comité correspondiente; o estudios propios con
consentimiento explícito. El primero permite empezar mañana sin ningún trámite y
es lo que recomiendo para construir y probar toda la cadena.

---

## 5. Convenciones de esta bitácora

- Cada decisión entra como `D-nnn` con contexto y consecuencia, no solo con el
  resultado. Dentro de tres meses la consecuencia es lo único que sirve.
- Cada observación entra como `O-nnn` con dónde se ve, no solo qué pasa.
- Las entradas no se borran. Si una decisión se revierte, se marca **superada**
  y se enlaza la nueva.
- Las fechas van en formato absoluto (2026-08-28), nunca "la semana pasada".
- Lo que se decide en conversación y no queda aquí, no se decidió.
