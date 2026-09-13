import type { Payload } from 'payload'
import { ESQUEMAS } from '@/admin/esquema'

/**
 * De qué ficha se habla, cuando lo único guardado es la colección y el número.
 *
 * `actividad` y `comentarios` apuntan a su ficha con dos campos sueltos
 * —`coleccion` y `documentoId`—, no con una relación, porque una fila puede
 * señalar a cualquiera de los cinco módulos. La consecuencia es que ninguna
 * profundidad de consulta trae la ficha: hay que ir a buscarla aparte, y la
 * pantalla que no lo hace acaba rotulando con el número de fila. Estadísticas
 * lo hacía en «Fichas más leídas»: `Biblioteca de patologías · #12`, que no le
 * dice nada a quien no tenga la tabla abierta en otra ventana.
 *
 * Vive a nivel del panel y no dentro de estadísticas porque la misma pregunta
 * la contestan hoy, cada una a su manera, `comentarios/page.tsx` y
 * `actividad/page.tsx`. Las dos leen `nombre ?? titulo` a mano; aquí el campo
 * sale de `titulo` en `src/admin/esquema.ts`, que es lo que el propio panel
 * declara como nombre de cada registro en sus listados, de modo que un módulo
 * nuevo con otro campo de nombre no obliga a tocar esto.
 */

export interface ReferenciaDeFicha {
  coleccion: string
  documentoId: string
}

/** Clave única de una ficha entre las cinco colecciones. */
export const claveDeFicha = (coleccion: string, documentoId: string): string =>
  `${coleccion}/${documentoId}`

/**
 * Lo que se sabe de una ficha, en cuatro casos que no se pueden mezclar.
 *
 * El que más importa separar es `ilegible` de `eliminada`. Las dos se quedan sin
 * título, pero la primera es una afirmación sobre la base —la consulta
 * falló— y la segunda sobre el contenido —la ficha se borró y sus lecturas
 * siguen en `actividad`, que no se limpia al borrar una ficha—. Decir
 * «eliminada» de una ficha que solo no se pudo leer manda a buscar en los
 * respaldos algo que está en su sitio.
 */
export type EstadoDeFicha =
  | { tipo: 'titulo'; titulo: string }
  | { tipo: 'sinTitulo' }
  | { tipo: 'eliminada' }
  | { tipo: 'ilegible' }

/**
 * El estado de cada ficha pedida, por `claveDeFicha`.
 *
 * Una consulta por colección y no una por ficha: con `id: { in: … }` son cinco
 * como mucho, y un `findByID` por ficha sube con el tamaño de la lista.
 *
 * Cada colección falla por su cuenta, y lo que falla se anota en el registro
 * del servidor y vuelve como `ilegible`, nunca como lista vacía: una tabla caída
 * que devolviera cero fichas convertiría todas las suyas en «eliminadas».
 *
 * Se lee sin `draft`, así que el título es el publicado: el que vio quien leyó.
 * Una ficha que nunca se publicó también está en la tabla principal, con su
 * borrador, así que no se confunde con una borrada.
 */
export async function leerTitulosDeFichas(
  payload: Payload,
  fichas: readonly ReferenciaDeFicha[],
): Promise<Map<string, EstadoDeFicha>> {
  const estados = new Map<string, EstadoDeFicha>()

  const idsPorColeccion = new Map<string, Set<string>>()
  for (const { coleccion, documentoId } of fichas) {
    const ids = idsPorColeccion.get(coleccion) ?? new Set<string>()
    ids.add(documentoId)
    idsPorColeccion.set(coleccion, ids)
  }

  await Promise.all(
    Array.from(idsPorColeccion, async ([coleccion, ids]) => {
      const campo = ESQUEMAS.find((e) => e.slug === coleccion)?.titulo
      if (!campo) {
        // Un `coleccion` guardado sobrevive a que se retire la opción del
        // `select`. Preguntarle a Payload por una colección que no existe
        // lanzaría, y el fallo quedaría en el registro como si la base se
        // hubiera caído. La ficha no está en ningún módulo: eso es lo cierto.
        for (const id of ids) estados.set(claveDeFicha(coleccion, id), { tipo: 'eliminada' })
        return
      }

      try {
        const { docs } = await payload.find({
          collection: coleccion as never,
          where: { id: { in: Array.from(ids) } } as never,
          select: { [campo]: true } as never,
          depth: 0,
          limit: ids.size,
          overrideAccess: true,
        })
        const encontradas = new Map<string, Record<string, unknown>>()
        for (const doc of docs) {
          const ficha = doc as Record<string, unknown>
          // El `id` vuelve como número y `documentoId` se guarda como texto:
          // sin el `String`, ninguna casaría y todas saldrían «eliminadas».
          encontradas.set(String(ficha.id), ficha)
        }
        for (const id of ids) {
          const doc = encontradas.get(id)
          const titulo = doc?.[campo]
          estados.set(
            claveDeFicha(coleccion, id),
            !doc
              ? { tipo: 'eliminada' }
              : typeof titulo === 'string' && titulo.trim() !== ''
                ? { tipo: 'titulo', titulo: titulo.trim() }
                : { tipo: 'sinTitulo' },
          )
        }
      } catch (error) {
        console.error(`[panel] no se pudieron leer los títulos de «${coleccion}»:`, error)
        for (const id of ids) estados.set(claveDeFicha(coleccion, id), { tipo: 'ilegible' })
      }
    }),
  )

  return estados
}
