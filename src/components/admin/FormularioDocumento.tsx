'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  EyeOff,
  ExternalLink,
  Trash2,
  CircleDot,
  CloudOff,
  Loader2,
} from 'lucide-react'
import { coleccionesRelacionadasDe, estadoEnPalabras, type EsquemaDeColeccion } from '@/admin/esquema'
import { faltantes } from '@/admin/depurar'
import { nuevaClave } from '@/admin/identidadDeBloques'
import { estaVacio } from '@/lib/textoRico'
import { marcaDe, MENSAJE_DE_CONFLICTO, type Marca } from '@/admin/concurrencia'
import { apuntarCambiosSinGuardar, PREGUNTA_DE_SALIDA } from '@/admin/salidaDelEditor'
import {
  cambiarPublicacion,
  duplicarDocumento,
  eliminarDocumento,
  guardarDocumento,
  opcionesDeRelacion,
} from '@/app/(frontend)/acciones/contenido'
import { marcarListaParaPublicar } from '@/app/(frontend)/acciones/revision'
import { palabrasPorSeccion } from '@/lib/revision'
import type { RevisionParaElEditor } from '@/lib/revisionServidor'
import {
  claveDeCopia,
  GUARDADO_AUTOMATICO_CADA_MS,
  horaDe,
  motivoParaNoGuardarSolo,
  pareceCorteDeRed,
  renovarClaves,
  type EstadoDelEditor,
  type MotivoParaNoGuardarSolo,
} from '@/lib/guardadoAutomatico'
import { useConfirmar } from '@/components/ui/Confirmar'
import { useAvisos } from '@/components/ui/Avisos'
import { MenuAcciones, type OpcionDeMenu } from '@/components/ui/MenuAcciones'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { FilaDeCampos, type Relaciones } from './formulario/Campos'
import { RevisionEnElEditor } from './RevisionEnElEditor'
import { useSeguimientoDeRevision } from './useSeguimientoDeRevision'
import { useCopiaLocal } from './useCopiaLocal'
import { usePresencia } from './usePresencia'
import {
  BandaDePresencia,
  BandaDeRecuperacion,
  BandaSinConexion,
  enumerar,
  Hace,
  IndicadorDePresencia,
  useEnLinea,
} from './AvisosDelEditor'
import '@/app/(frontend)/admin-panel/editor.css'

/**
 * Editor de un documento, sea de la colección que sea.
 *
 * Todo el documento vive en un solo objeto de estado y se envía entero al
 * guardar. Eso hace que agregar un campo al esquema no obligue a tocar nada
 * aquí, y que el borrador sea siempre coherente: no hay campos que se guarden
 * por su cuenta antes que el resto.
 *
 * Publicar y guardar son dos botones distintos a propósito (D-011): el
 * traumatólogo escribe a lo largo de varios días y nadie debe leer una ficha a
 * medio escribir por el hecho de haberla guardado.
 *
 * Alrededor del formulario hay tres cosas que no son el documento: la copia
 * local y el guardado automático (`src/lib/guardadoAutomatico.ts`), la
 * presencia de otros editores en la misma ficha (`src/lib/presencia.ts`) y la
 * barra fija con el estado y las acciones, que sigue a la vista mientras se
 * escribe en la quinta pestaña.
 */

/**
 * Qué se pinta cuando la acción de servidor no llega a responder.
 *
 * `accion()` (`src/lib/guardias.ts`) envuelve en una `Respuesta` todo lo que
 * ella ve fallar, pero lo que se cae antes de llegar a ella —la red cortada, la
 * sesión caducada, un cuerpo que Next rehúsa— sale como excepción dentro de la
 * transición y nadie la esperaba: se perdía en la consola del navegador, el
 * botón volvía de «Guardando…» a «Publicar» y la pantalla quedaba idéntica a
 * una en la que el guardado hubiera salido bien. En una ficha con media hora de
 * redacción encima, eso es dar por guardado lo que no se guardó. Es el mismo
 * trato que la subida de archivo ya recibe en `formulario/Campos.tsx`.
 */
const motivoDeLaCaida = (fallo: unknown, porOmision: string): string =>
  fallo instanceof Error && fallo.message
    ? `${porOmision} ${fallo.message}`
    : `${porOmision} Compruebe la conexión e inténtelo otra vez.`

/** Lo que se dice cuando el guardado no llegó porque no hay red. */
const SIN_RED_AL_GUARDAR =
  'No se pudo guardar: no hay conexión con el servidor. Lo escrito sigue en pantalla y en una copia de este navegador; guarde otra vez cuando vuelva la conexión.'

/** Por qué no se guarda sola, dicho en la barra en pocas palabras. */
const MOTIVO_EN_PALABRAS: Partial<Record<MotivoParaNoGuardarSolo, string>> = {
  nueva: 'ficha nueva: se crea al guardarla',
  'no-versionada': 'aquí guardar es publicar: no se guarda sola',
  publicada: 'publicada: no se guarda sola',
  lista: 'validada: no se guarda sola',
}

export function FormularioDocumento({
  esquema,
  documento,
  id,
  rutaPublica,
  revision = null,
  esAdmin = false,
  usuarioId,
}: {
  esquema: EsquemaDeColeccion
  documento: Record<string, unknown>
  id: string | null
  rutaPublica: string | null
  /**
   * La revisión de la ficha, si está en revisión (D-142). Con ella, el editor
   * no ofrece «Publicar» sino «Listo para publicar», mide el tiempo de revisión
   * y enseña de dónde salió el texto.
   */
  revision?: RevisionParaElEditor | null
  /** Rol real de quien edita: el administrador publica lo validado y gobierna la revisión. */
  esAdmin?: boolean
  /** Quién edita, para que la copia local de una persona no se le ofrezca a otra. */
  usuarioId: string
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const avisar = useAvisos()

  const [valores, setValores] = useState<Record<string, unknown>>(documento)
  const [seccion, setSeccion] = useState(0)
  const [relaciones, setRelaciones] = useState<Relaciones>({})
  const [sucio, setSucio] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const avisoRef = useRef<HTMLDivElement>(null)

  /**
   * Cuántas veces se ha tocado un campo.
   *
   * Es un contador y no una copia de `valores` porque lo que hay que saber al
   * volver del guardado es si hubo teclas nuevas, y el cierre de la transición
   * se quedó con el `valores` del render en que se pulsó el botón.
   */
  const ediciones = useRef(0)

  /**
   * Identidad del último documento que llegó del servidor, para distinguir «el
   * prop trae algo nuevo» de «este componente se volvió a pintar».
   */
  const ultimoDelServidor = useRef(documento)

  /**
   * El `updatedAt` de la última versión de esta ficha que esta pantalla conoce:
   * la que abrió, o la que acaba de escribir ella misma. Ver
   * `src/admin/concurrencia.ts`.
   *
   * Se renueva con lo que devuelven sus propias escrituras —guardar y retirar—
   * y no con lo que llega en cada refresco. El refresco llega también con
   * cambios pendientes en pantalla, y puede traer ya lo que otra persona
   * guardó: adoptar su marca entonces sería dar por visto lo que nadie ha
   * visto, y el siguiente guardado lo borraría sin choque. Hay tres
   * excepciones. El efecto de abajo la toma del servidor solo cuando también
   * toma de él los valores: en ese caso lo que hay en pantalla ES lo del
   * servidor. `recargarConservandoLoEscrito` adopta la del choque, porque ahí
   * quien pulsa ya sabe que va a reemplazar otra versión y lo ha decidido. Y
   * recuperar una copia local pone la marca **de la copia**, que es la versión
   * sobre la que se escribió: así, si alguien guardó después, el guardado
   * siguiente choca en vez de pisarlo.
   *
   * Es un `ref` y no estado porque no se pinta: cambiarla no debe repintar.
   */
  const marca = useRef<Marca>(marcaDe(documento))

  /**
   * El choque abierto, si lo hay, con la marca que había en la base cuando
   * ocurrió.
   *
   * Va aparte de `aviso` porque `cambiar` borra el aviso con cada tecla, y este
   * no se puede ir solo: mientras no se resuelva, cualquier guardado vuelve a
   * chocar, y quitarle a la persona el botón de recargar en cuanto escribe una
   * letra la dejaría sin salida.
   */
  const [conflicto, setConflicto] = useState<{ marcaActual: Marca; texto: string } | null>(null)
  const conflictoRef = useRef<HTMLDivElement>(null)
  const botonGuardarRef = useRef<HTMLButtonElement>(null)
  /**
   * Si el choque que viene debe llevarse el foco. Sí cuando lo provoca un
   * botón; no cuando lo provoca el guardado automático, que llega mientras la
   * persona escribe en otro campo: arrancarle el cursor a media frase sería
   * peor que el choque. Ese queda igual de visible, en la barra fija.
   */
  const enfocarAlChocar = useRef(true)

  const publicado = documento._status === 'published' || !esquema.versionada

  // --- revisión (D-142) ------------------------------------------------------
  const enRevision = revision !== null && id !== null
  const [nota, setNota] = useState('')
  const seguimiento = useSeguimientoDeRevision({
    activo: enRevision,
    coleccion: esquema.slug,
    id,
    seccion: esquema.secciones[seccion]?.titulo ?? '',
  })
  /** Las pestañas que quien edita ya revisó: las de sesiones anteriores y las de esta. */
  const vistas = useMemo(
    () => new Set([...(revision?.mio.vistas ?? []), ...seguimiento.vistasAqui]),
    [revision, seguimiento.vistasAqui],
  )

  // --- copia local, conexión y guardado automático ---------------------------
  const copia = useCopiaLocal({
    clave: claveDeCopia(usuarioId, esquema.slug, id),
    sucio,
    valores,
    ediciones,
    marca,
    servidor: { marca: marcaDe(documento), valores: documento },
  })
  const enLinea = useEnLinea()
  /**
   * El último guardado no llegó por falta de red, aunque el navegador diga que
   * la hay: el wifi conectado y el túnel caído. Se limpia con el siguiente
   * guardado que llega o cuando el navegador avisa de que volvió la red.
   */
  const [falloDeRed, setFalloDeRed] = useState(false)
  const conectado = enLinea && !falloDeRed
  const [ultimoGuardado, setUltimoGuardado] = useState<{ en: number; automatico: boolean } | null>(null)
  /** Lo que el servidor rechazó en el último guardado automático, y con cuántas teclas. */
  const [falloAutomatico, setFalloAutomatico] = useState<{ mensaje: string; ediciones: number } | null>(null)
  /** Cuándo empezó lo que está sin guardar: el reloj del guardado automático cuenta desde ahí. */
  const sucioDesde = useRef<number | null>(null)
  const ultimoIntentoAutomatico = useRef(0)

  const presencia = usePresencia({ coleccion: esquema.slug, id })

  /**
   * Colecciones a las que apunta algún campo del esquema o de los bloques.
   *
   * Se deriva del esquema, no se escribe. Escrita a mano se quedó atrás en
   * cuanto llegaron los catálogos del simulador, y los desplegables de hueso,
   * clasificación y técnica abrían vacíos sin decir por qué.
   */
  const coleccionesRelacionadas = useMemo(
    () => coleccionesRelacionadasDe(esquema),
    [esquema],
  )

  /**
   * Colecciones ya pedidas.
   *
   * El esquema cruza de servidor a cliente serializado, así que cada
   * `router.refresh()` —uno por guardado y uno por retirada de publicación— lo
   * deserializa en objetos nuevos: la identidad del prop cambia, el `useMemo`
   * se recalcula y el efecto vuelve a correr entero aunque el contenido sea
   * idéntico. Sin este registro, guardar el borrador de una cirugía disparaba
   * ocho acciones de servidor de hasta 500 documentos cada una —la biblioteca
   * de medios y las instancias del atlas incluidas— para reponer unos
   * desplegables que ya estaban en memoria y no habían cambiado.
   */
  const cargadas = useRef(new Set<string>())

  const cargarRelacion = useCallback(async (coleccion: string, forzar = false) => {
    // `forzar` es para después de subir un archivo: esa lista sí acaba de
    // cambiar y hay que volver a pedirla o lo recién subido no aparece.
    if (!forzar && cargadas.current.has(coleccion)) return
    cargadas.current.add(coleccion)
    const resultado = await opcionesDeRelacion(coleccion)
    if (resultado.exito && resultado.datos) {
      setRelaciones((previas) => ({ ...previas, [coleccion]: resultado.datos! }))
      return
    }
    // Una carga fallida no cuenta como cargada: si se quedara marcada, el
    // desplegable abriría vacío el resto de la sesión y nada volvería a
    // intentarlo.
    cargadas.current.delete(coleccion)
  }, [])

  useEffect(() => {
    // El linter marca esto como «setEstado dentro de un efecto», pero no lo es:
    // `cargarRelacion` escribe el estado después de su `await`, ya fuera del
    // cuerpo del efecto. No sabe mirar a través del `async`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const coleccion of coleccionesRelacionadas) void cargarRelacion(coleccion)
  }, [coleccionesRelacionadas, cargarRelacion])

  /**
   * Vuelve a tomar el documento del servidor cuando el prop trae uno nuevo.
   *
   * El estado nace del prop y después es el prop el que se adelanta: tras
   * guardar, `router.refresh()` trae el documento con los `id` que Payload
   * acaba de asignar a cada fila y a cada bloque, pero no desmonta este
   * componente de cliente, así que `valores` se quedaba sin ellos el resto de
   * la sesión. El siguiente guardado mandaba esas filas sin `id` y Payload las
   * borraba y las recreaba con claves primarias nuevas —justo lo que
   * `depurarCampo` conserva el `id` para evitar—, mientras en pantalla la
   * insignia de publicación seguía al servidor y los campos seguían al estado
   * viejo.
   *
   * Se compara la identidad del prop y no `sucio` a secas: el efecto tiene que
   * correr cuando llega carga nueva del servidor, no cuando se limpia la marca
   * de cambios, o al guardar repondría el documento anterior encima de lo
   * recién escrito hasta que llegara el refresco. Y con cambios sin guardar no
   * se toca nada: el servidor no sabe de ellos y pisarlos es perderlos.
   */
  useEffect(() => {
    if (ultimoDelServidor.current === documento) return
    ultimoDelServidor.current = documento
    if (sucio) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValores(documento)
    marca.current = marcaDe(documento)
    // Sin nada pendiente, lo que se acaba de pintar es la versión del servidor
    // y ya no hay nada que pueda borrarse: el choque, si lo había, se resolvió.
    setConflicto(null)
  }, [documento, sucio])

  // Avisa antes de cerrar la pestaña con cambios sin guardar. Perder media
  // hora de redacción por cerrar una pestaña es un fallo evitable.
  useEffect(() => {
    if (!sucio) return
    const alSalir = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [sucio])

  /**
   * Se apunta como pantalla con cambios sin guardar para que la barra lateral
   * del panel pregunte antes de sacar de aquí (`src/admin/salidaDelEditor.ts`).
   *
   * La barra vive en el `layout.tsx` del panel, fuera de este componente, y sus
   * enlaces se llevaban lo escrito sin una palabra: las migas de abajo
   * preguntaban, y «Contenido» en la barra, a veinte centímetros, no. Se hace
   * por el registro y no pasándole nada a la barra para que ninguna de las dos
   * piezas tenga que saber de la otra.
   *
   * Desapuntarse al limpiar el efecto cubre las dos salidas: el guardado que
   * limpia la marca de cambios y el desmontaje al irse. Sin lo segundo, la
   * barra seguiría preguntando en cualquier pantalla del panel después de
   * haber salido del editor aceptando perder los cambios.
   */
  useEffect(() => {
    if (!sucio) return
    return apuntarCambiosSinGuardar()
  }, [sucio])

  /**
   * `beforeunload` solo cubre cerrar o recargar la pestaña, que es justo lo que
   * nadie hace a media redacción. Una navegación de cliente del App Router no
   * lo dispara, y las dos migas de aquí abajo están tres líneas por encima del
   * título: pulsar «Contenido» para comprobar un dato de otra ficha se llevaba
   * por delante media hora de trabajo sin una sola advertencia.
   *
   * La pregunta vive suelta en `puedeSalir` porque de este componente se sale
   * por dos caminos distintos: las migas y «Duplicar». Una sola frase para los
   * dos, o se responden cosas distintas según por dónde se salga; y es la misma
   * `PREGUNTA_DE_SALIDA` que hace la barra lateral, por la misma razón.
   *
   * Es el diálogo propio (`useConfirmar`) y no `confirm()`, con el botón
   * diciendo lo que hace. Eso la vuelve asíncrona, y las migas ya no pueden
   * esperar la respuesta dentro de su `onNavigate`: cancelan siempre que haya
   * algo pendiente y, si la respuesta es salir, navegan ellas con
   * `router.push`. La barra lateral sigue con su `confirm()` nativo, que no es
   * de este archivo.
   *
   * Aquí se pregunta por `sucio` y no por el registro de
   * `salidaDelEditor.ts`: el registro se pone al día en un efecto, un instante
   * después de la tecla, y esta pantalla ya sabe de primera mano si tiene algo
   * pendiente.
   */
  const puedeSalir = async (): Promise<boolean> =>
    !sucio ||
    confirmar({
      titulo: '¿Salir sin guardar?',
      mensaje: <span className="editor-confirmar-texto">{PREGUNTA_DE_SALIDA}</span>,
      confirmar: 'Salir sin guardar',
      cancelar: 'Seguir editando',
      peligro: true,
    })

  const confirmarSalida = (destino: string) => (evento: { preventDefault: () => void }) => {
    if (!sucio) return
    evento.preventDefault()
    void puedeSalir().then((salir) => {
      if (salir) router.push(destino)
    })
  }

  // Un rechazo al publicar no mueve nada más en la pantalla: el botón vuelve de
  // «Guardando…» a «Publicar» y el foco se queda quieto, de modo que un guardado
  // correcto y uno rechazado se viven igual. Traer el foco al aviso lo anuncia y
  // deja a la persona junto al mensaje, que además es de donde tiene que salir:
  // el propio rechazo cambió de pestaña por debajo con `setSeccion`.
  useEffect(() => {
    if (aviso?.tipo !== 'error') return
    avisoRef.current?.focus()
  }, [aviso])

  // El choque, igual: el guardado vuelve sin mover nada y hay que llevar a la
  // persona a donde están los dos botones que la sacan de ahí. Salvo si lo
  // trajo el guardado automático (`enfocarAlChocar`).
  useEffect(() => {
    if (conflicto && enfocarAlChocar.current) conflictoRef.current?.focus()
  }, [conflicto])

  // Al volver la red se dice, y se olvida el fallo del último guardado: el
  // siguiente intento ya no tiene por qué fallar.
  const sucioAhora = useRef(sucio)
  useEffect(() => {
    sucioAhora.current = sucio
  })
  useEffect(() => {
    const alVolver = () => {
      setFalloDeRed(false)
      // El aviso de «no hay conexión» ya no es verdad.
      setAviso((a) => (a?.texto === SIN_RED_AL_GUARDAR ? null : a))
      avisar(
        'info',
        sucioAhora.current
          ? 'Vuelve a haber conexión. Guarde para llevar al servidor lo que escribió mientras tanto.'
          : 'Vuelve a haber conexión.',
      )
    }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [avisar])

  /**
   * Recarga la ficha sin tocar lo escrito.
   *
   * Adopta la marca que había en la base al chocar y pide al servidor la
   * página otra vez. Los valores no se reponen: el efecto que los toma del
   * prop no los pisa mientras haya cambios pendientes, y eso es lo que se
   * quiere aquí. Lo que sí se pone al día es la insignia de publicación, que
   * puede haber cambiado con lo que guardó la otra persona.
   *
   * Después de esto, guardar reemplaza lo que había. Es una decisión de quien
   * pulsa, y por eso el aviso lo dice con esas palabras y le recuerda que puede
   * ver la otra versión antes: lo que no puede pasar es que ocurra sin que nadie
   * lo sepa, que es lo que pasaba antes del choque.
   */
  const recargarConservandoLoEscrito = () => {
    if (!conflicto) return
    marca.current = conflicto.marcaActual
    setConflicto(null)
    setAviso({
      tipo: 'ok',
      // Sin cambios pendientes el efecto de más arriba sí repone los valores
      // con los del servidor, y decir «lo que usted escribió sigue en
      // pantalla» sería mentir justo sobre lo que la persona está mirando.
      texto: sucio
        ? 'Ficha recargada. Lo que usted escribió sigue en pantalla, todavía sin guardar: al guardar reemplazará la versión que había.'
        : 'Ficha recargada con la versión guardada.',
    })
    // El botón que se acaba de pulsar se desmonta con el bloque del choque y
    // soltaría el foco en el `<body>`. Se lleva antes a guardar, que es lo
    // siguiente que hay que hacer; el aviso de arriba lo anuncia la región viva.
    botonGuardarRef.current?.focus()
    router.refresh()
  }

  const cambiar = (nombre: string, valor: unknown) => {
    ediciones.current += 1
    if (enRevision) seguimiento.contarEdicion()
    if (!sucio && sucioDesde.current === null) sucioDesde.current = Date.now()
    setValores((previos) => ({ ...previos, [nombre]: valor }))
    setSucio(true)
    setAviso(null)
  }

  /**
   * Pone en el formulario la copia local que se ofreció recuperar.
   *
   * Como cambios sin guardar y nada más: guardarla es cosa de quien la
   * recupera. La marca pasa a ser la de la copia —ver `marca`, arriba— y las
   * claves de las filas se renuevan (`renovarClaves`).
   */
  const recuperarCopia = () => {
    const oferta = copia.oferta
    if (!oferta) return
    ediciones.current += 1
    sucioDesde.current = Date.now()
    marca.current = oferta.copia.marca
    setValores(renovarClaves(oferta.copia.valores, nuevaClave))
    setSucio(true)
    copia.cerrarOferta()
    setAviso({
      tipo: 'ok',
      texto: oferta.otraVersion
        ? 'Cambios recuperados, sin guardar. La ficha se guardó después de esa copia: al guardar verá el aviso de choque y podrá comparar.'
        : 'Cambios recuperados. Todavía no están guardados.',
    })
  }

  const descartarCopia = async () => {
    const descartar = await confirmar({
      titulo: '¿Descartar los cambios sin guardar?',
      mensaje: 'Se borra la copia de este navegador. La ficha se queda como está guardada.',
      confirmar: 'Descartar cambios',
      cancelar: 'Conservarlos',
      peligro: true,
    })
    if (!descartar) return
    copia.borrar()
    copia.cerrarOferta()
  }

  /**
   * Primera sección con un campo obligatorio sin llenar.
   *
   * Sin esto, el aviso de «falta el segmento anatómico» aparece arriba
   * mientras el campo está en otra pestaña, y no hay forma de saber dónde
   * mirar. El servidor valida igual —esa es la barrera de verdad—; esto es
   * para que la persona encuentre el campo.
   *
   * `profundo` es lo mismo que separa publicar de guardar (D-011): un borrador
   * tiene cuerpos sin escribir por definición, y arrastrar al traumatólogo a la
   * pestaña de «Manejo» cada vez que guarda a medias sería insoportable.
   */
  const seccionIncompleta = (profundo: boolean): number =>
    esquema.secciones.findIndex(
      (_, indice) => faltantesDeSeccion(esquema, valores, indice, profundo).length > 0,
    )

  /**
   * Guarda la ficha: con un botón, o solo (`automatico`).
   *
   * El guardado automático pasa por aquí y no por un camino propio a
   * propósito: es el mismo «Guardar borrador», con la misma marca, la misma
   * detección de choque y la misma sesión de revisión. Lo único que cambia es
   * que no habla en voz alta —ni avisos, ni foco, ni cambio de pestaña— porque
   * llega mientras la persona escribe en otra cosa. Lo que pasó lo dice la
   * barra fija.
   */
  const guardar = async (publicar: boolean, automatico = false) => {
    if (!automatico) setAviso(null)
    // Publicar lo que ningún revisor validó se deja al administrador (D-142),
    // pero no sin decírselo: queda anotado como «publicada sin validar».
    if (
      publicar &&
      enRevision &&
      revision?.estado !== 'lista' &&
      revision?.estado !== 'publicada' &&
      !(await confirmar({
        titulo: 'Nadie ha validado todavía esta ficha',
        mensaje:
          'Si la publica ahora, quedará anotada en la auditoría como publicada sin validar.',
        confirmar: 'Publicar sin validar',
      }))
    ) {
      return
    }
    const incompleta = seccionIncompleta(publicar)
    if (incompleta >= 0 && !automatico) setSeccion(incompleta)
    enfocarAlChocar.current = !automatico
    // Contra qué se compara al volver. Los campos no se deshabilitan mientras
    // la petición viaja —el cursor no se mueve y seguir escribiendo es lo
    // natural—, así que una tecla más significa que lo tecleado no iba dentro y
    // el documento sigue sucio. Limpiar la marca a ciegas rotulaba «Guardado»,
    // retiraba el aviso de salida y dejaba esas frases fuera de la base sin una
    // sola advertencia.
    const edicionesAlEnviar = ediciones.current
    iniciar(async () => {
      try {
        const resultado = await guardarDocumento(
          esquema.slug,
          id,
          valores,
          publicar,
          marca.current,
          enRevision ? seguimiento.sesion : undefined,
        )
        setFalloDeRed(false)
        if (resultado.conflicto) {
          // No es un campo que falte: no se cambia de pestaña, que dejaría a
          // la persona buscando un error en un sitio donde no está.
          setConflicto({
            marcaActual: resultado.conflicto.marcaActual,
            texto: resultado.mensaje ?? MENSAJE_DE_CONFLICTO,
          })
          if (automatico) avisar('atencion', 'El guardado automático se detuvo: otra persona guardó esta ficha.')
          return
        }
        if (!resultado.exito || !resultado.datos) {
          if (automatico) {
            // Sin aviso ni foco: lo dice la barra, y no se reintenta hasta la
            // siguiente tecla (`falloSinCambiosDesde`).
            setFalloAutomatico({ mensaje: resultado.mensaje ?? 'No se pudo guardar.', ediciones: edicionesAlEnviar })
            return
          }
          // El rechazo ya ocurrió: aquí se busca hondo, porque lo que lo causó
          // puede ser una fila a medias dentro de un bloque.
          const donde = seccionIncompleta(true)
          if (donde >= 0) setSeccion(donde)
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo guardar.' })
          avisar('error', resultado.mensaje ?? 'No se pudo guardar.')
          return
        }
        // La marca de lo que acaba de escribir esta pantalla. Sin esta línea el
        // segundo guardado seguido chocaría consigo mismo: la base ya lleva el
        // `updatedAt` de este guardado y `marca` seguiría con el de la apertura.
        // Se adopta aunque haya teclas nuevas en pantalla: lo que está en la
        // base es lo que esta pantalla mandó, y lo tecleado durante el viaje
        // tampoco lo tiene nadie más.
        marca.current = resultado.datos.marca
        setConflicto(null)
        setFalloAutomatico(null)
        setUltimoGuardado({ en: Date.now(), automatico })
        if (ediciones.current === edicionesAlEnviar) setSucio(false)
        // Lo que la copia local protegía ya está en la base. Con teclas
        // nuevas se queda: la próxima copia la reescribe con ellas.
        if (ediciones.current === edicionesAlEnviar) copia.borrar()
        if (ediciones.current === edicionesAlEnviar) sucioDesde.current = null
        if (id === null) {
          router.replace(`/admin-panel/contenido/${esquema.slug}/${resultado.datos.id}`)
        } else {
          if (!automatico) {
            const texto = publicar ? 'Publicado. Ya es visible para los lectores.' : 'Borrador guardado.'
            setAviso({ tipo: 'ok', texto })
            avisar('ok', texto)
          }
          router.refresh()
        }
      } catch (fallo) {
        const corte = pareceCorteDeRed(fallo, navigator.onLine)
        if (corte) setFalloDeRed(true)
        if (automatico) {
          if (!corte) setFalloAutomatico({ mensaje: motivoDeLaCaida(fallo, 'No se pudo guardar.'), ediciones: edicionesAlEnviar })
          return
        }
        // Sin esto la ficha se quedaba con la marca de «cambios sin guardar»
        // puesta y sin una palabra que dijera por qué: la única señal era que el
        // botón dejaba de decir «Guardando…».
        setAviso({ tipo: 'error', texto: corte ? SIN_RED_AL_GUARDAR : motivoDeLaCaida(fallo, 'No se pudo guardar.') })
      }
    })
  }

  /**
   * El guardado automático en el servidor: cada pocos segundos se pregunta si
   * toca, y toca cuando lleva un minuto sin guardarse algo que se puede
   * guardar solo (`motivoParaNoGuardarSolo`).
   *
   * Los temporizadores leen el estado de un `ref` puesto al día en cada
   * pintado: el `setInterval` se programa una vez y se quedaría con los
   * valores de entonces.
   */
  const estadoAhora: EstadoDelEditor = {
    existe: id !== null,
    versionada: esquema.versionada,
    publicada: publicado,
    sucio,
    conectado,
    hayChoque: conflicto !== null,
    guardando: enCurso,
    estadoDeRevision: revision?.estado ?? null,
    // eslint-disable-next-line react-hooks/refs -- el contador se lee al pintar a propósito: un fallo vale hasta la siguiente tecla, y cada tecla repinta
    falloSinCambiosDesde: falloAutomatico !== null && falloAutomatico.ediciones === ediciones.current,
  }
  const motivoParaNoGuardar = motivoParaNoGuardarSolo(estadoAhora)
  const estadoParaGuardarSolo = useRef<EstadoDelEditor | null>(null)
  const guardarSolo = useRef(guardar)
  useLayoutEffect(() => {
    guardarSolo.current = guardar
    estadoParaGuardarSolo.current = estadoAhora
  })
  useEffect(() => {
    const reloj = window.setInterval(() => {
      const estado = estadoParaGuardarSolo.current
      if (!estado || motivoParaNoGuardarSolo(estado) !== null) return
      const desde = Math.max(sucioDesde.current ?? 0, ultimoIntentoAutomatico.current)
      if (Date.now() - desde < GUARDADO_AUTOMATICO_CADA_MS) return
      ultimoIntentoAutomatico.current = Date.now()
      void guardarSolo.current(false, true)
    }, 5_000)
    return () => window.clearInterval(reloj)
  }, [])

  /**
   * «Listo para publicar» (D-142): guarda lo pendiente, manda el tiempo medido
   * y pide la validación. Si el servidor la ve rápida, se enseña por qué y se
   * pregunta; confirmada, se marca igual y queda señalada para el
   * administrador. No se prohíbe: el revisor puede haberla cotejado en papel.
   */
  const marcarLista = () => {
    if (enCurso || id === null) return
    setAviso(null)
    const incompleta = seccionIncompleta(true)
    if (incompleta >= 0) {
      setSeccion(incompleta)
      setAviso({
        tipo: 'error',
        texto: 'Antes de darla por lista hay que completar lo obligatorio: la pestaña marcada con «!».',
      })
      return
    }
    enfocarAlChocar.current = true
    const edicionesAlEnviar = ediciones.current
    iniciar(async () => {
      try {
        if (sucio) {
          const guardado = await guardarDocumento(esquema.slug, id, valores, false, marca.current, seguimiento.sesion)
          if (guardado.conflicto) {
            setConflicto({ marcaActual: guardado.conflicto.marcaActual, texto: guardado.mensaje ?? MENSAJE_DE_CONFLICTO })
            return
          }
          if (!guardado.exito || !guardado.datos) {
            setAviso({ tipo: 'error', texto: guardado.mensaje ?? 'No se pudo guardar antes de validar.' })
            return
          }
          marca.current = guardado.datos.marca
          if (ediciones.current === edicionesAlEnviar) setSucio(false)
          if (ediciones.current === edicionesAlEnviar) copia.borrar()
        }
        // El tiempo de estos últimos segundos cuenta: se manda antes de juzgar.
        await seguimiento.enviarAhora()
        let r = await marcarListaParaPublicar(esquema.slug, id, marca.current, nota, false)
        if (r.exito && r.datos?.necesitaConfirmacion) {
          const seguir = await confirmar({
            titulo: 'La revisión parece rápida',
            mensaje: (
              <>
                <p>Según lo registrado:</p>
                <ul>
                  {r.datos.juicio.motivos.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p>Si la marca igualmente como lista, quedará señalada para el administrador.</p>
              </>
            ),
            confirmar: 'Marcar como lista',
            cancelar: 'Seguir revisando',
          })
          if (!seguir) {
            setAviso({ tipo: 'ok', texto: 'No se marcó. Siga revisando: el tiempo y las pestañas vistas se siguen contando.' })
            return
          }
          r = await marcarListaParaPublicar(esquema.slug, id, marca.current, nota, true)
        }
        if (r.conflicto) {
          setConflicto({ marcaActual: marca.current, texto: r.mensaje ?? MENSAJE_DE_CONFLICTO })
          return
        }
        if (!r.exito) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo marcar como lista.' })
          return
        }
        setNota('')
        setAviso({
          tipo: 'ok',
          texto: 'Marcada como lista para publicar. La publica un administrador; si cambia algo más, tendrá que volver a validarla.',
        })
        avisar('ok', 'Marcada como lista para publicar.')
        router.refresh()
      } catch (fallo) {
        if (pareceCorteDeRed(fallo, navigator.onLine)) setFalloDeRed(true)
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo marcar como lista.') })
      }
    })
  }

  /** Las secciones con algo escrito, para contar cuántas se revisaron. */
  const seccionesConContenido = useMemo(
    () =>
      enRevision
        ? palabrasPorSeccion(esquema, valores)
            .filter((s) => s.palabras.length > 0)
            .map((s) => s.seccion)
        : [],
    [enRevision, esquema, valores],
  )

  const titulo = String(valores[esquema.titulo] ?? '').trim()

  /**
   * La salida suave que ofrece la confirmación de eliminar, y solo cuando
   * existe.
   *
   * Se ofrecía siempre y decía «retírela de publicación», con dos problemas que
   * se notan justo en el último momento antes de algo que no se deshace.
   *
   * El primero es que esa salida no siempre está. «Retirar de publicación» vive
   * en el mismo menú y aparece con la misma condición que se pregunta aquí; en
   * medios, en modelos 3D y en los catálogos —que no se versionan—, y en una
   * ficha que todavía es borrador, la frase mandaba a buscar en la pantalla una
   * opción que no está. Peor consejo que ninguno: quien no la encuentra vuelve
   * al «Eliminar», que sí está.
   *
   * El segundo es la concordancia. «Retírela» es femenino fijo y aquí desfilan
   * las once colecciones: sobre «Modelo 3D», «Hueso» o «Caso AO» quedaba mal.
   * El esquema ya declara el género y `avisoDeRetirada` sabe conjugar esa
   * frase, pero aquí se prefiere nombrar la opción: concuerda igual y además
   * dice cuál hay que pulsar, que es lo que hace falta a un paso de un borrado
   * que no se deshace. Es lo mismo que las acciones del listado resolvieron
   * hablando en impersonal (`TablaDocumentos.tsx`).
   */
  const salidaSuave =
    esquema.versionada && publicado
      ? ' Si solo quiere que deje de verse, use «Retirar de publicación».'
      : ''

  // --- las acciones del menú «⋯» ----------------------------------------------
  //
  // Duplicar, retirar y eliminar son las tres que se usan poco y que, menos
  // duplicar, no tienen vuelta fácil: estaban en una fila de botones arriba y
  // al pie de la página, a la misma altura que «Guardar borrador». Van al menú,
  // eliminar en rojo. Las tres se desactivan mientras dura cualquier guardado
  // (`desactivada: enCurso`): duplicar y eliminar salen de la pantalla con
  // `router.push`, y retirar se desmonta sola al volver, así que no hay foco
  // que conservar como en los botones de guardar.
  /**
   * El menú se cierra al elegir y desmonta la opción que tenía el foco, que
   * caería en el `<body>`; el diálogo de confirmación lo devolvería ahí al
   * cerrarse. Se lleva antes al botón «⋯», que es de donde se vino.
   */
  const focoAlMenu = () => document.querySelector<HTMLButtonElement>('.editor-menu .menu-acciones-boton')?.focus()

  const duplicar = async () => {
    if (id === null) return
    focoAlMenu()
    // Duplicar es salir: al volver la acción, el `router.push` de abajo deja la
    // ficha actual y abre la copia. Y la copia la saca el servidor del
    // documento guardado, no de lo que hay en pantalla, así que a media
    // redacción se perdía dos veces —lo escrito aquí y lo que la copia no se
    // llevó— sin una sola advertencia, porque `beforeunload` no ve una
    // navegación de cliente.
    if (!(await puedeSalir())) return
    iniciar(async () => {
      try {
        const r = await duplicarDocumento(esquema.slug, id)
        if (r.exito && r.datos) {
          avisar('ok', 'Copia creada. Está editando la copia.')
          router.push(`/admin-panel/contenido/${esquema.slug}/${r.datos.id}`)
        } else {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo duplicar.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo duplicar.') })
      }
    })
  }

  const retirar = async () => {
    if (id === null) return
    focoAlMenu()
    const si = await confirmar({
      titulo: '¿Retirar de publicación?',
      mensaje: 'Deja de ser visible para los lectores, pero no se borra: vuelve a estado de borrador.',
      confirmar: 'Retirar de publicación',
    })
    if (!si) return
    enfocarAlChocar.current = true
    iniciar(async () => {
      try {
        const r = await cambiarPublicacion(esquema.slug, id, false, marca.current)
        if (r.conflicto) {
          setConflicto({
            marcaActual: r.conflicto.marcaActual,
            texto: r.mensaje ?? MENSAJE_DE_CONFLICTO,
          })
        } else if (r.exito && r.datos) {
          // Retirar también mueve `updatedAt`: sin adoptar la marca, el
          // «Guardar borrador» de después chocaría con este mismo «Retirar».
          marca.current = r.datos.marca
          avisar('ok', 'Retirada de publicación. Ya no la ven los lectores.')
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo retirar.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo retirar.') })
      }
    })
  }

  const eliminar = async () => {
    if (id === null) return
    focoAlMenu()
    const si = await confirmar({
      titulo: `¿Eliminar «${titulo || esquema.singular}»?`,
      mensaje: `No se puede deshacer.${salidaSuave}`,
      confirmar: `Eliminar ${esquema.singular.toLowerCase()}`,
      peligro: true,
    })
    if (!si) return
    iniciar(async () => {
      try {
        const r = await eliminarDocumento(esquema.slug, id)
        if (r.exito) {
          // Lo que hubiera sin guardar ya no tiene ficha a la que volver.
          copia.borrar()
          avisar('ok', `Se eliminó «${titulo || esquema.singular}».`)
          router.push(`/admin-panel/contenido/${esquema.slug}`)
        } else setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo eliminar.' })
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo eliminar.') })
      }
    })
  }

  const opcionesDelMenu: OpcionDeMenu[] = []
  if (id !== null && !esquema.subida) {
    opcionesDelMenu.push({ etiqueta: 'Duplicar', icono: Copy, alElegir: () => void duplicar(), desactivada: enCurso })
  }
  if (id !== null && esquema.versionada && publicado) {
    // eslint-disable-next-line react-hooks/refs -- `retirar` lee `marca.current` al pulsar, no al pintar
    opcionesDelMenu.push({
      etiqueta: 'Retirar de publicación',
      icono: EyeOff,
      alElegir: () => void retirar(),
      desactivada: enCurso,
    })
  }
  if (id !== null) {
    opcionesDelMenu.push({
      etiqueta: 'Eliminar',
      icono: Trash2,
      alElegir: () => void eliminar(),
      peligro: true,
      desactivada: enCurso,
    })
  }

  // --- la barra fija ---------------------------------------------------------
  /**
   * La altura de la barra, como variable de CSS en el editor.
   *
   * La barra de formato del texto rico también es fija y tiene que quedarse
   * justo debajo de esta, no debajo de su borde: la altura cambia al partirse
   * en dos líneas, al aparecer el choque o al cambiar el ancho. Se escribe en
   * el estilo y no en el estado para no repintar el formulario entero por un
   * número que solo lee el CSS.
   */
  const editorRef = useRef<HTMLDivElement>(null)
  const barraRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const barra = barraRef.current
    const editor = editorRef.current
    if (!barra || !editor || typeof ResizeObserver === 'undefined') return
    const medir = () => editor.style.setProperty('--alto-barra-editor', `${Math.ceil(barra.getBoundingClientRect().height)}px`)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(barra)
    return () => observador.disconnect()
  }, [])

  // --- pestañas --------------------------------------------------------------
  const idBase = useId()
  const pestanasRef = useRef<(HTMLButtonElement | null)[]>([])
  const irAPestana = (indice: number) => {
    const total = esquema.secciones.length
    const destino = (indice + total) % total
    setSeccion(destino)
    pestanasRef.current[destino]?.focus()
  }

  const identidad = IDENTIDAD_DE_MODULO[esquema.slug]

  /** La frase que dice la región viva cuando cambia la conexión o quién está. */
  const anuncio = !conectado
    ? 'Sin conexión: lo que escribe se guarda en este navegador.'
    : presencia.otros.length > 0
      ? `${enumerar(presencia.otros.map((o) => o.nombre))} también ${presencia.otros.length === 1 ? 'tiene' : 'tienen'} abierta esta ficha.`
      : ''

  return (
    <div className={`editor${identidad ? ` ${identidad.clase}` : ''}`} ref={editorRef}>
      <div className="editor-cabecera">
        <nav className="editor-migas">
          <Link href="/admin-panel/contenido" onNavigate={confirmarSalida('/admin-panel/contenido')}>
            Contenido
          </Link>
          <span aria-hidden>/</span>
          <Link
            href={`/admin-panel/contenido/${esquema.slug}`}
            onNavigate={confirmarSalida(`/admin-panel/contenido/${esquema.slug}`)}
          >
            {esquema.plural}
          </Link>
        </nav>
        <h1 className="admin-title editor-titulo">{titulo || `${esquema.singular} sin título`}</h1>
      </div>

      {/* La barra fija: el estado de la ficha y de lo escrito a la izquierda,
          las acciones a la derecha. Antes estaba arriba del todo y se perdía
          en cuanto se bajaba por la pestaña: quien escribía en «Manejo» no
          sabía si lo de «Definición» estaba guardado ni tenía a mano el botón
          para guardarlo. En el móvil va abajo, al alcance del pulgar
          (`editor.css`). */}
      <div className="editor-barra" ref={barraRef}>
        <div className="editor-barra-fila">
          <div className="editor-barra-estado">
            {id !== null && esquema.versionada ? (
              <span className={`insignia ${publicado ? 'insignia-ok' : 'insignia-atencion'}`}>
                {publicado ? <CheckCircle2 aria-hidden size={14} /> : <CircleDot aria-hidden size={14} />}
                {/* La palabra la compone `estadoEnPalabras` y no un literal:
                    escrita aquí a mano decía «✓ Publicada» encima de «Modelo
                    3D» y de «Hueso», y la del listado la escribía por su cuenta
                    —el mismo estado, dos frases que podían torcerse por
                    separado—. Ahora las dos salen de la misma función, que
                    concuerda con `esquema.genero`. Su glifo de cabeza se quita
                    porque aquí lo pone el icono. */}
                {estadoEnPalabras(esquema, publicado).replace(/^[✓●]\s*/, '')}
              </span>
            ) : null}
            <EstadoDeLoEscrito
              id={id}
              enCurso={enCurso}
              conflicto={conflicto !== null}
              sucio={sucio}
              conectado={conectado}
              ultimoGuardado={ultimoGuardado}
              ultimaCopia={copia.ultimaCopia}
              falloDeCopia={copia.fallo}
              motivo={motivoParaNoGuardar}
              falloAutomatico={falloAutomatico?.mensaje ?? null}
            />
            <IndicadorDePresencia otros={presencia.otros} misOtrasPestanas={presencia.misOtrasPestanas} />
          </div>

          <div className="editor-barra-acciones">
            {rutaPublica && publicado ? (
              <Link
                href={rutaPublica}
                className="admin-btn admin-btn-secondary editor-ver-publicado"
                target="_blank"
                title="Ver publicado (se abre en otra pestaña)"
                aria-label="Ver publicado (se abre en otra pestaña)"
              >
                <ExternalLink aria-hidden size={16} />
                <span className="editor-solo-ancho">Ver publicado</span>
              </Link>
            ) : null}

            {/* Los botones de guardar llevan `aria-disabled` y no `disabled`, por
                el mismo motivo que las acciones de fila, la paginación y el
                subidor de `TablaDocumentos.tsx`: el botón que se pulsa es
                justamente el que tiene el foco, y `disabled` puesto por el
                arranque de la transición hace que el navegador lo desenfoque y
                suelte el foco en el `<body>`. Estos tres siguen montados después
                del guardado, así que nada lo recoge —el efecto del aviso solo
                entra cuando el guardado es rechazado, que es el camino raro—, y
                quien guarda con teclado vuelve al principio de la página en cada
                guardado que sale bien. Quien impide la doble pulsación es el
                `if (enCurso) return` de cada `onClick`. Quien avisa de que está
                ocupado es el rótulo.

                «Duplicar», «Retirar» y «Eliminar» viven en el menú «⋯» y se
                desactivan de verdad: ver `opcionesDelMenu`. */}
            {esquema.versionada ? (
              <>
                <button
                  ref={botonGuardarRef}
                  className="admin-btn admin-btn-secondary"
                  aria-disabled={enCurso}
                  onClick={() => {
                    if (enCurso) return
                    void guardar(false)
                  }}
                >
                  {enCurso ? 'Guardando…' : 'Guardar borrador'}
                </button>
                {/* En revisión (D-142), el revisor no publica: da la ficha por
                    lista y la publica el administrador. Al administrador se le
                    ofrecen los dos, porque también puede revisar. */}
                {enRevision && revision?.estado !== 'lista' && revision?.estado !== 'publicada' ? (
                  <button
                    className={`admin-btn ${esAdmin ? 'admin-btn-secondary' : 'admin-btn-primary'}`}
                    aria-disabled={enCurso}
                    onClick={marcarLista}
                  >
                    {enCurso ? 'Guardando…' : 'Listo para publicar'}
                  </button>
                ) : null}
                {!enRevision || esAdmin ? (
                  <button
                    className="admin-btn admin-btn-primary"
                    aria-disabled={enCurso}
                    onClick={() => {
                      if (enCurso) return
                      void guardar(true)
                    }}
                  >
                    {/* Este rótulo también cambia mientras dura la transición: es
                        el único aviso de «ocupado» que queda al soltar `disabled`,
                        y era el que le faltaba —los otros dos botones ya lo
                        tenían—, así que la acción principal de la pantalla era la
                        única que no daba señal ninguna de estar guardando. */}
                    {enCurso ? 'Guardando…' : publicado ? 'Guardar y publicar' : 'Publicar'}
                  </button>
                ) : null}
              </>
            ) : (
              <button
                ref={botonGuardarRef}
                className="admin-btn admin-btn-primary"
                aria-disabled={enCurso}
                onClick={() => {
                  if (enCurso) return
                  void guardar(true)
                }}
              >
                {enCurso ? 'Guardando…' : 'Guardar'}
              </button>
            )}

            {opcionesDelMenu.length > 0 ? (
              <div className="editor-menu">
                <MenuAcciones opciones={opcionesDelMenu} etiqueta="Más acciones de la ficha" />
              </div>
            ) : null}
          </div>
        </div>

        {conflicto && id !== null ? (
          // Un bloque propio y no el aviso de error de abajo, por dos cosas: el
          // aviso se borra con cada tecla y este tiene que quedarse hasta que se
          // resuelva, y este lleva las dos salidas dentro. Sin ellas,
          // «recargue» no tenía más camino que el F5 del navegador, que es justo
          // el que se lleva lo escrito. Vive dentro de la barra fija para que
          // siga a la vista mientras se escribe en otra pestaña: el guardado
          // automático puede chocar con la persona en cualquier parte.
          <div
            ref={conflictoRef}
            tabIndex={-1}
            role="alert"
            className="editor-choque"
          >
            <AlertCircle aria-hidden size={18} className="editor-choque-icono" />
            <p className="editor-choque-texto">{conflicto.texto}</p>
            <div className="editor-choque-acciones">
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-sm"
                aria-disabled={enCurso}
                onClick={() => {
                  if (enCurso) return
                  recargarConservandoLoEscrito()
                }}
              >
                Recargar sin perder lo escrito
              </button>
              {/* En otra pestaña, y es lo único que la hace útil: abierta aquí,
                  la navegación desmontaría el formulario con lo escrito dentro.
                  Allí la ficha se lee fresca de la base y se puede copiar lo que
                  la otra persona añadió. `<Link>` pone el prefijo de la ruta. */}
              <Link
                href={`/admin-panel/contenido/${esquema.slug}/${id}`}
                target="_blank"
                rel="noopener"
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                Ver la versión guardada <ExternalLink aria-hidden size={14} />
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {/* Lo que cambia alrededor de la ficha —la red, quién más está— se
          anuncia aquí, en una región que está siempre montada; las bandas de
          abajo aparecen junto con su texto y no se anunciarían. */}
      <div className="sr-only" role="status">
        {anuncio}
      </div>

      {!conectado ? <BandaSinConexion copiaLocal={copia.ultimaCopia} /> : null}

      {copia.oferta ? (
        <BandaDeRecuperacion
          guardadaEn={copia.oferta.copia.guardadaEn}
          otraVersion={copia.oferta.otraVersion}
          alRecuperar={recuperarCopia}
          alDescartar={() => void descartarCopia()}
        />
      ) : null}

      <BandaDePresencia
        otros={presencia.otros}
        misOtrasPestanas={presencia.misOtrasPestanas}
        desfase={presencia.desfase}
      />

      {/*
        La región viva se queda montada aunque no haya nada que decir: un
        `role="status"` que aparece junto con su texto no lo anuncia, porque el
        lector de pantalla tiene que estar observando la región antes de que su
        contenido cambie. Vacía no ocupa sitio: el borde y el margen los pone
        `.admin-aviso`, que sí es condicional. Montada con el mensaje dentro,
        «Borrador guardado.» y «Publicado. Ya es visible para los lectores.»
        eran silencio, y no había forma de saber si el guardado había salido.
        Es el mismo arreglo que en `TablaUsuarios.tsx`.
      */}
      <div role="status">
        {aviso?.tipo === 'ok' ? (
          <div className="admin-aviso admin-aviso-ok">{aviso.texto}</div>
        ) : null}
      </div>

      {aviso?.tipo === 'error' ? (
        // El error va aparte y sí puede montarse con su texto: `role="alert"`
        // interrumpe y los lectores lo leen al insertarse. Aquí hace falta esa
        // interrupción —el servidor rechaza nombrando el campo y ese mensaje es
        // lo único que explica por qué la ficha no quedó publicada—, y el foco
        // que le trae el efecto de arriba deja a la persona junto al aviso, que
        // además es de donde tiene que salir: el propio rechazo cambió de
        // pestaña por debajo con `setSeccion`.
        <div ref={avisoRef} tabIndex={-1} role="alert" className="admin-aviso admin-aviso-error">
          {aviso.texto}
        </div>
      ) : null}

      {esquema.familia === 'modulos' ? (
        <RevisionEnElEditor
          revision={revision}
          esAdmin={esAdmin}
          coleccion={esquema.slug}
          id={id}
          secciones={seccionesConContenido}
          vistas={vistas}
          nota={nota}
          alCambiarNota={setNota}
        />
      ) : null}

      {/* Pestañas con el patrón de pestañas de ARIA: flechas para moverse,
          Inicio y Fin, y solo la activa en el orden del tabulador. Eran botones
          sueltos en un `<nav>` con `aria-current`, y en estrecho saltaban de
          línea en dos y tres filas; ahora se desplazan de lado. La medición de
          la revisión no cambia: sigue leyendo la sección activa por su título
          (`useSeguimientoDeRevision`). */}
      {esquema.secciones.length > 1 ? (
        <div
          className="editor-pestanas"
          role="tablist"
          aria-label="Secciones del documento"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') irAPestana(seccion + 1)
            else if (e.key === 'ArrowLeft') irAPestana(seccion - 1)
            else if (e.key === 'Home') irAPestana(0)
            else if (e.key === 'End') irAPestana(esquema.secciones.length - 1)
            else return
            e.preventDefault()
          }}
        >
          {esquema.secciones.map((s, i) => {
            const faltan = faltantesDeSeccion(esquema, valores, i, true).length
            // Revisada por quien edita (D-142): la tuvo delante lo bastante.
            const revisada = enRevision && vistas.has(s.titulo)
            const conContenido = contarContenido(esquema, valores, i) > 0
            return (
              <button
                key={s.titulo}
                ref={(boton) => {
                  pestanasRef.current[i] = boton
                }}
                type="button"
                role="tab"
                id={`${idBase}-pestana-${i}`}
                aria-selected={i === seccion}
                aria-controls={`${idBase}-panel`}
                tabIndex={i === seccion ? 0 : -1}
                className={`editor-pestana${i === seccion ? ' editor-pestana-activa' : ''}`}
                onClick={() => setSeccion(i)}
              >
                <span>{s.titulo}</span>
                {/* Una sola familia de marcas, todas iconos de 14 px en el
                    mismo hueco: falta algo obligatorio (con cuántos),
                    revisada, o al menos tiene contenido. Antes eran un «!» en
                    círculo rojo, una «✓» suelta y un punto de 5 px que no se
                    veía. */}
                {faltan > 0 ? (
                  <span className="editor-pestana-falta" title={`Faltan ${faltan} obligatorio${faltan === 1 ? '' : 's'}`}>
                    <AlertCircle aria-hidden size={14} />
                    <span className="u-num">{faltan}</span>
                    <span className="sr-only"> obligatorio{faltan === 1 ? '' : 's'} sin llenar</span>
                  </span>
                ) : null}
                {revisada ? (
                  <span className="editor-pestana-revisada" title="Ya revisó esta sección">
                    <CheckCircle2 aria-hidden size={14} />
                    <span className="sr-only">revisada</span>
                  </span>
                ) : null}
                {faltan === 0 && !revisada && conContenido ? (
                  <span className="editor-pestana-marca" title="Tiene contenido">
                    <span className="sr-only">con contenido</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <section
        className="editor-seccion"
        role={esquema.secciones.length > 1 ? 'tabpanel' : undefined}
        id={`${idBase}-panel`}
        aria-labelledby={esquema.secciones.length > 1 ? `${idBase}-pestana-${seccion}` : undefined}
      >
        {esquema.secciones[seccion]?.descripcion ? (
          <p className="editor-seccion-nota">{esquema.secciones[seccion].descripcion}</p>
        ) : null}
        <FilaDeCampos
          campos={esquema.secciones[seccion]?.campos ?? []}
          valores={valores}
          alCambiar={cambiar}
          relaciones={relaciones}
          alRecargarRelacion={(coleccion) => void cargarRelacion(coleccion, true)}
        />
      </section>
    </div>
  )
}

/**
 * Lo que dice la barra de lo escrito: guardando, sin guardar, guardado hace
 * tanto, y si se guarda solo o por qué no.
 *
 * Componente aparte para que el reloj de «hace 12 s» repinte solo esto.
 */
function EstadoDeLoEscrito({
  id,
  enCurso,
  conflicto,
  sucio,
  conectado,
  ultimoGuardado,
  ultimaCopia,
  falloDeCopia,
  motivo,
  falloAutomatico,
}: {
  id: string | null
  enCurso: boolean
  conflicto: boolean
  sucio: boolean
  conectado: boolean
  ultimoGuardado: { en: number; automatico: boolean } | null
  ultimaCopia: number | null
  falloDeCopia: boolean
  motivo: MotivoParaNoGuardarSolo | null
  falloAutomatico: string | null
}) {
  let principal: React.ReactNode
  let detalle: React.ReactNode = null
  let tono = 'neutro'

  if (enCurso) {
    principal = (
      <>
        <Loader2 aria-hidden size={14} className="editor-girando" /> Guardando…
      </>
    )
  } else if (conflicto) {
    principal = 'Choque de edición: no se guardó'
    tono = 'peligro'
  } else if (sucio) {
    principal = 'Cambios sin guardar'
    tono = 'atencion'
    const partes: string[] = []
    if (!conectado) partes.push('sin conexión')
    if (falloDeCopia) partes.push('no se pudo hacer copia local')
    else if (ultimaCopia) partes.push(`copia local ${horaDe(ultimaCopia)}`)
    if (motivo === 'rechazado' && falloAutomatico) partes.push('no se guardó sola')
    else if (motivo && MOTIVO_EN_PALABRAS[motivo]) partes.push(MOTIVO_EN_PALABRAS[motivo]!)
    else if (motivo === null) partes.push('se guarda sola cada minuto')
    detalle = partes.join(' · ')
  } else if (ultimoGuardado) {
    tono = 'ok'
    principal = ultimoGuardado.automatico ? (
      `Guardado automáticamente a las ${horaDe(ultimoGuardado.en)}`
    ) : (
      <>
        Guardado <Hace desde={ultimoGuardado.en} />
      </>
    )
  } else {
    principal = id === null ? 'Sin guardar todavía' : 'Sin cambios'
  }

  return (
    <span
      className={`editor-estado editor-estado-${tono}`}
      title={motivo === 'rechazado' && falloAutomatico ? falloAutomatico : undefined}
    >
      {!conectado ? <CloudOff aria-hidden size={14} /> : null}
      <span className="editor-estado-principal">{principal}</span>
      {detalle ? <span className="editor-estado-detalle">{detalle}</span> : null}
    </span>
  )
}

/** Cuántos campos de una sección tienen algo escrito, para marcar la pestaña. */
function contarContenido(
  esquema: EsquemaDeColeccion,
  valores: Record<string, unknown>,
  indice: number,
): number {
  const campos = esquema.secciones[indice]?.campos ?? []
  return campos.filter((campo) => {
    const valor = valores[campo.nombre]
    // Un texto rico vacío no es `null` ni `''`, sino un árbol con un párrafo en
    // blanco dentro: preguntando solo por la forma contaba como campo con algo
    // escrito, y la marca aparecía sobre una pestaña en la que no hay todavía
    // una sola palabra. Es la misma trampa que `sinLlenar` en `depurar.ts`.
    if (campo.tipo === 'rico') return !estaVacio(valor)
    if (Array.isArray(valor)) return valor.length > 0
    if (typeof valor === 'string') return valor.trim().length > 0
    return valor !== null && valor !== undefined && valor !== false
  }).length
}

/**
 * Lo obligatorio que falta en una sola sección.
 *
 * Le pregunta a `faltantes` —la misma pieza con la que el servidor decide si
 * acepta el documento— en vez de repetir aquí la prueba de vacío. Repetida se
 * quedaba atrás sola: un texto rico vacío no es `null` ni `''`, y las filas de
 * dentro de un bloque ni se miraban, así que la pestaña salía limpia y el
 * rechazo aparecía al publicar sin decir en cuál de las siete hay que mirar.
 *
 * Se le entrega un esquema recortado a una sección porque `faltantes` recorre
 * el documento entero y aquí se pregunta pestaña por pestaña; los valores van
 * completos, que es lo que espera.
 */
function faltantesDeSeccion(
  esquema: EsquemaDeColeccion,
  valores: Record<string, unknown>,
  indice: number,
  profundo: boolean,
): string[] {
  const seccion = esquema.secciones[indice]
  if (!seccion) return []
  return faltantes({ ...esquema, secciones: [seccion] }, valores, { profundo })
}
