import { esContenidoDeMeninge, esContenidoDeSerosa, esFascia, esSistemaDeFascia } from '@/atlas/fascias'
import type { CatalogoDelAtlas, CorteDePieza, PiezaDelAtlas } from '@/atlas/formato'
import { nombreEnEspanol } from '@/atlas/nombres'
import type { PiezaLeida } from '@/lib/exportarAtlas'
import type { MallaIndexada, PlanoDeLaMalla } from '@/lib/osteotomia'
import { recortarSinTapa } from '@/lib/recorteDeCapa'

/**
 * Las fascias que entran solas en una exportación, recortadas a lo que se exporta (P-006, F-8).
 *
 * Una preparación guardada lista identificadores, y las fascias son piezas nuevas del atlas: ninguna
 * preparación que ya exista las nombra. Sin esto, exportar de nuevo una pierna daba exactamente el
 * mismo modelo de siempre, sin fascia; con la fascia entera, cada pierna cargaría con la del cuerpo
 * del que salió —una lámina de un metro de largo alrededor de una tibia—. Lo que pidió el dueño es lo
 * intermedio: «si hay una fascia que sea más grande, que aparezca cortada solo lo que ya está
 * exportado, sin toda la pieza completa».
 *
 * Es pura aritmética sobre arrays, sin disco y sin base de datos: quien la llama le da una función
 * que lee la geometría de una pieza (el paquete 15 se lee solo si hace falta).
 *
 * ## Qué entra
 *
 * Por sistema, y solo si la preparación **no trae ya ninguna pieza de ese sistema** (quien las eligió
 * a mano y las cortó con el marco ya tiene lo que quiso):
 *
 *  - **fascia profunda**, si hay algún músculo;
 *  - **fascia superficial**, si hay piel;
 *  - **fascia meníngea**, si hay cerebro, hueso del cráneo o vértebras (`esContenidoDeMeninge`): lo que ya
 *    está dentro de la zona de lo exportado —la dura del cráneo, el saco dural de la columna— se recorta
 *    como las demás, y una columna cortada en el torso conserva su saco dural y no el de todo el cuerpo.
 *
 *  - **fascia visceral**, si hay costillas, corazón o vísceras abdominales (`esContenidoDeSerosa`): el pericardio,
 *    la pleura, el peritoneo y la fascia renal que tocan la zona, recortados a ella.
 *
 * Una preparación de huesos sueltos de una pierna no gana nada, y una de huesos con piel gana solo la superficial.
 *
 * ## Dónde se corta
 *
 *  1. Por la **caja de lo exportado** —lo que no es piel ni fascia— con `MARGEN_DE_LA_FASCIA` de
 *     holgura: seis planos, y el recorte parte los triángulos que los cruzan, de modo que el borde sale
 *     recto y no dentado como el de la piel (que se recorta por triángulos enteros, D-096).
 *  2. Además, por los **planos del marco** con el que se cortó la preparación, si fue uno solo. El
 *     marco guarda en cada pieza que cortó los planos que la cruzaron (`otrosPlanos`), así que la
 *     unión de todos es el marco entero; con eso el borde de la fascia **coincide con el del músculo**
 *     cortado, en vez de asomar un centímetro por una esquina oblicua.
 */

/** Cuánto se agranda la caja de lo exportado para decidir qué fascia se queda: 1 cm. Cubre su espesor y lo que el atlas se aparta de ella. */
export const MARGEN_DE_LA_FASCIA = 0.01

/** Las que una fascia debe tener para valer la pena: menos son una esquina que el recorte dejó suelta. */
const MINIMO_DE_TRIANGULOS = 8

type Caja = readonly [readonly [number, number, number], readonly [number, number, number]]

// ------------------------------------------------------------------ el marco

/**
 * Los planos del marco que cortó la preparación, o ninguno si no se puede saber cuál fue.
 *
 * Cada corte del marco (`CorteDePieza` con `otrosPlanos`) guarda los planos que **su** pieza cruzó, que
 * son un subconjunto de los cuatro del marco: una pieza que solo cruzó el de arriba lo trae solo. Se
 * juntan los de todos los cortes cuyo trozo de dentro (`#a`) sigue encendido, y se identifican los
 * planos repetidos por su geometría —redondeada, porque cada pieza guarda el suyo con sus propios
 * decimales—.
 *
 * Es ambiguo, y no se aplica ninguno, cuando los planos forman **más de un marco**: dos recortes
 * distintos, o piezas que se movieron antes de cortarse (el plano se guarda en el espacio de cada una).
 * Se reconoce porque dos cortes del marco no comparten ningún plano. Más vale la caja sola, que es
 * conservadora, que recortar con el marco equivocado.
 */
export function planosDelMarco(
  cortes: readonly Pick<CorteDePieza, 'pieza' | 'punto' | 'normal' | 'otrosPlanos'>[],
  apagados: ReadonlySet<string> = new Set(),
): { planos: PlanoDeLaMalla[]; ambiguo: boolean } {
  const delMarco = cortes.filter((c) => (c.otrosPlanos?.length ?? 0) > 0 && !apagados.has(`${c.pieza}#a`))
  if (delMarco.length === 0) return { planos: [], ambiguo: false }

  const clave = (p: { punto: readonly number[]; normal: readonly number[] }) => {
    const l = Math.hypot(p.normal[0], p.normal[1], p.normal[2]) || 1
    const n = p.normal.map((v) => v / l)
    const d = n[0] * p.punto[0] + n[1] * p.punto[1] + n[2] * p.punto[2]
    return [...n, d].map((v) => (Math.round(v * 2000) / 2000 || 0).toFixed(4)).join(',')
  }

  const planos = new Map<string, PlanoDeLaMalla>()
  const conjuntos: Set<string>[] = []
  for (const corte of delMarco) {
    const claves = new Set<string>()
    for (const p of [{ punto: corte.punto, normal: corte.normal }, ...(corte.otrosPlanos ?? [])]) {
      const k = clave(p)
      claves.add(k)
      if (!planos.has(k)) planos.set(k, { punto: p.punto, normal: p.normal })
    }
    conjuntos.push(claves)
  }

  // Cuántos marcos hay: los conjuntos que se tocan por algún plano son el mismo marco.
  const grupos: Set<string>[] = []
  for (const c of conjuntos) {
    const dentro = grupos.filter((g) => [...c].some((k) => g.has(k)))
    const unido = new Set<string>(c)
    for (const g of dentro) for (const k of g) unido.add(k)
    for (const g of dentro) grupos.splice(grupos.indexOf(g), 1)
    grupos.push(unido)
  }
  if (grupos.length > 1) return { planos: [], ambiguo: true }
  return { planos: [...planos.values()], ambiguo: false }
}

// ------------------------------------------------------------- la zona

const NO_ES_ENVOLTURA = (p: Pick<PiezaLeida, 'sistema'>) => p.sistema !== 'integumentary' && !esSistemaDeFascia(p.sistema)

/** La caja de lo exportado que no es piel ni fascia, o `null` si no hay nada con vértices. */
export function zonaDeLoExportado(piezas: readonly PiezaLeida[]): Caja | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const pieza of piezas) {
    if (!NO_ES_ENVOLTURA(pieza)) continue
    const p = pieza.posiciones
    for (let i = 0; i + 2 < p.length; i += 3) {
      for (let e = 0; e < 3; e += 1) {
        if (p[i + e] < min[e]) min[e] = p[i + e]
        if (p[i + e] > max[e]) max[e] = p[i + e]
      }
    }
  }
  return Number.isFinite(min[0]) ? [min, max] : null
}

/** Los seis planos de una caja, con la normal hacia dentro. */
export function planosDeUnaCaja(caja: Caja, margen: number): PlanoDeLaMalla[] {
  const [min, max] = caja
  return [
    { punto: [min[0] - margen, 0, 0], normal: [1, 0, 0] },
    { punto: [max[0] + margen, 0, 0], normal: [-1, 0, 0] },
    { punto: [0, min[1] - margen, 0], normal: [0, 1, 0] },
    { punto: [0, max[1] + margen, 0], normal: [0, -1, 0] },
    { punto: [0, 0, min[2] - margen], normal: [0, 0, 1] },
    { punto: [0, 0, max[2] + margen], normal: [0, 0, -1] },
  ]
}

function seTocan(a: Caja, b: Caja, margen: number): boolean {
  for (let e = 0; e < 3; e += 1) {
    if (a[1][e] + margen < b[0][e] || b[1][e] + margen < a[0][e]) return false
  }
  return true
}

// ----------------------------------------------------------- qué sistemas

/**
 * Qué sistemas de fascia entran en esta preparación.
 *
 * Una regla por sistema, y todas con la misma salvedad: si la preparación ya trae piezas de ese sistema,
 * no se toca (son las que eligió quien la armó).
 */
export function sistemasDeFasciaQueEntran(piezas: readonly (Pick<PiezaLeida, 'sistema'> & { nombre?: string })[]): string[] {
  const hay = (sistema: string) => piezas.some((p) => p.sistema === sistema)
  const entran: string[] = []
  if (hay('muscular') && !piezas.some((p) => p.sistema === 'fascia-profunda')) entran.push('fascia-profunda')
  if (hay('integumentary') && !piezas.some((p) => p.sistema === 'fascia-superficial')) entran.push('fascia-superficial')
  if (
    piezas.some((p) => p.nombre !== undefined && esContenidoDeMeninge({ nombre: p.nombre })) &&
    !piezas.some((p) => p.sistema === 'fascia-meningea')
  ) {
    entran.push('fascia-meningea')
  }
  if (
    piezas.some((p) => p.nombre !== undefined && esContenidoDeSerosa({ nombre: p.nombre })) &&
    !piezas.some((p) => p.sistema === 'fascia-visceral')
  ) {
    entran.push('fascia-visceral')
  }
  return entran
}

// --------------------------------------------------------------- lo que hace

export interface FasciasDeLaZona {
  /** Las piezas de fascia ya recortadas, para sumar a las de la preparación. */
  piezas: PiezaLeida[]
  /** Lo que se hizo, dicho para las notas del modelo y para el panel. Vacío si no entró ninguna. */
  notas: string[]
}

/**
 * Las fascias que entran, recortadas.
 *
 * `leer` da la geometría de una pieza del catálogo, **sin tocarla**: lo que aquí se recorta es una copia.
 * Se llama solo para las piezas que tocan la zona, que son pocas, de modo que el paquete de las fascias
 * no se lee si la preparación no admite ninguna.
 */
export function fasciasDeLaZona(opciones: {
  catalogo: Pick<CatalogoDelAtlas, 'piezas'>
  piezas: readonly PiezaLeida[]
  cortes?: readonly Pick<CorteDePieza, 'pieza' | 'punto' | 'normal' | 'otrosPlanos'>[]
  apagados?: ReadonlySet<string>
  leer: (pieza: PiezaDelAtlas) => PiezaLeida
  margen?: number
}): FasciasDeLaZona {
  const { catalogo, piezas, leer, margen = MARGEN_DE_LA_FASCIA } = opciones
  const sistemas = sistemasDeFasciaQueEntran(piezas)
  if (sistemas.length === 0) return { piezas: [], notas: [] }
  const zona = zonaDeLoExportado(piezas)
  if (!zona) return { piezas: [], notas: [] }

  const marco = planosDelMarco(opciones.cortes ?? [], opciones.apagados)
  const planos = [...planosDeUnaCaja(zona, margen), ...marco.planos]
  const notas: string[] = []
  const salida: PiezaLeida[] = []

  for (const sistema of sistemas) {
    for (const pieza of catalogo.piezas) {
      if (pieza.sistema !== sistema || !esFascia(pieza)) continue
      if (!seTocan(pieza.caja, zona, margen)) continue
      const leida = leer(pieza)
      const malla: MallaIndexada = { posiciones: leida.posiciones, normales: leida.normales, indices: leida.indices }
      const recortada = recortarSinTapa(malla, planos)
      // Una pieza cuya caja toca la zona pero de la que no queda ni una cara es la que solo la roza: no
      // entra, y no se dice, porque nadie la esperaba.
      if (recortada.indices.length < MINIMO_DE_TRIANGULOS * 3) continue
      salida.push({
        ...leida,
        posiciones: recortada.posiciones,
        normales: recortada.normales as Int16Array,
        indices: recortada.indices,
      })
      notas.push(
        `${nombreEnEspanol(leida.nombre)}: se tomó la zona de lo exportado, ${recortada.indices.length / 3} de los ` +
          `${leida.indices.length / 3} triángulos.`,
      )
    }
  }
  if (marco.ambiguo) {
    notas.push(
      'La preparación se cortó con más de un marco: las fascias se recortaron solo por la caja de lo exportado, ' +
        'y su borde puede asomar donde el marco era oblicuo.',
    )
  }
  return { piezas: salida, notas }
}
