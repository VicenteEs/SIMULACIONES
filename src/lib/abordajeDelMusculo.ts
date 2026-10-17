import { comportamientoDelInstrumento } from '@/lib/comportamientoDelInstrumento'

/**
 * Con qué instrumentos se corta o se separa un músculo en el simulador (P-003 E10).
 *
 * La ficha del músculo puede dejar escritos los identificadores de instrumento que corresponden (`abordajeCortar` y
 * `abordajeSeparar`, de E10): esos van primero y solos. Sin nada escrito, o con ninguno de los escritos en la
 * bandeja, valen los de siempre, y salen de lo que haya en la bandeja por lo que cada instrumento hace.
 */

/** «farabeuf, senn-miller» → ['farabeuf', 'senn-miller']: sin vacíos ni repetidos, en minúsculas. */
export function identificadoresDeInstrumento(texto: string | null | undefined): string[] {
  return [
    ...new Set(
      (texto ?? '')
        .split(/[,;\n]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}

interface InstrumentoDeLaBandeja {
  id: string
  nombre: string
  slug?: string | null
  icono?: string | null
}

const PREFERIDOS = {
  cortar: ['metzenbaum', 'bisturi', 'electro'],
  separar: ['farabeuf', 'senn', 'hohmann'],
} as const

const sinTildes = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Los instrumentos de la bandeja que sirven para `accion` sobre un músculo, los preferidos primero. */
export function instrumentosParaActuar<T extends InstrumentoDeLaBandeja>(
  accion: 'cortar' | 'separar',
  bandeja: readonly T[],
  delEditor: readonly string[] = [],
): T[] {
  const escritos = bandeja.filter((i) => i.slug && delEditor.includes(i.slug.toLowerCase()))
  if (escritos.length > 0) {
    return [...escritos].sort(
      (a, b) => delEditor.indexOf((a.slug ?? '').toLowerCase()) - delEditor.indexOf((b.slug ?? '').toLowerCase()),
    )
  }
  const preferidos = PREFERIDOS[accion]
  const sirven = bandeja.filter((i) => {
    const q = comportamientoDelInstrumento(i)
    return accion === 'cortar' ? q.corta === 'musculo' || !!q.roma : !!q.separa
  })
  const puesto = (i: InstrumentoDeLaBandeja) => {
    const texto = sinTildes(`${i.slug ?? ''} ${i.nombre}`)
    const k = preferidos.findIndex((p) => texto.includes(p))
    return k < 0 ? preferidos.length : k
  }
  return [...sirven].sort((a, b) => puesto(a) - puesto(b))
}
