import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CapaDeLaHerida } from '@/lib/exposicion'
import type { SeparadorEnEscena } from './exposicionEnLaEscena'
import type { HeridaEnCapa } from './heridas'

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
  milimetrosPorUnidad: number
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
  /** De la punta del instrumento al borde de su labio, tal como está ahora, en milímetros. */
  alLabioMm: number | null
  /**
   * Lo mismo para donde la ponía la cuenta de antes del 2026-11-03 —el punto de apoyo más toda la apertura—: la
   * diferencia con `alLabioMm` es lo que la hoja flotaba.
   */
  comoAntesMm: number | null
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
        return {
          nombre: s.datos.nombre,
          plano: s.datos.plano,
          lado: s.datos.lado,
          aperturaMm: s.datos.aperturaMm,
          alLabioMm: redondo(cerca),
          comoAntesMm: redondo(cercaAntes),
        }
      })
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
