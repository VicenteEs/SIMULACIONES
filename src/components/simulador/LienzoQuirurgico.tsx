'use client'

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ruta } from '@/lib/rutas'
import { desplazamientoDesde, posicionAbsoluta, type EjeLargo } from '@/lib/reduccion'
import { reconciliarConElModelo } from '@/lib/simulador'
import { propuestaDelNodo, traducirMuestra, type PiezaEnEdicion } from '@/lib/piezasDelCaso'
import {
  aplicarColores,
  aplicarEntorno,
  aplicarPose,
  liberarHerramienta,
  prepararHerramienta,
  type HerramientaCargada,
} from '@/instrumental/herramienta3d'
import type { AjustesDeInstrumento, ArticulacionDeclarada } from '@/instrumental/modelo'
import type { PlanoDeCorte } from '@/lib/comportamientoDelInstrumento'
import { abrirCapa, cerrarCapa, cortarCapa, ladoDeLaHerida, type HeridaEnCapa } from './heridas'
import { cierreDeLaHerida, juicioDeLaPuntada, medirLaSutura, type HiloDeSutura, type MedidaDeLaSutura } from '@/lib/sutura'
import { agujeroBajoElPunto, colocarPlaca, colocarTornillo, crearImplantes, medirBajoElAgujero, quitarImplantes, quitarTornillos, type ImplantesEnEscena } from './implantesEnLaEscena'
import { largoSugerido, type EstadoDeLaFijacion, type QueColoca } from '@/lib/fijacion'
import { MAXIMO_DE_PUNTADAS, crearSutura, mallasVisibles, reconstruirHilo, soltarSutura, type SuturaEnEscena } from './hiloEnLaEscena'
// La regla base de `.consola-lienzo` vive en la hoja de la consola, y este
// lienzo lo monta también el taller de piezas del panel: sin importarla aquí,
// allí el contenedor mediría cero de alto. El porqué, en la cabecera de la hoja.
import '@/app/(frontend)/simulador/consola.css'

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

export type Modo = 'orbitar' | 'trazar' | 'mover' | 'senalar' | 'separar' | 'perforar' | 'coser' | 'fijar'

export interface Punto3 {
  x: number
  y: number
  z: number
}

/** Lo que el lienzo pudo y no pudo mostrar de lo que se le pidió (O-078). */
export interface ResultadoDeMostrar {
  /** Los nodos pedidos que el archivo no tiene. */
  ausentes: string[]
  /** No se pudo mostrar **ninguno** de los pedidos por su nombre. */
  sinCoincidencias: boolean
  /**
   * Con `sinCoincidencias`, lo que se enseñó fue lo que el modelo dice que es del
   * mismo papel (D-169) y no el modelo entero. Si no hay papel que case, `false`.
   */
  porPapel: boolean
}

/** Las dos proyecciones de un C-arm, y la vista libre del ratón. */
export type VistaDeEscopia = 'libre' | 'ap' | 'lateral'

export interface MandoDelLienzo {
  /**
   * Enciende o apaga los nodos indicados.
   *
   * Lo que el archivo no tiene se ignora, y si no tiene **nada** de lo pedido se
   * enseña el modelo entero y se dice (`sinCoincidencias`): antes eso apagaba
   * todas las mallas y el lienzo quedaba en negro (O-078).
   */
  mostrar: (nodos: string[] | null) => ResultadoDeMostrar
  /** ¿Trae el archivo el nodo declarado como fragmento móvil? */
  hayFragmento: () => boolean
  /** Los objetos que se ven ahora mismo: lo que el autor capturaría como «lo que se ve en este paso». */
  nodosVisibles: () => string[]
  /** Pone la cámara en una proyección de rayos X, o la devuelve a la libre. */
  mirarDesde: (vista: VistaDeEscopia) => void
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
  /**
   * Borra el trazo dibujado. La herida que ese trazo abrió **se queda**: el
   * residente pasa de un paso a otro y la piel cortada sigue cortada. Con
   * `deshacerCorte`, además, la cierra (el botón «Borrar trazo»).
   */
  borrarTrazo: (deshacerCorte?: boolean) => void
  /** Cierra todas las heridas: la piel y el músculo vuelven a como estaban. */
  cerrarHeridas: () => void
  /** Abre (o cierra) las heridas hasta `mm` de apertura, sin arrastrar. */
  abrirHeridas: (mm: number) => void
  /** Lo que hay abierto ahora mismo, o `null` si no se ha cortado nada. */
  estadoDeLasHeridas: () => EstadoDeLasHeridas | null
  /** Quita los agujeros hechos con la broca. */
  borrarAgujeros: () => void
  /** Quita la última puntada de la sutura (y, si la herida se había cerrado con ella, la reabre en lo que corresponda). */
  deshacerPuntada: () => void
  /** Quita toda la sutura y devuelve la herida a como estaba antes de coser. */
  quitarSutura: () => void
  /** La próxima puntada empieza una línea nueva: no se une con la anterior. */
  nuevaLineaDeSutura: () => void
  /** Quita los tornillos puestos, y la placa si `conPlaca`. */
  quitarImplantes: (conPlaca: boolean) => void
  /** Lo que hay fijado ahora mismo, o `null` si no hay placa. */
  estadoDeLaFijacion: () => EstadoDeLaFijacion | null
  /** Encuadra lo que esté visible. */
  encuadrar: () => void
  /** Los nombres de los objetos que trae el archivo. */
  nodosDelModelo: () => string[]
  /**
   * Cada objeto del archivo con lo que trae pegado en `userData`.
   *
   * Es por donde llegan al taller de piezas el rol y la etiqueta que el
   * exportador del atlas escribe en los `extras` de cada nodo. Va aparte de
   * `nodosDelModelo`, y no en su lugar, porque la consola y la lista de «sin
   * usar» solo necesitan nombres y no tienen por qué cambiar.
   */
  datosDeLosNodos: () => DatosDeNodo[]
}

/** El instrumento que el residente tiene en la mano, ya con lo que el administrador retocó. */
export interface InstrumentoEnEscena {
  url: string
  ajustes: AjustesDeInstrumento | null
  /** El valor de cada articulación, en su unidad (grados o milímetros). */
  articulaciones: Record<string, number>
  /**
   * Un instrumento de corte (el bisturí) no se posa como un separador: al trazar
   * se inclina hacia atrás, contra el avance, y la punta se hunde un poco. Es lo
   * que hace que la incisión se vea cortada y no pintada.
   */
  corta?: boolean
  /** Qué capa parte al trazar: la piel o los planos de abajo (D-167). Sin esto solo dibuja. */
  planoDeCorte?: PlanoDeCorte | null
  /** Separa los bordes de una herida: cuánto abre como máximo y si se queda abierto solo. */
  separa?: { maximoMm: number; autoestatico: boolean } | null
  /** Perfora el hueso: gira, avanza mientras se mantiene pulsado y deja un túnel. */
  perfora?: { diametroMm: number; avanceMmPorSegundo: number } | null
  /** Cose: cada clic suma una puntada y el hilo queda dibujado en la piel (D-169). */
  sutura?: HiloDeSutura | null
  /** Se coloca sobre el hueso: una placa se apoya, un tornillo se pone en un agujero (D-169). */
  coloca?: QueColoca | null
  /** Es el medidor de profundidad: apoyado en un agujero, lee cuánto hueso hay debajo. */
  mide?: boolean
}

/** Lo que acaba de pasar con la fijación, para escribirlo en el registro de la consola. */
export interface SucesoDeFijacion {
  tipo: 'placa' | 'tornillo' | 'medida' | 'aviso'
  texto: string
  /** Hay algo que corregir. */
  atencion: boolean
  /** El largo de tornillo que sugiere la medida, si fue una medida. */
  largoSugeridoMm?: number
}

/** Lo que se sabe de la sutura que se está haciendo. */
export interface EstadoDeLaSutura extends MedidaDeLaSutura {
  /** Cuánto de la herida cerró la sutura, de 0 a 1. */
  cierre: number
  /** Separación de la última puntada con la anterior, en mm, o `null` si fue la primera de su línea. */
  ultimaSeparacionMm: number | null
  /** Si la última puntada no estuvo bien, por qué. */
  juicio: string | null
  /** La última puntada cruzó la herida. */
  ultimaCruza: boolean
  hilo: string
}

/** Cómo apunta la broca respecto de la cortical, en grados: a lo largo del hueso y a lo ancho. */
export interface InclinacionDeBroca {
  longitudinal: number
  transversal: number
}

/** Lo que se sabe de las heridas abiertas en la escena. */
export interface EstadoDeLasHeridas {
  capas: PlanoDeCorte[]
  largoMm: number
  aperturaMm: number
  /** Por qué no se cortó nada, si se intentó y no hubo dónde. */
  aviso?: string
}

/** Un agujero que acaba de hacerse con la broca. */
export interface PerforacionHecha {
  diametroMm: number
  profundidadMm: number
  /** Entre el eje de la broca y el eje largo del hueso: 90° es perpendicular. */
  anguloConElEje: number
  /** Atravesó la cortical opuesta (bicortical) o se quedó en la cercana. */
  bicortical: boolean
  /** Cuánto pasó de largo la cortical opuesta, en mm: más de unos pocos es riesgo para las partes blandas. */
  sePasoMm: number
}

/**
 * Lo que la vista de rayos X dibuja de más para enseñar (D-166).
 *
 * Son ayudas de aprendizaje, no del caso: en una radioscopia real no se ve dónde
 * *debe* quedar el hueso ni el eje del fragmento. Se ofrecen aparte, apagables,
 * para que quien aprende pueda quitárselas cuando ya sabe leer la imagen.
 */
export interface AyudasDeEscopia {
  /** El fragmento en su sitio correcto, como silueta verde. */
  objetivo: boolean
  /** El eje del hueso fijo y el del fragmento: lo que separa a los dos es la angulación. */
  ejes: boolean
}

export interface DatosDeNodo {
  nodo: string
  datos: Record<string, unknown>
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
  instrumento = null,
  ayudas,
  inclinacionDeBroca = { longitudinal: 0, transversal: 0 },
  milimetrosPorUnidad = 1000,
  ejeLargo = 'y',
  alCargarInstrumento,
  alHerir,
  alPerforar,
  alCoser,
  alFijar,
  largoDeTornillo = 24,
  alTrazar,
  alMoverFragmento,
  alCargar,
  alSenalar,
  alFallar,
  mando,
}: {
  url: string
  piezas: PiezaDelCaso[]
  modo: Modo
  /**
   * La vista de rayos X: la misma que el taller anatómico, todo translúcido al
   * 50 % (`OPACIDAD_DE_RAYOS_X`). Se llamó fluoroscopia y el nombre se quedó.
   */
  fluoroscopia: boolean
  /**
   * El instrumento que el residente eligió. Aparece en la escena, sigue al
   * cursor sobre el modelo y se articula con los valores que le lleguen.
   */
  instrumento?: InstrumentoEnEscena | null
  /** Las ayudas que se dibujan con los rayos X encendidos. */
  ayudas?: AyudasDeEscopia
  /** Hacia dónde apunta la broca respecto de la cortical, mientras el modo es «perforar». */
  inclinacionDeBroca?: InclinacionDeBroca
  /**
   * Cuántos milímetros mide una unidad del archivo. El instrumento viene en
   * metros: sin esta cuenta, en un modelo exportado en milímetros saldría mil
   * veces más pequeño que el hueso.
   */
  milimetrosPorUnidad?: number
  /** Hacia dónde va el eje largo del hueso, para las proyecciones y la guía de eje. */
  ejeLargo?: EjeLargo
  /** El instrumento terminó de cargar: qué articulaciones declara, o por qué no abrió. */
  alCargarInstrumento?: (articulaciones: ArticulacionDeclarada[] | null, error?: string) => void
  /**
   * Cambió lo que hay cortado o abierto: al cortar, al soltar el separador y al
   * cerrar. No se llama en cada muestra del arrastre —repintar la consola entera
   * treinta veces por segundo es justo lo que `alTrazar` evita—; mientras se
   * arrastra, la apertura se lee en la etiqueta del propio lienzo.
   */
  alHerir?: (estado: EstadoDeLasHeridas | null) => void
  /** Se terminó un agujero (se soltó el botón con la broca). */
  alPerforar?: (hecha: PerforacionHecha) => void
  /** Cambió la sutura: se puso una puntada, se deshizo una o se quitó todo. `null` si ya no hay sutura. */
  alCoser?: (estado: EstadoDeLaSutura | null) => void
  /** Cambió la fijación (placa, tornillos) o se midió un agujero. */
  alFijar?: (estado: EstadoDeLaFijacion | null, suceso?: SucesoDeFijacion) => void
  /** Cuántos milímetros de largo tiene el tornillo que se pone. */
  largoDeTornillo?: number
  /** Se llama con el trazo completo cada vez que cambia. */
  alTrazar?: (puntos: Punto3[]) => void
  /**
   * Se llama al soltar el fragmento, con su desplazamiento **respecto del
   * reposo**, en unidades del archivo y en grados.
   *
   * Son las mismas unidades que devuelve `estadoDelFragmento` y que acepta
   * `colocarFragmento`; decirlo en la firma importa porque antes aquí salía la
   * posición absoluta del nodo, que solo coincide con el desplazamiento cuando
   * la pieza sale de Blender centrada en el origen. Con una pierna entera, un
   * arrastre de 2 mm se anunciaría como 1.200 mm sin que nada lo delatara.
   */
  alMoverFragmento?: (posicion: Punto3, giros: Punto3) => void
  /** Se llama una vez, cuando el archivo termina de cargar. */
  alCargar?: () => void
  /** Se llama si el archivo no se puede abrir, con algo que se pueda leer. */
  alFallar?: (mensaje: string) => void
  /**
   * Se llama con el nombre del objeto pinchado, en modo «senalar».
   *
   * Es lo que permite que el autor de un caso elija las piezas pinchándolas en
   * el modelo en vez de copiar los nombres desde el esquema de Blender. Una
   * letra de diferencia no da error: deja una pieza que no se enciende.
   */
  alSenalar?: (nodo: string) => void
  mando?: Ref<MandoDelLienzo>
}) {
  const lienzo = useRef<HTMLDivElement>(null)

  const taller = useRef<{
    render?: THREE.WebGLRenderer
    escena?: THREE.Scene
    camara?: THREE.PerspectiveCamera
    controles?: OrbitControls
    raiz?: THREE.Object3D
    fragmento?: THREE.Object3D
    /**
     * Dónde estaba el fragmento al cargar el archivo.
     *
     * El desplazamiento de un caso es **relativo** a eso, no absoluto. Antes se
     * escribía la posición tal cual, lo que solo funcionaba porque las piezas
     * de prueba salían de Blender centradas en el origen. Con un modelo de
     * verdad —una pierna entera, donde la tibia está donde le toca y no en el
     * cero— la primera pieza que se colocara aparecería teletransportada al
     * abrir el caso, sin ningún error que lo explicara.
     */
    origenDelFragmento?: { posicion: THREE.Vector3; rotacion: THREE.Euler }
    trazo?: THREE.Line
    puntosDelTrazo: Punto3[]
    materialesOriginales: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
    /**
     * Con qué rol se pintó cada nodo la última vez.
     *
     * `aplicarPiezas` necesita saber qué ha cambiado, no solo qué hay: en el
     * taller la lista de piezas se recalcula en cada repintado y llega como
     * array nuevo, así que reasignar la visibilidad entera cada vez borraría el
     * «Solo esto» del autor en cuanto pulsara cualquier otra cosa.
     */
    rolesAplicados: Map<string, PiezaDelCaso['rol']>
    herramienta?: HerramientaCargada
    /** El entorno de estudio que reflejan los instrumentos (el acero sin él se ve negro). */
    entorno?: THREE.Texture
    fantasma?: THREE.Object3D
    guias?: THREE.LineSegments
    /** Pone el instrumento sobre lo que hay en el centro de la vista, sin esperar al cursor. */
    herramientaAlCentro?: () => void
    pedirDibujo?: () => void
    /** La normal de la superficie en cada punto del trazo: sin ella no hay hacia dónde cortar. */
    normalesDelTrazo: Punto3[]
    /** Las heridas abiertas, una por capa de partes blandas (D-167). */
    heridas: Map<PlanoDeCorte, HeridaEnCapa[]>
    /** La capa que cortó el último trazo, para que «Borrar trazo» sepa qué herida deshacer. */
    ultimaHerida?: PlanoDeCorte
    agujeros: THREE.Mesh[]
    /** Cuánto lleva girando la broca, en radianes. */
    giroDeLaBroca?: number
    /** Escribe en la etiqueta que flota sobre el lienzo (ángulo, apertura, profundidad). */
    decir?: (texto: string) => void
    /** La sutura que se está haciendo: los puntos y el hilo dibujado (D-169). */
    sutura?: SuturaEnEscena
    /** Cuánto estaban abiertas las heridas antes de que la sutura las cerrara, para poder devolverlas. */
    aperturaAntesDeCoser?: Map<HeridaEnCapa, { mas: number; menos: number }>
    /** La placa y los tornillos puestos sobre el hueso (D-169). */
    implantes?: ImplantesEnEscena
  }>({
    puntosDelTrazo: [],
    materialesOriginales: new Map(),
    rolesAplicados: new Map(),
    normalesDelTrazo: [],
    heridas: new Map(),
    agujeros: [],
  })

  // Lo que leen los manejadores sin volver a montar la escena.
  const ultimas = useRef({
    modo,
    piezas,
    fluoroscopia,
    instrumento,
    ayudas,
    inclinacionDeBroca,
    milimetrosPorUnidad,
    ejeLargo,
    alTrazar,
    alMoverFragmento,
    alCargar,
    alSenalar,
    alFallar,
    alCargarInstrumento,
    alHerir,
    alPerforar,
    alCoser,
    alFijar,
    largoDeTornillo,
  })
  useEffect(() => {
    ultimas.current = {
      modo,
      piezas,
      fluoroscopia,
      instrumento,
      ayudas,
      inclinacionDeBroca,
      milimetrosPorUnidad,
      ejeLargo,
      alTrazar,
      alMoverFragmento,
      alCargar,
      alSenalar,
      alFallar,
      alCargarInstrumento,
      alHerir,
      alPerforar,
      alCoser,
      alFijar,
      largoDeTornillo,
    }
  })

  useImperativeHandle(mando, () => ({
    mostrar: (nodos) => {
      const raiz = taller.current.raiz
      if (!raiz) return { ausentes: [], sinCoincidencias: false, porPapel: false }
      const existentes: string[] = []
      const delModelo: PiezaEnEdicion[] = []
      raiz.traverse((objeto) => {
        if (!(objeto as THREE.Mesh).isMesh || !objeto.name) return
        existentes.push(objeto.name)
        // El exportador del atlas deja el papel de cada objeto en `userData`.
        const propuesta = propuestaDelNodo(objeto.name, objeto.userData)
        if (propuesta) delModelo.push({ nodo: propuesta.nodo, rol: propuesta.rol })
      })
      // Se enseña lo declarado **que exista**; si no existe nada de lo declarado,
      // el modelo entero. Apagarlo todo por no encontrar los nombres era el
      // lienzo en negro de O-078.
      const reconciliado = reconciliarConElModelo(nodos, existentes)
      const { ausentes, sinCoincidencias } = reconciliado
      let visibles = reconciliado.nodos
      // El caso habla de otro archivo (D-169): antes de rendirse y enseñarlo todo,
      // se enseña lo que el modelo dice que es del mismo papel. Un paso que mostraba
      // la piel y el hueso sigue mostrando la piel y el hueso, se llamen como se
      // llamen. El nombre manda cuando casa; esto solo entra cuando no casa ninguno.
      let porPapel = false
      if (sinCoincidencias && nodos) {
        const rolesViejos = new Map<string, string>()
        for (const p of ultimas.current.piezas) {
          if (typeof p.nodo === 'string' && typeof p.rol === 'string') rolesViejos.set(p.nodo, p.rol)
        }
        const traducido = traducirMuestra(nodos, rolesViejos, delModelo, existentes)
        if (traducido.muestra.length > 0) {
          visibles = traducido.muestra
          porPapel = true
        }
      }
      raiz.traverse((objeto) => {
        if (!(objeto as THREE.Mesh).isMesh) return
        objeto.visible = visibles === null || visibles.includes(objeto.name)
      })
      taller.current.pedirDibujo?.()
      return { ausentes, sinCoincidencias, porPapel }
    },

    hayFragmento: () => !!taller.current.fragmento,

    nodosVisibles: () => {
      const nombres: string[] = []
      taller.current.raiz?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name && o.visible) nombres.push(o.name)
      })
      return nombres
    },

    mirarDesde: (vista) => mirarDesdeProyeccion(taller.current, vista, ultimas.current.ejeLargo),

    colocarFragmento: (posicion, giros) => {
      const { fragmento, origenDelFragmento: origen } = taller.current
      if (!fragmento || !origen) return
      const destino = posicionAbsoluta(origen.posicion, posicion)
      fragmento.position.set(destino.x, destino.y, destino.z)
      fragmento.rotation.set(
        origen.rotacion.x + radianes(giros.x),
        origen.rotacion.y + radianes(giros.y),
        origen.rotacion.z + radianes(giros.z),
      )
      taller.current.pedirDibujo?.()
    },

    girarFragmento: (giros) => {
      const { fragmento, origenDelFragmento: origen } = taller.current
      if (!fragmento || !origen) return
      fragmento.rotation.set(
        origen.rotacion.x + radianes(giros.x),
        origen.rotacion.y + radianes(giros.y),
        origen.rotacion.z + radianes(giros.z),
      )
      taller.current.pedirDibujo?.()
    },

    estadoDelFragmento: () => {
      const { fragmento: f, origenDelFragmento: origen } = taller.current
      if (!f || !origen) return { posicion: { x: 0, y: 0, z: 0 }, giros: { x: 0, y: 0, z: 0 } }
      // Siempre la diferencia contra el sitio original: es lo que el caso
      // guarda y lo que la consola mide como «cuánto falta para reducir».
      return {
        posicion: desplazamientoDesde(origen.posicion, f.position),
        giros: {
          x: grados(f.rotation.x - origen.rotacion.x),
          y: grados(f.rotation.y - origen.rotacion.y),
          z: grados(f.rotation.z - origen.rotacion.z),
        },
      }
    },

    borrarTrazo: (deshacerCorte = false) => {
      taller.current.puntosDelTrazo = []
      taller.current.normalesDelTrazo = []
      dibujarTrazo(taller.current)
      // La herida abierta por ese trazo se queda, a menos que se pida deshacerla:
      // al pasar de paso la consola borra el trazo (la medida vuelve a cero) y la
      // piel cortada tiene que seguir cortada en el paso siguiente.
      if (deshacerCorte) {
        const capa = taller.current.ultimaHerida
        const heridas = capa ? taller.current.heridas.get(capa) : undefined
        if (capa && heridas) {
          heridas.forEach(cerrarCapa)
          taller.current.heridas.delete(capa)
          taller.current.ultimaHerida = undefined
          ultimas.current.alHerir?.(estadoDeLasHeridas(taller.current, ultimas.current.milimetrosPorUnidad))
        }
      }
      ultimas.current.alTrazar?.([])
      taller.current.pedirDibujo?.()
    },

    cerrarHeridas: () => {
      cerrarTodasLasHeridas(taller.current)
      ultimas.current.alHerir?.(null)
      taller.current.pedirDibujo?.()
    },

    abrirHeridas: (mm) => {
      const unidades = Math.max(0, mm) / (ultimas.current.milimetrosPorUnidad || 1000)
      for (const h of todasLasHeridas(taller.current)) abrirCapa(h, unidades / 2, unidades / 2)
      ultimas.current.alHerir?.(estadoDeLasHeridas(taller.current, ultimas.current.milimetrosPorUnidad))
      taller.current.pedirDibujo?.()
    },

    estadoDeLasHeridas: () => estadoDeLasHeridas(taller.current, ultimas.current.milimetrosPorUnidad),

    borrarAgujeros: () => {
      quitarAgujeros(taller.current)
      taller.current.pedirDibujo?.()
    },

    deshacerPuntada: () => {
      const s = taller.current.sutura
      if (!s || s.puntos.length === 0) return
      s.puntos.pop()
      refrescarSutura(taller.current, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, null)
    },

    quitarSutura: () => {
      const t = taller.current
      if (!t.sutura) return
      t.sutura.puntos.length = 0
      refrescarSutura(t, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, null)
    },

    nuevaLineaDeSutura: () => {
      const s = taller.current.sutura
      if (s) s.siguienteEsNueva = true
    },

    quitarImplantes: (conPlaca) => {
      const imp = taller.current.implantes
      if (!imp) return
      if (conPlaca) quitarImplantes(imp)
      else quitarTornillos(imp)
      ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current))
      taller.current.pedirDibujo?.()
    },

    estadoDeLaFijacion: () => estadoDeLaFijacion(taller.current),

    encuadrar: () => encuadrarVisible(taller.current),

    nodosDelModelo: () => {
      const nombres: string[] = []
      taller.current.raiz?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name) nombres.push(o.name)
      })
      return nombres
    },

    datosDeLosNodos: () => (taller.current.raiz ? datosDeLosNodos(taller.current.raiz) : []),
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
    // Después de crear los controles y no antes: `OrbitControls` escribe su
    // propio `touch-action: none` al conectarse y pisaría el de aquí.
    render.domElement.style.touchAction = gestoTactil(ultimas.current.modo)

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

    // Un estudio que reflejar, solo para los instrumentos (ver `aplicarEntorno`).
    const pmrem = new THREE.PMREMGenerator(render)
    const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

    taller.current = {
      ...taller.current,
      entorno,
      render,
      escena,
      camara,
      controles,
      pedirDibujo,
      puntosDelTrazo: [],
      materialesOriginales: new Map(),
      rolesAplicados: new Map(),
      normalesDelTrazo: [],
      heridas: new Map(),
      agujeros: [],
    }

    // La etiqueta que flota sobre el lienzo: ángulo de la broca, apertura de la
    // herida, profundidad. Es un elemento propio y se escribe directamente, sin
    // pasar por el estado de React: cambia en cada movimiento del puntero y
    // repintar la consola entera por eso es lo que ya se evitó con el trazo.
    const lectura = document.createElement('div')
    lectura.className = 'consola-lienzo-lectura'
    lectura.hidden = true
    contenedor.appendChild(lectura)
    taller.current.decir = (texto) => {
      lectura.textContent = texto
      lectura.hidden = texto === ''
    }

    // --- carga del modelo ---------------------------------------------------
    /**
     * Con los decodificadores de compresión puestos.
     *
     * Sin ellos, un `.glb` exportado con «Comprimir» desde Blender —que es lo
     * que la guía del traumatólogo le pide hacer en cuanto el archivo pasa de
     * unos pocos MB, y lo que hace falta para que una pierna entera quepa bajo
     * el techo de 5 MB— no se abre. Y no se abre **en silencio**: el lienzo se
     * queda vacío, la cámara encuadra la nada y no hay ningún mensaje.
     *
     * El decodificador se sirve desde la propia plataforma y no desde un CDN:
     * atarlo a que el hospital deje salir a otro dominio convierte un cortafuegos
     * en un modelo que no carga. La ruta pasa por `ruta()` porque se escribe a
     * mano, y bajo un prefijo saldría sin él.
     */
    const draco = new DRACOLoader()
    draco.setDecoderPath(ruta('/draco/'))

    const cargador = new GLTFLoader()
    cargador.setDRACOLoader(draco)
    cargador.setMeshoptDecoder(MeshoptDecoder)
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
        const f = taller.current.fragmento
        taller.current.origenDelFragmento = f
          ? { posicion: f.position.clone(), rotacion: f.rotation.clone() }
          : undefined
        aplicarPiezas(taller.current, ultimas.current.piezas)
        if (ultimas.current.fluoroscopia) aplicarFluoroscopia(taller.current, true)
        sincronizarAyudas(taller.current, ultimas.current.fluoroscopia, ultimas.current.ayudas)

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
      (error) => {
        // Un fallo de carga tiene que verse. El comentario que había aquí decía
        // que «el componente de arriba ya avisa», y era falso: arriba solo se
        // avisa cuando el caso no declara ningún modelo. Si el archivo existe y
        // no se puede leer —comprimido sin decodificador, cortado a medias, un
        // permiso— el residente veía un lienzo vacío y nada más.
        if (!vivo) return
        const detalle = error instanceof Error ? error.message : String(error)
        ultimas.current.alFallar?.(
          `No se pudo abrir el modelo. ${detalle || 'El archivo no se pudo leer.'}`,
        )
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

    /** La normal de la superficie en un golpe, vuelta hacia quien mira. */
    const normalDelGolpe = (golpe: THREE.Intersection): THREE.Vector3 => {
      const normal = golpe.face
        ? golpe.face.normal.clone().transformDirection(golpe.object.matrixWorld)
        : new THREE.Vector3(0, 0, 1)
      // La normal de una malla abierta puede apuntar al lado contrario: se
      // toma la que mira hacia quien mira.
      if (normal.dot(rayo.ray.direction) > 0) normal.negate()
      return normal
    }

    /**
     * Las mallas que la broca puede perforar: el hueso y el fragmento, y solo los
     * visibles. La piel y el músculo se atraviesan —la broca va con su camisa de
     * protección— y no se perforan.
     */
    const mallasDeHueso = (): THREE.Mesh[] => {
      const raiz = taller.current.raiz
      if (!raiz) return []
      const rolDe = new Map(ultimas.current.piezas.map((p) => [p.nodo, p.rol]))
      const todas: THREE.Mesh[] = []
      raiz.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh && m.visible) todas.push(m)
      })
      const conRol = todas.filter((m) => {
        const rol = rolDe.get(m.name)
        return rol === 'hueso' || rol === 'fragmento'
      })
      // Sin roles declarados no se sabe cuál es hueso: vale cualquier cosa que no
      // sea piel, músculo o implante.
      return conRol.length > 0
        ? conRol
        : todas.filter((m) => {
            const rol = rolDe.get(m.name)
            return rol !== 'piel' && rol !== 'musculo' && rol !== 'implante'
          })
    }
    const huesoBajoElCursor = (): THREE.Intersection | null =>
      rayo.intersectObjects(mallasDeHueso(), false).find((g) => g.object.visible) ?? null

    // --- la broca: gira, avanza y deja un túnel --------------------------------
    interface Perforacion {
      entrada: THREE.Vector3
      /** Hacia dónde entra la broca, unitario. */
      dirEntra: THREE.Vector3
      /** Hacia dónde sale el mango (lo contrario). */
      salida: THREE.Vector3
      anguloConElEje: number
      /** Lo que lleva avanzado, en unidades del mundo. */
      profundidad: number
      /** Hasta dónde puede avanzar: la cortical opuesta más lo que se podría pasar. */
      maxima: number
      /** A qué profundidad sale por la cortical opuesta. */
      salidaPorLaOpuesta: number
    }
    let perforando: Perforacion | null = null
    let ultimoCuadro = performance.now()
    /** El labio que el separador tiene agarrado mientras se arrastra, y cómo estaban los dos al empezar. */
    let sostenido: { lado: 1 | -1; direccion: THREE.Vector3; mas0: number; menos0: number } | null = null

    /**
     * Parte con el trazo la capa que corta el instrumento (D-167).
     *
     * Se hace al soltar, con el trazo entero: cortar mientras se arrastra
     * rehacería la geometría en cada muestra. Reemplaza la herida anterior de la
     * misma capa; las de otras capas se quedan (la piel sigue cortada cuando se
     * corta el plano de abajo).
     */
    const cortarConElTrazo = () => {
      const instrumentoActual = ultimas.current.instrumento
      const plano = instrumentoActual?.planoDeCorte
      if (!plano) return
      const t = taller.current
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const trazo = t.puntosDelTrazo
      if (trazo.length < 3) return
      let largo = 0
      for (let i = 1; i < trazo.length; i++) {
        largo += Math.hypot(trazo[i].x - trazo[i - 1].x, trazo[i].y - trazo[i - 1].y, trazo[i].z - trazo[i - 1].z)
      }
      const aviso = (texto: string) =>
        ultimas.current.alHerir?.({ ...(estadoDeLasHeridas(t, ultimas.current.milimetrosPorUnidad) ?? { capas: [], largoMm: 0, aperturaMm: 0 }), aviso: texto })
      if (largo < 5 * unidadesPorMm) {
        aviso('La incisión es demasiado corta para abrir la herida: trace al menos 5 mm.')
        return
      }
      const nombres = new Set(ultimas.current.piezas.filter((p) => p.rol === plano).map((p) => p.nodo))
      const mallas: THREE.Mesh[] = []
      t.raiz?.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh && m.visible && nombres.has(m.name)) mallas.push(m)
      })
      if (mallas.length === 0) {
        aviso(
          plano === 'piel'
            ? 'No hay piel visible que cortar: encienda la capa «Piel».'
            : 'No hay músculo visible que cortar: encienda la capa «Músculo».',
        )
        return
      }
      // La herida de antes de esta capa se cierra: un trazo nuevo es una incisión nueva.
      t.heridas.get(plano)?.forEach(cerrarCapa)
      t.heridas.delete(plano)

      const puntos = trazo.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      const normales = t.normalesDelTrazo.map((n) => new THREE.Vector3(n.x, n.y, n.z))
      const parametros = {
        // La piel es fina; los planos profundos empiezan bajo ella y bajo la grasa.
        profundidad: (plano === 'piel' ? 14 : 50) * unidadesPorMm,
        alcance: 30 * unidadesPorMm,
      }
      const hechas: HeridaEnCapa[] = []
      for (const malla of mallas) {
        const herida = cortarCapa(malla, puntos, normales, parametros)
        if (herida) hechas.push(herida)
      }
      if (hechas.length === 0) {
        aviso('El trazo no atraviesa ninguna malla de esa capa.')
        return
      }
      // Si ya había otras heridas abiertas, la nueva se abre lo mismo.
      const otras = todasLasHeridas(t)
      if (otras.length > 0) for (const h of hechas) abrirCapa(h, otras[0].mas, otras[0].menos)
      t.heridas.set(plano, hechas)
      t.ultimaHerida = plano
      // La línea roja era la guía; con la herida abierta flotaría en el aire.
      if (t.trazo) t.trazo.visible = false
      ultimas.current.alHerir?.(estadoDeLasHeridas(t, ultimas.current.milimetrosPorUnidad))
      pedirDibujo()
    }

    /** Cómo entraría la broca por este golpe, con la inclinación que eligió quien la usa. */
    const trayectoriaDeBroca = (golpe: THREE.Intersection) => {
      const normal = normalDelGolpe(golpe)
      const eje = VECTOR_DEL_EJE[ultimas.current.ejeLargo]
      // El eje del hueso proyectado sobre la cortical: el sentido «a lo largo» de
      // la inclinación. Y el «a lo ancho», perpendicular a los dos.
      let a = eje.clone().sub(normal.clone().multiplyScalar(eje.dot(normal)))
      if (a.lengthSq() < 1e-8) a = new THREE.Vector3(1, 0, 0).sub(normal.clone().multiplyScalar(normal.x))
      a.normalize()
      const b = new THREE.Vector3().crossVectors(normal, a).normalize()
      const { longitudinal, transversal } = ultimas.current.inclinacionDeBroca ?? { longitudinal: 0, transversal: 0 }
      const salida = normal
        .clone()
        .addScaledVector(a, Math.tan(radianes(longitudinal)))
        .addScaledVector(b, Math.tan(radianes(transversal)))
        .normalize()
      const dirEntra = salida.clone().negate()
      return {
        entrada: golpe.point.clone(),
        dirEntra,
        salida,
        anguloConElEje: grados(Math.acos(Math.min(1, Math.abs(dirEntra.dot(eje))))),
      }
    }

    /** Pone la broca sobre el hueso (o la esconde) y escribe qué ángulo lleva. */
    const posarBroca = (golpe: THREE.Intersection | null) => {
      const herramienta = taller.current.herramienta
      const config = ultimas.current.instrumento?.perfora
      if (!herramienta || !config) return
      if (!golpe && !perforando) {
        if (herramienta.raiz.visible) {
          herramienta.raiz.visible = false
          pedirDibujo()
        }
        taller.current.decir?.('')
        return
      }
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const t = perforando ?? trayectoriaDeBroca(golpe!)
      const profundidad = perforando?.profundidad ?? 0
      const giro = taller.current.giroDeLaBroca ?? 0
      herramienta.raiz.quaternion
        .setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.salida)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro))
      // La punta en la entrada; al avanzar, se hunde por su propio eje.
      herramienta.raiz.position.copy(t.entrada).addScaledVector(t.dirEntra, profundidad)
      herramienta.raiz.visible = true
      const mm = (u: number) => (u / unidadesPorMm).toFixed(1).replace('.', ',')
      // Pasar de largo la cortical opuesta es el error clásico de quien aprende:
      // la broca sigue y lo que hay detrás son partes blandas. Se dice mientras ocurre.
      const pasado = perforando ? profundidad - perforando.salidaPorLaOpuesta : 0
      taller.current.decir?.(
        `Broca Ø ${String(config.diametroMm).replace('.', ',')} mm · ${Math.round(t.anguloConElEje)}° con el eje del hueso${
          perforando ? ` · ${mm(profundidad)} mm` : ' · mantenga pulsado para perforar'
        }${pasado > 1 * unidadesPorMm ? ` · ¡se pasó ${mm(pasado)} mm de la cortical opuesta!` : ''}`,
      )
      pedirDibujo()
    }

    const empezarPerforacion = (golpe: THREE.Intersection) => {
      const t = trayectoriaDeBroca(golpe)
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      // Hasta dónde se puede ir: se lanza un rayo desde dentro del hueso en la
      // dirección de la broca y la última superficie que cruza es la salida por
      // la cortical opuesta. Una pierna entera son tres capas de tejido; solo
      // cuenta el hueso.
      const origen = t.entrada.clone().addScaledVector(t.dirEntra, 0.4 * unidadesPorMm)
      const alcance = new THREE.Raycaster(origen, t.dirEntra, 0, 150 * unidadesPorMm)
      const cruces = alcance.intersectObjects(mallasDeHueso(), false)
      const ultimo = cruces[cruces.length - 1]
      const salidaPorLaOpuesta = ultimo ? ultimo.distance + 0.4 * unidadesPorMm : 8 * unidadesPorMm
      perforando = {
        ...t,
        profundidad: 0,
        // Se puede pasar de largo: es un error que un residente comete y que
        // conviene que vea y que se le diga.
        maxima: salidaPorLaOpuesta + 12 * unidadesPorMm,
        salidaPorLaOpuesta,
      }
      taller.current.giroDeLaBroca = taller.current.giroDeLaBroca ?? 0
      ultimoCuadro = performance.now()
      pedirDibujo()
    }

    const terminarPerforacion = () => {
      const p = perforando
      perforando = null
      const config = ultimas.current.instrumento?.perfora
      const escenaActual = taller.current.escena
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      if (!p || !config || !escenaActual || p.profundidad < 0.3 * unidadesPorMm) {
        posarBroca(null)
        return
      }
      const radio = (config.diametroMm / 2) * unidadesPorMm
      const agujero = new THREE.Mesh(
        new THREE.CylinderGeometry(radio, radio, p.profundidad, 16, 1, false),
        new THREE.MeshBasicMaterial({ color: 0x120909 }),
      )
      // Va en la escena y no dentro del modelo: `mostrar()` apaga las mallas que
      // no están en la lista, y un agujero sin nombre desaparecería con cada
      // cambio de capa.
      agujero.position.copy(p.entrada).addScaledVector(p.dirEntra, p.profundidad / 2)
      agujero.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.dirEntra)
      agujero.raycast = () => {}
      escenaActual.add(agujero)
      taller.current.agujeros.push(agujero)
      // Un tope: cien agujeros no enseñan nada y cuestan geometría.
      if (taller.current.agujeros.length > 40) {
        const viejo = taller.current.agujeros.shift()!
        viejo.removeFromParent()
        viejo.geometry.dispose()
        ;(viejo.material as THREE.Material).dispose()
      }
      const sePaso = Math.max(0, p.profundidad - p.salidaPorLaOpuesta)
      ultimas.current.alPerforar?.({
        diametroMm: config.diametroMm,
        profundidadMm: p.profundidad / unidadesPorMm,
        anguloConElEje: p.anguloConElEje,
        bicortical: p.profundidad >= p.salidaPorLaOpuesta - 0.5 * unidadesPorMm,
        sePasoMm: sePaso / unidadesPorMm,
      })
      taller.current.decir?.('')
      pedirDibujo()
    }

    /** Qué golpe usa el instrumento para posarse: el hueso si perfora, cualquier superficie si no. */
    const golpeParaLaHerramienta = () =>
      ultimas.current.modo === 'perforar' && ultimas.current.instrumento?.perfora
        ? huesoBajoElCursor()
        : superficieBajoElCursor()

    /**
     * Pone el instrumento donde apunta el rayo: la punta en la superficie, el
     * mango hacia fuera y algo inclinado hacia arriba de la pantalla, que es
     * como se agarra. Sin golpe se esconde: un instrumento flotando sobre el
     * fondo no dice nada, y tapar el modelo con él tampoco.
     */
    const posarHerramienta = (golpe: THREE.Intersection | null, avance?: THREE.Vector3) => {
      const herramienta = taller.current.herramienta
      if (!herramienta) return
      if (ultimas.current.modo === 'perforar' && ultimas.current.instrumento?.perfora) {
        posarBroca(golpe)
        return
      }
      if (!golpe) {
        if (herramienta.raiz.visible) {
          herramienta.raiz.visible = false
          pedirDibujo()
        }
        return
      }
      const normal = normalDelGolpe(golpe)
      const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(camara.quaternion)
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const cortando = !!ultimas.current.instrumento?.corta && !!avance && avance.lengthSq() > 0
      // Cortando, el mango se echa hacia atrás (contra el avance) y la hoja se
      // hunde 1,5 mm; sin avance, se posa como cualquier otro.
      const direccion = cortando
        ? normal.clone().multiplyScalar(0.55).addScaledVector(avance!.clone().normalize(), -0.85).normalize()
        : normal.clone().multiplyScalar(0.85).addScaledVector(arriba, 0.65).normalize()
      herramienta.raiz.position
        .copy(golpe.point)
        .addScaledVector(normal, unidadesPorMm * (cortando ? -1.5 : 0.4))
      herramienta.raiz.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direccion)
      herramienta.raiz.visible = true
      pedirDibujo()
    }
    taller.current.herramientaAlCentro = () => {
      // Del centro hacia fuera: en una fractura el centro de la vista cae
      // justo en el hueco entre los fragmentos, y un solo rayo no encuentra
      // nada. El instrumento tiene que aparecer al cogerlo, no cuando el
      // cursor pase por casualidad sobre el hueso.
      const sondas: [number, number][] = [
        [0, 0], [0.08, 0.1], [-0.08, 0.1], [0.08, -0.1], [-0.08, -0.1],
        [0, 0.3], [0, -0.3], [0.2, 0], [-0.2, 0], [0.15, 0.3], [-0.15, -0.3],
      ]
      for (const [x, y] of sondas) {
        rayo.setFromCamera(new THREE.Vector2(x, y), camara)
        const golpe = golpeParaLaHerramienta()
        if (golpe) {
          posarHerramienta(golpe)
          return
        }
      }
      posarHerramienta(null)
    }
    let ultimoSeguimiento = 0
    const seguirConLaHerramienta = (evento: PointerEvent) => {
      if (!taller.current.herramienta) return
      // Unos treinta cuadros por segundo bastan, y cada cruce de rayos recorre
      // el modelo entero: en un hueso con cientos de miles de triángulos, uno
      // por cada evento del ratón es lo que calienta el portátil.
      const ahora = performance.now()
      if (ahora - ultimoSeguimiento < 33) return
      ultimoSeguimiento = ahora
      aCoordenadas(evento)
      posarHerramienta(golpeParaLaHerramienta())
    }
    const esconderHerramienta = () => {
      const herramienta = taller.current.herramienta
      if (!herramienta?.raiz.visible) return
      herramienta.raiz.visible = false
      pedirDibujo()
    }

    const alBajar = (evento: PointerEvent) => {
      const { modo: modoActual } = ultimas.current
      if (modoActual === 'orbitar') return

      aCoordenadas(evento)

      if (modoActual === 'senalar') {
        // Señalar no arrastra ni modifica nada: solo dice qué hay debajo. Se
        // deja la órbita encendida para poder girar el modelo y seguir
        // pinchando sin cambiar de modo.
        const golpe = superficieBajoElCursor()
        if (golpe?.object.name) ultimas.current.alSenalar?.(golpe.object.name)
        return
      }

      if (modoActual === 'trazar') {
        const golpe = superficieBajoElCursor()
        if (!golpe) return
        controles.enabled = false
        arrastrando = true
        taller.current.puntosDelTrazo = [
          { x: golpe.point.x, y: golpe.point.y, z: golpe.point.z },
        ]
        const n0 = normalDelGolpe(golpe)
        taller.current.normalesDelTrazo = [{ x: n0.x, y: n0.y, z: n0.z }]
        dibujarTrazo(taller.current)
        // Empezar un trazo borra el anterior del modelo, así que hay que
        // decirlo aquí mismo, igual que hace `borrarTrazo`. Si no, un clic
        // suelto en modo Trazar quita la línea roja y deja al panel midiendo
        // una incisión que ya no está dibujada: «Aplicar paso» la juzga y el
        // residente no tiene manera de ver contra qué.
        ultimas.current.alTrazar?.([])
        pedirDibujo()
        return
      }

      if (modoActual === 'separar') {
        const separa = ultimas.current.instrumento?.separa
        const heridas = todasLasHeridas(taller.current)
        if (!separa) return
        if (heridas.length === 0) {
          taller.current.decir?.('No hay herida que separar: corte primero con un bisturí, en modo Trazar.')
          return
        }
        const golpe = superficieBajoElCursor()
        if (!golpe) return
        const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
        // El borde más cercano de todas las heridas es el que se agarra.
        let elegido: { info: NonNullable<ReturnType<typeof ladoDeLaHerida>> } | null = null
        for (const h of heridas) {
          const info = ladoDeLaHerida(h, golpe.point)
          if (info && (!elegido || info.cerca < elegido.info.cerca)) elegido = { info }
        }
        if (!elegido || elegido.info.cerca > 30 * unidadesPorMm) {
          taller.current.decir?.('Acerque el separador al borde de la herida.')
          return
        }
        controles.enabled = false
        arrastrando = true
        const normal = camara.getWorldDirection(new THREE.Vector3()).negate()
        planoDeArrastre = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, golpe.point)
        rayo.ray.intersectPlane(planoDeArrastre, inicioDeArrastre)
        sostenido = {
          lado: elegido.info.lado,
          direccion: elegido.info.direccion,
          mas0: heridas[0].mas,
          menos0: heridas[0].menos,
        }
        return
      }

      if (modoActual === 'perforar') {
        if (!ultimas.current.instrumento?.perfora || !taller.current.herramienta) return
        const golpe = huesoBajoElCursor()
        if (!golpe) {
          taller.current.decir?.('Apunte al hueso: la broca solo perfora el hueso visible.')
          return
        }
        controles.enabled = false
        arrastrando = true
        empezarPerforacion(golpe)
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

    /**
     * Dónde se pulsó en modo Coser: una puntada es un **clic**, no un arrastre. El
     * arrastre sigue siendo de la órbita, así que se puede girar el modelo para
     * coser el otro lado sin cambiar de modo.
     */
    let clicDeSutura: { x: number; y: number } | null = null
    const alBajarParaCoser = (evento: PointerEvent) => {
      const modoActual = ultimas.current.modo
      clicDeSutura = modoActual === 'coser' || modoActual === 'fijar' ? { x: evento.clientX, y: evento.clientY } : null
    }

    /**
     * Un clic en modo Fijar: la placa se apoya en el hueso, el tornillo se pone en
     * el agujero que apunta el cursor, el medidor lee el hueso que hay debajo.
     * Igual que coser, es un clic y no un arrastre: el arrastre sigue siendo de la
     * órbita.
     */
    const fijarConClic = () => {
      const t = taller.current
      const inst = ultimas.current.instrumento
      const herramienta = t.herramienta
      if (!t.escena || !t.raiz || !inst) return
      if (!t.implantes) t.implantes = crearImplantes()
      const imp = t.implantes
      const mmPorUnidad = ultimas.current.milimetrosPorUnidad || 1000
      const decirYAvisar = (suceso: SucesoDeFijacion) => {
        t.decir?.(suceso.texto)
        ultimas.current.alFijar?.(estadoDeLaFijacion(t), suceso)
        t.pedirDibujo?.()
      }
      const huesos = mallasDeHueso()

      // La placa y el tornillo se clonan del modelo que está en la mano; el medidor no necesita el suyo.
      if (inst.coloca && !herramienta) {
        t.decir?.('El modelo del implante todavía se está abriendo: espere un momento.')
        return
      }
      if (inst.coloca?.tipo === 'placa' && herramienta) {
        const golpe = huesoBajoElCursor()
        if (!golpe) {
          t.decir?.('Apunte al hueso: la placa se apoya sobre el hueso visible.')
          return
        }
        const eje = new THREE.Vector3(
          ...(ultimas.current.ejeLargo === 'x' ? [1, 0, 0] : ultimas.current.ejeLargo === 'z' ? [0, 0, 1] : [0, 1, 0]),
        )
        const placa = colocarPlaca({
          escena: t.escena,
          plantilla: herramienta.raiz,
          nombre: herramienta.meta?.nombre ?? 'Placa',
          agujerosMm: herramienta.meta?.agujeros ?? [],
          punto: golpe.point,
          normal: normalDelGolpe(golpe),
          ejeDelHueso: eje,
          milimetrosPorUnidad: mmPorUnidad,
          huesos,
          implantes: imp,
        })
        if (!placa) {
          decirYAvisar({
            tipo: 'aviso',
            texto: 'Este modelo de placa no trae la posición de sus agujeros: vuelva a cargarlo desde el catálogo.',
            atencion: true,
          })
          return
        }
        const separada = placa.separadaDelHuesoMm
        decirYAvisar({
          tipo: 'placa',
          texto:
            `${placa.nombre} apoyada: ${placa.agujerosMm.length} agujeros.` +
            (separada > 1.5 ? ` Queda a ${separada.toFixed(1).replace('.', ',')} mm del hueso: apóyela donde el hueso sea más recto.` : ''),
          atencion: separada > 1.5,
        })
        return
      }

      // Un tornillo o el medidor: hace falta una placa y un agujero bajo el cursor.
      const placa = imp.placa
      if (!placa) {
        t.decir?.('Coloque primero una placa sobre el hueso.')
        return
      }
      const golpesDePlaca = rayo.intersectObject(placa.grupo, true)
      const sobreLaPlaca = golpesDePlaca[0]?.point ?? huesoBajoElCursor()?.point
      const agujero = sobreLaPlaca ? agujeroBajoElPunto(placa, sobreLaPlaca, 7) : null
      if (agujero === null) {
        t.decir?.('Apunte a un agujero de la placa.')
        return
      }
      if (inst.mide) {
        const medida = medirBajoElAgujero(placa, agujero, huesos)
        if (!medida) {
          t.decir?.('Bajo ese agujero no hay hueso que medir.')
          return
        }
        const sugerido = largoSugerido(medida.espesorMm)
        decirYAvisar({
          tipo: 'medida',
          texto: `Agujero ${agujero + 1}: hueso de ${medida.espesorMm.toFixed(0)} mm. Pida un tornillo de ${sugerido} mm.`,
          atencion: false,
          largoSugeridoMm: sugerido,
        })
        return
      }
      if (inst.coloca?.tipo === 'tornillo' && herramienta) {
        const puesto = colocarTornillo({
          escena: t.escena,
          plantilla: herramienta.raiz,
          placa,
          agujero,
          largoMm: ultimas.current.largoDeTornillo,
          diametroMm: inst.coloca.diametroMm,
          largoDelModeloMm: inst.coloca.largoDelModeloMm,
          bloqueado: inst.coloca.bloqueado,
          huesos,
          implantes: imp,
        })
        if (!puesto) {
          t.decir?.('Bajo ese agujero no hay hueso donde atornillar.')
          return
        }
        decirYAvisar({
          tipo: 'tornillo',
          texto:
            `Tornillo de ${puesto.largoMm} mm en el agujero ${agujero + 1}: ` +
            (puesto.bicortical ? 'bicortical.' : 'solo la cortical cercana.') +
            (puesto.aviso && puesto.bicortical ? ` ${puesto.aviso}` : ''),
          atencion: !!puesto.aviso,
        })
      }
    }

    const alSubirParaCoser = (evento: PointerEvent) => {
      const clic = clicDeSutura
      clicDeSutura = null
      if (!clic) return
      if (Math.hypot(evento.clientX - clic.x, evento.clientY - clic.y) > 5) return
      if (ultimas.current.modo === 'fijar') {
        aCoordenadas(evento)
        fijarConClic()
        return
      }
      const hilo = ultimas.current.instrumento?.sutura
      if (ultimas.current.modo !== 'coser' || !hilo) return
      aCoordenadas(evento)
      const golpe = superficieBajoElCursor()
      if (!golpe) {
        taller.current.decir?.('Pique sobre la piel o el tejido: ahí no hay nada que coser.')
        return
      }
      const t = taller.current
      if (!t.escena || !t.raiz) return
      if (!t.sutura) t.sutura = crearSutura(t.escena, hilo)
      const sutura = t.sutura
      sutura.hilo = hilo
      if (sutura.puntos.length >= MAXIMO_DE_PUNTADAS) {
        t.decir?.(`Son ${MAXIMO_DE_PUNTADAS} puntadas: es el máximo de una sutura. Quite alguna o empiece otra.`)
        return
      }
      const normal = normalDelGolpe(golpe)
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      sutura.puntos.push({
        punto: [golpe.point.x, golpe.point.y, golpe.point.z],
        normal: [normal.x, normal.y, normal.z],
        lado: ladoDelPunto(t, golpe.point, unidadesPorMm),
        nuevaLinea: sutura.puntos.length === 0 || !!sutura.siguienteEsNueva,
      })
      sutura.siguienteEsNueva = false
      refrescarSutura(t, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, 'ultima')
    }

    const alMover = (evento: PointerEvent) => {
      if (!arrastrando) {
        // Sin arrastre, el instrumento solo acompaña al cursor.
        seguirConLaHerramienta(evento)
        return
      }
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
        const n = normalDelGolpe(golpe)
        taller.current.normalesDelTrazo.push({ x: n.x, y: n.y, z: n.z })
        dibujarTrazo(taller.current)
        ultimas.current.alTrazar?.([...puntos])
        // La punta del instrumento va dibujando la incisión.
        posarHerramienta(golpe, ultimo ? new THREE.Vector3(golpe.point.x - ultimo.x, golpe.point.y - ultimo.y, golpe.point.z - ultimo.z) : undefined)
        pedirDibujo()
        return
      }

      if (modoActual === 'separar' && sostenido && planoDeArrastre) {
        const separa = ultimas.current.instrumento?.separa
        if (!separa || !rayo.ray.intersectPlane(planoDeArrastre, puntoAuxiliar)) return
        const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
        // Hacia fuera de la herida es «abrir»: la dirección del labio por su lado.
        const delta = puntoAuxiliar.clone().sub(inicioDeArrastre).dot(sostenido.direccion) * sostenido.lado
        const tope = separa.maximoMm * unidadesPorMm
        const base = separa.autoestatico
          ? Math.max(sostenido.mas0, sostenido.menos0)
          : sostenido.lado > 0
            ? sostenido.mas0
            : sostenido.menos0
        const nuevo = Math.min(tope, Math.max(0, base + delta))
        // Un autoestático se abre por los dos lados a la vez, con su trinquete; uno
        // de mano solo mueve el labio que sostiene, y el otro lo sostiene otro.
        const mas = separa.autoestatico ? nuevo : sostenido.lado > 0 ? nuevo : sostenido.mas0
        const menos = separa.autoestatico ? nuevo : sostenido.lado < 0 ? nuevo : sostenido.menos0
        for (const h of todasLasHeridas(taller.current)) abrirCapa(h, mas, menos)
        const abierta = (mas + menos) / unidadesPorMm
        taller.current.decir?.(
          `Herida abierta ${abierta.toFixed(0)} mm${nuevo >= tope - 1e-9 ? ' · tope del separador' : ''}`,
        )
        posarHerramienta(superficieBajoElCursor())
        pedirDibujo()
        return
      }

      // La broca no sigue al cursor mientras perfora: va por la trayectoria que
      // tenía al empezar, y mover el ratón con el botón pulsado no la desvía.
      if (modoActual === 'perforar') return

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

      const modoAlSoltar = ultimas.current.modo
      if (modoAlSoltar === 'trazar') cortarConElTrazo()
      if (modoAlSoltar === 'separar' && sostenido) {
        sostenido = null
        taller.current.decir?.('')
        ultimas.current.alHerir?.(estadoDeLasHeridas(taller.current, ultimas.current.milimetrosPorUnidad))
      }
      if (perforando) terminarPerforacion()

      const f = taller.current.fragmento
      const origen = taller.current.origenDelFragmento
      // Se avisa del desplazamiento, no de la posición: es lo que devuelve
      // `estadoDelFragmento` y lo que espera `colocarFragmento`, y así el dato
      // del fragmento sale por un solo camino. Sin origen no hay contra qué
      // medir y no se avisa: inventar un cero aquí es lo que hacía que un caso
      // saliera ya reducido.
      if (ultimas.current.modo === 'mover' && f && origen) {
        ultimas.current.alMoverFragmento?.(desplazamientoDesde(origen.posicion, f.position), {
          x: grados(f.rotation.x - origen.rotacion.x),
          y: grados(f.rotation.y - origen.rotacion.y),
          z: grados(f.rotation.z - origen.rotacion.z),
        })
      }
    }

    render.domElement.addEventListener('pointerdown', alBajar)
    render.domElement.addEventListener('pointerdown', alBajarParaCoser)
    render.domElement.addEventListener('pointerup', alSubirParaCoser)
    render.domElement.addEventListener('pointermove', alMover)
    render.domElement.addEventListener('pointerup', alSubir)
    render.domElement.addEventListener('pointerleave', alSubir)
    render.domElement.addEventListener('pointerleave', esconderHerramienta)

    const observador = new ResizeObserver(() => {
      if (!contenedor.clientWidth) return
      camara.aspect = contenedor.clientWidth / Math.max(1, contenedor.clientHeight)
      camara.updateProjectionMatrix()
      render.setSize(contenedor.clientWidth, contenedor.clientHeight)
      sucio = true
    })
    observador.observe(contenedor)

    render.setAnimationLoop(() => {
      const ahora = performance.now()
      if (perforando) {
        const config = ultimas.current.instrumento?.perfora
        const dt = Math.min(0.05, (ahora - ultimoCuadro) / 1000)
        if (config) {
          const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
          taller.current.giroDeLaBroca = (taller.current.giroDeLaBroca ?? 0) + dt * 32
          perforando.profundidad = Math.min(
            perforando.maxima,
            perforando.profundidad + config.avanceMmPorSegundo * unidadesPorMm * dt,
          )
          posarBroca(null)
          sucio = true
        }
      }
      ultimoCuadro = ahora
      const movio = controles.update()
      if (!sucio && !movio) return
      sucio = false
      // Los ejes de la guía se recolocan en cada dibujo: el fragmento se mueve
      // con el ratón y la guía tiene que seguirlo.
      if (taller.current.guias) actualizarGuias(taller.current, ultimas.current.ejeLargo, ultimas.current.piezas)
      render.render(escena, camara)
    })

    return () => {
      vivo = false
      render.setAnimationLoop(null)
      observador.disconnect()
      controles.removeEventListener('change', pedirDibujo)
      render.domElement.removeEventListener('pointerdown', alBajar)
      render.domElement.removeEventListener('pointerdown', alBajarParaCoser)
      render.domElement.removeEventListener('pointerup', alSubirParaCoser)
      render.domElement.removeEventListener('pointermove', alMover)
      render.domElement.removeEventListener('pointerup', alSubir)
      render.domElement.removeEventListener('pointerleave', alSubir)
      render.domElement.removeEventListener('pointerleave', esconderHerramienta)
      controles.dispose()
      // El decodificador Draco es lo único que se crea aquí y no cuelga de la
      // escena, así que `liberar` no lo alcanza: cada instancia levanta su
      // propio hilo con el WASM dentro, y solo `dispose()` lo termina y revoca
      // el `blob:` de su fuente. Sin esta línea, un residente que recorre ocho
      // casos deja ocho hilos vivos hasta que cierre la pestaña.
      draco.dispose()
      // Apagar la fluoroscopia antes de liberar, para que cada malla vuelva a
      // tener puesto su material de verdad. `liberar` solo mira
      // `malla.material`, y lo que la fluoroscopia aparta en el mapa quedaría
      // fuera de su alcance: terminar un caso con la fluoroscopia encendida
      // dejaba sin soltar justo los materiales y las texturas del modelo.
      aplicarFluoroscopia(taller.current, false)
      sincronizarAyudas(taller.current, false, undefined)
      // Las heridas devuelven su geometría original a la malla antes de soltar:
      // `liberar` suelta la que la malla tenga puesta, y la otra quedaría colgando.
      cerrarTodasLasHeridas(taller.current)
      quitarAgujeros(taller.current)
      if (taller.current.sutura) soltarSutura(taller.current.sutura)
      if (taller.current.implantes) quitarImplantes(taller.current.implantes)
      lectura.remove()
      // Liberar a mano: aquí hay decenas de megabytes en la tarjeta y pasear
      // por la plataforma acabaría tirando la pestaña.
      liberar(escena)
      // El contexto de WebGL sobrevive a `dispose()` —que solo suelta las
      // estructuras internas del render— y a quitar el lienzo del documento.
      // Se pierde a propósito para que la tarjeta recupere la memoria al
      // cambiar de caso y no cuando el navegador se decida. Va después de
      // `liberar`, porque el borrado de texturas necesita el contexto vivo.
      entorno.dispose()
      pmrem.dispose()
      render.forceContextLoss()
      render.dispose()
      render.domElement.remove()
      taller.current = {
        puntosDelTrazo: [],
        materialesOriginales: new Map(),
        rolesAplicados: new Map(),
        normalesDelTrazo: [],
        heridas: new Map(),
        agujeros: [],
      }
    }
    // Se monta una vez por modelo. Lo demás se aplica sin rehacer la escena.
  }, [url])

  // ----------------------------------------------------- cambios de estado
  useEffect(() => {
    if (!taller.current.raiz) return
    const anterior = taller.current.fragmento
    const fragmento = buscarFragmento(taller.current.raiz, piezas)
    taller.current.fragmento = fragmento

    // El sitio de reposo se vuelve a leer **aquí**, y no solo al cargar el
    // archivo. En un caso ya escrito daba igual, porque las piezas llegan con
    // el modelo. En el taller no: el traumatólogo abre el modelo y señala las
    // piezas después, así que al cargar todavía no había ningún fragmento y el
    // origen se quedaba sin fijar. Con el origen sin fijar, `estadoDelFragmento`
    // devuelve ceros y «Capturar desplazamiento» guardaba seis ceros diciendo
    // «Desplazamiento capturado»: el caso salía ya reducido y el paso de
    // reducción se aprobaba sin tocar nada.
    if (fragmento && fragmento !== anterior) {
      taller.current.origenDelFragmento = {
        posicion: fragmento.position.clone(),
        rotacion: fragmento.rotation.clone(),
      }
    }
    if (!fragmento) taller.current.origenDelFragmento = undefined
    // El objetivo de los rayos X es copia del fragmento de antes: si cambió, se
    // rehace en el efecto de las ayudas, que va justo detrás de este.
    if (fragmento !== anterior) sincronizarAyudas(taller.current, false, undefined)

    aplicarPiezas(taller.current, piezas)
    taller.current.pedirDibujo?.()
  }, [piezas])

  useEffect(() => {
    if (!taller.current.raiz) return
    aplicarFluoroscopia(taller.current, fluoroscopia)
    taller.current.pedirDibujo?.()
  }, [fluoroscopia])

  // Las ayudas de aprendizaje de los rayos X: se ponen y se quitan con ellos.
  // Va después del efecto de las piezas, que es el que fija el fragmento y su
  // sitio de reposo, y de lo que dependen las dos.
  const verObjetivo = !!ayudas?.objetivo
  const verEjes = !!ayudas?.ejes
  useEffect(() => {
    if (!taller.current.raiz) return
    sincronizarAyudas(taller.current, fluoroscopia, { objetivo: verObjetivo, ejes: verEjes })
    taller.current.pedirDibujo?.()
  }, [fluoroscopia, verObjetivo, verEjes, piezas])

  // ------------------------------------------------- el instrumento elegido
  /**
   * Carga el instrumento y lo pone en la escena.
   *
   * Se rehace al cambiar de instrumento y **también al cambiar de modelo del
   * caso**: el montaje de arriba tira la escena entera cuando cambia `url`, y
   * con ella al instrumento, que habría que volver a poner.
   *
   * Un instrumento a la vez, y solo el elegido: trece modelos cargando a la vez
   * dejarían la consola inservible en el equipo de referencia del residente.
   */
  const urlDelInstrumento = instrumento?.url ?? null
  useEffect(() => {
    const escena = taller.current.escena
    if (!urlDelInstrumento || !escena) return
    let vivo = true
    let cargado: HerramientaCargada | undefined
    new GLTFLoader().load(
      urlDelInstrumento,
      (gltf) => {
        if (!vivo) return
        const h = prepararHerramienta(gltf.scene)
        // El instrumento viene en metros y el caso en las unidades de su
        // archivo: una unidad mide `milimetrosPorUnidad` mm, y un metro son mil.
        h.raiz.scale.setScalar(1000 / (ultimas.current.milimetrosPorUnidad || 1000))
        h.raiz.visible = false
        escena.add(h.raiz)
        taller.current.herramienta = h
        cargado = h
        const v = ultimas.current.instrumento
        aplicarPose(h, v?.ajustes ?? null, v?.articulaciones ?? {})
        aplicarColores(h, v?.ajustes ?? null)
        aplicarEntorno(h, taller.current.entorno ?? null)
        ultimas.current.alCargarInstrumento?.(h.meta?.articulaciones ?? [])
        // Aparece al elegirlo, sin esperar a que el cursor pase por encima.
        taller.current.herramientaAlCentro?.()
        taller.current.pedirDibujo?.()
      },
      undefined,
      () => {
        if (!vivo) return
        ultimas.current.alCargarInstrumento?.(null, 'No se pudo abrir el modelo de este instrumento.')
      },
    )
    return () => {
      vivo = false
      if (cargado) {
        liberarHerramienta(cargado)
        if (taller.current.herramienta === cargado) taller.current.herramienta = undefined
      }
      taller.current.pedirDibujo?.()
    }
  }, [urlDelInstrumento, url])

  // Su pose cambia con lo que mande el administrador y con lo que mueva quien lo usa.
  const ajustesDelInstrumento = instrumento?.ajustes ?? null
  const articulacionesDelInstrumento = instrumento?.articulaciones
  useEffect(() => {
    const h = taller.current.herramienta
    if (!h) return
    aplicarPose(h, ajustesDelInstrumento, articulacionesDelInstrumento ?? {})
    aplicarColores(h, ajustesDelInstrumento)
    taller.current.pedirDibujo?.()
  }, [ajustesDelInstrumento, articulacionesDelInstrumento])

  useEffect(() => {
    const h = taller.current.herramienta
    if (!h) return
    h.raiz.scale.setScalar(1000 / (milimetrosPorUnidad || 1000))
    taller.current.pedirDibujo?.()
  }, [milimetrosPorUnidad])

  useEffect(() => {
    const controles = taller.current.controles
    if (!controles) return
    // En modo Trazar y Mover, la órbita estorba: cada arrastre giraría la
    // escena en vez de dibujar. Se apaga el giro y se deja el zoom.
    controles.enableRotate = modo === 'orbitar'
    // `OrbitControls` pone `touch-action: none` al conectarse; esto lo
    // corrige después, en cada cambio de modo (ver `gestoTactil`).
    if (taller.current.render) taller.current.render.domElement.style.touchAction = gestoTactil(modo)
    if (taller.current.render) {
      taller.current.render.domElement.style.cursor =
        modo === 'orbitar'
          ? 'grab'
          : modo === 'trazar' || modo === 'perforar' || modo === 'coser' || modo === 'fijar'
            ? 'crosshair'
            : modo === 'separar'
              ? 'ew-resize'
              : 'move'
    }
  }, [modo])

  return <div className="consola-lienzo" ref={lienzo} />
}

// ------------------------------------------------------------------ auxiliares

/**
 * Qué gestos del dedo se queda el lienzo y cuáles devuelve a la página.
 *
 * Era `none` siempre: en el móvil la consola ocupa el ancho entero y el lienzo
 * casi media pantalla, así que el pulgar que bajaba por la página caía tarde o
 * temprano sobre el modelo y la página dejaba de desplazarse —el arrastre
 * giraba el hueso—. Al orbitar, el desplazamiento vertical vuelve a ser de la
 * página (`pan-y`): se gira arrastrando de lado y se acerca pellizcando, que
 * siguen llegando al lienzo. Al trazar, mover y señalar el lienzo necesita el
 * arrastre entero, en cualquier dirección, y se lo queda (`none`); ahí el modo
 * lo ha pedido quien lo eligió, y la página se mueve fuera del modelo.
 */
export function gestoTactil(modo: Modo): 'pan-y' | 'none' {
  return modo === 'orbitar' ? 'pan-y' : 'none'
}
//
// `aplicarPiezas` y `liberarMaterial` salen del módulo a propósito, aunque solo
// se usen aquí dentro: son las dos piezas de este archivo que pueden estar mal
// sin que nada lo diga —una deja una malla invisible para siempre, la otra deja
// la memoria de vídeo ocupada— y son las dos que no necesitan navegador para
// probarse. Las ejercita `tests/unit/lienzoQuirurgico.test.ts`.

export type Taller = {
  escena?: THREE.Scene
  camara?: THREE.PerspectiveCamera
  controles?: OrbitControls
  raiz?: THREE.Object3D
  fragmento?: THREE.Object3D
  /** Dónde estaba el fragmento al cargar: contra eso se mide y ahí es donde debe quedar. */
  origenDelFragmento?: { posicion: THREE.Vector3; rotacion: THREE.Euler }
  trazo?: THREE.Line
  puntosDelTrazo: Punto3[]
  materialesOriginales: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
  rolesAplicados: Map<string, PiezaDelCaso['rol']>
  /** El instrumento que está en escena, si hay uno elegido y ya cargó. */
  herramienta?: HerramientaCargada
  /** La silueta del fragmento en su sitio correcto (ayuda de los rayos X). */
  fantasma?: THREE.Object3D
  /** Los dos ejes de la guía de angulación (ayuda de los rayos X). */
  guias?: THREE.LineSegments
  pedirDibujo?: () => void
  normalesDelTrazo?: Punto3[]
  heridas?: Map<PlanoDeCorte, HeridaEnCapa[]>
  ultimaHerida?: PlanoDeCorte
  agujeros?: THREE.Mesh[]
  sutura?: SuturaEnEscena
  aperturaAntesDeCoser?: Map<HeridaEnCapa, { mas: number; menos: number }>
  implantes?: ImplantesEnEscena
  /** Escribe en la etiqueta que flota sobre el lienzo. */
  decir?: (texto: string) => void
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

/**
 * Las mallas con nombre y su `userData`, en el orden del archivo.
 *
 * Solo mallas, igual que `nodosDelModelo`: son lo único que la consola enciende
 * y apaga, y un grupo vacío con extras propondría una fila para algo que no se
 * ve. Los datos se copian en un objeto llano para que quien los reciba no
 * pueda escribir sobre el `userData` de la escena montada.
 *
 * Sale del componente para poder probarla contra un archivo de verdad abierto
 * con `GLTFLoader`, sin WebGL: es el tramo donde el rol escrito por el
 * exportador podría perderse camino del taller sin ningún error.
 */
export function datosDeLosNodos(raiz: THREE.Object3D): DatosDeNodo[] {
  const salida: DatosDeNodo[] = []
  raiz.traverse((objeto) => {
    if (!(objeto as THREE.Mesh).isMesh || !objeto.name) return
    salida.push({ nodo: objeto.name, datos: { ...objeto.userData } })
  })
  return salida
}

/** El nodo declarado como fragmento móvil, si el archivo lo trae. */
function buscarFragmento(raiz: THREE.Object3D, piezas: PiezaDelCaso[]): THREE.Object3D | undefined {
  const nombre = piezas.find((p) => p.rol === 'fragmento')?.nodo
  if (!nombre) return undefined
  const fragmento = raiz.getObjectByName(nombre) ?? undefined
  if (fragmento) pivoteEnSuCentro(fragmento)
  return fragmento
}

/**
 * Lleva el origen del fragmento al centro de su propia geometría, sin moverlo.
 *
 * El giro de la reducción se aplica sobre el origen del nodo. Si el archivo
 * trae cada pieza con el origen en el del cuerpo —lo normal en lo exportado
 * del atlas sin centrar—, ese origen queda a decenas de centímetros del hueso,
 * y los 12° de angulación del caso de la mano lanzaban el metacarpiano a
 * 17 cm, fuera de la mano: se veía un hueso suelto lejos y el residente no
 * tenía nada que reducir. Además el giro arrastraba el hueso y el panel de
 * medidas, que mide la posición del nodo, no se enteraba.
 *
 * Se hace aquí, al cargar, y no pidiendo modelos bien preparados: un archivo
 * mal centrado no da error en ningún sitio, solo un caso que no se puede jugar.
 * La posición y el giro de partida se leen después, así que `estadoDelFragmento`
 * sigue midiendo contra el sitio de verdad.
 */
function pivoteEnSuCentro(fragmento: THREE.Object3D) {
  // Una vez por nodo, marcado, y no «si el centro ya está cerca de cero»: el
  // efecto de las piezas vuelve a pasar por aquí en cada repintado del taller,
  // y en un modelo en milímetros lo que deja `translate` en float32 pasa de
  // cualquier margen absoluto. Cada pasada clonaba otra vez la geometría sin
  // soltar la anterior —memoria de la tarjeta que no vuelve— y corría el hueso
  // unas micras (O-076).
  if (fragmento.userData.pivoteCentrado) return
  fragmento.updateMatrixWorld(true)
  const inversa = fragmento.matrixWorld.clone().invert()
  const caja = new THREE.Box3()
  fragmento.traverse((objeto) => {
    const malla = objeto as THREE.Mesh
    if (!malla.isMesh) return
    malla.geometry.computeBoundingBox()
    if (!malla.geometry.boundingBox) return
    // Caja de cada malla en el espacio propio del fragmento.
    const relativa = malla.matrixWorld.clone().premultiply(inversa)
    caja.union(malla.geometry.boundingBox.clone().applyMatrix4(relativa))
  })
  if (caja.isEmpty()) return
  const centro = caja.getCenter(new THREE.Vector3())
  fragmento.userData.pivoteCentrado = true
  if (centro.lengthSq() === 0) return

  // Lo de dentro retrocede lo mismo que avanza el nodo: el hueso no se mueve.
  const malla = fragmento as THREE.Mesh
  if (malla.isMesh) {
    malla.geometry = malla.geometry.clone()
    malla.geometry.translate(-centro.x, -centro.y, -centro.z)
  }
  for (const hijo of fragmento.children) hijo.position.sub(centro)
  fragmento.position.add(centro.clone().multiply(fragmento.scale).applyQuaternion(fragmento.quaternion))
  fragmento.updateMatrixWorld(true)
}

/**
 * Enciende y apaga según el rol declarado. Los implantes empiezan ocultos.
 *
 * Se aplican los **cambios** de rol y no el estado entero, que sería más corto
 * de escribir. Dos razones, y las dos se pagaron caras.
 *
 * Antes esto solo apagaba y nunca encendía: el autor que marcaba una pieza como
 * «implante» y se arrepentía la dejaba invisible para siempre. La fila seguía
 * bien puesta en la tabla, el nodo seguía en el archivo y no había ningún
 * aviso; la única salida era recargar y perder el formulario a medio llenar.
 *
 * Y asignar `visible` a todo en cada llamada tampoco vale, porque quien manda
 * sobre la visibilidad es `mostrar()` —las capas de la consola, el «Solo esto»
 * del taller— y aquí se entra en cada repintado: en el taller la lista de
 * piezas se recalcula en el cuerpo del componente y llega siempre como array
 * nuevo, así que aislar una pieza se desharía solo al pulsar lo siguiente.
 */
export function aplicarPiezas(taller: Taller, piezas: PiezaDelCaso[]) {
  const raiz = taller.raiz
  if (!raiz) return
  const porNombre = new Map(piezas.map((p) => [p.nodo, p]))
  raiz.traverse((objeto) => {
    if (!(objeto as THREE.Mesh).isMesh) return
    const rol = porNombre.get(objeto.name)?.rol
    const anterior = taller.rolesAplicados.get(objeto.name)
    if (rol === anterior) return
    if (rol) taller.rolesAplicados.set(objeto.name, rol)
    else taller.rolesAplicados.delete(objeto.name)
    if (rol === 'implante') objeto.visible = false
    else if (anterior === 'implante') objeto.visible = true
  })
}

/**
 * La opacidad de todo con los rayos X puestos.
 *
 * La misma que usa el taller anatómico (`OPACIDAD_DE_RAYOS_X`, en
 * `@/atlas/cargador`): el dueño pidió que la fluoroscopia fuera **ese** RX y no
 * otra cosa, y la forma de que no se separen es que digan lo mismo. Está
 * repetida aquí y no importada porque aquel módulo trae los sombreadores del
 * atlas entero, y el residente no los necesita para abrir un caso;
 * `tests/unit/lienzoQuirurgico.test.ts` compara las dos cifras.
 */
export const OPACIDAD_DE_RAYOS_X = 0.5

/**
 * Vista de rayos X (D-166): la del taller anatómico, todo translúcido.
 *
 * Antes era una lectura en grises sumando luz (mezcla aditiva con un material
 * plano), que se parecía a una radiografía pero no a nada de lo que el
 * traumatólogo usa para preparar el caso: en el taller ya tenía «Rayos X», con
 * cada pieza de su color al 50 %, y eran dos vistas distintas con el mismo
 * nombre. Ahora es una sola.
 *
 * Se trabaja sobre **copias** del material: el original se guarda en el mapa y
 * vuelve al apagar, así que el color y las texturas del archivo no se tocan, y
 * `liberar` no se entera de nada.
 */
function aplicarFluoroscopia(taller: Taller, encendida: boolean) {
  const raiz = taller.raiz
  if (!raiz) return

  const traslucido = (material: THREE.Material): THREE.Material => {
    const copia = material.clone()
    copia.transparent = true
    copia.opacity = OPACIDAD_DE_RAYOS_X
    // Sin escribir profundidad las capas se suman en vez de taparse, que es lo
    // que deja ver el hueso a través de la piel.
    copia.depthWrite = false
    return copia
  }

  raiz.traverse((objeto) => {
    const malla = objeto as THREE.Mesh
    if (!malla.isMesh) return

    if (encendida) {
      if (taller.materialesOriginales.has(malla)) return
      taller.materialesOriginales.set(malla, malla.material)
      malla.material = Array.isArray(malla.material)
        ? malla.material.map(traslucido)
        : traslucido(malla.material)
    } else {
      const original = taller.materialesOriginales.get(malla)
      if (!original) return
      for (const m of Array.isArray(malla.material) ? malla.material : [malla.material]) m.dispose()
      malla.material = original
      taller.materialesOriginales.delete(malla)
    }
  })
}

// ------------------------------------------------- ayudas de los rayos X
/**
 * El vector de cada eje, para las proyecciones y la guía de angulación.
 *
 * `AP` y `lateral` son las dos vistas de un C-arm, perpendiculares entre sí y al
 * eje largo del hueso. Con el eje en Y —lo habitual— son mirar desde delante (+Z)
 * y desde un lado (+X).
 */
const VECTOR_DEL_EJE: Record<EjeLargo, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

function proyecciones(eje: EjeLargo): { ap: THREE.Vector3; lateral: THREE.Vector3 } {
  if (eje === 'y') return { ap: new THREE.Vector3(0, 0, 1), lateral: new THREE.Vector3(1, 0, 0) }
  if (eje === 'x') return { ap: new THREE.Vector3(0, 0, 1), lateral: new THREE.Vector3(0, 1, 0) }
  return { ap: new THREE.Vector3(0, 1, 0), lateral: new THREE.Vector3(1, 0, 0) }
}

/** Pone la cámara en una de las dos proyecciones, o en la de siempre. */
function mirarDesdeProyeccion(taller: Taller, vista: VistaDeEscopia, eje: EjeLargo) {
  const p = proyecciones(eje)
  encuadrarVisible(taller, vista === 'ap' ? p.ap : vista === 'lateral' ? p.lateral : undefined)
}

/** Las mallas visibles que no son del fragmento, y de ellas las que el caso llama hueso. */
function huesoFijo(taller: Taller, piezas: PiezaDelCaso[]): THREE.Mesh[] {
  const { raiz, fragmento } = taller
  if (!raiz) return []
  const rolDe = new Map(piezas.map((p) => [p.nodo, p.rol]))
  const candidatas: THREE.Mesh[] = []
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible) return
    if (fragmento && perteneceA(m, fragmento)) return
    candidatas.push(m)
  })
  const conRol = candidatas.filter((m) => rolDe.get(m.name) === 'hueso')
  return conRol.length > 0 ? conRol : candidatas
}

/**
 * Pone o quita las dos ayudas de aprendizaje de los rayos X.
 *
 * Se llama cuando cambia cualquiera de sus condiciones, y es idempotente: lo
 * que ya está bien puesto se deja y lo que sobra se quita.
 *
 * El objetivo es una **copia** del fragmento colocada en el sitio de reposo, o
 * sea donde debe quedar la reducción correcta, pintada de verde y translúcida.
 * Comparte la geometría con el fragmento real: por eso al quitarla solo se
 * sueltan sus materiales, y nunca su geometría.
 */
export function sincronizarAyudas(
  taller: Taller,
  encendidas: boolean,
  ayudas: AyudasDeEscopia | undefined,
) {
  const escena = taller.escena
  if (!escena) return

  const quererObjetivo =
    encendidas && !!ayudas?.objetivo && !!taller.fragmento && !!taller.origenDelFragmento
  if (!quererObjetivo && taller.fantasma) {
    escena.remove(taller.fantasma)
    taller.fantasma.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) (m.material as THREE.Material).dispose()
    })
    taller.fantasma = undefined
  }
  if (quererObjetivo && !taller.fantasma && taller.fragmento && taller.origenDelFragmento) {
    const original = taller.fragmento
    const origen = taller.origenDelFragmento
    const copia = original.clone(true)
    copia.position.copy(origen.posicion)
    copia.rotation.copy(origen.rotacion)
    copia.updateMatrix()
    const verde = new THREE.MeshBasicMaterial({
      color: 0x3ddc84,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    copia.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.material = verde.clone()
        m.renderOrder = 5
        m.visible = true
      }
    })
    verde.dispose()
    // La copia cuelga de la escena y no del padre del fragmento, para que
    // `raiz.traverse` —que decide qué se ve, qué se señala y qué se mide— no la
    // encuentre. Se le pasa el mundo del padre a mano.
    original.parent?.updateMatrixWorld(true)
    const mundoDelPadre = original.parent ? original.parent.matrixWorld : new THREE.Matrix4()
    const grupo = new THREE.Group()
    grupo.matrixAutoUpdate = false
    grupo.matrix.copy(mundoDelPadre).multiply(copia.matrix)
    copia.matrixAutoUpdate = false
    copia.matrix.identity()
    grupo.add(copia)
    grupo.userData.auxiliar = true
    escena.add(grupo)
    taller.fantasma = grupo
  }

  const quererEjes = encendidas && !!ayudas?.ejes && !!taller.fragmento
  if (!quererEjes && taller.guias) {
    escena.remove(taller.guias)
    taller.guias.geometry.dispose()
    ;(taller.guias.material as THREE.Material).dispose()
    taller.guias = undefined
  }
  if (quererEjes && !taller.guias) {
    const geometria = new THREE.BufferGeometry()
    geometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3))
    // Verde el eje del hueso fijo, ámbar el del fragmento: la separación entre
    // los dos es la angulación que la consola mide.
    geometria.setAttribute(
      'color',
      new THREE.BufferAttribute(
        new Float32Array([0.24, 0.86, 0.52, 0.24, 0.86, 0.52, 1, 0.76, 0.2, 1, 0.76, 0.2]),
        3,
      ),
    )
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
    })
    const lineas = new THREE.LineSegments(geometria, material)
    lineas.renderOrder = 998
    lineas.frustumCulled = false
    escena.add(lineas)
    taller.guias = lineas
  }
}

/**
 * Recoloca los dos ejes sobre el modelo. Es barato, y se llama en cada dibujo
 * mientras la guía esté encendida: el fragmento se mueve con el ratón.
 */
function actualizarGuias(taller: Taller, eje: EjeLargo, piezas: PiezaDelCaso[]) {
  const { guias, fragmento, origenDelFragmento: origen, raiz } = taller
  if (!guias || !fragmento || !origen || !raiz) return
  raiz.updateMatrixWorld(true)

  const caja = new THREE.Box3()
  for (const m of huesoFijo(taller, piezas)) caja.expandByObject(m)
  const cajaDelFragmento = new THREE.Box3().setFromObject(fragmento)
  if (caja.isEmpty()) caja.copy(cajaDelFragmento)
  if (caja.isEmpty()) return

  const eje0 = VECTOR_DEL_EJE[eje].clone()
  const centroFijo = caja.getCenter(new THREE.Vector3())
  const mitad = Math.max(...caja.getSize(new THREE.Vector3()).toArray()) * 0.6 || 0.1

  // La rotación del fragmento respecto de su sitio de reposo: es lo que se
  // movió, y lo único que inclina su eje.
  const reposo = new THREE.Quaternion().setFromEuler(origen.rotacion)
  const delta = fragmento.quaternion.clone().multiply(reposo.invert())
  const ejeDelFragmento = eje0.clone().applyQuaternion(delta).normalize()
  const centroDelFragmento = cajaDelFragmento.getCenter(new THREE.Vector3())

  const posiciones = guias.geometry.getAttribute('position') as THREE.BufferAttribute
  const poner = (i: number, v: THREE.Vector3) => posiciones.setXYZ(i, v.x, v.y, v.z)
  poner(0, centroFijo.clone().addScaledVector(eje0, -mitad))
  poner(1, centroFijo.clone().addScaledVector(eje0, mitad))
  poner(2, centroDelFragmento.clone().addScaledVector(ejeDelFragmento, -mitad * 0.55))
  poner(3, centroDelFragmento.clone().addScaledVector(ejeDelFragmento, mitad * 0.55))
  posiciones.needsUpdate = true
}

// ------------------------------------------------------------------ heridas

/** Todas las mallas cortadas, de todas las capas. */
function todasLasHeridas(taller: Taller): HeridaEnCapa[] {
  return [...(taller.heridas?.values() ?? [])].flat()
}

/** Lo que hay cortado y abierto, o `null` si no se ha cortado nada. */
export function estadoDeLasHeridas(taller: Taller, milimetrosPorUnidad: number): EstadoDeLasHeridas | null {
  const todas = todasLasHeridas(taller)
  if (todas.length === 0) return null
  const unidadesPorMm = 1 / (milimetrosPorUnidad || 1000)
  return {
    capas: [...(taller.heridas?.keys() ?? [])],
    largoMm: Math.max(...todas.map((h) => h.largo)) / unidadesPorMm,
    aperturaMm: Math.max(...todas.map((h) => h.mas + h.menos)) / unidadesPorMm,
  }
}

// --------------------------------------------------------------- fijación

/** Lo que hay fijado: la placa y sus tornillos, o `null` si no hay placa. */
export function estadoDeLaFijacion(taller: Taller): EstadoDeLaFijacion | null {
  const imp = taller.implantes
  if (!imp?.placa) return null
  return {
    placa: {
      nombre: imp.placa.nombre,
      agujeros: imp.placa.agujerosMm.length,
      apoyada: imp.placa.separadaDelHuesoMm <= 1.5,
      separadaDelHuesoMm: imp.placa.separadaDelHuesoMm,
    },
    tornillos: [...imp.tornillos.values()].map((t) => t.datos).sort((a, b) => a.agujero - b.agujero),
  }
}

// ------------------------------------------------------------------ sutura

/** De qué lado de la herida cae un punto, o 0 si no hay herida a menos de 25 mm. */
function ladoDelPunto(taller: Taller, punto: THREE.Vector3, unidadesPorMm: number): 1 | -1 | 0 {
  let mejor: { lado: 1 | -1; cerca: number } | null = null
  for (const h of todasLasHeridas(taller)) {
    const info = ladoDeLaHerida(h, punto)
    if (info && (!mejor || info.cerca < mejor.cerca)) mejor = { lado: info.lado, cerca: info.cerca }
  }
  return mejor && mejor.cerca <= 25 * unidadesPorMm ? mejor.lado : 0
}

/**
 * Lo que hay que rehacer cuando cambia la sutura: el hilo dibujado, lo que cierra
 * la herida y lo que se le dice a la consola.
 *
 * La herida se cierra **a partir de los cruces**, no puntada a puntada: es una
 * función de lo que hay cosido ahora, y por eso deshacer la última devuelve la
 * herida a lo que tenía con las demás sin llevar la cuenta aparte. Antes de
 * cerrarla por primera vez se anota cuánto estaba abierta cada capa; al quitar la
 * sutura se devuelve a eso.
 */
export function refrescarSutura(
  taller: Taller,
  milimetrosPorUnidad: number,
  avisar: ((estado: EstadoDeLaSutura | null) => void) | undefined,
  juicio: 'ultima' | null,
) {
  const sutura = taller.sutura
  if (!sutura) return
  const unidadesPorMm = 1 / (milimetrosPorUnidad || 1000)
  const heridas = todasLasHeridas(taller)
  const medida = medirLaSutura(sutura.puntos, milimetrosPorUnidad)
  const largoMm = heridas.length > 0 ? Math.max(...heridas.map((h) => h.largo)) / unidadesPorMm : 0
  const cierre = cierreDeLaHerida(medida.cruces, largoMm)

  if (heridas.length > 0) {
    if (cierre > 0 && !taller.aperturaAntesDeCoser) {
      taller.aperturaAntesDeCoser = new Map(heridas.map((h) => [h, { mas: h.mas, menos: h.menos }]))
    }
    const antes = taller.aperturaAntesDeCoser
    if (antes) {
      for (const h of heridas) {
        const base = antes.get(h)
        if (base) abrirCapa(h, base.mas * (1 - cierre), base.menos * (1 - cierre))
      }
      if (cierre === 0) taller.aperturaAntesDeCoser = undefined
    }
  }

  const superficies = taller.raiz ? mallasVisibles(taller.raiz) : []
  reconstruirHilo(sutura, superficies, unidadesPorMm)

  if (sutura.puntos.length === 0) {
    taller.decir?.('')
    avisar?.(null)
    taller.pedirDibujo?.()
    return
  }
  const ultima = sutura.puntos[sutura.puntos.length - 1]
  const ultimaSeparacionMm = ultima.nuevaLinea ? null : medida.separacionesMm[medida.separacionesMm.length - 1] ?? null
  const penultima = sutura.puntos[sutura.puntos.length - 2]
  const ultimaCruza = !!penultima && !ultima.nuevaLinea && ultima.lado !== 0 && penultima.lado !== 0 && ultima.lado !== penultima.lado
  const texto =
    `Puntada ${sutura.puntos.length}` +
    (ultimaSeparacionMm !== null ? ` · ${ultimaSeparacionMm.toFixed(0)} mm de la anterior` : ' · empieza una línea') +
    (ultimaCruza ? ' · cruza la herida' : '') +
    (heridas.length > 0 ? ` · herida cerrada al ${Math.round(cierre * 100)} %` : '')
  taller.decir?.(texto)
  avisar?.({
    ...medida,
    cierre,
    ultimaSeparacionMm,
    juicio: juicio === 'ultima' ? juicioDeLaPuntada(ultimaSeparacionMm) : null,
    ultimaCruza,
    hilo: sutura.hilo.nombre,
  })
  taller.pedirDibujo?.()
}

/** Cierra todas las heridas: cada malla recupera la geometría de antes del corte. */
function cerrarTodasLasHeridas(taller: Taller) {
  for (const h of todasLasHeridas(taller)) cerrarCapa(h)
  taller.heridas?.clear()
  taller.ultimaHerida = undefined
  if (taller.trazo) taller.trazo.visible = true
}

function quitarAgujeros(taller: Taller) {
  for (const a of taller.agujeros ?? []) {
    a.removeFromParent()
    a.geometry.dispose()
    ;(a.material as THREE.Material).dispose()
  }
  if (taller.agujeros) taller.agujeros.length = 0
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

function encuadrarVisible(taller: Taller, direccion?: THREE.Vector3) {
  const { raiz, camara, controles } = taller
  if (!raiz || !camara || !controles) return

  // Las matrices del mundo se ponen al día antes de medir. `expandByObject` solo
  // actualiza la del propio objeto, no la de sus padres, y justo al cargar la
  // raíz se acaba de mover para centrar el modelo sin que se haya dibujado
  // nada: la caja salía en las coordenadas del archivo y la cámara apuntaba al
  // vacío. Con un modelo ya centrado en su archivo no se nota, porque ese
  // movimiento es cero; con uno exportado en su sitio del cuerpo —la mano del
  // atlas, a 85 cm del origen— el lienzo nacía en blanco hasta pulsar
  // «Encuadrar».
  raiz.updateMatrixWorld(true)
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
    .add((direccion ?? new THREE.Vector3(0.4, 0.15, 1)).clone().normalize().multiplyScalar(distanciaCamara))
  controles.update()
  taller.pedirDibujo?.()
}

/**
 * Suelta el material y, antes, sus texturas.
 *
 * Las texturas hay que recorrerlas a mano porque `Material.dispose()` de three
 * no las toca: su cuerpo entero es un `dispatchEvent({ type: 'dispose' })`, que
 * sirve para soltar el programa compilado y nada más. `renderer.dispose()`
 * tampoco llama a `deleteTexture`. Sin esto, la memoria de vídeo de cada modelo
 * se queda ocupada hasta que el navegador recoja el contexto, y un modelo con
 * piel y músculo texturizados son decenas de megabytes por caso: el residente
 * que recorre seis acaba con la consola en negro a media práctica.
 *
 * Se miran todas las propiedades y no una lista de mapas conocidos (`map`,
 * `normalMap`, `roughnessMap`…) porque la lista depende del tipo de material y
 * de la versión de three, y la que se quede fuera no dará ningún error: se
 * notará como lentitud sin causa visible varios casos después.
 */
export function liberarMaterial(material: THREE.Material) {
  for (const valor of Object.values(material) as unknown[]) {
    const textura = valor as THREE.Texture | null
    if (textura?.isTexture) textura.dispose()
  }
  material.dispose()
}

function liberar(escena: THREE.Scene) {
  escena.traverse((objeto) => {
    const malla = objeto as THREE.Mesh
    if (!malla.isMesh) return
    malla.geometry?.dispose()
    const material = malla.material
    if (Array.isArray(material)) material.forEach(liberarMaterial)
    else if (material) liberarMaterial(material)
  })
  void EJES
}
