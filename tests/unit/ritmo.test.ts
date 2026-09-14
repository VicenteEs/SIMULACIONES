import { describe, expect, it } from 'vitest'
import { crearLimitador, direccionDeQuienLlama } from '@/lib/ritmo'

/**
 * El freno de las acciones que cualquiera puede llamar (`src/lib/ritmo.ts`).
 *
 * Cada prueba usa un nombre de limitador propio: el almacén cuelga de
 * `globalThis` precisamente para que dos copias del módulo compartan el
 * contador, así que dos pruebas con el mismo nombre también lo compartirían.
 */

let serie = 0
const nombreNuevo = () => `prueba-${++serie}-${Math.random().toString(36).slice(2)}`

describe('crearLimitador', () => {
  it('deja pasar hasta el máximo dentro de la ventana, y ni uno más', () => {
    const limitador = crearLimitador(nombreNuevo(), { maximo: 3, ventanaMs: 1000 })
    expect([0, 10, 20].map((t) => limitador.permitir('a', t))).toEqual([true, true, true])
    expect(limitador.permitir('a', 30)).toBe(false)
  })

  it('cada clave lleva su propia cuenta', () => {
    const limitador = crearLimitador(nombreNuevo(), { maximo: 1, ventanaMs: 1000 })
    expect(limitador.permitir('10.0.0.1', 0)).toBe(true)
    expect(limitador.permitir('10.0.0.1', 1)).toBe(false)
    expect(limitador.permitir('10.0.0.2', 2)).toBe(true)
  })

  it('los intentos caducan al cumplirse la ventana', () => {
    const limitador = crearLimitador(nombreNuevo(), { maximo: 2, ventanaMs: 1000 })
    limitador.permitir('a', 0)
    limitador.permitir('a', 0)
    expect(limitador.permitir('a', 999)).toBe(false)
    expect(limitador.permitir('a', 1000)).toBe(true)
  })

  it('un intento rechazado no cuenta: insistir no alarga el castigo', () => {
    // Si el rechazo se anotara, quien reintenta cada segundo no volvería a
    // pasar nunca, y eso incluye a la persona legítima que pulsa dos veces.
    const limitador = crearLimitador(nombreNuevo(), { maximo: 2, ventanaMs: 1000 })
    expect(limitador.permitir('a', 0)).toBe(true)
    expect(limitador.permitir('a', 10)).toBe(true)
    expect(limitador.permitir('a', 500)).toBe(false)
    expect(limitador.permitir('a', 999)).toBe(false)
    // A los 1001 ms solo ha caducado el intento del 0; queda el del 10.
    expect(limitador.permitir('a', 1001)).toBe(true)
    expect(limitador.permitir('a', 1005)).toBe(false)
    expect(limitador.permitir('a', 1011)).toBe(true)
  })

  it('dos limitadores con el mismo nombre comparten la cuenta; con otro nombre, no', () => {
    const nombre = nombreNuevo()
    const uno = crearLimitador(nombre, { maximo: 1, ventanaMs: 1000 })
    const otraCopia = crearLimitador(nombre, { maximo: 1, ventanaMs: 1000 })
    const ajeno = crearLimitador(nombreNuevo(), { maximo: 1, ventanaMs: 1000 })
    expect(uno.permitir('a', 0)).toBe(true)
    expect(otraCopia.permitir('a', 1)).toBe(false)
    expect(ajeno.permitir('a', 2)).toBe(true)
  })

  it('barre de la memoria las claves caducadas cuando se acumulan', () => {
    const nombre = nombreNuevo()
    const limitador = crearLimitador(nombre, { maximo: 1, ventanaMs: 1000 })
    for (let i = 0; i <= 5000; i++) limitador.permitir(`clave-${i}`, 0)
    limitador.permitir('la-ultima', 5000)
    const almacenes = (globalThis as unknown as Record<symbol, Map<string, Map<string, number[]>>>)[
      Symbol.for('traumahub.ritmo')
    ]
    expect([...almacenes.get(nombre)!.keys()]).toEqual(['la-ultima'])
  })
})

describe('direccionDeQuienLlama', () => {
  it('toma el primer valor de X-Forwarded-For', () => {
    expect(direccionDeQuienLlama(new Headers({ 'x-forwarded-for': ' 200.1.2.3 , 10.0.0.1' }))).toBe('200.1.2.3')
  })

  it('sin él, X-Real-IP; sin ninguno, «desconocida»', () => {
    expect(direccionDeQuienLlama(new Headers({ 'x-real-ip': '200.9.9.9' }))).toBe('200.9.9.9')
    expect(direccionDeQuienLlama(new Headers())).toBe('desconocida')
  })
})
