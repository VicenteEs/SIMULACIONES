import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import { ponerAspecto } from '@/atlas/cargador'
import { normalizarSeleccion } from '@/atlas/catalogo'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/** Color y opacidad propios de una pieza (D-134). */

const catalogo = { version: 'prueba', piezas: [{ id: 'a' }] } as unknown as CatalogoDelAtlas
const guardar = (pieza: unknown) => normalizarSeleccion(catalogo, [pieza], null).piezas[0]

describe('lo que se deja guardar', () => {
  it('guarda color y opacidad bien formados, la opacidad a centésimas', () => {
    expect(guardar({ id: 'a', color: '#2255dd', opacidad: 0.3049 })).toEqual({
      id: 'a',
      color: '#2255dd',
      opacidad: 0.3,
    })
  })

  it('maciza no se guarda, y por debajo del suelo se queda en el suelo', () => {
    expect(guardar({ id: 'a', opacidad: 1 })).toEqual({ id: 'a' })
    expect(guardar({ id: 'a', opacidad: 7 })).toEqual({ id: 'a' })
    // Una pieza al 0 % sería una pieza apagada que sigue contando como encendida.
    expect(guardar({ id: 'a', opacidad: 0 })).toEqual({ id: 'a', opacidad: 0.1 })
  })

  it('descarta lo que no es un número o un color', () => {
    expect(guardar({ id: 'a', opacidad: '0.5' })).toEqual({ id: 'a' })
    expect(guardar({ id: 'a', opacidad: Number.NaN })).toEqual({ id: 'a' })
    expect(guardar({ id: 'a', color: 'rojo' })).toEqual({ id: 'a' })
  })
})

describe('ponerAspecto', () => {
  const escena = () => ({
    aspectos: { needsUpdate: false } as THREE.DataTexture,
    datosDeAspectos: new Float32Array([-1, 0, 0, 1]),
  })

  // El rojo en −1 es la señal de «sin color propio» que lee el sombreador.
  it('sin color deja el rojo en −1, y con null vuelve a maciza y sin color', () => {
    const e = escena()
    ponerAspecto(e, 0, { opacidad: 0.4 })
    expect(e.datosDeAspectos[0]).toBe(-1)
    expect(e.datosDeAspectos[3]).toBeCloseTo(0.4, 6)
    ponerAspecto(e, 0, { color: '#ffffff' })
    expect(e.datosDeAspectos[0]).toBeCloseTo(1, 6)
    ponerAspecto(e, 0, null)
    expect([...e.datosDeAspectos]).toEqual([-1, 1, 1, 1])
    expect(e.aspectos.needsUpdate).toBe(true)
  })
})
