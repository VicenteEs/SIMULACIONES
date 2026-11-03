import { describe, expect, it } from 'vitest'
import {
  CAMPOS_DE_FIRMA,
  PROFESIONES,
  firmasDe,
  firmasEnPalabras,
  firmasQueFaltan,
  porQueNoPuedeFirmar,
  textoParaLaHuella,
  tieneAlguna,
  tieneLasDos,
} from '@/lib/firmas'
import { Revisiones } from '@/collections/Revisiones'
import { Usuarios } from '@/collections/Usuarios'

const sinFirmas = { medico: null, kinesiologo: null }
const delMedico = { medico: { por: '7', nombre: 'Dra. Vega', en: '2026-11-03T10:00:00.000Z' }, kinesiologo: null }

describe('las dos firmas de una ficha (D-240)', () => {
  it('lee las firmas de la fila, venga la cuenta como id o como documento', () => {
    expect(
      firmasDe({
        firmaMedicoPor: 7,
        firmaMedicoEn: '2026-11-03T10:00:00.000Z',
        firmaKinesiologoPor: { id: 9, nombre: 'Klgo. Soto' },
        firmaKinesiologoEn: '2026-11-03T11:00:00.000Z',
      }),
    ).toEqual({
      medico: { por: '7', nombre: null, en: '2026-11-03T10:00:00.000Z' },
      kinesiologo: { por: '9', nombre: 'Klgo. Soto', en: '2026-11-03T11:00:00.000Z' },
    })
  })

  it('sin fecha no hay firma; sin cuenta, la firma sigue valiendo', () => {
    expect(firmasDe({ firmaMedicoPor: 7, firmaMedicoEn: null })).toEqual(sinFirmas)
    expect(firmasDe({ firmaMedicoPor: null, firmaMedicoEn: '2026-11-03T10:00:00.000Z' }).medico).toEqual({
      por: null,
      nombre: null,
      en: '2026-11-03T10:00:00.000Z',
    })
  })

  it('cuenta las que hay y dice cuáles faltan', () => {
    expect(tieneAlguna(sinFirmas)).toBe(false)
    expect(tieneAlguna(delMedico)).toBe(true)
    expect(tieneLasDos(delMedico)).toBe(false)
    expect(firmasQueFaltan(delMedico)).toEqual(['kinesiologo'])
    expect(firmasQueFaltan(sinFirmas)).toEqual(['medico', 'kinesiologo'])
  })

  it('quién puede firmar lo decide la profesión de la cuenta', () => {
    expect(porQueNoPuedeFirmar(sinFirmas, { id: '1', profesion: undefined })).toMatch(/no dice si es médico o kinesiólogo/)
    expect(porQueNoPuedeFirmar(sinFirmas, { id: '1', profesion: 'traumatologo' })).toMatch(/no dice/)
    expect(porQueNoPuedeFirmar(sinFirmas, { id: '1', profesion: 'medico' })).toBeNull()
    expect(porQueNoPuedeFirmar(delMedico, { id: '9', profesion: 'kinesiologo' })).toBeNull()
  })

  it('una misma profesión no firma dos veces, ni la misma persona ni otra', () => {
    expect(porQueNoPuedeFirmar(delMedico, { id: '7', profesion: 'medico' })).toMatch(/Usted ya la firmó como médico/)
    expect(porQueNoPuedeFirmar(delMedico, { id: '8', profesion: 'medico' })).toMatch(
      /Ya la firmó un médico \(Dra\. Vega\)\. Falta la firma de un kinesiólogo/,
    )
    const lasDos = { ...delMedico, kinesiologo: { por: '9', nombre: null, en: '2026-11-03T11:00:00.000Z' } }
    expect(porQueNoPuedeFirmar(lasDos, { id: '9', profesion: 'kinesiologo' })).toMatch(/ya tiene las dos firmas/)
  })

  it('las firmas en una línea', () => {
    expect(firmasEnPalabras(delMedico)).toBe('Médico: Dra. Vega · Kinesiólogo: falta')
  })

  it('la huella no depende del orden de las claves y sí de cualquier cambio', () => {
    const a = { nombre: 'Fractura', manejo: [{ texto: 'clavo', id: 1 }], segmento: 3 }
    const b = { segmento: 3, manejo: [{ id: 1, texto: 'clavo' }], nombre: 'Fractura' }
    expect(textoParaLaHuella(a)).toBe(textoParaLaHuella(b))
    expect(textoParaLaHuella(a)).not.toBe(textoParaLaHuella({ ...a, segmento: 4 }))
    expect(textoParaLaHuella(a)).not.toBe(textoParaLaHuella({ ...a, manejo: [{ texto: 'placa', id: 1 }] }))
  })

  it('los campos que nombra este módulo existen en las colecciones', () => {
    const nombres = (campos: { name?: string }[]) => campos.map((c) => c.name)
    for (const { por, en } of Object.values(CAMPOS_DE_FIRMA)) {
      expect(nombres(Revisiones.fields as { name?: string }[])).toEqual(expect.arrayContaining([por, en, 'huellaFirmada']))
    }
    const profesion = (Usuarios.fields as { name?: string; options?: { value: string }[] }[]).find(
      (c) => c.name === 'profesion',
    )
    expect(profesion?.options?.map((o) => o.value)).toEqual(PROFESIONES.map((p) => p.valor))
  })
})
