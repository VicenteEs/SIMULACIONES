'use client'

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { ruta } from '@/lib/rutas'
import {
  anchoDeLasSecciones,
  desplazamientoDesde,
  medirReduccion,
  posicionAbsoluta,
  seccionesDelHueso,
  type EjeLargo,
} from '@/lib/reduccion'
import {
  largoVisibleDelAgujero,
  PASARSE_DE_LA_CORTICAL_MM,
  reconciliarConElModelo,
  type LesionDeEstructura,
} from '@/lib/simulador'
import { crearGizmo, escalaDelGizmo, type AsaDelGizmo } from '@/atlas/gizmo'
import { desplazamientoDelArrastre, giroDelArrastre } from '@/atlas/transformar'
import { ajustarAlSalto, barridoEnPantalla, centroLocalDe, colocarEnElMundo, moverPiezaPorEje } from './asasDelHueso'
import { esEstructuraNoble, propuestaDelNodo, traducirMuestra, type PiezaEnEdicion, type RolDePieza } from '@/lib/piezasDelCaso'
import { esCasiIdentidad, reducirPorLasCarasDeCorte, type ResultadoDeLaReduccion, type TransformacionRigida } from '@/lib/reduccionAutomatica'
import { transformacionValida } from '@/lib/transformacionRigida'
import { anguloDelGiro, lecturaDelDesvio, type LecturaClinica } from '@/atlas/lecturaClinica'
import {
  correrElOrigenDelArchivo,
  desvioDelFragmento,
  ejesDelFragmento,
  trozoDelFragmento,
  nodosDeHuesoDelArchivo,
  poseDelArchivo,
  poseDelTrayecto,
  ponerPose,
  posesReducidasDe,
  registrarPosesDelArchivo,
  transformacionDesdeElArchivo,
  trayecto,
  trozosParaReducir,
  type TrayectoDeUnTrozo,
} from './reduccionEnLaEscena'
import {
  aplicarColores,
  aplicarEntorno,
  aplicarPose,
  liberarHerramienta,
  prepararHerramienta,
  type HerramientaCargada,
} from '@/instrumental/herramienta3d'
import { cargarModeloDelInstrumento } from '@/instrumental/cargarModelo'
import type { AjustesDeInstrumento, ArticulacionDeclarada } from '@/instrumental/modelo'
import type { PlanoDeCorte } from '@/lib/comportamientoDelInstrumento'
import {
  ANCHO_VISIBLE_DE_LA_INCISION_MM,
  GROSOR_MAXIMO_DE_LA_PIEL_MM,
  abrirCapa,
  cerrarCapa,
  cortarCapa,
  ladoDeLaHerida,
  refrescarBordes,
  sitioEnLaHerida,
  type HeridaEnCapa,
} from './heridas'
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
import { giroEnvuelto, rangosDeLaPlaca, sentidoSobreElEje } from '@/lib/ejesAnatomicos'
import {
  calibresPorFragmento,
  COLOR_DE_LA_ZONA,
  compresionAplicable,
  formaDeLosAgujeros,
  ladoDeLaFractura,
  resultadoDeLaRoscaParcial,
  semilargoDelOvalDeLaPlaca,
  resultadoDelDeslizamiento,
  resultadoDelOval,
  sumarCompresion,
  zonaDelOval,
  type CompresionTotal,
  type PerforacionDeLaTrayectoria,
  type ResultadoDeCompresion,
} from '@/lib/compresion'
import type { TipoDeTornillo } from '@/lib/tornillos'
import {
  MARGEN_PARA_PASARSE_MM,
  lecturaDeLaBroca,
  profundidadTrasLaRueda,
  profundidadTrasUnCuadro,
  textoDeLaBroca,
  type LecturaDeLaBroca,
} from '@/lib/profundidadDeLaBroca'
import { estaAsentado, giroDelTornilloRad, metidoTrasLaRueda, textoDelTornilloQueEntra } from '@/lib/tornilloQueEntra'
import {
  ejeFisicoDelMovimiento,
  gradosDelArrastre,
  letraDelEje,
  lecturaDelMovimiento,
  vectorDelEje,
  type AccionDeMovimiento,
  type EjeAnatomico,
} from '@/lib/movimientoPorEjes'
import { LIMITE_PARA_COLOCAR_MM, avisoDelClicSinEfecto, correrElApoyo, decidirElClicDelSeparador, invertirLaDireccion, type CandidatoDeHerida } from '@/lib/abordajePorPlanos'
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
  ejesDelPaciente,
  girarLaVista,
  poseDeLaPosicion,
  rodarLaVista,
  type PoseDeLaVista,
  type PosicionDelPaciente,
} from '@/lib/posicionDelPaciente'
import { POSE_AL_CARGAR, aplicarLaPose, poseActual, ponerLaPose, sincronizarElArriba } from './vistaDelPaciente'
import type { EncuadreDelPaso } from '@/lib/encuadreDelPaso'
import { acercarHacia, encuadreDeLaHerida, MAS_CERCA_MM, MAS_LEJOS_MM, muescasDeLaRueda } from '@/lib/acercarComoSeMira'
import type { InstantaneaDelLienzo } from '@/lib/avanceDelCaso'
import type { AjustesDeLaImagen, DesplazamientoDeLaImagen, ProyeccionDeFluoroscopia } from '@/lib/radiografia'
import {
  dibujarFluoroscopia,
  encuadreHaciaElPunto,
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
  cercaDeLaHerida,
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
import {
  CONTEXTO_VIVO,
  ESPERA_ANTES_DE_REEMPLAZAR_EL_RENDERIZADOR_MS,
  alPerderse,
  alRestaurarse,
  calidadDelDibujo,
  crearLimitadorDeFallos,
  razonDePixeles,
  type EstadoDelContexto,
} from '@/lib/controlDelContexto'

/**
 * Cuántas veces el navegador le ha quitado el contexto de WebGL a esta página desde que se cargó. Vive fuera del componente a propósito:
 * volver a montar el lienzo (a mano o solo) lo crea de nuevo, y es justo entonces cuando hay que saber que la tarjeta va justa para pedirle
 * menos (`calidadDelDibujo`).
 */
const CLAVE_DE_LAS_PERDIDAS = 'traumahub:perdidas-de-contexto'
/**
 * Se recuerda entre visitas, en este equipo: una tarjeta que ya perdió el contexto lo volverá a perder con la misma carga, y recargar la página no la hace más holgada. Así el
 * lienzo de la próxima vez parte pidiéndole menos, en vez de volver a tropezar con lo mismo a media cirugía. Tope de 3: más no baja nada.
 */
function perdidasGuardadas(): number {
  try {
    const n = Number(window.localStorage.getItem(CLAVE_DE_LAS_PERDIDAS))
    return Number.isFinite(n) && n > 0 ? Math.min(3, Math.floor(n)) : 0
  } catch {
    return 0
  }
}
function guardarLasPerdidas(n: number) {
  try {
    window.localStorage.setItem(CLAVE_DE_LAS_PERDIDAS, String(Math.min(3, n)))
  } catch {
    // sin almacenamiento: vale lo de esta visita
  }
}
let perdidasDeContexto = typeof window === 'undefined' ? 0 : perdidasGuardadas()
import {
  aplicarElContorno,
  crearMesa,
  estadoDeLaMesa,
  orificiosSMm,
  ponerLaMarca,
  sitioDeUnPunto,
  soltarLaMesa,
  type EstadoDeLaMesa,
  type MesaDeModelado,
} from './mesaDeModelado'
import { SIN_CONTORNO, deshacerLaUltima, doblar, orificioBajoElDoblez } from '@/lib/contornoDeLaPlaca'
import {
  crearPeriostio,
  estadoDelPeriostio,
  sembrarHuella,
  soltarElPeriostio,
  terminarLaPasada,
  volverACubrir,
  type EstadoDelPeriostio,
  type PeriostioEnLaEscena,
} from './periostioEnLaEscena'
import { agujerosSobrePeriostio, juicioDeLaExposicion } from '@/lib/periostio'
import { LARGO_DEL_ALAMBRE_MM, MAXIMO_DE_ALAMBRES, juzgarElAlambre, resumenDeLosAlambres, type EstadoDeLosAlambres } from '@/lib/alambreDeKirschner'
import { emparejarNodos, normalizarNombreDeNodo } from '@/lib/emparejarNodos'
import { restaurarLoColocado, serializarLoColocado } from './sesionDeLoColocado'
import { crearAspectoDelModelo, soltarElAspecto, velloAlDia, vestirElModelo } from './aspectoDelPaciente'
import { crearEntornoDePabellon, crearOclusion, montarElPabellon, ponerLaSala, prepararElRenderizador, type Oclusion } from './pabellon'
import { causaProbable, guardarDiagnostico, type RegistroDeUnaPerdida } from '@/lib/diagnosticoDelLienzo'
import { destornilladorDelNombre, juzgarElApriete, juzgarLaPunteria, posicionDelOrificioMm, type OrificioDelClavo } from '@/lib/bloqueoDelClavo'
import { CERCA_DEL_FOCO_MM, VOLUMEN_POR_PUNADO_CC, juzgarElInjerto, largoDeBloqueParaElDefecto, type InjertoPuesto, type TipoDeInjerto } from '@/lib/injertoOseo'
import { colocarBloque, crearInjerto, depositarPunado, quitarInjerto, type InjertoEnLaEscena } from './injertoEnLaEscena'
import {
  ENTRADA_A_MANO_MM,
  avancePorGolpeMm,
  golpear,
  juzgarElAsiento,
  juzgarElCalibreDelClavo,
  juzgarElLargoDelClavo,
  loQueFaltaParaElClavo,
  siguienteCabeza,
  type EstadoDelEnclavado,
  type ReduccionDelFoco,
} from '@/lib/enclavado'
import {
  avanceMaximo,
  cambiarLaGuia,
  colocarElClavo,
  colocarLaGuia,
  crearEnclavado,
  estadoDelEnclavado,
  juicioDelPasoDeLaGuia,
  istmoDelHueso,
  medirElCanal,
  ponerElCanal,
  ponerLaEntrada,
  quitarElClavo,
  quitarTodoElEnclavado,
  remedirElCanal,
  retirarLaGuia,
  type EnclavadoEnLaEscena,
} from './enclavadoEnLaEscena'
import { agujeroBajoElPunto, ajustarPlaca, apoyoDeLaPlaca, reanclarPlaca, colocarPlaca, ejeDeLaPlaca, colocarTornillo, colocarTornilloEnLinea, crearImplantes, medirAlLoLargoDeUnaLinea, medirBajoElAgujero, posicionDelAgujero, quitarImplantes, quitarTornillos, quitarUnTornillo, soltarGrupo, type ImplantesEnEscena, type PlacaColocada, type TornilloEnEscena } from './implantesEnLaEscena'
import {
  avisoDeCalibre,
  avisoDelAsiento,
  avisoDelLargo,
  claseDelTornillo,
  largoSugerido,
  loQueFaltaPara,
  serieDelSistema,
  textoDeLoQueFalta,
  type EstadoDelAgujero,
  type EstadoDeLaFijacion,
  type QueColoca,
} from '@/lib/fijacion'
import {
  AVISO_DE_LA_FASCIA,
  NOMBRE_DEL_PLANO,
  PLANOS_BLANDOS,
  PROFUNDIDAD_DEL_PLANO,
  planoDelRol,
  planoQueCorta,
  type PlanoBlando,
} from '@/lib/planosBlandos'
import {
  SEPARACION_IDEAL_POR_PLANO,
  cierreDeCadaHerida,
  cierreDeTodoElCierre,
  cierresPorPlano,
  juicioDelHiloEnElPlano,
  medirPorPlanos,
  planoDeLaPuntada,
  resumirPorPlanos,
  type ResumenDeUnPlano,
} from '@/lib/planosDeLaSutura'
import { MAXIMO_DE_PUNTADAS, crearSutura, mallasVisibles, reconstruirHilo, soltarSutura, type SuturaEnEscena } from './hiloEnLaEscena'
// La regla base de `.consola-lienzo` vive en la hoja de la consola, y este
// lienzo lo monta también el taller de piezas del panel: sin importarla aquí,
// allí el contenedor mediría cero de alto. El porqué, en la cabecera de la hoja.
import '@/app/(frontend)/simulador/consola.css'
// Viven aparte, sin hoja de estilos, para que un guion de Node pueda leer los
// nodos de un modelo: importar este archivo arrastra la CSS de arriba, y Node no
// sabe cargarla (`scripts/pierna-derecha-en-el-caso.ts`). Se vuelven a exportar
// aquí porque es donde los buscan el panel y las pruebas.
import { datosDeLosNodos, esDeInterfazDelModelo, type DatosDeNodo } from './nodosDelModelo'
import { instalarLaSonda } from './sondaDelLienzo'
export { datosDeLosNodos, esDeInterfazDelModelo, type DatosDeNodo }

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

export type Modo = 'orbitar' | 'trazar' | 'mover' | 'senalar' | 'separar' | 'pinzar' | 'perforar' | 'coser' | 'fijar' | 'disecar' | 'reducir' | 'modelar' | 'elevar' | 'enclavar' | 'info'

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

/** El fragmento leído como en la ficha (D-303): lo que devuelve `lecturaDelFragmento`. */
export interface LecturaDelFragmento {
  /** Distal respecto del proximal, en milímetros y grados, con el signo de la ficha (`LecturaClinica`). */
  lectura: LecturaClinica
  /** La angulación total, por el camino más corto. */
  angulacion: number
  /** Cuánto se ha ido el foco, en milímetros y en los ejes del modelo: con eso se mide el % del diámetro. */
  separacionMm: Punto3
  /** Si se sabe de qué lado es el hueso. Sin él, varo y valgo podrían salir al revés y se dicen sin el sentido. */
  ladoConocido: boolean
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
   * El fragmento leído como en la ficha (D-303): en su foco, contra su sitio de reposo, con el giro de verdad y
   * partido en planos. Es lo que mide la consola; `estadoDelFragmento` sigue siendo lo que mueven sus mandos. `null`
   * sin fragmento o sin sitio de reposo.
   */
  lecturaDelFragmento: () => LecturaDelFragmento | null
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
  /** Borra la trayectoria de dos clics y su marca de entrada (P-004 E9). */
  borrarTrayectoriaDelTornillo: () => void
  /** Elige cuánto se corre la broca del centro de un orificio oval, con signo y en mm (P-004 E10). */
  fijarDesviacionDelAgujero: (indice: number, mm: number) => void
  /** Pone sobre la placa la marca del punto elegido para brocar en ese orificio oval, o la quita con `null` (pedido 14). */
  marcarElPuntoDeBrocado: (indice: number | null) => void
  /** Acerca la cámara al orificio (la vista de trabajo) o, con `null`, la devuelve a donde estaba. */
  acercarseAlAgujero: (indice: number | null) => void
  /** Retira la broca puesta (P-004 E8): dibuja el agujero y anota el calibre. */
  retirarLaBroca: () => void
  /** Enciende o apaga la broca puesta sin retirarla; sin argumento, alterna. */
  apagarLaBroca: (encendida?: boolean) => void
  /** Una muesca de la rueda con la broca puesta: mete (1) o saca (−1); con `fino`, la quinta parte. */
  moverLaBroca: (sentido: 1 | -1, fino?: boolean) => void
  /** Una muesca de la rueda con un tornillo entrando (pedido 13): mete (1) o saca (−1); con `fino`, la cuarta parte. */
  moverElTornillo: (sentido: 1 | -1, fino?: boolean) => void
  /** Asienta de una vez el tornillo que está entrando («Atornillar hasta el final»). */
  terminarElTornillo: () => void
  /** Saca el tornillo que está entrando, sin tocar el agujero. */
  sacarElTornillo: () => void
  /**
   * Mueve el trozo elegido `valor` milímetros (trasladar) o grados (angular, rotar) por un eje del paciente, medido desde
   * donde está ahora (P-004 E7). Devuelve la lectura («Trasladar · axial · +3,0 mm») o `null` si no hay trozo elegido.
   */
  moverPorEje: (accion: AccionDeMovimiento, eje: EjeAnatomico, valor: number) => string | null
  /** El nombre del trozo elegido, o `null`. */
  piezaElegida: () => string | null
  /** Devuelve a su sitio un solo músculo retraído (la fila de «Estructuras separadas», P-004 E5). */
  soltarRetraccion: (id: number) => void
  /** Elige cuál de los músculos retraídos responde a la rueda. */
  elegirRetraccion: (id: number) => void
  /** Cambia el lado hacia el que se aparta un músculo retraído: hacia delante o hacia atrás (pedido 10). */
  invertirRetraccion: (id?: number) => void
  /** Corre la zona retraída a lo largo del músculo (Mayúsculas + rueda), en milímetros. */
  correrRetraccion: (deltaMm: number) => void
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
  /**
   * Dónde va cada trozo de hueso para que el hueso quede reducido, sacado de sus caras de corte (P-008 E5). No mueve
   * nada: lo calcula con cada trozo en su pose del archivo. Sin modelo, `null`.
   */
  reduccionPorLasCaras: (ancla?: string | null) => ResultadoDeLaReduccion | null
  /**
   * Lleva los trozos hacia su posición reducida: con `fraccion` 0 se anota de dónde sale cada uno, y con 1 llegan. Los
   * que no tienen posición reducida pero se movieron con «Mover» vuelven a su sitio, que es lo que la reducción
   * automática hacía antes con ellos. Con `reducciones` se usan esas y no las del caso, y se mueve también el fragmento:
   * es el editor, que acaba de calcularlas y todavía no las tiene en el caso. Devuelve cuántos trozos se mueven.
   */
  llevarPiezasALaReduccion: (fraccion: number, reducciones?: Record<string, TransformacionRigida>) => number
  /** Si algún trozo del caso tiene posición reducida. */
  hayPosicionesReducidas: () => boolean
  /**
   * Dónde está el fragmento en el archivo, medido como `estadoDelFragmento`, cuando su sitio de reposo es una posición
   * reducida; si no, `null`. Es el desplazamiento con que empieza un caso que no escribió ninguno.
   */
  desplazamientoDelArchivo: () => { posicion: Punto3; giros: Punto3 } | null
  /**
   * El ancho del hueso que se le enfrenta al fragmento, junto al foco y en la dirección dada (de través al eje largo), en
   * milímetros: el diámetro con que la consola escribe el desplazamiento en % (Q-010). `null` si no hay ese hueso.
   */
  anchoDelHuesoJuntoAlFoco: (direccion: Punto3) => number | null
  /** Cuánto se apartan de su pose del archivo los trozos dados: la reducción hecha a mano. Los que no se movieron no salen. */
  reduccionHechaAMano: (nodos: readonly string[]) => Record<string, TransformacionRigida>
  /** Deja todos los trozos, también el fragmento, como vinieron en el archivo. */
  dejarComoEnElArchivo: () => void
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
  cambiarPlanoDelSeparador: (id: number, plano: CapaDeLaHerida) => void
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
   * El zoom y cuánto correr la extremidad bajo el arco para que lo puesto en un agujero —la broca, el tornillo que entra o el
   * medidor— caiga en el centro de la imagen con esta proyección (pedidos 3 y 13). `null` si no hay nada puesto.
   */
  encuadrarElInstrumento: (proyeccion: ProyeccionDeFluoroscopia) => { zoom: number; desplazamiento: DesplazamientoDeLaImagen } | null
  /**
   * La radiografía postoperatoria (P-004 E11): una toma de la escena como está ahora, rectangular y en positivo, dibujada en
   * `destino`. No es escopia: no suma exposición ni toca la imagen del arco en C.
   */
  radiografiaPostoperatoria: (
    destino: HTMLCanvasElement,
    proyeccion: ProyeccionDeFluoroscopia,
    zoom: number,
    ajustes?: Partial<AjustesDeLaImagen>,
    /** Cuánto se corre la extremidad bajo el tubo, como en la fluoroscopia (pedido 17). */
    desplazamiento?: DesplazamientoDeLaImagen,
  ) => boolean
  /**
   * Hace olvidar a la fluoroscopia lo que ya tenía dibujado, para que la próxima toma se haga aunque la escena sea la
   * misma: se llama cuando el lienzo de la imagen se vació o es otro (apagar y encender, cambiar de modo).
   */
  reiniciarFluoroscopia: () => void
  /** Quita los tornillos puestos, y la placa si `conPlaca`. */
  quitarImplantes: (conPlaca: boolean) => void
  /**
   * Lo que la tarjeta y la escena tienen reservado ahora (P-004 E2): geometrías y texturas que cuenta three.js,
   * programas compilados y objetos de la escena. Es para medir una fuga —el número tiene que volver al de partida
   * tras mover la placa cientos de veces—, no para pintarlo. `null` si el lienzo aún no está montado.
   */
  estadisticasDelDibujo: () => { geometrias: number; texturas: number; programas: number; objetos: number } | null
  /**
   * Provoca a propósito la pérdida del contexto de WebGL, y lo devuelve a los `volverEnMs` si se indica. Sirve
   * para probar la recuperación sin esperar a que el navegador la haga por su cuenta. `false` si el navegador no
   * ofrece la extensión `WEBGL_lose_context`.
   */
  perderElContexto: (volverEnMs?: number) => boolean
  /**
   * Mueve la placa puesta, sin fijar, y la vuelve a asentar sobre el hueso (P-003 E6): `largoMm` a lo largo del hueso,
   * `ladoMm` rodeándolo, `giroGrados` alrededor de la normal. Devuelve `false` si ahí no hay hueso.
   */
  ajustarLaPlaca: (ajuste: { largoMm: number; ladoMm: number; giroGrados: number }) => boolean
  /** Da la placa por buena (ya no se mueve y se perfora por sus agujeros) o la vuelve a dejar ajustable. */
  fijarLaPlaca: (fijar: boolean) => void
  /**
   * Pone la placa que se lleva en la mano sobre la **mesa de modelado** (P-005 E1): una copia suelta, en el lienzo y fuera del hueso, que se dobla
   * con el alicate y la grifa y se mueve arrastrándola. `false` si no hay una placa en la mano o aún no cargó su modelo.
   */
  ponerLaPlacaEnLaMesa: () => boolean
  /** Quita la placa de la mesa, con lo que se le hizo. */
  quitarLaPlacaDeLaMesa: () => void
  /**
   * Dobla o tuerce la placa de la mesa en el sitio apuntado (un clic sobre ella): `flexionGrados` y `torsionGrados` son lo que se suma. Devuelve lo que
   * hay que decirle a quien dobla (el tope, el orificio que se deforma…), o `null` si no hay nada que decir.
   */
  doblarLaPlaca: (cambio: { flexionGrados?: number; torsionGrados?: number }) => string | null
  /** Deshace el último doblez de la placa de la mesa. */
  deshacerElDoblez: () => void
  /** Gira la placa de la mesa sobre sí misma, de cara a la cámara: `grados` alrededor de la vista, o `voltear` para darle la vuelta. */
  girarLaPlacaDeLaMesa: (giro: { grados?: number; voltear?: boolean }) => void
  /** Cómo está la placa de la mesa, o `null` si no hay. */
  estadoDeLaMesa: () => EstadoDeLaMesa | null
  /** Vuelve a cubrir todo el hueso con su periostio (P-005 E2): borra lo despegado. */
  volverACubrirElPeriostio: () => void
  /** Cuánto hueso hay expuesto, o `null` si no se despegó nada. */
  estadoDelPeriostio: () => EstadoDelPeriostio | null
  /** Quita todas las agujas de Kirschner que se dejaron puestas (P-005 E3). */
  quitarLosAlambres: () => void
  /** Quita todo el enclavado puesto —entrada, guía y canal fresado— y lo deja como al principio (P-005 E4). */
  quitarElEnclavado: () => void
  /** Retira la guía y el fresado, y deja la entrada marcada (P-005 E4). */
  retirarLaGuiaDelEnclavado: () => void
  /** Quita todo el injerto puesto: los trozos esponjosos y el bloque (P-005 E7). */
  quitarElInjerto: () => void
  /** Pone otro renderizador conservando toda la escena (se usa cuando el navegador no devuelve el contexto gráfico). `false` si no se pudo. */
  recrearElRenderizador: () => boolean
  /** Retira el clavo del canal, que queda fresado y con su guía lisa (P-005 E5). */
  retirarElClavo: () => void
  /** Lo que hay fijado ahora mismo, o `null` si no hay placa. */
  estadoDeLaFijacion: () => EstadoDeLaFijacion | null
  /** Encuadra lo que esté visible. */
  encuadrar: () => void
  /**
   * «Encuadrar la herida» (P-012 E5, tecla E): la incisión en el centro y de frente, en un movimiento corto. `false` si
   * todavía no hay ninguna, para que la consola lo diga en vez de no hacer nada.
   */
  encuadrarLaHerida: () => boolean
  /** Desde dónde se mira ahora mismo (P-009): lo que el editor guarda como encuadre del paso. `null` antes de cargar. */
  encuadreActual: () => EncuadreDelPaso | null
  /**
   * Lleva la cámara al encuadre de un paso (P-009, mejora de uso 1), en un movimiento corto para que se vea de dónde
   * viene. `posicion` es la del paciente que declara el paso, si declara una: «Encuadrar» vuelve a ella.
   */
  irAlEncuadre: (encuadre: EncuadreDelPaso, posicion?: PosicionDelPaciente | null, ms?: number) => void
  /** Lo que hay ahora en el paciente, como lo guarda la pestaña (P-009): para repetir el paso, deshacer o seguir otro día. */
  instantanea: () => InstantaneaDelLienzo
  /**
   * Deja en la pestaña lo que el lienzo que se monte a continuación tiene que devolver, y deja de guardar (P-009). Es
   * el primer medio de «Repetir este paso», «Deshacer» y «Seguir donde lo dejó»: se llama y después se vuelve a montar
   * el lienzo con otra clave, que al cargar lo devuelve como devuelve lo de una recarga.
   */
  prepararLaVuelta: (instantanea: InstantaneaDelLienzo) => void
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
  /** Cuántos orificios escribió el editor en el instrumento (una placa): reparte los agujeros si el modelo no los trae (P-004 E6). */
  orificios?: number | null
  /** De qué tipo es el tornillo en la mano y, si es de rosca parcial, cuánto mide su rosca (P-004 E10). */
  tornillo?: { tipo: TipoDeTornillo; roscaMm?: number } | null
  /** Identificador y nombre del catálogo: un separador colocado se vuelve a dibujar y se nombra en pantalla. */
  id?: string
  nombre?: string
  /** Separa los bordes de una herida: cuánto abre como máximo y si se queda abierto solo. */
  separa?: { maximoMm: number; autoestatico: boolean; apoyoEnHueso?: boolean; anchoMm?: number; brazoMm?: number } | null
  /** Pellizca la piel hacia arriba: las pinzas de disección. */
  pellizca?: { conDientes: boolean } | null
  /** Es el electrobisturí: su modo y su potencia en vatios deciden si corta y cómo deja el borde. */
  electro?: { modo: ModoDelElectrobisturi; potenciaW: number } | null
  /** Perfora el hueso: gira, avanza mientras se mantiene pulsado y deja un túnel. */
  perfora?: { diametroMm: number; avanceMmPorSegundo: number; alambre?: boolean } | null
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
  /** Herramienta de modelado de placas (P-005 E1): el alicate dobla, la grifa tuerce, la plantilla copia el contorno del hueso. */
  modela?: 'flexion' | 'torsion' | 'plantilla' | null
  /** Despega el periostio (P-005 E2): arrastrar sobre el hueso deja una franja expuesta del ancho de la hoja elegida, en mm. */
  eleva?: { anchoMm: number } | null
  /** Paso del enclavado endomedular que hace la herramienta (P-005 E4); `cabezaMm` es la cabeza de fresa elegida. */
  enclava?: {
    funcion: 'entrada' | 'guia' | 'dedo' | 'fresa' | 'tubo' | 'clavo' | 'arco' | 'martillo' | 'impactador'
    cabezaMm?: number
    /** Solo en el clavo: sus medidas, leídas de su nombre. */
    diametroMm?: number
    largoMm?: number
  } | null
  /** Aprieta los tornillos puestos (P-005 E6): el destornillador, o el limitador de torque que se monta en él. */
  atornilla?: { tipo: 'destornillador' } | { tipo: 'limitador'; torqueNm: number | null } | null
  /** Es un injerto óseo (P-005 E7): `largoBloqueMm` es el del bloque estructural elegido. */
  injerta?: { tipo: TipoDeInjerto; largoBloqueMm?: number } | null
}

/** Una pinza de reducción que tiene agarrado un trozo de hueso: es hija del trozo, así que lo acompaña (P-003 E5). */
export interface PinzaDeReduccion {
  id: number
  nombre: string
  pieza: THREE.Object3D
  instrumento: InstrumentoColocado
  /** Qué modelo es y cómo se pintó, para volver a ponerla al recargar la sesión (P-003). */
  url?: string
  ajustes?: AjustesDeInstrumento | null
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
  /** El agujero de la placa del que habla el suceso (índice desde 0), si habla de uno: la secuencia sigue por él (P-004 E9). */
  agujero?: number
  /** Habla de la trayectoria de dos clics y no de un agujero de placa (P-004 E9). */
  libre?: boolean
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
  /**
   * Cómo va cada plano por su cuenta (piel, fascia): sus puntadas, sus cruces, cuánto cierra su herida. Solo en un caso con
   * fascia, donde se cierra por planos (P-006, E11); `cierre`, `tension` y `juicioDeLaTension` son entonces del cierre entero
   * y del plano en que se está cosiendo.
   */
  planos?: ResumenDeUnPlano[]
  /** El plano de la última puntada: el que aprieta el deslizador. */
  planoActivo?: PlanoBlando
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
  /**
   * Dónde entró la broca, en mm de la escena, y hacia dónde iba (D-330): con ellas la consola sabe si una perforación
   * repasa la trayectoria de antes —la broca de núcleo por el agujero de deslizamiento— o es otro agujero.
   */
  entradaMm: Punto
  direccion: Punto
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

export interface PiezaDelCaso {
  nodo: string
  rol: RolDePieza
  etiqueta?: string | null
  /**
   * Lo que lleva el trozo de donde está en el archivo a donde va reducido (P-008 E5), o nada si el archivo ya lo trae
   * en su sitio. Es para los modelos que se exportaron con la fractura ya desplazada: sin esto, su «cero» era el hueso
   * roto y la reducción automática no tenía a dónde llevarlo.
   */
  posicionReducida?: TransformacionRigida | null
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
  planoDelSeparador = 'auto',
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
  alLesionar,
  alIncidir,
  alCoser,
  alFijar,
  largoDeTornillo = 24,
  alRueda,
  capturaLaRueda = false,
  claveDeSesion,
  alCambiarLaEscena,
  alAbrirElMenu,
  avisoAlRecuperar,
  pistas = false,
  trazo: tipoDeTrazo = 'recto',
  moverTodo = false,
  alGesto,
  alSeparar,
  alPellizcar,
  alReducir,
  movimientoPorEje = null,
  asasLibres = false,
  alElegirPieza,
  alCambiarLaBroca,
  alCambiarElTornillo,
  diametroDeTornillo = null,
  marcandoLaTrayectoria = false,
  alCambiarLaTrayectoria,
  alTrazar,
  alMoverFragmento,
  alCargar,
  alSenalar,
  alInformar,
  alRetraer,
  musculoObjetivo,
  alFallar,
  alCambiarElContexto,
  alCambiarLaMesa,
  alCambiarElPeriostio,
  alCambiarLosAlambres,
  alCambiarElEnclavado,
  alCambiarElLimitador,
  alCambiarElInjerto,
  medidasDelFoco,
  clavoPrevistoMm,
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
  /**
   * En qué plano se apoyan los separadores que se pongan a partir de ahora. `auto` (por omisión desde P-004 E5) lo decide el
   * clic —lo que se ve bajo el cursor y la herida más cercana—; `piel` y `musculo` lo fuerzan, como antes.
   */
  planoDelSeparador?: 'auto' | CapaDeLaHerida
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
  /**
   * Se cortó o se perforó un vaso o un nervio (P-012 E6). Una vez por estructura y por herida: la incisión que se
   * alarga vuelve a cortar lo que ya estaba cortado, y eso no es otra lesión.
   */
  alLesionar?: (lesion: LesionDeEstructura) => void
  /**
   * Un trazo de verdad abrió una incisión nueva (D-330): no la que alarga otra, ni la que rehace la sesión, un reintento
   * o una disección. Es lo que la consola cuenta para saber si en el paso hay una segunda aparte.
   */
  alIncidir?: (incision: { id: number; capa: PlanoDeCorte }) => void
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
   * Cambió lo que hay en el paciente (P-009, mejora de uso 10): lo cortado, lo puesto o lo colocado. Se avisa con el
   * puntero suelto —a media maniobra cada medio segundo sería un estado a medias— y no antes de devolver lo de la
   * sesión. La consola lo apila para «Deshacer».
   */
  alCambiarLaEscena?: (instantanea: InstantaneaDelLienzo) => void
  /**
   * Un clic derecho limpio sobre el lienzo —sin arrastre y sin una broca dentro— (P-009, mejora de uso 9): la consola
   * abre ahí el menú radial de los instrumentos. Las coordenadas son de la ventana.
   */
  alAbrirElMenu?: (x: number, y: number) => void
  /**
   * Lo que dice el lienzo al devolver lo que había puesto en el paciente. Por omisión, que se recuperó: es lo que pasa
   * al recargar la página. Pero el lienzo también se vuelve a montar para «Deshacer» y para «Repetir este paso»
   * (P-009), y ahí «Se recuperó lo que había puesto» se leía como si algo se hubiera perdido: la consola dice lo que
   * de verdad pasó.
   */
  avisoAlRecuperar?: string | null
  /**
   * En práctica (P-009): la línea de la broca dice cuánto hueso atravesaría. En evaluación la línea se ve igual, sin el
   * número: es lo que lee el medidor, y medir es parte del paso.
   */
  pistas?: boolean
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
  /**
   * El movimiento por ejes que eligió el menú (P-004 E7): con uno, el trozo elegido se mueve con las flechas del teclado y
   * arrastrando a lo largo de ese eje, y se dibuja **una sola línea** en vez de las siete asas. `null`: sin eje elegido.
   */
  movimientoPorEje?: { accion: AccionDeMovimiento; eje: EjeAnatomico } | null
  /** Las asas de siempre (tres flechas y cuatro aros) se ven aunque haya un menú de ejes: el interruptor «Asas libres». */
  asasLibres?: boolean
  /** Cambió el trozo elegido (el que se agarró con el ratón o con la pinza): su nombre, o `null` si se soltó. */
  alElegirPieza?: (nombre: string | null) => void
  /**
   * La broca puesta en el hoyo (P-004 E8): su lectura cada vez que cambia —no cada cuadro: se avisa a lo sumo cada 100 ms— o
   * `null` cuando ya no hay ninguna. Con una puesta, la consola ofrece «Apagar la broca» y «Retirar».
   */
  alCambiarLaBroca?: (estado: EstadoDeLaBroca | null) => void
  /**
   * El tornillo de placa que está entrando (pedido 13): cuánto lleva cada vez que se mueve, o `null` cuando asienta o se saca.
   * Con uno entrando, la consola ofrece «Atornillar hasta el final» y «Sacar el tornillo», y la rueda lo mete en vez de alargar.
   */
  alCambiarElTornillo?: (estado: EstadoDelTornilloQueEntra | null) => void
  /** El diámetro de tornillo que eligió el residente en la lista (P-004 E9); `null`: el del modelo. */
  diametroDeTornillo?: number | null
  /** La consola pidió marcar la trayectoria: los clics en «Fijar» y «Perforar» son la entrada y la salida, no una acción (P-004 E9). */
  marcandoLaTrayectoria?: boolean
  /** La trayectoria de dos clics cambió: esperando la salida, lista, o borrada (`null`). */
  alCambiarLaTrayectoria?: (estado: EstadoDeLaTrayectoria | null) => void
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
   * Se llama cuando el navegador le quita a la página el contexto de WebGL o se lo devuelve (P-004 E2). Sin esto el
   * lienzo quedaba en blanco para siempre y sin decir nada: la consola enseña el aviso y, si el contexto no vuelve
   * solo, el botón que monta el lienzo de nuevo.
   */
  alCambiarElContexto?: (estado: EstadoDelContexto) => void
  /** Cambió la mesa de modelado (P-005 E1): se puso o se quitó una placa, se apuntó un sitio o se dobló. `null` si ya no hay placa en la mesa. */
  alCambiarLaMesa?: (estado: EstadoDeLaMesa | null) => void
  /** Se despegó periostio (P-005 E2): cuánto hueso quedó expuesto. `null` si se volvió a cubrir todo. */
  alCambiarElPeriostio?: (estado: EstadoDelPeriostio | null) => void
  /** Cambiaron las agujas de Kirschner puestas (P-005 E3): se clavó una o se quitaron. `null` si no queda ninguna. */
  alCambiarLosAlambres?: (estado: EstadoDeLosAlambres | null) => void
  /** Cambió el enclavado (P-005 E4): se marcó la entrada, avanzó la guía, se fresó. `null` si se quitó todo. */
  alCambiarElEnclavado?: (estado: EstadoDelEnclavado | null) => void
  /** Se montó o se quitó el limitador de torque del destornillador (P-005 E6): los N·m que admite ahora, o `null`. */
  alCambiarElLimitador?: (torqueNm: number | null) => void
  /** Cambió lo que hay de injerto puesto (P-005 E7): esponjoso y bloque, sin juzgar. `null` si se quitó todo. */
  alCambiarElInjerto?: (puesto: InjertoPuesto | null) => void
  /** Cómo está la reducción del foco ahora mismo: de ella depende que la guía pase (P-005 E4). */
  medidasDelFoco?: ReduccionDelFoco | null
  /** El calibre del clavo que se va a poner, si el caso lo trae en su bandeja: con él se juzga el fresado (P-005 E4). */
  clavoPrevistoMm?: number | null
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

  /** Lo que el aspecto realista le puso a cada malla del modelo (D-225): sus materiales y el vello. */
  const aspecto = useRef(crearAspectoDelModelo())
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
    /** La placa suelta que se dobla fuera del hueso (P-005 E1). */
    mesa?: MesaDeModelado
    /** El periostio despegado (P-005 E2). */
    periostio?: PeriostioEnLaEscena
    /** Las agujas de Kirschner que se dejaron puestas (P-005 E3). */
    alambres?: AlambrePuesto[]
    /** El enclavado endomedular: entrada, guía y canal fresado (P-005 E4). */
    enclavado?: EnclavadoEnLaEscena
    /** Los N·m del limitador de torque montado en el destornillador, o `null` (P-005 E6). */
    limitadorNm?: number | null
    /** Los injertos óseos puestos (P-005 E7). */
    injerto?: InjertoEnLaEscena
    /** Cambia el renderizador conservando la escena (lo asigna el montaje). */
    recrearElRenderizador?: () => boolean
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
    /** El caso trae fascia: la sutura cierra por planos y no todas las heridas a la vez (P-006, E11). */
    cierrePorPlanos?: boolean
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
    /** Dónde queda cada trozo reducido, como pose de su nodo (P-008 E5). El del fragmento es además su origen. */
    posesReducidas?: Map<THREE.Object3D, THREE.Matrix4>
    /** Los trozos que están yendo a su sitio en la reducción automática. */
    trayectosDeLaReduccion?: TrayectoDeUnTrozo[]
    /** Con qué posiciones reducidas y qué fragmento se calculó lo de arriba: si no cambian, no se rehace. */
    claveDeLaReduccion?: string
    /** Los cortes que hay hechos, en orden, para volver a hacerlos al recargar (D-171). */
    cortes?: CorteGuardado[]
    /** Los separadores colocados en la herida y cuál responde a la rueda. */
    separadores?: SeparadorEnEscena[]
    separadorActivo?: number | null
    siguienteSeparador?: number
    /** Los músculos retraídos con un separador, sin cortar (P-003 E10). */
    retracciones?: RetraccionDeMusculo[]
    retraccionActiva?: number
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
    /** Cuántas veces se mandó la cámara a un encuadre: el movimiento de una orden anterior se para al ver otro número. */
    turnoDeLaCamara?: number
    /** El lienzo va a desmontarse para volver a un estado guardado (P-009): ya no guarda nada en la pestaña. */
    sinGuardar?: boolean
    /** Quita la placa de cristal y la línea de la broca (P-009): las vistas previas de antes de actuar. */
    esconderLasVistasPrevias?: () => void
    /** La disección roma en curso: los puntos donde se separó y la punta apoyada. */
    diseccion?: DiseccionActiva
    /** Corta la capa con el trazo que haya en `puntosDelTrazo`: lo expone el montaje para la disección roma. Devuelve la incisión. */
    aplicarElCorte?: (plano: PlanoDeCorte, opciones?: OpcionesDelCorte) => number | undefined
    /**
     * La trayectoria de un tornillo marcada con dos clics sobre el hueso (P-004 E9): de la entrada a la salida, dibujada como una
     * línea, con lo que se perforó y se midió por ella. La broca, el medidor y el tornillo la siguen.
     */
    trayectoriaDelTornillo?: {
      entrada: THREE.Vector3
      salida: THREE.Vector3
      haciaDentro: THREE.Vector3
      linea: THREE.Line
      estado: EstadoDelAgujero
      largoMm: number
      anguloConElEje: number
      /** Todo lo perforado por ella, por calibre y profundidad: la técnica de deslizamiento mira lo de cada fragmento (P-004 E10). */
      perforaciones: PerforacionDeLaTrayectoria[]
    }
    /** El primer clic de la trayectoria, a la espera del segundo. */
    puntoDeEntrada?: { punto: THREE.Vector3; marca: THREE.Mesh }
    /** Cuánto se corre la broca del centro de cada orificio oval, por su índice, en mm (P-004 E10). */
    desviaciones?: Map<number, number>
    /** Cuánto se ha comprimido la fractura y con qué técnicas (P-004 E10). */
    compresion?: CompresionTotal
    /** Lleva la cámara a un orificio, o la devuelve a donde estaba (P-004 E10). */
    acercarseAlAgujero?: (indice: number | null) => void
    /** La marca del punto de brocado sobre la placa: la pone en ese orificio, o la quita con `null` (pedido 14). */
    marcarElPuntoDeBrocado?: (indice: number | null) => void
    /** Se soltó una pinza de reducción: en «Reducir», el trozo que ya no sostiene ninguna deja de estar elegido (pedido 15). */
    alSoltarLasPinzas?: () => void
    /** Se borró la recta provisional de una línea que no se terminó: la consola deja de contar su largo (P-008 E1). */
    alBorrarElTrazo?: () => void
    /** La vuelve a mirar tras perforar o quitar la placa: se va si su orificio ya no está por brocar. */
    repasarLaMarcaDeBrocado?: () => void
    /** Hacia qué sentido del eje de la placa está la fractura respecto de cada orificio; vacío si no se sabe dónde está (P-004 E10). */
    ladosDeLaFractura?: () => Record<number, 1 | -1>
    /** Numera los tornillos de trayectoria libre con enteros negativos. */
    siguienteTornilloLibre?: number
    borrarLaTrayectoria?: () => void
    /** El medidor está posado en un orificio perforado de la placa fijada: no sigue al cursor ni se esconde con él (P-004 E8). */
    medidorEnElOrificio?: boolean
    /** Retira la broca puesta: dibuja el agujero y anota el calibre (P-004 E8). */
    retirarLaBroca?: () => void
    /** Enciende o apaga la broca puesta, sin retirarla. */
    apagarLaBroca?: (encendida?: boolean) => void
    /** Mete (+) o saca (−) la broca puesta una muesca de la rueda. */
    moverLaBroca?: (sentido: 1 | -1, fino: boolean) => void
    /** Dónde está lo puesto en un agujero —broca, tornillo que entra, medidor—, para centrar en ello el arco; `null` si nada. */
    puntoDelInstrumentoPuesto?: () => THREE.Vector3 | null
    /** Mete (+) o saca (−) el tornillo que está entrando una muesca de la rueda (pedido 13); al llegar al largo, asienta. */
    moverElTornillo?: (sentido: 1 | -1, fino: boolean) => void
    /** Asienta de una vez el tornillo que está entrando: cuenta, se juzga y comprime. */
    terminarElTornillo?: () => void
    /** Saca el tornillo que está entrando; el agujero sigue perforado y medido. */
    sacarElTornillo?: () => void
    /** Mueve el trozo elegido por un eje del paciente (P-004 E7): devuelve la lectura, o `null` si no hay trozo elegido. */
    moverPorEje?: (accion: AccionDeMovimiento, eje: EjeAnatomico, valor: number) => string | null
    /** El nombre del trozo elegido ahora, o `null`. */
    piezaElegida?: () => string | null
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
    alCambiarElContexto,
    alCambiarLaMesa,
    alCambiarElPeriostio,
    alCambiarLosAlambres,
    alCambiarElEnclavado,
    alCambiarElLimitador,
    alCambiarElInjerto,
    medidasDelFoco,
    clavoPrevistoMm,
    alCargarInstrumento,
    alHerir,
    alPerforar,
    alLesionar,
    alIncidir,
    alCoser,
    alFijar,
    largoDeTornillo,
    alRueda,
    capturaLaRueda,
    claveDeSesion,
    alCambiarLaEscena,
    alAbrirElMenu,
    avisoAlRecuperar,
    pistas,
    tipoDeTrazo,
    moverTodo,
    alGesto,
    alSeparar,
    alPellizcar,
    alReducir,
    movimientoPorEje,
    asasLibres,
    alElegirPieza,
    alCambiarLaBroca,
    alCambiarElTornillo,
    diametroDeTornillo,
    marcandoLaTrayectoria,
    alCambiarLaTrayectoria,
  })
  useEffect(() => {
    // Un caso con alguna pieza de fascia cierra por planos; uno sin ella, como siempre (P-006, E11).
    taller.current.cierrePorPlanos = piezas.some((p) => p.rol === 'fascia')
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
      alCambiarElContexto,
      alCambiarLaMesa,
      alCambiarElPeriostio,
      alCambiarLosAlambres,
      alCambiarElEnclavado,
      alCambiarElLimitador,
      alCambiarElInjerto,
      medidasDelFoco,
      clavoPrevistoMm,
      alCargarInstrumento,
      alHerir,
      alPerforar,
      alLesionar,
      alIncidir,
      alCoser,
      alFijar,
      largoDeTornillo,
      alRueda,
      capturaLaRueda,
      claveDeSesion,
      alCambiarLaEscena,
      alAbrirElMenu,
      avisoAlRecuperar,
      pistas,
      tipoDeTrazo,
      moverTodo,
      alGesto,
      alSeparar,
      alPellizcar,
      alReducir,
      movimientoPorEje,
      asasLibres,
      alElegirPieza,
      alCambiarLaBroca,
      alCambiarElTornillo,
      diametroDeTornillo,
      marcandoLaTrayectoria,
      alCambiarLaTrayectoria,
    }
  })

  // Solo en desarrollo: lo que las pruebas de extremo a extremo y las grabaciones del instrumental necesitan medir
  // desde fuera —dónde cae una pieza en pantalla, si un separador está sobre su labio— (`sondaDelLienzo`).
  useEffect(
    () =>
      instalarLaSonda(() => ({
        render: taller.current.render,
        camara: taller.current.camara,
        controles: taller.current.controles,
        pedirDibujo: taller.current.pedirDibujo,
        raiz: taller.current.raiz,
        heridas: taller.current.heridas,
        separadores: taller.current.separadores,
        implantes: taller.current.implantes,
        huesos: mallasDeHuesoVisibles(taller.current, ultimas.current.piezas),
        milimetrosPorUnidad: ultimas.current.milimetrosPorUnidad,
      })),
    [],
  )

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

    lecturaDelFragmento: () => {
      const t = taller.current
      const { fragmento: f, origenDelFragmento: origen, raiz } = t
      if (!f || !origen || !raiz) return null
      // El sitio de reposo como pose del nodo: el mismo que usan `colocarFragmento` y la reducción automática.
      const reposo = new THREE.Matrix4().compose(origen.posicion, new THREE.Quaternion().setFromEuler(origen.rotacion), f.scale)
      // Se mide en el origen del nodo, que es el foco cuando el archivo lo puso ahí (`focoEnElOrigen`, D-304) y, en un
      // modelo de antes, el centro del trozo (`pivoteEnSuCentro`): ahí medía la consola y ahí sigue midiendo.
      const desvio = desvioDelFragmento(raiz, f, reposo)
      const mm = ultimas.current.milimetrosPorUnidad || 1000
      const separacionMm: [number, number, number] = [desvio.separacion[0] * mm, desvio.separacion[1] * mm, desvio.separacion[2] * mm]
      const { ejes, ladoConocido } = ejesDelFragmento(f, ultimas.current.ejeLargo ?? 'y')
      return {
        lectura: lecturaDelDesvio({ giro: desvio.giro, separacionMm }, ejes, trozoQueSeMueve(t, ultimas.current.piezas, ejes.largo, mm)),
        angulacion: anguloDelGiro(desvio.giro),
        separacionMm: { x: separacionMm[0], y: separacionMm[1], z: separacionMm[2] },
        ladoConocido,
      }
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

    soltarRetraccion: (id) => soltarUnaRetraccion(taller.current, ultimas.current, id),

    moverPorEje: (accion, eje, valor) => taller.current.moverPorEje?.(accion, eje, valor) ?? null,

    borrarTrayectoriaDelTornillo: () => taller.current.borrarLaTrayectoria?.(),

    fijarDesviacionDelAgujero: (indice, mm) => {
      const t = taller.current
      ;(t.desviaciones ??= new Map()).set(indice, mm)
      t.marcarElPuntoDeBrocado?.(indice)
      ultimas.current.alFijar?.(estadoDeLaFijacion(t))
    },

    marcarElPuntoDeBrocado: (indice) => taller.current.marcarElPuntoDeBrocado?.(indice),

    acercarseAlAgujero: (indice) => taller.current.acercarseAlAgujero?.(indice),

    retirarLaBroca: () => taller.current.retirarLaBroca?.(),

    apagarLaBroca: (encendida) => taller.current.apagarLaBroca?.(encendida),

    moverLaBroca: (sentido, fino = false) => taller.current.moverLaBroca?.(sentido, fino),

    moverElTornillo: (sentido, fino = false) => taller.current.moverElTornillo?.(sentido, fino),

    terminarElTornillo: () => taller.current.terminarElTornillo?.(),

    sacarElTornillo: () => taller.current.sacarElTornillo?.(),

    piezaElegida: () => taller.current.piezaElegida?.() ?? null,

    elegirRetraccion: (id) => {
      taller.current.retraccionActiva = id
      ultimas.current.alRetraer?.(estadoDeLasRetracciones(taller.current))
    },

    invertirRetraccion: (id) => invertirLaRetraccion(taller.current, ultimas.current, id),

    correrRetraccion: (deltaMm) => correrLaRetraccion(taller.current, ultimas.current, deltaMm),

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
      if (s.puntos.length === 0) {
        s.tension = 0
        s.tensiones = {}
        s.planoActivo = undefined
      } else if (taller.current.cierrePorPlanos) {
        // El deslizador vuelve al plano de la puntada que queda.
        s.planoActivo = s.puntos[s.puntos.length - 1].plano ?? 'piel'
        s.tension = s.tensiones[s.planoActivo] ?? 0
      }
      refrescarSutura(taller.current, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, null, ultimas.current.alHerir)
    },

    quitarSutura: () => {
      const t = taller.current
      if (!t.sutura) return
      t.sutura.puntos.length = 0
      t.sutura.tension = 0
      t.sutura.tensiones = {}
      t.sutura.planoActivo = undefined
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
      // Con planos, se aprieta el hilo del plano en que se está cosiendo; el de los otros se queda como estaba.
      if (t.cierrePorPlanos) t.sutura.tensiones[t.sutura.planoActivo ?? 'piel'] = t.sutura.tension
      refrescarSutura(t, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, null, ultimas.current.alHerir)
    },

    tensionDeLaSutura: () => taller.current.sutura?.tension ?? 0,

    restaurarPiezas: () => {
      const t = taller.current
      // Las pinzas de reducción son hijas de los trozos que se devuelven a su sitio: se sueltan con ellos (P-003 E5).
      soltarPinzasDeReduccion(t, ultimas.current)
      // Con los trozos otra vez separados, lo comprimido ya no vale (P-004 E10).
      t.compresion = undefined
      const fragmento = t.fragmento
      t.origenesDePiezas?.forEach((origen, pieza) => {
        // El fragmento del caso lo coloca la consola con el desplazamiento inicial del caso.
        if (fragmento && (pieza === fragmento || perteneceA(pieza, fragmento))) return
        pieza.position.copy(origen.posicion)
        pieza.rotation.copy(origen.rotacion)
      })
      t.pedirDibujo?.()
    },

    reduccionPorLasCaras: (ancla) => {
      const t = taller.current
      if (!t.raiz) return null
      // Los huesos que el caso declara; si no declara ninguno —el editor recién abrió el modelo—, los que el exportador
      // marcó como hueso. Los músculos no: el marco del «Recortar» del atlas los deja con tapas que no son de la fractura.
      const declarados = ultimas.current.piezas.filter((p) => p.rol === 'hueso' || p.rol === 'fragmento').map((p) => p.nodo)
      const nodos = declarados.length > 0 ? declarados : nodosDeHuesoDelArchivo(t.raiz)
      return reducirPorLasCarasDeCorte(trozosParaReducir(t.raiz, nodos), {
        milimetrosPorUnidad: ultimas.current.milimetrosPorUnidad || 1000,
        ancla,
      })
    },

    llevarPiezasALaReduccion: (fraccion, reducciones) => {
      const t = taller.current
      const raiz = t.raiz
      if (!raiz) return 0
      if (fraccion <= 0 || !t.trayectosDeLaReduccion) {
        // Como al devolver los trozos a su sitio: las pinzas se sueltan y lo comprimido ya no vale.
        soltarPinzasDeReduccion(t, ultimas.current)
        t.compresion = undefined
        const destinos = reducciones
          ? posesReducidasDe(raiz, Object.entries(reducciones))
          : (t.posesReducidas ?? new Map<THREE.Object3D, THREE.Matrix4>())
        const fragmento = t.fragmento
        const esDelFragmento = (o: THREE.Object3D) => !!fragmento && (o === fragmento || perteneceA(o, fragmento))
        const origenes = (t.origenesDePiezas ??= new Map())
        const trayectos: TrayectoDeUnTrozo[] = []
        destinos.forEach((hasta, objeto) => {
          // El fragmento lo lleva la consola, que mide mientras lo mueve; salvo para el editor, que aún no tiene el caso.
          if (esDelFragmento(objeto) && !reducciones) return
          // Se anota la pose de salida: «Reiniciar» devuelve el trozo ahí, como a uno movido con «Mover».
          if (!esDelFragmento(objeto) && !origenes.has(objeto)) {
            origenes.set(objeto, { posicion: objeto.position.clone(), rotacion: objeto.rotation.clone() })
          }
          trayectos.push(trayecto(objeto, hasta))
        })
        origenes.forEach((origen, objeto) => {
          if (destinos.has(objeto) || esDelFragmento(objeto)) return
          const hasta = new THREE.Matrix4().compose(origen.posicion, new THREE.Quaternion().setFromEuler(origen.rotacion), objeto.scale)
          trayectos.push(trayecto(objeto, hasta))
        })
        t.trayectosDeLaReduccion = trayectos
      }
      const trayectos = t.trayectosDeLaReduccion
      const k = Math.min(1, Math.max(0, fraccion))
      for (const tramo of trayectos) ponerPose(tramo.objeto, k >= 1 ? tramo.hasta : poseDelTrayecto(tramo, k))
      if (k >= 1) t.trayectosDeLaReduccion = undefined
      t.pedirDibujo?.()
      return trayectos.length
    },

    hayPosicionesReducidas: () => (taller.current.posesReducidas?.size ?? 0) > 0,

    desplazamientoDelArchivo: () => {
      const { fragmento: f, origenDelFragmento: origen, posesReducidas } = taller.current
      if (!f || !origen || !posesReducidas?.has(f)) return null
      const posicion = new THREE.Vector3()
      const cuaternion = new THREE.Quaternion()
      poseDelArchivo(f).decompose(posicion, cuaternion, new THREE.Vector3())
      const rotacion = new THREE.Euler().setFromQuaternion(cuaternion, f.rotation.order)
      // Cada ángulo entre −180° y 180°: a `colocarFragmento`, que suma ángulos de Euler, le da igual una vuelta de más,
      // pero la consola lee de aquí la angulación, y 350° no es una angulación.
      const giro = (a: number, b: number) => {
        const g = grados(a - b)
        return g > 180 ? g - 360 : g <= -180 ? g + 360 : g
      }
      return {
        posicion: desplazamientoDesde(origen.posicion, posicion),
        giros: { x: giro(rotacion.x, origen.rotacion.x), y: giro(rotacion.y, origen.rotacion.y), z: giro(rotacion.z, origen.rotacion.z) },
      }
    },

    anchoDelHuesoJuntoAlFoco: (direccion) => {
      const t = taller.current
      const mm = ultimas.current.milimetrosPorUnidad || 1000
      const eje = ultimas.current.ejeLargo ?? 'y'
      const i = eje === 'x' ? 0 : eje === 'z' ? 2 : 1
      const enfrente = huesoQueSeEnfrenta(t, ultimas.current.piezas, i, mm)
      if (!enfrente) return null
      // Las secciones, del lado del hueso que da al fragmento y desde 5 mm hacia dentro: el borde mismo de la fractura es
      // irregular (una espícula da un ancho de más). Hasta 20 mm en un trozo corto, que más allá llega a la metáfisis, y
      // hasta 40 en uno largo, para pasar la cuña de un trazo oblicuo (ver `seccionesDelHueso`).
      const centro = new THREE.Vector3()
      const haciaArriba = enfrente.cajaDelFragmento.getCenter(centro).getComponent(i) > enfrente.caja.getCenter(new THREE.Vector3()).getComponent(i)
      const extremo = haciaArriba ? enfrente.caja.max.getComponent(i) : enfrente.caja.min.getComponent(i)
      const hacia = haciaArriba ? -1 : 1
      const largoMm = (enfrente.caja.max.getComponent(i) - enfrente.caja.min.getComponent(i)) * mm
      const hastaMm = Math.min(40, Math.max(20, 0.3 * largoMm))
      const [a, b] = [extremo + (hacia * 5) / mm, extremo + (hacia * hastaMm) / mm]
      const ancho = anchoDeLasSecciones(seccionesEnElMundo(enfrente.malla, eje, Math.min(a, b), Math.max(a, b)), eje, direccion)
      return ancho === null ? null : ancho * mm
    },

    reduccionHechaAMano: (nodos) => {
      const raiz = taller.current.raiz
      const hechas: Record<string, TransformacionRigida> = {}
      if (!raiz) return hechas
      for (const nodo of nodos) {
        const objeto = raiz.getObjectByName(nodo)
        if (!objeto) continue
        const transformacion = transformacionDesdeElArchivo(raiz, objeto)
        if (!esCasiIdentidad(transformacion, ultimas.current.milimetrosPorUnidad || 1000)) hechas[nodo] = transformacion
      }
      return hechas
    },

    dejarComoEnElArchivo: () => {
      const t = taller.current
      soltarPinzasDeReduccion(t, ultimas.current)
      t.compresion = undefined
      t.trayectosDeLaReduccion = undefined
      t.origenesDePiezas?.forEach((origen, pieza) => {
        pieza.position.copy(origen.posicion)
        pieza.rotation.copy(origen.rotacion)
      })
      if (t.fragmento) ponerPose(t.fragmento, poseDelArchivo(t.fragmento))
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

    radiografiaPostoperatoria: (destino, proyeccion, zoom, ajustes, desplazamiento) => {
      const t = taller.current
      const ctx = contextoDeRadiografia(t)
      if (!t.render || !ctx) return false
      t.fluoroscopia ??= prepararFluoroscopia()
      // Una placa no es escopia: no pasa por `disparos` ni cuenta exposición. Se toma a la resolución más alta que ya sabe hacer el
      // taller, porque la lámina la amplía, y se vuelve a la de la pantalla al terminar para no dejar la fluoroscopia a otro tamaño.
      const hecha = dibujarFluoroscopia(
        t.render,
        ctx,
        t.fluoroscopia,
        destino,
        { proyeccion, zoom, ejeLargo: ultimas.current.ejeLargo, desplazamiento, lado: 768, ajustes, forzar: true },
        (t.cuadro ?? 0) + (t.disparos = (t.disparos ?? 0) + 1),
        [t.trazo, t.guias, t.fantasma, t.marcaDeInicio],
        'placa',
      )
      reiniciarLaFluoroscopia(t.fluoroscopia)
      return hecha
    },

    encuadrarElInstrumento: (proyeccion) => {
      const t = taller.current
      const punto = t.puntoDelInstrumentoPuesto?.()
      const ctx = contextoDeRadiografia(t)
      if (!punto || !ctx) return null
      const u = ultimas.current
      return encuadreHaciaElPunto(ctx, { proyeccion, ejeLargo: u.ejeLargo, milimetrosPorUnidad: u.milimetrosPorUnidad || 1000 }, punto)
    },

    revelarFluoroscopia: (destino, ajustes) => (taller.current.fluoroscopia ? revelarLaToma(taller.current.fluoroscopia, destino, ajustes) : false),

    reiniciarFluoroscopia: () => reiniciarLaFluoroscopia(taller.current.fluoroscopia),

    estadisticasDelDibujo: () => {
      const dibujo = taller.current.render
      const escena = taller.current.escena
      if (!dibujo || !escena) return null
      let objetos = 0
      escena.traverse(() => {
        objetos += 1
      })
      return {
        geometrias: dibujo.info.memory.geometries,
        texturas: dibujo.info.memory.textures,
        programas: dibujo.info.programs?.length ?? 0,
        objetos,
      }
    },

    perderElContexto: (volverEnMs) => {
      const extension = taller.current.render?.getContext().getExtension('WEBGL_lose_context')
      if (!extension) return false
      extension.loseContext()
      if (volverEnMs !== undefined) window.setTimeout(() => extension.restoreContext(), volverEnMs)
      return true
    },

    quitarImplantes: (conPlaca) => {
      const imp = taller.current.implantes
      if (!imp) return
      // El que está entrando no está en la lista de los puestos (pedido 13): se saca aparte, o quedaría flotando sin placa.
      taller.current.sacarElTornillo?.()
      if (conPlaca) {
        quitarImplantes(imp)
        // Lo que se había elegido en los orificios de esa placa no vale para la siguiente (P-004 E10).
        taller.current.desviaciones?.clear()
      } else quitarTornillos(imp)
      taller.current.repasarLaMarcaDeBrocado?.()
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

    ponerLaPlacaEnLaMesa: () => {
      const t = taller.current
      const inst = ultimas.current.instrumento
      const h = t.herramienta
      if (!t.escena || !t.camara || !t.controles || !h || inst?.coloca?.tipo !== 'placa') return false
      if (t.mesa) soltarLaMesa(t.mesa)
      // Al costado del modelo, de cara a quien mira y con el largo hacia arriba de la pantalla: como una placa sobre la mesa de instrumentos.
      const haciaLaCamara = t.camara.position.clone().sub(t.controles.target).normalize()
      const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(t.camara.quaternion)
      const derecha = new THREE.Vector3(1, 0, 0).applyQuaternion(t.camara.quaternion)
      // Más cerca de la cámara que el paciente, para que se vea grande y se pueda trabajar: una placa de 110 mm a la distancia del paciente
      // eran 25 píxeles de alto. A un costado, para no tapar el modelo.
      const adelante = t.camara.getWorldDirection(new THREE.Vector3())
      const profundidad = Math.max(0.28, t.camara.position.distanceTo(t.controles.target) * 0.32)
      const mesa = crearMesa({
        escena: t.escena,
        plantilla: h.raiz,
        nombre: h.meta?.nombre ?? inst.nombre ?? 'Placa',
        instrumentoId: inst.id ?? null,
        agujerosMm: h.meta?.agujeros ?? [],
        posicion: t.camara.position.clone().addScaledVector(adelante, profundidad).addScaledVector(derecha, profundidad * 0.32),
        haciaLaCamara,
        arriba,
        contorno: SIN_CONTORNO,
      })
      if (!mesa) return false
      // La mesa no es del paciente: ni la fluoroscopia ni el encuadre la cuentan.
      mesa.grupo.userData.deInterfaz = true
      t.mesa = mesa
      ultimas.current.alCambiarLaMesa?.(estadoDeLaMesa(mesa))
      t.pedirDibujo?.()
      return true
    },

    quitarLaPlacaDeLaMesa: () => {
      const t = taller.current
      if (!t.mesa) return
      soltarLaMesa(t.mesa)
      t.mesa = undefined
      ultimas.current.alCambiarLaMesa?.(null)
      t.pedirDibujo?.()
    },

    doblarLaPlaca: (cambio) => {
      const t = taller.current
      const mesa = t.mesa
      if (!mesa) return 'Ponga primero una placa en la mesa de modelado: con una placa en la mano, «Llevar a la mesa de modelado».'
      if (mesa.sitioMm === null) return 'Apunte primero al sitio: un clic sobre la placa marca dónde se dobla.'
      const soloTorsion = (cambio.flexionGrados ?? 0) === 0
      const bajo = orificioBajoElDoblez(orificiosSMm(mesa), mesa.sitioMm, soloTorsion)
      const r = doblar(mesa.contorno, mesa.sitioMm, cambio)
      mesa.contorno = r.contorno
      aplicarElContorno(mesa)
      ultimas.current.alCambiarLaMesa?.(estadoDeLaMesa(mesa))
      t.pedirDibujo?.()
      const avisos = [...r.avisos]
      if (bajo !== null && (r.aplicado.flexionGrados !== 0 || r.aplicado.torsionGrados !== 0)) {
        avisos.push(`Dobló sobre el orificio ${bajo + 1}: se deforma. Doble entre orificios.`)
      }
      return avisos.length > 0 ? avisos.join(' ') : null
    },

    deshacerElDoblez: () => {
      const mesa = taller.current.mesa
      if (!mesa) return
      mesa.contorno = deshacerLaUltima(mesa.contorno)
      aplicarElContorno(mesa)
      ultimas.current.alCambiarLaMesa?.(estadoDeLaMesa(mesa))
      taller.current.pedirDibujo?.()
    },

    girarLaPlacaDeLaMesa: ({ grados, voltear }) => {
      const t = taller.current
      const mesa = t.mesa
      if (!mesa || !t.camara) return
      mesa.grupo.updateMatrixWorld(true)
      // Se gira sobre su centro: el punto que está en el centro de la caja se queda donde está.
      const centro = mesa.grupo.localToWorld(mesa.centro.clone())
      const adelante = t.camara.getWorldDirection(new THREE.Vector3())
      const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(t.camara.quaternion)
      const q = voltear
        ? new THREE.Quaternion().setFromAxisAngle(arriba, Math.PI)
        : new THREE.Quaternion().setFromAxisAngle(adelante, radianes(grados ?? 0))
      mesa.grupo.quaternion.premultiply(q)
      mesa.grupo.updateMatrixWorld(true)
      const despues = mesa.grupo.localToWorld(mesa.centro.clone())
      mesa.grupo.position.add(centro.sub(despues))
      t.pedirDibujo?.()
    },

    estadoDeLaMesa: () => (taller.current.mesa ? estadoDeLaMesa(taller.current.mesa) : null),

    quitarLosAlambres: () => {
      const t = taller.current
      if (!t.alambres || t.alambres.length === 0) return
      for (const a of t.alambres) {
        a.malla.removeFromParent()
        a.malla.geometry.dispose()
        ;(a.malla.material as THREE.Material).dispose()
      }
      t.alambres = []
      ultimas.current.alCambiarLosAlambres?.(null)
      t.pedirDibujo?.()
    },

    recrearElRenderizador: () => taller.current.recrearElRenderizador?.() ?? false,

    quitarElInjerto: () => {
      const t = taller.current
      if (!t.injerto) return
      quitarInjerto(t.injerto)
      t.injerto = undefined
      ultimas.current.alCambiarElInjerto?.(null)
      t.pedirDibujo?.()
    },

    quitarElEnclavado: () => {
      const t = taller.current
      if (!t.enclavado) return
      soltarLosBloqueos(t)
      quitarTodoElEnclavado(t.enclavado)
      ultimas.current.alCambiarElEnclavado?.(null)
      t.pedirDibujo?.()
    },

    retirarElClavo: () => {
      const t = taller.current
      if (!t.enclavado?.clavo) return
      soltarLosBloqueos(t)
      quitarElClavo(t.enclavado)
      ultimas.current.alCambiarElEnclavado?.(estadoDelEnclavado(t.enclavado, ultimas.current.medidasDelFoco ?? null, ultimas.current.clavoPrevistoMm ?? null))
      t.decir?.('Clavo retirado del canal.')
      t.pedirDibujo?.()
    },

    retirarLaGuiaDelEnclavado: () => {
      const t = taller.current
      if (!t.enclavado?.guia) return
      soltarLosBloqueos(t)
      retirarLaGuia(t.enclavado)
      ultimas.current.alCambiarElEnclavado?.(estadoDelEnclavado(t.enclavado, ultimas.current.medidasDelFoco ?? null, ultimas.current.clavoPrevistoMm ?? null))
      t.decir?.('Guía retirada: el canal vuelve a estar sin fresar.')
      t.pedirDibujo?.()
    },

    volverACubrirElPeriostio: () => {
      const t = taller.current
      if (!t.periostio) return
      volverACubrir(t.periostio)
      ultimas.current.alCambiarElPeriostio?.(null)
      t.pedirDibujo?.()
    },

    estadoDelPeriostio: () => {
      const p = taller.current.periostio
      return p && p.huellas.length > 0 ? estadoDelPeriostio(p, ultimas.current.instrumento?.eleva?.anchoMm ?? 0) : null
    },

    fijarLaPlaca: (fijar) => {
      const placa = taller.current.implantes?.placa
      if (!placa) return
      placa.fijada = fijar
      // ¿Se despegó el periostio donde va la placa? (P-005 E2). Es un consejo y no una traba: se dice y se sigue.
      let consejoDelPeriostio: string | null = null
      if (fijar) {
        const mm = ultimas.current.milimetrosPorUnidad
        const periostio = taller.current.periostio
        const centros = placa.agujerosMm.map((_, i) => {
          const c = posicionDelAgujero(placa, i, 'abajo')
          return { x: c.x * mm, y: c.y * mm, z: c.z * mm }
        })
        const sin = agujerosSobrePeriostio(periostio?.huellas ?? [], centros)
        consejoDelPeriostio = juicioDeLaExposicion({
          areaMm2: periostio ? estadoDelPeriostio(periostio, 0).areaMm2 : 0,
          huellas: periostio?.huellas.length ?? 0,
          agujerosTotal: centros.length,
          agujerosSinExponer: sin,
        }).aviso
      }
      taller.current.decir?.(
        fijar
          ? `Placa fijada. Ahora se perfora por cada agujero, se mide y se atornilla.${consejoDelPeriostio ? ` ${consejoDelPeriostio}` : ''}`
          : 'Placa suelta: se puede ajustar otra vez. Lo perforado en sus agujeros se conserva.',
      )
      ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current), {
        tipo: 'placa',
        texto: fijar ? `${placa.nombre} fijada.${consejoDelPeriostio ? ` ${consejoDelPeriostio}` : ''}` : `${placa.nombre} suelta para ajustarla.`,
        atencion: !!consejoDelPeriostio,
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

    // Todas las heridas de todas las capas: las profundas están debajo de la de la piel, así que la caja es casi la
    // misma, y con la piel ya cerrada queda la del músculo. Los puntos del trazo están en el mundo (`heridas.ts`).
    encuadrarLaHerida: () => {
      const t = taller.current
      const { camara, controles } = t
      if (!camara || !controles) return false
      const puntos: [number, number, number][] = []
      const normales: [number, number, number][] = []
      for (const lista of t.heridas.values()) {
        for (const h of lista) {
          for (const p of h.trazo.puntos) puntos.push([p.x, p.y, p.z])
          for (const n of h.trazo.normales) normales.push([n.x, n.y, n.z])
        }
      }
      const encuadre = encuadreDeLaHerida(
        puntos,
        normales,
        poseActual(camara, controles),
        { fovGrados: camara.fov, aspecto: camara.aspect },
        1 / (ultimas.current.milimetrosPorUnidad || 1000),
      )
      if (!encuadre) return false
      llevarLaCamaraAlEncuadre(t, encuadre)
      return true
    },

    encuadreActual: () => {
      const { camara, controles } = taller.current
      if (!camara || !controles) return null
      const pose = poseActual(camara, controles)
      return {
        direccion: pose.direccion,
        arriba: pose.arriba,
        centro: controles.target.toArray() as [number, number, number],
        distancia: camara.position.distanceTo(controles.target),
      }
    },

    irAlEncuadre: (encuadre, posicion, ms) => {
      const t = taller.current
      t.posicion = posicion ?? undefined
      llevarLaCamaraAlEncuadre(t, encuadre, ms)
    },

    instantanea: () => {
      const t = taller.current
      let colocado = ''
      try {
        colocado = serializarLoColocado(t)
      } catch (error) {
        console.error('[simulador] no se pudo leer lo colocado:', error)
      }
      return { sesion: serializarSesion(t), colocado }
    },

    prepararLaVuelta: (instantanea) => {
      // Desde aquí este lienzo no guarda nada: lo siguiente es desmontarlo, y el último guardado —el del desmontaje—
      // pisaría lo que se deja para el lienzo nuevo.
      taller.current.sinGuardar = true
      const clave = ultimas.current.claveDeSesion
      if (!clave) return
      try {
        if (instantanea.sesion) sessionStorage.setItem(clave, instantanea.sesion)
        else sessionStorage.removeItem(clave)
        if (instantanea.colocado) sessionStorage.setItem(`${clave}:colocado`, instantanea.colocado)
        else sessionStorage.removeItem(`${clave}:colocado`)
      } catch {
        // Sin almacenamiento el lienzo nuevo empieza vacío: es lo único que se puede hacer.
      }
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
    // El aspecto que suelta el desmontaje es el de este montaje: la referencia no cambia, pero así se lee sin dudas.
    const aspectoDelMontaje = aspecto.current

    let vivo = true
    // Cuánto detalle pedir: el de siempre, y menos si el navegador ya le quitó el contexto a esta página (`calidadDelDibujo`). Con
    // `high-performance` se prefiere la tarjeta dedicada, que tiene más memoria que la integrada.
    const calidad = calidadDelDibujo(perdidasDeContexto)
    // El renderizador es lo único que se pierde con el contexto gráfico; la escena y todo lo puesto en ella viven en la memoria normal. Por eso es una variable:
    // si el navegador no devuelve el contexto, `reemplazarElRenderizador` pone otro y sigue con la misma escena, sin perder nada de lo hecho.
    let render = new THREE.WebGLRenderer({ antialias: calidad.suavizado, alpha: true, powerPreference: 'high-performance' })
    prepararElRenderizador(render, calidad)
    render.setPixelRatio(razonDePixeles(devicePixelRatio, contenedor.clientWidth, contenedor.clientHeight, calidad.razonMaxima))
    render.setSize(contenedor.clientWidth, contenedor.clientHeight)
    // Los manejadores de puntero cuelgan de esta superficie y no del lienzo, que cambia si hay que reemplazar el renderizador.
    const superficie = document.createElement('div')
    superficie.style.cssText = 'position:absolute;inset:0'
    contenedor.appendChild(superficie)
    superficie.appendChild(render.domElement)

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

    // La luz del pabellón (D-226): la lámpara con su sombra, la satélite y la frontal. Se coloca sobre el modelo al cargarlo.
    const pabellon = montarElPabellon(escena, calidad)

    let sucio = true
    const pedirDibujo = () => {
      sucio = true
    }
    controles.addEventListener('change', pedirDibujo)

    // El contexto de WebGL (P-004 E2). El navegador puede quitárselo a la página —memoria de la tarjeta, cambio de
    // gráfica— y three.js, sin `preventDefault`, no lo deja volver: el lienzo quedaba en blanco para siempre. Con él, el
    // navegador lo devuelve solo y three.js vuelve a subir lo que haga falta en el siguiente dibujo; si no vuelve, la
    // consola ofrece montar el lienzo de nuevo (`controlDelContexto.ts`).
    let estadoDelContexto: EstadoDelContexto = CONTEXTO_VIVO
    const decirElContexto = (nuevo: EstadoDelContexto) => {
      estadoDelContexto = nuevo
      ultimas.current.alCambiarElContexto?.(nuevo)
    }
    // La tarjeta se lee una vez, con el contexto vivo: perdido, ya no se puede preguntar.
    const nombreDeLaTarjeta = (() => {
      try {
        const gl = render.getContext()
        const extension = gl.getExtension('WEBGL_debug_renderer_info')
        return extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : 'desconocida'
      } catch {
        return 'desconocida'
      }
    })()
    /** Deja constancia de lo que había cuando se perdió el contexto (`diagnosticoDelLienzo.ts`): sin ella, la causa son sospechas. */
    const anotarLaPerdida = () => {
      try {
        let objetos = 0
        let vertices = 0
        escena.traverse((o) => {
          objetos += 1
          const posicion = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.getAttribute('position') : undefined
          if (posicion) vertices += posicion.count
        })
        const memoria = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        const tt = taller.current
        const registro: RegistroDeUnaPerdida = {
          cuando: new Date().toISOString(),
          tarjeta: nombreDeLaTarjeta,
          pixeles: { ancho: render.domElement.width, alto: render.domElement.height, razon: render.getPixelRatio() },
          geometrias: render.info.memory.geometries,
          texturas: render.info.memory.textures,
          programas: render.info.programs?.length ?? 0,
          objetos,
          verticesM: Math.round(vertices / 1e5) / 10,
          memoriaJsMb: memoria ? Math.round(memoria.usedJSHeapSize / 1048576) : null,
          carga: {
            tornillos: tt.implantes?.tornillos.size ?? 0,
            trozosDeInjerto: tt.injerto?.cuenta ?? 0,
            huellasDePeriostio: tt.periostio?.huellas.length ?? 0,
            clavo: !!tt.enclavado?.clavo,
            placa: !!tt.implantes?.placa,
          },
          perdidasEnEsteEquipo: perdidasDeContexto,
          pestana: document.visibilityState === 'visible' ? 'visible' : 'oculta',
        }
        guardarDiagnostico(registro)
        console.warn('[simulador] se perdió el contexto gráfico:', registro, causaProbable(registro))
      } catch {
        // el diagnóstico nunca debe impedir recuperar la vista
      }
    }
    // Se asigna más abajo, cuando existen el bucle y lo que depende del renderizador.
    let reemplazarElRenderizador: () => boolean = () => false
    let relojDelReemplazo = 0
    const alPerderElContexto = (evento: Event) => {
      evento.preventDefault()
      perdidasDeContexto += 1
      guardarLasPerdidas(perdidasDeContexto)
      anotarLaPerdida()
      decirElContexto(alPerderse(estadoDelContexto, performance.now()))
      // Unos segundos para que el navegador lo devuelva solo; si no, otro renderizador con la misma escena: lo hecho no se pierde.
      window.clearTimeout(relojDelReemplazo)
      relojDelReemplazo = window.setTimeout(() => {
        if (vivo && estadoDelContexto.fase === 'perdido') reemplazarElRenderizador()
      }, ESPERA_ANTES_DE_REEMPLAZAR_EL_RENDERIZADOR_MS)
    }
    const alRecuperarElContexto = () => {
      decirElContexto(alRestaurarse(estadoDelContexto, performance.now()))
      // La imagen de la fluoroscopia y su toma eran del contexto de antes: se hacen olvidar para que la próxima se repita.
      reiniciarLaFluoroscopia(taller.current.fluoroscopia)
      rehacerLaSala(render)
      sucio = true
    }
    const escucharElContexto = (lienzoNuevo: HTMLCanvasElement) => {
      lienzoNuevo.addEventListener('webglcontextlost', alPerderElContexto)
      lienzoNuevo.addEventListener('webglcontextrestored', alRecuperarElContexto)
    }
    escucharElContexto(render.domElement)

    // La sala del pabellón que reflejan el instrumental y las placas (ver `aplicarEntorno`) y, flojita, todo lo demás.
    let pmrem = new THREE.PMREMGenerator(render)
    let entorno = crearEntornoDePabellon(pmrem)
    ponerLaSala(escena, entorno)
    // La oclusión ambiental, solo con la calidad entera: tras perder el contexto una vez se deja de calcular (`calidadDelDibujo`).
    let oclusion: Oclusion | null = calidad.oclusion ? crearOclusion(escena, camara) : null
    oclusion?.tamano(render.domElement.width, render.domElement.height)
    /**
     * La sala de reflejos es una textura de la tarjeta: con el contexto se pierde, tanto si el navegador lo devuelve como si hay que poner otro renderizador.
     * Se vuelve a dibujar con `r` y se les pone a los materiales que llevaban la de antes (instrumentos, placa, tornillos).
     */
    const rehacerLaSala = (r: THREE.WebGLRenderer) => {
      const entornoViejo = entorno
      pmrem = new THREE.PMREMGenerator(r)
      entorno = crearEntornoDePabellon(pmrem)
      ponerLaSala(escena, entorno)
      taller.current.entorno = entorno
      escena.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
          const conReflejo = material as THREE.MeshStandardMaterial
          if (conReflejo.envMap === entornoViejo) {
            conReflejo.envMap = entorno
            conReflejo.needsUpdate = true
          }
        }
      })
    }

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
      if (!clave || taller.current.sinGuardar) return
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
      if (!guardado || (guardado.v !== 1 && guardado.v !== 2 && guardado.v !== 3)) return
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
      // Separadores, pinzas, pinzas de reducción y músculos retraídos (sesión v3): lo que se había puesto sobre la herida.
      restaurarLoPuesto(t, ultimas.current, guardado)
      if (heridas.length > 0) ultimas.current.alHerir?.(estadoDeLasHeridas(t, mmPorUnidad))
      const hilo = guardado.sutura
      if (hilo && t.escena && hilo.puntos.length > 0) {
        const sutura = crearSutura(t.escena, hilo.hilo)
        sutura.tension = hilo.tension
        sutura.tensiones = hilo.tensiones ?? {}
        sutura.puntos = hilo.puntos.map((q) => ({
          punto: q.base,
          base: q.base,
          normal: q.normal,
          lado: q.lado,
          nuevaLinea: q.nuevaLinea,
          plano: q.plano,
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
    // Lo colocado sobre el hueso (placa, tornillos, clavo, injertos…) se guarda aparte, con la misma clave y el mismo ritmo (`sesionDeLoColocado.ts`). Mientras se restaura no se
    // guarda: la escena todavía está a medias y lo guardado se pisaría con menos de lo que había.
    const claveDeLoColocado = () => {
      const clave = claveActual()
      return clave ? `${clave}:colocado` : null
    }
    let ultimoColocado = ''
    let restaurandoLoColocado = false
    const guardarLoColocado = () => {
      const clave = claveDeLoColocado()
      if (!clave || restaurandoLoColocado) return
      if (taller.current.sinGuardar) return
      let texto = ''
      try {
        texto = serializarLoColocado(taller.current)
      } catch (error) {
        console.error('[simulador] no se pudo guardar lo colocado:', error)
        return
      }
      if (texto === ultimoColocado) return
      ultimoColocado = texto
      try {
        if (texto) sessionStorage.setItem(clave, texto)
        else sessionStorage.removeItem(clave)
      } catch {
        // Sin almacenamiento o sin cuota: se sigue sin guardar, la escena no se ve afectada.
      }
    }
    // Lo que hay en el paciente cambió (P-009): se le dice a la consola, que lo apila para «Deshacer». Con el puntero
    // suelto y con la escena ya devuelta: lo que hay mientras se arrastra o mientras se restaura es un estado a medias.
    let escenaLista = false
    let punteroAbajo = false
    let ultimaEscena: string | null = null
    const alBajarElPuntero = () => {
      punteroAbajo = true
    }
    const alSoltarElPuntero = () => {
      punteroAbajo = false
    }
    superficie.addEventListener('pointerdown', alBajarElPuntero, true)
    window.addEventListener('pointerup', alSoltarElPuntero, true)
    window.addEventListener('pointercancel', alSoltarElPuntero, true)
    const avisarDeLaEscena = () => {
      const avisar = ultimas.current.alCambiarLaEscena
      if (!avisar || !escenaLista || punteroAbajo || restaurandoLoColocado || taller.current.sinGuardar) return
      const escena = `${ultimoGuardado}\u0000${ultimoColocado}`
      if (escena === ultimaEscena) return
      ultimaEscena = escena
      avisar({ sesion: ultimoGuardado, colocado: ultimoColocado })
    }
    const reloj = window.setInterval(() => {
      guardarSesion()
      guardarLoColocado()
      avisarDeLaEscena()
    }, 600)

    /** Después de restaurar, la consola se entera de lo que volvió: su panel no sabe nada de lo que pasó antes de recargar. */
    const avisarLoRestaurado = () => {
      const tt = taller.current
      const u = ultimas.current
      const f = tt.fragmento
      const origen = tt.origenDelFragmento
      if (f && origen) {
        // La consola recalcula desplazamiento, angulación y diástasis con el fragmento donde quedó.
        u.alMoverFragmento?.(desplazamientoDesde(origen.posicion, f.position), {
          x: grados(f.rotation.x - origen.rotacion.x),
          y: grados(f.rotation.y - origen.rotacion.y),
          z: grados(f.rotation.z - origen.rotacion.z),
        })
      }
      u.alFijar?.(estadoDeLaFijacion(tt))
      if (tt.alambres && tt.alambres.length > 0) u.alCambiarLosAlambres?.(resumenDeLosAlambres(tt.alambres))
      if (tt.periostio && tt.periostio.huellas.length > 0) u.alCambiarElPeriostio?.(estadoDelPeriostio(tt.periostio, 0))
      if (tt.enclavado) u.alCambiarElEnclavado?.(estadoDelEnclavado(tt.enclavado, u.medidasDelFoco ?? null, u.clavoPrevistoMm ?? null))
      u.alCambiarElInjerto?.(lecturaDelInjerto())
      u.alCambiarElLimitador?.(tt.limitadorNm ?? null)
      const tray = tt.trayectoriaDelTornillo
      if (tray) u.alCambiarLaTrayectoria?.({ fase: 'lista', largoMm: tray.largoMm, anguloConElEje: tray.anguloConElEje })
      tt.decir?.(u.avisoAlRecuperar ?? 'Se recuperó lo que había puesto en el paciente.')
      tt.pedirDibujo?.()
    }
    const restaurarLoGuardado = async () => {
      const clave = claveDeLoColocado()
      if (!clave) return
      let texto: string | null = null
      try {
        texto = sessionStorage.getItem(clave)
      } catch {
        texto = null
      }
      if (!texto) return
      ultimoColocado = texto
      restaurandoLoColocado = true
      try {
        const hubo = await restaurarLoColocado(texto, {
          t: taller.current,
          milimetrosPorUnidad: ultimas.current.milimetrosPorUnidad || 1000,
          ejeLargo: ultimas.current.ejeLargo,
          huesos: () => mallasDeHueso(),
          vivo: () => vivo,
        })
        if (hubo && vivo) avisarLoRestaurado()
      } catch (error) {
        console.error('[simulador] no se pudo restaurar lo colocado:', error)
      } finally {
        restaurandoLoColocado = false
      }
    }

    /**
     * Con los decodificadores de compresión puestos.
     *
     * Sin ellos, un `.glb` exportado con «Comprimir» desde Blender —que es lo
     * que la guía del traumatólogo le pide hacer en cuanto el archivo pasa de
     * unos pocos MB, y lo que hace falta para que una pierna entera quepa bajo
     * el techo de 20 MB— no se abre. Y no se abre **en silencio**: el lienzo se
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
    cargarElArchivo(
      cargador,
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
        // Antes de buscar nada por nombre: si el modelo se exportó de nuevo o el cargador saneó los nombres, las piezas del caso se reconocen igual.
        renombrarSegunElCaso(raiz, ultimas.current.piezas)
        // Y antes de mover nada: las posiciones reducidas del caso se guardan contra la pose del archivo (P-008 E5).
        registrarPosesDelArchivo(raiz)
        taller.current.fragmento = buscarFragmento(raiz, ultimas.current.piezas)
        const f = taller.current.fragmento
        taller.current.origenDelFragmento = f
          ? { posicion: f.position.clone(), rotacion: f.rotation.clone() }
          : undefined
        aplicarPosicionesReducidas(taller.current, ultimas.current.piezas)
        aplicarPiezas(taller.current, ultimas.current.piezas)
        // Antes de devolver lo de la sesión: las heridas y el vello se rehacen sobre la piel ya vestida.
        const milimetros = ultimas.current.milimetrosPorUnidad || 1000
        vestirElModelo(aspecto.current, raiz, (nombre) => taller.current.rolesAplicados.get(nombre), milimetros)
        pabellon.colocar(new THREE.Box3().setFromObject(raiz))
        oclusion?.escala(milimetros)
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
        // Lo colocado sobre el hueso vuelve después de lo cortado: la placa se asienta sobre el hueso ya en su sitio.
        void restaurarLoGuardado().finally(() => {
          escenaLista = true
        })
        encuadrarVisible(taller.current)
        sucio = true
      },
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
    /** Cambia el trozo elegido y avisa a la consola solo cuando de verdad cambió (el menú de movimiento lo necesita). */
    const elegirLaPieza = (pieza: THREE.Object3D | null) => {
      if (elegida === pieza) return
      elegida = pieza
      ultimas.current.alElegirPieza?.(pieza ? pieza.name || 'trozo' : null)
    }
    taller.current.piezaElegida = () => (elegida ? elegida.name || 'trozo' : null)
    // En «Reducir» el trozo elegido es el de la pinza: soltarla —con un clic, o porque la reducción automática suelta todas— lo
    // deja sin elegir. Antes seguía elegido, y la línea del eje y el menú de movimiento quedaban sobre un hueso que nadie agarraba.
    taller.current.alSoltarLasPinzas = () => {
      if (ultimas.current.modo !== 'reducir' || !elegida) return
      if ((taller.current.pinzasDeReduccion ?? []).some((p) => p.pieza === elegida)) return
      elegirLaPieza(null)
      gizmoAlDia()
      pedirDibujo()
    }
    taller.current.alBorrarElTrazo = () => ultimas.current.alTrazar?.([])
    /**
     * La línea del eje elegido en el menú de movimiento (P-004 E7): una sola, en vez de las siete asas. Es interfaz, como
     * ellas: no se pincha ni la ve la fluoroscopia.
     */
    const lineaDelEje = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    )
    lineaDelEje.renderOrder = 999
    lineaDelEje.visible = false
    lineaDelEje.raycast = () => {}
    lineaDelEje.userData.deInterfaz = true
    escena.add(lineaDelEje)
    /** Los arrastres con un eje elegido: desde dónde empezó y cómo estaba el trozo. */
    let arrastreEnEje: {
      x: number
      y: number
      pivote: THREE.Vector3
      inicial: THREE.Matrix4
      inversaDelPadre: THREE.Matrix4
    } | null = null
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
      if (u.modo !== 'mover' && u.modo !== 'reducir') elegirLaPieza(null)
      const raiz = taller.current.raiz
      const pieza = elegida
      const hay = !!pieza && !!raiz && (u.modo === 'reducir' || !u.moverTodo) && pieza.visible && perteneceA(pieza, raiz)
      // Las siete asas, solo con «Asas libres» (pedido 15). Hasta D-199 salían también mientras no se elegía un eje, que es justo
      // al agarrar el trozo: lo primero que se veía era «el sistema de ejes» con el que Cristóbal se manejaba mal, encima del menú
      // que lo reemplaza. Ahora al agarrar se ve el menú; elegido el eje, su línea.
      manipulador.grupo.visible = hay && !!u.asasLibres
      lineaDelEje.visible = hay && !!u.movimientoPorEje
      if (!hay || !pieza) return
      pieza.updateMatrixWorld(true)
      const donde = pieza.localToWorld(centroLocalDe(pieza))
      manipulador.grupo.position.copy(donde)
      // Un poco menos que el sexto del alto del lienzo: en el editor de casos el lienzo es angosto.
      manipulador.grupo.scale.setScalar(escalaDelGizmo(camara, donde) * 0.8)
      manipulador.mirarA(camara)
      const eje = u.movimientoPorEje
      if (eje) {
        const fisico = ejeFisicoDelMovimiento(eje.accion, eje.eje)
        const v = vectorDelEje(fisico, u.ejeLargo)
        const largo = escalaDelGizmo(camara, donde) * 1.1
        lineaDelEje.position.copy(donde)
        lineaDelEje.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(v[0], v[1], v[2]))
        lineaDelEje.scale.setScalar(largo)
        // Los colores del taller del atlas: X rojo, Y verde, Z azul.
        const letra = letraDelEje(fisico, u.ejeLargo)
        ;(lineaDelEje.material as THREE.LineBasicMaterial).color.set(letra === 'x' ? 0xe5484d : letra === 'y' ? 0x3fb950 : 0x4c8dff)
      }
    }

    taller.current.retirarLaBroca = () => {
      if (perforando) terminarPerforacion()
    }
    taller.current.apagarLaBroca = (encendida) => {
      if (!perforando) return
      perforando.encendida = encendida ?? !perforando.encendida
      if (!perforando.encendida) perforando.avanzando = false
      taller.current.decir?.(perforando.encendida ? 'Broca encendida.' : 'Broca apagada: se queda en el hoyo. Retírela cuando termine.')
      posarBroca(null)
      avisarDeLaBroca(true)
    }
    taller.current.moverLaBroca = (sentido, fino) => {
      if (!perforando) return
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      perforando.profundidad = profundidadTrasLaRueda(perforando.profundidad / unidadesPorMm, perforando.maxima / unidadesPorMm, sentido, fino) * unidadesPorMm
      posarBroca(null)
      avisarDeLaBroca(true)
    }
    /**
     * A dónde mira el arco al «Centrar en la broca» (pedidos 3 y 13): la mitad del recorrido por el hueso —de la entrada a la
     * cortical opuesta, o hasta la punta si ya se pasó—, que es donde se lee cuánto falta. Del tornillo que entra, la mitad de
     * su recorrido final; del medidor, su punta, que es la que toca la cortical opuesta.
     */
    taller.current.puntoDelInstrumentoPuesto = () => {
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      if (perforando) return perforando.entrada.clone().addScaledVector(perforando.dirEntra, Math.max(perforando.profundidad, perforando.salidaPorLaOpuesta) / 2)
      if (atornillando) return atornillando.asentado.clone().addScaledVector(atornillando.salida, (atornillando.entrada.datos.largoMm / 2) * unidadesPorMm)
      const herramienta = taller.current.herramienta
      if (taller.current.medidorEnElOrificio && herramienta?.raiz.visible) return herramienta.raiz.getWorldPosition(new THREE.Vector3())
      return null
    }

    /**
     * Mueve el trozo elegido por un eje del paciente, desde donde está ahora (P-004 E7). Es lo que llaman las flechas del
     * teclado: cada pulsación es un paso, y la cuenta parte de la matriz de ahora porque no hay un «agarre» que la fije.
     */
    taller.current.moverPorEje = (accion, eje, valor) => {
      const pieza = elegida
      const raiz = taller.current.raiz
      if (!pieza || !raiz || !perteneceA(pieza, raiz)) return null
      const u = ultimas.current
      const t = taller.current
      const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
      const origenes = (t.origenesDePiezas ??= new Map())
      if (!origenes.has(pieza)) origenes.set(pieza, { posicion: pieza.position.clone(), rotacion: pieza.rotation.clone() })
      moverPiezaPorEje(pieza, accion, eje, valor, u.ejeLargo, unidadesPorMm)
      const f = t.fragmento
      const origen = t.origenDelFragmento
      // Mover otro trozo no cambia lo que el caso mide: solo el fragmento declarado alimenta las medidas.
      if (f && origen && (pieza === f || perteneceA(pieza, f))) {
        u.alMoverFragmento?.(desplazamientoDesde(origen.posicion, f.position), {
          x: grados(f.rotation.x - origen.rotacion.x),
          y: grados(f.rotation.y - origen.rotacion.y),
          z: grados(f.rotation.z - origen.rotacion.z),
        })
      }
      const lectura = lecturaDelMovimiento(accion, eje, valor)
      t.decir?.(lectura)
      pedirDibujo()
      return lectura
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
      // Con un músculo elegido para cortar (P-003 E10) la incisión se apoya en **ese** músculo aunque otros lo tapen:
      // el rayo pasa de largo por lo que hay encima, como la hoja que va a ese plano. Si apunta a otra cosa, se queda
      // con la primera superficie y el corte avisa de que no atraviesa el músculo elegido.
      const elegido = ultimas.current.musculoObjetivo
      if (elegido?.accion === 'cortar' && ultimas.current.modo === 'trazar') {
        const delMusculo = golpes.find((g) => g.object.name === elegido.nodo)
        if (delMusculo) return delMusculo
      }
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
      /** Va por la trayectoria de dos clics y no por un agujero de placa ni por la normal del hueso (P-004 E9). */
      libre?: boolean
      /** Cuánto se corrió del centro del orificio oval, con signo y en mm (P-004 E10). */
      desviacionMm?: number
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
      /**
       * La broca que perfora, tal como era al engancharla (P-004 E8): retirarla puede ocurrir después de cambiar de instrumento
       * —cambiar de instrumento con una puesta la retira—, y el calibre que se anota es el de esta, no el de la que ahora se
       * lleva en la mano.
       */
      config: { diametroMm: number; avanceMmPorSegundo: number; alambre?: boolean }
      /** El botón del ratón está pulsado: solo entonces avanza por el tiempo. Soltarlo no retira la broca. */
      avanzando: boolean
      /** Gira: apagarla la detiene sin retirarla. */
      encendida: boolean
    }
    let perforando: Perforacion | null = null
    /**
     * El tornillo de placa que está entrando (pedido 13): el clic lo deja en la entrada del agujero y la rueda lo mete. Mientras
     * entra no está en `implantes.tornillos` —no cuenta, no se guarda en la sesión ni se juzga—; entra al asentar la cabeza.
     */
    interface TornilloQueEntra {
      agujero: number
      /** Lo que irá a `implantes.tornillos` al asentar: el modelo ya clonado, escalado y con su juicio. */
      entrada: TornilloEnEscena
      /** Dónde queda el modelo con la cabeza apoyada en la placa (la punta es su origen). */
      asentado: THREE.Vector3
      /** El giro del modelo asentado; al meterlo gira sobre `salida` lo que manda el paso de la rosca. */
      giroAsentado: THREE.Quaternion
      /** La normal de la placa: hacia fuera del hueso, por donde asoma lo que falta por meter. */
      salida: THREE.Vector3
      metidoMm: number
      /** Lo que se dice al asentar y que ya se sabía al pinchar: el aviso de la broca equivocada para el diámetro elegido. */
      calibre: string | null
      /** Si al asentar comprime: un orificio oval con un tornillo que no es bloqueado (P-004 E10). */
      oval: boolean
      desviacionMm: number
    }
    let atornillando: TornilloQueEntra | null = null
    let ultimoAvisoDeLaBroca = 0
    /** Cuenta qué se le avisa a la consola de la broca puesta: la lectura y si gira. Se pide con `forzar` en un cambio de verdad. */
    const avisarDeLaBroca = (forzar = false) => {
      const p = perforando
      const aviso = ultimas.current.alCambiarLaBroca
      if (!aviso) return
      const ahora = performance.now()
      if (!forzar && ahora - ultimoAvisoDeLaBroca < 100) return
      ultimoAvisoDeLaBroca = ahora
      if (!p) {
        aviso(null)
        return
      }
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      aviso({
        lectura: lecturaDeLaBroca(p.profundidad / unidadesPorMm, p.salidaPorLaOpuesta / unidadesPorMm),
        encendida: p.encendida,
        diametroMm: p.config.diametroMm,
        agujero: p.agujero !== undefined ? p.agujero + 1 : undefined,
      })
    }
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
      // Los instrumentos profundos cortan el músculo, pero la fascia está en medio: el primer trazo profundo abre la
      // fascia y el segundo llega al músculo (P-006, E10). Sin fascia visible en el campo se corta el músculo como siempre.
      const { plano: planoQueSeCorta, redirigido } = planoQueCorta(plano, {
        hayFascia: mallasConRol(t, u.piezas, ['fascia']).length > 0,
        fasciaAbierta: (t.heridas?.get('fascia')?.length ?? 0) > 0,
      })
      // Profundizar sin la piel tomada con pinzas: es lo que se avisa, no lo que se impide.
      if (planoQueSeCorta !== 'piel' && (t.heridas?.get('piel')?.length ?? 0) > 0) {
        const aviso = adviertePorLaTension(tensionDeLaPiel((t.pellizcos ?? []).map((q) => q.datos)))
        if (aviso) u.alGesto?.(aviso, 'atencion')
      }
      aplicarElCorte(planoQueSeCorta, { quemado })
      if (redirigido && (t.heridas?.get('fascia')?.length ?? 0) > 0) u.alGesto?.(AVISO_DE_LA_FASCIA, 'bien')
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
      // Las piezas del plano, que para el muscular son también sus vasos y sus nervios (P-012 E6): el bisturí profundo
      // los alcanza como alcanza el músculo, y por eso cortarlos se puede. La disección roma, no: aparta lo que encuentra
      // en vez de partirlo, y el vaso se queda cruzando la herida, que es como se lo ve en pabellón.
      const nombres = new Set(
        ultimas.current.piezas
          .filter((p) => planoDelRol(p.rol) === plano && !(deDiseccion && esEstructuraNoble(p.rol)))
          .map((p) => p.nodo),
      )
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
        const capa = plano === 'piel' ? 'piel' : plano === 'fascia' ? 'fascia' : 'músculo'
        aviso(
          nombres.size === 0
            ? `Ninguna pieza de este modelo es ${capa}: márquela en «Piezas» del editor del caso (o «Rellenar desde el modelo»).`
            : plano === 'piel'
              ? 'No hay piel visible que cortar: encienda la capa «Piel».'
              : plano === 'fascia'
                ? 'No hay fascia visible que cortar: encienda la capa «Fascia».'
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
      // Lo que ya estaba cortado antes de este trazo, mirado antes de cerrar la incisión que se alarga: alargarla la
      // cierra y la corta otra vez entera, y el vaso que partió la primera mitad no es otra lesión (P-012 E6).
      const yaCortadas = new Set([...(t.heridas?.values() ?? [])].flat().map((h) => h.malla.name))
      if (id === undefined) id = t.siguienteIncision = (t.siguienteIncision ?? 0) + 1
      else t.siguienteIncision = Math.max(t.siguienteIncision ?? 0, id)
      // La incisión de antes que se alarga o se reemplaza se cierra para hacerla de nuevo: sus separadores y sus
      // pinzas se quedan, son suyos.
      if (previo) cerrarLaIncision(t, id, { conSusSeparadores: true })

      const puntos = puntosDelCorte.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      const normales = normalesDelCorte.map((n) => new THREE.Vector3(n[0], n[1], n[2]))
      const parametros = {
        // La piel es fina; la fascia y los planos profundos empiezan bajo ella y bajo la grasa.
        profundidad: (plano === 'piel' ? 14 : 50) * unidadesPorMm,
        alcance: 30 * unidadesPorMm,
        unidadesPorMm,
        incision: id,
        // La piel tiene grosor: dermis y grasa entre sus dos caras (D-331), y el corte levanta la pared que se ve al
        // abrir (D-333). La fascia superficial, que se corta con ella, es una lámina y no la encuentra.
        pared: plano === 'piel' ? GROSOR_MAXIMO_DE_LA_PIEL_MM * unidadesPorMm : undefined,
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
      // Un músculo retraído que se corta conserva el sitio en que se lo veía (P-004 E5): la malla nueva parte de esas
      // posiciones, y la retracción de antes —con las originales de la malla vieja— ya no podría deshacerse.
      const cortadosRetraidos = (t.retracciones ?? []).filter((r) => hechas.some((h) => h.malla === r.malla))
      if (cortadosRetraidos.length > 0) {
        t.retracciones = (t.retracciones ?? []).filter((r) => !cortadosRetraidos.includes(r))
        ultimas.current.alRetraer?.(estadoDeLasRetracciones(t))
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
      // Un vaso o un nervio que el trazo de ahora partió es una complicación (P-012 E6). Solo con un trazo de verdad: lo
      // que rehace la sesión o una incisión ya se contó cuando pasó.
      if (!desdeLaSesion && !esRehacer && !deDiseccion) {
        // Antes que las lesiones: si la incisión es de más, el registro lo dice antes que lo que partió.
        if (!previo) ultimas.current.alIncidir?.({ id, capa: plano })
        for (const herida of hechas) {
          if (yaCortadas.has(herida.malla.name)) continue
          const pieza = ultimas.current.piezas.find((p) => p.nodo === herida.malla.name)
          if (!pieza || !esEstructuraNoble(pieza.rol)) continue
          ultimas.current.alLesionar?.({ rol: pieza.rol, nombre: pieza.etiqueta?.trim() || pieza.nodo, como: 'corte' })
        }
      }
      // Un corte nuevo cambia la piel por debajo de las puntadas de antes: se quitan, y con ellas lo que
      // habían cerrado. Sin esto la sutura vieja seguía diciendo «cerrada al 100 %» sobre una herida abierta.
      t.aperturaAntesDeCoser = undefined
      if (t.sutura && t.sutura.puntos.length > 0) {
        t.sutura.puntos.length = 0
        t.sutura.tension = 0
        t.sutura.tensiones = {}
        t.sutura.planoActivo = undefined
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
    const trayectoriaDeBroca = (
      golpe: THREE.Intersection,
    ): Omit<Perforacion, 'profundidad' | 'maxima' | 'salidaPorLaOpuesta' | 'config' | 'avanzando' | 'encendida'> => {
      const placa = taller.current.implantes?.placa
      const agujero = agujeroParaLaBroca(golpe)
      // Con una trayectoria de dos clics (P-004 E9) y sin un agujero de placa bajo el cursor, la broca va por la línea marcada: entra
      // por la entrada, hacia la salida, y no por la normal del hueso donde se apunte.
      const libre = taller.current.trayectoriaDelTornillo
      if (libre && agujero === null) {
        const eje = VECTOR_DEL_EJE[ultimas.current.ejeLargo]
        return {
          libre: true,
          entrada: libre.entrada.clone(),
          dirEntra: libre.haciaDentro.clone(),
          salida: libre.haciaDentro.clone().negate(),
          anguloConElEje: grados(Math.acos(Math.min(1, Math.abs(libre.haciaDentro.dot(eje))))),
        }
      }
      if (placa && agujero !== null) {
        // Por el eje del agujero: perpendicular a la placa, entrando por la cortical cercana.
        const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
        const eje = VECTOR_DEL_EJE[ultimas.current.ejeLargo]
        const salida = placa.normal.clone()
        const medida = medirBajoElAgujero(placa, agujero, mallasDeHueso())
        const entrada = posicionDelAgujero(placa, agujero, 'abajo').addScaledVector(salida, -(medida?.distanciaAlHuesoMm ?? 0) * unidadesPorMm)
        // En un orificio oval la broca entra donde se eligió, corrida del centro a lo largo de la placa (P-004 E10).
        const desviacionMm = formaDeLosAgujeros({ nombre: placa.nombre }) === 'redondo' ? 0 : (taller.current.desviaciones?.get(agujero) ?? 0)
        if (desviacionMm !== 0) entrada.addScaledVector(ejeDeLaPlaca(placa), desviacionMm * unidadesPorMm)
        return {
          agujero,
          desviacionMm,
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
    // --- las vistas previas: lo que haría el clic, antes de hacerlo (P-009, mejora de uso 8) ----------------------
    // La placa se apoyaba y la broca entraba sin saber antes dónde: se corregía después, quitando la placa o retirando la
    // broca, y en evaluación el intento ya contaba. Ahora, con el instrumento en la mano, se ve antes: la placa de
    // cristal asentada donde quedaría y la línea discontinua por donde iría la broca, de la entrada a la cortical
    // opuesta. Son de interfaz —ni se pinchan ni salen en la fluoroscopia— y se van al cambiar de modo o de
    // instrumento. Cada una se recalcula como mucho veinte veces por segundo: asentar la placa como un sólido y cruzar la
    // broca con el hueso recorren mallas de cientos de miles de triángulos.
    let placaPrevia: ImplantesEnEscena | null = null
    let ultimaPlacaPrevia = 0
    let lineaDeLaBroca: THREE.Line | null = null
    let ultimaLineaDeLaBroca = 0
    let huesoQueAtravesaria: number | null = null
    const esconderLaPlacaPrevia = () => {
      if (!placaPrevia) return
      quitarImplantes(placaPrevia)
      placaPrevia = null
    }
    const esconderLaLineaDeLaBroca = () => {
      huesoQueAtravesaria = null
      if (!lineaDeLaBroca) return
      lineaDeLaBroca.removeFromParent()
      lineaDeLaBroca.geometry.dispose()
      ;(lineaDeLaBroca.material as THREE.Material).dispose()
      lineaDeLaBroca = null
    }
    taller.current.esconderLasVistasPrevias = () => {
      if (!placaPrevia && !lineaDeLaBroca) return
      esconderLaPlacaPrevia()
      esconderLaLineaDeLaBroca()
      pedirDibujo()
    }
    /** La placa de la mano, de cristal y asentada sobre el hueso bajo el cursor. `false` si no hay dónde: se ve la de la mano. */
    const vistaPreviaDeLaPlaca = (): boolean => {
      const t = taller.current
      const inst = ultimas.current.instrumento
      const herramienta = t.herramienta
      if (!t.escena || !herramienta || !inst || inst.coloca?.tipo !== 'placa' || t.implantes?.placa) {
        esconderLaPlacaPrevia()
        return false
      }
      const ahora = performance.now()
      if (ahora - ultimaPlacaPrevia < 50) return !!placaPrevia?.placa?.grupo.visible
      ultimaPlacaPrevia = ahora
      const golpe = huesoBajoElCursor()
      const previa = placaPrevia?.placa
      if (!golpe) {
        if (previa) previa.grupo.visible = false
        return false
      }
      const huesos = mallasDeHueso()
      if (previa) {
        // Donde no se puede asentar, se esconde: dejarla donde estaba diría que la placa iría a otro sitio.
        previa.grupo.visible = reanclarPlaca(previa, huesos, golpe.point, normalDelGolpe(golpe), 0)
        return previa.grupo.visible
      }
      const imp = crearImplantes()
      const eje = new THREE.Vector3(
        ...(ultimas.current.ejeLargo === 'x' ? [1, 0, 0] : ultimas.current.ejeLargo === 'z' ? [0, 0, 1] : [0, 1, 0]),
      )
      const placa = colocarPlaca({
        escena: t.escena,
        plantilla: herramienta.raiz,
        nombre: herramienta.meta?.nombre ?? 'Placa',
        agujerosMm: herramienta.meta?.agujeros ?? [],
        orificios: inst.orificios ?? null,
        punto: golpe.point,
        normal: normalDelGolpe(golpe),
        ejeDelHueso: eje,
        milimetrosPorUnidad: ultimas.current.milimetrosPorUnidad || 1000,
        huesos,
        implantes: imp,
        contorno: t.mesa && t.mesa.instrumentoId && t.mesa.instrumentoId === inst.id ? t.mesa.contorno : undefined,
      })
      if (!placa) return false
      // Un material para todas sus mallas, que `quitarImplantes` suelta con ellas; los clonados de la plantilla se
      // sueltan aquí, que ya no los usa nadie.
      const vidrio = new THREE.MeshStandardMaterial({
        color: 0x8fd3ff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        metalness: 0.1,
        roughness: 0.25,
      })
      placa.grupo.traverse((o) => {
        o.userData.deInterfaz = true
        o.raycast = () => {}
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        for (const material of Array.isArray(m.material) ? m.material : [m.material]) material.dispose()
        m.material = vidrio
        m.renderOrder = 998
      })
      placaPrevia = imp
      return true
    }
    /** La línea por donde iría la broca, de la entrada a la cortical opuesta; devuelve cuánto hueso atravesaría, en mm. */
    const vistaPreviaDeLaBroca = (entrada: THREE.Vector3, direccion: THREE.Vector3): number | null => {
      const escena = taller.current.escena
      if (!escena) return null
      const ahora = performance.now()
      if (ahora - ultimaLineaDeLaBroca < 50) return huesoQueAtravesaria
      ultimaLineaDeLaBroca = ahora
      const mmPorUnidad = ultimas.current.milimetrosPorUnidad || 1000
      const unidadesPorMm = 1 / mmPorUnidad
      // Con la misma cuenta que la broca al empezar a perforar, para que la línea acabe donde la broca va a parar.
      const medida = medirAlLoLargoDeUnaLinea(entrada, direccion, mmPorUnidad, mallasDeHueso())
      if (!medida) {
        esconderLaLineaDeLaBroca()
        return null
      }
      const largo = (medida.distanciaAlHuesoMm + medida.espesorMm) * unidadesPorMm
      if (!lineaDeLaBroca) {
        // Encima de todo (`depthTest` apagado): la línea es lo que va por dentro del hueso, y el hueso la taparía.
        lineaDeLaBroca = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineDashedMaterial({
            color: 0xffd166,
            dashSize: 2 * unidadesPorMm,
            gapSize: 1.5 * unidadesPorMm,
            depthTest: false,
            transparent: true,
          }),
        )
        lineaDeLaBroca.renderOrder = 999
        lineaDeLaBroca.frustumCulled = false
        lineaDeLaBroca.userData.deInterfaz = true
        lineaDeLaBroca.raycast = () => {}
        escena.add(lineaDeLaBroca)
      }
      lineaDeLaBroca.geometry.setFromPoints([entrada, entrada.clone().addScaledVector(direccion, largo)])
      lineaDeLaBroca.computeLineDistances()
      huesoQueAtravesaria = medida.espesorMm
      return huesoQueAtravesaria
    }

    const posarBroca = (golpe: THREE.Intersection | null) => {
      const herramienta = taller.current.herramienta
      const config = ultimas.current.instrumento?.perfora
      // Sin el modelo de la broca se perfora igual y se lee igual (D-176): lo que no hay es broca que mover.
      if (!config) return
      if (!golpe && !perforando) {
        esconderLaLineaDeLaBroca()
        if (herramienta?.raiz.visible) {
          herramienta.raiz.visible = false
          pedirDibujo()
        }
        taller.current.decir?.('')
        return
      }
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const t = perforando ?? trayectoriaDeBroca(golpe!)
      // La línea, solo antes de entrar: con la broca dentro, lo que se ve es la broca.
      let atravesaria: number | null = null
      if (perforando) esconderLaLineaDeLaBroca()
      else atravesaria = vistaPreviaDeLaBroca(t.entrada, t.dirEntra)
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
      // Pasar de largo la cortical opuesta es el error clásico de quien aprende: la broca sigue y lo que hay detrás son
      // partes blandas. Se dice mientras ocurre (`textoDeLaBroca`).
      const base = `Broca Ø ${String(config.diametroMm).replace('.', ',')} mm${t.agujero !== undefined ? ` · agujero ${t.agujero + 1} de la placa` : ''} · ${Math.round(t.anguloConElEje)}° con el eje del hueso`
      taller.current.decir?.(
        perforando
          ? `${base} · ${textoDeLaBroca(lecturaDeLaBroca(profundidad / unidadesPorMm, perforando.salidaPorLaOpuesta / unidadesPorMm), { encendida: perforando.encendida, ayudaDeAprendizaje: !!ultimas.current.ayudas?.objetivo })}`
          : `${base}${atravesaria !== null && ultimas.current.pistas ? ` · atravesaría ${Math.round(atravesaria)} mm de hueso` : ''} · mantenga pulsado para perforar`,
      )
      pedirDibujo()
    }

    const empezarPerforacion = (golpe: THREE.Intersection) => {
      // Con una broca ya puesta, el clic la sigue metiendo por donde iba (P-004 E8): empezar otro hoyo es retirar esta primero,
      // y un clic distraído a un lado no tiene que tirar a la basura el hoyo que se estaba midiendo con el rayo.
      if (perforando) {
        perforando.avanzando = true
        ultimoCuadro = performance.now()
        if (!perforando.encendida) taller.current.decir?.('La broca está apagada: enciéndala («Encender la broca» o Espacio) para seguir.')
        return
      }
      const config = ultimas.current.instrumento?.perfora
      if (!config) return
      const t = trayectoriaDeBroca(golpe)
      const mmPorUnidad = ultimas.current.milimetrosPorUnidad || 1000
      const unidadesPorMm = 1 / mmPorUnidad
      // Hasta dónde se puede ir: la salida por la cortical opuesta en la dirección de la broca, medida como la mide el
      // medidor. Una pierna entera son tres capas de tejido; solo cuenta el hueso. Antes era la última superficie de hueso
      // de la línea, que con el peroné detrás de la tibia era la cara de fuera del peroné (P-009,
      // `salidaPorLaCorticalOpuesta`).
      const medida = medirAlLoLargoDeUnaLinea(t.entrada, t.dirEntra, mmPorUnidad, mallasDeHueso())
      const salidaPorLaOpuesta = (medida ? medida.distanciaAlHuesoMm + medida.espesorMm : 8) * unidadesPorMm
      perforando = {
        ...t,
        profundidad: 0,
        // Se puede pasar de largo: es un error que un residente comete y que
        // conviene que vea y que se le diga.
        maxima: salidaPorLaOpuesta + MARGEN_PARA_PASARSE_MM * unidadesPorMm,
        salidaPorLaOpuesta,
        config: { diametroMm: config.diametroMm, avanceMmPorSegundo: config.avanceMmPorSegundo, alambre: config.alambre },
        avanzando: true,
        encendida: true,
      }
      esconderLaLineaDeLaBroca()
      taller.current.giroDeLaBroca = taller.current.giroDeLaBroca ?? 0
      ultimoCuadro = performance.now()
      avisarDeLaBroca(true)
      pedirDibujo()
    }

    /**
     * Los vasos y los nervios que la broca o la aguja atravesaron al pasarse de la cortical opuesta (P-012 E6), uno por
     * estructura. Solo si se pasó más de lo que se tolera: lo tolerado no le cuesta nada a la nota, y no puede costarle
     * aquí lo que allí no cuesta.
     */
    const avisarDeLoQueAtraviesa = (p: Perforacion, radio: number, unidadesPorMm: number) => {
      const sePaso = Math.max(0, p.profundidad - p.salidaPorLaOpuesta)
      if (sePaso / unidadesPorMm <= PASARSE_DE_LA_CORTICAL_MM) return
      const salida = p.entrada.clone().addScaledVector(p.dirEntra, p.salidaPorLaOpuesta)
      for (const pieza of nobleQueAtraviesa(taller.current, ultimas.current.piezas, salida, p.dirEntra, sePaso, radio)) {
        ultimas.current.alLesionar?.({ rol: pieza.rol, nombre: pieza.etiqueta?.trim() || pieza.nodo, como: 'perforacion' })
      }
    }

    /** La entrada en mm y la dirección de una perforación, para `PerforacionHecha` (D-330). */
    const trayectoriaDeLaBroca = (p: Perforacion, unidadesPorMm: number): Pick<PerforacionHecha, 'entradaMm' | 'direccion'> => ({
      entradaMm: [p.entrada.x / unidadesPorMm, p.entrada.y / unidadesPorMm, p.entrada.z / unidadesPorMm],
      direccion: [p.dirEntra.x, p.dirEntra.y, p.dirEntra.z],
    })

    const terminarPerforacion = () => {
      const p = perforando
      perforando = null
      avisarDeLaBroca(true)
      const config = p?.config
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
      if (config.alambre) {
        // Una aguja de Kirschner (P-005 E3) no deja un túnel vacío: se queda el alambre, asomando por la entrada. Es metal en la escena, no
        // de interfaz, así que la fluoroscopia lo ve; no se puede pinchar para no estorbar a lo que se haga detrás.
        const largoTotal = LARGO_DEL_ALAMBRE_MM * unidadesPorMm
        const alambre = new THREE.Mesh(
          new THREE.CylinderGeometry(radio, radio, largoTotal, 10, 1, false),
          new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.85, roughness: 0.3 }),
        )
        alambre.position.copy(p.entrada).addScaledVector(p.dirEntra, p.profundidad - largoTotal / 2)
        alambre.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.dirEntra)
        alambre.raycast = () => {}
        alambre.name = 'alambre-de-kirschner'
        escenaActual.add(alambre)
        const puestos = (taller.current.alambres ??= [])
        puestos.push({ malla: alambre, profundidadMm: p.profundidad / unidadesPorMm, salidaPorLaOpuestaMm: p.salidaPorLaOpuesta / unidadesPorMm })
        // Un tope: más agujas no enseñan nada y cuestan geometría; la más vieja se va.
        if (puestos.length > MAXIMO_DE_ALAMBRES) {
          const viejo = puestos.shift()!
          viejo.malla.removeFromParent()
          viejo.malla.geometry.dispose()
          ;(viejo.malla.material as THREE.Material).dispose()
        }
        const juicio = juzgarElAlambre(puestos[puestos.length - 1])
        avisarDeLoQueAtraviesa(p, radio, unidadesPorMm)
        ultimas.current.alCambiarLosAlambres?.(resumenDeLosAlambres(puestos))
        taller.current.decir?.(juicio.aviso ?? `Aguja de Kirschner puesta: ${puestos[puestos.length - 1].profundidadMm.toFixed(0)} mm, bicortical.`)
        ultimas.current.alPerforar?.({
          diametroMm: config.diametroMm,
          profundidadMm: p.profundidad / unidadesPorMm,
          anguloConElEje: p.anguloConElEje,
          bicortical: juicio.bicortical,
          sePasoMm: juicio.sePasoMm,
          ...trayectoriaDeLaBroca(p, unidadesPorMm),
        })
        pedirDibujo()
        return
      }
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
      avisarDeLoQueAtraviesa(p, radio, unidadesPorMm)
      // Perforado por la trayectoria de dos clics (P-004 E9): se anota en ella lo mismo que en un agujero de placa, y volver a
      // perforarla borra lo medido, porque el hoyo es otro.
      const porLaTrayectoria = taller.current.trayectoriaDelTornillo
      if (p.libre && porLaTrayectoria) {
        const bicortical = p.profundidad >= p.salidaPorLaOpuesta - 0.5 * unidadesPorMm
        porLaTrayectoria.estado = {
          perforado: { diametroMm: config.diametroMm, profundidadMm: p.profundidad / unidadesPorMm, bicortical },
          medido: null,
        }
        // Cada perforación queda anotada con su calibre y su profundidad: la técnica de la broca de deslizamiento mira lo que se hizo en
        // cada fragmento (P-004 E10).
        porLaTrayectoria.perforaciones.push({ diametroMm: config.diametroMm, profundidadMm: p.profundidad / unidadesPorMm })
        ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current), {
          tipo: 'agujero',
          texto: `Trayectoria perforada con Ø ${String(config.diametroMm).replace('.', ',')} mm (${bicortical ? 'bicortical' : 'solo la cortical cercana'}). Ahora se mide con el medidor.`,
          atencion: !bicortical,
          libre: true,
        })
      }
      // Perforado por un agujero de la placa: queda anotado (diámetro, largo, bicortical); volver a perforarlo borra lo
      // que se había medido, porque el orificio es otro (P-003 E6).
      const placaDelAgujero = taller.current.implantes?.placa
      if (placaDelAgujero && p.agujero !== undefined) {
        const bicortical = p.profundidad >= p.salidaPorLaOpuesta - 0.5 * unidadesPorMm
        placaDelAgujero.agujeros.set(p.agujero, {
          perforado: { diametroMm: config.diametroMm, profundidadMm: p.profundidad / unidadesPorMm, bicortical },
          medido: null,
          ...(p.desviacionMm ? { desviacionMm: p.desviacionMm } : {}),
        })
        // El punto ya no está por brocar: la marca de la placa se va si era la de este orificio (pedido 14).
        taller.current.repasarLaMarcaDeBrocado?.()
        ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current), {
          tipo: 'agujero',
          texto: `Agujero ${p.agujero + 1} perforado con Ø ${String(config.diametroMm).replace('.', ',')} mm (${bicortical ? 'bicortical' : 'solo la cortical cercana'}). Ahora se mide con el medidor.`,
          atencion: !bicortical,
          agujero: p.agujero,
        })
      }
      ultimas.current.alPerforar?.({
        diametroMm: config.diametroMm,
        profundidadMm: p.profundidad / unidadesPorMm,
        anguloConElEje: p.anguloConElEje,
        bicortical: p.profundidad >= p.salidaPorLaOpuesta - 0.5 * unidadesPorMm,
        sePasoMm: sePaso / unidadesPorMm,
        ...trayectoriaDeLaBroca(p, unidadesPorMm),
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
      // Una sola placa (P-004 E6, pedido 2): con una puesta, la que se lleva en la mano no se pinta ni sigue al cursor. Antes
      // salía otra con cada movimiento del ratón y tapaba la posición de la que importaba; la que se mueve es la puesta.
      // Lo mismo con un tornillo entrando (pedido 13): el que importa es el del agujero, no otro pegado al cursor.
      if (
        (ultimas.current.instrumento?.coloca?.tipo === 'placa' && taller.current.implantes?.placa) ||
        (ultimas.current.instrumento?.coloca?.tipo === 'tornillo' && atornillando)
      ) {
        esconderLaPlacaPrevia()
        if (herramienta.raiz.visible) {
          herramienta.raiz.visible = false
          pedirDibujo()
        }
        return
      }
      // Con la placa en la mano y hueso debajo, lo que se ve es la de cristal asentada donde quedaría (P-009): la de la
      // mano, ladeada junto al cursor, no dice dónde va a ir.
      if (ultimas.current.modo === 'fijar' && ultimas.current.instrumento?.coloca?.tipo === 'placa' && vistaPreviaDeLaPlaca()) {
        if (herramienta.raiz.visible) herramienta.raiz.visible = false
        pedirDibujo()
        return
      }
      if (!golpe) {
        taller.current.medidorEnElOrificio = false
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
          // Se queda en el orificio aunque el cursor se vaya a pulsar «Disparar» (P-004 E8, pedido 13): el medidor, como la
          // broca, se usa para saber qué tan hondo estás.
          taller.current.medidorEnElOrificio = true
          taller.current.decir?.(`Medidor en el agujero ${agujero + 1}: hueso de ${medida.espesorMm.toFixed(0)} mm. Haga clic para anotar la medida.`)
          pedirDibujo()
          return
        }
      }
      // Fuera de un orificio, el medidor vuelve a seguir al cursor.
      taller.current.medidorEnElOrificio = false
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
      // Las vistas previas se van con el cursor (P-009): fuera del lienzo no hay dónde caería nada.
      if (!perforando) taller.current.esconderLasVistasPrevias?.()
      const herramienta = taller.current.herramienta
      if (!herramienta?.raiz.visible) return
      // Lo que está puesto en un hoyo no sigue al cursor ni se esconde con él (P-004 E8, pedidos 3 y 13): el rayo muchas veces
      // se usa para saber qué tan profundo vas, y para pedirlo hay que salir del lienzo a pulsar «Disparar».
      if (perforando || taller.current.medidorEnElOrificio) return
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
        // El tope de un autoestático es lo que abre la herida entera, y cada labio se aparta la mitad: con el tope
        // entero por labio, el Weitlaner de 65 mm abría 130 (P-008 E2).
        maximoMm: separa.autoestatico ? separa.maximoMm / 2 : separa.maximoMm,
        aperturaMm: 0,
        incision,
        anchoMm: separa.anchoMm,
        brazoMm: separa.brazoMm,
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
          posarSeparador(nuevo, unidadesPorMm, t.heridas)
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
        t.decir?.(`${igual.datos.nombre}: ya hay uno aquí. Ábralo arrastrando con el botón derecho hacia arriba.`)
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
        const sobre = proyectarEnLaCapa(q, linea.normal, c.plano === 'hueso' ? 'piel' : c.plano, c.herida.malla)
        const s = ponerUnSeparador({ punto: sobre.punto, normal: sobre.normal, direccion: linea.direccion, posicion: linea.t }, l, c.plano, c.herida.incision)
        if (s) hechos.push(s)
      }
      if (hechos.length === 0) return
      reaplicarSeparadores(t, u)
      t.decir?.(
        hechos.length > 1
          ? `${hechos[0].datos.nombre} ×2 colocados ${enElPlano(c.plano)}, uno por borde. Ábralos arrastrando con el botón derecho hacia arriba (con Mayúsculas, solo el que está bajo el cursor).`
          : `${hechos[0].datos.nombre} colocado ${enElPlano(c.plano)}. Ábralo arrastrando con el botón derecho hacia arriba (o con la barra del panel).`,
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
      lista.push({ id, nombre: inst.nombre ?? 'Pinza de reducción', pieza, instrumento: colocado, url: inst.url, ajustes: inst.ajustes })
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
        const capas: CapaDeLaHerida[] = plano === 'hueso' ? [...PLANOS_BLANDOS] : [plano]
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
          : capa === 'fascia'
            ? 'Punta apoyada en la fascia. Abra las ramas arrastrando con el botón derecho hacia arriba: la fascia se separa del músculo por tensión.'
            : 'Punta apoyada en el músculo. Abra las ramas arrastrando con el botón derecho hacia arriba.',
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

    /** Lleva un punto a la superficie de una capa (la piel, la fascia, el músculo), bajando por la normal: no se apoya en el aire. */
    const proyectarEnLaCapa = (q: THREE.Vector3, n: THREE.Vector3, capa: PlanoBlando, respaldo: THREE.Object3D) => {
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
      t.decir?.('Pinzas puestas, una frente a la otra. Arrastrar con el botón derecho las separa o las junta; con Mayúsculas abre o cierra las mandíbulas.')
    }

    // --- la mesa de modelado (P-005 E1) -----------------------------------------------------------------
    // Un clic sobre la placa apunta al sitio donde actuará el alicate o la grifa; arrastrarla la mueve sobre el plano de la pantalla, como se
    // empuja una placa sobre la mesa. Fuera de la placa el arrastre sigue siendo el de la cámara.
    let sobreLaMesa: { x: number; y: number; plano: THREE.Plane; ultimo: THREE.Vector3; punto: THREE.Vector3; movido: boolean } | null = null
    const avisarLaMesa = () => {
      const mesa = taller.current.mesa
      ultimas.current.alCambiarLaMesa?.(mesa ? estadoDeLaMesa(mesa) : null)
    }
    const alBajarEnLaMesa = (evento: PointerEvent) => {
      const mesa = taller.current.mesa
      if (ultimas.current.modo !== 'modelar' || evento.button !== 0 || !mesa) return
      aCoordenadas(evento)
      mesa.grupo.updateMatrixWorld(true)
      const golpe = rayo.intersectObject(mesa.grupo, true).find((g) => g.object.visible && (g.object as THREE.Mesh).isMesh)
      if (!golpe) return
      controles.enabled = false
      const normal = camara.getWorldDirection(new THREE.Vector3()).negate()
      sobreLaMesa = {
        x: evento.clientX,
        y: evento.clientY,
        plano: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, golpe.point),
        ultimo: golpe.point.clone(),
        punto: golpe.point.clone(),
        movido: false,
      }
      try {
        render.domElement.setPointerCapture(evento.pointerId)
      } catch {
        // sin captura
      }
    }
    const alMoverEnLaMesa = (evento: PointerEvent) => {
      const mesa = taller.current.mesa
      if (!sobreLaMesa || !mesa) return
      if (!sobreLaMesa.movido && Math.hypot(evento.clientX - sobreLaMesa.x, evento.clientY - sobreLaMesa.y) < 4) return
      sobreLaMesa.movido = true
      aCoordenadas(evento)
      const aqui = new THREE.Vector3()
      if (!rayo.ray.intersectPlane(sobreLaMesa.plano, aqui)) return
      mesa.grupo.position.add(aqui.clone().sub(sobreLaMesa.ultimo))
      sobreLaMesa.ultimo.copy(aqui)
      pedirDibujo()
    }
    const alSoltarEnLaMesa = (evento: PointerEvent) => {
      const gesto = sobreLaMesa
      sobreLaMesa = null
      if (!gesto) return
      controles.enabled = true
      try {
        render.domElement.releasePointerCapture(evento.pointerId)
      } catch {
        // ya estaba suelto
      }
      const mesa = taller.current.mesa
      if (!mesa || gesto.movido) return
      ponerLaMarca(mesa, sitioDeUnPunto(mesa, gesto.punto))
      avisarLaMesa()
      pedirDibujo()
    }
    superficie.addEventListener('pointerdown', alBajarEnLaMesa)
    superficie.addEventListener('pointermove', alMoverEnLaMesa)
    superficie.addEventListener('pointerup', alSoltarEnLaMesa)

    // --- arrastrar la placa puesta (P-008 E4) --------------------------------------------------------------------
    // Con la placa apoyada y sin fijar, en modo Fijar: pulsar sobre ella y arrastrar la lleva por el hueso a donde apunte
    // el cursor, también a la otra cara; mientras se arrastra, la rueda la gira sobre su normal (Mayúsculas, de a 1°).
    // Antes solo se corría con las cifras del panel y dentro de un rango medido desde donde se apoyó, y el dueño pidió
    // poder dejarla «como se quiere, en cualquier posición». Fuera de la placa, el arrastre sigue siendo el de la cámara;
    // y un clic sobre ella ya no la vuelve a apoyar en el sitio del clic, que era lo que hacía antes sin querer.
    let arrastreDeLaPlaca: { x: number; y: number; xDelGiro: number; desfase: THREE.Vector3; giro: number; movido: boolean; ultimo: number } | null = null
    const alBajarSobreLaPlaca = (evento: PointerEvent) => {
      const placa = taller.current.implantes?.placa
      if (ultimas.current.modo !== 'fijar' || evento.button !== 0 || !placa || placa.fijada || ultimas.current.marcandoLaTrayectoria) return
      aCoordenadas(evento)
      placa.grupo.updateMatrixWorld(true)
      const enLaPlaca = rayo.intersectObject(placa.grupo, true).find((g) => g.object.visible && (g.object as THREE.Mesh).isMesh)
      // Pinchar en un agujero también es agarrar la placa: el rayo pasa por el hueco y da en el hueso, y en una placa de
      // agujeros impares el centro es justo un agujero.
      const hueso = huesoBajoElCursor()
      if (!enLaPlaca && !(hueso && agujeroBajoElPunto(placa, hueso.point, 6) !== null)) return
      // Lo que hay del punto agarrado al punto de apoyo: así la placa no salta a centrarse en el cursor al empezar a moverla.
      const agarrado = hueso?.point ?? enLaPlaca!.point
      arrastreDeLaPlaca = { x: evento.clientX, y: evento.clientY, xDelGiro: evento.clientX, desfase: apoyoDeLaPlaca(placa).sub(agarrado), giro: placa.ajuste.giroGrados, movido: false, ultimo: 0 }
      controles.enabled = false
      // Los demás que escuchan el clic (coser, fijar con clic) no lo ven: el gesto es de la placa.
      evento.stopImmediatePropagation()
      try {
        render.domElement.setPointerCapture(evento.pointerId)
      } catch {
        // sin captura
      }
    }
    const llevarLaPlaca = () => {
      const a = arrastreDeLaPlaca
      const placa = taller.current.implantes?.placa
      if (!a || !placa) return
      const golpe = huesoBajoElCursor()
      if (!golpe) return
      if (reanclarPlaca(placa, mallasDeHueso(), golpe.point.clone().add(a.desfase), normalDelGolpe(golpe), a.giro)) pedirDibujo()
    }
    const alMoverLaPlaca = (evento: PointerEvent) => {
      const a = arrastreDeLaPlaca
      if (!a) return
      if (!a.movido && Math.hypot(evento.clientX - a.x, evento.clientY - a.y) < 4) return
      a.movido = true
      // Como el instrumento que sigue al cursor: unos treinta por segundo, que cada asiento lanza cuatro rayos al hueso.
      const ahora = performance.now()
      if (ahora - a.ultimo < 33) return
      a.ultimo = ahora
      // Con Mayúsculas el arrastre la gira sobre su apoyo en vez de llevarla (P-009): era la rueda, que ahora solo
      // acerca. Un grado cada cuatro píxeles a lo ancho; al soltar Mayúsculas se sigue llevando desde donde quedó.
      if (evento.shiftKey) {
        const placa = taller.current.implantes?.placa
        const grados = Math.trunc((evento.clientX - a.xDelGiro) / 4)
        if (!placa || grados === 0) return
        a.xDelGiro += grados * 4
        a.giro = giroEnvuelto(a.giro + grados)
        if (ajustarPlaca(placa, mallasDeHueso(), { ...placa.ajuste, giroGrados: a.giro })) pedirDibujo()
        return
      }
      a.xDelGiro = evento.clientX
      aCoordenadas(evento)
      llevarLaPlaca()
    }
    const alSoltarLaPlaca = (evento: PointerEvent) => {
      const a = arrastreDeLaPlaca
      arrastreDeLaPlaca = null
      if (!a) return
      controles.enabled = true
      try {
        render.domElement.releasePointerCapture(evento.pointerId)
      } catch {
        // ya estaba suelto
      }
      const placa = taller.current.implantes?.placa
      if (!placa) return
      const delAsiento = avisoDeLaPlacaPuesta(placa, ultimas.current.piezas, ultimas.current.medidasDelFoco)
      taller.current.decir?.(
        a.movido
          ? `Placa en su nuevo sitio${placa.ajuste.giroGrados ? `, girada ${Math.abs(placa.ajuste.giroGrados)}°` : ''}${!delAsiento && placa.separadaDelHuesoMm > 1.5 ? `: queda a ${placa.separadaDelHuesoMm.toFixed(1).replace('.', ',')} mm del hueso` : ''}.${delAsiento?.texto ? ` ${delAsiento.texto}` : ''} Cuando esté donde va, pulse «Fijar la placa».`
          : 'Arrastre la placa para llevarla por el hueso; con Mayúsculas, el arrastre la gira.',
      )
      ultimas.current.alFijar?.(estadoDeLaFijacion(taller.current))
      pedirDibujo()
    }
    superficie.addEventListener('pointerdown', alBajarSobreLaPlaca)
    superficie.addEventListener('pointermove', alMoverLaPlaca)
    superficie.addEventListener('pointerup', alSoltarLaPlaca)
    superficie.addEventListener('pointercancel', alSoltarLaPlaca)

    // --- despegar el periostio (P-005 E2) ---------------------------------------------------------------
    // Con el Freer o un periostótomo en la mano, mantener pulsado y arrastrar sobre el hueso deja una franja expuesta del ancho de la hoja.
    let elevando = false
    const sembrarBajoElPuntero = () => {
      const eleva = ultimas.current.instrumento?.eleva
      const golpe = huesoBajoElCursor()
      if (!eleva || !golpe) return
      taller.current.periostio ??= crearPeriostio(taller.current.escena!)
      sembrarHuella(taller.current.periostio, golpe.point, normalDelGolpe(golpe), eleva.anchoMm / 2, ultimas.current.milimetrosPorUnidad)
    }
    const avisarElPeriostio = () => {
      const p = taller.current.periostio
      ultimas.current.alCambiarElPeriostio?.(p && p.huellas.length > 0 ? estadoDelPeriostio(p, ultimas.current.instrumento?.eleva?.anchoMm ?? 0) : null)
    }
    const alBajarParaElevar = (evento: PointerEvent) => {
      if (ultimas.current.modo !== 'elevar' || evento.button !== 0 || !ultimas.current.instrumento?.eleva) return
      aCoordenadas(evento)
      if (!huesoBajoElCursor()) return
      elevando = true
      controles.enabled = false
      try {
        render.domElement.setPointerCapture(evento.pointerId)
      } catch {
        // sin captura
      }
      sembrarBajoElPuntero()
      pedirDibujo()
    }
    const alMoverParaElevar = (evento: PointerEvent) => {
      if (!elevando) return
      aCoordenadas(evento)
      sembrarBajoElPuntero()
      pedirDibujo()
    }
    const alSoltarParaElevar = (evento: PointerEvent) => {
      if (!elevando) return
      elevando = false
      controles.enabled = true
      try {
        render.domElement.releasePointerCapture(evento.pointerId)
      } catch {
        // ya estaba suelto
      }
      if (taller.current.periostio) terminarLaPasada(taller.current.periostio)
      avisarElPeriostio()
    }
    superficie.addEventListener('pointerdown', alBajarParaElevar)
    superficie.addEventListener('pointermove', alMoverParaElevar)
    superficie.addEventListener('pointerup', alSoltarParaElevar)

    // --- enclavado endomedular (P-005 E4) ----------------------------------------------------------------
    // Cada herramienta hace su paso: el punzón marca la entrada con un clic, la guía de punta de oliva y la fresa se empujan **manteniendo pulsado**, el
    // dedo reductor se pone o se quita con un clic y el tubo de intercambio cambia la guía por la lisa. Las reglas —si la entrada es buena, cuándo se
    // atasca la guía, cuánto hay que fresar— están en `src/lib/enclavado.ts`; aquí se mide sobre el hueso y se dibuja.
    const AVANCE_DE_LA_GUIA_MM_POR_SEGUNDO = 45
    const AVANCE_DE_LA_FRESA_MM_POR_SEGUNDO = 30
    const medidasDelFocoAhora = () => ultimas.current.medidasDelFoco ?? null
    const avisarElEnclavado = () => {
      const t = taller.current
      const e = t.enclavado
      // Si se movió el fragmento desde que se marcó la entrada, el canal y el foco están en otro sitio: se mide otra vez y se vuelve a dibujar.
      if (e?.entrada && t.escena && remedirElCanal(e, ultimas.current.ejeLargo, ultimas.current.milimetrosPorUnidad)) {
        const mm = ultimas.current.milimetrosPorUnidad
        if (e.guia) colocarLaGuia(t.escena, e, Math.min(e.guia.avanceMm, e.entrada.canal.largoDelCanalMm), mm)
        if (e.clavo) colocarElClavo(t.escena, e, e.clavo, e.clavo.avanceMm, mm)
        const hecho = Math.max(0, ...e.cabezasMm)
        if (e.canal && hecho > 0 && e.guia) ponerElCanal(t.escena, e, hecho, e.guia.avanceMm, mm)
      }
      ultimas.current.alCambiarElEnclavado?.(e ? estadoDelEnclavado(e, medidasDelFocoAhora(), ultimas.current.clavoPrevistoMm ?? null) : null)
    }
    let enclavando: { funcion: 'guia' | 'fresa'; cabezaMm: number; avanceMm: number; ultimo: number; intervalo: number; avisado: boolean } | null = null
    const cajaDe = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o)
    const marcarLaEntrada = (golpe: THREE.Intersection) => {
      const t = taller.current
      const escena = t.escena
      if (!escena) return
      const mm = ultimas.current.milimetrosPorUnidad
      const eje = ultimas.current.ejeLargo
      const hueso = new THREE.Vector3(...ejesDelPaciente(eje).hueso)
      const pieza = golpe.object as THREE.Mesh
      const fragmento = t.fragmento
      const esElFragmento = !!fragmento && (pieza === fragmento || perteneceA(pieza, fragmento))
      let otra: THREE.Object3D | null = null
      if (fragmento && !esElFragmento) otra = fragmento
      else if (esElFragmento) {
        // El punzón cayó en el fragmento del caso: el otro trozo es el hueso fijo más cercano a él.
        const centro = cajaDe(pieza).getCenter(new THREE.Vector3())
        let mejor = Infinity
        for (const h of huesoFijo(t, ultimas.current.piezas)) {
          const d = cajaDe(h).getCenter(new THREE.Vector3()).distanceTo(centro)
          if (d < mejor) {
            mejor = d
            otra = h
          }
        }
      }
      const cajaA = cajaDe(pieza)
      const cajaB = otra ? cajaDe(otra) : null
      if (cajaB && !cajaA.clone().expandByScalar(30 / mm).intersectsBox(cajaB)) {
        t.decir?.('El punzón marca el hueso de la fractura: apunte al fragmento proximal del hueso que se va a enclavar.')
        return
      }
      if (cajaB && cajaB.getCenter(new THREE.Vector3()).dot(hueso) > cajaA.getCenter(new THREE.Vector3()).dot(hueso)) {
        t.decir?.('La entrada va en el fragmento proximal (el de arriba, hacia la cabeza del paciente): el clavo entra por el extremo proximal y baja.')
        return
      }
      const e = (t.enclavado ??= crearEnclavado())
      const canal = medirElCanal({ entrada: golpe.point.clone(), cajaProximal: cajaA, cajaDistal: cajaB, eje, milimetrosPorUnidad: mm, istmoMm: istmoDelHueso(pieza) })
      // Una entrada nueva invalida lo que dependía de la anterior: la guía y el fresado se rehacen.
      soltarLosBloqueos(t)
      retirarLaGuia(e)
      const juicio = ponerLaEntrada(escena, e, golpe.point, normalDelGolpe(golpe), canal, mm, { proximal: pieza, distal: otra })
      t.decir?.(juicio.aviso ?? 'Entrada marcada: en el extremo proximal y en línea con el canal. Ahora se pasa la guía de punta de oliva.')
      avisarElEnclavado()
      t.pedirDibujo?.()
    }
    const detenerElEnclavado = (completo: boolean) => {
      const t = taller.current
      const h = enclavando
      if (!h) return
      window.clearInterval(h.intervalo)
      enclavando = null
      controles.enabled = true
      const e = t.enclavado
      if (e && h.funcion === 'fresa' && !completo && t.escena) {
        // La fresa se retiró antes de llegar al fondo: esa pasada no cuenta y el canal vuelve a lo que ya estaba fresado.
        const hecho = Math.max(0, ...e.cabezasMm)
        if (hecho > 0 && e.guia) ponerElCanal(t.escena, e, hecho, e.guia.avanceMm, ultimas.current.milimetrosPorUnidad)
        else if (e.canal) {
          e.canal.removeFromParent()
          e.canal = null
        }
        t.decir?.('La fresa se retiró antes de llegar al extremo de la guía: esa pasada no cuenta.')
      }
      avisarElEnclavado()
      t.pedirDibujo?.()
    }
    const empujarEnclavado = () => {
      const t = taller.current
      const h = enclavando
      const e = t.enclavado
      const escena = t.escena
      if (!h || !e?.entrada || !escena) return
      const mm = ultimas.current.milimetrosPorUnidad
      const ahora = performance.now()
      const dt = Math.min(0.1, (ahora - h.ultimo) / 1000)
      h.ultimo = ahora
      if (h.funcion === 'guia') {
        const antes = e.guia?.avanceMm ?? 0
        const maximo = avanceMaximo(e, medidasDelFocoAhora())
        const nuevo = Math.min(maximo, antes + AVANCE_DE_LA_GUIA_MM_POR_SEGUNDO * dt)
        colocarLaGuia(escena, e, nuevo, mm)
        const paso = juicioDelPasoDeLaGuia(e, medidasDelFocoAhora())
        const atascada = !paso.pasa && e.entrada.canal.distanciaAlFocoMm !== null && nuevo >= maximo - 0.01
        if (e.guia) {
          e.guia.atascada = atascada
          e.guia.aviso = atascada ? paso.aviso : null
        }
        if (atascada && !h.avisado) {
          h.avisado = true
          t.decir?.(paso.aviso ?? 'La guía se atasca en el foco.')
        }
        if (!atascada) h.avisado = false
        if (nuevo >= maximo - 0.01 && !atascada) {
          t.decir?.('La punta de la guía llegó a la epífisis distal, a unos 10 mm de la articulación. Se puede fresar.')
          detenerElEnclavado(true)
          return
        }
      } else if (e.guia) {
        h.avanceMm = Math.min(e.guia.avanceMm, h.avanceMm + AVANCE_DE_LA_FRESA_MM_POR_SEGUNDO * dt)
        ponerElCanal(escena, e, Math.max(h.cabezaMm, ...e.cabezasMm), h.avanceMm, mm)
        if (h.avanceMm >= e.guia.avanceMm - 1) {
          e.cabezasMm.push(h.cabezaMm)
          const f = estadoDelEnclavado(e, medidasDelFocoAhora(), ultimas.current.clavoPrevistoMm ?? null).fresado
          t.decir?.(f.aviso ?? `Fresado con cabeza de ${String(h.cabezaMm).replace('.', ',')} mm.`)
          detenerElEnclavado(true)
          return
        }
      }
      avisarElEnclavado()
      t.pedirDibujo?.()
    }
    const alBajarParaEnclavar = (evento: PointerEvent) => {
      const que = ultimas.current.instrumento?.enclava
      if (ultimas.current.modo !== 'enclavar' || evento.button !== 0 || !que) return
      aCoordenadas(evento)
      const t = taller.current
      if (que.funcion === 'entrada') {
        const golpe = huesoBajoElCursor()
        if (!golpe) {
          t.decir?.('Apunte al hueso: el punzón marca la entrada sobre el hueso visible, en el extremo proximal.')
          return
        }
        marcarLaEntrada(golpe)
        return
      }
      const e = (t.enclavado ??= crearEnclavado())
      if (que.funcion === 'dedo') {
        e.dedoPuesto = !e.dedoPuesto
        t.decir?.(
          e.dedoPuesto
            ? 'Dedo reductor puesto en el canal: empuja el fragmento distal hacia la línea y deja pasar la guía con un poco más de desalineación.'
            : 'Dedo reductor retirado.',
        )
        avisarElEnclavado()
        return
      }
      if (que.funcion === 'tubo') {
        const estado = estadoDelEnclavado(e, medidasDelFocoAhora(), ultimas.current.clavoPrevistoMm ?? null)
        if (!estado.guia?.llegaAlFondo) {
          t.decir?.('Falta la guía de punta de oliva pasada hasta el extremo distal: el tubo de intercambio corre sobre ella.')
        } else if (e.cabezasMm.length === 0) {
          t.decir?.('Falta fresar: la guía se cambia por la lisa después del fresado, para pasar el clavo.')
        } else if (e.guiaCambiada) {
          t.decir?.('La guía ya está cambiada por la lisa.')
        } else {
          cambiarLaGuia(e)
          t.decir?.('Guía cambiada: con el tubo de intercambio se retiró la de punta de oliva y quedó la lisa. El canal está listo para el clavo.')
          avisarElEnclavado()
          t.pedirDibujo?.()
        }
        return
      }
      if (que.funcion === 'arco') {
        e.arcoMontado = !e.arcoMontado
        t.decir?.(
          e.arcoMontado
            ? 'Arco de inserción montado en el clavo: guía los tornillos de bloqueo proximales y recibe el impactador.'
            : 'Arco de inserción retirado del clavo.',
        )
        avisarElEnclavado()
        return
      }
      if (que.funcion === 'clavo') {
        const escena = t.escena
        if (!escena || !que.diametroMm || !que.largoMm) {
          t.decir?.('No se leen las medidas del clavo en su nombre («Clavo tibial 9 × 330 mm»): no se puede introducir.')
          return
        }
        if (e.clavo) {
          t.decir?.('Ya hay un clavo en el canal: retírelo («Retirar el clavo») para poner otro.')
          return
        }
        const medidas = { diametroMm: que.diametroMm, largoMm: que.largoMm, nombre: ultimas.current.instrumento?.nombre ?? '' }
        // El fresado se juzga contra el clavo que se tiene en la mano, no contra el que la bandeja daba por previsto.
        const faltan = loQueFaltaParaElClavo(estadoDelEnclavado(e, medidasDelFocoAhora(), medidas.diametroMm))
        if (faltan.length > 0) {
          t.decir?.(`Antes del clavo falta: ${faltan.join(', ')}.`)
          return
        }
        const calibre = juzgarElCalibreDelClavo(medidas.diametroMm, Math.max(0, ...e.cabezasMm))
        if (!calibre.entra) {
          t.decir?.(calibre.aviso ?? 'El clavo no entra en el canal.')
          return
        }
        colocarElClavo(escena, e, medidas, ENTRADA_A_MANO_MM, ultimas.current.milimetrosPorUnidad)
        const largo = juzgarElLargoDelClavo(medidas.largoMm, e.entrada?.canal.largoDelCanalMm ?? 0)
        t.decir?.(
          `Clavo ${medidas.diametroMm} × ${medidas.largoMm} mm introducido ${ENTRADA_A_MANO_MM} mm con la mano. Se sigue con el impactador montado en el arco (o con el martillo).${calibre.aviso ? ` ${calibre.aviso}` : ''}${largo.aviso ? ` ${largo.aviso}` : ''}`,
        )
        avisarElEnclavado()
        t.pedirDibujo?.()
        return
      }
      if (que.funcion === 'martillo' || que.funcion === 'impactador') {
        const escena = t.escena
        if (!escena || !e.clavo || !e.entrada) {
          t.decir?.('Primero se introduce el clavo en el canal: el golpe lo asienta.')
          return
        }
        const golpe = golpear(que.funcion, e.arcoMontado)
        if (!golpe.golpea) {
          t.decir?.(golpe.aviso ?? 'No se puede golpear así.')
          return
        }
        const holgura = Math.max(0, ...e.cabezasMm) - e.clavo.diametroMm
        const paso = avancePorGolpeMm(holgura)
        if (paso === 0) {
          t.decir?.('El clavo no avanza: el canal quedó justo del calibre del clavo. Retírelo y fresar más.')
          return
        }
        const canal = e.entrada.canal.largoDelCanalMm
        const nuevo = Math.min(canal, e.clavo.avanceMm + paso)
        e.clavo.golpes += 1
        e.clavo.avisoDelGolpe = golpe.aviso
        colocarElClavo(escena, e, e.clavo, nuevo, ultimas.current.milimetrosPorUnidad)
        const asiento = juzgarElAsiento({ avanceMm: nuevo, largoMm: e.clavo.largoMm, largoDelCanalMm: canal })
        t.decir?.([asiento.aviso ?? 'Clavo bien asentado: a ras de la entrada, con la punta en la metáfisis.', golpe.aviso].filter(Boolean).join(' '))
        avisarElEnclavado()
        t.pedirDibujo?.()
        return
      }
      // La guía y la fresa se empujan manteniendo pulsado.
      if (!e.entrada) {
        t.decir?.('Marque antes el punto de entrada con el punzón iniciador.')
        return
      }
      if (!e.entrada.juicio.buena) {
        t.decir?.(`La entrada no sirve: ${e.entrada.juicio.aviso ?? ''} Corríjala con el punzón (un clic en otro punto).`)
        return
      }
      let cabezaMm = 0
      if (que.funcion === 'guia') {
        if (e.guiaCambiada) {
          t.decir?.('La guía ya se cambió por la lisa: para pasar otra de punta de oliva hay que retirar la guía («Retirar la guía») y empezar de nuevo.')
          return
        }
      } else {
        const estado = estadoDelEnclavado(e, medidasDelFocoAhora(), ultimas.current.clavoPrevistoMm ?? null)
        if (!estado.guia?.llegaAlFondo) {
          t.decir?.('Pase antes la guía hasta el extremo distal: la fresa canulada corre sobre ella.')
          return
        }
        const elegida = que.cabezaMm ?? siguienteCabeza(e.cabezasMm)
        if (elegida === null || elegida === undefined) {
          t.decir?.('No quedan cabezas más grandes en el juego.')
          return
        }
        if (e.cabezasMm.some((c) => c >= elegida)) {
          t.decir?.(`La cabeza de ${String(elegida).replace('.', ',')} mm ya pasó: elija una mayor.`)
          return
        }
        cabezaMm = elegida
      }
      controles.enabled = false
      try {
        render.domElement.setPointerCapture(evento.pointerId)
      } catch {
        // sin captura
      }
      enclavando = { funcion: que.funcion, cabezaMm, avanceMm: 0, ultimo: performance.now(), intervalo: window.setInterval(empujarEnclavado, 16), avisado: false }
    }
    const alSoltarParaEnclavar = (evento: PointerEvent) => {
      if (!enclavando) return
      try {
        render.domElement.releasePointerCapture(evento.pointerId)
      } catch {
        // ya estaba suelto
      }
      detenerElEnclavado(false)
    }
    superficie.addEventListener('pointerdown', alBajarParaEnclavar)
    superficie.addEventListener('pointerup', alSoltarParaEnclavar)
    superficie.addEventListener('pointercancel', alSoltarParaEnclavar)

    const alBajar = (evento: PointerEvent) => {
      // Solo el botón principal corta, coloca o pincha. Aquí entraba cualquier botón, y el derecho maneja ahora el
      // instrumento o abre el menú (P-009): un arrastre para abrir el separador no puede ponerlo también.
      if (evento.button !== 0) return
      const { modo: modoActual } = ultimas.current
      if (modoActual === 'orbitar' || modoActual === 'modelar' || modoActual === 'elevar' || modoActual === 'enclavar') return

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
        let plano: PlanoDelSeparador = enLaMano
          ? enLaMano.objeto.datos.plano
          : separa!.apoyoEnHueso
            ? 'hueso'
            : ultimas.current.planoDelSeparador === 'musculo'
              ? 'musculo'
              : 'piel'
        // El plano sale de lo que se pincha (P-004 E5, pedidos 8 y 10): lo que se ve bajo el cursor y la herida más
        // cercana de cada plano. Un clic sobre un músculo lejos de todo labio lo retrae de una vez —sin abrir la ficha ni
        // elegir objetivo—, y el siguiente clic en otro músculo deja el anterior retraído. El selector del panel, con
        // «Piel» o «Músculo», sigue forzando el plano. Un separador que ya se lleva en la mano conserva el suyo.
        if (!enLaMano && !separa!.apoyoEnHueso) {
          const unidadesPorMmDelClic = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
          const primero = superficieBajoElCursor()
          const rolDelGolpe = primero ? (ultimas.current.piezas.find((p) => p.nodo === primero.object.name)?.rol ?? null) : null
          const candidatos: CandidatoDeHerida[] = (['musculo', 'fascia', 'piel'] as const).map((p) => {
            const lasHeridas = t.heridas.get(p) ?? []
            const sobreLaCapa = lasHeridas.length > 0 ? golpeEnLaCapa([p]) : null
            if (!sobreLaCapa) return { plano: p, cercaMm: null }
            let mejor: number | null = null
            for (const h of lasHeridas) {
              const info = ladoDeLaHerida(h, sobreLaCapa.point)
              if (info && (mejor === null || info.cerca < mejor)) mejor = info.cerca
            }
            return { plano: p, cercaMm: mejor === null ? null : mejor / unidadesPorMmDelClic }
          })
          // Un píxel, en milímetros, a la distancia del golpe: con la pierna entera a la vista el labio es una raya fina.
          const milimetrosPorPixel = primero
            ? (camara.position.distanceTo(primero.point) * 2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2))) /
              Math.max(1, render.domElement.clientHeight) /
              unidadesPorMmDelClic
            : 0
          const decision = decidirElClicDelSeparador({
            rolDelGolpe,
            candidatos,
            planoForzado: ultimas.current.planoDelSeparador,
            puedeSepararMusculos: true,
            limiteDelLabioMm: PIXELES_DEL_LABIO * milimetrosPorPixel,
          })
          if (decision.accion === 'separar-musculo' && primero) {
            retraerElMusculo(
              t,
              ultimas.current,
              { malla: primero.object as THREE.Mesh, punto: primero.point.clone(), normal: normalDelGolpe(primero) },
              { nombre: ultimas.current.instrumento?.nombre ?? 'Separador', maximoMm: separa!.maximoMm },
            )
            return
          }
          if (decision.accion === 'nada') {
            t.decir?.(avisoDelClicSinEfecto(decision.motivo, todasLasHeridas(t).length > 0, true))
            return
          }
          if (decision.accion === 'colocar') plano = decision.plano
        }
        const capas: CapaDeLaHerida[] = plano === 'hueso' ? [...PLANOS_BLANDOS] : [plano]
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
        // Con «Marcar la trayectoria» encendido el clic es la entrada o la salida, no empezar a perforar (P-004 E9).
        if (ultimas.current.marcandoLaTrayectoria) {
          marcarPuntoDeLaTrayectoria()
          return
        }
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
        elegirLaPieza(pieza)
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
        // Con un eje elegido en el menú de movimiento el arrastre va por ese eje y no por el plano de la pantalla (P-004 E7).
        if (ultimas.current.movimientoPorEje) {
          pieza.updateMatrixWorld(true)
          arrastreEnEje = {
            x: evento.clientX,
            y: evento.clientY,
            pivote: pieza.localToWorld(centroLocalDe(pieza)),
            inicial: pieza.matrixWorld.clone(),
            inversaDelPadre: pieza.parent ? pieza.parent.matrixWorld.clone().invert() : new THREE.Matrix4(),
          }
        } else {
          arrastreEnEje = null
        }
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

    // --- la compresión de la fractura (P-004 E10) ----------------------------------------------------
    // Las cuentas están en `src/lib/compresion.ts`, legibles, para que Cristóbal las corrija sin tocar esto. Aquí se miden las cosas de la
    // escena —dónde está la fractura, qué fragmento se mueve— y se aplica lo que esas cuentas deciden.
    const indiceDelEjeLargo = () => (ultimas.current.ejeLargo === 'x' ? 0 : ultimas.current.ejeLargo === 'z' ? 2 : 1)

    /**
     * Dónde está la fractura: el punto, sobre el eje del hueso, a medio camino entre los extremos enfrentados del fragmento del caso y del
     * resto del hueso visible. `null` si el caso no tiene fragmento o no hay otro hueso: sin saber dónde está, no se sabe de qué lado
     * queda ni a qué distancia.
     */
    const posicionDeLaFractura = (): THREE.Vector3 | null => {
      const f = taller.current.fragmento
      if (!f) return null
      const resto = new THREE.Box3()
      for (const h of mallasDeHueso()) {
        if (h === f || perteneceA(h, f)) continue
        resto.expandByObject(h)
      }
      const caja = new THREE.Box3().setFromObject(f)
      if (resto.isEmpty() || caja.isEmpty()) return null
      const i = indiceDelEjeLargo()
      const centroDelFragmento = caja.getCenter(new THREE.Vector3())
      const centroDelResto = resto.getCenter(new THREE.Vector3())
      const mitad =
        centroDelFragmento.getComponent(i) < centroDelResto.getComponent(i)
          ? (caja.max.getComponent(i) + resto.min.getComponent(i)) / 2
          : (caja.min.getComponent(i) + resto.max.getComponent(i)) / 2
      return centroDelFragmento.setComponent(i, mitad)
    }

    /** Hacia qué sentido del eje de la placa está la fractura respecto de un orificio, o `null` si no se sabe dónde está. */
    const ladoDeLaFracturaEnElAgujero = (placa: NonNullable<ImplantesEnEscena['placa']>, agujero: number): 1 | -1 | null => {
      const fractura = posicionDeLaFractura()
      if (!fractura) return null
      const eje = ejeDeLaPlaca(placa)
      return ladoDeLaFractura(posicionDelAgujero(placa, agujero, 'abajo').dot(eje), fractura.dot(eje))
    }
    taller.current.ladosDeLaFractura = () => {
      const placa = taller.current.implantes?.placa
      const lados: Record<number, 1 | -1> = {}
      if (!placa) return lados
      placa.agujerosMm.forEach((_, i) => {
        const lado = ladoDeLaFracturaEnElAgujero(placa, i)
        if (lado !== null) lados[i] = lado
      })
      return lados
    }

    /** A qué distancia de la entrada cruza la fractura una trayectoria, en mm; `null` si no la cruza o no se sabe dónde está. */
    const distanciaALaFracturaPorLaTrayectoria = (libre: NonNullable<Taller['trayectoriaDelTornillo']>): number | null => {
      const fractura = posicionDeLaFractura()
      if (!fractura) return null
      const i = indiceDelEjeLargo()
      const avance = libre.haciaDentro.getComponent(i)
      // Una trayectoria casi perpendicular al eje del hueso no cruza la fractura: corre paralela a ella.
      if (Math.abs(avance) < 0.1) return null
      const s = (fractura.getComponent(i) - libre.entrada.getComponent(i)) / avance
      if (s <= 0) return null
      return s / (1 / (ultimas.current.milimetrosPorUnidad || 1000))
    }

    /**
     * Desliza el fragmento hacia donde estaba reducido, hasta `mm`, sin pasarse de lo que hay separado. Devuelve cuánto bajó la diástasis. El
     * fragmento se mueve en vez de «cambiar la medida»: la compresión se ve en la imagen y la miden las mismas cuentas de siempre.
     */
    const comprimirElFragmento = (mm: number): number => {
      const t = taller.current
      const u = ultimas.current
      const f = t.fragmento
      const origen = t.origenDelFragmento
      if (!f || !origen) return 0
      const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
      const d = desplazamientoDesde(origen.posicion, f.position)
      const alLargo = (u.ejeLargo === 'x' ? d.x : u.ejeLargo === 'z' ? d.z : d.y) / unidadesPorMm
      const aplicable = compresionAplicable(mm, Math.abs(alLargo))
      if (aplicable <= 0) return 0
      // Hacia donde estaba (el sitio reducido): el signo contrario al de la separación.
      moverPiezaPorEje(f, 'trasladar', 'axial', -Math.sign(alLargo) * aplicable, u.ejeLargo, unidadesPorMm)
      u.alMoverFragmento?.(desplazamientoDesde(origen.posicion, f.position), {
        x: grados(f.rotation.x - origen.rotacion.x),
        y: grados(f.rotation.y - origen.rotacion.y),
        z: grados(f.rotation.z - origen.rotacion.z),
      })
      t.pedirDibujo?.()
      return aplicable
    }

    /** Aplica lo que decidió una de las cuentas de `compresion.ts` y devuelve el texto que se le dice a quien opera. */
    const aplicarLaCompresion = (resultado: ResultadoDeCompresion): string => {
      if (resultado.mm <= 0 || !resultado.tecnica) return resultado.texto
      const aplicado = comprimirElFragmento(resultado.mm)
      if (aplicado <= 0) return `${resultado.texto} No hay separación que comprimir: la diástasis ya está en cero.`
      const t = taller.current
      t.compresion = sumarCompresion(t.compresion ?? { mm: 0, tecnicas: [] }, { ...resultado, mm: aplicado })
      return `${resultado.texto} La diástasis bajó ${aplicado.toFixed(1).replace('.', ',')} mm.`
    }

    /**
     * La marca del punto de brocado sobre la placa (pedido 14: «al hacer clic se marca el punto que uno va a brocar»). El esquema
     * del panel lo marcaba solo en 2D: al volver la vista al hueso no quedaba nada que dijera por dónde iba a entrar la broca, y
     * la broca sigue al cursor hasta el centro del orificio antes de correrse. Es un disco del color de la zona (el mismo del
     * esquema) apoyado en la boca del orificio. Hay una sola, la del orificio que se está eligiendo, y se va al perforarlo. Es de
     * interfaz: la fluoroscopia no la ve, y no se puede pinchar.
     */
    let marcaDeBrocado: { malla: THREE.Mesh; indice: number } | null = null
    const quitarLaMarcaDeBrocado = () => {
      if (!marcaDeBrocado) return
      marcaDeBrocado.malla.removeFromParent()
      marcaDeBrocado.malla.geometry.dispose()
      ;(marcaDeBrocado.malla.material as THREE.Material).dispose()
      marcaDeBrocado = null
      pedirDibujo()
    }
    taller.current.marcarElPuntoDeBrocado = (indice) => {
      const t = taller.current
      const placa = t.implantes?.placa
      if (
        indice === null ||
        !placa?.fijada ||
        !t.escena ||
        formaDeLosAgujeros({ nombre: placa.nombre }) === 'redondo' ||
        indice < 0 ||
        indice >= placa.agujerosMm.length ||
        placa.agujeros.get(indice)?.perforado
      ) {
        quitarLaMarcaDeBrocado()
        return
      }
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const mm = t.desviaciones?.get(indice) ?? 0
      const lado = ladoDeLaFracturaEnElAgujero(placa, indice)
      const zona = lado === null ? 'centro' : zonaDelOval(mm, lado, semilargoDelOvalDeLaPlaca(placa.nombre))
      if (!marcaDeBrocado) {
        const malla = new THREE.Mesh(
          new THREE.CircleGeometry(1, 24),
          // Sin escribir profundidad y adelantado: la boca del orificio está a ras de la cara de la placa, y con la prueba de
          // profundidad a secas el disco parpadeaba contra ella.
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
        )
        malla.name = 'marca-del-punto-de-brocado'
        malla.userData.deInterfaz = true
        malla.raycast = () => {}
        malla.renderOrder = 5
        t.escena.add(malla)
        marcaDeBrocado = { malla, indice }
      }
      marcaDeBrocado.indice = indice
      const malla = marcaDeBrocado.malla
      ;(malla.material as THREE.MeshBasicMaterial).color.set(COLOR_DE_LA_ZONA[zona])
      // Del ancho de una broca de 2,5 mm con algo de borde: lo que se ve es dónde entra, no un círculo que tape el orificio.
      malla.scale.setScalar(1.6 * unidadesPorMm)
      malla.position
        .copy(posicionDelAgujero(placa, indice, 'arriba'))
        .addScaledVector(ejeDeLaPlaca(placa), mm * unidadesPorMm)
        .addScaledVector(placa.normal, 0.3 * unidadesPorMm)
      malla.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), placa.normal.clone().normalize())
      malla.updateMatrixWorld(true)
      pedirDibujo()
    }
    /** Tras perforar o quitar la placa, la marca se va si su orificio ya no está por brocar. */
    taller.current.repasarLaMarcaDeBrocado = () => {
      if (marcaDeBrocado) taller.current.marcarElPuntoDeBrocado?.(marcaDeBrocado.indice)
    }

    /** La vista de trabajo (P-004 E10, pedido 14): lleva la cámara al orificio, con vuelta atrás. */
    let vistaGuardada: { posicion: THREE.Vector3; objetivo: THREE.Vector3 } | null = null
    const llevarLaCamara = (posicion: THREE.Vector3, objetivo: THREE.Vector3) => {
      const p0 = camara.position.clone()
      const o0 = controles.target.clone()
      const inicio = performance.now()
      const paso = (ahora: number) => {
        const k = Math.min(1, (ahora - inicio) / 350)
        const suave = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        camara.position.lerpVectors(p0, posicion, suave)
        controles.target.lerpVectors(o0, objetivo, suave)
        controles.update()
        pedirDibujo()
        if (k < 1) requestAnimationFrame(paso)
      }
      requestAnimationFrame(paso)
    }
    taller.current.acercarseAlAgujero = (indice) => {
      const t = taller.current
      if (indice === null) {
        if (vistaGuardada) llevarLaCamara(vistaGuardada.posicion, vistaGuardada.objetivo)
        vistaGuardada = null
        return
      }
      const placa = t.implantes?.placa
      if (!placa || indice < 0 || indice >= placa.agujerosMm.length) return
      const centro = posicionDelAgujero(placa, indice, 'arriba')
      if (!vistaGuardada) vistaGuardada = { posicion: camara.position.clone(), objetivo: controles.target.clone() }
      // Se acerca por donde miraba: a unos 80 mm del orificio, en la misma dirección.
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const direccion = camara.position.clone().sub(controles.target).normalize()
      llevarLaCamara(centro.clone().addScaledVector(direccion, 80 * unidadesPorMm), centro)
    }

    // --- la trayectoria de un tornillo con dos clics (P-004 E9) -------------------------------------
    // «Para un tornillo, elegir la trayectoria con un clic al inicio y otro al final (una línea, como la incisión automática), y
    // ahí ofrecer la broca, luego el medidor, luego el tornillo.» El primer clic sobre el hueso es la entrada; el segundo, la salida.
    // La línea queda dibujada y la broca, el medidor y el tornillo la siguen; con un agujero de placa bajo el cursor mandan los de la
    // placa, como siempre.
    const borrarLaTrayectoria = () => {
      const t = taller.current
      const tray = t.trayectoriaDelTornillo
      if (tray) {
        tray.linea.removeFromParent()
        tray.linea.geometry.dispose()
        ;(tray.linea.material as THREE.Material).dispose()
      }
      const entrada = t.puntoDeEntrada
      if (entrada) {
        entrada.marca.removeFromParent()
        entrada.marca.geometry.dispose()
        ;(entrada.marca.material as THREE.Material).dispose()
      }
      const habia = !!tray || !!entrada
      t.trayectoriaDelTornillo = undefined
      t.puntoDeEntrada = undefined
      if (habia) {
        ultimas.current.alCambiarLaTrayectoria?.(null)
        ultimas.current.alFijar?.(estadoDeLaFijacion(t))
        t.pedirDibujo?.()
      }
    }
    taller.current.borrarLaTrayectoria = borrarLaTrayectoria

    const marcarPuntoDeLaTrayectoria = () => {
      const t = taller.current
      const u = ultimas.current
      const golpe = huesoBajoElCursor()
      if (!golpe) {
        t.decir?.('Apunte al hueso: la trayectoria entra y sale por la cortical.')
        return
      }
      const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
      // Marcar de nuevo con una trayectoria ya hecha la empieza otra vez.
      if (t.trayectoriaDelTornillo) borrarLaTrayectoria()
      if (!t.puntoDeEntrada) {
        const marca = new THREE.Mesh(
          new THREE.SphereGeometry(1.2 * unidadesPorMm, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xffd34d, depthTest: false, transparent: true }),
        )
        marca.position.copy(golpe.point)
        marca.renderOrder = 998
        marca.raycast = () => {}
        marca.userData.deInterfaz = true
        escena.add(marca)
        t.puntoDeEntrada = { punto: golpe.point.clone(), marca }
        u.alCambiarLaTrayectoria?.({ fase: 'salida' })
        t.decir?.('Entrada marcada. Haga clic donde sale el tornillo.')
        t.pedirDibujo?.()
        return
      }
      const entrada = t.puntoDeEntrada.punto
      const salida = golpe.point.clone()
      const largo = entrada.distanceTo(salida)
      if (largo < 3 * unidadesPorMm) {
        t.decir?.('La salida está pegada a la entrada: marque otro punto, más lejos, donde sale el tornillo.')
        return
      }
      const haciaDentro = salida.clone().sub(entrada).normalize()
      const linea = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([entrada, salida]),
        new THREE.LineBasicMaterial({ color: 0xffd34d, depthTest: false, transparent: true }),
      )
      linea.renderOrder = 998
      linea.raycast = () => {}
      linea.userData.deInterfaz = true
      escena.add(linea)
      t.puntoDeEntrada.marca.removeFromParent()
      t.puntoDeEntrada.marca.geometry.dispose()
      ;(t.puntoDeEntrada.marca.material as THREE.Material).dispose()
      t.puntoDeEntrada = undefined
      const anguloConElEje = grados(Math.acos(Math.min(1, Math.abs(haciaDentro.dot(VECTOR_DEL_EJE[u.ejeLargo])))))
      const largoMm = largo / unidadesPorMm
      t.trayectoriaDelTornillo = { entrada, salida, haciaDentro, linea, estado: { perforado: null, medido: null }, largoMm, anguloConElEje, perforaciones: [] }
      u.alCambiarLaTrayectoria?.({ fase: 'lista', largoMm, anguloConElEje })
      u.alFijar?.(estadoDeLaFijacion(t))
      u.alGesto?.(
        `Trayectoria marcada: ${largoMm.toFixed(0)} mm, ${Math.round(anguloConElEje)}° con el eje del hueso. Ahora la broca, el medidor y el tornillo la siguen.`,
        'bien',
      )
      t.decir?.('')
      t.pedirDibujo?.()
    }

    /** El medidor y el tornillo sobre la trayectoria de dos clics, con el mismo orden que en un agujero de placa: perforar, medir, atornillar. */
    const fijarEnLaTrayectoria = (libre: NonNullable<Taller['trayectoriaDelTornillo']>) => {
      const t = taller.current
      const u = ultimas.current
      const inst = u.instrumento
      const herramienta = t.herramienta
      if (!inst || !t.escena) return
      const imp = (t.implantes ??= crearImplantes())
      const mmPorUnidad = u.milimetrosPorUnidad || 1000
      const huesos = mallasDeHueso()
      const decirYAvisar = (suceso: SucesoDeFijacion) => {
        t.decir?.(suceso.texto)
        u.alFijar?.(estadoDeLaFijacion(t), suceso)
        t.pedirDibujo?.()
      }
      const falta = (paso: 'medir' | 'atornillar') => {
        const f = loQueFaltaPara(paso, libre.estado)
        if (!f) return false
        t.decir?.(
          f === 'perforar'
            ? 'La trayectoria todavía no está perforada: se broca, se mide y después se atornilla.'
            : 'Falta medir la trayectoria: el tornillo se pide del largo que dice el medidor.',
        )
        return true
      }
      if (inst.mide) {
        if (falta('medir')) return
        const medida = medirAlLoLargoDeUnaLinea(libre.entrada, libre.haciaDentro, mmPorUnidad, huesos)
        if (!medida) {
          t.decir?.('Por esa trayectoria no hay hueso que medir.')
          return
        }
        // La serie la da la broca con que se perforó (D-301): el medidor entra antes de que se elija el tornillo.
        const serie = serieDelSistema(libre.estado.perforado?.diametroMm)
        const sugerido = largoSugerido(medida.espesorMm, medida.distanciaAlHuesoMm, serie)
        const noAlcanza = avisoDelLargo(medida.espesorMm, medida.distanciaAlHuesoMm, serie)
        libre.estado = { perforado: libre.estado.perforado, medido: { espesorMm: medida.espesorMm, sugeridoMm: sugerido } }
        decirYAvisar({
          tipo: 'medida',
          texto: `Trayectoria: hueso de ${medida.espesorMm.toFixed(0)} mm. Pida un tornillo de ${sugerido} mm.${noAlcanza ? ` ${noAlcanza}` : ''}`,
          atencion: !!noAlcanza,
          largoSugeridoMm: sugerido,
          libre: true,
        })
        return
      }
      if (inst.coloca?.tipo === 'tornillo' && herramienta) {
        if (inst.coloca.soloConClavo) {
          t.decir?.('Este tornillo es de bloqueo de clavo: va por los orificios del clavo (un clic junto al orificio), no por una trayectoria.')
          return
        }
        if (falta('atornillar')) return
        const diametro = u.diametroDeTornillo ?? inst.coloca.diametroMm
        // La clase dice qué broca lleva (D-300): el bloqueado de 3,5 va con 2,8 y el cortical, con 2,5.
        const clase = claseDelTornillo(inst.coloca, inst.tornillo?.tipo)
        const calibre = avisoDeCalibre(libre.estado.perforado!.diametroMm, diametro, clase)
        const id = (t.siguienteTornilloLibre = (t.siguienteTornilloLibre ?? 0) + 1) * -1
        const puesto = colocarTornilloEnLinea({
          escena: t.escena,
          plantilla: herramienta.raiz,
          id,
          entrada: libre.entrada,
          haciaDentro: libre.haciaDentro,
          largoMm: u.largoDeTornillo,
          diametroMm: diametro,
          diametroDelModeloMm: inst.coloca.diametroMm,
          largoDelModeloMm: inst.coloca.largoDelModeloMm,
          bloqueado: inst.coloca.bloqueado,
          milimetrosPorUnidad: mmPorUnidad,
          huesos,
          implantes: imp,
          url: inst.url,
        })
        if (!puesto) {
          t.decir?.('Por esa trayectoria no hay hueso donde atornillar.')
          return
        }
        // Si la trayectoria cruza la fractura, el tornillo de tracción puede comprimir de dos formas (P-004 E10): con la broca de
        // deslizamiento —el cercano grande, el lejano de núcleo— o con la rosca parcial toda en el lejano.
        let compresion = ''
        // Cruzar la fractura bloquea el foco aunque el tornillo no comprima, el bloqueado incluido (D-308): se marca
        // antes de avisar, porque con el aviso la consola mide la reducción que el tornillo acaba de congelar.
        const cruzaHasta = distanciaALaFracturaPorLaTrayectoria(libre)
        if (cruzaHasta !== null && cruzaHasta < puesto.largoMm) puesto.cruzaLaFractura = true
        const distancia = inst.coloca.bloqueado ? null : cruzaHasta
        if (distancia !== null && distancia < puesto.largoMm) {
          const resultado =
            inst.tornillo?.tipo === 'rosca-parcial'
              ? resultadoDeLaRoscaParcial({ roscaMm: inst.tornillo.roscaMm ?? 16, largoMm: puesto.largoMm, distanciaALaFracturaMm: distancia })
              : resultadoDelDeslizamiento({ ...calibresPorFragmento(libre.perforaciones, distancia), diametroExteriorMm: diametro, clase })
          compresion = aplicarLaCompresion(resultado)
        }
        decirYAvisar({
          tipo: 'tornillo',
          texto:
            `Tornillo de ${puesto.largoMm} mm por la trayectoria: ` +
            (puesto.bicortical ? 'bicortical.' : 'solo la cortical cercana.') +
            (puesto.aviso && puesto.bicortical ? ` ${puesto.aviso}` : '') +
            (calibre ? ` ${calibre}` : '') +
            (compresion ? ` ${compresion}` : ''),
          atencion: !!puesto.aviso || !!calibre,
          libre: true,
        })
      }
    }

    // --- tornillos de bloqueo por el clavo y apriete con destornillador (P-005 E6) ------------------------------
    // El tornillo de bloqueo se pone por el **orificio del clavo** más cercano al clic, a lo largo del clavo: guiado por el arco si es proximal y está montado, a
    // pulso si no (y entonces se juzga la puntería). El destornillador aprieta el tornillo al que se apunta, y el limitador de torque se monta en él con un clic.
    // Las reglas están en `src/lib/bloqueoDelClavo.ts`.
    const ponerElTornilloDeBloqueo = () => {
      const t = taller.current
      const u = ultimas.current
      const inst = u.instrumento
      const herramienta = t.herramienta
      const e = t.enclavado
      if (!t.escena || !inst?.coloca || inst.coloca.tipo !== 'tornillo' || !herramienta) return
      if (!e?.clavo || !e.entrada) {
        t.decir?.('Este tornillo es de bloqueo de clavo: primero se introduce el clavo en el canal (punzón, guía, fresa, tubo y clavo).')
        return
      }
      const golpe = huesoBajoElCursor()
      if (!golpe) {
        t.decir?.('Apunte al hueso, a la altura del orificio del clavo por donde va el tornillo.')
        return
      }
      const mm = u.milimetrosPorUnidad || 1000
      const unidades = 1 / mm
      const imp = (t.implantes ??= crearImplantes())
      const canal = e.entrada.canal
      // A qué altura del clavo se apuntó: donde el rayo del cursor pasa más cerca del eje del clavo. Así se apunta como se mira en la fluoroscopia, al orificio
      // y no a la superficie del hueso, que por la perspectiva cae unos milímetros más arriba o más abajo.
      const rd = rayo.ray.direction
      const ld = canal.direccion
      const w0 = rayo.ray.origin.clone().sub(canal.origen)
      const cosenoEntreEjes = rd.dot(ld)
      const denominador = 1 - cosenoEntreEjes * cosenoEntreEjes
      const alLargoDelClic =
        (denominador > 1e-6 ? (ld.dot(w0) - cosenoEntreEjes * rd.dot(w0)) / denominador : golpe.point.clone().sub(canal.origen).dot(ld)) * mm
      let mejor: { o: OrificioDelClavo; s: number } | null = null
      for (const o of e.clavo.orificios) {
        const s = posicionDelOrificioMm(e.clavo, o)
        if (!mejor || Math.abs(alLargoDelClic - s) < Math.abs(alLargoDelClic - mejor.s)) mejor = { o, s }
      }
      if (!mejor) {
        t.decir?.('Este clavo no trae orificios de bloqueo: el cefalomedular se bloquea con su tornillo cefálico.')
        return
      }
      if (Math.abs(alLargoDelClic - mejor.s) > 25) {
        t.decir?.('Ahí no hay ningún orificio del clavo: apunte a la altura de uno de los orificios oscuros.')
        return
      }
      const { o, s } = mejor
      if (e.bloqueos.some((b) => b.orificio === o.id)) {
        t.decir?.(`El orificio ${o.id} ya tiene su tornillo.`)
        return
      }
      const guiado = o.zona === 'proximal' && e.arcoMontado
      const desviacionMm = alLargoDelClic - s
      const juicio = juzgarLaPunteria({ desviacionMm, guiadoPorElArco: guiado, orificio: o.id })
      // Acertando, el tornillo pasa por el centro; si no, por donde se apuntó.
      const corrimientoMm = juicio.punteria === 'acierta' ? 0 : desviacionMm
      const centro = canal.origen.clone().addScaledVector(canal.direccion, (s + corrimientoMm) * unidades)
      const huesosDelClavo = [e.entrada.proximal, e.entrada.distal].filter((x): x is THREE.Object3D => !!x)
      for (const h of huesosDelClavo) h.updateMatrixWorld(true)
      let entrada: THREE.Vector3 | null = null
      let haciaDentro = canal.transversal.clone().negate()
      for (const signo of [1, -1]) {
        const lado = canal.transversal.clone().multiplyScalar(signo)
        const origen = centro.clone().addScaledVector(lado, 120 * unidades)
        const golpeDelRayo = new THREE.Raycaster(origen, lado.clone().negate(), 0, 400 * unidades).intersectObjects(huesosDelClavo, true)[0]
        if (golpeDelRayo) {
          entrada = golpeDelRayo.point.clone()
          haciaDentro = lado.clone().negate()
          break
        }
      }
      if (!entrada) {
        t.decir?.(`El orificio ${o.id} no cae sobre el hueso: el clavo no llega hasta ahí.`)
        return
      }
      const id = (t.siguienteTornilloLibre = (t.siguienteTornilloLibre ?? 0) + 1) * -1
      const puesto = colocarTornilloEnLinea({
        escena: t.escena,
        plantilla: herramienta.raiz,
        id,
        entrada,
        haciaDentro,
        largoMm: u.largoDeTornillo,
        diametroMm: u.diametroDeTornillo ?? inst.coloca.diametroMm,
        diametroDelModeloMm: inst.coloca.diametroMm,
        largoDelModeloMm: inst.coloca.largoDelModeloMm,
        bloqueado: true,
        milimetrosPorUnidad: mm,
        huesos: huesosDelClavo,
        implantes: imp,
        url: inst.url,
      })
      if (!puesto) {
        t.decir?.('Por ahí no hay hueso donde atornillar.')
        return
      }
      puesto.deClavo = o.id
      puesto.punteria = juicio.punteria
      e.bloqueos.push({ orificio: o.id, zona: o.zona, tornilloId: id, punteria: juicio.punteria, bloquea: juicio.bloquea })
      const texto =
        `Tornillo de bloqueo en ${o.id}${o.dinamico ? ' (orificio dinámico)' : ''}, ${guiado ? 'guiado por el arco' : 'a pulso'}: ` +
        (puesto.bicortical ? 'bicortical.' : 'solo la cortical cercana: pida uno más largo con el medidor.') +
        (puesto.aviso && puesto.bicortical ? ` ${puesto.aviso}` : '') +
        (juicio.aviso ? ` ${juicio.aviso}` : '')
      t.decir?.(texto)
      u.alFijar?.(estadoDeLaFijacion(t), { tipo: 'tornillo', texto, atencion: !!juicio.aviso || !!puesto.aviso, libre: true })
      avisarElEnclavado()
      t.pedirDibujo?.()
    }

    const apretarConClic = () => {
      const t = taller.current
      const u = ultimas.current
      const a = u.instrumento?.atornilla
      if (!a) return
      if (a.tipo === 'limitador') {
        if (a.torqueNm === null) {
          t.decir?.('No se lee en el nombre de este limitador cuántos N·m admite («Limitador de torque 1,5 N·m»).')
          return
        }
        t.limitadorNm = t.limitadorNm === a.torqueNm ? null : a.torqueNm
        u.alCambiarElLimitador?.(t.limitadorNm)
        t.decir?.(t.limitadorNm ? `Limitador de ${String(t.limitadorNm).replace('.', ',')} N·m montado en el destornillador.` : 'Limitador de torque retirado del destornillador.')
        return
      }
      const imp = t.implantes
      if (!imp || imp.tornillos.size === 0) {
        t.decir?.('No hay tornillos puestos que apretar: primero se coloca el tornillo.')
        return
      }
      const golpe = rayo.intersectObjects([...imp.tornillos.values()].map((x) => x.grupo), true)[0]
      const puesto = golpe ? [...imp.tornillos.values()].find((x) => perteneceA(golpe.object, x.grupo)) : undefined
      if (!puesto) {
        t.decir?.('Apunte a un tornillo puesto: el destornillador aprieta el tornillo al que se apunta.')
        return
      }
      const datos = puesto.datos
      const juicio = juzgarElApriete({
        tornillo: { bloqueado: datos.bloqueado, diametroMm: datos.diametroMm, deClavo: !!datos.deClavo },
        destornillador: destornilladorDelNombre(u.instrumento?.nombre ?? ''),
        limitadorNm: t.limitadorNm ?? null,
      })
      datos.apriete = { apretado: juicio.apretado, texto: juicio.texto, aviso: juicio.aviso }
      const cual = datos.deClavo ? `de bloqueo en ${datos.deClavo}` : datos.libre ? 'de la trayectoria' : `del agujero ${datos.agujero + 1}`
      const texto = juicio.apretado ? `Tornillo ${cual} apretado ${juicio.texto}.${juicio.aviso ? ` ${juicio.aviso}` : ''}` : (juicio.aviso ?? 'No se pudo apretar.')
      t.decir?.(texto)
      u.alFijar?.(estadoDeLaFijacion(t), { tipo: 'aviso', texto, atencion: !juicio.apretado || !!juicio.aviso, libre: !!datos.libre })
      t.pedirDibujo?.()
    }

    // --- injertos óseos (P-005 E7) ------------------------------------------------------------------------------
    // El esponjoso se deposita por puñados donde falta hueso, junto al foco; el bloque tricortical ocupa el hueco entre los fragmentos. Se juzga contra el defecto de
    // ahora (la diástasis), que cambia al reducir: por eso el lienzo reporta lo puesto y la consola lo juzga. Las reglas están en `src/lib/injertoOseo.ts`.
    const anchoDelHuesoEnElFocoMm = () => {
      const f = taller.current.fragmento
      if (!f) return 30
      const tamano = new THREE.Box3().setFromObject(f).getSize(new THREE.Vector3())
      const otros = [0, 1, 2].filter((k) => k !== indiceDelEjeLargo()).map((k) => tamano.getComponent(k))
      // El fragmento trae la epífisis y es más ancho que la diáfisis donde se injerta: se acota a lo que mide un hueso largo de adulto.
      return Math.min(32, Math.min(...otros) * (ultimas.current.milimetrosPorUnidad || 1000))
    }
    const lecturaDelInjerto = (): InjertoPuesto | null => {
      const t = taller.current
      const inj = t.injerto
      if (!inj || (inj.esponjosoCc === 0 && !inj.bloque)) return null
      const imp = t.implantes
      const hayFijacion = !!(imp?.placa?.fijada || (imp?.tornillos.size ?? 0) > 0 || t.enclavado?.clavo)
      return { esponjosoCc: inj.esponjosoCc, bloqueLargoMm: inj.bloque?.largoMm ?? null, anchoDelHuesoMm: anchoDelHuesoEnElFocoMm(), sinFijacion: !hayFijacion }
    }
    /**
     * Dónde está el foco, para alojar un injerto: a medio camino, sobre el eje, entre el fragmento del caso y el trozo de hueso que **se le enfrenta**. Ese trozo es el hueso
     * fijo cuya huella (en los otros dos ejes) más se parece a la del fragmento y que está pegado a él a lo largo del eje —no la fíbula, que va al lado, ni el fémur, que
     * está lejos—. `posicionDeLaFractura` toma todo el resto del hueso visible y en una pierna entera cae lejos del foco.
     */
    const focoEntreLosFragmentos = (): THREE.Vector3 | null => {
      const i = indiceDelEjeLargo()
      const enfrente = huesoQueSeEnfrenta(taller.current, ultimas.current.piezas, i, ultimas.current.milimetrosPorUnidad || 1000)
      if (!enfrente) return null
      const { caja: otra, cajaDelFragmento: cajaF } = enfrente
      const centro = cajaF.getCenter(new THREE.Vector3())
      const frente = otra.getCenter(new THREE.Vector3())
      const mitad =
        centro.getComponent(i) < frente.getComponent(i)
          ? (cajaF.max.getComponent(i) + otra.min.getComponent(i)) / 2
          : (cajaF.min.getComponent(i) + otra.max.getComponent(i)) / 2
      return centro.setComponent(i, mitad)
    }
    const injertarConClic = () => {
      const t = taller.current
      const u = ultimas.current
      const que = u.instrumento?.injerta
      if (!que || !t.escena) return
      const golpe = huesoBajoElCursor()
      if (!golpe) {
        t.decir?.('Apunte al hueso, junto al foco: el injerto va donde falta hueso.')
        return
      }
      const fractura = focoEntreLosFragmentos()
      if (!fractura) {
        t.decir?.('Este caso no tiene un foco de fractura donde alojar el injerto.')
        return
      }
      const mm = u.milimetrosPorUnidad || 1000
      const defectoMm = u.medidasDelFoco?.diastasisMm ?? 0
      const alLejos = Math.abs(golpe.point.getComponent(indiceDelEjeLargo()) - fractura.getComponent(indiceDelEjeLargo())) * mm
      if (alLejos > CERCA_DEL_FOCO_MM + defectoMm / 2) {
        t.decir?.(`Eso queda a ${Math.round(alLejos)} mm del foco: el injerto va en el defecto entre los fragmentos, no lejos de él.`)
        return
      }
      const inj = (t.injerto ??= crearInjerto(t.escena))
      if (que.tipo === 'esponjoso') {
        if (!depositarPunado(inj, golpe.point, normalDelGolpe(golpe), mm)) {
          t.decir?.('Ya no cabe más injerto en la escena: es mucho más de lo que cabe en cualquier defecto.')
          return
        }
        inj.esponjosoCc += VOLUMEN_POR_PUNADO_CC
      } else {
        const eje = new THREE.Vector3(...ejesDelPaciente(u.ejeLargo).hueso)
        const largo = que.largoBloqueMm ?? largoDeBloqueParaElDefecto(defectoMm)
        colocarBloque(t.escena, inj, fractura, eje, largo, mm)
      }
      const puesto = lecturaDelInjerto()
      u.alCambiarElInjerto?.(puesto)
      const juicio = puesto ? juzgarElInjerto(puesto, defectoMm) : null
      const texto =
        que.tipo === 'esponjoso'
          ? `Injerto esponjoso: ${inj.esponjosoCc} cc puestos.${juicio?.relleno.aviso ? ` ${juicio.relleno.aviso}` : ' El defecto está bien relleno.'}`
          : `Bloque tricortical de ${inj.bloque?.largoMm} mm en el defecto.${juicio?.bloque?.aviso ? ` ${juicio.bloque.aviso}` : ' Encaja.'}${juicio?.bloque?.sinFijacion ? ' Falta fijarlo: un bloque estructural sin placa ni clavo se mueve.' : ''}`
      t.decir?.(texto)
      t.pedirDibujo?.()
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

      if (inst.injerta) {
        injertarConClic()
        return
      }

      // El destornillador y el limitador aprietan lo ya puesto; el tornillo de bloqueo va por los orificios del clavo (P-005 E6).
      if (inst.atornilla) {
        apretarConClic()
        return
      }
      if (inst.coloca?.tipo === 'tornillo' && inst.coloca.soloConClavo && herramienta) {
        ponerElTornilloDeBloqueo()
        return
      }

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
          orificios: inst.orificios ?? null,
          punto: golpe.point,
          normal: normalDelGolpe(golpe),
          ejeDelHueso: eje,
          milimetrosPorUnidad: mmPorUnidad,
          huesos,
          implantes: imp,
          // Si la placa en la mano es la que se dobló en la mesa, se apoya con su forma (P-005 E1).
          contorno: t.mesa && t.mesa.instrumentoId && t.mesa.instrumentoId === inst.id ? t.mesa.contorno : undefined,
          url: inst.url,
        })
        if (!placa) {
          decirYAvisar({
            tipo: 'aviso',
            texto:
              'Este modelo de placa no trae la posición de sus agujeros. Un editor puede escribir cuántos orificios tiene en su instrumento (Taller anatómico → Instrumental) o volver a cargar el modelo desde el catálogo.',
            atencion: true,
          })
          return
        }
        // Lo que mide el hueso visible, en milímetros: de ahí salen los rangos del ajuste y no de un tope fijo.
        const cajaDelHueso = new THREE.Box3()
        for (const h of huesos) cajaDelHueso.expandByObject(h)
        const tamanoDelHueso = cajaDelHueso.getSize(new THREE.Vector3())
        const indiceDelEje = ultimas.current.ejeLargo === 'x' ? 0 : ultimas.current.ejeLargo === 'z' ? 2 : 1
        const aMm = ultimas.current.milimetrosPorUnidad || 1000
        const anchoDelHueso = Math.max(...[0, 1, 2].filter((i) => i !== indiceDelEje).map((i) => tamanoDelHueso.getComponent(i))) * aMm
        placa.rangos = rangosDeLaPlaca({
          largoDelHuesoMm: cajaDelHueso.isEmpty() ? 0 : tamanoDelHueso.getComponent(indiceDelEje) * aMm,
          anchoDelHuesoMm: cajaDelHueso.isEmpty() ? 0 : anchoDelHueso,
          largoDeLaPlacaMm: placa.largoMm,
        })
        // A qué sentido anatómico lleva el signo + de «de lado a lado»: el lateral del ajuste es normal × eje del hueso.
        const lateralDelAjuste = new THREE.Vector3().crossVectors(placa.anclaje.normal, placa.anclaje.ejeDelHueso)
        placa.sentidoDelLado = sentidoSobreElEje(
          [lateralDelAjuste.x, lateralDelAjuste.y, lateralDelAjuste.z],
          ejesDelPaciente(ultimas.current.ejeLargo).frente,
        )
        const separada = placa.separadaDelHuesoMm
        // La de la mano se esconde ya y no en el próximo movimiento del ratón: si no, se queda cruzada sobre la que se apoyó
        // hasta que se mueve el cursor (P-008 E4; `posarHerramienta` ya no la vuelve a enseñar con una puesta).
        if (herramienta.raiz.visible) herramienta.raiz.visible = false
        esconderLaPlacaPrevia()
        // La placa de la mesa ya está en el hueso: sale de la mesa.
        if (placa.contorno && t.mesa) {
          soltarLaMesa(t.mesa)
          t.mesa = undefined
          ultimas.current.alCambiarLaMesa?.(null)
        }
        // Asentada como un sólido (P-009), lo que importa es sobre qué fragmentos queda y si apoya en los dos; la
        // separación bajo un agujero solo se dice si no se pudo asentar.
        const delAsiento = avisoDeLaPlacaPuesta(placa, ultimas.current.piezas, ultimas.current.medidasDelFoco)
        decirYAvisar({
          tipo: 'placa',
          texto:
            `${placa.nombre} apoyada${placa.contorno ? ` con la forma que se le dio (${placa.contorno.texto.toLowerCase()})` : ''}: ${placa.agujerosMm.length} agujeros${placa.agujerosDelModelo ? '' : ' (repartidos a partes iguales)'}.` +
            (delAsiento?.texto ? ` ${delAsiento.texto}` : '') +
            (!delAsiento && separada > 1.5 ? ` Queda a ${separada.toFixed(1).replace('.', ',')} mm del hueso: apóyela donde el hueso sea más recto.` : '') +
            ' Muévala hacia proximal o distal, anterior o posterior, o angúlela, y pulse «Fijar la placa».' +
            (placa.avisoDeOrificios ? ` ${placa.avisoDeOrificios}` : ''),
          atencion: !!delAsiento?.atencion || (!delAsiento && separada > 1.5) || !!placa.avisoDeOrificios,
        })
        return
      }

      // Con un tornillo entrando, el clic no pone otro (pedido 13): ese se termina o se saca antes, como la broca puesta.
      if (inst.coloca?.tipo === 'tornillo' && atornillando) {
        t.decir?.(
          `El tornillo del agujero ${atornillando.agujero + 1} está entrando: métalo arrastrando con el botón derecho hacia arriba o pulse «Atornillar hasta el final»; «Sacar el tornillo» lo quita.`,
        )
        return
      }

      // Un tornillo o el medidor: un agujero de la placa bajo el cursor o, sin él, la trayectoria de dos clics (P-004 E9).
      const placa = imp.placa
      let agujero: number | null = null
      if (placa) {
        const golpesDePlaca = rayo.intersectObject(placa.grupo, true)
        const sobreLaPlaca = golpesDePlaca[0]?.point ?? huesoBajoElCursor()?.point
        agujero = sobreLaPlaca ? agujeroBajoElPunto(placa, sobreLaPlaca, 7) : null
      }
      const libre = t.trayectoriaDelTornillo
      if (agujero === null && libre && (inst.mide || inst.coloca?.tipo === 'tornillo')) {
        fijarEnLaTrayectoria(libre)
        return
      }
      if (!placa) {
        t.decir?.('Coloque primero una placa sobre el hueso, o marque la trayectoria del tornillo con dos clics («Marcar la trayectoria»).')
        return
      }
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
        // La serie la da la broca con que se perforó el agujero (D-301): el medidor entra antes de que se elija el tornillo.
        const serie = serieDelSistema(placa.agujeros.get(agujero)?.perforado?.diametroMm)
        const sugerido = largoSugerido(medida.espesorMm, antesDelHueso, serie)
        const noAlcanza = avisoDelLargo(medida.espesorMm, antesDelHueso, serie)
        placa.agujeros.set(agujero, { perforado: placa.agujeros.get(agujero)!.perforado, medido: { espesorMm: medida.espesorMm, sugeridoMm: sugerido } })
        decirYAvisar({
          tipo: 'medida',
          texto: `Agujero ${agujero + 1}: hueso de ${medida.espesorMm.toFixed(0)} mm${
            antesDelHueso >= 1 ? ` y ${antesDelHueso.toFixed(0)} mm de placa y holgura` : ''
          }. Pida un tornillo de ${sugerido} mm.${noAlcanza ? ` ${noAlcanza}` : ''}`,
          atencion: !!noAlcanza,
          largoSugeridoMm: sugerido,
          agujero,
        })
        return
      }
      if (inst.coloca?.tipo === 'tornillo' && herramienta) {
        if (inst.coloca.soloConClavo) {
          t.decir?.('Este tornillo es de bloqueo de clavo: va por los orificios del clavo. Para una placa use el cortical, el de esponjosa o el bloqueado LCP.')
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
        // El diámetro que eligió el residente en la lista (P-004 E9), o el del modelo.
        const diametro = ultimas.current.diametroDeTornillo ?? inst.coloca.diametroMm
        const calibre = avisoDeCalibre(placa.agujeros.get(agujero)!.perforado!.diametroMm, diametro, claseDelTornillo(inst.coloca, inst.tornillo?.tipo))
        const puesto = colocarTornillo({
          escena: t.escena,
          plantilla: herramienta.raiz,
          placa,
          agujero,
          largoMm: ultimas.current.largoDeTornillo,
          diametroMm: diametro,
          diametroDelModeloMm: inst.coloca.diametroMm,
          largoDelModeloMm: inst.coloca.largoDelModeloMm,
          bloqueado: inst.coloca.bloqueado,
          huesos,
          implantes: imp,
          url: inst.url,
        })
        if (!puesto) {
          t.decir?.('Bajo ese agujero no hay hueso donde atornillar.')
          return
        }
        // Puesto ya está, medido y juzgado; lo que cambia (pedido 13) es que se queda en la entrada del agujero y entra con la
        // rueda, y solo al asentar la cabeza va a `implantes.tornillos`, cuenta y comprime: la compresión del óvalo es la cabeza
        // apretando contra su rampa, que no ocurre con el tornillo a medias.
        const entrada = imp.tornillos.get(agujero)!
        imp.tornillos.delete(agujero)
        const oval = !puesto.bloqueado && formaDeLosAgujeros({ nombre: placa.nombre }) !== 'redondo'
        const desviacionMm = oval ? (t.desviaciones?.get(agujero) ?? 0) : 0
        // La cabeza del tornillo queda donde se brocó, no en el centro del óvalo (P-004 E10).
        if (desviacionMm !== 0) entrada.grupo.position.addScaledVector(ejeDeLaPlaca(placa), desviacionMm / mmPorUnidad)
        atornillando = {
          agujero,
          entrada,
          asentado: entrada.grupo.position.clone(),
          giroAsentado: entrada.grupo.quaternion.clone(),
          salida: placa.normal.clone().normalize(),
          metidoMm: 0,
          calibre,
          oval,
          desviacionMm,
        }
        posarElTornilloQueEntra()
        t.decir?.(
          `${textoDelTornilloQueEntra({ largoMm: puesto.largoMm, metidoMm: 0, agujero: agujero + 1 })}. Métalo arrastrando con el botón derecho hacia arriba (Mayúsculas afina): se queda donde va mientras pide el disparo.`,
        )
      }
    }

    /** Pone el tornillo que entra donde va: lo que falta por meter asoma por la normal de la placa, girado lo que manda la rosca. */
    const posarElTornilloQueEntra = () => {
      const a = atornillando
      if (!a) return
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const grupo = a.entrada.grupo
      grupo.position.copy(a.asentado).addScaledVector(a.salida, (a.entrada.datos.largoMm - a.metidoMm) * unidadesPorMm)
      // El giro se cuenta desde el asentado hacia atrás: así, al asentar, el modelo queda exactamente como lo dejó `colocarTornillo`.
      const vueltas = giroDelTornilloRad(a.metidoMm - a.entrada.datos.largoMm, a.entrada.datos.diametroMm)
      grupo.quaternion.copy(a.giroAsentado).premultiply(new THREE.Quaternion().setFromAxisAngle(a.salida, vueltas))
      grupo.updateMatrixWorld(true)
      ultimas.current.alCambiarElTornillo?.({ agujero: a.agujero + 1, largoMm: a.entrada.datos.largoMm, metidoMm: a.metidoMm })
      taller.current.pedirDibujo?.()
    }

    /** Asienta la cabeza: el tornillo pasa a contar, se juzga en voz alta y, en un orificio oval, comprime (P-004 E10). */
    const asentarElTornillo = () => {
      const a = atornillando
      const t = taller.current
      const placa = t.implantes?.placa
      if (!a || !t.implantes || !placa) return
      a.metidoMm = a.entrada.datos.largoMm
      a.entrada.grupo.position.copy(a.asentado)
      a.entrada.grupo.quaternion.copy(a.giroAsentado)
      a.entrada.grupo.updateMatrixWorld(true)
      atornillando = null
      ultimas.current.alCambiarElTornillo?.(null)
      t.implantes.tornillos.set(a.agujero, a.entrada)
      const puesto = a.entrada.datos
      let compresion = ''
      if (a.oval) {
        const lado = ladoDeLaFracturaEnElAgujero(placa, a.agujero)
        if (lado !== null) compresion = aplicarLaCompresion(resultadoDelOval(a.desviacionMm, lado, semilargoDelOvalDeLaPlaca(placa.nombre)))
      }
      const suceso: SucesoDeFijacion = {
        tipo: 'tornillo',
        texto:
          `Tornillo de ${puesto.largoMm} mm en el agujero ${a.agujero + 1}: ` +
          (puesto.bicortical ? 'bicortical.' : 'solo la cortical cercana.') +
          (puesto.aviso && puesto.bicortical ? ` ${puesto.aviso}` : '') +
          (a.calibre ? ` ${a.calibre}` : '') +
          (compresion ? ` ${compresion}` : ''),
        atencion: !!puesto.aviso || !!a.calibre,
        agujero: a.agujero,
      }
      t.decir?.(suceso.texto)
      ultimas.current.alFijar?.(estadoDeLaFijacion(t), suceso)
      t.pedirDibujo?.()
    }

    taller.current.moverElTornillo = (sentido, fino) => {
      const a = atornillando
      if (!a) return
      a.metidoMm = metidoTrasLaRueda(a.metidoMm, a.entrada.datos.largoMm, sentido, fino)
      if (estaAsentado(a.metidoMm, a.entrada.datos.largoMm)) {
        asentarElTornillo()
        return
      }
      posarElTornilloQueEntra()
      taller.current.decir?.(textoDelTornilloQueEntra({ largoMm: a.entrada.datos.largoMm, metidoMm: a.metidoMm, agujero: a.agujero + 1 }))
    }
    taller.current.terminarElTornillo = () => asentarElTornillo()
    taller.current.sacarElTornillo = () => {
      const a = atornillando
      if (!a) return
      atornillando = null
      soltarGrupo(a.entrada.grupo)
      ultimas.current.alCambiarElTornillo?.(null)
      taller.current.decir?.(`Tornillo sacado del agujero ${a.agujero + 1}: el agujero sigue perforado y medido.`)
      taller.current.pedirDibujo?.()
    }

    const alSubirParaCoser = (evento: PointerEvent) => {
      const clic = clicDeSutura
      clicDeSutura = null
      if (!clic) return
      if (Math.hypot(evento.clientX - clic.x, evento.clientY - clic.y) > 5) return
      if (ultimas.current.modo === 'fijar') {
        aCoordenadas(evento)
        // Con «Marcar la trayectoria» encendido el clic es la entrada o la salida, no un tornillo (P-004 E9).
        if (ultimas.current.marcandoLaTrayectoria) marcarPuntoDeLaTrayectoria()
        else fijarConClic()
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
      // El plano de la puntada es el de la pieza que se tocó. En un caso con fascia cada hilo va a su plano: una puntada de
      // Vicryl sobre la piel, o de nailon sobre la fascia, se avisa y no cuenta (Cristóbal: «el vicryl debe ir a la fascia»).
      const plano = planoDeLaPuntada(ultimas.current.piezas.find((p) => p.nodo === golpe.object.name)?.rol)
      if (t.cierrePorPlanos) {
        const juicioDelPlano = juicioDelHiloEnElPlano(hilo, plano)
        if (!juicioDelPlano.acepta) {
          const texto = juicioDelPlano.texto ?? 'Esa puntada no va en ese plano.'
          t.decir?.(texto)
          ultimas.current.alGesto?.(texto, 'atencion')
          return
        }
      }
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
        lado: ladoDelPunto(t, golpe.point, unidadesPorMm, t.cierrePorPlanos ? plano : undefined),
        // Cambiar de plano abre una línea nueva: el hilo de la fascia no se tiende hasta la piel.
        nuevaLinea:
          sutura.puntos.length === 0 ||
          !!sutura.siguienteEsNueva ||
          (!!t.cierrePorPlanos && (sutura.puntos[sutura.puntos.length - 1].plano ?? 'piel') !== plano),
        plano,
      }
      nuevoPunto.ref = seguirAlLabio(t, golpe, unidadesPorMm)
      sutura.puntos.push(nuevoPunto)
      sutura.siguienteEsNueva = false
      // El deslizador pasa al plano en que se acaba de coser, con la tensión que ese plano llevaba.
      if (t.cierrePorPlanos && sutura.planoActivo !== plano) {
        sutura.planoActivo = plano
        sutura.tension = sutura.tensiones[plano] ?? 0
      }
      refrescarSutura(t, ultimas.current.milimetrosPorUnidad, ultimas.current.alCoser, 'ultima', ultimas.current.alHerir)
    }

    // El arrastre con el botón derecho en curso (P-009): se declara aquí porque `alMover` lo mira.
    let arrastreDerecho: {
      x: number
      y: number
      yDeLaMuesca: number
      id: number
      movido: boolean
      delInstrumento: boolean
      /** Dónde se pidió el menú contextual con el botón aún abajo: lo que es (clic o arrastre) se sabe al soltar. */
      menu?: { x: number; y: number }
    } | null = null
    let elDerechoArrastro = false
    const alMover = (evento: PointerEvent) => {
      // Mientras el derecho maneja el instrumento, el cursor sube y baja para abrir o meter: el separador sobre el que se
      // empezó sigue siendo el activo y lo de la mano no se mueve.
      if (arrastreDerecho?.delInstrumento) return
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

      if ((modoActual === 'mover' || modoActual === 'reducir') && arrastreEnEje && piezaAgarrada) {
        const menu = ultimas.current.movimientoPorEje
        if (!menu) return
        const a = arrastreEnEje
        const caja = render.domElement.getBoundingClientRect()
        const fisico = ejeFisicoDelMovimiento(menu.accion, menu.eje)
        const letra = letraDelEje(fisico, ultimas.current.ejeLargo)
        let traslacion = new THREE.Vector3()
        let giro = new THREE.Quaternion()
        let valor: number
        const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
        const v = vectorDelEje(fisico, ultimas.current.ejeLargo)
        const eje = new THREE.Vector3(v[0], v[1], v[2])
        if (menu.accion === 'trasladar') {
          // Mayúsculas afina: la quinta parte, para llevarlo a una cifra sin acercar la vista.
          traslacion = desplazamientoDelArrastre(camara, a.pivote, evento.clientX - a.x, evento.clientY - a.y, Math.max(1, caja.height), letra)
          if (evento.shiftKey) traslacion.multiplyScalar(0.2)
          valor = traslacion.dot(eje) / unidadesPorMm
        } else {
          valor = gradosDelArrastre(evento.clientX - a.x, evento.shiftKey)
          giro = new THREE.Quaternion().setFromAxisAngle(eje, radianes(valor))
        }
        const { posicion, rotacion } = colocarEnElMundo(a.inicial, a.inversaDelPadre, a.pivote, traslacion, giro)
        piezaAgarrada.position.copy(posicion)
        piezaAgarrada.quaternion.copy(rotacion)
        taller.current.decir?.(lecturaDelMovimiento(menu.accion, menu.eje, valor))
        pedirDibujo()
        return
      }

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
      // Soltar el ratón detiene el avance pero **no** retira la broca (P-004 E8): se queda en el hoyo hasta «Retirar».
      if (perforando) {
        perforando.avanzando = false
        avisarDeLaBroca(true)
      }

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
      arrastreEnEje = null
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
    // --- el arrastre con el botón derecho: lo que antes hacía la rueda (P-009, mejora de uso 7) -----------------
    // La rueda acerca siempre. Antes, con un instrumento que la usaba, la rueda abría el separador o metía la broca y
    // acercar pedía Ctrl: el mismo gesto hacía dos cosas según lo que hubiera en la mano, y el residente que quería mirar
    // de cerca abría la herida sin querer. Ahora lo del instrumento se hace arrastrando con el botón derecho —hacia
    // arriba, lo que era la rueda hacia delante: abre, mete, alarga—, una muesca cada diez píxeles, con las mismas
    // Mayúsculas de antes. Un clic derecho sin arrastre sigue siendo un clic: retira la broca, o abre el menú de los
    // instrumentos en la consola. Mientras el instrumento lo usa, el derecho no desplaza la vista (`enablePan`).
    const PIXELES_POR_MUESCA = 10
    const alBajarConElDerecho = (evento: PointerEvent) => {
      if (evento.button !== 2) return
      elDerechoArrastro = false
      const u = ultimas.current
      arrastreDerecho = {
        x: evento.clientX,
        y: evento.clientY,
        yDeLaMuesca: evento.clientY,
        id: evento.pointerId,
        movido: false,
        delInstrumento: Boolean(u.capturaLaRueda && u.alRueda),
      }
    }
    const alMoverConElDerecho = (evento: PointerEvent) => {
      const a = arrastreDerecho
      if (!a || evento.pointerId !== a.id) return
      // Cuatro píxeles separan un clic de un arrastre: también cuando el derecho desplaza la vista, que soltado tras
      // desplazarla no tiene que abrir el menú.
      if (!a.movido && Math.hypot(evento.clientX - a.x, evento.clientY - a.y) > 4) a.movido = true
      const alRueda = ultimas.current.alRueda
      if (!a.delInstrumento || !alRueda) return
      const muescas = Math.trunc((evento.clientY - a.yDeLaMuesca) / PIXELES_POR_MUESCA)
      if (muescas === 0) return
      a.yDeLaMuesca += muescas * PIXELES_POR_MUESCA
      const delta = Math.sign(muescas) * 100
      // Con Mayúsculas, lo fino del instrumento si lo tiene (las mandíbulas, la quinta parte de la broca); si no, lo de
      // siempre. Con la rueda, unas Mayúsculas que el instrumento no usaba acercaban la vista; aquí no hay nada que
      // acercar, y un arrastre que no hiciera nada parecería roto.
      for (let i = 0; i < Math.abs(muescas); i++) {
        if (!(evento.shiftKey && alRueda(delta, true))) alRueda(delta, false)
      }
    }
    const alSoltarConElDerecho = (evento: PointerEvent) => {
      const a = arrastreDerecho
      if (!a || evento.pointerId !== a.id) return
      arrastreDerecho = null
      elDerechoArrastro = a.movido
      // El menú contextual llegó al pulsar (macOS, Linux): era un clic si no hubo arrastre, y se atiende ahora.
      if (a.menu && !a.movido) clicDerechoLimpio(a.menu.x, a.menu.y)
    }
    superficie.addEventListener('pointerdown', alBajarConElDerecho)
    superficie.addEventListener('pointermove', alMoverConElDerecho)
    superficie.addEventListener('pointerup', alSoltarConElDerecho)
    superficie.addEventListener('pointercancel', alSoltarConElDerecho)

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
    superficie.addEventListener('pointerdown', alBajarParaGirar)
    superficie.addEventListener('pointermove', alMoverParaGirar)
    superficie.addEventListener('pointerup', alSoltarParaGirar)
    superficie.addEventListener('pointercancel', alSoltarParaGirar)

    superficie.addEventListener('pointerdown', alBajar)
    superficie.addEventListener('pointerdown', alBajarParaCoser)
    superficie.addEventListener('pointerup', alSubirParaCoser)
    superficie.addEventListener('pointerup', alSubirParaSeparar)
    superficie.addEventListener('pointerup', alSubirParaDisecar)
    const alSubirParaSoltarElTrozo = (evento: PointerEvent) => {
      const clic = clicEnElVacio
      clicEnElVacio = null
      if (clic && elegida && Math.hypot(evento.clientX - clic.x, evento.clientY - clic.y) < 5) {
        elegirLaPieza(null)
        gizmoAlDia()
        pedirDibujo()
      }
    }
    superficie.addEventListener('pointerup', alSubirParaSoltarElTrozo)
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
    superficie.addEventListener('pointermove', alMover)
    superficie.addEventListener('pointerup', alSubir)
    superficie.addEventListener('pointerleave', alSubir)
    superficie.addEventListener('pointerleave', esconderHerramienta)
    // El botón derecho retira la broca puesta (P-004 E8): es el gesto de sacarla, junto a «Retirar» y Esc.
    const clicDerechoLimpio = (x: number, y: number) => {
      if (perforando) {
        terminarPerforacion()
        return
      }
      // Un clic derecho limpio abre el menú de los instrumentos donde está el cursor (P-009, mejora de uso 9).
      ultimas.current.alAbrirElMenu?.(x, y)
    }
    const alClicDerecho = (evento: MouseEvent) => {
      evento.preventDefault()
      // En Windows el menú contextual sale al soltar, y para entonces ya se sabe si hubo arrastre. En macOS y en Linux
      // sale al pulsar, con el arrastre aún por empezar: abrir ahí el menú taparía el lienzo justo cuando se iba a abrir
      // el separador. Se apunta y lo decide `alSoltarConElDerecho`.
      if (arrastreDerecho) {
        arrastreDerecho.menu = { x: evento.clientX, y: evento.clientY }
        return
      }
      // Tras un arrastre con el derecho —meter la broca, abrir el separador, desplazar la vista— soltar no es un clic.
      if (elDerechoArrastro) {
        elDerechoArrastro = false
        return
      }
      clicDerechoLimpio(evento.clientX, evento.clientY)
    }
    superficie.addEventListener('contextmenu', alClicDerecho)

    // --- acercar como se mira (P-012 E5) ----------------------------------------------------------------------------
    // La rueda acerca hacia lo que hay bajo el cursor y no hacia el centro de la vista (`acercarComoSeMira.ts`). Va en la
    // fase de captura de la superficie, antes de que la rueda llegue al lienzo: `OrbitControls` la escucha ahí y acercaría
    // también, a su manera. Su zoom no se apaga, porque es el mismo que atiende el pellizco de dos dedos en una tableta.
    let focoDeLaRueda: { x: number; y: number; cuando: number; punto: THREE.Vector3 | null } | null = null
    const alRodar = (evento: WheelEvent) => {
      evento.preventDefault()
      evento.stopPropagation()
      const muescas = muescasDeLaRueda(evento)
      if (muescas === 0) return
      // El punto bajo el cursor se busca una vez por gesto: la homotecia lo deja quieto en la pantalla, así que mientras
      // el cursor no se mueve sigue siendo el mismo, y cada rayo recorre el modelo entero. Un gesto nuevo lo busca de
      // nuevo, porque entre medias la vista pudo moverse sola (el encuadre de un paso).
      const ahora = performance.now()
      const f = focoDeLaRueda
      if (!f || ahora - f.cuando > 250 || Math.hypot(evento.clientX - f.x, evento.clientY - f.y) > 2) {
        apuntarA(evento.clientX, evento.clientY)
        const golpe = superficieBajoElCursor()
        focoDeLaRueda = { x: evento.clientX, y: evento.clientY, cuando: ahora, punto: golpe ? golpe.point.clone() : null }
      } else {
        f.cuando = ahora
      }
      const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
      const vista = acercarHacia(
        { camara: camara.position.toArray(), mirado: controles.target.toArray() },
        (focoDeLaRueda?.punto ?? controles.target).toArray(),
        muescas,
        { minimo: MAS_CERCA_MM * unidadesPorMm, maximo: MAS_LEJOS_MM * unidadesPorMm },
      )
      if (!vista) return
      // Acercar a mano para el movimiento de cámara que estuviera en curso: el último gesto manda.
      taller.current.turnoDeLaCamara = (taller.current.turnoDeLaCamara ?? 0) + 1
      camara.position.fromArray(vista.camara)
      controles.target.fromArray(vista.mirado)
      controles.update()
      pedirDibujo()
    }
    superficie.addEventListener('wheel', alRodar, { capture: true, passive: false })

    // El doble clic centra la vista donde se pulsa (P-012 E5), sin acercar: después la vista gira alrededor de ese punto.
    // Solo mirando («Mirar») o leyendo fichas, donde un clic no hace nada en el paciente: con el bisturí o la broca, los
    // dos clics del doble clic ya habrían marcado o perforado antes de que llegara.
    const alDobleClic = (evento: MouseEvent) => {
      const modo = ultimas.current.modo
      if (modo !== 'orbitar' && modo !== 'info') return
      apuntarA(evento.clientX, evento.clientY)
      const golpe = superficieBajoElCursor()
      if (!golpe) return
      evento.preventDefault()
      const pose = poseActual(camara, controles)
      llevarLaCamaraAlEncuadre(
        taller.current,
        { ...pose, centro: golpe.point.toArray(), distancia: camara.position.distanceTo(controles.target) },
        300,
      )
    }
    superficie.addEventListener('dblclick', alDobleClic)

    const observador = new ResizeObserver(() => {
      if (!contenedor.clientWidth) return
      camara.aspect = contenedor.clientWidth / Math.max(1, contenedor.clientHeight)
      camara.updateProjectionMatrix()
      render.setSize(contenedor.clientWidth, contenedor.clientHeight)
      oclusion?.tamano(render.domElement.width, render.domElement.height)
      sucio = true
    })
    observador.observe(contenedor)

    // El bucle no muere por una excepción (P-004 E2). three.js agenda el cuadro siguiente **después** de llamar a esta
    // función: si ella lanza, nadie lo agenda y el dibujo se para para siempre; el lienzo se queda con el último cuadro
    // y se queda en blanco en cuanto algo lo redimensiona (abrir el panel de la fluoroscopia). Cada etapa va en su
    // propio `try`, para que un fallo de las asas no impida dibujar el hueso, y se avisa **una vez** por etapa.
    const fallos = crearLimitadorDeFallos()
    const sinCaerse = (etapa: string, hacer: () => void) => {
      try {
        hacer()
      } catch (error) {
        sucio = false
        if (fallos.registrar(etapa)) {
          console.error(`[simulador] fallo al dibujar (${etapa}):`, error)
          taller.current.decir?.(`Falló una parte del dibujo («${etapa}»): la vista sigue. Si algo no se ve bien, pulse «Encuadrar».`)
        }
      }
    }
    const bucle = () => {
      const ahora = performance.now()
      if (perforando && perforando.avanzando && perforando.encendida) {
        // Con la config de la broca al engancharla, no la del instrumento que se lleve ahora (P-004 E8).
        const config = perforando.config
        const dt = (ahora - ultimoCuadro) / 1000
        const unidadesPorMm = 1 / (ultimas.current.milimetrosPorUnidad || 1000)
        taller.current.giroDeLaBroca = (taller.current.giroDeLaBroca ?? 0) + Math.min(0.05, dt) * 32
        perforando.profundidad =
          profundidadTrasUnCuadro(perforando.profundidad / unidadesPorMm, perforando.maxima / unidadesPorMm, config.avanceMmPorSegundo, dt) * unidadesPorMm
        posarBroca(null)
        avisarDeLaBroca()
        sucio = true
      }
      ultimoCuadro = ahora
      // Sin contexto no hay nada que dibujar, y llamar a `render` con él perdido solo llena la consola de avisos.
      if (render.getContext().isContextLost()) return
      // Que las asas aparezcan o desaparezcan al cambiar de modo o de submodo también pide un dibujo.
      const habiaAsas = manipulador.grupo.visible
      const habiaLinea = lineaDelEje.visible
      sinCaerse('asas', gizmoAlDia)
      if (manipulador.grupo.visible !== habiaAsas || lineaDelEje.visible !== habiaLinea) sucio = true
      let movio = false
      sinCaerse('controles', () => {
        movio = controles.update()
      })
      if (!sucio && !movio) return
      sucio = false
      // La cámara pudo moverse en la línea de arriba: las asas se recolocan y se reescalan para medir lo mismo.
      sinCaerse('asas', gizmoAlDia)
      // Los ejes de la guía se recolocan en cada dibujo: el fragmento se mueve
      // con el ratón y la guía tiene que seguirlo.
      if (taller.current.guias) {
        sinCaerse('guías', () => actualizarGuias(taller.current, ultimas.current.ejeLargo, ultimas.current.piezas))
      }
      sinCaerse('vello', () => velloAlDia(aspecto.current, taller.current.heridas.values()))
      // La oclusión, en su propio `try`: si falla, la imagen se dibuja igual, sin ella.
      sinCaerse('oclusión', () => oclusion?.calcular(render))
      sinCaerse('imagen', () => {
        pabellon.seguirLaCamara(camara)
        // La sombra de la lámpara se rehace aquí y solo aquí (ver `prepararElRenderizador`).
        render.shadowMap.needsUpdate = true
        render.render(escena, camara)
        taller.current.cuadro = (taller.current.cuadro ?? 0) + 1
      })
      sinCaerse('oclusión', () => oclusion?.aplicar(render))
    }
    render.setAnimationLoop(bucle)

    /**
     * Cambia el renderizador por otro **conservando la escena**: el modelo, el instrumental, la placa, los tornillos, el clavo, los injertos, las heridas y la cámara siguen
     * donde estaban, porque son objetos de three.js en la memoria normal y no del contexto gráfico que se perdió. Solo se rehace lo que sí era de la tarjeta: el renderizador
     * (con menos detalle, por si la causa era la memoria), el estudio que reflejan los instrumentos y lo de la fluoroscopia. Devuelve `false` si el navegador no da otro contexto.
     */
    reemplazarElRenderizador = () => {
      if (!vivo) return false
      window.clearTimeout(relojDelReemplazo)
      const viejo = render
      const lienzoViejo = viejo.domElement
      let nuevo: THREE.WebGLRenderer
      try {
        const calidadNueva = calidadDelDibujo(perdidasDeContexto)
        nuevo = new THREE.WebGLRenderer({ antialias: calidadNueva.suavizado, alpha: true, powerPreference: 'high-performance' })
        if (nuevo.getContext().isContextLost()) {
          nuevo.dispose()
          return false
        }
        prepararElRenderizador(nuevo, calidadNueva)
        // La oclusión era de la tarjeta de antes, y con el contexto perdido una vez ya no se calcula (`calidadDelDibujo`).
        oclusion?.liberar()
        oclusion = calidadNueva.oclusion ? crearOclusion(escena, camara) : null
        nuevo.setPixelRatio(razonDePixeles(devicePixelRatio, contenedor.clientWidth, contenedor.clientHeight, calidadNueva.razonMaxima))
        nuevo.setSize(contenedor.clientWidth, contenedor.clientHeight)
      } catch (error) {
        console.error('[simulador] no se pudo crear otro renderizador:', error)
        return false
      }
      viejo.setAnimationLoop(null)
      lienzoViejo.removeEventListener('webglcontextlost', alPerderElContexto)
      lienzoViejo.removeEventListener('webglcontextrestored', alRecuperarElContexto)
      nuevo.domElement.style.cursor = lienzoViejo.style.cursor
      superficie.appendChild(nuevo.domElement)
      lienzoViejo.remove()
      render = nuevo
      taller.current.render = nuevo
      // Los controles se vuelven a conectar al lienzo nuevo, con la cámara y el punto de mira donde estaban.
      controles.disconnect()
      controles.connect(nuevo.domElement)
      nuevo.domElement.style.touchAction = lienzoViejo.style.touchAction
      escucharElContexto(nuevo.domElement)
      rehacerLaSala(nuevo)
      oclusion?.tamano(nuevo.domElement.width, nuevo.domElement.height)
      oclusion?.escala(ultimas.current.milimetrosPorUnidad || 1000)
      reiniciarLaFluoroscopia(taller.current.fluoroscopia)
      try {
        viejo.dispose()
      } catch {
        // el contexto de antes ya no existe: no hay nada que soltar
      }
      sucio = true
      nuevo.setAnimationLoop(bucle)
      decirElContexto({ fase: 'recuperado', en: performance.now() })
      return true
    }
    taller.current.recrearElRenderizador = () => reemplazarElRenderizador()

    return () => {
      vivo = false
      window.clearTimeout(relojDelReemplazo)
      render.setAnimationLoop(null)
      observador.disconnect()
      controles.removeEventListener('change', pedirDibujo)
      window.clearInterval(reloj)
      guardarSesion()
      guardarLoColocado()
      superficie.removeEventListener('pointerdown', alBajarConElDerecho)
      superficie.removeEventListener('pointermove', alMoverConElDerecho)
      superficie.removeEventListener('pointerup', alSoltarConElDerecho)
      superficie.removeEventListener('pointercancel', alSoltarConElDerecho)
      superficie.removeEventListener('pointerdown', alBajarElPuntero, true)
      window.removeEventListener('pointerup', alSoltarElPuntero, true)
      window.removeEventListener('pointercancel', alSoltarElPuntero, true)
      taller.current.esconderLasVistasPrevias?.()
      superficie.removeEventListener('pointerdown', alBajarParaGirar)
      superficie.removeEventListener('pointermove', alMoverParaGirar)
      superficie.removeEventListener('pointerup', alSoltarParaGirar)
      superficie.removeEventListener('pointercancel', alSoltarParaGirar)
      superficie.removeEventListener('pointerdown', alBajar)
      superficie.removeEventListener('pointerdown', alBajarParaCoser)
      superficie.removeEventListener('pointerup', alSubirParaCoser)
      superficie.removeEventListener('pointerup', alSubirParaSeparar)
      superficie.removeEventListener('pointerup', alSubirParaDisecar)
      superficie.removeEventListener('pointerup', alSubirParaSoltarElTrozo)
      window.removeEventListener('keydown', alTeclear)
      // Antes de `forceContextLoss`, más abajo: perder el contexto a propósito al desmontar no es un fallo que avisar.
      render.domElement.removeEventListener('webglcontextlost', alPerderElContexto)
      render.domElement.removeEventListener('webglcontextrestored', alRecuperarElContexto)
      superficie.removeEventListener('pointerdown', alBajarParaElevar)
      superficie.removeEventListener('pointermove', alMoverParaElevar)
      superficie.removeEventListener('pointerup', alSoltarParaElevar)
      superficie.removeEventListener('pointerdown', alBajarParaEnclavar)
      superficie.removeEventListener('pointerup', alSoltarParaEnclavar)
      superficie.removeEventListener('pointercancel', alSoltarParaEnclavar)
      if (enclavando) window.clearInterval(enclavando.intervalo)
      if (taller.current.injerto) {
        quitarInjerto(taller.current.injerto)
        taller.current.injerto = undefined
      }
      if (taller.current.enclavado) {
        quitarTodoElEnclavado(taller.current.enclavado)
        taller.current.enclavado = undefined
      }
      if (taller.current.periostio) {
        soltarElPeriostio(taller.current.periostio)
        taller.current.periostio = undefined
      }
      for (const a of taller.current.alambres ?? []) {
        a.malla.removeFromParent()
        a.malla.geometry.dispose()
        ;(a.malla.material as THREE.Material).dispose()
      }
      taller.current.alambres = []
      superficie.removeEventListener('pointerdown', alBajarEnLaMesa)
      superficie.removeEventListener('pointermove', alMoverEnLaMesa)
      superficie.removeEventListener('pointerup', alSoltarEnLaMesa)
      superficie.removeEventListener('pointerdown', alBajarSobreLaPlaca)
      superficie.removeEventListener('pointermove', alMoverLaPlaca)
      superficie.removeEventListener('pointerup', alSoltarLaPlaca)
      superficie.removeEventListener('pointercancel', alSoltarLaPlaca)
      if (taller.current.mesa) {
        soltarLaMesa(taller.current.mesa)
        taller.current.mesa = undefined
      }
      superficie.removeEventListener('pointermove', alMover)
      superficie.removeEventListener('pointerup', alSubir)
      superficie.removeEventListener('pointerleave', alSubir)
      superficie.removeEventListener('pointerleave', esconderHerramienta)
      superficie.removeEventListener('contextmenu', alClicDerecho)
      superficie.removeEventListener('wheel', alRodar, { capture: true })
      superficie.removeEventListener('dblclick', alDobleClic)
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
      // El aspecto antes de `liberar`: devuelve a cada malla su material del archivo y suelta el vello y lo propio.
      soltarElAspecto(aspectoDelMontaje)
      oclusion?.liberar()
      pabellon.liberar()
      // Liberar a mano: aquí hay decenas de megabytes en la tarjeta y pasear
      // por la plataforma acabaría tirando la pestaña.
      liberar(escena)
      // El contexto de WebGL sobrevive a `dispose()` —que solo suelta las
      // estructuras internas del render— y a quitar el lienzo del documento.
      // Se pierde a propósito para que la tarjeta recupere la memoria al
      // cambiar de caso y no cuando el navegador se decida. Va después de
      // `liberar`, porque el borrado de texturas necesita el contexto vivo.
      escena.environment = null
      entorno.dispose()
      pmrem.dispose()
      render.forceContextLoss()
      render.dispose()
      render.domElement.remove()
      superficie.remove()
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
    // Con una posición reducida guardada, el sitio de reposo del fragmento es ese y no el del archivo (P-008 E5).
    const otroOrigen = aplicarPosicionesReducidas(taller.current, piezas)
    // El objetivo de los rayos X es copia del fragmento de antes, en su sitio de reposo: si cambió cualquiera de los
    // dos, se rehace en el efecto de las ayudas, que va justo detrás de este.
    if (fragmento !== anterior || otroOrigen) sincronizarAyudas(taller.current, false, undefined)

    aplicarPiezas(taller.current, piezas)
    // Una pieza que cambia de papel cambia de aspecto: el taller deja marcar la piel como hueso, y al revés.
    vestirElModelo(aspecto.current, taller.current.raiz, (nombre) => taller.current.rolesAplicados.get(nombre), ultimas.current.milimetrosPorUnidad || 1000)
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
  const idDelInstrumento = instrumento?.id
  // Cambiar de instrumento con una broca puesta la retira, con el calibre de la que era (P-004 E8). Es la limpieza del efecto y no
  // su cuerpo: corre justo cuando cambia el instrumento, y al desmontar no hay nada que retirar.
  useEffect(() => {
    const taller_ = taller
    return () => {
      taller_.current.retirarLaBroca?.()
      taller_.current.esconderLasVistasPrevias?.()
    }
  }, [idDelInstrumento])
  useEffect(() => {
    const escena = taller.current.escena
    if (!urlDelInstrumento || !escena) return
    let vivo = true
    let cargado: HerramientaCargada | undefined
    // Una placa recta a medida (P-008 E3) llega en el acto, sin archivo que bajar: `cargado` queda puesto antes de salir.
    cargarModeloDelInstrumento(
      urlDelInstrumento,
      (modelo) => {
        if (!vivo) return
        const h = prepararHerramienta(modelo)
        // El instrumento viene en metros y el caso en las unidades de su
        // archivo: una unidad mide `milimetrosPorUnidad` mm, y un metro son mil.
        h.raiz.scale.setScalar(1000 / (ultimas.current.milimetrosPorUnidad || 1000))
        h.raiz.visible = false
        escena.add(h.raiz)
        taller.current.herramienta = h
        taller.current.medidorEnElOrificio = false
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
    // La rueda acerca siempre (P-009); el arrastre con el derecho es del instrumento cuando el instrumento lo usa.
    controles.enableZoom = true
    controles.enablePan = !capturaLaRueda
    taller.current.esconderLasVistasPrevias?.()
    // Cambiar de modo o de forma de trazar deja sin terminar la recta que se había empezado.
    cancelarLaRecta(taller.current)
    // Salir de «Perforar» con una broca puesta la retira (P-004 E8): no se deja un hoyo a medias sin querer.
    if (modo !== 'perforar') taller.current.retirarLaBroca?.()
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
  /** Cuánto se corre la broca de cada orificio oval y lo comprimido hasta ahora (P-004 E10). */
  desviaciones?: Map<number, number>
  compresion?: CompresionTotal
  ladosDeLaFractura?: () => Record<number, 1 | -1>
  /** La trayectoria de un tornillo marcada con dos clics (P-004 E9). */
  trayectoriaDelTornillo?: {
    entrada: THREE.Vector3
    salida: THREE.Vector3
    haciaDentro: THREE.Vector3
    linea: THREE.Line
    estado: EstadoDelAgujero
    largoMm: number
    anguloConElEje: number
    perforaciones: PerforacionDeLaTrayectoria[]
  }
  siguienteIncision?: number
  ultimaIncision?: number
  separadores?: SeparadorEnEscena[]
  separadorActivo?: number | null
  siguienteSeparador?: number
  separadorEnLaMano?: EnLaMano<SeparadorEnEscena>
  pinzaEnLaMano?: EnLaMano<PellizcoEnEscena>
  entorno?: THREE.Texture
  retracciones?: RetraccionDeMusculo[]
  /** La retracción que atiende la rueda: la última que se puso o la que se eligió en la lista (P-004 E5). */
  retraccionActiva?: number
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
  /** La placa suelta que se dobla fuera del hueso (P-005 E1). */
  mesa?: MesaDeModelado
  /** El periostio despegado (P-005 E2). */
  periostio?: PeriostioEnLaEscena
  /** Las agujas de Kirschner que se dejaron puestas (P-005 E3). */
  alambres?: AlambrePuesto[]
  /** El enclavado endomedular (P-005 E4). */
  enclavado?: EnclavadoEnLaEscena
  /** Los N·m del limitador de torque montado en el destornillador, o `null` (P-005 E6). */
  limitadorNm?: number | null
  /** Los injertos óseos puestos (P-005 E7). */
  injerto?: InjertoEnLaEscena
  /** Cambia el renderizador conservando la escena (lo asigna el montaje). */
  recrearElRenderizador?: () => boolean
  /** La silueta del fragmento en su sitio correcto (ayuda de los rayos X). */
  fantasma?: THREE.Object3D
  /** Los dos ejes de la guía de angulación (ayuda de los rayos X). */
  guias?: THREE.LineSegments
  pedirDibujo?: () => void
  normalesDelTrazo?: Punto3[]
  heridas?: Map<PlanoDeCorte, HeridaEnCapa[]>
  ultimaHerida?: PlanoDeCorte
  cierrePorPlanos?: boolean
  agujeros?: THREE.Mesh[]
  sutura?: SuturaEnEscena
  aperturaAntesDeCoser?: Map<HeridaEnCapa, { mas: number; menos: number; perfil?: HeridaEnCapa['perfil'] }>
  implantes?: ImplantesEnEscena
  origenesDePiezas?: Map<THREE.Object3D, { posicion: THREE.Vector3; rotacion: THREE.Euler }>
  posesReducidas?: Map<THREE.Object3D, THREE.Matrix4>
  trayectosDeLaReduccion?: TrayectoDeUnTrozo[]
  claveDeLaReduccion?: string
  cortes?: CorteGuardado[]
  /** Escribe en la etiqueta que flota sobre el lienzo. */
  decir?: (texto: string) => void
  /** Deja sin elegir el trozo que ya no sostiene ninguna pinza (pedido 15); lo asigna el montaje. */
  alSoltarLasPinzas?: () => void
  /** Avisa a la consola de que la recta provisional se borró (P-008 E1); lo asigna el montaje. */
  alBorrarElTrazo?: () => void
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

/** La trayectoria de dos clics de un tornillo (P-004 E9): esperando la salida, o lista con su largo y su ángulo con el eje del hueso. */
export interface EstadoDeLaTrayectoria {
  fase: 'salida' | 'lista'
  largoMm?: number
  anguloConElEje?: number
}

/** La broca puesta en el hoyo (P-004 E8): lo que la consola enseña mientras se pide el disparo. */
export interface EstadoDeLaBroca {
  lectura: LecturaDeLaBroca
  /** Si gira: apagarla la detiene sin retirarla. */
  encendida: boolean
  /** El diámetro, para decir de qué broca se habla. */
  diametroMm: number
  /** El agujero de la placa por el que va, si va por uno (1 en adelante). */
  agujero?: number
}

/** El tornillo de placa que está entrando (pedido 13): lo que la consola enseña mientras se pide el disparo. */
export interface EstadoDelTornilloQueEntra {
  /** El agujero de la placa, contado desde 1. */
  agujero: number
  largoMm: number
  /** Lo que ya entró; la cabeza asienta cuando llega al largo. */
  metidoMm: number
}

export interface EstadoDeLasRetracciones {
  lista: { id: number; nodo: string; nombre: string; aperturaMm: number; maximoMm: number; activa: boolean }[]
}

/** La retracción que atiende la rueda: la elegida si sigue puesta y, si no, la última. */
export const retraccionActivaDe = (t: { retracciones?: RetraccionDeMusculo[]; retraccionActiva?: number }): RetraccionDeMusculo | undefined => {
  const lista = t.retracciones ?? []
  return lista.find((r) => r.id === t.retraccionActiva) ?? lista[lista.length - 1]
}

/** Cuántos píxeles de la pantalla cuenta como «sobre el labio» de una herida al hacer clic con un separador. */
const PIXELES_DEL_LABIO = 12

export const estadoDeLasRetracciones = (t: { retracciones?: RetraccionDeMusculo[]; retraccionActiva?: number }): EstadoDeLasRetracciones => {
  const activa = retraccionActivaDe(t)
  return {
    lista: (t.retracciones ?? []).map((r) => ({
      id: r.id,
      nodo: r.nodo,
      nombre: r.nombre,
      aperturaMm: r.aperturaMm,
      maximoMm: r.maximoMm,
      activa: r === activa,
    })),
  }
}

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
  // Una retracción anterior de una malla que un corte rehízo trae las posiciones de la geometría vieja: no sirve de partida.
  const original = previa && previa.original.length === atributo.array.length ? previa.original : Float32Array.from(atributo.array as ArrayLike<number>)
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
  // La rueda sigue al último músculo pinchado (pincho–ruedita–pincho otra estructura–ruedita, pedido 10).
  t.retraccionActiva = nueva.id
  aplicarUnaRetraccion(nueva, unidadesPorMm)
  t.decir?.(`${nueva.nombre} apoyado en ${nueva.nodo.replace(/_/g, ' ')}: se retrae sin cortarlo (${nueva.aperturaMm} mm). Arrastrando con el botón derecho, hacia arriba lo abre y hacia abajo lo cierra.`)
  u.alRetraer?.(estadoDeLasRetracciones(t))
  t.pedirDibujo?.()
}

/** Abre o cierra la retracción activa (la última, o la que se eligió en la lista), dentro del tope de su separador. */
function moverLaRetraccion(t: Taller, u: LoUltimo, deltaMm: number) {
  const r = retraccionActivaDe(t)
  if (!r) return
  r.aperturaMm = Math.min(r.maximoMm, Math.max(0, r.aperturaMm + deltaMm))
  if (!aplicarUnaRetraccion(r, 1 / (u.milimetrosPorUnidad || 1000))) t.retracciones = (t.retracciones ?? []).filter((q) => q !== r)
  t.decir?.(`${r.nombre}: ${r.nodo.replace(/_/g, ' ')} retraído ${Math.round(r.aperturaMm)} mm${r.aperturaMm >= r.maximoMm ? ' · tope del separador' : ''}`)
  u.alRetraer?.(estadoDeLasRetracciones(t))
  t.pedirDibujo?.()
}

/**
 * Cambia el lado hacia el que se aparta el músculo (pedido 10: «que se desplace hacia delante o hacia atrás»). El apoyo
 * queda donde se pinchó; la cuenta parte de las posiciones originales, así que alternar no acumula nada.
 */
function invertirLaRetraccion(t: Taller, u: LoUltimo, id?: number) {
  const r = id === undefined ? retraccionActivaDe(t) : (t.retracciones ?? []).find((q) => q.id === id)
  if (!r) return
  const d = invertirLaDireccion([r.direccion.x, r.direccion.y, r.direccion.z])
  r.direccion.set(d[0], d[1], d[2])
  t.retraccionActiva = r.id
  if (!aplicarUnaRetraccion(r, 1 / (u.milimetrosPorUnidad || 1000))) t.retracciones = (t.retracciones ?? []).filter((q) => q !== r)
  t.decir?.(`${r.nombre}: ${r.nodo.replace(/_/g, ' ')} se aparta hacia el otro lado.`)
  u.alRetraer?.(estadoDeLasRetracciones(t))
  t.pedirDibujo?.()
}

/** Corre la zona que se retrae a lo largo del músculo (el eje del hueso), sin volver a pinchar. */
function correrLaRetraccion(t: Taller, u: LoUltimo, deltaMm: number) {
  const r = retraccionActivaDe(t)
  if (!r) return
  const unidadesPorMm = 1 / (u.milimetrosPorUnidad || 1000)
  // El eje del hueso en el espacio local de la malla: la escala o el giro del nodo no deben torcer el sentido del corrimiento.
  const aLocal = new THREE.Matrix4().copy(r.malla.matrixWorld).invert()
  const eje = new THREE.Vector3(u.ejeLargo === 'x' ? 1 : 0, u.ejeLargo === 'y' ? 1 : 0, u.ejeLargo === 'z' ? 1 : 0)
    .transformDirection(aLocal)
    .normalize()
  const escalaLocal = new THREE.Vector3().setFromMatrixScale(aLocal).x || 1
  const nuevo = correrElApoyo([r.apoyo.x, r.apoyo.y, r.apoyo.z], [eje.x, eje.y, eje.z], deltaMm * unidadesPorMm * escalaLocal)
  r.apoyo.set(nuevo[0], nuevo[1], nuevo[2])
  if (!aplicarUnaRetraccion(r, unidadesPorMm)) t.retracciones = (t.retracciones ?? []).filter((q) => q !== r)
  t.decir?.(`${r.nombre}: la zona retraída de ${r.nodo.replace(/_/g, ' ')} se corrió ${deltaMm > 0 ? 'hacia proximal' : 'hacia distal'}.`)
  u.alRetraer?.(estadoDeLasRetracciones(t))
  t.pedirDibujo?.()
}

/** Devuelve un solo músculo retraído a su sitio. */
function soltarUnaRetraccion(t: Taller, u: LoUltimo, id: number) {
  const r = (t.retracciones ?? []).find((q) => q.id === id)
  if (!r) return
  const atributo = r.malla.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (atributo && atributo.array.length === r.original.length) {
    ;(atributo.array as Float32Array).set(r.original)
    atributo.needsUpdate = true
    r.malla.geometry.computeVertexNormals()
    r.malla.geometry.computeBoundingSphere()
    r.malla.geometry.computeBoundingBox()
  }
  t.retracciones = (t.retracciones ?? []).filter((q) => q !== r)
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
/**
 * Pone a los nodos del modelo el nombre que el caso les da, cuando el modelo los trae con otro parecido (ver `src/lib/emparejarNodos.ts`). Se hace una sola vez al cargar y así
 * todo lo que busca por nombre exacto —los roles, las capas, **el fragmento que se reduce**— sigue funcionando sin tocarlo. Sin esto, un modelo exportado de nuevo dejaba el caso sin
 * fragmento y la reducción automática decía que no había nada que reducir.
 */
function renombrarSegunElCaso(raiz: THREE.Object3D, piezas: PiezaDelCaso[]) {
  const mallas = new Map<string, THREE.Object3D>()
  const otros = new Map<string, THREE.Object3D>()
  raiz.traverse((o) => {
    if (!o.name) return
    const destino = (o as THREE.Mesh).isMesh ? mallas : otros
    if (!destino.has(o.name)) destino.set(o.name, o)
  })
  const nombresDelModelo = [...new Set([...mallas.keys(), ...otros.keys()])]
  const pares = emparejarNodos(nombresDelModelo, piezas.map((p) => p.nodo))
  for (const [delCaso, delModelo] of pares) {
    // La malla antes que el grupo que se llame igual: los roles se aplican a mallas.
    const nodo = mallas.get(delModelo) ?? otros.get(delModelo)
    if (nodo) nodo.name = delCaso
  }
  if (pares.size > 0) console.info(`[simulador] ${pares.size} pieza(s) del caso se reconocieron con otro nombre en el modelo:`, Object.fromEntries(pares))
}

function buscarFragmento(raiz: THREE.Object3D, piezas: PiezaDelCaso[]): THREE.Object3D | undefined {
  const nombre = piezas.find((p) => p.rol === 'fragmento')?.nodo
  // Sin pieza marcada, el modelo exportado del atlas ya dice cuál es el trozo que se mueve: el distal («..._fragmento_distal», el que se tracciona). Se usa ese antes que dejar
  // el caso sin nada que reducir; marcar la pieza en el Taller sigue siendo lo correcto y tiene prioridad.
  let porConvencion: THREE.Object3D | undefined
  if (!nombre) {
    raiz.traverse((o) => {
      if (!porConvencion && (o as THREE.Mesh).isMesh && /fragmento_distal/.test(normalizarNombreDeNodo(o.name))) porConvencion = o
    })
  }
  if (!nombre && !porConvencion) return undefined
  const fragmento = (nombre ? raiz.getObjectByName(nombre) : porConvencion) ?? undefined
  // El archivo del taller ya trae el origen en el foco (`focoEnElOrigen`, D-304): correrlo al centro del trozo era
  // deshacer lo que `pivoteEnElFoco` hizo a propósito, y girar el fragmento sobre su mitad corría la fractura de lado.
  if (fragmento && fragmento.userData.focoEnElOrigen !== true) pivoteEnSuCentro(fragmento)
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
  // La pose del archivo se corre igual: contra ella se guarda dónde va el trozo reducido (P-008 E5).
  correrElOrigenDelArchivo(fragmento, centro)

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
 * Las posiciones reducidas del caso, puestas en la escena (P-008 E5): la pose de cada trozo reducido y, si el fragmento
 * tiene la suya, su sitio de reposo —contra él mide la consola y ahí lo deja la reducción automática—. Devuelve si el
 * sitio de reposo del fragmento cambió.
 *
 * Se rehace solo si cambian las posiciones guardadas o el fragmento: en el taller las piezas llegan como lista nueva en
 * cada repintado, y recalcular cada vez las poses de todos los trozos no cuesta mucho, pero tampoco sirve de nada.
 */
function aplicarPosicionesReducidas(t: Taller, piezas: PiezaDelCaso[]): boolean {
  if (!t.raiz) return false
  const conPosicion = piezas.flatMap((p) => (p.posicionReducida ? [[p.nodo, p.posicionReducida] as const] : []))
  // La del archivo, si la fila del fragmento no trae la suya (D-304). Hace falta aquí y no basta con que la consola la
  // pase a las piezas (`piezasConLasDelModelo`): la consola solo lee los nodos del archivo después de que cargue, y para
  // entonces el fragmento ya se colocó contra el reposo de antes.
  const f0 = t.fragmento
  const delArchivo = f0 && !conPosicion.some(([nodo]) => nodo === f0.name) ? transformacionValida(f0.userData.posicionReducida) : null
  if (f0 && delArchivo) conPosicion.push([f0.name, delArchivo] as const)
  // Por nodo, para que la misma posición llegada por los dos caminos dé la misma clave y no se rehaga.
  conPosicion.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const clave = `${t.fragmento?.name ?? ''}|${JSON.stringify(conPosicion)}`
  if (clave === t.claveDeLaReduccion) return false
  const primeraVez = t.claveDeLaReduccion === undefined
  t.claveDeLaReduccion = clave
  t.posesReducidas = posesReducidasDe(t.raiz, conPosicion)
  const f = t.fragmento
  if (!f) return false
  const reducida = t.posesReducidas.get(f)
  // Sin posición reducida, el sitio de reposo es donde el fragmento está en el archivo. Al cargar ya lo puso la carga;
  // después hay que ponerlo, porque el editor pudo quitar la posición reducida o marcar otro trozo como fragmento.
  if (!reducida && primeraVez) return false
  const posicion = new THREE.Vector3()
  const cuaternion = new THREE.Quaternion()
  ;(reducida ?? poseDelArchivo(f)).decompose(posicion, cuaternion, new THREE.Vector3())
  t.origenDelFragmento = { posicion, rotacion: new THREE.Euler().setFromQuaternion(cuaternion, f.rotation.order) }
  return true
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

/**
 * El trozo de hueso fijo que **se le enfrenta** al fragmento del caso: el de huella (en los dos ejes que no son el largo)
 * más parecida a la del fragmento y pegado a él a lo largo del eje —no la fíbula, que va al lado, ni el fémur, que está
 * lejos—. Con él se sitúa el foco del injerto y se mide el ancho del hueso del % del desplazamiento (Q-010).
 */
/**
 * Si el fragmento es el trozo distal o el proximal (D-303). La lectura clínica es siempre la del distal respecto del
 * proximal, y un proximal que se mueve se lee al revés: si se tomara por distal, su varo saldría como valgo.
 *
 * Lo dice el archivo del atlas (`trozo`). Si no, se mira de qué lado del hueso fijo que tiene enfrente cae a lo largo
 * del eje; sin hueso enfrente, distal, que es el convenio del exportador («…_fragmento_distal»).
 */
function trozoQueSeMueve(
  t: Taller,
  piezas: PiezaDelCaso[],
  largo: readonly [number, number, number],
  milimetrosPorUnidad: number,
): 'distal' | 'proximal' {
  const f = t.fragmento
  if (!f) return 'distal'
  const escrito = trozoDelFragmento(f)
  if (escrito) return escrito
  const i = [0, 1, 2].reduce((a, b) => (Math.abs(largo[b]) > Math.abs(largo[a]) ? b : a), 0)
  const enfrente = huesoQueSeEnfrenta(t, piezas, i, milimetrosPorUnidad)
  if (!enfrente) return 'distal'
  const delFragmento = enfrente.cajaDelFragmento.getCenter(new THREE.Vector3())
  const delHueso = enfrente.caja.getCenter(new THREE.Vector3())
  return delFragmento.sub(delHueso).dot(new THREE.Vector3(largo[0], largo[1], largo[2])) >= 0 ? 'distal' : 'proximal'
}

function huesoQueSeEnfrenta(
  taller: Taller,
  piezas: PiezaDelCaso[],
  eje: number,
  milimetrosPorUnidad: number,
): { malla: THREE.Mesh; caja: THREE.Box3; cajaDelFragmento: THREE.Box3 } | null {
  const f = taller.fragmento
  if (!f) return null
  const [j, k] = [0, 1, 2].filter((x) => x !== eje)
  const cajaF = new THREE.Box3().setFromObject(f)
  const solape = (a: THREE.Box3, b: THREE.Box3, e: number) => Math.max(0, Math.min(a.max.getComponent(e), b.max.getComponent(e)) - Math.max(a.min.getComponent(e), b.min.getComponent(e)))
  const area = (c: THREE.Box3) => (c.max.getComponent(j) - c.min.getComponent(j)) * (c.max.getComponent(k) - c.min.getComponent(k))
  let elegido: { malla: THREE.Mesh; caja: THREE.Box3 } | null = null
  let mejor = 0.2
  for (const h of huesoFijo(taller, piezas)) {
    const c = new THREE.Box3().setFromObject(h)
    const huecoAlLargo = Math.max(0, Math.max(c.min.getComponent(eje) - cajaF.max.getComponent(eje), cajaF.min.getComponent(eje) - c.max.getComponent(eje)))
    if (huecoAlLargo * milimetrosPorUnidad > 60) continue
    const parecido = (solape(cajaF, c, j) * solape(cajaF, c, k)) / Math.max(area(cajaF), area(c), 1e-9)
    if (parecido > mejor) {
      mejor = parecido
      elegido = { malla: h, caja: c }
    }
  }
  return elegido ? { ...elegido, cajaDelFragmento: cajaF } : null
}

/** Los vértices de cada malla en el mundo, mientras no se mueva: el ancho del foco se pide a cada arrastre del fragmento. */
const verticesEnElMundo = new WeakMap<THREE.Mesh, { firma: string; posiciones: Float32Array }>()

/**
 * Las secciones del hueso fijo junto al foco (`seccionesDelHueso`), guardadas: el % se recalcula con cada movimiento
 * del fragmento, y el hueso fijo no se mueve. Cortar todos sus triángulos en cada arrastre, en un hueso de cientos de
 * miles, es lo que se nota en la mano; con las secciones guardadas solo se proyectan unos cientos de puntos.
 */
const seccionesGuardadas = new WeakMap<THREE.Mesh, { clave: string; secciones: number[][] }>()
function seccionesEnElMundo(malla: THREE.Mesh, eje: EjeLargo, desde: number, hasta: number): number[][] {
  const posiciones = posicionesEnElMundo(malla)
  const clave = `${verticesEnElMundo.get(malla)?.firma}|${eje}|${desde}|${hasta}`
  const guardadas = seccionesGuardadas.get(malla)
  if (guardadas && guardadas.clave === clave) return guardadas.secciones
  const secciones = seccionesDelHueso(posiciones, malla.geometry.index?.array ?? null, eje, desde, hasta)
  seccionesGuardadas.set(malla, { clave, secciones })
  return secciones
}

function posicionesEnElMundo(malla: THREE.Mesh): Float32Array {
  malla.updateWorldMatrix(true, false)
  const firma = malla.matrixWorld.elements.join(',')
  const guardadas = verticesEnElMundo.get(malla)
  if (guardadas && guardadas.firma === firma) return guardadas.posiciones
  const atributo = malla.geometry.getAttribute('position')
  const posiciones = new Float32Array(atributo.count * 3)
  const v = new THREE.Vector3()
  for (let n = 0; n < atributo.count; n++) {
    v.fromBufferAttribute(atributo, n).applyMatrix4(malla.matrixWorld)
    posiciones[3 * n] = v.x
    posiciones[3 * n + 1] = v.y
    posiciones[3 * n + 2] = v.z
  }
  verticesEnElMundo.set(malla, { firma, posiciones })
  return posiciones
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
/**
 * Quita los tornillos de bloqueo que pasaban por el clavo: si el clavo se retira o se rehace el canal, ellos no tienen dónde estar. Va **antes** de quitar el clavo,
 * que olvida la cuenta de bloqueos.
 */
function soltarLosBloqueos(t: Taller) {
  const e = t.enclavado
  if (!e || !t.implantes || e.bloqueos.length === 0) return
  for (const b of e.bloqueos) quitarUnTornillo(t.implantes, b.tornilloId)
  e.bloqueos = []
}

/**
 * Lo que dice el asiento de la placa (P-009) con el nombre de cada trozo como lo ve quien opera: la etiqueta que le puso
 * el editor o, sin ella, su nodo; y con la lectura del foco que ve la consola. `null` si la placa no se pudo asentar
 * como un sólido (un modelo sin hueso alrededor).
 */
function avisoDeLaPlacaPuesta(
  placa: PlacaColocada,
  piezas: readonly PiezaDelCaso[],
  foco: ReduccionDelFoco | null | undefined,
): { texto: string; atencion: boolean } | null {
  if (!placa.asiento) return null
  const nombreDe = (nodo: string) => piezas.find((p) => p.nodo === nodo)?.etiqueta?.trim() || nodo.replace(/_/g, ' ')
  return avisoDelAsiento(placa.asiento, nombreDe, piezas.some((p) => p.rol === 'fragmento'), foco)
}

export function estadoDeLaFijacion(taller: Taller): EstadoDeLaFijacion | null {
  const imp = taller.implantes
  const tray = taller.trayectoriaDelTornillo
  // Sin placa pero con tornillos o con una trayectoria (P-004 E9) también hay fijación que contar.
  if (!imp?.placa && !(imp && imp.tornillos.size > 0) && !tray) return null
  return {
    placa: imp?.placa
      ? {
          nombre: imp.placa.nombre,
          agujeros: imp.placa.agujerosMm.length,
          apoyada: imp.placa.separadaDelHuesoMm <= 1.5,
          separadaDelHuesoMm: imp.placa.separadaDelHuesoMm,
          fijada: imp.placa.fijada,
          ajuste: { ...imp.placa.ajuste },
          rangos: imp.placa.rangos,
          sentidoDelLado: imp.placa.sentidoDelLado,
          agujerosDelModelo: imp.placa.agujerosDelModelo,
          aviso: imp.placa.avisoDeOrificios,
          asiento: imp.placa.asiento ?? null,
          forma: formaDeLosAgujeros({ nombre: imp.placa.nombre }),
          semilargoDelOvalMm: semilargoDelOvalDeLaPlaca(imp.placa.nombre),
          ladoDeLaFractura: taller.ladosDeLaFractura?.() ?? {},
          desviaciones: Object.fromEntries(taller.desviaciones ?? []),
        }
      : null,
    tornillos: [...(imp?.tornillos.values() ?? [])].map((t) => t.datos).sort((a, b) => a.agujero - b.agujero),
    agujeros: imp?.placa
      ? [...imp.placa.agujeros.entries()]
          .sort(([a], [b]) => a - b)
          .map(([indice, e]) => ({ indice, perforado: e.perforado, medido: e.medido }))
      : [],
    trayectoria: tray
      ? {
          largoMm: tray.largoMm,
          anguloConElEje: tray.anguloConElEje,
          perforado: tray.estado.perforado,
          medido: tray.estado.medido,
        }
      : null,
    compresion: taller.compresion && taller.compresion.mm > 0 ? { mm: taller.compresion.mm, tecnicas: [...taller.compresion.tecnicas] } : null,
  }
}

// ------------------------------------------------------------------ sutura

/**
 * De qué lado de la herida cae un punto, o 0 si no hay herida a menos de 25 mm. Con `plano` (el cierre por planos) solo
 * cuenta la herida de ese plano: una puntada de fascia cae a un lado u otro de la herida de la fascia, no de la de la piel.
 */
function ladoDelPunto(taller: Taller, punto: THREE.Vector3, unidadesPorMm: number, plano?: PlanoBlando): 1 | -1 | 0 {
  let mejor: { lado: 1 | -1; cerca: number } | null = null
  const delPlano = plano ? (taller.heridas?.get(plano) ?? []) : []
  const heridas = delPlano.length > 0 ? delPlano : todasLasHeridas(taller)
  for (const h of heridas) {
    const info = ladoDeLaHerida(h, punto)
    if (info && (!mejor || info.cerca < mejor.cerca)) mejor = { lado: info.lado, cerca: info.cerca }
  }
  return mejor && mejor.cerca <= 25 * unidadesPorMm ? mejor.lado : 0
}

/**
 * Cuánto abre cada labio de una herida en un punto de su largo. Sin perfil es parejo; con él, es lo que
 * manden los separadores colocados. `t` ausente se toma por la mitad de la herida.
 */
/** Una aguja de Kirschner clavada y dejada puesta (P-005 E3): la malla del alambre y lo que se midió al clavarla. */
interface AlambrePuesto {
  malla: THREE.Mesh
  profundidadMm: number
  salidaPorLaOpuestaMm: number
}

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
  movimientoPorEje?: { accion: AccionDeMovimiento; eje: EjeAnatomico } | null
  asasLibres?: boolean
  alElegirPieza?: (nombre: string | null) => void
  alCambiarLaBroca?: (estado: EstadoDeLaBroca | null) => void
  alCambiarElTornillo?: (estado: EstadoDelTornilloQueEntra | null) => void
  diametroDeTornillo?: number | null
  marcandoLaTrayectoria?: boolean
  alCambiarLaTrayectoria?: (estado: EstadoDeLaTrayectoria | null) => void
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
        return rol !== 'piel' && rol !== 'fascia' && rol !== 'musculo' && rol !== 'implante' && !esEstructuraNoble(rol)
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
    // Pedir el plano muscular es pedir también sus vasos y sus nervios (P-012 E6): el separador se apoya en ellos y la
    // herida del plano los cubre, como antes de que tuvieran papel propio.
    if (rol && (roles.includes(rol) || (esEstructuraNoble(rol) && roles.includes('musculo')))) salida.push(m)
  })
  return salida
}

/** Una pieza de vaso o de nervio, con el papel ya estrechado para quien lo lea. */
type PiezaNoble = PiezaDelCaso & { rol: LesionDeEstructura['rol'] }
const esPiezaNoble = (p: PiezaDelCaso): p is PiezaNoble => esEstructuraNoble(p.rol)

/**
 * Las piezas de vaso o de nervio que atraviesa un tramo recto de un calibre dado (P-012 E6): el que la broca o la aguja
 * recorrieron más allá de la cortical opuesta.
 *
 * Cinco rayos —el eje y cuatro por el borde del calibre— y no uno: una broca de 3,2 mm que roza la arteria con el
 * borde la lesiona igual, y el rayo del eje pasaría de largo. Se miran **encendidas o no**: apagar la capa del músculo
 * no saca al nervio del paciente, y la broca que se pasa lo encuentra igual.
 */
function nobleQueAtraviesa(
  t: Taller,
  piezas: PiezaDelCaso[],
  desde: THREE.Vector3,
  direccion: THREE.Vector3,
  largo: number,
  radio: number,
): PiezaNoble[] {
  const raiz = t.raiz
  if (!raiz || largo <= 0) return []
  const nobles = new Map(piezas.filter(esPiezaNoble).map((p) => [p.nodo, p]))
  if (nobles.size === 0) return []
  const mallas: THREE.Mesh[] = []
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && nobles.has(m.name)) mallas.push(m)
  })
  if (mallas.length === 0) return []
  const eje = direccion.clone().normalize()
  const u = new THREE.Vector3().crossVectors(eje, Math.abs(eje.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize()
  const v = new THREE.Vector3().crossVectors(eje, u).normalize()
  const origenes = [
    desde.clone(),
    desde.clone().addScaledVector(u, radio),
    desde.clone().addScaledVector(u, -radio),
    desde.clone().addScaledVector(v, radio),
    desde.clone().addScaledVector(v, -radio),
  ]
  const tocadas = new Map<string, PiezaNoble>()
  for (const origen of origenes) {
    for (const g of new THREE.Raycaster(origen, eje, 0, largo).intersectObjects(mallas, false)) {
      const pieza = nobles.get(g.object.name)
      if (pieza) tocadas.set(pieza.nodo, pieza)
    }
  }
  return [...tocadas.values()]
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
  // Un separador de la fascia o del músculo abre también la piel de encima, en el sitio que tiene sobre ella: se
  // mide desde donde se apoyó, con los labios en reposo, y vale si queda a la distancia a la que se puede colocar.
  const porId = new Map((t.separadores ?? []).map((s) => [s.datos.id, s]))
  const alcance = LIMITE_PARA_COLOCAR_MM * unidadesPorMm
  aplicarSeparadoresALasHeridas(
    t.heridas ?? new Map(),
    [...(t.separadores ?? []).map((s) => s.datos), ...(roma ? [roma] : [])],
    pinzas,
    unidadesPorMm,
    (s, h) => {
      const enLaEscena = porId.get(s.id)
      const cerca = enLaEscena ? cercaDeLaHerida(h, enLaEscena.punto) : null
      return cerca && cerca.distancia <= alcance ? cerca.t : null
    },
  )
  for (const s of t.separadores ?? []) posarSeparador(s, unidadesPorMm, t.heridas)
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
        : plano === 'fascia'
          ? 'Todavía no hay herida en la fascia: ábrala con el bisturí profundo.'
          : 'No hay herida en la piel.',
    )
    return
  }
  let sitio: SitioDeSeparador | undefined = s.sitios[plano]
  if (!sitio) {
    // Hacia dentro si el plano nuevo es más profundo que el de ahora, o hacia fuera si es más superficial, por la
    // normal de donde está apoyado ahora (los planos van piel → fascia → músculo).
    const haciaDentro = PROFUNDIDAD_DEL_PLANO[plano] > PROFUNDIDAD_DEL_PLANO[s.datos.plano === 'hueso' ? 'musculo' : s.datos.plano]
    const hacia = s.normal.clone().multiplyScalar(haciaDentro ? -1 : 1)
    const origen = s.punto.clone().addScaledVector(s.normal, (haciaDentro ? 1 : -1) * unidadesPorMm)
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
    t.alSoltarLasPinzas?.()
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
  const hayMusculo = (t.heridas?.get('musculo')?.length ?? 0) > 0
  const hayFascia = (t.heridas?.get('fascia')?.length ?? 0) > 0
  // La piel deja de ser lo último que se cortó con la fascia o con el músculo; la fascia, con el músculo (P-006).
  for (const [capa, hayProfunda] of [['piel', hayFascia || hayMusculo], ['fascia', hayMusculo]] as const) {
    for (const h of t.heridas?.get(capa) ?? []) {
      if (!!h.profundizada === hayProfunda) continue
      h.profundizada = hayProfunda
      refrescarBordes(h)
    }
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
    // La recta provisional que seguía al cursor se va con la marca (P-008 E1). Quedaba dibujada por encima de todo
    // —el trazo de guía no mira la profundidad— con Esc, al cambiar de modo o de instrumento: una línea sin incisión
    // debajo, y la consola contando su largo. Con el inicio marcado no hay otro trazo que perder: marcarlo lo vació.
    if (t.puntosDelTrazo.length > 0) {
      t.puntosDelTrazo = []
      t.normalesDelTrazo = []
      dibujarTrazo(t)
      t.alBorrarElTrazo?.()
    }
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

type P3 = [number, number, number]
const aP3 = (v: THREE.Vector3): P3 => [v.x, v.y, v.z]
const deP3 = (p: P3) => new THREE.Vector3(p[0], p[1], p[2])

interface SeparadorGuardado {
  datos: SeparadorColocado
  url: string
  ajustes: AjustesDeInstrumento | null
  punto: P3
  normal: P3
  direccion: P3
  mango: P3
  sitios: Partial<Record<CapaDeLaHerida, { punto: P3; normal: P3; direccion: P3; posicion: number }>>
}
interface PellizcoGuardado {
  datos: Pellizco
  url: string
  ajustes: AjustesDeInstrumento | null
  punto: P3
  normal: P3
  mango: P3
  direccion: P3
}
interface PinzaDeReduccionGuardada {
  id: number
  nombre: string
  /** El nodo del trozo que agarra. */
  pieza: string
  url: string
  ajustes: AjustesDeInstrumento | null
  /** Pose de la pinza dentro de su trozo (es hija suya). */
  posicion: P3
  rotacion: [number, number, number, number]
  escala: P3
}
interface RetraccionGuardada {
  id: number
  nodo: string
  nombre: string
  apoyo: P3
  direccion: P3
  aperturaMm: number
  maximoMm: number
}

/** Lo cortado y cosido, en el formato que va a `sessionStorage`. */
interface SesionGuardada {
  /**
   * La 1 guardaba una sola herida por capa y sin número; la 2, todas las incisiones con el suyo (P-003 E4); la 3, además,
   * los separadores, las pinzas, las pinzas de reducción y los músculos retraídos.
   */
  v: 1 | 2 | 3
  /** Lo puesto sobre el paciente (v3). Cada lista se vuelve a armar con el mismo modelo 3D que tenía. */
  separadores?: SeparadorGuardado[]
  pellizcos?: PellizcoGuardado[]
  pinzasDeReduccion?: PinzaDeReduccionGuardada[]
  retracciones?: RetraccionGuardada[]
  cortes: CorteGuardado[]
  /** Cuánto está abierta cada herida, en el orden de `todasLasHeridas`, en unidades del mundo. */
  apertura: { mas: number; menos: number }[]
  aperturaAntesDeCoser: ({ mas: number; menos: number } | null)[] | null
  sutura: {
    hilo: HiloDeSutura
    tension: number
    /** La tensión de cada plano, con el cierre por planos. */
    tensiones?: Partial<Record<PlanoBlando, number>>
    puntos: {
      base: [number, number, number]
      normal: [number, number, number]
      lado: 1 | -1 | 0
      nuevaLinea: boolean
      /** El plano de la puntada. Ausente en lo guardado antes de que hubiera planos. */
      plano?: PlanoBlando
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
  const hayPuesto =
    (taller.separadores ?? []).length + (taller.pellizcos ?? []).length + (taller.pinzasDeReduccion ?? []).length + (taller.retracciones ?? []).length > 0
  if (cortes.length === 0 && !hayPuntos && !hayPuesto) return ''
  const indice = new Map(heridas.map((h, i) => [h.malla.uuid, i]))
  const datos: SesionGuardada = {
    v: 3,
    separadores: (taller.separadores ?? []).map((q) => ({
      datos: { ...q.datos },
      url: q.url,
      ajustes: q.ajustes,
      punto: aP3(q.punto),
      normal: aP3(q.normal),
      direccion: aP3(q.direccion),
      mango: aP3(q.mango),
      sitios: Object.fromEntries(
        Object.entries(q.sitios).map(([capa, st]) => [capa, { punto: aP3(st.punto), normal: aP3(st.normal), direccion: aP3(st.direccion), posicion: st.posicion }]),
      ),
    })),
    pellizcos: (taller.pellizcos ?? []).map((q) => ({
      datos: { ...q.datos },
      url: q.url,
      ajustes: q.ajustes,
      punto: aP3(q.punto),
      normal: aP3(q.normal),
      mango: aP3(q.mango),
      direccion: aP3(q.direccion),
    })),
    pinzasDeReduccion: (taller.pinzasDeReduccion ?? [])
      .filter((q) => q.url)
      .map((q) => {
        const g = q.instrumento.grupo
        return {
          id: q.id,
          nombre: q.nombre,
          pieza: q.pieza.name,
          url: q.url as string,
          ajustes: q.ajustes ?? null,
          posicion: aP3(g.position),
          rotacion: [g.quaternion.x, g.quaternion.y, g.quaternion.z, g.quaternion.w],
          escala: aP3(g.scale),
        }
      }),
    retracciones: (taller.retracciones ?? []).map((r) => ({
      id: r.id,
      nodo: r.nodo,
      nombre: r.nombre,
      apoyo: aP3(r.apoyo),
      direccion: aP3(r.direccion),
      aperturaMm: r.aperturaMm,
      maximoMm: r.maximoMm,
    })),
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
            tensiones: sutura.tensiones,
            puntos: sutura.puntos.map((q) => ({
              base: (q.base ?? q.punto) as [number, number, number],
              normal: q.normal as [number, number, number],
              lado: q.lado,
              nuevaLinea: q.nuevaLinea,
              plano: q.plano,
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
 * Vuelve a poner lo que se había puesto sobre el paciente: separadores, pinzas, pinzas de reducción y músculos
 * retraídos. Cada instrumento se vuelve a cargar con el mismo modelo 3D y la misma pose que tenía; lo demás (lo
 * abierto, lo tensado) lo recalcula `reaplicarSeparadores` de lo que quedó puesto, como al colocarlo.
 *
 * Lo que no se encuentra —un trozo o un músculo que el modelo ya no trae— se salta en silencio: restaurar la
 * sesión nunca debe romper la carga del caso.
 */
function restaurarLoPuesto(t: Taller, u: LoUltimo, g: SesionGuardada) {
  const escena = t.escena
  if (!escena) return
  const mm = u.milimetrosPorUnidad || 1000
  const unidadesPorMm = 1 / mm
  const escala = 1000 / mm
  let hayAlgo = false

  for (const q of g.separadores ?? []) {
    const nuevo: SeparadorEnEscena = {
      datos: { ...q.datos },
      url: q.url,
      ajustes: q.ajustes,
      punto: deP3(q.punto),
      normal: deP3(q.normal),
      direccion: deP3(q.direccion),
      mango: deP3(q.mango),
      sitios: Object.fromEntries(
        Object.entries(q.sitios).map(([capa, st]) => [capa, { punto: deP3(st.punto), normal: deP3(st.normal), direccion: deP3(st.direccion), posicion: st.posicion }]),
      ),
      instrumento: colocarInstrumento(escena, q.url, q.ajustes, t.entorno ?? null, escala, () => {
        posarSeparador(nuevo, unidadesPorMm, t.heridas)
        t.pedirDibujo?.()
      }),
    }
    ;(t.separadores ??= []).push(nuevo)
    t.siguienteSeparador = Math.max(t.siguienteSeparador ?? 0, q.datos.id)
    t.separadorActivo = q.datos.id
    hayAlgo = true
  }

  const piel = u.piezas.filter((p) => p.rol === 'piel').map((p) => escena.getObjectByName(p.nodo)).find(Boolean)
  const color = (): THREE.Color => {
    const malla = piel as THREE.Mesh | undefined
    const original = malla ? (t.materialesOriginales.get(malla) ?? malla.material) : undefined
    const material = Array.isArray(original) ? original[0] : original
    const c = (material as THREE.MeshStandardMaterial | undefined)?.color
    return c ? c.clone() : new THREE.Color(0xd9b8a3)
  }
  for (const q of g.pellizcos ?? []) {
    const pliegue = crearPliegue(color())
    escena.add(pliegue)
    const nuevo: PellizcoEnEscena = {
      datos: { ...q.datos },
      url: q.url,
      ajustes: q.ajustes,
      pliegue,
      punto: deP3(q.punto),
      normal: deP3(q.normal),
      mango: deP3(q.mango),
      direccion: deP3(q.direccion),
      instrumento: colocarInstrumento(escena, q.url, q.ajustes, t.entorno ?? null, escala, () => {
        posarPliegue(nuevo, unidadesPorMm)
        t.pedirDibujo?.()
      }),
    }
    ;(t.pellizcos ??= []).push(nuevo)
    t.siguientePellizco = Math.max(t.siguientePellizco ?? 0, q.datos.id)
    t.pellizcoActivo = q.datos.id
    posarPliegue(nuevo, unidadesPorMm)
    hayAlgo = true
  }

  for (const q of g.pinzasDeReduccion ?? []) {
    const pieza = escena.getObjectByName(q.pieza)
    if (!pieza) continue
    const colocado = colocarInstrumento(escena, q.url, q.ajustes, t.entorno ?? null, escala)
    // Hija del trozo, con la pose que tenía dentro de él: así lo acompaña al moverlo, como antes de recargar.
    pieza.add(colocado.grupo)
    colocado.grupo.position.set(...q.posicion)
    colocado.grupo.quaternion.set(...q.rotacion)
    colocado.grupo.scale.set(...q.escala)
    ;(t.pinzasDeReduccion ??= []).push({ id: q.id, nombre: q.nombre, pieza, instrumento: colocado, url: q.url, ajustes: q.ajustes })
    t.siguientePinzaDeReduccion = Math.max(t.siguientePinzaDeReduccion ?? 0, q.id)
    u.alReducir?.(estadoDeLaReduccion(t))
  }

  if (hayAlgo) {
    reaplicarSeparadores(t, u)
    avisarPellizcos(t, u)
  }

  // Los músculos retraídos, después de los cortes: la malla que se retrae es la que quedó tras cortarla.
  for (const q of g.retracciones ?? []) {
    let malla: THREE.Mesh | null = null
    escena.traverse((o) => {
      if (!malla && (o as THREE.Mesh).isMesh && o.name === q.nodo && !esDeInterfazDelModelo(o)) malla = o as THREE.Mesh
    })
    const m = malla as THREE.Mesh | null
    if (!m) continue
    const atributo = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!atributo) continue
    const r: RetraccionDeMusculo = {
      id: q.id,
      nodo: q.nodo,
      nombre: q.nombre,
      malla: m,
      original: Float32Array.from(atributo.array as ArrayLike<number>),
      apoyo: deP3(q.apoyo),
      direccion: deP3(q.direccion),
      aperturaMm: q.aperturaMm,
      maximoMm: q.maximoMm,
    }
    if (!aplicarUnaRetraccion(r, unidadesPorMm)) continue
    ;(t.retracciones ??= []).push(r)
    t.siguienteRetraccion = Math.max(t.siguienteRetraccion ?? 0, q.id)
  }
  if ((t.retracciones ?? []).length > 0) u.alRetraer?.(estadoDeLasRetracciones(t))
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
  const puntosMedidos = sutura.puntos.map((p) => ({ ...p, punto: p.base ?? p.punto }))
  const medida = medirLaSutura(puntosMedidos, milimetrosPorUnidad)
  const largoMm = heridas.length > 0 ? Math.max(...heridas.map((h) => h.largo)) / unidadesPorMm : 0

  // Con fascia en el caso, cada plano se mide y se cierra por su cuenta (P-006, E11): la sutura de la fascia cierra la herida
  // de la fascia, la de la piel la de la piel, y la herida entera está cerrada cuando lo están las dos. Sin fascia, como
  // siempre: todas las puntadas cierran todas las heridas.
  const porPlanos = !!taller.cierrePorPlanos
  const planoActivo: PlanoBlando = sutura.planoActivo ?? 'piel'
  const planosConHerida = porPlanos ? PLANOS_BLANDOS.filter((p) => (taller.heridas?.get(p)?.length ?? 0) > 0) : []
  const largosMm: Partial<Record<PlanoBlando, number>> = {}
  for (const p of planosConHerida) largosMm[p] = Math.max(...(taller.heridas?.get(p) ?? []).map((h) => h.largo)) / unidadesPorMm
  const porPlano = porPlanos ? medirPorPlanos(puntosMedidos, milimetrosPorUnidad) : {}
  const cierres = porPlanos ? cierresPorPlano(porPlano, largosMm, sutura.tensiones) : {}
  const cierreDeCada = porPlanos ? cierreDeCadaHerida(cierres, planosConHerida) : {}

  const cierreMaximo = porPlanos ? (cierres[planoActivo]?.cierreMaximo ?? 0) : cierreDeLaHerida(medida.cruces, largoMm)
  const cierreSinPlanos = cierreConTension(medida.cruces, largoMm, sutura.tension)
  const cierre = porPlanos ? cierreDeTodoElCierre(cierreDeCada, planosConHerida) : cierreSinPlanos
  const cierreDeLaHeridaDe = (plano: PlanoBlando) => (porPlanos ? (cierreDeCada[plano] ?? 0) : cierreSinPlanos)
  const hayCierre = porPlanos ? Object.values(cierreDeCada).some((c) => c > 0) : cierreSinPlanos > 0

  if (heridas.length > 0) {
    if (hayCierre && !taller.aperturaAntesDeCoser) {
      taller.aperturaAntesDeCoser = new Map(heridas.map((h) => [h, { mas: h.mas, menos: h.menos, perfil: h.perfil }]))
    }
    const antes = taller.aperturaAntesDeCoser
    if (antes) {
      for (const [plano, lista] of taller.heridas ?? []) {
        const factor = 1 - cierreDeLaHeridaDe(plano)
        for (const h of lista) {
          const base = antes.get(h)
          if (!base) continue
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
      }
      if (!hayCierre) taller.aperturaAntesDeCoser = undefined
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
  const planoDeLaUltima: PlanoBlando = ultima.plano ?? 'piel'
  const texto =
    `Puntada ${sutura.puntos.length}` +
    (porPlanos ? ` en ${NOMBRE_DEL_PLANO[planoDeLaUltima].toLowerCase()}` : '') +
    (ultimaSeparacionMm !== null ? ` · ${ultimaSeparacionMm.toFixed(0)} mm de la anterior` : ' · empieza una línea') +
    (ultimaCruza ? ' · cruza la herida' : '') +
    (heridas.length > 0 ? ` · tensión ${Math.round(sutura.tension * 100)} % · herida cerrada al ${Math.round(cierre * 100)} %` : '')
  taller.decir?.(texto)
  const planos = porPlanos ? resumirPorPlanos(porPlano, cierres, sutura.tensiones, planosConHerida) : undefined
  avisar?.({
    ...medida,
    // Con planos, lo bien espaciado se juzga con el rango de cada plano, no con el de la piel para todos.
    bienEspaciadas: planos ? planos.reduce((suma, p) => suma + p.bienEspaciadas, 0) : medida.bienEspaciadas,
    cierre,
    cierreMaximo,
    tension: sutura.tension,
    juicioDeLaTension:
      heridas.length > 0 && (!porPlanos || planosConHerida.includes(planoActivo))
        ? juicioDeLaTension({
            tension: sutura.tension,
            cruces: porPlanos ? (porPlano[planoActivo]?.cruces ?? 0) : medida.cruces,
            cierreMaximo,
            largoMm: porPlanos ? largosMm[planoActivo] : largoMm,
            tramoMm: porPlanos ? SEPARACION_IDEAL_POR_PLANO[planoActivo].max : undefined,
          })
        : null,
    ultimaSeparacionMm,
    juicio:
      juicio === 'ultima'
        ? porPlanos
          ? juicioDeLaPuntada(ultimaSeparacionMm, SEPARACION_IDEAL_POR_PLANO[planoDeLaUltima], NOMBRE_DEL_PLANO[planoDeLaUltima].toLowerCase())
          : juicioDeLaPuntada(ultimaSeparacionMm)
        : null,
    ultimaCruza,
    hilo: sutura.hilo.nombre,
    planos,
    planoActivo: porPlanos ? planoActivo : undefined,
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
 * El archivo del modelo, bajado una vez por página (P-009). «Repetir este paso», «Deshacer» y «Seguir donde lo dejó»
 * vuelven a montar el lienzo para que devuelva lo guardado como en una recarga, y cada montaje volvía a pedir el
 * archivo entero —decenas de MB— para el mismo modelo. Se guarda el último y se lee de nuevo desde una copia: el
 * modelo tiene que salir nuevo en cada montaje, porque lo cortado se hace sobre sus mallas, y lo único que se comparte
 * son los bytes. Uno solo: una página abre un modelo.
 */
let archivoDelModelo: { url: string; datos: Promise<ArrayBuffer> } | null = null

function cargarElArchivo(
  cargador: GLTFLoader,
  url: string,
  alCargar: (gltf: GLTF) => void,
  alFallar: (error: unknown) => void,
) {
  let archivo = archivoDelModelo
  if (!archivo || archivo.url !== url) {
    const datos = fetch(url).then((respuesta) => {
      if (!respuesta.ok) throw new Error(`El servidor respondió ${respuesta.status}.`)
      return respuesta.arrayBuffer()
    })
    archivo = { url, datos }
    archivoDelModelo = archivo
    // Un fallo no se guarda: el montaje siguiente lo vuelve a pedir.
    datos.catch(() => {
      if (archivoDelModelo?.datos === datos) archivoDelModelo = null
    })
  }
  archivo.datos.then((datos) => {
    try {
      cargador.parse(datos.slice(0), THREE.LoaderUtils.extractUrlBase(url), alCargar, alFallar)
    } catch (error) {
      alFallar(error)
    }
  }, alFallar)
}

/**
 * Lleva la cámara al encuadre de un paso (P-009) en 450 ms: el punto mirado, la dirección, la distancia y el arriba a
 * la vez. De golpe, el residente perdía de dónde venía y cada paso parecía otro modelo; más largo, estorba a quien ya
 * sabe el camino. La dirección gira por el arco corto y no se interpola en línea recta: entre dos vistas casi opuestas
 * la recta pasa por dentro del modelo.
 *
 * El arriba se le dice a `OrbitControls` en cada cuadro (`sincronizarElArriba`), porque el bucle de dibujo llama a
 * `controles.update()` en todos: con el arriba viejo, ese `update` recolocaba la cámara en el sistema de antes y la
 * vista daba un salto al terminar. Si llega otra orden mientras tanto, esta se para (`turnoDeLaCamara`).
 */
function llevarLaCamaraAlEncuadre(
  t: { camara?: THREE.PerspectiveCamera; controles?: OrbitControls; pedirDibujo?: () => void; turnoDeLaCamara?: number },
  e: EncuadreDelPaso,
  ms = 450,
) {
  const { camara, controles } = t
  if (!camara || !controles) return
  const c0 = controles.target.clone()
  const c1 = new THREE.Vector3(...e.centro)
  const r0 = camara.position.distanceTo(c0)
  const d0 = r0 > 1e-9 ? camara.position.clone().sub(c0).divideScalar(r0) : new THREE.Vector3(...e.direccion)
  const giro = new THREE.Quaternion().setFromUnitVectors(d0, new THREE.Vector3(...e.direccion))
  const a0 = camara.up.clone().normalize()
  const a1 = new THREE.Vector3(...e.arriba)
  const turno = (t.turnoDeLaCamara ?? 0) + 1
  t.turnoDeLaCamara = turno
  const inicio = performance.now()
  const parcial = new THREE.Quaternion()
  const cuadro = (ahora: number) => {
    if (t.turnoDeLaCamara !== turno) return
    const k = Math.min(1, (ahora - inicio) / ms)
    if (k >= 1) {
      ponerLaPose(camara, controles, c1, e.distancia, { direccion: e.direccion, arriba: e.arriba })
      t.pedirDibujo?.()
      return
    }
    const suave = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    parcial.identity().slerp(giro, suave)
    controles.target.lerpVectors(c0, c1, suave)
    camara.position
      .copy(d0)
      .applyQuaternion(parcial)
      .multiplyScalar(r0 + (e.distancia - r0) * suave)
      .add(controles.target)
    camara.up.lerpVectors(a0, a1, suave)
    if (camara.up.lengthSq() < 1e-8) camara.up.copy(a1)
    camara.up.normalize()
    camara.lookAt(controles.target)
    sincronizarElArriba(controles, camara)
    t.pedirDibujo?.()
    requestAnimationFrame(cuadro)
  }
  requestAnimationFrame(cuadro)
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
