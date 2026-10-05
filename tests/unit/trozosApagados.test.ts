import { describe, it, expect } from 'vitest'
import {
  ordenarConMemoria,
  ordenarLoEncendido,
  trozosDeLoApagado,
} from '@/atlas/trozosApagados'
import type { CorteDePieza } from '@/atlas/formato'

/**
 * Los trozos recortados no se olvidan al apagar y volver a encender un hueso.
 *
 * El fallo, tal como lo contó quien usa el taller: «cuando activo el hueso de
 * nuevo se renueva completo y no solo lo que había recortado». Se recortaba un
 * hueso, se dejaba solo un trozo, se apagaba el hueso por su casilla y al
 * volver a encenderlo reaparecía la malla entera. No da error en ninguna parte,
 * así que lo que se vigila es la regla: lo apagado de un hueso sobrevive a que
 * el hueso se apague.
 */

const corte = (pieza: string): CorteDePieza =>
  ({ pieza, punto: [0, 0, 0], normal: [0, 1, 0] }) as unknown as CorteDePieza

// Una tibia partida en dos: FJ1#a (_1) y FJ1#b (_2). Y un peroné entero.
const CORTES = [corte('FJ1')]
const TIBIA_1 = 'FJ1#a'
const TIBIA_2 = 'FJ1#b'

describe('ordenarLoEncendido (lo que ya hacía)', () => {
  it('sin trozos apagados no toca las piezas', () => {
    const piezas = new Set(['FJ1', 'FJ2'])
    const orden = ordenarLoEncendido(piezas, new Set(), CORTES)
    expect(orden.piezas).toBe(piezas)
    expect(orden.trozos.size).toBe(0)
  })

  it('deja los trozos apagados de una pieza encendida', () => {
    const orden = ordenarLoEncendido(new Set(['FJ1']), new Set([TIBIA_2]), CORTES)
    expect([...orden.trozos]).toEqual([TIBIA_2])
    expect(orden.piezas.has('FJ1')).toBe(true)
  })

  it('una pieza con TODOS sus trozos apagados se apaga entera', () => {
    // Para que encenderla la devuelva completa en vez de encender un hueso que
    // no enseña nada.
    const orden = ordenarLoEncendido(new Set(['FJ1', 'FJ2']), new Set([TIBIA_1, TIBIA_2]), CORTES)
    expect(orden.piezas.has('FJ1')).toBe(false)
    expect(orden.trozos.size).toBe(0)
  })

  it('descarta los trozos de una pieza que no está encendida (la causa del fallo)', () => {
    // Con razón: no se arrastran identificadores de piezas que no están. Pero
    // sin más, es lo que hacía olvidar lo recortado al apagar el hueso.
    const orden = ordenarLoEncendido(new Set(['FJ2']), new Set([TIBIA_2]), CORTES)
    expect(orden.trozos.size).toBe(0)
  })
})

describe('trozosDeLoApagado', () => {
  it('retiene los trozos de las piezas que se apagan', () => {
    const retenidos = trozosDeLoApagado(new Set([TIBIA_2]), new Set(['FJ2']))
    expect([...retenidos]).toEqual([TIBIA_2])
  })

  it('no retiene los de una pieza que sigue encendida: esos los ordena `ordenarLoEncendido`', () => {
    expect(trozosDeLoApagado(new Set([TIBIA_2]), new Set(['FJ1'])).size).toBe(0)
  })

  it('no retiene nada si nada estaba apagado', () => {
    expect(trozosDeLoApagado(new Set(), new Set(['FJ2'])).size).toBe(0)
  })

  it('reconoce la pieza de un trozo de cualquier nivel', () => {
    const profundo = 'FJ1#b#a'
    expect(trozosDeLoApagado(new Set([profundo]), new Set(['FJ2'])).has(profundo)).toBe(true)
  })
})

describe('apagar el hueso y volver a encenderlo', () => {
  it('lo recortado sobrevive: vuelve el trozo que se había dejado, no la malla entera', () => {
    // 1. Se recorta la tibia y se apaga el trozo _2: queda solo el _1.
    let piezas = new Set(['FJ1', 'FJ2'])
    let apagados = ordenarConMemoria(piezas, new Set([TIBIA_2]), CORTES, new Set()).trozos
    expect([...apagados]).toEqual([TIBIA_2])

    // 2. Se apaga el hueso por su casilla: la pieza sale de lo encendido.
    piezas = new Set(['FJ2'])
    const apagado = ordenarConMemoria(piezas, apagados, CORTES, apagados)
    expect(apagado.piezas.has('FJ1')).toBe(false)
    apagados = apagado.trozos
    // Antes del arreglo esto salía vacío.
    expect([...apagados]).toEqual([TIBIA_2])

    // 3. Se vuelve a encender: la pieza vuelve y el trozo _2 sigue apagado.
    piezas = new Set(['FJ1', 'FJ2'])
    const encendido = ordenarConMemoria(piezas, apagados, CORTES, apagados)
    expect(encendido.piezas.has('FJ1')).toBe(true)
    expect([...encendido.trozos]).toEqual([TIBIA_2])
  })

  it('«Encender todo» sí lo devuelve todo: pasa un conjunto vacío a propósito', () => {
    // Todo el cuerpo encendido, también los trozos que se hubieran apagado
    // (D-141): ninguna pieza queda fuera de lo pedido, así que no se retiene nada.
    const todas = new Set(['FJ1', 'FJ2'])
    const orden = ordenarConMemoria(todas, new Set(), CORTES, new Set([TIBIA_2]))
    expect(orden.trozos.size).toBe(0)
  })

  it('una pieza apagada entera por tener todos sus trozos apagados vuelve completa', () => {
    // No se retiene lo suyo: es la regla de `ordenarLoEncendido`, y encenderla
    // tiene que devolverla completa.
    const orden = ordenarConMemoria(new Set(['FJ1', 'FJ2']), new Set([TIBIA_1, TIBIA_2]), CORTES, new Set())
    expect(orden.piezas.has('FJ1')).toBe(false)
    expect(orden.trozos.size).toBe(0)
    const otra = ordenarConMemoria(new Set(['FJ1', 'FJ2']), new Set(), CORTES, orden.trozos)
    expect(otra.trozos.size).toBe(0)
  })

  it('quedarse con otra cosa («solo») no olvida lo recortado de lo que sale', () => {
    // Se recorta la tibia (_2 apagado) y se deja «solo» el peroné: la tibia
    // sale, y si luego se trae de «Todo el atlas», sigue sin el _2.
    const apagados = new Set([TIBIA_2])
    const solo = ordenarConMemoria(new Set(['FJ2']), new Set(), CORTES, apagados)
    expect([...solo.trozos]).toEqual([TIBIA_2])
  })

  it('no modifica los conjuntos que recibe', () => {
    const anteriores = new Set([TIBIA_2])
    ordenarConMemoria(new Set(['FJ2']), new Set(), CORTES, anteriores)
    expect([...anteriores]).toEqual([TIBIA_2])
  })
})
