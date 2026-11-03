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
  aperturaDeLaCapa,
  deLaIncision,
  type CapaDeLaHerida,
  type Pellizco,
  type SeparadorColocado,
} from '@/lib/exposicion'
import { abrirCapa, type HeridaEnCapa } from './heridas'

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
  /** El vértice del labio que sostiene, ya buscado (`labioDelSeparador`); se vuelve a buscar si cambia el sitio. */
  agarre?: AgarreDelLabio | null
}

// ------------------------------------------------------------ el labio que se sostiene

/** Un vértice de labio de una herida: el que lleva consigo lo que está apoyado en él. */
export interface AgarreDelLabio {
  herida: HeridaEnCapa
  vertice: number
  /** El punto desde el que se buscó, para saber si sigue valiendo. */
  desde: THREE.Vector3
  plano: string
}

/**
 * El vértice del labio `lado` más cercano a un punto del mundo, **en reposo**: con la herida cerrada, como
 * estaba cuando se puso el instrumento. Se busca en las posiciones de antes de abrir (`corte.posiciones`) y no
 * en las de ahora: con la herida abierta, el vértice más cercano al punto de apoyo sería otro cada vez.
 */
export function agarrarElLabio(heridas: readonly HeridaEnCapa[], lado: 1 | -1, punto: THREE.Vector3): Omit<AgarreDelLabio, 'desde' | 'plano'> | null {
  let mejor: Omit<AgarreDelLabio, 'desde' | 'plano'> | null = null
  let cerca = Infinity
  for (const h of heridas) {
    const local = punto.clone().applyMatrix4(h.malla.matrixWorld.clone().invert())
    const reposo = h.corte.posiciones
    for (const v of lado > 0 ? h.corte.labios.mas : h.corte.labios.menos) {
      const d = Math.hypot(reposo[3 * v] - local.x, reposo[3 * v + 1] - local.y, reposo[3 * v + 2] - local.z)
      if (d < cerca) {
        cerca = d
        mejor = { herida: h, vertice: v }
      }
    }
  }
  return mejor
}

/** Cuánto se ha movido ese vértice desde el reposo, en el mundo: lo que abrió la herida y lo que tiró una retracción. */
export function desplazamientoDelLabio(a: Pick<AgarreDelLabio, 'herida' | 'vertice'>): THREE.Vector3 {
  const posiciones = a.herida.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  const reposo = a.herida.corte.posiciones
  // Otra incisión en la misma malla rehace su geometría: un índice que ya no está no se sigue.
  if (a.vertice >= posiciones.count || 3 * a.vertice + 2 >= reposo.length) return new THREE.Vector3()
  const m = a.herida.malla.matrixWorld
  const ahora = new THREE.Vector3(posiciones.getX(a.vertice), posiciones.getY(a.vertice), posiciones.getZ(a.vertice)).applyMatrix4(m)
  const antes = new THREE.Vector3(reposo[3 * a.vertice], reposo[3 * a.vertice + 1], reposo[3 * a.vertice + 2]).applyMatrix4(m)
  return ahora.sub(antes)
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
 * El labio que sostiene un separador, buscado una vez y guardado mientras siga valiendo.
 *
 * Antes el separador se posaba donde **debería** estar el labio —el punto de apoyo más toda la apertura—, y el
 * labio de verdad abre menos: lo que dice la campana del separador en su sitio, menos hacia los extremos de la
 * incisión y menos cuanto más lejos del borde se pinchó (`peso` en `corteDeMalla`). La hoja quedaba unos
 * milímetros por fuera de la piel, en el aire, y más cuanto más se abría (pedido del dueño, 2026-11-03: «que la
 * herramienta se incruste en las estructuras, no que se muevan y la herramienta se vea en el aire»). Ahora se
 * agarra el vértice del labio y se lleva con él, como la sutura (`seguirAlLabio`).
 */
export function labioDelSeparador(
  s: SeparadorEnEscena,
  heridasPorCapa: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]> | undefined,
): Pick<AgarreDelLabio, 'herida' | 'vertice'> | null {
  if (s.datos.lado === 0 || s.datos.plano === 'hueso' || !heridasPorCapa) return null
  const heridas = (heridasPorCapa.get(s.datos.plano) ?? []).filter(
    (h) => s.datos.incision === undefined || h.incision === s.datos.incision,
  )
  if (heridas.length === 0) return null
  const guardado = s.agarre
  if (guardado && guardado.plano === s.datos.plano && guardado.desde.equals(s.punto) && heridas.includes(guardado.herida)) {
    return guardado
  }
  const hallado = agarrarElLabio(heridas, s.datos.lado, s.punto)
  s.agarre = hallado ? { ...hallado, desde: s.punto.clone(), plano: s.datos.plano } : null
  return s.agarre
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
): Record<string, number> {
  const valores: Record<string, number> = {}
  for (const a of h?.meta?.articulaciones ?? []) valores[a.nombre] = ajustes?.articulaciones?.[a.nombre] ?? a.inicial
  const primera = h?.meta?.articulaciones?.[0]
  if (primera && maximoMm > 0) {
    valores[primera.nombre] = primera.min + ((primera.max - primera.min) * Math.min(1, aperturaMm / maximoMm))
  }
  return valores
}

/** Cuánto bascula el mango de una palanca apoyada en el hueso con toda su apertura: unos 35°. */
const BASCULA_DE_LA_PALANCA = Math.tan((35 * Math.PI) / 180)

/**
 * Deja el separador en su sitio y con la apertura que tiene: el labio que sostiene se lleva la hoja consigo.
 *
 * - **Con herida debajo**, la hoja va donde está el vértice del labio que agarró (`labioDelSeparador`), con el
 *   desfase que tenía al ponerla: se mueve exactamente lo que se movió el tejido.
 * - **Una palanca en el hueso** (el Hohmann) no se traslada: la punta se queda clavada al otro lado del hueso, y
 *   lo que abre es el mango, que bascula hacia el lado que aparta. Antes se trasladaba entero con la apertura y la
 *   punta dejaba el hueso, flotando a un centímetro de la cortical.
 * - Sin herida que seguir (lo puesto antes de cortar, un autoestático que abraza los dos labios), como antes: el
 *   punto de apoyo más la apertura.
 */
export function posarSeparador(
  s: SeparadorEnEscena,
  unidadesPorMm: number,
  heridasPorCapa?: ReadonlyMap<CapaDeLaHerida, HeridaEnCapa[]>,
) {
  const h = s.instrumento.herramienta
  if (h) aplicarPose(h, s.ajustes, articulacionesParaLaApertura(h, s.ajustes, s.datos.aperturaMm, s.datos.maximoMm))
  const encima = s.punto.clone().addScaledVector(s.normal, 0.4 * unidadesPorMm)

  if (s.datos.tipo === 'palanca' && s.datos.plano === 'hueso') {
    const giro = s.datos.maximoMm > 0 ? Math.min(1, Math.max(0, s.datos.aperturaMm) / s.datos.maximoMm) : 0
    const mango = s.mango.clone().addScaledVector(s.direccion, BASCULA_DE_LA_PALANCA * giro).normalize()
    posarEn(s.instrumento.grupo, encima, mango)
    return
  }

  const labio = labioDelSeparador(s, heridasPorCapa)
  const desplazamiento = labio
    ? desplazamientoDelLabio(labio)
    : s.direccion.clone().multiplyScalar(s.datos.lado === 0 ? 0 : s.datos.aperturaMm * unidadesPorMm)
  posarEn(s.instrumento.grupo, encima.add(desplazamiento), s.mango)
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
      let mas = 0
      let menos = 0
      for (let i = 0; i <= 40; i++) {
        const a = aperturaDeLaCapa(capa, i / 40, suyos, suyas)
        mas = Math.max(mas, a.mas)
        menos = Math.max(menos, a.menos)
      }
      if (mas === 0 && menos === 0) {
        for (const h of deEsta) abrirCapa(h, 0, 0)
        continue
      }
      const perfil = (t: number) => {
        const a = aperturaDeLaCapa(capa, t, suyos, suyas)
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
