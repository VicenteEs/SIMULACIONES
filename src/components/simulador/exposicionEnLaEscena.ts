import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  aplicarColores,
  aplicarEntorno,
  aplicarPose,
  liberarHerramienta,
  prepararHerramienta,
  type HerramientaCargada,
} from '@/instrumental/herramienta3d'
import type { AjustesDeInstrumento } from '@/instrumental/modelo'
import {
  abreLaCapa,
  alturaEfectivaDelPellizco,
  ANGULO_DEL_MANGO_DE_LA_PALANCA_GRADOS,
  deLaIncision,
  direccionDelMango,
  perfilDeLaCapa,
  puntasDeLosLabios,
  type CapaDeLaHerida,
  type Pellizco,
  type SeparadorColocado,
} from '@/lib/exposicion'
import { LIMITE_PARA_COLOCAR_MM, HONDURA_PARA_CAMBIAR_DE_PLANO_MM } from '@/lib/abordajePorPlanos'
import { bajoElTrazo } from '@/lib/corteDeMalla'
import { abrirCapa, ATRIBUTO_DE_LA_PARED, FUNDIDO_JUNTO_A_LA_PUNTA_MM, largoEnMm, verticeEnReposo, type HeridaEnCapa } from './heridas'

/**
 * Las pinzas y los separadores puestos en el campo, dentro de la escena.
 *
 * Son objetos que **se quedan**: el instrumento en la mano sigue al cursor, pero
 * un separador colocado en la herida, o la pinza que sostiene un pliegue de piel,
 * se quedan donde están mientras se hace otra cosa —se usan en pareja: una pinza
 * quien opera y otra el ayudante; un Farabeuf por borde—. Por eso no pueden ser
 * «el instrumento elegido» y tienen su propio ciclo de vida: se cargan, se posan,
 * se mueven con lo que abren y se sueltan.
 *
 * La aritmética —cuánto abre cada uno, dónde— está en `@/lib/exposicion` y se
 * prueba sin three; esto es el pegamento con la escena.
 */

// ------------------------------------------------------ un instrumento colocado

export interface InstrumentoColocado {
  /** Contenedor en la escena: se mueve él, no el modelo. */
  grupo: THREE.Group
  /** `null` mientras el archivo carga o si no se pudo abrir. */
  herramienta: HerramientaCargada | null
}

/** Pone un instrumento a la escena bajo un grupo propio. El modelo llega en metros: `escala` lo lleva a las unidades del caso. */
export function colocarInstrumento(
  escena: THREE.Scene,
  url: string,
  ajustes: AjustesDeInstrumento | null,
  entorno: THREE.Texture | null,
  escala: number,
  alCargar?: (h: HerramientaCargada) => void,
): InstrumentoColocado {
  const grupo = new THREE.Group()
  grupo.userData.deInterfaz = false
  escena.add(grupo)
  const colocado: InstrumentoColocado = { grupo, herramienta: null }
  new GLTFLoader().load(
    url,
    (gltf) => {
      // Si mientras tanto se quitó (grupo sin padre), no se monta: se suelta lo cargado.
      const h = prepararHerramienta(gltf.scene)
      if (!grupo.parent) {
        liberarHerramienta(h)
        return
      }
      h.raiz.scale.setScalar(escala)
      aplicarColores(h, ajustes)
      aplicarEntorno(h, entorno)
      grupo.add(h.raiz)
      colocado.herramienta = h
      alCargar?.(h)
    },
    undefined,
    () => {
      // Sin modelo, el instrumento colocado no se ve: la herida se abre igual y el panel lo dice.
    },
  )
  return colocado
}

export function soltarInstrumento(c: InstrumentoColocado) {
  if (c.herramienta) liberarHerramienta(c.herramienta)
  c.grupo.removeFromParent()
}

/**
 * Posa el grupo con la punta en `punto` y el mango hacia `mango` (unitario).
 * Los modelos están hechos con la punta en el origen y el mango a lo largo de +Y.
 */
export function posarEn(grupo: THREE.Object3D, punto: THREE.Vector3, mango: THREE.Vector3) {
  grupo.position.copy(punto)
  grupo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), mango.clone().normalize())
}

/**
 * Posa el grupo con el mango (+Y del modelo) hacia `mango` y lo que el modelo tiene hacia −Z hacia `abajo`.
 *
 * `posarEn` solo fija el mango: el giro alrededor de él quedaba a lo que diera el cuaternión más corto, y la pala del
 * Farabeuf —que sale del codo hacia −Z— quedaba acostada a lo largo de la herida, encima de la piel (P-008 E2). Con
 * los dos ejes, la pala va donde tiene que ir.
 */
export function posarConLosDosEjes(grupo: THREE.Object3D, punto: THREE.Vector3, mango: THREE.Vector3, abajo: THREE.Vector3) {
  const y = mango.clone().normalize()
  const z = abajo.clone().negate()
  z.addScaledVector(y, -z.dot(y))
  if (z.lengthSq() < 1e-12) return posarEn(grupo, punto, mango)
  z.normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  grupo.position.copy(punto)
  grupo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

// ------------------------------------------------------------ separadores

/**
 * Dónde está apoyado un separador en un plano: el punto de la superficie de esa capa, su normal, hacia dónde se
 * aleja el labio y en qué lugar de la herida de esa capa cae. Cada separador guarda el de cada plano por el que
 * ha pasado, para que bajarlo al músculo y volver a subirlo a la piel lo deje donde estaba.
 */
export interface SitioDeSeparador {
  punto: THREE.Vector3
  normal: THREE.Vector3
  direccion: THREE.Vector3
  posicion: number
}

export interface SeparadorEnEscena {
  datos: SeparadorColocado
  instrumento: InstrumentoColocado
  url: string
  ajustes: AjustesDeInstrumento | null
  /** Dónde se puso: sobre la superficie, en el mundo. */
  punto: THREE.Vector3
  normal: THREE.Vector3
  /** Hacia dónde se aleja el labio que sostiene, unitaria y ya con el signo del lado. */
  direccion: THREE.Vector3
  /** La inclinación del mango al colocarlo (la de la cámara de entonces). */
  mango: THREE.Vector3
  /** Los sitios que ha tenido en cada plano de partes blandas (el del hueso, que es del Hohmann, no cambia). */
  sitios: Partial<Record<CapaDeLaHerida, SitioDeSeparador>>
}

// ------------------------------------------------------------ el labio que se sostiene

/** Un punto del borde de una herida, en el mundo: donde está ahora, con la herida como esté, y donde estaba en reposo. */
export interface PuntoDelLabio {
  ahora: THREE.Vector3
  /**
   * Donde el labio descansa cuando nada lo sostiene: cerrado, más lo que se retrae solo (P-015). Lo que va de aquí a
   * `ahora` es lo que lo ha apartado la hoja.
   */
  reposo: THREE.Vector3
}

/**
 * El punto del labio `lado` que cae en `t` (de 0 a 1 a lo largo de la herida), en el mundo, ahora y en reposo. Se
 * interpola entre los dos vértices del labio que lo rodean: con uno cada dos milímetros (`PASO_DEL_LABIO_MM`) es el
 * borde que se ve, al milímetro (P-008 E2).
 *
 * Antes la hoja agarraba el vértice del labio más cercano al clic y se llevaba con él. En una malla de triángulos
 * largos ese vértice quedaba a uno o dos centímetros del sitio de la hoja (O-081): la hoja seguía a un trozo de labio
 * que no era el suyo, y cada uno abría y se movía por su lado.
 */
export function labioEnLaPosicion(h: HeridaEnCapa, lado: 1 | -1, t: number): PuntoDelLabio | null {
  const posiciones = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  const reposo = h.corte.posiciones
  // Otra incisión en la misma malla rehace su geometría: un índice que ya no está no se sigue.
  const cadena = (lado > 0 ? h.corte.labios.mas : h.corte.labios.menos).filter((v) => v < posiciones.count && 3 * v + 2 < reposo.length)
  if (cadena.length === 0) return null
  const tDe = (v: number) => h.corte.largoT[v]
  let k = 0
  while (k + 1 < cadena.length && tDe(cadena[k + 1]) < t) k++
  const a = cadena[k]
  const b = cadena[Math.min(k + 1, cadena.length - 1)]
  const f = tDe(b) > tDe(a) ? Math.min(1, Math.max(0, (t - tDe(a)) / (tDe(b) - tDe(a)))) : 0
  const m = h.malla.matrixWorld
  const ahora = (v: number) => new THREE.Vector3().fromBufferAttribute(posiciones, v)
  const antes = (v: number) => verticeEnReposo(h, v)
  return { ahora: ahora(a).lerp(ahora(b), f).applyMatrix4(m), reposo: antes(a).lerp(antes(b), f).applyMatrix4(m) }
}

/**
 * Dónde se busca el borde que se ve de un labio alrededor del punto de su cadena (`bordeQueSeVe`), en milímetros: de lado,
 * a lo largo de la herida; hacia la herida y hacia fuera, y por encima de él. Por encima llega a lo que sube la piel sobre
 * el trozo de tibia del caso 3 (hasta 30 mm, `pielSinAbultar`), y hacia fuera, a lo que ese bulto la corre.
 */
const BUSCAR_EL_BORDE_MM = { deLado: 3, haciaDentro: 6, haciaFuera: 25, arriba: 40 }

/**
 * El borde que se ve de un labio de la piel, en el mundo: lo más alto de su pared junto al punto `labio` de su cadena, o
 * `null` si queda a la altura de él o no hay pared (D-423). `n` es la normal de la piel ahí y `hacia`, hacia dónde se
 * aparta el labio.
 *
 * La cadena del labio es la de vértices por donde pasó el corte, y no siempre es el borde de arriba. Sobre la tibia del
 * caso 3 el trazo se baja del bulto (D-421) y la cadena queda en la cara de dentro, cuatro milímetros y medio bajo la de
 * fuera; y el abultamiento, que se suma después, sube la piel del labio hasta 23 mm y la corre 8 hacia fuera sin mover la
 * cadena. El Farabeuf enganchaba la cadena: con el codo bajo la piel que se veía, el mango salía por debajo de ella, y
 * al levantarlo sobre esa piel (`mangoSobreLaPiel`) quedaba de pie, a 70°, tapando el campo. La hoja tira del borde que
 * se ve, así que se engancha ahí.
 *
 * Es la pared de **este** labio la que mira a la herida, contra `hacia`: la del labio de enfrente mira al revés, y con la
 * herida recién abierta quedaría dentro de la ventana.
 */
function bordeQueSeVe(
  h: HeridaEnCapa,
  labio: THREE.Vector3,
  n: THREE.Vector3,
  hacia: THREE.Vector3,
  unidadesPorMm: number,
): THREE.Vector3 | null {
  const g = h.malla.geometry
  const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
  const pared = g.getAttribute(ATRIBUTO_DE_LA_PARED) as THREE.BufferAttribute | undefined
  const normales = g.getAttribute('normal') as THREE.BufferAttribute | undefined
  if (!pos || !pared || !normales) return null
  const fuera = hacia.clone().addScaledVector(n, -hacia.dot(n))
  if (fuera.lengthSq() < 1e-12) return null
  fuera.normalize()
  const deLado = new THREE.Vector3().crossVectors(n, fuera)
  const b = BUSCAR_EL_BORDE_MM
  h.malla.updateWorldMatrix(true, false)
  const matriz = h.malla.matrixWorld
  const p = new THREE.Vector3()
  const normal = new THREE.Vector3()
  let mejor: THREE.Vector3 | null = null
  let alto = 0.2 * unidadesPorMm
  for (let v = 0; v < pos.count; v++) {
    if (!(pared.getX(v) > 0)) continue
    p.fromBufferAttribute(pos, v).applyMatrix4(matriz).sub(labio)
    const arriba = p.dot(n)
    if (!(arriba > alto) || arriba > b.arriba * unidadesPorMm) continue
    if (Math.abs(p.dot(deLado)) > b.deLado * unidadesPorMm) continue
    const afuera = p.dot(fuera)
    if (afuera < -b.haciaDentro * unidadesPorMm || afuera > b.haciaFuera * unidadesPorMm) continue
    if (normal.fromBufferAttribute(normales, v).transformDirection(matriz).dot(fuera) > -0.2) continue
    alto = arriba
    // Sin lo que queda de lado: la hoja sigue en su sitio a lo largo de la herida, y el vértice más alto puede caer
    // a tres milímetros de él.
    mejor = labio.clone().addScaledVector(n, arriba).addScaledVector(fuera, afuera)
  }
  return mejor
}

/**
 * Dónde cae un punto del mundo a lo largo de una herida (de 0 a 1) y a qué distancia de sus labios, en reposo.
 * Es lo que deja que un separador de un plano profundo abra la herida de encima **en su sitio**, aunque las dos
 * incisiones se trazaran por separado y no midan lo mismo.
 */
export function cercaDeLaHerida(h: HeridaEnCapa, punto: THREE.Vector3): { t: number; distancia: number } | null {
  const local = punto.clone().applyMatrix4(h.malla.matrixWorld.clone().invert())
  const reposo = h.corte.posiciones
  let mejor: { t: number; distancia: number } | null = null
  for (const cadena of [h.corte.labios.mas, h.corte.labios.menos]) {
    for (const v of cadena) {
      const d = Math.hypot(reposo[3 * v] - local.x, reposo[3 * v + 1] - local.y, reposo[3 * v + 2] - local.z) * h.escala
      if (!mejor || d < mejor.distancia) mejor = { t: h.corte.largoT[v], distancia: d }
    }
  }
  return mejor
}

/**
 * A qué fracción del largo de una herida cae un separador de un plano más hondo que está **debajo** de ella, o `null` si
 * no lo está: lo que `aplicarSeparadoresALasHeridas` pide como `posicionEn`. Debajo es a no más del límite de colocar
 * de lado (`LIMITE_PARA_COLOCAR_MM`) y a no más de lo que un separador baja al cambiar de plano
 * (`HONDURA_PARA_CAMBIAR_DE_PLANO_MM`), medidos con el trazo de la herida (`bajoElTrazo`).
 *
 * Antes era `cercaDeLaHerida` contra el mismo límite de 30 mm, y esa distancia lleva la hondura dentro: un Farabeuf
 * bajado al músculo del caso 4 quedaba a 36,8 mm de los labios de la piel y no la habría abierto, y a 30,1 y 29,7 de
 * los de la fascia, que sostenía de un lado y no del otro (P-015). La piel se abría solo porque el separador seguía
 * con el número de incisión de la piel después de bajar, que es lo que dejaba sin abrir el músculo
 * (`cambiarElPlanoDelSeparador`).
 */
export function posicionBajoLaHerida(h: HeridaEnCapa, punto: THREE.Vector3, unidadesPorMm: number): number | null {
  return bajoLaHerida(h, punto, unidadesPorMm)?.t ?? null
}

/** Lo de `posicionBajoLaHerida`, con lo que se aparta de lado en milímetros y la normal de la herida ahí, en el mundo. */
function bajoLaHerida(h: HeridaEnCapa, punto: THREE.Vector3, unidadesPorMm: number): { t: number; deLadoMm: number; normal: THREE.Vector3 } | null {
  const local = punto.clone().applyMatrix4(h.malla.matrixWorld.clone().invert())
  const bajo = bajoElTrazo(h.corte.curva, [local.x, local.y, local.z])
  if (!bajo) return null
  const deLadoMm = (bajo.deLado * h.escala) / unidadesPorMm
  const altura = (bajo.altura * h.escala) / unidadesPorMm
  // Por encima de la herida no hay nada que un plano más hondo abra; se deja el margen del límite por la curvatura.
  if (deLadoMm > LIMITE_PARA_COLOCAR_MM || altura < -HONDURA_PARA_CAMBIAR_DE_PLANO_MM || altura > LIMITE_PARA_COLOCAR_MM) return null
  return { t: bajo.t, deLadoMm, normal: new THREE.Vector3(...bajo.normal).transformDirection(h.malla.matrixWorld) }
}

/**
 * La normal de la piel cortada que queda encima de un punto de un plano hondo, en el mundo, o `null` si no hay ninguna
 * encima: con ella se aparta ese plano (`ParametrosDeCorte.normalesDeEncima`, P-015). Encima es lo mismo que para un
 * separador hondo (`posicionBajoLaHerida`), y de dos incisiones de la piel vale la que queda menos de lado.
 */
export function normalDeLaPielEncima(pieles: readonly HeridaEnCapa[], punto: THREE.Vector3, unidadesPorMm: number): THREE.Vector3 | null {
  let mejor: { deLadoMm: number; normal: THREE.Vector3 } | null = null
  for (const h of pieles) {
    const bajo = bajoLaHerida(h, punto, unidadesPorMm)
    if (bajo && (!mejor || bajo.deLadoMm < mejor.deLadoMm)) mejor = bajo
  }
  return mejor?.normal ?? null
}

/**
 * El borde de la piel cortada que queda encima de un labio hondo, del lado hacia el que ese labio se aparta (`hacia`), y
 * la normal de la piel ahí; `null` si no hay piel cortada encima (D-413). Es de donde cuelga la hoja de un separador de
 * la fascia o del músculo.
 *
 * Encima es lo de `posicionBajoLaHerida`, medido con el labio en reposo: el de ahora puede haberse apartado más que el
 * límite de colocar. De dos incisiones de la piel vale la que queda menos de lado y, de la piel y la fascia superficial
 * —que se cortan juntas con el mismo trazo—, la de fuera: es la que se ve, y en la que se apoya el mango.
 */
function bordeDeLaPielEncima(
  reposo: THREE.Vector3,
  hacia: THREE.Vector3,
  heridasPorCapa: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]> | undefined,
  unidadesPorMm: number,
): { borde: THREE.Vector3; enfrente: THREE.Vector3; normal: THREE.Vector3 } | null {
  let mejor: { borde: THREE.Vector3; enfrente: THREE.Vector3; normal: THREE.Vector3; deLadoMm: number; altura: number } | null = null
  for (const h of heridasPorCapa?.get('piel') ?? []) {
    const bajo = bajoLaHerida(h, reposo, unidadesPorMm)
    if (!bajo) continue
    const mas = labioEnLaPosicion(h, 1, bajo.t)
    const menos = labioEnLaPosicion(h, -1, bajo.t)
    if (!mas || !menos) continue
    // Los labios «más» y «menos» de la piel no tienen por qué ser los del plano hondo: cada plano se cortó con su trazo,
    // y pudo trazarse en el otro sentido. El suyo es el que queda hacia donde se aparta el labio hondo.
    const delLado = mas.ahora.clone().sub(menos.ahora).dot(hacia) >= 0
    // El borde que se ve, como el de la hoja de la piel (`bordeQueSeVe`): la hoja que baja a la fascia cuelga de él.
    const cadena = delLado ? mas.ahora : menos.ahora
    const borde = bordeQueSeVe(h, cadena, bajo.normal, hacia, unidadesPorMm) ?? cadena
    const enfrente = delLado ? menos.ahora : mas.ahora
    const altura = borde.dot(bajo.normal)
    const mejora = !mejor || bajo.deLadoMm < mejor.deLadoMm - 1 || (Math.abs(bajo.deLadoMm - mejor.deLadoMm) <= 1 && altura > mejor.altura)
    if (mejora) mejor = { borde, enfrente, normal: bajo.normal, deLadoMm: bajo.deLadoMm, altura }
  }
  return mejor && { borde: mejor.borde, enfrente: mejor.enfrente, normal: mejor.normal }
}

/**
 * El borde que sostiene un separador, en su sitio de la herida de su plano: el de su labio o, en un autoestático, el
 * medio de los dos. `null` sin herida debajo (lo puesto antes de cortar) y para el Hohmann en el hueso.
 *
 * Antes el separador se posaba donde **debería** estar el labio —el punto de apoyo más toda la apertura— y el labio
 * de verdad abría menos: la hoja quedaba en el aire (pedido del dueño, 2026-11-03: «que la herramienta se incruste en
 * las estructuras»). Después se agarró el vértice del labio más cercano, que podía estar a centímetros (O-081). Ahora
 * es el punto del borde en el sitio mismo de la hoja (`labioEnLaPosicion`), y la apertura de ese punto es la del panel.
 */
export function labioDelSeparador(
  s: Pick<SeparadorEnEscena, 'datos' | 'punto'>,
  heridasPorCapa: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]> | undefined,
): (PuntoDelLabio & { herida: HeridaEnCapa }) | null {
  if (s.datos.plano === 'hueso' || !heridasPorCapa) return null
  // Una incisión que cruza dos músculos deja una herida en cada uno: se sigue la que pasa junto a la hoja.
  let herida: HeridaEnCapa | null = null
  let cerca = Infinity
  for (const h of heridasPorCapa.get(s.datos.plano) ?? []) {
    if (s.datos.incision !== undefined && h.incision !== s.datos.incision) continue
    const d = cercaDeLaHerida(h, s.punto)?.distancia ?? Infinity
    if (d < cerca) {
      cerca = d
      herida = h
    }
  }
  if (!herida) return null
  const t = s.datos.posicion
  if (s.datos.plano === 'piel') herida = laDeFuera(herida, heridasPorCapa.get('piel') ?? [], s, t)
  if (s.datos.lado !== 0) {
    const labio = labioEnLaPosicion(herida, s.datos.lado, t)
    return labio && { ...labio, herida }
  }
  const mas = labioEnLaPosicion(herida, 1, t)
  const menos = labioEnLaPosicion(herida, -1, t)
  if (!mas || !menos) return null
  return { ahora: mas.ahora.lerp(menos.ahora, 0.5), reposo: mas.reposo.lerp(menos.reposo, 0.5), herida }
}

/**
 * Cuánto pueden separarse, en milímetros, el labio de la piel y el de la fascia superficial cortados con el mismo trazo
 * (`laDeFuera`): de lado, casi nada; de alto, el grosor de la piel con su holgura.
 */
const LABIOS_DEL_MISMO_TRAZO_MM = { deLado: 3, grosor: 10 }

/**
 * De las heridas de la piel que tienen un labio en el mismo sitio que el de `herida`, la de fuera (D-423).
 *
 * El caso corta la fascia superficial con el papel de «piel» y con el mismo trazo (`aspectoDe`): deja dos heridas, una
 * sobre otra, a cuatro milímetros y medio. La hoja se quedaba con la más cercana al clic, y en la L del caso 3 la del labio
 * de abajo era la de la fascia: con el codo bajo la piel que se veía —y más todavía bajo el bulto del trozo de tibia, que
 * sube la piel y no la fascia—, el mango salía por debajo de ella, y al levantarlo sobre esa piel (`mangoSobreLaPiel`)
 * quedaba de pie, a 70°. Lo mismo que para colgar una hoja honda (`bordeDeLaPielEncima`): la de fuera es la que se ve, y
 * la que la hoja sostiene.
 *
 * El mismo sitio es el labio del mismo lado en la misma posición, apilado: a menos de `LABIOS_DEL_MISMO_TRAZO_MM` de lado y
 * encima. La otra rama de una L, en la misma malla, cae lejos de lado en esa posición y no cuenta.
 */
function laDeFuera(
  herida: HeridaEnCapa,
  heridas: readonly HeridaEnCapa[],
  s: Pick<SeparadorEnEscena, 'datos' | 'punto'>,
  t: number,
): HeridaEnCapa {
  const lado = s.datos.lado < 0 ? -1 : 1
  const propio = labioEnLaPosicion(herida, lado, t)
  const normal = propio && bajoLaHerida(herida, propio.reposo, herida.unidadesPorMm)?.normal
  if (!propio || !normal) return herida
  const mm = herida.unidadesPorMm
  let mejor = herida
  let alto = 0
  for (const h of heridas) {
    if (h === herida || h.hondo || (s.datos.incision !== undefined && h.incision !== s.datos.incision)) continue
    const otro = labioEnLaPosicion(h, lado, t)
    if (!otro) continue
    const r = otro.reposo.clone().sub(propio.reposo)
    const arriba = r.dot(normal)
    if (!(arriba > alto) || arriba > LABIOS_DEL_MISMO_TRAZO_MM.grosor * mm) continue
    if (r.addScaledVector(normal, -arriba).length() > LABIOS_DEL_MISMO_TRAZO_MM.deLado * mm) continue
    alto = arriba
    mejor = h
  }
  return mejor
}

/**
 * La mitad de lo que separa a los dos labios en reposo en el sitio de un autoestático, en unidades del mundo: lo que
 * la herida de su plano se abre sola por cada lado. Cero sin herida debajo.
 */
function mitadDeLoQueDescansaAbierta(
  s: Pick<SeparadorEnEscena, 'datos' | 'punto'>,
  heridasPorCapa: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]> | undefined,
): number {
  const labio = labioDelSeparador(s, heridasPorCapa)
  if (!labio) return 0
  const mas = labioEnLaPosicion(labio.herida, 1, s.datos.posicion)
  const menos = labioEnLaPosicion(labio.herida, -1, s.datos.posicion)
  return mas && menos ? mas.reposo.distanceTo(menos.reposo) / 2 : 0
}

/** Lleva el separador a un sitio ya calculado de otro plano. */
export function apoyarSeparadorEn(s: SeparadorEnEscena, sitio: SitioDeSeparador, lado: 1 | -1 | 0) {
  s.punto = sitio.punto.clone()
  s.normal = sitio.normal.clone()
  s.direccion = sitio.direccion.clone().multiplyScalar(lado === 0 ? 1 : lado)
  s.datos.posicion = sitio.posicion
}

/**
 * Lo que cada articulación del instrumento vale con una apertura dada: la
 * primera del archivo recorre su rango a medida que el separador abre hasta su
 * tope. Un separador sin articulación (el Hohmann, una sola pieza) no la tiene
 * y se limita a desplazarse con el labio.
 */
export function articulacionesParaLaApertura(
  h: HerramientaCargada | null,
  ajustes: AjustesDeInstrumento | null,
  aperturaMm: number,
  maximoMm: number,
  /**
   * En un autoestático, del eje de las ramas al rastrillo, en mm (P-008 E2). Cada rama gira la mitad del ángulo, y el
   * rastrillo se aparta de la línea media `brazo · sen(α/2)`: con él, el ángulo sale de lo que se aparta cada labio y
   * el rastrillo queda en el borde. Sin él, el reparto lineal de antes, que no sabía de milímetros.
   */
  brazoMm?: number,
): Record<string, number> {
  const valores: Record<string, number> = {}
  for (const a of h?.meta?.articulaciones ?? []) valores[a.nombre] = ajustes?.articulaciones?.[a.nombre] ?? a.inicial
  const primera = h?.meta?.articulaciones?.[0]
  if (primera && brazoMm && brazoMm > 0) {
    const grados = (2 * Math.asin(Math.min(1, Math.max(0, aperturaMm) / brazoMm)) * 180) / Math.PI
    // Pasado el rango que declara el modelo, las ramas siguen abriéndose: el rastrillo tiene que llegar al borde.
    valores[primera.nombre] = primera.min + Math.min(grados, MAXIMO_DE_LAS_RAMAS_GRADOS)
  } else if (primera && maximoMm > 0) {
    valores[primera.nombre] = primera.min + ((primera.max - primera.min) * Math.min(1, aperturaMm / maximoMm))
  }
  return valores
}

/** Hasta dónde se dejan abrir las ramas de un autoestático, en grados: más allá se cruzarían con la cremallera. */
const MAXIMO_DE_LAS_RAMAS_GRADOS = 90

/** Lo que el codo de una hoja de mano queda por encima del borde, en milímetros: el mango no se hunde en la piel. */
const CODO_SOBRE_EL_BORDE_MM = 1

/**
 * Lo que el codo de una hoja de mano entra en la herida desde su labio, en milímetros (P-009). Con el codo sobre el
 * borde, la pala —que baja 15° hacia fuera— entraba entera en el tejido del labio: se veía el mango tendido sobre la
 * piel y nada más, y el dueño pidió verlas «por dentro, como si de verdad estuvieran traccionando». Cuatro milímetros
 * dentro, la pala baja por la pared de la herida a la vista y se mete bajo el labio a partir de unos quince de hondo,
 * que es el enganche; el mango sale por encima del borde, a dos milímetros de él.
 *
 * Con la herida poco abierta no entra tanto: como mucho, `PARTE_DE_LA_HERIDA_PARA_EL_CODO` de lo que hay de un labio
 * al otro. Si no, recién puesta y sin abrir, la hoja cruzaba la línea del corte y se metía en el labio de enfrente.
 */
const CODO_DENTRO_DE_LA_HERIDA_MM = 4
const PARTE_DE_LA_HERIDA_PARA_EL_CODO = 0.4
/** Lo que se hunde el centro de un autoestático bajo los bordes: los rastrillos quedan dentro de la herida. */
const AUTOESTATICO_BAJO_LOS_BORDES_MM = 3
/** Cuánto se acuesta un autoestático hacia la punta más cercana de la herida: las argollas no tapan el campo. */
const INCLINACION_DEL_AUTOESTATICO_GRADOS = 45

/** Cuánto bascula el mango de una palanca apoyada en el hueso con toda su apertura: unos 35°. */
const BASCULA_DE_LA_PALANCA_GRADOS = 35

/**
 * Lo que el mango de una hoja de mano queda, como poco, por encima de la piel que tiene debajo, en milímetros (D-423).
 * Lo mismo que el codo sobre el borde (`CODO_SOBRE_EL_BORDE_MM`): el mango se apoya, no flota ni se hunde.
 */
const MANGO_SOBRE_LA_PIEL_MM = 1

/**
 * Hasta dónde se deja levantar el mango sobre su inclinación de siempre, en grados (D-423). Más ya no es una hoja
 * tendida que tracciona hacia fuera sino un gancho de pie, y la pala saldría de la herida: lo que pase de aquí, sobre un
 * bulto muy alto, se queda tapado.
 */
const LEVANTE_MAXIMO_DEL_MANGO_GRADOS = 55

/**
 * Desde dónde mira el mango la piel que tiene debajo, en milímetros desde el codo (D-423): lo de antes es el labio que la
 * hoja sostiene, con su pared y su borde, y no se aparta girando. Mirado, un vértice a poco más de la holgura del codo
 * pedía casi 90° (el arcoseno de la holgura entre la distancia), y la hoja recién puesta, con la herida todavía sin abrir,
 * salía de pie un cuadro antes de abrirla. Es el doble de lo que el codo entra en la herida.
 */
const MANGO_MIRA_DESDE_MM = 2 * CODO_DENTRO_DE_LA_HERIDA_MM

/** Lo que mide cada instrumento en su propio marco: el medio ancho (X) y el largo del mango (+Y), en el mundo. */
const medidasDelInstrumento = new WeakMap<THREE.Object3D, { medioAncho: number; largo: number }>()

function medidasDelMango(c: InstrumentoColocado): { medioAncho: number; largo: number } | null {
  if (!c.herramienta) return null
  const ya = medidasDelInstrumento.get(c.herramienta.raiz)
  if (ya) return ya
  c.grupo.updateMatrixWorld(true)
  const aLoSuyo = c.grupo.matrixWorld.clone().invert()
  const caja = new THREE.Box3()
  const p = new THREE.Vector3()
  c.grupo.traverse((o) => {
    const m = o as THREE.Mesh
    const pos = m.isMesh ? (m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined) : undefined
    if (!pos) return
    const matriz = aLoSuyo.clone().multiply(m.matrixWorld)
    const paso = Math.max(1, Math.floor(pos.count / 4000))
    for (let i = 0; i < pos.count; i += paso) caja.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(matriz))
  })
  if (caja.isEmpty()) return null
  const medidas = { medioAncho: Math.max(-caja.min.x, caja.max.x), largo: caja.max.y }
  medidasDelInstrumento.set(c.herramienta.raiz, medidas)
  return medidas
}

/**
 * El mango y la pala de una hoja de mano, levantados alrededor del codo lo justo para que el mango no se meta en la piel
 * que tiene debajo (D-423).
 *
 * El mango va tendido a 15° del plano de la piel **en el labio** (`direccionDelMango`), y eso basta mientras la piel de
 * fuera sea plana o baje. Sobre un trozo de hueso que la levanta, sube hacia fuera más que el mango, y su punta quedaba
 * debajo: en la L de la pierna del taller, el Farabeuf del colgajo enseñaba el mango cortado por el borde de la piel. En
 * la mano pasa lo contrario: la piel empuja el mango, y la hoja bascula sobre el labio que engancha. Eso se hace aquí: se
 * mira cada vértice de la piel que cae bajo el mango —a lo largo de él y dentro de su ancho— y se gira lo que pida el
 * que más sube, con su holgura. La pala gira con él: es una sola pieza, y se mete un poco más bajo el labio.
 *
 * Se mira la piel tal como está, con el bulto (`abultamiento.alDia`, que vuelve a posar los separadores cuando cambia).
 */
function mangoSobreLaPiel(
  instrumento: InstrumentoColocado,
  codo: THREE.Vector3,
  mango: THREE.Vector3,
  pala: THREE.Vector3,
  pieles: readonly THREE.Mesh[],
  unidadesPorMm: number,
): { mango: THREE.Vector3; pala: THREE.Vector3 } {
  const medidas = medidasDelMango(instrumento)
  if (!medidas || pieles.length === 0) return { mango, pala }
  const m = mango.clone().normalize()
  // Hacia arriba del mango, en el plano que forma con la pala: hacia ahí lo lleva el giro.
  const u = pala.clone().negate()
  u.addScaledVector(m, -u.dot(m))
  if (u.lengthSq() < 1e-12) return { mango, pala }
  u.normalize()
  const l = new THREE.Vector3().crossVectors(m, u)
  const holgura = MANGO_SOBRE_LA_PIEL_MM * unidadesPorMm
  const desde = MANGO_MIRA_DESDE_MM * unidadesPorMm
  let angulo = 0
  for (const piel of pieles) {
    const pos = piel.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) continue
    piel.updateWorldMatrix(true, false)
    const e = piel.matrixWorld.elements
    const q = pos.array as ArrayLike<number>
    const paso = pos.itemSize
    for (let i = 0; i < pos.count; i++) {
      const x = q[i * paso]
      const y = q[i * paso + 1]
      const z = q[i * paso + 2]
      const rx = e[0] * x + e[4] * y + e[8] * z + e[12] - codo.x
      const ry = e[1] * x + e[5] * y + e[9] * z + e[13] - codo.y
      const rz = e[2] * x + e[6] * y + e[10] * z + e[14] - codo.z
      const a = rx * m.x + ry * m.y + rz * m.z
      if (!(a > desde) || a > medidas.largo) continue
      if (Math.abs(rx * l.x + ry * l.y + rz * l.z) > medidas.medioAncho) continue
      const b = rx * u.x + ry * u.y + rz * u.z
      const r = Math.hypot(a, b)
      if (!(r > holgura)) continue
      // Girado `θ`, el punto queda a `r · sen(φ − θ)` del mango, con φ su ángulo sobre él: por debajo de la holgura pide θ.
      const pide = Math.atan2(b, a) + Math.asin(holgura / r)
      if (pide > angulo) angulo = pide
    }
  }
  if (!(angulo > 0)) return { mango, pala }
  const giro = new THREE.Quaternion().setFromAxisAngle(l, Math.min(angulo, (LEVANTE_MAXIMO_DEL_MANGO_GRADOS * Math.PI) / 180))
  return { mango: m.applyQuaternion(giro), pala: pala.clone().applyQuaternion(giro) }
}

/** Las mallas de la piel que tienen herida: las que pisa el mango de una hoja de mano. */
function pielesConHerida(heridasPorCapa: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]> | undefined): THREE.Mesh[] {
  return [...new Set((heridasPorCapa?.get('piel') ?? []).map((h) => h.malla))]
}

/**
 * Deja el separador en su sitio y con la apertura que tiene, como se usa en pabellón.
 *
 * - **Una hoja de mano** (Farabeuf, Senn-Miller) tiene el codo en el borde que sostiene, en su sitio exacto de la
 *   herida (`labioDelSeparador`); el mango sale tendido hacia fuera, sobre su labio, y la pala baja metida en la
 *   herida, enganchando el borde. Es el dibujo del dueño sobre una captura (P-008): «con la paleta hacia abajo y
 *   metida en el músculo, como si lo estuviera corriendo, siempre despejando el campo visual y traccionando desde el
 *   centro hacia afuera». Antes la pala quedaba acostada a lo largo de la herida y el mango, casi de pie.
 * - **Esa misma hoja en la fascia o en el músculo** (D-413) cuelga del borde de la piel de encima: el codo sobre él y
 *   la pala bajando por la herida hacia el labio hondo, hasta donde llega. Con el codo en el labio hondo, el mango
 *   quedaba bajo la piel.
 * - **Un autoestático** va en el centro, un poco hundido, con los rastrillos hacia los dos bordes y las argollas
 *   acostadas hacia la punta más cercana de la herida, fuera del campo. Sus ramas se abren lo justo para que cada
 *   rastrillo esté donde está su borde (`articulacionesParaLaApertura` con `brazoMm`).
 * - **Una palanca en el hueso** (el Hohmann) no se traslada: la punta se queda clavada al otro lado del hueso, y
 *   lo que abre es el mango, que bascula hacia el lado que aparta. Antes se trasladaba entero con la apertura y la
 *   punta dejaba el hueso, flotando a un centímetro de la cortical.
 * - Sin herida que seguir (lo puesto antes de cortar), como antes: el punto de apoyo más la apertura.
 */
export function posarSeparador(
  s: SeparadorEnEscena,
  unidadesPorMm: number,
  heridasPorCapa?: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]>,
) {
  const h = s.instrumento.herramienta
  // Las ramas de un autoestático se abren hasta donde están los labios, y los labios descansan ya apartados lo que la
  // herida se retrae sola (P-015): con lo del panel a secas, cada rastrillo quedaba ese poco corto, en el aire.
  const descanso = s.datos.lado === 0 ? mitadDeLoQueDescansaAbierta(s, heridasPorCapa) / unidadesPorMm : 0
  if (h) aplicarPose(h, s.ajustes, articulacionesParaLaApertura(h, s.ajustes, s.datos.aperturaMm + descanso, s.datos.maximoMm, s.datos.brazoMm))
  const encima = s.punto.clone().addScaledVector(s.normal, 0.4 * unidadesPorMm)
  const n = s.normal.clone().normalize()
  // Hacia dónde se aparta el labio, sobre el plano de la piel (P-009). La dirección sale de cómo se mueve el labio en su
  // capa, y la normal, de dónde se hizo el clic: en el borde de un músculo las dos pueden cruzarse, y con la dirección
  // casi a lo largo de la normal el mango salía a 63° de la piel y la pala de lado, en vez de a 15° y hacia abajo.
  const d = s.direccion.clone().addScaledVector(n, -s.direccion.dot(n))
  if (d.lengthSq() > 1e-12) d.normalize()
  else d.copy(s.direccion).normalize()
  const vector = (v: readonly number[]) => new THREE.Vector3(v[0], v[1], v[2])

  if (s.datos.tipo === 'palanca' && s.datos.plano === 'hueso') {
    // La palanca conserva su mango de 40°: tendido como el de una hoja de mano, la báscula lo metería en la piel.
    const base = vector(direccionDelMango([n.x, n.y, n.z], [d.x, d.y, d.z], 1, ANGULO_DEL_MANGO_DE_LA_PALANCA_GRADOS))
    const giro = s.datos.maximoMm > 0 ? Math.min(1, Math.max(0, s.datos.aperturaMm) / s.datos.maximoMm) : 0
    // Gira en el plano de la normal y del lado que aparta: alrededor de n × d, la normal va hacia d.
    const eje = new THREE.Vector3().crossVectors(n, d)
    const mango = eje.lengthSq() > 1e-12 ? base.applyAxisAngle(eje.normalize(), (BASCULA_DE_LA_PALANCA_GRADOS * giro * Math.PI) / 180) : base
    posarEn(s.instrumento.grupo, encima, mango)
    return
  }

  const labio = labioDelSeparador(s, heridasPorCapa)
  if (!labio) {
    const desplazamiento = s.direccion.clone().multiplyScalar(s.datos.lado === 0 ? 0 : s.datos.aperturaMm * unidadesPorMm)
    posarEn(s.instrumento.grupo, encima.add(desplazamiento), s.mango)
    return
  }

  if (s.datos.lado === 0) {
    // Hacia dónde crece la herida en este punto, para acostar las argollas hacia la punta más cercana.
    const t = s.datos.posicion
    const antes = labioEnLaPosicion(labio.herida, 1, Math.max(0, t - 0.05))
    const despues = labioEnLaPosicion(labio.herida, 1, Math.min(1, t + 0.05))
    const aLoLargo = antes && despues ? despues.reposo.clone().sub(antes.reposo) : new THREE.Vector3()
    aLoLargo.addScaledVector(n, -aLoLargo.dot(n)).addScaledVector(d, -aLoLargo.dot(d))
    if (aLoLargo.lengthSq() > 1e-12) aLoLargo.normalize().multiplyScalar(t < 0.5 ? -1 : 1)
    const radianes = (INCLINACION_DEL_AUTOESTATICO_GRADOS * Math.PI) / 180
    const mango = n.clone().multiplyScalar(Math.cos(radianes)).addScaledVector(aLoLargo, Math.sin(radianes)).normalize()
    // Las ramas se abren a lo largo de X del modelo: X va hacia los bordes, y −Z queda de lado, a lo largo de la herida.
    const z = new THREE.Vector3().crossVectors(d, mango).normalize()
    const punto = labio.ahora.clone().addScaledVector(n, -AUTOESTATICO_BAJO_LOS_BORDES_MM * unidadesPorMm)
    posarConLosDosEjes(s.instrumento.grupo, punto, mango, z.negate())
    return
  }

  // En la fascia o en el músculo la hoja se sostiene desde la piel (D-413): el codo sobre el borde de la piel de encima
  // y la pala bajando por la herida hasta el labio hondo. Antes el codo iba al labio hondo y el mango, tendido sobre la
  // fascia o el músculo, quedaba debajo de la piel: el Farabeuf bajado «Al músculo» desaparecía y la herida seguía
  // abierta sin nada a la vista que la sostuviera (Cristóbal, 2026-11-17: «desaparecen los farabeuf»).
  const piel = s.datos.plano === 'piel' ? null : bordeDeLaPielEncima(labio.reposo, d, heridasPorCapa, unidadesPorMm)
  if (piel) {
    const nPiel = piel.normal
    const dPiel = d.clone().addScaledVector(nPiel, -d.dot(nPiel))
    if (dPiel.lengthSq() > 1e-12) dPiel.normalize()
    else dPiel.copy(d)
    // La misma hoja que en la piel —el mango a 15° de ella, la pala a 15° de la vertical—, medida con la piel de encima.
    const mango = vector(direccionDelMango([nPiel.x, nPiel.y, nPiel.z], [dPiel.x, dPiel.y, dPiel.z], 1))
    const pala = nPiel.clone().negate().addScaledVector(mango, nPiel.dot(mango)).normalize()
    // El codo, a la altura del borde de la piel y con la pala pasando por el labio hondo.
    const alturaDelCodo = piel.borde.dot(nPiel) + CODO_SOBRE_EL_BORDE_MM * unidadesPorMm
    const baja = -pala.dot(nPiel)
    const largo = baja > 1e-6 ? Math.max(0, (alturaDelCodo - labio.ahora.dot(nPiel)) / baja) : 0
    const codo = labio.ahora.clone().addScaledVector(pala, -largo)
    // Y siempre junto al borde de la piel, entre un milímetro y lo que entra el de una hoja de la piel. Con el labio
    // hondo más abierto que el de la piel, el codo caería sobre la piel sana y la pala la atravesaría. Con un labio
    // hondo de verdad —el músculo del caso 3, a 38 mm bajo la piel—, la recta de la pala a 15° ponía el codo en medio de
    // la herida, flotando, con la hoja de 25 mm sin llegar a nada: un instrumento corto se ve corto, colgado del borde
    // como los de la piel y con la pala por la pared de la herida.
    const enfrente = Math.max(0, piel.enfrente.clone().sub(piel.borde).dot(dPiel.clone().negate()))
    const maximo = Math.min(CODO_DENTRO_DE_LA_HERIDA_MM * unidadesPorMm, PARTE_DE_LA_HERIDA_PARA_EL_CODO * enfrente)
    const minimo = Math.min(CODO_SOBRE_EL_BORDE_MM * unidadesPorMm, maximo)
    const adentro = piel.borde.clone().sub(codo).dot(dPiel)
    const corrido = Math.min(maximo, Math.max(minimo, adentro))
    codo.addScaledVector(dPiel, adentro - corrido)
    const levantado = mangoSobreLaPiel(s.instrumento, codo, mango, pala, pielesConHerida(heridasPorCapa), unidadesPorMm)
    posarConLosDosEjes(s.instrumento.grupo, codo, levantado.mango, levantado.pala)
    return
  }

  // La pala sale del codo en ángulo recto con el mango, hacia abajo: lo que queda de la −normal quitándole lo que va
  // a lo largo del mango. Con el mango a 75° de la normal, baja a 15° de la vertical, un poco por debajo del borde.
  const mango = vector(direccionDelMango([n.x, n.y, n.z], [d.x, d.y, d.z], 1))
  const pala = n.clone().negate().addScaledVector(mango, n.dot(mango))
  // El codo, dentro de la herida: hacia el centro, contra la dirección en que se aparta el labio, y sin pasar de la parte
  // que le toca de lo que hay hasta el labio de enfrente.
  const haciaDentro = d.clone().negate()
  const enfrente = labioEnLaPosicion(labio.herida, s.datos.lado > 0 ? -1 : 1, s.datos.posicion)
  const hastaEnfrente = enfrente ? Math.max(0, enfrente.ahora.clone().sub(labio.ahora).dot(haciaDentro)) : Infinity
  const adentro = Math.min(CODO_DENTRO_DE_LA_HERIDA_MM * unidadesPorMm, PARTE_DE_LA_HERIDA_PARA_EL_CODO * hastaEnfrente)
  const borde = bordeQueSeVe(labio.herida, labio.ahora, n, d, unidadesPorMm) ?? labio.ahora
  const codo = borde.clone().addScaledVector(n, CODO_SOBRE_EL_BORDE_MM * unidadesPorMm).addScaledVector(haciaDentro, adentro)
  const levantado = mangoSobreLaPiel(s.instrumento, codo, mango, pala, pielesConHerida(heridasPorCapa), unidadesPorMm)
  posarConLosDosEjes(s.instrumento.grupo, codo, levantado.mango, levantado.pala)
}

/**
 * Abre las heridas como mandan los separadores, las pinzas y la disección roma: más donde está cada uno y menos
 * hacia los extremos, **capa por capa** —cada herida se abre con lo que le llega, `aperturaDeLaCapa`—. Sin nada
 * que las abra, las cierra.
 */
export function aplicarSeparadoresALasHeridas(
  heridasPorCapa: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]>,
  lista: readonly SeparadorColocado[],
  pellizcos: readonly Pellizco[],
  unidadesPorMm: number,
  /**
   * Dónde cae un separador de otra incisión a lo largo de esta herida, o `null` si no está sobre ella ni debajo.
   * Sin esta función, cada herida se abre solo con lo suyo, como antes.
   */
  posicionEn?: (s: SeparadorColocado, h: HeridaEnCapa) => number | null,
) {
  for (const [capa, heridas] of heridasPorCapa) {
    if (heridas.length === 0) continue
    // Cada incisión se abre con lo que es suyo (P-003 E4): dos incisiones de la misma capa no se abren la una a la
    // otra aunque el separador de una caiga en un punto que la otra también tiene.
    const porIncision = new Map<number, HeridaEnCapa[]>()
    for (const h of heridas) porIncision.set(h.incision, [...(porIncision.get(h.incision) ?? []), h])
    for (const [incision, deEsta] of porIncision) {
      const suyos = [...deLaIncision(lista, incision), ...prestados(capa, incision, deEsta, lista, posicionEn)]
      const suyas = deLaIncision(pellizcos, incision)
      // Con algo apoyado en la herida —un separador que abre esta capa o una pinza— la cinta se aparta aunque todavía no
      // abra (P-008 E1). Se marca antes de abrir: `abrirCapa` vuelve a tender la cinta y la mira.
      const sostenida = suyos.some((s) => abreLaCapa(s, capa)) || suyas.length > 0
      for (const h of deEsta) h.sostenida = sostenida
      // Lo que abre cada hoja se reparte con el largo de la herida en milímetros: la hoja mide lo mismo en una
      // incisión corta que en una larga (P-008 E2). Las heridas de una misma incisión comparten trazo y largo.
      // Pero no puntas: el labio de cada malla se cierra donde se cierra su grieta (`puntasDeLaGrieta`, P-015), y el que
      // es la punta de un colgajo, en el cruce con otra, no se cierra (`puntasDeLosLabios`, D-420).
      for (const h of deEsta) {
        const puntas = puntasDeLosLabios(h.corte.grieta, h.cruces, FUNDIDO_JUNTO_A_LA_PUNTA_MM, largoEnMm(h))
        const enMm = perfilDeLaCapa(capa, suyos, suyas, largoEnMm(h), puntas)
        let mas = 0
        let menos = 0
        for (let i = 0; i <= 80; i++) {
          const a = enMm(i / 80)
          mas = Math.max(mas, a.mas)
          menos = Math.max(menos, a.menos)
        }
        if (mas === 0 && menos === 0) {
          abrirCapa(h, 0, 0)
          continue
        }
        const perfil = (t: number) => {
          const a = enMm(t)
          return { mas: a.mas * unidadesPorMm, menos: a.menos * unidadesPorMm }
        }
        abrirCapa(h, mas * unidadesPorMm, menos * unidadesPorMm, perfil)
      }
    }
  }
}

/**
 * Los separadores de un plano más profundo que abren también esta herida, con su sitio medido en ella.
 *
 * Cada capa se corta con su propio trazo y cada trazo es una incisión aparte, con su número: la piel la 1, la
 * fascia de debajo la 2. Un separador apoyado en la fascia es de la 2, y el filtro por incisión de P-003 E4 lo
 * dejaba fuera de la piel, aunque `CAPAS_QUE_ABRE` dijera que un separador en la fascia abre la piel. La fascia
 * se abría y la piel de encima seguía cerrada, con la hoja metida debajo (D-222 lo anotó como pendiente). Ahora
 * entra si está sobre esta herida o debajo de ella —`posicionEn` lo mide con los labios en reposo—, y abre en su
 * sitio de esta herida, no en el de la suya: las dos incisiones no miden lo mismo.
 *
 * Un separador de la **misma** capa y otra incisión sigue sin entrar: eso es lo que P-003 E4 quería evitar.
 */
function prestados(
  capa: CapaDeLaHerida,
  incision: number,
  heridas: readonly HeridaEnCapa[],
  lista: readonly SeparadorColocado[],
  posicionEn: ((s: SeparadorColocado, h: HeridaEnCapa) => number | null) | undefined,
): SeparadorColocado[] {
  if (!posicionEn) return []
  const salida: SeparadorColocado[] = []
  for (const s of lista) {
    if (s.incision === undefined || s.incision === incision || s.plano === capa || !abreLaCapa(s, capa)) continue
    for (const h of heridas) {
      const posicion = posicionEn(s, h)
      if (posicion === null) continue
      salida.push({ ...s, posicion })
      break
    }
  }
  return salida
}

// ------------------------------------------------------------------ pellizcos

export interface PellizcoEnEscena {
  datos: Pellizco
  instrumento: InstrumentoColocado
  url: string
  ajustes: AjustesDeInstrumento | null
  pliegue: THREE.Mesh
  punto: THREE.Vector3
  normal: THREE.Vector3
  mango: THREE.Vector3
  /** Hacia dónde se aleja de la herida, unitaria y ya con el signo de su lado: por donde tira al separarse. */
  direccion: THREE.Vector3
}

/** El radio de la base del pliegue de piel, en milímetros: lo que cabe entre los dientes de la pinza y se levanta con ella. */
export const RADIO_DEL_PLIEGUE_MM = 7

/**
 * Un montículo suave con el color de la piel, para el pellizco.
 *
 * Es una superficie de revolución con perfil de campana de altura 1 y radio 1:
 * se escala a la altura y al radio que toque, sin rehacer la geometría cada vez
 * que la rueda sube o baja la pinza. No deforma la malla del modelo (que puede
 * estar cortada, abierta y cosida a la vez): se apoya encima, y como su base se
 * mete en la piel, desde cualquier ángulo se lee como un pliegue levantado.
 */
export function crearPliegue(color: THREE.ColorRepresentation): THREE.Mesh {
  const perfil: THREE.Vector2[] = []
  const pasos = 14
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos
    // De la base (t = 0, radio 1, a ras) a la cima (t = 1, radio 0, altura 1) con una S suave.
    const suave = t * t * (3 - 2 * t)
    perfil.push(new THREE.Vector2(Math.pow(1 - t, 1.25), suave - 0.06))
  }
  const geometria = new THREE.LatheGeometry(perfil, 28)
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, side: THREE.DoubleSide })
  const malla = new THREE.Mesh(geometria, material)
  malla.name = 'pliegue-de-piel'
  malla.castShadow = false
  return malla
}

/**
 * Escala el pliegue a su altura y deja la cima donde va la punta de la pinza.
 *
 * Con las mandíbulas abiertas la pinza no sostiene nada: el pliegue desaparece y la pinza queda apoyada en la piel
 * con sus ramas abiertas. Al separarse de su pareja, la pinza se lleva el pliegue consigo (tira de la piel).
 */
export function posarPliegue(p: PellizcoEnEscena, unidadesPorMm: number) {
  const efectiva = alturaEfectivaDelPellizco(p.datos)
  const altura = Math.max(0.5, efectiva) * unidadesPorMm
  const radio = RADIO_DEL_PLIEGUE_MM * unidadesPorMm
  const base = p.punto.clone().addScaledVector(p.direccion, Math.max(0, p.datos.separacionMm) * unidadesPorMm)
  p.pliegue.visible = efectiva > 0.3
  p.pliegue.scale.set(radio, altura, radio)
  p.pliegue.position.copy(base)
  p.pliegue.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.normal)
  // La punta de los dientes agarra la cima del pliegue; sin pliegue, toca la piel.
  const cima = base.clone().addScaledVector(p.normal, efectiva > 0.3 ? altura : 0.3 * unidadesPorMm)
  posarEn(p.instrumento.grupo, cima, p.mango)
  // Las mandíbulas: cerradas sobre el pliegue (agarre 1) o abiertas (agarre 0), con la primera articulación del archivo.
  const h = p.instrumento.herramienta
  if (h) aplicarPose(h, p.ajustes, articulacionesParaLaApertura(h, p.ajustes, (1 - p.datos.agarre) * 100, 100))
}

export function soltarPellizco(p: PellizcoEnEscena) {
  soltarInstrumento(p.instrumento)
  p.pliegue.removeFromParent()
  p.pliegue.geometry.dispose()
  ;(p.pliegue.material as THREE.Material).dispose()
}

export function soltarSeparador(s: SeparadorEnEscena) {
  soltarInstrumento(s.instrumento)
}
