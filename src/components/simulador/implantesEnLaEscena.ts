import * as THREE from 'three'
import { juzgarTornillo, type EstadoDelAgujero, type TornilloPuesto } from '@/lib/fijacion'
import { agujerosUniformes, avisoDeOrificios, orificiosValidos } from '@/lib/agujerosDeLaPlaca'
import type { RangosDelAjuste } from '@/lib/ejesAnatomicos'

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
  /**
   * Los agujeros salen del modelo (`true`) o se repartieron a partes iguales por la cantidad que escribió el editor
   * (`false`, P-004 E6): en el segundo caso la posición es una aproximación y el panel lo dice.
   */
  agujerosDelModelo: boolean
  /** Si el modelo y el instrumento no coinciden en cuántos agujeros hay: el aviso para el editor. */
  avisoDeOrificios: string | null
  /** Lo que mide la placa de ancho, en mm: de ahí salen los rangos del ajuste (P-004 E6). */
  anchoMm: number
  /** Cuánto se puede mover cada ajuste, según el hueso donde se apoyó (P-004 E6): lo pone quien conoce el hueso. */
  rangos?: RangosDelAjuste
  /** A qué sentido anatómico lleva el signo + de «de lado a lado»: 1 hacia anterior, −1 hacia posterior, 0 si no se sabe. */
  sentidoDelLado?: 1 | -1 | 0
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
  /** Cuánto mide el contorno de la placa a lo largo, en mm: de ahí salen los puntos de apoyo al asentarla. */
  largoMm: number
  /**
   * Dónde se apoyó la primera vez y hacia dónde iba el hueso: el origen de los tres ajustes (subir y bajar a lo largo,
   * rodear el hueso de lado a lado, angular) que se miden desde ahí (P-003 E6).
   */
  anclaje: { punto: THREE.Vector3; normal: THREE.Vector3; ejeDelHueso: THREE.Vector3 }
  /** Cuánto se ha movido desde el anclaje: a lo largo y de lado en mm, y el giro sobre la normal en grados. */
  ajuste: { largoMm: number; ladoMm: number; giroGrados: number }
  /** El punto de la caja del modelo (sin girar, en el mundo) que va sobre el punto de apoyo: se vuelve a usar al reasentar. */
  desdeElOrigen: THREE.Vector3
  /** La placa se dio por buena: ya no se mueve y solo entonces se perfora por sus agujeros. */
  fijada: boolean
  /** Lo que se perforó y se midió en cada agujero, por su índice. */
  agujeros: Map<number, EstadoDelAgujero>
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
  /** Cuántos orificios escribió el editor en el instrumento: reparte los agujeros cuando el modelo no los trae (P-004 E6). */
  orificios?: number | null
  punto: THREE.Vector3
  normal: THREE.Vector3
  ejeDelHueso: THREE.Vector3
  milimetrosPorUnidad: number
  huesos: THREE.Object3D[]
  implantes: ImplantesEnEscena
}): PlacaColocada | null {
  const orificios = orificiosValidos(p.orificios)
  // Sin agujeros en el modelo y sin una cantidad escrita no hay dónde atornillar: es mejor decirlo que dejar una placa
  // en la que no se puede hacer nada.
  if (p.agujerosMm.length === 0 && orificios === null) return null
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
  // Sin los agujeros del modelo, a partes iguales a lo largo de la caja (marco de Blender: x a lo ancho, y a lo largo, que
  // es −Z del modelo). El grupo está en el origen y sin girar, así que lo local es el mundo entre la escala.
  let agujerosMm = p.agujerosMm
  const delModelo = agujerosMm.length > 0
  if (!delModelo && orificios !== null) {
    const aMm = 1000 / escalaLocal
    agujerosMm = agujerosUniformes(orificios, {
      centroXMm: centro.x * aMm,
      yMinimoMm: -caja.max.z * aMm,
      yMaximoMm: -caja.min.z * aMm,
    })
    if (agujerosMm.length === 0) {
      soltarGrupo(grupo)
      return null
    }
  }

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
    agujerosMm,
    agujerosDelModelo: delModelo,
    avisoDeOrificios: delModelo ? avisoDeOrificios(agujerosMm.length, orificios) : null,
    anchoMm: tamano.x / unidadesPorMm,
    normal: p.normal.clone().normalize(),
    grosorMm,
    separadaDelHuesoMm: 0,
    milimetrosPorUnidad: p.milimetrosPorUnidad,
    yMinimoLocal: caja.min.y / escalaLocal,
    yMaximoLocal: caja.max.y / escalaLocal,
    largoMm: tamano.z / unidadesPorMm,
    anclaje: { punto: p.punto.clone(), normal: p.normal.clone().normalize(), ejeDelHueso: p.ejeDelHueso.clone().normalize() },
    ajuste: { largoMm: 0, ladoMm: 0, giroGrados: 0 },
    desdeElOrigen: desdeElOrigen.clone().applyQuaternion(q.clone().invert()),
    fijada: false,
    agujeros: new Map(),
  }
  // Cuánto queda separada del hueso en el agujero más cercano al punto de apoyo.
  const medida = medirBajoElAgujero(placa, indiceDelAgujeroMasCercano(placa, p.punto), p.huesos)
  placa.separadaDelHuesoMm = medida ? Math.max(0, medida.distanciaAlHuesoMm) : 0
  p.implantes.placa = placa
  return placa
}

/**
 * Vuelve a asentar la placa después de moverla (P-003 E6, pedido de Cristóbal: «moverla arriba y abajo, angularla,
 * sobre el hueso»): `largoMm` la sube o la baja a lo largo del hueso, `ladoMm` la rodea de lado a lado y `giroGrados`
 * la angula alrededor de la normal; los tres se miden desde donde se apoyó la primera vez.
 *
 * Tras cada movimiento se **vuelve a asentar**: tres rayos hacia el hueso (en el centro y a un lado y otro, a lo largo
 * de la placa) dan el apoyo y la normal, y la cara de abajo queda sobre el punto más alto, **nunca dentro del hueso**;
 * después se recalcula cuánto queda separada. Devuelve `false` (y no mueve nada) si bajo el punto pedido no hay hueso.
 */
export function ajustarPlaca(
  placa: PlacaColocada,
  huesos: THREE.Object3D[],
  ajuste: { largoMm: number; ladoMm: number; giroGrados: number },
): boolean {
  const unidades = 1 / placa.milimetrosPorUnidad
  const { punto, normal: normalInicial, ejeDelHueso } = placa.anclaje
  const lateral = new THREE.Vector3().crossVectors(normalInicial, ejeDelHueso).normalize()
  const objetivo = punto
    .clone()
    .addScaledVector(ejeDelHueso, ajuste.largoMm * unidades)
    .addScaledVector(lateral, ajuste.ladoMm * unidades)
  const hacia = normalInicial.clone().negate()
  const medio = Math.max(2, placa.largoMm * 0.35)
  const sondas = [0, medio, -medio].map((d) => objetivo.clone().addScaledVector(ejeDelHueso, d * unidades))
  const golpes: { punto: THREE.Vector3; normal: THREE.Vector3 }[] = []
  for (const origen of sondas) {
    const r = new THREE.Raycaster(origen.clone().addScaledVector(normalInicial, 60 * unidades), hacia, 0, 200 * unidades)
      .intersectObjects(huesos, false)
      .find((g) => g.object.visible)
    if (!r) continue
    const n = r.face ? r.face.normal.clone().transformDirection(r.object.matrixWorld) : normalInicial.clone()
    if (n.dot(normalInicial) < 0) n.negate()
    golpes.push({ punto: r.point.clone(), normal: n })
  }
  // El apoyo del centro es el que manda; sin él, con lo que haya.
  if (golpes.length === 0) return false
  const centro = golpes[0]
  const normal = golpes.reduce((a, g) => a.add(g.normal), new THREE.Vector3()).normalize()
  // El eje de la placa, sobre el plano de la normal nueva y girado lo que pida el ajuste.
  const eje = ejeDelHueso.clone().addScaledVector(normal, -ejeDelHueso.dot(normal)).normalize()
  eje.applyAxisAngle(normal, (ajuste.giroGrados * Math.PI) / 180)
  const q = orientar(normal, eje.clone().negate())
  placa.grupo.quaternion.copy(q)
  const base = centro.punto.clone().addScaledVector(normal, 0.2 * unidades)
  // La cara de abajo sobre el punto más alto de lo que toca: nunca dentro del hueso.
  let subir = 0
  for (const g of golpes) subir = Math.max(subir, g.punto.clone().sub(base).dot(normal))
  base.addScaledVector(normal, subir)
  placa.grupo.position.copy(base).sub(placa.desdeElOrigen.clone().applyQuaternion(q))
  placa.grupo.updateMatrixWorld(true)
  placa.normal.copy(normal)
  placa.ajuste = { ...ajuste }
  const medida = medirBajoElAgujero(placa, indiceDelAgujeroMasCercano(placa, centro.punto), huesos)
  placa.separadaDelHuesoMm = medida ? Math.max(0, medida.distanciaAlHuesoMm) : 0
  return true
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
  return medirAlLoLargoDeUnaLinea(posicionDelAgujero(placa, indice, 'abajo'), placa.normal.clone().negate(), placa.milimetrosPorUnidad, huesos)
}

/**
 * Lo mismo que `medirBajoElAgujero` para una línea cualquiera (P-004 E9, la trayectoria de dos clics): `origen` está sobre la
 * cortical o un poco por fuera y `haciaElHueso` es unitario. La separación al hueso de una trayectoria que arranca sobre la
 * cortical es casi cero.
 */
export function medirAlLoLargoDeUnaLinea(
  origen: THREE.Vector3,
  haciaElHueso: THREE.Vector3,
  milimetrosPorUnidad: number,
  huesos: THREE.Object3D[],
): { distanciaAlHuesoMm: number; espesorMm: number } | null {
  const unidadesPorMm = 1 / milimetrosPorUnidad
  const alcance = 120 * unidadesPorMm
  const abajo = haciaElHueso.clone().normalize()
  const arriba = abajo.clone().negate()
  // La cortical cercana: el primer cruce yendo de fuera al hueso. Se sale medio milímetro
  // por fuera para no depender de dónde caiga exactamente el origen.
  const salida = origen.clone().addScaledVector(arriba, 0.5 * unidadesPorMm)
  const cercana = new THREE.Raycaster(salida, abajo, 0, alcance).intersectObjects(huesos, false).find((g) => g.object.visible)
  if (!cercana) return null
  // La cortical opuesta: el primer cruce viniendo desde el otro lado. No se mira el segundo cruce del
  // mismo rayo porque three solo cuenta las caras que miran al rayo: al salir del hueso, la superficie
  // «mira» hacia dentro y no se ve. Desde abajo sí es una cara de frente.
  const desdeAbajo = origen.clone().addScaledVector(abajo, alcance)
  const opuesta = new THREE.Raycaster(desdeAbajo, arriba, 0, alcance).intersectObjects(huesos, false).find((g) => g.object.visible)
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
  /** El diámetro del modelo 3D: con otro elegido en la consola (P-004 E9) el tornillo se ensancha o se afina en proporción. */
  diametroDelModeloMm?: number
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
  const ancho = escalaBase * (p.diametroDelModeloMm && p.diametroDelModeloMm > 0 ? p.diametroMm / p.diametroDelModeloMm : 1)
  grupo.scale.set(ancho, escalaBase * (p.largoMm / p.largoDelModeloMm), ancho)
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

/**
 * Pone un tornillo en una trayectoria de dos clics, sin placa (P-004 E9): la cabeza sobre la entrada y la punta hacia dentro,
 * por la dirección de la trayectoria. Es el tornillo de tracción entre dos fragmentos, el interfragmentario. Se anota con un
 * número negativo (`id`) y `libre: true`: no hay agujero de placa que lo nombre.
 */
export function colocarTornilloEnLinea(p: {
  escena: THREE.Scene
  plantilla: THREE.Object3D
  id: number
  entrada: THREE.Vector3
  /** Hacia dónde avanza el tornillo, unitario. */
  haciaDentro: THREE.Vector3
  largoMm: number
  diametroMm: number
  diametroDelModeloMm?: number
  largoDelModeloMm: number
  bloqueado: boolean
  milimetrosPorUnidad: number
  huesos: THREE.Object3D[]
  implantes: ImplantesEnEscena
}): TornilloPuesto | null {
  const medida = medirAlLoLargoDeUnaLinea(p.entrada, p.haciaDentro, p.milimetrosPorUnidad, p.huesos)
  if (!medida) return null
  const unidadesPorMm = 1 / p.milimetrosPorUnidad
  const juicio = juzgarTornillo({
    largoMm: p.largoMm,
    grosorDeLaPlacaMm: 0,
    distanciaAlHuesoMm: medida.distanciaAlHuesoMm,
    espesorMm: medida.espesorMm,
  })
  const anterior = p.implantes.tornillos.get(p.id)
  if (anterior) soltarGrupo(anterior.grupo)

  const grupo = clonarConRecursos(p.plantilla)
  const haciaFuera = p.haciaDentro.clone().negate()
  const escalaBase = grupo.scale.x
  const ancho = escalaBase * (p.diametroDelModeloMm && p.diametroDelModeloMm > 0 ? p.diametroMm / p.diametroDelModeloMm : 1)
  grupo.scale.set(ancho, escalaBase * (p.largoMm / p.largoDelModeloMm), ancho)
  grupo.quaternion.copy(orientar(haciaFuera, new THREE.Vector3().crossVectors(haciaFuera, new THREE.Vector3(1, 0, 0))))
  // La punta en el origen del modelo: la cabeza queda en la entrada y la punta `largo` hacia dentro.
  grupo.position.copy(p.entrada).addScaledVector(p.haciaDentro, p.largoMm * unidadesPorMm)
  p.escena.add(grupo)
  grupo.updateMatrixWorld(true)

  const datos: TornilloPuesto = {
    agujero: p.id,
    libre: true,
    largoMm: p.largoMm,
    diametroMm: p.diametroMm,
    bicortical: juicio.bicortical,
    puntaFueraMm: juicio.puntaFueraMm,
    espesorMm: medida.espesorMm,
    bloqueado: p.bloqueado,
    aviso: juicio.aviso,
  }
  p.implantes.tornillos.set(p.id, { grupo, datos })
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
