'use server'

/**
 * Las acciones de «Medios de la página» (P-007 E2): guardar y restaurar los
 * textos de las páginas públicas, restaurar una foto y retirar las anteriores.
 *
 * Subir una foto no está aquí: va por la ruta de subida del panel
 * (`api/subidas/[coleccion]`), que recibe el archivo en flujo y corta en el byte
 * en que se pasa del techo; una acción reuniría el archivo entero en memoria
 * antes de mirarlo (`src/admin/subidas.ts`).
 *
 * Todas son del administrador y lo comprueban primero: lo que cambian lo ve
 * cualquiera que abra la portada. El registro de acciones (D-145) anota cada
 * escritura solo, porque las dos colecciones pasan por `conRegistro`.
 */

import type { Payload } from 'payload'
import { accion, exigirAdmin, type Respuesta } from '@/lib/guardias'
import { ErrorDeValidacion } from '@/lib/validacion'
import { espacioDeFoto, espacioDeTexto, normalizarTexto, problemaDelTexto } from '@/lib/espaciosDeLaPagina'
import { SLUG_DE_FOTOS, SLUG_DE_TEXTOS, leerCambios } from '@/lib/mediosDeLaPagina'

/** Cuántos textos se guardan de una vez, como mucho: una sección entera cabe de sobra. */
const MAXIMO_POR_GUARDADO = 80

function exigirEspacioDeTexto(valor: unknown) {
  const espacio = espacioDeTexto(valor)
  if (!espacio) throw new ErrorDeValidacion('Ese texto no existe en la página.')
  return espacio
}

function exigirEspacioDeFoto(valor: unknown) {
  const espacio = espacioDeFoto(valor)
  if (!espacio) throw new ErrorDeValidacion('Esa foto no existe en la página.')
  return espacio
}

/** Borra todas las filas de un espacio en una colección, y dice cuántas eran. */
async function borrarDelEspacio(payload: Payload, coleccion: string, espacio: string, salvo?: string): Promise<number> {
  const { docs } = await payload.find({
    collection: coleccion as never,
    where: { espacio: { equals: espacio } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const sobran = (docs as { id: string | number }[]).filter((d) => String(d.id) !== salvo)
  // Una por una y no con `delete({ where })`: así cada borrado pasa por los
  // ganchos de la colección —el del registro de acciones y, en las fotos, el de
  // Payload que quita el archivo del disco— con su fila delante.
  for (const fila of sobran) {
    await payload.delete({ collection: coleccion as never, id: fila.id, overrideAccess: true })
  }
  return sobran.length
}

/**
 * Guarda los textos de una sección.
 *
 * Todo o nada en la validación: se comprueban todos antes de escribir el
 * primero, para no dejar la sección a medias con un titular nuevo y la bajada
 * vieja porque el tercer campo se pasaba de largo. La pantalla ya los valida
 * con la misma regla; esto es para quien llame sin pantalla.
 *
 * Un texto que vuelve a ser igual a su original no se guarda: se borra su fila,
 * y el espacio queda «Original» en la pestaña en lugar de «Cambiado» con el
 * mismo contenido.
 */
export async function guardarTextosDeLaPagina(cambios: unknown): Promise<Respuesta<{ guardados: number }>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    if (!Array.isArray(cambios) || cambios.length === 0) throw new ErrorDeValidacion('No llegó ningún texto que guardar.')
    if (cambios.length > MAXIMO_POR_GUARDADO) throw new ErrorDeValidacion('Son demasiados textos de una vez.')

    const limpios = cambios.map((bruto) => {
      const fila = (typeof bruto === 'object' && bruto !== null ? bruto : {}) as Record<string, unknown>
      const espacio = exigirEspacioDeTexto(fila.espacio)
      if (typeof fila.texto !== 'string') throw new ErrorDeValidacion(`«${espacio.nombre}» no llegó como texto.`)
      const texto = normalizarTexto(espacio, fila.texto)
      const problema = problemaDelTexto(espacio, texto)
      if (problema) throw new ErrorDeValidacion(problema)
      return { espacio, texto }
    })

    const { textos } = await leerCambios(payload)
    let guardados = 0
    for (const { espacio, texto } of limpios) {
      const actual = textos.get(espacio.id)
      if (texto === espacio.original) {
        if (actual) guardados += (await borrarDelEspacio(payload, SLUG_DE_TEXTOS, espacio.id)) > 0 ? 1 : 0
        continue
      }
      if (actual?.texto === texto) continue
      if (actual) {
        await payload.update({ collection: SLUG_DE_TEXTOS as never, id: actual.id, data: { texto } as never, overrideAccess: true })
        // Si dos administradores guardaron a la vez quedan dos filas; se deja la
        // que se acaba de escribir.
        await borrarDelEspacio(payload, SLUG_DE_TEXTOS, espacio.id, actual.id)
      } else {
        await payload.create({ collection: SLUG_DE_TEXTOS as never, data: { espacio: espacio.id, texto } as never, overrideAccess: true })
      }
      guardados++
    }
    return { guardados }
  })
}

/** Vuelve un texto a su original: borra lo cambiado. */
export async function restaurarTextoDeLaPagina(espacio: unknown): Promise<Respuesta<{ original: string }>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    const elegido = exigirEspacioDeTexto(espacio)
    await borrarDelEspacio(payload, SLUG_DE_TEXTOS, elegido.id)
    return { original: elegido.original }
  })
}

/**
 * Vuelve una foto a la captura original: borra todas las subidas del espacio,
 * con sus archivos.
 */
export async function restaurarFotoDeLaPagina(espacio: unknown): Promise<Respuesta<null>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    const elegido = exigirEspacioDeFoto(espacio)
    await borrarDelEspacio(payload, SLUG_DE_FOTOS, elegido.id)
    return null
  })
}

/**
 * Tras una subida, retira las fotos anteriores del espacio y deja la vigente.
 *
 * No va en un gancho de la colección, que lo haría solo y siempre: dentro de
 * la creación, borrar otras filas del mismo espacio rompería a quien cree
 * varias seguidas a propósito —la matriz de roles crea una por cuenta—, y si el
 * borrado de un archivo fallara se llevaría por delante la subida buena. Aquí
 * se llama cuando la nueva ya está guardada; si no llega a llamarse, la página
 * enseña igual la más reciente (`leerCambios`) y las anteriores no se sirven
 * (`fotoPublica`).
 */
export async function retirarFotosAnteriores(espacio: unknown): Promise<Respuesta<{ retiradas: number }>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    const elegido = exigirEspacioDeFoto(espacio)
    const { fotos } = await leerCambios(payload)
    const vigente = fotos.get(elegido.id)
    if (!vigente) return { retiradas: 0 }
    return { retiradas: await borrarDelEspacio(payload, SLUG_DE_FOTOS, elegido.id, vigente.id) }
  })
}
