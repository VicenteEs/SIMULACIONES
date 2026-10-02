import { describe, it, expect, vi } from 'vitest'
import {
  avisarDeInstrumentosPropuestos,
  propuestasNuevas,
  textoDeLaPropuesta,
} from '@/collections/hooks/instrumentosPropuestos'
import { Cirugias } from '@/collections/Cirugias'

/**
 * El instrumento que un paso pide y el catálogo no tiene llega a la
 * administración como comentario.
 *
 * Lo que se vigila es el aviso: que salga una vez por propuesta y no en cada
 * guardado. El gancho corre también con cada borrador, y una propuesta que se
 * repitiera diez veces enterraría los demás comentarios de la bandeja.
 */

describe('propuestasNuevas', () => {
  it('avisa de la propuesta de un paso nuevo', () => {
    expect(propuestasNuevas([{ id: 'a', titulo: 'Abordaje', instrumentoPropuesto: 'Pinza Kocher' }], [])).toEqual([
      { nombre: 'Pinza Kocher', numero: 1, titulo: 'Abordaje' },
    ])
  })

  it('no repite la de un paso que la conserva, aunque cambien mayúsculas o espacios', () => {
    const antes = [{ id: 'a', instrumentoPropuesto: 'Pinza Kocher' }]
    expect(propuestasNuevas([{ id: 'a', instrumentoPropuesto: '  pinza   kocher ' }], antes)).toEqual([])
  })

  it('avisa cuando el paso cambia de propuesta', () => {
    const antes = [{ id: 'a', instrumentoPropuesto: 'Pinza Kocher' }]
    expect(propuestasNuevas([{ id: 'a', instrumentoPropuesto: 'Pinza Allis' }], antes)).toHaveLength(1)
  })

  it('ignora los pasos sin propuesta y numera por la posición', () => {
    const pasos = [{ id: 'a' }, { id: 'b', instrumentoPropuesto: '' }, { id: 'c', instrumentoPropuesto: 'Fresa' }]
    expect(propuestasNuevas(pasos, undefined)).toEqual([{ nombre: 'Fresa', numero: 3, titulo: '' }])
  })
})

function peticionFalsa({ instrumentos = [] as { nombre: string }[], pendientes = 0 } = {}) {
  const create = vi.fn().mockResolvedValue({})
  const req = {
    payload: {
      find: vi.fn().mockResolvedValue({ docs: instrumentos }),
      count: vi.fn().mockResolvedValue({ totalDocs: pendientes }),
      create,
    },
  }
  return { req, create }
}

const llamar = (req: unknown, pasos: unknown[], anteriores: unknown[] = []) =>
  (avisarDeInstrumentosPropuestos as (a: unknown) => Promise<unknown>)({
    doc: { id: 7, pasos },
    previousDoc: { id: 7, pasos: anteriores },
    req,
  })

describe('avisarDeInstrumentosPropuestos', () => {
  it('crea un comentario sobre la cirugía con el nombre y el paso', async () => {
    const { req, create } = peticionFalsa()
    await llamar(req, [{ id: 'a', titulo: 'Cierre', instrumentoPropuesto: 'Grapadora cutánea' }])
    expect(create).toHaveBeenCalledOnce()
    const { collection, data } = create.mock.calls[0][0]
    expect(collection).toBe('comentarios')
    expect(data).toMatchObject({ coleccion: 'cirugias', documentoId: '7' })
    expect(data.texto).toBe(textoDeLaPropuesta('Grapadora cutánea', 1, 'Cierre'))
  })

  it('no lo duplica si el mismo aviso ya está pendiente en la ficha', async () => {
    const { req, create } = peticionFalsa({ pendientes: 1 })
    await llamar(req, [{ id: 'a', instrumentoPropuesto: 'Grapadora cutánea' }])
    expect(create).not.toHaveBeenCalled()
  })

  it('si ya existe en el catálogo, el comentario lo dice', async () => {
    const { req, create } = peticionFalsa({ instrumentos: [{ nombre: 'Pinza Kocher' }] })
    await llamar(req, [{ id: 'a', instrumentoPropuesto: 'pinza kocher' }])
    expect(create.mock.calls[0][0].data.texto).toContain('Ya existe en el catálogo como «Pinza Kocher»')
  })

  it('no hace nada si no hay propuestas nuevas', async () => {
    const { req, create } = peticionFalsa()
    await llamar(req, [{ id: 'a', instrumentoPropuesto: 'Fresa' }], [{ id: 'a', instrumentoPropuesto: 'Fresa' }])
    expect(req.payload.find).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('está colgado de la colección de cirugías', () => {
    expect(Cirugias.hooks?.afterChange).toContain(avisarDeInstrumentosPropuestos)
  })
})
