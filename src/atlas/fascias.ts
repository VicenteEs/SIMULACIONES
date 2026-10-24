/**
 * Las fascias en el taller (P-006).
 *
 * Son cuatro sistemas del catálogo —superficial, profunda, meníngea y visceral— con piezas que no
 * son de BodyParts3D sino que genera TraumaHub (`PiezaDelAtlas.generada`). Aquí está lo que el taller
 * y el exportador necesitan saber de ellas sin tocar el visor: cuáles son, y cómo se abre «Cuerpo»
 * con ellas. Sin `three`.
 *
 * ## Por qué «Cuerpo» las enseña apagadas
 *
 * «Cuerpo» es el atlas entero encendido (D-152), y una fascia es un manguito que envuelve a los
 * músculos: encendida de entrada, el taller se abriría con el cuerpo cubierto por una lámina rosada
 * y todo lo que el traumatólogo conoce —los músculos, la piel al 30 %— quedaría detrás de ella. Las
 * preparaciones que ya existen no la nombran y no la ganan solas (F-6): lo que se pidió fue no
 * cambiar las disposiciones. Se enciende desde los interruptores de la barra o desde el árbol, y al
 * encenderla es translúcida (`aspectoDelSistema`).
 *
 * Apagada no es lo mismo que ausente: la escena se construye **con** las fascias, porque lo que no
 * entra en la malla de su sistema al montarla no se puede encender después (ver `montarEscena`).
 */

import type { CatalogoDelAtlas, PiezaDelAtlas } from './formato'

/** Los cuatro sistemas, de lo más superficial a lo más profundo: el orden de los interruptores. */
export const SISTEMAS_DE_FASCIA = [
  'fascia-superficial',
  'fascia-profunda',
  'fascia-meningea',
  'fascia-visceral',
] as const

/** Cómo se llama cada una en un botón, donde «Fascia» ya está dicho por el grupo. */
export const NOMBRE_CORTO_DE_FASCIA: Readonly<Record<string, string>> = {
  'fascia-superficial': 'Superficial',
  'fascia-profunda': 'Profunda',
  'fascia-meningea': 'Meníngea',
  'fascia-visceral': 'Visceral',
}

export const esSistemaDeFascia = (sistema: string): boolean =>
  (SISTEMAS_DE_FASCIA as readonly string[]).includes(sistema)

export const esFascia = (pieza: Pick<PiezaDelAtlas, 'sistema'>): boolean => esSistemaDeFascia(pieza.sistema)

const HUESOS_DEL_CRANEO: ReadonlySet<string> = new Set([
  'Ethmoid',
  'Frontal bone',
  'Left parietal bone',
  'Right parietal bone',
  'Left temporal bone',
  'Right temporal bone',
  'Occipital bone',
  'Sphenoid bone',
])
const VERTEBRA = /^(?!Intervertebral).*(cervical|thoracic|lumbar) vertebra$|^(Atlas|Axis|Sacrum)$/
const DEL_CEREBRO = /gyrus|white matter|cerebellum|medulla oblongata|^pons$|midbrain|thalamus|corpus callosum/i

/**
 * Si una pieza del atlas es de lo que las meninges envuelven y sostienen: el cerebro, los huesos del cráneo o la
 * columna (vértebras y sacro). La misma lista que usa el generador (`scripts/atlas/fascias/entradas_meningeas.py`),
 * escrita de nuevo porque el navegador no lee Python; si una cambia, la otra debe cambiar.
 */
export function esContenidoDeMeninge(pieza: { nombre: string }): boolean {
  return HUESOS_DEL_CRANEO.has(pieza.nombre) || VERTEBRA.test(pieza.nombre) || DEL_CEREBRO.test(pieza.nombre)
}

const DE_UNA_SEROSA =
  / rib$|costal cartilage|intercostal muscle|^Diaphragm$|^(Body of sternum|Manubrium|Xiphoid process)$|^Wall of (ventricle|(left|right) atrium)$|^(Stomach|Spleen|Pancreas|Gallbladder|Duodenum|Appendix|Cecum|Rectum|Urinary bladder)$|^(Left|Right) kidney$|(ascending|transverse|descending|sigmoid) colon$|(jejunum|ileum)$|lobe of liver|^Liver$/i

/**
 * Si una pieza del atlas es de lo que forran las serosas y la fascia renal: la caja torácica, el corazón y las
 * vísceras abdominales. La misma lista que usa el generador (`scripts/atlas/fascias/visceral.py`), escrita de nuevo
 * porque el navegador no lee Python.
 */
export function esContenidoDeSerosa(pieza: { nombre: string }): boolean {
  return DE_UNA_SEROSA.test(pieza.nombre)
}

/** Los identificadores de todas las fascias del catálogo. */
export function idsDeFascia(catalogo: Pick<CatalogoDelAtlas, 'piezas'>): string[] {
  return catalogo.piezas.filter(esFascia).map((p) => p.id)
}

/**
 * El «Cuerpo» con que se abre el taller: todo el atlas **menos** las fascias.
 *
 * Es lo que había antes de que hubiera fascias, así que abrir «Cuerpo» o volver a él deja el mismo
 * cuerpo de siempre. «Mostrar todo» (Alt + H) sigue siendo todo, fascias incluidas.
 */
export function piezasDelCuerpoBase(catalogo: Pick<CatalogoDelAtlas, 'piezas'>): Set<string> {
  return new Set(catalogo.piezas.filter((p) => !esFascia(p)).map((p) => p.id))
}

/** Los sistemas de fascia que de verdad tienen piezas, en su orden, con lo que hace falta para pintar un interruptor. */
export function fasciasPresentes(
  catalogo: Pick<CatalogoDelAtlas, 'piezas' | 'sistemas'>,
): { id: string; nombre: string; corto: string; piezas: number }[] {
  return SISTEMAS_DE_FASCIA.flatMap((id) => {
    const piezas = catalogo.piezas.filter((p) => p.sistema === id).length
    if (piezas === 0) return []
    const nombre = catalogo.sistemas.find((s) => s.id === id)?.nombre ?? id
    return [{ id, nombre, corto: NOMBRE_CORTO_DE_FASCIA[id] ?? nombre, piezas }]
  })
}

type Caja = readonly [readonly [number, number, number], readonly [number, number, number]]

function seTocan(a: Caja, b: Caja, holgura: number): boolean {
  for (let eje = 0; eje < 3; eje += 1) {
    if (a[1][eje] + holgura < b[0][eje] || b[1][eje] + holgura < a[0][eje]) return false
  }
  return true
}

/**
 * Las piezas de un sistema de fascia que **tocan lo que hay a la vista**.
 *
 * Encender la «fascia profunda» sobre una pierna preparada no debe encender la del otro lado del
 * cuerpo ni la de los brazos: solo las que cubren algo de lo que se está viendo. Con «Cuerpo» entero
 * a la vista tocan todas, que es lo esperado. Se compara contra la caja de lo visible que **no es
 * piel ni fascia** —la piel envuelve todo y haría que tocaran todas—, con `holgura` de margen (un
 * centímetro: lo que mide el espesor de una fascia más lo que el atlas se aparta de ella).
 *
 * Si no hay nada a la vista que no sea piel o fascia, no hay con qué comparar y se devuelven todas
 * las del sistema: quien enciende la fascia sin nada debajo la quiere ver.
 */
export function fasciasQueTocan(
  catalogo: Pick<CatalogoDelAtlas, 'piezas'>,
  sistema: string,
  visibles: ReadonlySet<string>,
  holgura = 0.01,
): string[] {
  const delSistema = catalogo.piezas.filter((p) => p.sistema === sistema)
  const base = catalogo.piezas.filter((p) => visibles.has(p.id) && !esFascia(p) && p.sistema !== 'integumentary')
  if (base.length === 0) return delSistema.map((p) => p.id)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const p of base) {
    for (let eje = 0; eje < 3; eje += 1) {
      if (p.caja[0][eje] < min[eje]) min[eje] = p.caja[0][eje]
      if (p.caja[1][eje] > max[eje]) max[eje] = p.caja[1][eje]
    }
  }
  const zona: Caja = [min, max]
  return delSistema.filter((p) => seTocan(p.caja, zona, holgura)).map((p) => p.id)
}
