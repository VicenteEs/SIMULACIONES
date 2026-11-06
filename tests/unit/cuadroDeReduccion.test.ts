import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CuadroDeReduccion, EXPLICACION_DE_LA_REDUCCION } from '@/components/simulador/CuadroDeReduccion'

/**
 * El cuadro «Reducción manual / Reducción automática» (P-013, pedido 12 de Cristóbal): «al seleccionar "reducción" que
 * aparezca un cuadro encima que diga "Reducción manual / Reducción automática"; al posarse sobre cada botón, que explique
 * de qué se trata».
 *
 * Lo que no puede volver es lo que quitó D-315: un «Manual» que no hacía nada y un «Automática» que dejaba el paso sin
 * puntos sin decirlo antes. Se prueba que lo que cuesta va en el botón, que la explicación existe para el ratón y para el
 * teclado, y el cableado de la consola: cuándo sale y qué hace cada elección.
 */

const html = renderToStaticMarkup(createElement(CuadroDeReduccion, { alElegir: () => {}, alCerrar: () => {} }))
const consola = readFileSync(join(process.cwd(), 'src/components/simulador/ConsolaQuirurgica.tsx'), 'utf8')
const fuente = readFileSync(join(process.cwd(), 'src/components/simulador/CuadroDeReduccion.tsx'), 'utf8')
const entre = (desde: string, hasta: string) => {
  const i = consola.indexOf(desde)
  expect(i, `no está: ${desde}`).toBeGreaterThanOrEqual(0)
  return consola.slice(i, consola.indexOf(hasta, i + desde.length))
}

describe('el cuadro', () => {
  it('pregunta con los dos botones que pidió Cristóbal, y cada uno dice lo que cuesta', () => {
    expect(html).toContain('¿Cómo quiere reducir?')
    expect(html).toContain('Reducción manual')
    expect(html).toContain('La hace usted · suma puntos')
    expect(html).toContain('Reducción automática')
    expect(html).toContain('Va sola a su sitio · sin puntos')
  })

  it('cada botón tiene su explicación escrita y enlazada, también para el lector de pantalla', () => {
    for (const texto of Object.values(EXPLICACION_DE_LA_REDUCCION)) expect(html).toContain(texto)
    expect(html.match(/aria-describedby="/g)).toHaveLength(2)
    // Antes de pasar por encima, una sola línea visible que invita a hacerlo; las explicaciones esperan ocultas.
    expect(html).toContain('Pase el cursor sobre cada opción para ver de qué se trata.')
    expect(html.match(/hidden=""/g)).toHaveLength(2)
  })

  it('la explicación sale con el ratón y con el teclado, no con la ayuda del navegador', () => {
    expect(fuente).toContain('onPointerEnter={() => setExplicando(cual)}')
    expect(fuente).toContain('onFocus={() => setExplicando(cual)}')
    expect(fuente).not.toContain('title=')
  })

  it('la automática dice que el paso queda sin puntos aunque se deshaga, como la pregunta del panel', () => {
    expect(EXPLICACION_DE_LA_REDUCCION.automatica).toContain('Este paso queda sin puntos, aunque después lo deshaga.')
    expect(EXPLICACION_DE_LA_REDUCCION.manual).toContain('suma puntos')
  })
})

describe('la consola', () => {
  it('lo ofrece solo en práctica, fuera del editor, en el paso de reducir y una vez por paso', () => {
    const ofrecer = entre('const ofrecerLaReduccion = () => {', 'const elegirLaReduccion = ')
    expect(ofrecer).toContain("if (!enPractica || editor || !paso || objetivo !== 'reduccion') return")
    expect(ofrecer).toContain('reduccionOfrecidaEn === paso.id || automaticas.has(paso.id)')
    // Sin leer el mando: `elegirInstrumento` lo llama, y el compilador de React no deja leer referencias desde ahí.
    expect(ofrecer).toContain("piezas.some((p) => p.rol === 'fragmento' || !!p.posicionReducida)")
    expect(ofrecer).not.toContain('mando.current')
  })

  it('sale al coger la pinza y al abrir la familia «Reducción» de la mesa', () => {
    expect(entre('const elegirInstrumento = ', 'const cogerDeLaMesa')).toContain('if (que?.reduce) ofrecerLaReduccion()')
    expect(consola).toContain("if (clave === 'reduccion') ofrecerLaReduccion()")
  })

  it('«Manual» deja una pinza en la mano y «Automática» reduce sin una segunda pregunta', () => {
    const elegir = entre('const elegirLaReduccion = ', '/** Deja el fragmento donde empieza el caso')
    expect(elegir).toContain("if (cual === 'automatica') {\n      reducirAutomaticamente()")
    expect(elegir).not.toContain('pedirLaReduccionAutomatica')
    expect(elegir).toContain('if (pinza) elegirInstrumento(pinza.id)')
  })

  it('el cuadro va dentro del lienzo y se apaga fuera del paso de reducir', () => {
    expect(consola).toContain("{cuadroDeReduccion && enPractica && !editor && objetivo === 'reduccion' ? (")
  })
})
