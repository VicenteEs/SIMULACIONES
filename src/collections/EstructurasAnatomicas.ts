import type { CollectionBeforeChangeHook, CollectionConfig, Field } from 'payload'
import { administracionDeUsuarios, escrituraDeContenido, lecturaSimple } from '@/access/payload'
import {
  CAMPOS_DE_LA_FICHA,
  ETIQUETA_DEL_CAMPO,
  LARGO_MAXIMO_DEL_CAMPO,
  normalizarTexto,
  type CampoDeLaFicha,
} from '@/lib/estructuras'

/**
 * El listado global de estructuras anatómicas (D-179, P-003 E8): una ficha por
 * pieza del atlas.
 *
 * Cristóbal pidió que lo que se sabe de cada estructura —nombre latino,
 * definición, origen, inserción, inervación, acción, irrigación— se escriba
 * **una vez** y sirva en el taller anatómico, en el simulador y en el modelo
 * que se exporta. Por eso la clave es el identificador del atlas (`FJ…`) y no
 * una cirugía ni un caso, y por eso hay una fila por pieza —cada lado la suya—
 * y no una por nombre: el dueño lo resolvió así («si hay 20.000 piezas, que se
 * llenen todas»), y la planilla permite subir la misma a los dos lados.
 *
 * ## Qué es de la base y qué es del atlas
 *
 * `atlasId`, `nombreOriginal`, `sistema`, `region` y `lado` los pone la siembra
 * (`src/lib/estructurasServidor.ts`) y nadie los escribe a mano: el campo no
 * acepta escritura por la API. El nombre en español **no se guarda**: sale de
 * `src/atlas/nombres-es.json` al enseñarlo, para que no se desincronice de la
 * traducción del taller. Lo que sí se guarda es el nombre original en inglés,
 * que es lo que permite volver a casar una ficha si algún día se regenera el
 * atlas y cambian los identificadores.
 *
 * ## Por qué no se pierde lo escrito
 *
 * - `atlasId` es **único**: la siembra repetida no duplica y dos subidas de la
 *   misma planilla caen en la misma fila.
 * - **Versiones** (`maxPerDoc: 20`): cada guardado deja la ficha anterior, y la
 *   ventana de edición la puede restaurar. Sin borradores: una ficha es el
 *   estado de lo que se sabe, no un documento que se publica.
 * - Borrar es de administrador, y el panel no ofrece borrar: una pieza que el
 *   atlas ya no trae queda `huerfana`, con todo lo escrito, hasta que alguien la
 *   case a mano.
 * - Los textos se normalizan al guardar (`normalizarTexto`) y se **rechazan**,
 *   no se cortan, si pasan del tope de su campo.
 *
 * Todo el mundo con sesión lee —la ficha la ve el residente en el simulador—;
 * escriben los editores y los administradores.
 */

const textoDeLaFicha = (campo: CampoDeLaFicha, larga: boolean): Field =>
  larga
    ? { name: campo, type: 'textarea', label: ETIQUETA_DEL_CAMPO[campo], maxLength: LARGO_MAXIMO_DEL_CAMPO[campo] }
    : { name: campo, type: 'text', label: ETIQUETA_DEL_CAMPO[campo], maxLength: LARGO_MAXIMO_DEL_CAMPO[campo] }

/**
 * Lo que identifica a la pieza lo fija la siembra, no la API. Con `update:
 * () => false` ni un editor con la API abierta puede reasignar una ficha a otra
 * pieza; el servidor, que escribe con `overrideAccess`, sí puede (al casar una
 * huérfana con la pieza nueva del atlas regenerado).
 */
const soloLaSiembra = { update: () => false } as const

/**
 * Deja los textos en la forma en que se guardan. Un campo que se vacía se guarda
 * como `null`, no como cadena vacía: así «sin escribir» es una sola cosa.
 */
const normalizarAlGuardar: CollectionBeforeChangeHook = ({ data }) => {
  const datos = data as Record<string, unknown>
  for (const campo of CAMPOS_DE_LA_FICHA) {
    if (!(campo in datos)) continue
    const limpio = normalizarTexto(datos[campo])
    datos[campo] = limpio === '' ? null : limpio
  }
  return datos
}

export const EstructurasAnatomicas: CollectionConfig = {
  slug: 'estructuras-anatomicas',
  labels: { singular: 'Estructura anatómica', plural: 'Estructuras anatómicas' },
  admin: {
    useAsTitle: 'nombreOriginal',
    defaultColumns: ['nombreOriginal', 'sistema', 'region', 'oculta'],
    group: 'Estructura',
  },
  access: {
    read: lecturaSimple,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: administracionDeUsuarios,
    // Sin esto Payload deja leer las versiones a cualquier sesión (ver
    // `lecturaDeBorradores`): el historial es de quien edita.
    readVersions: escrituraDeContenido,
  },
  versions: { maxPerDoc: 20 },
  hooks: { beforeChange: [normalizarAlGuardar] },
  fields: [
    {
      name: 'atlasId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Identificador del atlas',
      access: soloLaSiembra,
    },
    {
      name: 'nombreOriginal',
      type: 'text',
      required: true,
      index: true,
      label: 'Nombre original (inglés)',
      access: soloLaSiembra,
    },
    { name: 'sistema', type: 'text', index: true, label: 'Sistema', access: soloLaSiembra },
    { name: 'region', type: 'text', index: true, label: 'Región', access: soloLaSiembra },
    {
      // `derecho`, `izquierdo` o nada. Texto validado en código y no un `select`,
      // por lo mismo que `accion` en el registro: un `select` es un tipo
      // enumerado de PostgreSQL y cada valor pide su migración.
      name: 'lado',
      type: 'text',
      label: 'Lado',
      access: soloLaSiembra,
      validate: (valor: unknown) =>
        valor === null ||
        valor === undefined ||
        valor === '' ||
        valor === 'derecho' ||
        valor === 'izquierdo' ||
        `«${String(valor)}» no es un lado: derecho, izquierdo o vacío.`,
    },
    textoDeLaFicha('nombreLatino', false),
    textoDeLaFicha('definicion', true),
    textoDeLaFicha('origen', true),
    textoDeLaFicha('insercion', true),
    textoDeLaFicha('inervacion', true),
    textoDeLaFicha('accion', true),
    textoDeLaFicha('irrigacion', true),
    textoDeLaFicha('notas', true),
    {
      name: 'oculta',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: 'No mostrar',
      admin: {
        description:
          'Una pieza marcada así no abre ficha cuando alguien la pincha (por ejemplo, un órgano) y no cuenta como pendiente.',
      },
    },
    {
      // La siembra la pone cuando el atlas instalado ya no trae esta pieza; la
      // ficha no se borra. Vuelve a `false` si la pieza reaparece.
      name: 'huerfana',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: 'Sin pieza en el atlas',
      access: soloLaSiembra,
    },
  ],
}
