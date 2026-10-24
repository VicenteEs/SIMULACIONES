import { describe, expect, it } from 'vitest'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'

/**
 * Las cuentas con las que las fascias entran en el atlas (P-006, E1).
 *
 * Es `scripts/atlas/fascias/empaquetar.mjs`, que `agregar-fascias.mjs` usa para escribir el paquete
 * 15 y anotarlo en el catálogo. Aquí se prueba sin disco, con piezas de mentira: lo que tiene que
 * estar bien es el reparto de desplazamientos (un desplazamiento mal alineado no da error al
 * escribir: da una malla rota en el navegador, o una excepción que no dice de qué pieza), que
 * aplicarlo dos veces dé lo mismo, y que las piezas de BodyParts3D no se muevan.
 */

interface Registro {
  id: string
  nombre: string
  fma: string
  sistema: string
  region: string
  vertices: number
  indices: number
  caja: [[number, number, number], [number, number, number]]
}

interface Empaquetado {
  NUMERO_DEL_PAQUETE: number
  ARCHIVO_DEL_PAQUETE: string
  SISTEMAS_DE_FASCIA: { id: string; nombre: string; color: string; orden: number }[]
  alinear: (n: number) => number
  esGenerada: (p: { generada?: string }) => boolean
  construirPaquete: (
    registros: Registro[],
    datos: Map<string, Buffer>,
  ) => { buffer: Buffer; colocadas: Map<string, { pos: number; nor: number; idx: number }> }
  catalogoConFascias: (
    catalogo: CatalogoDelAtlas,
    registros: Registro[],
    colocadas: Map<string, { pos: number; nor: number; idx: number }>,
    paquete: { archivo: string; bytes: number; bytesComprimido: number },
  ) => CatalogoDelAtlas
  versionDelCatalogo: (piezas: unknown, paquetes: unknown) => string
}

const modulo = () => import('../../scripts/atlas/fascias/empaquetar.mjs') as unknown as Promise<Empaquetado>

/** Un `.bin` como lo escribe `generar.py`: posiciones, normales, relleno a cuatro bytes e índices. */
function binDe(vertices: number, triangulos: number): Buffer {
  const pos = Buffer.alloc(vertices * 12)
  const nor = Buffer.alloc(vertices * 6)
  for (let i = 0; i < pos.length; i += 1) pos[i] = (i * 7) % 251
  for (let i = 0; i < nor.length; i += 1) nor[i] = (i * 13) % 241
  const hasta = pos.length + nor.length
  const relleno = Buffer.alloc((4 - (hasta % 4)) % 4)
  const idx = Buffer.alloc(triangulos * 12)
  for (let i = 0; i < idx.length; i += 1) idx[i] = (i * 5) % 239
  return Buffer.concat([pos, nor, relleno, idx])
}

const registro = (id: string, vertices: number, triangulos: number, sistema = 'fascia-profunda'): Registro => ({
  id,
  nombre: `Right ${id}`,
  fma: 'FMA1',
  sistema,
  region: 'miembro-inferior-derecho',
  vertices,
  indices: triangulos * 3,
  caja: [
    [0, 0, 0],
    [1, 1, 1],
  ],
})

function catalogoDeOrigen(): CatalogoDelAtlas {
  const pieza = (id: string, paquete: number): PiezaDelAtlas => ({
    id,
    nombre: `Pieza ${id}`,
    fma: 'FMA9',
    sistema: 'muscular',
    region: 'torax',
    origenRegion: 'caja',
    paquete,
    pos: 0,
    nor: 36,
    idx: 56,
    vertices: 3,
    indices: 3,
    caja: [
      [0, 0, 0],
      [1, 1, 1],
    ],
  })
  return {
    version: 'bp3d-4.0-origen',
    fuente: 'BodyParts3D 4.0',
    licencia: 'CC BY 4.0',
    sujeto: 'x',
    triangulos: 1000,
    sistemas: [{ id: 'muscular', nombre: 'Músculos', color: '#b6544c', orden: 2 }],
    regiones: [{ id: 'torax', nombre: 'Tórax', orden: 3 }],
    paquetes: Array.from({ length: 15 }, (_, i) => ({ archivo: `cuerpo-${i}.bin.gz`, bytes: 100, bytesComprimido: 50 })),
    piezas: [pieza('FJ1', 0), pieza('FJ2', 14)],
  }
}

describe('el reparto del paquete de fascias', () => {
  it('alinea cada accessor a cuatro bytes, también con un número impar de vértices', async () => {
    const { construirPaquete } = await modulo()
    // 5 vértices: 60 bytes de posiciones y 30 de normales, que dejan el siguiente en 90 y piden 2 de relleno.
    const registros = [registro('TH0001', 5, 3), registro('TH0002', 7, 2)]
    const datos = new Map([
      ['TH0001', binDe(5, 3)],
      ['TH0002', binDe(7, 2)],
    ])
    const { buffer, colocadas } = construirPaquete(registros, datos)
    for (const d of colocadas.values()) {
      expect(d.pos % 4).toBe(0)
      expect(d.nor % 2).toBe(0)
      expect(d.idx % 4).toBe(0)
    }
    expect(buffer.byteLength % 4).toBe(0)
    // La segunda pieza empieza donde acaba la primera, sin pisarla.
    const a = colocadas.get('TH0001')!
    const b = colocadas.get('TH0002')!
    expect(b.pos).toBeGreaterThanOrEqual(a.idx + 3 * 12)
  })

  it('copia los bytes de cada pieza donde dice el catálogo', async () => {
    const { construirPaquete } = await modulo()
    const registros = [registro('TH0001', 5, 3), registro('TH0002', 7, 2)]
    const datos = new Map([
      ['TH0001', binDe(5, 3)],
      ['TH0002', binDe(7, 2)],
    ])
    const { buffer, colocadas } = construirPaquete(registros, datos)
    for (const r of registros) {
      const bin = datos.get(r.id)!
      const d = colocadas.get(r.id)!
      expect(buffer.subarray(d.pos, d.pos + r.vertices * 12).equals(bin.subarray(0, r.vertices * 12))).toBe(true)
      expect(buffer.subarray(d.nor, d.nor + r.vertices * 6).equals(bin.subarray(r.vertices * 12, r.vertices * 18))).toBe(true)
      const desde = r.vertices * 18 + ((4 - ((r.vertices * 18) % 4)) % 4)
      expect(buffer.subarray(d.idx, d.idx + r.indices * 4).equals(bin.subarray(desde))).toBe(true)
    }
  })

  it('se niega con palabras si un archivo no mide lo que dice su manifiesto', async () => {
    const { construirPaquete } = await modulo()
    const datos = new Map([['TH0001', binDe(5, 3).subarray(0, 40)]])
    expect(() => construirPaquete([registro('TH0001', 5, 3)], datos)).toThrow(/TH0001 mide/)
    expect(() => construirPaquete([registro('TH0009', 5, 3)], new Map())).toThrow(/Falta el archivo de la pieza TH0009/)
  })
})

describe('el catálogo con las fascias', () => {
  const nuevo = async () => {
    const m = await modulo()
    const registros = [registro('TH0001', 5, 3), registro('TH0001M', 5, 3)]
    const datos = new Map([
      ['TH0001', binDe(5, 3)],
      ['TH0001M', binDe(5, 3)],
    ])
    const { buffer, colocadas } = m.construirPaquete(registros, datos)
    const paquete = { archivo: m.ARCHIVO_DEL_PAQUETE, bytes: buffer.byteLength, bytesComprimido: 10 }
    return { m, registros, colocadas, paquete }
  }

  it('añade las piezas al final y los cuatro sistemas, sin mover las de origen', async () => {
    const { m, registros, colocadas, paquete } = await nuevo()
    const origen = catalogoDeOrigen()
    const c = m.catalogoConFascias(origen, registros, colocadas, paquete)
    expect(c.piezas.slice(0, 2)).toEqual(origen.piezas)
    expect(c.piezas.slice(2).map((p) => p.id)).toEqual(['TH0001', 'TH0001M'])
    expect(c.piezas.slice(2).every((p) => p.generada === 'fascia' && p.paquete === 15 && p.origenRegion === 'anatomia')).toBe(true)
    expect(c.paquetes).toHaveLength(16)
    expect(c.paquetes.slice(0, 15)).toEqual(origen.paquetes)
    expect(c.sistemas.map((s) => s.id)).toEqual(['muscular', 'fascia-superficial', 'fascia-profunda', 'fascia-meningea', 'fascia-visceral'])
    expect(c.version).not.toBe(origen.version)
    expect(c.version).toMatch(/^bp3d-4\.0-[0-9a-f]{8}$/)
  })

  it('es idempotente: aplicarlo dos veces da el mismo catálogo, con los mismos triángulos', async () => {
    const { m, registros, colocadas, paquete } = await nuevo()
    const una = m.catalogoConFascias(catalogoDeOrigen(), registros, colocadas, paquete)
    const dos = m.catalogoConFascias(una, registros, colocadas, paquete)
    expect(JSON.stringify(dos)).toBe(JSON.stringify(una))
    // Los triángulos de BodyParts3D no se vuelven a sumar: 1.000 más los 6 de las dos fascias.
    expect(una.triangulos).toBe(1006)
    expect(dos.triangulos).toBe(1006)
  })

  it('quita del catálogo la fascia que ya no está en el manifiesto', async () => {
    const { m, registros, colocadas, paquete } = await nuevo()
    const una = m.catalogoConFascias(catalogoDeOrigen(), registros, colocadas, paquete)
    const solo = registros.slice(0, 1)
    const dos = m.catalogoConFascias(una, solo, colocadas, paquete)
    expect(dos.piezas.filter((p) => p.generada).map((p) => p.id)).toEqual(['TH0001'])
    expect(dos.triangulos).toBe(1003)
  })

  it('se niega a repetir un identificador, también contra BodyParts3D', async () => {
    const { m, colocadas, paquete } = await nuevo()
    const repetido = [registro('FJ1', 5, 3)]
    expect(() => m.catalogoConFascias(catalogoDeOrigen(), repetido, new Map([['FJ1', colocadas.get('TH0001')!]]), paquete)).toThrow(/FJ1 está repetido/)
  })

  it('exige los quince paquetes de BodyParts3D: con menos, algo se perdió', async () => {
    const { m, registros, colocadas, paquete } = await nuevo()
    const corto = { ...catalogoDeOrigen(), paquetes: catalogoDeOrigen().paquetes.slice(0, 10) }
    expect(() => m.catalogoConFascias(corto, registros, colocadas, paquete)).toThrow(/Se esperaban 15 paquetes/)
  })

  it('la versión cambia si cambia una pieza o un paquete', async () => {
    const m = await modulo()
    const base = m.versionDelCatalogo([{ id: 'a' }], [{ archivo: 'x' }])
    expect(m.versionDelCatalogo([{ id: 'b' }], [{ archivo: 'x' }])).not.toBe(base)
    expect(m.versionDelCatalogo([{ id: 'a' }], [{ archivo: 'y' }])).not.toBe(base)
    expect(m.versionDelCatalogo([{ id: 'a' }], [{ archivo: 'x' }])).toBe(base)
  })
})
