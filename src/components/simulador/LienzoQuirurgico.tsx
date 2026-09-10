'use client'

import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * El lienzo de la consola quirúrgica.
 *
 * Va en three.js imperativo y no en react-three-fiber, igual que el visor del
 * atlas y por el mismo motivo: aquí se cambian materiales, se mueve un nodo con
 * el ratón y se dibuja sobre la superficie. Envolver eso en el reconciliador de
 * React es pelearse con él en cada fotograma para no ganar nada.
 *
 * Lo que hace posible todo esto es que el modelo llega **ya partido** desde
 * Blender, con cada trozo como un objeto con nombre. Cortar geometría en el
 * navegador sería otro proyecto; buscar un nodo por su nombre y moverlo son dos
 * líneas. Esa decisión es la que separa esta consola de una imposible.
 *
 * Dibuja solo cuando algo cambia. Un bucle continuo calienta el portátil de
 * quien está mirando una pantalla quieta.
 */

export type Modo = 'orbitar' | 'trazar' | 'mover'

export interface Punto3 {
  x: number
  y: number
  z: number
}

export interface MandoDelLienzo {
  /** Enciende o apaga los nodos indicados. */
  mostrar: (nodos: string[] | null) => void
  /** Coloca el fragmento móvil en un desplazamiento dado, en unidades del archivo. */
  colocarFragmento: (posicion: Punto3, giros: Punto3) => void
  /**
   * Gira el fragmento sin moverlo de sitio.
   *
   * Va aparte de `colocarFragmento` porque la angulación se corrige con
   * controles propios y no arrastrando: el ratón traslada, que es un gesto de
   * dos ejes, y una rotación tiene tres. Sin esto, un caso que empieza con
   * angulación no se podría reducir nunca por mucho que se arrastrara.
   */
  girarFragmento: (giros: Punto3) => void
  /** Dónde está el fragmento ahora, en unidades del archivo y en grados. */
  estadoDelFragmento: () => { posicion: Punto3; giros: Punto3 }
  /** Borra el trazo dibujado. */
  borrarTrazo: () => void
  /** Encuadra lo que esté visible. */
  encuadrar: () => void
  /** Los nombres de los objetos que trae el archivo. */
  nodosDelModelo: () => string[]
}

export interface PiezaDelCaso {
  nodo: string
  rol: 'piel' | 'musculo' | 'hueso' | 'fragmento' | 'implante'
  etiqueta?: string | null
}

const EJES = ['x', 'y', 'z'] as const
const grados = (rad: number) => (rad * 180) / Math.PI
const radianes = (g: number) => (g * Math.PI) / 180

export function LienzoQuirurgico({
  url,
  piezas,
  modo,
  fluoroscopia,
  alTrazar,
  alMoverFragmento,
  alCargar,
  mando,
}: {
  url: string
  piezas: PiezaDelCaso[]
  modo: Modo
  fluoroscopia: boolean
  /** Se llama con el trazo completo cada vez que cambia. */
  alTrazar?: (puntos: Punto3[]) => void
  /** Se llama al soltar el fragmento, con su estado. */
  alMoverFragmento?: (posicion: Punto3, giros: Punto3) => void
  /** Se llama una vez, cuando el archivo termina de cargar. */
  alCargar?: () => void
  mando?: RefObject<MandoDelLienzo | null>
}) {
  const lienzo = useRef<HTMLDivElement>(null)

  const taller = useRef<{
    render?: THREE.WebGLRenderer
    escena?: THREE.Scene
    camara?: THREE.PerspectiveCamera
    controles?: OrbitControls
    raiz?: THREE.Object3D
    fragmento?: THREE.Object3D
    trazo?: THREE.Line
    puntosDelTrazo: Punto3[]
    materialesOriginales: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
    pedirDibujo?: () => void
  }>({ puntosDelTrazo: [], materialesOriginales: new Map() })

  // Lo que leen los manejadores sin volver a montar la escena.
  const ultimas = useRef({ modo, piezas, fluoroscopia, alTrazar, alMoverFragmento, alCargar })
  useEffect(() => {
    ultimas.current = { modo, piezas, fluoroscopia, alTrazar, alMoverFragmento, alCargar }
  })

  useImperativeHandle(mando, () => ({
    mostrar: (nodos) => {
      const raiz = taller.current.raiz
      if (!raiz) return
      raiz.traverse((objeto) => {
        if (!(objeto as THREE.Mesh).isMesh) return
        objeto.visible = nodos === null || nodos.includes(objeto.name)
      })
      taller.current.pedirDibujo?.()
    },

    colocarFragmento: (posicion, giros) => {
      const fragmento = taller.current.fragmento
      if (!fragmento) return
      fragmento.position.set(posicion.x, posicion.y, posicion.z)
      fragmento.rotation.set(radianes(giros.x), radianes(giros.y), radianes(giros.z))
      taller.current.pedirDibujo?.()
    },

    girarFragmento: (giros) => {
      const fragmento = taller.current.fragmento
      if (!fragmento) return
      fragmento.rotation.set(radianes(giros.x), radianes(giros.y), radianes(giros.z))
      taller.current.pedirDibujo?.()
    },

    estadoDelFragmento: () => {
      const f = taller.current.fragmento
      if (!f) return { posicion: { x: 0, y: 0, z: 0 }, giros: { x: 0, y: 0, z: 0 } }
      return {
        posicion: { x: f.position.x, y: f.position.y, z: f.position.z },
        giros: { x: grados(f.rotation.x), y: grados(f.rotation.y), z: grados(f.rotation.z) },
      }
    },

    borrarTrazo: () => {
      taller.current.puntosDelTrazo = []
      dibujarTrazo(taller.current)
      ultimas.current.alTrazar?.([])
      taller.current.pedirDibujo?.()
    },

    encuadrar: () => encuadrarVisible(taller.current),

    nodosDelModelo: () => {
      const nombres: string[] = []
      taller.current.raiz?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name) nombres.push(o.name)
      })
      return nombres
    },
  }))

  // ------------------------------------------------------------- montaje
  useEffect(() => {
    const contenedor = lienzo.current
    if (!contenedor) return

    let vivo = true
    const render = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    render.setPixelRatio(Math.min(devicePixelRatio, 2))
    render.setSize(contenedor.clientWidth, contenedor.clientHeight)
    contenedor.appendChild(render.domElement)
    render.domElement.style.touchAction = 'none'

    const escena = new THREE.Scene()
    const camara = new THREE.PerspectiveCamera(
      42,
      contenedor.clientWidth / Math.max(1, contenedor.clientHeight),
      0.01,
      100,
    )
    camara.position.set(0.4, 0.3, 1.2)

    const controles = new OrbitControls(camara, render.domElement)
    controles.enableDamping = true
    controles.dampingFactor = 0.08
    controles.target.set(0, 0, 0)
    controles.update()

    escena.add(new THREE.HemisphereLight(0xffffff, 0x62708a, 2.0))
    const principal = new THREE.DirectionalLight(0xffffff, 1.4)
    principal.position.set(1.4, 2.4, 2.2)
    escena.add(principal)
    const relleno = new THREE.DirectionalLight(0xffffff, 0.45)
    relleno.position.set(-1.6, 0.8, -1.8)
    escena.add(relleno)

    let sucio = true
    const pedirDibujo = () => {
      sucio = true
    }
    controles.addEventListener('change', pedirDibujo)

    taller.current = {
      ...taller.current,
      render,
      escena,
      camara,
      controles,
      pedirDibujo,
      puntosDelTrazo: [],
      materialesOriginales: new Map(),
    }

    // --- carga del modelo ---------------------------------------------------
    const cargador = new GLTFLoader()
    cargador.load(
      url,
      (gltf) => {
        if (!vivo) return
        const raiz = gltf.scene

        // Se centra y se normaliza el tamaño, igual que hace el visor de las
        // fichas: una malla segmentada viene con las coordenadas del estudio y
        // en la unidad que tuviera el escáner.
        const caja = new THREE.Box3().setFromObject(raiz)
        const centro = caja.getCenter(new THREE.Vector3())
        raiz.position.sub(centro)

        escena.add(raiz)
        taller.current.raiz = raiz
        taller.current.fragmento = buscarFragmento(raiz, ultimas.current.piezas)
        aplicarPiezas(taller.current, ultimas.current.piezas)
        if (ultimas.current.fluoroscopia) aplicarFluoroscopia(taller.current, true)

        // El encuadre va DESPUÉS de avisar, y el orden no es un detalle. Quien
        // escucha es la consola, que en ese momento apaga las capas que no
        // tocan y desplaza el fragmento. Encuadrando antes, la cámara apuntaba
        // al centro de la piel y del hueso sin desplazar, es decir a un sitio
        // donde ya no había nada: el modelo se veía, pero el cursor no
        // encontraba superficie porque el rayo pasaba de largo.
        ultimas.current.alCargar?.()
        encuadrarVisible(taller.current)
        sucio = true
      },
      undefined,
      () => {
        /* El componente de arriba ya avisa si el modelo no está. */
      },
    )

    // --- interacción --------------------------------------------------------
    const rayo = new THREE.Raycaster()
    const puntero = new THREE.Vector2()
    let arrastrando = false
    let planoDeArrastre: THREE.Plane | null = null
    const puntoAuxiliar = new THREE.Vector3()
    const inicioDeArrastre = new THREE.Vector3()
    const posicionAlEmpezar = new THREE.Vector3()

    const aCoordenadas = (evento: PointerEvent) => {
      const caja = render.domElement.getBoundingClientRect()
      puntero.set(
        ((evento.clientX - caja.left) / caja.width) * 2 - 1,
        -((evento.clientY - caja.top) / caja.height) * 2 + 1,
      )
      rayo.setFromCamera(puntero, camara)
    }

    /** Primer punto de la superficie visible bajo el cursor. */
    const superficieBajoElCursor = (): THREE.Intersection | null => {
      const raiz = taller.current.raiz
      if (!raiz) return null
      // El filtro de visibilidad es imprescindible y no es redundante: three
      // devuelve también los cruces con mallas ocultas, de modo que sin él se
      // trazaría sobre la piel apagada creyendo trazar sobre el hueso.
      const golpes = rayo.intersectObject(raiz, true).filter((g) => g.object.visible)
      return golpes[0] ?? null
    }

    const alBajar = (evento: PointerEvent) => {
      const { modo: modoActual } = ultimas.current
      if (modoActual === 'orbitar') return

      aCoordenadas(evento)

      if (modoActual === 'trazar') {
        const golpe = superficieBajoElCursor()
        if (!golpe) return
        controles.enabled = false
        arrastrando = true
        taller.current.puntosDelTrazo = [
          { x: golpe.point.x, y: golpe.point.y, z: golpe.point.z },
        ]
        dibujarTrazo(taller.current)
        pedirDibujo()
        return
      }

      if (modoActual === 'mover') {
        const fragmento = taller.current.fragmento
        if (!fragmento) return
        const golpe = superficieBajoElCursor()
        // Solo se arrastra si se agarró el propio fragmento: agarrar la diáfisis
        // fija y ver moverse la otra mitad sería desconcertante.
        if (!golpe || !perteneceA(golpe.object, fragmento)) return

        controles.enabled = false
        arrastrando = true
        // Se arrastra sobre el plano perpendicular a la cámara que pasa por el
        // punto agarrado: es lo que hace que el hueso siga al cursor sin
        // hundirse ni salir disparado hacia el fondo.
        const normal = camara.getWorldDirection(new THREE.Vector3()).negate()
        planoDeArrastre = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, golpe.point)
        rayo.ray.intersectPlane(planoDeArrastre, inicioDeArrastre)
        posicionAlEmpezar.copy(fragmento.position)
      }
    }

    const alMover = (evento: PointerEvent) => {
      if (!arrastrando) return
      const { modo: modoActual } = ultimas.current
      aCoordenadas(evento)

      if (modoActual === 'trazar') {
        const golpe = superficieBajoElCursor()
        if (!golpe) return
        const puntos = taller.current.puntosDelTrazo
        const ultimo = puntos[puntos.length - 1]
        // Se ignoran los puntos casi pegados: sin esto, un temblor de la mano
        // añade cien puntos por centímetro y la longitud medida se infla.
        if (ultimo && distancia(ultimo, golpe.point) < 0.002) return
        puntos.push({ x: golpe.point.x, y: golpe.point.y, z: golpe.point.z })
        dibujarTrazo(taller.current)
        ultimas.current.alTrazar?.([...puntos])
        pedirDibujo()
        return
      }

      if (modoActual === 'mover' && planoDeArrastre && taller.current.fragmento) {
        if (!rayo.ray.intersectPlane(planoDeArrastre, puntoAuxiliar)) return
        taller.current.fragmento.position
          .copy(posicionAlEmpezar)
          .add(puntoAuxiliar.clone().sub(inicioDeArrastre))
        pedirDibujo()
      }
    }

    const alSubir = () => {
      if (!arrastrando) return
      arrastrando = false
      planoDeArrastre = null
      controles.enabled = true

      if (ultimas.current.modo === 'mover' && taller.current.fragmento) {
        const f = taller.current.fragmento
        ultimas.current.alMoverFragmento?.(
          { x: f.position.x, y: f.position.y, z: f.position.z },
          { x: grados(f.rotation.x), y: grados(f.rotation.y), z: grados(f.rotation.z) },
        )
      }
    }

    render.domElement.addEventListener('pointerdown', alBajar)
    render.domElement.addEventListener('pointermove', alMover)
    render.domElement.addEventListener('pointerup', alSubir)
    render.domElement.addEventListener('pointerleave', alSubir)

    const observador = new ResizeObserver(() => {
      if (!contenedor.clientWidth) return
      camara.aspect = contenedor.clientWidth / Math.max(1, contenedor.clientHeight)
      camara.updateProjectionMatrix()
      render.setSize(contenedor.clientWidth, contenedor.clientHeight)
      sucio = true
    })
    observador.observe(contenedor)

    render.setAnimationLoop(() => {
      const movio = controles.update()
      if (!sucio && !movio) return
      sucio = false
      render.render(escena, camara)
    })

    return () => {
      vivo = false
      render.setAnimationLoop(null)
      observador.disconnect()
      controles.removeEventListener('change', pedirDibujo)
      render.domElement.removeEventListener('pointerdown', alBajar)
      render.domElement.removeEventListener('pointermove', alMover)
      render.domElement.removeEventListener('pointerup', alSubir)
      render.domElement.removeEventListener('pointerleave', alSubir)
      controles.dispose()
      // Liberar a mano: aquí hay decenas de megabytes en la tarjeta y pasear
      // por la plataforma acabaría tirando la pestaña.
      liberar(escena)
      render.dispose()
      render.domElement.remove()
      taller.current = { puntosDelTrazo: [], materialesOriginales: new Map() }
    }
    // Se monta una vez por modelo. Lo demás se aplica sin rehacer la escena.
  }, [url])

  // ----------------------------------------------------- cambios de estado
  useEffect(() => {
    if (!taller.current.raiz) return
    taller.current.fragmento = buscarFragmento(taller.current.raiz, piezas)
    aplicarPiezas(taller.current, piezas)
    taller.current.pedirDibujo?.()
  }, [piezas])

  useEffect(() => {
    if (!taller.current.raiz) return
    aplicarFluoroscopia(taller.current, fluoroscopia)
    taller.current.pedirDibujo?.()
  }, [fluoroscopia])

  useEffect(() => {
    const controles = taller.current.controles
    if (!controles) return
    // En modo Trazar y Mover, la órbita estorba: cada arrastre giraría la
    // escena en vez de dibujar. Se apaga el giro y se deja el zoom.
    controles.enableRotate = modo === 'orbitar'
    if (taller.current.render) {
      taller.current.render.domElement.style.cursor =
        modo === 'orbitar' ? 'grab' : modo === 'trazar' ? 'crosshair' : 'move'
    }
  }, [modo])

  return <div className="consola-lienzo" ref={lienzo} />
}

// ------------------------------------------------------------------ auxiliares

type Taller = {
  escena?: THREE.Scene
  camara?: THREE.PerspectiveCamera
  controles?: OrbitControls
  raiz?: THREE.Object3D
  fragmento?: THREE.Object3D
  trazo?: THREE.Line
  puntosDelTrazo: Punto3[]
  materialesOriginales: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
  pedirDibujo?: () => void
}

const distancia = (a: Punto3, b: THREE.Vector3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

const perteneceA = (objeto: THREE.Object3D, ancestro: THREE.Object3D): boolean => {
  let actual: THREE.Object3D | null = objeto
  while (actual) {
    if (actual === ancestro) return true
    actual = actual.parent
  }
  return false
}

/** El nodo declarado como fragmento móvil, si el archivo lo trae. */
function buscarFragmento(raiz: THREE.Object3D, piezas: PiezaDelCaso[]): THREE.Object3D | undefined {
  const nombre = piezas.find((p) => p.rol === 'fragmento')?.nodo
  if (!nombre) return undefined
  return raiz.getObjectByName(nombre) ?? undefined
}

/** Enciende y apaga según el rol declarado. Los implantes empiezan ocultos. */
function aplicarPiezas(taller: Taller, piezas: PiezaDelCaso[]) {
  const raiz = taller.raiz
  if (!raiz) return
  const porNombre = new Map(piezas.map((p) => [p.nodo, p]))
  raiz.traverse((objeto) => {
    if (!(objeto as THREE.Mesh).isMesh) return
    const pieza = porNombre.get(objeto.name)
    if (pieza?.rol === 'implante') objeto.visible = false
  })
}

/**
 * Vista de fluoroscopia.
 *
 * No es un cálculo de atenuación: es una lectura del hueso en escala de grises,
 * sumando la luz allí donde el rayo atraviesa más material. Se consigue pintando
 * de forma aditiva y sin escribir profundidad, de modo que las capas se suman en
 * vez de taparse, que es justo lo que hace que una radiografía enseñe el interior.
 * Se guarda el material original de cada malla para poder volver.
 */
function aplicarFluoroscopia(taller: Taller, encendida: boolean) {
  const raiz = taller.raiz
  if (!raiz) return

  raiz.traverse((objeto) => {
    const malla = objeto as THREE.Mesh
    if (!malla.isMesh) return

    if (encendida) {
      if (!taller.materialesOriginales.has(malla)) {
        taller.materialesOriginales.set(malla, malla.material)
      }
      malla.material = new THREE.MeshBasicMaterial({
        color: 0x9fb4c9,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    } else {
      const original = taller.materialesOriginales.get(malla)
      if (original) {
        ;(malla.material as THREE.Material).dispose?.()
        malla.material = original
      }
    }
  })

  if (taller.escena) {
    taller.escena.background = encendida ? new THREE.Color(0x0d1117) : null
  }
}

/** Redibuja la línea del trazo sobre la superficie. */
function dibujarTrazo(taller: Taller) {
  const escena = taller.escena
  if (!escena) return

  if (taller.trazo) {
    escena.remove(taller.trazo)
    taller.trazo.geometry.dispose()
    ;(taller.trazo.material as THREE.Material).dispose()
    taller.trazo = undefined
  }
  if (taller.puntosDelTrazo.length < 2) return

  const geometria = new THREE.BufferGeometry().setFromPoints(
    taller.puntosDelTrazo.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
  )
  const material = new THREE.LineBasicMaterial({ color: 0xc0392b, depthTest: false })
  const linea = new THREE.Line(geometria, material)
  // Se dibuja al final y sin comprobar profundidad: una incisión trazada sobre
  // la piel no debe desaparecer bajo el relieve del propio modelo.
  linea.renderOrder = 999
  escena.add(linea)
  taller.trazo = linea
}

function encuadrarVisible(taller: Taller) {
  const { raiz, camara, controles } = taller
  if (!raiz || !camara || !controles) return

  const caja = new THREE.Box3()
  raiz.traverse((objeto) => {
    if ((objeto as THREE.Mesh).isMesh && objeto.visible) caja.expandByObject(objeto)
  })
  if (caja.isEmpty()) return

  const centro = caja.getCenter(new THREE.Vector3())
  const tamano = caja.getSize(new THREE.Vector3())
  const radio = Math.max(tamano.x, tamano.y, tamano.z) / 2 || 0.1
  const distanciaCamara = (radio / Math.tan((camara.fov * Math.PI) / 360)) * 1.7

  controles.target.copy(centro)
  camara.position
    .copy(centro)
    .add(new THREE.Vector3(0.4, 0.15, 1).normalize().multiplyScalar(distanciaCamara))
  controles.update()
  taller.pedirDibujo?.()
}

function liberar(escena: THREE.Scene) {
  escena.traverse((objeto) => {
    const malla = objeto as THREE.Mesh
    if (!malla.isMesh) return
    malla.geometry?.dispose()
    const material = malla.material
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material?.dispose()
  })
  void EJES
}
