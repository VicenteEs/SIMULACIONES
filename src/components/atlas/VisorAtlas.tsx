'use client'

import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
// De `three/examples/jsm` y no de `three-stdlib`, que trae los mismos controles.
// En el árbol conviven las dos procedencias, y lo que de verdad pesa no es esta
// línea: son los dos `GLTFLoader` enteros que quedan en el paquete —uno en el
// trozo de `@react-three/drei`, que carga con `useGLTF` en `Visor3D`, y otro en
// el de `simulador/LienzoQuirurgico.tsx`, que lo trae de jsm—. Aquí no se abre
// ningún GLTF, así que cambiar solo este import no quita un byte duplicado:
// deja mezcladas las dos procedencias dentro de three puro y la consola sigue
// con su copia. Unificar es un cambio de los tres archivos en el mismo commit.
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

/**
 * Aviso de contexto WebGL perdido.
 *
 * Es una constante y no un literal suelto porque al recuperar el contexto hay
 * que distinguir este aviso de un fallo de carga: los dos viven en el mismo
 * `error`, y retirar el de la tarjeta gráfica no puede llevarse por delante el
 * de una ficha que de verdad no cargó.
 */
const AVISO_SIN_ACELERACION =
  'Se perdió la aceleración gráfica de esta página, normalmente por tener abiertos ' +
  'demasiados modelos a la vez. Recargue la página para volver a ver la anatomía.'

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
    encuadrar: () =>
      encuadrarVisible(
        taller.current,
        catalogo,
        ultimas.current.visibles,
        ultimas.current.separacion,
      ),
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
        // La selección se congela **antes** del `await`, y con la congelada se
        // monta después.
        //
        // El tercer argumento de `montarEscena` no es visibilidad sino
        // construcción: lo que no entra ahí no se funde en la malla de su
        // sistema ni recibe rango, y la escena solo se monta al cambiar el
        // catálogo, que no cambia nunca. Volviendo a leer el ref después del
        // `await` se montaba con lo que hubiera encendido al TERMINAR la
        // descarga, y el árbol anatómico está vivo durante esos 31 MB: pulsar
        // «Solo esto» sobre la tibia mientras carga dejaba el resto del cuerpo
        // fuera de la malla, y volver a marcarlo en el árbol ya no enseñaba un
        // triángulo ni se podía señalar con el ratón, sin ningún error; con
        // «Ninguna», el lienzo quedaba en blanco al 100 % de progreso. Apagar
        // una pieza es un píxel de textura y se deshace; no haberla metido en
        // la malla, no.
        const seleccionDescargada = ultimas.current.visibles
        const necesarias = seleccionDescargada
          ? catalogo.piezas.filter((p) => seleccionDescargada.has(p.id))
          : catalogo.piezas

        const buferes = await cargarPaquetes(
          catalogo,
          paquetesNecesarios(necesarias),
          (hechos, total) => vivo && setProgreso(Math.round((hechos / total) * 100)),
          aborto.signal,
        )
        if (!vivo) return

        const escena = montarEscena(catalogo, buferes, seleccionDescargada ?? undefined)
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
      render.domElement.style.cursor = 'grabbing'
      // Solo el botón izquierdo, y solo con un puntero, arma un posible clic
      // sobre una pieza. El derecho es el encuadre de OrbitControls y el
      // central el zoom, y dos dedos son su pellizco: son gestos de cámara, no
      // del taller. Sin este filtro, un encuadre con el derecho que se
      // desplazara menos de cinco píxeles caía por la rama del clic y apagaba
      // la pieza de debajo; y como OrbitControls suprime el menú contextual, en
      // pantalla no quedaba ni rastro que conectara el gesto con la pieza que
      // había desaparecido entre las 2.234 filas del árbol.
      if (evento.button !== 0 || !evento.isPrimary) {
        bajado = null
        return
      }
      bajado = { x: evento.clientX, y: evento.clientY }
    }

    const alMover = (evento: PointerEvent) => {
      // `buttons` y no `bajado`: desde que `bajado` sigue solo al izquierdo,
      // preguntarle a él dejaría el cruce de rayos corriendo durante un
      // encuadre con el derecho, que es justo cuando no sirve para nada.
      const arrastrando = evento.buttons !== 0
      render.domElement.style.cursor = arrastrando ? 'grabbing' : 'grab'
      const escena = taller.current.escena
      // Mientras se arrastra no se busca nada: sería trabajo tirado.
      if (arrastrando || !escena || evento.pointerType === 'touch') {
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
      render.domElement.style.cursor = 'grab'
      // Soltar el derecho o el central no cancela nada: el izquierdo puede
      // seguir pulsado y su gesto sigue vivo, así que se sale sin tocar
      // `bajado`.
      if (evento.button !== 0 || !evento.isPrimary) return

      const inicio = bajado
      bajado = null

      const escena = taller.current.escena
      // Sin `pointerdown` propio no hay clic: un arrastre que empezó fuera del
      // lienzo y termina encima no es una pulsación sobre la pieza.
      if (!inicio || !escena || ultimas.current.soloLectura) return

      const umbral = evento.pointerType === 'touch' ? 12 : 5
      if (Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) > umbral) return

      aCoordenadas(evento)
      rayo.setFromCamera(puntero, camara)
      const indice = piezaBajoElRayo(rayo, catalogo, escena, ultimas.current.separacion)
      if (indice >= 0) ultimas.current.alPulsarPieza?.(catalogo.piezas[indice].id)
    }

    const alSalir = () => setNombreFlotante(null)

    // Un contexto WebGL se puede perder sin que esta página haga nada: el
    // navegador limita cuántos hay vivos a la vez —del orden de dieciséis en
    // Chrome— y al pasarse descarta el más antiguo, que es justo lo que le
    // ocurre al residente que recorre varias fichas con anatomía. El manejador
    // interno de three se limita entonces a marcar el contexto como perdido y
    // dejar de pintar, en silencio: queda un rectángulo blanco, con `progreso`
    // a 100 y sin error, idéntico a una ficha rota. Este aviso es lo único que
    // distingue las dos cosas y lo único que dice qué hacer.
    const alPerderContexto = () => {
      setError(AVISO_SIN_ACELERACION)
    }
    render.domElement.addEventListener('webglcontextlost', alPerderContexto)

    // Y su reverso, que es la otra mitad del mismo contrato. El `onContextLost`
    // interno de three llama a `preventDefault()` (three 0.185.1), que es justo
    // lo que le pide al navegador que DEVUELVA el contexto, y three trae su
    // `onContextRestore` —escucha puesta al construir el render y retirada solo
    // en `dispose()`— para reinicializarlo y volver a subirlo todo a la tarjeta.
    // Sin este reverso, el caso que el aviso dice cubrir acababa peor que sin
    // aviso: la anatomía volvía sana y quedaba debajo de un cartel opaco
    // —`.atlas-error` es `inset: 16px`, con fondo y sin `pointer-events: none`,
    // así que tapa el lienzo entero y se come el ratón— que seguía mandando
    // recargar una página que ya funcionaba.
    //
    // Solo se retira el aviso propio: un fallo de carga es otra cosa y sigue
    // siendo cierto aunque la tarjeta vuelva.
    //
    // Y se ensucia el fotograma a mano porque aquí se dibuja solo cuando algo
    // cambia: con el modelo quieto `controles.update()` devuelve false, el bucle
    // sale sin renderizar y un contexto recuperado no pinta nada por su cuenta;
    // el lienzo se quedaría en blanco igual, ahora sin ningún aviso que lo
    // explicara.
    const alRecuperarContexto = () => {
      setError((anterior) => (anterior === AVISO_SIN_ACELERACION ? null : anterior))
      sucio = true
    }
    render.domElement.addEventListener('webglcontextrestored', alRecuperarContexto)

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
      // Antes de forzar la pérdida, para no avisar de un contexto que se tira
      // a propósito sobre un componente que ya no está montado.
      render.domElement.removeEventListener('webglcontextlost', alPerderContexto)
      render.domElement.removeEventListener('webglcontextrestored', alRecuperarContexto)
      controles.dispose()
      // Liberar a mano: el proyecto no llama a `useGLTF.clear` en ninguna parte
      // y aquí hay decenas de megabytes en la tarjeta. Sin esto, pasear por la
      // plataforma acaba tirando la pestaña.
      taller.current.escena?.liberar()
      // `dispose()` no cierra el contexto: en esta versión de three (0.185.1)
      // solo quita tres escuchas y vacía cachés internas. El contexto sobrevive
      // hasta que el recolector se lleve el lienzo, en un momento que la
      // aplicación no decide, y cada ficha con anatomía monta uno —dos o tres
      // si trae varias preparaciones—. Al llegar al tope del navegador, este
      // descarta el contexto más antiguo y ese lienzo se queda en blanco para
      // siempre. Perderlo a mano es un método aparte, y este es su único sitio.
      render.forceContextLoss()
      render.dispose()
      render.domElement.remove()
      taller.current = {}
    }
    // Se monta una sola vez por catálogo: el resto son cambios de estado que se
    // aplican sin rehacer la escena. La lista de dependencias es completa tal
    // como está, porque todo lo demás se lee del ref `ultimas`.
  }, [catalogo])

  // ------------------------------------------------------ cambios de estado
  //
  // Lo último que se escribió en la textura de estado, para saber si hace falta
  // repasarla entera. Guarda también la escena porque al cambiar de catálogo se
  // monta otra distinta y lo anterior deja de valer; comparándola aquí, la
  // referencia se invalida sola y no hay que acordarse de limpiarla en el
  // desmontaje.
  const pintado = useRef<{
    escena: EscenaDelAtlas
    visibles: Set<string> | null
    resaltada: string | null
  } | null>(null)

  useEffect(() => {
    const escena = taller.current.escena
    if (!escena) return
    const anterior = pintado.current
    // Pasar el ratón por el árbol anatómico cambia `resaltada` y nada más, y
    // eso ocurre decenas de veces mientras se recorre la lista: repasar las
    // 2.234 piezas en cada paso era trabajo tirado dentro del gesto más
    // frecuente del taller.
    //
    // Que `visibles` sea el MISMO objeto basta para saber que la selección no
    // cambió, porque aquí nadie muta ese conjunto: el taller y el árbol
    // construyen un `Set` nuevo en cada cambio. Si algún día alguno pasara a
    // modificar el suyo en sitio, esta comparación dejaría piezas encendidas
    // que ya no lo están, y el repaso completo de abajo es lo único que lo
    // corregiría.
    if (anterior && anterior.escena === escena && anterior.visibles === visibles) {
      cambiarResaltado(escena, visibles, anterior.resaltada, resaltada)
    } else {
      aplicarVisibilidad(escena, catalogo, visibles, resaltada)
    }
    pintado.current = { escena, visibles, resaltada }
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

/**
 * Mueve el resaltado de una pieza a otra sin repasar el catálogo.
 *
 * Escribe exactamente el mismo estado que `aplicarVisibilidad` —de ahí que la
 * fórmula esté repetida: si una cambia, la otra también, o el resaltado dejará
 * encendida una pieza apagada—, pero tocando solo las dos que cambian. Son las
 * únicas que pueden cambiar: el resaltado es uno y solo uno.
 */
function cambiarResaltado(
  escena: EscenaDelAtlas,
  visibles: Set<string> | null,
  antes: string | null,
  ahora: string | null,
) {
  if (antes === ahora) return
  const escribir = (id: string | null, resaltar: boolean) => {
    if (!id) return
    // `indices` cubre el catálogo entero, no solo lo que se llegó a montar en
    // la malla: una pieza apagada al cargar también tiene su sitio en la
    // textura y hay que poder devolverle el suyo.
    const i = escena.indices.get(id)
    if (i === undefined) return
    const encendida = !visibles || visibles.has(id)
    marcarPieza(
      escena,
      i,
      !encendida ? ESTADO.OCULTA : resaltar ? ESTADO.RESALTADA : ESTADO.VISIBLE,
    )
  }
  escribir(antes, false)
  escribir(ahora, true)
}

/**
 * Encuadra la cámara sobre lo que esté encendido.
 *
 * `separacion` no es un adorno: la caja que trae el catálogo es la de la pieza
 * en su sitio, pero al separar el cuerpo la geometría se desplaza en el
 * sombreador (`cargador.ts`: `transformed += estado.xyz * separacion`) y la
 * caja se queda atrás. Sin trasladarla, «Encuadrar» situaba la cámara sobre el
 * volumen cerrado justo cuando más falta hace recolocar la vista —con el cuerpo
 * abierto— y dejaba fuera de pantalla las piezas más desplazadas: el botón que
 * existe para volver a ver el modelo enseñaba menos modelo que antes.
 *
 * Es la misma traslación que hace `picking.ts` para saber qué hay bajo el
 * cursor, y son dos copias de la misma regla: si una cambia, la otra también, o
 * los dos módulos volverán a colocar la misma pieza en sitios distintos.
 */
function encuadrarVisible(
  taller: {
    camara?: THREE.PerspectiveCamera
    controles?: OrbitControls
    pedirDibujo?: () => void
    escena?: EscenaDelAtlas
  },
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
  separacion: number,
) {
  const { camara, controles, escena } = taller
  if (!camara || !controles) return

  const caja = new THREE.Box3()
  const extremo = new THREE.Vector3()
  const desplazamiento = new THREE.Vector3()
  // Las direcciones de separación viven en los tres primeros canales de
  // `escena.datos`, indexados por el orden de la pieza en el catálogo: de ahí
  // el índice del recorrido. Con el cuerpo cerrado, o antes de que la escena
  // esté montada, no hay nada que trasladar.
  const datos = separacion > 0 ? escena?.datos : undefined
  let hay = false
  catalogo.piezas.forEach((pieza, i) => {
    if (visibles && !visibles.has(pieza.id)) return
    const [min, max] = pieza.caja
    if (datos) {
      desplazamiento
        .set(datos[i * 4], datos[i * 4 + 1], datos[i * 4 + 2])
        .multiplyScalar(separacion)
    } else {
      desplazamiento.set(0, 0, 0)
    }
    caja.expandByPoint(extremo.set(min[0], min[1], min[2]).add(desplazamiento))
    caja.expandByPoint(extremo.set(max[0], max[1], max[2]).add(desplazamiento))
    hay = true
  })
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
