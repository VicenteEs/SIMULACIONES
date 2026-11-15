import type { CollectionBeforeDeleteHook } from 'payload'
import { puedeEditarModulo, type UsuarioSesion } from '@/access/reglas'
import { CATALOGOS_DEL_SIMULADOR } from '@/collections/catalogos'
import { ModeloEnUso } from '@/lib/usosDeUnModelo'
import { usosDelModelo } from '@/lib/usosDeUnModeloServidor'

/** Los catálogos del simulador cuelgan del módulo de cirugías, como en `puedeEditar` (`src/lib/guardias.ts`). */
const MODULO_DEL_CATALOGO = new Map(CATALOGOS_DEL_SIMULADOR.map((c) => [c.slug, 'cirugias']))

/**
 * Un modelo que algo usa no se borra (D-372).
 *
 * En `beforeDelete` y no en la acción del panel, por lo mismo que la
 * resolución de referencia (D-386): todas las vías de borrado pasan por aquí
 * —el menú de la ficha, la tabla del listado, la API—, y en `afterDelete` ya
 * sería tarde, porque la base habría puesto a nulo las columnas que este gancho
 * tiene que mirar.
 *
 * Con la conexión de la petición (`req`), para ver lo que la misma transacción
 * ya cambió. Sin cuenta —un guion de servidor, una limpieza—, el mensaje nombra
 * todo: quien no tiene sesión tampoco tiene módulos que ocultarle.
 */
export const negarElBorradoDeUnModeloEnUso: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const usos = await usosDelModelo(req.payload, id, req)
  if (usos.length === 0) return
  const usuario = req.user as unknown as UsuarioSesion | null | undefined
  throw new ModeloEnUso(
    usos,
    usuario ? (uso) => puedeEditarModulo(usuario, MODULO_DEL_CATALOGO.get(uso.coleccion) ?? uso.coleccion) : undefined,
  )
}
