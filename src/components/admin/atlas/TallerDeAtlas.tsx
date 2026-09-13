'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import type { CatalogoDelAtlas, PiezaDelAtlas, VistaDeInstancia } from '@/atlas/formato'
import { VISTA_INICIAL } from '@/atlas/formato'
import { ArbolAnatomico } from '@/components/atlas/ArbolAnatomico'
import type { MandoDelVisor } from '@/components/atlas/VisorAtlas'
import {
  duplicarInstancia,
  eliminarInstancia,
  exportarComoModelo,
  guardarInstancia,
  listarInstancias,
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
 * deshace las dos mitades a la vez, sin que nada falle ni se note en desarrollo.
 *
 * Lo limpio sería que `cargarCatalogo` —que es un `fetch` y nada más— viviera
 * en un módulo sin three, y que lo importaran de ahí sus dos usuarios, este
 * taller y `VisorInstancia`. Mientras siga donde está, el `import()` es lo que
 * mantiene la promesa.
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
const HOLGURA_ENCUADRE = 0.002

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

  const [instancia, setInstancia] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [vistaInicial, setVistaInicial] = useState<VistaDeInstancia>(VISTA_INICIAL)

  const [guardadas, setGuardadas] = useState<ResumenDeInstancia[]>([])
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
  const [exportado, setExportado] = useState<{
    nombre: string
    bytes: number
    nodos: string[]
    perdidas: string[]
  } | null>(null)

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
    vista: VistaDeInstancia
  }>({ nombre: '', descripcion: '', piezas: '', vista: VISTA_INICIAL })

  const clavePiezas = useMemo(() => [...visibles].sort().join(','), [visibles])

  const sucio =
    catalogo !== null &&
    (clavePiezas !== referencia.piezas ||
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
    (piezas: Set<string>, titulo: string, texto: string, vista: VistaDeInstancia) => {
      setReferencia({
        nombre: titulo.trim(),
        descripcion: texto.trim(),
        piezas: [...piezas].sort().join(','),
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
    const antes = referencia.vista
    return (
      ahora.camara.some((n, i) => Math.abs(n - antes.camara[i]) > HOLGURA_ENCUADRE) ||
      ahora.objetivo.some((n, i) => Math.abs(n - antes.objetivo[i]) > HOLGURA_ENCUADRE)
    )
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

  // --- acciones -------------------------------------------------------------
  /**
   * Vuelve al cuerpo completo.
   *
   * `preguntar` es false cuando llega desde otra acción que ya preguntó, como
   * eliminar la preparación abierta: encadenar dos confirmaciones seguidas por
   * el mismo gesto enseña a pulsar «aceptar» sin leer.
   */
  const empezarDeCero = (preguntar = true) => {
    if (!catalogo) return
    if (preguntar && !confirmarDescarte('Se volverá al cuerpo completo, sin nombre.')) return
    const todas = new Set(catalogo.piezas.map((p) => p.id))
    setInstancia(null)
    setNombre('')
    setDescripcion('')
    setVisibles(todas)
    setSeparacion(0)
    setVistaInicial(VISTA_INICIAL)
    mando.current?.irA(VISTA_INICIAL)
    fijarReferencia(todas, '', '', VISTA_INICIAL)
    limpiarExportacion()
    setAviso(null)
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
        setInstancia(r.datos.id)
        setNombre(r.datos.nombre)
        setDescripcion(r.datos.descripcion ?? '')
        setVisibles(new Set(r.datos.contenido.piezas.map((p) => p.id)))
        setSeparacion(r.datos.contenido.vista.separacion)
        setVistaInicial(r.datos.contenido.vista)
        limpiarExportacion()
        fijarReferencia(
          new Set(r.datos.contenido.piezas.map((p) => p.id)),
          r.datos.nombre,
          r.datos.descripcion ?? '',
          r.datos.contenido.vista,
        )
        // Y además se le ordena al visor que vaya: la escena ya está montada y
        // no se vuelve a montar, así que sin esto la cámara se quedaba donde
        // estuviera. Como al guardar se escribe la cámara actual, abrir una
        // preparación y volver a guardarla borraba su encuadre sin avisar.
        mando.current?.irA(r.datos.contenido.vista)
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
      const vista = mando.current?.vistaActual() ?? { ...VISTA_INICIAL, separacion }
      try {
        const r = await guardarInstancia(instancia, {
          nombre,
          descripcion,
          piezas: [...visibles],
          vista,
        })
        if (!r.exito || !r.datos) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo guardar.' })
          return
        }
        setInstancia(r.datos.id)
        // Lo recién guardado pasa a ser la referencia: ya no hay nada que
        // perder.
        fijarReferencia(visibles, nombre, descripcion, vista)
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
        const r = await exportarComoModelo(instancia, { protagonistas: protagonistasVivas })
        if (!r.exito || !r.datos) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo exportar.' })
          return
        }
        setExportado(r.datos)
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
   */
  const candidatas = useMemo<{ lista: PiezaDelAtlas[]; total: number }>(() => {
    if (!catalogo) return { lista: [], total: 0 }
    const busca = filtroProtagonista.trim().toLowerCase()
    const encendidas = catalogo.piezas
      .filter((p) => visibles.has(p.id))
      .filter((p) => !busca || p.nombre.toLowerCase().includes(busca))
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
              <label className="atlas-casilla" key={pieza.id}>
                <input
                  type="checkbox"
                  checked={protagonistas.has(pieza.id)}
                  onChange={(e) => {
                    setProtagonistas((antes) => {
                      const ahora = new Set(antes)
                      if (e.target.checked) ahora.add(pieza.id)
                      else ahora.delete(pieza.id)
                      return ahora
                    })
                  }}
                />
                <span>{pieza.nombre}</span>
              </label>
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
              <ul>
                {exportado.nodos.map((n) => (
                  <li key={n}>
                    <code>{n}</code>
                  </li>
                ))}
              </ul>
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
      <div role="status">
        {aviso ? (
          <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div>
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

      <div className="atlas-marco">
        <aside className="atlas-panel">
          <ArbolAnatomico
            catalogo={catalogo}
            visibles={visibles}
            alCambiarVisibles={setVisibles}
            resaltada={resaltada}
            alResaltar={setResaltada}
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
            // Pulsar una pieza en el visor la apaga: es el gesto directo de
            // «esto me estorba, fuera».
            alPulsarPieza={(id) => {
              const nuevas = new Set(visibles)
              nuevas.delete(id)
              setVisibles(nuevas)
            }}
          />

          <div className="atlas-mandos">
            <label className="atlas-separador-mando">
              <span>Separar</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(separacion * 100)}
                onChange={(e) => setSeparacion(Number(e.target.value) / 100)}
              />
              <span className="atlas-separador-valor">{Math.round(separacion * 100)}%</span>
            </label>
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
              Se guardan las piezas encendidas, el encuadre de la cámara y la separación. El atlas
              original no se toca: lo que apague aquí se puede volver a encender siempre.
            </p>
          </div>

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
                        if (
                          !confirm(
                            `¿Eliminar «${g.nombre}»? No se puede deshacer.\n\n` +
                              'Si alguna ficha publicada la usa, su visor se quedará vacío.',
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
