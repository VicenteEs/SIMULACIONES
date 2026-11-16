'use server'

/**
 * Las acciones de la pestaña «Instituciones» (P-016 E5.5, D-371, D-400).
 *
 * Todas son del administrador de TraumaHub (`exigirAdminCentral`): el plazo y
 * el cupo son lo que se contrató, y el de la institución no los toca.
 *
 * Crear una institución es crear dos filas: la institución y la cuenta de quien
 * la administra. Van en una sola transacción, con el candado de la base: si la
 * cuenta no se puede crear —el correo ya existe, la base falla a la mitad—, no
 * queda una institución sin nadie que la administre, y dos pestañas que crean
 * el mismo subdominio a la vez no se pisan.
 */

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { Payload, PayloadRequest } from 'payload'
import { direccionPublica, enlaceDeClave } from '@/collections/Usuarios'
import { enviarCorreo, hayCorreo } from '@/correo/enviar'
import { mensajeDeInstitucionLista } from '@/correo/mensajes'
import { accion, exigirAdminCentral, type Respuesta } from '@/lib/guardias'
import {
  HORAS_DE_INVITACION,
  finDelDiaEnChile,
  leerDatosDeInstitucion,
  type CampoDeInstitucion,
  type ProblemasDeInstitucion,
} from '@/lib/instituciones'
import { idDeInstitucion } from '@/access/payload'
import { conCandado } from '@/lib/sqlDirecto'
import { exigirIdentificador } from '@/lib/validacion'

const RUTA = '/admin-panel/instituciones'
const CANDADO = 'instituciones'

/** Lo que vuelve a la pantalla tras invitar: si el correo salió, y el enlace por si no. */
export interface Invitacion {
  enviada: boolean
  enlace: string
  correo: string
}

/** El primer problema del formulario, como error: la pantalla ya los avisa uno a uno antes. */
function rechazarSiHayProblemas(problemas: ProblemasDeInstitucion): void {
  const primero = Object.values(problemas)[0]
  if (primero) throw new Error(primero)
}

/** La fecha de término como la guarda la base, o `null` si no hay. */
const venceParaGuardar = (vence: string): string | null => (vence ? finDelDiaEnChile(vence)!.toISOString() : null)

/** El día del plazo como se lee en un correo: «1 de diciembre de 2026». */
const diaLegible = (vence: string | null): string | null =>
  vence
    ? new Date(vence).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Santiago',
      })
    : null

/**
 * Antes de crear nada: sin dirección pública, el botón del correo sería una
 * ruta sin origen que la plantilla descarta, y el administrador recibiría una
 * bienvenida sin manera de entrar. Lo mismo que mira `crearUsuario`.
 */
function exigirDireccionPublica(): void {
  if (!direccionPublica()) {
    throw new Error(
      'Falta configurar la dirección pública de la plataforma (NEXT_PUBLIC_SERVER_URL): ' +
        'sin ella la invitación no llevaría un enlace que funcione.',
    )
  }
}

/**
 * El enlace para que el administrador elija su contraseña, y el correo que lo
 * lleva. Después de confirmar la transacción: `forgotPassword` busca la cuenta
 * con su propia consulta, y dentro de la transacción todavía no existiría.
 *
 * Que el correo no salga no deshace nada, como en `crearUsuario`: el enlace
 * vuelve a la pantalla para entregarlo a mano.
 */
async function invitar(
  payload: Payload,
  cuenta: { correo: string; nombre: string },
  institucion: { nombre: string; subdominio: string; vence: string | null },
): Promise<Invitacion> {
  const testigo = await payload.forgotPassword({
    collection: 'usuarios',
    data: { email: cuenta.correo },
    disableEmail: true,
    expiration: HORAS_DE_INVITACION * 60 * 60 * 1000,
  })
  if (!testigo) throw new Error('No se pudo emitir el enlace para elegir la contraseña. Pruebe con «Enviar invitación».')
  const enlace = enlaceDeClave(testigo, institucion.subdominio)
  if (!hayCorreo()) return { enviada: false, enlace, correo: cuenta.correo }
  try {
    await enviarCorreo(payload, {
      para: cuenta.correo,
      correo: mensajeDeInstitucionLista({
        nombre: cuenta.nombre,
        institucion: institucion.nombre,
        direccion: direccionPublica(institucion.subdominio),
        enlace,
        horas: HORAS_DE_INVITACION,
        vence: diaLegible(institucion.vence),
      }),
    })
    return { enviada: true, enlace, correo: cuenta.correo }
  } catch (error) {
    console.error('[panel] no se pudo enviar la invitación de la institución:', error)
    return { enviada: false, enlace, correo: cuenta.correo }
  }
}

/** La cuenta con ese correo, de cualquier lugar, o `null`. */
async function cuentaConCorreo(
  payload: Payload,
  correo: string,
  req: Partial<PayloadRequest>,
): Promise<{ id: number | string; institucion: string | null; rol: unknown; activo: unknown; nombre: unknown } | null> {
  const { docs } = await payload.find({
    collection: 'usuarios',
    where: { email: { equals: correo } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const fila = docs[0] as unknown as Record<string, unknown> | undefined
  if (!fila) return null
  return {
    id: fila.id as number | string,
    institucion: idDeInstitucion(fila.institucion),
    rol: fila.rol,
    activo: fila.activo,
    nombre: fila.nombre,
  }
}

/** Una contraseña que no conoce nadie: la elige el administrador con el enlace. */
const contrasenaQueNadieConoce = (): string => randomBytes(32).toString('base64url')

/**
 * Crea una institución y la cuenta de su administrador, y le manda la
 * invitación a su subdominio.
 */
export async function crearInstitucion(
  entrada: Partial<Record<CampoDeInstitucion, unknown>>,
): Promise<Respuesta<{ id: string; invitacion: Invitacion }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdminCentral()
    const { datos, problemas } = leerDatosDeInstitucion(entrada ?? {}, 'crear')
    rechazarSiHayProblemas(problemas)

    const vence = venceParaGuardar(datos.vence)
    const creada = await conCandado(payload, CANDADO, async (req) => {
      req.user = usuario as never
      const ocupado = await payload.find({
        collection: 'instituciones',
        where: { subdominio: { equals: datos.subdominio } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (ocupado.docs[0]) {
        throw new Error(`El subdominio «${datos.subdominio}» ya es de ${ocupado.docs[0].nombre}.`)
      }
      // Un correo es una sola cuenta en toda la plataforma: el de una cuenta de
      // TraumaHub o de otra institución no puede administrar esta.
      if (await cuentaConCorreo(payload, datos.correoDelAdministrador, req)) {
        throw new Error(
          `${datos.correoDelAdministrador} ya tiene una cuenta en TraumaHub. Cada correo es una sola cuenta, ` +
            'en un solo lugar: use otro para el administrador de esta institución.',
        )
      }
      exigirDireccionPublica()

      const institucion = await payload.create({
        collection: 'instituciones',
        data: {
          nombre: datos.nombre,
          subdominio: datos.subdominio,
          modalidad: datos.modalidad,
          // A mediodía en UTC, que en Chile es el mismo día por la mañana: el
          // inicio se muestra como día y no decide nada a una hora.
          inicio: `${datos.inicio}T12:00:00.000Z`,
          vence,
          cupo: datos.cupo,
          correoDelAdministrador: datos.correoDelAdministrador,
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
      await payload.create({
        collection: 'usuarios',
        data: {
          email: datos.correoDelAdministrador,
          nombre: datos.nombreDelAdministrador,
          password: contrasenaQueNadieConoce(),
          rol: 'admin',
          activo: true,
          institucion: institucion.id,
          notas: `Administrador de ${datos.nombre}, creado con la institución.`,
        } as never,
        depth: 0,
        overrideAccess: true,
        req,
      })
      return institucion
    })
    revalidatePath(RUTA)

    const invitacion = await invitar(
      payload,
      { correo: datos.correoDelAdministrador, nombre: datos.nombreDelAdministrador },
      { nombre: datos.nombre, subdominio: datos.subdominio, vence },
    )
    return { id: String(creada.id), invitacion }
  })
}

/**
 * Cambia lo que se contrató: el nombre, la modalidad, el plazo, el cupo y el
 * correo de contacto. El subdominio y el inicio no.
 *
 * Bajar el cupo por debajo de las cuentas activas no desactiva ninguna: solo
 * impide aprobar más hasta que se liberen lugares (D-400). Se devuelve cuántas
 * hay para que la pantalla lo diga.
 */
export async function actualizarInstitucion(
  id: unknown,
  entrada: Partial<Record<CampoDeInstitucion, unknown>>,
): Promise<Respuesta<{ activas: number; cupo: number }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdminCentral()
    const clave = exigirIdentificador(id, 'La institución')
    const { datos, problemas } = leerDatosDeInstitucion(entrada ?? {}, 'cambiar')
    rechazarSiHayProblemas(problemas)

    const actual = await payload.findByID({ collection: 'instituciones', id: clave, depth: 0, disableErrors: true })
    if (!actual) throw new Error('Esa institución ya no existe. Recargue la lista.')

    await payload.update({
      collection: 'instituciones',
      id: clave,
      data: {
        nombre: datos.nombre,
        modalidad: datos.modalidad,
        vence: venceParaGuardar(datos.vence),
        cupo: datos.cupo,
        correoDelAdministrador: datos.correoDelAdministrador,
      },
      depth: 0,
      overrideAccess: true,
      user: usuario as never,
    })
    const { totalDocs: activas } = await payload.count({
      collection: 'usuarios',
      where: { and: [{ institucion: { equals: clave } }, { activo: { equals: true } }] },
      overrideAccess: true,
    })
    revalidatePath(RUTA)
    return { activas, cupo: datos.cupo }
  })
}

/**
 * Vuelve a mandar la invitación al administrador de la institución: cuando la
 * primera caducó (72 horas) o cuando la institución cambia de administrador y
 * se puso el correo nuevo en la ficha.
 *
 * Si la cuenta de ese correo ya es de la institución, se deja como
 * administrador activo y se le manda un enlace nuevo: es TraumaHub
 * devolviéndole la llave a quien la institución designó. Si no existe, se crea.
 * Si es de otro lugar, no se toca.
 *
 * No mira el cupo: el cupo lo fija TraumaHub, y su administrador no puede
 * quedar fuera por haberlo llenado sus alumnos.
 */
export async function invitarAdministrador(id: unknown): Promise<Respuesta<Invitacion>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdminCentral()
    const clave = exigirIdentificador(id, 'La institución')

    const institucion = await conCandado(payload, CANDADO, async (req) => {
      req.user = usuario as never
      const fila = await payload.findByID({ collection: 'instituciones', id: clave, depth: 0, disableErrors: true, req })
      if (!fila) throw new Error('Esa institución ya no existe. Recargue la lista.')
      exigirDireccionPublica()
      const correo = String(fila.correoDelAdministrador).toLowerCase()
      const cuenta = await cuentaConCorreo(payload, correo, req)
      if (cuenta && cuenta.institucion !== String(fila.id)) {
        throw new Error(
          `${correo} ya tiene una cuenta en otro lugar de TraumaHub. Ponga en la ficha el correo de alguien de ${fila.nombre}.`,
        )
      }
      let nombre = `Administración de ${fila.nombre}`
      if (cuenta) {
        nombre = typeof cuenta.nombre === 'string' && cuenta.nombre ? cuenta.nombre : nombre
        if (cuenta.rol !== 'admin' || cuenta.activo !== true) {
          await payload.update({
            collection: 'usuarios',
            id: cuenta.id,
            data: { rol: 'admin', activo: true, pendiente: false } as never,
            depth: 0,
            overrideAccess: true,
            req,
          })
        }
      } else {
        await payload.create({
          collection: 'usuarios',
          data: {
            email: correo,
            nombre,
            password: contrasenaQueNadieConoce(),
            rol: 'admin',
            activo: true,
            institucion: fila.id,
            notas: `Administrador de ${fila.nombre}, invitado desde «Instituciones».`,
          } as never,
          depth: 0,
          overrideAccess: true,
          req,
        })
      }
      return { correo, nombre, fila }
    })
    revalidatePath(RUTA)
    return invitar(
      payload,
      { correo: institucion.correo, nombre: institucion.nombre },
      {
        nombre: institucion.fila.nombre,
        subdominio: institucion.fila.subdominio,
        vence: (institucion.fila.vence as string | null | undefined) ?? null,
      },
    )
  })
}
