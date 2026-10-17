/**
 * El listado global de estructuras anatómicas: lo puro (D-179, P-003 E8).
 *
 * Cada pieza del atlas —2.231 hoy— tiene una ficha con lo que un residente
 * quiere saber de ella: nombre latino, definición, origen, inserción,
 * inervación, acción e irrigación. Cristóbal pidió que esas fichas se llenen
 * **una sola vez** y que sirvan en todos los sitios: el taller anatómico, el
 * simulador y el modelo que se exporta. Por eso la ficha cuelga del
 * identificador del atlas (`FJ…`) y no de una cirugía ni de un caso.
 *
 * Aquí no hay base de datos ni React: lo leen la pantalla del panel (en el
 * navegador), la planilla de Excel y la colección (en el servidor), y que sea
 * una sola copia es lo que impide que el contador y la planilla discrepen sobre
 * qué es una ficha «completa».
 */
import { piezaDe } from '@/atlas/formato'

// ------------------------------------------------------------------- campos

/**
 * Los campos de texto de la ficha, en el orden de las capturas de la aplicación
 * de anatomía que citó Cristóbal («Estructura seleccionada» y «Aprenda más»).
 * El mismo orden se usa en la ventana de edición, en la planilla y en la ficha
 * que verá el residente.
 */
export const CAMPOS_DE_LA_FICHA = [
  'nombreLatino',
  'definicion',
  'origen',
  'insercion',
  'inervacion',
  'accion',
  'irrigacion',
  'notas',
  // Con qué instrumentos se corta o se separa este músculo en el simulador (P-003 E10): identificadores de instrumento
  // separados por comas. Vacío: los de siempre, que salen de lo que haya en la bandeja.
  'abordajeCortar',
  'abordajeSeparar',
] as const

export type CampoDeLaFicha = (typeof CAMPOS_DE_LA_FICHA)[number]

/** Lo que hay escrito en una ficha. Un campo sin escribir es `''` o no está. */
export type FichaDeEstructura = Partial<Record<CampoDeLaFicha, string | null | undefined>>

/** Una fila de la colección `estructuras-anatomicas`, tal como la leen la pantalla y la siembra. */
export interface FilaDeEstructura extends FichaDeEstructura {
  id: number | string
  atlasId: string
  nombreOriginal: string
  sistema?: string | null
  region?: string | null
  lado?: LadoDeLaPieza | null
  oculta?: boolean | null
  huerfana?: boolean | null
  updatedAt?: string
}

/** La ficha entera de una pieza, lista para la ventana de edición. Un campo sin escribir es `''`. */
export interface FichaCompleta extends Record<CampoDeLaFicha, string> {
  atlasId: string
  /** El nombre del taller, en español, con su lado. */
  nombre: string
  /** El original en inglés. */
  original: string
  sistema: string
  region: string
  lado: LadoDeLaPieza | null
  oculta: boolean
  /** La pieza ya no está en el atlas. */
  huerfana: boolean
  /** Si ya hay fila en la base. Sin ella, guardar la crea. */
  sembrada: boolean
  /** Cuándo se guardó por última vez, o `null` si nunca. */
  actualizada: string | null
}

export const ETIQUETA_DEL_CAMPO: Readonly<Record<CampoDeLaFicha, string>> = {
  nombreLatino: 'Nombre latino',
  definicion: 'Definición',
  origen: 'Origen',
  insercion: 'Inserción',
  inervacion: 'Inervación',
  accion: 'Acción',
  irrigacion: 'Irrigación',
  notas: 'Notas',
  abordajeCortar: 'Cortar con (identificadores de instrumento, separados por comas)',
  abordajeSeparar: 'Separar con (identificadores de instrumento, separados por comas)',
}

/**
 * Cuánto cabe en cada campo.
 *
 * Es un techo contra el pegado accidental de una página entera, no una medida
 * de lo que se espera: una definición de manual son 300 caracteres. Se **rechaza**
 * lo que lo pasa y no se corta, en el panel y en la planilla: un texto
 * recortado a media frase se guarda como si estuviera completo, y es
 * exactamente la información que el dueño pidió no perder.
 */
export const LARGO_MAXIMO_DEL_CAMPO: Readonly<Record<CampoDeLaFicha, number>> = {
  nombreLatino: 200,
  definicion: 3000,
  origen: 1500,
  insercion: 1500,
  inervacion: 1500,
  accion: 1500,
  irrigacion: 1500,
  notas: 3000,
  abordajeCortar: 300,
  abordajeSeparar: 300,
}

/**
 * Deja un texto en la forma en que se guarda y se compara: saltos de línea de
 * Unix, sin controles, sin espacios en los extremos. Lo que no es texto —un
 * número que Excel dejó en una celda, un `null`— no es una ficha escrita: un
 * número se acepta como texto, lo demás es vacío.
 */
export function normalizarTexto(valor: unknown): string {
  if (typeof valor === 'number' && Number.isFinite(valor)) valor = String(valor)
  if (typeof valor !== 'string') return ''
  return valor
    .replace(/\r\n?/g, '\n')
    // Los controles salvo el tabulador y el salto: Excel y los editores de texto
    // dejan a veces un carácter invisible que luego rompe una comparación.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F￾￿]/g, '')
    .trim()
}

/** ¿Hay algo escrito? Un espacio no cuenta. */
export const hayTexto = (valor: unknown): boolean => normalizarTexto(valor) !== ''

// ------------------------------------------------------ qué cuenta por sistema

/** El tipo de estructura a efectos de qué se le pregunta. */
export type FamiliaDeEstructura = 'musculo' | 'hueso' | 'arteria' | 'vena' | 'nervio' | 'conectivo' | 'otro'

const FAMILIA_POR_SISTEMA: Readonly<Record<string, FamiliaDeEstructura>> = {
  muscular: 'musculo',
  skeletal: 'hueso',
  arterial: 'arteria',
  venous: 'vena',
  nervous: 'nervio',
  connective: 'conectivo',
}

/**
 * Qué campos cuentan para dar una ficha por completa, según el sistema.
 *
 * Un hueso no tiene inserción y una arteria no tiene inervación: exigirlas
 * dejaría el contador clavado por debajo de lo que alguien puede llenar. El
 * nombre latino y las notas no cuentan —se agradecen, no se exigen—. La tabla
 * es la de la sección E8 del plan P-003; «los demás» (aparato digestivo,
 * respiratorio, órganos de los sentidos…) piden solo la definición, que es lo
 * que se puede decir de un órgano sin inventar un origen que no tiene.
 */
export const CAMPOS_QUE_CUENTAN: Readonly<Record<FamiliaDeEstructura, readonly CampoDeLaFicha[]>> = {
  musculo: ['definicion', 'origen', 'insercion', 'inervacion', 'accion', 'irrigacion'],
  hueso: ['definicion', 'irrigacion'],
  arteria: ['definicion', 'origen', 'irrigacion'],
  vena: ['definicion', 'irrigacion'],
  nervio: ['definicion', 'origen', 'inervacion', 'accion'],
  conectivo: ['definicion', 'origen', 'insercion'],
  otro: ['definicion'],
}

/**
 * Cómo se llama el campo según la familia: en una arteria, «Irrigación» es qué
 * irriga; en una vena, qué drena; en un nervio, «Inervación» es qué inerva. El
 * campo es el mismo —no hace falta otra columna—, pero quien llena la ficha
 * tiene que saber qué se le pregunta. Sale en la ventana y en la planilla.
 */
export function etiquetaDelCampo(campo: CampoDeLaFicha, familia: FamiliaDeEstructura): string {
  if (campo === 'irrigacion') {
    if (familia === 'arteria') return 'Irrigación (qué irriga)'
    if (familia === 'vena') return 'Irrigación (qué drena)'
  }
  if (campo === 'inervacion' && familia === 'nervio') return 'Inervación (qué inerva)'
  if (campo === 'origen' && familia === 'nervio') return 'Origen (de dónde sale)'
  return ETIQUETA_DEL_CAMPO[campo]
}

export function familiaDeSistema(sistema: string | null | undefined): FamiliaDeEstructura {
  return (sistema ? FAMILIA_POR_SISTEMA[sistema] : undefined) ?? 'otro'
}

export function camposQueCuentan(sistema: string | null | undefined): readonly CampoDeLaFicha[] {
  return CAMPOS_QUE_CUENTAN[familiaDeSistema(sistema)]
}

/** Los campos que cuentan y todavía no tienen texto, en el orden de la ficha. */
export function camposQueFaltan(sistema: string | null | undefined, ficha: FichaDeEstructura): CampoDeLaFicha[] {
  return camposQueCuentan(sistema).filter((campo) => !hayTexto(ficha[campo]))
}

// ------------------------------------------------------------------- estado

/**
 * En qué punto está una ficha.
 *
 * - `oculta`: marcada «No mostrar»: no abre ficha y no se cuenta.
 * - `sin-pieza`: la pieza ya no está en el atlas (se regeneró): no se borra, se
 *   enseña aparte para casarla a mano.
 * - `completa`: tiene todo lo que cuenta para su sistema.
 * - `a-medias`: tiene algo escrito, pero falta algo de lo que cuenta.
 * - `sin-empezar`: nada escrito.
 */
export type EstadoDeEstructura = 'completa' | 'a-medias' | 'sin-empezar' | 'oculta' | 'sin-pieza'

export const ETIQUETA_DEL_ESTADO: Readonly<Record<EstadoDeEstructura, string>> = {
  completa: 'Completa',
  'a-medias': 'A medias',
  'sin-empezar': 'Sin empezar',
  oculta: 'No se muestra',
  'sin-pieza': 'Sin pieza en el atlas',
}

export function estadoDeLaFicha(
  sistema: string | null | undefined,
  ficha: FichaDeEstructura,
  marcas: { oculta?: boolean | null; huerfana?: boolean | null } = {},
): EstadoDeEstructura {
  if (marcas.huerfana) return 'sin-pieza'
  if (marcas.oculta) return 'oculta'
  if (camposQueFaltan(sistema, ficha).length === 0) return 'completa'
  return CAMPOS_DE_LA_FICHA.some((campo) => hayTexto(ficha[campo])) ? 'a-medias' : 'sin-empezar'
}

/** Pendiente es lo que falta por llenar: a medias o sin empezar. */
export const esPendiente = (estado: EstadoDeEstructura): boolean =>
  estado === 'a-medias' || estado === 'sin-empezar'

// --------------------------------------------------------------------- lado

export type LadoDeLaPieza = 'derecho' | 'izquierdo'

/**
 * De qué lado del cuerpo es una pieza, o `null` si de ninguno.
 *
 * Los nombres de BodyParts3D llevan el lado delante —«Right tibia»— y es lo
 * primero que se mira. Si el lado va en medio («Anterior branch of right …»)
 * también vale, pero solo si el nombre dice uno: cinco ramas coronarias dicen
 * «right» y «left» a la vez, y ahí el nombre no decide. Entonces se mira la
 * región, que el atlas separa por lado en las extremidades, y si tampoco
 * dice nada —la línea media, el tronco— no hay lado.
 */
export function ladoDeLaPieza(nombreOriginal: string, region?: string | null): LadoDeLaPieza | null {
  const inicio = /^(right|left)\b/i.exec(nombreOriginal.trim())
  if (inicio) return inicio[1].toLowerCase() === 'right' ? 'derecho' : 'izquierdo'
  const derecho = /\bright\b/i.test(nombreOriginal)
  const izquierdo = /\bleft\b/i.test(nombreOriginal)
  if (derecho !== izquierdo) return derecho ? 'derecho' : 'izquierdo'
  if (region?.endsWith('-derecho') || region?.endsWith('-derecha')) return 'derecho'
  if (region?.endsWith('-izquierdo') || region?.endsWith('-izquierda')) return 'izquierdo'
  return null
}

export const ETIQUETA_DEL_LADO: Readonly<Record<LadoDeLaPieza, string>> = {
  derecho: 'Derecho',
  izquierdo: 'Izquierdo',
}

// ------------------------------------------------------------- identificador

/**
 * La pieza del atlas a la que pertenece un identificador del taller o del
 * modelo: un trozo de hueso partido conserva el de su pieza entera
 * (`PiezaLeida.trozo`), y los del taller se escriben `FJ3387#a`, `FJ3387#b#a`.
 *
 * Es lo que permite anotar «Tibia derecha» una sola vez aunque en pantalla haya
 * dos trozos, sin adivinar nada por el nombre («Tibia derecha_1»,
 * «Tibia derecha_2»): se sube por el identificador, que no se equivoca.
 */
export const atlasIdDeLaPieza = (id: string): string => piezaDe(id.trim())

// ----------------------------------------------------------------- «No mostrar»

/**
 * Lee la casilla «No mostrar» de una celda de la planilla: `true`, `false`, o
 * `null` si la celda está vacía o dice algo que no se entiende (y entonces no
 * cambia nada). Acepta lo que escribiría una persona o una IA: sí, x, 1,
 * verdadero, true… Lo dudoso **no** esconde una pieza: ocultar es la dirección
 * peligrosa, porque una pieza oculta sale del contador y no abre ficha.
 */
export function leerMarcaDeOculta(valor: unknown): boolean | null {
  if (typeof valor === 'boolean') return valor
  if (typeof valor === 'number') return valor === 1 ? true : valor === 0 ? false : null
  const texto = normalizarTexto(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (['si', 's', 'x', '1', 'true', 'verdadero', 'oculta', 'oculto', 'ocultar'].includes(texto)) return true
  if (['no', 'n', '0', 'false', 'falso'].includes(texto)) return false
  return null
}

// ----------------------------------------------------------------- contador

export interface FilaParaContar {
  region: string
  estado: EstadoDeEstructura
}

export interface Conteo {
  /** Todas las fichas con pieza en el atlas, ocultas incluidas. */
  total: number
  /** Las que se cuentan: ni ocultas ni sin pieza. Es el 100 % de los porcentajes. */
  porLlenar: number
  completas: number
  aMedias: number
  sinEmpezar: number
  /** `aMedias + sinEmpezar`. */
  pendientes: number
  ocultas: number
  sinPieza: number
  /** Del 0 al 100, con un decimal, sobre `porLlenar`. */
  porcentajeCompletas: number
  porcentajePendientes: number
}

/**
 * Un porcentaje con un decimal; `0` si no hay nada que dividir. Lo que no es cero
 * no baja de 0,1: con 2.231 piezas, una ficha llena es el 0,04 %, y redondeado
 * diría «0 %» —como si no se hubiera hecho nada— justo cuando se acaba de hacer.
 */
export function porcentaje(parte: number, total: number): number {
  if (total <= 0 || parte <= 0) return 0
  return Math.max(0.1, Math.round((parte / total) * 1000) / 10)
}

export function contarEstructuras(filas: readonly Pick<FilaParaContar, 'estado'>[]): Conteo {
  let completas = 0
  let aMedias = 0
  let sinEmpezar = 0
  let ocultas = 0
  let sinPieza = 0
  for (const { estado } of filas) {
    if (estado === 'completa') completas += 1
    else if (estado === 'a-medias') aMedias += 1
    else if (estado === 'sin-empezar') sinEmpezar += 1
    else if (estado === 'oculta') ocultas += 1
    else sinPieza += 1
  }
  const porLlenar = completas + aMedias + sinEmpezar
  const pendientes = aMedias + sinEmpezar
  return {
    total: filas.length - sinPieza,
    porLlenar,
    completas,
    aMedias,
    sinEmpezar,
    pendientes,
    ocultas,
    sinPieza,
    porcentajeCompletas: porcentaje(completas, porLlenar),
    porcentajePendientes: porcentaje(pendientes, porLlenar),
  }
}

/** El conteo de cada región, en el orden en que aparecen. */
export function contarPorRegion(filas: readonly FilaParaContar[]): Map<string, Conteo> {
  const grupos = new Map<string, FilaParaContar[]>()
  for (const fila of filas) {
    const lista = grupos.get(fila.region)
    if (lista) lista.push(fila)
    else grupos.set(fila.region, [fila])
  }
  return new Map([...grupos].map(([region, lista]) => [region, contarEstructuras(lista)]))
}

// ------------------------------------------------------------------- filtro

const sinTildes = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * ¿Casa esta pieza con lo que se escribió en el filtro?
 *
 * Como el buscador del taller (`casaConLaBusqueda`): sin tildes, sin
 * mayúsculas y por palabras en cualquier orden, de modo que «peroneo derecho»
 * encuentra «Peroneo corto derecho». Cada palabra se busca como trozo, porque
 * se usa mientras se escribe. Todas las palabras tienen que estar **en el mismo
 * nombre** —el español o el original—, no media consulta en cada uno. Se
 * repite aquí, en vez de importar la del taller, porque esa trae consigo la
 * tabla entera de traducciones y el panel recibe los dos nombres ya resueltos
 * por el servidor.
 */
export function casaConElFiltro(nombres: readonly string[], consulta: string): boolean {
  const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  return nombres.some((nombre) => {
    const plano = sinTildes(nombre)
    return palabras.every((palabra) => plano.includes(palabra))
  })
}
