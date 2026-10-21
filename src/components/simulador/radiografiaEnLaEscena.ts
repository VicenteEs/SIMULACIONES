import * as THREE from 'three'
import { GANANCIA_DE_LA_RADIOGRAFIA, crearMaterialDeRadiografia } from '@/atlas/materialDeRadiografia'
import {
  AJUSTES_DE_LA_IMAGEN_POR_OMISION,
  ANGULO_DE_LA_PROYECCION,
  DENSIDAD_DEL_METAL,
  FACTOR_DE_LA_TOMA,
  SIN_DESPLAZAMIENTO,
  aFluoroscopia,
  recortarALaPlaca,
  type FormatoDeLaImagen,
  centroDeLaImagen,
  densidadDelPapel,
  LADOS_DE_LA_IMAGEN,
  limitarAjustes,
  limitarDesplazamiento,
  limitarZoom,
  type AjustesDeLaImagen,
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
      // La toma se captura con menos ganancia y se revela con `FACTOR_DE_LA_TOMA` (ver `aFluoroscopia`): así lo muy
      // denso no se satura en la captura y los kilovoltios altos tienen algo que mostrar.
      m = crearMaterialDeRadiografia(densidad, GANANCIA_DE_LA_RADIOGRAFIA / FACTOR_DE_LA_TOMA)
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
  /** 0,6 a 4: cuánto se acerca. 1 encuadra el hueso entero con un poco de aire. */
  zoom: number
  /** Píxeles por lado con que se dibuja (`ladoDeLaImagen`), según lo grande que se enseñe. Sin él, el que ya tiene. */
  lado?: number
  /** Qué eje del archivo es el largo del hueso (decide qué es «de frente»). */
  ejeLargo: 'x' | 'y' | 'z'
  /** Cuánto se ha corrido la extremidad bajo el arco (arrastrando la imagen). Sin él, centrada. */
  desplazamiento?: DesplazamientoDeLaImagen
  /** Cómo se revela la toma (P-003, E2). Sin ellos, los de siempre: 70 kV, sin contraste ni filtro. */
  ajustes?: Partial<AjustesDeLaImagen>
  /** Hace la toma aunque nada haya cambiado: es lo que hace el botón «Disparar». */
  forzar?: boolean
}

export interface TallerDeFluoroscopia {
  rt: THREE.WebGLRenderTarget
  buffer: Uint8Array
  /** Píxeles por lado del blanco y del búfer. */
  lado: number
  camara: THREE.PerspectiveCamera
  /** Para no repetir la toma si nada cambió: proyección, zoom, posición, lado, eje y cuadro, **sin** los ajustes. */
  huella: string
  /**
   * Los ajustes con que se reveló la última imagen. Va aparte de `huella` a propósito: cambiar los kilovoltios o el
   * contraste vuelve a revelar la misma toma, no la repite —repetirla leería píxeles de la tarjeta sin motivo, y en
   * el modo de disparo sería «irradiar» otra vez—.
   */
  huellaDelRevelado: string
  /** De qué es la imagen que hay en `buffer`; `null` mientras no se haya hecho ninguna toma. */
  toma: { cuadro: number; lado: number } | null
  /** El material de la radiografía de cada densidad: se crean una vez y se ponen y quitan en cada dibujo. */
  materiales: Map<number, THREE.ShaderMaterial>
}

export const LADO_DE_LA_IMAGEN = 384
const LADOS_VALIDOS: readonly number[] = LADOS_DE_LA_IMAGEN

function blancoDeLado(lado: number) {
  return new THREE.WebGLRenderTarget(lado, lado, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  })
}

export function prepararFluoroscopia(lado: number = LADO_DE_LA_IMAGEN): TallerDeFluoroscopia {
  return {
    rt: blancoDeLado(lado),
    buffer: new Uint8Array(lado * lado * 4),
    lado,
    camara: new THREE.PerspectiveCamera(14, 1, 0.01, 100),
    huella: '',
    huellaDelRevelado: '',
    toma: null,
    materiales: new Map(),
  }
}

/**
 * Cambia el tamaño con que se dibuja la imagen: suelta el blanco de antes y reserva el nuevo.
 *
 * Solo si el lado cambió: un blanco de render es memoria de la tarjeta, y reservarlo siete veces por segundo es
 * justo lo que `huella` existe para evitar.
 */
export function ajustarLadoDeLaFluoroscopia(f: TallerDeFluoroscopia, lado: number) {
  if (f.lado === lado) return
  f.rt.dispose()
  f.rt = blancoDeLado(lado)
  f.buffer = new Uint8Array(lado * lado * 4)
  f.lado = lado
  f.huella = ''
  // El búfer nuevo está vacío: la toma de antes ya no está en él.
  f.huellaDelRevelado = ''
  f.toma = null
}

/**
 * Olvida lo que la imagen ya tenía dibujado: la próxima toma y el próximo revelado se hacen aunque nada haya cambiado.
 *
 * Hace falta cuando el lienzo donde se pintaba ya no tiene la imagen —se apagó y se encendió la fluoroscopia, o se
 * cambió de modo y se vació— y la escena sigue igual: sin esto, la huella dice «no ha cambiado nada» y el vídeo se
 * queda en negro hasta que alguien mueva algo.
 */
export function reiniciarLaFluoroscopia(f: TallerDeFluoroscopia | undefined) {
  if (!f) return
  f.huella = ''
  f.huellaDelRevelado = ''
  f.toma = null
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
 * Hace la **toma**: renderiza la escena desde la proyección pedida y deja los píxeles crudos en `f.buffer`.
 * Devuelve `true` si la hizo.
 *
 * Con los materiales de la radiografía puestos solo mientras dura el dibujo y a un blanco pequeño. Se hace con el
 * mismo `WebGLRenderer` de la escena y no con uno segundo: un contexto más duplicaría en memoria de vídeo la
 * geometría de la pierna entera. Si nada cambió desde la última toma (misma proyección, mismo zoom, misma posición
 * del miembro, mismo cuadro) no hace nada, salvo que se fuerce —el botón «Disparar»—: leer píxeles de la tarjeta cuesta.
 *
 * Está aparte del revelado (`revelarLaToma`) desde el modo de disparo (P-003, E2): en pabellón se dispara una vez y se
 * mira esa imagen, y los mandos de la imagen —kilovoltios, contraste, filtro— cambian cómo se lee, no se vuelven a
 * disparar.
 */
export function tomarFluoroscopia(
  render: THREE.WebGLRenderer,
  ctx: EscenaParaRadiografia,
  f: TallerDeFluoroscopia,
  opciones: OpcionesDeLaImagen,
  cuadro: number,
  /** Se esconden mientras dura el dibujo: ayudas de pantalla que un arco no vería. */
  esconder: (THREE.Object3D | undefined)[],
): boolean {
  if (!ctx.raiz) return false
  const zoom = limitarZoom(opciones.zoom)
  const desplazamiento = limitarDesplazamiento(opciones.desplazamiento ?? SIN_DESPLAZAMIENTO, zoom)
  if (opciones.lado && LADOS_VALIDOS.includes(opciones.lado)) ajustarLadoDeLaFluoroscopia(f, opciones.lado)
  const lado = f.lado
  const huella = `${opciones.proyeccion}|${zoom}|${lado}|${opciones.ejeLargo}|${desplazamiento.x.toFixed(3)},${desplazamiento.y.toFixed(3)}|${cuadro}`
  if (!opciones.forzar && huella === f.huella) return false
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
  const radio = (Math.max(tam.x, tam.y, tam.z) / 2) * 1.12 / zoom
  const distancia = radio / Math.tan((f.camara.fov * Math.PI) / 360)
  // Con la extremidad corrida, la cámara mira a otro punto del miembro, no al centro del hueso.
  const foco = new THREE.Vector3(
    ...centroDeLaImagen([centro.x, centro.y, centro.z], radio, [derecha.x, derecha.y, derecha.z], [arriba.x, arriba.y, arriba.z], desplazamiento, zoom),
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
    render.readRenderTargetPixels(f.rt, 0, 0, lado, lado, f.buffer)
  } finally {
    // Pase lo que pase, la escena de quien está trabajando vuelve a ser la suya.
    render.setRenderTarget(null)
    render.setClearColor(colorAntes, alfaAntes)
    quitarRadiografia()
    escondidos.forEach((o) => (o.visible = true))
  }

  f.toma = { cuadro, lado }
  // Lo que hay en el búfer es otra imagen: lo revelado antes ya no corresponde.
  f.huellaDelRevelado = ''
  return true
}

/**
 * **Revela** la última toma sobre `destino` con los ajustes dados y devuelve `true` si pintó.
 *
 * No toca la escena ni la tarjeta gráfica: trabaja sobre los píxeles ya leídos. Por eso mover los kilovoltios o el
 * contraste es instantáneo, en vídeo y en disparo, y por eso en disparo no cuenta como exposición. Si los ajustes no
 * cambiaron desde el último revelado no hace nada (`forzar` lo obliga).
 */
export function revelarLaToma(
  f: TallerDeFluoroscopia,
  destino: HTMLCanvasElement,
  ajustes?: Partial<AjustesDeLaImagen>,
  forzar = false,
  /** `'placa'` (P-004 E11): rectangular y en positivo, para la radiografía postoperatoria. */
  formato: FormatoDeLaImagen = 'circulo',
): boolean {
  if (!f.toma) return false
  const a = limitarAjustes(ajustes ?? AJUSTES_DE_LA_IMAGEN_POR_OMISION)
  const huella = `${a.kv}|${a.contraste}|${a.brillo}|${a.filtro}|${formato}`
  if (!forzar && huella === f.huellaDelRevelado) return false
  // El lado de la toma y no el de ahora: ensanchar el recuadro entre dos disparos no vacía la imagen que se mira.
  const lado = f.toma.lado
  // La placa es una franja vertical de la misma toma: el círculo ocupa el cuadrado entero, la placa solo sus columnas centrales.
  const recorte = formato === 'placa' ? recortarALaPlaca(f.buffer, lado) : null
  const ancho = recorte?.ancho ?? lado
  const imagen = aFluoroscopia(recorte?.pixeles ?? f.buffer, ancho, lado, { ...a, ganancia: FACTOR_DE_LA_TOMA, ruido: 0.6, semilla: f.toma.cuadro, formato })
  destino.width = ancho
  destino.height = lado
  const lienzo = destino.getContext('2d')
  if (!lienzo) return false
  lienzo.putImageData(new ImageData(new Uint8ClampedArray(imagen), ancho, lado), 0, 0)
  f.huellaDelRevelado = huella
  return true
}

/**
 * Toma y revela en un solo paso: lo que hace el modo de vídeo siete veces por segundo, y el disparo una vez.
 * Devuelve `true` si pintó. Es lo que había antes de separar las dos mitades, con el mismo comportamiento.
 */
export function dibujarFluoroscopia(
  render: THREE.WebGLRenderer,
  ctx: EscenaParaRadiografia,
  f: TallerDeFluoroscopia,
  destino: HTMLCanvasElement,
  opciones: OpcionesDeLaImagen,
  cuadro: number,
  esconder: (THREE.Object3D | undefined)[],
  formato: FormatoDeLaImagen = 'circulo',
): boolean {
  const tomada = tomarFluoroscopia(render, ctx, f, opciones, cuadro, esconder)
  return revelarLaToma(f, destino, opciones.ajustes, tomada, formato)
}
