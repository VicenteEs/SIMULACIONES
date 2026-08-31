# Bitácora — Plataforma docente de traumatología

Registro de decisiones y observaciones del proyecto. Una entrada por decisión,
una por observación. No se borran entradas: se marcan como superadas y se
enlaza la que las reemplaza.

- **Archivo del prototipo:** `prototipo-traumatologia_4.html` (único archivo, 2.732 líneas, 242 KB)
- **Inicio de la bitácora:** 2026-08-28

---

## 1. Qué es esto (lectura del estado actual)

Prototipo navegable de una plataforma docente de traumatología, en un solo
archivo HTML autocontenido: sin backend, sin dependencias externas, sin datos de
pacientes. Todo el contenido clínico está escrito dentro del archivo y todos los
gráficos son SVG generados por JavaScript. Se abre con doble clic y funciona sin
conexión.

**Público declarado:** residentes, traumatólogos y kinesiólogos.

### Los cinco módulos

| # | Módulo | Fase | Qué hace hoy en el prototipo |
|---|---|---|---|
| 01 | Biblioteca de patologías | MVP | Fichas por segmento con 6 pestañas: Definición, Mecanismo, Clasificación, Evaluación, Manejo, Rehabilitación |
| 02 | Examen físico | MVP | Mapa corporal clicable → maniobras por segmento (objetivo, técnica, positivo, nota) |
| 03 | Técnica AO en 3D | MVP | 8 pasos quirúrgicos con el principio AO de cada gesto, sobre esquema SVG animado |
| 04 | Simula tu cirugía | Intermedia | Pabellón → zoom al campo → 12 pasos con instrumental, fuerza en newtons y capas de transparencia |
| 05 | Fractura IA | Tardía | Carga simulada de DICOM → clasificación AO/OTA propuesta → opciones de manejo con pros y contras |

### La idea de fondo, tal como la leo

Los cuatro primeros módulos son la cadena completa de una decisión clínica:
**estudio → exploración → técnica → ejecución**. El quinto cierra el circuito por
el lado de la imagen. La biblioteca y el examen físico son el contenido que
alimenta a los demás; el simulador y la IA son lo que diferencia la plataforma
de un libro digital.

La pestaña de **Rehabilitación** en cada ficha no es un anexo: es la puerta que
abre el producto al kinesiólogo y amplía el público sin duplicar el contenido
base. El propio texto del prototipo lo dice explícitamente (`rehabNote`).

### Estado real de cobertura del contenido

| Elemento | Completo | Total declarado |
|---|---|---|
| Fichas de patología | 4 | 13 |
| Animaciones de mecanismo | 4 | 13 |
| Segmentos con examen físico | 7 | 8 (falta fémur) |
| Casos AO paso a paso | 1 | — |
| Cirugías simulables | 1 | 3 |
| Casos de IA precargados | 2 | — |

Las cuatro fichas completas son: fractura de diáfisis femoral (32), fractura de
radio distal (23), lesión del LCA, luxación glenohumeral (GH). Están escritas a
un nivel de detalle alto y bilingüe. Las nueve restantes existen solo como
tarjeta con título y están deshabilitadas.

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

### D-012 · 2026-08-28 · vigente · supera a Q-002
**Se redacta sólo en español; los campos quedan traducibles desde el inicio.**
Payload permite marcar los campos como localizables sin poblarlos, de modo que
el inglés se añade cuando exista tracción y sin rehacer la estructura de datos.
Consecuencia: se detiene la duplicación del costo de redacción, que era el
mayor costo oculto. El contenido inglés ya escrito en las cuatro fichas
completas se conserva y se carga en la migración; no se descarta.

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

### D-015 · 2026-08-28 · vigente
**Publicar no reescribe la pantalla de quien está leyendo.**
Al publicar se incrementa la versión del contenido, Postgres emite `NOTIFY` y
el servidor lo reenvía por SSE a los navegadores conectados, que muestran un
aviso discreto de contenido actualizado con opción de recargar. La
actualización instantánea queda reservada a la vista previa del administrador.
*Por qué:* a un residente al que se le mueve el texto a media lectura le parece
que la plataforma falla.
*Aclaración registrada:* el disparador es el botón Publicar del CMS, no un push
al repositorio. El repositorio guarda código; el contenido vive en base de datos.

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

### D-020 · 2026-08-28 · vigente
**Nada es visible sin sesión, y las cuentas las activa el administrador.**
No hay registro abierto ni contenido público: toda lectura exige usuario
autenticado y con la cuenta marcada como activa. Se implementa en tres capas que
deben coincidir —control de acceso por colección en el CMS, middleware que
redirige al inicio de sesión, y comprobación en cada ruta de API—, porque
proteger sólo la interfaz deja la API abierta. Consecuencia grata: la plataforma
queda fuera del alcance de buscadores mientras se construye, y el asunto de
datos personales se reduce al mínimo.

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

### D-036 · 2026-08-31 · vigente
**El respaldo diario se programa solo al desplegar.**
`scripts/deploy.sh` inscribe en cron una ejecución a las 03:00 de
`scripts/respaldar.sh`, que vuelca base y archivos subidos, descarta lo anterior
a treinta días y aborta si el volcado sale sospechosamente pequeño.
`scripts/restaurar.sh` hace el camino inverso, pero exige escribir RESTAURAR y
respalda el estado actual antes de sobrescribir nada.
*Probado de verdad:* el respaldo se ejecutó contra la base de desarrollo y se
verificó su integridad; no es un script que solo parezca correcto.

### D-037 · 2026-08-31 · vigente
**El encuadre de un modelo 3D se ajusta arrastrando, no escribiendo números.**
Un componente propio del panel muestra el modelo, deja girarlo con el ratón y
escribe los valores en el formulario al pulsar «Capturar encuadre». *Por qué:*
pedirle al traumatólogo que adivine que la escala es 1,4 y el giro 35 grados, y
que guarde para ver el resultado, era exactamente lo que R5 pedía evitar.

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

## 4. Preguntas abiertas

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
