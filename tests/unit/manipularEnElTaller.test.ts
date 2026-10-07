import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { crearCajaOrientada, crearGizmo, escalaDelGizmo, type AsaDelGizmo } from '@/atlas/gizmo'
import { focoDeLaTapa } from '@/atlas/manipular'
import {
  desplazamientoDelArrastre,
  desplazamientoTecleado,
  giroDelArrastre,
  giroTecleado,
  type EjesDeTrabajo,
} from '@/atlas/transformar'
import { partirMalla, type MallaIndexada } from '@/lib/osteotomia'

/**
 * Manipular piezas y fragmentos, en lo que no es una cuenta suelta (D-160, E3):
 * el manipulador, el foco que deja un corte de verdad, los ejes de un hueso en
 * las cuentas de siempre, y cómo está cableado en el visor y en el taller.
 */

const leer = (...partes: string[]) =>
  readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')

describe('el manipulador', () => {
  it('tiene siete asas: tres flechas, tres aros y el aro de la vista', () => {
    const gizmo = crearGizmo()
    const asas = gizmo.asas.map((a) => a.userData.asa as AsaDelGizmo)
    expect(asas).toHaveLength(7)
    for (const eje of ['x', 'y', 'z'] as const) {
      expect(asas).toContainEqual({ modo: 'mover', eje })
      expect(asas).toContainEqual({ modo: 'girar', eje })
    }
    expect(asas).toContainEqual({ modo: 'girar', eje: 'vista' })
    gizmo.liberar()
  })

  it('las asas no se pintan, pero sí se cruzan con el rayo', () => {
    const gizmo = crearGizmo()
    for (const asa of gizmo.asas) expect((asa.material as THREE.Material).visible).toBe(false)
    gizmo.grupo.visible = true
    gizmo.grupo.updateMatrixWorld(true)
    // Un rayo que atraviesa la punta de la flecha de X (en 0,9 sobre el eje).
    const rayo = new THREE.Raycaster(new THREE.Vector3(0.6, 0, 5), new THREE.Vector3(0, 0, -1))
    const toques = rayo.intersectObjects(gizmo.asas, false).map((t) => t.object.userData.asa as AsaDelGizmo)
    expect(toques.some((a) => a.modo === 'mover' && a.eje === 'x')).toBe(true)
    gizmo.liberar()
  })

  it('empieza oculto, y orientarlo con un marco gira el grupo entero', () => {
    const gizmo = crearGizmo()
    expect(gizmo.grupo.visible).toBe(false)
    const marco = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    gizmo.orientar(marco)
    expect(gizmo.grupo.quaternion.angleTo(marco)).toBeLessThan(1e-9)
    // Con `null` vuelve a los ejes del mundo.
    gizmo.orientar(null)
    expect(gizmo.grupo.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-9)
    gizmo.liberar()
  })

  it('el aro de la vista queda de cara a la cámara aunque el grupo esté girado', () => {
    const gizmo = crearGizmo()
    gizmo.orientar(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 1, 0).normalize(), 1.1))
    const camara = new THREE.PerspectiveCamera()
    camara.position.set(2, 1, 3)
    camara.lookAt(0, 0, 0)
    gizmo.mirarA(camara)
    gizmo.grupo.updateMatrixWorld(true)
    const aro = gizmo.asas.find((a) => (a.userData.asa as AsaDelGizmo).eje === 'vista')!
    // La normal del toro es su +Z local; compuesta con el grupo, tiene que coincidir con la de la cámara.
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(aro.matrixWorld)
    const haciaLaCamara = new THREE.Vector3(0, 0, 1).applyQuaternion(camara.quaternion)
    expect(normal.dot(haciaLaCamara)).toBeGreaterThan(0.999)
    gizmo.liberar()
  })

  it('mide lo mismo en pantalla a cualquier distancia', () => {
    const camara = new THREE.PerspectiveCamera(42, 1.5, 0.02, 60)
    camara.position.set(0, 0, 1)
    camara.lookAt(0, 0, 0)
    camara.updateMatrixWorld(true)
    const cerca = escalaDelGizmo(camara, new THREE.Vector3(0, 0, 0))
    const lejos = escalaDelGizmo(camara, new THREE.Vector3(0, 0, -3))
    expect(lejos / cerca).toBeCloseTo(4, 6)
  })

  it('la caja orientada se coloca, se ve y no se deja seleccionar', () => {
    const caja = crearCajaOrientada()
    expect(caja.lineas.visible).toBe(false)
    caja.colocar(new THREE.Vector3(1, 2, 3), new THREE.Quaternion(), new THREE.Vector3(0.04, 0.3, 0.04))
    expect(caja.lineas.visible).toBe(true)
    expect(caja.lineas.position.toArray()).toEqual([1, 2, 3])
    expect(caja.lineas.scale.y).toBeCloseTo(0.3, 9)
    const rayo = new THREE.Raycaster(new THREE.Vector3(1, 2, 5), new THREE.Vector3(0, 0, -1))
    expect(rayo.intersectObject(caja.lineas)).toHaveLength(0)
    caja.liberar()
  })
})

describe('el foco que deja un corte de verdad', () => {
  function cilindro(): MallaIndexada {
    const g = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 32, 1, false)
    return {
      posiciones: Float32Array.from(g.getAttribute('position').array),
      normales: Float32Array.from(g.getAttribute('normal').array),
      indices: Uint32Array.from(g.getIndex()!.array),
    }
  }

  it('es el centro de la tapa, en los dos trozos', () => {
    const plano = { punto: [0, 0.05, 0] as const, normal: [0, 1, 0] as const }
    const r = partirMalla(cilindro(), plano)
    for (const trozo of [r.haciaLaNormal, r.contraLaNormal]) {
      const foco = focoDeLaTapa(trozo.posiciones, plano.punto, plano.normal)!
      expect(foco.x).toBeCloseTo(0, 3)
      expect(foco.y).toBeCloseTo(0.05, 6)
      expect(foco.z).toBeCloseTo(0, 3)
    }
  })

  it('con el corte oblicuo sigue siendo el centro de la elipse y no el de la caja del trozo', () => {
    const normal = new THREE.Vector3(0, 1, 0.5).normalize()
    const plano = { punto: [0, 0.02, 0] as const, normal: [normal.x, normal.y, normal.z] as const }
    const r = partirMalla(cilindro(), plano)
    const foco = focoDeLaTapa(r.haciaLaNormal.posiciones, plano.punto, plano.normal)!
    expect(foco.distanceTo(new THREE.Vector3(0, 0.02, 0))).toBeLessThan(1e-3)
    // Y está lejos del centro de la caja del trozo, que es sobre lo que se giraba antes.
    const caja = new THREE.Box3().setFromArray(r.haciaLaNormal.posiciones as unknown as number[])
    expect(caja.getCenter(new THREE.Vector3()).distanceTo(foco)).toBeGreaterThan(0.05)
  })
})

describe('los ejes de un hueso en las cuentas de siempre', () => {
  const camara = new THREE.PerspectiveCamera(42, 1.5, 0.02, 60)
  camara.position.set(0, 0, 1)
  camara.lookAt(0, 0, 0)
  camara.updateMatrixWorld(true)
  camara.updateProjectionMatrix()
  const pivote = new THREE.Vector3(0, 0, 0)
  // Un hueso inclinado 30° en el plano de la pantalla: su X va en diagonal.
  const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 6)
  const inclinados: EjesDeTrabajo = {
    x: new THREE.Vector3(1, 0, 0).applyQuaternion(giro),
    y: new THREE.Vector3(0, 1, 0).applyQuaternion(giro),
    z: new THREE.Vector3(0, 0, 1),
  }

  it('arrastrar atado al eje X del hueso mueve a lo largo de ese eje, no del mundo', () => {
    const d = desplazamientoDelArrastre(camara, pivote, 100, 0, 600, 'x', inclinados)
    expect(Math.abs(d.clone().normalize().dot(inclinados.x))).toBeCloseTo(1, 9)
    expect(d.y).toBeGreaterThan(0)
    // Sin pasar los ejes, sigue siendo el X del mundo.
    const delMundo = desplazamientoDelArrastre(camara, pivote, 100, 0, 600, 'x')
    expect(delMundo.y).toBeCloseTo(0, 9)
  })

  it('«G X 8» con los ejes del hueso son ocho milímetros a lo largo de su X', () => {
    const d = desplazamientoTecleado(8, 'x', inclinados)
    expect(d.length()).toBeCloseTo(0.008, 9)
    expect(d.dot(inclinados.x)).toBeCloseTo(0.008, 9)
    expect(desplazamientoTecleado(8, 'x').toArray()).toEqual([0.008, 0, 0])
  })

  it('girar sobre el eje del hueso es girar sobre ese eje', () => {
    const q = giroTecleado(camara, pivote, 10, 'y', inclinados)
    expect(Math.abs(new THREE.Vector3(q.x, q.y, q.z).normalize().dot(inclinados.y))).toBeCloseTo(1, 9)
    expect((2 * Math.acos(q.w) * 180) / Math.PI).toBeCloseTo(10, 6)
    const arrastrado = giroDelArrastre(camara, pivote, 0.3, 'y', inclinados)
    expect(Math.abs(new THREE.Vector3(arrastrado.x, arrastrado.y, arrastrado.z).normalize().dot(inclinados.y))).toBeCloseTo(1, 9)
  })
})

describe('cableado en el visor y en el taller', () => {
  const visor = leer('src', 'components', 'atlas', 'VisorAtlas.tsx')
  const taller = leer('src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx')

  it('«manipular» es una herramienta del visor, junto a las demás', () => {
    expect(visor).toMatch(/export type HerramientaDelVisor =[\s\S]*?\| 'manipular'/)
    // Y las de antes siguen.
    for (const h of ['orbita', 'caja', 'recorte', 'corte', 'rotulo', 'distancia', 'angulo']) {
      expect(visor).toContain(`| '${h}'`)
    }
  })

  it('la tecla V la pone y la quita, y está en la lista de atajos', () => {
    expect(taller).toMatch(/tecla === 'v'\) setHerramienta\(\(actual\) => \(actual === 'manipular' \? 'orbita' : 'manipular'\)\)/)
    expect(taller).toMatch(/\[\s*'V',\s*'Manipular:/)
  })

  it('«Manipular» tiene su botón y «Ejes del hueso», el suyo', () => {
    expect(taller).toContain("aria-pressed={herramienta === 'manipular'}")
    expect(taller).toContain('aria-pressed={ejesDelHueso}')
    expect(taller).toContain("ejesDelGizmo={ejesDelHueso ? 'hueso' : 'mundo'}")
  })

  it('con «Manipular» las asas se ven siempre', () => {
    expect(taller).toContain("gizmo={gizmo || herramienta === 'manipular'}")
  })

  it('de entrada los ejes son los del cuerpo: la X de «G X 8» no cambia de significado', () => {
    expect(taller).toMatch(/const \[ejesDelHueso, setEjesDelHueso\] = useState\(false\)/)
  })

  it('el taller no trae three por mostrar la lectura: importa lo ligero', () => {
    // `manipular.ts` importa three; `lecturaClinica.ts`, no. Es la misma regla
    // que ya guarda a `cargador` y al visor fuera del trozo de entrada.
    expect(taller).toContain("from '@/atlas/lecturaClinica'")
    expect(taller).not.toMatch(/(?:^|\n)import\s+(?!type\s)[^\n]*from\s+'@\/atlas\/manipular'/)
    expect(leer('src', 'atlas', 'lecturaClinica.ts')).not.toMatch(/from 'three'/)
  })

  it('un arrastre sobre una pieza espera a pasar el umbral y no frena la cámara si es un clic', () => {
    // Pulsar una pieza con «Manipular» arma una espera; soltar sin arrastrar la
    // desarma y devuelve la cámara, y el clic sigue su camino de siempre.
    expect(visor).toContain('arrastreEnEspera')
    expect(visor).toContain('soltarElArrastreEnEspera(evento)')
    expect(visor).toContain("render.domElement.addEventListener('pointercancel', alCancelar)")
    expect(visor).toContain("render.domElement.removeEventListener('pointercancel', alCancelar)")
  })

  it('un segundo dedo devuelve la cámara: el pellizco no se pierde por un arrastre en marcha', () => {
    expect(visor).toContain("render.domElement.addEventListener('pointerdown', alDedoDeMas, true)")
    expect(visor).toContain("render.domElement.removeEventListener('pointerdown', alDedoDeMas, true)")
    // Con el dedo, la cámara no se desactiva al pulsar: OrbitControls tiene que registrar el primero.
    expect(visor).toContain("if (evento.pointerType !== 'touch') controles.enabled = false")
  })

  it('el aro de la vista gira sin eje, y Mayús, Ctrl y Alt hacen lo que dicen los atajos', () => {
    expect(visor).toContain("gestoDelAsa.eje = asa.eje === 'vista' ? null : asa.eje")
    expect(visor).toContain('modificadores.mayus')
    expect(visor).toContain('saltoDeAngulo(angulo)')
    expect(visor).toContain('girarEnSaltos(giro)')
    expect(visor).toContain('espera.libre ? ')
  })

  it('un trozo gira sobre su foco, y el gizmo se pone ahí', () => {
    expect(visor).toContain('puntoDeGiroActual(trozo, alEmpezar.get(id))')
    expect(visor).toContain('suma.add(puntoDeGiroActual(trozo, transformacion))')
  })

  it('el visor libera la caja orientada al desmontar', () => {
    expect(visor).toContain('cajaDelHueso.liberar()')
  })

  it('un gesto de ratón sigue siendo un solo paso del historial: una sola llamada a alTransformar al terminar', () => {
    expect((visor.match(/ultimas\.current\.alTransformar\?\.\(completas\)/g) ?? []).length).toBe(1)
  })
})
