import { getPayload } from 'payload'
import config from '@payload-config'
import { leerCatalogo } from '@/lib/catalogoDelAtlas'
import { leerEquipoPublico, type ColaboradorPublico } from '@/lib/equipoPublico'
import { leerLaPagina, type PaginaLeida } from '@/lib/mediosDeLaPagina'

/**
 * Lo que pintan las páginas públicas: los textos y las fotos de «Medios de la
 * página» y el número de piezas del atlas.
 *
 * Nada de esto puede tirar la portada. Si la base no responde, `leerLaPagina`
 * devuelve los originales; si el catálogo del atlas no está instalado, la cifra
 * de piezas no sale y el texto que la nombra se lee sin ella
 * (`sustituirCifras`). Una portada sin una cifra se ve bien; una pantalla de
 * error en la puerta de entrada, no.
 */
export async function leerLaPaginaPublica(): Promise<PaginaLeida> {
  const [payload, piezas] = await Promise.all([
    getPayload({ config }).catch(() => null),
    leerCatalogo()
      .then((catalogo) => catalogo.piezas.length)
      .catch(() => null),
  ])
  return leerLaPagina(payload, { piezas })
}

/**
 * Las tarjetas de la pestaña «Equipo» para «Sobre nosotros» (D-277).
 *
 * Con la misma regla que lo de arriba: si la base no responde, la sección sale
 * con la tarjeta de Chesscore sola —que es texto de la página y no de la
 * colección— y no con la pantalla de error.
 */
export async function leerElEquipoPublico(): Promise<ColaboradorPublico[]> {
  try {
    return await leerEquipoPublico(await getPayload({ config }))
  } catch (fallo) {
    console.error('[portada] no se pudo leer el equipo; sale solo la tarjeta de la empresa', fallo)
    return []
  }
}
