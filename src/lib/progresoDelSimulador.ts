/**
 * Lo que el simulador deja escrito de un caso, de ida y de vuelta.
 *
 * Un solo módulo para las dos direcciones porque son la misma forma vista dos
 * veces: lo que la consola manda cuando algo cambia y lo que la fila de
 * `actividad` devuelve cuando el residente vuelve a abrir el caso. Escribir
 * cada lado por su cuenta es justo el error que este repositorio ya cometió con
 * estas tres columnas —se declararon, se migraron, y no había quien las
 * escribiera ni quien las leyera—: dos copias de la misma forma se separan sin
 * romper nada, porque el campo se sigue guardando y quien lo lee simplemente
 * busca otro nombre y no encuentra.
 *
 * No importa Payload ni nada del servidor, y eso es deliberado: de aquí leen la
 * consola —que corre en el navegador—, la página del caso, la portada y el
 * panel. Lo único que sabe de fuera es `RESULTADOS`, la lista de desenlaces del
 * motor, que es la misma de la que `src/collections/Actividad.ts` deriva lo que
 * la columna acepta. Mientras las dos salgan de ahí no pueden discrepar.
 *
 * Lo que **no** se guarda, y conviene saberlo antes de pedirle a esto lo que no
 * tiene: por dónde iba el recorrido. La fila describe un estado —el último
 * recorrido— y no un punto de guardado, así que no hay paso actual ni lista de
 * pasos ya resueltos. Reponer el puntaje dentro del marcador de la consola y
 * dejar que el residente volviera a recorrer los mismos pasos los cobraría dos
 * veces; por eso la consola lo enseña como lo que es, el recorrido anterior, y
 * cuenta el de ahora desde cero.
 */

import { RESULTADOS, type Resultado } from '@/lib/simulador'

/**
 * Cuántas complicaciones caben en un recorrido.
 *
 * Es el `maxRows` de la columna (`src/collections/Actividad.ts`) repetido aquí,
 * y los dos números se mueven juntos. Allí es el suelo de un bucle mal cerrado
 * del navegador, para que no llene la tabla; aquí es el recorte que impide
 * mandar una lista que la base va a rechazar **entera**, y con ella el puntaje
 * del caso. Separados, el síntoma es un residente que termina y no se le guarda
 * nada, sin un error que lo explique.
 */
export const MAXIMO_DE_COMPLICACIONES = 100

/** Un gesto que dañó, tal como se guarda y tal como se lee. */
export interface ComplicacionDelCaso {
  /** Identificador de la fila del guion (`pasos[].id` de la cirugía). */
  paso: string
  /**
   * El número con el que el residente vio el paso.
   *
   * Va al lado del identificador porque el identificador deja de encontrar nada
   * en cuanto el traumatólogo reordena o borra un paso, y entonces esto y el
   * título son lo único que permite nombrar la complicación.
   */
  numero: number | null
  titulo: string | null
  /**
   * El desenlace del motor. `null` solo al leer: la columna lo acepta vacío y
   * una fila escrita a mano puede traer cualquier cosa, que aquí se descarta.
   */
  resultado: Resultado | null
  /** El mensaje exacto que leyó el residente, con sus números. */
  detalle: string | null
}

/** Lo que la consola manda al servidor cuando el recorrido cambia. */
export interface ResultadoDeCirugia {
  puntaje: number
  puntajeMaximo: number
  complicaciones: ComplicacionDelCaso[]
}

/** Lo que vuelve de la base: lo mismo, menos lo que la fila no traiga. */
export interface RecorridoGuardado {
  puntaje: number
  /**
   * Lo que valía el caso cuando se jugó; `null` si la fila no lo trae.
   *
   * Se distingue del cero a propósito: sin denominador se enseña «12 puntos» y
   * no «12 de 0», que es un marcador imposible. Una fila así no la escribe la
   * consola —manda los dos números juntos— pero sí puede existir de un `PATCH`
   * a mano, que es lo que `src/collections/Actividad.ts` reconoce que se acepta.
   */
  puntajeMaximo: number | null
  complicaciones: ComplicacionDelCaso[]
}

/**
 * Los desenlaces que el motor sabe producir, menos el que sale bien.
 *
 * Se derivan de `RESULTADOS` y no se escriben a mano por lo mismo que lo hace
 * la colección: una lista copiada se separa en cuanto aparece un desenlace
 * nuevo, y lo que queda es una complicación que el simulador sabe describir y
 * nadie sabe guardar.
 */
const DESENLACES_CON_DANO: readonly string[] = Object.values(RESULTADOS).filter(
  (resultado) => resultado !== RESULTADOS.CORRECTO,
)

/** ¿Es este el desenlace de un gesto que dañó? `correcto` no lo es, por definición. */
export const esDesenlaceConDano = (valor: unknown): valor is Resultado =>
  typeof valor === 'string' && DESENLACES_CON_DANO.includes(valor)

/**
 * Cómo se nombra cada desenlace fuera de la consola.
 *
 * Dentro del caso el residente lee la frase entera que compone `evaluarGesto`;
 * en una tabla del panel eso no cabe, y el identificador crudo —«trazo-largo»,
 * «fuerza-excesiva»— es el nombre de una constante, no castellano.
 *
 * El tipo es `Record<Resultado, string>` y no un mapa laxo: así, el día que el
 * motor estrene un desenlace, el compilador pide su nombre aquí en vez de
 * dejar la tabla del panel enseñando la constante. Es la misma atadura que
 * `DESENLACES_CON_DANO`, solo que en tiempo de compilación.
 */
export const NOMBRE_DEL_DESENLACE: Record<Resultado, string> = {
  [RESULTADOS.SIN_INSTRUMENTO]: 'Sin instrumento',
  [RESULTADOS.INSTRUMENTO_INCORRECTO]: 'Instrumento incorrecto',
  [RESULTADOS.SIN_TRAZO]: 'Sin incisión',
  [RESULTADOS.TRAZO_CORTO]: 'Incisión corta',
  [RESULTADOS.TRAZO_LARGO]: 'Incisión excesiva',
  [RESULTADOS.REDUCCION_INSUFICIENTE]: 'Reducción insuficiente',
  [RESULTADOS.FUERZA_INSUFICIENTE]: 'Fuerza insuficiente',
  [RESULTADOS.FUERZA_EXCESIVA]: 'Fuerza excesiva',
  [RESULTADOS.CORRECTO]: 'Correcto',
}

const texto = (valor: unknown): string | null =>
  typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null

const entero = (valor: unknown, minimo: number): number | null =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo ? valor : null

const cuenta = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : null

/**
 * Una complicación tal como la devuelve la base.
 *
 * Se descarta la que no nombra su paso, porque sin eso la lista es un montón de
 * frases sueltas y el registro existe justo para poder volver al gesto que
 * dañó. El desenlace ilegible, en cambio, **no** tira la fila: el detalle sigue
 * diciendo qué pasó y se prefiere una complicación sin etiquetar a una que
 * desaparece del historial del residente sin dejar rastro.
 */
function complicacionGuardada(bruta: unknown): ComplicacionDelCaso | null {
  if (!bruta || typeof bruta !== 'object') return null
  const c = bruta as Record<string, unknown>
  const paso = texto(c.paso)
  if (!paso) return null
  return {
    paso,
    numero: entero(c.numero, 1),
    titulo: texto(c.titulo),
    resultado: esDesenlaceConDano(c.resultado) ? c.resultado : null,
    detalle: texto(c.detalle),
  }
}

/**
 * El recorrido que guarda una fila de `actividad`, o `null` si no hay ninguno.
 *
 * `null` y no un objeto a cero: las cuatro colecciones que no son `cirugias`
 * escriben en esta misma tabla y sus filas no traen nada de esto, igual que la
 * cirugía que se abrió y no se llegó a jugar. Devolver `{ puntaje: 0 }` las
 * convertiría a todas en partidas de cero puntos, y el panel contaría casos que
 * nadie recorrió —que es exactamente por lo que la columna no lleva
 * `defaultValue: 0`—.
 */
export function recorridoGuardado(fila: unknown): RecorridoGuardado | null {
  if (!fila || typeof fila !== 'object') return null
  const f = fila as Record<string, unknown>

  const complicaciones = (Array.isArray(f.complicaciones) ? f.complicaciones : [])
    .flatMap((bruta) => {
      const limpia = complicacionGuardada(bruta)
      return limpia ? [limpia] : []
    })
    .slice(0, MAXIMO_DE_COMPLICACIONES)

  const puntaje = cuenta(f.puntaje)
  if (puntaje === null && complicaciones.length === 0) return null

  return { puntaje: puntaje ?? 0, puntajeMaximo: cuenta(f.puntajeMaximo), complicaciones }
}

/** Un paso en el que la gente se queda atascada, con cuánto y a cuántos. */
export interface AtascoDelSimulador {
  /** La cirugía, para poder nombrarla y enlazarla desde el panel. */
  documentoId: string
  paso: string
  numero: number | null
  titulo: string | null
  /** Gestos que dañaron en ese paso, sumando los de todo el mundo. */
  veces: number
  /**
   * A cuántos residentes les pasó.
   *
   * Son filas distintas, y una fila es una persona por ficha: lo garantiza el
   * índice único de `actividad`. Se cuenta aparte de `veces` porque no dicen lo
   * mismo: un paso donde una sola persona insistió seis veces es un tropiezo
   * suyo; uno donde tropezaron seis personas es el guion.
   */
  residentes: number
  /** Los desenlaces vistos ahí, sin repetir y en el orden en que aparecieron. */
  desenlaces: Resultado[]
}

/** Lo que el simulador lleva escrito, mirando muchas filas a la vez. */
export interface ResumenDeRecorridos {
  /** Filas con un recorrido guardado: casos que alguien jugó de verdad. */
  casos: number
  casosConComplicacion: number
  /** Gestos que dañaron, en total. */
  complicaciones: number
  /** Los pasos que más cuestan, de mayor a menor. Quien pinta, recorta. */
  atascos: AtascoDelSimulador[]
}

/**
 * Resume los recorridos de un montón de filas de `actividad`.
 *
 * Recibe las filas crudas —no recorridos ya limpios— porque quien llama tiene
 * dos: el panel, que trae la tabla entera, y la pantalla de actividad, que ya
 * la tenía pedida para otra cosa. Que la limpieza ocurra aquí es lo que impide
 * que cada uno decida por su cuenta qué fila cuenta como caso jugado.
 *
 * Las filas de los otros cuatro módulos se descartan solas: no traen puntaje ni
 * complicaciones, así que `recorridoGuardado` devuelve `null` por ellas. Quien
 * llame puede acotar la consulta a `cirugias` para no traérselas, pero no hace
 * falta para que la cuenta salga bien.
 *
 * El orden de `atascos` es por gestos y luego por personas: lo primero que se
 * quiere ver es dónde se repite el daño. En empate manda el paso que le pasó a
 * más gente, porque ese es del guion y no de nadie.
 */
export function resumirRecorridos(filas: unknown[]): ResumenDeRecorridos {
  const porPaso = new Map<string, AtascoDelSimulador>()
  let casos = 0
  let casosConComplicacion = 0
  let complicaciones = 0

  for (const fila of filas) {
    const recorrido = recorridoGuardado(fila)
    if (!recorrido) continue
    casos += 1
    if (recorrido.complicaciones.length === 0) continue
    casosConComplicacion += 1
    complicaciones += recorrido.complicaciones.length

    const documentoId = texto((fila as Record<string, unknown>).documentoId)
    if (!documentoId) continue

    // Las de esta fila son de la misma persona y del mismo caso, así que el
    // contador de residentes sube una vez por paso y no una por gesto: quien
    // insiste seis veces en el mismo paso sigue siendo una persona.
    const contadas = new Set<string>()
    for (const complicacion of recorrido.complicaciones) {
      const clave = `${documentoId}#${complicacion.paso}`
      const atasco: AtascoDelSimulador = porPaso.get(clave) ?? {
        documentoId,
        paso: complicacion.paso,
        numero: complicacion.numero,
        titulo: complicacion.titulo,
        veces: 0,
        residentes: 0,
        desenlaces: [],
      }
      atasco.veces += 1
      if (!contadas.has(clave)) {
        atasco.residentes += 1
        contadas.add(clave)
      }
      // El número y el título se quedan con el primero que los traiga: son la
      // copia de cómo vio el paso quien lo jugó, y una fila puede no traerlos.
      atasco.numero = atasco.numero ?? complicacion.numero
      atasco.titulo = atasco.titulo ?? complicacion.titulo
      if (complicacion.resultado && !atasco.desenlaces.includes(complicacion.resultado)) {
        atasco.desenlaces.push(complicacion.resultado)
      }
      porPaso.set(clave, atasco)
    }
  }

  const atascos = [...porPaso.values()].sort(
    (a, b) => b.veces - a.veces || b.residentes - a.residentes,
  )

  return { casos, casosConComplicacion, complicaciones, atascos }
}
