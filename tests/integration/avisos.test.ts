import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { ponerBarrera, type PoolDeLaBase } from '@/lib/barreraDeInstitucion'
import { avisosDeLaCuenta } from '@/lib/avisosServidor'
import { olvidarAvisos } from '@/lib/avisosEnMemoria'
import { destinatariosDe } from '@/correo/difusion'

/**
 * Los avisos de la plataforma y los lugares de una difusión, contra la base de
 * verdad (P-016 E6, D-375, D-406).
 *
 * Las reglas en memoria están en `tests/unit/avisosDeLaPlataforma.test.ts`.
 * Aquí, lo que solo la base puede decir: que la condición de los lugares
 * elige las cuentas que debe, que la lectura de un aviso queda en el lugar de
 * su cuenta, que la barrera (D-399) no deja ver ni escribir lecturas de otra
 * institución y que ninguna tabla con columna de institución se quedó sin
 * ella. Esa última es la que habría fallado si la migración de E6 hubiera
 * creado `lecturas_de_avisos` sin sus políticas: el rol de la aplicación tiene
 * permiso sobre las tablas nuevas, y sin políticas las leería enteras.
 *
 * Necesita la base migrada (`npm run db:migrate`).
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

describe.skipIf(payload === null)('los avisos de la plataforma, en PostgreSQL (D-406)', () => {
  const base = payload as Payload
  let pool: PoolDePg
  let lugar = ''
  const subdominio = { A: `avisoa${marca}`, B: `avisob${marca}` }
  const instituciones = { A: 0, B: 0 }
  const cuentas = {} as Record<'central' | 'deA' | 'deB', Record<string, unknown>>
  const difusiones = {} as Record<'paraTodos' | 'soloA' | 'vencido' | 'soloCorreo', number>
  const borrar: { coleccion: 'instituciones' | 'usuarios' | 'difusiones' | 'lecturas-de-avisos'; id: number }[] = []

  const desde = async (donde: string, texto: string, valores?: unknown[]) => {
    lugar = donde
    return pool.query(texto, valores)
  }
  const nuestros = (avisos: { id: string }[]) =>
    avisos.map((a) => a.id).filter((id) => Object.values(difusiones).includes(Number(id)))
  const usuariosDe = (filas: Record<string, unknown>[]) =>
    filas.map((f) => Number(f.usuario_id)).sort((a, b) => a - b)

  beforeAll(async () => {
    for (const letra of ['A', 'B'] as const) {
      const fila = await base.create({
        collection: 'instituciones',
        data: {
          nombre: `Avisos ${letra} ${marca}`,
          subdominio: subdominio[letra],
          modalidad: 'piloto',
          inicio: new Date().toISOString(),
          cupo: 10,
          correoDelAdministrador: `avisos-${letra}-${marca}@prueba.invalid`,
        },
        overrideAccess: true,
      })
      instituciones[letra] = Number(fila.id)
      borrar.push({ coleccion: 'instituciones', id: Number(fila.id) })
    }
    for (const [nombre, institucion, rol] of [
      ['central', null, 'lector'],
      ['deA', instituciones.A, 'lector'],
      ['deB', instituciones.B, 'editor'],
    ] as const) {
      const fila = await base.create({
        collection: 'usuarios',
        data: {
          nombre: `${nombre} ${marca}`,
          email: `aviso-${nombre.toLowerCase()}-${marca}@prueba.invalid`,
          password: randomBytes(18).toString('base64url'),
          rol,
          activo: true,
          institucion,
        } as never,
        overrideAccess: true,
      })
      cuentas[nombre] = fila as unknown as Record<string, unknown>
      borrar.push({ coleccion: 'usuarios', id: Number(fila.id) })
    }
    const enUnaSemana = new Date(Date.now() + 7 * 86_400_000).toISOString()
    for (const [nombre, datos] of [
      ['paraTodos', { comoAviso: true, avisoHasta: enUnaSemana, lugares: null }],
      ['soloA', { comoAviso: true, avisoHasta: enUnaSemana, lugares: [String(instituciones.A)] }],
      ['vencido', { comoAviso: true, avisoHasta: new Date(Date.now() - 60_000).toISOString(), lugares: null }],
      ['soloCorreo', { comoAviso: false, avisoHasta: null, lugares: null }],
    ] as const) {
      const fila = await base.create({
        collection: 'difusiones',
        data: {
          asunto: `${nombre} ${marca}`,
          mensaje: 'Texto del aviso.',
          audiencia: 'todas',
          porCorreo: !datos.comoAviso,
          ...datos,
          estado: 'enviada',
          total: 0,
          enviados: 0,
          fallidos: 0,
          pendientes: [],
          fallos: [],
        } as never,
        overrideAccess: true,
      })
      difusiones[nombre] = Number(fila.id)
      borrar.push({ coleccion: 'difusiones', id: Number(fila.id) })
    }

    const { Pool } = (base.db as unknown as { pg: { Pool: new (o: object) => PoolDePg } }).pg
    pool = new Pool({ connectionString: process.env.DATABASE_URI, max: 1 })
    ponerBarrera(pool, () => lugar)
  }, 120_000)

  afterAll(async () => {
    await pool?.end()
    olvidarAvisos()
    for (const { coleccion, id } of borrar.reverse()) {
      await base.delete({ collection: coleccion, id, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('cada cuenta ve en la campana los vigentes que le llegan por lugar', async () => {
    olvidarAvisos()
    expect(nuestros(await avisosDeLaCuenta(base, cuentas.central))).toEqual([String(difusiones.paraTodos)])
    expect(nuestros(await avisosDeLaCuenta(base, cuentas.deA)).sort()).toEqual(
      [String(difusiones.paraTodos), String(difusiones.soloA)].sort(),
    )
    expect(nuestros(await avisosDeLaCuenta(base, cuentas.deB))).toEqual([String(difusiones.paraTodos)])
  })

  it('la cola del correo elige por lugar lo mismo que la campana', async () => {
    const ids = (lista: { id: number | string }[]) =>
      lista.map((d) => Number(d.id)).filter((id) => Object.values(cuentas).some((c) => Number(c.id) === id))
    expect(ids(await destinatariosDe(base, 'todas', ['traumahub']))).toEqual([Number(cuentas.central.id)])
    expect(ids(await destinatariosDe(base, 'todas', [String(instituciones.A), String(instituciones.B)]))).toEqual([
      Number(cuentas.deA.id),
      Number(cuentas.deB.id),
    ])
    expect(ids(await destinatariosDe(base, 'editor', [String(instituciones.A), String(instituciones.B)]))).toEqual([
      Number(cuentas.deB.id),
    ])
  })

  it('la lectura queda en el lugar de su cuenta, y la barrera no la deja ver ni escribir desde otro', async () => {
    for (const cuenta of [cuentas.deA, cuentas.deB, cuentas.central]) {
      const fila = await base.create({
        collection: 'lecturas-de-avisos',
        data: { usuario: Number(cuenta.id), difusion: difusiones.paraTodos, leidaEn: new Date().toISOString() },
        overrideAccess: true,
        depth: 0,
      })
      borrar.push({ coleccion: 'lecturas-de-avisos', id: Number(fila.id) })
    }
    const consulta = 'SELECT usuario_id, institucion_id FROM lecturas_de_avisos WHERE difusion_id = $1'

    const enA = await desde(subdominio.A, consulta, [difusiones.paraTodos])
    expect(usuariosDe(enA.rows)).toEqual([Number(cuentas.deA.id)])
    expect(enA.rows[0].institucion_id).toBe(instituciones.A)
    expect(usuariosDe((await desde(subdominio.B, consulta, [difusiones.paraTodos])).rows)).toEqual([
      Number(cuentas.deB.id),
    ])
    // La central no pasa por la barrera: ve las tres, la suya sin institución.
    expect((await desde('', consulta, [difusiones.paraTodos])).rows).toHaveLength(3)

    // Desde A no se escribe una lectura de B, ni se borra la de B.
    await expect(
      desde(subdominio.A, 'INSERT INTO lecturas_de_avisos (usuario_id, difusion_id, institucion_id) VALUES ($1, $2, $3)', [
        cuentas.deB.id,
        difusiones.soloA,
        instituciones.B,
      ]),
    ).rejects.toThrow(/row-level security/)
    const borradas = await desde(subdominio.A, 'DELETE FROM lecturas_de_avisos WHERE usuario_id = $1', [cuentas.deB.id])
    expect(borradas.rowCount).toBe(0)
  })

  it('el aviso cerrado sale leído, y cerrarlo dos veces no deja otra fila', async () => {
    olvidarAvisos()
    const avisos = await avisosDeLaCuenta(base, cuentas.deA)
    expect(avisos.find((a) => a.id === String(difusiones.paraTodos))?.leido).toBe(true)
    expect(avisos.find((a) => a.id === String(difusiones.soloA))?.leido).toBe(false)

    await expect(
      base.create({
        collection: 'lecturas-de-avisos',
        data: { usuario: Number(cuentas.deA.id), difusion: difusiones.paraTodos, leidaEn: new Date().toISOString() },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('ninguna tabla con columna de institución se quedó sin la barrera', async () => {
    const { rows } = await desde(
      '',
      `SELECT c.relname AS tabla, c.relrowsecurity AS barrera,
              (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname LIKE 'traumahub_%') AS politicas
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE a.attname IN ('institucion_id', 'version_institucion_id')
          AND NOT a.attisdropped
          AND c.relkind = 'r'
          AND c.relnamespace = 'public'::regnamespace`,
    )
    expect(rows.map((f) => f.tabla)).toContain('lecturas_de_avisos')
    const sinBarrera = rows.filter((f) => f.barrera !== true || f.politicas !== 4).map((f) => f.tabla)
    expect(sinBarrera).toEqual([])
  })
})
