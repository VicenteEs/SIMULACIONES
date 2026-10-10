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

export type SegmentoAO = 1 | 2 | 3
export type TipoAO = 'A' | 'B' | 'C'

/** Los grupos de la v1: los de la diáfisis, completos, y los dos simples de un extremo. */
export type GrupoAO = 'A1' | 'A2' | 'A3' | 'B2' | 'B3' | 'C2' | 'C3'

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
    descripcion: 'Un fragmento intermedio que, al reducir, conserva contacto entre los principales.',
    segmentos: [2],
  },
  {
    id: 'C',
    nombre: 'Multifragmentaria',
    descripcion: 'Uno o más fragmentos intermedios que dejan sin contacto a los principales.',
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
   * Un aviso para quien construye la fractura: lo que este hueso no garantiza.
   * En los huesos de la mano y del pie, de 30 a 50 mm, los cortes en cuña y los
   * segmentarios fragmentados pueden salir con la malla abierta o no llegar a
   * cortar (`SABIDO_QUE_NO_SALE` en las pruebas lo lista pieza por pieza).
   */
  nota?: string
}

const NOTA_DE_LOS_PEQUENOS =
  'Hueso pequeño: el código es provisional (lo valida el traumatólogo) y, con tan poco hueso, los cortes en cuña y los segmentarios fragmentados pueden salir con la malla abierta o no llegar a cortar. Si pasa, cambie la posición o elija otro grupo.'

export const HUESOS_AO: readonly HuesoDeLaTabla[] = [
  { id: 'humero', codigo: '1', nombre: 'Húmero' },
  { id: 'radio', codigo: '2R', nombre: 'Radio' },
  { id: 'cubito', codigo: '2U', nombre: 'Cúbito' },
  { id: 'femur', codigo: '3', nombre: 'Fémur' },
  { id: 'tibia', codigo: '4', nombre: 'Tibia' },
  { id: 'peroneo', codigo: '4F', nombre: 'Peroné' },
  // Clavícula: AO/OTA 15.1 medial, 15.2 diáfisis, 15.3 lateral.
  { id: 'clavicula', codigo: '15', nombre: 'Clavícula', separador: '.', extremos: { proximal: 'Medial', distal: 'Lateral' } },
  // Mano y pie: los códigos de AO/OTA 2018 para estos huesos no están validados
  // (E4-Q1); estos son nuestros, con la letra del hueso, y se avisa.
  { id: 'metacarpiano', codigo: '7M', nombre: 'Metacarpiano', provisional: true, nota: NOTA_DE_LOS_PEQUENOS },
  { id: 'falange_mano', codigo: '7F', nombre: 'Falange de la mano', provisional: true, nota: NOTA_DE_LOS_PEQUENOS },
  { id: 'metatarsiano', codigo: '8M', nombre: 'Metatarsiano', provisional: true, nota: NOTA_DE_LOS_PEQUENOS },
  { id: 'falange_pie', codigo: '8F', nombre: 'Falange del pie', provisional: true, nota: NOTA_DE_LOS_PEQUENOS },
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
 * El código AO de una fractura: `42-A2`. Para el radio y el cúbito el hueso lleva
 * letra, y el código la conserva: `22U-A3`. Devuelve `null` si algo no está en la tabla.
 */
export function codigoAO(hueso: string, segmento: number, grupo: string): string | null {
  const h = huesoAO(hueso)
  const g = grupoAO(grupo)
  if (!h || !g || !segmentoAO(segmento) || !g.segmentos.includes(segmento as SegmentoAO)) return null
  // «2R» y «2U» son un hueso y una letra: el segmento se cuela entre las dos.
  // «15», en cambio, son dos cifras de hueso y se separa con un punto.
  const termina = /[A-Za-z]$/.test(h.codigo)
  const letra = termina ? h.codigo.slice(-1) : ''
  const numero = termina ? h.codigo.slice(0, -1) : h.codigo
  return `${numero}${h.separador ?? ''}${segmento}${letra}-${g.id}`
}

/** Lo que dice la etiqueta sobre el modelo: «42-A2 · Tibia, diáfisis, oblicua». */
export function describirFractura(hueso: string, segmento: number, grupo: string): string | null {
  const codigo = codigoAO(hueso, segmento, grupo)
  const h = huesoAO(hueso)
  const g = grupoAO(grupo)
  const s = nombreDelSegmento(hueso, segmento)
  if (!codigo || !h || !g || !s) return null
  return `${codigo} · ${h.nombre}, ${s.toLowerCase()}, ${g.nombre.toLowerCase()}`
}
