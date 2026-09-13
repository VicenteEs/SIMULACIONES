import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rutaPublica } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Que el examen físico registre lectura, y que la cifra «por leer» pueda bajar.
 *
 * De este módulo no se anotaba nada: es el único sin página por documento, y el
 * `RastreadorActividad` —que anota la visita y pinta la casilla de «leída»— se
 * monta en la página de cada ficha. Sus maniobras contaban en `totalFichas` de
 * la portada y nunca en `leidas`, así que la resta tenía un suelo igual al
 * número de maniobras publicadas y no llegaba a cero por mucho que se leyera.
 *
 * La decisión fue marcar desde el listado, una casilla por maniobra, en vez de
 * inventar una ficha por maniobra que nadie pidió. Eso deja tres cosas que
 * sostener, y las tres son invisibles en pantalla:
 *
 *   - Las casillas se pintan con UNA consulta para todas. Con una por tarjeta
 *     la página sigue saliendo igual, solo que con treinta viajes a PostgreSQL.
 *   - Desde el listado no se anota visita. Montar treinta rastreadores son
 *     treinta visitas de golpe, y «Continúa leyendo» de la portada —que ordena
 *     por `ultimaVisita`— se llena de maniobras que nadie miró.
 *   - La portada tiene que saber enlazar una maniobra. No existe
 *     `examen-fisico/[id]/`, así que el `${ruta}/${id}` de antes daba un 404 en
 *     cuanto la sección empezó a poder ofrecer maniobras.
 *
 * Se mira en el disco porque son componentes de servidor y no hay prueba que
 * los ejecute: desconectar cualquiera de las tres compila, se despliega y solo
 * se nota meses después, mirando una cifra perfectamente plausible.
 */

const RAIZ = join(process.cwd(), 'src')
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const LISTADO = fuente('app', '(frontend)', 'examen-fisico', 'page.tsx')
const PORTADA = fuente('app', '(frontend)', 'page.tsx')
const RASTREADOR = fuente('components', 'RastreadorActividad.tsx')
const VISITA = fuente('components', 'VisitaDeManiobraEnlazada.tsx')

/**
 * Las propiedades del `<RastreadorActividad>`, y solo las suyas.
 *
 * Igual que en `rastreadorActividad.test.ts`, y por el mismo motivo: buscar
 * `coleccion="…"` en la fuente entera daría por bueno el atributo del
 * `<FormularioComentario>`, que está en la misma tarjeta y lleva el mismo
 * nombre.
 */
function propiedadesDelRastreador(codigo: string): string {
  const inicio = codigo.indexOf('<RastreadorActividad')
  if (inicio === -1) return ''
  return codigo.slice(inicio, codigo.indexOf('/>', inicio))
}

/**
 * El archivo sin comentarios, con el mismo recorte que `cableadoDelProgreso`.
 *
 * Hace falta en las comprobaciones que cuentan: la cabecera de este listado
 * explica a propósito la consulta que ya no hace y el `.map` en el que no
 * pregunta, y contando sobre la fuente entera se contaría la explicación.
 */
const sinComentarios = (codigo: string): string =>
  codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\}/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const veces = (codigo: string, trozo: string): number => codigo.split(trozo).length - 1

/**
 * Las propiedades del rastreador de una ficha por documento, esté donde esté.
 *
 * El simulador ya no lo monta en la página: va dentro de `CasoConSuLectura`,
 * junto a la consola que también marca la lectura. Buscar el rastreador solo en
 * la página devolvía un texto vacío para esa ficha, y un texto vacío «no
 * contiene `anotarVisita`»: la comprobación salía verde sin mirar nada.
 */
function rastreadorDeLaFicha(carpeta: string): string {
  const pagina = fuente('app', '(frontend)', carpeta, '[id]', 'page.tsx')
  if (pagina.includes('<RastreadorActividad')) return propiedadesDelRastreador(pagina)
  if (pagina.includes('<CasoConSuLectura')) {
    return propiedadesDelRastreador(fuente('components', 'simulador', 'CasoConSuLectura.tsx'))
  }
  return ''
}

describe('el listado marca la lectura maniobra a maniobra', () => {
  it('monta el rastreador sobre «maniobras», dentro de la tarjeta', () => {
    const propiedades = propiedadesDelRastreador(LISTADO)
    expect(propiedades, 'el listado no monta ningún rastreador').not.toBe('')
    expect(propiedades).toContain('coleccion="maniobras"')
    expect(propiedades).toContain('documentoId={String(m.id)}')
  })

  it('pregunta qué está ya leído antes de pintar las casillas', () => {
    // El rastreador es de cliente y nace con `completadoInicial`: sin la
    // consulta previa las treinta casillas salen en blanco en cada carga y el
    // residente vuelve a marcar lo que ya tenía marcado.
    //
    // La consulta ya no está en esta página sino en `src/lib/lecturas.ts`, así
    // que lo que se sostiene es el hilo entero: la respuesta se espera antes
    // del JSX y es la que llega a la casilla de cada maniobra, preguntada por
    // la misma maniobra que la casilla escribe.
    const codigo = sinComentarios(LISTADO)
    const llamada = /const (\w+) = await lecturasDelResidente\(/.exec(codigo)
    expect(llamada, 'el listado no espera la respuesta de lecturasDelResidente').not.toBeNull()
    const pintar = codigo.indexOf('return (')
    expect(pintar).toBeGreaterThan(-1)
    expect(llamada!.index).toBeLessThan(pintar)

    const propiedades = propiedadesDelRastreador(LISTADO)
    expect(propiedades).toContain(`completadoInicial={${llamada![1]}.leida(m.id)}`)
    expect(propiedades).toContain('documentoId={String(m.id)}')
  })

  it('lo pregunta en una sola consulta, no en una por tarjeta', () => {
    // La consulta por ficha de los otros cuatro módulos, copiada aquí dentro
    // del `.map`, funcionaría: son treinta consultas idénticas para pintar
    // treinta casillas, y no hay pantalla en la que eso se note.
    //
    // Que la función haga UNA consulta para toda la lista lo prueba
    // `lecturas.test.ts`, y que el listado la llame una vez y antes de
    // `grupos.map(`, `lecturasCableadas.test.ts`. Lo que queda por cerrar es
    // la otra puerta: que el listado no vuelva a viajar a la base por su
    // cuenta. Sus dos consultas son las maniobras y los segmentos; una tercera
    // es una copia de la de lecturas o una consulta por tarjeta.
    const codigo = sinComentarios(LISTADO)
    expect(veces(codigo, 'payload.find(')).toBe(2)
    expect(codigo).toContain("collection: 'maniobras'")
    expect(codigo).toContain("collection: 'segmentos'")
    expect(codigo).not.toContain("collection: 'actividad'")

    // Y lo que se pinta no espera nada: un `await` o un `payload.` dentro del
    // JSX es un viaje a PostgreSQL por cada tarjeta que lo recorre.
    const jsx = codigo.slice(codigo.indexOf('return ('))
    expect(jsx).toContain('grupos.map(')
    expect(jsx).not.toMatch(/\bawait\b/)
    expect(jsx).not.toContain('payload.')
    expect(jsx).not.toContain('lecturasDelResidente(')
  })

  it('pinta los grupos que arma src/lib/maniobras.ts y no un filtro propio', () => {
    // La función agrupadora está probada aparte (`maniobras.test.ts`), y eso no
    // sirve de nada si la página sigue recorriendo los segmentos por su cuenta:
    // volvería a dejarse fuera —sin pintar, sin marcar y contando en el
    // total— a la maniobra cuyo segmento se borró o nunca se puso.
    expect(LISTADO).toContain('agruparManiobrasPorSegmento(maniobras.docs, segmentos.docs)')
    expect(LISTADO).toContain('{grupos.map(')
    expect(LISTADO).not.toMatch(/segmentos\.docs\.map\(/)
  })

  it('pregunta por las mismas maniobras que trajo el tope, ni una menos', () => {
    // Un tope más bajo en la consulta de `actividad` deja maniobras leídas con
    // la casilla en blanco, y no falla nada al hacerlo.
    //
    // Antes eso se cerraba contando dos `limit: TOPE_DE_MANIOBRAS` en esta
    // página, uno por consulta. Ahora la de lectura no lleva tope —lo acota su
    // `in:`, y `lecturas.test.ts` comprueba que no hay `limit`—, así que el
    // mismo tope se sostiene de otra forma: la lista por la que se pregunta es
    // exactamente la que salió de la consulta con tope, sin filtrar ni
    // recortar, y es la misma de la que salen las tarjetas. Una maniobra que se
    // pinta es una maniobra por la que se preguntó.
    const codigo = sinComentarios(LISTADO)
    const topes = [...codigo.matchAll(/limit: (\w+)/g)].map((c) => c[1])
    expect(topes.filter((t) => t === 'TOPE_DE_MANIOBRAS')).toHaveLength(1)
    expect(codigo).toMatch(/collection: 'maniobras'[^)]*limit: TOPE_DE_MANIOBRAS/)

    expect(codigo).toMatch(
      /^\s*const identificadores = maniobras\.docs\.map\(\((\w+)\) => String\(\1\.id\)\)\s*$/m,
    )
    expect(codigo).toMatch(/lecturasDelResidente\([^)]*'maniobras', identificadores\)/)
    expect(codigo).toContain('agruparManiobrasPorSegmento(maniobras.docs, segmentos.docs)')
    // `identificadores` no se vuelve a asignar entre medias.
    expect(veces(codigo, 'identificadores =')).toBe(1)
  })
})

describe('abrir el listado no es visitar todas las maniobras', () => {
  it('el listado monta sus rastreadores sin anotar visita', () => {
    expect(propiedadesDelRastreador(LISTADO)).toContain('anotarVisita={false}')
  })

  it('el rastreador respeta esa propiedad antes de anotar', () => {
    // Aceptar la propiedad y no mirarla es el fallo que más ha costado en este
    // repositorio: algo declarado, probado, y a lo que nadie hace caso.
    const antesDeAnotar = RASTREADOR.slice(
      RASTREADOR.indexOf('useEffect('),
      RASTREADOR.indexOf('registrarVisita('),
    )
    expect(antesDeAnotar).toContain('anotarVisita')
  })

  it('las cuatro fichas siguen anotando su visita al abrirse', () => {
    // La propiedad vale `true` por omisión justo para esto: montar el
    // rastreador en una página por documento sí es haber abierto esa ficha.
    expect(RASTREADOR).toContain('anotarVisita = true')

    for (const carpeta of ['biblioteca', 'tecnica-ao', 'simulador', 'imagenes']) {
      const propiedades = rastreadorDeLaFicha(carpeta)
      expect(propiedades, `no se encontró el rastreador de ${carpeta}`).not.toBe('')
      expect(propiedades, `${carpeta} dejó de anotar la visita`).not.toContain('anotarVisita')
    }
  })

  it('la visita que sí ocurrió —la del enlace— se anota una vez para todo el listado', () => {
    expect(LISTADO).toContain('<VisitaDeManiobraEnlazada identificadores={identificadores} />')
    expect(LISTADO.split('<VisitaDeManiobraEnlazada').length - 1).toBe(1)
    // Y que ese componente anote de verdad: montarlo sin que llame a la acción
    // deja el módulo fuera de «Continúa leyendo» sin que nada lo delate.
    expect(VISITA).toContain(`registrarVisita('maniobras'`)
    expect(VISITA).toContain('identificadores.includes(')
  })

  it('el ancla que se lee es la que compone rutaPublica y declara el listado', () => {
    // Tres archivos que no se importan entre sí se tienen que poner de acuerdo
    // en el mismo prefijo. El que lee las visitas lo saca de `rutaPublica` en
    // vez de escribirlo, para que el día que el examen físico tenga ficha
    // propia no se quede buscando un ancla que ya no manda nadie.
    expect(VISITA).toContain(`rutaPublica('maniobras', '')`)

    const prefijo = `#${rutaPublica('maniobras', '').split('#')[1]}`
    expect(prefijo).toBe('#maniobra-')
    expect(LISTADO).toContain('id={`maniobra-${m.id}`}')
  })
})

describe('la portada cuenta y enlaza lo que el listado ya sabe anotar', () => {
  it('enlaza «Continúa leyendo» por rutaPublica y no pegando ruta e identificador', () => {
    // `/examen-fisico/7` no existe: era el 404 en inglés de Next, sin barra
    // para volver. No se notaba porque de las maniobras no se registraba
    // ninguna lectura y por tanto nunca aparecían en esta sección.
    expect(PORTADA).toMatch(/destino: rutaPublica\(/)
    expect(PORTADA).toContain('href={item.destino}')
    expect(PORTADA).not.toMatch(/\$\{item\.ruta\}\/\$\{item\.id\}/)
  })

  it('sigue contando las maniobras en el total de fichas', () => {
    // Quitar el módulo del total también haría bajar «por leer», y sería la
    // otra forma de mentir: dejaría de contarse contenido que existe.
    expect(PORTADA).toContain(`coleccion: 'maniobras'`)
  })

  it('cuenta lo leído sobre los mismos módulos que suma en el total', () => {
    // Las dos mitades de la resta tienen que hablar del mismo conjunto: con
    // todas las filas del usuario, una cuenta a la que se le retiró un módulo
    // sumaba como leídas fichas que ya no están en el total.
    expect(PORTADA).toContain('coleccion: { in: coleccionesVisibles }')
    expect(PORTADA).toMatch(/const coleccionesVisibles = modulosVisibles\.map/)
  })
})
