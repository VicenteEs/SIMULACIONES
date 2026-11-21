import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  alturaDeLaCara,
  buscarAsiento,
  caraDeLasMallas,
  caraRecta,
  celdaDe,
  ejeDelHuesoCerca,
  normalMediaCerca,
  nubeDeLaGeometria,
  puntosDelHuesoCerca,
} from '@/components/simulador/asientoDeLaPlaca'
import { colocarPlaca, crearImplantes, posicionDelAgujero } from '@/components/simulador/implantesEnLaEscena'
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

  it('dice el trozo de cada agujero, que es con lo que se cuentan los tornillos por fragmento (D-309)', () => {
    const a = poner(0).placa.asiento!
    expect(a.trozoDeCadaAgujero).toHaveLength(4)
    const cuantos = (nodo: string) => a.trozoDeCadaAgujero!.filter((n) => n === nodo).length
    expect(cuantos('Tibia_fragmento_proximal')).toBe(trozo(a, 'Tibia_fragmento_proximal')!.agujeros)
    expect(cuantos('Tibia_fragmento_distal')).toBe(trozo(a, 'Tibia_fragmento_distal')!.agujeros)
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

describe('la cara de verdad (D-427)', () => {
  /** Unas cajas de metal en milímetros, sin escala, como un modelo ya pasado al mundo: cada una con su tamaño y su centro. */
  function cajas(...piezas: { tam: [number, number, number]; centro: [number, number, number] }[]) {
    const g = new THREE.Group()
    for (const p of piezas) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...p.tam), new THREE.MeshStandardMaterial())
      m.position.set(...p.centro)
      g.add(m)
    }
    g.updateMatrixWorld(true)
    return g
  }

  /** La huella de un grupo y el centro de la cara de abajo de su caja, como los arma `colocarPlaca`. */
  function huella(g: THREE.Object3D) {
    const caja = new THREE.Box3().setFromObject(g)
    const tam = caja.getSize(new THREE.Vector3())
    const centro = caja.getCenter(new THREE.Vector3())
    return { origen: new THREE.Vector3(centro.x, caja.min.y, centro.z), cara: caraRecta(tam.x, tam.z, 1) }
  }

  it('en una T no hay metal a los lados del cuerpo, y sí en toda la cabeza', () => {
    // El cuerpo, de 10 × 60; la cabeza, de 30 × 10 en un extremo; las dos de 3 mm. La caja va de z = −40 a 30, así que su
    // centro, del que se mide la cara, está en z = −5.
    const t = cajas({ tam: [10, 3, 60], centro: [0, 1.5, 0] }, { tam: [30, 3, 10], centro: [0, 1.5, -35] })
    const { origen, cara } = huella(t)
    const deVerdad = caraDeLasMallas(t, origen, 1, cara, 1)!
    expect(deVerdad).not.toBeNull()
    // Una muestra cada medio milímetro: 60 a lo ancho y 140 a lo largo.
    expect(deVerdad.muestras!.columnas).toBe(60)
    expect(deVerdad.muestras!.filas).toBe(140)
    // En el cuerpo y en la cabeza, el metal está en el fondo de la caja; al lado del cuerpo no hay.
    expect(alturaDeLaCara(deVerdad, 0, 5)).toBeCloseTo(0, 6)
    expect(alturaDeLaCara(deVerdad, 12, 5)).toBe(Infinity)
    expect(alturaDeLaCara(deVerdad, 12, -30)).toBeCloseTo(0, 6)
    // Y lo mismo por celdas, que son las que cuentan lo que toca.
    expect(deVerdad.alturas[celdaDe(deVerdad, 12, 5)]).toBe(Infinity)
    expect(deVerdad.alturas[celdaDe(deVerdad, 0, 5)]).toBeCloseTo(0, 6)
    expect(deVerdad.alturas[celdaDe(deVerdad, 12, -30)]).toBeCloseTo(0, 6)
  })

  it('cierra los agujeros con el metal de cada lado y sigue su pendiente', () => {
    // Una lámina de 12 × 40 y 3 mm con un agujero de 6 mm en el medio, cizallada para que su cara de abajo suba 10° a lo
    // ancho y el agujero siga vertical: como uno de la cabeza curva de la anatómica de tibia.
    const forma = new THREE.Shape()
    forma.moveTo(-6, -20)
    forma.lineTo(6, -20)
    forma.lineTo(6, 20)
    forma.lineTo(-6, 20)
    forma.closePath()
    const agujero = new THREE.Path()
    agujero.absarc(0, 0, 3, 0, Math.PI * 2, true)
    forma.holes.push(agujero)
    const geometria = new THREE.ExtrudeGeometry(forma, { depth: 3, bevelEnabled: false, curveSegments: 32 })
    // La extrusión va por +Z: girada −90° alrededor de X, el grosor queda en +Y, como el de las placas.
    geometria.rotateX(-Math.PI / 2)
    const pendiente = Math.tan(10 * GRADO)
    const p = geometria.getAttribute('position')
    for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + p.getX(k) * pendiente)
    const g = new THREE.Group()
    g.add(new THREE.Mesh(geometria, new THREE.MeshStandardMaterial()))
    g.updateMatrixWorld(true)
    const { origen, cara } = huella(g)
    const deVerdad = caraDeLasMallas(g, origen, 1, cara, 1)!
    // Dentro del agujero no hay metal, y se rellena con la recta entre sus bordes: el plano de la cara de abajo.
    const enElPlano = (x: number) => x * pendiente - origen.y
    for (const x of [-2, 0, 2]) expect(alturaDeLaCara(deVerdad, x - origen.x, 0 - origen.z)).toBeCloseTo(enElPlano(x), 3)
    // Una celda de 2,4 × 2 mm que cae entera en el agujero tiene metal, y no infinito: el de su muestra más baja, la que
    // está a 0,75 mm del medio (las muestras van cada medio milímetro desde el canto, en ±0,25, ±0,75…).
    const c = celdaDe(deVerdad, 0 - origen.x, 1 - origen.z)
    expect(deVerdad.alturas[c]).toBeCloseTo(enElPlano(-0.75), 3)
  })

  it('una cabeza curva sobre un hueso de su misma curva apoya entera, y con la caja quedaba 6 mm en el aire', () => {
    // Una cabeza de 44 mm que baja x²/76 hacia los lados, como la de la anatómica de tibia, sobre un cilindro de radio 38
    // a lo largo de la placa. En metros, como el lienzo, con la cara de abajo del medio en y = 0.
    const geometria = new THREE.BoxGeometry(0.044, 0.0045, 0.03, 88, 1, 6)
    const p = geometria.getAttribute('position')
    for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + 0.00225 - (p.getX(k) * p.getX(k)) / (2 * 0.038))
    const poner = (conAlturas: boolean) => {
      const plantilla = new THREE.Group()
      plantilla.add(new THREE.Mesh(geometria.clone(), new THREE.MeshStandardMaterial()))
      plantilla.scale.setScalar(1000)
      const hueso = new THREE.Mesh(new THREE.CylinderGeometry(38, 38, 120, 360, 1), new THREE.MeshStandardMaterial())
      const escena = enEscena(hueso)
      return colocarPlaca({
        escena,
        plantilla,
        nombre: 'Cabeza curva',
        agujerosMm: [[0, 0]],
        punto: new THREE.Vector3(0, 0, 38),
        normal: new THREE.Vector3(0, 0, 1),
        ejeDelHueso: new THREE.Vector3(0, 1, 0),
        milimetrosPorUnidad: 1,
        huesos: [hueso],
        implantes: crearImplantes(),
        meta: conAlturas ? { grosor: 4.5, alturas: [[0, 4.5]], formas: [], largoDelOval: undefined } : null,
      })!
    }
    // Lo que queda la cara de abajo del medio por encima del hueso, en la malla y no en la caja.
    const sobreElHueso = (placa: ReturnType<typeof poner>) => placa.grupo.localToWorld(new THREE.Vector3(0, 0, 0)).z - 38
    const deVerdad = poner(true)
    expect(deVerdad.cara!.muestras).toBeDefined()
    expect(sobreElHueso(deVerdad)).toBeGreaterThan(0.15)
    expect(sobreElHueso(deVerdad)).toBeLessThan(0.3)
    expect(deVerdad.asiento!.contactoPct).toBeGreaterThanOrEqual(90)
    // A 11 mm del medio, donde van los agujeros de fuera de la de tibia, también toca: la curva baja 1,6 mm ahí.
    const fuera = deVerdad.grupo.localToWorld(new THREE.Vector3(0.011, -(0.011 * 0.011) / 0.076, 0)).z
    expect(fuera - Math.sqrt(38 * 38 - 11 * 11)).toBeLessThan(0.3)
    // Con la caja, el fondo es el borde de la cabeza, 6,4 mm por debajo del medio, y la placa se apoyaba en él.
    const conLaCaja = poner(false)
    expect(conLaCaja.cara!.muestras).toBeUndefined()
    expect(sobreElHueso(conLaCaja)).toBeGreaterThan(6)
  })

  it('un trozo junto al cuerpo de una T, bajo el ancho de su cabeza, no la levanta ni se cuenta como suyo', () => {
    // La T en metros: el cuerpo de 10 × 60, la cabeza de 30 × 10 hacia −Z (+Y de Blender, a 35 mm) y 3 mm de chapa.
    const plantillaDeT = () => {
      const g = new THREE.Group()
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.003, 0.06), new THREE.MeshStandardMaterial())
      const cabeza = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.01), new THREE.MeshStandardMaterial())
      cuerpo.position.y = 0.0015
      cabeza.position.set(0, 0.0015, -0.035)
      g.add(cuerpo, cabeza)
      g.scale.setScalar(1000)
      return g
    }
    const agujeros: [number, number][] = [
      [0, -20],
      [0, 0],
      [0, 20],
      [-10, 35],
      [0, 35],
      [10, 35],
    ]
    const poner = (conAlturas: boolean) => {
      // La diáfisis, de 12 mm, con su cara de arriba en z = 6; al lado del cuerpo, otro trozo 3 mm más alto, que termina
      // antes de la cabeza: la caja de la T lo cubre y la T no. La caja va de y = −35 a 35 desde el punto de apoyo.
      const diafisis = bloque('Diafisis', -80, 80)
      const lado = new THREE.Mesh(new THREE.BoxGeometry(5, 40, 12), new THREE.MeshStandardMaterial())
      lado.name = 'Lado'
      lado.position.set(11.5, -10, 3)
      const escena = enEscena(diafisis, lado)
      return colocarPlaca({
        escena,
        plantilla: plantillaDeT(),
        nombre: 'Placa en T de cartón',
        agujerosMm: agujeros,
        punto: new THREE.Vector3(0, 0, 6),
        normal: new THREE.Vector3(0, 0, 1),
        ejeDelHueso: new THREE.Vector3(0, 1, 0),
        milimetrosPorUnidad: 1,
        huesos: [diafisis, lado],
        implantes: crearImplantes(),
        meta: conAlturas
          ? { grosor: 3, alturas: agujeros.map((): [number, number] => [0, 3]), formas: [], largoDelOval: undefined }
          : null,
      })!
    }
    const placa = poner(true)
    // El cuerpo, sobre la diáfisis a las dos décimas de siempre, y derecho.
    expect(posicionDelAgujero(placa, 1, 'abajo').z).toBeCloseTo(6.2, 1)
    expect(placa.normal.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1 * GRADO)
    expect(placa.asiento!.trozos.map((t) => t.nodo)).toEqual(['Diafisis'])
    // Con la caja, la esquina sin metal se apoyaba en el trozo de al lado: la placa se ladeaba para tocar los dos y el cuerpo
    // quedaba a más de un milímetro de la diáfisis.
    const conLaCaja = poner(false)
    expect(posicionDelAgujero(conLaCaja, 1, 'abajo').z - 6).toBeGreaterThan(1)
    expect(conLaCaja.asiento!.trozos.map((t) => t.nodo)).toContain('Lado')
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
