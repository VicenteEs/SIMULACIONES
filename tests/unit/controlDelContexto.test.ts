import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONTEXTO_VIVO,
  ESPERA_ANTES_DE_OFRECER_MS,
  ESPERA_PARA_REMONTAR_SOLO_MS,
  PIXELES_MAXIMOS_DEL_LIENZO,
  TIEMPO_DEL_AVISO_DE_RECUPERADO_MS,
  alPerderse,
  alRestaurarse,
  calidadDelDibujo,
  cuantoFaltaParaRemontarse,
  razonDePixeles,
  crearLimitadorDeFallos,
  loQueSeEnseña,
} from '@/lib/controlDelContexto'

/**
 * La pantalla que se queda en blanco (P-004 E2).
 *
 * El lienzo pierde el contexto de WebGL o su bucle de dibujo muere por una excepción; la cuenta de qué decir y
 * cuándo ofrecer volver a montarlo es pura y se prueba aquí. Que el lienzo la llame, y que el bucle no muera, lo
 * dicen las pruebas que leen el código y la de navegador de la bitácora.
 */

const fuente = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')

describe('el estado del contexto', () => {
  it('empieza vivo y no enseña nada', () => {
    expect(CONTEXTO_VIVO).toEqual({ fase: 'vivo' })
    expect(loQueSeEnseña(CONTEXTO_VIVO, 12_345)).toEqual({ mensaje: null, ofrecerRecuperar: false, urgente: false })
  })

  it('perderlo dice que se está recuperando, sin ofrecer nada todavía', () => {
    const perdido = alPerderse(CONTEXTO_VIVO, 1000)
    expect(perdido).toEqual({ fase: 'perdido', desde: 1000 })
    const enseña = loQueSeEnseña(perdido, 1000 + ESPERA_ANTES_DE_OFRECER_MS - 1)
    expect(enseña.mensaje).toContain('se está recuperando')
    expect(enseña.ofrecerRecuperar).toBe(false)
    expect(enseña.urgente).toBe(false)
  })

  it('si pasa la espera sin que vuelva, ofrece volver a montar el lienzo y se vuelve urgente', () => {
    const perdido = alPerderse(CONTEXTO_VIVO, 1000)
    const enseña = loQueSeEnseña(perdido, 1000 + ESPERA_ANTES_DE_OFRECER_MS)
    expect(enseña.ofrecerRecuperar).toBe(true)
    expect(enseña.urgente).toBe(true)
    // Y le dice que no pierde nada, que es lo que más importa a quien lleva un ensayo a medias.
    expect(enseña.mensaje).toMatch(/caso, los pasos y el puntaje se quedan como están/)
  })

  it('perderlo dos veces seguidas no reinicia la cuenta de la espera', () => {
    const primero = alPerderse(CONTEXTO_VIVO, 1000)
    expect(alPerderse(primero, 2500)).toBe(primero)
  })

  it('al volver, lo dice un rato y luego se calla', () => {
    const recuperado = alRestaurarse(alPerderse(CONTEXTO_VIVO, 1000), 1800)
    expect(recuperado).toEqual({ fase: 'recuperado', en: 1800 })
    expect(loQueSeEnseña(recuperado, 1900).mensaje).toBe('La imagen volvió.')
    expect(loQueSeEnseña(recuperado, 1800 + TIEMPO_DEL_AVISO_DE_RECUPERADO_MS).mensaje).toBeNull()
  })

  it('«restaurado» sin haberse perdido no inventa una recuperación', () => {
    expect(alRestaurarse(CONTEXTO_VIVO, 500)).toBe(CONTEXTO_VIVO)
  })
})

describe('el limitador de fallos', () => {
  it('avisa solo la primera vez de cada etapa y cuenta el resto', () => {
    const fallos = crearLimitadorDeFallos()
    expect(fallos.registrar('asas')).toBe(true)
    expect(fallos.registrar('asas')).toBe(false)
    expect(fallos.registrar('asas')).toBe(false)
    expect(fallos.registrar('imagen')).toBe(true)
    expect(fallos.repeticiones('asas')).toBe(3)
    expect(fallos.etapas()).toEqual(['asas', 'imagen'])
  })

  it('reiniciar vuelve a avisar', () => {
    const fallos = crearLimitadorDeFallos()
    fallos.registrar('imagen')
    fallos.reiniciar()
    expect(fallos.registrar('imagen')).toBe(true)
  })
})

describe('el lienzo y la consola usan esto', () => {
  const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

  it('el lienzo escucha la pérdida y la vuelta del contexto, y detiene el comportamiento por omisión', () => {
    expect(lienzo).toMatch(/addEventListener\('webglcontextlost', alPerderElContexto\)/)
    expect(lienzo).toMatch(/addEventListener\('webglcontextrestored', alRecuperarElContexto\)/)
    // Sin `preventDefault` el navegador no devuelve el contexto: es la línea que importa.
    expect(lienzo).toMatch(/alPerderElContexto = \(evento: Event\) => \{\s*evento\.preventDefault\(\)/)
  })

  it('los quita antes de perder el contexto a propósito al desmontar', () => {
    const quitar = lienzo.indexOf("removeEventListener('webglcontextlost', alPerderElContexto)")
    const forzar = lienzo.indexOf('render.forceContextLoss()')
    expect(quitar).toBeGreaterThan(-1)
    expect(forzar).toBeGreaterThan(quitar)
  })

  it('el bucle de dibujo no muere por una excepción: cada etapa va en su try', () => {
    expect(lienzo).toMatch(/const sinCaerse = \(etapa: string, hacer: \(\) => void\) => \{\s*try \{/)
    for (const etapa of ["'asas'", "'controles'", "'guías'", "'imagen'"]) {
      expect(lienzo, etapa).toContain(`sinCaerse(${etapa}`)
    }
    // El dibujo en sí ya no va suelto en el cuerpo del bucle.
    expect(lienzo).not.toMatch(/\n {6}render\.render\(escena, camara\)\n/)
  })

  it('no dibuja con el contexto perdido', () => {
    expect(lienzo).toMatch(/render\.getContext\(\)\.isContextLost\(\)\) return/)
  })

  it('la consola monta el lienzo con una clave y ofrece «Recuperar la vista»', () => {
    expect(consola).toMatch(/<LienzoQuirurgico\s+key=\{claveDelLienzo\}/)
    expect(consola).toContain('alCambiarElContexto={setEstadoDelContexto}')
    expect(consola).toContain('Recuperar la vista')
    expect(consola).toMatch(/setClaveDelLienzo\(\(c\) => c \+ 1\)/)
  })

  it('el mando ofrece medir la memoria y provocar la pérdida, para poder probarlo', () => {
    expect(lienzo).toContain('estadisticasDelDibujo: () => {')
    expect(lienzo).toContain("getExtension('WEBGL_lose_context')")
  })
})

describe('más margen contra el blanco (pedido del dueño)', () => {
  it('se espera más antes de ofrecer el botón, y más aún antes de volver a montar sola', () => {
    expect(ESPERA_ANTES_DE_OFRECER_MS).toBeGreaterThanOrEqual(10_000)
    expect(ESPERA_PARA_REMONTAR_SOLO_MS).toBeGreaterThan(ESPERA_ANTES_DE_OFRECER_MS)
  })

  it('dice cuánto falta para volver a montar sola, y solo si se perdió', () => {
    const perdido = alPerderse(CONTEXTO_VIVO, 1000)
    expect(cuantoFaltaParaRemontarse(perdido, 1000)).toBe(ESPERA_PARA_REMONTAR_SOLO_MS)
    expect(cuantoFaltaParaRemontarse(perdido, 1000 + ESPERA_PARA_REMONTAR_SOLO_MS - 1)).toBe(1)
    expect(cuantoFaltaParaRemontarse(perdido, 1000 + ESPERA_PARA_REMONTAR_SOLO_MS)).toBe(0)
    expect(cuantoFaltaParaRemontarse(perdido, 1_000_000)).toBe(0)
    expect(cuantoFaltaParaRemontarse(CONTEXTO_VIVO, 1_000_000)).toBeNull()
    expect(cuantoFaltaParaRemontarse(alRestaurarse(perdido, 2000), 1_000_000)).toBeNull()
  })

  it('cada pérdida baja el detalle: primero la resolución, luego el suavizado', () => {
    expect(calidadDelDibujo(0)).toEqual({ razonMaxima: 2, suavizado: true })
    expect(calidadDelDibujo(1)).toEqual({ razonMaxima: 1.5, suavizado: true })
    expect(calidadDelDibujo(2)).toEqual({ razonMaxima: 1, suavizado: false })
    expect(calidadDelDibujo(9)).toEqual({ razonMaxima: 1, suavizado: false })
  })

  it('la razón de píxeles respeta la pantalla, la calidad y la memoria', () => {
    // Un lienzo normal en pantalla de alta densidad: manda el tope de la calidad.
    expect(razonDePixeles(3, 800, 500, 2)).toBe(2)
    // Un lienzo enorme: manda la memoria, para no pasar de los píxeles máximos.
    const r = razonDePixeles(2, 2400, 1200, 2)
    expect(2400 * r * 1200 * r).toBeLessThanOrEqual(PIXELES_MAXIMOS_DEL_LIENZO * 1.001)
    // Una pantalla de densidad 1 no se amplía.
    expect(razonDePixeles(1, 800, 500, 2)).toBe(1)
    // Nunca baja de media razón, por feo que sea el lienzo.
    expect(razonDePixeles(2, 20000, 20000, 2)).toBe(0.5)
  })

  it('el lienzo cuenta las pérdidas y pide menos al volver a montarse', () => {
    const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
    expect(lienzo).toContain('perdidasDeContexto += 1')
    expect(lienzo).toContain('calidadDelDibujo(perdidasDeContexto)')
    expect(lienzo).toContain("powerPreference: 'high-performance'")
  })
})
