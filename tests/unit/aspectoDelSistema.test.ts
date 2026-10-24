import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ASPECTO_POR_OMISION, aspectoDelSistema } from '@/atlas/aspectoDelSistema'
import { aplicarSeparacion, montarEscena, ponerAspecto } from '@/atlas/cargador'
import { SISTEMAS_DE_FASCIA } from '@/atlas/fascias'
import type { CatalogoDelAtlas } from '@/atlas/formato'
import { aspectoParaGlb, colorDeGltf } from '@/lib/exportarAtlas'
import { escribirGlb, type ObjetoParaGlb } from '@/lib/glb'

/**
 * El aspecto de cada sistema (P-006, F-11): una tabla que leen el taller, el `.glb` y Blender.
 *
 * Lo que importa es doble. Que las fascias se vean como lo que son —lámina nacarada y translúcida— y que
 * **nada de lo que ya existía cambie**: ni un byte de un modelo exportado sin fascias, ni la opacidad de
 * una pieza que no es fascia. Las dos cosas se comprueban con números.
 */

const triangulo = (nombre: string, color: [number, number, number, number], extra: Partial<ObjetoParaGlb> = {}): ObjetoParaGlb => ({
  nombre,
  posiciones: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normales: new Int16Array([0, 0, 32767, 0, 0, 32767, 0, 0, 32767]),
  indices: new Uint32Array([0, 1, 2]),
  color,
  ...extra,
})

describe('la tabla', () => {
  it('lo que no se declara es lo de siempre', () => {
    for (const sistema of ['skeletal', 'muscular', 'integumentary', 'cualquiera-nuevo']) {
      expect(aspectoDelSistema(sistema)).toEqual(ASPECTO_POR_OMISION)
    }
    expect(ASPECTO_POR_OMISION).toMatchObject({ rugosidad: 0.72, metalico: 0.02, opacidadInicial: 1, opacidadDelModelo: 1 })
  })

  it('las cuatro fascias son láminas: translúcidas, más lisas que un músculo y con brillo sedoso o barniz', () => {
    for (const id of SISTEMAS_DE_FASCIA) {
      const a = aspectoDelSistema(id)
      expect(a.opacidadInicial, id).toBeLessThan(1)
      expect(a.opacidadDelModelo, id).toBeLessThan(1)
      expect(a.opacidadInicial, id).toBeGreaterThan(0.2)
      expect(a.rugosidad, id).toBeLessThan(ASPECTO_POR_OMISION.rugosidad)
      expect(a.brilloSedoso + a.barniz, id).toBeGreaterThan(0)
    }
  })

  it('la del modelo se ve más que la del taller, donde la trama de píxeles come detalle', () => {
    for (const id of SISTEMAS_DE_FASCIA) {
      expect(aspectoDelSistema(id).opacidadDelModelo, id).toBeGreaterThanOrEqual(aspectoDelSistema(id).opacidadInicial)
    }
  })

  it('solo la fascia profunda lleva fibras largas; la visceral, barniz', () => {
    expect(aspectoDelSistema('fascia-profunda').fibras).toBe(true)
    expect(SISTEMAS_DE_FASCIA.filter((id) => aspectoDelSistema(id).fibras)).toEqual(['fascia-profunda'])
    expect(aspectoDelSistema('fascia-visceral').barniz).toBeGreaterThan(0)
  })
})

describe('el material que se escribe en el .glb', () => {
  it('un sistema de siempre sale sin material y macizo: el archivo no cambia ni un byte', () => {
    const { color, material } = aspectoParaGlb('#b6544c', 'muscular')
    expect(material).toBeUndefined()
    expect(color).toEqual(colorDeGltf('#b6544c'))
    expect(color[3]).toBe(1)
    const antes = escribirGlb([triangulo('Musculos', colorDeGltf('#b6544c'))], 'prueba')
    const despues = escribirGlb([triangulo('Musculos', color, { material })], 'prueba')
    expect(Buffer.from(despues).equals(Buffer.from(antes))).toBe(true)
    // Y no declara extensiones que no usa.
    expect(Buffer.from(despues).toString('latin1')).not.toContain('extensionsUsed')
  })

  it('una fascia sale con su rugosidad, translúcida y con las extensiones de brillo, declaradas', () => {
    const { color, material } = aspectoParaGlb('#e9b5ad', 'fascia-profunda')
    expect(color[3]).toBe(aspectoDelSistema('fascia-profunda').opacidadDelModelo)
    expect(material).toMatchObject({ rugosidad: 0.35, brilloSedoso: 0.7, barniz: 0 })
    const glb = escribirGlb([triangulo('Fascia_profunda', color, { material })], 'prueba')
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true))))
    expect(json.extensionsUsed).toEqual(['KHR_materials_sheen'])
    expect(json.materials[0].alphaMode).toBe('BLEND')
    expect(json.materials[0].pbrMetallicRoughness.roughnessFactor).toBe(0.35)
    expect(json.materials[0].extensions.KHR_materials_sheen.sheenColorFactor).toHaveLength(3)
    // El halo es el color aclarado: nunca más oscuro que el propio color por el brillo.
    for (const c of json.materials[0].extensions.KHR_materials_sheen.sheenColorFactor) {
      expect(c).toBeGreaterThan(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('una serosa lleva el barniz como extensión, y las dos se declaran una vez cada una', () => {
    const a = aspectoParaGlb('#e3bfc8', 'fascia-visceral')
    const b = aspectoParaGlb('#e9b5ad', 'fascia-profunda')
    const glb = escribirGlb(
      [triangulo('Visceral', a.color, { material: a.material }), triangulo('Profunda', b.color, { material: b.material })],
      'prueba',
    )
    const largo = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + largo)))
    expect(json.extensionsUsed).toEqual(['KHR_materials_clearcoat', 'KHR_materials_sheen'])
    expect(json.materials[0].extensions.KHR_materials_clearcoat.clearcoatFactor).toBe(0.8)
    expect(json.materials[1].extensions.KHR_materials_clearcoat).toBeUndefined()
  })

  it('three lo lee como un material físico con brillo sedoso y translúcido', async () => {
    const { color, material } = aspectoParaGlb('#e9b5ad', 'fascia-profunda')
    const glb = escribirGlb([triangulo('Fascia_profunda', color, { material })], 'prueba')
    const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer, '')
    const malla = gltf.scene.getObjectByName('Fascia_profunda') as THREE.Mesh
    const m = malla.material as THREE.MeshPhysicalMaterial
    expect(m.isMeshPhysicalMaterial).toBe(true)
    expect(m.roughness).toBeCloseTo(0.35, 5)
    expect(m.transparent).toBe(true)
    expect(m.opacity).toBeCloseTo(0.6, 5)
    expect(m.sheen).toBeGreaterThan(0)
    expect(m.sheenColor.r).toBeGreaterThan(0)
  })
})

describe('la escena del taller', () => {
  function catalogoDeDosPiezas(): { catalogo: CatalogoDelAtlas; bufer: ArrayBuffer } {
    const bufer = new ArrayBuffer(68)
    new Float32Array(bufer, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
    new Int16Array(bufer, 36, 9).set([0, 0, 32767, 0, 0, 32767, 0, 0, 32767])
    new Uint32Array(bufer, 56, 3).set([0, 1, 2])
    const pieza = (id: string, sistema: string) => ({
      id,
      nombre: id,
      fma: 'FMA1',
      sistema,
      region: 'torax',
      origenRegion: 'anatomia' as const,
      paquete: 0,
      pos: 0,
      nor: 36,
      idx: 56,
      vertices: 3,
      indices: 3,
      caja: [
        [0, 0, 0],
        [1, 1, 0],
      ] as [[number, number, number], [number, number, number]],
    })
    return {
      bufer,
      catalogo: {
        version: 'prueba-aspecto',
        fuente: 'x',
        licencia: 'x',
        sujeto: 'x',
        triangulos: 2,
        sistemas: [
          { id: 'muscular', nombre: 'Músculos', color: '#b6544c', orden: 2 },
          { id: 'fascia-profunda', nombre: 'Fascia profunda', color: '#e9b5ad', orden: 17 },
        ],
        regiones: [{ id: 'torax', nombre: 'Tórax', orden: 1 }],
        paquetes: [{ archivo: 'cuerpo-0.bin.gz', bytes: 68, bytesComprimido: 30 }],
        piezas: [pieza('m1', 'muscular'), pieza('f1', 'fascia-profunda')],
      },
    }
  }

  it('la fascia nace translúcida y marcada como lámina; el músculo, macizo y con volumen', () => {
    const { catalogo, bufer } = catalogoDeDosPiezas()
    const escena = montarEscena(catalogo, new Map([[0, bufer]]))
    const lado = 2
    // Texturas de estado: canal alfa del aspecto de cada pieza.
    expect(escena.datosDeAspectos[0 * 4 + 3]).toBe(1)
    expect(escena.datosDeAspectos[1 * 4 + 3]).toBeCloseTo(0.45, 6)
    expect(escena.opacidadesIniciales[0]).toBe(1)
    expect(escena.opacidadesIniciales[1]).toBeCloseTo(0.45, 6)
    expect(escena.cascaras?.[0]).toBe(0)
    expect(escena.cascaras?.[1]).toBe(1)
    void lado
    escena.liberar()
  })

  it('quitarle el aspecto propio a una fascia la devuelve a su translucidez y no a la opacidad plena', () => {
    const { catalogo, bufer } = catalogoDeDosPiezas()
    const escena = montarEscena(catalogo, new Map([[0, bufer]]))
    ponerAspecto(escena, 1, { opacidad: 1 })
    expect(escena.datosDeAspectos[1 * 4 + 3]).toBe(1)
    ponerAspecto(escena, 1, null)
    expect(escena.datosDeAspectos[1 * 4 + 3]).toBeCloseTo(0.45, 6)
    // Un color propio sin opacidad tampoco la vuelve maciza.
    ponerAspecto(escena, 1, { color: '#ffffff' })
    expect(escena.datosDeAspectos[1 * 4 + 3]).toBeCloseTo(0.45, 6)
    // Y una pieza que no es fascia vuelve a 1, como siempre.
    ponerAspecto(escena, 0, { opacidad: 0.2 })
    ponerAspecto(escena, 0, null)
    expect(escena.datosDeAspectos[0 * 4 + 3]).toBe(1)
    escena.liberar()
  })

  it('el material de la fascia lleva su rugosidad y pide el rayado de fibras', () => {
    const { catalogo, bufer } = catalogoDeDosPiezas()
    const escena = montarEscena(catalogo, new Map([[0, bufer]]))
    const porNombre = new Map(escena.mallas.map((m) => [m.name, m.material as THREE.MeshStandardMaterial]))
    expect(porNombre.get('muscular')!.roughness).toBeCloseTo(0.72, 6)
    expect(porNombre.get('fascia-profunda')!.roughness).toBeCloseTo(0.35, 6)
    expect(porNombre.get('fascia-profunda')!.userData.fibras).toBe(1)
    expect(porNombre.get('muscular')!.userData.fibras).toBe(0)
    aplicarSeparacion(escena, 0)
    escena.liberar()
  })
})
