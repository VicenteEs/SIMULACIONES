/**
 * Búsqueda y filtrado de fichas.
 *
 * Se resuelve en el navegador sobre la lista ya cargada. Con decenas de fichas
 * eso es instantáneo y evita un viaje al servidor por cada tecla. Si algún día
 * son cientos, corresponde mover la búsqueda a PostgreSQL con un índice de
 * texto completo, y esta función quedará como el contrato a replicar.
 */

export interface FichaBuscable {
  id: number | string
  nombre?: string | null
  subtitulo?: string | null
  codigo?: string | null
  tipo?: string | null
  segmentoId?: number | string | null
}

export interface Criterios {
  texto?: string
  tipo?: string
  segmentoId?: number | string
}

/**
 * Deja un texto en forma comparable: sin mayúsculas, sin tildes y sin espacios
 * sobrantes. Nadie escribe «diáfisis» con tilde en un buscador.
 *
 * La eñe se preserva a propósito: no es una ene con adorno sino una letra
 * distinta, y confundir «año» con «ano» en un contexto clínico sería lamentable.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/ñ/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(//g, 'ñ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function filtrarFichas<T extends FichaBuscable>(fichas: T[], criterios: Criterios): T[] {
  const consulta = normalizar(criterios.texto ?? '')
  const palabras = consulta ? consulta.split(' ') : []

  return fichas.filter((ficha) => {
    if (criterios.tipo && ficha.tipo !== criterios.tipo) return false

    if (criterios.segmentoId !== undefined && criterios.segmentoId !== '') {
      if (String(ficha.segmentoId) !== String(criterios.segmentoId)) return false
    }

    if (palabras.length === 0) return true

    const donde = normalizar(
      [ficha.nombre, ficha.subtitulo, ficha.codigo].filter(Boolean).join(' '),
    )

    // Todas las palabras deben aparecer, en cualquier orden: quien escribe
    // «femoral fractura» busca lo mismo que quien escribe «fractura femoral».
    return palabras.every((palabra) => donde.includes(palabra))
  })
}
