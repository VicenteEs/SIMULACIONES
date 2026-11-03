import { describe, expect, it, vi } from 'vitest'

/**
 * Lo que es una cotización (`src/lib/cotizaciones.ts`), lo que el
 * administrador puede cambiar de ella (`acciones/cotizaciones.ts`) y la tabla
 * de planes (`components/portada/planes.ts`), que es la promesa comercial que
 * acompaña a la cotización.
 */

const { actualizar, borrar } = vi.hoisted(() => ({ actualizar: vi.fn(), borrar: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/guardias', async (original) => ({
  ...((await original()) as object),
  exigirAdmin: async () => ({ payload: { update: actualizar, delete: borrar }, usuario: { id: 1, rol: 'admin' } }),
}))

import { Cotizaciones } from '@/collections/Cotizaciones'
import {
  ESTADOS_DE_COTIZACION,
  LARGOS_DE_COTIZACION,
  MODULOS_COTIZABLES,
  TRAMOS_DE_RESIDENTES,
  esEstadoDeCotizacion,
  etiquetaDeEstado,
  problemasDeLaCotizacion,
  type DatosDeCotizacion,
} from '@/lib/cotizaciones'
import { TONO_DE_COTIZACION } from '@/lib/tonosDeEstado'
import { FILAS_DE_LA_COMPARATIVA } from '@/lib/espaciosDeLaPagina'
import { GRUPOS_DE_LA_COMPARATIVA, INCLUYE, PLANES, PLAN_DESTACADO } from '@/components/portada/planes'
import { actualizarCotizacion } from '@/app/(frontend)/acciones/cotizaciones'

const BUENA: DatosDeCotizacion = {
  nombre: 'Ana Pérez',
  correo: 'ana@hospital.cl',
  institucion: 'Hospital Regional',
  cargo: '',
  residentes: '1 a 5',
  modulos: [],
  mensaje: '',
}

describe('problemasDeLaCotizacion', () => {
  it('no encuentra nada en una solicitud completa, con lo opcional vacío', () => {
    expect(problemasDeLaCotizacion(BUENA)).toEqual({})
  })

  it('pide nombre, correo, institución y tramo, cada uno con su mensaje', () => {
    const problemas = problemasDeLaCotizacion({ ...BUENA, nombre: ' ', correo: '', institucion: '', residentes: '' })
    expect(Object.keys(problemas).sort()).toEqual(['correo', 'institucion', 'nombre', 'residentes'])
  })

  it('cuenta caracteres y no unidades de código: una tilde no gasta dos', () => {
    const justo = 'á'.repeat(LARGOS_DE_COTIZACION.nombre)
    expect(problemasDeLaCotizacion({ ...BUENA, nombre: justo }).nombre).toBeUndefined()
    expect(problemasDeLaCotizacion({ ...BUENA, nombre: justo + 'a' }).nombre).toBeDefined()
  })

  it('rechaza un módulo que no es de la tabla única', () => {
    expect(problemasDeLaCotizacion({ ...BUENA, modulos: ['patologias', 'otro'] }).modulos).toBeDefined()
    expect(problemasDeLaCotizacion({ ...BUENA, modulos: ['patologias'] }).modulos).toBeUndefined()
  })

  it('rechaza el mensaje y el cargo demasiado largos', () => {
    const p = problemasDeLaCotizacion({
      ...BUENA,
      cargo: 'x'.repeat(LARGOS_DE_COTIZACION.cargo + 1),
      mensaje: 'x'.repeat(LARGOS_DE_COTIZACION.mensaje + 1),
    })
    expect(p.cargo).toBeDefined()
    expect(p.mensaje).toBeDefined()
  })
})

describe('la colección dice lo mismo que la regla', () => {
  const campo = (nombre: string) => Cotizaciones.fields.find((f) => 'name' in f && f.name === nombre) as Record<string, unknown>
  const valores = (nombre: string) => (campo(nombre).options as { value: string }[]).map((o) => o.value)

  it('los tramos, los módulos y los estados son los de `cotizaciones.ts`', () => {
    expect(valores('residentes')).toEqual([...TRAMOS_DE_RESIDENTES])
    expect(valores('modulos')).toEqual(MODULOS_COTIZABLES.map((m) => m.slug))
    expect(valores('estado')).toEqual(ESTADOS_DE_COTIZACION.map((e) => e.valor))
    expect(campo('estado').defaultValue).toBe('nueva')
  })

  it('los largos de la base son los del formulario', () => {
    for (const nombre of ['nombre', 'institucion', 'cargo', 'mensaje', 'notas'] as const) {
      expect(campo(nombre).maxLength, nombre).toBe(LARGOS_DE_COTIZACION[nombre])
    }
  })

  it('cada estado tiene su etiqueta y su tono', () => {
    for (const { valor, etiqueta } of ESTADOS_DE_COTIZACION) {
      expect(esEstadoDeCotizacion(valor)).toBe(true)
      expect(etiquetaDeEstado(valor)).toBe(etiqueta)
      expect(TONO_DE_COTIZACION[valor]).toBeDefined()
    }
    expect(esEstadoDeCotizacion('borrada')).toBe(false)
  })
})

describe('actualizarCotizacion', () => {
  it('cambia solo lo que trae: el estado no pisa las notas', async () => {
    actualizar.mockReset()
    const r = await actualizarCotizacion('5', { estado: 'en-conversacion' })
    expect(r.exito).toBe(true)
    expect(actualizar.mock.calls[0][0].data).toEqual({ estado: 'en-conversacion' })
  })

  it('no toca lo que escribió quien pide, aunque se lo pasen', async () => {
    actualizar.mockReset()
    await actualizarCotizacion('5', { notas: ' Llamar el lunes. ', correo: 'otro@x.cl', mensaje: 'cambiado' })
    expect(actualizar.mock.calls[0][0].data).toEqual({ notas: 'Llamar el lunes.' })
  })

  it.each([
    ['un estado que no existe', { estado: 'borrada' }],
    ['notas demasiado largas', { notas: 'x'.repeat(LARGOS_DE_COTIZACION.notas + 1) }],
    ['notas que no son texto', { notas: 42 }],
    ['nada que guardar', {}],
  ])('rechaza %s sin escribir', async (_que, cambios) => {
    actualizar.mockReset()
    const r = await actualizarCotizacion('5', cambios)
    expect(r.exito).toBe(false)
    expect(actualizar).not.toHaveBeenCalled()
  })
})

describe('la tabla de planes', () => {
  it('cada fila de la comparativa está en un grupo, y en uno solo', () => {
    const agrupadas = GRUPOS_DE_LA_COMPARATIVA.flatMap((g) => g.filas)
    expect([...agrupadas].sort()).toEqual([...FILAS_DE_LA_COMPARATIVA].sort())
    expect(new Set(agrupadas).size).toBe(agrupadas.length)
  })

  it('cada fila dice qué incluye cada plan', () => {
    for (const fila of FILAS_DE_LA_COMPARATIVA) {
      expect(Object.keys(INCLUYE[fila]).sort(), fila).toEqual([...PLANES].sort())
    }
  })

  it('un plan mayor incluye todo lo del menor', () => {
    // La escalera que dicen los textos («Todo lo de Servicio», «Todo lo de
    // Programa»): si la tabla la rompe, la página se contradice a sí misma.
    for (const fila of FILAS_DE_LA_COMPARATIVA) {
      const vistos = PLANES.map((p) => INCLUYE[fila][p])
      expect(vistos, fila).toEqual([...vistos].sort((a, b) => Number(a) - Number(b)))
    }
  })

  it('el destacado es uno de los planes', () => {
    expect(PLANES).toContain(PLAN_DESTACADO)
  })
})
