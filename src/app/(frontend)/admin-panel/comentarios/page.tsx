import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { clientePayload, SLUGS_DE_MODULOS } from '../datos'
import { TablaComentarios, type ComentarioDelPanel } from './TablaComentarios'

export const dynamic = 'force-dynamic'

/** Cuántos comentarios trae el listado de una sola vez. */
const TOPE = 500

/**
 * Comentarios y sugerencias dejados en las fichas.
 *
 * Es el canal por el que el contenido mejora: alguien lee una ficha, ve que
 * falta algo y lo dice ahí mismo. Que ese canal quede desatendido es el fallo
 * más caro del panel, y por eso la barra lateral muestra el número de
 * pendientes en todo momento.
 */
export default async function PaginaComentarios() {
  // Entra también el editor: es quien escribe el contenido y, por tanto, quien
  // resuelve lo que se comenta sobre él. Eliminar sigue siendo cosa del
  // administrador, porque borra la observación de otra persona.
  const { esAdmin } = await exigirPanel()

  const payload = await clientePayload()

  // Sin este `catch`, una consulta que falla —lo corriente: la tabla que falta
  // porque se desplegó un cambio de esquema sin su migración— tumba la página
  // entera con la pantalla genérica de Next, que no nombra la tabla ni deja
  // pista. La base caída del todo no llega hasta aquí y este `catch` no la
  // cubre: `exigirPanel()` (arriba) ya pasó por `obtenerSesion()`, que abre el
  // cliente de Payload sin guardia (`src/lib/sesion.ts`), y `layout.tsx` hace
  // lo mismo antes de pintar la barra lateral; con Postgres sin responder la
  // excepción sale de ahí y este aviso no llega a dibujarse nunca. Cerrar ese
  // hueco es trabajo de `obtenerSesion`/`layout.tsx`, no de esta página:
  // envolver aquí `clientePayload()` solo movería el punto de la caída. Lo que
  // NO se hace es seguir adelante con una lista vacía: «todavía nadie ha
  // comentado» y «no se pudo leer» no son lo mismo, y es la misma confusión que
  // las tarjetas del resumen dejaron de cometer con `ilegible`.
  const listado = await payload
    .find({
      collection: 'comentarios',
      limit: TOPE,
      sort: '-createdAt',
      depth: 1,
      overrideAccess: true,
    })
    .catch((error) => {
      console.error('[panel] no se pudo leer la tabla de comentarios:', error)
      return null
    })

  if (!listado) {
    return (
      <div>
        <header className="admin-header">
          <h1 className="admin-title">Comentarios y sugerencias</h1>
        </header>
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudo leer la tabla de comentarios.</strong> Esto no significa que no haya
          ninguno: la consulta falló. Lo corriente es que falte una tabla —un cambio de esquema
          desplegado sin su migración—; el detalle queda en el registro del servidor.
        </div>
      </div>
    )
  }

  const { docs } = listado

  const basicos: Omit<ComentarioDelPanel, 'fichaTitulo'>[] = docs.map((d) => {
    const c = d as unknown as Record<string, unknown>
    const autor = c.usuario as { nombre?: string; email?: string } | null
    return {
      id: String(c.id),
      texto: String(c.texto ?? ''),
      estado: c.estado === 'resuelto' ? 'resuelto' : 'pendiente',
      coleccion: String(c.coleccion ?? ''),
      documentoId: String(c.documentoId ?? ''),
      creado: String(c.createdAt ?? ''),
      autorNombre: autor?.nombre ?? null,
      autorCorreo: autor?.email ?? null,
    }
  })

  // De qué ficha habla cada comentario.
  //
  // `documentoId` es un campo de texto suelto en `Comentarios`, no una
  // relación, así que la profundidad con la que se leen trae al autor y nunca
  // el documento: hay que ir a buscarlo aparte. Se agrupa por colección y se
  // hace UNA consulta por colección —cinco como máximo, con `id: { in: … }`—.
  // El `findByID` por ficha que usa la portada aquí no vale: allí el listado
  // son cinco comentarios y este trae hasta quinientos, así que serían hasta
  // quinientas consultas por carga.
  const idsPorColeccion = new Map<string, Set<string>>()
  for (const c of basicos) {
    // `coleccion` es un `select` cerrado a los cinco módulos, pero lo guardado
    // sobrevive a que se retire una opción: sin este filtro, un slug viejo se
    // convertiría en un `payload.find` sobre una colección que no existe. El
    // `catch` de abajo lo recogería, y esa es justo la parte mala —quedaría en
    // el registro como si la base hubiera fallado.
    if (!(SLUGS_DE_MODULOS as readonly string[]).includes(c.coleccion)) continue
    if (c.documentoId === '') continue
    const ids = idsPorColeccion.get(c.coleccion) ?? new Set<string>()
    ids.add(c.documentoId)
    idsPorColeccion.set(c.coleccion, ids)
  }

  const titulos = new Map<string, string>()
  await Promise.all(
    Array.from(idsPorColeccion, async ([coleccion, ids]) => {
      try {
        const { docs: fichas } = await payload.find({
          collection: coleccion as never,
          // El `as never` va con el de la colección: con el slug sin resolver
          // en tipos, Payload no puede tipar su propio `where`. Es el mismo
          // par que usan `datos.ts` y `contenido/page.tsx`.
          where: { id: { in: Array.from(ids) } } as never,
          depth: 0,
          limit: ids.size,
          overrideAccess: true,
        })
        for (const ficha of fichas) {
          const f = ficha as Record<string, unknown>
          // `nombre` en cuatro de los cinco módulos y `titulo` en Técnica AO:
          // es el `useAsTitle` de cada colección.
          const rotulo = f.nombre ?? f.titulo
          if (typeof rotulo === 'string' && rotulo.trim() !== '') {
            titulos.set(`${coleccion}/${String(f.id)}`, rotulo)
          }
        }
      } catch (error) {
        // Cada colección por su cuenta: un `documentoId` que no es un número o
        // una tabla que falta no puede dejar sin título a las otras cuatro. El
        // título es un lujo de esta columna; el comentario es lo que importa y
        // se sigue viendo con el nombre del módulo.
        console.error(`[panel] no se pudieron resolver los títulos de «${coleccion}»:`, error)
      }
    }),
  )

  // `null` y no `undefined` cuando no hay título: la ficha pudo borrarse y el
  // comentario seguir aquí. La tabla cae entonces al nombre del módulo, que es
  // lo único seguro, y sus dos `aria-label` a la redacción genérica.
  const comentarios: ComentarioDelPanel[] = basicos.map((c) => ({
    ...c,
    fichaTitulo: titulos.get(`${c.coleccion}/${c.documentoId}`) ?? null,
  }))

  return <TablaComentarios comentarios={comentarios} puedeEliminar={esAdmin} />
}
