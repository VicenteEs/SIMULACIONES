import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectionConfig } from 'payload'

/**
 * Lo que el registro de acciones guarda como título de cada entrada (D-291).
 *
 * El título se queda en el registro doce meses, más que lo que nombra: una
 * cotización se borra cuando lo pide quien la mandó, y una cuenta cuando se da
 * de baja. Si el título fuera el nombre de la persona, el registro lo seguiría
 * guardando después de que el aviso prometió que se borró. Lo que se arregla
 * después en la base —las entradas de antes de esta regla— se prueba contra
 * PostgreSQL en `tests/integration/privacidad.test.ts`.
 */

const { anotadas } = vi.hoisted(() => ({ anotadas: [] as Record<string, unknown>[] }))

vi.mock('@/lib/registroServidor', () => ({
  registrarAccion: async (_payload: unknown, entrada: Record<string, unknown>) => {
    anotadas.push(entrada)
  },
  actorDeLaPeticion: async () => ({ id: 1, rol: 'admin', nombre: 'Administradora' }),
}))

import { conRegistro } from '@/collections/hooks/registrarAccion'

const ganchosDe = (slug: string) => {
  const coleccion = conRegistro({ slug, fields: [] } as CollectionConfig)
  const despuesDeCambiar = coleccion.hooks?.afterChange?.at(-1)
  const despuesDeEliminar = coleccion.hooks?.afterDelete?.at(-1)
  if (!despuesDeCambiar || !despuesDeEliminar) throw new Error(`${slug} no lleva los ganchos del registro`)
  return {
    cambiar: (doc: Record<string, unknown>, operation: 'create' | 'update' = 'create') =>
      despuesDeCambiar({ doc, previousDoc: null, operation, req: { payload: {}, context: {} } } as never),
    eliminar: (doc: Record<string, unknown>) =>
      despuesDeEliminar({ doc, id: doc.id, req: { payload: {}, context: {} } } as never),
  }
}

beforeEach(() => {
  anotadas.length = 0
})

describe('el título de una entrada del registro', () => {
  it('una cotización se anota con la institución, no con el nombre de quien la pidió', async () => {
    const cotizacion = { id: 7, nombre: 'Fulana de Tal', correo: 'fulana@hospital.cl', institucion: 'Hospital del Sur' }
    const { cambiar, eliminar } = ganchosDe('cotizaciones')
    await cambiar(cotizacion)
    await cambiar(cotizacion, 'update')
    await eliminar(cotizacion)

    expect(anotadas.map((e) => [e.accion, e.titulo])).toEqual([
      ['creo', 'Hospital del Sur'],
      ['modifico', 'Hospital del Sur'],
      ['elimino', 'Hospital del Sur'],
    ])
    expect(JSON.stringify(anotadas)).not.toMatch(/Fulana|fulana@/)
  })

  it('una cotización sin institución cae en su número, no en el nombre', async () => {
    await ganchosDe('cotizaciones').cambiar({ id: 8, nombre: 'Fulana de Tal', institucion: '  ' })
    expect(anotadas[0].titulo).toBe('#8')
  })

  it('la cuenta que se elimina no deja su nombre en el «Eliminó»: queda el rol', async () => {
    await ganchosDe('usuarios').eliminar({ id: 9, nombre: 'Mengana', email: 'mengana@hospital.cl', rol: 'lector' })
    expect(anotadas).toHaveLength(1)
    expect(anotadas[0]).toMatchObject({
      accion: 'elimino',
      coleccion: 'usuarios',
      documentoId: 9,
      detalle: 'una cuenta de rol lector',
    })
    expect(anotadas[0].titulo).toBeUndefined()
    expect(JSON.stringify(anotadas)).not.toMatch(/Mengana|mengana@/)
  })

  it('las demás colecciones siguen con su primer campo con texto', async () => {
    await ganchosDe('difusiones').cambiar({ id: 3, asunto: 'Aviso de mantención' })
    await ganchosDe('segmentos').eliminar({ id: 4, nombre: 'Rodilla' })
    expect(anotadas.map((e) => e.titulo)).toEqual(['Aviso de mantención', 'Rodilla'])
  })
})
