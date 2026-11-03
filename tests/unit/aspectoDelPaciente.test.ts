import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  LINEA_DE_LO_DIFUSO,
  aplicarAlSombreador,
  aspectoDe,
  campoDeLasTapas,
  crearAspectoDelModelo,
  materialConAspecto,
  soltarElAspecto,
  velloAlDia,
  vestirElModelo,
  type Aspecto,
} from '@/components/simulador/aspectoDelPaciente'
import type { HeridaEnCapa } from '@/components/simulador/heridas'
import { partirMalla } from '@/lib/osteotomia'
import type { RolDePieza } from '@/lib/piezasDelCaso'

const pieza = (name: string, sistema?: string) => ({ name, userData: sistema ? { sistema } : {} })

describe('el aspecto de cada pieza', () => {
  it('sale del papel en el caso, con la fascia aparte de la piel y los vasos aparte del músculo', () => {
    expect(aspectoDe(pieza('Skin'), 'piel')).toBe('piel')
    // La fascia superficial se corta con la piel, pero no es piel: no lleva poros ni vello.
    expect(aspectoDe(pieza('Superficial fascia of head'), 'piel')).toBe('fascia')
    expect(aspectoDe(pieza('Fascia lata', 'Sistema de fascias'), 'fascia')).toBe('fascia')
    expect(aspectoDe(pieza('Tibia'), 'hueso')).toBe('hueso')
    expect(aspectoDe(pieza('Fragmento 2'), 'fragmento')).toBe('hueso')
    expect(aspectoDe(pieza('Right biceps brachii', 'muscular'), 'musculo')).toBe('musculo')
    // Sin sistema (un modelo viejo), lo que el caso llama músculo se toma por músculo: «Right soleus» no lo dice.
    expect(aspectoDe(pieza('Right soleus'), 'musculo')).toBe('musculo')
    // Lo que el caso pone como «músculo» y no tiene fibras: por el nombre, con tilde o sin ella, o por el sistema.
    expect(aspectoDe(pieza('Femoral artery'), 'musculo')).toBe('humedo')
    expect(aspectoDe(pieza('Great saphenous vein', 'muscular'), 'musculo')).toBe('humedo')
    expect(aspectoDe(pieza('Tendón de Aquiles'), 'musculo')).toBe('humedo')
    expect(aspectoDe(pieza('Right sciatic', 'nervous'), 'musculo')).toBe('humedo')
    expect(aspectoDe(pieza('Medial collateral', 'connective'), 'musculo')).toBe('humedo')
    // El implante es metal y lo viste el entorno, no esto; lo que no tiene papel no se toca.
    expect(aspectoDe(pieza('Placa LCP'), 'implante')).toBeNull()
    expect(aspectoDe(pieza('Tibia'), undefined)).toBeNull()
  })

  it('el ojo y su córnea llevan el suyo, aunque el caso los ponga con papel de músculo, y no el de lo húmedo', () => {
    // Un objeto del ojo lleva todo el color en los vértices (D-227): con el estriado de las fibras, que le daría
    // `humedo` por ser del sistema sensorial, una esclera se leería como un músculo.
    const ojo = { name: 'ojos', userData: { sistema: 'sensory', aspecto: 'ojos' } }
    const cornea = { name: 'cornea', userData: { sistema: 'sensory', aspecto: 'cornea' } }
    expect(aspectoDe(ojo, 'musculo')).toBe('ojo')
    expect(aspectoDe(cornea, 'musculo')).toBe('ojo')
    expect(aspectoDe(pieza('Left eyeball', 'sensory'), 'musculo')).toBe('humedo')
    // Un implante no se viste nunca, lleve lo que lleve.
    expect(aspectoDe(ojo, 'implante')).toBeNull()
  })
})

describe('el sombreador de cada aspecto', () => {
  const aspectos: Aspecto[] = ['piel', 'fascia', 'musculo', 'humedo', 'hueso', 'ojo']
  const conAspecto = (aspecto: Aspecto) => {
    const s = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} }
    aplicarAlSombreador(s, aspecto, { uMmPorUnidad: { value: 1 } })
    return s
  }

  it('encuentra en los sombreadores de three cada trozo donde se engancha', () => {
    // Si three renombra un trozo, el reemplazo no falla: no ocurre, y el paciente sale liso. Esto es lo que lo dice.
    for (const aspecto of aspectos) {
      const s = conAspecto(aspecto)
      expect(s.vertexShader).toContain('vPosObjeto = transformed;')
      expect(s.fragmentShader).toContain('float azar3(')
      expect(s.fragmentShader).toContain('float alturaDelAspecto')
      expect(s.fragmentShader).toContain('roughnessFactor = clamp( roughnessFactor + rugosidadDelAspecto')
      expect(s.fragmentShader).toContain('normal = conRelieve( normal, alturaDelAspecto );')
      expect(s.uniforms).toHaveProperty('uMmPorUnidad')
    }
  })

  it('pone la dispersión solo en la piel, tras la línea de lo difuso que three escribe hoy', () => {
    expect(THREE.ShaderChunk.lights_physical_pars_fragment).toContain(LINEA_DE_LO_DIFUSO)
    expect(conAspecto('piel').fragmentShader).toContain('vec3( 0.85, 0.32, 0.22 )')
    expect(conAspecto('musculo').fragmentShader).not.toContain('vec3( 0.85, 0.32, 0.22 )')
  })

  it('da las tapas solo al hueso, y el eje de las fibras solo a lo fibroso', () => {
    expect(conAspecto('hueso').vertexShader).toContain('vTapa = aTapa;')
    expect(conAspecto('hueso').fragmentShader).toContain('uniform sampler2D uCampoDeLasTapas;')
    expect(conAspecto('piel').vertexShader).not.toContain('aTapa')
    expect(conAspecto('musculo').fragmentShader).toContain('uniform vec3 uEjeFibra;')
    expect(conAspecto('piel').fragmentShader).not.toContain('uEjeFibra')
    expect(conAspecto('ojo').fragmentShader).not.toContain('uEjeFibra')
    expect(conAspecto('ojo').vertexShader).not.toContain('aTapa')
  })

  it('la piel lee la humedad del color por vértice, solo cuando el material lo trae', () => {
    // Lo rojo y húmedo (los labios) lleva el verde muy bajo; con `USE_COLOR` apagado la rama no se compila y la
    // piel sin pigmentación sigue exactamente igual que antes.
    const piel = conAspecto('piel').fragmentShader
    expect(piel).toContain('#ifdef USE_COLOR')
    expect(piel).toContain('smoothstep( 0.62, 0.34, vColor.g )')
    expect(THREE.ShaderChunk.color_pars_fragment).toContain('varying vec4 vColor;')
  })
})

describe('el material con aspecto', () => {
  it('conserva el color, la opacidad y las caras del archivo, y comparte programa con los de su aspecto', () => {
    const original = new THREE.MeshStandardMaterial({ color: 0xaa3322, transparent: true, opacity: 0.4, side: THREE.DoubleSide, name: 'rojo' })
    const m = materialConAspecto(original, 'musculo', { mmPorUnidad: 1000, unidadesPorMm: 0.001, ejeFibra: [0, 0, 1] })
    expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(m.color.getHex()).toBe(0xaa3322)
    expect(m.transparent).toBe(true)
    expect(m.opacity).toBe(0.4)
    expect(m.side).toBe(THREE.DoubleSide)
    expect(m.name).toBe('rojo')
    expect(m.metalness).toBe(0)
    expect(m.customProgramCacheKey()).toBe('aspecto-musculo')
    const s = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> }
    m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    expect(s.uniforms.uEjeFibra.value).toEqual(new THREE.Vector3(0, 0, 1))
    expect(s.uniforms.uFibra.value).toBe(1)
    expect(s.uniforms.uMmPorUnidad.value).toBe(1000)
  })

  it('copia el color por vértice del archivo, y sin él no lo enciende', () => {
    // El material con aspecto es nuevo: el cargador solo enciende `vertexColors` en el que él mismo creó, y sin
    // copiarlo la pigmentación (D-227) se perdería justo al vestir la malla, sin ningún error que lo diga.
    const medidas = { mmPorUnidad: 1, unidadesPorMm: 1 }
    const conColor = new THREE.MeshStandardMaterial({ vertexColors: true })
    expect(materialConAspecto(conColor, 'piel', medidas).vertexColors).toBe(true)
    expect(materialConAspecto(conColor, 'ojo', medidas).vertexColors).toBe(true)
    expect(materialConAspecto(new THREE.MeshStandardMaterial(), 'piel', medidas).vertexColors).toBe(false)
  })

  it('el ojo es un material mojado: poca rugosidad y barniz, sin fibras ni poros', () => {
    const m = materialConAspecto(new THREE.MeshStandardMaterial(), 'ojo', { mmPorUnidad: 1, unidadesPorMm: 1 })
    expect(m.roughness).toBeLessThan(0.3)
    expect(m.clearcoat).toBe(1)
    expect(m.customProgramCacheKey()).toBe('aspecto-ojo')
    const s = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> }
    m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
    expect(s.uniforms.uEjeFibra).toBeUndefined()
    expect(s.uniforms.uFibra).toBeUndefined()
  })

  it('suelta la textura de las tapas del hueso cuando se suelta el material', () => {
    const tapas = campoDeLasTapas([])
    const soltada = vi.spyOn(tapas.textura, 'dispose')
    const m = materialConAspecto(new THREE.MeshStandardMaterial(), 'hueso', { mmPorUnidad: 1, unidadesPorMm: 1, tapas })
    m.dispose()
    expect(soltada).toHaveBeenCalledOnce()
  })
})

/** Un paciente de juguete, en milímetros: una piel esférica, un hueso partido y un músculo. */
function paciente() {
  const raiz = new THREE.Group()
  const original = new THREE.MeshStandardMaterial({ color: 0xe0b090 })
  const piel = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), original)
  piel.name = 'Skin'
  const cilindro = new THREE.CylinderGeometry(12, 12, 100, 48, 20, true)
  const { haciaLaNormal } = partirMalla(
    {
      posiciones: Float32Array.from(cilindro.getAttribute('position').array),
      normales: Float32Array.from(cilindro.getAttribute('normal').array),
      indices: Uint32Array.from(cilindro.getIndex()!.array),
    },
    { punto: [0, 5, 0], normal: [0, 1, 0] },
  )
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(haciaLaNormal.posiciones, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(haciaLaNormal.normales, 3))
  g.setIndex(new THREE.BufferAttribute(haciaLaNormal.indices, 1))
  const hueso = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  hueso.name = 'Tibia'
  const musculo = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 80), new THREE.MeshStandardMaterial())
  musculo.name = 'Soleus'
  raiz.add(piel, hueso, musculo)
  const roles: Record<string, RolDePieza | undefined> = { Skin: 'piel', Tibia: 'hueso', Soleus: 'musculo' }
  return { raiz, piel, hueso, musculo, original, roles, rolDe: (n: string) => roles[n] }
}

const vello = (m: THREE.Mesh) => m.children.find((c) => c.name === 'vello') as THREE.InstancedMesh | undefined

describe('vestir el modelo', () => {
  it('pone a cada malla su aspecto, el vello en la piel y las tapas en el hueso', () => {
    const { raiz, piel, hueso, musculo, rolDe } = paciente()
    const a = crearAspectoDelModelo()
    vestirElModelo(a, raiz, rolDe, 1)
    expect(piel.material).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect((musculo.material as THREE.Material).customProgramCacheKey()).toBe('aspecto-musculo')
    const v = vello(piel)
    // 314 cm² a 2,5 por cm².
    expect(v?.count).toBeGreaterThan(700)
    expect(v?.userData.deInterfaz).toBe(true)
    expect(v?.castShadow).toBe(false)
    const tapa = hueso.geometry.getAttribute('aTapa')
    expect([...(tapa.array as Float32Array)].filter((x) => x === 1).length).toBeGreaterThan(40)
    expect(piel.castShadow && piel.receiveShadow && hueso.castShadow).toBe(true)
  })

  it('no pone vello donde el archivo pinta mucosa, y deja el resto de la piel como estaba', () => {
    const { raiz, piel, rolDe } = paciente()
    vestirElModelo(crearAspectoDelModelo(), raiz, rolDe, 1)
    const sinColor = vello(piel)!.count

    // La mitad de arriba de la esfera «labio» (rojiza, verde apagado) y la de abajo sin tocar.
    const { raiz: raiz2, piel: piel2, rolDe: rolDe2 } = paciente()
    const posicion = piel2.geometry.getAttribute('position')
    const colores = new Float32Array(posicion.count * 4)
    for (let i = 0; i < posicion.count; i++) {
      const labio = posicion.getY(i) > 0
      colores.set(labio ? [0.72, 0.27, 0.33, 1] : [1, 1, 1, 1], i * 4)
    }
    piel2.geometry.setAttribute('color', new THREE.BufferAttribute(colores, 4))
    vestirElModelo(crearAspectoDelModelo(), raiz2, rolDe2, 1)
    const conColor = vello(piel2)!.count

    // Quedó la mitad de abajo: ni todo ni nada.
    expect(conColor).toBeLessThan(sinColor * 0.65)
    expect(conColor).toBeGreaterThan(sinColor * 0.35)
  })

  it('no rehace lo que ya lleva su aspecto, y devuelve el material del archivo a lo que lo pierde', () => {
    const { raiz, piel, original, roles, rolDe } = paciente()
    const a = crearAspectoDelModelo()
    vestirElModelo(a, raiz, rolDe, 1)
    const propio = piel.material as THREE.MeshPhysicalMaterial
    const soltado = vi.spyOn(propio, 'dispose')
    vestirElModelo(a, raiz, rolDe, 1)
    expect(piel.material).toBe(propio)
    expect(piel.children.filter((c) => c.name === 'vello')).toHaveLength(1)
    roles.Skin = undefined
    vestirElModelo(a, raiz, rolDe, 1)
    expect(piel.material).toBe(original)
    expect(vello(piel)).toBeUndefined()
    expect(soltado).toHaveBeenCalledOnce()
  })

  it('al soltarlo todo, cada malla vuelve a su material', () => {
    const { raiz, piel, hueso, original, rolDe } = paciente()
    const delHueso = hueso.material
    const a = crearAspectoDelModelo()
    vestirElModelo(a, raiz, rolDe, 1)
    soltarElAspecto(a)
    expect(piel.material).toBe(original)
    expect(hueso.material).toBe(delHueso)
    expect(vello(piel)).toBeUndefined()
    expect(a.vestidos.size).toBe(0)
  })
})

describe('el vello y las heridas', () => {
  it('se esconde junto a una incisión de la piel y vuelve cuando se cierra', () => {
    const { raiz, piel, rolDe } = paciente()
    const a = crearAspectoDelModelo()
    vestirElModelo(a, raiz, rolDe, 1)
    const v = vello(piel)!
    const antes = Float32Array.from(v.instanceMatrix.array)
    const herida = { malla: piel, incision: 0, unidadesPorMm: 1, trazo: { puntos: [new THREE.Vector3(50, 0, 0)] } } as unknown as HeridaEnCapa
    velloAlDia(a, [[herida]])
    const escondidos = () => {
      let n = 0
      // Escondido es escalado a cero: las tres columnas de la base vacías.
      for (let h = 0; h < v.count; h++) if (v.instanceMatrix.array.subarray(h * 16, h * 16 + 12).every((x) => x === 0)) n++
      return n
    }
    // Un casquete de 12 mm de radio sobre una esfera de 50: unos 4,5 cm², una docena de vellos.
    expect(escondidos()).toBeGreaterThan(3)
    expect(escondidos()).toBeLessThan(40)
    // Con las mismas heridas no se rehace nada.
    v.instanceMatrix.needsUpdate = false
    const version = v.instanceMatrix.version
    velloAlDia(a, [[herida]])
    expect(v.instanceMatrix.version).toBe(version)
    velloAlDia(a, [])
    expect(escondidos()).toBe(0)
    expect(Float32Array.from(v.instanceMatrix.array)).toEqual(antes)
  })
})
