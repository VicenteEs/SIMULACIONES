import { describe, expect, it } from 'vitest'
import {
  DIAS_DE_AVISO,
  diaEnChile,
  estadoDelPlazo,
  finDelDiaEnChile,
  leerDatosDeInstitucion,
} from '@/lib/instituciones'

/**
 * El plazo de una institución y el formulario que lo fija (P-016 E5.5, D-400).
 *
 * El plazo decide el bloqueo (E5.8): un día de más o de menos es una
 * institución que entra cuando no debía, o que queda fuera el último día que
 * pagó. Por eso las fechas se fijan con instantes exactos y en las dos horas de
 * Chile.
 */

describe('el último día, en Chile', () => {
  it('en verano (UTC−3) termina a las 02:59:59.999 del día siguiente en UTC', () => {
    expect(finDelDiaEnChile('2026-12-01')?.toISOString()).toBe('2026-12-02T02:59:59.999Z')
  })

  it('en invierno (UTC−4), una hora después', () => {
    expect(finDelDiaEnChile('2026-06-15')?.toISOString()).toBe('2026-06-16T03:59:59.999Z')
  })

  it('una fecha que no existe no es una fecha', () => {
    for (const mala of ['2026-02-30', '2026-13-01', '1-12-2026', '', 'mañana']) {
      expect(finDelDiaEnChile(mala), mala).toBeNull()
    }
  })

  it('y el día de un instante es el de Chile, no el de UTC', () => {
    // Las 23:30 del 1 de diciembre en Chile ya son el 2 en UTC.
    expect(diaEnChile(new Date('2026-12-02T02:30:00Z'))).toBe('2026-12-01')
    expect(diaEnChile(finDelDiaEnChile('2026-12-01')!)).toBe('2026-12-01')
  })
})

describe('en qué punto del plazo está', () => {
  const fin = finDelDiaEnChile('2026-12-01')!

  it('el último día todavía vale; un instante después, vencida', () => {
    expect(estadoDelPlazo(fin, new Date(fin.getTime() - 1)).estado).toBe('por-vencer')
    expect(estadoDelPlazo(fin, fin).estado).toBe('vencida')
    expect(estadoDelPlazo(fin, new Date(fin.getTime() + 3 * 86_400_000))).toEqual({ estado: 'vencida', dias: 3 })
  })

  it(`avisa desde ${DIAS_DE_AVISO} días antes, contados hacia arriba`, () => {
    const antes = (dias: number) => new Date(fin.getTime() - dias * 86_400_000)
    expect(estadoDelPlazo(fin, antes(DIAS_DE_AVISO + 1)).estado).toBe('vigente')
    expect(estadoDelPlazo(fin, antes(DIAS_DE_AVISO))).toEqual({ estado: 'por-vencer', dias: DIAS_DE_AVISO })
    expect(estadoDelPlazo(fin, antes(0.5))).toEqual({ estado: 'por-vencer', dias: 1 })
  })

  it('sin fecha no vence, y una fecha ilegible cuenta como vencida', () => {
    expect(estadoDelPlazo(null).estado).toBe('sin-termino')
    expect(estadoDelPlazo('').estado).toBe('sin-termino')
    expect(estadoDelPlazo('no es una fecha').estado).toBe('vencida')
  })
})

describe('el formulario', () => {
  const bueno = {
    nombre: 'Hospital Regional',
    subdominio: ' HRegional ',
    modalidad: 'piloto',
    inicio: '2026-11-16',
    vence: '2026-12-01',
    cupo: '30',
    correoDelAdministrador: 'Ana@Hospital.CL',
    nombreDelAdministrador: 'Ana Pérez',
  }

  it('lo bueno pasa, normalizado', () => {
    const { datos, problemas } = leerDatosDeInstitucion(bueno, 'crear', '2026-11-16')
    expect(problemas).toEqual({})
    expect(datos).toMatchObject({ subdominio: 'hregional', cupo: 30, correoDelAdministrador: 'ana@hospital.cl' })
  })

  it('un piloto sin término dura los 15 días de siempre; una definitiva, sin término', () => {
    expect(leerDatosDeInstitucion({ ...bueno, vence: '' }, 'crear', '2026-11-16').datos.vence).toBe('2026-12-01')
    const definitiva = leerDatosDeInstitucion({ ...bueno, modalidad: 'definitiva', vence: '' }, 'crear', '2026-11-16')
    expect(definitiva.problemas).toEqual({})
    expect(definitiva.datos.vence).toBe('')
  })

  it('dice qué está mal, campo a campo', () => {
    const { problemas } = leerDatosDeInstitucion(
      {
        ...bueno,
        nombre: 'H',
        subdominio: 'www',
        modalidad: 'gratis',
        vence: '2026-11-01',
        cupo: '2.5',
        correoDelAdministrador: 'no-es-correo',
        nombreDelAdministrador: '',
      },
      'crear',
      '2026-11-16',
    )
    expect(Object.keys(problemas).sort()).toEqual(
      ['correoDelAdministrador', 'cupo', 'modalidad', 'nombre', 'nombreDelAdministrador', 'subdominio', 'vence'].sort(),
    )
    expect(problemas.subdominio).toMatch(/reservado/)
  })

  it('el término no puede ser antes del inicio', () => {
    const { problemas } = leerDatosDeInstitucion({ ...bueno, vence: '2026-11-15' }, 'crear', '2026-11-16')
    expect(problemas.vence).toMatch(/antes del inicio/)
  })

  it('al cambiar, el subdominio, el inicio y quién administra no se miran', () => {
    const { problemas } = leerDatosDeInstitucion(
      { ...bueno, subdominio: '', inicio: 'basura', nombreDelAdministrador: '', vence: '2026-10-01' },
      'cambiar',
      '2026-11-16',
    )
    // Un término ya pasado sí vale al cambiar: es como se bloquea a mano.
    expect(problemas).toEqual({})
  })

  it('un piloto necesita término también al cambiar', () => {
    const { problemas } = leerDatosDeInstitucion({ ...bueno, vence: '' }, 'cambiar', '2026-11-16')
    expect(problemas.vence).toMatch(/necesita fecha/)
  })
})
