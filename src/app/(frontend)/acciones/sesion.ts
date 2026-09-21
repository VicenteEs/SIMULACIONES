'use server'

/**
 * Entrada, salida y recuperación de contraseña, con pantallas propias.
 *
 * Payload trae las suyas en `/admin`, pero la plataforma no las usa: quien
 * entra aquí ve la misma tipografía y el mismo lenguaje que en el resto del
 * sitio, y no una interfaz distinta con otro idioma a medias.
 *
 * La comprobación de la contraseña, la firma del testigo y el bloqueo tras
 * cinco intentos siguen siendo de Payload —eso no se reescribe a mano—; lo
 * propio es la cáscara.
 */

import { cookies, headers } from 'next/headers'
import { getPayload, LockedAuth } from 'payload'
import config from '@payload-config'
import {
  CuentaDesactivada,
  direccionPublica,
  enlaceDeClave,
  MENSAJE_CUENTA_DESACTIVADA,
  MINUTOS_DE_BLOQUEO,
} from '@/collections/Usuarios'
import { enviarSinEsperar, hayCorreo } from '@/correo/enviar'
import {
  mensajeDeClaveNueva,
  mensajeDeCuentaYaExistente,
  mensajeDeNuevaSolicitud,
  mensajeDeSolicitudRecibida,
} from '@/correo/mensajes'
import { accion, type Respuesta } from '@/lib/guardias'
import { PATH_DE_LAS_COOKIES } from '@/lib/pathDeLasCookies'
import { crearLimitador, direccionDeQuienLlama } from '@/lib/ritmo'
import { exigirContrasena, exigirCorreo, exigirTexto } from '@/lib/validacion'
import { COOKIE_VISTA_PREVIA } from '@/lib/vistaPrevia'

/**
 * Nombre con el que Payload firma y lee la sesión: `<cookiePrefix>-token`.
 *
 * Se le pregunta a la configuración en lugar de escribirlo aquí porque el
 * nombre es la única salida al choque que se describe más abajo —la cookie que
 * las sesiones antiguas dejaron en `/`—, y tenía que poder moverse solo. Ya se
 * movió: `payload.config.ts` declara `cookiePrefix: 'traumahub'`, de modo que
 * Payload firma `traumahub-token`
 * (`auth/cookies.js` arma el nombre así) y lo busca con ese mismo nombre
 * (`auth/extractJWT.js`). Si aquí hubiera quedado escrito a mano el anterior,
 * esta acción escribiría una cookie que nadie lee: entrar respondería «exito» y
 * la plataforma seguiría cerrada, sin un error en ninguna parte. Y por eso
 * tampoco conviene escribir ahora el nuevo a mano: el siguiente cambio de
 * prefijo volvería a abrir ese mismo fallo mudo.
 *
 * El `?? 'payload'` es el mismo valor por omisión que pone `buildConfig`
 * cuando nadie declara el prefijo (`config/defaults.js`), y hace falta porque
 * las pruebas sustituyen el módulo de configuración por un objeto vacío.
 */
async function nombreDeLaCookieDeSesion(): Promise<string> {
  const { cookiePrefix } = await config
  return `${cookiePrefix ?? 'payload'}-token`
}

/**
 * Opciones de la cookie de sesión, y el cabo que dejó mudarla de `/` al prefijo.
 *
 * El path de las dos cookies de la plataforma sale de `PATH_DE_LAS_COOKIES`
 * (`src/lib/pathDeLasCookies.ts`, que explica por qué es el prefijo). Lo que
 * queda aquí es lo que pasó al mudarlas, porque es el motivo de que la cookie
 * de sesión se llame como se llama.
 *
 * La cookie que las sesiones anteriores a la mudanza dejaron en `/` sigue viva
 * hasta que caduque, y es **ella** la que manda: el navegador manda primero la
 * del path más específico (RFC 6265 §5.4) y `parseCookies` de Payload arma un
 * Map con un `set(nombre, valor)` por cada par, de modo que gana el último, o
 * sea el viejo de `/`. Mientras esa cookie exista, la del prefijo no se lee
 * nunca, y eso no es solo que «salir» no cierre:
 *
 *  - `entrar()` tampoco cambia de sesión. Escribe el testigo nuevo en el
 *    prefijo, el viejo de `/` lo sigue pisando, y quien entra con OTRA cuenta
 *    queda autenticado como el usuario anterior. En una estación compartida de
 *    hospital eso no es una molestia: es una anotación firmada por quien no la
 *    hizo.
 *  - Si el testigo viejo deja de verificar sin que su cookie muera con él
 *    —el caso real es rotar `PAYLOAD_SECRET`—, `entrar()` responde «exito» y
 *    la plataforma sigue cerrada, sin un mensaje, hasta que esa cookie alcance
 *    su propio `maxAge`. Por eso rotar el secreto NO sirve como limpieza: deja
 *    a todo el mundo fuera durante esas ocho horas, y por este mismo motivo.
 *    (Cuando el testigo caduca por su cuenta no ocurre: `tokenExpiration` en
 *    `Usuarios.ts` y el `maxAge` de aquí abajo son las mismas ocho horas y se
 *    apagan juntos.)
 *
 * Desde aquí no se puede borrar: `cookies()` guarda **una sola escritura por
 * nombre** (`ResponseCookies._parsed` es un Map indexado por nombre, y `set`
 * vuelve a escribir la cabecera entera desde él), así que un `delete` en `/` y
 * un `set` en el prefijo no caben en la misma respuesta: el segundo pisa al
 * primero. Y borrar en `/` en lugar de en el prefijo solo cambia a quién le
 * toca el fallo, porque entonces las sesiones nuevas son las que no se cierran.
 *
 * La salida es el NOMBRE, no el path, y **ya está puesta**:
 * `payload.config.ts` declara `cookiePrefix: 'traumahub'`, así que Payload
 * firma y lee `traumahub-token`, la cookie vieja se vuelve invisible para todos
 * y se muere sola sin estorbar a nadie. `nombreDeLaCookieDeSesion()` lo sigue,
 * de modo que aquí no hubo que tocar nada. Los dos puntos de arriba quedan
 * cerrados en el servidor en cuanto se despliegue ese cambio; quedan escritos
 * porque son el motivo de que la cookie se llame así y de que volver al nombre
 * de omisión los reabra a los dos. El precio se paga una vez: al desplegar ese
 * cambio, las sesiones abiertas dejan de valer y hay que volver a entrar.
 *
 * La de vista previa arrastra el mismo cabo —la que quedó en `/` gana mientras
 * viva—, pero corto: cuatro horas de `maxAge` y solo puede rebajar el rol. No
 * merece cambiarle el nombre, que es lo que haría falta para cortarlo.
 *
 * Un último detalle que había que respetar aunque el prefijo se pusiera: quien
 * se autentique por la API REST de Payload vuelve a crear el choque, porque
 * `generatePayloadCookie` escribe siempre con `path: '/'`, sin mirar esto. Esa
 * puerta también está cerrada —`POST /api/usuarios/login` contesta 403 en
 * `(payload)/api/[...slug]/route.ts`—, así que la plataforma entra por estas
 * acciones y solo por ellas. Reabrir ese extremo sin cambiar antes lo que
 * escribe `generatePayloadCookie` devuelve el choque entero.
 */
const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: PATH_DE_LAS_COOKIES,
}

const DIEZ_MINUTOS = 10 * 60 * 1000

/**
 * El freno de la entrada por dirección, que es el que le faltaba al bloqueo de
 * Payload.
 *
 * `maxLoginAttempts` cuenta por **cuenta**: para cinco fallos contra un correo,
 * y no ve a quien prueba una sola contraseña corriente contra cien correos, que
 * nunca llega a cinco en ninguno. Este cuenta por quien llama. Treinta en diez
 * minutos no los gasta un servicio entero entrando a primera hora desde la
 * misma salida a internet del hospital, y a un guion lo deja en tres intentos
 * por minuto. Cuenta también las entradas buenas a propósito: distinguirlas
 * obligaría a anotar después de comprobar la contraseña, y el intento que hay
 * que frenar es justo el que todavía no se sabe si es bueno.
 *
 * `X-Forwarded-For` se puede falsear llegando directo al puerto
 * (`src/lib/ritmo.ts`); detrás del proxy, que es como está desplegada, no. Y el
 * bloqueo por cuenta sigue debajo, que no depende de quién dice ser nadie.
 */
const LIMITE_DE_ENTRADAS = crearLimitador('entrar:direccion', { maximo: 30, ventanaMs: DIEZ_MINUTOS })

export async function entrar(
  correo: unknown,
  contrasena: unknown,
): Promise<Respuesta<{ destino: string }>> {
  return accion(async () => {
    if (typeof contrasena !== 'string' || contrasena.length === 0) {
      throw new Error('Escriba su contraseña.')
    }
    // El mismo techo que `exigirContrasena`: ninguna contraseña válida lo pasa,
    // y sin él cada intento puede traer hasta el límite de cuerpo de las
    // acciones para que el servidor lo resuma.
    if (contrasena.length > 200) throw new Error('Correo o contraseña incorrectos.')

    if (!LIMITE_DE_ENTRADAS.permitir(direccionDeQuienLlama(await headers()))) {
      throw new Error(
        'Demasiados intentos de entrada desde esta conexión. Espere unos minutos y vuelva a intentarlo.',
      )
    }

    const payload = await getPayload({ config })

    let resultado: { token?: string; user?: { activo?: unknown; rol?: unknown } }
    try {
      resultado = await payload.login({
        collection: 'usuarios',
        data: { email: exigirCorreo(correo), password: contrasena },
      })
    } catch (fallo) {
      // La cuenta bloqueada se dice, y no se disfraza de contraseña mala.
      //
      // Antes todo fallo salía como «Correo o contraseña incorrectos», de modo
      // que quien se equivocaba cinco veces y luego escribía la contraseña
      // correcta seguía viendo el mismo mensaje: la plataforma le decía que su
      // contraseña estaba mal cuando estaba bien, sin una sola pista de que
      // bastaba con esperar. Es el momento exacto en que alguien deja de
      // intentarlo o escribe pidiendo ayuda.
      //
      // Sí, admitirlo revela que la cuenta existe, pero solo a quien ya ha
      // fallado cinco veces contra ese correo. En una plataforma cerrada, donde
      // toda cuenta —creada en el panel o pedida en `/registro`— pasa por un
      // administrador, eso vale mucho menos que dejar a un residente fuera
      // creyéndose la contraseña equivocada.
      if (fallo instanceof LockedAuth) {
        throw new Error(
          `Demasiados intentos fallidos: la cuenta quedó bloqueada durante ${MINUTOS_DE_BLOQUEO} ` +
            'minutos. Espere y vuelva a intentarlo, o pida a un administrador que la desbloquee.',
        )
      }
      // La cuenta sin activar la rechaza ahora el gancho `beforeLogin` de la
      // colección, que es lo que cierra también `POST /api/usuarios/login`. Se
      // reconoce por la clase y no por el texto —comparar frases se rompe en
      // silencio en cuanto alguien reescribe una— y el mensaje se vuelve a
      // lanzar como `Error` normal porque lo que llega al panel es
      // `error.message`: un `APIError` viajando hasta aquí no aporta nada y sí
      // arrastra su `status`, que en una acción de servidor no significa nada.
      if (fallo instanceof CuentaDesactivada) {
        throw new Error(MENSAJE_CUENTA_DESACTIVADA)
      }
      // Para el resto, un mensaje único para «no existe» y «contraseña
      // incorrecta»: decir cuál de las dos falla convierte el formulario en un
      // comprobador de correos.
      throw new Error('Correo o contraseña incorrectos.')
    }

    if (!resultado.token) throw new Error('No se pudo iniciar la sesión.')

    // Segunda cerradura, y a sabiendas de que hoy no llega a girar: el gancho
    // `beforeLogin` lanza antes y `payload.login` ni devuelve. Se conserva
    // porque cuesta una comparación y cubre el día que alguien retire el gancho
    // —quitarlo reabriría `POST /api/usuarios/login`, pero al menos la pantalla
    // propia seguiría cerrada— y porque el mensaje sale del mismo sitio, así
    // que las dos capas no pueden discrepar.
    if (resultado.user?.activo !== true) {
      throw new Error(MENSAJE_CUENTA_DESACTIVADA)
    }

    const almacen = await cookies()
    almacen.set(await nombreDeLaCookieDeSesion(), resultado.token, {
      ...OPCIONES_COOKIE,
      maxAge: 8 * 60 * 60,
    })
    // Una sesión nueva empieza siempre con el rol real, nunca simulando otro.
    // Con el path con el que la escribe su ruta, que sale del mismo módulo: sin
    // él, `delete` caduca una cookie de la raíz que ya no es la nuestra y la
    // simulación sobrevive.
    almacen.delete({ name: COOKIE_VISTA_PREVIA, path: PATH_DE_LAS_COOKIES })

    return { destino: resultado.user?.rol === 'admin' ? '/admin-panel' : '/' }
  })
}

/**
 * Da de baja en la base la sesión con la que llega esta petición.
 *
 * Borrar la cookie cierra la sesión **en ese navegador** y en ningún otro
 * sitio: el testigo seguía verificando ocho horas para quien lo hubiera copiado
 * antes —de una estación compartida del hospital, de un registro de proxy—, y
 * «salir» no le quitaba nada. Payload guarda cada sesión en la fila de la
 * cuenta (`usuarios_sessions`) y su estrategia JWT rechaza el testigo cuyo
 * `sid` ya no esté ahí; es lo que hace su propio `logout`
 * (`auth/operations/logout.js`), que aquí no se puede llamar porque solo existe
 * como extremo REST, cerrado en `(payload)/api/[...slug]/route.ts`. Se quita
 * solo esta sesión y no todas: salir en el computador del pabellón no tiene por
 * qué cerrar la del teléfono.
 *
 * Nunca lanza. Si la base no contesta, la cookie se borra igual, que es lo que
 * la persona ve y lo que había antes; el fallo queda en el registro.
 */
async function revocarLaSesionActual(): Promise<void> {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: await headers() })
    const sid = (user as { _sid?: unknown } | null)?._sid
    if (!user || typeof sid !== 'string') return

    const cuenta = await payload.findByID({
      collection: 'usuarios',
      id: user.id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    const ahora = Date.now()
    const vigentes = (cuenta.sessions ?? []).filter(
      (sesion) => sesion.id !== sid && new Date(sesion.expiresAt).getTime() > ahora,
    )
    await payload.update({
      collection: 'usuarios',
      id: user.id,
      data: { sessions: vigentes },
      overrideAccess: true,
    })
  } catch (fallo) {
    console.error('[sesion] no se pudo dar de baja la sesión al salir:', fallo)
  }
}

export async function salir(): Promise<Respuesta> {
  return accion(async () => {
    await revocarLaSesionActual()
    const almacen = await cookies()
    // El borrado lleva el mismo path con el que se escribió. Sin él, `delete`
    // caduca una cookie de path `/` —el que Next pone por omisión— que ya no es
    // la nuestra, y la sesión seguiría abierta después de pulsar «salir».
    almacen.delete({ name: await nombreDeLaCookieDeSesion(), path: PATH_DE_LAS_COOKIES })
    // La de vista previa, en el mismo path con el que la escribe su ruta. Ver
    // `src/lib/pathDeLasCookies.ts`.
    almacen.delete({ name: COOKIE_VISTA_PREVIA, path: PATH_DE_LAS_COOKIES })
    return null
  })
}

/**
 * Pide un enlace para elegir contraseña nueva.
 *
 * Responde lo mismo exista o no la cuenta. Decir «ese correo no está
 * registrado» permitiría averiguar quién tiene acceso a la plataforma probando
 * direcciones, que es justo lo que el acceso cerrado pretende evitar.
 *
 * El correo ya no lo manda Payload. Se le pide solo el testigo, siempre con
 * `disableEmail`, y el mensaje sale por `enviarSinEsperar` con la plantilla de
 * la plataforma y el logotipo adjunto dentro (D-118): el envío propio de
 * `forgotPassword` no admite adjuntos, así que el logotipo tenía que ir por
 * dirección pública y la mitad de los buzones lo bloquean hasta que alguien
 * pulsa «mostrar imágenes». Y sin esperar a propósito: lo que tarde el servidor
 * de cPanel en aceptar el mensaje no puede notarse en la respuesta, porque una
 * respuesta que tarda más cuando la cuenta existe vuelve a delatar quién la
 * tiene.
 */
export async function pedirEnlaceDeClave(correo: unknown): Promise<Respuesta> {
  return accion(async () => {
    const payload = await getPayload({ config })

    // Sin servidor de correo, o sin dirección pública con la que armar el
    // botón, el testigo no llegaría a nadie: no se pide. Pedirlo igual no es
    // inocuo, porque cada `forgotPassword` invalida el anterior, y en una
    // instalación sin SMTP el anterior es justo el enlace que un administrador
    // generó en el panel y entregó a mano (`generarEnlaceDeClave`). Bastaba con
    // que el residente, por si acaso, probara también esta pantalla —o con que
    // cualquiera escribiera aquí su dirección— para dejarle muerto el único
    // camino que tenía, y sin un mensaje que lo explicara.
    if (!hayCorreo()) return null
    if (!direccionPublica()) {
      // Con SMTP puesto sí es un fallo de configuración, y tiene que dejar
      // rastro: sin `NEXT_PUBLIC_SERVER_URL` el enlace saldría como
      // `/clave/<testigo>`, la plantilla lo descarta por no ser http y el
      // correo llegaría con un botón que no existe.
      payload.logger.error({
        msg: 'No se envió el enlace de clave nueva: falta NEXT_PUBLIC_SERVER_URL para armarlo',
      })
      return null
    }

    try {
      // Dentro del `try`, como estaba: una dirección mal escrita recibe la
      // misma respuesta que todas, y el formulario no distingue casos.
      const email = exigirCorreo(correo)
      // Los tres frenos, y callados: ver `LIMITE_DE_CLAVE_POR_CORREO`. Por
      // dirección primero, para que quien abusa desde una sola gaste su cupo y
      // no el de todos.
      const direccion = direccionDeQuienLlama(await headers())
      if (
        !LIMITE_DE_CLAVE_POR_DIRECCION.permitir(direccion) ||
        !LIMITE_DE_CLAVE_POR_CORREO.permitir(email) ||
        !LIMITE_DE_CLAVE_GLOBAL.permitir('todas')
      ) {
        payload.logger.warn({
          msg: 'Se descartó una petición de enlace de clave nueva por exceso de ritmo',
        })
        return null
      }
      const testigo = await payload.forgotPassword({
        collection: 'usuarios',
        data: { email },
        disableEmail: true,
      })
      // Sin testigo no hay cuenta con ese correo. No se avisa a nadie y la
      // respuesta es la misma: el buzón de una dirección que no está
      // registrada no tiene por qué enterarse de que alguien la probó.
      if (testigo) {
        enviarSinEsperar(
          payload,
          { para: email, correo: mensajeDeClaveNueva(enlaceDeClave(testigo)) },
          'enlace de clave nueva',
        )
      }
    } catch (fallo) {
      // La respuesta sigue siendo la misma exista o no la cuenta —eso es lo que
      // hay que conservar—, pero el fallo no puede quedar sin rastro en ninguna
      // parte. El del transporte ya lo anota `enviarSinEsperar`; aquí queda el
      // de emitir el testigo, que con la base caída es indistinguible de una
      // dirección que no existe: el residente lee «si esa dirección corresponde
      // a una cuenta, le llegará un enlace», no le llega nada, y
      // `/admin-panel/sistema` sigue diciendo «Correo saliente: ok» porque solo
      // mira si la variable de entorno está puesta.
      payload.logger.error({ msg: 'No se pudo emitir el enlace de clave nueva', err: fallo })
    }
    return null
  })
}

const UNA_HORA = 60 * 60 * 1000

/**
 * Los tres frenos de `pedirEnlaceDeClave`, que no tenía ninguno.
 *
 * Es una acción sin sesión que manda correo y que, además, **invalida** algo:
 * cada `forgotPassword` mata el testigo anterior. Sin freno, un guion con la
 * dirección de un residente le llenaba el buzón de «elija una contraseña
 * nueva», le dejaba muerto cada enlace antes de que llegara a pulsarlo —no
 * podía recuperar la cuenta mientras durase— y quemaba la cuota por hora de
 * cPanel, que comparten todos los avisos de la plataforma.
 *
 * Tres por correo y hora sobran para quien no encuentra el mensaje y vuelve a
 * pedirlo. Cinco por dirección y treinta en total son los mismos números de la
 * solicitud de cuenta de aquí abajo, y por los mismos motivos.
 *
 * El rechazo es **mudo**: la acción contesta lo mismo que siempre. Un mensaje
 * de «demasiadas peticiones para ese correo» solo aparecería con correos que
 * tienen cuenta si se contara después de mirar la base, y por eso se cuenta
 * antes; pero incluso contado antes, callar es lo que mantiene una sola
 * respuesta posible para esta pantalla. Queda en el registro del servidor.
 */
const LIMITE_DE_CLAVE_POR_DIRECCION = crearLimitador('clave-nueva:direccion', {
  maximo: 5,
  ventanaMs: UNA_HORA,
})
const LIMITE_DE_CLAVE_POR_CORREO = crearLimitador('clave-nueva:correo', { maximo: 3, ventanaMs: UNA_HORA })
const LIMITE_DE_CLAVE_GLOBAL = crearLimitador('clave-nueva:global', { maximo: 30, ventanaMs: UNA_HORA })

/**
 * Los dos frenos de la solicitud de cuenta. El porqué de tenerlos está en
 * `src/lib/ritmo.ts`; aquí, el de los números.
 *
 * Cinco por dirección cubre a quien se equivoca y vuelve a intentarlo, y a un
 * servicio entero pidiendo cuenta desde la misma salida a internet del
 * hospital. Treinta en total es más de lo que la plataforma ha recibido nunca
 * en un día y menos de lo que agota la cuota por hora de cPanel, que comparten
 * estos avisos con la recuperación de contraseña. El global existe porque el
 * primero se burla cambiando `X-Forwarded-For` en cada llamada.
 */
const LIMITE_POR_DIRECCION = crearLimitador('solicitud-de-cuenta:direccion', {
  maximo: 5,
  ventanaMs: UNA_HORA,
})
const LIMITE_GLOBAL = crearLimitador('solicitud-de-cuenta:global', { maximo: 30, ventanaMs: UNA_HORA })

/**
 * Lo que un nombre o una institución no pueden traer: algo que un cliente de
 * correo convierta en enlace, o un salto de línea.
 *
 * El nombre acaba en el saludo del acuse, que sale desde el buzón real de la
 * plataforma hacia la dirección que la persona escribió, sea suya o no. La
 * plantilla enlaza las direcciones `https://` de los párrafos y convierte los
 * saltos en `<br>`, de modo que sin esto `solicitarCuenta` era un servicio
 * público para mandar, firmado con el dominio de la plataforma, «Hola, su clave
 * vence hoy, renuévela en https://…» a cualquiera. Treinta por hora bastan para
 * quemar la reputación de la cuenta de cPanel, y con ella la recuperación de
 * contraseña de todos.
 *
 * Se rechaza aquí y no solo se escapa en la plantilla porque la plantilla no es
 * el único que enlaza: Gmail y Outlook convierten en enlace un `www.` o un
 * dominio suelto por su cuenta, también en la parte de texto plano. Por eso
 * entran los dominios sin esquema, con dos límites a sabiendas. Uno con ruta se
 * detecta en cualquier caja («EVIL.CL/entrar», «t.co/x»). Uno suelto, solo en
 * minúsculas, porque en mayúsculas choca con las abreviaturas sin espacio que
 * se escriben de verdad en este gremio («Dra.Soto», «U.Chile») y un residente
 * rechazado por escribir su nombre es peor que un «EVIL.COM» que casi ningún
 * buzón pinta como enlace. El mensaje dice cómo salir del falso positivo que
 * queda («dra.soto» en minúsculas).
 *
 * El motivo no pasa por aquí: va en un bloque `cita`, que se escapa sin
 * enlazar, y solo lo leen los administradores.
 */
const PARECE_ENLACE = new RegExp(
  [
    String.raw`\p{Cc}`,
    String.raw`:\/\/`,
    String.raw`[wW]{3}\.`,
    '@',
    String.raw`[\p{L}\p{N}-]\.\p{L}{2,}\/`,
    String.raw`[a-z0-9-]\.[a-z]{2,24}(?![\p{L}\p{N}])`,
  ].join('|'),
  'u',
)

function exigirSinEnlaces(texto: string, que: string): string {
  if (PARECE_ENLACE.test(texto)) {
    throw new Error(
      `${que} no puede llevar direcciones web, correos ni saltos de línea. ` +
        'Si abrevia, deje un espacio después del punto.',
    )
  }
  return texto
}

/**
 * Lo mínimo que tarda en contestar una solicitud que llegó a mirar la base, o
 * que cayó en el campo trampa y tiene que parecer una que sí llegó.
 *
 * Crear la cuenta cuesta el `pbkdf2` de la contraseña —25 000 iteraciones, unos
 * 70 ms en el equipo de desarrollo y más en el servidor—, la escritura, sus
 * ganchos y la búsqueda de administradores; responder a un correo que ya existe
 * cuesta una consulta. Con la misma respuesta pero no el mismo tiempo, el
 * cronómetro volvía a decir quién tiene cuenta, que es lo que la respuesta
 * idéntica pretende callar. Calcular un hash de relleno en el camino corto no
 * alcanza: iguala el `pbkdf2`, pero no la escritura ni los ganchos, que cambian
 * con la carga de la base.
 *
 * Un suelo de segundo y medio sobra para todo eso con margen, y a una persona
 * que acaba de rellenar seis campos no le pesa. Si algún día crear pasa de ese
 * tiempo, la diferencia reaparece: se sube el suelo, no se quita.
 */
const DEMORA_MINIMA_MS = 1500

/**
 * Pide una cuenta desde `/registro` (D-119).
 *
 * Es la primera acción que cualquiera puede llamar sin cuenta y que escribe en
 * la base, así que todo lo que decide lo decide aquí y nada viene de `datos`
 * salvo lo que la persona escribe: la cuenta nace lectora, desactivada y
 * pendiente aunque la llamada traiga `rol: 'admin'`. Las acciones de servidor se
 * invocan por HTTP con los argumentos que se quiera; el formulario no es una
 * barrera.
 *
 * La respuesta es la misma se cree la cuenta, exista ya o la haya rellenado un
 * robot, y tarda lo mismo. Cualquier diferencia —un mensaje, un error, un aviso
 * distinto, un cronómetro— la convierte en un comprobador de quién tiene acceso
 * a la plataforma.
 */
export async function solicitarCuenta(datos: unknown): Promise<Respuesta<null>> {
  return accion(async () => {
    const inicio = Date.now()
    const bruto = (typeof datos === 'object' && datos !== null ? datos : {}) as Record<string, unknown>

    // El campo trampa: una persona no lo ve y un robot que rellena todo lo que
    // encuentra, sí. Se le contesta que todo fue bien para que no aprenda a
    // saltárselo —y en el mismo tiempo, o el cronómetro se lo enseña—, y antes
    // del límite de ritmo para que no gaste el cupo de las personas de verdad.
    if (typeof bruto.sitioWeb === 'string' ? bruto.sitioWeb.trim() !== '' : bruto.sitioWeb != null) {
      await esperarElSuelo(inicio)
      return null
    }

    // Antes de validar y a sabiendas: un intento con el formulario mal relleno
    // también cuesta un hueco. Frenar solo los válidos dejaría sin freno al
    // guion que manda basura, que no escribe en la base pero sí ocupa el
    // proceso. El formulario ya exige en el navegador casi todo lo que se
    // comprueba aquí, así que a una persona no le cuesta huecos equivocarse.
    const direccion = direccionDeQuienLlama(await headers())
    if (!LIMITE_POR_DIRECCION.permitir(direccion) || !LIMITE_GLOBAL.permitir('todas')) {
      throw new Error(
        'Se recibieron demasiadas solicitudes en poco tiempo. Espere una hora y vuelva a intentarlo.',
      )
    }

    const nombre = exigirSinEnlaces(exigirTexto(bruto.nombre, 'El nombre', 120), 'El nombre')
    const email = exigirCorreo(bruto.correo)
    const institucion = exigirSinEnlaces(
      exigirTexto(bruto.institucion, 'La institución o el servicio', 160),
      'La institución o el servicio',
    )
    // Opcional y recortado en lugar de rechazado: el `maxLength` del formulario
    // ya lo impide a una persona, y a quien llama sin formulario no le debemos
    // un mensaje.
    const motivo = typeof bruto.motivo === 'string' ? bruto.motivo.trim().slice(0, 1000) : ''
    const password = exigirContrasena(bruto.contrasena)

    const payload = await getPayload({ config })

    // Sin ninguna cuenta, `ajustarPrimerUsuario` convierte a la que se cree en
    // administradora activa, pase lo que pase en `data`. Dejar pasar esta
    // solicitud sería regalar la plataforma a quien llegue antes que el dueño
    // a una instalación recién desplegada: la primera cuenta sale de
    // `/instalar` y solo de ahí.
    const { totalDocs } = await payload.count({ collection: 'usuarios', overrideAccess: true })
    if (totalDocs === 0) throw new Error('La plataforma todavía no está instalada.')

    // Desde aquí cada camino dice algo distinto sobre la base, así que todos
    // esperan al mismo suelo, también el que termina en error. Los rechazos de
    // arriba no esperan: no saben nada de ninguna cuenta, y a quien se equivocó
    // en un campo no hay por qué hacerle esperar para corregirlo.
    try {
      return await registrarSolicitud(payload, { nombre, email, institucion, motivo, password })
    } finally {
      await esperarElSuelo(inicio)
    }
  })
}

/** Espera lo que falte para `DEMORA_MINIMA_MS` desde `inicio`. */
async function esperarElSuelo(inicio: number): Promise<void> {
  const falta = inicio + DEMORA_MINIMA_MS - Date.now()
  if (falta > 0) await new Promise((listo) => setTimeout(listo, falta))
}

/** La parte de `solicitarCuenta` que ya habla con la base; se llama solo desde ahí. */
async function registrarSolicitud(
  payload: Awaited<ReturnType<typeof getPayload>>,
  {
    nombre,
    email,
    institucion,
    motivo,
    password,
  }: { nombre: string; email: string; institucion: string; motivo: string; password: string },
): Promise<null> {
  const base = direccionPublica()
  // Con SMTP y sin dirección pública, el aviso al titular hablaría de «/clave»
  // sin botón y el de los administradores llegaría sin «Revisar la solicitud»,
  // todo sin rastro. `pedirEnlaceDeClave` anota el mismo fallo de
  // configuración, y las dos acciones de este archivo no pueden tratarlo
  // distinto: una lo delataría y la otra lo escondería.
  if (hayCorreo() && !base) {
    payload.logger.error({
      msg: 'Solicitud de cuenta sin NEXT_PUBLIC_SERVER_URL: los avisos que llevan enlace no salen o salen sin botón',
    })
  }

  const existente = await payload.find({
    collection: 'usuarios',
    where: { email: { equals: email } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const cuenta = existente.docs[0]
  if (cuenta) {
    // La verdad se le dice al titular en su buzón, que es lo único que un
    // curioso con la dirección ajena no puede leer.
    if (cuenta.pendiente) {
      // Quien vuelve a pedir la cuenta mientras espera no tiene «ya una cuenta
      // con la que entrar»: tiene una solicitud sin revisar, y si entra, la
      // plataforma le dice que no está activada. Se le repite el acuse, con el
      // nombre que quedó guardado y no con el de esta llamada, que puede ser de
      // cualquiera. A los administradores no se les vuelve a avisar: la barra
      // del panel ya la cuenta entre las pendientes.
      enviarSinEsperar(
        payload,
        { para: email, correo: mensajeDeSolicitudRecibida({ nombre: cuenta.nombre }) },
        'acuse repetido de una solicitud todavía pendiente',
      )
    } else if (base) {
      // Sin dirección pública este aviso no tiene nada que ofrecer —es entero
      // un par de enlaces— y ya quedó anotado arriba.
      enviarSinEsperar(
        payload,
        {
          para: email,
          correo: mensajeDeCuentaYaExistente({
            enlaceEntrar: `${base}/entrar`,
            enlaceClave: `${base}/clave`,
          }),
        },
        'aviso de solicitud sobre una cuenta que ya existe',
      )
    }
    return null
  }

  try {
    await payload.create({
      collection: 'usuarios',
      data: {
        email,
        nombre,
        institucion,
        password,
        rol: 'lector',
        activo: false,
        origen: 'solicitud',
        pendiente: true,
        motivoDeSolicitud: motivo || undefined,
        solicitadaEn: new Date().toISOString(),
      },
      overrideAccess: true,
    })
  } catch (fallo) {
    // Entre el `find` de arriba y esta escritura cabe otra solicitud con el
    // mismo correo: el doble clic, casi siempre. La base la rechaza por el
    // índice único y no se reconoce el error por su clase ni por su texto
    // —el adaptador lo traduce distinto según la versión—, sino volviendo a
    // preguntar. Si la cuenta está, se contesta lo mismo que arriba y sin
    // avisar al titular: es la misma persona que acaba de pedirla, y un
    // «ya tiene una cuenta» junto a «recibimos su solicitud» solo confunde.
    const ahora = await payload
      .find({
        collection: 'usuarios',
        where: { email: { equals: email } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] }))
    if (ahora.docs.length > 0) return null
    payload.logger.error({ msg: 'No se pudo registrar la solicitud de cuenta', err: fallo })
    // El mensaje de Payload viaja en inglés y habla de campos; a quien pide la
    // cuenta no le sirve de nada.
    throw new Error('No se pudo registrar la solicitud. Vuelva a intentarlo en unos minutos.')
  }

  enviarSinEsperar(
    payload,
    { para: email, correo: mensajeDeSolicitudRecibida({ nombre }) },
    'acuse de solicitud de cuenta',
  )

  // Sin servidor de correo no hay a quién mandar nada y la consulta sobra. El
  // aviso de la barra del panel, que cuenta las pendientes, sigue avisando.
  if (hayCorreo()) {
    try {
      const administradores = await payload.find({
        collection: 'usuarios',
        where: { and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }] },
        depth: 0,
        limit: 10,
        overrideAccess: true,
      })
      const destinatarios = administradores.docs
        .map((admin) => admin.email)
        .filter((correoDelAdmin): correoDelAdmin is string => Boolean(correoDelAdmin))
      if (destinatarios.length > 0) {
        enviarSinEsperar(
          payload,
          {
            para: destinatarios,
            correo: mensajeDeNuevaSolicitud({
              nombre,
              correo: email,
              institucion,
              motivo,
              enlacePanel: `${base}/admin-panel/usuarios`,
            }),
          },
          'aviso de nueva solicitud a los administradores',
        )
      }
    } catch (fallo) {
      // La cuenta ya está creada: fallar aquí le diría a la persona que no se
      // registró nada y la mandaría a pedirla otra vez contra un correo que
      // ya existe.
      payload.logger.error({ msg: 'No se pudo avisar de la solicitud a los administradores', err: fallo })
    }
  }

  return null
}

export async function fijarClaveNueva(
  testigo: unknown,
  contrasena: unknown,
): Promise<Respuesta<{ destino: string }>> {
  return accion(async () => {
    if (typeof testigo !== 'string' || testigo.length < 10 || testigo.length > 200) {
      throw new Error('El enlace no es válido. Pida uno nuevo.')
    }
    // La misma regla que al crear la cuenta, techo incluido: aquí estaba
    // escrito solo el mínimo, y una regla copiada a medias es una regla distinta.
    const claveNueva = exigirContrasena(contrasena)

    const payload = await getPayload({ config })
    const resultado = await payload
      .resetPassword({
        collection: 'usuarios',
        data: { token: testigo, password: claveNueva },
        overrideAccess: true,
      })
      .catch((fallo: unknown) => {
        // La cuenta sin activar también llega por aquí, y decirle que el enlace
        // caducó es mentirle.
        //
        // `resetPassword` corre el mismo gancho `beforeLogin` de la colección
        // que `login` —lo hace justo antes de firmar el testigo, en
        // `auth/operations/resetPassword.js`—, así que desde que ese gancho
        // existe esta llamada lanza `CuentaDesactivada` con una cuenta que
        // todavía no han habilitado. Y no es un camino raro: el administrador
        // puede emitir el enlace antes de marcar la casilla, porque ni
        // `generarEnlaceDeClave` ni `forgotPassword` miran `activo`; en esta
        // instalación, sin SMTP, ese enlace es el único camino y caduca en una
        // hora.
        //
        // Tragarse el fallo aquí y contestar «el enlace caducó o ya se usó»
        // manda al residente a pedir otro enlace que fallará igual, y esconde
        // lo único que falta de verdad, que es la casilla del administrador. Lo
        // que sí es cierto es que no ha quedado contraseña nueva: el
        // `killTransaction` de ese mismo `resetPassword.js` deshace la escritura
        // junto con el vencimiento del testigo, de modo que el enlace sigue
        // sirviendo en cuanto activen la cuenta y mientras le quede su hora.
        if (fallo instanceof CuentaDesactivada) throw new Error(MENSAJE_CUENTA_DESACTIVADA)
        return null
      })

    if (!resultado?.token) {
      throw new Error('El enlace caducó o ya se usó. Pida uno nuevo.')
    }

    const almacen = await cookies()
    const cookieDeSesion = await nombreDeLaCookieDeSesion()
    almacen.set(cookieDeSesion, resultado.token, { ...OPCIONES_COOKIE, maxAge: 8 * 60 * 60 })
    return { destino: '/' }
  })
}

/**
 * Crea la primera cuenta de una instalación nueva.
 *
 * Antes, esta pantalla la ponía la interfaz de Payload. Al retirarla hubo que
 * traerla, o una instalación recién desplegada se quedaba sin ninguna forma de
 * entrar: la primera cuenta no la puede activar nadie (D-020, D-028). Tampoco
 * sirve `/registro`, que deja las cuentas esperando a un administrador que
 * todavía no existe y que por eso se niega a crear ninguna mientras la base
 * esté vacía (`solicitarCuenta`).
 *
 * La comprobación de que no exista ninguna cuenta se repite **aquí**, en el
 * servidor, y no solo en la página. Es la única barrera real: sin ella, esta
 * acción sería un extremo público para crear administradores, y bastaría con
 * llamarla desde fuera de la pantalla para tomar la plataforma.
 */
export async function crearPrimeraCuenta(
  nombre: unknown,
  correo: unknown,
  contrasena: unknown,
): Promise<Respuesta<{ destino: string }>> {
  return accion(async () => {
    const payload = await getPayload({ config })

    const { totalDocs } = await payload.count({ collection: 'usuarios', overrideAccess: true })
    if (totalDocs > 0) {
      throw new Error('La plataforma ya está instalada. Entre con su cuenta.')
    }

    const email = exigirCorreo(correo)
    // El gancho `ajustarPrimerUsuario` la marca como administradora y activa:
    // ese es el sitio donde vive esa regla, y no se repite aquí.
    await payload.create({
      collection: 'usuarios',
      data: {
        email,
        nombre: exigirTexto(nombre, 'El nombre', 120),
        password: exigirContrasena(contrasena),
        rol: 'lector',
        activo: false,
      },
      overrideAccess: true,
    })

    const entrada = await payload.login({
      collection: 'usuarios',
      data: { email, password: contrasena as string },
    })
    if (entrada.token) {
      const almacen = await cookies()
      const cookieDeSesion = await nombreDeLaCookieDeSesion()
      almacen.set(cookieDeSesion, entrada.token, { ...OPCIONES_COOKIE, maxAge: 8 * 60 * 60 })
    }

    return { destino: '/admin-panel' }
  })
}

/** ¿Está la plataforma sin instalar, es decir, sin ninguna cuenta? */
export async function faltaLaPrimeraCuenta(): Promise<boolean> {
  try {
    const payload = await getPayload({ config })
    const { totalDocs } = await payload.count({ collection: 'usuarios', overrideAccess: true })
    return totalDocs === 0
  } catch {
    // Si la base no responde no se puede afirmar que falte: mejor mandar a
    // entrar y que el error salga ahí, que ofrecer crear un administrador.
    return false
  }
}
