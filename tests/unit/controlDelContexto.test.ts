import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONTEXTO_VIVO,
  ESPERA_ANTES_DE_OFRECER_MS,
  TIEMPO_DEL_AVISO_DE_RECUPERADO_MS,
  alPerderse,
  alRestaurarse,
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
