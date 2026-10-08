import { rolDeSistema } from '@/atlas/clasificacion'
import { nombreEnEspanol } from '@/atlas/nombres'
import {
  idDeFragmento,
  piezaDe,
  planosDeUnCorte,
  sufijoDeTrozo,
  type ContenidoDeInstancia,
  type CorteDePieza,
  type TransformacionGuardada,
} from '@/atlas/formato'
import { partirMalla, partirPorVariosPlanos, type MallaIndexada } from '@/lib/osteotomia'
import type { HuesoPartidoDeAntes, PiezaLeida } from '@/lib/exportarAtlas'
import type { TrozoDelHueso, Vector3 } from '@/lib/planoDeCorte'

/**
 * Rehacer en el servidor lo que el taller enseña, a partir de lo que guarda.
 *
 * **Por qué existe.** «Exportar como modelo» leía de la preparación solo la
 * lista de piezas encendidas y exportaba la geometría original de cada una:
 * ni lo que se había movido ni lo que se había cortado. Una tibia partida con
 * un trozo apagado salía **entera**, en su sitio, con el trozo que se veía y
 * también el que no; y todo lo que el traumatólogo desplazó salía donde nació.
 * El archivo tenía piezas que no estaban en el visor, y en el visor había cosas
 * que el archivo no tenía. La causa era que el taller sabía dibujar lo guardado
 * —cortar con `partirMalla`, mover con `centro + mover + giro·(p − centro)`— y
 * el exportador no, y nadie iba a enterarse hasta abrir el archivo.
 *
 * Aquí se hace lo mismo que `crearTodosLosFragmentos` y `colocarFragmento` del
 * taller, con las mismas funciones de corte y la misma cuenta, pero sobre
 * mallas en memoria y sin escena: lo que se exporta es lo que se ve.
 *
 * **Qué sale suelto.** El resto se funde por sistema para que el archivo pese
 * poco (ver `agruparParaGlb`). Salen como objeto propio:
 *
 *  - las piezas y los trozos que se movieron o giraron: son lo que el
 *    traumatólogo quiso enseñar fuera de su sitio;
 *  - todos los trozos de un hueso con fractura del asistente;
 *  - lo que se marcó como suelto en la barra lateral de la preparación
 *    (`contenido.sueltas`), que es la única forma de pedir más.
 *
 * Un corte «de rebanada» (el marco de recortar) parte decenas de piezas y no se
 * deja suelto por ello: sus trozos se funden con su sistema igual que antes,
 * con la misma forma que se ve.
 */

const EPSILON_DE_GIRO = 1e-7
const EPSILON_DE_TRASLADO = 1e-9

export interface Reproduccion {
  /** Las piezas tal como se ven: partidas y colocadas. Los trozos llevan su `sufijo`. */
  piezas: PiezaLeida[]
  /** Identificadores (de pieza o de trozo) que salen como objeto propio. */
  sueltas: string[]
  /**
   * El hueso con exactamente un corte, si es el único del archivo: se exporta
   * con su trozo distal como el fragmento que la consola mueve.
   */
  partido: HuesoPartidoDeAntes | null
  /** Lo que no se pudo rehacer o no encaja con el simulador, dicho para las notas. */
  avisos: string[]
}

type Transformacion = Partial<TransformacionGuardada> | null | undefined

/** Si la transformación mueve algo: un cuaternión de identidad y un traslado nulo son «no se tocó». */
export function estaMovida(t: Transformacion): boolean {
  if (!t) return false
  const m = t.mover
  if (m && (Math.abs(m[0]) > EPSILON_DE_TRASLADO || Math.abs(m[1]) > EPSILON_DE_TRASLADO || Math.abs(m[2]) > EPSILON_DE_TRASLADO)) return true
  const g = t.girar
  if (g && (Math.abs(g[0]) > EPSILON_DE_GIRO || Math.abs(g[1]) > EPSILON_DE_GIRO || Math.abs(g[2]) > EPSILON_DE_GIRO)) return true
  return false
}

function cajaDeLaMalla(posiciones: Float32Array): { min: Vector3; max: Vector3 } {
  const min: Vector3 = [Infinity, Infinity, Infinity]
  const max: Vector3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < posiciones.length; i += 3) {
    for (let e = 0; e < 3; e += 1) {
      const v = posiciones[i + e]
      if (v < min[e]) min[e] = v
      if (v > max[e]) max[e] = v
    }
  }
  return { min, max }
}

function centroDe(posiciones: Float32Array): Vector3 {
  const { min, max } = cajaDeLaMalla(posiciones)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/** Gira un vector por un cuaternión [x, y, z, w] unitario. */
function girar(v: Vector3, q: readonly [number, number, number, number]): Vector3 {
  const [qx, qy, qz, qw] = q
  // t = 2 · (q.xyz × v);  v' = v + w·t + q.xyz × t
  const tx = 2 * (qy * v[2] - qz * v[1])
  const ty = 2 * (qz * v[0] - qx * v[2])
  const tz = 2 * (qx * v[1] - qy * v[0])
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ]
}

/**
 * Coloca una malla como la coloca el taller: `centro + mover + giro·(p − centro)`
 * para los vértices y solo el giro para las normales. Devuelve copias: las
 * mallas de entrada pueden ser del paquete del atlas y no se escriben.
 */
export function colocarMalla(malla: MallaIndexada, t: Transformacion, centro: Vector3 = centroDe(malla.posiciones)): MallaIndexada {
  if (!estaMovida(t)) {
    return { posiciones: malla.posiciones.slice(), normales: malla.normales.slice() as MallaIndexada['normales'], indices: malla.indices.slice() }
  }
  const mover = t?.mover ?? [0, 0, 0]
  const q = (t?.girar ?? [0, 0, 0, 1]) as [number, number, number, number]
  const posiciones = new Float32Array(malla.posiciones.length)
  for (let i = 0; i + 2 < posiciones.length; i += 3) {
    const r = girar([malla.posiciones[i] - centro[0], malla.posiciones[i + 1] - centro[1], malla.posiciones[i + 2] - centro[2]], q)
    posiciones[i] = centro[0] + mover[0] + r[0]
    posiciones[i + 1] = centro[1] + mover[1] + r[1]
    posiciones[i + 2] = centro[2] + mover[2] + r[2]
  }
  const enteras = malla.normales instanceof Int16Array
  const normales = enteras ? new Int16Array(malla.normales.length) : new Float32Array(malla.normales.length)
  for (let i = 0; i + 2 < normales.length; i += 3) {
    const k = enteras ? 32767 : 1
    const r = girar([malla.normales[i] / k, malla.normales[i + 1] / k, malla.normales[i + 2] / k], q)
    normales[i] = Math.round(r[0] * k)
    normales[i + 1] = Math.round(r[1] * k)
    normales[i + 2] = Math.round(r[2] * k)
  }
  return { posiciones, normales, indices: malla.indices.slice() }
}

/** Parte una malla por un corte guardado. `null` si el corte no atraviesa la pieza: igual que en el taller, se salta. */
function partirPorElCorte(
  malla: MallaIndexada,
  corte: Pick<CorteDePieza, 'punto' | 'normal' | 'otrosPlanos'>,
): { a: MallaIndexada; b: MallaIndexada; avisos: string[] } | null {
  try {
    if (corte.otrosPlanos && corte.otrosPlanos.length > 0) {
      const p = partirPorVariosPlanos(malla, planosDeUnCorte(corte))
      if (!p.dentro || !p.fuera || p.dentro.indices.length === 0 || p.fuera.indices.length === 0) return null
      return { a: p.dentro, b: p.fuera, avisos: p.avisos }
    }
    const r = partirMalla(malla, { punto: corte.punto, normal: corte.normal })
    if (r.haciaLaNormal.indices.length === 0 || r.contraLaNormal.indices.length === 0) return null
    return { a: r.haciaLaNormal, b: r.contraLaNormal, avisos: r.avisos }
  } catch {
    return null
  }
}

/** El centro de la tapa de un corte de un solo plano, en el sitio anatómico: el foco de la fractura. */
function focoDeLaTapa(posiciones: Float32Array, punto: Vector3, normal: Vector3, holgura = 1e-5): Vector3 | null {
  const largo = Math.hypot(normal[0], normal[1], normal[2]) || 1
  const n: Vector3 = [normal[0] / largo, normal[1] / largo, normal[2] / largo]
  const suma: Vector3 = [0, 0, 0]
  let cuantos = 0
  for (let i = 0; i + 2 < posiciones.length; i += 3) {
    const d = (posiciones[i] - punto[0]) * n[0] + (posiciones[i + 1] - punto[1]) * n[1] + (posiciones[i + 2] - punto[2]) * n[2]
    if (Math.abs(d) > holgura) continue
    suma[0] += posiciones[i]
    suma[1] += posiciones[i + 1]
    suma[2] += posiciones[i + 2]
    cuantos += 1
  }
  return cuantos > 0 ? [suma[0] / cuantos, suma[1] / cuantos, suma[2] / cuantos] : null
}

interface Hoja {
  id: string
  malla: MallaIndexada
  transformacion: Transformacion
  /** El corte que la creó, si salió de uno: lo necesita el foco de la fractura. */
  corte?: CorteDePieza
  avisos: string[]
}

/**
 * Rehace la preparación guardada sobre la geometría leída del atlas.
 *
 * `base` son las piezas encendidas tal como vienen del paquete (se leen una
 * sola vez); aquí no se vuelve a tocar el disco ni la base de datos.
 */
export function reproducirPreparacion(contenido: Partial<ContenidoDeInstancia>, base: PiezaLeida[]): Reproduccion {
  const guardadas = new Map((contenido.piezas ?? []).map((p) => [p.id, p]))
  const cortes = contenido.cortes ?? []
  const apagados = new Set(contenido.apagados ?? [])
  const pedidas = new Set(contenido.sueltas ?? [])
  const huesosConFractura = new Set((contenido.fracturas ?? []).map((f) => f.pieza))
  const avisos: string[] = []

  const piezas: PiezaLeida[] = []
  const sueltas = new Set<string>()
  // Para decidir después si hay un único hueso partido en dos
  const huesosPartidos: { raiz: PiezaLeida; hojas: Hoja[] }[] = []

  for (const pieza of base) {
    const guardada = guardadas.get(pieza.id)
    const entera: MallaIndexada = { posiciones: pieza.posiciones, normales: pieza.normales, indices: pieza.indices }
    const hojas = new Map<string, Hoja>()
    hojas.set(pieza.id, {
      id: pieza.id,
      malla: entera,
      transformacion: guardada ? { mover: guardada.mover, girar: guardada.girar } : null,
      avisos: [],
    })
    // Los cortes de esta pieza, en el orden en que se hicieron: el de un
    // fragmento parte la geometría que dejó el anterior (un corte que ya no se
    // puede rehacer se salta con todo lo que colgara de él).
    for (const corte of cortes) {
      if (piezaDe(corte.pieza) !== pieza.id) continue
      const padre = hojas.get(corte.pieza)
      if (!padre) continue
      const partido = partirPorElCorte(padre.malla, corte)
      if (!partido) {
        avisos.push(`Un corte de «${nombreEnEspanol(pieza.nombre)}» no se pudo rehacer y se dejó sin hacer.`)
        continue
      }
      hojas.delete(corte.pieza)
      hojas.set(idDeFragmento(corte.pieza, 'a'), { id: idDeFragmento(corte.pieza, 'a'), malla: partido.a, transformacion: corte.a, corte, avisos: partido.avisos })
      hojas.set(idDeFragmento(corte.pieza, 'b'), { id: idDeFragmento(corte.pieza, 'b'), malla: partido.b, transformacion: corte.b, corte, avisos: partido.avisos })
    }

    const partida = hojas.size > 1 || !hojas.has(pieza.id)
    const vivas = [...hojas.values()].filter((h) => !apagados.has(h.id))
    if (partida) huesosPartidos.push({ raiz: pieza, hojas: [...hojas.values()] })
    const esDeFractura = huesosConFractura.has(pieza.id)
    for (const hoja of vivas) {
      const puesta = colocarMalla(hoja.malla, hoja.transformacion)
      piezas.push({
        id: hoja.id,
        nombre: pieza.nombre,
        sistema: pieza.sistema,
        fma: pieza.fma,
        posiciones: puesta.posiciones,
        normales: puesta.normales as Int16Array,
        indices: puesta.indices,
        ...(hoja.id !== pieza.id ? { sufijo: sufijoDeTrozo(hoja.id) } : {}),
      })
      if (pedidas.has(hoja.id) || estaMovida(hoja.transformacion) || (partida && esDeFractura)) sueltas.add(hoja.id)
    }
  }

  // ¿Hay un único hueso partido en exactamente dos? Entonces su trozo distal
  // es el fragmento que la consola mueve, y el origen de ese nodo va en el foco.
  let partido: HuesoPartidoDeAntes | null = null
  const candidatos = huesosPartidos.filter(
    (h) => rolDeSistema(h.raiz.sistema) === 'hueso' && h.hojas.length === 2 && h.hojas.every((x) => !apagados.has(x.id)),
  )
  const conMasDeDos = huesosPartidos.filter((h) => rolDeSistema(h.raiz.sistema) === 'hueso' && h.hojas.length > 2)
  if (candidatos.length === 1 && conMasDeDos.length === 0) {
    const { raiz, hojas } = candidatos[0]
    const [h1, h2] = hojas
    const arriba = (h: Hoja) => {
      const c = centroDe(h.malla.posiciones)
      return c[1]
    }
    const proximal = arriba(h1) >= arriba(h2) ? h1 : h2
    const distal = proximal === h1 ? h2 : h1
    const corte = distal.corte ?? proximal.corte
    const foco = corte && !(corte.otrosPlanos && corte.otrosPlanos.length > 0) ? focoDeLaTapa(distal.malla.posiciones, corte.punto, corte.normal) : null
    // El foco, llevado a donde está ahora el trozo si se movió
    const donde: Vector3 = foco ?? (corte ? [corte.punto[0], corte.punto[1], corte.punto[2]] : centroDe(distal.malla.posiciones))
    const centroDelTrozo = centroDe(distal.malla.posiciones)
    const t = distal.transformacion
    const puesto: Vector3 = estaMovida(t)
      ? (() => {
          const r = girar([donde[0] - centroDelTrozo[0], donde[1] - centroDelTrozo[1], donde[2] - centroDelTrozo[2]], (t?.girar ?? [0, 0, 0, 1]) as [number, number, number, number])
          const m = t?.mover ?? [0, 0, 0]
          return [centroDelTrozo[0] + m[0] + r[0], centroDelTrozo[1] + m[1] + r[1], centroDelTrozo[2] + m[2] + r[2]]
        })()
      : donde
    const lado = (h: Hoja): TrozoDelHueso => (h === proximal ? 'proximal' : 'distal')
    const marcadas = piezas.map((p) => {
      const hoja = hojas.find((h) => h.id === p.id)
      return hoja ? { ...p, trozo: { lado: lado(hoja), fragmento: hoja === distal } } : p
    })
    const receta = (contenido.fracturas ?? []).find((f) => f.pieza === raiz.id)
    partido = {
      piezas: marcadas,
      corte: {
        etiqueta: nombreEnEspanol(raiz.nombre),
        descripcion: receta ? `fractura ${receta.codigo}` : 'el corte guardado en la preparación',
        avisos: [...new Set(hojas.flatMap((h) => h.avisos))].map((a) => `Al partir «${nombreEnEspanol(raiz.nombre)}»: ${a}`),
        punto: puesto,
      },
      fragmento: 'distal',
    }
    // Los dos trozos salen sueltos aunque ninguno se haya movido: uno es el
    // fragmento y el otro es su hueso.
    for (const h of hojas) if (!apagados.has(h.id)) sueltas.add(h.id)
  } else if (huesosPartidos.some((h) => rolDeSistema(h.raiz.sistema) === 'hueso')) {
    const n = huesosPartidos.filter((h) => rolDeSistema(h.raiz.sistema) === 'hueso').length
    avisos.push(
      n > 1
        ? `Hay ${n} huesos partidos: la consola mueve un solo fragmento, así que ninguno sale marcado como el que se mueve. Márquelo en el caso.`
        : 'El hueso tiene más de dos fragmentos: la consola mueve uno solo, así que ninguno sale marcado como el que se mueve. Márquelo en el caso.',
    )
  }

  return { piezas, sueltas: [...sueltas], partido, avisos }
}
