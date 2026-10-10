/**
 * La clasificación AO/OTA que sabe construir el taller (D-161, E4).
 *
 * Es una tabla pura: sin `three`, sin catálogo, sin nada que no sea texto y
 * números. De ella salen las tarjetas del asistente «Fractura», el código que se
 * lee sobre el modelo («42-A2») y lo que `patronesDeFractura.ts` sabe cortar.
 *
 * Referencia: Compendio AO/OTA 2018 (Meinberg *et al.*, *J Orthop Trauma*
 * 2018;32 Supl. 1). Las descripciones son **nuestras**, escritas para esta
 * plataforma, no copia de la publicación. Los patrones son esquemáticos (R3 de
 * P-001): enseñan qué forma tiene el trazo, no sustituyen al atlas de AO, y los
 * valida Cristóbal caso a caso (E4-Q1).
 *
 * Un código se lee así: `42-A2` es el hueso 4 (tibia), el segmento 2 (diáfisis),
 * el tipo A (simple) y el grupo 2 (oblicua).
 */

import { identificadorDeLaPieza } from './huesosAO'

export type SegmentoAO = 1 | 2 | 3
export type TipoAO = 'A' | 'B' | 'C'

/** Los grupos de la v1: los de la diáfisis, completos, y los dos simples de un extremo. */
export type GrupoAO = 'A1' | 'A2' | 'A3' | 'B2' | 'B3' | 'C2' | 'C3' | 'CM'

export interface SegmentoDeLaTabla {
  id: SegmentoAO
  nombre: string
  descripcion: string
}

export const SEGMENTOS_AO: readonly SegmentoDeLaTabla[] = [
  {
    id: 1,
    nombre: 'Proximal',
    descripcion: 'El extremo de arriba: un cuadrado cuyo lado es lo más ancho de la epífisis (regla de Heim).',
  },
  { id: 2, nombre: 'Diáfisis', descripcion: 'El cuerpo del hueso, entre los dos segmentos de extremo.' },
  {
    id: 3,
    nombre: 'Distal',
    descripcion: 'El extremo de abajo: un cuadrado cuyo lado es lo más ancho de la epífisis (regla de Heim).',
  },
]

/**
 * Qué grupo se ofrece en cada segmento. En la diáfisis, la tabla de 2018 completa
 * que cabe en la v1; en los extremos, solo lo extraarticular simple: lo articular
 * (B y C de extremo) depende de la superficie de cada articulación y queda para la v2.
 */
export interface TipoDeLaTabla {
  id: TipoAO
  nombre: string
  descripcion: string
  /** Segmentos en los que la v1 sabe construirlo. */
  segmentos: readonly SegmentoAO[]
}

export const TIPOS_AO: readonly TipoDeLaTabla[] = [
  {
    id: 'A',
    nombre: 'Simple',
    descripcion: 'Un solo trazo: dos fragmentos principales.',
    segmentos: [1, 2, 3],
  },
  {
    id: 'B',
    nombre: 'En cuña',
    descripcion:
      'Un fragmento intermedio que, al reducir, conserva contacto entre los principales. En el compendio de 2018 la diáfisis solo lleva el tipo (42B); el patrón se elige aquí.',
    segmentos: [2],
  },
  {
    id: 'C',
    nombre: 'Multifragmentaria',
    descripcion:
      'Uno o más fragmentos intermedios que dejan sin contacto a los principales. En el compendio de 2018 la diáfisis solo lleva el tipo (42C); el patrón se elige aquí.',
    segmentos: [2],
  },
]

/** Cómo se corta un grupo. Lo interpreta `patronesDeFractura.ts`. */
export type PatronDeCorte =
  | 'transversa'
  | 'oblicua'
  | 'espiroidea'
  | 'cuna-integra'
  | 'cuna-fragmentada'
  | 'segmentaria-integra'
  | 'segmentaria-fragmentada'
  | 'conminuta-focal'

export interface GrupoDeLaTabla {
  id: GrupoAO
  tipo: TipoAO
  nombre: string
  descripcion: string
  patron: PatronDeCorte
  /** Cuántos fragmentos deja, sin contar lo que se parta después con las manos. */
  fragmentos: number
  /** Segmentos en que se ofrece. Los extremos solo admiten oblicua y transversa. */
  segmentos: readonly SegmentoAO[]
  /**
   * Si el patrón ya sabe construirse. `espiroidea` pasó a sí en D-168, pero
   * **aproximada**: su superficie real es una hélice y no un plano (riesgo R1 de
   * P-001), y lo que se corta es un plano muy oblicuo. Una hélice de verdad pide
   * que `osteotomia.ts` sepa tapar una superficie curva.
   */
  disponible: boolean
  /**
   * Lo que se escribe tras el guion en el código, si no es el identificador. El
   * compendio de 2018 ya no numera los grupos de la diáfisis para B y C (`42B`,
   * `42C`), y la «conminuta focal» no es un grupo de AO sino un patrón nuestro
   * dentro del tipo C: su código es `42-C`, sin inventar un número que AO no tiene.
   */
  sufijo?: string
}

export const GRUPOS_AO: readonly GrupoDeLaTabla[] = [
  {
    id: 'A1',
    tipo: 'A',
    nombre: 'Espiroidea',
    descripcion:
      'El trazo da una vuelta alrededor del hueso, como un tornillo. Se dibuja esquematizado: un solo corte muy oblicuo.',
    patron: 'espiroidea',
    fragmentos: 2,
    segmentos: [2],
    disponible: true,
  },
  {
    id: 'A2',
    tipo: 'A',
    nombre: 'Oblicua',
    descripcion: 'Un plano inclinado 30° o más respecto de la perpendicular al hueso.',
    patron: 'oblicua',
    fragmentos: 2,
    segmentos: [1, 2, 3],
    disponible: true,
  },
  {
    id: 'A3',
    tipo: 'A',
    nombre: 'Transversa',
    descripcion: 'Un plano casi perpendicular al hueso, a menos de 30°.',
    patron: 'transversa',
    fragmentos: 2,
    segmentos: [1, 2, 3],
    disponible: true,
  },
  {
    id: 'B2',
    tipo: 'B',
    nombre: 'Cuña íntegra',
    descripcion: 'Una cuña de cortical en un lado del hueso, de una pieza, que no pierde su forma.',
    patron: 'cuna-integra',
    fragmentos: 3,
    segmentos: [2],
    disponible: true,
  },
  {
    id: 'B3',
    tipo: 'B',
    nombre: 'Cuña fragmentada',
    descripcion: 'La misma cuña, pero rota en dos o más trozos.',
    patron: 'cuna-fragmentada',
    fragmentos: 4,
    segmentos: [2],
    disponible: true,
  },
  {
    id: 'C2',
    tipo: 'C',
    nombre: 'Segmentaria íntegra',
    descripcion: 'Un segmento de la diáfisis, entero, entre dos trazos; los dos extremos quedan sin contacto.',
    patron: 'segmentaria-integra',
    fragmentos: 3,
    segmentos: [2],
    disponible: true,
  },
  {
    id: 'C3',
    tipo: 'C',
    nombre: 'Segmentaria fragmentada',
    descripcion: 'El mismo segmento intermedio, pero roto en dos o más trozos.',
    patron: 'segmentaria-fragmentada',
    fragmentos: 4,
    segmentos: [2],
    disponible: true,
  },
  {
    id: 'CM',
    tipo: 'C',
    nombre: 'Conminuta focal («martillo»)',
    descripcion:
      'Un golpe en un solo punto: la diáfisis estalla en varios trozos alrededor de él, como cuando cae un martillo. Es la multifragmentaria que más se ve.',
    patron: 'conminuta-focal',
    fragmentos: 6,
    segmentos: [2],
    disponible: true,
    sufijo: 'C',
  },
]

/**
 * Los huesos que el asistente sabe fracturar: los largos (v1) y, desde D-168, la
 * clavícula y los huesos pequeños de la mano y del pie, que tienen la misma
 * forma de trabajo —un eje largo con dos extremos y una diáfisis— y por eso
 * entran por la misma tabla de segmentos y de grupos.
 */
export type HuesoAO =
  | 'humero'
  | 'radio'
  | 'cubito'
  | 'femur'
  | 'tibia'
  | 'peroneo'
  | 'clavicula'
  | 'metacarpiano'
  | 'falange_mano'
  | 'metatarsiano'
  | 'falange_pie'

export interface HuesoDeLaTabla {
  id: HuesoAO
  /** El número con que empieza un código AO: 1 húmero, 2 antebrazo, 3 fémur, 4 pierna. */
  codigo: string
  nombre: string
  /**
   * Entre el hueso y el segmento: la clavícula es «15.2», no «152». Sin esto, el
   * 5 de «15» se leería como parte del segmento.
   */
  separador?: '.'
  /**
   * El código no es el de AO/OTA sino el nuestro mientras no lo valide el
   * traumatólogo (E4-Q1): se enseña igual, pero la pantalla lo dice. Mejor un
   * código provisional con su aviso que uno que parezca oficial sin serlo.
   */
  provisional?: boolean
  /** Cómo se llaman sus dos extremos, si no son «proximal» y «distal». */
  extremos?: { proximal: string; distal: string }
  /**
   * El código lleva, entre el hueso y el segmento, el rayo o el dedo (D-169): el
   * tercer metacarpiano en su diáfisis es `77.3.2`, y la falange media del
   * segundo dedo en su extremo proximal, `78.2.2.1`. Sin saber de qué pieza se
   * habla se escribe `77.__.2`, que es como lo dibuja el propio compendio.
   */
  conIdentificador?: boolean
  /**
   * Un aviso para quien construye la fractura: lo que este hueso no garantiza.
   * En los huesos de la mano y del pie, de 30 a 50 mm, los cortes en cuña y los
   * segmentarios fragmentados pueden salir con la malla abierta o no llegar a
   * cortar (`SABIDO_QUE_NO_SALE` en las pruebas lo lista pieza por pieza).
   */
  nota?: string
}

const NOTA_DE_LOS_PEQUENOS =
  'Hueso pequeño: con tan poco hueso, los cortes en cuña, los segmentarios fragmentados y la conminuta focal pueden salir con la malla abierta o no llegar a cortar. Si pasa, cambie la posición o elija otro grupo.'

export const HUESOS_AO: readonly HuesoDeLaTabla[] = [
  { id: 'humero', codigo: '1', nombre: 'Húmero' },
  // Antebrazo y pierna, desde 2018: la letra del hueso (R, U, F) va antes del segmento
  // y el compendio lo escribe `2R2`, `2U2`, `4F2`. Hasta D-169 aquí estaba `22R`, que
  // es de la edición anterior.
  { id: 'radio', codigo: '2R', nombre: 'Radio' },
  { id: 'cubito', codigo: '2U', nombre: 'Cúbito' },
  { id: 'femur', codigo: '3', nombre: 'Fémur' },
  { id: 'tibia', codigo: '4', nombre: 'Tibia' },
  { id: 'peroneo', codigo: '4F', nombre: 'Peroné' },
  // Clavícula: AO/OTA 15.1 medial, 15.2 diáfisis, 15.3 lateral.
  {
    id: 'clavicula',
    codigo: '15',
    nombre: 'Clavícula',
    separador: '.',
    extremos: { proximal: 'Medial', distal: 'Lateral' },
    nota: 'La conminuta focal («martillo») no sale en la clavícula: es un hueso curvo y delgado, y las esquirlas no llegan a cortarlo. Use la segmentaria o la cuña.',
  },
  // Mano y pie, contrastados con el compendio AO/OTA 2018 (D-169): mano 7 con
  // metacarpianos 77 y falanges 78; pie 8 con metatarsianos 87 y falanges 88. El
  // rayo o el dedo van tras el hueso (`77.3.2`, `78.2.2.1`). La sintaxis de los
  // metatarsianos (`87.n.s`) no figura en el folleto del compendio y se deduce del
  // metacarpiano y de la falange del pie (`88.1.2.1`): por eso sigue marcada.
  { id: 'metacarpiano', codigo: '77', nombre: 'Metacarpiano', conIdentificador: true, nota: NOTA_DE_LOS_PEQUENOS },
  { id: 'falange_mano', codigo: '78', nombre: 'Falange de la mano', conIdentificador: true, nota: NOTA_DE_LOS_PEQUENOS },
  {
    id: 'metatarsiano',
    codigo: '87',
    nombre: 'Metatarsiano',
    conIdentificador: true,
    provisional: true,
    nota: `${NOTA_DE_LOS_PEQUENOS} El número del hueso (87) es el de 2018; el orden del dedo en el código se deduce del metacarpiano y falta contrastarlo con el compendio completo.`,
  },
  { id: 'falange_pie', codigo: '88', nombre: 'Falange del pie', conIdentificador: true, nota: NOTA_DE_LOS_PEQUENOS },
]

export function huesoAO(id: string): HuesoDeLaTabla | null {
  return HUESOS_AO.find((h) => h.id === id) ?? null
}

export function grupoAO(id: string): GrupoDeLaTabla | null {
  return GRUPOS_AO.find((g) => g.id === id) ?? null
}

export function segmentoAO(id: number): SegmentoDeLaTabla | null {
  return SEGMENTOS_AO.find((s) => s.id === id) ?? null
}

/** El nombre del segmento en un hueso: «proximal» y «distal», salvo en la clavícula («medial», «lateral»). */
export function nombreDelSegmento(hueso: string, segmento: number): string | null {
  const s = segmentoAO(segmento)
  if (!s) return null
  const extremos = huesoAO(hueso)?.extremos
  if (extremos && segmento === 1) return extremos.proximal
  if (extremos && segmento === 3) return extremos.distal
  return s.nombre
}

/** Los grupos que se ofrecen para un segmento y un tipo, en el orden de la tabla. */
export function gruposDe(segmento: SegmentoAO, tipo: TipoAO): GrupoDeLaTabla[] {
  return GRUPOS_AO.filter((g) => g.tipo === tipo && g.segmentos.includes(segmento))
}

/** Los tipos que se ofrecen en un segmento. */
export function tiposDe(segmento: SegmentoAO): TipoDeLaTabla[] {
  return TIPOS_AO.filter((t) => t.segmentos.includes(segmento))
}

/**
 * El código AO de una fractura: `42-A2`. Desde 2018 el radio, el cúbito y el
 * peroné llevan su letra antes del segmento (`2R2-A3`, `2U2-A3`, `4F2-A3`), la
 * clavícula un punto (`15.2-A2`) y los huesos de la mano y del pie, además, el
 * rayo o el dedo (`77.3.2-A3`). Devuelve `null` si algo no está en la tabla.
 *
 * `pieza` es el identificador del atlas, y solo sirve para los huesos con varias
 * piezas por lado (metacarpianos, falanges…): de él sale el rayo o el dedo. Sin
 * él, el identificador se escribe como `__`.
 */
export function codigoAO(hueso: string, segmento: number, grupo: string, pieza?: string): string | null {
  const h = huesoAO(hueso)
  const g = grupoAO(grupo)
  if (!h || !g || !segmentoAO(segmento) || !g.segmentos.includes(segmento as SegmentoAO)) return null
  const identificador = h.conIdentificador ? `.${identificadorDeLaPieza(pieza ?? '') ?? '__'}.` : (h.separador ?? '')
  return `${h.codigo}${identificador}${segmento}-${g.sufijo ?? g.id}`
}

/** Lo que dice la etiqueta sobre el modelo: «42-A2 · Tibia, diáfisis, oblicua». */
export function describirFractura(hueso: string, segmento: number, grupo: string, pieza?: string): string | null {
  const codigo = codigoAO(hueso, segmento, grupo, pieza)
  const h = huesoAO(hueso)
  const g = grupoAO(grupo)
  const s = nombreDelSegmento(hueso, segmento)
  if (!codigo || !h || !g || !s) return null
  return `${codigo} · ${h.nombre}, ${s.toLowerCase()}, ${g.nombre.toLowerCase()}`
}
