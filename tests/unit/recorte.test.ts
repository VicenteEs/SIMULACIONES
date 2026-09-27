import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { montarEscena } from '@/atlas/cargador'
import { planosDelRectangulo, recortarPorElMarco, type CandidataDelRecorte } from '@/atlas/recorte'
import { crearTodosLosFragmentos } from '@/atlas/fragmentos'
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

  // D-141: un solo corte con los dos planos, y dos piezas. Antes eran dos cortes
  // encadenados y tres piezas —lo de dentro y un trozo de fuera por borde—,
  // y apagar «el resto» se llevaba también lo de dentro.
  it('un cubo que cruza dos bordes se parte una sola vez, por los dos, en dos piezas', () => {
    const camara = camaraDeFrente()
    const { escena, candidata } = escenaConUnCubo([0, 0, 0])
    const marco = { minX: 0, maxX: 0.9, minY: 0, maxY: 0.9 }
    const r = recortarPorElMarco(escena, [candidata], planosDelRectangulo(camara, marco))
    expect(r.cortes).toHaveLength(1)
    expect(r.cortes[0].pieza).toBe('cubo')
    expect(r.cortes[0].otrosPlanos).toHaveLength(1)
    expect(r.dentro).toEqual(['cubo#a'])

    // Y rehecho desde lo guardado, que es como lo ve la ficha: dos trozos, el
    // de dentro con un cuarto del cubo y el de fuera con el resto.
    const trozos = crearTodosLosFragmentos(escena, r.cortes)
    expect([...trozos.keys()].sort()).toEqual(['cubo#a', 'cubo#b'])
    const tamano = (id: string) =>
      trozos.get(id)!.malla.geometry.boundingBox!.getSize(new THREE.Vector3())
    expect(tamano('cubo#a').x).toBeCloseTo(0.1, 3)
    expect(tamano('cubo#a').y).toBeCloseTo(0.1, 3)
    expect(tamano('cubo#b').x).toBeCloseTo(0.2, 3)
    expect(tamano('cubo#b').y).toBeCloseTo(0.2, 3)
  })

  it('un borde que cruza la caja pero no corta la malla no se guarda', () => {
    const camara = camaraDeFrente()
    const { escena, candidata } = escenaConUnCubo([0, 0, 0])
    // La caja declarada es más grande que el cubo: el borde de arriba la cruza
    // y al cubo no lo toca. Solo el de la izquierda corta de verdad. El marco
    // va en coordenadas de pantalla: con 42° de campo y la cámara a cinco
    // metros, 0,104 cae a unos 20 cm de altura, entre el cubo (10) y su caja (30).
    const holgada: CandidataDelRecorte = { ...candidata, caja: [[-0.1, -0.1, -0.1], [0.1, 0.3, 0.1]] }
    const marco = { minX: 0, maxX: 0.9, minY: -0.9, maxY: 0.104 }
    const r = recortarPorElMarco(escena, [holgada], planosDelRectangulo(camara, marco))
    expect(r.cortes).toHaveLength(1)
    expect(r.cortes[0].otrosPlanos).toBeUndefined()
    expect(r.cortes[0].normal[0]).toBeGreaterThan(0.9)
  })
})
