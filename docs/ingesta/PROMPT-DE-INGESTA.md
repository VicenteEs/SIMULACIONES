# Encargo: convertir una biblioteca de traumatología en fichas para TraumaHub

## 0. Configuración (complétela antes de empezar)

| Parámetro | Valor |
|---|---|
| CARPETA_RAIZ | La carpeta en la que está trabajando. Recórrala entera, con todas sus subcarpetas. |
| AGENTES_EN_PARALELO | 6 |
| MODULOS_A_GENERAR | patologias, maniobras, casos-ao, estudios-ia |
| GENERAR_CIRUGIAS | no («sí» solo si se quieren guiones para la consola de simulación) |
| LOTE | biblioteca-2026-10 |
| MODELO | El nombre y la versión del modelo que redacta, p. ej. «claude-opus-5-5». |
| SEGMENTOS_NUEVOS_PERMITIDOS | Principios generales; Columna; Pelvis y acetábulo; Brazo; Antebrazo; Muslo |

## 1. Rol y objetivo

Usted coordina un equipo de agentes que convierte los libros y documentos de traumatología de CARPETA_RAIZ en fichas estructuradas para TraumaHub, una plataforma docente para residentes de traumatología y ortopedia.

Cada ficha es un archivo JSON con una estructura fija (sección 5). Las fichas entran en la plataforma como borradores **pendientes de revisión**: un traumatólogo las coteja con el libro antes de publicarlas, y la plataforma registra cuánto las corrige y cuánto tiempo les dedica. Por eso importan tres cosas por encima de todo:

1. que cada afirmación salga de la fuente;
2. que se pueda encontrar en ella (libro, capítulo, páginas);
3. que la estructura sea exacta, porque un archivo mal formado no se puede importar.

Todo lo terminado queda en la carpeta `listos/`, en la raíz de CARPETA_RAIZ.

## 2. Reglas que no se negocian

1. **Fidelidad.** Todo el contenido sale de los documentos asignados. No complete con conocimiento propio ni con otras fuentes: si la fuente no cubre una sección, déjela vacía y dígalo en `notasParaElRevisor`. Su conocimiento sirve para ordenar, traducir y explicar con claridad, no para añadir datos.
2. **Cifras exactas.** Dosis, porcentajes, ángulos, milímetros, tiempos y plazos se trasladan tal como están en la fuente, con sus unidades. Si una cifra es dudosa (ilegible, contradictoria o distinta entre libros), escríbala como está y anótelo con su página en `notasParaElRevisor`.
3. **Con sus palabras.** Redacte resumiendo y reorganizando; no copie párrafos del libro. Solo se admiten citas textuales breves e imprescindibles, como la definición literal de un tipo de una clasificación. No extraiga ni reproduzca figuras ni fotografías de los libros.
4. **Idioma.** Español clínico de Chile: «fractura expuesta», «yeso», «kinesiología». Si la fuente está en otro idioma, tradúzcala. Mantenga los epónimos y los nombres de las clasificaciones, y ponga el término original entre paréntesis solo cuando ayude a buscarlo. Unidades del SI; en el texto, coma decimal («2,5 mm»).
5. **Para el residente que opera mañana.** Priorice lo que cambia la conducta: indicaciones, criterios de decisión, errores frecuentes y complicaciones. Sin relleno ni historia de la técnica.
6. **Datos de pacientes.** Nunca traslade nombres, RUT, fechas de nacimiento ni ningún dato que identifique a un paciente. Si un documento los trae (fichas clínicas, informes, epicrisis), no lo procese y regístrelo en `incidencias.md`.
7. **No toque los originales.** No mueva, renombre ni modifique nada fuera de `listos/` y `_trabajo/`. Al recorrer las carpetas, ignore esas dos.
8. **Trazabilidad.** Cada ficha lleva su procedencia completa y cada paso queda registrado en `listos/control/`. Lo que no se puede hacer se registra en `incidencias.md`: nada se omite en silencio.
9. **Estructura exacta.** Solo los campos de la sección 5, con esos nombres y esos tipos. Ningún campo inventado.

## 3. Carpetas

```
CARPETA_RAIZ/
├── … sus carpetas de libros (solo lectura)
├── listos/
│   ├── LEEME.md                      resumen de la tanda
│   ├── fichas/                       ← esto es lo que se sube al servidor
│   │   ├── patologias/<clave>.json
│   │   ├── maniobras/<clave>.json
│   │   ├── casos-ao/<clave>.json
│   │   ├── cirugias/<clave>.json
│   │   └── estudios-ia/<clave>.json
│   ├── pdf-por-tema/<id_libro>/<nnn>-<tema>.pdf
│   └── control/
│       ├── inventario.csv
│       ├── fragmentos.csv
│       ├── temas.csv
│       ├── catalogos-faltantes.csv
│       └── incidencias.md
└── _trabajo/                         textos extraídos, OCR, notas, validador y temporales
```

Los CSV van en UTF-8, separados por comas y con encabezado. Los JSON, en UTF-8 sin BOM y con sangría de 2 espacios.

## 4. El proceso

### Fase 1 · Inventario

1. Recorra CARPETA_RAIZ con todas sus subcarpetas, salvo `listos/` y `_trabajo/`. Considere PDF, EPUB, DOCX, DOC, HTML, TXT y MD. Registre el resto en el inventario como «descartado: formato».
2. Para cada documento determine: título, autores, edición, año, idioma, número de páginas, si tiene capa de texto (`si`, `no` o `parcial`) y el tipo de obra: `tratado`, `atlas-quirurgico`, `examen-fisico`, `casos-clinicos`, `articulo`, `apuntes` u `otro`.
3. Si un PDF no tiene capa de texto, páselo por OCR (por ejemplo `ocrmypdf -l spa+eng`) y deje el resultado en `_trabajo/ocr/`. Si no se puede, regístrelo en `incidencias.md` y no lo procese.
4. Si hay duplicados (el mismo libro en dos archivos, o dos ediciones), trabaje con la edición más reciente y registre la otra como «descartado: duplicado».
5. Asigne a cada documento un `id_libro` corto, en minúsculas, sin tildes y con guiones: `rockwood9`, `campbell14`, `hoppenfeld-examen`.
6. Escriba `listos/control/inventario.csv` con estas columnas:
   `id_libro,ruta,formato,paginas,capa_de_texto,titulo,autores,edicion,anio,idioma,tipo_de_obra,estado,motivo`

### Fase 2 · Segmentación por tema: los PDF chicos

Puede repartir esta fase entre agentes, un documento por agente.

1. Use el índice y los marcadores del PDF para encontrar los capítulos y las secciones. Compruebe cada rango mirando su primera y su última página. Anote las dos numeraciones: la del PDF, para cortar, y la impresa en el libro, para citar.
2. Divida el contenido en **temas**. Un tema es lo que da una ficha:
   - una patología, lesión o enfermedad → `patologias`;
   - una maniobra de examen físico → `maniobras`. El fragmento puede agrupar las maniobras de un mismo segmento; cada maniobra será su propia ficha;
   - una operación o técnica quirúrgica paso a paso → `casos-ao`, y además `cirugias` solo si GENERAR_CIRUGIAS = sí;
   - un caso clínico de lectura de imágenes, con su clasificación y su discusión → `estudios-ia`.

   Un capítulo puede dar varios temas: una fractura y su técnica quirúrgica son dos fichas. Los principios transversales (fracturas expuestas, síndrome compartimental, consolidación, infección) son `patologias` del segmento «Principios generales». Lo que no encaja en ningún módulo (ciencias básicas, historia, índices, bibliografía, publicidad) se registra como «descartado: sin módulo».
3. Corte cada tema en su propio PDF: `listos/pdf-por-tema/<id_libro>/<nnn>-<tema>.pdf`. `nnn` es el orden dentro del libro (`001`, `002`…) y `<tema>` el nombre del tema en minúsculas, sin tildes y con guiones. Corte por páginas exactas y sin recomprimir (con `qpdf` o `pypdf`, por ejemplo). En los documentos que no son PDF, guarde el texto de cada tema en `_trabajo/textos/`.
4. Escriba `listos/control/fragmentos.csv` con estas columnas:
   `id_libro,nnn,tema,modulo,paginas_pdf,paginas_impresas,ruta_fragmento,estado,motivo`
5. **Consolidación. La hace solo el orquestador.** Reúna los temas de todos los libros. Si varios libros tratan el mismo tema, es **una sola ficha** que los usa todos. Para cada ficha, fije en `listos/control/temas.csv`:
   `clave,modulo,tema,segmento,fragmentos,libros,capitulos,paginas,estado,agente,palabras,verificado`
   - `clave`: única dentro de su módulo, en minúsculas, sin tildes, con palabras separadas por guiones y hasta 80 caracteres. Ejemplos: `fractura-diafisis-tibial`, `prueba-de-lachman`, `clavo-endomedular-tibia-42-a2`.
   - `segmento` (solo en patologías y maniobras): uno de la sección 5.9 o de SEGMENTOS_NUEVOS_PERMITIDOS. Si ninguno sirve, elija el más cercano y regístrelo en `catalogos-faltantes.csv`.
   - `estado`: `pendiente` al crearla.

   Los agentes redactores **no** eligen claves, segmentos ni valores de catálogo: los reciben.

### Fase 3 · Redacción en paralelo

1. Por cada tema `pendiente`, despliegue un agente redactor con la plantilla de la sección 6, completada con su asignación. Entréguele además, **completas y sin resumir**, las secciones 2, 5, 7 y 8. Mantenga hasta AGENTES_EN_PARALELO agentes a la vez; cuando uno termine, lance el siguiente.
2. Cada agente escribe su ficha en `listos/fichas/<modulo>/<clave>.json`. Primero la guarda como `<clave>.json.tmp`, y la renombra cuando pasa su lista de verificación: así nunca queda en `listos/` un archivo a medias.
3. Solo el orquestador escribe en `temas.csv`, `catalogos-faltantes.csv` e `incidencias.md`, con lo que le devuelve cada agente. Los estados son `pendiente`, `en-curso`, `listo`, `con-incidencias` y `descartado`.
4. Si un agente falla o su ficha no pasa la verificación, reintente una vez con otro agente. Si vuelve a fallar, márquela `con-incidencias` y regístrelo.
5. Si su entorno no permite agentes en paralelo, procese los temas uno por uno, con la misma plantilla.

### Fase 4 · Verificación

1. **Estructura.** Escriba en `_trabajo/validar.py` un validador que aplique la sección 5 y la lista de la sección 7, y páselo por todas las fichas. Lo que falle se corrige o vuelve a un redactor.
2. **Fidelidad.** Un agente distinto del que la redactó coteja cada ficha con sus fragmentos. Empieza por lo de más riesgo: cifras, dosis, indicaciones, contraindicaciones, clasificaciones y umbrales de decisión. Corrige lo que no esté en la fuente o esté mal trasladado, y anota lo dudoso en `notasParaElRevisor`. Después se marca `verificado = si` en `temas.csv`.

### Fase 5 · Cierre

1. Compruebe que en `listos/fichas/` no quedan archivos `.tmp` ni fichas que no pasen el validador.
2. Escriba `listos/LEEME.md` con la fecha, LOTE y MODELO; los documentos procesados y descartados; las fichas por módulo y por libro; las palabras en total; las incidencias abiertas y los catálogos faltantes.
3. Termine su respuesta con ese mismo resumen.

### Si el trabajo se corta

Todo es reanudable. Al volver a empezar, lea `listos/control/`:
- no rehaga los documentos ya inventariados ni los fragmentos ya cortados;
- no reescriba una ficha `listo` que pase el validador;
- retome desde los temas `pendiente`, `en-curso` o `con-incidencias`.

## 5. La estructura de las fichas

### 5.1 El sobre

Cada archivo es un objeto JSON con estas claves, en este orden, y ninguna otra:

```json
{
  "formato": "traumahub/ingesta-1",
  "modulo": "patologias",
  "clave": "fractura-diafisis-tibial",
  "procedencia": {
    "origen": "ia",
    "libro": "Título del libro, 9.ª ed.",
    "capitulo": "57. Título del capítulo",
    "paginas": "2345-2398",
    "lote": "biblioteca-2026-10",
    "modelo": "claude-opus-5-5",
    "archivoFuente": "Libros/Trauma/libro.pdf"
  },
  "notasParaElRevisor": ["…"],
  "ficha": {}
}
```

| Clave | Qué es |
|---|---|
| `formato` | Siempre `"traumahub/ingesta-1"`. |
| `modulo` | `patologias`, `maniobras`, `casos-ao`, `cirugias` o `estudios-ia`. |
| `clave` | La de `temas.csv`, igual al nombre del archivo sin `.json`. |
| `procedencia.origen` | `"ia"`. Obligatorio. |
| `procedencia.libro` | Título y edición; si la ficha sale de varios libros, separados con « ; ». Obligatorio, hasta 300 caracteres. |
| `procedencia.capitulo` | Número y título del capítulo; varios, con « ; » y en el mismo orden que los libros. Hasta 200. |
| `procedencia.paginas` | Páginas impresas, como `"2345-2398"`; varias, con « ; ». Hasta 100. |
| `procedencia.lote` | LOTE. Obligatorio, hasta 100. |
| `procedencia.modelo` | MODELO. Hasta 100. |
| `procedencia.archivoFuente` | Ruta del documento original, relativa a CARPETA_RAIZ; varias, con « ; ». Hasta 500. |
| `notasParaElRevisor` | Lista de frases para el traumatólogo que revisará: lo que la fuente no cubre, cifras dudosas con su página, discrepancias entre libros, figuras que convendría sustituir por una imagen propia (con su número y su página). Opcional; hasta 20 notas de hasta 500 caracteres. |
| `ficha` | El contenido, con los campos de su módulo (5.4 a 5.8). |

### 5.2 Tipos de valor

| Tipo | Cómo se escribe |
|---|---|
| **texto** | Cadena de una sola línea, sin formato. |
| **texto simple** | Cadena de un solo párrafo, sin formato, sin viñetas y sin saltos de línea (en la ficha no se ven). |
| **texto con formato** | Cadena en Markdown acotado (abajo). |
| **número** | Número JSON: `12.5`, no `"12,5"`. |
| **sí/no** | `true` o `false`. |
| **opción** | Uno de los valores listados, escrito exactamente igual. |
| **catálogo** | Un valor de la lista del catálogo (5.9), escrito exactamente igual. |
| **lista** | Arreglo de objetos con los campos indicados. |
| **bloques** | Arreglo de bloques (5.3). |

**Markdown acotado.** Se usa solo en los campos de «texto con formato» y en el `cuerpo` de los bloques `texto`:
- párrafos separados por una línea en blanco (en el JSON, `\n\n`);
- subtítulos con `## `, `### ` o `#### `, nunca `# `;
- listas con `- ` o `1. `, **sin anidar**;
- citas con `> `;
- `**negrita**`, `*cursiva*` y enlaces `[texto](https://…)`.

Está prohibido: tablas, imágenes, bloques de código, HTML, líneas divisorias (`---`) y listas dentro de listas. Una clasificación va en un bloque `tabla-clasificacion`. Una tabla que no es una clasificación se convierte en una lista, o en varias tablas de dos columnas.

**Límites y vacíos.**
- Ningún texto supera 20.000 caracteres, ninguna lista 500 filas y ninguna pestaña 200 bloques.
- Un campo opcional que la fuente no cubre se omite. Una pestaña o una lista sin contenido se deja como `[]` o se omite.
- Un campo obligatorio nunca va vacío. Si la fuente no da para llenarlo, la ficha no se hace y se registra.

### 5.3 Los bloques

Las pestañas de contenido son listas de bloques. Cada bloque es un objeto con la clave `bloque` y sus campos:

| `bloque` | Campos | Para qué |
|---|---|---|
| `texto` | `titulo`: texto, opcional · `cuerpo`: texto con formato, **obligatorio** | El bloque de uso general. |
| `lista-clinica` | `titulo`: texto, opcional · `puntos`: lista de **al menos uno**, cada uno `{ "destacado": texto, opcional; "texto": texto simple, obligatorio }` | Criterios, indicaciones, signos de alarma: una idea en negrita y su desarrollo. |
| `tabla-clasificacion` | `titulo`: texto, **obligatorio** · `filas`: lista de **al menos una**, cada una `{ "clave": texto, obligatorio; "descripcion": texto simple, obligatorio }` | Una clasificación, con una fila por tipo. |
| `advertencia` | `tono`: opción `atencion`, `error-frecuente` o `perla`, **obligatorio** · `texto`: texto simple, **obligatorio** | Lo que no se puede pasar por alto. Tres o cuatro por ficha como máximo. |

- `atencion`: algo que hay que tener presente.
- `error-frecuente`: la equivocación que se repite en la práctica.
- `perla`: el detalle que distingue a quien sabe.

En esta tanda **no** se usan los bloques `imagen`, `video`, `modelo-3d` ni `instancia-atlas`: los añade el revisor en la plataforma. Si una figura del libro es importante, dígalo en `notasParaElRevisor` con su número y su página.

### 5.4 Módulo `patologias`

Una patología de la biblioteca, de la definición a la rehabilitación, en seis pestañas fijas.

| Campo | Tipo | Oblig. | Qué va |
|---|---|---|---|
| `nombre` | texto | sí | Completo y sin abreviaturas: «Fractura de la diáfisis tibial», no «Fx diáfisis tibia». |
| `subtitulo` | texto | | Una línea que acote el alcance: «Adulto · trazo simple y complejo». |
| `segmento` | catálogo de segmentos | sí | El que fija `temas.csv`. |
| `codigo` | texto | | El código AO/OTA («42») o la sigla con que se la conoce. |
| `tipo` | opción: `trauma` u `ortopedia` | | `trauma` para las lesiones agudas; `ortopedia` para la patología no traumática: degenerativa, congénita, del desarrollo o tumoral. Póngalo siempre. |
| `definicion` | bloques | | Qué es, a quién afecta y con qué frecuencia, el mecanismo en una frase y las lesiones asociadas que hay que buscar. |
| `mecanismo` | bloques | | Cómo se produce: energía, dirección de la fuerza, biomecánica y la anatomía que explica el patrón de la lesión. |
| `clasificacion` | bloques | | Las clasificaciones que se usan en la práctica, cada una en un `tabla-clasificacion`; cómo aplicarlas y para qué sirven, en un `texto`. |
| `evaluacion` | bloques | | La anamnesis y el examen físico dirigidos; lo que no se puede pasar por alto (estado neurovascular, síndrome compartimental, partes blandas); las imágenes que se piden y qué buscar en ellas. |
| `manejo` | bloques | | El tratamiento conservador y el quirúrgico, con sus indicaciones y los criterios que deciden entre uno y otro; técnicas, cuidados posoperatorios y complicaciones. |
| `rehabilitacion` | bloques | | Los principios de la rehabilitación y del retorno a la actividad. |
| `fases` | lista | | Las fases de la rehabilitación, en orden. Cada fase: `cuando` (texto, obligatorio: «0-2 semanas»), `titulo` (texto, obligatorio: el objetivo, «Proteger la fijación»), `contenido` (texto simple, obligatorio: qué se trabaja) y `criterio` (texto simple: qué tiene que cumplir el paciente para pasar a la siguiente). |

No haga la ficha si la fuente no da, al menos, para la definición y el manejo. Extensión orientativa: entre 1.500 y 4.000 palabras.

### 5.5 Módulo `maniobras`

Una maniobra del examen físico.

| Campo | Tipo | Oblig. | Qué va |
|---|---|---|---|
| `nombre` | texto | sí | Con su epónimo si lo tiene: «Prueba de Lachman». |
| `segmento` | catálogo de segmentos | sí | El que fija `temas.csv`. |
| `evalua` | texto | sí | Qué estructura o función evalúa, en una línea: «Ligamento cruzado anterior». |
| `tecnica` | texto con formato | sí | Paso a paso: posición del paciente, posición y manos del examinador, el gesto, y con qué se compara (el lado sano). |
| `positivo` | texto con formato | sí | Qué se considera positivo y, si corresponde, cómo se gradúa. |
| `nota` | texto con formato | | La interpretación: sensibilidad y especificidad si la fuente las da, falsos positivos y negativos, y con qué otras maniobras se combina. |
| `contenido` | bloques | | Variantes de la maniobra, perlas y errores frecuentes. |

Extensión orientativa: entre 150 y 600 palabras.

### 5.6 Módulo `casos-ao`

Una técnica quirúrgica paso a paso, con el principio que sostiene cada gesto.

| Campo | Tipo | Oblig. | Qué va |
|---|---|---|---|
| `titulo` | texto | sí | La lesión y la técnica: «Fractura 42-A2 de la tibia: clavo endomedular fresado». |
| `codigo` | texto | | El código AO/OTA completo: «42-A2». Vacío si no es una fractura. |
| `procedimiento` | texto con formato | | Indicación, planificación, posición del paciente, implante elegido y por qué. |
| `pasos` | lista | | En el orden en que se hacen (campos abajo). |
| `contenido` | bloques | | Indicaciones y contraindicaciones, complicaciones, variantes de la técnica. |

Cada paso:

| Campo | Tipo | Oblig. | Qué va |
|---|---|---|---|
| `titulo` | texto | sí | El gesto, en pocas palabras: «Punto de entrada», «Reducción indirecta». |
| `descripcion` | texto con formato | sí | Qué se hace, con el detalle técnico necesario para hacerlo. |
| `principio` | texto | sí | El principio AO en juego, en una línea: «Estabilidad relativa: consolidación con callo». En una operación que no es de fractura, el principio técnico que sostiene el gesto: «Isometría del injerto». |
| `nota` | texto con formato | | Trucos, errores que evitar y alternativas. |

Extensión orientativa: entre 5 y 15 pasos. El modelo 3D de cada paso no se llena: se elige en la plataforma.

### 5.7 Módulo `cirugias` (solo si GENERAR_CIRUGIAS = sí)

El guion de una cirugía para la consola de simulación. El modelo 3D, sus piezas, sus unidades y el desplazamiento inicial se completan en la plataforma: **no** escriba `modelo`, `milimetrosPorUnidad`, `ejeLargo`, `piezas`, `desplazamientoInicial` ni `muestra`.

| Campo | Tipo | Oblig. | Qué va |
|---|---|---|---|
| `nombre` | texto | sí | «Fractura 42-A2 de tibia · clavo endomedular». |
| `hueso` | catálogo de huesos | | El hueso y su tercio. |
| `clasificacion` | catálogo de clasificaciones AO | | El código del trazo sin el número del hueso: «A2». |
| `tecnica` | catálogo de técnicas | | La técnica quirúrgica. |
| `codigo` | texto | | Normalmente vacío: la consola lo compone con el hueso y el trazo. |
| `resumen` | texto con formato | | El procedimiento, para leer antes de empezar el caso. |
| `instrumental` | lista de valores del catálogo de instrumental | | La bandeja, incluidos instrumentos que no usa ningún paso (señuelos): `["Separador de Hohmann", "Fresa flexible"]`. |
| `pasos` | lista | | El guion, en orden (campos abajo). |
| `contenido` | bloques | | Lo que el caso quiere enseñar y sus complicaciones. |

Cada paso:

| Campo | Tipo | Oblig. | Qué va |
|---|---|---|---|
| `titulo` | texto | sí | «Incisión lateral», «Fresado del canal». |
| `fase` | catálogo de fases | | La fase del acto quirúrgico. |
| `descripcion` | texto con formato | | Qué se hace en el paso. |
| `objetivo` | opción: `instrumento`, `trazo`, `reduccion` o `fuerza` | sí | Qué se le mide al residente: elegir el instrumento correcto, la longitud de la incisión, dejar la fractura dentro de la tolerancia o aplicar la fuerza correcta. |
| `instrumento` | catálogo de instrumental | | El instrumento correcto. Póngalo siempre que la fuente lo permita. |
| `puntos` | número | | Cuánto vale el paso; 10 si la fuente no dice nada. |
| `trazoMinimo`, `trazoMaximo` | número, en mm | | Solo con objetivo `trazo`. |
| `toleranciaDesplazamiento`, `toleranciaDiastasis` | número, en mm | | Solo con objetivo `reduccion`. |
| `toleranciaAngulacion` | número, en grados | | Solo con objetivo `reduccion`. |
| `fuerzaMinima`, `fuerzaMaxima` | número, en newtons | | Solo con objetivo `fuerza`. |
| `exito`, `insuficiente`, `excesivo` | texto simple | | Lo que se le dice al residente si lo hace bien, si se queda corto y si se pasa. |
| `riesgo` | texto con formato | | La estructura anatómica o el principio en juego. |

Reglas del objetivo:
- con `trazo`, al menos una de las dos longitudes;
- con `fuerza`, al menos uno de los dos topes. Los libros rara vez dan fuerzas: si no están, no use ese objetivo;
- con `instrumento`, ninguna longitud ni ninguna fuerza.

### 5.8 Módulo `estudios-ia`

Un caso de lectura de imágenes: la clasificación propuesta, los hallazgos y las opciones de manejo.

| Campo | Tipo | Oblig. | Qué va |
|---|---|---|---|
| `nombre` | texto | sí | «Radiografía de tobillo tras una inversión forzada». |
| `codigo` | texto | | La clasificación propuesta: «Weber B», «AO 44-B1». |
| `confianza` | número de 0 a 100 | | La confianza que se declara en esa clasificación. Es un caso de demostración: ningún modelo la calcula. |
| `hallazgos` | lista de `{ "texto": texto simple }` | | Lo que se ve en la imagen, un hallazgo por fila. |
| `opciones` | lista | | Cada opción: `titulo` (texto, obligatorio), `frecuente` (sí/no: `true` solo en la que coincide con la indicación más frecuente), `aFavor` y `enContra` (listas de `{ "texto": texto simple }`). |
| `contenido` | bloques | | La discusión del caso. La imagen la añade el revisor: diga en `notasParaElRevisor` qué figura del libro muestra el caso y en qué página. |

### 5.9 Catálogos

Estos valores se escriben **exactamente** así:

- **Segmentos** (patologías y maniobras): Hombro · Codo · Muñeca y mano · Cadera · Rodilla · Pierna · Tobillo y pie, más los de SEGMENTOS_NUEVOS_PERMITIDOS.
- **Huesos** (cirugías): Húmero (diáfisis) · Radio (extremo distal) · Fémur (diáfisis) · Tibia (diáfisis).
- **Clasificaciones AO** (cirugías, por su código): A1 · A2 · A3 · B1 · B2 · C1 · C2.
- **Técnicas quirúrgicas** (cirugías): Clavo endomedular · Placa de compresión · Tornillos canulados · Fijador externo.
- **Fases quirúrgicas** (cirugías): Abordaje · Reducción · Fijación · Cierre.
- **Instrumental** (cirugías): Bisturí N°10 (piel) · Bisturí profundo (fascia) · Separador de Farabeuf · Separador de Hohmann · Pinza de reducción · Punzón de entrada · Guía endomedular · Fresa flexible · Impactador de clavo · Atornillador de bloqueo · Pinza de disección · Porta-agujas · Tijera de Mayo.

Si el valor correcto no está en la lista:
- en un campo opcional, omítalo;
- en `segmento`, use el que fija `temas.csv`.

En los dos casos, el agente lo informa y el orquestador lo registra en `listos/control/catalogos-faltantes.csv` (`catalogo,valor_propuesto,claves,motivo`), para que el administrador lo cree antes de importar.

## 6. Plantilla para cada agente redactor

El orquestador completa lo que va entre llaves y la entrega junto con las secciones 2, 5, 7 y 8, completas.

```
Usted es un agente redactor de TraumaHub. Su encargo es UNA ficha.

ASIGNACIÓN
- clave: {clave}
- módulo: {modulo}
- tema: {tema}
- segmento: {segmento}            (solo en patologías y maniobras)
- fragmentos: {rutas de los PDF, cada una con sus páginas impresas}
- procedencia: libro {…} · capítulo {…} · páginas {…} · lote {LOTE} · modelo {MODELO} · archivoFuente {…}
- archivo de salida: listos/fichas/{modulo}/{clave}.json

PROCEDIMIENTO
1. Lea completos los fragmentos asignados, página por página, incluidas las tablas y
   los pies de figura. No use otras fuentes. Si el tema supera unas 60 páginas, léalo
   por partes y tome notas en _trabajo/notas/{clave}.md antes de redactar.
2. Decida qué va en cada campo según la sección 5, y en qué pestaña va cada cosa.
3. Redacte en español y con sus palabras, siguiendo las reglas de la sección 2.
4. Arme el JSON exactamente como dice la sección 5. Guíese por el ejemplo de su módulo
   en la sección 8, que muestra la forma y no es fuente.
5. Revíselo con la lista de la sección 7 y corrija hasta que la pase entera.
6. Guárdelo como {clave}.json.tmp y, cuando esté bien, renómbrelo a {clave}.json.
7. Devuelva al orquestador solo este informe, en JSON:
   {"clave": "…", "estado": "listo" | "con-incidencias" | "descartado",
    "palabras": 0, "notas": ["…"],
    "catalogos_faltantes": [{"catalogo": "…", "valor": "…"}],
    "motivo": "…"}

No escriba en ningún otro archivo ni carpeta.
```

## 7. Lista de verificación de cada ficha

- [ ] Es JSON válido: UTF-8, sin comentarios y sin comas finales.
- [ ] Tiene `formato`, `modulo`, `clave`, `procedencia` y `ficha`, y `clave` coincide con el nombre del archivo.
- [ ] `procedencia` trae `origen`, `libro` y `lote`, y todo lo demás que se sepa.
- [ ] En `ficha` solo hay campos de su módulo, con esos nombres exactos, y ninguno de los excluidos.
- [ ] Todo lo obligatorio está lleno, también dentro de las listas y de los bloques.
- [ ] Cada bloque es `texto`, `lista-clinica`, `tabla-clasificacion` o `advertencia`, con sus campos; las listas de puntos y de filas tienen al menos una fila.
- [ ] Las opciones y los valores de catálogo están escritos exactamente como en las listas.
- [ ] Los números son números JSON, y los sí/no son `true` o `false`.
- [ ] El texto con formato respeta el Markdown acotado: sin tablas, imágenes, código, HTML, `# `, `---` ni listas anidadas.
- [ ] El texto simple no tiene formato, ni viñetas, ni saltos de línea.
- [ ] En `cirugias`, cada paso cumple las reglas de su objetivo.
- [ ] Cada cifra está en la fuente, y lo dudoso está en `notasParaElRevisor` con su página.
- [ ] Está en español y con sus palabras: no hay párrafos copiados.
- [ ] Cada cosa está en su pestaña: la clasificación en `clasificacion`, el tratamiento en `manejo`.

## 8. Ejemplos

Muestran la forma de cada módulo. Su contenido es ilustrativo: no es fuente, y los libros citados son inventados.

### `patologias`

```json
{
  "formato": "traumahub/ingesta-1",
  "modulo": "patologias",
  "clave": "fractura-diafisis-tibial",
  "procedencia": {
    "origen": "ia",
    "libro": "Tratado de fracturas del adulto (ejemplo), 9.ª ed.",
    "capitulo": "57. Fracturas de la diáfisis de la tibia y el peroné",
    "paginas": "2345-2398",
    "lote": "biblioteca-2026-10",
    "modelo": "claude-opus-5-5",
    "archivoFuente": "Libros/Trauma/tratado-fracturas-9.pdf"
  },
  "notasParaElRevisor": [
    "La fuente no da la incidencia en población chilena.",
    "La figura 57-12 (p. 2361) muestra el punto de entrada del clavo: conviene una imagen propia."
  ],
  "ficha": {
    "nombre": "Fractura de la diáfisis tibial",
    "subtitulo": "Adulto · trazo simple y complejo",
    "segmento": "Pierna",
    "codigo": "42",
    "tipo": "trauma",
    "definicion": [
      {
        "bloque": "texto",
        "cuerpo": "Es la fractura de hueso largo más frecuente. Como la cara anteromedial de la tibia tiene poca cobertura de partes blandas, una proporción alta es **expuesta**.\n\nHay que buscar siempre lesiones asociadas del peroné, la rodilla y el tobillo."
      }
    ],
    "mecanismo": [
      {
        "bloque": "texto",
        "cuerpo": "- **Baja energía:** torsión, con trazo espiroideo.\n- **Alta energía:** impacto directo, con trazo transverso o multifragmentario y más daño de partes blandas."
      }
    ],
    "clasificacion": [
      {
        "bloque": "tabla-clasificacion",
        "titulo": "AO/OTA 42",
        "filas": [
          { "clave": "42-A", "descripcion": "Trazo simple: espiroideo, oblicuo o transverso." },
          { "clave": "42-B", "descripcion": "En cuña: tras reducir, los fragmentos principales quedan en contacto." },
          { "clave": "42-C", "descripcion": "Multifragmentaria: sin contacto entre los fragmentos principales." }
        ]
      }
    ],
    "evaluacion": [
      {
        "bloque": "advertencia",
        "tono": "atencion",
        "texto": "Busque el síndrome compartimental: dolor desproporcionado y dolor al estirar pasivamente los dedos. Es una urgencia quirúrgica."
      },
      {
        "bloque": "lista-clinica",
        "titulo": "Examen dirigido",
        "puntos": [
          { "destacado": "Partes blandas", "texto": "Heridas, flictenas y contusión: definen si es expuesta y cuándo operar." },
          { "destacado": "Estado neurovascular", "texto": "Pulsos pedio y tibial posterior, sensibilidad y motilidad del pie, antes y después de reducir." }
        ]
      }
    ],
    "manejo": [
      {
        "bloque": "texto",
        "titulo": "Elección del tratamiento",
        "cuerpo": "El tratamiento ortopédico es una opción en las fracturas cerradas, estables y de baja energía que se mantienen alineadas en el yeso. En el resto, el **clavo endomedular fresado** es el tratamiento de elección."
      }
    ],
    "rehabilitacion": [],
    "fases": [
      {
        "cuando": "0-2 semanas",
        "titulo": "Proteger y controlar el edema",
        "contenido": "Elevación, movilidad activa de rodilla y tobillo y carga según la estabilidad del montaje.",
        "criterio": "Herida sin complicaciones y dolor controlado."
      }
    ]
  }
}
```

### `maniobras`

```json
{
  "formato": "traumahub/ingesta-1",
  "modulo": "maniobras",
  "clave": "prueba-de-lachman",
  "procedencia": {
    "origen": "ia",
    "libro": "Exploración física del aparato locomotor (ejemplo), 2.ª ed.",
    "capitulo": "7. Rodilla",
    "paginas": "171-196",
    "lote": "biblioteca-2026-10",
    "modelo": "claude-opus-5-5",
    "archivoFuente": "Libros/Examen/exploracion-fisica.pdf"
  },
  "ficha": {
    "nombre": "Prueba de Lachman",
    "segmento": "Rodilla",
    "evalua": "Ligamento cruzado anterior",
    "tecnica": "1. Paciente en decúbito supino y relajado, con la rodilla en 20-30° de flexión.\n2. Una mano estabiliza el extremo distal del fémur; la otra toma la tibia proximal por detrás.\n3. Se desplaza la tibia hacia anterior y se compara con la rodilla sana.",
    "positivo": "Traslación anterior de la tibia mayor que en el lado sano, o **sin tope firme** al final del recorrido.",
    "nota": "Es la maniobra más sensible para la rotura aguda del ligamento cruzado anterior. El espasmo de los isquiotibiales puede dar un falso negativo.",
    "contenido": [
      {
        "bloque": "advertencia",
        "tono": "perla",
        "texto": "Si el muslo del paciente es voluminoso, apóyelo sobre su propio muslo para liberar una mano."
      }
    ]
  }
}
```

### `casos-ao`

```json
{
  "formato": "traumahub/ingesta-1",
  "modulo": "casos-ao",
  "clave": "clavo-endomedular-tibia-42-a2",
  "procedencia": {
    "origen": "ia",
    "libro": "Principios del tratamiento de las fracturas (ejemplo), 3.ª ed.",
    "capitulo": "6.7. Tibia, diáfisis",
    "paginas": "610-640",
    "lote": "biblioteca-2026-10",
    "modelo": "claude-opus-5-5",
    "archivoFuente": "Libros/AO/principios-fracturas-3.pdf"
  },
  "ficha": {
    "titulo": "Fractura 42-A2 de la tibia: clavo endomedular fresado",
    "codigo": "42-A2",
    "procedimiento": "Fractura diafisaria simple y oblicua. Se elige un clavo endomedular fresado y bloqueado, que da **estabilidad relativa** y permite la carga precoz.",
    "pasos": [
      {
        "titulo": "Posición y reducción cerrada",
        "descripcion": "Paciente en decúbito supino con la rodilla en flexión. Reducción por tracción, controlada con radioscopia en dos planos.",
        "principio": "Reducción indirecta: se respeta la biología del foco."
      },
      {
        "titulo": "Punto de entrada",
        "descripcion": "En la proyección anteroposterior, alineado con el eje del canal; en la lateral, en el borde anterior de la meseta.",
        "principio": "Un punto de entrada correcto evita la deformidad en valgo y en antecurvatum.",
        "nota": "Es el error más frecuente en las fracturas del tercio proximal."
      },
      {
        "titulo": "Fresado e inserción del clavo",
        "descripcion": "Guía hasta la metáfisis distal, fresado progresivo e inserción del clavo sin perder la reducción.",
        "principio": "Estabilidad relativa: consolidación secundaria con callo."
      }
    ],
    "contenido": []
  }
}
```

### `cirugias`

```json
{
  "formato": "traumahub/ingesta-1",
  "modulo": "cirugias",
  "clave": "tibia-42-a2-clavo",
  "procedencia": {
    "origen": "ia",
    "libro": "Principios del tratamiento de las fracturas (ejemplo), 3.ª ed.",
    "capitulo": "6.7. Tibia, diáfisis",
    "paginas": "610-640",
    "lote": "biblioteca-2026-10",
    "modelo": "claude-opus-5-5",
    "archivoFuente": "Libros/AO/principios-fracturas-3.pdf"
  },
  "ficha": {
    "nombre": "Fractura 42-A2 de tibia · clavo endomedular",
    "hueso": "Tibia (diáfisis)",
    "clasificacion": "A2",
    "tecnica": "Clavo endomedular",
    "resumen": "Reducción cerrada, fresado y clavo bloqueado en una fractura simple y oblicua de la diáfisis tibial.",
    "instrumental": [
      "Bisturí N°10 (piel)",
      "Punzón de entrada",
      "Guía endomedular",
      "Fresa flexible",
      "Pinza de reducción",
      "Separador de Hohmann"
    ],
    "pasos": [
      {
        "titulo": "Incisión de acceso",
        "fase": "Abordaje",
        "objetivo": "trazo",
        "instrumento": "Bisturí N°10 (piel)",
        "trazoMinimo": 30,
        "trazoMaximo": 50,
        "exito": "La incisión deja pasar el punzón sin lesionar el tendón rotuliano.",
        "insuficiente": "La incisión es corta: el punzón y la guía entrarán forzados.",
        "excesivo": "La incisión es más larga de lo necesario y daña más partes blandas.",
        "riesgo": "Tendón rotuliano y rama infrarrotuliana del nervio safeno."
      },
      {
        "titulo": "Punto de entrada",
        "fase": "Abordaje",
        "objetivo": "instrumento",
        "instrumento": "Punzón de entrada",
        "puntos": 10
      },
      {
        "titulo": "Reducción de la fractura",
        "fase": "Reducción",
        "objetivo": "reduccion",
        "instrumento": "Pinza de reducción",
        "toleranciaDesplazamiento": 2,
        "toleranciaAngulacion": 5,
        "exito": "La fractura queda dentro de la tolerancia: se puede pasar la guía."
      }
    ]
  }
}
```

### `estudios-ia`

```json
{
  "formato": "traumahub/ingesta-1",
  "modulo": "estudios-ia",
  "clave": "tobillo-weber-b-estable",
  "procedencia": {
    "origen": "ia",
    "libro": "Casos de imágenes en traumatología (ejemplo)",
    "capitulo": "12. Tobillo",
    "paginas": "410-415",
    "lote": "biblioteca-2026-10",
    "modelo": "claude-opus-5-5",
    "archivoFuente": "Libros/Imagenes/casos-imagenes.pdf"
  },
  "notasParaElRevisor": [
    "La radiografía del caso es la figura 12-3 (p. 412): hay que sustituirla por una imagen propia."
  ],
  "ficha": {
    "nombre": "Radiografía de tobillo tras una inversión forzada",
    "codigo": "Weber B",
    "confianza": 85,
    "hallazgos": [
      { "texto": "Trazo oblicuo del peroné a la altura de la sindesmosis." },
      { "texto": "Espacio claro medial conservado en la proyección de mortaja." }
    ],
    "opciones": [
      {
        "titulo": "Tratamiento ortopédico con bota de marcha",
        "frecuente": true,
        "aFavor": [{ "texto": "La mortaja es estable: el espacio claro medial está conservado." }],
        "enContra": [{ "texto": "Exige controles radiográficos para confirmar que no se desplaza." }]
      },
      {
        "titulo": "Osteosíntesis del peroné con placa",
        "frecuente": false,
        "aFavor": [{ "texto": "Reducción anatómica y movilidad precoz." }],
        "enContra": [{ "texto": "Los riesgos de una cirugía en una fractura que consolida sin ella." }]
      }
    ],
    "contenido": [
      {
        "bloque": "texto",
        "cuerpo": "La clave es la **estabilidad de la mortaja**: con el espacio claro medial conservado, la fractura aislada del peroné se trata sin cirugía."
      }
    ]
  }
}
```
