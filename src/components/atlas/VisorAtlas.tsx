'use client'

import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { VISTA_INICIAL, type CatalogoDelAtlas, type VistaDeInstancia } from '@/atlas/formato'
import {
  ESTADO,
  aplicarSeparacion,
  cargarPaquetes,
  marcarPieza,
  montarEscena,
  paquetesNecesarios,
  type EscenaDelAtlas,
} from '@/atlas/cargador'
import { piezaBajoElRayo } from '@/atlas/picking'

/**
 * Visor del atlas anatómico.
 *
 * Va en three.js imperativo y no en react-three-fiber, a diferencia de
 * `Visor3D`, y es a propósito: aquí se inyectan sombreadores, se escriben
 * texturas de estado píxel a píxel y se hace el cruce de rayos a mano. Envolver
 * todo eso en el reconciliador de React sería pelearse con él en cada
 * fotograma para no ganar nada.
 *
 * Dibuja **solo cuando algo cambia**. Un bucle continuo con 2,29 millones de
 * triángulos calienta el portátil de quien está leyendo una ficha quieta.
 */

export interface MandoDelVisor {
  /** Cámara actual, para guardarla en una instancia. */
  vistaActual: () => VistaDeInstancia
  /** Encuadra lo que esté visible. */
  encuadrar: () => void
  /**
   * Lleva la cámara a un encuadre guardado.
   *
   * Es una orden y no una prop a propósito. `vistaInicial` solo se lee al
   * montar la escena, y abrir una preparación no cambia el catálogo, así que
   * no hay montaje del que colgarse; y una prop que se aplicara al cambiar de
   * valor no serviría para reabrir dos veces la misma preparación, que es
   * justo lo que se hace cuando uno se ha perdido girando.
   *
   * No toca la separación: esa tiene su propio estado y su propio efecto.
   */
  irA: (vista: VistaDeInstancia) => void
}

export function VisorAtlas({
  catalogo,
  visibles,
  resaltada,
  separacion,
  vistaInicial,
  soloLectura = false,
  alPulsarPieza,
  mando,
}: {
  catalogo: CatalogoDelAtlas
  /** Piezas encendidas. `null` significa todas. */
  visibles: Set<string> | null
  resaltada: string | null
  separacion: number
  /**
   * Encuadre con el que se monta la escena. Se lee **una sola vez**, al montar:
   * después la cámara es del usuario y solo se mueve si se lo pide `irA`.
   */
  vistaInicial?: VistaDeInstancia
  soloLectura?: boolean
  alPulsarPieza?: (id: string) => void
  mando?: RefObject<MandoDelVisor | null>
}) {
  const lienzo = useRef<HTMLDivElement>(null)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [nombreFlotante, setNombreFlotante] = useState<{ texto: string; x: number; y: number } | null>(
    null,
  )

  // Todo lo de three vive aquí: React no debe re-crear la escena al re-pintar.
  const taller = useRef<{
    escena?: EscenaDelAtlas
    render?: THREE.WebGLRenderer
    tresD?: THREE.Scene
    camara?: THREE.PerspectiveCamera
    controles?: OrbitControls
    pedirDibujo?: () => void
  }>({})

  // Las props que lee el bucle sin re-montarlo.
  //
  // Se refresca en un efecto y no durante el pintado: escribir en un ref
  // mientras se pinta rompe con el pintado concurrente, que puede empezar un
  // render y descartarlo. Este efecto va declarado **antes** que el de montaje
  // para que, cuando aquel se ejecute, el ref ya tenga los valores de este
  // pintado y no los del primero.
  const ultimas = useRef({ visibles, resaltada, separacion, alPulsarPieza, soloLectura, vistaInicial })
  useEffect(() => {
    ultimas.current = { visibles, resaltada, separacion, alPulsarPieza, soloLectura, vistaInicial }
  })

  useImperativeHandle(mando, () => ({
    vistaActual: () => {
      const c = taller.current.camara
      const o = taller.current.controles
      if (!c || !o) return { camara: [0, 1, 3], objetivo: [0, 1, 0], separacion: 0 }
      return {
        camara: [redondear(c.position.x), redondear(c.position.y), redondear(c.position.z)],
        objetivo: [redondear(o.target.x), redondear(o.target.y), redondear(o.target.z)],
        separacion: ultimas.current.separacion,
      }
    },
    encuadrar: () => encuadrarVisible(taller.current, catalogo, ultimas.current.visibles),
    irA: (vista) => {
      const { camara, controles } = taller.current
      if (!camara || !controles) return
      camara.position.set(...vista.camara)
      controles.target.set(...vista.objetivo)
      controles.update()
      taller.current.pedirDibujo?.()
    },
  }))

  // ---------------------------------------------------------------- montaje
  useEffect(() => {
    const contenedor = lienzo.current
    if (!contenedor) return

    const aborto = new AbortController()
    let vivo = true

    const render = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    render.setPixelRatio(Math.min(devicePixelRatio, 2))
    render.setSize(contenedor.clientWidth, contenedor.clientHeight)
    contenedor.appendChild(render.domElement)
    render.domElement.style.touchAction = 'none'
    render.domElement.style.cursor = 'grab'

    const tresD = new THREE.Scene()
    const camara = new THREE.PerspectiveCamera(
      42,
      contenedor.clientWidth / Math.max(1, contenedor.clientHeight),
      0.02,
      60,
    )
    // Del ref y no de la prop: el efecto solo depende de `catalogo`, asi que
    // leer la prop directamente aqui congelaba el encuadre del primer pintado.
    const vista = ultimas.current.vistaInicial ?? VISTA_INICIAL
    camara.position.set(...vista.camara)

    const controles = new OrbitControls(camara, render.domElement)
    controles.target.set(...vista.objetivo)
    controles.enableDamping = true
    controles.dampingFactor = 0.08
    controles.minDistance = 0.1
    controles.maxDistance = 12
    controles.update()

    // Luz suave y frontal: la anatomía se lee mejor sin sombras duras que
    // escondan relieve.
    tresD.add(new THREE.HemisphereLight(0xffffff, 0x62708a, 2.1))
    const principal = new THREE.DirectionalLight(0xffffff, 1.5)
    principal.position.set(1.4, 2.4, 2.2)
    tresD.add(principal)
    const relleno = new THREE.DirectionalLight(0xffffff, 0.5)
    relleno.position.set(-1.6, 0.8, -1.8)
    tresD.add(relleno)

    let sucio = true
    const pedirDibujo = () => {
      sucio = true
    }
    controles.addEventListener('change', pedirDibujo)

    taller.current = { render, tresD, camara, controles, pedirDibujo }

    // --- carga -------------------------------------------------------------
    ;(async () => {
      try {
        const necesarias = ultimas.current.visibles
          ? catalogo.piezas.filter((p) => ultimas.current.visibles!.has(p.id))
          : catalogo.piezas

        const buferes = await cargarPaquetes(
          catalogo,
          paquetesNecesarios(necesarias),
          (hechos, total) => vivo && setProgreso(Math.round((hechos / total) * 100)),
          aborto.signal,
        )
        if (!vivo) return

        const escena = montarEscena(
          catalogo,
          buferes,
          ultimas.current.visibles ?? undefined,
        )
        taller.current.escena = escena
        for (const malla of escena.mallas) tresD.add(malla)

        prepararDirecciones(escena, catalogo)
        aplicarVisibilidad(escena, catalogo, ultimas.current.visibles, ultimas.current.resaltada)
        aplicarSeparacion(escena, ultimas.current.separacion)
        setProgreso(100)
        sucio = true
      } catch (fallo) {
        if (!vivo || aborto.signal.aborted) return
        setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el atlas.')
      }
    })()

    // --- interacción -------------------------------------------------------
    const rayo = new THREE.Raycaster()
    const puntero = new THREE.Vector2()
    let bajado: { x: number; y: number } | null = null

    const aCoordenadas = (evento: PointerEvent) => {
      const caja = render.domElement.getBoundingClientRect()
      puntero.set(
        ((evento.clientX - caja.left) / caja.width) * 2 - 1,
        -((evento.clientY - caja.top) / caja.height) * 2 + 1,
      )
      return { x: evento.clientX - caja.left, y: evento.clientY - caja.top }
    }

    const alBajar = (evento: PointerEvent) => {
      bajado = { x: evento.clientX, y: evento.clientY }
      render.domElement.style.cursor = 'grabbing'
    }

    const alMover = (evento: PointerEvent) => {
      render.domElement.style.cursor = bajado ? 'grabbing' : 'grab'
      const escena = taller.current.escena
      // Mientras se arrastra no se busca nada: sería trabajo tirado.
      if (bajado || !escena || evento.pointerType === 'touch') {
        setNombreFlotante(null)
        return
      }
      const local = aCoordenadas(evento)
      rayo.setFromCamera(puntero, camara)
      const indice = piezaBajoElRayo(rayo, catalogo, escena, ultimas.current.separacion)
      if (indice < 0) {
        setNombreFlotante(null)
        return
      }
      render.domElement.style.cursor = 'pointer'
      setNombreFlotante({ texto: catalogo.piezas[indice].nombre, x: local.x, y: local.y })
    }

    const alSubir = (evento: PointerEvent) => {
      const arrastro =
        bajado &&
        Math.hypot(evento.clientX - bajado.x, evento.clientY - bajado.y) >
          (evento.pointerType === 'touch' ? 12 : 5)
      bajado = null
      render.domElement.style.cursor = 'grab'

      const escena = taller.current.escena
      if (arrastro || !escena || ultimas.current.soloLectura) return

      aCoordenadas(evento)
      rayo.setFromCamera(puntero, camara)
      const indice = piezaBajoElRayo(rayo, catalogo, escena, ultimas.current.separacion)
      if (indice >= 0) ultimas.current.alPulsarPieza?.(catalogo.piezas[indice].id)
    }

    const alSalir = () => setNombreFlotante(null)

    render.domElement.addEventListener('pointerdown', alBajar)
    render.domElement.addEventListener('pointermove', alMover)
    render.domElement.addEventListener('pointerup', alSubir)
    render.domElement.addEventListener('pointerleave', alSalir)

    // --- bucle -------------------------------------------------------------
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
      render.render(tresD, camara)
    })

    return () => {
      vivo = false
      aborto.abort()
      render.setAnimationLoop(null)
      observador.disconnect()
      controles.removeEventListener('change', pedirDibujo)
      render.domElement.removeEventListener('pointerdown', alBajar)
      render.domElement.removeEventListener('pointermove', alMover)
      render.domElement.removeEventListener('pointerup', alSubir)
      render.domElement.removeEventListener('pointerleave', alSalir)
      controles.dispose()
      // Liberar a mano: el proyecto no llama a `useGLTF.clear` en ninguna parte
      // y aquí hay decenas de megabytes en la tarjeta. Sin esto, pasear por la
      // plataforma acaba tirando la pestaña.
      taller.current.escena?.liberar()
      render.dispose()
      render.domElement.remove()
      taller.current = {}
    }
    // Se monta una sola vez por catálogo: el resto son cambios de estado que se
    // aplican sin rehacer la escena. La lista de dependencias es completa tal
    // como está, porque todo lo demás se lee del ref `ultimas`.
  }, [catalogo])

  // ------------------------------------------------------ cambios de estado
  useEffect(() => {
    const escena = taller.current.escena
    if (!escena) return
    aplicarVisibilidad(escena, catalogo, visibles, resaltada)
    taller.current.pedirDibujo?.()
  }, [catalogo, visibles, resaltada])

  useEffect(() => {
    const escena = taller.current.escena
    if (!escena) return
    aplicarSeparacion(escena, separacion)
    taller.current.pedirDibujo?.()
  }, [separacion])


  return (
    <div className="atlas-lienzo" ref={lienzo}>
      {progreso < 100 && !error ? (
        <div className="atlas-cargando">
          <div className="atlas-barra">
            <span style={{ width: `${progreso}%` }} />
          </div>
          <p>Cargando anatomía… {progreso}%</p>
        </div>
      ) : null}

      {error ? <div className="atlas-error">{error}</div> : null}

      {nombreFlotante ? (
        <span
          className="atlas-flotante"
          style={{ left: nombreFlotante.x + 14, top: nombreFlotante.y + 16 }}
        >
          {nombreFlotante.texto}
        </span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- auxiliares

const redondear = (n: number) => Math.round(n * 1000) / 1000

/**
 * Calcula hacia dónde se aleja cada pieza al separar el cuerpo.
 *
 * Desde el eje del cuerpo hacia fuera, y con un empujón vertical según a qué
 * altura esté: así al separar no se amontona todo en el mismo plano y se ve
 * de verdad qué hay dentro.
 */
function prepararDirecciones(escena: EscenaDelAtlas, catalogo: CatalogoDelAtlas) {
  catalogo.piezas.forEach((pieza, i) => {
    const cx = escena.centros[i * 3]
    const cy = escena.centros[i * 3 + 1]
    const cz = escena.centros[i * 3 + 2]

    const largo = Math.hypot(cx, cz) || 0.0001
    const escala = 0.9
    marcarPieza(escena, i, escena.datos[i * 4 + 3], [
      (cx / largo) * escala,
      (cy - 0.9) * 0.35,
      (cz / largo) * escala,
    ])
    void pieza
  })
}

function aplicarVisibilidad(
  escena: EscenaDelAtlas,
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
  resaltada: string | null,
) {
  catalogo.piezas.forEach((pieza, i) => {
    const encendida = !visibles || visibles.has(pieza.id)
    const estado = !encendida
      ? ESTADO.OCULTA
      : pieza.id === resaltada
        ? ESTADO.RESALTADA
        : ESTADO.VISIBLE
    escena.datos[i * 4 + 3] = estado
  })
  escena.estados.needsUpdate = true
}

/** Encuadra la cámara sobre lo que esté encendido. */
function encuadrarVisible(
  taller: {
    camara?: THREE.PerspectiveCamera
    controles?: OrbitControls
    pedirDibujo?: () => void
  },
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
) {
  const { camara, controles } = taller
  if (!camara || !controles) return

  const caja = new THREE.Box3()
  let hay = false
  for (const pieza of catalogo.piezas) {
    if (visibles && !visibles.has(pieza.id)) continue
    const [min, max] = pieza.caja
    caja.expandByPoint(new THREE.Vector3(min[0], min[1], min[2]))
    caja.expandByPoint(new THREE.Vector3(max[0], max[1], max[2]))
    hay = true
  }
  if (!hay) return

  const centro = caja.getCenter(new THREE.Vector3())
  const tamano = caja.getSize(new THREE.Vector3())
  const radio = Math.max(tamano.x, tamano.y, tamano.z) / 2
  const distancia = (radio / Math.tan((camara.fov * Math.PI) / 360)) * 1.6

  controles.target.copy(centro)
  camara.position.copy(centro).add(new THREE.Vector3(0.35, 0.12, 1).normalize().multiplyScalar(distancia))
  controles.update()
  taller.pedirDibujo?.()
}
