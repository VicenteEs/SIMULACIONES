import { describe, expect, it } from 'vitest'
import { piezasDelGlb } from '@/lib/piezasDeUnModelo'

/**
 * Qué piezas del atlas lleva un `.glb` (D-131). Se lee solo su bloque JSON, y
 * cualquier cosa rara es «un modelo que no se puede abrir», nunca un fallo que
 * deje sin pintar la lista entera.
 */

/** Un `.glb` mínimo: cabecera, y un bloque JSON con lo que se le pase. */
function glbCon(documento: unknown, magia = 0x46546c67, tipo = 0x4e4f534a): Uint8Array {
  let json = new TextEncoder().encode(JSON.stringify(documento))
  // El bloque se rellena con espacios hasta múltiplo de cuatro, como manda el formato.
  const relleno = (4 - (json.length % 4)) % 4
  json = new Uint8Array([...json, ...new Array(relleno).fill(0x20)])
  const bytes = new Uint8Array(20 + json.length)
  const vista = new DataView(bytes.buffer)
  vista.setUint32(0, magia, true)
  vista.setUint32(4, 2, true)
  vista.setUint32(8, bytes.length, true)
  vista.setUint32(12, json.length, true)
  vista.setUint32(16, tipo, true)
  bytes.set(json, 20)
  return bytes
}

describe('piezasDelGlb', () => {
  it('saca el part_id de cada malla, sin repetir y en su orden', () => {
    const glb = glbCon({
      nodes: [
        { name: 'Right tibia', mesh: 0, extras: { part_id: 'FJ3387' } },
        { name: 'Right fibula', mesh: 1, extras: { part_id: 'FJ3290' } },
        { name: 'Right tibia.001', mesh: 2, extras: { part_id: 'FJ3387' } },
      ],
    })
    expect(piezasDelGlb(glb)).toEqual(['FJ3387', 'FJ3290'])
  })

  // Los modelos agrupados por sistema y los de prueba no salieron pieza a pieza
  // del atlas: no traen part_id, y eso es «no se puede abrir aquí», no un error.
  it('un modelo que no trae part_id da una lista vacía', () => {
    expect(piezasDelGlb(glbCon({ nodes: [{ name: 'Musculos', mesh: 0, extras: { rol: 'musculo' } }] }))).toEqual([])
    expect(piezasDelGlb(glbCon({ nodes: [{ name: 'x', extras: { part_id: 7 } }] }))).toEqual([])
    expect(piezasDelGlb(glbCon({}))).toEqual([])
  })

  it('lo que no es un .glb bien formado da una lista vacía en vez de lanzar', () => {
    expect(piezasDelGlb(new Uint8Array(5))).toEqual([])
    expect(piezasDelGlb(glbCon({ nodes: [] }, 0x12345678))).toEqual([])
    expect(piezasDelGlb(glbCon({ nodes: [] }, 0x46546c67, 0x004e4942))).toEqual([])
    // El largo declarado pasa del final del archivo.
    const cortado = glbCon({ nodes: [{ extras: { part_id: 'FJ1' } }] }).slice(0, 30)
    expect(piezasDelGlb(cortado)).toEqual([])
    // JSON ilegible.
    const roto = glbCon({ nodes: [] })
    roto[20] = 0x7d
    expect(piezasDelGlb(roto)).toEqual([])
  })
})
