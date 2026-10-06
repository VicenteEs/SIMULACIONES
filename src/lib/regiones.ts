/**
 * Las regiones anatómicas en que se agrupan los segmentos (D-157).
 *
 * El examen físico y la biblioteca repartían sus fichas en trece segmentos
 * puestos uno detrás de otro, y quien busca «la maniobra del codo» tenía que
 * recorrer la fila entera para saber dónde empezaba el miembro superior. Esto
 * los junta bajo cuatro encabezados —miembro superior, miembro inferior,
 * esqueleto axial y generales— y los ordena de proximal a distal dentro de cada
 * uno.
 *
 * **Es una tabla fija en el código y no un campo de la base** a propósito. El
 * campo habría pedido una migración, un cambio en el formulario de segmentos y
 * rellenar trece filas a mano en cada servidor, y a cambio de nada que la tabla
 * no dé: los segmentos son los que fija la ingesta
 * (`docs/ingesta/PROMPT-DE-INGESTA.md`, `SEGMENTOS_NUEVOS_PERMITIDOS`) y no
 * crecen a diario. Si algún día hay que agrupar a mano, el campo se añade
 * entonces y esta tabla se convierte en su valor por omisión.
 *
 * Se compara por nombre sin tildes ni mayúsculas, porque el nombre lo escribe
 * una persona en el panel y «Muñeca y Mano» no debería caer en «Otros» por una
 * mayúscula. Un segmento que no figure aquí va a «Otros», al final, con todo lo
 * que traiga: nunca se pierde una ficha por no estar en la tabla.
 *
 * Es solo presentación. No cambia a qué segmento pertenece ninguna ficha, ni los
 * anclajes (`#maniobra-<id>`, `#segmento-<id>`), ni lo que se guarda.
 */

export interface Region {
  clave: string
  titulo: string
  /** Los segmentos que la componen, de proximal a distal. */
  segmentos: readonly string[]
}

export const REGIONES: readonly Region[] = [
  {
    clave: 'miembro-superior',
    titulo: 'Miembro superior',
    segmentos: ['Hombro', 'Brazo', 'Codo', 'Antebrazo', 'Muñeca y mano'],
  },
  {
    clave: 'miembro-inferior',
    titulo: 'Miembro inferior',
    segmentos: ['Cadera', 'Muslo', 'Rodilla', 'Pierna', 'Tobillo y pie'],
  },
  {
    clave: 'esqueleto-axial',
    titulo: 'Esqueleto axial',
    segmentos: ['Columna', 'Pelvis y acetábulo'],
  },
  {
    clave: 'generales',
    titulo: 'Generales',
    segmentos: ['Principios generales'],
  },
]

/** Donde cae lo que no está en la tabla. Siempre va al final. */
export const REGION_OTROS: Region = { clave: 'otros', titulo: 'Otros', segmentos: [] }

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const POSICION = new Map<string, { region: Region; posicion: number }>(
  REGIONES.flatMap((region) =>
    region.segmentos.map((nombre, posicion) => [normalizar(nombre), { region, posicion }] as const),
  ),
)

/**
 * La región de un segmento y su lugar dentro de ella.
 *
 * `posicion` es `Infinity` para lo que no se conoce, de modo que al ordenar
 * quede detrás de lo que sí.
 */
export function regionDeSegmento(nombre: unknown): { region: Region; posicion: number } {
  if (typeof nombre !== 'string') return { region: REGION_OTROS, posicion: Infinity }
  return POSICION.get(normalizar(nombre)) ?? { region: REGION_OTROS, posicion: Infinity }
}

export interface GrupoEnRegion<G> {
  region: Region
  grupos: G[]
}

/**
 * Reparte los grupos —cada uno con el nombre de su segmento— en regiones.
 *
 * Las regiones salen en el orden de la tabla y «Otros» al final; los grupos de
 * cada una, de proximal a distal. Entre dos que la tabla no distingue (dos
 * segmentos desconocidos) se respeta el orden en que llegaron, que es el que
 * les dio el autor con `orden`: la ordenación es estable.
 *
 * Una región sin grupos no se devuelve: un encabezado con nada debajo es el
 * mismo error que `agruparManiobrasPorSegmento` evita con los segmentos.
 */
export function agruparEnRegiones<G extends { titulo: string }>(grupos: readonly G[]): GrupoEnRegion<G>[] {
  const porRegion = new Map<string, { region: Region; items: { grupo: G; posicion: number }[] }>()
  for (const grupo of grupos) {
    const { region, posicion } = regionDeSegmento(grupo.titulo)
    const actual = porRegion.get(region.clave) ?? { region, items: [] }
    actual.items.push({ grupo, posicion })
    porRegion.set(region.clave, actual)
  }
  return [...REGIONES, REGION_OTROS]
    .map((region) => porRegion.get(region.clave))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map(({ region, items }) => ({
      region,
      // Comparación explícita y no una resta: `Infinity - Infinity` es NaN, y un
      // comparador que devuelve NaN deja el orden a merced del motor.
      grupos: [...items]
        .sort((a, b) => (a.posicion === b.posicion ? 0 : a.posicion < b.posicion ? -1 : 1))
        .map((i) => i.grupo),
    }))
}
