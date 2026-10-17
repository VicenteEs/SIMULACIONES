/**
 * Subir la planilla del listado de estructuras: la parte que toca la base (D-179,
 * P-003 E8.5).
 *
 * Lo que se decide —qué se llena, qué se reemplazaría, qué se salta— está en
 * `planillaDeEstructuras.ts`, que es puro. Aquí se junta con la base:
 *
 *  - `vistaPreviaDeLaPlanilla` **no escribe**. Lee el archivo, lee las fichas y
 *    devuelve el plan para que la pantalla lo enseñe campo a campo.
 *  - `aplicarPlanilla` vuelve a leer **el mismo archivo** y vuelve a planear con las
 *    fichas de ese momento. Si la huella no es la que la persona vio, no escribe y lo
 *    dice: lo que se escribe es siempre lo que se enseñó. No se confía en un plan que
 *    venga del navegador; llega el archivo y las opciones, y el plan lo calcula el
 *    servidor.
 *  - Escribe **todo o nada**: una transacción. Una subida que falla a la mitad no deja
 *    la mitad de una región llena y la otra no.
 *
 * Sin `'use server'` y sin guardia, a propósito: la ruta que lo llama
 * (`/api/estructuras/planilla`) ya pasó por `exigirEditor`.
 */
import { initTransaction, killTransaction, commitTransaction, createLocalReq } from 'payload'
import type { Payload, PayloadRequest } from 'payload'
import { parejasContralaterales } from '@/atlas/espejo'
import type { CatalogoDelAtlas } from '@/atlas/formato'
import { nombreEnEspanol } from '@/atlas/nombres'
import { ladoDeLaPieza } from '@/lib/estructuras'
import { leerTodasLasEstructuras } from '@/lib/estructurasServidor'
import { leerPlanilla } from '@/lib/leerPlanilla'
import {
  leerFilasDeLaPlanilla,
  planearPlanilla,
  vistaDelPlan,
  type ContextoDelPlan,
  type LecturaDeLaPlanilla,
  type OpcionesDelPlan,
  type PiezaDelPlan,
  type PlanDeLaPlanilla,
  type VistaDelPlan,
} from '@/lib/planillaDeEstructuras'
import { registrarAccion } from '@/lib/registroServidor'
import { ErrorDeValidacion } from '@/lib/validacion'

/** Lo más que pesa una planilla que se sube: una de 956 piezas llenas ocupa unos 300 KB. */
export const MAXIMO_DE_BYTES_DE_LA_PLANILLA = 6 * 1024 * 1024

/** Las parejas se calculan una vez por catálogo: comparar cajas de 2.231 piezas no hace falta repetirlo por subida. */
const parejasPorCatalogo = new WeakMap<CatalogoDelAtlas, Map<string, string>>()
const parejasDe = (catalogo: CatalogoDelAtlas): Map<string, string> => {
  let parejas = parejasPorCatalogo.get(catalogo)
  if (!parejas) {
    parejas = parejasContralaterales(catalogo)
    parejasPorCatalogo.set(catalogo, parejas)
  }
  return parejas
}

async function contextoDelPlan(payload: Payload, catalogo: CatalogoDelAtlas, req?: Partial<PayloadRequest>): Promise<ContextoDelPlan> {
  const piezas = new Map<string, PiezaDelPlan>(
    catalogo.piezas.map((p) => [
      p.id,
      { id: p.id, nombre: nombreEnEspanol(p.nombre), original: p.nombre, sistema: p.sistema, region: p.region, lado: ladoDeLaPieza(p.nombre, p.region) },
    ]),
  )
  const filas = await leerTodasLasEstructuras(payload, undefined, req)
  return { piezas, parejas: parejasDe(catalogo), fichas: new Map(filas.map((f) => [f.atlasId, f])) }
}

function leerYPlanear(bytes: Uint8Array, contexto: ContextoDelPlan, opciones: OpcionesDelPlan): { lectura: LecturaDeLaPlanilla; plan: PlanDeLaPlanilla } {
  if (bytes.length > MAXIMO_DE_BYTES_DE_LA_PLANILLA) {
    throw new ErrorDeValidacion(
      `La planilla pesa más de ${Math.round(MAXIMO_DE_BYTES_DE_LA_PLANILLA / (1024 * 1024))} MB: no parece una planilla de estructuras.`,
    )
  }
  const lectura = leerFilasDeLaPlanilla(leerPlanilla(bytes))
  return { lectura, plan: planearPlanilla(lectura, contexto, opciones) }
}

/** La vista previa: qué haría esta planilla con estas opciones. No escribe nada. */
export async function vistaPreviaDeLaPlanilla(
  payload: Payload,
  catalogo: CatalogoDelAtlas,
  bytes: Uint8Array,
  opciones: OpcionesDelPlan,
): Promise<VistaDelPlan> {
  const { lectura, plan } = leerYPlanear(bytes, await contextoDelPlan(payload, catalogo), opciones)
  return vistaDelPlan(plan, lectura)
}

/** La huella que la pantalla vio ya no es la de ahora: la planilla, las opciones o las fichas cambiaron. */
export class PlanillaCambio extends Error {}

export interface ResultadoDeAplicar {
  /** Fichas que se escribieron. */
  fichas: number
  /** Campos (y casillas «No mostrar») que se escribieron. */
  campos: number
  /** De esas fichas, las que no existían todavía y se crearon. */
  creadas: number
}

/**
 * Escribe lo que la vista previa enseñó, y solo eso.
 *
 * `huella` es la que devolvió la vista previa. Con otra, no se escribe y se lanza
 * `PlanillaCambio`: alguien tocó esas fichas, o la planilla o las opciones no son las
 * mismas, y lo que se escribiría ya no es lo que se vio.
 */
export async function aplicarPlanilla(
  payload: Payload,
  catalogo: CatalogoDelAtlas,
  bytes: Uint8Array,
  opciones: OpcionesDelPlan,
  huella: string,
  quien: { usuario: unknown; nombreDelArchivo?: string },
): Promise<ResultadoDeAplicar> {
  const req = await createLocalReq({ user: quien.usuario as never }, payload)
  const abierta = await initTransaction(req)
  try {
    const contexto = await contextoDelPlan(payload, catalogo, req)
    const { plan } = leerYPlanear(bytes, contexto, opciones)
    if (plan.huella !== huella) {
      throw new PlanillaCambio(
        'Lo que se iba a escribir cambió desde la vista previa —la planilla, las opciones o alguna ficha—. No se escribió nada: vuelva a ver la vista previa.',
      )
    }

    // Sin registro por ficha: una subida son cientos de escrituras iguales y se anota una sola.
    const contextoDeEscritura = { sinRegistro: true }
    let creadas = 0
    const piezasDelAtlas = new Map(catalogo.piezas.map((p) => [p.id, p]))
    for (const escritura of plan.escrituras) {
      const datos: Record<string, unknown> = { ...escritura.campos }
      if (escritura.oculta !== undefined) datos.oculta = escritura.oculta
      const existente = contexto.fichas.get(escritura.atlasId)
      if (existente) {
        await payload.update({
          collection: 'estructuras-anatomicas',
          id: existente.id,
          data: datos as never,
          overrideAccess: true,
          context: contextoDeEscritura,
          req,
        })
        continue
      }
      const pieza = piezasDelAtlas.get(escritura.atlasId)
      if (!pieza) throw new ErrorDeValidacion(`La pieza ${escritura.atlasId} no está en el atlas.`)
      await payload.create({
        collection: 'estructuras-anatomicas',
        data: {
          atlasId: pieza.id,
          nombreOriginal: pieza.nombre,
          sistema: pieza.sistema,
          region: pieza.region,
          lado: ladoDeLaPieza(pieza.nombre, pieza.region),
          oculta: false,
          huerfana: false,
          ...datos,
        } as never,
        overrideAccess: true,
        context: contextoDeEscritura,
        req,
      })
      creadas += 1
    }

    const resultado: ResultadoDeAplicar = {
      fichas: plan.conteo.fichasAEscribir,
      campos: plan.conteo.camposAEscribir,
      creadas,
    }
    if (resultado.fichas > 0) {
      await registrarAccion(
        payload,
        {
          accion: 'subida-de-planilla',
          usuario: quien.usuario,
          coleccion: 'estructuras-anatomicas',
          titulo: quien.nombreDelArchivo ? `Planilla «${quien.nombreDelArchivo}»` : 'Planilla de estructuras',
          detalle: detalleDelRegistro(plan, opciones, resultado),
        },
        req,
      )
    }
    if (abierta) await commitTransaction(req)
    return resultado
  } catch (error) {
    if (abierta) await killTransaction(req)
    throw error
  }
}

/** Lo que queda en el registro de acciones: quién lo ve y qué se hizo, sin copiar el contenido de las fichas. */
function detalleDelRegistro(plan: PlanDeLaPlanilla, opciones: OpcionesDelPlan, resultado: ResultadoDeAplicar): string {
  const regiones = [...plan.porRegion].map(([region, n]) => `${region}: ${n}`).join(', ')
  return [
    `${resultado.fichas} fichas y ${resultado.campos} campos escritos`,
    resultado.creadas ? `${resultado.creadas} fichas creadas` : null,
    `llenas ${plan.conteo.llenas}, completadas ${plan.conteo.completan}, con reemplazo posible ${plan.conteo.cambian}`,
    `lado opuesto: ${opciones.alLadoOpuesto ? 'sí' : 'no'}`,
    `reemplazar lo escrito: ${opciones.reemplazar ? 'sí' : 'no'}`,
    regiones ? `regiones de la planilla — ${regiones}` : null,
    `huella ${plan.huella.slice(0, 12)}`,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ')
}
