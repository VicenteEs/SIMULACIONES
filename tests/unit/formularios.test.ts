import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { depurarDocumento, faltantes } from '@/admin/depurar'
import { esquemaDe, type EsquemaDeColeccion } from '@/admin/esquema'

/**
 * Los dos formularios que escribe una persona: el editor del panel y el
 * comentario al pie de las fichas.
 *
 * El entorno de la suite es `node` y el proyecto no tiene jsdom ni biblioteca
 * de componentes (ver `vitest.config.mts`), así que aquí no se pinta nada. Lo
 * que se vigila son las dos cosas que ya se rompieron y que ni el compilador ni
 * la pantalla delatan:
 *
 *  1. El criterio de «falta algo» copiado a mano. La pestaña del editor lo
 *     tenía escrito aparte de `faltantes`, y en cuanto esa aprendió a bajar a
 *     grupos, listas y bloques, la copia se quedó atrás: un texto rico vacío no
 *     es `null` ni `''`, y una fila a medias dentro de un bloque ni se miraba,
 *     de modo que la pestaña salía limpia y el rechazo llegaba al publicar sin
 *     decir dónde mirar. El editor ya no repite la prueba: le recorta el
 *     esquema a una sección y pregunta. Lo que se comprueba abajo es que ese
 *     recorte siga acotando lo que se revisa, que es de lo que depende.
 *  2. El registro de la plataforma y lo que oye un lector de pantalla. Nada de
 *     eso falla al compilar, y en pantalla el tuteo se lee perfectamente: el
 *     residente terminaba un caso leyendo «Arrastre el fragmento» y veinte
 *     píxeles más abajo «¿Encontraste un error?».
 */

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const COMENTARIO = fuente('src', 'components', 'FormularioComentario.tsx')
const EDITOR = fuente('src', 'components', 'admin', 'FormularioDocumento.tsx')

// ------------------------------------------------- el criterio de «falta algo»

const patologias = esquemaDe('patologias')

/**
 * La misma operación que hace el editor para preguntar pestaña por pestaña.
 *
 * Vive aquí copiada porque `FormularioDocumento.tsx` arrastra el árbol entero
 * de componentes del panel —editor de texto rico, visores de three.js, acciones
 * de servidor— y este entorno no lo puede cargar. Lo que importa es que el
 * recorte funcione: `camposDe` es un `flatMap` de `secciones`, así que dejar una
 * sola sección deja una sola tanda de campos que revisar. El día que `camposDe`
 * mire otra cosa, esta prueba cae antes que la pestaña.
 */
const faltantesDeSeccion = (
  esquema: EsquemaDeColeccion,
  valores: Record<string, unknown>,
  titulo: string,
  profundo = true,
): string[] => {
  const seccion = esquema.secciones.find((s) => s.titulo === titulo)
  if (!seccion) throw new Error(`El esquema de ${esquema.slug} ya no tiene «${titulo}».`)
  return faltantes({ ...esquema, secciones: [seccion] }, valores, { profundo })
}

describe('la pestaña se marca con el mismo criterio que aplica el servidor', () => {
  it('una fila a medias dentro de un bloque marca su pestaña', () => {
    const documento = depurarDocumento(patologias, {
      nombre: 'Fractura de fémur',
      segmento: 7,
      clasificacion: [{ blockType: 'lista-clinica', titulo: 'Signos', puntos: [{ destacado: 'Dolor' }] }],
    })
    // Era invisible: la comprobación vieja miraba `clasificacion` —un arreglo
    // con un bloque dentro, o sea no vacío— y daba la pestaña por completa.
    expect(faltantesDeSeccion(patologias, documento, 'Clasificación').join(' ')).toContain(
      'en punto 1',
    )
  })

  it('el recorte no arrastra lo que falta en las demás pestañas', () => {
    const documento = depurarDocumento(patologias, {
      // Sin nombre y sin segmento: las dos faltas viven en «Identificación».
      clasificacion: [{ blockType: 'advertencia' }],
    })
    const identificacion = faltantesDeSeccion(patologias, documento, 'Identificación').join(' ')
    const clasificacion = faltantesDeSeccion(patologias, documento, 'Clasificación').join(' ')

    expect(identificacion).toContain('nombre de la patología')
    expect(identificacion).not.toContain('advertencia')
    expect(clasificacion).toContain('en advertencia 1')
    expect(clasificacion).not.toContain('nombre de la patología')
  })

  it('al guardar un borrador no se juzga lo que solo se exige al publicar', () => {
    // D-011: la ficha se escribe a lo largo de varios días. Si la revisión
    // profunda corriera también aquí, guardar arrastraría al traumatólogo a
    // otra pestaña cada vez.
    const documento = depurarDocumento(patologias, {
      nombre: 'Fractura de fémur',
      segmento: 7,
      clasificacion: [{ blockType: 'advertencia' }],
    })
    expect(faltantesDeSeccion(patologias, documento, 'Clasificación', false)).toEqual([])
    expect(faltantesDeSeccion(patologias, documento, 'Clasificación')).not.toEqual([])
  })
})

describe('el editor no vuelve a escribir por su cuenta la prueba de vacío', () => {
  it('pregunta a `faltantes` y no compara contra la cadena vacía', () => {
    expect(EDITOR).toContain('faltantes(')
    // La firma de la copia que había: `valor === ''`. Volver a escribirla es
    // volver a separarse de `depurar.ts` sin que nada avise.
    expect(EDITOR).not.toContain("valor === ''")
  })
})

// --------------------------------------------------------- lo que se le dice

/**
 * Las formas de tuteo que estaban en el formulario de comentarios, y su
 * familia. Toda la plataforma ustedea —«Arrastre el fragmento», «Escriba su
 * contraseña», «Elija su contraseña»—; dos registros en la misma pantalla no se
 * leen como cercanía sino como que nadie revisó.
 */
const TUTEOS = [/\btus?\b/i, /\bencontraste\b/i, /\btienes\b/i, /\bdeja\b/i, /\bdescribe\b/i, /\bintenta\b/i]

describe('el formulario de comentarios habla de usted', () => {
  for (const tuteo of TUTEOS) {
    it(`no dice ${tuteo}`, () => {
      expect(COMENTARIO).not.toMatch(tuteo)
    })
  }
})

describe('el formulario de comentarios se puede usar sin ver la pantalla', () => {
  it('el campo tiene etiqueta propia y no solo un marcador de posición', () => {
    // El marcador desaparece al escribir la primera letra, y en examen físico
    // este formulario se repite una vez por maniobra: sin etiqueta, el lector
    // anuncia N campos idénticos «en blanco».
    expect(COMENTARIO).toMatch(/<label htmlFor=\{idCampo\}/)
    expect(COMENTARIO).toMatch(/<textarea\s+id=\{idCampo\}/)
  })

  it('el resultado del envío se anuncia, salga bien o salga mal', () => {
    // El `<form>` se sustituye por el aviso: lo que tenía el foco desaparece y
    // sin región viva el envío es silencio.
    expect(COMENTARIO).toContain('role="status"')
    expect(COMENTARIO).toContain('role="alert"')
  })

  it('el fallo no se traga: lo que se pinta es el motivo', () => {
    // `catch (error) { setEstado('error') }` ligaba el error y no lo leía
    // nunca, y el texto fijo mandaba a reintentar lo único que no podía
    // funcionar: una sesión caducada.
    expect(COMENTARIO).toContain('motivoDelFallo(error)')
  })
})

describe('el editor del panel avisa de lo que pasa', () => {
  it('la región del aviso amable se queda montada aunque esté vacía', () => {
    // Un `role="status"` que aparece a la vez que su texto no se anuncia: el
    // lector de pantalla tiene que estar observando la región antes de que su
    // contenido cambie. Montado con el mensaje dentro, «Borrador guardado.»
    // era silencio. Por eso se mira que el `<div role="status">` esté fuera de
    // la condición y que lo condicional sea solo lo de dentro.
    const region = EDITOR.indexOf('<div role="status">')
    expect(region).toBeGreaterThan(-1)
    expect(EDITOR.slice(region, region + 120)).toContain("{aviso?.tipo === 'ok' ? (")
  })

  it('el aviso de error interrumpe y puede recibir el foco', () => {
    // Este sí puede montarse con su texto: `role="alert"` interrumpe y los
    // lectores lo leen al insertarse. El foco además deja a la persona junto al
    // mensaje, que es de donde tiene que salir: el rechazo cambió de pestaña
    // por debajo con `setSeccion`.
    const desde = EDITOR.indexOf("{aviso?.tipo === 'error' ? (")
    expect(desde).toBeGreaterThan(-1)
    const error = EDITOR.slice(desde, EDITOR.indexOf('{aviso.texto}', desde))
    expect(error).toContain('role="alert"')
    expect(error).toContain('tabIndex={-1}')
  })

  it('duplicar consulta los cambios sin guardar antes de irse', () => {
    // «Duplicar» navega a la copia con `router.push`, que `beforeunload` no ve,
    // y la copia la saca el servidor del documento guardado: sin la pregunta lo
    // escrito se perdía dos veces.
    const duplicar = EDITOR.slice(
      EDITOR.indexOf('{id !== null && !esquema.subida ? ('),
      EDITOR.indexOf('await duplicarDocumento('),
    )
    expect(duplicar).toContain('puedeSalir()')
  })

  it('las migas consultan los cambios sin guardar antes de irse', () => {
    // `beforeunload` no se dispara en una navegación de cliente del App
    // Router, y estas dos migas están tres líneas por encima del título.
    const migas = EDITOR.slice(
      EDITOR.indexOf('<nav className="editor-migas">'),
      EDITOR.indexOf('</nav>'),
    )
    const enlaces = migas.match(/<Link/g) ?? []
    const guardias = migas.match(/onNavigate=/g) ?? []
    expect(enlaces.length).toBeGreaterThan(0)
    expect(guardias).toHaveLength(enlaces.length)
  })

  it('la marca de cambios sin guardar no se limpia a ciegas', () => {
    // Los campos siguen aceptando teclas mientras la acción de servidor viaja.
    // Un `setSucio(false)` suelto declaraba guardado lo que se escribió durante
    // el guardado y retiraba el aviso de salida sobre texto que nunca llegó.
    const lineas = EDITOR.split('\n').filter((linea) => linea.includes('setSucio(false)'))
    expect(lineas).not.toHaveLength(0)
    for (const linea of lineas) expect(linea).toContain('if (')
  })
})
