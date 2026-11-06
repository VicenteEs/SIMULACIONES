import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { incisionQueAlarga, UMBRAL_PARA_ALARGAR_MM, type Punto } from '@/lib/incisiones'
import { largoDelTrazo } from '@/lib/reduccion'
import { evaluarGesto, RESULTADOS, type PasoQuirurgico } from '@/lib/simulador'

/**
 * Alargar una incisión corta (P-013, pedido 15 de Cristóbal: «necesito poder extender incisiones que me hayan quedado
 * cortas»).
 *
 * Unir el trazo nuevo a la incisión ya existía (D-181), pero el paso medía solo el pedazo nuevo: quien abría 40 mm, veía
 * que le faltaban y añadía 30 recibía «corta» por los 30. Ahora el lienzo le pasa a la consola la incisión unida, que es
 * lo que se mide; y con un instrumento que corta en la mano se ven sus puntas, desde donde se alarga.
 */

/** Una recta sobre el eje x, en metros (como el atlas), de `desdeMm` a `hastaMm`, con un punto por milímetro. */
const recta = (desdeMm: number, hastaMm: number): Punto[] =>
  Array.from({ length: Math.round(Math.abs(hastaMm - desdeMm)) + 1 }, (_, i) => [(desdeMm + Math.sign(hastaMm - desdeMm) * i) / 1000, 0, 0] as const)
const normales = (n: number): Punto[] => Array.from({ length: n }, () => [0, 0, 1] as const)
const aObjetos = (p: Punto[]) => p.map(([x, y, z]) => ({ x, y, z }))

describe('la incisión alargada se mide entera (P-013, pedido 15)', () => {
  const corta = recta(0, 40)
  const existentes = [{ id: 1, capa: 'piel', puntos: corta, normales: normales(corta.length) }]
  // Empieza a 3 mm de la punta: dentro de los 5 mm que la unen.
  const pedazo = recta(43, 73)
  const unida = incisionQueAlarga(existentes, 'piel', { puntos: pedazo, normales: normales(pedazo.length) }, UMBRAL_PARA_ALARGAR_MM / 1000)

  it('el trazo que empieza junto a una punta alarga esa incisión, y la unida mide lo de las dos', () => {
    expect(unida?.id).toBe(1)
    expect(largoDelTrazo(aObjetos(pedazo))).toBe(30)
    expect(largoDelTrazo(aObjetos([...unida!.unida.puntos]))).toBe(73)
  })

  it('el paso que pide de 60 a 100 mm aprueba la unida y no el pedazo', () => {
    const paso: PasoQuirurgico = { titulo: 'Incisión', objetivo: 'trazo', instrumento: 'b', trazoMinimo: 60, trazoMaximo: 100 }
    const conElPedazo = evaluarGesto(paso, { instrumento: 'b', trazo: largoDelTrazo(aObjetos(pedazo)) })
    const conLaUnida = evaluarGesto(paso, { instrumento: 'b', trazo: largoDelTrazo(aObjetos([...unida!.unida.puntos])) })
    expect(conElPedazo.resultado).not.toBe(RESULTADOS.CORRECTO)
    expect(conLaUnida.resultado).toBe(RESULTADOS.CORRECTO)
  })
})

describe('el lienzo pasa la unida y enseña las puntas', () => {
  const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
  const consola = readFileSync(join(process.cwd(), 'src/components/simulador/ConsolaQuirurgica.tsx'), 'utf8')

  it('al alargar, la consola recibe la incisión unida como trazo, y se dice cuánto mide', () => {
    const corte = lienzo.slice(lienzo.indexOf('if (!previo) ultimas.current.alIncidir?.({ id, capa: plano })'), lienzo.indexOf('for (const herida of hechas) {\n          if (yaCortadas'))
    expect(corte).toContain('if (alargada) {')
    expect(corte).toContain('ultimas.current.alTrazar?.([...t.puntosDelTrazo])')
    expect(corte).toContain('Incisión alargada: ahora mide')
    expect(lienzo).toContain('alargada = true')
  })

  it('las puntas salen con un instrumento que corta, por capa, y se ponen al día en cada cuadro', () => {
    expect(lienzo).toContain('const puntasAlDia = (): boolean => {')
    expect(lienzo).toContain("(c.plano === 'piel') === (plano === 'piel')")
    expect(lienzo).toContain('if (puntasAlDia()) sucio = true')
    expect(lienzo).toContain('punta.raycast = () => {}')
  })

  it('el panel del bisturí dice cómo se alarga', () => {
    expect(consola).toContain('Para alargar una incisión corta, empiece el trazo nuevo a menos de 5 mm de una de sus puntas')
  })
})
