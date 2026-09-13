'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
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
import { registrarResultadoDeCirugia } from '@/app/(frontend)/acciones/actividad'
import { Rico, tieneContenido } from '@/components/Rico'
import { IconoInstrumento } from './IconoInstrumento'
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
import type { MandoDelLienzo, Modo, PiezaDelCaso } from './LienzoQuirurgico'

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

interface Anotacion {
  texto: string
  clase: 'bien' | 'aviso' | 'grave'
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
const MODOS = [
  {
    valor: 'orbitar',
    etiqueta: 'Orbitar',
    ayuda: 'Orbitar: arrastre para girar el modelo y use la rueda para acercar.',
  },
  {
    valor: 'trazar',
    etiqueta: 'Trazar',
    ayuda: 'Trazar: arrastre sobre el modelo para dibujar la incisión.',
  },
  {
    valor: 'mover',
    etiqueta: 'Mover',
    ayuda: 'Mover: arrastre el fragmento para colocarlo; la órbita queda desactivada.',
  },
] as const

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
}

/** «la piel», «la piel y el músculo»: para escribirlo dentro de una frase. */
function capasEnProsa(roles: string[]): string {
  const nombres = roles.map((rol) => CAPAS.find((c) => c.rol === rol)?.enProsa ?? rol)
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

export function ConsolaQuirurgica({
  caso,
  documentoId,
  recorridoGuardado = null,
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
}) {
  const mando = useRef<MandoDelLienzo | null>(null)

  const [indice, setIndice] = useState(0)
  const [modo, setModo] = useState<Modo>(
    () => MODO_DEL_OBJETIVO[objetivoDelPaso(caso.pasos[0] ?? {})],
  )
  const [fluoroscopia, setFluoroscopia] = useState(false)
  const [instrumento, setInstrumento] = useState<string | null>(null)
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
            'aviso',
          )
        } finally {
          enVuelo.current = false
        }
      })()
    },
    [documentoId, maximo, anotar],
  )

  const refrescarVisibles = useCallback(
    (indicePaso: number, apagadas: Set<string>) => {
      const { nodos, encender } = visibilidadDelPaso(caso.pasos, caso.piezas, indicePaso, apagadas)
      mando.current?.mostrar(nodos)
      if (encender.length === 0) return
      // Hubo que aplicar el suelo. La casilla tiene que decir la verdad de lo
      // que se ve, y el residente tiene que saber por qué se le ha encendido
      // algo que él apagó.
      setCapasApagadas((previas) => {
        const siguientes = new Set(previas)
        for (const rol of encender) siguientes.delete(rol)
        return siguientes
      })
      anotar(`Se vuelve a mostrar ${capasEnProsa(encender)}: sin eso el lienzo se quedaba vacío.`, 'aviso')
    },
    [caso.pasos, caso.piezas, anotar],
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
        anotar(`Este paso se trabaja sobre ${capasEnProsa(encender)}: se vuelve a mostrar.`, 'aviso')
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
    })

    const clase: Anotacion['clase'] =
      evaluacion.resultado === RESULTADOS.CORRECTO
        ? 'bien'
        : evaluacion.complicacion
          ? 'grave'
          : 'aviso'
    anotar(`${indice + 1}. ${evaluacion.mensaje}`, clase)

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
    // Terminar el caso no necesita nada aparte: el último paso es un hito como
    // los demás y deja guardado el marcador final.
    guardarRecorrido(puntajeTrasElPaso, complicaciones)

    const siguiente = indice + 1
    setIndice(siguiente)
    setInstrumento(null)
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

  function reiniciar() {
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
    if (sePierde && !confirm(`Se borrarán ${sePierde} de este caso. ¿Reiniciar?`)) return

    setIndice(0)
    setModo(MODO_DEL_OBJETIVO[objetivoDelPaso(caso.pasos[0] ?? {})])
    setInstrumento(null)
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
    setGiros({ x: d.giroX, y: d.giroY, z: d.giroZ })
    setReduccion(medidaInicial(caso))
  }, [caso, escalaMm])

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
   * este renglón mide 11 px—. La regla es `.consola-desglose-fuera`, en
   * `estilos.css`, y el sentido no depende del color: la propia línea dice «se
   * pasa» o «dentro».
   */
  const lineaDeTope = (valor: number, tope: number, unidad: 'mm' | '°') => {
    const fuera = valor > tope
    return (
      <dd className={`consola-desglose${fuera ? ' consola-desglose-fuera' : ''}`}>
        tope {unidad === '°' ? `${tope}°` : `${tope} mm`} · {fuera ? 'se pasa' : 'dentro'}
      </dd>
    )
  }

  /** La incisión trazada contra el rango que pide el paso. */
  const lineaDelTrazo = () => {
    if (objetivo !== 'trazo' || !paso) return null
    const rango = rangoDeTrazoEnTexto(paso)
    if (!rango) return null
    const { trazoMinimo: minimo, trazoMaximo: maximo } = paso
    const pedido = `objetivo: ${rango}`
    if (largoDelTrazoMm <= 0) {
      return <dd className="consola-desglose">{pedido} · sin trazar</dd>
    }
    const corta = typeof minimo === 'number' && largoDelTrazoMm < minimo
    const larga = typeof maximo === 'number' && largoDelTrazoMm > maximo
    return (
      <dd className={`consola-desglose${corta || larga ? ' consola-desglose-fuera' : ''}`}>
        {pedido} · {corta ? 'corta' : larga ? 'larga' : 'dentro'}
      </dd>
    )
  }

  const ayudaDelModo = MODOS.find((m) => m.valor === modo)?.ayuda ?? ''
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
  if (!caso.modeloUrl) {
    return (
      <div className="admin-aviso admin-aviso-atencion">
        <strong>Este caso todavía no tiene modelo 3D.</strong> La consola necesita un archivo .glb
        con el hueso ya partido. Súbalo en Modelos 3D y asígnelo al caso.
      </div>
    )
  }

  if (caso.pasos.length === 0) {
    return (
      <div className="admin-aviso admin-aviso-atencion">
        <strong>Este caso todavía no tiene pasos escritos.</strong> Añádalos desde el panel.
      </div>
    )
  }

  return (
    <section className="consola">
      {/* --------------------------------------------------------- barra */}
      <header className="consola-barra">
        <div>
          <p className="consola-rotulo">Consola de reducción y fijación de fracturas</p>
          <h2 className="consola-titulo">{caso.nombre}</h2>
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
              <dd>{caso.clasificacion}</dd>
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
        <div className="consola-puntaje">
          <span className="consola-puntaje-numero">{puntaje}</span>
          <span className="consola-puntaje-total">/ {maximo}</span>
          {/* Lo que quedó de la vez anterior, en el sitio donde el residente
              mira al llegar. El marcador grande cuenta el recorrido de ahora y
              arranca en cero a propósito: lo guardado es un estado —el último
              recorrido—, no un punto de guardado, así que no se sabe qué pasos
              tenía resueltos. Sumarlo al marcador y dejarle repetir el caso le
              cobraría los mismos pasos dos veces, y el número subiría solo con
              recargar. El detalle está abajo, en «Su recorrido anterior». */}
          {recorridoGuardado ? (
            <span className="consola-puntaje-total">
              · anterior {recorridoGuardado.puntaje}
              {recorridoGuardado.puntajeMaximo !== null
                ? ` de ${recorridoGuardado.puntajeMaximo}`
                : ''}
            </span>
          ) : null}
          <button type="button" className="consola-boton" onClick={reiniciar}>
            Reiniciar caso
          </button>
        </div>
      </header>

      <div className="consola-cuerpo">
        {/* ------------------------------------------------ panel izquierdo */}
        {/* Sin `consola-panel-izq`: ninguna hoja la declaraba. El aspecto de
            esta columna lo da `.consola-panel` a secas —el borde derecho— y
            `.consola-panel-der` es la que lo invierte para la otra. Una clase
            que nadie define parece un enganche que existe y no existe. */}
        <aside className="consola-panel">
          <h3 className="consola-subtitulo">Capas</h3>
          <ul className="consola-capas">
            {CAPAS.map((capa) => {
              const hay = caso.piezas.some((p) => p.rol === capa.rol)
              return (
                <li key={capa.rol}>
                  <label className={hay ? '' : 'consola-capa-vacia'}>
                    <input
                      type="checkbox"
                      checked={!capasApagadas.has(capa.rol)}
                      disabled={!hay}
                      onChange={() => alternarCapa(capa.rol)}
                    />
                    <span>{capa.etiqueta}</span>
                  </label>
                </li>
              )
            })}
          </ul>

          <h3 className="consola-subtitulo">Modo</h3>
          <div className="consola-modos">
            {MODOS.map((m) => (
              <button
                key={m.valor}
                type="button"
                className={`consola-modo${modo === m.valor ? ' activo' : ''}`}
                aria-pressed={modo === m.valor}
                title={m.ayuda}
                onClick={() => setModo(m.valor)}
              >
                {m.etiqueta}
                {modoDelPaso === m.valor ? ' ·' : ''}
              </button>
            ))}
          </div>
          <p className="consola-instruccion">
            {ayudaDelModo}
            {etiquetaDelModoDelPaso
              ? ` El punto señala el modo que pide este paso: ${etiquetaDelModoDelPaso}.`
              : ''}
          </p>

          <button
            type="button"
            className="consola-boton consola-boton-ancho"
            onClick={() => mando.current?.encuadrar()}
          >
            Encuadrar
          </button>
        </aside>

        {/* -------------------------------------------------------- lienzo */}
        <div className="consola-centro">
          <div className="consola-lienzo-marco">
            <LienzoQuirurgico
              url={caso.modeloUrl}
              piezas={caso.piezas}
              modo={modo}
              fluoroscopia={fluoroscopia}
              // Del trazo solo se guarda su longitud. Los puntos se quedan en
              // el lienzo, que ya es su dueño; subirlos a React repintaba la
              // consola entera —los dos campos ricos del pie incluidos— unas
              // treinta veces por incisión, compitiendo con el bucle de dibujo.
              alTrazar={(puntos) => setLargoDelTrazoMm(largoDelTrazo(puntos, escalaMm))}
              alMoverFragmento={recalcularMedidas}
              // El fragmento se coloca desplazado cuando el archivo termina de
              // cargar, no antes: hasta ese momento no hay ningún nodo al que
              // aplicarle nada, y hacerlo en el montaje del componente dejaba
              // el hueso reducido y el caso resuelto de entrada.
              alCargar={() => {
                colocarEnDesplazamientoInicial()
                entrarEnPaso(indice, capasApagadas)
              }}
              // Un modelo que no abre tiene que decirlo. Sin esto el residente
              // se queda mirando un lienzo vacío creyendo que aún carga.
              alFallar={(mensaje) => anotar(mensaje, 'grave')}
              mando={mando}
            />
            <button
              type="button"
              className={`consola-fluoro${fluoroscopia ? ' activo' : ''}`}
              aria-pressed={fluoroscopia}
              onClick={() => setFluoroscopia((v) => !v)}
            >
              Fluoroscopia
            </button>
            {codigo ? <span className="consola-codigo">{codigo}</span> : null}
          </div>

          <dl className="consola-medidas">
            <div>
              <dt>Desplazamiento</dt>
              <dd>{reduccion.desplazamiento} mm</dd>
              {/* De qué eje viene: sin esto, lo que queda fuera del plano que
                  se está mirando parece un número que no baja al arrastrar. */}
              {reduccion.desplazamiento > 0 ? (
                <dd className="consola-desglose">
                  {reduccion.lateral
                    .map(({ eje, mm }) => `${eje.toUpperCase()} ${mm}`)
                    .join(' · ')}
                </dd>
              ) : null}
              {objetivo === 'reduccion' && topes
                ? lineaDeTope(reduccion.desplazamiento, topes.desplazamiento, 'mm')
                : null}
            </div>
            <div>
              <dt>Angulación</dt>
              <dd>{reduccion.angulacion}°</dd>
              {objetivo === 'reduccion' && topes
                ? lineaDeTope(reduccion.angulacion, topes.angulacion, '°')
                : null}
            </div>
            <div>
              <dt>Diástasis</dt>
              <dd>{reduccion.diastasis} mm</dd>
              {objetivo === 'reduccion' && topes
                ? lineaDeTope(reduccion.diastasis, topes.diastasis, 'mm')
                : null}
            </div>
            <div>
              <dt>Incisión</dt>
              <dd>{largoDelTrazoMm} mm</dd>
              {lineaDelTrazo()}
            </div>
          </dl>
        </div>

        {/* ------------------------------------------------ panel derecho */}
        <aside className="consola-panel consola-panel-der">
          <h3 className="consola-subtitulo">Instrumental</h3>
          <ul className="consola-bandeja">
            {caso.instrumental.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  className={`instrumento${instrumento === it.id ? ' activo' : ''}`}
                  aria-pressed={instrumento === it.id}
                  onClick={() => setInstrumento(it.id)}
                >
                  <IconoInstrumento nombre={it.icono} />
                  <span>{it.nombre}</span>
                </button>
              </li>
            ))}
          </ul>

          {/*
            El modelo del instrumento que tiene en la mano, y solo ese.
            Trece modelos cargando a la vez en la bandeja dejarían la consola
            inservible en un portátil modesto, que es el equipo de referencia
            del residente: se baja uno cada vez, cuando lo coge.
          */}
          {instrumentoElegido && (instrumentoElegido.modeloUrl || instrumentoElegido.descripcion) ? (
            <div className="consola-instrumento">
              {instrumentoElegido.modeloUrl ? (
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
              ) : null}
              {instrumentoElegido.descripcion ? (
                <p className="consola-instrumento-texto">{instrumentoElegido.descripcion}</p>
              ) : null}
            </div>
          ) : null}

          {terminado ? (
            <div className="consola-fin">
              <strong>Caso terminado.</strong>
              <p>
                {puntaje} de {maximo} puntos.
              </p>
              {/* Terminar no puede ser un callejón: hasta aquí lo único que
                  quedaba era la miga de arriba del todo, fuera de la vista
                  después de seiscientos píxeles de consola. */}
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
                Su puntaje y sus complicaciones quedan guardados: los encontrará
                al volver a este caso y en su portada.
              </p>
              <button
                type="button"
                className="consola-boton consola-boton-ancho"
                onClick={reiniciar}
              >
                Repetir el caso
              </button>
              <p>
                <Link href="/simulador">Volver a la lista de casos</Link>
              </p>
            </div>
          ) : (
            <div className="consola-objetivo">
              <h3 className="consola-subtitulo">
                Paso {indice + 1} · {paso.titulo}
              </h3>
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
                  onClick={() => mando.current?.borrarTrazo()}
                >
                  Borrar trazo
                </button>
              ) : null}

              {objetivo === 'reduccion' ? (
                <div className="consola-angulacion">
                  {/* El ratón traslada, que es un gesto de dos ejes; una
                      rotación tiene tres. Sin estos mandos, un caso que empieza
                      angulado no se podría reducir por mucho que se arrastrara,
                      y el residente no entendería por qué. */}
                  <p className="consola-instruccion">
                    Arrastre el fragmento para alinearlo y corrija la angulación aquí.
                  </p>
                  {(
                    [
                      ['z', 'Varo / valgo'],
                      ['x', 'Ante / recurvatum'],
                      ['y', 'Rotación'],
                    ] as const
                  ).map(([eje, etiqueta]) => (
                    <label key={eje} className="consola-giro">
                      <span>
                        {etiqueta} · {Math.round(giros[eje])}°
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
                    Volver al desplazamiento inicial
                  </button>
                </div>
              ) : null}

              {objetivo === 'fuerza' ? (
                <label className="consola-fuerza">
                  {/* El rango se enseña antes de aplicar, como ya se hace con
                      el trazo. Escondido, el residente exploraba el deslizador
                      —que es lo que se hace con un deslizador—, se pasaba, y la
                      consola le anotaba como complicación quirúrgica una
                      adivinanza que ella misma le había obligado a hacer
                      teniendo el rango guardado a mano. */}
                  <span>
                    Fuerza · {fuerza} N{rangoUtil ? ` · rango útil ${rangoUtil}` : ''}
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
                Aplicar paso
              </button>

              {/* Lo que acaba de pasar, donde el residente está mirando. El
                  registro completo sigue en el pie, que en este portátil queda
                  por debajo del pliegue. */}
              <div role="status" aria-live="polite">
                {resultado ? (
                  <ul className="consola-registro consola-registro-ultimo">
                    <li className={resultado.clase}>{resultado.texto}</li>
                  </ul>
                ) : null}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ---------------------------------------------------------- pasos */}
      <ol className="consola-pasos">
        {caso.pasos.map((p, i) => (
          <li
            key={p.id}
            className={`consola-paso${i === indice ? ' actual' : ''}${
              resueltos.has(p.id) ? ' resuelto' : ''
            }`}
          >
            <span className="consola-paso-numero">Paso {i + 1}</span>
            <span className="consola-paso-titulo">{p.titulo}</span>
            {p.faseNombre ? <span className="consola-paso-fase">{p.faseNombre}</span> : null}
          </li>
        ))}
      </ol>

      {/* ------------------------------------------------- retroalimentación */}
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
                <h4>Estructura o principio en juego</h4>
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
            <ul className="consola-registro">
              {registro.map((linea, i) => (
                <li key={i} className={linea.clase}>
                  {linea.texto}
                </li>
              ))}
            </ul>
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
              {recorridoGuardado.puntajeMaximo !== null
                ? ` de ${recorridoGuardado.puntajeMaximo}`
                : ''}{' '}
              {recorridoGuardado.puntaje === 1 ? 'punto' : 'puntos'} ·{' '}
              {recorridoGuardado.complicaciones.length === 0
                ? 'ninguna complicación'
                : `${recorridoGuardado.complicaciones.length} ${
                    recorridoGuardado.complicaciones.length === 1
                      ? 'complicación'
                      : 'complicaciones'
                  }`}
              . Es lo último que quedó guardado de este caso; el marcador de
              arriba cuenta el recorrido de ahora.
            </p>
            {recorridoGuardado.complicaciones.length > 0 ? (
              <ul className="consola-registro">
                {recorridoGuardado.complicaciones.map((complicacion, i) => (
                  <li key={`${complicacion.paso}-${i}`} className="grave">
                    {complicacion.numero ? `${complicacion.numero}. ` : ''}
                    {complicacion.detalle ??
                      complicacion.titulo ??
                      'Complicación sin detalle guardado.'}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  )
}

