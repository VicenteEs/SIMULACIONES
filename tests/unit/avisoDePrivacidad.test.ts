import { describe, expect, it } from 'vitest'
import {
  CORREO_DE_PRIVACIDAD,
  RESPONSABLE_DE_LOS_DATOS,
  VERSION_DEL_AVISO_DE_PRIVACIDAD,
  avisoCompleto,
  debeAceptarElAviso,
  diaDeLaVersion,
} from '@/lib/avisoDePrivacidad'

/**
 * A quién se le pide el aviso al entrar (D-292) y cuándo está el aviso en
 * condiciones de pedirse (D-294).
 *
 * La pantalla y la acción que anota la aceptación se prueban por su lado: la
 * guardia de `aceptarElAvisoDePrivacidad`, en `accionesConGuardia.test.ts`.
 */

describe('si el aviso está entero', () => {
  it('pide los dos espacios: quién responde de los datos y a quién se le escribe', () => {
    expect(avisoCompleto('Fulana de Tal', 'privacidad@ejemplo.cl')).toBe(true)
    expect(avisoCompleto('', 'privacidad@ejemplo.cl')).toBe(false)
    expect(avisoCompleto('Fulana de Tal', '')).toBe(false)
  })

  it('un espacio en blanco no cuenta como completado', () => {
    expect(avisoCompleto('   ', 'privacidad@ejemplo.cl')).toBe(false)
    expect(avisoCompleto('Fulana de Tal', '  ')).toBe(false)
  })

  it('sin argumentos mira lo que hay escrito en el aviso vigente', () => {
    expect(avisoCompleto()).toBe(RESPONSABLE_DE_LOS_DATOS.trim() !== '' && CORREO_DE_PRIVACIDAD.trim() !== '')
  })
})

describe('a qué cuenta se le pide el aviso al entrar', () => {
  const vigente = VERSION_DEL_AVISO_DE_PRIVACIDAD

  it('a la que no lo aceptó nunca: creada desde el panel, o anterior al aviso', () => {
    expect(debeAceptarElAviso({}, vigente, true)).toBe(true)
    expect(debeAceptarElAviso({ versionDelAvisoDePrivacidad: null }, vigente, true)).toBe(true)
  })

  it('a la que aceptó una versión anterior', () => {
    expect(debeAceptarElAviso({ versionDelAvisoDePrivacidad: '2026-10-01' }, vigente, true)).toBe(true)
  })

  it('no a la que aceptó la vigente', () => {
    expect(debeAceptarElAviso({ versionDelAvisoDePrivacidad: vigente }, vigente, true)).toBe(false)
  })

  it('a nadie mientras el aviso tenga espacios en blanco', () => {
    // Un consentimiento a un texto que no dice quién responde no prueba nada,
    // y habría que volver a pedirlo en cuanto se complete.
    expect(debeAceptarElAviso({}, vigente, false)).toBe(false)
    expect(debeAceptarElAviso({ versionDelAvisoDePrivacidad: '2026-10-01' }, vigente, false)).toBe(false)
  })

  it('sin cuenta no hay a quién pedírselo', () => {
    expect(debeAceptarElAviso(null, vigente, true)).toBe(false)
    expect(debeAceptarElAviso(undefined, vigente, true)).toBe(false)
  })
})

describe('la versión del aviso', () => {
  it('es un día, AAAA-MM-DD', () => {
    expect(VERSION_DEL_AVISO_DE_PRIVACIDAD).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(new Date(`${VERSION_DEL_AVISO_DE_PRIVACIDAD}T00:00:00Z`).getTime())).toBe(false)
  })

  it('se lee con su propio día, no con el anterior por la hora de Chile', () => {
    expect(diaDeLaVersion('2026-11-04')).toBe('4 de noviembre de 2026')
    expect(diaDeLaVersion('2027-01-01')).toBe('1 de enero de 2027')
  })
})
