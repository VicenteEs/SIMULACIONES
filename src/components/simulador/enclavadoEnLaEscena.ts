import * as THREE from 'three'
import { ejesDelPaciente, type EjeDelHueso } from '@/lib/posicionDelPaciente'
import { juzgarElBloqueo, orificiosDelClavo, posicionDelOrificioMm, type OrificioDelClavo, type Punteria } from '@/lib/bloqueoDelClavo'
import {
  LARGO_DE_LA_GUIA_MM,
  DIAMETRO_DE_LA_GUIA_MM,
  avanceMaximoDeLaGuia,
  guiaPasada,
  juzgarElAsiento,
  juzgarElCalibreDelClavo,
  juzgarElFresado,
  juzgarElLargoDelClavo,
  juzgarElPasoDeLaGuia,
  juzgarLaEntrada,
  type EstadoDelEnclavado,
  type JuicioDeLaEntrada,
  type ReduccionDelFoco,
} from '@/lib/enclavado'

/**
 * El enclavado endomedular, dentro de la escena (P-005 E4): la marca de la entrada, la guía de punta de oliva y el canal que va dejando la fresa.
 *
 * La **guía** es un alambre de acero que la fluoroscopia ve; el **canal fresado** es solo para enseñar —un tubo ámbar que se ve a través del hueso
 * y no entra en la fluoroscopia (`deInterfaz`)—, porque un canal ensanchado no absorbe rayos. Las reglas —si la entrada es buena, cuándo se atasca la
 * guía, cuánto hay que fresar— están en `src/lib/enclavado.ts`; aquí solo se mide sobre el hueso y se dibuja.
 */

export interface CanalMedido {
  origen: THREE.Vector3
  /** Hacia distal, unitario. */
  direccion: THREE.Vector3
  largoDelCanalMm: number
  /** A qué distancia de la entrada cruza la fractura; `null` si el hueso no está partido. */
  distanciaAlFocoMm: number | null
  desdeElExtremoMm: number
  desviacionMm: number
  anteriorMm: number
  /** Por dónde cruza un tornillo de bloqueo el clavo: perpendicular al canal, hacia el lado del paciente. Unitario. */
  transversal: THREE.Vector3
}

/**
 * Mide el canal desde un punto de entrada: cuánto falta al extremo proximal, cuánto se aparta de la línea del canal (el centro del fragmento proximal
 * en los otros dos ejes), hacia delante o hacia atrás de ella, y por dónde baja la guía hasta el extremo distal. `cajaDistal` es la del fragmento de
 * más abajo, o `null` si el hueso es uno solo.
 */
export function medirElCanal(p: {
  entrada: THREE.Vector3
  cajaProximal: THREE.Box3
  cajaDistal: THREE.Box3 | null
  eje: EjeDelHueso
  milimetrosPorUnidad: number
}): CanalMedido {
  const mm = p.milimetrosPorUnidad
  const e = ejesDelPaciente(p.eje)
  const hueso = new THREE.Vector3(...e.hueso)
  const frente = new THREE.Vector3(...e.frente)
  const lado = new THREE.Vector3(...e.lado)

  const centro = p.cajaProximal.getCenter(new THREE.Vector3())
  const extremoProximal = p.cajaProximal.max.dot(hueso)
  const extremoDistal = (p.cajaDistal ?? p.cajaProximal).min.dot(hueso)

  // La línea del canal: por el centro del fragmento proximal en los otros dos ejes, hasta el extremo distal.
  const fondo = centro.clone().addScaledVector(hueso, extremoDistal - centro.dot(hueso))
  const direccion = fondo.clone().sub(p.entrada).normalize()
  const largoDelCanalMm = p.entrada.distanceTo(fondo) * mm

  let distanciaAlFocoMm: number | null = null
  if (p.cajaDistal) {
    const foco = (p.cajaProximal.min.dot(hueso) + p.cajaDistal.max.dot(hueso)) / 2
    const alLargo = direccion.dot(hueso)
    if (Math.abs(alLargo) > 1e-6) {
      const s = (foco - p.entrada.dot(hueso)) / alLargo
      distanciaAlFocoMm = s > 0 ? s * mm : null
    }
  }

  const transversal = lado.clone().addScaledVector(direccion, -lado.dot(direccion)).normalize()

  return {
    origen: p.entrada.clone(),
    direccion,
    transversal,
    largoDelCanalMm,
    distanciaAlFocoMm,
    desdeElExtremoMm: (extremoProximal - p.entrada.dot(hueso)) * mm,
    desviacionMm: Math.abs(p.entrada.dot(lado) - centro.dot(lado)) * mm,
    anteriorMm: (p.entrada.dot(frente) - centro.dot(frente)) * mm,
  }
}

export interface EnclavadoEnLaEscena {
  /** La entrada con lo que se midió, y los trozos de hueso entre los que baja el canal: se vuelve a medir si el fragmento se mueve. */
  entrada: { canal: CanalMedido; juicio: JuicioDeLaEntrada; marca: THREE.Mesh; normal: THREE.Vector3; proximal: THREE.Object3D; distal: THREE.Object3D | null } | null
  guia: { avanceMm: number; atascada: boolean; aviso: string | null; grupo: THREE.Group; punta: THREE.Mesh; cuerpo: THREE.Mesh } | null
  dedoPuesto: boolean
  cabezasMm: number[]
  canal: THREE.Mesh | null
  guiaCambiada: boolean
  /** El arco de inserción montado en el clavo (P-005 E5). */
  arcoMontado: boolean
  /** El clavo puesto en el canal (P-005 E5): su punta está `avanceMm` de la entrada. */
  clavo: {
    diametroMm: number
    largoMm: number
    nombre: string
    avanceMm: number
    golpes: number
    avisoDelGolpe: string | null
    malla: THREE.Mesh
    /** Los orificios de bloqueo, y una marca oscura en cada uno para verlos a través del hueso (P-005 E6). */
    orificios: OrificioDelClavo[]
    marcas: THREE.Mesh[]
  } | null
  /** Los tornillos de bloqueo puestos por los orificios del clavo: de cuál, con qué puntería y qué número de tornillo es (P-005 E6). */
  bloqueos: { orificio: string; zona: OrificioDelClavo['zona']; tornilloId: number; punteria: Punteria; bloquea: boolean }[]
}

export function crearEnclavado(): EnclavadoEnLaEscena {
  return { entrada: null, guia: null, dedoPuesto: false, cabezasMm: [], canal: null, guiaCambiada: false, arcoMontado: false, clavo: null, bloqueos: [] }
}

const ejeY = new THREE.Vector3(0, 1, 0)
const haciaLaDireccion = new THREE.Quaternion()

/** Pone la marca de la entrada —un aro sobre la cortical— y la guarda con su medición y su juicio. Reemplaza la anterior. */
export function ponerLaEntrada(
  escena: THREE.Scene,
  e: EnclavadoEnLaEscena,
  punto: THREE.Vector3,
  normal: THREE.Vector3,
  canal: CanalMedido,
  milimetrosPorUnidad: number,
  trozos: { proximal: THREE.Object3D; distal: THREE.Object3D | null },
): JuicioDeLaEntrada {
  if (e.entrada) quitarObjeto(e.entrada.marca)
  const juicio = juzgarLaEntrada({ desdeElExtremoMm: canal.desdeElExtremoMm, desviacionMm: canal.desviacionMm, anteriorMm: canal.anteriorMm })
  const radio = 4 / milimetrosPorUnidad
  const marca = new THREE.Mesh(
    new THREE.RingGeometry(radio * 0.55, radio, 28),
    new THREE.MeshBasicMaterial({ color: juicio.buena ? 0x5be08a : 0xff7a59, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false }),
  )
  marca.renderOrder = 6
  marca.name = 'entrada-del-clavo'
  marca.userData.deInterfaz = true
  marca.position.copy(punto).addScaledVector(normal, 0.05 / milimetrosPorUnidad)
  marca.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize())
  escena.add(marca)
  e.entrada = { canal, juicio, marca, normal: normal.clone().normalize(), ...trozos }
  return juicio
}

/**
 * Vuelve a medir el canal con los trozos donde están ahora: si se redujo la fractura después de marcar la entrada, el foco está en otro sitio y el
 * canal tiene otro largo. La entrada no se mueve. Devuelve `true` si algo cambió.
 */
export function remedirElCanal(e: EnclavadoEnLaEscena, eje: EjeDelHueso, milimetrosPorUnidad: number): boolean {
  if (!e.entrada) return false
  const { proximal, distal, canal: antes } = e.entrada
  const nuevo = medirElCanal({
    entrada: antes.origen,
    cajaProximal: new THREE.Box3().setFromObject(proximal),
    cajaDistal: distal ? new THREE.Box3().setFromObject(distal) : null,
    eje,
    milimetrosPorUnidad,
  })
  const cambio = Math.abs(nuevo.largoDelCanalMm - antes.largoDelCanalMm) > 0.05 || (nuevo.distanciaAlFocoMm ?? -1) !== (antes.distanciaAlFocoMm ?? -1)
  // La medida de la entrada se conserva tal como se juzgó al marcarla; solo cambia lo que depende de dónde están los trozos.
  e.entrada.canal = { ...antes, direccion: nuevo.direccion, transversal: nuevo.transversal, largoDelCanalMm: nuevo.largoDelCanalMm, distanciaAlFocoMm: nuevo.distanciaAlFocoMm }
  return cambio
}

/** La guía de punta de oliva: un alambre de acero con una esfera en la punta (la oliva), que asoma de la entrada. */
function crearLaGuia(escena: THREE.Scene): NonNullable<EnclavadoEnLaEscena['guia']> {
  const material = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.85, roughness: 0.3 })
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), material)
  const punta = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), material)
  const grupo = new THREE.Group()
  grupo.name = 'guia-de-punta-de-oliva'
  grupo.add(cuerpo, punta)
  // Es de acero y se ve en la fluoroscopia: no es de interfaz. Pero no se pincha: no estorba al apuntar al hueso.
  grupo.traverse((o) => {
    o.raycast = () => {}
  })
  escena.add(grupo)
  return { avanceMm: 0, atascada: false, aviso: null, grupo, punta, cuerpo }
}

/** Cuánto de la guía se dibuja fuera de la entrada: lo que se agarra con la mano, no el metro entero. */
const ASOMA_DIBUJADO_MM = 220

/** Coloca la guía con su punta a `avanceMm` de la entrada, a lo largo del canal. */
export function colocarLaGuia(escena: THREE.Scene, e: EnclavadoEnLaEscena, avanceMm: number, milimetrosPorUnidad: number) {
  if (!e.entrada) return
  e.guia ??= crearLaGuia(escena)
  const g = e.guia
  const { origen, direccion } = e.entrada.canal
  const u = 1 / milimetrosPorUnidad
  g.avanceMm = avanceMm
  const radio = (DIAMETRO_DE_LA_GUIA_MM / 2) * u
  const cola = Math.min(ASOMA_DIBUJADO_MM, LARGO_DE_LA_GUIA_MM - avanceMm)
  const largo = Math.max(0.01, avanceMm + cola) * u
  haciaLaDireccion.setFromUnitVectors(ejeY, direccion)
  g.cuerpo.quaternion.copy(haciaLaDireccion)
  g.cuerpo.scale.set(radio, largo, radio)
  // El cuerpo va desde `cola` mm por fuera de la entrada (hacia −dirección) hasta la punta: su centro queda a medio camino.
  g.cuerpo.position.copy(origen).addScaledVector(direccion, ((avanceMm - cola) / 2) * u)
  g.punta.position.copy(origen).addScaledVector(direccion, avanceMm * u)
  g.punta.scale.setScalar(radio * 1.7)
  g.punta.visible = !e.guiaCambiada
}

/** La guía lisa que queda tras el tubo de intercambio: sin oliva y de otro tono. */
export function cambiarLaGuia(e: EnclavadoEnLaEscena) {
  e.guiaCambiada = true
  if (!e.guia) return
  e.guia.punta.visible = false
  ;(e.guia.cuerpo.material as THREE.MeshStandardMaterial).color.set(0xe9edf2)
}

/** Dibuja el canal ensanchado hasta `mayorMm` de diámetro y `largoMm` de largo, para enseñar lo que hizo la fresa. */
export function ponerElCanal(escena: THREE.Scene, e: EnclavadoEnLaEscena, mayorMm: number, largoMm: number, milimetrosPorUnidad: number) {
  if (!e.entrada || mayorMm <= 0) return
  const u = 1 / milimetrosPorUnidad
  if (!e.canal) {
    const malla = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthTest: false }),
    )
    malla.name = 'canal-fresado'
    // Un canal ensanchado no absorbe rayos: se ve en la escena, a través del hueso, y no en la fluoroscopia.
    malla.userData.deInterfaz = true
    malla.renderOrder = 5
    malla.raycast = () => {}
    escena.add(malla)
    e.canal = malla
  }
  const { origen, direccion } = e.entrada.canal
  haciaLaDireccion.setFromUnitVectors(ejeY, direccion)
  e.canal.quaternion.copy(haciaLaDireccion)
  e.canal.scale.set((mayorMm / 2) * u, largoMm * u, (mayorMm / 2) * u)
  e.canal.position.copy(origen).addScaledVector(direccion, (largoMm / 2) * u)
}

/**
 * Pone el clavo en el canal con su punta a `avanceMm` de la entrada, o lo mueve si ya está. Es un cilindro de titanio del calibre y el largo del clavo en la
 * mano; lo ve la fluoroscopia (no es de interfaz) y no se pincha.
 */
export function colocarElClavo(
  escena: THREE.Scene,
  e: EnclavadoEnLaEscena,
  medidas: { diametroMm: number; largoMm: number; nombre?: string },
  avanceMm: number,
  milimetrosPorUnidad: number,
) {
  if (!e.entrada) return
  if (!e.clavo) {
    const malla = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20), new THREE.MeshStandardMaterial({ color: 0x9fb0c4, metalness: 0.9, roughness: 0.28 }))
    malla.name = 'clavo-endomedular'
    malla.raycast = () => {}
    escena.add(malla)
    const nombre = medidas.nombre ?? ''
    e.clavo = { diametroMm: medidas.diametroMm, largoMm: medidas.largoMm, nombre, avanceMm, golpes: 0, avisoDelGolpe: null, malla, orificios: orificiosDelClavo(nombre), marcas: [] }
    for (const _ of e.clavo.orificios) {
      const marca = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16), new THREE.MeshBasicMaterial({ color: 0x1b1f27 }))
      marca.name = 'orificio-del-clavo'
      marca.raycast = () => {}
      escena.add(marca)
      e.clavo.marcas.push(marca)
    }
  }
  const c = e.clavo
  c.avanceMm = avanceMm
  const u = 1 / milimetrosPorUnidad
  const { origen, direccion } = e.entrada.canal
  haciaLaDireccion.setFromUnitVectors(ejeY, direccion)
  c.malla.quaternion.copy(haciaLaDireccion)
  c.malla.scale.set((c.diametroMm / 2) * u, c.largoMm * u, (c.diametroMm / 2) * u)
  // La punta está a `avance` de la entrada y el clavo se extiende hacia fuera: su centro queda `largo / 2` por detrás de la punta.
  c.malla.position.copy(origen).addScaledVector(direccion, (avanceMm - c.largoMm / 2) * u)
  // Cada orificio, una marca oscura que cruza el clavo de lado a lado.
  const { transversal } = e.entrada.canal
  c.orificios.forEach((o, i) => {
    const marca = c.marcas[i]
    if (!marca) return
    haciaLaDireccion.setFromUnitVectors(ejeY, transversal)
    marca.quaternion.copy(haciaLaDireccion)
    marca.scale.set(2.5 * u, (c.diametroMm + 0.6) * u, 2.5 * u)
    marca.position.copy(origen).addScaledVector(direccion, posicionDelOrificioMm(c, o) * u)
  })
}

export function quitarElClavo(e: EnclavadoEnLaEscena) {
  if (e.clavo) {
    quitarObjeto(e.clavo.malla)
    for (const m of e.clavo.marcas) quitarObjeto(m)
  }
  e.clavo = null
  // Los tornillos de bloqueo los quita quien los puso en la escena (`soltarLosBloqueos`): aquí solo se olvida la cuenta.
  e.bloqueos = []
}

function quitarObjeto(o: THREE.Object3D) {
  o.removeFromParent()
  o.traverse((x) => {
    const m = x as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((y) => y.dispose())
    else mat?.dispose()
  })
}

/** Lo que se ve en la escena se quita del todo: entrada, guía y canal. El estado vuelve al de partida. */
export function quitarTodoElEnclavado(e: EnclavadoEnLaEscena) {
  if (e.entrada) quitarObjeto(e.entrada.marca)
  if (e.guia) quitarObjeto(e.guia.grupo)
  if (e.canal) quitarObjeto(e.canal)
  quitarElClavo(e)
  e.entrada = null
  e.guia = null
  e.canal = null
  e.dedoPuesto = false
  e.cabezasMm = []
  e.guiaCambiada = false
  e.arcoMontado = false
}

/** Retira la guía (y el canal, que dependía de ella): la entrada se queda. */
export function retirarLaGuia(e: EnclavadoEnLaEscena) {
  if (e.guia) quitarObjeto(e.guia.grupo)
  if (e.canal) quitarObjeto(e.canal)
  // Sin guía ni fresado no hay canal preparado: el clavo que hubiera puesto tampoco tiene dónde estar.
  quitarElClavo(e)
  e.guia = null
  e.canal = null
  e.cabezasMm = []
  e.guiaCambiada = false
}

/** ¿Pasa la guía por el foco con la reducción de ahora? Si el hueso no está partido, siempre. */
export function juicioDelPasoDeLaGuia(e: EnclavadoEnLaEscena, reduccion: ReduccionDelFoco | null) {
  if (!e.entrada || e.entrada.canal.distanciaAlFocoMm === null || !reduccion) return { pasa: true, aviso: null }
  return juzgarElPasoDeLaGuia(reduccion, e.dedoPuesto)
}

/** Hasta dónde puede avanzar la guía con la reducción de ahora, en mm. */
export function avanceMaximo(e: EnclavadoEnLaEscena, reduccion: ReduccionDelFoco | null): number {
  if (!e.entrada) return 0
  const { largoDelCanalMm, distanciaAlFocoMm } = e.entrada.canal
  return avanceMaximoDeLaGuia({ largoDelCanalMm, distanciaAlFocoMm, pasa: juicioDelPasoDeLaGuia(e, reduccion).pasa })
}

function estadoDelClavo(e: EnclavadoEnLaEscena, c: NonNullable<EnclavadoEnLaEscena['clavo']>, largoDelCanalMm: number): NonNullable<EstadoDelEnclavado['clavo']> {
  const mayor = Math.max(0, ...e.cabezasMm)
  return {
    diametroMm: c.diametroMm,
    largoMm: c.largoMm,
    avanceMm: c.avanceMm,
    calibre: juzgarElCalibreDelClavo(c.diametroMm, mayor),
    largo: juzgarElLargoDelClavo(c.largoMm, largoDelCanalMm),
    asiento: juzgarElAsiento({ avanceMm: c.avanceMm, largoMm: c.largoMm, largoDelCanalMm }),
    golpes: c.golpes,
    avisoDelGolpe: c.avisoDelGolpe,
    orificios: c.orificios.map((o) => ({ id: o.id, zona: o.zona, dinamico: o.dinamico, punteria: e.bloqueos.find((b) => b.orificio === o.id)?.punteria ?? null })),
    bloqueo: juzgarElBloqueo({
      proximales: e.bloqueos.filter((b) => b.zona === 'proximal' && b.bloquea).length,
      distales: e.bloqueos.filter((b) => b.zona === 'distal' && b.bloquea).length,
    }),
  }
}

/** El estado del enclavado para la consola: lo medido, juzgado con las reglas. */
export function estadoDelEnclavado(e: EnclavadoEnLaEscena, reduccion: ReduccionDelFoco | null, clavoMm: number | null): EstadoDelEnclavado {
  const entrada = e.entrada
    ? { ...e.entrada.juicio, desdeElExtremoMm: e.entrada.canal.desdeElExtremoMm, desviacionMm: e.entrada.canal.desviacionMm }
    : null
  let guia: EstadoDelEnclavado['guia'] = null
  if (e.entrada && e.guia) {
    const { largoDelCanalMm, distanciaAlFocoMm } = e.entrada.canal
    const pasada = guiaPasada({ avanceMm: e.guia.avanceMm, distanciaAlFocoMm, largoDelCanalMm })
    guia = { avanceMm: e.guia.avanceMm, largoDelCanalMm, atascada: e.guia.atascada, aviso: e.guia.aviso, ...pasada }
  }
  return {
    entrada,
    guia,
    dedoPuesto: e.dedoPuesto,
    fresado: { ...juzgarElFresado(e.cabezasMm, clavoMm), cabezasMm: [...e.cabezasMm] },
    guiaCambiada: e.guiaCambiada,
    arcoMontado: e.arcoMontado,
    clavo: e.clavo && e.entrada ? estadoDelClavo(e, e.clavo, e.entrada.canal.largoDelCanalMm) : null,
  }
}
