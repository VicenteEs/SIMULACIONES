'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  capasQueEnciendeElPaso,
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
import {
  MAXIMO_DE_COMPLICACIONES,
  type ComplicacionDelCaso,
  type RecorridoGuardado,
  type ResultadoDeCirugia,
} from '@/lib/progresoDelSimulador'
import { marcarComoLeida, registrarResultadoDeCirugia } from '@/app/(frontend)/acciones/actividad'
import { Rico, tieneContenido } from '@/components/Rico'
import { IconoInstrumento } from './IconoInstrumento'
import { useConfirmar } from '@/components/ui/Confirmar'
import { Vacio } from '@/components/ui/Vacio'
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  Drill,
  Eraser,
  Focus,
  Info,
  Crosshair,
  Move,
  OctagonAlert,
  PenLine,
  Pin,
  Rotate3d,
  RotateCcw,
  ScanLine,
  Scissors,
  Spline,
  Trophy,
  Undo2,
  UnfoldHorizontal,
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
import type { AjustesDeInstrumento, ArticulacionDeclarada } from '@/instrumental/modelo'
import { comportamientoDelInstrumento } from '@/lib/comportamientoDelInstrumento'
import { InstrumentoArticulado } from './InstrumentoArticulado'
import type {
  AyudasDeEscopia,
  DatosDeNodo,
  EstadoDeLasHeridas,
  EstadoDeLaSutura,
  InclinacionDeBroca,
  InstrumentoEnEscena,
  MandoDelLienzo,
  Modo,
  PerforacionHecha,
  PiezaDelCaso,
  VistaDeEscopia,
} from './LienzoQuirurgico'
import { resumenDeLaFijacion, type EstadoDeLaFijacion } from '@/lib/fijacion'

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
  instrumental: InstrumentoDeBandeja[]
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
    ayuda: 'Trazar: arrastre sobre el modelo para dibujar la incisión.',
  },
  {
    valor: 'mover',
    etiqueta: 'Mover',
    icono: Move,
    ayuda: 'Mover: arrastre el fragmento para colocarlo; la órbita queda desactivada.',
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
    'Separar: arrastre desde el borde de la herida hacia fuera para abrirla. Uno de mano abre el borde que sostiene; uno autoestático abre los dos.',
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

const MODO_PERFORAR: { valor: Modo; etiqueta: string; ayuda: string; icono: LucideIcon } = {
  valor: 'perforar',
  etiqueta: 'Perforar',
  icono: Drill,
  ayuda:
    'Perforar: apunte al hueso y mantenga pulsado; la broca gira y avanza. Elija antes la inclinación; la etiqueta dice el ángulo con el eje del hueso.',
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
}: {
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
  const [fluoroscopia, setFluoroscopia] = useState(false)
  // Las ayudas de los rayos X (D-166). Los ejes salen puestos —son lo que
  // enseña a leer la angulación— y el objetivo no: ver dónde debe quedar el
  // hueso es una ayuda que conviene poder quitar, porque en una radioscopia
  // real nadie lo dibuja.
  const [ayudas, setAyudas] = useState<AyudasDeEscopia>({ objetivo: false, ejes: true })
  const [vistaDeEscopia, setVistaDeEscopia] = useState<VistaDeEscopia>('libre')
  // Segundos con los rayos encendidos en esta exposición. La dosis es lo que más
  // se descuida al aprender: se cuenta y se dice al apagar.
  const [segundosDeEscopia, setSegundosDeEscopia] = useState(0)
  const [instrumento, setInstrumento] = useState<string | null>(null)
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
  // Se arranca con la piel y el músculo apagados, y no encendidos, por el modo
  // «mover»: el lienzo solo arrastra el fragmento si el rayo golpea el propio
  // fragmento, y con la piel delante golpea la piel. Encenderlas de salida
  // dejaría sin poder reducir todos los casos que no escriben `muestra`.
  //
  // Lo que manda sobre esto es el paso: al entrar en uno que declara `muestra`,
  // las capas de lo que declara se encienden solas (`entrarEnPaso`), y el cruce
  // no puede dejar el lienzo vacío (`visibilidadDelPaso`).
  const [capasApagadas, setCapasApagadas] = useState<Set<string>>(() => new Set(['piel', 'musculo']))

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
    (puntajeActual: number, lista: ComplicacionDelCaso[]) => {
      // El editor ensaya: lo que ocurre aquí no es el recorrido de nadie.
      if (editor) return
      const datos: ResultadoDeCirugia = {
        puntaje: puntajeActual,
        puntajeMaximo: maximo,
        complicaciones: lista,
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
      const { nodos, encender } = visibilidadDelPaso(caso.pasos, caso.piezas, indicePaso, apagadas)
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
    [caso.pasos, caso.piezas, anotar, avisarUnaVez],
  )

  /** Entra en un paso: pone las capas que ese paso necesita y refresca el lienzo. */
  const entrarEnPaso = useCallback(
    (indicePaso: number, apagadas: Set<string>) => {
      const encender = capasQueEnciendeElPaso(caso.pasos, caso.piezas, indicePaso, apagadas)
      let siguientes = apagadas
      if (encender.length > 0) {
        siguientes = new Set(apagadas)
        for (const rol of encender) siguientes.delete(rol)
        setCapasApagadas(siguientes)
        anotar(`Este paso se trabaja sobre ${capasEnProsa(encender)}: se vuelve a mostrar.`, 'atencion')
      }
      refrescarVisibles(indicePaso, siguientes)
    },
    [caso.pasos, caso.piezas, anotar, refrescarVisibles],
  )

  const alternarCapa = (rol: string) => {
    const siguientes = new Set(capasApagadas)
    if (siguientes.has(rol)) siguientes.delete(rol)
    else siguientes.add(rol)
    setCapasApagadas(siguientes)
    refrescarVisibles(indice, siguientes)
  }

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
        guardarRecorrido(puntaje, nuevas)
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
    guardarRecorrido(puntajeTrasElPaso, complicaciones)

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
    setModo(MODO_DEL_OBJETIVO[objetivoDelPaso(caso.pasos[0] ?? {})])
    elegirInstrumento(null)
    setFuerza(fuerzaInicial(caso.pasos[0] ?? {}))
    setPuntaje(0)
    setResueltos(new Set())
    setFallados(new Set())
    setComplicados(new Set())
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
    mando.current?.cerrarHeridas()
    mando.current?.borrarAgujeros()
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

  /** Deja el fragmento donde empieza el caso: desplazado, sin reducir. */
  const colocarEnDesplazamientoInicial = useCallback(() => {
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
    if (que?.separa) setModo('separar')
    else if (que?.perfora) setModo('perforar')
    else if (que?.sutura) setModo('coser')
    else if (que?.coloca || que?.mide) setModo('fijar')
    else if (modo === 'separar' || modo === 'perforar' || modo === 'coser' || modo === 'fijar') setModo('orbitar')
    setInstrumento(id)
    setArticulacionesDeclaradas([])
    setArticulacionesMovidas({})
    setErrorDelInstrumento(null)
  }

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
   * Con qué valor está cada articulación del instrumento elegido: lo que movió
   * quien lo usa, o si no lo guardado en el taller, o si no lo que declara el
   * archivo.
   */
  const ajustesDelElegido = instrumentoElegido?.ajustes ?? null
  const urlDelElegido = instrumentoElegido?.modeloUrl ?? null
  const iconoDelElegido = instrumentoElegido?.icono ?? null
  const slugDelElegido = instrumentoElegido?.slug ?? null
  const nombreDelElegido = instrumentoElegido?.nombre ?? ''
  /** Qué le hace al paciente el instrumento en la mano: corta, separa, perfora. */
  const queHace = useMemo(
    () =>
      comportamientoDelInstrumento({ slug: slugDelElegido, nombre: nombreDelElegido, icono: iconoDelElegido }),
    [slugDelElegido, nombreDelElegido, iconoDelElegido],
  )
  const valoresDeArticulacion = useMemo(() => {
    const valores: Record<string, number> = {}
    for (const a of articulacionesDeclaradas) {
      valores[a.nombre] =
        articulacionesMovidas[a.nombre] ?? ajustesDelElegido?.articulaciones?.[a.nombre] ?? a.inicial
    }
    return valores
  }, [articulacionesDeclaradas, articulacionesMovidas, ajustesDelElegido])

  /** Lo que el lienzo necesita para poner el instrumento en la escena. */
  const instrumentoEnEscena = useMemo<InstrumentoEnEscena | null>(
    () =>
      urlDelElegido
        ? {
            url: urlDelElegido,
            ajustes: ajustesDelElegido,
            articulaciones: valoresDeArticulacion,
            corta: iconoDelElegido === 'bisturi' || !!queHace.corta,
            planoDeCorte: queHace.corta,
            separa: queHace.separa,
            perfora: queHace.perfora,
            sutura: queHace.sutura,
            coloca: queHace.coloca,
            mide: queHace.mide,
          }
        : null,
    [urlDelElegido, ajustesDelElegido, valoresDeArticulacion, iconoDelElegido, queHace],
  )

  /**
   * La bandeja tal como se pinta: el residente la ve en una lista; el editor,
   * el catálogo entero agrupado por categoría y filtrado por lo que escriba.
   */
  const gruposDeLaBandeja = useMemo(() => {
    const filtro = busquedaDeInstrumento.trim().toLowerCase()
    const visibles = caso.instrumental.filter(
      (i) => !filtro || i.nombre.toLowerCase().includes(filtro),
    )
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
  const direccionesDeLaBandeja = caso.instrumental.map((i) => i.modeloUrl ?? '').join('|')
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

  // El tiempo de escopia cuenta mientras los rayos están encendidos. Un
  // intervalo y no el reloj de cada pintado: lo único que cambia es un número
  // que se actualiza cada segundo.
  useEffect(() => {
    if (!fluoroscopia) return
    const reloj = window.setInterval(() => setSegundosDeEscopia((s) => s + 1), 1000)
    return () => window.clearInterval(reloj)
  }, [fluoroscopia])

  /**
   * Enciende o apaga los rayos X.
   *
   * Al apagar, deja dicho cuánto se estuvo expuesto. Con una pantalla que da
   * igual cuánto dure, el hábito que se aprende es dejarla encendida; en
   * quirófano cada segundo es dosis para el paciente y para el equipo.
   */
  const alternarRayosX = () => {
    if (fluoroscopia) {
      if (segundosDeEscopia > 0) {
        anotar(
          segundosDeEscopia > 20
            ? `Rayos X apagados tras ${segundosDeEscopia} s. Fue mucho: en pabellón se dispara en tomas cortas, mira la imagen y se apaga.`
            : `Rayos X apagados tras ${segundosDeEscopia} s: una toma corta, como corresponde.`,
          segundosDeEscopia > 20 ? 'atencion' : 'bien',
        )
      }
      setVistaDeEscopia('libre')
      mando.current?.mirarDesde('libre')
    } else {
      setSegundosDeEscopia(0)
    }
    setFluoroscopia(!fluoroscopia)
  }

  const cambiarVistaDeEscopia = (vista: VistaDeEscopia) => {
    setVistaDeEscopia(vista)
    mando.current?.mirarDesde(vista)
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

  const modosVisibles = [
    ...MODOS,
    ...(editor ? [MODO_SENALAR] : []),
    ...(queHace.separa ? [MODO_SEPARAR] : []),
    ...(queHace.perfora ? [MODO_PERFORAR] : []),
    ...(queHace.sutura ? [MODO_COSER] : []),
    ...(queHace.coloca || queHace.mide ? [MODO_FIJAR] : []),
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

  return (
    <section
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
        <div className="consola-modos-bloque">
          <h3 className="consola-subtitulo" id="consola-modo">
            Modo
          </h3>
          <div className="consola-segmentado" role="group" aria-labelledby="consola-modo">
            {modosVisibles.map((m) => {
              const Icono = m.icono
              const pedido = modoDelPaso === m.valor
              return (
                <button
                  key={m.valor}
                  type="button"
                  className={`consola-modo${modo === m.valor ? ' activo' : ''}${pedido ? ' pedido' : ''}`}
                  aria-pressed={modo === m.valor}
                  title={m.ayuda}
                  onClick={() => setModo(m.valor)}
                >
                  <Icono size={18} aria-hidden />
                  <span>{m.etiqueta}</span>
                  {/* El modo que pide el paso se señalaba con « ·» pegado a la
                      etiqueta, un punto de 3 px que nadie veía. Ahora es una
                      marca con palabra, y sigue sin imponerse: cambiar de modo
                      a mano es posible (`MODO_DEL_OBJETIVO`). */}
                  {pedido ? <span className="consola-modo-pedido">paso</span> : null}
                </button>
              )
            })}
          </div>
          <p className="consola-ayuda">
            {ayudaDelModo}
            {etiquetaDelModoDelPaso ? (
              <span className="consola-ayuda-pedido">
                {' '}
                Este paso se hace en modo {etiquetaDelModoDelPaso}.
              </span>
            ) : null}
          </p>
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
            {herida.capas.length > 0 ? (
              <button type="button" className="consola-boton consola-boton-ancho" onClick={() => mando.current?.cerrarHeridas()}>
                <Undo2 size={16} aria-hidden /> Cerrar la herida
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="consola-capas-bloque">
          <h3 className="consola-subtitulo">Capas</h3>
          <ul className="consola-capas">
            {CAPAS.map((capa) => {
              const hay = caso.piezas.some((p) => p.rol === capa.rol)
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
      </div>

      {/* -------------------------------------------------------- lienzo */}
      <div className="consola-centro">
        <div className={`consola-lienzo-marco modo-${modo}`}>
          <LienzoQuirurgico
            url={caso.modeloUrl}
            piezas={caso.piezas}
            modo={modo}
            fluoroscopia={fluoroscopia}
            ayudas={ayudas}
            inclinacionDeBroca={inclinacionDeBroca}
            alHerir={setHerida}
            alCoser={(estado) => {
              setSutura(estado)
              if (!estado) {
                heridaCerradaDicha.current = false
                return
              }
              if (estado.juicio) anotar(estado.juicio, 'atencion')
              if (estado.cierre >= 1 && !heridaCerradaDicha.current) {
                heridaCerradaDicha.current = true
                anotar(
                  `Herida cerrada con ${estado.puntadas} puntadas de ${estado.hilo}, ${estado.bienEspaciadas} de ${estado.tramos} bien espaciadas (5 a 10 mm).`,
                  estado.bienEspaciadas === estado.tramos ? 'bien' : 'atencion',
                )
              }
              if (estado.cierre < 1) heridaCerradaDicha.current = false
            }}
            largoDeTornillo={largoDeTornillo}
            alFijar={(estado, suceso) => {
              setFijacion(estado)
              if (!suceso) return
              if (suceso.largoSugeridoMm) setLargoDeTornillo(suceso.largoSugeridoMm)
              if (suceso.tipo === 'aviso') anotar(suceso.texto, 'atencion')
              else anotar(suceso.texto, suceso.atencion ? 'atencion' : 'bien')
            }}
            alPerforar={(hecha) => {
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
            alMoverFragmento={() => {
              recalcularMedidas()
              editor?.alMoverFragmento?.()
            }}
            alSenalar={editor?.alSenalar}
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
            <button
              type="button"
              className={`consola-lienzo-boton consola-fluoro${fluoroscopia ? ' activo' : ''}`}
              aria-pressed={fluoroscopia}
              title="Todo translúcido: la misma vista de rayos X del taller anatómico"
              onClick={alternarRayosX}
            >
              <ScanLine size={16} aria-hidden /> Rayos X
            </button>
          </div>

          {/* El panel de los rayos X. Solo existe con ellos encendidos: son las
              dos proyecciones de un C-arm, dos ayudas para leer la imagen y el
              contador de exposición. Todo lo que aquí se dibuja de más son
              ayudas de aprendizaje —en una radioscopia real no se ve dónde
              debe quedar el hueso—, y por eso se apagan. */}
          {fluoroscopia ? (
            <div className="consola-escopia" role="group" aria-label="Rayos X">
              <p className="consola-escopia-cabeza">
                <span>
                  <ScanLine size={14} aria-hidden /> Rayos X
                </span>
                <span
                  className={`consola-escopia-tiempo u-num${segundosDeEscopia > 20 ? ' alto' : ''}`}
                  aria-label={`${segundosDeEscopia} segundos de escopia`}
                >
                  {segundosDeEscopia} s
                </span>
              </p>
              <div className="consola-escopia-vistas" role="group" aria-label="Proyección">
                {(
                  [
                    ['libre', 'Libre'],
                    ['ap', 'AP'],
                    ['lateral', 'Lateral'],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    className={`consola-escopia-vista${vistaDeEscopia === valor ? ' activo' : ''}`}
                    aria-pressed={vistaDeEscopia === valor}
                    onClick={() => cambiarVistaDeEscopia(valor)}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
              <label className="consola-escopia-opcion">
                <input
                  type="checkbox"
                  checked={ayudas.ejes}
                  onChange={(e) => setAyudas({ ...ayudas, ejes: e.target.checked })}
                />
                <span>
                  Guía de ejes
                  <small>verde, el hueso fijo · ámbar, el fragmento</small>
                </span>
              </label>
              <label className="consola-escopia-opcion">
                <input
                  type="checkbox"
                  checked={ayudas.objetivo}
                  disabled={!caso.piezas.some((p) => p.rol === 'fragmento')}
                  onChange={(e) => setAyudas({ ...ayudas, objetivo: e.target.checked })}
                />
                <span>
                  Dónde debe quedar
                  <small>silueta verde del fragmento reducido</small>
                </span>
              </label>
              {ayudas.ejes ? (
                <p className="consola-escopia-lectura">
                  Entre los dos ejes hay <strong className="u-num">{reduccion.angulacion}°</strong>
                  {objetivo === 'reduccion' && topes
                    ? reduccion.angulacion > topes.angulacion
                      ? `: se pasa del tope de ${topes.angulacion}°.`
                      : `: dentro del tope de ${topes.angulacion}°.`
                    : '.'}
                </p>
              ) : null}
              {segundosDeEscopia > 20 ? (
                <p className="consola-escopia-aviso">
                  Mucha exposición. En pabellón se dispara, se mira y se apaga.
                </p>
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
                    Arrastre el fragmento para alinearlo y corrija la angulación aquí.
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

              {/* Lo que acaba de pasar, donde el residente está mirando. El
                  registro completo sigue en el pie, que en este portátil queda
                  por debajo del pliegue. */}
              <div role="status" aria-live="polite">
                {resultado ? (
                  <ul className="consola-registro consola-registro-ultimo">
                    {lineaDeRegistro(resultado, 'ultimo')}
                  </ul>
                ) : null}
              </div>
            </div>
          </>
        )}

        <div className="consola-bandeja-bloque">
          <h3 className="consola-subtitulo">
            Instrumental{editor ? ` · ${caso.instrumental.length}` : ''}
          </h3>
          {/* El editor ve el catálogo entero, ya cargado: son los instrumentos
              que se modelaron, y el autor tiene que poder cogerlos todos para
              decidir cuál va en cada paso. El residente ve la bandeja del caso
              —los de los pasos más los señuelos—, porque una bandeja con los
              cuarenta del hospital no enseña a elegir. */}
          {editor ? (
            <input
              type="search"
              className="consola-busqueda"
              placeholder="Buscar un instrumento…"
              aria-label="Buscar un instrumento"
              value={busquedaDeInstrumento}
              onChange={(e) => setBusquedaDeInstrumento(e.target.value)}
            />
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
                {grupo.instrumentos.map((it) => (
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
                      {editor?.instrumentoDelPaso === it.id ? (
                        <span className="instrumento-etiqueta instrumento-etiqueta-paso">este paso</span>
                      ) : it.enLaBandejaDelCaso ? (
                        <span className="instrumento-etiqueta">en la bandeja</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              ) : null}
            </div>
            )
          })}
          {gruposDeLaBandeja.length === 0 ? (
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
          {instrumentoElegido ? (
            <div className="consola-instrumento">
              {instrumentoElegido.modeloUrl &&
              encuadreVigente(undefined, instrumentoElegido.encuadreDelModelo) === undefined ? (
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
                  encuadre={encuadreVigente(undefined, instrumentoElegido.encuadreDelModelo)}
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

              {queHace.corta ? (
                <p className="consola-instrumento-texto">
                  Corta {queHace.corta === 'piel' ? 'la piel' : 'los planos de debajo de la piel'}: pase al
                  modo «Trazar» y arrastre sobre el modelo. Al soltar, la malla se abre a lo largo del trazo.
                </p>
              ) : null}

              {queHace.separa ? (
                <div className="consola-instrumento-articulaciones">
                  <label className="consola-instrumento-articulacion">
                    <span>Apertura</span>
                    <input
                      type="range"
                      min={0}
                      max={queHace.separa.maximoMm}
                      step={1}
                      value={Math.min(queHace.separa.maximoMm, Math.round(herida?.aperturaMm ?? 0))}
                      disabled={!herida || herida.capas.length === 0}
                      onChange={(e) => mando.current?.abrirHeridas(Number(e.target.value))}
                      aria-label={`Apertura de la herida con ${instrumentoElegido.nombre}`}
                    />
                    <output>{Math.round(herida?.aperturaMm ?? 0)} mm</output>
                  </label>
                  <p className="consola-instrumento-texto">
                    {queHace.separa.autoestatico
                      ? 'Autoestático: se queda abierto solo, con su trinquete.'
                      : 'De mano: abre el borde que sostiene; el otro lo sostiene un ayudante.'}{' '}
                    Abre hasta {queHace.separa.maximoMm} mm. {herida && herida.capas.length > 0
                      ? 'También se puede arrastrar desde el borde de la herida, en modo «Separar».'
                      : 'Aún no hay herida: corte antes con un bisturí.'}
                  </p>
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
                </div>
              ) : null}

              {queHace.coloca || queHace.mide ? (
                <div className="consola-instrumento-articulaciones">
                  <p className="consola-instrumento-texto">
                    {queHace.coloca?.tipo === 'placa'
                      ? 'Pase al modo «Fijar» y pique sobre el hueso: la placa se apoya con su largo siguiendo el hueso.'
                      : queHace.coloca?.tipo === 'tornillo'
                        ? 'Pase al modo «Fijar» y pique en un agujero de la placa. El tornillo entra perpendicular a la placa; mida antes con el medidor de profundidad.'
                        : 'Pase al modo «Fijar» y apoye el medidor en un agujero de la placa: dice cuánto hueso hay debajo y qué tornillo pedir.'}
                  </p>
                  {queHace.coloca?.tipo === 'tornillo' ? (
                    <label className="consola-instrumento-articulacion">
                      <span>Largo del tornillo</span>
                      <input
                        type="range"
                        min={10}
                        max={60}
                        step={2}
                        value={largoDeTornillo}
                        onChange={(e) => setLargoDeTornillo(Number(e.target.value))}
                        aria-label="Largo del tornillo"
                      />
                      <output>{largoDeTornillo} mm</output>
                    </label>
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
                    lado de la herida acerca los bordes; lo habitual en piel es de 5 a 10 mm entre puntadas.
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
                        <dt>Herida cerrada</dt>
                        <dd>{herida && herida.capas.length > 0 ? `${Math.round(sutura.cierre * 100)} %` : 'sin herida'}</dd>
                      </div>
                    </dl>
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
          ) : null}
        </div>
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
              . Es lo último que quedó guardado de este caso; el marcador de arriba cuenta el
              recorrido de ahora.
            </p>
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
