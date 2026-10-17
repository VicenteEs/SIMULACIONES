'use server'

/**
 * La ficha de una estructura para quien usa el simulador (P-003 E9).
 *
 * Vive aparte de `estructuras.ts` porque aquel archivo es de **contenido**: todo lo suyo exige editor, y una prueba
 * (`accionesConGuardia`) lo vigila. Esta acción solo lee y es para cualquier sesión activa, residente incluido.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { accion, ErrorDeAcceso, type Respuesta } from '@/lib/guardias'
import { obtenerSesion } from '@/lib/sesion'
import { exigirIdentificador } from '@/lib/validacion'
import { leerCatalogo } from '@/lib/catalogoDelAtlas'
import { leerFicha } from '@/lib/estructurasServidor'
import { identificadoresDeInstrumento } from '@/lib/abordajeDelMusculo'

/** Lo que el botón «Info» del simulador enseña de una estructura: la ficha sin las notas internas. */
export interface FichaParaElSimulador {
  atlasId: string
  nombre: string
  /** El sistema del atlas (`muscular`, `nervous`…): el simulador ofrece «Cortar» y «Separar» solo a los músculos. */
  sistema: string
  nombreLatino: string
  definicion: string
  origen: string
  insercion: string
  inervacion: string
  accion: string
  irrigacion: string
  /** Una estructura oculta en el listado no abre ficha (P-003 E9). */
  oculta: boolean
  /** Con qué instrumentos se corta o se separa este músculo, si el editor lo dejó escrito (P-003 E10): sus identificadores. */
  abordajeCortar: string[]
  abordajeSeparar: string[]
}

/**
 * La ficha de una estructura para quien usa el simulador, sea residente o editor.
 *
 * Lectura, con cualquier sesión activa —como la colección, `lecturaSimple`—: la escritura sigue siendo del editor
 * (`guardarEstructura`). Las `notas` no salen: son del equipo, no del residente.
 */
export async function leerFichaParaElSimulador(atlasId: unknown): Promise<Respuesta<FichaParaElSimulador | null>> {
  return accion(async () => {
    const { usuario, activo } = await obtenerSesion()
    if (!usuario || !activo) throw new ErrorDeAcceso('Acceso denegado: inicie sesión.')
    const id = exigirIdentificador(atlasId, 'La pieza')
    const ficha = await leerFicha(await getPayload({ config }), await leerCatalogo(), id)
    if (!ficha || ficha.oculta) return null
    return {
      atlasId: ficha.atlasId,
      nombre: ficha.nombre,
      sistema: ficha.sistema,
      nombreLatino: ficha.nombreLatino,
      definicion: ficha.definicion,
      origen: ficha.origen,
      insercion: ficha.insercion,
      inervacion: ficha.inervacion,
      accion: ficha.accion,
      irrigacion: ficha.irrigacion,
      oculta: false,
      abordajeCortar: identificadoresDeInstrumento(ficha.abordajeCortar),
      abordajeSeparar: identificadoresDeInstrumento(ficha.abordajeSeparar),
    }
  })
}
