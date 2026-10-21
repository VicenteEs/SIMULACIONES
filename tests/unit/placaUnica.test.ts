import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Una sola placa y su panel con números (P-004 E6, pedidos 2 y 5).
 *
 * Lo que se vigila es lo que no se puede probar sin pintar el lienzo: que con una placa puesta la de la mano no se
 * pinte, y que el panel hable de proximal y distal con campos que se escriben.
 */

const fuente = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')
const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

describe('una sola placa', () => {
  const posar = lienzo.slice(lienzo.indexOf('const posarHerramienta = '), lienzo.indexOf('taller.current.herramientaAlCentro = '))

  it('con una placa puesta, la que se lleva en la mano se esconde y no sigue al cursor', () => {
    expect(posar).toContain("ultimas.current.instrumento?.coloca?.tipo === 'placa' && taller.current.implantes?.placa")
    // La salida es antes de posarla: no hay `position.copy` entre la condición y el `return`.
    const condicion = posar.indexOf("coloca?.tipo === 'placa' && taller.current.implantes?.placa")
    const siguiente = posar.indexOf('return', condicion)
    expect(posar.slice(condicion, siguiente)).not.toContain('position.copy')
    expect(posar.slice(condicion, siguiente)).toContain('herramienta.raiz.visible = false')
  })

  it('la condición va antes de que la herramienta se pose sobre la superficie', () => {
    expect(posar.indexOf("coloca?.tipo === 'placa'")).toBeLessThan(posar.indexOf('herramienta.raiz.position'))
  })
})

describe('el panel de la placa', () => {
  it('habla de proximal, distal, anterior, posterior y angulación, con campos que se escriben', () => {
    expect(consola).toContain('etiqueta="Proximal ↔ distal"')
    expect(consola).toContain('etiqueta="Anterior ↔ posterior"')
    expect(consola).toContain('etiqueta="Angulación"')
    expect(consola).toContain("<CampoNumerico")
  })

  it('ya no hay deslizadores de la placa ni el tope fijo de ±40 mm como único rango', () => {
    expect(consola).not.toContain("['largoMm', 'A lo largo del hueso', -40, 40, 1, 'mm']")
    expect(consola).not.toContain('Ajustar la placa: ')
    // Si el lienzo no mandó rangos, el panel usa uno de reserva; los de verdad salen del hueso.
    expect(lienzo).toContain('placa.rangos = rangosDeLaPlaca({')
  })

  it('el largo del tornillo se escribe, de 8 a 120 mm, y la rueda respeta el mismo rango', () => {
    expect(consola).toContain('etiqueta="Largo del tornillo"')
    expect(consola).toContain('entre(MINIMO_DEL_TORNILLO_MM, MAXIMO_DEL_TORNILLO_MM, antes + sentido * 2)')
    expect(consola).not.toContain('aria-label="Largo del tornillo"')
  })

  it('el lienzo reparte los agujeros con los orificios del instrumento', () => {
    expect(lienzo).toContain('orificios: inst.orificios ?? null')
    expect(consola).toContain('orificios: orificiosDelElegido')
  })
})
