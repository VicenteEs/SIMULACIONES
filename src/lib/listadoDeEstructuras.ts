/**
 * El listado que enseña la pantalla de estructuras (D-179, P-003 E8.4): el atlas
 * por un lado, las fichas de la base por el otro, y una fila por pieza con su
 * estado.
 *
 * Es puro —entra el catálogo y las filas, sale el listado— para probarlo sin base
 * y para que el servidor lo arme **una vez** y mande al navegador solo lo que el
 * filtro necesita: el nombre, el estado y qué falta. El texto de las fichas no
 * viaja aquí (una ficha llena pesa kilobytes y son 2.231): la ventana de edición
 * lo pide cuando se abre la pieza.
 *
 * El sistema y la región salen **del catálogo de hoy** y no de lo guardado en la
 * fila: si se corrige una clasificación, el contador la ve de inmediato aunque
 * nadie haya vuelto a sembrar. Lo guardado solo se usa para las fichas sin pieza,
 * que ya no están en el catálogo.
 */
import type { CatalogoDelAtlas } from '@/atlas/formato'
import { nombreEnEspanol } from '@/atlas/nombres'
import {
  camposQueFaltan,
  estadoDeLaFicha,
  ladoDeLaPieza,
  type CampoDeLaFicha,
  type EstadoDeEstructura,
  type FilaDeEstructura,
  type LadoDeLaPieza,
} from '@/lib/estructuras'

export interface FilaDelListado {
  atlasId: string
  /** El nombre del taller, en español, con su lado. Es el que se enseña. */
  nombre: string
  /** El original en inglés, que es lo que se busca en la bibliografía. */
  original: string
  region: string
  sistema: string
  lado: LadoDeLaPieza | null
  estado: EstadoDeEstructura
  /** Lo que cuenta para «completa» y todavía no está escrito. */
  faltan: CampoDeLaFicha[]
  /** Si la pieza ya tiene fila en la base. Sin ella (falta sembrar) se enseña como sin empezar. */
  sembrada: boolean
}

export interface Listado {
  filas: FilaDelListado[]
  /** Piezas del atlas que todavía no tienen su ficha: lo que cargaría «Cargar las piezas del atlas». */
  sinSembrar: number
  regiones: { id: string; nombre: string }[]
  sistemas: { id: string; nombre: string }[]
}

export function armarListado(catalogo: CatalogoDelAtlas, filasDeLaBase: readonly FilaDeEstructura[]): Listado {
  const porAtlasId = new Map(filasDeLaBase.map((fila) => [fila.atlasId, fila]))
  const idsDelAtlas = new Set(catalogo.piezas.map((p) => p.id))
  const ordenDeRegion = new Map(catalogo.regiones.map((r, i) => [r.id, i]))

  const filas: FilaDelListado[] = []
  let sinSembrar = 0

  for (const pieza of catalogo.piezas) {
    const fila = porAtlasId.get(pieza.id)
    if (!fila) sinSembrar += 1
    // La marca «sin pieza» de una fila cuya pieza sí está en el catálogo es de
    // antes de la última sincronización: manda el catálogo, no la marca.
    const ficha = fila ?? {}
    filas.push({
      atlasId: pieza.id,
      nombre: nombreEnEspanol(pieza.nombre),
      original: pieza.nombre,
      region: pieza.region,
      sistema: pieza.sistema,
      lado: ladoDeLaPieza(pieza.nombre, pieza.region),
      estado: estadoDeLaFicha(pieza.sistema, ficha, { oculta: fila?.oculta }),
      faltan: camposQueFaltan(pieza.sistema, ficha),
      sembrada: Boolean(fila),
    })
  }

  // Las fichas cuya pieza ya no está en el atlas: no se borran, se enseñan.
  for (const fila of filasDeLaBase) {
    if (idsDelAtlas.has(fila.atlasId)) continue
    const sistema = fila.sistema ?? ''
    filas.push({
      atlasId: fila.atlasId,
      nombre: nombreEnEspanol(fila.nombreOriginal),
      original: fila.nombreOriginal,
      region: fila.region ?? '',
      sistema,
      lado: fila.lado ?? null,
      estado: 'sin-pieza',
      faltan: camposQueFaltan(sistema, fila),
      sembrada: true,
    })
  }

  filas.sort((a, b) => {
    const ra = ordenDeRegion.get(a.region) ?? Number.MAX_SAFE_INTEGER
    const rb = ordenDeRegion.get(b.region) ?? Number.MAX_SAFE_INTEGER
    return ra - rb || a.nombre.localeCompare(b.nombre, 'es') || a.atlasId.localeCompare(b.atlasId)
  })

  return {
    filas,
    sinSembrar,
    regiones: catalogo.regiones.map((r) => ({ id: r.id, nombre: r.nombre })),
    sistemas: catalogo.sistemas.map((s) => ({ id: s.id, nombre: s.nombre })),
  }
}
