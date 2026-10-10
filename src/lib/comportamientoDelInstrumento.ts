/**
 * Qué le hace cada instrumento al paciente en el simulador (D-167).
 *
 * El catálogo dice qué es cada instrumento; esto dice qué *hace* cuando está en
 * la mano: si corta (y qué plano), si separa (y si se queda abierto solo) o si
 * perfora (y de qué calibre). Es una tabla y no un campo del catálogo por una
 * razón práctica: son las reglas del simulador, no datos que el traumatólogo
 * deba editar, y un instrumento nuevo que se cree desde el panel sin identificar
 * simplemente no hace nada, que es lo seguro.
 *
 * Se decide por `slug` (el identificador que también nombra el modelo 3D) y,
 * para lo que el panel haya creado a mano sin slug conocido, por el nombre.
 * Sin imports: lo leen la consola, el lienzo y las pruebas.
 */

export type PlanoDeCorte = 'piel' | 'musculo'

export interface ComportamientoDelInstrumento {
  /** Corta al trazar. `piel` abre la piel; `musculo` los planos profundos (bajo la piel). */
  corta: PlanoDeCorte | null
  /** Separa los bordes de una herida. */
  separa: {
    /** Cuánto puede abrir como máximo, en mm. */
    maximoMm: number
    /** Se queda abierto solo (trinquete): ambos labios se separan por igual. */
    autoestatico: boolean
  } | null
  /** Perfora: gira, avanza y deja un túnel. */
  perfora: {
    diametroMm: number
    /** Cuánto avanza por segundo con el motor, en mm. Un machuelo a mano va mucho más despacio. */
    avanceMmPorSegundo: number
  } | null
}

const NADA: ComportamientoDelInstrumento = { corta: null, separa: null, perfora: null }

const POR_SLUG: Readonly<Record<string, ComportamientoDelInstrumento>> = {
  'bisturi-piel-n22': { ...NADA, corta: 'piel' },
  'bisturi-profundo-n15': { ...NADA, corta: 'musculo' },
  electrobisturi: { ...NADA, corta: 'musculo' },
  'tijera-mayo': { ...NADA, corta: 'musculo' },
  'tijera-metzenbaum': { ...NADA, corta: 'musculo' },

  // Los de mano los sostiene un ayudante o el propio cirujano: abren poco y solo
  // mientras alguien los sujeta. Los autoestáticos se quedan abiertos con su trinquete.
  'separador-senn-miller': { ...NADA, separa: { maximoMm: 22, autoestatico: false } },
  'separador-farabeuf': { ...NADA, separa: { maximoMm: 30, autoestatico: false } },
  'separador-hohmann': { ...NADA, separa: { maximoMm: 40, autoestatico: false } },
  'separador-gelpi': { ...NADA, separa: { maximoMm: 55, autoestatico: true } },
  'separador-weitlaner': { ...NADA, separa: { maximoMm: 65, autoestatico: true } },
  'separador-beckman-adson': { ...NADA, separa: { maximoMm: 90, autoestatico: true } },

  'broca-1-5': { ...NADA, perfora: { diametroMm: 1.5, avanceMmPorSegundo: 9 } },
  'broca-2-0': { ...NADA, perfora: { diametroMm: 2.0, avanceMmPorSegundo: 9 } },
  'broca-2-5': { ...NADA, perfora: { diametroMm: 2.5, avanceMmPorSegundo: 9 } },
  'broca-3-2': { ...NADA, perfora: { diametroMm: 3.2, avanceMmPorSegundo: 9 } },
  'broca-3-5': { ...NADA, perfora: { diametroMm: 3.5, avanceMmPorSegundo: 9 } },
  'broca-4-5': { ...NADA, perfora: { diametroMm: 4.5, avanceMmPorSegundo: 8 } },
  avellanador: { ...NADA, perfora: { diametroMm: 6, avanceMmPorSegundo: 3 } },
  'machuelo-3-5': { ...NADA, perfora: { diametroMm: 3.5, avanceMmPorSegundo: 2 } },
  'fresa-flexible': { ...NADA, perfora: { diametroMm: 9, avanceMmPorSegundo: 12 } },
}

/** «Broca AO 2,5 mm» → 2.5. Sin número reconocible, 3 mm: un calibre intermedio razonable. */
export function diametroEnElNombre(nombre: string): number {
  const m = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(nombre)
  if (!m) return 3
  const valor = Number(m[1].replace(',', '.'))
  return Number.isFinite(valor) && valor > 0 && valor < 20 ? valor : 3
}

export function comportamientoDelInstrumento(i: {
  slug?: string | null
  nombre: string
  icono?: string | null
}): ComportamientoDelInstrumento {
  const conocido = i.slug ? POR_SLUG[i.slug] : undefined
  if (conocido) return conocido

  // Un instrumento creado a mano: se reconoce por lo que dice su nombre. Es la
  // red de seguridad, no la regla; lo que el catálogo base trae va en la tabla.
  const nombre = i.nombre.toLowerCase()
  if (/bistur/.test(nombre) || i.icono === 'bisturi') {
    return { ...NADA, corta: /piel|\b(10|11|20|21|22)\b/.test(nombre) ? 'piel' : 'musculo' }
  }
  if (/separador|retractor/.test(nombre)) {
    return { ...NADA, separa: { maximoMm: 30, autoestatico: /autoest|gelpi|weitlaner|beckman/.test(nombre) } }
  }
  if (/broca/.test(nombre)) {
    return { ...NADA, perfora: { diametroMm: diametroEnElNombre(i.nombre), avanceMmPorSegundo: 9 } }
  }
  return NADA
}
