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

import { cookies } from 'next/headers'
import { getPayload, LockedAuth } from 'payload'
import config from '@payload-config'
import { MINUTOS_DE_BLOQUEO } from '@/collections/Usuarios'
import { accion, type Respuesta } from '@/lib/guardias'
import { PREFIJO } from '@/lib/rutas'
import { exigirContrasena, exigirCorreo, exigirTexto } from '@/lib/validacion'
import { COOKIE_VISTA_PREVIA } from '@/lib/vistaPrevia'

/**
 * Nombre con el que Payload firma y lee la sesión: `<cookiePrefix>-token`.
 *
 * Se le pregunta a la configuración en lugar de escribirlo aquí porque el
 * nombre es la única salida al choque que describe `PATH_COOKIE`, y ese día
 * tiene que moverse solo. En cuanto `payload.config.ts` declare
 * `cookiePrefix: 'traumahub'`, Payload firmará `traumahub-token`
 * (`auth/cookies.js` arma el nombre así) y lo buscará con ese mismo nombre
 * (`auth/extractJWT.js`). Si aquí quedara escrito a mano el anterior, esta
 * acción escribiría una cookie que nadie lee: entrar respondería «exito» y la
 * plataforma seguiría cerrada, sin un error en ninguna parte, que es
 * exactamente el fallo mudo que ese cambio pretende quitar.
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
 * El testigo se acota al prefijo de la plataforma, no a la raíz.
 *
 * En el servidor TraumaHub no tiene un origen propio: comparte esquema, dominio
 * y puerto con las otras páginas que cuelgan del mismo proxy —`/` y `/api` son
 * de otra, y también `/equipo` y `/senales`; está descrito en
 * `despliegue/paginas/LEEME.md`—. Con `path: '/'` el navegador adjuntaba
 * `payload-token` en **cada** petición a cualquiera de ellas, y ese testigo
 * abre la plataforma entera durante ocho horas sin pedir contraseña: vale por
 * sí solo, como quedó comprobado al aislar el fallo de 66bdc2d. Basta con que
 * una de esas páginas —proyectos distintos, con su propio despliegue— anote
 * cabeceras en un registro de acceso para que la sesión del administrador
 * quede escrita fuera de aquí.
 *
 * Lo que esto **no** cierra: un guion inyectado en cualquiera de esas páginas
 * sigue pudiendo llamar a `/traumahub/api/…` con `credentials: 'include'` —el
 * path casa, y el `Origin` coincide con `serverURL`, así que la comprobación
 * CSRF de Payload también pasa—. Eso solo lo cierra un nombre de servidor
 * propio para la plataforma.
 *
 * Y el cabo del despliegue, que es más grave de lo que parece. La cookie que
 * las sesiones anteriores a este cambio dejaron en `/` sigue viva hasta que
 * caduque, y es **ella** la que manda: el navegador manda primero la del path
 * más específico (RFC 6265 §5.4) y `parseCookies` de Payload arma un Map con
 * un `set(nombre, valor)` por cada par, de modo que gana el último, o sea el
 * viejo de `/`. Mientras esa cookie exista, la del prefijo no se lee nunca, y
 * eso no es solo que «salir» no cierre:
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
 *    `Usuarios.ts` y el `maxAge` de aquí abajo son los mismos ocho horas y se
 *    apagan juntos.)
 *
 * Desde aquí no se puede borrar: `cookies()` guarda **una sola escritura por
 * nombre** (`ResponseCookies._parsed` es un Map indexado por nombre, y `set`
 * vuelve a escribir la cabecera entera desde él), así que un `delete` en `/` y
 * un `set` en el prefijo no caben en la misma respuesta: el segundo pisa al
 * primero. Y borrar en `/` en lugar de en el prefijo solo cambia a quién le
 * toca el fallo, porque entonces las sesiones nuevas son las que no se cierran.
 *
 * La salida es el NOMBRE, no el path: con `cookiePrefix: 'traumahub'` en
 * `payload.config.ts`, Payload firma y lee `traumahub-token`, la cookie vieja
 * se vuelve invisible para todos y se muere sola sin estorbar a nadie.
 * `nombreDeLaCookieDeSesion()` ya lo sigue, así que ese día no hay que tocar
 * nada aquí; **mientras esa línea no esté puesta, los dos puntos de arriba
 * siguen vivos en el servidor**.
 *
 * Un último detalle que hay que respetar aunque el prefijo se ponga: quien se
 * autentique por la API REST de Payload vuelve a crear el choque, porque
 * `generatePayloadCookie` escribe siempre con `path: '/'`, sin mirar esto. La
 * plataforma entra por estas acciones y solo por ellas.
 */
const PATH_COOKIE = PREFIJO || '/'

const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: PATH_COOKIE,
}

export async function entrar(
  correo: unknown,
  contrasena: unknown,
): Promise<Respuesta<{ destino: string }>> {
  return accion(async () => {
    if (typeof contrasena !== 'string' || contrasena.length === 0) {
      throw new Error('Escriba su contraseña.')
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
      // fallado cinco veces contra ese correo. En una plataforma cerrada donde
      // las cuentas las crea el administrador a mano, eso vale mucho menos que
      // dejar a un residente fuera creyéndose la contraseña equivocada.
      if (fallo instanceof LockedAuth) {
        throw new Error(
          `Demasiados intentos fallidos: la cuenta quedó bloqueada durante ${MINUTOS_DE_BLOQUEO} ` +
            'minutos. Espere y vuelva a intentarlo, o pida a un administrador que la desbloquee.',
        )
      }
      // Para el resto, un mensaje único para «no existe» y «contraseña
      // incorrecta»: decir cuál de las dos falla convierte el formulario en un
      // comprobador de correos.
      throw new Error('Correo o contraseña incorrectos.')
    }

    if (!resultado.token) throw new Error('No se pudo iniciar la sesión.')

    if (resultado.user?.activo !== true) {
      throw new Error(
        'Su cuenta existe pero todavía no está activada. Un administrador debe habilitarla.',
      )
    }

    const almacen = await cookies()
    almacen.set(await nombreDeLaCookieDeSesion(), resultado.token, {
      ...OPCIONES_COOKIE,
      maxAge: 8 * 60 * 60,
    })
    // Una sesión nueva empieza siempre con el rol real, nunca simulando otro.
    almacen.delete(COOKIE_VISTA_PREVIA)

    return { destino: resultado.user?.rol === 'admin' ? '/admin-panel' : '/' }
  })
}

export async function salir(): Promise<Respuesta> {
  return accion(async () => {
    const almacen = await cookies()
    // El borrado lleva el mismo path con el que se escribió. Sin él, `delete`
    // caduca una cookie de path `/` —el que Next pone por omisión— que ya no es
    // la nuestra, y la sesión seguiría abierta después de pulsar «salir».
    almacen.delete({ name: await nombreDeLaCookieDeSesion(), path: PATH_COOKIE })
    // La de vista previa se borra en la raíz a propósito: la escribe
    // `api/vista-previa/route.ts` con `path: '/'`, y borrarla en otro path la
    // dejaría viva. Las dos tienen que mudarse al prefijo a la vez.
    almacen.delete(COOKIE_VISTA_PREVIA)
    return null
  })
}

/**
 * Pide un enlace para elegir contraseña nueva.
 *
 * Responde lo mismo exista o no la cuenta. Decir «ese correo no está
 * registrado» permitiría averiguar quién tiene acceso a la plataforma probando
 * direcciones, que es justo lo que el acceso cerrado pretende evitar.
 */
export async function pedirEnlaceDeClave(correo: unknown): Promise<Respuesta> {
  return accion(async () => {
    const payload = await getPayload({ config })
    try {
      await payload.forgotPassword({
        collection: 'usuarios',
        data: { email: exigirCorreo(correo) },
        disableEmail: !process.env.SMTP_HOST,
      })
    } catch (fallo) {
      // La respuesta sigue siendo la misma exista o no la cuenta —eso es lo que
      // hay que conservar—, pero el fallo no puede quedar sin rastro en ninguna
      // parte. Este `catch` se traga por igual «ese correo no está registrado» y
      // el error del transporte: con `SMTP_HOST` puesto, `disableEmail` es
      // falso y aquí dentro hay un envío real. Sin esta línea, un SMTP roto
      // —clave caducada, 587 cerrado por el cortafuegos del hospital— es
      // indistinguible de una dirección que no existe: el residente lee «si esa
      // dirección corresponde a una cuenta, le llegará un enlace», no le llega
      // nada, y `/admin-panel/sistema` sigue diciendo «Correo saliente: ok»
      // porque solo mira si la variable de entorno está puesta.
      payload.logger.error({ msg: 'No se pudo emitir el enlace de clave nueva', err: fallo })
    }
    return null
  })
}

export async function fijarClaveNueva(
  testigo: unknown,
  contrasena: unknown,
): Promise<Respuesta<{ destino: string }>> {
  return accion(async () => {
    if (typeof testigo !== 'string' || testigo.length < 10) {
      throw new Error('El enlace no es válido. Pida uno nuevo.')
    }
    if (typeof contrasena !== 'string' || contrasena.length < 12) {
      throw new Error('La contraseña debe tener al menos 12 caracteres.')
    }

    const payload = await getPayload({ config })
    const resultado = await payload
      .resetPassword({
        collection: 'usuarios',
        data: { token: testigo, password: contrasena },
        overrideAccess: true,
      })
      .catch(() => null)

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
 * entrar: no hay registro abierto y la primera cuenta no la puede activar
 * nadie (D-020, D-028).
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
