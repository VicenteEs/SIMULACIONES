import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  agujeroBajoElPunto,
  ajustarPlaca,
  colocarPlaca,
  colocarTornillo,
  crearImplantes,
  medirAlLoLargoDeUnaLinea,
  medirBajoElAgujero,
  posicionDelAgujero,
  quitarImplantes,
  reanclarPlaca,
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
    // La normal ya no es la que se pasa, sino la media de la superficie del hueso alrededor (P-009). En este cilindro de
    // 24 caras, con triángulos de diez centímetros de largo, la nube que la promedia no es simétrica y sale un grado de lado: se
    // pide que esté a menos de dos, y los agujeros, en el eje a menos de una décima de milímetro.
    expect(placa.normal.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan((2 * Math.PI) / 180)
    // Los tres agujeros quedan en una línea paralela al eje del hueso, separados 20 mm.
    const centros = AGUJEROS.map((_, i) => posicionDelAgujero(placa, i, 'abajo'))
    expect(centros[0].x).toBeCloseTo(0, 1)
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

describe('ajustar la placa ya puesta (P-003 E6)', () => {
  it('subirla y bajarla a lo largo del hueso la mueve por el eje y la deja apoyada', () => {
    const c = colocar()
    const antes = posicionDelAgujero(c.placa, 1, 'abajo')
    expect(ajustarPlaca(c.placa, [c.hueso], { largoMm: 10, ladoMm: 0, giroGrados: 0 })).toBe(true)
    const despues = posicionDelAgujero(c.placa, 1, 'abajo')
    expect(despues.y - antes.y).toBeCloseTo(10, 1)
    // Sigue sobre el cilindro: la cara de abajo a ras del hueso, sin entrar.
    expect(despues.z).toBeGreaterThanOrEqual(6 - 1e-6)
    expect(c.placa.separadaDelHuesoMm).toBeLessThan(1)
    expect(c.placa.ajuste.largoMm).toBe(10)
  })

  it('rodear el hueso de lado a lado la lleva por la superficie: se inclina y sigue tocando', () => {
    const c = colocar()
    expect(ajustarPlaca(c.placa, [c.hueso], { largoMm: 0, ladoMm: 5, giroGrados: 0 })).toBe(true)
    // La normal de la placa gira con la superficie del cilindro: ya no es +Z.
    expect(Math.abs(c.placa.normal.x)).toBeGreaterThan(0.1)
    const centro = posicionDelAgujero(c.placa, 1, 'abajo')
    // Está sobre el cilindro de radio 6 (el eje es Y): x² + z² ≈ 36 con una holgura de décimas.
    expect(Math.hypot(centro.x, centro.z)).toBeGreaterThanOrEqual(6 - 1e-3)
    expect(Math.hypot(centro.x, centro.z)).toBeLessThan(6.8)
  })

  it('angularla gira el largo de la placa alrededor de la normal', () => {
    const c = colocar()
    expect(ajustarPlaca(c.placa, [c.hueso], { largoMm: 0, ladoMm: 0, giroGrados: 20 })).toBe(true)
    const a = posicionDelAgujero(c.placa, 0, 'abajo')
    const b = posicionDelAgujero(c.placa, 2, 'abajo')
    // Los agujeros eran una línea paralela al hueso (Y); con 20° la línea se aparta de Y.
    const largo = b.clone().sub(a)
    const angulo = (Math.atan2(Math.hypot(largo.x, largo.z), Math.abs(largo.y)) * 180) / Math.PI
    expect(angulo).toBeGreaterThan(10)
    expect(c.placa.ajuste.giroGrados).toBe(20)
  })

  it('arrastrada a la otra cara del hueso, se vuelve a apoyar ahí y conserva su giro (P-008 E4)', () => {
    const c = colocar()
    // La cara −X del cilindro: con el ajuste de siempre no se llegaba (el lado tiene tope y se asienta mirando por +Z).
    expect(reanclarPlaca(c.placa, [c.hueso], new THREE.Vector3(-6, 10, 0), new THREE.Vector3(-1, 0, 0), 30)).toBe(true)
    expect(c.placa.normal.x).toBeLessThan(-0.9)
    const centro = posicionDelAgujero(c.placa, 1, 'abajo')
    expect(centro.x).toBeLessThan(-5.9)
    expect(centro.y).toBeCloseTo(10, 0)
    expect(c.placa.ajuste).toEqual({ largoMm: 0, ladoMm: 0, giroGrados: 30 })
    // Y desde ahí, el ajuste de siempre corre desde el sitio nuevo.
    expect(ajustarPlaca(c.placa, [c.hueso], { largoMm: 5, ladoMm: 0, giroGrados: 30 })).toBe(true)
    expect(posicionDelAgujero(c.placa, 1, 'abajo').y).toBeCloseTo(15, 0)
  })

  it('si donde se la lleva no hay hueso, se queda donde estaba', () => {
    const c = colocar()
    const antes = posicionDelAgujero(c.placa, 1, 'abajo')
    const anclaje = c.placa.anclaje
    expect(reanclarPlaca(c.placa, [c.hueso], new THREE.Vector3(0, 200, 6), NORMAL_Z())).toBe(false)
    expect(posicionDelAgujero(c.placa, 1, 'abajo').distanceTo(antes)).toBeLessThan(1e-9)
    expect(c.placa.anclaje).toBe(anclaje)
  })

  it('en el extremo del hueso, con la normal a lo largo de él, no se tiende: dice que no en vez de romperse', () => {
    const c = colocar()
    // La tapa de arriba del cilindro (y = 50), normal +Y: no hay largo del hueso sobre el que tender la placa.
    expect(reanclarPlaca(c.placa, [c.hueso], new THREE.Vector3(0, 50, 0), EJE_Y())).toBe(false)
    expect(Number.isFinite(c.placa.grupo.position.x)).toBe(true)
    expect(Number.isFinite(c.placa.grupo.quaternion.w)).toBe(true)
  })

  it('nunca queda dentro del hueso, ni con el ajuste más raro', () => {
    const c = colocar()
    for (const largoMm of [-30, 0, 30]) {
      for (const ladoMm of [-8, 0, 8]) {
        for (const giroGrados of [-30, 0, 45]) {
          if (!ajustarPlaca(c.placa, [c.hueso], { largoMm, ladoMm, giroGrados })) continue
          for (let i = 0; i < AGUJEROS.length; i++) {
            const abajo = posicionDelAgujero(c.placa, i, 'abajo')
            // Ningún agujero de la cara de abajo cae a menos de 6 del eje (dentro del cilindro) salvo el redondeo.
            expect(Math.hypot(abajo.x, abajo.z)).toBeGreaterThanOrEqual(6 - 0.3)
          }
        }
      }
    }
  })

  it('sin hueso bajo el punto pedido no mueve nada y lo dice', () => {
    const c = colocar()
    const antes = c.placa.grupo.position.clone()
    expect(ajustarPlaca(c.placa, [c.hueso], { largoMm: 500, ladoMm: 0, giroGrados: 0 })).toBe(false)
    expect(c.placa.grupo.position.distanceTo(antes)).toBe(0)
    expect(c.placa.ajuste.largoMm).toBe(0)
  })

  it('la placa recién puesta nace sin fijar y sin nada anotado en sus agujeros', () => {
    const c = colocar()
    expect(c.placa.fijada).toBe(false)
    expect(c.placa.agujeros.size).toBe(0)
  })
})

/**
 * La cortical opuesta con otro hueso detrás (P-009). Una «tibia» de 12 mm de grueso en Z y, detrás, otra pieza: un «peroné»
 * a 10 mm o el fragmento distal de una fractura. La línea baja por −Z desde 0,2 mm por fuera de la tibia, fuera de las
 * diagonales de las caras para que el rayo no caiga justo en una arista. Con materiales de una cara y de dos: los modelos
 * del atlas son de dos, y las pruebas de arriba, de una.
 */
describe('medirAlLoLargoDeUnaLinea con otra pieza de hueso detrás', () => {
  const pieza = (alto: number, z: number, lados: THREE.Side) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(12, 100, alto), new THREE.MeshBasicMaterial({ side: lados }))
    m.position.z = z
    m.updateMatrixWorld(true)
    return m
  }
  const medir = (huesos: THREE.Object3D[]) =>
    medirAlLoLargoDeUnaLinea(new THREE.Vector3(0.37, 0.21, 6.2), new THREE.Vector3(0, 0, -1), 1, huesos)

  for (const [nombre, lados] of [
    ['de una cara', THREE.FrontSide],
    ['de dos caras', THREE.DoubleSide],
  ] as const) {
    it(`${nombre}: el peroné a 10 mm no cuenta, y el grosor es el de la tibia`, () => {
      // La tibia va de z = 6 a −6; el peroné, de −16 a −24. Antes salían 30 mm: hasta la cara de fuera del peroné.
      const m = medir([pieza(12, 0, lados), pieza(8, -20, lados)])
      expect(m?.distanciaAlHuesoMm).toBeCloseTo(0.2, 3)
      expect(m?.espesorMm).toBeCloseTo(12, 3)
    })

    it(`${nombre}: el fragmento de una fractura reducida sí cuenta, y el de una sin reducir no`, () => {
      // El fragmento de abajo, de 11 mm, a 1 mm de la tibia: se cruza el trazo y el grosor llega a z = −18.
      expect(medir([pieza(12, 0, lados), pieza(11, -12.5, lados)])?.espesorMm).toBeCloseTo(24, 3)
      // El mismo fragmento a 8 mm: el trazo sin reducir es parte blanda, y el grosor se queda en la tibia.
      expect(medir([pieza(12, 0, lados), pieza(11, -19.5, lados)])?.espesorMm).toBeCloseTo(12, 3)
    })
  }
})
