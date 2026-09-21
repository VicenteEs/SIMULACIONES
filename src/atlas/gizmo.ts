'use client'

/**
 * El manipulador del taller: tres flechas para mover y tres aros para girar,
 * sobre lo seleccionado (D-133).
 *
 * G y R con sus ejes son cómodos para quien viene de Blender e invisibles para
 * quien no: nada en pantalla dice que existen. Una flecha roja sobre la pieza
 * sí lo dice. Los colores son los de Blender y los de todo programa de 3D
 * —X rojo, Y verde, Z azul—, que es la única convención que aquí conviene no
 * discutir.
 *
 * Se dibuja encima de todo (sin prueba de profundidad) y con tamaño constante
 * en pantalla: un manipulador tapado por el músculo de delante, o que encoge al
 * alejarse, no se puede agarrar.
 */

import * as THREE from 'three'
import type { EjeDelGesto } from './transformar'

export interface AsaDelGizmo {
  modo: 'mover' | 'girar'
  eje: EjeDelGesto
}

export interface GizmoDelAtlas {
  grupo: THREE.Group
  /** Lo que se cruza con el rayo: más gordo que lo que se ve, para poder acertar. */
  asas: THREE.Mesh[]
  liberar: () => void
}

const COLOR: Record<EjeDelGesto, number> = { x: 0xe5484d, y: 0x46a758, z: 0x3e7bdc }

/** Hacia dónde apunta cada eje, como giro desde el +Y en que three construye cilindros y conos. */
function orientar(objeto: THREE.Object3D, eje: EjeDelGesto) {
  if (eje === 'x') objeto.rotation.z = -Math.PI / 2
  else if (eje === 'z') objeto.rotation.x = Math.PI / 2
}

export function crearGizmo(): GizmoDelAtlas {
  const grupo = new THREE.Group()
  grupo.visible = false
  grupo.renderOrder = 999
  const asas: THREE.Mesh[] = []
  const aLiberar: { dispose: () => void }[] = []

  const visible = (color: number) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    })
    aLiberar.push(material)
    return material
  }
  // Las asas no se pintan, pero el cruce de rayos de three no mira si algo se
  // pinta: mira la geometría. Es lo que permite que sean el triple de gordas.
  const invisible = new THREE.MeshBasicMaterial({ visible: false })
  aLiberar.push(invisible)

  for (const eje of ['x', 'y', 'z'] as const) {
    // --- flecha: mover ---
    const flecha = new THREE.Group()
    const vara = new THREE.CylinderGeometry(0.012, 0.012, 0.78, 8)
    vara.translate(0, 0.39 + 0.12, 0)
    const punta = new THREE.ConeGeometry(0.05, 0.18, 12)
    punta.translate(0, 0.9 + 0.09, 0)
    const asaDeFlecha = new THREE.CylinderGeometry(0.06, 0.06, 0.95, 6)
    asaDeFlecha.translate(0, 0.6, 0)
    aLiberar.push(vara, punta, asaDeFlecha)
    for (const geometria of [vara, punta]) {
      const malla = new THREE.Mesh(geometria, visible(COLOR[eje]))
      malla.renderOrder = 999
      flecha.add(malla)
    }
    const agarreDeFlecha = new THREE.Mesh(asaDeFlecha, invisible)
    agarreDeFlecha.userData.asa = { modo: 'mover', eje } satisfies AsaDelGizmo
    flecha.add(agarreDeFlecha)
    asas.push(agarreDeFlecha)
    orientar(flecha, eje)
    grupo.add(flecha)

    // --- aro: girar ---
    // El toro de three nace en el plano XY, o sea, alrededor de Z.
    const aro = new THREE.Group()
    const anillo = new THREE.TorusGeometry(0.72, 0.009, 6, 64)
    const asaDeAro = new THREE.TorusGeometry(0.72, 0.05, 6, 32)
    aLiberar.push(anillo, asaDeAro)
    const mallaDelAro = new THREE.Mesh(anillo, visible(COLOR[eje]))
    mallaDelAro.renderOrder = 999
    const agarreDeAro = new THREE.Mesh(asaDeAro, invisible)
    agarreDeAro.userData.asa = { modo: 'girar', eje } satisfies AsaDelGizmo
    aro.add(mallaDelAro, agarreDeAro)
    asas.push(agarreDeAro)
    if (eje === 'x') aro.rotation.y = Math.PI / 2
    else if (eje === 'y') aro.rotation.x = Math.PI / 2
    grupo.add(aro)
  }

  return {
    grupo,
    asas,
    liberar: () => {
      for (const cosa of aLiberar) cosa.dispose()
      grupo.removeFromParent()
    },
  }
}

/**
 * Tamaño del gizmo para que mida siempre lo mismo en pantalla: un sexto del
 * alto del lienzo, esté la cámara a un palmo o a sesenta metros (la vista
 * ortográfica la manda lejísimos con el campo muy cerrado).
 */
export function escalaDelGizmo(camara: THREE.PerspectiveCamera, donde: THREE.Vector3): number {
  const profundidad = Math.max(
    0.01,
    donde.clone().sub(camara.position).dot(camara.getWorldDirection(new THREE.Vector3())),
  )
  const altoDelCampo = 2 * profundidad * Math.tan((camara.fov * Math.PI) / 360)
  return altoDelCampo / 6
}
