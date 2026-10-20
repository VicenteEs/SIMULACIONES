import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fechaDeAuditoria, fechaDeEmision, literalDeCss } from '@/lib/impresion'

const fuente = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')

describe('literalDeCss', () => {
  it('deja el texto corriente tal cual, entre comillas', () => {
    expect(literalDeCss('Ficha · Realizado por Ana Pérez (editora)')).toBe('"Ficha · Realizado por Ana Pérez (editora)"')
  })

  it('una comilla o una barra invertida no cierran el literal: se escriben como escape', () => {
    const literal = literalDeCss('Dr. "Fulano" \\ Mengano')
    // Entre las comillas de apertura y de cierre no queda ninguna comilla ni barra suelta.
    const dentro = literal.slice(1, -1)
    expect(dentro).not.toMatch(/"/)
    expect(dentro).toContain('\\22 ')
    expect(dentro).toContain('\\5c ')
  })

  it('lo que React escaparía en HTML sale en hexadecimal, que dentro de <style> no se decodifica', () => {
    const dentro = literalDeCss("O'Brien & <b>").slice(1, -1)
    expect(dentro).not.toMatch(/[&<>']/)
  })

  it('los saltos de línea se vuelven espacios: un literal de CSS no los admite', () => {
    expect(literalDeCss('uno\n\ndos\ttres')).toBe('"uno dos tres"')
  })
})

describe('las fechas del membrete', () => {
  it('la fecha de emisión es el día, sin la hora', () => {
    expect(fechaDeEmision(new Date('2026-10-20T21:28:00Z'))).toBe('20 de octubre de 2026')
  })

  it('el día se dice en Santiago, no en el del servidor', () => {
    // Las 02:00 UTC del 21 son todavía el 20 en Santiago (UTC-3 en horario de verano).
    expect(fechaDeEmision(new Date('2026-10-21T02:00:00Z'))).toBe('20 de octubre de 2026')
  })

  it('el día de la auditoría no se corre por la zona', () => {
    // Las 02:00 UTC del 21 son todavía el 20 en Santiago.
    expect(fechaDeAuditoria('2026-10-21T02:00:00Z')).toBe('20 de octubre de 2026')
  })

  it('una fecha ilegible o ausente es nula', () => {
    expect(fechaDeAuditoria(null)).toBeNull()
    expect(fechaDeAuditoria('no es una fecha')).toBeNull()
  })
})

describe('el PDF de la ficha', () => {
  const css = fuente('src', 'app', '(frontend)', 'estilos.css')
  const impresion = css.slice(css.indexOf('@media print'))

  it('el membrete existe solo en papel', () => {
    expect(css).toMatch(/\.membrete-impreso \{ display: none; \}/)
    expect(impresion).toMatch(/\.membrete-impreso \{ display: block;/)
  })

  it('el pie de cada hoja lleva el número de hoja', () => {
    expect(impresion).toContain("counter(page)")
    expect(impresion).toContain("counter(pages)")
  })

  it('el texto va justificado y las tablas repiten la cabecera', () => {
    expect(impresion).toMatch(/text-align: justify/)
    expect(impresion).toMatch(/\.tabla-vera thead \{ display: table-header-group; \}/)
  })

  it('la barra del sitio no sale en el papel', () => {
    expect(impresion).toMatch(/nav, \.barra,/)
  })

  it('las tres fichas imprimibles llevan el membrete', () => {
    for (const ruta of [
      ['biblioteca', '[id]', 'page.tsx'],
      ['tecnica-ao', '[id]', 'page.tsx'],
      ['imagenes', '[id]', 'page.tsx'],
    ]) {
      const pagina = fuente('src', 'app', '(frontend)', ...ruta)
      expect(pagina, ruta[0]).toContain('<EncabezadoImpreso')
      expect(pagina, ruta[0]).toContain('<BotonImprimir')
    }
  })

  it('el pie sale de un literal de CSS escapado, no del texto a pelo', () => {
    const membrete = fuente('src', 'components', 'EncabezadoImpreso.tsx')
    expect(membrete).toContain('literalDeCss(')
  })
})

describe('una clase de componente no es una clase de página', () => {
  it('la sección de la ficha no se llama como el botón de las pestañas', () => {
    // `.pestana` es el botón de `ui.css` (con `white-space: nowrap`): usarla en
    // la sección dejaba todos los párrafos de la ficha en una sola línea.
    for (const ruta of [
      ['biblioteca', '[id]', 'page.tsx'],
      ['imagenes', '[id]', 'page.tsx'],
    ]) {
      expect(fuente('src', 'app', '(frontend)', ...ruta)).not.toMatch(/className="pestana"/)
    }
  })
})
