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

### D-010 · 2026-08-28 · vigente
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

---

## 5. Convenciones de esta bitácora

- Cada decisión entra como `D-nnn` con contexto y consecuencia, no solo con el
  resultado. Dentro de tres meses la consecuencia es lo único que sirve.
- Cada observación entra como `O-nnn` con dónde se ve, no solo qué pasa.
- Las entradas no se borran. Si una decisión se revierte, se marca **superada**
  y se enlaza la nueva.
- Las fechas van en formato absoluto (2026-08-28), nunca "la semana pasada".
- Lo que se decide en conversación y no queda aquí, no se decidió.
