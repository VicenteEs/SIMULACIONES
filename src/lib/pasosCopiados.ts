import { CLAVE_DE_FILA, nuevaClave } from '@/admin/identidadDeBloques'

/**
 * Copiar y pegar pasos entre cirugías (petición de Cristóbal).
 *
 * «Muchos de los pasos se van a repetir entre una cirugía y otra: el
 * posicionamiento, el abordaje». Escribirlos otra vez en cada caso es el trabajo
 * que más tiempo le come a quien arma las animaciones educativas, y copiar y
 * pegar es lo que cualquiera espera poder hacer.
 *
 * Lo copiado se guarda en el navegador (`localStorage`) y no en la base:
 *
 * - viaja de un caso a otro sin pasar por el servidor ni por permisos,
 * - sobrevive a recargar y a cambiar de ficha, que es justo cuando se usa,
 * - y no deja en la base un portapapeles que nadie borra.
 *
 * El precio es que es de **ese navegador**: copiar aquí y pegar en otro
 * ordenador no funciona. Para eso está el archivo (`pasosAArchivo`).
 *
 * Esto es la parte pura —empaquetar, desempaquetar, adaptar al caso de destino—,
 * y se prueba sin navegador. Lo que toca `localStorage` está en
 * `portapapelesDePasos.ts`.
 */

type Fila = Record<string, unknown>

export interface PasosCopiados {
  /** Para reconocer el formato si algún día cambia. */
  version: 1
  copiadoEn: string
  /** Nombre del caso de origen, para decirlo al pegar. */
  desdeElCaso: string
  pasos: Fila[]
}

/**
 * Lo que no viaja de un paso, y por qué:
 *
 * - `id`: es la clave primaria de la fila en la base de ese caso; en el otro caso
 *   sería la de una fila ajena.
 * - la clave de fila del cliente: la pone `nuevaClave` al pegar, que es la que
 *   distingue hermanos en pantalla.
 *
 * Lo demás sí: texto, objetivo, rangos, instrumento y fase. El instrumento y la
 * fase son relaciones a catálogos compartidos por todos los casos, así que el
 * mismo identificador vale en el caso de destino.
 */
const NO_VIAJA = new Set(['id', CLAVE_DE_FILA])

function limpiar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpiar)
  if (valor && typeof valor === 'object') {
    const salida: Fila = {}
    for (const [clave, v] of Object.entries(valor as Fila)) {
      if (NO_VIAJA.has(clave)) continue
      salida[clave] = limpiar(v)
    }
    return salida
  }
  return valor
}

/** Una relación llega como número, texto o documento poblado: al copiar queda solo el identificador. */
function soloElIdentificador(v: unknown): unknown {
  if (v && typeof v === 'object') return (v as { id?: unknown }).id ?? null
  return v ?? null
}

export function empaquetarPasos(pasos: readonly Fila[], indices: readonly number[], desdeElCaso: string, ahora = new Date()): PasosCopiados {
  const elegidos = [...new Set(indices)]
    .filter((i) => i >= 0 && i < pasos.length)
    .sort((a, b) => a - b)
    .map((i) => {
      const original = pasos[i]
      const paso = limpiar(original) as Fila
      // El instrumento y la fase pueden venir poblados de la base. Se toma su identificador del paso
      // original y no del limpio: `limpiar` quita todo `id`, también el del documento poblado, que aquí es
      // justo lo único que hay que conservar.
      if ('instrumento' in original) paso.instrumento = soloElIdentificador(original.instrumento)
      if ('fase' in original) paso.fase = soloElIdentificador(original.fase)
      return paso
    })
  return { version: 1, copiadoEn: ahora.toISOString(), desdeElCaso, pasos: elegidos }
}

export function esPasosCopiados(valor: unknown): valor is PasosCopiados {
  if (!valor || typeof valor !== 'object') return false
  const v = valor as Partial<PasosCopiados>
  return v.version === 1 && Array.isArray(v.pasos) && v.pasos.every((p) => p && typeof p === 'object')
}

export interface ResultadoDePegar {
  pasos: Fila[]
  /** Cuántos pasos se pegaron. */
  pegados: number
  /** En qué posición quedó el primero que se pegó: para llevar la vista hasta él. */
  primero: number
  /** Qué hubo que adaptar al caso de destino, dicho en una frase; vacío si nada. */
  avisos: string[]
}

/**
 * Inserta lo copiado en el caso de destino, **después** de `despuesDe` (−1 es al
 * principio), con filas nuevas.
 *
 * Qué se adapta:
 * - `muestra`: son los nombres de los objetos del modelo de origen. Si el modelo
 *   de destino no trae alguno, ese paso lo declararía a ciegas y la consola
 *   apagaría de más; se quitan los que no están, y si no queda ninguno el paso
 *   vuelve a «lo mismo que el anterior». `nodosDelModelo` es `null` mientras el
 *   modelo no ha cargado, y entonces se deja tal cual: preguntar antes de saber
 *   es borrar lo que quizá sí estaba.
 */
export function pegarPasos(
  destino: readonly Fila[],
  copiados: PasosCopiados,
  despuesDe: number,
  nodosDelModelo: readonly string[] | null,
): ResultadoDePegar {
  const avisos: string[] = []
  const conocidos = nodosDelModelo ? new Set(nodosDelModelo) : null
  let sinPiezas = 0
  const nuevos = copiados.pasos.map((origen) => {
    const paso = limpiar(origen) as Fila
    if (Array.isArray(paso.muestra)) {
      const antes = paso.muestra as Fila[]
      const despues = conocidos
        ? antes.filter((m) => typeof m.nodo === 'string' && conocidos.has(m.nodo))
        : antes
      if (despues.length !== antes.length) sinPiezas++
      paso.muestra = despues.map((m) => ({ ...m, [CLAVE_DE_FILA]: nuevaClave() }))
    }
    return { ...paso, [CLAVE_DE_FILA]: nuevaClave() } as Fila
  })
  if (sinPiezas > 0) {
    avisos.push(
      sinPiezas === 1
        ? 'Un paso enseñaba piezas que este modelo no tiene: se quitaron de su lista de «piezas que se ven».'
        : `${sinPiezas} pasos enseñaban piezas que este modelo no tiene: se quitaron de su lista de «piezas que se ven».`,
    )
  }
  const corte = Math.min(destino.length, Math.max(-1, despuesDe) + 1)
  return {
    pasos: [...destino.slice(0, corte), ...nuevos, ...destino.slice(corte)],
    pegados: nuevos.length,
    primero: corte,
    avisos,
  }
}

/** Un nombre de archivo seguro para guardar los pasos copiados: sin tildes ni símbolos. */
export function nombreDeArchivoDePasos(desdeElCaso: string, ahora = new Date()): string {
  const base =
    desdeElCaso
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'caso'
  return `pasos-${base}-${ahora.toISOString().slice(0, 10)}.json`
}
