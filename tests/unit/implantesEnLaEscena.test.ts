import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  agujeroBajoElPunto,
  colocarPlaca,
  colocarTornillo,
  crearImplantes,
  medirBajoElAgujero,
  posicionDelAgujero,
  quitarImplantes,
  quitarTornillos,
} from '@/components/simulador/implantesEnLaEscena'

/**
 * La placa y los tornillos sobre el hueso (D-169), con un «hueso» y una «placa» de
 * cartón: un cilindro de 12 mm de diámetro a lo largo de Y y una lámina de
 * 12 × 3 × 100 mm con agujeros a 20 mm del centro. Las unidades de la escena son
 * milímetros (milimetrosPorUnidad = 1), y los modelos vienen en metros, así que a
 * las plantillas se les da la escala 1000 como hace el lienzo.
 */

function escenaConHueso() {
  const escena = new THREE.Scene()
  const hueso = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 100, 24, 1, false), new THREE.MeshStandardMaterial())
  hueso.name = 'Tibia'
  escena.add(hueso)
  escena.updateMatrixWorld(true)
  return { escena, hueso }
}

/** Una placa de 12 ancho × 3 grosor × 100 largo: el ancho en X, el grosor en Y y el largo en Z, en metros. */
function plantillaDePlaca() {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.1), new THREE.MeshStandardMaterial()))
  g.scale.setScalar(1000)
  return g
}

/** Un tornillo de 24 mm con la punta en el origen y la cabeza a +Y, en metros. */
function plantillaDeTornillo() {
  const g = new THREE.Group()
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.00175, 0.00175, 0.024, 8), new THREE.MeshStandardMaterial())
  cuerpo.position.y = 0.012
  g.add(cuerpo)
  g.scale.setScalar(1000)
  return g
}

const AGUJEROS: [number, number][] = [
  [0, -20],
  [0, 0],
  [0, 20],
]

const EJE_Y = () => new THREE.Vector3(0, 1, 0)
const NORMAL_Z = () => new THREE.Vector3(0, 0, 1)

function colocar() {
  const { escena, hueso } = escenaConHueso()
  const implantes = crearImplantes()
  const placa = colocarPlaca({
    escena,
    plantilla: plantillaDePlaca(),
    nombre: 'Placa de cartón',
    agujerosMm: AGUJEROS,
    // Se apoya en la cara +Z del cilindro, con la normal hacia fuera.
    punto: new THREE.Vector3(0, 0, 6),
    normal: NORMAL_Z(),
    ejeDelHueso: EJE_Y(),
    milimetrosPorUnidad: 1,
    huesos: [hueso],
    implantes,
  })!
  return { escena, hueso, implantes, placa }
}

const ponerTornillo = (
  c: ReturnType<typeof colocar>,
  agujero: number,
  largoMm: number,
) =>
  colocarTornillo({
    escena: c.escena,
    plantilla: plantillaDeTornillo(),
    placa: c.placa,
    agujero,
    largoMm,
    diametroMm: 3.5,
    largoDelModeloMm: 24,
    bloqueado: false,
    huesos: [c.hueso],
    implantes: c.implantes,
  })

describe('colocar una placa', () => {
  it('se apoya sobre el hueso con su cara de arriba hacia la normal y su largo siguiendo el hueso', () => {
    const { placa } = colocar()
    expect(placa).not.toBeNull()
    expect(placa.grosorMm).toBeCloseTo(3, 4)
    expect(placa.normal.toArray()).toEqual([0, 0, 1])
    // Los tres agujeros quedan en una línea paralela al eje del hueso, separados 20 mm.
    const centros = AGUJEROS.map((_, i) => posicionDelAgujero(placa, i, 'abajo'))
    expect(centros[0].x).toBeCloseTo(0, 3)
    expect(Math.abs(centros[2].y - centros[0].y)).toBeCloseTo(40, 3)
    expect(centros[1].x).toBeCloseTo(centros[0].x, 3)
    // Su cara de abajo toca el hueso, a unas décimas de milímetro.
    expect(centros[1].z).toBeCloseTo(6.2, 1)
    expect(placa.separadaDelHuesoMm).toBeLessThan(0.5)
  })

  it('la cara de arriba de un agujero está un grosor más arriba que la de abajo', () => {
    const { placa } = colocar()
    const abajo = posicionDelAgujero(placa, 1, 'abajo')
    const arriba = posicionDelAgujero(placa, 1, 'arriba')
    expect(arriba.clone().sub(abajo).length()).toBeCloseTo(3, 3)
    expect(arriba.z).toBeGreaterThan(abajo.z)
  })

  it('una plantilla sin agujeros no se coloca: no habría dónde atornillar', () => {
    const { escena, hueso } = escenaConHueso()
    const placa = colocarPlaca({
      escena,
      plantilla: plantillaDePlaca(),
      nombre: 'Sin agujeros',
      agujerosMm: [],
      punto: new THREE.Vector3(0, 0, 6),
      normal: NORMAL_Z(),
      ejeDelHueso: EJE_Y(),
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes: crearImplantes(),
    })
    expect(placa).toBeNull()
  })

  it('una segunda placa sustituye a la primera, con sus tornillos', () => {
    const c = colocar()
    ponerTornillo(c, 1, 18)
    expect(c.implantes.tornillos.size).toBe(1)
    colocarPlaca({
      escena: c.escena,
      plantilla: plantillaDePlaca(),
      nombre: 'Otra',
      agujerosMm: AGUJEROS,
      punto: new THREE.Vector3(0, 0, 6),
      normal: NORMAL_Z(),
      ejeDelHueso: EJE_Y(),
      milimetrosPorUnidad: 1,
      huesos: [c.hueso],
      implantes: c.implantes,
    })
    expect(c.implantes.placa?.nombre).toBe('Otra')
    expect(c.implantes.tornillos.size).toBe(0)
  })
})

describe('medir y atornillar', () => {
  it('bajo un agujero hay 12 mm de hueso, de cortical a cortical', () => {
    const { placa, hueso } = colocar()
    const medida = medirBajoElAgujero(placa, 1, [hueso])!
    expect(medida.espesorMm).toBeCloseTo(12, 1)
    expect(medida.distanciaAlHuesoMm).toBeLessThan(0.5)
  })

  it('un agujero que no cae sobre el hueso no mide nada', () => {
    const { escena, hueso } = escenaConHueso()
    const placa = colocarPlaca({
      escena,
      plantilla: plantillaDePlaca(),
      nombre: 'x',
      agujerosMm: [[0, 70]],
      punto: new THREE.Vector3(0, 0, 6),
      normal: NORMAL_Z(),
      ejeDelHueso: EJE_Y(),
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes: crearImplantes(),
    })!
    expect(medirBajoElAgujero(placa, 0, [hueso])).toBeNull()
  })

  it('un tornillo del largo medido más dos es bicortical, y uno corto no', () => {
    const c = colocar()
    const bien = ponerTornillo(c, 1, 3 + 12 + 2)!
    expect(bien.bicortical).toBe(true)
    expect(bien.puntaFueraMm).toBeCloseTo(2, 0)
    const corto = ponerTornillo(c, 0, 10)!
    expect(corto.bicortical).toBe(false)
    expect(corto.aviso).toMatch(/una cortical/)
    expect(c.implantes.tornillos.size).toBe(2)
  })

  it('el tornillo queda dentro del hueso: su cabeza en la placa y su punta del otro lado', () => {
    const c = colocar()
    ponerTornillo(c, 1, 17)
    const caja = new THREE.Box3().setFromObject(c.implantes.tornillos.get(1)!.grupo)
    // 17 mm de tornillo bajo la cara de arriba de la placa (z ≈ 9,2): la punta llega a z ≈ −7,8.
    expect(caja.min.z).toBeCloseTo(9.2 - 17, 0)
    expect(caja.max.z).toBeCloseTo(9.2, 0)
  })

  it('un tornillo en el mismo agujero cambia al anterior', () => {
    const c = colocar()
    ponerTornillo(c, 1, 10)
    const hijos = c.escena.children.length
    ponerTornillo(c, 1, 18)
    expect(c.implantes.tornillos.size).toBe(1)
    expect(c.escena.children.length).toBe(hijos)
    expect(c.implantes.tornillos.get(1)!.datos.largoMm).toBe(18)
  })

  it('el agujero bajo un punto de la placa se reconoce a menos de 7 mm', () => {
    const { placa } = colocar()
    const tercero = posicionDelAgujero(placa, 2, 'arriba')
    expect(agujeroBajoElPunto(placa, tercero.clone().add(new THREE.Vector3(2, 1, 0)), 7)).toBe(2)
    expect(agujeroBajoElPunto(placa, new THREE.Vector3(0, 60, 9), 3)).toBeNull()
  })

  it('quitar los tornillos deja la placa; quitar los implantes la quita también', () => {
    const c = colocar()
    ponerTornillo(c, 1, 17)
    quitarTornillos(c.implantes)
    expect(c.implantes.tornillos.size).toBe(0)
    expect(c.implantes.placa).toBeDefined()
    quitarImplantes(c.implantes)
    expect(c.implantes.placa).toBeUndefined()
    // Solo queda el hueso en la escena.
    expect(c.escena.children).toHaveLength(1)
  })
})
