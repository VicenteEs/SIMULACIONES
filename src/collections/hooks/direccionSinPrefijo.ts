import type { Field, FieldHook } from 'payload'
import { PREFIJO, sinPrefijo } from '@/lib/rutas'

/**
 * La `url` de cada archivo subido se guarda sin el prefijo de la instalación
 * (D-370).
 *
 * Payload escribe esa columna al subir el archivo y otra vez en cada
 * actualización del documento, aunque solo cambie el nombre. Usa
 * `formatAdminURL` en modo relativo, que antepone `NEXT_BASE_PATH`. Por eso en
 * ved quedaba `/traumahub/api/modelos-3d/file/…`. Lo que se sube por un guion
 * corre fuera de Next, sin `NEXT_BASE_PATH`, y quedaba sin prefijo: de ahí que
 * en ved convivieran las dos formas (3298 medios sin prefijo y 1 con él; 80
 * modelos con él y 2 sin él, el 2026-11-15).
 *
 * Al leer no cambia nada. Payload no usa lo guardado si empieza por `/`: rehace
 * la dirección con el nombre del archivo, `serverURL` y el prefijo de la
 * instalación que lee (`generateFilePathOrURL`). Así la misma fila sirve en ved
 * y en la raíz de Contabo.
 *
 * **Por qué un gancho de campo y no de colección.** El `beforeChange` de la
 * colección corre **antes** que los de los campos
 * (`collections/operations/create.js`), así que el gancho del campo `url` de
 * Payload volvía a poner el prefijo encima. Un campo con el mismo nombre que
 * uno de Payload no lo reemplaza: `mergeBaseFields` los funde con `deepmerge`,
 * que **concatena** los arreglos. El gancho de abajo queda detrás del de Payload
 * y recibe su resultado. Si un día Payload cambiara esa fusión por un reemplazo,
 * el suyo desaparecería y la columna quedaría vacía al subir. Eso lo vigila
 * `tests/integration/datosSinPrefijo.test.ts` contra una base de verdad.
 */
export const guardarSinPrefijo: FieldHook = ({ value }) =>
  typeof value === 'string' ? sinPrefijo(value, process.env.NEXT_BASE_PATH || PREFIJO) : value

/**
 * Los campos que hay que sumar a una colección de subida para que su `url`, y
 * la de cada tamaño de imagen, se guarde sin prefijo.
 *
 * Se declaran solo el nombre, el tipo y el gancho. El resto (oculto, solo
 * lectura, la etiqueta y el gancho de lectura) lo pone Payload al fundirlos con
 * los suyos. Los tamaños se pasan por nombre, los mismos de `imageSizes`: un
 * tamaño que falte aquí guardaría su `url` con prefijo, y
 * `tests/unit/archivosSubidos.test.ts` compara las dos listas.
 */
export function camposDeDireccionSinPrefijo(tamanos: readonly string[] = []): Field[] {
  const url = (): Field => ({ name: 'url', type: 'text', hooks: { beforeChange: [guardarSinPrefijo] } })
  if (tamanos.length === 0) return [url()]
  return [
    url(),
    {
      name: 'sizes',
      type: 'group',
      fields: tamanos.map((name): Field => ({ name, type: 'group', fields: [url()] })),
    },
  ]
}
