import { describe, expect, it } from 'vitest'
import {
  claveDeCopia,
  decidirRecuperacion,
  haceCuanto,
  leerCopia,
  mismoContenido,
  motivoParaNoGuardarSolo,
  pareceCorteDeRed,
  renovarClaves,
  serializarCopia,
  VIDA_DE_LA_COPIA_MS,
  type CopiaLocal,
  type EstadoDelEditor,
} from '@/lib/guardadoAutomatico'

/**
 * Lo que decide el guardado automático y la copia local, sin navegador. Lo
 * delicado no es guardar sino cuándo NO: un guardado que nadie pidió no puede
 * devolver una ficha validada a «en revisión» ni cambiar lo publicado.
 */

const listo: EstadoDelEditor = {
  existe: true,
  versionada: true,
  publicada: false,
  sucio: true,
  conectado: true,
  hayChoque: false,
  guardando: false,
  estadoDeRevision: null,
  falloSinCambiosDesde: false,
}

describe('cuándo se guarda sola una ficha', () => {
  it('un borrador existente, con cambios y conexión, sí', () => {
    expect(motivoParaNoGuardarSolo(listo)).toBeNull()
    expect(motivoParaNoGuardarSolo({ ...listo, estadoDeRevision: 'en-revision' })).toBeNull()
    expect(motivoParaNoGuardarSolo({ ...listo, estadoDeRevision: 'devuelta' })).toBeNull()
  })

  it.each([
    ['sin cambios', { sucio: false }, 'sin-cambios'],
    ['ficha nueva', { existe: false }, 'nueva'],
    ['colección sin borrador', { versionada: false }, 'no-versionada'],
    ['publicada', { publicada: true }, 'publicada'],
    ['revisión lista', { estadoDeRevision: 'lista' }, 'lista'],
    ['revisión publicada', { estadoDeRevision: 'publicada' }, 'lista'],
    ['sin conexión', { conectado: false }, 'sin-conexion'],
    ['choque abierto', { hayChoque: true }, 'choque'],
    ['guardado en curso', { guardando: true }, 'guardando'],
    ['rechazo sin teclas nuevas', { falloSinCambiosDesde: true }, 'rechazado'],
  ] as const)('%s no', (_cual, cambio, motivo) => {
    expect(motivoParaNoGuardarSolo({ ...listo, ...cambio })).toBe(motivo)
  })
})

describe('la copia local', () => {
  const copia: CopiaLocal = { version: 1, guardadaEn: 1_000, marca: '2026-10-05T10:00:00.000Z', valores: { nombre: 'x' } }

  it('la clave separa persona, colección y ficha, y una ficha nueva va como «nuevo»', () => {
    expect(claveDeCopia('7', 'patologias', '41')).not.toBe(claveDeCopia('8', 'patologias', '41'))
    expect(claveDeCopia('7', 'patologias', null)).toContain(':nuevo')
    expect(claveDeCopia('7', 'patologias', null)).not.toBe(claveDeCopia('7', 'maniobras', null))
  })

  it('ida y vuelta', () => {
    expect(leerCopia(serializarCopia(copia), 2_000)).toEqual(copia)
  })

  it.each([
    ['vacío', null],
    ['no es JSON', '{no'],
    ['no es objeto', '3'],
    ['otra versión', JSON.stringify({ ...copia, version: 2 })],
    ['sin hora', JSON.stringify({ ...copia, guardadaEn: 'ayer' })],
    ['marca torcida', JSON.stringify({ ...copia, marca: 5 })],
    ['valores en arreglo', JSON.stringify({ ...copia, valores: [] })],
  ])('descarta una copia ilegible: %s', (_c, texto) => {
    expect(leerCopia(texto, 2_000)).toBeNull()
  })

  it('descarta la caducada', () => {
    expect(leerCopia(serializarCopia(copia), copia.guardadaEn + VIDA_DE_LA_COPIA_MS + 1)).toBeNull()
  })
})

describe('qué se hace con una copia al abrir', () => {
  const copia: CopiaLocal = { version: 1, guardadaEn: 1, marca: '2026-10-05T10:00:00.000Z', valores: { a: 'escrito' } }

  it('sin copia, nada', () => {
    expect(decidirRecuperacion(null, { marca: copia.marca, valores: {} })).toEqual({ tipo: 'nada' })
  })

  it('si dice lo mismo que el servidor, se descarta sin preguntar', () => {
    expect(decidirRecuperacion(copia, { marca: copia.marca, valores: { a: 'escrito' } })).toEqual({ tipo: 'descartar' })
  })

  it('si trae algo distinto, se ofrece', () => {
    const r = decidirRecuperacion(copia, { marca: copia.marca, valores: { a: 'viejo' } })
    expect(r).toEqual({ tipo: 'ofrecer', copia, otraVersion: false })
  })

  it('si el servidor se guardó después de la copia, lo dice', () => {
    const r = decidirRecuperacion(copia, { marca: '2026-10-05T11:00:00.000Z', valores: { a: 'viejo' } })
    expect(r).toMatchObject({ tipo: 'ofrecer', otraVersion: true })
  })

  it('la misma hora escrita con +00:00 no es otra versión', () => {
    const r = decidirRecuperacion(copia, { marca: '2026-10-05T10:00:00.000+00:00', valores: { a: 'viejo' } })
    expect(r).toMatchObject({ otraVersion: false })
  })
})

describe('comparar y renovar', () => {
  it('compara contenido sin mirar el orden de las claves ni las claves de cliente', () => {
    expect(mismoContenido({ a: 1, b: [{ x: 1, _clave: 'c1' }] }, { b: [{ x: 1 }], a: 1 })).toBe(true)
    expect(mismoContenido({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('renueva las claves de cliente de filas anidadas y no toca lo demás', () => {
    let n = 0
    const salida = renovarClaves({ t: 'x', b: [{ _clave: 'c1', p: [{ _clave: 'c2' }] }] }, () => `n${++n}`)
    expect(salida).toEqual({ t: 'x', b: [{ _clave: 'n1', p: [{ _clave: 'n2' }] }] })
  })
})

describe('red y reloj', () => {
  it('reconoce un corte por el navegador o por el texto del fallo', () => {
    expect(pareceCorteDeRed(new Error('x'), false)).toBe(true)
    expect(pareceCorteDeRed(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(pareceCorteDeRed(new Error('NetworkError when attempting to fetch resource.'), true)).toBe(true)
    expect(pareceCorteDeRed(new Error('Falta «técnica».'), true)).toBe(false)
  })

  it('«hace cuánto»', () => {
    expect(haceCuanto(0, 2_000)).toBe('ahora mismo')
    expect(haceCuanto(0, 12_000)).toBe('hace 12 s')
    expect(haceCuanto(0, 180_000)).toBe('hace 3 min')
    expect(haceCuanto(0, 7_300_000)).toBe('hace 2 h')
  })
})
