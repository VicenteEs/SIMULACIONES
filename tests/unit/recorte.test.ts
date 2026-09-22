import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { montarEscena } from '@/atlas/cargador'
import { planosDelRectangulo, recortarPorElMarco, type CandidataDelRecorte } from '@/atlas/recorte'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/** El marco que corta (D-140): sus cuatro planos y lo que hace con lo que cruza. */

function camaraDeFrente() {
  const camara = new THREE.PerspectiveCamera(42, 1, 0.02, 60)
  camara.position.set(0, 0, 5)
  camara.lookAt(0, 0, 0)
  camara.updateMatrixWorld()
  camara.updateProjectionMatrix()
  return camara
}

/** Una escena con un solo cubo de 20 cm centrado en `centro`, como lo montaría el cargador. */
function escenaConUnCubo(centro: [number, number, number]) {
  const caja = new THREE.BoxGeometry(0.2, 0.2, 0.2, 2, 2, 2).translate(...centro)
  const posiciones = new Float32Array(caja.getAttribute('position').array)
  const normalesFlotantes = caja.getAttribute('normal').array
  const normales = new Int16Array(normalesFlotantes.length)
  for (let i = 0; i < normales.length; i += 1) normales[i] = Math.round(normalesFlotantes[i] * 32767)
  const indices = new Uint32Array(caja.getIndex()!.array)
  // Un paquete con los tres bloques seguidos, alineados a 4 bytes.
  const alinear = (n: number) => (n + 3) & ~3
  const nor = alinear(posiciones.byteLength)
  const idx = alinear(nor + normales.byteLength)
  const bufer = new ArrayBuffer(idx + indices.byteLength)
  new Uint8Array(bufer).set(new Uint8Array(posiciones.buffer), 0)
  new Uint8Array(bufer).set(new Uint8Array(normales.buffer), nor)
  new Uint8Array(bufer).set(new Uint8Array(indices.buffer), idx)
  const vertices = posiciones.length / 3
  const catalogo = {
    version: 'prueba',
    sistemas: [{ id: 'skeletal', nombre: 'Esqueleto', color: '#ffffff' }],
    regiones: [],
    paquetes: [{ archivo: 'x', bytes: bufer.byteLength, bytesComprimido: 0 }],
    piezas: [
      {
        id: 'cubo',
        nombre: 'Cube',
        fma: '',
        sistema: 'skeletal',
        region: 'x',
        origenRegion: 'anatomia',
        paquete: 0,
        pos: 0,
        nor,
        idx,
        vertices,
        indices: indices.length,
        caja: [
          [centro[0] - 0.1, centro[1] - 0.1, centro[2] - 0.1],
          [centro[0] + 0.1, centro[1] + 0.1, centro[2] + 0.1],
        ],
      },
    ],
  } as unknown as CatalogoDelAtlas
  const escena = montarEscena(catalogo, new Map([[0, bufer]]))
  const candidata: CandidataDelRecorte = {
    id: 'cubo',
    indice: 0,
    centro: new THREE.Vector3(...centro),
    transformacion: null,
    caja: catalogo.piezas[0].caja,
  }
  return { escena, candidata }
}

describe('planosDelRectangulo', () => {
  it('son cuatro, pasan por la cámara y miran hacia dentro del marco', () => {
    const camara = camaraDeFrente()
    const planos = planosDelRectangulo(camara, { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 })
    expect(planos).toHaveLength(4)
    const centroDelMarco = new THREE.Vector3(0, 0, 0)
    for (const plano of planos) {
      const n = new THREE.Vector3(...plano.normal)
      const p = new THREE.Vector3(...plano.punto)
      expect(Math.abs(camara.position.clone().sub(p).dot(n))).toBeLessThan(1e-9)
      expect(centroDelMarco.clone().sub(p).dot(n)).toBeGreaterThan(0)
    }
  })
})

describe('recortarPorElMarco', () => {
  const MARCO_ANCHO = { minX: -0.9, maxX: 0.9, minY: -0.9, maxY: 0.9 }

  it('lo que cae entero dentro se selecciona sin cortar, y lo de fuera se deja', () => {
    const camara = camaraDeFrente()
    const dentro = escenaConUnCubo([0, 0, 0])
    const r1 = recortarPorElMarco(dentro.escena, [dentro.candidata], planosDelRectangulo(camara, MARCO_ANCHO))
    expect(r1.cortes).toEqual([])
    expect(r1.dentro).toEqual(['cubo'])
    const fuera = escenaConUnCubo([1.5, 0, 0])
    const r2 = recortarPorElMarco(fuera.escena, [fuera.candidata], planosDelRectangulo(camara, { minX: -0.3, maxX: 0.3, minY: -0.9, maxY: 0.9 }))
    expect(r2.cortes).toEqual([])
    expect(r2.dentro).toEqual([])
  })

  // El cubo va de x = −0,1 a 0,1 y el marco corta por x = 0 (a la profundidad
  // del cubo): un corte, y lo de dentro es el lado `a`.
  it('lo que cruza un borde se parte por ese borde y queda dentro el trozo de dentro', () => {
    const camara = camaraDeFrente()
    const { escena, candidata } = escenaConUnCubo([0, 0, 0])
    const marco = { minX: 0, maxX: 0.9, minY: -0.9, maxY: 0.9 }
    const r = recortarPorElMarco(escena, [candidata], planosDelRectangulo(camara, marco))
    expect(r.cortes).toHaveLength(1)
    expect(r.cortes[0].pieza).toBe('cubo')
    // La normal del plano guardado mira hacia dentro del marco: hacia +X.
    expect(r.cortes[0].normal[0]).toBeGreaterThan(0.9)
    expect(r.dentro).toEqual(['cubo#a'])
    expect(r.sinPartir).toBe(0)
  })

  it('un cubo que cruza dos bordes se parte dos veces, encadenadas', () => {
    const camara = camaraDeFrente()
    const { escena, candidata } = escenaConUnCubo([0, 0, 0])
    const marco = { minX: 0, maxX: 0.9, minY: 0, maxY: 0.9 }
    const r = recortarPorElMarco(escena, [candidata], planosDelRectangulo(camara, marco))
    expect(r.cortes.map((c) => c.pieza)).toEqual(['cubo', 'cubo#a'])
    expect(r.dentro).toEqual(['cubo#a#a'])
  })
})
