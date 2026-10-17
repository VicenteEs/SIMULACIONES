import { describe, expect, it } from 'vitest'
import { pesoDeRetraccion, retraerVertices } from '@/lib/retraccion'

/** Una fila de vértices a lo largo de x, cada 10 unidades. */
const FILA = Float32Array.from([0, 10, 20, 30, 40, 100, 200, 400].flatMap((x) => [x, 0, 0]))

describe('retraer un músculo sin cortarlo (P-003 E10)', () => {
  it('el peso es 1 en el apoyo, baja con la distancia y vale exactamente 0 lejos', () => {
    expect(pesoDeRetraccion(0, 40)).toBeCloseTo(1, 10)
    expect(pesoDeRetraccion(20, 40)).toBeLessThan(1)
    expect(pesoDeRetraccion(20, 40)).toBeGreaterThan(pesoDeRetraccion(60, 40))
    expect(pesoDeRetraccion(120, 40)).toBe(0)
    expect(pesoDeRetraccion(500, 40)).toBe(0)
  })

  it('el peso es continuo: no hay escalón en el límite', () => {
    expect(pesoDeRetraccion(119.999, 40)).toBeLessThan(1e-3)
  })

  it('el punto de apoyo se mueve lo que abre el separador', () => {
    const salida = new Float32Array(FILA.length)
    retraerVertices(FILA, salida, [0, 0, 0], [0, 1, 0], 15, 40)
    expect(salida[1]).toBeCloseTo(15, 4)
    expect(salida[0]).toBeCloseTo(0, 6)
  })

  it('nada se mueve fuera del radio', () => {
    const salida = new Float32Array(FILA.length)
    const movidos = retraerVertices(FILA, salida, [0, 0, 0], [0, 1, 0], 15, 40)
    // Los vértices a 200 y 400 de distancia quedan exactamente donde estaban.
    expect(salida[3 * 6 + 1]).toBe(0)
    expect(salida[3 * 7 + 1]).toBe(0)
    expect(movidos).toBeLessThan(FILA.length / 3)
  })

  it('cerrar devuelve cada vértice a su sitio, y repetir la misma apertura no suma', () => {
    const salida = new Float32Array(FILA.length)
    retraerVertices(FILA, salida, [0, 0, 0], [0, 1, 0], 15, 40)
    const una = Array.from(salida)
    retraerVertices(FILA, salida, [0, 0, 0], [0, 1, 0], 15, 40)
    expect(Array.from(salida)).toEqual(una)
    retraerVertices(FILA, salida, [0, 0, 0], [0, 1, 0], 0, 40)
    expect(Array.from(salida)).toEqual(Array.from(FILA))
  })

  it('cuenta cuántos vértices se movieron: cero si el apoyo cae lejos del músculo', () => {
    const salida = new Float32Array(FILA.length)
    expect(retraerVertices(FILA, salida, [5000, 0, 0], [0, 1, 0], 15, 40)).toBe(0)
  })

  it('va en la dirección que se le da', () => {
    const salida = new Float32Array(FILA.length)
    retraerVertices(FILA, salida, [0, 0, 0], [0, 0, -1], 10, 40)
    expect(salida[2]).toBeCloseTo(-10, 4)
    expect(salida[1]).toBe(0)
  })
})
