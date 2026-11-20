import { describe, expect, it } from 'vitest'
import {
  cuentaParaElPaso,
  NOMBRE_DEL_PLANO,
  PLANOS_BLANDOS,
  PROFUNDIDAD_DEL_PLANO,
  planoDelRol,
  planoQueCorta,
} from '@/lib/planosBlandos'

describe('los planos de partes blandas', () => {
  it('van de la superficie hacia dentro: piel, fascia, músculo', () => {
    expect(PLANOS_BLANDOS).toEqual(['piel', 'fascia', 'musculo'])
    expect(PROFUNDIDAD_DEL_PLANO.piel).toBeLessThan(PROFUNDIDAD_DEL_PLANO.fascia)
    expect(PROFUNDIDAD_DEL_PLANO.fascia).toBeLessThan(PROFUNDIDAD_DEL_PLANO.musculo)
    for (const p of PLANOS_BLANDOS) expect(NOMBRE_DEL_PLANO[p].length).toBeGreaterThan(0)
  })

  it('el papel de una pieza dice su plano, y el hueso no tiene', () => {
    expect(planoDelRol('piel')).toBe('piel')
    expect(planoDelRol('fascia')).toBe('fascia')
    expect(planoDelRol('musculo')).toBe('musculo')
    expect(planoDelRol('hueso')).toBeNull()
    expect(planoDelRol('fragmento')).toBeNull()
    expect(planoDelRol(undefined)).toBeNull()
  })
})

describe('qué plano corta un trazo profundo', () => {
  it('con fascia sin abrir, el primer trazo profundo abre la fascia y no el músculo', () => {
    expect(planoQueCorta('musculo', { hayFascia: true, fasciaAbierta: false })).toEqual({ plano: 'fascia', redirigido: true })
  })

  it('con la fascia ya abierta, el siguiente trazo profundo llega al músculo', () => {
    expect(planoQueCorta('musculo', { hayFascia: true, fasciaAbierta: true })).toEqual({ plano: 'musculo', redirigido: false })
  })

  it('sin fascia visible —un caso viejo, o la capa apagada— el trazo profundo corta el músculo como siempre', () => {
    expect(planoQueCorta('musculo', { hayFascia: false, fasciaAbierta: false })).toEqual({ plano: 'musculo', redirigido: false })
  })

  it('el bisturí de piel nunca se redirige, haya o no fascia', () => {
    expect(planoQueCorta('piel', { hayFascia: true, fasciaAbierta: false })).toEqual({ plano: 'piel', redirigido: false })
    expect(planoQueCorta('piel', { hayFascia: false, fasciaAbierta: false })).toEqual({ plano: 'piel', redirigido: false })
  })

  it('un trazo que ya pide la fascia la corta, y no se redirige', () => {
    expect(planoQueCorta('fascia', { hayFascia: true, fasciaAbierta: false })).toEqual({ plano: 'fascia', redirigido: false })
  })

  it('con la fascia abierta, el trazo que no la repasa —la barra de una T, el brazo de una L— la corta a ella (D-421)', () => {
    expect(planoQueCorta('musculo', { hayFascia: true, fasciaAbierta: true, repasaLaFascia: false })).toEqual({
      plano: 'fascia',
      redirigido: true,
    })
  })

  it('con la fascia abierta, el trazo que va por su herida llega al músculo', () => {
    expect(planoQueCorta('musculo', { hayFascia: true, fasciaAbierta: true, repasaLaFascia: true })).toEqual({
      plano: 'musculo',
      redirigido: false,
    })
  })

  it('sin saber si repasa —un trazo de menos de tres puntos, que no da para decidirlo— se queda como antes: al músculo', () => {
    // Un toque con el bisturí profundo sobre la fascia ya abierta no debe abrir fascia nueva: no se sabe hacia dónde iba.
    expect(planoQueCorta('musculo', { hayFascia: true, fasciaAbierta: true, repasaLaFascia: undefined })).toEqual({
      plano: 'musculo',
      redirigido: false,
    })
  })
})

describe('qué trazos cambian lo que mide un paso de trazo (D-414)', () => {
  // Cristóbal, 2026-11-17: en el paso de la incisión, la de piel medía 92 mm y un trazo hondo de 31 la dejó «dentro» de
  // los 25–80 mm. La medida era siempre la del último trazo, de cualquier bisturí.
  it('en el paso de la incisión de piel, un trazo del bisturí profundo —en la fascia o en el músculo— no cuenta', () => {
    expect(cuentaParaElPaso('musculo', 'piel')).toBe(false)
    expect(cuentaParaElPaso('fascia', 'piel')).toBe(false)
    expect(cuentaParaElPaso('piel', 'piel')).toBe(true)
  })

  it('en un paso del bisturí profundo cuenta lo hondo, abra la fascia o el músculo, y no la piel', () => {
    expect(cuentaParaElPaso('fascia', 'musculo')).toBe(true)
    expect(cuentaParaElPaso('musculo', 'musculo')).toBe(true)
    expect(cuentaParaElPaso('piel', 'musculo')).toBe(false)
  })

  it('borrar el trazo —sin plano— cuenta siempre: pasar de paso o reiniciar pone la medida a cero', () => {
    expect(cuentaParaElPaso(undefined, 'piel')).toBe(true)
    expect(cuentaParaElPaso(undefined, 'musculo')).toBe(true)
  })

  it('en un paso que no mide un trazo, o con un instrumento que no corta, todo cuenta, como antes', () => {
    expect(cuentaParaElPaso('musculo', null)).toBe(true)
    expect(cuentaParaElPaso('piel', null)).toBe(true)
    expect(cuentaParaElPaso(null, 'piel')).toBe(true)
  })
})
