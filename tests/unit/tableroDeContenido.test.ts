import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import {
  altasPorMes,
  conteoDelModulo,
  contarPorFicha,
  cuentasDeLasVistas,
  DIAS_DE_LECTURA,
  lecturasDeLosModulos,
  lecturasPorFicha,
  masRecientes,
  MESES_DE_ALTAS,
  repartirPorModulo,
  resumenDeApoyo,
  type FichaReciente,
} from '@/app/(frontend)/admin-panel/contenido/tablero'
import { ESTADOS_DE_REVISION_DE_LA_VISTA, VISTAS_DEL_LISTADO, vistaDe } from '@/app/(frontend)/admin-panel/contenido/vistas'
import { ultimosDias } from '@/lib/series'

/**
 * Lo que «Contenido» y el listado de cada módulo cuentan además de sus fichas
 * (P-007 E5, D-238).
 *
 * Lo que más se vigila es que cada número diga lo mismo que la pantalla a la
 * que lleva: la cuenta de una pestaña, con las mismas condiciones con que el
 * listado abre sus filas —la última versión de cada ficha, los mismos estados
 * de revisión—, y las lecturas, con el mismo filtro de aperturas que el
 * Resumen. Y que una consulta que falla diga `null`, no cero.
 */

const hoy = new Date(2026, 10, 3, 16, 0) // martes 3 de noviembre de 2026, hora local
const haceDias = (n: number, hora = 10) => new Date(2026, 10, 3 - n, hora, 0).toISOString()

type Argumentos = { collection: string; where?: unknown; draft?: boolean; limit?: number; sort?: string }

/**
 * Una base de mentira: `responder` decide qué contesta cada consulta. `count`
 * y `find` pasan por la misma función, porque `leerTodas` cuenta primero y
 * pide después.
 */
function payloadFalso(responder: (operacion: 'count' | 'find', a: Argumentos) => { docs?: unknown[]; total?: number }) {
  const count = vi.fn(async (a: Argumentos) => {
    const r = responder('count', a)
    return { totalDocs: r.total ?? r.docs?.length ?? 0 }
  })
  const find = vi.fn(async (a: Argumentos) => {
    const r = responder('find', a)
    return { docs: r.docs ?? [], totalDocs: r.total ?? r.docs?.length ?? 0 }
  })
  return { payload: { count, find } as unknown as Payload, count, find }
}

const fallar = () => {
  throw new Error('la base no contesta')
}

describe('vistaDe', () => {
  it('cada pestaña se reconoce a partir de sus dos filtros', () => {
    for (const v of VISTAS_DEL_LISTADO) expect(vistaDe(v.estado, v.revision)).toBe(v.id)
  })

  it('lo que no es ninguna pestaña no marca ninguna', () => {
    expect(vistaDe('todos', 'mias')).toBeNull()
    expect(vistaDe('publicado', 'listas')).toBeNull()
    expect(vistaDe('borrador', 'devueltas')).toBeNull()
  })
})

describe('las pestañas filtran los mismos estados de revisión que el listado', () => {
  // `ESTADOS_DEL_FILTRO` no se exporta: es de una acción de servidor, que no
  // debe dar a importar más que sus funciones. Se lee del texto.
  const fuente = readFileSync(join(process.cwd(), 'src/app/(frontend)/acciones/contenido.ts'), 'utf8')
  const bloque = fuente.match(/const ESTADOS_DEL_FILTRO[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const estadosDelFiltro = Object.fromEntries(
    [...bloque.matchAll(/'?([\w-]+)'?:\s*\[([^\]]*)\]/g)].map(([, clave, lista]) => [
      clave,
      [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]),
    ]),
  )

  it('se pudo leer la tabla de la acción', () => {
    expect(Object.keys(estadosDelFiltro)).toContain('por-revisar')
  })

  for (const v of VISTAS_DEL_LISTADO) {
    const estados = ESTADOS_DE_REVISION_DE_LA_VISTA[v.id]
    if (!estados) continue
    it(`«${v.etiqueta}» cuenta los estados con que el listado la abre`, () => {
      expect(estados).toEqual(estadosDelFiltro[v.revision])
    })
  }

  it('las pestañas sin filtro de revisión no cuentan estados de revisión', () => {
    for (const v of VISTAS_DEL_LISTADO) {
      if (v.revision === 'todas') expect(ESTADOS_DE_REVISION_DE_LA_VISTA[v.id]).toBeUndefined()
    }
  })
})

describe('cuentasDeLasVistas', () => {
  const esquema = { slug: 'patologias', versionada: true }
  const revisiones = [
    { documentoId: '1', estado: 'lista' },
    { documentoId: '2', estado: 'pendiente' },
    { documentoId: '3', estado: 'devuelta' },
    { documentoId: '4', estado: 'publicada' },
  ]

  it('cuenta como el listado: la última versión de cada ficha, y las de revisión por sus identificadores', async () => {
    const { payload, find } = payloadFalso((operacion, a) => {
      if (a.collection === 'revisiones') return { docs: revisiones }
      const where = JSON.stringify(a.where ?? null)
      if (where.includes('published')) return { total: 3 }
      if (where.includes('draft')) return { total: 6 }
      if (where.includes('"in"')) return { total: (a.where as { id: { in: number[] } }).id.in.length }
      return { total: 9 }
    })
    expect(await cuentasDeLasVistas(payload, esquema)).toEqual({
      todas: 9,
      publicadas: 3,
      validadas: 1,
      'por-revisar': 2,
      borradores: 6,
    })
    // Con `find` y `draft`, no con `count`: una publicada con un borrador
    // encima es borrador en el listado.
    const delModulo = find.mock.calls.map(([a]) => a).filter((a) => a.collection === 'patologias')
    expect(delModulo).toHaveLength(5)
    for (const a of delModulo) expect(a.draft).toBe(true)
    expect(delModulo.filter((a) => JSON.stringify(a.where ?? null).includes('"in"')).map((a) => a.where)).toEqual([
      { id: { in: [1] } },
      { id: { in: [2, 3] } },
    ])
  })

  it('una pestaña de revisión sin fichas es cero sin preguntar, no un `in` vacío', async () => {
    const { payload, find } = payloadFalso((_, a) =>
      a.collection === 'revisiones' ? { docs: [{ documentoId: '4', estado: 'publicada' }] } : { total: 2 },
    )
    const cuentas = await cuentasDeLasVistas(payload, esquema)
    expect(cuentas.validadas).toBe(0)
    expect(cuentas['por-revisar']).toBe(0)
    expect(find.mock.calls.some(([a]) => JSON.stringify(a.where ?? null).includes('"in"'))).toBe(false)
  })

  it('si las revisiones no contestan, sus pestañas no tienen cuenta y las demás sí', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { payload } = payloadFalso((_, a) => (a.collection === 'revisiones' ? fallar() : { total: 4 }))
    const cuentas = await cuentasDeLasVistas(payload, esquema)
    expect(cuentas.validadas).toBeNull()
    expect(cuentas['por-revisar']).toBeNull()
    expect(cuentas.todas).toBe(4)
    error.mockRestore()
  })
})

describe('conteoDelModulo', () => {
  it('cuenta las publicadas en el sitio con `count`, sobre el documento principal', async () => {
    const { payload, count } = payloadFalso((_, a) => ({ total: a.where ? 2 : 7 }))
    expect(await conteoDelModulo(payload, 'maniobras')).toEqual({ publicadas: 2, total: 7 })
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: { _status: { equals: 'published' } } }))
  })

  it('si una de las dos no contesta no hay conteo, en vez de un porcentaje inventado', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { payload } = payloadFalso((_, a) => (a.where ? fallar() : { total: 7 }))
    expect(await conteoDelModulo(payload, 'maniobras')).toBeNull()
    error.mockRestore()
  })
})

describe('las lecturas', () => {
  it('reparte las aperturas por módulo y por día, sin lo de otros módulos ni lo de fuera de los días', () => {
    const dias = ultimosDias(3, hoy)
    const r = repartirPorModulo(
      [
        { coleccion: 'patologias', fecha: haceDias(0) },
        { coleccion: 'patologias', fecha: haceDias(0, 9) },
        { coleccion: 'patologias', fecha: haceDias(2) },
        { coleccion: 'patologias', fecha: haceDias(3) },
        { coleccion: 'maniobras', fecha: haceDias(1) },
        { coleccion: 'equipo', fecha: haceDias(1) },
      ],
      ['patologias', 'maniobras'],
      dias,
    )
    expect(r).toEqual({ patologias: [1, 0, 2], maniobras: [0, 1, 0] })
  })

  it('cuenta las aperturas de cada ficha y salta las que no dicen de cuál', () => {
    expect(contarPorFicha([{ documentoId: '7' }, { documentoId: '7' }, { documentoId: '9' }, { documentoId: '' }, {}])).toEqual({
      7: 2,
      9: 1,
    })
  })

  it('pide solo las aperturas —con «la abrió» o sin detalle— desde la medianoche del primero de los treinta días', async () => {
    const { payload, find } = payloadFalso(() => ({ docs: [{ documentoId: '5' }, { documentoId: '5' }] }))
    expect(await lecturasPorFicha(payload, 'patologias', hoy)).toEqual({ 5: 2 })
    const where = JSON.stringify(find.mock.calls[0][0].where)
    expect(where).toContain('{"accion":{"equals":"lectura"}}')
    expect(where).toContain('{"detalle":{"equals":"la abrió"}}')
    expect(where).toContain('{"detalle":{"exists":false}}')
    expect(where).toContain('{"coleccion":{"equals":"patologias"}}')
    const desde = new Date(2026, 10, 3 - (DIAS_DE_LECTURA - 1)).toISOString()
    expect(where).toContain(`{"fecha":{"greater_than_equal":"${desde}"}}`)
  })

  it('las de los módulos, día a día, y sin módulos no pregunta', async () => {
    const { payload, find } = payloadFalso(() => ({
      docs: [
        { coleccion: 'patologias', fecha: haceDias(0) },
        { coleccion: 'maniobras', fecha: haceDias(29) },
      ],
    }))
    const r = await lecturasDeLosModulos(payload, ['patologias', 'maniobras'], hoy)
    expect(r?.dias).toHaveLength(DIAS_DE_LECTURA)
    expect(r?.porModulo.patologias.at(-1)).toBe(1)
    expect(r?.porModulo.maniobras[0]).toBe(1)

    find.mockClear()
    expect((await lecturasDeLosModulos(payload, [], hoy))?.porModulo).toEqual({})
    expect(find).not.toHaveBeenCalled()
  })

  it('si el registro no contesta, `null` y no una columna de ceros', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { payload } = payloadFalso(fallar)
    expect(await lecturasPorFicha(payload, 'patologias', hoy)).toBeNull()
    expect(await lecturasDeLosModulos(payload, ['patologias'], hoy)).toBeNull()
    error.mockRestore()
  })
})

describe('altasPorMes', () => {
  it('cuenta las fichas de todos los módulos por el mes en que se crearon', async () => {
    const { payload } = payloadFalso((_, a) =>
      a.collection === 'patologias'
        ? { docs: [{ createdAt: haceDias(1) }, { createdAt: new Date(2026, 9, 15).toISOString() }] }
        : { docs: [{ createdAt: haceDias(2) }, { createdAt: new Date(2025, 0, 1).toISOString() }] },
    )
    const r = await altasPorMes(payload, ['patologias', 'maniobras'], hoy)
    expect(r?.meses).toHaveLength(MESES_DE_ALTAS)
    expect(r?.meses.at(-1)?.clave).toBe('2026-11')
    expect(r?.valores.at(-1)).toBe(2)
    expect(r?.valores.at(-2)).toBe(1)
    expect(r?.valores.reduce((t, v) => t + v, 0)).toBe(3)
  })

  it('si un módulo no contesta, no hay gráfico', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { payload } = payloadFalso((_, a) => (a.collection === 'maniobras' ? fallar() : { docs: [] }))
    expect(await altasPorMes(payload, ['patologias', 'maniobras'], hoy)).toBeNull()
    error.mockRestore()
  })
})

describe('masRecientes', () => {
  const ficha = (id: string, editada: string | null): FichaReciente => ({
    coleccion: 'patologias',
    id,
    titulo: id,
    publicada: true,
    editada,
  })

  it('junta las listas de los módulos y deja las más nuevas primero', () => {
    const r = masRecientes([[ficha('a', haceDias(3)), ficha('b', null)], [ficha('c', haceDias(0)), ficha('d', haceDias(1))]], 3)
    expect(r.map((f) => f.id)).toEqual(['c', 'd', 'a'])
  })
})

describe('resumenDeApoyo', () => {
  it('filas, nuevas de la semana y la última edición', async () => {
    const editada = haceDias(2)
    const { payload, count } = payloadFalso((operacion, a) =>
      operacion === 'find' ? { docs: [{ updatedAt: editada }] } : { total: a.where ? 1 : 12 },
    )
    expect(await resumenDeApoyo(payload, 'segmentos', hoy)).toEqual({
      slug: 'segmentos',
      filas: 12,
      nuevas: 1,
      ultimaEdicion: editada,
    })
    const desde = new Date(2026, 10, 3 - 6).toISOString()
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: { createdAt: { greater_than_equal: desde } } }))
  })

  it('lo que no contesta queda sin cifra, y lo demás se enseña', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { payload } = payloadFalso((operacion, a) => (operacion === 'find' || a.where ? fallar() : { total: 12 }))
    expect(await resumenDeApoyo(payload, 'segmentos', hoy)).toEqual({
      slug: 'segmentos',
      filas: 12,
      nuevas: null,
      ultimaEdicion: null,
    })
    error.mockRestore()
  })
})
