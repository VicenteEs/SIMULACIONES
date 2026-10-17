import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { corregirCatalogo } from '@/atlas/clasificacion'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/**
 * Leer el catálogo del atlas instalado, en el servidor.
 *
 * Vivía en `exportarPreparacion.ts`, junto a la exportación sin sesión. Se mudó aquí
 * para que quien solo necesita saber qué piezas tiene el atlas —el listado global de
 * estructuras (D-179)— no importe un archivo que se salta los permisos y que una
 * prueba (`exportarSinSesionAcotado.test.ts`) reserva a la acción con guardia. Leer
 * el catálogo no necesita sesión: es el mismo `public/atlas/catalogo.json` que
 * sirve la plataforma a cualquier cuenta.
 */

/** Dónde están el catálogo y los paquetes cuando nadie dice otra cosa. */
export const DIRECTORIO_DEL_ATLAS = () => join(process.cwd(), 'public', 'atlas')

/**
 * Los catálogos leídos, recordados por directorio.
 *
 * Son 0,7 MB de JSON que no cambian mientras el proceso viva: volver a leerlos
 * y analizarlos en cada guardado sería gastar por nada.
 *
 * Se recuerda YA corregido (`corregirCatalogo`), y la corrección va aquí, en la
 * única puerta del servidor, y no en la exportación. El navegador corrige en
 * `cargarCatalogo`; si el servidor no lo hiciera, el taller pintaría el peroneo
 * corto como músculo y el archivo exportado lo seguiría fundiendo con el
 * esqueleto, con el rol de hueso escrito dentro: con la capa de músculo
 * apagada, el residente vería un músculo pegado al peroné como si fuera hueso.
 *
 * Por directorio y no uno solo porque un guion puede apuntar a otro atlas
 * (`directorioDelAtlas`) en el mismo proceso que el de siempre.
 */
const catalogos = new Map<string, CatalogoDelAtlas>()

/**
 * El catálogo del atlas instalado.
 *
 * Exportada porque las acciones del taller la usan también para validar y
 * listar; son la misma lectura y el mismo recuerdo.
 */
export async function leerCatalogo(directorio = DIRECTORIO_DEL_ATLAS()): Promise<CatalogoDelAtlas> {
  const recordado = catalogos.get(directorio)
  if (recordado) return recordado
  try {
    const crudo = await readFile(join(directorio, 'catalogo.json'), 'utf8')
    const catalogoEnMemoria = corregirCatalogo(JSON.parse(crudo) as CatalogoDelAtlas)
    catalogos.set(directorio, catalogoEnMemoria)
    return catalogoEnMemoria
  } catch {
    throw new Error(
      'El atlas anatómico no está instalado en este servidor. ' +
        'Falta public/atlas/catalogo.json.',
    )
  }
}
