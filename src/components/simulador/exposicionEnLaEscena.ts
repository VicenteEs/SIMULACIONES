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
  type CapaDeLaHerida,
  type Pellizco,
  type SeparadorColocado,
} from '@/lib/exposicion'
import { abrirCapa, largoEnMm, type HeridaEnCapa } from './heridas'

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
  const antes = (v: number) => new THREE.Vector3(reposo[3 * v], reposo[3 * v + 1], reposo[3 * v + 2])
  return { ahora: ahora(a).lerp(ahora(b), f).applyMatrix4(m), reposo: antes(a).lerp(antes(b), f).applyMatrix4(m) }
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
  if (s.datos.lado !== 0) {
    const labio = labioEnLaPosicion(herida, s.datos.lado, t)
    return labio && { ...labio, herida }
  }
  const mas = labioEnLaPosicion(herida, 1, t)
  const menos = labioEnLaPosicion(herida, -1, t)
  if (!mas || !menos) return null
  return { ahora: mas.ahora.lerp(menos.ahora, 0.5), reposo: mas.reposo.lerp(menos.reposo, 0.5), herida }
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
 * Deja el separador en su sitio y con la apertura que tiene, como se usa en pabellón.
 *
 * - **Una hoja de mano** (Farabeuf, Senn-Miller) tiene el codo en el borde que sostiene, en su sitio exacto de la
 *   herida (`labioDelSeparador`); el mango sale tendido hacia fuera, sobre su labio, y la pala baja metida en la
 *   herida, enganchando el borde. Es el dibujo del dueño sobre una captura (P-008): «con la paleta hacia abajo y
 *   metida en el músculo, como si lo estuviera corriendo, siempre despejando el campo visual y traccionando desde el
 *   centro hacia afuera». Antes la pala quedaba acostada a lo largo de la herida y el mango, casi de pie.
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
  if (h) aplicarPose(h, s.ajustes, articulacionesParaLaApertura(h, s.ajustes, s.datos.aperturaMm, s.datos.maximoMm, s.datos.brazoMm))
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
  const codo = labio.ahora.clone().addScaledVector(n, CODO_SOBRE_EL_BORDE_MM * unidadesPorMm).addScaledVector(haciaDentro, adentro)
  posarConLosDosEjes(s.instrumento.grupo, codo, mango, pala)
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
      const enMm = perfilDeLaCapa(capa, suyos, suyas, largoEnMm(deEsta[0]))
      let mas = 0
      let menos = 0
      for (let i = 0; i <= 80; i++) {
        const a = enMm(i / 80)
        mas = Math.max(mas, a.mas)
        menos = Math.max(menos, a.menos)
      }
      if (mas === 0 && menos === 0) {
        for (const h of deEsta) abrirCapa(h, 0, 0)
        continue
      }
      const perfil = (t: number) => {
        const a = enMm(t)
        return { mas: a.mas * unidadesPorMm, menos: a.menos * unidadesPorMm }
      }
      for (const h of deEsta) abrirCapa(h, mas * unidadesPorMm, menos * unidadesPorMm, perfil)
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
