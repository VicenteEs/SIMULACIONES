'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { piezasConLasDelModelo } from '@/lib/piezasDelCaso'
import {
  CONTEXTO_VIVO,
  TIEMPO_DEL_AVISO_DE_RECUPERADO_MS,
  cuantoFaltaParaRemontarse,
  loQueSeEnseña,
  type EstadoDelContexto,
} from '@/lib/controlDelContexto'
import {
  capaDelRol,
  capasAlEntrarEnPaso,
  evaluarGesto,
  fuerzaInicial,
  instruccionDelPaso,
  medidaInicial,
  objetivoDelPaso,
  puntajeMaximo,
  piezasQueFaltanEnElArchivo,
  puntosDelPaso,
  rangoDeFuerzaEnTexto,
  rangoDelDeslizadorDeFuerza,
  rangoDeTrazoEnTexto,
  RESULTADOS,
  topesDeReduccion,
  visibilidadDelPaso,
  type Objetivo,
  type PasoQuirurgico,
} from '@/lib/simulador'
import { largoDelTrazo, medirReduccion, type EjeLargo } from '@/lib/reduccion'
import { POSICIONES_DEL_PACIENTE, type PosicionDelPaciente } from '@/lib/posicionDelPaciente'
import {
  MAXIMO_DE_COMPLICACIONES,
  type ComplicacionDelCaso,
  type RecorridoGuardado,
  type ResultadoDeCirugia,
} from '@/lib/progresoDelSimulador'
import { marcarComoLeida, registrarResultadoDeCirugia } from '@/app/(frontend)/acciones/actividad'
import { Rico, tieneContenido } from '@/components/Rico'
import { IconoInstrumento } from './IconoInstrumento'
import { CampoNumerico } from './CampoNumerico'
import { MenuDeMovimiento, type SeleccionDeMovimiento } from './MenuDeMovimiento'
import { ACCIONES_DE_LA_PLACA, ajusteDeLaPlacaPorPaso, lecturaDelMovimiento } from '@/lib/movimientoPorEjes'
import { acotar } from '@/lib/ejesAnatomicos'
import { textoDelDesplazamiento } from '@/lib/ejesAnatomicos'
import { textoDeLaBroca } from '@/lib/profundidadDeLaBroca'
import { NOMBRE_DE_LA_TECNICA } from '@/lib/compresion'
import { PanelDeCompresion } from './PanelDeCompresion'
import { RadiografiaPostoperatoria } from './RadiografiaPostoperatoria'
import { AsaDeAncho } from './AsaDeAncho'
import type { EstadoDeLaMesa } from './mesaDeModelado'
import { intervencionPropuesta, type DatosDeLaLamina } from '@/lib/laminaPostoperatoria'
import {
  ETAPAS_DE_FIJACION,
  diametrosDelTipo,
  instrumentoDeLaEtapa,
  siguienteDeLaSecuencia,
  TIPOS_DE_TORNILLO,
  definicionDelTipo,
  textoDeLaSecuencia,
  tipoDelTornillo,
  type EtapaDeFijacion,
} from '@/lib/tornillos'
import type { EstadoDeLaBroca, EstadoDeLaTrayectoria, SucesoDeFijacion } from './LienzoQuirurgico'
import { useConfirmar } from '@/components/ui/Confirmar'
import { Vacio } from '@/components/ui/Vacio'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpFromLine,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Drill,
  Eraser,
  Focus,
  FoldVertical,
  Hand,
  HandGrab,
  Info,
  Crosshair,
  Maximize2,
  Minimize2,
  Move,
  OctagonAlert,
  PenLine,
  Pin,
  Plus,
  Rotate3d,
  RotateCcw,
  RotateCw,
  ScanLine,
  Scissors,
  Search,
  Spline,
  Trophy,
  Undo2,
  UnfoldHorizontal,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
// La hoja de la consola, aparte de `estilos.css`: el porqué está en su cabecera.
import '@/app/(frontend)/simulador/consola.css'
// El visor del instrumento reutiliza el de las fichas, ya partido en su propio
// trozo de JavaScript: se descarga cuando el residente coge un instrumento que
// tiene modelo, y no antes.
import { Visor3D } from '@/components/VisoresPerezosos'
// De `aritmeticaDelEncuadre` y NO de `@/lib/encuadre`, aunque el segundo
// reexporte lo mismo y quede más uniforme: `encuadre.ts` abre con
// `import * as THREE from 'three'` para `encuadreCapturado`, y este archivo
// lleva `'use client'`. Un `export … from` sigue siendo una arista del grafo,
// así que importar por allí metería three entero en el paquete que descarga el
// residente al abrir un caso —incluido el caso sin un solo modelo— y desharía
// las dos importaciones dinámicas de aquí arriba, que existen justo para que el
// motor 3D viaje aparte. El porqué completo está en la cabecera de los dos
// módulos.
import { encuadreVigente, type Encuadre } from '@/lib/aritmeticaDelEncuadre'
import { CATEGORIAS_DE_INSTRUMENTAL, ETIQUETA_DE_CATEGORIA } from '@/lib/instrumental'
import { leerFichaParaElSimulador, type FichaParaElSimulador } from '@/app/(frontend)/acciones/fichaDelSimulador'
import { VentanaDeEstructura } from '@/app/(frontend)/admin-panel/estructuras/VentanaDeEstructura'
import { familiaDeSistema } from '@/lib/estructuras'
import { instrumentosParaActuar } from '@/lib/abordajeDelMusculo'
import { agruparInsumos, anotarUso, filasParaLaBandeja, resumenDeInsumos, type RegistroDeInsumos } from '@/lib/insumos'
import type { AjustesDeInstrumento, ArticulacionDeclarada } from '@/instrumental/modelo'
import { comportamientoDelInstrumento, guiaDelInstrumento } from '@/lib/comportamientoDelInstrumento'
import { InstrumentoArticulado } from './InstrumentoArticulado'
import { PanelDeFluoroscopia } from './PanelDeFluoroscopia'
import {
  juicioDeLaPotencia,
  limitarPotencia,
  POTENCIA_INICIAL_W,
  POTENCIA_MAXIMA_W,
  RANGO_HABITUAL,
  type ModoDelElectrobisturi,
} from '@/lib/electrobisturi'
import { TIPOS_DE_TRAZO, type TipoDeTrazo } from '@/lib/trazoRecto'
import { anchoGuardadoDelRecuadro, guardarAnchoDelRecuadro } from './anchoDelRecuadro'
import {
  ajustesGuardadosDeLaImagen,
  guardarAjustesDeLaImagen,
  guardarModoDeEscopia,
  modoGuardadoDeEscopia,
  type ModoDeEscopia,
} from './ajustesDeLaImagen'
import {
  PROYECCIONES_DE_FLUOROSCOPIA,
  SEGUNDOS_DE_ESCOPIA_ALTOS,
  SIN_DESPLAZAMIENTO,
  ladoDeLaImagen,
  limitarAnchoDelRecuadro,
  limitarDesplazamiento,
  limitarZoom,
  type AjustesDeLaImagen,
  type DesplazamientoDeLaImagen,
  type ProyeccionDeFluoroscopia,
} from '@/lib/radiografia'
import {
  adviertePorLaTension,
  ALTURA_MAXIMA_DEL_PELLIZCO_MM,
  aperturaMaxima,
  ETIQUETA_DEL_PLANO,
  PASO_DE_AGARRE,
  SEPARACION_MAXIMA_DE_PINZAS_MM,
} from '@/lib/exposicion'
import { rotuloDeLaIncision } from '@/lib/incisiones'
import type {
  AyudasDeEscopia,
  DatosDeNodo,
  EstadoDeLaDiseccion,
  EstadoDeLasHeridas,
  EstadoDeLaSutura,
  EstadoDeLosPellizcos,
  EstadoDeLaReduccion,
  EstadoDeLosSeparadores,
  InclinacionDeBroca,
  InstrumentoEnEscena,
  MandoDelLienzo,
  Modo,
  PerforacionHecha,
  PiezaDelCaso,
} from './LienzoQuirurgico'
import { MAXIMO_DEL_TORNILLO_MM, MINIMO_DEL_TORNILLO_MM, calibreDeBrocaParaElTornillo, resumenDeLaFijacion, type EstadoDeLaFijacion } from '@/lib/fijacion'
import { paraComparar } from '@/lib/catalogosAmpliables'
import { claveDeLaConsolaDelEditor, guardarEnsayoDeLaConsola, leerEnsayoDeLaConsola } from '@/lib/ensayoDelEditor'

/**
 * Consola de reducción y fijación de fracturas.
 *
 * El residente recorre el caso paso a paso: elige el instrumento de la bandeja,
 * traza la incisión sobre el modelo, reduce el fragmento y fija. Cada paso dice
 * qué se le mide, y la consola solo deja avanzar cuando el gesto sale bien.
 *
 * Lo que sostiene todo esto es el modelo: llega ya partido desde Blender, con
 * cada trozo como un objeto con nombre, y el caso declara qué es cada uno. La
 * consola no corta huesos ni adivina anatomía; enciende, apaga y mueve nodos
 * que alguien nombró.
 *
 * La aritmética no está aquí, y las decisiones tampoco. La evaluación, lo que
 * cada paso deja ver y los topes del deslizador viven en `@/lib/simulador`; las
 * medidas de la reducción, en `@/lib/reduccion`. Los dos se prueban sin
 * navegador, porque son la parte que puede estar mal sin que se note: un lienzo
 * en negro o un deslizador imposible de acertar pasaban la suite entera en
 * verde mientras esas reglas vivían aquí dentro. Lo que queda en este archivo
 * es estado de React y marcado.
 *
 * **El puntaje y las complicaciones ya no mueren con la pestaña.** Vivían aquí,
 * en estado local, y eso tenía dos precios que se pagaban juntos: pasarse y
 * quedarse corto acababan valiendo lo mismo —la única señal que los distinguía
 * era una línea de un registro de diez que se perdía al recargar— y el
 * «registro de complicaciones» que la portada promete no existía. Ahora se
 * mandan a `actividad` (`registrarResultadoDeCirugia`) cuando cambian, y la
 * página del caso los devuelve al abrir en `recorridoGuardado`.
 */

// El motor 3D no viaja con la página: se carga cuando el residente abre un caso
// que de verdad tiene modelo.
const LienzoQuirurgico = dynamic(
  () => import('./LienzoQuirurgico').then((m) => m.LienzoQuirurgico),
  {
    ssr: false,
    loading: () => (
      <div className="consola-lienzo consola-lienzo-cargando">
        <span>Cargando el modelo…</span>
      </div>
    ),
  },
)

export interface PasoDeConsola extends PasoQuirurgico {
  id: string
  descripcion?: unknown
  riesgo?: unknown
  faseNombre?: string | null
  instrumentoNombre?: string | null
  /** Nombres de los nodos que se ven en este paso. Vacío: se mantiene lo anterior. */
  muestra?: string[]
}

export interface InstrumentoDeBandeja {
  id: string
  nombre: string
  icono?: string | null
  /** Dirección de su modelo 3D, si el catálogo le puso uno. */
  modeloUrl?: string | null
  /**
   * La pose que el traumatólogo dejó capturada en la ficha de ese modelo.
   *
   * Va aplanada, como la dirección y por lo mismo: `casoParaLaConsola`
   * (`src/lib/casoQuirurgico.ts`) traduce el documento de Payload en el
   * servidor y lo que cruza al navegador es plano. Aquí no se recibe el
   * documento del modelo, solo lo que la consola necesita de él.
   *
   * Opcional a propósito: un instrumento que nadie encuadró no la trae, y eso
   * significa «ábrelo como siempre, abarcándolo entero».
   */
  encuadreDelModelo?: Encuadre | null
  /** Retoques y estado de las articulaciones que el administrador dejó en el taller (D-165). */
  ajustes?: AjustesDeInstrumento | null
  /** Cómo se agrupa en la bandeja del editor, que enseña el catálogo entero (D-166). */
  categoria?: string | null
  /** Con qué identificador se reconoce qué hace en la escena (corta, separa, perfora). */
  slug?: string | null
  /** Lo trajo la placa de la bandeja y no el caso: tornillo, broca, medidor o destornillador de esa placa (P-003 E6). */
  paraLaPlaca?: boolean
  /** Está porque la mesa es completa y no porque el caso lo pida (P-004 E3): no se precarga hasta abrir su categoría. */
  porOmision?: boolean
  /** Cuántos orificios tiene una placa y el largo de un tornillo, escritos por el editor (P-004 E6). */
  orificios?: number | null
  largoMm?: number | null
  /** El tipo de tornillo que escribió el editor (P-004 E9); sin él, se deduce del nombre. */
  tipoDeTornillo?: string | null
  /** Solo en el editor: si el instrumento ya está en la bandeja que el caso declara. */
  enLaBandejaDelCaso?: boolean
  /** Para qué sirve, tal como lo escribió el traumatólogo en el catálogo. */
  descripcion?: string | null
}

export interface CasoDeConsola {
  nombre: string
  codigo: string | null
  hueso: string | null
  clasificacion: string | null
  tecnica: string | null
  modeloUrl: string | null
  milimetrosPorUnidad: number
  ejeLargo: EjeLargo
  piezas: PiezaDelCaso[]
  desplazamientoInicial: {
    x: number
    y: number
    z: number
    giroX: number
    giroY: number
    giroZ: number
  }
  pasos: PasoDeConsola[]
  /**
   * Qué ve el residente en la bandeja (P-004 E3): `completa`, todo el catálogo de instrumental; o `acotada`, lo que el
   * editor eligió y lo que piden los pasos.
   */
  bandeja: 'completa' | 'acotada'
  instrumental: InstrumentoDeBandeja[]
  /**
   * Solo en el editor: el catálogo entero, para ofrecer «Añadir a la bandeja». La bandeja que se pinta
   * (`instrumental`) es siempre **solo la del caso**, igual que la ve el residente: los que el autor eligió
   * y los que piden los pasos. Antes el editor veía el catálogo entero en la bandeja y lo que armaba no se
   * parecía a lo que vería quien lo recorre.
   */
  catalogoDelEditor?: InstrumentoDeBandeja[]
}

/**
 * Lo que la consola recibe cuando la monta el **editor** del caso (D-166), y que
 * el residente nunca trae.
 *
 * Es la misma consola, no una imitación: lo que cambia es quién manda sobre el
 * paso que se mira, qué hay en la columna derecha y que nada de lo que pasa
 * dentro se puntúa ni se guarda. El editor no tiene su propio lienzo, sus
 * propias medidas ni su propia bandeja: usa los de la consola, y por eso lo que
 * el autor ve al editar es lo que verá el residente.
 */
/**
 * Lo que está pasando en la consola mientras el autor edita, para que su panel
 * lo use: capturar la incisión que acaba de trazar como rango del paso, lo que
 * se ve ahora como lo que el paso muestra, las medidas del fragmento como
 * tolerancias. Es lectura; el panel escribe en el formulario, no en la consola.
 */
export interface VistaDelEnsayo {
  /** La incisión trazada, en milímetros. */
  trazoMm: number
  reduccion: { desplazamiento: number; angulacion: number; diastasis: number }
  fuerza: number
  /** Los objetos que trae el archivo del modelo, y lo que cada uno dice de sí mismo. */
  nodosDelArchivo: string[]
  datosDeLosNodos: DatosDeNodo[]
  /** Si el archivo ya terminó de cargar: antes, «no está en el archivo» sería mentira. */
  modeloCargado: boolean
  /** El instrumento que se tiene en la mano. */
  instrumentoEnLaMano: string | null
}

export interface EdicionEnLaConsola {
  /** El paso que se edita. La consola lo sigue; no lleva su propia cuenta. */
  indice: number
  alCambiarIndice: (indice: number) => void
  /** El panel de edición con sus pestañas: ocupa lo alto de la columna derecha. */
  panel: (vivo: VistaDelEnsayo) => ReactNode
  /** Añadir, mover o quitar pasos: se pintan junto a la franja de pasos. */
  barraDePasos: ReactNode
  /** Una pieza pinchada en el modelo con el modo «Señalar». */
  alSenalar: (nodo: string) => void
  /** Añade o quita un instrumento de la bandeja que declara el caso. */
  alAlternarEnLaBandeja: (id: string) => void
  /** Deja la bandeja del caso exactamente con estos instrumentos (los insumos usados, al terminar: P-003 E7), y «Solo lo que elijo». */
  alFijarLaBandeja: (ids: string[]) => void
  /** Cambia lo que ve el residente en la bandeja: toda la mesa o solo lo que el editor elige (P-004 E3). */
  alCambiarLaBandeja: (modo: 'completa' | 'acotada') => void
  /** Pone el instrumento que se tiene en la mano como el correcto del paso que se edita. */
  alUsarEnElPaso: (id: string) => void
  /** El instrumento correcto del paso que se edita, para marcarlo en la bandeja. */
  instrumentoDelPaso: string | null
  /** El fragmento se movió con el ratón: dónde está respecto de su reposo. */
  alMoverFragmento?: () => void
}

/**
 * Una línea del registro y su tono.
 *
 * El tono era `bien | aviso | grave` y se pintaba como clase suelta del `<li>`:
 * `aviso` chocaba con la `.aviso` global de `estilos.css` —la nota al pie, con
 * 40 px de margen encima y un filete—, así que cada advertencia del registro
 * salía separada del resto por un hueco y una raya que nadie había pedido. Hoy
 * el tono es `atencion`, como en las insignias de `ui.css`, y la clase se
 * compone con prefijo (`registro-atencion`), que no puede casar con nada de
 * fuera de la consola.
 */
interface Anotacion {
  texto: string
  clase: 'bien' | 'atencion' | 'grave'
}

const CAPAS = [
  { rol: 'piel', etiqueta: 'Piel', enProsa: 'la piel' },
  { rol: 'musculo', etiqueta: 'Músculo', enProsa: 'el músculo' },
  { rol: 'hueso', etiqueta: 'Hueso', enProsa: 'el hueso' },
] as const

/**
 * Los tres modos de ratón, cada uno con lo que hace.
 *
 * La ayuda no es adorno. El visor del atlas, que solo gira una pieza, lleva la
 * suya; aquí hay tres modos, un fragmento arrastrable y una herramienta de
 * dibujo, y no había ni una línea. El residente probaba los modos a ciegas:
 * pulsaba «Trazar», arrastraba para girar el modelo como hace en el atlas, y se
 * encontraba con una incisión que además se le medía.
 */
const MODOS: readonly { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon }[] = [
  {
    valor: 'orbitar',
    etiqueta: 'Orbitar',
    icono: Rotate3d,
    ayuda: 'Orbitar: arrastre para girar el modelo y use la rueda para acercar.',
  },
  {
    valor: 'trazar',
    etiqueta: 'Trazar',
    icono: PenLine,
    ayuda: 'Trazar: marque el inicio y el final de la incisión con dos clics (línea recta) o arrastre para dibujarla a mano alzada.',
  },
  {
    valor: 'mover',
    etiqueta: 'Mover',
    icono: Move,
    ayuda: 'Mover: arrastre para colocar. «Todo junto» mueve piel, músculo y hueso a la vez; «Un trozo» agarra el trozo de hueso que se toque y le pone sus asas: las flechas lo mueven en cada eje, los aros lo giran en cada eje y el aro blanco lo gira sobre la línea de visión (Ctrl: de cinco en cinco grados).',
  },
]

/**
 * El cuarto modo, solo del editor: pinchar un trozo del modelo lo añade a las
 * piezas del caso con su nombre exacto. Es el que usaba el taller de piezas; el
 * residente no lo tiene porque no tiene nada que declarar.
 */
const MODO_SENALAR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'senalar',
  etiqueta: 'Señalar',
  icono: Crosshair,
  ayuda: 'Señalar: pinche un trozo del modelo y se añade a las piezas del caso con su nombre exacto.',
}

/**
 * Los modos de los instrumentos que actúan sobre el paciente (D-167). Solo
 * aparecen cuando el instrumento en la mano los usa: un separador no sirve de
 * nada sin una herida, ni una broca con el modo de mover el fragmento.
 */
const MODO_SEPARAR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'separar',
  etiqueta: 'Separar',
  icono: UnfoldHorizontal,
  ayuda:
    'Separar: haga clic en el borde de la incisión donde quiere poner el separador (el plano lo decide el clic) o en un músculo para retraerlo, y ábralo con la rueda del ratón (o con la barra). Uno de mano abre el borde que sostiene; uno autoestático abre los dos. Otro clic en otro músculo lo separa también, sin soltar el anterior.',
}

/**
 * El modo de las pinzas de disección: pellizcan la piel hacia arriba. Con dientes, y de a dos —una la toma
 * quien opera y la otra el ayudante—, dan tensión a los bordes para cortar la piel por completo.
 */
const MODO_PINZAR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'pinzar',
  etiqueta: 'Pinzar',
  icono: Hand,
  ayuda:
    'Pinzar: un clic pone la pareja de pinzas, una frente a la otra, a los dos lados de la incisión (o de donde irá). La rueda las separa o las junta; Mayúsculas + rueda abre o cierra las mandíbulas. Arrastrar una pinza hacia arriba levanta más la piel.',
}

/**
 * El modo de las pinzas de reducción (P-003 E5): un clic en un trozo de hueso deja la pinza agarrándolo, y el trozo se
 * mueve con las asas del taller (flechas y aros) con la pinza puesta hasta que se la suelta.
 */
const MODO_REDUCIR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'reducir',
  etiqueta: 'Reducir',
  icono: HandGrab,
  ayuda:
    'Reducir: un clic en un trozo de hueso deja la pinza agarrándolo. Llévelo a su sitio con las flechas y los aros mirando la fluoroscopia; la pinza va con él. Un clic en la pinza la suelta.',
}

/**
 * El modo «Seleccionar estructura» (P-003 E9, que lo llamó «Info»; P-004 E4 lo renombró por pedido de Cristóbal): un clic
 * en una estructura la destaca y abre su ficha al lado. No modifica nada, así que está para todos y con cualquier
 * instrumento; al salir del modo el tinte se quita. La clave interna sigue siendo `info`: está en la sesión guardada y
 * en `MODO_DEL_OBJETIVO`.
 */
/** Lo que dura el movimiento de la reducción automática (P-004 E7). */
const DURACION_DE_LA_REDUCCION_MS = 600

const MODO_INFO: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'info',
  etiqueta: 'Seleccionar estructura',
  icono: Info,
  ayuda: 'Seleccionar estructura: haga clic en una estructura —un músculo, un nervio, un vaso, un hueso— y se destaca; al lado aparece su ficha. Una pieza apagada no se pincha.',
}

/**
 * El modo de la disección roma con la tijera de Metzenbaum (petición de Cristóbal): se apoya la punta cerrada en el
 * tejido, se abren las ramas y el plano se separa por tensión, no por corte; se avanza y se vuelve a abrir.
 */
const MODO_DISECAR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'disecar',
  etiqueta: 'Disecar',
  icono: FoldVertical,
  ayuda:
    'Disecar (disección roma): un clic apoya la punta cerrada de la tijera en el tejido; la rueda abre las ramas y el plano se separa por tensión, sin cortar. Otro clic más allá avanza, y se vuelve a abrir.',
}

const MODO_COSER: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'coser',
  etiqueta: 'Coser',
  icono: Spline,
  ayuda:
    'Coser: pique con un clic sobre la piel; cada clic suma una puntada y el hilo queda dibujado entre una y otra. Con el arrastre se gira el modelo.',
}

const MODO_FIJAR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'fijar',
  etiqueta: 'Fijar',
  icono: Pin,
  ayuda:
    'Fijar: con una placa, pique sobre el hueso y se apoya; con un tornillo o el medidor, pique en un agujero de la placa. Con el arrastre se gira el modelo.',
}

/**
 * El modo del alicate y las grifas (P-005 E1): se dobla y se tuerce una placa **fuera del hueso**, sobre la mesa de modelado. Un clic en la placa apunta al
 * sitio; la rueda (o los botones del recuadro) dobla o tuerce ahí; arrastrar la placa la mueve.
 */
const MODO_MODELAR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'modelar',
  etiqueta: 'Modelar',
  icono: Wrench,
  ayuda:
    'Modelar: con una placa en la mesa, un clic sobre ella apunta al sitio donde se dobla; la rueda dobla (alicate) o tuerce (grifa) ahí, un grado por muesca —con Mayúsculas, una quinta parte—. Arrastrar la placa la mueve. No doble sobre un orificio: lo deforma.',
}

const MODO_PERFORAR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'perforar',
  etiqueta: 'Perforar',
  icono: Drill,
  ayuda:
    'Perforar: apunte al hueso y mantenga pulsado; la broca gira y avanza. Al soltar se queda en el hoyo —puede ir a pedir el disparo—, se mete o se saca con la rueda y se retira con «Retirar», Esc o el botón derecho. Elija antes la inclinación; la etiqueta dice el ángulo con el eje del hueso.',
}

/**
 * El modo de ratón que necesita cada objetivo.
 *
 * La consola lo pone sola al entrar en el paso, porque lo sabe. Antes solo lo
 * ponía `reiniciar`, de modo que venir de un paso de trazo a uno de reducción
 * dejaba el ratón en «trazar»: arrastrar el fragmento dibujaba una raya sobre
 * el hueso —en ese modo el lienzo engancha cualquier superficie visible, el
 * filtro por fragmento solo existe en la rama «mover»— mientras el
 * desplazamiento seguía clavado y la medida «Incisión» contaba el garabato.
 * Cambiarlo a mano sigue siendo posible: el modo que pide el paso se señala en
 * el panel izquierdo, no se impone.
 */
const MODO_DEL_OBJETIVO: Record<Objetivo, Modo> = {
  instrumento: 'orbitar',
  trazo: 'trazar',
  reduccion: 'mover',
  fuerza: 'orbitar',
  perforacion: 'perforar',
  fijacion: 'fijar',
  // El paso de planos se resuelve desde la ficha de «Seleccionar estructura», que es donde están «Cortar» y «Separar».
  planos: 'info',
}

/** «la piel», «la piel y el músculo»: para escribirlo dentro de una frase. */
function capasEnProsa(roles: string[]): string {
  const nombres = roles.map((rol) => CAPAS.find((c) => c.rol === rol)?.enProsa ?? rol)
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * En qué quedó la marca de «leído» que la consola pone al terminar el caso.
 *
 * Tres estados y no un booleano, porque el panel de «Caso terminado» tiene
 * tres cosas distintas que decir: nada mientras no haya respuesta, que ya
 * cuenta como leído, o que no se pudo y hay que marcarlo a mano. Con un
 * booleano, «todavía no ha vuelto» y «falló» se pintarían igual.
 */
type LecturaAlTerminar = 'pendiente' | 'marcada' | 'fallida'

/**
 * Lo que una tarjeta de medida dice de su cifra: contra qué se mide y cómo va.
 *
 * Datos y no un `<dd>` ya pintado, como era antes: la tarjeta necesita el
 * estado para colorear su borde y su indicador, no solo el renglón.
 */
type LecturaDeMedida = {
  referencia: string
  veredicto: string
  estado: 'dentro' | 'fuera' | 'neutro'
}

export function ConsolaQuirurgica({
  caso,
  documentoId,
  recorridoGuardado = null,
  alMarcarComoLeido,
  editor,
  mandoRef,
  cirujano = '',
}: {
  /** El nombre de quien opera, de su cuenta, para precargar «Dr. ____» en la radiografía postoperatoria (P-004 E11). */
  cirujano?: string
  caso: CasoDeConsola
  /**
   * La cirugía cuyo recorrido se guarda.
   *
   * Obligatoria, y sin valor por omisión: es lo único que hace falta para que
   * lo que aquí se calcula llegue a la base, y un caso que se puede montar sin
   * ella es un caso que se recorre entero para nada. Que falte tiene que
   * fallar al compilar y no en silencio.
   */
  documentoId: string
  /** Lo que quedó del último recorrido de este residente en este caso. */
  recorridoGuardado?: RecorridoGuardado | null
  /**
   * Avisa de que el caso quedó marcado como leído al terminarlo.
   *
   * La casilla de «leída» no es de la consola: la pinta `RastreadorActividad`
   * encima de ella y nace con lo que había al cargar la página. Sin este aviso,
   * el residente termina el caso, la base lo da por leído y la casilla de
   * arriba sigue diciendo «Marcar como leída» hasta que recarga: una pantalla
   * contradiciendo a la otra. Quien la escucha es `CasoConSuLectura`.
   *
   * Obligatoria por lo mismo que `documentoId`: montar la consola sin nadie que
   * mueva la casilla tiene que fallar al compilar, no quedarse en silencio.
   */
  alMarcarComoLeido: () => void
  /**
   * Presente solo cuando la monta el editor del caso. Con él, la consola es un
   * ensayo: se puede saltar a cualquier paso, «Aplicar paso» solo dice qué
   * resultado tendría, y no se puntúa ni se escribe nada en la base.
   */
  editor?: EdicionEnLaConsola
  /**
   * El mando del lienzo, para quien edita: el panel de piezas necesita leer los
   * objetos del archivo y la posición del fragmento. Sin esto tendría que abrir
   * un segundo lienzo con el mismo modelo.
   */
  mandoRef?: React.MutableRefObject<MandoDelLienzo | null>
}) {
  const mando = useRef<MandoDelLienzo | null>(null)
  // La consola entera: ahí se escriben los anchos de las columnas que se arrastran (`AsaDeAncho`).
  const raizDeLaConsola = useRef<HTMLElement>(null)
  // El lienzo entrega su mando por esta función y no por la ref directa: así la
  // consola conserva su propia ref —estable, que es lo que el compilador de
  // React sabe seguir— y, si la monta el editor, le pasa también el mando a él.
  const asignarMando = useCallback(
    (m: MandoDelLienzo | null) => {
      mando.current = m
      if (mandoRef) mandoRef.current = m
    },
    [mandoRef],
  )
  const confirmar = useConfirmar()

  const [indiceInterno, setIndiceInterno] = useState(0)
  // En el editor manda quien edita; nunca se sale del rango aunque se quiten pasos.
  const indice = editor
    ? Math.min(Math.max(0, editor.indice), Math.max(0, caso.pasos.length - 1))
    : indiceInterno
  const setIndice = (nuevo: number) => (editor ? editor.alCambiarIndice(nuevo) : setIndiceInterno(nuevo))
  const [modo, setModo] = useState<Modo>(
    () => MODO_DEL_OBJETIVO[objetivoDelPaso(caso.pasos[0] ?? {})],
  )
  // La posición del paciente: de pie, decúbito supino o prono. `null` cuando la vista se giró a mano (giro libre
  // o girada 90°) y ya no es ninguna de las tres. Mueve la cámara, no el modelo (`posicionDelPaciente.ts`).
  const [posicion, setPosicion] = useState<PosicionDelPaciente | null>('de-pie')
  const [giroLibre, setGiroLibre] = useState(false)
  // La fluoroscopia: `null` apagada; encendida, la proyección con que se mira (AP, lateral u oblicua). Al
  // encenderla se abre al lado la imagen del arco en C, en círculo; el lienzo principal no cambia.
  const [fluoroscopia, setFluoroscopia] = useState<ProyeccionDeFluoroscopia | null>(null)
  const [menuDeFluoroscopia, setMenuDeFluoroscopia] = useState(false)
  const [zoomDeFluoroscopia, setZoomDeFluoroscopia] = useState(1)
  // Lo ancho que quiere el residente el recuadro de la imagen (D-175). Se recuerda entre visitas: quien lo prefiere
  // grande lo quiere así en todos los casos, y volver a estirarlo cada vez que enciende los rayos cansa.
  const [anchoDeFluoroscopia, setAnchoDeFluoroscopia] = useState(() => anchoGuardadoDelRecuadro())
  // «Disparo» (una toma por pulsación, lo que se hace en pabellón) o «vídeo» (la imagen en vivo de antes): por
  // omisión el disparo, y el que cada quien elija se recuerda en su navegador (P-003, E2).
  const [modoDeEscopia, setModoDeEscopia] = useState<ModoDeEscopia>(() => modoGuardadoDeEscopia())

  // El contexto de WebGL del lienzo (P-004 E2). Si el navegador se lo quita a la página, el lienzo avisa; aquí se dice
  // «se está recuperando» y, pasados unos segundos sin que vuelva, se ofrece montarlo de nuevo con la clave. El caso,
  // los pasos y el puntaje son de la consola y no se tocan: lo que se vuelve a montar es solo el dibujo.
  const [estadoDelContexto, setEstadoDelContexto] = useState<EstadoDelContexto>(CONTEXTO_VIVO)
  const [relojDelContexto, setRelojDelContexto] = useState(0)
  const [claveDelLienzo, setClaveDelLienzo] = useState(0)
  // La placa que está en la mesa de modelado, si hay una (P-005 E1): la dice el lienzo cada vez que cambia.
  const [mesaDeModelado, setMesaDeModelado] = useState<EstadoDeLaMesa | null>(null)
  const avisoDeLaMesa = useRef(0)
  useEffect(() => {
    if (estadoDelContexto.fase === 'perdido') {
      const reloj = window.setInterval(() => setRelojDelContexto(performance.now()), 500)
      // Si el navegador no devuelve el contexto en 30 s, el lienzo se vuelve a montar solo, sin esperar un clic (pedido del dueño: más
      // margen contra el blanco). Un lienzo nuevo empieza vivo, así que esto no se repite hasta una pérdida nueva.
      const remontar = window.setTimeout(() => {
        setClaveDelLienzo((c) => c + 1)
        setEstadoDelContexto(CONTEXTO_VIVO)
      }, cuantoFaltaParaRemontarse(estadoDelContexto, performance.now()) ?? 0)
      return () => {
        window.clearInterval(reloj)
        window.clearTimeout(remontar)
      }
    }
    if (estadoDelContexto.fase === 'recuperado') {
      const fin = window.setTimeout(() => setEstadoDelContexto(CONTEXTO_VIVO), TIEMPO_DEL_AVISO_DE_RECUPERADO_MS)
      return () => window.clearTimeout(fin)
    }
  }, [estadoDelContexto])
  const avisoDelContexto = loQueSeEnseña(estadoDelContexto, relojDelContexto)

  // Cómo se revela la imagen: kilovoltios, contraste, brillo y filtro. Se aplican a la última toma sin volver a disparar.
  const [ajustesDeLaImagen, setAjustesDeLaImagen] = useState<AjustesDeLaImagen>(() => ajustesGuardadosDeLaImagen())
  // La última toma del modo de disparo: de cuándo es y con qué proyección, acercamiento y posición se hizo, para decir
  // «hace N s» y si la imagen quedó vieja. `ahora` solo avanza mientras hay una toma que mirar.
  const [ultimaToma, setUltimaToma] = useState<{
    hora: number
    proyeccion: ProyeccionDeFluoroscopia
    zoom: number
    desplazamiento: DesplazamientoDeLaImagen
  } | null>(null)
  const [ahoraDeLaEscopia, setAhoraDeLaEscopia] = useState(0)
  // Cuánto se ha corrido la extremidad bajo el arco: se arrastra la imagen, como en pabellón se mueve el miembro.
  const [desplazamientoDeFluoroscopia, setDesplazamientoDeFluoroscopia] = useState<DesplazamientoDeLaImagen>(SIN_DESPLAZAMIENTO)
  // Las ayudas de los rayos X (D-166). Los ejes salen puestos —son lo que
  // enseña a leer la angulación— y el objetivo no: ver dónde debe quedar el
  // hueso es una ayuda que conviene poder quitar, porque en una radioscopia
  // real nadie lo dibuja.
  const [ayudas, setAyudas] = useState<AyudasDeEscopia>({ objetivo: false, ejes: true })
  // La consola ocupa toda la pantalla (ver `.consola-completa`): con todos los mandos a la vista.
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  // La incisión en recta es la de siempre: la mano alzada sale temblorosa.
  const [tipoDeTrazo, setTipoDeTrazo] = useState<TipoDeTrazo>('recto')
  // «Mover todo junto» o un trozo de hueso. Sin elegir (`null`), manda el paso: reducir mueve un trozo.
  const [moverTodoElegido, setMoverTodoElegido] = useState<boolean | null>(null)
  // El electrobisturí: modo (amarillo CUT / azul COAG) y potencia, en vatios de 0 a 100.
  const [modoElectro, setModoElectro] = useState<ModoDelElectrobisturi>('corte')
  const [potenciaW, setPotenciaW] = useState(POTENCIA_INICIAL_W)
  // Lo que hay puesto en el campo: separadores en la herida y pinzas que sostienen la piel.
  const [separadores, setSeparadores] = useState<EstadoDeLosSeparadores | null>(null)
  const [pellizcos, setPellizcos] = useState<EstadoDeLosPellizcos | null>(null)
  // Las pinzas de reducción que tienen agarrado un trozo de hueso (P-003 E5).
  const [pinzasDeReduccion, setPinzasDeReduccion] = useState<EstadoDeLaReduccion | null>(null)
  // Cómo se usa la tijera de Metzenbaum: cortando, como cualquier tijera, o en disección roma (separa por tensión).
  const [usoDeLaTijera, setUsoDeLaTijera] = useState<'cortar' | 'roma'>('cortar')
  // En qué plano se apoyan los separadores que se pongan: la piel o, más profundo, el músculo.
  const [planoDeSeparador, setPlanoDeSeparador] = useState<'auto' | 'piel' | 'musculo'>('auto')
  // Los separadores de mano se ponen de a dos, uno por borde (P-003 E3), como las pinzas. Encendido por omisión.
  const [separadoresEnPareja, setSeparadoresEnPareja] = useState(true)
  // Pinzas y separadores se corren tras el bisturí al terminar un corte (P-003 E3). Apagado por omisión.
  const [acompanarAlBisturi, setAcompanarAlBisturi] = useState(false)
  // La disección roma en curso: en qué plano, cuántas veces se separó y si la punta está apoyada.
  const [diseccion, setDiseccion] = useState<EstadoDeLaDiseccion | null>(null)
  const lienzoDeFluoroscopia = useRef<HTMLCanvasElement>(null)
  /** Cuándo se avisó por última vez de que falta colocar el separador: la rueda gira diez veces seguidas y no hay que repetirlo. */
  const avisoDelSeparador = useRef(0)
  // Segundos con los rayos encendidos en esta exposición. La dosis es lo que más
  // se descuida al aprender: se cuenta y se dice al apagar.
  const [segundosDeEscopia, setSegundosDeEscopia] = useState(0)
  const [instrumento, setInstrumento] = useState<string | null>(null)
  // Lo que se usó en este recorrido (P-003 E7) y, en el editor, qué filas están marcadas para la bandeja: `null` es «las
  // de lo usado», el valor de partida, y solo se guarda lo que la persona toca.
  const [insumos, setInsumos] = useState<RegistroDeInsumos>({})
  const [marcadasParaLaBandeja, setMarcadasParaLaBandeja] = useState<Set<string> | null>(null)
  // La estructura que se pinchó con «Seleccionar estructura» y lo que se sabe de ella (P-003 E9). El panel solo se ve en ese modo.
  const claveDeLaSesion = editor ? `trauma-sesion:editor::${caso.modeloUrl ?? ''}` : `trauma-sesion:residente:${documentoId}:${caso.modeloUrl ?? ''}`
  const [info, setInfo] = useState<
    | { estado: 'cargando'; nodo: string; nombre: string }
    | { estado: 'ficha'; nodo: string; ficha: FichaParaElSimulador }
    | { estado: 'sinFicha' | 'modeloViejo' | 'error'; nodo: string; nombre: string }
    | null
  >(null)
  const [editandoLaFicha, setEditandoLaFicha] = useState<string | null>(null)
  // El músculo sobre el que se trabaja (P-003 E10): «cortar» solo ese, o «separar» (retraerlo sin cortarlo), con qué
  // instrumentos se ofrece cada cosa y lo que hay retraído ahora.
  const [musculoObjetivo, setMusculoObjetivo] = useState<{ nodo: string; nombre: string; accion: 'cortar' | 'separar'; yaCortadas: number[] } | null>(null)
  const [eligiendoAccion, setEligiendoAccion] = useState<'cortar' | 'separar' | null>(null)
  // El menú de movimiento por ejes (P-004 E7): qué eje eligió el residente para el trozo elegido y para la placa, el nombre del
  // trozo elegido y si se ven las asas de siempre además del menú.
  const [movimientoPorEje, setMovimientoPorEje] = useState<SeleccionDeMovimiento | null>(null)
  const [movimientoDeLaPlaca, setMovimientoDeLaPlaca] = useState<SeleccionDeMovimiento | null>(null)
  const [piezaElegida, setPiezaElegida] = useState<string | null>(null)
  // La broca puesta en el hoyo (P-004 E8): se queda hasta que se la retira, también mientras se pide el disparo.
  const [broca, setBroca] = useState<EstadoDeLaBroca | null>(null)
  // Los tornillos (P-004 E9): el diámetro elegido de la lista (`null`: el del modelo), la trayectoria de dos clics y si se está
  // marcando, qué tiempo de la secuencia brocar · medir · atornillar toca, si el siguiente instrumento pasa solo a la mano y cuál
  // es el último tornillo que se usó (el siguiente tornillo, y la broca que le corresponde, se eligen a partir de él).
  const [diametroDeTornillo, setDiametroDeTornillo] = useState<number | null>(null)
  const [marcandoLaTrayectoria, setMarcandoLaTrayectoria] = useState(false)
  const [trayectoria, setTrayectoria] = useState<EstadoDeLaTrayectoria | null>(null)
  const [etapaDeFijacion, setEtapaDeFijacion] = useState<EtapaDeFijacion>('brocar')
  const [siguienteAutomatico, setSiguienteAutomatico] = useState(true)
  const [siguienteEnLaBandeja, setSiguienteEnLaBandeja] = useState<string | null>(null)
  const [ultimoTornillo, setUltimoTornillo] = useState<string | null>(null)
  const [asasLibres, setAsasLibres] = useState(false)
  const [retracciones, setRetracciones] = useState<{ id: number; nodo: string; nombre: string; aperturaMm: number; maximoMm: number; activa: boolean }[]>([])
  // El instrumento en la mano: qué articulaciones declara su archivo y cuánto
  // las ha movido quien lo usa. Vive aquí y no dentro del visor pequeño porque
  // lo mueven dos cosas a la vez —los deslizadores y la escena— y las dos
  // tienen que ver lo mismo.
  const [articulacionesDeclaradas, setArticulacionesDeclaradas] = useState<ArticulacionDeclarada[]>([])
  const [articulacionesMovidas, setArticulacionesMovidas] = useState<Record<string, number>>({})
  const [errorDelInstrumento, setErrorDelInstrumento] = useState<string | null>(null)
  const [busquedaDeInstrumento, setBusquedaDeInstrumento] = useState('')
  // La categoría de la bandeja que está desplegada. Una sola a la vez: la
  // bandeja se lee como una mesa de instrumentación, de arriba abajo por
  // familias, y con varias abiertas volvía a ser la lista larga de antes.
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null)
  // Cómo apunta la broca respecto de la cortical (D-167): a lo largo del hueso y
  // a lo ancho, en grados. Cero y cero es perpendicular a la cortical.
  const [inclinacionDeBroca, setInclinacionDeBroca] = useState<InclinacionDeBroca>({
    longitudinal: 0,
    transversal: 0,
  })
  // Lo que hay cortado y abierto. Lo avisa el lienzo al cortar, al soltar un
  // separador y al cerrar; durante el arrastre se lee en su etiqueta.
  const [herida, setHerida] = useState<EstadoDeLasHeridas | null>(null)
  // La sutura que se está haciendo: la avisa el lienzo con cada puntada (D-169).
  const [sutura, setSutura] = useState<EstadoDeLaSutura | null>(null)
  // Para decir «herida cerrada» una sola vez por sutura, y no en cada puntada que queda cerrada.
  const heridaCerradaDicha = useRef(false)
  // La placa y los tornillos puestos sobre el hueso, y el largo del tornillo que se pondrá (D-169).
  const [fijacion, setFijacion] = useState<EstadoDeLaFijacion | null>(null)
  const [largoDeTornillo, setLargoDeTornillo] = useState(24)
  // La última perforación y de qué paso era: el paso que evalúa la broca mira la suya, no la de
  // un paso anterior.
  const [ultimaPerforacion, setUltimaPerforacion] = useState<{ paso: string; hecha: PerforacionHecha } | null>(null)
  // Lo que trae el archivo, anotado con el modelo de que salió: se lee una vez,
  // al terminar de cargar, y no en cada pintado.
  const [delArchivo, setDelArchivo] = useState<{ url: string; nodos: string[]; datos: DatosDeNodo[] } | null>(null)
  // Las piezas con que se juega: las que declara el caso, más el papel que el propio modelo da a lo que el caso no
  // declaró (D-176). Sin esto, en una cirugía recién creada —sin «Rellenar desde el modelo»— ninguna pieza era piel ni
  // hueso, y el bisturí, los separadores, las pinzas, la broca y las capas no tenían sobre qué actuar. Lo declarado manda
  // siempre; lo del modelo solo rellena huecos, y solo cuando el archivo que se ve es el del caso.
  const piezas = useMemo(
    () => piezasConLasDelModelo(caso.piezas, delArchivo?.url === caso.modeloUrl ? delArchivo.datos : []),
    [caso.piezas, caso.modeloUrl, delArchivo],
  )
  const [fuerza, setFuerza] = useState(() => fuerzaInicial(caso.pasos[0] ?? {}))
  // La geometría del trazo no sube a React: de ella solo se usa un número, y el
  // lienzo ya es dueño de sus puntos. Guardar la polilínea entera obligaba a
  // repintar la consola —barra, tres paneles, bandeja, lista de pasos y los dos
  // campos ricos del pie— en cada muestra del puntero mientras se arrastra.
  const [largoDelTrazoMm, setLargoDelTrazoMm] = useState(0)
  const [reduccion, setReduccion] = useState(() => medidaInicial(caso))
  const [giros, setGiros] = useState(() => ({
    x: caso.desplazamientoInicial.giroX,
    y: caso.desplazamientoInicial.giroY,
    z: caso.desplazamientoInicial.giroZ,
  }))
  const [puntaje, setPuntaje] = useState(0)
  const [resueltos, setResueltos] = useState<Set<string>>(new Set())
  // Los pasos que se fallaron alguna vez, y aparte los que además llegaron a
  // dañar. Son estos dos y no los resueltos los que deciden lo que vale el
  // acierto (`puntosDelPaso`), y son los únicos que hacen que pasarse y
  // quedarse corto dejen de costar lo mismo: el registro de abajo, que era lo
  // único que los distinguía, se recorta a diez líneas y muere al recargar.
  const [fallados, setFallados] = useState<Set<string>>(new Set())
  // Los pasos en que se eligió la reducción automática (P-004 E7): ahí el ejercicio de reducir no puntúa. La marca del
  // recorrido entero va en una referencia porque `guardarRecorrido` la lee en el momento en que se llama.
  const [automaticas, setAutomaticas] = useState<Set<string>>(new Set())
  const usoLaReduccionAutomatica = useRef(false)
  // La radiografía postoperatoria (P-004 E11): la invitación al terminar, el panel abierto u omitida. Los datos escritos van
  // en una referencia por lo mismo que la marca de arriba: `guardarRecorrido` los lee en el momento en que se llama.
  const [radiografiaPost, setRadiografiaPost] = useState<'invitacion' | 'abierta' | 'omitida'>('invitacion')
  const radiografiaDelRecorrido = useRef<DatosDeLaLamina | null>(null)
  const animacionDeLaReduccion = useRef<number | null>(null)
  const [complicados, setComplicados] = useState<Set<string>>(new Set())
  /**
   * Las complicaciones de **este** recorrido, en el orden en que ocurrieron.
   *
   * Una fila por gesto que dañó y no una por paso, a diferencia de
   * `complicados`: aquel decide lo que se cobra y por eso es un conjunto —el
   * segundo tropiezo del mismo paso no empeora nada (`puntosDelPaso`)—, y esta
   * es el registro que se guarda, donde insistir tres veces en el mismo gesto
   * son tres veces que hubo daño y eso es lo que el profesor necesita ver.
   *
   * Empieza vacía aunque haya recorrido guardado: `recorridoGuardado` es lo
   * que pasó la vez anterior y se enseña aparte. Meterlo aquí lo mandaría de
   * vuelta al servidor mezclado con lo de ahora, duplicando cada complicación
   * en cada visita.
   */
  const [complicaciones, setComplicaciones] = useState<ComplicacionDelCaso[]>([])
  const [registro, setRegistro] = useState<Anotacion[]>([])
  const [resultado, setResultado] = useState<Anotacion | null>(null)
  // Se arranca con **todo encendido** (D-171). Antes se empezaba con la piel y el músculo apagados porque el
  // modo «mover» solo agarraba el fragmento si el rayo lo golpeaba a él, y con la piel delante golpeaba la piel.
  // Ya no hace falta: «Mover» busca entre los huesos, atraviese lo que atraviese. Y a quien corta la piel le
  // estorbaba más: había que encender la capa antes de poder cortar, con un aviso para explicarlo. Si un paso
  // necesita ver el hueso, lo declara con `muestra` y al entrar los interruptores quedan como el paso pide
  // (`capasAlEntrarEnPaso`); y siempre se puede apagar una capa o usar «Rayos X».
  const [capasApagadas, setCapasApagadas] = useState<Set<string>>(() => new Set())
  /**
   * Las capas que el residente encendió a mano en este paso. Enseñan todas sus piezas aunque el paso declare
   * ver solo algunas: el interruptor manda sobre lo que el paso propone (D-171). Se vacía al cambiar de paso,
   * que es cuando el paso vuelve a proponer.
   */
  const capasForzadas = useRef<Set<string>>(new Set())
  /** Lo último que se dijo de la tensión del hilo, para no repetirlo con cada vuelta de la rueda. */
  const juicioDeTensionDicho = useRef<string | null>(null)

  const paso = caso.pasos[indice]
  const terminado = indice >= caso.pasos.length
  const maximo = useMemo(() => puntajeMaximo(caso.pasos), [caso.pasos])

  // La escala, una sola vez y con su guarda. Quien de verdad la garantiza es
  // `escalaPositiva` en `casoQuirurgico.ts`, que ya convierte el cero y el
  // negativo en 1000 antes de mandar el caso: esto es el último cerrojo, y se
  // deja porque lo que hay al otro lado no es un número raro sino un caso
  // imposible —con escala 0 la incisión mide 0 mm siempre y el paso de trazo no
  // se puede superar, sin nada en pantalla que lo explique—.
  const escalaMm = caso.milimetrosPorUnidad || 1000

  /**
   * Lo que el motor va a medir en este paso.
   *
   * Se pregunta con `objetivoDelPaso` en vez de leer `paso.objetivo` a pelo,
   * que es lo que hacían los tres mandos de abajo: `evaluarGesto` decide con
   * esa función, así que preguntando los dos a la misma no hay forma de que la
   * consola pinte un control y el motor evalúe otro —un paso antiguo con su
   * rango de fuerza guardado y el objetivo en «instrumento» se medía por la
   * fuerza sin enseñar el deslizador con que graduarla, y como `fuerzaInicial`
   * cae dentro del rango por construcción, se aprobaba solo—. El servidor ya
   * manda el objetivo deducido (`casoQuirurgico.ts`), pero eso es una promesa
   * de quien llama; esto es lo que no depende de ella.
   */
  const objetivo = paso ? objetivoDelPaso(paso) : null
  const modoDelPaso = objetivo ? MODO_DEL_OBJETIVO[objetivo] : null
  const topes = paso ? topesDeReduccion(paso) : null

  /**
   * Deja constancia de algo: en el pie y junto al botón.
   *
   * Las dos cosas, y no solo el pie. El registro se pinta debajo del lienzo, de
   * las medidas y de la franja de pasos, a unos 600 px del borde superior de la
   * consola, o sea fuera de pantalla en el portátil modesto que este módulo
   * toma por equipo de referencia. Y un gesto que falla no cambia nada más en
   * la pantalla: sin esta copia, el residente pulsa «Aplicar paso», no ve pasar
   * nada y vuelve a pulsar.
   */
  const anotar = useCallback((texto: string, clase: Anotacion['clase']) => {
    setRegistro((previo) => [{ texto, clase }, ...previo].slice(0, 10))
    setResultado({ texto, clase })
  }, [])

  // ------------------------------------------------------- guardar lo hecho
  /**
   * Una escritura a la vez, y siempre la última.
   *
   * Dos gestos seguidos son dos llamadas, y la fila es una: llegan por HTTP y
   * nada garantiza el orden, así que la del paso 3 podía aterrizar después de
   * la del paso 4 y dejar guardado el puntaje de antes. Con esto, mientras haya
   * una en vuelo la siguiente se queda en `porMandar` —pisando a la que hubiera
   * esperando, que ya no interesa— y sale cuando la anterior vuelve.
   */
  const enVuelo = useRef(false)
  const porMandar = useRef<ResultadoDeCirugia | null>(null)
  /** Lo último que se llegó a mandar, para no repetir una escritura idéntica. */
  const ultimoMandado = useRef<string | null>(null)

  /**
   * Manda el recorrido al servidor.
   *
   * **Cuándo se llama es la decisión, y está tomada aquí:** en cada *hito*, que
   * es un paso superado o una complicación. No en cada gesto —eso es una
   * escritura por clic, y pulsar «Aplicar paso» sin instrumento no cambia nada
   * que guardar— y no solo al terminar, que pierde entero al que cierra la
   * pestaña a mitad, que es precisamente el caso corriente en un módulo que se
   * recorre entre dos turnos. Un caso de diez pasos son unas diez escrituras
   * repartidas en la media hora que se tarda en recorrerlo.
   *
   * No se intenta nada al cerrar la pestaña: `beforeunload` no es sitio para
   * una acción de servidor —el navegador corta la petición— y prometerlo sería
   * peor que no tenerlo. Lo que se pierde con esta política es, como mucho, lo
   * hecho desde el último paso superado.
   *
   * Se le pasan los valores en vez de leerlos del estado porque a quien llama
   * le acaban de cambiar: `setPuntaje` no actualiza `puntaje` hasta el
   * repintado, así que leerlo aquí guardaría siempre el del hito anterior.
   */
  const guardarRecorrido = useCallback(
    (puntajeActual: number, lista: ComplicacionDelCaso[], usados: RegistroDeInsumos) => {
      // El editor ensaya: lo que ocurre aquí no es el recorrido de nadie.
      if (editor) return
      const datos: ResultadoDeCirugia = {
        puntaje: puntajeActual,
        puntajeMaximo: maximo,
        complicaciones: lista,
        // Lo usado hasta este hito, que es lo que «queda para los estudiantes» al terminar (P-004 E3). Se pasa y no se
        // lee del estado, por lo mismo que el puntaje: a quien llama le acaban de cambiar.
        insumos: resumenDeInsumos(
          usados,
          CATEGORIAS_DE_INSTRUMENTAL.map((cat) => cat.value as string),
        ),
        reduccionAutomatica: usoLaReduccionAutomatica.current,
        // `null` borra la del recorrido anterior: la fila describe el último recorrido (P-004 E11).
        radiografia: radiografiaDelRecorrido.current,
      }
      const huella = JSON.stringify(datos)
      if (huella === ultimoMandado.current) return
      ultimoMandado.current = huella
      porMandar.current = datos
      if (enVuelo.current) return
      enVuelo.current = true

      void (async () => {
        try {
          let siguiente = porMandar.current
          while (siguiente) {
            // Se vacía **antes** de mandar: lo que llegue mientras esta viaja
            // tiene que quedarse esperando, no perderse.
            porMandar.current = null
            await registrarResultadoDeCirugia(documentoId, siguiente)
            siguiente = porMandar.current
          }
        } catch (error) {
          console.error('[consola] no se pudo guardar el recorrido:', error)
          // Se olvida lo mandado para que el próximo hito vuelva a intentarlo
          // con el recorrido entero; si no, una escritura fallida dejaría el
          // resto del caso creyendo que ya está guardado.
          ultimoMandado.current = null
          porMandar.current = null
          // Y se dice. El marcador de arriba seguirá subiendo, así que callar
          // aquí es dejar al residente terminando un caso que no se guardó.
          anotar(
            'Su progreso no se pudo guardar en este momento. Siga con el caso: se reintenta en el paso siguiente.',
            'atencion',
          )
        } finally {
          enVuelo.current = false
        }
      })()
    },
    [documentoId, maximo, anotar, editor],
  )

  // ------------------------------------------------- terminar es haberlo leído
  const [lecturaAlTerminar, setLecturaAlTerminar] = useState<LecturaAlTerminar>('pendiente')

  /**
   * Da el caso por leído al llegar al final.
   *
   * **Con `marcarComoLeida`, la misma acción que la casilla de las demás
   * fichas, y no con otra escritura.** Hasta aquí terminar un caso no lo
   * marcaba: se guardaban el puntaje y las complicaciones, pero `completado`
   * solo lo ponía la casilla, así que un caso operado entero seguía contando
   * como «por leer» en la portada. Para el traumatólogo, recorrer el caso hasta
   * el final es haberlo estudiado —la ficha de un caso quirúrgico es la
   * consola—, tenga o no complicaciones por el camino: esas no se pierden, se
   * quedan en «Su recorrido anterior» y en la portada.
   *
   * Solo pone, nunca quita. Si el residente la desmarca después a mano, esa
   * decisión es suya y la consola no vuelve a tocarla hasta que termine el caso
   * otra vez.
   *
   * Aparte de `guardarRecorrido` y no dentro de su cola. Aquella ordena
   * escrituras del mismo campo, donde la vieja puede pisar a la nueva; esta
   * escribe `completado` y nada más, y Payload actualiza solo los campos que
   * recibe —la lista `complicaciones` no se toca si no viaja—, así que las dos
   * pueden cruzarse sin borrarse nada. Si las dos llegan a crear la fila a la
   * vez, el choque con el índice único lo resuelve `anotar`.
   *
   * El fallo se dice en vez de tragarse, igual que en `guardarRecorrido`: el
   * panel de «Caso terminado» afirmaría que el caso cuenta como leído.
   */
  const marcarCasoComoLeido = useCallback(() => {
    if (editor) return
    setLecturaAlTerminar('pendiente')
    void (async () => {
      try {
        await marcarComoLeida('cirugias', documentoId, true)
        setLecturaAlTerminar('marcada')
        alMarcarComoLeido()
      } catch (error) {
        console.error('[consola] no se pudo marcar el caso como leído:', error)
        setLecturaAlTerminar('fallida')
        anotar(
          'El caso no se pudo marcar como leído. Márquelo con la casilla de arriba de la página.',
          'atencion',
        )
      }
    })()
  }, [documentoId, alMarcarComoLeido, anotar, editor])

  // Los avisos de «el caso habla de otro archivo» se dan una vez por modelo: se
  // repiten en cada paso y cada capa, y diez veces el mismo renglón tapan el
  // registro. Se olvidan al cambiar de modelo.
  const avisosDelModelo = useRef<{ url: string; dados: Set<string> }>({ url: '', dados: new Set() })
  const avisarUnaVez = useCallback(
    (clave: string, texto: string) => {
      if (avisosDelModelo.current.url !== caso.modeloUrl) {
        avisosDelModelo.current = { url: caso.modeloUrl ?? '', dados: new Set() }
      }
      if (avisosDelModelo.current.dados.has(clave)) return
      avisosDelModelo.current.dados.add(clave)
      anotar(texto, 'atencion')
    },
    [caso.modeloUrl, anotar],
  )

  const refrescarVisibles = useCallback(
    (indicePaso: number, apagadas: Set<string>) => {
      const { nodos, encender } = visibilidadDelPaso(caso.pasos, piezas, indicePaso, apagadas, capasForzadas.current)
      const mostrado = mando.current?.mostrar(nodos)
      // El caso nombra piezas que el archivo no tiene. Se enseña el modelo
      // entero —el lienzo ya lo decidió— y se dice, con la causa y la salida:
      // antes esto era un lienzo en negro sin una palabra (O-078).
      if (mostrado?.sinCoincidencias) {
        avisarUnaVez(
          'sin-coincidencias',
          mostrado.porPapel
            ? `Las piezas que declara este caso (${mostrado.ausentes.length}) son de otro archivo, así que se muestran las del modelo cargado por su papel: piel, músculo, hueso. ` +
                'Para dejarlo fijo, en «Piezas» del editor, «Rellenar desde el modelo».'
            : `Ninguna de las piezas que declara este caso está en el modelo cargado (faltan ${mostrado.ausentes.length}), así que se muestra el modelo entero. ` +
                'Suele pasar al volver a exportar el hueso con otros nombres: en «Piezas del modelo» del editor, «Rellenar desde el modelo» lo arregla.',
        )
      }
      if (encender.length === 0) return
      // Hubo que aplicar el suelo. La casilla tiene que decir la verdad de lo
      // que se ve, y el residente tiene que saber por qué se le ha encendido
      // algo que él apagó.
      setCapasApagadas((previas) => {
        const siguientes = new Set(previas)
        for (const rol of encender) siguientes.delete(rol)
        return siguientes
      })
      anotar(`Se vuelve a mostrar ${capasEnProsa(encender)}: sin eso el lienzo se quedaba vacío.`, 'atencion')
    },
    [caso.pasos, piezas, anotar, avisarUnaVez],
  )

  /** Entra en un paso: pone las capas que ese paso necesita y refresca el lienzo. */
  const entrarEnPaso = useCallback(
    (indicePaso: number, apagadas: Set<string>) => {
      // Cada paso vuelve a proponer lo suyo: lo que el residente forzó en el anterior se olvida.
      capasForzadas.current = new Set()
      // Los interruptores quedan diciendo lo que el paso enseña (no se quedan encendidos los de una capa
      // que el paso no muestra) y el residente puede volver a encender lo que quiera.
      const siguientes = capasAlEntrarEnPaso(caso.pasos, piezas, indicePaso, apagadas)
      const cambio = siguientes.size !== apagadas.size || [...siguientes].some((rol) => !apagadas.has(rol))
      if (cambio) setCapasApagadas(siguientes)
      refrescarVisibles(indicePaso, siguientes)
    },
    [caso.pasos, piezas, refrescarVisibles],
  )

  const alternarCapa = (rol: string) => {
    const siguientes = new Set(capasApagadas)
    if (siguientes.has(rol)) {
      siguientes.delete(rol)
      capasForzadas.current.add(rol)
    } else {
      siguientes.add(rol)
      capasForzadas.current.delete(rol)
    }
    setCapasApagadas(siguientes)
    refrescarVisibles(indice, siguientes)
  }

  // Si las piezas o lo que cada paso muestra cambian con el modelo ya abierto —en el editor, al «Rellenar
  // desde el modelo» o al escribir un paso—, el lienzo se vuelve a ordenar. Antes solo se ordenaba al cargar el
  // archivo y al cambiar de paso: el editor rellenaba las piezas y el lienzo seguía enseñando la piel con el
  // interruptor de la piel apagado, hasta que alguien lo tocaba.
  const firmaDeLoVisible = useMemo(
    () => JSON.stringify([piezas.map((p) => [p.nodo, p.rol]), caso.pasos.map((p) => p.muestra ?? [])]),
    [piezas, caso.pasos],
  )
  const modeloAbierto = delArchivo?.url === caso.modeloUrl
  // Lo que el efecto de abajo lee «en el momento», sin que cambiarlo lo dispare: solo lo dispara cambiar lo
  // que se ve. Se actualiza en un efecto y no durante el pintado, que es donde React no deja escribir refs.
  const alRefrescar = useRef({ refrescarVisibles, indice, capasApagadas })
  useEffect(() => {
    alRefrescar.current = { refrescarVisibles, indice, capasApagadas }
  })
  // El músculo elegido sobrevive a recargar, junto con lo demás de la sesión (P-003 E10.4). Va en su propia clave, al
  // lado de la del lienzo, porque es del estado de la consola y no de la escena.
  const claveDelObjetivo = `${claveDeLaSesion}:objetivo`
  useEffect(() => {
    try {
      const crudo = sessionStorage.getItem(claveDelObjetivo)
      const g = crudo ? (JSON.parse(crudo) as { nodo?: unknown; nombre?: unknown; accion?: unknown; yaCortadas?: unknown }) : null
      if (g && typeof g.nodo === 'string' && typeof g.nombre === 'string' && (g.accion === 'cortar' || g.accion === 'separar')) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMusculoObjetivo({ nodo: g.nodo, nombre: g.nombre, accion: g.accion, yaCortadas: Array.isArray(g.yaCortadas) ? g.yaCortadas.filter((x): x is number => typeof x === 'number') : [] })
      }
    } catch {
      // Sin almacenamiento el objetivo simplemente no se recuerda.
    }
  }, [claveDelObjetivo])
  useEffect(() => {
    try {
      if (musculoObjetivo) sessionStorage.setItem(claveDelObjetivo, JSON.stringify(musculoObjetivo))
      else sessionStorage.removeItem(claveDelObjetivo)
    } catch {
      // idem
    }
  }, [musculoObjetivo, claveDelObjetivo])
  // Fuera del modo «Seleccionar estructura» no queda ningún tinte puesto (P-003 E9).
  useEffect(() => {
    if (modo !== 'info') mando.current?.resaltarNodo(null)
  }, [modo])
  useEffect(() => {
    if (!modeloAbierto) return
    const { refrescarVisibles: refrescar, indice: paso, capasApagadas: apagadas } = alRefrescar.current
    refrescar(paso, apagadas)
  }, [firmaDeLoVisible, modeloAbierto])

  // ------------------------------------------------------------- aplicar
  function aplicarPaso() {
    if (!paso) return

    const evaluacion = evaluarGesto(paso, {
      instrumento,
      instrumentoNombre: instrumentoElegido?.nombre ?? null,
      trazo: largoDelTrazoMm,
      desplazamiento: reduccion.desplazamiento,
      diastasis: reduccion.diastasis,
      angulacion: reduccion.angulacion,
      fuerza,
      perforacion:
        ultimaPerforacion && ultimaPerforacion.paso === paso.id
          ? {
              diametroMm: ultimaPerforacion.hecha.diametroMm,
              anguloConElEje: ultimaPerforacion.hecha.anguloConElEje,
              bicortical: ultimaPerforacion.hecha.bicortical,
              sePasoMm: ultimaPerforacion.hecha.sePasoMm,
            }
          : undefined,
      fijacion: resumenDeLaFijacion(fijacion),
      plano: {
        nodo: musculoObjetivo?.nodo ?? null,
        accion: musculoObjetivo?.accion ?? null,
        // Se cortó con ese músculo elegido: hay una incisión muscular que no estaba al elegirlo.
        cortado:
          musculoObjetivo?.accion === 'cortar' &&
          (herida?.incisiones ?? []).some((x) => x.capa === 'musculo' && !musculoObjetivo.yaCortadas.includes(x.id)),
        retraidoMm: retracciones.find((r) => r.nodo === musculoObjetivo?.nodo)?.aperturaMm ?? 0,
      },
    })

    const clase: Anotacion['clase'] =
      evaluacion.resultado === RESULTADOS.CORRECTO
        ? 'bien'
        : evaluacion.complicacion
          ? 'grave'
          : 'atencion'
    anotar(`${indice + 1}. ${evaluacion.mensaje}`, clase)

    // En el editor «Aplicar paso» es un ensayo: dice qué resultado tendría el
    // gesto —con las tolerancias que el autor acaba de escribir— y se queda
    // ahí. No puntúa, no avanza y no guarda nada.
    if (editor) {
      if (evaluacion.avanza) anotar('Con este gesto el paso se daría por bueno.', 'bien')
      return
    }

    if (!evaluacion.avanza) {
      // La cuenta se lleva aquí, en el fallo, y no en el acierto: un paso se
      // acierta una sola vez y detrás se avanza, así que preguntar «¿ya estaba
      // resuelto?» antes de sumar era una guarda que no distinguía a nadie.
      //
      // El que daña se apunta aparte del que se queda corto, porque no vale lo
      // mismo: `puntosDelPaso` le cobra el paso entero. Sin estos dos conjuntos
      // la diferencia solo existía en la frase del registro.
      //
      // Pulsar sin instrumento no cuenta en ninguno de los dos. Ahí la consola
      // se para antes de evaluar nada —no llegó a tocarse al paciente— y ese
      // aviso es el que explica el botón que antes estaba gris y mudo:
      // cobrárselo sería cobrar por leer la instrucción.
      const anotarEn = (poner: typeof setFallados) =>
        poner((previos) => (previos.has(paso.id) ? previos : new Set(previos).add(paso.id)))
      if (evaluacion.complicacion) {
        anotarEn(setComplicados)
        // La complicación es el otro hito que se guarda, y el que más importa
        // de los dos: el puntaje se puede volver a ganar repitiendo el caso, y
        // esto es lo que el residente repasa después y lo que el profesor mira
        // para saber dónde se atasca su gente.
        //
        // Se guarda el mensaje entero de `evaluarGesto` porque es lo único que
        // dice *cuánto* se pasó —«(24.5 mm · se esperan 8–15 mm)»—; el desenlace
        // solo dice por dónde.
        const nueva: ComplicacionDelCaso = {
          paso: paso.id,
          numero: indice + 1,
          titulo: paso.titulo ?? null,
          resultado: evaluacion.resultado,
          detalle: evaluacion.mensaje,
        }
        // Por el final: si alguna vez se llega al tope, lo que hace falta
        // conservar es lo último que pasó, no lo primero.
        const nuevas = [...complicaciones, nueva].slice(-MAXIMO_DE_COMPLICACIONES)
        setComplicaciones(nuevas)
        guardarRecorrido(puntaje, nuevas, insumos)
      } else if (evaluacion.resultado !== RESULTADOS.SIN_INSTRUMENTO) anotarEn(setFallados)
      return
    }

    // El motor no tiene memoria: evalúa un gesto suelto y entrega siempre el
    // valor entero del paso. Quién lo cobra y cuánto lo decide `puntosDelPaso`,
    // que es una función pura del motor y no una regla escondida en la
    // interfaz: la política de puntuación tiene prueba propia, y la consola
    // solo aporta lo único que ella sabe, que es lo que pasó antes en este
    // mismo paso.
    const puntos = puntosDelPaso(paso, {
      fallo: fallados.has(paso.id),
      complicacion: complicados.has(paso.id),
      reduccionAutomatica: automaticas.has(paso.id),
    })
    let puntajeTrasElPaso = puntaje
    if (!resueltos.has(paso.id)) {
      puntajeTrasElPaso = puntaje + puntos
      setPuntaje(puntajeTrasElPaso)
      setResueltos((previos) => new Set(previos).add(paso.id))
    }
    // El otro hito: un paso superado. Se guarda también cuando el paso no
    // sumó nada —tras una complicación vale cero (`puntosDelPaso`)— porque el
    // recorrido avanzó igual; lo que evita la escritura de más es
    // `guardarRecorrido`, que descarta la que sería idéntica a la anterior.
    // El marcador final no necesita nada aparte: el último paso es un hito como
    // los demás y lo deja guardado.
    guardarRecorrido(puntajeTrasElPaso, complicaciones, insumos)

    const siguiente = indice + 1
    // La lectura sí: es otro campo y otra acción (`marcarCasoComoLeido`). Se
    // pregunta con la misma cuenta que pinta «Caso terminado» (`terminado`),
    // para que no haya un final que se enseñe y no se marque, ni al revés.
    if (siguiente >= caso.pasos.length) marcarCasoComoLeido()
    setIndice(siguiente)
    elegirInstrumento(null)
    // `borrarTrazo` avisa por su cuenta con la lista vacía, y ese aviso es el
    // que pone la medida a cero: no hay que tocarla también desde aquí.
    mando.current?.borrarTrazo()
    const pasoSiguiente = caso.pasos[siguiente]
    if (pasoSiguiente) {
      setFuerza(fuerzaInicial(pasoSiguiente))
      setModo(MODO_DEL_OBJETIVO[objetivoDelPaso(pasoSiguiente)])
    }
    entrarEnPaso(siguiente, capasApagadas)
  }

  async function reiniciar() {
    // El único botón destructivo de la consola está a ocho píxeles del marcador
    // y tiene el mismo aspecto que «Encuadrar» y «Borrar trazo», que no borran
    // nada. Quien va a mirar los puntos y pulsa el de al lado pierde el caso
    // entero y, con él, las correcciones que había recibido por el camino, que
    // son justo lo que repasaría después. Se cuenta lo que se pierde antes de
    // borrarlo.
    const sePierde = [
      puntaje > 0 ? `${puntaje} ${puntaje === 1 ? 'punto' : 'puntos'}` : null,
      registro.length > 0
        ? `${registro.length} ${registro.length === 1 ? 'anotación' : 'anotaciones'}`
        : null,
    ]
      .filter(Boolean)
      .join(' y ')
    // Con el diálogo propio y no con `confirm()`: el del navegador decía
    // «Aceptar» sin decir qué se aceptaba, salía con el nombre del dominio por
    // título y en el móvil tapaba la consola entera. El foco empieza en
    // «Cancelar» (`peligro`), así que un Intro apresurado no borra nada.
    if (
      sePierde &&
      !(await confirmar({
        titulo: '¿Reiniciar el caso?',
        mensaje: `Se borrarán ${sePierde} de este recorrido. Lo que quedó guardado de la vez anterior no se toca.`,
        confirmar: 'Reiniciar el caso',
        peligro: true,
      }))
    )
      return

    setIndice(0)
    setInsumos({})
    setMarcadasParaLaBandeja(null)
    setMusculoObjetivo(null)
    setEligiendoAccion(null)
    setModo(MODO_DEL_OBJETIVO[objetivoDelPaso(caso.pasos[0] ?? {})])
    elegirInstrumento(null)
    setFuerza(fuerzaInicial(caso.pasos[0] ?? {}))
    setPuntaje(0)
    setResueltos(new Set())
    setFallados(new Set())
    setComplicados(new Set())
    setAutomaticas(new Set())
    usoLaReduccionAutomatica.current = false
    radiografiaDelRecorrido.current = null
    setRadiografiaPost('invitacion')
    // Lo guardado **no** se borra aquí, y es a propósito: este botón está a
    // ocho píxeles del marcador y se pulsa sin querer. Vaciar la fila dejaría
    // al residente sin el registro de complicaciones del recorrido que acaba de
    // hacer, que es justo lo que iba a repasar, y esta vez sin vuelta atrás. Lo
    // sustituye el primer hito del recorrido nuevo: la lista que se manda es la
    // entera y reemplaza a la anterior.
    setComplicaciones([])
    setRegistro([])
    setResultado(null)
    mando.current?.borrarTrazo()
    // Reiniciar el caso también cierra lo cortado y quita los agujeros.
    setUltimaPerforacion(null)
    mando.current?.quitarSutura()
    mando.current?.quitarImplantes(true)
    mando.current?.soltarPellizco()
    mando.current?.cerrarHeridas()
    mando.current?.borrarAgujeros()
    setDiseccion(null)
    colocarEnDesplazamientoInicial()
    entrarEnPaso(0, capasApagadas)
  }

  /**
   * Vuelve a medir preguntándole al lienzo dónde está el fragmento.
   *
   * Se pregunta y no se lleva la cuenta aparte: el fragmento lo mueve el ratón
   * dentro del lienzo y lo giran los controles de aquí, y dos contabilidades
   * paralelas de lo mismo acaban discrepando. La verdad está en la escena.
   */
  const recalcularMedidas = useCallback(() => {
    const estado = mando.current?.estadoDelFragmento()
    if (!estado) return
    const aMm = (u: number) => u * escalaMm
    setReduccion(
      medirReduccion(
        { x: aMm(estado.posicion.x), y: aMm(estado.posicion.y), z: aMm(estado.posicion.z) },
        estado.giros,
        caso.ejeLargo,
      ),
    )
    setGiros(estado.giros)
  }, [escalaMm, caso.ejeLargo])

  /**
   * La reducción automática (P-004 E7, pedido 6 de Cristóbal): lleva el fragmento de donde esté a su sitio, con una curva
   * suave en 600 ms, y deja en cero el desplazamiento, la angulación y la diástasis. Es para no entramparse en la reducción
   * cuando el objetivo docente es otro; se anota en el recorrido y **el ejercicio de reducir no puntúa**, para que no valga
   * lo mismo que hacerlo a mano.
   */
  const reducirAutomaticamente = () => {
    const m = mando.current
    if (!m || !m.hayFragmento()) {
      anotar('Este caso no tiene un fragmento que reducir.', 'atencion')
      return
    }
    if (animacionDeLaReduccion.current !== null) cancelAnimationFrame(animacionDeLaReduccion.current)
    const desde = m.estadoDelFragmento()
    const pasoDeAhora = caso.pasos[indice]
    const inicio = performance.now()
    const cuadro = (ahora: number) => {
      const k = Math.min(1, (ahora - inicio) / DURACION_DE_LA_REDUCCION_MS)
      const suave = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      const resta = 1 - suave
      m.colocarFragmento(
        { x: desde.posicion.x * resta, y: desde.posicion.y * resta, z: desde.posicion.z * resta },
        { x: desde.giros.x * resta, y: desde.giros.y * resta, z: desde.giros.z * resta },
      )
      if (k < 1) {
        animacionDeLaReduccion.current = requestAnimationFrame(cuadro)
        return
      }
      animacionDeLaReduccion.current = null
      // Los otros trozos que se movieron con «Mover» vuelven también a su sitio, como en «volver al inicial».
      m.restaurarPiezas()
      recalcularMedidas()
      if (pasoDeAhora) setAutomaticas((antes) => new Set(antes).add(pasoDeAhora.id))
      usoLaReduccionAutomatica.current = true
      anotar('Reducción automática: el desplazamiento, la angulación y la diástasis quedaron en cero. El paso de reducir se da por hecho y no suma puntos.', 'atencion')
      guardarRecorrido(puntaje, complicaciones, insumos)
    }
    animacionDeLaReduccion.current = requestAnimationFrame(cuadro)
  }
  useEffect(
    () => () => {
      if (animacionDeLaReduccion.current !== null) cancelAnimationFrame(animacionDeLaReduccion.current)
    },
    [],
  )

  /** Deja el fragmento donde empieza el caso: desplazado, sin reducir. */
  const colocarEnDesplazamientoInicial = useCallback(() => {
    // Los otros trozos de hueso que se movieron con «Mover» vuelven también a su sitio.
    mando.current?.restaurarPiezas()
    const d = caso.desplazamientoInicial
    const aUnidades = (mm: number) => mm / escalaMm
    mando.current?.colocarFragmento(
      { x: aUnidades(d.x), y: aUnidades(d.y), z: aUnidades(d.z) },
      { x: d.giroX, y: d.giroY, z: d.giroZ },
    )
    // Sin fragmento en el modelo no hay nada que desplazar, y las medidas no
    // pueden fingir lo contrario: con piezas que el archivo no tiene, el panel
    // enseñaba el desplazamiento del caso —3 mm, 12°— sobre un hueso que no se
    // movía, y el paso de reducción se podía fallar sin poder acertar (O-078).
    if (mando.current && !mando.current.hayFragmento()) {
      setGiros({ x: 0, y: 0, z: 0 })
      setReduccion(medirReduccion({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, caso.ejeLargo))
      return
    }
    setGiros({ x: d.giroX, y: d.giroY, z: d.giroZ })
    setReduccion(medidaInicial(caso))
  }, [caso, escalaMm])

  /**
   * Salta a un paso cualquiera, solo en el editor.
   *
   * Hace lo mismo que `aplicarPaso` al entrar en el paso siguiente —modo del
   * ratón, fuerza, trazo, capas—, y no más: el editor mira un paso, no lo
   * resuelve.
   */
  const irAlPaso = (destino: number) => {
    const siguiente = caso.pasos[destino]
    if (!siguiente || !editor) return
    editor.alCambiarIndice(destino)
    setFuerza(fuerzaInicial(siguiente))
    setModo(MODO_DEL_OBJETIVO[objetivoDelPaso(siguiente)])
    setResultado(null)
    mando.current?.borrarTrazo()
    entrarEnPaso(destino, capasApagadas)
  }

  /** Coge un instrumento: aparece en la escena y sus articulaciones vuelven a como las dejó el taller. */
  const elegirInstrumento = (id: string | null) => {
    // Un separador o una broca llevan su modo; al soltarlos se vuelve al de
    // siempre. El modo de un paso (trazar, mover) no se toca: lo pide el paso.
    const destino = id ? caso.instrumental.find((i) => i.id === id) : null
    const que = destino ? comportamientoDelInstrumento(destino) : null
    // Al coger un instrumento se pasa solo al modo que ese instrumento usa: el bisturí, las tijeras y el
    // electrobisturí, a «Trazar»; el separador, a «Separar»; la pinza de disección, a «Pinzar»… Era lo que
    // se pedía: que el residente no tenga que acordarse de cambiar de modo después de coger la herramienta.
    // La Metzenbaum se usa de dos maneras: cortando o en disección roma; se recuerda la última que se eligió.
    if (que?.roma && usoDeLaTijera === 'roma') setModo('disecar')
    else if (que?.corta) setModo('trazar')
    else if (que?.separa) setModo('separar')
    else if (que?.pellizca) setModo('pinzar')
    else if (que?.reduce) setModo('reducir')
    else if (que?.perfora) setModo('perforar')
    else if (que?.sutura) setModo('coser')
    else if (que?.coloca || que?.mide) setModo('fijar')
    else if (que?.modela) setModo('modelar')
    else if (modo === 'modelar' || modo === 'separar' || modo === 'pinzar' || modo === 'perforar' || modo === 'coser' || modo === 'fijar' || modo === 'disecar' || modo === 'reducir') setModo('orbitar')
    // Cada instrumento empieza con el diámetro de su modelo, y un tornillo queda como «el último» para elegir el siguiente (P-004 E9).
    setDiametroDeTornillo(null)
    if (que?.coloca?.tipo === 'tornillo' && id) setUltimoTornillo(id)
    // El tornillo se ofrece con el largo que el editor le escribió al instrumento (P-004 E6); el residente puede escribir otro.
    if (destino?.largoMm && que?.coloca?.tipo === 'tornillo') setLargoDeTornillo(Math.min(MAXIMO_DEL_TORNILLO_MM, Math.max(MINIMO_DEL_TORNILLO_MM, destino.largoMm)))
    setDiseccion(null)
    setInstrumento(id)
    setArticulacionesDeclaradas([])
    setArticulacionesMovidas({})
    setErrorDelInstrumento(null)
  }

  // El ensayo del editor sobrevive a que la consola se vuelva a montar (ver `ensayoDelEditor.ts`): el
  // instrumento en la mano y el modo. Se recupera cuando la bandeja ya lo trae —el catálogo llega después de
  // montar—, y solo entonces se empieza a guardar, para no pisar lo recordado con los valores de partida.
  const claveDelEnsayo = editor ? claveDeLaConsolaDelEditor(caso.modeloUrl ?? '') : null
  const ensayoRecuperado = useRef(false)
  const recuperarElEnsayo = useRef<() => void>(() => {})
  useEffect(() => {
    recuperarElEnsayo.current = () => {
      if (!claveDelEnsayo || ensayoRecuperado.current) return
      const guardado = leerEnsayoDeLaConsola(claveDelEnsayo)
      if (!guardado) {
        ensayoRecuperado.current = true
        return
      }
      const catalogoCargado = (caso.catalogoDelEditor?.length ?? 0) > 0
      const estaEnLaBandeja = guardado.instrumento ? caso.instrumental.some((i) => i.id === guardado.instrumento) : true
      // Todavía no llegó el catálogo: se espera. Si ya llegó y el instrumento ya no está en la bandeja, se deja.
      if (!estaEnLaBandeja && !catalogoCargado) return
      ensayoRecuperado.current = true
      setTipoDeTrazo(guardado.tipoDeTrazo)
      setModoElectro(guardado.modoElectro)
      setPotenciaW(limitarPotencia(guardado.potenciaW))
      if (guardado.instrumento && estaEnLaBandeja) elegirInstrumento(guardado.instrumento)
      if (guardado.modo) setModo(guardado.modo as Modo)
    }
  })
  useEffect(() => {
    recuperarElEnsayo.current()
  }, [caso.instrumental, caso.catalogoDelEditor, claveDelEnsayo])
  useEffect(() => {
    if (!claveDelEnsayo || !ensayoRecuperado.current) return
    guardarEnsayoDeLaConsola(claveDelEnsayo, { v: 1, instrumento, modo, tipoDeTrazo, modoElectro, potenciaW })
  }, [claveDelEnsayo, instrumento, modo, tipoDeTrazo, modoElectro, potenciaW])

  // Con la broca puesta (P-004 E8): Espacio la apaga o la enciende y Esc la retira, salvo que se esté escribiendo o haya un botón con el foco.
  const hayBroca = broca !== null
  useEffect(() => {
    if (!hayBroca) return
    const alTeclear = (e: KeyboardEvent) => {
      const destino = e.target instanceof HTMLElement ? e.target : null
      const etiqueta = destino?.tagName
      if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT' || destino?.isContentEditable) return
      if (e.key === 'Escape') {
        e.preventDefault()
        mando.current?.retirarLaBroca()
      } else if (e.key === ' ' && etiqueta !== 'BUTTON') {
        e.preventDefault()
        mando.current?.apagarLaBroca()
      }
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [hayBroca])

  const girar = (eje: 'x' | 'y' | 'z', valor: number) => {
    const nuevos = { ...giros, [eje]: valor }
    setGiros(nuevos)
    mando.current?.girarFragmento(nuevos)
    recalcularMedidas()
  }

  // El código lo compone el servidor con el número del hueso y el de la
  // clasificación; aquí solo se muestra si existe.
  const codigo = caso.codigo

  /** El instrumento que el residente tiene en la mano, ya resuelto. */
  const instrumentoElegido = caso.instrumental.find((i) => i.id === instrumento) ?? null
  /**
   * Anota que el instrumento de la mano **hizo algo**. Se llama desde los avisos del lienzo —que ya dicen cuándo se cortó,
   * se separó, se pinzó, se perforó, se cosió o se fijó— y no al elegirlo: elegirlo y soltarlo no es usarlo.
   */
  const usarElDeLaMano = (largoMm?: number) => {
    if (!instrumentoElegido) return
    setInsumos((r) =>
      anotarUso(r, {
        instrumentoId: instrumentoElegido.id,
        nombre: instrumentoElegido.nombre,
        categoria: instrumentoElegido.categoria,
        largoMm,
      }),
    )
  }

  /**
   * Con qué valor está cada articulación del instrumento elegido: lo que movió
   * quien lo usa, o si no lo guardado en el taller, o si no lo que declara el
   * archivo.
   */
  const ajustesDelElegido = instrumentoElegido?.ajustes ?? null
  const urlDelElegido = instrumentoElegido?.modeloUrl ?? null
  const iconoDelElegido = instrumentoElegido?.icono ?? null
  const slugDelElegido = instrumentoElegido?.slug ?? null
  const nombreDelElegido = instrumentoElegido?.nombre ?? ''
  /**
   * El encuadre con el que se ve el instrumento. Va en una memoria y no llamado dentro del pintado: el compilador de
   * React da por mutable lo que una función recibe como argumento, y llamada así sobre `instrumentoElegido` hacía
   * que rechazara las memorias de más abajo (`queHace`, `valoresDeArticulacion`, `instrumentoEnEscena`) y dejara
   * sin optimizar la consola entera.
   */
  const encuadreDelModeloElegido = instrumentoElegido?.encuadreDelModelo ?? null
  const encuadreDelElegido = useMemo(
    () => encuadreVigente(undefined, encuadreDelModeloElegido),
    [encuadreDelModeloElegido],
  )
  /** Qué le hace al paciente el instrumento en la mano: corta, separa, perfora. */
  const queHace = useMemo(
    () =>
      comportamientoDelInstrumento({ slug: slugDelElegido, nombre: nombreDelElegido, icono: iconoDelElegido }),
    [slugDelElegido, nombreDelElegido, iconoDelElegido],
  )
  /** De qué tipo es el tornillo en la mano: el que escribió el editor o el que se deduce del nombre (P-004 E9). */
  const tipoDeTornilloEscrito = instrumentoElegido?.tipoDeTornillo ?? null
  const tipoDelElegido = useMemo(
    () => tipoDelTornillo({ slug: slugDelElegido, nombre: nombreDelElegido, tipoDeTornillo: tipoDeTornilloEscrito }),
    [slugDelElegido, nombreDelElegido, tipoDeTornilloEscrito],
  )
  const roscaDelElegido = definicionDelTipo(tipoDelElegido).roscaMm
  /** La Metzenbaum en disección roma: no corta, apoya la punta y separa el plano al abrir las ramas. */
  const usoRoma = !!queHace.roma && modo === 'disecar'
  /** Cómo se usa el instrumento en el abordaje, tal como lo cuenta el traumatólogo. */
  const guia = instrumentoElegido
    ? guiaDelInstrumento({ slug: slugDelElegido, nombre: nombreDelElegido, icono: iconoDelElegido })
    : null
  const valoresDeArticulacion = useMemo(() => {
    const valores: Record<string, number> = {}
    for (const a of articulacionesDeclaradas) {
      valores[a.nombre] =
        articulacionesMovidas[a.nombre] ?? ajustesDelElegido?.articulaciones?.[a.nombre] ?? a.inicial
    }
    return valores
  }, [articulacionesDeclaradas, articulacionesMovidas, ajustesDelElegido])

  // Las ramas de la Metzenbaum en disección roma: lo que se abren —con la rueda o con la barra— es lo que separa el
  // plano. Se le dice al lienzo como una fracción de su recorrido, de 0 (cerradas, donde empiezan) a 1 (abiertas del todo).
  const articulacionDeLasRamas = usoRoma ? articulacionesDeclaradas[0] : undefined
  const aberturaDeLasRamas = articulacionDeLasRamas
    ? (valoresDeArticulacion[articulacionDeLasRamas.nombre] ?? articulacionDeLasRamas.inicial)
    : null
  useEffect(() => {
    if (!articulacionDeLasRamas || aberturaDeLasRamas === null) return
    const { inicial, max } = articulacionDeLasRamas
    const fraccion = max === inicial ? 0 : (aberturaDeLasRamas - inicial) / (max - inicial)
    mando.current?.abrirDiseccion(Math.min(1, Math.max(0, fraccion)))
  }, [articulacionDeLasRamas, aberturaDeLasRamas])

  /**
   * Lo que el lienzo necesita para poner el instrumento en la escena.
   *
   * Existe aunque el instrumento no tenga modelo 3D (D-176): antes dependía de `urlDelElegido`, y un instrumento sin
   * archivo dejaba al lienzo sin instrumento en la mano —el modo cambiaba a «Separar» y el clic no hacía nada, sin un
   * aviso—. Lo que hace un instrumento (cortar, separar, perforar…) es del instrumento, no de su dibujo: sin modelo no
   * se ve, pero funciona. El lienzo ya no carga nada con una dirección vacía, y lo que se coloca sin modelo se coloca
   * igual, invisible (`colocarInstrumento`).
   */
  const idDelElegido = instrumentoElegido?.id
  const orificiosDelElegido = instrumentoElegido?.orificios ?? null
  const hayElegido = instrumentoElegido !== null
  const instrumentoEnEscena = useMemo<InstrumentoEnEscena | null>(
    () =>
      hayElegido
        ? {
            url: urlDelElegido ?? '',
            id: idDelElegido,
            nombre: nombreDelElegido,
            ajustes: ajustesDelElegido,
            articulaciones: valoresDeArticulacion,
            corta: (iconoDelElegido === 'bisturi' || !!queHace.corta) && !usoRoma,
            planoDeCorte: usoRoma ? null : queHace.corta,
            roma: usoRoma ? queHace.roma : null,
            separa: queHace.separa,
            pellizca: queHace.pellizca,
            reduce: queHace.reduce,
            modela: queHace.modela,
            electro: queHace.electro ? { modo: modoElectro, potenciaW } : null,
            perfora: queHace.perfora,
            sutura: queHace.sutura,
            orificios: orificiosDelElegido,
            tornillo: queHace.coloca?.tipo === 'tornillo' ? { tipo: tipoDelElegido, roscaMm: roscaDelElegido } : null,
            coloca: queHace.coloca,
            mide: queHace.mide,
          }
        : null,
    [hayElegido, urlDelElegido, idDelElegido, nombreDelElegido, ajustesDelElegido, valoresDeArticulacion, iconoDelElegido, queHace, usoRoma, modoElectro, potenciaW, orificiosDelElegido, tipoDelElegido, roscaDelElegido],
  )

  /**
   * Qué hace la rueda del ratón con el instrumento en la mano (D-171): abre las tijeras, abre el separador
   * colocado, levanta la piel con la pinza, sube o baja la potencia del electrobisturí, tira del hilo, alarga
   * el tornillo. `null`: el instrumento no se maneja con ella y la rueda acerca el modelo.
   *
   * La sutura solo la usa cuando ya hay puntadas: antes de la primera no hay nada que tensar, y quitarle el
   * zoom al residente por un hilo que aún no tira de nada sería robarle la rueda para nada. La pinza, igual:
   * con ninguna puesta no hay qué levantar.
   */
  const ruedaDelInstrumento: 'abre' | 'separa' | 'pinza' | 'potencia' | 'tira' | 'alarga' | 'perfora' | 'dobla' | 'tuerce' | null = !instrumentoElegido
    ? null
    : queHace.modela === 'flexion' || queHace.modela === 'torsion'
      ? // La rueda dobla o tuerce la placa de la mesa (P-005 E1); sin placa en la mesa es del zoom como siempre.
        mesaDeModelado
        ? queHace.modela === 'flexion'
          ? 'dobla'
          : 'tuerce'
        : null
      : queHace.sutura
      ? sutura && sutura.puntadas > 0
        ? 'tira'
        : null
      : queHace.coloca?.tipo === 'tornillo'
        ? 'alarga'
        : queHace.perfora
          ? // La rueda mete y saca la broca puesta (P-004 E8); sin una puesta, la rueda es del zoom como siempre.
            broca
            ? 'perfora'
            : null
          : queHace.separa
          ? 'separa'
          : queHace.pellizca
            ? pellizcos && pellizcos.lista.length > 0
              ? 'pinza'
              : null
            : queHace.electro
              ? 'potencia'
              : articulacionesDeclaradas.length > 0
                ? 'abre'
                : null

  const alRuedaDelInstrumento = (deltaY: number, mayusculas = false): boolean => {
    const m = mando.current
    if (!m || !ruedaDelInstrumento) return false
    // Con Mayúsculas solo las pinzas se quedan la rueda (abrir y cerrar las mandíbulas) y, con un músculo retraído, el
    // separador (corre la zona retraída a lo largo del músculo, P-004 E5); el resto la devuelve al zoom.
    const correLaRetraccion = ruedaDelInstrumento === 'separa' && retracciones.length > 0 && (!separadores || separadores.lista.length === 0)
    if (mayusculas && ruedaDelInstrumento !== 'pinza' && ruedaDelInstrumento !== 'perfora' && ruedaDelInstrumento !== 'dobla' && ruedaDelInstrumento !== 'tuerce' && !correLaRetraccion) return false
    // Hacia delante (deltaY negativo) abre, tira, alarga o sube; hacia atrás, al revés.
    const sentido = deltaY < 0 ? 1 : -1
    const entre = (minimo: number, maximo: number, valor: number) => Math.min(maximo, Math.max(minimo, valor))
    if (ruedaDelInstrumento === 'dobla' || ruedaDelInstrumento === 'tuerce') {
      // Un grado por muesca; con Mayúsculas, una quinta parte.
      const grados = sentido * (mayusculas ? 0.2 : 1)
      const aviso = m.doblarLaPlaca(ruedaDelInstrumento === 'dobla' ? { flexionGrados: grados } : { torsionGrados: grados })
      const ahora = Date.now()
      if (aviso && ahora - avisoDeLaMesa.current > 1500) {
        avisoDeLaMesa.current = ahora
        anotar(aviso, 'atencion')
      }
      return true
    }
    if (ruedaDelInstrumento === 'tira') {
      m.tensarSutura(m.tensionDeLaSutura() + sentido * 0.04)
      return true
    }
    if (ruedaDelInstrumento === 'perfora') {
      // Hacia delante mete la broca, hacia atrás la saca; con Mayúsculas, la quinta parte (0,1 mm).
      m.moverLaBroca(sentido, mayusculas)
      return true
    }
    if (ruedaDelInstrumento === 'alarga') {
      setLargoDeTornillo((antes) => entre(MINIMO_DEL_TORNILLO_MM, MAXIMO_DEL_TORNILLO_MM, antes + sentido * 2))
      return true
    }
    if (ruedaDelInstrumento === 'potencia') {
      setPotenciaW((antes) => limitarPotencia(antes + sentido * 5))
      return true
    }
    if (ruedaDelInstrumento === 'pinza') {
      // Hacia delante separa las dos pinzas (tiran de los bordes de la piel) o abre las mandíbulas; hacia atrás, al revés.
      if (mayusculas) m.abrirMandibulas(sentido)
      else m.separarPinzas(sentido * 1.5)
      return true
    }
    if (ruedaDelInstrumento === 'separa') {
      // El separador se abre donde está puesto. Sin ninguno puesto, la rueda no abre nada: la herida se
      // abre con un separador, no sola, y se dice cómo ponerlo.
      // Un músculo retraído con el separador (P-003 E10) también responde a la rueda, aunque no haya herida.
      if (retracciones.length > 0 && (!separadores || separadores.lista.length === 0)) {
        if (mayusculas) m.correrRetraccion(sentido * 2)
        else m.moverSeparador(sentido * 2)
        return true
      }
      if (!separadores || separadores.lista.length === 0) {
        const ahora = Date.now()
        if (ahora - avisoDelSeparador.current > 4000) {
          avisoDelSeparador.current = ahora
          anotar('Primero haga clic en la herida para colocar el separador; después se abre con la rueda.', 'atencion')
        }
        return true
      }
      m.moverSeparador(sentido * 2)
      return true
    }
    const articulacion = articulacionesDeclaradas[0]
    if (articulacion) {
      const paso = (articulacion.max - articulacion.min) / 20
      setArticulacionesMovidas((antes) => {
        const actual = antes[articulacion.nombre] ?? valoresDeArticulacion[articulacion.nombre] ?? articulacion.inicial
        return {
          ...antes,
          [articulacion.nombre]: Math.round(entre(articulacion.min, articulacion.max, actual + sentido * paso) * 2) / 2,
        }
      })
      return true
    }
    return false
  }

  /**
   * La bandeja tal como se pinta: el residente la ve en una lista; el editor,
   * el catálogo entero agrupado por categoría y filtrado por lo que escriba.
   */
  /** La fila de un instrumento de la bandeja, aparte para repetirla dentro de los subgrupos de tornillos (P-004 E9). */
  const filaDeLaBandeja = (it: InstrumentoDeBandeja) => (
            <li key={it.id}>
              <button
                type="button"
                className={`instrumento${instrumento === it.id ? ' activo' : ''}${
                  editor?.instrumentoDelPaso === it.id ? ' del-paso' : ''
                }`}
                aria-pressed={instrumento === it.id}
                onClick={() => elegirInstrumento(it.id)}
              >
                <IconoInstrumento nombre={it.icono} />
                <span className="instrumento-nombre">{it.nombre}</span>
                {instrumento === it.id ? (
                  <Check size={14} strokeWidth={3} aria-hidden className="instrumento-marca" />
                ) : null}
                {editor && !it.modeloUrl ? (
                  <span className="instrumento-etiqueta">sin 3D</span>
                ) : null}
                {siguienteEnLaBandeja === it.id && instrumento !== it.id ? (
                  <span className="instrumento-etiqueta instrumento-etiqueta-paso" title="Lo que sigue en la secuencia brocar · medir · atornillar">
                    siguiente
                  </span>
                ) : null}
                {editor?.instrumentoDelPaso === it.id ? (
                  <span className="instrumento-etiqueta instrumento-etiqueta-paso">este paso</span>
                ) : it.enLaBandejaDelCaso && caso.bandeja === 'acotada' ? (
                  <span className="instrumento-etiqueta">en la bandeja</span>
                ) : it.paraLaPlaca ? (
                  <span className="instrumento-etiqueta" title="Lo necesita la placa de la bandeja: tornillos, brocas, medidor y destornillador">
                    para esta placa
                  </span>
                ) : null}
              </button>
            </li>
  )

  /** ¿Es un tornillo? Por su categoría, o porque el catálogo lo reconoce como uno que se pone en un agujero (P-004 E9). */
  const esUnTornillo = (i: InstrumentoDeBandeja) =>
    i.categoria === 'tornillos' || comportamientoDelInstrumento({ slug: i.slug, nombre: i.nombre, icono: i.icono }).coloca?.tipo === 'tornillo'

  const gruposDeLaBandeja = useMemo(() => {
    // Por palabras y sin tildes, para que «hohm» o «pinza dient» encuentren el instrumento sin acertar el nombre.
    const palabras = paraComparar(busquedaDeInstrumento).split(' ').filter(Boolean)
    const visibles = caso.instrumental.filter((i) => {
      if (palabras.length === 0) return true
      const texto = paraComparar(`${i.nombre} ${i.descripcion ?? ''}`)
      return palabras.every((p) => texto.includes(p))
    })
    const porCategoria = new Map<string, InstrumentoDeBandeja[]>()
    for (const i of visibles) {
      const clave = i.categoria ?? 'otros'
      porCategoria.set(clave, [...(porCategoria.get(clave) ?? []), i])
    }
    // En el orden del catálogo (corte, suturas, exposición…), que es el de la
    // mesa de instrumentación, y no en el que se hayan ido encontrando.
    const orden = CATEGORIAS_DE_INSTRUMENTAL.map((c) => c.value as string)
    const posicion = (clave: string) => (orden.includes(clave) ? orden.indexOf(clave) : orden.length)
    return [...porCategoria.entries()]
      .sort(([a], [b]) => posicion(a) - posicion(b))
      .map(([clave, instrumentos]) => ({
        clave,
        titulo: ETIQUETA_DE_CATEGORIA[clave] ?? 'Otros',
        instrumentos,
      }))
  }, [caso.instrumental, busquedaDeInstrumento])

  // Los bytes de los modelos de la bandeja se piden en segundo plano, de uno en
  // uno y cuando el navegador está ocioso, para que al pulsar un instrumento
  // aparezca al instante. Solo se piden: no se abren. Abrir treinta modelos a
  // la vez sí dejaría la consola inservible en el equipo de referencia; bajar
  // sus bytes al caché no cuesta eso.
  // La dependencia es el texto de las direcciones y no el arreglo: en el editor
  // el caso se rehace con cada letra que se escribe, y con el arreglo la
  // precarga volvería a empezar en cada una.
  //
  // Con la mesa completa (P-004 E3) la bandeja son decenas de instrumentos y bajar todos sus modelos de entrada sería
  // lo que ya se evitó: se precargan los del caso y los de la familia que está abierta; los demás, al cogerlos.
  const direccionesDeLaBandeja = caso.instrumental
    .filter((i) => !i.porOmision || i.categoria === categoriaAbierta)
    .map((i) => i.modeloUrl ?? '')
    .join('|')
  useEffect(() => {
    const direcciones = [...new Set(direccionesDeLaBandeja.split('|').filter(Boolean))]
    if (direcciones.length === 0) return
    let cancelado = false
    const precargar = async () => {
      for (const direccion of direcciones) {
        if (cancelado) return
        try {
          const respuesta = await fetch(direccion)
          await respuesta.arrayBuffer()
        } catch {
          // Un modelo que no baja ahora se pedirá, y se dirá, al cogerlo.
        }
      }
    }
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback
    const manija = idle ? idle(() => void precargar()) : window.setTimeout(() => void precargar(), 1500)
    return () => {
      cancelado = true
      if (!idle) window.clearTimeout(manija)
    }
  }, [direccionesDeLaBandeja])

  const fluoroscopiaEncendida = fluoroscopia !== null

  // El tiempo de escopia cuenta mientras los rayos están encendidos **en vídeo**. En disparo no cuenta nada: una toma
  // no es exposición que medir aquí (pedido de Cristóbal: «las fotos no quiero que se cuenten, el vídeo sí»). Un
  // intervalo y no el reloj de cada pintado: lo único que cambia es un número que se actualiza cada segundo.
  const enVideo = fluoroscopiaEncendida && modoDeEscopia === 'video'
  useEffect(() => {
    if (!enVideo) return
    const reloj = window.setInterval(() => setSegundosDeEscopia((s) => s + 1), 1000)
    return () => window.clearInterval(reloj)
  }, [enVideo])

  // La imagen del arco en C se redibuja unas siete veces por segundo, **solo en vídeo**. No es un efecto del estado
  // de la consola: lo que cambia la imagen es la escena (un instrumento que se mueve, una herida que se abre), y
  // eso vive en el lienzo, que dice si cambió. Cuando no cambió, `dibujarFluoroscopia` no lee nada. En disparo no
  // corre ningún intervalo: la imagen se hace al pulsar «Disparar» (`dispararLaFluoroscopia`).
  useEffect(() => {
    if (fluoroscopia === null || modoDeEscopia !== 'video') return
    const reloj = window.setInterval(() => {
      const lienzo = lienzoDeFluoroscopia.current
      if (!lienzo) return
      // Se dibuja con los píxeles que hacen falta para el ancho con que se enseña: ensanchar el recuadro sin esto
      // solo agranda una imagen de 384 px y la vuelve borrosa.
      const lado = ladoDeLaImagen(lienzo.getBoundingClientRect().width, window.devicePixelRatio)
      mando.current?.dibujarFluoroscopia(lienzo, fluoroscopia, zoomDeFluoroscopia, desplazamientoDeFluoroscopia, lado, ajustesDeLaImagen)
    }, 140)
    return () => window.clearInterval(reloj)
  }, [fluoroscopia, modoDeEscopia, zoomDeFluoroscopia, desplazamientoDeFluoroscopia, ajustesDeLaImagen])

  // En disparo, mover los kilovoltios, el contraste o el filtro vuelve a **revelar** la última toma, sin disparar:
  // es leerla de otra manera. Sin toma (`ultimaToma` nulo) no hay nada que revelar.
  const hayTomaQueRevelar = fluoroscopia !== null && modoDeEscopia === 'disparo' && ultimaToma !== null
  useEffect(() => {
    if (!hayTomaQueRevelar) return
    const lienzo = lienzoDeFluoroscopia.current
    if (lienzo) mando.current?.revelarFluoroscopia(lienzo, ajustesDeLaImagen)
  }, [hayTomaQueRevelar, ajustesDeLaImagen])

  // El «hace N s» de la última toma avanza cada segundo mientras haya una que mirar.
  useEffect(() => {
    if (!hayTomaQueRevelar) return
    const reloj = window.setInterval(() => setAhoraDeLaEscopia(Date.now()), 1000)
    return () => window.clearInterval(reloj)
  }, [hayTomaQueRevelar])

  /** El botón «Disparar»: una toma ahora, con lo que hay en la escena y los ajustes de la imagen. */
  const dispararLaFluoroscopia = () => {
    const lienzo = lienzoDeFluoroscopia.current
    if (fluoroscopia === null || !lienzo) return
    const lado = ladoDeLaImagen(lienzo.getBoundingClientRect().width, window.devicePixelRatio)
    const hecha = mando.current?.dispararFluoroscopia(lienzo, fluoroscopia, zoomDeFluoroscopia, desplazamientoDeFluoroscopia, lado, ajustesDeLaImagen)
    if (!hecha) return
    const hora = Date.now()
    setAhoraDeLaEscopia(hora)
    setUltimaToma({ hora, proyeccion: fluoroscopia, zoom: zoomDeFluoroscopia, desplazamiento: desplazamientoDeFluoroscopia })
  }

  /** Cambia entre disparo y vídeo y lo recuerda. Pasar a disparo deja la imagen vacía: la de vídeo no es una toma. */
  const elegirModoDeEscopia = (modo: ModoDeEscopia) => {
    if (modo === modoDeEscopia) return
    setModoDeEscopia(modo)
    guardarModoDeEscopia(modo)
    // El lienzo y lo que el lienzo del taller cree que ya tiene dibujado dejan de coincidir: sin este reinicio, volver
    // a vídeo con la escena quieta no repintaba nada, porque la huella decía «no ha cambiado».
    mando.current?.reiniciarFluoroscopia()
    if (modo === 'disparo') {
      setUltimaToma(null)
      const lienzo = lienzoDeFluoroscopia.current
      lienzo?.getContext('2d')?.clearRect(0, 0, lienzo.width, lienzo.height)
    }
  }

  const cambiarAjustesDeLaImagen = (ajustes: AjustesDeLaImagen) => {
    setAjustesDeLaImagen(ajustes)
    guardarAjustesDeLaImagen(ajustes)
  }

  // De cuándo es la imagen y si lo que se cambió desde entonces ya no corresponde a ella.
  const haceSegundosDeLaToma = ultimaToma ? Math.max(0, Math.round(((ahoraDeLaEscopia || ultimaToma.hora) - ultimaToma.hora) / 1000)) : null
  const tomaDesactualizada =
    ultimaToma !== null &&
    (ultimaToma.proyeccion !== fluoroscopia ||
      ultimaToma.zoom !== zoomDeFluoroscopia ||
      ultimaToma.desplazamiento.x !== desplazamientoDeFluoroscopia.x ||
      ultimaToma.desplazamiento.y !== desplazamientoDeFluoroscopia.y)

  /**
   * Apaga la fluoroscopia.
   *
   * Al apagar, deja dicho cuánto se estuvo expuesto. Con una pantalla que da
   * igual cuánto dure, el hábito que se aprende es dejarla encendida; en
   * quirófano cada segundo es dosis para el paciente y para el equipo.
   */
  const apagarFluoroscopia = () => {
    if (segundosDeEscopia > 0) {
      anotar(
        segundosDeEscopia > SEGUNDOS_DE_ESCOPIA_ALTOS
          ? `Fluoroscopia apagada tras ${segundosDeEscopia} s. Fue mucho: en pabellón se dispara en tomas cortas, mira la imagen y se apaga.`
          : `Fluoroscopia apagada tras ${segundosDeEscopia} s: una toma corta, como corresponde.`,
        segundosDeEscopia > SEGUNDOS_DE_ESCOPIA_ALTOS ? 'atencion' : 'bien',
      )
    }
    setMenuDeFluoroscopia(false)
    setFluoroscopia(null)
    setUltimaToma(null)
    // La próxima vez, el miembro empieza centrado. La vista del lienzo no se tocó al encender, así que no hay
    // nada que devolver.
    setDesplazamientoDeFluoroscopia(SIN_DESPLAZAMIENTO)
  }

  /** Enciende la fluoroscopia con la proyección elegida, o cambia de proyección si ya estaba encendida. */
  const elegirProyeccion = (proyeccion: ProyeccionDeFluoroscopia) => {
    if (fluoroscopia === null) {
      setSegundosDeEscopia(0)
      // Encendida de nuevo no hay toma que mirar: en disparo, la imagen empieza vacía hasta pulsar «Disparar», y en
      // vídeo el lienzo es nuevo y hay que pintarlo aunque la escena no se haya movido.
      setUltimaToma(null)
      mando.current?.reiniciarFluoroscopia()
    }
    setFluoroscopia(proyeccion)
    setMenuDeFluoroscopia(false)
    // La vista del lienzo se queda como estaba (petición de Cristóbal): el arco tiene su propia cámara y la
    // proyección solo cambia la imagen del recuadro.
  }

  /** El botón: apagada, abre el menú de las tres proyecciones; encendida, la apaga. */
  const alternarRayosX = () => {
    if (fluoroscopiaEncendida) apagarFluoroscopia()
    else setMenuDeFluoroscopia((abierto) => !abierto)
  }

  /**
   * Una cifra del panel de medidas contra el tope que la evalúa.
   *
   * Sin esto el residente veía «Desplazamiento 3,1 mm» y, para saber si ya
   * valía, tenía que cruzar la mirada a la otra columna, leer una frase gris
   * con tres números dentro y compararlos de memoria. Como es más rápido
   * preguntarle a la consola, usaba «Aplicar paso» de sonda, y la reducción
   * fina —que es lo que el módulo enseña— se convertía en pulsar el botón hasta
   * que dejara pasar.
   *
   * El tope se pregunta a `topesDeReduccion`, que es la misma función que usa
   * `evaluarGesto`, y no se lee de `paso.tolerancia…` a pelo. Antes se pintaba
   * solo lo que el paso traía escrito —para no arriesgarse a enseñar un número
   * y medir contra otro— y un paso antiguo sin tolerancias se quedaba sin
   * ninguna referencia en pantalla mientras el motor lo juzgaba igual, con sus
   * respaldos. Con la regla en un solo sitio ese riesgo desaparece.
   *
   * Lo de «se pasa» va por clase y no por un `style` en línea con el ámbar
   * dentro: el color de la consola lo decide la hoja, y escrito aquí no había
   * forma de encontrarlo desde ella —ni de comprobar su contraste, que era el
   * problema: `var(--ambar)` sobre el blanco del panel se queda en 4,18:1 y
   * este renglón mide 11 px—. Hoy la tarjeta de la medida lleva su estado en
   * `data-estado` y lo pinta `simulador/consola.css`; el sentido sigue sin
   * depender del color: la propia línea dice «se pasa» o «dentro».
   */
  const lineaDeTope = (valor: number, tope: number, unidad: 'mm' | '°'): LecturaDeMedida => {
    const fuera = valor > tope
    return {
      referencia: `tope ${unidad === '°' ? `${tope}°` : `${tope} mm`}`,
      veredicto: fuera ? 'se pasa' : 'dentro',
      estado: fuera ? 'fuera' : 'dentro',
    }
  }

  /** La incisión trazada contra el rango que pide el paso. */
  const lineaDelTrazo = (): LecturaDeMedida | null => {
    if (objetivo !== 'trazo' || !paso) return null
    const rango = rangoDeTrazoEnTexto(paso)
    if (!rango) return null
    const { trazoMinimo: minimo, trazoMaximo: maximo } = paso
    const referencia = `objetivo ${rango}`
    if (largoDelTrazoMm <= 0) return { referencia, veredicto: 'sin trazar', estado: 'neutro' }
    const corta = typeof minimo === 'number' && largoDelTrazoMm < minimo
    const larga = typeof maximo === 'number' && largoDelTrazoMm > maximo
    return {
      referencia,
      veredicto: corta ? 'corta' : larga ? 'larga' : 'dentro',
      estado: corta || larga ? 'fuera' : 'dentro',
    }
  }

  // «Mover todo junto» salvo en el paso de reducir, donde hace falta agarrar un trozo de hueso suelto. Si quien
  // usa la consola lo elige a mano, manda lo elegido hasta que cambie de paso.
  const moverTodoEfectivo = moverTodoElegido ?? objetivo !== 'reduccion'
  /**
   * La secuencia brocar · medir · atornillar (P-004 E9, pedido 12 de Cristóbal): «que se despliegue el instrumento que viene después,
   * porque siempre es ese orden». Tras cada hecho —un orificio perforado, medido o atornillado— se decide qué toca y se abre en la bandeja
   * el instrumento que corresponde; con «Poner el siguiente en la mano» encendido (lo está de entrada) pasa además a la mano.
   */
  const avanzarLaSecuencia = (estado: EstadoDeLaFijacion | null, suceso: SucesoDeFijacion) => {
    if (suceso.tipo === 'placa') {
      setEtapaDeFijacion('brocar')
      return
    }
    if (suceso.agujero === undefined && !suceso.libre) return
    const delObjetivo = suceso.libre
      ? estado?.trayectoria
        ? { perforado: estado.trayectoria.perforado, medido: estado.trayectoria.medido }
        : null
      : (estado?.agujeros?.find((a) => a.indice === suceso.agujero) ?? null)
    const etapa = siguienteDeLaSecuencia(delObjetivo, suceso.tipo === 'tornillo')
    setEtapaDeFijacion(etapa)
    const delTornillo = (id: string | null) => {
      const i = caso.instrumental.find((x) => x.id === id)
      const c = i ? comportamientoDelInstrumento({ slug: i.slug, nombre: i.nombre, icono: i.icono }) : null
      return c?.coloca?.tipo === 'tornillo' ? c.coloca.diametroMm : null
    }
    const ultimo = suceso.tipo === 'tornillo' ? instrumento : ultimoTornillo
    const siguiente = instrumentoDeLaEtapa(
      etapa,
      // Una copia: el compilador de React da por hecho que lo que se pasa a una función puede cambiar, y `caso.instrumental` es
      // dependencia de varias memorias de aquí.
      [...caso.instrumental],
      (i) => {
        const c = comportamientoDelInstrumento({ slug: i.slug, nombre: i.nombre, icono: i.icono })
        return {
          perfora: !!c.perfora,
          mide: !!c.mide,
          tornillo: c.coloca?.tipo === 'tornillo',
          diametroMm: c.perfora?.diametroMm ?? (c.coloca?.tipo === 'tornillo' ? c.coloca.diametroMm : undefined),
        }
      },
      { ultimoTornilloId: ultimo, diametroDelTornilloMm: diametroDeTornillo ?? delTornillo(ultimo) },
    )
    if (!siguiente) return
    setSiguienteEnLaBandeja(siguiente.id)
    setCategoriaAbierta(siguiente.categoria ?? null)
    if (siguienteAutomatico) elegirInstrumento(siguiente.id)
  }

  /** La trayectoria de un tornillo con dos clics (P-004 E9): el bloque que sale con la broca, el medidor y el tornillo. */
  const bloqueDeLaTrayectoria = (
    <div className="consola-trayectoria">
      <p className="consola-instrumento-texto">
        {marcandoLaTrayectoria
          ? trayectoria?.fase === 'salida'
            ? 'Entrada marcada: haga clic en el hueso donde sale el tornillo.'
            : 'Haga clic en el hueso donde entra el tornillo y después donde sale.'
          : trayectoria?.fase === 'lista'
            ? `Trayectoria de ${Math.round(trayectoria.largoMm ?? 0)} mm, ${Math.round(trayectoria.anguloConElEje ?? 0)}° con el eje del hueso: la broca, el medidor y el tornillo la siguen.`
            : 'Sin placa, o fuera de sus agujeros, el tornillo va por una trayectoria que se marca con dos clics sobre el hueso.'}
      </p>
      <div className="consola-instrumento-acciones">
        {marcandoLaTrayectoria ? (
          <button
            type="button"
            className="consola-boton"
            onClick={() => {
              setMarcandoLaTrayectoria(false)
              mando.current?.borrarTrayectoriaDelTornillo()
            }}
          >
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            className="consola-boton"
            onClick={() => {
              mando.current?.borrarTrayectoriaDelTornillo()
              setMarcandoLaTrayectoria(true)
            }}
          >
            {trayectoria ? 'Marcar otra trayectoria' : 'Marcar la trayectoria'}
          </button>
        )}
        {trayectoria?.fase === 'lista' ? (
          <button type="button" className="consola-boton" onClick={() => mando.current?.borrarTrayectoriaDelTornillo()}>
            Borrar la trayectoria
          </button>
        ) : null}
      </div>
    </div>
  )

  /**
   * La vista de trabajo de los orificios ovales de la placa fijada y lo que se lleva comprimido (P-004 E10, pedidos 11 y 14). El esquema
   * deja elegir dónde se broca; qué comprime lo decide `src/lib/compresion.ts`.
   */
  const placaFijada = fijacion?.placa?.fijada ? fijacion.placa : null
  const hayOvales = !!placaFijada && placaFijada.forma !== undefined && placaFijada.forma !== 'redondo'
  const bloqueDeLaCompresion = (
    <>
      {hayOvales && placaFijada ? (
        <PanelDeCompresion
          agujeros={placaFijada.agujeros}
          semilargoMm={placaFijada.semilargoDelOvalMm ?? 4.5}
          ladoDeLaFractura={placaFijada.ladoDeLaFractura ?? {}}
          desviaciones={placaFijada.desviaciones ?? {}}
          perforados={new Set((fijacion?.agujeros ?? []).filter((a) => a.perforado).map((a) => a.indice))}
          alElegirDesviacion={(i, mm) => mando.current?.fijarDesviacionDelAgujero(i, mm)}
          alAcercar={(i) => mando.current?.acercarseAlAgujero(i)}
        />
      ) : null}
      {fijacion?.compresion ? (
        <p className="consola-instrumento-texto" role="status">
          <strong>Compresión: {fijacion.compresion.mm.toFixed(1).replace('.', ',')} mm</strong> ({fijacion.compresion.tecnicas.map((t) => NOMBRE_DE_LA_TECNICA[t]).join(' y ')}).
        </p>
      ) : null}
    </>
  )

  /** Los tres tiempos de la fijación, con el que toca marcado, y el interruptor de poner el siguiente en la mano (P-004 E9). */
  const bloqueDeLaSecuencia = (
    <div className="consola-secuencia">
      <ol className="consola-secuencia-pasos" aria-label="Secuencia de fijación">
        {ETAPAS_DE_FIJACION.map((e) => (
          <li key={e.etapa} className={e.etapa === etapaDeFijacion ? 'actual' : ''} aria-current={e.etapa === etapaDeFijacion ? 'step' : undefined}>
            {e.numero} · {e.etiqueta}
          </li>
        ))}
      </ol>
      <p className="consola-instrumento-texto">{textoDeLaSecuencia(etapaDeFijacion, siguienteEnLaBandeja !== null)}</p>
      <label className="consola-interruptor" title="Al terminar un tiempo, el instrumento que sigue pasa solo a la mano y se abre en la bandeja.">
        <span>Poner el siguiente en la mano</span>
        <input type="checkbox" role="switch" checked={siguienteAutomatico} onChange={(e) => setSiguienteAutomatico(e.target.checked)} />
        <span className="consola-interruptor-pista" aria-hidden />
      </label>
    </div>
  )

  /** El menú de movimiento sale con un trozo suelto (Mover → Un trozo, o la pinza de reducción) y con la placa puesta sin fijar. */
  const menuDelTrozo = (modo === 'mover' && !moverTodoEfectivo) || modo === 'reducir'
  const menuDeLaPlaca = modo === 'fijar' && !!fijacion?.placa && !fijacion.placa.fijada
  /**
   * Un paso del menú sobre la placa: parte del ajuste que tiene **ahora** en la escena (no del último que pintó la consola,
   * que con dos pulsaciones seguidas aún no se repintó), lo acota a los rangos del hueso y se lo pide al lienzo.
   */
  const moverLaPlacaPorEje = (accion: Parameters<typeof lecturaDelMovimiento>[0], eje: Parameters<typeof lecturaDelMovimiento>[1], valor: number): string | null => {
    const placa = mando.current?.estadoDeLaFijacion()?.placa
    if (!placa?.ajuste) return null
    const nuevo = ajusteDeLaPlacaPorPaso(placa.ajuste, accion, eje, valor, placa.sentidoDelLado ?? 0)
    if (!nuevo) return null
    const rangos = placa.rangos ?? { largoMm: { min: -40, max: 40 }, ladoMm: { min: -15, max: 15 }, giroGrados: { min: -90, max: 90 } }
    const acotado = {
      largoMm: acotar(nuevo.largoMm, rangos.largoMm.min, rangos.largoMm.max),
      ladoMm: acotar(nuevo.ladoMm, rangos.ladoMm.min, rangos.ladoMm.max),
      giroGrados: acotar(nuevo.giroGrados, rangos.giroGrados.min, rangos.giroGrados.max),
    }
    return mando.current?.ajustarLaPlaca(acotado) ? lecturaDelMovimiento(accion, eje, valor) : 'Ahí no hay hueso bajo la placa.'
  }

  // En el orden en que se hace una cirugía, de izquierda a derecha (P-004 E4): mirar, trazar, mover, exponer, reducir,
  // perforar, fijar, coser, disecar, y al final «Seleccionar estructura», que no modifica nada.
  const modosVisibles = [
    ...MODOS,
    ...(editor ? [MODO_SENALAR] : []),
    ...(queHace.separa ? [MODO_SEPARAR] : []),
    ...(queHace.pellizca ? [MODO_PINZAR] : []),
    ...(queHace.reduce ? [MODO_REDUCIR] : []),
    ...(queHace.perfora ? [MODO_PERFORAR] : []),
    ...(queHace.coloca || queHace.mide ? [MODO_FIJAR] : []),
    ...(queHace.sutura ? [MODO_COSER] : []),
    ...(queHace.roma ? [MODO_DISECAR] : []),
    ...(queHace.modela ? [MODO_MODELAR] : []),
    MODO_INFO,
  ]
  const ayudaDelModo = modosVisibles.find((m) => m.valor === modo)?.ayuda ?? ''
  const etiquetaDelModoDelPaso = MODOS.find((m) => m.valor === modoDelPaso)?.etiqueta ?? null
  const topesDelDeslizador = paso ? rangoDelDeslizadorDeFuerza(paso) : { min: 0, max: 120 }
  const rangoUtil = paso ? rangoDeFuerzaEnTexto(paso) : null

  // Un paso que primero se pasó y después se quedó corto está en los dos
  // conjuntos: se cuentan los pasos, no los tropiezos, o el resumen diría que
  // hubo que repetir más pasos de los que tiene el caso.
  const pasosConTropiezo = new Set([...fallados, ...complicados]).size
  // Cuenta **pasos** con complicación, que no es la lista `complicaciones` del
  // estado: aquella tiene una fila por gesto que dañó y se guarda, esta es el
  // tamaño de un conjunto de identificadores de paso. Y por eso no puede
  // llamarse igual: en el ámbito de esta función ya vive el estado con ese
  // nombre, y repetirlo no era un roce de estilo —`tsc` daba TS2451 en las dos
  // declaraciones y Turbopack se negaba a compilar el archivo entero—.
  const pasosConComplicacion = complicados.size
  const resumenDelCaso =
    pasosConTropiezo === 0
      ? 'Todos los pasos a la primera.'
      : `Hubo que repetir ${pasosConTropiezo} ${
          pasosConTropiezo === 1 ? 'paso' : 'pasos'
        } de ${caso.pasos.length}${
          pasosConComplicacion > 0
            ? pasosConComplicacion === 1
              ? ', y uno de ellos terminó en complicación, que no puntúa'
              : `, y ${pasosConComplicacion} de ellos terminaron en complicación, que no puntúan`
            : ''
        }; las correcciones están en la retroalimentación clínica, debajo.`

  // ------------------------------------------------------------- pintado
  // Los dos casos que no se pueden recorrer. Llevaban `admin-aviso
  // admin-aviso-atencion`, dos clases que solo declara `admin.css`: fuera del
  // panel esa hoja no se carga, y el residente leía un párrafo suelto, sin
  // marco ni color, donde esperaba una consola. `Vacio` es el estado vacío de
  // toda la plataforma, y la acción de vuelta evita el callejón sin salida.
  if (!caso.modeloUrl) {
    return (
      <div className="consola-sin-caso">
        <Vacio
          icono={Box}
          titulo="Este caso todavía no tiene modelo 3D"
          accion={
            <Link href="/simulador" className="admin-btn admin-btn-secondary">
              <ArrowLeft size={16} aria-hidden /> Volver a la lista de casos
            </Link>
          }
        >
          La consola necesita un archivo .glb con el hueso ya partido. Súbalo en Modelos 3D y
          asígnelo al caso.
        </Vacio>
      </div>
    )
  }

  if (caso.pasos.length === 0) {
    return (
      <div className="consola-sin-caso">
        <Vacio
          icono={Scissors}
          titulo="Este caso todavía no tiene pasos escritos"
          accion={
            <Link href="/simulador" className="admin-btn admin-btn-secondary">
              <ArrowLeft size={16} aria-hidden /> Volver a la lista de casos
            </Link>
          }
        >
          Añádalos desde el panel.
        </Vacio>
      </div>
    )
  }

  /**
   * En qué quedó cada paso, para la franja de arriba.
   *
   * Antes el resuelto se apagaba con `opacity: .62` y el texto bajaba de
   * contraste justo en lo que el residente ya había hecho; y un paso con
   * complicación se veía igual que uno limpio. Ahora cada estado tiene color e
   * icono, y además su palabra para el lector de pantalla.
   */
  const estadoDelPaso = (p: PasoDeConsola, i: number) =>
    complicados.has(p.id)
      ? resueltos.has(p.id)
        ? 'complicado'
        : i === indice
          ? 'actual complicado'
          : 'complicado'
      : resueltos.has(p.id)
        ? 'resuelto'
        : i === indice
          ? 'actual'
          : 'pendiente'
  const PALABRA_DEL_ESTADO: Record<string, string> = {
    resuelto: 'resuelto',
    complicado: 'con complicación',
    'actual complicado': 'paso actual, con complicación',
    actual: 'paso actual',
    pendiente: 'pendiente',
  }

  // La franja del rango útil pintada sobre la pista del deslizador de fuerza.
  // Con el rango solo en texto, el residente tenía que traducir «20–60 N» a una
  // posición del pulgar; pintado, se ve dónde hay que dejarlo. Los extremos son
  // los mismos que juzga `evaluarGesto`, y el que el paso no declara se lleva
  // hasta el borde de la pista, que es lo que significa «sin tope».
  const anchoDelDeslizador = Math.max(1, topesDelDeslizador.max - topesDelDeslizador.min)
  const aPorcentaje = (n: number) =>
    `${Math.min(100, Math.max(0, ((n - topesDelDeslizador.min) / anchoDelDeslizador) * 100))}%`
  const franjaUtil =
    paso && objetivo === 'fuerza'
      ? {
          '--util-desde': aPorcentaje(paso.fuerzaMinima ?? topesDelDeslizador.min),
          '--util-hasta': aPorcentaje(paso.fuerzaMaxima ?? topesDelDeslizador.max),
        }
      : undefined
  const fuerzaDentro =
    paso &&
    (typeof paso.fuerzaMinima !== 'number' || fuerza >= paso.fuerzaMinima) &&
    (typeof paso.fuerzaMaxima !== 'number' || fuerza <= paso.fuerzaMaxima)

  const medidas: { nombre: string; valor: string; desglose?: string; lectura: LecturaDeMedida | null }[] = [
    {
      nombre: 'Desplazamiento',
      valor: `${reduccion.desplazamiento} mm`,
      // De qué eje viene: sin esto, lo que queda fuera del plano que se está
      // mirando parece un número que no baja al arrastrar.
      desglose:
        reduccion.desplazamiento > 0
          ? reduccion.lateral.map(({ eje, mm }) => `${eje.toUpperCase()} ${mm}`).join(' · ')
          : undefined,
      lectura:
        objetivo === 'reduccion' && topes
          ? lineaDeTope(reduccion.desplazamiento, topes.desplazamiento, 'mm')
          : null,
    },
    {
      nombre: 'Angulación',
      valor: `${reduccion.angulacion}°`,
      lectura:
        objetivo === 'reduccion' && topes ? lineaDeTope(reduccion.angulacion, topes.angulacion, '°') : null,
    },
    {
      nombre: 'Diástasis',
      valor: `${reduccion.diastasis} mm`,
      lectura:
        objetivo === 'reduccion' && topes ? lineaDeTope(reduccion.diastasis, topes.diastasis, 'mm') : null,
    },
    { nombre: 'Incisión', valor: `${largoDelTrazoMm} mm`, lectura: lineaDelTrazo() },
  ]

  const ICONO_DEL_TONO: Record<Anotacion['clase'], LucideIcon> = {
    bien: CheckCircle2,
    atencion: AlertTriangle,
    grave: OctagonAlert,
  }
  const lineaDeRegistro = (linea: Anotacion, clave: string | number) => {
    const Icono = ICONO_DEL_TONO[linea.clase]
    return (
      <li key={clave} className={`registro-linea registro-${linea.clase}`}>
        <Icono size={16} aria-hidden className="registro-icono" />
        <span>{linea.texto}</span>
      </li>
    )
  }

  const tieneMandosPropios = objetivo === 'trazo' || largoDelTrazoMm > 0 || objetivo === 'reduccion'

  /**
   * «Cortar» desde la lista de estructuras separadas (P-004 E5): el músculo pasa a ser el objetivo del corte, el
   * instrumento de corte de la bandeja se pone en la mano y el modo cambia a Trazar. Es la misma entrada que la ficha de
   * «Seleccionar estructura», sin tener que abrirla.
   */
  const cortarElMusculoSeparado = (nodo: string) => {
    const instrumento = instrumentosParaActuar('cortar', caso.instrumental, [])[0]
    if (!instrumento) {
      anotar('No hay en la bandeja un instrumento para cortar músculo (bisturí, tijera de Metzenbaum o electrobisturí).', 'atencion')
      return
    }
    setMusculoObjetivo({
      nodo,
      nombre: nodo.replace(/_/g, ' '),
      accion: 'cortar',
      // Lo que ya estaba cortado antes de elegir no cuenta: solo vale la incisión nueva.
      yaCortadas: (herida?.incisiones ?? []).filter((x) => x.capa === 'musculo').map((x) => x.id),
    })
    elegirInstrumento(instrumento.id)
    setModo('trazar')
  }

  /** Los instrumentos de la bandeja para cortar o separar un músculo: los de su ficha o, sin ellos, los de siempre. */
  const instrumentosParaActuarEnElMusculo = (accion: 'cortar' | 'separar', delEditor: readonly string[] = []) =>
    instrumentosParaActuar(accion, caso.instrumental, delEditor)

  // «Insumos utilizados» al terminar (P-003 E7): lo que hizo algo en el recorrido, por categoría y con los tornillos
  // por largo. En el editor cada fila lleva una casilla —todo lo usado marcado— y un botón que deja la bandeja del caso
  // exactamente con lo marcado; lo que estaba en la bandeja y no se usó sale desmarcado, para que nada se vaya sin verse.
  const gruposDeInsumos = agruparInsumos(
    insumos,
    CATEGORIAS_DE_INSTRUMENTAL.map((c) => c.value as string),
  )
  const filasDeLaBandeja = filasParaLaBandeja(
    insumos,
    // Con la mesa completa lo «no usado» sería todo el catálogo (P-004 E3): solo se lista lo que de verdad se había elegido.
    caso.instrumental
      .filter((i) => i.enLaBandejaDelCaso && caso.bandeja === 'acotada')
      .map((i) => ({ id: i.id, nombre: i.nombre })),
  )
  const estaMarcada = (f: { id: string; usado: boolean }) => (marcadasParaLaBandeja ? marcadasParaLaBandeja.has(f.id) : f.usado)
  const alternarMarca = (id: string) => {
    const partida = new Set(marcadasParaLaBandeja ?? filasDeLaBandeja.filter((f) => f.usado).map((f) => f.id))
    if (partida.has(id)) partida.delete(id)
    else partida.add(id)
    setMarcadasParaLaBandeja(partida)
  }
  const bloqueDeInsumos =
    gruposDeInsumos.length === 0 ? (
      <p className="consola-vacio">No se usó ningún instrumento en este recorrido.</p>
    ) : (
      <div className="consola-insumos">
        <h3 className="consola-subtitulo">Insumos utilizados</h3>
        {gruposDeInsumos.map((g) => (
          <div key={g.categoria}>
            <p className="consola-instrumento-texto">{ETIQUETA_DE_CATEGORIA[g.categoria] ?? 'Otros'}</p>
            <ul>
              {g.insumos.map((u) => (
                <li key={u.clave}>
                  {u.nombre} · <span className="u-num">{u.cantidad}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {editor ? (
          <div className="consola-insumos-editor">
            <p className="consola-instrumento-texto">Bandeja del caso</p>
            <ul>
              {filasDeLaBandeja.map((f) => (
                <li key={f.id}>
                  <label>
                    <input type="checkbox" checked={estaMarcada(f)} onChange={() => alternarMarca(f.id)} /> {f.nombre}
                    {!f.usado ? ' (no se usó)' : ''}
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="consola-boton"
              onClick={() => editor.alFijarLaBandeja(filasDeLaBandeja.filter(estaMarcada).map((f) => f.id))}
            >
              Usar como bandeja del caso
            </button>
          </div>
        ) : null}
      </div>
    )

  // La bandeja con el instrumento en la mano. En el editor va en la columna de la izquierda: la de la derecha es del
  // panel de edición, que es largo, y dejaba la bandeja fuera de la vista (era lo que se pedía: todo a la vista).
  const bloqueDeLaBandeja = (
        <div className="consola-bandeja-bloque">
          <h3 className="consola-subtitulo">Instrumental · {caso.instrumental.length}</h3>
          {/* Qué ve el residente (P-004 E3): toda la mesa por omisión, para no ir metiendo instrumento por instrumento, o
              solo lo que el editor elija. Es una orden del editor; el residente no la ve. */}
          {editor ? (
            <>
              <div className="consola-submodo" role="group" aria-label="Qué ve el residente en la bandeja">
                {(
                  [
                    ['completa', 'Toda la mesa'],
                    ['acotada', 'Solo lo que elijo'],
                  ] as const
                ).map(([modo, etiqueta]) => (
                  <button
                    key={modo}
                    type="button"
                    className={`consola-submodo-boton${caso.bandeja === modo ? ' activo' : ''}`}
                    aria-pressed={caso.bandeja === modo}
                    onClick={() => editor.alCambiarLaBandeja(modo)}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
              <p className="consola-ayuda">
                {caso.bandeja === 'completa'
                  ? 'El residente ve todo el instrumental. Para limitarlo, quite instrumentos de la lista o pase a «Solo lo que elijo».'
                  : 'El residente ve solo lo de abajo y lo que piden los pasos.'}
              </p>
            </>
          ) : null}
          {/* Solo los instrumentos del caso, los mismos que ve el residente: los que el autor eligió en la
              bandeja y los que piden los pasos. Y siempre con buscador: con cuarenta instrumentos, recorrer
              las familias a ojo es lo que más tiempo quita. Se busca por palabras y sin tildes. */}
          <label className="consola-busqueda-envoltorio">
            <Search size={14} aria-hidden />
            <input
              type="search"
              className="consola-busqueda"
              placeholder="Buscar un instrumento…"
              aria-label="Buscar un instrumento"
              value={busquedaDeInstrumento}
              onChange={(e) => setBusquedaDeInstrumento(e.target.value)}
            />
          </label>
          {editor && caso.catalogoDelEditor && caso.bandeja === 'acotada' ? (
            <AnadirALaBandeja
              catalogo={caso.catalogoDelEditor}
              alAnadir={(id) => editor.alAlternarEnLaBandeja(id)}
            />
          ) : null}
          {caso.instrumental.length === 0 ? (
            <p className="consola-vacio">
              {editor
                ? 'La bandeja del caso está vacía: añada instrumentos con el botón de arriba, o se arma sola con los que piden los pasos.'
                : 'Este caso no tiene instrumental.'}
            </p>
          ) : null}
          {gruposDeLaBandeja.map((grupo) => {
            // Con algo escrito en el buscador se abren todas las familias que
            // tienen coincidencias: buscar es saltarse el recorrido.
            const abierta = busquedaDeInstrumento.trim() !== '' || categoriaAbierta === grupo.clave
            const idDelPanel = `bandeja-${grupo.clave}`
            const traeElElegido = grupo.instrumentos.some((i) => i.id === instrumento)
            return (
            <div key={grupo.clave} className={`consola-bandeja-grupo${abierta ? ' abierto' : ''}`}>
              <button
                type="button"
                className="consola-bandeja-cabecera"
                aria-expanded={abierta}
                aria-controls={idDelPanel}
                onClick={() => setCategoriaAbierta((antes) => (antes === grupo.clave ? null : grupo.clave))}
              >
                <ChevronRight size={16} aria-hidden className="consola-bandeja-flecha" />
                <span className="consola-bandeja-titulo">{grupo.titulo}</span>
                {traeElElegido ? (
                  <span className="consola-bandeja-en-mano" title="Tiene el instrumento que lleva en la mano">
                    en la mano
                  </span>
                ) : null}
                <span className="consola-bandeja-cuenta u-num">{grupo.instrumentos.length}</span>
              </button>
              {abierta ? (
              <ul className="consola-bandeja" id={idDelPanel}>
                {/* Lo que no es un tornillo, como siempre; los tornillos, en subgrupos por tipo (P-004 E9, pedido 12), estén en la
                    categoría que estén: en el catálogo hay tornillos metidos en «Perforación y fijación». Se clasifican con un objeto nuevo
                    por instrumento: el compilador de React da por hecho que lo que se pasa a una función puede cambiar, y los instrumentos de
                    la bandeja son dependencia de varias memorias de aquí. */}
                {grupo.instrumentos.filter((i) => !esUnTornillo(i)).map(filaDeLaBandeja)}
                {TIPOS_DE_TORNILLO.map((def) => ({
                  def,
                  instrumentos: grupo.instrumentos.filter(
                    (i) => esUnTornillo(i) && tipoDelTornillo({ slug: i.slug, nombre: i.nombre, tipoDeTornillo: i.tipoDeTornillo }) === def.tipo,
                  ),
                }))
                  .filter((sg) => sg.instrumentos.length > 0)
                  .map((sg) => (
                    <li key={sg.def.tipo} className="consola-bandeja-subgrupo">
                      <h4 className="consola-bandeja-subtitulo">{sg.def.etiqueta}</h4>
                      <ul className="consola-bandeja">{sg.instrumentos.map(filaDeLaBandeja)}</ul>
                    </li>
                  ))}
              </ul>
              ) : null}
            </div>
            )
          })}
          {gruposDeLaBandeja.length === 0 && caso.instrumental.length > 0 ? (
            <p className="consola-vacio">Ningún instrumento coincide con la búsqueda.</p>
          ) : null}

          {/*
            El modelo del instrumento que tiene en la mano, y solo ese.
            Trece modelos cargando a la vez en la bandeja dejarían la consola
            inservible en un portátil modesto, que es el equipo de referencia
            del residente: se baja uno cada vez, cuando lo coge. (Los bytes sí se
            piden antes, en segundo plano, para que al pulsar aparezca al
            instante: ver `useEffect` de la precarga.)
          */}
        </div>
  )

  /**
   * Las opciones de la herramienta en la mano: su modelo, el modo de uso, lo que se configura (potencia, apertura, diámetro, largo…),
   * «Soltar» y, en el editor, «Es el correcto en este paso». Se despliega **a la izquierda del lienzo**, como la ficha de «Seleccionar
   * estructura» lo hace a la derecha (pedido del dueño): antes vivía en la columna derecha, debajo de la bandeja, y para cambiar una
   * opción había que apartar la vista del modelo. Es el mismo bloque de siempre, solo que en otro sitio.
   */
  /**
   * La mesa de modelado (P-005 E1, pedido del dueño: «las placas se pueden doblar, no estando en el hueso, con herramientas»). Una placa suelta en el
   * lienzo que se dobla con el alicate de tres puntos, se tuerce con la grifa y se mueve arrastrándola; después se lleva al hueso con su forma.
   */
  const comaDecimal = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  const doblarDesdeElRecuadro = (cambio: { flexionGrados?: number; torsionGrados?: number }) => {
    const aviso = mando.current?.doblarLaPlaca(cambio)
    if (aviso) anotar(aviso, 'atencion')
  }
  const llevarLaPlacaALaMesa = () => {
    if (mando.current?.ponerLaPlacaEnLaMesa()) {
      anotar(
        'Placa en la mesa, a un costado del modelo. Arrástrela para moverla; coja el alicate o la grifa («Modelado de placas») y haga clic sobre ella donde quiera doblarla.',
        'bien',
      )
    } else {
      anotar('Para llevar una placa a la mesa hay que tenerla en la mano y que su modelo haya cargado.', 'atencion')
    }
  }
  const bloqueDeLaPlacaParaLaMesa = (
    <div className="consola-instrumento-acciones">
      <button type="button" className="consola-boton" onClick={llevarLaPlacaALaMesa}>
        <Wrench size={14} aria-hidden /> Llevar a la mesa de modelado
      </button>
      {mesaDeModelado && mesaDeModelado.instrumentoId === idDelElegido ? (
        <p className="consola-instrumento-texto">Esta placa está en la mesa: {mesaDeModelado.texto}</p>
      ) : null}
    </div>
  )
  // Los botones de grados, escritos como JSX y no como una función que se llama al pintar: el compilador de React no deja que lo que se
  // llama durante el pintado cree manejadores que lean referencias.
  const botonesDeFlexion = (
    <div className="consola-instrumento-articulacion">
      <span>Doblar (flexión)</span>
      <div className="consola-instrumento-acciones">
        {[-5, -1, 1, 5].map((g) => (
          <button key={g} type="button" className="consola-boton" onClick={() => doblarDesdeElRecuadro({ flexionGrados: g })}>
            {g > 0 ? `+${g}°` : `−${-g}°`}
          </button>
        ))}
      </div>
    </div>
  )
  const botonesDeTorsion = (
    <div className="consola-instrumento-articulacion">
      <span>Torcer (torsión)</span>
      <div className="consola-instrumento-acciones">
        {[-5, -1, 1, 5].map((g) => (
          <button key={g} type="button" className="consola-boton" onClick={() => doblarDesdeElRecuadro({ torsionGrados: g })}>
            {g > 0 ? `+${g}°` : `−${-g}°`}
          </button>
        ))}
      </div>
    </div>
  )
  const bloqueDeLaMesa = queHace.modela ? (
    <div className="consola-instrumento-articulaciones">
      {!mesaDeModelado ? (
        <p className="consola-instrumento-texto">
          No hay ninguna placa en la mesa. Coja una placa de la bandeja («Placas») y pulse «Llevar a la mesa de modelado»; después vuelva a coger esta herramienta.
        </p>
      ) : queHace.modela === 'plantilla' ? (
        <p className="consola-instrumento-texto">
          <strong>{mesaDeModelado.nombre}</strong> en la mesa. La plantilla de aluminio todavía no copia el contorno del hueso: de momento se modela la placa a ojo con el alicate y la grifa.
        </p>
      ) : (
        <>
          <p className="consola-instrumento-texto">
            <strong>{mesaDeModelado.nombre}</strong> en la mesa. {mesaDeModelado.texto}
          </p>
          <p className="consola-instrumento-texto" role="status">
            {mesaDeModelado.sitioMm === null
              ? 'Un clic sobre la placa apunta al sitio donde se dobla.'
              : `Sitio: a ${comaDecimal(Math.abs(mesaDeModelado.sitioMm))} mm del centro (${mesaDeModelado.sitioMm >= 0 ? 'hacia un extremo' : 'hacia el otro'}), ${mesaDeModelado.lugarDelSitio}.`}
          </p>
          {botonesDeFlexion}
          {queHace.modela === 'torsion' ? botonesDeTorsion : null}
          {mesaDeModelado.orificiosDeformados.length > 0 ? (
            <p className="consola-instrumento-texto">
              Orificios deformados: {mesaDeModelado.orificiosDeformados.join(', ')}. Un tornillo ahí ya no asienta bien (en una LCP, tampoco se bloquea).
            </p>
          ) : null}
          {mesaDeModelado.fatigados.length > 0 ? (
            <p className="consola-instrumento-texto">
              La placa se fatigó en {mesaDeModelado.fatigados.length} {mesaDeModelado.fatigados.length === 1 ? 'sitio' : 'sitios'}: doblada de ida y vuelta, se rompe antes.
            </p>
          ) : null}
          <div className="consola-instrumento-acciones">
            <button type="button" className="consola-boton" disabled={!mesaDeModelado.conManiobras} onClick={() => mando.current?.deshacerElDoblez()}>
              Deshacer el último
            </button>
            <button type="button" className="consola-boton" onClick={() => mando.current?.girarLaPlacaDeLaMesa({ grados: -15 })} aria-label="Girar la placa 15 grados a la izquierda">
              <RotateCcw size={14} aria-hidden /> 15°
            </button>
            <button type="button" className="consola-boton" onClick={() => mando.current?.girarLaPlacaDeLaMesa({ grados: 15 })} aria-label="Girar la placa 15 grados a la derecha">
              <RotateCw size={14} aria-hidden /> 15°
            </button>
            <button type="button" className="consola-boton" onClick={() => mando.current?.girarLaPlacaDeLaMesa({ voltear: true })}>
              Voltear
            </button>
          </div>
          <div className="consola-instrumento-acciones">
            <button
              type="button"
              className="consola-boton"
              onClick={() => {
                const id = mesaDeModelado.instrumentoId
                if (!id || !caso.instrumental.some((i) => i.id === id)) {
                  anotar('La placa de la mesa ya no está en la bandeja: elija una placa y pique sobre el hueso.', 'atencion')
                  return
                }
                elegirInstrumento(id)
                anotar('Pique sobre el hueso: la placa se apoya con la forma que le dio.', 'bien')
              }}
            >
              Llevar al hueso
            </button>
            <button type="button" className="consola-boton" onClick={() => mando.current?.quitarLaPlacaDeLaMesa()}>
              Quitar de la mesa
            </button>
          </div>
        </>
      )}
    </div>
  ) : null

  const panelDeLaHerramienta = (
instrumentoElegido ? (
            <div className="consola-instrumento">
              {instrumentoElegido.modeloUrl &&
              encuadreDelElegido === undefined ? (
                // Sin pose capturada a mano, el modelo se abre en el visor
                // articulado del taller: con sus retoques, y con los
                // deslizadores que el archivo declare (la tijera se abre). Con
                // pose capturada se respeta la que el traumatólogo eligió: es
                // el visor de siempre, abajo.
                <InstrumentoArticulado
                  key={instrumentoElegido.modeloUrl}
                  url={instrumentoElegido.modeloUrl}
                  ajustes={instrumentoElegido.ajustes ?? null}
                  nombre={instrumentoElegido.nombre}
                  articulaciones={valoresDeArticulacion}
                />
              ) : instrumentoElegido.modeloUrl ? (
                <Visor3D
                  key={instrumentoElegido.modeloUrl}
                  url={instrumentoElegido.modeloUrl}
                  // El instrumento no tiene encuadre propio que ofrecer —lo que
                  // el caso declara es a qué instrumento apunta cada paso, no
                  // cómo mirarlo—, así que el primer argumento va vacío
                  // siempre y manda el del catálogo. Se llama a la regla en vez
                  // de pasar el encuadre a pelo por su tercera rama: un grupo
                  // entero a nulos tiene que salir como `undefined` para que el
                  // visor vuelva a abarcar la pieza él solo, y pasándolo a pelo
                  // el objeto de nulos es verdadero y la cámara se planta a la
                  // distancia por omisión sobre una placa de 100 mm.
                  //
                  // Y aquí importa más que en una ficha: la bandeja enseña un
                  // instrumento cada vez, en un recuadro pequeño y de lado, así
                  // que un taladro que abre torcido o diminuto no se corrige
                  // girándolo —el residente está en mitad de un paso—, se deja
                  // por imposible.
                  encuadre={encuadreDelElegido}
                  nombre={instrumentoElegido.nombre}
                />
              ) : (
                <p className="consola-instrumento-texto">
                  {editor
                    ? 'Este instrumento todavía no tiene modelo 3D: lo carga el administrador en el taller anatómico.'
                    : 'Este instrumento no tiene modelo 3D.'}
                </p>
              )}
              {errorDelInstrumento ? (
                <p className="consola-instrumento-texto">{errorDelInstrumento}</p>
              ) : null}

              {/* Las articulaciones que declara el archivo: abrir la tijera,
                  pulsar el gatillo. Mueven el instrumento de la escena y el
                  del recuadro a la vez, porque leen el mismo valor. */}
              {articulacionesDeclaradas.length > 0 ? (
                <div className="consola-instrumento-articulaciones">
                  {articulacionesDeclaradas.map((a) => (
                    <label key={a.nombre} className="consola-instrumento-articulacion">
                      <span>{a.etiqueta}</span>
                      <input
                        type="range"
                        min={a.min}
                        max={a.max}
                        step={a.unidad === 'mm' ? 0.5 : 1}
                        value={valoresDeArticulacion[a.nombre] ?? a.inicial}
                        onChange={(e) =>
                          setArticulacionesMovidas((antes) => ({ ...antes, [a.nombre]: Number(e.target.value) }))
                        }
                        aria-label={`${a.etiqueta} de ${instrumentoElegido.nombre}`}
                      />
                      <output>
                        {valoresDeArticulacion[a.nombre] ?? a.inicial} {a.unidad}
                      </output>
                    </label>
                  ))}
                </div>
              ) : null}

              {ruedaDelInstrumento ? (
                <p className="consola-instrumento-texto consola-instrumento-rueda">
                  <strong>Rueda del ratón sobre el modelo:</strong>{' '}
                  {ruedaDelInstrumento === 'tira'
                    ? 'hacia delante tira del hilo; hacia atrás lo afloja.'
                    : ruedaDelInstrumento === 'alarga'
                      ? 'hacia delante alarga el tornillo; hacia atrás lo acorta.'
                      : ruedaDelInstrumento === 'separa'
                        ? 'hacia delante abre el separador colocado y la herida; hacia atrás los cierra.'
                        : ruedaDelInstrumento === 'pinza'
                          ? 'hacia delante separa las dos pinzas, tirando de los bordes de la piel; hacia atrás las junta. Con Mayúsculas, hacia delante abre las mandíbulas y hacia atrás las cierra.'
                          : ruedaDelInstrumento === 'potencia'
                            ? 'hacia delante sube la potencia del electrobisturí (de 5 en 5 W); hacia atrás la baja.'
                            : 'hacia delante abre el instrumento; hacia atrás lo cierra.'}{' '}
                  Para acercar el modelo, Ctrl + rueda.
                </p>
              ) : null}

              {guia ? <p className="consola-instrumento-texto consola-instrumento-guia">{guia}</p> : null}

              {queHace.roma ? (
                <div className="consola-submodo" role="group" aria-label="Cómo se usa la tijera">
                  {(
                    [
                      ['cortar', 'Cortar', 'Como una tijera cualquiera: se traza la incisión y la malla se abre a lo largo del trazo.'],
                      ['roma', 'Disección roma', 'Se apoya la punta cerrada, se abren las ramas y el plano se separa por tensión, sin cortar.'],
                    ] as const
                  ).map(([valor, etiqueta, ayuda]) => (
                    <button
                      key={valor}
                      type="button"
                      className={`consola-submodo-boton${usoDeLaTijera === valor ? ' activo' : ''}`}
                      aria-pressed={usoDeLaTijera === valor}
                      title={ayuda}
                      onClick={() => {
                        setUsoDeLaTijera(valor)
                        setModo(valor === 'roma' ? 'disecar' : 'trazar')
                      }}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              ) : null}

              {usoRoma ? (
                <p className="consola-instrumento-texto" role="status">
                  {diseccion?.apoyada
                    ? diseccion.aperturas > 0
                      ? `Punta apoyada en ${diseccion.capa === 'piel' ? 'la piel' : 'el músculo'} · ${diseccion.aperturas} ${diseccion.aperturas === 1 ? 'apertura' : 'aperturas'}. Abra las ramas con la rueda; para avanzar, haga clic más allá.`
                      : `Punta apoyada en ${diseccion.capa === 'piel' ? 'la piel' : 'el músculo'}. Abra las ramas con la rueda del ratón: el plano se separa por tensión.`
                    : 'Haga clic en el tejido para apoyar la punta cerrada; después se abren las ramas con la rueda del ratón y el plano se separa por tensión, sin cortar. Para avanzar, otro clic más allá.'}
                </p>
              ) : queHace.corta ? (
                <p className="consola-instrumento-texto">
                  Corta {queHace.corta === 'piel' ? 'la piel' : 'los planos de debajo de la piel'}: en el modo
                  «Trazar», dos clics marcan el inicio y el final de la incisión (o arrastre, a mano alzada, si
                  elige esa opción). La malla se abre a lo largo del trazo.
                </p>
              ) : null}

              {queHace.electro ? (
                <div className="consola-instrumento-articulaciones">
                  <div className="consola-electro-modos" role="group" aria-label="Modo del electrobisturí">
                    {(
                      [
                        ['corte', 'Corte', 'CUT'],
                        ['coagulacion', 'Coagulación', 'COAG'],
                      ] as const
                    ).map(([valor, nombre, boton]) => (
                      <button
                        key={valor}
                        type="button"
                        className={`consola-electro-modo ${valor}${modoElectro === valor ? ' activo' : ''}`}
                        aria-pressed={modoElectro === valor}
                        onClick={() => setModoElectro(valor)}
                      >
                        {nombre} <small>{boton}</small>
                      </button>
                    ))}
                  </div>
                  <label className="consola-instrumento-articulacion">
                    <span>Potencia</span>
                    <input
                      type="range"
                      min={0}
                      max={POTENCIA_MAXIMA_W}
                      step={1}
                      value={potenciaW}
                      onChange={(e) => setPotenciaW(limitarPotencia(Number(e.target.value)))}
                      aria-label="Potencia del electrobisturí en vatios"
                    />
                    <output>{potenciaW} W</output>
                  </label>
                  <p
                    className={`consola-instrumento-texto${juicioDeLaPotencia(modoElectro, potenciaW).atencion ? ' consola-herida-aviso' : ''}`}
                    role="status"
                  >
                    {juicioDeLaPotencia(modoElectro, potenciaW).texto} Escala de 0 a {POTENCIA_MAXIMA_W} W; lo habitual al{' '}
                    {modoElectro === 'corte' ? 'cortar' : 'coagular'}: {RANGO_HABITUAL[modoElectro][0]}–{RANGO_HABITUAL[modoElectro][1]} W.
                  </p>
                </div>
              ) : null}

              {queHace.pellizca ? (
                <div className="consola-instrumento-articulaciones">
                  <label className="consola-interruptor" title="Al terminar un corte, la pareja de pinzas y la de separadores más cercanas a la punta se corren tras ella, unos 15 mm por detrás.">
                    <span>Acompañar el bisturí</span>
                    <input type="checkbox" role="switch" checked={acompanarAlBisturi} onChange={(e) => setAcompanarAlBisturi(e.target.checked)} />
                    <span className="consola-interruptor-pista" aria-hidden />
                  </label>
                  <p className="consola-instrumento-texto">
                    {pellizcos?.tension === 'tensa'
                      ? 'Piel tensa: los dos bordes están tomados con pinza con dientes.'
                      : pellizcos?.tension === 'un-borde'
                        ? 'Un borde tomado: falta la pinza del otro lado (la del ayudante).'
                        : adviertePorLaTension('ninguna')}
                  </p>
                  {pellizcos && pellizcos.lista.length > 0 ? (
                    <ul className="consola-separadores">
                      {pellizcos.lista.map((q) => (
                        <li key={q.id} className={q.id === pellizcos.activo ? 'activo' : ''}>
                          <button
                            type="button"
                            className="consola-separador-nombre"
                            onClick={() => mando.current?.elegirPellizco(q.id)}
                          >
                            Pinza {q.conDientes ? 'con dientes' : 'sin dientes'} · {q.lado === 0 ? 'sin borde' : q.lado > 0 ? 'borde A' : 'borde B'} ·{' '}
                            {Math.round(q.alturaMm)} mm
                          </button>
                          <button
                            type="button"
                            className="consola-separador-quitar"
                            aria-label="Soltar la piel"
                            onClick={() => mando.current?.soltarPellizco(q.id)}
                          >
                            <X size={14} aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {pellizcos && pellizcos.lista.length > 0 ? (
                    <label className="consola-instrumento-articulacion">
                      <span>Levantar</span>
                      <input
                        type="range"
                        min={0}
                        max={ALTURA_MAXIMA_DEL_PELLIZCO_MM}
                        step={1}
                        value={Math.round(pellizcos.lista.find((q) => q.id === pellizcos.activo)?.alturaMm ?? 0)}
                        onChange={(e) => {
                          const activo = pellizcos.lista.find((q) => q.id === pellizcos.activo)
                          if (activo) mando.current?.levantarPellizco(Number(e.target.value) - activo.alturaMm)
                        }}
                        aria-label="Cuánto levanta la pinza la piel"
                      />
                      <output>{Math.round(pellizcos.lista.find((q) => q.id === pellizcos.activo)?.alturaMm ?? 0)} mm</output>
                    </label>
                  ) : null}
                  {pellizcos && pellizcos.lista.length > 0 ? (
                    <>
                      <label className="consola-instrumento-articulacion">
                        <span>Separar</span>
                        <input
                          type="range"
                          min={0}
                          max={SEPARACION_MAXIMA_DE_PINZAS_MM}
                          step={0.5}
                          value={Math.max(...pellizcos.lista.map((q) => q.separacionMm))}
                          onChange={(e) =>
                            mando.current?.separarPinzas(
                              Number(e.target.value) - Math.max(...pellizcos.lista.map((q) => q.separacionMm)),
                            )
                          }
                          aria-label="Cuánto se separan las pinzas, tirando de los bordes de la piel"
                        />
                        <output>{Math.max(...pellizcos.lista.map((q) => q.separacionMm)).toFixed(0)} mm</output>
                      </label>
                      <label className="consola-instrumento-articulacion">
                        <span>Mandíbulas</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={10}
                          value={Math.round(Math.min(...pellizcos.lista.map((q) => q.agarre)) * 100)}
                          onChange={(e) =>
                            mando.current?.abrirMandibulas(
                              (Math.min(...pellizcos.lista.map((q) => q.agarre)) - Number(e.target.value) / 100) / PASO_DE_AGARRE,
                            )
                          }
                          aria-label="Cuánto están cerradas las mandíbulas de las pinzas"
                        />
                        <output>{Math.round(Math.min(...pellizcos.lista.map((q) => q.agarre)) * 100)} % cerradas</output>
                      </label>
                    </>
                  ) : null}
                  {pellizcos && pellizcos.lista.length > 0 ? (
                    <div className="consola-instrumento-acciones">
                      <button type="button" className="consola-boton" onClick={() => mando.current?.soltarPellizco()}>
                        Soltar la piel
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {queHace.reduce ? (
                <div className="consola-instrumento-articulaciones">
                  <p className="consola-instrumento-texto">
                    Pinza de reducción: haga clic en un trozo de hueso para agarrarlo. Llévelo a su sitio con las flechas y los aros
                    mirando la fluoroscopia; la pinza va con él. Un clic en la pinza la suelta. Caben dos: la de quien opera y la del
                    ayudante.
                  </p>
                  {/* Manual o automática (P-004 E7, pedido 6): la automática quita todo el desplazamiento de una vez, para no
                      entramparse en la reducción cuando el objetivo es otro; el ejercicio de reducir queda sin puntuar. */}
                  <div className="consola-submodo" role="group" aria-label="Reducción">
                    <button type="button" className="consola-submodo-boton activo" aria-pressed="true" title="Se reduce con la pinza, a mano: es lo que puntúa.">
                      Manual
                    </button>
                    <button
                      type="button"
                      className="consola-submodo-boton"
                      aria-pressed={false}
                      title="Lleva el fragmento a su sitio de una vez. El paso de reducir se da por hecho y no suma puntos."
                      onClick={reducirAutomaticamente}
                    >
                      Automática
                    </button>
                  </div>
                  {pinzasDeReduccion && pinzasDeReduccion.pinzas.length > 0 ? (
                    <>
                      <ul className="consola-separadores">
                        {pinzasDeReduccion.pinzas.map((q) => (
                          <li key={q.id}>
                            <span className="consola-separador-nombre">
                              {q.nombre} · {q.pieza || 'trozo'}
                            </span>
                            <button
                              type="button"
                              className="consola-separador-quitar"
                              aria-label={`Soltar ${q.nombre}`}
                              onClick={() => mando.current?.soltarPinzaDeReduccion(q.id)}
                            >
                              <X size={14} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="consola-instrumento-acciones">
                        <button type="button" className="consola-boton" onClick={() => mando.current?.soltarPinzaDeReduccion()}>
                          Soltar la pinza
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {queHace.separa ? (
                <div className="consola-instrumento-articulaciones">
                  {/* El plano en que se apoya el separador (petición de Cristóbal): la piel para abrir campo, o más
                      profundo, el músculo. El Hohmann se apoya en el hueso y no elige. */}
                  {!queHace.separa.apoyoEnHueso ? (
                    <div className="consola-submodo" role="group" aria-label="Plano en que se apoya el separador">
                      {(
                        [
                          ['auto', 'Automático', 'El clic decide: en el labio de una herida pone el separador en su plano; sobre un músculo, lejos de toda herida, lo retrae.'],
                          ['piel', 'Piel', 'Apoya el separador en la piel: abre la piel y deja ver el plano de abajo.'],
                          ['musculo', 'Músculo', 'Apoya el separador más profundo, en el músculo: separa el músculo y la piel que tiene encima.'],
                        ] as const
                      ).map(([valor, etiqueta, ayuda]) => (
                        <button
                          key={valor}
                          type="button"
                          className={`consola-submodo-boton${planoDeSeparador === valor ? ' activo' : ''}`}
                          aria-pressed={planoDeSeparador === valor}
                          title={ayuda}
                          onClick={() => setPlanoDeSeparador(valor)}
                        >
                          {etiqueta}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {!queHace.separa.apoyoEnHueso && !queHace.separa.autoestatico ? (
                    <label className="consola-interruptor" title="Un clic pone los dos separadores, uno por borde, a la misma altura. La rueda abre los dos por igual; la barra del panel, solo el elegido.">
                      <span>En pareja</span>
                      <input type="checkbox" role="switch" checked={separadoresEnPareja} onChange={(e) => setSeparadoresEnPareja(e.target.checked)} />
                      <span className="consola-interruptor-pista" aria-hidden />
                    </label>
                  ) : null}
                  <label className="consola-interruptor" title="Al terminar un corte, la pareja de pinzas y la de separadores más cercanas a la punta se corren tras ella, unos 15 mm por detrás.">
                    <span>Acompañar el bisturí</span>
                    <input type="checkbox" role="switch" checked={acompanarAlBisturi} onChange={(e) => setAcompanarAlBisturi(e.target.checked)} />
                    <span className="consola-interruptor-pista" aria-hidden />
                  </label>
                  <p className="consola-instrumento-texto">
                    {queHace.separa.apoyoEnHueso
                      ? 'Haga clic sobre el hueso: el separador se apoya en su borde y retrae las partes blandas de ese lado.'
                      : queHace.separa.autoestatico
                        ? 'Autoestático: haga clic en el punto de la incisión donde quiere ponerlo; se clava a los dos bordes y se queda abierto solo.'
                        : separadoresEnPareja
                          ? 'De mano, en pareja: un clic junto a la herida pone los dos, uno por borde. Un clic en uno puesto lo levanta; otro clic lo deja donde se apunte (Esc lo devuelve).'
                          : 'De mano: haga clic junto al borde de la herida que quiere sostener; abre ese borde y el otro lo sostiene el ayudante (otra hoja). Un clic en uno puesto lo levanta; otro clic lo deja.'}{' '}
                    Después se abre con la rueda del ratón o con la barra de abajo, hasta {queHace.separa.maximoMm} mm.{' '}
                    {herida && herida.capas.length > 0 ? '' : 'Aún no hay herida: corte antes con un bisturí.'}
                  </p>
                  {separadores && separadores.lista.length > 0 ? (
                    <>
                      <ul className="consola-separadores">
                        {separadores.lista.map((q) => (
                          <li key={q.id} className={q.id === separadores.activo ? 'activo' : ''}>
                            <button
                              type="button"
                              className="consola-separador-nombre"
                              onClick={() => mando.current?.elegirSeparador(q.id)}
                            >
                              {q.nombre} · {q.lado === 0 ? 'los dos bordes' : q.lado > 0 ? 'borde A' : 'borde B'} ·{' '}
                              {ETIQUETA_DEL_PLANO[q.plano]} · {q.aperturaMm} mm
                            </button>
                            {q.tipo !== 'palanca' ? (
                              <button
                                type="button"
                                className="consola-separador-plano"
                                title={
                                  q.plano === 'piel'
                                    ? 'Apoyar este separador más profundo, en el músculo'
                                    : 'Volver a apoyar este separador en la piel'
                                }
                                onClick={() => mando.current?.cambiarPlanoDelSeparador(q.id, q.plano === 'piel' ? 'musculo' : 'piel')}
                              >
                                {q.plano === 'piel' ? (
                                  <>
                                    <ArrowDownToLine size={13} aria-hidden /> Al músculo
                                  </>
                                ) : (
                                  <>
                                    <ArrowUpFromLine size={13} aria-hidden /> A la piel
                                  </>
                                )}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="consola-separador-quitar"
                              aria-label={`Quitar ${q.nombre}`}
                              onClick={() => mando.current?.quitarSeparador(q.id)}
                            >
                              <X size={14} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                      {(() => {
                        const activo = separadores.lista.find((q) => q.id === separadores.activo)
                        if (!activo) return null
                        return (
                          <label className="consola-instrumento-articulacion">
                            <span>Apertura</span>
                            <input
                              type="range"
                              min={0}
                              max={activo.maximoMm}
                              step={1}
                              value={activo.aperturaMm}
                              onChange={(e) => mando.current?.abrirSeparador(Number(e.target.value))}
                              aria-label={`Apertura de ${activo.nombre}`}
                            />
                            <output>{activo.aperturaMm} mm</output>
                          </label>
                        )
                      })()}
                      <p className="consola-instrumento-texto">
                        Herida abierta: {Math.round(aperturaMaxima(separadores.lista))} mm.
                      </p>
                      <div className="consola-instrumento-acciones">
                        <button type="button" className="consola-boton" onClick={() => mando.current?.quitarSeparador()}>
                          Quitar los separadores
                        </button>
                      </div>
                    </>
                  ) : null}
                  {/* Los músculos retraídos con un clic (P-004 E5, pedido 10): una fila por estructura separada, la que
                      responde a la rueda marcada. «Cortar» sigue desde ahí sin pasar por la ficha. */}
                  {retracciones.length > 0 ? (
                    <>
                      <h4 className="consola-subtitulo">Estructuras separadas</h4>
                      <ul className="consola-separadores">
                        {retracciones.map((r) => (
                          <li key={r.id} className={r.activa ? 'activo' : ''}>
                            <button type="button" className="consola-separador-nombre" onClick={() => mando.current?.elegirRetraccion(r.id)}>
                              {r.nodo.replace(/_/g, ' ')} · {Math.round(r.aperturaMm)} mm
                            </button>
                            <button
                              type="button"
                              className="consola-separador-plano"
                              title="Apartar este músculo hacia el otro lado (hacia delante o hacia atrás)"
                              onClick={() => mando.current?.invertirRetraccion(r.id)}
                            >
                              <ArrowLeftRight size={13} aria-hidden /> Otro lado
                            </button>
                            <button
                              type="button"
                              className="consola-separador-plano"
                              title="Cortar este músculo: el instrumento de corte pasa a la mano y la incisión queda marcada"
                              onClick={() => cortarElMusculoSeparado(r.nodo)}
                            >
                              <Scissors size={13} aria-hidden /> Cortar
                            </button>
                            <button
                              type="button"
                              className="consola-separador-quitar"
                              aria-label={`Soltar ${r.nodo.replace(/_/g, ' ')}`}
                              onClick={() => mando.current?.soltarRetraccion(r.id)}
                            >
                              <X size={14} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="consola-instrumento-texto">
                        La rueda abre o cierra el músculo marcado; Mayúsculas + rueda corre la zona retraída a lo largo del músculo. Otro clic en otro músculo lo separa también.
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}

              {queHace.perfora ? (
                <div className="consola-instrumento-articulaciones">
                  {(
                    [
                      ['longitudinal', 'A lo largo del hueso'],
                      ['transversal', 'A lo ancho'],
                    ] as const
                  ).map(([eje, etiqueta]) => (
                    <label key={eje} className="consola-instrumento-articulacion">
                      <span>{etiqueta}</span>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        step={1}
                        value={inclinacionDeBroca[eje]}
                        onChange={(e) =>
                          setInclinacionDeBroca((antes) => ({ ...antes, [eje]: Number(e.target.value) }))
                        }
                        aria-label={`Inclinación de la broca ${etiqueta.toLowerCase()}`}
                      />
                      <output>{inclinacionDeBroca[eje]}°</output>
                    </label>
                  ))}
                  <div className="consola-instrumento-acciones">
                    <button
                      type="button"
                      className="consola-boton"
                      onClick={() => setInclinacionDeBroca({ longitudinal: 0, transversal: 0 })}
                    >
                      Perpendicular a la cortical
                    </button>
                    <button type="button" className="consola-boton" onClick={() => mando.current?.borrarAgujeros()}>
                      Quitar agujeros
                    </button>
                  </div>
                  {/* La broca puesta (P-004 E8, pedidos 3 y 13): se queda en el hoyo mientras se va a pedir el disparo. */}
                  {broca ? (
                    <>
                      <p className="consola-instrumento-texto" role="status">
                        Broca Ø {String(broca.diametroMm).replace('.', ',')} mm puesta{broca.agujero ? ` en el agujero ${broca.agujero}` : ''}:{' '}
                        {textoDeLaBroca(broca.lectura, { encendida: broca.encendida, ayudaDeAprendizaje: ayudas.objetivo })}. Se mete y se saca con la
                        rueda (Mayúsculas afina) y se queda ahí mientras pide el disparo.
                      </p>
                      <div className="consola-instrumento-acciones">
                        <button type="button" className="consola-boton" onClick={() => mando.current?.apagarLaBroca()}>
                          {broca.encendida ? 'Apagar la broca' : 'Encender la broca'}
                        </button>
                        <button type="button" className="consola-boton" onClick={() => mando.current?.retirarLaBroca()}>
                          Retirar
                        </button>
                      </div>
                    </>
                  ) : null}
                  {bloqueDeLaSecuencia}
                  {bloqueDeLaTrayectoria}
                  {bloqueDeLaCompresion}
                </div>
              ) : null}

              {bloqueDeLaMesa}

              {queHace.coloca || queHace.mide ? (
                <div className="consola-instrumento-articulaciones">
                  <p className="consola-instrumento-texto">
                    {queHace.coloca?.tipo === 'placa'
                      ? 'Pase al modo «Fijar» y pique sobre el hueso: la placa se apoya con su largo siguiendo el hueso. Después se la lleva hacia proximal o distal, anterior o posterior, o se la angula —escribiendo la cifra o con los botones— y se pulsa «Fijar la placa». Con una puesta, la que se lleva en la mano ya no sale.'
                      : queHace.coloca?.tipo === 'tornillo'
                        ? 'Con la placa fijada: perfore el agujero con la broca, mídalo con el medidor y entonces pique en él. El tornillo entra perpendicular a la placa.'
                        : 'Con la placa fijada y el agujero perforado, apoye el medidor en él: dice cuánto hueso hay debajo y qué tornillo pedir.'}
                  </p>
                  {queHace.coloca?.tipo === 'placa' ? bloqueDeLaPlacaParaLaMesa : null}
                  {bloqueDeLaSecuencia}
                  {bloqueDeLaTrayectoria}
                  {bloqueDeLaCompresion}
                  {/* El diámetro, de una lista según el tipo (P-004 E9, pedido 12): cambia el grosor del tornillo y la broca que se espera. */}
                  {queHace.coloca?.tipo === 'tornillo' ? (
                    <label className="consola-instrumento-articulacion">
                      <span>Diámetro</span>
                      <select
                        value={diametroDeTornillo ?? queHace.coloca.diametroMm}
                        onChange={(e) => setDiametroDeTornillo(Number(e.target.value))}
                        aria-label="Diámetro del tornillo"
                      >
                        {diametrosDelTipo(tipoDelElegido, queHace.coloca.diametroMm).map((d) => (
                          <option key={d} value={d}>
                            {String(d).replace('.', ',')} mm
                          </option>
                        ))}
                      </select>
                      <output>broca Ø {String(calibreDeBrocaParaElTornillo(diametroDeTornillo ?? queHace.coloca.diametroMm)).replace('.', ',')}</output>
                    </label>
                  ) : null}
                  {/* El largo se escribe (P-004 E6, pedido 5): el medidor deja escrito el sugerido y la rueda lo corre de a 2 mm. */}
                  {queHace.coloca?.tipo === 'tornillo' ? (
                    <CampoNumerico
                      etiqueta="Largo del tornillo"
                      valor={largoDeTornillo}
                      minimo={MINIMO_DEL_TORNILLO_MM}
                      maximo={MAXIMO_DEL_TORNILLO_MM}
                      paso={2}
                      unidad="mm"
                      alConfirmar={setLargoDeTornillo}
                    />
                  ) : null}
                  {/* Ajustar la placa puesta y darla por buena (P-003 E6): subirla y bajarla a lo largo del hueso,
                      rodearlo, angularla; tras cada movimiento se vuelve a asentar. Fijada, ya no se mueve y se perfora. */}
                  {fijacion?.placa && !fijacion.placa.fijada ? (
                    <>
                      {(() => {
                        // Con las direcciones del paciente (P-004 E6, pedido 2): proximal y distal a lo largo del hueso,
                        // anterior y posterior alrededor de él, y la angulación en grados. Los rangos salen del hueso.
                        const ajuste = fijacion.placa?.ajuste ?? { largoMm: 0, ladoMm: 0, giroGrados: 0 }
                        const rangos = fijacion.placa?.rangos ?? {
                          largoMm: { min: -40, max: 40 },
                          ladoMm: { min: -15, max: 15 },
                          giroGrados: { min: -90, max: 90 },
                        }
                        const sentidoDelLado = fijacion.placa?.sentidoDelLado ?? 0
                        const positivoDelLado = sentidoDelLado === 0 ? null : sentidoDelLado > 0 ? 'anterior' : 'posterior'
                        const negativoDelLado = sentidoDelLado === 0 ? null : sentidoDelLado > 0 ? 'posterior' : 'anterior'
                        const cambiar = (campo: 'largoMm' | 'ladoMm' | 'giroGrados', n: number) =>
                          mando.current?.ajustarLaPlaca({ ...ajuste, [campo]: n }) ?? false
                        return (
                          <>
                            <CampoNumerico
                              etiqueta="Proximal ↔ distal"
                              valor={ajuste.largoMm}
                              minimo={rangos.largoMm.min}
                              maximo={rangos.largoMm.max}
                              unidad="mm"
                              textoDelMenos="Distal"
                              textoDelMas="Proximal"
                              pie={textoDelDesplazamiento(ajuste.largoMm, 'proximal', 'distal')}
                              alConfirmar={(n) => cambiar('largoMm', n)}
                            />
                            <CampoNumerico
                              etiqueta="Anterior ↔ posterior"
                              valor={ajuste.ladoMm}
                              minimo={rangos.ladoMm.min}
                              maximo={rangos.ladoMm.max}
                              unidad="mm"
                              textoDelMenos={negativoDelLado === 'anterior' ? 'Anterior' : negativoDelLado === 'posterior' ? 'Posterior' : '−'}
                              textoDelMas={positivoDelLado === 'anterior' ? 'Anterior' : positivoDelLado === 'posterior' ? 'Posterior' : '+'}
                              pie={textoDelDesplazamiento(ajuste.ladoMm, positivoDelLado, negativoDelLado)}
                              alConfirmar={(n) => cambiar('ladoMm', n)}
                            />
                            <CampoNumerico
                              etiqueta="Angulación"
                              valor={ajuste.giroGrados}
                              minimo={rangos.giroGrados.min}
                              maximo={rangos.giroGrados.max}
                              unidad="°"
                              pie={ajuste.giroGrados === 0 ? 'Siguiendo el eje del hueso' : `Girada ${Math.abs(ajuste.giroGrados)}° a un lado del eje del hueso`}
                              alConfirmar={(n) => cambiar('giroGrados', n)}
                            />
                            {fijacion.placa?.agujerosDelModelo === false ? (
                              <p className="consola-instrumento-texto">Los agujeros se repartieron a partes iguales por los orificios que escribió el editor: su posición es aproximada.</p>
                            ) : null}
                            {fijacion.placa?.aviso ? <p className="consola-instrumento-texto">{fijacion.placa.aviso}</p> : null}
                          </>
                        )
                      })()}
                      <div className="consola-instrumento-acciones">
                        <button type="button" className="consola-boton" onClick={() => mando.current?.fijarLaPlaca(true)}>
                          Fijar la placa
                        </button>
                      </div>
                    </>
                  ) : null}
                  {fijacion?.placa?.fijada ? (
                    <>
                      <ul className="consola-separadores" aria-label="Agujeros de la placa">
                        {Array.from({ length: fijacion.placa.agujeros }, (_, i) => {
                          const a = fijacion.agujeros?.find((x) => x.indice === i)
                          const t = fijacion.tornillos.find((x) => x.agujero === i)
                          return (
                            <li key={i}>
                              <span className="consola-separador-nombre">
                                Agujero {i + 1} ·{' '}
                                {t
                                  ? `tornillo de ${t.largoMm} mm`
                                  : a?.perforado
                                    ? `perforado Ø ${String(a.perforado.diametroMm).replace('.', ',')}${a.medido ? ` · medido ${Math.round(a.medido.espesorMm)} mm` : ' · falta medir'}`
                                    : 'sin perforar'}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                      <div className="consola-instrumento-acciones">
                        <button type="button" className="consola-boton" onClick={() => mando.current?.fijarLaPlaca(false)}>
                          Soltar el ajuste
                        </button>
                      </div>
                    </>
                  ) : null}
                  {fijacion?.placa ? (
                    <p className="consola-instrumento-texto">
                      {fijacion.placa.nombre}: {fijacion.tornillos.length} de {fijacion.placa.agujeros} agujeros con
                      tornillo
                      {fijacion.tornillos.length > 0
                        ? `, ${resumenDeLaFijacion(fijacion).bicorticales} bicorticales`
                        : ''}
                      .
                    </p>
                  ) : null}
                  <div className="consola-instrumento-acciones">
                    <button
                      type="button"
                      className="consola-boton"
                      disabled={!fijacion || fijacion.tornillos.length === 0}
                      onClick={() => mando.current?.quitarImplantes(false)}
                    >
                      Quitar los tornillos
                    </button>
                    <button
                      type="button"
                      className="consola-boton"
                      disabled={!fijacion}
                      onClick={() => mando.current?.quitarImplantes(true)}
                    >
                      Quitar la placa
                    </button>
                  </div>
                </div>
              ) : null}

              {queHace.sutura ? (
                <div className="consola-instrumento-articulaciones">
                  <p className="consola-instrumento-texto">
                    Cose: pase al modo «Coser» y pique con un clic sobre la piel. Cada clic suma una puntada y el
                    hilo queda dibujado entre una y otra, de {queHace.sutura.nombre}. Una puntada que cae al otro
                    lado de la herida es la que la cierra, pero el hilo está flojo hasta que se tira de él: con la
                    rueda del ratón (o el deslizador) se aprieta y los bordes se acercan. Lo habitual en piel es de 5 a
                    10 mm entre puntadas, y apretar de más estrangula el borde.
                  </p>
                  {sutura ? (
                    <dl className="consola-sutura-medidas">
                      <div>
                        <dt>Puntadas</dt>
                        <dd>{sutura.puntadas}</dd>
                      </div>
                      <div>
                        <dt>Hilo</dt>
                        <dd>{Math.round(sutura.largoDeHiloMm)} mm</dd>
                      </div>
                      <div>
                        <dt>Cruzan la herida</dt>
                        <dd>{sutura.cruces}</dd>
                      </div>
                      <div>
                        <dt>Separación media</dt>
                        <dd>{sutura.tramos > 0 ? `${sutura.separacionMediaMm.toFixed(1).replace('.', ',')} mm` : '—'}</dd>
                      </div>
                      <div>
                        <dt>Tensión del hilo</dt>
                        <dd>{Math.round(sutura.tension * 100)} %</dd>
                      </div>
                      <div>
                        <dt>Herida cerrada</dt>
                        <dd>{herida && herida.capas.length > 0 ? `${Math.round(sutura.cierre * 100)} %` : 'sin herida'}</dd>
                      </div>
                    </dl>
                  ) : null}
                  {sutura && sutura.puntadas > 0 ? (
                    <div className="consola-sutura-tension">
                      <label className="consola-instrumento-articulacion">
                        <span>Tirar del hilo</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(sutura.tension * 100)}
                          onChange={(e) => mando.current?.tensarSutura(Number(e.target.value) / 100)}
                          aria-label="Tensión del hilo"
                        />
                        <output>{Math.round(sutura.tension * 100)} %</output>
                      </label>
                      <div className="consola-instrumento-acciones">
                        <button
                          type="button"
                          className="consola-boton"
                          onClick={() => mando.current?.tensarSutura((mando.current?.tensionDeLaSutura() ?? 0) + 0.1)}
                        >
                          Tirar del hilo
                        </button>
                        <button
                          type="button"
                          className="consola-boton"
                          onClick={() => mando.current?.tensarSutura((mando.current?.tensionDeLaSutura() ?? 0) - 0.1)}
                        >
                          Aflojar
                        </button>
                      </div>
                      {sutura.juicioDeLaTension ? (
                        <p
                          className={`consola-instrumento-texto${sutura.juicioDeLaTension.atencion ? ' consola-herida-aviso' : ''}`}
                          role="status"
                        >
                          {sutura.juicioDeLaTension.texto}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="consola-instrumento-acciones">
                    <button
                      type="button"
                      className="consola-boton"
                      disabled={!sutura}
                      onClick={() => mando.current?.deshacerPuntada()}
                    >
                      Deshacer la última
                    </button>
                    <button
                      type="button"
                      className="consola-boton"
                      disabled={!sutura}
                      onClick={() => mando.current?.nuevaLineaDeSutura()}
                    >
                      Cortar el hilo
                    </button>
                    <button
                      type="button"
                      className="consola-boton"
                      disabled={!sutura}
                      onClick={() => mando.current?.quitarSutura()}
                    >
                      Quitar la sutura
                    </button>
                  </div>
                </div>
              ) : null}

              {instrumentoElegido.descripcion ? (
                <p className="consola-instrumento-texto">{instrumentoElegido.descripcion}</p>
              ) : null}

              <div className="consola-instrumento-acciones">
                <button type="button" className="consola-boton" onClick={() => elegirInstrumento(null)}>
                  Soltar
                </button>
                {editor ? (
                  <>
                    <button
                      type="button"
                      className="consola-boton"
                      onClick={() => editor.alUsarEnElPaso(instrumentoElegido.id)}
                      disabled={editor.instrumentoDelPaso === instrumentoElegido.id}
                    >
                      Es el correcto en este paso
                    </button>
                    <button
                      type="button"
                      className="consola-boton"
                      onClick={() => editor.alAlternarEnLaBandeja(instrumentoElegido.id)}
                    >
                      {instrumentoElegido.enLaBandejaDelCaso ? 'Quitar de la bandeja' : 'Añadir a la bandeja'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null
  )

  return (
    <section
      ref={raizDeLaConsola}
      className={`consola mod-4${terminado ? ' consola-terminada' : ''}${editor ? ' consola-editor' : ''}`}
      aria-labelledby="consola-titulo"
    >
      {/* --------------------------------------------------------- barra */}
      {/* El nombre del caso ya es el <h1> de la página, y la barra lo repetía
          en un <h2> idéntico a 200 px. Aquí se nombra la herramienta y se
          dejan los datos del caso, que es lo que se consulta con el caso
          abierto. */}
      <header className="consola-barra">
        <div className="consola-identidad">
          <span className="consola-insignia" aria-hidden>
            <Scissors size={18} />
          </span>
          <div>
            <p className="consola-rotulo">
              Módulo 04 · Simulador{editor ? ' · editando: lo que ve el residente' : ''}
            </p>
            <h2 id="consola-titulo" className="consola-titulo">
              Consola de reducción y fijación
            </h2>
          </div>
        </div>
        <dl className="consola-datos">
          {caso.hueso ? (
            <div>
              <dt>Hueso</dt>
              <dd>{caso.hueso}</dd>
            </div>
          ) : null}
          {caso.clasificacion ? (
            <div>
              <dt>Clasificación AO</dt>
              <dd>
                {caso.clasificacion}
                {/* El código lo compone el servidor con el número del hueso y
                    el de la clasificación; aquí solo se muestra si existe. */}
                {codigo ? <span className="consola-codigo">{codigo}</span> : null}
              </dd>
            </div>
          ) : null}
          {caso.tecnica ? (
            <div>
              <dt>Técnica</dt>
              <dd>{caso.tecnica}</dd>
            </div>
          ) : null}
        </dl>
        {/* El tope lo da `puntajeMaximo`, que suma los pasos enteros, mientras
            que el acierto tras un fallo cobra la mitad y tras una complicación
            no cobra nada (`puntosDelPaso`). O sea: este número es la referencia
            del caso, y en cuanto se falla un paso ya no se puede igualar. Está
            puesto así a propósito; lo que no se puede hacer es cambiar una de
            las dos cuentas sin la otra. */}
        <div className="consola-marcador">
          <div className="consola-puntaje" aria-label={`Puntaje: ${puntaje} de ${maximo}`}>
            <span className="consola-puntaje-numero u-num">{puntaje}</span>
            <span className="consola-puntaje-total u-num">/ {maximo}</span>
          </div>
          <span className="consola-puntaje-medidor" aria-hidden>
            <span style={{ width: `${maximo > 0 ? Math.round((puntaje / maximo) * 100) : 0}%` }} />
          </span>
          {/* Lo que quedó de la vez anterior, en el sitio donde el residente
              mira al llegar, pero en pequeño: el marcador grande cuenta el
              recorrido de ahora y arranca en cero a propósito. Lo guardado es
              un estado —el último recorrido—, no un punto de guardado, así que
              no se sabe qué pasos tenía resueltos. Sumarlo al marcador y
              dejarle repetir el caso le cobraría los mismos pasos dos veces, y
              el número subiría solo con recargar. El detalle está abajo, en
              «Su recorrido anterior». */}
          {recorridoGuardado ? (
            <span className="consola-puntaje-anterior u-num">
              anterior {recorridoGuardado.puntaje}
              {recorridoGuardado.puntajeMaximo !== null ? ` de ${recorridoGuardado.puntajeMaximo}` : ''}
            </span>
          ) : null}
        </div>
        {/* «Reiniciar» tira todo el avance del caso y estaba a ocho píxeles del
            «/ 12», leído de corrido como una tercera pieza del marcador. Ahora
            va aparte, sin relleno y con su icono, y antes de borrar pregunta
            con el diálogo propio (`reiniciar`). */}
        <button type="button" className="consola-reiniciar" onClick={() => void reiniciar()}>
          <RotateCcw size={16} aria-hidden /> {editor ? 'Reiniciar el ensayo' : 'Reiniciar caso'}
        </button>
      </header>

      {/* ---------------------------------------------------------- pasos */}
      {/* Arriba y no debajo del lienzo: es la barra de progreso del caso, y
          debajo quedaba entre las medidas y el pie, fuera de la vista en el
          portátil de referencia. Se desplaza en horizontal como el guion de
          pabellón cuando no cabe. */}
      <div className="consola-pasos-fila">
      <ol className="consola-pasos" aria-label="Pasos del caso">
        {caso.pasos.map((p, i) => {
          const estado = estadoDelPaso(p, i)
          const contenido = (
            <>
              <span className="consola-paso-marca" aria-hidden>
                {estado === 'resuelto' ? (
                  <Check size={14} strokeWidth={3} />
                ) : estado.includes('complicado') ? (
                  <AlertTriangle size={13} strokeWidth={2.5} />
                ) : (
                  i + 1
                )}
              </span>
              <span className="consola-paso-texto">
                <span className="consola-paso-titulo">{p.titulo}</span>
                {p.faseNombre ? <span className="consola-paso-fase">{p.faseNombre}</span> : null}
                <span className="sr-only">
                  Paso {i + 1}: {PALABRA_DEL_ESTADO[estado]}
                </span>
              </span>
            </>
          )
          return (
            <li
              key={p.id}
              className={`consola-paso ${estado}`}
              aria-current={i === indice ? 'step' : undefined}
            >
              {/* En el editor cada paso es un botón: se salta a cualquiera, en
                  cualquier orden, que es lo que hace falta para escribirlos.
                  El residente los recorre en orden y no se toca. */}
              {editor ? (
                <button type="button" className="consola-paso-boton" onClick={() => irAlPaso(i)}>
                  {contenido}
                </button>
              ) : (
                contenido
              )}
            </li>
          )
        })}
      </ol>
      {editor ? <div className="consola-pasos-acciones">{editor.barraDePasos}</div> : null}
      </div>

      {/* ------------------------------------------------ columna izquierda */}
      {/* Sin `consola-panel-izq` ni `<aside>`: en pantalla estrecha esta
          columna se deshace (`display: contents`) para que el modo suba
          encima del lienzo y las capas bajen debajo, y un `<aside>` con
          `display: contents` pierde su papel en algunos lectores de pantalla. */}
      <div className="consola-izq">
        {/* Cómo está el paciente en la mesa. Antes solo se podía orbitar con el miembro vertical, como de pie, y nadie
            opera así: «Supino» y «Prono» lo acuestan con un clic, y el giro libre deja inclinarlo a gusto. Mueve la
            vista y no el modelo, así que lo que ya está puesto (separadores, pinzas, hilo, placa) no se descoloca. */}
        <div className="consola-paciente-bloque">
          <h3 className="consola-subtitulo" id="consola-posicion">
            Paciente
          </h3>
          <div className="consola-paciente-giro">
            <label className="consola-interruptor" title="Con el giro libre, arrastrar da la vuelta al paciente sin «arriba» fijo: se puede acostar a mano.">
              <span>Giro libre</span>
              <input type="checkbox" role="switch" checked={giroLibre} onChange={(e) => setGiroLibre(e.target.checked)} />
              <span className="consola-interruptor-pista" aria-hidden />
            </label>
            <button
              type="button"
              className="consola-boton consola-boton-icono"
              title="Girar la vista 90° en el plano de la pantalla: tumba al paciente o lo levanta"
              aria-label="Girar la vista 90 grados"
              onClick={() => {
                setPosicion(null)
                mando.current?.rodarVista(90)
              }}
            >
              <RotateCw size={16} aria-hidden /> 90°
            </button>
          </div>
        </div>

        {herida && (herida.capas.length > 0 || herida.aviso) ? (
          <div className="consola-herida-bloque" role="status">
            <h3 className="consola-subtitulo">Herida</h3>
            {herida.capas.length > 0 ? (
              <p className="consola-herida-datos">
                {herida.capas.map((c) => (c === 'piel' ? 'Piel' : 'Planos profundos')).join(' y ')} ·{' '}
                {Math.round(herida.largoMm)} mm de largo · abierta {Math.round(herida.aperturaMm)} mm
              </p>
            ) : null}
            {herida.aviso ? <p className="consola-herida-aviso">{herida.aviso}</p> : null}
            {/* Cada incisión por separado (P-003 E4): se pueden tener varios abordajes a la vez, y cerrar uno sin
                tocar los demás. Con una sola, el bloque de arriba ya lo dice todo. */}
            {herida.incisiones.length > 1 ? (
              <ul className="consola-separadores" aria-label="Incisiones">
                {herida.incisiones.map((inc, i) => (
                  <li key={inc.id}>
                    <span className="consola-separador-nombre">{rotuloDeLaIncision(i + 1, inc)}</span>
                    <button
                      type="button"
                      className="consola-separador-quitar"
                      aria-label={`Cerrar la incisión ${i + 1}`}
                      title="Cerrar solo esta incisión"
                      onClick={() => mando.current?.cerrarIncision(inc.id)}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {herida.capas.length > 0 ? (
              <button type="button" className="consola-boton consola-boton-ancho" onClick={() => mando.current?.cerrarHeridas()}>
                <Undo2 size={16} aria-hidden /> {herida.incisiones.length > 1 ? 'Cerrar todas las heridas' : 'Cerrar la herida'}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="consola-capas-bloque">
          <h3 className="consola-subtitulo">Capas</h3>
          <ul className="consola-capas">
            {CAPAS.map((capa) => {
              const hay = piezas.some((p) => capaDelRol(p.rol) === capa.rol)
              return (
                <li key={capa.rol}>
                  {/* Un interruptor y no una casilla: lo que hace es encender y
                      apagar algo que se ve, no marcar una opción de un
                      formulario. Sigue siendo un `checkbox` por dentro, con
                      `role="switch"`, así que el teclado y el lector de
                      pantalla lo tratan como lo que es. */}
                  <label className={`consola-interruptor${hay ? '' : ' consola-capa-vacia'}`}>
                    <span>{capa.etiqueta}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={!capasApagadas.has(capa.rol)}
                      disabled={!hay}
                      onChange={() => alternarCapa(capa.rol)}
                    />
                    <span className="consola-interruptor-pista" aria-hidden />
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
        {editor ? bloqueDeLaBandeja : null}
      </div>

      {/* -------------------------------------------------------- lienzo */}
      {/* Las asas para ensanchar o angostar las columnas de los lados arrastrando (pedido del dueño). Son hijas de la rejilla, en la
          misma celda que su columna y pegadas a su borde, para que no se desplacen con el contenido de la columna. */}
      <AsaDeAncho
        raiz={raizDeLaConsola}
        variable="--ancho-izq"
        clave="consola.ancho.izq"
        minimo={160}
        maximo={440}
        sentido={1}
        medir={(asa) => asa.parentElement?.querySelector<HTMLElement>('.consola-izq') ?? null}
        etiqueta="Ancho de la columna de la izquierda"
        className="asa-izq"
      />
      <div className="consola-centro">
        {editandoLaFicha ? (
          <VentanaDeEstructura
            atlasId={editandoLaFicha}
            region=""
            sistema=""
            alCerrar={() => setEditandoLaFicha(null)}
            alGuardar={() => {
              // La ficha ya cambió: se vuelve a leer la que se está enseñando.
              if (info && info.estado === 'ficha' && info.ficha.atlasId === editandoLaFicha) {
                void leerFichaParaElSimulador(editandoLaFicha).then((r) => {
                  if (r.exito && r.datos) setInfo({ estado: 'ficha', nodo: info.nodo, ficha: r.datos })
                })
              }
            }}
          />
        ) : null}
        {/* Los modos, arriba y de izquierda a derecha (P-004 E4): vivían en una rejilla de la columna izquierda, lejos del
            modelo y de las órdenes de la vista, y Cristóbal los pidió «arriba, ordenados de izquierda a derecha». Solo salen
            los que el instrumento en la mano usa. En un ancho estrecho queda el icono (el texto sigue para el lector de
            pantalla). La ayuda del modo va debajo, en una línea. */}
        <div className="consola-barra-de-modos">
          <div className="consola-barra-de-modos-fila">
            <div className="consola-barra-de-modos-botones" role="group" aria-label="Modo">
              {modosVisibles.map((m) => {
                const Icono = m.icono
                const pedido = modoDelPaso === m.valor
                return (
                  <button
                    key={m.valor}
                    type="button"
                    className={`consola-modo-barra${modo === m.valor ? ' activo' : ''}${pedido ? ' pedido' : ''}`}
                    aria-pressed={modo === m.valor}
                    title={m.ayuda}
                    onClick={() => {
                      setModo(m.valor)
                      // Las dos maneras de usar la Metzenbaum se recuerdan: al volver a cogerla se abre como se dejó.
                      if (m.valor === 'disecar') setUsoDeLaTijera('roma')
                      else if (m.valor === 'trazar') setUsoDeLaTijera('cortar')
                    }}
                  >
                    <Icono size={16} aria-hidden />
                    <span className="consola-modo-barra-texto">{m.etiqueta}</span>
                    {/* El modo que pide el paso se marca con la palabra «paso» y no se impone: cambiar de modo a mano
                        es posible (`MODO_DEL_OBJETIVO`). */}
                    {pedido ? <span className="consola-modo-pedido">paso</span> : null}
                  </button>
                )
              })}
            </div>
            {/* Las dos formas de trazar la incisión: la recta entre dos clics (inicio y final) y la mano alzada. La
                recta es la de una incisión de abordaje; a mano sale temblorosa. */}
            {modo === 'trazar' ? (
              <div className="consola-submodo" role="group" aria-label="Cómo se traza la incisión">
                {TIPOS_DE_TRAZO.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    className={`consola-submodo-boton${tipoDeTrazo === t.valor ? ' activo' : ''}`}
                    aria-pressed={tipoDeTrazo === t.valor}
                    title={t.ayuda}
                    onClick={() => {
                      setTipoDeTrazo(t.valor)
                      mando.current?.cancelarTrazo()
                    }}
                  >
                    {t.etiqueta}
                  </button>
                ))}
              </div>
            ) : null}
            {/* «Mover» separaba cada sistema y se perdía todo: ahora mueve todo junto, y el paso de reducir —que necesita un
                trozo de hueso suelto— lo deja en «Un trozo». */}
            {modo === 'mover' ? (
              <div className="consola-submodo" role="group" aria-label="Qué se mueve">
                {(
                  [
                    [true, 'Todo junto', 'Piel, músculo y hueso se mueven a la vez, como un bloque.'],
                    [false, 'Un trozo', 'Agarra el trozo de hueso que se toque: lo que hace falta para reducir una fractura.'],
                  ] as const
                ).map(([valor, etiqueta, ayuda]) => (
                  <button
                    key={etiqueta}
                    type="button"
                    className={`consola-submodo-boton${moverTodoEfectivo === valor ? ' activo' : ''}`}
                    aria-pressed={moverTodoEfectivo === valor}
                    title={ayuda}
                    onClick={() => setMoverTodoElegido(valor)}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            ) : null}
            {/* La posición del paciente, en la misma fila que los modos pero al otro extremo (pedido del dueño): es una orden de
                la vista, como «Encuadrar», y no de la columna de capas. */}
            <div className="consola-segmentado consola-posicion-barra" role="group" aria-label="Posición del paciente">
            {POSICIONES_DEL_PACIENTE.map((p) => (
              <button
                key={p.valor}
                type="button"
                className={`consola-modo consola-posicion${posicion === p.valor ? ' activo' : ''}`}
                aria-pressed={posicion === p.valor}
                title={p.ayuda}
                onClick={() => {
                  setPosicion(p.valor)
                  mando.current?.ponerPosicion(p.valor)
                }}
              >
                <span>{p.etiqueta}</span>
              </button>
            ))}
          </div>
          </div>
          {/* El menú de movimiento por ejes (P-004 E7): el trozo de hueso elegido, o la placa puesta y sin fijar. */}
          {menuDelTrozo ? (
            <MenuDeMovimiento
              seleccion={movimientoPorEje}
              alElegir={setMovimientoPorEje}
              alMover={(accion, eje, valor) => mando.current?.moverPorEje(accion, eje, valor) ?? null}
              sinObjeto={piezaElegida ? undefined : 'Pinche un trozo de hueso —con la pinza de reducción o en «Mover → Un trozo»— y elija cómo moverlo.'}
              nombreDelObjeto={piezaElegida ? piezaElegida.replace(/_/g, ' ') : null}
              asasLibres={asasLibres}
              alCambiarLasAsas={setAsasLibres}
            />
          ) : menuDeLaPlaca ? (
            <MenuDeMovimiento
              acciones={ACCIONES_DE_LA_PLACA}
              seleccion={movimientoDeLaPlaca}
              alElegir={setMovimientoDeLaPlaca}
              alMover={moverLaPlacaPorEje}
              nombreDelObjeto="la placa"
            />
          ) : null}
          <p className="consola-ayuda consola-barra-de-modos-ayuda">
            {ayudaDelModo}
            {etiquetaDelModoDelPaso ? (
              <span className="consola-ayuda-pedido">
                {' '}
                Este paso se hace en modo {etiquetaDelModoDelPaso}.
              </span>
            ) : null}
          </p>
        </div>
        <div className={`consola-lienzo-marco modo-${modo}`}>
          {/* Las opciones de la herramienta en la mano, a la izquierda del lienzo y del mismo tamaño que la ficha de «Seleccionar
              estructura» (que va a la derecha). Se ve con cualquier modo: la herramienta se configura aunque se esté mirando. */}
          {panelDeLaHerramienta ? (
            <div className="consola-herramienta-ficha" role="group" aria-label="Opciones de la herramienta">
              {panelDeLaHerramienta}
            </div>
          ) : null}
          {panelDeLaHerramienta ? (
            <AsaDeAncho
              raiz={raizDeLaConsola}
              variable="--ancho-herramienta"
              clave="consola.ancho.herramienta"
              minimo={220}
              maximo={560}
              sentido={1}
              medir={(asa) => asa.previousElementSibling as HTMLElement | null}
              etiqueta="Ancho del panel de la herramienta"
              className="asa-panel"
            />
          ) : null}
          {/* Lo que acaba de pasar (un aviso, un acierto, una complicación) sale **a la derecha del recuadro de la herramienta**, sobre el
              lienzo, donde se está mirando, y no abajo en la columna de la derecha, que en un portátil queda bajo el pliegue. Se cierra con su
              ✕ y se reemplaza con el aviso siguiente; el registro completo sigue en el pie. */}
          {resultado ? (
            <div className="consola-aviso-flotante" role="status" aria-live="polite">
              <ul className="consola-registro consola-registro-ultimo">{lineaDeRegistro(resultado, 'ultimo')}</ul>
              <button type="button" className="consola-aviso-cerrar" aria-label="Cerrar el aviso" onClick={() => setResultado(null)}>
                <X size={14} aria-hidden />
              </button>
            </div>
          ) : null}
          <LienzoQuirurgico
            key={claveDelLienzo}
            alCambiarElContexto={setEstadoDelContexto}
            alCambiarLaMesa={setMesaDeModelado}
            url={caso.modeloUrl}
            piezas={piezas}
            modo={modo}
            fluoroscopia={fluoroscopiaEncendida}
            giroLibre={giroLibre}
            alGirarLaVista={() => setPosicion(null)}
            planoDelSeparador={planoDeSeparador}
            separadoresEnPareja={separadoresEnPareja}
            acompanarAlBisturi={acompanarAlBisturi}
            alDisecar={(estado) => {
              setDiseccion(estado)
              // Se va abriendo y avanzando: al apoyar la punta en otro sitio las ramas vuelven a estar cerradas.
              if (estado?.evento === 'apoyo') setArticulacionesMovidas({})
            }}
            ayudas={ayudas}
            inclinacionDeBroca={inclinacionDeBroca}
            trazo={tipoDeTrazo}
            moverTodo={moverTodoEfectivo}
            alGesto={anotar}
            alSeparar={(e) => {
              setSeparadores(e)
              if (e.lista.length > 0 && queHace.separa) usarElDeLaMano()
            }}
            alPellizcar={(e) => {
              setPellizcos(e)
              if (e.lista.length > 0 && queHace.pellizca) usarElDeLaMano()
            }}
            alReducir={(e) => {
              setPinzasDeReduccion(e)
              if (e.pinzas.length > 0 && queHace.reduce) usarElDeLaMano()
            }}
            alHerir={(e) => {
              setHerida(e)
              // Solo cuenta si la mano trae algo que corta: el panel también se refresca al cerrar o separar.
              if (e && e.capas.length > 0 && (queHace.corta || queHace.roma)) usarElDeLaMano()
            }}
            alCoser={(estado) => {
              setSutura(estado)
              if (estado && estado.puntadas > 0 && queHace.sutura) usarElDeLaMano()
              if (!estado) {
                heridaCerradaDicha.current = false
                return
              }
              if (estado.juicio) anotar(estado.juicio, 'atencion')
              // Se dice cuando cambia la cosa, no en cada vuelta de la rueda: diez avisos iguales tapan el registro.
              const dicho = juicioDeTensionDicho.current
              const juicioT = estado.juicioDeLaTension
              if (juicioT && juicioT.texto !== dicho) {
                juicioDeTensionDicho.current = juicioT.texto
                anotar(juicioT.texto, juicioT.atencion ? 'atencion' : 'bien')
              } else if (!juicioT) {
                juicioDeTensionDicho.current = null
              }
              if (estado.cierre >= 0.999 && !estado.juicioDeLaTension?.estrangula && !heridaCerradaDicha.current) {
                heridaCerradaDicha.current = true
                anotar(
                  `Herida cerrada con ${estado.puntadas} puntadas de ${estado.hilo}, ${estado.bienEspaciadas} de ${estado.tramos} bien espaciadas (5 a 10 mm).`,
                  estado.bienEspaciadas === estado.tramos ? 'bien' : 'atencion',
                )
              }
              if (estado.cierre < 0.999) heridaCerradaDicha.current = false
            }}
            largoDeTornillo={largoDeTornillo}
            alRueda={alRuedaDelInstrumento}
            capturaLaRueda={ruedaDelInstrumento !== null}
            // En el editor la clave es solo el modelo: la ficha cambia de identificador al guardar un caso nuevo por
            // primera vez, y con ella la clave —se perdía la incisión—. Ver `ensayoDelEditor.ts`.
            claveDeSesion={claveDeLaSesion}
            alFijar={(estado, suceso) => {
              setFijacion(estado)
              if (!suceso) return
              // La placa o el tornillo puestos, y lo que se perforó o midió, son insumos gastados: la placa se
              // anota entera y cada tornillo con su largo, que es lo que se pide a esterilización.
              if (suceso.tipo === 'tornillo') usarElDeLaMano(largoDeTornillo)
              else if (suceso.tipo === 'placa' || suceso.tipo === 'medida' || suceso.tipo === 'agujero') usarElDeLaMano()
              if (suceso.largoSugeridoMm) setLargoDeTornillo(suceso.largoSugeridoMm)
              if (suceso.tipo === 'aviso') anotar(suceso.texto, 'atencion')
              else anotar(suceso.texto, suceso.atencion ? 'atencion' : 'bien')
              avanzarLaSecuencia(estado, suceso)
            }}
            alPerforar={(hecha) => {
              usarElDeLaMano()
              if (paso) setUltimaPerforacion({ paso: paso.id, hecha })
              const mm = (n: number) => n.toFixed(1).replace('.', ',')
              const partes = [
                `Perforación de Ø ${String(hecha.diametroMm).replace('.', ',')} mm y ${mm(hecha.profundidadMm)} mm`,
                hecha.bicortical ? 'bicortical' : 'solo la cortical cercana',
                `${Math.round(hecha.anguloConElEje)}° con el eje del hueso`,
              ]
              const torcida = Math.abs(90 - hecha.anguloConElEje) > 10
              const larga = hecha.sePasoMm > 3
              anotar(
                `${partes.join(', ')}.${
                  larga ? ` Se pasó ${mm(hecha.sePasoMm)} mm de la cortical opuesta: riesgo para las partes blandas.` : ''
                }${torcida ? ' No quedó perpendicular al eje del hueso.' : ''}`,
                larga || torcida ? 'atencion' : 'bien',
              )
            }}
            instrumento={instrumentoEnEscena}
            milimetrosPorUnidad={escalaMm}
            ejeLargo={caso.ejeLargo}
            alCargarInstrumento={(declaradas, error) => {
              setArticulacionesDeclaradas(declaradas ?? [])
              setErrorDelInstrumento(error ?? null)
            }}
            // Del trazo solo se guarda su longitud. Los puntos se quedan en
            // el lienzo, que ya es su dueño; subirlos a React repintaba la
            // consola entera —los dos campos ricos del pie incluidos— unas
            // treinta veces por incisión, compitiendo con el bucle de dibujo.
            alTrazar={(puntos) => setLargoDelTrazoMm(largoDelTrazo(puntos, escalaMm))}
            movimientoPorEje={menuDelTrozo ? movimientoPorEje : null}
            asasLibres={asasLibres}
            alElegirPieza={setPiezaElegida}
            alCambiarLaBroca={setBroca}
            diametroDeTornillo={diametroDeTornillo}
            marcandoLaTrayectoria={marcandoLaTrayectoria}
            alCambiarLaTrayectoria={(e) => {
              setTrayectoria(e)
              // Con las dos puntas marcadas ya no se marca más: los clics vuelven a ser de la broca, el medidor y el tornillo.
              if (e?.fase === 'lista') setMarcandoLaTrayectoria(false)
            }}
            alMoverFragmento={() => {
              recalcularMedidas()
              editor?.alMoverFragmento?.()
            }}
            alSenalar={editor?.alSenalar}
            musculoObjetivo={musculoObjetivo ? { nodo: musculoObjetivo.nodo, accion: musculoObjetivo.accion } : null}
            alRetraer={(estado) => setRetracciones(estado.lista)}
            alInformar={(golpe) => {
              if (!golpe) {
                mando.current?.resaltarNodo(null)
                setInfo(null)
                return
              }
              mando.current?.resaltarNodo(golpe.nodo)
              const nombre = golpe.etiqueta ?? golpe.nodo.replace(/_/g, ' ')
              // Un objeto fundido por sistema (un modelo exportado antes de P-003 E9) no dice qué músculo es:
              // se avisa en vez de enseñar la ficha de otra cosa.
              if (!golpe.atlasId) {
                setInfo({ estado: 'modeloViejo', nodo: golpe.nodo, nombre })
                return
              }
              setInfo({ estado: 'cargando', nodo: golpe.nodo, nombre })
              void leerFichaParaElSimulador(golpe.atlasId).then((r) => {
                const actual = r.exito ? (r.datos ?? null) : null
                setInfo((previo) => {
                  // Si ya se pinchó otra mientras tanto, esta respuesta llega tarde y no se enseña.
                  if (!previo || previo.nodo !== golpe.nodo) return previo
                  if (!r.exito) return { estado: 'error', nodo: golpe.nodo, nombre }
                  return actual ? { estado: 'ficha', nodo: golpe.nodo, ficha: actual } : { estado: 'sinFicha', nodo: golpe.nodo, nombre }
                })
              })
            }}
            // El fragmento se coloca desplazado cuando el archivo termina de
            // cargar, no antes: hasta ese momento no hay ningún nodo al que
            // aplicarle nada, y hacerlo en el montaje del componente dejaba
            // el hueso reducido y el caso resuelto de entrada.
            alCargar={() => {
              // Un lienzo recién cargado no trae ninguna herida: si el modelo se
              // vuelve a montar (otro archivo, una recarga en caliente), lo que la
              // consola creía cortado ya no existe en la escena.
              setHerida(null)
              setSutura(null)
              setFijacion(null)
              // Un modelo recién cargado se abre de pie, de frente.
              setPosicion('de-pie')
              setDelArchivo({
                url: caso.modeloUrl ?? '',
                nodos: mando.current?.nodosDelModelo() ?? [],
                datos: mando.current?.datosDeLosNodos() ?? [],
              })
              colocarEnDesplazamientoInicial()
              entrarEnPaso(indice, capasApagadas)
              // Lo que el caso declara frente a lo que el archivo trae. Si no
              // hay nada en común, `refrescarVisibles` ya lo dijo; aquí queda
              // el caso a medias —unas piezas están y otras no— y el de un
              // modelo sin fragmento, que dejaba los pasos de reducción sin
              // nada que mover (O-078).
              const faltan = piezasQueFaltanEnElArchivo(caso.piezas, mando.current?.nodosDelModelo() ?? [])
              if (faltan.ausentes.length > 0 && faltan.ausentes.length < faltan.total) {
                avisarUnaVez(
                  'faltan-piezas',
                  `El caso declara ${faltan.ausentes.length} de ${faltan.total} piezas que este modelo no tiene (${faltan.ausentes
                    .slice(0, 3)
                    .join(', ')}${faltan.ausentes.length > 3 ? '…' : ''}). Esas no se muestran.`,
                )
              }
              if (
                mando.current &&
                !mando.current.hayFragmento() &&
                caso.pasos.some((p) => p.objetivo === 'reduccion')
              ) {
                avisarUnaVez(
                  'sin-fragmento',
                  'El modelo no trae el fragmento móvil que declara el caso: los pasos de reducción no tienen nada que mover.',
                )
              }
            }}
            // Un modelo que no abre tiene que decirlo. Sin esto el residente
            // se queda mirando un lienzo vacío creyendo que aún carga.
            alFallar={(mensaje) => anotar(mensaje, 'grave')}
            mando={asignarMando}
          />
          {avisoDelContexto.mensaje ? (
            <div
              className={`consola-contexto${avisoDelContexto.urgente ? ' urgente' : ''}`}
              role={avisoDelContexto.urgente ? 'alert' : 'status'}
            >
              <p>{avisoDelContexto.mensaje}</p>
              {avisoDelContexto.ofrecerRecuperar ? (
                <button
                  type="button"
                  className="consola-boton"
                  onClick={() => {
                    setClaveDelLienzo((c) => c + 1)
                    setEstadoDelContexto(CONTEXTO_VIVO)
                  }}
                >
                  Recuperar la vista
                </button>
              ) : null}
            </div>
          ) : null}
          {/* Encuadrar sobre el lienzo y no en la columna de mandos: es una
              orden de la vista, y en el móvil la columna queda por debajo del
              lienzo, lejos de lo que encuadra. */}
          <div className="consola-lienzo-herramientas">
            <button
              type="button"
              className="consola-lienzo-boton"
              onClick={() => mando.current?.encuadrar()}
            >
              <Focus size={16} aria-hidden /> Encuadrar
            </button>
            {/* «El simulador excede el tamaño de la pantalla»: con esto ocupa la pantalla entera y los mandos
                caben a la vista. En una pantalla pequeña es lo que hace falta; el modo normal queda para leer
                la página. */}
            <button
              type="button"
              className="consola-lienzo-boton"
              aria-pressed={pantallaCompleta}
              title={pantallaCompleta ? 'Volver al tamaño de la página' : 'Ocupar toda la pantalla, con todos los mandos a la vista'}
              onClick={() => setPantallaCompleta((v) => !v)}
            >
              {pantallaCompleta ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
              {pantallaCompleta ? 'Reducir' : 'Ampliar'}
            </button>
            {/* «Rayos X» se llama fluoroscopia, que es lo que se hace en pabellón, y abre un menú con las tres
                proyecciones del arco en C. Al elegir una, la vista pasa a radiografía y se abre al lado la imagen
                de la fluoroscopia, en círculo. */}
            <div className="consola-fluoro-envoltorio">
              <button
                type="button"
                className={`consola-lienzo-boton consola-fluoro${fluoroscopiaEncendida ? ' activo' : ''}`}
                aria-pressed={fluoroscopiaEncendida}
                aria-haspopup={fluoroscopiaEncendida ? undefined : 'menu'}
                aria-expanded={fluoroscopiaEncendida ? undefined : menuDeFluoroscopia}
                title="Fluoroscopia: la imagen del arco en C, en círculo, con lo más denso en negro. Elija la proyección."
                onClick={alternarRayosX}
              >
                <ScanLine size={16} aria-hidden /> Fluoroscopia
                {fluoroscopia ? (
                  <span className="consola-fluoro-vista">
                    · {PROYECCIONES_DE_FLUOROSCOPIA.find((q) => q.valor === fluoroscopia)?.etiqueta}
                  </span>
                ) : (
                  <ChevronDown size={14} aria-hidden />
                )}
              </button>
              {menuDeFluoroscopia && !fluoroscopiaEncendida ? (
                <ul className="consola-fluoro-menu" role="menu" aria-label="Proyección de la fluoroscopia">
                  {PROYECCIONES_DE_FLUOROSCOPIA.map((q) => (
                    <li key={q.valor} role="none">
                      <button type="button" role="menuitem" className="consola-fluoro-opcion" onClick={() => elegirProyeccion(q.valor)}>
                        <strong>{q.etiqueta}</strong>
                        <small>{q.ayuda}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {/* La imagen del arco en C. Solo existe con la fluoroscopia encendida: la imagen en círculo, con lo
              denso en negro como en la pantalla del pabellón, las tres proyecciones, el contador de exposición
              y las dos ayudas de aprendizaje (que se apagan: en una fluoroscopia real nadie dibuja dónde debe
              quedar el hueso). */}
          {fluoroscopia ? (
            <PanelDeFluoroscopia
              proyeccion={fluoroscopia}
              modo={modoDeEscopia}
              segundos={segundosDeEscopia}
              haceSegundos={haceSegundosDeLaToma}
              desactualizada={tomaDesactualizada}
              ajustes={ajustesDeLaImagen}
              alElegirModo={elegirModoDeEscopia}
              alDisparar={dispararLaFluoroscopia}
              alCambiarAjustes={cambiarAjustesDeLaImagen}
              zoom={zoomDeFluoroscopia}
              ancho={anchoDeFluoroscopia}
              ayudas={ayudas}
              hayFragmento={piezas.some((p) => p.rol === 'fragmento')}
              angulacion={reduccion.angulacion}
              topeDeAngulacion={objetivo === 'reduccion' && topes ? topes.angulacion : null}
              lienzo={lienzoDeFluoroscopia}
              desplazamiento={desplazamientoDeFluoroscopia}
              alDesplazar={setDesplazamientoDeFluoroscopia}
              alElegirProyeccion={elegirProyeccion}
              alAcercar={(z) => {
                const nuevo = limitarZoom(z)
                setZoomDeFluoroscopia(nuevo)
                // Al alejar, el tope de cuánto se puede correr el miembro baja: lo corrido se recorta con él.
                setDesplazamientoDeFluoroscopia((d) => limitarDesplazamiento(d, nuevo))
              }}
              alCambiarAncho={(a) => {
                const nuevo = limitarAnchoDelRecuadro(a)
                setAnchoDeFluoroscopia(nuevo)
                guardarAnchoDelRecuadro(nuevo)
              }}
              alCambiarAyudas={setAyudas}
              alApagar={apagarFluoroscopia}
            />
          ) : null}
          {/* Info y el músculo elegido, a la derecha del lienzo como la fluoroscopia (no arriba): ahí no empuja el
              modelo hacia abajo y se lee al lado de lo que se pincha. El objetivo se queda aunque se salga del modo
              «Seleccionar estructura»; la ficha solo se ve en ese modo. */}
          {(modo === 'info' && info) || musculoObjetivo ? (
            <AsaDeAncho
              raiz={raizDeLaConsola}
              variable="--ancho-info"
              clave="consola.ancho.info"
              minimo={220}
              maximo={560}
              sentido={-1}
              medir={(asa) => asa.nextElementSibling as HTMLElement | null}
              etiqueta="Ancho del panel de la estructura"
              className="asa-panel"
            />
          ) : null}
          {(modo === 'info' && info) || musculoObjetivo ? (
            <div className="consola-info-ficha" role="group" aria-label="Estructura seleccionada">
              {musculoObjetivo ? (
                <div className="consola-info consola-objetivo-de-plano" role="status">
                  <p>
                    {musculoObjetivo.accion === 'cortar' ? 'Cortando solo' : 'Separando'} <strong>{musculoObjetivo.nombre}</strong>
                    {musculoObjetivo.accion === 'separar'
                      ? retracciones.some((r) => r.nodo === musculoObjetivo.nodo)
                        ? ` · retraído ${Math.round(retracciones.find((r) => r.nodo === musculoObjetivo.nodo)?.aperturaMm ?? 0)} mm (la rueda lo abre o lo cierra)`
                        : ' · haga clic en el músculo con el separador'
                      : ' · trace la incisión sobre él con el instrumento'}
                  </p>
                  <div className="consola-info-acciones">
                    {retracciones.length > 0 ? (
                      <button type="button" className="consola-boton" onClick={() => mando.current?.soltarRetracciones()}>
                        Soltar el músculo
                      </button>
                    ) : null}
                    <button type="button" className="consola-boton" onClick={() => setMusculoObjetivo(null)}>
                      Quitar el objetivo
                    </button>
                  </div>
                </div>
              ) : null}
              {modo === 'info' && info ? (
                <div className="consola-info" role="region" aria-label="Ficha de la estructura">
                  <h3 className="consola-subtitulo">Estructura seleccionada</h3>
                  {info.estado === 'ficha' ? (
                    <>
                      <p>
                        <strong>{info.ficha.nombre}</strong>
                        {info.ficha.nombreLatino ? <em> · {info.ficha.nombreLatino}</em> : null}
                      </p>
                      <details open>
                        <summary>Aprenda más</summary>
                        {(
                          [
                            ['Definición', info.ficha.definicion],
                            ['Origen', info.ficha.origen],
                            ['Inserción', info.ficha.insercion],
                            ['Inervación', info.ficha.inervacion],
                            ['Acción', info.ficha.accion],
                            ['Irrigación', info.ficha.irrigacion],
                          ] as const
                        )
                          .filter(([, texto]) => texto)
                          .map(([titulo, texto]) => (
                            <p key={titulo}>
                              <strong>{titulo}.</strong> {texto}
                            </p>
                          ))}
                        {!info.ficha.definicion && !info.ficha.origen && !info.ficha.insercion && !info.ficha.inervacion && !info.ficha.accion && !info.ficha.irrigacion ? (
                          <p className="consola-vacio">Todavía no tiene ficha escrita.</p>
                        ) : null}
                      </details>
                      {familiaDeSistema(info.ficha.sistema) === 'musculo' ? (
                        <div className="consola-info-acciones">
                          <button
                            type="button"
                            className="consola-boton"
                            aria-pressed={eligiendoAccion === 'cortar'}
                            onClick={() => setEligiendoAccion(eligiendoAccion === 'cortar' ? null : 'cortar')}
                          >
                            Cortar
                          </button>
                          <button
                            type="button"
                            className="consola-boton"
                            aria-pressed={eligiendoAccion === 'separar'}
                            onClick={() => setEligiendoAccion(eligiendoAccion === 'separar' ? null : 'separar')}
                          >
                            Separar
                          </button>
                          {eligiendoAccion ? (
                            <ul className="consola-info-instrumentos">
                              {instrumentosParaActuarEnElMusculo(eligiendoAccion, eligiendoAccion === 'cortar' ? info.ficha.abordajeCortar : info.ficha.abordajeSeparar).length === 0 ? (
                                <li className="consola-vacio">
                                  {eligiendoAccion === 'cortar'
                                    ? 'No hay en la bandeja un instrumento para cortar músculo (bisturí, tijera de Metzenbaum o electrobisturí).'
                                    : 'No hay en la bandeja un separador (Farabeuf, Senn-Miller, Hohmann…).'}
                                </li>
                              ) : (
                                instrumentosParaActuarEnElMusculo(eligiendoAccion, eligiendoAccion === 'cortar' ? info.ficha.abordajeCortar : info.ficha.abordajeSeparar).map((i) => (
                                  <li key={i.id}>
                                    <button
                                      type="button"
                                      className="consola-anadir-opcion"
                                      onClick={() => {
                                        const accion = eligiendoAccion
                                        setMusculoObjetivo({
                                          nodo: info.nodo,
                                          nombre: info.ficha.nombre,
                                          accion,
                                          // Lo que ya estaba cortado antes de elegir no cuenta: solo vale la incisión nueva.
                                          yaCortadas: (herida?.incisiones ?? []).filter((x) => x.capa === 'musculo').map((x) => x.id),
                                        })
                                        setEligiendoAccion(null)
                                        elegirInstrumento(i.id)
                                        // Elegir el instrumento ya cambió de modo, pero la tijera puede haber ido a «disecar»:
                                        // aquí se pide cortar, no disecar.
                                        setModo(accion === 'cortar' ? 'trazar' : 'separar')
                                      }}
                                    >
                                      {eligiendoAccion === 'cortar' ? 'Cortar' : 'Separar'} con {i.nombre}
                                    </button>
                                  </li>
                                ))
                              )}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      {editor ? (
                        <button type="button" className="consola-boton" onClick={() => setEditandoLaFicha(info.ficha.atlasId)}>
                          Editar
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>{info.estado === 'cargando' ? info.nombre : 'nombre' in info ? info.nombre : ''}</strong>
                      </p>
                      <p className="consola-vacio">
                        {info.estado === 'cargando'
                          ? 'Abriendo la ficha…'
                          : info.estado === 'modeloViejo'
                            ? 'Este modelo no separa las estructuras: el objeto que pinchó agrupa varias. Un editor puede volver a exportarlo con las estructuras separadas desde el editor del caso.'
                            : info.estado === 'sinFicha'
                              ? 'Esta estructura no tiene ficha o no se muestra.'
                              : 'No se pudo leer la ficha.'}
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <dl className="consola-medidas">
          {medidas.map((m) => (
            <div
              key={m.nombre}
              className="consola-medida"
              data-estado={m.lectura ? m.lectura.estado : undefined}
            >
              <dt>{m.nombre}</dt>
              <dd className="consola-medida-valor u-num">{m.valor}</dd>
              {m.desglose ? <dd className="consola-desglose u-num">{m.desglose}</dd> : null}
              {m.lectura ? (
                <dd className="consola-medida-tope">
                  {m.lectura.referencia} · <strong>{m.lectura.veredicto}</strong>
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      </div>

      {/* ------------------------------------------------ columna derecha */}
      <AsaDeAncho
        raiz={raizDeLaConsola}
        variable="--ancho-der"
        clave="consola.ancho.der"
        minimo={240}
        maximo={620}
        sentido={-1}
        medir={(asa) => asa.parentElement?.querySelector<HTMLElement>('.consola-der') ?? null}
        etiqueta="Ancho de la columna de la derecha"
        className="asa-der"
      />
      <div className="consola-der">
        {/* El editor del caso: sus pestañas van arriba de todo, y debajo sigue
            el paso tal como lo ve el residente. Lo que se escribe arriba se ve
            cambiar abajo. */}
        {editor ? (
          <div className="consola-editor-panel">
            {editor.panel({
              trazoMm: largoDelTrazoMm,
              reduccion: {
                desplazamiento: reduccion.desplazamiento,
                angulacion: reduccion.angulacion,
                diastasis: reduccion.diastasis,
              },
              fuerza,
              nodosDelArchivo: delArchivo?.url === caso.modeloUrl ? delArchivo.nodos : [],
              datosDeLosNodos: delArchivo?.url === caso.modeloUrl ? delArchivo.datos : [],
              modeloCargado: delArchivo?.url === caso.modeloUrl,
              instrumentoEnLaMano: instrumento,
            })}
          </div>
        ) : null}
        {terminado ? (
          <div className="consola-fin" role="status">
            <span className="consola-fin-icono" aria-hidden>
              <Trophy size={24} />
            </span>
            <p className="consola-rotulo">Caso terminado</p>
            {/* La invitación a la radiografía postoperatoria (P-004 E11): lo último que se hace en pabellón antes de cerrar.
                «Omitir» deja el cierre de siempre; el panel abierto se cierra con su propio botón. */}
            {radiografiaPost === 'invitacion' && !editor ? (
              <div className="radiografia-post-invitacion">
                <p>
                  <strong>Cirugía finalizada. ¡Felicidades!</strong> Falta la radiografía postoperatoria.
                </p>
                <div className="consola-fin-acciones">
                  <button type="button" className="consola-aplicar" onClick={() => setRadiografiaPost('abierta')}>
                    <ScanLine size={16} aria-hidden /> Ir a radiografía postoperatoria
                  </button>
                  <button type="button" className="consola-boton" onClick={() => setRadiografiaPost('omitida')}>
                    Omitir
                  </button>
                </div>
              </div>
            ) : null}
            {radiografiaPost === 'abierta' && !editor ? (
              <RadiografiaPostoperatoria
                caso={caso.nombre}
                diagnosticoInicial={[caso.hueso, caso.clasificacion].filter(Boolean).join(' · ')}
                cirujanoInicial={cirujano}
                intervencionInicial={intervencionPropuesta(
                  resumenDeInsumos(
                    insumos,
                    CATEGORIAS_DE_INSTRUMENTAL.map((c) => c.value as string),
                  ),
                )}
                tomar={(destino, proyeccion, zoom, ajustes) => mando.current?.radiografiaPostoperatoria(destino, proyeccion, zoom, ajustes) ?? false}
                alGuardar={(datos) => {
                  radiografiaDelRecorrido.current = datos
                  guardarRecorrido(puntaje, complicaciones, insumos)
                }}
                alCerrar={() => setRadiografiaPost('omitida')}
              />
            ) : null}
            <p className="consola-fin-puntaje">
              <span className="u-num">{puntaje}</span>
              <span className="consola-fin-total u-num"> / {maximo} puntos</span>
            </p>
            {/* Es el único sitio en el que la complicación sobrevive al paso
                en el que ocurrió: el registro de abajo se recorta a diez
                líneas. Se nombra aparte del reintento porque cuesta aparte
                (`puntosDelPaso`), y decir «hubo que repetir 3 pasos» sin
                distinguirlas volvería a igualar lo que este cambio separa. */}
            <p>{resumenDelCaso}</p>
            {bloqueDeInsumos}
            {/* Que quede dicho, y aquí: es el único momento en el que el
                residente decide si repetir el caso, y saber que lo que hizo
                no se pierde es lo que separa «repetir para mejorar» de
                «repetir porque si no, no queda nada». */}
            <p>
              Su puntaje y sus complicaciones quedan guardados: los encontrará al volver a este
              caso y en su portada.
            </p>
            {/* Solo cuando la escritura volvió, y en las dos direcciones:
                afirmar «cuenta como leído» mientras viaja sería adelantarse a
                un fallo posible, y callar el fallo dejaría el caso «por leer»
                en la portada sin que el residente sepa por qué. */}
            {lecturaAlTerminar === 'marcada' ? (
              <p className="consola-fin-leido">
                <CheckCircle2 size={16} aria-hidden /> El caso cuenta ya como leído en su portada.
              </p>
            ) : lecturaAlTerminar === 'fallida' ? (
              <p className="consola-fin-fallo">
                No se pudo marcar el caso como leído. Márquelo con la casilla de arriba de la
                página.
              </p>
            ) : null}
            {/* Terminar no puede ser un callejón: hasta aquí lo único que
                quedaba era la miga de arriba del todo, fuera de la vista
                después de seiscientos píxeles de consola. */}
            <div className="consola-fin-acciones">
              <button type="button" className="consola-aplicar" onClick={() => void reiniciar()}>
                <RotateCcw size={16} aria-hidden /> Repetir el caso
              </button>
              <Link href="/simulador" className="consola-boton">
                <ArrowLeft size={16} aria-hidden /> Volver a la lista
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`consola-objetivo${tieneMandosPropios ? ' consola-objetivo-con-mandos' : ''}`}
            >
              <p className="consola-rotulo">
                Paso {indice + 1} de {caso.pasos.length}
              </p>
              <h3 className="consola-objetivo-titulo">{paso.titulo}</h3>
              <p className="consola-instruccion">{instruccionDelPaso(paso)}</p>

              {/* También fuera de un paso de trazo: dibujar no depende del
                  objetivo sino del modo, y la raya se pinta con `depthTest`
                  apagado, así que atraviesa el hueso y no hay forma de
                  esconderla girando la cámara. Sin este botón, un trazo hecho
                  por error en un paso de reducción tapaba el fragmento justo
                  donde hay que ver cómo encaja, y solo se quitaba reiniciando
                  el caso entero. */}
              {objetivo === 'trazo' || largoDelTrazoMm > 0 ? (
                <button
                  type="button"
                  className="consola-boton consola-boton-ancho"
                  onClick={() => mando.current?.borrarTrazo(true)}
                >
                  <Eraser size={16} aria-hidden /> Borrar trazo
                </button>
              ) : null}

              {objetivo === 'reduccion' ? (
                <div className="consola-angulacion">
                  {/* El ratón traslada, que es un gesto de dos ejes; una
                      rotación tiene tres. Sin estos mandos, un caso que empieza
                      angulado no se podría reducir por mucho que se arrastrara,
                      y el residente no entendería por qué. */}
                  <p className="consola-ayuda">
                    Arrastre el fragmento para alinearlo; sus flechas lo mueven y sus aros lo giran en cada eje (rojo X, verde Y, azul Z). Los deslizadores afinan la angulación.
                  </p>
                  {(
                    [
                      ['z', 'Varo / valgo'],
                      ['x', 'Ante / recurvatum'],
                      ['y', 'Rotación'],
                    ] as const
                  ).map(([eje, etiqueta]) => (
                    <label key={eje} className="consola-deslizador">
                      <span className="consola-deslizador-cabeza">
                        <span>{etiqueta}</span>
                        <output className="u-num">{Math.round(giros[eje])}°</output>
                      </span>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        step={0.5}
                        value={giros[eje]}
                        onChange={(e) => girar(eje, Number(e.target.value))}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="consola-boton consola-boton-ancho"
                    onClick={colocarEnDesplazamientoInicial}
                  >
                    <Undo2 size={16} aria-hidden /> Volver al desplazamiento inicial
                  </button>
                </div>
              ) : null}
            </div>

            {/* La acción del paso: en el escritorio, debajo de su instrucción;
                en el móvil, una barra pegada al borde de abajo mientras la
                consola esté a la vista, con el paso resumido. Allí la columna
                de mandos queda dos pantallas por debajo del lienzo, y aplicar
                el paso obligaba a bajar y volver a subir para ver qué había
                pasado en el modelo. */}
            <div className="consola-accion">
              <p className="consola-accion-resumen">
                <span className="consola-rotulo">
                  Paso {indice + 1} de {caso.pasos.length} · {paso.titulo}
                </span>
                <span className="consola-accion-instruccion">{instruccionDelPaso(paso)}</span>
              </p>

              {objetivo === 'fuerza' ? (
                <label
                  className={`consola-deslizador consola-fuerza${fuerzaDentro ? ' dentro' : ''}`}
                  style={franjaUtil as React.CSSProperties}
                >
                  {/* El rango se enseña antes de aplicar, como ya se hace con
                      el trazo. Escondido, el residente exploraba el deslizador
                      —que es lo que se hace con un deslizador—, se pasaba, y la
                      consola le anotaba como complicación quirúrgica una
                      adivinanza que ella misma le había obligado a hacer
                      teniendo el rango guardado a mano. */}
                  <span className="consola-deslizador-cabeza">
                    <span>
                      Fuerza{rangoUtil ? <span className="consola-rango"> · rango útil {rangoUtil}</span> : null}
                    </span>
                    <output className="u-num">{fuerza} N</output>
                  </span>
                  <input
                    type="range"
                    min={topesDelDeslizador.min}
                    max={topesDelDeslizador.max}
                    value={fuerza}
                    onChange={(e) => setFuerza(Number(e.target.value))}
                  />
                </label>
              ) : null}

              {/* Sin `disabled`. Apagado y mudo, el botón principal nacía y
                  renacía gris en cada paso, y nada en pantalla lo relacionaba
                  con la bandeja: el residente cumplía la consigna al pie de la
                  letra y se quedaba atascado. Dejándolo vivo, quien contesta es
                  `evaluarGesto`, que tiene la frase escrita desde el principio
                  —«Seleccione un instrumento antes de ejecutar el paso»— y que
                  hasta ahora era un camino imposible de recorrer, porque el
                  único sitio que lo llama colgaba de este botón. */}
              <button type="button" className="consola-aplicar" onClick={aplicarPaso}>
                <Check size={18} aria-hidden /> {editor ? 'Probar este paso' : 'Aplicar paso'}
              </button>

              {/* El aviso de lo que acaba de pasar ya no va aquí abajo, bajo «Aplicar paso»: sale sobre el lienzo, pegado al recuadro de
                  la herramienta (pedido del dueño). El registro completo sigue en el pie. */}
            </div>
          </>
        )}

        {!editor ? bloqueDeLaBandeja : null}
      </div>

      {/* ------------------------------------------------- retroalimentación */}
      {/* El pie se queda claro, fuera del tema oscuro de la consola: es texto
          clínico largo escrito con el editor rico, cuyas reglas (enlaces en
          `--marca`, recuadros de advertencia) están pensadas para el papel. */}
      <div className="consola-pie">
        {/* Con el caso terminado no hay paso, y la sección entera se va. Antes
            solo fallaba el `paso &&` y se caía en la rama del else, que está
            escrita para otro supuesto —un paso real cuyo autor no escribió la
            descripción—: el residente cerraba el caso y la consola le informaba,
            bajo «Qué se hace en este paso», de que faltaba contenido. */}
        {paso ? (
          <section>
            <h3 className="consola-subtitulo">Qué se hace en este paso</h3>
            {tieneContenido(paso.descripcion) ? (
              <Rico valor={paso.descripcion} />
            ) : (
              <p className="consola-vacio">Sin descripción escrita para este paso.</p>
            )}
            {tieneContenido(paso.riesgo) ? (
              <div className="consola-riesgo">
                <h4>
                  <Info size={16} aria-hidden /> Estructura o principio en juego
                </h4>
                <Rico valor={paso.riesgo} />
              </div>
            ) : null}
          </section>
        ) : null}

        <section>
          <h3 className="consola-subtitulo">Retroalimentación clínica</h3>
          {registro.length === 0 ? (
            <p className="consola-vacio">Todavía no ha aplicado ningún paso.</p>
          ) : (
            <ul className="consola-registro">{registro.map((linea, i) => lineaDeRegistro(linea, i))}</ul>
          )}
        </section>

        {/* Lo guardado de la vez anterior, entero y sin recortar a diez líneas.
            Es la mitad que faltaba: hasta hoy la corrección que el residente
            recibía por un gesto que dañó se iba con la pestaña, de modo que el
            único sitio donde la complicación sobrevivía al paso era el resumen
            de «Caso terminado», y solo hasta recargar. */}
        {recorridoGuardado ? (
          <section>
            <h3 className="consola-subtitulo">Su recorrido anterior</h3>
            <p className="consola-instruccion">
              {recorridoGuardado.puntaje}
              {recorridoGuardado.puntajeMaximo !== null ? ` de ${recorridoGuardado.puntajeMaximo}` : ''}{' '}
              {recorridoGuardado.puntaje === 1 ? 'punto' : 'puntos'} ·{' '}
              {recorridoGuardado.complicaciones.length === 0
                ? 'ninguna complicación'
                : `${recorridoGuardado.complicaciones.length} ${
                    recorridoGuardado.complicaciones.length === 1 ? 'complicación' : 'complicaciones'
                  }`}
              {recorridoGuardado.reduccionAutomatica ? ' · con reducción automática (el ejercicio de reducir no sumó puntos)' : ''}
              . Es lo último que quedó guardado de este caso; el marcador de arriba cuenta el
              recorrido de ahora.
            </p>
            {recorridoGuardado.insumos.length > 0 ? (
              <div className="consola-insumos">
                <p className="consola-instrumento-texto">Insumos que usó</p>
                <ul>
                  {recorridoGuardado.insumos.map((u) => (
                    <li key={u.nombre}>
                      {u.nombre} · <span className="u-num">{u.cantidad}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {recorridoGuardado.complicaciones.length > 0 ? (
              <ul className="consola-registro">
                {recorridoGuardado.complicaciones.map((complicacion, i) =>
                  lineaDeRegistro(
                    {
                      clase: 'grave',
                      texto: `${complicacion.numero ? `${complicacion.numero}. ` : ''}${
                        complicacion.detalle ?? complicacion.titulo ?? 'Complicación sin detalle guardado.'
                      }`,
                    },
                    `${complicacion.paso}-${i}`,
                  ),
                )}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  )
}

/**
 * «Añadir a la bandeja»: solo del editor. Busca en el catálogo entero —por palabras y sin tildes— lo que todavía
 * no está en la bandeja del caso y lo añade con un clic. La bandeja se pinta con lo del caso y nada más; esto es
 * lo único que enseña el resto del catálogo.
 */
function AnadirALaBandeja({
  catalogo,
  alAnadir,
}: {
  catalogo: InstrumentoDeBandeja[]
  alAnadir: (id: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const palabras = paraComparar(texto).split(' ').filter(Boolean)
  const candidatos = catalogo
    .filter((i) => !i.enLaBandejaDelCaso)
    .filter((i) => palabras.every((p) => paraComparar(`${i.nombre} ${i.descripcion ?? ''}`).includes(p)))
    // Escribiendo se enseñan pocos; sin nada escrito, todo el catálogo por categorías (P-003 E6): antes eran cinco
    // sugerencias y los tornillos no aparecían si no se sabía su nombre.
    .slice(0, palabras.length > 0 ? 8 : 200)
  const ordenDeCategorias = CATEGORIAS_DE_INSTRUMENTAL.map((c) => c.value as string)
  const posicionDeCategoria = (k: string) => (ordenDeCategorias.includes(k) ? ordenDeCategorias.indexOf(k) : ordenDeCategorias.length)
  const porCategoria =
    palabras.length > 0
      ? null
      : [
          ...candidatos.reduce(
            (m, i) => m.set(i.categoria ?? 'otros', [...(m.get(i.categoria ?? 'otros') ?? []), i]),
            new Map<string, InstrumentoDeBandeja[]>(),
          ),
        ].sort(([a], [b]) => posicionDeCategoria(a) - posicionDeCategoria(b))
  return (
    <div className="consola-anadir">
      <button
        type="button"
        className="consola-boton consola-boton-ancho"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <Plus size={16} aria-hidden /> Añadir a la bandeja
      </button>
      {abierto ? (
        <div className="consola-anadir-lista">
          <input
            type="search"
            className="consola-busqueda"
            placeholder="Escriba el nombre del instrumento…"
            aria-label="Instrumento que se añade a la bandeja"
            value={texto}
            autoFocus
            onChange={(e) => setTexto(e.target.value)}
          />
          {candidatos.length === 0 ? (
            <p className="consola-vacio">{palabras.length > 0 ? 'Nada coincide: ya está en la bandeja o no existe.' : 'Todo el catálogo está en la bandeja.'}</p>
          ) : porCategoria ? (
            porCategoria.map(([clave, lista]) => (
              <div key={clave}>
                <p className="consola-instrumento-texto">{ETIQUETA_DE_CATEGORIA[clave] ?? 'Otros'}</p>
                <ul>
                  {lista.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        className="consola-anadir-opcion"
                        onClick={() => {
                          alAnadir(i.id)
                          setTexto('')
                        }}
                      >
                        <Plus size={12} aria-hidden /> {i.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <ul>
              {candidatos.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className="consola-anadir-opcion"
                    onClick={() => {
                      alAnadir(i.id)
                      setTexto('')
                    }}
                  >
                    <Plus size={12} aria-hidden /> {i.nombre}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
