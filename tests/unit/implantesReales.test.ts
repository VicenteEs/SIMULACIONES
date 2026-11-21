import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { prepararHerramienta } from '@/instrumental/herramienta3d'
import {
  colocarPlaca,
  colocarTornillo,
  crearImplantes,
  grosorEnElAgujero,
  medirBajoElAgujero,
  posicionDelAgujero,
} from '@/components/simulador/implantesEnLaEscena'

/**
 * Los ejes de los modelos de implantes tal como salen de Blender (D-169).
 *
 * El simulador coloca la placa y el tornillo asumiendo que el grosor de la placa
 * va en +Y, su largo en Z, y que el tornillo tiene la punta en el origen y la
 * cabeza a +Y. Es la conversión de Blender (Z arriba) a glTF (Y arriba), y se
 * comprueba con los archivos de verdad: si alguien cambia cómo exporta
 * `lib.exportar`, el atornillado dejaría de caer donde dice sin ningún error.
 *
 * Los `.glb` no van a git (`ejemplos/` se ignora): sin ellos la prueba se salta.
 */

const CARPETA = join(process.cwd(), 'ejemplos', 'instrumental')

async function abrir(slug: string): Promise<THREE.Object3D | null> {
  try {
    const bytes = readFileSync(join(CARPETA, `${slug}.glb`))
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      '',
    )
    return gltf.scene
  } catch {
    return null
  }
}

describe('los modelos de implantes, abiertos como los abre el lienzo', () => {
  it('una placa: ancho en X, grosor en Y, largo en Z, y sus agujeros en la meta', async () => {
    const escena = await abrir('placa-lcp-recta-3-5')
    if (!escena) return
    const h = prepararHerramienta(escena)
    const caja = new THREE.Box3().setFromObject(escena)
    const t = caja.getSize(new THREE.Vector3())
    expect(t.y).toBeLessThan(t.x)
    expect(t.x).toBeLessThan(t.z)
    // 11 × 4 × ~110 mm, en metros.
    expect(t.z).toBeGreaterThan(0.1)
    expect(h.meta?.agujeros).toHaveLength(8)
    // Los agujeros siguen el largo de la placa: el mismo X y una Y distinta cada uno.
    const ys = (h.meta?.agujeros ?? []).map((a) => a[1])
    expect(new Set(ys).size).toBe(8)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(7 * 13, 3)
  })

  it('un tornillo: la punta en el origen y la cabeza hacia +Y', async () => {
    const escena = await abrir('tornillo-cortical-3-5')
    if (!escena) return
    escena.updateMatrixWorld(true)
    const caja = new THREE.Box3().setFromObject(escena)
    const t = caja.getSize(new THREE.Vector3())
    // El eje largo es Y: 24 mm de caña y la cabeza encima.
    expect(t.y).toBeGreaterThan(t.x * 3)
    expect(t.y).toBeGreaterThan(t.z * 3)
    expect(caja.min.y).toBeGreaterThan(-0.001)
    expect(caja.max.y).toBeGreaterThan(0.024)
  })

  it('todas las placas del catálogo traen sus agujeros', async () => {
    for (const slug of [
      'placa-dcp-4-5',
      'placa-lc-dcp-3-5',
      'placa-lcp-recta-3-5',
      'placa-lcp-recta-4-5',
      'placa-lcp-anatomica-tibia-proximal',
      'placa-tercio-de-cana',
      'placa-reconstruccion-3-5',
      'placa-t-3-5',
      'placa-l-3-5',
      'placa-gancho-clavicular',
      'placa-volar-radio-distal-2-4',
      'placa-volar-radio-distal-2-4-izquierda',
    ]) {
      const escena = await abrir(slug)
      if (!escena) return
      expect(prepararHerramienta(escena).meta?.agujeros.length, slug).toBeGreaterThan(2)
    }
  })

  it('la volar de radio distal: 25 × 55 mm, derecha, y el eje de sus agujeros a lo largo de la placa', async () => {
    const escena = await abrir('placa-volar-radio-distal-2-4')
    if (!escena) return
    const h = prepararHerramienta(escena)
    const t = new THREE.Box3().setFromObject(escena).getSize(new THREE.Vector3())
    // En metros. El alto de la caja no es el grosor de la chapa (2,2 mm): la cabeza sube 10° hacia volar.
    expect(t.x).toBeCloseTo(0.025, 3)
    expect(t.z).toBeCloseTo(0.055, 3)
    expect(t.y).toBeLessThan(0.006)
    const agujeros = h.meta?.agujeros ?? []
    // 3 combinados en el vástago y 4 + 3 en la cabeza.
    expect(agujeros).toHaveLength(10)
    // `ejeDeLaPlaca` va del primer agujero al último: los dos sobre el eje, el combinado proximal y el central de la cabeza.
    const [primero, ultimo] = [agujeros[0], agujeros[agujeros.length - 1]]
    expect(primero[0]).toBeCloseTo(0, 6)
    expect(ultimo[0]).toBeCloseTo(0, 6)
    expect(ultimo[1] - primero[1]).toBeGreaterThan(35)
    // Derecha: la hilera distal sube hacia el lado radial (+X), que es el que llega más lejos.
    const distales = agujeros.slice(3, 7)
    expect(distales[3][0]).toBeGreaterThan(distales[0][0])
    expect(distales[3][1]).toBeGreaterThan(distales[0][1])
    // Lo que la caja no dice (D-426): la chapa, la altura y la forma de cada agujero y el óvalo de los combinados.
    expect(h.meta?.grosor).toBeCloseTo(2.2, 6)
    expect(h.meta?.formas).toEqual([...Array(3).fill('combi'), ...Array(7).fill('redondo')])
    expect(h.meta?.largoDelOval).toBeCloseTo(4.5, 6)
    const alturas = h.meta?.alturas ?? []
    expect(alturas).toHaveLength(10)
    for (const [abajo, arriba] of alturas.slice(0, 3)) {
      expect(abajo).toBeCloseTo(0, 3)
      expect(arriba).toBeCloseTo(2.2, 3)
    }
    // Los de la cabeza, más arriba, con la misma chapa entre sus dos caras (inclinada, mide unas centésimas menos en vertical).
    for (const [abajo, arriba] of alturas.slice(3)) {
      expect(abajo).toBeGreaterThan(1)
      expect(arriba - abajo).toBeCloseTo(2.2, 0)
    }
  })

  it('la izquierda es la derecha en espejo: los agujeros con X cambiada de signo y todo lo demás igual (D-426)', async () => {
    const [d, i] = await Promise.all([abrir('placa-volar-radio-distal-2-4'), abrir('placa-volar-radio-distal-2-4-izquierda')])
    if (!d || !i) return
    const md = prepararHerramienta(d).meta!
    const mi = prepararHerramienta(i).meta!
    expect(mi.nombre).toMatch(/izquierda/)
    expect(mi.agujeros).toHaveLength(md.agujeros.length)
    md.agujeros.forEach(([x, y], k) => {
      expect(mi.agujeros[k][0]).toBeCloseTo(-x, 6)
      expect(mi.agujeros[k][1]).toBeCloseTo(y, 6)
    })
    // Los del eje, en 0 y no en −0: así quedan escritos en la meta.
    expect(Object.is(mi.agujeros[0][0], -0)).toBe(false)
    expect(mi.alturas).toEqual(md.alturas)
    expect(mi.formas).toEqual(md.formas)
    expect(mi.grosor).toBe(md.grosor)
    expect(mi.largoDelOval).toBe(md.largoDelOval)
    const tam = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
    expect(tam(i).distanceTo(tam(d))).toBeLessThan(1e-6)
    // Izquierda: la hilera distal sube hacia el lado radial, que aquí es −X.
    const distales = mi.agujeros.slice(3, 7)
    expect(distales[3][0]).toBeLessThan(distales[0][0])
    expect(distales[3][1]).toBeGreaterThan(distales[0][1])
  })

  it('la volar sobre un hueso plano: el tornillo del vástago apoya en su chapa y uno del largo justo es bicortical (D-426)', async () => {
    const modelo = await abrir('placa-volar-radio-distal-2-4')
    if (!modelo) return
    const h = prepararHerramienta(modelo)
    // La escena en milímetros, como en `implantesEnLaEscena.test.ts`: el modelo viene en metros.
    h.raiz.scale.setScalar(1000)
    const escena = new THREE.Scene()
    // Un hueso plano de 20 mm de espesor, con su cara de arriba en z = 10.
    const hueso = new THREE.Mesh(new THREE.BoxGeometry(80, 120, 20, 16, 24, 4), new THREE.MeshStandardMaterial())
    escena.add(hueso)
    escena.updateMatrixWorld(true)
    const implantes = crearImplantes()
    const placa = colocarPlaca({
      escena,
      plantilla: h.raiz,
      nombre: h.meta!.nombre,
      agujerosMm: h.meta!.agujeros,
      punto: new THREE.Vector3(0, 0, 10),
      normal: new THREE.Vector3(0, 0, 1),
      ejeDelHueso: new THREE.Vector3(0, 1, 0),
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes,
      meta: h.meta,
    })!
    expect(placa).not.toBeNull()
    // El grosor es el de la chapa, y no los 5,2 mm de la caja.
    expect(placa.grosorMm).toBeCloseTo(2.2, 3)
    expect(grosorEnElAgujero(placa, 0)).toBeCloseTo(2.2, 3)
    expect(grosorEnElAgujero(placa, 5)).toBeCloseTo(2.2, 0)
    const caras = (k: number) => [posicionDelAgujero(placa, k, 'abajo'), posicionDelAgujero(placa, k, 'arriba')]
    const [abajo0, arriba0] = caras(0)
    expect(arriba0.clone().sub(abajo0).dot(placa.normal)).toBeCloseTo(2.2, 2)
    // La cabeza sube: sus agujeros empiezan más de un milímetro por encima de los del vástago.
    expect(caras(5)[0].clone().sub(abajo0).dot(placa.normal)).toBeGreaterThan(1)
    // Un tornillo del largo justo: la chapa, el hueco hasta el hueso, el hueso y 2 mm de punta. Con el alto de la caja se
    // quedaba 3 mm antes de la cortical opuesta.
    const medida = medirBajoElAgujero(placa, 0, [hueso])!
    expect(medida.espesorMm).toBeCloseTo(20, 0)
    const tornillo = new THREE.Group()
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.024, 8), new THREE.MeshStandardMaterial())
    cuerpo.position.y = 0.012
    tornillo.add(cuerpo)
    tornillo.scale.setScalar(1000)
    const puesto = colocarTornillo({
      escena,
      plantilla: tornillo,
      placa,
      agujero: 0,
      largoMm: 2.2 + medida.distanciaAlHuesoMm + medida.espesorMm + 2,
      diametroMm: 2.4,
      largoDelModeloMm: 24,
      bloqueado: false,
      huesos: [hueso],
      implantes,
    })!
    expect(puesto.bicortical).toBe(true)
    expect(puesto.puntaFueraMm).toBeCloseTo(2, 1)
    expect(puesto.aviso).toBeNull()
    // Su cabeza, sobre la chapa del vástago y no 3 mm por encima, donde termina la caja de la placa.
    const cabeza = new THREE.Box3().setFromObject(implantes.tornillos.get(0)!.grupo).max.z
    expect(cabeza).toBeCloseTo(arriba0.z, 1)
  })
})
