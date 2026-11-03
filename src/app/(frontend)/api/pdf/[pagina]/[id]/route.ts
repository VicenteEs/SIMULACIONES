import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { esIdDeFicha, esPaginaConPdf, nombreDelPdf, origenDe } from '@/lib/pdf'
import { FichaNoDisponible, imprimirFicha, Ocupado, SinNavegador } from '@/lib/pdfServidor'

export const dynamic = 'force-dynamic'

/**
 * «Guardar PDF» de las fichas: el archivo, ya hecho, en vez del diálogo de
 * impresión del navegador (D-244).
 *
 * Una ruta y no una acción de servidor, por lo mismo que las planillas: lo que
 * se entrega es un archivo, con su nombre y su tipo. La sesión se comprueba
 * aquí, antes de abrir ningún navegador, para que una petición sin sesión no
 * cueste una impresión. Lo que la persona puede ver o no de esa ficha lo decide
 * después la propia página, con sus reglas de siempre: el navegador entra con
 * las cookies de quien pide, así que no puede imprimir nada que esa cuenta no
 * vea en pantalla.
 */
const texto = (estado: number, mensaje: string, extra: Record<string, string> = {}) =>
  new Response(mensaje, {
    status: estado,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  })

export async function GET(_peticion: Request, { params }: { params: Promise<{ pagina: string; id: string }> }) {
  const { pagina, id } = await params
  if (!esPaginaConPdf(pagina) || !esIdDeFicha(id)) return texto(404, 'Esa ficha no tiene PDF.')

  const cabeceras = await siguientesCabeceras()
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: cabeceras })
  if (!user || !(user as { activo?: boolean }).activo) return texto(401, 'Hay que entrar para guardar el PDF.')

  try {
    const { bytes, titulo } = await imprimirFicha(
      `/${pagina}/${id}`,
      cabeceras.get('cookie'),
      origenDe(payload.config.serverURL),
    )
    return new Response(new Blob([bytes as BlobPart]), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${nombreDelPdf(titulo, pagina, id)}"`,
        // Lleva el nombre de quien lo pidió en cada hoja: no se guarda en
        // ninguna caché, ni en la del navegador.
        'Cache-Control': 'no-store',
      },
    })
  } catch (fallo) {
    if (fallo instanceof FichaNoDisponible) return texto(404, 'Esa ficha no se puede ver con esta cuenta.')
    if (fallo instanceof Ocupado) {
      return texto(503, 'Hay varios PDF preparándose. Vuelve a intentarlo en unos segundos.', { 'Retry-After': '10' })
    }
    if (fallo instanceof SinNavegador) {
      console.error('[pdf]', fallo.message)
      return texto(503, 'El servidor no tiene con qué preparar el PDF. Avisa al administrador.')
    }
    console.error('[pdf] no se pudo imprimir', pagina, id, fallo)
    return texto(500, 'No se pudo preparar el PDF. Vuelve a intentarlo.')
  }
}
