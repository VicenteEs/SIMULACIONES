/**
 * Los insumos que se usaron en una cirugía (P-003 E7).
 *
 * Se anota lo que se **usó**, no lo que se tocó: un instrumento cuenta cuando hizo algo (cortó, separó, pinzó, perforó,
 * midió, cosió, puso una placa o un tornillo, tomó un trozo). Elegirlo y soltarlo no cuenta. Los tornillos se agrupan
 * por tipo y largo («Tornillo cortical 3,5 mm × 36 mm · 4»), porque eso es lo que se pide a la central de esterilización.
 *
 * Todo es puro y sin estado propio: la consola guarda el registro y esta función solo lo hace crecer y lo ordena, para
 * poder probarlo sin lienzo ni React.
 */

export interface UsoDeInsumo {
  /** Con qué se agrupa: el instrumento, o el instrumento y su largo si es un tornillo. */
  clave: string
  /** El instrumento del catálogo, si lo hay: sirve para dejarlo en la bandeja del caso. */
  instrumentoId: string | null
  /** Cómo se lee en la lista: el nombre, y para un tornillo también su largo. */
  nombre: string
  categoria: string | null
  cantidad: number
}

export type RegistroDeInsumos = Record<string, UsoDeInsumo>

export interface InsumoUsado {
  instrumentoId?: string | null
  nombre: string
  categoria?: string | null
  /** Un tornillo no es «uno más»: cada largo es otro insumo y cada uno cuenta. */
  largoMm?: number
}

function milimetros(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',')
}

/**
 * Anota un uso. Devuelve el registro nuevo —y el mismo si no cambia nada—, para que `setState` no repinte la consola
 * cada vez que se vuelve a cortar con un bisturí que ya estaba anotado.
 *
 * Lo que no es un tornillo cuenta **una vez** por instrumento: diez puntadas con la misma aguja son una aguja usada.
 * Los tornillos suman, porque cada uno es un insumo distinto.
 */
export function anotarUso(registro: RegistroDeInsumos, uso: InsumoUsado): RegistroDeInsumos {
  const esTornillo = typeof uso.largoMm === 'number'
  const base = uso.instrumentoId ?? uso.nombre
  const clave = esTornillo ? `${base}|${uso.largoMm}` : base
  const actual = registro[clave]
  if (actual && !esTornillo) return registro
  return {
    ...registro,
    [clave]: {
      clave,
      instrumentoId: uso.instrumentoId ?? null,
      nombre: esTornillo ? `${uso.nombre} × ${milimetros(uso.largoMm as number)} mm` : uso.nombre,
      categoria: uso.categoria ?? null,
      cantidad: (actual?.cantidad ?? 0) + 1,
    },
  }
}

/** Lo que se guarda de un insumo con el recorrido (P-004 E3): lo que se lee, sin el identificador interno. */
export interface InsumoDelRecorrido {
  nombre: string
  categoria: string | null
  cantidad: number
}

/** Cuántos insumos distintos caben en un recorrido: el tope de una lista que se manda al servidor. */
export const MAXIMO_DE_INSUMOS = 100

/**
 * El registro de lo usado, plano y ordenado, para mandarlo con el recorrido.
 *
 * Por categoría en el orden de la bandeja y por nombre dentro de cada una, que es el orden en que se lee: así dos
 * recorridos que usaron lo mismo mandan lo mismo, y `guardarRecorrido` no repite una escritura idéntica.
 */
export function resumenDeInsumos(registro: RegistroDeInsumos, ordenDeCategorias: readonly string[]): InsumoDelRecorrido[] {
  return agruparInsumos(registro, ordenDeCategorias)
    .flatMap((g) => g.insumos.map((u) => ({ nombre: u.nombre, categoria: u.categoria, cantidad: u.cantidad })))
    .slice(0, MAXIMO_DE_INSUMOS)
}

export interface GrupoDeInsumos {
  categoria: string
  insumos: UsoDeInsumo[]
}

/**
 * Los insumos por categoría, en el orden de la bandeja, y dentro de cada una por nombre. Una categoría desconocida va
 * al final como «otros»: un instrumento creado a mano no debe desaparecer de la lista por no estar en el catálogo.
 */
export function agruparInsumos(registro: RegistroDeInsumos, ordenDeCategorias: readonly string[]): GrupoDeInsumos[] {
  const grupos = new Map<string, UsoDeInsumo[]>()
  for (const u of Object.values(registro)) {
    const c = u.categoria && ordenDeCategorias.includes(u.categoria) ? u.categoria : 'otros'
    grupos.set(c, [...(grupos.get(c) ?? []), u])
  }
  const posicion = (c: string) => (c === 'otros' ? ordenDeCategorias.length : ordenDeCategorias.indexOf(c))
  return [...grupos.entries()]
    .sort(([a], [b]) => posicion(a) - posicion(b))
    .map(([categoria, insumos]) => ({
      categoria,
      insumos: [...insumos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }))
}

export interface FilaDeLaBandeja {
  id: string
  nombre: string
  /** Se usó en esta cirugía: viene marcada. */
  usado: boolean
  /** Ya estaba en la bandeja del caso. */
  enLaBandeja: boolean
}

/**
 * Las filas del editor para decidir la bandeja: primero lo usado, todo marcado, y al final lo que estaba en la bandeja
 * y no se usó, **desmarcado**, para poder conservarlo marcándolo. Nada sale de la bandeja sin que se vea.
 */
export function filasParaLaBandeja(
  registro: RegistroDeInsumos,
  bandeja: readonly { id: string; nombre: string }[],
): FilaDeLaBandeja[] {
  const usados = new Map<string, string>()
  for (const u of Object.values(registro)) {
    if (u.instrumentoId && !usados.has(u.instrumentoId)) usados.set(u.instrumentoId, u.nombre)
  }
  const enLaBandeja = new Set(bandeja.map((b) => b.id))
  const nombres = new Map(bandeja.map((b) => [b.id, b.nombre]))
  const filas: FilaDeLaBandeja[] = [...usados.keys()].map((id) => ({
    id,
    // Un tornillo se usó con varios largos: en la bandeja va el instrumento, no cada largo.
    nombre: nombres.get(id) ?? (usados.get(id) as string).replace(/ × [\d,]+ mm$/, ''),
    usado: true,
    enLaBandeja: enLaBandeja.has(id),
  }))
  for (const b of bandeja) if (!usados.has(b.id)) filas.push({ id: b.id, nombre: b.nombre, usado: false, enLaBandeja: true })
  return filas
}
