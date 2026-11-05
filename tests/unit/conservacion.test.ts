import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MESES_DE_LAS_COTIZACIONES,
  MESES_DEL_REGISTRO_DE_ACCIONES,
  plazoEnPalabras,
  vencimiento,
} from '@/lib/conservacion'
import { CADA_PASADA_MS, PRIMERA_PASADA_MS, programarLaConservacion } from '@/lib/conservacionProgramada'
import {
  CORREO_RETIRADO,
  fallosSinCorreos,
  motivoSinCorreo,
  resumenDeLaConservacion,
  type ResultadoDeLaConservacion,
} from '@/lib/conservacionServidor'

/**
 * Los plazos de conservación (D-290) y la pasada diaria que los aplica.
 *
 * Lo que toca la base —qué se borra, qué pierde el nombre, que una segunda
 * pasada no encuentre nada— se prueba contra PostgreSQL en
 * `tests/integration/privacidad.test.ts`. Aquí, lo que se decide sin ella: la
 * fecha de corte, cómo se limpian los envíos fallidos, el texto que lee el
 * administrador y cuándo corre la pasada.
 */

describe('el corte de un plazo', () => {
  it('cuenta meses de calendario, no bloques de treinta días', () => {
    const ahora = new Date('2026-11-05T12:00:00Z')
    const corte = vencimiento(12, ahora)
    expect(corte.toISOString()).toBe('2025-11-05T12:00:00.000Z')
    // Con 360 días el corte caería cinco días después y se borraría antes de
    // lo que dice el aviso.
    expect((ahora.getTime() - corte.getTime()) / 86_400_000).toBe(365)
  })

  it('en UTC: la hora de Chile no mueve el corte de día', () => {
    // Las 02:00 UTC del 1 de abril son todavía el 31 de marzo en Santiago.
    expect(vencimiento(1, new Date('2026-04-01T02:00:00Z')).toISOString()).toBe('2026-03-01T02:00:00.000Z')
  })

  it('desde un 29 de febrero el corte cae un día después: se borra antes, nunca después', () => {
    // El 29 de febrero de 2027 no existe y JavaScript pasa al 1 de marzo. Lo
    // de ese día se borra uno antes de cumplir el año; el aviso promete que no
    // se guarda más de doce meses, y un día de menos no lo rompe.
    expect(vencimiento(12, new Date('2028-02-29T10:00:00Z')).toISOString()).toBe('2027-03-01T10:00:00.000Z')
  })

  it('no toca la fecha que recibe', () => {
    const ahora = new Date('2026-11-05T12:00:00Z')
    vencimiento(12, ahora)
    expect(ahora.toISOString()).toBe('2026-11-05T12:00:00.000Z')
  })

  it('el plazo, como se lee en el aviso', () => {
    expect(plazoEnPalabras(1)).toBe('1 mes')
    expect(plazoEnPalabras(MESES_DEL_REGISTRO_DE_ACCIONES)).toBe('12 meses')
    expect(plazoEnPalabras(MESES_DE_LAS_COTIZACIONES)).toBe('12 meses')
  })
})

describe('los envíos fallidos sin la dirección de quien ya no está', () => {
  it('quita la dirección del motivo aunque el servidor de correo la escriba con otras mayúsculas', () => {
    expect(motivoSinCorreo('550 5.1.1 <Fulana@Hospital.cl>: Recipient address rejected', 'fulana@hospital.cl')).toBe(
      `550 5.1.1 <${CORREO_RETIRADO}>: Recipient address rejected`,
    )
  })

  it('una dirección con signos de expresión regular no se lee como patrón', () => {
    // Como patrón, «a+b@x.cl» casaría «aab@xxcl»: borraría lo que no es.
    expect(motivoSinCorreo('rechazado: aab@xxcl', 'a+b@x.cl')).toBe('rechazado: aab@xxcl')
    expect(motivoSinCorreo('rechazado: a+b@x.cl', 'a+b@x.cl')).toBe(`rechazado: ${CORREO_RETIRADO}`)
  })

  it('lo que no es texto pasa tal cual', () => {
    expect(motivoSinCorreo(null, 'a@b.cl')).toBeNull()
    expect(motivoSinCorreo({ codigo: 550 }, 'a@b.cl')).toEqual({ codigo: 550 })
    expect(motivoSinCorreo('sin dirección', '')).toBe('sin dirección')
  })

  it('el envío fallido sigue contando, solo deja de decir a quién', () => {
    const fallos = [
      { correo: 'fulana@hospital.cl', motivo: 'buzón lleno: fulana@hospital.cl' },
      { correo: 'sigue@hospital.cl', motivo: 'tiempo agotado' },
    ]
    const limpios = fallosSinCorreos(fallos, (correo) => correo === 'fulana@hospital.cl')
    expect(limpios).toEqual([
      { correo: null, motivo: `buzón lleno: ${CORREO_RETIRADO}` },
      { correo: 'sigue@hospital.cl', motivo: 'tiempo agotado' },
    ])
    // No muta lo que recibe: la fila leída de la base sigue como estaba.
    expect(fallos[0].correo).toBe('fulana@hospital.cl')
  })

  it('null si no había nada que quitar, para no reescribir la difusión', () => {
    expect(fallosSinCorreos([{ correo: 'sigue@hospital.cl' }], () => false)).toBeNull()
    expect(fallosSinCorreos([{ correo: null, motivo: 'ya limpio' }], () => true)).toBeNull()
    expect(fallosSinCorreos(undefined, () => true)).toBeNull()
  })
})

describe('el resumen que lee el administrador en el registro', () => {
  const nada: ResultadoDeLaConservacion = {
    accionesVencidas: 0,
    cotizacionesVencidas: 0,
    accionesAnonimizadas: 0,
    titulosRetirados: 0,
    difusionesRetocadas: 0,
    preferenciasHuerfanas: 0,
  }

  it('vacío si no hizo nada: una línea diaria de «nada» enterraría las que dicen algo', () => {
    expect(resumenDeLaConservacion(nada)).toBe('')
  })

  it('cuenta cada cosa que hizo, con el plazo en palabras', () => {
    const texto = resumenDeLaConservacion({
      accionesVencidas: 3,
      cotizacionesVencidas: 2,
      accionesAnonimizadas: 5,
      titulosRetirados: 1,
      difusionesRetocadas: 4,
      preferenciasHuerfanas: 6,
    })
    expect(texto.split(' · ')).toEqual([
      'borró 3 entradas del registro de más de 12 meses',
      'borró 2 cotizaciones de más de 12 meses',
      'quitó el nombre y el correo a 5 entradas de cuentas eliminadas',
      'corrigió el título de 1 entradas',
      'quitó direcciones de cuentas eliminadas en 4 difusiones',
      'borró 6 preferencias de cuentas eliminadas',
    ])
  })

  it('solo lo que hizo', () => {
    expect(resumenDeLaConservacion({ ...nada, preferenciasHuerfanas: 1 })).toBe('borró 1 preferencias de cuentas eliminadas')
  })
})

describe('cuándo corre la pasada', () => {
  const MARCA = Symbol.for('traumahub.conservacionProgramada')
  const soltarLaMarca = () => {
    delete (globalThis as Record<symbol, unknown>)[MARCA]
  }
  beforeEach(soltarLaMarca)
  afterEach(soltarLaMarca)

  /** Un reloj que apunta lo que se le pide en vez de esperar. */
  const relojFalso = () => {
    const pedidos: { tipo: 'una vez' | 'cada'; fn: () => void; ms: number; suelto: boolean }[] = []
    const programar = (tipo: 'una vez' | 'cada') => (fn: () => void, ms: number) => {
      const pedido = { tipo, fn, ms, suelto: false }
      pedidos.push(pedido)
      return {
        unref: () => {
          pedido.suelto = true
        },
      }
    }
    return { pedidos, reloj: { setTimeout: programar('una vez'), setInterval: programar('cada') } }
  }

  it('la primera a los cinco minutos y después una al día, con los relojes sueltos', () => {
    const { pedidos, reloj } = relojFalso()
    const ejecutar = vi.fn(async () => {})

    expect(programarLaConservacion(ejecutar, reloj)).toBe(true)
    expect(pedidos).toHaveLength(1)
    // Suelto: una pasada pendiente no impide que el contenedor se detenga.
    expect(pedidos[0]).toMatchObject({ tipo: 'una vez', ms: PRIMERA_PASADA_MS, suelto: true })
    expect(ejecutar).not.toHaveBeenCalled()

    pedidos[0].fn()
    expect(ejecutar).toHaveBeenCalledTimes(1)
    expect(pedidos[1]).toMatchObject({ tipo: 'cada', ms: CADA_PASADA_MS, suelto: true })

    pedidos[1].fn()
    expect(ejecutar).toHaveBeenCalledTimes(2)
  })

  it('una sola vez por proceso: la recarga en caliente no programa otra', () => {
    const { pedidos, reloj } = relojFalso()
    expect(programarLaConservacion(vi.fn(async () => {}), reloj)).toBe(true)
    expect(programarLaConservacion(vi.fn(async () => {}), reloj)).toBe(false)
    expect(pedidos).toHaveLength(1)
  })

  it('una pasada que falla no tumba el servidor: se anota y la del día siguiente sigue programada', async () => {
    const { pedidos, reloj } = relojFalso()
    const anotar = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      programarLaConservacion(
        vi.fn(async () => {
          throw new Error('sin base')
        }),
        reloj,
      )
      expect(() => pedidos[0].fn()).not.toThrow()
      expect(pedidos[1]?.tipo).toBe('cada')
      await vi.waitFor(() => expect(anotar).toHaveBeenCalledWith('[conservación]', expect.any(Error)))
    } finally {
      anotar.mockRestore()
    }
  })
})
