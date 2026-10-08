import * as THREE from 'three'
import {
  metaDeNodo,
  metaDeRaiz,
  movimientoDelNodo,
  type AjustesDeInstrumento,
  type MetaDeRaiz,
} from '@/instrumental/modelo'

/**
 * Un instrumento ya cargado, listo para posarse (D-166).
 *
 * Lo comparten el visor del taller (`VisorDeInstrumento`) y la escena del
 * simulador (`LienzoQuirurgico`): los dos tienen que dejar el modelo igual, o lo
 * que el administrador retoca en uno no es lo que el residente ve en el otro.
 * Por eso la pose —la del archivo, más el retoque, más la articulación— se
 * calcula en un solo sitio.
 *
 * Con three, así que no se puede probar sin él; lo que sí se prueba sin three
 * es la matemática de `modelo.ts`, de donde sale cada movimiento.
 */

export interface PoseBase {
  posicion: THREE.Vector3
  rotacion: THREE.Quaternion
}

export interface HerramientaCargada {
  raiz: THREE.Object3D
  nodos: Map<string, THREE.Object3D>
  bases: Map<string, PoseBase>
  mallas: THREE.Mesh[]
  /** El color con que vino cada malla, para volver a él al quitar un retoque. */
  colores: Map<THREE.Mesh, THREE.Color>
  meta: MetaDeRaiz | null
  /** Lo que mide de largo, en metros: la caja del archivo tal como viene. */
  largo: number
}

const esMalla = (o: THREE.Object3D): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true

/**
 * Registra los nodos y las poses de partida, y da a cada malla su propio
 * material: sin eso, colorear una parte teñiría todas las que comparten el del
 * archivo.
 */
export function prepararHerramienta(raiz: THREE.Object3D): HerramientaCargada {
  const nodos = new Map<string, THREE.Object3D>()
  const bases = new Map<string, PoseBase>()
  const mallas: THREE.Mesh[] = []
  const colores = new Map<THREE.Mesh, THREE.Color>()
  let meta: MetaDeRaiz | null = null

  raiz.traverse((o) => {
    if (o === raiz) return
    meta = meta ?? metaDeRaiz(o.userData)
    nodos.set(o.name, o)
    bases.set(o.name, { posicion: o.position.clone(), rotacion: o.quaternion.clone() })
    if (esMalla(o)) {
      const propio = (Array.isArray(o.material) ? o.material[0] : o.material).clone() as THREE.MeshStandardMaterial
      o.material = propio
      mallas.push(o)
      colores.set(o, propio.color.clone())
    }
  })
  meta = meta ?? metaDeRaiz(raiz.userData)

  raiz.updateMatrixWorld(true)
  const caja = new THREE.Box3().setFromObject(raiz)
  const largo = caja.isEmpty() ? 0 : caja.getSize(new THREE.Vector3()).length()
  return { raiz, nodos, bases, mallas, colores, meta, largo }
}

/**
 * Deja cada nodo en su pose: la del archivo, el retoque y lo que manda la
 * articulación. Idempotente: se puede llamar en cada cambio.
 *
 * `omitir` es el nodo que alguien está arrastrando con las asas del taller: lo
 * mueve la propia asa mientras dura el gesto.
 */
export function aplicarPose(
  h: Pick<HerramientaCargada, 'nodos' | 'bases'>,
  ajustes: AjustesDeInstrumento | null,
  articulaciones: Record<string, number>,
  omitir: THREE.Object3D | null = null,
) {
  for (const [nombre, nodo] of h.nodos) {
    const base = h.bases.get(nombre)
    if (!base) continue
    const posicion = base.posicion.clone()
    const rotacion = base.rotacion.clone()
    const retoque = ajustes?.partes?.[nombre]
    if (retoque?.mover) posicion.add(new THREE.Vector3(...retoque.mover))
    if (retoque?.girar) rotacion.premultiply(new THREE.Quaternion(...retoque.girar))
    const meta = metaDeNodo(nodo.userData)
    if (meta) {
      const mov = movimientoDelNodo(meta, articulaciones[meta.mueve] ?? 0)
      rotacion.premultiply(new THREE.Quaternion(...mov.girar))
      posicion.add(new THREE.Vector3(...mov.mover))
    }
    if (omitir !== nodo) {
      nodo.position.copy(posicion)
      nodo.quaternion.copy(rotacion)
    }
    nodo.visible = !retoque?.ocultar
  }
}

/** El color de cada malla: el retocado, o el que traía. */
export function aplicarColores(h: HerramientaCargada, ajustes: AjustesDeInstrumento | null) {
  for (const malla of h.mallas) {
    const original = h.colores.get(malla)
    if (!original) continue
    const retoque = ajustes?.partes?.[malla.name]
    ;(malla.material as THREE.MeshStandardMaterial).color.copy(
      retoque?.color ? new THREE.Color(retoque.color) : original,
    )
  }
}

/**
 * Le da al instrumento un entorno que reflejar.
 *
 * Sin él, el acero (`metalness` 1) se ve negro: un metal solo se ve por lo que
 * refleja, y la escena del simulador no tiene entorno —solo tres luces—, que
 * para un hueso mate basta. Se pone **solo** a los materiales del instrumento y
 * no a la escena, para no cambiarle a nadie la apariencia del hueso.
 */
export function aplicarEntorno(h: Pick<HerramientaCargada, 'mallas'>, entorno: THREE.Texture | null) {
  for (const malla of h.mallas) {
    const material = malla.material as THREE.MeshStandardMaterial
    material.envMap = entorno
    material.envMapIntensity = 1
    material.needsUpdate = true
  }
}

/** El valor con que arranca cada articulación: el guardado en el taller, o el que declara el archivo. */
export function articulacionesIniciales(
  meta: MetaDeRaiz | null,
  ajustes: AjustesDeInstrumento | null,
): Record<string, number> {
  const valores: Record<string, number> = {}
  for (const a of meta?.articulaciones ?? []) valores[a.nombre] = ajustes?.articulaciones?.[a.nombre] ?? a.inicial
  return valores
}

/** Suelta la geometría y los materiales (cada malla tiene los suyos). */
export function liberarHerramienta(h: HerramientaCargada) {
  for (const malla of h.mallas) {
    malla.geometry.dispose()
    for (const m of Array.isArray(malla.material) ? malla.material : [malla.material]) m.dispose()
  }
  h.raiz.removeFromParent()
}
