'use client'

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import {
  metaDeNodo,
  metaDeRaiz,
  movimientoDelNodo,
  type AjustesDeInstrumento,
  type Cuaternion,
  type MetaDeNodo,
  type MetaDeRaiz,
  type Vector3,
} from '@/instrumental/modelo'
import { aplicarPose } from '@/instrumental/herramienta3d'

/**
 * El visor del instrumental, dentro del taller anatómico (D-165).
 *
 * Es el mismo visor en lo que importa —gira con el ratón, se selecciona con un
 * clic y lo seleccionado se pinta de naranja, se mueve y se gira con las asas,
 * tiene las mismas vistas, la vista ortográfica y los rayos X— pero no es
 * `VisorAtlas`: aquel está hecho para fundir miles de piezas en cinco mallas y
 * decidir qué se ve con una textura, y un instrumento es un archivo de media
 * docena de objetos con nombre. Cargarlo con el mismo `GLTFLoader` que usa el
 * simulador es además lo que garantiza que se ve aquí **como se verá allí**.
 *
 * Va en three.js imperativo, como el del atlas, y dibuja solo cuando algo
 * cambia: un instrumento quieto no tiene por qué calentar el portátil.
 *
 * Lo que sabe de un instrumento viene de `src/instrumental/modelo.ts`: las
 * articulaciones que declara y el eje de cada nodo que se mueve.
 */

export type HerramientaDelInstrumento = 'girar' | 'mover' | 'rotar'
export type LadoDeLaVista = 'frente' | 'lateral' | 'superior' | 'atras'

export interface ParteDelModelo {
  nombre: string
  /** El nodo del que cuelga, o `null` si cuelga de la raíz. */
  padre: string | null
  tipo: 'malla' | 'nodo'
  triangulos: number
  material: string
  color: string
  /** Si es un pivote, a qué articulación obedece. */
  articulacion: MetaDeNodo | null
}

export interface InfoDelModelo {
  partes: ParteDelModelo[]
  meta: MetaDeRaiz | null
  triangulos: number
  /** Medidas de la caja que lo abarca, en milímetros (x, y, z del archivo). */
  caja: Vector3
}

export interface MandoDelVisorDeInstrumento {
  encuadrar: () => void
  mirarDesde: (lado: LadoDeLaVista) => void
}

const NARANJA = new THREE.Color(0.95, 0.38, 0.0)

function esMalla(o: THREE.Object3D): o is THREE.Mesh {
  return (o as THREE.Mesh).isMesh === true
}

/** Dónde estaba cada nodo al cargar: sobre esa pose se aplican las articulaciones y los retoques. */
interface PoseBase {
  posicion: THREE.Vector3
  rotacion: THREE.Quaternion
}

export function VisorDeInstrumento({
  url,
  ajustes,
  articulaciones,
  seleccion,
  herramienta,
  puedeRetocar,
  rayosX,
  ortografica,
  alSeleccionar,
  alCargar,
  alMoverParte,
  mando,
}: {
  url: string | null
  ajustes: AjustesDeInstrumento | null
  /** El valor de cada articulación, en su unidad (grados o milímetros). */
  articulaciones: Record<string, number>
  seleccion: string | null
  herramienta: HerramientaDelInstrumento
  puedeRetocar: boolean
  rayosX: boolean
  ortografica: boolean
  alSeleccionar: (nombre: string | null) => void
  alCargar: (info: InfoDelModelo | null, error?: string) => void
  /** Se llama al soltar una asa: lo que la parte se ha corrido respecto del archivo. */
  alMoverParte: (nombre: string, retoque: { mover: Vector3; girar: Cuaternion }) => void
  mando?: Ref<MandoDelVisorDeInstrumento>
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const interno = useRef<{
    render: THREE.WebGLRenderer
    escena: THREE.Scene
    perspectiva: THREE.PerspectiveCamera
    ortografica: THREE.OrthographicCamera
    orbita: OrbitControls
    asas: TransformControls
    modelo: THREE.Object3D | null
    nodos: Map<string, THREE.Object3D>
    bases: Map<string, PoseBase>
    mallas: THREE.Mesh[]
    colores: Map<THREE.Mesh, THREE.Color>
    centro: THREE.Vector3
    radio: number
    pedido: boolean
    pedir: () => void
    camaraActiva: () => THREE.Camera
  } | null>(null)
  // La dirección que ya terminó de cargar (bien o mal): «cargando» se deduce de ella y no se escribe en el efecto.
  const [cargada, setCargada] = useState<string | null>(null)
  const cargando = !!url && cargada !== url

  // Lo último que pidió quien nos usa, para que las funciones de dentro del
  // montaje lean lo vigente sin tener que desmontar la escena.
  const vivo = useRef({ ajustes, articulaciones, seleccion, herramienta, puedeRetocar, rayosX, ortografica, alSeleccionar, alMoverParte })
  useEffect(() => {
    vivo.current = { ajustes, articulaciones, seleccion, herramienta, puedeRetocar, rayosX, ortografica, alSeleccionar, alMoverParte }
  })

  /** Pinta lo vigente sobre el modelo: retoques, articulaciones, selección, rayos X. Idempotente. */
  const aplicar = useRef(() => {})
  const aplicarLoVigente = () => {
    const ix = interno.current
    if (!ix) return
    const v = vivo.current
    // 1. La pose: la del archivo, más el retoque, más la articulación. Es la
    // misma cuenta que hace la escena del simulador (`herramienta3d.ts`).
    // Mientras se arrastra un asa, el nodo lo mueve la propia asa.
    aplicarPose(ix, v.ajustes, v.articulaciones, ix.asas.dragging ? ix.asas.object : null)
    // 2. El aspecto: color propio, selección y rayos X.
    const elegido = v.seleccion ? ix.nodos.get(v.seleccion) : null
    const pintadas = new Set<THREE.Object3D>()
    elegido?.traverse((o) => pintadas.add(o))
    for (const malla of ix.mallas) {
      const material = malla.material as THREE.MeshStandardMaterial
      const original = ix.colores.get(malla)
      if (!original) continue
      const retoque = v.ajustes?.partes?.[malla.name]
      material.color.copy(retoque?.color ? new THREE.Color(retoque.color) : original)
      const seleccionada = pintadas.has(malla)
      material.emissive.copy(seleccionada ? NARANJA : new THREE.Color(0, 0, 0))
      material.emissiveIntensity = seleccionada ? 0.55 : 0
      const transparente = v.rayosX && !seleccionada
      material.transparent = transparente
      material.opacity = transparente ? 0.28 : 1
      material.depthWrite = !transparente
    }
    // 3. Las asas, sobre lo seleccionado y solo si se puede retocar.
    if (elegido && v.puedeRetocar && v.herramienta !== 'girar') {
      ix.asas.setMode(v.herramienta === 'mover' ? 'translate' : 'rotate')
      if (ix.asas.object !== elegido) ix.asas.attach(elegido)
      ix.asas.getHelper().visible = true
    } else {
      ix.asas.detach()
      ix.asas.getHelper().visible = false
    }
    ix.pedir()
  }
  useEffect(() => {
    aplicar.current = aplicarLoVigente
  })

  /** Mira al instrumento desde un lado, a la misma distancia y con el objetivo en su centro. */
  const mirar = (lado: LadoDeLaVista) => {
    const ix = interno.current
    if (!ix) return
    const d = ix.radio * 4.2
    const dir =
      lado === 'frente'
        ? new THREE.Vector3(0.0, 0.0, 1)
        : lado === 'atras'
          ? new THREE.Vector3(0, 0, -1)
          : lado === 'lateral'
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0.0001)
    const posicion = ix.centro.clone().add(dir.multiplyScalar(d))
    // Una vista en tres cuartos al abrir, que enseña más que de frente.
    if (lado === 'frente') posicion.add(new THREE.Vector3(ix.radio * 0.9, ix.radio * 0.5, 0))
    for (const camara of [ix.perspectiva, ix.ortografica]) {
      camara.position.copy(posicion)
      camara.up.set(0, 1, 0)
      camara.lookAt(ix.centro)
    }
    ix.orbita.target.copy(ix.centro)
    ix.ortografica.zoom = 1
    ix.ortografica.updateProjectionMatrix()
    ix.orbita.update()
    ix.pedir()
  }

  // ------------------------------------------------------------ montaje
  useEffect(() => {
    const caja = contenedor.current
    if (!caja) return
    const render = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    render.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    render.outputColorSpace = THREE.SRGBColorSpace
    render.toneMapping = THREE.ACESFilmicToneMapping
    render.toneMappingExposure = 1.05
    caja.appendChild(render.domElement)
    render.domElement.style.touchAction = 'none'

    const escena = new THREE.Scene()
    // Un estudio de verdad: sin un entorno que reflejar, el acero se ve negro.
    const pmrem = new THREE.PMREMGenerator(render)
    escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    const sol = new THREE.DirectionalLight(0xffffff, 1.4)
    sol.position.set(0.6, 1.0, 0.8)
    escena.add(sol)
    escena.add(new THREE.AmbientLight(0xffffff, 0.35))

    const perspectiva = new THREE.PerspectiveCamera(30, 1, 0.001, 20)
    const orto = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 20)
    perspectiva.position.set(0.3, 0.2, 0.5)
    const activa = () => (vivo.current.ortografica ? orto : perspectiva)

    const orbita = new OrbitControls(perspectiva, render.domElement)
    orbita.enableDamping = false
    const asas = new TransformControls(perspectiva, render.domElement)
    asas.setSize(0.9)
    const ayudante = asas.getHelper()
    ayudante.visible = false
    escena.add(ayudante)

    const ix: NonNullable<typeof interno.current> = {
      render,
      escena,
      perspectiva,
      ortografica: orto,
      orbita,
      asas,
      modelo: null,
      nodos: new Map(),
      bases: new Map(),
      mallas: [],
      colores: new Map(),
      centro: new THREE.Vector3(),
      radio: 0.1,
      pedido: false,
      pedir: () => {},
      camaraActiva: activa,
    }
    interno.current = ix

    const pintar = () => {
      ix.pedido = false
      const camara = activa()
      render.render(escena, camara)
    }
    ix.pedir = () => {
      if (ix.pedido) return
      ix.pedido = true
      requestAnimationFrame(pintar)
    }
    orbita.addEventListener('change', ix.pedir)
    asas.addEventListener('change', ix.pedir)
    asas.addEventListener('dragging-changed', (e) => {
      orbita.enabled = !(e as unknown as { value: boolean }).value
      // Al soltar, lo que la parte se ha corrido respecto del archivo se le dice a quien retoca.
      if (!(e as unknown as { value: boolean }).value && asas.object) {
        const nodo = asas.object
        const nombre = nodo.name
        const base = ix.bases.get(nombre)
        if (!base) return
        const meta = metaDeNodo(nodo.userData)
        // Se quita lo que aportaba la articulación para dejar solo el retoque.
        const valor = meta ? (vivo.current.articulaciones[meta.mueve] ?? 0) : 0
        const mov = meta ? movimientoDelNodo(meta, valor) : { girar: [0, 0, 0, 1] as Cuaternion, mover: [0, 0, 0] as Vector3 }
        const sinArt = nodo.position.clone().sub(new THREE.Vector3(...mov.mover))
        const mover = sinArt.sub(base.posicion)
        const qArt = new THREE.Quaternion(...mov.girar).invert()
        const girar = qArt.multiply(nodo.quaternion.clone()).multiply(base.rotacion.clone().invert())
        vivo.current.alMoverParte(nombre, { mover: [mover.x, mover.y, mover.z], girar: [girar.x, girar.y, girar.z, girar.w] })
      }
    })

    // ----- tamaño
    const ajustar = () => {
      const ancho = Math.max(1, caja.clientWidth)
      const alto = Math.max(1, caja.clientHeight)
      render.setSize(ancho, alto, false)
      render.domElement.style.width = '100%'
      render.domElement.style.height = '100%'
      perspectiva.aspect = ancho / alto
      perspectiva.updateProjectionMatrix()
      const h = ix.radio * 1.6
      orto.left = -h * (ancho / alto)
      orto.right = h * (ancho / alto)
      orto.top = h
      orto.bottom = -h
      orto.updateProjectionMatrix()
      ix.pedir()
    }
    const observador = new ResizeObserver(ajustar)
    observador.observe(caja)
    ajustar()

    // ----- selección con el clic (un arrastre es girar la cámara, no elegir)
    let abajo: { x: number; y: number } | null = null
    const alBajar = (e: PointerEvent) => {
      abajo = { x: e.clientX, y: e.clientY }
    }
    const alSubir = (e: PointerEvent) => {
      if (!abajo || Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > 5) return
      if (asas.dragging) return
      const r = render.domElement.getBoundingClientRect()
      const rayo = new THREE.Raycaster()
      rayo.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), activa())
      const visibles = ix.mallas.filter((m) => {
        let o: THREE.Object3D | null = m
        while (o) {
          if (!o.visible) return false
          o = o.parent
        }
        return true
      })
      const golpe = rayo.intersectObjects(visibles, false)[0]
      vivo.current.alSeleccionar(golpe ? golpe.object.name : null)
    }
    render.domElement.addEventListener('pointerdown', alBajar)
    render.domElement.addEventListener('pointerup', alSubir)

    return () => {
      observador.disconnect()
      render.domElement.removeEventListener('pointerdown', alBajar)
      render.domElement.removeEventListener('pointerup', alSubir)
      asas.dispose()
      orbita.dispose()
      escena.traverse((o) => {
        if (esMalla(o)) {
          o.geometry.dispose()
          const m = o.material
          for (const mm of Array.isArray(m) ? m : [m]) mm.dispose()
        }
      })
      pmrem.dispose()
      render.dispose()
      render.domElement.remove()
      interno.current = null
    }
  }, [])

  // ------------------------------------------------------------ carga del modelo
  useEffect(() => {
    const ix = interno.current
    if (!ix) return
    let cancelado = false
    // Se quita el anterior
    if (ix.modelo) {
      ix.asas.detach()
      ix.escena.remove(ix.modelo)
      ix.modelo.traverse((o) => {
        if (esMalla(o)) {
          o.geometry.dispose()
          for (const mm of Array.isArray(o.material) ? o.material : [o.material]) mm.dispose()
        }
      })
      ix.modelo = null
    }
    ix.nodos.clear()
    ix.bases.clear()
    ix.mallas = []
    ix.colores.clear()
    if (!url) {
      alCargar(null)
      ix.pedir()
      return
    }
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (cancelado || !interno.current) return
        const raiz = gltf.scene
        const partes: ParteDelModelo[] = []
        let triangulos = 0
        let meta: MetaDeRaiz | null = null
        raiz.traverse((o) => {
          if (o === raiz) return
          const m = metaDeRaiz(o.userData)
          if (m && !meta) meta = m
          ix.nodos.set(o.name, o)
          ix.bases.set(o.name, { posicion: o.position.clone(), rotacion: o.quaternion.clone() })
          let tris = 0
          let material = ''
          let color = ''
          if (esMalla(o)) {
            // Cada malla con su propio material: el naranja de la selección no puede teñir a las demás.
            const mat = (Array.isArray(o.material) ? o.material[0] : o.material).clone() as THREE.MeshStandardMaterial
            o.material = mat
            ix.mallas.push(o)
            ix.colores.set(o, mat.color.clone())
            const indice = o.geometry.getIndex()
            tris = indice ? indice.count / 3 : (o.geometry.getAttribute('position')?.count ?? 0) / 3
            material = (Array.isArray(o.material) ? o.material[0] : o.material).name
            color = '#' + mat.color.getHexString()
          }
          triangulos += tris
          partes.push({
            nombre: o.name,
            padre: o.parent && o.parent !== raiz ? o.parent.name : null,
            tipo: esMalla(o) ? 'malla' : 'nodo',
            triangulos: Math.round(tris),
            material,
            color,
            articulacion: metaDeNodo(o.userData),
          })
        })
        // La raíz del instrumento también lleva su meta
        const metaRaiz = metaDeRaiz(raiz.children[0]?.userData) ?? meta
        ix.escena.add(raiz)
        ix.modelo = raiz
        const caja = new THREE.Box3().setFromObject(raiz)
        const tam = caja.getSize(new THREE.Vector3())
        caja.getCenter(ix.centro)
        ix.radio = Math.max(tam.length() / 2, 0.01)
        ix.perspectiva.near = ix.radio / 100
        ix.perspectiva.far = ix.radio * 100
        ix.perspectiva.updateProjectionMatrix()
        ix.ortografica.near = -ix.radio * 20
        ix.ortografica.far = ix.radio * 20
        ix.ortografica.updateProjectionMatrix()
        mirar('frente')
        setCargada(url)
        alCargar({ partes, meta: metaRaiz, triangulos: Math.round(triangulos), caja: [tam.x * 1000, tam.y * 1000, tam.z * 1000] })
        aplicar.current()
      },
      undefined,
      () => {
        if (cancelado) return
        setCargada(url)
        alCargar(null, 'No se pudo abrir el modelo: el archivo no es un .glb válido o no está en el servidor.')
      },
    )
    return () => {
      cancelado = true
    }
    // `alCargar` cambia en cada pintado de quien nos usa, y no es una razón para recargar el archivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Todo lo vigente se vuelve a pintar cuando cambia lo que lo decide.
  useEffect(() => {
    aplicar.current()
  }, [ajustes, articulaciones, seleccion, herramienta, puedeRetocar, rayosX])

  useEffect(() => {
    const ix = interno.current
    if (!ix) return
    const camara = ortografica ? ix.ortografica : ix.perspectiva
    if (ortografica) {
      ix.ortografica.position.copy(ix.perspectiva.position)
      ix.ortografica.quaternion.copy(ix.perspectiva.quaternion)
      ix.ortografica.zoom = 1
      ix.ortografica.updateProjectionMatrix()
    }
    ix.orbita.object = camara
    ix.asas.camera = camara
    ix.orbita.update()
    ix.pedir()
  }, [ortografica])

  useImperativeHandle(
    mando,
    () => ({
      encuadrar: () => mirar('frente'),
      mirarDesde: mirar,
    }),
    [],
  )

  return (
    <div className="atlas-lienzo" ref={contenedor} style={{ width: '100%', height: '100%' }}>
      {cargando ? (
        <div className="atlas-cargando" role="status">
          Cargando el modelo…
        </div>
      ) : null}
    </div>
  )
}
