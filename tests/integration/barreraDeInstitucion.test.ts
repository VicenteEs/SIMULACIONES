import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { ponerBarrera, type PoolDeLaBase } from '@/lib/barreraDeInstitucion'

/**
 * La segunda barrera entre instituciones, del lado de la base (P-016 E5.4,
 * D-399): las políticas de la migración `20261116_150000_barrera_de_instituciones`.
 *
 * Se consulta con SQL a secas, como haría una consulta del panel a la que se le
 * olvidó el filtro de `reglas.ts`: la barrera tiene que aguantar sola. El pool
 * es uno propio, envuelto con `ponerBarrera` y con el lugar que diga la prueba;
 * el de Payload saca el lugar de la petición de Next, que aquí no hay.
 *
 * Necesita la base migrada (`npm run db:migrate`): sin la migración no hay rol
 * ni políticas, y estas pruebas fallan al tomar la primera conexión.
 */

const payload: Payload | null = await (async () => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return await getPayload({ config })
  } catch {
    // Ver `acceso.test.ts`: el adaptador deja una promesa rechazada sin dueño.
    process.on('unhandledRejection', () => {})
    return null
  }
})()

const marca = randomBytes(4).toString('hex')

interface PoolDePg extends PoolDeLaBase {
  query: (texto: string, valores?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
  end: () => Promise<void>
}

describe.skipIf(payload === null)('la segunda barrera, en PostgreSQL (D-399)', () => {
  const base = payload as Payload
  let pool: PoolDePg
  // El lugar de la «petición»: lo lee la barrera cada vez que se pide una conexión.
  let lugar = ''
  const subdominio = { A: `a${marca}`, B: `b${marca}` }
  const ids = {} as Record<string, number>
  const borrar: { coleccion: 'instituciones' | 'usuarios' | 'patologias' | 'segmentos' | 'entradas'; id: number }[] = []

  const desde = async (donde: string, texto: string, valores?: unknown[]) => {
    lugar = donde
    return pool.query(texto, valores)
  }
  /** Qué filas de las de la prueba ve una consulta: sus nombres, ordenados. */
  const nombres = (filas: Record<string, unknown>[], columna = 'id') =>
    filas
      .map((f) => Object.entries(ids).find(([, id]) => id === Number(f[columna]))?.[0])
      .filter(Boolean)
      .sort()

  beforeAll(async () => {
    const instituciones: Record<'A' | 'B', number> = { A: 0, B: 0 }
    for (const letra of ['A', 'B'] as const) {
      const fila = await base.create({
        collection: 'instituciones',
        data: {
          nombre: `Barrera ${letra} ${marca}`,
          subdominio: subdominio[letra],
          modalidad: 'piloto',
          inicio: new Date().toISOString(),
          cupo: 10,
          correoDelAdministrador: `barrera-${letra}-${marca}@prueba.invalid`,
        },
        overrideAccess: true,
      })
      instituciones[letra] = Number(fila.id)
      borrar.push({ coleccion: 'instituciones', id: Number(fila.id) })
    }
    const cuentas = { cuentaCentral: null, cuentaA: instituciones.A, cuentaB: instituciones.B }
    for (const [nombre, institucion] of Object.entries(cuentas)) {
      const fila = await base.create({
        collection: 'usuarios',
        data: {
          nombre: `${nombre} ${marca}`,
          email: `${nombre.toLowerCase()}-${marca}@prueba.invalid`,
          password: randomBytes(18).toString('base64url'),
          rol: 'lector',
          activo: true,
          institucion,
        } as never,
        overrideAccess: true,
      })
      ids[nombre] = Number(fila.id)
      borrar.push({ coleccion: 'usuarios', id: Number(fila.id) })
    }
    const segmento = await base.create({ collection: 'segmentos', data: { nombre: `Barrera ${marca}`, orden: 995 }, overrideAccess: true })
    borrar.push({ coleccion: 'segmentos', id: Number(segmento.id) })
    const fichas = {
      centralPublicada: { institucion: null, publicada: true },
      centralBorrador: { institucion: null, publicada: false },
      fichaA: { institucion: instituciones.A, publicada: true },
      fichaB: { institucion: instituciones.B, publicada: true },
    }
    for (const [nombre, { institucion, publicada }] of Object.entries(fichas)) {
      const fila = await base.create({
        collection: 'patologias',
        data: { nombre: `${nombre} ${marca}`, segmento: segmento.id, institucion, _status: publicada ? 'published' : 'draft' } as never,
        draft: !publicada,
        overrideAccess: true,
      })
      ids[nombre] = Number(fila.id)
      borrar.push({ coleccion: 'patologias', id: Number(fila.id) })
    }
    for (const [nombre, cuenta] of [
      ['entradaCentral', 'cuentaCentral'],
      ['entradaA', 'cuentaA'],
      ['entradaB', 'cuentaB'],
    ] as const) {
      const fila = await base.create({
        collection: 'entradas',
        data: { fecha: new Date().toISOString(), usuario: ids[cuenta], equipo: `barrera ${marca}` },
        overrideAccess: true,
      })
      ids[nombre] = Number(fila.id)
      borrar.push({ coleccion: 'entradas', id: Number(fila.id) })
    }

    // Un pool propio de una sola conexión: así cada prueba usa la misma, y se
    // ve también que cambia de lugar al cambiar la petición.
    const { Pool } = (base.db as unknown as { pg: { Pool: new (o: object) => PoolDePg } }).pg
    pool = new Pool({ connectionString: process.env.DATABASE_URI, max: 1 })
    ponerBarrera(pool, () => lugar)
  }, 120_000)

  afterAll(async () => {
    await pool?.end()
    for (const { coleccion, id } of borrar.reverse()) {
      await base.delete({ collection: coleccion, id, overrideAccess: true }).catch(() => undefined)
    }
  })

  const fichasDePrueba = () => [ids.centralPublicada, ids.centralBorrador, ids.fichaA, ids.fichaB]

  it('desde una institución, el contenido: lo central publicado y lo suyo', async () => {
    const { rows } = await desde(subdominio.A, 'SELECT id FROM patologias WHERE id = ANY($1)', [fichasDePrueba()])
    expect(nombres(rows)).toEqual(['centralPublicada', 'fichaA'])
  })

  it('y de las versiones, igual: el borrador central y lo de la otra no aparecen', async () => {
    const { rows } = await desde(subdominio.A, 'SELECT DISTINCT parent_id FROM _patologias_v WHERE parent_id = ANY($1)', [
      fichasDePrueba(),
    ])
    expect(nombres(rows, 'parent_id')).toEqual(['centralPublicada', 'fichaA'])
  })

  it('las cuentas: las centrales y las suyas', async () => {
    const { rows } = await desde(subdominio.B, 'SELECT id FROM usuarios WHERE email LIKE $1', [`%-${marca}@prueba.invalid`])
    expect(nombres(rows)).toEqual(['cuentaB', 'cuentaCentral'])
  })

  it('lo personal: solo lo suyo, ni siquiera lo central', async () => {
    const { rows } = await desde(subdominio.A, 'SELECT id FROM entradas WHERE equipo = $1', [`barrera ${marca}`])
    expect(nombres(rows)).toEqual(['entradaA'])
  })

  it('escribe solo lo suyo: lo central y lo ajeno no se tocan, sin error', async () => {
    const cambiar = (id: number) =>
      desde(subdominio.A, 'UPDATE patologias SET nombre = nombre WHERE id = $1', [id]).then((r) => r.rowCount)
    expect(await cambiar(ids.centralPublicada)).toBe(0)
    expect(await cambiar(ids.fichaB)).toBe(0)
    expect(await cambiar(ids.fichaA)).toBe(1)
    const borrada = await desde(subdominio.A, 'DELETE FROM entradas WHERE id = $1', [ids.entradaB])
    expect(borrada.rowCount).toBe(0)
  })

  it('y no crea filas de otro lugar: eso sí es un error', async () => {
    await expect(
      desde(
        subdominio.A,
        `INSERT INTO entradas (fecha, usuario_id, equipo, institucion_id)
         SELECT now(), $1, 'intruso', institucion_id FROM usuarios WHERE id = $1`,
        [ids.cuentaCentral],
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('un subdominio sin institución ve solo lo central publicado, y nada personal', async () => {
    const fichas = await desde(`nadie${marca}`, 'SELECT id FROM patologias WHERE id = ANY($1)', [fichasDePrueba()])
    expect(nombres(fichas.rows)).toEqual(['centralPublicada'])
    const entradas = await desde(`nadie${marca}`, 'SELECT id FROM entradas WHERE equipo = $1', [`barrera ${marca}`])
    expect(entradas.rows).toEqual([])
  })

  it('en la central no hay barrera, y la misma conexión vuelve a verlo todo', async () => {
    await desde(subdominio.A, 'SELECT 1')
    const { rows } = await desde('', 'SELECT id FROM patologias WHERE id = ANY($1)', [fichasDePrueba()])
    expect(nombres(rows)).toEqual(['centralBorrador', 'centralPublicada', 'fichaA', 'fichaB'])
    const quien = await desde('', 'SELECT current_user AS rol')
    expect(quien.rows[0].rol).not.toBe('traumahub_app')
  })

  it('el último administrador de TraumaHub no se va aunque queden de instituciones', async () => {
    // Una institución con su administrador activo, y todos los de TraumaHub
    // desactivados en una transacción: el disparador la deshace al confirmar.
    const admin = await base.create({
      collection: 'usuarios',
      data: {
        nombre: `Admin A ${marca}`,
        email: `admin-a-${marca}@prueba.invalid`,
        password: randomBytes(18).toString('base64url'),
        rol: 'admin',
        activo: true,
        institucion: borrar.find((b) => b.coleccion === 'instituciones')!.id,
      } as never,
      overrideAccess: true,
    })
    borrar.push({ coleccion: 'usuarios', id: Number(admin.id) })
    lugar = ''
    const conexion = await pool.connect()
    try {
      await conexion.query('BEGIN')
      await conexion.query(`UPDATE usuarios SET activo = false WHERE rol = 'admin' AND activo AND institucion_id IS NULL`)
      await expect(conexion.query('COMMIT')).rejects.toThrow(/sin ningún administrador activo/)
    } finally {
      await conexion.query('ROLLBACK').catch(() => undefined)
      conexion.release()
    }
  })
})
