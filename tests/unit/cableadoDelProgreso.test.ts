import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Que el puntaje y las complicaciones recorran el camino entero.
 *
 * Este repositorio ya escribió una vez la mitad de esto: las tres columnas de
 * `actividad` se declararon, se migraron y se probaron, y no había quien las
 * escribiera ni quien las leyera. Una función escrita y no llamada no rompe
 * nada —compila, pasa sus pruebas y no aparece en ninguna pantalla—, así que la
 * única forma de que eso no vuelva a pasar es sostener los enganches, que es lo
 * que hace este archivo.
 *
 * Son siete archivos que no se importan entre sí de forma comprobable: dos
 * componentes de cliente —la consola y `CasoConSuLectura`, el envoltorio por el
 * que la página la monta desde que terminar el caso lo marca como leído—, tres
 * componentes de servidor y dos módulos de consultas (`datos.ts` del panel y
 * `src/lib/lecturas.ts`, que trae la fila). Ninguno se puede ejecutar en esta
 * suite —no hay jsdom ni base de datos—, así que se miran en el disco y siempre
 * por la consecuencia: que el dato salga, que vuelva y que alguien lo enseñe.
 *
 * El envoltorio es un eslabón más de la cadena y el más fácil de romper sin que
 * se note: la consola declara `recorridoGuardado` opcional, así que un
 * envoltorio que se lo deje fuera compila, y la página sigue pasándoselo a él.
 */

const RAIZ = process.cwd()

/**
 * El archivo sin comentarios.
 *
 * Imprescindible aquí: los comentarios de estos siete archivos nombran a
 * propósito lo que cablean —«`documentoId` es lo que le da a la consola dónde
 * escribir»— y sin quitarlos estas comprobaciones casarían contra su propia
 * explicación en vez de contra el código. Es el mismo recorte que hace
 * `estadisticasDelPanel.test.ts`.
 */
const codigoDe = (...partes: string[]): string =>
  readFileSync(join(RAIZ, ...partes), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\}/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const CONSOLA = codigoDe('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
const ENVOLTORIO = codigoDe('src', 'components', 'simulador', 'CasoConSuLectura.tsx')
const PAGINA_DEL_CASO = codigoDe('src', 'app', '(frontend)', 'simulador', '[id]', 'page.tsx')
const LECTURAS = codigoDe('src', 'lib', 'lecturas.ts')
const PORTADA = codigoDe('src', 'app', '(frontend)', 'page.tsx')
const DATOS = codigoDe('src', 'app', '(frontend)', 'admin-panel', 'datos.ts')
const PANEL_ACTIVIDAD = codigoDe('src', 'app', '(frontend)', 'admin-panel', 'actividad', 'page.tsx')

/** Cuántas veces aparece un trozo de texto. */
const veces = (codigo: string, trozo: string): number => codigo.split(trozo).length - 1

/**
 * Las propiedades que lleva una etiqueta: el trozo desde `<Etiqueta` hasta su
 * `/>`.
 *
 * Mirar el archivo entero no basta, y ya dejó pasar un fallo: `documentoId={id}`
 * lo lleva también `<FormularioComentario>` en la misma página, así que la
 * comprobación casaba aunque la consola no recibiera nada. Lanza si la etiqueta
 * no está o no se cierra, para que un trozo vacío no se lea como «no lleva esa
 * propiedad» en una prueba que la exige.
 */
const propiedadesDe = (codigo: string, etiqueta: string): string => {
  const inicio = codigo.indexOf(`<${etiqueta}`)
  if (inicio === -1) throw new Error(`no se encontró <${etiqueta}`)
  const fin = codigo.indexOf('/>', inicio)
  if (fin === -1) throw new Error(`<${etiqueta} no se cierra con />`)
  // Una sola aparición: con dos, el trozo sería el de la primera y la segunda
  // podría montarse sin nada sin que esta suite lo viera.
  if (codigo.indexOf(`<${etiqueta}`, inicio + 1) !== -1) {
    throw new Error(`<${etiqueta} aparece más de una vez`)
  }
  return codigo.slice(inicio, fin)
}

describe('la consola manda lo que calcula', () => {
  it('llama a la acción que escribe en actividad', () => {
    expect(CONSOLA).toContain('registrarResultadoDeCirugia')
    expect(CONSOLA).toMatch(/from '@\/app\/\(frontend\)\/acciones\/actividad'/)
  })

  it('la acción se invoca desde un solo sitio, el que ordena las escrituras', () => {
    // Una fila por usuario y ficha, y dos gestos seguidos son dos llamadas que
    // viajan por HTTP sin orden garantizado: la del paso 3 podía aterrizar
    // después de la del paso 4 y dejar guardado el puntaje de antes. Llamar a
    // la acción desde otro sitio salta esa cola.
    expect(veces(CONSOLA, 'registrarResultadoDeCirugia(')).toBe(1)
  })

  it('guarda en los dos hitos: el paso superado y la complicación', () => {
    // Ni en cada gesto —eso es una escritura por clic, y pulsar sin instrumento
    // no cambia nada que guardar— ni solo al terminar, que pierde entero al que
    // cierra la pestaña a mitad. Dos llamadas, ni una más ni una menos.
    const aplicar = CONSOLA.slice(
      CONSOLA.indexOf('function aplicarPaso()'),
      CONSOLA.indexOf('function reiniciar()'),
    )
    expect(aplicar, 'no se encontró aplicarPaso').not.toBe('')
    expect(veces(aplicar, 'guardarRecorrido(')).toBe(2)
    expect(veces(CONSOLA, 'guardarRecorrido(')).toBe(2)
  })

  it('la complicación se guarda con lo que dijo el motor, no con un texto nuevo', () => {
    // El desenlace es el que la columna acepta (`RESULTADOS`) y el detalle es
    // el mensaje entero, que es lo único que dice *cuánto* se pasó. Componer
    // aquí otra frase dejaría en la base algo que el residente nunca leyó.
    const aplicar = CONSOLA.slice(
      CONSOLA.indexOf('function aplicarPaso()'),
      CONSOLA.indexOf('function reiniciar()'),
    )
    expect(aplicar).toContain('resultado: evaluacion.resultado')
    expect(aplicar).toContain('detalle: evaluacion.mensaje')
    expect(aplicar).toContain('paso: paso.id')
  })

  it('el recorrido en curso arranca vacío aunque haya uno guardado', () => {
    // Sembrar la lista con lo guardado la mandaría de vuelta al servidor
    // mezclada con lo de ahora: cada visita duplicaría las complicaciones.
    expect(CONSOLA).toContain('useState<ComplicacionDelCaso[]>([])')
  })

  it('la consola recibe la ficha donde escribir y no se la inventa', () => {
    expect(CONSOLA).toContain('documentoId: string')
    expect(CONSOLA).toContain('registrarResultadoDeCirugia(documentoId')
  })

  it('enseña el recorrido anterior en vez de sumarlo al marcador', () => {
    // Lo guardado es un estado —el último recorrido— y no un punto de guardado:
    // no se sabe qué pasos estaban resueltos. Sumarlo al marcador y dejar
    // repetir el caso cobraría los mismos pasos dos veces y el número subiría
    // solo con recargar.
    expect(CONSOLA).toContain('Su recorrido anterior')
    expect(CONSOLA).toContain('recorridoGuardado.complicaciones.map(')
    expect(CONSOLA).not.toContain('setPuntaje(recorridoGuardado')
  })
})

describe('la consola sigue siendo compilable', () => {
  /**
   * Esta suite lee el .tsx como texto —es un componente de cliente y aquí no
   * hay jsdom que lo monte—, así que un nombre declarado dos veces en el
   * ámbito del componente salía en verde de la suite entera. Y no es un roce
   * de estilo: `tsc` da TS2451 en las dos declaraciones y Turbopack se niega a
   * compilar el archivo, o sea que el árbol no se puede desplegar. Pasó con el
   * estado `complicaciones` —la lista que se guarda— y una cuenta derivada que
   * se llamaba igual; el sitio donde eso duele es `aplicarPaso`, donde
   * `[...complicaciones, nueva]` intentaría desplegar un número.
   *
   * La comprobación no sustituye a `npm run typecheck`, que es la puerta de
   * verdad. Está aquí porque la que hay que pasar sí o sí es esta.
   */
  it('ningún nombre del ámbito del componente se declara dos veces', () => {
    const desde = CONSOLA.indexOf('export function ConsolaQuirurgica(')
    expect(desde, 'no se encontró el componente').toBeGreaterThan(-1)
    const cuerpo = CONSOLA.slice(desde)
    // Lo que declara el componente es lo que queda a dos espacios: lo de fuera
    // no lleva sangría y lo de sus funciones internas lleva cuatro o más.
    const nombres = [...cuerpo.matchAll(/^ {2}(?:const|let|function) \[?([A-Za-z0-9_]+)/gm)].map(
      (coincidencia) => coincidencia[1],
    )
    expect(nombres.length, 'no se leyó ninguna declaración').toBeGreaterThan(10)
    const repetidos = [...new Set(nombres.filter((n, i) => nombres.indexOf(n) !== i))]
    expect(repetidos, `declarados dos veces: ${repetidos.join(', ')}`).toEqual([])
  })

  it('la cuenta de pasos con complicación no se llama como la lista que se guarda', () => {
    // Son dos cosas distintas: la lista tiene una fila por gesto que dañó y
    // viaja al servidor; la cuenta es el tamaño de un conjunto de pasos y solo
    // se escribe en el resumen de pantalla.
    expect(CONSOLA).toContain('const pasosConComplicacion = complicados.size')
    expect(CONSOLA).toContain('useState<ComplicacionDelCaso[]>([])')
  })
})

describe('la página del caso le da a la consola lo que ella no puede pedir', () => {
  it('pasa la ficha y el recorrido guardado, y el envoltorio se los entrega a la consola', () => {
    // La consola corre en el navegador: ni sabe en qué fila está ni puede
    // consultarla. Sin estas dos propiedades, lo que calcula vuelve a morir con
    // la pestaña.
    //
    // Se mira cada eslabón en su etiqueta. La página no monta la consola: se lo
    // da todo a `<CasoConSuLectura>`, y es él quien lo reparte. Comprobar solo
    // la página dejaba en verde un envoltorio que montaba la consola con
    // `documentoId=""` y `recorridoGuardado={null}` —sin dónde escribir el
    // recorrido ni la marca, y sin «Su recorrido anterior»—, que es exactamente
    // lo que este archivo existe para impedir.
    const enLaPagina = propiedadesDe(PAGINA_DEL_CASO, 'CasoConSuLectura')
    expect(enLaPagina).toContain('caso={caso}')
    expect(enLaPagina).toContain('documentoId={id}')
    expect(enLaPagina).toContain('recorridoGuardado={recorridoGuardado(registroDeLectura)}')
    expect(PAGINA_DEL_CASO).toContain("from '@/lib/progresoDelSimulador'")

    // Y en el envoltorio, lo que recibió y no otra cosa. `recorridoGuardado` es
    // opcional en la consola, así que olvidarlo aquí compila: solo esta
    // comprobación lo delata.
    const enElEnvoltorio = propiedadesDe(ENVOLTORIO, 'ConsolaQuirurgica')
    expect(enElEnvoltorio).toContain('caso={caso}')
    expect(enElEnvoltorio).toContain('documentoId={documentoId}')
    expect(enElEnvoltorio).toContain('recorridoGuardado={recorridoGuardado}')
    expect(ENVOLTORIO).toMatch(/import \{ ConsolaQuirurgica\b[^}]*\} from '\.\/ConsolaQuirurgica'/)
  })

  it('sale de la fila que ya se consultaba, y no de una consulta nueva', () => {
    // Los tres campos viven en la misma fila que dice si la ficha está leída.
    // Antes esa fila la pedía la página con su propio `collection: 'actividad'`,
    // y aquí se contaba que hubiera uno. Desde que la pregunta vive en
    // `src/lib/lecturas.ts` la página no consulta nada más que el caso: un
    // `.find(` que reaparezca es una segunda consulta a la misma fila, o una
    // copia de la de lecturas con su propio criterio para las gemelas.
    expect(veces(PAGINA_DEL_CASO, '.find(')).toBe(0)
    expect(veces(PAGINA_DEL_CASO, '.findByID(')).toBe(1)

    // La casilla y el recorrido salen del mismo objeto, que es el de la única
    // llamada. Con dos llamadas cada uno podría estar leyendo una fila distinta
    // de las gemelas, y la prueba de `lecturasCableadas.test.ts` que cuenta
    // llamadas no distingue de qué variable sale cada cosa.
    const llamada = /const (\w+) = await lecturasDelResidente\(payload, usuarioEfectivo, 'cirugias', \[id\]\)/.exec(
      PAGINA_DEL_CASO,
    )
    expect(llamada, 'la página del caso no guarda la respuesta de lecturasDelResidente').not.toBeNull()
    const lecturas = llamada![1]
    expect(PAGINA_DEL_CASO).toContain(`const registroDeLectura = ${lecturas}.registro(id)`)
    expect(PAGINA_DEL_CASO).toContain(`completadoInicial={${lecturas}.leida(id)}`)
  })

  it('la fila llega entera: sin un `select` que se deje fuera el recorrido', () => {
    // `recorridoGuardado` lee `puntaje`, `puntajeMaximo` y `complicaciones` de
    // la fila que devuelve `lecturas.registro`. Aligerar la consulta con un
    // `select` de lo que necesita la casilla —`documentoId` y `completado`—
    // parece inocuo y es justo lo que la rompe: la casilla sigue bien, el
    // recorrido anterior deja de salir y no falla nada, porque un campo ausente
    // se lee igual que un caso nunca jugado.
    expect(LECTURAS).toContain("collection: 'actividad'")
    expect(LECTURAS).not.toMatch(/\bselect:/)
  })
})

describe('la portada enseña el registro que promete', () => {
  it('la tarjeta del simulador sigue prometiendo el registro de complicaciones', () => {
    // Si esta frase se va, la sección de abajo pierde su motivo; y si se queda
    // sin la sección, la portada vuelve a prometer algo que no existe.
    expect(PORTADA).toContain('registro de complicaciones')
  })

  it('pide los casos que el residente jugó de verdad', () => {
    expect(PORTADA).toContain("{ coleccion: { equals: 'cirugias' } }")
    expect(PORTADA).toContain('{ puntaje: { exists: true } }')
  })

  it('resuelve el nombre del caso con el acceso puesto', () => {
    // La fila la pudo crear `POST /api/actividad` con el identificador que
    // quisiera: sin esto la sección sería un listador de títulos de borradores.
    const bloque = PORTADA.slice(
      PORTADA.indexOf("if (coleccionesVisibles.includes('cirugias'))"),
      PORTADA.indexOf('const nombre = String(usuario?.nombre'),
    )
    expect(bloque, 'no se encontró el bloque del simulador').not.toBe('')
    expect(bloque).toContain('overrideAccess: false')
    expect(bloque).toContain('user: usuarioEfectivo as never')
  })

  it('lo pinta, que es la mitad que faltaba', () => {
    expect(PORTADA).toContain('recorridos.map(')
    expect(PORTADA).toContain('complicaciones')
  })

  it('no lo presenta como una nota', () => {
    // El puntaje lo calcula el navegador y el servidor no puede recalcularlo.
    expect(PORTADA).toContain('No son una calificación')
  })
})

describe('el panel ve en qué se atasca su gente', () => {
  it('el resumen de actividad cuenta también los recorridos', () => {
    expect(DATOS).toContain('resumirRecorridos')
    expect(DATOS).toContain('simulador: await actividadDelSimulador(payload)')
  })

  it('los recorridos traen su propio «no se pudo leer»', () => {
    // Compartiendo bandera con la lectura, una avería al contar partidas
    // pondría «—» en cifras que sí se leyeron. Y un cero aquí se lee como
    // «nadie usa el simulador», que es una conclusión sobre los residentes.
    const bloque = DATOS.slice(DATOS.indexOf('async function actividadDelSimulador'))
    expect(bloque).toContain('ilegible: true')
    expect(bloque).toContain('console.error')
  })

  it('la pantalla de actividad lo pide y lo pinta', () => {
    expect(PANEL_ACTIVIDAD).toContain('resumenDeActividad(payload)')
    expect(PANEL_ACTIVIDAD).toContain('atascos.map(')
    expect(PANEL_ACTIVIDAD).toContain('simulador.ilegible')
  })

  it('nombra el caso y el paso, no dos identificadores', () => {
    // El identificador del paso deja de encontrar nada en cuanto el
    // traumatólogo reordena el guion: el número y el título guardados son lo
    // único que lo nombra entonces.
    expect(PANEL_ACTIVIDAD).toContain('atasco.titulo')
    expect(PANEL_ACTIVIDAD).toContain('atasco.numero')
    expect(PANEL_ACTIVIDAD).toContain("claveDeFicha('cirugias', atasco.documentoId)")
  })

  it('dice, antes de la primera cifra, que el puntaje no es una calificación', () => {
    const aviso = PANEL_ACTIVIDAD.indexOf('El puntaje no es una calificación')
    expect(aviso).toBeGreaterThan(-1)
    expect(aviso).toBeLessThan(PANEL_ACTIVIDAD.indexOf('atascos.map('))
  })
})
