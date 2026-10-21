import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { SIN_CONTORNO, doblar } from '@/lib/contornoDeLaPlaca'
import { comportamientoDelInstrumento } from '@/lib/comportamientoDelInstrumento'
import { aplicarElContorno, crearMesa, estadoDeLaMesa, lugarDelSitio, orificiosSMm, ponerLaMarca, sitioDeUnPunto, soltarLaMesa } from '@/components/simulador/mesaDeModelado'

/**
 * La mesa de modelado (P-005 E1) con piezas de three reales y sin WebGL: una placa de caja, 110 mm de largo, 11 de ancho y 3 de grosor, como las
 * del catálogo (largo por −Z, grosor por +Y, en metros).
 */

function placaDePrueba() {
  const geometria = new THREE.BoxGeometry(0.011, 0.003, 0.11, 2, 1, 110)
  const malla = new THREE.Mesh(geometria, new THREE.MeshBasicMaterial())
  const plantilla = new THREE.Group()
  plantilla.add(malla)
  return plantilla
}

/** Ocho orificios cada 13 mm, en el marco de Blender (ancho, largo), centrados. */
const AGUJEROS: [number, number][] = Array.from({ length: 8 }, (_, i) => [0, (i - 3.5) * 13])

function nuevaMesa() {
  const escena = new THREE.Scene()
  const mesa = crearMesa({
    escena,
    plantilla: placaDePrueba(),
    nombre: 'Placa de prueba',
    instrumentoId: 'placa-1',
    agujerosMm: AGUJEROS,
    posicion: new THREE.Vector3(0.2, 0, 0),
    haciaLaCamara: new THREE.Vector3(0, 0, 1),
    arriba: new THREE.Vector3(0, 1, 0),
    contorno: SIN_CONTORNO,
  })
  if (!mesa) throw new Error('la mesa no se creó')
  return { escena, mesa }
}

/** El punto más alejado, en el marco local del grupo, de la posición que tenía la malla sin doblar (en mm). */
function cuantoSeMovio(mesa: ReturnType<typeof nuevaMesa>['mesa']) {
  let maximo = 0
  for (const { malla, posiciones } of mesa.originales) {
    const actual = malla.geometry.attributes.position
    for (let i = 0; i < actual.count; i++) {
      const dx = actual.getX(i) - posiciones[i * 3]
      const dy = actual.getY(i) - posiciones[i * 3 + 1]
      const dz = actual.getZ(i) - posiciones[i * 3 + 2]
      maximo = Math.max(maximo, Math.hypot(dx, dy, dz) * 1000)
    }
  }
  return maximo
}

describe('crear la mesa', () => {
  it('mide la placa y la deja en la escena, de cara a la cámara y con el largo hacia arriba', () => {
    const { escena, mesa } = nuevaMesa()
    expect(mesa.mitadMm).toBeCloseTo(55, 0)
    expect(mesa.anchoMm).toBeCloseTo(11, 0)
    expect(escena.children).toContain(mesa.grupo)
    mesa.grupo.updateMatrixWorld(true)
    // El largo de la placa (−Z local) apunta hacia arriba (+Y del mundo) y la cara de arriba (+Y local) hacia la cámara (+Z del mundo).
    const largo = new THREE.Vector3(0, 0, -1).transformDirection(mesa.grupo.matrixWorld)
    const cara = new THREE.Vector3(0, 1, 0).transformDirection(mesa.grupo.matrixWorld)
    expect(largo.y).toBeCloseTo(1, 5)
    expect(cara.z).toBeCloseTo(1, 5)
    // Y el centro de la placa queda donde se pidió.
    const centro = mesa.grupo.localToWorld(mesa.centro.clone())
    expect(centro.x).toBeCloseTo(0.2, 5)
  })

  it('una placa sin forma que medir no se crea', () => {
    const vacia = crearMesa({
      escena: new THREE.Scene(),
      plantilla: new THREE.Group(),
      nombre: 'x',
      instrumentoId: null,
      agujerosMm: [],
      posicion: new THREE.Vector3(),
      haciaLaCamara: new THREE.Vector3(0, 0, 1),
      arriba: new THREE.Vector3(0, 1, 0),
      contorno: SIN_CONTORNO,
    })
    expect(vacia).toBeNull()
  })

  it('los orificios se leen a lo largo desde el centro, en mm', () => {
    const { mesa } = nuevaMesa()
    const s = orificiosSMm(mesa)
    expect(s).toHaveLength(8)
    expect(s[0]).toBeCloseTo(-45.5, 1)
    expect(s[7]).toBeCloseTo(45.5, 1)
    expect(s[3] + s[4]).toBeCloseTo(0, 1)
  })

  it('soltar la mesa la quita de la escena', () => {
    const { escena, mesa } = nuevaMesa()
    soltarLaMesa(mesa)
    expect(escena.children).not.toContain(mesa.grupo)
  })
})

describe('doblar la malla', () => {
  it('sin dobleces la malla no se mueve', () => {
    const { mesa } = nuevaMesa()
    expect(cuantoSeMovio(mesa)).toBeLessThan(1e-3)
  })

  it('con un doblez los extremos se mueven y el centro no', () => {
    const { mesa } = nuevaMesa()
    mesa.contorno = doblar(mesa.contorno, 20, { flexionGrados: 30 }).contorno
    aplicarElContorno(mesa)
    expect(cuantoSeMovio(mesa)).toBeGreaterThan(5)
    // El punto del centro de la placa sigue en su sitio.
    const atributo = mesa.originales[0].malla.geometry.attributes.position
    let cerca = Infinity
    let movidoEnElCentro = 0
    for (let i = 0; i < atributo.count; i++) {
      const original = new THREE.Vector3(mesa.originales[0].posiciones[i * 3], mesa.originales[0].posiciones[i * 3 + 1], mesa.originales[0].posiciones[i * 3 + 2])
      const d = Math.abs(original.z - mesa.centro.z)
      if (d < cerca) {
        cerca = d
        movidoEnElCentro = new THREE.Vector3().fromBufferAttribute(atributo, i).distanceTo(original) * 1000
      }
    }
    expect(movidoEnElCentro).toBeLessThan(0.5)
  })

  it('doblar y deshacer deja la malla como estaba: cada cambio parte de los vértices originales', () => {
    const { mesa } = nuevaMesa()
    mesa.contorno = doblar(mesa.contorno, 20, { flexionGrados: 30 }).contorno
    aplicarElContorno(mesa)
    mesa.contorno = doblar(mesa.contorno, 20, { flexionGrados: -30 }).contorno
    aplicarElContorno(mesa)
    expect(cuantoSeMovio(mesa)).toBeLessThan(1e-3)
  })

  it('doblar no estira la placa: el largo a lo largo del eje se conserva', () => {
    const { mesa } = nuevaMesa()
    mesa.contorno = doblar(doblar(mesa.contorno, -20, { flexionGrados: 25 }).contorno, 25, { flexionGrados: -15 }).contorno
    aplicarElContorno(mesa)
    // Los vértices de la arista de abajo de un borde, recorridos de un extremo al otro: su longitud no cambia más de unos milímetros.
    const { malla } = mesa.originales[0]
    const p = malla.geometry.attributes.position
    const v = new THREE.Vector3()
    const orden: { z: number; punto: THREE.Vector3 }[] = []
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const original = new THREE.Vector3(mesa.originales[0].posiciones[i * 3], mesa.originales[0].posiciones[i * 3 + 1], mesa.originales[0].posiciones[i * 3 + 2])
      if (Math.abs(original.x - 0.0055) < 1e-6 && Math.abs(original.y + 0.0015) < 1e-6) orden.push({ z: original.z, punto: v.clone() })
    }
    orden.sort((a, b) => a.z - b.z)
    let largo = 0
    for (let i = 1; i < orden.length; i++) largo += orden[i].punto.distanceTo(orden[i - 1].punto) * 1000
    expect(orden.length).toBeGreaterThan(50)
    expect(largo).toBeGreaterThan(108)
    expect(largo).toBeLessThan(112)
  })
})

describe('el sitio y el estado', () => {
  it('un punto sobre la placa recta cae en su sitio a lo largo', () => {
    const { mesa } = nuevaMesa()
    mesa.grupo.updateMatrixWorld(true)
    // El punto 30 mm hacia el extremo de arriba: es 30 mm más allá del centro en el largo (−Z local → +Y del mundo).
    const centro = mesa.grupo.localToWorld(mesa.centro.clone())
    const punto = centro.clone().add(new THREE.Vector3(0, 0.03, 0))
    expect(sitioDeUnPunto(mesa, punto)).toBeCloseTo(30, 0)
  })

  it('dice si el sitio cae sobre un orificio o entre dos', () => {
    const { mesa } = nuevaMesa()
    // Orificios en −45,5; −32,5; −19,5; −6,5; 6,5; 19,5; 32,5; 45,5
    expect(lugarDelSitio(mesa, 0)).toBe('entre los orificios 4 y 5')
    expect(lugarDelSitio(mesa, 19.5)).toMatch(/sobre el orificio 6.*deforma/)
    expect(lugarDelSitio(mesa, -54)).toBe('antes del primer orificio')
    expect(lugarDelSitio(mesa, 54)).toBe('después del último orificio')
    expect(lugarDelSitio(mesa, null)).toBeNull()
  })

  it('el estado cuenta dobleces, orificios deformados y fatiga, y la raya sigue al sitio', () => {
    const { mesa } = nuevaMesa()
    ponerLaMarca(mesa, 19.5)
    expect(mesa.marca).not.toBeNull()
    mesa.contorno = doblar(mesa.contorno, 19.5, { flexionGrados: 10 }).contorno
    mesa.contorno = doblar(mesa.contorno, 19.5, { flexionGrados: -4 }).contorno
    mesa.contorno = doblar(mesa.contorno, 19.5, { flexionGrados: 6 }).contorno
    aplicarElContorno(mesa)
    const e = estadoDeLaMesa(mesa)
    expect(e.nombre).toBe('Placa de prueba')
    expect(e.dobleces).toBe(1)
    expect(e.orificiosDeformados).toEqual([6])
    expect(e.fatigados).toHaveLength(1)
    expect(e.conManiobras).toBe(true)
    expect(e.sitioMm).toBe(19.5)
    ponerLaMarca(mesa, null)
    expect(mesa.marca).toBeNull()
  })
})

describe('las herramientas de modelado', () => {
  it('el alicate dobla, la grifa tuerce y la plantilla copia el contorno', () => {
    expect(comportamientoDelInstrumento({ slug: 'alicate-doblado', nombre: 'Alicate de doblado de tres puntos' }).modela).toBe('flexion')
    expect(comportamientoDelInstrumento({ slug: 'grifas-torsion', nombre: 'Grifa de torsión (bending iron)' }).modela).toBe('torsion')
    expect(comportamientoDelInstrumento({ slug: 'plantilla-aluminio', nombre: 'Plantilla maleable de aluminio' }).modela).toBe('plantilla')
    // Y lo creado a mano se reconoce por el nombre.
    expect(comportamientoDelInstrumento({ nombre: 'Alicate doblador de placas' }).modela).toBe('flexion')
    expect(comportamientoDelInstrumento({ slug: 'bisturi-piel-n22', nombre: 'Bisturí de piel' }).modela).toBeNull()
  })
})

describe('el cableado', () => {
  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')
  const consola = leer('src/components/simulador/ConsolaQuirurgica.tsx')
  const lienzo = leer('src/components/simulador/LienzoQuirurgico.tsx')
  const implantes = leer('src/components/simulador/implantesEnLaEscena.ts')

  it('coger una herramienta de modelado pone el modo Modelar, y la rueda dobla o tuerce con la placa en la mesa', () => {
    expect(consola).toContain("else if (que?.modela) setModo('modelar')")
    expect(consola).toContain("queHace.modela === 'flexion'")
    expect(consola).toContain("'dobla'")
    expect(consola).toContain('m.doblarLaPlaca(')
  })

  it('un clic apunta, arrastrar mueve; la placa de la mesa se apoya con su forma y la mesa se vacía', () => {
    expect(lienzo).toContain('sitioDeUnPunto(mesa, gesto.punto)')
    expect(lienzo).toContain("t.mesa.instrumentoId === inst.id ? t.mesa.contorno : undefined")
    expect(implantes).toContain('placa.contorno ? placa.contorno.mapa(recto) : recto')
  })

  it('la placa de la mesa no sale en la fluoroscopia', () => {
    expect(lienzo).toContain('mesa.grupo.userData.deInterfaz = true')
  })
})
