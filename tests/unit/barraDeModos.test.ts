import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * La barra de modos arriba y «Seleccionar estructura» (P-004 E4).
 *
 * Son pruebas que leen el código: la consola es un componente grande que se monta con el lienzo de three.js, y lo que
 * aquí se promete —dónde está la barra, en qué orden salen los modos, cómo se llama el que antes era «Info»— no
 * necesita pintar nada para comprobarse.
 */

const fuente = (...partes: string[]) =>
  readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')
const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
const css = fuente('src', 'app', '(frontend)', 'simulador', 'consola.css')

describe('el orden de los modos', () => {
  const bloque = consola.slice(consola.indexOf('const modosVisibles = ['), consola.indexOf('const ayudaDelModo'))
  const orden = [...bloque.matchAll(/\bMODO_[A-ZÑ]+\b|\.\.\.MODOS\b/g)].map((m) => m[0])

  it('es el de una cirugía: mirar, trazar, mover, exponer, reducir, perforar, fijar, coser, disecar y, al final, seleccionar', () => {
    expect(orden).toEqual([
      '...MODOS',
      'MODO_SENALAR',
      'MODO_SEPARAR',
      'MODO_PINZAR',
      'MODO_REDUCIR',
      'MODO_PERFORAR',
      'MODO_FIJAR',
      'MODO_COSER',
      'MODO_DISECAR',
      'MODO_INFO',
    ])
  })

  it('los tres primeros, siempre, son orbitar, trazar y mover', () => {
    const modos = consola.slice(consola.indexOf('const MODOS: readonly'), consola.indexOf('const MODO_SENALAR'))
    const valores = [...modos.matchAll(/valor: '([a-z]+)'/g)].map((m) => m[1])
    expect(valores).toEqual(['orbitar', 'trazar', 'mover'])
  })
})

describe('la barra', () => {
  it('es hermana anterior del marco del lienzo y no su hija: dentro chocaba con Encuadrar, Ampliar y Fluoroscopia', () => {
    const barra = consola.indexOf('<div className="consola-barra-de-modos">')
    const marco = consola.indexOf('<div className={`consola-lienzo-marco modo-${modo}`}>')
    expect(barra).toBeGreaterThan(-1)
    expect(marco).toBeGreaterThan(barra)
    // Nada de lo que hay entre las dos cosas abre otro `consola-lienzo-marco`.
    expect(consola.slice(barra, marco)).not.toContain('consola-lienzo-marco')
  })

  it('el bloque de modos de la columna izquierda ya no existe', () => {
    expect(consola).not.toContain('consola-modos-bloque')
    expect(css).not.toContain('consola-modos-bloque')
  })

  it('lleva los modos, los submodos de trazar y de mover, y la ayuda debajo', () => {
    const barra = consola.slice(consola.indexOf('<div className="consola-barra-de-modos">'), consola.indexOf('consola-lienzo-marco modo-'))
    expect(barra).toContain('modosVisibles.map(')
    expect(barra).toContain('aria-label="Cómo se traza la incisión"')
    expect(barra).toContain('aria-label="Qué se mueve"')
    expect(barra).toContain('consola-barra-de-modos-ayuda')
    expect(barra).toContain('Este paso se hace en modo')
    expect(barra).toContain('consola-modo-pedido')
  })

  it('un contenedor de tamaño, y el texto se esconde a la vista pero no al lector de pantalla', () => {
    expect(css).toMatch(/\.consola-barra-de-modos \{[^}]*container-type: inline-size/)
    const estrecho = css.slice(css.indexOf('@container (max-width: 640px)'))
    const regla = estrecho.slice(0, estrecho.indexOf('}\n}') + 3)
    expect(regla).toContain('.consola-modo-barra-texto')
    expect(regla).toContain('clip-path: inset(50%)')
    expect(regla).not.toContain('display: none')
  })
})

describe('«Seleccionar estructura»', () => {
  it('es la etiqueta del modo, y la clave interna sigue siendo `info`', () => {
    const modo = consola.slice(consola.indexOf('const MODO_INFO'), consola.indexOf('const MODO_DISECAR'))
    expect(modo).toContain("valor: 'info'")
    expect(modo).toContain("etiqueta: 'Seleccionar estructura'")
    expect(modo).toContain("ayuda: 'Seleccionar estructura: haga clic en una estructura")
    // La clave está en la sesión guardada y en el modo que pide el paso de planos.
    expect(consola).toContain("planos: 'info'")
  })

  it('ningún texto que lea el residente o el editor llama «Info» al modo', () => {
    const textos = [
      consola,
      fuente('src', 'components', 'admin', 'formulario', 'EditorDelSimulador.tsx'),
      fuente('src', 'lib', 'simulador.ts'),
    ].join('\n')
    expect(textos).not.toMatch(/botón «Info»|modo «Info»|en «Info»|active «Info»|aria-label="Info"/)
  })

  it('el editor y el motor mandan al músculo del paso con el nombre nuevo', () => {
    expect(fuente('src', 'components', 'admin', 'formulario', 'EditorDelSimulador.tsx')).toContain('Con «Seleccionar estructura» no se puede pinchar un músculo suelto.')
    const motor = fuente('src', 'lib', 'simulador.ts')
    expect(motor).toContain('Elija con «Seleccionar estructura» el músculo de este paso')
    expect(motor).toContain('active «Seleccionar estructura», pinche el músculo del paso')
  })

  it('la pestaña «Info» del taller anatómico es otra pantalla y no se toca', () => {
    expect(fuente('src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx')).toContain("etiqueta: info.pendientes > 0 ? `Info (${info.pendientes} sin guardar)` : 'Info'")
  })
})
