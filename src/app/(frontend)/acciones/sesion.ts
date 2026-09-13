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
import {
  CuentaDesactivada,
  MENSAJE_CUENTA_DESACTIVADA,
  MINUTOS_DE_BLOQUEO,
} from '@/collections/Usuarios'
import { accion, type Respuesta } from '@/lib/guardias'
import { PATH_DE_LAS_COOKIES } from '@/lib/pathDeLasCookies'
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

export async function salir(): Promise<Respuesta> {
  return accion(async () => {
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
