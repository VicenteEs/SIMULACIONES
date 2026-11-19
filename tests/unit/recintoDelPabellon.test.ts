import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { colorDeLaPintura, debeApartarse, distanciaAlSegmento, HOLGURA_PARA_APARTAR, HOLGURA_PARA_VOLVER, recibeSombra } from '@/lib/pabellonCompleto'
import { crearElRecinto } from '@/components/simulador/recintoEnLaEscena'

/**
 * El recinto del pabellón (`sala.glb`): lo que hay que cuidar no es la forma, que la hace Blender, sino lo que el
 * simulador hace con ella y se rompe sin ruido. Una pared con sombra deja al paciente a oscuras; un colgante que no se
 * aparta tapa la herida en la vista cenital; un suelo que no se esconde se pelea con el piso de la sala.
 */

describe('la pintura del pabellón', () => {
  it('solo acepta colores de seis cifras: lo demás se queda como viene del archivo', () => {
    const tabla = { 'pintura-pared': '#A9C7BE', 'pintura-techo': 'blanco', 'pintura-zocalo': '#fff' }
    expect(colorDeLaPintura('pintura-pared', tabla)).toBe('#A9C7BE')
    expect(colorDeLaPintura('pintura-techo', tabla)).toBeUndefined()
    expect(colorDeLaPintura('pintura-zocalo', tabla)).toBeUndefined()
    expect(colorDeLaPintura('pintura-puerta', tabla)).toBeUndefined()
  })

  it('de fábrica no repinta nada: los colores salen del guion de Blender', () => {
    expect(colorDeLaPintura('pintura-pared')).toBeUndefined()
  })

  it('solo el piso recibe la sombra de la lámpara', () => {
    expect(recibeSombra('piso-vinilo')).toBe(true)
    for (const otro of ['pintura-pared', 'acero-cepillado', 'pantalla-monitor']) expect(recibeSombra(otro)).toBe(false)
  })
})

describe('apartar lo que cuelga cuando estorba', () => {
  it('la distancia al segmento es la perpendicular dentro de él y la de la punta fuera', () => {
    expect(distanciaAlSegmento([0, 1, 0.5], [0, 0, 0], [0, 2, 0])).toBeCloseTo(0.5)
    // Detrás del punto que se mira: el segmento termina ahí, no sigue.
    expect(distanciaAlSegmento([0, -1, 0], [0, 2, 0], [0, 0, 0])).toBeCloseTo(1)
    expect(distanciaAlSegmento([3, 0, 4], [0, 0, 0], [0, 0, 0])).toBeCloseTo(5)
  })

  it('se aparta antes de rozar y no vuelve hasta estar claramente fuera', () => {
    const radio = 0.4
    expect(debeApartarse(radio * HOLGURA_PARA_APARTAR - 0.001, radio, false)).toBe(true)
    expect(debeApartarse(radio * HOLGURA_PARA_APARTAR + 0.001, radio, false)).toBe(false)
    // Ya apartado, entre las dos holguras sigue apartado: sin esto parpadearía en el borde del cono.
    expect(debeApartarse(radio * ((HOLGURA_PARA_APARTAR + HOLGURA_PARA_VOLVER) / 2), radio, true)).toBe(true)
    expect(debeApartarse(radio * HOLGURA_PARA_VOLVER + 0.001, radio, true)).toBe(false)
  })
})

/** Un `.glb` de mentira con la forma del real: una pared, un piso, un acero y una cialítica que cuelga sobre la camilla. */
function salaDeMentira(): THREE.Group {
  const raiz = new THREE.Group()
  const malla = (nombre: string, material: THREE.Material, geometria: THREE.BufferGeometry, y = 0) => {
    const m = new THREE.Mesh(geometria, material)
    m.name = nombre
    m.position.y = y
    return m
  }
  const pared = new THREE.MeshStandardMaterial({ name: 'pintura-pared', color: '#ffffff' })
  const piso = new THREE.MeshStandardMaterial({ name: 'piso-vinilo' })
  const acero = new THREE.MeshStandardMaterial({ name: 'acero-cepillado', metalness: 1 })
  raiz.add(malla('pared-norte', pared, new THREE.PlaneGeometry(7, 3), 0.5))
  raiz.add(malla('piso', piso, new THREE.PlaneGeometry(7, 7), -0.95))
  raiz.add(malla('estante', acero, new THREE.BoxGeometry(1, 0.4, 0.4), 1))
  const colgante = new THREE.Group()
  colgante.name = 'colgante-cialitica-a'
  // Cabezal de 0,7 m a 1 m sobre la camilla.
  colgante.add(malla('cabezal', new THREE.MeshStandardMaterial({ name: 'pantalla-led' }), new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), 1))
  raiz.add(colgante)
  return raiz
}

function cargadorDeMentira() {
  const loadAsync = vi.fn(async (_url: string) => ({ scene: salaDeMentira() }))
  return { cargador: { loadAsync } as unknown as GLTFLoader, loadAsync }
}

async function esperar() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('el recinto en la escena', () => {
  it('se pide una sola vez, y solo cuando está puesto', async () => {
    const { cargador, loadAsync } = cargadorDeMentira()
    const recinto = crearElRecinto({ cargador, sombras: true, pedirDibujo: () => {}, alCambiar: () => {}, alFallar: () => {} })
    recinto.poner(false)
    recinto.pedir()
    await esperar()
    expect(loadAsync).not.toHaveBeenCalled()
    recinto.poner(true)
    recinto.pedir()
    recinto.pedir()
    await esperar()
    expect(loadAsync).toHaveBeenCalledTimes(1)
    expect(loadAsync.mock.calls[0][0]).toMatch(/\/pabellon\/sala\.glb$/)
  })

  it('al llegar se ve y avisa, y quitado se esconde y avisa para que vuelva el suelo difuminado', async () => {
    const { cargador } = cargadorDeMentira()
    const avisos: boolean[] = []
    const recinto = crearElRecinto({ cargador, sombras: true, pedirDibujo: () => {}, alCambiar: () => avisos.push(recinto.puesto()), alFallar: () => {} })
    expect(recinto.puesto()).toBe(false)
    recinto.pedir()
    await esperar()
    expect(recinto.puesto()).toBe(true)
    expect(recinto.grupo.visible).toBe(true)
    recinto.poner(false)
    expect(recinto.grupo.visible).toBe(false)
    recinto.poner(true)
    expect(recinto.grupo.visible).toBe(true)
    expect(avisos).toEqual([true, false, true])
  })

  it('un fallo al bajarlo no rompe nada: avisa y la sala sigue sin recinto', async () => {
    const alFallar = vi.fn()
    const cargador = { loadAsync: vi.fn(async () => Promise.reject(new Error('404'))) } as unknown as GLTFLoader
    const recinto = crearElRecinto({ cargador, sombras: true, pedirDibujo: () => {}, alCambiar: () => {}, alFallar })
    recinto.pedir()
    await esperar()
    expect(alFallar).toHaveBeenCalledTimes(1)
    expect(recinto.puesto()).toBe(false)
  })

  it('nada echa sombra, solo el piso la recibe, y nada entra en la oclusión ambiental', async () => {
    const { cargador } = cargadorDeMentira()
    const recinto = crearElRecinto({ cargador, sombras: true, pedirDibujo: () => {}, alCambiar: () => {}, alFallar: () => {} })
    recinto.pedir()
    await esperar()
    const mallas: THREE.Mesh[] = []
    recinto.grupo.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) mallas.push(o as THREE.Mesh)
    })
    expect(mallas.length).toBe(4)
    for (const m of mallas) {
      expect(m.castShadow, m.name).toBe(false)
      expect(m.userData.sinOclusion, m.name).toBe(true)
      expect(m.receiveShadow, m.name).toBe(m.name === 'piso')
    }
  })

  it('sin sombras en la calidad, ni el piso las recibe', async () => {
    const { cargador } = cargadorDeMentira()
    const recinto = crearElRecinto({ cargador, sombras: false, pedirDibujo: () => {}, alCambiar: () => {}, alFallar: () => {} })
    recinto.pedir()
    await esperar()
    recinto.grupo.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) expect((o as THREE.Mesh).receiveShadow).toBe(false)
    })
  })

  it('el metal refleja el entorno del pabellón, y lo que no es metal no', async () => {
    const { cargador } = cargadorDeMentira()
    const recinto = crearElRecinto({ cargador, sombras: true, pedirDibujo: () => {}, alCambiar: () => {}, alFallar: () => {} })
    const entorno = new THREE.Texture()
    recinto.ponerElEntorno(entorno)
    recinto.pedir()
    await esperar()
    const por = new Map<string, THREE.MeshStandardMaterial>()
    recinto.grupo.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) por.set(m.name, m.material as THREE.MeshStandardMaterial)
    })
    expect(por.get('estante')?.envMap).toBe(entorno)
    expect(por.get('pared-norte')?.envMap).toBeNull()
  })

  describe('lo que cuelga del techo', () => {
    async function conCialitica() {
      const { cargador } = cargadorDeMentira()
      const dibujos = vi.fn()
      const recinto = crearElRecinto({ cargador, sombras: true, pedirDibujo: dibujos, alCambiar: () => {}, alFallar: () => {} })
      recinto.pedir()
      await esperar()
      const colgante = recinto.grupo.getObjectByName('colgante-cialitica-a')!
      return { recinto, colgante, dibujos }
    }

    it('se aparta cuando está entre la cámara y lo que se mira, y vuelve cuando la cámara se va al costado', async () => {
      const { recinto, colgante } = await conCialitica()
      const mira = new THREE.Vector3(0, 0, 0)
      // Vista cenital: la cámara por encima del cabezal, que está a 1 m sobre la camilla.
      expect(recinto.despejarLaVista(new THREE.Vector3(0, 2, 0), mira)).toBe(true)
      expect(colgante.visible).toBe(false)
      // Sin moverse, nada cambia: no hay que dibujar otra vez.
      expect(recinto.despejarLaVista(new THREE.Vector3(0, 2, 0), mira)).toBe(false)
      // Desde el costado, a la altura de la camilla, el cabezal queda fuera del camino.
      expect(recinto.despejarLaVista(new THREE.Vector3(2.5, 0.2, 0), mira)).toBe(true)
      expect(colgante.visible).toBe(true)
    })

    it('desde un costado a la altura de la camilla no se aparta', async () => {
      const { recinto, colgante, dibujos } = await conCialitica()
      dibujos.mockClear()
      expect(recinto.despejarLaVista(new THREE.Vector3(2.5, 0.2, 0.5), new THREE.Vector3(0, 0, 0))).toBe(false)
      expect(colgante.visible).toBe(true)
      expect(dibujos).not.toHaveBeenCalled()
    })

    it('rueda con el colchón: si el grupo gira, lo que estorba se calcula con el centro ya girado', async () => {
      const { recinto, colgante } = await conCialitica()
      const colchon = new THREE.Group()
      colchon.add(recinto.grupo)
      // Dado la vuelta (boca abajo, como `darLaVuelta`): el cabezal, que estaba arriba, queda abajo.
      colchon.rotation.x = Math.PI
      colchon.updateMatrixWorld(true)
      expect(recinto.despejarLaVista(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, 0))).toBe(false)
      expect(colgante.visible).toBe(true)
      expect(recinto.despejarLaVista(new THREE.Vector3(0, -2, 0), new THREE.Vector3(0, 0, 0))).toBe(true)
      expect(colgante.visible).toBe(false)
    })
  })
})
