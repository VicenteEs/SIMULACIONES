import { describe, it, expect, vi } from 'vitest'
import type { Payload } from 'payload'
import { armarEquipo, leerEquipo } from '@/app/(frontend)/admin-panel/contenido/equipo'

/**
 * El tablero de «Equipo» (P-007 E5, D-238).
 *
 * Lo que se vigila es que diga de cada persona lo mismo que la Auditoría
 * —validadas, las que firmó y siguen firmadas; pendientes, las asignadas que no
 * están validadas ni publicadas— y que «puede validar en este módulo» salga de
 * la misma regla que gobierna la base (`puedeEditarModulo`), con su trampa: una
 * lista de módulos vacía no es «ninguno» sino «todos».
 */

const hoy = new Date(2026, 10, 3, 16, 0) // martes 3 de noviembre de 2026, hora local
const haceDias = (n: number) => new Date(2026, 10, 3 - n, 10, 0).toISOString()

const editora = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  nombre: `Editora ${id}`,
  email: `e${id}@ejemplo.cl`,
  rol: 'editor',
  activo: true,
  pendiente: false,
  modulosVisibles: [],
  modulosEditables: [],
  ...extra,
})

describe('armarEquipo', () => {
  it('entra todo editor, con trabajo o sin él, y no las solicitudes sin resolver', () => {
    const r = armarEquipo([editora(1), editora(2, { pendiente: true }), editora(3, { activo: false })], [], hoy)
    expect(r.personas.map((p) => p.id)).toEqual(['1', '3'])
    expect(r.personas[1].activa).toBe(false)
  })

  it('un administrador entra solo si revisa: con algo asignado en la cola o algo validado', () => {
    const admin = { id: 9, nombre: 'Admin', rol: 'admin', activo: true }
    const otroAdmin = { id: 10, nombre: 'Otro admin', rol: 'admin', activo: true }
    const r = armarEquipo([admin, otroAdmin], [{ estado: 'lista', listaPor: 9, listaEn: haceDias(1) }], hoy)
    expect(r.personas.map((p) => p.id)).toEqual(['9'])
    expect(r.personas[0].modulos).toHaveLength(5)
    expect(r.administradores).toBe(2)
  })

  it('los módulos salen de la regla de la base: lista vacía es «todos», y cuenta la intersección de las dos', () => {
    const r = armarEquipo(
      [
        editora(1),
        editora(2, { modulosVisibles: ['patologias', 'maniobras'], modulosEditables: ['maniobras', 'cirugias'] }),
        // Desactivada: la tarjeta dice su encargo igual, aunque hoy no pueda.
        editora(3, { activo: false, modulosEditables: ['casos-ao'] }),
      ],
      [],
      hoy,
    )
    const modulos = Object.fromEntries(r.personas.map((p) => [p.id, p.modulos]))
    expect(modulos['1']).toEqual(['patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia'])
    expect(modulos['2']).toEqual(['maniobras'])
    expect(modulos['3']).toEqual(['casos-ao'])
  })

  it('validadas son las que firmó y siguen firmadas; pendientes, las asignadas en la cola, separadas por su antigüedad', () => {
    const r = armarEquipo(
      [editora(1)],
      [
        { estado: 'lista', listaPor: 1, listaEn: haceDias(2) },
        { estado: 'publicada', listaPor: { id: 1, nombre: 'Editora 1' }, listaEn: haceDias(20) },
        // Firmada y reabierta: `listaEn` se borró, ya no es una validación suya.
        { estado: 'pendiente', listaPor: 1, listaEn: null, asignadaA: 1, createdAt: haceDias(1) },
        { estado: 'en-revision', asignadaA: '1', createdAt: haceDias(6) },
        { estado: 'devuelta', asignadaA: { id: 1 }, createdAt: haceDias(7) },
        // Asignada pero ya validada por otra persona: no es carga suya.
        { estado: 'lista', asignadaA: 1, listaPor: 2, listaEn: haceDias(1), createdAt: haceDias(30) },
      ],
      hoy,
    )
    const [p] = r.personas
    expect(p.validadas).toBe(2)
    expect(p.pendientesRecientes).toBe(2)
    expect(p.pendientesAntiguas).toBe(1)
  })

  it('cuenta lo que espera sin nadie asignado', () => {
    const r = armarEquipo(
      [editora(1)],
      [
        { estado: 'pendiente', asignadaA: null, createdAt: haceDias(1) },
        { estado: 'devuelta', createdAt: haceDias(1) },
        { estado: 'pendiente', asignadaA: 1, createdAt: haceDias(1) },
        { estado: 'lista', asignadaA: null, listaEn: haceDias(1) },
      ],
      hoy,
    )
    expect(r.sinAsignar).toBe(2)
  })

  it('la cobertura cuenta editores activos y aceptados; los administradores van aparte', () => {
    const r = armarEquipo(
      [
        editora(1, { modulosEditables: ['patologias'] }),
        editora(2, { modulosEditables: ['patologias', 'maniobras'] }),
        editora(3, { activo: false }),
        editora(4, { pendiente: true }),
        { id: 9, rol: 'admin', activo: true },
      ],
      [],
      hoy,
    )
    expect(r.cobertura).toEqual([
      { slug: 'patologias', editores: 2 },
      { slug: 'maniobras', editores: 1 },
      { slug: 'casos-ao', editores: 0 },
      { slug: 'cirugias', editores: 0 },
      { slug: 'estudios-ia', editores: 0 },
    ])
    expect(r.administradores).toBe(1)
  })

  it('ordena las activas primero, después quien más carga y, a igual carga, por nombre', () => {
    const r = armarEquipo(
      [
        editora(1, { nombre: 'Zoila' }),
        editora(2, { nombre: 'Ana' }),
        editora(3, { nombre: 'Beatriz' }),
        editora(4, { nombre: 'Aurora', activo: false }),
      ],
      [
        { estado: 'pendiente', asignadaA: 1, createdAt: haceDias(1) },
        { estado: 'pendiente', asignadaA: 4, createdAt: haceDias(1) },
        { estado: 'pendiente', asignadaA: 4, createdAt: haceDias(1) },
      ],
      hoy,
    )
    expect(r.personas.map((p) => p.nombre)).toEqual(['Zoila', 'Ana', 'Beatriz', 'Aurora'])
  })

  it('sin nombre se usa el correo', () => {
    const r = armarEquipo([editora(1, { nombre: '' })], [], hoy)
    expect(r.personas[0].nombre).toBe('e1@ejemplo.cl')
  })
})

describe('leerEquipo', () => {
  it('si alguna de las dos tablas no contesta, `null` y no un equipo vacío', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const payload = {
      count: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'revisiones') throw new Error('la base no contesta')
        return { totalDocs: 1 }
      }),
      find: vi.fn(async () => ({ docs: [editora(1)] })),
    } as unknown as Payload
    expect(await leerEquipo(payload)).toBeNull()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('lee las cuentas de editor y de administrador y toda la cola', async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) => ({
      docs: collection === 'usuarios' ? [editora(1)] : [{ estado: 'pendiente', asignadaA: 1, createdAt: haceDias(1) }],
    }))
    const payload = { count: vi.fn(async () => ({ totalDocs: 1 })), find } as unknown as Payload
    const r = await leerEquipo(payload)
    expect(r?.personas).toHaveLength(1)
    expect(r?.personas[0].pendientesRecientes).toBe(1)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'usuarios', where: { rol: { in: ['editor', 'admin'] } } }),
    )
  })
})
