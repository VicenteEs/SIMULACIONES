import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CapaDeLaHerida } from '@/lib/exposicion'
import { labioDelSeparador, labioEnLaPosicion, type SeparadorEnEscena } from './exposicionEnLaEscena'
import { aberturaDe, arrugasDeLaHerida, cadenaDeLaMalla, colgajosDe, reposoVigente, sitioEnLaHerida, solturaDeLaHerida, type HeridaEnCapa } from './heridas'
import { componerCortes } from '@/lib/corteDeMalla'
import { ejeDeLaPlaca, posicionDelAgujero, type ImplantesEnEscena, type PlacaColocada } from './implantesEnLaEscena'
import { alturaDeLaCara } from './asientoDeLaPlaca'
import { poseActual } from './vistaDelPaciente'
import {
  abultamientoMaximoMm,
  apagarElAbultamiento,
  dondeSubioMas,
  ultimaCuentaDeLaPiel,
  type CuentaDeLaPiel,
} from './abultamientoEnLaEscena'
import type { EncuadreDelPaso } from '@/lib/encuadreDelPaso'
import type { PuntoDeSutura } from '@/lib/sutura'

/**
 * Una sonda del lienzo para las pruebas de extremo a extremo y las grabaciones del instrumental. **Solo en
 * desarrollo**: en producción `instalarLaSonda` no hace nada y el compilador la deja fuera.
 *
 * Existe por dos cosas que desde fuera del lienzo no se pueden saber. La primera, **dónde cae en pantalla** una
 * parte del modelo: una prueba que hace la incisión con clics de verdad necesita saber dónde está la tibia, y eso
 * depende de la cámara, del tamaño de la ventana y del modelo. La segunda, **si lo colocado está donde debe**: un
 * separador que flota a seis milímetros del labio se ve en una captura, pero no se puede afirmar en una prueba sin
 * medirlo. Pedido del dueño, 2026-11-03: «que la herramienta se incruste en las estructuras, no que se muevan y la
 * herramienta se vea en el aire», y un vídeo de cada herramienta.
 *
 * Solo lee, con una excepción que no toca el caso: `mirar` mueve la cámara, que es lo que haría quien opera con
 * la rueda y el arrastre antes de empezar. Nada de lo que hace la sonda cambia la herida, lo colocado ni la sesión,
 * para que lo que se pruebe sea lo que hace quien opera.
 */
export interface LoQueVeLaSonda {
  render?: THREE.WebGLRenderer
  camara?: THREE.PerspectiveCamera
  controles?: OrbitControls
  pedirDibujo?: () => void
  raiz?: THREE.Object3D
  heridas?: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]>
  separadores?: readonly SeparadorEnEscena[]
  implantes?: ImplantesEnEscena
  /** Las mallas de hueso visibles, las mismas en que se apoya la placa: contra ellas se mide su asiento (P-009). */
  huesos?: THREE.Mesh[]
  /** Las mallas de piel: para medir cuánto se abultaron sobre lo que las empuja (P-013, pedidos 1 y 8). */
  pieles?: THREE.Mesh[]
  /** Lo cosido: para medir cómo reparte las puntadas un cierre de un clic (P-013, pedido 16). */
  sutura?: { puntos: readonly PuntoDeSutura[] }
  milimetrosPorUnidad: number
}

/** Un tornillo puesto, visto desde fuera: su largo, su juicio y dónde queda su punta en pantalla. */
export interface TornilloMedido {
  id: number
  largoMm: number
  bicortical: boolean
  /** El origen del modelo del tornillo es la punta (`colocarTornillo`). */
  punta: PuntoEnPantalla | null
}

/** Un punto en la pantalla, en píxeles de la ventana: lo que espera `page.mouse` de Playwright. */
export interface PuntoEnPantalla {
  x: number
  y: number
  /** Delante de la cámara y dentro del lienzo. */
  visible: boolean
}

export interface SeparadorMedido {
  nombre: string
  plano: string
  lado: number
  aperturaMm: number
  /** Dónde está a lo largo de su incisión, de 0 a 1. */
  posicion: number
  /**
   * Cuánto se apartó de verdad el borde en el sitio de la hoja, en milímetros: tiene que ser lo del panel (P-008 E2).
   * En un autoestático, lo que se apartó cada uno de los dos.
   */
  bordeSeApartoMm: number | null
  /** Lo que baja la pala respecto de la vertical de la piel, en grados: 0 es derecha hacia dentro de la herida. */
  palaDeLaVerticalGrados: number
  /** Lo que se levanta el mango sobre la piel, en grados: tendido, despejando el campo, son unos 15. */
  mangoSobreLaPielGrados: number
  /** Dónde se ven el codo del instrumento y el borde que sostiene, ahora y en reposo: para marcarlos en una captura. */
  enPantalla: { codo: PuntoEnPantalla | null; borde: PuntoEnPantalla | null; bordeEnReposo: PuntoEnPantalla | null }
  /** De la punta del instrumento al borde de su labio, tal como está ahora, en milímetros. */
  alLabioMm: number | null
  /**
   * Lo mismo para donde la ponía la cuenta de antes del 2026-11-03 —el punto de apoyo más toda la apertura—: la
   * diferencia con `alLabioMm` es lo que la hoja flotaba.
   */
  comoAntesMm: number | null
  /**
   * Cuánto baja la punta de la pala por debajo del borde que sostiene, en milímetros, a lo largo de la normal: dentro de
   * la herida es positivo (P-009, pedido 2: «que estén por dentro, como si de verdad estuvieran traccionando»).
   */
  palaBajoElBordeMm: number | null
  /** Qué parte de la pala tapa el tejido visto desde la cámara, en %: una pala metida bajo el labio casi no se ve. */
  palaOcultaPct: number | null
  /**
   * Qué parte de los primeros 40 mm del mango, desde el codo, tapa algo que no es el propio instrumento, en %: el mango va
   * por encima de la piel y se tiene que ver entero (D-423). Sobre un hueso que alzaba la piel, su punta quedaba debajo.
   */
  mangoOcultoPct: number | null
  /**
   * Lo que se aparta el mango, visto sobre la piel, de la dirección que va del otro labio a este: 0 es que sale derecho
   * hacia fuera; más de 90, que cruza la herida. `null` en un autoestático, que no tiene un labio propio.
   */
  mangoHaciaFueraGrados: number | null
}

/**
 * Cómo asienta la placa puesta sobre el hueso (P-009, pedido 1: «que interactúen como sólido con sólido, que no se
 * sobrepongan ni atraviesen, que se coloque recta en el hueso como si de verdad afirmara esos dos fragmentos»). Se mide
 * con rayos desde la cara de abajo de la placa, en una rejilla, y no con el único punto de apoyo que usa la placa al
 * asentarse: lo que se quiere saber es justo lo que ese punto no ve.
 */
export interface AsientoMedido {
  /** Lo que más se mete la cara de abajo en el hueso, en mm: 0 es que no lo atraviesa en ningún punto. */
  penetracionMaximaMm: number
  /** La holgura media y la mayor entre la cara de abajo y el hueso, en mm, donde hay hueso debajo. */
  holguraMediaMm: number
  holguraMaximaMm: number
  /** Qué parte de la cara de abajo toca el hueso, a medio milímetro o menos, en %. */
  contactoPct: number
  /** Qué parte queda sin hueso debajo —fuera del borde del hueso, en el aire—, en %. */
  sinHuesoPct: number
  /**
   * Lo que se tuerce la placa respecto del eje largo del hueso, sobre la cara en que se apoya, en grados: 0 es recta a
   * lo largo del hueso. El eje es el de los trozos en que se apoya, por componentes principales, y no el eje del mundo.
   */
  desvioDelEjeGrados: number
  /** Cuántos agujeros caen sobre cada trozo de hueso, por el nombre de su malla: la placa puentea el foco si son dos. */
  agujerosPorTrozo: Record<string, number>
  muestras: number
}

export interface HeridaMedida {
  capa: CapaDeLaHerida
  incision: number
  malla: string
  /** Lo que aparta cada labio lo que lo sostiene, en su punto más abierto, en milímetros. */
  masMm: number
  menosMm: number
  /** Lo que cada labio se retrae solo ahora mismo, en lo más ancho, en milímetros (P-015): 0 en una herida cosida del todo. */
  reposoMm: number
  /** Lo que mide el hueco en lo más ancho, en milímetros: lo que la apartan más lo que se abre sola. */
  aberturaMm: number
  /** Cuántos vértices tiene ahora la malla: lo que el corte le añadió al afinar la franja se ve aquí. */
  vertices: number
  /**
   * La arista más larga de los triángulos que tocan el labio, en milímetros: la mediana y la mayor. Es lo que dice si
   * el tejido tiene con qué doblarse al apartarlo (P-015): con aristas de centímetros, cada abanico era una faceta.
   */
  aristaDelLabioMm: { mediana: number; mayor: number }
  /**
   * Cuántos triángulos de los que la herida arrastra miran ahora al revés de como miraban con ella cerrada: el tejido
   * plegado sobre sí mismo. Tiene que ser cero; si no, la apertura pide más de lo que el arrastre tolera.
   */
  triangulosVueltos: number
  /**
   * Los que están vueltos sin que la herida los mueva: los dobló otra cosa —la piel que se abulta sobre un trozo de
   * hueso (P-013), que en el caso 4 sube hasta su tope de 30 mm a más de veinte centímetros del corte—. Van aparte para
   * que no se le carguen al corte.
   */
  vueltosFueraDeLaHerida: number
  /** Lo que tardó el corte de esta malla, en milisegundos: afinar la franja, partirla y rehacer su geometría. */
  tardoMs: number
  /**
   * La grieta de esta malla: lo que mide a lo largo del trazo, en milímetros, y si se cierra en cada punta o llega al
   * borde de la malla. Con ella se ve por qué una malla se abre menos que lo que pide la incisión (`topeDeLaRetraccionMm`).
   */
  grieta: { largoMm: number; cerradaAlInicio: boolean; cerradaAlFinal: boolean; desdeMm: number; trazoMm: number }
  /**
   * De cada extremo que nace en otra incisión, lo que la otra sigue partida hacia cada labio (`partida`, en mm) y lo suelto
   * que queda ese labio ahí (D-420): 1 es la punta de un colgajo, 0 un labio sujeto como en una punta (D-421, la esquina
   * de la L).
   */
  cruces: HeridaEnCapa['cruces'] | null
  soltura: ReturnType<typeof solturaDeLaHerida> | null
}

/** La arista más larga de cada triángulo que toca un labio de la herida, con la malla cerrada: mediana y mayor, en milímetros. */
function aristaDelLabio(h: HeridaEnCapa, mm: number): { mediana: number; mayor: number } {
  const delLabio = new Set<number>([...h.corte.labios.mas, ...h.corte.labios.menos])
  const p = h.corte.posiciones
  const largo = (a: number, b: number) => Math.hypot(p[3 * a] - p[3 * b], p[3 * a + 1] - p[3 * b + 1], p[3 * a + 2] - p[3 * b + 2])
  const mayores: number[] = []
  const indices = h.corte.indices
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    if (!delLabio.has(a) && !delLabio.has(b) && !delLabio.has(c)) continue
    mayores.push(Math.max(largo(a, b), largo(b, c), largo(c, a)) * h.escala * mm)
  }
  if (mayores.length === 0) return { mediana: 0, mayor: 0 }
  mayores.sort((x, y) => x - y)
  const redondo = (x: number) => Math.round(x * 10) / 10
  return { mediana: redondo(mayores[Math.floor(mayores.length / 2)]), mayor: redondo(mayores[mayores.length - 1]) }
}

/** Un triángulo que mira ahora al revés de como miraba con la herida cerrada. */
export interface TrianguloVuelto {
  /** Su área con la herida cerrada y la de ahora, en milímetros cuadrados. */
  areaMm2: number
  areaAhoraMm2: number
  /** Es de la pared de la herida (D-333) y no de la superficie. */
  deLaPared: boolean
  /** Dónde cae a lo largo del trazo, de 0 a 1. */
  t: number
  /** Cuánto lo arrastra la herida, de 0 (nada: lo movió otra cosa) a 1 (está en el labio). */
  arrastre: number
  /**
   * Lo que se ha movido el más movido de sus tres vértices desde que la herida se hizo, y lo lejos que queda su
   * centro del labio más cercano, los dos en milímetros. Un triángulo vuelto lejos del corte y movido es obra de
   * otra cosa; uno vuelto sin haberse movido es que la referencia con que se compara no es la que se cree.
   */
  movidoMm: number
  alLabioMm: number
  /** Dónde cae su centro en la pantalla, para marcarlo sobre una captura (`vueltosEn`). */
  enPantalla?: PuntoEnPantalla | null
}

/** La normal del triángulo `a b c` de esas posiciones, sin normalizar: su largo es el doble del área. */
function normalDelTriangulo(q: ArrayLike<number>, a: number, b: number, c: number): [number, number, number] {
  const ux = q[3 * b] - q[3 * a]
  const uy = q[3 * b + 1] - q[3 * a + 1]
  const uz = q[3 * b + 2] - q[3 * a + 2]
  const vx = q[3 * c] - q[3 * a]
  const vy = q[3 * c + 1] - q[3 * a + 1]
  const vz = q[3 * c + 2] - q[3 * a + 2]
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
}

/**
 * Los triángulos de la malla que miran ahora al revés de como miraban con todas sus heridas cerradas: el tejido
 * plegado sobre sí mismo. No cuenta los que ya eran una astilla sin área —menos de una centésima de milímetro
 * cuadrado—: su normal no apunta a ningún sitio, y que «cambie» no dice nada.
 */
function losVueltos(malla: THREE.Mesh, mm: number, enPantalla?: (mundo: THREE.Vector3) => PuntoEnPantalla | null): TrianguloVuelto[] {
  const cadena = cadenaDeLaMalla(malla)
  const ultima = cadena[cadena.length - 1]
  const ahora = malla.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!ultima || !ahora) return []
  const corte = ultima.corte
  const antes = corte.posiciones
  const despues = ahora.array as ArrayLike<number>
  const indices = corte.indices
  const aMm = ultima.escala * mm
  const movido = (i: number) =>
    Math.hypot(despues[3 * i] - antes[3 * i], despues[3 * i + 1] - antes[3 * i + 1], despues[3 * i + 2] - antes[3 * i + 2]) * aMm
  const delLabio = [...corte.labios.mas, ...corte.labios.menos]
  const alLabioDe = (a: number, b: number, c: number) => {
    const x = (antes[3 * a] + antes[3 * b] + antes[3 * c]) / 3
    const y = (antes[3 * a + 1] + antes[3 * b + 1] + antes[3 * c + 1]) / 3
    const z = (antes[3 * a + 2] + antes[3 * b + 2] + antes[3 * c + 2]) / 3
    let cerca = Infinity
    for (const i of delLabio) cerca = Math.min(cerca, Math.hypot(antes[3 * i] - x, antes[3 * i + 1] - y, antes[3 * i + 2] - z))
    return cerca * aMm
  }
  const salida: TrianguloVuelto[] = []
  if (enPantalla) malla.updateWorldMatrix(true, false)
  const centro = new THREE.Vector3()
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    const n0 = normalDelTriangulo(antes, a, b, c)
    const n1 = normalDelTriangulo(despues, a, b, c)
    if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] >= 0) continue
    const areaMm2 = 0.5 * Math.hypot(n0[0], n0[1], n0[2]) * aMm * aMm
    if (areaMm2 < 0.01) continue
    salida.push({
      areaMm2: Math.round(areaMm2 * 100) / 100,
      areaAhoraMm2: Math.round(0.5 * Math.hypot(n1[0], n1[1], n1[2]) * aMm * aMm * 100) / 100,
      deLaPared: corte.pared[a] >= 0 && corte.pared[b] >= 0 && corte.pared[c] >= 0,
      t: Math.round(((corte.largoT[a] + corte.largoT[b] + corte.largoT[c]) / 3) * 100) / 100,
      arrastre: Math.round(Math.max(corte.pesoLateral[a], corte.pesoLateral[b], corte.pesoLateral[c]) * 100) / 100,
      movidoMm: Math.round(Math.max(movido(a), movido(b), movido(c)) * 100) / 100,
      alLabioMm: Math.round(alLabioDe(a, b, c) * 10) / 10,
      ...(enPantalla
        ? {
            enPantalla: enPantalla(
              centro
                .set(
                  (despues[3 * a] + despues[3 * b] + despues[3 * c]) / 3,
                  (despues[3 * a + 1] + despues[3 * b + 1] + despues[3 * c + 1]) / 3,
                  (despues[3 * a + 2] + despues[3 * b + 2] + despues[3 * c + 2]) / 3,
                )
                .applyMatrix4(malla.matrixWorld),
            ),
          }
        : {}),
    })
  }
  return salida
}

/** Cómo está la malla de una herida alrededor del corte: cuántas astillas tiene y cuántas aristas se doblan al abrirla. */
export interface CalidadDeLaMalla {
  malla: string
  /** Triángulos de toda la malla, y los que arrastra alguna herida (los de la franja que se mueve al abrir). */
  triangulos: number
  enLaFranja: number
  /** De los de la franja, los que tienen un ángulo de menos de 5° con la herida cerrada: astillas. */
  astillas: number
  /**
   * Aristas de la franja entre dos triángulos de superficie (no de la pared) que con la herida cerrada eran casi planas
   * —menos de 20° entre sus normales— y ahora se doblan más de 40°: cada una es una faceta que se ve.
   */
  aristasDobladas: number
  /** El doblez mayor de esas aristas, en grados. */
  doblezMayorGrados: number
}

/**
 * Lo que dice si una herida abierta se ve lisa o tallada (D-421). Los triángulos vueltos cuentan el tejido plegado del
 * todo; esto cuenta lo que se ve antes: las aristas que se quiebran sin llegar a dar la vuelta, que es lo que el dueño
 * llamaba vidrio en el tobillo, y las astillas que deja cortar encima de otro corte.
 */
function calidadDeLaMalla(malla: THREE.Mesh, mm: number): CalidadDeLaMalla | null {
  const cadena = cadenaDeLaMalla(malla)
  const ultima = cadena[cadena.length - 1]
  const ahora = malla.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!ultima || !ahora) return null
  const corte = ultima.corte
  const antes = corte.posiciones
  const despues = ahora.array as ArrayLike<number>
  const indices = corte.indices
  const aMm = ultima.escala * mm
  // El arrastre de cualquier herida de la malla: el de la última solo ve su franja, y la de antes también se abre.
  const enAlguna = (v: number) => cadena.some((h) => v < h.corte.pesoLateral.length && h.corte.pesoLateral[v] > 0)
  const normal = (q: ArrayLike<number>, a: number, b: number, c: number) => {
    const n = new THREE.Vector3(...normalDelTriangulo(q, a, b, c))
    const area = n.length()
    return { n: area > 0 ? n.divideScalar(area) : n, area: 0.5 * area * aMm * aMm }
  }
  const anguloMenor = (a: number, b: number, c: number) => {
    const p = (i: number) => new THREE.Vector3(antes[3 * i], antes[3 * i + 1], antes[3 * i + 2])
    const [A, B, C] = [p(a), p(b), p(c)]
    const en = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) => y.clone().sub(x).angleTo(z.clone().sub(x))
    return (Math.min(en(A, B, C), en(B, C, A), en(C, A, B)) * 180) / Math.PI
  }
  const deLaPared = (i: number) => corte.pared[i] >= 0
  let enLaFranja = 0
  let astillas = 0
  const franja: boolean[] = []
  const normalesAntes: THREE.Vector3[] = []
  const normalesAhora: THREE.Vector3[] = []
  const superficie: boolean[] = []
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    const n0 = normal(antes, a, b, c)
    const n1 = normal(despues, a, b, c)
    const k = t / 3
    franja[k] = enAlguna(a) || enAlguna(b) || enAlguna(c)
    normalesAntes[k] = n0.n
    normalesAhora[k] = n1.n
    superficie[k] = n0.area >= 0.01 && !(deLaPared(a) && deLaPared(b) && deLaPared(c))
    if (!franja[k]) continue
    enLaFranja++
    if (n0.area > 0 && anguloMenor(a, b, c) < 5) astillas++
  }
  const aristas = new Map<string, number[]>()
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const k = t / 3
    if (!franja[k] || !superficie[k]) continue
    const tri = [indices[t], indices[t + 1], indices[t + 2]]
    for (let e = 0; e < 3; e++) {
      const a = tri[e]
      const b = tri[(e + 1) % 3]
      const clave = a < b ? `${a}-${b}` : `${b}-${a}`
      const lista = aristas.get(clave)
      if (lista) lista.push(k)
      else aristas.set(clave, [k])
    }
  }
  let aristasDobladas = 0
  let doblezMayor = 0
  for (const par of aristas.values()) {
    if (par.length !== 2) continue
    const [i, j] = par
    const antesGrados = (normalesAntes[i].angleTo(normalesAntes[j]) * 180) / Math.PI
    if (antesGrados >= 20) continue
    const ahoraGrados = (normalesAhora[i].angleTo(normalesAhora[j]) * 180) / Math.PI
    if (ahoraGrados > 40) {
      aristasDobladas++
      doblezMayor = Math.max(doblezMayor, ahoraGrados)
    }
  }
  return {
    malla: malla.name,
    triangulos: indices.length / 3,
    enLaFranja,
    astillas,
    aristasDobladas,
    doblezMayorGrados: Math.round(doblezMayor),
  }
}

/** La herida de esa capa que se mide: la última, o la última de la incisión pedida (en la malla de piel, si la hay). */
function laHerida(v: LoQueVeLaSonda, capa: CapaDeLaHerida, incision?: number): HeridaEnCapa | undefined {
  const lista = (v.heridas?.get(capa) ?? []).filter((h) => incision === undefined || h.incision === incision)
  return lista.filter((h) => /^Piel/.test(h.malla.name)).at(-1) ?? lista.at(-1)
}

function aPantalla(v: LoQueVeLaSonda, mundo: THREE.Vector3): PuntoEnPantalla | null {
  if (!v.render || !v.camara) return null
  const caja = v.render.domElement.getBoundingClientRect()
  const p = mundo.clone().project(v.camara)
  const x = caja.left + ((p.x + 1) / 2) * caja.width
  const y = caja.top + ((1 - p.y) / 2) * caja.height
  return { x, y, visible: p.z < 1 && x >= caja.left && x <= caja.right && y >= caja.top && y <= caja.bottom }
}

/**
 * La distancia de un punto al borde de un labio, con la geometría de ahora: abierta, retraída o cosida.
 *
 * Al borde y no al vértice más cercano: en una piel de triángulos largos los vértices del labio quedan a uno o dos
 * centímetros unos de otros, y una hoja bien apoyada entre dos de ellos parecería a un centímetro del labio.
 */
function alLabio(h: HeridaEnCapa, lado: number, punto: THREE.Vector3): number {
  const posiciones = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  const cadenas = lado > 0 ? [h.corte.labios.mas] : lado < 0 ? [h.corte.labios.menos] : [h.corte.labios.mas, h.corte.labios.menos]
  const enElMundo = (i: number) =>
    new THREE.Vector3(posiciones.getX(i), posiciones.getY(i), posiciones.getZ(i)).applyMatrix4(h.malla.matrixWorld)
  let cerca = Infinity
  const tramo = new THREE.Line3()
  const enElTramo = new THREE.Vector3()
  for (const cadena of cadenas) {
    const vivos = cadena.filter((i) => i < posiciones.count)
    for (let k = 0; k < vivos.length; k++) {
      const a = enElMundo(vivos[k])
      const b = k + 1 < vivos.length ? enElMundo(vivos[k + 1]) : a
      tramo.set(a, b).closestPointToPoint(punto, true, enElTramo)
      cerca = Math.min(cerca, enElTramo.distanceTo(punto))
    }
  }
  return cerca
}

/** La caja de la placa en el marco de su modelo (metros, sin girar): de ahí sale la rejilla de su cara de abajo. */
function cajaLocalDeLaPlaca(placa: PlacaColocada): THREE.Box3 {
  placa.grupo.updateMatrixWorld(true)
  const inversa = placa.grupo.matrixWorld.clone().invert()
  const caja = new THREE.Box3()
  placa.grupo.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    caja.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inversa, m.matrixWorld)))
  })
  return caja
}

/**
 * El eje largo de unas mallas, por componentes principales de sus vértices en el mundo (con signo arbitrario). Es lo
 * que un traumatólogo llama el eje del hueso, y no tiene por qué coincidir con un eje del mundo: la pierna puede venir
 * girada unos grados en el modelo.
 */
function ejeLargoDeLasMallas(mallas: THREE.Mesh[]): THREE.Vector3 | null {
  const puntos: THREE.Vector3[] = []
  for (const m of mallas) {
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) continue
    m.updateMatrixWorld(true)
    const paso = Math.max(1, Math.floor(pos.count / 6000))
    for (let i = 0; i < pos.count; i += paso) puntos.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld))
  }
  if (puntos.length < 3) return null
  const media = puntos.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(puntos.length)
  const c = [0, 0, 0, 0, 0, 0] // xx, xy, xz, yy, yz, zz
  for (const p of puntos) {
    const x = p.x - media.x
    const y = p.y - media.y
    const z = p.z - media.z
    c[0] += x * x
    c[1] += x * y
    c[2] += x * z
    c[3] += y * y
    c[4] += y * z
    c[5] += z * z
  }
  // Iteración de potencias: el autovector dominante de la covarianza, que en un hueso largo es su eje.
  let v = new THREE.Vector3(0.3, 1, 0.2).normalize()
  for (let k = 0; k < 60; k++) {
    v = new THREE.Vector3(
      c[0] * v.x + c[1] * v.y + c[2] * v.z,
      c[1] * v.x + c[3] * v.y + c[4] * v.z,
      c[2] * v.x + c[4] * v.y + c[5] * v.z,
    ).normalize()
  }
  return v
}

/** El centro de la caja de una malla a una altura (0 abajo, 1 arriba), en el mundo. */
function puntoDe(v: LoQueVeLaSonda, nodo: string, alto: number): THREE.Vector3 | null {
  const malla = v.raiz?.getObjectByName(nodo)
  if (!malla) return null
  const caja = new THREE.Box3().setFromObject(malla)
  return new THREE.Vector3(
    (caja.min.x + caja.max.x) / 2,
    caja.min.y + alto * (caja.max.y - caja.min.y),
    (caja.min.z + caja.max.z) / 2,
  )
}

export function crearLaSonda(leer: () => LoQueVeLaSonda) {
  return {
    /**
     * Cuánto subió cada malla de piel sobre lo que la empuja, en mm (P-013, pedidos 1 y 8): con la placa puesta y la piel
     * cerrada, o con el trozo desplazado contra la piel sana, tiene que ser más que cero.
     */
    /** Lo que costó la última vez que la piel se puso al día: tiene que caber en un cuadro mientras se arrastra un trozo. */
    cuentaDeLaPiel(): CuentaDeLaPiel | null {
      return ultimaCuentaDeLaPiel()
    },
    /**
     * Encuadra la cámara donde más subió la piel, mirando de medio lado (`deLado`, de 0 de frente a 1 de perfil) para que
     * se vea el bulto contra el fondo. Devuelve si había bulto.
     */
    mirarElAbultamiento(distanciaMm = 220, deLado = 0.75): boolean {
      const v = leer()
      const donde = (v.pieles ?? []).map((m) => dondeSubioMas(m)).find(Boolean)
      if (!donde || !v.camara || !v.controles) return false
      const lado = new THREE.Vector3().crossVectors(donde.haciaFuera, new THREE.Vector3(0, 1, 0))
      if (lado.lengthSq() < 1e-6) lado.set(1, 0, 0)
      const desde = donde.haciaFuera.clone().multiplyScalar(1 - deLado).add(lado.normalize().multiplyScalar(deLado)).normalize()
      v.controles.target.copy(donde.punto)
      v.camara.position.copy(donde.punto).addScaledVector(desde, distanciaMm / (v.milimetrosPorUnidad || 1000))
      v.controles.update()
      v.pedirDibujo?.()
      return true
    },
    /** Apaga o enciende el abultamiento, para ver la misma escena con y sin él. */
    abultarLaPiel(si: boolean): void {
      apagarElAbultamiento(!si)
      leer().pedirDibujo?.()
    },
    abultamientoDeLaPiel(): { nodo: string; mm: number }[] {
      const v = leer()
      return (v.pieles ?? []).map((m) => ({ nodo: m.name, mm: Math.round(abultamientoMaximoMm(m, v.milimetrosPorUnidad || 1000) * 10) / 10 }))
    },
    /**
     * Las puntadas cosidas, en orden, con su plano, su lado y cuánto las separa de la anterior de su línea, en mm y donde se
     * picaron. Es lo que deja comprobar que el cierre de un clic las reparte parejas (P-013, pedido 16): en una captura se
     * ven, pero no se miden.
     */
    puntadas(): { plano: string; lado: number; asistida: boolean; separacionMm: number | null; t: number | null; alLabioMm: number | null }[] {
      const v = leer()
      const puntos = v.sutura?.puntos ?? []
      const mm = v.milimetrosPorUnidad || 1000
      const de = (q: PuntoDeSutura) => q.base ?? q.punto
      return puntos.map((p, i) => {
        const a = i > 0 && !p.nuevaLinea ? de(puntos[i - 1]) : null
        const b = de(p)
        const separacionMm = a ? Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * mm * 10) / 10 : null
        // A cuánto queda del borde de su labio: la mordida, que en un cierre de un clic es de 3 a 4 mm.
        const h = p.ref ? [...(v.heridas?.values() ?? [])].flat().find((x) => x.malla.uuid === p.ref!.malla) : undefined
        const alLabioMm = h ? Math.round(alLabio(h, p.lado, new THREE.Vector3(...b)) * mm * 10) / 10 : null
        return { plano: p.plano ?? 'piel', lado: p.lado, asistida: !!p.asistida, separacionMm, t: typeof p.ref?.t === 'number' ? Math.round(p.ref.t * 1000) / 1000 : null, alLabioMm }
      })
    },
    /**
     * Todo lo que toca el rayo de la cámara en ese punto de la pantalla, del más cercano al más lejano, también lo oculto.
     * Cuando un clic en el lienzo «no hace nada», casi siempre es que el rayo no dio en lo que se ve, y desde fuera eso no
     * se distingue de un manejador que no llegó a correr.
     */
    golpesEn(x: number, y: number): { nodo: string; visible: boolean; distanciaMm: number }[] {
      const v = leer()
      if (!v.render || !v.camara || !v.raiz) return []
      const caja = v.render.domElement.getBoundingClientRect()
      const rayo = new THREE.Raycaster()
      rayo.setFromCamera(new THREE.Vector2(((x - caja.left) / caja.width) * 2 - 1, -((y - caja.top) / caja.height) * 2 + 1), v.camara)
      const mm = v.milimetrosPorUnidad || 1000
      return rayo.intersectObject(v.raiz, true).map((g) => ({ nodo: g.object.name, visible: g.object.visible, distanciaMm: Math.round(g.distance * mm * 10) / 10 }))
    },
    /**
     * De qué está hecho un píxel: lo **visible** que cruza el rayo de la cámara por ese punto, de lo más cercano a lo más
     * lejano, y con qué se dibuja cada cosa. `golpesEn` dice qué piezas hay; esto, por qué se ven como se ven: si lo que
     * asoma por una herida abierta es translúcido, por qué cara se le mira y cuánto brilla. Nació de un «parece cristal»
     * (P-015) que en una captura se veía y no se podía atribuir a ninguna malla.
     */
    queSeVeEn(x: number, y: number): {
      nodo: string
      distanciaMm: number
      /** Se le mira por la cara de fuera (la de su normal) o por la de dentro. */
      deFrente: boolean
      transparente: boolean
      opacidad: number
      dosCaras: boolean
      escribeProfundidad: boolean
      rugosidad: number | null
      barniz: number | null
      color: string | null
      /** En la piel, lo que el punto queda bajo la superficie si es de la pared de una herida, en mm; `null` si no lo es. */
      paredMm: number | null
      /** En la fascia profunda, cuánto músculo tiene debajo, de 0 a 1 (D-412); `null` en lo demás. */
      musculo: number | null
    }[] {
      const v = leer()
      if (!v.render || !v.camara || !v.raiz) return []
      const caja = v.render.domElement.getBoundingClientRect()
      const rayo = new THREE.Raycaster()
      rayo.setFromCamera(new THREE.Vector2(((x - caja.left) / caja.width) * 2 - 1, -((y - caja.top) / caja.height) * 2 + 1), v.camara)
      const mm = v.milimetrosPorUnidad || 1000
      const seVe = (o: THREE.Object3D | null): boolean => {
        for (let p = o; p; p = p.parent) if (!p.visible) return false
        return true
      }
      const normal = new THREE.Vector3()
      return rayo
        .intersectObject(v.raiz, true)
        .filter((g) => (g.object as THREE.Mesh).isMesh && seVe(g.object))
        .map((g) => {
          const malla = g.object as THREE.Mesh
          const material = (Array.isArray(malla.material) ? malla.material[0] : malla.material) as THREE.MeshPhysicalMaterial
          const deFrente = g.face ? normal.copy(g.face.normal).transformDirection(malla.matrixWorld).dot(rayo.ray.direction) < 0 : true
          const pared = malla.geometry.getAttribute('aPared') as THREE.BufferAttribute | undefined
          // La marca de la pared va por vértice: la del triángulo es la mayor de las tres, que es la que pinta el sombreador.
          const marca = pared && g.face ? Math.max(pared.getX(g.face.a), pared.getX(g.face.b), pared.getX(g.face.c)) : 0
          const debajo = malla.geometry.getAttribute('aMusculo') as THREE.BufferAttribute | undefined
          const musculo = debajo && g.face ? (debajo.getX(g.face.a) + debajo.getX(g.face.b) + debajo.getX(g.face.c)) / 3 : null
          return {
            nodo: malla.name || malla.parent?.name || '(sin nombre)',
            distanciaMm: Math.round(g.distance * mm * 10) / 10,
            deFrente,
            transparente: material.transparent === true,
            opacidad: Math.round((material.opacity ?? 1) * 100) / 100,
            dosCaras: material.side === THREE.DoubleSide,
            escribeProfundidad: material.depthWrite !== false,
            rugosidad: typeof material.roughness === 'number' ? Math.round(material.roughness * 100) / 100 : null,
            barniz: typeof material.clearcoat === 'number' ? Math.round(material.clearcoat * 100) / 100 : null,
            color: material.color ? `#${material.color.getHexString()}` : null,
            paredMm: marca > 0.5 ? Math.round((marca - 1) * 10) / 10 : null,
            musculo: musculo === null ? null : Math.round(musculo * 100) / 100,
          }
        })
    },
    /**
     * Lleva la cámara encima de la última herida de esa capa, mirándola de frente por su normal: es como la ve quien
     * opera, y el único encuadre en que se puede juzgar al milímetro dónde quedó cada hoja respecto del borde. Con
     * `inclinacion` (en grados) la vista se tumba hacia un extremo de la herida y mira a lo largo de ella: así se ven
     * las dos paredes y si las palas de los separadores bajan por dentro (P-009).
     */
    mirarLaHerida(capa: CapaDeLaHerida, distanciaMm = 120, donde = 0.5, inclinacion = 0): boolean {
      const v = leer()
      const h = v.heridas?.get(capa)?.at(-1)
      const sitio = h ? sitioEnLaHerida(h, donde, 1) : null
      if (!sitio || !v.camara || !v.controles) return false
      const hacia = sitio.normal.clone()
      const antes = h ? sitioEnLaHerida(h, Math.max(0, donde - 0.1), 1) : null
      const despues = h ? sitioEnLaHerida(h, Math.min(1, donde + 0.1), 1) : null
      if (inclinacion && antes && despues) {
        const aLoLargo = despues.punto.clone().sub(antes.punto)
        aLoLargo.addScaledVector(hacia, -aLoLargo.dot(hacia))
        if (aLoLargo.lengthSq() > 1e-12) {
          const radianes = (inclinacion * Math.PI) / 180
          hacia.multiplyScalar(Math.cos(radianes)).addScaledVector(aLoLargo.normalize(), Math.sin(radianes)).normalize()
        }
      }
      v.controles.target.copy(sitio.punto)
      v.camara.position.copy(sitio.punto).addScaledVector(hacia, distanciaMm / (v.milimetrosPorUnidad || 1000))
      v.controles.update()
      v.pedirDibujo?.()
      return true
    },
    /**
     * Lleva la cámara a la placa puesta: de frente, por su normal, o de lado, mirando a lo ancho de la placa, que es
     * el único encuadre en que se ve si la placa se hunde en el hueso o queda en el aire (P-009). `inclinacion` gira
     * la vista de lado hacia el frente, en grados.
     */
    mirarLaPlaca(desde: 'frente' | 'lado', distanciaMm = 140, inclinacion = 0): boolean {
      const v = leer()
      const placa = v.implantes?.placa
      if (!placa || !v.camara || !v.controles) return false
      placa.grupo.updateMatrixWorld(true)
      const centro = new THREE.Box3().setFromObject(placa.grupo).getCenter(new THREE.Vector3())
      const n = placa.normal.clone().normalize()
      const lado = new THREE.Vector3().crossVectors(n, ejeDeLaPlaca(placa)).normalize()
      const radianes = (inclinacion * Math.PI) / 180
      const hacia = desde === 'frente' ? n : lado.multiplyScalar(Math.cos(radianes)).addScaledVector(n, Math.sin(radianes)).normalize()
      v.controles.target.copy(centro)
      v.camara.position.copy(centro).addScaledVector(hacia, distanciaMm / (v.milimetrosPorUnidad || 1000))
      v.controles.update()
      v.pedirDibujo?.()
      return true
    },
    /**
     * Mira un punto de una malla desde el lado de otra (`haciaNodo`), o desde el contrario con `signo` −1: la cara
     * anterolateral de la tibia se mira desde el tibial anterior y la medial, de espaldas al peroné. Solo cuenta lo
     * horizontal de esa dirección, para que la pierna se vea de pie y no desde los pies.
     */
    mirarDesde(nodo: string, alto: number, distanciaMm: number, haciaNodo: string, signo: 1 | -1 = 1): boolean {
      const v = leer()
      const punto = puntoDe(v, nodo, alto)
      const otro = puntoDe(v, haciaNodo, alto)
      if (!punto || !otro || !v.camara || !v.controles) return false
      const hacia = otro.sub(punto).multiplyScalar(signo)
      hacia.y = 0
      if (hacia.lengthSq() < 1e-12) return false
      v.controles.target.copy(punto)
      v.camara.position.copy(punto).addScaledVector(hacia.normalize(), distanciaMm / (v.milimetrosPorUnidad || 1000))
      v.controles.update()
      v.pedirDibujo?.()
      return true
    },
    /**
     * Desde dónde se mira ahora, lo mismo que guarda «Guardar este encuadre» en el editor (P-009, mejora de uso 1): para
     * dejar encuadres a un caso de prueba sin pasar por el formulario del panel.
     */
    encuadre(): EncuadreDelPaso | null {
      const v = leer()
      if (!v.camara || !v.controles) return null
      const pose = poseActual(v.camara, v.controles)
      return {
        direccion: pose.direccion,
        arriba: pose.arriba,
        centro: v.controles.target.toArray() as [number, number, number],
        distancia: v.camara.position.distanceTo(v.controles.target),
      }
    },
    /**
     * Mira un hueso largo desde un lado, girando `grados` alrededor de su eje (D-421): para encontrar la cara que queda
     * bajo la piel —la anteromedial de la tibia, donde se abre el tobillo— y cortar de frente a ella y no de canto. De
     * canto, el trazo va por la silueta de la pierna y la incisión sale corta y torcida.
     */
    mirarAlrededor(nodo: string, alto: number, distanciaMm: number, grados: number): boolean {
      const v = leer()
      const malla = v.raiz?.getObjectByName(nodo) as THREE.Mesh | undefined
      const punto = puntoDe(v, nodo, alto)
      if (!malla || !punto || !v.camara || !v.controles) return false
      const eje = ejeLargoDeLasMallas([malla])
      if (!eje) return false
      const base = new THREE.Vector3(0, 1, 0)
      if (Math.abs(base.dot(eje)) > 0.9) base.set(1, 0, 0)
      base.addScaledVector(eje, -base.dot(eje)).normalize()
      const hacia = base.applyAxisAngle(eje, (grados * Math.PI) / 180)
      v.controles.target.copy(punto)
      v.camara.position.copy(punto).addScaledVector(hacia, distanciaMm / (v.milimetrosPorUnidad || 1000))
      v.controles.update()
      v.pedirDibujo?.()
      return true
    },
    mirar(nodo: string, alto = 0.5, distanciaMm = 250): boolean {
      const v = leer()
      const punto = puntoDe(v, nodo, alto)
      if (!punto || !v.camara || !v.controles) return false
      const desde = v.camara.position.clone().sub(v.controles.target).normalize()
      v.controles.target.copy(punto)
      v.camara.position.copy(punto).addScaledVector(desde, distanciaMm / (v.milimetrosPorUnidad || 1000))
      v.controles.update()
      v.pedirDibujo?.()
      return true
    },
    /**
     * Dónde cae en pantalla un punto de una malla del modelo: el centro de su caja a la altura `alto` (0 abajo,
     * 1 arriba), adelantado `adelanteMm` hacia la cámara. Un clic ahí da en lo primero que se ve delante de ese
     * punto: la piel que cubre la tibia, si se pide la tibia.
     */
    aPantalla(nodo: string, alto = 0.5, adelanteMm = 0): PuntoEnPantalla | null {
      const v = leer()
      const punto = puntoDe(v, nodo, alto)
      if (!punto || !v.camara) return null
      if (adelanteMm) {
        const haciaLaCamara = v.camara.position.clone().sub(punto).normalize()
        punto.addScaledVector(haciaLaCamara, adelanteMm / (v.milimetrosPorUnidad || 1000))
      }
      return aPantalla(v, punto)
    },
    /**
     * Dónde **se ve** una malla a una altura: se barre la fila de la pantalla que corresponde a ese alto y se lanza un
     * rayo desde la cámara por cada punto; devuelve el centro del tramo más ancho en que lo primero que toca el rayo es
     * esa malla. `aPantalla` da el centro de la caja, que en un hueso inclinado o tapado por otro cae a un lado: un clic
     * ahí no da en el hueso.
     */
    dondeSeVe(nodo: string, alto = 0.5): PuntoEnPantalla | null {
      const v = leer()
      const punto = puntoDe(v, nodo, alto)
      const malla = v.raiz?.getObjectByName(nodo)
      if (!punto || !malla || !v.render || !v.camara || !v.raiz) return null
      const centro = aPantalla(v, punto)
      if (!centro) return null
      const caja = v.render.domElement.getBoundingClientRect()
      const rayo = new THREE.Raycaster()
      let mejor: [number, number] | null = null
      let desde: number | null = null
      const cerrar = (hasta: number) => {
        if (desde !== null && (!mejor || hasta - desde > mejor[1] - mejor[0])) mejor = [desde, hasta]
        desde = null
      }
      for (let x = caja.left + 2; x < caja.right - 2; x += 3) {
        rayo.setFromCamera(
          new THREE.Vector2(((x - caja.left) / caja.width) * 2 - 1, -((centro.y - caja.top) / caja.height) * 2 + 1),
          v.camara,
        )
        const primero = rayo.intersectObject(v.raiz, true).find((g) => g.object.visible && (g.object as THREE.Mesh).isMesh)
        let o: THREE.Object3D | null = primero?.object ?? null
        while (o && o !== malla) o = o.parent
        if (o === malla) desde ??= x
        else cerrar(x - 3)
      }
      cerrar(caja.right - 2)
      if (!mejor) return null
      const [a, b] = mejor as [number, number]
      return { x: (a + b) / 2, y: centro.y, visible: true }
    },
    /** Cada separador colocado y cuánto lo separa de su labio: 0 es apoyado en él; varios milímetros, en el aire. */
    separadores(): SeparadorMedido[] {
      const v = leer()
      const mm = v.milimetrosPorUnidad || 1000
      return (v.separadores ?? []).map((s) => {
        const heridas = (v.heridas?.get(s.datos.plano as CapaDeLaHerida) ?? []).filter(
          (h) => s.datos.incision === undefined || h.incision === s.datos.incision,
        )
        const punta = s.instrumento.grupo.getWorldPosition(new THREE.Vector3())
        const cerca = heridas.length ? Math.min(...heridas.map((h) => alLabio(h, s.datos.lado, punta))) : null
        const antes = s.punto
          .clone()
          .addScaledVector(s.direccion, s.datos.lado === 0 ? 0 : s.datos.aperturaMm / mm)
          .addScaledVector(s.normal, 0.4 / mm)
        const cercaAntes = heridas.length ? Math.min(...heridas.map((h) => alLabio(h, s.datos.lado, antes))) : null
        const redondo = (d: number | null) => (d === null || !Number.isFinite(d) ? null : Math.round(d * mm * 10) / 10)
        const borde = labioDelSeparador(s, v.heridas)
        let seAparto: number | null = null
        if (borde && s.datos.lado !== 0) seAparto = borde.ahora.distanceTo(borde.reposo)
        else if (borde) {
          // En un autoestático, el borde que da es el medio de los dos: se mide cada labio en su sitio.
          const lados = ([1, -1] as const).map((lado) => labioDelSeparador({ ...s, datos: { ...s.datos, lado } }, v.heridas))
          if (lados[0] && lados[1]) seAparto = (lados[0].ahora.distanceTo(lados[0].reposo) + lados[1].ahora.distanceTo(lados[1].reposo)) / 2
        }
        const giro = s.instrumento.grupo.getWorldQuaternion(new THREE.Quaternion())
        const normal = s.normal.clone().normalize()
        const pala = new THREE.Vector3(0, 0, -1).applyQuaternion(giro)
        const mango = new THREE.Vector3(0, 1, 0).applyQuaternion(giro)
        const grados = (r: number) => Math.round((r * 180) / Math.PI)
        // La pala: los vértices del instrumento que salen del codo hacia la pala y no hacia el mango. La punta es el
        // que más baja; de ahí su profundidad bajo el borde y cuánto de ella tapa el tejido.
        const enLaPala: THREE.Vector3[] = []
        const enElMango: THREE.Vector3[] = []
        s.instrumento.grupo.updateMatrixWorld(true)
        s.instrumento.grupo.traverse((o) => {
          const m = o as THREE.Mesh
          const pos = m.isMesh ? (m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined) : undefined
          if (!pos || !m.visible) return
          const paso = Math.max(1, Math.floor(pos.count / 3000))
          for (let i = 0; i < pos.count; i += paso) {
            const w = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
            const rel = w.clone().sub(punta)
            if (rel.dot(mango) * mm < 3 && rel.dot(pala) * mm > 1) enLaPala.push(w)
            if (rel.dot(mango) * mm > 3 && rel.dot(mango) * mm < 40) enElMango.push(w)
          }
        })
        // Lo que tapa el mango, sin contar el propio instrumento: la cara de abajo del mango la tapa la de arriba.
        let mangoOculto: number | null = null
        if (enElMango.length > 0 && v.camara && v.raiz) {
          const propias = new Set<THREE.Object3D>()
          s.instrumento.grupo.traverse((o) => propias.add(o))
          const ojo = v.camara.getWorldPosition(new THREE.Vector3())
          const muestra = enElMango.filter((_, i) => i % Math.max(1, Math.floor(enElMango.length / 60)) === 0)
          const rayo = new THREE.Raycaster()
          let tapadas = 0
          for (const w of muestra) {
            const hacia = w.clone().sub(ojo)
            const lejos = hacia.length()
            rayo.set(ojo, hacia.normalize())
            rayo.far = lejos - 0.5 / mm
            if (rayo.intersectObject(v.raiz, true).some((g) => g.object.visible && (g.object as THREE.Mesh).isMesh && !propias.has(g.object))) tapadas++
          }
          mangoOculto = Math.round((100 * tapadas) / muestra.length)
        }
        let palaBajo: number | null = null
        let oculta: number | null = null
        if (enLaPala.length > 0) {
          const masHonda = enLaPala.reduce((a, w) => (w.clone().sub(punta).dot(pala) > a.clone().sub(punta).dot(pala) ? w : a))
          if (borde) palaBajo = borde.ahora.clone().sub(masHonda).dot(normal)
          if (v.camara && v.raiz) {
            const ojo = v.camara.getWorldPosition(new THREE.Vector3())
            const muestra = enLaPala.filter((_, i) => i % Math.max(1, Math.floor(enLaPala.length / 40)) === 0)
            const rayo = new THREE.Raycaster()
            let tapadas = 0
            for (const w of muestra) {
              const hacia = w.clone().sub(ojo)
              const lejos = hacia.length()
              rayo.set(ojo, hacia.normalize())
              rayo.far = lejos - 0.5 / mm
              if (rayo.intersectObject(v.raiz, true).some((g) => g.object.visible && (g.object as THREE.Mesh).isMesh)) tapadas++
            }
            oculta = muestra.length ? Math.round((100 * tapadas) / muestra.length) : null
          }
        }
        let haciaFuera: number | null = null
        if (borde && s.datos.lado !== 0) {
          const otro = labioEnLaPosicion(borde.herida, s.datos.lado > 0 ? -1 : 1, s.datos.posicion)
          if (otro) {
            // Con los labios como están ahora: en reposo los dos coinciden en la línea del corte y no dan dirección.
            const fuera = borde.ahora.clone().sub(otro.ahora)
            fuera.addScaledVector(normal, -fuera.dot(normal))
            const tendido = mango.clone().addScaledVector(normal, -mango.dot(normal))
            if (fuera.lengthSq() > 1e-12 && tendido.lengthSq() > 1e-12) haciaFuera = grados(tendido.angleTo(fuera))
          }
        }
        return {
          nombre: s.datos.nombre,
          plano: s.datos.plano,
          lado: s.datos.lado,
          aperturaMm: s.datos.aperturaMm,
          posicion: Math.round(s.datos.posicion * 1000) / 1000,
          bordeSeApartoMm: redondo(seAparto),
          palaDeLaVerticalGrados: grados(pala.angleTo(normal.clone().negate())),
          mangoSobreLaPielGrados: 90 - grados(mango.angleTo(normal)),
          enPantalla: {
            codo: aPantalla(v, punta),
            borde: borde ? aPantalla(v, borde.ahora) : null,
            bordeEnReposo: borde ? aPantalla(v, borde.reposo) : null,
          },
          alLabioMm: redondo(cerca),
          comoAntesMm: redondo(cercaAntes),
          palaBajoElBordeMm: redondo(palaBajo),
          palaOcultaPct: oculta,
          mangoOcultoPct: mangoOculto,
          mangoHaciaFueraGrados: haciaFuera,
        }
      })
    },
    /**
     * Dónde se ven en pantalla los dos labios de la última herida de esa capa, en `donde` (de 0 a 1 a lo largo): un
     * Farabeuf por labio se pone con un clic a cada lado del corte, y el lado lo decide en qué labio cae el clic.
     */
    labiosEnPantalla(
      capa: CapaDeLaHerida,
      donde = 0.5,
      incision?: number,
    ): { mas: PuntoEnPantalla | null; menos: PuntoEnPantalla | null } | null {
      const v = leer()
      // Con número, la de esa incisión: los brazos de una T son incisiones distintas en la malla (D-420).
      const h = incision === undefined ? v.heridas?.get(capa)?.at(-1) : laHerida(v, capa, incision)
      if (!h) return null
      h.malla.updateMatrixWorld(true)
      const mas = labioEnLaPosicion(h, 1, donde)
      const menos = labioEnLaPosicion(h, -1, donde)
      return { mas: mas ? aPantalla(v, mas.ahora) : null, menos: menos ? aPantalla(v, menos.ahora) : null }
    },
    /** Cómo asienta la placa puesta: ver `AsientoMedido`. `null` sin placa o sin hueso visible. */
    asientoDeLaPlaca(): AsientoMedido | null {
      const v = leer()
      const placa = v.implantes?.placa
      const huesos = (v.huesos ?? []).filter((h) => h.visible)
      if (!placa || huesos.length === 0) return null
      const mm = v.milimetrosPorUnidad || 1000
      const caja = cajaLocalDeLaPlaca(placa)
      if (caja.isEmpty()) return null
      const n = placa.normal.clone().normalize()
      const abajo = n.clone().negate()
      const rayo = new THREE.Raycaster()
      const primerHueso = (desde: THREE.Vector3) => {
        rayo.set(desde.clone().addScaledVector(n, 20 / mm), abajo)
        rayo.far = 40 / mm
        return rayo.intersectObjects(huesos, false).find((g) => g.object.visible) ?? null
      }
      // La rejilla: cinco filas a lo ancho y una cada dos milímetros a lo largo, a 0,3 mm del canto.
      const margen = 0.0003
      const largoMm = (caja.max.z - caja.min.z) * 1000
      const columnas = Math.max(8, Math.round(largoMm / 2))
      // Si la placa se asentó con su cara de verdad (D-427), se mide desde su metal, y lo que cae fuera de él no se mide.
      // Desde el fondo de la caja, en la de gancho se medía desde la punta del gancho, 15 mm por debajo del cuerpo.
      const deVerdad = !placa.contorno && placa.cara?.muestras ? placa.cara : undefined
      const escala = placa.grupo.scale.x || 1
      const origen = placa.desdeElOrigen
      let contacto = 0
      let sinHueso = 0
      let penetracion = 0
      const holguras: number[] = []
      let muestras = 0
      for (let i = 0; i < 5; i++) {
        const x = caja.min.x + margen + ((caja.max.x - caja.min.x - 2 * margen) * i) / 4
        for (let k = 0; k <= columnas; k++) {
          const z = caja.min.z + margen + ((caja.max.z - caja.min.z - 2 * margen) * k) / columnas
          let alto = placa.yMinimoLocal
          if (deVerdad) {
            const h = alturaDeLaCara(deVerdad, x * escala - origen.x, z * escala - origen.z)
            if (!Number.isFinite(h)) continue
            alto = (h + origen.y) / escala
          }
          const recto = new THREE.Vector3(x, alto, z)
          const local = placa.contorno ? placa.contorno.mapa(recto) : recto
          const p = placa.grupo.localToWorld(local.clone())
          muestras++
          const golpe = primerHueso(p)
          if (!golpe) {
            sinHueso++
            continue
          }
          // Positivo: hueco entre la placa y el hueso. Negativo: la cara de abajo está dentro del hueso.
          const d = p.clone().sub(golpe.point).dot(n) * mm
          if (d < 0) penetracion = Math.max(penetracion, -d)
          if (Math.abs(d) <= 0.5) contacto++
          holguras.push(Math.max(0, d))
        }
      }
      const agujerosPorTrozo: Record<string, number> = {}
      const trozos = new Set<THREE.Mesh>()
      placa.agujerosMm.forEach((_, i) => {
        const golpe = primerHueso(posicionDelAgujero(placa, i, 'abajo'))
        const nombre = golpe ? golpe.object.name : '(sin hueso)'
        agujerosPorTrozo[nombre] = (agujerosPorTrozo[nombre] ?? 0) + 1
        if (golpe) trozos.add(golpe.object as THREE.Mesh)
      })
      const ejeDelHueso = ejeLargoDeLasMallas([...trozos])
      let desvio = NaN
      if (ejeDelHueso) {
        const enLaCara = ejeDelHueso.clone().addScaledVector(n, -ejeDelHueso.dot(n))
        const ejePlaca = ejeDeLaPlaca(placa)
        if (enLaCara.lengthSq() > 1e-12) {
          const a = (ejePlaca.angleTo(enLaCara.normalize()) * 180) / Math.PI
          desvio = Math.min(a, 180 - a)
        }
      }
      const decima = (x: number) => Math.round(x * 10) / 10
      const media = holguras.length ? holguras.reduce((a, b) => a + b, 0) / holguras.length : 0
      return {
        penetracionMaximaMm: decima(penetracion),
        holguraMediaMm: decima(media),
        holguraMaximaMm: decima(holguras.length ? Math.max(...holguras) : 0),
        contactoPct: Math.round((100 * contacto) / Math.max(1, muestras)),
        sinHuesoPct: Math.round((100 * sinHueso) / Math.max(1, muestras)),
        desvioDelEjeGrados: decima(desvio),
        agujerosPorTrozo,
        muestras,
      }
    },
    /**
     * Dónde cae en pantalla cada agujero de la placa puesta, por la cara de arriba: una prueba que perfora, mide y
     * atornilla tiene que hacer clic en un orificio, y su sitio depende de dónde se apoyó la placa y de la cámara.
     */
    agujerosDeLaPlaca(): PuntoEnPantalla[] {
      const v = leer()
      const placa = v.implantes?.placa
      if (!placa) return []
      placa.grupo.updateMatrixWorld(true)
      return placa.agujerosMm.map((_, i) => aPantalla(v, posicionDelAgujero(placa, i, 'arriba'))).filter((p): p is PuntoEnPantalla => !!p)
    },
    /**
     * La placa puesta: cómo se llama, lo que mide (de su caja, no de su nombre: una placa a medida tiene que medir lo que
     * se pidió), cuántos agujeros, cómo se movió desde que se apoyó y dónde está su centro en pantalla (P-008 E3 y E4).
     */
    placa() {
      const v = leer()
      const placa = v.implantes?.placa
      if (!placa) return null
      placa.grupo.updateMatrixWorld(true)
      const centro = new THREE.Box3().setFromObject(placa.grupo).getCenter(new THREE.Vector3())
      const decima = (mm: number) => Math.round(mm * 10) / 10
      return {
        nombre: placa.nombre,
        url: placa.url ?? null,
        largoMm: decima(placa.largoMm),
        anchoMm: decima(placa.anchoMm),
        grosorMm: decima(placa.grosorMm),
        agujeros: placa.agujerosMm.length,
        separadaDelHuesoMm: decima(placa.separadaDelHuesoMm),
        fijada: placa.fijada,
        ajuste: { ...placa.ajuste },
        centro: aPantalla(v, centro),
      }
    },
    /** Los tornillos puestos, con su juicio y la cabeza en pantalla. */
    tornillos(): TornilloMedido[] {
      const v = leer()
      return [...(v.implantes?.tornillos.entries() ?? [])].map(([id, t]) => ({
        id,
        largoMm: t.datos.largoMm,
        bicortical: t.datos.bicortical,
        punta: aPantalla(v, t.grupo.getWorldPosition(new THREE.Vector3())),
      }))
    },
    /**
     * Dónde caen los triángulos vueltos respecto de cada incisión de su malla (D-421, la esquina de la L): para cada uno,
     * su centro con la herida cerrada, y en cada herida, a qué recorrido de su trazo queda (`s`), a qué distancia (`d`) y
     * de qué lado (`lado`, el signo contra la normal de la piel por la tangente del trazo), todo en milímetros.
     */
    vueltosPorIncision(capa: CapaDeLaHerida): {
      malla: string
      incisiones: { incision: number; largoMm: number; puntos: [number, number, number][] }[]
      vueltos: { centro: [number, number, number]; movidoMm: number; enCada: { incision: number; s: number; d: number; lado: number }[] }[]
    }[] {
      const v = leer()
      const mm = v.milimetrosPorUnidad || 1000
      const mallas = new Set<THREE.Mesh>((v.heridas?.get(capa) ?? []).map((h) => h.malla))
      return [...mallas].map((malla) => {
        const cadena = cadenaDeLaMalla(malla)
        const ultima = cadena[cadena.length - 1]
        const antes = ultima.corte.posiciones
        const indices = ultima.corte.indices
        malla.updateWorldMatrix(true, false)
        const aMundo = malla.matrixWorld
        const enElMundo = (i: number) => new THREE.Vector3(antes[3 * i], antes[3 * i + 1], antes[3 * i + 2]).applyMatrix4(aMundo)
        const lineas = cadena.map((h) => {
          const largos = [0]
          for (let i = 1; i < h.trazo.puntos.length; i++) largos.push(largos[i - 1] + h.trazo.puntos[i].distanceTo(h.trazo.puntos[i - 1]))
          return { h, largos }
        })
        const vueltosAqui = losVueltos(malla, mm)
        const centros: { centro: THREE.Vector3; movidoMm: number }[] = []
        let k = 0
        const ahora = malla.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let t = 0; t + 2 < indices.length; t += 3) {
          const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
          const n0 = new THREE.Vector3(...normalDelTriangulo(antes, a, b, c))
          const n1 = new THREE.Vector3(...normalDelTriangulo(ahora.array as ArrayLike<number>, a, b, c))
          if (n0.dot(n1) >= 0 || 0.5 * n0.length() * (ultima.escala * mm) ** 2 < 0.01) continue
          centros.push({ centro: enElMundo(a).add(enElMundo(b)).add(enElMundo(c)).multiplyScalar(1 / 3), movidoMm: vueltosAqui[k]?.movidoMm ?? 0 })
          k++
        }
        const r = (x: number) => Math.round(x * 10) / 10
        return {
          malla: malla.name,
          incisiones: lineas.map(({ h, largos }) => ({
            incision: h.incision,
            largoMm: r(largos[largos.length - 1] * mm),
            puntos: h.trazo.puntos.map((q) => [r(q.x * mm), r(q.y * mm), r(q.z * mm)] as [number, number, number]),
          })),
          vueltos: centros.map(({ centro, movidoMm }) => ({
            centro: [r(centro.x * mm), r(centro.y * mm), r(centro.z * mm)] as [number, number, number],
            movidoMm,
            enCada: lineas.map(({ h, largos }) => {
              let mejor = { s: 0, d: Infinity, lado: 0 }
              for (let i = 0; i + 1 < h.trazo.puntos.length; i++) {
                const p0 = h.trazo.puntos[i]
                const seg = h.trazo.puntos[i + 1].clone().sub(p0)
                const l2 = seg.lengthSq()
                const f = l2 > 0 ? Math.min(1, Math.max(0, centro.clone().sub(p0).dot(seg) / l2)) : 0
                const q = p0.clone().addScaledVector(seg, f)
                const d = q.distanceTo(centro)
                if (d < mejor.d) {
                  const n = h.trazo.normales[i] ?? new THREE.Vector3(0, 0, 1)
                  const lado = Math.sign(seg.clone().cross(n).dot(centro.clone().sub(q)))
                  mejor = { s: largos[i] + f * Math.sqrt(l2), d, lado }
                }
              }
              return { incision: h.incision, s: r(mejor.s * mm), d: r(mejor.d * mm), lado: mejor.lado }
            }),
          })),
        }
      })
    },
    /**
     * Cuántos triángulos quedan vueltos con cada herida de la malla abierta sola, con y sin su retracción (D-421, la esquina
     * de la L): para saber qué herida pliega, y si es lo que abren los separadores o lo que se retrae el tejido solo.
     */
    vueltosPorHerida(capa: CapaDeLaHerida): { malla: string; casos: Record<string, number> }[] {
      const v = leer()
      const mallas = new Set<THREE.Mesh>((v.heridas?.get(capa) ?? []).map((h) => h.malla))
      return [...mallas].map((malla) => {
        const cadena = cadenaDeLaMalla(malla)
        const ultima = cadena[cadena.length - 1]
        const base = ultima.corte.posiciones
        const indices = ultima.corte.indices
        const apertura = (h: HeridaEnCapa, conPerfil: boolean, conReposo: boolean) => ({
          mas: conPerfil ? h.mas / h.escala : 0,
          menos: conPerfil ? h.menos / h.escala : 0,
          perfil: conPerfil && h.perfil
            ? (t: number) => {
                const o = h.perfil!(t)
                return { mas: o.mas / h.escala, menos: o.menos / h.escala }
              }
            : undefined,
          reposo: conReposo ? reposoVigente(h) / h.escala : 0,
          punta: h.punta,
          soltura: solturaDeLaHerida(h),
          // Las arrugas van con lo que tira la mano, como en el lienzo (D-423).
          arrugas: conPerfil ? arrugasDeLaHerida(h) : undefined,
        })
        const contar = (q: ArrayLike<number>) => {
          let n = 0
          for (let t = 0; t + 2 < indices.length; t += 3) {
            const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
            const n0 = normalDelTriangulo(base, a, b, c)
            const n1 = normalDelTriangulo(q, a, b, c)
            if (Math.hypot(n0[0], n0[1], n0[2]) * 0.5 * (ultima.escala * (v.milimetrosPorUnidad || 1000)) ** 2 < 0.01) continue
            if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0) n++
          }
          return n
        }
        const casos: Record<string, number> = {}
        const variantes: [string, (i: number) => [boolean, boolean]][] = [['todas', () => [true, true]], ['ninguna', () => [false, false]]]
        cadena.forEach((h, j) => {
          variantes.push([`#${h.incision} sola`, (i) => (i === j ? [true, true] : [false, false])])
          variantes.push([`#${h.incision} sola sin retraccion`, (i) => (i === j ? [true, false] : [false, false])])
          variantes.push([`#${h.incision} sola solo retraccion`, (i) => (i === j ? [false, true] : [false, false])])
          variantes.push([`#${h.incision} y las demas solo retraccion`, (i) => (i === j ? [true, true] : [false, true])])
        })
        for (const [nombre, que] of variantes) {
          casos[nombre] = contar(
            // Con su retracción, la herida lleva también la de los colgajos que le dejan las posteriores (D-422).
            componerCortes(cadena.map((h, i) => ({ corte: h.corte, apertura: { ...apertura(h, ...que(i)), colgajos: que(i)[1] ? colgajosDe(cadena, i) : undefined } }))),
          )
        }
        return { malla: malla.name, casos }
      })
    },
    /**
     * El mapa de lo que arrastra la herida `incision` sola, sin retracción (D-421): vértices movidos y triángulos vueltos,
     * en mm. Con `incision` 0, todas las de la malla abiertas a la vez: lo que pliega la esquina de una L es la suma.
     */
    mapaDeLaHerida(capa: CapaDeLaHerida, incision: number, conRetraccion = false) {
      const v = leer()
      const mm = v.milimetrosPorUnidad || 1000
      const malla = (v.heridas?.get(capa) ?? []).find((h) => (incision === 0 || h.incision === incision) && /^Piel/.test(h.malla.name))?.malla
      if (!malla) return null
      const cadena = cadenaDeLaMalla(malla)
      const ultima = cadena[cadena.length - 1]
      const base = ultima.corte.posiciones
      const indices = ultima.corte.indices
      const q = componerCortes(
        cadena.map((h) => ({
          corte: h.corte,
          apertura: incision === 0 || h.incision === incision
            ? {
                mas: h.mas / h.escala,
                menos: h.menos / h.escala,
                perfil: h.perfil
                  ? (t: number) => {
                      const o = h.perfil!(t)
                      return { mas: o.mas / h.escala, menos: o.menos / h.escala }
                    }
                  : undefined,
                reposo: conRetraccion ? reposoVigente(h) / h.escala : 0,
                punta: h.punta,
                soltura: solturaDeLaHerida(h),
              }
            : { mas: 0, menos: 0, reposo: 0 },
        })),
      )
      malla.updateWorldMatrix(true, false)
      const M = malla.matrixWorld
      const r = (x: number) => Math.round(x * 100) / 100
      const enMm = (p: ArrayLike<number>, i: number) => new THREE.Vector3(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyMatrix4(M).multiplyScalar(mm)
      const vertices: [number, number, number, number, number, number][] = []
      const indice = new Map<number, number>()
      const corte = (incision === 0 ? ultima : cadena.find((h) => h.incision === incision)!).corte
      for (let i = 0; i < base.length / 3; i++) {
        const a = enMm(base, i)
        const b = enMm(q, i)
        if (a.distanceTo(b) < 0.05) continue
        indice.set(i, vertices.length)
        vertices.push([r(a.x), r(a.y), r(a.z), r(b.x - a.x), r(b.y - a.y), r(b.z - a.z)])
      }
      const vueltos: number[][] = []
      for (let t = 0; t + 2 < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
        const n0 = normalDelTriangulo(base, a, b, c)
        const n1 = normalDelTriangulo(q, a, b, c)
        if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] >= 0) continue
        if (Math.hypot(n0[0], n0[1], n0[2]) * 0.5 * (ultima.escala * mm) ** 2 < 0.01) continue
        vueltos.push([a, b, c].map((i) => {
          const p0 = enMm(base, i)
          const p1 = enMm(q, i)
          return [r(p0.x), r(p0.y), r(p0.z), r(p1.x), r(p1.y), r(p1.z), corte.lado[i] ?? 0, r(corte.pesoLateral[i] ?? 0), r(corte.largoT[i] ?? 0)]
        }).flat())
      }
      const trazos = cadena.map((h) => ({ incision: h.incision, puntos: h.trazo.puntos.map((p) => [r(p.x * mm), r(p.y * mm), r(p.z * mm)]) }))
      return { vertices, vueltos, trazos }
    },
    /**
     * Los triángulos plegados de las heridas de esa capa, uno por uno: para saber de dónde sale un pliegue —la pared,
     * una punta, el medio del arrastre— cuando `heridas()` dice que los hay.
     */
    vueltosEn(capa: CapaDeLaHerida): { malla: string; vueltos: TrianguloVuelto[] }[] {
      const v = leer()
      const mm = v.milimetrosPorUnidad || 1000
      const mallas = new Set<THREE.Mesh>((v.heridas?.get(capa) ?? []).map((h) => h.malla))
      return [...mallas].map((malla) => ({ malla: malla.name, vueltos: losVueltos(malla, mm, (p) => aPantalla(v, p)) }))
    },
    /** Astillas y aristas dobladas de cada malla con herida en esa capa (`CalidadDeLaMalla`, D-421). */
    calidadEn(capa: CapaDeLaHerida): CalidadDeLaMalla[] {
      const v = leer()
      const mm = v.milimetrosPorUnidad || 1000
      const mallas = new Set<THREE.Mesh>((v.heridas?.get(capa) ?? []).map((h) => h.malla))
      return [...mallas].flatMap((malla) => calidadDeLaMalla(malla, mm) ?? [])
    },
    /** Cada herida abierta, por capa: qué malla, de qué incisión y cuánto abre. */
    heridas(): HeridaMedida[] {
      const v = leer()
      const mm = v.milimetrosPorUnidad || 1000
      const salida: HeridaMedida[] = []
      for (const [capa, heridas] of v.heridas ?? []) {
        for (const h of heridas) {
          salida.push({
            capa,
            incision: h.incision,
            malla: h.malla.name,
            masMm: Math.round(h.mas * mm * 10) / 10,
            menosMm: Math.round(h.menos * mm * 10) / 10,
            reposoMm: Math.round(reposoVigente(h) * mm * 10) / 10,
            aberturaMm: Math.round(aberturaDe(h) * mm * 10) / 10,
            vertices: h.malla.geometry.getAttribute('position')?.count ?? 0,
            aristaDelLabioMm: aristaDelLabio(h, mm),
            triangulosVueltos: losVueltos(h.malla, mm).filter((x) => x.arrastre > 0).length,
            vueltosFueraDeLaHerida: losVueltos(h.malla, mm).filter((x) => x.arrastre === 0).length,
            tardoMs: Math.round(h.tardoMs * 10) / 10,
            grieta: {
              largoMm: Math.round((h.corte.grieta.hasta - h.corte.grieta.desde) * h.corte.curva.largoTotal * h.escala * mm * 10) / 10,
              cerradaAlInicio: h.corte.grieta.cerradaAlInicio,
              cerradaAlFinal: h.corte.grieta.cerradaAlFinal,
              desdeMm: Math.round(h.corte.grieta.desde * h.corte.curva.largoTotal * h.escala * mm * 10) / 10,
              trazoMm: Math.round(h.corte.curva.largoTotal * h.escala * mm * 10) / 10,
            },
            cruces: h.cruces ?? null,
            soltura: solturaDeLaHerida(h) ?? null,
          })
        }
      }
      return salida
    },
    /**
     * Qué se dibuja encima de cada herida: la cinta del trazo y el borde de los labios. Es lo que se mira para saber si
     * la incisión sigue marcada o ya se apartó para dejar ver el plano de debajo (P-008 E1).
     */
    dibujoDeLasHeridas(): { capa: CapaDeLaHerida; incision: number; cinta: boolean; borde: boolean }[] {
      const v = leer()
      return [...(v.heridas ?? [])].flatMap(([capa, heridas]) =>
        heridas.map((h) => ({ capa, incision: h.incision, cinta: h.cinta.visible, borde: h.bordes.visible })),
      )
    },
    /**
     * Dónde se ve un punto de la última incisión de esa capa, de 0 (su inicio) a 1 (su final), sobre la curva que se
     * trazó y no sobre la caja de la malla. El pedido 8 mete el Farabeuf «en medio de la incisión» del músculo, y un clic
     * que no cae en el labio es para retraer el músculo entero (`decidirElClicDelSeparador`): sin esto la prueba
     * pinchaba el vientre del músculo, lo retraía, y parecía que el separador no quedaba puesto.
     */
    enLaIncision(capa: CapaDeLaHerida, donde = 0.5, incision?: number): PuntoEnPantalla | null {
      const v = leer()
      const lista = v.heridas?.get(capa) ?? []
      const h = incision === undefined ? lista[lista.length - 1] : laHerida(v, capa, incision)
      if (!h) return null
      const { tramos, largoTotal } = h.corte.curva
      const objetivo = largoTotal * Math.min(1, Math.max(0, donde))
      const tramo = tramos.find((t) => t.desde + t.largo >= objetivo) ?? tramos[tramos.length - 1]
      if (!tramo) return null
      // La curva está en las unidades locales de la malla, como la cinta que se tiende por ella.
      const s = Math.min(tramo.largo, Math.max(0, objetivo - tramo.desde))
      h.malla.updateMatrixWorld(true)
      const punto = new THREE.Vector3(tramo.a[0] + tramo.d[0] * s, tramo.a[1] + tramo.d[1] * s, tramo.a[2] + tramo.d[2] * s)
      return aPantalla(v, punto.applyMatrix4(h.malla.matrixWorld))
    },
  }
}

export type SondaDelLienzo = ReturnType<typeof crearLaSonda>

/** Cuelga la sonda de `window.__sondaDelLienzo` mientras el lienzo está montado. Devuelve cómo quitarla. */
export function instalarLaSonda(leer: () => LoQueVeLaSonda): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return () => {}
  const ventana = window as unknown as { __sondaDelLienzo?: SondaDelLienzo }
  const sonda = crearLaSonda(leer)
  ventana.__sondaDelLienzo = sonda
  return () => {
    if (ventana.__sondaDelLienzo === sonda) delete ventana.__sondaDelLienzo
  }
}
