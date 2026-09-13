import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia de la hoja del panel, `src/app/(frontend)/admin-panel/admin.css`.
 *
 * La hermana pública ya tiene la suya (`estilosPublicos.test.ts`) y por la
 * misma razón: una hoja de estilos no tiene compilador que la contradiga. Una
 * variable mal escrita, un selector repetido o un color suelto no rompen
 * ninguna prueba ni fallan el `build`, y viven años.
 *
 * Aquí solo está lo que ya se rompió una vez, y se comprueba por su
 * consecuencia y no por su forma:
 *
 * - `border: 1px solid var(--borde)` con `--borde` sin definir en ninguna
 *   parte. Un `var()` sin valor y sin reserva invalida la declaración entera,
 *   de modo que el aviso que explica por qué desaparece el taller anatómico en
 *   el móvil se pintaba sin caja: una mancha ámbar sin borde.
 * - `.campo-casilla` definido dos veces para dos elementos distintos —la
 *   envoltura de un booleano y la etiqueta de una opción—. Ganaba el último, y
 *   el aviso de anonimización DICOM dejaba de caer debajo de su casilla para
 *   comprimirse a su derecha.
 * - Cuatro verdes para dos ideas: #1e8e3e sobre #e6f4ea en unos componentes y
 *   #1f7a4d sobre #e9f5ef en otros, según cuál pintara la fila.
 *
 * El analizador entiende lo que esta hoja usa —reglas, `@media` anidados y
 * comentarios— y nada más; el proyecto no depende de ningún analizador de CSS
 * y añadir uno por esto no compensa.
 */

const RAIZ = process.cwd()
const HOJA_PANEL = join(RAIZ, 'src', 'app', '(frontend)', 'admin-panel', 'admin.css')
const HOJA_PUBLICA = join(RAIZ, 'src', 'app', '(frontend)', 'estilos.css')

const panel = readFileSync(HOJA_PANEL, 'utf8')
const publica = readFileSync(HOJA_PUBLICA, 'utf8')

type Regla = {
  /** Los `@media` que la envuelven, de fuera hacia dentro. */
  contexto: string[]
  selector: string
  declaraciones: Record<string, string>
}

/**
 * Los comentarios se quitan antes de nada.
 *
 * No es un detalle: varios de ellos citan el valor que se retiró —«--borde»,
 * «#1e8e3e», «.campo-casilla»— para explicar por qué se fue. Leyendo el texto
 * en crudo, estas comprobaciones fallarían contra su propia explicación.
 */
const sinComentarios = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, '')

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

function analizar(fuente: string): Regla[] {
  const limpio = sinComentarios(fuente)
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
      reglas.push({
        contexto: [...contexto],
        selector: cabeza,
        declaraciones: declaracionesDe(cuerpo),
      })
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

const reglas = analizar(panel)

describe('variables de la hoja del panel', () => {
  it('toda `var()` sin reserva apunta a una variable que existe', () => {
    // La paleta vive en la hoja pública; el panel la extiende. Se aceptan las
    // dos como origen, más las que el propio archivo declare algún día.
    const definidas = new Set(
      [...sinComentarios(publica).matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]),
    )
    for (const m of sinComentarios(panel).matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
      definidas.add(m[1])
    }

    // Con reserva —`var(--verde, #1f7a4d)`— la declaración es válida aunque la
    // variable no exista todavía, y es como el panel espera a que la paleta
    // incorpore su verde. Sin reserva, no hay nada que pintar.
    const huerfanas = [...sinComentarios(panel).matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)]
      .map((m) => m[1])
      .filter((nombre) => !definidas.has(nombre))

    expect([...new Set(huerfanas)]).toEqual([])
  })
})

describe('selectores repetidos', () => {
  it('ningún selector se define dos veces en el mismo contexto', () => {
    // Se compara el selector entero, sin partirlo por las comas: afinar con
    // `.admin-datos dd` lo que antes fijó `.admin-datos dt, .admin-datos dd` es
    // CSS corriente y buscado. El accidente es el otro, el de `.campo-casilla`:
    // el mismo selector escrito dos veces, palabra por palabra, en dos zonas
    // del archivo que no se leen juntas.
    const porClave = new Map<string, Regla[]>()
    for (const regla of reglas) {
      const clave = `${regla.contexto.join(' | ')} >> ${regla.selector.replace(/\s+/g, ' ').trim()}`
      porClave.set(clave, [...(porClave.get(clave) ?? []), regla])
    }

    // Aunque las dos mitades no compartan ninguna propiedad —`.campo-casilla`
    // fijaba `padding-top` arriba y `padding` abajo, que ni siquiera se
    // llaman igual—, lo que queda es una clase cuyo efecto real no se puede
    // leer en ningún sitio. Se juntan en una sola regla, donde se ve entera.
    const repetidos = [...porClave.entries()]
      .filter(([, iguales]) => iguales.length > 1)
      .map(([clave, iguales]) => `${clave} (${iguales.length} veces)`)

    expect(repetidos).toEqual([])
  })
})

describe('el verde de «publicado / resuelto»', () => {
  it('no queda ningún resto de la segunda familia de verdes', () => {
    const limpio = sinComentarios(panel).toLowerCase()
    expect(limpio).not.toContain('#1e8e3e')
    expect(limpio).not.toContain('#e6f4ea')
    expect(limpio).not.toContain('#16794a')
  })

  it('todas las reservas de `--verde` y `--verde-tenue` valen lo mismo', () => {
    const reserva = (nombre: string) =>
      new Set(
        [...sinComentarios(panel).matchAll(new RegExp(`var\\(\\s*${nombre}\\s*,\\s*([^)]+)\\)`, 'g'))].map(
          (m) => m[1].trim().toLowerCase(),
        ),
      )

    expect([...reserva('--verde')]).toEqual(['#1f7a4d'])
    expect([...reserva('--verde-tenue')]).toEqual(['#e9f5ef'])
  })
})
