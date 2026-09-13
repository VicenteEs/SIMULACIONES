import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia de la hoja pública, `src/app/(frontend)/estilos.css`.
 *
 * Una hoja de estilos no tiene compilador que la contradiga: una regla que ya
 * no pinta nada, un valor repetido o un color que no llega al contraste no
 * rompen ninguna prueba ni fallan el `build`, y viven años. Esta hoja llegó a
 * tener el simulador anterior entero muerto dentro, la rejilla de fichas
 * definida dos veces y el índice lateral hundiendo la ficha en una columna de
 * 190 px. Nada de eso avisó.
 *
 * Aquí solo se comprueba lo que ya se rompió una vez, y siempre por su
 * consecuencia, no por su forma: que el contraste da el número, que la rejilla
 * no vuelve a asumir dos hijos, que el visor del instrumento no vuelve a
 * crecer. Nadie tiene que añadir una comprobación por cada regla que escriba.
 *
 * No se usa un analizador de CSS de verdad porque el proyecto no depende de
 * ninguno, y añadir uno por esto no compensa. El de aquí abajo entiende lo que
 * esta hoja usa —reglas, anidamiento de `@media`, comentarios— y nada más.
 */

const HOJA = join(process.cwd(), 'src', 'app', '(frontend)', 'estilos.css')
const css = readFileSync(HOJA, 'utf8')

type Regla = {
  /** Los `@media` que la envuelven, de fuera hacia dentro. */
  contexto: string[]
  selector: string
  declaraciones: Record<string, string>
}

function declaracionesDe(cuerpo: string): Record<string, string> {
  const salida: Record<string, string> = {}
  for (const trozo of cuerpo.split(';')) {
    const corte = trozo.indexOf(':')
    if (corte === -1) continue
    const propiedad = trozo.slice(0, corte).trim()
    if (!propiedad) continue
    salida[propiedad] = trozo.slice(corte + 1).trim()
  }
  return salida
}

/**
 * Los comentarios se quitan antes de nada, y no es un detalle: varios de ellos
 * citan el valor viejo que se retiró («#fff3cd», «transition: all»,
 * «min-height: 240px») para explicar por qué se fue. Leyendo el texto en crudo,
 * la mitad de estas comprobaciones fallaría contra su propia explicación.
 */
function analizar(fuente: string): Regla[] {
  const limpio = fuente.replace(/\/\*[\s\S]*?\*\//g, '')
  const reglas: Regla[] = []
  const contexto: string[] = []
  let prefacio = ''
  let i = 0

  while (i < limpio.length) {
    const c = limpio[i]

    if (c === '{') {
      const cabeza = prefacio.trim()
      prefacio = ''
      i++

      // Una regla anidada (`@media`, `@supports`) solo abre contexto.
      if (cabeza.startsWith('@')) {
        contexto.push(cabeza)
        continue
      }

      let profundidad = 1
      let cuerpo = ''
      while (i < limpio.length) {
        const d = limpio[i]
        if (d === '{') profundidad++
        else if (d === '}') {
          profundidad--
          if (profundidad === 0) break
        }
        cuerpo += d
        i++
      }
      i++
      reglas.push({ contexto: [...contexto], selector: cabeza, declaraciones: declaracionesDe(cuerpo) })
      continue
    }

    if (c === '}') {
      contexto.pop()
      prefacio = ''
      i++
      continue
    }

    prefacio += c
    i++
  }

  return reglas
}

const reglas = analizar(css)

/** Las reglas cuyo selector menciona alguna de estas clases. */
function porClase(...clases: string[]): Regla[] {
  return reglas.filter((r) => {
    const encontradas = r.selector.match(/\.[A-Za-z0-9_-]+/g) ?? []
    return encontradas.some((c) => clases.includes(c.slice(1)))
  })
}

function enImpresion(r: Regla): boolean {
  return r.contexto.some((c) => c.includes('print'))
}

// ---------------------------------------------------------------------------
// Contraste
// ---------------------------------------------------------------------------

/** Luminancia relativa de WCAG 2.1, fórmula tal cual. */
function luminancia(hex: string): number {
  const n = hex.replace('#', '')
  const canales = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map((par) => {
    const v = parseInt(par, 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2]
}

function contraste(uno: string, otro: string): number {
  const a = luminancia(uno)
  const b = luminancia(otro)
  const claro = Math.max(a, b)
  const oscuro = Math.min(a, b)
  return (claro + 0.05) / (oscuro + 0.05)
}

const raiz = reglas.find((r) => r.selector === ':root')!
const paleta = raiz.declaraciones

describe('la paleta se lee', () => {
  /**
   * `--mudo` es el gris de los textos pequeños, y entre ellos está
   * `.visor-3d-nota`: los dos mensajes que explican por qué falta el modelo
   * 3D. Estuvo en #6b7a96, que daba 3,83:1 sobre `--papel` y no llegaba al
   * 4,5:1 de WCAG AA. Lo que peor se leía de la ficha era justo lo que
   * explicaba qué había fallado, y se lee en el tablet de pabellón.
   *
   * Se comprueba contra los tres fondos donde de verdad cae: la página, la
   * tarjeta y el lienzo del visor.
   */
  it('el gris apagado llega al contraste de texto normal sobre sus tres fondos', () => {
    const lienzo = reglas.find((r) => r.selector === '.visor-3d-lienzo')!.declaraciones.background

    expect(contraste(paleta['--mudo'], paleta['--papel'])).toBeGreaterThanOrEqual(4.5)
    expect(contraste(paleta['--mudo'], paleta['--superficie'])).toBeGreaterThanOrEqual(4.5)
    expect(contraste(paleta['--mudo'], lienzo)).toBeGreaterThanOrEqual(4.5)
  })

  it('la pizarra y la tinta siguen por encima, que son los textos largos', () => {
    expect(contraste(paleta['--pizarra'], paleta['--papel'])).toBeGreaterThanOrEqual(4.5)
    expect(contraste(paleta['--tinta'], paleta['--papel'])).toBeGreaterThanOrEqual(7)
  })

  /**
   * Sin `color-scheme`, Chrome de Android aplica su tema oscuro automático a
   * las páginas que no declaran nada y reescribe la paleta por su cuenta.
   */
  it('la plataforma declara que es clara', () => {
    expect(paleta['color-scheme']).toBe('light')
  })
})

// ---------------------------------------------------------------------------
// El cuerpo de la ficha
// ---------------------------------------------------------------------------

describe('la rejilla de la ficha no da por hecho que hay índice', () => {
  /**
   * `IndiceFicha` devuelve `null` con menos de dos secciones publicadas, y en
   * impresión la esconde `nav { display: none }` porque es un `<nav>`. Las dos
   * veces la rejilla se queda con un hijo, y grid lo mete en la primera pista:
   * la ficha entera salía en 190 px de ancho.
   */
  it('la pista de 190 px solo existe detrás del :has() del índice', () => {
    const conDosPistas = porClase('ficha-cuerpo').filter((r) =>
      (r.declaraciones['grid-template-columns'] ?? '').startsWith('190px'),
    )

    expect(conDosPistas.length).toBeGreaterThan(0)
    for (const r of conDosPistas) {
      expect(r.selector).toContain(':has(> .indice-ficha)')
    }
  })

  it('en papel se deshace la rejilla, con índice y sin él', () => {
    const impresas = porClase('ficha-cuerpo').filter(enImpresion)
    const deshechas = impresas.filter((r) => r.declaraciones.display === 'block')

    expect(deshechas.length).toBeGreaterThan(0)
    // Las dos formas del selector, o la del `:has()` —más específica— se
    // quedaría en rejilla igual.
    const selectores = deshechas.flatMap((r) => r.selector.split(',').map((s) => s.trim()))
    expect(selectores).toContain('.ficha-cuerpo')
    expect(selectores.some((s) => s.includes(':has(> .indice-ficha)'))).toBe(true)
  })

  /**
   * Una consulta de medios no añade especificidad: `.ficha-cuerpo` a secas
   * (0,1,0) pierde contra la regla del `:has()` (0,2,0), así que el bloque de
   * pantalla estrecha tiene que repetir el `:has()` o la ficha con índice se
   * queda a dos columnas en el móvil.
   */
  it('el bloque de pantalla estrecha repite el :has()', () => {
    const estrechas = porClase('ficha-cuerpo').filter(
      (r) => !enImpresion(r) && r.contexto.some((c) => c.includes('900px')),
    )

    expect(estrechas.length).toBe(1)
    expect(estrechas[0].selector).toContain(':has(> .indice-ficha)')
    expect(estrechas[0].declaraciones['grid-template-columns']).toBe('1fr')
  })
})

// ---------------------------------------------------------------------------
// El visor del instrumento dentro de la consola
// ---------------------------------------------------------------------------

describe('la vista previa del instrumento no empuja el botón fuera del panel', () => {
  /**
   * Vive en una columna con 620 px de alto y scroll propio, y debajo están la
   * instrucción del paso y «Aplicar». Con `min-height: 240px` heredado y el
   * lienzo en 380 px, coger un instrumento mandaba el botón 325 px más abajo
   * de lo que se ve.
   */
  it('el marco de carga neutraliza el mínimo que hereda del visor', () => {
    const marco = reglas.find((r) => r.selector === '.consola-instrumento .visor-3d-marco')!

    expect(marco.declaraciones['min-height']).toBe('0')
    expect(marco.declaraciones.height).toBe('170px')
  })

  it('el lienzo ya cargado toma su altura de la variable, no del 380px fijo', () => {
    const lienzo = reglas.find((r) => r.selector === '.visor-3d-lienzo canvas')!
    const consola = reglas.find((r) => r.selector === '.consola-instrumento')!

    expect(lienzo.declaraciones.height).toContain('var(--alto-visor')
    expect(consola.declaraciones['--alto-visor']).toBe('170px')
  })
})

// ---------------------------------------------------------------------------
// Lo que no debe volver
// ---------------------------------------------------------------------------

describe('la hoja no arrastra reglas muertas', () => {
  /**
   * El simulador anterior. De todas sus clases, la que hacía daño era
   * `.campo`: escrita para un `<fieldset>` suyo, es hoy la envoltura de todo
   * campo del panel, y su `margin-bottom: 22px` se sumaba al `gap` de
   * `.campos` doblando la separación entre filas de un formulario.
   */
  it('ninguna clase del simulador retirado sigue declarada', () => {
    const muertas = [
      'simulador',
      'simulador-principal',
      'simulador-registro',
      'instrumentos',
      'marcadores',
      'marcador',
      'pista',
      'registro',
      'campo',
    ]

    for (const clase of muertas) {
      expect(porClase(clase).map((r) => r.selector)).toEqual([])
    }
  })

  it('la rejilla de fichas y su tarjeta se declaran en un solo sitio', () => {
    for (const clase of ['rejilla-fichas', 'tarjeta-ficha']) {
      const base = reglas.filter((r) => r.selector === `.${clase}`)
      expect(base.length).toBe(1)
    }
  })

  /**
   * Los tres ámbares de Bootstrap de la etiqueta «borrador» de una tarjeta y
   * el rojo de Material del texto de error. Convivían con `--ambar-tenue` y
   * `--alerta`, y en la biblioteca se veían dos ámbares distintos para lo
   * mismo, uno al lado del otro.
   */
  it('no quedan colores de fuera de la paleta', () => {
    const ajenos = ['#fff3cd', '#856404', '#ffeeba', '#d32f2f']
    const valores = reglas.flatMap((r) => Object.values(r.declaraciones).map((v) => v.toLowerCase()))

    for (const color of ajenos) {
      expect(valores.filter((v) => v.includes(color))).toEqual([])
    }
  })

  /**
   * Una regla que repite el valor que ya estaba puesto miente sobre que algo
   * lo había cambiado. La de `.pestana` llevaba además un comentario diciendo
   * que «vuelve a valer el desplazamiento original», y nada lo había alterado.
   */
  it('el bloque de 1000 px no repite valores que ya valían', () => {
    const repetidoras = reglas.filter(
      (r) =>
        r.contexto.some((c) => c.includes('1000px')) &&
        (r.selector === '.pestana' || r.selector === '.indice-ficha'),
    )

    expect(repetidoras.map((r) => r.selector)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Reserva de sitio
// ---------------------------------------------------------------------------

describe('los logotipos reservan su hueco', () => {
  /**
   * Los `<img>` de las cinco pantallas de acceso y de la portada no llevan
   * atributos `width`/`height`, así que hasta descargar el archivo la caja
   * medía 0 px: la portada saltaba 142 px y el acceso 104 px, y el botón
   * «Entrar» se movía bajo el dedo de quien lo estuviera pulsando.
   *
   * Con `aspect-ratio` la reserva la hace la hoja. El día que los cinco
   * marcados declaren sus dimensiones, esto sobra y se puede quitar.
   */
  it('la proporción de logo.png está declarada en las dos clases', () => {
    for (const clase of ['.acceso-logo', '.portada-logo']) {
      const regla = reglas.find((r) => r.selector === clase)!
      expect(regla.declaraciones['aspect-ratio']).toBe('220 / 120')
      expect(regla.declaraciones.height).toBe('auto')
    }
  })
})

describe('todo campo de escritura pone sus dos colores', () => {
  /**
   * El `textarea` de comentarios era el único que no los declaraba, así que se
   * los ponía el navegador: en un móvil con tema oscuro el residente escribía
   * la corrección de una ficha en un recuadro que no se parecía a ningún otro
   * campo de la plataforma, y potencialmente ilegible.
   */
  it('ninguno se deja el color o el fondo al navegador', () => {
    const campos = [
      '.campo-busqueda input',
      '.acceso-campo input',
      '.formulario-comentario textarea',
    ]

    for (const selector of campos) {
      const regla = reglas.find((r) => r.selector === selector)
      expect(regla, `falta la regla ${selector}`).toBeDefined()
      expect(regla!.declaraciones.color, `${selector} sin color`).toBeTruthy()
      expect(regla!.declaraciones.background, `${selector} sin fondo`).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// El título de la fase de rehabilitación
// ---------------------------------------------------------------------------

/**
 * Aquí la hoja depende del marcado, y por eso esta comprobación existe: el
 * selector `.fases h4` se quedó apuntando a un nivel que la ficha ya no pinta
 * cuando el título de la fase subió a `<h3>`, y el fallo no se ve en ningún
 * sitio: la regla simplemente deja de aplicarse, el título toma los 17 px del
 * `<h3>` global y pierde su margen, que el reajuste de encabezados deja en 0.
 *
 * No se fija el nivel: se comprueba que los dos digan el mismo. Si el marcado
 * vuelve a `<h4>` por una razón de accesibilidad que aquí no se conoce, esta
 * prueba falla y dice exactamente qué línea de la hoja hay que mover.
 */
const FICHA = join(process.cwd(), 'src', 'app', '(frontend)', 'biblioteca', '[id]', 'page.tsx')
// Los comentarios de JSX se quitan antes de buscar: el de esta misma lista
// nombra los dos niveles para explicar por qué se cambió uno por el otro.
const marcadoDeLaFicha = readFileSync(FICHA, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

describe('el título de la fase de rehabilitación lo viste la hoja', () => {
  it('el selector apunta al mismo encabezado que pinta la ficha', () => {
    const lista = marcadoDeLaFicha.match(/<ol className="fases">([\s\S]*?)<\/ol>/)
    expect(lista, 'la ficha ya no pinta <ol className="fases">').not.toBeNull()

    const encabezado = lista![1].match(/<h([1-6])[\s>]/)
    expect(encabezado, 'ninguna fase pinta un encabezado').not.toBeNull()
    const nivel = encabezado![1]

    const regla = reglas.find((r) => r.selector === `.fases h${nivel}`)
    expect(regla, `la ficha pinta <h${nivel}> y la hoja no lo viste`).toBeDefined()
    expect(regla!.declaraciones['font-size']).toBe('15px')
    expect(regla!.declaraciones.margin).toBe('5px 0 6px')
  })

  it('solo un nivel está vestido dentro de .fases', () => {
    const vestidos = reglas.filter((r) => /^\.fases h[1-6]$/.test(r.selector))
    expect(vestidos.map((r) => r.selector).length).toBe(1)
  })
})
