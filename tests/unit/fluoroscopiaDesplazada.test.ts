import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  ANCHO_INICIAL_DEL_RECUADRO,
  ANCHO_MAXIMO_DEL_RECUADRO,
  ANCHO_MINIMO_DEL_RECUADRO,
  SIN_DESPLAZAMIENTO,
  TOPE_DEL_DESPLAZAMIENTO,
  ZOOM_MAXIMO_DE_LA_IMAGEN,
  ZOOM_MINIMO_DE_LA_IMAGEN,
  arrastrarLaImagen,
  centroDeLaImagen,
  ladoDeLaImagen,
  limitarAnchoDelRecuadro,
  limitarDesplazamiento,
  limitarZoom,
  topeDelDesplazamiento,
} from '@/lib/radiografia'
import {
  ajustarLadoDeLaFluoroscopia,
  ponerRadiografiaTemporal,
  prepararFluoroscopia,
  soltarFluoroscopia,
} from '@/components/simulador/radiografiaEnLaEscena'

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

describe('el zoom hasta 4× (D-175)', () => {
  it('admite de 0,6 a 4 y lo demás se recorta; lo que no es un número vuelve a 1', () => {
    expect(ZOOM_MINIMO_DE_LA_IMAGEN).toBe(0.6)
    expect(ZOOM_MAXIMO_DE_LA_IMAGEN).toBe(4)
    expect(limitarZoom(9)).toBe(4)
    expect(limitarZoom(0.1)).toBe(0.6)
    expect(limitarZoom(2.5)).toBe(2.5)
    expect(limitarZoom(NaN)).toBe(1)
  })

  it('el tope de lo que se puede correr el miembro crece con el zoom y no baja de lo de siempre', () => {
    expect(topeDelDesplazamiento(1)).toBe(TOPE_DEL_DESPLAZAMIENTO)
    expect(topeDelDesplazamiento(0.6)).toBe(TOPE_DEL_DESPLAZAMIENTO)
    expect(topeDelDesplazamiento(4)).toBeCloseTo(TOPE_DEL_DESPLAZAMIENTO * 4, 9)
    // Y un zoom fuera de rango no abre el tope más allá de 4×.
    expect(topeDelDesplazamiento(40)).toBeCloseTo(TOPE_DEL_DESPLAZAMIENTO * 4, 9)
  })

  it('con 4× se puede llegar al extremo del hueso, que con el tope de 1× quedaba fuera de alcance', () => {
    // A 4× el hueso entero mide cuatro radios de ancho: su extremo está a unos dos radios del centro, y con el
    // tope de 1,6 radios no se llegaba a él.
    const lejos = arrastrarLaImagen(SIN_DESPLAZAMIENTO, 0, -5000, 192, 4)
    expect(lejos.y).toBeGreaterThan(2)
    expect(lejos.y).toBeCloseTo(TOPE_DEL_DESPLAZAMIENTO * 4, 9)
    // Con 1× sigue parando donde paraba.
    expect(arrastrarLaImagen(SIN_DESPLAZAMIENTO, 0, -5000, 192, 1).y).toBe(TOPE_DEL_DESPLAZAMIENTO)
  })

  it('arrastrar sigue al cursor igual con cualquier zoom: lo que se pinchó se queda bajo el dedo', () => {
    // Medio lado de arrastre es un radio del círculo, esté el zoom como esté: el radio ya incluye el zoom.
    expect(arrastrarLaImagen(SIN_DESPLAZAMIENTO, 0, -96, 192, 4).y).toBeCloseTo(1, 6)
    expect(arrastrarLaImagen(SIN_DESPLAZAMIENTO, 0, -96, 192, 0.6).y).toBeCloseTo(1, 6)
  })

  it('al alejar se recorta lo corrido que ya no cabe', () => {
    const corrido = limitarDesplazamiento({ x: 5, y: -5 }, 4)
    expect(corrido).toEqual({ x: 5, y: -5 })
    expect(limitarDesplazamiento(corrido, 1)).toEqual({ x: TOPE_DEL_DESPLAZAMIENTO, y: -TOPE_DEL_DESPLAZAMIENTO })
  })

  it('el foco de la cámara se mueve con el zoom que se pide, sin recortar de más', () => {
    const centro: [number, number, number] = [0, 0, 0]
    const [, y4] = centroDeLaImagen(centro, 1, [1, 0, 0], [0, 1, 0], { x: 0, y: 3 }, 4)
    expect(y4).toBeCloseTo(-3, 6)
    const [, y1] = centroDeLaImagen(centro, 1, [1, 0, 0], [0, 1, 0], { x: 0, y: 3 }, 1)
    expect(y1).toBeCloseTo(-TOPE_DEL_DESPLAZAMIENTO, 6)
  })
})

describe('el tamaño del recuadro y de la imagen (D-175)', () => {
  it('la imagen se dibuja con más píxeles cuanto más ancha se enseña', () => {
    expect(ladoDeLaImagen(268)).toBe(384)
    expect(ladoDeLaImagen(400)).toBe(384)
    expect(ladoDeLaImagen(480)).toBe(512)
    expect(ladoDeLaImagen(700)).toBe(768)
  })

  it('tiene en cuenta la densidad de la pantalla, y una densidad rara no la rompe', () => {
    // 268 px CSS en una pantalla de densidad 2 son 536 píxeles reales.
    expect(ladoDeLaImagen(268, 2)).toBe(512)
    expect(ladoDeLaImagen(268, 0)).toBe(384)
    expect(ladoDeLaImagen(268, NaN)).toBe(384)
    expect(ladoDeLaImagen(NaN)).toBe(384)
  })

  it('el ancho del recuadro se queda entre el mínimo y el máximo, y dentro de lo que cabe', () => {
    expect(limitarAnchoDelRecuadro(50)).toBe(ANCHO_MINIMO_DEL_RECUADRO)
    expect(limitarAnchoDelRecuadro(5000)).toBe(ANCHO_MAXIMO_DEL_RECUADRO)
    expect(limitarAnchoDelRecuadro(500)).toBe(500)
    // Lo que cabe: no pasa de lo que le deja el contenedor…
    expect(limitarAnchoDelRecuadro(700, 450)).toBe(450)
    // …pero un contenedor diminuto no lo baja del mínimo.
    expect(limitarAnchoDelRecuadro(300, 100)).toBe(ANCHO_MINIMO_DEL_RECUADRO)
    expect(limitarAnchoDelRecuadro(NaN)).toBe(ANCHO_INICIAL_DEL_RECUADRO)
  })

  it('cambiar el lado reserva un blanco nuevo y suelta el de antes; el mismo lado no hace nada', () => {
    const f = prepararFluoroscopia()
    expect(f.lado).toBe(384)
    expect(f.buffer.length).toBe(384 * 384 * 4)
    const antes = f.rt
    ajustarLadoDeLaFluoroscopia(f, 384)
    expect(f.rt).toBe(antes)
    f.huella = 'algo'
    ajustarLadoDeLaFluoroscopia(f, 768)
    expect(f.lado).toBe(768)
    expect(f.rt).not.toBe(antes)
    expect(f.rt.width).toBe(768)
    expect(f.buffer.length).toBe(768 * 768 * 4)
    // Hay que volver a dibujar con el tamaño nuevo: la huella de antes ya no vale.
    expect(f.huella).toBe('')
    soltarFluoroscopia(f)
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
