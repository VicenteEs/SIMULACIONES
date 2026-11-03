import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import referencias from '@/atlas/referenciasDelCuerpo.json'
import {
  aspectoPropioDe,
  bordeAbiertoCerca,
  cueroCabelludo,
  pigmentoDeLaPiel,
  pigmentoDeLosLabios,
  pigmentoDelOjo,
  tinteDeLaPiel,
  type Vec3,
} from '@/atlas/pigmentacion'

/**
 * La pigmentación del cuerpo (D-227).
 *
 * Lo que se vigila aquí falla sin ruido: un punto de referencia que quedó en el aire tras regenerar el atlas pinta
 * un codo en el sitio de al lado, y un tinte que sale mayor que uno satura sin que nada lo avise. Los puntos se
 * miden contra la piel instalada; los colores, contra lo que una persona espera ver: el codo más oscuro que el
 * antebrazo, el labio más rojo que la mejilla, la pupila más negra que el iris.
 */

const puntos = referencias as unknown as Record<string, Vec3>
const punto = (nombre: string): Vec3 => puntos[nombre]

/** Los puntos que no están sobre la piel porque no se miden en ella: el centro del globo del ojo y las piezas internas o de relieve. */
const FUERA_DE_LA_PIEL: Record<string, number> = {
  'ojo-derecho': 0.012,
  'ojo-izquierdo': 0.012,
  glande: 0.02,
  labios: 0.01,
  'oreja-derecho': 0.004,
  'oreja-izquierdo': 0.004,
}

describe('los puntos de referencia del cuerpo', () => {
  const RAIZ = process.cwd()
  const catalogo = JSON.parse(readFileSync(join(RAIZ, 'public', 'atlas', 'catalogo.json'), 'utf8')) as {
    paquetes: { archivo: string }[]
    piezas: { id: string; nombre: string; paquete: number; pos: number; vertices: number }[]
  }
  const piel = catalogo.piezas.find((p) => p.nombre === 'Skin')!
  const bufer = gunzipSync(readFileSync(join(RAIZ, 'public', 'atlas', catalogo.paquetes[piel.paquete].archivo)))
  const vertices = new Float32Array(bufer.buffer.slice(bufer.byteOffset + piel.pos, bufer.byteOffset + piel.pos + piel.vertices * 12))

  /** La distancia del punto al vértice más cercano de la piel, en metros. */
  const distanciaALaPiel = (p: Vec3) => {
    let mejor = Infinity
    for (let i = 0; i < vertices.length; i += 3) {
      const d = (vertices[i] - p[0]) ** 2 + (vertices[i + 1] - p[1]) ** 2 + (vertices[i + 2] - p[2]) ** 2
      if (d < mejor) mejor = d
    }
    return Math.sqrt(mejor)
  }

  it('hay un punto por lado en cada zona que lo pide, y los de la derecha caen en x negativa', () => {
    for (const nombre of Object.keys(puntos)) {
      if (!nombre.endsWith('-derecho')) continue
      const par = nombre.replace(/-derecho$/, '-izquierdo')
      expect(puntos[par], `falta ${par}`).toBeDefined()
      expect(puntos[nombre][0], nombre).toBeLessThan(0)
      expect(puntos[par][0], par).toBeGreaterThan(0)
    }
  })

  it('cada punto está sobre la piel del atlas instalado, a menos de unos milímetros', () => {
    // Los 70 puntos contra 245.000 vértices: unas diecisiete millones de distancias, una fracción de segundo.
    const lejos: string[] = []
    for (const [nombre, p] of Object.entries(puntos)) {
      const margen = FUERA_DE_LA_PIEL[nombre] ?? 0.003
      const d = distanciaALaPiel(p)
      if (d > margen) lejos.push(`${nombre}: a ${(d * 1000).toFixed(1)} mm`)
    }
    expect(lejos, 'puntos en el aire: se regeneró el atlas y hay que volver a correr medir.py').toEqual([])
  })

  it('el codo y la rodilla de los dos lados quedan a la misma altura, con unos centímetros de diferencia a lo sumo', () => {
    expect(Math.abs(punto('codo-derecho')[1] - punto('codo-izquierdo')[1])).toBeLessThan(0.02)
    expect(Math.abs(punto('rodilla-derecho')[1] - punto('rodilla-izquierdo')[1])).toBeLessThan(0.02)
  })
})

describe('el tinte de la piel', () => {
  const tinte = (p: Vec3, normal: Vec3) => tinteDeLaPiel(p[0], p[1], p[2], normal[0], normal[1], normal[2], [1, 1, 1])
  const luz = (t: Vec3) => (t[0] + t[1] + t[2]) / 3

  it('nunca aclara ni se sale del rango: un color por vértice solo multiplica', () => {
    for (const [nombre, p] of Object.entries(puntos)) {
      for (const normal of [[0, 0, 1], [0, 0, -1], [0, -1, 0], [1, 0, 0]] as Vec3[]) {
        const t = tinte(p, normal)
        for (const c of t) {
          expect(c, nombre).toBeGreaterThan(0)
          expect(c, nombre).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('el codo es más oscuro y más rojizo que el antebrazo, y lo mismo con la rodilla', () => {
    const codo = punto('codo-derecho')
    const antebrazo: Vec3 = [codo[0] - 0.02, codo[1] - 0.12, codo[2] + 0.005]
    expect(luz(tinte(codo, [0, 0, -1]))).toBeLessThan(luz(tinte(antebrazo, [0, 0, -1])))
    const t = tinte(codo, [0, 0, -1])
    // Rojizo: pierde más verde y azul que rojo.
    expect(t[0]).toBeGreaterThan(t[1])
    expect(t[1]).toBeGreaterThan(0.4)

    const rodilla = punto('rodilla-izquierdo')
    const muslo: Vec3 = [rodilla[0], rodilla[1] + 0.2, rodilla[2]]
    expect(luz(tinte(rodilla, [0, 0, 1]))).toBeLessThan(luz(tinte(muslo, [0, 0, 1])))
  })

  it('el izquierdo es el reflejo del derecho', () => {
    const d = punto('codo-derecho')
    const i = punto('codo-izquierdo')
    const ad = tinte(d, [0, 0, -1])
    const ai = tinte(i, [0, 0, -1])
    // Los puntos no son espejos exactos (el cuerpo no lo es), pero el tinte que dan sí lo es: misma mancha.
    expect(ai[0]).toBeCloseTo(ad[0], 1)
    expect(ai[1]).toBeCloseTo(ad[1], 1)
  })

  it('la palma es más clara que el dorso de la misma mano, y lo dice la normal', () => {
    const nudillo = punto('nudillo-medio-derecho')
    const palma: Vec3 = [nudillo[0], nudillo[1] + 0.03, nudillo[2] + 0.02]
    expect(luz(tinte(palma, [0, 0, 1]))).toBeGreaterThan(luz(tinte(nudillo, [0, 0, -1])))
    // La misma posición, vista por el otro lado: la mancha de la palma no se aplica al dorso.
    expect(luz(tinte(palma, [0, 0, -1]))).toBeGreaterThan(0.9)
  })

  it('el pezón y su areola oscurecen una zona redonda, y fuera de ella no hay nada', () => {
    const pezon = punto('pezon-derecho')
    const centro = tinte(pezon, [0, 0, 1])
    const aLaOrilla = tinte([pezon[0] + 0.012, pezon[1], pezon[2]], [0, 0, 1])
    const lejos = tinte([pezon[0] + 0.05, pezon[1], pezon[2]], [0, 0, 1])
    expect(luz(centro)).toBeLessThan(luz(aLaOrilla))
    expect(luz(aLaOrilla)).toBeLessThan(luz(lejos))
    expect(luz(lejos)).toBeGreaterThan(0.97)
  })

  it('una zona tiene meseta: hasta la mitad del radio el tinte es el mismo', () => {
    const pezon = punto('pezon-izquierdo')
    const a = tinte(pezon, [0, 0, 1])
    const b = tinte([pezon[0] + 0.004, pezon[1], pezon[2]], [0, 0, 1])
    expect(b[1]).toBeCloseTo(a[1], 1)
  })

  it('la ceja oscurece sobre el ojo, y no bajo él', () => {
    const ojo = punto('ojo-derecho')
    const sobre = tinte([ojo[0], ojo[1] + 0.0215, ojo[2] + 0.02], [0, 0, 1])
    const bajo = tinte([ojo[0], ojo[1] - 0.03, ojo[2] + 0.02], [0, 0, 1])
    expect(luz(sobre)).toBeLessThan(luz(bajo) - 0.15)
  })
})

describe('los nudillos', () => {
  const tinte = (p: Vec3, normal: Vec3) => tinteDeLaPiel(p[0], p[1], p[2], normal[0], normal[1], normal[2], [1, 1, 1])
  const luz = (t: Vec3) => (t[0] + t[1] + t[2]) / 3
  const dedos = ['indice', 'medio', 'anular', 'menique']

  it('oscurecen y enrojecen el dorso apenas: el verde del centro queda entre 0,65 y 0,92', () => {
    for (const lado of ['derecho', 'izquierdo']) {
      for (const dedo of dedos) {
        const t = tinte(punto(`nudillo-${dedo}-${lado}`), [0, 0, -1])
        // Antes (D-227 a medias) el centro bajaba a 0,62, con las capas apiladas y el nudillo se leía como un moratón.
        expect(t[1], `nudillo ${dedo} ${lado}`).toBeGreaterThan(0.65)
        expect(t[1], `nudillo ${dedo} ${lado}`).toBeLessThan(0.92)
        expect(t[0]).toBeGreaterThan(t[1])
      }
    }
  })

  it('la articulación del medio es más oscura que la de la punta, y las dos más que el hueso del dedo entre ellas', () => {
    const proximal = punto('interfalangica-proximal-medio-derecho')
    const distal = punto('interfalangica-distal-medio-derecho')
    const entre: Vec3 = [(proximal[0] + distal[0]) / 2, (proximal[1] + distal[1]) / 2, (proximal[2] + distal[2]) / 2]
    const p = luz(tinte(proximal, [0, 0, -1]))
    const d = luz(tinte(distal, [0, 0, -1]))
    expect(p).toBeLessThan(d)
    expect(p).toBeLessThan(luz(tinte(entre, [0, 0, -1])))
  })

  it('el dorso del dedo es más moreno que su palma', () => {
    const base = punto('nudillo-indice-derecho')
    const yema = punto('yema-indice-derecho')
    const mitad: Vec3 = [(base[0] + yema[0]) / 2, (base[1] + yema[1]) / 2, (base[2] + yema[2]) / 2]
    expect(luz(tinte(mitad, [0, 0, -1]))).toBeLessThan(luz(tinte(mitad, [0, 0, 1])))
  })

  it('la mancha es más ancha que larga: más a lo ancho del dedo (x) que a lo largo (y)', () => {
    // Era un disco igual en todas direcciones, que a 5,5 mm por vértice se veía como una moneda pegada en el dedo.
    // A 6 mm y no más: a 9 ya está el nudillo del dedo de al lado, que está a unos 18 mm.
    let ancho = 0, largo = 0, n = 0
    for (const lado of ['derecho', 'izquierdo']) {
      for (const dedo of dedos) {
        const c = punto(`nudillo-${dedo}-${lado}`)
        ancho += luz(tinte([c[0] + 0.006, c[1], c[2]], [0, 0, -1])) + luz(tinte([c[0] - 0.006, c[1], c[2]], [0, 0, -1]))
        largo += luz(tinte([c[0], c[1] + 0.006, c[2]], [0, 0, -1])) + luz(tinte([c[0], c[1] - 0.006, c[2]], [0, 0, -1]))
        n += 2
      }
    }
    expect(ancho / n).toBeLessThan(largo / n)
  })

  it('no es un óvalo exacto (el borde es irregular) y el resultado se repite', () => {
    const c = punto('nudillo-medio-derecho')
    const a = tinte([c[0] + 0.009, c[1] + 0.004, c[2]], [0, 0, -1])
    const b = tinte([c[0] - 0.009, c[1] + 0.004, c[2]], [0, 0, -1])
    const otraVez = tinte([c[0] + 0.009, c[1] + 0.004, c[2]], [0, 0, -1])
    expect(a).toEqual(otraVez)
    expect(a[1]).not.toBeCloseTo(b[1], 4)
  })

  it('el pulgar, que no tiene nudillo que sobresalga, es más tenue que los otros dedos', () => {
    const pulgar = luz(tinte(punto('nudillo-pulgar-derecho'), [0, 0, -1]))
    const medio = luz(tinte(punto('nudillo-medio-derecho'), [0, 0, -1]))
    expect(pulgar).toBeGreaterThan(medio)
  })
})

describe('el cuero cabelludo', () => {
  it('cubre la coronilla y no la frente ni la cara', () => {
    expect(cueroCabelludo(0, 1.7, 0.0)).toBeCloseTo(1, 1)
    expect(cueroCabelludo(0, 1.64, 0.07)).toBe(0)
    expect(cueroCabelludo(0, 1.56, 0.1)).toBe(0)
  })

  it('baja por la nuca y se acaba antes de los hombros', () => {
    expect(cueroCabelludo(0, 1.6, -0.09)).toBeGreaterThan(0.9)
    expect(cueroCabelludo(0, 1.45, -0.08)).toBe(0)
  })
})

describe('la piel entera', () => {
  /** Un cuadrado fino en las coordenadas de la rodilla derecha del atlas, con sus normales hacia delante. */
  const rodilla = punto('rodilla-derecho')
  const malla = {
    posiciones: new Float32Array([rodilla[0] - 0.01, rodilla[1], rodilla[2], rodilla[0] + 0.01, rodilla[1], rodilla[2], rodilla[0], rodilla[1] + 0.05, rodilla[2]]),
    normales: new Int16Array([0, 0, 32767, 0, 0, 32767, 0, 0, 32767]),
  }

  it('da cuatro bytes por vértice, con la opacidad completa', () => {
    const colores = pigmentoDeLaPiel(malla.posiciones, malla.normales)
    expect(colores).toHaveLength(12)
    for (let i = 0; i < 3; i++) expect(colores[i * 4 + 3]).toBe(255)
  })

  it('la rodilla sale más oscura que el muslo, leída de los bytes', () => {
    const colores = pigmentoDeLaPiel(
      new Float32Array([...malla.posiciones.subarray(0, 3), rodilla[0], rodilla[1] + 0.25, rodilla[2]]),
      new Int16Array([0, 0, 32767, 0, 0, 32767]),
    )
    expect(colores[1]).toBeLessThan(colores[5])
  })

  it('es repetible: la misma malla da los mismos bytes', () => {
    const a = pigmentoDeLaPiel(malla.posiciones, malla.normales)
    const b = pigmentoDeLaPiel(malla.posiciones, malla.normales)
    expect([...a]).toEqual([...b])
  })

  it('con las normales en flotantes da lo mismo que en enteros de 16 bits', () => {
    const enteros = pigmentoDeLaPiel(malla.posiciones, malla.normales)
    const flotantes = pigmentoDeLaPiel(malla.posiciones, new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
    expect([...enteros]).toEqual([...flotantes])
  })

  it('con los índices pinta el borde abierto de la rendija del ojo, y arriba más oscuro que abajo', () => {
    // Un anillo de ocho vértices, abierto (sin triángulos que lo cierren) alrededor del ojo derecho.
    const ojo = punto('ojo-derecho')
    const posiciones: number[] = []
    const indices: number[] = []
    const n = 12
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI
      // Una elipse achatada, y un vértice exterior por cada uno para tener triángulos que dejen el borde abierto.
      posiciones.push(ojo[0] + 0.012 * Math.cos(a), ojo[1] + 0.005 * Math.sin(a), ojo[2] + 0.005)
    }
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI
      posiciones.push(ojo[0] + 0.02 * Math.cos(a), ojo[1] + 0.012 * Math.sin(a), ojo[2] + 0.005)
    }
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n
      indices.push(k, k2, n + k, k2, n + k2, n + k)
    }
    const normales = new Float32Array(posiciones.length).map((_, i) => (i % 3 === 2 ? 1 : 0))
    const bordes = bordeAbiertoCerca(new Float32Array(posiciones), new Uint32Array(indices), [ojo], 0.03)
    // El anillo interior es el borde abierto; el exterior también (nadie lo cierra por fuera).
    expect(bordes.length).toBe(2 * n)
    const colores = pigmentoDeLaPiel(new Float32Array(posiciones), normales, new Uint32Array(indices))
    // El vértice de arriba (a = 90°) y el de abajo (a = 270°) del anillo interior.
    const arriba = (n / 4) * 4 + 1
    const abajo = ((3 * n) / 4) * 4 + 1
    expect(colores[arriba]).toBeLessThan(colores[abajo])
  })
})

describe('los labios', () => {
  const centro = punto('labios')
  const colores = pigmentoDeLosLabios(
    new Float32Array([centro[0], centro[1] - 0.0008, centro[2], centro[0] + 0.024, centro[1], centro[2], centro[0], centro[1] + 0.008, centro[2]]),
  )
  const rojo = (i: number) => [colores[i * 4], colores[i * 4 + 1], colores[i * 4 + 2]]

  it('son rojizos: casi no pierden rojo y pierden mucho verde', () => {
    const [r, g, b] = rojo(0)
    expect(r).toBeGreaterThan(g * 1.5)
    expect(b).toBeLessThan(r)
  })

  it('son un rosa apagado y no una pintura: el verde no baja de 0,35 en la línea ni de 0,45 en el labio', () => {
    // Antes (0,27 de verde) el labio se leía como una pieza roja puesta sobre la cara, y brillaba como laca.
    const linea = rojo(0)[1] / 255
    const enElLabio = pigmentoDeLosLabios(new Float32Array([centro[0] + 0.006, centro[1] + 0.004, centro[2]]))
    expect(linea).toBeGreaterThan(0.35)
    expect(enElLabio[1] / 255).toBeGreaterThan(0.45)
    // Y por debajo de 0,62: sigue siendo la mucosa que el simulador moja y de la que no nace vello.
    expect(enElLabio[1] / 255).toBeLessThan(0.62)
  })

  it('la línea de la boca es más oscura que el borde y que la comisura', () => {
    expect(rojo(0)[0]).toBeLessThan(rojo(2)[0])
    expect(rojo(0)[0]).toBeLessThan(rojo(1)[0])
  })
})

describe('los ojos', () => {
  /** Un disco de vértices, para el iris: el centro, un anillo a media altura y otro en el borde. */
  const disco = (cx: number, cy: number, radio: number): Float32Array => {
    const v: number[] = [cx, cy, 0.06]
    for (const f of [0.15, 0.5, 0.95]) for (let k = 0; k < 8; k++) v.push(cx + Math.cos((k / 8) * 6.2832) * radio * f, cy + Math.sin((k / 8) * 6.2832) * radio * f, 0.06)
    return new Float32Array(v)
  }

  it('solo colorea las piezas del ojo, y no sus vecinas por llevar la misma palabra', () => {
    expect(pigmentoDelOjo('Left iris', disco(0, 0, 0.0056))).not.toBeNull()
    expect(pigmentoDelOjo('Tarsal plate of right upper eyelid', disco(0, 0, 0.01))).not.toBeNull()
    expect(pigmentoDelOjo('Suspensory ligament of left lens', disco(0, 0, 0.0056))).toBeNull()
    expect(pigmentoDelOjo('Right cornea', disco(0, 0, 0.0056))).toBeNull()
    expect(pigmentoDelOjo('Right femur', disco(0, 0, 0.0056))).toBeNull()
  })

  it('el iris tiene la pupila oscura en el centro y el limbo oscuro en el borde, y entre los dos es castaño', () => {
    const c = pigmentoDelOjo('Left iris', disco(0.03, 1.596, 0.0056))!
    const luz = (i: number) => c[i * 4] + c[i * 4 + 1] + c[i * 4 + 2]
    const pupila = luz(0)
    const cuerpo = luz(1 + 8 + 2)
    const limbo = luz(1 + 16 + 2)
    expect(cuerpo).toBeGreaterThan(pupila)
    expect(cuerpo).toBeGreaterThan(limbo)
    // Castaño: más rojo que azul.
    const i = 1 + 8 + 2
    expect(c[i * 4]).toBeGreaterThan(c[i * 4 + 2] * 2)
  })

  it('la esclera es clara y el cristalino, negro', () => {
    const esfera = new Float32Array(3 * 14)
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI
      esfera.set([0.03 + 0.012 * Math.sin(a) * Math.cos(k), 1.596 + 0.012 * Math.sin(a) * Math.sin(k), 0.05 + 0.012 * Math.cos(a)], k * 3)
    }
    const esclera = pigmentoDelOjo('Right sclera', esfera)!
    const media = [0, 1, 2].map((c) => esclera.filter((_, i) => i % 4 === c).reduce((t, v) => t + v, 0) / 14)
    expect(media[0]).toBeGreaterThan(130)
    const cristalino = pigmentoDelOjo('Right lens', esfera)!
    expect(cristalino[0] + cristalino[1] + cristalino[2]).toBeLessThan(15)
  })

  it('agrupa las piezas del ojo y la córnea aparte, porque una es opaca y la otra transparente', () => {
    expect(aspectoPropioDe('Left sclera')?.grupo).toBe('ojos')
    expect(aspectoPropioDe('Optic part of right retina')?.grupo).toBe('ojos')
    expect(aspectoPropioDe('Tarsal plate of left lower eyelid')?.grupo).toBe('ojos')
    expect(aspectoPropioDe('Left cornea')?.grupo).toBe('cornea')
    expect(aspectoPropioDe('Anterior chamber of right eyeball')?.grupo).toBe('cornea')
    expect(aspectoPropioDe('Skin')).toBeNull()
    expect(aspectoPropioDe('Suspensory ligament of right lens')).toBeNull()
  })
})
