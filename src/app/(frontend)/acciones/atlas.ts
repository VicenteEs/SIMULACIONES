'use server'

/**
 * Acciones del taller del atlas.
 *
 * Una preparación no guarda geometría sino la lista de piezas que sobreviven,
 * de modo que estas acciones nunca tocan el atlas: leen el catálogo para
 * validar y escriben una lista. El atlas es material estático y no hay aquí
 * —ni en ninguna otra parte— código capaz de modificarlo.
 *
 * La selección se vuelve a normalizar en el servidor aunque el taller ya lo
 * haga. Una acción de servidor es un extremo HTTP: el tipo de TypeScript se
 * evapora al compilar y lo que llega es lo que el navegador quiso enviar.
 */

import { revalidatePath } from 'next/cache'
import { accion, exigirEditor, type Respuesta } from '@/lib/guardias'
import { puedeEditarModulo, type UsuarioSesion } from '@/access/reglas'
import { exigirIdentificador, exigirTexto, textoOpcional } from '@/lib/validacion'
import type { Payload } from 'payload'
import { normalizarSeleccion, piezasPerdidas } from '@/atlas/catalogo'
import type { ContenidoDeInstancia } from '@/atlas/formato'
import {
  exportarPreparacion,
  leerCatalogo,
  type ModeloExportado,
} from '@/lib/exportarPreparacion'
import {
  coleccionesQueInsertanPreparaciones,
  mensajeDePreparacionEnUso,
  type ColeccionMontada,
  type UsoDeLaPreparacion,
} from '@/lib/usosDeLaPreparacion'

const RUTA_PANEL = '/admin-panel/atlas'

// El catálogo y los paquetes se leen en `src/lib/exportarPreparacion.ts`, que
// es donde vive también la exportación: un guion de servidor tiene que poder
// leerlos sin pasar por una acción, y dos lecturas del mismo catálogo —una aquí
// y otra allí— serían dos sitios donde olvidar `corregirCatalogo`.

/** Versión del atlas instalado, para la página de sistema. */
export async function versionDelAtlas(): Promise<Respuesta<{ version: string; piezas: number }>> {
  return accion(async () => {
    // Leer el catálogo no necesita permisos, pero un `export` de un archivo
    // 'use server' es un extremo HTTP: hoy solo la importa un componente de
    // servidor y el identificador de la acción no llega a ningún navegador; el
    // día que el taller enseñe la versión del atlas desde un componente de
    // cliente —cosa natural, porque ya compara versiones para avisar de
    // preparaciones desfasadas—, ese import lo mete en el paquete y la versión
    // y el número de piezas quedan contestándole a cualquiera sin sesión, en
    // contra de D-020. Quien lo escriba no va a sospecharlo: sus seis hermanas
    // de este archivo sí comprueban. La página que la usa pasa por
    // `exigirPanel('admin')`, así que esto no cambia nada visible.
    await exigirEditor()
    const catalogo = await leerCatalogo()
    return { version: catalogo.version, piezas: catalogo.piezas.length }
  })
}

export interface ResumenDeInstancia {
  id: string
  nombre: string
  descripcion: string | null
  piezas: number
  actualizada: string
  desfasada: boolean
}

export async function listarInstancias(): Promise<Respuesta<ResumenDeInstancia[]>> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const catalogo = await leerCatalogo()

    const { docs } = await payload.find({
      collection: 'instancias-atlas',
      limit: 200,
      sort: '-updatedAt',
      depth: 0,
      overrideAccess: true,
    })

    return (docs as unknown as Record<string, unknown>[]).map((doc) => ({
      id: String(doc.id),
      nombre: String(doc.nombre ?? ''),
      descripcion: (doc.descripcion as string) ?? null,
      piezas: Number(doc.numeroDePiezas ?? 0),
      actualizada: String(doc.updatedAt ?? ''),
      // Se avisa en vez de descartar en silencio: una preparación que perdió
      // media pierna sin decir nada es peor que un aviso.
      desfasada: Boolean(doc.atlasVersion) && doc.atlasVersion !== catalogo.version,
    }))
  })
}

export async function obtenerInstancia(
  id: unknown,
): Promise<
  Respuesta<{
    id: string
    nombre: string
    descripcion: string | null
    segmento: string | null
    contenido: ContenidoDeInstancia
    perdidas: string[]
  }>
> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const catalogo = await leerCatalogo()

    const doc = (await payload.findByID({
      collection: 'instancias-atlas',
      id: exigirIdentificador(id, 'La preparación'),
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const bruto = doc.contenido as Record<string, unknown> | null
    const contenido = normalizarSeleccion(catalogo, bruto?.piezas, bruto?.vista, bruto?.cortes)

    return {
      id: String(doc.id),
      nombre: String(doc.nombre ?? ''),
      descripcion: (doc.descripcion as string) ?? null,
      segmento: doc.segmento === null || doc.segmento === undefined ? null : String(doc.segmento),
      contenido,
      perdidas: piezasPerdidas(catalogo, {
        ...contenido,
        // Se comparan los identificadores tal como se guardaron, no los ya
        // filtrados: si no, nunca habría nada que avisar.
        piezas: Array.isArray(bruto?.piezas)
          ? (bruto.piezas as { id?: string }[])
              .map((p) => ({ id: typeof p === 'string' ? p : String(p?.id ?? '') }))
              .filter((p) => p.id)
          : [],
      }),
    }
  })
}

export async function guardarInstancia(
  id: unknown,
  datos: unknown,
): Promise<Respuesta<{ id: string; piezas: number }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const catalogo = await leerCatalogo()

    if (!datos || typeof datos !== 'object') throw new Error('No llegó nada que guardar.')
    const entrada = datos as Record<string, unknown>

    const contenido = normalizarSeleccion(catalogo, entrada.piezas, entrada.vista, entrada.cortes)
    if (contenido.piezas.length === 0) {
      throw new Error('Encienda al menos una pieza antes de guardar la preparación.')
    }

    const documento = {
      nombre: exigirTexto(entrada.nombre, 'El nombre', 120),
      descripcion: textoOpcional(entrada.descripcion, 'La descripción', 600) ?? null,
      segmento: entrada.segmento ? exigirIdentificador(entrada.segmento, 'El segmento') : null,
      contenido,
      atlasVersion: catalogo.version,
    }

    const guardada =
      id === null || id === undefined || id === ''
        ? await payload.create({
            collection: 'instancias-atlas',
            data: documento as never,
            user: usuario as never,
          })
        : await payload.update({
            collection: 'instancias-atlas',
            id: exigirIdentificador(id, 'La preparación'),
            data: documento as never,
            user: usuario as never,
          })

    revalidatePath(RUTA_PANEL)
    return { id: String((guardada as { id: unknown }).id), piezas: contenido.piezas.length }
  })
}

/**
 * Copia una preparación.
 *
 * Es el gesto que hace barato explorar: partir de «rodilla completa» y quitarle
 * cosas hasta llegar a «solo los ligamentos cruzados», sin perder la primera.
 */
export async function duplicarInstancia(id: unknown): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()

    const original = (await payload.findByID({
      collection: 'instancias-atlas',
      id: exigirIdentificador(id, 'La preparación'),
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const copia = await payload.create({
      collection: 'instancias-atlas',
      data: {
        nombre: `${String(original.nombre ?? 'Preparación')} (copia)`,
        descripcion: original.descripcion ?? null,
        segmento: original.segmento ?? null,
        contenido: original.contenido,
        atlasVersion: original.atlasVersion ?? null,
      } as never,
      user: usuario as never,
    })

    revalidatePath(RUTA_PANEL)
    return { id: String((copia as { id: unknown }).id) }
  })
}

/**
 * Las fichas que llevan un bloque con esta preparación dentro.
 *
 * Dónde buscar sale de la configuración montada, no de una lista escrita aquí
 * (ver `src/lib/usosDeLaPreparacion.ts`). Se consulta una ruta cada vez, y no
 * todas juntas en un `or`: cada ruta es un `JOIN` a una tabla de bloques, y
 * juntar seis en una sola consulta es justo el tipo de SQL que el adaptador
 * arma distinto de una versión a otra. Son una veintena de consultas pequeñas
 * en un gesto que se hace de vez en cuando.
 *
 * En las colecciones con borradores se mira dos veces. Sin `draft`, Payload lee
 * la tabla principal, que solo cambia al publicar; con `draft: true`, lee el
 * último borrador. Una ficha publicada con la preparación y un borrador que ya
 * la quitó sigue enseñándola a los residentes, y la contraria —el borrador que
 * la acaba de añadir— la perdería al publicar. Las dos cuentan. Se comprobó
 * contra PostgreSQL con una patología cuyo borrador cambió de preparación: sin
 * `draft` aparecía solo la vieja, con `draft: true` solo la nueva.
 *
 * En esa misma comprobación salió otra cosa que conviene saber: el adaptador
 * de Payload 3.88 no distingue la pestaña. Un bloque puesto en «Manejo» aparece
 * también al preguntar por `definicion.preparacion`, porque las seis pestañas
 * comparten la tabla del bloque y la consulta no las separa.
 * Para esta pregunta da igual —se agrupa por documento—, y por eso el mensaje
 * dice qué ficha y no en qué pestaña: esa respuesta no sería de fiar.
 *
 * `overrideAccess: true` a propósito: la pregunta es «¿se rompe algo?», y una
 * ficha que el editor no puede ver se rompe igual.
 */
async function documentosQueUsanLaPreparacion(
  payload: Payload,
  id: string,
): Promise<UsoDeLaPreparacion[]> {
  const usos = new Map<string, UsoDeLaPreparacion>()
  const colecciones = coleccionesQueInsertanPreparaciones(
    payload.config.collections as unknown as ColeccionMontada[],
  )
  for (const coleccion of colecciones) {
    for (const ruta of coleccion.rutas) {
      for (const draft of coleccion.versionada ? [false, true] : [false]) {
        const { docs } = await payload.find({
          collection: coleccion.coleccion as never,
          where: { [ruta]: { equals: id } } as never,
          depth: 0,
          limit: 100,
          draft,
          overrideAccess: true,
        })
        for (const documento of docs as unknown as Record<string, unknown>[]) {
          const clave = `${coleccion.coleccion}:${String(documento.id)}`
          if (usos.has(clave)) continue
          const titulo = documento[coleccion.titulo]
          usos.set(clave, {
            coleccion: coleccion.coleccion,
            id: String(documento.id),
            titulo: typeof titulo === 'string' && titulo.trim() ? titulo : `#${String(documento.id)}`,
            etiqueta: coleccion.etiqueta,
          })
        }
      }
    }
  }
  return [...usos.values()]
}

/**
 * Borra una preparación, pero no si alguna ficha la usa.
 *
 * Antes borraba sin mirar, y el taller se limitaba a advertir en la
 * confirmación. La base no protege nada —la relación del bloque queda a nulo
 * al borrar— así que el aviso era lo único entre el clic y una ficha publicada
 * con el visor vacío. Ahora se rechaza diciendo cuáles, para que el
 * traumatólogo decida si quita el bloque o se queda con la preparación.
 */
export async function eliminarInstancia(id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const identificador = exigirIdentificador(id, 'La preparación')

    const usos = await documentosQueUsanLaPreparacion(payload, identificador)
    if (usos.length > 0) {
      // Todas cuentan para negar el borrado; solo se NOMBRAN las que este editor
      // puede editar (ver `mensajeDePreparacionEnUso`).
      throw new Error(
        mensajeDePreparacionEnUso(usos, (uso) =>
          puedeEditarModulo(usuario as unknown as UsuarioSesion, uso.coleccion),
        ),
      )
    }

    await payload.delete({
      collection: 'instancias-atlas',
      id: identificador,
      user: usuario as never,
    })
    revalidatePath(RUTA_PANEL)
    return null
  })
}

/**
 * Exporta una preparación a un modelo 3D que la consola quirúrgica pueda abrir.
 *
 * Es la guardia y una llamada. Todo el trabajo —leer el atlas, partir el hueso
 * si se pidió, agrupar, recortar la piel, nombrar, centrar, escribir el archivo
 * y crear el documento con sus notas— está en `exportarPreparacion`
 * (`src/lib/exportarPreparacion.ts`), para que un guion de servidor pueda hacer
 * exactamente lo mismo sin sesión. Lo que se devuelve y lo que dicen las notas
 * está explicado allí.
 *
 * `opciones` llega del navegador tal cual: `protagonistas` y `corte` se
 * normalizan dentro de `exportarPreparacion`, que es la otra puerta por la que
 * pueden entrar mal.
 */
export async function exportarComoModelo(
  id: unknown,
  opciones?: { protagonistas?: unknown; corte?: unknown },
): Promise<Respuesta<ModeloExportado>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const modelo = await exportarPreparacion(
      payload,
      id,
      { protagonistas: opciones?.protagonistas, corte: opciones?.corte },
      usuario,
    )
    revalidatePath(RUTA_PANEL)
    return modelo
  })
}
