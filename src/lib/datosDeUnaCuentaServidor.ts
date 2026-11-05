import type { CollectionSlug, Payload, Where } from 'payload'
import { VERSION_DEL_AVISO_DE_PRIVACIDAD } from '@/lib/avisoDePrivacidad'
import {
  CAMPOS_QUE_APUNTAN_A_UNA_CUENTA,
  QUE_CONTIENE,
  cuentaSinLlaves,
  difusionDeLaCuenta,
  entradaSobreLaCuenta,
  enviosFallidosA,
  esCotizacionDe,
  propuestaDeLaCuenta,
  revisionDeLaCuenta,
  votoDeLaCuenta,
  type ColeccionConCuenta,
  type Fila,
} from '@/lib/datosDeUnaCuenta'

/**
 * Las consultas que arman el archivo de «todos tus datos» (D-293). Qué se
 * entrega de cada fila, y por qué, está en `datosDeUnaCuenta.ts`.
 *
 * Todo con `overrideAccess`: lo pide un administrador para entregárselo a la
 * persona, y varias de estas colecciones —el registro, el tiempo activo— no
 * dejan leer ni al administrador las filas de otro por la API. La ruta que
 * llama aquí es la que comprueba el rol.
 */

export interface DatosDeUnaCuenta {
  formato: 'traumahub/datos-de-una-cuenta'
  generadoEn: string
  versionDelAvisoDePrivacidad: string
  queContiene: typeof QUE_CONTIENE
  cuenta: Fila
  avance: Fila[]
  comentarios: Fila[]
  tiempoActivo: Fila[]
  registroDeAcciones: { propias: Fila[]; sobreLaCuenta: Fila[] }
  revision: { fichas: Fila[]; sesiones: Fila[] }
  buzonDeRequisitos: { propuestas: Fila[]; votos: Fila[] }
  difusiones: { escritas: Fila[]; enviosFallidos: Fila[] }
  cotizaciones: Fila[]
  preferencias: Fila[]
}

/** Todas las filas que casan, sin páginas: una solicitud de acceso no se responde a medias. */
async function todas(payload: Payload, coleccion: CollectionSlug, where?: Where, sort?: string): Promise<Fila[]> {
  const { docs } = await payload.find({
    collection: coleccion,
    where,
    sort,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs as unknown as Fila[]
}

/** Las filas de una colección en que la cuenta aparece en cualquiera de sus campos. */
const dondeApareceLa = (coleccion: ColeccionConCuenta, id: string | number): Where => ({
  or: CAMPOS_QUE_APUNTAN_A_UNA_CUENTA[coleccion].map((campo) => ({ [campo]: { equals: id } })),
})

const mismoId = (valor: unknown, id: string | number): boolean => {
  const propio = valor !== null && typeof valor === 'object' ? (valor as { id?: unknown }).id : valor
  return propio !== null && propio !== undefined && String(propio) === String(id)
}

/**
 * Todo lo que la plataforma guarda de una cuenta, o `null` si la cuenta no
 * existe. El `id` se toma de la fila leída y no del que llega en la ruta, para
 * consultar con el mismo tipo que guarda la base.
 */
export async function datosDeUnaCuenta(
  payload: Payload,
  idPedido: string | number,
  ahora: Date = new Date(),
): Promise<DatosDeUnaCuenta | null> {
  const leida = (await payload.findByID({
    collection: 'usuarios',
    id: idPedido,
    depth: 0,
    overrideAccess: true,
    // Sin esto Payload calla los intentos fallidos, el bloqueo y las
    // sesiones, que el aviso dice que se guardan. Las llaves que trae de paso
    // las quita `cuentaSinLlaves`.
    showHiddenFields: true,
    disableErrors: true,
  })) as unknown as Fila | null
  if (!leida) return null

  const id = leida.id as string | number
  const correo = typeof leida.email === 'string' ? leida.email : ''

  const [
    avance,
    comentarios,
    tiempoActivo,
    propias,
    sobreLaCuenta,
    revisiones,
    sesiones,
    requisitos,
    escritas,
    difusiones,
    cotizaciones,
    preferencias,
  ] = await Promise.all([
    todas(payload, 'actividad', dondeApareceLa('actividad', id), 'ultimaVisita'),
    todas(payload, 'comentarios', dondeApareceLa('comentarios', id), 'createdAt'),
    todas(payload, 'tiempo-activo', dondeApareceLa('tiempo-activo', id), 'dia'),
    todas(payload, 'registro-de-acciones', dondeApareceLa('registro-de-acciones', id), 'fecha'),
    todas(
      payload,
      'registro-de-acciones',
      { and: [{ coleccion: { equals: 'usuarios' } }, { documentoId: { equals: String(id) } }] },
      'fecha',
    ),
    todas(payload, 'revisiones', dondeApareceLa('revisiones', id), 'createdAt'),
    todas(payload, 'sesiones-de-revision', dondeApareceLa('sesiones-de-revision', id), 'inicio'),
    todas(payload, 'requisitos', dondeApareceLa('requisitos', id), 'createdAt'),
    todas(payload, 'difusiones', dondeApareceLa('difusiones', id), 'createdAt'),
    // Las difusiones de cualquiera, porque un envío fallido guarda el correo y
    // no la cuenta. Son pocas: una por correo masivo.
    todas(payload, 'difusiones', undefined, 'createdAt'),
    // Las cotizaciones no apuntan a ninguna cuenta: se reconocen por el
    // correo, y la comparación sin mayúsculas se hace aquí y no en la consulta
    // (`like` busca por trozos y casaría «ana@» con «mariana@»). Son pocas y
    // duran doce meses.
    todas(payload, 'cotizaciones', undefined, 'createdAt'),
    // Las del panel de Payload, que se retiró (D-038): no debería haber
    // ninguna, pero si quedó alguna de antes es de la persona. La consulta es
    // la misma que usa Payload para borrarlas con la cuenta.
    todas(payload, 'payload-preferences', {
      and: [{ 'user.value': { equals: id } }, { 'user.relationTo': { equals: 'usuarios' } }],
    }),
  ])

  return {
    formato: 'traumahub/datos-de-una-cuenta',
    generadoEn: ahora.toISOString(),
    versionDelAvisoDePrivacidad: VERSION_DEL_AVISO_DE_PRIVACIDAD,
    queContiene: QUE_CONTIENE,
    cuenta: cuentaSinLlaves(leida),
    avance,
    comentarios,
    tiempoActivo,
    registroDeAcciones: {
      propias,
      // Lo que la persona hizo con su propia cuenta —aceptar el aviso— ya está
      // en `propias`; aquí va solo lo que hicieron otros.
      sobreLaCuenta: sobreLaCuenta.filter((e) => !mismoId(e.usuario, id)).map(entradaSobreLaCuenta),
    },
    revision: {
      fichas: revisiones.map((r) => revisionDeLaCuenta(r, id)),
      sesiones,
    },
    buzonDeRequisitos: {
      propuestas: requisitos.filter((r) => mismoId(r.autor, id)).map(propuestaDeLaCuenta),
      votos: requisitos
        .filter((r) => Array.isArray(r.votos) && (r.votos as unknown[]).some((v) => mismoId(v, id)))
        .map(votoDeLaCuenta),
    },
    difusiones: {
      escritas: escritas.map(difusionDeLaCuenta),
      enviosFallidos: difusiones.flatMap((d) => enviosFallidosA(d, correo)),
    },
    cotizaciones: cotizaciones.filter((c) => esCotizacionDe(c, correo)),
    preferencias: preferencias.map(({ key, value, createdAt, updatedAt }) => ({ key, value, createdAt, updatedAt })),
  }
}
