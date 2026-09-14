import type { Payload, Where } from 'payload'
import type { AudienciaDeDifusion } from '@/collections/Difusiones'
import type { Difusione } from '@/payload-types'
import { enviarCorreo, explicarFalloDeCorreo, type Envio } from './enviar'
import { mensajeDeDifusion, type DatosDeDifusion } from './mensajes'

/**
 * El trabajador que manda una difusión, correo a correo.
 *
 * Una difusión no se manda de golpe. El hosting de cPanel desde el que sale el
 * correo limita cuántos mensajes se envían por hora, y esa cuota es **la misma**
 * que usa la recuperación de contraseña, la solicitud de cuenta y el aviso de
 * comentarios: una difusión que la gaste entera en diez minutos deja durante el
 * resto de la hora sin enlace de clave a quien la olvidó. Por eso cada envío
 * espera su turno (`pausaEntreCorreosMs`) y la lista vive guardada en la propia
 * difusión (`pendientes`, ver `src/collections/Difusiones.ts`), no en memoria.
 *
 * Solo corre en el servidor: arrastra `enviar.ts`, que lee el logotipo del disco.
 */

/** Lo que se supone del hosting si nadie dice otra cosa. */
export const CORREOS_POR_HORA_POR_OMISION = 200

/**
 * Cuántos correos de difusión por hora, según `DIFUSION_CORREOS_POR_HORA`.
 *
 * Un valor que no es número, o menor que uno, cae al de omisión en vez de
 * lanzar: esta variable la escribe a mano quien configura el servidor, y una
 * errata no debe tumbar la pantalla de difusión ni, peor, dar una pausa de cero
 * que vacíe la cuota en un minuto. Conviene dejarla por debajo del límite real
 * del hosting, porque el resto de correos de la plataforma sale de la misma
 * cuenta.
 */
export function correosPorHora(): number {
  const valor = Number(process.env.DIFUSION_CORREOS_POR_HORA)
  return Number.isFinite(valor) && valor >= 1 ? valor : CORREOS_POR_HORA_POR_OMISION
}

/** Milisegundos entre un correo de difusión y el siguiente. */
export function pausaEntreCorreosMs(): number {
  return Math.ceil(3_600_000 / correosPorHora())
}

/**
 * Qué cuentas reciben una difusión.
 *
 * Activas, sin solicitud por revisar y, si la audiencia no es `todas`, con ese
 * rol. La solicitud se pregunta aparte aunque una cuenta pendiente nazca
 * desactivada: el día que alguien active una sin quitarle la marca, seguiría
 * sin haber pasado por la revisión, y un aviso a «todas las cuentas» no es la
 * forma de enterarse de que existe.
 *
 * `pendiente` se compara como «falso o vacío» y no como «distinto de verdadero»:
 * en SQL `pendiente <> true` descarta también las filas con `NULL`, y una base
 * de desarrollo que ajustó el esquema al vuelo deja así las cuentas de antes de
 * que el campo existiera. Serían justo las de siempre las que no recibirían nada.
 *
 * La usan el trabajador, al armar la cola, y la página, al contar cada grupo:
 * si contaran con dos filtros distintos, el «Enviar a 40 personas» del botón
 * mandaría a 38.
 */
export function condicionDeDestinatarios(audiencia: AudienciaDeDifusion): Where {
  const condiciones: Where[] = [
    { activo: { equals: true } },
    { or: [{ pendiente: { equals: false } }, { pendiente: { exists: false } }] },
  ]
  if (audiencia !== 'todas') condiciones.push({ rol: { equals: audiencia } })
  return { and: condiciones }
}

export interface Destinatario {
  id: number | string
  email: string
  nombre: string
}

/**
 * Las cuentas a las que va una difusión, en orden de identificador.
 *
 * Sin paginar: el `find` de Payload trae diez por omisión y una difusión que
 * llegara solo a las diez primeras cuentas se daría por enviada sin que nada lo
 * delatara. El orden fijo hace que la cola sea la misma si se vuelve a armar.
 */
export async function destinatariosDe(payload: Payload, audiencia: AudienciaDeDifusion): Promise<Destinatario[]> {
  const { docs } = await payload.find({
    collection: 'usuarios',
    where: condicionDeDestinatarios(audiencia),
    pagination: false,
    sort: 'id',
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((cuenta) => ({ id: cuenta.id, email: cuenta.email, nombre: cuenta.nombre ?? '' }))
}

// ------------------------------------------------------------ envíos en curso

/**
 * El conjunto de difusiones que este proceso está mandando ahora mismo.
 *
 * Cuelga de `globalThis` por la misma razón que el limitador de `ritmo.ts`:
 * Next puede cargar este módulo en más de un paquete de servidor —el de las
 * acciones y el de las páginas—, y con una variable del módulo cada copia
 * tendría su conjunto. La acción que pregunta «¿ya se está enviando?» miraría
 * uno vacío y lanzaría un segundo trabajador sobre la misma cola: cada persona
 * recibiría el correo dos veces.
 */
const LLAVE = Symbol.for('traumahub.difusionesEnCurso')

function envios(): Set<string> {
  const global = globalThis as unknown as { [LLAVE]?: Set<string> }
  global[LLAVE] ??= new Set()
  return global[LLAVE]
}

/** ¿Hay un trabajador de este proceso mandando esta difusión? */
export const enCurso = (id: number | string): boolean => envios().has(String(id))

const LLAVE_DE_RESERVA = Symbol.for('traumahub.difusionReservada')

/**
 * Aparta el turno de empezar una difusión, sin ceder el hilo entre mirar y
 * apuntar.
 *
 * «Una difusión a la vez» se comprobaba preguntando a la base si había alguna
 * enviándose y, tres esperas después —la consulta, la lista de destinatarios y
 * la creación—, lanzando el trabajador. Dos «Enviar» cruzados, desde dos
 * pestañas o dos administradores, pasaban los dos la pregunta antes de que
 * ninguno llegara a apuntarse, y salían dos trabajadores a la vez: el doble de
 * ritmo y el doble de la cuota del hosting. Esta reserva se toma y se mira en
 * la misma instrucción, así que el segundo la encuentra ocupada.
 *
 * Devuelve la función que la suelta, o `null` si ya estaba tomada. Quien la toma
 * la suelta en un `finally`: para entonces, si todo fue bien, el trabajador ya
 * está apuntado en `envios()` y es él quien bloquea al siguiente.
 */
export function reservarInicioDeDifusion(): (() => void) | null {
  const global = globalThis as unknown as { [LLAVE_DE_RESERVA]?: boolean }
  if (global[LLAVE_DE_RESERVA]) return null
  global[LLAVE_DE_RESERVA] = true
  return () => {
    global[LLAVE_DE_RESERVA] = false
  }
}

export interface DependenciasDelEnvio {
  /** Por omisión `enviarCorreo`. Se sustituye en las pruebas. */
  enviar?: (payload: Payload, envio: Envio) => Promise<void>
  /** Por omisión un `setTimeout`. Se sustituye para probar sin esperar horas. */
  dormir?: (ms: number) => Promise<void>
  /** Por omisión `pausaEntreCorreosMs()`, leída al empezar. */
  pausaMs?: number
}

/**
 * Arranca el envío de una difusión en segundo plano y vuelve enseguida.
 *
 * Devuelve si lo arrancó: `false` cuando ya había un trabajador con ese id, que
 * es la única protección contra dos «Enviar» o dos «Reanudar» seguidos. El
 * `.catch` no es opcional: una promesa suelta que falla después de que la acción
 * respondió tumba el proceso de Node por rechazo no atendido.
 *
 * ## Por qué no se reanuda sola al reiniciar el servicio
 *
 * Nada llama a esto al arrancar, a propósito. Una difusión cortada por un
 * reinicio queda con `estado: 'enviando'` y ningún trabajador, y el panel la
 * enseña como «Interrumpida» para que el administrador decida. La cola guardada
 * hace que reanudar no le vuelva a escribir a quien ya lo recibió —salvo, como
 * mucho, a la última persona, ver `procesarDifusion`—, pero la decisión de
 * volver a escribirle a cien personas no puede tomarla un servicio que quizá se
 * está reiniciando en bucle por otro fallo —el de D-061 dice «Running» sin
 * servir nada—, y que en cada vuelta sacaría otro correo de la cuota antes de
 * volver a caerse.
 */
export function lanzarDifusion(payload: Payload, id: number | string, dependencias: DependenciasDelEnvio = {}): boolean {
  const clave = String(id)
  const enMarcha = envios()
  if (enMarcha.has(clave)) return false
  enMarcha.add(clave)
  void procesarDifusion(payload, clave, dependencias)
    .catch((error: unknown) =>
      payload.logger.error({ msg: `La difusión ${clave} se cortó por un error inesperado`, err: error }),
    )
    .finally(() => enMarcha.delete(clave))
  return true
}

/**
 * Cuántos envíos fallidos seguidos detienen la difusión.
 *
 * Un fallo suelto es una dirección que ya no existe y se anota. Cinco seguidos
 * son el servidor de correo caído o la cuota del hosting agotada, y seguir
 * sería marcar como fallida, a una cada pocos segundos, a toda la lista que
 * queda: las personas no recibirían nada y reanudar ya no las incluiría. Se
 * detiene y el motivo queda en `fallos` para que el administrador vea qué pasó.
 */
export const FALLOS_SEGUIDOS_PARA_DETENER = 5

const LARGO_DEL_MOTIVO = 300

const dormirDe = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms))

/** Los ids de la cola, tal como estén guardados. Lo que no sea un id se ignora. */
function colaDe(valor: unknown): Array<number | string> {
  if (!Array.isArray(valor)) return []
  return valor.filter((id): id is number | string => typeof id === 'number' || (typeof id === 'string' && id !== ''))
}

function fallosDe(valor: unknown): Array<{ correo: string; motivo: string }> {
  if (!Array.isArray(valor)) return []
  return valor.filter(
    (f): f is { correo: string; motivo: string } =>
      typeof f === 'object' && f !== null && typeof (f as { correo?: unknown }).correo === 'string',
  )
}

function datosDe(difusion: Difusione): DatosDeDifusion {
  const texto = difusion.botonTexto?.trim()
  const enlace = difusion.botonEnlace?.trim()
  return {
    asunto: difusion.asunto,
    mensaje: difusion.mensaje,
    boton: texto && enlace ? { texto, enlace } : undefined,
  }
}

const estadoFinal = (fallidos: number): Difusione['estado'] => (fallidos > 0 ? 'con-fallos' : 'enviada')

/**
 * Lo que queda anotado de un envío fallido.
 *
 * Pasa por `explicarFalloDeCorreo`, como el correo de prueba de Sistema, y no
 * guarda el `message` de nodemailer tal cual. Por dos razones. El motivo se
 * guarda en la columna `fallos` —y con ella en cada respaldo— y se pinta en el
 * historial: si algún día el servidor repitiera la clave en su respuesta, con el
 * mensaje crudo quedaría escrita en la base; esa función, si el texto del
 * servidor la contiene, omite ese detalle entero. Y quien lo lee es el
 * administrador, al que «Invalid login: 535…» no le dice qué variable tocar y la
 * explicación sí. Se recorta después de explicar: recortar antes podría partir
 * la clave, y medio secreto ya no se reconocería para omitirlo.
 */
const motivoDe = (error: unknown): string => explicarFalloDeCorreo(error).slice(0, LARGO_DEL_MOTIVO)

/**
 * El bucle del envío. Exportado para las pruebas; el panel usa `lanzarDifusion`.
 *
 * En cada vuelta relee la difusión de la base en vez de fiarse de lo que leyó
 * al empezar: así «Detener» funciona sin canal propio —la acción cambia el
 * estado y el trabajador lo ve antes del siguiente correo— y la cola que manda
 * es siempre la guardada.
 *
 * El orden es enviar y después anotar. Si el proceso cae justo entre que el
 * servidor acepta un correo y la escritura, esa persona sigue en `pendientes`
 * y al reanudar lo recibe otra vez: una persona, como mucho. Anotar antes de
 * enviar cambiaría ese duplicado por alguien que se queda sin el aviso y sin
 * constar como fallido en ninguna parte, que es peor porque no se ve.
 *
 * La escritura de cada vuelta no toca `estado`: si lo reescribiera con el que
 * leyó al principio de la vuelta, un «Detener» pulsado mientras se mandaba el
 * correo quedaría pisado y la difusión seguiría.
 */
export async function procesarDifusion(
  payload: Payload,
  id: number | string,
  { enviar = enviarCorreo, dormir = dormirDe, pausaMs = pausaEntreCorreosMs() }: DependenciasDelEnvio = {},
): Promise<void> {
  let fallosSeguidos = 0

  for (;;) {
    const difusion = await payload.findByID({
      collection: 'difusiones',
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!difusion || difusion.estado !== 'enviando') return

    const cola = colaDe(difusion.pendientes)
    const fallos = fallosDe(difusion.fallos)
    let { total, enviados, fallidos } = difusion

    if (cola.length === 0) {
      await payload.update({
        collection: 'difusiones',
        id,
        depth: 0,
        overrideAccess: true,
        data: { estado: estadoFinal(fallidos), terminadaEn: new Date().toISOString() },
      })
      return
    }

    const [siguiente, ...resto] = cola
    const cuenta = await payload.findByID({
      collection: 'usuarios',
      id: siguiente,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })

    // La cola se armó al pulsar «Enviar», y una difusión puede tardar horas. Si
    // mientras tanto la cuenta se borró o se dio de baja, ya no es de las que
    // reciben avisos: se quita y deja de contar en el total, pero no es un
    // fallo, porque nada falló. Contarla como tal pintaría «con fallos» una
    // difusión que hizo exactamente lo que debía.
    let seIntento = false
    if (!cuenta || cuenta.activo !== true || cuenta.pendiente === true) {
      total = Math.max(0, total - 1)
    } else {
      seIntento = true
      try {
        // Un correo por persona y con su nombre, nunca la lista en `para`: con
        // varias direcciones en el mismo mensaje, cada residente vería el correo
        // de todos los demás.
        await enviar(payload, { para: cuenta.email, correo: mensajeDeDifusion(datosDe(difusion), cuenta.nombre) })
        enviados += 1
        fallosSeguidos = 0
      } catch (error) {
        // A la difusión, la explicación limpia; al registro, el error entero
        // con su código y la respuesta del servidor, por si no basta.
        payload.logger.error({ msg: `Falló un correo de la difusión ${id}`, err: error })
        fallidos += 1
        fallosSeguidos += 1
        fallos.push({ correo: cuenta.email, motivo: motivoDe(error) })
      }
    }

    const termina = resto.length === 0
    const frena = !termina && fallosSeguidos >= FALLOS_SEGUIDOS_PARA_DETENER
    await payload.update({
      collection: 'difusiones',
      id,
      depth: 0,
      overrideAccess: true,
      data: {
        pendientes: resto,
        total,
        enviados,
        fallidos,
        fallos,
        ...(termina
          ? { estado: estadoFinal(fallidos), terminadaEn: new Date().toISOString() }
          : {}),
        ...(frena ? { estado: 'detenida' as Difusione['estado'] } : {}),
      },
    })
    if (termina || frena) return

    // Solo gasta la pausa lo que gastó cuota: saltarse una cuenta dada de baja
    // no manda nada, y esperar por ella solo alargaría el envío.
    if (seIntento) await dormir(pausaMs)
  }
}
