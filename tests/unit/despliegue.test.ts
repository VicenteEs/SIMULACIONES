import { describe, expect, it } from 'vitest'
import { despliegueActual } from '@/lib/despliegue'

describe('despliegueActual', () => {
  // Si cambiara entre dos llamadas, cada latido del flujo parecería un proceso
  // distinto y las pestañas se recargarían cada quince segundos.
  it('contesta lo mismo durante toda la vida del proceso', () => {
    const una = despliegueActual()
    const otra = despliegueActual()
    expect(otra).toBe(una)
    expect(una.despliegue).not.toBe('')
    expect(una.arranque).toBeGreaterThan(0)
  })
})
