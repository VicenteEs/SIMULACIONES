import { AUTORIA } from './autoria'

/**
 * Todo lo que el administrador puede cambiar en las páginas públicas sin tocar
 * código: cada foto y cada texto comercial, con su original (P-007 E2).
 *
 * Es la única lista. La leen la portada y `/planes` para pintarse
 * (`leerLaPagina`, en `src/lib/mediosDeLaPagina.ts`), la pestaña «Medios de la
 * página» para ofrecer qué cambiar, y las acciones y la colección para aceptar
 * o rechazar lo que llega. Una pantalla que se escribiera su propia lista
 * ofrecería cambiar un texto que la portada ya no pinta, o pintaría uno que
 * nadie puede cambiar, y ninguna de las dos cosas falla: se ven bien y mienten.
 *
 * Los originales salen del diseño de Penpot (D-231, D-232) y son borrador
 * comercial: están aquí para que la página salga entera el primer día y para
 * que «Restaurar» tenga a qué volver. Lo que el administrador cambia se guarda
 * aparte, como una fila por espacio (`textos-pagina`, `medios-pagina`), y nunca
 * reemplaza al original.
 *
 * Sin Payload ni nada de servidor: lo importan también componentes de cliente y
 * las pruebas, que corren sin base.
 */

export type PaginaPublica = 'portada' | 'planes'

export const PAGINAS_PUBLICAS: readonly { id: PaginaPublica; nombre: string; ruta: string }[] = [
  { id: 'portada', nombre: 'Portada', ruta: '/' },
  { id: 'planes', nombre: 'Planes', ruta: '/planes' },
]

/** Las capturas del atlas con que parte cada foto (`src/components/portada/imagenes/`). */
export type ImagenDePartida =
  | 'capa-piel'
  | 'capa-musculo'
  | 'capa-hueso'
  | 'consola'
  | 'fluoroscopia'
  | 'corte-coronal'
  | 'corte-axial'
  | 'corte-sagital'
  | 'maniobra-lachman'
  | 'tecnica-osteosintesis'

interface Comun {
  /** Estable: es la clave que se guarda en la base. Cambiarlo deja huérfano lo ya cambiado. */
  id: string
  pagina: PaginaPublica
  /** La sección de la página, tal como se lee en la pestaña. */
  seccion: string
  /** Qué es, dicho para quien administra: «Titular», «Pregunta 3». */
  nombre: string
  ayuda?: string
}

export interface EspacioDeFoto extends Comun {
  tipo: 'foto'
  original: ImagenDePartida
  /** La descripción de la original, para el lector de pantalla. */
  descripcion: string
  /** Lo que conviene subir: forma y tamaño. */
  recomendado: string
}

/**
 * `linea` no admite saltos; `parrafo` sí, y se pintan como saltos; `correo` es
 * una dirección que la página convierte en enlace `mailto:`.
 */
export type FormaDelTexto = 'linea' | 'parrafo' | 'correo'

export interface EspacioDeTexto extends Comun {
  tipo: 'texto'
  forma: FormaDelTexto
  maximo: number
  /**
   * Puede quedar vacío, y vacío no se pinta. Así se quita una pregunta
   * frecuente o un punto de una lista sin tocar código: las listas tienen un
   * número fijo de casillas, y las que sobran se dejan en blanco.
   */
  opcional: boolean
  original: string
}

export type Espacio = EspacioDeFoto | EspacioDeTexto

// ---------------------------------------------------------------- límites

/** Ocho megas: una foto de portada bien exportada pesa una fracción de eso. */
export const TECHO_DE_FOTO_BYTES = 8 * 1024 * 1024

/**
 * Sin SVG, a diferencia de `medios`: estas fotos se sirven **sin sesión** y
 * desde el mismo dominio, y un SVG es un documento que puede llevar guiones.
 * En `medios` lo contiene la CSP de `cacheDeArchivoPrivado` y el hecho de que
 * solo lo pide quien tiene cuenta; aquí lo pediría cualquiera.
 */
export const TIPOS_DE_FOTO = ['image/png', 'image/jpeg', 'image/webp'] as const

/** El nombre con que se guarda y se sirve una foto: `<espacio>-<huella>.<extensión>`. */
export const NOMBRE_DE_FOTO = /^[a-z0-9-]+\.(png|jpe?g|webp)$/

/** El texto que se sustituye por la cifra de verdad al pintar. */
export const MARCAS_DE_CIFRA = { piezas: '{piezas}' } as const

/**
 * Los titulares de Penpot pintan su final en celeste («…antes de entrar *al
 * pabellón.*»). Con asteriscos y no con un campo aparte para «la parte
 * resaltada»: el administrador escribe la frase entera y marca lo que quiere,
 * y un titular sin asteriscos sale todo en un color, que también vale.
 */
const AYUDA_RESALTADO = 'Lo que vaya entre *asteriscos* sale resaltado en color.'

// --------------------------------------------------------------- auxiliares

const LARGO = { antetitulo: 60, titular: 110, bajada: 340, boton: 40, punto: 70, detalle: 160, pregunta: 120, respuesta: 600 }

function textos(pagina: PaginaPublica, seccion: string, prefijo: string) {
  const crear =
    (forma: FormaDelTexto) =>
    (clave: string, nombre: string, original: string, maximo: number, opcional = false, ayuda?: string): EspacioDeTexto => ({
      tipo: 'texto',
      id: `${prefijo}.${clave}`,
      pagina,
      seccion,
      nombre,
      forma,
      maximo,
      opcional,
      original,
      ...(ayuda ? { ayuda } : {}),
    })
  return { linea: crear('linea'), parrafo: crear('parrafo'), correo: crear('correo') }
}

/**
 * Una lista de puntos de título y texto, con `casillas` sitios: los que traen
 * original y los que sobran, vacíos y opcionales.
 */
function puntos(
  t: ReturnType<typeof textos>,
  base: string,
  nombre: string,
  pares: readonly (readonly [string, string])[],
  casillas = pares.length,
): EspacioDeTexto[] {
  return Array.from({ length: casillas }, (_, i) => {
    const [titulo, detalle] = pares[i] ?? ['', '']
    return [
      t.linea(`${base}-${i + 1}.titulo`, `${nombre} ${i + 1} · título`, titulo, LARGO.punto, true),
      t.parrafo(`${base}-${i + 1}.texto`, `${nombre} ${i + 1} · texto`, detalle, LARGO.detalle, true),
    ]
  }).flat()
}

/** Pregunta y respuesta, con casillas de sobra para añadir sin tocar código. */
function preguntas(
  t: ReturnType<typeof textos>,
  pares: readonly (readonly [string, string])[],
  casillas = 6,
): EspacioDeTexto[] {
  return Array.from({ length: casillas }, (_, i) => {
    const [pregunta, respuesta] = pares[i] ?? ['', '']
    return [
      t.linea(`pregunta-${i + 1}`, `Pregunta ${i + 1}`, pregunta, LARGO.pregunta, true, i >= pares.length ? 'Libre: escriba una pregunta y su respuesta para que aparezca.' : undefined),
      t.parrafo(`respuesta-${i + 1}`, `Respuesta ${i + 1}`, respuesta, LARGO.respuesta, true),
    ]
  }).flat()
}

interface Capitulo {
  clave: string
  seccion: string
  antetitulo: string
  titular: string
  bajada: string
  puntos: readonly (readonly [string, string])[]
  boton: string
}

function capitulo(c: Capitulo): EspacioDeTexto[] {
  const t = textos('portada', c.seccion, `portada.${c.clave}`)
  return [
    t.linea('antetitulo', 'Antetítulo', c.antetitulo, LARGO.antetitulo),
    t.linea('titular', 'Titular', c.titular, LARGO.titular, false, AYUDA_RESALTADO),
    t.parrafo('bajada', 'Bajada', c.bajada, LARGO.bajada),
    ...puntos(t, 'punto', 'Punto', c.puntos),
    t.linea('boton', 'Botón', c.boton, LARGO.boton),
  ]
}

function foto(
  id: string,
  seccion: string,
  nombre: string,
  original: ImagenDePartida,
  descripcion: string,
  recomendado: string,
  ayuda?: string,
): EspacioDeFoto {
  return { tipo: 'foto', id, pagina: 'portada', seccion, nombre, original, descripcion, recomendado, ...(ayuda ? { ayuda } : {}) }
}

// -------------------------------------------------------------------- fotos

const CAPAS_CALZAN =
  'Las tres capas se superponen al cambiar de una a otra: la nueva tiene que tener el mismo encuadre que las otras dos, o el cuerpo salta.'
const VERTICAL = 'Vertical, unos 700 × 1750 px, con fondo transparente (PNG o WebP).'

const FOTOS: EspacioDeFoto[] = [
  foto('portada.capas.piel', 'Cabecera y Estudia', 'Capa de piel', 'capa-piel', 'El cuerpo entero del atlas, de frente, con la piel.', VERTICAL, CAPAS_CALZAN),
  foto('portada.capas.musculo', 'Cabecera y Estudia', 'Capa de músculo', 'capa-musculo', 'El mismo cuerpo sin la piel: la capa de los músculos.', VERTICAL, CAPAS_CALZAN),
  foto('portada.capas.hueso', 'Cabecera y Estudia', 'Capa de hueso', 'capa-hueso', 'El mismo cuerpo con solo el esqueleto.', VERTICAL, CAPAS_CALZAN),
  foto(
    'portada.examina.imagen',
    'Examina',
    'Imagen del capítulo',
    'maniobra-lachman',
    'Prueba de Lachman en una rodilla derecha flexionada unos 25°, vista desde el lado medial: con el muslo sujeto, la tibia se adelanta bajo el fémur y el ligamento cruzado anterior se tensa.',
    'Cuadrada, de 720 px o más. Se recorta en círculo.',
    'Con la imagen de partida, encima corre el video de la maniobra. Una foto subida la reemplaza a ella y al video.',
  ),
  foto(
    'portada.tecnica.imagen',
    'Técnica AO',
    'Imagen del capítulo',
    'tecnica-osteosintesis',
    'Tibia y peroné derechos con una fractura oblicua de la diáfisis de la tibia, reducida y fijada con una placa recta y tres tornillos a cada lado del trazo.',
    'Vertical, en proporción 11:16 (880 × 1280 px, por ejemplo). Con fondo transparente se ve el azul de la tarjeta.',
  ),
  foto('portada.opera.consola', 'Opera', 'Captura de la consola', 'consola', 'La consola del simulador quirúrgico, con la pierna del caso y la fluoroscopia.', 'Apaisada, 3:2, de 1600 px de ancho o más.'),
  foto('portada.opera.fluoroscopia', 'Opera', 'Imagen de fluoroscopia', 'fluoroscopia', 'La imagen lateral del arco en C sobre la diáfisis de la tibia.', 'Cuadrada, de 400 px o más. Se recorta en círculo.'),
  foto('portada.interpreta.coronal', 'Interpreta', 'Corte coronal', 'corte-coronal', 'Corte coronal del tórax del atlas.', 'Vertical u horizontal, de 900 px o más, con fondo transparente.'),
  foto('portada.interpreta.axial', 'Interpreta', 'Corte axial', 'corte-axial', 'Corte axial del tórax del atlas.', 'Apaisada, de 900 px o más, con fondo transparente.'),
  foto('portada.interpreta.sagital', 'Interpreta', 'Corte sagital', 'corte-sagital', 'Corte sagital de la cabeza del atlas.', 'Vertical, de 700 px o más, con fondo transparente.'),
]

// ------------------------------------------------------------ portada: textos

/**
 * Las tarjetas de «El problema» (D-272): lo de antes, tachado; el título; la
 * frase de «con TraumaHub», y hasta tres puntos. Los títulos y los puntos de
 * las dos primeras son los del texto de sugerencias del 2026-11-05; los de la
 * tercera no venían en él y son una propuesta, a confirmar con el dueño.
 *
 * Las filas conservan los ids de antes de ser tarjetas (`fila-n.antes`,
 * `fila-n.con`): un texto que el administrador ya hubiera cambiado sigue en
 * su sitio.
 */
const TARJETAS_DEL_PROBLEMA = [
  {
    antes: 'Láminas de atlas en dos dimensiones',
    titulo: 'Modelo 3D',
    con: 'Un cuerpo 3D que giras, abres por capas y cortas en tres planos',
    puntos: ['Girar, acercar y orbitar modelo', 'Distintos planos anatómicos', 'Estructuras rotuladas y explicadas'],
  },
  {
    antes: 'La primera osteosíntesis, con el paciente en la mesa',
    titulo: 'Simulación quirúrgica',
    con: 'El caso ensayado antes: instrumental, fluoroscopia y fuerza en newtons',
    puntos: ['Instrumental adecuado', 'Libertad de movimiento', 'Apoyo con fluoroscopia'],
  },
  {
    antes: 'Apuntes, PDF y videos repartidos por todas partes',
    titulo: 'Biblioteca clínica',
    con: 'Diagnósticos, maniobras, técnica quirúrgica y lectura de imágenes en un solo recorrido',
    puntos: ['Clasificaciones y criterios de decisión', 'Maniobras con su técnica e interpretación', 'Contenido revisado por especialistas'],
  },
] as const

/** Casillas de puntos por tarjeta: las que sobran quedan vacías y no se pintan. */
const PUNTOS_POR_TARJETA = 3

const cabecera = textos('portada', 'Cabecera', 'portada.hero')
const problema = textos('portada', 'El problema', 'portada.problema')
const proximamente = textos('portada', 'Próximamente', 'portada.proximamente')
const empezar = textos('portada', 'Cómo empezar', 'portada.empezar')
const nosotros = textos('portada', 'Sobre nosotros', 'portada.nosotros')
const frecuentes = textos('portada', 'Preguntas frecuentes', 'portada.preguntas')
const cotizar = textos('portada', 'Cotizar', 'portada.cotizar')
const general = textos('portada', 'Datos de contacto y pie', 'general')

const TEXTOS_DE_LA_PORTADA: EspacioDeTexto[] = [
  cabecera.linea('antetitulo', 'Antetítulo', 'Plataforma docente de traumatología', LARGO.antetitulo),
  cabecera.linea('titular', 'Titular', 'Ensaya la cirugía antes de entrar *al pabellón.*', LARGO.titular, false, AYUDA_RESALTADO),
  cabecera.parrafo(
    'bajada',
    'Bajada',
    'Un atlas 3D por capas, un simulador con fluoroscopia y una biblioteca clínica revisada. Todo lo que un residente necesita para estudiar, examinar y operar mejor.',
    LARGO.bajada,
  ),
  cabecera.linea('boton-principal', 'Botón principal (lleva a Cotizar)', 'Cotizar para mi servicio', LARGO.boton),
  cabecera.linea('boton-secundario', 'Botón secundario (baja a los capítulos)', 'Ver cómo funciona', LARGO.boton),
  cabecera.linea('pregunta-de-cuenta', 'Antes del enlace «Entrar»', '¿Ya tienes cuenta?', LARGO.antetitulo),

  problema.linea('antetitulo', 'Antetítulo', 'El problema', LARGO.antetitulo),
  problema.linea('titular', 'Titular', 'La traumatología se aprende haciendo. La información escrita *resulta insuficiente.*', LARGO.titular, false, AYUDA_RESALTADO),
  problema.parrafo(
    'bajada',
    'Bajada',
    'TraumaHub reúne ambas cosas: comprensión de la traumatología desde el diagnóstico hasta el manejo definitivo, incorporando simulación quirúrgica de alta fidelidad.',
    LARGO.bajada,
  ),
  problema.linea(
    'cita',
    'Frase destacada (bajo la bajada)',
    'La primera vez en el pabellón ya no es la primera',
    LARGO.titular,
    true,
    'Las comillas las pone la página. Vacía, no se muestra.',
  ),
  ...TARJETAS_DEL_PROBLEMA.flatMap((tarjeta, i) => {
    const fila = `fila-${i + 1}`
    const nombre = `Tarjeta ${i + 1}`
    return [
      problema.linea(`${fila}.antes`, `${nombre} · antes (tachado)`, tarjeta.antes, LARGO.detalle, true),
      problema.linea(`${fila}.titulo`, `${nombre} · título`, tarjeta.titulo, LARGO.punto, true, 'Vacío, la frase de «con TraumaHub» hace de título.'),
      problema.linea(`${fila}.con`, `${nombre} · con TraumaHub`, tarjeta.con, LARGO.detalle, true),
      ...Array.from({ length: PUNTOS_POR_TARJETA }, (_, k) =>
        problema.linea(`${fila}.punto-${k + 1}`, `${nombre} · punto ${k + 1}`, tarjeta.puntos[k] ?? '', LARGO.punto, true),
      ),
    ]
  }),

  ...capitulo({
    clave: 'estudia',
    seccion: 'Estudia',
    antetitulo: 'Estudia · Módulo 01',
    titular: 'Recorre el cuerpo capa por capa',
    bajada: `Quita la piel, abre el músculo y deja solo el hueso. Corta en tres planos y mira por dentro. Cada una de las ${MARCAS_DE_CIFRA.piezas} piezas del atlas tiene su ficha: origen, inserción, inervación e irrigación.`,
    puntos: [
      ['Capas que se encienden y se apagan', 'Piel, músculo, hueso, vasos y órganos sobre el mismo modelo.'],
      ['Cortes en tres planos', 'Axial, coronal y sagital, con la pieza señalada.'],
      ['Biblioteca de patologías', 'Clasificaciones, criterios de decisión y rehabilitación.'],
    ],
    boton: 'Conocer el atlas',
  }),
  ...capitulo({
    clave: 'examina',
    seccion: 'Examina',
    antetitulo: 'Examina · Módulo 02',
    titular: 'Aprende qué buscar y qué significa lo que encuentras',
    bajada:
      'Maniobras por segmento con su técnica y su interpretación. Lo que se enseña junto a la cama del paciente, disponible a cualquier hora.',
    puntos: [
      ['Técnica y video', 'Cómo se ejecuta cada maniobra, con el video del equipo.'],
      ['Interpretación', 'Qué indica el hallazgo y cómo se lee.'],
      ['Residentes y kinesiología', 'Cada maniobra dice a quién va dirigida.'],
    ],
    boton: 'Ver el examen físico',
  }),
  ...capitulo({
    clave: 'tecnica',
    seccion: 'Técnica AO',
    antetitulo: 'Aprende la técnica · Módulo 03',
    titular: 'Cada gesto, con el porqué que lo sostiene',
    bajada:
      'El paso a paso quirúrgico con el principio AO detrás de cada gesto: abordaje, reducción y fijación, en el orden en que se hacen.',
    puntos: [
      ['Paso a paso', 'Del abordaje a la fijación, sin saltarse el criterio.'],
      ['Los principios AO en cada paso', 'Por qué se hace así, y no solo cómo.'],
      ['Clasificaciones AO del caso', 'Cada caso parte de su clasificación.'],
    ],
    boton: 'Ver la técnica AO',
  }),
  ...capitulo({
    clave: 'opera',
    seccion: 'Opera',
    antetitulo: 'Opera · Módulo 04',
    titular: 'Opera antes de operar',
    bajada:
      'El simulador reproduce el caso sobre el modelo: eliges el instrumental, ves la fluoroscopia y cuánta fuerza aplicas, en newtons. Si algo sale mal, queda registrado, sin que ningún paciente corra riesgo.',
    puntos: [
      ['Fluoroscopia en tres proyecciones', 'AP, lateral y oblicua, con zoom y centrado.'],
      ['Fuerza medida en newtons', 'Desplazamiento, angulación y diástasis a la vista.'],
      ['Instrumental y complicaciones', 'Bandeja por familias y registro de lo que sale mal.'],
    ],
    boton: 'Ver el simulador',
  }),
  ...capitulo({
    clave: 'interpreta',
    seccion: 'Interpreta',
    antetitulo: 'Interpreta · Módulo 05',
    titular: 'De la imagen a la decisión',
    bajada:
      'Lectura de imágenes con la clasificación propuesta y las opciones de manejo asociadas al trazo. Una segunda mirada para el especialista.',
    puntos: [
      ['Clasificación propuesta', 'A partir del trazo sobre la imagen.'],
      ['Opciones de manejo asociadas', 'Lo que suele considerarse para esa clasificación.'],
      ['Decide el especialista', 'La propuesta orienta; no reemplaza el criterio clínico.'],
    ],
    boton: 'Ver lectura de imágenes',
  }),

  proximamente.linea('antetitulo', 'Antetítulo', 'Próximamente · Módulo 06', LARGO.antetitulo, true, 'Vacío, la sección entera no se muestra.'),
  proximamente.linea('titular', 'Titular', 'Planificación con imágenes del paciente', LARGO.titular, true),
  proximamente.parrafo(
    'bajada',
    'Bajada',
    'El siguiente eslabón de la cadena: llegar a la mesa con la cirugía ya planificada sobre el caso real.',
    LARGO.bajada,
    true,
  ),

  empezar.linea('antetitulo', 'Antetítulo', 'Cómo empezar', LARGO.antetitulo),
  empezar.linea('titular', 'Titular', 'De la cotización a tu primera clase, en tres pasos', LARGO.titular, false, AYUDA_RESALTADO),
  ...puntos(empezar, 'paso', 'Paso', [
    ['Cuéntanos tu servicio', 'Cotizas indicando cuántos residentes son y qué módulos te interesan.'],
    ['Preparamos tu espacio', 'Activamos las cuentas de tu equipo y dejamos todo listo para empezar.'],
    ['Tus residentes estudian y operan', 'Del atlas al simulador, con el recorrido completo desde el primer día.'],
  ]),

  nosotros.linea('antetitulo', 'Antetítulo', 'Sobre nosotros', LARGO.antetitulo),
  nosotros.linea('titular', 'Titular', 'Quién está detrás de TraumaHub', LARGO.titular, false, AYUDA_RESALTADO),
  nosotros.parrafo(
    'bajada',
    'Bajada',
    'TraumaHub lo desarrolla Chesscore, junto a especialistas que revisan cada ficha antes de que se publique. Creemos que la destreza quirúrgica se entrena antes de tocar al paciente.',
    LARGO.bajada,
  ),
  ...puntos(nosotros, 'sello', 'Sello', [
    ['Contenido revisado', 'Cada ficha la revisa una persona antes de publicarse.'],
    ['Atlas con licencia abierta', 'BodyParts3D, CC BY 4.0, con su atribución a la vista.'],
  ]),
  // La tarjeta de la empresa va siempre primero; las de las personas ya no son
  // texto de la página sino las filas de la pestaña «Equipo» (D-277). Los dos
  // espacios de la «tarjeta de la persona» se quitaron con eso: una fila suya
  // que quede en la base se ignora, como la de cualquier espacio retirado.
  nosotros.linea(
    'empresa.nombre',
    'Tarjeta de la empresa · nombre',
    'Chesscore',
    LARGO.punto,
    true,
    'Vacía, la tarjeta no se muestra. Las tarjetas que la siguen son las de la pestaña «Equipo».',
  ),
  nosotros.linea('empresa.cargo', 'Tarjeta de la empresa · qué hace', 'Desarrollo de la plataforma', LARGO.punto, true),
  nosotros.parrafo('empresa.texto', 'Tarjeta de la empresa · texto', 'Diseña, construye y mantiene TraumaHub.', LARGO.detalle, true),

  frecuentes.linea('antetitulo', 'Antetítulo', 'Preguntas frecuentes', LARGO.antetitulo),
  frecuentes.linea('titular', 'Titular', 'Lo que suelen preguntar antes de cotizar', LARGO.titular, false, AYUDA_RESALTADO),
  frecuentes.parrafo('bajada', 'Bajada', 'Si tu duda no está aquí, escríbenos y la respondemos.', LARGO.bajada),
  ...preguntas(frecuentes, [
    [
      '¿Para quién es TraumaHub?',
      'Para residentes de traumatología y, en el examen físico, también para kinesiología. Cada módulo indica a quién va dirigido.',
    ],
    [
      '¿Necesito instalar algo?',
      'No. TraumaHub funciona en el navegador. El atlas 3D y el simulador piden un computador o una tableta con una tarjeta gráfica corriente; la biblioteca y el examen físico se leen también en el teléfono.',
    ],
    [
      '¿Los casos son pacientes reales?',
      'Los casos del simulador se arman sobre el modelo anatómico del atlas, no sobre un paciente. Las imágenes clínicas que se publican pasan antes por la revisión del contenido.',
    ],
    [
      '¿Cómo se contrata?',
      'Pide una cotización con el formulario de esta página. Te respondemos por correo con una propuesta para tu servicio y, si te acomoda, activamos las cuentas de tu equipo.',
    ],
  ]),

  cotizar.linea('antetitulo', 'Antetítulo', 'Cotizar', LARGO.antetitulo),
  cotizar.linea('titular', 'Titular', 'Lleva TraumaHub a tu servicio', LARGO.titular, false, AYUDA_RESALTADO),
  cotizar.parrafo(
    'bajada',
    'Bajada',
    'Cuéntanos cuántos residentes son y qué módulos te interesan. Te respondemos con una propuesta a la medida de tu servicio.',
    LARGO.bajada,
  ),
  cotizar.linea('garantia-1', 'Garantía 1', 'Sin compromiso', LARGO.punto, true),
  cotizar.linea('garantia-2', 'Garantía 2', 'Propuesta a la medida de tu servicio', LARGO.punto, true),
  cotizar.linea('garantia-3', 'Garantía 3', 'Te respondemos por correo', LARGO.punto, true),
  cotizar.linea('formulario.titulo', 'Título del formulario', 'Solicita tu cotización', LARGO.punto),
  cotizar.linea('formulario.boton', 'Botón de enviar', 'Solicitar cotización', LARGO.boton),
  cotizar.parrafo('formulario.nota', 'Nota bajo el botón', 'Usaremos tus datos solo para responder esta solicitud.', LARGO.detalle, true),
  cotizar.linea('enviada.titular', 'Al enviar · titular', 'Recibimos tu solicitud', LARGO.titular),
  cotizar.parrafo(
    'enviada.bajada',
    'Al enviar · texto',
    'Te escribiremos al correo que indicaste con una propuesta a la medida de tu servicio. Mientras tanto, puedes seguir recorriendo la plataforma.',
    LARGO.bajada,
  ),

  general.correo('correo', 'Correo de contacto', AUTORIA.correo, 120, false, 'Sale en Cotizar, en las preguntas y en el pie, como enlace para escribir.'),
  general.linea('lema', 'Lema del pie', 'Estudiar, examinar y operar mejor.', LARGO.titular),
]

// ------------------------------------------------------------- planes: textos

const planesHero = textos('planes', 'Cabecera', 'planes.hero')
const piloto = textos('planes', 'Piloto', 'planes.piloto')
const comparativa = textos('planes', 'Qué incluye cada plan', 'planes.comparativa')
const planesPreguntas = textos('planes', 'Preguntas', 'planes.preguntas')
const cierre = textos('planes', 'Cierre', 'planes.cierre')

/**
 * Las filas de la comparativa, en orden, con su texto de partida. Qué plan
 * incluye cada una no es texto sino estructura, y vive con la página
 * (`src/components/portada/planes.ts`).
 */
const FILAS = [
  ['contenido', 'Biblioteca, examen físico, técnica AO e imágenes'],
  ['simulador', 'Simulador quirúrgico con fluoroscopia'],
  ['casos-propios', 'Casos propios del servicio en el simulador'],
  ['kinesiologia', 'Rehabilitación para kinesiología'],
  ['panel', 'Panel de avance por residente'],
  ['informe', 'Informe trimestral'],
  ['sedes', 'Varias sedes'],
  ['soporte', 'Soporte por correo'],
  ['puesta-en-marcha', 'Puesta en marcha acompañada'],
] as const

export type FilaDeLaComparativa = (typeof FILAS)[number][0]
export const FILAS_DE_LA_COMPARATIVA: readonly FilaDeLaComparativa[] = FILAS.map(([clave]) => clave)

function plan(clave: string, seccion: string, nombre: string, para: string, incluye: readonly string[], boton = 'Cotizar este plan'): EspacioDeTexto[] {
  const t = textos('planes', seccion, `planes.${clave}`)
  return [
    t.linea('nombre', 'Nombre', nombre, LARGO.punto),
    t.linea('para', 'Para quién', para, LARGO.detalle),
    t.linea('precio', 'Precio', 'A medida', LARGO.punto),
    t.linea('nota-del-precio', 'Nota del precio', 'según residentes', LARGO.punto, true),
    ...Array.from({ length: 5 }, (_, i) =>
      t.linea(`incluye-${i + 1}`, `Incluye ${i + 1}`, incluye[i] ?? '', LARGO.detalle, true),
    ),
    t.linea('boton', 'Botón', boton, LARGO.boton),
  ]
}

const TEXTOS_DE_PLANES: EspacioDeTexto[] = [
  planesHero.linea('antetitulo', 'Antetítulo', 'Planes', LARGO.antetitulo),
  planesHero.linea('titular', 'Titular', 'Un plan para cada tamaño de programa', LARGO.titular),
  planesHero.parrafo(
    'bajada',
    'Bajada',
    'El precio depende de cuántos residentes forman y de cuántas sedes tienen. Cuéntanos tu caso y te respondemos con una propuesta por correo.',
    LARGO.bajada,
  ),
  ...plan('servicio', 'Plan 1', 'Servicio', 'Para un servicio o una unidad docente.', [
    'Los 5 módulos',
    'Hasta 15 cuentas',
    'Panel de seguimiento',
    'Soporte por correo',
  ]),
  ...plan('programa', 'Plan 2 (recomendado)', 'Programa de residencia', 'Para un programa completo, con varias generaciones.', [
    'Todo lo de Servicio',
    'Cuentas sin tope por generación',
    'Casos propios en el simulador',
    'Informe de avance trimestral',
  ]),
  textos('planes', 'Plan 2 (recomendado)', 'planes.programa').linea('sello', 'Sello', 'Recomendado', LARGO.punto, true, 'Vacío, el plan no se destaca.'),
  ...plan('institucion', 'Plan 3', 'Institución', 'Universidades y redes de hospitales.', [
    'Todo lo de Programa',
    'Varias sedes y especialidades',
    'Acceso para kinesiología',
    'Puesta en marcha acompañada',
  ]),

  piloto.linea('titular', 'Titular', 'Empieza con un piloto', LARGO.titular, true, 'Vacío, la sección entera no se muestra.'),
  piloto.parrafo(
    'texto',
    'Texto',
    'Una generación, un servicio y el panel de seguimiento. Sin instalar nada y sin compromiso de continuar. Las condiciones exactas se definen en la cotización.',
    LARGO.bajada,
    true,
  ),
  piloto.linea('boton', 'Botón', 'Pedir un piloto', LARGO.boton, true),

  comparativa.linea('titular', 'Titular', 'Qué incluye cada plan', LARGO.titular),
  comparativa.linea('grupo-contenido', 'Grupo · contenido', 'Contenido', LARGO.punto),
  comparativa.linea('grupo-seguimiento', 'Grupo · seguimiento', 'Seguimiento', LARGO.punto),
  comparativa.linea('grupo-acompanamiento', 'Grupo · acompañamiento', 'Acompañamiento', LARGO.punto),
  ...FILAS.map(([clave, original]) => comparativa.linea(`fila.${clave}`, `Fila · ${original}`, original, LARGO.detalle)),

  planesPreguntas.linea('antetitulo', 'Antetítulo', 'Preguntas', LARGO.antetitulo),
  planesPreguntas.linea('titular', 'Titular', 'Antes de cotizar', LARGO.titular),
  planesPreguntas.parrafo('bajada', 'Bajada', 'Si tu duda no está aquí, escríbenos y te respondemos.', LARGO.bajada),
  ...preguntas(planesPreguntas, [
    [
      '¿Por qué no hay precios publicados?',
      'Porque el costo depende de cuántos residentes y sedes hay. Preferimos darte un número real a uno de catálogo.',
    ],
    ['¿Cuánto tarda la respuesta?', 'Te escribimos por correo apenas revisamos tu solicitud, con la propuesta o con las preguntas que nos falten para hacerla.'],
    [
      '¿Podemos cargar nuestros propios casos?',
      'Sí, en los planes Programa e Institución: los casos de tu servicio se arman en el simulador con el editor del panel.',
    ],
    [
      '¿Funciona en el teléfono?',
      'La biblioteca, el examen físico y la técnica AO se leen bien en el teléfono. El atlas 3D y el simulador piden una pantalla más grande: un computador o una tableta.',
    ],
  ]),

  cierre.linea('titular', 'Titular', '¿Listo para ver cuánto cuesta para tu programa?', LARGO.titular),
  cierre.parrafo('bajada', 'Bajada', 'Seis campos, dos minutos. Te respondemos por correo con una propuesta.', LARGO.bajada),
  cierre.linea('boton-principal', 'Botón principal', 'Cotizar', LARGO.boton),
  cierre.linea('boton-secundario', 'Botón secundario (escribe al correo de contacto)', 'Agendar una demostración', LARGO.boton, true),
]

// -------------------------------------------------------------- el registro

export const ESPACIOS_DE_FOTO: readonly EspacioDeFoto[] = FOTOS
export const ESPACIOS_DE_TEXTO: readonly EspacioDeTexto[] = [...TEXTOS_DE_LA_PORTADA, ...TEXTOS_DE_PLANES]
export const ESPACIOS: readonly Espacio[] = [...ESPACIOS_DE_FOTO, ...ESPACIOS_DE_TEXTO]

const POR_ID = new Map<string, Espacio>(ESPACIOS.map((e) => [e.id, e]))

export const espacioPorId = (id: unknown): Espacio | undefined => (typeof id === 'string' ? POR_ID.get(id) : undefined)

export function espacioDeFoto(id: unknown): EspacioDeFoto | undefined {
  const espacio = espacioPorId(id)
  return espacio?.tipo === 'foto' ? espacio : undefined
}

export function espacioDeTexto(id: unknown): EspacioDeTexto | undefined {
  const espacio = espacioPorId(id)
  return espacio?.tipo === 'texto' ? espacio : undefined
}

// --------------------------------------------------------------- los textos

/**
 * El texto como se guarda: sin espacios en los bordes, y una `linea` en una
 * sola línea. En un párrafo se respetan los saltos que el administrador puso,
 * pero no más de una línea en blanco seguida, que en la página se ve como un
 * hueco que parece un error de maquetación.
 */
export function normalizarTexto(espacio: EspacioDeTexto, bruto: string): string {
  const unificado = bruto.replace(/\r\n?/g, '\n')
  if (espacio.forma === 'parrafo') {
    return unificado
      .split('\n')
      .map((l) => l.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return unificado.replace(/\s+/g, ' ').trim()
}

/** Lo que sí es un correo para el enlace de contacto. Igual de simple que el de `validacion.ts`. */
const PARECE_CORREO = /^[^\s@<>()"]+@[^\s@<>()"]+\.[^\s@<>()"]{2,}$/

/**
 * Por qué un texto no se puede guardar en su espacio, o `null` si se puede.
 *
 * Se pinta como texto plano —React escapa todo—, así que una etiqueta HTML no
 * haría daño: se vería tal cual, con sus ángulos, y por eso se rechaza. Una
 * dirección web tampoco sería un enlace, solo texto que no se puede pulsar; los
 * enlaces de la página son sus botones. Los controles invisibles (un carácter
 * de ancho cero pegado desde Word, un tabulador) se rechazan porque descuadran
 * la línea sin que se vea por qué.
 */
export function problemaDelTexto(espacio: EspacioDeTexto, texto: string): string | null {
  if (texto === '') {
    return espacio.opcional ? null : `«${espacio.nombre}» no puede quedar vacío.`
  }
  const largo = [...texto].length
  if (largo > espacio.maximo) {
    return `«${espacio.nombre}» tiene ${largo} caracteres y el máximo son ${espacio.maximo}.`
  }
  if (/(?!\n)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(texto)) {
    return `«${espacio.nombre}» trae caracteres invisibles (pegados desde otro programa). Escríbalo de nuevo o péguelo como texto sin formato.`
  }
  if (espacio.forma === 'correo') {
    return PARECE_CORREO.test(texto) ? null : `«${espacio.nombre}» no parece una dirección de correo.`
  }
  if (/<\/?[a-zA-Z!]/.test(texto)) {
    return `«${espacio.nombre}» no puede llevar etiquetas HTML: se mostrarían tal cual.`
  }
  if (/:\/\/|\bwww\./i.test(texto)) {
    return `«${espacio.nombre}» no puede llevar direcciones web: en la página no serían un enlace. Los enlaces son los botones.`
  }
  if ((texto.match(/\*/g)?.length ?? 0) % 2 === 1) {
    return `«${espacio.nombre}» tiene un asterisco sin pareja: lo resaltado va entre dos, *así*.`
  }
  return null
}

/**
 * El texto partido en trozos normales y resaltados, según los asteriscos.
 *
 * Lo pinta quien lo recibe, con `<em>` o con lo que quiera: aquí no hay HTML,
 * y por eso un texto no puede meter marcado en la página. Un asterisco suelto
 * no debería llegar (`problemaDelTexto` lo rechaza), pero si llega —un texto
 * guardado antes de esta regla— se pinta tal cual y no se come el resto.
 */
export function trozosResaltados(texto: string): { texto: string; resaltado: boolean }[] {
  const partes = texto.split('*')
  if (partes.length % 2 === 0) return [{ texto, resaltado: false }]
  return partes.flatMap((parte, i) => (parte ? [{ texto: parte, resaltado: i % 2 === 1 }] : []))
}

/** El texto sin las marcas de resaltado: para un `title`, un `aria-label` o el asunto de un correo. */
export const sinResaltado = (texto: string) =>
  trozosResaltados(texto)
    .map((t) => t.texto)
    .join('')

/** Pone la cifra de verdad donde el texto dice `{piezas}`. */
export function sustituirCifras(texto: string, cifras: { piezas?: number | null }, formatear: (n: number) => string): string {
  if (!texto.includes(MARCAS_DE_CIFRA.piezas)) return texto
  const piezas = cifras.piezas
  if (piezas && piezas > 0) return texto.replaceAll(MARCAS_DE_CIFRA.piezas, formatear(piezas))
  // Sin la cifra —el catálogo del atlas no se pudo leer— se quita la marca con
  // su espacio: «cada una de las piezas del atlas» se lee bien, y ni la marca a
  // la vista ni un número inventado.
  return texto.replaceAll(`${MARCAS_DE_CIFRA.piezas} `, '').replaceAll(MARCAS_DE_CIFRA.piezas, '')
}

// ---------------------------------------------------------------- las fotos

const EXTENSIONES: Record<(typeof TIPOS_DE_FOTO)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * El nombre con que se guarda una foto: el espacio y los doce primeros
 * caracteres de la huella del contenido.
 *
 * La ruta pública la sirve con caché inmutable de un año, y eso solo es cierto
 * si un nombre nunca vuelve a señalar otro contenido. Con el nombre que traía
 * el archivo, «portada.png» subido, restaurado y vuelto a subir con otra foto
 * dejaba a cada navegador que ya lo tenía viendo la primera para siempre.
 */
export function nombreDeFoto(espacio: EspacioDeFoto, huella: string, tipo: string): string | null {
  const extension = EXTENSIONES[tipo as (typeof TIPOS_DE_FOTO)[number]]
  if (!extension || !/^[a-f0-9]{12,}$/.test(huella)) return null
  return `${espacio.id.replaceAll('.', '-')}-${huella.slice(0, 12)}.${extension}`
}

/** Con coma, que es como se escribe un decimal aquí. */
const enMegas = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',')

/**
 * Por qué un archivo no sirve como foto de la página, o `null` si sirve: lo
 * que la pestaña dice antes de mandar un solo byte.
 *
 * Es aviso y no puerta: la puerta es la ruta de subida —que corta por peso— y
 * la colección —que mira el tipo por el contenido, no por lo que declara el
 * navegador—. Pero decirlo aquí ahorra subir 8 MB para enterarse al final.
 */
export function problemaDeLaFoto({ tipo, bytes }: { tipo: string; bytes: number }): string | null {
  if (!(TIPOS_DE_FOTO as readonly string[]).includes(tipo)) {
    return tipo === 'image/svg+xml'
      ? 'Un SVG no se admite en las páginas públicas: puede llevar código. Expórtelo como PNG o WEBP.'
      : 'Ese formato no sirve aquí: suba una imagen PNG, JPG o WEBP.'
  }
  if (bytes <= 0) return 'El archivo está vacío.'
  if (bytes > TECHO_DE_FOTO_BYTES) {
    return `La imagen pesa ${enMegas(bytes)} MB y el máximo son ${TECHO_DE_FOTO_BYTES / (1024 * 1024)} MB. Expórtela más liviana antes de subirla.`
  }
  return null
}
