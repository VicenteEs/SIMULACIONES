import { describe, expect, it } from 'vitest'
import {
  CADUCIDAD_OCULTA_MS,
  CADUCIDAD_VISIBLE_MS,
  claveDeFicha,
  crearAlmacen,
  iniciales,
  leerLatido,
} from '@/lib/presencia'

/**
 * El almacén de presencia es puro: recibe la hora. Aquí se comprueba lo que la
 * banda promete —los demás se ven, uno mismo no, entrar y salir se nota— y lo
 * que la protege: la caducidad y el techo de entradas.
 */

const ficha = claveDeFicha('patologias', '41')
const ana = { usuarioId: '1', nombre: 'Ana Administradora', rol: 'admin', visible: true }
const elena = { usuarioId: '3', nombre: 'Elena Editora', rol: 'editor', visible: true }

describe('quién más está', () => {
  it('cada uno ve al otro y no se ve a sí mismo', () => {
    const a = crearAlmacen()
    a.latir(ficha, { ...ana, pestana: 'p-ana-1' }, 0)
    a.latir(ficha, { ...elena, pestana: 'p-ele-1' }, 5_000)
    expect(a.quienMas(ficha, '1', 'p-ana-1', 6_000).otros.map((o) => o.nombre)).toEqual(['Elena Editora'])
    expect(a.quienMas(ficha, '3', 'p-ele-1', 6_000).otros.map((o) => o.nombre)).toEqual(['Ana Administradora'])
  })

  it('«desde» es cuándo abrió, no cuándo latió', () => {
    const a = crearAlmacen()
    a.latir(ficha, { ...elena, pestana: 'p-ele-1' }, 1_000)
    a.latir(ficha, { ...elena, pestana: 'p-ele-1' }, 16_000)
    a.latir(ficha, { ...elena, pestana: 'p-ele-1' }, 31_000)
    expect(a.quienMas(ficha, '1', 'x', 32_000).otros[0].desde).toBe(1_000)
  })

  it('dos pestañas de la misma persona: una sola entrada para los demás, y ella sabe de la otra', () => {
    const a = crearAlmacen()
    a.latir(ficha, { ...elena, pestana: 'p-ele-1' }, 0)
    a.latir(ficha, { ...elena, pestana: 'p-ele-2' }, 10_000)
    expect(a.quienMas(ficha, '1', 'p-ana-1', 11_000).otros).toHaveLength(1)
    expect(a.quienMas(ficha, '1', 'p-ana-1', 11_000).otros[0].desde).toBe(0)
    const propia = a.quienMas(ficha, '3', 'p-ele-1', 11_000)
    expect(propia.otros).toEqual([])
    expect(propia.misOtrasPestanas).toBe(1)
  })

  it('otra ficha no cuenta', () => {
    const a = crearAlmacen()
    a.latir(claveDeFicha('patologias', '42'), { ...elena, pestana: 'p-ele-1' }, 0)
    expect(a.quienMas(ficha, '1', 'p-ana-1', 1).otros).toEqual([])
  })
})

describe('entrar, salir y caducar', () => {
  it('salir quita a esa pestaña y solo a ella', () => {
    const a = crearAlmacen()
    a.latir(ficha, { ...elena, pestana: 'p-ele-1' }, 0)
    a.latir(ficha, { ...elena, pestana: 'p-ele-2' }, 0)
    a.salir(ficha, '3', 'p-ele-1')
    expect(a.quienMas(ficha, '1', 'x', 1).otros).toHaveLength(1)
    a.salir(ficha, '3', 'p-ele-2')
    expect(a.quienMas(ficha, '1', 'x', 1).otros).toEqual([])
    expect(a.tamano()).toBe(0)
    a.salir(ficha, '3', 'p-ele-2') // salir dos veces no descuenta de más
    expect(a.tamano()).toBe(0)
  })

  it('sin latido, la pestaña visible desaparece pasada su caducidad', () => {
    const a = crearAlmacen()
    a.latir(ficha, { ...elena, pestana: 'p' }, 0)
    expect(a.quienMas(ficha, '1', 'x', CADUCIDAD_VISIBLE_MS).otros).toHaveLength(1)
    expect(a.quienMas(ficha, '1', 'x', CADUCIDAD_VISIBLE_MS + 1).otros).toHaveLength(0)
  })

  it('la oculta aguanta más, porque el navegador frena sus temporizadores', () => {
    const a = crearAlmacen()
    a.latir(ficha, { ...elena, pestana: 'p', visible: false }, 0)
    const otros = a.quienMas(ficha, '1', 'x', CADUCIDAD_VISIBLE_MS + 1).otros
    expect(otros).toHaveLength(1)
    expect(otros[0].segundoPlano).toBe(true)
    expect(a.quienMas(ficha, '1', 'x', CADUCIDAD_OCULTA_MS + 1).otros).toHaveLength(0)
  })

  it('una pestaña que caducó y vuelve empieza de nuevo', () => {
    const a = crearAlmacen()
    a.latir(ficha, { ...elena, pestana: 'p' }, 0)
    a.latir(ficha, { ...elena, pestana: 'p' }, 500_000)
    expect(a.quienMas(ficha, '1', 'x', 500_001).otros[0].desde).toBe(500_000)
  })

  it('limpiar suelta lo caducado y ficha vacía', () => {
    const a = crearAlmacen()
    a.latir(ficha, { ...elena, pestana: 'p' }, 0)
    a.limpiar(1_000_000)
    expect(a.tamano()).toBe(0)
  })
})

describe('el techo y el listado', () => {
  it('con el almacén lleno rechaza lo nuevo, pero deja latir a lo que ya estaba', () => {
    const a = crearAlmacen(2)
    expect(a.latir(ficha, { ...elena, pestana: 'p1' }, 0)).toBe(true)
    expect(a.latir(ficha, { ...ana, pestana: 'p2' }, 0)).toBe(true)
    expect(a.latir(ficha, { ...ana, pestana: 'p3' }, 1)).toBe(false)
    expect(a.latir(ficha, { ...elena, pestana: 'p1' }, 2)).toBe(true)
  })

  it('un almacén lleno de caducados hace sitio', () => {
    const a = crearAlmacen(1)
    a.latir(ficha, { ...elena, pestana: 'p1' }, 0)
    expect(a.latir(ficha, { ...ana, pestana: 'p2' }, 1_000_000)).toBe(true)
  })

  it('por colección: quién está en qué ficha, sin mezclar colecciones', () => {
    const a = crearAlmacen()
    a.latir(claveDeFicha('patologias', '41'), { ...elena, pestana: 'p1' }, 0)
    a.latir(claveDeFicha('patologias', '43'), { ...ana, pestana: 'p2' }, 0)
    a.latir(claveDeFicha('maniobras', '5'), { ...ana, pestana: 'p3' }, 0)
    const r = a.porColeccion('patologias', 1)
    expect(Object.keys(r).sort()).toEqual(['41', '43'])
    expect(r['41'][0].nombre).toBe('Elena Editora')
    expect(a.porColeccion('cirugias', 1)).toEqual({})
  })
})

describe('lo que llega por la red', () => {
  const bueno = { coleccion: 'patologias', id: '41', pestana: 'abcdef12-3456' }

  it('acepta un latido bien formado', () => {
    expect(leerLatido(bueno)).toEqual({ ...bueno, visible: true, salir: false })
    expect(leerLatido({ ...bueno, id: 41, visible: false, salir: true })).toMatchObject({ id: '41', visible: false, salir: true })
  })

  it.each([
    ['nada', null],
    ['colección con mayúsculas', { ...bueno, coleccion: 'Pato/logias' }],
    ['id no numérico', { ...bueno, id: '../x' }],
    ['id enorme', { ...bueno, id: '1'.repeat(40) }],
    ['pestaña corta', { ...bueno, pestana: 'a' }],
    ['pestaña con símbolos', { ...bueno, pestana: 'abc def!!!!!' }],
  ])('rechaza: %s', (_c, cuerpo) => {
    expect(leerLatido(cuerpo)).toBeNull()
  })

  it('las iniciales', () => {
    expect(iniciales('Elena Editora')).toBe('EE')
    expect(iniciales('  ana  ')).toBe('A')
    expect(iniciales('')).toBe('?')
  })
})
