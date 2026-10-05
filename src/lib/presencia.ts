/**
 * Quién tiene abierta qué ficha en el editor, ahora.
 *
 * El choque de edición (`src/admin/concurrencia.ts`) evita que el segundo que
 * guarda borre lo del primero, pero avisa tarde: cuando ya hay media hora
 * escrita a cada lado y alguien tiene que copiar a mano lo del otro. El dueño
 * pidió saberlo antes, al abrir: «quién más está editando esta ficha». Con eso
 * los dos pueden hablarlo antes de escribir.
 *
 * ## Por qué en memoria y no en la base
 *
 * Es un dato que caduca en segundos y que nadie necesita mañana. En la base
 * serían una tabla nueva —con su migración— y una escritura cada quince
 * segundos por pestaña abierta, para guardar algo que deja de ser verdad a los
 * cuarenta y cinco. La aplicación corre en un solo contenedor, con un solo
 * proceso de Node, así que un `Map` del proceso lo ve todo.
 *
 * La consecuencia, dicha para que no sorprenda: **si algún día hay más de una
 * instancia** detrás del proxy, cada una verá solo a quien le cayó a ella y la
 * banda dirá la mitad. Ese día hará falta un almacén compartido (la propia
 * base, o Redis); la forma de este módulo —latir, salir, preguntar— no cambia.
 * Tampoco sobrevive a un reinicio: tras desplegar, la presencia se rehace sola
 * en el primer latido de cada pestaña, quince segundos después.
 *
 * Lo de aquí es puro —recibe la hora, no la lee— para probarlo sin servidor ni
 * relojes falsos (`tests/unit/presencia.test.ts`). La ruta que lo sirve es
 * `src/app/(frontend)/api/presencia/route.ts`.
 */

/** Cada cuánto late una pestaña con la ficha a la vista. */
export const LATIDO_VISIBLE_MS = 15_000

/**
 * Cada cuánto late una pestaña escondida.
 *
 * Una pestaña en segundo plano sigue siendo un editor con la ficha abierta, y
 * con cambios sin guardar es justo el que va a chocar al volver. Así que no
 * deja de contar; late más despacio porque Chrome estrangula los
 * temporizadores de las pestañas ocultas hasta uno por minuto, y prometer
 * quince segundos que el navegador no va a cumplir haría que caducara y
 * reapareciera sola.
 */
export const LATIDO_OCULTO_MS = 60_000

/** Sin latido en este tiempo, la pestaña visible se da por cerrada. Tres latidos. */
export const CADUCIDAD_VISIBLE_MS = 45_000

/** Lo mismo para la escondida: dos latidos y medio de los suyos. */
export const CADUCIDAD_OCULTA_MS = 150_000

/**
 * Techo de entradas del almacén entero.
 *
 * La ruta comprueba que quien late puede editar esa colección y que el `id`
 * tiene forma de `id`, pero no lee la base en cada latido para ver si la ficha
 * existe: una cuenta de editor con un guion podría inventarse millones. Con
 * este techo, lo peor que consigue es que el almacén deje de admitir
 * presencias nuevas un minuto; la memoria del proceso no se toca.
 */
export const MAXIMO_DE_ENTRADAS = 5_000

/** Quién está, tal como lo guarda el almacén. */
export interface Presencia {
  usuarioId: string
  nombre: string
  rol: string
  /** Una por pestaña: la misma persona con dos pestañas son dos entradas. */
  pestana: string
  /** Desde cuándo tiene la ficha abierta esta pestaña. */
  desde: number
  /** El último latido. */
  visto: number
  visible: boolean
}

/** Lo que se le cuenta a quien pregunta por otra persona. */
export interface OtroEditor {
  nombre: string
  rol: string
  /** Desde cuándo, la pestaña más antigua de esa persona en esta ficha. */
  desde: number
  /** Ninguna de sus pestañas con la ficha está a la vista. */
  segundoPlano: boolean
}

export interface Almacen {
  latir(ficha: string, presencia: Omit<Presencia, 'desde' | 'visto'>, ahora: number): boolean
  salir(ficha: string, usuarioId: string, pestana: string): void
  /** Los demás en esta ficha, una entrada por persona, y cuántas otras pestañas tiene quien pregunta. */
  quienMas(
    ficha: string,
    usuarioId: string,
    pestana: string,
    ahora: number,
  ): { otros: OtroEditor[]; misOtrasPestanas: number }
  /** Por ficha de una colección: quién la tiene abierta. Para el listado. */
  porColeccion(coleccion: string, ahora: number): Record<string, (OtroEditor & { usuarioId: string })[]>
  limpiar(ahora: number): void
  /** Cuántas entradas hay, para las pruebas y para el techo. */
  tamano(): number
}

/** `patologias/41`: la clave de una ficha. */
export const claveDeFicha = (coleccion: string, id: string): string => `${coleccion}/${id}`

const vigente = (p: Presencia, ahora: number): boolean =>
  ahora - p.visto <= (p.visible ? CADUCIDAD_VISIBLE_MS : CADUCIDAD_OCULTA_MS)

/**
 * Junta las pestañas de cada persona en una sola entrada.
 *
 * La banda dice «Elena Editora también tiene abierta esta ficha», no «Elena,
 * Elena y Elena»: lo que importa es cuántas personas pueden chocar, y desde
 * cuándo, que es lo que da la más antigua de sus pestañas. Si cualquiera de
 * ellas está a la vista, la persona está delante.
 */
function porPersona(presencias: Presencia[]): (OtroEditor & { usuarioId: string })[] {
  const personas = new Map<string, OtroEditor & { usuarioId: string }>()
  for (const p of presencias) {
    const ya = personas.get(p.usuarioId)
    if (!ya) {
      personas.set(p.usuarioId, {
        usuarioId: p.usuarioId,
        nombre: p.nombre,
        rol: p.rol,
        desde: p.desde,
        segundoPlano: !p.visible,
      })
      continue
    }
    ya.desde = Math.min(ya.desde, p.desde)
    ya.segundoPlano = ya.segundoPlano && !p.visible
  }
  // El que llegó antes, primero: es el que tiene más escrito.
  return [...personas.values()].sort((a, b) => a.desde - b.desde)
}

export function crearAlmacen(maximo = MAXIMO_DE_ENTRADAS): Almacen {
  /** Ficha → (persona y pestaña → presencia). */
  const fichas = new Map<string, Map<string, Presencia>>()
  let entradas = 0
  const claveDePestana = (usuarioId: string, pestana: string) => `${usuarioId}:${pestana}`

  const limpiar = (ahora: number) => {
    for (const [ficha, pestanas] of fichas) {
      for (const [clave, p] of pestanas) {
        if (!vigente(p, ahora)) {
          pestanas.delete(clave)
          entradas -= 1
        }
      }
      if (pestanas.size === 0) fichas.delete(ficha)
    }
  }

  const vivas = (ficha: string, ahora: number): Presencia[] =>
    [...(fichas.get(ficha)?.values() ?? [])].filter((p) => vigente(p, ahora))

  return {
    latir(ficha, presencia, ahora) {
      let pestanas = fichas.get(ficha)
      const clave = claveDePestana(presencia.usuarioId, presencia.pestana)
      const anterior = pestanas?.get(clave)
      if (!anterior) {
        if (entradas >= maximo) limpiar(ahora)
        if (entradas >= maximo) return false
        if (!pestanas) {
          pestanas = new Map()
          fichas.set(ficha, pestanas)
        }
        entradas += 1
      }
      // `desde` se conserva entre latidos: es cuándo se abrió, no cuándo latió.
      // Una pestaña que caducó y vuelve a latir —un portátil que se durmió—
      // empieza de nuevo, porque para los demás estuvo cerrada.
      const desde = anterior && vigente(anterior, ahora) ? anterior.desde : ahora
      pestanas!.set(clave, { ...presencia, desde, visto: ahora })
      return true
    },

    salir(ficha, usuarioId, pestana) {
      const pestanas = fichas.get(ficha)
      if (!pestanas?.delete(claveDePestana(usuarioId, pestana))) return
      entradas -= 1
      if (pestanas.size === 0) fichas.delete(ficha)
    },

    quienMas(ficha, usuarioId, pestana, ahora) {
      const todas = vivas(ficha, ahora)
      const otros = porPersona(todas.filter((p) => p.usuarioId !== usuarioId)).map(
        ({ nombre, rol, desde, segundoPlano }) => ({ nombre, rol, desde, segundoPlano }),
      )
      const misOtrasPestanas = todas.filter((p) => p.usuarioId === usuarioId && p.pestana !== pestana).length
      return { otros, misOtrasPestanas }
    },

    porColeccion(coleccion, ahora) {
      const prefijo = `${coleccion}/`
      const salida: Record<string, (OtroEditor & { usuarioId: string })[]> = {}
      for (const ficha of fichas.keys()) {
        if (!ficha.startsWith(prefijo)) continue
        const personas = porPersona(vivas(ficha, ahora))
        if (personas.length > 0) salida[ficha.slice(prefijo.length)] = personas
      }
      return salida
    },

    limpiar,

    tamano: () => entradas,
  }
}

/**
 * El almacén del proceso.
 *
 * Colgado de `globalThis` y no de una constante del módulo: en desarrollo,
 * Next vuelve a evaluar el módulo de la ruta con cada cambio guardado, y un
 * almacén nuevo en cada recarga dejaría a todo el mundo «solo» en la ficha
 * hasta el siguiente latido. En producción da igual: el módulo se evalúa una
 * vez.
 */
const GLOBAL = globalThis as typeof globalThis & { __presenciaDelEditor?: Almacen }
export const almacenDelProceso = (): Almacen => (GLOBAL.__presenciaDelEditor ??= crearAlmacen())

// ------------------------------------------------------------------ entrada

/** Lo que manda la pantalla en cada latido, ya comprobado. */
export interface Latido {
  coleccion: string
  id: string
  pestana: string
  visible: boolean
  salir: boolean
}

/**
 * Comprueba lo que llega por la red antes de que toque el almacén.
 *
 * El cuerpo lo escribe quien llama. La colección se comprueba aparte, contra el
 * esquema del panel, en la ruta; aquí solo la forma: un `id` numérico como los
 * de Payload sobre PostgreSQL —el mismo patrón que lee `NotasDelRevisorEnLaBarra`
 * de la dirección— y un identificador de pestaña corto, que es lo que acaba de
 * clave en el `Map`.
 */
export function leerLatido(cuerpo: unknown): Latido | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const c = cuerpo as Record<string, unknown>
  const coleccion = typeof c.coleccion === 'string' ? c.coleccion : ''
  const id = typeof c.id === 'string' || typeof c.id === 'number' ? String(c.id) : ''
  const pestana = typeof c.pestana === 'string' ? c.pestana : ''
  if (!/^[a-z0-9-]{1,40}$/.test(coleccion)) return null
  if (!/^\d{1,12}$/.test(id)) return null
  if (!/^[A-Za-z0-9-]{8,64}$/.test(pestana)) return null
  return { coleccion, id, pestana, visible: c.visible !== false, salir: c.salir === true }
}

/** «Elena Editora» → «EE»; para el círculo de la barra. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return '?'
  const primera = palabras[0][0] ?? ''
  const ultima = palabras.length > 1 ? (palabras[palabras.length - 1][0] ?? '') : ''
  return (primera + ultima).toUpperCase()
}
