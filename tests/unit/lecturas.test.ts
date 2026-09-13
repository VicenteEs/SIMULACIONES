import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lecturasDelResidente } from '@/lib/lecturas'

/**
 * La pregunta «¿ya la leyó?», que antes vivía copiada en cinco páginas.
 *
 * Lo que se fija aquí es lo que las copias hacían cada una a su manera y que
 * la mudanza a `src/lib/lecturas.ts` tiene que sostener para las cinco a la
 * vez: una sola consulta aunque se pregunte por treinta fichas, ninguna si no
 * hay a quién preguntar, y nunca un error que se lleve la página por delante.
 */

const buscar = vi.fn()
const payload = { find: buscar } as never

const RESIDENTE = { id: 4, rol: 'lector', activo: true }

beforeEach(() => {
  buscar.mockReset()
  buscar.mockResolvedValue({ docs: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** El `where` de la única llamada, para leerlo sin repetir el camino. */
function condicionesDeLaConsulta(): Record<string, unknown>[] {
  expect(buscar).toHaveBeenCalledTimes(1)
  return (buscar.mock.calls[0][0] as { where: { and: Record<string, unknown>[] } }).where.and
}

describe('una sola consulta para cualquier número de fichas', () => {
  it('el listado del examen físico pregunta por todas sus maniobras de una vez', async () => {
    const maniobras = Array.from({ length: 30 }, (_, i) => String(i + 1))
    await lecturasDelResidente(payload, RESIDENTE, 'maniobras', maniobras)

    const condiciones = condicionesDeLaConsulta()
    expect(condiciones).toContainEqual({ usuario: { equals: 4 } })
    expect(condiciones).toContainEqual({ coleccion: { equals: 'maniobras' } })
    expect(condiciones).toContainEqual({ documentoId: { in: maniobras } })
  })

  it('una ficha por documento es la lista de un elemento, con la misma consulta', async () => {
    await lecturasDelResidente(payload, RESIDENTE, 'patologias', ['12'])
    expect(condicionesDeLaConsulta()).toContainEqual({ documentoId: { in: ['12'] } })
  })

  it('no le pone tope: el `in:` ya acota, y un tope solo podía dejar casillas en blanco', async () => {
    await lecturasDelResidente(payload, RESIDENTE, 'maniobras', ['1', '2'])
    const opciones = buscar.mock.calls[0][0] as Record<string, unknown>
    expect(opciones.collection).toBe('actividad')
    expect(opciones.pagination).toBe(false)
    expect(opciones).not.toHaveProperty('limit')
  })

  it('pregunta en texto y sin repetidos, porque `documentoId` es una columna de texto', async () => {
    await lecturasDelResidente(payload, RESIDENTE, 'maniobras', [7, '7', 8])
    expect(condicionesDeLaConsulta()).toContainEqual({ documentoId: { in: ['7', '8'] } })
  })
})

describe('sin nada que preguntar no se pregunta', () => {
  it('sin sesión no consulta y responde que no hay nada leído', async () => {
    const lecturas = await lecturasDelResidente(payload, null, 'patologias', ['12'])
    expect(buscar).not.toHaveBeenCalled()
    expect(lecturas.leida('12')).toBe(false)
    expect(lecturas.registro('12')).toBeNull()
  })

  it('un listado vacío no consulta', async () => {
    await lecturasDelResidente(payload, RESIDENTE, 'maniobras', [])
    expect(buscar).not.toHaveBeenCalled()
  })
})

describe('lo que responde', () => {
  it('distingue la ficha leída de la visitada y de la que nunca se abrió', async () => {
    buscar.mockResolvedValue({
      docs: [
        { documentoId: '1', completado: true },
        { documentoId: '2', completado: false },
      ],
    })
    const lecturas = await lecturasDelResidente(payload, RESIDENTE, 'maniobras', ['1', '2', '3'])

    expect(lecturas.leida('1')).toBe(true)
    expect(lecturas.leida('2')).toBe(false)
    expect(lecturas.leida('3')).toBe(false)
    expect(lecturas.registro('2')).toEqual({ documentoId: '2', completado: false })
    expect(lecturas.registro('3')).toBeNull()
  })

  it('acepta el identificador como número, que es como lo trae el listado', async () => {
    buscar.mockResolvedValue({ docs: [{ documentoId: '7', completado: true }] })
    const lecturas = await lecturasDelResidente(payload, RESIDENTE, 'maniobras', [7])
    expect(lecturas.leida(7)).toBe(true)
    expect(lecturas.leida('7')).toBe(true)
  })

  it('con filas gemelas basta con que una diga que está leída', async () => {
    // Las de antes del índice único. La que dice que sí es la que escribió el
    // residente al marcar: enseñarle la casilla en blanco por la otra sería
    // pedirle otra vez un gesto que ya hizo.
    buscar.mockResolvedValue({
      docs: [
        { documentoId: '5', completado: false, ultimaVisita: '2026-09-13T10:00:00Z' },
        { documentoId: '5', completado: true, ultimaVisita: '2026-09-12T10:00:00Z' },
      ],
    })
    const lecturas = await lecturasDelResidente(payload, RESIDENTE, 'cirugias', ['5'])
    expect(lecturas.leida('5')).toBe(true)
  })

  it('con filas gemelas el registro es la más reciente, que trae el último recorrido', async () => {
    buscar.mockResolvedValue({
      docs: [
        { documentoId: '5', puntaje: 18 },
        { documentoId: '5', puntaje: 3 },
      ],
    })
    const lecturas = await lecturasDelResidente(payload, RESIDENTE, 'cirugias', ['5'])
    expect((buscar.mock.calls[0][0] as { sort: string }).sort).toBe('-ultimaVisita')
    expect(lecturas.registro('5')).toEqual({ documentoId: '5', puntaje: 18 })
  })

  it('una avería en la tabla no se lleva la página: nada leído, y queda escrito', async () => {
    buscar.mockRejectedValue(new Error('relation "actividad" does not exist'))
    const lecturas = await lecturasDelResidente(payload, RESIDENTE, 'patologias', ['12'])

    expect(lecturas.leida('12')).toBe(false)
    expect(lecturas.registro('12')).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })
})
