'use server'

/**
 * Acciones del listado global de estructuras anatómicas (D-179, P-003 E8).
 *
 * Una acción de servidor es un extremo HTTP: se puede invocar sin pasar por la
 * ventana que la ofrece, y lo que llega es lo que el navegador quiso mandar, no
 * lo que el tipo de TypeScript promete. Cada una empieza por la guardia, vuelve a
 * mirar lo que recibe y deja lo difícil —no pisar lo escrito por otra persona— a
 * `src/lib/estructurasServidor.ts`, que es lo que también usa la planilla.
 *
 * Escriben el editor y el administrador, con el rol **real** (`exigirEditor`):
 * la ficha de una estructura no es de un módulo, y un editor restringido a un
 * módulo sigue pudiendo llenarla (la colección es material de apoyo, como los
 * segmentos). Solo «Cargar las piezas del atlas» es del administrador.
 */
import { revalidatePath } from 'next/cache'
import { accion, exigirAdmin, exigirEditor, type Respuesta } from '@/lib/guardias'
import { exigirIdentificador } from '@/lib/validacion'
import { CAMPOS_DE_LA_FICHA, type CampoDeLaFicha, type FichaCompleta } from '@/lib/estructuras'
import { leerCatalogo } from '@/lib/catalogoDelAtlas'
import {
  guardarFicha,
  leerFicha,
  leerVersiones,
  restaurarVersion,
  resumenDeLaSiembra,
  sincronizarConElAtlas,
  type ResultadoDeGuardar,
  type ResultadoDeLaSiembra,
  type VersionDeLaFicha,
} from '@/lib/estructurasServidor'

const RUTA_DEL_PANEL = '/admin-panel/estructuras'

/** Los textos que llegan del navegador: un objeto con solo los campos de la ficha y solo cadenas. */
function textosDeLaFicha(valor: unknown, que: string): Partial<Record<CampoDeLaFicha, string>> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error(`${que} no tiene el formato esperado.`)
  }
  const bruto = valor as Record<string, unknown>
  const salida: Partial<Record<CampoDeLaFicha, string>> = {}
  for (const campo of CAMPOS_DE_LA_FICHA) {
    const texto = bruto[campo]
    if (texto === undefined) continue
    if (typeof texto !== 'string') throw new Error(`${que}: «${campo}» tiene que ser un texto.`)
    salida[campo] = texto
  }
  return salida
}

/** La ficha de una pieza y sus versiones anteriores, para abrir la ventana de edición. */
export async function leerEstructura(
  atlasId: unknown,
): Promise<Respuesta<{ ficha: FichaCompleta; versiones: VersionDeLaFicha[] }>> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const id = exigirIdentificador(atlasId, 'La pieza')
    const ficha = await leerFicha(payload, await leerCatalogo(), id)
    if (!ficha) throw new Error('Esa pieza no existe en el atlas ni en el listado.')
    return { ficha, versiones: await leerVersiones(payload, id) }
  })
}

/**
 * Guarda una ficha.
 *
 * `cambios` lleva los textos como están (`campos`) y como estaban al abrir la
 * ventana (`base`): con eso se sabe qué tocó esta persona y se detecta que otra
 * escribió el mismo campo mientras tanto (ver `guardarFicha`). Con `forzar` se
 * guarda igual, y lo que había queda en las versiones.
 */
export async function guardarEstructura(
  atlasId: unknown,
  cambios: unknown,
  forzar?: unknown,
): Promise<Respuesta<ResultadoDeGuardar>> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const id = exigirIdentificador(atlasId, 'La pieza')
    if (cambios === null || typeof cambios !== 'object') throw new Error('Los cambios no tienen el formato esperado.')
    const { campos, base, oculta, ocultaBase } = cambios as Record<string, unknown>
    const resultado = await guardarFicha(
      payload,
      await leerCatalogo(),
      id,
      {
        campos: textosDeLaFicha(campos, 'La ficha'),
        base: textosDeLaFicha(base, 'La ficha original'),
        ...(typeof oculta === 'boolean' ? { oculta } : {}),
        ocultaBase: ocultaBase === true,
      },
      { forzar: forzar === true },
    )
    if (resultado.tipo === 'guardada' && resultado.cambiados.length > 0) revalidatePath(RUTA_DEL_PANEL)
    return resultado
  })
}

/** Devuelve la ficha a una de sus versiones anteriores. Lo que había queda como una versión más. */
export async function restaurarVersionDeEstructura(
  atlasId: unknown,
  versionId: unknown,
): Promise<Respuesta<{ ficha: FichaCompleta; versiones: VersionDeLaFicha[] }>> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const id = exigirIdentificador(atlasId, 'La pieza')
    await restaurarVersion(payload, id, exigirIdentificador(versionId, 'La versión'))
    revalidatePath(RUTA_DEL_PANEL)
    const ficha = await leerFicha(payload, await leerCatalogo(), id)
    if (!ficha) throw new Error('Esa pieza no existe en el atlas ni en el listado.')
    return { ficha, versiones: await leerVersiones(payload, id) }
  })
}

/**
 * «Cargar las piezas del atlas»: crea la ficha de cada pieza que no la tenga y
 * marca las que el atlas ya no trae. Es lo que se usa en el servidor tras
 * desplegar la etapa, y tras regenerar el atlas. No pisa nada escrito
 * (`sincronizarConElAtlas`). Solo el administrador: toca miles de filas.
 */
export async function cargarPiezasDelAtlas(): Promise<Respuesta<{ resultado: ResultadoDeLaSiembra; resumen: string }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    const resultado = await sincronizarConElAtlas(payload, await leerCatalogo(), { usuario })
    revalidatePath(RUTA_DEL_PANEL)
    return { resultado, resumen: resumenDeLaSiembra(resultado) }
  })
}
