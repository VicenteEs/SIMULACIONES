import { getPayload } from 'payload'
import config from '@payload-config'
import { leerCatalogo } from '@/lib/catalogoDelAtlas'
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
