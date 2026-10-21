/**
 * Los injertos óseos (P-005 E7): el esponjoso en trozos, que se **compacta en el defecto** o en el foco, y el tricortical de cresta ilíaca, un bloque
 * **estructural** que ocupa el hueco entre los fragmentos y da sostén.
 *
 * Como `enclavado.ts`, es puro y sin `three`: la escena pone la geometría, pero lo que significa —si el defecto está lleno, si el bloque encaja, si falta fijarlo—
 * son reglas que se prueban con números. Todas las cifras son una propuesta de partida que el traumatólogo debe revisar.
 */

export type TipoDeInjerto = 'esponjoso' | 'estructural'

/** El injerto de un instrumento, por su nombre o su slug; `null` si no es un injerto. */
export function injertoDelNombre(i: { slug?: string | null; nombre: string }): TipoDeInjerto | null {
  const n = `${i.slug ?? ''} ${i.nombre}`.toLowerCase()
  if (!/injerto/.test(n)) return null
  return /tricortical|estructural|cresta|bloque/.test(n) ? 'estructural' : 'esponjoso'
}

/** Cuánto esponjoso se deposita con cada clic, en cc (un puñado de trozos de 3 a 8 mm). */
export const VOLUMEN_POR_PUNADO_CC = 2
/** Hasta qué distancia del foco, a lo largo del hueso, vale lo que se deposita, en mm. Más lejos no es el defecto. */
export const CERCA_DEL_FOCO_MM = 25
/** Lo mínimo y lo máximo de la capacidad del defecto que se considera bien relleno. */
export const RELLENO_MINIMO = 0.6
export const RELLENO_MAXIMO = 1.2
/** Cuánto puede diferir el largo del bloque del defecto para que encaje a presión, en mm. */
export const TOLERANCIA_DEL_BLOQUE_MM = 2
/** Largos de bloque que se pueden tallar de la cresta, en mm. */
export const LARGOS_DEL_BLOQUE_MM: readonly number[] = [10, 15, 20, 25, 30, 35, 40, 45, 50]

/**
 * El volumen del defecto que hay entre los fragmentos, en cc: un cilindro del ancho del hueso por la separación. Se aproxima el corte del hueso por un
 * círculo; es una cuenta de orden de magnitud, no un volumen medido.
 */
export function volumenDelDefectoCc(diastasisMm: number, anchoDelHuesoMm: number): number {
  if (!(diastasisMm > 0) || !(anchoDelHuesoMm > 0)) return 0
  const areaMm2 = Math.PI * (anchoDelHuesoMm / 2) ** 2
  return (areaMm2 * diastasisMm) / 1000
}

export type NivelDeRelleno = 'sin-defecto' | 'falta' | 'bien' | 'de-mas'

export interface JuicioDelRelleno {
  nivel: NivelDeRelleno
  /** Cuánto del defecto está lleno, de 0 a más de 1. */
  proporcion: number
  aviso: string | null
}

const cc = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/**
 * ¿Está lleno el defecto? Del 60 al 120 % está bien; menos, falta, y más, se pasó y el injerto se sale del foco sin compactarse. Sin defecto (los fragmentos
 * están juntos) no hay dónde alojar nada.
 */
export function juzgarElRelleno(p: { puestoCc: number; defectoCc: number }): JuicioDelRelleno {
  if (p.defectoCc <= 0) {
    return {
      nivel: 'sin-defecto',
      proporcion: 0,
      aviso: p.puestoCc > 0 ? 'No hay defecto entre los fragmentos: el injerto esponjoso se pone donde falta hueso, no sobre un foco reducido y apoyado.' : null,
    }
  }
  const proporcion = p.puestoCc / p.defectoCc
  if (proporcion < RELLENO_MINIMO) {
    return { nivel: 'falta', proporcion, aviso: `Falta injerto: hay ${cc(p.puestoCc)} cc en un defecto de unos ${cc(p.defectoCc)} cc (${Math.round(proporcion * 100)} %).` }
  }
  if (proporcion > RELLENO_MAXIMO) {
    return { nivel: 'de-mas', proporcion, aviso: `Demasiado injerto: ${cc(p.puestoCc)} cc para un defecto de unos ${cc(p.defectoCc)} cc. Lo que sobra se sale del foco sin compactarse.` }
  }
  return { nivel: 'bien', proporcion, aviso: null }
}

export interface JuicioDelBloque {
  encaja: boolean
  aviso: string | null
}

/**
 * ¿Encaja el bloque estructural? Tiene que tener el largo del defecto, con 2 mm de tolerancia: más corto deja un hueco y no sostiene; más largo no entra a
 * presión y obliga a distraer el foco. Sin defecto, no hay dónde ponerlo.
 */
export function juzgarElBloque(p: { largoMm: number; defectoMm: number }): JuicioDelBloque {
  if (!(p.defectoMm > 0)) return { encaja: false, aviso: 'No hay defecto entre los fragmentos: el bloque estructural ocupa un hueco. Aquí los fragmentos ya están juntos.' }
  const diferencia = p.largoMm - p.defectoMm
  if (diferencia < -TOLERANCIA_DEL_BLOQUE_MM) {
    return { encaja: false, aviso: `El bloque de ${cc(p.largoMm)} mm es corto: deja un hueco de ${cc(-diferencia)} mm y no sostiene. Elija uno más largo.` }
  }
  if (diferencia > TOLERANCIA_DEL_BLOQUE_MM) {
    return { encaja: false, aviso: `El bloque de ${cc(p.largoMm)} mm es largo: sobran ${cc(diferencia)} mm y no entra a presión. Elija uno más corto (el defecto mide ${cc(p.defectoMm)} mm).` }
  }
  return { encaja: true, aviso: null }
}

/** El largo de bloque, de los que se pueden tallar, más cercano a un defecto. */
export function largoDeBloqueParaElDefecto(defectoMm: number): number {
  return LARGOS_DEL_BLOQUE_MM.reduce((mejor, l) => (Math.abs(l - defectoMm) < Math.abs(mejor - defectoMm) ? l : mejor), LARGOS_DEL_BLOQUE_MM[0])
}

/** Lo que el lienzo le cuenta a la consola de los injertos puestos. */
export interface EstadoDelInjerto {
  defectoMm: number
  defectoCc: number
  esponjosoCc: number
  relleno: JuicioDelRelleno
  bloque: (JuicioDelBloque & { largoMm: number; sinFijacion: boolean }) | null
}

/**
 * Lo que el lienzo sabe de lo puesto, sin juzgar: el juicio depende de cuánto defecto hay **ahora**, y eso cambia al reducir. La consola lo juzga con la
 * diástasis de cada momento.
 */
export interface InjertoPuesto {
  esponjosoCc: number
  /** El largo del bloque estructural puesto, o `null` si no hay. */
  bloqueLargoMm: number | null
  /** Ancho del hueso en el foco, en mm: de él sale el volumen del defecto. */
  anchoDelHuesoMm: number
  /** No hay placa fijada, ni tornillos, ni clavo: el bloque estructural sin fijar se mueve. */
  sinFijacion: boolean
}

export function juzgarElInjerto(p: InjertoPuesto, defectoMm: number): EstadoDelInjerto {
  const defectoCc = volumenDelDefectoCc(defectoMm, p.anchoDelHuesoMm)
  return {
    defectoMm,
    defectoCc,
    esponjosoCc: p.esponjosoCc,
    relleno: juzgarElRelleno({ puestoCc: p.esponjosoCc, defectoCc }),
    bloque: p.bloqueLargoMm === null ? null : { ...juzgarElBloque({ largoMm: p.bloqueLargoMm, defectoMm }), largoMm: p.bloqueLargoMm, sinFijacion: p.sinFijacion },
  }
}

/** Una línea por cosa puesta para el recuadro. */
export function listaDelInjerto(e: EstadoDelInjerto | null): string[] {
  if (!e) return []
  const lineas: string[] = []
  if (e.esponjosoCc > 0) lineas.push(`Esponjoso: ${cc(e.esponjosoCc)} cc de ${cc(e.defectoCc)} cc del defecto (${Math.round(e.relleno.proporcion * 100)} %)`)
  if (e.bloque) {
    lineas.push(`Bloque tricortical de ${cc(e.bloque.largoMm)} mm en un defecto de ${cc(e.defectoMm)} mm${e.bloque.encaja ? ': encaja' : ''}${e.bloque.sinFijacion ? ' · sin fijar' : ''}`)
  }
  return lineas
}
