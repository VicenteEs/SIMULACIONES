'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  evaluarGesto,
  fuerzaInicial,
  instruccionDelPaso,
  objetivoDelPaso,
  puntajeMaximo,
  RESULTADOS,
  type Objetivo,
  type PasoQuirurgico,
} from '@/lib/simulador'
import { desplazamientoCompleto, largoDelTrazo, medirReduccion, type EjeLargo } from '@/lib/reduccion'
import { Rico, tieneContenido } from '@/components/Rico'
import { IconoInstrumento } from './IconoInstrumento'
// El visor del instrumento reutiliza el de las fichas, ya partido en su propio
// trozo de JavaScript: se descarga cuando el residente coge un instrumento que
// tiene modelo, y no antes.
import { Visor3D } from '@/components/VisoresPerezosos'
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
 * La aritmética no está aquí. La evaluación vive en `@/lib/simulador` y las
 * medidas de la reducción en `@/lib/reduccion`, las dos probadas sin navegador,
 * porque son la parte que puede estar mal sin que se note.
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

/**
 * Lo que un paso declara ver, heredando del último que dijera algo.
 *
 * Es la promesa que el panel le hace al traumatólogo: «Deje la lista vacía para
 * que se vea lo mismo que en el paso anterior» (`Cirugias.ts`). Está fuera del
 * componente y exportada porque es regla de dominio y no de pintado, y porque
 * así se puede probar sin navegador; su sitio definitivo es
 * `src/lib/piezasDelCaso.ts`, junto a sus hermanas.
 */
export function declaracionDelPaso(
  pasos: Array<{ muestra?: string[] }>,
  indicePaso: number,
): string[] | null {
  for (let i = indicePaso; i >= 0; i--) {
    const muestra = pasos[i]?.muestra
    if (muestra && muestra.length > 0) return muestra
  }
  return null
}

/**
 * Qué nodos se encienden ahora, y qué capas hubo que devolver a la vista.
 *
 * El cruce con las capas apagadas tiene un suelo, y el suelo es lo que arregla
 * el fallo: sin él, un paso que declara ver solo la piel —una incisión se traza
 * sobre la piel, es exactamente lo que el traumatólogo va a escribir— salía de
 * aquí como lista vacía, y `mostrar([])` apaga TODAS las mallas del modelo. El
 * lienzo se quedaba gris sin un mensaje, «Encuadrar» no respondía porque no hay
 * caja que encuadrar, y la única salida era una casilla del panel izquierdo que
 * nadie relaciona con lo que acaba de pasar. Antes que no enseñar nada, se
 * enciende lo que haga falta y se dice por qué.
 */
export function visibilidadDelPaso(
  pasos: Array<{ muestra?: string[] }>,
  piezas: PiezaDelCaso[],
  indicePaso: number,
  capasApagadas: Set<string>,
): { nodos: string[] | null; encender: string[] } {
  const declarados = declaracionDelPaso(pasos, indicePaso)
  const base = declarados ?? piezas.filter((p) => p.rol !== 'implante').map((p) => p.nodo)
  // Un caso sin piezas escritas no es un caso sin nada que ver: es uno cuya
  // lista todavía no se ha rellenado. `null` enseña el modelo entero, que es lo
  // único útil que se puede hacer con él; `[]` lo apagaría del todo.
  if (base.length === 0) return { nodos: null, encender: [] }

  const rolDe = new Map(piezas.map((p) => [p.nodo, p.rol]))
  const visibles = base.filter((nodo) => {
    const rol = rolDe.get(nodo)
    return !rol || !capasApagadas.has(rol)
  })
  if (visibles.length > 0) return { nodos: visibles, encender: [] }

  const encender: string[] = []
  for (const nodo of base) {
    const rol = rolDe.get(nodo)
    if (rol && capasApagadas.has(rol) && !encender.includes(rol)) encender.push(rol)
  }
  return { nodos: base, encender }
}

/**
 * Las capas apagadas que el paso declara ver: al entrar en él se encienden.
 *
 * El paso manda sobre el interruptor, que es para lo que existe `muestra`. Al
 * revés —restando las capas a lo que el paso declara— una incisión escrita
 * sobre la piel acababa trazada sobre el hueso desnudo, y lo único que lo
 * indicaba era una casilla desmarcada en la otra punta de la pantalla.
 */
export function capasQueEnciendeElPaso(
  pasos: Array<{ muestra?: string[] }>,
  piezas: PiezaDelCaso[],
  indicePaso: number,
  capasApagadas: Set<string>,
): string[] {
  const declarados = declaracionDelPaso(pasos, indicePaso)
  if (!declarados) return []
  const rolDe = new Map(piezas.map((p) => [p.nodo, p.rol]))
  const roles: string[] = []
  for (const nodo of declarados) {
    const rol = rolDe.get(nodo)
    if (rol && capasApagadas.has(rol) && !roles.includes(rol)) roles.push(rol)
  }
  return roles
}

/** «la piel», «la piel y el músculo»: para escribirlo dentro de una frase. */
function capasEnProsa(roles: string[]): string {
  const nombres = roles.map((rol) => CAPAS.find((c) => c.rol === rol)?.enProsa ?? rol)
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * Los topes del deslizador de fuerza.
 *
 * El 0-120 fijo que había aquí era un número inventado, y con un paso de
 * `fuerzaMinima: 200` el rótulo se quedaba en «Fuerza · 200 N» con el pulgar
 * clavado en el tope: el residente no podía acertar nunca. Se acota al rango
 * del paso, pero **con margen a los dos lados**, y el margen es la parte que no
 * se puede quitar: un deslizador que empieza y acaba dentro de la ventana buena
 * aprueba cualquier posición, y un paso en el que no se puede fallar no enseña
 * nada, que es justo lo contrario de D-059.
 */
export function rangoDelDeslizadorDeFuerza(paso: PasoQuirurgico): { min: number; max: number } {
  const { fuerzaMinima: minima, fuerzaMaxima: maxima } = paso
  if (typeof minima === 'number' && typeof maxima === 'number') {
    const margen = Math.max(5, Math.round((maxima - minima) / 2))
    return { min: Math.max(0, Math.round(minima - margen)), max: Math.round(maxima + margen) }
  }
  // Con un solo extremo declarado, el otro lado no existe; el declarado hay que
  // poder cruzarlo igual, por arriba o por abajo.
  if (typeof minima === 'number') {
    return { min: Math.max(0, Math.round(minima / 2)), max: Math.round(minima * 2) + 5 }
  }
  if (typeof maxima === 'number') return { min: 0, max: Math.round(maxima * 1.5) + 5 }
  // Sin ningún tope cualquier fuerza vale. `Cirugias.ts` no deja publicar un
  // paso de fuerza así, pero la API puede devolver uno antiguo.
  return { min: 0, max: 120 }
}

/** El rango bueno, escrito para el rótulo del deslizador. */
function rangoUtilEnTexto(paso: PasoQuirurgico): string | null {
  const { fuerzaMinima: minima, fuerzaMaxima: maxima } = paso
  if (typeof minima === 'number' && typeof maxima === 'number') {
    return `rango útil ${minima}–${maxima} N`
  }
  if (typeof minima === 'number') return `rango útil: desde ${minima} N`
  if (typeof maxima === 'number') return `rango útil: hasta ${maxima} N`
  return null
}

export function ConsolaQuirurgica({ caso }: { caso: CasoDeConsola }) {
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
  // Los pasos que se fallaron alguna vez. Son estos y no los resueltos los que
  // deciden lo que vale el acierto: ver `aplicarPaso`.
  const [fallados, setFallados] = useState<Set<string>>(new Set())
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

  // La escala, una sola vez y con su guarda. Un cero escrito a mano en el caso
  // no es `undefined`, así que el valor por omisión de `largoDelTrazo` no lo
  // repone: la incisión mediría 0 mm siempre y el paso sería insuperable.
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
      // Pulsar sin instrumento no cuenta. Ahí la consola se para antes de
      // evaluar nada —no llegó a tocarse al paciente— y ese aviso es ahora el
      // que explica el botón que antes estaba gris y mudo: cobrárselo sería
      // cobrar por leer la instrucción.
      if (evaluacion.resultado !== RESULTADOS.SIN_INSTRUMENTO) {
        setFallados((previos) => (previos.has(paso.id) ? previos : new Set(previos).add(paso.id)))
      }
      return
    }

    // El motor no tiene memoria: evalúa un gesto suelto y entrega siempre el
    // valor entero del paso (ver `Evaluacion.puntos` en `simulador.ts`). Quien
    // decide cuánto se cobra es la consola, y lo decide por los fallos previos.
    //
    // La mitad, y no cero, a propósito: acertar después de que la consola te
    // corrija sigue siendo haber aprendido el gesto, y cero igualaría al que se
    // atasca con el que abandona. Lo que no puede seguir pasando es que el que
    // acierta a la primera y el que aporrea el botón terminen con el mismo
    // número, porque el registro que los distinguía se pierde a las diez líneas
    // y no se guarda en ninguna parte.
    //
    // Lo que esto cuesta, y hay que saberlo antes de tocarlo: `puntajeMaximo`
    // suma los pasos enteros, así que el «/ máximo» de la barra deja de ser
    // alcanzable en cuanto se falla un paso. Se acepta a sabiendas —ese tope es
    // la referencia del caso, no una promesa de que se pueda igualar—, pero son
    // dos cuentas de lo mismo en dos sitios: quien cambie una tiene que mirar
    // la otra o el marcador se queda mintiendo.
    const puntos = fallados.has(paso.id) ? Math.floor(evaluacion.puntos / 2) : evaluacion.puntos
    if (!resueltos.has(paso.id)) {
      setPuntaje((n) => n + puntos)
      setResueltos((previos) => new Set(previos).add(paso.id))
    }

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
   * Solo se pinta el tope que el paso trae escrito. Repetir aquí los valores
   * por omisión de `evaluarGesto` —el 5, y la diástasis heredando el tope del
   * desplazamiento— sería la forma segura de que un día enseñe un número y se
   * mida contra otro. En la práctica toda fila los trae: los tres campos tienen
   * `defaultValue: 5` en `Cirugias.ts`.
   */
  const lineaDeTope = (valor: number, tope: number | null | undefined, unidad: 'mm' | '°') => {
    if (typeof tope !== 'number') return null
    const fuera = valor > tope
    return (
      <dd className="consola-desglose" style={fuera ? { color: 'var(--ambar)' } : undefined}>
        tope {unidad === '°' ? `${tope}°` : `${tope} mm`} · {fuera ? 'se pasa' : 'dentro'}
      </dd>
    )
  }

  /** La incisión trazada contra el rango que pide el paso. */
  const lineaDelTrazo = () => {
    if (objetivo !== 'trazo' || !paso) return null
    const { trazoMinimo: minimo, trazoMaximo: maximo } = paso
    if (typeof minimo !== 'number' && typeof maximo !== 'number') return null
    const pedido =
      typeof minimo === 'number' && typeof maximo === 'number'
        ? `objetivo ${minimo}–${maximo} mm`
        : typeof minimo === 'number'
          ? `objetivo: desde ${minimo} mm`
          : `objetivo: hasta ${maximo} mm`
    if (largoDelTrazoMm <= 0) {
      return <dd className="consola-desglose">{pedido} · sin trazar</dd>
    }
    const corta = typeof minimo === 'number' && largoDelTrazoMm < minimo
    const larga = typeof maximo === 'number' && largoDelTrazoMm > maximo
    return (
      <dd
        className="consola-desglose"
        style={corta || larga ? { color: 'var(--ambar)' } : undefined}
      >
        {pedido} · {corta ? 'corta' : larga ? 'larga' : 'dentro'}
      </dd>
    )
  }

  const ayudaDelModo = MODOS.find((m) => m.valor === modo)?.ayuda ?? ''
  const etiquetaDelModoDelPaso = MODOS.find((m) => m.valor === modoDelPaso)?.etiqueta ?? null
  const topesDelDeslizador = paso ? rangoDelDeslizadorDeFuerza(paso) : { min: 0, max: 120 }
  const rangoUtil = paso ? rangoUtilEnTexto(paso) : null

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
            que el acierto tras un fallo cobra la mitad (ver `aplicarPaso`). O
            sea: este número es la referencia del caso, y en cuanto se falla un
            paso ya no se puede igualar. Está puesto así a propósito; lo que no
            se puede hacer es cambiar una de las dos cuentas sin la otra. */}
        <div className="consola-puntaje">
          <span className="consola-puntaje-numero">{puntaje}</span>
          <span className="consola-puntaje-total">/ {maximo}</span>
          <button type="button" className="consola-boton" onClick={reiniciar}>
            Reiniciar caso
          </button>
        </div>
      </header>

      <div className="consola-cuerpo">
        {/* ------------------------------------------------ panel izquierdo */}
        <aside className="consola-panel consola-panel-izq">
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
              {objetivo === 'reduccion'
                ? lineaDeTope(reduccion.desplazamiento, paso?.toleranciaDesplazamiento, 'mm')
                : null}
            </div>
            <div>
              <dt>Angulación</dt>
              <dd>{reduccion.angulacion}°</dd>
              {objetivo === 'reduccion'
                ? lineaDeTope(reduccion.angulacion, paso?.toleranciaAngulacion, '°')
                : null}
            </div>
            <div>
              <dt>Diástasis</dt>
              <dd>{reduccion.diastasis} mm</dd>
              {objetivo === 'reduccion'
                ? lineaDeTope(reduccion.diastasis, paso?.toleranciaDiastasis, 'mm')
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
              <p>
                {fallados.size === 0
                  ? 'Todos los pasos a la primera.'
                  : `Hubo que repetir ${fallados.size} ${
                      fallados.size === 1 ? 'paso' : 'pasos'
                    } de ${caso.pasos.length}; las correcciones están en la retroalimentación clínica, debajo.`}
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
                    Fuerza · {fuerza} N{rangoUtil ? ` · ${rangoUtil}` : ''}
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
                  <ul className="consola-registro" style={{ marginTop: 12 }}>
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
      </div>
    </section>
  )
}

/** Las medidas del caso recién abierto, antes de tocar nada. */
function medidaInicial(caso: CasoDeConsola) {
  const d = desplazamientoCompleto(caso.desplazamientoInicial)
  return medirReduccion(
    { x: d.x, y: d.y, z: d.z },
    { x: d.giroX, y: d.giroY, z: d.giroZ },
    caso.ejeLargo,
  )
}
