import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import {
  aplicarPiezas,
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
