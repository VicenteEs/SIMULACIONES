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
import { largoVisibleDelAgujero, reconciliarConElModelo } from '@/lib/simulador'
import { crearGizmo, escalaDelGizmo, type AsaDelGizmo } from '@/atlas/gizmo'
import { desplazamientoDelArrastre, giroDelArrastre } from '@/atlas/transformar'
import { ajustarAlSalto, barridoEnPantalla, centroLocalDe, colocarEnElMundo } from './asasDelHueso'
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
import { ANCHO_VISIBLE_DE_LA_INCISION_MM, abrirCapa, cerrarCapa, cortarCapa, ladoDeLaHerida, refrescarBordes, sitioEnLaHerida, type HeridaEnCapa } from './heridas'
import { incisionQueAlarga, UMBRAL_PARA_ALARGAR_MM, type Punto, type ResumenDeIncision } from '@/lib/incisiones'
import { juicioDeLaPotencia, type ModoDelElectrobisturi } from '@/lib/electrobisturi'
import {
  adviertePorLaTension,
  ALTURA_INICIAL_DEL_PELLIZCO_MM,
  ALTURA_MAXIMA_DEL_PELLIZCO_MM,
  AGARRE_MINIMO_PARA_SOSTENER,
  abreLaCapa,
  aperturaMaxima,
  caben,
  direccionDelMango,
  enElPlano,
  ladoAlColocar,
  ladosParaLaPareja,
  laPareja,
  limitarAgarre,
  limitarApertura,
  limitarSeparacionDePinzas,
  MAXIMO_DE_PELLIZCOS,
  MAXIMO_DE_SEPARADORES,
  PASO_DE_AGARRE,
  posicionQueAcompana,
  RETRASO_AL_ACOMPANAR_MM,
  SEPARACION_MAXIMA_DE_PINZAS_MM,
  tensionDeLaPiel,
  tipoDelSeparador,
  type CapaDeLaHerida,
  type Pellizco,
  type PlanoDelSeparador,
  type SeparadorColocado,
  type TensionDeLaPiel,
} from '@/lib/exposicion'
import { RADIO_DE_RETRACCION_MM, retraerVertices } from '@/lib/retraccion'
import {
  aperturaPorLabioEnMm,
  avanzo,
  capaBlandaDelRol,
  separaElPlano,
  textoDeLaDiseccion,
  trazoDeLaDiseccion,
  type NodoDeDiseccion,
} from '@/lib/diseccionRoma'
import { esRectaValida, muestrasEntre, type TipoDeTrazo } from '@/lib/trazoRecto'
import {
  girarLaVista,
  poseDeLaPosicion,
  rodarLaVista,
  type PoseDeLaVista,
  type PosicionDelPaciente,
} from '@/lib/posicionDelPaciente'
import { POSE_AL_CARGAR, aplicarLaPose, poseActual, ponerLaPose } from './vistaDelPaciente'
import type { AjustesDeLaImagen, DesplazamientoDeLaImagen, ProyeccionDeFluoroscopia } from '@/lib/radiografia'
import {
  dibujarFluoroscopia,
  prepararFluoroscopia,
  reiniciarLaFluoroscopia,
  revelarLaToma,
  soltarFluoroscopia,
  type EscenaParaRadiografia,
  type TallerDeFluoroscopia,
} from './radiografiaEnLaEscena'
import {
  aplicarSeparadoresALasHeridas,
  apoyarSeparadorEn,
  colocarInstrumento,
  soltarInstrumento,
  type InstrumentoColocado,
  crearPliegue,
  posarEn,
  posarPliegue,
  posarSeparador,
  soltarPellizco,
  soltarSeparador,
  type PellizcoEnEscena,
  type SeparadorEnEscena,
  type SitioDeSeparador,
} from './exposicionEnLaEscena'
import {
  cierreDeLaHerida,
  cierreConTension,
  juicioDeLaPuntada,
  juicioDeLaTension,
  medirLaSutura,
  type HiloDeSutura,
  type MedidaDeLaSutura,
  type PuntoDeSutura,
} from '@/lib/sutura'
import { agujeroBajoElPunto, ajustarPlaca, colocarPlaca, colocarTornillo, crearImplantes, medirBajoElAgujero, posicionDelAgujero, quitarImplantes, quitarTornillos, type ImplantesEnEscena } from './implantesEnLaEscena'
import { avisoDeCalibre, largoSugerido, loQueFaltaPara, textoDeLoQueFalta, type EstadoDeLaFijacion, type QueColoca } from '@/lib/fijacion'
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

export type Modo = 'orbitar' | 'trazar' | 'mover' | 'senalar' | 'separar' | 'pinzar' | 'perforar' | 'coser' | 'fijar' | 'disecar' | 'reducir' | 'info'

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

/** Los separadores que hay puestos en la herida y cuál es el que responde a la rueda. */
export interface EstadoDeLosSeparadores {
  lista: SeparadorColocado[]
  /** El que se abre con la rueda y con la barra: el último puesto o el último que se tocó. */
  activo: number | null
}

/** Las pinzas que sostienen un pliegue de piel y cómo queda la piel. */
export interface EstadoDeLosPellizcos {
  lista: Pellizco[]
  activo: number | null
  tension: TensionDeLaPiel
}

/**
 * La disección roma en curso, para la consola: en qué plano, cuántas veces se separó y si la punta está
 * apoyada. `evento` dice qué acaba de pasar (la consola cierra las ramas al avanzar).
 */
export interface EstadoDeLaDiseccion {
  capa: CapaDeLaHerida
  /** Cuántas aperturas separaron el plano hasta ahora. */
  aperturas: number
  /** La punta está apoyada en el tejido, a la espera de abrir las ramas. */
  apoyada: boolean
  evento: 'apoyo' | 'separo' | 'cierre'
}

/** La disección roma, tal como la lleva el lienzo. */
interface DiseccionActiva {
  capa: CapaDeLaHerida
  /** Los puntos donde se separó el plano, en el orden en que se hizo: por ellos pasa la herida. */
  nodos: NodoDeDiseccion[]
  /**
   * La punta apoyada ahora, a la espera de las ramas. `sobreHerida`: en ese plano ya había una herida que esta
   * disección no hizo (una incisión con bisturí): las ramas la abren por donde está la punta, pero no la rehacen.
   */
  apoyada?: { punto: THREE.Vector3; normal: THREE.Vector3; separo: boolean; sobreHerida: boolean }
  /** Cuánto están abiertas las ramas, de 0 a 1. */
  fraccion: number
  aperturas: number
  /** Dónde cae el apoyo a lo largo de la herida del plano, de 0 a 1. */
  posicion: number
  /** Lo que separan las puntas con las ramas abiertas del todo. */
  maximoMm: number
  /** Dónde cae cada nodo a lo largo de la herida, en el orden de `nodos`. */
  posiciones: number[]
  /** La incisión que esta disección hizo —o sobre la que separa—: su separación roma abre solo esa (P-003 E4). */
  incision?: number
}

/** Cómo se hace un corte (`aplicarElCorte`). */
interface OpcionesDelCorte {
  /** Que el borde quede quemado (electrobisturí con demasiada potencia). */
  quemado?: boolean
  /** Es el reintento que rehace la herida de antes porque el trazo nuevo no cortó nada. */
  esRehacer?: boolean
  /** Es la herida de una disección roma: no borra los puntos de la disección. */
  deDiseccion?: boolean
  /** Cortar aunque la capa esté apagada: lo que se repite al recargar la sesión. */
  desdeLaSesion?: boolean
  /** Es esta incisión (la que se recarga o se rehace): conserva su número y no se pregunta si alarga otra. */
  id?: number
  /** Esta incisión se vuelve a hacer con el trazo de ahora (la herida de una disección que avanza). */
  reemplaza?: number
}

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
  /**
   * Pone al paciente de pie, en decúbito supino o en decúbito prono. Mueve la vista y no el modelo: lo que hay
   * puesto sobre el paciente (separadores, pinzas, hilo, placa) se queda donde está (`posicionDelPaciente.ts`).
   */
  ponerPosicion: (posicion: PosicionDelPaciente) => void
  /** Gira la vista sobre sí misma, en el plano de la pantalla: tumba o levanta al paciente a mano, en pasos. */
  rodarVista: (grados: number) => void
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
  /** Suelta una pinza de reducción (o todas): el trozo queda donde está (P-003 E5). */
  soltarPinzaDeReduccion: (id?: number) => void
  /** Cierra una incisión (la que dice el panel «Incisiones»); las demás se quedan abiertas (P-003 E4). */
  cerrarIncision: (id: number) => void
  /** Destaca una pieza del modelo con un tinte encima (el botón «Info», P-003 E9); `null` lo quita. */
  resaltarNodo: (nodo: string | null) => void
  /** Devuelve los músculos retraídos a su sitio (P-003 E10). */
  soltarRetracciones: () => void
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
  /** Tira del hilo (o lo afloja): de 0, flojo, a 1, apretado del todo. Los labios de la herida se acercan. */
  tensarSutura: (tension: number) => void
  /** Cuánto se ha tirado del hilo ahora, de 0 a 1. */
  tensionDeLaSutura: () => number
  /** Devuelve cada trozo de hueso que se movió con «Mover» a donde estaba (el fragmento del caso no: ese lo coloca la consola). */
  restaurarPiezas: () => void
  /** La próxima puntada empieza una línea nueva: no se une con la anterior. */
  nuevaLineaDeSutura: () => void
  /**
   * Abre el separador activo hasta `mm` (la barra deslizante de una tableta). Con
   * `id` se elige otro antes de abrir. Sin ningún separador colocado no hace nada.
   */
  abrirSeparador: (mm: number, id?: number) => void
  /** Cambia la apertura del separador activo en `deltaMm` (una muesca de la rueda). */
  moverSeparador: (deltaMm: number) => void
  /** Elige cuál de los separadores colocados responde a la rueda y a la barra. */
  elegirSeparador: (id: number) => void
  /** Quita un separador colocado (o todos si no se dice cuál); la herida se cierra en lo que le tocaba. */
  quitarSeparador: (id?: number) => void
  /** Cambia cuánto levanta la pinza activa la piel, en milímetros. */
  levantarPellizco: (deltaMm: number) => void
  /** Elige qué pinza responde a la rueda. */
  elegirPellizco: (id: number) => void
  /** Separa (o junta) las dos pinzas de la pareja, tirando de los bordes de la piel: milímetros por cada una. */
  separarPinzas: (deltaMm: number) => void
  /** Abre (`sentido` +1) o cierra (−1) las mandíbulas de las pinzas, una muesca de la rueda. */
  abrirMandibulas: (sentido: number) => void
  /** Cambia el plano en que está apoyado un separador ya puesto: lo baja al músculo o lo sube a la piel. */
  cambiarPlanoDelSeparador: (id: number, plano: 'piel' | 'musculo') => void
  /**
   * Abre las ramas de la tijera en disección roma, de 0 (cerradas) a 1 (abiertas del todo). Con la punta apoyada,
   * el plano se separa por tensión; la primera vez que las ramas pasan de un umbral, ese punto entra en la herida.
   */
  abrirDiseccion: (fraccion: number) => void
  /** Suelta una pinza (o todas si no se dice cuál): la piel vuelve a su sitio. */
  soltarPellizco: (id?: number) => void
  /** Cancela una línea recta empezada y todavía sin terminar. */
  cancelarTrazo: () => void
  /**
   * Dibuja la imagen del arco en C sobre un lienzo 2D, con la proyección y el
   * zoom pedidos. Devuelve `true` si dibujó y `false` si nada había cambiado
   * desde la última vez (la consola la llama a ritmo fijo y no hay que releer la
   * tarjeta gráfica sin motivo).
   */
  dibujarFluoroscopia: (
    destino: HTMLCanvasElement,
    proyeccion: ProyeccionDeFluoroscopia,
    zoom: number,
    desplazamiento?: DesplazamientoDeLaImagen,
    /** Píxeles por lado con que se dibuja: más grande el recuadro, más píxeles (`ladoDeLaImagen`). */
    lado?: number,
    /** Cómo se revela la toma: kilovoltios, contraste, brillo y filtro (P-003, E2). */
    ajustes?: Partial<AjustesDeLaImagen>,
  ) => boolean
  /**
   * El botón «Disparar» (P-003, E2): hace **una** toma ahora, aunque nada haya cambiado, y la revela. Es el modo por
   * omisión de la fluoroscopia: en pabellón se dispara, se mira y se apaga.
   */
  dispararFluoroscopia: (
    destino: HTMLCanvasElement,
    proyeccion: ProyeccionDeFluoroscopia,
    zoom: number,
    desplazamiento?: DesplazamientoDeLaImagen,
    lado?: number,
    ajustes?: Partial<AjustesDeLaImagen>,
  ) => boolean
  /**
   * Vuelve a revelar la última toma con otros ajustes, sin disparar: mover los kilovoltios, el contraste o el filtro
   * es leer de otra manera lo que ya se capturó. Devuelve `false` si no hay toma todavía.
   */
  revelarFluoroscopia: (destino: HTMLCanvasElement, ajustes?: Partial<AjustesDeLaImagen>) => boolean
  /**
   * Hace olvidar a la fluoroscopia lo que ya tenía dibujado, para que la próxima toma se haga aunque la escena sea la
   * misma: se llama cuando el lienzo de la imagen se vació o es otro (apagar y encender, cambiar de modo).
   */
  reiniciarFluoroscopia: () => void
  /** Quita los tornillos puestos, y la placa si `conPlaca`. */
  quitarImplantes: (conPlaca: boolean) => void
  /**
   * Mueve la placa puesta, sin fijar, y la vuelve a asentar sobre el hueso (P-003 E6): `largoMm` a lo largo del hueso,
   * `ladoMm` rodeándolo, `giroGrados` alrededor de la normal. Devuelve `false` si ahí no hay hueso.
   */
  ajustarLaPlaca: (ajuste: { largoMm: number; ladoMm: number; giroGrados: number }) => boolean
  /** Da la placa por buena (ya no se mueve y se perfora por sus agujeros) o la vuelve a dejar ajustable. */
  fijarLaPlaca: (fijar: boolean) => void
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
  /** Identificador y nombre del catálogo: un separador colocado se vuelve a dibujar y se nombra en pantalla. */
  id?: string
  nombre?: string
  /** Separa los bordes de una herida: cuánto abre como máximo y si se queda abierto solo. */
  separa?: { maximoMm: number; autoestatico: boolean; apoyoEnHueso?: boolean } | null
  /** Pellizca la piel hacia arriba: las pinzas de disección. */
  pellizca?: { conDientes: boolean } | null
  /** Es el electrobisturí: su modo y su potencia en vatios deciden si corta y cómo deja el borde. */
  electro?: { modo: ModoDelElectrobisturi; potenciaW: number } | null
  /** Perfora el hueso: gira, avanza mientras se mantiene pulsado y deja un túnel. */
  perfora?: { diametroMm: number; avanceMmPorSegundo: number } | null
  /** Cose: cada clic suma una puntada y el hilo queda dibujado en la piel (D-169). */
  sutura?: HiloDeSutura | null
  /** Se coloca sobre el hueso: una placa se apoya, un tornillo se pone en un agujero (D-169). */
  coloca?: QueColoca | null
  /** Es el medidor de profundidad: apoyado en un agujero, lee cuánto hueso hay debajo. */
  mide?: boolean
  /** Está en disección roma: la punta apoyada y las ramas que se abren separan el plano sin cortarlo. */
  roma?: { maximoMm: number } | null
  /** Pinza de reducción: un clic en un trozo de hueso la deja agarrándolo (P-003 E5). */
  reduce?: { tipo: 'puntas' | 'garra' | 'bola' } | null
}

/** Una pinza de reducción que tiene agarrado un trozo de hueso: es hija del trozo, así que lo acompaña (P-003 E5). */
export interface PinzaDeReduccion {
  id: number
  nombre: string
  pieza: THREE.Object3D
  instrumento: InstrumentoColocado
}

/** Qué pinzas de reducción hay puestas y en qué trozo, para el panel. */
export interface EstadoDeLaReduccion {
  pinzas: { id: number; nombre: string; pieza: string }[]
}

/** Cuántas pinzas de reducción a la vez: la de quien opera y la del ayudante. */
export const MAXIMO_DE_PINZAS_DE_REDUCCION = 2

/** Lo que acaba de pasar con la fijación, para escribirlo en el registro de la consola. */
export interface SucesoDeFijacion {
  tipo: 'placa' | 'tornillo' | 'medida' | 'aviso' | 'agujero'
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
  /** Cuánto se ha tirado del hilo, de 0 a 1. */
  tension: number
  /** Lo que las puntadas que hay podrían cerrar, de 0 a 1: lo que se cierra con la tensión justa. */
  cierreMaximo: number
  /** Qué se dice de cómo está el hilo (flojo, justo, estrangula), o `null` si no hay nada que decir. */
  juicioDeLaTension: { texto: string; atencion: boolean; estrangula: boolean } | null
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
  /** Cada incisión por separado, en el orden en que se hicieron (P-003 E4): el panel las lista con su «Cerrar». */
  incisiones: ResumenDeIncision[]
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
  giroLibre = false,
  alGirarLaVista,
  planoDelSeparador = 'piel',
  separadoresEnPareja = true,
  acompanarAlBisturi = false,
  alDisecar,
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
  alRueda,
  capturaLaRueda = false,
  claveDeSesion,
  trazo: tipoDeTrazo = 'recto',
  moverTodo = false,
  alGesto,
  alSeparar,
  alPellizcar,
  alReducir,
  alTrazar,
  alMoverFragmento,
  alCargar,
  alSenalar,
  alInformar,
  alRetraer,
  musculoObjetivo,
  alFallar,
  mando,
}: {
  url: string
  piezas: PiezaDelCaso[]
  modo: Modo
  /**
   * La fluoroscopia está encendida. El lienzo **no cambia por eso**: se sigue viendo la escena de siempre, con su
   * cámara; lo que se enciende son las ayudas de aprendizaje (ejes, dónde debe quedar) y la imagen del arco, que
   * la consola pide con `dibujarFluoroscopia`.
   */
  fluoroscopia: boolean
  /**
   * El giro libre: arrastrar da la vuelta al paciente sin «arriba» fijo, así que se puede acostar a mano. Sin él
   * se orbita como siempre. Solo vale en los modos en que el arrastre gira la vista.
   */
  giroLibre?: boolean
  /** Se giró la vista con el giro libre: la consola deja de marcar ninguna de las tres posiciones. */
  alGirarLaVista?: () => void
  /** En qué plano se apoyan los separadores que se pongan a partir de ahora: la piel o el músculo. */
  planoDelSeparador?: 'piel' | 'musculo'
  /** Un clic pone los dos separadores de mano, uno por borde (P-003 E3). Los autoestáticos y el Hohmann van de uno en uno. */
  separadoresEnPareja?: boolean
  /** Al terminar un corte, la pareja de pinzas y la de separadores más cercanas a la punta se corren tras ella (P-003 E3). */
  acompanarAlBisturi?: boolean
  /** Pasó algo en la disección roma: se apoyó la punta, se separó el plano o se cerraron las ramas. */
  alDisecar?: (estado: EstadoDeLaDiseccion | null) => void
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
  /**
   * La rueda del ratón sobre el lienzo, cuando el instrumento que se tiene en la mano la usa (D-171):
   * abre y cierra las tijeras y los separadores, tira del hilo, alarga el tornillo. Devuelve `true` si hizo algo.
   * `deltaY` es el de la rueda: negativo, hacia delante. Con `mayusculas` el instrumento puede quedarse la rueda
   * para otra cosa (las pinzas, abrir y cerrar las mandíbulas); si no la usa, devuelve `false` y la rueda acerca el modelo.
   */
  alRueda?: (deltaY: number, mayusculas: boolean) => boolean
  /**
   * El instrumento en la mano se maneja con la rueda. Mientras sea cierto la rueda ya no acerca el modelo
   * (con Ctrl, o con Mayúsculas, sí): acercar y abrir las tijeras con el mismo gesto es no poder hacer ninguna.
   */
  capturaLaRueda?: boolean
  /**
   * Con una clave, lo cortado y cosido sobrevive a recargar la página (D-171): se guarda en `sessionStorage`
   * —de esa pestaña, no de la cuenta— y se vuelve a hacer al abrir el modelo. Sin clave no se guarda nada.
   * Lo que la consola recuerda del recorrido (los pasos, el puntaje) ya sobrevivía; la herida no, y un
   * residente que recargaba en el paso de cerrar se encontraba con una piel sin cortar.
   */
  claveDeSesion?: string
  /**
   * Cómo se traza la incisión: en línea recta entre dos clics (inicio y final) o a mano alzada.
   * A mano alzada sale temblorosa; una incisión de abordaje es una recta.
   */
  trazo?: TipoDeTrazo
  /**
   * «Mover» mueve todo junto —piel, músculo y hueso a la vez— y no un trozo suelto. Con esto
   * apagado agarra el trozo de hueso que se toque (lo que hace falta para reducir una fractura).
   */
  moverTodo?: boolean
  /** Algo que decirle al residente desde el lienzo: lo que el electrobisturí hizo, si la piel quedó tensa… */
  alGesto?: (texto: string, tono: 'bien' | 'atencion' | 'grave') => void
  /** Cambió lo que hay de separadores colocados en la herida. */
  alSeparar?: (estado: EstadoDeLosSeparadores) => void
  /** Cambió lo que hay de pinzas sosteniendo la piel. */
  alPellizcar?: (estado: EstadoDeLosPellizcos) => void
  /** Cambió lo que hay de pinzas de reducción agarrando un trozo de hueso (P-003 E5). */
  alReducir?: (estado: EstadoDeLaReduccion) => void
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
  /**
   * Se llama con lo que hay bajo el clic, en modo «info» (P-003 E9): el nodo y el `atlasId` que el exportador le dejó
   * en los `extras`. `null` si el clic cayó en el vacío. Un objeto de un modelo viejo —fundido por sistema— llega sin
   * `atlasId`: la consola lo dice, no lo adivina.
   */
  alInformar?: (golpe: { nodo: string; atlasId: string | null; etiqueta: string | null } | null) => void
  /**
   * El músculo sobre el que se trabaja (P-003 E10): con `cortar`, el bisturí profundo corta solo ese; con `separar`,
   * un clic con un separador en la mano lo **retrae** sin cortarlo. `null` es lo de siempre: la capa entera.
   */
  musculoObjetivo?: { nodo: string; accion: 'cortar' | 'separar' } | null
  /** Se llama cuando cambian las retracciones de músculo, con lo que hay puesto. */
  alRetraer?: (estado: EstadoDeLasRetracciones) => void
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
    aperturaAntesDeCoser?: Map<HeridaEnCapa, { mas: number; menos: number; perfil?: HeridaEnCapa['perfil'] }>
    /** La placa y los tornillos puestos sobre el hueso (D-169). */
    implantes?: ImplantesEnEscena
    /** Dónde estaba cada trozo de hueso que el residente movió, para devolverlo a su sitio (D-171). */
    origenesDePiezas?: Map<THREE.Object3D, { posicion: THREE.Vector3; rotacion: THREE.Euler }>
    /** Los cortes que hay hechos, en orden, para volver a hacerlos al recargar (D-171). */
    cortes?: CorteGuardado[]
    /** Los separadores colocados en la herida y cuál responde a la rueda. */
    separadores?: SeparadorEnEscena[]
    separadorActivo?: number | null
    siguienteSeparador?: number
    /** Los músculos retraídos con un separador, sin cortar (P-003 E10). */
    retracciones?: RetraccionDeMusculo[]
    siguienteRetraccion?: number
    /** Las pinzas de reducción puestas y la siguiente a numerar (P-003 E5). */
    pinzasDeReduccion?: PinzaDeReduccion[]
    siguientePinzaDeReduccion?: number
    /** El separador que se levantó con un clic y sigue al cursor hasta que otro clic lo deja (P-003 E3). */
    separadorEnLaMano?: EnLaMano<SeparadorEnEscena>
    /** Lo mismo para una pinza. */
    pinzaEnLaMano?: EnLaMano<PellizcoEnEscena>
    /** Las pinzas que sostienen un pliegue de piel. */
    pellizcos?: PellizcoEnEscena[]
    pellizcoActivo?: number | null
    siguientePellizco?: number
    /** La posición del paciente elegida con los botones, mientras la vista siga siendo esa. */
    posicion?: PosicionDelPaciente
    /** La disección roma en curso: los puntos donde se separó y la punta apoyada. */
    diseccion?: DiseccionActiva
    /** Corta la capa con el trazo que haya en `puntosDelTrazo`: lo expone el montaje para la disección roma. Devuelve la incisión. */
    aplicarElCorte?: (plano: PlanoDeCorte, opciones?: OpcionesDelCorte) => number | undefined
    /** El número de la próxima incisión y el de la última que se hizo (P-003 E4). */
    siguienteIncision?: number
    ultimaIncision?: number
    /** La imagen del arco en C: el blanco de dibujo y su cámara. */
    fluoroscopia?: TallerDeFluoroscopia
    /** Cuántas veces se ha dibujado la escena: la fluoroscopia solo se rehace si cambió. */
    cuadro?: number
    /** Cuántas veces se ha disparado la fluoroscopia: da a cada toma su propio grano de ruido. */
    disparos?: number
    /** El primer clic de una línea recta, a la espera del segundo. */
    inicioDeLaRecta?: { x: number; y: number; punto: Punto3; normal: Punto3 }
    /** El clic que marca dónde empieza la incisión recta, para dibujar su marca. */
    marcaDeInicio?: THREE.Mesh
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
    giroLibre,
    alGirarLaVista,
    planoDelSeparador,
    separadoresEnPareja,
    acompanarAlBisturi,
    alDisecar,
    instrumento,
    ayudas,
    inclinacionDeBroca,
    milimetrosPorUnidad,
    ejeLargo,
    alTrazar,
    alMoverFragmento,
    alCargar,
    alSenalar,
    alInformar,
    alRetraer,
    musculoObjetivo,
    alFallar,
    alCargarInstrumento,
    alHerir,
    alPerforar,
    alCoser,
    alFijar,
    largoDeTornillo,
    alRueda,
    capturaLaRueda,
    claveDeSesion,
    tipoDeTrazo,
    moverTodo,
    alGesto,
    alSeparar,
    alPellizcar,
    alReducir,
  })
  useEffect(() => {
    ultimas.current = {
      modo,
      piezas,
      fluoroscopia,
      giroLibre,
      alGirarLaVista,
      planoDelSeparador,
      separadoresEnPareja,
      acompanarAlBisturi,
      alDisecar,
      instrumento,
      ayudas,
      inclinacionDeBroca,
      milimetrosPorUnidad,
      ejeLargo,
      alTrazar,
      alMoverFragmento,
      alCargar,
      alSenalar,
      alInformar,
      alRetraer,
      musculoObjetivo,
      alFallar,
      alCargarInstrumento,
      alHerir,
      alPerforar,
      alCoser,
      alFijar,
      largoDeTornillo,
      alRueda,
      capturaLaRueda,
      claveDeSesion,
      tipoDeTrazo,
      moverTodo,
      alGesto,
      alSeparar,
      alPellizcar,
      alReducir,
    }
  })

  useImperativeHandle(mando, () => ({
    mostrar: (nodos) => {
      const raiz = taller.current.raiz
      if (!raiz) return { ausentes: [], sinCoincidencias: false, porPapel: false }
      const existentes: string[] = []
      const delModelo: PiezaEnEdicion[] = []
      raiz.traverse((objeto) => {
        if (!(objeto as THREE.Mesh).isMesh || !objeto.name || esDeInterfazDelModelo(objeto)) return
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
      aplicarVisibilidad(raiz, visibles)
      // El hilo está cosido a la piel: con la piel apagada no se queda flotando sobre el hueso.
      const sutura = taller.current.sutura
      if (sutura) {
        const nombresDePiel = new Set(ultimas.current.piezas.filter((p) => p.rol === 'piel').map((p) => p.nodo))
        let pielVisible = nombresDePiel.size === 0
        raiz.traverse((objeto) => {
          if ((objeto as THREE.Mesh).isMesh && objeto.visible && nombresDePiel.has(objeto.name)) pielVisible = true
        })
        sutura.grupo.visible = pielVisible
      }
      taller.current.pedirDibujo?.()
      return { ausentes, sinCoincidencias, porPapel }
    },

    hayFragmento: () => !!taller.current.fragmento,

    nodosVisibles: () => {
      const nombres: string[] = []
      taller.current.raiz?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name && o.visible && !esDeInterfazDelModelo(o)) nombres.push(o.name)
      })
      return nombres
    },

    ponerPosicion: (posicion) => {
      const t = taller.current
      t.posicion = posicion
      encuadrarVisible(t, poseDeLaPosicion(posicion, ultimas.current.ejeLargo))
    },

    rodarVista: (grados) => {
      const t = taller.current
      if (!t.camara || !t.controles) return
      // Rodar tumba la vista a mano: ya no es ninguna de las tres posiciones de los botones.
      t.posicion = undefined
      aplicarLaPose(t.camara, t.controles, rodarLaVista(poseActual(t.camara, t.controles), grados))
      t.pedirDibujo?.()
    },

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
      cancelarLaRecta(taller.current)
      taller.current.puntosDelTrazo = []
      taller.current.normalesDelTrazo = []
      dibujarTrazo(taller.current)
      // La herida abierta por ese trazo se queda, a menos que se pida deshacerla:
      // al pasar de paso la consola borra el trazo (la medida vuelve a cero) y la
      // piel cortada tiene que seguir cortada en el paso siguiente.
      if (deshacerCorte) {
        // Se deshace la última incisión que se hizo (P-003 E4): con varias en la misma capa, las demás se quedan.
        const id = taller.current.ultimaIncision
        if (id !== undefined) {
          cerrarLaIncision(taller.current, id, { conSusSeparadores: false })
          reaplicarSeparadores(taller.current, ultimas.current)
          ultimas.current.alHerir?.(estadoDeLasHeridas(taller.current, ultimas.current.milimetrosPorUnidad))
        }
      }
      ultimas.current.alTrazar?.([])
      taller.current.pedirDibujo?.()
    },

    cerrarHeridas: () => {
      cerrarTodasLasHeridas(taller.current)
      ultimas.current.alSeparar?.(estadoDeLosSeparadores(taller.current))
      ultimas.current.alHerir?.(null)
      taller.current.pedirDibujo?.()
    },

    soltarPinzaDeReduccion: (id) => soltarPinzasDeReduccion(taller.current, ultimas.current, id),

    resaltarNodo: (nodo) => resaltarUnNodo(taller.current, nodo),

    soltarRetracciones: () => soltarLasRetracciones(taller.current, ultimas.current),

    cerrarIncision: (id) => {
      const t = taller.current
      cerrarLaIncision(t, id, { conSusSeparadores: false })
      reaplicarSeparadores(t, ultimas.current)
      avisarPellizcos(t, ultimas.current)
      ultimas.current.alHerir?.(estadoDeLasHeridas(t, ultimas.current.milimetrosPorUnidad))
      t.pedirDibujo?.()
    },

    abrirHeridas: (mm) => {
      // Con separadores colocados, la apertura es de ellos: esto abre el que responde a la rueda.
      if (taller.current.separadores?.length) {
        const activo = separadorActivo(taller.current)
        if (activo) cambiarApertura(taller.current, activo, mm, ultimas.current)
        return
      }
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
      if (s.puntos.length === 0) s.tension = 0
      refrescarSutura(taller.current, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, null, ultimas.current.alHerir)
    },

    quitarSutura: () => {
      const t = taller.current
      if (!t.sutura) return
      t.sutura.puntos.length = 0
      t.sutura.tension = 0
      refrescarSutura(t, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, null, ultimas.current.alHerir)
    },

    nuevaLineaDeSutura: () => {
      const s = taller.current.sutura
      if (s) s.siguienteEsNueva = true
    },

    tensarSutura: (tension) => {
      const t = taller.current
      if (!t.sutura || t.sutura.puntos.length === 0) return
      t.sutura.tension = Math.min(1, Math.max(0, tension))
      refrescarSutura(t, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, null, ultimas.current.alHerir)
    },

    tensionDeLaSutura: () => taller.current.sutura?.tension ?? 0,

    restaurarPiezas: () => {
      const t = taller.current
      // Las pinzas de reducción son hijas de los trozos que se devuelven a su sitio: se sueltan con ellos (P-003 E5).
      soltarPinzasDeReduccion(t, ultimas.current)
      const fragmento = t.fragmento
      t.origenesDePiezas?.forEach((origen, pieza) => {
        // El fragmento del caso lo coloca la consola con el desplazamiento inicial del caso.
        if (fragmento && (pieza === fragmento || perteneceA(pieza, fragmento))) return
        pieza.position.copy(origen.posicion)
        pieza.rotation.copy(origen.rotacion)
      })
      t.pedirDibujo?.()
    },

    abrirSeparador: (mm, id) => {
      const t = taller.current
      if (id !== undefined) t.separadorActivo = id
      const activo = separadorActivo(t)
      if (activo) cambiarApertura(t, activo, mm, ultimas.current)
    },

    moverSeparador: (deltaMm) => {
      const t = taller.current
      // Un músculo retraído (P-003 E10) responde a la rueda cuando no hay separadores puestos en una herida.
      if (!(t.separadores ?? []).length && (t.retracciones ?? []).length) {
        moverLaRetraccion(t, ultimas.current, deltaMm)
        return
      }
      const activo = separadorActivo(t)
      if (!activo) return
      // La rueda abre la pareja por igual (P-003 E3); la barra del panel, solo el elegido.
      const pareja = laPareja(
        (t.separadores ?? []).map((q) => q.datos),
        activo.datos,
      )
      if (pareja.length === 0) {
        cambiarApertura(t, activo, activo.datos.aperturaMm + deltaMm, ultimas.current)
        return
      }
      const ids = new Set([activo.datos.id, ...pareja.map((q) => q.id)])
      for (const q of t.separadores ?? []) {
        if (ids.has(q.datos.id)) q.datos.aperturaMm = limitarApertura(q.datos.aperturaMm + deltaMm, q.datos.maximoMm)
      }
      reaplicarSeparadores(t, ultimas.current)
      t.decir?.(`${activo.datos.nombre} ×2: abiertos ${activo.datos.aperturaMm} mm`)
    },

    elegirSeparador: (id) => {
      taller.current.separadorActivo = id
      ultimas.current.alSeparar?.(estadoDeLosSeparadores(taller.current))
    },

    quitarSeparador: (id) => quitarSeparadores(taller.current, ultimas.current, id),

    levantarPellizco: (deltaMm) => {
      const t = taller.current
      const lista = t.pellizcos ?? []
      if (lista.length === 0) return
      const u = ultimas.current
      // La pareja se levanta junta: una pinza a una altura y la otra a otra no es como se toma la piel.
      for (const p of lista) {
        p.datos.alturaMm = Math.min(ALTURA_MAXIMA_DEL_PELLIZCO_MM, Math.max(0, p.datos.alturaMm + deltaMm))
        posarPliegue(p, 1 / (u.milimetrosPorUnidad || 1000))
      }
      avisarPellizcos(t, u)
    },

    separarPinzas: (deltaMm) => separarLasPinzas(taller.current, ultimas.current, deltaMm),

    abrirMandibulas: (sentido) => abrirLasMandibulas(taller.current, ultimas.current, sentido),

    cambiarPlanoDelSeparador: (id, plano) => cambiarElPlanoDelSeparador(taller.current, ultimas.current, id, plano),

    abrirDiseccion: (fraccion) => abrirLaDiseccion(taller.current, ultimas.current, fraccion),

    elegirPellizco: (id) => {
      taller.current.pellizcoActivo = id
      avisarPellizcos(taller.current, ultimas.current)
    },

    soltarPellizco: (id) => soltarPellizcos(taller.current, ultimas.current, id),

    cancelarTrazo: () => cancelarLaRecta(taller.current),

    dibujarFluoroscopia: (destino, proyeccion, zoom, desplazamiento, lado, ajustes) => {
      const t = taller.current
      const ctx = contextoDeRadiografia(t)
      if (!t.render || !ctx) return false
      t.fluoroscopia ??= prepararFluoroscopia()
      return dibujarFluoroscopia(
        t.render,
        ctx,
        t.fluoroscopia,
        destino,
        { proyeccion, zoom, ejeLargo: ultimas.current.ejeLargo, desplazamiento, lado, ajustes },
        t.cuadro ?? 0,
        [t.trazo, t.guias, t.fantasma, t.marcaDeInicio],
      )
    },

    dispararFluoroscopia: (destino, proyeccion, zoom, desplazamiento, lado, ajustes) => {
      const t = taller.current
      const ctx = contextoDeRadiografia(t)
      if (!t.render || !ctx) return false
      t.fluoroscopia ??= prepararFluoroscopia()
      return dibujarFluoroscopia(
        t.render,
        ctx,
        t.fluoroscopia,
        destino,
        { proyeccion, zoom, ejeLargo: ultimas.current.ejeLargo, desplazamiento, lado, ajustes, forzar: true },
        // Un cuadro propio por disparo: el grano del ruido de cada toma es distinto, como en una imagen de verdad.
        (t.cuadro ?? 0) + (t.disparos = (t.disparos ?? 0) + 1),
        [t.trazo, t.guias, t.fantasma, t.marcaDeInicio],
      )
    },

    revelarFluoroscopia: (destino, ajustes) => (taller.current.fluoroscopia ? revelarLaToma(taller.current.fluoroscopia, destino, ajustes) : false),

    reiniciarFluoroscopia: () => reiniciarLaFluoroscopia(taller.current.fluoroscopia),

    quitarImplantes: (conPlaca) => {
      const imp = taller.current.implantes
      if (!imp) return
      if (conPlaca) quitarImplantes(imp)
      else quitarTornillos(imp)
      ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current))
      taller.current.pedirDibujo?.()
    },

    ajustarLaPlaca: (ajuste) => {
      const placa = taller.current.implantes?.placa
      if (!placa || placa.fijada) return false
      const hecho = ajustarPlaca(placa, mallasDeHuesoVisibles(taller.current, ultimas.current.piezas), ajuste)
      if (!hecho) {
        taller.current.decir?.('Ahí no hay hueso bajo la placa: devuélvala hacia donde estaba.')
        return false
      }
      ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current))
      taller.current.pedirDibujo?.()
      return true
    },

    fijarLaPlaca: (fijar) => {
      const placa = taller.current.implantes?.placa
      if (!placa) return
      placa.fijada = fijar
      taller.current.decir?.(
        fijar
          ? 'Placa fijada. Ahora se perfora por cada agujero, se mide y se atornilla.'
          : 'Placa suelta: se puede ajustar otra vez. Lo perforado en sus agujeros se conserva.',
      )
      ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current), {
        tipo: 'placa',
        texto: fijar ? `${placa.nombre} fijada.` : `${placa.nombre} suelta para ajustarla.`,
        atencion: false,
      })
      taller.current.pedirDibujo?.()
    },

    estadoDeLaFijacion: () => estadoDeLaFijacion(taller.current),

    // Encuadrar conserva la posición del paciente que se eligió con los botones; con el giro libre o a la
    // medida, vuelve a la vista de siempre.
    encuadrar: () => {
      const t = taller.current
      encuadrarVisible(t, t.posicion ? poseDeLaPosicion(t.posicion, ultimas.current.ejeLargo) : undefined)
    },

    nodosDelModelo: () => {
      const nombres: string[] = []
      taller.current.raiz?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name && !esDeInterfazDelModelo(o)) nombres.push(o.name)
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
    // --- la sesión: lo cortado y cosido sobrevive a recargar -------------------------------------------
    const claveActual = () => ultimas.current.claveDeSesion
    let ultimoGuardado = ''
    const guardarSesion = () => {
      const clave = claveActual()
      if (!clave) return
      const texto = serializarSesion(taller.current)
      if (texto === ultimoGuardado) return
      ultimoGuardado = texto
      try {
        if (texto) sessionStorage.setItem(clave, texto)
        else sessionStorage.removeItem(clave)
      } catch {
        // Sin almacenamiento (navegación privada, cuota): el caso sigue funcionando, solo no se recuerda.
      }
    }
    const restaurarSesion = () => {
      const clave = claveActual()
      if (!clave) return
      let guardado: SesionGuardada | null = null
      try {
        const crudo = sessionStorage.getItem(clave)
        guardado = crudo ? (JSON.parse(crudo) as SesionGuardada) : null
      } catch {
        guardado = null
      }
      if (!guardado || (guardado.v !== 1 && guardado.v !== 2)) return
      const t = taller.current
      const mmPorUnidad = ultimas.current.milimetrosPorUnidad || 1000
      // Los cortes, en el mismo orden en que se hicieron: así la lista de heridas queda igual que estaba.
      for (const corte of guardado.cortes ?? []) {
        t.puntosDelTrazo = corte.puntos.map(([x, y, z]) => ({ x, y, z }))
        t.normalesDelTrazo = corte.normales.map(([x, y, z]) => ({ x, y, z }))
        aplicarElCorte(corte.plano, { desdeLaSesion: true, id: corte.id, quemado: corte.quemado })
      }
      t.puntosDelTrazo = []
      t.normalesDelTrazo = []
      dibujarTrazo(t)
      const heridas = todasLasHeridas(t)
      heridas.forEach((h, i) => {
        const a = guardado!.apertura?.[i]
        if (a) abrirCapa(h, a.mas, a.menos)
      })
      if (guardado.aperturaAntesDeCoser && heridas.length > 0) {
        t.aperturaAntesDeCoser = new Map()
        guardado.aperturaAntesDeCoser.forEach((a, i) => {
          if (a && heridas[i]) t.aperturaAntesDeCoser!.set(heridas[i], { mas: a.mas, menos: a.menos })
        })
      }
      if (heridas.length > 0) ultimas.current.alHerir?.(estadoDeLasHeridas(t, mmPorUnidad))
      const hilo = guardado.sutura
      if (hilo && t.escena && hilo.puntos.length > 0) {
        const sutura = crearSutura(t.escena, hilo.hilo)
        sutura.tension = hilo.tension
        sutura.puntos = hilo.puntos.map((q) => ({
          punto: q.base,
          base: q.base,
          normal: q.normal,
          lado: q.lado,
          nuevaLinea: q.nuevaLinea,
          ref:
            q.ref && heridas[q.ref.herida]
              ? { ...q.ref, malla: heridas[q.ref.herida].malla.uuid }
              : undefined,
        }))
        t.sutura = sutura
        refrescarSutura(t, mmPorUnidad, ultimas.current.alCoser, null, ultimas.current.alHerir)
      }
      t.pedirDibujo?.()
    }
    // Cada medio segundo se mira si algo cambió; es más barato y más seguro que acordarse de guardar en cada
    // sitio que corta, abre, cose o tira del hilo.
    const reloj = window.setInterval(guardarSesion, 600)

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
        sincronizarAyudas(taller.current, ultimas.current.fluoroscopia, ultimas.current.ayudas)

        // El encuadre va DESPUÉS de avisar, y el orden no es un detalle. Quien
        // escucha es la consola, que en ese momento apaga las capas que no
        // tocan y desplaza el fragmento. Encuadrando antes, la cámara apuntaba
        // al centro de la piel y del hueso sin desplazar, es decir a un sitio
        // donde ya no había nada: el modelo se veía, pero el cursor no
        // encontraba superficie porque el rayo pasaba de largo.
        ultimas.current.alCargar?.()
        // Después de avisar a la consola, que en `alCargar` se pone a cero: lo recuperado de la sesión se avisa
        // a continuación y es lo que se queda.
        restaurarSesion()
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
    /** El trozo de hueso que se arrastra en modo Mover. */
    let piezaAgarrada: THREE.Object3D | null = null
    let planoDeArrastre: THREE.Plane | null = null
    /** «Mover todo junto»: el arrastre desplaza el modelo entero (la cámara se lleva la vista), no un trozo. */
    let moviendoTodo = false
    /** El clic de la línea recta, a la espera de saber si fue un clic o un arrastre. */
    let clicDeRecta: { x: number; y: number; punto: Punto3; normal: Punto3 } | null = null
    /** El clic con que se coloca un separador, a la espera de saber si fue un clic o un arrastre. */
    let clicDeSeparador: {
      x: number
      y: number
      punto: THREE.Vector3
      normal: THREE.Vector3
      info: { lado: 1 | -1; direccion: THREE.Vector3; cerca: number; t: number }
      plano: PlanoDelSeparador
      /** La herida de la que salió `info`: la pareja necesita su otro labio. */
      herida: HeridaEnCapa
    } | null = null
    /** El clic que apoya la punta de la tijera en disección roma, a la espera de saber si fue un clic o un arrastre. */
    let clicDeDiseccion: { x: number; y: number; golpe: THREE.Intersection; normal: THREE.Vector3 } | null = null
    /** La pinza que se está levantando con el arrastre vertical. */
    let levantando: { id: number; y0: number; altura0: number; movido: boolean } | null = null
    let ultimaBusquedaDeSeparador = 0
    /** El clic con que se agarra un trozo con la pinza de reducción, a la espera de saber si fue un clic o un arrastre. */
    let clicParaLaPinza: { x: number; y: number; golpe: THREE.Intersection; pieza: THREE.Object3D } | null = null
    const puntoAuxiliar = new THREE.Vector3()
    const inicioDeArrastre = new THREE.Vector3()
    const posicionAlEmpezar = new THREE.Vector3()

    // --- las asas del trozo elegido (D-174) ------------------------------------------------------------
    // Arrastrar el hueso lo traslada en el plano de la pantalla y nada más; para corregir una angulación hacen
    // falta los tres giros, y para llevarlo hacia dentro o hacia fuera de la imagen, un movimiento a lo largo de
    // cada eje. Son las asas del taller del atlas: flechas para mover, aros para girar, y el aro blanco que gira
    // sobre la línea de visión. Aparecen sobre el trozo que se agarró, solo en «Mover» y «Un trozo».
    const manipulador = crearGizmo()
    // Es interfaz, no anatomía: la fluoroscopia lo esconde mientras dibuja y no absorbe rayos.
    manipulador.grupo.userData.deInterfaz = true
    escena.add(manipulador.grupo)
    let elegida: THREE.Object3D | null = null
    let asaAgarrada: {
      asa: AsaDelGizmo
      x: number
      y: number
      pivote: THREE.Vector3
      inicial: THREE.Matrix4
      inversaDelPadre: THREE.Matrix4
    } | null = null
    /** El clic en el vacío, a la espera de saber si fue un clic (suelta el trozo) o el arrastre de la órbita. */
    let clicEnElVacio: { x: number; y: number } | null = null

    /** Pone las asas sobre el trozo elegido, con el tamaño que las hace agarrables, o las esconde. */
    const gizmoAlDia = () => {
      const u = ultimas.current
      if (u.modo !== 'mover' && u.modo !== 'reducir') elegida = null
      const raiz = taller.current.raiz
      const pieza = elegida
      const hay = !!pieza && !!raiz && (u.modo === 'reducir' || !u.moverTodo) && pieza.visible && perteneceA(pieza, raiz)
      manipulador.grupo.visible = hay
      if (!hay || !pieza) return
      pieza.updateMatrixWorld(true)
      const donde = pieza.localToWorld(centroLocalDe(pieza))
      manipulador.grupo.position.copy(donde)
      // Un poco menos que el sexto del alto del lienzo: en el editor de casos el lienzo es angosto.
      manipulador.grupo.scale.setScalar(escalaDelGizmo(camara, donde) * 0.8)
      manipulador.mirarA(camara)
    }

    /** El asa bajo el puntero, si la hay. `rayo` tiene que venir ya apuntado. */
    const asaBajoElRayo = (): AsaDelGizmo | null => {
      if (!manipulador.grupo.visible) return null
      manipulador.grupo.updateMatrixWorld(true)
      const toques = rayo
        .intersectObjects(manipulador.asas, false)
        .map((toque) => toque.object.userData.asa as AsaDelGizmo)
      // Si el rayo cruza una flecha y un aro, gana la flecha: de frente, el aro de Y se ve de canto justo sobre
      // la flecha de X y su asa, más gorda, la tapaba entera (la misma regla del taller del atlas).
      return toques.find((asa) => asa.modo === 'mover') ?? toques[0] ?? null
    }

    /** Lleva el trozo adonde lo pide el asa agarrada, medido siempre desde donde estaba al agarrarla. */
    const moverConLaAsa = (evento: PointerEvent) => {
      const a = asaAgarrada
      const pieza = elegida
      if (!a || !pieza) return
      const caja = render.domElement.getBoundingClientRect()
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const eje = a.asa.eje === 'vista' ? null : a.asa.eje
      let traslacion = new THREE.Vector3()
      let giro = new THREE.Quaternion()
      let lectura: string
      if (a.asa.modo === 'mover') {
        traslacion = desplazamientoDelArrastre(camara, a.pivote, evento.clientX - a.x, evento.clientY - a.y, Math.max(1, caja.height), eje)
        lectura = `Mover · eje ${(eje ?? 'x').toUpperCase()} · ${(traslacion.length() / unidadesPorMm).toFixed(1).replace('.', ',')} mm`
      } else {
        const enPantalla = a.pivote.clone().project(camara)
        const cx = ((enPantalla.x + 1) / 2) * caja.width
        const cy = ((1 - enPantalla.y) / 2) * caja.height
        let angulo = barridoEnPantalla(cx, cy, a.x - caja.left, a.y - caja.top, evento.clientX - caja.left, evento.clientY - caja.top)
        // Con Ctrl el giro salta de cinco en cinco grados, como en el taller del atlas.
        if (evento.ctrlKey || evento.metaKey) angulo = ajustarAlSalto(angulo)
        giro = giroDelArrastre(camara, a.pivote, angulo, eje)
        const grados = ((((angulo * 180) / Math.PI) % 360) + 540) % 360 - 180
        lectura = `Girar · ${eje ? `eje ${eje.toUpperCase()}` : 'sobre la línea de visión'} · ${Math.round(grados)}°`
      }
      const { posicion, rotacion } = colocarEnElMundo(a.inicial, a.inversaDelPadre, a.pivote, traslacion, giro)
      pieza.position.copy(posicion)
      pieza.quaternion.copy(rotacion)
      taller.current.decir?.(lectura)
      pedirDibujo()
    }

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
    const mallasDeHueso = (): THREE.Mesh[] => mallasDeHuesoVisibles(taller.current, ultimas.current.piezas)
    /**
     * Primer punto de la superficie visible, bajo el cursor, de las piezas con alguno de estos papeles: la piel, o el
     * músculo. Los separadores se apoyan en un plano —el que se elige—, y para apoyarlos en el músculo el rayo tiene
     * que pasar de largo por la piel, que es justo lo que `superficieBajoElCursor` (la primera superficie) no hace.
     */
    const golpeEnLaCapa = (roles: readonly string[]): THREE.Intersection | null =>
      rayo.intersectObjects(mallasConRol(taller.current, ultimas.current.piezas, roles), false).find((g) => g.object.visible) ?? null
    const huesoBajoElCursor = (): THREE.Intersection | null =>
      rayo.intersectObjects(mallasDeHueso(), false).find((g) => g.object.visible) ?? null

    // --- la broca: gira, avanza y deja un túnel --------------------------------
    interface Perforacion {
      /** El agujero de la placa por el que se perfora, si la broca se centró en uno (P-003 E6). */
      agujero?: number
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

    /**
     * Parte con el trazo la capa que corta el instrumento (D-167).
     *
     * Se hace al soltar, con el trazo entero: cortar mientras se arrastra
     * rehacería la geometría en cada muestra. Reemplaza la herida anterior de la
     * misma capa; las de otras capas se quedan (la piel sigue cortada cuando se
     * corta el plano de abajo).
     */
    const cortarConElTrazo = () => {
      const u = ultimas.current
      const plano = u.instrumento?.planoDeCorte
      if (!plano) return
      const t = taller.current
      // El electrobisturí corta según su potencia y su modo: con poca no corta, en coagulación solo sella y
      // con demasiada carboniza el borde. Lo dice `juicioDeLaPotencia`, y la consola lo anota.
      let quemado = false
      const electro = u.instrumento?.electro
      if (electro) {
        const j = juicioDeLaPotencia(electro.modo, electro.potenciaW)
        u.alGesto?.(j.texto, j.atencion ? 'atencion' : 'bien')
        if (!j.corta) {
          // No cortó: el trazo no queda como una incisión que no existe.
          t.puntosDelTrazo = []
          t.normalesDelTrazo = []
          dibujarTrazo(t)
          u.alTrazar?.([])
          pedirDibujo()
          return
        }
        quemado = j.quema
      }
      // Profundizar sin la piel tomada con pinzas: es lo que se avisa, no lo que se impide.
      if (plano === 'musculo' && (t.heridas?.get('piel')?.length ?? 0) > 0) {
        const aviso = adviertePorLaTension(tensionDeLaPiel((t.pellizcos ?? []).map((q) => q.datos)))
        if (aviso) u.alGesto?.(aviso, 'atencion')
      }
      aplicarElCorte(plano, { quemado })
    }

    /**
     * Corta la capa `plano` con el trazo que hay en `puntosDelTrazo`. Es lo que hace el bisturí al soltar, lo
     * que repite la sesión guardada al recargar —en ese caso (`desdeLaSesion`) se corta aunque la capa esté
     * apagada ahora mismo, porque cuando se cortó estaba encendida— y lo que deja la disección roma como herida.
     */
    const aplicarElCorte = (plano: PlanoDeCorte, opciones: OpcionesDelCorte = {}): number | undefined => {
      const { desdeLaSesion = false, quemado = false, esRehacer = false, deDiseccion = false, id: idPedido, reemplaza } = opciones
      const t = taller.current
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const trazo = t.puntosDelTrazo
      if (trazo.length < 3) return undefined
      let largo = 0
      for (let i = 1; i < trazo.length; i++) {
        largo += Math.hypot(trazo[i].x - trazo[i - 1].x, trazo[i].y - trazo[i - 1].y, trazo[i].z - trazo[i - 1].z)
      }
      const aviso = (texto: string) =>
        ultimas.current.alHerir?.({
          ...(estadoDeLasHeridas(t, ultimas.current.milimetrosPorUnidad) ?? { capas: [], largoMm: 0, aperturaMm: 0, incisiones: [] }),
          aviso: texto,
        })
      if (largo < 5 * unidadesPorMm) {
        aviso('La incisión es demasiado corta para abrir la herida: trace al menos 5 mm.')
        return undefined
      }
      const nombres = new Set(ultimas.current.piezas.filter((p) => p.rol === plano).map((p) => p.nodo))
      // Con un músculo elegido para cortar (P-003 E10) el bisturí profundo corta solo ese y no toda la capa.
      const elegido = ultimas.current.musculoObjetivo
      if (plano === 'musculo' && elegido?.accion === 'cortar' && nombres.has(elegido.nodo)) {
        nombres.clear()
        nombres.add(elegido.nodo)
      }
      const mallas: THREE.Mesh[] = []
      t.raiz?.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh && (desdeLaSesion || m.visible) && nombres.has(m.name)) mallas.push(m)
      })
      if (mallas.length === 0) {
        // Dos causas distintas con dos arreglos distintos (D-176). Antes las dos decían «encienda la capa», y en una
        // cirugía sin ninguna pieza de piel la consola mandaba a encender una capa que ya estaba encendida.
        const capa = plano === 'piel' ? 'piel' : 'músculo'
        aviso(
          nombres.size === 0
            ? `Ninguna pieza de este modelo es ${capa}: márquela en «Piezas» del editor del caso (o «Rellenar desde el modelo»).`
            : plano === 'piel'
              ? 'No hay piel visible que cortar: encienda la capa «Piel».'
              : 'No hay músculo visible que cortar: encienda la capa «Músculo».',
        )
        return undefined
      }

      // ¿Es otra incisión o alarga una? (P-003 E4). Antes un trazo nuevo cerraba la herida de su capa: un segundo
      // abordaje en la piel borraba el primero. Ahora las incisiones se suman, y un trazo que arranca o termina a
      // menos de 5 mm del extremo de una de su capa la **alarga** (abrir en dos tiempos). Al recargar la sesión,
      // rehacer o hacer la herida de una disección no se pregunta: cada una ya sabe cuál es.
      let id = idPedido ?? reemplaza
      let puntosDelCorte: Punto[] = trazo.map((q) => [q.x, q.y, q.z])
      let normalesDelCorte: Punto[] = t.normalesDelTrazo.map((q) => [q.x, q.y, q.z])
      if (id === undefined && !desdeLaSesion && !esRehacer && !deDiseccion) {
        const alarga = incisionQueAlarga(
          (t.cortes ?? []).map((c) => ({ id: c.id ?? -1, capa: c.plano, puntos: c.puntos, normales: c.normales })),
          plano,
          { puntos: puntosDelCorte, normales: normalesDelCorte },
          UMBRAL_PARA_ALARGAR_MM * unidadesPorMm,
        )
        if (alarga) {
          id = alarga.id
          puntosDelCorte = [...alarga.unida.puntos]
          normalesDelCorte = [...alarga.unida.normales]
        }
      }
      const previo = id !== undefined ? (t.cortes ?? []).find((c) => c.id === id) : undefined
      if (id === undefined) id = t.siguienteIncision = (t.siguienteIncision ?? 0) + 1
      else t.siguienteIncision = Math.max(t.siguienteIncision ?? 0, id)
      // La incisión de antes que se alarga o se reemplaza se cierra para hacerla de nuevo: sus separadores y sus
      // pinzas se quedan, son suyos.
      if (previo) cerrarLaIncision(t, id, { conSusSeparadores: true })

      const puntos = puntosDelCorte.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      const normales = normalesDelCorte.map((n) => new THREE.Vector3(n[0], n[1], n[2]))
      const parametros = {
        // La piel es fina; los planos profundos empiezan bajo ella y bajo la grasa.
        profundidad: (plano === 'piel' ? 14 : 50) * unidadesPorMm,
        alcance: 30 * unidadesPorMm,
        unidadesPorMm,
        incision: id,
      }
      const hechas: HeridaEnCapa[] = []
      for (const malla of mallas) {
        const herida = cortarCapa(malla, puntos, normales, parametros)
        if (herida) hechas.push(herida)
      }
      if (hechas.length === 0) {
        // Si se reemplazaba una incisión y el trazo nuevo no cortó nada, se rehace la que había: la incisión buena
        // no se pierde por un clic de más.
        if (previo && !esRehacer) {
          t.puntosDelTrazo = previo.puntos.map(([x, y, z]) => ({ x, y, z }))
          t.normalesDelTrazo = previo.normales.map(([x, y, z]) => ({ x, y, z }))
          aplicarElCorte(plano, { desdeLaSesion: true, esRehacer: true, deDiseccion, id, quemado: previo.quemado })
        }
        aviso('El trazo no atraviesa ninguna malla de esa capa.')
        return undefined
      }
      // Un borde quemado se ve: más oscuro, casi negro.
      if (quemado) {
        for (const h of hechas) {
          h.quemado = true
          ;(h.cinta.material as THREE.MeshBasicMaterial).color.set(0x2a1d16)
          refrescarBordes(h)
        }
      }
      t.heridas.set(plano, [...(t.heridas.get(plano) ?? []), ...hechas])
      t.ultimaHerida = plano
      t.ultimaIncision = id
      // Un corte nuevo cambia la piel por debajo de las puntadas de antes: se quitan, y con ellas lo que
      // habían cerrado. Sin esto la sutura vieja seguía diciendo «cerrada al 100 %» sobre una herida abierta.
      t.aperturaAntesDeCoser = undefined
      if (t.sutura && t.sutura.puntos.length > 0) {
        t.sutura.puntos.length = 0
        t.sutura.tension = 0
        refrescarSutura(t, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, null, ultimas.current.alHerir)
      }
      t.cortes = [
        ...(t.cortes ?? []),
        { id, plano, puntos: puntosDelCorte.map((p) => [p[0], p[1], p[2]]), normales: normalesDelCorte.map((n) => [n[0], n[1], n[2]]), quemado },
      ]
      // Las pinzas puestas antes de que hubiera herida (donde «irá la incisión») son de la primera de la piel.
      if (plano === 'piel') for (const q of t.pellizcos ?? []) if (q.datos.incision === undefined) q.datos.incision = id
      // Los puntos de una disección roma anterior en este plano ya no valen: la herida es otra.
      if (!deDiseccion && t.diseccion?.capa === plano) {
        t.diseccion.nodos = []
        t.diseccion.posiciones = []
        t.diseccion.incision = undefined
      }
      actualizarLaProfundidad(t)
      // La herida nueva se abre con lo que le toca —separadores, pinzas y la disección en curso, capa por capa—,
      // y no como la primera que hubiera: la del músculo no se abre con lo que abre la de la piel.
      reaplicarSeparadores(t, ultimas.current)
      // «Acompañar el bisturí» (P-003 E3): la pareja de pinzas y la de separadores más cercanas a la punta se corren
      // tras ella. Solo con un corte hecho por el residente: ni al recargar la sesión ni al rehacer ni la disección.
      if (ultimas.current.acompanarAlBisturi && !desdeLaSesion && !esRehacer && !deDiseccion) acompanarAlCorte(t, ultimas.current, plano, id)
      // La línea roja era la guía; con la herida abierta flotaría en el aire.
      if (t.trazo) t.trazo.visible = false
      ultimas.current.alHerir?.(estadoDeLasHeridas(t, ultimas.current.milimetrosPorUnidad))
      pedirDibujo()
      return id
    }
    taller.current.aplicarElCorte = aplicarElCorte

    /**
     * El agujero de la placa **fijada** sobre el que apunta el cursor, o `null`: con la placa fijada, la broca sobre un
     * agujero se centra en su eje (P-003 E6). Sin placa, o sin fijar, o lejos de todos, se perfora donde se apunte.
     */
    const agujeroParaLaBroca = (golpe: THREE.Intersection): number | null => {
      const placa = taller.current.implantes?.placa
      if (!placa?.fijada) return null
      const sobre = rayo.intersectObject(placa.grupo, true)[0]?.point ?? golpe.point
      return agujeroBajoElPunto(placa, sobre, 7)
    }

    /** Cómo entraría la broca por este golpe, con la inclinación que eligió quien la usa. */
    const trayectoriaDeBroca = (golpe: THREE.Intersection): Omit<Perforacion, 'profundidad' | 'maxima' | 'salidaPorLaOpuesta'> => {
      const placa = taller.current.implantes?.placa
      const agujero = agujeroParaLaBroca(golpe)
      if (placa && agujero !== null) {
        // Por el eje del agujero: perpendicular a la placa, entrando por la cortical cercana.
        const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
        const eje = VECTOR_DEL_EJE[ultimas.current.ejeLargo]
        const salida = placa.normal.clone()
        const medida = medirBajoElAgujero(placa, agujero, mallasDeHueso())
        const entrada = posicionDelAgujero(placa, agujero, 'abajo').addScaledVector(salida, -(medida?.distanciaAlHuesoMm ?? 0) * unidadesPorMm)
        return {
          agujero,
          entrada,
          dirEntra: salida.clone().negate(),
          salida,
          anguloConElEje: grados(Math.acos(Math.min(1, Math.abs(salida.clone().negate().dot(eje))))),
        }
      }
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
      // Sin el modelo de la broca se perfora igual y se lee igual (D-176): lo que no hay es broca que mover.
      if (!config) return
      if (!golpe && !perforando) {
        if (herramienta?.raiz.visible) {
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
      if (herramienta) {
        herramienta.raiz.quaternion
          .setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.salida)
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro))
        // La punta en la entrada; al avanzar, se hunde por su propio eje.
        herramienta.raiz.position.copy(t.entrada).addScaledVector(t.dirEntra, profundidad)
        herramienta.raiz.visible = true
      }
      const mm = (u: number) => (u / unidadesPorMm).toFixed(1).replace('.', ',')
      // Pasar de largo la cortical opuesta es el error clásico de quien aprende:
      // la broca sigue y lo que hay detrás son partes blandas. Se dice mientras ocurre.
      const pasado = perforando ? profundidad - perforando.salidaPorLaOpuesta : 0
      taller.current.decir?.(
        `Broca Ø ${String(config.diametroMm).replace('.', ',')} mm${t.agujero !== undefined ? ` · agujero ${t.agujero + 1} de la placa` : ''} · ${Math.round(t.anguloConElEje)}° con el eje del hueso${
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
      // El agujero se dibuja solo hasta donde hay hueso: la salida por la cortical opuesta. Si la broca se pasó de
      // largo, lo de más es aire (o partes blandas) y el cilindro negro asomaba por el otro lado del hueso, flotando
      // en mitad de la imagen. El exceso no se dibuja, pero sigue contando: `sePaso` y el aviso de la lectura salen
      // de la profundidad real de la broca, no de lo que se ve.
      const largoDelAgujero = largoVisibleDelAgujero(p.profundidad, p.salidaPorLaOpuesta)
      const agujero = new THREE.Mesh(
        new THREE.CylinderGeometry(radio, radio, largoDelAgujero, 16, 1, false),
        new THREE.MeshBasicMaterial({ color: 0x120909 }),
      )
      // Va en la escena y no dentro del modelo: `mostrar()` apaga las mallas que
      // no están en la lista, y un agujero sin nombre desaparecería con cada
      // cambio de capa.
      agujero.position.copy(p.entrada).addScaledVector(p.dirEntra, largoDelAgujero / 2)
      agujero.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.dirEntra)
      agujero.raycast = () => {}
      agujero.userData.agujero = true
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
      // Perforado por un agujero de la placa: queda anotado (diámetro, largo, bicortical); volver a perforarlo borra lo
      // que se había medido, porque el orificio es otro (P-003 E6).
      const placaDelAgujero = taller.current.implantes?.placa
      if (placaDelAgujero && p.agujero !== undefined) {
        const bicortical = p.profundidad >= p.salidaPorLaOpuesta - 0.5 * unidadesPorMm
        placaDelAgujero.agujeros.set(p.agujero, {
          perforado: { diametroMm: config.diametroMm, profundidadMm: p.profundidad / unidadesPorMm, bicortical },
          medido: null,
        })
        ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current), {
          tipo: 'agujero',
          texto: `Agujero ${p.agujero + 1} perforado con Ø ${String(config.diametroMm).replace('.', ',')} mm (${bicortical ? 'bicortical' : 'solo la cortical cercana'}). Ahora se mide con el medidor.`,
          atencion: !bicortical,
        })
      }
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
      // El medidor sobre un agujero perforado de la placa fijada **entra en el orificio** (P-003 E6): se posa en su eje
      // con la punta en la cortical opuesta, en vez de seguir al cursor por la superficie.
      const placaMedida = taller.current.implantes?.placa
      if (ultimas.current.modo === 'fijar' && ultimas.current.instrumento?.mide && placaMedida?.fijada) {
        const agujero = agujeroBajoElPunto(placaMedida, golpe.point, 7)
        const medida = agujero !== null && placaMedida.agujeros.get(agujero)?.perforado ? medirBajoElAgujero(placaMedida, agujero, mallasDeHueso()) : null
        if (agujero !== null && medida) {
          const u = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
          const n = placaMedida.normal
          herramienta.raiz.position
            .copy(posicionDelAgujero(placaMedida, agujero, 'abajo'))
            .addScaledVector(n, -(medida.distanciaAlHuesoMm + medida.espesorMm) * u)
          herramienta.raiz.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
          herramienta.raiz.visible = true
          taller.current.decir?.(`Medidor en el agujero ${agujero + 1}: hueso de ${medida.espesorMm.toFixed(0)} mm. Haga clic para anotar la medida.`)
          pedirDibujo()
          return
        }
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
      // La punta de la tijera apoyada en el tejido se queda ahí mientras se abren las ramas con la rueda.
      if (ultimas.current.modo === 'disecar' && taller.current.diseccion?.apoyada) return
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

    // --- la línea recta -----------------------------------------------------------------------------
    /** Lleva un punto de pantalla (en píxeles de la ventana) a un rayo de la cámara. */
    const apuntarA = (x: number, y: number) => {
      const caja = render.domElement.getBoundingClientRect()
      puntero.set(((x - caja.left) / caja.width) * 2 - 1, -((y - caja.top) / caja.height) * 2 + 1)
      rayo.setFromCamera(puntero, camara)
    }

    /**
     * La recta entre dos puntos de pantalla, llevada a la superficie: cada punto intermedio se proyecta con un
     * rayo de la cámara, de modo que la línea se pega a la piel aunque esté curva y, vista desde donde se
     * trazó, es exactamente recta. Devuelve si pudo trazarla.
     */
    const trazarLaRecta = (a: { x: number; y: number }, b: { x: number; y: number }, cortar: boolean): boolean => {
      const t = taller.current
      if (!esRectaValida(a, b)) {
        // Solo al cortar (D-176). La vista previa pasa por aquí con el ratón aún pegado al inicio, en los primeros
        // píxeles de cada arrastre, y el aviso se quedaba escrito encima de una incisión que sí se había hecho.
        if (cortar) t.decir?.('Los dos puntos están muy juntos: marque el inicio y el final de la incisión más separados.')
        return false
      }
      const largoPx = Math.hypot(b.x - a.x, b.y - a.y)
      // Más puntos al cortar que en la vista previa (cada rayo recorre el modelo entero); nunca más de 120.
      const separacion = Math.max(cortar ? 5 : Math.max(5, largoPx / 14), largoPx / 120)
      const muestras = muestrasEntre(a, b, separacion)
      const puntos: Punto3[] = []
      const normales: Punto3[] = []
      let fallos = 0
      for (const m of muestras) {
        apuntarA(m.x, m.y)
        const golpe = superficieBajoElCursor()
        if (!golpe) {
          fallos++
          continue
        }
        puntos.push({ x: golpe.point.x, y: golpe.point.y, z: golpe.point.z })
        const n = normalDelGolpe(golpe)
        normales.push({ x: n.x, y: n.y, z: n.z })
      }
      if (puntos.length < 3 || fallos > muestras.length / 2) {
        if (cortar) t.decir?.('La recta sale del modelo: marque los dos puntos sobre la piel.')
        return false
      }
      t.puntosDelTrazo = puntos
      t.normalesDelTrazo = normales
      dibujarTrazo(t)
      ultimas.current.alTrazar?.([...puntos])
      pedirDibujo()
      if (cortar) {
        // Lo que quedara escrito del gesto anterior («Inicio marcado…») ya no vale: la recta está hecha.
        t.decir?.('')
        cortarConElTrazo()
      }
      return true
    }

    /** Dibuja la recta provisional del inicio al cursor, sin cortar, a unos quince cuadros por segundo. */
    let ultimaVistaPrevia = 0
    const vistaPreviaDeLaRecta = (evento: PointerEvent, desde: { x: number; y: number }) => {
      const ahora = performance.now()
      if (ahora - ultimaVistaPrevia < 66) return
      ultimaVistaPrevia = ahora
      trazarLaRecta(desde, { x: evento.clientX, y: evento.clientY }, false)
    }

    /** La marca roja del inicio de la incisión, mientras se espera el segundo clic. */
    const marcarElInicio = (punto: Punto3) => {
      const t = taller.current
      // Solo se quita la marca anterior: `cancelarLaRecta` también olvida el inicio, que quien llama acaba de anotar.
      if (t.marcaDeInicio) {
        t.marcaDeInicio.removeFromParent()
        t.marcaDeInicio.geometry.dispose()
        ;(t.marcaDeInicio.material as THREE.Material).dispose()
        t.marcaDeInicio = undefined
      }
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const marca = new THREE.Mesh(
        new THREE.SphereGeometry(1.8 * unidadesPorMm, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff5a4a, depthTest: false }),
      )
      marca.position.set(punto.x, punto.y, punto.z)
      marca.renderOrder = 1000
      marca.raycast = () => {}
      marca.userData.deInterfaz = true
      escena.add(marca)
      t.marcaDeInicio = marca
      pedirDibujo()
    }

    /** Un gesto de línea recta terminó: o fue un arrastre de inicio a fin, o fue un clic. */
    const terminarLaRecta = (evento: PointerEvent | undefined) => {
      const t = taller.current
      const clic = clicDeRecta
      clicDeRecta = null
      // Salir del lienzo con el botón pulsado cancela el gesto en vez de cortar por donde se soltó.
      if (!clic || !evento || evento.type !== 'pointerup') return
      const movio = Math.hypot(evento.clientX - clic.x, evento.clientY - clic.y)
      if (movio >= 6) {
        // De inicio a fin arrastrando: vale como las dos marcas a la vez.
        cancelarLaRecta(t)
        trazarLaRecta({ x: clic.x, y: clic.y }, { x: evento.clientX, y: evento.clientY }, true)
        return
      }
      if (!t.inicioDeLaRecta) {
        t.inicioDeLaRecta = { x: clic.x, y: clic.y, punto: clic.punto, normal: clic.normal }
        // Un trazo anterior ya no vale: este es otro.
        t.puntosDelTrazo = []
        t.normalesDelTrazo = []
        dibujarTrazo(t)
        ultimas.current.alTrazar?.([])
        marcarElInicio(clic.punto)
        t.decir?.('Inicio marcado. Haga clic donde termina la incisión (Esc cancela).')
        return
      }
      const inicio = t.inicioDeLaRecta
      cancelarLaRecta(t)
      trazarLaRecta({ x: inicio.x, y: inicio.y }, { x: evento.clientX, y: evento.clientY }, true)
    }

    // --- separadores colocados ----------------------------------------------------------------------
    /**
     * A cuántos píxeles del cursor queda un instrumento colocado, medido sobre la recta que va de su punta a su
     * extremo más lejano; `null` si está a más de `margenPx`. Un Farabeuf es una chapa fina: de canto, el rayo
     * del cursor pasa de largo aunque el cursor esté encima, y levantarlo (P-003 E3) sería cuestión de puntería.
     */
    const distanciaEnPantalla = (grupo: THREE.Object3D, margenPx: number): number | null => {
      const caja = new THREE.Box3().setFromObject(grupo)
      if (caja.isEmpty()) return null
      const punta = grupo.position
      let lejos = punta.clone()
      let mayor = -1
      for (const x of [caja.min.x, caja.max.x]) {
        for (const y of [caja.min.y, caja.max.y]) {
          for (const z of [caja.min.z, caja.max.z]) {
            const d = punta.distanceToSquared(new THREE.Vector3(x, y, z))
            if (d > mayor) {
              mayor = d
              lejos = new THREE.Vector3(x, y, z)
            }
          }
        }
      }
      const caja2d = render.domElement.getBoundingClientRect()
      const aPixeles = (v: THREE.Vector3) => {
        const p = v.clone().project(camara)
        return new THREE.Vector2(((p.x + 1) / 2) * caja2d.width, ((1 - p.y) / 2) * caja2d.height)
      }
      const a = aPixeles(punta)
      const b = aPixeles(lejos)
      const c = new THREE.Vector2(((puntero.x + 1) / 2) * caja2d.width, ((1 - puntero.y) / 2) * caja2d.height)
      const ab = b.clone().sub(a)
      const k = ab.lengthSq() === 0 ? 0 : Math.min(1, Math.max(0, c.clone().sub(a).dot(ab) / ab.lengthSq()))
      const d = a.clone().addScaledVector(ab, k).distanceTo(c)
      return d <= margenPx ? d : null
    }

    /** El separador ya colocado que está bajo el cursor, si lo hay. */
    const separadorBajoElCursor = (): SeparadorEnEscena | null => {
      const lista = taller.current.separadores ?? []
      if (lista.length === 0) return null
      const golpes = rayo.intersectObjects(
        lista.map((q) => q.instrumento.grupo),
        true,
      )
      for (const g of golpes) {
        const dueno = lista.find((q) => {
          let o: THREE.Object3D | null = g.object
          while (o) {
            if (o === q.instrumento.grupo) return true
            o = o.parent
          }
          return false
        })
        if (dueno) return dueno
      }
      // De canto el rayo no toca la chapa: se elige el que pasa más cerca del cursor en pantalla.
      let cercano: SeparadorEnEscena | null = null
      let mejor = Infinity
      for (const q of lista) {
        const d = distanciaEnPantalla(q.instrumento.grupo, 14)
        if (d !== null && d < mejor) {
          mejor = d
          cercano = q
        }
      }
      return cercano
    }

    /**
     * Pone un separador en un sitio de la herida. La inclinación del mango sale del lado que sostiene
     * (`direccionDelMango`), no de hacia dónde mire la cámara: con la cámara, todos se acostaban hacia el mismo
     * sitio de la pantalla y se cruzaban sobre la herida (P-003 E3). `direccion` es la del labio «más», sin signo.
     */
    const ponerUnSeparador = (
      sitio: { punto: THREE.Vector3; normal: THREE.Vector3; direccion: THREE.Vector3; posicion: number },
      lado: 1 | -1 | 0,
      plano: PlanoDelSeparador,
      incision?: number,
    ): SeparadorEnEscena | null => {
      const t = taller.current
      const u = ultimas.current
      const inst = u.instrumento
      const separa = inst?.separa
      if (!inst || !separa || !t.escena) return null
      const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
      const lista = (t.separadores ??= [])
      const id = (t.siguienteSeparador = (t.siguienteSeparador ?? 0) + 1)
      const datos: SeparadorColocado = {
        id,
        instrumentoId: inst.id ?? '',
        nombre: inst.nombre ?? 'Separador',
        tipo: tipoDelSeparador(separa),
        plano,
        lado,
        posicion: sitio.posicion,
        maximoMm: separa.maximoMm,
        aperturaMm: 0,
        incision,
      }
      const m = direccionDelMango([sitio.normal.x, sitio.normal.y, sitio.normal.z], [sitio.direccion.x, sitio.direccion.y, sitio.direccion.z], lado)
      const nuevo: SeparadorEnEscena = {
        datos,
        url: inst.url,
        ajustes: inst.ajustes,
        punto: sitio.punto.clone(),
        normal: sitio.normal.clone(),
        // Hacia donde se aleja el labio que sostiene, con el signo de su lado (un autoestático no se desplaza).
        direccion: sitio.direccion.clone().multiplyScalar(lado === 0 ? 1 : lado),
        mango: new THREE.Vector3(m[0], m[1], m[2]),
        // El sitio de este plano queda guardado: bajarlo al músculo y volver a subirlo lo deja donde estaba.
        sitios:
          plano === 'hueso'
            ? {}
            : { [plano]: { punto: sitio.punto.clone(), normal: sitio.normal.clone(), direccion: sitio.direccion.clone(), posicion: sitio.posicion } },
        instrumento: colocarInstrumento(t.escena, inst.url, inst.ajustes, t.entorno ?? null, 1000 / (u.milimetrosPorUnidad || 1000), () => {
          posarSeparador(nuevo, unidadesPorMm)
          pedirDibujo()
        }),
      }
      lista.push(nuevo)
      t.separadorActivo = id
      return nuevo
    }

    /** Pone el separador en el sitio de la herida donde se hizo clic; en pareja, también el del borde de enfrente. La apertura la da luego la rueda, o la barra. */
    const colocarSeparador = (c: NonNullable<typeof clicDeSeparador>) => {
      const t = taller.current
      const u = ultimas.current
      const inst = u.instrumento
      const separa = inst?.separa
      if (!inst || !separa || !t.escena) return
      const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
      const lista = (t.separadores ??= [])
      const tipo = tipoDelSeparador(separa)
      const lado = ladoAlColocar(tipo, c.info.lado)
      const posicion = c.info.t
      // Uno igual y muy cerca: se elige ese en lugar de poner un segundo encima.
      const cercanos = lista.filter(
        (q) => q.datos.instrumentoId === (inst.id ?? '') && q.datos.plano === c.plano && Math.abs(q.datos.posicion - posicion) < 0.08,
      )
      const igual = cercanos.find((q) => q.datos.lado === lado)
      if (igual) {
        t.separadorActivo = igual.datos.id
        u.alSeparar?.(estadoDeLosSeparadores(t))
        t.decir?.(`${igual.datos.nombre}: ya hay uno aquí. Ábralo con la rueda del ratón.`)
        return
      }
      // En pareja (los de mano, de a dos como las pinzas): un clic pone uno por borde, a la misma altura. Con uno ya
      // puesto aquí, el clic completa la pareja con el que falta.
      const enPareja = u.separadoresEnPareja !== false && tipo === 'mano' && c.plano !== 'hueso'
      const lados: (1 | -1 | 0)[] = enPareja ? ladosParaLaPareja(cercanos.map((q) => q.datos.lado)) : [lado]
      if (!lados.includes(lado)) lados.push(lado)
      if (!caben(lista.length, lados.length)) {
        t.decir?.(
          lados.length > 1
            ? `Entre los dos no caben: el máximo son ${MAXIMO_DE_SEPARADORES} separadores. Quite alguno o desactive «En pareja».`
            : `Son ${MAXIMO_DE_SEPARADORES} separadores: es el máximo que cabe. Quite alguno.`,
        )
        return
      }
      // El del clic va donde se apuntó; el de enfrente, en el borde opuesto de la misma posición: el reflejo del
      // primero respecto de la línea de la herida, llevado a la superficie del plano.
      const linea = sitioEnLaHerida(c.herida, posicion, 1)
      const hechos: SeparadorEnEscena[] = []
      for (const l of lados) {
        if (l === lado) {
          const s = ponerUnSeparador({ punto: c.punto, normal: c.normal, direccion: c.info.direccion, posicion }, l, c.plano, c.herida.incision)
          if (s) hechos.push(s)
          continue
        }
        if (!linea) continue
        // A qué distancia de la línea cayó el clic, con signo; el de enfrente se pone a la misma del otro lado.
        const desvio = c.punto.clone().sub(linea.punto).dot(linea.direccion)
        const lejos = Math.max(Math.abs(desvio), 3 * unidadesPorMm) * -Math.sign(desvio || c.info.lado)
        const q = linea.punto.clone().addScaledVector(linea.direccion, lejos)
        const capa = c.plano === 'musculo' ? 'musculo' : 'piel'
        const sobre = proyectarEnLaCapa(q, linea.normal, capa, c.herida.malla)
        const s = ponerUnSeparador({ punto: sobre.punto, normal: sobre.normal, direccion: linea.direccion, posicion: linea.t }, l, c.plano, c.herida.incision)
        if (s) hechos.push(s)
      }
      if (hechos.length === 0) return
      reaplicarSeparadores(t, u)
      t.decir?.(
        hechos.length > 1
          ? `${hechos[0].datos.nombre} ×2 colocados ${enElPlano(c.plano)}, uno por borde. Ábralos con la rueda (Mayúsculas + rueda, solo el que está bajo el cursor).`
          : `${hechos[0].datos.nombre} colocado ${enElPlano(c.plano)}. Ábralo con la rueda del ratón (o con la barra del panel).`,
      )
      pedirDibujo()
    }

    /**
     * Deja el separador que se llevaba en el borde de la herida más cercano al clic. Conserva su apertura; el lado
     * lo decide el borde en que se hizo clic (un Farabeuf puede pasar de un borde al de enfrente), y el plano es el
     * suyo.
     */
    const dejarElSeparador = (c: NonNullable<typeof clicDeSeparador>) => {
      const t = taller.current
      const u = ultimas.current
      const mano = t.separadorEnLaMano
      if (!mano) return
      const s = mano.objeto
      const lado = ladoAlColocar(s.datos.tipo, c.info.lado)
      s.punto = c.punto.clone()
      s.normal = c.normal.clone()
      s.direccion = c.info.direccion.clone().multiplyScalar(lado === 0 ? 1 : lado)
      const m = direccionDelMango([c.normal.x, c.normal.y, c.normal.z], [c.info.direccion.x, c.info.direccion.y, c.info.direccion.z], lado)
      s.mango = new THREE.Vector3(m[0], m[1], m[2])
      s.datos.lado = lado
      s.datos.posicion = c.info.t
      s.datos.incision = c.herida.incision
      s.datos.aperturaMm = mano.previo.datos.aperturaMm
      // Los sitios de otros planos eran del lugar de antes: solo vale el de aquí.
      s.sitios =
        s.datos.plano === 'hueso'
          ? {}
          : { [s.datos.plano]: { punto: c.punto.clone(), normal: c.normal.clone(), direccion: c.info.direccion.clone(), posicion: c.info.t } }
      t.separadorEnLaMano = undefined
      t.separadorActivo = s.datos.id
      atenuarInstrumento(s.instrumento.grupo, false)
      reaplicarSeparadores(t, u)
      t.decir?.(`${s.datos.nombre} reubicado, abierto ${s.datos.aperturaMm} mm.`)
      pedirDibujo()
    }

    // --- la pinza de reducción: agarra y mueve (P-003 E5) -------------------------------------------
    /** La pinza de reducción puesta que está bajo el cursor, si la hay. */
    const pinzaDeReduccionBajoElCursor = (): PinzaDeReduccion | null => {
      const lista = taller.current.pinzasDeReduccion ?? []
      if (lista.length === 0) return null
      const golpes = rayo.intersectObjects(
        lista.map((q) => q.instrumento.grupo),
        true,
      )
      for (const g of golpes) {
        const dueno = lista.find((q) => perteneceA(g.object, q.instrumento.grupo))
        if (dueno) return dueno
      }
      let cercana: PinzaDeReduccion | null = null
      let mejor = Infinity
      for (const q of lista) {
        const d = distanciaEnPantalla(q.instrumento.grupo, 14)
        if (d !== null && d < mejor) {
          mejor = d
          cercana = q
        }
      }
      return cercana
    }

    /**
     * Deja la pinza de reducción agarrando el trozo de hueso: queda en el punto tocado, con el mango hacia fuera por
     * la normal del hueso, **como hija del trozo** (`attach` conserva su posición en el mundo). Así lo acompaña sin
     * código propio al moverlo con las asas o al girarlo con un aro. Sin hueso expuesto se avisa, no se impide.
     */
    const tomarConLaPinza = (golpe: THREE.Intersection, pieza: THREE.Object3D) => {
      const t = taller.current
      const u = ultimas.current
      const inst = u.instrumento
      if (!inst?.reduce || !t.escena) return
      const lista = (t.pinzasDeReduccion ??= [])
      if (lista.some((q) => q.pieza === pieza)) {
        t.decir?.('Este trozo ya tiene una pinza. Muévalo con las flechas y los aros; un clic en la pinza la suelta.')
        return
      }
      if (lista.length >= MAXIMO_DE_PINZAS_DE_REDUCCION) {
        t.decir?.(`Ya hay ${MAXIMO_DE_PINZAS_DE_REDUCCION} pinzas puestas: una la lleva quien opera y la otra el ayudante. Suelte una (un clic en ella).`)
        return
      }
      const normal = normalDelGolpe(golpe)
      const colocado = colocarInstrumento(t.escena, inst.url, inst.ajustes, t.entorno ?? null, 1000 / (u.milimetrosPorUnidad || 1000))
      posarEn(colocado.grupo, golpe.point, normal)
      pieza.attach(colocado.grupo)
      const id = (t.siguientePinzaDeReduccion = (t.siguientePinzaDeReduccion ?? 0) + 1)
      lista.push({ id, nombre: inst.nombre ?? 'Pinza de reducción', pieza, instrumento: colocado })
      u.alReducir?.(estadoDeLaReduccion(t))
      // Sin un abordaje que llegue al hueso, la pinza se pone igual pero se dice: en una cirugía de verdad no se llega.
      const hayAbordaje = (t.heridas.get('musculo')?.length ?? 0) > 0 || (t.heridas.get('piel')?.length ?? 0) > 0
      if (!hayAbordaje) u.alGesto?.('La pinza toma el hueso sin que haya un abordaje hasta él: primero se corta y se separan los planos.', 'atencion')
      t.decir?.(`${inst.nombre ?? 'Pinza'} agarrando el trozo. Muévalo con las flechas y los aros; un clic en la pinza la suelta.`)
      pedirDibujo()
    }

    /**
     * Mientras un separador o una pinza está «en la mano» (P-003 E3, respuesta 3 del dueño: «que cuando se haga
     * clic se suelte y se pueda reubicar»), sigue al cursor sobre el borde de la herida más cercano, atenuado, sin
     * abrir nada; el clic siguiente lo deja. Es una vista previa barata: no rehace la herida en cada movimiento.
     */
    const llevarLoQueSeLevanto = (evento: PointerEvent) => {
      const t = taller.current
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const sep = t.separadorEnLaMano
      if (sep) {
        aCoordenadas(evento)
        const s = sep.objeto
        const plano = s.datos.plano
        const capas: CapaDeLaHerida[] = plano === 'hueso' ? ['piel', 'musculo'] : [plano]
        const heridas = capas.flatMap((c) => t.heridas.get(c) ?? [])
        const golpe = plano === 'hueso' ? huesoBajoElCursor() : golpeEnLaCapa([plano])
        if (!golpe || heridas.length === 0) return
        let elegido: NonNullable<ReturnType<typeof ladoDeLaHerida>> | null = null
        for (const h of heridas) {
          const info = ladoDeLaHerida(h, golpe.point)
          if (info && (!elegido || info.cerca < elegido.cerca)) elegido = info
        }
        if (!elegido) return
        const n = normalDelGolpe(golpe)
        const lado = ladoAlColocar(s.datos.tipo, elegido.lado)
        const m = direccionDelMango([n.x, n.y, n.z], [elegido.direccion.x, elegido.direccion.y, elegido.direccion.z], lado)
        posarEn(s.instrumento.grupo, golpe.point.clone().addScaledVector(n, 0.4 * unidadesPorMm), new THREE.Vector3(m[0], m[1], m[2]))
        pedirDibujo()
        return
      }
      const pin = t.pinzaEnLaMano
      if (pin) {
        aCoordenadas(evento)
        const golpe = golpeEnLaCapa(['piel'])
        if (!golpe) return
        const p = pin.objeto
        const n = normalDelGolpe(golpe)
        const eje = ejeLateralEn(golpe, n)
        const sobre = proyectarEnLaPiel(golpe.point, n, golpe.object)
        const lado = p.datos.lado === 0 ? 1 : p.datos.lado
        p.punto = sobre.punto
        p.normal = sobre.normal
        p.direccion = eje.direccion.clone().multiplyScalar(lado)
        p.mango = sobre.normal.clone().multiplyScalar(0.6).addScaledVector(p.direccion, 0.7).normalize()
        posarPliegue(p, unidadesPorMm)
        pedirDibujo()
      }
    }

    /** Deja la pinza que se llevaba en el borde de la herida más cercano al clic, con el agarre que tenía. */
    const dejarLaPinza = (golpe: THREE.Intersection) => {
      const t = taller.current
      const u = ultimas.current
      const pin = t.pinzaEnLaMano
      if (!pin) return
      const p = pin.objeto
      const n = normalDelGolpe(golpe)
      const eje = ejeLateralEn(golpe, n)
      const sobre = proyectarEnLaPiel(golpe.point, n, golpe.object)
      let lado: 1 | -1 = p.datos.lado === 0 ? 1 : p.datos.lado
      let mejor: (NonNullable<ReturnType<typeof ladoDeLaHerida>> & { incision: number }) | null = null
      for (const h of t.heridas.get('piel') ?? []) {
        const info = ladoDeLaHerida(h, golpe.point)
        if (info && (!mejor || info.cerca < mejor.cerca)) mejor = { ...info, incision: h.incision }
      }
      // Con herida, la pinza toma el borde en que se hizo clic; sin ella, conserva el que tenía.
      if (eje.conHerida && mejor) {
        lado = mejor.lado
        p.datos.incision = mejor.incision
      }
      p.punto = sobre.punto
      p.normal = sobre.normal
      p.direccion = eje.direccion.clone().multiplyScalar(lado)
      p.mango = sobre.normal.clone().multiplyScalar(0.6).addScaledVector(p.direccion, 0.7).normalize()
      p.datos.lado = lado
      p.datos.posicion = eje.t
      p.datos.agarre = pin.previo.datos.agarre
      t.pinzaEnLaMano = undefined
      t.pellizcoActivo = p.datos.id
      atenuarInstrumento(p.instrumento.grupo, false)
      reaplicarSeparadores(t, u)
      avisarPellizcos(t, u)
      t.decir?.('Pinza reubicada.')
    }

    /**
     * Apoya la punta cerrada de la tijera en el tejido (disección roma). El plano que se diseca es el de la pieza
     * tocada: la piel o el músculo. Se queda ahí, con la punta metida unos milímetros, mientras se abren las ramas.
     */
    const apoyarLaPunta = (golpe: THREE.Intersection, normal: THREE.Vector3) => {
      const t = taller.current
      const u = ultimas.current
      const roma = u.instrumento?.roma
      if (!roma) return
      const capa = capaBlandaDelRol(u.piezas.find((p) => p.nodo === golpe.object.name)?.rol)
      if (!capa) {
        t.decir?.('La disección roma es de partes blandas: apoye la punta en la piel o en el músculo, no en el hueso.')
        return
      }
      const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
      let d = t.diseccion
      // Cambiar de plano empieza otra disección: los puntos de la anterior eran de otra herida.
      if (!d || d.capa !== capa) {
        d = t.diseccion = { capa, nodos: [], fraccion: 0, aperturas: 0, posicion: 0.5, maximoMm: roma.maximoMm, posiciones: [] }
      }
      d.maximoMm = roma.maximoMm
      d.fraccion = 0
      // Una disección nunca borra una herida que no hizo ella: si el plano ya está cortado con el bisturí, las
      // ramas lo abren donde se apoya la punta y la incisión se queda como estaba.
      const hayHerida = (t.heridas.get(capa)?.length ?? 0) > 0
      const esSuya = d.nodos.length > 0
      d.apoyada = { punto: golpe.point.clone(), normal: normal.clone(), separo: false, sobreHerida: hayHerida && !esSuya }
      posarHerramienta(golpe)
      const herramienta = t.herramienta
      if (herramienta) herramienta.raiz.position.addScaledVector(normal, -2 * unidadesPorMm)
      t.decir?.(
        capa === 'piel'
          ? 'Punta apoyada en la piel. La piel se incide con bisturí; la disección roma es de los planos de debajo.'
          : 'Punta apoyada en el músculo. Abra las ramas con la rueda del ratón.',
      )
      u.alDisecar?.({ capa, aperturas: d.aperturas, apoyada: true, evento: 'apoyo' })
      // Con la punta nueva, lo que se había separado en el apoyo anterior vuelve a cerrarse.
      reaplicarSeparadores(t, u)
      pedirDibujo()
    }

    const alSubirParaDisecar = (evento: PointerEvent) => {
      const clic = clicDeDiseccion
      clicDeDiseccion = null
      if (!clic) return
      if (Math.hypot(evento.clientX - clic.x, evento.clientY - clic.y) > 6) return
      apoyarLaPunta(clic.golpe, clic.normal)
    }

    const alSubirParaSeparar = (evento: PointerEvent) => {
      const clic = clicDeSeparador
      clicDeSeparador = null
      if (!clic) return
      if (Math.hypot(evento.clientX - clic.x, evento.clientY - clic.y) > 6) return
      // Con uno en la mano, el clic lo deja; si no, coloca uno nuevo.
      if (taller.current.separadorEnLaMano) dejarElSeparador(clic)
      else colocarSeparador(clic)
    }

    // --- pinzas ---------------------------------------------------------------------------------------
    const pellizcoBajoElCursor = (): PellizcoEnEscena | null => {
      const lista = taller.current.pellizcos ?? []
      if (lista.length === 0) return null
      const golpes = rayo.intersectObjects(
        lista.flatMap((q) => [q.pliegue, q.instrumento.grupo]),
        true,
      )
      for (const g of golpes) {
        const dueno = lista.find((q) => {
          let o: THREE.Object3D | null = g.object
          while (o) {
            if (o === q.pliegue || o === q.instrumento.grupo) return true
            o = o.parent
          }
          return false
        })
        if (dueno) return dueno
      }
      // Las mandíbulas de canto no las toca el rayo: la pinza que pasa más cerca del cursor en pantalla (P-003 E3).
      let cercana: PellizcoEnEscena | null = null
      let mejor = Infinity
      for (const q of lista) {
        const d = distanciaEnPantalla(q.instrumento.grupo, 14)
        if (d !== null && d < mejor) {
          mejor = d
          cercana = q
        }
      }
      return cercana
    }

    /** El color de la piel que se pellizca, para que el pliegue no destaque como un parche de otro color. */
    const colorDeLaPiel = (objeto: THREE.Object3D): THREE.Color => {
      const malla = objeto as THREE.Mesh
      const original = taller.current.materialesOriginales.get(malla) ?? malla.material
      const material = Array.isArray(original) ? original[0] : original
      const color = (material as THREE.MeshStandardMaterial | undefined)?.color
      return color ? color.clone() : new THREE.Color(0xd9b8a3)
    }

    /** Hacia dónde se aleja cada borde de la piel en el punto tocado, y en qué lugar de la herida cae. */
    const ejeLateralEn = (golpe: THREE.Intersection, n: THREE.Vector3) => {
      const t = taller.current
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const tangente = (v: THREE.Vector3) => v.clone().sub(n.clone().multiplyScalar(v.dot(n)))
      // Con la herida abierta, el eje es el que la herida usa para separar sus labios.
      let mejor: (NonNullable<ReturnType<typeof ladoDeLaHerida>> & { incision: number }) | null = null
      for (const h of t.heridas.get('piel') ?? []) {
        const info = ladoDeLaHerida(h, golpe.point)
        if (info && (!mejor || info.cerca < mejor.cerca)) mejor = { ...info, incision: h.incision }
      }
      if (mejor && mejor.cerca <= 40 * unidadesPorMm) {
        const d = tangente(mejor.direccion)
        if (d.lengthSq() > 1e-10) return { direccion: d.normalize(), t: mejor.t, conHerida: true, incision: mejor.incision }
      }
      // Sin herida todavía, la pareja se pone a los dos lados de la incisión que se va a hacer: la que está
      // trazada, si hay trazo, o si no, de lado a lado de la pantalla.
      const trazo = t.puntosDelTrazo
      if (trazo.length >= 2) {
        let cerca = Infinity
        let along: THREE.Vector3 | null = null
        for (let i = 1; i < trazo.length; i++) {
          const a = new THREE.Vector3(trazo[i - 1].x, trazo[i - 1].y, trazo[i - 1].z)
          const b = new THREE.Vector3(trazo[i].x, trazo[i].y, trazo[i].z)
          const segmento = b.clone().sub(a)
          const k = segmento.lengthSq() === 0 ? 0 : Math.min(1, Math.max(0, golpe.point.clone().sub(a).dot(segmento) / segmento.lengthSq()))
          const distancia = a.clone().addScaledVector(segmento, k).distanceTo(golpe.point)
          if (distancia < cerca) {
            cerca = distancia
            along = segmento
          }
        }
        const lateral = along ? new THREE.Vector3().crossVectors(n, along) : null
        if (lateral && lateral.lengthSq() > 1e-12) return { direccion: lateral.normalize(), t: 0.5, conHerida: false, incision: undefined }
      }
      const derecha = tangente(new THREE.Vector3(1, 0, 0).applyQuaternion(camara.quaternion))
      if (derecha.lengthSq() < 1e-10) derecha.set(1, 0, 0)
      return { direccion: derecha.normalize(), t: 0.5, conHerida: false, incision: undefined }
    }

    /** Lleva un punto a la superficie de una capa (la piel, el músculo), bajando por la normal: no se apoya en el aire. */
    const proyectarEnLaCapa = (q: THREE.Vector3, n: THREE.Vector3, capa: 'piel' | 'musculo', respaldo: THREE.Object3D) => {
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const mallas = mallasConRol(taller.current, ultimas.current.piezas, [capa])
      const lanzado = new THREE.Raycaster(q.clone().addScaledVector(n, 10 * unidadesPorMm), n.clone().negate(), 0, 30 * unidadesPorMm)
      const g = lanzado.intersectObjects(mallas, false)[0]
      if (!g) return { punto: q.clone(), normal: n.clone(), objeto: respaldo }
      const normal = g.face ? g.face.normal.clone().transformDirection(g.object.matrixWorld) : n.clone()
      if (normal.dot(n) < 0) normal.negate()
      return { punto: g.point.clone(), normal, objeto: g.object as THREE.Object3D }
    }
    const proyectarEnLaPiel = (q: THREE.Vector3, n: THREE.Vector3, respaldo: THREE.Object3D) =>
      proyectarEnLaCapa(q, n, 'piel', respaldo)

    /** Una pinza tomando la piel en ese punto, en su borde, con el mango abierto hacia fuera. */
    const crearPellizcoEn = (
      objetoDePiel: THREE.Object3D,
      punto: THREE.Vector3,
      n: THREE.Vector3,
      lado: 1 | -1,
      direccionLateral: THREE.Vector3,
      posicion: number,
      incision?: number,
    ) => {
      const t = taller.current
      const u = ultimas.current
      const inst = u.instrumento
      const pellizca = inst?.pellizca
      if (!inst || !pellizca || !t.escena) return null
      const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
      const lista = (t.pellizcos ??= [])
      const id = (t.siguientePellizco = (t.siguientePellizco ?? 0) + 1)
      // Hacia fuera de la herida, con el signo de su lado: por ahí tira al separarse, y hacia ahí se abre el mango,
      // de modo que las dos pinzas quedan enfrentadas, una frente a la otra.
      const direccion = direccionLateral.clone().multiplyScalar(lado)
      const mango = n.clone().multiplyScalar(0.6).addScaledVector(direccion, 0.7).normalize()
      const pliegue = crearPliegue(colorDeLaPiel(objetoDePiel))
      escena.add(pliegue)
      const nuevo: PellizcoEnEscena = {
        datos: {
          id,
          conDientes: pellizca.conDientes,
          lado,
          alturaMm: ALTURA_INICIAL_DEL_PELLIZCO_MM,
          posicion,
          separacionMm: 0,
          agarre: 1,
          incision,
        },
        url: inst.url,
        ajustes: inst.ajustes,
        pliegue,
        punto: punto.clone(),
        normal: n.clone(),
        mango,
        direccion,
        instrumento: colocarInstrumento(t.escena, inst.url, inst.ajustes, t.entorno ?? null, 1000 / (u.milimetrosPorUnidad || 1000), () => {
          posarPliegue(nuevo, unidadesPorMm)
          pedirDibujo()
        }),
      }
      lista.push(nuevo)
      t.pellizcoActivo = id
      posarPliegue(nuevo, unidadesPorMm)
      return nuevo
    }

    /**
     * Pone **la pareja** de pinzas, una frente a la otra, a los dos lados de la incisión (petición de Cristóbal:
     * «seleccionar Adson ×2 y que se asuma que van una frente a la otra»). Con una ya puesta, completa la pareja
     * con la del lado contrario.
     */
    const crearParDePinzas = (golpe: THREE.Intersection, soloLado: 1 | -1 | null) => {
      const t = taller.current
      const u = ultimas.current
      const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
      const n = normalDelGolpe(golpe)
      const eje = ejeLateralEn(golpe, n)
      // Pegadas al borde si ya hay herida; si no, a un lado y otro de donde irá la incisión.
      const separacion = (eje.conHerida ? 4 : 12) * unidadesPorMm
      const lados: (1 | -1)[] = soloLado ? [soloLado] : [1, -1]
      for (const lado of lados) {
        const q = golpe.point.clone().addScaledVector(eje.direccion, lado * separacion)
        const sobre = proyectarEnLaPiel(q, n, golpe.object)
        crearPellizcoEn(sobre.objeto, sobre.punto, sobre.normal, lado, eje.direccion, eje.t, eje.incision)
      }
      // La tensión que ya hubiera (de una pareja anterior que se soltó) no se arrastra: nacen cerradas y sin separar.
      reaplicarSeparadores(t, u)
      avisarPellizcos(t, u)
      t.decir?.('Pinzas puestas, una frente a la otra. La rueda las separa o las junta; con Mayúsculas abre o cierra las mandíbulas.')
    }

    const alBajar = (evento: PointerEvent) => {
      const { modo: modoActual } = ultimas.current
      if (modoActual === 'orbitar') return

      aCoordenadas(evento)
      clicEnElVacio = null

      if (modoActual === 'info') {
        // Como señalar, no modifica nada: dice qué hay bajo el clic y la consola abre su ficha. El primer golpe visible
        // es lo que el residente ve; una pieza apagada no se pincha.
        const golpe = superficieBajoElCursor()
        const objeto = golpe?.object
        const datos = objeto?.userData ?? {}
        ultimas.current.alInformar?.(
          objeto?.name
            ? {
                nodo: objeto.name,
                atlasId: typeof datos.atlasId === 'string' ? datos.atlasId : null,
                etiqueta: typeof datos.etiqueta === 'string' ? datos.etiqueta : null,
              }
            : null,
        )
        return
      }

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
        if (ultimas.current.tipoDeTrazo === 'recto') {
          // Línea recta: se decide al soltar si fue un clic (marca el inicio o el final) o un arrastre de
          // inicio a fin. Mientras tanto se bloquea la órbita, como al dibujar a mano.
          const n = normalDelGolpe(golpe)
          clicDeRecta = {
            x: evento.clientX,
            y: evento.clientY,
            punto: { x: golpe.point.x, y: golpe.point.y, z: golpe.point.z },
            normal: { x: n.x, y: n.y, z: n.z },
          }
          controles.enabled = false
          arrastrando = true
          return
        }
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
        const t = taller.current
        const enLaMano = t.separadorEnLaMano
        const separa = ultimas.current.instrumento?.separa
        // Con un músculo elegido para separar (P-003 E10) el clic lo retrae sin cortarlo, haya herida o no: el
        // separador se apoya en el músculo, no en la incisión.
        const objetivo = ultimas.current.musculoObjetivo
        if (objetivo?.accion === 'separar' && separa && !enLaMano) {
          const raiz = t.raiz
          const golpeEnElMusculo = raiz
            ? rayo.intersectObject(raiz, true).find((g) => g.object.visible && g.object.name === objetivo.nodo && (g.object as THREE.Mesh).isMesh)
            : undefined
          if (!golpeEnElMusculo) {
            t.decir?.(`Apunte a ${objetivo.nodo.replace(/_/g, ' ')}: es el músculo que eligió para separar (y tiene que estar visible).`)
            return
          }
          retraerElMusculo(
            t,
            ultimas.current,
            { malla: golpeEnElMusculo.object as THREE.Mesh, punto: golpeEnElMusculo.point.clone(), normal: normalDelGolpe(golpeEnElMusculo) },
            { nombre: ultimas.current.instrumento?.nombre ?? 'Separador', maximoMm: separa.maximoMm },
          )
          return
        }
        // Con un separador en la mano se puede dejar aunque se haya cambiado de instrumento: lo que se deja es el suyo.
        if (!separa && !enLaMano) return
        // Pinchar un separador ya puesto lo levanta (P-003 E3, respuesta 3 del dueño): sigue al cursor y el clic
        // siguiente lo deja donde se apunte. La rueda no necesita elegirlo: actúa sobre el que está bajo el cursor.
        if (!enLaMano) {
          const puesto = separadorBajoElCursor()
          if (puesto) {
            levantarSeparador(t, ultimas.current, puesto)
            esconderHerramienta()
            clicDeSeparador = null
            return
          }
        }
        // El plano en que se apoya (petición de Cristóbal): el que se eligió en el panel; el Hohmann, el hueso. El
        // separador que se lleva en la mano conserva el suyo.
        const plano: PlanoDelSeparador = enLaMano ? enLaMano.objeto.datos.plano : separa!.apoyoEnHueso ? 'hueso' : ultimas.current.planoDelSeparador
        const capas: CapaDeLaHerida[] = plano === 'hueso' ? ['piel', 'musculo'] : [plano]
        const heridas = capas.flatMap((c) => t.heridas.get(c) ?? [])
        if (heridas.length === 0) {
          t.decir?.(
            todasLasHeridas(t).length === 0
              ? 'No hay herida que separar: corte primero con un bisturí, en modo Trazar.'
              : plano === 'musculo'
                ? 'Todavía no hay herida en el músculo: ábrala con el bisturí profundo o con la disección roma.'
                : 'No hay herida en la piel: elija «Músculo» para separar el plano de abajo.',
          )
          return
        }
        // El Hohmann se apoya en el borde del hueso: se pincha el hueso. Los demás, la superficie de su plano.
        const golpe = plano === 'hueso' ? huesoBajoElCursor() : golpeEnLaCapa([plano])
        if (!golpe) {
          t.decir?.(
            plano === 'hueso'
              ? 'Apunte al borde del hueso: el Hohmann se apoya en el hueso.'
              : plano === 'musculo'
                ? 'Apunte al músculo, por donde se abrió: con la piel abierta se ve debajo.'
                : 'Acerque el separador a la piel, junto a la herida.',
          )
          return
        }
        const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
        // El borde más cercano de las heridas de ese plano es el que se agarra.
        let elegido: NonNullable<ReturnType<typeof ladoDeLaHerida>> | null = null
        let heridaElegida: HeridaEnCapa | null = null
        for (const h of heridas) {
          const info = ladoDeLaHerida(h, golpe.point)
          if (info && (!elegido || info.cerca < elegido.cerca)) {
            elegido = info
            heridaElegida = h
          }
        }
        if (!elegido || !heridaElegida || (plano !== 'hueso' && elegido.cerca > 30 * unidadesPorMm)) {
          t.decir?.(enLaMano ? 'Acerque el separador al borde de la herida y haga clic para dejarlo (Esc lo devuelve).' : 'Acerque el separador al borde de la herida y haga clic para colocarlo.')
          return
        }
        // Un clic coloca (o deja); el gesto se resuelve al soltar (`alSubirParaSeparar`).
        clicDeSeparador = {
          x: evento.clientX,
          y: evento.clientY,
          punto: golpe.point.clone(),
          normal: normalDelGolpe(golpe),
          info: elegido,
          plano,
          herida: heridaElegida,
        }
        return
      }

      if (modoActual === 'disecar') {
        if (!ultimas.current.instrumento?.roma) return
        const golpe = superficieBajoElCursor()
        if (!golpe) {
          taller.current.decir?.('Apunte al tejido: la punta se apoya en la piel o en el músculo.')
          return
        }
        // Un clic apoya la punta; se resuelve al soltar (`alSubirParaDisecar`).
        clicDeDiseccion = { x: evento.clientX, y: evento.clientY, golpe, normal: normalDelGolpe(golpe) }
        return
      }

      if (modoActual === 'pinzar') {
        if (!ultimas.current.instrumento?.pellizca) return
        const t = taller.current
        const u = ultimas.current
        // Con una pinza en la mano, el clic la deja en el borde que se apunta (P-003 E3).
        if (t.pinzaEnLaMano) {
          const destino = golpeEnLaCapa(['piel'])
          if (!destino) {
            t.decir?.('Apunte a la piel junto a la herida para dejar la pinza (Esc la devuelve).')
            return
          }
          dejarLaPinza(destino)
          return
        }
        // Pinchar una pinza que ya sostiene la piel la elige, y arrastrar arriba o abajo cambia cuánto levanta; un
        // clic sin arrastre la levanta para reubicarla (P-003 E3, se resuelve al soltar).
        const puesta = pellizcoBajoElCursor()
        if (puesta) {
          t.pellizcoActivo = puesta.datos.id
          levantando = { id: puesta.datos.id, y0: evento.clientY, altura0: puesta.datos.alturaMm, movido: false }
          controles.enabled = false
          arrastrando = true
          avisarPellizcos(t, u)
          return
        }
        // Las pinzas toman la piel: el rayo pasa de largo por lo demás.
        const golpe = golpeEnLaCapa(['piel'])
        if (!golpe) {
          t.decir?.('Apunte a la piel junto a la herida, o donde irá la incisión: las pinzas toman la piel.')
          return
        }
        const lista = t.pellizcos ?? []
        if (lista.length >= MAXIMO_DE_PELLIZCOS) {
          t.decir?.('Ya está la pareja de pinzas: una la sostiene quien opera y la otra el ayudante. Suéltelas para volver a ponerlas.')
          return
        }
        // Un clic pone la pareja; con una sola puesta (la otra se soltó), el clic completa la del lado contrario.
        crearParDePinzas(golpe, lista.length === 1 ? (lista[0].datos.lado >= 0 ? -1 : 1) : null)
        return
      }

      if (modoActual === 'perforar') {
        // Sin exigir el modelo de la broca (D-176): perforar es de la broca, no de su dibujo.
        if (!ultimas.current.instrumento?.perfora) return
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

      // Un asa del trozo elegido gana a todo lo demás: está dibujada encima de la escena, y si el hueso de debajo
      // se agarrara en su lugar, tocar una flecha arrastraría el trozo sobre la pantalla.
      if (muevePorTrozo(modoActual, ultimas.current.moverTodo) && elegida) {
        const asa = asaBajoElRayo()
        if (asa) {
          elegida.updateMatrixWorld(true)
          const t = taller.current
          const origenes = (t.origenesDePiezas ??= new Map())
          if (!origenes.has(elegida)) origenes.set(elegida, { posicion: elegida.position.clone(), rotacion: elegida.rotation.clone() })
          asaAgarrada = {
            asa,
            x: evento.clientX,
            y: evento.clientY,
            pivote: elegida.localToWorld(centroLocalDe(elegida)),
            inicial: elegida.matrixWorld.clone(),
            inversaDelPadre: elegida.parent ? elegida.parent.matrixWorld.clone().invert() : new THREE.Matrix4(),
          }
          controles.enabled = false
          arrastrando = true
          // El arrastre sigue aunque el cursor se pase sobre otra cosa; sin captura, `pointerleave` lo soltaba.
          try {
            render.domElement.setPointerCapture(evento.pointerId)
          } catch {
            // Un puntero que ya no existe (eventos sintéticos) no impide mover.
          }
          return
        }
      }

      if (modoActual === 'mover' && ultimas.current.moverTodo) {
        // «Todo junto»: piel, músculo y hueso se mueven a la vez, como un solo bloque. Se hace llevando la vista
        // con el arrastre (la cámara y su punto de mira se desplazan lo que se arrastra), y no tocando cada
        // pieza: el modelo, los separadores, las pinzas, el hilo y la placa —que no son del modelo— se quedan
        // todos juntos en su sitio, que es lo que se perdía al mover los sistemas por separado.
        const golpe = superficieBajoElCursor()
        if (!golpe) {
          taller.current.decir?.('Apunte al modelo para moverlo.')
          return
        }
        moviendoTodo = true
        controles.enabled = false
        arrastrando = true
        const normal = camara.getWorldDirection(new THREE.Vector3()).negate()
        planoDeArrastre = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, golpe.point)
        rayo.ray.intersectPlane(planoDeArrastre, inicioDeArrastre)
        return
      }

      if (modoActual === 'reducir') {
        // Un clic en una pinza de reducción puesta la suelta (P-003 E5): el trozo queda donde está.
        const puesta = pinzaDeReduccionBajoElCursor()
        if (puesta) {
          soltarPinzasDeReduccion(taller.current, ultimas.current, puesta.id)
          clicParaLaPinza = null
          return
        }
      }

      if (modoActual === 'mover' || modoActual === 'reducir') {
        // Se agarra **cualquier trozo de hueso** que el rayo toque, no solo el fragmento que el caso mide
        // (D-171). Con la tibia partida en cuatro trozos, el residente quiere poder empujar el que sea; y
        // agarrar solo uno hacía que los demás «no se pudieran mover» sin decir por qué. Se busca entre los
        // huesos y no entre todas las superficies: con la piel o el músculo delante, el rayo antes agarraba
        // la piel y no pasaba nada.
        const golpe = huesoBajoElCursor()
        if (!golpe) {
          // Un clic sin arrastre en el vacío suelta el trozo elegido (`alSubirParaSoltarElTrozo`); arrastrando es la
          // órbita de siempre, y el trozo sigue con sus asas para verlo desde otro lado.
          clicEnElVacio = { x: evento.clientX, y: evento.clientY }
          if (!elegida) taller.current.decir?.('Apunte a un trozo de hueso para moverlo: Mover solo agarra el hueso visible.')
          return
        }
        const pieza = golpe.object
        // Cambiar de trozo mueve las asas sin cambiar si se ven: el lienzo solo dibuja cuando se le pide.
        if (elegida !== pieza) pedirDibujo()
        elegida = pieza
        const t = taller.current
        const origenes = (t.origenesDePiezas ??= new Map())
        if (!origenes.has(pieza)) origenes.set(pieza, { posicion: pieza.position.clone(), rotacion: pieza.rotation.clone() })
        piezaAgarrada = pieza
        // Con la pinza de reducción, un clic sin arrastre deja la pinza agarrando este trozo (se resuelve al soltar).
        clicParaLaPinza = modoActual === 'reducir' ? { x: evento.clientX, y: evento.clientY, golpe, pieza } : null
        controles.enabled = false
        arrastrando = true
        // Se arrastra sobre el plano perpendicular a la cámara que pasa por el
        // punto agarrado: es lo que hace que el hueso siga al cursor sin
        // hundirse ni salir disparado hacia el fondo.
        const normal = camara.getWorldDirection(new THREE.Vector3()).negate()
        planoDeArrastre = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, golpe.point)
        rayo.ray.intersectPlane(planoDeArrastre, inicioDeArrastre)
        posicionAlEmpezar.copy(pieza.position)
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
        if (imp.placa?.fijada) {
          t.decir?.('La placa está fijada: quítela («Quitar la placa») para poner otra.')
          return
        }
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
            `${placa.nombre} apoyada: ${placa.agujerosMm.length} agujeros. Ajústela con los controles del panel (a lo largo, de lado, angular) y pulse «Fijar la placa».` +
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
        // El orden real (P-003 E6): el medidor entra en el orificio que hizo la broca.
        if (!placa.fijada) {
          t.decir?.('Fije primero la placa (botón «Fijar la placa»): se perfora y se mide por sus agujeros.')
          return
        }
        const falta = loQueFaltaPara('medir', placa.agujeros.get(agujero))
        if (falta) {
          t.decir?.(textoDeLoQueFalta(falta, agujero, 'medir'))
          return
        }
        const medida = medirBajoElAgujero(placa, agujero, huesos)
        if (!medida) {
          t.decir?.('Bajo ese agujero no hay hueso que medir.')
          return
        }
        const antesDelHueso = placa.grosorMm + medida.distanciaAlHuesoMm
        const sugerido = largoSugerido(medida.espesorMm, antesDelHueso)
        placa.agujeros.set(agujero, { perforado: placa.agujeros.get(agujero)!.perforado, medido: { espesorMm: medida.espesorMm, sugeridoMm: sugerido } })
        decirYAvisar({
          tipo: 'medida',
          texto: `Agujero ${agujero + 1}: hueso de ${medida.espesorMm.toFixed(0)} mm${
            antesDelHueso >= 1 ? ` y ${antesDelHueso.toFixed(0)} mm de placa y holgura` : ''
          }. Pida un tornillo de ${sugerido} mm.`,
          atencion: false,
          largoSugeridoMm: sugerido,
        })
        return
      }
      if (inst.coloca?.tipo === 'tornillo' && herramienta) {
        if (inst.coloca.soloConClavo) {
          t.decir?.('Este tornillo es de bloqueo de clavo: todavía no hay clavo en el hueso del simulador. Para una placa use el cortical, el de esponjosa o el bloqueado LCP.')
          return
        }
        // El orden real (P-003 E6): placa fijada, agujero perforado y medido.
        if (!placa.fijada) {
          t.decir?.('Fije primero la placa (botón «Fijar la placa»): el tornillo va en un agujero perforado y medido.')
          return
        }
        const falta = loQueFaltaPara('atornillar', placa.agujeros.get(agujero))
        if (falta) {
          t.decir?.(textoDeLoQueFalta(falta, agujero, 'atornillar'))
          return
        }
        const calibre = avisoDeCalibre(placa.agujeros.get(agujero)!.perforado!.diametroMm, inst.coloca.diametroMm)
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
            (puesto.aviso && puesto.bicortical ? ` ${puesto.aviso}` : '') +
            (calibre ? ` ${calibre}` : ''),
          atencion: !!puesto.aviso || !!calibre,
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
      const nuevoPunto: PuntoDeSutura = {
        punto: [golpe.point.x, golpe.point.y, golpe.point.z],
        base: [golpe.point.x, golpe.point.y, golpe.point.z],
        normal: [normal.x, normal.y, normal.z],
        lado: ladoDelPunto(t, golpe.point, unidadesPorMm),
        nuevaLinea: sutura.puntos.length === 0 || !!sutura.siguienteEsNueva,
      }
      nuevoPunto.ref = seguirAlLabio(t, golpe, unidadesPorMm)
      sutura.puntos.push(nuevoPunto)
      sutura.siguienteEsNueva = false
      refrescarSutura(t, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, 'ultima', ultimas.current.alHerir)
    }

    const alMover = (evento: PointerEvent) => {
      if (!arrastrando) {
        // Lo que se levantó con un clic (separador o pinza) sigue al cursor, y el instrumento de la mano se aparta.
        if (taller.current.separadorEnLaMano || taller.current.pinzaEnLaMano) {
          llevarLoQueSeLevanto(evento)
          return
        }
        // La rueda actúa sobre el separador que está bajo el cursor (P-003 E3): sin elegirlo con un clic, que ahora lo levanta.
        if (ultimas.current.modo === 'separar' && (taller.current.separadores?.length ?? 0) > 0) {
          const ahora = performance.now()
          if (ahora - ultimaBusquedaDeSeparador > 66) {
            ultimaBusquedaDeSeparador = ahora
            aCoordenadas(evento)
            const bajo = separadorBajoElCursor()
            if (bajo && taller.current.separadorActivo !== bajo.datos.id) {
              taller.current.separadorActivo = bajo.datos.id
              ultimas.current.alSeparar?.(estadoDeLosSeparadores(taller.current))
            }
          }
        }
        // Con el inicio de una recta ya marcado, la recta provisional sigue al cursor.
        const inicio = taller.current.inicioDeLaRecta
        if (inicio && ultimas.current.modo === 'trazar') vistaPreviaDeLaRecta(evento, inicio)
        // Sin arrastre, el instrumento solo acompaña al cursor.
        seguirConLaHerramienta(evento)
        return
      }
      const { modo: modoActual } = ultimas.current
      aCoordenadas(evento)

      if (asaAgarrada) {
        moverConLaAsa(evento)
        return
      }

      if (modoActual === 'trazar' && ultimas.current.tipoDeTrazo === 'recto') {
        const desde = clicDeRecta ? { x: clicDeRecta.x, y: clicDeRecta.y } : taller.current.inicioDeLaRecta
        if (desde && Math.hypot(evento.clientX - desde.x, evento.clientY - desde.y) >= 6) vistaPreviaDeLaRecta(evento, desde)
        return
      }

      if (modoActual === 'pinzar' && levantando) {
        const t = taller.current
        const p = (t.pellizcos ?? []).find((q) => q.datos.id === levantando!.id)
        if (!p) return
        // Arrastrar hacia arriba levanta la piel: 0,12 mm por píxel, o sea unos 12 mm cada 100 px.
        if (Math.abs(levantando.y0 - evento.clientY) >= 4) levantando.movido = true
        const altura = levantando.altura0 + (levantando.y0 - evento.clientY) * 0.12
        p.datos.alturaMm = Math.min(ALTURA_MAXIMA_DEL_PELLIZCO_MM, Math.max(0, altura))
        posarPliegue(p, 1 / (ultimas.current.milimetrosPorUnidad || 1000))
        t.decir?.(`Pinza: piel levantada ${p.datos.alturaMm.toFixed(0)} mm`)
        pedirDibujo()
        return
      }

      if (modoActual === 'mover' && moviendoTodo && planoDeArrastre) {
        if (!rayo.ray.intersectPlane(planoDeArrastre, puntoAuxiliar)) return
        const delta = puntoAuxiliar.clone().sub(inicioDeArrastre)
        camara.position.sub(delta)
        controles.target.sub(delta)
        controles.update()
        pedirDibujo()
        return
      }

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

      // La broca no sigue al cursor mientras perfora: va por la trayectoria que
      // tenía al empezar, y mover el ratón con el botón pulsado no la desvía.
      if (modoActual === 'perforar') return

      if ((modoActual === 'mover' || modoActual === 'reducir') && planoDeArrastre && piezaAgarrada) {
        if (!rayo.ray.intersectPlane(planoDeArrastre, puntoAuxiliar)) return
        piezaAgarrada.position.copy(posicionAlEmpezar).add(puntoAuxiliar.clone().sub(inicioDeArrastre))
        pedirDibujo()
      }
    }

    const alSubir = (evento?: PointerEvent) => {
      if (!arrastrando) return
      arrastrando = false
      planoDeArrastre = null
      moviendoTodo = false
      controles.enabled = true

      const modoAlSoltar = ultimas.current.modo
      if (modoAlSoltar === 'trazar') {
        if (ultimas.current.tipoDeTrazo === 'recto') terminarLaRecta(evento)
        else cortarConElTrazo()
      }
      if (modoAlSoltar === 'pinzar' && levantando) {
        const t = taller.current
        const hecho = levantando
        levantando = null
        const p = (t.pellizcos ?? []).find((q) => q.datos.id === hecho.id)
        if (p && !hecho.movido) {
          // Un clic sin arrastre levanta la pinza para reubicarla (P-003 E3).
          levantarPinza(t, ultimas.current, p)
          esconderHerramienta()
        } else if (p && p.datos.alturaMm < 1.5) {
          // Una pinza que se baja hasta la piel suelta el pliegue: es la forma de quitarla con el ratón.
          soltarPellizcos(t, ultimas.current, hecho.id)
          t.decir?.('')
        } else {
          avisarPellizcos(t, ultimas.current)
          t.decir?.('')
        }
      }
      if (perforando) terminarPerforacion()

      const f = taller.current.fragmento
      const origen = taller.current.origenDelFragmento
      // Se avisa del desplazamiento, no de la posición: es lo que devuelve
      // `estadoDelFragmento` y lo que espera `colocarFragmento`, y así el dato
      // del fragmento sale por un solo camino. Sin origen no hay contra qué
      // medir y no se avisa: inventar un cero aquí es lo que hacía que un caso
      // saliera ya reducido.
      // Lo que se tocó: el trozo agarrado con el ratón o el que se movió con un asa. Los dos avisan igual.
      if (clicParaLaPinza) {
        const clic = clicParaLaPinza
        clicParaLaPinza = null
        if (evento && Math.hypot(evento.clientX - clic.x, evento.clientY - clic.y) < 5) tomarConLaPinza(clic.golpe, clic.pieza)
      }
      const tocada = piezaAgarrada ?? (asaAgarrada ? elegida : null)
      const eraElFragmento = !!f && !!tocada && (tocada === f || perteneceA(tocada, f))
      piezaAgarrada = null
      if (asaAgarrada) {
        asaAgarrada = null
        taller.current.decir?.('')
        try {
          if (evento && render.domElement.hasPointerCapture(evento.pointerId)) render.domElement.releasePointerCapture(evento.pointerId)
        } catch {
          // La captura ya se había soltado.
        }
      }
      // Mover otro trozo no cambia lo que el caso mide: solo el fragmento declarado alimenta las medidas.
      if ((ultimas.current.modo === 'mover' || ultimas.current.modo === 'reducir') && f && origen && eraElFragmento) {
        ultimas.current.alMoverFragmento?.(desplazamientoDesde(origen.posicion, f.position), {
          x: grados(f.rotation.x - origen.rotacion.x),
          y: grados(f.rotation.y - origen.rotacion.y),
          z: grados(f.rotation.z - origen.rotacion.z),
        })
      }
    }

    /**
     * La rueda. Con un instrumento que se maneja con ella, la rueda es del instrumento; con Ctrl o Mayúsculas
     * (y el pellizco del trackpad, que el navegador manda como rueda con Ctrl) acerca el modelo a mano, porque
     * `OrbitControls` tiene el zoom apagado mientras el instrumento la usa.
     */
    const alGirarLaRueda = (evento: WheelEvent) => {
      const u = ultimas.current
      if (!u.capturaLaRueda || !u.alRueda) return
      evento.preventDefault()
      // Con Mayúsculas el instrumento puede quedarse la rueda para otra cosa —las pinzas: abrir y cerrar las
      // mandíbulas—; si no la usa, la rueda acerca el modelo como siempre.
      if (evento.shiftKey && !evento.ctrlKey && !evento.metaKey && u.alRueda(evento.deltaY, true)) return
      if (evento.ctrlKey || evento.metaKey || evento.shiftKey) {
        const factor = Math.exp(Math.max(-60, Math.min(60, evento.deltaY)) * 0.0022)
        const desde = camara.position.clone().sub(controles.target)
        const distancia = Math.min(controles.maxDistance, Math.max(controles.minDistance, desde.length() * factor))
        camara.position.copy(controles.target).add(desde.setLength(distancia))
        controles.update()
        pedirDibujo()
        return
      }
      u.alRueda(evento.deltaY, false)
    }
    render.domElement.addEventListener('wheel', alGirarLaRueda, { passive: false })

    // --- el giro libre ---------------------------------------------------------------------------------
    // `OrbitControls` orbita con el «arriba» fijo, y por eso el miembro no se podía acostar. Con el giro libre
    // el arrastre gira la cámara alrededor del modelo con los ejes de la pantalla (`girarLaVista`) y no tiene
    // polos. Se hace aparte y no tocando los controles: ellos siguen haciendo el zoom y los demás gestos.
    let girando: { x: number; y: number; id: number } | null = null
    const giraLaVista = (m: Modo) => m === 'orbitar' || m === 'coser' || m === 'fijar'
    const alBajarParaGirar = (evento: PointerEvent) => {
      const u = ultimas.current
      if (!u.giroLibre || evento.button !== 0 || !giraLaVista(u.modo)) return
      girando = { x: evento.clientX, y: evento.clientY, id: evento.pointerId }
      // Seguir al puntero aunque salga del lienzo; si el navegador no lo deja (puntero ya soltado), el giro sigue igual.
      try {
        render.domElement.setPointerCapture(evento.pointerId)
      } catch {
        // sin captura
      }
    }
    const alMoverParaGirar = (evento: PointerEvent) => {
      if (!girando || evento.pointerId !== girando.id) return
      const dx = evento.clientX - girando.x
      const dy = evento.clientY - girando.y
      girando = { ...girando, x: evento.clientX, y: evento.clientY }
      if (dx === 0 && dy === 0) return
      aplicarLaPose(camara, controles, girarLaVista(poseActual(camara, controles), dx, dy))
      taller.current.posicion = undefined
      ultimas.current.alGirarLaVista?.()
      pedirDibujo()
    }
    const alSoltarParaGirar = (evento: PointerEvent) => {
      if (!girando || evento.pointerId !== girando.id) return
      girando = null
      try {
        render.domElement.releasePointerCapture(evento.pointerId)
      } catch {
        // ya estaba suelto
      }
    }
    render.domElement.addEventListener('pointerdown', alBajarParaGirar)
    render.domElement.addEventListener('pointermove', alMoverParaGirar)
    render.domElement.addEventListener('pointerup', alSoltarParaGirar)
    render.domElement.addEventListener('pointercancel', alSoltarParaGirar)

    render.domElement.addEventListener('pointerdown', alBajar)
    render.domElement.addEventListener('pointerdown', alBajarParaCoser)
    render.domElement.addEventListener('pointerup', alSubirParaCoser)
    render.domElement.addEventListener('pointerup', alSubirParaSeparar)
    render.domElement.addEventListener('pointerup', alSubirParaDisecar)
    const alSubirParaSoltarElTrozo = (evento: PointerEvent) => {
      const clic = clicEnElVacio
      clicEnElVacio = null
      if (clic && elegida && Math.hypot(evento.clientX - clic.x, evento.clientY - clic.y) < 5) {
        elegida = null
        gizmoAlDia()
        pedirDibujo()
      }
    }
    render.domElement.addEventListener('pointerup', alSubirParaSoltarElTrozo)
    // Esc deshace una línea recta que se empezó y no se terminó.
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && taller.current.inicioDeLaRecta) {
        cancelarLaRecta(taller.current)
        pedirDibujo()
      }
      // Esc devuelve a su sitio lo que se levantó con un clic y todavía no se dejó (P-003 E3).
      if (e.key === 'Escape' && (taller.current.separadorEnLaMano || taller.current.pinzaEnLaMano)) {
        devolverLoQueSeLevanto(taller.current, ultimas.current)
      }
    }
    window.addEventListener('keydown', alTeclear)
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
      // Que las asas aparezcan o desaparezcan al cambiar de modo o de submodo también pide un dibujo.
      const habiaAsas = manipulador.grupo.visible
      gizmoAlDia()
      if (manipulador.grupo.visible !== habiaAsas) sucio = true
      const movio = controles.update()
      if (!sucio && !movio) return
      sucio = false
      // La cámara pudo moverse en la línea de arriba: las asas se recolocan y se reescalan para medir lo mismo.
      gizmoAlDia()
      // Los ejes de la guía se recolocan en cada dibujo: el fragmento se mueve
      // con el ratón y la guía tiene que seguirlo.
      if (taller.current.guias) actualizarGuias(taller.current, ultimas.current.ejeLargo, ultimas.current.piezas)
      render.render(escena, camara)
      taller.current.cuadro = (taller.current.cuadro ?? 0) + 1
    })

    return () => {
      vivo = false
      render.setAnimationLoop(null)
      observador.disconnect()
      controles.removeEventListener('change', pedirDibujo)
      window.clearInterval(reloj)
      guardarSesion()
      render.domElement.removeEventListener('wheel', alGirarLaRueda)
      render.domElement.removeEventListener('pointerdown', alBajarParaGirar)
      render.domElement.removeEventListener('pointermove', alMoverParaGirar)
      render.domElement.removeEventListener('pointerup', alSoltarParaGirar)
      render.domElement.removeEventListener('pointercancel', alSoltarParaGirar)
      render.domElement.removeEventListener('pointerdown', alBajar)
      render.domElement.removeEventListener('pointerdown', alBajarParaCoser)
      render.domElement.removeEventListener('pointerup', alSubirParaCoser)
      render.domElement.removeEventListener('pointerup', alSubirParaSeparar)
      render.domElement.removeEventListener('pointerup', alSubirParaDisecar)
      render.domElement.removeEventListener('pointerup', alSubirParaSoltarElTrozo)
      window.removeEventListener('keydown', alTeclear)
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
      // Los materiales de la fluoroscopia se ponen y se quitan dentro de cada dibujo, así que a las mallas nunca
      // se les queda el de la radiografía: aquí solo se suelta lo que la imagen reservó.
      soltarFluoroscopia(taller.current.fluoroscopia)
      for (const q of taller.current.separadores ?? []) soltarSeparador(q)
      for (const q of taller.current.pellizcos ?? []) soltarPellizco(q)
      for (const q of taller.current.pinzasDeReduccion ?? []) soltarInstrumento(q.instrumento)
      cancelarLaRecta(taller.current)
      sincronizarAyudas(taller.current, false, undefined)
      // Las heridas devuelven su geometría original a la malla antes de soltar:
      // `liberar` suelta la que la malla tenga puesta, y la otra quedaría colgando.
      cerrarTodasLasHeridas(taller.current)
      quitarAgujeros(taller.current)
      if (taller.current.sutura) soltarSutura(taller.current.sutura)
      if (taller.current.implantes) quitarImplantes(taller.current.implantes)
      lectura.remove()
      manipulador.liberar()
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
    // Coser y Fijar son de **clic**, no de arrastre: el arrastre gira el modelo para coser el otro lado, como dice
    // la ayuda. Estaba apagado con el resto de modos y el residente no podía mirar la herida de frente (D-171).
    // Salir de la disección roma suelta la punta: lo que se había separado en ese apoyo vuelve a cerrarse.
    const diseccion = taller.current.diseccion
    if (modo !== 'disecar' && diseccion?.apoyada) {
      diseccion.apoyada = undefined
      diseccion.fraccion = 0
      reaplicarSeparadores(taller.current, ultimas.current)
      taller.current.decir?.('')
      ultimas.current.alDisecar?.({ capa: diseccion.capa, aperturas: diseccion.aperturas, apoyada: false, evento: 'cierre' })
    }
    // Con el giro libre el arrastre lo gira el propio lienzo (`girarLaVista`), no los controles.
    controles.enableRotate = (modo === 'orbitar' || modo === 'coser' || modo === 'fijar') && !giroLibre
    controles.enableZoom = !capturaLaRueda
    // Cambiar de modo o de forma de trazar deja sin terminar la recta que se había empezado.
    cancelarLaRecta(taller.current)
    // `OrbitControls` pone `touch-action: none` al conectarse; esto lo
    // corrige después, en cada cambio de modo (ver `gestoTactil`).
    if (taller.current.render) taller.current.render.domElement.style.touchAction = gestoTactil(modo, giroLibre)
    if (taller.current.render) {
      taller.current.render.domElement.style.cursor =
        modo === 'orbitar'
          ? 'grab'
          : modo === 'trazar' || modo === 'perforar' || modo === 'coser' || modo === 'fijar' || modo === 'disecar'
            ? 'crosshair'
            : modo === 'separar' || modo === 'pinzar'
              ? 'pointer'
              : 'move'
    }
  }, [modo, capturaLaRueda, tipoDeTrazo, giroLibre])

  // Lo que se levantó con un clic se devuelve si se sale del modo en que se levantó: seguiría «en la mano» sin
  // manera de dejarlo.
  useEffect(() => {
    const t = taller.current
    if (modo !== 'separar' && t.separadorEnLaMano) devolverLoQueSeLevanto(t, ultimas.current)
    if (modo !== 'pinzar' && t.pinzaEnLaMano) devolverLoQueSeLevanto(t, ultimas.current)
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
export function gestoTactil(modo: Modo, giroLibre = false): 'pan-y' | 'none' {
  // Con el giro libre el arrastre vertical gira al paciente: la página no puede quedarse con él.
  return modo === 'orbitar' && !giroLibre ? 'pan-y' : 'none'
}
//
// `aplicarPiezas` y `liberarMaterial` salen del módulo a propósito, aunque solo
// se usen aquí dentro: son las dos piezas de este archivo que pueden estar mal
// sin que nada lo diga —una deja una malla invisible para siempre, la otra deja
// la memoria de vídeo ocupada— y son las dos que no necesitan navegador para
// probarse. Las ejercita `tests/unit/lienzoQuirurgico.test.ts`.

export type Taller = {
  render?: THREE.WebGLRenderer
  posicion?: PosicionDelPaciente
  diseccion?: DiseccionActiva
  aplicarElCorte?: (plano: PlanoDeCorte, opciones?: OpcionesDelCorte) => number | undefined
  siguienteIncision?: number
  ultimaIncision?: number
  separadores?: SeparadorEnEscena[]
  separadorActivo?: number | null
  siguienteSeparador?: number
  separadorEnLaMano?: EnLaMano<SeparadorEnEscena>
  pinzaEnLaMano?: EnLaMano<PellizcoEnEscena>
  retracciones?: RetraccionDeMusculo[]
  siguienteRetraccion?: number
  pinzasDeReduccion?: PinzaDeReduccion[]
  siguientePinzaDeReduccion?: number
  pellizcos?: PellizcoEnEscena[]
  pellizcoActivo?: number | null
  siguientePellizco?: number
  fluoroscopia?: TallerDeFluoroscopia
  cuadro?: number
  disparos?: number
  inicioDeLaRecta?: { x: number; y: number; punto: Punto3; normal: Punto3 }
  marcaDeInicio?: THREE.Mesh
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
  aperturaAntesDeCoser?: Map<HeridaEnCapa, { mas: number; menos: number; perfil?: HeridaEnCapa['perfil'] }>
  implantes?: ImplantesEnEscena
  origenesDePiezas?: Map<THREE.Object3D, { posicion: THREE.Vector3; rotacion: THREE.Euler }>
  cortes?: CorteGuardado[]
  /** Escribe en la etiqueta que flota sobre el lienzo. */
  decir?: (texto: string) => void
}

/**
 * Un separador o una pinza que se levantó con un clic (P-003 E3, respuesta 3 del dueño): sigue al cursor hasta que
 * otro clic lo deja. `previo` guarda cómo estaba, para que Escape lo devuelva a su sitio sin perder nada.
 */
export interface EnLaMano<T extends { datos: object }> {
  objeto: T
  previo: { punto: THREE.Vector3; normal: THREE.Vector3; direccion: THREE.Vector3; mango: THREE.Vector3; datos: T['datos'] }
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
    if (!(objeto as THREE.Mesh).isMesh || !objeto.name || esDeInterfazDelModelo(objeto)) return
    salida.push({ nodo: objeto.name, datos: { ...objeto.userData } })
  })
  return salida
}

/**
 * Lo que cuelga de una malla del modelo sin ser una pieza: la cinta y el borde rojo de una herida.
 *
 * Son hijos de la malla que se cortó, y `traverse` los encuentra con las mallas de verdad. Cuando `mostrar`
 * apagaba «todo lo que no está en la lista», la cinta —que es una `Mesh` con nombre propio— se apagaba con cada
 * cambio de paso o de capa: una incisión limpia deja los dos labios pegados y la cinta es lo único que se ve, así
 * que la incisión «desaparecía» y quien iba a meter los separadores no encontraba por dónde. También se colaba en
 * la lista de piezas del editor, como si fuera un trozo más del archivo.
 */
/** Un músculo apartado por un separador, sin cortar (P-003 E10). Todo en el espacio local de la malla. */
export interface RetraccionDeMusculo {
  id: number
  nodo: string
  nombre: string
  malla: THREE.Mesh
  /** Las posiciones de antes de retraer: la cuenta parte siempre de ellas, para que cerrar devuelva lo que había. */
  original: Float32Array
  apoyo: THREE.Vector3
  direccion: THREE.Vector3
  aperturaMm: number
  maximoMm: number
}

export interface EstadoDeLasRetracciones {
  lista: { id: number; nodo: string; nombre: string; aperturaMm: number; maximoMm: number }[]
}

export const estadoDeLasRetracciones = (t: { retracciones?: RetraccionDeMusculo[] }): EstadoDeLasRetracciones => ({
  lista: (t.retracciones ?? []).map((r) => ({ id: r.id, nodo: r.nodo, nombre: r.nombre, aperturaMm: r.aperturaMm, maximoMm: r.maximoMm })),
})

/**
 * Pone las posiciones de la malla como las deja la retracción (`retraerVertices`), a partir de las originales. Si la malla
 * ya no es la de antes —un corte la partió y tiene otros vértices— la retracción se da por perdida y devuelve `false`:
 * aplicar posiciones de otra geometría la deformaría sin sentido.
 */
export function aplicarUnaRetraccion(r: RetraccionDeMusculo, unidadesPorMm: number): boolean {
  const atributo = r.malla.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!atributo || atributo.array.length !== r.original.length) return false
  retraerVertices(
    r.original,
    atributo.array as unknown as { [i: number]: number; length: number },
    [r.apoyo.x, r.apoyo.y, r.apoyo.z],
    [r.direccion.x, r.direccion.y, r.direccion.z],
    r.aperturaMm * unidadesPorMm,
    RADIO_DE_RETRACCION_MM * unidadesPorMm,
  )
  atributo.needsUpdate = true
  // Sin esto el músculo se ilumina como si no se hubiera movido y la cámara lo recorta por la caja de antes.
  r.malla.geometry.computeVertexNormals()
  r.malla.geometry.computeBoundingSphere()
  r.malla.geometry.computeBoundingBox()
  return true
}

/**
 * Apoya un separador en el borde de un músculo y lo retrae sin cortarlo (P-003 E10). Con una retracción ya puesta en ese
 * músculo la reemplaza: dos separadores en el mismo músculo se sumarían a ciegas. Tira hacia fuera de su centro, en el
 * sentido perpendicular al eje del hueso y a la superficie, que es hacia donde se aparta el borde de un músculo en un
 * abordaje.
 */
function retraerElMusculo(
  t: Taller,
  u: LoUltimo,
  golpe: { malla: THREE.Mesh; punto: THREE.Vector3; normal: THREE.Vector3 },
  instrumento: { nombre: string; maximoMm: number },
) {
  const { malla } = golpe
  const atributo = malla.geometry.getAttribute('position') as THREE.BufferAttribute
  const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
  const previa = (t.retracciones ?? []).find((r) => r.malla === malla)
  const original = previa ? previa.original : Float32Array.from(atributo.array as ArrayLike<number>)
  const eje = new THREE.Vector3(u.ejeLargo === 'x' ? 1 : 0, u.ejeLargo === 'y' ? 1 : 0, u.ejeLargo === 'z' ? 1 : 0)
  const lateral = new THREE.Vector3().crossVectors(eje, golpe.normal)
  if (lateral.lengthSq() < 1e-8) lateral.set(1, 0, 0)
  lateral.normalize()
  const centro = new THREE.Box3().setFromObject(malla).getCenter(new THREE.Vector3())
  if (golpe.punto.clone().sub(centro).dot(lateral) < 0) lateral.negate()
  const aLocal = new THREE.Matrix4().copy(malla.matrixWorld).invert()
  const nueva: RetraccionDeMusculo = {
    id: previa?.id ?? (t.siguienteRetraccion = (t.siguienteRetraccion ?? 0) + 1),
    nodo: malla.name,
    nombre: instrumento.nombre,
    malla,
    original,
    apoyo: malla.worldToLocal(golpe.punto.clone()),
    direccion: lateral.transformDirection(aLocal).normalize(),
    aperturaMm: Math.min(10, instrumento.maximoMm),
    maximoMm: instrumento.maximoMm,
  }
  t.retracciones = [...(t.retracciones ?? []).filter((r) => r !== previa), nueva]
  aplicarUnaRetraccion(nueva, unidadesPorMm)
  t.decir?.(`${nueva.nombre} apoyado en ${nueva.nodo.replace(/_/g, ' ')}: se retrae sin cortarlo (${nueva.aperturaMm} mm). La rueda lo abre o lo cierra.`)
  u.alRetraer?.(estadoDeLasRetracciones(t))
  t.pedirDibujo?.()
}

/** Abre o cierra la última retracción puesta, dentro del tope de su separador. */
function moverLaRetraccion(t: Taller, u: LoUltimo, deltaMm: number) {
  const r = (t.retracciones ?? [])[(t.retracciones ?? []).length - 1]
  if (!r) return
  r.aperturaMm = Math.min(r.maximoMm, Math.max(0, r.aperturaMm + deltaMm))
  if (!aplicarUnaRetraccion(r, 1 / (u.milimetrosPorUnidad || 1000))) t.retracciones = (t.retracciones ?? []).filter((q) => q !== r)
  t.decir?.(`${r.nombre}: ${r.nodo.replace(/_/g, ' ')} retraído ${Math.round(r.aperturaMm)} mm${r.aperturaMm >= r.maximoMm ? ' · tope del separador' : ''}`)
  u.alRetraer?.(estadoDeLasRetracciones(t))
  t.pedirDibujo?.()
}

/** Devuelve cada músculo retraído a su sitio y olvida las retracciones. */
function soltarLasRetracciones(t: Taller, u?: LoUltimo) {
  for (const r of t.retracciones ?? []) {
    const atributo = r.malla.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!atributo || atributo.array.length !== r.original.length) continue
    ;(atributo.array as Float32Array).set(r.original)
    atributo.needsUpdate = true
    r.malla.geometry.computeVertexNormals()
    r.malla.geometry.computeBoundingSphere()
    r.malla.geometry.computeBoundingBox()
  }
  const habia = (t.retracciones ?? []).length > 0
  t.retracciones = []
  if (habia) {
    u?.alRetraer?.(estadoDeLasRetracciones(t))
    t.pedirDibujo?.()
  }
}

const NOMBRE_DEL_TINTE = 'tinte-de-info'

/**
 * Pone un tinte translúcido sobre la malla de `nodo` y quita el anterior. Es otra malla hija con la misma geometría y
 * no un cambio del material de la pieza: los materiales los tocan la fluoroscopia, los colores por papel y la
 * visibilidad, y devolver el original después de todo eso era un camino a un color equivocado. Esta no se puede
 * pinchar (`raycast` vacío), para que el clic siguiente siga cayendo en la pieza y no en su tinte.
 */
export function resaltarUnNodo(taller: { raiz?: THREE.Object3D | null; pedirDibujo?: () => void }, nodo: string | null) {
  const raiz = taller.raiz
  if (!raiz) return
  const viejos: THREE.Object3D[] = []
  raiz.traverse((o) => {
    if (o.name === NOMBRE_DEL_TINTE) viejos.push(o)
  })
  for (const v of viejos) {
    v.parent?.remove(v)
    ;(v as THREE.Mesh).material instanceof THREE.Material && ((v as THREE.Mesh).material as THREE.Material).dispose()
  }
  if (nodo) {
    let destino: THREE.Mesh | null = null
    raiz.traverse((o) => {
      if (!destino && (o as THREE.Mesh).isMesh && o.name === nodo && o.visible && !esDeInterfazDelModelo(o)) destino = o as THREE.Mesh
    })
    const malla = destino as THREE.Mesh | null
    if (malla) {
      const tinte = new THREE.Mesh(
        malla.geometry,
        new THREE.MeshBasicMaterial({
          color: 0x2f7bff,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      )
      tinte.name = NOMBRE_DEL_TINTE
      tinte.userData.deInterfaz = true
      tinte.raycast = () => {}
      malla.add(tinte)
    }
  }
  taller.pedirDibujo?.()
}

export function esDeInterfazDelModelo(objeto: THREE.Object3D): boolean {
  return objeto.name === 'cinta-de-la-herida' || objeto.name === 'borde-de-la-herida' || objeto.userData.deInterfaz === true
}

/**
 * Enciende las mallas del modelo cuyo nombre está en `visibles` y apaga las demás; `null` las enciende todas.
 * No toca lo que no es una pieza (`esDeInterfazDelModelo`): la herida se ve o no según la malla que la lleva,
 * y su cinta decide sola cuándo apartarse (`actualizarCinta`).
 */
export function aplicarVisibilidad(raiz: THREE.Object3D, visibles: string[] | null) {
  raiz.traverse((objeto) => {
    if (!(objeto as THREE.Mesh).isMesh || esDeInterfazDelModelo(objeto)) return
    objeto.visible = visibles === null || visibles.includes(objeto.name)
  })
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
    grupo.userData.deAyuda = true
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
  const incisiones: ResumenDeIncision[] = []
  for (const c of taller.cortes ?? []) {
    const suyas = todas.filter((h) => h.incision === c.id)
    if (suyas.length === 0 || c.id === undefined) continue
    incisiones.push({
      id: c.id,
      capa: c.plano,
      largoMm: Math.max(...suyas.map((h) => h.largo)) / unidadesPorMm,
      aperturaMm: Math.max(...suyas.map((h) => h.mas + h.menos)) / unidadesPorMm,
    })
  }
  return {
    capas: [...(taller.heridas?.keys() ?? [])],
    largoMm: Math.max(...todas.map((h) => h.largo)) / unidadesPorMm,
    aperturaMm: Math.max(...todas.map((h) => h.mas + h.menos)) / unidadesPorMm,
    incisiones,
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
      fijada: imp.placa.fijada,
      ajuste: { ...imp.placa.ajuste },
    },
    tornillos: [...imp.tornillos.values()].map((t) => t.datos).sort((a, b) => a.agujero - b.agujero),
    agujeros: [...imp.placa.agujeros.entries()]
      .sort(([a], [b]) => a - b)
      .map(([indice, e]) => ({ indice, perforado: e.perforado, medido: e.medido })),
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
 * Cuánto abre cada labio de una herida en un punto de su largo. Sin perfil es parejo; con él, es lo que
 * manden los separadores colocados. `t` ausente se toma por la mitad de la herida.
 */
function aperturaAqui(h: HeridaEnCapa, t: number | undefined): { mas: number; menos: number } {
  return h.perfil ? h.perfil(t ?? 0.5) : { mas: h.mas, menos: h.menos }
}

// ------------------------------------------------- separadores y pinzas colocados

type LoUltimo = {
  musculoObjetivo?: { nodo: string; accion: 'cortar' | 'separar' } | null
  alRetraer?: (estado: EstadoDeLasRetracciones) => void
  milimetrosPorUnidad: number
  piezas: PiezaDelCaso[]
  ejeLargo: EjeLargo
  alSeparar?: (estado: EstadoDeLosSeparadores) => void
  alPellizcar?: (estado: EstadoDeLosPellizcos) => void
  alHerir?: (estado: EstadoDeLasHeridas | null) => void
  alCoser?: (estado: EstadoDeLaSutura | null) => void
  alTrazar?: (puntos: Punto3[]) => void
  alGesto?: (texto: string, tono: 'bien' | 'atencion' | 'grave') => void
  alDisecar?: (estado: EstadoDeLaDiseccion | null) => void
  alReducir?: (estado: EstadoDeLaReduccion) => void
}

/**
 * Las mallas que la broca puede perforar y la placa puede apoyarse en: el hueso y el fragmento, y solo los visibles.
 * La piel y el músculo se atraviesan —la broca va con su camisa de protección— y no se perforan. Sin roles
 * declarados no se sabe cuál es hueso: vale cualquier cosa que no sea piel, músculo o implante.
 */
function mallasDeHuesoVisibles(t: Taller, piezas: PiezaDelCaso[]): THREE.Mesh[] {
  const raiz = t.raiz
  if (!raiz) return []
  const rolDe = new Map(piezas.map((p) => [p.nodo, p.rol]))
  const todas: THREE.Mesh[] = []
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && m.visible) todas.push(m)
  })
  const conRol = todas.filter((m) => {
    const rol = rolDe.get(m.name)
    return rol === 'hueso' || rol === 'fragmento'
  })
  return conRol.length > 0
    ? conRol
    : todas.filter((m) => {
        const rol = rolDe.get(m.name)
        return rol !== 'piel' && rol !== 'musculo' && rol !== 'implante'
      })
}

/** Las mallas visibles de las piezas con alguno de estos papeles (la piel, el músculo). */
function mallasConRol(t: Taller, piezas: PiezaDelCaso[], roles: readonly string[]): THREE.Mesh[] {
  const raiz = t.raiz
  if (!raiz) return []
  const rolDe = new Map<string, string>(piezas.map((p) => [p.nodo, p.rol]))
  const salida: THREE.Mesh[] = []
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible || esDeInterfazDelModelo(m)) return
    const rol = rolDe.get(m.name)
    if (rol && roles.includes(rol)) salida.push(m)
  })
  return salida
}

const separadorActivo = (t: Taller): SeparadorEnEscena | undefined =>
  (t.separadores ?? []).find((s) => s.datos.id === t.separadorActivo) ?? (t.separadores ?? [])[(t.separadores ?? []).length - 1]

const pellizcoActivo = (t: Taller): PellizcoEnEscena | undefined =>
  (t.pellizcos ?? []).find((p) => p.datos.id === t.pellizcoActivo) ?? (t.pellizcos ?? [])[(t.pellizcos ?? []).length - 1]

function estadoDeLosSeparadores(t: Taller): EstadoDeLosSeparadores {
  const activo = separadorActivo(t)
  return { lista: (t.separadores ?? []).map((s) => ({ ...s.datos })), activo: activo?.datos.id ?? null }
}

function estadoDeLosPellizcos(t: Taller): EstadoDeLosPellizcos {
  const lista = (t.pellizcos ?? []).map((p) => ({ ...p.datos }))
  return { lista, activo: pellizcoActivo(t)?.datos.id ?? null, tension: tensionDeLaPiel(lista) }
}

function avisarPellizcos(t: Taller, u: LoUltimo) {
  t.pedirDibujo?.()
  u.alPellizcar?.(estadoDeLosPellizcos(t))
}

/**
 * Vuelve a abrir las heridas como mandan los separadores que hay, y a posar cada uno donde le toca. Se llama
 * al colocar, al abrir, al quitar: la herida es una función de los separadores, no una cuenta que se lleve aparte.
 */
function reaplicarSeparadores(t: Taller, u: LoUltimo) {
  const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
  const pinzas = (t.pellizcos ?? []).map((p) => p.datos)
  const roma = separadorDeLaDiseccion(t.diseccion)
  aplicarSeparadoresALasHeridas(
    t.heridas ?? new Map(),
    [...(t.separadores ?? []).map((s) => s.datos), ...(roma ? [roma] : [])],
    pinzas,
    unidadesPorMm,
  )
  for (const s of t.separadores ?? []) posarSeparador(s, unidadesPorMm)
  // Las pinzas se mueven con lo que tiran: al separarse arrastran su trozo de piel, y con las mandíbulas
  // abiertas sueltan el pliegue.
  for (const p of t.pellizcos ?? []) posarPliegue(p, unidadesPorMm)
  // Si hay puntadas, la herida se vuelve a cerrar sobre la apertura nueva: se olvida la base de antes.
  if (t.sutura && t.sutura.puntos.length > 0) {
    t.aperturaAntesDeCoser = undefined
    refrescarSutura(t, u.milimetrosPorUnidad, u.alCoser, null, u.alHerir)
  }
  u.alHerir?.(estadoDeLasHeridas(t, u.milimetrosPorUnidad))
  u.alSeparar?.(estadoDeLosSeparadores(t))
  t.pedirDibujo?.()
}

function cambiarApertura(t: Taller, s: SeparadorEnEscena, mm: number, u: LoUltimo) {
  s.datos.aperturaMm = limitarApertura(mm, s.datos.maximoMm)
  t.separadorActivo = s.datos.id
  reaplicarSeparadores(t, u)
  t.decir?.(`${s.datos.nombre}: abierto ${s.datos.aperturaMm} mm${s.datos.aperturaMm >= s.datos.maximoMm ? ' · tope del separador' : ''}`)
}

/** Quita un separador, o todos. La herida se cierra en lo que ese separador abría. */
function quitarSeparadores(t: Taller, u: LoUltimo, id?: number) {
  const todos = t.separadores ?? []
  const quedan: SeparadorEnEscena[] = []
  for (const s of todos) {
    if (id === undefined || s.datos.id === id) soltarSeparador(s)
    else quedan.push(s)
  }
  t.separadores = quedan
  if (t.separadorEnLaMano && !quedan.includes(t.separadorEnLaMano.objeto)) t.separadorEnLaMano = undefined
  if (!quedan.some((s) => s.datos.id === t.separadorActivo)) t.separadorActivo = quedan[quedan.length - 1]?.datos.id ?? null
  reaplicarSeparadores(t, u)
}

function soltarPellizcos(t: Taller, u: LoUltimo, id?: number) {
  const quedan: PellizcoEnEscena[] = []
  for (const p of t.pellizcos ?? []) {
    if (id === undefined || p.datos.id === id) soltarPellizco(p)
    else quedan.push(p)
  }
  t.pellizcos = quedan
  if (t.pinzaEnLaMano && !quedan.includes(t.pinzaEnLaMano.objeto)) t.pinzaEnLaMano = undefined
  if (!quedan.some((p) => p.datos.id === t.pellizcoActivo)) t.pellizcoActivo = quedan[quedan.length - 1]?.datos.id ?? null
  // Sin la pinza, la piel ya no está tensa: la herida deja de abrirse con lo que ella tiraba.
  reaplicarSeparadores(t, u)
  avisarPellizcos(t, u)
}

/** Separa (o junta) las dos pinzas de la pareja: tiran de los bordes de la piel hacia fuera. */
function separarLasPinzas(t: Taller, u: LoUltimo, deltaMm: number) {
  const lista = t.pellizcos ?? []
  if (lista.length === 0) return
  const actual = Math.max(...lista.map((p) => p.datos.separacionMm))
  const nueva = limitarSeparacionDePinzas(actual + deltaMm)
  for (const p of lista) p.datos.separacionMm = nueva
  reaplicarSeparadores(t, u)
  t.decir?.(`Pinzas separadas ${nueva.toFixed(0)} mm cada una${nueva >= SEPARACION_MAXIMA_DE_PINZAS_MM ? ' · tope' : ''}`)
  avisarPellizcos(t, u)
}

/** Abre (`sentido` +1) o cierra (−1) las mandíbulas de las pinzas, una muesca: abiertas sueltan la piel. */
function abrirLasMandibulas(t: Taller, u: LoUltimo, sentido: number) {
  const lista = t.pellizcos ?? []
  if (lista.length === 0) return
  const nuevo = limitarAgarre(Math.min(...lista.map((p) => p.datos.agarre)) - sentido * PASO_DE_AGARRE)
  for (const p of lista) p.datos.agarre = nuevo
  reaplicarSeparadores(t, u)
  t.decir?.(
    nuevo < AGARRE_MINIMO_PARA_SOSTENER
      ? 'Mandíbulas abiertas: las pinzas sueltan la piel.'
      : `Mandíbulas cerradas al ${Math.round(nuevo * 100)} %`,
  )
  avisarPellizcos(t, u)
}

/**
 * La separación que hace la tijera en disección roma, como si fuera un separador: abre el plano que se disecó,
 * en el punto donde está apoyada la punta, mientras las ramas están abiertas, y nada más.
 */
function separadorDeLaDiseccion(d: DiseccionActiva | undefined): SeparadorColocado | null {
  if (!d?.apoyada?.separo || d.fraccion <= 0) return null
  return {
    id: -1,
    instrumentoId: '',
    nombre: 'Disección roma',
    tipo: 'roma',
    plano: d.capa,
    lado: 0,
    posicion: d.posicion,
    maximoMm: d.maximoMm,
    aperturaMm: aperturaPorLabioEnMm(d.fraccion, d.maximoMm),
    incision: d.incision,
  }
}

/** En qué lugar de la herida de la disección cae la punta apoyada: el del nodo más cercano. */
function posicionDelApoyo(d: DiseccionActiva): number {
  if (!d.apoyada || d.nodos.length === 0 || d.posiciones.length === 0) return 0.5
  let mejor = 0
  let cerca = Infinity
  d.nodos.forEach((n, i) => {
    const distancia = d.apoyada!.punto.distanceTo(new THREE.Vector3(...n.punto))
    if (distancia < cerca) {
      cerca = distancia
      mejor = i
    }
  })
  return d.posiciones[mejor] ?? 0.5
}

/**
 * Abre las ramas de la tijera en disección roma, de 0 a 1.
 *
 * La primera vez que se pasan de un umbral con la punta apoyada, ese punto entra en la herida del plano (la herida
 * es la línea que pasa por todos los puntos donde se separó) y el plano se abre ahí por tensión, sin cortar.
 * Con las ramas cerradas la herida sigue, pero con los labios juntos: lo disecado queda disecado.
 */
function abrirLaDiseccion(t: Taller, u: LoUltimo, fraccion: number) {
  const d = t.diseccion
  const f = Math.min(1, Math.max(0, fraccion))
  if (!d?.apoyada) {
    if (f > 0.05) t.decir?.('Primero apoye la punta en el tejido con un clic; después se abren las ramas.')
    return
  }
  d.fraccion = f
  const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
  if (separaElPlano(f) && !d.apoyada.separo && d.apoyada.sobreHerida) {
    // Sobre una herida que ya estaba: se abre por donde está la punta, y si la punta está lejos de ella no hay nada
    // que abrir. No se rehace la herida.
    let mejor: NonNullable<ReturnType<typeof ladoDeLaHerida>> | null = null
    let incisionCercana: number | undefined
    for (const h of t.heridas?.get(d.capa) ?? []) {
      const info = ladoDeLaHerida(h, d.apoyada.punto)
      if (info && (!mejor || info.cerca < mejor.cerca)) {
        mejor = info
        incisionCercana = h.incision
      }
    }
    if (!mejor || mejor.cerca > 30 * unidadesPorMm) {
      t.decir?.('La punta está lejos de la herida de este plano: apóyela dentro de la herida para abrirla por tensión.')
      return
    }
    d.apoyada.separo = true
    d.aperturas++
    d.posicion = mejor.t
    d.incision = incisionCercana
    u.alGesto?.(textoDeLaDiseccion(d.capa, d.aperturas), 'bien')
    u.alDisecar?.({ capa: d.capa, aperturas: d.aperturas, apoyada: true, evento: 'separo' })
  } else if (separaElPlano(f) && !d.apoyada.separo) {
    d.apoyada.separo = true
    const ultimo = d.nodos[d.nodos.length - 1]
    const nuevo: NodoDeDiseccion = {
      punto: [d.apoyada.punto.x, d.apoyada.punto.y, d.apoyada.punto.z],
      normal: [d.apoyada.normal.x, d.apoyada.normal.y, d.apoyada.normal.z],
    }
    // Abrir otra vez sin avanzar es abrir en el mismo sitio: no añade un punto a la línea.
    if (avanzo(ultimo?.punto, nuevo.punto, unidadesPorMm)) d.nodos.push(nuevo)
    d.aperturas++
    reconstruirLaDiseccion(t, u, d)
    u.alGesto?.(textoDeLaDiseccion(d.capa, d.aperturas), 'bien')
    u.alDisecar?.({ capa: d.capa, aperturas: d.aperturas, apoyada: true, evento: 'separo' })
  }
  if (!d.apoyada.sobreHerida) d.posicion = posicionDelApoyo(d)
  reaplicarSeparadores(t, u)
  if (d.apoyada.separo) t.decir?.(`Disección roma: ramas abiertas ${Math.round(f * d.maximoMm)} mm`)
}

/**
 * Rehace la herida del plano con la línea que pasa por los puntos donde se separó. Cada punto de la línea se
 * lleva a la superficie del plano (la piel o el músculo) bajando por la normal, para que la herida siga la
 * curva del miembro y no la cuerda entre dos apoyos. La herida se hace con el mismo corte que la incisión: sin
 * sangre ni puntuación, la diferencia es lo que se le dice a quien la hizo.
 */
function reconstruirLaDiseccion(t: Taller, u: LoUltimo, d: DiseccionActiva) {
  const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
  const eje = VECTOR_DEL_EJE[u.ejeLargo]
  const trazo = trazoDeLaDiseccion(d.nodos, [eje.x, eje.y, eje.z], unidadesPorMm)
  const mallas = mallasConRol(t, u.piezas, [d.capa])
  const lanzador = new THREE.Raycaster()
  const puntos: Punto3[] = []
  const normales: Punto3[] = []
  trazo.puntos.forEach((p, i) => {
    const n = new THREE.Vector3(...trazo.normales[i])
    lanzador.set(new THREE.Vector3(...p).addScaledVector(n, 8 * unidadesPorMm), n.clone().negate())
    lanzador.far = 20 * unidadesPorMm
    const g = lanzador.intersectObjects(mallas, false)[0]
    if (g) {
      const normal = g.face ? g.face.normal.clone().transformDirection(g.object.matrixWorld) : n.clone()
      if (normal.dot(n) < 0) normal.negate()
      puntos.push({ x: g.point.x, y: g.point.y, z: g.point.z })
      normales.push({ x: normal.x, y: normal.y, z: normal.z })
    } else {
      puntos.push({ x: p[0], y: p[1], z: p[2] })
      normales.push({ x: n.x, y: n.y, z: n.z })
    }
  })
  t.puntosDelTrazo = puntos
  t.normalesDelTrazo = normales
  d.posiciones = trazo.posiciones
  // La herida de la disección es una incisión propia que se rehace con cada punto nuevo: reemplaza a la suya, no se
  // suma a las demás (P-003 E4).
  d.incision = t.aplicarElCorte?.(d.capa, { deDiseccion: true, reemplaza: d.incision })
  // La disección no deja trazo de guía: la herida es lo que se ve.
  t.puntosDelTrazo = []
  t.normalesDelTrazo = []
  dibujarTrazo(t)
  u.alTrazar?.([])
}

/**
 * Baja un separador ya puesto a otro plano, o lo sube (petición de Cristóbal): para separar el músculo se toma
 * uno que esté puesto en la piel y se apoya más profundo. La hoja se baja por la normal hasta la superficie del
 * músculo y queda en el lado de la herida que ya sostenía; el sitio de cada plano se recuerda.
 */
function cambiarElPlanoDelSeparador(t: Taller, u: LoUltimo, id: number, plano: CapaDeLaHerida) {
  const s = (t.separadores ?? []).find((q) => q.datos.id === id)
  if (!s) return
  if (s.datos.tipo === 'palanca') {
    t.decir?.('El Hohmann se apoya en el hueso: no cambia de plano.')
    return
  }
  if (s.datos.plano === plano) return
  const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
  const heridas = t.heridas?.get(plano) ?? []
  if (heridas.length === 0) {
    t.decir?.(
      plano === 'musculo'
        ? 'Todavía no hay herida en el músculo: ábrala con el bisturí profundo o con la disección roma.'
        : 'No hay herida en la piel.',
    )
    return
  }
  let sitio: SitioDeSeparador | undefined = s.sitios[plano]
  if (!sitio) {
    // Hacia dentro desde la piel, o hacia fuera desde el músculo, por la normal de donde está apoyado ahora.
    const hacia = s.normal.clone().multiplyScalar(plano === 'musculo' ? -1 : 1)
    const origen = s.punto.clone().addScaledVector(s.normal, (plano === 'musculo' ? 1 : -1) * unidadesPorMm)
    const g = new THREE.Raycaster(origen, hacia, 0, 80 * unidadesPorMm).intersectObjects(mallasConRol(t, u.piezas, [plano]), false)[0]
    const punto = g ? g.point.clone() : s.punto.clone()
    const normal = g?.face ? g.face.normal.clone().transformDirection(g.object.matrixWorld) : s.normal.clone()
    if (normal.dot(s.normal) < 0) normal.negate()
    let mejor: NonNullable<ReturnType<typeof ladoDeLaHerida>> | null = null
    for (const h of heridas) {
      const info = ladoDeLaHerida(h, punto)
      if (info && (!mejor || info.cerca < mejor.cerca)) mejor = info
    }
    if (!mejor || mejor.cerca > 40 * unidadesPorMm) {
      t.decir?.(`Ahí no hay herida ${enElPlano(plano)}: el separador se queda donde está.`)
      return
    }
    sitio = { punto, normal, direccion: mejor.direccion.clone(), posicion: mejor.t }
    s.sitios[plano] = sitio
  }
  s.datos.plano = plano
  apoyarSeparadorEn(s, sitio, s.datos.lado)
  const m = direccionDelMango([sitio.normal.x, sitio.normal.y, sitio.normal.z], [sitio.direccion.x, sitio.direccion.y, sitio.direccion.z], s.datos.lado)
  s.mango = new THREE.Vector3(m[0], m[1], m[2])
  reaplicarSeparadores(t, u)
  t.decir?.(`${s.datos.nombre}: apoyado ${enElPlano(plano)}.`)
}

// ------------------------------------------------ levantar y dejar, y acompañar al bisturí (P-003 E3)

/**
 * Pone un instrumento translúcido (o lo devuelve a como estaba): la vista previa de lo que se lleva en la mano. Se
 * guarda lo anterior en el `userData` de cada material para devolverlo exacto, también si ya era transparente.
 */
function atenuarInstrumento(grupo: THREE.Object3D, atenuar: boolean) {
  grupo.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
      if (atenuar) {
        if (material.userData.antesDeAtenuar) continue
        material.userData.antesDeAtenuar = { transparent: material.transparent, opacity: material.opacity }
        material.transparent = true
        material.opacity = 0.5
      } else if (material.userData.antesDeAtenuar) {
        const antes = material.userData.antesDeAtenuar as { transparent: boolean; opacity: number }
        material.transparent = antes.transparent
        material.opacity = antes.opacity
        delete material.userData.antesDeAtenuar
      }
      material.needsUpdate = true
    }
  })
}

/**
 * Levanta un separador puesto: queda en la mano, atenuado, y la herida se cierra en lo que él abría (su apertura
 * se le devuelve al dejarlo). Con otra cosa ya en la mano no se levanta nada: de a una.
 */
function levantarSeparador(t: Taller, u: LoUltimo, s: SeparadorEnEscena) {
  if (t.separadorEnLaMano || t.pinzaEnLaMano) return
  t.separadorEnLaMano = {
    objeto: s,
    previo: { punto: s.punto.clone(), normal: s.normal.clone(), direccion: s.direccion.clone(), mango: s.mango.clone(), datos: { ...s.datos } },
  }
  t.separadorActivo = s.datos.id
  s.datos.aperturaMm = 0
  atenuarInstrumento(s.instrumento.grupo, true)
  reaplicarSeparadores(t, u)
  t.decir?.(`${s.datos.nombre} en la mano: haga clic junto al borde donde lo quiere dejar (Esc lo devuelve).`)
}

/** Levanta una pinza: suelta el pliegue (mandíbulas abiertas) y queda en la mano hasta que un clic la deja. */
function levantarPinza(t: Taller, u: LoUltimo, p: PellizcoEnEscena) {
  if (t.separadorEnLaMano || t.pinzaEnLaMano) return
  t.pinzaEnLaMano = {
    objeto: p,
    previo: { punto: p.punto.clone(), normal: p.normal.clone(), direccion: p.direccion.clone(), mango: p.mango.clone(), datos: { ...p.datos } },
  }
  t.pellizcoActivo = p.datos.id
  p.datos.agarre = 0
  atenuarInstrumento(p.instrumento.grupo, true)
  reaplicarSeparadores(t, u)
  avisarPellizcos(t, u)
  t.decir?.('Pinza en la mano: haga clic junto al borde donde la quiere dejar (Esc la devuelve).')
}

/** Escape (o salir del modo): lo que se levantó vuelve exactamente a donde estaba, con lo que tenía. */
function devolverLoQueSeLevanto(t: Taller, u: LoUltimo) {
  const sep = t.separadorEnLaMano
  if (sep) {
    const s = sep.objeto
    s.punto = sep.previo.punto
    s.normal = sep.previo.normal
    s.direccion = sep.previo.direccion
    s.mango = sep.previo.mango
    Object.assign(s.datos, sep.previo.datos)
    t.separadorEnLaMano = undefined
    atenuarInstrumento(s.instrumento.grupo, false)
    reaplicarSeparadores(t, u)
    t.decir?.(`${s.datos.nombre} devuelto a su sitio.`)
  }
  const pin = t.pinzaEnLaMano
  if (pin) {
    const p = pin.objeto
    p.punto = pin.previo.punto
    p.normal = pin.previo.normal
    p.direccion = pin.previo.direccion
    p.mango = pin.previo.mango
    Object.assign(p.datos, pin.previo.datos)
    t.pinzaEnLaMano = undefined
    atenuarInstrumento(p.instrumento.grupo, false)
    reaplicarSeparadores(t, u)
    avisarPellizcos(t, u)
    t.decir?.('Pinza devuelta a su sitio.')
  }
}

/**
 * «Acompañar el bisturí» (P-003 E3, respuesta 4 del dueño: pinzas **y** separadores). Al terminar un corte, la
 * pareja de separadores y la pareja de pinzas más cercanas a la punta se corren a lo largo de la herida nueva,
 * unos 15 mm por detrás de la punta, **sin cambiar de borde ni de apertura**.
 *
 * Se hace al terminar el corte y no mientras se traza porque la herida solo existe cuando el trazo se cierra: a
 * mano alzada o en recta, lo que hay durante el arrastre es la línea de guía. Con la incisión por tramos (E4), cada
 * tramo hace que la pareja avance tras él.
 */
function acompanarAlCorte(t: Taller, u: LoUltimo, capa: PlanoDeCorte, incision: number) {
  const herida = (t.heridas?.get(capa) ?? []).find((h) => h.incision === incision)
  if (!herida) return
  const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
  const largoMm = herida.largo / unidadesPorMm
  const tObjetivo = posicionQueAcompana(1, largoMm, RETRASO_AL_ACOMPANAR_MM)
  const sitio = sitioEnLaHerida(herida, tObjetivo, 1)
  if (!sitio) return
  // Los de mano de esa capa que están más cerca de la punta, que se mueven juntos (una pareja comparte posición).
  const propios = (t.separadores ?? []).filter(
    (s) => s.datos.tipo !== 'roma' && s.datos.plano === capa && (s.datos.incision === undefined || s.datos.incision === incision),
  )
  const masAdelantado = propios.reduce((m, s) => Math.max(m, s.datos.posicion), -1)
  const grupo = propios.filter((s) => masAdelantado - s.datos.posicion < 0.08)
  for (const s of grupo) {
    const lado = s.datos.lado
    s.punto = sitio.punto.clone()
    s.normal = sitio.normal.clone()
    s.direccion = sitio.direccion.clone().multiplyScalar(lado === 0 ? 1 : lado)
    const m = direccionDelMango([sitio.normal.x, sitio.normal.y, sitio.normal.z], [sitio.direccion.x, sitio.direccion.y, sitio.direccion.z], lado)
    s.mango = new THREE.Vector3(m[0], m[1], m[2])
    s.datos.posicion = sitio.t
    s.sitios[capa] = { punto: sitio.punto.clone(), normal: sitio.normal.clone(), direccion: sitio.direccion.clone(), posicion: sitio.t }
  }
  // Las pinzas toman la piel: solo siguen a un corte de la piel.
  let pinzasMovidas = 0
  if (capa === 'piel') {
    for (const p of t.pellizcos ?? []) {
      if (p.datos.lado === 0 || (p.datos.incision !== undefined && p.datos.incision !== incision)) continue
      const mm = sitioEnLaHerida(herida, tObjetivo, p.datos.lado)
      if (!mm) continue
      // A los 4 mm del borde, como cuando se ponen sobre una herida ya abierta.
      p.punto = mm.punto.clone().addScaledVector(mm.direccion, 4 * unidadesPorMm)
      p.normal = mm.normal.clone()
      p.direccion = mm.direccion.clone()
      p.mango = mm.normal.clone().multiplyScalar(0.6).addScaledVector(mm.direccion, 0.7).normalize()
      p.datos.posicion = mm.t
      pinzasMovidas++
    }
  }
  if (grupo.length === 0 && pinzasMovidas === 0) return
  reaplicarSeparadores(t, u)
  t.decir?.('Las pinzas y los separadores acompañan al bisturí.')
}

// --------------------------------------------- pinza de reducción: agarra y mueve (P-003 E5)

/** ¿El arrastre de un clic mueve un trozo suelto, con asas? «Mover → Un trozo» y «Reducir» sí; «Todo junto», no. */
function muevePorTrozo(modo: Modo, moverTodo: boolean): boolean {
  return modo === 'reducir' || (modo === 'mover' && !moverTodo)
}

function estadoDeLaReduccion(t: Taller): EstadoDeLaReduccion {
  return { pinzas: (t.pinzasDeReduccion ?? []).map((p) => ({ id: p.id, nombre: p.nombre, pieza: p.pieza.name })) }
}

/** Suelta una pinza de reducción, o todas: el trozo queda donde está, sin la pinza. */
function soltarPinzasDeReduccion(t: Taller, u: LoUltimo, id?: number) {
  const quedan: PinzaDeReduccion[] = []
  for (const p of t.pinzasDeReduccion ?? []) {
    if (id === undefined || p.id === id) soltarInstrumento(p.instrumento)
    else quedan.push(p)
  }
  const habia = (t.pinzasDeReduccion ?? []).length
  t.pinzasDeReduccion = quedan
  if (habia !== quedan.length) {
    u.alReducir?.(estadoDeLaReduccion(t))
    t.decir?.('Pinza soltada.')
    t.pedirDibujo?.()
  }
}

// ------------------------------------------------------------ incisiones (P-003 E4)

/**
 * Cierra todas las heridas de una incisión —de la última a la primera, para no rehacer lo que se va a cerrar— y la
 * saca de las listas. Con `conSusSeparadores: false` se llevan también sus separadores y sus pinzas (sin herida no
 * tienen dónde estar); con `true` se quedan, porque la incisión se va a volver a hacer con el mismo id (alargada o
 * reemplazada).
 *
 * Si cerrar una del medio obliga a rehacer otras de la misma malla y alguna ya no se deja cortar, esas heridas se
 * sueltan también de las listas: es lo único que se puede hacer con una herida que no existe.
 */
function cerrarLaIncision(t: Taller, id: number, opciones: { conSusSeparadores: boolean }) {
  const suyas = todasLasHeridas(t).filter((h) => h.incision === id)
  const perdidas = new Set<HeridaEnCapa>()
  for (const h of [...suyas].reverse()) for (const p of cerrarCapa(h)) perdidas.add(p)
  const heridas = t.heridas ?? new Map<PlanoDeCorte, HeridaEnCapa[]>()
  for (const [capa, lista] of [...heridas.entries()]) {
    const quedan = lista.filter((h) => h.incision !== id && !perdidas.has(h))
    if (quedan.length === 0) heridas.delete(capa)
    else heridas.set(capa, quedan)
  }
  t.cortes = (t.cortes ?? []).filter((c) => c.id !== id)
  if (t.ultimaIncision === id) {
    t.ultimaIncision = t.cortes[t.cortes.length - 1]?.id
    t.ultimaHerida = t.cortes[t.cortes.length - 1]?.plano
  }
  if (!opciones.conSusSeparadores) {
    const quedanSep: SeparadorEnEscena[] = []
    for (const s of t.separadores ?? []) {
      if (s.datos.incision === id) soltarSeparador(s)
      else quedanSep.push(s)
    }
    t.separadores = quedanSep
    if (t.separadorEnLaMano && !quedanSep.includes(t.separadorEnLaMano.objeto)) t.separadorEnLaMano = undefined
    if (!quedanSep.some((s) => s.datos.id === t.separadorActivo)) t.separadorActivo = quedanSep[quedanSep.length - 1]?.datos.id ?? null
    const quedanPin: PellizcoEnEscena[] = []
    for (const p of t.pellizcos ?? []) {
      if (p.datos.incision === id) soltarPellizco(p)
      else quedanPin.push(p)
    }
    t.pellizcos = quedanPin
    if (t.pinzaEnLaMano && !quedanPin.includes(t.pinzaEnLaMano.objeto)) t.pinzaEnLaMano = undefined
    if (!quedanPin.some((p) => p.datos.id === t.pellizcoActivo)) t.pellizcoActivo = quedanPin[quedanPin.length - 1]?.datos.id ?? null
  }
  actualizarLaProfundidad(t)
}

/**
 * Las heridas de la piel dejan de ser «la incisión recién hecha» cuando hay una más profunda: el borde rojo pasa al
 * tono de la piel (P-003 E4, pedido de Cristóbal: «el trazo rojo de la incisión se queda al profundizar; tiene que
 * desaparecer»).
 */
function actualizarLaProfundidad(t: Taller) {
  const hayProfunda = (t.heridas?.get('musculo')?.length ?? 0) > 0
  for (const h of t.heridas?.get('piel') ?? []) {
    if (!!h.profundizada === hayProfunda) continue
    h.profundizada = hayProfunda
    refrescarBordes(h)
  }
}

/** La escena tal como la necesita la radiografía. */
function contextoDeRadiografia(t: Taller): EscenaParaRadiografia | null {
  if (!t.escena) return null
  return { escena: t.escena, raiz: t.raiz, rolesAplicados: t.rolesAplicados }
}

/** Deshace una línea recta empezada: la marca de inicio y el trazo de guía. */
function cancelarLaRecta(t: Taller) {
  if (t.marcaDeInicio) {
    t.marcaDeInicio.removeFromParent()
    t.marcaDeInicio.geometry.dispose()
    ;(t.marcaDeInicio.material as THREE.Material).dispose()
    t.marcaDeInicio = undefined
  }
  if (t.inicioDeLaRecta) {
    t.inicioDeLaRecta = undefined
    t.decir?.('')
  }
}

/** Un corte hecho con el bisturí, tal como se guarda para volver a hacerlo. */
export interface CorteGuardado {
  plano: PlanoDeCorte
  puntos: [number, number, number][]
  normales: [number, number, number][]
  /** El número de la incisión (P-003 E4). Las sesiones de antes no lo traen: se les da uno al recargar. */
  id?: number
  /** El borde quedó quemado por el electrobisturí. */
  quemado?: boolean
}

/** Lo cortado y cosido, en el formato que va a `sessionStorage`. */
interface SesionGuardada {
  /** La 1 guardaba una sola herida por capa y sin número; la 2, todas las incisiones con el suyo (P-003 E4). */
  v: 1 | 2
  cortes: CorteGuardado[]
  /** Cuánto está abierta cada herida, en el orden de `todasLasHeridas`, en unidades del mundo. */
  apertura: { mas: number; menos: number }[]
  aperturaAntesDeCoser: ({ mas: number; menos: number } | null)[] | null
  sutura: {
    hilo: HiloDeSutura
    tension: number
    puntos: {
      base: [number, number, number]
      normal: [number, number, number]
      lado: 1 | -1 | 0
      nuevaLinea: boolean
      /** `herida` es el lugar de la herida en la lista y no su `uuid`, que cambia al recargar. */
      ref?: { herida: number; dir: [number, number, number]; lado: 1 | -1; peso: number; t?: number; mas0: number; menos0: number }
    }[]
  } | null
}

/**
 * Lo que hay hecho sobre el paciente, o `''` si no hay nada que recordar.
 *
 * Los cortes se guardan con su trazo y no con la geometría resultante: es lo que hace falta para volver a
 * cortar el mismo modelo, y son unas decenas de puntos y no cientos de miles de vértices.
 */
export function serializarSesion(taller: Taller): string {
  const heridas = todasLasHeridas(taller)
  const cortes = taller.cortes ?? []
  const sutura = taller.sutura
  const hayPuntos = !!sutura && sutura.puntos.length > 0
  if (cortes.length === 0 && !hayPuntos) return ''
  const indice = new Map(heridas.map((h, i) => [h.malla.uuid, i]))
  const datos: SesionGuardada = {
    v: 2,
    cortes,
    apertura: heridas.map((h) => ({ mas: h.mas, menos: h.menos })),
    aperturaAntesDeCoser: taller.aperturaAntesDeCoser
      ? heridas.map((h) => taller.aperturaAntesDeCoser?.get(h) ?? null)
      : null,
    sutura:
      sutura && hayPuntos
        ? {
            hilo: sutura.hilo,
            tension: sutura.tension,
            puntos: sutura.puntos.map((q) => ({
              base: (q.base ?? q.punto) as [number, number, number],
              normal: q.normal as [number, number, number],
              lado: q.lado,
              nuevaLinea: q.nuevaLinea,
              ref:
                q.ref && indice.has(q.ref.malla)
                  ? {
                      herida: indice.get(q.ref.malla) as number,
                      dir: q.ref.dir as [number, number, number],
                      lado: q.ref.lado,
                      peso: q.ref.peso,
                      t: q.ref.t,
                      mas0: q.ref.mas0,
                      menos0: q.ref.menos0,
                    }
                  : undefined,
            })),
          }
        : null,
  }
  return JSON.stringify(datos)
}

/**
 * Cómo sigue una puntada al labio de la herida donde se picó (D-171).
 *
 * Se busca la herida de la malla que se picó y, en ella, el labio más cercano: de ahí salen hacia dónde se
 * separa, a qué lado cae y cuánto de lo que el labio se mueve le llega (el peso baja con la distancia, igual
 * que `cortarMalla` al abrir). Sin herida cerca, la puntada no sigue a nada.
 */
function seguirAlLabio(taller: Taller, golpe: THREE.Intersection, unidadesPorMm: number): PuntoDeSutura['ref'] {
  let mejor: { h: HeridaEnCapa; info: NonNullable<ReturnType<typeof ladoDeLaHerida>> } | null = null
  for (const h of todasLasHeridas(taller)) {
    if (h.malla !== golpe.object) continue
    const info = ladoDeLaHerida(h, golpe.point)
    if (info && (!mejor || info.cerca < mejor.info.cerca)) mejor = { h, info }
  }
  if (!mejor || mejor.info.cerca > 25 * unidadesPorMm) return undefined
  const alcance = 30 * unidadesPorMm
  const x = Math.min(1, mejor.info.cerca / alcance)
  const peso = 1 - x * x * (3 - 2 * x)
  const d = mejor.info.direccion
  // Con separadores colocados la herida no abre igual en todo su largo: la puntada sigue lo que abre el
  // labio **en su sitio** (la posición `t` a lo largo de la herida), no el máximo.
  const aqui = aperturaAqui(mejor.h, mejor.info.t)
  return {
    malla: mejor.h.malla.uuid,
    dir: [d.x, d.y, d.z],
    lado: mejor.info.lado,
    peso,
    t: mejor.info.t,
    mas0: aqui.mas,
    menos0: aqui.menos,
  }
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
  /** Para decirle a la consola cuánto queda abierta la herida cuando la sutura la cierra: sin esto el panel de la herida seguía diciendo lo de antes. */
  alHerir?: (estado: EstadoDeLasHeridas | null) => void,
) {
  const sutura = taller.sutura
  if (!sutura) return
  const unidadesPorMm = 1 / (milimetrosPorUnidad || 1000)
  const heridas = todasLasHeridas(taller)
  // Las medidas son las de donde se picó, no las de donde queda al tirar del hilo: al cerrarse la herida las
  // puntadas se acercan, y medirlas así las daría por «muy juntas».
  const medida = medirLaSutura(
    sutura.puntos.map((p) => ({ ...p, punto: p.base ?? p.punto })),
    milimetrosPorUnidad,
  )
  const largoMm = heridas.length > 0 ? Math.max(...heridas.map((h) => h.largo)) / unidadesPorMm : 0
  const cierreMaximo = cierreDeLaHerida(medida.cruces, largoMm)
  const cierre = cierreConTension(medida.cruces, largoMm, sutura.tension)

  if (heridas.length > 0) {
    if (cierre > 0 && !taller.aperturaAntesDeCoser) {
      taller.aperturaAntesDeCoser = new Map(heridas.map((h) => [h, { mas: h.mas, menos: h.menos, perfil: h.perfil }]))
    }
    const antes = taller.aperturaAntesDeCoser
    if (antes) {
      for (const h of heridas) {
        const base = antes.get(h)
        if (!base) continue
        const factor = 1 - cierre
        const perfil = base.perfil
        abrirCapa(
          h,
          base.mas * factor,
          base.menos * factor,
          perfil
            ? (t) => {
                const o = perfil(t)
                return { mas: o.mas * factor, menos: o.menos * factor }
              }
            : undefined,
        )
      }
      if (cierre === 0) taller.aperturaAntesDeCoser = undefined
      alHerir?.(estadoDeLasHeridas(taller, milimetrosPorUnidad))
    }
  }

  // Cada puntada se va con el labio al que está cosida: cuando la herida se cierra, el hilo la acompaña.
  for (const p of sutura.puntos) {
    if (!p.base || !p.ref) continue
    const ref = p.ref
    const h = heridas.find((x) => x.malla.uuid === ref.malla)
    if (!h) {
      p.punto = [...p.base]
      continue
    }
    const aqui = aperturaAqui(h, ref.t)
    const movimiento = (ref.lado > 0 ? aqui.mas - ref.mas0 : -(aqui.menos - ref.menos0)) * ref.peso
    p.punto = [p.base[0] + ref.dir[0] * movimiento, p.base[1] + ref.dir[1] * movimiento, p.base[2] + ref.dir[2] * movimiento]
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
    (heridas.length > 0 ? ` · tensión ${Math.round(sutura.tension * 100)} % · herida cerrada al ${Math.round(cierre * 100)} %` : '')
  taller.decir?.(texto)
  avisar?.({
    ...medida,
    cierre,
    cierreMaximo,
    tension: sutura.tension,
    juicioDeLaTension:
      heridas.length > 0 ? juicioDeLaTension({ tension: sutura.tension, cruces: medida.cruces, cierreMaximo, largoMm }) : null,
    ultimaSeparacionMm,
    juicio: juicio === 'ultima' ? juicioDeLaPuntada(ultimaSeparacionMm) : null,
    ultimaCruza,
    hilo: sutura.hilo.nombre,
  })
  taller.pedirDibujo?.()
}

/** Cierra todas las heridas: cada malla recupera la geometría de antes del corte. */
function cerrarTodasLasHeridas(taller: Taller) {
  // Un músculo retraído vuelve a su sitio con todo lo demás (P-003 E10).
  soltarLasRetracciones(taller)
  // Los puntos de la disección eran de las heridas que se cierran.
  taller.diseccion = undefined
  // Un separador está puesto en una herida: sin ella no tiene dónde estar.
  for (const q of taller.separadores ?? []) soltarSeparador(q)
  taller.separadores = []
  taller.separadorEnLaMano = undefined
  taller.separadorActivo = null
  // De la última a la primera: cerrar una del medio obligaría a rehacer las que se hicieron después (P-003 E4).
  for (const h of [...todasLasHeridas(taller)].reverse()) cerrarCapa(h)
  taller.heridas?.clear()
  taller.cortes = []
  taller.ultimaHerida = undefined
  taller.ultimaIncision = undefined
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
  linea.userData.deInterfaz = true
  escena.add(linea)
  taller.trazo = linea
}

/**
 * Encuadra lo que esté visible, mirando con la pose dada (por omisión, la de siempre: de frente con un poco de
 * sesgo y el eje Y hacia arriba).
 */
function encuadrarVisible(taller: Taller, pose: PoseDeLaVista = POSE_AL_CARGAR) {
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

  ponerLaPose(camara, controles, centro, distanciaCamara, pose)
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
