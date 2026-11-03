import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ultimosMeses } from '@/lib/series'
import type { Respaldo } from '@/lib/respaldos'
import { repartoDeCuentas } from '@/app/(frontend)/admin-panel/usuarios/tablero'
import { modulosAlAlcance } from '@/app/(frontend)/admin-panel/usuarios/TablaUsuarios'
import { corridasDe, cuandoFue, puntosDeTamano, totalDe } from '@/app/(frontend)/admin-panel/respaldos/tablero'
import { pesoDeCarpeta } from '@/app/(frontend)/admin-panel/sistema/espacio'

/**
 * Las cuentas que hacen las cifras de las pestañas de administración (P-007
 * E5, D-238): Usuarios y permisos, Respaldos y Sistema.
 *
 * Lo que se vigila es que cada cifra cuente lo que dice contar. Una dona que
 * metiera las solicitudes sin revisar entre las cuentas activas, o un gráfico
 * de respaldos que sumara dos veces la misma noche, se verían perfectamente
 * bien en pantalla y dirían otra cosa que el Resumen.
 */

describe('las cuentas por rol y las altas de cada mes', () => {
  const hoy = new Date(2026, 10, 3, 12)
  const meses = ultimosMeses(6, hoy)

  it('cuenta solo las cuentas revisadas, como el Resumen, y separa las que no tienen acceso', () => {
    const tablero = repartoDeCuentas(
      [
        { rol: 'lector', activo: true, pendiente: false, createdAt: '2026-11-01T12:00:00.000Z' },
        { rol: 'lector', activo: true, createdAt: '2026-10-15T12:00:00.000Z' },
        { rol: 'editor', activo: true, createdAt: '2026-10-02T12:00:00.000Z' },
        { rol: 'admin', activo: true, createdAt: '2026-06-20T12:00:00.000Z' },
        { rol: 'lector', activo: false, createdAt: '2026-09-10T12:00:00.000Z' },
        // Una solicitud sin revisar no es una cuenta todavía: ni activa, ni
        // sin acceso, ni alta del mes.
        { rol: 'lector', activo: false, pendiente: true, createdAt: '2026-11-02T12:00:00.000Z' },
      ],
      meses,
    )

    expect(tablero.activas).toBe(4)
    expect(tablero.sinAcceso).toBe(1)
    expect(tablero.porRol).toEqual({ lector: 2, editor: 1, admin: 1 })
    expect(meses.map((m) => m.clave)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect(tablero.altas).toEqual([1, 0, 0, 1, 2, 1])
  })

  it('una cuenta de antes de los seis meses no cae en ningún mes', () => {
    const tablero = repartoDeCuentas([{ rol: 'admin', activo: true, createdAt: '2025-01-01T12:00:00.000Z' }], meses)
    expect(tablero.activas).toBe(1)
    expect(tablero.altas).toEqual([0, 0, 0, 0, 0, 0])
  })
})

describe('los módulos al alcance de cada cuenta', () => {
  const nombres = (r: ReturnType<typeof modulosAlAlcance>) => r.modulos.map((m) => m.slug)

  it('el administrador edita todo, aunque le hayan quedado listas guardadas', () => {
    const r = modulosAlAlcance({ rol: 'admin', modulosVisibles: ['cirugias'], modulosEditables: ['cirugias'] })
    expect(r.verbo).toBe('Edita')
    expect(r.modulos).toHaveLength(5)
  })

  it('el lector lee los visibles, y una lista vacía son todos', () => {
    expect(nombres(modulosAlAlcance({ rol: 'lector', modulosVisibles: ['cirugias'], modulosEditables: [] }))).toEqual([
      'cirugias',
    ])
    const todos = modulosAlAlcance({ rol: 'lector', modulosVisibles: [], modulosEditables: [] })
    expect(todos.verbo).toBe('Lee')
    expect(todos.modulos).toHaveLength(5)
  })

  it('el editor edita lo que ve y tiene asignado, no lo asignado que no ve', () => {
    // La misma intersección que `puedeEditar`: un módulo editable que no es
    // visible no se puede abrir para editarlo.
    const r = modulosAlAlcance({
      rol: 'editor',
      modulosVisibles: ['patologias', 'cirugias'],
      modulosEditables: ['cirugias', 'maniobras'],
    })
    expect(r.verbo).toBe('Edita')
    expect(nombres(r)).toEqual(['cirugias'])
  })
})

describe('los respaldos agrupados por la noche en que se hicieron', () => {
  const respaldo = (nombre: string, bytes: number, creado: string): Respaldo => ({
    nombre,
    bytes,
    creado,
    tipo: nombre.startsWith('base-') ? 'base' : 'medios',
  })

  // `listarRespaldos` las da de la más reciente a la más antigua.
  const lista = [
    respaldo('medios-20261103-033002.tar.gz', 3_000_000, new Date(2026, 10, 3, 3, 30, 2).toISOString()),
    respaldo('base-20261103-033002.sql.gz', 1_000_000, new Date(2026, 10, 3, 3, 30, 2).toISOString()),
    respaldo('base-20261102-151200.sql.gz', 900_000, new Date(2026, 10, 2, 15, 12).toISOString()),
    // Unos medios sin su base no restauran nada: no cuentan como respaldo.
    respaldo('medios-20261101-033001.tar.gz', 2_000_000, new Date(2026, 10, 1, 3, 30, 1).toISOString()),
  ]

  it('une la base y los medios de la misma marca, y descarta los medios sueltos', () => {
    const corridas = corridasDe(lista)
    expect(corridas.map((c) => c.marca)).toEqual(['20261102-151200', '20261103-033002'])
    expect(corridas[0].medios).toBeNull()
    expect(totalDe(corridas[0])).toBe(900_000)
    expect(totalDe(corridas[1])).toBe(4_000_000)
  })

  it('un punto por respaldo dentro de la ventana, sin días a cero en medio', () => {
    const puntos = puntosDeTamano(corridasDe(lista), 30, 1_000_000, new Date(2026, 10, 3, 12))
    expect(puntos).toHaveLength(2)
    expect(puntos[0]).toMatchObject({ etiqueta: '2 nov', total: 0.9, base: 0.9 })
    expect(puntos[0].detalle).toContain('15:12')
    expect(puntos[0].detalle).toContain('solo la base')
    expect(puntos[1]).toMatchObject({ etiqueta: '3 nov', total: 4, base: 1 })

    // Fuera de la ventana no se dibuja.
    expect(puntosDeTamano(corridasDe(lista), 1, 1, new Date(2026, 10, 3, 12))).toHaveLength(1)
  })

  it('dice «hoy» delante de la hora, y reconoce un respaldo fechado por delante del reloj', () => {
    const ahora = new Date(2026, 10, 3, 12)
    expect(cuandoFue(new Date(2026, 10, 3, 3, 30).toISOString(), ahora)).toEqual({ texto: 'hoy 03:30', delFuturo: false })
    expect(cuandoFue(new Date(2026, 10, 2, 3, 30).toISOString(), ahora).texto).toBe('ayer, 03:30')
    // El guion y la aplicación en zonas distintas: el respaldo de esta noche
    // queda horas por delante, y no es «recién».
    expect(cuandoFue(new Date(2026, 10, 3, 16).toISOString(), ahora).delFuturo).toBe(true)
  })
})

describe('el peso de una carpeta', () => {
  let raiz = ''

  beforeAll(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'peso-de-carpeta-'))
    await mkdir(join(raiz, 'pagina'), { recursive: true })
    await writeFile(join(raiz, 'a.bin'), Buffer.alloc(100))
    await writeFile(join(raiz, 'pagina', 'b.bin'), Buffer.alloc(250))
    await writeFile(join(raiz, 'pagina', 'c.bin'), Buffer.alloc(50))
  })

  afterAll(async () => {
    await rm(raiz, { recursive: true, force: true })
  })

  it('suma lo de dentro, subcarpetas incluidas', async () => {
    expect(await pesoDeCarpeta(raiz)).toEqual({ bytes: 400, archivos: 3, completo: true })
  })

  it('una carpeta que no existe pesa cero, no es un fallo', async () => {
    expect(await pesoDeCarpeta(join(raiz, 'no-existe'))).toEqual({ bytes: 0, archivos: 0, completo: true })
  })

  it('con el tope alcanzado dice que la cifra se queda corta', async () => {
    const medida = await pesoDeCarpeta(raiz, 2)
    expect(medida?.completo).toBe(false)
    expect(medida?.archivos).toBe(2)
  })
})
