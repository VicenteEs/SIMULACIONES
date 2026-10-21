import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { aplicarEntorno, prepararHerramienta, type HerramientaCargada } from '@/instrumental/herramienta3d'
import type { EjeLargo } from '@/lib/reduccion'
import type { EstadoDelAgujero, TornilloPuesto } from '@/lib/fijacion'
import type { ContornoDeLaPlaca } from '@/lib/contornoDeLaPlaca'
import type { RangosDelAjuste } from '@/lib/ejesAnatomicos'
import type { Huella } from '@/lib/periostio'
import type { PerforacionDeLaTrayectoria, CompresionTotal } from '@/lib/compresion'
import { ajustarPlaca, clonarConRecursos, colocarPlaca, crearImplantes } from './implantesEnLaEscena'
import { cambiarLaGuia, colocarElClavo, colocarLaGuia, crearEnclavado, medirElCanal, ponerElCanal, ponerLaEntrada } from './enclavadoEnLaEscena'
import { colocarBloque, crearInjerto, MAXIMO_DE_TROZOS } from './injertoEnLaEscena'
import { reponerHuellas, crearPeriostio } from './periostioEnLaEscena'
import type { Taller } from './LienzoQuirurgico'

/**
 * Todo lo que el residente pone en el paciente sobrevive a recargar la página (petición del dueño: «quiero que todo sobreviva a la recarga»).
 *
 * `serializarSesion` ya guardaba lo cortado, cosido y separado en `sessionStorage`. Faltaba **lo colocado sobre el hueso**: la placa y sus orificios perforados y medidos, los
 * tornillos (de placa, de trayectoria y de bloqueo del clavo, con cómo se apretaron), las agujas de Kirschner, el periostio despegado, el enclavado entero (entrada, guía, fresado,
 * clavo, arco, bloqueos), los injertos, los hoyos de las brocas, la trayectoria de dos clics y dónde quedó el fragmento reducido y los demás trozos movidos.
 *
 * Se guardan **transformaciones y medidas, no geometría**: la posición, el giro y la escala de cada pieza colocada, y los números con que se juzgó. Al volver se vuelve a cargar el
 * modelo de cada instrumento por su dirección y se le aplica lo guardado. Es una cuenta por cada cosa, y no una copia de la escena.
 */

type V3 = [number, number, number]
type Q4 = [number, number, number, number]
interface Transformacion {
  p: V3
  q: Q4
  s: V3
}
interface PoseDelNodo {
  p: V3
  r: V3
}

export interface LoColocadoGuardado {
  v: 1
  fragmento?: PoseDelNodo
  piezas?: { nombre: string; origen: PoseDelNodo; actual: PoseDelNodo }[]
  compresion?: CompresionTotal
  desviaciones?: [number, number][]
  siguienteTornilloLibre?: number
  limitadorNm?: number | null
  placa?: {
    url: string
    nombre: string
    agujerosMm: [number, number][]
    agujerosDelModelo: boolean
    orificios: number | null
    punto: V3
    normal: V3
    ejeDelHueso: V3
    contorno?: ContornoDeLaPlaca
    ajuste: { largoMm: number; ladoMm: number; giroGrados: number }
    fijada: boolean
    rangos?: RangosDelAjuste
    sentidoDelLado?: 1 | -1 | 0
    agujeros: [number, EstadoDelAgujero][]
  }
  tornillos?: { id: number; url: string; datos: TornilloPuesto; t: Transformacion }[]
  agujeros?: { radio: number; largo: number; t: Transformacion }[]
  alambres?: { radio: number; largo: number; t: Transformacion; profundidadMm: number; salidaPorLaOpuestaMm: number }[]
  trayectoria?: {
    entrada: V3
    salida: V3
    haciaDentro: V3
    estado: EstadoDelAgujero
    largoMm: number
    anguloConElEje: number
    perforaciones: PerforacionDeLaTrayectoria[]
  }
  periostio?: Huella[]
  enclavado?: {
    entrada?: { punto: V3; normal: V3; proximal: string; distal: string | null }
    guia?: { avanceMm: number; atascada: boolean; aviso: string | null }
    cabezasMm: number[]
    dedoPuesto: boolean
    guiaCambiada: boolean
    arcoMontado: boolean
    clavo?: { diametroMm: number; largoMm: number; nombre: string; avanceMm: number; golpes: number; avisoDelGolpe: string | null }
    bloqueos: { orificio: string; zona: 'proximal' | 'distal'; tornilloId: number; punteria: 'acierta' | 'roza' | 'falla'; bloquea: boolean }[]
  }
  injerto?: {
    esponjosoCc: number
    trozos: number[]
    bloque?: { centro: V3; eje: V3; largoMm: number }
  }
}

const redondear = (n: number) => Math.round(n * 1e6) / 1e6
const v3 = (v: THREE.Vector3): V3 => [redondear(v.x), redondear(v.y), redondear(v.z)]
const euler = (e: THREE.Euler): V3 => [redondear(e.x), redondear(e.y), redondear(e.z)]
const transformacion = (o: THREE.Object3D): Transformacion => ({
  p: v3(o.position),
  q: [redondear(o.quaternion.x), redondear(o.quaternion.y), redondear(o.quaternion.z), redondear(o.quaternion.w)],
  s: v3(o.scale),
})
const aplicarTransformacion = (o: THREE.Object3D, t: Transformacion) => {
  o.position.set(...t.p)
  o.quaternion.set(...t.q)
  o.scale.set(...t.s)
}
const vector = (a: V3) => new THREE.Vector3(a[0], a[1], a[2])

/** Los trozos de injerto y las huellas del periostio son miles de números que no cambian entre una lectura y la siguiente: se guardan en texto una vez por cantidad. */
let cacheDeTrozos: { cuenta: number; cc: number; datos: number[] } | null = null
let cacheDeHuellas: { cuenta: number; datos: Huella[] } | null = null

/**
 * Lo colocado sobre el paciente, en el formato de `sessionStorage`; `''` si no hay nada que recordar. Se llama cada pocos cientos de milisegundos, así que lo caro
 * (los trozos de injerto, las huellas) se reutiliza mientras no cambie su cantidad.
 */
export function serializarLoColocado(t: Taller): string {
  const imp = t.implantes
  const placa = imp?.placa
  const tornillos = [...(imp?.tornillos.entries() ?? [])].filter(([, x]) => x.url)
  const agujeros = t.agujeros ?? []
  const alambres = t.alambres ?? []
  const periostio = t.periostio && t.periostio.huellas.length > 0 ? t.periostio : null
  const e = t.enclavado
  const hayEnclavado = !!e && (!!e.entrada || e.arcoMontado || e.dedoPuesto)
  const inj = t.injerto && (t.injerto.esponjosoCc > 0 || t.injerto.bloque) ? t.injerto : null
  const piezasMovidas = [...(t.origenesDePiezas?.entries() ?? [])].filter(
    ([pieza, origen]) => pieza.position.distanceToSquared(origen.posicion) > 1e-12 || Math.abs(pieza.rotation.x - origen.rotacion.x) + Math.abs(pieza.rotation.y - origen.rotacion.y) + Math.abs(pieza.rotation.z - origen.rotacion.z) > 1e-9,
  )
  const fragmentoMovido =
    !!t.fragmento && !!t.origenDelFragmento &&
    (t.fragmento.position.distanceToSquared(t.origenDelFragmento.posicion) > 1e-12 ||
      Math.abs(t.fragmento.rotation.x - t.origenDelFragmento.rotacion.x) + Math.abs(t.fragmento.rotation.y - t.origenDelFragmento.rotacion.y) + Math.abs(t.fragmento.rotation.z - t.origenDelFragmento.rotacion.z) > 1e-9)

  const hayAlgo = !!placa || tornillos.length > 0 || agujeros.length > 0 || alambres.length > 0 || !!periostio || hayEnclavado || !!inj || !!t.trayectoriaDelTornillo || piezasMovidas.length > 0 || fragmentoMovido || !!t.limitadorNm
  if (!hayAlgo) return ''

  const datos: LoColocadoGuardado = { v: 1 }
  if (t.fragmento) datos.fragmento = { p: v3(t.fragmento.position), r: euler(t.fragmento.rotation) }
  if (piezasMovidas.length > 0) {
    datos.piezas = piezasMovidas.map(([pieza, origen]) => ({
      nombre: pieza.name,
      origen: { p: v3(origen.posicion), r: euler(origen.rotacion) },
      actual: { p: v3(pieza.position), r: euler(pieza.rotation) },
    }))
  }
  if (t.compresion && t.compresion.mm > 0) datos.compresion = { mm: t.compresion.mm, tecnicas: [...t.compresion.tecnicas] }
  if (t.desviaciones && t.desviaciones.size > 0) datos.desviaciones = [...t.desviaciones.entries()]
  const siguiente = (t as { siguienteTornilloLibre?: number }).siguienteTornilloLibre
  if (siguiente !== undefined) datos.siguienteTornilloLibre = siguiente
  if (t.limitadorNm) datos.limitadorNm = t.limitadorNm

  if (placa && placa.url) {
    datos.placa = {
      url: placa.url,
      nombre: placa.nombre,
      agujerosMm: placa.agujerosMm,
      agujerosDelModelo: placa.agujerosDelModelo,
      orificios: placa.orificiosEscritos ?? null,
      punto: v3(placa.anclaje.punto),
      normal: v3(placa.anclaje.normal),
      ejeDelHueso: v3(placa.anclaje.ejeDelHueso),
      contorno: placa.contorno?.contorno,
      ajuste: { ...placa.ajuste },
      fijada: placa.fijada,
      rangos: placa.rangos,
      sentidoDelLado: placa.sentidoDelLado,
      agujeros: [...placa.agujeros.entries()],
    }
  }
  if (tornillos.length > 0) {
    datos.tornillos = tornillos.map(([id, x]) => ({ id, url: x.url as string, datos: { ...x.datos }, t: transformacion(x.grupo) }))
  }
  const cilindro = (m: THREE.Mesh) => {
    const g = m.geometry as THREE.CylinderGeometry
    return { radio: g.parameters.radiusTop, largo: g.parameters.height, t: transformacion(m) }
  }
  if (agujeros.length > 0) datos.agujeros = agujeros.map(cilindro)
  if (alambres.length > 0) datos.alambres = alambres.map((a) => ({ ...cilindro(a.malla), profundidadMm: a.profundidadMm, salidaPorLaOpuestaMm: a.salidaPorLaOpuestaMm }))
  const tray = t.trayectoriaDelTornillo
  if (tray) {
    datos.trayectoria = {
      entrada: v3(tray.entrada),
      salida: v3(tray.salida),
      haciaDentro: v3(tray.haciaDentro),
      estado: tray.estado,
      largoMm: tray.largoMm,
      anguloConElEje: tray.anguloConElEje,
      perforaciones: [...tray.perforaciones],
    }
  }
  if (periostio) {
    if (!cacheDeHuellas || cacheDeHuellas.cuenta !== periostio.huellas.length) {
      cacheDeHuellas = { cuenta: periostio.huellas.length, datos: periostio.huellas.map((h) => ({ ...h })) }
    }
    datos.periostio = cacheDeHuellas.datos
  }
  if (e && hayEnclavado) {
    datos.enclavado = {
      entrada: e.entrada
        ? { punto: v3(e.entrada.canal.origen), normal: v3(e.entrada.normal), proximal: e.entrada.proximal.name, distal: e.entrada.distal?.name ?? null }
        : undefined,
      guia: e.guia ? { avanceMm: e.guia.avanceMm, atascada: e.guia.atascada, aviso: e.guia.aviso } : undefined,
      cabezasMm: [...e.cabezasMm],
      dedoPuesto: e.dedoPuesto,
      guiaCambiada: e.guiaCambiada,
      arcoMontado: e.arcoMontado,
      clavo: e.clavo
        ? { diametroMm: e.clavo.diametroMm, largoMm: e.clavo.largoMm, nombre: e.clavo.nombre, avanceMm: e.clavo.avanceMm, golpes: e.clavo.golpes, avisoDelGolpe: e.clavo.avisoDelGolpe }
        : undefined,
      bloqueos: e.bloqueos.map((b) => ({ ...b })),
    }
  }
  if (inj) {
    if (!cacheDeTrozos || cacheDeTrozos.cuenta !== inj.cuenta) {
      cacheDeTrozos = { cuenta: inj.cuenta, cc: inj.esponjosoCc, datos: Array.from(inj.trozos.instanceMatrix.array.slice(0, inj.cuenta * 16), redondear) }
    }
    const eje = new THREE.Vector3(0, 1, 0)
    datos.injerto = {
      esponjosoCc: inj.esponjosoCc,
      trozos: cacheDeTrozos.datos,
      bloque: inj.bloque ? { centro: v3(inj.bloque.malla.position), eje: v3(eje.applyQuaternion(inj.bloque.malla.quaternion)), largoMm: inj.bloque.largoMm } : undefined,
    }
  }
  return JSON.stringify(datos)
}

function cargarPlantilla(url: string, escala: number, entorno: THREE.Texture | null): Promise<HerramientaCargada | null> {
  return new Promise((resolver) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const h = prepararHerramienta(gltf.scene)
        h.raiz.scale.setScalar(escala)
        h.raiz.visible = false
        aplicarEntorno(h, entorno)
        resolver(h)
      },
      undefined,
      () => resolver(null),
    )
  })
}

export interface ContextoDeLaRestauracion {
  t: Taller
  /** Una unidad del mundo mide esto en mm. */
  milimetrosPorUnidad: number
  ejeLargo: EjeLargo
  /** Las mallas de hueso visibles, para asentar la placa. */
  huesos: () => THREE.Object3D[]
  /** Falso si el lienzo se desmontó mientras tanto: se deja de poner cosas en una escena que ya no existe. */
  vivo: () => boolean
}

/**
 * Vuelve a poner en la escena lo guardado. Lo que no necesita modelos de instrumento (el fragmento, los hoyos, el periostio, el enclavado, los injertos) se pone en el acto; la placa y los tornillos
 * esperan a que se abran sus modelos. Devuelve `true` si había algo que restaurar.
 */
export async function restaurarLoColocado(texto: string, c: ContextoDeLaRestauracion): Promise<boolean> {
  let g: LoColocadoGuardado
  try {
    g = JSON.parse(texto) as LoColocadoGuardado
  } catch {
    return false
  }
  if (!g || g.v !== 1) return false
  const { t } = c
  const escena = t.escena
  if (!escena || !t.raiz) return false
  const mm = c.milimetrosPorUnidad
  const buscar = (nombre: string) => escena.getObjectByName(nombre) ?? null

  // --- dónde quedó el fragmento y los demás trozos --------------------------------------------------------------
  if (g.fragmento && t.fragmento) {
    t.fragmento.position.set(...g.fragmento.p)
    t.fragmento.rotation.set(...g.fragmento.r)
  }
  for (const q of g.piezas ?? []) {
    const pieza = buscar(q.nombre)
    if (!pieza) continue
    ;(t.origenesDePiezas ??= new Map()).set(pieza, { posicion: vector(q.origen.p), rotacion: new THREE.Euler(...q.origen.r) })
    pieza.position.set(...q.actual.p)
    pieza.rotation.set(...q.actual.r)
  }
  if (g.compresion) t.compresion = { mm: g.compresion.mm, tecnicas: [...g.compresion.tecnicas] } as CompresionTotal
  if (g.desviaciones) t.desviaciones = new Map(g.desviaciones)
  if (g.siguienteTornilloLibre !== undefined) (t as { siguienteTornilloLibre?: number }).siguienteTornilloLibre = g.siguienteTornilloLibre
  if (g.limitadorNm) t.limitadorNm = g.limitadorNm
  escena.updateMatrixWorld(true)

  // --- los hoyos de las brocas y las agujas de Kirschner ----------------------------------------------------------
  for (const a of g.agujeros ?? []) {
    const malla = new THREE.Mesh(new THREE.CylinderGeometry(a.radio, a.radio, a.largo, 16, 1, false), new THREE.MeshBasicMaterial({ color: 0x120909 }))
    aplicarTransformacion(malla, a.t)
    malla.raycast = () => {}
    malla.userData.agujero = true
    escena.add(malla)
    ;(t.agujeros ??= []).push(malla)
  }
  for (const a of g.alambres ?? []) {
    const malla = new THREE.Mesh(
      new THREE.CylinderGeometry(a.radio, a.radio, a.largo, 10, 1, false),
      new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.85, roughness: 0.3 }),
    )
    aplicarTransformacion(malla, a.t)
    malla.raycast = () => {}
    malla.name = 'alambre-de-kirschner'
    escena.add(malla)
    ;(t.alambres ??= []).push({ malla, profundidadMm: a.profundidadMm, salidaPorLaOpuestaMm: a.salidaPorLaOpuestaMm })
  }

  // --- la trayectoria de dos clics ---------------------------------------------------------------------------------
  if (g.trayectoria) {
    const q = g.trayectoria
    const linea = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([vector(q.entrada), vector(q.salida)]),
      new THREE.LineBasicMaterial({ color: 0xffd34d, depthTest: false, transparent: true }),
    )
    linea.renderOrder = 998
    linea.raycast = () => {}
    linea.userData.deInterfaz = true
    escena.add(linea)
    t.trayectoriaDelTornillo = {
      entrada: vector(q.entrada),
      salida: vector(q.salida),
      haciaDentro: vector(q.haciaDentro),
      linea,
      estado: q.estado,
      largoMm: q.largoMm,
      anguloConElEje: q.anguloConElEje,
      perforaciones: [...q.perforaciones],
    }
  }

  // --- el periostio despegado ----------------------------------------------------------------------------------------
  if (g.periostio && g.periostio.length > 0) {
    t.periostio ??= crearPeriostio(escena)
    reponerHuellas(t.periostio, g.periostio, mm)
  }

  // --- los injertos ----------------------------------------------------------------------------------------------------
  if (g.injerto) {
    const inj = (t.injerto ??= crearInjerto(escena))
    const cuenta = Math.min(MAXIMO_DE_TROZOS, Math.floor(g.injerto.trozos.length / 16))
    inj.trozos.instanceMatrix.array.set(g.injerto.trozos.slice(0, cuenta * 16))
    inj.cuenta = cuenta
    inj.trozos.count = cuenta
    inj.trozos.instanceMatrix.needsUpdate = true
    inj.esponjosoCc = g.injerto.esponjosoCc
    if (g.injerto.bloque) colocarBloque(escena, inj, vector(g.injerto.bloque.centro), vector(g.injerto.bloque.eje), g.injerto.bloque.largoMm, mm)
  }

  // --- el enclavado -----------------------------------------------------------------------------------------------------
  if (g.enclavado) {
    const q = g.enclavado
    const e = (t.enclavado ??= crearEnclavado())
    if (q.entrada) {
      const proximal = buscar(q.entrada.proximal)
      const distal = q.entrada.distal ? buscar(q.entrada.distal) : null
      if (proximal) {
        const punto = vector(q.entrada.punto)
        const canal = medirElCanal({
          entrada: punto,
          cajaProximal: new THREE.Box3().setFromObject(proximal),
          cajaDistal: distal ? new THREE.Box3().setFromObject(distal) : null,
          eje: c.ejeLargo,
          milimetrosPorUnidad: mm,
        })
        ponerLaEntrada(escena, e, punto, vector(q.entrada.normal), canal, mm, { proximal, distal })
        if (q.guia) {
          colocarLaGuia(escena, e, q.guia.avanceMm, mm)
          if (e.guia) {
            e.guia.atascada = q.guia.atascada
            e.guia.aviso = q.guia.aviso
          }
        }
        e.cabezasMm = [...q.cabezasMm]
        if (e.cabezasMm.length > 0 && e.guia) ponerElCanal(escena, e, Math.max(...e.cabezasMm), e.guia.avanceMm, mm)
        if (q.guiaCambiada) cambiarLaGuia(e)
        if (q.clavo) {
          colocarElClavo(escena, e, { diametroMm: q.clavo.diametroMm, largoMm: q.clavo.largoMm, nombre: q.clavo.nombre }, q.clavo.avanceMm, mm)
          if (e.clavo) {
            e.clavo.golpes = q.clavo.golpes
            e.clavo.avisoDelGolpe = q.clavo.avisoDelGolpe
          }
        }
      }
    }
    e.dedoPuesto = q.dedoPuesto
    e.arcoMontado = q.arcoMontado
    e.bloqueos = q.bloqueos.map((b) => ({ ...b }))
  }

  // --- la placa y los tornillos: esperan a sus modelos ------------------------------------------------------------------
  const urls = [...new Set([g.placa?.url, ...(g.tornillos ?? []).map((x) => x.url)].filter((x): x is string => !!x))]
  if (urls.length > 0) {
    const plantillas = new Map<string, HerramientaCargada | null>()
    await Promise.all(
      urls.map(async (url) => {
        plantillas.set(url, await cargarPlantilla(url, 1000 / mm, t.entorno ?? null))
      }),
    )
    if (!c.vivo()) return true
    const imp = (t.implantes ??= crearImplantes())
    if (g.placa) {
      const plantilla = plantillas.get(g.placa.url)
      if (plantilla) {
        const placa = colocarPlaca({
          escena,
          plantilla: plantilla.raiz,
          nombre: g.placa.nombre,
          agujerosMm: g.placa.agujerosDelModelo ? g.placa.agujerosMm : [],
          orificios: g.placa.orificios,
          punto: vector(g.placa.punto),
          normal: vector(g.placa.normal),
          ejeDelHueso: vector(g.placa.ejeDelHueso),
          milimetrosPorUnidad: mm,
          huesos: c.huesos(),
          implantes: imp,
          contorno: g.placa.contorno,
          url: g.placa.url,
        })
        if (placa) {
          const a = g.placa.ajuste
          if (a.largoMm !== 0 || a.ladoMm !== 0 || a.giroGrados !== 0) ajustarPlaca(placa, c.huesos(), a)
          placa.fijada = g.placa.fijada
          placa.rangos = g.placa.rangos
          placa.sentidoDelLado = g.placa.sentidoDelLado
          placa.agujeros = new Map(g.placa.agujeros)
        }
      }
    }
    for (const q of g.tornillos ?? []) {
      const plantilla = plantillas.get(q.url)
      if (!plantilla) continue
      const grupo = clonarConRecursos(plantilla.raiz, true)
      aplicarTransformacion(grupo, q.t)
      escena.add(grupo)
      grupo.updateMatrixWorld(true)
      imp.tornillos.set(q.id, { grupo, datos: { ...q.datos }, url: q.url })
    }
  }
  t.pedirDibujo?.()
  return true
}

