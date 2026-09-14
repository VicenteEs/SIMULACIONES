/**
 * Quién tiene cambios sin guardar en el panel, para que la barra lateral pueda
 * preguntar antes de sacar a nadie de una pantalla a medio trabajar.
 *
 * El editor de fichas ya preguntaba al salir por sus migas y por «Duplicar»,
 * pero la barra lateral está en el `layout.tsx` del panel, fuera del
 * formulario, y sus enlaces navegaban sin consultar a nadie: con media ficha
 * escrita, pulsar «Comentarios» para mirar uno se llevaba todo por delante.
 * `beforeunload` no ayuda, porque una navegación de cliente del App Router no
 * lo dispara.
 *
 * ## Por qué un registro suelto y no un contexto de React
 *
 * La barra no debe saber qué pantallas existen, ni las pantallas que existe una
 * barra. Hoy se apuntan dos —el editor de fichas y el taller del atlas, que
 * pierde una preparación entera— y la siguiente que tenga trabajo sin guardar
 * solo tiene que apuntarse aquí, sin tocar la barra. Un contexto obligaría a
 * envolver el `layout` —que es de servidor— en un proveedor de cliente solo
 * para esto, y acoplaría las piezas por el árbol.
 *
 * El estado es del módulo, y eso en el servidor sería compartido entre
 * peticiones. No pasa porque solo se escribe desde un `useEffect`, que no corre
 * en el servidor: allí el registro está siempre vacío.
 *
 * ## Por qué cada pantalla apunta una pregunta y no una bandera
 *
 * La primera versión guardaba solo banderas: apuntarse era decir «tengo
 * cambios» desde un efecto que miraba el estado. Al editor le basta, porque su
 * `sucio` es estado de React y cada tecla vuelve a pintar. Al taller del atlas
 * no: lo que puede perder es también el encuadre, y la cámara vive dentro de
 * three.js y no pasa nunca por un pintado —ver `encuadreMovido` en
 * `TallerDeAtlas.tsx`—, así que un efecto colgado de su estado se quedaba con un
 * «no hay nada que perder» de antes de girar el modelo. Con una función, la
 * pregunta se hace en el instante del clic, que es cuando la respuesta vale.
 */

const pantallas = new Map<symbol, () => boolean>()

/**
 * Apunta una pantalla que puede tener cambios sin guardar. Devuelve con qué
 * desapuntarla.
 *
 * `hayQuePerder` se consulta al pulsar un enlace de la barra, no al apuntarse.
 * Sin argumento vale «siempre», para quien ya se apunta solo mientras está
 * sucio, como el editor.
 *
 * Cada llamada lleva su propia ficha y no un contador, para que desapuntar dos
 * veces —el `useEffect` de React lo hace en desarrollo— no borre la de otra
 * pantalla que sigue sucia.
 */
export function apuntarCambiosSinGuardar(hayQuePerder: () => boolean = () => true): () => void {
  const ficha = Symbol('cambios sin guardar')
  pantallas.set(ficha, hayQuePerder)
  return () => {
    pantallas.delete(ficha)
  }
}

/**
 * ¿Alguna pantalla apuntada tiene algo que perder ahora mismo?
 *
 * Una pregunta que falla cuenta como «sí». La barra llama a esto desde el
 * `onNavigate` de sus `<Link>`, y una excepción ahí deja el enlace muerto: la
 * barra entera dejaría de navegar por un fallo de una pantalla que no es suya.
 * Y entre dudar y callar, preguntar de más cuesta un clic; callar de más cuesta
 * el trabajo.
 */
export function hayCambiosSinGuardar(): boolean {
  return [...pantallas.values()].some((hayQuePerder) => {
    try {
      return hayQuePerder()
    } catch {
      return true
    }
  })
}

/**
 * La frase de la pregunta, una sola para todas las salidas.
 *
 * Si las migas del editor y la barra lateral la escribieran cada una a su
 * manera, la misma situación se contestaría con dos preguntas distintas según
 * por dónde se saliera, y la que suene menos grave es la que se acepta sin leer.
 *
 * Dice «pantalla» y no «ficha» porque la barra no sabe quién la apuntó: el mismo
 * aviso sale del editor y del taller del atlas, y en el taller no hay ficha sino
 * una preparación.
 */
export const PREGUNTA_DE_SALIDA =
  'Hay cambios sin guardar en esta pantalla.\n\n¿Salir igual? Se pierde todo lo hecho desde el último guardado.'

/**
 * ¿Se puede salir? Sin nada pendiente, sí y sin preguntar.
 *
 * `preguntar` se recibe para poder probarlo sin navegador; en la pantalla es
 * `window.confirm`, que bloquea y es justo lo que hace falta: la navegación
 * tiene que esperar a la respuesta para poder cancelarse.
 */
export function puedeSalirSinPerderCambios(
  preguntar: (texto: string) => boolean = (texto) => window.confirm(texto),
): boolean {
  return !hayCambiosSinGuardar() || preguntar(PREGUNTA_DE_SALIDA)
}

// ------------------------------------------------ Atrás y Adelante del navegador

/**
 * Lo que la guardia necesita del navegador, con la forma justa para poder
 * sustituirlo en una prueba sin DOM.
 *
 * `navegacion` es la Navigation API (`window.navigation`). Es opcional porque
 * no la tienen los navegadores anteriores a 2026 —Firefox antes del 147, Safari
 * antes del 26.2—, y sin ella esta guardia no hace nada con Atrás: ver
 * `vigilarSalidasDelNavegador`.
 *
 * `eventoPopstate` es la clase `PopStateEvent`, cuyo `state` se tapa mientras
 * dura un viaje que el router de Next no debe ver. Por qué, allí abajo.
 */
export interface NavegadorVigilado {
  ventana: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  historial: { go(distancia: number): void }
  navegacion?: EventTarget & { readonly currentEntry: EntradaDelHistorial | null }
  eventoPopstate?: { prototype: object }
  preguntar: (texto: string) => boolean
  /** Para programar tareas; `setTimeout` en la pantalla. */
  despues: (tarea: () => void) => void
}

interface EntradaDelHistorial {
  readonly key: string
  readonly index: number
  readonly url: string | null
}

/** Lo que trae `currententrychange`, que el DOM de TypeScript llama `NavigationCurrentEntryChangeEvent`. */
interface CambioDeEntrada extends Event {
  readonly navigationType: string | null
  readonly from: EntradaDelHistorial
}

const sinAncla = (url: string | null): string => (url ?? '').replace(/#.*$/, '')

/**
 * Pregunta antes de que Atrás o Adelante saquen de una pantalla con cambios
 * sin guardar, y devuelve con qué dejar de vigilar. Se monta una sola vez, en
 * el `layout.tsx` del panel, a través de `GuardiaDeAtras`.
 *
 * Los dos botones del navegador no pasaban por ninguna de las otras dos
 * guardias: dentro del App Router son un `popstate`, no una descarga, así que
 * `beforeunload` no se entera, y no son un `<Link>`, así que no tienen
 * `onNavigate`. Y un `popstate` no se puede cancelar: cuando llega, la URL ya
 * cambió.
 *
 * ## Cómo se cancela lo que no se puede cancelar
 *
 * Se deja pasar el viaje, se pregunta, y si la respuesta es quedarse se hace el
 * viaje contrario. Para eso hay que saber cuántas entradas se saltó —Atrás
 * mantenido abre un menú y salta varias de golpe—, y eso lo dice la Navigation
 * API: `currententrychange` trae la entrada de la que se sale y
 * `currentEntry` aquella a la que se llegó, las dos con su `index`. Sin esa API
 * no hay manera honrada de saber la distancia, y la guardia no hace nada con
 * Atrás; un `beforeunload` sí queda puesto (abajo).
 *
 * Adelante es exactamente el mismo viaje con la distancia al revés, y no
 * necesita nada propio.
 *
 * ## Por qué el router de Next no debe ver ni la ida ni la vuelta
 *
 * Next escucha `popstate` por su cuenta (`onPopState` en
 * `next/dist/client/components/app-router.js`), y casi siempre se registra
 * antes que esta guardia, porque vive en la raíz y el panel se monta después;
 * al revés solo cuando se entra al panel cargando la página, porque el efecto
 * de un hijo corre antes que el de la raíz. Las dos órdenes se probaron en la
 * aplicación. Si Next viera la ida, pintaría la otra pantalla y desmontaría el
 * editor mientras la pregunta está abierta. Y cualquier viaje que vea
 * **descarta la acción del router que esté pendiente** (`dispatchAction` en
 * `app-router-instance.js`: una restauración marca `discarded` lo que hubiera
 * en cola): el `router.refresh()` que lanza guardar, o el `router.replace()`
 * que lleva una ficha nueva a su dirección definitiva, se perderían sin aviso.
 *
 * No hay forma de pasar antes que su oyente —los de `window` corren en orden de
 * registro, también los de captura: se midió en Chrome 152— ni de cambiar lo
 * que el evento lleva: `replaceState` dentro de `currententrychange` no altera
 * el `state` de un `popstate` que ya está creado. Lo que sí hace Next es
 * ignorar el evento cuyo `state` es nulo (`if (!event.state) return`), y
 * `currententrychange` llega **antes** que `popstate`. Así que, decidido que se
 * vuelve, se tapa el `state` de `PopStateEvent` hasta la tarea siguiente, que
 * es cuando ya han corrido todos los oyentes. `tests/unit/atrasDelNavegador.test.ts`
 * lee esas dos líneas de Next para que una actualización que las cambie no
 * pase sin avisar.
 *
 * ## Por qué no una entrada de historial de más
 *
 * Es la técnica habitual —apilar una entrada falsa mientras haya cambios y
 * preguntar al volver sobre ella— y se descartó por lo que cuesta retirarla.
 * Al guardar hay que quitarla, y quitar una entrada es un `history.back()` que
 * Next vería justo con el `refresh` o el `replace` del guardado en cola:
 * precisamente la acción que descarta. Leído el código de la cola, una ficha
 * nueva se quedaría en `/nuevo` ya creada en la base, y el guardado siguiente
 * crearía otra. Dejarla puesta tampoco sale gratis: al salir por la barra
 * lateral queda enterrada, y el Atrás de después no hace nada visible. Volver
 * del viaje, en cambio, no deja rastro en el historial.
 *
 * ## Lo que se ve y lo que no
 *
 * Mientras la pregunta está abierta la barra de direcciones ya enseña la
 * dirección de destino: el viaje ocurrió. Al cancelar, la posición de
 * desplazamiento vuelve a la de antes (medido), pero entre la ida y la vuelta
 * el navegador restaura la de la pantalla de destino, y puede verse un salto de
 * un fotograma. No se corrige a mano porque corregirlo sobrescribiría la
 * posición guardada de aquella pantalla.
 *
 * Una salida entre documentos —Atrás hasta una página que no es de esta
 * aplicación— no da `popstate`: ahí pregunta el navegador con su propio aviso
 * de `beforeunload`, el que también pone esta guardia.
 */
export function vigilarSalidasDelNavegador(navegador: NavegadorVigilado): () => void {
  const { ventana, historial, navegacion, eventoPopstate, preguntar, despues } = navegador

  // Cerrar la pestaña o salir a otro documento. El editor y el taller tenían
  // ya el suyo; este cubre a quien se apunte después sin acordarse, y a una
  // salida hacia atrás que abandona el documento, donde no hay `popstate`.
  const alDescargar = (evento: Event) => {
    if (hayCambiosSinGuardar()) evento.preventDefault()
  }
  ventana.addEventListener('beforeunload', alDescargar)
  const dejarDeVigilarDescarga = () => ventana.removeEventListener('beforeunload', alDescargar)

  if (!navegacion || !eventoPopstate) return dejarDeVigilarDescarga

  const descriptor = Object.getOwnPropertyDescriptor(eventoPopstate.prototype, 'state')
  const leerEstado = descriptor?.get
  if (!descriptor || !leerEstado) return dejarDeVigilarDescarga

  /** Mientras es verdadero, cualquier `popstate` enseña `state: null` a quien lo lea. */
  let tapando = false
  /** La entrada a la que se está volviendo tras un «no», si se está volviendo. */
  let volviendoA: string | null = null

  Object.defineProperty(eventoPopstate.prototype, 'state', {
    ...descriptor,
    get(this: object) {
      return tapando ? null : leerEstado.call(this)
    },
  })

  const tapar = () => {
    tapando = true
  }

  const alCambiarDeEntrada = (evento: Event) => {
    const cambio = evento as CambioDeEntrada
    // Los `push` y `replace` son del router o de un enlace que ya preguntó —la
    // barra lateral, las migas, «Salir»—; preguntar aquí sería la segunda vez.
    if (cambio.navigationType !== 'traverse') return
    const destino = navegacion.currentEntry
    const origen = cambio.from
    if (!destino || !origen || destino.index < 0 || origen.index < 0) return

    if (volviendoA !== null) {
      const esLaVuelta = destino.key === volviendoA
      volviendoA = null
      if (esLaVuelta) {
        tapar()
        return
      }
      // No se llegó adonde se volvía —otro viaje se cruzó—: este se trata
      // como cualquiera, porque puede ser el que saca de la pantalla.
    }

    // Misma dirección salvo el ancla: no se desmonta nada y no hay qué perder.
    if (sinAncla(origen.url) === sinAncla(destino.url)) return
    if (puedeSalirSinPerderCambios(preguntar)) return

    tapar()
    volviendoA = origen.key
    historial.go(origen.index - destino.index)
  }

  // Se destapa desde aquí y en la tarea siguiente. No vale destapar al final
  // de este oyente: si corre antes que el de Next —pasa cuando se entra al
  // panel cargando la página, y el efecto de un hijo se registra antes que el
  // de la raíz—, le enseñaría el `state` justo a él. Y no vale una microtarea:
  // entre un oyente y el siguiente el navegador vacía la cola de microtareas.
  const alViajar = () => {
    if (tapando) despues(() => {
      tapando = false
    })
  }

  navegacion.addEventListener('currententrychange', alCambiarDeEntrada)
  ventana.addEventListener('popstate', alViajar)

  return () => {
    dejarDeVigilarDescarga()
    navegacion.removeEventListener('currententrychange', alCambiarDeEntrada)
    ventana.removeEventListener('popstate', alViajar)
    Object.defineProperty(eventoPopstate.prototype, 'state', descriptor)
  }
}
