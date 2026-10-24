import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { corregirCatalogo } from '@/atlas/clasificacion'
import type { CatalogoDelAtlas, CorteDePieza, PiezaDelAtlas } from '@/atlas/formato'
import { prepararExportacion, type PiezaLeida } from '@/lib/exportarAtlas'
import {
  MARGEN_DE_LA_FASCIA,
  fasciasDeLaZona,
  planosDelMarco,
  planosDeUnaCaja,
  sistemasDeFasciaQueEntran,
  zonaDeLoExportado,
} from '@/lib/fasciasDeLaZona'

/**
 * Las fascias que entran solas al exportar, recortadas a lo exportado (P-006, F-8).
 *
 * Es el pedido del dueño: «si del taller corto una pierna y hay una fascia más grande, que aparezca cortada
 * solo lo que ya está exportado, sin toda la pieza completa». Las pruebas con formas de mentira fijan la
 * regla; la del atlas de verdad comprueba que se cumple con la pierna.
 */

/** Una caja de lado `lado` como pieza: ocho vértices y doce triángulos. Sirve de «músculo» o de «hueso». */
function caja(id: string, sistema: string, centro: [number, number, number], lado: number): PiezaLeida {
  const v: number[] = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push(centro[0] + (x * lado) / 2, centro[1] + (y * lado) / 2, centro[2] + (z * lado) / 2)
  const f = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3]
  return {
    id,
    nombre: id,
    sistema,
    posiciones: new Float32Array(v),
    normales: new Int16Array(24),
    indices: new Uint32Array(f),
  }
}

/** Un manguito: tubo abierto de eje Y, de `largo` metros, que envuelve a la caja. */
function manguito(id: string, sistema: string, largo: number, radio = 0.1, n = 32, m = 60): PiezaLeida {
  const pos = new Float32Array(n * m * 3)
  const nor = new Int16Array(n * m * 3)
  for (let j = 0; j < m; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * 2 * Math.PI
      const k = (j * n + i) * 3
      pos[k] = radio * Math.cos(a)
      pos[k + 1] = (j / (m - 1)) * largo
      pos[k + 2] = radio * Math.sin(a)
      nor[k] = Math.round(Math.cos(a) * 32767)
      nor[k + 2] = Math.round(Math.sin(a) * 32767)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < m - 1; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * n + i
      const b = j * n + ((i + 1) % n)
      const c = (j + 1) * n + i
      const d = (j + 1) * n + ((i + 1) % n)
      idx.push(a, c, b, b, c, d)
    }
  }
  return { id, nombre: id, sistema, posiciones: pos, normales: nor, indices: new Uint32Array(idx) }
}

const piezaDelCatalogo = (leida: PiezaLeida, region = 'miembro-inferior-derecho'): PiezaDelAtlas => {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < leida.posiciones.length; i += 3) {
    for (let e = 0; e < 3; e += 1) {
      min[e] = Math.min(min[e], leida.posiciones[i + e])
      max[e] = Math.max(max[e], leida.posiciones[i + e])
    }
  }
  return {
    id: leida.id,
    nombre: leida.nombre,
    fma: 'FMA1',
    sistema: leida.sistema,
    region,
    origenRegion: 'anatomia',
    paquete: 15,
    pos: 0,
    nor: 0,
    idx: 0,
    vertices: leida.posiciones.length / 3,
    indices: leida.indices.length,
    caja: [min as [number, number, number], max as [number, number, number]],
  }
}

const corte = (pieza: string, planos: { punto: [number, number, number]; normal: [number, number, number] }[]): CorteDePieza => ({
  pieza,
  punto: planos[0].punto,
  normal: planos[0].normal,
  ...(planos.length > 1 ? { otrosPlanos: planos.slice(1) } : {}),
})

describe('qué sistemas de fascia entran', () => {
  it('la profunda con un músculo, la superficial con piel, y ninguna con huesos sueltos', () => {
    expect(sistemasDeFasciaQueEntran([{ sistema: 'skeletal' }])).toEqual([])
    expect(sistemasDeFasciaQueEntran([{ sistema: 'skeletal' }, { sistema: 'muscular' }])).toEqual(['fascia-profunda'])
    expect(sistemasDeFasciaQueEntran([{ sistema: 'skeletal' }, { sistema: 'integumentary' }])).toEqual(['fascia-superficial'])
    expect(sistemasDeFasciaQueEntran([{ sistema: 'muscular' }, { sistema: 'integumentary' }])).toEqual([
      'fascia-profunda',
      'fascia-superficial',
    ])
  })

  it('la meníngea con cerebro, hueso del cráneo o vértebras, y con ningún otro hueso', () => {
    const hueso = (nombre: string) => ({ sistema: 'skeletal', nombre })
    expect(sistemasDeFasciaQueEntran([hueso('Right tibia'), hueso('Right fibula')])).toEqual([])
    expect(sistemasDeFasciaQueEntran([hueso('Frontal bone')])).toEqual(['fascia-meningea'])
    expect(sistemasDeFasciaQueEntran([hueso('Third lumbar vertebra')])).toEqual(['fascia-meningea'])
    expect(sistemasDeFasciaQueEntran([hueso('Sacrum')])).toEqual(['fascia-meningea'])
    expect(sistemasDeFasciaQueEntran([{ sistema: 'nervous', nombre: 'Left precentral gyrus' }])).toEqual(['fascia-meningea'])
    // El disco entre dos vértebras termina en «vértebra» en el nombre, y no es una vértebra.
    expect(sistemasDeFasciaQueEntran([hueso('Intervertebral disk of fifth thoracic vertebra')])).toEqual([])
    // Una preparación sin nombres (las de las pruebas de arriba) no gana meníngea por error.
    expect(sistemasDeFasciaQueEntran([{ sistema: 'skeletal' }])).toEqual([])
  })

  it('la visceral con costillas, corazón o vísceras, y con ninguna pieza de miembro', () => {
    const pieza = (sistema: string, nombre: string) => ({ sistema, nombre })
    expect(sistemasDeFasciaQueEntran([pieza('skeletal', 'Right tibia'), pieza('muscular', 'Right soleus')])).toEqual(['fascia-profunda'])
    expect(sistemasDeFasciaQueEntran([pieza('skeletal', 'Right fifth rib')])).toEqual(['fascia-visceral'])
    expect(sistemasDeFasciaQueEntran([pieza('skeletal', 'Left fifth costal cartilage')])).toEqual(['fascia-visceral'])
    expect(sistemasDeFasciaQueEntran([pieza('cardiac', 'Wall of ventricle')])).toEqual(['fascia-visceral'])
    expect(sistemasDeFasciaQueEntran([pieza('digestive', 'Stomach')])).toEqual(['fascia-visceral'])
    expect(sistemasDeFasciaQueEntran([pieza('urinary', 'Left kidney')])).toEqual(['fascia-visceral'])
    expect(sistemasDeFasciaQueEntran([pieza('digestive', 'Duodenum'), pieza('fascia-visceral', 'Parietal peritoneum')])).toEqual([])
  })

  it('un sistema del que la preparación ya trae piezas se deja como lo eligió quien la armó', () => {
    expect(sistemasDeFasciaQueEntran([{ sistema: 'skeletal', nombre: 'Frontal bone' }, { sistema: 'fascia-meningea' }])).toEqual([])
    expect(sistemasDeFasciaQueEntran([{ sistema: 'muscular' }, { sistema: 'fascia-profunda' }])).toEqual([])
    expect(
      sistemasDeFasciaQueEntran([{ sistema: 'muscular' }, { sistema: 'integumentary' }, { sistema: 'fascia-profunda' }]),
    ).toEqual(['fascia-superficial'])
  })
})

describe('la zona de lo exportado', () => {
  it('es la caja de lo que no es piel ni fascia', () => {
    const zona = zonaDeLoExportado([
      caja('musculo', 'muscular', [0, 0, 0], 0.2),
      caja('hueso', 'skeletal', [0.3, 0, 0], 0.1),
      caja('piel', 'integumentary', [5, 5, 5], 3),
      manguito('fascia', 'fascia-profunda', 2),
    ])!
    expect(zona[0][0]).toBeCloseTo(-0.1, 6)
    expect(zona[1][0]).toBeCloseTo(0.35, 6)
    expect(zona[1][1]).toBeCloseTo(0.1, 6)
  })

  it('no existe si lo único que hay envuelve', () => {
    expect(zonaDeLoExportado([caja('piel', 'integumentary', [0, 0, 0], 1)])).toBeNull()
    expect(zonaDeLoExportado([])).toBeNull()
  })
})

describe('los planos del marco con el que se cortó', () => {
  const arriba = { punto: [0, 0.5, 0] as [number, number, number], normal: [0, -1, 0] as [number, number, number] }
  const abajo = { punto: [0, -0.5, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number] }
  const izquierda = { punto: [-0.3, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number] }
  const derecha = { punto: [0.3, 0, 0] as [number, number, number], normal: [-1, 0, 0] as [number, number, number] }

  it('junta los que cruzó cada pieza en un solo marco, sin repetir el que comparten', () => {
    const { planos, ambiguo } = planosDelMarco([
      corte('FJ1', [arriba, izquierda]),
      corte('FJ2', [arriba, derecha]),
      corte('FJ3', [abajo, derecha]),
    ])
    expect(ambiguo).toBe(false)
    expect(planos).toHaveLength(4)
  })

  it('reconoce un plano repetido aunque cada pieza lo guarde con otros decimales', () => {
    const casi = { punto: [0.00001, 0.5, -0.00001] as [number, number, number], normal: [0, -1.00000001, 0] as [number, number, number] }
    const { planos } = planosDelMarco([corte('FJ1', [arriba, izquierda]), corte('FJ2', [casi, derecha])])
    expect(planos).toHaveLength(3)
  })

  it('con dos marcos que no comparten ningún plano, dice que no sabe cuál fue y no aplica ninguno', () => {
    const otro = { punto: [0, 0, 0.4] as [number, number, number], normal: [0, 0, -1] as [number, number, number] }
    const otro2 = { punto: [0, 0, -0.4] as [number, number, number], normal: [0, 0, 1] as [number, number, number] }
    const r = planosDelMarco([corte('FJ1', [arriba, izquierda]), corte('FJ2', [otro, otro2])])
    expect(r).toEqual({ planos: [], ambiguo: true })
  })

  it('un corte de un solo plano (un hueso partido) no es un marco, y un trozo de dentro apagado no cuenta', () => {
    expect(planosDelMarco([corte('FJ1', [arriba])])).toEqual({ planos: [], ambiguo: false })
    expect(planosDelMarco([corte('FJ1', [arriba, izquierda])], new Set(['FJ1#a']))).toEqual({ planos: [], ambiguo: false })
  })
})

describe('fasciasDeLaZona', () => {
  // Un «músculo» de 20 cm de lado en el origen, y una fascia de 2 m de largo que lo envuelve y lo pasa.
  const musculo = caja('musculo', 'muscular', [0, 0.5, 0], 0.2)
  const fascia = manguito('TH0001', 'fascia-profunda', 2, 0.15)
  const catalogo = { piezas: [piezaDelCatalogo(fascia)] } as Pick<CatalogoDelAtlas, 'piezas'>
  const leer = () => fascia

  it('recorta la fascia a la caja de lo exportado con su margen, y no deja pasar nada', () => {
    const r = fasciasDeLaZona({ catalogo, piezas: [musculo], leer })
    expect(r.piezas).toHaveLength(1)
    const p = r.piezas[0].posiciones
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 1; i < p.length; i += 3) {
      minY = Math.min(minY, p[i])
      maxY = Math.max(maxY, p[i])
    }
    // El músculo va de y = 0,4 a 0,6; con el margen, de 0,39 a 0,61.
    expect(minY).toBeGreaterThanOrEqual(0.4 - MARGEN_DE_LA_FASCIA - 1e-6)
    expect(maxY).toBeLessThanOrEqual(0.6 + MARGEN_DE_LA_FASCIA + 1e-6)
    expect(maxY - minY).toBeGreaterThan(0.2)
    // De los casi dos mil triángulos solo quedan los de esa franja, y la nota lo dice.
    expect(r.piezas[0].indices.length).toBeLessThan(fascia.indices.length / 5)
    expect(r.notas[0]).toMatch(/se tomó la zona de lo exportado/)
  })

  it('no la tapa: el recorte deja un anillo abierto y no un disco', () => {
    const r = fasciasDeLaZona({ catalogo, piezas: [musculo], leer })
    const { posiciones: p, indices: ix } = r.piezas[0]
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3]
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
      const w = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
      const ny = u[2] * w[0] - u[0] * w[2]
      const l = Math.hypot(u[1] * w[2] - u[2] * w[1], ny, u[0] * w[1] - u[1] * w[0]) || 1
      expect(Math.abs(ny / l)).toBeLessThan(0.5)
    }
  })

  it('con el marco con el que se cortó, además, la fascia sigue su borde oblicuo', () => {
    const oblicuo = { punto: [0, 0.5, 0] as [number, number, number], normal: [-0.6, -0.8, 0] as [number, number, number] }
    const otro = { punto: [0, 0.4, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number] }
    const sinMarco = fasciasDeLaZona({ catalogo, piezas: [musculo], leer })
    const conMarco = fasciasDeLaZona({ catalogo, piezas: [musculo], leer, cortes: [corte('musculo', [oblicuo, otro])] })
    expect(conMarco.piezas[0].indices.length).toBeLessThan(sinMarco.piezas[0].indices.length)
    const p = conMarco.piezas[0].posiciones
    for (let i = 0; i < p.length; i += 3) {
      // Del lado bueno del plano oblicuo: -0,6 x − 0,8 (y − 0,5) ≥ 0.
      expect(-0.6 * p[i] - 0.8 * (p[i + 1] - 0.5)).toBeGreaterThanOrEqual(-1e-5)
    }
  })

  it('con más de un marco avisa y recorta solo por la caja', () => {
    const a = { punto: [0, 0.6, 0] as [number, number, number], normal: [0, -1, 0] as [number, number, number] }
    const b = { punto: [-0.1, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number] }
    const c = { punto: [0, 0, 0.1] as [number, number, number], normal: [0, 0, -1] as [number, number, number] }
    const d = { punto: [0, 0, -0.1] as [number, number, number], normal: [0, 0, 1] as [number, number, number] }
    const r = fasciasDeLaZona({ catalogo, piezas: [musculo], leer, cortes: [corte('A', [a, b]), corte('B', [c, d])] })
    expect(r.piezas).toHaveLength(1)
    expect(r.notas.join(' ')).toMatch(/más de un marco/)
  })

  it('no trae nada si no hay músculo, si la fascia no toca la zona, o si ya hay fascia elegida', () => {
    expect(fasciasDeLaZona({ catalogo, piezas: [caja('hueso', 'skeletal', [0, 0.5, 0], 0.2)], leer }).piezas).toEqual([])
    const lejos = caja('musculo', 'muscular', [3, 0.5, 0], 0.2)
    expect(fasciasDeLaZona({ catalogo, piezas: [lejos], leer }).piezas).toEqual([])
    expect(fasciasDeLaZona({ catalogo, piezas: [musculo, manguito('X', 'fascia-profunda', 1)], leer }).piezas).toEqual([])
  })

  it('no lee la geometría de lo que no toca la zona', () => {
    let lecturas = 0
    fasciasDeLaZona({
      catalogo,
      piezas: [caja('musculo', 'muscular', [3, 0.5, 0], 0.2)],
      leer: () => {
        lecturas += 1
        return fascia
      },
    })
    expect(lecturas).toBe(0)
  })
})

// ------------------------------------------------------------ con el atlas

const ATLAS = join(process.cwd(), 'public', 'atlas')
const hay = existsSync(join(ATLAS, 'catalogo.json')) && existsSync(join(ATLAS, 'cuerpo-15.bin.gz'))
const siHay = hay ? it : it.skip

describe('con la pierna derecha del atlas de verdad', () => {
  function pierna() {
    const catalogo = corregirCatalogo(JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8')) as CatalogoDelAtlas)
    const paquetes = new Map<number, ArrayBuffer>()
    const leer = (p: PiezaDelAtlas): PiezaLeida => {
      if (!paquetes.has(p.paquete)) {
        const b = gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[p.paquete].archivo)))
        paquetes.set(p.paquete, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
      }
      const buf = paquetes.get(p.paquete)!
      return {
        id: p.id,
        nombre: p.nombre,
        sistema: p.sistema,
        fma: p.fma,
        posiciones: new Float32Array(new Float32Array(buf, p.pos, p.vertices * 3)),
        normales: new Int16Array(new Int16Array(buf, p.nor, p.vertices * 3)),
        indices: new Uint32Array(new Uint32Array(buf, p.idx, p.indices)),
      }
    }
    // La pierna: lo del miembro inferior derecho y del pie, por debajo de la rodilla (y < 0,46 m).
    const deLaPierna = catalogo.piezas.filter(
      (p) =>
        ['miembro-inferior-derecho', 'pie-derecho'].includes(p.region) &&
        ['muscular', 'skeletal'].includes(p.sistema) &&
        p.caja[1][1] < 0.56,
    )
    return { catalogo, leer, piezas: deLaPierna.map(leer) }
  }

  siHay('la fascia crural entra y la del otro lado no, cortadas a la zona', () => {
    const { catalogo, leer, piezas } = pierna()
    const r = fasciasDeLaZona({ catalogo, piezas, leer })
    const nombres = r.piezas.map((p) => p.nombre)
    expect(nombres).toContain('Right crural fascia')
    expect(nombres.some((n) => /left/i.test(n))).toBe(false)

    const zona = zonaDeLoExportado(piezas)!
    for (const p of r.piezas) {
      const v = p.posiciones
      for (let i = 0; i < v.length; i += 3) {
        for (let e = 0; e < 3; e += 1) {
          expect(v[i + e], `${p.nombre} eje ${e}`).toBeGreaterThanOrEqual(zona[0][e] - MARGEN_DE_LA_FASCIA - 1e-5)
          expect(v[i + e], `${p.nombre} eje ${e}`).toBeLessThanOrEqual(zona[1][e] + MARGEN_DE_LA_FASCIA + 1e-5)
        }
      }
    }
    // La fascia crural solo pierde lo que está fuera de la zona (la rodilla y lo de arriba no la tocan),
    // y la lata, que solo roza, queda reducida a una franja.
    const lata = catalogo.piezas.find((p) => p.nombre === 'Right fascia lata proper')!
    const recortadaLata = r.piezas.find((p) => p.nombre === 'Right fascia lata proper')
    if (recortadaLata) expect(recortadaLata.indices.length).toBeLessThan(lata.indices / 4)
  })

  siHay('exportar con fascias no mueve el centro ni cambia lo que había: solo suma un objeto', () => {
    const { catalogo, leer, piezas } = pierna()
    const colores = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.color]))
    const nombresDeSistema = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.nombre]))
    const sin = prepararExportacion(piezas, { colores, nombresDeSistema })
    const fascias = fasciasDeLaZona({ catalogo, piezas, leer }).piezas
    const con = prepararExportacion([...piezas, ...fascias], { colores, nombresDeSistema })

    // La fascia envuelve y no define: el centro es el mismo y los objetos de siempre siguen ahí.
    expect(con.centro).toEqual(sin.centro)
    const nodosDeSiempre = sin.objetos.map((o) => o.nombre)
    expect(con.objetos.map((o) => o.nombre).filter((n) => nodosDeSiempre.includes(n))).toEqual(nodosDeSiempre)
    const nueva = con.piezas.find((p) => p.etiqueta === 'Fascia profunda')
    expect(nueva).toBeDefined()
    expect(nueva!.rol).toBe('fascia')
    expect(con.sinTraducir).toEqual([])
    expect(con.objetos.length).toBe(sin.objetos.length + 1)
  })
})
