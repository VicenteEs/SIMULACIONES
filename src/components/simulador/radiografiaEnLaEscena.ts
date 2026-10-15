import * as THREE from 'three'
import { crearMaterialDeRadiografia } from '@/atlas/materialDeRadiografia'
import {
  ANGULO_DE_LA_PROYECCION,
  DENSIDAD_DEL_METAL,
  SIN_DESPLAZAMIENTO,
  aFluoroscopia,
  centroDeLaImagen,
  densidadDelPapel,
  limitarDesplazamiento,
  type DesplazamientoDeLaImagen,
  type ProyeccionDeFluoroscopia,
} from '@/lib/radiografia'

/**
 * La imagen del arco en C, dentro de la escena del simulador.
 *
 * Se dibuja la **misma escena** desde una proyección fija (AP, lateral u oblicua) con un material de
 * radiografía —cada pieza suma luz según lo que absorbe—, se pasa al negativo y se recorta en un círculo
 * (`aFluoroscopia`). La imagen va en otro lienzo, al lado.
 *
 * Los materiales de la radiografía se ponen **solo mientras dura ese dibujo** y se devuelven antes de
 * volver. Antes la vista de rayos X convertía también el lienzo principal —lo dejaba en grises sobre negro y
 * movía la cámara a la proyección—, y quien miraba la fluoroscopia perdía la escena que estaba trabajando
 * (petición de Cristóbal: que se despliegue el cuadro del rayo pero que no se pierda el resto de la imagen).
 * Es seguro porque el dibujo es síncrono: entre poner y quitar no se pinta nada más.
 */

/** Lo que la imagen necesita saber de la escena: dónde está cada cosa y qué papel tiene. */
export interface EscenaParaRadiografia {
  escena: THREE.Scene
  raiz?: THREE.Object3D
  /** El papel de cada nodo declarado, por su nombre. */
  rolesAplicados: Map<string, string>
}

const esDeInterfaz = (o: THREE.Object3D): boolean =>
  o.name === 'cinta-de-la-herida' || o.name === 'borde-de-la-herida' || o.userData.deInterfaz === true

function esAyudaDeAprendizaje(objeto: THREE.Object3D): boolean {
  let actual: THREE.Object3D | null = objeto
  while (actual) {
    if (actual.userData.auxiliar === true) return true
    actual = actual.parent
  }
  return false
}

function bajo(objeto: THREE.Object3D, ancestro: THREE.Object3D | undefined): boolean {
  if (!ancestro) return false
  let actual: THREE.Object3D | null = objeto
  while (actual) {
    if (actual === ancestro) return true
    actual = actual.parent
  }
  return false
}

/**
 * Pone los materiales de la radiografía a lo que hay en la escena y devuelve la función que lo deja todo como
 * estaba: cada malla con su material, y lo que se escondió, otra vez a la vista.
 *
 * Los materiales de la radiografía son uno por densidad y viven en `f.materiales`: crear y soltar uno por malla
 * siete veces por segundo era trabajo de más para el mismo resultado.
 */
export function ponerRadiografiaTemporal(ctx: EscenaParaRadiografia, f: TallerDeFluoroscopia): () => void {
  const cambiadas = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  const escondidas: THREE.Object3D[] = []
  const materialPara = (densidad: number) => {
    let m = f.materiales.get(densidad)
    if (!m) {
      m = crearMaterialDeRadiografia(densidad)
      f.materiales.set(densidad, m)
    }
    return m
  }

  ctx.escena.traverse((objeto) => {
    // Lo que es interfaz —cintas, bordes, el trazo, los agujeros— no absorbe nada: se esconde.
    if (esDeInterfaz(objeto) || objeto.userData.agujero === true) {
      if (objeto.visible) {
        escondidas.push(objeto)
        objeto.visible = false
      }
      return
    }
    const malla = objeto as THREE.Mesh
    if (!malla.isMesh) return
    // Las ayudas de aprendizaje (la silueta verde del fragmento reducido, los ejes) ya traen su propio
    // material plano de color y se dejan como están: se dibujan por encima, y son lo que enseña a leer la imagen.
    if (esAyudaDeAprendizaje(malla)) return
    // Lo que es del modelo, por su papel; el pliegue de la piel pellizcada, como piel; y todo lo demás que
    // hay en la escena —el instrumento en la mano, la placa, los tornillos, los separadores— es metal.
    let densidad: number
    if (bajo(malla, ctx.raiz)) densidad = densidadDelPapel(ctx.rolesAplicados.get(malla.name))
    else if (malla.name === 'pliegue-de-piel') densidad = densidadDelPapel('piel')
    else densidad = DENSIDAD_DEL_METAL
    cambiadas.set(malla, malla.material)
    malla.material = materialPara(densidad)
  })

  return () => {
    cambiadas.forEach((original, malla) => {
      malla.material = original
    })
    for (const o of escondidas) o.visible = true
  }
}

// ------------------------------------------------------------ fluoroscopia

export interface OpcionesDeLaImagen {
  proyeccion: ProyeccionDeFluoroscopia
  /** 0,6 a 2: cuánto se acerca. 1 encuadra el hueso entero con un poco de aire. */
  zoom: number
  /** Qué eje del archivo es el largo del hueso (decide qué es «de frente»). */
  ejeLargo: 'x' | 'y' | 'z'
  /** Cuánto se ha corrido la extremidad bajo el arco (arrastrando la imagen). Sin él, centrada. */
  desplazamiento?: DesplazamientoDeLaImagen
}

export interface TallerDeFluoroscopia {
  rt: THREE.WebGLRenderTarget
  buffer: Uint8Array
  camara: THREE.PerspectiveCamera
  /** Para no repetir el dibujo si nada cambió. */
  huella: string
  /** El material de la radiografía de cada densidad: se crean una vez y se ponen y quitan en cada dibujo. */
  materiales: Map<number, THREE.ShaderMaterial>
}

export const LADO_DE_LA_IMAGEN = 384

export function prepararFluoroscopia(): TallerDeFluoroscopia {
  const rt = new THREE.WebGLRenderTarget(LADO_DE_LA_IMAGEN, LADO_DE_LA_IMAGEN, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  })
  return {
    rt,
    buffer: new Uint8Array(LADO_DE_LA_IMAGEN * LADO_DE_LA_IMAGEN * 4),
    camara: new THREE.PerspectiveCamera(14, 1, 0.01, 100),
    huella: '',
    materiales: new Map(),
  }
}

export function soltarFluoroscopia(f: TallerDeFluoroscopia | undefined) {
  f?.rt.dispose()
  f?.materiales.forEach((m) => m.dispose())
  f?.materiales.clear()
}

/** Las dos direcciones desde las que se mira: «de frente» y «de lado», según el eje largo del archivo. */
function direcciones(eje: 'x' | 'y' | 'z') {
  if (eje === 'y') return { ap: new THREE.Vector3(0, 0, 1), lateral: new THREE.Vector3(1, 0, 0), arriba: new THREE.Vector3(0, 1, 0) }
  if (eje === 'x') return { ap: new THREE.Vector3(0, 0, 1), lateral: new THREE.Vector3(0, 1, 0), arriba: new THREE.Vector3(1, 0, 0) }
  return { ap: new THREE.Vector3(0, 1, 0), lateral: new THREE.Vector3(1, 0, 0), arriba: new THREE.Vector3(0, 0, 1) }
}

/** Dónde está y cuánto ocupa lo que la imagen tiene que encuadrar: el hueso visible, o todo lo visible si no hay. */
export function cajaAEncuadrar(raiz: THREE.Object3D, roles: Map<string, string>): THREE.Box3 {
  const hueso = new THREE.Box3()
  const todo = new THREE.Box3()
  raiz.updateMatrixWorld(true)
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible || esDeInterfaz(m)) return
    const caja = new THREE.Box3().setFromObject(m)
    if (caja.isEmpty()) return
    todo.union(caja)
    const rol = roles.get(m.name)
    if (rol === 'hueso' || rol === 'fragmento') hueso.union(caja)
  })
  return hueso.isEmpty() ? todo : hueso
}

/**
 * Dibuja la imagen del arco en C sobre `destino` y devuelve `true` si dibujó.
 *
 * Renderiza la escena —con los materiales de la radiografía puestos solo mientras dura el dibujo— desde la
 * proyección pedida a un blanco pequeño, lee los píxeles y los pasa al negativo dentro del círculo. Se hace
 * con el mismo `WebGLRenderer` de la escena y no con uno segundo: un contexto más duplicaría en memoria de
 * vídeo la geometría de la pierna entera. Si nada cambió desde el último dibujo (misma proyección, mismo zoom,
 * misma posición del miembro, mismo cuadro), no hace nada: leer píxeles de la tarjeta cuesta.
 */
export function dibujarFluoroscopia(
  render: THREE.WebGLRenderer,
  ctx: EscenaParaRadiografia,
  f: TallerDeFluoroscopia,
  destino: HTMLCanvasElement,
  opciones: OpcionesDeLaImagen,
  cuadro: number,
  /** Se esconden mientras dura el dibujo: ayudas de pantalla que un arco no vería. */
  esconder: (THREE.Object3D | undefined)[],
): boolean {
  if (!ctx.raiz) return false
  const desplazamiento = limitarDesplazamiento(opciones.desplazamiento ?? SIN_DESPLAZAMIENTO)
  const huella = `${opciones.proyeccion}|${opciones.zoom}|${opciones.ejeLargo}|${desplazamiento.x.toFixed(3)},${desplazamiento.y.toFixed(3)}|${cuadro}`
  if (huella === f.huella) return false
  f.huella = huella

  const { ap, lateral, arriba } = direcciones(opciones.ejeLargo)
  const angulo = (ANGULO_DE_LA_PROYECCION[opciones.proyeccion] * Math.PI) / 180
  const direccion = ap.clone().multiplyScalar(Math.cos(angulo)).addScaledVector(lateral, Math.sin(angulo)).normalize()
  // Los ejes de la imagen: la cámara mira contra `direccion` y su «arriba» es el eje largo del hueso.
  const derecha = new THREE.Vector3().crossVectors(direccion.clone().negate(), arriba).normalize()

  const caja = cajaAEncuadrar(ctx.raiz, ctx.rolesAplicados)
  if (caja.isEmpty()) return false
  const centro = caja.getCenter(new THREE.Vector3())
  const tam = caja.getSize(new THREE.Vector3())
  // El círculo cubre la dimensión mayor con un 12 % de aire, y el zoom la acerca.
  const radio = (Math.max(tam.x, tam.y, tam.z) / 2) * 1.12 / Math.max(0.3, opciones.zoom)
  const distancia = radio / Math.tan((f.camara.fov * Math.PI) / 360)
  // Con la extremidad corrida, la cámara mira a otro punto del miembro, no al centro del hueso.
  const foco = new THREE.Vector3(
    ...centroDeLaImagen([centro.x, centro.y, centro.z], radio, [derecha.x, derecha.y, derecha.z], [arriba.x, arriba.y, arriba.z], desplazamiento),
  )
  f.camara.position.copy(foco).addScaledVector(direccion, distancia)
  f.camara.up.copy(arriba)
  f.camara.near = Math.max(0.001, distancia - radio * 4)
  f.camara.far = distancia + radio * 4
  f.camara.updateProjectionMatrix()
  f.camara.lookAt(foco)

  const escondidos = esconder.filter((o): o is THREE.Object3D => !!o && o.visible)
  escondidos.forEach((o) => (o.visible = false))
  const quitarRadiografia = ponerRadiografiaTemporal(ctx, f)
  const colorAntes = new THREE.Color()
  render.getClearColor(colorAntes)
  const alfaAntes = render.getClearAlpha()
  try {
    render.setRenderTarget(f.rt)
    render.setClearColor(0x000000, 1)
    render.clear()
    render.render(ctx.escena, f.camara)
    render.readRenderTargetPixels(f.rt, 0, 0, LADO_DE_LA_IMAGEN, LADO_DE_LA_IMAGEN, f.buffer)
  } finally {
    // Pase lo que pase, la escena de quien está trabajando vuelve a ser la suya.
    render.setRenderTarget(null)
    render.setClearColor(colorAntes, alfaAntes)
    quitarRadiografia()
    escondidos.forEach((o) => (o.visible = true))
  }

  const imagen = aFluoroscopia(f.buffer, LADO_DE_LA_IMAGEN, LADO_DE_LA_IMAGEN, { ganancia: 1, ruido: 0.6, semilla: cuadro })
  destino.width = LADO_DE_LA_IMAGEN
  destino.height = LADO_DE_LA_IMAGEN
  const lienzo = destino.getContext('2d')
  if (!lienzo) return false
  lienzo.putImageData(new ImageData(new Uint8ClampedArray(imagen), LADO_DE_LA_IMAGEN, LADO_DE_LA_IMAGEN), 0, 0)
  return true
}
