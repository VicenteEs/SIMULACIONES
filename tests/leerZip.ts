import { inflateRawSync } from 'node:zlib'

/**
 * Abre un ZIP de los que arma `src/lib/zip.ts`, para las pruebas que miran qué
 * lleva dentro una exportación.
 *
 * Recorre las cabeceras locales una tras otra, que es lo que permite ese ZIP:
 * no usa descriptores de datos, así que el tamaño de cada entrada está delante
 * de ella. No sirve para un ZIP cualquiera, y no lo pretende; el lector de la
 * plataforma, que sí lee los de Excel, es `src/lib/leerPlanilla.ts`.
 */
export function leerZip(datos: Uint8Array): Map<string, { metodo: number; contenido: Uint8Array }> {
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength)
  const entradas = new Map<string, { metodo: number; contenido: Uint8Array }>()
  let posicion = 0
  while (posicion + 30 <= datos.length && vista.getUint32(posicion, true) === 0x04034b50) {
    const metodo = vista.getUint16(posicion + 8, true)
    const comprimido = vista.getUint32(posicion + 18, true)
    const largoDelNombre = vista.getUint16(posicion + 26, true)
    const largoDelExtra = vista.getUint16(posicion + 28, true)
    const nombre = new TextDecoder().decode(datos.subarray(posicion + 30, posicion + 30 + largoDelNombre))
    const inicio = posicion + 30 + largoDelNombre + largoDelExtra
    const crudo = datos.subarray(inicio, inicio + comprimido)
    entradas.set(nombre, { metodo, contenido: metodo === 0 ? crudo : new Uint8Array(inflateRawSync(crudo)) })
    posicion = inicio + comprimido
  }
  return entradas
}

/** El texto de una entrada, o `undefined` si no está. */
export const textoDe = (zip: Map<string, { contenido: Uint8Array }>, nombre: string): string | undefined => {
  const entrada = zip.get(nombre)
  return entrada ? new TextDecoder().decode(entrada.contenido) : undefined
}
