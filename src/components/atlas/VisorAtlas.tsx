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
import { piezasEnElRectangulo, rectanguloNormalizado } from '@/atlas/seleccionPorCaja'
import type { ModoDeSeleccion } from '@/atlas/seleccion'
import { nombreEnEspanol } from '@/atlas/nombres'
import {
  DURACION_DEL_PIVOTE_MS,
  ESPERA_DEL_PIVOTE_MS,
  avanzarTraslacion,
  cajaDeLoVisible,
  crearTraslacion,
  esElObjetivoPorOmision,
  pivoteEnSitio,
  restoDeLaTraslacion,
  type TraslacionDelPivote,
} from '@/atlas/pivote'
import { objetivoFueraDeLoVisible } from '@/atlas/vistaGuardada'
import {
  ejeDelHueso,
  planoDelCorte,
  type CorteDeHueso,
  type EjeDelHueso,
} from '@/lib/planoDeCorte'

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
  /**
   * Cámara actual, para guardarla en una instancia.
   *
   * Si el pivote está a punto de recolocarse o a mitad de deslizamiento,
   * devuelve dónde VA A QUEDAR, no el fotograma de ahora. Es lo que hace que la
   * preparación guardada gire sobre lo que se ve: sin ello, apagar la última
   * pieza y pulsar «Guardar» enseguida caería dentro de la espera de
   * `ESPERA_DEL_PIVOTE_MS`, se guardaría el objetivo del cuerpo entero y al
   * abrir la ficha la pierna volvería a girar alrededor de nada.
   *
   * Y es una pregunta, sin efectos: no mueve la cámara ni adelanta la espera.
   * El taller la hace al terminar cada gesto sobre el lienzo, también el clic
   * que apaga una pieza. Cuando adelantaba la espera, cada clic deslizaba la
   * escena en el acto —la agrupación de clics seguidos no llegaba a actuar— y
   * la deslizaba bajo el cursor mientras el traumatólogo apuntaba a la
   * siguiente pieza, de modo que el clic siguiente podía apagar otra.
   */
  vistaActual: () => VistaDeInstancia
  /** Encuadra lo que esté visible. */
  encuadrar: () => void
  /**
   * Lleva la cámara a un encuadre guardado, y devuelve el encuadre con el que
   * se quedó de verdad.
   *
   * Es una orden y no una prop a propósito. `vistaInicial` solo se lee al
   * montar la escena, y abrir una preparación no cambia el catálogo, así que
   * no hay montaje del que colgarse; y una prop que se aplicara al cambiar de
   * valor no serviría para reabrir dos veces la misma preparación, que es
   * justo lo que se hace cuando uno se ha perdido girando.
   *
   * `visibles` son las piezas que VA a haber encendidas: quien llama acaba de
   * pedir el cambio a React y la prop todavía trae las de antes. Con ellas se
   * decide el pivote aquí mismo, y el efecto que sigue a la selección reconoce
   * después que ese cambio ya está atendido. Sin eso, abrir una preparación
   * dejaría el pivote a merced de ese efecto, que recolocaría cualquier
   * objetivo —también el que su autor llevó a mano sobre el foco de fractura—.
   *
   * Lo que devuelve puede no ser `vista`: una preparación guardada con el
   * objetivo por omisión, o con uno que cae fuera de lo que va a verse, se
   * recoloca sobre lo visible (ver `recolocarVistaGuardada`). Quien llama tiene
   * que tomar como referencia lo
   * devuelto y no lo pedido, o el taller daría por movida una cámara que nadie
   * ha tocado y preguntaría por cambios sin guardar que no existen.
   *
   * Con una salvedad: si la descarga no ha terminado y la vista trae el cuerpo
   * separado, aquí todavía no se decide nada y lo devuelto es lo pedido. La
   * decisión la toma el final de la carga, y si mueve la cámara lo cuenta por
   * `alAsentarVista`; quien tome referencias de aquí tiene que escuchar también
   * eso.
   *
   * No toca la separación: esa tiene su propio estado y su propio efecto.
   */
  irA: (vista: VistaDeInstancia, visibles?: Set<string> | null) => VistaDeInstancia
  /**
   * Encuadra solo las piezas dadas, estén o no todas encendidas. Es el punto
   * del teclado numérico de Blender: «llévame a lo que tengo seleccionado».
   * Con un conjunto vacío no hace nada.
   */
  encuadrarPiezas: (piezas: Set<string>) => void
  /**
   * Mira el pivote actual desde uno de los seis lados, a la distancia a la que
   * ya estaba la cámara. Son las vistas 1, 3 y 7 de Blender y sus contrarias.
   */
  mirarDesde: (lado: LadoDeLaVista) => void
}

/** Desde dónde se mira. El atlas está de pie, con la Y hacia arriba y de cara a +Z. */
export type LadoDeLaVista = 'frente' | 'atras' | 'derecha' | 'izquierda' | 'arriba' | 'abajo'


/**
 * Qué hace el botón izquierdo al arrastrar. En `orbita` gira la cámara, como
 * siempre; en `caja` dibuja un marco de selección y el giro pasa al botón
 * central, que es donde lo tiene Blender.
 */
export type HerramientaDelVisor = 'orbita' | 'caja'

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
  seleccion = null,
  alSeleccionar,
  herramienta = 'orbita',
  alAsentarVista,
  corte = null,
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
  /** Piezas seleccionadas, que se pintan en naranja. Solo las usa el taller. */
  seleccion?: Set<string> | null
  /**
   * Si llega, un clic sobre una pieza la **selecciona** en vez de llamar a
   * `alPulsarPieza`, y un clic en el vacío vacía la selección. Un marco
   * arrastrado con la herramienta `caja` llega aquí con todas sus piezas.
   */
  alSeleccionar?: (ids: string[], modo: ModoDeSeleccion) => void
  herramienta?: HerramientaDelVisor
  /**
   * Avisa de que, al terminar la descarga, la vista guardada se recolocó sobre
   * lo visible: `antes` es la cámara con la que se esperaba la carga y
   * `despues`, con la que se quedó.
   *
   * Existe porque hay dos caminos por los que la cámara se mueve sin que nadie
   * la toque y sin que quien la pidió lo sepa: `irA` llamado antes de que haya
   * escena con el cuerpo separado —la caja buena necesita las direcciones de
   * separación, que solo existen tras la carga—, y el propio montaje, cuando el
   * visor llega con `vistaInicial` ya puesta porque el mando todavía no existía
   * al abrir. En los dos, la referencia del taller se quedaba con la vista de
   * antes de moverla, y saltaba «cambios sin guardar» —en la cabecera, al
   * cerrar la pestaña y desde la barra lateral— sin que se hubiera tocado
   * nada; guardar entonces escribía encima el encuadre movido.
   *
   * Solo se avisa de la vista guardada. Si la selección cambió durante la
   * descarga, lo que mueve la cámara es un cambio del traumatólogo, igual que
   * cuando el pivote lo sigue con la escena ya montada, y eso no se avisa.
   */
  alAsentarVista?: (antes: VistaDeInstancia, despues: VistaDeInstancia) => void
  /**
   * El corte que se va a exportar, para dibujar su plano encima del hueso.
   *
   * Existe para que el traumatólogo vea DÓNDE corta antes de exportar: un
   * porcentaje y dos ángulos no se imaginan sobre una tibia, y lo que sale mal
   * solo se descubre abriendo el caso en la consola, varios pasos después. El
   * plano se calcula con `planoDelCorte` sobre el eje que `ejeDelHueso` mide en
   * la geometría cargada, que son las mismas funciones y los mismos vértices
   * con los que el servidor parte la malla: lo que se ve aquí es lo que sale.
   *
   * `null` no dibuja nada. Solo lo pasa el taller; las fichas no.
   */
  corte?: CorteDeHueso | null
  mando?: RefObject<MandoDelVisor | null>
}) {
  const lienzo = useRef<HTMLDivElement>(null)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [nombreFlotante, setNombreFlotante] = useState<{ texto: string; x: number; y: number } | null>(
    null,
  )
  /** El marco de selección mientras se arrastra, en píxeles del lienzo. */
  const [marco, setMarco] = useState<{ x: number; y: number; ancho: number; alto: number } | null>(
    null,
  )

  // Todo lo de three vive aquí: React no debe re-crear la escena al re-pintar.
  const taller = useRef<TallerDelVisor>({})

  // Las props que lee el bucle sin re-montarlo.
  //
  // Se refresca en un efecto y no durante el pintado: escribir en un ref
  // mientras se pinta rompe con el pintado concurrente, que puede empezar un
  // render y descartarlo. Este efecto va declarado **antes** que el de montaje
  // para que, cuando aquel se ejecute, el ref ya tenga los valores de este
  // pintado y no los del primero.
  const ultimas = useRef({
    visibles,
    resaltada,
    separacion,
    alPulsarPieza,
    seleccion,
    alSeleccionar,
    herramienta,
    alAsentarVista,
    soloLectura,
    vistaInicial,
  })
  useEffect(() => {
    ultimas.current = {
      visibles,
      resaltada,
      separacion,
      alPulsarPieza,
      seleccion,
      alSeleccionar,
      herramienta,
      alAsentarVista,
      soloLectura,
      vistaInicial,
    }
  })

  useImperativeHandle(mando, () => ({
    vistaActual: () => {
      const t = taller.current
      const { visibles: v, separacion: s } = ultimas.current
      // Con una recolocación esperando, se suma el salto que dará cuando se
      // cumpla la espera, calculado con la misma función con la que lo dará y
      // con las mismas props que leerá entonces. Sin espera no hay salto que
      // sumar: lo que el pivote tenía que atender ya lo atendió, y recalcularlo
      // aquí recolocaría en la respuesta un objetivo que `irA` o «Encuadrar»
      // dejaron a propósito donde está.
      const salto = t.esperaDelPivote === undefined ? null : saltoDelPivote(t, catalogo, v, s)
      return vistaDe(t, s, salto)
    },
    encuadrar: () => {
      const t = taller.current
      // Lo pendiente del pivote se tira: «Encuadrar» deja el objetivo en el
      // centro exacto de lo visible, y un deslizamiento a medias que siguiera
      // sumando después lo sacaría de ahí.
      cancelarPivote(t)
      const { visibles: v, separacion: s } = ultimas.current
      encuadrarVisible(t, catalogo, v, s)
      t.seleccionDelPivote = { visibles: v, separacion: s }
    },
    irA: (vista, visibles) => {
      const t = taller.current
      const { camara, controles } = t
      if (!camara || !controles) return vista
      cancelarPivote(t)
      camara.position.set(...vista.camara)
      controles.target.set(...vista.objetivo)
      const seleccion = visibles === undefined ? ultimas.current.visibles : visibles
      if (!t.escena && vista.separacion > 0) {
        // Sin escena y con el cuerpo separado no se decide: se anota la
        // selección y decide `recolocarAlCargar`, que es quien tiene la caja
        // buena. Aquí `cajaDeLoVisible` recibiría `datos` sin definir y mediría
        // el cuerpo SIN separar, así que un objetivo que su autor llevó sobre la
        // pieza separada —el foco de fractura— caía fuera de esa caja y se
        // recolocaba al centro sin separar. Al terminar la carga se volvía a
        // decidir, ya con la caja buena, sobre un objetivo que ya no era el
        // suyo, y se movía otra vez: el encuadre del autor se perdía sin avisar.
        //
        // Sin separación sí se decide aquí: esa caja no mira `datos` y sale la
        // misma antes y después de la carga, así que decidir ahora da la misma
        // respuesta que daría la carga, y `vistaActual()` la tiene desde ya.
        t.seleccionDelPivote = { visibles: seleccion, separacion: vista.separacion }
      } else {
        recolocarVistaGuardada(t, catalogo, seleccion, vista.separacion)
      }
      controles.update()
      t.pedirDibujo?.()
      return vistaDe(t, vista.separacion)
    },
    encuadrarPiezas: (piezas) => {
      if (piezas.size === 0) return
      const t = taller.current
      cancelarPivote(t)
      const { visibles: v, separacion: s } = ultimas.current
      encuadrarVisible(t, catalogo, piezas, s)
      // El pivote queda sobre la selección a propósito, y se anota como
      // atendido para lo que hay encendido: sin eso, el efecto que sigue a lo
      // visible lo devolvería al centro de todo en el siguiente cambio que no
      // cambia nada.
      t.seleccionDelPivote = { visibles: v, separacion: s }
    },
    mirarDesde: (lado) => {
      const t = taller.current
      const { camara, controles } = t
      if (!camara || !controles) return
      cancelarPivote(t)
      const distancia = camara.position.distanceTo(controles.target)
      camara.position.copy(controles.target).addScaledVector(DIRECCION_DE_CADA_LADO[lado], distancia)
      controles.update()
      t.pedirDibujo?.()
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

    taller.current = {
      render,
      tresD,
      camara,
      controles,
      pedirDibujo,
      // La vista con la que se monta ya está decidida para esta selección: el
      // efecto que sigue a lo visible no tiene nada que atender hasta que
      // cambie. Qué hacer con ella al terminar la carga lo decide
      // `recolocarAlCargar`, más abajo.
      seleccionDelPivote: {
        visibles: ultimas.current.visibles,
        separacion: ultimas.current.separacion,
      },
    }

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
        aplicarVisibilidad(
          escena,
          catalogo,
          ultimas.current.visibles,
          ultimas.current.resaltada,
          ultimas.current.seleccion,
        )
        aplicarSeparacion(escena, ultimas.current.separacion)
        // Aquí y no al montar: con el cuerpo separado la caja de lo visible
        // necesita las direcciones que acaba de escribir `prepararDirecciones`.
        const asentada = recolocarAlCargar(
          taller.current,
          catalogo,
          ultimas.current.visibles,
          ultimas.current.separacion,
        )
        // Del ref, como `alPulsarPieza`: este efecto solo se monta una vez por
        // catálogo y la prop de su primer pintado puede ser otra función.
        if (asentada) ultimas.current.alAsentarVista?.(asentada.antes, asentada.despues)
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
    /** Esquina donde empezó el marco, en píxeles del lienzo; `null` si no hay marco. */
    let inicioDelMarco: { x: number; y: number } | null = null

    const enElLienzo = (evento: PointerEvent) => {
      const caja = render.domElement.getBoundingClientRect()
      return { x: evento.clientX - caja.left, y: evento.clientY - caja.top }
    }
    const cursorDeReposo = () => (ultimas.current.herramienta === 'caja' ? 'crosshair' : 'grab')

    const aCoordenadas = (evento: PointerEvent) => {
      const caja = render.domElement.getBoundingClientRect()
      puntero.set(
        ((evento.clientX - caja.left) / caja.width) * 2 - 1,
        -((evento.clientY - caja.top) / caja.height) * 2 + 1,
      )
      return { x: evento.clientX - caja.left, y: evento.clientY - caja.top }
    }

    const alBajar = (evento: PointerEvent) => {
      render.domElement.style.cursor =
        ultimas.current.herramienta === 'caja' && evento.button === 0 ? 'crosshair' : 'grabbing'
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
      const { herramienta: h, alSeleccionar: avisar, soloLectura: lectura } = ultimas.current
      if (h === 'caja' && avisar && !lectura) {
        inicioDelMarco = enElLienzo(evento)
        // Con la captura, soltar fuera del lienzo sigue llegando aquí: sin
        // ella, un marco que se saliera por el borde se quedaba pintado para
        // siempre, esperando un `pointerup` que recibió otro elemento.
        render.domElement.setPointerCapture(evento.pointerId)
      }
    }

    const alMover = (evento: PointerEvent) => {
      // `buttons` y no `bajado`: desde que `bajado` sigue solo al izquierdo,
      // preguntarle a él dejaría el cruce de rayos corriendo durante un
      // encuadre con el derecho, que es justo cuando no sirve para nada.
      const arrastrando = evento.buttons !== 0
      if (inicioDelMarco) {
        const ahora = enElLienzo(evento)
        setMarco({
          x: Math.min(inicioDelMarco.x, ahora.x),
          y: Math.min(inicioDelMarco.y, ahora.y),
          ancho: Math.abs(ahora.x - inicioDelMarco.x),
          alto: Math.abs(ahora.y - inicioDelMarco.y),
        })
        setNombreFlotante(null)
        return
      }
      render.domElement.style.cursor = arrastrando ? 'grabbing' : cursorDeReposo()
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
      // En español: es el único sitio del visor donde se lee un nombre, y quien
      // pasa el ratón por la pierna es un residente que estudia en español.
      // Lo que no tiene traducción sale con el original, sin inventar nada.
      setNombreFlotante({
        texto: nombreEnEspanol(catalogo.piezas[indice].nombre),
        x: local.x,
        y: local.y,
      })
    }

    const alSubir = (evento: PointerEvent) => {
      render.domElement.style.cursor = cursorDeReposo()
      // Soltar el derecho o el central no cancela nada: el izquierdo puede
      // seguir pulsado y su gesto sigue vivo, así que se sale sin tocar
      // `bajado`.
      if (evento.button !== 0 || !evento.isPrimary) return

      const inicio = bajado
      bajado = null
      const esquina = inicioDelMarco
      inicioDelMarco = null
      setMarco(null)
      if (render.domElement.hasPointerCapture(evento.pointerId)) {
        render.domElement.releasePointerCapture(evento.pointerId)
      }

      const escena = taller.current.escena
      // Sin `pointerdown` propio no hay clic: un arrastre que empezó fuera del
      // lienzo y termina encima no es una pulsación sobre la pieza.
      if (!inicio || !escena || ultimas.current.soloLectura) return

      const umbral = evento.pointerType === 'touch' ? 12 : 5
      const avisar = ultimas.current.alSeleccionar
      if (Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) > umbral) {
        // Un arrastre de verdad: o fue un giro de cámara, y aquí no hay nada
        // que hacer, o fue un marco.
        if (!esquina || !avisar) return
        const lienzoDom = render.domElement
        const dentro = piezasEnElRectangulo(
          escena,
          camara,
          rectanguloNormalizado(
            esquina,
            enElLienzo(evento),
            lienzoDom.clientWidth,
            lienzoDom.clientHeight,
          ),
          ultimas.current.separacion,
        )
        // Mayús suma y Ctrl quita, como en Blender. Un marco vacío sin teclas
        // vacía la selección, igual que un clic en el vacío.
        avisar(
          dentro.map((i) => catalogo.piezas[i].id),
          evento.shiftKey ? 'sumar' : evento.ctrlKey || evento.metaKey ? 'quitar' : 'reemplazar',
        )
        return
      }

      aCoordenadas(evento)
      rayo.setFromCamera(puntero, camara)
      const indice = piezaBajoElRayo(rayo, catalogo, escena, ultimas.current.separacion)
      if (avisar) {
        if (indice >= 0) {
          avisar([catalogo.piezas[indice].id], evento.shiftKey ? 'alternar' : 'reemplazar')
        } else if (!evento.shiftKey) {
          avisar([], 'reemplazar')
        }
        return
      }
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
      // El deslizamiento del pivote va dentro del bucle y antes de
      // `controles.update()`, para que OrbitControls calcule el giro de este
      // fotograma ya sobre el objetivo movido. Con su propio
      // `requestAnimationFrame` serían dos bucles escribiendo la misma cámara
      // en un orden que nadie decide.
      const deslizando = avanzarPivote(taller.current, performance.now())
      const movio = controles.update()
      if (!sucio && !movio && !deslizando) return
      sucio = false
      render.render(tresD, camara)
    })

    return () => {
      vivo = false
      aborto.abort()
      // Una recolocación esperando dispararía sobre controles ya liberados.
      cancelarPivote(taller.current)
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
      quitarElCorte(taller.current)
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
    seleccion: Set<string> | null
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
    //
    // La selección se compara igual, por identidad: quien la cambia entrega un
    // `Set` nuevo. Cambia con un clic o con un marco, no al pasar el ratón, así
    // que el repaso completo que provoca no cae en el gesto frecuente.
    if (
      anterior &&
      anterior.escena === escena &&
      anterior.visibles === visibles &&
      anterior.seleccion === seleccion
    ) {
      cambiarResaltado(escena, visibles, seleccion, anterior.resaltada, resaltada)
    } else {
      aplicarVisibilidad(escena, catalogo, visibles, resaltada, seleccion)
    }
    pintado.current = { escena, visibles, resaltada, seleccion }
    taller.current.pedirDibujo?.()
  }, [catalogo, visibles, resaltada, seleccion])

  // La herramienta cambia qué botón gira la cámara. Con el marco, el izquierdo
  // deja de ser de OrbitControls —un valor que no reconoce lo deja sin acción— y
  // el giro pasa al central, donde lo tiene Blender; el derecho sigue
  // desplazando en las dos. En pantalla táctil, un dedo dibuja el marco y dos
  // siguen acercando y desplazando. `catalogo` entra porque al cambiar se monta
  // otro `OrbitControls`, que nace con el reparto de siempre.
  useEffect(() => {
    const controles = taller.current.controles
    if (!controles) return
    const conMarco = herramienta === 'caja'
    controles.mouseButtons = {
      LEFT: conMarco ? (-1 as THREE.MOUSE) : THREE.MOUSE.ROTATE,
      MIDDLE: conMarco ? THREE.MOUSE.ROTATE : THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    controles.touches = {
      ONE: conMarco ? (-1 as THREE.TOUCH) : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    }
  }, [catalogo, herramienta])

  useEffect(() => {
    const escena = taller.current.escena
    if (!escena) return
    aplicarSeparacion(escena, separacion)
    taller.current.pedirDibujo?.()
  }, [separacion])

  // ------------------------------------------------------- la vista del corte
  //
  // Se redibuja entero con cada cambio de los mandos: son un disco, un aro y
  // una bola, y rehacerlos cuesta menos que llevar la cuenta de qué cambió. El
  // eje, que es lo caro, se recuerda por pieza (`ejes` en el taller del visor).
  //
  // `progreso` está en las dependencias por el primer dibujo: el corte puede
  // llegar antes que la geometría —el panel de exportar se abre mientras bajan
  // los paquetes—, y sin escena no hay eje que medir. Cuando la carga termina,
  // `progreso` pasa a 100 y el efecto vuelve a correr con la escena ya puesta.
  //
  // La separación entra porque el sombreador mueve cada pieza al separar el
  // cuerpo, y el plano tiene que irse con su hueso o cortaría el aire.
  useEffect(() => {
    const t = taller.current
    pintarElCorte(t, corte, separacion)
    t.pedirDibujo?.()
  }, [catalogo, corte, separacion, progreso])

  // ------------------------------------------------- el pivote sigue a lo visible
  //
  // Cada vez que cambian las piezas encendidas o la separación, el punto sobre
  // el que gira la cámara se va al centro de lo que queda. Sin esto, dejar la
  // pierna sola la hacía girar alrededor de la pelvis de un cuerpo apagado, y
  // la rueda acercaba la cámara a un hueco (ver `src/atlas/pivote.ts`).
  //
  // No se recoloca en el acto sino tras `ESPERA_DEL_PIVOTE_MS` sin cambios: el
  // traumatólogo apaga piezas de una en una en el árbol y arrastra el
  // deslizador de separación, y recolocar en cada paso serían veinte
  // deslizamientos seguidos que no dejarían mirar nada. La espera solo la
  // cumple su reloj: `vistaActual()` pregunta cuánto saltará sin darle prisa,
  // porque el taller se lo pregunta tras cada clic en el lienzo y adelantarla
  // ahí deshacía la agrupación justo en el gesto de apagar piezas con el ratón.
  //
  // La separación entra porque mueve lo visible de verdad: con la pierna sola y
  // el cuerpo abierto, la pierna se aleja del eje y el pivote se quedaría atrás.
  //
  // Lo que ya está atendido no se vuelve a atender: `irA` y la carga anotan en
  // `seleccionDelPivote` la selección con la que decidieron, y cuando el cambio
  // que llega aquí es ese mismo —abrir una preparación pide a React las piezas
  // nuevas y llama a `irA` con ellas—, se sale sin tocar la cámara. Se compara
  // por identidad del `Set` por la misma razón que el efecto de visibilidad: el
  // taller y el árbol construyen uno nuevo en cada cambio.
  useEffect(() => {
    const t = taller.current
    if (!t.escena) return
    const previa = t.seleccionDelPivote
    if (previa && previa.visibles === visibles && previa.separacion === separacion) return
    cancelarEspera(t)
    t.esperaDelPivote = setTimeout(() => {
      // Del ref en el momento de disparar, no de este pintado: si llegaron más
      // cambios durante la espera, cada uno reinició el reloj y el último es
      // el que manda.
      const actual = taller.current
      seguirLoVisible(
        actual,
        catalogo,
        ultimas.current.visibles,
        ultimas.current.separacion,
        true,
      )
    }, ESPERA_DEL_PIVOTE_MS)
  }, [catalogo, visibles, separacion])


  return (
    // La cruz del marco se pone por clase y no escribiendo el cursor del lienzo:
    // los manejadores del ratón ya lo escriben en cada gesto, y la clase manda
    // sobre todos ellos mientras dure la herramienta.
    <div className={herramienta === 'caja' ? 'atlas-lienzo atlas-lienzo-marco' : 'atlas-lienzo'} ref={lienzo}>
      {progreso < 100 && !error ? (
        <div className="atlas-cargando">
          <div className="atlas-barra">
            <span style={{ width: `${progreso}%` }} />
          </div>
          <p>Cargando anatomía… {progreso}%</p>
        </div>
      ) : null}

      {error ? <div className="atlas-error">{error}</div> : null}

      {marco ? (
        <div
          className="atlas-marco-de-seleccion"
          style={{ left: marco.x, top: marco.y, width: marco.ancho, height: marco.alto }}
        />
      ) : null}

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
  seleccion: Set<string> | null = null,
) {
  catalogo.piezas.forEach((pieza, i) => {
    const encendida = !visibles || visibles.has(pieza.id)
    escena.datos[i * 4 + 3] = estadoDe(encendida, pieza.id === resaltada, !!seleccion?.has(pieza.id))
  })
  escena.estados.needsUpdate = true
}

/**
 * El estado que le toca a una pieza. Está en un solo sitio porque lo escriben
 * dos funciones —el repaso completo y el cambio de resaltado— y cuando cada una
 * tenía su fórmula bastaba con tocar una para que el resaltado dejara encendida
 * una pieza apagada.
 *
 * El resaltado gana a la selección: es lo que dice «el ratón está aquí», dura
 * lo que dura el ratón encima, y al irse la pieza vuelve a su naranja.
 */
function estadoDe(encendida: boolean, resaltada: boolean, seleccionada: boolean): number {
  if (!encendida) return ESTADO.OCULTA
  if (resaltada) return ESTADO.RESALTADA
  return seleccionada ? ESTADO.SELECCIONADA : ESTADO.VISIBLE
}

/** Hacia dónde se aparta la cámara del pivote para mirar desde cada lado. */
const DIRECCION_DE_CADA_LADO: Record<LadoDeLaVista, THREE.Vector3> = {
  frente: new THREE.Vector3(0, 0, 1),
  atras: new THREE.Vector3(0, 0, -1),
  // La derecha es la del PACIENTE, que mira hacia +Z: su derecha es −X. Es la
  // convención de toda imagen clínica, y la contraria a la de Blender.
  derecha: new THREE.Vector3(-1, 0, 0),
  izquierda: new THREE.Vector3(1, 0, 0),
  // No exactamente vertical: OrbitControls no deja la cámara sobre el polo, y
  // con (0, 1, 0) justo el primer `update()` la recoloca con un giro que nadie
  // pidió.
  arriba: new THREE.Vector3(0, 1, 0.001).normalize(),
  abajo: new THREE.Vector3(0, -1, 0.001).normalize(),
}

/**
 * Mueve el resaltado de una pieza a otra sin repasar el catálogo.
 *
 * Escribe exactamente el mismo estado que `aplicarVisibilidad` —las dos lo
 * sacan de `estadoDe`—, pero tocando solo las dos que cambian. Son las únicas
 * que pueden cambiar: el resaltado es uno y solo uno.
 */
function cambiarResaltado(
  escena: EscenaDelAtlas,
  visibles: Set<string> | null,
  seleccion: Set<string> | null,
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
    marcarPieza(escena, i, estadoDe(encendida, resaltar, !!seleccion?.has(id)))
  }
  escribir(antes, false)
  escribir(ahora, true)
}

/**
 * Encuadra la cámara sobre lo que esté encendido.
 *
 * La caja sale de `cajaDeLoVisible`, la misma que usa el pivote, y ya trae la
 * separación aplicada: ver allí por qué eso no es un adorno. Sin trasladarla,
 * el botón que existe para volver a ver el modelo enseñaba menos modelo que
 * antes justo con el cuerpo abierto.
 */
function encuadrarVisible(
  taller: TallerDelVisor,
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
  separacion: number,
) {
  const { camara, controles, escena } = taller
  if (!camara || !controles) return

  const caja = cajaDeLoVisible(catalogo, visibles, separacion, escena?.datos)
  if (!caja) return

  const centro = caja.getCenter(new THREE.Vector3())
  const tamano = caja.getSize(new THREE.Vector3())
  const radio = Math.max(tamano.x, tamano.y, tamano.z) / 2
  const distancia = (radio / Math.tan((camara.fov * Math.PI) / 360)) * 1.6

  controles.target.copy(centro)
  camara.position.copy(centro).add(new THREE.Vector3(0.35, 0.12, 1).normalize().multiplyScalar(distancia))
  controles.update()
  taller.pedirDibujo?.()
}

// ------------------------------------------------------------------ el pivote

/**
 * Lo que el visor guarda fuera de React: la escena, la cámara y, desde que el
 * pivote sigue a lo visible, el estado de esa recolocación.
 *
 * `seleccionDelPivote` es la selección para la que se decidió el pivote por
 * última vez. Es lo que deja al efecto de seguimiento distinguir un cambio del
 * traumatólogo —que hay que seguir— de uno que ya atendió `irA` o la carga
 * —que no—.
 */
interface TallerDelVisor {
  escena?: EscenaDelAtlas
  render?: THREE.WebGLRenderer
  tresD?: THREE.Scene
  camara?: THREE.PerspectiveCamera
  controles?: OrbitControls
  pedirDibujo?: () => void
  traslacion?: TraslacionDelPivote
  esperaDelPivote?: ReturnType<typeof setTimeout>
  seleccionDelPivote?: { visibles: Set<string> | null; separacion: number }
  /** Lo que dibuja el plano del corte, si lo hay (ver `pintarElCorte`). */
  vistaDelCorte?: THREE.Group
  /**
   * El eje de cada pieza que ya se midió, o `null` si no se pudo medir. Vale lo
   * que vale la escena: al montar otra, el taller entero se vacía y esto con él.
   */
  ejes?: Map<string, EjeDelHueso | null>
}

/**
 * La cámara tal como va a quedar, redondeada a milímetros para guardarla.
 *
 * Suma lo que le falta al deslizamiento en curso: sin eso, guardar a mitad de
 * él escribiría un objetivo a medio camino entre el cuerpo y la pierna, que al
 * abrir la ficha no sería ni una cosa ni la otra.
 *
 * `salto` es la recolocación que todavía espera, si la hay (ver
 * `saltoDelPivote`). Entra aquí, antes de redondear, y no se suma después a la
 * vista ya redondeada: dos redondeos seguidos acumulan hasta un milímetro por
 * eje, y el taller da la cámara por movida a partir de dos.
 */
function vistaDe(
  taller: TallerDelVisor,
  separacion: number,
  salto: THREE.Vector3 | null = null,
): VistaDeInstancia {
  const { camara, controles } = taller
  if (!camara || !controles) return { camara: [0, 1, 3], objetivo: [0, 1, 0], separacion: 0 }
  const resto = restoDeLaTraslacion(taller.traslacion)
  if (salto) resto.add(salto)
  const ojo = camara.position.clone().add(resto)
  const objetivo = controles.target.clone().add(resto)
  return {
    camara: [redondear(ojo.x), redondear(ojo.y), redondear(ojo.z)],
    objetivo: [redondear(objetivo.x), redondear(objetivo.y), redondear(objetivo.z)],
    separacion,
  }
}

/**
 * Si quien mira ha pedido menos movimiento al sistema.
 *
 * Se pregunta en cada recolocación y no una vez al montar: es un ajuste del
 * sistema que se puede cambiar con la pestaña abierta. Con él puesto, el pivote
 * se recoloca igual —girar sobre lo que se ve no es un adorno— pero de golpe,
 * sin deslizamiento.
 */
function prefiereMenosMovimiento(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function cancelarEspera(taller: TallerDelVisor) {
  if (taller.esperaDelPivote === undefined) return
  clearTimeout(taller.esperaDelPivote)
  taller.esperaDelPivote = undefined
}

/** Tira lo pendiente del pivote: la espera y el deslizamiento a medias. */
function cancelarPivote(taller: TallerDelVisor) {
  cancelarEspera(taller)
  taller.traslacion = undefined
}

/**
 * Cuánto tiene que moverse todavía el pivote para quedar en el centro de lo
 * visible, contado desde donde lo va a dejar el deslizamiento en curso. `null`
 * si ya está en sitio o si no hay nada encendido.
 *
 * Es solo la cuenta, sin tocar nada, y la usan los dos que tienen que estar de
 * acuerdo: `seguirLoVisible`, que da el salto, y `vistaActual()`, que devuelve
 * dónde quedará la cámara antes de que se dé. Con una copia de la cuenta en
 * cada uno, el día que una cambiara se guardaría un encuadre y el pivote
 * acabaría en otro, y el taller preguntaría por cambios que nadie ha hecho.
 *
 * Decide contra el DESTINO del deslizamiento en curso y no contra el objetivo
 * de este fotograma: a mitad de camino hacia la pierna, el objetivo todavía
 * está lejos de ella, y comparar con él arrancaría un deslizamiento nuevo por
 * cada pieza que se apagara durante el anterior.
 */
function saltoDelPivote(
  taller: TallerDelVisor,
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
  separacion: number,
): THREE.Vector3 | null {
  const { controles } = taller
  if (!controles) return null
  const caja = cajaDeLoVisible(catalogo, visibles, separacion, taller.escena?.datos)
  const destino = controles.target.clone().add(restoDeLaTraslacion(taller.traslacion))
  if (!caja || pivoteEnSitio(destino, caja)) return null
  return caja.getCenter(new THREE.Vector3()).sub(destino)
}

/**
 * Lleva el pivote al centro de lo visible trasladando cámara y objetivo juntos.
 *
 * El total se mide desde el objetivo de ahora, no desde el destino, porque el
 * deslizamiento nuevo sustituye al anterior y empieza donde está la cámara: es
 * lo que le faltaba al anterior más el salto nuevo.
 */
function seguirLoVisible(
  taller: TallerDelVisor,
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
  separacion: number,
  animar: boolean,
) {
  cancelarEspera(taller)
  taller.seleccionDelPivote = { visibles, separacion }
  const { camara, controles } = taller
  if (!camara || !controles) return

  const salto = saltoDelPivote(taller, catalogo, visibles, separacion)
  if (!salto) return

  const total = restoDeLaTraslacion(taller.traslacion).add(salto)
  const ahora = performance.now()
  const duracion = animar && !prefiereMenosMovimiento() ? DURACION_DEL_PIVOTE_MS : 0
  taller.traslacion = crearTraslacion(total, ahora, duracion)
  if (duracion === 0) {
    avanzarPivote(taller, ahora)
    controles.update()
  }
  taller.pedirDibujo?.()
}

/**
 * Aplica el paso de este fotograma. Devuelve si hubo algo que mover, para que
 * el bucle —que solo dibuja cuando algo cambia— sepa que tiene que dibujar.
 */
function avanzarPivote(taller: TallerDelVisor, ahora: number): boolean {
  const { traslacion, camara, controles } = taller
  if (!traslacion || !camara || !controles) return false
  const { paso, terminada } = avanzarTraslacion(traslacion, ahora)
  camara.position.add(paso)
  controles.target.add(paso)
  if (terminada) taller.traslacion = undefined
  return true
}

/**
 * Qué hacer con una vista guardada al ponerla en pantalla: al montar una ficha
 * o al abrir una preparación en el taller.
 *
 * Se respeta tal cual salvo en dos casos, que son las dos formas en que una
 * preparación guardada antes de que el pivote siguiera a lo visible hace girar
 * la pierna alrededor de un cuerpo que no está:
 *
 *  - su objetivo es el de `VISTA_INICIAL` (ver `esElObjetivoPorOmision`), o
 *  - su objetivo cae fuera de lo que se ve (ver `objetivoFueraDeLoVisible`):
 *    el que dejó «Encuadrar» con el cuerpo entero antes de apagar el resto, o
 *    un desplazamiento con el botón derecho que no llegó a la pierna.
 *
 * Solo con el primero, esas segundas seguían rotas: el centro del cuerpo está a
 * 3,5 cm del objetivo por omisión, lejos de los dos milímetros con los que se
 * reconoce. Un objetivo dentro de lo visible lo puso ahí quien preparó la
 * vista —«Encuadrar» sobre la pierna, o llevado a mano sobre el foco de
 * fractura— y moverlo al abrir desharía su trabajo sin avisar.
 *
 * Y el primero no sobra ahora que está el segundo. La regla general es la de
 * la caja: se respeta el encuadre guardado salvo que su objetivo caiga fuera de
 * lo que se ve, que es la huella de haberse guardado con el fallo. Pero en una
 * preparación central como la pelvis —los dos coxales y el sacro del atlas van
 * de y = 0,83 a 1,04— el objetivo por omisión cae DENTRO de la caja, y la
 * segunda regla lo daría por del autor cuando nadie lo eligió: es donde nace la
 * cámara. Con los dos, esa pelvis gira sobre su centro, a 4,7 cm del de
 * omisión. Reconocerlo aparte cuesta poco, porque `seguirLoVisible` solo lo
 * mueve si además está lejos del centro.
 *
 * Recolocar pasa por `seguirLoVisible`, que vuelve a mirar `pivoteEnSitio`
 * (dentro de `saltoDelPivote`): el
 * cuerpo completo con la vista por omisión no se mueve, y no por un caso
 * aparte, sino porque su centro cae dentro de esa holgura.
 *
 * Sin deslizamiento: es la primera imagen que se ve de esa preparación, y un
 * deslizamiento ahí enseñaría un encuadre que nadie guardó.
 */
function recolocarVistaGuardada(
  taller: TallerDelVisor,
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
  separacion: number,
) {
  const { controles } = taller
  const caja = cajaDeLoVisible(catalogo, visibles, separacion, taller.escena?.datos)
  if (
    controles &&
    (esElObjetivoPorOmision(controles.target) || objetivoFueraDeLoVisible(controles.target, caja))
  ) {
    seguirLoVisible(taller, catalogo, visibles, separacion, false)
  } else {
    taller.seleccionDelPivote = { visibles, separacion }
  }
}

/**
 * El pivote al terminar la descarga.
 *
 * Si la selección cambió mientras bajaban los paquetes —el árbol está vivo esos
 * 31 MB—, es un cambio del traumatólogo como cualquier otro y el pivote lo
 * sigue: el efecto de seguimiento no pudo atenderlo porque todavía no había
 * escena. Si no cambió, la vista es la guardada y pasa por
 * `recolocarVistaGuardada`.
 *
 * De golpe en los dos casos, porque hasta aquí el lienzo estaba tapado por la
 * barra de carga y no hay nada que el ojo tenga que seguir.
 *
 * Devuelve la cámara de antes y la de después cuando la vista guardada se
 * movió, y `null` en otro caso. Es lo que el montaje le pasa a `alAsentarVista`:
 * quien tomó esa vista como referencia —el taller, con lo que le devolvió `irA`
 * o con la `vistaInicial` que puso— la daría si no por movida sin que nadie la
 * hubiera tocado. Se comparan las vistas ya redondeadas, las mismas que el
 * taller guarda, y no la cámara cruda: la deriva de coma flotante de
 * OrbitControls no es un cambio que haya que contar.
 */
function recolocarAlCargar(
  taller: TallerDelVisor,
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
  separacion: number,
): { antes: VistaDeInstancia; despues: VistaDeInstancia } | null {
  const previa = taller.seleccionDelPivote
  if (previa && previa.visibles === visibles && previa.separacion === separacion) {
    const antes = vistaDe(taller, separacion)
    recolocarVistaGuardada(taller, catalogo, visibles, separacion)
    const despues = vistaDe(taller, separacion)
    return mismaVista(antes, despues) ? null : { antes, despues }
  }
  seguirLoVisible(taller, catalogo, visibles, separacion, false)
  return null
}

/** Si dos vistas ya redondeadas son la misma, coordenada a coordenada. */
function mismaVista(a: VistaDeInstancia, b: VistaDeInstancia): boolean {
  return (
    a.camara.every((n, i) => n === b.camara[i]) && a.objetivo.every((n, i) => n === b.objetivo[i])
  )
}

// ------------------------------------------------------------- la vista del corte

/**
 * El color del plano: un magenta saturado.
 *
 * No rojo, que era lo obvio para «corte»: el músculo del atlas es #b6544c y las
 * arterias #c2392f, y un plano rojo sobre una pierna con su musculatura no se
 * distingue. Tampoco azul, que es el del resaltado al pasar por el árbol.
 * Ningún sistema del catálogo usa nada parecido a este.
 */
const COLOR_DEL_CORTE = 0xe8198b

/** Quita y libera lo que dibujaba el corte. */
function quitarElCorte(taller: TallerDelVisor) {
  const vista = taller.vistaDelCorte
  if (!vista) return
  vista.removeFromParent()
  vista.traverse((objeto) => {
    const conGeometria = objeto as THREE.Mesh
    conGeometria.geometry?.dispose()
    const material = conGeometria.material as THREE.Material | undefined
    material?.dispose()
  })
  taller.vistaDelCorte = undefined
}

/**
 * El eje de una pieza medido sobre la malla fundida de su sistema, con su rango.
 *
 * Son los mismos vértices, en el mismo orden, que el servidor lee del paquete
 * para esa pieza sola: `montarEscena` copia sus posiciones tal cual y corre los
 * índices, así que el eje sale igual hasta el último decimal. `null` si la pieza
 * no se llegó a montar —estaba apagada al cargar— y no hay geometría que medir.
 */
function medirEje(escena: EscenaDelAtlas, indice: number): EjeDelHueso | null {
  const rango = escena.rangos.get(indice)
  if (!rango) return null
  const geometria = escena.mallas[rango.malla]?.geometry
  const posiciones = geometria?.getAttribute('position')?.array
  const indices = geometria?.getIndex()?.array
  if (!posiciones || !indices) return null
  return ejeDelHueso(posiciones, indices, rango.inicio, rango.cuenta)
}

/**
 * Dibuja el plano de un corte sobre su hueso: un disco translúcido, su aro y
 * una bola en el extremo del fragmento que se mueve.
 *
 * El disco respeta la profundidad, así que dentro del hueso lo tapa el propio
 * hueso y lo que se ve es justo la línea por donde sale: la línea de fractura.
 * El aro no la respeta y se ve siempre, también por detrás del hueso, para que
 * la inclinación se lea desde cualquier lado sin tener que girar. La bola dice
 * qué trozo es el fragmento, que es lo que más fácil se confunde al leer
 * «proximal» sobre un modelo que está girado.
 *
 * El disco mide algo más que el ancho del hueso y crece con la inclinación, que
 * es lo que alarga la sección: con el mismo radio, una oblicua de 60° quedaría
 * más corta que el hueso y parecería no atravesarlo.
 */
function pintarElCorte(taller: TallerDelVisor, corte: CorteDeHueso | null, separacion: number) {
  quitarElCorte(taller)
  const { escena, tresD } = taller
  if (!corte || !escena || !tresD) return
  const indice = escena.indices.get(corte.pieza)
  if (indice === undefined) return

  const ejes = (taller.ejes ??= new Map())
  if (!ejes.has(corte.pieza)) ejes.set(corte.pieza, medirEje(escena, indice))
  const eje = ejes.get(corte.pieza)
  if (!eje) return

  const plano = planoDelCorte(eje, corte)
  const coseno = Math.cos((corte.inclinacion * Math.PI) / 180)
  const radio = (eje.radio * 1.35) / Math.max(coseno, 0.3)

  const vista = new THREE.Group()
  // Lo mismo que suma el sombreador a cada vértice de la pieza al separar.
  vista.position.set(
    escena.datos[indice * 4] * separacion,
    escena.datos[indice * 4 + 1] * separacion,
    escena.datos[indice * 4 + 2] * separacion,
  )

  const enElPlano = new THREE.Group()
  enElPlano.position.set(...plano.punto)
  enElPlano.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(...plano.normal),
  )
  const disco = new THREE.Mesh(
    new THREE.CircleGeometry(radio, 64),
    new THREE.MeshBasicMaterial({
      color: COLOR_DEL_CORTE,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  const aro = new THREE.Mesh(
    new THREE.RingGeometry(radio * 0.94, radio, 64),
    new THREE.MeshBasicMaterial({
      color: COLOR_DEL_CORTE,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  )
  aro.renderOrder = 10
  enElPlano.add(disco, aro)

  const extremo = corte.fragmento === 'distal' ? eje.distal : eje.proximal
  const bola = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(eje.radio * 0.3, 0.003), 16, 12),
    new THREE.MeshBasicMaterial({ color: COLOR_DEL_CORTE, depthTest: false }),
  )
  bola.position.set(
    eje.centro[0] + eje.direccion[0] * extremo,
    eje.centro[1] + eje.direccion[1] * extremo,
    eje.centro[2] + eje.direccion[2] * extremo,
  )
  bola.renderOrder = 10

  vista.add(enElPlano, bola)
  tresD.add(vista)
  taller.vistaDelCorte = vista
}
