/**
 * Lee una tabla pegada tal como la entrega Vera Health, o cualquier otra
 * herramienta que conteste con una tabla de Markdown.
 *
 * Es lo que se guarda en el bloque «Tabla de Vera Health»: el texto pegado, sin
 * convertir. Se lee al pintar y al guardar, con esta misma función, para que lo
 * que el editor acepta sea exactamente lo que el residente ve. Guardar la tabla
 * ya troceada habría pedido una lista de listas, que Payload no tiene, y habría
 * dejado al traumatólogo sin el texto original con el que volver a pegar.
 *
 * Acepta dos formas, porque las dos salen de copiar:
 *
 * - Markdown con barras (`| a | b |` y debajo `| --- | --- |`), que es lo que
 *   escribe el asistente.
 * - Texto separado por tabuladores, que es lo que queda al copiar una tabla de
 *   una página web o de una hoja de cálculo.
 *
 * Todo lo que no es la tabla —una frase de introducción, una nota al final— se
 * ignora: quien copia de un chat se lleva casi siempre una línea de más.
 */

export type Alineacion = 'izquierda' | 'centro' | 'derecha'

export interface TablaLeida {
  encabezados: string[]
  filas: string[][]
  /** Una por columna; `null` cuando el Markdown no dice nada. */
  alineaciones: (Alineacion | null)[]
}

export type ResultadoDeLaTabla = { ok: true; tabla: TablaLeida } | { ok: false; motivo: string }

/** Más columnas que esto no caben en una hoja ni en una pantalla de teléfono. */
export const MAXIMO_DE_COLUMNAS = 8
/** Igual que `MAXIMO_FILAS` de `src/admin/depurar.ts`: ninguna lista de la plataforma pasa de ahí. */
export const MAXIMO_DE_FILAS = 500

const LINEA_DE_GUIONES = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/**
 * Parte una línea de Markdown en celdas.
 *
 * La barra escapada (`\|`) es texto de la celda, no separador: una evidencia
 * clínica puede llevar «A | B» y partirla desalinearía toda la fila.
 */
function celdasDe(linea: string): string[] {
  const texto = linea.trim()
  const celdas: string[] = []
  let actual = ''
  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i]
    if (caracter === '\\' && texto[i + 1] === '|') {
      actual += '|'
      i += 1
    } else if (caracter === '|') {
      celdas.push(actual)
      actual = ''
    } else {
      actual += caracter
    }
  }
  celdas.push(actual)
  // Las barras de los extremos no abren columnas: `| a | b |` son dos celdas.
  if (texto.startsWith('|')) celdas.shift()
  if (texto.endsWith('|') && !texto.endsWith('\\|')) celdas.pop()
  return celdas.map(limpiarCelda)
}

/** `<br>` es el salto de línea dentro de una celda de Markdown. */
const limpiarCelda = (celda: string): string =>
  celda
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()

function alineacionDe(celda: string): Alineacion | null {
  const guiones = celda.trim()
  const izquierda = guiones.startsWith(':')
  const derecha = guiones.endsWith(':')
  if (izquierda && derecha) return 'centro'
  if (derecha) return 'derecha'
  if (izquierda) return 'izquierda'
  return null
}

/** Iguala cada fila al número de columnas del encabezado. */
function aCadaColumna(fila: string[], columnas: number): string[] {
  if (fila.length === columnas) return fila
  if (fila.length < columnas) return [...fila, ...Array<string>(columnas - fila.length).fill('')]
  // Una celda de más casi siempre es una barra sin escapar dentro del texto: se
  // devuelve a la última columna en vez de tirarla.
  return [...fila.slice(0, columnas - 1), fila.slice(columnas - 1).join(' | ')]
}

function armar(encabezados: string[], filas: string[][], alineaciones: (Alineacion | null)[]): ResultadoDeLaTabla {
  const columnas = encabezados.length
  if (columnas < 2) return { ok: false, motivo: 'La tabla necesita al menos dos columnas.' }
  if (columnas > MAXIMO_DE_COLUMNAS) {
    return { ok: false, motivo: `La tabla tiene ${columnas} columnas y el máximo son ${MAXIMO_DE_COLUMNAS}.` }
  }
  if (filas.length === 0) return { ok: false, motivo: 'La tabla no tiene filas debajo del encabezado.' }
  if (filas.length > MAXIMO_DE_FILAS) {
    return { ok: false, motivo: `La tabla tiene ${filas.length} filas y el máximo son ${MAXIMO_DE_FILAS}.` }
  }
  if (encabezados.every((e) => e === '')) return { ok: false, motivo: 'El encabezado de la tabla está vacío.' }
  return {
    ok: true,
    tabla: {
      encabezados,
      filas: filas.map((f) => aCadaColumna(f, columnas)),
      alineaciones: Array.from({ length: columnas }, (_, i) => alineaciones[i] ?? null),
    },
  }
}

function leerMarkdown(lineas: string[]): ResultadoDeLaTabla | null {
  const inicio = lineas.findIndex(
    (linea, i) => linea.includes('|') && i + 1 < lineas.length && LINEA_DE_GUIONES.test(lineas[i + 1]) && lineas[i + 1].includes('-'),
  )
  if (inicio === -1) return null

  const encabezados = celdasDe(lineas[inicio])
  const alineaciones = celdasDe(lineas[inicio + 1]).map(alineacionDe)
  const filas: string[][] = []
  for (const linea of lineas.slice(inicio + 2)) {
    // La tabla acaba en la primera línea que ya no lo es: lo que venga después
    // es una nota, no más filas.
    if (!linea.includes('|')) break
    filas.push(celdasDe(linea))
  }
  return armar(encabezados, filas, alineaciones)
}

function leerTabuladores(lineas: string[]): ResultadoDeLaTabla | null {
  if (!lineas.some((linea) => linea.includes('\t'))) return null
  const [primera, ...resto] = lineas.filter((linea) => linea.includes('\t'))
  return armar(
    primera.split('\t').map(limpiarCelda),
    resto.map((linea) => linea.split('\t').map(limpiarCelda)),
    [],
  )
}

export function leerTablaPegada(texto: unknown): ResultadoDeLaTabla {
  if (typeof texto !== 'string' || texto.trim() === '') {
    return { ok: false, motivo: 'Pegue la tabla en el recuadro.' }
  }
  const lineas = texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((linea) => linea.trim() !== '')
  return (
    leerMarkdown(lineas) ??
    leerTabuladores(lineas) ?? {
      ok: false,
      motivo:
        'No se reconoce una tabla. Pegue la tabla completa: la primera línea es el encabezado y la segunda lleva guiones (| --- | --- |).',
    }
  )
}

/** Un trozo de texto de una celda, con o sin negrita. */
export interface TrozoDeCelda {
  texto: string
  negrita: boolean
}

/**
 * Parte el texto de una celda en trozos para pintarlo.
 *
 * Solo entiende `**negrita**`, que es lo único que el asistente pone en una
 * tabla. Un asterisco suelto se queda como asterisco; ningún trozo lleva HTML,
 * así que lo pegado no puede inyectar nada en la ficha.
 */
export function trozosDeLaCelda(celda: string): TrozoDeCelda[] {
  const trozos: TrozoDeCelda[] = []
  const patron = /\*\*([^*\n]+)\*\*/g
  let desde = 0
  for (const coincidencia of celda.matchAll(patron)) {
    const donde = coincidencia.index ?? 0
    if (donde > desde) trozos.push({ texto: celda.slice(desde, donde), negrita: false })
    trozos.push({ texto: coincidencia[1], negrita: true })
    desde = donde + coincidencia[0].length
  }
  if (desde < celda.length) trozos.push({ texto: celda.slice(desde), negrita: false })
  return trozos
}
