import * as THREE from 'three'
import { afilado, componerCortes, cortarMalla, husoDeLaGrieta, retraccionDelVertice, type MallaCortada, type Vec3 } from '@/lib/corteDeMalla'
import { puntaDelHuso, topeDeLaRetraccionMm } from '@/lib/retraccionDelCorte'

/**
 * La herida de una capa de partes blandas dentro de la escena (D-167).
 *
 * `corteDeMalla.ts` trabaja con arreglos y no sabe de three; esto es el pegamento:
 * pasa la incisión al espacio de la malla, la corta, sustituye su geometría por
 * la cortada y la mueve cuando se abre. Se guarda la geometría original para
 * poder cerrar la herida (deshacer el corte) sin recargar el modelo.
 */

export interface HeridaEnCapa {
  malla: THREE.Mesh
  /** La geometría de antes del corte. Se devuelve a la malla al cerrar. */
  original: THREE.BufferGeometry
  corte: MallaCortada
  /** Cuánto mide una unidad local en el mundo: las distancias del mundo se dividen por esto. */
  escala: number
  /** El borde rojo de la herida, hijo de la malla. */
  bordes: THREE.LineSegments
  /**
   * La cinta roja que mantiene a la vista una incisión recién hecha.
   *
   * Un corte limpio deja los dos labios pegados (apertura 0): la malla queda
   * partida pero no se ve, y lo único que se distinguía era el trazo rojo de
   * guía, que desaparece en cuanto se empieza otro. A quien hacía la incisión
   * con el bisturí de piel y pasaba al bisturí profundo le parecía que la
   * primera se había borrado. La cinta es el surco de la incisión: dos o tres
   * milímetros de rojo oscuro siguiendo el corte, que se aparta cuando la herida
   * abre más que eso y deja ver el plano de debajo, o en cuanto se apoya en ella
   * un separador o una pinza (`sostenida`).
   */
  cinta: THREE.Mesh
  /**
   * Cuánto aparta cada labio lo que lo sostiene —un separador, una pinza, la rueda—, en unidades del mundo (el máximo,
   * si hay perfil). No cuenta lo que la herida se abre sola: eso es `reposo`.
   */
  mas: number
  menos: number
  /**
   * Lo que cada labio se retrae solo en lo más ancho de la herida, en unidades del mundo (P-015): la tensión del
   * tejido, que lo aparta en cuanto se corta. Lo fija el corte y no cambia; lo que cambia es cuánto de él hay ahora
   * (`tension`, `asentada`). Cero en un corte que no la pide, que queda con los labios pegados como antes de P-015.
   */
  reposo: number
  /**
   * Cuánta de esa retracción queda, de 0 a 1. La sutura la lleva a cero al cerrar: el hilo es lo que vence a la
   * tensión del tejido. Sin puntadas, 1.
   */
  tension: number
  /**
   * Cuánto se ha abierto ya la herida recién hecha, de 0 a 1: el labio no aparece apartado, se va apartando detrás de
   * la hoja. Lo sube el lienzo en un tercio de segundo; fuera de ese rato, 1.
   */
  asentada: number
  /**
   * La fracción del largo de la grieta que tarda el huso de la retracción en abrirse del todo desde cada punta
   * (`husoDeLaGrieta`): la mitad en una incisión corta, que es un solo arco, y menos en una larga.
   */
  punta: number
  /**
   * Cuánto abre cada labio en cada punto de la herida, en unidades del mundo, si
   * la apertura no es pareja (separadores colocados en un punto). Sin perfil, la
   * herida abre por igual a todo lo largo (`mas`, `menos`).
   */
  perfil?: (t: number) => { mas: number; menos: number }
  /**
   * Hay un separador o una pinza apoyados en esta herida, aunque todavía no la abran (P-008 E1). La cinta y el borde
   * se apartan con eso y no esperan a que abra cinco milímetros: es lo que pidió Cristóbal, «meter el Farabeuf en
   * medio de la incisión y que la línea desaparezca» (pedido 8 de P-004). Lo pone `aplicarSeparadoresALasHeridas`.
   */
  sostenida?: boolean
  /** Unidades del mundo que mide un milímetro: lo necesita la cinta para su ancho. */
  unidadesPorMm: number
  /** El largo de la incisión, en unidades del mundo. */
  largo: number
  /**
   * Lo que tardó el corte de esta malla, en milisegundos: afinar la franja, partirla y rehacer su geometría. No lo usa
   * nada del simulador; lo lee la sonda del lienzo, para que el coste de un corte se pueda medir sobre el modelo de
   * verdad y no haya que estimarlo (P-015).
   */
  tardoMs: number
  /**
   * A qué incisión pertenece. Una incisión puede cortar varias mallas de su capa (cada una da una herida), y en una
   * misma capa puede haber varias incisiones (P-003 E4): los separadores y las pinzas pertenecen a una de ellas.
   */
  incision: number
  /** Cómo se hizo, para volver a cortarla cuando se cierra otra incisión de la misma malla. */
  trazo: { puntos: THREE.Vector3[]; normales: THREE.Vector3[]; parametros: ParametrosDeCorte }
  /** El borde quedó quemado (electrobisturí con demasiada potencia): conserva su color oscuro. */
  quemado?: boolean
  /**
   * Hay otra herida más profunda: el borde deja de ser la línea roja de «incisión recién hecha» (P-003 E4). Una
   * línea roja flotando sobre una herida que ya se profundizó es lo que Cristóbal pidió que desapareciera.
   */
  profundizada?: boolean
  /** Es de la fascia o del músculo (`ParametrosDeCorte.hondo`): no deja ninguna línea roja una vez se ve (D-411). */
  hondo?: boolean
}

/**
 * Las heridas de cada malla, en el orden en que se hicieron (P-003 E4). Cada corte parte la malla que dejó el
 * anterior, así que sus posiciones se componen (`componerCortes`) y cerrar una del medio obliga a rehacer las
 * siguientes. Vive aquí y no en cada herida para que cualquiera que abra, cierre o corte vea la misma cadena.
 */
const CADENAS = new WeakMap<THREE.Mesh, HeridaEnCapa[]>()

/** Las heridas de una malla, de la primera a la última. */
export const cadenaDeLaMalla = (malla: THREE.Mesh): readonly HeridaEnCapa[] => CADENAS.get(malla) ?? []

export interface ParametrosDeCorte {
  /** Cuánto penetra el corte hacia dentro de la malla, en unidades del mundo. */
  profundidad: number
  /** Cuánto tejido se arrastra al abrir, en unidades del mundo. */
  alcance: number
  /** Unidades del mundo por milímetro, para el ancho de la cinta. Sin él se supone 0,001 (metros). */
  unidadesPorMm?: number
  /** A qué incisión pertenece esta herida (P-003 E4). Sin él, la 0. */
  incision?: number
  /**
   * Si la capa tiene grosor, hasta dónde por debajo de la superficie se busca su cara de dentro, en unidades del
   * mundo: con él, el corte levanta la pared de cada labio (D-333). Lo pide la piel (`GROSOR_MAXIMO_DE_LA_PIEL_MM`).
   */
  pared?: number
  /**
   * Lo que cada labio se retrae solo al cortar, en lo más ancho, en unidades del mundo (P-015). Lo calcula quien corta,
   * con el plano y el largo de la incisión (`retraccionDelLabioMm`). Sin él, la herida queda cerrada hasta que algo la abra.
   */
  retraccion?: number
  /**
   * Lo que mide como mucho una arista pegada a la incisión después de cortar, en unidades del mundo (P-015): con él,
   * la franja que rodea al corte se afina para que el tejido se doble en curva (`afinarLaFranja`).
   */
  afinar?: number
  /**
   * La normal de la piel que queda encima de cada punto del trazo, en el mundo, para un plano hondo (P-015): el tejido
   * se aparta paralelo a ella y no por su propia tangente (`IncisionSobreLaMalla.normalesDeEncima`). `null` donde no
   * hay piel cortada encima; sin la lista, cada malla se aparta por la suya, como la piel.
   */
  normalesDeEncima?: (THREE.Vector3 | null)[]
  /**
   * Es un plano de debajo de la piel: la fascia o el músculo (D-411). Su borde no se queda rojo: se va con la cinta en
   * cuanto el hueco se ve solo. Sin él, la herida es de piel, y su borde dura hasta que se abre de verdad.
   */
  hondo?: boolean
}

/**
 * La piel con su grasa mide 4 mm en el cuerpo y 2 en la cabeza (D-331). La cara de dentro se busca hasta 6 mm por
 * debajo: con margen para lo que el telón la encuentra más abajo en una curva, y sin llegar a lo que hay bajo la piel.
 */
export const GROSOR_MAXIMO_DE_LA_PIEL_MM = 6

/**
 * El atributo que lee el sombreador de la piel para pintar la pared de una herida (D-333): 0 fuera de ella y, en ella,
 * 1 más los milímetros bajo la superficie. Va corrido en uno para que el 0 diga «no es de la pared»: el labio de
 * arriba de la pared está a 0 mm, igual que el resto de la piel.
 */
export const ATRIBUTO_DE_LA_PARED = 'aPared'

/**
 * Cada cuánto, como mucho, hay un vértice en los labios de una herida, en milímetros (P-008 E2). La hoja más angosta
 * mide diez: con dos milímetros entre vértices el labio se dobla donde ella apoya, y no un par de centímetros más allá.
 */
export const PASO_DEL_LABIO_MM = 2

/** Ancho mínimo de la cinta de la incisión, en milímetros (la mitad a cada lado). */
export const ANCHO_VISIBLE_DE_LA_INCISION_MM = 2.4
/** Con la herida más abierta que esto la cinta se aparta: se ve el plano de debajo. */
export const APERTURA_QUE_APARTA_LA_CINTA_MM = 5
/**
 * Una herida que se retrae sola se enseña ella misma, y la cinta deja de hacer falta en cuanto el hueco se distingue
 * (P-015). Más ancha que el hueco, lo tapaba: sobre una incisión de dos centímetros, abierta tres milímetros, era una
 * tira roja plana donde tenía que verse el corte. Por debajo de esto —una punción, o el primer instante de la
 * retracción— sigue marcando el sitio.
 */
export const ABERTURA_QUE_YA_SE_VE_MM = 1.2
/**
 * Cuánto se afina la malla junto a una incisión, en milímetros (P-015): lo que mide como mucho una arista pegada al
 * labio. Algo más que el paso del labio (`PASO_DEL_LABIO_MM`): con lo mismo, cada vértice del labio tendría su propio
 * triángulo y la franja doblaría sus vértices sin ganar curva.
 */
export const ARISTA_JUNTO_AL_CORTE_MM = 3
/** El borde de una incisión recién hecha: rojo, para que se vea sobre la piel. */
export const COLOR_DEL_BORDE_RECIEN_HECHO = 0x8c1c1c
/**
 * El borde de una herida ya abierta o ya profundizada: un tono de piel oscurecida, que deja leer el labio sin una
 * línea roja encima (P-003 E4). El quemado del electrobisturí conserva su color propio.
 */
export const COLOR_DEL_BORDE_ABIERTO = 0x4a2e27
export const COLOR_DEL_BORDE_QUEMADO = 0x1d140f

/**
 * Un valor de un atributo tal como está guardado, sin normalizar.
 *
 * `getComponent` de three devuelve lo normalizado (0 a 1) para los atributos
 * enteros que lo piden —los colores de vértice en bytes—, y al guardarlo de vuelta
 * en el mismo arreglo de bytes se truncaba a cero: la piel perdía su color justo
 * donde se cortaba. Se lee el arreglo tal cual.
 */
function valorCrudo(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, k: number): number {
  if ((a as THREE.BufferAttribute).isBufferAttribute) {
    return (a.array as unknown as ArrayLike<number>)[i * a.itemSize + k]
  }
  const intercalado = a as THREE.InterleavedBufferAttribute
  return (intercalado.data.array as unknown as ArrayLike<number>)[i * intercalado.data.stride + intercalado.offset + k]
}

/**
 * Los atributos que no son posición ni normal se llevan a la malla cortada: los vértices que había conservan el suyo y
 * cada vértice nuevo toma lo que valía la malla **en su sitio**, entre los dos vértices de que sale (`mezcla`).
 *
 * Es lo mismo que la tarjeta pintaba ahí antes de cortar —interpola a lo largo del triángulo—, así que el color y la
 * textura no cambian por mucho que la franja se afine. Hasta P-015 se copiaba el de un extremo de la arista: con los
 * pocos vértices de la grieta no se notaba; con los miles de la franja afinada, cada triángulo nuevo repetía el
 * valor de un vértice que estaba a un centímetro y la textura quedaba a rayas.
 *
 * Lo que no admite promedio —un entero sin normalizar: un índice, una marca— se sigue copiando, del más cercano.
 */
function llevarAtributo(original: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, corte: MallaCortada) {
  const tam = original.itemSize
  // Del mismo tipo que el original (colores en bytes, uv en flotantes…): copiar a
  // un Float32Array aceptaría el dato pero cambiaría cómo la tarjeta lo lee.
  const fuente = (original as THREE.BufferAttribute).isBufferAttribute
    ? (original as THREE.BufferAttribute).array
    : (original as THREE.InterleavedBufferAttribute).data.array
  const Tipo = fuente.constructor as new (n: number) => Float32Array
  const total = corte.origen.length
  const nuevo = new Tipo(total * tam)
  const { desde, de, peso } = corte.mezcla
  const flotante = fuente instanceof Float32Array || fuente instanceof Float64Array
  const seMezcla = flotante || original.normalized
  const yaEstaban = Math.min(desde, total)
  for (let i = 0; i < yaEstaban; i++) {
    for (let k = 0; k < tam; k++) nuevo[i * tam + k] = valorCrudo(original, i, k)
  }
  // Los dos de que sale cada uno van siempre antes que él: aquí ya tienen su valor.
  for (let i = yaEstaban; i < total; i++) {
    const j = i - desde
    const a = de[2 * j]
    const b = de[2 * j + 1]
    const w = peso[j]
    if (!seMezcla || a === b) {
      const cual = w > 0.5 ? b : a
      for (let k = 0; k < tam; k++) nuevo[i * tam + k] = nuevo[cual * tam + k]
      continue
    }
    for (let k = 0; k < tam; k++) {
      const v = nuevo[a * tam + k] + (nuevo[b * tam + k] - nuevo[a * tam + k]) * w
      // En bytes, guardar sin redondear truncaba: medio tono menos en cada vértice nuevo.
      nuevo[i * tam + k] = flotante ? v : Math.round(v)
    }
  }
  return new THREE.BufferAttribute(nuevo, tam, original.normalized)
}

/**
 * Corta una malla con la incisión (puntos y normales en el mundo). Devuelve
 * `null` si no cabe cortarla: no toca la malla, o tiene varios materiales por
 * grupos y reordenar sus triángulos los desordenaría.
 */
export function cortarCapa(
  malla: THREE.Mesh,
  puntos: THREE.Vector3[],
  normales: THREE.Vector3[],
  parametros: ParametrosDeCorte,
): HeridaEnCapa | null {
  const original = malla.geometry as THREE.BufferGeometry
  if (original.groups.length > 1) return null
  const posicion = original.getAttribute('position')
  if (!posicion) return null
  const alEmpezar = performance.now()
  // Una malla que ya tiene una herida se corta **cerrada**: se vuelve a su base (la del último corte) antes de leerla,
  // o el segundo corte partiría la geometría con la apertura del primero metida dentro (P-003 E4).
  const previas = CADENAS.get(malla) ?? []
  const ultima = previas[previas.length - 1]
  if (ultima) {
    ;(posicion.array as Float32Array).set(ultima.corte.posiciones)
    posicion.needsUpdate = true
  }

  malla.updateWorldMatrix(true, false)
  const aLocal = malla.matrixWorld.clone().invert()
  const escala = malla.matrixWorld.getMaxScaleOnAxis() || 1
  const aLocalVec = (v: THREE.Vector3): Vec3 => {
    const p = v.clone().applyMatrix4(aLocal)
    return [p.x, p.y, p.z]
  }
  const aLocalDir = (v: THREE.Vector3): Vec3 => {
    const d = v.clone().transformDirection(aLocal)
    return [d.x, d.y, d.z]
  }

  const posiciones = new Float32Array(posicion.count * 3)
  for (let i = 0; i < posicion.count; i++) {
    posiciones[3 * i] = posicion.getX(i)
    posiciones[3 * i + 1] = posicion.getY(i)
    posiciones[3 * i + 2] = posicion.getZ(i)
  }
  const indice = original.getIndex()
  const indices = indice
    ? Uint32Array.from(indice.array as ArrayLike<number>)
    : Uint32Array.from({ length: posicion.count }, (_, i) => i)
  // El sombreador de la piel lee el atributo de la pared en todas sus geometrías: también en la de antes del corte,
  // que es la que vuelve al cerrar. Si alguna no lo tuviera, leería lo que dejó otro programa en esa ranura.
  if (parametros.pared && !original.getAttribute(ATRIBUTO_DE_LA_PARED)) {
    original.setAttribute(ATRIBUTO_DE_LA_PARED, new THREE.BufferAttribute(new Float32Array(posicion.count), 1))
  }

  const alcanceLocal = parametros.alcance / escala
  const corte = cortarMalla(
    { posiciones, indices },
    {
      puntos: puntos.map(aLocalVec),
      normales: normales.map(aLocalDir),
      normalesDeEncima: parametros.normalesDeEncima?.map((n) => (n ? aLocalDir(n) : null)),
    },
    {
      profundidad: parametros.profundidad / escala,
      alcance: alcanceLocal,
      // Más que la arista más larga que pueda cruzarse: el corte mira solo la
      // franja que rodea a la incisión.
      holgura: alcanceLocal,
      pasoDelLabio: (PASO_DEL_LABIO_MM * (parametros.unidadesPorMm ?? 0.001)) / escala,
      pared: parametros.pared ? parametros.pared / escala : undefined,
      afinar: parametros.afinar ? parametros.afinar / escala : undefined,
    },
  )
  if (!corte) return null

  const nueva = new THREE.BufferGeometry()
  nueva.setAttribute('position', new THREE.BufferAttribute(corte.posiciones.slice(), 3))
  for (const nombre of Object.keys(original.attributes)) {
    if (nombre === 'position' || nombre === 'normal') continue
    nueva.setAttribute(nombre, llevarAtributo(original.attributes[nombre], corte))
  }
  // La pared de esta herida: lo que cada vértice suyo queda bajo la superficie, en milímetros (ver
  // `ATRIBUTO_DE_LA_PARED`). La de otra herida anterior ya vino copiada con lo demás.
  const marcaDeLaPared = nueva.getAttribute(ATRIBUTO_DE_LA_PARED) as THREE.BufferAttribute | undefined
  if (marcaDeLaPared) {
    const mmPorUnidad = escala / (parametros.unidadesPorMm ?? 0.001)
    const marca = marcaDeLaPared.array as Float32Array
    corte.pared.forEach((hondura, i) => {
      if (hondura >= 0) marca[i] = 1 + hondura * mmPorUnidad
    })
  }
  nueva.setIndex(new THREE.BufferAttribute(corte.indices, 1))
  nueva.computeVertexNormals()
  nueva.computeBoundingSphere()
  nueva.computeBoundingBox()

  // El borde de la herida: dos líneas, una por labio, que siguen a los vértices.
  const segmentos = Math.max(0, corte.labios.mas.length - 1)
  const bordesGeometria = new THREE.BufferGeometry()
  bordesGeometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentos * 4 * 3), 3))
  const bordes = new THREE.LineSegments(
    bordesGeometria,
    new THREE.LineBasicMaterial({ color: COLOR_DEL_BORDE_RECIEN_HECHO, depthWrite: false }),
  )
  bordes.name = 'borde-de-la-herida'
  // El borde es decoración: no se pincha ni tapa lo que hay debajo.
  bordes.raycast = () => {}
  bordes.renderOrder = 2

  // La cinta del surco: dos vértices por cada nodo del trazo (ver `actualizarCinta`).
  const pares = corte.curva.tramos.length + 1
  const cintaGeometria = new THREE.BufferGeometry()
  cintaGeometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pares * 2 * 3), 3))
  const indicesDeLaCinta: number[] = []
  for (let i = 0; i < pares - 1; i++) {
    const a = 2 * i
    indicesDeLaCinta.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  cintaGeometria.setIndex(indicesDeLaCinta)
  const cinta = new THREE.Mesh(
    cintaGeometria,
    new THREE.MeshBasicMaterial({
      color: 0x6e1318,
      side: THREE.DoubleSide,
      depthWrite: false,
      // Un pelo por delante de la piel: pegada a ella parpadearía (z-fighting).
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  )
  cinta.name = 'cinta-de-la-herida'
  cinta.raycast = () => {}
  cinta.renderOrder = 1
  cinta.frustumCulled = false

  malla.geometry = nueva
  malla.add(cinta)
  malla.add(bordes)

  let largo = 0
  for (let i = 1; i < puntos.length; i++) largo += puntos[i].distanceTo(puntos[i - 1])
  // Lo que mide la grieta, no el trazo: acaba donde el trazo cruza la última arista, un poco antes, y en una malla que
  // el trazo solo atraviesa —un vaso, un tendón— es mucho más corta que él.
  const unidadesPorMm = parametros.unidadesPorMm ?? 0.001
  const grietaMm = ((corte.grieta.hasta - corte.grieta.desde) * corte.curva.largoTotal * escala) / unidadesPorMm
  const conPunta = corte.grieta.cerradaAlInicio || corte.grieta.cerradaAlFinal

  const herida: HeridaEnCapa = {
    malla,
    original,
    corte,
    escala,
    bordes,
    cinta,
    mas: 0,
    menos: 0,
    // Lo que pide la incisión, hasta lo que aguanta esta grieta sin plegarse en sus puntas (`topeDeLaRetraccionMm`). Una
    // grieta sin largo —todos sus cruces en el mismo punto del trazo— no tiene huso en que abrirse: el panel no puede
    // decir que está abierta.
    reposo: grietaMm > 0 ? Math.min(Math.max(0, parametros.retraccion ?? 0), topeDeLaRetraccionMm(grietaMm, conPunta) * unidadesPorMm) : 0,
    tension: 1,
    asentada: 1,
    punta: puntaDelHuso(grietaMm),
    largo,
    unidadesPorMm,
    incision: parametros.incision ?? 0,
    trazo: { puntos: puntos.map((p) => p.clone()), normales: normales.map((n) => n.clone()), parametros },
    tardoMs: 0,
    hondo: parametros.hondo === true,
  }
  herida.tardoMs = performance.now() - alEmpezar
  CADENAS.set(malla, [...previas, herida])
  // Con retracción, la herida nace abierta: la malla se compone ya. Sin ella basta con tender el borde, y las heridas
  // de antes conservan lo que tenían abierto componiéndose sobre la malla nueva.
  if (previas.length > 0 || herida.reposo > 0) recomponer(malla)
  else actualizarBordes(herida)
  return herida
}

/** Lo que la herida se abre sola **ahora**, por labio y en lo más ancho, en unidades del mundo: lo que queda de su retracción. */
export const reposoVigente = (h: Pick<HeridaEnCapa, 'reposo' | 'tension' | 'asentada'>): number => h.reposo * h.tension * h.asentada

/**
 * Lo que mide el hueco de la herida en lo más ancho, en unidades del mundo: lo que se abre sola más lo que la apartan.
 * Es lo que dice el panel («abierta 7 mm») y lo que mira la cinta para saber si la herida ya se ve.
 */
export const aberturaDe = (h: Pick<HeridaEnCapa, 'mas' | 'menos' | 'reposo' | 'tension' | 'asentada'>): number =>
  h.mas + h.menos + 2 * reposoVigente(h)

/**
 * Dónde descansa un vértice de la herida, en el espacio de la malla: cerrado, más lo que su labio se retrae solo. Es
 * el «antes» contra el que se mide lo que una hoja aparta el borde (P-008 E2): con la retracción, el labio ya no parte
 * de la línea del corte, y medir desde ella le sumaría a la hoja unos milímetros que no son suyos.
 */
export function verticeEnReposo(h: HeridaEnCapa, v: number, destino = new THREE.Vector3()): THREE.Vector3 {
  const c = h.corte
  destino.set(c.posiciones[3 * v], c.posiciones[3 * v + 1], c.posiciones[3 * v + 2])
  const lado = c.lado[v]
  const reposo = reposoVigente(h) / h.escala
  if (lado === 0 || reposo === 0) return destino
  const k = lado * retraccionDelVertice(c, v, reposo, h.punta)
  destino.x += c.direccion[3 * v] * k
  destino.y += c.direccion[3 * v + 1] * k
  destino.z += c.direccion[3 * v + 2] * k
  return destino
}

/** Vuelve a dibujar el borde y la cinta de una herida con lo que tiene ahora (apertura, quemado, profundizada). */
export function refrescarBordes(h: HeridaEnCapa) {
  actualizarBordes(h)
}

function actualizarBordes(h: HeridaEnCapa) {
  const posiciones = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  const destino = h.bordes.geometry.getAttribute('position') as THREE.BufferAttribute
  let k = 0
  for (const cadena of [h.corte.labios.mas, h.corte.labios.menos]) {
    for (let i = 0; i < cadena.length - 1; i++) {
      for (const v of [cadena[i], cadena[i + 1]]) {
        destino.setXYZ(k++, posiciones.getX(v), posiciones.getY(v), posiciones.getZ(v))
      }
    }
  }
  destino.needsUpdate = true
  h.bordes.geometry.setDrawRange(0, k)
  h.bordes.geometry.computeBoundingSphere()
  actualizarCinta(h)
}

/**
 * Tiende la cinta a lo largo del trazo, con un ancho mínimo.
 *
 * Con la herida cerrada los labios coinciden y la cinta mide el ancho mínimo,
 * centrada en el corte: es la incisión recién hecha. Al abrirse, la cinta sigue la
 * apertura de cada punto (la del separador que haya cerca, si hay perfil) hasta que
 * pasa de `APERTURA_QUE_APARTA_LA_CINTA_MM`, y entonces desaparece para dejar ver el
 * plano de debajo.
 *
 * Se tiende por los **nodos del trazo** y no por los vértices de los labios. Los
 * nodos son los puntos que se pincharon sobre la piel, con su normal, y están en la
 * superficie y a pocos milímetros unos de otros. Los vértices de los labios caen
 * donde el trazo cruza una arista, y en una malla de triángulos largos —la espinilla
 * de la pierna del atlas— quedan a decenas de milímetros: la recta que une dos de
 * ellos pasa por dentro de la pierna y la cinta se veía a trozos, como una línea de
 * puntos, por mucho que se la subiera sobre la piel. Era la «incisión que se
 * borraba» a medias.
 *
 * Y cubre solo lo que **esta malla** se partió: su grieta (P-015). Los nodos de fuera se recogen en la punta de la
 * grieta, donde la cinta queda sin largo. Cada malla tiende la suya, y tendida por el trazo entero, la de un músculo
 * que el bisturí hondo solo rozó cruzaba toda la herida como una barra roja, por encima de la pared de la piel.
 */
function actualizarCinta(h: HeridaEnCapa) {
  const curva = h.corte.curva
  const nodos = curva.tramos.length + 1
  const { desde, hasta } = h.corte.grieta
  if (nodos < 2 || !(hasta > desde) || curva.largoTotal <= 0) {
    h.cinta.visible = false
    return
  }
  // El punto del trazo a la fracción `t` de su largo.
  const enElTrazo = (t: number): Vec3 => {
    const s = t * curva.largoTotal
    let k = 0
    while (k < curva.tramos.length - 1 && curva.tramos[k + 1].desde <= s) k++
    const tr = curva.tramos[k]
    const u = Math.min(tr.largo, Math.max(0, s - tr.desde))
    return [tr.a[0] + tr.d[0] * u, tr.a[1] + tr.d[1] * u, tr.a[2] + tr.d[2] * u]
  }
  const destino = h.cinta.geometry.getAttribute('position') as THREE.BufferAttribute
  // Medio ancho mínimo, en unidades locales de la malla (que pueden estar escaladas).
  const medioAncho = (ANCHO_VISIBLE_DE_LA_INCISION_MM / 2) * (h.unidadesPorMm / h.escala)
  // Un milímetro por encima de la piel, a lo largo de la normal: la cinta es una recta entre nodos y, aunque
  // estén cerca, en una piel curva no debe quedar enterrada.
  const levantar = 1 * (h.unidadesPorMm / h.escala)
  // Lo que la herida se abre sola, que va en huso y se suma a lo demás, como en la malla.
  const reposo = reposoVigente(h) / h.escala
  let abertura = 0
  for (let k = 0; k < nodos; k++) {
    const ultimo = k === nodos - 1
    const tramo = curva.tramos[ultimo ? k - 1 : k]
    const delNodo = ultimo ? 1 : tramo.desde / curva.largoTotal
    const t = Math.min(hasta, Math.max(desde, delNodo))
    const a =
      t !== delNodo
        ? enElTrazo(t)
        : ultimo
          ? [tramo.a[0] + tramo.d[0] * tramo.largo, tramo.a[1] + tramo.d[1] * tramo.largo, tramo.a[2] + tramo.d[2] * tramo.largo]
          : tramo.a
    const abre = h.perfil ? h.perfil(t) : { mas: h.mas, menos: h.menos }
    // Cuánto se separa cada labio en este punto, como la malla: con perfil, el perfil ya se cierra en las puntas.
    const peso = h.perfil ? 1 : afilado(t)
    const sola = reposo > 0 ? reposo * husoDeLaGrieta(h.corte.grieta, t, h.punta) : 0
    const mas = (abre.mas / h.escala) * peso + sola
    const menos = (abre.menos / h.escala) * peso + sola
    // El lateral es el mismo que mueve a los labios: el «más» va hacia `+lateral` y el «menos» hacia `-lateral`.
    const centro = (mas - menos) / 2
    const mitad = Math.max(medioAncho, (mas + menos) / 2)
    abertura = Math.max(abertura, mas + menos)
    const nm = curva.normales[k]
    const lt = curva.lateralesSuaves[k]
    const bx = a[0] + nm[0] * levantar + lt[0] * centro
    const by = a[1] + nm[1] * levantar + lt[1] * centro
    const bz = a[2] + nm[2] * levantar + lt[2] * centro
    destino.setXYZ(2 * k, bx + lt[0] * mitad, by + lt[1] * mitad, bz + lt[2] * mitad)
    destino.setXYZ(2 * k + 1, bx - lt[0] * mitad, by - lt[1] * mitad, bz - lt[2] * mitad)
  }
  destino.needsUpdate = true
  h.cinta.geometry.computeBoundingSphere()
  const aberturaMm = (abertura * h.escala) / h.unidadesPorMm
  const abierta = aberturaMm > APERTURA_QUE_APARTA_LA_CINTA_MM
  // Con un instrumento dentro, la incisión ya la señala él (P-008 E1). El borde se va también: en una herida abierta
  // seguía dibujado de por vida, oscuro, y en el músculo unía vértices separados por centímetros, a través de la abertura.
  const apartada = abierta || !!h.sostenida
  // Una herida que se retrae se ve sola en cuanto el hueco se distingue: la cinta, que es plana y más ancha que él, lo
  // taparía (P-015). El borde se queda hasta que la herida se abre de verdad: es el filo que sangra.
  const seVeSola = h.reposo > 0 && aberturaMm >= ABERTURA_QUE_YA_SE_VE_MM
  // En la fascia y el músculo, la cinta y el borde solo marcan el sitio mientras la herida recién hecha se abre, hasta
  // que el hueco se ve (D-411). El borde quedaba rojo, de «recién hecha», mientras la herida no pasara de 5 mm: el
  // músculo se retrae menos que eso y nada más hondo lo profundiza, así que sus líneas rojas se quedaban para siempre en
  // el fondo de la herida. Es la marca que el dueño veía en los tejidos profundos. Tampoco vuelven al coserla: cerrada,
  // la herida de la piel vuelve a marcarse, pero una línea roja bajo la piel cosida no es nada que haya que ver. Y una
  // grieta que no se abre sola (`reposo` 0, un vaso cruzado de través) no tiene hueco que marcar.
  const marcaElSitio = !apartada && h.reposo > 0 && h.asentada < 1 && !seVeSola
  h.cinta.visible = h.hondo ? marcaElSitio : !apartada && !seVeSola
  h.bordes.visible = h.hondo ? marcaElSitio : !apartada
  // El borde rojo es la incisión recién hecha: al abrirla o profundizarla se vuelve del tono de la piel (P-003 E4).
  ;(h.bordes.material as THREE.LineBasicMaterial).color.set(
    h.quemado ? COLOR_DEL_BORDE_QUEMADO : abierta || h.profundizada ? COLOR_DEL_BORDE_ABIERTO : COLOR_DEL_BORDE_RECIEN_HECHO,
  )
}

/** Lo que mide la herida a lo largo de su trazo, en milímetros: el largo con que se reparte lo que abre cada hoja. */
export const largoEnMm = (h: Pick<HeridaEnCapa, 'corte' | 'escala' | 'unidadesPorMm'>): number =>
  (h.corte.curva.largoTotal * h.escala) / h.unidadesPorMm

/** Separa los labios: `mas` y `menos` en unidades del mundo. Lo que la herida se abre sola (`reposo`) va aparte y se suma. */
export function abrirCapa(
  h: HeridaEnCapa,
  mas: number,
  menos: number,
  /** Apertura según la posición a lo largo de la herida, en unidades del mundo. `mas` y `menos` son sus máximos. */
  perfil?: (t: number) => { mas: number; menos: number },
  /**
   * Cuánta de su retracción le queda a la herida, de 0 a 1 (`tension`). Lo pasa la sutura, que cierra a la vez lo que
   * abrían los separadores y lo que el tejido se había apartado solo; sin él, la herida conserva la que tenía.
   */
  tension?: number,
) {
  h.mas = mas
  h.menos = menos
  h.perfil = perfil
  if (tension !== undefined) h.tension = Math.min(1, Math.max(0, tension))
  recomponer(h.malla)
}

/**
 * Deja cada herida con esa parte de su retracción ya hecha (`asentada`, de 0 a 1) y recompone sus mallas, una vez cada
 * una aunque tengan varias heridas. Es el paso de la animación con que la herida se abre al cortarla (P-015); una
 * herida que ya se cerró —se deshizo el corte a media animación— se salta.
 */
export function asentarHeridas(heridas: readonly HeridaEnCapa[], asentada: number) {
  const k = Math.min(1, Math.max(0, asentada))
  const mallas = new Set<THREE.Mesh>()
  for (const h of heridas) {
    if (!CADENAS.get(h.malla)?.includes(h)) continue
    h.asentada = k
    mallas.add(h.malla)
  }
  for (const malla of mallas) recomponer(malla)
}

/**
 * Deja la malla con todas sus heridas abiertas lo que tiene cada una, y los bordes siguiendo a los labios. Con una
 * sola herida es lo de siempre; con varias, `componerCortes` las suma sobre la geometría del último corte.
 */
function recomponer(malla: THREE.Mesh) {
  const cadena = CADENAS.get(malla)
  if (!cadena || cadena.length === 0) return
  const posiciones = componerCortes(
    cadena.map((h) => ({
      corte: h.corte,
      apertura: {
        mas: h.mas / h.escala,
        menos: h.menos / h.escala,
        perfil: h.perfil
          ? (t: number) => {
              const o = h.perfil!(t)
              return { mas: o.mas / h.escala, menos: o.menos / h.escala }
            }
          : undefined,
        reposo: reposoVigente(h) / h.escala,
        punta: h.punta,
      },
    })),
  )
  const atributo = malla.geometry.getAttribute('position') as THREE.BufferAttribute
  ;(atributo.array as Float32Array).set(posiciones)
  atributo.needsUpdate = true
  malla.geometry.computeVertexNormals()
  malla.geometry.computeBoundingSphere()
  malla.geometry.computeBoundingBox()
  for (const h of cadena) actualizarBordes(h)
}

/** Quita de la escena lo que una herida dibuja (bordes y cinta), sin tocar la geometría de la malla. */
function quitarLoQueDibuja(h: HeridaEnCapa) {
  h.bordes.removeFromParent()
  h.bordes.geometry.dispose()
  ;(h.bordes.material as THREE.Material).dispose()
  h.cinta.removeFromParent()
  h.cinta.geometry.dispose()
  ;(h.cinta.material as THREE.Material).dispose()
}

/**
 * Deshace un corte: la malla recupera la geometría de antes de él y se sueltan las nuevas. Si es la última herida de
 * la malla es solo eso. Si hay otras hechas **después**, cada una se hizo sobre la geometría de esta y hay que
 * volver a cortarlas sobre la anterior (con su mismo trazo, su misma apertura): se rehacen en el mismo objeto, así
 * que quien tenga una referencia a ellas la sigue teniendo. Devuelve las que ya no se pudieron rehacer.
 */
export function cerrarCapa(h: HeridaEnCapa): HeridaEnCapa[] {
  const cadena = CADENAS.get(h.malla) ?? []
  const k = cadena.indexOf(h)
  if (k >= 0 && k < cadena.length - 1) {
    const posteriores = cadena.slice(k + 1)
    for (const w of [...posteriores].reverse()) cerrarCapa(w)
    cerrarCapa(h)
    const perdidas: HeridaEnCapa[] = []
    for (const w of posteriores) {
      const nueva = cortarCapa(w.malla, w.trazo.puntos, w.trazo.normales, w.trazo.parametros)
      if (!nueva) {
        perdidas.push(w)
        continue
      }
      // `nueva` quedó al final de la cadena; en su lugar entra `w`, con lo que ya tenía abierto y su incisión.
      const actual = CADENAS.get(w.malla)!
      // Y con la retracción que le quedaba: una herida cosida no se vuelve a abrir porque se cierre otra.
      const { mas, menos, perfil, incision, tension, asentada } = w
      Object.assign(w, nueva, { mas, menos, perfil, incision, tension, asentada })
      actual[actual.length - 1] = w
      recomponer(w.malla)
    }
    return perdidas
  }
  const nueva = h.malla.geometry
  h.malla.geometry = h.original
  nueva.dispose()
  quitarLoQueDibuja(h)
  if (k >= 0) cadena.splice(k, 1)
  if (cadena.length > 0) recomponer(h.malla)
  else CADENAS.delete(h.malla)
  return []
}

/**
 * El sitio de la herida a una fracción `t` de su largo: el punto de la incisión (sobre la superficie, sin la
 * apertura), la normal de la piel ahí y hacia dónde se aleja el labio de ese `lado` (con su signo). Lo piden
 * lo que se reubica y lo que acompaña al bisturí, que ya no parten de un clic sino de una posición.
 *
 * Sale de la **curva de la incisión** y no de los vértices de los labios, por lo mismo que la cinta: los nodos
 * del trazo están en la superficie y a pocos milímetros unos de otros; los vértices caen donde el trazo cruza
 * una arista. Y se mide sin la apertura, porque `posarSeparador` ya suma lo que el labio se ha separado.
 */
export function sitioEnLaHerida(
  h: HeridaEnCapa,
  t: number,
  lado: 1 | -1 | 0,
): { punto: THREE.Vector3; normal: THREE.Vector3; direccion: THREE.Vector3; t: number } | null {
  const curva = h.corte.curva
  const nodos = curva.tramos.length + 1
  if (nodos < 2 || curva.largoTotal <= 0) return null
  const objetivo = Math.min(1, Math.max(0, t)) * curva.largoTotal
  let mejor = 0
  let cerca = Infinity
  for (let k = 0; k < nodos; k++) {
    const desde = k === nodos - 1 ? curva.largoTotal : curva.tramos[k].desde
    const d = Math.abs(desde - objetivo)
    if (d < cerca) {
      cerca = d
      mejor = k
    }
  }
  const ultimo = mejor === nodos - 1
  const tramo = curva.tramos[ultimo ? mejor - 1 : mejor]
  const a = ultimo
    ? [tramo.a[0] + tramo.d[0] * tramo.largo, tramo.a[1] + tramo.d[1] * tramo.largo, tramo.a[2] + tramo.d[2] * tramo.largo]
    : tramo.a
  const aMundo = h.malla.matrixWorld
  const punto = new THREE.Vector3(a[0], a[1], a[2]).applyMatrix4(aMundo)
  const normal = new THREE.Vector3(...curva.normales[mejor]).transformDirection(aMundo)
  const direccion = new THREE.Vector3(...curva.lateralesSuaves[mejor]).transformDirection(aMundo)
  if (lado < 0) direccion.negate()
  return { punto, normal, direccion, t: curva.largoTotal > 0 ? (ultimo ? 1 : tramo.desde / curva.largoTotal) : 0 }
}

/**
 * El punto del trazo más cercano a uno dado, en el espacio de la malla: a qué distancia queda y a qué fracción del
 * largo. Los nodos del trazo están en la superficie y a pocos milímetros unos de otros, como para la cinta.
 */
function sobreElTrazo(h: HeridaEnCapa, local: THREE.Vector3): { distancia: number; t: number } | null {
  const { tramos, largoTotal } = h.corte.curva
  if (tramos.length === 0 || largoTotal <= 0) return null
  let distancia = Infinity
  let t = 0
  for (const tramo of tramos) {
    const rx = local.x - tramo.a[0]
    const ry = local.y - tramo.a[1]
    const rz = local.z - tramo.a[2]
    const s = Math.min(tramo.largo, Math.max(0, rx * tramo.d[0] + ry * tramo.d[1] + rz * tramo.d[2]))
    const d = Math.hypot(rx - tramo.d[0] * s, ry - tramo.d[1] * s, rz - tramo.d[2] * s)
    if (d < distancia) {
      distancia = d
      t = (tramo.desde + s) / largoTotal
    }
  }
  return { distancia, t }
}

/**
 * Dónde cae un punto del mundo respecto de la herida: de qué labio es y hacia
 * dónde se separa. Sirve para que un separador agarre el labio que se pincha.
 *
 * El vértice de labio más cercano da la dirección; **el lado lo dice a qué lado
 * de ese vértice cae el punto**. Con la herida cerrada los dos labios ocupan el
 * mismo sitio y el más cercano era siempre el primero que se miraba: un Farabeuf
 * agarraba siempre el mismo borde, pincharan donde pincharan.
 *
 * La distancia y el sitio a lo largo (`cerca`, `t`) salen del **trazo** cuando
 * está más cerca que el vértice. Los vértices del labio caen donde el trazo cruza
 * una arista, y en un músculo de triángulos largos cortado a lo largo quedan a uno
 * o dos centímetros unos de otros: un clic justo sobre la incisión del músculo
 * medía más de 8 mm al labio, contaba como «lejos» y retraía el músculo entero en
 * vez de meter el Farabeuf (pedido 8 de P-004: «no me aparece como que el fara
 * quede puesto»). El trazo no se mueve al abrir, así que un clic en medio de una
 * herida abierta también cae sobre ella.
 */
export function ladoDeLaHerida(
  h: HeridaEnCapa,
  puntoDelMundo: THREE.Vector3,
): { lado: 1 | -1; direccion: THREE.Vector3; cerca: number; t: number } | null {
  const local = puntoDelMundo.clone().applyMatrix4(h.malla.matrixWorld.clone().invert())
  let mejor = Infinity
  let vertice: THREE.Vector3 | null = null
  let direccion: THREE.Vector3 | null = null
  let t = 0.5
  const posiciones = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  for (const cadena of [h.corte.labios.mas, h.corte.labios.menos]) {
    for (const v of cadena) {
      const p = new THREE.Vector3(posiciones.getX(v), posiciones.getY(v), posiciones.getZ(v))
      const d = local.distanceTo(p)
      if (d < mejor) {
        mejor = d
        vertice = p
        t = h.corte.largoT[v]
        direccion = new THREE.Vector3(h.corte.direccion[3 * v], h.corte.direccion[3 * v + 1], h.corte.direccion[3 * v + 2])
      }
    }
  }
  if (!vertice || !direccion) return null
  const lado: 1 | -1 = local.clone().sub(vertice).dot(direccion) >= 0 ? 1 : -1
  // La dirección se lleva al mundo, sin la traslación.
  const enElMundo = direccion.transformDirection(h.malla.matrixWorld)
  const trazo = sobreElTrazo(h, local)
  if (trazo && trazo.distancia < mejor) return { lado, direccion: enElMundo, cerca: trazo.distancia * h.escala, t: trazo.t }
  return { lado, direccion: enElMundo, cerca: mejor * h.escala, t }
}
