'use server'

import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { usuarioDeSesion } from '@/access/payload'
import { puedeVerModulo } from '@/access/reglas'
import {
  ErrorDeValidacion,
  exigirIdentificador,
  exigirSlugDeModulo,
  textoOpcional,
} from '@/lib/validacion'
import {
  MAXIMO_DE_COMPLICACIONES,
  esDesenlaceConDano,
  type ComplicacionDelCaso,
  type ResultadoDeCirugia,
} from '@/lib/progresoDelSimulador'

/**
 * Registro de lo que cada residente ha visitado, marcado como leído y jugado.
 *
 * Las tres acciones públicas —visitar, marcar y guardar el resultado del
 * simulador— hacen lo mismo salvo por los campos que escriben, así que
 * comparten implementación: las dos primeras eran dos copias que ya habían
 * empezado a divergir.
 *
 * Lo que **no** comparten es qué hacer cuando falla, y por eso `anotar` ya no
 * captura nada: lo decide quien llama. La visita es una comodidad y su fallo se
 * sigue tragando, porque no debe estropear la lectura de una ficha. La casilla
 * de «leída», en cambio, tiene un control en pantalla que afirma lo contrario
 * de lo ocurrido: si el fallo no sube, `RastreadorActividad` deja la casilla
 * marcada sobre una escritura que nunca se hizo, el residente cierra la tarde
 * creyendo que quedó guardada y al recargar no hay nada. Con el disco lleno
 * —el escenario de `src/lib/espacioEnDisco.ts`— eso era una tarde entera de
 * lectura perdida sin un solo aviso. El resultado de la cirugía va con la
 * casilla y no con la visita: el residente acaba de recorrer un caso entero y
 * el marcador de la consola le está diciendo que lleva 18 puntos.
 */

/**
 * Cuántas filas de la misma ficha se corrigen de una vez.
 *
 * Debería haber siempre una sola, que es el invariante que promete
 * `src/collections/Actividad.ts`. Cuando la tabla no lo sostenía, dos pestañas
 * abiertas a la vez podían crear dos, y tocando solo `docs[0]` la fila gemela se
 * quedaba con `completado: false` para siempre: la portada seguía ofreciendo en
 * «Continúa leyendo» una ficha que el residente marcaba como leída una vez y
 * otra sin entender por qué.
 *
 * La causa ya está cerrada: `src/collections/Actividad.ts` declara el índice
 * único sobre (usuario, coleccion, documentoId) y la migración
 * `20260913_033442_actividad_una_fila_por_ficha` lo crea, después de borrar los
 * duplicados que hubiera. Este bucle se queda porque las filas gemelas de antes
 * del índice pudieron sobrevivir en una base que aún no haya pasado esa
 * migración —en desarrollo manda el `push` de Drizzle y nadie aplica nada—, y
 * porque escribir todas las que haya no cuesta nada.
 */
const FILAS_A_CORREGIR = 10

/**
 * Deja constancia de la visita o de la marca de lectura.
 *
 * Devuelve si quedó escrito. `false` significa «no había sesión activa», no
 * «falló»: los fallos de verdad se lanzan para que quien llama elija.
 */
async function anotar(
  coleccion: unknown,
  documentoId: unknown,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo || !usuarioEfectivo) return false

  const usuarioId = (usuarioEfectivo as { id?: unknown }).id
  if (!usuarioId) return false

  const modulo = exigirSlugDeModulo(coleccion)
  // `exigirSlugDeModulo` dice que el módulo existe, no que esta cuenta lo vea,
  // y `Actividad.ts` daba por hecho lo segundo al escribir que «`anotar` ya
  // valida el módulo». No lo hacía: todo lo de abajo escribe con la API local,
  // cuyo `overrideAccess` vale `true`, así que la regla de creación de la
  // colección no se consultaba. Un lector con el simulador vetado llamaba a
  // `marcarComoLeida('cirugias', …)` o a `registrarResultadoDeCirugia` desde la
  // consola del navegador y el panel le contaba casos que no puede abrir. Se le
  // pregunta a `puedeVerModulo`, la misma que usa la colección, antes de tocar
  // la base. Con el usuario efectivo, como las páginas: es el que decide qué
  // módulos se le enseñaron.
  if (!puedeVerModulo(usuarioDeSesion(usuarioEfectivo), modulo)) {
    throw new Error('Su cuenta no tiene acceso a ese módulo.')
  }
  const documento = exigirIdentificador(documentoId, 'La ficha')
  const payload = await getPayload({ config })

  const dondeEstaLaFicha: Where = {
    and: [
      { usuario: { equals: usuarioId } },
      { coleccion: { equals: modulo } },
      { documentoId: { equals: documento } },
    ],
  }

  const filasDeLaFicha = async () =>
    (
      await payload.find({
        collection: 'actividad',
        where: dondeEstaLaFicha,
        user: usuarioEfectivo as never,
        limit: FILAS_A_CORREGIR,
        depth: 0,
      })
    ).docs

  const actualizar = async (filas: { id: number | string }[]) => {
    for (const fila of filas) {
      await payload.update({
        collection: 'actividad',
        id: fila.id,
        data: extra as never,
        user: usuarioEfectivo as never,
      })
    }
  }

  // `ultimaVisita` la fija el hook de la colección en cada escritura; aquí
  // solo se decide si hay que crear el registro o actualizarlo.
  const existentes = await filasDeLaFicha()
  if (existentes.length > 0) {
    await actualizar(existentes)
    return true
  }

  try {
    await payload.create({
      collection: 'actividad',
      data: { coleccion: modulo, documentoId: documento, ...extra } as never,
      user: usuarioEfectivo as never,
    })
  } catch (choque) {
    // Otra petición del mismo usuario creó la fila entre la consulta y este
    // `create`. Abrir una ficha y marcarla enseguida son dos llamadas que
    // viajan en paralelo, y entre dos pestañas ni siquiera las ordena la cola
    // de acciones del navegador. Se recupera escribiendo sobre lo que ya
    // existe en vez de devolver un error que el residente no puede resolver.
    //
    // Desde `20260913_033442_actividad_una_fila_por_ficha` la tabla tiene su
    // índice único, así que el choque (23505) llega hasta aquí de verdad: esto
    // dejó de ser código de reserva y es la diferencia entre una casilla que se
    // guarda y un error en pantalla.
    const otras = await filasDeLaFicha()
    if (otras.length === 0) throw choque
    await actualizar(otras)
  }
  return true
}

/**
 * Deja constancia de que se abrió la ficha.
 *
 * No propaga nada, ni siquiera un fallo de sesión: `RastreadorActividad` la
 * llama al montar, sin `await`, y una promesa rechazada que nadie recoge
 * termina en el registro de errores del navegador sin que el residente pueda
 * hacer nada al respecto. La visita se pierde, que es lo que menos cuesta.
 */
export async function registrarVisita(coleccion: unknown, documentoId: unknown): Promise<void> {
  try {
    await anotar(coleccion, documentoId)
  } catch (error) {
    console.error('[actividad] no se pudo registrar la visita:', error)
  }
}

/**
 * Marca o desmarca la ficha como leída.
 *
 * Lanza si no quedó escrita, y eso es deliberado: es lo que hace que el `catch`
 * de `RastreadorActividad` devuelva la casilla a su sitio. Callar aquí es
 * mentirle al residente sobre su propio progreso.
 *
 * Tiene dos clientes, y los dos dependen de que lance: la casilla, y
 * `ConsolaQuirurgica` al terminar un caso, que da la cirugía por leída con esta
 * misma acción y no con una escritura propia —un segundo camino hacia
 * `completado` acabaría validando otra cosa que este—. Si aquí se tragara el
 * fallo, el panel de «Caso terminado» diría que el caso cuenta como leído
 * mientras la portada lo sigue ofreciendo «por leer».
 */
export async function marcarComoLeida(
  coleccion: unknown,
  documentoId: unknown,
  completado: unknown,
): Promise<void> {
  let escrito = false
  try {
    escrito = await anotar(coleccion, documentoId, { completado: completado === true })
  } catch (error) {
    console.error('[actividad] no se pudo marcar como leída:', error)
    throw new Error('No se pudo guardar la marca de lectura. Vuelva a intentarlo.')
  }
  if (!escrito) {
    throw new Error('Su sesión ya no está activa. Vuelva a entrar para guardar su lectura.')
  }
}

// ---------------------------------------------------------------------------
// El resultado del simulador
//
// Todo lo que llega aquí lo compuso el navegador, así que se comprueba entero
// antes de tocar la base. No es desconfianza del residente: una acción de
// servidor de Next se invoca por HTTP y acepta los argumentos que le manden,
// tenga o no un formulario delante —lo explica la cabecera de
// `src/lib/validacion.ts`—. Y aquí, además, lo que se guarda va a parar a una
// columna de texto libre: sin este filtro, el desenlace de una complicación
// podría ser cualquier cadena, y lo que el panel enseñaría al profesor bajo
// «dónde se atasca su gente» sería lo que alguien quisiera escribir.
// ---------------------------------------------------------------------------

/**
 * Techo de puntos de un caso.
 *
 * No sale de ninguna regla clínica: es la raya a partir de la cual un número
 * deja de ser un puntaje y es un número raro. `puntajeMaximo` suma los pasos
 * del guion, y un caso con cien pasos de mil puntos ya estaría muy por encima
 * de cualquier cosa que el traumatólogo llegue a escribir.
 */
const TECHO_DE_PUNTOS = 100_000
const LARGO_MAXIMO_DEL_TITULO = 200
const LARGO_MAXIMO_DEL_DETALLE = 1000

/**
 * Un número de puntos: finito, no negativo y por debajo del techo.
 *
 * **Sin exigir entero**, y conviene saber por qué antes de volver a ponerlo.
 * `puntos` de cada paso es un `number` pelado en `src/collections/Cirugias.ts`
 * —sin `min`— y `src/admin/esquema.ts` lo declara sin `paso`, así que el
 * formulario del panel lo pinta con `step="any"`: el traumatólogo puede
 * escribir 7,5 y `puntajeMaximo` sale decimal sin que nada se lo impida. Con la
 * exigencia de entero puesta, ese caso lanzaba en **cada hito**: no se guardaba
 * nunca nada, el residente leía «Su progreso no se pudo guardar» paso tras paso
 * y el panel enseñaba el caso como jamás recorrido.
 *
 * Y los dos lados discrepaban: `cuenta()` en `src/lib/progresoDelSimulador.ts`
 * —el que lee esta misma columna— acepta cualquier número finito y no negativo,
 * de modo que la lectura admitía justo lo que la escritura rechazaba. Ahora las
 * dos piden lo mismo.
 *
 * Lo que sí protege de verdad es el techo, y ese se queda.
 */
function exigirPuntos(valor: unknown, que: string): number {
  if (
    typeof valor !== 'number' ||
    !Number.isFinite(valor) ||
    valor < 0 ||
    valor > TECHO_DE_PUNTOS
  ) {
    throw new ErrorDeValidacion(`${que} tiene que ser un número entre 0 y ${TECHO_DE_PUNTOS}.`)
  }
  return valor
}

/**
 * Una complicación de las que manda la consola.
 *
 * El desenlace se exige, aunque la columna lo acepte vacío. Allí se deja
 * opcional porque una fila puede llegar a medias de cualquier sitio; aquí quien
 * escribe es `ConsolaQuirurgica`, que lo tiene siempre —sale de `evaluarGesto`—
 * y una complicación sin desenlace no se puede contar en el panel: se quedaría
 * en la tabla sin poder agruparse con las suyas.
 *
 * Se nombra la posición en el mensaje porque el fallo, si llega, lo va a leer
 * quien escriba el próximo cliente de esta acción, no el residente: a él la
 * consola le dice que su progreso no se pudo guardar y sigue con el caso.
 */
function complicacionValida(bruta: unknown, posicion: number): ComplicacionDelCaso {
  if (!bruta || typeof bruta !== 'object') {
    throw new ErrorDeValidacion(`La complicación ${posicion} no llegó como corresponde.`)
  }
  const c = bruta as Record<string, unknown>

  const paso = exigirIdentificador(c.paso, `El paso de la complicación ${posicion}`)

  // En una constante y no leyendo `c.resultado` dos veces: así lo que entra en
  // la fila es exactamente lo que la guarda comprobó.
  const desenlace = c.resultado
  if (!esDesenlaceConDano(desenlace)) {
    throw new ErrorDeValidacion(
      `«${String(desenlace)}» no es un desenlace del simulador: los escribe la consola desde RESULTADOS (src/lib/simulador.ts).`,
    )
  }

  const numero = c.numero
  if (
    numero !== undefined &&
    numero !== null &&
    (typeof numero !== 'number' || !Number.isInteger(numero) || numero < 1)
  ) {
    throw new ErrorDeValidacion(
      `El número del paso de la complicación ${posicion} no es válido.`,
    )
  }

  return {
    paso,
    numero: typeof numero === 'number' ? numero : null,
    titulo: textoOpcional(c.titulo, `El título del paso ${posicion}`, LARGO_MAXIMO_DEL_TITULO) ?? null,
    resultado: desenlace,
    detalle:
      textoOpcional(c.detalle, `El detalle de la complicación ${posicion}`, LARGO_MAXIMO_DEL_DETALLE) ??
      null,
  }
}

/**
 * El recorrido entero, ya comprobado.
 *
 * La lista se rechaza si viene pasada de largo en vez de recortarla: la consola
 * ya la recorta a `MAXIMO_DE_COMPLICACIONES` antes de mandarla, así que una
 * más larga no es un recorrido real y guardar las cien primeras de algo que no
 * lo es sería inventarse un historial. Ese mismo tope es el `maxRows` de la
 * columna, de modo que nunca se le entrega a Payload una lista que él vaya a
 * rechazar entera —y con ella el puntaje—.
 */
function resultadoValido(valor: unknown): ResultadoDeCirugia {
  if (!valor || typeof valor !== 'object') {
    throw new ErrorDeValidacion('El resultado del caso no llegó como corresponde.')
  }
  const r = valor as Record<string, unknown>

  const puntajeMaximo = exigirPuntos(r.puntajeMaximo, 'El puntaje máximo del caso')

  // El numerador nunca por encima del denominador. No es un cerrojo contra
  // nadie —el puntaje lo calcula el navegador y `src/collections/Actividad.ts`
  // explica por qué se acepta así—, es que «22 de 20» no es un marcador: se
  // enseña en la portada del residente y en el panel, y ahí tiene que poder
  // leerse. Se recorta en lugar de rechazar para no perder también las
  // complicaciones del recorrido por una cuenta que no cuadra.
  const puntaje = Math.min(exigirPuntos(r.puntaje, 'El puntaje del caso'), puntajeMaximo)

  const brutas = r.complicaciones
  if (brutas !== undefined && brutas !== null && !Array.isArray(brutas)) {
    throw new ErrorDeValidacion('Las complicaciones tienen que llegar en una lista.')
  }
  const lista = Array.isArray(brutas) ? brutas : []
  if (lista.length > MAXIMO_DE_COMPLICACIONES) {
    throw new ErrorDeValidacion(
      `Un recorrido no puede traer más de ${MAXIMO_DE_COMPLICACIONES} complicaciones.`,
    )
  }

  return {
    puntaje,
    puntajeMaximo,
    complicaciones: lista.map((bruta, i) => complicacionValida(bruta, i + 1)),
  }
}

/**
 * Guarda lo que el residente lleva hecho en un caso del simulador.
 *
 * El módulo es fijo —`cirugias`— y no un argumento: esta acción escribe el
 * puntaje y la lista de complicaciones, que solo significan algo en una
 * cirugía. Dejarlo abierto permitiría colgarle una partida a una ficha de la
 * biblioteca, y el panel contaría casos del simulador que nadie jugó.
 *
 * Sustituye: la fila es una por usuario y ficha —el índice único de
 * `actividad`— y describe **el último recorrido**, no un historial. La lista
 * que llega reemplaza entera a la anterior, que es lo que permite que un
 * recorrido nuevo borre las complicaciones del viejo en lugar de acumularlas.
 *
 * Lanza cuando no se pudo escribir, igual que `marcarComoLeida` y por lo
 * mismo: la consola tiene un marcador en pantalla diciendo que el residente
 * lleva 18 puntos. Si el fallo no sube, ese marcador es lo único que existe y
 * al recargar no hay nada.
 */
export async function registrarResultadoDeCirugia(
  documentoId: unknown,
  resultado: unknown,
): Promise<void> {
  // Fuera del `try`: un resultado mal formado no es un fallo de escritura y no
  // se puede reintentar, así que su mensaje tiene que llegar tal cual al
  // registro del servidor en vez de esconderse detrás de «vuelva a intentarlo».
  const datos = resultadoValido(resultado)

  let escrito = false
  try {
    escrito = await anotar('cirugias', documentoId, {
      puntaje: datos.puntaje,
      puntajeMaximo: datos.puntajeMaximo,
      complicaciones: datos.complicaciones,
    })
  } catch (error) {
    console.error('[actividad] no se pudo guardar el resultado del caso:', error)
    throw new Error('No se pudo guardar su progreso en este caso. Vuelva a intentarlo.')
  }
  if (!escrito) {
    throw new Error('Su sesión ya no está activa. Vuelva a entrar para guardar su progreso.')
  }
}
