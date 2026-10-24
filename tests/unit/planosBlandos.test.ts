import { describe, expect, it } from 'vitest'
import {
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
})
