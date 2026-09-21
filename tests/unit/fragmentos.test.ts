import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { planoDeLaLinea, planoEnReposo, transformacionHeredada } from '@/atlas/fragmentos'
import { normalizarSeleccion } from '@/atlas/catalogo'
import {
  hojasDe,
  idDeFragmento,
  partesDeFragmento,
  piezaDe,
  profundidadDe,
  type CatalogoDelAtlas,
} from '@/atlas/formato'

/**
 * Quebrar un hueso en el taller (D-130): el plano que sale de la línea trazada,
 * los nombres de los fragmentos y lo que se deja guardar.
 */

describe('planoDeLaLinea', () => {
  const haciaDentro = new THREE.Vector3(0, 0, -1)

  // Una línea horizontal vista de frente tiene que dar un corte horizontal: el
  // plano contiene la línea y la dirección de la mirada, así que su normal es
  // vertical.
  it('una línea horizontal vista de frente corta en horizontal, por su punto medio', () => {
    const plano = planoDeLaLinea(new THREE.Vector3(-1, 0.4, 0), new THREE.Vector3(1, 0.4, 0), haciaDentro)
    expect(plano).not.toBeNull()
    expect(Math.abs(plano!.normal[1])).toBeCloseTo(1, 6)
    expect(plano!.normal[0]).toBeCloseTo(0, 6)
    expect(plano!.punto).toEqual([0, 0.4, 0])
  })

  it('no hay plano si la línea no tiene largo o se mira a lo largo de ella', () => {
    const p = new THREE.Vector3(1, 1, 1)
    expect(planoDeLaLinea(p, p.clone(), haciaDentro)).toBeNull()
    expect(planoDeLaLinea(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2), haciaDentro)).toBeNull()
  })
})

describe('los nombres de los fragmentos', () => {
  it('van y vuelven', () => {
    expect(idDeFragmento('FJ3387', 'a')).toBe('FJ3387#a')
    expect(partesDeFragmento('FJ3387#b')).toEqual({ padre: 'FJ3387', lado: 'b' })
    expect(piezaDe('FJ3387#a')).toBe('FJ3387')
  })

  it('una pieza entera no es un fragmento', () => {
    expect(partesDeFragmento('FJ3387')).toBeNull()
    expect(partesDeFragmento('FJ3387#c')).toBeNull()
    expect(piezaDe('FJ3387')).toBe('FJ3387')
  })
})

describe('el árbol de cortes', () => {
  it('la pieza de un fragmento de cualquier nivel es la del catálogo', () => {
    expect(piezaDe('FJ3387#a#b')).toBe('FJ3387')
    expect(partesDeFragmento('FJ3387#a#b')).toEqual({ padre: 'FJ3387#a', lado: 'b' })
    expect(profundidadDe('FJ3387')).toBe(0)
    expect(profundidadDe('FJ3387#a#b')).toBe(2)
  })

  it('lo que existe son las hojas: lo que se volvió a partir deja de existir', () => {
    const cortes = [{ pieza: 'FJ1' }, { pieza: 'FJ1#b' }]
    expect(hojasDe(cortes, 'FJ1')).toEqual(['FJ1#a', 'FJ1#b#a', 'FJ1#b#b'])
    expect(hojasDe(cortes, 'FJ2')).toEqual(['FJ2'])
  })
})

describe('cortar algo que ya se movió', () => {
  const centro = new THREE.Vector3(0.1, 0.5, 0)
  const movida = {
    mover: [0.04, 0, 0] as [number, number, number],
    girar: [0, 0, Math.sin(0.3), Math.cos(0.3)] as [number, number, number, number],
  }

  // El plano se traza sobre lo que se VE y se guarda donde el hueso ESTABA: un
  // punto de la pieza, llevado a donde se ve y devuelto, tiene que volver a sí.
  it('el plano en reposo deshace exactamente la transformación', () => {
    const enReposo = new THREE.Vector3(0.12, 0.43, 0.01)
    const giro = new THREE.Quaternion(...movida.girar)
    const dondeSeVe = enReposo.clone().sub(centro).applyQuaternion(giro).add(centro).add(new THREE.Vector3(...movida.mover))
    const normalVista = new THREE.Vector3(0, 1, 0).applyQuaternion(giro)
    const plano = planoEnReposo(
      { punto: [dondeSeVe.x, dondeSeVe.y, dondeSeVe.z], normal: [normalVista.x, normalVista.y, normalVista.z] },
      centro,
      movida,
    )
    expect(plano.punto[0]).toBeCloseTo(0.12, 9)
    expect(plano.punto[1]).toBeCloseTo(0.43, 9)
    expect(plano.normal[1]).toBeCloseTo(1, 9)
  })

  it('sin transformación, el plano es el que era', () => {
    const plano = { punto: [1, 2, 3] as [number, number, number], normal: [0, 1, 0] as [number, number, number] }
    expect(planoEnReposo(plano, centro, null)).toBe(plano)
  })

  // Cada trozo gira sobre SU centro. Con solo copiarle la transformación del
  // padre, daría un salto al cortar.
  it('el trozo recién cortado se queda donde estaba como parte de su padre', () => {
    const centroDelHijo = new THREE.Vector3(0.1, 0.3, 0)
    const heredada = transformacionHeredada(centro, movida, centroDelHijo)!
    const giro = new THREE.Quaternion(...movida.girar)
    const punto = new THREE.Vector3(0.11, 0.28, 0.02)
    const comoPadre = punto.clone().sub(centro).applyQuaternion(giro).add(centro).add(new THREE.Vector3(...movida.mover))
    const comoHijo = punto
      .clone()
      .sub(centroDelHijo)
      .applyQuaternion(new THREE.Quaternion(...heredada.girar))
      .add(centroDelHijo)
      .add(new THREE.Vector3(...heredada.mover))
    expect(comoHijo.distanceTo(comoPadre)).toBeLessThan(1e-9)
    expect(transformacionHeredada(centro, null, centroDelHijo)).toBeNull()
  })
})

describe('los cortes que se dejan guardar', () => {
  const catalogo = {
    version: 'prueba',
    piezas: [{ id: 'tibia' }, { id: 'femur' }],
  } as unknown as CatalogoDelAtlas
  const guardar = (cortes: unknown, piezas: unknown = ['tibia', 'femur']) =>
    normalizarSeleccion(catalogo, piezas, null, cortes).cortes

  it('guarda el plano con la normal unitaria y lo movido de cada fragmento', () => {
    const cortes = guardar([
      { pieza: 'tibia', punto: [0, 0.4, 0], normal: [0, 2, 0], a: { mover: [0.01, 0, 0] }, b: {} },
    ])
    expect(cortes).toEqual([
      { pieza: 'tibia', punto: [0, 0.4, 0], normal: [0, 1, 0], a: { mover: [0.01, 0, 0] } },
    ])
  })

  it('sin cortes válidos el campo no existe: lo guardado antes de D-130 no cambia', () => {
    expect(guardar(undefined)).toBeUndefined()
    expect(guardar([])).toBeUndefined()
    expect(guardar('no es una lista')).toBeUndefined()
  })

  // Llega del navegador. Un plano roto haría fallar el corte al abrir la ficha,
  // semanas después de haberse guardado.
  it('descarta planos mal formados, normales nulas y piezas que no están en la preparación', () => {
    expect(guardar([{ pieza: 'tibia', punto: [0, Number.NaN, 0], normal: [0, 1, 0] }])).toBeUndefined()
    expect(guardar([{ pieza: 'tibia', punto: [0, 0, 0], normal: [0, 0, 0] }])).toBeUndefined()
    expect(guardar([{ pieza: 'rotula', punto: [0, 0, 0], normal: [0, 1, 0] }])).toBeUndefined()
    expect(guardar([{ pieza: 'femur', punto: [0, 0, 0], normal: [0, 1, 0] }], ['tibia'])).toBeUndefined()
  })

  // Una conminuta (D-137): el fragmento de un corte se vuelve a partir.
  it('admite partir un fragmento de un corte anterior, y no el de uno que no existe', () => {
    const cortes = guardar([
      { pieza: 'tibia', punto: [0, 0.4, 0], normal: [0, 1, 0] },
      { pieza: 'tibia#b', punto: [0, 0.2, 0], normal: [0, 1, 0], a: { mover: [0.04, 0, 0] } },
      // Su padre no se partió: no hay tal fragmento.
      { pieza: 'femur#a', punto: [0, 0.2, 0], normal: [0, 1, 0] },
    ])
    expect(cortes?.map((c) => c.pieza)).toEqual(['tibia', 'tibia#b'])
    expect(cortes?.[1].a).toEqual({ mover: [0.04, 0, 0] })
  })

  it('el orden es el del árbol: un fragmento antes que su padre se descarta', () => {
    const cortes = guardar([
      { pieza: 'tibia#a', punto: [0, 0.2, 0], normal: [0, 1, 0] },
      { pieza: 'tibia', punto: [0, 0.4, 0], normal: [0, 1, 0] },
    ])
    expect(cortes?.map((c) => c.pieza)).toEqual(['tibia'])
  })

  it('tres cortes encadenados como mucho', () => {
    const plano = { punto: [0, 0.4, 0], normal: [0, 1, 0] }
    const cortes = guardar(
      ['tibia', 'tibia#a', 'tibia#a#a', 'tibia#a#a#a'].map((pieza) => ({ pieza, ...plano })),
    )
    expect(cortes?.map((c) => c.pieza)).toEqual(['tibia', 'tibia#a', 'tibia#a#a'])
  })

  it('un solo corte por pieza: el segundo se ignora', () => {
    const cortes = guardar([
      { pieza: 'tibia', punto: [0, 0.4, 0], normal: [0, 1, 0] },
      { pieza: 'tibia', punto: [0, 0.2, 0], normal: [1, 0, 0] },
    ])
    expect(cortes).toHaveLength(1)
    expect(cortes![0].punto).toEqual([0, 0.4, 0])
  })
})
