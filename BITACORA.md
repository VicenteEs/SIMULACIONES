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

### D-125 · 2026-09-21 · vigente
**El taller anatómico pierde el mando «Separar».**
El dueño pidió quitarlo. Era un deslizador que alejaba cada pieza de su sitio, y
lo que dejaba guardado viajaba con la preparación hasta la ficha.

*Qué se hizo.* Se retiró solo el mando de `TallerDeAtlas.tsx`, y la mención a la
separación en la ayuda del panel derecho. Todo lo de debajo sigue: el campo
`vista.separacion` del formato, el uniforme del sombreador, el cálculo del pivote
y del picado con el cuerpo separado, y sus pruebas. El estado `separacion` del
taller también se queda, ya sin mando: así una preparación que la traiga se abre
y se vuelve a guardar igual, en vez de cerrarse en silencio al primer guardado.

*Por qué no se arrancó entero.* El formato guardado es un contrato con lo que ya
está en la base y en los respaldos, y quitar el campo pedía una migración para
borrar algo que hoy vale cero en todas partes. En `ved`, el día del cambio, había
dos preparaciones y las dos con separación 0: no se pierde nada.

*Consecuencias buenas.* Un mando menos en una pantalla que ya tiene muchos.
*Malas.* Queda código vivo que ninguna pantalla puede ejercitar, solo sus
pruebas. Y una preparación con separación que llegase de un respaldo antiguo no
se podría cerrar desde el taller: habría que rehacerla desde «Cuerpo completo».

### D-126 · 2026-09-21 · vigente
**El taller anatómico se maneja como Blender: seleccionar primero, actuar
después. Primera fase de tres.**
El dueño pidió «los comandos básicos» de Blender —arrastre para seleccionar,
rotar, quitar— y poder «quebrar un hueso» desde el visor, todo ligero.

*Qué se hizo (fase 1: selección).* Un clic sobre una pieza la **selecciona** y
ya no la apaga; Mayús + clic suma o quita. La herramienta «Marco» (tecla B)
dibuja un recuadro y se lleva las piezas cuyo **centro** cae dentro
(`src/atlas/seleccionPorCaja.ts`): con «lo que toque el marco», la piel y la
fascia —cuyas cajas abarcan medio cuerpo— entraban en toda selección. Sobre lo
seleccionado: apagar (Supr, X, H), dejar solo eso (Mayús + H), encender todo
(Alt + H), invertir (Ctrl + I), todo y nada (A, Alt + A). Vistas de frente,
lateral y superior (1, 3, 7; con Ctrl la contraria) y centrar en la selección
(punto). Ctrl + Z deshace encendidos y apagados, cincuenta pasos. Cada atajo
tiene su botón bajo el visor, y «Atajos» enseña la lista. La selección es un
cuarto estado de la textura que ya lee el sombreador (`ESTADO.SELECCIONADA`),
pintado del naranja de Blender: no cuesta ni una llamada de dibujo más.

*Lo que NO es como Blender, a propósito.* Con «Girar» el botón izquierdo sigue
girando la cámara: quien escribe fichas es traumatólogo, no modelador, muchos
trabajan con el panel táctil de un portátil y no tienen botón central. Solo con
«Marco» el giro pasa al central. Las vistas valen con los números de arriba,
porque un portátil no trae teclado numérico. Y «derecha» es la del paciente,
como en toda imagen clínica, no la de la pantalla.

*Consecuencias buenas.* Dejar sola una rodilla pasa de cuarenta clics a un
marco y una tecla; se comprobó en un navegador con el atlas entero: un marco
sobre las piernas se lleva 253 piezas y deja fuera la piel. *Malas.* Cambia un
gesto que el manual enseñaba —el clic apagaba—, y quien lo tuviera aprendido
verá la pieza ponerse naranja en vez de desaparecer; el manual lo avisa. El
marco no mira profundidad: se lleva también lo que queda detrás.

*Lo que falta, y por qué no entró.* **Fase 2, mover y rotar piezas (G y R).**
Hoy cada pieza es un rango dentro de una malla fusionada por sistema y el
sombreador solo sabe desplazarla por la dirección de separación; moverla pide
una segunda textura con una transformación por pieza, que el picado y el marco
la apliquen también, y un campo nuevo en `ContenidoDeInstancia` que el visor de
las fichas sepa leer. **Fase 3, quebrar un hueso en el visor.** El corte ya
existe —`src/lib/osteotomia.ts` parte la malla por un plano y tapa los dos
trozos—, pero solo al exportar hacia el simulador. Traerlo al taller es guardar
el plano en la preparación y partir la pieza al cargarla; depende de la fase 2,
porque un fragmento que no se puede mover no se distingue del hueso entero.
Las dos cambian el formato guardado, que es lo que ven los residentes, y por eso
van aparte y con sus pruebas.
*Después:* las dos fases se hicieron el mismo día: D-129 y D-130.

### D-127 · 2026-09-21 · vigente
**Una página abierta se entera de que hay versión nueva, y se recarga sola si no
se lleva nada por delante.**
`main` se despliega solo (`auto-update.sh`), y quien tenía la plataforma abierta
seguía con el JavaScript de la construcción anterior hasta recargar por su
cuenta. El dueño pidió que se les recargue.

*Qué se hizo.* El flujo `/api/cambios` manda, además de la cuenta de
publicaciones, la construcción que sirve (`.next/BUILD_ID`) y el instante en que
arrancó el proceso (`src/lib/despliegue.ts`). `AvisoActualizacion` decide con
`src/lib/avisoDeVersion.ts`: proceso distinto y construcción distinta es versión
nueva. Entonces: pestaña oculta y sin cambios sin guardar, recarga en el acto;
pestaña a la vista, cuenta atrás de 30 s con «Recargar ahora» y «Más tarde»;
con cambios sin guardar (`hayCambiosSinGuardar`: fichas, taller, difusión), solo
el aviso, sin cuenta atrás, y se vuelve a preguntar cada segundo por si alguien
empieza a escribir durante la cuenta. El aviso de contenido nuevo sigue sin
recargar nunca por su cuenta.

*El problema del huevo y la gallina.* Las pestañas abiertas el día de este
cambio corren un código que no sabe leer `despliegue`. Para ellas, la cuenta de
publicaciones sale ahora sumada a los segundos del arranque: el código viejo la
ve subir y saca su aviso de siempre, con su botón «Recargar». Dice «contenido
actualizado» y no «versión nueva», que es lo más que se le puede pedir a un
código ya descargado. De paso, el cliente nuevo deja de necesitar el remiendo
de «la cuenta bajó, fue un reinicio»: sabe cuándo cambia el proceso.

*Consecuencias buenas.* Un arreglo desplegado llega a quien ya estaba dentro en
menos de un minuto. *Malas.* Una cirugía simulada a medias no declara cambios
sin guardar: a ese residente le sale la cuenta atrás y tiene 30 s para pulsar
«Más tarde». Y sin `BUILD_ID` —en desarrollo— cada reinicio cuenta como versión
nueva.

### D-128 · 2026-09-21 · vigente
**Pasada de rendimiento: que por el túnel viaje solo lo que se pinta.**
El dueño pidió revisar qué se podía optimizar. Se midió antes de tocar: los
paquetes del atlas ya viajan comprimidos e inmutables, three ya se carga en
diferido y `force-dynamic` es inevitable porque todo depende de la sesión. Lo
que sobraba estaba en las consultas de los listados.

*Qué se hizo.*
- Biblioteca, simulador, técnica AO e imágenes pedían hasta 500 documentos
  **enteros** —en patologías, seis pilas de bloques de texto rico cada uno, con
  las relaciones pobladas— para pintar un código y un nombre. Ahora llevan
  `select` con los campos de la tarjeta y `depth: 0`. Se comprobó contra una
  base de verdad que el control de acceso sigue filtrando: el lector no recibe
  el borrador, el administrador sí.
- «Continuar leyendo», en la portada, resolvía cada título con un `findByID` sin
  `depth`, que traía la ficha con sus medios poblados. Ahora `depth: 0`.
- El resumen del panel esperaba a su `Promise.all` y después lanzaba, suelta, la
  consulta de comentarios pendientes. Va dentro.
- El descodificador de Draco (`/draco/*`) se servía con `max-age=0`: tres
  peticiones condicionales por cada ficha con modelo 3D. Ahora se guarda una
  semana.

*Lo que se miró y NO se hizo.* `obtenerSesion` se llama tres o cuatro veces por
página y se podría envolver en `cache()` de React. No se tocó: «Ver como
residente» y la entrada cambian la sesión dentro de una acción y pintan después
en la misma petición, y una sesión memorizada de antes del cambio enseñaría
contenido de editor a quien acaba de bajarse a residente. El ahorro son dos
consultas por clave primaria contra una base en la misma máquina —milisegundos—
y el riesgo es de control de acceso. Tampoco se pusieron en paralelo la ficha y
sus lecturas en las páginas de detalle: ahorra una consulta local y cambia el
orden respecto de `notFound()`.

*Consecuencias buenas.* El listado de la biblioteca deja de crecer con lo largo
que sea cada ficha. *Malas.* Un campo nuevo en una tarjeta de listado hay que
añadirlo también al `select`, o llega `undefined` sin ningún error.

### D-129 · 2026-09-21 · vigente
**Mover y rotar piezas en el taller (G y R), y lo que se mueve se guarda y se ve
en las fichas. Segunda fase de D-126.**
El dueño pidió «más funcionalidades de Blender». De su modo objeto se trajo lo
que sirve para enseñar traumatología: sacar una pieza de su sitio.

*Cómo.* Cada pieza sigue siendo un rango dentro de la malla fusionada de su
sistema. Su transformación vive en dos texturas nuevas con la misma rejilla que
la de estado —un cuaternión y un traslado— que lee el sombreador de vértices; la
normal gira con la pieza. El giro es sobre el centro de la propia pieza, pero el
sombreador gira sobre el origen del atlas, así que la diferencia se compone en
la CPU, una vez por pieza (`ponerTransformacion`): q·(p − c) + c + t = q·p +
(c − q·c + t). El picado no transforma geometría: le aplica al rayo la inversa y
cruza contra la pieza en reposo (`rayoParaLaPieza`); el marco busca el centro
donde se dibuja.

*El gesto* es modal, como en Blender: G o R, las piezas siguen al ratón sin
pulsar nada, X/Y/Z atan a un eje, clic o Intro confirman, Esc o el botón derecho
cancelan; mientras dura, la cámara no se mueve y el teclado es suyo. Se calcula
siempre desde la transformación de partida y no sumando incrementos, para que un
giro de ida y vuelta devuelva la pieza a su sitio. Durante el gesto se escribe
directo en las texturas; React solo se entera al confirmar. La cuenta está en
`src/atlas/transformar.ts`, sin lienzo, con sus pruebas.

*Formato.* `PiezaDeInstancia` gana `mover` y `girar`, opcionales. El servidor
los limpia (`transformacionLimpia`): finitos, traslado acotado a 2 m, cuaternión
normalizado y con la W positiva, y lo que no mueve nada no se guarda. Una
preparación anterior se lee igual que antes. No hay migración: `contenido` es
JSON.

*De paso:* rehacer (Ctrl + Mayús + Z), deshacer cubre también lo movido, Mayús +
G selecciona el mismo sistema, y «Rayos X» (Alt + Z) pinta en damero lo no
seleccionado —transparencia sin ordenar 2,3 millones de triángulos—.

*Consecuencias buenas.* Una luxación o un desplazamiento se arman en el taller y
se ven en la ficha. *Malas.* Dos lecturas de textura más por vértice. El pivote
de la cámara y «Encuadrar» siguen midiendo la caja en reposo: una pieza llevada
lejos queda fuera del encuadre automático. «Exportar como modelo» ignora lo
movido. Con el cuerpo separado y la pieza girada a la vez el picado se equivoca
por poco; el mando de separación ya no existe (D-125).

### D-130 · 2026-09-21 · vigente
**Quebrar un hueso en el taller: se traza una línea y queda partido en dos
fragmentos que se mueven por separado. Tercera fase de D-126.**
Es lo que el dueño pidió desde el principio, con esas palabras.

*Cómo.* Herramienta «Cortar» (K), copiada del «Bisect» de Blender: actúa sobre
lo seleccionado —un solo hueso—, y el plano contiene la línea trazada y la
dirección en la que se mira (`planoDeLaLinea`). Parte `partirMalla`, el mismo
corte con tapa que usa la exportación al simulador (`src/lib/osteotomia.ts`).
Un hueso partido no cabe en la malla fusionada —tiene triángulos nuevos y dos
tapas—: se apaga allí y entra en la escena como dos `Mesh` sueltos
(`src/atlas/fragmentos.ts`), con el material de su sistema. Se señalan con el
cruce de rayos de three, que para dieciséis mallas pequeñas sobra, y gana lo que
el rayo toque antes, pieza o trozo. Los fragmentos se llaman `FJ3387#a` y `#b`,
se seleccionan, entran en el marco y se mueven con G y R como cualquier pieza.
«Soldar» deshace el corte.

*Formato.* `ContenidoDeInstancia.cortes`: la pieza, el punto y la normal del
plano, y lo movido de cada fragmento. **No se guarda geometría**: la ficha parte
el hueso al cargar. Una tibia partida pesa seis números. El servidor valida
(`cortesValidos`): pieza presente en la preparación, un corte por pieza, ocho
por preparación, números finitos, normal no nula.

*Lo que se decidió no hacer.* Cortar una pieza ya movida: habría que llevar el
plano a su espacio en reposo y heredar la transformación en los dos trozos; se
pide devolverla a su sitio antes. Más de un corte por hueso —una conminuta—:
pediría fragmentos de fragmentos. Un trazo libre o en zigzag: el corte es un
plano, «un corte limpio sirve» (O de `osteotomia.ts`).

*Consecuencias buenas.* Una fractura desplazada se arma en dos minutos y sin
Blender, y se ve en la ficha. Se comprobó en un navegador con el atlas entero:
tibia partida, fragmento movido y girado, guardado, reabierto sin «cambios sin
guardar». *Malas.* Cada ficha con un corte parte el hueso en el navegador del
residente al abrirla. Si el atlas se regenera y el plano deja de tocar la pieza,
la ficha la enseña entera, sin aviso al lector. Apagar un fragmento apaga el
hueso entero. Los rayos X no atraviesan los fragmentos. Y se quitó el aviso de
«hueso partido»: los avisos van encima del lienzo y lo empujan, de modo que el
clic siguiente —sobre el fragmento— caía en otra pieza; esa forma de avisar le
pasa lo mismo a cualquier otro mensaje que salga a mitad de un gesto.

### D-131 · 2026-09-21 · vigente
**Los modelos 3D del catálogo se abren en el taller anatómico.**
El dueño pidió que los 23 modelos que hay «también aparezcan en el taller».

*Lo que se encontró.* No hizo falta cargar ningún `.glb`. Veinte de los 23 son
exportaciones del propio atlas —antebrazo, mano, muslo, pierna, pie, de cada
lado— y cada malla viaja con `extras.part_id`, el identificador de la pieza de
la que salió, en las mismas coordenadas. Un modelo es, en la práctica, una lista
de piezas del atlas con otro envoltorio. Por nombre también casaban todas, pero
el nombre no basta: 243 nombres del catálogo se repiten entre el lado derecho y
el izquierdo («Distal perforating artery»), y Blender los distingue con un
`.001` que no dice cuál es cuál.

*Qué se hizo.* `listarModelosDelAtlas` lee de cada archivo solo la cabecera y el
bloque JSON (`src/lib/piezasDeUnModelo.ts`) —unos kilobytes de un archivo de
tres megas— y devuelve los `part_id` que existen en el catálogo vigente. El
taller los lista en «Modelos 3D»; abrir uno enciende esas piezas, encuadra, y
deja una preparación nueva con el nombre del modelo, sin marcarla como cambiada.
A partir de ahí es el taller de siempre, con D-126, D-129 y D-130.

*Los tres que no.* «Tibia de prueba (partida)» es sintética, y las dos «pierna
derecha · del atlas» son exportaciones agrupadas por sistema («Musculos»,
«Arterias»), que funden muchas piezas en una malla y no guardan de cuáles.
Salen en gris, con el motivo.

*Consecuencias buenas.* Los modelos quedan al alcance de todas las herramientas
sin duplicar geometría ni escribir un segundo editor. *Malas.* El camino es de
ida: lo que se haga en el taller se guarda como preparación, no vuelve al
`.glb`; para eso está «Exportar como modelo», que sigue ignorando lo movido y lo
cortado (D-129). Un modelo retocado en Blender —piezas movidas o remalladas—
se abriría con la anatomía original del atlas, no con el retoque: el taller no
mira su geometría. Y si el archivo no está en disco —base restaurada sin los
medios— el modelo sale como «no es del atlas», que no es exacto.

### D-132 · 2026-09-21 · vigente
**El taller se acerca a Blender, en seis tandas (D-132 a D-137). Primera: lo que
estorbaba.**
El dueño pidió hacer todo lo propuesto para que el editor se pareciera más a
Blender. Se hizo por tandas, cada una probada en un navegador con el atlas
entero y con su commit.
- *Avisos flotantes.* Los dos avisos del taller iban en el flujo de la página y
  empujaban el lienzo al aparecer: tras cortar un hueso, el clic siguiente caía
  en otra pieza (D-130). Ahora flotan arriba a la derecha, con su aspa.
- *Vista ortográfica (5).* Sin cambiar de cámara: una `PerspectiveCamera` con 2°
  de campo y veintidós veces más lejos proyecta casi en paralelo, y así ni
  OrbitControls ni el picado ni el gesto saben que algo cambió. Lo que se guarda
  es siempre la cámara de perspectiva (`vistaDe` la convierte).
- *«Encuadrar» cuenta lo movido.* `cajaDeLoVisible` acepta lo que cada pieza se
  desplazó. Solo para «Encuadrar» y «Centrar»: el pivote automático sigue
  midiendo en reposo, porque una cámara que se desliza sola detrás de cada pieza
  que se mueve marea.
- *El árbol selecciona.* El nombre de cada pieza es un botón; la casilla sigue
  encendiendo. Lo seleccionado se marca en los dos sitios.
- El naranja de la selección se oscureció: sobre hueso, casi blanco y con luz
  por encima de 1, el de antes salía lavado.

### D-133 · 2026-09-21 · vigente
**Asas, panel de números y valores tecleados.**
G y R son invisibles para quien no viene de Blender. Un manipulador de tres
flechas y tres aros (`src/atlas/gizmo.ts`) sobre lo seleccionado dice que se
puede mover sin leer nada: se dibuja sin prueba de profundidad y con tamaño
constante en pantalla, y sus asas de agarre son invisibles y el triple de
gordas. Agarrar una es empezar el mismo gesto modal ya atado a su eje, que se
confirma al soltar. Si el rayo cruza una flecha y un aro gana la flecha: de
frente, el aro de Y se ve de canto justo encima de la flecha de X.
El panel «Posición y giro» lee y deja teclear milímetros y grados; los ángulos
salen de `src/atlas/angulos.ts`, sin three —el taller no puede importarlo—, y
una prueba comprueba que dan lo mismo que `THREE.Euler` en orden XYZ. Durante un
gesto, teclear un número lo hace exacto (`G X 8 Intro`).
*Malas.* Cerca de ±90° en Y los tres ángulos se degeneran (bloqueo de cardán):
lo guardado es el cuaternión, que no lo sufre, pero el panel lo lee raro.

### D-134 · 2026-09-21 · vigente
**Color y transparencia propios de cada pieza.**
`PiezaDeInstancia.color` existía desde el principio y nadie lo pintaba. Una
cuarta textura lleva el color y la opacidad de cada pieza. La opacidad es una
trama de píxeles descartados (secuencia R2), no transparencia de verdad: esa
pide ordenar 2,3 millones de triángulos por fotograma. Los fragmentos de hueso,
que son pocas mallas sueltas, sí usan la de verdad. `opacidad` se guarda entre
0,1 y 1; maciza no se guarda. Arrastrar el deslizador cuenta como un solo paso
de deshacer.

### D-135 · 2026-09-21 · vigente
**Rótulos, medidas y vistas con nombre.**
`ContenidoDeInstancia` gana `marcas` (rótulo, distancia, ángulo) y `vistas`
(`src/atlas/marcas.ts`, sin three, que valida el servidor). Se marca sobre la
anatomía: el punto sale de la distancia del impacto del picado. Las líneas van
en la escena sin prueba de profundidad; los textos son HTML proyectado tras cada
dibujado, sin pasar por React. En la ficha las vistas salen como botones.
*Malas.* Los puntos se guardan en el espacio del atlas, no atados a la pieza: si
después se mueve el fragmento, la marca se queda. No entran en deshacer.

### D-136 · 2026-09-21 · vigente
**Agrupar, espejo, y las herramientas sobre el lienzo.**
- *Grupos* (`grupos` en el contenido): pulsar un miembro selecciona el grupo.
  No es el emparentado de Blender —no hay jerarquía ni transformaciones
  relativas—, es selección conjunta, que es lo que hacía falta para mover el
  fragmento con lo que cuelga de él. Cortar y soldar los mantienen coherentes.
- *Espejo* (`src/atlas/espejo.ts`): cada pieza por su contralateral, y lo
  movido, cortado, pintado y apuntado, reflejado en X. La pareja se busca por
  nombre («Right» ↔ «Left») y, como 243 nombres se repiten, por la caja
  reflejada más parecida, con dos centímetros de holgura. Medido: las
  extremidades son espejos exactos (décimas de milímetro) y 1.311 de las 1.744
  piezas con lado tienen pareja; los ojos y el tronco, no. No entra en deshacer:
  es su propia inversa.
- *Barra.* Tres grupos de botones flotan sobre el lienzo —herramientas a la
  izquierda, vistas arriba—; la barra de abajo pasó de cinco renglones a dos.

### D-137 · 2026-09-21 · vigente
**Varios cortes por hueso, cortar lo ya movido, y el corte del taller hacia el
simulador.**
- *Cortes encadenados.* `CorteDePieza.pieza` puede ser un fragmento
  (`FJ3387#b`), y sus trozos son `FJ3387#b#a` y `#b#b`: el nombre es el camino
  de cortes. Existen las hojas del árbol (`hojasDe`). Hasta tres cortes
  encadenados y ocho por preparación. El visor rehace todos los trozos cuando
  cambia cualquier corte: llevar la cuenta de qué sale de qué era más código que
  lo que ahorra. `partesDeFragmento` devuelve ahora `padre`, no `pieza`.
- *Cortar lo movido.* El plano se traza sobre lo que se ve y se guarda en el
  sitio anatómico de lo que se corta (`planoEnReposo`); los dos trozos heredan
  la transformación del padre corregida a su propio centro
  (`transformacionHeredada`), para que no den un salto. Se fue la regla de
  «devuélvala antes a su sitio».
- *Soldar* deshace el último corte del fragmento; lo que se movieron sus trozos
  se pierde y el padre vuelve a su sitio.
- *Hacia el simulador.* **No se exporta lo desplazado, a propósito**: la consola
  quirúrgica espera el hueso en su sitio, porque el desplazamiento lo pone el
  caso y el residente lo reduce midiendo desde la posición anatómica. Lo que sí
  se unificó es el corte: `corteDesdeElPlano`, la inversa de `planoDelCorte`,
  lleva el plano del taller a posición, inclinación y giro, y el panel de
  exportar ofrece «Usar el corte del taller». Lo que la exportación no admite
  —más de 60° de inclinación, fuera del 5–95 % del hueso— se acota y se avisa.
  Solo cortes de un hueso entero: un fragmento de un fragmento no tiene nombre
  en el simulador.
*Malas de toda la serie.* `ContenidoDeInstancia` creció mucho en un día y todo
es opcional: una preparación antigua se lee igual, pero el formato ya merece su
propia versión 2 el día que algo deje de ser compatible. La cobertura bajó de
91,9 % a 89 %: lo nuevo del visor y del taller solo se prueba en navegador.

### D-138 · 2026-09-22 · vigente para el pelo · superada para la piel por D-155
**El atlas se queda sin piel, cejas, pelo ni vello, de raíz.**
El dueño pidió que desaparecieran «para siempre». La piel (`FJ2810`) era una
cáscara de 23.000 vértices que envuelve el cuerpo entero, con la caja más
grande del atlas: entraba en cualquier marco, tapaba cualquier corte y era lo
primero que había que apagar en cada preparación. Con ella se van `Eyebrow`,
`Hair of head` y `Pubic hair`; pestañas no hay en el atlas.

*Cómo.* El material de origen no está en el servidor, así que
`scripts/atlas/quitar-piel.mjs` trabaja sobre lo ya preparado: reescribe los
dos paquetes que las traían copiando los bloques de las demás piezas uno tras
otro, con sus desplazamientos nuevos, y el catálogo con versión nueva. Se
comprobó byte a byte que las 2.230 piezas que quedan son idénticas. Los paquetes
10 y 11 pierden 1,3 MB comprimidos. El guion es idempotente y hay que volver a
pasarlo si algún día se regenera el atlas desde el origen.

*Consecuencias.* Las preparaciones guardadas que incluían la piel —«cuerpo», en
producción— la pierden y el taller las marca como desfasadas; una que aún la
nombre se exporta sin ella y sin avisos de piel. El recorte de piel de la
exportación sigue en el código, probado con pieles sintéticas, por si vuelve.
Los 23 modelos `.glb` que la traían siguen intactos: son archivos aparte.

### D-139 · 2026-09-22 · vigente
**Rayos X como en Blender, y el taller a todo el ancho.**
El damero de D-129 no se leía como los rayos X de Blender: lo de detrás se veía
a trozos y lo de delante seguía tapando. Ahora es mezcla de verdad al 50 %, sin
escribir profundidad, en todas las piezas y en los trozos; la opacidad propia
(D-134) se deja de aplicar mientras están puestos. Los triángulos de cada malla
no se ordenan de lejos a cerca —son 2,3 millones—; a opacidad fija apenas se
nota, y Blender tampoco los ordena.
El panel limita el contenido a 1200 px; la página del taller lleva la clase
`atlas-taller` y `admin.css` le suelta el tope. Y los avisos flotantes (D-132)
bajan a la esquina inferior derecha: arriba tapaban «Guardar preparación», que
es justo el botón que el aviso de «cambios sin guardar» pide pulsar.

### D-140 · 2026-09-22 · vigente, con el corte rehecho en D-141
**El marco que corta: seleccionar con un rectángulo y partir limpio lo que
cruza su borde.**
El dueño lo pidió con estas palabras: «si mi selectbox corta un músculo por la
mitad, de verdad lo haga, un corte limpio, como si se cortara con cuchillo».

*Cómo.* Un rectángulo en pantalla es una pirámide con el vértice en la cámara:
cuatro planos (`planosDelRectangulo`). Cada pieza —o trozo— que cruza alguno se
parte por él con el corte con tapa de siempre, plano a plano, siguiendo con lo
de dentro (`recortarPorElMarco`, en `src/atlas/recorte.ts`). Al final lo de
dentro queda seleccionado y lo de fuera, un trozo por plano cruzado, queda
suelto. La caja envolvente decide por adelantado qué cruza y la geometría decide
de verdad. Es el árbol de cortes de D-137 sin nada nuevo en el formato: solo
cortes encadenados. Por eso los topes subieron: 200 cortes por preparación y 9
encadenados (cuatro por marco, y sitio para un segundo marco o un corte a mano).
Herramienta «Recortar», tecla J. El «Marco» de D-126 sigue igual, por el centro
y sin cortar.

*Consecuencias buenas.* Aislar una franja de una pierna con todo lo que la
cruza es un solo gesto, y lo que sale son piezas de verdad, con tapa. Se
comprobó en un navegador: un marco por la mitad de la pierna hizo 8 cortes, la
franja quedó seleccionada, se movió, se guardó y se reabrió igual. *Malas.* Cada
corte se rehace en el navegador del residente al abrir la ficha: doscientos son
unos segundos. Un marco sobre el cuerpo entero puede gastar decenas de cortes
de una vez; si pasa del tope, se rechaza entero y se dice. Los trozos de fuera
quedan sueltos y sin seleccionar: soldar deshace el corte más reciente de cada
uno, así que deshacer un marco entero son varias soldaduras, o Ctrl + Z.
*Después:* D-141 cambia cómo parte —un corte por pieza, dos trozos— y hace que
cada trozo se encienda y se apague por su cuenta.

### D-141 · 2026-09-26 · vigente
**«Recortar» corta como un cuchillo: cada malla que cruza el marco queda en dos
piezas, «_1» y «_2», y cada una se enciende y se apaga por su cuenta.**
El dueño, sobre D-140: «la selecciona bien y todo pero debería cortar como si
fuera un cuchillo; si hay una malla y lo corto deberían quedar dos mallas (y
renombrarlas como _1 y _2 para que si apago el resto no se apaguen las partes
independientes)… la idea es que quede seleccionado y luego poder desprenderla
del cuerpo». Eran dos problemas. El primero, que lo encendido iba por pieza del
atlas: tras recortar las rodillas, «Solo esto» o apagar lo de fuera apagaba la
pieza entera, con su trozo de dentro. El segundo, que el marco partía plano a
plano y dejaba suelto cada trozo de fuera: un músculo que cruzaba una esquina
salía en tres.

*Cómo.* Un corte puede tener varios planos: `CorteDePieza.otrosPlanos` guarda
los demás lados del marco, y `partirPorVariosPlanos` (`src/lib/osteotomia.ts`)
aplica uno detrás de otro sobre lo que va quedando dentro y junta lo de fuera
en una sola malla. `a` es lo de dentro de todos y `b` todo lo demás. Solo se
guardan los planos que de verdad cortan: la caja decide por adelantado y la
geometría de verdad. `recortarPorElMarco` pasa a un corte por pieza. Y
`ContenidoDeInstancia.apagados` lleva los trozos apagados de piezas
encendidas: apagar un trozo ya no apaga su pieza, «Solo esto» deja solo los
trozos elegidos, y una pieza con todos sus trozos apagados se apaga entera
(`ordenarLoEncendido`) para que encenderla en el árbol la devuelva completa. En
pantalla los trozos se llaman como su camino de cortes —`#a` es «_1», `#b` es
«_2», `#b#a` es «_2_1»—, en el árbol cuelgan de su pieza con su propia casilla,
y al pasar el ratón se leen así. Tras recortar, un aviso dice cuántas piezas se
partieron y cómo quedarse con lo de dentro o desprenderlo (G). «Encuadrar» y
«Centrar» miden los trozos por lo que miden ellos y no por su hueso entero: con
las rodillas aisladas, encuadraban las dos piernas y las rodillas salían
pequeñas, en el taller y en la ficha.

*De paso:* las dos columnas de herramientas que flotan a la izquierda del lienzo
se montaban: la segunda tenía un `top` escrito a mano para tres botones en la
primera, y «Recortar» le puso el cuarto. Ahora van dentro de una caja que las
apila (`.atlas-flota-columna`).

*Compatibilidad.* Todo es opcional en el formato: una preparación anterior se
lee igual —sin `otrosPlanos` un corte es de un plano, sin `apagados` se ve todo
lo de sus piezas— y las ya recortadas con D-140 conservan sus cortes
encadenados. El servidor valida los planos nuevos como el primero, y uno malo
tumba el corte entero: con un lado de menos se partiría otra cosa.
«Exportar como modelo» solo ofrece «Usar el corte del taller» para cortes de un
plano: el simulador parte por uno.

*Consecuencias buenas.* Comprobado en un navegador con el atlas entero: un marco
sobre las dos rodillas partió 78 mallas en un segundo, «Solo esto» dejó las
rodillas cortadas a cuchillo, el árbol enseñó «Fémur derecho_1» encendido y
«_2» apagado, G las desprendió del cuerpo, y la preparación se guardó, se
reabrió igual y la ficha, vista como residente, enseñó solo las rodillas. Un
recorte gasta ahora un corte por pieza en vez de hasta cuatro. *Malas.* Lo de
fuera de una esquina es la unión de dos trozos cerrados, con sus dos tapas
enfrentadas dentro: no se ven, salvo con los rayos X. El pivote automático
sigue midiendo por pieza del catálogo (D-129): solo «Encuadrar» y «Centrar»
cuentan los trozos.

### D-142 · 2026-09-26 · vigente
**Revisión del contenido que llega hecho: versión original, tiempo de revisión
activa, «Listo para publicar» y la pantalla «Auditoría».**
El contenido va a llegar en bloque, redactado por un modelo de lenguaje a partir
de los libros del dueño, y lo van a revisar traumatólogos con cuenta de editor.
El dueño pidió poder saber qué porcentaje de cada ficha se editó, cuánto tiempo
pasa cada revisor antes de pulsar «Listo para publicar» —«no quiero que validen
por validar»—, y una pestaña en «Seguimiento» con gráficos y una planilla de
Excel para filtrar. En resumen, «controlar a los traumatólogos y que revisen de
verdad el contenido».

*El modelo.* Dos colecciones nuevas, solo de administrador por REST:
`revisiones`, una fila por ficha en revisión —origen, libro, capítulo, páginas,
lote, modelo, estado, asignada a, la **versión original** depurada con el
esquema del panel, la medida de edición y la foto de la validación— con su
historial; y `sesiones-de-revision`, el tiempo de cada revisor con cada ficha.
Una ficha entra en revisión por la ingesta —`registrarParaRevision`, que usará el
guion de carga de los libros— o porque un administrador la envía desde el
editor. Lo escrito a mano antes no tiene fila y se publica como siempre.

*Lo que se mide.* Cuánto se editó (`src/lib/revision.ts`): palabras por sección,
lo que no es texto —una opción, una relación, un número— cuenta como una
palabra, y la diferencia es la subsecuencia común más larga (Myers, con el
principio y el final comunes apartados). El porcentaje es lo quitado o lo
nuevo, el mayor de los dos, sobre el largo mayor: reescribir una de cada diez
palabras es un 10 %, borrar una décima parte también. El tiempo: el editor
cuenta cada segundo con la pestaña a la vista (abierto) y, de esos, los que
tuvieron una tecla, un clic, la rueda o el ratón en los últimos noventa segundos
(activo), repartidos por la pestaña que se tenía delante; lo manda cada quince
segundos y al ocultarse, y el servidor lo recorta al tiempo que de verdad pasó
desde el latido anterior. Una sección cuenta como revisada con cinco segundos
activos delante, y lleva ✓ en su pestaña.

*El flujo.* En una ficha en revisión el editor no ve «Publicar» sino «Listo para
publicar»: guarda lo pendiente, manda el tiempo y pide la validación. Si
parece hecha sin leer —menos de treinta segundos activos, más de 250 palabras
por minuto, o alguna sección con contenido sin abrir (`evaluarValidacion`)—, no
se escribe nada hasta que confirme; confirmada, se marca igual y queda
señalada. No se prohíbe: se puede haber cotejado en papel. La publica el
administrador, desde la ficha o en bloque desde «Auditoría»; si publica lo que
nadie validó, queda anotado. Guardar después de validar la devuelve a «en
revisión». El administrador puede devolverla con un motivo, asignarla y
sacarla de revisión. Un editor que intenta publicar una ficha en revisión por
el listado o a mano recibe un rechazo en palabras.

*Las pantallas.* «Por revisar» (Trabajo): la cola de quien entra, lo devuelto
primero, con cuánto lleva dedicado a cada ficha. «Auditoría» (Seguimiento, solo
administrador): filtros por módulo, lote, revisor y estado; seis indicadores;
estado por módulo, validaciones por semana, cuánto se edita, minutos y ritmo
por revisor; la tabla de revisores y la de fichas, ordenable, con asignar y
publicar en bloque; y la planilla (D-143). En el listado de cada módulo, una
columna y un filtro de revisión. En el resumen, una tarjeta.

*Consecuencias buenas.* Una validación de 3.000 palabras en un minuto sale en
rojo con su porqué, y el revisor lo sabe antes de marcarla; el tiempo de una
pestaña olvidada no cuenta. Se probó con el ciclo entero contra una base de
verdad y en un navegador: la revisora recorrió las siete pestañas, editó una,
la validó sin aviso, y la auditoría la contó. *Malas.* El tiempo activo mide
presencia, no lectura: alguien que mueve el ratón sin leer suma tiempo, y por
eso el ritmo y las secciones sin abrir van al lado. Lo medido de los últimos
segundos antes de cerrar la pestaña puede perderse. Los umbrales —250 palabras
por minuto, treinta segundos, noventa de inactividad, cinco por sección— son un
criterio razonable y no un estándar; están juntos en `src/lib/revision.ts` para
ajustarlos cuando haya datos. Y el revisor ve que se le mide, a propósito: lo
dice el recuadro de revisión de cada ficha.

### D-143 · 2026-09-26 · vigente
**La planilla de Excel se escribe a mano, sin dependencias: un `.xlsx` con cada
hoja como tabla filtrable.**
Pedida «tipo tabla para poder filtrar». Un CSV no lo es: Excel lo abre sin
filtros, con las tildes según la configuración regional y las fechas como
texto. `src/lib/planilla.ts` escribe Office Open XML —el ZIP de
`src/lib/zip.ts`, con `deflateRawSync` y un CRC-32 propio— con una tabla de
Excel por hoja (`TableStyleMedium2`, filtros en la cabecera, filas alternas),
la primera fila fija, las fechas como fechas en hora de Santiago, los números
como números y los textos en la tabla de cadenas compartidas, que es lo que
escribe el propio Excel. Cinco hojas: contenidos, revisores, sesiones,
secciones e historial (`src/lib/planillaDeAuditoria.ts`), de la misma cuenta
que la pantalla. Se descarga de `/api/auditoria/planilla`, solo administrador.

*Por qué no una biblioteca.* La más conocida pesa megas, trae lectura, fórmulas y
gráficos que aquí no se usan, y su versión de npm lleva años sin parches; las
demás, parecido. Lo necesario cabe en doscientas líneas probadas. *Malas.* Si
algún día hace falta algo más —colores por celda, fórmulas, varias tablas por
hoja—, hay que escribirlo. Se comprobó con openpyxl, igual de estricto con las
tablas, y no con un Excel de verdad: si Excel se queja de algo al abrirla, es
aquí.

---

### D-144 · 2026-09-30 · vigente
**Las fichas de los libros entran por un importador, como borradores en revisión, con sus figuras.**
`scripts/importar-ingesta.ts` lee `data_traumahub/listos/fichas/<módulo>/<clave>.json`
(formato `traumahub/ingesta-1`, `src/ingesta/formato.ts`) y por cada una: la
convierte con `src/ingesta/convertir.ts` (recorre el esquema del panel; Markdown
→ Lexical, `{ bloque }` → `blockType`, segmento por nombre → identificador),
sube sus imágenes, la crea como **borrador** y la mete en revisión con su libro,
capítulo, páginas, lote, modelo, archivo fuente y las notas del modelo
(`registrarParaRevision`). Sin `--ejecutar` solo comprueba. Es reanudable
(`listos/control/importadas.jsonl`), y si una ficha falla a medias deshace lo que
creó.
*Las imágenes:* las extrajo `_trabajo/extraer_imagenes.py` a
`listos/imagenes-por-tema/<módulo>/<clave>/` sin saber a qué párrafo pertenecen.
Cada una se valida (existe, PNG o JPEG legible, menos de 50 MB), se sube a
`medios` con un `alt` provisional y entra como bloque `imagen` **al final de una
pestaña** (`definicion` en patologías, `contenido` en los otros tres) con el pie
«AÑADIR MANUALMENTE», que es lo que pidió el dueño: el revisor las coloca y las
describe. Nada más del JSON se toca.
*Segmentos:* crea solo los que se nombran en `--crear-segmentos`; cualquier otro
que falte en un catálogo detiene todo antes de escribir.
*Esquema:* `revisiones` gana `archivo_fuente` y `notas_para_el_revisor`
(migración `20260930_211204`). Las notas se enseñan en la barra lateral del panel
cada vez que se abre una ficha en revisión (`NotasDelRevisorEnLaBarra`, con la
acción `notasDeLaFicha`): arriba del todo, con el libro, las páginas y el archivo
fuente. La barra pasó a ser fija y con su propio desplazamiento para que se vean
sin bajar la página; en pantallas estrechas sigue siendo la fila superior.
*Despliegue:* 2026-09-30, 2.672 fichas y 3.298 imágenes en producción. Las
imágenes se escriben en `medios/` del servidor, pero la aplicación las sirve del
volumen `traumahub_medios`: hubo que copiarlas con `docker cp` al contenedor y
borrar las del host. **Una importación futura tiene que repetir esa copia.**
*GitHub:* viajan las fichas, el control y los guiones de `_trabajo`; no los libros,
los PDF ni las figuras (`data_traumahub/.gitignore`).
*Consecuencias:* (+) 2.672 fichas y 3.298 imágenes entran en ~1 minuto, y cada
ficha queda con su original para medir cuánto la edita quien revisa. (−) Los
bloques `imagen` entran contados en la versión original; corregir el pie de
«AÑADIR MANUALMENTE» cuenta como edición. (−) Las cirugías no se importan: no hay
ninguna y dependen del modelo 3D.
*Ensayo:* contra un PostgreSQL desechable (55432) con las 2.672 fichas y las
3.298 imágenes: 0 fallos, segunda pasada sin cambios. El ensayo escribe los
archivos en `medios/`, así que hay que vaciarla después.

### D-145 · 2026-09-30 · vigente
**Registro de lo que hace cada cuenta, con sus permisos de entonces y su tiempo de actividad.**
Dos colecciones, una migración (`20260930_211905`): `registro-de-acciones` (una
fila por acto, con foto de nombre, correo, rol y módulos de ese momento, y el
antes y el después en los cambios de permisos) y `tiempo-activo` (una fila por
cuenta y día). Los ganchos se añaden a **todas** las colecciones en
`src/collections/index.ts` (`conRegistro`), salvo las de `COLECCIONES_SIN_REGISTRO`
con su porqué; así una colección nueva queda anotada sin que nadie se acuerde.
Quién actuó sale de `req.user` o, si falta, de la cookie de la petición en curso
(la cuenta **real**, no la del «ver como residente»); fuera de Next, «sistema».
El inicio y el cierre de sesión se anotan en `afterLogin` y en `salir`.
*Tiempo de actividad:* `LatidoDeActividad` manda un latido por minuto mientras la
pestaña se ve y hubo un gesto en los últimos 90 s; el servidor abona lo que de
verdad pasó desde el anterior, con techo de 75 s, y un hueco de más de dos
minutos no abona nada. Medirlo con las acciones no servía: leer una hora no crea
nada.
*Dónde se ve:* `/admin-panel/registro` (solo administrador): totales del día,
cuentas con permisos y tiempo de hoy, 7 y 30 días, tabla de qué puede hacer cada
rol (sale de `reglas.ts`, `src/lib/permisos.ts`), registro filtrable y planilla
de Excel con cuatro hojas.
*Consecuencias:* (+) todo cambio de rol o de módulos queda con fecha y autor.
(−) Las filas del registro no se purgan. (−) `accion` es texto validado en código,
no un `select`, para no exigir migración por cada acción nueva. (−) Las
escrituras de `revisiones` y `sesiones-de-revision` no se anotan aquí: su historial
y su tiempo están en Auditoría. (−) La integridad del registro depende de que la
REST de Payload siga cerrada (D-073).

### D-146 · 2026-10-02 · vigente
**El instrumento que falta se propone desde el paso y llega como comentario.**
Cada paso de una cirugía tiene un campo nuevo, `instrumentoPropuesto` (migración
`20261002_144044`), con la etiqueta «¿No está en la lista? Escriba su nombre».
Al guardar, `avisarDeInstrumentosPropuestos` (`src/collections/hooks/instrumentosPropuestos.ts`)
crea un comentario pendiente sobre la cirugía con el nombre, el número y el
título del paso, y a nombre de quien guardó. Si el nombre ya está en el
catálogo, ignorando mayúsculas y espacios, el comentario lo dice para que el
editor lo elija.
*Por qué así:* el catálogo de instrumental lo sigue llevando la administración
(icono, modelo, sin duplicados escritos de tres maneras), y el editor que no
encontraba su instrumento dejaba el paso vacío o elegía el más parecido sin que
nadie se enterara. Va por comentario y no por un aviso propio porque los
comentarios ya tienen bandeja, contador de pendientes, correo a los
administradores y «resuelto».
*Consecuencias:* (+) cada propuesta avisa una sola vez: se compara con el mismo
paso de la versión anterior y, además, con los comentarios pendientes de la
ficha, así que guardar borradores no repite el aviso. (−) Al crear el
instrumento, el administrador tiene que elegirlo en el paso y borrar la
propuesta a mano; no se limpia sola. (−) Nada impide publicar un paso que solo
tiene la propuesta: en la consola quedaría sin instrumento correcto. Hasta que
se resuelva, el caso debería quedarse en borrador.

### D-147 · 2026-10-05 · vigente
**Un sistema de diseño detrás de la paleta: tokens, Inter, iconos y color por módulo.**
La auditoría visual del 2026-10-05 midió lo que se veía a ojo: la paleta era buena
y estaba documentada, pero no había nada detrás. Treinta tamaños de letra y
cuarenta y cinco espaciados distintos en cada hoja, catorce radios, cinco
sombras, unas veinte variantes de botón en el sitio y doce en el panel, quince
clases de insignia para cinco significados, y un `--verde` que no existía
(`var(--verde, #1f7a4d)` escrito once veces con su reserva).
*Qué se hizo.* El `:root` de `estilos.css` gana las escalas (`--e-*` de 4 en 4 px,
`--t-*` sin bajar de 11 px, radios 6/8/12/16, `--sombra-1/2/3`, duraciones, capas,
tres puntos de corte 640/900/1200), los colores que faltaban (`--verde`,
`--ambar-texto`, `--superficie-2`, `--sobre-tinta-1/2/3`, `--lienzo-3d`,
`--linea-fuerte`) y un color por módulo (`--mod-1…5`). La fuente pasa de la pila
del sistema a **Inter variable servida por la propia plataforma**
(`@fontsource-variable/inter`), con cifras tabulares. Los iconos, de los
caracteres sueltos (✓ ⚑ → ▾ ✕) y de SVG dibujados a mano a **`lucide-react`**.
`src/app/(frontend)/ui.css` es la hoja de lo común al sitio y al panel, y
`src/components/ui/` los componentes: `Modal`, `useConfirmar`, `useAvisos`,
`Vacio`, `Esqueleto`, `SeccionPlegable`, `MenuAcciones` y `modulos.ts`.
*Color por módulo.* Cada módulo tiene su color e icono (biblioteca azul, examen
físico verde azulado, técnica AO violeta, simulador naranja tostado, imágenes
azul petróleo) y la pieza que pertenece a uno lleva `mod-N` y hereda `--acento`:
tarjetas, migas, insignias, «Continúa leyendo». Sobre el marino de la barra los
colores no llegan a contraste, así que ahí solo se usa el icono.
*Consecuencias buenas.* Un cambio de aspecto se hace en un sitio. Los bordes de
campo pasan a 3:1 (antes 1,34:1), el foco de la portada pública se ve, y el
texto de lectura sube de 15 a 17 px. *Malas.* Se reescribieron las hojas
enteras y 60 archivos, así que el diff es enorme y varias pruebas que leen el
CSS tuvieron que reescribirse (conservando lo que vigilan). `.acceso-boton`,
`.boton.secundario/.sutil/.grande` dejaron de existir: lo que los use fuera de
este repositorio sale sin estilo. Inter son unos 100 KB más en la primera
carga. «Publicada» pasa de violeta a gris en las insignias del panel para que
coincida con el gráfico, un neutro que el validador de paletas marcó por poco
croma; lleva siempre etiqueta de texto.

### D-148 · 2026-10-05 · vigente
**Piezas comunes en lugar de `confirm()`, avisos en la página y listas largas fijas.**
El panel preguntaba con el `confirm()` del navegador en veintiún sitios —incluido
restaurar un respaldo, la acción más peligrosa de la plataforma—, avisaba del
resultado en un recuadro arriba del todo que no se veía al bajar, no tenía
ninguna pantalla de carga (ningún `loading.tsx`) y apilaba listas de más de cien
filas una debajo de otra.
*Qué se hizo.* `useConfirmar()` se espera igual que se esperaba `confirm()`,
pero el botón dice lo que hace («Eliminar ficha») y va en rojo si destruye;
para restaurar un respaldo hay que escribir `RESTAURAR`. `useAvisos()` da
avisos flotantes (los de error se quedan hasta cerrarlos). `SeccionPlegable`
—un `<details>` que recuerda en `localStorage` cómo se dejó— envuelve las listas
largas de Auditoría, Actividad, Registro, Estadísticas, Usuarios, Resumen,
Contenido, Difusión, Respaldos y Sistema, con «Plegar todo / Desplegar todo».
`MenuAcciones` («⋯») recoge las acciones secundarias de cada fila de Documentos
y Usuarios. Hay `loading.tsx` con esqueletos en todas las rutas del panel y del
sitio, y `Vacio` con icono y acción en vez de los emoji ocultos. La barra
lateral del panel pasa a cajón con botón «Menú» por debajo de 900 px, y cada
enlace lleva `aria-label` (doce se quedaban sin nombre con solo los iconos).
Un mapa único estado→tono (`src/lib/tonosDeEstado.ts`) hace que «Publicada» y
«Devuelta» tengan el mismo color en la insignia y en el gráfico.
*Consecuencias buenas.* Nada destructivo se confirma con una caja gris. La
tabla de fichas de Auditoría pasó de 32.000 px de alto a una página que se pliega.
*Malas.* `GuardiaDeAtras` se queda con el `confirm()` nativo: necesita un
booleano síncrono dentro de `currententrychange`, y con una promesa el router de
Next ya habría procesado el `popstate`. La navegación hacia atrás pregunta como
antes. En móvil el menú del panel cuesta un clic más. El taller anatómico solo
recibió los tokens y sus dos confirmaciones, no un rediseño.

### D-149 · 2026-10-05 · vigente
**La consola quirúrgica pasa a tema oscuro, con su propia hoja.**
La consola parecía un formulario: una caja blanca con franjas azules, sin
jerarquía entre el puntaje, los pasos y las medidas. Además tenía dos defectos
visibles: los avisos de «caso sin modelo» y «sin pasos» usaban clases
`admin-aviso` que solo existen en el panel (salían como texto suelto), y las
líneas del registro llevaban la clase `aviso`, que choca con la nota al pie
global (40 px de margen y un filete por línea).
*Qué se hizo.* Hoja propia `src/app/(frontend)/simulador/consola.css`, oscura,
con puntaje de 40 px, pasos como stepper con estados (actual, resuelto,
complicación; sin `opacity`, que dejaba los resueltos a 2,9:1), medidas como
tarjetas con tope y estado, capas como interruptores, modos como control
segmentado con el que pide el paso señalado, el rango útil de fuerza pintado en
la pista, y una tarjeta de caso terminado. En móvil el lienzo va primero y una
barra inferior pegada lleva la instrucción, la fuerza y «Aplicar paso». El
motor (`src/lib/simulador.ts`) y sus mensajes no cambian.
*Táctil.* El lienzo fijaba `touch-action: none` y atrapaba el dedo: no se podía
bajar la página tocando el modelo. Ahora `gestoTactil(modo)` deja `pan-y` al
orbitar y `none` al trazar, mover o señalar.
*Consecuencias buenas.* El modelo destaca y el progreso se ve sin bajar.
*Malas.* La consola mezcla dos temas (el pie con la descripción y la
retroalimentación se queda claro). Orbitar arrastrando en vertical desplaza la
página en vez de girar en ese eje. `.consola { overflow: clip }` para que el
`sticky` funcione: la consola no admite hijos con desplazamiento propio. El
gesto táctil real no se probó en un dispositivo, solo por código y medición.

### D-150 · 2026-10-05 · vigente
**Guardado automático: copia local siempre, y en el servidor solo cuando es seguro.**
Pedido: «que se vayan guardando cada x tiempo por si a alguien se le va el
internet no tenga que empezar desde cero». Guardar solo en el servidor no
resuelve el caso que se quiere resolver —si se corta internet, el guardado
también falla—, y además cada guardado en el servidor mide cuánto se editó la
ficha (D-142), así que no es gratis.
*Copia local.* Mientras haya cambios sin guardar, el formulario se copia en el
navegador (`localStorage`, con `try`) cada 5 s y al ocultar la pestaña. La clave
lleva persona, colección e id, y la copia la marca del servidor sobre la que se
editó. Al volver a abrir la ficha, una banda ofrece «Recuperarlos» o
«Descartar»; recuperar no guarda nada solo, y si otra persona guardó después se
dice, y el guardado siguiente pasa por la detección de choque de siempre. Sin
conexión (`offline` o un fallo de red al guardar) la barra lo dice y avisa al
volver. Caduca a los 14 días.
*En el servidor.* Cada 60 s con cambios, solo si es **borrador**, hay conexión,
no hay choque ni guardado en curso, y la revisión no está en «lista» ni en
«publicada». Nunca sobre una ficha publicada: guardar un borrador sobre una
publicada cambia lo que habría que publicar, y guardar una «lista» la devuelve a
«en revisión». Esas solo tienen copia local, y la barra lo dice.
*Consecuencia que hay que conocer.* Un autoguardado de borrador es un guardado
real: manda `seguimiento.sesion`, recalcula el porcentaje editado y pasa una
ficha «pendiente» o «devuelta» a «en revisión», igual que «Guardar borrador».
La lógica pura vive en `src/lib/guardadoAutomatico.ts`, con pruebas.
*Malas.* En ventana privada o con el almacén bloqueado no hay copia local (la
barra lo dice). La copia local está en el navegador de quien escribe: si cambia
de equipo, no la tiene.

### D-151 · 2026-10-05 · vigente
**Aviso de «hay otro editor en esta ficha», en memoria del proceso.**
Pedido: que cuando alguien está modificando una ficha aparezca para los demás
que la tienen abierta, solo como aviso. No bloquea: dos personas pueden seguir
editando, y el segundo guardado sigue topándose con el aviso de choque de
siempre; esto avisa antes de que ocurra.
*Cómo.* `POST /api/presencia` es el latido (cada 15 s con la pestaña visible, 60
s si está oculta) y la salida (`fetch` con `keepalive` en `pagehide`); responde
con las **otras** personas presentes. La banda sale en el editor con el nombre
(«Elena Editora también tiene abierta esta ficha, desde hace 19 s») y sus
iniciales en la barra fija. Guardia: origen propio, sesión activa, rol *real*
editor o administrador (no el de «ver como residente») y permiso sobre ese
módulo. La misma persona con dos pestañas no se ve como «otro»: se le dice que
tiene la ficha abierta en otra pestaña, que también provoca choques; la id de
pestaña es un UUID por montaje, porque `sessionStorage` lo copia «Duplicar
pestaña». La hora la pone el servidor. `GET /api/presencia?coleccion=x` queda
listo para mostrar quién está en qué ficha desde el listado, y no se usa aún.
*Consecuencia a vigilar.* El almacén es un `Map` en memoria del proceso, con
caducidad de 45 s (150 s con la pestaña oculta) y techo de 5.000 entradas.
Mientras la aplicación corra en un solo contenedor, es exacto; **si algún día
hay varias instancias detrás del proxy**, cada una verá solo a quien le cayó y
la banda dirá la mitad: hará falta un almacén compartido. Un reinicio la borra y
se rehace en el siguiente latido. No cambia el esquema ni hay migración.

### D-152 · 2026-10-05 · parcialmente superada por D-153
**El taller anatómico abre en «Cuerpo», guarda solo y lista lo que está en pantalla.**
Tres pedidos del dueño sobre el taller: que abra con «Cuerpo» como base de la que
salen las demás preparaciones y que editarlo pida un nombre y guarde una *copia*
(«para que cuerpo me sirva para la próxima»); que se guarde cada cinco segundos
para que el aviso de «cambios sin guardar» desaparezca; y que el árbol deje de
encender los músculos de todo el cuerpo cuando, quedándose con la mano, se apaga
un músculo y se pulsa el grupo.
*La causa del árbol.* Cada casilla de grupo («Músculos») actuaba sobre todas las
piezas del atlas de ese grupo, no sobre las encendidas: con la mano sola, el grupo
estaba «a medias» respecto del catálogo entero y pulsarlo lo completaba. Ahora la
lista es el catálogo reducido a lo encendido (`src/atlas/enPantalla.ts`), y un
grupo no tiene nada fuera de pantalla que encender; su casilla solo puede apagar.
Comprobado en el navegador con la pierna sola (124 piezas): apagar un músculo deja
123, pulsar «Músculos» apaga los 47 restantes (76 en pantalla) y nunca sube a 2.230.
*Qué es «Cuerpo».* No es una fila de la base de datos: es el atlas entero
encendido y sin nombre, y por eso no se puede pisar —guardar sin preparación
abierta crea una nueva—. Se está «sobre la base» mientras no haya preparación,
modelo ni nombre. Al modificarlo sale un recuadro con un campo de nombre; sin
nombre no se guarda nada. «Cuerpo» es además la primera entrada fija de
«Preparaciones guardadas», sin «Duplicar» ni «Eliminar».
*El guardado automático.* Cada 5 s se mira si toca (`src/lib/autoguardadoDelTaller.ts`,
con pruebas) y se guarda por el mismo camino que el botón, sin su aviso de éxito;
un fallo se avisa una sola vez, y la lista de preparaciones solo se refresca
cuando nace la copia o cambia el nombre. Una copia nueva se crea solo cuando se le
hizo algo al cuerpo, no por teclear un nombre sobre el cuerpo intacto. El
recuadro de «cambios sin guardar» ya no sale con nombre (la cabecera dice
«guardando…» y luego «guardado a las HH:MM»): solo se queda para lo que hay que
pedir, el nombre o una pieza encendida.
*Consecuencias buenas.* «Cuerpo» sirve siempre de punto de partida; el trabajo con
nombre no se pierde con una pestaña cerrada o un corte de red; y el árbol ya no
sorprende. *Malas, y la primera es importante.* Una preparación que ya está
insertada en una ficha **publicada** se actualiza en esa ficha cada vez que se
guarda, también solo y a mitad de una edición: el residente puede ver la
preparación a medio hacer. Si hace falta trabajar sin tocar lo publicado, se
duplica primero («Duplicar») y se edita la copia. Lo que se apaga sale de la
lista y se recupera con Ctrl + Z o con «Todo el atlas» (selector nuevo,
«En pantalla» de entrada). El trabajo sin nombre sigue sin guardarse solo: una
pestaña cerrada se lo lleva, con el aviso de siempre.

### D-153 · 2026-10-05 · vigente
**La lista del taller se queda con lo que quedó tras recortar, y se guarda cada veinte segundos.**
Corrige dos cosas de D-152 tras usarlo el dueño. *El intervalo:* cada cinco
segundos era demasiado seguido —cada guardado escribe en la base y, si la
preparación está en una ficha publicada, cambia lo que ve el residente—; pidió
«cada 20 o 30», y se eligió **veinte** (`INTERVALO_DE_AUTOGUARDADO_MS`, en
`src/lib/autoguardadoDelTaller.ts`, un solo sitio). El reloj corre desde que se
abre el taller: un cambio se guarda en la siguiente vuelta, como mucho veinte
segundos después, y con cambios constantes salen como mucho un guardado por
vuelta (medido: dos en 76 s con un cambio cada 3 s). La cabecera dice «cambios
pendientes: se guardan solos» hasta que se guarda; con 5 s el «guardando…» era
cierto y con 20 mentiría.
*La lista.* D-152 la reducía a lo encendido, y eso arreglaba las casillas de grupo
pero sacaba de la lista cada pieza apagada: el músculo de la mano que se apagaba
por error no se podía volver a encender desde el árbol. Lo que se pidió es que la
lista **se quede con lo que queda tras recortar**. Ahora hay un *conjunto de
trabajo* (`src/atlas/loQueQuedo.ts`, estado `universo` en el taller):
  - empieza siendo el atlas entero (`null`) y entonces el selector no se enseña;
  - se **estrecha** al quedarse con algo —el botón «solo» del árbol, Mayús + H
    («Solo esto», que es lo que el aviso de un recorte manda pulsar), «solo» de un
    trozo— y pasa a ser exactamente lo que queda;
  - **apagar no lo toca**: por casilla, por grupo o con Supr/X/H, la pieza sigue
    en la lista, desmarcada, y se reenciende; y una casilla de grupo solo mueve lo
    que hay dentro, así que no enciende el resto del cuerpo (comprobado: con la
    pierna sola, 124 piezas, apagar un músculo y pulsar el grupo vuelve a 124, no
    sube a 2.230);
  - se **ensancha** con lo que se encienda desde «Todo el atlas», y vuelve a ser el
    atlas entero con «Encender todo» y con «Cuerpo»; al abrir una preparación o un
    modelo es sus piezas;
  - viaja en el historial: Ctrl + Z tras un «solo» devuelve la lista de antes.
No se guarda con la preparación ni cuenta para «cambios sin guardar»: es una ayuda
para trabajar. El selector se llama «Lo que quedó / Todo el atlas».
*Consecuencias buenas.* El árbol ya no esconde lo que se apaga y sigue sin
encender lo que no es del trabajo. *Malas.* Quedarse con la mano **borrando lo de
fuera con Supr** en vez de con «solo» o Mayús + H no estrecha la lista: lo de
fuera sigue en ella, apagado, y la casilla de un grupo puede encenderlo (el fallo
de D-152, solo por ese camino). Es lo que menos sorprende —Supr es «apagar»— y el
aviso del recorte ya manda pulsar «Solo esto». Si se quiere, Supr sobre una
selección grande podría estrechar también.

### D-154 · 2026-10-05 · vigente
**Un hueso recortado vuelve solo con lo recortado al apagarlo y volver a encenderlo.**
Lo contó quien usa el taller: «cuando activo el hueso de nuevo se renueva completo
y no solo lo que había recortado». Se recortaba un hueso, se dejaba un trozo, se
apagaba el hueso por su casilla y, al encenderlo, reaparecía la malla original
entera. No daba ningún error.
*La causa.* `ordenarLoEncendido` (D-141) descarta los trozos apagados de toda
pieza que no está encendida, con razón: no hay que arrastrar identificadores de
piezas que no están. Pero con ellos se iba también el recuerdo de lo recortado, y
al encenderla ya no había nada apagado. Reproducido con una tibia derecha partida
por la mitad y su trozo `_2` apagado: tras apagar y encender, los dos trozos
quedaban marcados y se veía la tibia entera.
*El arreglo.* La función sale del taller a `src/atlas/trozosApagados.ts`, para
poder probarla, y `ordenarConMemoria` le suma los trozos apagados de las piezas
que quien llama pidió apagar (`trozosDeLoApagado`). No se retienen los de una pieza
que la regla apaga por tener todos sus trozos apagados, porque esa tiene que volver
completa, ni los de «Encender todo», que pasa un conjunto vacío a propósito. Con
el arreglo, al reencender quedan marcados `[true, false]`; sin él, `[true, true]`.
La preparación guardada no cambia: `guardar()` sigue filtrando los trozos por las
piezas encendidas, así que la memoria vive solo en pantalla.
*Consecuencias buenas.* Apagar y encender es reversible también para lo recortado,
y «solo» sobre otra cosa no olvida lo que se había recortado de lo que sale.
*Malas.* Para volver al hueso entero ya no basta apagarlo y encenderlo: hay que
encender el trozo apagado desde su casilla (_2) o usar «Encender todo». Y el
conjunto `apagados` puede llevar trozos de piezas apagadas mientras se trabaja
(nunca se guardan).

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


### D-155 · 2026-10-07 · vigente · supera D-138 en lo que toca a la piel
**La piel vuelve al atlas; el pelo, las cejas y el vello, no.**
El dueño pidió devolverle la piel a «cuerpo»: «hace un tiempo borré la malla de
piel, quiero ponérsela». Hay dos cosas que se llaman así y las dos estaban sin
piel, por motivos distintos:
  - la preparación guardada **«cuerpo»** (id 1 en producción) tiene 2.233 piezas
    y no nombra `FJ2810`: la piel se le apagó el 2026-09-12, diez días antes de
    D-138;
  - la base **«Cuerpo»** del taller (D-152) es el atlas entero, y el atlas no tiene
    piel desde D-138.

*Qué se hizo.* `scripts/atlas/devolver-piel.mjs`, el inverso de
`quitar-piel.mjs`: lee `FJ2810` con `git show` del commit anterior a D-138
(`48dfed0`) y la añade **al final** del paquete 10, sin intercalarla, para que
las demás piezas no se muevan. El guion comprueba que los bytes que ya estaban
siguen iguales, y aparte se verificó que posiciones, normales e índices de la piel
son idénticos a los del historial. Catálogo con versión nueva
(`bp3d-4.0-cbfc84b3`), 2.231 piezas; el paquete 10 pasa de 2,64 a 3,55 MB sin
comprimir. Es idempotente. Las pruebas que D-138 había cambiado vuelven a como
estaban —se revirtieron sus cambios, que nadie había tocado después—, salvo la del
catálogo, que ahora exige la piel **y** la ausencia del pelo.

*Lo que no se hizo, a propósito.* No se tocó la preparación «cuerpo» en la base:
recuperar la piel en ella es encenderla desde el taller («Todo el atlas» → Piel) y
dejar que se guarde, como cualquier cambio de una preparación. Escribirlo por SQL
habría saltado el autoguardado, el historial y la revisión.

*Consecuencias buenas.* La consola quirúrgica vuelve a tener capa de piel para la
incisión, y el recorte de piel al exportar (D-096) vuelve a trabajar con la de
verdad. *Malas, las mismas que llevaron a D-138:* la piel es una cáscara de 1,72 m
que envuelve todo. Al abrir el taller en «Cuerpo» se ve la piel y no el esqueleto
hasta apagarla o poner rayos X (D-139); y un marco que tome el abdomen se la lleva,
porque su centro está ahí (el marco elige por centros, D-126). Si estorba más de lo
que sirve, `quitar-piel.mjs` la vuelve a quitar en un minuto.

### D-156 · 2026-10-07 · vigente
**Un módulo se puede poner «en mantención»: el residente deja de verlo, el editor no.**
Pedido del dueño (P-001, E1): ocultar o mostrar un módulo desde el panel, sin
tocar los permisos de nadie. Al precisarlo, la respuesta fue: el residente, y
cualquier lector, no ve el módulo; el editor lo ve marcado «En mantención»; el
interruptor es del administrador y hay uno por cada módulo.

*Cómo.* Una colección nueva, `ajustes`, de una sola fila, con el campo
`modulosEnMantencion` (un `select` múltiple de los cinco módulos). No un *global*
de Payload: los globals no entran en la vigilancia de migraciones
(`migraciones.test.ts`), en la matriz de roles ni en el registro de acciones
(D-145), y un interruptor que decide qué ve cada residente es lo último que debe
quedar sin vigilar. Migración `20261006_232958_modulos_en_mantencion` (la tabla,
su enumerado y el `payload_locked_documents_rels`); no toca nada existente.

- **Las reglas** (`src/access/reglas.ts`) siguen siendo puras: `puedeVerModulo` y
  `filtroDeLecturaDeModulo` reciben la lista como tercer argumento, y solo cierra
  al **lector**. `puedeEditarModulo` no la recibe y no cambia: el editor edita
  dentro de la mantención (respuesta a E1-Q3, que era un supuesto; si no se
  quisiera, es una línea en esa función). `cerradoPorMantencion` dice cuál de las
  dos pantallas pintar.
- **De dónde sale la lista.** Para las páginas, `modulosEnMantencion()`
  (`src/lib/modulosEnMantencion.ts`), cacheada por petición con `cache` de React.
  Para Payload, `lecturaDeModulo` y `creacionEnModuloVisible` la leen con
  `leerMantencion` (`src/lib/mantencion.ts`), que no importa la configuración de
  Payload —la configuración importa las colecciones, que importan estos
  adaptadores— y la guardan en `req.context`: una sola consulta por petición. Solo
  se consulta cuando quien pregunta es un lector; para el editor y el
  administrador la regla sigue contestando síncrona. Si la consulta falla, la
  lectura del lector falla con ella: no se abre.
- **Qué ve cada quien.** Lector: sin el módulo en la barra, el menú del
  teléfono, la portada (tira, tarjeta, conteos, «Continúa leyendo», recorridos del
  simulador, los dos accesos fijos a `/biblioteca` y `/tecnica-ao`), ni en los
  avisos de contenido nuevo (`/api/cambios`); una dirección a mano le da la
  pantalla neutra `ModuloNoDisponible` («Este módulo no está disponible en este
  momento»), y no puede comentar ni anotar lecturas en él. Editor y
  administrador: lo ven como siempre, con la marca (`InsigniaMantencion`) en la
  barra, la portada, el listado del módulo, «Contenido» y el Resumen del panel.
  «Ver como residente» lo esconde sin hacer nada más, porque el usuario efectivo
  ya es un lector.
- **El progreso del residente no se borra.** La mantención solo filtra lo que se
  le enseña; las filas de `actividad` siguen ahí, y al devolver el módulo el avance
  reaparece.
- **El interruptor** (`InterruptorDeMantencion`, en «Contenido») es un
  `role="switch"`, solo del administrador, con la acción `cambiarMantencionDeModulo`
  (`exigirAdmin`, con el rol real). Apagarlo pide confirmación; devolverlo, no.
- **El registro de acciones** anota una fila por módulo que entra o sale
  (`mantencion-de-modulo`), desde el gancho de la colección y no desde la acción:
  cualquier otra vía que escriba la fila deja la misma huella.
- **Cambia la matriz de roles.** `ajustes` entra como clase `administracion`: el
  administrador la lee, crea, edita y borra; nadie más. (El plan decía «borrar,
  nadie» y «crear solo si no existe»; se desistió de las dos porque la matriz crea
  y borra filas de prueba de cada colección, y la lectura toma siempre la fila más
  antigua, así que una segunda fila no manda.)

*Pruebas.* `tests/unit/mantencionDeModulos.test.ts` (reglas, lectura de la lista,
adaptadores, registro, colección), `listadosDeModulo` y `fichasDeModulo` exigen
ahora el tercer argumento en cada una de las nueve páginas y las dos pantallas, y
`roles.test.ts` prueba contra la base real que el lector no lee ni comenta el
módulo apartado y que el editor sí lee, escribe y comenta. 180 de integración
verdes contra una base desechable.

*Consecuencias buenas.* Se arregla un módulo a media tanda sin despublicar ni
tocar permisos, y el residente no ve nada a medias. *Malas, y conocidas:*
- **Olvidar el tercer argumento no falla, deja abierto.** Es el defecto de que
  sea opcional; lo cubren las dos pruebas de guardias, pero una página nueva de
  módulo que se escriba sin copiar el patrón queda abierta. La prueba de
  inventario de colecciones no lo ve.
- **No hay aviso al residente** de que un módulo volvió; reaparece sin más.
- **Dos sitios siguen enlazando a módulos apartados:** la pantalla 404 («Ir a la
  biblioteca») y los enlaces que un autor escriba dentro de un texto rico. Los dos
  llevan a «no disponible» y no a una avería, y no se tocaron.
- **Estadísticas y Auditoría no marcan el módulo** (el plan lo pedía): las ve solo
  el administrador, que ve todo, y no aportaban nada que no diga ya el Resumen.

### D-157 · 2026-10-07 · vigente
**El examen físico y la biblioteca se agrupan por región anatómica.**
Pedido de Cristóbal: «dejar separado por segmento anatómico». El dueño pidió lo
más fácil de implementar que deje la página ordenada e intuitiva. Los trece
segmentos puestos en fila no decían dónde acaba el miembro superior.

*Cómo.* Una tabla fija, `src/lib/regiones.ts`, traduce el nombre de cada segmento
a su región —miembro superior (hombro, brazo, codo, antebrazo, muñeca y mano),
miembro inferior (cadera, muslo, rodilla, pierna, tobillo y pie), esqueleto axial
(columna, pelvis y acetábulo), generales (principios generales)— y los ordena de
proximal a distal. Un segmento que no figure va a «Otros», al final: nunca se
pierde una ficha por no estar en la tabla. Se compara sin tildes ni mayúsculas.
`/examen-fisico` pone el nombre de la región como encabezado (h2) con sus
segmentos (h3) y maniobras (h4) debajo, y su índice agrupa los segmentos por
región; la biblioteca, igual. El buscador esconde la región cuando ninguno de sus
segmentos tiene algo que enseñar.

*Por qué una tabla en el código y no un campo.* Un campo en `segmentos` habría
pedido migración, cambio de formulario y rellenar trece filas a mano en cada
servidor, a cambio de nada que la tabla no dé: los segmentos son los que fija la
ingesta y no crecen a diario. **No pide migración.** Si algún día hay que agrupar
a mano, el campo se añade entonces y esta tabla pasa a ser su valor por omisión.

*Lo que cambia, además.* El orden de los segmentos dentro de una región ya sale de
la tabla y no del campo `orden`: **E1.8b** (fijar el `orden` desde el panel) queda
sin objeto. `orden` sigue mandando entre los desconocidos y en el resto de
pantallas. Es solo presentación: los anclajes `#maniobra-<id>` y `#segmento-<id>`
no cambian. `tests/unit/regiones.test.ts` exige región para los trece nombres y
avisa si la ingesta permite un segmento nuevo que la tabla no conoce.

*E1.8c, la partición de las dos maniobras de miembro superior de «Principios
generales»*, no es código: es contenido, y lo aprueba Cristóbal. La propuesta, con
la tabla de qué va dónde y lo que hay que saber antes (D-142, comentarios,
imágenes), está en
`docs/propuestas/PARTICION-DEL-EXAMEN-DEL-MIEMBRO-SUPERIOR.md`. No se aplicó nada.

### D-158 · 2026-10-07 · vigente
**Se comentan las preparaciones del taller, o una pieza concreta de ellas, sin salir del taller.**
Pedido del dueño (P-001, E2): una pestaña de comentarios en el taller anatómico.
Antes, lo que el editor veía en el visor había que contarlo en la bandeja del
panel con palabras, sin poder señalar la pieza.

*Cómo.*
- **Datos.** `comentarios.coleccion` gana el valor `instancias-atlas` y la
  colección un campo `ancla` (json, fijado al crear como el resto de lo que dice de
  qué trata el comentario): `{ pieza, punto?, vista? }`. Migración
  `20261007_060514_comentarios_del_taller`: un `ALTER TYPE … ADD VALUE` y una
  columna. El taller **no** entra en `SLUGS_DE_MODULOS`: eso lo convertiría en una
  entrada de la barra, de la portada y de los permisos de cada cuenta. Vive aparte,
  en `modulos.ts` (`SLUG_DEL_TALLER`, `NOMBRE_DE_DESTINO`,
  `rutaDelPanelParaComentario`).
- **Quién.** Editor y administrador, con el **rol real** (el taller es del panel).
  `creacionDeComentario` decide: para el taller, `puedeEditarContenido`; para un
  módulo, la regla de siempre (`creacionEnModuloVisible`), que no sirve para el
  atlas porque le diría que no a toda cuenta con módulos restringidos. El
  residente no comenta preparaciones: las ve dentro de las fichas y comenta la
  ficha (E2-Q1: en v1, no).
- **Acciones.** `crearComentario` gana un cuarto argumento, el ancla, y una rama
  para el taller; `listarComentariosDe(coleccion, id)` es nueva (`exigirEditor`).
  El ancla se reconstruye campo a campo (`anclaOpcional`) y se rechaza si está mal
  formada, en vez de descartarla en silencio. Una preparación que no existe no
  recibe comentarios. Se mantiene el freno de diez cada diez minutos.
- **Pestañas.** `src/components/ui/Pestanas.tsx`, con el patrón de WAI-ARIA
  (`tablist`, una sola pestaña en el orden del Tab, flechas, Inicio y Fin). El
  panel derecho del taller, que era una columna de once secciones, se parte en
  **Pieza**, **Preparación** y **Comentarios (n)**; no cambia ningún
  comportamiento. E4 añadirá «Fractura».
- **La pestaña** (`PestanaDeComentarios.tsx`): lista con autor, fecha, estado y
  texto; «Comentar» y «Comentar *pieza*»; «Resolver/Reabrir» para el editor,
  «Eliminar» para el administrador. Pulsar uno anclado selecciona su pieza y lleva
  la cámara a su vista.
- **Marcadores en 3D.** Los pendientes con punto salen como rótulos «💬 …» sobre el
  modelo, apagables. Reutilizan el dibujo de los rótulos (D-135) y viajan solo
  hacia el visor: no entran en `marcas`, que es lo que se guarda y lo que ve el
  residente en la ficha.
- **La bandeja** del panel muestra el título de la preparación, el filtro «Taller
  anatómico» y el enlace «Abrir en el taller»
  (`/admin-panel/atlas?preparacion=<id>&comentario=<id>`), que el taller ahora lee:
  abre la preparación, va a la pestaña y señala el comentario. Los identificadores
  se validan como números antes de llegar al navegador. El correo a los
  administradores nombra el destino y lleva el mismo enlace; Estadísticas cuenta
  los del taller.
- **«Cuerpo» no se comenta** (E2.6): no es una fila de la base (D-152). La pestaña
  lo dice y pide guardarla con nombre.

*Una prueba nueva que vigila un hueco viejo.* `migraciones.test.ts` solo miraba
nombres de tablas y de columnas, y añadir una opción a un `select` que ya existe
no cambia ninguna columna: el `push` de desarrollo la hace sola y producción no.
Ahora comprueba que cada opción de un `select` de primer nivel esté en su
`CREATE TYPE … AS ENUM` o en un `ALTER TYPE … ADD VALUE`. Se verificó rompiendo la
migración a propósito: falla. Solo cubre lo de primer nivel; los `select` dentro de
arreglos y bloques llevan nombres compuestos que no reconstruye.

*Pruebas.* `comentariosDelTaller` (regla, destino, ancla, pestañas, el taller),
`crearComentarioDelTaller` (la rama de la acción: quién puede, qué se guarda, qué
se rechaza), `accionesConGuardia` (la lista), y en `roles.test.ts` contra la base
real: comentan el editor y el administrador, también los de módulos restringidos;
no el residente, ni el de baja, ni el anónimo; el ancla no se reescribe. 184 de
integración verdes. Se vio en un navegador con el atlas real: se anotó un
comentario sobre la tibia, salió el marcador y el contador, el enlace de la bandeja
abrió la preparación con la pieza seleccionada y el comentario señalado, y
«Resolver» bajó el contador.

*Consecuencias buenas.* La observación llega con la pieza y la vista delante, y la
bandeja sigue siendo el único sitio donde mirar lo pendiente. *Malas, y conocidas:*
- **El «punto» es el objetivo de la cámara, no un punto del hueso.** Seleccionar
  una pieza no es pinchar sobre ella; el marcador queda cerca de lo comentado, y la
  pieza exacta la dice `pieza`. Si hace falta precisión, el comentario por clic
  sobre la superficie queda para después.
- **Si la pieza comentada se parte o se borra de la preparación**, el comentario
  conserva su ancla y pulsarlo selecciona un identificador que ya no está. No falla,
  pero tampoco señala nada.
- **Las pestañas empujan «Preparación» a un clic de la pieza:** quien trabajaba
  con posición y giro y el nombre a la vista tiene ahora que cambiar de una a otra.
- **La fecha de la bandeja se hidrata con un desajuste de zona horaria** entre el
  servidor y el navegador (visto en desarrollo, ya existía): no es de esta etapa.

### D-159 · 2026-10-07 · vigente
**La piel del atlas se ensanchó, hasta 12 mm, donde lo de dentro la atravesaba.**
Pedido del dueño (P-001, E5): «la malla de piel está más chica que partes del
cuerpo, como músculo o tendones; en esas partes, que se agrande un poco hacia
afuera para que la piel quede por fuera».

*Qué se midió, antes de tocar nada.* La piel de BodyParts3D (`FJ2810`) no es una
lámina: son **dos cáscaras**, la exterior (11.401 vértices, volumen +0,0695 m³) y
una interior, con las caras al revés, a unos 3 mm. Las dos juntas dan la mitad de
los puntos «por fuera» —lo de dentro del cuerpo está por fuera de la cáscara
interior—, y así se contó la primera vez: 1,6 millones de falsos positivos. Contra
la exterior sola, de 1,73 millones de vértices de lo de dentro, 3.521 quedaban por
fuera: las venas safenas, la cintilla iliotibial (el
«tendón» del muslo), el platisma, la oreja, los cartílagos de la nariz, las venas
de los dedos del pie y los vasos testiculares. Es lo que el dueño veía.

*Qué se hizo.* `scripts/atlas/ajustar-piel.mjs` (con su geometría en
`geometriaDePiel.mjs`, que es lo que se prueba): para cada vértice y cada centro de
triángulo de lo de dentro, mide a qué distancia queda de la cáscara exterior y si
está dentro o fuera; donde no le sobran **2 mm**, la piel sube lo que falte. Ese
empuje se reparte entre los vértices vecinos (`relajarEmpuje`) para que quede un
abultamiento y no un pico, y se aplica **a lo largo de la normal**. La cáscara
interior acompaña a la exterior. Tres pasadas dentro de una ejecución, porque
empujar a lo largo de la normal no es empujar hacia el punto. Tope por vértice:
12 mm. Se reescriben **solo las posiciones y las normales de la piel** en su sitio
del paquete 10 —ni un byte más: se comprobó contra el historial—, la caja de la
pieza y la versión del catálogo (`bp3d-4.0-6d4cc0c0`), y la atribución dice que la
piel se modificó (CC BY 4.0 lo exige).

*Tres errores que se cometieron y se corrigieron, para que nadie los repita.*
- **Un rayo para saber si algo está dentro no basta.** La piel es la unión de
  cara, orejas, manos…, que se solapan: un rayo vertical desde el abdomen cruzaba la
  cara cuatro veces y daba «fuera». Pedía empujes de 3 cm. Ahora votan tres rayos,
  uno por eje.
- **La cara más cercana puede mirar de espaldas.** Un punto dentro de un dedo tenía
  más cerca la piel del dedo vecino, y empujar esa cara «para darle holgura» la
  metía en el dedo; cada pasada empeoraba la anterior. Ahora cada punto cuenta solo
  contra las caras que lo tienen por detrás.
- **Los ojos, los labios y las uñas no son «músculo por fuera».** El globo ocular
  asoma porque la piel del atlas no tiene párpados abiertos; subir la piel lo
  taparía. Se apartaron por nombre, una a una: `rectus` suelto también cogía el
  recto del abdomen y `oblique`, el oblicuo externo (se vio al medir).

*Resultado, medido.* De los 7.136 vértices de la cáscara exterior que suben
(de 11.245), 2.240 lo hacen al menos 1 mm, 618 al menos 3, 52 al menos 10, y el
máximo es el tope. Las siete estructuras de arriba quedan con **cero** vértices
por fuera, salvo la oreja: 30 de 894, porque pide 16 mm y el tope es 12.

*Consecuencias buenas.* Con la piel encendida ya no asoma músculo ni vena. La
geometría del resto del atlas no se tocó. `tests/unit/geometriaDePiel.test.ts`
prueba la geometría con una esfera y el atlas real (que esas siete estructuras
sigan dentro, que la caja de la piel sea la de sus vértices y que lleve la marca).

*Malas, y conocidas.*
- **337 puntos siguen sin los 2 mm**: arterias y venas digitales del índice, donde
  la piel está apretada contra la del pulgar. Empujar más las metería en el dedo
  vecino; el guion se detiene y lo dice.
- **La oreja sigue asomando por un par de milímetros** en 30 vértices. Subir el
  tope a 16 mm engordaría los dedos.
- **No es idempotente entre ejecuciones** por lo anterior: la pieza queda marcada
  (`ajustada` en el catálogo) y el guion se niega a repetir sin `--otra-vez`. Para
  rehacerla desde cero, `git show 71192c0:public/atlas/cuerpo-10.bin.gz` es el
  original.
- **Los navegadores vuelven a bajar el paquete 10** (2,2 MB) por la versión nueva.
- Las preparaciones guardadas no cambian: la piel se enciende desde el taller.

### D-160 · 2026-10-07 · vigente
**Se mueve y se angula con el ratón, sin teclado: herramienta «Manipular» (V).**
Pedido del dueño (P-001, E3), con criterio de aceptación: con una tibia partida,
desplazar el fragmento distal 8 mm y angularlo 10° de varo con el ratón, y que lo
que se lea en pantalla sea «8 mm lateral · 10° varo». Antes, pinchar y arrastrar
giraba la cámara; mover pedía G o R, las asas iban con los ejes del mundo y los
fragmentos giraban sobre el centro de su caja.

*Cómo.*
- **La cuenta, sin lienzo** (`src/atlas/manipular.ts`, probada en
  `manipular.test.ts`): el arrastre cruza el rayo del cursor con el plano que pasa
  por el punto pinchado y mira a la cámara, así que **lo pinchado sigue bajo el
  dedo** (con una escala por píxel se adelantaba o se quedaba atrás según la
  profundidad); Mayús ata el movimiento al eje del hueso cuya imagen en pantalla más
  se parece al gesto, sin elegir nunca uno que apunte a la cámara; Alt gira como una
  bola; Ctrl salta de cinco en cinco grados.
- **El visor** (`VisorAtlas.tsx`): la herramienta `manipular`. Pulsar una pieza
  arma una espera de cuatro píxeles —si se suelta antes, es el clic de siempre—; pasado
  el umbral, empieza el mismo gesto modal de G y R, ya con el botón pulsado. Por
  eso un gesto es **un solo paso del historial** y Esc lo cancela. Pulsar una pieza
  no seleccionada la selecciona y la mueve en el mismo gesto.
- **El foco.** Un trozo que nació de un corte de un solo plano guarda el centro de
  su tapa (`foco`, `focoDeLaTapa`) y gira sobre él: angular 10° no lo desplaza. Los
  trozos de un marco (varios planos) siguen girando sobre su centro. El
  manipulador se coloca en el foco.
- **Los ejes del hueso.** El botón «Ejes del hueso» orienta el manipulador con los
  ejes que `ejeDelHueso` mide en la geometría (X fuera, Y proximal, Z el que cierra
  la mano derecha: `ejeDelHueso` orienta «fuera» según el lado y su terna sale de
  mano izquierda en uno), dibuja una caja dorada con ellos y hace que la X, Y y Z
  que se teclean vayan con ellos. **Apagado de entrada**: `G X 8` sigue siendo el
  eje del cuerpo para quien ya lo usa.
- **El aro de la vista**, un séptimo asa, blanco y más grande: gira sobre la línea
  de visión. De frente es el giro de varo y valgo.
- **La lectura clínica** (`lecturaClinica.ts`, sin `three`: el taller no puede traerlo
  de forma estática): del distal respecto del proximal, en los ejes del hueso.
  Desplazamiento entre los focos de los dos trozos; angulación desde adónde apunta
  el eje largo del distal tras el giro relativo; rotación desde la torsión sobre ese
  eje. **Sin ángulos de Euler** (D-133): con 80° de torsión el varo sigue diciendo
  10°. Sale sobre el modelo mientras se mueve —también al teclear— y escrita en la
  pestaña Pieza.
- **Táctil.** Un dedo sobre un trozo seleccionado lo mueve; un segundo dedo lo
  suelta y devuelve la cámara (D-149). *No se ha probado en un aparato real.*

*Verificado en el navegador, con el atlas real:* cortar la tibia, seleccionar el
distal con «Manipular» y arrastrarlo (se leyó «28 mm medial · 11 mm posterior ·
5,8 mm de acortamiento» y «Posición» pasó de cero), Alt + arrastrar
(«4,4° varo · 9,3° recurvatum · 22° de rotación interna» **sin desplazamiento nuevo**:
gira sobre el foco), Mayús + arrastrar (la variación quedó sobre el eje axial),
`G X 8 Intro` con los ejes del hueso («8 mm lateral») y `R` de frente («18° valgo»).
Ctrl + Z deshace cada gesto en un paso. Las pruebas son `manipular`,
`manipularEnElTaller` (manipulador, foco de un corte de verdad con `partirMalla`,
ejes en las cuentas de siempre y el cableado) y las suites de siempre.

*Lo que no se hizo, a propósito.* **La consola quirúrgica** (E3.5, fuera del
alcance por respuesta del dueño). **Teclear números clínicos** («8 mm lateral»)
en el panel: la lectura es de solo lectura; lo tecleado sigue siendo X, Y y Z, que con
los ejes del hueso encendidos ya son laterales, largos y anteroposteriores.

*Consecuencias buenas.* Mover un fragmento y decir cuánto se movió es el mismo
gesto, y la cifra es la que va a la ficha. *Malas, y conocidas:*
- **Los nombres son una decisión clínica que tomé yo** (Q-010): varo y valgo se leen
  por el extremo del fragmento **distal** respecto del proximal; «recurvatum» es el
  distal hacia delante (ápice posterior) y «antecurvatum», hacia atrás (ápice
  anterior); la rotación externa es la de la cara anterior hacia fuera. Cristóbal
  debe confirmarlo antes de que un residente aprenda de ellos.
- **La lectura necesita un hermano.** Un trozo cuyo hueso se volvió a partir, o uno
  de un marco con varios planos, no tiene lectura (se escribe lo de siempre).
- **El eje del hueso es el del hueso entero**, no el de cada trozo: en una
  oblicua larga, «largo» es una aproximación.
- **Con «Manipular» las asas están siempre**, aunque se hayan apagado: sin ellas no
  hay con qué girar.
- **Pulsar una asa gana a pulsar la pieza.** Con el taller en pantalla pequeña el
  manipulador cubre buena parte de un fragmento corto; acercar la cámara lo arregla,
  porque las asas miden siempre lo mismo en pantalla.

### D-161 · 2026-10-07 · vigente
**Un hueso largo se fractura con un asistente, por el código AO: pestaña «Fractura».**
Pedido del dueño (P-001, E4): construir una fractura eligiendo hueso, segmento,
tipo y grupo, como en la aplicación de AO, y que el hueso quede partido en los
fragmentos de ese patrón, manipulables con el ratón (D-160) y con su código a la
vista. La primera versión cubre los huesos largos y la diáfisis completa; lo
demás está dicho abajo.

*Cómo.*
- **La tabla** (`src/atlas/clasificacionAO.ts`, pura): huesos —húmero (1), radio
  (2R), cúbito (2U), fémur (3), tibia (4) y peroné (4F)—, los tres segmentos, los
  tipos A, B y C y los grupos A1 a C3, con una descripción escrita aquí (no copia
  del Compendio). El código sale de ella: `42-A2` es tibia, diáfisis, simple,
  oblicua. En los extremos solo se ofrece lo extraarticular simple (A2 y A3); los
  tipos articulares dependen de cada articulación y son de la segunda versión.
- **Qué pieza es qué hueso** (`huesosAO.ts`): doce identificadores a mano. Una
  prueba comprueba contra el catálogo real que cada uno existe, es un hueso
  (`skeletal`), se llama como dice la tabla y está en el lado que dice (el derecho
  del paciente es x negativa).
- **Los segmentos por la regla del cuadrado de Heim** (`segmentosAO.ts`): sobre el
  eje que ya mide `ejeDelHueso`, el perfil de anchura en 40 tramos; el lado de cada
  extremo es lo más ancho de su tercio, entre el 8 y el 33 % del hueso. Aproximado
  y dicho: la anchura es la del vértice más lejano en cualquier dirección, y en la
  tibia distal AO manda el ancho de los maléolos. Sirve para elegir dónde cae una
  fractura esquemática, no para medir.
- **Los patrones** (`patronesDeFractura.ts`, puro y determinista, sin `three`): una
  receta —hueso, segmento, grupo, `porcion {centro, extension}` en % del hueso,
  inclinación, cara y una semilla— se convierte en cortes encadenados que el visor
  ya sabía partir. A3, un plano de 0–15°; A2, uno de 30–60° por la cara elegida;
  B2, una cuña (dos planos en `otrosPlanos`, que aíslan un fragmento con la
  forma de la mariposa de una radiografía) y un plano por su vértice que separa
  proximal y distal; B3, B2 y un corte que parte la cuña; C2, dos planos
  separados `extension`; C3, C2 y un corte oblicuo del segmento intermedio. La
  semilla solo mueve los detalles de dentro (B3, C3): reabrir da lo mismo.
- **La prueba que importa**: cada patrón, sobre los seis huesos largos reales del
  atlas (y la tibia izquierda), deja el número de fragmentos que dice la tabla, **todos cerrados** y con
  volumen positivo, y **el volumen total se conserva dentro de un 1 %**.
- **Guardar** (`ContenidoDeInstancia.fracturas`, json, sin migración): la receta con
  su código. `normalizarSeleccion` la deja pasar solo si es una receta que
  `normalizarReceta` acepta, de una pieza que está en la preparación **y sigue
  partida**: una receta sin su corte raíz es huérfana —alguien soldó el hueso— y se
  descarta. Una por hueso, doce como mucho; el código se recalcula, lo que llega no
  se cree. Los cortes siguen yendo en `cortes`, donde los espera el visor.
- **El asistente** (`PestanaDeFractura.tsx`, `borradorDeFractura.ts`): seis pasos
  con tarjetas y pictogramas propios. El borrador vive en el taller y no en la
  pestaña —las pestañas solo montan la abierta, y pasar a «Pieza» a mover un
  fragmento lo borraba—. La vista previa es el disco del plano del primer corte, el
  mismo de la exportación (`pintarElCorte`). **«Fracturar» es una sola entrada
  del historial**; deja un rótulo con el código sobre el hueso (que ve el residente)
  y selecciona los fragmentos. «Cambiar la fractura» la quita y reabre el asistente
  con lo que tenía; «Quitar» devuelve el hueso entero.
- **La ficha:** `VisorInstancia` enseña los fragmentos (los cortes ya viajaban) y una
  línea con el código y la descripción de cada fractura.

*Verificado en el navegador, con el atlas real:* los tres casos guía —**42-A2**
en la tibia derecha (2 fragmentos), **32-B2** en el fémur (3: la cuña, el proximal
y el distal) y **12-C2** en el húmero (3)— se construyen desde la pestaña, se
guardan en una preparación, y al recargar la página y abrirla vuelven los tres.

*Lo que no se hizo, y por qué.*
- **A1, la espiroidea:** su superficie no es un plano (riesgo R1). Está en la tabla,
  marcada «Próximamente».
- **`refinarZona`:** los planos cortan una malla pobre igual de limpio; solo hará
  falta con una superficie curva (A1).
- **El filtro del clic** que deja pasar piel y músculo: no está; se elige el hueso
  en la lista o pulsándolo.
- **Alinear el catálogo `clasificaciones-ao`** con la edición de 2018 (añadir B3 y
  C3, marcar B1 y C1 como de 2007): es contenido, no código, y lo valida Cristóbal
  (E4-Q1).
- **Exportar al simulador** una fractura de varios fragmentos: sigue admitiendo un
  solo plano (A2 y A3).
- **El encuadre del bloque de la ficha** sobre la fractura y no sobre el cuerpo.

*Consecuencias buenas.* Una fractura sale en menos de un minuto y se reabre
idéntica; el código AO queda escrito en el modelo. *Malas, y conocidas:*
- **Los patrones son esquemáticos** (R3): enseñan la forma del trazo, no sustituyen
  al atlas de AO. Cristóbal debe validar cada uno antes de que un residente aprenda
  de él (E4-Q1). La **cuña** en particular es una interpretación mía: su vértice
  está a media distancia del eje y su base mide lo que dice «altura».
- **El hueso tiene que estar entero y en su sitio** para fracturarlo: los cortes se
  calculan en el espacio anatómico, y heredar el desplazamiento de un hueso ya
  movido es trabajo que no se hizo. El asistente lo dice.
- **La receta no sigue lo que se haga después con las manos:** si se corta uno de sus
  fragmentos, la receta sigue ahí y reabrirla lo borra.
- **Un fragmento puede salir diminuto** en un hueso delgado (peroné, cúbito): los
  cortes salen cerrados y conservan el volumen en los seis huesos, pero nadie ha
  mirado si el resultado parece una fractura. Lo valida Cristóbal.

### D-162 · 2026-10-07 · vigente
**La piel tiene interruptor en el taller, y el clic y el marco la dejan pasar.**
Pedido del dueño (P-001, E5.1): con la piel de vuelta (D-155) y ensanchada
(D-159), abrir «Cuerpo» enseñaba la piel y nada más, y todo clic o marco la
alcanzaba antes que a lo que había debajo.

*Qué se hizo.*
- **Botón «Piel»** en la barra del taller (`alternarLaPiel`): enciende o apaga la
  pieza `Skin`. La primera vez la enciende **al 30 % de opacidad**, para que la
  anatomía de debajo se siga viendo; si ya tenía una opacidad propia, se respeta.
  Es un cambio de lo encendido como cualquier otro, así que va al historial. Está
  desactivado si el atlas no trae piel (`src/atlas/piel.ts`).
- **El clic.** `impactoBajoElRayo` admite `ignorar`: un conjunto de piezas que el
  rayo atraviesa. Si lo primero que toca es la piel, el visor lo vuelve a lanzar
  sin ella y señala lo de debajo; si debajo no hay nada, se queda con la piel
  —quien pulsa solo la piel, la quiere—.
- **El marco.** Elige por centros (D-126) y el de la piel está en el abdomen: cualquier
  marco sobre el vientre se la llevaba, y el gesto siguiente actuaba sobre el cuerpo
  entero. `sinLaPielSiHayMas` la saca del resultado si hay algo más.
- Es solo del taller (`pielQueDejaPasar`): en la ficha el residente no selecciona.

*Qué no se hizo.* **E5.2**, encenderle la piel a la preparación «cuerpo» (id 1),
es del dueño y se hace desde el taller: «Todo el atlas» → «Piel». **E5.3**,
comprobar en la consola quirúrgica que un caso exportado de nuevo trae su piel
recortada (D-096) y que el paso de la incisión la usa, no se ha mirado: las
pruebas del recorte siguen en verde con la piel ajustada, pero nadie ha abierto la
consola con ella.

*Consecuencias buenas.* El taller abre sin que la piel estorbe y se enciende con un
clic. *Malas:* no hay forma de seleccionar la piel con el clic si hay algo detrás
—se elige en la lista—; y el 30 % es una cifra mía.

### D-163 · 2026-10-07 · vigente
**El módulo 06 se anuncia, y se reúnen sus requisitos en un buzón.**
Pedido del dueño (P-001, E7) a raíz de la nota de voz de Cristóbal: cargar una
tomografía y que la plataforma reconstruya la fractura para planificar la cirugía.
Antes de construirlo, se anuncia y se deja un lugar para decir cómo debería ser.

*Qué se hizo.*
- **Un módulo anunciado no es un módulo.** `MODULOS_ANUNCIADOS`
  (`src/lib/modulosAnunciados.ts`) es una lista aparte de `SLUGS_DE_MODULOS`, que
  manda en los permisos, los enumerados de la base y cinco copias más; un módulo
  sin contenido no tiene nada que proteger. Tiene número 06, ruta y una insignia
  «Próximamente» (ámbar, la de la mantención con otro texto).
- **Dónde se ve.** La portada pública, en la tira de módulos y sin enlace (su página
  es para quien tiene cuenta); la de quien entró, como una sexta tarjeta atenuada, de
  borde discontinuo y **sin conteos ni avance**. En la barra superior, no: se reserva
  para lo que ya se puede usar. Los residentes la ven (E7-Q2: se propuso que sí, y
  nadie dijo lo contrario).
- **La página** `/planificacion`, para toda cuenta activa: lo que va a ser, en seis
  pasos, y lo que no va a ser. El texto lo escribí yo con la nota de voz y el plan: lo
  revisa Cristóbal. El buzón se monta solo para quien edita, y se decide con el usuario
  **efectivo**, de modo que mirar «como un residente» no lo enseña.
- **La colección `requisitos`** (migración `requisitos_del_buzon`, aditiva): título,
  descripción, módulo (de momento solo `planificacion`), autor, estado
  (propuesto, en estudio, aceptado, hecho, descartado), respuesta y votos. La leen y la
  crean editores y administradores; la modifica el administrador y, **mientras esté
  «propuesto», su autor** (`edicionDeRequisito`, un filtro de consulta); la borra el
  administrador. El estado y la respuesta son campos del administrador. El autor, el
  módulo y los votos **no se escriben por la API**: los votos los gestiona la acción
  `votarRequisito`, que los alterna por cuenta —votar dos veces no suma dos— y no
  admite votos en lo cerrado (hecho o descartado).
- **Avisos por correo.** A los administradores, por cada requisito nuevo; a su autor,
  cuando el administrador cambia el estado, con la respuesta. Mismo gancho y mismo
  `enviarSinEsperar` que los comentarios; proponer tiene el freno de diez cada diez
  minutos.
- **El panel:** una tarjeta «Requisitos por atender» en el Resumen del administrador, y
  el registro de acciones (D-145) anota los requisitos como el resto de colecciones.

*Verificado en el navegador:* la portada pública enseña la sexta entrada; un editor
propone un requisito y lo vota (y quita el voto); el administrador lo acepta con una
respuesta; el editor no ve los controles del administrador, y un requisito aceptado ya
no se reescribe. 196 pruebas de integración contra la base desechable, entre ellas la
matriz de roles con la clase nueva `buzon` y siete pruebas propias del buzón: se
propone a su nombre y «propuesto» aunque mande otra cosa, el autor reescribe lo suyo y
otro editor no, el autor no se acepta a sí mismo ni escribe la respuesta, después de
responder ya no se reescribe, los votos no se escriben por la API, el lector no lo ve y
**al dar de baja a su autor el requisito se conserva sin autor**.

*Dos fallos que se encontraron probando, por si vuelven.*
- **Un componente de cliente no puede importar `validacion.ts`**, que arrastra
  `@/collections` y con él Payload: `fs` no se resuelve en el navegador y la página
  entera se queda en «Cargando…». Los límites y los estados viven en `requisitos.ts`
  (sin ningún import) y la validación, en `validacion.ts`. Una prueba lo vigila.
- **Los votos viajan como números.** Con identificadores enteros, Payload rechaza
  `"2"` como valor de una relación y contesta «El siguiente campo es inválido: Votos».

*Lo que no se hizo.* Los **comentarios** de un requisito: el plan decía «se votan, se
comentan»; comentar pide ampliar el enumerado de `comentarios.coleccion` y su bandeja,
y la respuesta del administrador cubre lo esencial. La pregunta de fondo (**Q-009**,
docente o clínica) sigue abierta.

*Consecuencias buenas.* Cristóbal y los demás pueden dejar sus ideas desde ya, y el
P-002 parte de una lista votada y no de una memoria. *Malas:*
- **El texto de la página es mío.** Promete cosas (anonimizar en el navegador,
  conservar poco) que nadie ha decidido construir así; la insignia y «Lo que no va a
  ser» lo dicen, pero conviene que Cristóbal lo lea antes de que lo vea un residente.
- **El buzón no tiene paginación**: lee los 300 más recientes. Un puñado de editores no
  lo llena.
- **El nombre del módulo** («Planificación con imágenes del paciente») es una propuesta
  (E7-Q1).

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
*Después:* volvió a pasar (O-067), y desde entonces `scripts/salud.sh` compara
los dos y falla si difieren.

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

### O-056 · 2026-09-20 · alta · resuelta
**Un SVG subido a `medios` ejecutaba guiones con la sesión de quien lo abriera.**
Revisión de seguridad de todo el repositorio. `medios` admite `image/svg+xml`, y
un SVG es un documento: dentro de un `<img>` no ejecuta nada, pero su dirección
(`/api/medios/file/x.svg`) abierta sola en una pestaña es una página del origen
de la plataforma. Un editor subía un SVG con `<script>`, le pasaba la dirección
a un administrador —en un enlace de una ficha basta— y el guion llamaba a las
acciones del panel como administrador: crear cuentas, descargar respaldos.
*Arreglo:* `cacheDeArchivoPrivado`, por donde pasan las cabeceras de todo archivo
subido, añade `Content-Security-Policy: script-src 'none'; sandbox;
frame-ancestors 'none'` y `nosniff`. Lo vigila
`tests/unit/cabecerasDeArchivos.test.ts`. No se quitó el SVG de la lista: los
esquemas anatómicos son el caso de uso, y con `sandbox` dejan de ser un riesgo.
*Sin comprobar:* esta sesión no pudo instalar dependencias ni ejecutar
`typecheck`, `lint` ni las pruebas; hay que correr la lista de `AGENTS.md` antes
de subir. Vale para O-057 a O-060 también.
*Comprobado después, el mismo día:* la lista entera de `AGENTS.md` pasa con los
cambios de O-056 a O-060 (cómo y contra qué base, en O-062).

### O-057 · 2026-09-20 · media · resuelta
**`pedirEnlaceDeClave`, `entrar` y `crearComentario` no tenían freno de ritmo.**
La primera es pública, manda correo e invalida el testigo anterior: un guion con
la dirección de un residente le llenaba el buzón, le mataba cada enlace antes de
usarlo y quemaba la cuota por hora de cPanel. `entrar` solo tenía el bloqueo por
cuenta de Payload, que no ve a quien prueba una contraseña corriente contra cien
correos. Y cada comentario manda un correo a los administradores, así que una
cuenta de lector en bucle hacía lo mismo desde dentro. *Arreglo:* limitadores de
`src/lib/ritmo.ts` en las tres (por dirección, por correo y global; por dirección;
por cuenta). El de la clave rechaza **mudo**, para que la pantalla siga teniendo
una sola respuesta. De paso, `entrar` y `fijarClaveNueva` acotan el largo de la
contraseña como ya hacía `exigirContrasena`.
*Consecuencia mala:* los contadores viven en memoria y por dirección, y detrás de
Funnel la dirección es `X-Forwarded-For`; un hospital entero sale por una sola.
Los números están puestos con eso en mente, pero si un servicio completo se
queda fuera a las ocho de la mañana, es aquí.

### O-058 · 2026-09-20 · media · resuelta
**El limitador de ritmo podía usarse para agotar la memoria del proceso.**
Su clave es `X-Forwarded-For`, que escribe quien llama: una cabecera larga y
distinta por petición dejaba cada una en memoria una ventana entera, y el barrido
recorría el almacén completo en cada llamada pasado cierto tamaño. *Arreglo:*
la clave se recorta a 64 caracteres y el almacén tiene techo (20.000 claves);
lleno de claves vigentes, rechaza las nuevas en vez de crecer.

### O-059 · 2026-09-20 · media · resuelta
**«Salir» borraba la cookie y dejaba el testigo válido ocho horas.**
Quien hubiera copiado el testigo antes —estación compartida, registro de un
proxy— seguía dentro después de que su dueño saliera. Payload guarda las
sesiones en `usuarios_sessions` y rechaza el testigo cuyo `sid` no esté; su
`logout` solo existe como extremo REST, que está cerrado. *Arreglo:*
`revocarLaSesionActual()` en `acciones/sesion.ts` quita esa sesión de la fila.
*Sin verificar:* el nombre del campo con el que la estrategia JWT expone el `sid`
(`user._sid`) se escribió de memoria, sin `node_modules` delante. Si no es ese,
la función no hace nada —no rompe la salida— y hay que corregir el nombre
mirando `auth/operations/logout.js`. Comprobación: entrar, copiar la cookie,
salir, y pedir una página con la cookie copiada: tiene que redirigir a `/entrar`.
*Verificado:* el campo es ese (`auth/strategies/jwt.js` lo asigna y
`auth/operations/logout.js` filtra por él). La comprobación manual quedó escrita
como `tests/integration/salir.test.ts`: entra dos veces, llama a `salir()` con
una de las cookies y exige que ese testigo deje de abrir sesión y el otro no.
`accionesConGuardia.test.ts` declaraba que `salir` no tocaba Payload y falló al
correr la suite; ahora le permite `auth`, `findByID` y `update`, y nada más.

### O-060 · 2026-09-20 · baja · resuelta
**Tres ajustes menores de la misma revisión.** El `sort` de `listarDocumentos`
se pasaba a Payload tal cual llegaba del navegador, y es un camino de campo que
cruza relaciones: ahora solo valen las columnas del listado. Los volcados que
crea el panel nacen con modo 640 en vez de 644. Y el token del túnel de
Cloudflare viaja en `TUNNEL_TOKEN` y no en `--token`, que se lee con `ps`
(`docker-compose.prod.yml`, sin probar: ese modo no es el desplegado).

### O-061 · 2026-09-20 · media · abierta · no se arregla desde el código
**La plataforma comparte origen con las otras páginas del servidor.**
`/traumahub`, APCE, `/equipo` y `/senales` son el mismo esquema, anfitrión y
puerto. El `path` de la cookie no es una frontera de seguridad: un guion que
corra en cualquiera de las otras tres puede hacer `fetch('/traumahub/…')` con la
sesión del administrador, y la comprobación de `Origin` de Next lo da por bueno
porque el origen es el mismo. Es decir, un XSS en cualquier vecino es un XSS
aquí, y `auto-update.sh` despliega a los vecinos cada 30 minutos sin revisión.
`X-Frame-Options: DENY` (ya puesto) cierra el enmarcado, no esto. La única salida
real es un origen propio —subdominio o puerto—, que enlaza con Q-008.
También quedan sin CSP de `script-src` las páginas propias (exige manejar los
nonces del App Router; ver `next.config.mjs`), y `/api/cambios` no vuelve a
comprobar la sesión mientras el flujo sigue abierto: a una cuenta desactivada se
le siguen contando versiones de publicación hasta que cierre la pestaña.

### O-062 · 2026-09-20 · media · abierta
**Correr la suite en el servidor apunta, por omisión, a la base y al correo de verdad.**
En `ved` el `.env` es el de producción: `DATABASE_URI` es la base que sirve
`traumahub-app` y `SMTP_*` son las credenciales de cPanel. `tests/setup.ts` lo
carga entero, así que las pruebas de integración crean cuentas en la base real
(si el anfitrión `db` resolviera) y mandan correo real. Pasó al cerrar O-056 a
O-060: la primera pasada hizo 60 intentos de «aviso de comentario nuevo» contra
el servidor de correo. Los rechazó todos con 550 —los destinatarios eran
`@prueba.invalid`—, pero cada uno cuenta para la cuota por hora.
*Cómo se corrió al final:* un PostgreSQL desechable
(`docker run --rm --tmpfs … -p 127.0.0.1:55432:5432 postgres:17-alpine`),
`npm run db:migrate` sobre él, y la lista con `DATABASE_URI` apuntando ahí y
`SMTP_HOST=` vacío; `process.loadEnvFile` no pisa lo que ya está definido.
*Pendiente:* que `tests/setup.ts` vacíe `SMTP_HOST` siempre, y decidir si se
niega a correr contra una base que no sea de pruebas.
De la misma pasada: `npm ci` falla porque `package-lock.json` no lleva
`esbuild@0.28.2` ni `yaml@2.9.1`; `npm install`, que es lo que usa el
`Dockerfile`, lo reescribe (unas 850 líneas). Ese cambio quedó en el árbol sin
subir, para que vaya en su propio commit y no mezclado con la revisión.

### O-063 · 2026-09-20 · media · aplicada, verificada y subida el 2026-09-21
**Segunda pasada de seguridad: lo que quedaba a mano después de O-056 a O-062.**
Se releyeron las seis rutas de API, `payload.config.ts`, `Usuarios.ts`, las
guardias, las cabeceras, el `Dockerfile` y los compose. Lo gordo ya estaba
cerrado: la REST de Payload solo sirve archivos, no hay `dangerouslySetInnerHTML`
ni enlace sin `enlaceSeguro`, GraphQL apagado, `unlock` declarado, contenedor sin
root, sin puertos publicados, ningún secreto ni volcado versionado. Lo aplicado:
- `/api/cambios` vuelve a leer la sesión de la base cada minuto y cierra el
  flujo si la cuenta se desactivó o salió (era el pendiente de O-061).
  `EventSource` reintenta, recibe 401 y deja de insistir.
- CSP: a `frame-ancestors` se suman `base-uri 'self'`, `form-action 'self'` y
  `object-src 'none'`, que no necesitan nonces; y `Cross-Origin-Opener-Policy`.
  `script-src` sigue pendiente, por lo mismo que dice `next.config.mjs`. No se
  puso `Cross-Origin-Resource-Policy`: el logotipo de los correos se carga desde
  el correo web de otro origen y dejaría de verse.
- `tests/setup.ts` vacía `SMTP_HOST` siempre (el pendiente de O-062).
- `despliegue/paginas/docker-compose.override.yml`: `no-new-privileges` y
  `cap_drop: ALL` en `app`. La copia que corre en `ved` no se tocó —no está
  versionada y cambia el contenedor en el siguiente `up`—: hay que copiarla a
  mano cuando se pueda mirar el arranque. Falta lo mismo en
  `docker-compose.tailscale.yml` y `docker-compose.prod.yml`.
*Sin comprobar:* la sesión perdió la línea de órdenes a mitad de camino; nada de
esto pasó por `typecheck`, `lint`, pruebas ni `build`, y por eso no se subió:
`auto-update.sh` despliega `main` solo. Correr la lista de `AGENTS.md` (con la
base desechable de O-062) antes del commit.
*Comprobado el 2026-09-21:* la lista entera de `AGENTS.md`, sobre un PostgreSQL
desechable en el 55432 con las migraciones aplicadas y `SMTP_HOST` vacío, sin
tocar `trauma-db`. `typecheck` limpio; `lint` sin errores (10 avisos de `<img>`,
los de siempre); `test:coverage` 147 archivos y 2309 pruebas, 12 omitidas,
cobertura 91,97 % de sentencias; `test:integration` 139 de 139; `build` sin
fallos. No hizo falta cambiar nada de lo aplicado. `npm ci --dry-run` ya pasa
con el `package-lock.json` reescrito, que sube en su propio commit (O-062).
Sigue sin hacerse lo que esta entrada deja a mano: copiar `no-new-privileges` y
`cap_drop` a la copia del override que corre en `ved`, y mirar ese arranque.
*Pendiente, dependencias* (`npm audit --omit=dev`: 2 altas, 13 medias, 1 baja):
`nodemailer` ≤9.1.0 (alta; se arregla con `npm audit fix`, sin salto mayor);
`sharp` 0.34 (alta, CVE de libvips y libheif al abrir imágenes, que aquí suben
los editores; el arreglo es 0.35.4, salto mayor); `payload` y `@payloadcms/*`
3.88.0 → 3.90.1 (GHSA-jg8r-5jh2-v2xj, ya neutralizada aquí por partida doble,
más `esbuild`/`drizzle-kit` que solo cuentan en desarrollo); `dompurify` vía
`monaco-editor`. Cada subida, con la suite entera y `migraciones.test.ts` detrás.

### O-064 · 2026-09-21 · media · corregida en la documentación; la redirección, pendiente
**Un enlace con la dirección del Windows llevaba a APCE.**
Un profesor recibió el enlace y «le redirigía a APCE»; otra persona en la misma
red entraba bien. *Dónde se ve:* el registro de Nginx Proxy Manager, con visitas
a `ved.tailc2094f.ts.net:10000/simulaciones` contestadas con 404 por `apce-web`.
`/simulaciones` era el prefijo del despliegue en Windows; en `ved` la plataforma
vive en `/traumahub`, y todo lo que no empieza por ahí lo atiende APCE, que es
la página por omisión del dominio. No era la red ni el equipo: era la ruta.
`MANUAL-DE-USO.md`, `GUION-DE-RECORRIDO.md` y `CORREO.md` seguían dando
`traumahub.tailc2094f.ts.net/simulaciones`, que ya no responde; corregidos, y
`SERVIDOR-WINDOWS.md` lo avisa arriba. La dirección buena es
`https://ved.tailc2094f.ts.net:10000/traumahub`. *Pendiente:* una redirección de
`/simulaciones` a `/traumahub` en `server_proxy.conf` del proxy, para los
enlaces viejos que ya están repartidos; no se hizo porque ese archivo no está
en este repositorio y lo comparten las demás páginas del servidor. Q-008 cita
la dirección vieja y se deja como está: era cierta cuando se escribió.

### O-065 · 2026-09-21 · alta · abierta
**`auto-update.sh` no despliega lo que se sube desde el propio servidor.**
*Dónde se ve:* `paginas/auto-update.sh` compara el `HEAD` de la copia de trabajo
de `ved` con `origin/main`, y solo reconstruye si el remoto va por delante. Un
commit hecho en esa misma copia y subido deja las dos puntas iguales: el guion
no ve nada nuevo, no escribe nada en `auto-update.log`, y el contenedor sigue
con la imagen anterior. Pasó el 2026-09-21: la revisión de seguridad de O-063 se
subió por la mañana creyendo que se desplegaba sola —O-063 lo dice así— y a
mediodía el contenedor seguía siendo el del 20 a las 20:00. Se desplegó a mano,
junto con D-125 a D-128, con la misma orden del guion
(`docker compose up -d --build`), y se comprobó desde fuera por las cabeceras
nuevas. *Regla mientras tanto:* lo que se suba desde `ved` se despliega a mano;
lo que llegue de otra máquina, solo. *Arreglo pendiente:* que el guion compare
contra la revisión con la que se construyó la imagen (una etiqueta en la imagen
o un archivo junto al compose), no contra la copia de trabajo. El guion no está
en este repositorio: vive en `paginas/` y lo comparten todas las páginas.

### O-066 · 2026-09-22 · alta · corregida
**En la ficha pública, un hueso partido se dibujaba entero debajo de sus
trozos; y «Recortar» giraba la cámara en vez de dibujar el marco.**
*Dónde se ve:* una patología publicada con una preparación recortada (D-140),
abierta como lector: recorriendo el modelo con el ratón salían «Tibia derecha»
y «Tibia derecha · fragmento» a la vez. El repaso de visibilidad de la carga
corría antes de que existieran los trozos, y en la ficha nada vuelve a
repintar; en el taller no se notaba porque cualquier clic repinta. El efecto
de pintado compara ahora también el conjunto de piezas partidas y corre al
terminar la carga. Lo segundo era un descuido de D-140: la herramienta no
estaba en la lista que le quita el giro al botón izquierdo. Las dos cosas
salieron de probar la ficha pública, que D-137 y D-140 dejaron sin probar; a
partir de ahora la prueba de navegador de cada cambio del visor incluye la
ficha como lector, no solo el taller.

### O-067 · 2026-09-26 · alta · resuelta
**«Respaldar ahora» fallaba con `EACCES`, la página de sistema decía «no hay
ningún respaldo» con once en la carpeta, y el endurecimiento de ee5f463 nunca
llegó al contenedor.**
*Dónde se ve:* el dueño pegó `EACCES: permission denied, open
'/backups/base-20260926-194535.sql.gz'` y la página de sistema con «Respaldo
reciente: no hay ningún respaldo» y «Respaldos conservados: 0». La carpeta
`backups/` era de `ved` (1000:1000) con permisos 770; el contenedor corre como
el 1001 de la imagen y no podía ni listarla. La receta de instalación pedía un
`sudo chown 1001` que en `ved` no se hizo nunca: la carpeta la creó
`deploy.sh` como `ved` y nada comprobó después el dueño. Los respaldos nocturnos
sí se hacían —cron corre como `ved`—, así que nada se perdió. Y
`listarRespaldos` se tragaba cualquier error como «todavía no existe», de modo
que la pantalla de respaldos negaba tenerlos, que es lo peor que puede decir.

Al copiar la plantilla corregida salió lo segundo: el
`docker-compose.override.yml` de `ved` era anterior a la plantilla, y el
`cap_drop: ALL` y el `no-new-privileges` de la revisión de seguridad (ee5f463)
no habían llegado nunca al contenedor. Es el mecanismo de O-054, otra vez.

*Arreglo.* El override arranca la aplicación como `1001:${RESPALDOS_GID:-1000}`:
el usuario de la imagen con el grupo de la carpeta. Con el grupo no hay dueño
que mantener, y lo que escribe la aplicación sale con ese grupo, que es por
donde `restaurar.sh` lo lee desde fuera. `listarRespaldos` solo lee como vacío
un directorio que no existe; cualquier otro fallo se lanza con su motivo
(`motivoDelDirectorio`: quién es el proceso, de quién es la carpeta, con qué
permisos y dónde se arregla), y sistema, respaldos y resumen lo enseñan. La
fila «Herramienta de respaldo» de sistema comprueba además que se pueda
escribir. `scripts/salud.sh` compara el override con su plantilla y falla si
difieren. Aplicado en `ved` el mismo día, con respaldo previo: el contenedor
lista los doce volcados y un `pg_dump` de prueba se escribió en `/backups`.
*Pendiente:* nada en `ved`. Otra máquina con otro `id -g` tiene que poner su
`RESPALDOS_GID` en el `.env`.

### O-068 · 2026-09-26 · baja · resuelta
**`salud.sh` decía cada día «el temporizador de respaldo está detenido» en una
máquina sin temporizador, con el respaldo de las 03:00 hecho.**
*Dónde se ve:* al pasar `salud.sh` tras desplegar D-141 a D-143, el único fallo
era ese. En `ved` no hay `plataforma-respaldo.timer`: el respaldo diario va por
cron (`0 3 * * *`, `respaldar.sh --verificar`) y esa noche había terminado
bien. La comprobación preguntaba si el temporizador existía con `systemctl
list-timers`, que sale con 0 aunque no encuentre ninguno («0 timers listed»),
así que la rama del cron no se miraba nunca y el estado salía en rojo desde
53bb6f6 (2026-09-06). Una alarma que suena todos los días enseña a no mirarla,
y el día que el respaldo falle de verdad dirá lo mismo.
*Arreglo.* Se pregunta con `systemctl cat`, que sale con 1 si la unidad no
existe; con temporizador se sigue mirando si está activo, y sin él, el cron.

### O-069 · 2026-10-02 · media · resuelta
**El tiempo de revisión se podía inflar desde la consola del navegador, y dos
pestañas contaban doble.**
*Dónde se ve:* auditoría de seguridad del 2026-10-02. `anotarLatido` recortaba
lo que manda el navegador al tiempo pasado desde el latido anterior **de la
sesión**, y la sesión la inventa el propio navegador: con un identificador nuevo
en cada llamada, cada una traía el minuto que se le admite a una primera fila.
Un editor que llamara a `latidoDeRevision` en bucle se abonaba horas en
segundos, y la alarma de «validación rápida» de D-142 —lo único que distingue
una revisión leída de una firmada a ciegas— no saltaba nunca. Sin trampa, dos
pestañas de la misma ficha sumaban cada una su tiempo.
*Arreglo.* `techoDelLatido`: además del techo de la sesión, nada pasa del tiempo
real desde el último latido **de la cuenta**, en cualquier ficha; ese segundo
techo va sin holgura, porque los cinco segundos por llamada repetidos a ráfagas
volvían a ser la puerta. Los latidos de una cuenta van en fila en memoria
(`enFilaDeLaCuenta`), o cien llamadas en paralelo leerían el mismo «último» y
se abonarían cada una el hueco entero; de paso ya no choca el primer latido
doble de una sesión contra el índice único de `sesion`. (−) La fila vive en el
proceso, como `src/lib/ritmo.ts`: con dos procesos habría que llevarla a la
base. (−) Un latido que llega antes de tiempo pierde esa fracción de segundo.
Lo fijan `tests/unit/revisionSinAtajos.test.ts` y una ráfaga en
`tests/integration/revision.test.ts`.

### O-070 · 2026-10-02 · media · resuelta
**Duplicar o borrar sacaba una ficha de la revisión.**
*Dónde se ve:* misma auditoría. `duplicarDocumento` creaba la copia sin
revisión, así que un editor podía copiar el texto que llegó del modelo, publicar
la copia —sin revisión, nada se lo impedía— y borrar la original con
`eliminarDocumento`, que se llevaba también su revisión y su tiempo. Contenido
de IA publicado sin revisar y sin rastro en Auditoría: la salida entera del
flujo de D-142.
*Arreglo.* La copia de una ficha en revisión entra en revisión con la
procedencia, las notas, la asignación y la versión **original** de la otra
(`registrarParaRevision` acepta ahora `original` y `copiaDe`), para que lo
editado se siga midiendo contra lo que escribió el modelo; si no puede entrar,
la copia se borra y se dice. Borrar una ficha en revisión queda para el
administrador. Las dos comprobaciones fallan cerradas si la tabla de revisiones
no contesta, como la de publicar.

### O-071 · 2026-10-02 · media · resuelta
**«Publicar las validadas» dejaba el lote a medias sin decir cuáles salieron.**
*Dónde se ve:* auditoría de errores del 2026-10-02. El bucle no se recuperaba
de un fallo: si caía la ficha 40 de 200, las 39 anteriores quedaban publicadas,
la acción contestaba un error a secas y no se refrescaba ninguna pantalla. El
administrador no sabía qué estaban leyendo ya los residentes.
*Arreglo.* Lo mal formado se rechaza entero antes de escribir nada; después
cada ficha falla por su cuenta y se devuelve en `fallidas` con su motivo, y las
pantallas se refrescan siempre. Una ficha publicada cuya anotación en la
revisión falla se cuenta como publicada, con el aviso: decir que falló mandaría
a publicarla otra vez. La tabla de Auditoría pinta el resultado en rojo si algo
falló y nombra cada ficha.

### O-072 · 2026-10-02 · media · resuelta
**El freno de intentos de entrada no sabía quién llamaba: o todos eran la
misma dirección, o cada uno la que quisiera.**
*Dónde se ve:* auditoría de seguridad del 2026-10-02, comprobado leyendo la
configuración de Nginx Proxy Manager en `ved`. El fragmento de `/traumahub`
pisaba `X-Forwarded-For` con `$remote_addr`, y ese `$remote_addr` no es el
visitante: el Funnel llega a NPM desde la red de Docker y NPM aplica en `http{}`
un `real_ip_header X-Real-IP` que se fía de `172.16.0.0/12`. Sin cabecera, todos
los visitantes eran la puerta de enlace y compartían los 30 intentos de diez
minutos de `entrar()` —uno solo podía dejar fuera a todo el hospital—; con un
`X-Real-IP` inventado en cada intento, el freno no frenaba. La aplicación,
además, leía el **primer** valor de `X-Forwarded-For`, que es el que escribe el
visitante. La página de diagnóstico del mismo servidor ya había dado con esto y
lo había comprobado (su fragmento, `trauma-nginx-trauma.conf`).
*Arreglo.* `direccionDeQuienLlama` toma el **último** valor, el que añade el
túnel, y el fragmento de `/traumahub` reenvía la cabecera del túnel tal cual
(`$http_x_forwarded_for`); lo describe `despliegue/paginas/LEEME.md`. (−) El
fragmento vive en el volumen de NPM y no en el repositorio: una reinstalación de
NPM que lo rehaga a mano tiene que volver a ponerlo, o el freno vuelve a
compartirse entre todos.

### O-073 · 2026-10-02 · baja · resuelta
**Cambiar la contraseña no echaba a nadie.**
*Dónde se ve:* misma auditoría. `resetPassword` de Payload añade una sesión a la
cuenta y no toca las demás, así que un testigo copiado seguía entrando sus ocho
horas después de que su dueño cambiara la clave, que es justo lo que hace quien
sospecha que alguien entró con la suya.
*Arreglo.* `fijarClaveNueva` deja la cuenta solo con la sesión que abre el
propio cambio (`cerrarLasDemasSesiones`), igual que «salir» quita la suya
(O-059). No lanza si falla: la clave ya cambió, y el fallo queda en el registro.
Lo fija `tests/integration/salir.test.ts`.

### O-074 · 2026-10-02 · baja · resuelta
**Tres restos de la auditoría del 2026-10-02.**
- El editor seguía mandando latidos cada quince segundos a una ficha que un
  administrador había sacado de revisión: la acción contestaba
  `enRevision: false` y `useSeguimientoDeRevision` no lo leía. Ahora deja de
  medir y de enviar.
- `data_traumahub/` —los libros de la ingesta, varios GB con derechos de autor—
  estaba fuera de la imagen y no fuera del repositorio. Va al `.gitignore`.
- Rendimiento: el resumen de cuentas de `/admin-panel/registro` y de su planilla
  hacía dos `count` por cuenta y en serie (mil consultas con quinientas
  cuentas); ahora es una lectura de dos columnas que se cuenta en memoria. Y
  `obtenerSesion` va con `cache` de React: la plantilla, la página y la guardia
  resolvían la sesión cada una por su lado en el mismo pintado. Se miró también
  quitar el historial de la lectura de Auditoría y no se hizo: `armarAuditoria`
  lo usa para contar las devoluciones de cada revisor.

### O-075 · 2026-10-02 · media · resuelta
**Un modelo sin centrar en su archivo no se veía en el simulador.**
*Dónde se ve:* la cirugía «Prueba 2», sobre «mano-derecha» (modelo n.º 12),
exportada del atlas en su sitio del cuerpo, a unos 85 cm del origen. El lienzo
nacía en blanco, sin ningún mensaje, hasta pulsar «Encuadrar»; y entonces el
5.º metacarpiano aparecía suelto a unos 17 cm de la mano.
*Causas, dos.* (1) Al cargar, la raíz se mueve para centrar el modelo y acto
seguido se encuadra, pero `Box3.expandByObject` solo pone al día la matriz del
propio objeto, no la de su padre: la caja salía en las coordenadas del archivo y
la cámara apuntaba al vacío. Con un modelo ya centrado ese movimiento es cero, y
por eso no se había visto. (2) El giro de la reducción se aplica sobre el origen
del nodo del fragmento, que en estos archivos es el del cuerpo: 12° a 85 cm son
17 cm de vuelo.
*Arreglo.* `encuadrarVisible` llama a `updateMatrixWorld(true)` antes de medir, y
`pivoteEnSuCentro` (`LienzoQuirurgico.tsx`) lleva el origen del fragmento al
centro de su geometría al cargarlo, sin moverlo. Se arregla en el lienzo y no
pidiendo modelos bien preparados, porque un archivo mal centrado no da error en
ningún sitio. (−) Un caso cuyo desplazamiento inicial se capturó con el pivote
viejo se verá algo distinto con giros grandes: las cifras guardadas no cambian,
pero ahora el giro es alrededor del hueso. En producción no quedaba ninguno.

### O-076 · 2026-10-02 · alta · resuelta
**Dependencias al día, y la propuesta de instrumento con techo.**
*Dónde se ve:* `npm audit --omit=dev` daba 19 avisos, uno crítico, cuando el
pendiente de la segunda pasada de seguridad (más arriba) contaba 16. Y la
auditoría de D-146 y O-075, hecha después de la de la mañana.
*Dependencias.*
- `next` 16.3.3 → 16.3.8 (crítica: ejecución remota en `next/og`. Aquí no se
  usa `ImageResponse`, pero no se deja a que alguien lo importe).
- `payload` y `@payloadcms/*` 3.88.0 → 3.90.2 (GHSA-jg8r-5jh2-v2xj, ya
  neutralizada aquí). **Trae migración**: Payload 3.90 añade
  `usuarios.reset_password_requested_at`, con la que frena los «olvidé mi clave»
  seguidos sobre la misma cuenta. Sin ella, cada consulta de usuarios —el
  inicio de sesión incluido— falla con `column … does not exist`.
- `sharp` 0.34 → 0.35.5 (alta; libvips y libheif al abrir las imágenes que suben
  los editores). Salto mayor sin cambios de uso.
- Por `overrides`, porque los fija exactos un paquete de arriba: `undici` 7.30.0
  (alta, dentro de `payload`), `nodemailer` 10 (alta; `@payloadcms/email-
  nodemailer` pide `^9.1.1` y toda la 9 está afectada) y `dompurify` 3.4.16
  (baja, dentro de `monaco-editor`). `nodemailer` pasa a dependencia directa:
  `payload.config.ts` importa ahora su tipo, y el override apunta a ella
  (`$nodemailer`) para que no puedan separarse.
- Quedan 5 moderadas, todas el `esbuild` viejo que arrastra `drizzle-kit`: solo
  muerden con un servidor de desarrollo de `esbuild` abierto, y aquí no hay
  ninguno. Sin arreglo sin bajar de versión `@payloadcms/db-postgres`.
- Para subir Payload, `npm install` con las versiones nuevas en `package.json`
  falla (`ERESOLVE`): cada paquete fija `payload` exacto como *peer*, y npm no
  sabe mover el grupo entero a la vez. Hay que desinstalar el grupo e
  instalarlo de nuevo con las versiones explícitas; luego volver a fijarlas sin
  `^`, que `npm install` las deja con él.
*`nodemailer` 10 y los tipos.* Ahora trae sus propios tipos, y
`SMTPConnection.Options` —el que declara el adaptador para `transportOptions`—
ya no lleva `auth`. El adaptador no abre una conexión con ese objeto: llama a
`createTransport`, que sí lo lee. Se valida contra `SMTPTransport.Options` y se
entrega con el tipo del adaptador; quitar `auth` para que compilase habría
dejado el correo sin autenticar.
*La propuesta de instrumento (D-146).* El gancho crea comentarios sin pasar por
`crearComentario`, es decir, sin su freno ni su largo máximo, y cada comentario
es un correo a cada administrador. Una cirugía de 500 pasos (`MAXIMO_FILAS`) con
nombres de 20.000 caracteres eran 500 correos por administrador en un guardado.
Ahora: nombre y título recortados a 120 (y `maxLength: 120` en el campo); un
comentario por instrumento, con todos los pasos que lo piden, y no uno por paso;
diez instrumentos por guardado como mucho, y el resto en un único comentario de
resumen. El catálogo se lee una vez y se compara exacto: el `like` de antes
parte el nombre en palabras en PostgreSQL y, con `limit: 20`, podía no devolver
el que coincidía y decir «no está» de uno que estaba. Y se corrige el
comentario del gancho que prometía que no quedaba aviso si la cirugía no se
guardaba: el comentario sí se deshace, pero el correo sale antes del commit.
*Pivote (O-075).* `pivoteEnSuCentro` se repetía en cada repintado del taller y
paraba solo si el centro quedaba a menos de 1e-6. En un modelo en milímetros,
lo que deja `translate` en float32 supera ese margen: cada pasada clonaba otra
vez la geometría sin soltar la anterior. Ahora marca el nodo y no repite.
(−) Duplicar una cirugía con propuestas vuelve a avisar en la copia. Se deja:
la copia también necesita el instrumento, y con el techo son once avisos como
mucho.
*Comprobado:* la lista de `AGENTS.md` en un worktree aparte (esta carpeta es
producción), sobre un PostgreSQL desechable en el 55432 con las migraciones y
`SMTP_HOST` vacío. `typecheck` limpio; `lint` sin errores (los 10 avisos de
`<img>`); `test:coverage` 168 archivos, 2643 pruebas, 12 omitidas;
`test:integration` 169 de 169; `build` sin fallos (los 8 avisos de trazado de
Turbopack ya salían en `main`).

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

### Q-010 · ¿Son estos los nombres que quiere Cristóbal para leer una reducción?
La lectura de E3 (D-160) escribe «8 mm lateral · 10° varo» y lo hace con unas
convenciones que puso quien programó, no un traumatólogo:

- **Varo y valgo** se leen por el extremo del fragmento **distal** respecto del
  proximal: distal hacia dentro del cuerpo, varo; hacia fuera, valgo.
- **Recurvatum:** el distal hacia delante (ápice posterior). **Antecurvatum:** el
  distal hacia atrás (ápice anterior).
- **Rotación externa:** la cara anterior del distal gira hacia fuera del cuerpo.
- **Diástasis** y **acortamiento** a lo largo del eje del hueso entero.

Hay que preguntarle: ¿es así como las nombra en una ficha?, ¿prefiere «ápice» a
«extremo distal», que es lo que dice una radiografía?, ¿quiere «procurvatum» en
lugar de «antecurvatum»? Cambiarlo es una tabla en `src/atlas/lecturaClinica.ts`.

### Q-009 · ¿Se construye la planificación con DICOM, y como docente o como clínica?
La propuso Cristóbal el 2026-10-06 y el módulo 06 la anuncia (P-001, E7). Cargar
la tomografía de un paciente, reconstruir su fractura y planificar la cirugía del
día siguiente cambia la naturaleza de la plataforma.

Si es **docente**, con estudios anonimizados, es una herramienta de enseñanza
más. Si es **clínica** —decidir la cirugía de un paciente concreto—, puede pasar a
considerarse software de uso médico, con sus exigencias regulatorias. En los dos
casos, los estudios son datos de salud y piden una revisión legal y de ética
antes del primero (Q-005, Q-007).

Mi lectura: docente primero, y decidirlo por escrito antes de empezar el P-002.

---

## 5. Plan de trabajo

Formato: `P-nnn · fecha de inicio · estado`. Estados: **en curso**, **terminado**,
**abandonado**. Un plan agrupa trabajo que no cabe en una sesión, para que
cualquiera —persona o asistente— pueda retomarlo donde quedó. Cada tarea lleva
un identificador (`E3.2`) y una casilla: `[ ]` pendiente, `[x]` hecha, con el
commit al lado. Las decisiones que salen de cada etapa van a la sección 2 como
`D-nnn` y se enlazan desde aquí; los fallos, a la sección 3 como `O-nnn`. Los
commits del plan llevan `(P-001 E3.2)` al final del mensaje.

### P-001 · 2026-10-07 · en curso
**Siete etapas: módulos en mantención, comentarios en el taller, manipulación
directa, fracturas AO guiadas, piel e instrumental, el manejo AO paso a paso, y el
anuncio del módulo 06 de planificación con DICOM.**

#### De dónde sale

Pedidos del dueño y del traumatólogo, Cristóbal Cofré, del 5 y 6 de octubre:

1. Ocultar y mostrar módulos enteros desde el panel. «Si no quiero que se vea
   Lectura de imágenes, poder ocultarla y que no la pueda ver ni el editor ni el
   usuario.»
2. Una pestaña para agregar comentarios en el taller anatómico.
3. Pinchar un fragmento de la fractura y desplazarlo y angularlo sobre él mismo,
   «como se manipulan las imágenes en PowerPoint o Word». «Ahora lo tiene, pero
   es medio engorroso.»
4. Un constructor de fracturas. Un panel a la derecha dice «Selecciona hueso», se
   pincha el hueso, se elige el tipo de fractura y después la porción o extensión
   dentro del hueso. La guía es AO Surgery Reference y la app *AO/OTA Fracture
   Classification*. Cristóbal: «Le quita libertad, pero con fines docentes da lo
   mismo, porque queda el concepto».
5. Agregar piel e instrumental quirúrgico.
6. Comentario de Cristóbal sobre la maniobra «Examen motor y sensitivo del
   miembro superior, con énfasis en los signos cubitales»: «dejar separado por
   segmento anatómico».

7. Un módulo nuevo, el 06, para planificar con los DICOM del paciente. Por ahora
   solo se anuncia: dice «Próximamente», trae una descripción detallada de lo que
   tiene que ser, y los editores van dejando requisitos y cómo les gustaría que
   fuese. Pedido del dueño, 2026-10-07.

**Las notas de voz de Cristóbal (2026-10-06).** Son las cuatro de WhatsApp de
las 03:41, 03:42, 10:24 y 10:28. El dueño pegó su transcripción el 2026-10-07, y
esto es lo que piden:

- **Fidelidad a AO Surgery Reference.** Llevar al modelo cada patrón de fractura
  que describe, para «ser fieles a las conductas, al paso a paso quirúrgico que
  nos ofrecen, que es el gold standard». Da el horizonte de E4: v1 con los
  huesos largos, y a la larga todos los patrones.
- **De la clasificación al tratamiento.** Primero se separa por clasificación, y
  para cada una se ven las alternativas de manejo, como en esa página. Al elegir
  una, se despliega su menú: tutor externo, placa, clavo endomedular… Es la
  etapa nueva **E6**.
- **Hacerlo en el modelo y grabarlo.** El paso a paso de cada técnica se hace en
  el modelo, y lo hecho se graba, para que quede como demostración de cómo se
  opera. También **E6**.
- **Planificar el material.** Hacerlo así ayuda a ver qué material sirve, qué
  medidas hay que pedir y qué tornillos no traen las empresas. Él mismo añade:
  «ahí nos pasaríamos». Queda como idea para una v2 de E6, fuera de la v1.
- **DICOM, «ya de otro nivel».** Cargar los DICOM del paciente, que se reconstruya
  su fractura exacta, y planificar y simular la cirugía del día siguiente.
  Coincide con el pedido 7: es la etapa nueva **E7**, que de momento solo lo
  anuncia.

**Ya hecho, fuera del plan:** la piel vuelve al atlas (D-155).

#### Respuestas del dueño · 2026-10-07

Cierran las preguntas que el plan dejaba abiertas:

1. **Módulos.** Lo que se pide es una mantención, no ocultarlo a todos:
   - el residente, y cualquier lector, no ve el módulo;
   - el editor lo ve marcado «En mantención»;
   - el interruptor está en el panel del administrador, uno por cada módulo
     (las cinco tarjetas de la portada: Biblioteca de patologías, Examen físico,
     Técnica AO, Simulador quirúrgico y Lectura de imágenes).

   Cambia E1.
2. **Examen físico.** «Lo más fácil de implementar, pero que se vea ordenado e
   intuitivo.» Fija E1.8.
3. **Manipulación.** Lo engorroso era el taller anatómico. La consola quirúrgica
   sale de E3.
4. **Fracturas.** Solo en el taller. El residente no fractura: verá el modelo ya
   fracturado. Fija E4-Q2. La propuesta de empezar por los huesos largos no se
   discutió y se mantiene.
5. **Instrumental.** «Quiero que lo modeles.» Lo modela el asistente, con Blender
   y por guion. Cambia E5.4.

#### Por qué en este orden

- **E1** no depende de nada, es la más corta y resuelve un pedido ya.
- **E2** crea el componente de pestañas del panel derecho del taller, que **E4**
  necesita para el asistente de fracturas.
- **E3** va antes que **E4**. Un constructor que genera fragmentos sirve de poco
  si moverlos sigue siendo engorroso. Además, E4 reutiliza los ejes del hueso que
  calcula E3.
- **E4** es la más grande y la de más riesgo geométrico.
- **E5** va después porque la piel ya está y el instrumental en escena necesita
  la manipulación de E3. Su parte sin código, modelar el instrumental, puede
  empezar hoy en paralelo.
- **E6** necesita tres cosas de las etapas anteriores: el modelo fracturado (E4),
  moverlo con comodidad (E3) y los implantes e instrumentos (E5). Es lo que
  convierte todo lo anterior en clase.
- **E7** no depende de nada más que de la insignia de E1, y es corta. Puede
  adelantarse a cualquier momento después de E1 si se quiere empezar ya a
  recoger requisitos. Lo que E7 anuncia —planificar con DICOM de verdad— es otro
  plan, P-002, que se escribe cuando se decida empezarlo.

#### Reglas para todas las etapas

- Cada etapa termina con `npm run typecheck`, `npm run lint`,
  `npm run test:coverage`, `npm run build` y `npm run test:integration`. Las de
  integración **nunca contra la base de producción** (O-048): no en `faraday`;
  en `ved`, contra una base desechable.
- Antes de desplegar una etapa con migración, «Respaldar ahora» en el panel.
- Ni ilustraciones ni textos de AO Surgery Reference se copian: son © AO
  Foundation. La clasificación —códigos y nombres de los grupos— es un estándar
  publicado y se puede usar; los dibujos y las descripciones se hacen aquí.
- Nada que se importe en el taller puede arrastrar `three` de forma estática
  (`tests/unit/tallerDeAtlas.test.ts`).
- Lo que se toque en el taller se prueba también en un navegador con el atlas
  real, no solo con pruebas unitarias.

---

#### E1 · Módulos en mantención · 1–2 sesiones · hecha en código (2026-10-07) · falta la partición de contenido (E1.8c) y desplegar

**Objetivo.** Desde el panel, el administrador pone en mantención cualquiera de
los cinco módulos, o lo devuelve a visible.

- **Lectores y residentes:** un módulo en mantención desaparece para ellos en
  todas partes: barra, portada con y sin sesión, contadores, «Continúa leyendo»,
  aviso de contenido nuevo y enlaces directos.
- **Editores:** lo siguen viendo y trabajando como siempre, con una insignia
  «En mantención» en la barra, la portada y el panel.
- **Administradores:** como los editores, más el interruptor.

**Hecho cuando…** Se pone «Lectura de imágenes» en mantención y:

- Un lector no la ve en ningún punto de E1.4. Si escribe la dirección a mano,
  recibe una pantalla neutra, «Este módulo no está disponible en este momento».
- Un editor la ve en los mismos sitios con la insignia, y abre, edita y revisa
  sus fichas como antes.
- «Ver como residente» la esconde.
- Quitar la mantención lo devuelve todo como estaba. El progreso de lectura del
  residente no se borra: solo deja de verse mientras dura la mantención.
- El cambio queda en el registro de acciones (D-145), y `roles.test.ts` lo
  demuestra contra la base.

**Decisiones de diseño**

- **Dos estados por módulo: «Visible» y «En mantención».** Solo cambia lo que ve
  el lector. El editor y el administrador quedan igual que hoy.
  - *Supuesto a confirmar:* el editor también **edita** dentro de la mantención,
    porque para eso sirve. Si no se quiere, es una línea más en `puedeEditar`.
- **Dónde se guarda.** En una colección nueva, `ajustes`, de una sola fila, y no
  en un *global* de Payload. Los globals quedan fuera de
  `migraciones.test.ts`, de la matriz de `roles.test.ts` y del registro D-145,
  que solo envuelve colecciones.
  - Campo `modulosEnMantencion`: un `select` con `hasMany` de los cinco slugs.
  - Pide migración (tabla y enum).
- **Solo cambian las reglas de lectura del lector.**
  - `puedeVerModulo`, `filtroDeLectura` y `filtroDeLecturaDeModulo`
    (`src/access/reglas.ts`) reciben `enMantencion`. Si el rol es lector y el
    módulo está en mantención, no hay acceso. Siguen siendo puras.
  - `puedeEditarModulo` y `puedeEditar` (`src/lib/guardias.ts`) no cambian. Por
    eso no hay que tocar las acciones del panel, la cola «Por revisar», la
    presencia ni la bandeja de comentarios: el editor no pierde nada.
- **Cómo llega la lista a las reglas.** Desde `src/lib/modulosEnMantencion.ts`:
  - para las páginas, cacheada por petición con `cache()` de React;
  - para los adaptadores de Payload (`src/access/payload.ts`), memorizada en
    `req.context`, porque `Access` admite promesas.
- **«Ver como residente» funciona sin hacer nada.** `obtenerSesion` da un usuario
  efectivo con rol lector, así que el administrador o el editor pueden comprobar
  qué ve el residente.
- **La pantalla para quien llega por dirección.** Un estado nuevo,
  `ModuloNoDisponible`, en `src/components/Estados.tsx`, con un texto neutro.
  No se reutiliza `SinAccesoAlModulo`: manda a pedir acceso a un administrador, y
  aquí no hay acceso que pedir.
- **La insignia «En mantención».** Un componente pequeño en `src/components/ui/`,
  con el color de aviso de los tokens de D-147.
- **La API REST no se toca.** Ya responde 403 a todo lo que no sea un archivo
  (D-073).

**Tareas**

- [x] **E1.1 · La colección.** `src/collections/Ajustes.ts`:
  - acceso: leer y modificar solo el administrador; crear solo si no existe
    (gancho); borrar, nadie;
  - registrarla en `COLECCIONES`, en `CLASE_DE` de `roles.test.ts` (clase
    `administracion`) y en su fábrica de documentos;
  - `npx payload migrate:create modulos_en_mantencion` y `npm run generate:types`.
- [x] **E1.2 · Leer y escribir.**
  - Leer devuelve `[]` si no hay fila.
  - La acción `cambiarMantencionDeModulo(slug, enMantencion)` va en
    `acciones/admin.ts`, protegida con `exigirAdmin`.
  - Anota en el registro una acción nueva, `mantencion-de-modulo`, en
    `ACCIONES_DEL_REGISTRO` (`src/lib/registro.ts` l.22; no pide migración).
  - Hace `revalidatePath` de la portada y del panel.
- [x] **E1.3 · Las reglas.**
  - `reglas.ts` y `payload.ts`.
  - Se rompen dos pruebas que buscan con una expresión regular la llamada de dos
    argumentos: `tests/unit/listadosDeModulo.test.ts` l.54 y
    `tests/unit/fichasDeModulo.test.ts` l.57. Hay que actualizarlas.
  - Pruebas unitarias: el lector no ve; el editor y el administrador, sí.
- [x] **E1.4 · Lo público.** En cada punto, el lector no ve el módulo y el editor
  lo ve con la insignia:
  - `src/components/Navegacion.tsx`: la barra y el menú móvil.
  - Portada con sesión, `src/app/(frontend)/page.tsx`:
    - la rejilla (las cinco tarjetas de la imagen del dueño), los conteos y
      «Continúa leyendo»;
    - el avance por módulo y los recorridos del simulador;
    - el rótulo «Los cinco módulos / Sus módulos» (l.615);
    - **los botones fijos `/biblioteca` y `/tecnica-ao`** (l.493–505), que hoy no
      filtran.
  - Portada sin sesión: la tira de módulos y el texto «Cinco módulos» (l.98 y
    l.124–140), que hoy no filtra nada.
  - Las nueve páginas con guardia D-102. El lector recibe `ModuloNoDisponible`.
  - `src/app/(frontend)/api/cambios/route.ts` y `versionActual`
    (`src/lib/publicaciones.ts`).
  - Las acciones `crearComentario` y `anotar`, para el lector.
- [x] **E1.5 · El panel.**
  - En «Contenido», cada tarjeta de módulo lleva el interruptor «Visible / En
    mantención», solo para el administrador.
  - El interruptor confirma con `useConfirmar`: «Los residentes dejarán de ver
    «X». Los editores la verán marcada En mantención».
  - La insignia aparece en «Resumen» y en el listado del módulo.
  - Estadísticas y Auditoría marcan el módulo.
  - En `src/lib/permisos.ts`, la fila del lector en la tabla de capacidades.
- [x] **E1.6 · Pruebas.**
  - `roles.test.ts`, módulo en mantención: el lector no lee; el editor lee y
    escribe; el administrador, igual.
  - `panelPorRol.test.ts`.
  - Una prueba de que la portada sin sesión no lista el módulo en mantención.
- [x] **E1.7 · Documentación.** Sección en `docs/MANUAL-DE-USO.md`, y la D-nnn.
- [x] **E1.8 · El examen físico, ordenado.** Decidido: lo más fácil que deja la
  página ordenada e intuitiva. Son tres partes, y **ninguna pide migración**.
  - [x] **E1.8a · Regiones sin tocar la base.**
    - Una tabla fija en `src/lib/regiones.ts` traduce el nombre de cada segmento a
      su región:

      | Región | Segmentos |
      |---|---|
      | Miembro superior | Hombro, Brazo, Codo, Antebrazo, Muñeca y mano |
      | Miembro inferior | Cadera, Muslo, Rodilla, Pierna, Tobillo y pie |
      | Esqueleto axial | Columna, Pelvis y acetábulo |
      | Generales | Principios generales |

    - Un segmento desconocido va a «Otros».
    - `/examen-fisico` y el índice de `BuscadorDeManiobras` enseñan la región
      como encabezado, con sus segmentos debajo, de proximal a distal. La
      biblioteca, igual.
    - Es solo presentación: `agruparManiobrasPorSegmento` gana un nivel por
      encima, y los anclajes `#maniobra-<id>` no cambian.
    - Una prueba exige que los 13 nombres de segmento que usa la ingesta tengan
      región.
  - [x] **E1.8b · Orden anatómico de los segmentos.** *Sin objeto (D-157): el orden de proximal a distal sale de la tabla de regiones, no del campo `orden`.* Se fija el `orden` de cada
    segmento en «Material de apoyo → Segmentos anatómicos». Es contenido, no
    código.
  - [ ] **E1.8c · Partir la maniobra del miembro superior.** *Propuesta escrita en `docs/propuestas/PARTICION-DEL-EXAMEN-DEL-MIEMBRO-SUPERIOR.md`; falta que la apruebe Cristóbal y que se aplique desde el panel.*
    - Hoy mezcla los troncos nerviosos con tres signos cubitales, y está en
      «Principios generales».
    - Se prepara una propuesta de partición a partir de la ficha original
      (`data_traumahub/listos/fichas/maniobras/examen-motor-sensitivo-miembro-superior-signos-cubitales.json`).
      Por ejemplo, Froment y Wartenberg en «Muñeca y mano», cada uno en su ficha.
    - La aprueba Cristóbal, y se aplica desde el panel con «Duplicar» y
      recortando.
    - Se revisa con el mismo criterio la otra maniobra de miembro superior que
      hay en «Principios generales».
    - Ojo con D-142: una ficha nueva creada a mano no tiene fila en
      `revisiones`.

**Preguntas**

- ~~E1-Q1~~ y ~~E1-Q2~~: respondidas el 2026-10-07 (ver «Respuestas del dueño»).
- ~~E1-Q3~~: se implementó con el supuesto (el editor edita dentro de la mantención, D-156). Si no se quiere, es una línea en `puedeEditarModulo`.

---

#### E2 · Comentarios dentro del taller anatómico · 1–2 sesiones · hecha en código (2026-10-07) · falta desplegar

**Objetivo.** Comentar una preparación, o una pieza concreta de ella, sin salir
del taller. Los comentarios aparecen también en la bandeja «Comentarios» del
panel, con un enlace que abre esa preparación en el taller.

**Hecho cuando…**
- Un editor deja un comentario sobre la tibia de una preparación.
- Otro lo ve en la pestaña «Comentarios» del taller y en la bandeja del panel.
- Pulsarlo selecciona la tibia y lleva la cámara a la vista guardada.
- Lo resuelve, y el contador baja.

**Decisiones de diseño**

- **Destino del comentario.** `comentarios.coleccion` gana el valor
  `instancias-atlas`. La migración es `ALTER TYPE … ADD VALUE`, y
  `migraciones.test.ts` no la detecta, así que se le añade la comprobación.
- **Pieza concreta.** Campo opcional nuevo `ancla`, de tipo json:
  `{ pieza, punto: [x, y, z], vista }`.
- **Quién comenta.** Editor y administrador, porque el taller es del panel. Lleva
  una regla propia, `creacionDeComentarioEnElTaller`.
  `creacionEnModuloVisible` no sirve: devuelve `false` a toda cuenta con módulos
  restringidos, porque el atlas no es un módulo.
- **Pestañas.** Componente nuevo `src/components/ui/Pestanas.tsx`, con
  `role="tablist"` y flechas del teclado. Divide el panel derecho del taller, que
  hoy es una sola columna, en tres pestañas:
  - «Pieza»: posición y giro, color, rótulos;
  - «Preparación»: ficha, vistas, modelos, preparaciones guardadas;
  - «Comentarios (n)».

  E4 añadirá la cuarta, «Fractura».

**Tareas**

- [x] **E2.1 · Pestañas.** `Pestanas.tsx`, y reorganizar el panel derecho
  (`TallerDeAtlas.tsx` l.2718 en adelante) sin cambiar ningún comportamiento.
  Sin importar `three` de forma estática.
- [x] **E2.2 · Datos y reglas.**
  - Migración del enum y campo `ancla`.
  - Validación: `exigirSlugDeModulo` (`src/lib/validacion.ts`) pasa a
    `exigirDestinoDeComentario`.
  - `crearComentario`, más una acción nueva `listarComentariosDe(coleccion, id)`.
  - Se mantiene el freno de diez comentarios cada diez minutos.
- [x] **E2.3 · La pestaña.**
  - Lista con autor, fecha, estado y texto, y formulario.
  - «Resolver» y «Reabrir» para el editor; «Eliminar» solo para el administrador.
  - «Comentar esta pieza» ancla el comentario a la selección.
  - Pulsar un comentario anclado selecciona la pieza y lleva la cámara a su
    vista.
- [x] **E2.4 · Marcadores en 3D** de los comentarios anclados, apagables.
  Reutilizan el dibujo de los rótulos (D-135).
- [x] **E2.5 · Bandeja del panel.**
  - Título de la preparación en `leerTitulosDeFichas` y filtro «Taller
    anatómico».
  - Enlace `/admin-panel/atlas?preparacion=<id>&comentario=<id>`. Pide algo
    nuevo: que el taller lea esos parámetros y abra esa preparación; hoy
    `admin-panel/atlas/page.tsx` no lee ninguno.
  - El enlace se escribe a mano, así que pasa por `ruta()`.
  - Nombre en el correo a los administradores, y `comentariosPorModulo` en
    Estadísticas.
- [x] **E2.6 · «Cuerpo» no se comenta.** No es una fila de la base (D-152): el
  taller pide guardarlo con nombre primero.
- [x] **E2.7 · Pruebas.**
  - `comentariosDelPanel` y `comentariosYActividad`.
  - `roles.test.ts`: en `instancias-atlas` crea el editor y no el lector.
  - `migraciones.test.ts`: el valor nuevo del enum.
- [x] **E2.8 · Documentación.** Manual y D-nnn.

**Preguntas**

- **E2-Q1 · ¿El residente también comenta las preparaciones** que ve dentro de
  las fichas? En v1, no (D-158). Sigue abierta por si se quiere después.

---

#### E3 · Manipulación directa de piezas y fragmentos · 2 sesiones · hecha en código; falta desplegar

**Por qué hoy es engorroso**, mirado en el código:

- Pinchar y arrastrar sobre el objeto no lo mueve: el clic selecciona y el
  arrastre gira la cámara. Mover pide G o R desde el teclado.
- Las asas (`src/atlas/gizmo.ts`) van en los ejes del mundo, no en los del hueso.
- No hay asa para mover en el plano de la pantalla, ni para girar libremente.
- El pivote de giro es el centro de la caja del trozo, no el foco de la
  fractura.
- En la consola quirúrgica la angulación se gradúa con tres deslizadores
  (`ConsolaQuirurgica.tsx` l.1339–1378).

**Objetivo.** Que funcione como PowerPoint: se pincha la pieza, se arrastra para
moverla, un asa redonda la gira, y los números aparecen al lado mientras se
mueve.

**Hecho cuando…** Con una tibia partida (K), mover el fragmento distal 8 mm y
angularlo 10° de varo se hace con el ratón, sin teclado, y la lectura en
pantalla dice «8 mm lateral · 10° varo». Ctrl + Z lo deshace en un solo paso.

**Decisiones de diseño**

- **Herramienta nueva «Manipular», tecla V.** Es la del puntero en Figma y
  Photoshop, y está libre: el taller ya usa A, B, G, H, I, J, K, M, R, X y Z.
- **El gesto.** Con «Manipular», pulsar sobre una pieza seleccionada y arrastrar
  la mueve en el plano perpendicular a la cámara que pasa por el punto pinchado.
  Es el patrón que ya funciona en `LienzoQuirurgico.tsx` (l.430–498). Pulsar en
  el vacío sigue girando la cámara, y Mayús + arrastre ata el movimiento al eje
  del hueso más próximo al gesto.
- **Asas sobre el objeto.** Una caja orientada con los ejes del hueso y un asa
  redonda para girar sobre el eje de la vista. Ctrl gira en saltos de 5°, y Alt +
  arrastre sobre la pieza gira libremente, tipo trackball.
- **Los ejes del hueso.** Salen de `ejeDelHueso` (`src/lib/planoDeCorte.ts`
  l.223) aplicado a la pieza raíz del fragmento: largo, delante y fuera. El gizmo
  gana un conmutador «Ejes del hueso / del mundo».
- **Pivote en el foco.** Un trozo nacido de un corte gira por omisión sobre el
  centro de la tapa del corte; una pieza entera, sobre su centro. Hoy se usa
  `pivoteDeLaSeleccion` (`VisorAtlas.tsx` l.1089).
- **Lectura clínica en vivo** junto al cursor:
  - el desplazamiento en milímetros: lateral, anteroposterior y axial;
  - la angulación con nombres clínicos: varo/valgo, ante/recurvatum y rotación,
    medida contra el otro fragmento;
  - se reutilizan `medirReduccion` y `anguloTotal` (`src/lib/reduccion.ts`) si
    encajan;
  - evita el bloqueo de cardán de los ángulos de Euler (D-133).
- **Historial.** Un gesto es un paso del historial, como hoy con G y R.
- **Táctil.** Un dedo mueve; dos dedos, la cámara (`gestoTactil`, D-149).

**Tareas**

- [x] **E3.1 · La matemática, sin lienzo y con pruebas,** en `src/atlas/manipular.ts`:
  el arrastre proyectado en el plano de la cámara, el giro con saltos, los ejes
  del hueso para un fragmento y el pivote en el foco.
- [x] **E3.2 · El visor.** En `VisorAtlas.tsx`, el modo `'manipular'` en
  `HerramientaDelVisor` (l.220), conectado a `alBajar`, `alMover` y `alSubir`.
  Sin romper `orbita`, `caja`, `recorte`, `corte`, `rotulo`, `distancia` ni
  `angulo`.
- [x] **E3.3 · Las asas.** En `gizmo.ts`, los ejes locales, el asa de giro y la
  caja orientada. Son las primeras pruebas de `gizmo.ts`, que hoy no tiene
  ninguna.
- [x] **E3.4 · El taller.** El botón y el atajo, la línea en `ATAJOS_DEL_TALLER`,
  y el panel de números (`PanelDeNumeros`) en ejes del hueso con nombres
  clínicos.
- ~~E3.5 · La consola quirúrgica~~. **Fuera del alcance**: lo engorroso era el
  taller (respuesta del dueño, 2026-10-07). Los deslizadores de la consola se
  quedan como están.
- [x] **E3.6 · Comprobación y documentación.** Prueba en el navegador con el
  atlas real, manual y D-nnn.

**Preguntas**

- ~~E3-Q1~~: respondida el 2026-10-07. Era el taller anatómico.

---

#### E4 · Constructor de fracturas AO guiado · 3–4 sesiones · v1 hecha en código; falta A1 y validar con Cristóbal

**Objetivo.** En el taller, una pestaña «Fractura» con un asistente de seis
pasos:

1. «Selecciona un hueso».
2. Segmento.
3. Tipo.
4. Grupo.
5. Porción y extensión.
6. Vista previa y «Fracturar».

El resultado es el hueso partido en los fragmentos de ese patrón, manipulables
con E3, guardado en la preparación y con su código AO a la vista.

**Quién lo usa:** solo editores y administradores, en el taller. El residente no
fractura nada: ve el modelo ya fracturado.

- en la ficha, con el bloque «Preparación anatómica»;
- en el simulador, cuando el caso se exporta.

**Hecho cuando…** Los tres casos guía de E4.1 se construyen en menos de un
minuto cada uno, se guardan, se reabren idénticos y Cristóbal los da por
correctos.

**Horizonte.** Cristóbal pide, en sus notas de voz, llevar al modelo *cada*
patrón que describe AO Surgery Reference. La v1 cubre los huesos largos. Para
que se vea cuánto falta:

- una tabla de cobertura, generada desde `clasificacionAO.ts`, dice qué
  códigos ya tienen patrón y cuáles no;
- se publica en el panel para editores y se resume aquí al cerrar cada versión.

**Alcance de la v1**, recortado para que quepa:

- **Huesos:** los largos. Húmero (1), radio (2R) y cúbito (2U), fémur (3), tibia
  (4) y peroné (4F).
- **Segmentos:** los tres, proximal (1), diáfisis (2) y distal (3).
- **Patrones:** los de diáfisis, completos. En los extremos, solo el tipo A,
  extraarticular. Los tipos B y C de extremo, que son articulares, quedan para la
  v2: su geometría depende de cada articulación.
- **Fuera de la v1:** clavícula (15), escápula (14), rótula (34), maléolos (44),
  columna, pelvis, mano (7x; las capturas de la app eran de metacarpianos, 77) y
  pie (8x).

**Referencia: Compendio AO/OTA 2018** (Meinberg *et al.*, *J Orthop Trauma*
2018;32 Supl. 1). Para la diáfisis:

| Tipo | Grupos |
|---|---|
| A · simple | A1 espiroidea · A2 oblicua (≥ 30°) · A3 transversa (< 30°) |
| B · en cuña | B2 cuña íntegra · B3 cuña fragmentada |
| C · multifragmentaria | C2 segmentaria íntegra · C3 segmentaria fragmentada |

En los extremos: A extraarticular, B articular parcial, C articular completa.

**Ojo:** el catálogo sembrado (`scripts/caso-de-prueba.ts` l.49–55) sigue la
edición de 2007: tiene B1 y C1, y le faltan B3 y C3. Hay que alinearlo, y lo
valida Cristóbal (E4-Q1).

**Los segmentos se calculan con la regla del cuadrado de Heim.** El segmento de
extremo es un cuadrado cuyo lado es la anchura máxima de la epífisis. Se obtiene
con `ejeDelHueso` y el perfil de anchura del hueso a lo largo de ese eje, en cada
extremo. La diáfisis es lo que queda en medio.

**Diseño de datos**

- **`src/atlas/clasificacionAO.ts`.** Tabla pura de huesos, segmentos, tipos y
  grupos. Cada entrada lleva el nombre en español, una descripción breve
  escrita aquí y el patrón geométrico que le corresponde.
- **`src/atlas/huesosAO.ts`.** Traduce cada pieza del atlas a su hueso AO y su
  lado (derecho / izquierdo).
  - **v1:** húmero `FJ3368` / `FJ3262`, radio `FJ3349` / `FJ3277`, cúbito
    `FJ3391` / `FJ3286`, fémur `FJ3365` / `FJ3259`, tibia `FJ3387` / `FJ3282`,
    peroné `FJ3366` / `FJ3260`.
  - **Más adelante:** clavícula `FJ3362` / `FJ3237`, escápula `FJ3384` /
    `FJ3279`, rótula `FJ3381` / `FJ3275`, metacarpianos `FJ3350`–`FJ3358` /
    `FJ3240`–`FJ3252` (77.1 a 77.5), astrágalo `FJ3385` / `FJ3280` (81) y
    calcáneo `FJ3360` / `FJ3256` (82).
  - Una prueba comprueba que cada identificador existe en el catálogo real y es
    un hueso.
- **La receta en la preparación.** Campo nuevo
  `ContenidoDeInstancia.fracturas?: [{ pieza, codigo: '42-A2', segmento, tipo,
  grupo, porcion: { centro, extension }, inclinacion, giro, semilla }]`.
  - Es json, así que no pide migración.
  - Se guardan además los cortes que genera. La receta permite reeditar: pasar
    a 42-B2 borra sus cortes y los regenera.
  - Se valida en el servidor con `fracturasValidas`, en `src/atlas/catalogo.ts`.
- **El generador, puro y probado:** `src/atlas/patronesDeFractura.ts` convierte
  una receta en una lista de `CorteDePieza` encadenados (`#a`, `#b`…), sin
  `three`:

  | Grupo | Cómo se corta |
  |---|---|
  | A3 transversa | Un plano normal al eje, con 0–15° de inclinación |
  | A2 oblicua | Un plano a 30–60°, en la cara elegida (giro) |
  | A1 espiroidea | Una superficie helicoidal, que no es un plano: ver R1 |
  | B2 cuña | Una región convexa de dos planos (`otrosPlanos`) que aísla un triángulo de cortical por un lado, y un plano que separa proximal y distal por el vértice de la cuña |
  | B3 | B2 más uno o dos cortes dentro de la cuña |
  | C2 segmentaria | Dos cortes, transversos u oblicuos, separados por la extensión elegida: tres fragmentos |
  | C3 | C2 más cortes dentro del fragmento intermedio |
  | Extremo tipo A | Como en la diáfisis, pero confinado al segmento de extremo y sin entrar en la superficie articular |

  Los topes vigentes alcanzan: 4 planos por corte, 9 niveles y 200 cortes
  (`src/atlas/formato.ts`).
- **Refinar la malla antes de cortar.** Los huesos del atlas son mallas pobres:
  el fémur tiene 480 vértices, la tibia 334 y el húmero 794. Una espiral o una
  cuña sobre eso se ve facetada. Antes de cortar, `refinarZona`
  (`src/lib/osteotomia.ts`) subdivide los triángulos de la zona de la fractura
  hasta unos 2 mm de arista. Lo hace solo en memoria y de forma determinista,
  para que el corte salga igual al reabrir.

**La interfaz.** Es la pestaña «Fractura» y depende de E2.1.

- **Tarjetas.** Una por opción, como en la app de AO, pero con pictogramas
  propios: SVG sencillos dibujados aquí.
- **Paso 1, elegir el hueso.**
  - El clic solo selecciona huesos que estén en la tabla.
  - La piel y el músculo dejan pasar el rayo.
  - El hueso elegido se resalta, se encuadra, y se ofrece «Solo esto» para
    apagar lo de alrededor.
- **Paso 5, la porción.**
  - Una banda translúcida sobre el hueso marca dónde cae la fractura.
  - Dos tiradores, centro y extensión, se mueven solo dentro del segmento.
  - Vista previa con los discos de corte (`pintarElCorte`).
- **«Fracturar».**
  - Crea los cortes en una sola entrada del historial.
  - Deja una etiqueta flotante con el código, por ejemplo «42-A2 · tibia
    derecha, diáfisis, oblicua».
- **Exportar al simulador.**
  - En la v1 sigue admitiendo un solo plano (A2 y A3); el resto avisa.
  - Los casos con más de un fragmento son v2: hoy el simulador mueve solo uno.

**Tareas**

- [ ] **E4.1 · Validar con Cristóbal** (pendiente: se construyó con la tabla propuesta) la tabla (E4-Q1) y elegir tres casos guía,
  por ejemplo 42-A2, 32-B2 y 12-C2.
- [x] **E4.2 · Las tablas.** *(Hecho: `clasificacionAO.ts` y `huesosAO.ts`. Falta alinear el catálogo `clasificaciones-ao`, que es contenido y lo valida Cristóbal.)*
  - `clasificacionAO.ts` y `huesosAO.ts`, con pruebas.
  - Alinear el catálogo `clasificaciones-ao`: añadir B3 y C3, y marcar B1 y C1
    como de 2007. Es un cambio de contenido, no de esquema.
- [x] **E4.3 · Segmentos por la regla de Heim.** Perfil de anchura, con pruebas
  sobre la tibia y el fémur reales.
- [x] **E4.4 · `patronesDeFractura.ts`** (A2, A3, B2, B3, C2 y C3). Las pruebas
  comprueban tres cosas:
  - el número de fragmentos;
  - que todos quedan cerrados, sin agujeros;
  - que el volumen total se conserva con un ±1 %.
- [ ] **E4.5 · `refinarZona`**, con pruebas. *(No hace falta con planos; solo con la espiroidea.)*
- [ ] **E4.6 · A1 espiroidea** (riesgo R1). *(Pendiente: figura en la tabla como «Próximamente».)*
- [x] **E4.7 · Formato.** `fracturas` en el contenido, validación en el servidor,
  guardar y abrir.
- [x] **E4.8 · La pestaña «Fractura»** *(sin el filtro del clic)*.
- [x] **E4.10 · Lo que ve el residente** *(los fragmentos, el rótulo y la línea con el código; falta encuadrar el bloque sobre la fractura)*.
  - `VisorInstancia`, en solo lectura, enseña los fragmentos, sus desplazamientos
    y la etiqueta AO.
  - El residente no puede moverlos.
  - El bloque de la ficha encuadra la fractura y no el cuerpo entero.
- [x] **E4.9 · Comprobación y documentación.** *(Falta la tabla de «qué se puede» de `docs/COMO-SUBIR-UN-MODELO.md`.)*
  - El manual.
  - La tabla de «qué se puede» en `docs/COMO-SUBIR-UN-MODELO.md` (l.133–138), que
    hoy dice que A1, B y C no se pueden.
  - La D-nnn.
  - Una prueba en el navegador de los tres casos guía.

**Riesgos**

- **R1 · La espiroidea.** Su superficie no es un plano.
  - **Opción A, la preferida: cortar por una superficie implícita**, un
    helicoide, en `osteotomia.ts`.
    1. Se clasifican los vértices por el signo de la función.
    2. Se parten los triángulos que la cruzan.
    3. Se tapa proyectando el contorno al dominio (θ, r) del helicoide. Como el
       helicoide es una superficie reglada, se puede triangular en 2D con
       `ShapeUtils` y devolver a 3D.
    4. En el formato, `CorteDePieza` gana un campo opcional `superficie: { tipo:
       'helicoide', … }`, con su validación.
  - **Opción B, de reserva:** aproximarla con tres o cuatro planos encadenados,
    en escalera.
  - La exportación al simulador no la admite en la v1.
- **R2 · Rendimiento.** Al abrir una preparación, cada corte rehace sus mallas, y
  varias fracturas con refinado pueden tardar. Se mide con tres fracturas; si
  pasa de un segundo, se cachea.
- **R3 · Fidelidad clínica.** Los patrones son esquemáticos. Los valida Cristóbal
  caso a caso.

**Preguntas**

- **E4-Q1 · La tabla de grupos y la edición 2018**, para validarla.
- ~~E4-Q2~~: respondida el 2026-10-07. Solo en el taller; el residente ve el
  modelo ya fracturado.
- **E4-Q3 · Qué huesos van primero.** Se mantiene la propuesta, que no se
  discutió: huesos largos primero, y la mano (77, metacarpianos) en la v2.

---

#### E5 · Piel e instrumental · 2–3 sesiones · piel hecha en parte

La parte sin código, conseguir los modelos 3D, puede empezar ya.

**Hecho:** la piel vuelve al atlas (D-155, 2026-10-07).

**La piel: lo que falta**

- [x] **E5.1 · Interruptor rápido «Piel»** *(hecho, D-162)* en la barra del taller: encender y
  apagar, con transparencia del 30 % por omisión, para que no tape todo al abrir
  «Cuerpo». Además, la piel se excluye del marco y del clic salvo que se la
  quiera seleccionar. El marco elige por centros (D-126), y uno sobre el abdomen
  se la lleva.
- [ ] **E5.2 · La preparación «cuerpo»** (id 1): encenderle la piel desde el
  taller. Lo hace el dueño (ver D-155).
- [ ] **E5.3 · La consola quirúrgica.** Comprobar que un caso exportado de nuevo
  trae su piel recortada (D-096) y que el paso de la incisión la usa.

**El instrumental en la escena**

- [ ] **E5.4 · Modelar el instrumental.** Lo modela el asistente (respuesta del
  dueño, 2026-10-07), con Blender. La 5.2 está instalada en `faraday`.
  - [ ] **E5.4a · Un guion de Python por instrumento**, en
    `scripts/instrumental/<nombre>.py`.
    - Es paramétrico, con las medidas reales en milímetros.
    - Se ejecuta con `blender --background --python` y exporta un `.glb`.
    - Lleva un objeto por cada parte que se mueve, con nombres en español y sin
      tildes, y materiales PBR de acero y de plástico.
    - Cada `.glb` pesa como mucho 1 MB y tiene como mucho 20.000 triángulos.
    - El origen va en el punto de agarre, o en la punta si es lo que se usa.
    - Los guiones se versionan, para poder rehacer cualquier modelo. Los `.glb`
      no: salen a `ejemplos/instrumental/`, que git ignora, y se suben a la
      plataforma.
    - Como son nuestros, no hay licencia de terceros que anotar.
  - [ ] **E5.4b · Una vista previa en PNG** de cada uno, para que Cristóbal lo
    valide antes de subirlo.
  - [ ] **E5.4c · El juego mínimo.** Las medidas son de referencia y aproximadas:
    las corrige Cristóbal al validar.

    | Instrumento | Medidas de referencia | Partes |
    |---|---|---|
    | Bisturí (mango n.º 4, hoja n.º 22) | 160 mm | mango, hoja |
    | Separador de Farabeuf | 120–150 mm, palas de 20 y 25 mm | una pieza |
    | Separador de Hohmann | 240 mm, punta de 18 mm | una pieza |
    | Pinza de reducción con puntas (Weber) | 180 mm | dos ramas, cremallera |
    | Pinza de Verbrugge | 220 mm | dos ramas |
    | Motor quirúrgico | unos 200 mm, cuerpo de pistola | cuerpo, gatillo, portabrocas |
    | Broca | Ø 2,5 y 3,2 mm × 110 mm | una pieza |
    | Guía de broca 3,5 / 2,5 | 120 mm | una pieza |
    | Medidor de profundidad | 150 mm | cuerpo, varilla con gancho |
    | Atornillador hexagonal 3,5 | 200 mm | mango, vástago |
    | Tornillo cortical 3,5 | Ø 3,5 × 30 mm, cabeza de 6 mm | una pieza |
    | Placa LCP 3,5 de 8 agujeros | unos 120 × 11 × 3,3 mm | una pieza |
    | Aguja de Kirschner | Ø 1,6 × 150 mm | una pieza |
    | Martillo | unos 250 mm | cabeza, mango |

    En la v1 las piezas son rígidas. Que las pinzas abran y cierren es v2.
- [ ] **E5.5 · Subirlos** a «Modelos 3D» y enlazarlos en el catálogo
  «Instrumental». El campo `modelo` ya existe (migración `20260912_212708`).
- [ ] **E5.6 · En el taller.**
  - Campo nuevo `ContenidoDeInstancia.objetos?: [{ modelo, mover, girar,
    escala }]`. Es json y no pide migración; se valida con `objetosValidos`.
  - «Añadir instrumento» desde el catálogo.
  - El instrumento se manipula con E3, se guarda con la preparación y se ve en
    las fichas (`VisorInstancia`).
- [ ] **E5.7 · En la consola quirúrgica.**
  - El instrumento elegido en la bandeja aparece en la escena. Hoy solo se ve
    en el visor pequeño de `ConsolaQuirurgica.tsx` (l.1475–1499).
  - El bisturí sigue el trazo de la incisión.
  - La pinza aparece sobre el foco al reducir.
  - El implante (placa y tornillos) aparece en su paso; el papel `implante` ya
    empieza oculto.
- [ ] **E5.8 · Pruebas, manual y D-nnn.**

**Preguntas**

- ~~E5-Q1~~: respondida el 2026-10-07. Lo modela el asistente (E5.4).
- **E5-Q2 · ¿El instrumental va también en las fichas** o solo en el simulador?

---

#### E6 · El manejo AO paso a paso, sobre el modelo · 3–4 sesiones · pendiente

**De dónde sale:** las notas de voz de Cristóbal (ver «De dónde sale»).

**Objetivo.** Que el módulo 03, Técnica AO, se recorra como AO Surgery
Reference, en cinco pasos:

1. **Esqueleto:** se pincha el hueso.
2. **Segmento.**
3. **Diagnóstico:** la clasificación, en tarjetas por tipo y grupo.
4. **Indicaciones:** las alternativas de manejo de ese código, en tarjetas, cada
   una con su nivel de destreza y de equipamiento (los puntos de la app de AO).
5. **Tratamiento:** el paso a paso de la técnica elegida —preparación del
   paciente, abordaje, reducción, fijación, comprobación y cuidados
   postoperatorios—, **hecho sobre el modelo fracturado**. El residente avanza
   paso a paso y ve moverse los fragmentos y aparecer los implantes y los
   instrumentos.

Además, el editor graba ese paso a paso en el taller, y queda como demostración
que se puede reproducir y, si se quiere, exportar a vídeo.

**Hecho cuando…** Un residente entra en Técnica AO y llega en cinco clics a un
caso guía, por ejemplo 42-A2 → «Clavo endomedular». Ve sus pasos con el modelo
cambiando en cada uno, y puede ir hacia atrás y hacia delante. El editor lo grabó
en el taller en menos de media hora.

**Lo que hay hoy, y que condiciona el diseño**

- **La colección** `casos-ao` (`src/collections/CasosAO.ts`) tiene `titulo`,
  `codigo` (texto libre), `procedimiento` y `pasos[]`. Cada paso lleva
  `titulo`, `descripcion`, `principio`, `nota` y `modelo` (una relación con
  un `.glb`).
- **Las 711 fichas importadas (D-144)** salen de libros de técnica quirúrgica
  (*Master Techniques*, *Operative Techniques*…):
  - muchas no son de fracturas: oncología, reconstrucción, partes blandas;
  - 97 tienen «fractura» en el título;
  - **solo 19 traen código AO**, y cada una a su manera: «43-C2 / 43-C3», «AO A2,
    A3, C1, C2», «42-A / 42-B / 42-C», o clasificaciones que no son AO, como
    «Mason II-III» o «Salter-Harris».

  Un navegador por clasificación necesita códigos normalizados: ver E6.3.
- **El vocabulario** sale de `src/atlas/clasificacionAO.ts` (E4.2). Es una sola
  tabla para fracturar en el taller y para navegar en Técnica AO.

**Decisiones de diseño**

- **El caso AO gana campos estructurados.** Piden migración: columnas y enums.
  - `codigosAO`: uno o varios códigos validados contra `clasificacionAO.ts`,
    al nivel que se sepa (`42`, `42-A` o `42-A2`).
  - `tratamiento`: select con conservador, tornillos interfragmentarios, placa,
    clavo endomedular, tutor externo, agujas de Kirschner, artroplastia y otro.
  - `destreza` y `equipamiento`: de 1 a 3.
  - `indicaciones`: texto rico.
  - En cada paso: `fase` (preparación, abordaje, reducción, fijación,
    comprobación o postoperatorio).
  - Las fichas que no son de fracturas no llevan código y siguen accesibles por
    «Ver todas» y por región.
- **El modelo de cada caso.** El caso apunta a una preparación del taller (una
  relación con `instancias-atlas`) que tiene el hueso fracturado (E4). Cada paso
  del caso apunta a una **escena** de esa preparación.
- **Escenas, no vídeo, como formato principal.** Una escena es una instantánea
  del estado 3D:
  - qué piezas y trozos se ven;
  - dónde está cada fragmento;
  - qué implantes e instrumentos hay y dónde (`objetos` de E5);
  - los rótulos y la cámara.

  Se guardan en la preparación, en `ContenidoDeInstancia.escenas?: [{ id,
  titulo, estado }]`, que es json y no pide migración. Así ocupan poco, se
  pueden corregir paso a paso y el residente puede girar la cámara en cualquier
  paso.
- **El reproductor.** `VisorInstancia` gana una barra «Paso 3 de 8», con
  anterior y siguiente. De una escena a otra, los fragmentos se interpolan en
  600 ms (posición lineal, giro por *slerp*) y lo que aparece o desaparece se
  funde.
- **El vídeo es opcional.** Se exporta con `MediaRecorder` sobre el lienzo, a
  WebM, y se sube a «Medios», que admite hasta 50 MB. Sirve para mandarlo por
  WhatsApp o proyectarlo. No reemplaza a las escenas.
- **Los textos de AO no se copian** (regla general). Las indicaciones y los pasos
  los escribe el equipo. Cada caso puede llevar un enlace a su página de AO
  Surgery Reference como referencia.

**Tareas**

- [ ] **E6.1 · Esquema.**
  - Campos nuevos en `CasosAO.ts` y en `src/admin/esquema.ts` (los ata
    `esquema.test.ts`).
  - Migración `casos_ao_estructurados` y tipos.
  - Validación de `codigosAO` contra `clasificacionAO.ts`.
- [ ] **E6.2 · Escenas en el taller.**
  - Pestaña «Pasos», o sección dentro de «Preparación», con «Capturar escena»,
    «Actualizar escena», reordenar, renombrar y eliminar.
  - Validación `escenasValidas` en `src/atlas/catalogo.ts`.
  - Tope: 40 escenas por preparación.
- [ ] **E6.3 · Normalizar los códigos de las fichas existentes.**
  - Un guion propone `codigosAO` a partir del texto: el código escrito, el
    título y el procedimiento. **No escribe nada**: genera una planilla para
    revisar.
  - Lo aprobado se aplica con un segundo guion, y queda en el registro.
  - Las clasificaciones que no son AO (Mason, Salter-Harris…) se anotan aparte,
    sin forzarlas.
- [ ] **E6.4 · El navegador de Técnica AO.**
  - `/tecnica-ao` pasa a los cinco pasos, con una barra de pasos como la de la
    app.
  - **Esqueleto:** la figura de la portada (D-124) con zonas que se pinchan, o un
    esqueleto en SVG propio.
  - **Diagnóstico e Indicaciones:** tarjetas con pictogramas propios y el número
    de casos que hay en cada una.
  - El listado de siempre queda en «Ver todas».
  - Las guardias D-102 y la mantención (E1) siguen valiendo.
- [ ] **E6.5 · El reproductor**, en `VisorInstancia`, con las transiciones. Lo
  usan la ficha del caso y el bloque «Preparación anatómica».
- [ ] **E6.6 · La ficha del caso.** Cada paso del texto lleva al lado su escena,
  y cambiar de paso cambia el modelo.
- [ ] **E6.7 · Exportar a vídeo** (WebM), desde el taller.
- [ ] **E6.8 · Un caso guía completo, hecho de punta a punta con Cristóbal**,
  por ejemplo 42-A2 con clavo endomedular: fracturar (E4), reducir (E3), poner el
  implante (E5) y capturar las escenas.
- [ ] **E6.9 · Pruebas, manual y D-nnn.**
  - Esquema, migraciones y validación de escenas.
  - La interpolación, sin lienzo.
  - El navegador: guardias y mantención.

**Para una v2, fuera de esta etapa:** la lista de material. Saldría de las
escenas, porque cada implante colocado tiene sus medidas:

- el largo de cada tornillo, medido entre las corticales a lo largo de su
  trayecto (la herramienta «Medir», D-135);
- la placa y sus agujeros.

Daría una lista para pedir a la casa comercial. Cristóbal: «ahí nos pasaríamos».

**Preguntas**

- **E6-Q1 · ¿El navegador por clasificación reemplaza al listado como entrada de
  Técnica AO,** o convive con él? Se propone que lo reemplace y que el listado
  quede en «Ver todas».
- **E6-Q2 · ¿Quién graba las escenas** de cada caso: Cristóbal, los editores, o
  el asistente bajo sus indicaciones?
- **E6-Q3 · ¿Cuántos casos guía** antes de abrirlo a los residentes?

---

#### E7 · Módulo 06, planificación con DICOM: «Próximamente» y buzón de requisitos · 1–2 sesiones · hecha en código; falta desplegar

**De dónde sale:** el pedido 7 del dueño y la última nota de voz de Cristóbal:
«poder meterle los DICOM y que te reconstruya la fractura exacta que vas a
trabajar, y te sirva para planificar».

**Objetivo.** Un módulo 06, «Planificación con imágenes del paciente», que hoy
solo se anuncia:

- se ve como una sexta tarjeta con la insignia **«Próximamente»**;
- tiene una página con la descripción detallada de lo que va a ser;
- los editores dejan requisitos y propuestas de cómo les gustaría, que se votan,
  se comentan y el administrador acepta o descarta.

Cuando se decida construirlo de verdad, esos requisitos son la base del P-002.

**Hecho cuando…**

- La portada, con y sin sesión, enseña la sexta tarjeta con «Próximamente».
- Pulsarla abre la descripción.
- Un editor propone un requisito y otro lo vota.
- El administrador lo marca «aceptado» con una respuesta, y el autor recibe
  aviso.
- Un residente ve la descripción, pero no el buzón.

**Decisiones de diseño**

- **Un módulo anunciado no es un módulo de verdad.** No entra en
  `SLUGS_DE_MODULOS`. Esa lista manda en los permisos, los enums de la base y
  cinco copias más (ver el informe de E1), y no hay contenido que proteger. Va
  en una lista aparte, `MODULOS_ANUNCIADOS` (`src/lib/modulosAnunciados.ts`):
  número, slug, nombre, ruta, resumen y estado `proximamente`.
- **Dónde se ve.**
  - Portada con sesión: sexta tarjeta, atenuada, con la insignia y sin
    contadores de lectura.
  - Portada sin sesión: en la tira de módulos, con la insignia.
  - El texto «Cinco módulos» pasa a decir los que haya.
  - En la barra superior, no: se reserva para lo que ya se puede usar.
- **La página** `/planificacion`: la ven todos los que tienen sesión. El texto lo
  revisa Cristóbal (ver «Lo que va a ser», más abajo).
- **El buzón de requisitos.** Colección nueva `requisitos`; pide migración.
  - Campos: `titulo` (hasta 120), `descripcion` (hasta 4.000), `modulo` (un
    select, de momento solo `planificacion`, preparado para que otros módulos
    tengan el suyo), `autor` (fijado al crear), `estado`, `respuesta` (texto
    del administrador) y `votos` (relación múltiple con `usuarios`).
  - Estados: propuesto, en estudio, aceptado, hecho y descartado.
  - Acceso:
    - leer y crear: editor y administrador;
    - el autor edita título y descripción mientras esté «propuesto»;
    - estado y respuesta, solo el administrador;
    - borrar, solo el administrador;
    - el lector, nada.
- **Avisos.** Correo a los administradores por cada requisito nuevo, y al autor
  cuando cambia el estado. Mismo gancho que los comentarios, y el mismo freno:
  diez cada diez minutos.

**Lo que va a ser** (el texto de la página; lo revisa Cristóbal):

1. **Cargar el estudio.** Una tomografía en DICOM. La resonancia, no, en la v1.
   - Se lee en el navegador.
   - Se **anonimiza en el navegador antes de subir**: se borran nombre, RUT e
     identificadores, fechas, institución y médico, siguiendo el perfil básico de
     confidencialidad de DICOM (PS3.15).
   - Nada que identifique al paciente sale del computador.
2. **Reconstruir.**
   - El hueso se segmenta en la tomografía: umbral en unidades Hounsfield con
     crecimiento de regiones, o un modelo entrenado como TotalSegmentator, cuya
     licencia hay que revisar antes (ver Q-007).
   - Con *marching cubes* se obtiene una malla por hueso, suavizada y reducida a
     5 MB.
3. **Separar los fragmentos.** Cada pieza ósea suelta es un fragmento.
   - El editor los nombra y confirma.
   - Propone su código AO con el mismo asistente de E4.
4. **Llevarlo al taller.** La fractura del paciente se abre en el taller como
   cualquier preparación: se reduce con E3, se ponen implantes con E5 y se graba
   el paso a paso con E6.
5. **Planificar.**
   - Reducción virtual.
   - Implante elegido.
   - Largo de cada tornillo y lista de material (la v2 de E6).
   - Un resumen en PDF para el pabellón.
6. **Conservar poco.** El estudio y su reconstrucción se borran solos a los N
   días. Solo los ven su autor y los administradores.

**Lo que no va a ser:** no diagnostica, no reemplaza el criterio del cirujano y
no se usa con estudios sin anonimizar.

**Antes del P-002 hay que decidir dos cosas**, y la página lo dice:

- **Docente o clínico.** Si la plataforma se usa para decidir una cirugía real
  de un paciente concreto, puede pasar a considerarse software de uso médico, con
  exigencias regulatorias. La v1 propuesta es **docente**, con estudios
  anonimizados.
- **Los datos de salud son datos sensibles.** Hace falta una revisión legal antes
  de aceptar un solo estudio real: consentimiento, y comité de ética si son del
  hospital (Q-005, Q-007).

**Capacidad: por confirmar.** La segmentación pide GPU. En `ved` hay rastros de
CUDA (`paginas/16_cuda_gui_nsight.sh`) y del grupo `ollama`. Hay que comprobar
qué tarjeta tiene y cuánta memoria.

**Tareas**

- [x] **E7.1 · `MODULOS_ANUNCIADOS`,** la sexta tarjeta en las dos portadas y el
  texto «Cinco módulos». La insignia es la de E1, con otro texto.
- [x] **E7.2 · La página `/planificacion`**, con «Lo que va a ser», «Lo que no va
  a ser» y «Antes de construirlo». Con su guardia de sesión, y cualquier enlace
  escrito a mano pasa por `ruta()`.
- [x] **E7.3 · La colección `requisitos`.** *(Sin esquema en el panel: se gestiona desde la propia página.)*
  - Acceso y migración.
  - `CLASE_DE` y fábrica en `roles.test.ts`.
  - Su esquema en el panel, si se edita desde ahí.
- [x] **E7.4 · El buzón en la página, solo para editores y administradores.**
  - Lista ordenada por votos.
  - «+1».
  - «Proponer un requisito».
  - Insignias de estado.
  - El administrador cambia el estado y responde ahí mismo.
- [x] **E7.5 · Avisos por correo** y su freno.
- [x] **E7.6 · Panel.** Contador de requisitos nuevos en «Resumen», y una línea
  en el registro (D-145).
- [x] **E7.7 · Pruebas.**
  - `roles.test.ts`: el editor crea y vota; el lector no ve nada; el autor no
    cambia el estado.
  - `panelPorRol.test.ts` y migraciones.
  - Que la portada enseña seis tarjetas y que la sexta no tiene contadores.
- [x] **E7.8 · Manual y D-nnn** (D-163). La pregunta de fondo ya está en la sección 4 como
  Q-009 (2026-10-07); al cerrar la etapa, se anota ahí lo que se haya decidido.

**Preguntas**

- **E7-Q1 · El nombre del módulo.** «Planificación con imágenes del paciente» es
  una propuesta. ¿O «Planificación quirúrgica», o «Del DICOM al pabellón»?
- **E7-Q2 · ¿Los residentes ven la tarjeta «Próximamente»,** o solo los editores
  hasta que haya fecha? Se propone que la vean: crea expectativa y no cuesta
  nada.

---

#### Cómo retomarlo en otra sesión

1. Leer este P-001 entero y las D-nnn que enlaza.
2. `git log --oneline --grep "P-001"` dice qué tareas ya se hicieron.
3. Seguir por la primera casilla sin marcar de la etapa en curso. Si una
   pregunta de la etapa sigue abierta, hacer antes las tareas que no dependen de
   ella.
4. Al terminar una tarea, marcar su casilla con el commit. Al terminar una etapa,
   cambiar su estado aquí y en la tabla de abajo, y escribir su D-nnn.

#### Estado

| Etapa | Estado | Sesiones | Decisiones |
|---|---|---|---|
| E1 · Módulos en mantención | hecha en código; falta E1.8c (contenido) y desplegar | 1–2 | D-156, D-157 |
| E2 · Comentarios en el taller | hecha en código; falta desplegar | 1–2 | D-158 |
| E3 · Manipulación directa | hecha en código; falta desplegar | 2 | D-160 |
| E4 · Fracturas AO | v1 hecha en código (sin A1 ni encuadre en la ficha); falta validar con Cristóbal | 3–4 | D-161 |
| E5 · Piel e instrumental | piel hecha (D-155), ajustada (D-159) y con interruptor (D-162); instrumental pendiente | 2–3 | D-155, D-159, D-162 |
| E6 · Manejo AO paso a paso | pendiente | 3–4 | — |
| E7 · Módulo 06 DICOM: anuncio y buzón | hecha en código (sin comentarios en los requisitos); falta desplegar | 1–2 | D-163 |

---

## 6. Convenciones de esta bitácora

- Cada decisión entra como `D-nnn` con contexto y consecuencia, no solo con el
  resultado. Dentro de tres meses la consecuencia es lo único que sirve.
- Cada observación entra como `O-nnn` con dónde se ve, no solo qué pasa.
- El trabajo de varias sesiones entra como `P-nnn` en la sección 5, con sus
  tareas y casillas, para poder retomarlo sin la conversación que lo originó.
- Las entradas no se borran. Si una decisión se revierte, se marca **superada**
  y se enlaza la nueva.
- Las fechas van en formato absoluto (2026-08-28), nunca "la semana pasada".
- Lo que se decide en conversación y no queda aquí, no se decidió.
