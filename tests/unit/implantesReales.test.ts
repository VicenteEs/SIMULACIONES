import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { prepararHerramienta } from '@/instrumental/herramienta3d'

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
  })
})
