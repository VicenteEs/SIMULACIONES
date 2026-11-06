import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { siguienteDeLaSecuencia } from '@/lib/tornillos'

/**
 * Sacar un tornillo para poner otro (P-013, pedido 5 de Cristóbal: «necesito poder sacar un tornillo para poner otro»).
 *
 * Antes solo se podía «Quitar los tornillos», todos a la vez, o sacar el que estaba entrando. Ahora cada tornillo puesto se
 * retira solo: el orificio queda perforado y medido, la secuencia vuelve a ofrecer el tornillo, y el retiro no gasta insumo.
 * El retiro vive en la escena (three.js), así que el cableado se prueba sobre el código; la regla de la secuencia, de verdad.
 */

const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
const consola = readFileSync(join(process.cwd(), 'src/components/simulador/ConsolaQuirurgica.tsx'), 'utf8')
const entre = (texto: string, desde: string, hasta: string) => {
  const i = texto.indexOf(desde)
  expect(i, `no está: ${desde}`).toBeGreaterThanOrEqual(0)
  return texto.slice(i, texto.indexOf(hasta, i + desde.length))
}

describe('el orificio de un tornillo retirado (P-013, pedido 5)', () => {
  it('perforado y medido, sin tornillo, lo que toca es atornillar otra vez', () => {
    const orificio = { perforado: { diametroMm: 2.5, profundidadMm: 14, bicortical: true }, medido: { espesorMm: 12, sugeridoMm: 14 } }
    expect(siguienteDeLaSecuencia(orificio, false)).toBe('atornillar')
  })
})

describe('«quitarUnTornillo» en el lienzo', () => {
  const orden = entre(lienzo, '    quitarUnTornillo: (id) => {', '    ajustarLaPlaca: (ajuste) => {')

  it('saca ese tornillo y no otro, por la clave con que lo guarda la escena', () => {
    expect(orden).toContain('const puesto = imp?.tornillos.get(id)')
    expect(orden).toContain('quitarUnTornillo(imp, id)')
    expect(orden).not.toContain('quitarTornillos(')
  })

  it('el de bloqueo del clavo sale también de la cuenta del clavo', () => {
    expect(orden).toContain('e.bloqueos = e.bloqueos.filter((b) => b.tornilloId !== id)')
    expect(orden).toContain('alCambiarElEnclavado?.(')
  })

  it('avisa con un suceso «retirado» que lleva el agujero o la trayectoria, para que la secuencia siga por ahí', () => {
    expect(orden).toContain("tipo: 'retirado'")
    expect(orden).toContain('{ agujero: datos.agujero }')
    expect(orden).toContain('{ libre: true }')
    expect(orden).toContain('El orificio sigue perforado y medido: puede poner otro.')
  })

  it('cambiar un tornillo con un clic sobre su agujero avisa a la consola de que el de antes ya no está', () => {
    expect(lienzo).toContain('const habia = imp.tornillos.get(agujero)?.datos')
    expect(lienzo).toContain('if (habia) ultimas.current.alFijar?.(estadoDeLaFijacion(t))')
  })
})

describe('la consola', () => {
  it('cada fila con tornillo de la lista de agujeros tiene su ✕ para retirarlo', () => {
    const lista = entre(consola, '<ul className="consola-separadores" aria-label="Agujeros de la placa">', '</ul>')
    expect(lista).toContain('onClick={() => mando.current?.quitarUnTornillo(i)}')
    expect(lista).toContain('aria-label={`Retirar el tornillo del agujero ${i + 1}`}')
  })

  it('retirar no gasta insumo: «retirado» no está entre lo que se anota como usado', () => {
    const alFijar = entre(consola, 'alFijar={(estado, suceso) => {', 'avanzarLaSecuencia(estado, suceso)')
    expect(alFijar).toContain("suceso.tipo === 'agujero') usarElDeLaMano()")
    expect(alFijar).not.toContain("'retirado'")
  })
})
