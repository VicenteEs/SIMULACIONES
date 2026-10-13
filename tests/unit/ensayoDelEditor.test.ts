import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claveDeLaConsolaDelEditor,
  claveDelPasoDelEditor,
  guardarEnsayoDeLaConsola,
  guardarPasoDelEditor,
  leerEnsayoDeLaConsola,
  leerPasoDelEditor,
} from '@/lib/ensayoDelEditor'

/**
 * Lo que el editor recuerda de su ensayo (la causa de «se borra la incisión del primer bisturí»).
 *
 * En un caso nuevo, guardar el borrador por primera vez cambia la dirección y vuelve a montar el editor
 * entero. Si el editor no recordara en qué paso estaba y qué instrumento tenía en la mano, el ensayo
 * empezaría de cero y la incisión recién hecha parecería borrada. La clave es el MODELO y no la ficha
 * porque la ficha es justo lo que cambia al guardar por primera vez.
 */

/** Un `sessionStorage` en memoria: la prueba corre sin navegador. */
function almacenamientoEnMemoria() {
  const datos = new Map<string, string>()
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
  }
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', almacenamientoEnMemoria())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('las claves', () => {
  it('dependen del modelo y no de la ficha: sobreviven al primer guardado', () => {
    expect(claveDelPasoDelEditor('modelo-7')).toBe(claveDelPasoDelEditor('modelo-7'))
    expect(claveDelPasoDelEditor('modelo-7')).not.toBe(claveDelPasoDelEditor('modelo-8'))
    expect(claveDeLaConsolaDelEditor('/m/a.glb')).not.toBe(claveDeLaConsolaDelEditor('/m/b.glb'))
  })

  it('el paso y la consola no se pisan entre sí aunque lleven el mismo texto', () => {
    expect(claveDelPasoDelEditor('x')).not.toBe(claveDeLaConsolaDelEditor('x'))
  })
})

describe('el paso en que se estaba', () => {
  it('se guarda y se recupera tal cual, incluido el primero', () => {
    const clave = claveDelPasoDelEditor('modelo-1')
    expect(leerPasoDelEditor(clave)).toBeNull()
    guardarPasoDelEditor(clave, 0)
    expect(leerPasoDelEditor(clave)).toBe(0)
    guardarPasoDelEditor(clave, 5)
    expect(leerPasoDelEditor(clave)).toBe(5)
  })

  it('un valor roto o imposible se ignora en vez de llevar al editor a un paso que no existe', () => {
    const clave = claveDelPasoDelEditor('modelo-2')
    for (const roto of ['-1', '2.5', '"tres"', 'null', '{', '']) {
      sessionStorage.setItem(clave, roto)
      expect(leerPasoDelEditor(clave)).toBeNull()
    }
  })
})

describe('el instrumento, el modo y los ajustes de la consola', () => {
  const ensayo = {
    v: 1 as const,
    instrumento: 'bisturi-23',
    modo: 'trazar',
    tipoDeTrazo: 'libre' as const,
    modoElectro: 'coagulacion' as const,
    potenciaW: 42,
  }

  it('lo que se guarda es lo que vuelve', () => {
    const clave = claveDeLaConsolaDelEditor('/m/pierna.glb')
    guardarEnsayoDeLaConsola(clave, ensayo)
    expect(leerEnsayoDeLaConsola(clave)).toEqual(ensayo)
  })

  it('sin nada guardado, o con una versión que no es la 1, no hay ensayo que recuperar', () => {
    const clave = claveDeLaConsolaDelEditor('/m/otra.glb')
    expect(leerEnsayoDeLaConsola(clave)).toBeNull()
    sessionStorage.setItem(clave, JSON.stringify({ ...ensayo, v: 2 }))
    expect(leerEnsayoDeLaConsola(clave)).toBeNull()
  })

  it('un campo estropeado vuelve a su valor de siempre sin tirar el resto', () => {
    const clave = claveDeLaConsolaDelEditor('/m/danada.glb')
    sessionStorage.setItem(
      clave,
      JSON.stringify({ v: 1, instrumento: 7, modo: null, tipoDeTrazo: 'zigzag', modoElectro: 'x', potenciaW: 'mucha' }),
    )
    expect(leerEnsayoDeLaConsola(clave)).toEqual({
      v: 1,
      instrumento: null,
      modo: null,
      tipoDeTrazo: 'recto',
      modoElectro: 'corte',
      potenciaW: 35,
    })
  })
})

describe('sin almacenamiento, el editor sigue funcionando', () => {
  it('si el navegador lo bloquea (navegación privada, cuota), no lanza: solo no recuerda', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('cuota')
      },
    })
    expect(() => guardarPasoDelEditor('k', 3)).not.toThrow()
    expect(() =>
      guardarEnsayoDeLaConsola('k', {
        v: 1,
        instrumento: null,
        modo: null,
        tipoDeTrazo: 'recto',
        modoElectro: 'corte',
        potenciaW: 35,
      }),
    ).not.toThrow()
    expect(leerPasoDelEditor('k')).toBeNull()
    expect(leerEnsayoDeLaConsola('k')).toBeNull()
  })
})
