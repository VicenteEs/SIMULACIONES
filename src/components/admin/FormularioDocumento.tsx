'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { coleccionesRelacionadasDe, type EsquemaDeColeccion } from '@/admin/esquema'
import { faltantes } from '@/admin/depurar'
import { estaVacio } from '@/lib/textoRico'
import {
  cambiarPublicacion,
  duplicarDocumento,
  eliminarDocumento,
  guardarDocumento,
  opcionesDeRelacion,
} from '@/app/(frontend)/acciones/contenido'
import { FilaDeCampos, type Relaciones } from './formulario/Campos'

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

export function FormularioDocumento({
  esquema,
  documento,
  id,
  rutaPublica,
}: {
  esquema: EsquemaDeColeccion
  documento: Record<string, unknown>
  id: string | null
  rutaPublica: string | null
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()

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

  const publicado = documento._status === 'published' || !esquema.versionada

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
   * `beforeunload` solo cubre cerrar o recargar la pestaña, que es justo lo que
   * nadie hace a media redacción. Una navegación de cliente del App Router no
   * lo dispara, y las dos migas de aquí abajo están tres líneas por encima del
   * título: pulsar «Contenido» para comprobar un dato de otra ficha se llevaba
   * por delante media hora de trabajo sin una sola advertencia.
   *
   * La pregunta vive suelta en `puedeSalir` porque de este componente se sale
   * por dos caminos distintos: las migas, que cancelan con el `onNavigate` que
   * `<Link>` ofrece para eso, y «Duplicar», que navega a mano con `router.push`
   * y no tiene nada que cancelar —ahí hay que preguntar antes de arrancar la
   * acción—. Una sola frase para los dos, o se responden cosas distintas según
   * por dónde se salga.
   */
  const puedeSalir = () =>
    !sucio ||
    confirm(
      'Hay cambios sin guardar en esta ficha.\n\n¿Salir igual? Se pierde todo lo escrito desde el último guardado.',
    )

  const confirmarSalida = (evento: { preventDefault: () => void }) => {
    if (!puedeSalir()) evento.preventDefault()
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

  const cambiar = (nombre: string, valor: unknown) => {
    ediciones.current += 1
    setValores((previos) => ({ ...previos, [nombre]: valor }))
    setSucio(true)
    setAviso(null)
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

  const guardar = (publicar: boolean) => {
    setAviso(null)
    const incompleta = seccionIncompleta(publicar)
    if (incompleta >= 0) setSeccion(incompleta)
    // Contra qué se compara al volver. Los campos no se deshabilitan mientras
    // la petición viaja —el cursor no se mueve y seguir escribiendo es lo
    // natural—, así que una tecla más significa que lo tecleado no iba dentro y
    // el documento sigue sucio. Limpiar la marca a ciegas rotulaba «Guardado»,
    // retiraba el aviso de salida y dejaba esas frases fuera de la base sin una
    // sola advertencia.
    const edicionesAlEnviar = ediciones.current
    iniciar(async () => {
      try {
        const resultado = await guardarDocumento(esquema.slug, id, valores, publicar)
        if (!resultado.exito || !resultado.datos) {
          // El rechazo ya ocurrió: aquí se busca hondo, porque lo que lo causó
          // puede ser una fila a medias dentro de un bloque.
          const donde = seccionIncompleta(true)
          if (donde >= 0) setSeccion(donde)
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo guardar.' })
          return
        }
        if (ediciones.current === edicionesAlEnviar) setSucio(false)
        if (id === null) {
          router.replace(`/admin-panel/contenido/${esquema.slug}/${resultado.datos.id}`)
        } else {
          setAviso({
            tipo: 'ok',
            texto: publicar ? 'Publicado. Ya es visible para los lectores.' : 'Borrador guardado.',
          })
          router.refresh()
        }
      } catch (fallo) {
        // Sin esto la ficha se quedaba con la marca de «cambios sin guardar»
        // puesta y sin una palabra que dijera por qué: la única señal era que el
        // botón dejaba de decir «Guardando…».
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo guardar.') })
      }
    })
  }

  const titulo = String(valores[esquema.titulo] ?? '').trim()

  return (
    <div className="editor">
      <div className="admin-toolbar">
        <div>
          <nav className="editor-migas">
            <Link href="/admin-panel/contenido" onNavigate={confirmarSalida}>
              Contenido
            </Link>
            <span>/</span>
            <Link href={`/admin-panel/contenido/${esquema.slug}`} onNavigate={confirmarSalida}>
              {esquema.plural}
            </Link>
          </nav>
          <h1 className="admin-title">{titulo || `${esquema.singular} sin título`}</h1>
          <p className="admin-subtitle">
            {id === null ? (
              'Sin guardar todavía'
            ) : esquema.versionada ? (
              <>
                <span
                  className={`admin-badge ${publicado ? 'admin-badge-publicado' : 'admin-badge-borrador'}`}
                >
                  {publicado ? '✓ Publicada' : '● Borrador'}
                </span>
                {sucio ? <span className="editor-sucio"> · cambios sin guardar</span> : null}
              </>
            ) : sucio ? (
              'Cambios sin guardar'
            ) : (
              'Guardado'
            )}
          </p>
        </div>

        <div className="admin-acciones">
          {rutaPublica && publicado ? (
            <Link href={rutaPublica} className="admin-btn admin-btn-secondary" target="_blank">
              Ver publicado ↗
            </Link>
          ) : null}

          {id !== null && !esquema.subida ? (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={enCurso}
              onClick={() => {
                // Duplicar es salir: al volver la acción, el `router.push` de
                // abajo deja la ficha actual y abre la copia. Y la copia la
                // saca el servidor del documento guardado, no de lo que hay en
                // pantalla, así que a media redacción se perdía dos veces —lo
                // escrito aquí y lo que la copia no se llevó— sin una sola
                // advertencia, porque `beforeunload` no ve una navegación de
                // cliente.
                if (!puedeSalir()) return
                iniciar(async () => {
                  try {
                    const r = await duplicarDocumento(esquema.slug, id)
                    if (r.exito && r.datos) {
                      router.push(`/admin-panel/contenido/${esquema.slug}/${r.datos.id}`)
                    } else {
                      setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo duplicar.' })
                    }
                  } catch (fallo) {
                    setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo duplicar.') })
                  }
                })
              }}
            >
              Duplicar
            </button>
          ) : null}

          {esquema.versionada ? (
            <>
              <button
                className="admin-btn admin-btn-secondary"
                disabled={enCurso}
                onClick={() => guardar(false)}
              >
                {enCurso ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button
                className="admin-btn admin-btn-primary"
                disabled={enCurso}
                onClick={() => guardar(true)}
              >
                {publicado ? 'Guardar y publicar' : 'Publicar'}
              </button>
            </>
          ) : (
            <button
              className="admin-btn admin-btn-primary"
              disabled={enCurso}
              onClick={() => guardar(true)}
            >
              {enCurso ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </div>

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

      {esquema.secciones.length > 1 ? (
        <nav className="editor-pestanas" aria-label="Secciones del documento">
          {esquema.secciones.map((s, i) => (
            <button
              key={s.titulo}
              type="button"
              className={`editor-pestana${i === seccion ? ' editor-pestana-activa' : ''}`}
              onClick={() => setSeccion(i)}
              aria-current={i === seccion ? 'true' : undefined}
            >
              {s.titulo}
              {faltantesDeSeccion(esquema, valores, i, true).length > 0 ? (
                <span className="editor-pestana-falta" title="Falta algo obligatorio">
                  !
                </span>
              ) : contarContenido(esquema, valores, i) > 0 ? (
                <span className="editor-pestana-marca" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </nav>
      ) : null}

      <section className="editor-seccion">
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

      {id !== null ? (
        <div className="editor-pie">
          {esquema.versionada && publicado ? (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={enCurso}
              onClick={() => {
                if (
                  confirm(
                    '¿Retirar de publicación?\n\nDeja de ser visible para los lectores, pero no se borra: vuelve a estado de borrador.',
                  )
                ) {
                  iniciar(async () => {
                    try {
                      const r = await cambiarPublicacion(esquema.slug, id, false)
                      if (r.exito) router.refresh()
                      else setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo retirar.' })
                    } catch (fallo) {
                      setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo retirar.') })
                    }
                  })
                }
              }}
            >
              Retirar de publicación
            </button>
          ) : null}

          <button
            type="button"
            className="admin-btn admin-btn-danger"
            disabled={enCurso}
            onClick={() => {
              if (
                confirm(
                  `¿Eliminar «${titulo || esquema.singular}»?\n\nNo se puede deshacer. Si solo quiere que deje de verse, retírela de publicación.`,
                )
              ) {
                iniciar(async () => {
                  try {
                    const r = await eliminarDocumento(esquema.slug, id)
                    if (r.exito) router.push(`/admin-panel/contenido/${esquema.slug}`)
                    else setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo eliminar.' })
                  } catch (fallo) {
                    setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo eliminar.') })
                  }
                })
              }
            }}
          >
            Eliminar
          </button>
        </div>
      ) : null}
    </div>
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
