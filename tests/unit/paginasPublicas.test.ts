import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rutaPublica } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Vigilancia de las cinco páginas públicas.
 *
 * Son componentes de servidor: no tienen prueba de integración que los
 * ejecute, y los tres fallos de abajo comparten la misma propiedad —el
 * compilador los da por buenos y en pantalla no se nota nada—. Por eso se
 * miran en el disco, y siempre por su consecuencia:
 *
 *   - `overrideAccess` vale `true` por omisión en la API local de Payload. Una
 *     consulta sin él compila, responde y enseña borradores.
 *   - El ancla del examen físico es un contrato entre dos archivos que no se
 *     importan entre sí: la compone `rutaPublica` y la declara el listado.
 *   - Un enlace al panel en un estado vacío funciona perfectamente… hasta que
 *     lo pulsa un lector, al que el panel devuelve a la portada sin mensaje.
 *
 * No se comprueba forma sino efecto, y solo de lo que ya se rompió una vez.
 */

const RAIZ = join(process.cwd(), 'src', 'app', '(frontend)')
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const PORTADA = fuente('page.tsx')
const EXAMEN_FISICO = fuente('examen-fisico', 'page.tsx')
const FICHA = fuente('biblioteca', '[id]', 'page.tsx')
const ESTILOS = fuente('estilos.css')

/**
 * Cuerpo del objeto de opciones de la llamada `.<operacion>({ … })` que
 * menciona `sobre`.
 *
 * Hay más de un `count` en la portada —el de los módulos y el de las fichas ya
 * leídas—, y solo uno de los dos es el que importa aquí: el segundo consulta
 * `actividad` acotada por `usuario`, y ahí `overrideAccess: true` es correcto.
 * Por eso la llamada se localiza por lo que consulta y no por su posición.
 */
function opcionesDe(codigo: string, operacion: string, sobre: string): string {
  const marca = `.${operacion}({`
  for (let inicio = codigo.indexOf(marca); inicio !== -1; inicio = codigo.indexOf(marca, inicio + 1)) {
    const desde = codigo.indexOf('{', inicio)
    let nivel = 0
    for (let i = desde; i < codigo.length; i++) {
      if (codigo[i] === '{') nivel++
      else if (codigo[i] === '}') {
        nivel--
        if (nivel === 0) {
          const cuerpo = codigo.slice(desde, i + 1)
          if (cuerpo.includes(sobre)) return cuerpo
          break
        }
      }
    }
  }
  throw new Error(`no hay ninguna llamada a .${operacion}() sobre «${sobre}»`)
}

/**
 * Nombre de la lista que se recorre con el `.map(` más cercano por encima de
 * `ancla`.
 *
 * Se compara el nombre y no el contenido porque lo que hay que sostener es que
 * los conteos y las tarjetas recorran **la misma** lista: en cuanto son dos,
 * `conteos[i]` deja de casar con la tarjeta `i` y cada módulo enseña la cifra
 * del de al lado, que es un fallo que en pantalla parece contenido.
 */
function listaQueRecorre(codigo: string, ancla: string): string {
  const fin = codigo.indexOf(ancla)
  if (fin === -1) throw new Error(`no aparece «${ancla}»`)
  const previos = [...codigo.slice(0, fin).matchAll(/(\w+)\.map\(/g)]
  const ultimo = previos[previos.length - 1]
  if (!ultimo) throw new Error(`no hay ningún .map() antes de «${ancla}»`)
  return ultimo[1]
}

describe('la portada consulta con el control de acceso puesto', () => {
  /**
   * Los conteos de las tarjetas salían de `overrideAccess: true`, que ignora a
   * la vez el estado de publicación y `modulosVisibles`. La portada prometía
   * «6 entradas» y el módulo, que sí consulta con el usuario, contestaba
   * «todavía no hay fichas escritas»: dos pantallas contradiciéndose en dos
   * clics, y la cifra «por leer» que nunca llegaba a cero.
   */
  it('cuenta las fichas de cada módulo como las cuenta el módulo', () => {
    const conteo = opcionesDe(PORTADA, 'count', 'm.coleccion')
    expect(conteo).toContain('overrideAccess: false')
    expect(conteo).toContain('user:')
  })

  /**
   * «Continúa leyendo» resuelve el título de una ficha cuyo identificador
   * eligió quien creó la fila de `actividad` —`POST /api/actividad` solo exige
   * sesión activa—. Sin `overrideAccess: false` esa consulta no comprobaba
   * nada, y probando identificadores 1, 2, 3… se podía enumerar el título de
   * cualquier borrador, incluidos los de los módulos vetados a esa cuenta.
   */
  it('resuelve el título de «Continúa leyendo» comprobando el acceso', () => {
    const porId = opcionesDe(PORTADA, 'findByID', 'registro.coleccion')
    expect(porId).toContain('overrideAccess: false')
    expect(porId).toContain('usuarioEfectivo')
  })

  /**
   * Un módulo que la cuenta no tiene no se cuenta ni se pinta.
   *
   * `lecturaDeModulo` devuelve `false` para él y Payload, ante un `false`, no
   * responde con una lista vacía sino que lanza `Forbidden`. Mientras la rejilla
   * recorría `MODULOS` entero, el `.catch(() => 0)` convertía ese `Forbidden` en
   * un cero: la tarjeta rotulaba «Sin contenido» sobre un módulo que puede estar
   * lleno —y el conteo es la única señal que da la portada sobre dónde hay
   * material— y su enlace llevaba a un listado que consulta sin `catch`, o sea a
   * la pantalla genérica de Next, en inglés y sin barra para volver.
   *
   * La barra superior ya se recortaba así (`Navegacion.tsx`); la portada no.
   */
  it('recorta la rejilla con el mismo permiso que recorta la barra', () => {
    expect(PORTADA).toContain('puedeVerModulo')

    const deLosConteos = listaQueRecorre(PORTADA, '.count({ collection: m.coleccion')
    const deLaRejilla = listaQueRecorre(PORTADA, 'className="tarjeta-modulo"')

    expect(deLosConteos).not.toBe('MODULOS')
    expect(deLaRejilla).toBe(deLosConteos)
  })
})

describe('el título de una fase no se separa de su regla de estilo', () => {
  /**
   * El nivel del encabezado lo decide la semántica —las fases cuelgan del <h2>
   * del apartado, no de un <h3> de `<Bloques>`— y el tamaño lo decide
   * `estilos.css`. Son dos archivos que no se importan entre sí, así que el
   * cambio de nivel se lleva por delante el selector sin que nada falle: el
   * título pasa de 15 px a los 17 px del <h3> global y, peor, la regla general
   * `h1, h2, h3, h4 { margin: 0 }` lo deja pegado por arriba a `.fase-cuando` y
   * por abajo al párrafo, dentro de una lista cuyo ritmo vertical lo daba justo
   * ese margen. Se vigila el par, no cada mitad.
   */
  it('el nivel que usa la ficha tiene su selector con tamaño y margen', () => {
    const encabezado = FICHA.match(/<h([1-6])>\{f\.titulo\}<\/h\1>/)
    expect(encabezado, 'el título de la fase ya no es un encabezado').not.toBeNull()

    const nivel = `h${encabezado![1]}`
    const regla = ESTILOS.match(new RegExp(`\\.fases ${nivel} \\{([^}]*)\\}`))
    expect(regla, `falta la regla \`.fases ${nivel}\` en estilos.css`).not.toBeNull()
    expect(regla![1]).toContain('font-size')
    expect(regla![1]).toContain('margin')
  })
})

describe('el listado del examen físico declara el ancla que le mandan', () => {
  /**
   * El examen físico es el único módulo sin página por documento, así que
   * `rutaPublica` manda a `/examen-fisico#maniobra-<id>`. Cuando el `<article>`
   * no declaraba ese `id`, «Ver publicado ↗» y «abrir ficha →» aterrizaban
   * arriba del listado y había que buscar la maniobra a ojo entre todas las de
   * todos los segmentos.
   */
  it('usa el mismo prefijo de ancla que compone rutaPublica', () => {
    const ancla = rutaPublica('maniobras', 7).split('#')[1]
    expect(ancla).toBe('maniobra-7')

    const prefijo = ancla.slice(0, ancla.lastIndexOf('7'))
    expect(EXAMEN_FISICO).toMatch(new RegExp('id=\\{`' + prefijo + '\\$\\{'))
  })
})

describe('los estados vacíos no ofrecen el panel a quien no puede entrar', () => {
  /**
   * La plataforma nace vacía a propósito (D-016), así que el estado vacío es
   * la primera pantalla del primer residente. Su único botón llevaba al panel,
   * y el panel devuelve a la portada sin una palabra a todo el que no sea
   * admin ni editor (`admin-panel/acceso.ts`): sin error y sin mensaje, el
   * botón se lee como una avería.
   *
   * Un enlace escrito como literal es exactamente el fallo, porque un literal
   * no puede depender del rol. La comprobación es esa: al panel solo se enlaza
   * a través de una condición.
   */
  const LISTADOS = [
    ['biblioteca', join('biblioteca', 'page.tsx')],
    ['simulador', join('simulador', 'page.tsx')],
    ['examen físico', join('examen-fisico', 'page.tsx')],
  ] as const

  it.each(LISTADOS)('%s condiciona el enlace al panel', (_nombre, archivo) => {
    const codigo = readFileSync(join(RAIZ, archivo), 'utf8')
    expect(codigo).not.toMatch(/enlace="\/admin-panel/)
    expect(codigo).toContain('puedeEditar')
  })
})
