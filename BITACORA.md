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
en contenedores. **Nada es visible sin sesión** y las cuentas las crea y las
activa un administrador (D-020).

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

### D-020 · 2026-08-28 · vigente · corregida el 2026-09-10 (ver D-053)
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

### D-040 · 2026-09-06 · vigente
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


### D-060 · 2026-09-12 · vigente
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


### D-075 · 2026-09-13 · vigente
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
