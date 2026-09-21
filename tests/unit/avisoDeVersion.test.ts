import { describe, expect, it } from 'vitest'
import { decidir, type MemoriaDelAviso } from '@/lib/avisoDeVersion'

/**
 * Qué hace una pestaña abierta con cada mensaje de `/api/cambios` (D-127).
 *
 * Las tres cosas que aquí se fijan ya fallaron o fallan en silencio: avisar de
 * «contenido nuevo» tras un reinicio que no publicó nada, no enterarse de una
 * versión nueva, y recargar por un reinicio que no trajo código.
 */

const UNA: MemoriaDelAviso = { version: 1000, despliegue: 'abc', arranque: 1 }

describe('decidir', () => {
  it('el primer mensaje solo se recuerda', () => {
    const r = decidir(null, { version: 1000, modulo: null, despliegue: 'abc', arranque: 1 })
    expect(r.decision).toEqual({ tipo: 'nada' })
    expect(r.memoria).toEqual(UNA)
  })

  it('con el mismo proceso, una cuenta mayor es contenido nuevo, y nombra el módulo', () => {
    const r = decidir(UNA, { version: 1001, modulo: 'patologias', despliegue: 'abc', arranque: 1 })
    expect(r.decision).toEqual({ tipo: 'contenido-nuevo', modulo: 'patologias' })
  })

  it('otro proceso con otra construcción es una versión nueva', () => {
    const r = decidir(UNA, { version: 5000, modulo: null, despliegue: 'def', arranque: 2 })
    expect(r.decision).toEqual({ tipo: 'version-nueva' })
    expect(r.memoria).toEqual({ version: 5000, despliegue: 'def', arranque: 2 })
  })

  // La cuenta sale sumada a los segundos del arranque, así que tras un reinicio
  // SIEMPRE es mayor que la recordada. Si se comparase, cada reinicio sacaría
  // «hay contenido actualizado» sin que nadie hubiera publicado nada.
  it('un reinicio a secas ni avisa ni recarga, y adopta la cuenta del proceso nuevo', () => {
    const r = decidir(UNA, { version: 5000, modulo: null, despliegue: 'abc', arranque: 2 })
    expect(r.decision).toEqual({ tipo: 'nada' })
    expect(r.memoria.version).toBe(5000)
    const despues = decidir(r.memoria, { version: 5001, modulo: 'cirugias', despliegue: 'abc', arranque: 2 })
    expect(despues.decision).toEqual({ tipo: 'contenido-nuevo', modulo: 'cirugias' })
  })

  it('el latido de cada quince segundos, con todo igual, no hace nada', () => {
    const r = decidir(UNA, { version: 1000, modulo: null, despliegue: 'abc', arranque: 1 })
    expect(r.decision).toEqual({ tipo: 'nada' })
    expect(r.memoria).toBe(UNA)
  })

  // Un despliegue a medias: el cliente nuevo habla un momento con un servidor
  // de antes de D-127, que no manda ni `despliegue` ni `arranque`.
  it('un servidor que no manda la construcción no dispara nada por no mandarla', () => {
    const vieja: MemoriaDelAviso = { version: 3, despliegue: null, arranque: null }
    const r = decidir(vieja, { version: 3, modulo: null })
    expect(r.decision).toEqual({ tipo: 'nada' })
  })
})
