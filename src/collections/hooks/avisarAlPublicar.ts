import type { CollectionAfterChangeHook } from 'payload'
import { registrarPublicacion } from '@/lib/publicaciones'

/**
 * Avisa a quien esté leyendo de que se acaba de publicar algo.
 *
 * Se pone en los cinco módulos. Antes solo lo tenían las patologías, escrito a
 * mano dentro de su colección, de modo que publicar una maniobra, un caso AO,
 * una cirugía o un estudio no avisaba a nadie: el residente que ya tenía la
 * página abierta no se enteraba hasta recargar por su cuenta. Nadie lo habría
 * notado como fallo, porque no hay error en pantalla: sencillamente el aviso
 * no llega.
 *
 * No lleva parámetros, y eso es deliberado. El módulo y el campo que da título
 * salen de la propia colección —`collection.slug` y `admin.useAsTitle`—, así
 * que añadir un módulo nuevo es ponerle este gancho y nada más. Un gancho que
 * hubiera que configurar en cada sitio es un gancho que acaba configurado mal
 * en alguno.
 *
 * Solo dispara con `_status: 'published'`. Guardar un borrador no interrumpe a
 * nadie: todavía no hay nada que leer.
 */
export const avisarAlPublicar: CollectionAfterChangeHook = ({ collection, doc }) => {
  const registro = doc as Record<string, unknown>
  if (registro._status !== 'published') return

  // Se manda el identificador del módulo, no su nombre legible. El nombre lo
  // pone el navegador: así este archivo no depende de la capa de interfaz, y
  // el servidor puede decidir a quién le corresponde ver ese módulo antes de
  // contarle nada.
  const campoTitulo = collection.admin?.useAsTitle
  const titulo =
    campoTitulo && typeof registro[campoTitulo] === 'string'
      ? (registro[campoTitulo] as string)
      : ''

  registrarPublicacion(collection.slug, titulo)
}
