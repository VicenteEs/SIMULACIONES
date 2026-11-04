/**
 * Las placas rectas a medida (P-008 E3): se pide una cantidad de agujeros —y, si se quiere, un largo— y aparecen las
 * placas de cada sistema que lo cumplen, cada una con su tornillo, su ancho y su forma de agujero.
 *
 * Desde D-259 son **solo de catálogo** (Q-011, lo que recomendó Cristóbal en D-258): el largo sale de los agujeros, con
 * la distancia de su sistema, y un largo escrito solo ordena las placas, de la que más se le acerca a la que menos.
 * Antes la distancia entre agujeros se estiraba o se encogía hasta dar el largo pedido (D-254), y salían placas que no
 * existen en ninguna caja: lo que el residente tiene que aprender es a elegir entre las que hay.
 *
 * Antes cada placa era un modelo de Blender con ocho agujeros fijos: el residente que quería una LCP de cinco no la
 * tenía, y el editor que escribía «5 orificios» en el instrumento (P-004 E6) recibía la de ocho con un aviso. Una placa
 * recta es siempre la misma lámina con una fila de agujeros, así que se genera en el navegador con las medidas de su
 * sistema (`placaRectaProcedural.ts`) en vez de modelar una por cada largo.
 *
 * Aquí está solo la cuenta, sin three: qué sistemas hay, cuánto mide una placa de tantos agujeros, dónde cae cada
 * agujero y cómo se escribe la dirección que la identifica. El dibujo vive aparte para poder probar esto sin escena.
 */

/** La forma del agujero, como la entiende el dibujo: un óvalo DCP, un combinado LCP (un ocho) o un redondo. */
export type AgujeroDeLaPlacaRecta = 'oval' | 'combi' | 'redondo'

export interface SistemaDePlacaRecta {
  /** Lo que va en la dirección y en el identificador de la placa: corto, sin espacios. */
  id: string
  /**
   * Con qué se reconoce qué hace en la escena y qué forma tienen sus agujeros (`quePuedeColocar`,
   * `formaDeLosAgujeros`). Es el de la placa del catálogo cuando la hay (D-168): una LCP 3,5 a medida se comporta
   * como la LCP 3,5 de siempre.
   */
  slug: string
  /** El nombre del sistema, con el diámetro del tornillo: `diametroDelTornilloDeLaPlaca` lo lee de aquí. */
  nombre: string
  tornilloMm: number
  /** Distancia entre agujeros contiguos, de centro a centro. */
  pasoMm: number
  anchoMm: number
  grosorMm: number
  agujero: AgujeroDeLaPlacaRecta
  /** El metal que sobra más allá de la fila de agujeros, sumando las dos puntas (como el modelo de Blender). */
  extremosMm: number
  /** Largo del óvalo, si no es el doble del tornillo (`largoDelOvalMm`): el de tercio de caña es más corto. */
  largoDelOvalMm?: number
  /** Agujeros alternados a un lado y otro del eje: las anchas, para no fisurar el hueso a lo largo de una sola línea. */
  escalonados?: boolean
  /** Muescas entre agujeros: la de reconstrucción, que se dobla por ahí. */
  muescas?: boolean
  /** La sección curva, en mm de radio: la de tercio de caña es un tercio de tubo. */
  radioDeLaSeccionMm?: number
  /** Los agujeros del modelo de Blender del catálogo, en los seis que lo tienen: con otros, el modelo ya no sirve. */
  agujerosDelCatalogo?: number
}

/**
 * Los sistemas, del tornillo más chico al más grande.
 *
 * Los seis que ya estaban en el catálogo (D-168) llevan las medidas de su modelo de Blender
 * (`scripts/instrumental/placa_*.py`), para que la placa a medida y la de siempre no se contradigan. Los cuatro nuevos
 * (2,4, 2,7, DCP 3,5 y LC-DCP 4,5) salen de fichas de fabricantes y distribuidores: son aproximadas y cambian de una
 * marca a otra, y están para que haya agujeros de varias medidas, no para planificar una cirugía (P-008 E3).
 */
export const SISTEMAS_DE_PLACA_RECTA: readonly SistemaDePlacaRecta[] = [
  { id: 'lcp-2-4', slug: 'placa-lcp-recta-2-4', nombre: 'Placa LCP recta 2,4 mm', tornilloMm: 2.4, pasoMm: 8, anchoMm: 6.5, grosorMm: 1.7, agujero: 'combi', extremosMm: 6 },
  { id: 'lc-dcp-2-7', slug: 'placa-lc-dcp-2-7', nombre: 'Placa LC-DCP 2,7 mm', tornilloMm: 2.7, pasoMm: 8, anchoMm: 8, grosorMm: 2.6, agujero: 'oval', extremosMm: 6 },
  { id: 'dcp-3-5', slug: 'placa-dcp-3-5', nombre: 'Placa DCP 3,5 mm', tornilloMm: 3.5, pasoMm: 12, anchoMm: 10, grosorMm: 3, agujero: 'oval', extremosMm: 6 },
  { id: 'lc-dcp-3-5', slug: 'placa-lc-dcp-3-5', nombre: 'Placa LC-DCP 3,5 mm', tornilloMm: 3.5, pasoMm: 13, anchoMm: 10, grosorMm: 3.2, agujero: 'oval', extremosMm: 6, agujerosDelCatalogo: 8 },
  { id: 'lcp-3-5', slug: 'placa-lcp-recta-3-5', nombre: 'Placa LCP recta 3,5 mm', tornilloMm: 3.5, pasoMm: 13, anchoMm: 11, grosorMm: 4, agujero: 'combi', extremosMm: 6, agujerosDelCatalogo: 8 },
  {
    id: 'tercio-de-cana-3-5',
    slug: 'placa-tercio-de-cana',
    nombre: 'Placa de tercio de caña 3,5 mm',
    tornilloMm: 3.5,
    pasoMm: 12,
    anchoMm: 10,
    grosorMm: 1,
    agujero: 'oval',
    extremosMm: 6,
    largoDelOvalMm: 5.4,
    radioDeLaSeccionMm: 5.8,
    agujerosDelCatalogo: 6,
  },
  // Más margen en las puntas: las muescas las dejan angostas y el primer agujero se comería el borde (como en Blender).
  { id: 'reconstruccion-3-5', slug: 'placa-reconstruccion-3-5', nombre: 'Placa de reconstrucción 3,5 mm', tornilloMm: 3.5, pasoMm: 10, anchoMm: 10, grosorMm: 2.7, agujero: 'redondo', extremosMm: 11, muescas: true, agujerosDelCatalogo: 10 },
  { id: 'dcp-4-5-estrecha', slug: 'placa-dcp-4-5', nombre: 'Placa DCP 4,5 mm estrecha', tornilloMm: 4.5, pasoMm: 16, anchoMm: 12, grosorMm: 3.6, agujero: 'oval', extremosMm: 6, agujerosDelCatalogo: 8 },
  { id: 'lc-dcp-4-5-estrecha', slug: 'placa-lc-dcp-4-5', nombre: 'Placa LC-DCP 4,5 mm estrecha', tornilloMm: 4.5, pasoMm: 18, anchoMm: 13.5, grosorMm: 4.6, agujero: 'oval', extremosMm: 6 },
  { id: 'lc-dcp-4-5-ancha', slug: 'placa-lc-dcp-4-5-ancha', nombre: 'Placa LC-DCP 4,5 mm ancha', tornilloMm: 4.5, pasoMm: 18, anchoMm: 17.5, grosorMm: 6, agujero: 'oval', extremosMm: 6, escalonados: true },
  { id: 'lcp-4-5-ancha', slug: 'placa-lcp-recta-4-5', nombre: 'Placa LCP recta 4,5/5,0 mm ancha', tornilloMm: 4.5, pasoMm: 16, anchoMm: 16, grosorMm: 5.2, agujero: 'combi', extremosMm: 6, agujerosDelCatalogo: 8 },
]

/** De 2 a 16 agujeros: con uno no hay placa, y más de 16 ya no es una placa recta de catálogo de ningún sistema. */
export const AGUJEROS_MINIMOS = 2
export const AGUJEROS_MAXIMOS = 16

export interface PlacaRecta {
  sistema: SistemaDePlacaRecta
  agujeros: number
  largoMm: number
  /** La distancia entre agujeros: la de su sistema, siempre (D-259). */
  pasoMm: number
}

export function sistemaDePlacaRecta(id: string): SistemaDePlacaRecta | undefined {
  return SISTEMAS_DE_PLACA_RECTA.find((s) => s.id === id)
}

/** El sistema que se reconoce por el slug de un instrumento del catálogo: así el editor puede pedirle otros agujeros. */
export function sistemaDelSlug(slug: string | null | undefined): SistemaDePlacaRecta | undefined {
  return slug ? SISTEMAS_DE_PLACA_RECTA.find((s) => s.slug === slug) : undefined
}

/** Lo que mide la placa del sistema con esos agujeros y su distancia de siempre. */
export function largoDeCatalogoMm(s: SistemaDePlacaRecta, agujeros: number): number {
  return agujeros * s.pasoMm + s.extremosMm
}

const redondear = (mm: number) => Math.round(mm * 10) / 10

/**
 * La placa de un sistema con esos agujeros, con el largo de catálogo: sale de los agujeros y de la distancia de su
 * sistema (D-259). Devuelve `null` si el sistema no existe o los agujeros están fuera de rango.
 */
export function placaRecta(sistemaId: string, agujeros: number): PlacaRecta | null {
  const sistema = sistemaDePlacaRecta(sistemaId)
  if (!sistema || !Number.isInteger(agujeros) || agujeros < AGUJEROS_MINIMOS || agujeros > AGUJEROS_MAXIMOS) return null
  return { sistema, agujeros, largoMm: largoDeCatalogoMm(sistema, agujeros), pasoMm: sistema.pasoMm }
}

/**
 * Dónde está cada agujero, en mm y en el marco en que los declara un modelo de Blender (D-169): x a lo ancho, y a lo
 * largo, centrados en la placa. Es lo que lee `colocarPlaca` para saber dónde cae cada tornillo.
 */
export function agujerosDeLaPlacaRectaMm(p: PlacaRecta): [number, number][] {
  const desfase = p.sistema.escalonados ? p.sistema.anchoMm * 0.11 : 0
  return Array.from({ length: p.agujeros }, (_, k): [number, number] => [
    desfase === 0 ? 0 : redondear(k % 2 === 0 ? -desfase : desfase),
    redondear((k - (p.agujeros - 1) / 2) * p.pasoMm),
  ])
}

const conComa = (mm: number) => String(redondear(mm)).replace('.', ',')

/** «Placa LCP recta 3,5 mm · 3 agujeros · 50 mm»: el diámetro del tornillo va primero, que es de donde se lee. */
export function nombreDeLaPlacaRecta(p: PlacaRecta): string {
  return `${p.sistema.nombre} · ${p.agujeros} agujeros · ${conComa(p.largoMm)} mm`
}

/** Las medidas como las escribe el catálogo (D-168). */
export function medidasDeLaPlacaRecta(p: PlacaRecta): string {
  return `Ancho ${conComa(p.sistema.anchoMm)} mm · grosor ${conComa(p.sistema.grosorMm)} mm · ${p.agujeros} agujeros a ${conComa(p.pasoMm)} mm · largo ${conComa(p.largoMm)} mm · tornillos de ${conComa(p.sistema.tornilloMm)} mm`
}

/**
 * La dirección del modelo de una placa a medida. No es una dirección de verdad: la reconocen los cargadores de
 * instrumentos (`cargarModeloDelInstrumento`) y la generan en el acto. Se guarda con la sesión como la de cualquier
 * modelo, y al volver se vuelve a generar igual.
 */
const PREFIJO_DE_LA_DIRECCION = 'procedural:placa-recta/'

export function direccionDeLaPlacaRecta(p: PlacaRecta): string {
  return `${PREFIJO_DE_LA_DIRECCION}${p.sistema.id}/${p.agujeros}/${redondear(p.largoMm)}`
}

export function esDireccionDePlacaRecta(url: string | null | undefined): boolean {
  return !!url && url.startsWith(PREFIJO_DE_LA_DIRECCION)
}

/**
 * La placa de una dirección. El largo que trae se deja de lado: una sesión guardada antes de D-259 con una placa
 * estirada vuelve con la de catálogo de esos agujeros, que es la única que existe ahora.
 */
export function placaRectaDeLaDireccion(url: string | null | undefined): PlacaRecta | null {
  if (!esDireccionDePlacaRecta(url)) return null
  const [sistema, agujeros] = url!.slice(PREFIJO_DE_LA_DIRECCION.length).split('/')
  return placaRecta(sistema ?? '', Number(agujeros))
}

/**
 * El identificador de la placa a medida como instrumento de la mano. La consola no la guarda en ningún sitio: el
 * identificador ya lo dice todo, y se rehace de él al elegirla (y al recuperar el ensayo del editor).
 */
const PREFIJO_DEL_ID = 'placa-recta:'

export function idDeLaPlacaRecta(p: PlacaRecta): string {
  return `${PREFIJO_DEL_ID}${p.sistema.id}:${p.agujeros}:${redondear(p.largoMm)}`
}

/** La placa de un identificador; como en la dirección, el largo que trae no cuenta (D-259). */
export function placaRectaDelId(id: string | null | undefined): PlacaRecta | null {
  if (!id || !id.startsWith(PREFIJO_DEL_ID)) return null
  const [sistema, agujeros] = id.slice(PREFIJO_DEL_ID.length).split(':')
  return placaRecta(sistema ?? '', Number(agujeros))
}

export interface OfertaDePlacaRecta {
  sistema: SistemaDePlacaRecta
  /** La placa de catálogo con esos agujeros, o `null` si la cantidad está fuera de rango. */
  placa: PlacaRecta | null
  /** Cuánto se pasa (+) o se queda corta (−) del largo buscado, en mm; `null` sin largo buscado. */
  diferenciaMm: number | null
}

/**
 * Todas las placas rectas con esa cantidad de agujeros (lo que pidió el dueño: «si coloca 5 agujeros, que salgan todas
 * las de esa cantidad con distintas medidas de agujero»), cada una con su largo de catálogo. Con un largo buscado,
 * primero la que más se le acerca; sin él, del tornillo más chico al más grande.
 */
export function placasConAgujeros(agujeros: number, largoMm?: number | null): OfertaDePlacaRecta[] {
  const buscado = largoMm === undefined || largoMm === null || !Number.isFinite(largoMm) ? null : largoMm
  const ofertas = SISTEMAS_DE_PLACA_RECTA.map((sistema): OfertaDePlacaRecta => {
    const placa = placaRecta(sistema.id, agujeros)
    return { sistema, placa, diferenciaMm: placa && buscado !== null ? redondear(placa.largoMm - buscado) : null }
  })
  if (buscado === null) return ofertas
  const lejos = (o: OfertaDePlacaRecta) => (o.diferenciaMm === null ? Infinity : Math.abs(o.diferenciaMm))
  return ofertas
    .map((o, i) => ({ o, i }))
    .sort((a, b) => lejos(a.o) - lejos(b.o) || a.i - b.i)
    .map(({ o }) => o)
}

/**
 * El largo como lo escribe quien pide la placa: «50», «50 mm», «5 cm» o «5,5 cm». Sin unidad son milímetros, que es
 * como se mide todo en la consola; con «cm» se pasa a milímetros. `null` si no hay un número que tenga sentido.
 */
export function largoEscritoMm(texto: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?\s*$/i.exec(texto)
  if (!m) return null
  const valor = Number(m[1].replace(',', '.')) * (m[2]?.toLowerCase() === 'cm' ? 10 : 1)
  return Number.isFinite(valor) && valor > 0 ? valor : null
}

/** Cómo se llama el agujero de cada sistema en la lista, con la sigla que lo dice en el quirófano. */
export const NOMBRE_DEL_AGUJERO: Readonly<Record<AgujeroDeLaPlacaRecta, string>> = {
  oval: 'óvalo de compresión',
  combi: 'combinado (bloqueo o compresión)',
  redondo: 'redondo',
}

/**
 * La placa a medida como un instrumento de la bandeja: lo que la consola necesita para tenerla en la mano. El `slug` es
 * el de su sistema, así que hace lo que hace una placa (`quePuedeColocar`) y sus agujeros tienen la forma que deben
 * (`formaDeLosAgujeros`).
 */
export function instrumentoDeLaPlacaRecta(p: PlacaRecta) {
  return {
    id: idDeLaPlacaRecta(p),
    nombre: nombreDeLaPlacaRecta(p),
    icono: 'placa',
    categoria: 'placas',
    slug: p.sistema.slug,
    modeloUrl: direccionDeLaPlacaRecta(p),
    orificios: p.agujeros,
    descripcion: `A medida: ${medidasDeLaPlacaRecta(p)}.`,
  }
}

/**
 * El modelo de un instrumento de la bandeja con los agujeros que el editor le escribió (P-004 E6). Antes, a una LCP 3,5
 * con «5 orificios» escritos se le ponía igual el modelo de ocho, con un aviso; ahora, si es una placa recta y su
 * modelo trae otros, se genera la de cinco (P-008 E3: «que aparezca eso y no otro»). Lo demás, el modelo de siempre.
 */
export function modeloConLosAgujerosEscritos(i: { slug?: string | null; orificios?: number | null; modeloUrl?: string | null }): string | null {
  const sistema = sistemaDelSlug(i.slug)
  if (!sistema || typeof i.orificios !== 'number' || i.orificios === sistema.agujerosDelCatalogo) return i.modeloUrl ?? null
  const placa = placaRecta(sistema.id, i.orificios)
  return placa ? direccionDeLaPlacaRecta(placa) : (i.modeloUrl ?? null)
}
