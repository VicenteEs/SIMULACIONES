import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import {
  CADUCIDAD_OCULTA_MS,
  CADUCIDAD_VISIBLE_MS,
  MAXIMO_DE_ENTRADAS,
  porPersona,
  type OtroEditor,
  type Presencia,
} from './presencia'
import { adaptadorDe } from './sqlDirecto'

/**
 * Quién tiene abierta qué ficha, guardado donde lo ven todos los procesos de
 * la aplicación (D-393). Las reglas —qué está vigente, cómo se junta a una
 * persona, el techo— son las de `presencia.ts`; aquí solo cambia dónde viven
 * las filas.
 */
export interface AlmacenCompartido {
  latir(ficha: string, presencia: Omit<Presencia, 'desde' | 'visto' | 'nombre' | 'rol'>, ahora: number): Promise<boolean>
  salir(ficha: string, usuarioId: string, pestana: string): Promise<void>
  quienMas(
    ficha: string,
    usuarioId: string,
    pestana: string,
    ahora: number,
  ): Promise<{ otros: OtroEditor[]; misOtrasPestanas: number }>
  porColeccion(coleccion: string, ahora: number): Promise<Record<string, (OtroEditor & { usuarioId: string })[]>>
  limpiar(ahora: number): Promise<void>
}

const fecha = (ms: number) => new Date(ms).toISOString()

/**
 * Lo vigente, en SQL: lo mismo que `vigente` de `presencia.ts`, que una pestaña
 * a la vista caduca antes que una escondida.
 */
const vigenteEnSql = (ahora: number) => sql`
  ((p.visible and p.visto >= ${fecha(ahora - CADUCIDAD_VISIBLE_MS)}::timestamptz)
    or (not p.visible and p.visto >= ${fecha(ahora - CADUCIDAD_OCULTA_MS)}::timestamptz))`

/**
 * Las filas vigentes que cumplen `donde`, con el nombre y el rol leídos de la
 * cuenta. El rol se pasa a texto antes del `coalesce`: es un enum, y la cadena
 * vacía no es uno de sus valores.
 */
async function leer(payload: Payload, donde: ReturnType<typeof sql>, ahora: number) {
  const { rows } = await adaptadorDe(payload).drizzle.execute(sql`
    select p.ficha, p.usuario, p.pestana, p.visible, p.desde, p.visto,
           coalesce(nullif(trim(u.nombre), ''), 'Alguien') as nombre, coalesce(u.rol::text, '') as rol
      from presencias p join usuarios u on u.id = p.usuario
     where ${donde} and ${vigenteEnSql(ahora)}`)
  return rows.map((f) => ({
    ficha: String(f.ficha),
    presencia: {
      usuarioId: String(f.usuario),
      nombre: String(f.nombre),
      rol: String(f.rol),
      pestana: String(f.pestana),
      visible: f.visible === true,
      desde: new Date(f.desde as string).getTime(),
      visto: new Date(f.visto as string).getTime(),
    } satisfies Presencia,
  }))
}

export function almacenEnLaBase(conseguirPayload: () => Promise<Payload>): AlmacenCompartido {
  const bd = async () => adaptadorDe(await conseguirPayload()).drizzle

  const limpiar = async (ahora: number) => {
    await (await bd()).execute(sql`
      delete from presencias p where not ${vigenteEnSql(ahora)}`)
  }

  return {
    async latir(ficha, { usuarioId, pestana, visible }, ahora) {
      const base = await bd()
      // El techo, como en memoria: una pestaña nueva no entra si el almacén está
      // lleno de vigentes; las que ya estaban siguen latiendo.
      const { rows } = await base.execute(sql`
        select (select count(*)::int from presencias) as total,
               exists(select 1 from presencias where ficha = ${ficha} and usuario = ${Number(usuarioId)} and pestana = ${pestana}) as ya`)
      if (rows[0]?.ya !== true && Number(rows[0]?.total ?? 0) >= MAXIMO_DE_ENTRADAS) {
        await limpiar(ahora)
        const { rows: otra } = await base.execute(sql`select count(*)::int as total from presencias`)
        if (Number(otra[0]?.total ?? 0) >= MAXIMO_DE_ENTRADAS) return false
      }
      // `desde` se conserva entre latidos mientras la pestaña siga vigente, con
      // la caducidad de como estaba (visible o no): es cuándo se abrió, no cuándo
      // latió. Una que caducó y vuelve —un portátil que se durmió— empieza de
      // nuevo, porque para los demás estuvo cerrada.
      await base.execute(sql`
        insert into presencias as p (ficha, usuario, pestana, visible, desde, visto)
        values (${ficha}, ${Number(usuarioId)}, ${pestana}, ${visible}, ${fecha(ahora)}::timestamptz, ${fecha(ahora)}::timestamptz)
        on conflict (ficha, usuario, pestana) do update
           set visible = excluded.visible,
               visto = excluded.visto,
               desde = case when ${vigenteEnSql(ahora)} then p.desde else excluded.desde end`)
      return true
    },

    async salir(ficha, usuarioId, pestana) {
      await (await bd()).execute(sql`
        delete from presencias where ficha = ${ficha} and usuario = ${Number(usuarioId)} and pestana = ${pestana}`)
    },

    async quienMas(ficha, usuarioId, pestana, ahora) {
      const filas = await leer(await conseguirPayload(), sql`p.ficha = ${ficha}`, ahora)
      const todas = filas.map((f) => f.presencia)
      const otros = porPersona(todas.filter((p) => p.usuarioId !== usuarioId)).map(
        ({ nombre, rol, desde, segundoPlano }) => ({ nombre, rol, desde, segundoPlano }),
      )
      const misOtrasPestanas = todas.filter((p) => p.usuarioId === usuarioId && p.pestana !== pestana).length
      return { otros, misOtrasPestanas }
    },

    async porColeccion(coleccion, ahora) {
      const prefijo = `${coleccion}/`
      // `like` con el prefijo escapado: el nombre de la colección ya viene
      // comprobado contra el esquema, pero un `_` es comodín en `like`.
      const patron = `${prefijo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      const filas = await leer(await conseguirPayload(), sql`p.ficha like ${patron}`, ahora)
      const porFicha = new Map<string, Presencia[]>()
      for (const { ficha, presencia } of filas) porFicha.set(ficha, [...(porFicha.get(ficha) ?? []), presencia])
      const salida: Record<string, (OtroEditor & { usuarioId: string })[]> = {}
      for (const [ficha, presencias] of porFicha) salida[ficha.slice(prefijo.length)] = porPersona(presencias)
      return salida
    },

    limpiar,
  }
}

async function payloadDeLaAplicacion(): Promise<Payload> {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
  return getPayload({ config })
}

const GLOBAL = globalThis as typeof globalThis & { __presenciaCompartida?: AlmacenCompartido }

/** El almacén del servidor: la base, que es lo que ven todos los procesos. */
export const almacenDePresencia = (): AlmacenCompartido => (GLOBAL.__presenciaCompartida ??= almacenEnLaBase(payloadDeLaAplicacion))
