import { describe, expect, it } from 'vitest'
import {
  alFormatoActual,
  CasoDeUnFormatoMasNuevo,
  CONVERSIONES,
  VERSION_DEL_FORMATO_DEL_CASO,
  versionDelCaso,
} from '@/lib/formatoDelCaso'
import { casoParaLaConsola, casoDesdeElFormulario } from '@/lib/casoQuirurgico'
import { escribirLaVersionDelFormato } from '@/collections/hooks/formatoDelCaso'
import { Cirugias } from '@/collections/Cirugias'

/**
 * La versión de formato de los casos (D-373).
 *
 * Lo que tiene que cumplirse siempre, también el día que alguien suba la
 * versión: una conversión por cada versión, los casos viejos convertidos al
 * leer, los nuevos guardados con su número, y un caso de un formato más nuevo
 * que el código parado con un mensaje en vez de leído a medias.
 */

const CASO = { id: 7, nombre: 'Tibia de prueba', pasos: [], modelo: null }

describe('las conversiones', () => {
  it('hay una por cada versión, de la 0 a la actual', () => {
    // Subir la versión sin añadir su conversión dejaría los casos viejos sin
    // camino hasta el formato nuevo. Añadir una sin subir la versión la dejaría
    // sin usar.
    expect(CONVERSIONES).toHaveLength(VERSION_DEL_FORMATO_DEL_CASO)
    for (const conversion of CONVERSIONES) expect(typeof conversion).toBe('function')
  })

  it('cada una devuelve un caso y no toca el que recibe', () => {
    for (const [n, conversion] of CONVERSIONES.entries()) {
      const original = structuredClone(CASO)
      const convertido = conversion(original)
      expect(convertido, `conversión ${n} → ${n + 1}`).toBeTypeOf('object')
      expect(original, `conversión ${n} → ${n + 1}`).toEqual(CASO)
    }
  })
})

describe('versionDelCaso', () => {
  it('un caso sin número, o con uno raro, es de antes de D-373', () => {
    for (const valor of [undefined, null, 0, -1, 1.5, '1', Number.NaN]) {
      expect(versionDelCaso({ versionDelFormato: valor }), String(valor)).toBe(0)
    }
  })

  it('un entero positivo es la versión', () => {
    expect(versionDelCaso({ versionDelFormato: 1 })).toBe(1)
    expect(versionDelCaso({ versionDelFormato: 4 })).toBe(4)
  })
})

describe('alFormatoActual', () => {
  it('un caso de antes de D-373 sale con la versión actual', () => {
    expect(alFormatoActual(CASO)).toEqual({ ...CASO, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO })
  })

  it('uno al día sale tal cual, el mismo objeto', () => {
    const alDia = { ...CASO, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO }
    expect(alFormatoActual(alDia)).toBe(alDia)
  })

  it('uno de un formato más nuevo se para con un mensaje que dice qué hacer', () => {
    const nuevo = { ...CASO, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO + 1 }
    expect(() => alFormatoActual(nuevo)).toThrow(CasoDeUnFormatoMasNuevo)
    expect(() => alFormatoActual(nuevo)).toThrow(/«Tibia de prueba».*Hay que actualizar la plataforma/)
  })
})

describe('la consola y el editor', () => {
  it('la consola no lee un caso de un formato más nuevo', () => {
    // Es el único camino por el que el residente, la nota del servidor y el
    // editor leen un caso: si aquí no se para, se lee mal en los tres.
    expect(() => casoParaLaConsola({ ...CASO, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO + 1 })).toThrow(
      CasoDeUnFormatoMasNuevo,
    )
  })

  it('la consola lee igual un caso de antes de D-373 y uno al día', () => {
    const viejo = casoParaLaConsola(CASO)
    const alDia = casoParaLaConsola({ ...CASO, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO })
    expect(viejo).toEqual(alDia)
  })

  it('el editor lee lo del formulario como del formato actual, aunque no traiga el número', () => {
    // Sin la marca, una conversión futura reescribiría lo que el editor acaba
    // de escribir en el formato nuevo como si fuera viejo. Un formulario que
    // dijera ser de un formato más nuevo se pararía; este no lo dice.
    expect(() =>
      casoDesdeElFormulario({ ...CASO, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO + 5 }, { opciones: {}, instrumentos: [] }),
    ).not.toThrow()
  })
})

describe('el guardado', () => {
  const guardar = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    (escribirLaVersionDelFormato as unknown as (a: Record<string, unknown>) => Record<string, unknown>)({
      data,
      originalDoc,
      operation: originalDoc ? 'update' : 'create',
    })

  it('la colección lo engancha antes de guardar', () => {
    expect(Cirugias.hooks?.beforeChange).toContain(escribirLaVersionDelFormato)
    const campo = Cirugias.fields.find((c) => 'name' in c && c.name === 'versionDelFormato')
    expect(campo).toMatchObject({ type: 'number' })
  })

  it('un caso nuevo, uno viejo y uno al día se guardan con la versión actual', () => {
    expect(guardar({ nombre: 'Nuevo' }).versionDelFormato).toBe(VERSION_DEL_FORMATO_DEL_CASO)
    expect(guardar({ nombre: 'Viejo' }, { nombre: 'Viejo' }).versionDelFormato).toBe(VERSION_DEL_FORMATO_DEL_CASO)
    // Ni siquiera un valor escrito a mano por la API lo cambia.
    expect(guardar({ nombre: 'A mano', versionDelFormato: 99 }, { versionDelFormato: 1 }).versionDelFormato).toBe(
      VERSION_DEL_FORMATO_DEL_CASO,
    )
  })

  it('no se guarda encima de un caso de un formato más nuevo', () => {
    // Es lo que pasaría con una imagen anterior después de una migración de
    // formato: lo marcaría con la versión vieja sin convertirlo hacia atrás.
    expect(() =>
      guardar({ nombre: 'Del futuro' }, { nombre: 'Del futuro', versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO + 1 }),
    ).toThrow(CasoDeUnFormatoMasNuevo)
  })
})
