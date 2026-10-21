/**
 * Qué hacer cuando el navegador le quita a la página el contexto de WebGL (P-004 E2).
 *
 * Cristóbal lo contó así: «me maneé mucho y me fui a blanco; reinicio». El panel seguía vivo y el lienzo quedó
 * en blanco, así que no se cayó la página: se paró el dibujo. Las causas son dos y las dos acaban igual. El
 * navegador puede **quitar el contexto** (memoria de la tarjeta agotada, el equipo que cambia de gráfica, una
 * pestaña que lleva mucho abierta), y three.js sin un manejador de `webglcontextlost` deja el lienzo muerto
 * para siempre. O **una excepción dentro del bucle de dibujo** corta el `requestAnimationFrame`, y la próxima
 * vez que algo redimensiona el lienzo —abrir el panel de la fluoroscopia— el navegador lo borra y nadie lo
 * vuelve a pintar.
 *
 * Esto es la parte que se puede probar sin WebGL: en qué estado está el contexto, qué se le dice a quien opera
 * y cuándo se le ofrece volver a montar el lienzo. El lienzo solo avisa de lo que ocurre.
 */

/**
 * Cuánto se espera a que el navegador devuelva solo el contexto antes de ofrecer volver a montar el lienzo.
 *
 * Eran 3 s y se ofrecía el botón con el contexto a punto de volver: el navegador tarda en devolverlo cuando la tarjeta está
 * apretada, y montar de nuevo en ese momento era pelear con él. Se dio más margen (pedido del dueño: «si es por tiempo, que sea más
 * tiempo»): 12 s, que es de sobra para que vuelva solo y poco para quien se queda mirando un lienzo en blanco.
 */
export const ESPERA_ANTES_DE_OFRECER_MS = 12000

/**
 * Si pasado este tiempo el contexto sigue sin volver, la consola monta el lienzo de nuevo **sola**, sin esperar un clic: quien está
 * a media cirugía no tiene por qué ver la pantalla en blanco y buscar un botón. Una vez por pérdida; el caso y el puntaje no se tocan.
 */
export const ESPERA_PARA_REMONTAR_SOLO_MS = 30000

/** Cuántos milisegundos faltan para volver a montar el lienzo sin que nadie lo pida; `null` si el contexto no está perdido. */
export function cuantoFaltaParaRemontarse(estado: EstadoDelContexto, ahora: number): number | null {
  return estado.fase === 'perdido' ? Math.max(0, ESPERA_PARA_REMONTAR_SOLO_MS - (ahora - estado.desde)) : null
}

/** La resolución máxima del dibujo, en píxeles totales del lienzo: por encima, la memoria de la tarjeta se come el margen. */
export const PIXELES_MAXIMOS_DEL_LIENZO = 4_000_000

/**
 * Cuánto detalle se le pide a la tarjeta gráfica, según cuántas veces el navegador ya le quitó el contexto a esta página.
 *
 * El primer montaje es el de siempre. Cada pérdida es la señal de que la tarjeta va justa de memoria, así que el lienzo que se vuelve a
 * montar pide menos: primero una resolución menor, y a la segunda pérdida, sin suavizado de bordes (que multiplica el buffer). Se nota
 * poco y evita el blanco; si el equipo es holgado, no se activa nunca.
 */
export function calidadDelDibujo(perdidas: number): { razonMaxima: number; suavizado: boolean } {
  if (perdidas <= 0) return { razonMaxima: 2, suavizado: true }
  if (perdidas === 1) return { razonMaxima: 1.5, suavizado: true }
  return { razonMaxima: 1, suavizado: false }
}

/**
 * La razón de píxeles con que se dibuja: la de la pantalla, sin pasar de la que pide la calidad ni de lo que cabe en
 * `PIXELES_MAXIMOS_DEL_LIENZO`. Un lienzo ancho en una pantalla de alta densidad llegaba a 12 millones de píxeles solo con el color.
 */
export function razonDePixeles(densidadDePantalla: number, ancho: number, alto: number, razonMaxima: number): number {
  const area = Math.max(1, ancho * alto)
  const porMemoria = Math.sqrt(PIXELES_MAXIMOS_DEL_LIENZO / area)
  return Math.max(0.5, Math.min(densidadDePantalla, razonMaxima, porMemoria))
}

export type EstadoDelContexto =
  | { fase: 'vivo' }
  | { fase: 'perdido'; desde: number }
  | { fase: 'recuperado'; en: number }

export const CONTEXTO_VIVO: EstadoDelContexto = { fase: 'vivo' }

/** El navegador quitó el contexto. Perderlo dos veces seguidas no reinicia la cuenta de la espera. */
export function alPerderse(estado: EstadoDelContexto, ahora: number): EstadoDelContexto {
  return estado.fase === 'perdido' ? estado : { fase: 'perdido', desde: ahora }
}

/** El navegador devolvió el contexto. Si nunca se había perdido, no hay nada que recuperar. */
export function alRestaurarse(estado: EstadoDelContexto, ahora: number): EstadoDelContexto {
  return estado.fase === 'perdido' ? { fase: 'recuperado', en: ahora } : estado
}

/** El aviso de «recuperado» se queda un rato a la vista y luego se va. */
export const TIEMPO_DEL_AVISO_DE_RECUPERADO_MS = 4000

export interface LoQueSeEnseña {
  /** El texto sobre el lienzo, o `null` si no hay nada que decir. */
  mensaje: string | null
  /** Si hay que ofrecer el botón de volver a montar el lienzo. */
  ofrecerRecuperar: boolean
  /** Una región viva anuncia el cambio; una alerta, solo lo que no se arregla solo. */
  urgente: boolean
}

export function loQueSeEnseña(estado: EstadoDelContexto, ahora: number): LoQueSeEnseña {
  if (estado.fase === 'perdido') {
    const esperado = ahora - estado.desde
    if (esperado >= ESPERA_ANTES_DE_OFRECER_MS) {
      return {
        mensaje:
          'La imagen se detuvo y el navegador no la ha devuelto. Pulse «Recuperar la vista» —si no, se vuelve a montar sola en unos segundos—: el caso, los pasos y el puntaje se quedan como están.',
        ofrecerRecuperar: true,
        urgente: true,
      }
    }
    return { mensaje: 'La imagen se detuvo; se está recuperando…', ofrecerRecuperar: false, urgente: false }
  }
  if (estado.fase === 'recuperado' && ahora - estado.en < TIEMPO_DEL_AVISO_DE_RECUPERADO_MS) {
    return { mensaje: 'La imagen volvió.', ofrecerRecuperar: false, urgente: false }
  }
  return { mensaje: null, ofrecerRecuperar: false, urgente: false }
}

/**
 * Dice **una vez por etapa** que algo falló al dibujar.
 *
 * El bucle de dibujo corre sesenta veces por segundo: una excepción que se repite en cada cuadro llenaría la
 * consola y taparía la causa. Se avisa de la primera de cada etapa y se cuenta el resto; `repeticiones` dice
 * cuántas hubo para quien lo mire después.
 */
export function crearLimitadorDeFallos() {
  const vistos = new Map<string, number>()
  return {
    /** Devuelve `true` solo la primera vez que falla esa etapa. */
    registrar(etapa: string): boolean {
      const antes = vistos.get(etapa) ?? 0
      vistos.set(etapa, antes + 1)
      return antes === 0
    },
    repeticiones: (etapa: string) => vistos.get(etapa) ?? 0,
    etapas: () => [...vistos.keys()],
    reiniciar: () => vistos.clear(),
  }
}
