import * as THREE from 'three'
import { juzgarTornillo, type TornilloPuesto } from '@/lib/fijacion'

/**
 * La placa y los tornillos sobre el hueso, dentro de la escena (D-169).
 *
 * El instrumento que el residente lleva en la mano es **una sola copia** del
 * modelo, que sigue al cursor y se descarta al soltarlo. Lo que se coloca sobre
 * el hueso es otra cosa: una copia propia, con su geometría y su material, que
 * se queda aunque el residente coja otro instrumento. Por eso se clona con los
 * recursos: compartir la geometría con la copia de la mano la dejaría sin
 * dibujar en cuanto esa se liberara.
 *
 * Todo el espacio es el del mundo del lienzo, donde una unidad mide
 * `milimetrosPorUnidad` mm. El marco de la placa es el de Blender pasado a glTF:
 * lo ancho en X, lo largo en −Z (el Y de Blender) y el grosor en +Y (su Z). Por
 * eso los agujeros, dados en el marco de Blender, se leen aquí como `(x, 0, −y)`.
 */

export interface PlacaColocada {
  grupo: THREE.Group
  nombre: string
  /** Los agujeros, en milímetros y en el marco de Blender: (ancho, largo). */
  agujerosMm: [number, number][]
  /** Hacia dónde mira la cara de arriba de la placa: la normal del hueso donde se apoyó. */
  normal: THREE.Vector3
  grosorMm: number
  /** Cuánto queda la placa separada del hueso en su punto de apoyo, en mm. */
  separadaDelHuesoMm: number
  /** Cuántos milímetros mide una unidad del mundo. */
  milimetrosPorUnidad: number
  /** Las caras de abajo y de arriba, en la coordenada Y local del modelo (metros). */
  yMinimoLocal: number
  yMaximoLocal: number
}

export interface TornilloEnEscena {
  grupo: THREE.Group
  datos: TornilloPuesto
}

export interface ImplantesEnEscena {
  placa?: PlacaColocada
  tornillos: Map<number, TornilloEnEscena>
}

export function crearImplantes(): ImplantesEnEscena {
  return { tornillos: new Map() }
}

/** Clona un modelo con su propia geometría y su propio material: sobrevive a quien lo copió. */
export function clonarConRecursos(origen: THREE.Object3D): THREE.Group {
  const copia = origen.clone(true) as THREE.Group
  copia.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry = m.geometry.clone()
    m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone()
  })
  copia.visible = true
  return copia
}

function soltarGrupo(grupo: THREE.Object3D) {
  grupo.removeFromParent()
  grupo.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose()
  })
}

export function quitarTornillos(imp: ImplantesEnEscena) {
  for (const t of imp.tornillos.values()) soltarGrupo(t.grupo)
  imp.tornillos.clear()
}

export function quitarImplantes(imp: ImplantesEnEscena) {
  quitarTornillos(imp)
  if (imp.placa) soltarGrupo(imp.placa.grupo)
  imp.placa = undefined
}

/**
 * Una base ortonormal con `y` y `z` dados (z se ajusta para ser perpendicular a y):
 * el cuaternión que lleva los ejes locales del modelo a esos del mundo.
 */
function orientar(y: THREE.Vector3, zAproximado: THREE.Vector3): THREE.Quaternion {
  const ejeY = y.clone().normalize()
  const ejeZ = zAproximado.clone().addScaledVector(ejeY, -zAproximado.dot(ejeY))
  if (ejeZ.lengthSq() < 1e-12) {
    // La dirección pedida es paralela a la normal: se elige cualquier perpendicular.
    ejeZ.copy(Math.abs(ejeY.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1))
    ejeZ.addScaledVector(ejeY, -ejeZ.dot(ejeY))
  }
  ejeZ.normalize()
  const ejeX = new THREE.Vector3().crossVectors(ejeY, ejeZ).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ejeX, ejeY, ejeZ))
}

/**
 * Apoya una placa sobre el hueso en `punto`, con su cara de arriba hacia `normal` y
 * su largo siguiendo el eje del hueso (`ejeDelHueso`, en el mundo).
 *
 * Devuelve la placa colocada, o `null` si el modelo no trae la posición de sus
 * agujeros: sin ellos no se sabe dónde atornillar, y es mejor decirlo que dejar
 * una placa en la que no se puede hacer nada.
 */
export function colocarPlaca(p: {
  escena: THREE.Scene
  plantilla: THREE.Object3D
  nombre: string
  agujerosMm: [number, number][]
  punto: THREE.Vector3
  normal: THREE.Vector3
  ejeDelHueso: THREE.Vector3
  milimetrosPorUnidad: number
  huesos: THREE.Object3D[]
  implantes: ImplantesEnEscena
}): PlacaColocada | null {
  if (p.agujerosMm.length === 0) return null
  const unidadesPorMm = 1 / p.milimetrosPorUnidad
  const grupo = clonarConRecursos(p.plantilla)
  grupo.position.set(0, 0, 0)
  grupo.quaternion.identity()
  // `plantilla` ya trae la escala de metros a unidades del mundo; la copia la conserva.
  grupo.updateMatrixWorld(true)
  const caja = new THREE.Box3().setFromObject(grupo)
  if (caja.isEmpty()) {
    soltarGrupo(grupo)
    return null
  }
  // El grupo está en el origen y sin girar: el mundo y lo local solo difieren en la escala.
  const escalaLocal = grupo.scale.y || 1
  const tamano = caja.getSize(new THREE.Vector3())
  const centro = caja.getCenter(new THREE.Vector3())
  const grosorMm = tamano.y / unidadesPorMm

  // El largo de la placa va por −Z (el Y de Blender): hacia donde apunta el eje del hueso.
  const q = orientar(p.normal, p.ejeDelHueso.clone().negate())
  grupo.quaternion.copy(q)
  // La cara de abajo sobre el hueso, y el centro del contorno en el punto señalado.
  const desdeElOrigen = new THREE.Vector3(centro.x, caja.min.y, centro.z).applyQuaternion(q)
  grupo.position.copy(p.punto).addScaledVector(p.normal, 0.2 * unidadesPorMm).sub(desdeElOrigen)
  p.escena.add(grupo)
  grupo.updateMatrixWorld(true)

  quitarImplantes(p.implantes)
  const placa: PlacaColocada = {
    grupo,
    nombre: p.nombre,
    agujerosMm: p.agujerosMm,
    normal: p.normal.clone().normalize(),
    grosorMm,
    separadaDelHuesoMm: 0,
    milimetrosPorUnidad: p.milimetrosPorUnidad,
    yMinimoLocal: caja.min.y / escalaLocal,
    yMaximoLocal: caja.max.y / escalaLocal,
  }
  // Cuánto queda separada del hueso en el agujero más cercano al punto de apoyo.
  const medida = medirBajoElAgujero(placa, indiceDelAgujeroMasCercano(placa, p.punto), p.huesos)
  placa.separadaDelHuesoMm = medida ? Math.max(0, medida.distanciaAlHuesoMm) : 0
  p.implantes.placa = placa
  return placa
}

/** El agujero cuyo centro, en el mundo, queda más cerca de `punto`. */
export function indiceDelAgujeroMasCercano(placa: PlacaColocada, punto: THREE.Vector3): number {
  let mejor = 0
  let mejorDistancia = Infinity
  placa.agujerosMm.forEach((_, i) => {
    const d = posicionDelAgujero(placa, i, 'abajo').distanceTo(punto)
    if (d < mejorDistancia) {
      mejorDistancia = d
      mejor = i
    }
  })
  return mejor
}

/** El centro de un agujero en el mundo, en la cara de arriba o en la de abajo de la placa. */
export function posicionDelAgujero(placa: PlacaColocada, indice: number, cara: 'arriba' | 'abajo'): THREE.Vector3 {
  const [x, y] = placa.agujerosMm[indice]
  // Los agujeros están en el marco del modelo, en mm; el modelo está en metros. La altura es la de la
  // caja del modelo, medida al colocarla, y no la del origen: el origen de Blender puede estar en
  // cualquier parte del grosor.
  const local = new THREE.Vector3(x / 1000, cara === 'arriba' ? placa.yMaximoLocal : placa.yMinimoLocal, -y / 1000)
  placa.grupo.updateMatrixWorld(true)
  return placa.grupo.localToWorld(local)
}

/**
 * Cuánto hay de la placa al hueso y cuánto hueso hay bajo un agujero.
 *
 * El rayo sale de la cara de abajo del agujero hacia el hueso, contra la normal.
 * Contra una malla cerrada cruza dos superficies: la cortical cercana y la
 * opuesta. De la primera sale la separación; la distancia entre las dos es el
 * espesor, que es lo que lee el medidor de profundidad.
 */
export function medirBajoElAgujero(
  placa: PlacaColocada,
  indice: number,
  huesos: THREE.Object3D[],
): { distanciaAlHuesoMm: number; espesorMm: number } | null {
  const unidadesPorMm = 1 / placa.milimetrosPorUnidad
  const origen = posicionDelAgujero(placa, indice, 'abajo')
  const alcance = 120 * unidadesPorMm
  const abajo = placa.normal.clone().negate()
  // La cortical cercana: el primer cruce yendo de la placa al hueso. Se sale medio milímetro
  // dentro de la placa para no depender de dónde caiga exactamente su cara de abajo.
  const salida = origen.clone().addScaledVector(placa.normal, 0.5 * unidadesPorMm)
  const cercana = new THREE.Raycaster(salida, abajo, 0, alcance).intersectObjects(huesos, false).find((g) => g.object.visible)
  if (!cercana) return null
  // La cortical opuesta: el primer cruce viniendo desde el otro lado. No se mira el segundo cruce del
  // mismo rayo porque three solo cuenta las caras que miran al rayo: al salir del hueso, la superficie
  // «mira» hacia dentro y no se ve. Desde abajo sí es una cara de frente.
  const desdeAbajo = origen.clone().addScaledVector(abajo, alcance)
  const opuesta = new THREE.Raycaster(desdeAbajo, placa.normal.clone(), 0, alcance).intersectObjects(huesos, false).find((g) => g.object.visible)
  if (!opuesta) return null
  const distanciaCercana = cercana.distance - 0.5 * unidadesPorMm
  const distanciaOpuesta = alcance - opuesta.distance
  if (distanciaOpuesta <= distanciaCercana) return null
  return {
    distanciaAlHuesoMm: distanciaCercana / unidadesPorMm,
    espesorMm: (distanciaOpuesta - distanciaCercana) / unidadesPorMm,
  }
}

/**
 * Pone un tornillo en un agujero de la placa, entrando por el eje del agujero
 * (perpendicular a la placa) y con el largo pedido.
 *
 * Devuelve lo que se pudo medir y juzgar, o `null` si no hay hueso bajo el agujero.
 */
export function colocarTornillo(p: {
  escena: THREE.Scene
  plantilla: THREE.Object3D
  placa: PlacaColocada
  agujero: number
  largoMm: number
  diametroMm: number
  largoDelModeloMm: number
  bloqueado: boolean
  huesos: THREE.Object3D[]
  implantes: ImplantesEnEscena
}): TornilloPuesto | null {
  const medida = medirBajoElAgujero(p.placa, p.agujero, p.huesos)
  if (!medida) return null
  const unidadesPorMm = 1 / p.placa.milimetrosPorUnidad
  const juicio = juzgarTornillo({
    largoMm: p.largoMm,
    grosorDeLaPlacaMm: p.placa.grosorMm,
    distanciaAlHuesoMm: medida.distanciaAlHuesoMm,
    espesorMm: medida.espesorMm,
  })

  // Un tornillo anterior en el mismo agujero se cambia por este.
  const anterior = p.implantes.tornillos.get(p.agujero)
  if (anterior) soltarGrupo(anterior.grupo)

  const grupo = clonarConRecursos(p.plantilla)
  const normal = p.placa.normal
  // El tornillo del modelo va con la punta en el origen y la cabeza a +Y: se escala a lo largo y se
  // orienta con la cabeza hacia fuera del hueso, que es la normal de la placa.
  const escalaBase = grupo.scale.x
  grupo.scale.set(escalaBase, escalaBase * (p.largoMm / p.largoDelModeloMm), escalaBase)
  grupo.quaternion.copy(orientar(normal, new THREE.Vector3().crossVectors(normal, new THREE.Vector3(1, 0, 0))))
  const cabeza = posicionDelAgujero(p.placa, p.agujero, 'arriba')
  grupo.position.copy(cabeza).addScaledVector(normal, -p.largoMm * unidadesPorMm)
  p.escena.add(grupo)
  grupo.updateMatrixWorld(true)

  const datos: TornilloPuesto = {
    agujero: p.agujero,
    largoMm: p.largoMm,
    diametroMm: p.diametroMm,
    bicortical: juicio.bicortical,
    puntaFueraMm: juicio.puntaFueraMm,
    espesorMm: medida.espesorMm,
    bloqueado: p.bloqueado,
    aviso: juicio.aviso,
  }
  p.implantes.tornillos.set(p.agujero, { grupo, datos })
  return datos
}

/** El agujero de la placa bajo el punto que el rayo tocó en ella, o `null` si cae lejos de todos. */
export function agujeroBajoElPunto(placa: PlacaColocada, punto: THREE.Vector3, maximoMm: number): number | null {
  const unidadesPorMm = 1 / placa.milimetrosPorUnidad
  let mejor: number | null = null
  let mejorDistancia = maximoMm * unidadesPorMm
  placa.agujerosMm.forEach((_, i) => {
    const centro = posicionDelAgujero(placa, i, 'arriba')
    // Distancia en el plano de la placa: sin contar la altura del punto sobre ella.
    const d = centro.clone().sub(punto)
    d.addScaledVector(placa.normal, -d.dot(placa.normal))
    if (d.length() <= mejorDistancia) {
      mejorDistancia = d.length()
      mejor = i
    }
  })
  return mejor
}
