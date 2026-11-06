/**
 * La posición reducida de los trozos de hueso, en la escena del lienzo (P-008 E5).
 *
 * El caso guarda, por cada trozo que el modelo trae desplazado, el movimiento que lo lleva de donde está en el archivo
 * a donde va reducido (`posicionReducida`, en `src/lib/reduccionAutomatica.ts`). Aquí se resuelve lo que eso pide de la
 * escena: saber dónde estaba cada objeto en el archivo aunque ya se haya movido, convertir ese movimiento en la pose
 * de su nodo y llevar los trozos de un sitio al otro poco a poco.
 *
 * Por qué contra la pose **del archivo** y no contra la de ahora: cuando el editor reduce, el residente puede haber
 * arrastrado ya un trozo con «Mover», o la consola haber puesto el fragmento en su desplazamiento inicial. Medido
 * contra lo de ahora, guardar la reducción dos veces daría dos resultados; contra el archivo, siempre el mismo.
 */

import * as THREE from 'three'
import { matrizDe, transformacionDe, type TransformacionRigida, type TrozoParaReducir } from '@/lib/reduccionAutomatica'

/** La pose de cada objeto tal como vino en el archivo, relativa a su padre. Débil: se va con el modelo. */
const posesDelArchivo = new WeakMap<THREE.Object3D, THREE.Matrix4>()

/** Se anota al cargar el modelo, antes de que nada lo mueva. Lo ya anotado no se pisa. */
export function registrarPosesDelArchivo(raiz: THREE.Object3D) {
  raiz.updateMatrixWorld(true)
  raiz.traverse((objeto) => {
    if (objeto !== raiz && !posesDelArchivo.has(objeto)) posesDelArchivo.set(objeto, objeto.matrix.clone())
  })
}

/**
 * Lo mismo que hace `pivoteEnSuCentro` con el nodo, hecho con su pose del archivo.
 *
 * Correr el origen del fragmento a su centro mueve el nodo y su geometría en sentidos contrarios: el hueso no se mueve,
 * pero la pose del nodo es otra. Sin anotarlo aquí, la pose del archivo sería la de un nodo con el origen viejo y la
 * geometría nueva, y el fragmento reducido saldría corrido justo lo que se corrió el origen.
 */
export function correrElOrigenDelArchivo(objeto: THREE.Object3D, centro: THREE.Vector3) {
  posesDelArchivo.get(objeto)?.multiply(new THREE.Matrix4().makeTranslation(centro.x, centro.y, centro.z))
}

/** La pose del objeto en el archivo, relativa a su padre; si no se anotó, la de ahora. */
export function poseDelArchivo(objeto: THREE.Object3D): THREE.Matrix4 {
  return (posesDelArchivo.get(objeto) ?? objeto.matrix).clone()
}

/** Del espacio del objeto al del modelo (la raíz), con el objeto como está ahora. */
function enLaRaiz(raiz: THREE.Object3D, objeto: THREE.Object3D): THREE.Matrix4 {
  return raiz.matrixWorld.clone().invert().multiply(objeto.matrixWorld)
}

/** Del espacio del padre al del modelo. Los padres no se mueven: solo se mueven los trozos. */
function delPadreALaRaiz(raiz: THREE.Object3D, objeto: THREE.Object3D): THREE.Matrix4 {
  return objeto.parent ? enLaRaiz(raiz, objeto.parent) : new THREE.Matrix4()
}

/** Del espacio del objeto al del modelo, con el objeto en su pose del archivo. */
function delArchivoALaRaiz(raiz: THREE.Object3D, objeto: THREE.Object3D): THREE.Matrix4 {
  return delPadreALaRaiz(raiz, objeto).multiply(poseDelArchivo(objeto))
}

/**
 * Los vértices y triángulos de cada trozo en su pose del archivo y en el espacio del modelo: lo que necesita la
 * reducción por caras de corte. Un trozo con varias mallas dentro sale como una sola.
 */
export function trozosParaReducir(raiz: THREE.Object3D, nodos: readonly string[]): TrozoParaReducir[] {
  raiz.updateMatrixWorld(true)
  const trozos: TrozoParaReducir[] = []
  const v = new THREE.Vector3()
  for (const nodo of nodos) {
    const objeto = raiz.getObjectByName(nodo)
    if (!objeto) continue
    const alArchivo = delArchivoALaRaiz(raiz, objeto)
    const inversa = objeto.matrixWorld.clone().invert()
    const posiciones: number[] = []
    const indices: number[] = []
    objeto.traverse((hijo) => {
      const malla = hijo as THREE.Mesh
      const atributo = malla.isMesh ? malla.geometry?.getAttribute('position') : undefined
      if (!atributo) return
      // De la malla al trozo —eso no cambia al moverlo— y del trozo al modelo, en su pose del archivo.
      const matriz = alArchivo.clone().multiply(inversa.clone().multiply(malla.matrixWorld))
      const base = posiciones.length / 3
      for (let i = 0; i < atributo.count; i++) {
        v.fromBufferAttribute(atributo, i).applyMatrix4(matriz)
        posiciones.push(v.x, v.y, v.z)
      }
      const indice = malla.geometry.index
      if (indice) for (let i = 0; i < indice.count; i++) indices.push(base + indice.getX(i))
      else for (let i = 0; i < atributo.count; i++) indices.push(base + i)
    })
    if (posiciones.length > 0) trozos.push({ nodo, posiciones, indices })
  }
  return trozos
}

/** La pose del nodo, relativa a su padre, con el trozo reducido. */
export function poseReducida(raiz: THREE.Object3D, objeto: THREE.Object3D, transformacion: TransformacionRigida): THREE.Matrix4 {
  raiz.updateMatrixWorld(true)
  const padre = delPadreALaRaiz(raiz, objeto)
  const reducido = matrizDe(transformacion).multiply(padre.clone().multiply(poseDelArchivo(objeto)))
  return padre.invert().multiply(reducido)
}

/** Lo que separa la pose de ahora de la del archivo, en el espacio del modelo: la reducción hecha a mano. */
export function transformacionDesdeElArchivo(raiz: THREE.Object3D, objeto: THREE.Object3D): TransformacionRigida {
  raiz.updateMatrixWorld(true)
  return transformacionDe(enLaRaiz(raiz, objeto).multiply(delArchivoALaRaiz(raiz, objeto).invert()))
}

/** Pone al nodo una pose dada como matriz relativa a su padre. */
export function ponerPose(objeto: THREE.Object3D, pose: THREE.Matrix4) {
  pose.decompose(objeto.position, objeto.quaternion, objeto.scale)
  objeto.updateMatrixWorld(true)
}

/** Un trozo que va de una pose a otra: de dónde sale, a dónde llega y alrededor de qué gira. */
export interface TrayectoDeUnTrozo {
  objeto: THREE.Object3D
  desde: THREE.Matrix4
  hasta: THREE.Matrix4
  /** Su centro al salir, en el espacio del padre. */
  centro: THREE.Vector3
}

export function trayecto(objeto: THREE.Object3D, hasta: THREE.Matrix4): TrayectoDeUnTrozo {
  objeto.updateMatrixWorld(true)
  const caja = new THREE.Box3().setFromObject(objeto)
  const centro = caja.isEmpty() ? objeto.position.clone() : caja.getCenter(new THREE.Vector3())
  if (objeto.parent) objeto.parent.worldToLocal(centro)
  objeto.updateMatrix()
  return { objeto, desde: objeto.matrix.clone(), hasta: hasta.clone(), centro }
}

/**
 * La pose a una fracción `k` del trayecto, girando alrededor del centro del trozo.
 *
 * Interpolar la posición del nodo y su giro por separado lleva el trozo por un arco: el origen de un trozo exportado
 * del atlas es el del cuerpo, a palmos del hueso, y girar 20° alrededor de él lanzaba el trozo fuera de la pierna a
 * mitad de camino. Alrededor de su propio centro, el trozo va derecho a su sitio mientras gira.
 */
export function poseDelTrayecto(t: TrayectoDeUnTrozo, k: number): THREE.Matrix4 {
  const delta = t.hasta.clone().multiply(t.desde.clone().invert())
  const giro = new THREE.Quaternion().setFromRotationMatrix(delta)
  const llegada = t.centro.clone().applyMatrix4(delta)
  const giroParcial = new THREE.Quaternion().slerp(giro, k)
  const centroParcial = t.centro.clone().lerp(llegada, k)
  const parcial = new THREE.Matrix4().makeRotationFromQuaternion(giroParcial)
  parcial.setPosition(centroParcial.sub(t.centro.clone().applyQuaternion(giroParcial)))
  return parcial.multiply(t.desde)
}

/** Los objetos que el exportador marcó como hueso (los `extras` del atlas): los candidatos cuando el caso no declara piezas. */
export function nodosDeHuesoDelArchivo(raiz: THREE.Object3D): string[] {
  const nodos: string[] = []
  raiz.traverse((objeto) => {
    if ((objeto as THREE.Mesh).isMesh && objeto.userData?.rol === 'hueso' && objeto.name) nodos.push(objeto.name)
  })
  return nodos
}

/** La pose reducida de cada trozo, por objeto. Un nodo que el modelo no trae no sale. */
export function posesReducidasDe(
  raiz: THREE.Object3D,
  entradas: Iterable<readonly [string, TransformacionRigida]>,
): Map<THREE.Object3D, THREE.Matrix4> {
  const poses = new Map<THREE.Object3D, THREE.Matrix4>()
  for (const [nodo, transformacion] of entradas) {
    const objeto = raiz.getObjectByName(nodo)
    if (objeto) poses.set(objeto, poseReducida(raiz, objeto, transformacion))
  }
  return poses
}

// ------------------------------------------------ la lectura del fragmento

/**
 * Cuánto se ha desviado el fragmento de su sitio de reposo, en el espacio del modelo (D-303): el giro que lo lleva de
 * donde debería estar a donde está y lo que se ha ido el punto `focoLocal` (en el espacio del propio fragmento).
 *
 * Contra matrices y no restando ángulos de Euler, que es lo que hacía `estadoDelFragmento`: la resta da el giro de
 * verdad solo si el trozo parte sin girar, y desde P-008 E5 un fragmento puede partir girado —se exporta ya
 * desplazado—. `referenciaEnElPadre` es el sitio de reposo como pose del nodo, relativa a su padre: la que guarda el
 * lienzo en `origenDelFragmento`.
 */
export function desvioDelFragmento(
  raiz: THREE.Object3D,
  objeto: THREE.Object3D,
  referenciaEnElPadre: THREE.Matrix4,
  focoLocal: THREE.Vector3 = new THREE.Vector3(),
): { giro: [number, number, number, number]; separacion: [number, number, number] } {
  raiz.updateMatrixWorld(true)
  objeto.updateMatrix()
  const padre = delPadreALaRaiz(raiz, objeto)
  const ahora = padre.clone().multiply(objeto.matrix)
  const debido = padre.clone().multiply(referenciaEnElPadre)
  const enAhora = focoLocal.clone().applyMatrix4(ahora)
  const enSuSitio = focoLocal.clone().applyMatrix4(debido)
  const giroAhora = new THREE.Quaternion()
  const giroDebido = new THREE.Quaternion()
  ahora.decompose(new THREE.Vector3(), giroAhora, new THREE.Vector3())
  debido.decompose(new THREE.Vector3(), giroDebido, new THREE.Vector3())
  const giro = giroAhora.multiply(giroDebido.invert()).normalize()
  return { giro: [giro.x, giro.y, giro.z, giro.w], separacion: [enAhora.x - enSuSitio.x, enAhora.y - enSuSitio.y, enAhora.z - enSuSitio.z] }
}

const esTerna = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) && Math.hypot(v[0], v[1], v[2]) > 1e-9

/** El lado que dice el nombre de un objeto, en español o en el inglés del atlas; `null` si no lo dice. */
export function ladoPorElNombre(...nombres: unknown[]): 'derecho' | 'izquierdo' | null {
  for (const nombre of nombres) {
    if (typeof nombre !== 'string') continue
    const n = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    // Sin `\b`: en un nombre de nodo el guion bajo es parte de la palabra, y «Tibia_derecha_fragmento» no tiene límite
    // de palabra antes ni después de «derecha».
    if (/right|derech/.test(n)) return 'derecho'
    if (/left|izquierd/.test(n)) return 'izquierdo'
  }
  return null
}

/**
 * Los ejes con que se lee el fragmento, en el espacio del modelo (D-303), y si se sabe de qué lado es.
 *
 * Los trae el archivo que sale del taller (`ejeLargo`, `ejeDelante`, `ejeFuera`, D-304), medidos sobre el hueso entero
 * y girados como el otro trozo. Un modelo anterior o hecho en Blender no los trae, y entonces se suponen los del atlas
 * de pie: el largo hacia abajo por el eje del caso, delante +Z y fuera según el lado, que se lee de `lado` o del nombre
 * («Right tibia», «Tibia derecha»). Sin lado conocido se toma el derecho y se dice: las magnitudes son las mismas en
 * los dos lados, pero varo y valgo saldrían al revés en una pierna izquierda.
 */
export function ejesDelFragmento(
  objeto: THREE.Object3D,
  ejeLargo: 'x' | 'y' | 'z' = 'y',
): { ejes: { largo: [number, number, number]; delante: [number, number, number]; fuera: [number, number, number] }; ladoConocido: boolean } {
  const datos = objeto.userData ?? {}
  if (esTerna(datos.ejeLargo) && esTerna(datos.ejeDelante) && esTerna(datos.ejeFuera)) {
    return { ejes: { largo: datos.ejeLargo, delante: datos.ejeDelante, fuera: datos.ejeFuera }, ladoConocido: true }
  }
  const escrito = datos.lado === 'derecho' || datos.lado === 'izquierdo' ? datos.lado : null
  const lado = escrito ?? ladoPorElNombre(datos.nombreOriginal, datos.etiqueta, objeto.name)
  const i = ejeLargo === 'x' ? 0 : ejeLargo === 'z' ? 2 : 1
  const largo: [number, number, number] = [0, 0, 0]
  largo[i] = -1
  const delante: [number, number, number] = i === 2 ? [0, 1, 0] : [0, 0, 1]
  const cruz = new THREE.Vector3(...largo).cross(new THREE.Vector3(...delante))
  const signo = lado === 'izquierdo' ? -1 : 1
  return { ejes: { largo, delante, fuera: [cruz.x * signo, cruz.y * signo, cruz.z * signo] }, ladoConocido: lado !== null }
}

/** De qué trozo es el fragmento, si el archivo lo dice (`trozo`, que escribe la exportación del atlas). */
export function trozoDelFragmento(objeto: THREE.Object3D): 'distal' | 'proximal' | null {
  const trozo = objeto.userData?.trozo
  return trozo === 'distal' || trozo === 'proximal' ? trozo : null
}
