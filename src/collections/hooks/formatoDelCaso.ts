import type { CollectionBeforeChangeHook } from 'payload'
import { CasoDeUnFormatoMasNuevo, VERSION_DEL_FORMATO_DEL_CASO, versionDelCaso } from '@/lib/formatoDelCaso'

/**
 * Cada caso se guarda con la versión del formato de este código (D-373).
 *
 * En un gancho y no en el formulario: el caso también se guarda desde
 * «Duplicar», al publicar y por la API, y ninguno de esos caminos pasa por el
 * editor. Lo que se guarda es lo que este código escribe, así que lleva su
 * versión.
 *
 * La excepción es un caso que ya era de un formato más nuevo: pasa si se vuelve
 * a una imagen anterior después de una migración que subió la versión
 * (`formatoDelCaso.ts`). Guardarlo lo marcaría con la versión vieja sin haberlo
 * convertido hacia atrás, y desde entonces se leería mal para siempre, también
 * cuando volviera el código nuevo. Se para con el mismo mensaje que al leerlo.
 */
export const escribirLaVersionDelFormato: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const anterior = originalDoc ? versionDelCaso(originalDoc as Record<string, unknown>) : 0
  if (anterior > VERSION_DEL_FORMATO_DEL_CASO) {
    const nombre = (originalDoc as { nombre?: unknown } | undefined)?.nombre
    throw new CasoDeUnFormatoMasNuevo(anterior, typeof nombre === 'string' && nombre.trim() ? nombre : 'sin nombre')
  }
  return { ...data, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO }
}
