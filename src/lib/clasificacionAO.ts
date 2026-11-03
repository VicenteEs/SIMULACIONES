/**
 * Lo que la plataforma sabe leer de un código AO/OTA (P-007 E4, D-237).
 *
 * Dos usos. La ficha de patología busca con él la técnica AO y el caso del
 * simulador del mismo segmento, para «Continúe con». Y la lectura de imágenes
 * arma con él el ejercicio de proponer una clasificación: los tres tipos del
 * segmento, con su nombre, para elegir uno y compararlo con el del caso.
 *
 * Solo los trece segmentos de los huesos largos —húmero, antebrazo, fémur y
 * tibia— y no el compendio entero. Son los que tienen las fichas y los casos de
 * hoy, y en ellos los tres tipos tienen un nombre que se puede decir en una
 * línea. Un código de otro hueso se lee igual (`leerCodigoAO`), pero no tiene
 * tipos y el caso se muestra como antes, sin ejercicio: un ejercicio con
 * nombres inventados enseña mal. Los nombres siguen el compendio AO/OTA de
 * 2018 y piden la revisión de un traumatólogo antes de darlos por buenos, como
 * todo texto clínico de la plataforma.
 */

export type TipoAO = 'A' | 'B' | 'C'

export interface CodigoAO {
  hueso: number
  segmento: number
  tipo: TipoAO | null
  grupo: number | null
}

/**
 * Lee el primer código con forma AO/OTA que haya en el texto.
 *
 * Admite cómo lo escribe la gente en el panel: «42-A2», «42A2», «42 - A2.1»,
 * «AO/OTA 42» o el número solo. Dos cifras pegadas y no más, para no leer un
 * «2026» o un «120 mm» como hueso y segmento.
 */
export function leerCodigoAO(texto: unknown): CodigoAO | null {
  if (typeof texto !== 'string') return null
  const hallado = /(?:^|[^\d.])([1-9])([1-9])(?:\s*-?\s*([ABC])([1-3])?(?:\.\d)?)?(?![\d])/i.exec(texto)
  if (!hallado) return null
  return {
    hueso: Number(hallado[1]),
    segmento: Number(hallado[2]),
    tipo: hallado[3] ? (hallado[3].toUpperCase() as TipoAO) : null,
    grupo: hallado[4] ? Number(hallado[4]) : null,
  }
}

/** El hueso y el segmento juntos, «42», que es lo que une una ficha con sus casos. */
export function segmentoAO(texto: unknown): string | null {
  const codigo = leerCodigoAO(texto)
  return codigo ? `${codigo.hueso}${codigo.segmento}` : null
}

/**
 * El segmento de la plataforma (los de la colección `segmentos`, por nombre)
 * donde cae cada segmento AO, para enseñar su recorte del atlas
 * (`encuadreDelSegmento`) en la técnica AO.
 *
 * Los extremos de un hueso largo caen en la articulación y no en el hueso: el
 * húmero proximal («11») es hombro, la tibia proximal («41») es rodilla. La
 * columna (5x) y la pelvis (6x) van enteras a su segmento. Lo que no está aquí
 * —la clavícula, la escápula, la mano por huesos— no lleva imagen.
 */
const SEGMENTO_DE_LA_PLATAFORMA: Record<string, string> = {
  '11': 'Hombro',
  '12': 'Brazo',
  '13': 'Codo',
  '21': 'Codo',
  '22': 'Antebrazo',
  '23': 'Muñeca y mano',
  '31': 'Cadera',
  '32': 'Muslo',
  '33': 'Rodilla',
  '41': 'Rodilla',
  '42': 'Pierna',
  '43': 'Tobillo y pie',
  '44': 'Tobillo y pie',
  '51': 'Columna',
  '52': 'Columna',
  '53': 'Columna',
  '61': 'Pelvis y acetábulo',
  '62': 'Pelvis y acetábulo',
}

export function segmentoDeLaPlataforma(texto: unknown): string | null {
  const segmento = segmentoAO(texto)
  return segmento ? (SEGMENTO_DE_LA_PLATAFORMA[segmento] ?? null) : null
}

export interface TipoDelSegmento {
  tipo: TipoAO
  nombre: string
  descripcion: string
}

const DIAFISARIOS: readonly TipoDelSegmento[] = [
  { tipo: 'A', nombre: 'Simple', descripcion: 'Un solo trazo, dos fragmentos' },
  { tipo: 'B', nombre: 'En cuña', descripcion: 'Un tercer fragmento; los dos principales se tocan al reducir' },
  { tipo: 'C', nombre: 'Multifragmentaria', descripcion: 'Sin contacto entre los fragmentos principales al reducir' },
]

const ARTICULARES: readonly TipoDelSegmento[] = [
  { tipo: 'A', nombre: 'Extraarticular', descripcion: 'El trazo no llega a la superficie articular' },
  { tipo: 'B', nombre: 'Articular parcial', descripcion: 'Parte de la superficie articular sigue unida a la diáfisis' },
  { tipo: 'C', nombre: 'Articular completa', descripcion: 'La superficie articular queda separada de la diáfisis' },
]

const PISTA_DIAFISARIA = 'Cuenta los fragmentos y fíjate si los dos principales siguen tocándose una vez reducidos.'
const PISTA_ARTICULAR =
  'Sigue el trazo hasta el final: ¿llega a la superficie articular? Si llega, ¿queda parte de la articulación unida a la diáfisis?'

interface Segmento {
  nombre: string
  tipos: readonly TipoDelSegmento[]
  pista: string
}

/**
 * Los trece segmentos, con sus tres tipos. Los extremos van con la regla
 * articular salvo tres que el compendio clasifica de otro modo: el húmero
 * proximal (por focos y fragmentos), el fémur proximal (por región) y los
 * maléolos (por la altura del trazo del peroné respecto de la sindesmosis).
 */
const SEGMENTOS: Record<string, Segmento> = {
  '11': {
    nombre: 'Húmero proximal',
    tipos: [
      { tipo: 'A', nombre: 'Extraarticular unifocal', descripcion: 'Dos fragmentos' },
      { tipo: 'B', nombre: 'Extraarticular bifocal', descripcion: 'Tres fragmentos' },
      { tipo: 'C', nombre: 'Articular o de cuatro fragmentos', descripcion: 'El trazo entra en la articulación' },
    ],
    pista: 'Cuenta los fragmentos —cabeza, troquíter, troquín y diáfisis— y mira si el trazo entra en la articulación.',
  },
  '12': { nombre: 'Diáfisis humeral', tipos: DIAFISARIOS, pista: PISTA_DIAFISARIA },
  '13': { nombre: 'Húmero distal', tipos: ARTICULARES, pista: PISTA_ARTICULAR },
  '21': { nombre: 'Antebrazo proximal', tipos: ARTICULARES, pista: PISTA_ARTICULAR },
  '22': { nombre: 'Diáfisis del antebrazo', tipos: DIAFISARIOS, pista: PISTA_DIAFISARIA },
  '23': { nombre: 'Antebrazo distal', tipos: ARTICULARES, pista: PISTA_ARTICULAR },
  '31': {
    nombre: 'Fémur proximal',
    tipos: [
      { tipo: 'A', nombre: 'Región trocantérea', descripcion: 'El trazo pasa por los trocánteres' },
      { tipo: 'B', nombre: 'Cuello femoral', descripcion: 'El trazo está en el cuello' },
      { tipo: 'C', nombre: 'Cabeza femoral', descripcion: 'El trazo está en la cabeza' },
    ],
    pista: 'Ubica el trazo respecto del cuello: por debajo, en el cuello mismo o en la cabeza.',
  },
  '32': { nombre: 'Diáfisis femoral', tipos: DIAFISARIOS, pista: PISTA_DIAFISARIA },
  '33': { nombre: 'Fémur distal', tipos: ARTICULARES, pista: PISTA_ARTICULAR },
  '41': { nombre: 'Tibia proximal', tipos: ARTICULARES, pista: PISTA_ARTICULAR },
  '42': { nombre: 'Diáfisis tibial', tipos: DIAFISARIOS, pista: PISTA_DIAFISARIA },
  '43': { nombre: 'Tibia distal', tipos: ARTICULARES, pista: PISTA_ARTICULAR },
  '44': {
    nombre: 'Maléolos',
    tipos: [
      { tipo: 'A', nombre: 'Infrasindesmal', descripcion: 'El trazo del peroné, por debajo de la sindesmosis' },
      { tipo: 'B', nombre: 'Transindesmal', descripcion: 'El trazo del peroné, a la altura de la sindesmosis' },
      { tipo: 'C', nombre: 'Suprasindesmal', descripcion: 'El trazo del peroné, por encima de la sindesmosis' },
    ],
    pista: 'Ubica el trazo del peroné respecto de la sindesmosis: por debajo, a su altura o por encima.',
  },
}

export interface EjercicioDeClasificacion {
  /** El segmento, «42», y su nombre, «Diáfisis tibial». */
  segmento: string
  nombreDelSegmento: string
  tipos: readonly TipoDelSegmento[]
  pista: string
  /** La respuesta: el tipo del código del caso. */
  correcto: TipoAO
}

/**
 * El ejercicio que se puede armar con el código del caso, o `null` si no se
 * puede: sin código, sin tipo (un «42» a secas no dice cuál es la respuesta) o
 * de un segmento que no está en la tabla.
 */
export function ejercicioDeClasificacion(texto: unknown): EjercicioDeClasificacion | null {
  const codigo = leerCodigoAO(texto)
  if (!codigo?.tipo) return null
  const clave = `${codigo.hueso}${codigo.segmento}`
  const segmento = SEGMENTOS[clave]
  if (!segmento) return null
  return { segmento: clave, nombreDelSegmento: segmento.nombre, tipos: segmento.tipos, pista: segmento.pista, correcto: codigo.tipo }
}
