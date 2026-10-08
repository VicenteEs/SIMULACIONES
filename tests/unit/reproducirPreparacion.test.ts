import { describe, expect, it } from 'vitest'
import type { ContenidoDeInstancia } from '@/atlas/formato'
import type { PiezaLeida } from '@/lib/exportarAtlas'
import { colocarMalla, estaMovida, reproducirPreparacion } from '@/lib/reproducirPreparacion'

/**
 * «Exportar como modelo» escribe lo que está guardado (D-164).
 *
 * Antes exportaba la geometría original de cada pieza encendida: ni lo movido
 * ni lo cortado, y una tibia partida con un trozo apagado salía entera. Aquí se
 * prueba, con cajas de un metro, que lo guardado se rehace como lo dibuja el
 * taller: `centro + mover + giro·(p − centro)`, los cortes con `partirMalla`, los
 * trozos apagados fuera.
 */

/** Una caja cerrada de 0,1 × 1 × 0,1 m: «un hueso» largo, en Y, entre y = 0 e y = 1. */
function hueso(id: string, sistema = 'skeletal', y0 = 0): PiezaLeida {
  const x = 0.05
  const z = 0.05
  const v: number[] = []
  for (const y of [y0, y0 + 1]) for (const [px, pz] of [[-x, -z], [x, -z], [x, z], [-x, z]]) v.push(px, y, pz)
  const n = new Int16Array(v.length)
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { id, nombre: 'Right tibia', sistema, posiciones: new Float32Array(v), normales: n, indices: new Uint32Array(i) }
}

const vista = { camara: [0, 0, 3], objetivo: [0, 0, 0], separacion: 0 } as ContenidoDeInstancia['vista']
const contenido = (extra: Partial<ContenidoDeInstancia> = {}, piezas: ContenidoDeInstancia['piezas'] = [{ id: 'T' }]): Partial<ContenidoDeInstancia> => ({
  version: 1,
  atlas: 'x',
  piezas,
  vista,
  ...extra,
})

const alto = (p: PiezaLeida) => {
  let min = Infinity
  let max = -Infinity
  for (let i = 1; i < p.posiciones.length; i += 3) {
    min = Math.min(min, p.posiciones[i])
    max = Math.max(max, p.posiciones[i])
  }
  return { min, max }
}
const ancho = (p: PiezaLeida) => {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < p.posiciones.length; i += 3) {
    min = Math.min(min, p.posiciones[i])
    max = Math.max(max, p.posiciones[i])
  }
  return { min, max }
}

describe('lo movido', () => {
  it('«no se movió» es una identidad: cero traslado y cuaternión neutro', () => {
    expect(estaMovida(null)).toBe(false)
    expect(estaMovida({ mover: [0, 0, 0], girar: [0, 0, 0, 1] })).toBe(false)
    expect(estaMovida({ mover: [0.002, 0, 0] })).toBe(true)
    expect(estaMovida({ girar: [0, 0, 0.1, 0.995] })).toBe(true)
  })

  it('una pieza sin tocar sale como nació y no sale suelta', () => {
    const r = reproducirPreparacion(contenido(), [hueso('T')])
    expect(r.piezas).toHaveLength(1)
    expect(alto(r.piezas[0])).toEqual({ min: 0, max: 1 })
    expect(r.sueltas).toEqual([])
    expect(r.partido).toBeNull()
  })

  it('una pieza movida sale donde se dejó, y suelta', () => {
    const r = reproducirPreparacion(contenido({}, [{ id: 'T', mover: [0.3, 0.2, 0] }]), [hueso('T')])
    const caja = ancho(r.piezas[0])
    expect(caja.min).toBeCloseTo(0.25, 5)
    expect(caja.max).toBeCloseTo(0.35, 5)
    expect(alto(r.piezas[0]).min).toBeCloseTo(0.2, 5)
    expect(r.sueltas).toEqual(['T'])
  })

  it('el giro es sobre el centro propio: una vuelta de 90° deja el centro donde estaba', () => {
    const s = Math.SQRT1_2
    const girado = colocarMalla(
      { posiciones: hueso('T').posiciones, normales: hueso('T').normales, indices: hueso('T').indices },
      { girar: [0, 0, s, s] },
    )
    // Una caja de 0,1 de ancho por 1 de alto, girada 90° sobre Z, queda de 1 de ancho por 0,1 de alto.
    const xs = [...girado.posiciones].filter((_, i) => i % 3 === 0)
    const ys = [...girado.posiciones].filter((_, i) => i % 3 === 1)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 4)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.1, 4)
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(0.5, 4)
  })

  it('no escribe sobre la geometría de entrada: es la del paquete del atlas', () => {
    const t = hueso('T')
    const copia = t.posiciones.slice()
    reproducirPreparacion(contenido({}, [{ id: 'T', mover: [1, 0, 0] }]), [t])
    expect(t.posiciones).toEqual(copia)
  })
})

describe('lo cortado', () => {
  const corte = { pieza: 'T', punto: [0, 0.5, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number] }

  it('una tibia partida sale en sus dos trozos, con su sufijo, y no entera', () => {
    const r = reproducirPreparacion(contenido({ cortes: [corte] }), [hueso('T')])
    expect(r.piezas.map((p) => p.id).sort()).toEqual(['T#a', 'T#b'])
    expect(r.piezas.find((p) => p.id === 'T#a')?.sufijo).toBe('_1')
    expect(r.piezas.find((p) => p.id === 'T#b')?.sufijo).toBe('_2')
    // `a` queda hacia donde apunta la normal (arriba) y `b` abajo
    const a = alto(r.piezas.find((p) => p.id === 'T#a')!)
    const b = alto(r.piezas.find((p) => p.id === 'T#b')!)
    expect(a.min).toBeCloseTo(0.5, 5)
    expect(a.max).toBeCloseTo(1, 5)
    expect(b.max).toBeCloseTo(0.5, 5)
  })

  it('un trozo apagado no sale, y la otra mitad sigue sin ser «el fragmento»', () => {
    const r = reproducirPreparacion(contenido({ cortes: [corte], apagados: ['T#b'] }), [hueso('T')])
    expect(r.piezas.map((p) => p.id)).toEqual(['T#a'])
    // Es la causa de lo que se vio: la pieza entera salía aunque el trozo no estuviera en el visor.
    expect(r.piezas.some((p) => p.id === 'T')).toBe(false)
    expect(r.partido).toBeNull()
  })

  it('un trozo desplazado sale donde se dejó, también el que se mueve', () => {
    const r = reproducirPreparacion(contenido({ cortes: [{ ...corte, b: { mover: [0.2, -0.1, 0] } }] }), [hueso('T')])
    const b = r.piezas.find((p) => p.id === 'T#b')!
    expect(ancho(b).min).toBeCloseTo(0.15, 5)
    expect(alto(b).max).toBeCloseTo(0.4, 5)
    expect(r.sueltas).toEqual(expect.arrayContaining(['T#a', 'T#b']))
  })

  it('un hueso con un solo corte es «el partido»: el distal (el de abajo) es el fragmento', () => {
    const r = reproducirPreparacion(contenido({ cortes: [corte] }), [hueso('T')])
    expect(r.partido).not.toBeNull()
    expect(r.partido?.fragmento).toBe('distal')
    const marcas = r.partido!.piezas.map((p) => [p.id, p.trozo?.lado, p.trozo?.fragmento])
    expect(marcas).toContainEqual(['T#b', 'distal', true])
    expect(marcas).toContainEqual(['T#a', 'proximal', false])
    // El origen del fragmento va en el foco del corte: el centro de la tapa, en y = 0,5
    expect(r.partido!.corte.punto[1]).toBeCloseTo(0.5, 4)
  })

  it('con la fractura del asistente en la preparación, la descripción lleva su código AO', () => {
    const receta = {
      pieza: 'T',
      hueso: 'tibia',
      segmento: 'diafisis',
      grupo: 'A2',
      porcion: { centro: 50, extension: 0 },
      inclinacion: 45,
      giro: 0,
      semilla: 1,
      codigo: '42-A2',
    } as unknown as NonNullable<ContenidoDeInstancia['fracturas']>[number]
    const r = reproducirPreparacion(contenido({ cortes: [corte], fracturas: [receta] }), [hueso('T')])
    expect(r.partido?.corte.descripcion).toContain('42-A2')
  })

  it('dos cortes dejan tres trozos: ninguno es «el fragmento», y se avisa', () => {
    const dos = [corte, { pieza: 'T#b', punto: [0, 0.25, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number] }]
    const r = reproducirPreparacion(contenido({ cortes: dos }), [hueso('T')])
    expect(r.piezas.map((p) => p.id).sort()).toEqual(['T#a', 'T#b#a', 'T#b#b'])
    expect(r.partido).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/más de dos fragmentos/)
  })

  it('un corte que no atraviesa la pieza se salta y se dice', () => {
    const lejos = { pieza: 'T', punto: [0, 5, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number] }
    const r = reproducirPreparacion(contenido({ cortes: [lejos] }), [hueso('T')])
    expect(r.piezas.map((p) => p.id)).toEqual(['T'])
    expect(r.avisos.join(' ')).toMatch(/no se pudo rehacer/)
  })
})

describe('lo que sale suelto', () => {
  it('lo marcado en la barra lateral sale suelto aunque no se haya tocado', () => {
    const r = reproducirPreparacion(contenido({ sueltas: ['T'] }), [hueso('T')])
    expect(r.sueltas).toEqual(['T'])
  })

  it('un músculo cortado no es «el hueso partido»: la consola solo parte huesos', () => {
    const musculo = hueso('M', 'muscular')
    const r = reproducirPreparacion(
      contenido({ cortes: [{ pieza: 'M', punto: [0, 0.5, 0], normal: [0, 1, 0] }] }, [{ id: 'M' }]),
      [musculo],
    )
    expect(r.partido).toBeNull()
    // Sus trozos se funden con su sistema: no salen sueltos sin motivo.
    expect(r.sueltas).toEqual([])
  })
})

describe('lo marcado como suelto, al guardar', () => {
  // Importación diferida para no cargar el catálogo en las pruebas de arriba.
  const guardar = async (sueltas: unknown, cortes: unknown = undefined, apagados: unknown = undefined) => {
    const { normalizarSeleccion } = await import('@/atlas/catalogo')
    const catalogo = { version: 'p', piezas: [{ id: 'a' }, { id: 'b' }] } as never
    return normalizarSeleccion(catalogo, ['a', 'b'], null, cortes, { sueltas, apagados }).sueltas
  }

  it('deja las piezas encendidas y descarta lo que no está, lo repetido y lo que no es texto', async () => {
    expect(await guardar(['b', 'a', 'b', 'zz', 5])).toEqual(['a', 'b'])
    expect(await guardar('no es una lista')).toBeUndefined()
    expect(await guardar([])).toBeUndefined()
  })

  it('de una pieza partida valen sus trozos y no ella, y no los apagados', async () => {
    const corte = [{ pieza: 'a', punto: [0, 0, 0], normal: [0, 1, 0] }]
    expect(await guardar(['a', 'a#a', 'a#b', 'b'], corte)).toEqual(['a#a', 'a#b', 'b'])
    expect(await guardar(['a#a', 'a#b'], corte, ['a#b'])).toEqual(['a#a'])
  })
})
