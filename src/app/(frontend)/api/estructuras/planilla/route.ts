import { ErrorDeAcceso, exigirEditor, type Respuesta } from '@/lib/guardias'
import { leerCatalogo } from '@/lib/catalogoDelAtlas'
import { leerTodasLasEstructuras } from '@/lib/estructurasServidor'
import { camposQueFaltan, esPendiente, type CampoDeLaFicha } from '@/lib/estructuras'
import { armarListado } from '@/lib/listadoDeEstructuras'
import { PlanillaIlegible } from '@/lib/leerPlanilla'
import { PlanillaSinFormato, planillaDeEstructuras, type PiezaParaLaPlanilla, type VistaDelPlan } from '@/lib/planillaDeEstructuras'
import { vieneDeAqui } from '@/lib/origenDeLaPeticion'
import { marcaDeTiempo } from '@/lib/respaldos'
import {
  MAXIMO_DE_BYTES_DE_LA_PLANILLA,
  PlanillaCambio,
  aplicarPlanilla,
  vistaPreviaDeLaPlanilla,
  type ResultadoDeAplicar,
} from '@/lib/subirPlanillaDeEstructuras'
import { ErrorDeValidacion } from '@/lib/validacion'

export const dynamic = 'force-dynamic'

/**
 * La planilla de Excel del listado de estructuras (D-179, P-003 E8.5): se descarga
 * por región y se sube llena.
 *
 * Una ruta y no una acción de servidor, por lo que ya dice `next.config.mjs` de las
 * subidas: una acción recibe el cuerpo entero en memoria y Next lo corta en
 * silencio por encima de su tope, y una planilla es un archivo. La descarga es un
 * archivo también (como `/api/registro/planilla`).
 *
 * Las dos puntas exigen editor con el rol **real**: una ruta es otro extremo HTTP y
 * se alcanza sin pasar por la pantalla que la ofrece. Y la subida comprueba que la
 * petición venga de esta misma plataforma (`vieneDeAqui`), que en una acción de
 * servidor viene puesto por Next y en una ruta no.
 */

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const responder = <T>(cuerpo: Respuesta<T>, estado = 200): Response =>
  Response.json(cuerpo, { status: estado, headers: { 'Cache-Control': 'no-store' } })

/** Un fallo con su motivo y el código que le toca: lo que es de quien llama, 4xx; lo demás, 500. */
function fallo(error: unknown): Response {
  if (error instanceof ErrorDeAcceso) return responder({ exito: false, mensaje: error.message }, 403)
  if (error instanceof PlanillaIlegible || error instanceof PlanillaSinFormato || error instanceof ErrorDeValidacion) {
    return responder({ exito: false, mensaje: error.message }, 400)
  }
  if (error instanceof PlanillaCambio) return responder({ exito: false, mensaje: error.message }, 409)
  console.error('[planilla de estructuras]', error)
  return responder({ exito: false, mensaje: 'No se pudo completar la operación. El detalle queda en el registro del servidor.' }, 500)
}

/** El nombre del archivo que se descarga; sin más caracteres que los de un nombre de archivo, venga lo que venga en la región. */
const nombreDeArchivo = (region: string, contenido: string) =>
  `estructuras-${region}-${contenido}-${marcaDeTiempo()}.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '-')

export async function GET(peticion: Request) {
  try {
    const { payload } = await exigirEditor()
    const parametros = new URL(peticion.url).searchParams
    const region = parametros.get('region') ?? ''
    const conLoEscrito = parametros.get('contenido') === 'escrita'
    const soloPendientes = parametros.get('solo') !== 'todas'

    const catalogo = await leerCatalogo()
    if (region !== 'todas' && !catalogo.regiones.some((r) => r.id === region)) {
      return responder({ exito: false, mensaje: 'Esa región no existe en el atlas.' }, 400)
    }

    const filas = await leerTodasLasEstructuras(payload)
    const porId = new Map(filas.map((f) => [f.atlasId, f]))
    const listado = armarListado(catalogo, filas)
    const piezas: PiezaParaLaPlanilla[] = listado.filas
      .filter((f) => f.estado !== 'sin-pieza')
      .filter((f) => region === 'todas' || f.region === region)
      // «Solo las pendientes» deja fuera lo completo y lo oculto; con «todas», sale todo y el que está oculto lo dice.
      .filter((f) => !soloPendientes || esPendiente(f.estado))
      .map((f) => {
        const ficha = porId.get(f.atlasId)
        return {
          atlasId: f.atlasId,
          nombre: f.nombre,
          original: f.original,
          lado: f.lado,
          sistema: f.sistema,
          faltan: camposQueFaltan(f.sistema, ficha ?? {}) as CampoDeLaFicha[],
          ...(conLoEscrito && ficha ? { ficha } : {}),
          oculta: f.estado === 'oculta',
        }
      })

    const nombreDelSistema = (id: string) => listado.sistemas.find((s) => s.id === id)?.nombre ?? id
    const nombreDeLaRegion = region === 'todas' ? 'Todas las regiones' : (listado.regiones.find((r) => r.id === region)?.nombre ?? region)
    const bytes = planillaDeEstructuras(piezas, nombreDelSistema, `Estructuras anatómicas · ${nombreDeLaRegion}`)
    return new Response(new Blob([bytes as BlobPart]), {
      headers: {
        'Content-Type': TIPO_XLSX,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${nombreDeArchivo(region, conLoEscrito ? 'escrita' : 'vacia')}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return fallo(error)
  }
}

export async function POST(peticion: Request) {
  try {
    if (!vieneDeAqui(peticion)) return responder({ exito: false, mensaje: 'La petición no viene de esta plataforma.' }, 403)
    const { payload, usuario } = await exigirEditor()

    // El peso, antes de leer un solo byte del cuerpo: el navegador lo anuncia.
    const anunciado = Number(peticion.headers.get('content-length'))
    if (Number.isFinite(anunciado) && anunciado > MAXIMO_DE_BYTES_DE_LA_PLANILLA + 64 * 1024) {
      return responder({ exito: false, mensaje: 'La planilla es demasiado grande: no parece una planilla de estructuras.' }, 413)
    }

    const formulario = await peticion.formData().catch(() => null)
    const archivo = formulario?.get('archivo')
    if (!formulario || !(archivo instanceof File) || archivo.size === 0) {
      return responder({ exito: false, mensaje: 'No llegó ninguna planilla. Elija el archivo .xlsx.' }, 400)
    }
    const accion = formulario.get('accion')
    if (accion !== 'vista' && accion !== 'aplicar') return responder({ exito: false, mensaje: 'Falta decir qué hacer con la planilla.' }, 400)
    const opciones = { reemplazar: formulario.get('reemplazar') === '1', alLadoOpuesto: formulario.get('ladoOpuesto') === '1' }
    const bytes = new Uint8Array(await archivo.arrayBuffer())
    const catalogo = await leerCatalogo()

    if (accion === 'vista') {
      return responder<{ vista: VistaDelPlan }>({ exito: true, datos: { vista: await vistaPreviaDeLaPlanilla(payload, catalogo, bytes, opciones) } })
    }

    const huella = formulario.get('huella')
    if (typeof huella !== 'string' || !/^[0-9a-f]{64}$/.test(huella)) {
      return responder({ exito: false, mensaje: 'Falta la huella de la vista previa: vea primero lo que se va a escribir.' }, 400)
    }
    const resultado = await aplicarPlanilla(payload, catalogo, bytes, opciones, huella, {
      usuario,
      nombreDelArchivo: archivo.name.slice(0, 120),
    })
    return responder<{ resultado: ResultadoDeAplicar }>({ exito: true, datos: { resultado } })
  } catch (error) {
    return fallo(error)
  }
}
