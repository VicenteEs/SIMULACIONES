import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buscarAsiento,
  caraRecta,
  celdaDe,
  ejeDelHuesoCerca,
  normalMediaCerca,
  nubeDeLaGeometria,
  puntosDelHuesoCerca,
} from '@/components/simulador/asientoDeLaPlaca'
import { colocarPlaca, crearImplantes } from '@/components/simulador/implantesEnLaEscena'
import { avisoDelAsiento, type ResumenDelAsiento } from '@/lib/fijacion'

/**
 * La placa asentada como un sólido sobre el hueso (P-009). Las escenas son de cartón y en milímetros
 * (milimetrosPorUnidad = 1): un cilindro, una cara inclinada y dos bloques que hacen de fragmentos, uno de ellos
 * corrido hacia arriba como una fractura sin reducir. Lo que se pide en todas es lo que pidió el dueño: que la placa no
 * se meta en el hueso en ningún punto y que quede recta sobre él.
 */

const GRADO = Math.PI / 180

function enEscena(...mallas: THREE.Mesh[]) {
  const escena = new THREE.Scene()
  for (const m of mallas) escena.add(m)
  escena.updateMatrixWorld(true)
  return escena
}

/** Un bloque de hueso de 12 × largo × 12 mm a lo largo de Y, con la cara de arriba a `arriba` mm. */
function bloque(nombre: string, desdeY: number, hastaY: number, arriba = 6) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(12, hastaY - desdeY, 12), new THREE.MeshStandardMaterial())
  m.name = nombre
  m.position.set(0, (desdeY + hastaY) / 2, arriba - 6)
  return m
}

/** Una placa de 12 ancho × 3 grosor × 100 largo, en metros, como las del lienzo. */
function plantillaDePlaca() {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.1), new THREE.MeshStandardMaterial()))
  g.scale.setScalar(1000)
  return g
}

/** Cuatro agujeros a ±15 y ±35 mm del centro: dos a cada lado de una fractura que pase cerca de él. */
const CUATRO: [number, number][] = [
  [0, -35],
  [0, -15],
  [0, 15],
  [0, 35],
]

describe('la nube de puntos del hueso', () => {
  it('cubre la superficie a menos de un paso y se calcula una vez por geometría', () => {
    const plano = new THREE.PlaneGeometry(10, 10)
    const nube = nubeDeLaGeometria(plano, 1.5)
    expect(nube.posiciones.length / 3).toBeGreaterThanOrEqual((10 / 1.5) ** 2)
    // Ningún punto del cuadrado queda a más de un paso del punto de la nube más cercano.
    for (const [x, y] of [
      [0, 0],
      [4.9, -4.9],
      [-2.3, 3.7],
    ]) {
      let minima = Infinity
      for (let i = 0; i < nube.posiciones.length; i += 3)
        minima = Math.min(minima, Math.hypot(nube.posiciones[i] - x, nube.posiciones[i + 1] - y))
      expect(minima).toBeLessThan(1.5)
    }
    expect(nubeDeLaGeometria(plano, 1.5)).toBe(nube)
  })

  it('reparte el área de cada triángulo entre sus puntos: suman lo que mide la superficie', () => {
    const nube = nubeDeLaGeometria(new THREE.PlaneGeometry(10, 4), 1.5)
    const total = nube.areas.reduce((s, a) => s + a, 0)
    expect(total).toBeCloseTo(40, 6)
  })
})

describe('la normal y el eje del hueso cerca del apoyo', () => {
  it('la normal es la de la cara que mira hacia fuera, y no la anula la cortical de enfrente', () => {
    // Una lámina de 2 mm: a menos del radio están también los puntos de la cara de abajo, que miran al revés.
    const lamina = new THREE.Mesh(new THREE.BoxGeometry(12, 100, 2), new THREE.MeshStandardMaterial())
    enEscena(lamina)
    const puntos = puntosDelHuesoCerca([lamina], new THREE.Vector3(0, 0, 1), 20, 1)
    const normal = normalMediaCerca(puntos, new THREE.Vector3(0, 0, 1), 6, new THREE.Vector3(0, 0, 1))!
    expect(normal.toArray()).toEqual([0, 0, 1])
  })

  it('el eje sale de la forma del trozo, aunque el del caso venga torcido', () => {
    // Un cilindro inclinado 10° hacia Z; el eje aproximado es Y, como el de un atlas que viene girado.
    const cilindro = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 160, 32, 40), new THREE.MeshStandardMaterial())
    cilindro.rotation.x = 10 * GRADO
    enEscena(cilindro)
    const verdadero = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), 10 * GRADO)
    const puntos = puntosDelHuesoCerca([cilindro], new THREE.Vector3(), 60, 1)
    const eje = ejeDelHuesoCerca(puntos, new THREE.Vector3(), 60, new THREE.Vector3(0, 1, 0))!
    expect(eje).not.toBeNull()
    expect(eje.angleTo(verdadero)).toBeLessThan(0.5 * GRADO)
  })

  it('sin un trozo alargado bajo el apoyo no hay eje que sacar: vale el del caso', () => {
    const bola = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshStandardMaterial())
    enEscena(bola)
    const puntos = puntosDelHuesoCerca([bola], new THREE.Vector3(), 40, 1)
    expect(ejeDelHuesoCerca(puntos, new THREE.Vector3(), 40, new THREE.Vector3(0, 1, 0))).toBeNull()
  })
})

describe('la cara de abajo en celdas', () => {
  it('cinco columnas a lo ancho, una fila cada dos milímetros, y −1 fuera de la placa', () => {
    const cara = caraRecta(12, 100, 1)
    expect(cara.columnas).toBe(5)
    expect(cara.filas).toBe(50)
    expect(celdaDe(cara, 0, 0)).toBe(25 * 5 + 2)
    expect(celdaDe(cara, -6, -50)).toBe(0)
    expect(celdaDe(cara, 6, 50)).toBe(5 * 50 - 1)
    expect(celdaDe(cara, 6.1, 0)).toBe(-1)
    expect(celdaDe(cara, 0, -50.1)).toBe(-1)
  })
})

describe('buscar el asiento', () => {
  it('sobre un cilindro, ningún punto del hueso queda por encima de la cara de abajo', () => {
    const cilindro = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 100, 24, 20), new THREE.MeshStandardMaterial())
    enEscena(cilindro)
    const apoyo = new THREE.Vector3(0, 0, 6)
    const puntos = puntosDelHuesoCerca([cilindro], apoyo, 60, 1)
    const asiento = buscarAsiento({
      puntos,
      apoyo,
      normal: new THREE.Vector3(0, 0, 1),
      eje: new THREE.Vector3(0, 1, 0),
      cara: caraRecta(12, 60, 1),
      milimetrosPorUnidad: 1,
    })!
    expect(asiento).not.toBeNull()
    const holguras = [...asiento.holguras].filter((h) => !Number.isNaN(h))
    expect(Math.min(...holguras)).toBeGreaterThanOrEqual(-1e-9)
    expect(Math.min(...holguras)).toBeLessThan(0.05)
    expect(asiento.sinHueso).toBe(0)
    expect(asiento.normal.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(2 * GRADO)
    // Una placa recta de 12 mm sobre un hueso de 12 mm toca en su franja del medio: tres columnas de cinco.
    expect(asiento.contacto).toBeGreaterThanOrEqual(0.5)
  })

  it('sobre una cara inclinada se ladea con ella aunque se parta de la normal de un triángulo torcido', () => {
    const cara = new THREE.Mesh(new THREE.BoxGeometry(16, 100, 12), new THREE.MeshStandardMaterial())
    cara.rotation.y = 12 * GRADO
    enEscena(cara)
    const deLaCara = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), 12 * GRADO)
    const golpe = new THREE.Raycaster(new THREE.Vector3(0, 0, 50), new THREE.Vector3(0, 0, -1)).intersectObject(cara)[0]
    const puntos = puntosDelHuesoCerca([cara], golpe.point, 60, 1)
    const asiento = buscarAsiento({
      puntos,
      apoyo: golpe.point,
      normal: new THREE.Vector3(0, 0, 1),
      eje: new THREE.Vector3(0, 1, 0),
      cara: caraRecta(12, 60, 1),
      milimetrosPorUnidad: 1,
    })!
    expect(asiento.normal.angleTo(deLaCara)).toBeLessThan(1.5 * GRADO)
    expect(asiento.contacto).toBeGreaterThan(0.9)
  })
})

describe('la placa sobre dos fragmentos', () => {
  function poner(escalonMm: number) {
    const proximal = bloque('Tibia_fragmento_proximal', 0, 60)
    const distal = bloque('Tibia_fragmento_distal', -60, 0, 6 + escalonMm)
    const escena = enEscena(proximal, distal)
    const placa = colocarPlaca({
      escena,
      plantilla: plantillaDePlaca(),
      nombre: 'Placa LC-DCP',
      agujerosMm: CUATRO,
      punto: new THREE.Vector3(0, 2, 6),
      normal: new THREE.Vector3(0, 0, 1),
      ejeDelHueso: new THREE.Vector3(0, 1, 0),
      milimetrosPorUnidad: 1,
      huesos: [proximal, distal],
      implantes: crearImplantes(),
    })!
    return { placa, proximal, distal }
  }
  const trozo = (a: ResumenDelAsiento, nodo: string) => a.trozos.find((t) => t.nodo === nodo)

  it('reducida, apoya en los dos y cada uno recibe dos agujeros', () => {
    const { placa } = poner(0)
    const a = placa.asiento!
    expect(trozo(a, 'Tibia_fragmento_proximal')).toMatchObject({
      agujeros: 2,
      holguraMinimaMm: 0,
    })
    expect(trozo(a, 'Tibia_fragmento_distal')).toMatchObject({
      agujeros: 2,
      holguraMinimaMm: 0,
    })
    expect(a.agujerosSinHueso).toBe(0)
    expect(a.contactoPct).toBeGreaterThanOrEqual(90)
  })

  it('sin reducir, se apoya de lleno en el fragmento que sobresale y no se mete en él', () => {
    // El distal, 3 mm por encima: antes la placa se apoyaba en el proximal y atravesaba el distal (9,5 mm en el caso
    // 3053 del «antes» de P-009).
    const { placa } = poner(3)
    const caja = new THREE.Box3().setFromObject(placa.grupo)
    expect(caja.min.z).toBeGreaterThanOrEqual(9 - 1e-6)
    // Recta, y no meciéndose sobre el escalón.
    expect(placa.normal.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1 * GRADO)
    const a = placa.asiento!
    expect(trozo(a, 'Tibia_fragmento_distal')!.holguraMinimaMm).toBe(0)
    expect(trozo(a, 'Tibia_fragmento_proximal')!.holguraMinimaMm).toBeCloseTo(3, 0)
  })
})

describe('lo que se le dice a quien opera', () => {
  const nombre = (nodo: string) => nodo.replace(/_/g, ' ')
  const resumen = (trozos: ResumenDelAsiento['trozos'], agujerosSinHueso = 0): ResumenDelAsiento => ({
    contactoPct: 80,
    sinHuesoPct: 0,
    holguraMediaMm: 0.3,
    trozos,
    agujerosSinHueso,
  })

  it('con tres agujeros o más en cada fragmento y apoyada en los dos, solo cuenta los agujeros', () => {
    const r = avisoDelAsiento(
      resumen([
        { nodo: 'proximal', agujeros: 4, holguraMinimaMm: 0 },
        { nodo: 'distal', agujeros: 4, holguraMinimaMm: 0 },
      ]),
      nombre,
      true,
    )
    expect(r.atencion).toBe(false)
    expect(r.texto).toBe('Agujeros sobre cada fragmento: proximal, 4; distal, 4.')
  })

  it('un fragmento sin reducir: a cuánto queda, y que se reduzca antes de fijarla', () => {
    const r = avisoDelAsiento(
      resumen([
        { nodo: 'proximal', agujeros: 4, holguraMinimaMm: 3.2 },
        { nodo: 'distal', agujeros: 4, holguraMinimaMm: 0 },
      ]),
      nombre,
      true,
    )
    expect(r.atencion).toBe(true)
    expect(r.texto).toContain('No apoya en proximal: queda a 3,2 mm. Reduzca la fractura antes de fijarla.')
  })

  it('con el foco abierto, lo primero es reducir: con las cifras que pasan de lo que admite una placa', () => {
    const r = avisoDelAsiento(
      resumen([
        { nodo: 'proximal', agujeros: 4, holguraMinimaMm: 0 },
        { nodo: 'distal', agujeros: 4, holguraMinimaMm: 0 },
      ]),
      nombre,
      true,
      { desplazamientoMm: 12.5, angulacionGrados: 9.8, diastasisMm: 3 },
    )
    expect(r.atencion).toBe(true)
    expect(r.texto).toBe(
      'La fractura no está reducida (desplazamiento 12,5 mm, angulación 9,8°): la placa no puede apoyar en los dos fragmentos. Redúzcala antes de fijarla. Agujeros sobre cada fragmento: proximal, 4; distal, 4.',
    )
    // Reducida dentro de los topes, no se dice nada de eso.
    const reducida = avisoDelAsiento(
      resumen([
        { nodo: 'proximal', agujeros: 4, holguraMinimaMm: 0 },
        { nodo: 'distal', agujeros: 4, holguraMinimaMm: 0 },
      ]),
      nombre,
      true,
      {
        desplazamientoMm: 1,
        angulacionGrados: 2,
        diastasisMm: 0,
      },
    )
    expect(reducida.atencion).toBe(false)
  })

  it('menos de tres agujeros en un fragmento: la placa no lo sostiene', () => {
    const r = avisoDelAsiento(
      resumen([
        { nodo: 'proximal', agujeros: 6, holguraMinimaMm: 0 },
        { nodo: 'distal', agujeros: 2, holguraMinimaMm: 0 },
      ]),
      nombre,
      true,
    )
    expect(r.atencion).toBe(true)
    expect(r.texto).toContain('distal: menos de 3 agujeros, y así la placa no lo sostiene.')
  })

  it('todos los agujeros en un fragmento: no cruza la fractura', () => {
    const r = avisoDelAsiento(resumen([{ nodo: 'proximal', agujeros: 8, holguraMinimaMm: 0 }]), nombre, true)
    expect(r.atencion).toBe(true)
    expect(r.texto).toContain('no cruza la fractura')
  })

  it('sin fractura en el caso no hay lados que contar; los agujeros sin hueso, sí', () => {
    expect(avisoDelAsiento(resumen([{ nodo: 'tibia', agujeros: 8, holguraMinimaMm: 0 }]), nombre, false)).toEqual({
      texto: '',
      atencion: false,
    })
    const r = avisoDelAsiento(resumen([{ nodo: 'tibia', agujeros: 6, holguraMinimaMm: 0 }], 2), nombre, false)
    expect(r).toEqual({
      texto: '2 agujeros se quedan sin hueso debajo: la placa se sale del borde.',
      atencion: true,
    })
  })
})
