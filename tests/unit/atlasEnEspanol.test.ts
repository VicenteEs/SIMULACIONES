import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { armarArbol } from '@/atlas/catalogo'
import { cargarCatalogo, montarEscena } from '@/atlas/cargador'
import { CORRECCIONES_DE_SISTEMA, corregirCatalogo } from '@/atlas/clasificacion'
import {
  buscarEnEspanol,
  ordenarArbolEnEspanol,
  ordenarPorNombreEnEspanol,
} from '@/atlas/arbolEnEspanol'
import { casaConLaBusqueda, nombreEnEspanol, tieneTraduccion } from '@/atlas/nombres'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { ruta } from '@/lib/rutas'

/**
 * El atlas, leído en español y con los sistemas corregidos.
 *
 * Los cimientos —`corregirCatalogo` y `nombreEnEspanol`— tienen sus propias
 * funciones probadas. Lo que se prueba aquí es lo que más ha fallado en este
 * repositorio: que quien tenía que llamarlas las llame. Una corrección de
 * sistema que nadie aplica al cargar deja al peroneo corto encendido pegado al
 * peroné con la capa de músculo apagada, y no hay ningún error que lo cante.
 *
 * Las pruebas de nombres leen la tabla de verdad, `nombres-es.json`, que ya
 * trae 1.663 de los 1.674 nombres distintos del atlas (traducidos y revisados
 * por agentes automáticos, no por un médico fila a fila; ver D-092). Se escribieron cuando tenía nueve, y contaban con que casi nada
 * estuviera traducido: la arteria tibial se elegía «sin traducción» y el orden
 * esperado dejaba tres nombres en inglés entre las «R». Con la tabla llena esas
 * expectativas dejaron de ser ciertas sin que el código hubiera cambiado.
 *
 * Lo que no tiene traducción sigue teniendo que funcionar —once estructuras no
 * la tienen, y cualquier atlas regenerado puede traer más—, pero ya no se
 * prueba con una pieza que HOY no está en la tabla y mañana sí: se prueba con
 * una estructura inventada, que no puede llegar a estarlo, y la prueba lo
 * comprueba antes de fiarse (`tieneTraduccion`).
 */

const RAIZ = process.cwd()
const leer = (...partes: string[]) =>
  readFileSync(join(RAIZ, ...partes), 'utf8').replace(/\r\n/g, '\n')

afterEach(() => {
  vi.unstubAllGlobals()
})

// ------------------------------------------------------------ atlas falso

/**
 * Un paquete de un triángulo que comparten todas las piezas. `montarEscena`
 * copia la geometría de cada una desde sus desplazamientos, así que pueden
 * apuntar al mismo sitio sin que eso cambie cómo se agrupan.
 */
function paquete(): ArrayBuffer {
  const bufer = new ArrayBuffer(68)
  new Float32Array(bufer, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
  new Int16Array(bufer, 36, 9).set([0, 0, 32767, 0, 0, 32767, 0, 0, 32767])
  new Uint32Array(bufer, 56, 3).set([0, 1, 2])
  return bufer
}

function pieza(id: string, nombre: string, sistema: string): PiezaDelAtlas {
  return {
    id,
    nombre,
    fma: `FMA-${id}`,
    sistema,
    region: 'miembro-inferior-derecho',
    origenRegion: 'anatomia',
    paquete: 0,
    pos: 0,
    nor: 36,
    idx: 56,
    vertices: 3,
    indices: 3,
    caja: [
      [0, 0, 0],
      [1, 1, 0],
    ],
  }
}

/** Tal como sale de `scripts/atlas/preparar.mjs`: con los errores del origen. */
function catalogoCrudo(): CatalogoDelAtlas {
  return {
    version: 'prueba-en-espanol',
    fuente: 'BodyParts3D 4.0',
    licencia: 'CC BY 4.0',
    sujeto: 'Prueba',
    triangulos: 4,
    sistemas: [
      { id: 'skeletal', nombre: 'Esqueleto', color: '#eeeeee', orden: 1 },
      { id: 'muscular', nombre: 'Músculos', color: '#b6544c', orden: 2 },
      { id: 'connective', nombre: 'Tejido conectivo', color: '#d8c9a8', orden: 3 },
    ],
    regiones: [{ id: 'miembro-inferior-derecho', nombre: 'Miembro inferior derecho', orden: 1 }],
    paquetes: [{ archivo: 'cuerpo-0.bin.gz', bytes: 68, bytesComprimido: 30 }],
    piezas: [
      pieza('p0', 'Right tibia', 'skeletal'),
      pieza('p1', 'Right fibularis brevis', 'skeletal'),
      pieza('p2', 'Right iliotibial tract', 'skeletal'),
      pieza('p3', 'Right fibula', 'skeletal'),
      pieza('p4', 'Right anterior tibial artery', 'muscular'),
      pieza('p5', 'Left femur', 'skeletal'),
      // La rótula es la que distingue los dos órdenes: por el original va
      // antes que el peroné («Left patella» < «Right fibula») y en español va
      // después («Peroné derecho» < «Rótula izquierda»).
      pieza('p6', 'Left patella', 'skeletal'),
    ],
  }
}

/**
 * Una estructura que no está en la tabla ni puede llegar a estarlo: el nombre
 * es inventado. Sirve para probar lo que se hace con lo que no tiene
 * traducción sin depender de qué le falte hoy a `nombres-es.json`.
 *
 * Lleva palabras que las equivalencias de `buscarPiezas` conocen («artery») y
 * otras que no («hypothetical»), y ninguna «Right»: así entra en las pruebas
 * que la necesitan sin cambiar las cuentas de las demás.
 */
const SIN_TRADUCCION = 'Hypothetical test artery'

const sirveElCatalogo = (catalogo: CatalogoDelAtlas) => {
  const falso = vi.fn(async () => ({ ok: true, status: 200, json: async () => catalogo }))
  vi.stubGlobal('fetch', falso)
  return falso
}

/** Cómo se llama la malla fusionada en la que acabó una pieza. */
function mallaDe(catalogo: CatalogoDelAtlas, nombre: string): string {
  const escena = montarEscena(catalogo, new Map([[0, paquete()]]))
  const indice = catalogo.piezas.findIndex((p) => p.nombre === nombre)
  const rango = escena.rangos.get(indice)
  const nombreDeMalla = rango ? escena.mallas[rango.malla].name : '(sin malla)'
  escena.liberar()
  return nombreDeMalla
}

// ------------------------------------------------------------- el cargador

describe('el cargador del navegador corrige los sistemas al leer', () => {
  it('devuelve los peroneos como músculo y la cintilla como tejido conectivo', async () => {
    const falso = sirveElCatalogo(catalogoCrudo())
    const catalogo = await cargarCatalogo()

    expect(falso).toHaveBeenCalledWith(ruta('/atlas/catalogo.json'), expect.anything())
    const sistemaDe = (nombre: string) => catalogo.piezas.find((p) => p.nombre === nombre)?.sistema
    expect(sistemaDe('Right fibularis brevis')).toBe('muscular')
    expect(sistemaDe('Right iliotibial tract')).toBe('connective')
    // Y lo que no está mal clasificado no se toca.
    expect(sistemaDe('Right fibula')).toBe('skeletal')
    expect(sistemaDe('Right anterior tibial artery')).toBe('muscular')
  })

  it('la escena agrupa por sistema sobre lo que devuelve el cargador, no sobre el crudo', async () => {
    sirveElCatalogo(catalogoCrudo())
    const catalogo = await cargarCatalogo()

    expect(mallaDe(catalogo, 'Right fibularis brevis')).toBe('muscular')
    expect(mallaDe(catalogo, 'Right iliotibial tract')).toBe('connective')
    expect(mallaDe(catalogo, 'Right fibula')).toBe('skeletal')

    // La contraprueba: con el crudo, el peroneo se fusiona con el hueso. Si esto
    // dejara de ser así, la prueba de arriba no estaría distinguiendo nada.
    expect(mallaDe(catalogoCrudo(), 'Right fibularis brevis')).toBe('skeletal')
  })

  it('el árbol y la escena dicen lo mismo del peroneo', async () => {
    // Beben del mismo objeto: si el árbol lo pusiera en músculos y la escena lo
    // pintara con el esqueleto, no habría manera de saber cuál de los dos miente.
    sirveElCatalogo(catalogoCrudo())
    const catalogo = await cargarCatalogo()

    const musculos = armarArbol(catalogo, 'sistema').find((g) => g.id === 'muscular')
    const enElArbol = musculos?.ramas.flatMap((r) => r.piezas.map((p) => p.nombre))
    expect(enElArbol).toContain('Right fibularis brevis')
    expect(mallaDe(catalogo, 'Right fibularis brevis')).toBe(musculos?.id)
  })
})

// ----------------------------------------------------------- atlas de verdad

describe('las correcciones sobre el atlas preparado en esta copia del proyecto', () => {
  let real: CatalogoDelAtlas | null = null
  try {
    real = JSON.parse(leer('public', 'atlas', 'catalogo.json')) as CatalogoDelAtlas
  } catch {
    real = null
  }
  const siHay = real ? it : it.skip

  siHay('cada estructura corregida existe y su sistema nuevo está declarado', () => {
    // Un sistema corregido que el catálogo no declare no rompe nada: la pieza
    // desaparece del árbol «Por sistema» —que solo recorre los declarados— y
    // se pinta de gris. Justo lo contrario de lo que se quería arreglar.
    const corregido = corregirCatalogo(real!)
    const declarados = new Set(corregido.sistemas.map((s) => s.id))
    for (const [nombre, sistema] of Object.entries(CORRECCIONES_DE_SISTEMA)) {
      const suyas = corregido.piezas.filter((p) => p.nombre === nombre)
      expect(suyas.length, nombre).toBeGreaterThan(0)
      for (const p of suyas) expect(p.sistema, nombre).toBe(sistema)
      expect(declarados.has(sistema), `${nombre} → ${sistema}`).toBe(true)
    }
  })

  siHay('ninguna pieza se pierde del árbol al corregir', () => {
    const corregido = corregirCatalogo(real!)
    for (const eje of ['region', 'sistema'] as const) {
      const cuantas = armarArbol(corregido, eje).reduce(
        (total, grupo) => total + grupo.ramas.reduce((t, r) => t + r.piezas.length, 0),
        0,
      )
      expect(cuantas, eje).toBe(real!.piezas.length)
    }
  })
})

// ------------------------------------------------------------------- orden

describe('el orden del árbol', () => {
  it('ordena por el nombre en español y no por el original', () => {
    // La expectativa de antes contaba con la semilla de nueve traducciones:
    // dejaba la arteria, el peroneo y la cintilla en inglés, entre las «R».
    // Con la tabla revisada los siete tienen nombre en español, y lo que se
    // exige es lo mismo con más dureza: el orden entero es el del español,
    // y lo que no tiene traducción cae donde cae su original leído como texto
    // —la «H», entre «Fémur» y «Peroné»—, no al final ni al principio.
    expect(tieneTraduccion(SIN_TRADUCCION)).toBe(false)
    const crudo = catalogoCrudo()
    const catalogo = corregirCatalogo({
      ...crudo,
      piezas: [...crudo.piezas, pieza('p7', SIN_TRADUCCION, 'arterial')],
    })
    const ordenadas = ordenarPorNombreEnEspanol(catalogo.piezas)
    expect(ordenadas.map((p) => nombreEnEspanol(p.nombre))).toEqual([
      'Arteria tibial anterior derecha',
      'Cintilla iliotibial derecha',
      'Fémur izquierdo',
      SIN_TRADUCCION,
      'Peroné derecho',
      'Peroneo corto derecho',
      'Rótula izquierda',
      'Tibia derecha',
    ])
    // Por el original, la rótula iría segunda y la tibia entre las «R»: si esto
    // coincidiera con lo de arriba, la prueba no estaría distinguiendo nada.
    expect(ordenadas.map((p) => p.nombre)).toEqual([
      'Right anterior tibial artery',
      'Right iliotibial tract',
      'Left femur',
      SIN_TRADUCCION,
      'Right fibula',
      'Right fibularis brevis',
      'Left patella',
      'Right tibia',
    ])
  })

  it('reordena cada rama del árbol y conserva los mismos objetos de pieza', () => {
    // La fila del árbol va memorizada y compara la pieza por referencia: una
    // copia por pieza la repintaría en cada paso del ratón.
    const catalogo = corregirCatalogo(catalogoCrudo())
    const crudo = armarArbol(catalogo, 'region')
    const ordenado = ordenarArbolEnEspanol(crudo)

    const rama = ordenado[0].ramas.find((r) => r.id === 'skeletal')!
    expect(rama.piezas.map((p) => p.nombre)).toEqual([
      'Left femur',
      'Right fibula',
      'Left patella',
      'Right tibia',
    ])
    const original = crudo[0].ramas.find((r) => r.id === 'skeletal')!
    for (const p of rama.piezas) expect(original.piezas).toContain(p)
    // Y no toca el que recibe: `armarArbol` lo dejó ordenado por el original.
    expect(original.piezas.map((p) => p.nombre)).toEqual([
      'Left femur',
      'Left patella',
      'Right fibula',
      'Right tibia',
    ])
  })
})

// ---------------------------------------------------------------- búsqueda

describe('la búsqueda del árbol', () => {
  const catalogo = corregirCatalogo(catalogoCrudo())
  const nombres = (consulta: string) => buscarEnEspanol(catalogo, consulta).piezas.map((p) => p.nombre)

  it('quien escribe «perone» encuentra el peroné, primero', () => {
    expect(nombres('perone')[0]).toBe('Right fibula')
    expect(nombres('PERONÉ')[0]).toBe('Right fibula')
  })

  it('quien escribe «fibula» encuentra la misma pieza', () => {
    expect(nombres('fibula')).toContain('Right fibula')
    expect(nombres('fibula')[0]).toBe('Right fibula')
  })

  it('pone la tibia antes que la arteria que la nombra', () => {
    expect(nombres('tibia')[0]).toBe('Right tibia')
    expect(nombres('tibia derecha')[0]).toBe('Right tibia')
  })

  it('encuentra lo traducido por su nombre en español', () => {
    expect(nombres('arteria tibial')).toEqual(['Right anterior tibial artery'])
    expect(nombres('cintilla')).toEqual(['Right iliotibial tract'])
    expect(nombres('iliotibial')).toEqual(['Right iliotibial tract'])
  })

  it('encuentra también lo que no tiene traducción, buscando en español', () => {
    // Es lo que no puede romperse: una estructura sin traducción se enseña en
    // inglés y se sigue encontrando escribiendo en español. Antes se probaba
    // con la arteria tibial, que ya tiene nombre en español y encontraba por
    // él; con la inventada, lo único que la encuentra con «arteria» es la
    // equivalencia de `buscarPiezas`, que es lo que hay que vigilar.
    expect(tieneTraduccion(SIN_TRADUCCION)).toBe(false)
    const conUnaSinTraducir = {
      ...catalogo,
      piezas: [...catalogo.piezas, pieza('p7', SIN_TRADUCCION, 'muscular')],
    }
    const halladas = (consulta: string) =>
      buscarEnEspanol(conUnaSinTraducir, consulta).piezas.map((p) => p.nombre)
    expect(casaConLaBusqueda(SIN_TRADUCCION, 'arteria hypothetical')).toBe(false)
    expect(halladas('arteria hypothetical')).toEqual([SIN_TRADUCCION])
    expect(halladas('hypothetical')).toEqual([SIN_TRADUCCION])
  })

  it('no exige el orden de las palabras', () => {
    expect(nombres('derecha tibia')).toContain('Right tibia')
    // Con palabras que las equivalencias no conocen, para que la única vía
    // sea `casaConLaBusqueda`: con «tibia» y «derecha» también encontraba
    // `buscarPiezas` traduciendo, y la prueba no distinguía nada.
    expect(nombres('corto peroneo')).toEqual(['Right fibularis brevis'])
    expect(nombres('tract iliotibial')).toEqual(['Right iliotibial tract'])
  })

  it('dice cuántas hay aunque pinte menos', () => {
    // Las cinco piezas «Right…»: dos se pintan y el total dice cinco.
    const { piezas, total } = buscarEnEspanol(catalogo, 'right', 2)
    expect(piezas).toHaveLength(2)
    expect(total).toBe(5)
  })

  it('una consulta vacía o sin coincidencias no devuelve nada', () => {
    expect(buscarEnEspanol(catalogo, '   ')).toEqual({ piezas: [], total: 0 })
    expect(buscarEnEspanol(catalogo, 'branquia')).toEqual({ piezas: [], total: 0 })
  })
})

describe('casaConLaBusqueda, con la tabla revisada', () => {
  // La comparten el árbol —dentro de `buscarEnEspanol`— y el panel de exportar
  // del taller. Antes buscaba la frase entera de corrido: «tibia derecha»
  // encontraba y «derecha tibia» no.
  it('casa por palabras en cualquier orden, en español', () => {
    expect(casaConLaBusqueda('Right tibia', 'tibia derecha')).toBe(true)
    expect(casaConLaBusqueda('Right tibia', 'derecha tibia')).toBe(true)
    expect(casaConLaBusqueda('Right fibularis brevis', 'derecho peroneo')).toBe(true)
  })

  it('y en el original', () => {
    expect(casaConLaBusqueda('Right tibia', 'tibia right')).toBe(true)
    expect(casaConLaBusqueda('Right fibularis brevis', 'brevis right fibularis')).toBe(true)
  })

  it('sin tildes ni mayúsculas, en la consulta y en el nombre', () => {
    expect(casaConLaBusqueda('Right fibula', 'DERECHO perone')).toBe(true)
    expect(casaConLaBusqueda('Left patella', 'Izquierda RÓTULA')).toBe(true)
    expect(casaConLaBusqueda('Left femur', 'fémur')).toBe(true)
  })

  it('exige todas las palabras', () => {
    expect(casaConLaBusqueda('Right tibia', 'tibia izquierda')).toBe(false)
    expect(casaConLaBusqueda('Right tibia', 'right tibia left')).toBe(false)
  })
})

// ---------------------------------------------------------------- cableado

describe('quien tenía que llamar a todo esto lo llama', () => {
  const arbol = leer('src', 'components', 'atlas', 'ArbolAnatomico.tsx')

  it('el árbol ordena y busca en español', () => {
    expect(arbol).toContain('ordenarArbolEnEspanol(armarArbol(catalogo, eje))')
    expect(arbol).toContain('buscarEnEspanol(catalogo, consulta)')
    // La búsqueda de antes, solo por el original, no vuelve por la puerta de atrás.
    expect(arbol).not.toMatch(/\bbuscarPiezas\(/)
  })

  it('el árbol y el panel de exportar buscan con la misma función', () => {
    // Una comparación propia en cualquiera de los dos es lo que haría que uno
    // encontrara lo que el otro no. El árbol llega a ella por `buscarEnEspanol`.
    const buscar = leer('src', 'atlas', 'arbolEnEspanol.ts')
    expect(buscar).toContain("import { casaConLaBusqueda, nombreEnEspanol } from './nombres'")
    expect(buscar).toContain('casaConLaBusqueda(pieza.nombre, consulta)')
    const taller = leer('src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx')
    expect(taller).toContain('casaConLaBusqueda(p.nombre, filtroProtagonista)')
  })

  it('cada fila enseña el nombre en español con el original en el título', () => {
    expect(arbol).toContain('{nombreEnEspanol(pieza.nombre)}')
    expect(arbol).toContain('title={`${pieza.nombre} · ${pieza.fma}`}')
    // El nombre original pintado como texto de la fila es la forma antigua.
    expect(arbol).not.toContain('>{pieza.nombre}<')
  })

  it('el cargador corrige el catálogo antes de devolverlo', () => {
    expect(leer('src', 'atlas', 'cargador.ts')).toContain(
      'return corregirCatalogo((await respuesta.json()) as CatalogoDelAtlas)',
    )
  })

  /** Todos los `.ts` y `.tsx` de `src/`. */
  function fuentes(carpeta: string): string[] {
    return readdirSync(carpeta).flatMap((nombre) => {
      const camino = join(carpeta, nombre)
      if (statSync(camino).isDirectory()) return fuentes(camino)
      return /\.tsx?$/.test(nombre) ? [camino] : []
    })
  }

  it('todo el que lee catalogo.json lo pasa por corregirCatalogo', () => {
    // `clasificacion.ts` lo pide para TODOS los lectores: el navegador, que
    // agrupa al montar la escena, y el servidor, que exporta. Si solo lo hiciera
    // uno, el taller pintaría el peroneo como músculo y el archivo exportado lo
    // seguiría metiendo en el esqueleto. Se buscan lecturas —un `fetch` o un
    // `readFile` que nombre el archivo—, no menciones: el aviso de «falta
    // catalogo.json» de la página de sistema no lee nada.
    const lectores = fuentes(join(RAIZ, 'src'))
      .map((camino) => ({ camino, codigo: readFileSync(camino, 'utf8') }))
      .filter(({ codigo }) =>
        /\b(?:fetch|readFile|readFileSync)\((?:(?!\n\s*\n)[\s\S])*?catalogo\.json/.test(codigo),
      )

    // El cargador tiene que estar entre los que se encuentran, o el patrón ha
    // dejado de ver lecturas y la prueba pasaría sin mirar nada.
    const encontrados = lectores.map(({ camino }) => relative(RAIZ, camino).replace(/\\/g, '/'))
    expect(encontrados).toContain('src/atlas/cargador.ts')

    const sinCorregir = lectores
      .filter(({ codigo }) => !codigo.includes('corregirCatalogo('))
      .map(({ camino }) => relative(RAIZ, camino).replace(/\\/g, '/'))
    expect(sinCorregir, 'leen catalogo.json sin pasar por corregirCatalogo').toEqual([])
  })
})

// -------------------------------------------------------------- atribución

describe('la atribución declara lo que se cambió', () => {
  const atribucion = leer('public', 'atlas', 'ATRIBUCION.md')
  const NOMBRE_DEL_SISTEMA: Record<string, string> = {
    muscular: 'músculos',
    connective: 'tejido conectivo',
  }

  it('ya no dice que los nombres se conservan en su forma original', () => {
    // CC BY 4.0 obliga a declarar las modificaciones. Esa frase era verdad hasta
    // que el árbol empezó a enseñar los nombres en español.
    expect(atribucion).not.toContain('se conservan en su forma original')
    expect(atribucion).toContain('traducidos al español, para enseñarlos, los nombres de las')
  })

  it('quien lo regenera lo escribe con la plantilla única, y no con una suya', () => {
    // `preparar.mjs` tenía su propia plantilla, que seguía diciendo que los
    // nombres «se conservan en su forma original»: regenerar el atlas habría
    // vuelto a hacer mentir la declaración de cambios que exige CC BY 4.0. La
    // plantilla vive ahora solo en `atribucion.mjs`, que se puede importar sin
    // preparar nada y que `plantillaDeAtribucion.test.ts` compara con el archivo
    // escrito. Aquí se vigila la otra punta: que el guion la llame.
    const preparar = leer('scripts', 'atlas', 'preparar.mjs')
    expect(preparar).toMatch(/import \{[^}]*\batribucion\b[^}]*\} from '\.\/atribucion\.mjs'/)
    expect(preparar).toContain("writeFileSync(join(DESTINO, 'ATRIBUCION.md'), atribucion(catalogo), 'utf8')")
    expect(preparar).not.toMatch(/function atribucion\(/)
    expect(preparar).not.toMatch(/function resumenDeRegiones\(/)
    expect(preparar).not.toContain('se conservan en su forma original')
    expect(preparar).not.toContain('# Atribución del atlas anatómico')
  })

  it('nombra cada corrección de sistema con su destino', () => {
    // Esto mira el archivo escrito. Que la plantilla que lo reescribe al
    // regenerar diga lo mismo lo vigila `plantillaDeAtribucion.test.ts`: aquí
    // no se vería, porque el archivo puede estar bien y la plantilla no.
    //
    // El nombre en español entre paréntesis es opcional: sale de la tabla de
    // traducciones, y una corrección cuya estructura aún no tiene traducción se
    // declara igual, con el original solo.
    const plano = atribucion.replace(/\n\s*/g, ' ')
    for (const [nombre, sistema] of Object.entries(CORRECCIONES_DE_SISTEMA)) {
      const destino = NOMBRE_DEL_SISTEMA[sistema]
      expect(destino, `falta cómo se llama «${sistema}» en esta prueba`).toBeDefined()
      expect(plano).toMatch(new RegExp(`- ${nombre}(?: \\([^)]*\\))?: de esqueleto a ${destino}[;.]`))
    }
  })

  it('la página de créditos lo pinta con cada punto de la lista entero', async () => {
    // El archivo va cortado a ochenta columnas. La página pintaba línea a línea,
    // y un punto de dos líneas salía partido en un `<li>` y un `<p>` suelto.
    const { default: PaginaCreditos } = await import('@/app/(frontend)/creditos/page')
    const html = renderToStaticMarkup(await PaginaCreditos())

    expect(html).toContain(
      '<li>traducidos al español, para enseñarlos, los nombres de las estructuras. La traducción no sustituye al original:',
    )
    // Con el paréntesis opcional: al regenerar, el nombre en español sale de la
    // tabla y puede no ser «cintilla iliotibial derecha». Lo que se prueba es
    // que el punto, de dos líneas en el archivo, llega entero a su `<li>`.
    expect(html).toMatch(
      /<li>Right iliotibial tract(?: \([^)]*\))?: de esqueleto a tejido conectivo;<\/li>/,
    )
    expect(html).toContain(
      'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International</blockquote>',
    )
    expect(html).not.toContain('se conservan en su forma original')
    // Ningún `<li>` suelto fuera de su lista.
    expect(html).not.toMatch(/(?<!<ul>|<\/li>)<li>/)
  })
})
