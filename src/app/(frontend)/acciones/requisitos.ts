'use server'

import { revalidatePath } from 'next/cache'
import { accion, exigirAdmin, exigirEditor, type Respuesta } from '@/lib/guardias'
import { crearLimitador } from '@/lib/ritmo'
import { ruta } from '@/lib/rutas'
import {
  exigirEstadoDeRequisito,
  exigirIdentificador,
  exigirRequisito,
  respuestaOpcional,
} from '@/lib/validacion'
import type { EstadoDeRequisito } from '@/lib/requisitos'

/**
 * El buzón de requisitos del módulo anunciado (D-163, E7).
 *
 * Todo es de editor o de administrador, con su rol **real**: el residente no ve el
 * buzón. Proponer manda un correo a los administradores, de ahí el freno.
 */

/** Diez propuestas cada diez minutos por cuenta: más de lo que nadie escribe, y menos que una ráfaga. */
const LIMITE_DE_PROPUESTAS = crearLimitador('requisitos:cuenta', { maximo: 10, ventanaMs: 10 * 60 * 1000 })

/** Cuántos requisitos se leen de una vez: un buzón de un puñado de editores no llega a esto. */
const MAXIMO_DE_REQUISITOS = 300

export interface RequisitoDelBuzon {
  id: string
  titulo: string
  descripcion: string
  estado: EstadoDeRequisito
  respuesta: string
  /** Quién lo propuso; `null` si la cuenta ya no existe. */
  autor: { id: string; nombre: string } | null
  votos: number
  /** Si la cuenta que mira ya lo votó. */
  votado: boolean
  /** Si lo propuso la cuenta que mira. */
  esMio: boolean
  creado: string
}

const identificador = (valor: unknown): string | null =>
  valor === null || valor === undefined
    ? null
    : typeof valor === 'object'
      ? ((valor as { id?: unknown }).id === undefined ? null : String((valor as { id: unknown }).id))
      : String(valor)

/** Todos los requisitos, los más votados primero y, entre iguales, los más nuevos. */
export async function listarRequisitos(): Promise<Respuesta<RequisitoDelBuzon[]>> {
  return accion(async () => {
    const { payload, usuarioId } = await exigirEditor()
    const { docs } = await payload.find({
      collection: 'requisitos',
      limit: MAXIMO_DE_REQUISITOS,
      sort: '-createdAt',
      depth: 1,
      overrideAccess: true,
    })
    const filas = (docs as unknown as Record<string, unknown>[]).map((d): RequisitoDelBuzon => {
      const votantes = Array.isArray(d.votos) ? (d.votos as unknown[]).map(identificador) : []
      const autor = d.autor && typeof d.autor === 'object' ? (d.autor as Record<string, unknown>) : null
      const idDelAutor = identificador(d.autor)
      return {
        id: String(d.id),
        titulo: String(d.titulo ?? ''),
        descripcion: String(d.descripcion ?? ''),
        estado: exigirEstadoDeRequisito(d.estado),
        respuesta: String(d.respuesta ?? ''),
        autor: idDelAutor
          ? { id: idDelAutor, nombre: String(autor?.nombre ?? autor?.email ?? 'Cuenta') }
          : null,
        votos: votantes.length,
        votado: votantes.includes(usuarioId),
        esMio: idDelAutor === usuarioId,
        creado: String(d.createdAt ?? ''),
      }
    })
    // Estable: `sort` de JavaScript lo es, y `-createdAt` ya ordenó los empates.
    return filas.sort((a, b) => b.votos - a.votos)
  })
}

/** Un requisito nuevo. */
export async function proponerRequisito(titulo: unknown, descripcion: unknown): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirEditor()
    const datos = exigirRequisito(titulo, descripcion)
    if (!LIMITE_DE_PROPUESTAS.permitir(usuarioId)) {
      throw new Error('Propuso varios requisitos en pocos minutos. Espere un poco antes del siguiente.')
    }
    const creado = await payload.create({
      collection: 'requisitos',
      data: { ...datos, modulo: 'planificacion' } as never,
      user: usuario as never,
    })
    revalidatePath(ruta('/planificacion'))
    return { id: String((creado as { id: unknown }).id) }
  })
}

/**
 * Vota o quita el voto. Es un interruptor por cuenta: votar dos veces no suma dos,
 * y no se puede votar por otro. Los votos se escriben aquí, con `overrideAccess`,
 * porque la API no deja a nadie tocar ese campo.
 */
export async function votarRequisito(id: unknown): Promise<Respuesta<{ votado: boolean; votos: number }>> {
  return accion(async () => {
    const { payload, usuarioId } = await exigirEditor()
    const clave = exigirIdentificador(id, 'El requisito')
    const actual = (await payload.findByID({
      collection: 'requisitos',
      id: clave,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { votos?: unknown[]; estado?: string }
    // Votar lo ya resuelto no dice nada: el administrador cerró la conversación.
    if (actual.estado === 'hecho' || actual.estado === 'descartado') {
      throw new Error('Ese requisito ya está cerrado: no admite votos.')
    }
    const votantes = (Array.isArray(actual.votos) ? actual.votos : []).map(identificador).filter(Boolean) as string[]
    const yaVotado = votantes.includes(usuarioId)
    const nuevos = yaVotado ? votantes.filter((v) => v !== usuarioId) : [...votantes, usuarioId]
    await payload.update({
      collection: 'requisitos',
      id: clave,
      // Números: con una base de identificadores enteros, Payload rechaza «2» como
      // valor de una relación y contesta «el siguiente campo es inválido: Votos».
      data: { votos: nuevos.map((v) => (/^\d+$/.test(v) ? Number(v) : v)) } as never,
      overrideAccess: true,
    })
    revalidatePath(ruta('/planificacion'))
    return { votado: !yaVotado, votos: nuevos.length }
  })
}

/**
 * El autor reescribe lo suyo mientras esté «propuesto»; el administrador, cuando
 * quiera. La regla la pone la colección (`edicionDeRequisito`): se escribe con
 * `overrideAccess: false` para que sea ella quien conteste, y no una copia de ella
 * en esta función.
 */
export async function editarRequisito(
  id: unknown,
  titulo: unknown,
  descripcion: unknown,
): Promise<Respuesta<void>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const clave = exigirIdentificador(id, 'El requisito')
    const datos = exigirRequisito(titulo, descripcion)
    await payload
      .update({
        collection: 'requisitos',
        id: clave,
        data: datos as never,
        user: usuario as never,
        overrideAccess: false,
      })
      .catch(() => {
        throw new Error('Solo puede reescribir sus propios requisitos mientras estén «propuestos».')
      })
    revalidatePath(ruta('/planificacion'))
  })
}

/** El administrador acepta, descarta o pone en estudio, con una respuesta. */
export async function responderRequisito(id: unknown, estado: unknown, respuesta?: unknown): Promise<Respuesta<void>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    const clave = exigirIdentificador(id, 'El requisito')
    const nuevoEstado = exigirEstadoDeRequisito(estado)
    await payload.update({
      collection: 'requisitos',
      id: clave,
      data: { estado: nuevoEstado, respuesta: respuestaOpcional(respuesta) } as never,
      user: usuario as never,
    })
    revalidatePath(ruta('/planificacion'))
  })
}

export async function eliminarRequisito(id: unknown): Promise<Respuesta<void>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    await payload.delete({
      collection: 'requisitos',
      id: exigirIdentificador(id, 'El requisito'),
      user: usuario as never,
    })
    revalidatePath(ruta('/planificacion'))
  })
}
