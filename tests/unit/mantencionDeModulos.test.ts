import { describe, it, expect, vi } from 'vitest'
import {
  cerradoPorMantencion,
  filtroDeLecturaDeModulo,
  puedeEditarModulo,
  puedeVerModulo,
  SOLO_PUBLICADO,
  type UsuarioSesion,
} from '@/access/reglas'
import { creacionEnModuloVisible, lecturaDeModulo } from '@/access/payload'
import { comoListaDeModulos, leerMantencion } from '@/lib/mantencion'
import { cambiosDeMantencion } from '@/lib/registro'
import { Ajustes } from '@/collections/Ajustes'
import { COLECCIONES } from '@/collections'

/**
 * Módulos en mantención (D-156).
 *
 * Lo que se promete: un módulo en mantención desaparece para el **lector** y
 * para nadie más. El editor sigue viéndolo y escribiéndolo, porque la mantención
 * es justo cuando hay que entrar a arreglarlo, y el administrador siempre.
 */

const cuenta = (rol: UsuarioSesion['rol'], extra: Partial<UsuarioSesion> = {}): UsuarioSesion => ({
  id: '1',
  rol,
  activo: true,
  ...extra,
})

const MANTENCION = ['casos-ao']

describe('las reglas puras', () => {
  it('el lector no ve el módulo en mantención y sigue viendo los demás', () => {
    expect(puedeVerModulo(cuenta('lector'), 'casos-ao', MANTENCION)).toBe(false)
    expect(puedeVerModulo(cuenta('lector'), 'cirugias', MANTENCION)).toBe(true)
  })

  it('el editor y el administrador lo ven igual que siempre', () => {
    expect(puedeVerModulo(cuenta('editor'), 'casos-ao', MANTENCION)).toBe(true)
    expect(puedeVerModulo(cuenta('admin'), 'casos-ao', MANTENCION)).toBe(true)
  })

  it('el editor lo edita dentro de la mantención', () => {
    // E1-Q3: sin esto, la mantención impediría justo el trabajo para el que
    // existe. `puedeEditarModulo` no recibe la lista y así se queda.
    expect(puedeEditarModulo(cuenta('editor'), 'casos-ao')).toBe(true)
  })

  it('sin la lista, o con una vacía, todo se comporta como antes', () => {
    expect(puedeVerModulo(cuenta('lector'), 'casos-ao')).toBe(true)
    expect(puedeVerModulo(cuenta('lector'), 'casos-ao', [])).toBe(true)
  })

  it('una cuenta sin activar no ve nada, ni con mantención ni sin ella', () => {
    expect(puedeVerModulo({ ...cuenta('lector'), activo: false }, 'cirugias', MANTENCION)).toBe(false)
    expect(puedeVerModulo(null, 'cirugias', MANTENCION)).toBe(false)
  })

  it('el filtro de lectura del módulo cierra al lector y deja pasar al editor con borradores', () => {
    expect(filtroDeLecturaDeModulo(cuenta('lector'), 'casos-ao', MANTENCION)).toBe(false)
    expect(filtroDeLecturaDeModulo(cuenta('lector'), 'cirugias', MANTENCION)).toEqual(SOLO_PUBLICADO)
    expect(filtroDeLecturaDeModulo(cuenta('editor'), 'casos-ao', MANTENCION)).toBe(true)
    expect(filtroDeLecturaDeModulo(cuenta('admin'), 'casos-ao', MANTENCION)).toBe(true)
  })

  it('el administrador en «ver como residente» lo pierde de vista, que es para lo que sirve', () => {
    // El usuario efectivo de esa vista es la misma cuenta con rol de lector.
    expect(puedeVerModulo({ ...cuenta('admin'), rol: 'lector' }, 'casos-ao', MANTENCION)).toBe(false)
  })
})

describe('qué pantalla se le pinta a quien no entra', () => {
  it('«en mantención» al lector que de otro modo lo vería', () => {
    expect(cerradoPorMantencion(cuenta('lector'), 'casos-ao', MANTENCION)).toBe(true)
  })

  it('«no asignado» al lector al que además le falta el permiso', () => {
    // No hay nada que decirle de una mantención de un módulo que no era suyo.
    const restringido = cuenta('lector', { modulosVisibles: ['cirugias'] })
    expect(cerradoPorMantencion(restringido, 'casos-ao', MANTENCION)).toBe(false)
  })

  it('nunca para un editor ni para el administrador', () => {
    expect(cerradoPorMantencion(cuenta('editor'), 'casos-ao', MANTENCION)).toBe(false)
    expect(cerradoPorMantencion(cuenta('admin'), 'casos-ao', MANTENCION)).toBe(false)
  })

  it('ni cuando el módulo no está en la lista', () => {
    expect(cerradoPorMantencion(cuenta('lector'), 'cirugias', MANTENCION)).toBe(false)
  })
})

describe('leer la lista de la base', () => {
  const cliente = (docs: unknown[]) => ({ find: vi.fn(async () => ({ docs })) }) as never

  it('devuelve los módulos de la fila de ajustes', async () => {
    expect(await leerMantencion(cliente([{ modulosEnMantencion: ['casos-ao', 'estudios-ia'] }]))).toEqual([
      'casos-ao',
      'estudios-ia',
    ])
  })

  it('devuelve una lista vacía si nunca se tocó el interruptor', async () => {
    expect(await leerMantencion(cliente([]))).toEqual([])
    expect(await leerMantencion(cliente([{}]))).toEqual([])
  })

  it('lee con el acceso de la plataforma y la fila más antigua', async () => {
    const c = cliente([])
    await leerMantencion(c)
    expect((c as unknown as { find: ReturnType<typeof vi.fn> }).find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'ajustes', overrideAccess: true, sort: 'createdAt', limit: 1 }),
    )
  })

  it('descarta lo que no sea un texto', () => {
    expect(comoListaDeModulos(['casos-ao', 3, null, 'cirugias'])).toEqual(['casos-ao', 'cirugias'])
    expect(comoListaDeModulos(undefined)).toEqual([])
    expect(comoListaDeModulos('casos-ao')).toEqual([])
  })
})

describe('los adaptadores de Payload', () => {
  /** Una petición con un Payload falso que contesta la lista indicada. */
  const peticion = (user: unknown, enMantencion: string[]) => {
    const find = vi.fn(async () => ({ docs: [{ modulosEnMantencion: enMantencion }] }))
    return { req: { user, payload: { find }, context: {} as Record<string, unknown> }, find }
  }
  const lector = { id: 3, rol: 'lector', activo: true }
  const editor = { id: 4, rol: 'editor', activo: true }
  const admin = { id: 1, rol: 'admin', activo: true }

  it('la lectura cierra el módulo en mantención al lector', async () => {
    const { req } = peticion(lector, MANTENCION)
    expect(await lecturaDeModulo('casos-ao')({ req } as never)).toBe(false)
    expect(await lecturaDeModulo('cirugias')({ req } as never)).toEqual(SOLO_PUBLICADO)
  })

  it('al editor y al administrador no se les cierra, y ni siquiera se consulta la lista', async () => {
    for (const user of [editor, admin]) {
      const { req, find } = peticion(user, MANTENCION)
      expect(await lecturaDeModulo('casos-ao')({ req } as never)).toBe(true)
      expect(find).not.toHaveBeenCalled()
    }
  })

  it('una petición consulta la lista una sola vez, aunque lea varias colecciones', async () => {
    const { req, find } = peticion(lector, MANTENCION)
    await lecturaDeModulo('casos-ao')({ req } as never)
    await lecturaDeModulo('cirugias')({ req } as never)
    await lecturaDeModulo('patologias')({ req } as never)
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('un lector no crea comentarios ni lecturas en un módulo en mantención', async () => {
    const { req } = peticion(lector, MANTENCION)
    expect(await creacionEnModuloVisible({ req, data: { coleccion: 'casos-ao' } } as never)).toBe(false)
    expect(await creacionEnModuloVisible({ req, data: { coleccion: 'cirugias' } } as never)).toBe(true)
  })

  it('el editor sí comenta y anota en un módulo en mantención', async () => {
    const { req } = peticion(editor, MANTENCION)
    expect(await creacionEnModuloVisible({ req, data: { coleccion: 'casos-ao' } } as never)).toBe(true)
  })

  it('si la consulta de la lista falla, la lectura del lector falla con ella y no se abre', async () => {
    const find = vi.fn(async () => {
      throw new Error('la base no contesta')
    })
    const req = { user: lector, payload: { find }, context: {} }
    await expect(Promise.resolve(lecturaDeModulo('casos-ao')({ req } as never))).rejects.toThrow('la base no contesta')
  })
})

describe('el registro de acciones', () => {
  it('anota cada módulo que entra y cada uno que sale', () => {
    expect(
      cambiosDeMantencion({ modulosEnMantencion: ['casos-ao'] }, { modulosEnMantencion: ['cirugias', 'estudios-ia'] }),
    ).toEqual([
      { modulo: 'cirugias', enMantencion: true },
      { modulo: 'estudios-ia', enMantencion: true },
      { modulo: 'casos-ao', enMantencion: false },
    ])
  })

  it('no anota nada si la lista es la misma, aunque cambie el orden', () => {
    expect(cambiosDeMantencion({ modulosEnMantencion: ['a', 'b'] }, { modulosEnMantencion: ['b', 'a'] })).toEqual([])
    expect(cambiosDeMantencion(null, { modulosEnMantencion: [] })).toEqual([])
  })

  it('al crearse la fila, lo que trae es lo que entró', () => {
    expect(cambiosDeMantencion(null, { modulosEnMantencion: ['cirugias'] })).toEqual([
      { modulo: 'cirugias', enMantencion: true },
    ])
  })
})

describe('la colección de ajustes', () => {
  it('está registrada y solo la gobierna el administrador', () => {
    expect(COLECCIONES.map((c) => c.slug)).toContain('ajustes')
    const a = Ajustes.access!
    const lectorPeticion = { req: { user: { rol: 'lector', activo: true } } } as never
    const editorPeticion = { req: { user: { rol: 'editor', activo: true } } } as never
    const adminPeticion = { req: { user: { rol: 'admin', activo: true } } } as never
    for (const operacion of ['read', 'create', 'update', 'delete'] as const) {
      expect(a[operacion]!(lectorPeticion)).toBe(false)
      expect(a[operacion]!(editorPeticion)).toBe(false)
      expect(a[operacion]!(adminPeticion)).toBe(true)
    }
  })

  it('ofrece exactamente los cinco módulos', () => {
    const campo = Ajustes.fields.find((f) => 'name' in f && f.name === 'modulosEnMantencion') as {
      options: { value: string }[]
    }
    expect(campo.options.map((o) => o.value)).toEqual([
      'patologias',
      'maniobras',
      'casos-ao',
      'cirugias',
      'estudios-ia',
    ])
  })
})
