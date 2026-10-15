import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import {
  aplicarPiezas,
  aplicarVisibilidad,
  datosDeLosNodos,
  esDeInterfazDelModelo,
  liberarMaterial,
  type PiezaDelCaso,
  type Taller,
} from '@/components/simulador/LienzoQuirurgico'

/**
 * Las dos piezas del lienzo que se pueden probar sin navegador.
 *
 * El resto del archivo necesita un contexto de WebGL y un ratón; estas dos no,
 * y son justo las que fallan en silencio: una deja una malla apagada para
 * siempre y la otra deja la memoria de vídeo ocupada. Ninguna de las dos da
 * error cuando se rompe, así que la única forma de vigilarlas es esta.
 */

function modeloDePrueba() {
  const raiz = new THREE.Group()
  for (const nombre of ['tibia', 'placa', 'piel']) {
    const malla = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    malla.name = nombre
    raiz.add(malla)
  }
  return raiz
}

function tallerDePrueba(raiz: THREE.Object3D): Taller {
  return {
    raiz,
    puntosDelTrazo: [],
    materialesOriginales: new Map(),
    rolesAplicados: new Map(),
  }
}

const nodo = (raiz: THREE.Object3D, nombre: string) => raiz.getObjectByName(nombre)!

describe('aplicarPiezas', () => {
  it('apaga los implantes, que no se ven hasta que toca colocarlos', () => {
    const raiz = modeloDePrueba()
    const taller = tallerDePrueba(raiz)

    aplicarPiezas(taller, [
      { nodo: 'tibia', rol: 'fragmento' },
      { nodo: 'placa', rol: 'implante' },
    ])

    expect(nodo(raiz, 'placa').visible).toBe(false)
    expect(nodo(raiz, 'tibia').visible).toBe(true)
  })

  it('devuelve la pieza a la vista cuando deja de ser implante', () => {
    // La regresión que se arregla: el autor marcaba «Implante», el trozo de
    // hueso desaparecía, cambiaba el desplegable de vuelta a «Hueso fijo» y la
    // pieza no volvía nunca, sin ningún aviso que lo explicara.
    const raiz = modeloDePrueba()
    const taller = tallerDePrueba(raiz)

    aplicarPiezas(taller, [{ nodo: 'placa', rol: 'implante' }])
    expect(nodo(raiz, 'placa').visible).toBe(false)

    aplicarPiezas(taller, [{ nodo: 'placa', rol: 'hueso' }])
    expect(nodo(raiz, 'placa').visible).toBe(true)
  })

  it('devuelve la pieza a la vista cuando se la quita de la lista', () => {
    const raiz = modeloDePrueba()
    const taller = tallerDePrueba(raiz)

    aplicarPiezas(taller, [{ nodo: 'placa', rol: 'implante' }])
    aplicarPiezas(taller, [])

    expect(nodo(raiz, 'placa').visible).toBe(true)
  })

  it('no deshace el aislamiento del autor al repetir la misma lista', () => {
    // En el taller esta función se llama en cada repintado, porque la lista de
    // piezas se recalcula y llega como array nuevo. Si asignara la visibilidad
    // entera, «Solo esto» duraría hasta el siguiente clic.
    const raiz = modeloDePrueba()
    const taller = tallerDePrueba(raiz)
    const piezas: PiezaDelCaso[] = [
      { nodo: 'tibia', rol: 'fragmento' },
      { nodo: 'piel', rol: 'piel' },
    ]

    aplicarPiezas(taller, piezas)
    // Lo que hace `mostrar(['tibia'])`: manda sobre la visibilidad.
    nodo(raiz, 'piel').visible = false

    aplicarPiezas(taller, [...piezas])

    expect(nodo(raiz, 'piel').visible).toBe(false)
  })

  it('no toca nada si el modelo todavía no ha cargado', () => {
    const taller: Taller = {
      puntosDelTrazo: [],
      materialesOriginales: new Map(),
      rolesAplicados: new Map(),
    }

    expect(() => aplicarPiezas(taller, [{ nodo: 'placa', rol: 'implante' }])).not.toThrow()
    expect(taller.rolesAplicados.size).toBe(0)
  })
})

describe('liberarMaterial', () => {
  it('suelta las texturas del material, que `dispose()` de three no toca', () => {
    const material = new THREE.MeshStandardMaterial()
    material.map = new THREE.Texture()
    material.normalMap = new THREE.Texture()
    const soltarMapa = vi.spyOn(material.map, 'dispose')
    const soltarNormales = vi.spyOn(material.normalMap, 'dispose')
    const soltarMaterial = vi.spyOn(material, 'dispose')

    liberarMaterial(material)

    expect(soltarMapa).toHaveBeenCalledTimes(1)
    expect(soltarNormales).toHaveBeenCalledTimes(1)
    expect(soltarMaterial).toHaveBeenCalledTimes(1)
  })

  it('aguanta un material sin texturas', () => {
    const material = new THREE.MeshBasicMaterial({ color: 0x9fb4c9 })
    const soltarMaterial = vi.spyOn(material, 'dispose')

    expect(() => liberarMaterial(material)).not.toThrow()
    expect(soltarMaterial).toHaveBeenCalledTimes(1)
  })
})

describe('aplicarVisibilidad (la incisión que desaparecía)', () => {
  // Lo que pasó: la cinta roja de la herida es una malla con nombre, hija de la piel, y `mostrar` apagaba «todo lo
  // que no está en la lista». Con cada cambio de paso o de capa la cinta se apagaba, y una incisión limpia —con
  // los labios pegados— no se ve por ningún otro lado: la incisión «desaparecía» y no había por dónde meter los
  // separadores.
  function modeloConHerida() {
    const raiz = new THREE.Group()
    const piel = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    piel.name = 'piel'
    const cinta = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    cinta.name = 'cinta-de-la-herida'
    piel.add(cinta)
    const hueso = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    hueso.name = 'tibia'
    raiz.add(piel, hueso)
    return { raiz, piel, cinta, hueso }
  }

  it('no apaga la cinta de la herida al mostrar una lista de piezas', () => {
    const { raiz, piel, cinta, hueso } = modeloConHerida()
    aplicarVisibilidad(raiz, ['piel'])
    expect(piel.visible).toBe(true)
    expect(hueso.visible).toBe(false)
    expect(cinta.visible).toBe(true)
  })

  it('tampoco la enciende cuando la herida abrió tanto que decidió apartarla', () => {
    // `actualizarCinta` la oculta cuando la herida pasa de unos milímetros; mostrar todo no se la devuelve.
    const { raiz, cinta } = modeloConHerida()
    cinta.visible = false
    aplicarVisibilidad(raiz, null)
    expect(cinta.visible).toBe(false)
  })

  it('con la piel apagada la cinta se va con ella, porque es hija de la piel', () => {
    const { raiz, piel, cinta } = modeloConHerida()
    aplicarVisibilidad(raiz, ['tibia'])
    expect(piel.visible).toBe(false)
    // Sigue «visible» de por sí, pero no se pinta: la ve quien mira el padre.
    expect(cinta.parent?.visible).toBe(false)
  })

  it('enciende y apaga las piezas de verdad como siempre', () => {
    const { raiz, piel, hueso } = modeloConHerida()
    aplicarVisibilidad(raiz, ['tibia'])
    expect([piel.visible, hueso.visible]).toEqual([false, true])
    aplicarVisibilidad(raiz, null)
    expect([piel.visible, hueso.visible]).toEqual([true, true])
  })
})

describe('esDeInterfazDelModelo', () => {
  it('reconoce la cinta, el borde y lo marcado como interfaz, y no las piezas', () => {
    const con = (nombre: string, datos: Record<string, unknown> = {}) => {
      const o = new THREE.Object3D()
      o.name = nombre
      Object.assign(o.userData, datos)
      return o
    }
    expect(esDeInterfazDelModelo(con('cinta-de-la-herida'))).toBe(true)
    expect(esDeInterfazDelModelo(con('borde-de-la-herida'))).toBe(true)
    expect(esDeInterfazDelModelo(con('lo-que-sea', { deInterfaz: true }))).toBe(true)
    expect(esDeInterfazDelModelo(con('Tibia_izquierda'))).toBe(false)
  })

  it('la cinta no aparece en la lista de piezas del archivo', () => {
    const raiz = new THREE.Group()
    const tibia = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    tibia.name = 'Tibia'
    const cinta = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    cinta.name = 'cinta-de-la-herida'
    tibia.add(cinta)
    raiz.add(tibia)
    expect(datosDeLosNodos(raiz).map((n) => n.nodo)).toEqual(['Tibia'])
  })
})
