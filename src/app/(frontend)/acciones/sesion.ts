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
import { getPayload } from 'payload'
import config from '@payload-config'
import { accion, type Respuesta } from '@/lib/guardias'
import { exigirContrasena, exigirCorreo, exigirTexto } from '@/lib/validacion'
import { COOKIE_VISTA_PREVIA } from '@/lib/vistaPrevia'

/** Nombre con el que Payload firma y lee la sesión. */
const COOKIE_SESION = 'payload-token'

const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
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
    } catch {
      // Un mensaje único para «no existe» y «contraseña incorrecta»: decir cuál
      // de las dos falla convierte el formulario en un comprobador de correos.
      throw new Error('Correo o contraseña incorrectos.')
    }

    if (!resultado.token) throw new Error('No se pudo iniciar la sesión.')

    if (resultado.user?.activo !== true) {
      throw new Error(
        'Su cuenta existe pero todavía no está activada. Un administrador debe habilitarla.',
      )
    }

    const almacen = await cookies()
    almacen.set(COOKIE_SESION, resultado.token, {
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
    almacen.delete(COOKIE_SESION)
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
    } catch {
      /* se ignora a propósito: la respuesta no debe delatar si existe */
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
    almacen.set(COOKIE_SESION, resultado.token, { ...OPCIONES_COOKIE, maxAge: 8 * 60 * 60 })
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
      almacen.set(COOKIE_SESION, entrada.token, { ...OPCIONES_COOKIE, maxAge: 8 * 60 * 60 })
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
