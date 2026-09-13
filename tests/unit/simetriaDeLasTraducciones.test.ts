import { describe, it, expect } from 'vitest'
import tabla from '@/atlas/nombres-es.json'

/**
 * Lo que se traduce de un lado se traduce igual del otro.
 *
 * La tabla de nombres del atlas la tradujeron dieciocho tandas en paralelo, y
 * las parejas derecha/izquierda casi siempre caían en tandas distintas. El
 * resultado, antes de corregirlo, fue exactamente el fallo que un traumatólogo ve
 * a la primera: el pie izquierdo decía «extensor largo del dedo gordo» y el
 * derecho «extensor largo del hallux»; un lado «Hueso cuboides» y el otro
 * «Cuboides»; los dientes con el lado en sitios distintos; y una errata,
 * «Genihioideo», solo en uno de los dos. Fueron 29 parejas.
 *
 * Se arreglaron con una pasada de revisión, y una pasada no protege la próxima
 * corrección: quien cambie una fila de un solo lado vuelve a abrir el fallo sin
 * que nada lo avise. Esta prueba es lo que lo avisa.
 *
 * Qué se compara: se toman las parejas cuyo original solo se distingue por
 * «Right»/«Left», y se exige que su español solo se distinga por
 * derecho/derecha e izquierdo/izquierda, en el mismo sitio y con la misma
 * concordancia.
 */

const TRADUCCIONES: Record<string, string> = tabla

const sinLadoEnIngles = (texto: string) => texto.replace(/\b(right|left)\b/gi, 'LADO')
const sinLadoEnEspanol = (texto: string) =>
  texto.replace(/\b(derech|izquierd)(o|a|os|as)\b/gi, 'LADO$2').toLowerCase()

function parejas(): [string, string][] {
  const porBase = new Map<string, string[]>()
  for (const original of Object.keys(TRADUCCIONES)) {
    const base = sinLadoEnIngles(original)
    porBase.set(base, [...(porBase.get(base) ?? []), original])
  }
  return [...porBase.values()]
    .filter((grupo) => grupo.length === 2)
    .map((grupo) => [grupo[0], grupo[1]])
}

describe('las traducciones de derecha e izquierda', () => {
  it('hay parejas que comparar', () => {
    // Si el patrón dejara de reconocer los lados, la prueba de abajo pasaría
    // sin comparar nada. El atlas trae más de seiscientas parejas.
    expect(parejas().length).toBeGreaterThan(600)
  })

  it('dicen lo mismo, cambiando solo el lado', () => {
    const distintas = parejas()
      .filter(([a, b]) => sinLadoEnEspanol(TRADUCCIONES[a]) !== sinLadoEnEspanol(TRADUCCIONES[b]))
      .map(([a, b]) => `${a} -> ${TRADUCCIONES[a]}\n    ${b} -> ${TRADUCCIONES[b]}`)
    expect(distintas, `Parejas que no se corresponden:\n  ${distintas.join('\n  ')}`).toEqual([])
  })

  it('el dedo gordo del pie se llama igual en toda la tabla', () => {
    // El caso que abrió esta prueba. «Hallux» es como se dice en la consulta y
    // lo que usaba la mayoría de la tabla; lo que no puede pasar es que convivan.
    const mezcladas = Object.values(TRADUCCIONES).filter((texto) =>
      /dedo gordo|primer dedo del pie/i.test(texto),
    )
    expect(mezcladas).toEqual([])
  })
})
