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
  InstitucionBloqueadaAlEntrar,
  MENSAJE_CUENTA_DESACTIVADA,
  MENSAJE_INSTITUCION_BLOQUEADA,
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
import { registrarAccion } from '@/lib/registroServidor'
import { PATH_DE_LAS_COOKIES } from '@/lib/pathDeLasCookies'
import { nombreDeLaCookieDeSesion } from '@/lib/cookieDeSesion'
import { crearLimitador, direccionDeQuienLlama } from '@/lib/ritmo'
import { exigirContrasena, exigirCorreo, exigirTexto } from '@/lib/validacion'
import { esperarElSuelo, exigirSinEnlaces } from '@/lib/formularioPublico'
import { LARGOS_DE_SOLICITUD, esEtapaDeFormacion, etiquetaDeEtapa, institucionConPrograma, type EtapaDeFormacion } from '@/lib/solicitudDeCuenta'
import { VERSION_DEL_AVISO_DE_PRIVACIDAD } from '@/lib/avisoDePrivacidad'
import { COOKIE_VISTA_PREVIA } from '@/lib/vistaPrevia'
import { destinoAlEntrar } from '@/lib/bienvenida'
import { datosDeLaPeticion } from '@/lib/entradas'
import { cerrarLaEntrada } from '@/lib/entradasServidor'
import {
  lugarDeLaPeticion,
  nombreDeLaInstitucion,
  subdominioDeLaCuenta,
  type LugarDeLaPeticion,
} from '@/lib/institucionesServidor'
import { codigoDeLaInstitucion, codigosIguales } from '@/lib/invitacionesServidor'
import { sinLaPeticion } from '@/lib/barreraDeInstitucion'
import { idDeInstitucion } from '@/access/payload'
import { comoValeEnElLugar, cuentaValeEnElLugar, filtroDelLugar } from '@/access/reglas'
import { estaBloqueada } from '@/lib/instituciones'

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
 * La dirección es el último valor de `X-Forwarded-For`, el que pone el túnel
 * (`src/lib/ritmo.ts`): esta línea decía que detrás del proxy no se podía
 * falsear, y se podía, porque se leía el primero, que escribe el visitante
 * (O-072). Llegando directo al puerto sigue siendo falseable. Y el bloqueo por
 * cuenta sigue debajo, que no depende de quién dice ser nadie.
 */
const LIMITE_DE_ENTRADAS = crearLimitador('entrar:direccion', { maximo: 30, ventanaMs: DIEZ_MINUTOS })

/** Cómo nombra el registro la institución donde actuó el soporte (D-404). */
const nombreDelSoporte = (institucion: { nombre: string; subdominio: string }): string =>
  `${institucion.nombre} (${institucion.subdominio})`

/**
 * ¿Entra con ese correo el soporte de TraumaHub, el fantasma de D-404? Devuelve
 * cómo lo nombrará el registro, o `undefined`.
 *
 * Se mira antes de entrar porque el soporte entra sin la barrera de la base, y
 * eso se decide antes del `login`. Con la barrera puesta y sin más: desde una
 * institución se leen sus cuentas y las de TraumaHub, que es justo lo que hace
 * falta. Lo que se decide aquí es solo por dónde se entra; si puede entrar lo
 * sigue diciendo `beforeLogin`, con la contraseña.
 */
async function soporteQueEntra(
  payload: Awaited<ReturnType<typeof getPayload>>,
  email: string,
  institucion: { id: string; nombre: string; subdominio: string } | null,
): Promise<string | undefined> {
  if (!institucion) return undefined
  const { docs } = await payload.find({
    collection: 'usuarios',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { rol: true, institucion: true },
  })
  const cuenta = docs[0] as { rol?: unknown; institucion?: unknown } | undefined
  if (!cuenta) return undefined
  return comoValeEnElLugar(cuenta.rol, idDeInstitucion(cuenta.institucion), institucion.id) === 'soporte'
    ? nombreDelSoporte(institucion)
    : undefined
}

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

    const cabeceras = await headers()
    const direccion = direccionDeQuienLlama(cabeceras)
    if (!(await LIMITE_DE_ENTRADAS.permitir(direccion))) {
      throw new Error(
        'Demasiados intentos de entrada desde esta conexión. Espere unos minutos y vuelva a intentarlo.',
      )
    }

    const payload = await getPayload({ config })
    // Dónde se entra (D-396). En un subdominio sin institución no entra nadie:
    // la página ya dice que no existe, y la acción se podría llamar igual.
    const lugar = await lugarDeLaPeticion(payload, cabeceras)
    if (lugar.subdominio && !lugar.institucion) throw new Error('Correo o contraseña incorrectos.')
    // En una institución bloqueada no entra nadie (D-403), y se dice antes de
    // mirar la contraseña: vale para todas sus cuentas, y no cuenta nada de
    // ninguna. `beforeLogin` lo vuelve a mirar por si se llega de otro modo.
    if (lugar.institucion && estaBloqueada(lugar.institucion.vence)) throw new Error(MENSAJE_INSTITUCION_BLOQUEADA)

    let email: string
    try {
      email = exigirCorreo(correo)
    } catch {
      // Lo mismo que si no existiera: así decía antes, cuando el correo se
      // validaba dentro del `login`.
      throw new Error('Correo o contraseña incorrectos.')
    }
    const soporteEn = await soporteQueEntra(payload, email, lugar.institucion)

    let resultado: { token?: string; user?: { activo?: unknown; rol?: unknown; bienvenidaVistaEn?: unknown } }
    try {
      const iniciar = () =>
        payload.login({
          collection: 'usuarios',
          data: { email, password: contrasena },
          // El equipo, la IP y el país de esta entrada, para el gancho que
          // cierra las demás sesiones de la cuenta (`hooks/sesionUnica.ts`,
          // D-388): la API local no le pasa las cabeceras de la petición. La
          // institución del lugar, para `beforeLogin`, que no deja entrar a una
          // cuenta de otra (`CuentaDeOtroLugar`). Y si entra el soporte, dónde,
          // para que el registro lo cuente.
          context: {
            entrada: datosDeLaPeticion(cabeceras, direccion),
            institucionDelLugar: lugar.institucion?.id ?? null,
            ...(soporteEn ? { soporteEn } : {}),
          },
        })
      // El soporte entra sin la barrera de la institución (`sinLaPeticion`):
      // entrar escribe en su cuenta, en su entrada y en el registro, y las tres
      // filas son de TraumaHub. Con la barrera puesta, la base no las deja
      // escribir y el `login` falla. Solo para él: lo demás que se entra desde
      // una institución sigue con la barrera.
      resultado = soporteEn ? await sinLaPeticion(iniciar) : await iniciar()
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
      // La institución que venció entre que se leyó el lugar y se entró.
      if (fallo instanceof InstitucionBloqueadaAlEntrar) throw new Error(MENSAJE_INSTITUCION_BLOQUEADA)
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

    // El lector que no ha cerrado la bienvenida pasa antes por ella (D-237).
    return { destino: destinoAlEntrar(resultado.user) }
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
 * solo esta sesión y no todas. Desde D-388 no suele haber otra, porque entrar
 * cierra las demás, pero si algún día se permiten dos, salir en el computador
 * del pabellón no tiene por qué cerrar la del teléfono.
 *
 * Nunca lanza. Si la base no contesta, la cookie se borra igual, que es lo que
 * la persona ve y lo que había antes; el fallo queda en el registro.
 */
async function revocarLaSesionActual(): Promise<void> {
  try {
    const payload = await getPayload({ config })
    const cabeceras = await headers()
    const { user } = await payload.auth({ headers: cabeceras })
    const sid = (user as { _sid?: unknown } | null)?._sid
    if (!user || typeof sid !== 'string') return

    // El soporte de TraumaHub sale de una institución sin la barrera (D-404),
    // por lo mismo que entra sin ella: su cuenta y su entrada son de TraumaHub,
    // y con la barrera puesta la base no deja tocarlas. Sin esto se borraba la
    // cookie y la sesión seguía viva en la base.
    const lugar = await lugarDeLaPeticion(payload, cabeceras)
    const soporteEn =
      lugar.institucion && idDeInstitucion((user as { institucion?: unknown }).institucion) === null
        ? nombreDelSoporte(lugar.institucion)
        : undefined

    const darDeBaja = async () => {
      // Antes de quitar la sesión: después ya no se sabría quién era.
      await registrarAccion(payload, { accion: 'sesion-cerrada', usuario: user, soporteEn })

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
      await cerrarLaEntrada(payload, sid, 'salio')
    }
    await (soporteEn ? sinLaPeticion(darDeBaja) : darDeBaja())
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
      const cabeceras = await headers()
      const direccion = direccionDeQuienLlama(cabeceras)
      if (
        !(await LIMITE_DE_CLAVE_POR_DIRECCION.permitir(direccion)) ||
        !(await LIMITE_DE_CLAVE_POR_CORREO.permitir(email)) ||
        !(await LIMITE_DE_CLAVE_GLOBAL.permitir('todas'))
      ) {
        payload.logger.warn({
          msg: 'Se descartó una petición de enlace de clave nueva por exceso de ritmo',
        })
        return null
      }
      // La cuenta tiene que ser de este lugar (D-396), y se mira antes de
      // pedir el testigo: cada uno invalida el anterior, y desde otro
      // subdominio no se debe poder dejar muerto el enlace de nadie. Callado,
      // como lo demás: si no, el formulario diría de qué institución es cada
      // correo.
      const lugar = await lugarDeLaPeticion(payload, cabeceras)
      if (lugar.subdominio && !lugar.institucion) return null
      // Ni en una bloqueada (D-403): el enlace no dejaría entrar, y el correo
      // sería solo ruido en el buzón de quien no puede hacer nada con él.
      if (lugar.institucion && estaBloqueada(lugar.institucion.vence)) return null
      const { docs } = await payload.find({
        collection: 'usuarios',
        where: { email: { equals: email } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { institucion: true },
      })
      if (
        !docs[0] ||
        !cuentaValeEnElLugar(idDeInstitucion((docs[0] as { institucion?: unknown }).institucion), lugar.institucion?.id ?? null)
      ) {
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
          { para: email, correo: mensajeDeClaveNueva(enlaceDeClave(testigo, lugar.subdominio)) },
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
 * Los frenos de la solicitud en el subdominio de una institución (D-402), que
 * reemplazan a los dos de arriba allí.
 *
 * Con los de la central, un curso no podía pedir cuenta: sus alumnos salen a
 * internet por la misma dirección del hospital, y el sexto de la clase leía
 * «demasiadas solicitudes». En una institución la barrera contra los robots es
 * el código del enlace, que se comprueba antes, así que los frenos solo tienen
 * que acotar lo que haría un enlace filtrado: sesenta por hora desde una misma
 * dirección cubre una clase grande, y doscientas en toda la institución, varias
 * a la vez. Cada institución tiene su cuenta: el curso de una no gasta el freno
 * de otra ni el de la central.
 */
const LIMITE_EN_LA_INSTITUCION_POR_DIRECCION = crearLimitador('solicitud-de-cuenta:institucion-direccion', {
  maximo: 60,
  ventanaMs: UNA_HORA,
})
const LIMITE_EN_LA_INSTITUCION = crearLimitador('solicitud-de-cuenta:institucion', { maximo: 200, ventanaMs: UNA_HORA })

/** Lo que se contesta a una solicitud con un enlace de invitación que no vale. */
const ENLACE_DE_INVITACION_INVALIDO =
  'El enlace de invitación no es válido: puede que tu institución lo haya cambiado. ' +
  'Pide el enlace vigente a quien administra TraumaHub en tu institución.'

/**
 * En el subdominio de una institución la cuenta se pide con su enlace de
 * invitación (D-402). La página no enseña el formulario sin él, pero esta acción
 * se llama por HTTP con lo que se quiera. En la central no se pide nada.
 *
 * Antes de los frenos, y a propósito: un código no se adivina —120 bits, o 96
 * en las instituciones que ya existían antes del enlace—, y gastar el freno de
 * la institución en intentos con códigos falsos dejaría a cualquiera cerrarle
 * la puerta a un curso entero llamando sin enlace desde muchas direcciones.
 */
async function exigirInvitacion(
  payload: Awaited<ReturnType<typeof getPayload>>,
  lugar: LugarDeLaPeticion,
  dado: unknown,
): Promise<void> {
  if (!lugar.subdominio) return
  if (!lugar.institucion) throw new Error('Esta institución no existe en TraumaHub.')
  // Bloqueada (D-403), el enlace no vale aunque sea el vigente: la cuenta no
  // podría entrar, y la solicitud se quedaría esperando a un administrador que
  // tampoco puede.
  if (estaBloqueada(lugar.institucion.vence)) {
    throw new Error(`El plazo de ${lugar.institucion.nombre} en TraumaHub terminó: por ahora no se pueden pedir cuentas.`)
  }
  if (!codigosIguales(dado, await codigoDeLaInstitucion(payload, lugar.institucion.id))) {
    throw new Error(ENLACE_DE_INVITACION_INVALIDO)
  }
}

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
    const cabeceras = await headers()
    const direccion = direccionDeQuienLlama(cabeceras)
    const payload = await getPayload({ config })
    const lugar = await lugarDeLaPeticion(payload, cabeceras)
    await exigirInvitacion(payload, lugar, bruto.invitacion)
    const institucion = lugar.institucion?.id
    const dentroDelFreno = institucion
      ? (await LIMITE_EN_LA_INSTITUCION_POR_DIRECCION.permitir(`${institucion}:${direccion}`)) &&
        (await LIMITE_EN_LA_INSTITUCION.permitir(institucion))
      : (await LIMITE_POR_DIRECCION.permitir(direccion)) && (await LIMITE_GLOBAL.permitir('todas'))
    if (!dentroDelFreno) {
      throw new Error(
        'Se recibieron demasiadas solicitudes en poco tiempo. Espere una hora y vuelva a intentarlo.',
      )
    }

    // El aviso de privacidad, antes que ningún dato: sin él aceptado no hay
    // con qué tratar el nombre ni el correo que vienen detrás (Q-005, D-258).
    // La casilla del formulario no basta, por lo de la cabecera: esta acción se
    // llama por HTTP con lo que se quiera.
    //
    // Llega la versión que enseñaba el formulario, no un «sí», y tiene que ser
    // la vigente. Lo que se guarda en la cuenta es qué texto se aceptó, y un
    // «sí» a secas dejaría anotar la versión de hoy a quien abrió el formulario
    // antes de que el aviso cambiara y aceptó el de antes.
    const avisoAceptado = bruto.avisoDePrivacidadAceptado
    if (avisoAceptado !== VERSION_DEL_AVISO_DE_PRIVACIDAD) {
      throw new Error(
        typeof avisoAceptado === 'string' && avisoAceptado.trim() !== ''
          ? 'El aviso de privacidad cambió mientras llenabas la solicitud. Recarga la página, léelo otra vez y vuelve a aceptarlo.'
          : 'Para pedir la cuenta tienes que aceptar el aviso de privacidad.',
      )
    }

    const nombre = exigirSinEnlaces(exigirTexto(bruto.nombre, 'El nombre', LARGOS_DE_SOLICITUD.nombre), 'El nombre')
    const email = exigirCorreo(bruto.correo)
    // El programa es opcional y viaja en la misma columna que la institución
    // (`institucionConPrograma`), así que pasa por los mismos dos filtros: va
    // al aviso de los administradores igual que ella. Los dos juntos se miden
    // otra vez al final, con el tope con que el panel guarda la columna.
    const programa =
      typeof bruto.programa === 'string' && bruto.programa.trim()
        ? exigirSinEnlaces(exigirTexto(bruto.programa, 'El programa o servicio', LARGOS_DE_SOLICITUD.programa), 'El programa o servicio')
        : ''
    const procedencia = exigirTexto(
      institucionConPrograma(
        exigirSinEnlaces(
          exigirTexto(bruto.institucion, 'La institución o el servicio', LARGOS_DE_SOLICITUD.institucion),
          'La institución o el servicio',
        ),
        programa,
      ),
      'La institución junto con el programa',
      LARGOS_DE_SOLICITUD.institucion,
    )
    // Opcional, pero una que no es de la lista se rechaza en vez de olvidarse:
    // el formulario solo ofrece las de la lista, y lo que llegue distinto no lo
    // escribió una persona.
    if (bruto.etapaDeFormacion != null && bruto.etapaDeFormacion !== '' && !esEtapaDeFormacion(bruto.etapaDeFormacion)) {
      throw new Error('La etapa de formación no es una de la lista.')
    }
    const etapaDeFormacion = esEtapaDeFormacion(bruto.etapaDeFormacion) ? bruto.etapaDeFormacion : undefined
    // Opcional y recortado en lugar de rechazado: el `maxLength` del formulario
    // ya lo impide a una persona, y a quien llama sin formulario no le debemos
    // un mensaje.
    const motivo = typeof bruto.motivo === 'string' ? bruto.motivo.trim().slice(0, LARGOS_DE_SOLICITUD.motivo) : ''
    const password = exigirContrasena(bruto.contrasena)

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
      return await registrarSolicitud(payload, lugar, {
        nombre,
        email,
        institucion: procedencia,
        etapaDeFormacion,
        motivo,
        password,
        versionDelAvisoDePrivacidad: avisoAceptado,
      })
    } finally {
      await esperarElSuelo(inicio)
    }
  })
}

/** La parte de `solicitarCuenta` que ya habla con la base; se llama solo desde ahí. */
async function registrarSolicitud(
  payload: Awaited<ReturnType<typeof getPayload>>,
  lugar: LugarDeLaPeticion,
  {
    nombre,
    email,
    institucion,
    etapaDeFormacion,
    motivo,
    password,
    versionDelAvisoDePrivacidad,
  }: {
    nombre: string
    email: string
    institucion: string
    etapaDeFormacion?: EtapaDeFormacion
    motivo: string
    password: string
    versionDelAvisoDePrivacidad: string
  },
): Promise<null> {
  // La dirección del lugar donde se pidió: la cuenta nace allí, y allí entra.
  const base = direccionPublica(lugar.subdominio)
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

  // En el subdominio de una institución la base solo deja ver sus cuentas
  // (D-399), y el correo es único en toda la plataforma: una cuenta de otro
  // lugar con este correo no salía aquí, la escritura chocaba con ella y la
  // persona leía «no se pudo registrar». Se busca sin la barrera
  // (`sinLaPeticion`, D-402), solo para saber si existe y dónde. En la central
  // no hay barrera que quitar.
  const buscar = () =>
    payload.find({
      collection: 'usuarios',
      where: { email: { equals: email } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
  const porCorreo = () => (lugar.subdominio ? sinLaPeticion(buscar) : buscar())

  const existente = await porCorreo()
  const cuenta = existente.docs[0]
  const aquiMismo = cuenta ? idDeInstitucion(cuenta.institucion) === (lugar.institucion?.id ?? null) : false
  if (cuenta && !aquiMismo) {
    // La cuenta está en otro lugar: en la central, o en otra institución. Se
    // le dice al titular dónde, con los enlaces de allí, que es donde entra.
    // Pendiente o no: una solicitud sin revisar en otro lugar tampoco deja
    // pedir otra con el mismo correo.
    const suLugar = idDeInstitucion(cuenta.institucion)
    const suBase = direccionPublica(await subdominioDeLaCuenta(payload, cuenta.institucion))
    if (suBase) {
      enviarSinEsperar(
        payload,
        {
          para: email,
          correo: mensajeDeCuentaYaExistente({
            enlaceEntrar: `${suBase}/entrar`,
            enlaceClave: `${suBase}/clave`,
            enOtroLugar: (await nombreDeLaInstitucion(payload, suLugar)) ?? 'TraumaHub',
          }),
        },
        'aviso de solicitud sobre una cuenta que ya existe en otro lugar',
      )
    }
    return null
  }
  if (cuenta) {
    // La verdad se le dice al titular en su buzón, que es lo único que un
    // curioso con la dirección ajena no puede leer.
    //
    // Y a esa cuenta no se le anota el aviso aceptado, aunque esta llamada lo
    // traiga: quien llama puede ser cualquiera que sepa la dirección, y anotarlo
    // sería dejarle fabricar el consentimiento de otro.
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

  // Un solo instante para la solicitud y la aceptación del aviso: se aceptó al
  // pedir la cuenta, y dos relojes leídos por separado dirían otra cosa.
  const ahora = new Date().toISOString()
  try {
    await payload.create({
      collection: 'usuarios',
      data: {
        email,
        nombre,
        // Lo que la persona escribió de dónde viene. No es la institución de
        // la cuenta (D-396), que sale del enlace de invitación.
        procedencia: institucion,
        etapaDeFormacion,
        password,
        rol: 'lector',
        activo: false,
        origen: 'solicitud',
        pendiente: true,
        motivoDeSolicitud: motivo || undefined,
        solicitadaEn: ahora,
        privacidadAceptadaEn: ahora,
        versionDelAvisoDePrivacidad,
      },
      // También es lo que deja escribir las dos columnas del aviso, cerradas a
      // todo el mundo por acceso de campo (`Usuarios.ts`).
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
    const ahora = await porCorreo().catch(() => ({ docs: [] }))
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
      // A los administradores del lugar, que es donde nace la cuenta pedida:
      // la marca le pone la institución del subdominio (D-399), y en la
      // central, ninguna.
      const administradores = await payload.find({
        collection: 'usuarios',
        where: {
          and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }, filtroDelLugar(lugar.institucion?.id ?? null)],
        } as never,
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
              etapa: etiquetaDeEtapa(etapaDeFormacion),
              motivo,
              enlacePanel: `${direccionPublica(lugar.subdominio)}/admin-panel/usuarios`,
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

/**
 * Deja a la cuenta solo con la sesión que acaba de abrir el cambio de clave.
 *
 * `resetPassword` de Payload añade una sesión y no toca las demás
 * (`auth/operations/resetPassword.js`), así que cambiar la contraseña no echaba
 * a nadie: quien tuviera un testigo copiado —de una estación compartida del
 * pabellón, de un registro de proxy— seguía dentro sus ocho horas, y cambiar la
 * clave es justo lo que hace quien sospecha que alguien entró con la suya. Se
 * quitan como las quita `revocarLaSesionActual`, de la fila de la cuenta, y la
 * estrategia JWT rechaza después cualquier testigo cuyo `sid` ya no esté.
 *
 * El `sid` que se conserva se lee del testigo recién firmado, sin verificar la
 * firma: lo acaba de firmar este mismo proceso. Sin `sid` —sesiones apagadas en
 * la colección— no hay nada que quitar.
 *
 * Nunca lanza: la contraseña ya cambió, y decirle a la persona que no es
 * mentirle. El fallo queda en el registro.
 */
async function cerrarLasDemasSesiones(
  payload: Awaited<ReturnType<typeof getPayload>>,
  usuarioId: string | number,
  testigo: string,
): Promise<void> {
  try {
    const cuerpo = testigo.split('.')[1] ?? ''
    const sid = (JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as { sid?: unknown }).sid
    if (typeof sid !== 'string') return
    const cuenta = await payload.findByID({
      collection: 'usuarios',
      id: usuarioId,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    const sesiones = cuenta.sessions ?? []
    const conservadas = sesiones.filter((sesion) => sesion.id === sid)
    if (conservadas.length === sesiones.length) return
    await payload.update({
      collection: 'usuarios',
      id: usuarioId,
      data: { sessions: conservadas },
      overrideAccess: true,
    })
  } catch (fallo) {
    console.error('[sesion] no se pudieron cerrar las demás sesiones tras cambiar la clave:', fallo)
  }
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
    // `resetPassword` también pasa por `beforeLogin`, que mira dónde se está
    // (D-396): el enlace del correo lleva al subdominio de la cuenta, y desde
    // otro no sirve.
    const lugar = await lugarDeLaPeticion(payload, await headers())
    const resultado = await payload
      .resetPassword({
        collection: 'usuarios',
        data: { token: testigo, password: claveNueva },
        overrideAccess: true,
        context: { institucionDelLugar: lugar.institucion?.id ?? null },
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
        // Lo mismo la institución bloqueada (D-403): el enlace sigue valiendo
        // cuando se extienda el plazo, y decirle que caducó lo mandaría a pedir
        // otro que fallaría igual.
        if (fallo instanceof InstitucionBloqueadaAlEntrar) throw new Error(MENSAJE_INSTITUCION_BLOQUEADA)
        return null
      })

    if (!resultado?.token) {
      throw new Error('El enlace caducó o ya se usó. Pida uno nuevo.')
    }

    const usuarioId = (resultado.user as { id?: string | number } | null | undefined)?.id
    if (usuarioId !== undefined) await cerrarLasDemasSesiones(payload, usuarioId, resultado.token)

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
