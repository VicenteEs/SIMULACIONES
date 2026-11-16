import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { direccionPublica } from '@/collections/Usuarios'
import { enviarSinEsperar, hayCorreo } from '@/correo/enviar'
import { mensajeDeEntradaSospechosa } from '@/correo/mensajes'
import { registrarAccion } from '@/lib/registroServidor'
import {
  finDeLaEntrada,
  HORAS_ENTRE_CORREOS_DE_ALERTA,
  MINUTOS_QUE_MIRAN_LAS_REGLAS,
  motivosDeAlerta,
  nombreDelPais,
  sesionesQueSeCierran,
  sidDelTestigo,
  sonEquiposDistintos,
  type AlertaDelPanel,
  type DatosDelEquipo,
  type EntradaDelPanel,
  type MotivoDelCierre,
  type SesionDeLaCuenta,
} from '@/lib/entradas'

/**
 * Lo que toca la base en cada entrada y en cada salida (D-374, D-388). Las
 * reglas, puras, están en `entradas.ts`; aquí se leen y se escriben las filas.
 */

type Fila = Record<string, unknown>
type Peticion = Partial<PayloadRequest> | undefined

const conPeticion = (req: Peticion) => (req ? { req: req as PayloadRequest } : {})

/**
 * Cómo se guarda una sesión en `entradas.sesion`: su SHA-256, no ella.
 *
 * El identificador de la sesión es lo que Payload compara con el testigo para
 * aceptarlo, y `datosDeUnaCuenta` ya lo trata como una llave. Para reconocer la
 * entrada de un testigo basta con la huella, y una copia de la base no lleva así
 * una segunda lista de llaves.
 */
export const huellaDeSesion = (sid: string): string => createHash('sha256').update(sid).digest('hex')

/**
 * El `sid` de un testigo, si lo firmó este servidor y no ha vencido.
 *
 * Con la misma firma que usa Payload —HS256 con `payload.secret`
 * (`auth/jwt.js`)—, comprobada aquí con `node:crypto` para no depender de `jose`,
 * que es de Payload y no de la plataforma. Hace falta comprobarla: el `sid` de
 * una cookie decide qué mensaje se enseña, y un testigo inventado no debe poder
 * preguntar por las sesiones de nadie.
 */
export function testigoVerificado(testigo: string | undefined, secreto: string, ahora: Date = new Date()): string | null {
  if (!testigo || !secreto) return null
  const partes = testigo.split('.')
  if (partes.length !== 3) return null
  const [cabecera, cuerpo, firma] = partes
  const esperada = createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest()
  const recibida = Buffer.from(firma, 'base64url')
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null
  try {
    const { alg } = JSON.parse(Buffer.from(cabecera, 'base64url').toString('utf8')) as { alg?: unknown }
    if (alg !== 'HS256') return null
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as { exp?: unknown; sid?: unknown }
    if (typeof datos.exp !== 'number' || datos.exp * 1000 <= ahora.getTime()) return null
    return typeof datos.sid === 'string' && datos.sid ? datos.sid : null
  } catch {
    return null
  }
}

/**
 * Por qué ya no vale la sesión de este testigo, si se sabe.
 *
 * Solo `'otra-entrada'` cambia lo que ve la persona: una sesión que salió o que
 * caducó acaba en «Iniciar sesión», como siempre. Nunca lanza; sin base, `null`.
 */
export async function motivoDelCierre(payload: Payload, testigo: string | undefined): Promise<MotivoDelCierre | null> {
  const sid = testigoVerificado(testigo, payload.secret)
  if (!sid) return null
  try {
    const { docs } = await payload.find({
      collection: 'entradas',
      where: { sesion: { equals: huellaDeSesion(sid) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { motivoDelCierre: true },
    })
    const motivo = (docs[0] as Fila | undefined)?.motivoDelCierre
    return motivo === 'otra-entrada' || motivo === 'salio' ? motivo : null
  } catch {
    return null
  }
}

/** Lo que el gancho de la entrada sabe de ella. */
export interface EntradaNueva {
  /** La cuenta tal como la deja Payload en `afterLogin`, con la sesión nueva ya en `sessions`. */
  usuario: Fila
  testigo: string | undefined
  datos: DatosDelEquipo
  ahora?: Date
}

/**
 * Lo que pasa al entrar, después de comprobar la contraseña: se cierran las
 * demás sesiones de la cuenta, se anota esta entrada y se mira si parece de
 * una sola persona.
 *
 * Con el `req` del inicio de sesión, por lo mismo que el último acceso
 * (`Usuarios.ts`): fuera de su transacción, la escritura de la cuenta esperaría
 * el bloqueo que el propio inicio tiene tomado.
 *
 * Nunca lanza. Si algo falla, la persona entra igual y el fallo queda en el
 * registro del servidor: echarla porque no se pudo anotar su equipo sería
 * cambiar una molestia por otra peor. La sesión vieja, en ese caso, sigue
 * abierta hasta que caduque, como antes de este cambio.
 */
export async function anotarLaEntrada(payload: Payload, entrada: EntradaNueva, req?: Peticion): Promise<void> {
  try {
    const sid = sidDelTestigo(entrada.testigo)
    if (!sid) return
    const ahora = entrada.ahora ?? new Date()
    const usuarioId = entrada.usuario.id as string | number
    const sesiones = (Array.isArray(entrada.usuario.sessions) ? entrada.usuario.sessions : []) as SesionDeLaCuenta[]
    const { quedan, cerradas } = sesionesQueSeCierran(sesiones, sid, ahora)

    if (quedan.length !== sesiones.length) {
      // Con `payload.update` y no con `payload.db.updateOne`: el adaptador vacía
      // los arreglos que no vienen en `data`, y una escritura parcial de la
      // cuenta podría llevarse algo más que las sesiones. `update` lee antes la
      // fila entera y solo cambia esto. Una escritura de la cuenta que no toca
      // permisos no se anota en el registro (`hooks/registrarAccion.ts`).
      await payload.update({
        collection: 'usuarios',
        id: usuarioId,
        data: { sessions: quedan } as never,
        overrideAccess: true,
        depth: 0,
        ...conPeticion(req),
      })
      entrada.usuario.sessions = quedan
    }

    // Las entradas de las sesiones que se acaban de cerrar: para dejarlas
    // cerradas y para saber si eran de otro equipo.
    const echadas = cerradas.length
      ? ((
          await payload.find({
            collection: 'entradas',
            where: { sesion: { in: cerradas.map(huellaDeSesion) } },
            limit: cerradas.length,
            depth: 0,
            overrideAccess: true,
            ...conPeticion(req),
          })
        ).docs as unknown as Fila[])
      : []
    for (const echada of echadas) {
      await payload.update({
        collection: 'entradas',
        id: echada.id as string | number,
        data: { cerradaEn: ahora.toISOString(), motivoDelCierre: 'otra-entrada' },
        overrideAccess: true,
        depth: 0,
        ...conPeticion(req),
      })
    }
    const cerroOtroEquipo = echadas.some((e) =>
      sonEquiposDistintos(
        { equipo: (e.equipo as string | null) ?? null, ip: (e.ip as string | null) ?? null },
        entrada.datos,
      ),
    )

    const desde = new Date(ahora.getTime() - MINUTOS_QUE_MIRAN_LAS_REGLAS * 60_000)
    const anteriores = (
      await payload.find({
        collection: 'entradas',
        where: { and: [{ usuario: { equals: usuarioId } }, { fecha: { greater_than_equal: desde.toISOString() } }] },
        sort: '-fecha',
        limit: 100,
        depth: 0,
        overrideAccess: true,
        ...conPeticion(req),
      })
    ).docs as unknown as Fila[]

    await payload.create({
      collection: 'entradas',
      data: {
        fecha: ahora.toISOString(),
        usuario: usuarioId as number,
        sesion: huellaDeSesion(sid),
        equipo: entrada.datos.equipo,
        ip: entrada.datos.ip,
        pais: entrada.datos.pais,
        cerroOtroEquipo,
      },
      overrideAccess: true,
      depth: 0,
      ...conPeticion(req),
    })

    const motivos = motivosDeAlerta(
      { fecha: ahora, pais: entrada.datos.pais, cerroOtroEquipo },
      anteriores.map((e) => ({
        fecha: new Date(String(e.fecha)),
        pais: (e.pais as string | null) ?? null,
        cerroOtroEquipo: e.cerroOtroEquipo === true,
      })),
    )
    if (motivos.length > 0) {
      await alertar(payload, { usuario: entrada.usuario, motivos, ahora, recientes: anteriores, nueva: entrada.datos }, req)
    }
  } catch (fallo) {
    payload.logger.error({ msg: 'No se pudo anotar la entrada ni cerrar las demás sesiones', err: fallo })
  }
}

/**
 * Deja la entrada de una sesión como cerrada, al salir. Para el historial: que
 * la sesión ya no valga lo dice Payload, no esto. Nunca lanza.
 */
export async function cerrarLaEntrada(
  payload: Payload,
  sid: string,
  motivo: MotivoDelCierre,
  req?: Peticion,
): Promise<void> {
  try {
    await payload.update({
      collection: 'entradas',
      where: { and: [{ sesion: { equals: huellaDeSesion(sid) } }, { cerradaEn: { exists: false } }] },
      data: { cerradaEn: new Date().toISOString(), motivoDelCierre: motivo },
      overrideAccess: true,
      depth: 0,
      ...conPeticion(req),
    })
  } catch (fallo) {
    payload.logger.error({ msg: 'No se pudo dejar cerrada la entrada de la sesión', err: fallo })
  }
}

const FECHA_Y_HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** «16 nov, 09:40» y «Chrome en Windows · Chile · 190.20.1.5», para el correo. */
function entradaEnPalabras(e: { fecha: Date } & DatosDelEquipo): [string, string] {
  const partes = [e.equipo ?? 'Equipo desconocido', e.pais ? nombreDelPais(e.pais) : null, e.ip].filter(Boolean)
  return [FECHA_Y_HORA.format(e.fecha), partes.join(' · ')]
}

/**
 * La alerta: una línea en el registro de acciones siempre, y un correo a los
 * administradores activos si de esa cuenta no salió ya uno en el último día.
 *
 * El correo es el que avisa; el registro es donde se mira después, con las
 * demás entradas de la cuenta alrededor. Se anota antes de mandar para que dos
 * entradas casi a la vez no manden dos correos: la segunda ya encuentra la
 * línea de la primera, en la misma transacción o en la siguiente.
 */
async function alertar(
  payload: Payload,
  datos: { usuario: Fila; motivos: string[]; ahora: Date; recientes: Fila[]; nueva: DatosDelEquipo },
  req: Peticion,
): Promise<void> {
  const { usuario, motivos, ahora } = datos
  const desde = new Date(ahora.getTime() - HORAS_ENTRE_CORREOS_DE_ALERTA * 60 * 60_000)
  const { totalDocs: yaAvisadas } = await payload.count({
    collection: 'registro-de-acciones',
    where: {
      and: [
        { usuario: { equals: usuario.id as string | number } },
        { accion: { equals: 'entrada-sospechosa' } },
        { fecha: { greater_than_equal: desde.toISOString() } },
      ],
    },
    overrideAccess: true,
    ...conPeticion(req),
  })

  await registrarAccion(payload, { accion: 'entrada-sospechosa', usuario, detalle: motivos.join(' ') }, req)

  if (yaAvisadas > 0 || !hayCorreo()) return
  const administradores = await payload.find({
    collection: 'usuarios',
    where: { and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }] },
    depth: 0,
    limit: 20,
    overrideAccess: true,
    ...conPeticion(req),
  })
  const para = administradores.docs
    .map((a) => a.email)
    .filter((correo): correo is string => typeof correo === 'string' && correo.length > 0)
  if (para.length === 0) return

  const entradas = [
    entradaEnPalabras({ fecha: ahora, ...datos.nueva }),
    ...datos.recientes.slice(0, 5).map((e) =>
      entradaEnPalabras({
        fecha: new Date(String(e.fecha)),
        equipo: (e.equipo as string | null) ?? null,
        ip: (e.ip as string | null) ?? null,
        pais: (e.pais as string | null) ?? null,
      }),
    ),
  ]
  enviarSinEsperar(
    payload,
    {
      para,
      correo: mensajeDeEntradaSospechosa({
        nombre: typeof usuario.nombre === 'string' && usuario.nombre ? usuario.nombre : String(usuario.email ?? ''),
        correo: String(usuario.email ?? ''),
        motivos,
        entradas,
        enlacePanel: `${direccionPublica()}/admin-panel/usuarios`,
      }),
    },
    'alerta de entrada sospechosa a los administradores',
  )
}

// ------------------------------------------- en «Usuarios y permisos»

/** Cuántas entradas y alertas enseña el panel de una cuenta. */
export const ENTRADAS_EN_EL_PANEL = 50
export const ALERTAS_EN_EL_PANEL = 10

/**
 * Las últimas entradas de una cuenta y sus alertas, para «Usuarios y permisos».
 *
 * Sin comprobar quién pregunta: eso lo hace la acción que llama
 * (`entradasDeUnaCuenta`, con `exigirAdmin`). La huella de la sesión no sale de
 * aquí; con ella se pregunta a la cuenta qué sesiones siguen abiertas, que es lo
 * único para lo que sirve fuera del gancho.
 *
 * Las alertas se leen del registro de acciones y no de las entradas, porque es
 * ahí donde quedan, con el motivo en palabras. Duran lo que dura el registro,
 * doce meses, más que las entradas que las dispararon: una alerta de hace cinco
 * meses sale sin las entradas de entonces, y es lo que el aviso promete.
 */
export async function entradasDeLaCuenta(
  payload: Payload,
  cuenta: string | number,
  ahora: Date = new Date(),
): Promise<{ entradas: EntradaDelPanel[]; total: number; alertas: AlertaDelPanel[] }> {
  const [leidas, usuario, registro] = await Promise.all([
    payload.find({
      collection: 'entradas',
      where: { usuario: { equals: cuenta } },
      sort: '-fecha',
      limit: ENTRADAS_EN_EL_PANEL,
      depth: 0,
      overrideAccess: true,
    }),
    payload.findByID({
      collection: 'usuarios',
      id: cuenta,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
      disableErrors: true,
    }),
    payload.find({
      collection: 'registro-de-acciones',
      where: { and: [{ usuario: { equals: cuenta } }, { accion: { equals: 'entrada-sospechosa' } }] },
      sort: '-fecha',
      limit: ALERTAS_EN_EL_PANEL,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const sesiones = ((usuario as { sessions?: SesionDeLaCuenta[] } | null)?.sessions ?? []).filter(
    (s) => new Date(s.expiresAt).getTime() > ahora.getTime(),
  )
  const abiertas = new Set(sesiones.map((s) => huellaDeSesion(s.id)))

  const entradas = (leidas.docs as unknown as Fila[]).map((e): EntradaDelPanel => {
    const fecha = new Date(String(e.fecha))
    return {
      id: String(e.id),
      fecha: fecha.toISOString(),
      equipo: (e.equipo as string | null) ?? null,
      ip: (e.ip as string | null) ?? null,
      pais: (e.pais as string | null) ?? null,
      cerroOtroEquipo: e.cerroOtroEquipo === true,
      fin: finDeLaEntrada(
        {
          fecha,
          motivoDelCierre: (e.motivoDelCierre as MotivoDelCierre | null) ?? null,
          abierta: typeof e.sesion === 'string' && abiertas.has(e.sesion),
        },
        ahora,
      ),
    }
  })
  const alertas = (registro.docs as unknown as Fila[]).map((r) => ({
    fecha: new Date(String(r.fecha)).toISOString(),
    detalle: String(r.detalle ?? ''),
  }))
  return { entradas, total: leidas.totalDocs, alertas }
}
