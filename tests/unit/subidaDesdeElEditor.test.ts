import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ESQUEMAS, TECHO_DE_MEDIOS_BYTES, TECHO_DE_MODELOS_3D_BYTES } from '@/admin/esquema'
import { formularioDeArchivo } from '@/admin/subidas'
import { desdeTipTap, haciaLexical } from '@/lib/textoRico'

/**
 * El último subidor que iba por la acción vieja, movido a la ruta.
 *
 * Insertar un archivo dentro de un bloque subía por la acción `subirArchivo`
 * mientras el listado de medios ya subía por
 * `src/app/(frontend)/api/subidas/[coleccion]/route.ts`. Por ese único
 * consumidor `serverActions.bodySizeLimit` tuvo que estar en 52 MB, y un vídeo
 * de 50 MB insertado desde el editor se quedaba entero en la RAM del servidor.
 *
 * Lo que se vigila aquí es de cuatro clases, y las dos últimas son las que
 * justifican el archivo:
 *
 *  1. **La forma** de lo que manda el editor, que se puede ejercitar porque
 *     vive en `src/admin/subidas.ts` y no dentro del componente.
 *  2. **El cable**: que `Campos.tsx` llame a la ruta y no a la acción. La suite
 *     corre en `node` y el componente no se deja importar, así que se lee la
 *     fuente, como hacen `campos.test.ts` y `subidaDeVideo.test.ts`.
 *  3. **El número que esto permitía bajar.** Mover la pantalla y dejar el
 *     límite en 52 MB es exactamente el patrón que más ha fallado aquí: lo
 *     escrito y lo cableado por un lado, y la consecuencia que lo justificaba
 *     sin cobrar por el otro.
 *  4. **Lo que se lee fuera del código.** El número estuvo en la cadena de
 *     topes del esquema y del LEEME del despliegue, y la primera versión de
 *     este cambio lo bajó sin tocar ninguno de los dos: la guía seguía diciendo
 *     «hoy 52 MB». Quien opera el servidor decide por esas páginas de dónde
 *     viene un corte, así que se comparan con `next.config.mjs` como las demás
 *     cifras de la cadena.
 *
 * El viaje entero del navegador a la ruta —cabeceras, nombre con tildes, avance
 * y el 413 de un proxy— ya lo prueba `subidaDeVideo.test.ts` contra el
 * manejador de verdad; repetirlo aquí solo duplicaría el `XMLHttpRequest` falso.
 */

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')
const MEGA = 1024 * 1024

const CAMPOS = fuente('src', 'components', 'admin', 'formulario', 'Campos.tsx')
const CONFIG = fuente('next.config.mjs')

/** El cuerpo del selector de archivo, desde su declaración hasta el final. */
const SELECTOR = CAMPOS.slice(CAMPOS.indexOf('function SelectorDeArchivo('))

/**
 * Lo que declara `next.config.mjs`, en bytes. Se lee del texto, igual que en
 * `subidaDeVideo.test.ts`, porque lo que citan los documentos de abajo es la
 * cifra escrita y no la configuración ya resuelta.
 */
const cuerpoDeUnaAccion = (): number => {
  const encontrado = /bodySizeLimit:\s*'(\d+)mb'/.exec(CONFIG)
  expect(encontrado, 'next.config.mjs ya no declara `serverActions.bodySizeLimit`').not.toBeNull()
  return Number(encontrado![1]) * MEGA
}

// -------------------------------------------------------------------- forma

describe('lo que manda el editor al subir un archivo', () => {
  const archivo = new File([new Uint8Array(16)], 'radiografía AP.de.tobillo.png', { type: 'image/png' })

  it('lleva la colección, el archivo y un nombre sin extensión', () => {
    const formulario = formularioDeArchivo('medios', archivo)
    expect(formulario.get('coleccion')).toBe('medios')
    expect(formulario.get('archivo')).toBeInstanceOf(File)
    // Solo la última extensión: «AP.de.tobillo» es parte del nombre.
    expect(formulario.get('alt')).toBe('radiografía AP.de.tobillo')
    expect(formulario.get('nombre')).toBe('radiografía AP.de.tobillo')
  })

  it('no decide `origen`: ese respaldo es de `depurarCampo`', () => {
    expect(formularioDeArchivo('modelos-3d', archivo).has('origen')).toBe(false)
  })

  it('cubre los textos obligatorios de toda colección que recibe archivos', () => {
    // La ruta crea el documento con lo que llega; un texto obligatorio que el
    // editor no mandara haría fallar toda inserción desde un bloque, con un
    // mensaje de validación que no menciona el formulario.
    const enviados = new Set(formularioDeArchivo('medios', archivo).keys())
    for (const esquema of ESQUEMAS.filter((e) => e.subida)) {
      const obligatorios = esquema.secciones
        .flatMap((s) => s.campos)
        .filter((c) => c.tipo === 'texto' && c.requerido)
        .map((c) => c.nombre)
      for (const nombre of obligatorios) {
        expect(enviados.has(nombre), `${esquema.slug}.${nombre} no viaja desde el editor`).toBe(true)
      }
    }
  })
})

// -------------------------------------------------------------------- cable

describe('el selector de archivo de un bloque sube por la ruta', () => {
  it('importa el subidor de la ruta y ya no la acción', () => {
    expect(CAMPOS).toContain("import { formularioDeArchivo, subidorQueAvisa } from '@/admin/subidas'")
    expect(CAMPOS).not.toMatch(/import\s*\{[^}]*\bsubirArchivo\b[^}]*\}\s*from/)
  })

  it('lo llama con el formulario compuesto y con quien pinta la barra', () => {
    expect(SELECTOR).toMatch(
      /subidorQueAvisa\(avisar\)\(\s*formularioDeArchivo\(campo\.coleccion, archivo\),?\s*\)/,
    )
    expect(SELECTOR).toContain('setProgreso({ nombre: archivo.name, fraccion })')
  })

  it('pinta el avance, y la región viva se monta vacía', () => {
    expect(SELECTOR).toContain('<progress')
    expect(SELECTOR).toMatch(/<div role="status">\s*\{progreso \?/)
    expect(SELECTOR).toContain('Procesando en el servidor…')
  })

  it('al terminar escribe con el último `alCambiar`, no con el del clic', () => {
    // Con una subida de minutos se sigue escribiendo mientras tanto, y el
    // `alCambiar` del clic lleva dentro el arreglo de bloques de aquel momento:
    // llamarlo borraría todo lo escrito durante la subida.
    expect(SELECTOR).toContain('ultimos.current.alCambiar(resultado.datos.id)')
    expect(SELECTOR).not.toMatch(/^\s*alCambiar\(resultado\.datos\.id\)/m)
  })

  it('desmontado a mitad —bloque quitado o plegado— no escribe, pero deja el archivo a mano', () => {
    // Escribir resucitaría un bloque quitado, o pisaría con un arreglo viejo lo
    // tecleado después de plegarlo. Recargar las opciones no pisa nada.
    const rama = /if \(!montado\.current\) \{([\s\S]*?)\n\s*\}/.exec(SELECTOR)
    expect(rama, 'el selector ya no mira si sigue montado al terminar').not.toBeNull()
    expect(rama![1]).toContain('ultimos.current.alRecargar()')
    expect(rama![1]).not.toContain('alCambiar')
    expect(rama![1]).toContain('return')
    // Y la rama va antes de escribir.
    expect(SELECTOR.indexOf('if (!montado.current) {')).toBeLessThan(
      SELECTOR.indexOf('ultimos.current.alCambiar('),
    )
  })

  it('ningún archivo de `src/` importa ya la acción de subida', () => {
    // Es la condición para que `bodySizeLimit` pueda medir un documento y no un
    // archivo. `subirArchivo` ya se retiró de `acciones/contenido.ts` —lo fija
    // `guardarDocumento.test.ts`—, y esto sigue aquí por lo que no cubre
    // aquella: una acción de subida nueva con el mismo nombre en otro archivo.
    // Que ninguna acción, se llame como se llame, reciba un archivo lo vigila
    // `subidaDeVideo.test.ts`.
    const archivos: string[] = []
    const recorrer = (directorio: string) => {
      for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
        const camino = join(directorio, entrada.name)
        if (entrada.isDirectory()) recorrer(camino)
        else if (/\.tsx?$/.test(entrada.name)) archivos.push(camino)
      }
    }
    recorrer(join(RAIZ, 'src'))
    const quienes = archivos
      .filter((a) => /import\s*\{[^}]*\bsubirArchivo\b[^}]*\}\s*from/.test(readFileSync(a, 'utf8')))
      .map((a) => relative(RAIZ, a))
    expect(quienes).toEqual([])
  })
})

// ------------------------------------------------------------------- número

describe('el cuerpo de una acción vuelve a medir un documento', () => {
  /**
   * La ficha exagerada con la que se eligió el número, compuesta con la
   * conversión de verdad y no estimada: 40 bloques de texto de 15 párrafos de
   * 80 palabras, con negrita a trozos para que el árbol se parta como se parte
   * uno escrito a mano. 48.000 palabras, que es un libro.
   */
  const fichaDeLibro = (): number => {
    const parrafo = {
      type: 'paragraph',
      content: Array.from({ length: 8 }, (_, i) => ({
        type: 'text',
        text: `${Array.from({ length: 10 }, () => 'reducción').join(' ')} `,
        ...(i % 2 ? { marks: [{ type: 'bold' }] } : {}),
      })),
    }
    const rico = haciaLexical(desdeTipTap({ type: 'doc', content: Array.from({ length: 15 }, () => parrafo) }))
    const bloques = Array.from({ length: 40 }, () => ({ blockType: 'texto', contenido: rico }))
    return Buffer.byteLength(JSON.stringify(['cirugias', '1', { nombre: 'Libro', contenido: bloques }]))
  }

  it('ya no va por encima del techo de los medios: nadie sube archivos por aquí', () => {
    // Si vuelve a hacer falta, la pregunta es qué acción ha empezado a mandar
    // un archivo, y la respuesta es moverla a la ruta, no subir esto.
    expect(cuerpoDeUnaAccion()).toBeLessThan(TECHO_DE_MEDIOS_BYTES)
  })

  it('pero da de sobra para guardar una ficha del tamaño de un libro', () => {
    // El 1 MB por omisión de Next no llega: esta ficha lo roza. Y por encima
    // del límite Guardar no dice nada, porque Next corta antes de invocar la
    // acción. Tres veces, para que un cambio menor en la conversión no deje la
    // prueba al borde.
    const ficha = fichaDeLibro()
    expect(ficha).toBeGreaterThan(0.5 * MEGA)
    expect(cuerpoDeUnaAccion()).toBeGreaterThanOrEqual(3 * ficha)
  })
})

// ------------------------------------------------------ lo que se lee fuera

describe('lo que lee quien opera el servidor dice la cifra de ahora', () => {
  /**
   * Los tres sitios que describen la cadena de topes. `BITACORA.md` no está a
   * propósito: sus entradas cuentan lo que valía cuando se escribieron y no se
   * reescriben (AGENTS.md), así que un 52 allí es historia y no un error.
   */
  const DOCUMENTOS = [
    'src/admin/esquema.ts',
    'despliegue/paginas/LEEME.md',
    'docs/DESPLIEGUE.md',
  ]

  const megasDeUnaAccion = (): number => cuerpoDeUnaAccion() / MEGA

  it('la tabla del LEEME, si conserva la fila de `bodySizeLimit`, dice lo que vale', () => {
    // Quitar la fila es tan válido como corregirla: el número ya no es un tope
    // de las subidas. Lo que no vale es dejarla con la cifra de antes, porque
    // esa tabla es la que se consulta cuando un vídeo no sube.
    const leeme = fuente('despliegue', 'paginas', 'LEEME.md')
    const filas = [...leeme.matchAll(/^\|[^\n]*bodySizeLimit[^\n]*\|\s*(\d+)\s*MB\s*\|\s*$/gm)]
    for (const fila of filas) {
      expect(Number(fila[1]), `la fila «${fila[0].trim()}»`).toBe(megasDeUnaAccion())
    }
  })

  it.each(DOCUMENTOS)('donde %s dice cuánto vale hoy, dice lo que vale', (documento) => {
    // Solo la cifra marcada como presente —«hoy N MB» o «`bodySizeLimit`…: N
    // MB»— y en la misma línea. Una frase que cuente que «tuvo que estar en 52»
    // es historia y tiene que poder escribirse.
    const texto = fuente(...documento.split('/'))
    const citas = [...texto.matchAll(/bodySizeLimit`?[^\n]{0,40}?(?:\bhoy|:)\s+(\d+)\s*MB/g)]
    for (const cita of citas) {
      expect(Number(cita[1]), `«${cita[0]}»`).toBe(megasDeUnaAccion())
    }
  })

  it.each(DOCUMENTOS)('la cadena «a ≤ b ≤ c» de %s ya no lleva el cuerpo de una acción', (documento) => {
    // La cadena ordena los topes que puede encontrarse un archivo al subir, y
    // desde que ninguno viaja por una acción ese eslabón no está en el camino.
    // Dejarlo con su cifra nueva sería peor que con la vieja: «50 ≤ 4 ≤ 64» no
    // se lee como un error de redacción sino como un corte en 4 MB.
    const leeme = fuente('despliegue', 'paginas', 'LEEME.md')
    const proxy = /\|\s*`client_max_body_size`[^|]*\|\s*(\d+)\s*MB\s*\|/.exec(leeme)
    expect(proxy, 'el LEEME del despliegue perdió la fila de `client_max_body_size`').not.toBeNull()
    const permitidas = new Set([
      TECHO_DE_MODELOS_3D_BYTES / MEGA,
      TECHO_DE_MEDIOS_BYTES / MEGA,
      Number(proxy![1]),
    ])

    const texto = fuente(...documento.split('/'))
    for (const cadena of texto.matchAll(/\d+(?:\s*≤\s*\d+)+/g)) {
      const intrusas = (cadena[0].match(/\d+/g) ?? []).map(Number).filter((n) => !permitidas.has(n))
      expect(intrusas, `«${cadena[0]}» nombra un tope que no es de las subidas`).toEqual([])
    }
  })
})
