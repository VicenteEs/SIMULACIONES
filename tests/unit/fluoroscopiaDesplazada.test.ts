import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  SIN_DESPLAZAMIENTO,
  TOPE_DEL_DESPLAZAMIENTO,
  arrastrarLaImagen,
  centroDeLaImagen,
  limitarDesplazamiento,
} from '@/lib/radiografia'
import { ponerRadiografiaTemporal, prepararFluoroscopia, soltarFluoroscopia } from '@/components/simulador/radiografiaEnLaEscena'

/**
 * Mover la extremidad bajo el arco, y que la fluoroscopia no toque la escena de quien trabaja.
 *
 * Dos peticiones de Cristóbal: «que se despliegue el cuadro del rayo pero que no se pierda el resto de la
 * imagen» y «permitir mover para arriba y para abajo lo que se está viendo (arrastrar la extremidad)».
 */

describe('arrastrarLaImagen', () => {
  it('arrastrar hacia arriba sube la extremidad por la imagen', () => {
    const d = arrastrarLaImagen(SIN_DESPLAZAMIENTO, 0, -96, 192)
    expect(d.x).toBe(0)
    // 96 px es medio lado: un radio del círculo.
    expect(d.y).toBeCloseTo(1, 6)
  })

  it('arrastrar hacia la derecha la lleva a la derecha', () => {
    expect(arrastrarLaImagen(SIN_DESPLAZAMIENTO, 48, 0, 192).x).toBeCloseTo(0.5, 6)
  })

  it('suma los arrastres sucesivos', () => {
    let d = SIN_DESPLAZAMIENTO as { x: number; y: number }
    for (let i = 0; i < 4; i++) d = arrastrarLaImagen(d, 0, -24, 192)
    expect(d.y).toBeCloseTo(1, 6)
  })

  it('no la deja salir más allá del tope: fuera del círculo no queda nada que mirar', () => {
    const d = arrastrarLaImagen(SIN_DESPLAZAMIENTO, 5000, 5000, 192)
    expect(d.x).toBe(TOPE_DEL_DESPLAZAMIENTO)
    expect(d.y).toBe(-TOPE_DEL_DESPLAZAMIENTO)
  })

  it('un lado de cero píxeles no divide por cero', () => {
    const d = arrastrarLaImagen(SIN_DESPLAZAMIENTO, 3, 3, 0)
    expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true)
  })
})

describe('limitarDesplazamiento', () => {
  it('cambia lo que no es un número por cero', () => {
    expect(limitarDesplazamiento({ x: NaN, y: Infinity })).toEqual({ x: 0, y: 0 })
  })
})

describe('centroDeLaImagen', () => {
  const centro: [number, number, number] = [10, 20, 30]
  const derecha: [number, number, number] = [1, 0, 0]
  const arriba: [number, number, number] = [0, 1, 0]

  it('sin desplazamiento mira al centro del hueso', () => {
    expect(centroDeLaImagen(centro, 5, derecha, arriba, SIN_DESPLAZAMIENTO)).toEqual(centro)
  })

  it('si el miembro sube por la imagen, la cámara mira más abajo de él', () => {
    const [, y] = centroDeLaImagen(centro, 5, derecha, arriba, { x: 0, y: 1 })
    expect(y).toBeCloseTo(15, 6)
  })

  it('si el miembro va a la derecha, la cámara mira a su izquierda', () => {
    const [x] = centroDeLaImagen(centro, 5, derecha, arriba, { x: 1, y: 0 })
    expect(x).toBeCloseTo(5, 6)
  })
})

describe('ponerRadiografiaTemporal', () => {
  function escenaDePrueba() {
    const escena = new THREE.Scene()
    const raiz = new THREE.Group()
    const original = new THREE.MeshStandardMaterial({ color: 0xff0000 })
    const hueso = new THREE.Mesh(new THREE.BoxGeometry(), original)
    hueso.name = 'tibia'
    raiz.add(hueso)
    const piel = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    piel.name = 'piel'
    raiz.add(piel)
    const cinta = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    cinta.name = 'cinta-de-la-herida'
    piel.add(cinta)
    const agujero = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    agujero.userData.agujero = true
    escena.add(raiz, agujero)
    const tornillo = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    tornillo.name = 'tornillo'
    escena.add(tornillo)
    const roles = new Map([
      ['tibia', 'hueso'],
      ['piel', 'piel'],
    ])
    return { escena, raiz, roles, hueso, piel, cinta, agujero, tornillo, original }
  }

  it('cambia los materiales mientras dura y los devuelve intactos, junto con lo que escondió', () => {
    const e = escenaDePrueba()
    const f = prepararFluoroscopia()
    const piel = e.piel.material
    const restaurar = ponerRadiografiaTemporal({ escena: e.escena, raiz: e.raiz, rolesAplicados: e.roles }, f)

    expect(e.hueso.material).not.toBe(e.original)
    expect((e.hueso.material as unknown as THREE.ShaderMaterial).isShaderMaterial).toBe(true)
    expect(e.cinta.visible).toBe(false)
    expect(e.agujero.visible).toBe(false)

    restaurar()
    expect(e.hueso.material).toBe(e.original)
    expect(e.piel.material).toBe(piel)
    expect(e.cinta.visible).toBe(true)
    expect(e.agujero.visible).toBe(true)
    soltarFluoroscopia(f)
  })

  it('la densidad sale del papel de la pieza, y lo que no es del modelo es metal', () => {
    const e = escenaDePrueba()
    const f = prepararFluoroscopia()
    const restaurar = ponerRadiografiaTemporal({ escena: e.escena, raiz: e.raiz, rolesAplicados: e.roles }, f)
    const densidad = (m: THREE.Material) => (m as THREE.ShaderMaterial).uniforms.uDensidad.value as number
    const hueso = densidad(e.hueso.material as THREE.Material)
    const piel = densidad(e.piel.material as THREE.Material)
    const metal = densidad(e.tornillo.material as THREE.Material)
    expect(hueso).toBeGreaterThan(piel)
    expect(metal).toBeGreaterThan(hueso)
    restaurar()
    soltarFluoroscopia(f)
  })

  it('reusa un material por densidad en vez de crear uno por malla y por dibujo', () => {
    const e = escenaDePrueba()
    const f = prepararFluoroscopia()
    const contexto = { escena: e.escena, raiz: e.raiz, rolesAplicados: e.roles }
    ponerRadiografiaTemporal(contexto, f)()
    const creados = f.materiales.size
    ponerRadiografiaTemporal(contexto, f)()
    ponerRadiografiaTemporal(contexto, f)()
    expect(f.materiales.size).toBe(creados)
    soltarFluoroscopia(f)
    expect(f.materiales.size).toBe(0)
  })
})
