import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Lo que el panel esconde en un teléfono, y lo que deja puesto.
 *
 * El defecto que esto vigila no se ve nunca desde un escritorio, que es donde
 * se escribe el panel: por debajo de 640 px `admin.css` escondía el visor de
 * encuadre y las tres piezas del taller —lienzo, botonera y sueltas— nombrando
 * cada una, y las ayudas que las explican no llevaban ningún nombre de esos.
 * El autor abría una ficha en el móvil y leía «use el visor de aquí abajo; los
 * números se rellenan solos» y «pinche cada trozo… pulse Capturar
 * desplazamiento» encima de un hueco. Explicar cómo se usa algo que no está en
 * pantalla es peor que no explicar nada: se busca el botón, no aparece, y lo
 * que se concluye es que la ficha está rota.
 *
 * El arreglo no fue añadir dos nombres más a la lista de los que se esconden
 * —eso es lo que ya se rompió— sino invertirlo: se esconde un envoltorio,
 * `.solo-ancho`, y al lado va su `.solo-estrecho`, que dice por qué y qué sí se
 * puede hacer a mano. Lo que estas pruebas sostienen es esa inversión, porque
 * el día que alguien vuelva a escribir un `display: none` con nombre propio
 * dentro del `@media` no fallará nada más.
 *
 * Se lee la fuente y no el DOM: el entorno de la suite es `node`, sin jsdom ni
 * biblioteca de componentes (`vitest.config.ts`), y los dos componentes
 * arrastran three.js. Es el mismo trato que reciben en `campos.test.ts`.
 */

const RAIZ = process.cwd()
const leer = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const HOJA = leer('src', 'app', '(frontend)', 'admin-panel', 'admin.css')
const CAMPOS = leer('src', 'components', 'admin', 'formulario', 'Campos.tsx')
const TALLER = leer('src', 'components', 'admin', 'formulario', 'TallerDePiezas.tsx')

/**
 * Los comentarios se quitan antes de mirar nada.
 *
 * Los de esta zona de la hoja citan por su nombre lo que se retiró
 * —`.encuadre-editor`, `.taller-piezas-lienzo`— para explicar por qué ya no se
 * esconden ahí. Leyendo el texto en crudo, la comprobación de abajo fallaría
 * contra su propia explicación.
 */
const sinComentarios = (fuente: string): string => fuente.replace(/\/\*[\s\S]*?\*\//g, '')

/** Las reglas de un `@media` concreto, con su selector y su cuerpo. */
function reglasDe(consulta: string): { selector: string; cuerpo: string }[] {
  const limpio = sinComentarios(HOJA)
  const salida: { selector: string; cuerpo: string }[] = []
  const marca = `@media ${consulta}`
  let desde = limpio.indexOf(marca)

  while (desde !== -1) {
    let i = limpio.indexOf('{', desde) + 1
    let profundidad = 1
    let bloque = ''
    while (i < limpio.length) {
      const c = limpio[i]
      if (c === '{') profundidad++
      else if (c === '}') {
        profundidad--
        if (profundidad === 0) break
      }
      bloque += c
      i++
    }
    for (const trozo of bloque.split('}')) {
      const corte = trozo.indexOf('{')
      if (corte === -1) continue
      salida.push({ selector: trozo.slice(0, corte).trim(), cuerpo: trozo.slice(corte + 1).trim() })
    }
    desde = limpio.indexOf(marca, i)
  }

  return salida
}

describe('el interruptor de pantalla estrecha del panel', () => {
  it('`.solo-estrecho` nace escondida y `.aviso-solo-escritorio` tiene aspecto', () => {
    // Sin la primera, el aviso del móvil se lee también en el escritorio,
    // debajo del visor que dice que no está.
    expect(sinComentarios(HOJA)).toMatch(/\.solo-estrecho\s*\{\s*display:\s*none/)
    expect(sinComentarios(HOJA)).toMatch(/\.aviso-solo-escritorio\s*\{/)
  })

  it('por debajo de 640 px lo único que se esconde es el envoltorio', () => {
    // Esta es la prueba que sostiene el arreglo entero. Un `display: none` con
    // nombre propio aquí dentro es exactamente la forma del defecto: esconde
    // una cosa y deja en pantalla el párrafo que la explica.
    const escondidos = reglasDe('(max-width: 640px)')
      .filter((regla) => /display:\s*none/.test(regla.cuerpo))
      .map((regla) => regla.selector)

    expect(escondidos).toEqual(['.solo-ancho'])
  })

  it('y en su lugar aparece el aviso', () => {
    const mostrados = reglasDe('(max-width: 640px)')
      .filter((regla) => /display:\s*block/.test(regla.cuerpo))
      .map((regla) => regla.selector)

    expect(mostrados).toContain('.solo-estrecho')
  })
})

describe('los dos editores que se esconden van emparejados', () => {
  // Ninguno de los dos puede quedarse a medias: envolver sin avisar deja un
  // hueco mudo, y avisar sin envolver deja el aviso encima del visor.
  it.each([
    ['formulario/Campos.tsx', CAMPOS],
    ['formulario/TallerDePiezas.tsx', TALLER],
  ])('%s usa las dos clases', (_nombre, fuente) => {
    expect(fuente).toContain('solo-ancho')
    expect(fuente).toContain('solo-estrecho')
    expect(fuente).toContain('aviso-solo-escritorio')
  })

  it('la ayuda del encuadre se va con el visor, porque es la ayuda del visor', () => {
    // `src/admin/bloques.ts` la escribe como «Use el visor de aquí abajo; los
    // números se rellenan solos». Fuera del envoltorio, esa frase sobrevive al
    // visor.
    expect(CAMPOS).toMatch(/<div className="solo-ancho">\s*\{ayuda\}\s*<EditorDeEncuadre/)
  })

  it('la instrucción del taller se va con el taller y el aviso se queda', () => {
    // El aviso es la única respuesta a añadir, quitar o capturar, y «Quitar»
    // sigue funcionando desde la tabla cuando el visor no está: si viaja dentro
    // del párrafo escondido, en el móvil la fila desaparece sin que nada lo
    // diga. `role="status"` para que además se oiga.
    expect(TALLER).toContain('className="campo-ayuda solo-ancho"')
    expect(TALLER).toMatch(/role="status"\s*>\s*\{aviso\}/)
    expect(TALLER).not.toContain('<span className="encuadre-aviso"> {aviso}</span>')
  })
})
