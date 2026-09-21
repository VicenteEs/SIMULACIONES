'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import type {
  CatalogoDelAtlas,
  CorteDePieza,
  PiezaDelAtlas,
  VistaDeInstancia,
} from '@/atlas/formato'
import { VISTA_INICIAL, idDeFragmento, partesDeFragmento, piezaDe } from '@/atlas/formato'
import { ArbolAnatomico } from '@/components/atlas/ArbolAnatomico'
import type { HerramientaDelVisor, LadoDeLaVista, MandoDelVisor } from '@/components/atlas/VisorAtlas'
import { seleccionTras, type ModoDeSeleccion } from '@/atlas/seleccion'
import { cuaternionDeGrados, gradosDeCuaternion } from '@/atlas/angulos'
import { parejasContralaterales, reflejarGiro, reflejarVector } from '@/atlas/espejo'
import {
  MAXIMO_DE_MARCAS,
  MAXIMO_DE_VISTAS,
  textoDeLaMarca,
  type MarcaDeInstancia,
  type VistaConNombre,
} from '@/atlas/marcas'
import type { AspectoDePieza, TransformacionDePieza } from '@/atlas/cargador'
// Estático sin miedo: `nombres.ts` es una tabla JSON y tres funciones de texto,
// sin three. Lo que no puede entrar así es `@/atlas/cargador` (ver abajo).
import { casaConLaBusqueda, nombreEnEspanol, tieneTraduccion } from '@/atlas/nombres'
import type { RolDePieza } from '@/lib/piezasDelCaso'
// Los dos, sin three: `clasificacion.ts` es una tabla y `planoDeCorte.ts` es
// aritmética que se prohíbe a sí mismo importar three. La mitad del corte que sí
// lo necesita, `osteotomia.ts`, no se importa desde aquí; y `CorteExportado` es
// solo un tipo, que se borra al compilar.
import { rolDeSistema } from '@/atlas/clasificacion'
import {
  CORTE_POR_OMISION,
  INCLINACION_MAXIMA,
  POSICION_MAXIMA,
  POSICION_MINIMA,
  caraDelGiro,
  describirCorte,
  type CorteDeHueso,
} from '@/lib/planoDeCorte'
import type { CorteExportado } from '@/lib/exportarAtlas'
import { ETIQUETA_DE_ROL } from '@/admin/etiquetaDeRol'
import { apuntarCambiosSinGuardar } from '@/admin/salidaDelEditor'
import {
  duplicarInstancia,
  eliminarInstancia,
  exportarComoModelo,
  guardarInstancia,
  listarInstancias,
  listarModelosDelAtlas,
  type ModeloParaElTaller,
  obtenerInstancia,
  type ResumenDeInstancia,
} from '@/app/(frontend)/acciones/atlas'

/**
 * El visor —y con él el motor 3D— se trae aparte del trozo de entrada.
 *
 * three.js son 725 KB sin comprimir y es, con diferencia, el trozo más pesado
 * de la plataforma. Lo primero que el taller tiene que enseñar es texto —«Leyendo
 * el catálogo del atlas…», y en un servidor sin atlas el aviso de que no se pudo
 * abrir—, así que arrastrarlo de forma normal dejaba la pantalla en blanco
 * varios segundos en una tableta para no enseñar nada tridimensional.
 *
 * Este `dynamic()` por sí solo no bastaba, y durante una versión entera este
 * comentario tuvo que confesarlo: había una segunda puerta abierta arriba.
 * `cargarCatalogo` vive en `@/atlas/cargador`, cuya línea 25 es
 * `import * as THREE from 'three'`, de modo que pedir un JSON de cuarenta
 * líneas metía el motor entero en el trozo de entrada y los 725 KB no se movían
 * de donde estaban. Por eso ese módulo se pide ahora con `import()` desde el
 * efecto del catálogo, y por eso **este archivo no puede volver a importar nada
 * de `@/atlas/cargador` de forma estática**: la primera línea que lo haga
 * deshace las dos mitades a la vez sin que se note en desarrollo y sin perder
 * un píxel de pantalla. Lo único que lo canta hoy es
 * `tests/unit/tallerDeAtlas.test.ts`, que lee esta fuente y exige las dos
 * mitades —el `dynamic()` de abajo y el `import()` del efecto—; antes de esa
 * prueba la única defensa era este párrafo, y ya se rompió una vez.
 *
 * Lo limpio sería que `cargarCatalogo` —que es un `fetch` y nada más— viviera
 * en un módulo sin three, y que lo importaran de ahí sus dos usuarios, este
 * taller y `VisorInstancia`. Mientras siga donde está, el `import()` es lo que
 * mantiene la promesa. Quien haga la mudanza tiene que llevarse en el mismo
 * commit las dos afirmaciones de esa prueba que fijan el `import()` literal, o
 * la suite se queda en rojo señalando el arreglo.
 *
 * `ssr: false` porque un lienzo WebGL en el servidor es un hueco vacío, lo
 * mismo que en `VisoresPerezosos`.
 */
const VisorAtlas = dynamic(
  () => import('@/components/atlas/VisorAtlas').then((m) => m.VisorAtlas),
  {
    ssr: false,
    loading: () => (
      <div className="atlas-lienzo">
        <div className="atlas-cargando">
          <p>Cargando el visor…</p>
        </div>
      </div>
    ),
  },
)

/**
 * Cuánto puede moverse la cámara sin que cuente como cambio, en metros.
 *
 * Dos milímetros: por debajo solo hay deriva de coma flotante de OrbitControls
 * y del redondeo de `vistaActual()`; por encima no hay gesto humano que mueva
 * menos.
 */
/** Cuántos pasos se pueden deshacer. */
const MAXIMO_DE_DESHACER = 50

/** Lo que Ctrl + Z devuelve: qué había encendido y qué estaba fuera de su sitio. */
interface PasoDelTaller {
  visibles: Set<string>
  transformaciones: Map<string, TransformacionDePieza>
  cortes: CorteDePieza[]
  aspectos: Map<string, AspectoDePieza>
}

/** Los aspectos en una cadena, para «cambios sin guardar». */
function firmaDeAspectos(mapa: ReadonlyMap<string, AspectoDePieza>): string {
  return [...mapa.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, a]) => `${id}:${a.color ?? ''}:${a.opacidad ?? 1}`)
    .join(';')
}

/**
 * Las transformaciones en una sola cadena, para saber si cambiaron respecto de
 * lo guardado. Ordenada por pieza y redondeada como redondea el servidor
 * (`transformacionLimpia`): sin el redondeo, guardar dejaba el cartel de
 * «cambios sin guardar» encendido, porque lo guardado ya no era idéntico a lo
 * que había en pantalla.
 */
/** Las transformaciones que trae guardadas una preparación, por pieza. */
function transformacionesDe(
  piezas: { id: string; mover?: [number, number, number]; girar?: [number, number, number, number] }[],
): Map<string, TransformacionDePieza> {
  const mapa = new Map<string, TransformacionDePieza>()
  for (const pieza of piezas) {
    if (!pieza.mover && !pieza.girar) continue
    mapa.set(pieza.id, { mover: pieza.mover ?? [0, 0, 0], girar: pieza.girar ?? [0, 0, 0, 1] })
  }
  return mapa
}

/** Los cortes en una cadena, redondeados como los redondea el servidor (`cortesValidos`). */
function firmaDeCortes(cortes: readonly CorteDePieza[]): string {
  return [...cortes]
    .sort((a, b) => (a.pieza < b.pieza ? -1 : 1))
    .map(
      (c) =>
        `${c.pieza}:${c.punto.map((n) => n.toFixed(5)).join(',')}:${c.normal.map((n) => n.toFixed(5)).join(',')}`,
    )
    .join(';')
}

function firmaDeTransformaciones(mapa: ReadonlyMap<string, TransformacionDePieza>): string {
  return [...mapa.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(
      ([id, t]) =>
        `${id}:${t.mover.map((n) => n.toFixed(4)).join(',')}:${t.girar.map((n) => n.toFixed(5)).join(',')}`,
    )
    .join(';')
}

/**
 * Los atajos, tal como se enseñan en el panel «Atajos». Son los de Blender
 * donde Blender tiene uno, porque es de donde viene quien los pidió; las vistas
 * valen también con los números de arriba, porque un portátil no tiene teclado
 * numérico. La lista y `alPulsarTecla` se cambian juntas.
 */
const ATAJOS_DEL_TALLER: [string, string][] = [
  ['Clic', 'Seleccionar una pieza. Mayús + clic la suma o la quita.'],
  ['B', 'Marco: arrastrar para seleccionar. Mayús suma, Ctrl quita. Esc vuelve a girar.'],
  ['A · Alt + A', 'Seleccionar todo lo encendido · no seleccionar nada.'],
  ['Ctrl + I', 'Invertir la selección.'],
  ['Supr · X · H', 'Apagar lo seleccionado.'],
  ['Mayús + H', 'Dejar encendido solo lo seleccionado.'],
  ['Alt + H', 'Encender todo el cuerpo.'],
  ['G · R', 'Mover · rotar lo seleccionado. X, Y o Z atan a un eje; clic o Intro confirman, Esc cancela.'],
  ['G X 8 Intro', 'Teclear un número durante el gesto lo hace exacto: milímetros al mover, grados al rotar.'],
  ['Asas', 'Arrastrar una flecha de color mueve por ese eje; un aro, gira sobre él. X rojo, Y verde, Z azul.'],
  ['K', 'Cortar: con un hueso seleccionado, trazar una línea de lado a lado lo parte en dos fragmentos.'],
  ['Alt + G · Alt + R', 'Devolver lo seleccionado a su posición · a su orientación anatómica.'],
  ['Ctrl + G · Ctrl + Mayús + G', 'Agrupar lo seleccionado, para seleccionarlo y moverlo junto · desagruparlo.'],
  ['Mayús + G', 'Seleccionar todo lo encendido del mismo sistema (hueso, músculo, vaso…).'],
  ['Ctrl + Z · Ctrl + Mayús + Z', 'Deshacer · rehacer, hasta cincuenta pasos.'],
  ['M', 'Medir la distancia entre dos puntos de la anatomía. «Ángulo» pide tres; «Rótulo», uno.'],
  ['5', 'Vista ortográfica, sin fuga. Otra vez, vuelve la perspectiva.'],
  ['Alt + Z', 'Rayos X: ver a través de lo que no está seleccionado.'],
  ['1 · 3 · 7', 'Vista de frente, lateral y superior. Con Ctrl, la contraria.'],
  ['Punto', 'Centrar la vista en lo seleccionado.'],
  ['Inicio', 'Encuadrar todo lo encendido.'],
]

const HOLGURA_ENCUADRE = 0.002

/**
 * Si dos encuadres son el mismo dentro de `HOLGURA_ENCUADRE`.
 *
 * Una sola comparación para las dos preguntas que la hacen: si la cámara se
 * movió desde la referencia (`encuadreMovido`) y si la referencia es todavía la
 * cámara que el visor acaba de recolocar al cargar (`asentarReferencia`). Con
 * una copia en cada una, el día que cambiara la holgura una daría la cámara por
 * quieta y la otra no la reconocería, y el aviso de cambios sin guardar
 * volvería a saltar solo.
 */
function mismoEncuadre(a: VistaDeInstancia, b: VistaDeInstancia): boolean {
  return (
    a.camara.every((n, i) => Math.abs(n - b.camara[i]) <= HOLGURA_ENCUADRE) &&
    a.objetivo.every((n, i) => Math.abs(n - b.objetivo[i]) <= HOLGURA_ENCUADRE)
  )
}

/**
 * Lo que se dice cuando la llamada al servidor **rechaza**, que no es lo mismo
 * que un «no se pudo».
 *
 * Las acciones de este panel devuelven `{ exito: false, mensaje }` cuando el
 * trabajo falla por dentro, pero la llamada misma se puede caer antes de llegar
 * —wifi que parpadea, despliegue a medias, servidor reiniciándose—. Sin
 * atenderlo, el rechazo quedaba suelto: el indicador se apagaba, la pantalla se
 * quedaba igual que antes de pulsar y el traumatólogo volvía a pulsar creyendo
 * que no había llegado.
 *
 * A diferencia del mismo aviso en los otros paneles, este NO manda recargar:
 * aquí recargar tira la preparación que se esté armando —media hora de apagar
 * piezas— y el fallo de transporte no la ha tocado.
 */
const FALLO_DE_TRANSPORTE =
  'No se pudo contactar con el servidor. Compruebe la conexión y reintente: ' +
  'lo que hay en pantalla no se ha perdido.'

/**
 * Lo que devuelve `exportarComoModelo`, tal como lo pinta el panel.
 *
 * `piezas` es opcional a propósito. La acción del servidor está pasando a
 * decir, además de los nodos, con qué etiqueta y en qué capa entra cada uno;
 * obligatorio, este archivo no compilaría contra la acción de hoy, que no lo
 * manda; sin declararlo, no habría manera de leerlo cuando llegue. Con `?`
 * compila con las dos, y el panel enseña lo que haya.
 */
interface ResultadoDeExportar {
  nombre: string
  bytes: number
  nodos: string[]
  perdidas: string[]
  piezas?: { nodo: string; etiqueta: string; rol: RolDePieza }[]
  /** El hueso partido y sus dos nodos, si se pidió corte. */
  corte?: CorteExportado | null
}

/**
 * Taller del atlas anatómico.
 *
 * Aquí el traumatólogo abre el cuerpo completo, apaga lo que no le interesa y
 * guarda lo que queda como una **preparación** con nombre, que después se puede
 * insertar en cualquier ficha.
 *
 * Lo que hay que tener claro al leer esto: **el atlas no se modifica nunca**.
 * Apagar una pieza cambia un número en una textura, no borra geometría, y
 * guardar escribe una lista de identificadores. Por eso trabajar sobre una
 * preparación no puede estropear el original, y por eso una pieza que se quitó
 * se puede devolver: nunca se perdió.
 */

export function TallerDeAtlas() {
  const [catalogo, setCatalogo] = useState<CatalogoDelAtlas | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  const [visibles, setVisibles] = useState<Set<string>>(new Set())
  const [resaltada, setResaltada] = useState<string | null>(null)
  const [separacion, setSeparacion] = useState(0)

  // --- el trabajo al estilo de Blender (D-126) ------------------------------
  //
  // La selección no se guarda: es con qué se está trabajando ahora, no parte de
  // la preparación. Por eso no entra en la referencia de «cambios sin guardar».
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [herramienta, setHerramienta] = useState<HerramientaDelVisor>('orbita')
  const [atajosAbiertos, setAtajosAbiertos] = useState(false)
  /** Rayos X: una forma de mirar, no parte de la preparación. No se guarda. */
  const [rayosX, setRayosX] = useState(false)
  /** Vista ortográfica: también es solo una forma de mirar. La ficha abre siempre en perspectiva. */
  const [ortografica, setOrtografica] = useState(false)
  /** Las flechas y los aros sobre lo seleccionado. Encendidos de entrada: son lo que enseña que se puede mover. */
  const [gizmo, setGizmo] = useState(true)
  /**
   * Las piezas encendidas de antes de cada cambio, para Ctrl + Z.
   *
   * Solo deshace lo encendido y lo apagado, que es lo que se pierde con un
   * gesto de más: un marco mal soltado seguido de Supr apagaba cuarenta piezas
   * y volver a encontrarlas en el árbol era rehacer el trabajo. Tiene techo
   * porque cada entrada es un conjunto de hasta 2.234 identificadores. Es
   * estado y no un ref porque el botón «Deshacer» se apaga cuando está vacío.
   */
  const [historial, setHistorial] = useState<PasoDelTaller[]>([])
  /** Lo deshecho, para Ctrl + Mayús + Z. Se vacía con cualquier cambio nuevo. */
  const [rehacer, setRehacer] = useState<PasoDelTaller[]>([])
  /**
   * Las piezas sacadas de su sitio (D-129). A diferencia de la selección, esto
   * SÍ es parte de la preparación: se guarda, entra en «cambios sin guardar» y
   * es lo que el residente ve en la ficha.
   */
  const [transformaciones, setTransformaciones] = useState<Map<string, TransformacionDePieza>>(
    new Map(),
  )
  /**
   * Los huesos partidos (D-130): solo el plano de cada uno. Lo que se haya
   * movido cada fragmento vive en `transformaciones`, con el identificador del
   * fragmento (`FJ1234#a`), y se junta con su corte al guardar.
   */
  const [cortes, setCortes] = useState<CorteDePieza[]>([])
  /** Color y opacidad propios de cada pieza (D-134). Parte de la preparación: se guarda y se ve en la ficha. */
  const [aspectos, setAspectos] = useState<Map<string, AspectoDePieza>>(new Map())
  const ultimoCambioDeAspecto = useRef(0)
  /**
   * Rótulos y medidas sobre el modelo, y las vistas con nombre (D-135). Parte de
   * la preparación. No entran en deshacer: se quitan con su botón, que está al
   * lado, y meterlas ahí mezclaba «deshacer el corte» con «deshacer el rótulo».
   */
  const [marcas, setMarcas] = useState<MarcaDeInstancia[]>([])
  const [vistas, setVistas] = useState<VistaConNombre[]>([])
  const [nombreDeVista, setNombreDeVista] = useState('')
  /**
   * Piezas que se seleccionan juntas (D-136): pulsar una selecciona su grupo
   * entero, y así G y R se lo llevan todo —el fragmento distal con su pie y sus
   * músculos— sin tener que volver a marcarlo cada vez.
   */
  const [grupos, setGrupos] = useState<string[][]>([])

  const [instancia, setInstancia] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [vistaInicial, setVistaInicial] = useState<VistaDeInstancia>(VISTA_INICIAL)

  const [guardadas, setGuardadas] = useState<ResumenDeInstancia[]>([])
  /** Los modelos 3D del catálogo, con las piezas del atlas de cada uno (D-131). `null`: aún no se sabe. */
  const [modelos, setModelos] = useState<ModeloParaElTaller[] | null>(null)
  const [modeloAbierto, setModeloAbierto] = useState<string | null>(null)
  // Separado de `guardadas` porque «no hay ninguna» y «no se pudo preguntar»
  // son dos cosas distintas y se veían igual: un array vacío.
  const [listaFallo, setListaFallo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [enCurso, iniciar] = useTransition()
  // Qué se está haciendo, porque `enCurso` es de toda la transición y aquí hay
  // dos trabajos largos: mientras se exportaba —que son decenas de megabytes
  // leídos del disco— el botón principal ponía «Guardando…» sin estar
  // guardando nada.
  const [trabajo, setTrabajo] = useState<'guardar' | 'exportar' | null>(null)

  // --- exportar la preparación como modelo de un caso -----------------------
  //
  // El atlas y la consola son dos motores distintos: el atlas funde todas las
  // piezas de un sistema en una malla y decide qué se ve con una textura; la
  // consola abre un archivo con objetos con nombre, mueve uno y mide
  // milímetros. Por eso el puente va de aquí hacia allá y no al revés: lo que
  // se prepara aquí se **escribe** como un .glb igual que el que sale de
  // Blender, y para la consola es un modelo más.
  //
  // Las protagonistas son las piezas que salen como objeto suelto en vez de
  // fundirse con su sistema: la tibia que se va a romper, el fragmento que hay
  // que reducir. Sin marcar ninguna, el archivo sale con un objeto por sistema
  // y no habría nada que mover en el simulador.
  const [panelExportar, setPanelExportar] = useState(false)
  const [protagonistas, setProtagonistas] = useState<Set<string>>(new Set())
  const [filtroProtagonista, setFiltroProtagonista] = useState('')
  const [exportado, setExportado] = useState<ResultadoDeExportar | null>(null)

  /**
   * El hueso que se exporta partido, y cómo.
   *
   * Lo pidió el dueño —«quiero poder por ejemplo quebrar el hueso»— y eligió
   * «un corte limpio sirve». Hasta aquí, un caso con fragmento que reducir
   * necesitaba traer el hueso ya partido de Blender.
   *
   * Uno solo: el caso mueve un único fragmento, y marcar el corte en otra pieza
   * lo quita de la anterior en vez de sumar un segundo.
   */
  const [corte, setCorte] = useState<CorteDeHueso | null>(null)

  /**
   * Las protagonistas que siguen encendidas.
   *
   * Marcar una pieza y apagarla después dejaba la marca puesta y fuera de la
   * vista, porque el panel solo lista las encendidas: la cuenta prometía «3
   * piezas sueltas» y el archivo salía con cero, ya que el servidor exporta lo
   * que hay en la preparación guardada y allí esa pieza no está.
   */
  const protagonistasVivas = useMemo(
    () => [...protagonistas].filter((id) => visibles.has(id)),
    [protagonistas, visibles],
  )

  /**
   * El corte, solo si su pieza sigue siendo una protagonista encendida.
   *
   * Por lo mismo que `protagonistasVivas`: apagar la tibia en el árbol dejaba
   * la marca puesta y fuera de la vista, y el servidor rechazaría el corte de
   * una pieza que ya no está en la preparación. Lo que se dibuja en el visor y
   * lo que se envía es esto, no el estado crudo.
   */
  const corteVivo = useMemo(
    () => (corte && protagonistasVivas.includes(corte.pieza) ? corte : null),
    [corte, protagonistasVivas],
  )

  /**
   * Deja el panel de exportación como recién abierto.
   *
   * Se llama al cambiar de preparación: las marcas y el resultado son de la
   * anterior, y el recuadro con los nombres de los nodos —«esto es lo que el
   * caso tiene que escribir en sus piezas»— apuntando a otro archivo es peor
   * que no enseñar nada. El panel se queda abierto si lo estaba: exportar
   * varias preparaciones seguidas es el uso normal y cerrarlo obligaría a
   * volver a abrirlo cada vez.
   */
  const limpiarExportacion = useCallback(() => {
    setProtagonistas(new Set())
    setFiltroProtagonista('')
    setExportado(null)
    setCorte(null)
  }, [])

  const mando = useRef<MandoDelVisor | null>(null)

  // --- trabajo sin guardar --------------------------------------------------
  //
  // Apagar piezas una a una hasta dejar la tibia sola es media hora de trabajo,
  // y hasta ahora se perdía en silencio: «Cuerpo completo» reiniciaba todo sin
  // preguntar, abrir otra preparación pisaba la que había encima, y cerrar la
  // pestaña se lo llevaba sin una palabra. Nada de eso daba error, que es lo
  // que lo hacía peor: el traumatólogo se enteraba al volver a mirar.
  //
  // Para saber si hay algo que perder se compara el estado de ahora con el de
  // la última vez que se guardó o se abrió algo. La referencia guarda también
  // el encuadre, porque el encuadre **se guarda**: `guardar()` escribe la
  // cámara y la separación, y son exactamente lo que el residente ve al abrir
  // la ficha. Vigilar solo las piezas y los textos dejaba fuera media hora de
  // buscar el ángulo que enseña la fractura, y se perdía igual de callado que
  // lo demás antes de este bloque.
  const [referencia, setReferencia] = useState<{
    nombre: string
    descripcion: string
    piezas: string
    transformaciones: string
    cortes: string
    aspectos: string
    apuntes: string
    vista: VistaDeInstancia
  }>({
    nombre: '',
    descripcion: '',
    piezas: '',
    transformaciones: '',
    cortes: '',
    aspectos: '',
    apuntes: '[[],[],[]]',
    vista: VISTA_INICIAL,
  })

  const clavePiezas = useMemo(() => [...visibles].sort().join(','), [visibles])
  const claveCortes = useMemo(() => firmaDeCortes(cortes), [cortes])
  const claveAspectos = useMemo(() => firmaDeAspectos(aspectos), [aspectos])
  const claveApuntes = useMemo(
    () => JSON.stringify([marcas, vistas, grupos]),
    [marcas, vistas, grupos],
  )
  const claveTransformaciones = useMemo(
    () => firmaDeTransformaciones(transformaciones),
    [transformaciones],
  )

  const sucio =
    catalogo !== null &&
    (clavePiezas !== referencia.piezas ||
      claveTransformaciones !== referencia.transformaciones ||
      claveCortes !== referencia.cortes ||
      claveAspectos !== referencia.aspectos ||
      claveApuntes !== referencia.apuntes ||
      nombre.trim() !== referencia.nombre ||
      descripcion.trim() !== referencia.descripcion ||
      separacion !== referencia.vista.separacion)

  /**
   * Si la cámara se ha movido desde la referencia, anotado para poder pintarlo.
   *
   * Va **fuera** de `sucio` a propósito, aunque el encuadre se guarde: `sucio`
   * es además la guardia de `exportar()`, y lo que se exporta es geometría, que
   * no cambia por mirarla desde otro lado. Metido dentro, girar el modelo para
   * comprobar la preparación antes de exportarla bastaba para que dejara de
   * poder exportarse, con un mensaje que mandaba guardar lo que ya estaba
   * guardado.
   */
  const [camaraMovida, setCamaraMovida] = useState(false)

  /**
   * Lo que se le enseña a quien está delante: hay trabajo que se puede perder.
   *
   * Junta las dos mitades porque para el traumatólogo son la misma cosa. Las
   * guardias de dentro siguen separadas y son más estrictas: `exportar()` mira
   * solo `sucio`, y `confirmarDescarte` pregunta por la cámara de verdad en vez
   * de fiarse de esta copia.
   */
  const hayQueAvisar = sucio || camaraMovida

  /** Toma el estado de ahora como «lo guardado»: nada que perder. */
  const fijarReferencia = useCallback(
    (
      piezas: Set<string>,
      titulo: string,
      texto: string,
      vista: VistaDeInstancia,
      movidas: ReadonlyMap<string, TransformacionDePieza> = new Map(),
      partidos: readonly CorteDePieza[] = [],
      pintadas: ReadonlyMap<string, AspectoDePieza> = new Map(),
      apuntes: [readonly MarcaDeInstancia[], readonly VistaConNombre[], readonly string[][]] = [
        [],
        [],
        [],
      ],
    ) => {
      setReferencia({
        nombre: titulo.trim(),
        descripcion: texto.trim(),
        piezas: [...piezas].sort().join(','),
        transformaciones: firmaDeTransformaciones(movidas),
        cortes: firmaDeCortes(partidos),
        aspectos: firmaDeAspectos(pintadas),
        apuntes: JSON.stringify(apuntes),
        vista,
      })
      // El encuadre entra en la referencia, así que lo que hubiera de movido
      // deja de contar aquí mismo. Sin esta línea el cartel ámbar seguía
      // encendido después de guardar, hasta que alguien volviera a tocar la
      // cámara.
      setCamaraMovida(false)
    },
    [],
  )

  /**
   * Si la cámara ya no está donde la dejó lo último que se guardó o se abrió.
   *
   * Se le pregunta al mando y no al estado de React porque la cámara vive
   * dentro de three.js, cambia en cada fotograma de órbita y no pasa nunca por
   * aquí: al pintar no hay nada que comparar. Esta es la respuesta buena, la
   * que se consulta antes de tirar el trabajo; `camaraMovida` es solo su copia
   * para poder pintar un cartel.
   *
   * Con holgura y no con igualdad: `irA` deja la cámara a millonésimas del
   * punto pedido, OrbitControls la recalcula en cada fotograma y `vistaActual()`
   * redondea a milímetros. Comparando exacto, abrir una preparación y pulsar
   * «Cuerpo completo» a continuación sacaba el «¿continuar y perderlos?» sin
   * que nadie hubiera tocado nada, y una confirmación que salta sola enseña a
   * pulsar «aceptar» sin leer, que es justo lo que aquí no conviene.
   */
  const encuadreMovido = () => {
    const ahora = mando.current?.vistaActual()
    if (!ahora) return false
    return !mismoEncuadre(ahora, referencia.vista)
  }

  /**
   * Apunta en el estado si el gesto que acaba de terminar movió la cámara.
   *
   * Existe porque el cartel de «cambios sin guardar» se pinta, y hasta ahora
   * media hora buscando el ángulo que enseña la fractura no encendía nada: la
   * cabecera seguía diciendo que no había nada pendiente y, al pulsar «Cuerpo
   * completo», saltaba de golpe un `confirm` que afirmaba lo contrario.
   *
   * Se mira al terminar el gesto y no se le pide al visor que avise desde su
   * oyente `change` de OrbitControls: allí el aviso llega decenas de veces por
   * segundo mientras se orbita, y lo único que hay que decidir es cómo quedó la
   * cámara al soltar.
   *
   * Y dentro de `requestAnimationFrame` porque OrbitControls no aplica el gesto
   * en el evento sino en su propio bucle: preguntado dentro del `wheel`, un
   * único golpe de rueda devolvía todavía la cámara de antes y el cartel no se
   * encendía hasta el siguiente.
   */
  const revisarEncuadre = () => {
    requestAnimationFrame(() => {
      if (encuadreMovido()) setCamaraMovida(true)
    })
  }

  /**
   * Lleva la referencia a la cámara con la que el visor se quedó al terminar la
   * carga, si la referencia era la cámara de antes de moverla.
   *
   * Abrir una preparación mientras bajan los paquetes toma como referencia lo
   * que devuelve `irA`, y con el cuerpo separado eso todavía no es la decisión
   * final: la caja buena necesita la escena, y el visor recoloca al cargar (ver
   * `alAsentarVista` en el visor). Lo mismo si se abrió antes de que el
   * `dynamic()` trajera el visor: `irA` no existía y la referencia es lo
   * pedido. Sin esto, la cámara quedaba lejos de la referencia sin que nadie la
   * hubiera tocado, saltaba «cambios sin guardar» en la cabecera, al cerrar la
   * pestaña y desde la barra lateral, y guardar escribía encima el encuadre
   * movido creyendo que era trabajo del traumatólogo.
   *
   * Solo si la referencia sigue siendo `antes`: si entretanto se guardó o se
   * abrió otra cosa, esa es la referencia buena y no se toca. Con la forma
   * funcional de `setReferencia` porque llega desde un efecto del visor, fuera
   * de este pintado, y la `referencia` del cierre podría ser de otro. Tampoco
   * toca `camaraMovida`: si el traumatólogo movió la cámara de verdad, `antes`
   * ya no casa y la marca sigue siendo cierta.
   */
  const asentarReferencia = useCallback((antes: VistaDeInstancia, despues: VistaDeInstancia) => {
    setReferencia((r) => (mismoEncuadre(r.vista, antes) ? { ...r, vista: despues } : r))
  }, [])

  /** Pregunta antes de tirar el trabajo. Devuelve si se puede continuar. */
  const confirmarDescarte = (queVaAPasar: string) =>
    (!sucio && !encuadreMovido()) ||
    confirm(
      `Hay cambios sin guardar en esta preparación.\n\n${queVaAPasar}\n\n` +
        '¿Continuar y perderlos?',
    )

  // Y el mismo aviso al cerrar la pestaña que usa el editor de fichas.
  //
  // El oyente se registra siempre y decide dentro, en vez de colgarse de
  // `sucio` o de `camaraMovida`: girar el modelo también es trabajo que se
  // pierde, y de la cámara no llega ningún pintado que lo cuente —`camaraMovida`
  // se enciende una vez y se queda quieta—, de modo que un efecto que mirara
  // esos valores al montarse se quedaba con un «no hay nada que perder» de otro
  // momento. Se refresca en su propio efecto y no durante el pintado porque
  // escribir en un ref mientras se pinta rompe con el pintado concurrente.
  //
  // El tipo del ref se escribe a mano y no se deja inferir: del valor inicial
  // `() => false` TypeScript saca `() => false` —el literal, que en posición de
  // retorno no ensancha a `boolean`—, y la asignación de abajo, que sí devuelve
  // un `boolean`, no compilaba. ESLint no lo ve —no es una regla de lint—, así
  // que lo único que lo canta es `npm run typecheck`, y tumba la construcción.
  const hayAlgoQuePerder = useRef<() => boolean>(() => false)
  useEffect(() => {
    hayAlgoQuePerder.current = () => sucio || encuadreMovido()
  })

  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (hayAlgoQuePerder.current()) e.preventDefault()
    }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [])

  // Y la misma pregunta para la barra lateral del panel, que es la salida que
  // más cerca queda mientras se trabaja. Sus enlaces son navegaciones de
  // cliente del App Router y no descargan la página, así que el oyente de
  // arriba no se entera: «Comentarios» o «Fichas» se llevaban media hora de
  // apagar piezas sin una palabra, mientras que cerrar la pestaña sí
  // preguntaba. El registro (`src/admin/salidaDelEditor.ts`) es lo que la barra
  // consulta sin saber qué pantallas existen.
  //
  // Montado una vez y con la función del ref, igual que `beforeunload` y por la
  // misma razón: el encuadre no pasa por un pintado, y apuntarse solo mientras
  // `sucio` dejaría fuera la media hora de buscar el ángulo. El registro hace
  // la pregunta en el instante del clic. La frase la pone el registro y habla
  // de «pantalla», no de «ficha»: aquí no hay ficha, hay una preparación.
  useEffect(() => apuntarCambiosSinGuardar(() => hayAlgoQuePerder.current()), [])

  // --- catálogo -------------------------------------------------------------
  useEffect(() => {
    const aborto = new AbortController()
    // Con `import()` y no con un import de arriba: `@/atlas/cargador` arrastra
    // los 725 KB de three y aquí solo se le pide un JSON de cuarenta líneas.
    // Estático, el motor viajaba en el trozo de entrada de la página y el
    // `dynamic()` del visor no adelgazaba nada —la pantalla seguía sin poder
    // pintar ni «Leyendo el catálogo…»—. Pedido así, three viaja en el mismo
    // trozo asíncrono que el visor, que es el único que lo necesita de verdad.
    //
    // Si el aborto llega antes de que el módulo esté, la señal ya viene
    // cancelada y `fetch` rechaza sin pedir nada: el `catch` de abajo lo
    // reconoce y no escribe en un componente desmontado.
    import('@/atlas/cargador')
      .then(({ cargarCatalogo }) => cargarCatalogo(aborto.signal))
      .then((c) => {
        const todas = new Set(c.piezas.map((p) => p.id))
        setCatalogo(c)
        setVisibles(todas)
        // El cuerpo entero y sin nombre es el punto de partida: todavía no hay
        // nada que perder. El encuadre de referencia es el mismo con el que se
        // monta el visor, así que la cámara nace igualada.
        fijarReferencia(todas, '', '', VISTA_INICIAL)
      })
      .catch((e: unknown) => {
        if (aborto.signal.aborted) return
        setFallo(e instanceof Error ? e.message : 'No se pudo leer el catálogo del atlas.')
      })
    return () => aborto.abort()
  }, [fijarReferencia])

  /**
   * Trae la lista de preparaciones guardadas.
   *
   * Los dos modos de fallo tienen salida a propósito. `listarInstancias`
   * devuelve `{ exito: false }` cuando la sesión ha caducado o cuando el
   * servidor no encuentra su copia del catálogo, y la promesa puede además
   * rechazarse por red. Antes los dos acababan igual: `guardadas` se quedaba
   * vacío y el panel afirmaba «Todavía no hay ninguna», que es indistinguible
   * de haberlas perdido todas y lo razonable desde esa silla es rehacerlas.
   */
  const refrescarLista = useCallback(() => {
    listarInstancias()
      .then((r) => {
        if (r.exito && r.datos) {
          setGuardadas(r.datos)
          setListaFallo(null)
          return
        }
        setListaFallo(r.mensaje ?? 'No se pudo leer la lista de preparaciones.')
      })
      .catch(() => setListaFallo('No se pudo leer la lista de preparaciones.'))
  }, [])

  useEffect(refrescarLista, [refrescarLista])

  // Los modelos se piden una vez: desde el taller no se crean ni se borran, y
  // «Exportar como modelo» refresca la lista por su cuenta. Si falla se queda en
  // lista vacía, sin aviso: es una comodidad del panel, no el trabajo en curso.
  const refrescarModelos = useCallback(() => {
    listarModelosDelAtlas()
      .then((r) => setModelos(r.exito && r.datos ? r.datos : []))
      .catch(() => setModelos([]))
  }, [])
  useEffect(refrescarModelos, [refrescarModelos])

  // --- acciones -------------------------------------------------------------
  /**
   * Vuelve al cuerpo completo.
   *
   * `preguntar` es false cuando llega desde otra acción que ya preguntó, como
   * eliminar la preparación abierta: encadenar dos confirmaciones seguidas por
   * el mismo gesto enseña a pulsar «aceptar» sin leer.
   */
  /**
   * Cambia las piezas encendidas dejando la anterior en el historial. Es la
   * puerta de todo cambio que haga la persona —árbol, teclado, barra—; abrir
   * una preparación o volver al cuerpo completo no pasan por aquí, vacían el
   * historial: deshacer hasta la preparación anterior mezclaría dos trabajos.
   */
  /** Deja en el historial lo que hay AHORA, antes de cambiarlo. */
  const apuntarPaso = () => {
    setHistorial((pasos) =>
      [...pasos, { visibles, transformaciones, cortes, aspectos }].slice(-MAXIMO_DE_DESHACER),
    )
    setRehacer([])
  }

  const cambiarVisibles = (nuevas: Set<string>) => {
    apuntarPaso()
    setVisibles(nuevas)
    // Lo que se apaga deja de estar seleccionado: una selección que no se ve
    // es una pieza que el siguiente Supr o «Solo esto» toca a ciegas.
    setSeleccion((actual) => {
      if (actual.size === 0) return actual
      const quedan = new Set([...actual].filter((id) => nuevas.has(piezaDe(id))))
      return quedan.size === actual.size ? actual : quedan
    })
  }

  const deshacer = () => {
    const anterior = historial.at(-1)
    if (!anterior) return
    setHistorial(historial.slice(0, -1))
    setRehacer([...rehacer, { visibles, transformaciones, cortes, aspectos }])
    setVisibles(anterior.visibles)
    setTransformaciones(anterior.transformaciones)
    setCortes(anterior.cortes)
    setAspectos(anterior.aspectos)
    // Un fragmento seleccionado puede dejar de existir al deshacer su corte.
    setSeleccion(new Set())
  }

  const rehacerPaso = () => {
    const siguiente = rehacer.at(-1)
    if (!siguiente) return
    setRehacer(rehacer.slice(0, -1))
    setHistorial([...historial, { visibles, transformaciones, cortes, aspectos }])
    setVisibles(siguiente.visibles)
    setTransformaciones(siguiente.transformaciones)
    setCortes(siguiente.cortes)
    setAspectos(siguiente.aspectos)
    setSeleccion(new Set())
  }

  /** Cambia el color o la opacidad de todo lo seleccionado. `undefined` en un campo lo deja como está. */
  const cambiarAspecto = (cambio: { color?: string | null; opacidad?: number }) => {
    if (seleccion.size === 0) return
    // Arrastrar el deslizador o el selector de color manda decenas de cambios
    // por segundo: con un paso de deshacer por cada uno, un solo gesto vaciaba
    // los cincuenta del historial. Los que llegan seguidos cuentan como uno.
    const ahora = Date.now()
    if (ahora - ultimoCambioDeAspecto.current > 1000) apuntarPaso()
    ultimoCambioDeAspecto.current = ahora
    const nuevos = new Map(aspectos)
    for (const id of new Set([...seleccion].map(piezaDe))) {
      const actual = { ...nuevos.get(id) }
      if (cambio.color === null) delete actual.color
      else if (cambio.color) actual.color = cambio.color
      if (cambio.opacidad !== undefined) {
        if (cambio.opacidad >= 1) delete actual.opacidad
        else actual.opacidad = cambio.opacidad
      }
      if (actual.color || actual.opacidad !== undefined) nuevos.set(id, actual)
      else nuevos.delete(id)
    }
    setAspectos(nuevos)
  }

  const alTransformar = (nuevas: Map<string, TransformacionDePieza>) => {
    apuntarPaso()
    setTransformaciones(nuevas)
  }

  /**
   * Alt + G y Alt + R: lo seleccionado vuelve a su posición, o a su
   * orientación, anatómica. Por separado, como en Blender: un fragmento bien
   * desplazado pero mal girado se arregla sin perder el desplazamiento.
   */
  const devolverASuSitio = (que: 'mover' | 'girar') => {
    const nuevas = new Map(transformaciones)
    let cambio = false
    for (const id of seleccion) {
      const t = nuevas.get(id)
      if (!t) continue
      cambio = true
      const resto: TransformacionDePieza =
        que === 'mover' ? { mover: [0, 0, 0], girar: t.girar } : { mover: t.mover, girar: [0, 0, 0, 1] }
      const quieta = resto.mover.every((n) => n === 0) && resto.girar[3] === 1
      if (quieta) nuevas.delete(id)
      else nuevas.set(id, resto)
    }
    if (cambio) alTransformar(nuevas)
  }

  const empezarGesto = (modo: 'mover' | 'girar') => {
    if (mando.current?.empezarTransformacion(modo)) return
    setAviso({ tipo: 'error', texto: 'Seleccione primero las piezas que quiere mover.' })
  }

  /** Mayús + G de Blender: todo lo encendido del mismo sistema que lo seleccionado. */
  const seleccionarDelMismoSistema = () => {
    if (!catalogo || seleccion.size === 0) return
    const elegidas = new Set([...seleccion].map(piezaDe))
    const sistemas = new Set(
      catalogo.piezas.filter((p) => elegidas.has(p.id)).map((p) => p.sistema),
    )
    setSeleccion(
      new Set(
        idsSeleccionables(
          catalogo.piezas.filter((p) => sistemas.has(p.sistema) && visibles.has(p.id)).map((p) => p.id),
        ),
      ),
    )
  }

  /** Los identificadores dados, cada uno con todo su grupo si lo tiene. */
  const conSuGrupo = (ids: readonly string[]): string[] => {
    if (grupos.length === 0) return [...ids]
    const salida = new Set<string>()
    for (const id of ids) {
      const grupo = grupos.find((g) => g.includes(id))
      // Solo lo encendido: un miembro apagado no se selecciona a ciegas.
      for (const miembro of grupo ?? [id]) if (visibles.has(piezaDe(miembro))) salida.add(miembro)
    }
    return [...salida]
  }

  const alSeleccionar = (ids: string[], modo: ModoDeSeleccion) => {
    const completos = conSuGrupo(ids)
    setSeleccion((actual) => {
      // Alternar un grupo es ponerlo o quitarlo entero según esté el que se
      // pulsó: miembro a miembro, un grupo a medias se quedaría a medias.
      if (modo === 'alternar' && ids.length === 1) {
        return seleccionTras(actual, completos, actual.has(ids[0]) ? 'quitar' : 'sumar')
      }
      return seleccionTras(actual, completos, modo)
    })
  }

  const agruparSeleccion = () => {
    if (seleccion.size < 2) return
    const miembros = [...seleccion]
    setGrupos([
      ...grupos
        .map((g) => g.filter((id) => !seleccion.has(id)))
        .filter((g) => g.length >= 2),
      miembros,
    ])
  }
  const desagruparSeleccion = () =>
    setGrupos(grupos.filter((g) => !g.some((id) => seleccion.has(id))))

  /**
   * Pasa la preparación entera al otro lado del cuerpo (D-136): cada pieza por
   * su contralateral, y lo movido, lo cortado, lo pintado y lo apuntado,
   * reflejado. Lo que no tiene pareja —la línea media, o lo poco del atlas que
   * no es simétrico— se queda donde está y se dice cuánto fue.
   *
   * No entra en deshacer: es su propia inversa, y pulsarlo otra vez vuelve.
   */
  const espejar = () => {
    if (!catalogo) return
    const parejas = parejasContralaterales(catalogo)
    const otra = (id: string) => {
      const fragmento = partesDeFragmento(id)
      if (!fragmento) return parejas.get(id) ?? id
      return idDeFragmento(parejas.get(fragmento.pieza) ?? fragmento.pieza, fragmento.lado)
    }
    const sinPareja = [...visibles].filter((id) => !parejas.has(id)).length
    const nuevasVisibles = new Set([...visibles].map(otra))
    setVisibles(nuevasVisibles)
    setTransformaciones(
      new Map(
        [...transformaciones].map(([id, t]) => [
          otra(id),
          { mover: reflejarVector(t.mover), girar: reflejarGiro(t.girar) },
        ]),
      ),
    )
    setCortes(
      cortes.map((c) => ({
        pieza: otra(c.pieza),
        punto: reflejarVector(c.punto),
        normal: reflejarVector(c.normal),
      })),
    )
    setAspectos(new Map([...aspectos].map(([id, a]) => [otra(id), a])))
    setGrupos(grupos.map((g) => g.map(otra)))
    setMarcas(
      marcas.map((m) =>
        m.tipo === 'rotulo'
          ? { ...m, punto: reflejarVector(m.punto) }
          : ({ ...m, puntos: m.puntos.map(reflejarVector) } as MarcaDeInstancia),
      ),
    )
    setVistas(
      vistas.map((v) => ({ ...v, camara: reflejarVector(v.camara), objetivo: reflejarVector(v.objetivo) })),
    )
    setSeleccion(new Set())
    setHistorial([])
    setRehacer([])
    const ahora = mando.current?.vistaActual()
    if (ahora) {
      mando.current?.irA(
        { ...ahora, camara: reflejarVector(ahora.camara), objetivo: reflejarVector(ahora.objetivo) },
        nuevasVisibles,
      )
    }
    setAviso({
      tipo: 'ok',
      texto:
        sinPareja === 0
          ? 'Preparación pasada al otro lado. Pulse «Espejo» otra vez para volver.'
          : `Preparación pasada al otro lado. ${sinPareja} pieza${sinPareja === 1 ? '' : 's'} sin pareja contralateral se quedaron donde estaban.`,
    })
  }

  const apagarSeleccion = () => {
    if (seleccion.size === 0) return
    // Apagar un fragmento apaga su hueso entero: lo encendido se lleva por
    // pieza, y medio hueso a la vista no es algo que una ficha necesite.
    const fuera = new Set([...seleccion].map(piezaDe))
    cambiarVisibles(new Set([...visibles].filter((id) => !fuera.has(id))))
  }
  const dejarSoloLaSeleccion = () => {
    if (seleccion.size === 0) return
    cambiarVisibles(new Set([...seleccion].map(piezaDe)))
  }

  /** Lo que se puede seleccionar de lo encendido: las piezas, y de las partidas, sus dos fragmentos. */
  const idsSeleccionables = (piezas: Iterable<string>): string[] => {
    const partidas = new Set(cortes.map((c) => c.pieza))
    return [...piezas].flatMap((id) =>
      partidas.has(id) ? [idDeFragmento(id, 'a'), idDeFragmento(id, 'b')] : [id],
    )
  }

  const alCortar = (corte: CorteDePieza) => {
    apuntarPaso()
    setCortes([...cortes.filter((c) => c.pieza !== corte.pieza), corte])
    // En su grupo, el hueso entero deja sitio a sus dos fragmentos.
    setGrupos(
      grupos.map((g) =>
        g.flatMap((id) =>
          id === corte.pieza ? [idDeFragmento(id, 'a'), idDeFragmento(id, 'b')] : [id],
        ),
      ),
    )
    // La pieza entera deja de existir como tal: quedan seleccionados sus dos
    // fragmentos, y la herramienta vuelve a girar para poder mirarlos.
    setSeleccion(new Set([idDeFragmento(corte.pieza, 'a'), idDeFragmento(corte.pieza, 'b')]))
    setHerramienta('orbita')
    // Sin aviso de «hecho»: los avisos van encima del lienzo y lo empujan hacia
    // abajo, y el gesto siguiente es justo un clic sobre el fragmento, que ya
    // no estaría donde se apuntaba. Que se partió se ve: los dos trozos quedan
    // en naranja y la barra dice «2 piezas seleccionadas».
    setAviso(null)
  }

  /** Deshace el corte de los fragmentos seleccionados: el hueso vuelve entero y a su sitio. */
  const soldarSeleccion = () => {
    const piezas = new Set(
      [...seleccion].filter((id) => partesDeFragmento(id) !== null).map(piezaDe),
    )
    if (piezas.size === 0) return
    apuntarPaso()
    setCortes(cortes.filter((c) => !piezas.has(c.pieza)))
    // Y al revés: los dos fragmentos dejan sitio al hueso, una sola vez.
    setGrupos(
      grupos
        .map((g) => [...new Set(g.map((id) => (piezas.has(piezaDe(id)) ? piezaDe(id) : id)))])
        .filter((g) => g.length >= 2),
    )
    const sinSusFragmentos = new Map(transformaciones)
    for (const pieza of piezas) {
      sinSusFragmentos.delete(idDeFragmento(pieza, 'a'))
      sinSusFragmentos.delete(idDeFragmento(pieza, 'b'))
    }
    setTransformaciones(sinSusFragmentos)
    setSeleccion(new Set(piezas))
  }
  const encenderTodo = () => {
    if (!catalogo) return
    cambiarVisibles(new Set(catalogo.piezas.map((p) => p.id)))
  }
  const encuadrarLoElegido = () => {
    if (seleccion.size > 0) mando.current?.encuadrarPiezas(seleccion)
    else mando.current?.encuadrar()
    revisarEncuadre()
  }
  const mirarDesde = (lado: LadoDeLaVista) => {
    mando.current?.mirarDesde(lado)
    revisarEncuadre()
  }

  const empezarDeCero = (preguntar = true) => {
    if (!catalogo) return
    if (preguntar && !confirmarDescarte('Se volverá al cuerpo completo, sin nombre.')) return
    const todas = new Set(catalogo.piezas.map((p) => p.id))
    setHistorial([])
    setRehacer([])
    setTransformaciones(new Map())
    setCortes([])
    setAspectos(new Map())
    setMarcas([])
    setVistas([])
    setGrupos([])
    setSeleccion(new Set())
    setInstancia(null)
    setModeloAbierto(null)
    setNombre('')
    setDescripcion('')
    setVisibles(todas)
    setSeparacion(0)
    setVistaInicial(VISTA_INICIAL)
    // El MISMO conjunto que se le da a React, y no otro igual: el visor anota
    // con qué selección decidió el pivote y la compara por identidad cuando le
    // llega la prop. Con un `Set` distinto creería que es un cambio nuevo y
    // volvería a recolocar lo que `irA` acaba de colocar. Y la referencia es lo
    // que devuelve `irA`, no lo pedido, por si el visor tuvo que mover el
    // pivote: comparar con lo pedido daría la cámara por movida sin que nadie
    // la hubiera tocado.
    const vista = mando.current?.irA(VISTA_INICIAL, todas) ?? VISTA_INICIAL
    fijarReferencia(todas, '', '', vista)
    limpiarExportacion()
    setAviso(null)
  }

  /**
   * Abre un modelo 3D del catálogo como preparación nueva (D-131).
   *
   * No carga su `.glb`: enciende las piezas del atlas de las que salió, que el
   * archivo trae apuntadas, de modo que sirven todas las herramientas del
   * taller —seleccionar, mover, cortar— y lo que salga se guarda como una
   * preparación cualquiera. El modelo no se toca.
   */
  const abrirModelo = (modelo: ModeloParaElTaller) => {
    if (modelo.piezas.length === 0) return
    if (!confirmarDescarte(`Se abrirá «${modelo.nombre}» en su lugar.`)) return
    const piezas = new Set(modelo.piezas)
    setInstancia(null)
    setModeloAbierto(modelo.id)
    setNombre(modelo.nombre)
    setDescripcion('')
    setHistorial([])
    setRehacer([])
    setTransformaciones(new Map())
    setCortes([])
    setAspectos(new Map())
    setMarcas([])
    setVistas([])
    setGrupos([])
    setSeleccion(new Set())
    setVisibles(piezas)
    setSeparacion(0)
    limpiarExportacion()
    setAviso(null)
    // Encuadrar sobre las piezas que VAN a estar encendidas: la prop todavía
    // trae las de antes, y «Encuadrar» a secas mediría el cuerpo anterior.
    mando.current?.encuadrarPiezas(piezas)
    const vista = mando.current?.vistaActual() ?? VISTA_INICIAL
    // El nombre entra en la referencia: abrir un modelo no es todavía un
    // cambio, y sin esto saltaba «cambios sin guardar» —y su cartel, que empuja
    // el lienzo— antes de haber tocado nada.
    fijarReferencia(piezas, modelo.nombre, '', vista)
  }

  const abrir = (id: string) => {
    if (!confirmarDescarte('Se abrirá otra preparación en su lugar.')) return
    setAviso(null)
    iniciar(async () => {
      try {
        const r = await obtenerInstancia(id)
        if (!r.exito || !r.datos) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo abrir la preparación.' })
          return
        }
        const piezasAbiertas = new Set(r.datos.contenido.piezas.map((p) => p.id))
        const cortesAbiertos = (r.datos.contenido.cortes ?? []).map(
          ({ pieza, punto, normal }): CorteDePieza => ({ pieza, punto, normal }),
        )
        // Lo movido de cada fragmento viaja dentro de su corte; aquí se junta
        // con lo de las piezas enteras, cada uno bajo su identificador.
        const movidasAbiertas = transformacionesDe([
          ...r.datos.contenido.piezas,
          ...(r.datos.contenido.cortes ?? []).flatMap((c) => [
            { id: idDeFragmento(c.pieza, 'a'), ...c.a },
            { id: idDeFragmento(c.pieza, 'b'), ...c.b },
          ]),
        ])
        setTransformaciones(movidasAbiertas)
        setCortes(cortesAbiertos)
        const aspectosAbiertos = new Map(
          r.datos.contenido.piezas
            .filter((pieza) => pieza.color || pieza.opacidad !== undefined)
            .map((pieza) => [pieza.id, { color: pieza.color, opacidad: pieza.opacidad }] as const),
        )
        setAspectos(aspectosAbiertos)
        const marcasAbiertas = r.datos.contenido.marcas ?? []
        const vistasAbiertas = r.datos.contenido.vistas ?? []
        const gruposAbiertos = r.datos.contenido.grupos ?? []
        setMarcas(marcasAbiertas)
        setVistas(vistasAbiertas)
        setGrupos(gruposAbiertos)
        setHistorial([])
        setRehacer([])
        setSeleccion(new Set())
        setInstancia(r.datos.id)
        setModeloAbierto(null)
        setNombre(r.datos.nombre)
        setDescripcion(r.datos.descripcion ?? '')
        setVisibles(piezasAbiertas)
        setSeparacion(r.datos.contenido.vista.separacion)
        setVistaInicial(r.datos.contenido.vista)
        limpiarExportacion()
        // Y además se le ordena al visor que vaya: la escena ya está montada y
        // no se vuelve a montar, así que sin esto la cámara se quedaba donde
        // estuviera. Como al guardar se escribe la cámara actual, abrir una
        // preparación y volver a guardarla borraba su encuadre sin avisar.
        //
        // Va antes de fijar la referencia porque la referencia es lo que
        // devuelve. Una preparación guardada antes de que el pivote siguiera a
        // lo visible trae el objetivo del cuerpo entero —el de omisión, o el
        // que dejó «Encuadrar» antes de apagar el resto—, y el visor lo
        // recoloca sobre sus piezas al abrirla cuando ese objetivo cae fuera de
        // lo que se ve (ver `recolocarVistaGuardada`); uno dentro, como el foco
        // de fractura llevado a mano, se respeta. Es lo mismo que hace la ficha
        // al montarla, así que lo que se ve aquí es lo que ve el residente. Con
        // lo pedido como referencia, abrir una de esas y pulsar «Cuerpo
        // completo» preguntaría por cambios sin guardar que nadie ha hecho.
        // Si se abre mientras bajan los paquetes y con el cuerpo separado, lo
        // devuelto es todavía lo pedido y la decisión llega al cargar, por
        // `asentarReferencia`.
        //
        // `piezasAbiertas` es el mismo objeto que recibe `setVisibles`: ver por
        // qué en `empezarDeCero`.
        const vistaAbierta =
          mando.current?.irA(r.datos.contenido.vista, piezasAbiertas) ?? r.datos.contenido.vista
        fijarReferencia(
          piezasAbiertas,
          r.datos.nombre,
          r.datos.descripcion ?? '',
          vistaAbierta,
          movidasAbiertas,
          cortesAbiertos,
          aspectosAbiertos,
          [marcasAbiertas, vistasAbiertas, gruposAbiertos],
        )
        if (r.datos.perdidas.length > 0) {
          setAviso({
            tipo: 'error',
            texto:
              `Esta preparación se hizo con otra versión del atlas y ${r.datos.perdidas.length} ` +
              'de sus piezas ya no existen. Revísela antes de volver a guardarla.',
          })
        }
      } catch {
        // El descarte ya se confirmó, pero nada se ha tocado todavía: lo que
        // había en pantalla sigue entero y se puede reintentar.
        setAviso({ tipo: 'error', texto: FALLO_DE_TRANSPORTE })
      }
    })
  }

  const guardar = () => {
    if (!nombre.trim()) {
      setAviso({ tipo: 'error', texto: 'Póngale un nombre a la preparación.' })
      return
    }
    if (visibles.size === 0) {
      setAviso({ tipo: 'error', texto: 'No queda ninguna pieza encendida.' })
      return
    }
    setAviso(null)
    setTrabajo('guardar')

    iniciar(async () => {
      // La misma vista se manda y se congela como referencia. Leerla dos veces
      // devolvía dos encuadres distintos si el traumatólogo seguía girando
      // mientras se guardaba, y entonces lo recién guardado nacía «sucio».
      //
      // Lleva el pivote sobre lo visible sin hacer nada más aquí: el visor lo
      // va moviendo al apagar piezas y `vistaActual()` devuelve dónde va a
      // quedar aunque todavía esté esperando o a medio deslizarse. No hace
      // falta asentarlo antes de guardar: la espera pendiente, cuando se
      // cumple, lo deja exactamente en lo que se ha guardado, porque lo que
      // devuelve `vistaActual()` y lo que hace la espera salen de la misma
      // cuenta (`saltoDelPivote` en el visor). Así la preparación de una pierna
      // gira sobre la pierna también al abrirla en la ficha. Lo que NO se hace
      // es forzarlo al centro al guardar: si el traumatólogo llevó el objetivo
      // a mano sobre el foco de fractura después de su último cambio, esa es la
      // vista que quiere guardar.
      const vista = mando.current?.vistaActual() ?? { ...VISTA_INICIAL, separacion }
      try {
        const r = await guardarInstancia(instancia, {
          nombre,
          descripcion,
          // Cada pieza con lo que se haya movido, si se movió (D-129). Lo de
          // una pieza apagada no viaja: no está en la preparación.
          piezas: [...visibles].map((id) => ({
            id,
            ...transformaciones.get(id),
            ...aspectos.get(id),
          })),
          // Cada corte con lo que se movió cada uno de sus dos fragmentos.
          cortes: cortes
            .filter((c) => visibles.has(c.pieza))
            .map((c) => ({
              ...c,
              a: transformaciones.get(idDeFragmento(c.pieza, 'a')),
              b: transformaciones.get(idDeFragmento(c.pieza, 'b')),
            })),
          marcas,
          vistas,
          grupos,
          vista,
        })
        if (!r.exito || !r.datos) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo guardar.' })
          return
        }
        setInstancia(r.datos.id)
        // Lo recién guardado pasa a ser la referencia: ya no hay nada que
        // perder.
        fijarReferencia(visibles, nombre, descripcion, vista, transformaciones, cortes, aspectos, [
          marcas,
          vistas,
          grupos,
        ])
        setAviso({
          tipo: 'ok',
          texto: `Guardada con ${r.datos.piezas} pieza${r.datos.piezas === 1 ? '' : 's'}. Ya se puede insertar en una ficha.`,
        })
        refrescarLista()
      } catch {
        // Es el peor sitio donde callar: sin aviso, el botón vuelve a decir
        // «Guardar preparación», la insignia de cambios sin guardar sigue
        // puesta y las dos cosas juntas se leen como que ya está hecho. La
        // referencia no se toca, así que el aviso de cerrar la pestaña sigue en
        // pie y lo de pantalla se puede volver a guardar tal cual.
        setAviso({ tipo: 'error', texto: FALLO_DE_TRANSPORTE })
      }
    })
  }

  /**
   * Escribe la preparación como un modelo 3D de la biblioteca.
   *
   * Exige tenerla guardada y sin cambios sueltos porque el servidor exporta lo
   * que hay en la base, no lo que se ve en pantalla: exportar con la pantalla
   * por delante entregaría un archivo que no se parece a lo que el
   * traumatólogo está mirando, y nada lo avisaría.
   */
  const exportar = () => {
    if (!instancia) {
      setAviso({
        tipo: 'error',
        texto: 'Guarde la preparación antes de exportarla: se exporta lo guardado.',
      })
      return
    }
    if (sucio) {
      setAviso({
        tipo: 'error',
        texto:
          'Hay cambios sin guardar. Guárdelos primero: se exporta lo que hay en la base, no lo que se ve.',
      })
      return
    }
    setAviso(null)
    setExportado(null)
    setTrabajo('exportar')

    iniciar(async () => {
      try {
        const r = await exportarComoModelo(instancia, {
          protagonistas: protagonistasVivas,
          corte: corteVivo,
        })
        if (!r.exito || !r.datos) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo exportar.' })
          return
        }
        setExportado(r.datos)
        // El modelo recién exportado también es del atlas: que aparezca en la lista.
        refrescarModelos()
        setAviso({
          tipo: 'ok',
          texto: `«${r.datos.nombre}» ya está en la biblioteca de modelos 3D.`,
        })
      } catch {
        // Aquí el rechazo es lo normal cuando algo va mal: son decenas de
        // megabytes escribiéndose en el servidor y la espera es larga. Sin
        // aviso, el botón volvía a decir «Crear el modelo» y el recuadro de
        // nombres se quedaba vacío, que es indistinguible de no haber pulsado.
        setAviso({ tipo: 'error', texto: FALLO_DE_TRANSPORTE })
      }
    })
  }

  /**
   * Las piezas encendidas, para elegir cuáles salen sueltas.
   *
   * Se enseñan las cien primeras y se dice cuántas quedan fuera: con el cuerpo
   * completo encendido son las 2.234 del atlas y pintarlas todas convierte el
   * panel en una lista imposible de recorrer. Callar el recorte sería peor:
   * parecería que la pieza que se busca no está encendida.
   *
   * La búsqueda pasa por `casaConLaBusqueda` (`src/atlas/nombres.ts`), que casa
   * en español y en el original, sin tildes y sin mayúsculas. El `includes`
   * sobre el nombre original que había antes no basta ahora que la lista
   * enseña «Peroné derecho»: escribir «perone» buscaría en «Right fibula» y no
   * lo encontraría, y el panel parecería decir que la pieza no está encendida.
   * No se escribe aquí otra comparación: una función para todos los buscadores
   * del atlas es lo que impide que uno encuentre lo que otro no.
   */
  const candidatas = useMemo<{ lista: PiezaDelAtlas[]; total: number }>(() => {
    if (!catalogo) return { lista: [], total: 0 }
    const encendidas = catalogo.piezas
      .filter((p) => visibles.has(p.id))
      .filter((p) => casaConLaBusqueda(p.nombre, filtroProtagonista))
    return { lista: encendidas.slice(0, 100), total: encendidas.length }
  }, [catalogo, visibles, filtroProtagonista])

  const conAviso = (
    tarea: () => Promise<{ exito: boolean; mensaje?: string }>,
    exitoso: string,
    alLograrlo?: () => void,
  ) => {
    setAviso(null)
    setTrabajo(null)
    iniciar(async () => {
      try {
        const r = await tarea()
        if (r.exito) {
          // Antes del aviso y no después: `empezarDeCero` termina limpiando
          // `aviso`, y puesto detrás se llevaba por delante el «Preparación
          // eliminada.» que acababa de escribirse.
          alLograrlo?.()
          setAviso({ tipo: 'ok', texto: exitoso })
          refrescarLista()
        } else {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar.' })
        }
      } catch {
        // Duplicar y eliminar pasan por aquí. El silencio es especialmente malo
        // en el segundo: quien acaba de confirmar «¿Eliminar «Tibia derecha»?»
        // y no ve nada supone que se borró, y lo que hay es una preparación
        // viva que sigue en la lista hasta el siguiente refresco. `alLograrlo`
        // no se llama: el taller no se vacía por un fallo de red.
        setAviso({ tipo: 'error', texto: FALLO_DE_TRANSPORTE })
      }
    })
  }

  // Lo seleccionado, por pieza del catálogo, para el árbol: de un hueso partido
  // el árbol solo conoce el hueso. Y la selección desde el árbol, estable entre
  // pintados porque es prop de filas memorizadas.
  const piezasSeleccionadas = useMemo(() => new Set([...seleccion].map(piezaDe)), [seleccion])
  const partidas = useMemo(() => new Set(cortes.map((c) => c.pieza)), [cortes])
  const seleccionarDesdeElArbol = useCallback(
    (id: string, sumar: boolean) => {
      const propios = partidas.has(id) ? [idDeFragmento(id, 'a'), idDeFragmento(id, 'b')] : [id]
      // Con su grupo, igual que al pulsar en el lienzo (`conSuGrupo`).
      const ids = new Set(propios)
      for (const propio of propios) {
        for (const miembro of grupos.find((g) => g.includes(propio)) ?? []) {
          if (visibles.has(piezaDe(miembro))) ids.add(miembro)
        }
      }
      setSeleccion((actual) =>
        seleccionTras(
          actual,
          [...ids],
          !sumar ? 'reemplazar' : propios.every((propio) => actual.has(propio)) ? 'quitar' : 'sumar',
        ),
      )
    },
    [partidas, grupos, visibles],
  )

  const unicaSeleccionada = seleccion.size === 1 ? [...seleccion][0] : null
  // Lo que enseñan los mandos de aspecto: lo de la primera pieza seleccionada.
  const primeraSeleccionada = seleccion.size > 0 ? piezaDe([...seleccion][0]) : null
  const aspectoDeLaSeleccion: AspectoDePieza =
    (primeraSeleccionada ? aspectos.get(primeraSeleccionada) : undefined) ?? {}

  const nombreDeLaSeleccionada = useMemo(() => {
    if (!catalogo || seleccion.size !== 1) return ''
    const [id] = seleccion
    const pieza = catalogo.piezas.find((p) => p.id === piezaDe(id))
    if (!pieza) return ''
    return partesDeFragmento(id)
      ? `${nombreEnEspanol(pieza.nombre)} · fragmento`
      : nombreEnEspanol(pieza.nombre)
  }, [catalogo, seleccion])

  // Los atajos escuchan en la ventana, una sola vez, y leen de un ref lo que
  // hay que hacer: es el mismo arreglo que `hayAlgoQuePerder`, y por lo mismo.
  // Una escucha que capturase las funciones de su pintado apagaría la selección
  // de hace tres clics.
  const alPulsarTecla = useRef<(evento: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    alPulsarTecla.current = (evento) => {
      // Escribiendo el nombre de la preparación, una «h» es una hache.
      const donde = evento.target as HTMLElement | null
      if (donde?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!catalogo) return

      const tecla = evento.key.toLowerCase()
      const control = evento.ctrlKey || evento.metaKey

      // A mitad de un movimiento o un giro, el teclado es del gesto: la X ata
      // al eje X en vez de apagar lo que se está moviendo.
      if (!control && !evento.altKey && mando.current?.teclaDeTransformacion(tecla)) {
        evento.preventDefault()
        return
      }

      let atendida = true

      if (control && tecla === 'g' && evento.shiftKey) desagruparSeleccion()
      else if (control && tecla === 'g') agruparSeleccion()
      else if (control && tecla === 'z' && evento.shiftKey) rehacerPaso()
      else if (control && tecla === 'z') deshacer()
      else if (control && tecla === 'i') {
        setSeleccion(new Set(idsSeleccionables(visibles).filter((id) => !seleccion.has(id))))
      } else if (control && ['1', '3', '7'].includes(tecla)) {
        mirarDesde(tecla === '1' ? 'atras' : tecla === '3' ? 'izquierda' : 'abajo')
      } else if (control) atendida = false
      else if (evento.altKey && tecla === 'h') encenderTodo()
      else if (evento.altKey && tecla === 'z') setRayosX((encendidos) => !encendidos)
      else if (evento.altKey && tecla === 'g') devolverASuSitio('mover')
      else if (evento.altKey && tecla === 'r') devolverASuSitio('girar')
      else if (evento.altKey && tecla === 'a') setSeleccion(new Set())
      else if (evento.altKey) atendida = false
      else if (tecla === 'h' && evento.shiftKey) dejarSoloLaSeleccion()
      else if (tecla === 'g' && evento.shiftKey) seleccionarDelMismoSistema()
      else if (tecla === 'g') empezarGesto('mover')
      else if (tecla === 'r') empezarGesto('girar')
      else if (tecla === 'h' || tecla === 'x' || tecla === 'delete') apagarSeleccion()
      else if (tecla === 'a') setSeleccion(new Set(idsSeleccionables(visibles)))
      else if (tecla === 'b') setHerramienta((actual) => (actual === 'caja' ? 'orbita' : 'caja'))
      else if (tecla === 'm') setHerramienta((actual) => (actual === 'distancia' ? 'orbita' : 'distancia'))
      else if (tecla === 'k') setHerramienta((actual) => (actual === 'corte' ? 'orbita' : 'corte'))
      else if (tecla === 'escape') {
        // Primero suelta la herramienta y solo después la selección: un Esc de
        // más no debe llevarse un marco que costó encuadrar.
        if (herramienta !== 'orbita') setHerramienta('orbita')
        else setSeleccion(new Set())
      } else if (tecla === '1') mirarDesde('frente')
      else if (tecla === '3') mirarDesde('derecha')
      else if (tecla === '7') mirarDesde('arriba')
      else if (tecla === '5') setOrtografica((puesta) => !puesta)
      else if (tecla === '.' || evento.code === 'NumpadDecimal') encuadrarLoElegido()
      else if (tecla === 'home') {
        mando.current?.encuadrar()
        revisarEncuadre()
      } else atendida = false

      // Solo lo atendido: Ctrl + I abre la información de la página en algunos
      // navegadores y Alt + H un menú; lo demás sigue siendo del navegador.
      if (atendida) evento.preventDefault()
    }
  })
  useEffect(() => {
    const escuchar = (evento: KeyboardEvent) => alPulsarTecla.current(evento)
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
  }, [])

  const resumen = useMemo(() => {
    if (!catalogo) return null
    const porRegion = new Map<string, number>()
    for (const pieza of catalogo.piezas) {
      if (!visibles.has(pieza.id)) continue
      porRegion.set(pieza.region, (porRegion.get(pieza.region) ?? 0) + 1)
    }
    const nombres = new Map(catalogo.regiones.map((r) => [r.id, r.nombre]))
    return [...porRegion.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => `${nombres.get(id) ?? id} (${n})`)
      .join(' · ')
  }, [catalogo, visibles])

  // --- pintado --------------------------------------------------------------
  //
  // El titular no acusa al despliegue, porque en `fallo` cae cualquier error de
  // la petición: un wifi que parpadea deja ahí un «Failed to fetch» —en inglés,
  // y encima— bajo un titular que afirmaba otra cosa, y el traumatólogo avisaba
  // de que el servidor había perdido el atlas cuando bastaba con recargar.
  //
  // Y se le habla a quien está delante. Esta página pasa por `exigirPanel()`,
  // que es nivel editor: quien prepara el contenido no tiene consola en el
  // servidor ni puede desplegar nada, así que la instrucción de ejecutar
  // `scripts/atlas/preparar.mjs` no es suya sino de la página de Sistema, que
  // sí exige administrador.
  if (fallo) {
    return (
      <div className="admin-aviso admin-aviso-error">
        <strong>No se pudo abrir el atlas anatómico.</strong> {fallo}
        <br />
        Recargue la página. Si vuelve a fallar, avise a quien administra la plataforma: puede que
        el atlas no esté instalado en este servidor.
      </div>
    )
  }

  if (!catalogo) return <p className="admin-subtitle">Leyendo el catálogo del atlas…</p>

  return (
    <>
      {/* En pantalla estrecha se enseña esto en lugar del taller. Es CSS y no
          JavaScript a propósito: medir el ancho al pintar da un primer fotograma
          equivocado y, en el servidor, no hay ancho que medir. */}
      <section className="atlas-solo-escritorio">
        <h2>El taller anatómico necesita un computador</h2>
        <p>
          Aquí se trabaja con tres cosas a la vez: el árbol de {catalogo.piezas.length} piezas, el
          modelo en tres dimensiones y la ficha de la preparación. En un teléfono no caben, y el
          visor queda tan pequeño que no se distingue una pieza de otra.
        </p>
        <p>
          Abra esta página desde un computador. Las preparaciones que ya haya guardado sí se ven
          bien en el móvil dentro de sus fichas.
        </p>
      </section>

      <div className="atlas-taller">
      <div className="admin-toolbar">
        <div>
          <h1 className="admin-title">Taller anatómico</h1>
          <p className="admin-subtitle">
            {catalogo.piezas.length} piezas · {catalogo.sujeto}
            {instancia ? ' · editando una preparación guardada' : ' · preparación nueva'}
            {hayQueAvisar ? <span className="editor-sucio"> · cambios sin guardar</span> : null}
          </p>
        </div>
        <div className="admin-acciones">
          <button className="admin-btn admin-btn-secondary" onClick={() => empezarDeCero()}>
            Cuerpo completo
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            // Encuadrar también mueve la cámara, y el gesto no pasa por el
            // lienzo: sin este aviso, recolocar la vista y cerrar la pestaña se
            // llevaba el encuadre sin que la pantalla hubiera dicho nada.
            onClick={() => {
              mando.current?.encuadrar()
              revisarEncuadre()
            }}
          >
            Encuadrar
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            aria-expanded={panelExportar}
            aria-controls="atlas-panel-exportar"
            onClick={() => setPanelExportar((abierto) => !abierto)}
          >
            {panelExportar ? 'Cerrar exportación' : 'Exportar como modelo'}
          </button>
          <button className="admin-btn admin-btn-primary" disabled={enCurso} onClick={guardar}>
            {enCurso && trabajo === 'guardar'
              ? 'Guardando…'
              : instancia
                ? 'Guardar cambios'
                : 'Guardar preparación'}
          </button>
        </div>
      </div>

      {panelExportar ? (
        <div className="admin-aviso admin-aviso-info" id="atlas-panel-exportar">
          <strong>Exportar esta preparación como modelo 3D</strong>
          <p>
            Se escribe un archivo .glb en la biblioteca de modelos, igual que si lo hubiera subido
            desde Blender, y desde ahí se elige en cualquier caso del simulador. El atlas no se
            toca: esto no quita ni mueve nada de aquí.
          </p>
          <p>
            Marque las piezas que tengan que salir <strong>sueltas</strong>: la que se va a
            fracturar y el fragmento que hay que reducir. Todo lo demás sale fundido en un objeto
            por sistema, que es lo que hace que el archivo pese poco. Sin ninguna marcada no habrá
            nada que mover en la consola.
          </p>
          <p>
            Si la que se fractura es un hueso, puede <strong>partirla con un corte</strong> aquí
            mismo, sin pasar por Blender: sale en dos trozos cerrados, y el que elija es el
            fragmento que el residente reduce. El plano se ve en el modelo mientras mueve los
            mandos.
          </p>

          <input
            className="atlas-busqueda"
            type="search"
            value={filtroProtagonista}
            placeholder="Buscar entre las piezas encendidas…"
            aria-label="Buscar entre las piezas encendidas"
            onChange={(e) => setFiltroProtagonista(e.target.value)}
          />

          <div className="atlas-lista" style={{ maxHeight: 220, marginTop: 8 }}>
            {candidatas.lista.map((pieza) => (
              <div key={pieza.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="atlas-casilla">
                  <input
                    type="checkbox"
                    checked={protagonistas.has(pieza.id)}
                    onChange={(e) => {
                      const marcada = e.target.checked
                      setProtagonistas((antes) => {
                        const ahora = new Set(antes)
                        if (marcada) ahora.add(pieza.id)
                        else ahora.delete(pieza.id)
                        return ahora
                      })
                      // Desmarcarla quita también su corte: una pieza fundida
                      // con su sistema no se puede partir, y la marca quedaría
                      // escondida esperando a que se vuelva a marcar.
                      if (!marcada) setCorte((c) => (c?.pieza === pieza.id ? null : c))
                    }}
                  />
                  {/* El original, al pasar el ratón: es lo que se busca en la
                      bibliografía y en la Foundational Model of Anatomy, y quien
                      quiera comprobar la pieza tiene que poder encontrarla (ver
                      `src/atlas/nombres.ts`). Solo cuando hay traducción, porque
                      sin ella repetiría lo que ya se lee. */}
                  <span title={tieneTraduccion(pieza.nombre) ? pieza.nombre : undefined}>
                    {nombreEnEspanol(pieza.nombre)}
                  </span>
                </label>
                {/* Solo para una protagonista que sea hueso: el servidor se niega
                    a partir otra cosa, y ofrecerlo sería prometer un botón que
                    siempre falla. Se pregunta con `rolDeSistema`, que es lo que
                    decide el rol dentro del archivo, y no con el sistema a mano:
                    el peroneo corto viene del esqueleto y es un músculo. */}
                {protagonistas.has(pieza.id) && rolDeSistema(pieza.sistema) === 'hueso' ? (
                  <label className="atlas-casilla" style={{ flex: 'none' }}>
                    <input
                      type="checkbox"
                      checked={corte?.pieza === pieza.id}
                      onChange={(e) =>
                        setCorte(
                          e.target.checked
                            ? { ...CORTE_POR_OMISION, ...(corte ?? {}), pieza: pieza.id }
                            : null,
                        )
                      }
                    />
                    <span>Partir con un corte</span>
                  </label>
                ) : null}
              </div>
            ))}
            {candidatas.total === 0 ? (
              <p className="atlas-conteo">Ninguna pieza encendida coincide con esa búsqueda.</p>
            ) : null}
            {candidatas.total > candidatas.lista.length ? (
              <p className="atlas-conteo">
                Se enseñan {candidatas.lista.length} de {candidatas.total}. Escriba en el buscador
                para encontrar el resto.
              </p>
            ) : null}
          </div>

          {corteVivo ? (
            <MandosDelCorte
              corte={corteVivo}
              nombre={nombreEnEspanol(
                catalogo.piezas.find((p) => p.id === corteVivo.pieza)?.nombre ?? corteVivo.pieza,
              )}
              alCambiar={setCorte}
            />
          ) : null}

          <div className="admin-acciones" style={{ marginTop: 10 }}>
            <button className="admin-btn admin-btn-primary" disabled={enCurso} onClick={exportar}>
              {enCurso && trabajo === 'exportar' ? 'Exportando…' : 'Crear el modelo'}
            </button>
            <span className="atlas-conteo">
              {protagonistasVivas.length === 0
                ? 'Ninguna pieza suelta'
                : `${protagonistasVivas.length} pieza${
                    protagonistasVivas.length === 1 ? '' : 's'
                  } suelta${protagonistasVivas.length === 1 ? '' : 's'}`}
              {' · '}
              {visibles.size} encendida{visibles.size === 1 ? '' : 's'}
            </span>
          </div>

          {exportado ? (
            <div className="admin-aviso admin-aviso-ok" style={{ marginTop: 10 }}>
              <strong>
                {exportado.nombre} · {(exportado.bytes / 1024 / 1024).toFixed(2)} MB
              </strong>
              <p>
                Estos son los nombres que el caso tiene que escribir en sus piezas. Son los que la
                consola ve dentro del archivo, no los del atlas: three.js cambia los espacios por
                guiones bajos al cargar, y escribir el otro deja una pieza que no se enciende nunca
                y ningún error que lo explique.
              </p>
              {/* Con `piezas`, cada nodo con su nombre y su capa: así se ve de
                  un vistazo que la tibia entra como hueso y los músculos como
                  músculo, que es lo que decide qué se apaga en la consola con
                  cada capa. Sin verlo aquí, un peroneo metido en el hueso solo
                  se notaría dentro del simulador, con la capa de músculo
                  apagada y el peroneo todavía encendido. Sin `piezas` —la
                  acción de antes— quedan los nodos solos, como siempre.

                  El nombre de la capa es el del formulario del caso, leído de
                  su esquema (`src/admin/etiquetaDeRol.ts`) y no de una tabla
                  propia: aquí se le dice al traumatólogo en qué capa entra cada
                  pieza para que la busque después en ese formulario, y dos
                  tablas escritas a mano ya han llegado a llamarla distinto. El
                  `?? p.rol` es el respaldo de un papel sin opción en el esquema
                  o que llegue del servidor sin que este panel lo conozca: en
                  crudo se lee, un hueco no. */}
              {exportado.piezas?.length ? (
                <ul>
                  {exportado.piezas.map((p) => (
                    <li key={p.nodo}>
                      <code>{p.nodo}</code>
                      {p.etiqueta ? ` · ${p.etiqueta}` : null} ·{' '}
                      <strong>{ETIQUETA_DE_ROL[p.rol] ?? p.rol}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  {exportado.nodos.map((n) => (
                    <li key={n}>
                      <code>{n}</code>
                    </li>
                  ))}
                </ul>
              )}
              {/* El corte, con sus dos nodos. Los dos trozos se ven pegados al
                  abrir el archivo, como un hueso entero, y sin esta línea no se
                  sabría que está partido ni cuál de los dos va a moverse. */}
              {exportado.corte ? (
                <p>
                  <strong>{exportado.corte.etiqueta}</strong> sale partida en dos:{' '}
                  <code>{exportado.corte.proximal}</code> y <code>{exportado.corte.distal}</code>. El
                  que se mueve en la reducción es <code>{exportado.corte.fragmento}</code>, y ya va
                  marcado como fragmento dentro del archivo.
                  {exportado.corte.avisos.map((aviso) => (
                    <span key={aviso}>
                      <br />
                      <strong>Atención:</strong> {aviso}
                    </span>
                  ))}
                </p>
              ) : null}
              {exportado.perdidas.length ? (
                <p>
                  <strong>Atención:</strong> {exportado.perdidas.length} pieza
                  {exportado.perdidas.length === 1 ? '' : 's'} de la preparación ya no
                  {exportado.perdidas.length === 1 ? ' existe' : ' existen'} en el atlas instalado y
                  no {exportado.perdidas.length === 1 ? 'salió' : 'salieron'} en el archivo.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* La región viva se queda montada aunque no haya nada que decir. Un
          `role="status"` que aparece junto con su texto no se anuncia: el lector
          de pantalla tiene que estar observando la región ANTES de que su
          contenido cambie, y aquí todo lo que se responde —«Guardada con 412
          piezas», «No se pudo exportar»— llegaba en silencio a quien no mira
          esta zona de la pantalla. Vacía no ocupa sitio: el borde y el margen
          los pone `.admin-aviso`, que sí es condicional. Es el mismo reparto
          que en `TablaUsuarios`. */}
      {/* Los dos avisos FLOTAN sobre la página (D-132) en vez de ir en su flujo.
          En el flujo empujaban el lienzo hacia abajo al aparecer, a mitad de un
          gesto: se cortaba un hueso, salía el aviso, y el clic siguiente —sobre
          el fragmento— caía en otra pieza, sesenta píxeles más arriba. */}
      <div className="atlas-avisos-flotantes">
      <div role="status">
        {aviso ? (
          <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>
            {aviso.texto}
            <button
              type="button"
              className="atlas-aviso-cerrar"
              aria-label="Cerrar el aviso"
              onClick={() => setAviso(null)}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      {hayQueAvisar ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>Hay cambios sin guardar.</strong> Lo que apague o encienda aquí, y el encuadre
          que le busque al modelo, no quedan en ninguna parte hasta que pulse{' '}
          <em>{instancia ? 'Guardar cambios' : 'Guardar preparación'}</em>. Cerrar la pestaña,
          volver al cuerpo completo o abrir otra preparación se lo llevará.
        </div>
      ) : null}
      </div>

      <div className="atlas-marco">
        <aside className="atlas-panel">
          <ArbolAnatomico
            catalogo={catalogo}
            visibles={visibles}
            alCambiarVisibles={cambiarVisibles}
            resaltada={resaltada}
            alResaltar={setResaltada}
            seleccion={piezasSeleccionadas}
            alSeleccionar={seleccionarDesdeElArbol}
          />
        </aside>

        {/* Los gestos de cámara se escuchan aquí, en el contenedor, y no en el
            lienzo: OrbitControls captura el puntero sobre su propio lienzo, de
            modo que un arrastre que empieza dentro y termina fuera de la
            ventana sigue soltándose aquí. Solo interesa el final del gesto
            —soltar, cancelar, o una vuelta de rueda—, que es cuando
            `revisarEncuadre` mira si la cámara quedó en otro sitio. */}
        <div
          className="atlas-centro"
          onPointerUp={revisarEncuadre}
          onPointerCancel={revisarEncuadre}
          onWheel={revisarEncuadre}
        >
          <VisorAtlas
            catalogo={catalogo}
            visibles={visibles}
            resaltada={resaltada}
            separacion={separacion}
            vistaInicial={vistaInicial}
            mando={mando}
            alAsentarVista={asentarReferencia}
            // Solo con el panel de exportar abierto: cerrado, un plano magenta
            // cruzando la tibia sin ningún mando a la vista no se explica.
            corte={panelExportar ? corteVivo : null}
            // Pulsar una pieza la selecciona, como en Blender, y ya no la
            // apaga (D-126): apagar es Supr, X o H sobre lo seleccionado. Un
            // clic que borra no deja elegir nada, y sin elegir no hay marco,
            // ni «solo esto», ni nada que venga después.
            seleccion={seleccion}
            alSeleccionar={alSeleccionar}
            herramienta={herramienta}
            transformaciones={transformaciones}
            alTransformar={alTransformar}
            rayosX={rayosX}
            aspectos={aspectos}
            marcas={marcas}
            alMarcar={(marca) => {
              if (marcas.length >= MAXIMO_DE_MARCAS) {
                setAviso({
                  tipo: 'error',
                  texto: `Una preparación admite ${MAXIMO_DE_MARCAS} rótulos y medidas. Quite alguno antes de añadir otro.`,
                })
                return
              }
              setMarcas([...marcas, marca])
            }}
            gizmo={gizmo}
            ortografica={ortografica}
            cortes={cortes}
            alCortar={alCortar}
            alAvisar={(texto) => setAviso({ tipo: 'error', texto })}
          />

          {/* Tres de los grupos de la barra FLOTAN sobre el lienzo (D-136), como la
              columna de herramientas y la cabecera de la vista de Blender: con
              todo en fila bajo el visor la barra ocupaba cinco renglones y se
              comía el alto del modelo. Se colocan por CSS (`.atlas-flota`);
              siguen dentro de la misma barra, y en el mismo orden de tabulación. */}
          <div className="atlas-herramientas" role="toolbar" aria-label="Herramientas del visor">
            <div className="atlas-herramientas-grupo atlas-flota atlas-flota-utiles">
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={herramienta === 'orbita'}
                title="Girar la vista arrastrando (Esc)"
                onClick={() => setHerramienta('orbita')}
              >
                Girar
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={herramienta === 'caja'}
                title="Seleccionar arrastrando un marco (B). Mayús suma, Ctrl quita."
                onClick={() => setHerramienta('caja')}
              >
                Marco
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={herramienta === 'corte'}
                title="Partir el hueso seleccionado: trace una línea de lado a lado (K)"
                onClick={() => setHerramienta('corte')}
              >
                Cortar
              </button>
            </div>
            <div className="atlas-herramientas-grupo atlas-flota atlas-flota-apuntar">
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={herramienta === 'rotulo'}
                title="Rótulo: pulse un punto de la anatomía y escriba su texto en el panel derecho"
                onClick={() => setHerramienta('rotulo')}
              >
                Rótulo
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={herramienta === 'distancia'}
                title="Medir: pulse dos puntos de la anatomía (M)"
                onClick={() => setHerramienta('distancia')}
              >
                Medir
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={herramienta === 'angulo'}
                title="Ángulo: pulse tres puntos; el del medio es el vértice"
                onClick={() => setHerramienta('angulo')}
              >
                Ángulo
              </button>
            </div>
            <div className="atlas-herramientas-grupo">
              <button
                type="button"
                className="atlas-herramienta"
                disabled={seleccion.size === 0}
                title="Apagar lo seleccionado (Supr, X o H)"
                onClick={apagarSeleccion}
              >
                Apagar
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                disabled={seleccion.size === 0}
                title="Dejar solo lo seleccionado (Mayús + H)"
                onClick={dejarSoloLaSeleccion}
              >
                Solo esto
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                title="Encender todo el cuerpo (Alt + H)"
                onClick={encenderTodo}
              >
                Encender todo
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                disabled={historial.length === 0}
                title="Deshacer el último cambio: encendidos, apagados, movimientos y giros (Ctrl + Z)"
                onClick={deshacer}
              >
                Deshacer
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                disabled={rehacer.length === 0}
                title="Rehacer lo deshecho (Ctrl + Mayús + Z)"
                onClick={rehacerPaso}
              >
                Rehacer
              </button>
            </div>
            <div className="atlas-herramientas-grupo">
              <button
                type="button"
                className="atlas-herramienta"
                disabled={seleccion.size === 0}
                title="Mover lo seleccionado (G). X, Y o Z lo atan a un eje; un clic confirma y Esc cancela."
                onClick={() => empezarGesto('mover')}
              >
                Mover
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                disabled={seleccion.size === 0}
                title="Girar lo seleccionado (R). X, Y o Z eligen el eje; un clic confirma y Esc cancela."
                onClick={() => empezarGesto('girar')}
              >
                Rotar
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={gizmo}
                title="Asas: las flechas y los aros de colores sobre lo seleccionado, para moverlo y girarlo arrastrando"
                onClick={() => setGizmo((puesto) => !puesto)}
              >
                Asas
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                disabled={![...seleccion].some((id) => transformaciones.has(id))}
                title="Devolver lo seleccionado a su sitio anatómico (Alt + G la posición, Alt + R el giro)"
                onClick={() => {
                  const nuevas = new Map(transformaciones)
                  for (const id of seleccion) nuevas.delete(id)
                  alTransformar(nuevas)
                }}
              >
                A su sitio
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                disabled={seleccion.size < 2}
                title="Agrupar lo seleccionado: desde ahora se selecciona y se mueve junto (Ctrl + G)"
                onClick={agruparSeleccion}
              >
                Agrupar
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                disabled={!grupos.some((g) => g.some((id) => seleccion.has(id)))}
                title="Deshacer el grupo de lo seleccionado (Ctrl + Mayús + G)"
                onClick={desagruparSeleccion}
              >
                Desagrupar
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                title="Espejo: pasa la preparación entera al otro lado del cuerpo. Otra vez, vuelve."
                onClick={espejar}
              >
                Espejo
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                disabled={![...seleccion].some((id) => partesDeFragmento(id) !== null)}
                title="Soldar: deshacer el corte del fragmento seleccionado; el hueso vuelve entero"
                onClick={soldarSeleccion}
              >
                Soldar
              </button>
            </div>
            <div className="atlas-herramientas-grupo atlas-flota atlas-flota-vistas">
              <button type="button" className="atlas-herramienta" title="De frente (1)" onClick={() => mirarDesde('frente')}>
                Frente
              </button>
              <button type="button" className="atlas-herramienta" title="Desde la derecha del paciente (3)" onClick={() => mirarDesde('derecha')}>
                Lateral
              </button>
              <button type="button" className="atlas-herramienta" title="Desde arriba (7)" onClick={() => mirarDesde('arriba')}>
                Superior
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={ortografica}
                title="Vista ortográfica, sin fuga: para trazar cortes rectos y medir (5)"
                onClick={() => setOrtografica((puesta) => !puesta)}
              >
                Orto
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                aria-pressed={rayosX}
                title="Rayos X: ver a través de lo no seleccionado (Alt + Z)"
                onClick={() => setRayosX((encendidos) => !encendidos)}
              >
                Rayos X
              </button>
              <button
                type="button"
                className="atlas-herramienta"
                title="Encuadrar lo seleccionado, o todo lo encendido si no hay selección (punto)"
                onClick={encuadrarLoElegido}
              >
                Centrar
              </button>
            </div>
            <button
              type="button"
              className="atlas-herramienta"
              aria-expanded={atajosAbiertos}
              aria-controls="atlas-atajos"
              onClick={() => setAtajosAbiertos((abierto) => !abierto)}
            >
              Atajos
            </button>
          </div>

          {atajosAbiertos ? (
            <dl className="atlas-atajos" id="atlas-atajos">
              {ATAJOS_DEL_TALLER.map(([tecla, efecto]) => (
                <div key={tecla}>
                  <dt>{tecla}</dt>
                  <dd>{efecto}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/* Aquí estuvo el mando «Separar» (D-125). El estado `separacion` se
              conserva sin mando a propósito: una preparación que la traiga
              guardada se abre y se vuelve a guardar tal como estaba, en vez de
              cerrarse en silencio al primer guardado. */}
          <div className="atlas-mandos">
            <span className="atlas-seleccionadas">
              {seleccion.size === 0
                ? 'Nada seleccionado'
                : seleccion.size === 1
                  ? nombreDeLaSeleccionada
                  : `${seleccion.size} piezas seleccionadas`}
            </span>
            <span className="atlas-resumen">{resumen || 'Nada encendido'}</span>
          </div>
        </div>

        <aside className="atlas-panel atlas-panel-derecho">
          <div className="atlas-ficha">
            <label className="campo-etiqueta" htmlFor="atlas-nombre">
              Nombre de la preparación *
            </label>
            <input
              id="atlas-nombre"
              className="campo-control"
              placeholder="Tibia derecha con peroné"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <label className="campo-etiqueta" htmlFor="atlas-descripcion">
              Para qué sirve
            </label>
            <textarea
              id="atlas-descripcion"
              className="campo-control"
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />

            <p className="campo-ayuda">
              Se guardan las piezas encendidas, lo que se hayan movido o girado y el encuadre de la
              cámara. El atlas
              original no se toca: lo que apague aquí se puede volver a encender siempre.
            </p>
          </div>

          <h3 className="atlas-subtitulo">Posición y giro</h3>
          {unicaSeleccionada ? (
            <PanelDeNumeros
              // La clave rehace los campos al cambiar de pieza o al moverla con
              // el ratón: son campos sin controlar —para poder teclear «-» o
              // «1.» sin que React los corrija a medias— y solo leen su valor
              // inicial.
              key={`${unicaSeleccionada}:${claveTransformaciones}`}
              transformacion={transformaciones.get(unicaSeleccionada) ?? null}
              alCambiar={(nueva) => {
                const nuevas = new Map(transformaciones)
                if (nueva) nuevas.set(unicaSeleccionada, nueva)
                else nuevas.delete(unicaSeleccionada)
                alTransformar(nuevas)
              }}
            />
          ) : (
            <p className="campo-ayuda">
              {seleccion.size === 0
                ? 'Seleccione una pieza para ver y teclear cuánto se ha movido.'
                : 'Con varias piezas seleccionadas se mueven juntas con G, R o las asas; los números son de una sola.'}
            </p>
          )}

          <h3 className="atlas-subtitulo">Color y transparencia</h3>
          {seleccion.size === 0 ? (
            <p className="campo-ayuda">Seleccione piezas para darles un color propio o dejar ver a través.</p>
          ) : (
            <div className="atlas-aspecto">
              <label className="atlas-aspecto-fila">
                <span>Color</span>
                <input
                  type="color"
                  value={aspectoDeLaSeleccion.color ?? '#d9c7a3'}
                  aria-label="Color propio de lo seleccionado"
                  onChange={(e) => cambiarAspecto({ color: e.target.value })}
                />
                <button
                  type="button"
                  className="atlas-herramienta"
                  disabled={!aspectoDeLaSeleccion.color}
                  onClick={() => cambiarAspecto({ color: null })}
                >
                  El de su sistema
                </button>
              </label>
              <label className="atlas-aspecto-fila">
                <span>Opacidad</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round((aspectoDeLaSeleccion.opacidad ?? 1) * 100)}
                  aria-label="Opacidad de lo seleccionado, en tanto por ciento"
                  onChange={(e) => cambiarAspecto({ opacidad: Number(e.target.value) / 100 })}
                />
                <span className="atlas-separador-valor">
                  {Math.round((aspectoDeLaSeleccion.opacidad ?? 1) * 100)} %
                </span>
              </label>
            </div>
          )}

          <h3 className="atlas-subtitulo">Rótulos y medidas</h3>
          {marcas.length === 0 ? (
            <p className="campo-ayuda">
              Con «Rótulo», «Medir» o «Ángulo», pulse sobre la anatomía. Lo que apunte se ve en la
              ficha.
            </p>
          ) : (
            <ul className="atlas-apuntes">
              {marcas.map((marca, i) => (
                <li key={i}>
                  {marca.tipo === 'rotulo' ? (
                    <input
                      className="campo-control"
                      value={marca.texto}
                      maxLength={80}
                      aria-label={`Texto del rótulo ${i + 1}`}
                      onChange={(e) =>
                        setMarcas(
                          marcas.map((otra, j) =>
                            j === i && otra.tipo === 'rotulo' ? { ...otra, texto: e.target.value } : otra,
                          ),
                        )
                      }
                    />
                  ) : (
                    <span>
                      {marca.tipo === 'distancia' ? 'Distancia' : 'Ángulo'} · {textoDeLaMarca(marca)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="atlas-herramienta"
                    aria-label={`Quitar ${marca.tipo === 'rotulo' ? 'el rótulo' : 'la medida'} ${i + 1}`}
                    onClick={() => setMarcas(marcas.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 className="atlas-subtitulo">Vistas con nombre</h3>
          <div className="atlas-apuntes-nueva">
            <input
              className="campo-control"
              placeholder="Lateral, AP, el foco…"
              value={nombreDeVista}
              maxLength={40}
              aria-label="Nombre de la vista que se va a guardar"
              onChange={(e) => setNombreDeVista(e.target.value)}
            />
            <button
              type="button"
              className="atlas-herramienta"
              disabled={!nombreDeVista.trim() || vistas.length >= MAXIMO_DE_VISTAS}
              title="Guarda el encuadre de ahora con ese nombre; en la ficha sale como un botón"
              onClick={() => {
                const ahora = mando.current?.vistaActual()
                if (!ahora) return
                setVistas([
                  ...vistas.filter((v) => v.nombre !== nombreDeVista.trim()),
                  { nombre: nombreDeVista.trim(), camara: ahora.camara, objetivo: ahora.objetivo },
                ])
                setNombreDeVista('')
              }}
            >
              Guardar vista
            </button>
          </div>
          {vistas.length > 0 ? (
            <ul className="atlas-apuntes">
              {vistas.map((v) => (
                <li key={v.nombre}>
                  <button
                    type="button"
                    className="atlas-herramienta"
                    onClick={() => {
                      mando.current?.irA({ camara: v.camara, objetivo: v.objetivo, separacion })
                      revisarEncuadre()
                    }}
                  >
                    {v.nombre}
                  </button>
                  <button
                    type="button"
                    className="atlas-herramienta"
                    aria-label={`Quitar la vista ${v.nombre}`}
                    onClick={() => setVistas(vistas.filter((otra) => otra.nombre !== v.nombre))}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <h3 className="atlas-subtitulo">Modelos 3D</h3>
          {modelos === null ? (
            <p className="campo-ayuda">Leyendo los modelos…</p>
          ) : modelos.length === 0 ? (
            <p className="campo-ayuda">Todavía no hay modelos 3D en el catálogo.</p>
          ) : (
            <>
              <p className="campo-ayuda">
                Abrir uno enciende sus piezas del atlas para trabajarlas aquí. El modelo no se
                modifica: lo que haga se guarda como una preparación.
              </p>
              <ul className="atlas-guardadas atlas-modelos">
                {modelos.map((m) => (
                  <li key={m.id} className={m.id === modeloAbierto ? 'atlas-guardada-activa' : ''}>
                    <button
                      type="button"
                      className="atlas-guardada-abrir"
                      disabled={m.piezas.length === 0}
                      title={
                        m.piezas.length === 0
                          ? 'Este modelo no salió del atlas: no trae apuntadas sus piezas y no se puede abrir aquí.'
                          : undefined
                      }
                      onClick={() => abrirModelo(m)}
                    >
                      <strong>{m.nombre}</strong>
                      <span>
                        {m.piezas.length === 0
                          ? 'no es del atlas'
                          : `${m.piezas.length} pieza${m.piezas.length === 1 ? '' : 's'}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="atlas-subtitulo">Preparaciones guardadas</h3>

          {/* Si no se pudo preguntar, se dice; y «no hay ninguna» solo se
              afirma cuando la respuesta llegó de verdad. Lo que ya estuviera
              listado se conserva: un refresco fallido no es motivo para
              esconder lo que se sabe. */}
          {listaFallo ? (
            <div className="admin-aviso admin-aviso-error">
              {listaFallo}
              <div className="admin-acciones" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={refrescarLista}
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : null}

          {guardadas.length === 0 && !listaFallo ? (
            <p className="atlas-vacio">Todavía no hay ninguna.</p>
          ) : null}

          {guardadas.length > 0 ? (
            <ul className="atlas-guardadas">
              {guardadas.map((g) => (
                <li key={g.id} className={g.id === instancia ? 'atlas-guardada-activa' : ''}>
                  <button type="button" className="atlas-guardada-abrir" onClick={() => abrir(g.id)}>
                    <strong>{g.nombre}</strong>
                    <span>
                      {g.piezas} pieza{g.piezas === 1 ? '' : 's'}
                      {g.desfasada ? ' · atlas antiguo' : ''}
                    </span>
                  </button>
                  <div className="atlas-guardada-acciones">
                    <button
                      type="button"
                      disabled={enCurso}
                      onClick={() =>
                        conAviso(() => duplicarInstancia(g.id), 'Copia creada.')
                      }
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      className="lista-quitar"
                      disabled={enCurso}
                      onClick={() => {
                        // La confirmación ya no amenaza con un visor vacío,
                        // porque eso ya no puede pasar: `eliminarInstancia` se
                        // niega si alguna ficha la usa —en borrador o
                        // publicada— y dice cuáles. Seguir diciéndolo enseñaba
                        // a leer el aviso como un riesgo que se acepta, y
                        // callaba lo que de verdad va a ocurrir. La negativa
                        // llega como `{ exito: false, mensaje }` y `conAviso`
                        // la pinta tal cual en el aviso de error, con los
                        // títulos de las fichas: es lo que hace falta para ir a
                        // quitar el bloque.
                        if (
                          !confirm(
                            `¿Eliminar «${g.nombre}»? No se puede deshacer.\n\n` +
                              'Si alguna ficha la usa, no se eliminará: se le dirá cuáles, ' +
                              'para que quite antes el bloque o lo cambie por otra preparación.',
                          )
                        ) {
                          return
                        }
                        conAviso(
                          () => eliminarInstancia(g.id),
                          'Preparación eliminada.',
                          // Vaciar el taller solo si de verdad se borró. Cuando
                          // la acción falla —sesión caducada— la preparación
                          // sigue en la base, y limpiarla de la pantalla se
                          // llevaba además lo que hubiera sin guardar, sin
                          // preguntar y sin que se hubiera borrado nada.
                          g.id === instancia ? () => empezarDeCero(false) : undefined,
                        )
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      </div>
      </div>
    </>
  )
}

/**
 * Los mandos de un corte: dónde, cuánto se inclina, hacia qué cara y qué trozo
 * se mueve.
 *
 * Los límites salen de `planoDeCorte.ts`, los mismos con los que el servidor
 * valida: escritos aquí a mano, el día que cambiaran allí el deslizador dejaría
 * elegir un corte que después se rechaza al exportar.
 *
 * La dirección se desactiva con el corte transversal, porque no significa nada:
 * girar un plano perpendicular al eje alrededor del eje lo deja donde estaba, y
 * un mando que se mueve sin mover nada hace creer que el visor no responde.
 */
/**
 * El panel de números (la N de Blender): lo que una pieza se ha movido, en
 * milímetros, y lo que se ha girado, en grados, para leerlo y para teclearlo.
 *
 * «Desplazar 8 mm y angular 15° en varo» es como habla quien escribe la ficha,
 * y a ojo con el ratón no sale. Los ejes son los del atlas, con el paciente de
 * pie y mirando al frente: X hacia su izquierda, Y hacia arriba, Z hacia
 * delante.
 */
function PanelDeNumeros({
  transformacion,
  alCambiar,
}: {
  transformacion: TransformacionDePieza | null
  alCambiar: (nueva: TransformacionDePieza | null) => void
}) {
  const milimetros = (transformacion?.mover ?? [0, 0, 0]).map((m) => Math.round(m * 10000) / 10)
  const grados = gradosDeCuaternion(transformacion?.girar ?? [0, 0, 0, 1])

  const aplicar = (cual: 'mover' | 'girar', eje: number, texto: string) => {
    const valor = Number(texto.replace(',', '.'))
    if (!Number.isFinite(valor)) return
    const mover = [...milimetros] as [number, number, number]
    const girar = [...grados] as [number, number, number]
    if (cual === 'mover') mover[eje] = valor
    else girar[eje] = valor
    const nueva: TransformacionDePieza = {
      mover: [mover[0] / 1000, mover[1] / 1000, mover[2] / 1000],
      girar: cuaternionDeGrados(girar),
    }
    const quieta = nueva.mover.every((n) => n === 0) && girar.every((n) => n === 0)
    alCambiar(quieta ? null : nueva)
  }

  const fila = (titulo: string, cual: 'mover' | 'girar', valores: number[], unidad: string) => (
    <div className="atlas-numeros-fila">
      <span className="atlas-numeros-titulo">{titulo}</span>
      {(['X', 'Y', 'Z'] as const).map((letra, eje) => (
        <label key={letra} className={`atlas-numero atlas-numero-${letra.toLowerCase()}`}>
          <span>{letra}</span>
          <input
            type="text"
            inputMode="decimal"
            defaultValue={String(valores[eje])}
            aria-label={`${titulo} en ${letra}, en ${unidad}`}
            onBlur={(e) => aplicar(cual, eje, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </label>
      ))}
      <span className="atlas-numeros-unidad">{unidad}</span>
    </div>
  )

  return (
    <div className="atlas-numeros">
      {fila('Posición', 'mover', milimetros, 'mm')}
      {fila('Giro', 'girar', grados, '°')}
    </div>
  )
}

function MandosDelCorte({
  corte,
  nombre,
  alCambiar,
}: {
  corte: CorteDeHueso
  nombre: string
  alCambiar: (corte: CorteDeHueso) => void
}) {
  const cambiar = (parte: Partial<CorteDeHueso>) => alCambiar({ ...corte, ...parte })
  const descripcion = describirCorte(corte)
  return (
    <fieldset
      style={{ marginTop: 10, border: '1px solid currentColor', borderRadius: 6, padding: '8px 10px' }}
    >
      <legend style={{ padding: '0 4px' }}>
        <strong>Corte de {nombre}</strong>
      </legend>

      <label className="atlas-separador-mando">
        <span style={{ minWidth: 150 }}>Posición, de proximal a distal</span>
        <input
          type="range"
          min={POSICION_MINIMA}
          max={POSICION_MAXIMA}
          step={1}
          value={corte.posicion}
          onChange={(e) => cambiar({ posicion: Number(e.target.value) })}
        />
        <span className="atlas-separador-valor">{corte.posicion} %</span>
      </label>

      <label className="atlas-separador-mando">
        <span style={{ minWidth: 150 }}>Inclinación</span>
        <input
          type="range"
          min={0}
          max={INCLINACION_MAXIMA}
          step={1}
          value={corte.inclinacion}
          onChange={(e) => cambiar({ inclinacion: Number(e.target.value) })}
        />
        <span className="atlas-separador-valor">
          {corte.inclinacion === 0 ? 'transversal' : `${corte.inclinacion}°`}
        </span>
      </label>

      <label className="atlas-separador-mando">
        <span style={{ minWidth: 150 }}>Más proximal por la cara</span>
        <input
          type="range"
          min={0}
          max={345}
          step={15}
          value={corte.giro}
          disabled={corte.inclinacion === 0}
          onChange={(e) => cambiar({ giro: Number(e.target.value) })}
        />
        <span className="atlas-separador-valor">
          {caraDelGiro(corte.giro)} ({corte.giro}°)
        </span>
      </label>

      <div className="atlas-separador-mando" role="radiogroup" aria-label="Fragmento que se mueve">
        <span style={{ minWidth: 150 }}>Fragmento que se mueve</span>
        {(['distal', 'proximal'] as const).map((lado) => (
          <label key={lado} className="atlas-casilla" style={{ flex: 'none' }}>
            <input
              type="radio"
              name="atlas-fragmento"
              checked={corte.fragmento === lado}
              onChange={() => cambiar({ fragmento: lado })}
            />
            <span>{lado}</span>
          </label>
        ))}
      </div>

      <p className="atlas-conteo" style={{ marginTop: 6 }}>
        {descripcion.charAt(0).toUpperCase() + descripcion.slice(1)}. Las caras se cuentan con el
        cuerpo en posición anatómica: lateral es hacia fuera del cuerpo en los dos lados.
      </p>
    </fieldset>
  )
}
