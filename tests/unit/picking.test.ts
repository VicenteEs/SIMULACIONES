import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { montarEscena } from '@/atlas/cargador'
import { piezaBajoElRayo } from '@/atlas/picking'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'

/**
 * Señalar la pieza correcta cuando la cámara está metida dentro de un hueso.
 *
 * El picking descarta piezas por su caja envolvente y solo mira los triángulos
 * de las que sobreviven, cortando en cuanto una caja queda más lejos que el
 * mejor impacto real. Ese corte da por hecho que la distancia anotada de cada
 * caja es la de ENTRADA. Cuando el origen del rayo está dentro de la caja no lo
 * es —three devuelve entonces el punto de salida—, y la pieza que se tiene
 * delante de los ojos se ordenaba la última y se descartaba sin mirarla.
 *
 * Es el único escenario que distingue las dos versiones del código, y pasa a
 * diario: `OrbitControls.minDistance` son 10 cm y la caja del fémur mide 47 cm
 * de largo por 12 de ancho, así que acercarse a la diáfisis para ver el trazo
 * de fractura mete la cámara dentro del hueso. Con el fallo, el nombre flotante
 * decía «Vastus medialis» sobre el fémur y el clic —que en el taller es «esto
 * me estorba, fuera»— apagaba el músculo en lugar del hueso.
 */

// Medidas reales del fémur derecho del catálogo: es la caja en la que la cámara
// se mete de verdad, y por eso se usa aquí en vez de un cubo de juguete.
const CAJA_FEMUR: PiezaDelAtlas['caja'] = [
  [-0.15, 0.446, -0.05],
  [-0.032, 0.912, 0.012],
]
const CAJA_VASTO: PiezaDelAtlas['caja'] = [
  [-0.2, 0.5, -0.1],
  [0.0, 0.58, 0.05],
]

/** Un triángulo horizontal dentro del fémur, a 1 cm del ojo. */
const TRIANGULO_FEMUR: [number, number, number][] = [
  [-0.14, 0.59, -0.04],
  [-0.04, 0.59, -0.04],
  [-0.09, 0.59, 0.01],
]
/** Otro dentro del músculo, a 5 cm: más lejos, pero su caja se cruza antes. */
const TRIANGULO_VASTO: [number, number, number][] = [
  [-0.19, 0.55, -0.09],
  [-0.01, 0.55, -0.09],
  [-0.1, 0.55, 0.04],
]

interface Cruda {
  id: string
  nombre: string
  sistema: string
  caja: PiezaDelAtlas['caja']
  triangulo: [number, number, number][]
}

/**
 * Arma un paquete con la misma forma que produce `scripts/atlas/preparar.mjs`:
 * posiciones, normales e índices seguidos dentro de un solo búfer, y en el
 * catálogo los desplazamientos en bytes. El cargador construye vistas tipadas
 * sobre esos desplazamientos tal cual, así que hay que respetar la alineación
 * —`pos` e `idx` múltiplos de 4, `nor` de 2— o revienta al montar.
 */
function empaquetar(crudas: Cruda[]): { catalogo: CatalogoDelAtlas; bufer: ArrayBuffer } {
  const trozos: { pos: number; nor: number; idx: number }[] = []
  let cursor = 0
  for (let i = 0; i < crudas.length; i += 1) {
    const pos = cursor
    cursor += 9 * 4
    const nor = cursor
    cursor += 9 * 2
    cursor += (4 - (cursor % 4)) % 4
    const idx = cursor
    cursor += 3 * 4
    trozos.push({ pos, nor, idx })
  }

  const bufer = new ArrayBuffer(cursor)
  crudas.forEach((cruda, i) => {
    const trozo = trozos[i]
    new Float32Array(bufer, trozo.pos, 9).set(cruda.triangulo.flat())
    // Normal hacia arriba en el entero de 16 bits normalizado que espera el
    // cargador. El picking no la mira, pero el búfer debe tener la forma real.
    new Int16Array(bufer, trozo.nor, 9).set([0, 32767, 0, 0, 32767, 0, 0, 32767, 0])
    new Uint32Array(bufer, trozo.idx, 3).set([0, 1, 2])
  })

  const sistemas = [...new Set(crudas.map((c) => c.sistema))]
  const catalogo: CatalogoDelAtlas = {
    version: 'prueba-picking',
    fuente: 'BodyParts3D 4.0',
    licencia: 'CC BY 4.0',
    sujeto: 'Prueba',
    triangulos: crudas.length,
    sistemas: sistemas.map((id, orden) => ({ id, nombre: id, color: '#cccccc', orden })),
    regiones: [{ id: 'miembro-inferior-derecho', nombre: 'Miembro inferior derecho', orden: 1 }],
    paquetes: [
      { archivo: 'cuerpo-0.bin.gz', bytes: bufer.byteLength, bytesComprimido: bufer.byteLength },
    ],
    piezas: crudas.map((cruda, i) => ({
      id: cruda.id,
      nombre: cruda.nombre,
      fma: `FMA-${cruda.id}`,
      sistema: cruda.sistema,
      region: 'miembro-inferior-derecho',
      origenRegion: 'anatomia' as const,
      paquete: 0,
      pos: trozos[i].pos,
      nor: trozos[i].nor,
      idx: trozos[i].idx,
      vertices: 3,
      indices: 3,
      caja: cruda.caja,
    })),
  }

  return { catalogo, bufer }
}

function escenaDePrueba() {
  const { catalogo, bufer } = empaquetar([
    {
      id: 'femur',
      nombre: 'Right femur',
      sistema: 'skeletal',
      caja: CAJA_FEMUR,
      triangulo: TRIANGULO_FEMUR,
    },
    {
      id: 'vasto',
      nombre: 'Vastus medialis',
      sistema: 'muscular',
      caja: CAJA_VASTO,
      triangulo: TRIANGULO_VASTO,
    },
  ])
  const escena = montarEscena(catalogo, new Map([[0, bufer]]))
  return { catalogo, escena }
}

/** Un rayo suelto: `piezaBajoElRayo` solo mira `rayo.ray`, no la cámara. */
function rayoDesde(origen: [number, number, number], direccion: [number, number, number]) {
  const rayo = new THREE.Raycaster()
  rayo.ray.origin.set(...origen)
  rayo.ray.direction.set(...direccion).normalize()
  return rayo
}

describe('señalar una pieza con el ratón', () => {
  it('acierta con la cámara fuera de todas las cajas', () => {
    const { catalogo, escena } = escenaDePrueba()
    // Desde arriba del todo, fuera de las dos cajas: el fémur sigue estando
    // delante del músculo y es el caso que ya funcionaba.
    const rayo = rayoDesde([-0.09, 1.2, -0.02], [0, -1, 0])
    expect(catalogo.piezas[piezaBajoElRayo(rayo, catalogo, escena)].nombre).toBe('Right femur')
  })

  it('acierta con la cámara dentro de la caja del hueso', () => {
    const { catalogo, escena } = escenaDePrueba()
    // El ojo está dentro de la caja del fémur y a 1 cm de su cortical; la del
    // músculo se cruza por fuera, a 2 cm. Anotando la salida de la caja del
    // fémur —15 cm— el corte de la etapa 2 lo tiraba y contestaba el músculo.
    const rayo = rayoDesde([-0.09, 0.6, -0.02], [0, -1, 0])
    expect(catalogo.piezas[piezaBajoElRayo(rayo, catalogo, escena)].nombre).toBe('Right femur')
  })

  it('el punto que devuelve three con el origen dentro es el de salida', () => {
    // La premisa del arreglo, comprobada contra la versión de three instalada
    // por si algún día cambia: 0,154 es la salida por el otro extremo del
    // fémur, y no acota por abajo un impacto que ocurre a 0,01.
    const rayo = rayoDesde([-0.09, 0.6, -0.02], [0, -1, 0])
    const caja = new THREE.Box3(
      new THREE.Vector3(...CAJA_FEMUR[0]),
      new THREE.Vector3(...CAJA_FEMUR[1]),
    )
    const punto = new THREE.Vector3()
    expect(caja.containsPoint(rayo.ray.origin)).toBe(true)
    expect(rayo.ray.intersectBox(caja, punto)).not.toBeNull()
    expect(rayo.ray.origin.distanceTo(punto)).toBeGreaterThan(0.15)
  })

  it('una pieza apagada no se señala aunque el rayo la atraviese', () => {
    const { catalogo, escena } = escenaDePrueba()
    // Apagar es el gesto más frecuente del taller: si lo apagado siguiera
    // respondiendo, cada clic devolvería lo que se acaba de quitar de en medio.
    escena.datos[0 * 4 + 3] = 0
    const rayo = rayoDesde([-0.09, 0.6, -0.02], [0, -1, 0])
    expect(catalogo.piezas[piezaBajoElRayo(rayo, catalogo, escena)].nombre).toBe('Vastus medialis')
  })

  it('un rayo que no toca nada devuelve −1', () => {
    const { catalogo, escena } = escenaDePrueba()
    const rayo = rayoDesde([2, 2, 2], [1, 0, 0])
    expect(piezaBajoElRayo(rayo, catalogo, escena)).toBe(-1)
  })
})
