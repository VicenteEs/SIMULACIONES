import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CapaDeLaHerida } from '@/lib/exposicion'
import { labioDelSeparador, labioEnLaPosicion, type SeparadorEnEscena } from './exposicionEnLaEscena'
import { sitioEnLaHerida, type HeridaEnCapa } from './heridas'
import { ejeDeLaPlaca, posicionDelAgujero, type ImplantesEnEscena, type PlacaColocada } from './implantesEnLaEscena'
import { poseActual } from './vistaDelPaciente'
import type { EncuadreDelPaso } from '@/lib/encuadreDelPaso'

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
  /** Lo que abre cada labio en su punto más abierto, en milímetros. */
  masMm: number
  menosMm: number
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
     * Lleva la cámara a mirar ese punto desde `distanciaMm`, por el mismo lado desde el que mira ahora. Es el
     * encuadre de quien se acerca a la herida antes de operar; un vídeo con la pierna entera no enseña nada.
     */
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
          }
        })
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
          mangoHaciaFueraGrados: haciaFuera,
        }
      })
    },
    /**
     * Dónde se ven en pantalla los dos labios de la última herida de esa capa, en `donde` (de 0 a 1 a lo largo): un
     * Farabeuf por labio se pone con un clic a cada lado del corte, y el lado lo decide en qué labio cae el clic.
     */
    labiosEnPantalla(capa: CapaDeLaHerida, donde = 0.5): { mas: PuntoEnPantalla | null; menos: PuntoEnPantalla | null } | null {
      const v = leer()
      const h = v.heridas?.get(capa)?.at(-1)
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
      let contacto = 0
      let sinHueso = 0
      let penetracion = 0
      const holguras: number[] = []
      let muestras = 0
      for (let i = 0; i < 5; i++) {
        const x = caja.min.x + margen + ((caja.max.x - caja.min.x - 2 * margen) * i) / 4
        for (let k = 0; k <= columnas; k++) {
          const z = caja.min.z + margen + ((caja.max.z - caja.min.z - 2 * margen) * k) / columnas
          const recto = new THREE.Vector3(x, placa.yMinimoLocal, z)
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
    enLaIncision(capa: CapaDeLaHerida, donde = 0.5): PuntoEnPantalla | null {
      const v = leer()
      const lista = v.heridas?.get(capa) ?? []
      const h = lista[lista.length - 1]
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
