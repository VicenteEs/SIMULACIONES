/**
 * El formato de la ingesta: cómo llega una ficha preparada fuera de la
 * plataforma —a partir de un libro y, casi siempre, con un modelo de lenguaje—
 * antes de entrar en revisión (D-144).
 *
 * Un archivo JSON por ficha, con un sobre y la ficha dentro:
 *
 *     {
 *       "formato": "traumahub/ingesta-1",
 *       "modulo": "patologias",
 *       "clave": "fractura-diafisis-tibial",
 *       "procedencia": { "origen": "ia", "libro": "…", "lote": "…", … },
 *       "notasParaElRevisor": ["…"],
 *       "ficha": { … }
 *     }
 *
 * Los campos de `ficha` no están escritos aquí: son los del esquema del panel
 * (`src/admin/esquema.ts`), con sus mismos nombres, y de ahí salen el esquema
 * JSON que se le da al modelo, el validador y, cuando llegue, el importador. Si
 * la ingesta llevara su propia lista de campos, el día que el panel ganara uno
 * los libros se seguirían preparando sin él, y nadie lo notaría hasta tener
 * cientos de fichas hechas. Lo propio de la ingesta es poco y vive en este
 * archivo: qué se deja fuera, cómo se nombra lo que apunta a un catálogo y qué
 * se le pide al modelo en cada campo.
 */
import { MODULOS_EN_REVISION, ORIGENES_DE_CONTENIDO } from '@/lib/revision'

/**
 * La versión del formato, escrita en cada archivo.
 *
 * Va dentro del archivo y no en el nombre de la carpeta porque los archivos se
 * mueven y se copian: si el formato cambia algún día, el importador tiene que
 * poder saber de qué época es cada uno sin preguntarle a nadie.
 */
export const FORMATO_DE_INGESTA = 'traumahub/ingesta-1'

export type ModuloDeIngesta = (typeof MODULOS_EN_REVISION)[number]

/** Los cinco módulos: lo que entra por ingesta es lo que después se revisa. */
export const MODULOS_DE_INGESTA: readonly ModuloDeIngesta[] = MODULOS_EN_REVISION

export const esModuloDeIngesta = (valor: unknown): valor is ModuloDeIngesta =>
  typeof valor === 'string' && (MODULOS_DE_INGESTA as readonly string[]).includes(valor)

/**
 * Qué es una ficha de cada módulo, en una frase: la leen el modelo, en su
 * esquema, y quien prepara los libros, en la guía.
 */
export const QUE_ES_CADA_MODULO: Readonly<Record<ModuloDeIngesta, string>> = {
  patologias:
    'Una patología de la biblioteca: de la definición al manejo y la rehabilitación, en seis pestañas fijas.',
  maniobras: 'Una maniobra del examen físico: cómo se hace, qué es positivo y cómo se interpreta.',
  'casos-ao': 'Una técnica quirúrgica paso a paso, con el principio AO que sostiene cada gesto.',
  cirugias:
    'El guion de una cirugía para la consola de simulación: pasos, qué se le mide al residente en cada uno y qué se le dice.',
  'estudios-ia':
    'Un caso de lectura de imágenes: la clasificación propuesta, los hallazgos y las opciones de manejo con sus argumentos.',
}

// ------------------------------------------------------------------ bloques

/**
 * Los bloques que puede traer una ficha preparada: cinco de los ocho.
 *
 * Los otros tres apuntan a algo que solo existe dentro de la plataforma y que un
 * libro no trae: «Video» y «Modelo 3D» a un archivo que hay que subir y
 * encuadrar, y «Preparación anatómica» a una selección del atlas armada en el
 * taller. Los añade el revisor, con la ficha ya dentro. La imagen sí entra,
 * porque es un archivo que se puede dejar al lado del JSON.
 */
export const BLOQUES_DE_INGESTA = [
  'texto',
  'lista-clinica',
  'tabla-clasificacion',
  'advertencia',
  'imagen',
] as const

export type BloqueDeIngesta = (typeof BLOQUES_DE_INGESTA)[number]

export const esBloqueDeIngesta = (valor: unknown): valor is BloqueDeIngesta =>
  typeof valor === 'string' && (BLOQUES_DE_INGESTA as readonly string[]).includes(valor)

export const BLOQUES_FUERA_DE_LA_INGESTA: Readonly<Record<string, string>> = {
  video: 'Un video se sube y se añade en la plataforma, con la ficha ya dentro.',
  'modelo-3d': 'Un modelo 3D se sube y se encuadra en la plataforma, con la ficha ya dentro.',
  'instancia-atlas': 'Una preparación anatómica se arma en el taller y se añade en la plataforma.',
}

/**
 * Filas mínimas de las listas que Payload exige llenas.
 *
 * El esquema del panel no las declara —el formulario nunca deja una lista
 * clínica sin su primer punto—, pero la colección sí (`minRows: 1` en
 * `src/blocks/index.ts`), y al publicar rechaza la que llegue vacía. Un archivo
 * de ingesta no pasa por el formulario, así que aquí hay que decirlo; lo ata
 * `tests/unit/ingesta.test.ts` a la definición de Payload.
 */
export const FILAS_MINIMAS: Readonly<Record<string, number>> = {
  'lista-clinica.puntos': 1,
  'tabla-clasificacion.filas': 1,
}

// ----------------------------------------------------------- lo que se deja

const CON_EL_MODELO = 'Se completa en la plataforma, con el modelo 3D del caso delante.'

/**
 * Campos que no se cargan por ingesta, con el porqué que se le da a quien los
 * mande igual.
 *
 * Todos dependen del archivo 3D del caso: los nombres de sus piezas, sus
 * unidades, su posición inicial. Nada de eso está en un libro, y adivinarlo
 * produce justo el defecto más difícil de ver: una pieza con un nombre que no
 * coincide no da error, simplemente no se enciende (ver `editor: 'piezas3d'` en
 * el esquema del panel).
 */
export const FUERA_DE_LA_INGESTA: Readonly<Partial<Record<ModuloDeIngesta, Readonly<Record<string, string>>>>> = {
  'casos-ao': {
    'pasos.modelo': 'El modelo 3D de un paso se elige en la plataforma, entre los ya subidos.',
  },
  cirugias: {
    modelo: 'El modelo 3D del caso se sube y se elige en la plataforma.',
    milimetrosPorUnidad: CON_EL_MODELO,
    ejeLargo: CON_EL_MODELO,
    piezas: `Los nombres de las piezas son los de los objetos del archivo 3D. ${CON_EL_MODELO}`,
    desplazamientoInicial: CON_EL_MODELO,
    'pasos.muestra': `Qué piezas se ven en cada paso depende del archivo 3D. ${CON_EL_MODELO}`,
  },
}

export const estaFueraDeLaIngesta = (modulo: ModuloDeIngesta, ruta: string): boolean =>
  Boolean(FUERA_DE_LA_INGESTA[modulo]?.[ruta])

// ---------------------------------------------------------------- catálogos

/**
 * Cómo se nombra, en un archivo de ingesta, lo que en la plataforma es una
 * relación.
 *
 * En la base una relación es un número —el identificador de la fila—, y ese
 * número no lo sabe quien prepara un libro, ni es el mismo en la base de
 * pruebas que en la de producción. Así que se nombra por lo que se lee en
 * pantalla: el segmento por su nombre, y la clasificación AO por su código
 * («A2»), que es como la escribe cualquier libro. El importador los convierte
 * en identificadores buscándolos en el catálogo, y si alguno no está se detiene
 * antes de escribir nada: crearlo sobre la marcha llenaría el catálogo de
 * variantes —«Rodilla», «rodilla», «Rodilla y pierna»— que después habría que
 * fundir a mano, ficha por ficha.
 */
export const CATALOGOS_DE_INGESTA = {
  segmentos: { campo: 'nombre', nombre: 'segmentos anatómicos' },
  'huesos-ao': { campo: 'nombre', nombre: 'huesos' },
  'clasificaciones-ao': { campo: 'codigo', nombre: 'clasificaciones AO' },
  'tecnicas-quirurgicas': { campo: 'nombre', nombre: 'técnicas quirúrgicas' },
  'fases-quirurgicas': { campo: 'nombre', nombre: 'fases quirúrgicas' },
  instrumental: { campo: 'nombre', nombre: 'instrumental' },
} as const

export type CatalogoDeIngesta = keyof typeof CATALOGOS_DE_INGESTA

export const esCatalogoDeIngesta = (valor: unknown): valor is CatalogoDeIngesta =>
  typeof valor === 'string' && valor in CATALOGOS_DE_INGESTA

/**
 * Lo que hay hoy en cada catálogo, tal como lo guarda `docs/ingesta/catalogos.json`.
 *
 * Es una foto, no una consulta: el validador corre en el portátil de quien
 * prepara los libros, sin base de datos. La saca de la base
 * `scripts/ingesta/catalogos.sh`, y hay que repetirla cuando se añade un
 * segmento o una técnica.
 */
export type Catalogos = { generado?: string } & Partial<Record<CatalogoDeIngesta, string[]>>

// ---------------------------------------------------------------- el sobre

export const PATRON_DE_CLAVE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const LARGO_MAXIMO_DE_CLAVE = 120

export interface CampoDeProcedencia {
  nombre: 'origen' | 'libro' | 'capitulo' | 'paginas' | 'lote' | 'modelo' | 'archivoFuente'
  requerido: boolean
  maximo: number
  opciones?: readonly string[]
  descripcion: string
}

/**
 * De dónde sale la ficha. Son los mismos datos que guarda la revisión
 * (`registrarParaRevision`), y por eso los mismos nombres: la auditoría filtra
 * por lote, y cuando un lote sale mal se encuentra entero por aquí. El único
 * que la revisión todavía no guarda es `archivoFuente`, la ruta del documento
 * original: es lo que el revisor necesita para abrirlo, y el importador tendrá
 * que darle sitio.
 */
export const CAMPOS_DE_PROCEDENCIA: readonly CampoDeProcedencia[] = [
  {
    nombre: 'origen',
    requerido: true,
    maximo: 20,
    opciones: ORIGENES_DE_CONTENIDO.map((o) => o.value),
    descripcion: '«ia» si la redactó un modelo de lenguaje; «manual» si la escribió una persona.',
  },
  {
    nombre: 'libro',
    requerido: true,
    maximo: 300,
    descripcion:
      'El libro de donde sale, con su edición: «Rockwood and Green’s Fractures in Adults, 9.ª ed.». Si sale de varios, sepárelos con punto y coma.',
  },
  {
    nombre: 'capitulo',
    requerido: false,
    maximo: 200,
    descripcion: 'El capítulo, con su número: «54. Fracturas de la diáfisis tibial».',
  },
  {
    nombre: 'paginas',
    requerido: false,
    maximo: 100,
    descripcion: 'Las páginas de donde sale: «2345-2398».',
  },
  {
    nombre: 'lote',
    requerido: true,
    maximo: 100,
    descripcion:
      'La tanda de ingesta, igual en todas las fichas que se preparan juntas: «rockwood-9-tibia-2026-10». La auditoría filtra por él.',
  },
  {
    nombre: 'modelo',
    requerido: false,
    maximo: 100,
    descripcion: 'El modelo de lenguaje que la redactó, con su versión: «claude-opus-5-5».',
  },
  {
    nombre: 'archivoFuente',
    requerido: false,
    maximo: 500,
    descripcion:
      'La ruta del documento original, relativa a la carpeta de los libros; si son varios, separados con punto y coma.',
  },
]

/**
 * Lo que el modelo quiere que sepa quien revise: lo que la fuente no cubre,
 * una cifra dudosa con su página, una discrepancia entre libros, la figura que
 * convendría sustituir por una imagen propia. Va fuera de `ficha` porque no es
 * contenido: no se publica, se le enseña al revisor.
 */
export const MAXIMO_DE_NOTAS = 20
export const LARGO_MAXIMO_DE_NOTA = 500

// ------------------------------------------------------ texto con formato

/**
 * Las reglas del texto con formato, dichas una vez para el esquema, la guía y
 * las instrucciones del modelo.
 *
 * Son las del editor del panel y no las de Markdown entero porque lo que no
 * sabe representar el editor no sobrevive al guardar (ver la cabecera de
 * `src/lib/textoRico.ts`): una tabla escrita en Markdown llegaría a la ficha
 * como una fila de barras verticales.
 */
export const REGLAS_DEL_TEXTO_CON_FORMATO =
  'Markdown acotado: párrafos separados por una línea en blanco; subtítulos con «## », «### » o «#### »; listas con «- » o «1. », sin anidar; citas con «> »; **negrita**, *cursiva* y enlaces [texto](https://…). Sin tablas, imágenes, código ni HTML: una clasificación va en un bloque «tabla-clasificacion» y una imagen en un bloque «imagen».'

export const REGLAS_DEL_TEXTO_SIMPLE =
  'Texto simple, en un solo párrafo: sin formato, sin viñetas y sin saltos de línea, que en la ficha no se ven.'

// ------------------------------------------------------------- indicaciones

/**
 * Qué se le pide al modelo en cada campo.
 *
 * La etiqueta del panel dice qué es el campo; esto dice qué va dentro y con qué
 * forma, que es lo que un modelo no puede deducir de «Mecanismo». Las rutas son
 * las del documento: `fases.cuando` es el periodo de cada fila de `fases`.
 * `tests/unit/ingesta.test.ts` exige una indicación para cada campo que entra
 * por ingesta, de modo que un campo nuevo del panel no llega al modelo sin que
 * alguien haya pensado qué pedirle.
 */
export const INDICACIONES: Readonly<Record<ModuloDeIngesta, Readonly<Record<string, string>>>> = {
  patologias: {
    nombre:
      'El nombre de la patología, completo y sin abreviaturas: «Fractura de la diáfisis tibial», no «Fx diáfisis tibia».',
    subtitulo:
      'Una línea que acote el alcance —población, variante, contexto—: «Adulto · trazo simple y complejo». Opcional.',
    segmento: 'El segmento anatómico donde se ordena, escrito exactamente como en el catálogo.',
    codigo: 'El código AO/OTA si lo tiene («42»), o la sigla con que se la conoce. Opcional.',
    tipo:
      '«trauma» para las lesiones agudas; «ortopedia» para la patología no traumática: degenerativa, congénita, del desarrollo, tumoral.',
    definicion:
      'Qué es, a quién afecta y con qué frecuencia, el mecanismo en una frase y las lesiones asociadas que hay que buscar.',
    mecanismo:
      'Cómo se produce: energía, dirección de la fuerza, biomecánica, y la anatomía que explica el patrón de la lesión.',
    clasificacion:
      'Las clasificaciones que se usan en la práctica (AO/OTA, Gustilo-Anderson, Tscherne, Schatzker…). Cada una en un bloque «tabla-clasificacion», con una fila por tipo; cómo aplicarla y para qué sirve, en un bloque «texto».',
    evaluacion:
      'La anamnesis y el examen físico dirigidos, lo que no se puede pasar por alto (estado neurovascular, síndrome compartimental, partes blandas) y las imágenes que se piden, con lo que hay que buscar en ellas.',
    manejo:
      'El tratamiento conservador y el quirúrgico, con sus indicaciones y los criterios que deciden entre uno y otro; técnicas, cuidados posoperatorios y complicaciones.',
    rehabilitacion:
      'Los principios de la rehabilitación y del retorno a la actividad. Las etapas concretas van en «fases».',
    fases:
      'Las fases de la rehabilitación, en orden: cada una con su periodo, su objetivo, qué se trabaja y el criterio para pasar a la siguiente.',
    'fases.cuando':
      'El periodo, contado desde la lesión o la cirugía: «0-2 semanas», «6-12 semanas», «desde los 3 meses».',
    'fases.titulo': 'El objetivo de la fase en pocas palabras: «Proteger la fijación», «Recuperar la carga».',
    'fases.contenido': 'Qué se trabaja en la fase, en un párrafo de texto simple.',
    'fases.criterio': 'Qué tiene que cumplir el paciente para pasar a la fase siguiente. Opcional.',
  },
  maniobras: {
    nombre: 'El nombre de la maniobra, con su epónimo si lo tiene: «Prueba de Lachman».',
    segmento: 'El segmento donde se explora, escrito exactamente como en el catálogo.',
    evalua: 'Qué estructura o función evalúa, en una línea: «Ligamento cruzado anterior».',
    tecnica:
      'Cómo se hace, paso a paso: posición del paciente, posición y manos del examinador, el gesto, y con qué se compara (el lado sano).',
    positivo: 'Qué se considera positivo y, si corresponde, cómo se gradúa.',
    nota: 'La interpretación: sensibilidad y especificidad si la fuente las da (con la cifra tal cual), falsos positivos y negativos, y con qué otras maniobras se combina. Opcional.',
    contenido: 'Material adicional: variantes de la maniobra, perlas y errores frecuentes.',
  },
  'casos-ao': {
    titulo: 'La fractura y la técnica: «Fractura 42-A2 de la tibia: clavo endomedular fresado».',
    codigo: 'El código AO/OTA completo: «42-A2».',
    procedimiento:
      'El resumen del procedimiento: indicación, planificación, posición del paciente, implante elegido y por qué.',
    pasos: 'Los pasos de la cirugía, en el orden en que el residente los recorre.',
    'pasos.titulo': 'El gesto, en pocas palabras: «Punto de entrada», «Reducción indirecta».',
    'pasos.descripcion': 'Qué se hace, con el detalle técnico necesario para hacerlo.',
    'pasos.principio':
      'El principio AO que sostiene ese gesto, en una línea: «Estabilidad relativa: consolidación con callo».',
    'pasos.nota': 'Trucos, errores que evitar y alternativas. Opcional.',
    contenido: 'Material adicional: indicaciones y contraindicaciones, complicaciones, variantes de la técnica.',
  },
  cirugias: {
    nombre: 'El caso quirúrgico: «Fractura 42-A2 de tibia · clavo endomedular».',
    hueso: 'El hueso y su tercio, como en el catálogo de huesos.',
    clasificacion: 'El código AO del trazo, sin el número del hueso: «A2».',
    tecnica: 'La técnica, como en el catálogo de técnicas.',
    codigo:
      'Normalmente vacío: la consola lo compone con el número del hueso y el del trazo. Solo si el caso lleva otro código.',
    resumen: 'El resumen del procedimiento, para leer antes de empezar el caso.',
    instrumental:
      'La bandeja: los instrumentos que el residente tendrá delante, incluidos los que no usa ningún paso (señuelos). Vacía, la forman los que piden los pasos.',
    pasos: 'El guion quirúrgico, en orden. Cada paso declara qué se le mide al residente.',
    'pasos.titulo': 'El gesto, en pocas palabras: «Incisión lateral», «Fresado del canal».',
    'pasos.fase': 'La fase del acto quirúrgico, como en el catálogo de fases.',
    'pasos.descripcion': 'Qué se hace en el paso.',
    'pasos.objetivo':
      'Qué se le mide al residente: «instrumento» (elegir el correcto), «trazo» (la longitud de la incisión), «reduccion» (dejar la fractura dentro de la tolerancia), «fuerza», «perforacion» (calibre y ángulo de la broca) o «fijacion» (placa y tornillos). Con «trazo» hace falta al menos una longitud; con «fuerza», al menos un tope; con «perforacion», al menos un ángulo; con «fijacion», los tornillos; con «instrumento» no puede haber nada de eso.',
    'pasos.instrumento': 'El instrumento correcto para el paso, como en el catálogo de instrumental.',
    'pasos.puntos': 'Cuánto vale el paso. Si la fuente no lo dice, 10.',
    'pasos.trazoMinimo': 'Solo con objetivo «trazo»: la incisión mínima, en milímetros.',
    'pasos.trazoMaximo': 'Solo con objetivo «trazo»: la incisión máxima, en milímetros.',
    'pasos.toleranciaDesplazamiento':
      'Solo con objetivo «reduccion»: el desplazamiento aceptable, en milímetros. Si la fuente no lo dice, déjelo vacío.',
    'pasos.toleranciaDiastasis':
      'Solo con objetivo «reduccion»: la diástasis aceptable, en milímetros. Si la fuente no lo dice, déjelo vacío.',
    'pasos.toleranciaAngulacion':
      'Solo con objetivo «reduccion»: la angulación aceptable, en grados. Si la fuente no lo dice, déjelo vacío.',
    'pasos.fuerzaMinima':
      'Solo con objetivo «fuerza»: la fuerza mínima útil, en newtons. Los libros rara vez la dan: sin ella, no use ese objetivo.',
    'pasos.fuerzaMaxima': 'Solo con objetivo «fuerza»: la fuerza máxima útil, en newtons.',
    'pasos.calibreBroca': 'Solo con objetivo «perforacion»: el calibre de la broca, en milímetros. Vacío: cualquier broca.',
    'pasos.anguloMinimo':
      'Solo con objetivo «perforacion»: el ángulo mínimo con el eje del hueso, en grados (90 es perpendicular). Hace falta al menos uno de los dos ángulos.',
    'pasos.anguloMaximo': 'Solo con objetivo «perforacion»: el ángulo máximo con el eje del hueso, en grados.',
    'pasos.tornillosMinimos': 'Solo con objetivo «fijacion»: cuántos tornillos hacen falta en la placa.',
    'pasos.exigeBicortical': 'Con «perforacion» o «fijacion»: si tienen que cruzar las dos corticales (verdadero o falso).',
    'pasos.exito': 'Lo que se le dice al residente si lo hace bien.',
    'pasos.insuficiente': 'Lo que se le dice si se queda corto.',
    'pasos.excesivo': 'Lo que se le dice si se pasa.',
    'pasos.riesgo': 'La estructura anatómica o el principio en juego en el paso.',
    contenido: 'Material adicional: indicaciones, complicaciones, lo que el caso quiere enseñar.',
  },
  'estudios-ia': {
    nombre: 'El caso de lectura de imágenes: «Radiografía de tobillo tras una inversión forzada».',
    codigo: 'La clasificación propuesta para la imagen: «Weber B», «AO 44-B1».',
    confianza:
      'De 0 a 100: la confianza que se declara en esa clasificación. Es un caso de demostración: ningún modelo la calcula.',
    hallazgos: 'Lo que se ve en la imagen, un hallazgo por fila.',
    'hallazgos.texto': 'Un hallazgo, en texto simple.',
    opciones: 'Las opciones de manejo que se discuten, cada una con sus argumentos a favor y en contra.',
    'opciones.titulo': 'La opción: «Tratamiento ortopédico con bota», «Osteosíntesis con placa».',
    'opciones.frecuente': 'true solo en la opción que coincide con la indicación más frecuente.',
    'opciones.aFavor': 'Los argumentos a favor, uno por fila.',
    'opciones.aFavor.texto': 'Un argumento, en texto simple.',
    'opciones.enContra': 'Los argumentos en contra, uno por fila.',
    'opciones.enContra.texto': 'Un argumento, en texto simple.',
    contenido: 'Aquí va la imagen del estudio, en un bloque «imagen», y lo que haga falta para discutirla.',
  },
}

/** Lo mismo para los campos de cada bloque. */
export const INDICACIONES_DE_BLOQUES: Readonly<Record<BloqueDeIngesta, Readonly<Record<string, string>>>> = {
  texto: {
    '': 'Párrafos con formato: el bloque de uso general.',
    titulo: 'El subtítulo de la sección. Opcional.',
    cuerpo: 'El texto.',
  },
  'lista-clinica': {
    '': 'Puntos con una idea destacada y su desarrollo: criterios, indicaciones, signos de alarma.',
    titulo: 'El encabezado de la lista. Opcional.',
    puntos: 'Los puntos, al menos uno.',
    'puntos.destacado': 'La idea del punto, que sale en negrita, en pocas palabras. Opcional.',
    'puntos.texto': 'El desarrollo del punto.',
  },
  'tabla-clasificacion': {
    '': 'Una clasificación, con una fila por tipo.',
    titulo: 'El nombre de la clasificación: «Gustilo-Anderson».',
    filas: 'Las filas, al menos una.',
    'filas.clave': 'El código o el tipo: «IIIA».',
    'filas.descripcion': 'Qué lo define.',
  },
  advertencia: {
    '': 'Algo que no se debe pasar por alto. Sin abusar: si todo es advertencia, nada destaca.',
    tono: '«atencion»: algo que hay que tener presente; «error-frecuente»: la equivocación que se repite; «perla»: el detalle que distingue a quien sabe.',
    texto: 'El texto de la advertencia.',
  },
  imagen: {
    '': 'Una imagen propia o con licencia, guardada junto al JSON.',
    archivo:
      'La ruta del archivo, relativa al JSON y dentro de su carpeta: «imagenes/rx-tobillo.jpg». PNG, JPG, WEBP o SVG, hasta 50 MB.',
    alt: 'Qué se ve en la imagen, para quien no puede verla. Obligatorio.',
    pie: 'El pie de la imagen. Opcional.',
    ancho: '«completo», «media» (media columna) o «pequena» (pequeña, a la derecha). Si no se dice, completo.',
  },
}
