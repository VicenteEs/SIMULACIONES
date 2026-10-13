import * as THREE from 'three'
import { crearMaterialDeRadiografia } from '@/atlas/materialDeRadiografia'
import {
  ANGULO_DE_LA_PROYECCION,
  DENSIDAD_DEL_METAL,
  aFluoroscopia,
  densidadDelPapel,
  type ProyeccionDeFluoroscopia,
} from '@/lib/radiografia'

/**
 * La radiografía y la fluoroscopia, dentro de la escena del simulador.
 *
 * Dos cosas que comparten el material:
 *
 * 1. La vista «rayos X» del lienzo, que pasa de «todo translúcido al 50 %» a una
 *    **radiografía**: cada pieza suma luz según lo que absorbe, y el resultado son
 *    grises, con el hueso casi blanco, sobre negro. No se dibujan los vasos ni los
 *    nervios (el simulador no los trae) ni lo que es ayuda de interfaz.
 * 2. La imagen del **arco en C**, que es lo mismo visto desde una proyección fija
 *    (AP, lateral u oblicua), pasado al negativo y recortado en un círculo
 *    (`aFluoroscopia`). Se dibuja en otro lienzo, al lado.
 *
 * Se trabaja cambiando los materiales de las mallas por unos propios y guardando
 * los de verdad en un mapa, como ya hacía `aplicarFluoroscopia`: el color y las
 * texturas del archivo no se tocan y `liberar` no se entera de nada.
 */

/** Lo que la vista necesita saber de la escena: dónde está cada cosa y qué papel tiene. */
export interface EscenaParaRadiografia {
  escena: THREE.Scene
  raiz?: THREE.Object3D
  /** El papel de cada nodo declarado, por su nombre. */
  rolesAplicados: Map<string, string>
  /** Los materiales de verdad, para devolverlos al apagar. */
  materialesOriginales: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
  /** Lo que se esconde mientras dura: el trazo, la cinta de la herida, las ayudas, los agujeros. */
  ocultos: Map<THREE.Object3D, boolean>
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
 * Enciende o apaga la radiografía. Es idempotente: lo que ya está cambiado se
 * deja, y lo que apareció después (un tornillo recién puesto) se cambia.
 */
export function aplicarRadiografia(ctx: EscenaParaRadiografia, encendida: boolean, ayudas: THREE.Object3D[] = []) {
  if (!encendida) {
    ctx.materialesOriginales.forEach((original, malla) => {
      for (const m of Array.isArray(malla.material) ? malla.material : [malla.material]) m.dispose()
      malla.material = original
    })
    ctx.materialesOriginales.clear()
    ctx.ocultos.forEach((visible, objeto) => {
      objeto.visible = visible
    })
    ctx.ocultos.clear()
    return
  }

  ctx.escena.traverse((objeto) => {
    // Lo que es interfaz —cintas, bordes, el trazo, los agujeros— no absorbe nada: se esconde.
    const ayuda = esDeInterfaz(objeto) || ayudas.includes(objeto) || objeto.userData.agujero === true
    if (ayuda && !ctx.ocultos.has(objeto)) {
      ctx.ocultos.set(objeto, objeto.visible)
      objeto.visible = false
      return
    }
    const malla = objeto as THREE.Mesh
    if (!malla.isMesh || ctx.materialesOriginales.has(malla)) return
    // Las ayudas de aprendizaje (la silueta verde del fragmento reducido, los ejes) ya traen su propio
    // material plano de color y se dejan como están: se dibujan por encima, y son lo que enseña a leer la imagen.
    if (esAyudaDeAprendizaje(malla)) return
    // Lo que es del modelo, por su papel; el pliegue de la piel pellizcada, como piel; y todo lo demás que
    // hay en la escena —el instrumento en la mano, la placa, los tornillos, los separadores— es metal.
    let densidad: number
    if (bajo(malla, ctx.raiz)) densidad = densidadDelPapel(ctx.rolesAplicados.get(malla.name))
    else if (malla.name === 'pliegue-de-piel') densidad = densidadDelPapel('piel')
    else densidad = DENSIDAD_DEL_METAL
    ctx.materialesOriginales.set(malla, malla.material)
    malla.material = crearMaterialDeRadiografia(densidad)
  })
}

// ------------------------------------------------------------ fluoroscopia

export interface OpcionesDeLaImagen {
  proyeccion: ProyeccionDeFluoroscopia
  /** 0,6 a 2: cuánto se acerca. 1 encuadra el hueso entero con un poco de aire. */
  zoom: number
  /** Qué eje del archivo es el largo del hueso (decide qué es «de frente»). */
  ejeLargo: 'x' | 'y' | 'z'
}

export interface TallerDeFluoroscopia {
  rt: THREE.WebGLRenderTarget
  buffer: Uint8Array
  camara: THREE.PerspectiveCamera
  /** Para no repetir el dibujo si nada cambió. */
  huella: string
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
  }
}

export function soltarFluoroscopia(f: TallerDeFluoroscopia | undefined) {
  f?.rt.dispose()
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
    if (!m.isMesh || !m.visible) return
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
 * Renderiza la escena —ya con los materiales de la radiografía puestos— desde la
 * proyección pedida a un blanco pequeño, lee los píxeles y los pasa al negativo
 * dentro del círculo. Se hace con el mismo `WebGLRenderer` de la escena y no con
 * uno segundo: un contexto más duplicaría en memoria de vídeo la geometría de la
 * pierna entera. Si nada cambió desde el último dibujo (misma proyección, mismo
 * zoom, mismo cuadro), no hace nada: leer píxeles de la tarjeta cuesta.
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
  const huella = `${opciones.proyeccion}|${opciones.zoom}|${opciones.ejeLargo}|${cuadro}`
  if (huella === f.huella) return false
  f.huella = huella

  const { ap, lateral, arriba } = direcciones(opciones.ejeLargo)
  const angulo = (ANGULO_DE_LA_PROYECCION[opciones.proyeccion] * Math.PI) / 180
  const direccion = ap.clone().multiplyScalar(Math.cos(angulo)).addScaledVector(lateral, Math.sin(angulo)).normalize()

  const caja = cajaAEncuadrar(ctx.raiz, ctx.rolesAplicados)
  if (caja.isEmpty()) return false
  const centro = caja.getCenter(new THREE.Vector3())
  const tam = caja.getSize(new THREE.Vector3())
  // El círculo cubre la dimensión mayor con un 12 % de aire, y el zoom la acerca.
  const radio = (Math.max(tam.x, tam.y, tam.z) / 2) * 1.12 / Math.max(0.3, opciones.zoom)
  const distancia = radio / Math.tan((f.camara.fov * Math.PI) / 360)
  f.camara.position.copy(centro).addScaledVector(direccion, distancia)
  f.camara.up.copy(arriba)
  f.camara.near = Math.max(0.001, distancia - radio * 4)
  f.camara.far = distancia + radio * 4
  f.camara.updateProjectionMatrix()
  f.camara.lookAt(centro)

  const escondidos = esconder.filter((o): o is THREE.Object3D => !!o && o.visible)
  escondidos.forEach((o) => (o.visible = false))
  const colorAntes = new THREE.Color()
  render.getClearColor(colorAntes)
  const alfaAntes = render.getClearAlpha()
  render.setRenderTarget(f.rt)
  render.setClearColor(0x000000, 1)
  render.clear()
  render.render(ctx.escena, f.camara)
  render.readRenderTargetPixels(f.rt, 0, 0, LADO_DE_LA_IMAGEN, LADO_DE_LA_IMAGEN, f.buffer)
  render.setRenderTarget(null)
  render.setClearColor(colorAntes, alfaAntes)
  escondidos.forEach((o) => (o.visible = true))

  const imagen = aFluoroscopia(f.buffer, LADO_DE_LA_IMAGEN, LADO_DE_LA_IMAGEN, { ganancia: 1, ruido: 0.6, semilla: cuadro })
  destino.width = LADO_DE_LA_IMAGEN
  destino.height = LADO_DE_LA_IMAGEN
  const lienzo = destino.getContext('2d')
  if (!lienzo) return false
  lienzo.putImageData(new ImageData(new Uint8ClampedArray(imagen), LADO_DE_LA_IMAGEN, LADO_DE_LA_IMAGEN), 0, 0)
  return true
}
