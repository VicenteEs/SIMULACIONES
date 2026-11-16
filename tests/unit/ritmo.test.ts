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

describe('crearLimitador', async () => {
  it('deja pasar hasta el máximo dentro de la ventana, y ni uno más', async () => {
    const limitador = crearLimitador(nombreNuevo(), { maximo: 3, ventanaMs: 1000 })
    expect(await Promise.all([0, 10, 20].map((t) => limitador.permitir('a', t)))).toEqual([true, true, true])
    expect(await limitador.permitir('a', 30)).toBe(false)
  })

  it('cada clave lleva su propia cuenta', async () => {
    const limitador = crearLimitador(nombreNuevo(), { maximo: 1, ventanaMs: 1000 })
    expect(await limitador.permitir('10.0.0.1', 0)).toBe(true)
    expect(await limitador.permitir('10.0.0.1', 1)).toBe(false)
    expect(await limitador.permitir('10.0.0.2', 2)).toBe(true)
  })

  it('los intentos caducan al cumplirse la ventana', async () => {
    const limitador = crearLimitador(nombreNuevo(), { maximo: 2, ventanaMs: 1000 })
    await limitador.permitir('a', 0)
    await limitador.permitir('a', 0)
    expect(await limitador.permitir('a', 999)).toBe(false)
    expect(await limitador.permitir('a', 1000)).toBe(true)
  })

  it('un intento rechazado no cuenta: insistir no alarga el castigo', async () => {
    // Si el rechazo se anotara, quien reintenta cada segundo no volvería a
    // pasar nunca, y eso incluye a la persona legítima que pulsa dos veces.
    const limitador = crearLimitador(nombreNuevo(), { maximo: 2, ventanaMs: 1000 })
    expect(await limitador.permitir('a', 0)).toBe(true)
    expect(await limitador.permitir('a', 10)).toBe(true)
    expect(await limitador.permitir('a', 500)).toBe(false)
    expect(await limitador.permitir('a', 999)).toBe(false)
    // A los 1001 ms solo ha caducado el intento del 0; queda el del 10.
    expect(await limitador.permitir('a', 1001)).toBe(true)
    expect(await limitador.permitir('a', 1005)).toBe(false)
    expect(await limitador.permitir('a', 1011)).toBe(true)
  })

  it('dos limitadores con el mismo nombre comparten la cuenta; con otro nombre, no', async () => {
    const nombre = nombreNuevo()
    const uno = crearLimitador(nombre, { maximo: 1, ventanaMs: 1000 })
    const otraCopia = crearLimitador(nombre, { maximo: 1, ventanaMs: 1000 })
    const ajeno = crearLimitador(nombreNuevo(), { maximo: 1, ventanaMs: 1000 })
    expect(await uno.permitir('a', 0)).toBe(true)
    expect(await otraCopia.permitir('a', 1)).toBe(false)
    expect(await ajeno.permitir('a', 2)).toBe(true)
  })

  it('barre de la memoria las claves caducadas cuando se acumulan', async () => {
    const nombre = nombreNuevo()
    const limitador = crearLimitador(nombre, { maximo: 1, ventanaMs: 1000 })
    for (let i = 0; i <= 5000; i++) await limitador.permitir(`clave-${i}`, 0)
    await limitador.permitir('la-ultima', 5000)
    const almacenes = (globalThis as unknown as Record<symbol, Map<string, Map<string, number[]>>>)[
      Symbol.for('traumahub.ritmo')
    ]
    expect([...almacenes.get(nombre)!.keys()]).toEqual(['la-ultima'])
  })

  // La clave sale de una cabecera que escribe quien llama: sin recorte, cada
  // petición podía dejar varios kilobytes en memoria durante una ventana.
  it('recorta la clave: dos cabeceras enormes con el mismo principio comparten cupo', async () => {
    const limitador = crearLimitador(nombreNuevo(), { maximo: 1, ventanaMs: 1000 })
    const principio = 'x'.repeat(64)
    expect(await limitador.permitir(`${principio}-una`, 0)).toBe(true)
    expect(await limitador.permitir(`${principio}-otra`, 0)).toBe(false)
  })

  // Con margen de tiempo: llenar el almacén pasa veinte mil veces por el barrido.
  it('con el almacén lleno de claves vigentes, rechaza las nuevas en vez de crecer', { timeout: 30_000 }, async () => {
    const nombre = nombreNuevo()
    const limitador = crearLimitador(nombre, { maximo: 1, ventanaMs: 1000 })
    for (let i = 0; i < 20_000; i++) await limitador.permitir(`clave-${i}`, 0)
    expect(await limitador.permitir('una-mas', 1)).toBe(false)
    // Las conocidas siguen con su cuenta, y pasada la ventana vuelve a haber sitio.
    expect(await limitador.permitir('clave-0', 1)).toBe(false)
    expect(await limitador.permitir('una-mas', 2000)).toBe(true)
  })
})

describe('direccionDeQuienLlama', () => {
  it('toma el último valor de X-Forwarded-For, que es el que pone el túnel', () => {
    // El primero lo escribe el visitante: con él, cada intento de entrada podía
    // decir venir de una dirección nueva (O-072).
    expect(direccionDeQuienLlama(new Headers({ 'x-forwarded-for': ' 1.2.3.4 , 200.1.2.3 ' }))).toBe('200.1.2.3')
    expect(direccionDeQuienLlama(new Headers({ 'x-forwarded-for': '200.1.2.3' }))).toBe('200.1.2.3')
  })

  it('sin él, X-Real-IP; sin ninguno, «desconocida»', () => {
    expect(direccionDeQuienLlama(new Headers({ 'x-real-ip': '200.9.9.9' }))).toBe('200.9.9.9')
    expect(direccionDeQuienLlama(new Headers())).toBe('desconocida')
  })
})
