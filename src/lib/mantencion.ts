/**
 * Módulos en mantención (D-156): la lectura de la lista, sin tocar la
 * configuración de Payload.
 *
 * Vive aparte de `modulosEnMantencion.ts` por una razón de importaciones: los
 * adaptadores de acceso (`src/access/payload.ts`) la necesitan, y la
 * configuración de Payload importa las colecciones, que importan esos
 * adaptadores. Si esta lectura importara `@payload-config` para obtener el
 * cliente, el ciclo se cerraría. Aquí el cliente llega de fuera, y con solo el
 * tipo.
 *
 * La lista vive en una fila de la colección `ajustes` y no en un *global* de
 * Payload: los globals quedan fuera de la vigilancia de migraciones, de la
 * matriz de roles y del registro de acciones, que solo envuelven colecciones.
 */
import type { Payload } from 'payload'

export const SLUG_DE_AJUSTES = 'ajustes'

/** Lo que haga falta de Payload para leer la lista: una consulta y nada más. */
export type ClienteDeLectura = Pick<Payload, 'find'>

/** Lista de textos, o vacía si lo que viene no lo es. */
export const comoListaDeModulos = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []

/**
 * Los módulos que hoy están en mantención, o `[]` si nunca se ha tocado el
 * interruptor.
 *
 * Lee siempre la fila más antigua. Nada impide por esquema que haya dos, y la
 * acción que escribe (`cambiarMantencionDeModulo`) actualiza esa misma: leer
 * «cualquiera» dejaría que una fila perdida decidiera por la otra.
 *
 * Con `overrideAccess` porque quien pregunta es la plataforma, no la cuenta: un
 * residente no puede leer `ajustes` y aun así tiene que saber que su módulo no
 * se le enseña.
 */
export async function leerMantencion(payload: ClienteDeLectura): Promise<string[]> {
  const { docs } = await payload.find({
    collection: SLUG_DE_AJUSTES as never,
    limit: 1,
    sort: 'createdAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return comoListaDeModulos((docs[0] as { modulosEnMantencion?: unknown } | undefined)?.modulosEnMantencion)
}
