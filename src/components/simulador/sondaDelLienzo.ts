import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CapaDeLaHerida } from '@/lib/exposicion'
import { labioDelSeparador, type SeparadorEnEscena } from './exposicionEnLaEscena'
import { sitioEnLaHerida, type HeridaEnCapa } from './heridas'
import { posicionDelAgujero, type ImplantesEnEscena } from './implantesEnLaEscena'

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
    /**
     * Lleva la cámara encima de la última herida de esa capa, mirándola de frente por su normal: es como la ve quien
     * opera, y el único encuadre en que se puede juzgar al milímetro dónde quedó cada hoja respecto del borde.
     */
    mirarLaHerida(capa: CapaDeLaHerida, distanciaMm = 120, donde = 0.5): boolean {
      const v = leer()
      const h = v.heridas?.get(capa)?.at(-1)
      const sitio = h ? sitioEnLaHerida(h, donde, 1) : null
      if (!sitio || !v.camara || !v.controles) return false
      v.controles.target.copy(sitio.punto)
      v.camara.position.copy(sitio.punto).addScaledVector(sitio.normal, distanciaMm / (v.milimetrosPorUnidad || 1000))
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
        }
      })
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
