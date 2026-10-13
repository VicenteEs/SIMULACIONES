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
import { aperturaEnLaPosicion, type Pellizco, type SeparadorColocado } from '@/lib/exposicion'
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

/** Deja el separador en su sitio y con la apertura que tiene: el labio que sostiene se lleva la hoja consigo. */
export function posarSeparador(s: SeparadorEnEscena, unidadesPorMm: number) {
  const desplazamiento = s.datos.lado === 0 ? 0 : s.datos.aperturaMm * unidadesPorMm
  const punto = s.punto
    .clone()
    .addScaledVector(s.direccion, desplazamiento)
    .addScaledVector(s.normal, 0.4 * unidadesPorMm)
  posarEn(s.instrumento.grupo, punto, s.mango)
  const h = s.instrumento.herramienta
  if (h) aplicarPose(h, s.ajustes, articulacionesParaLaApertura(h, s.ajustes, s.datos.aperturaMm, s.datos.maximoMm))
}

/**
 * Abre las heridas como mandan los separadores colocados: más donde está cada
 * uno y menos hacia los extremos. Sin ninguno, las cierra.
 */
export function aplicarSeparadoresALasHeridas(
  heridas: HeridaEnCapa[],
  lista: readonly SeparadorColocado[],
  unidadesPorMm: number,
) {
  if (lista.length === 0) {
    for (const h of heridas) abrirCapa(h, 0, 0)
    return
  }
  let mas = 0
  let menos = 0
  for (let i = 0; i <= 40; i++) {
    const a = aperturaEnLaPosicion(lista, i / 40)
    mas = Math.max(mas, a.mas)
    menos = Math.max(menos, a.menos)
  }
  const perfil = (t: number) => {
    const a = aperturaEnLaPosicion(lista, t)
    return { mas: a.mas * unidadesPorMm, menos: a.menos * unidadesPorMm }
  }
  for (const h of heridas) abrirCapa(h, mas * unidadesPorMm, menos * unidadesPorMm, perfil)
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

/** Escala el pliegue a su altura y deja la cima donde va la punta de la pinza. */
export function posarPliegue(p: PellizcoEnEscena, unidadesPorMm: number) {
  const altura = Math.max(0.5, p.datos.alturaMm) * unidadesPorMm
  const radio = RADIO_DEL_PLIEGUE_MM * unidadesPorMm
  p.pliegue.scale.set(radio, altura, radio)
  p.pliegue.position.copy(p.punto)
  p.pliegue.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.normal)
  // La punta de los dientes agarra la cima del pliegue.
  const cima = p.punto.clone().addScaledVector(p.normal, altura)
  posarEn(p.instrumento.grupo, cima, p.mango)
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
