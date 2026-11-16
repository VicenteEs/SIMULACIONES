import { describe, expect, it, vi } from 'vitest'

/**
 * La segunda barrera entre instituciones, del lado de la aplicación (D-399):
 * que cada conexión salga del pool con el lugar de la petición, y que lo de
 * Next de lo que sale ese lugar siga existiendo.
 *
 * Las políticas, del lado de la base, se prueban contra PostgreSQL en
 * `tests/integration/barreraDeInstitucion.test.ts`.
 */

const { estado } = vi.hoisted(() => ({ estado: { almacen: undefined as unknown } }))

vi.mock('next/dist/server/app-render/work-unit-async-storage.external', () => ({
  workUnitAsyncStorage: { getStore: () => estado.almacen },
}))

import {
  ponerBarrera,
  ROL_DE_INSTITUCION,
  subdominioDeLaPeticionEnCurso,
  VARIABLE_DEL_SUBDOMINIO,
  type ConexionDeLaBase,
  type PoolDeLaBase,
} from '@/lib/barreraDeInstitucion'

/** Un pool de una sola conexión, que apunta lo que se le pide. */
function poolDePrueba({ fallaAlPoner = false } = {}) {
  const ordenes: unknown[][] = []
  const soltadas: unknown[] = []
  const conexion: ConexionDeLaBase = {
    query: vi.fn(async (texto: string, valores?: unknown[]) => {
      if (fallaAlPoner && texto.includes('set_config')) throw new Error('role "traumahub_app" does not exist')
      ordenes.push(valores ?? [])
      return { rows: [] }
    }),
    release: vi.fn((fallo?: unknown) => {
      soltadas.push(fallo)
    }),
  }
  const pool = { connect: vi.fn(async () => conexion) } as unknown as PoolDeLaBase
  return { pool, conexion, ordenes, soltadas }
}

describe('la barrera en el pool', () => {
  it('en la central no escribe nada a la base, ni la primera vez', async () => {
    const { pool, ordenes } = poolDePrueba()
    ponerBarrera(pool, () => '')
    await pool.connect()
    expect(ordenes).toEqual([])
  })

  it('desde una institución pone el subdominio y el rol, y no lo repite mientras no cambie', async () => {
    const { pool, ordenes } = poolDePrueba()
    let lugar = 'uchile'
    ponerBarrera(pool, () => lugar)
    await pool.connect()
    await pool.connect()
    expect(ordenes).toEqual([[VARIABLE_DEL_SUBDOMINIO, 'uchile', ROL_DE_INSTITUCION]])

    // Y al volver la conexión a la central, se le quita el rol.
    lugar = ''
    await pool.connect()
    expect(ordenes.at(-1)).toEqual([VARIABLE_DEL_SUBDOMINIO, '', 'none'])

    lugar = 'otra'
    await pool.connect()
    expect(ordenes.at(-1)).toEqual([VARIABLE_DEL_SUBDOMINIO, 'otra', ROL_DE_INSTITUCION])
  })

  it('lee el lugar al pedir la conexión, no al recibirla', async () => {
    const { pool, ordenes } = poolDePrueba()
    let lugar = 'uchile'
    ponerBarrera(pool, () => lugar)
    const pedida = pool.connect()
    lugar = ''
    await pedida
    expect(ordenes).toEqual([[VARIABLE_DEL_SUBDOMINIO, 'uchile', ROL_DE_INSTITUCION]])
  })

  it('también en la forma con función, que es la que usa `pool.query`', async () => {
    const { pool, conexion, ordenes } = poolDePrueba()
    ponerBarrera(pool, () => 'uchile')
    const recibida = await new Promise<ConexionDeLaBase | undefined>((resolver, rechazar) =>
      pool.connect((fallo, c) => (fallo ? rechazar(fallo) : resolver(c))),
    )
    expect(recibida).toBe(conexion)
    expect(ordenes).toEqual([[VARIABLE_DEL_SUBDOMINIO, 'uchile', ROL_DE_INSTITUCION]])
  })

  it('si no puede poner el lugar, descarta la conexión y la consulta falla', async () => {
    const { pool, soltadas } = poolDePrueba({ fallaAlPoner: true })
    ponerBarrera(pool, () => 'uchile')
    await expect(pool.connect()).rejects.toThrow(/traumahub_app/)
    // `true`: que el pool la destruya en vez de prestársela a otra consulta.
    expect(soltadas).toEqual([true])
    const conFuncion = await new Promise<unknown>((resolver) => pool.connect((fallo) => resolver(fallo)))
    expect(conFuncion).toBeInstanceOf(Error)
  })

  it('no envuelve dos veces el mismo pool', async () => {
    const { pool, ordenes } = poolDePrueba()
    ponerBarrera(pool, () => 'uchile')
    ponerBarrera(pool, () => 'otra')
    await pool.connect()
    expect(ordenes).toEqual([[VARIABLE_DEL_SUBDOMINIO, 'uchile', ROL_DE_INSTITUCION]])
  })
})

describe('el lugar de la petición en curso', () => {
  it('sale de la cabecera que deja el proxy', () => {
    estado.almacen = { type: 'request', headers: new Headers({ 'x-traumahub-subdominio': 'UChile' }) }
    expect(subdominioDeLaPeticionEnCurso()).toBe('uchile')
  })

  it('sin petición, o sin cabeceras en ella, es la central', () => {
    estado.almacen = undefined
    expect(subdominioDeLaPeticionEnCurso()).toBe('')
    estado.almacen = { type: 'cache' }
    expect(subdominioDeLaPeticionEnCurso()).toBe('')
  })

  it('la pieza de Next de la que sale sigue existiendo', async () => {
    // Es interna (`workUnitAsyncStorage`). Si una versión de Next la mueve o la
    // quita, esto falla antes de desplegar, en vez de quedar la barrera sin
    // lugar —es decir, quitada— sin que nada lo diga.
    const real = await vi.importActual<{ workUnitAsyncStorage: { getStore: unknown; run: unknown } }>(
      'next/dist/server/app-render/work-unit-async-storage.external',
    )
    expect(typeof real.workUnitAsyncStorage.getStore).toBe('function')
    expect(typeof real.workUnitAsyncStorage.run).toBe('function')
  })
})
