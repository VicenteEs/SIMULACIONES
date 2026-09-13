'use client'

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { estadoEnPalabras, type EsquemaDeColeccion } from '@/admin/esquema'
import { subidorQueAvisa } from '@/admin/subidas'
import {
  cambiarPublicacion,
  duplicarDocumento,
  eliminarDocumento,
  listarDocumentos,
  type FilaDeLista,
} from '@/app/(frontend)/acciones/contenido'

/**
 * Listado de una colección.
 *
 * La búsqueda y el filtro se resuelven en el servidor, no en el navegador: una
 * biblioteca de fichas puede crecer a cientos y traerlas todas para filtrarlas
 * aquí funcionaría bien hasta el día en que dejara de funcionar.
 */

const fecha = (valor: unknown) =>
  typeof valor === 'string' && valor
    ? new Date(valor).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

/**
 * Una celda del listado.
 *
 * Recibe el esquema entero, y no solo el formato, porque la insignia de estado
 * tiene que concordar con el singular de la colección: escrita a mano decía
 * «✓ Publicada» sobre «Modelo 3D» y sobre «Hueso». La compone
 * `estadoEnPalabras` —la misma función que la insignia del editor— para que
 * arreglar una no deje a la otra diciéndolo distinto, que es exactamente el
 * modo en que este defecto llegó hasta aquí.
 */
function celda(valor: unknown, formato: string | undefined, esquema: EsquemaDeColeccion) {
  if (formato === 'fecha') return fecha(valor)
  if (formato === 'booleano') {
    return (
      <span className={`admin-badge ${valor === true ? 'admin-badge-publicado' : 'admin-badge-neutro'}`}>
        {valor === true ? 'Sí' : 'No'}
      </span>
    )
  }
  if (formato === 'estado') {
    const publicado = valor === 'published'
    return (
      <span className={`admin-badge ${publicado ? 'admin-badge-publicado' : 'admin-badge-borrador'}`}>
        {estadoEnPalabras(esquema, publicado)}
      </span>
    )
  }
  if (valor === null || valor === undefined || valor === '') return '—'
  return String(valor)
}

/**
 * Cómo se llama esta fila, para nombrarla en los botones y en el `confirm`.
 *
 * Se pregunta por `esquema.titulo`, que es el campo declarado como nombre del
 * registro, y solo si ese no viene entre los valores se cae a la primera
 * columna. El respaldo es el identificador: preferimos «#41» a una cadena vacía
 * en la frase que confirma un borrado.
 */
const nombreDeFila = (esquema: EsquemaDeColeccion, fila: FilaDeLista) => {
  const valor = fila.valores[esquema.titulo] ?? fila.valores[esquema.columnas[0]?.nombre ?? '']
  return typeof valor === 'string' && valor.trim() !== '' ? valor : `#${fila.id}`
}

/**
 * Qué se pinta cuando la acción de servidor no llega a responder.
 *
 * `accion()` (`src/lib/guardias.ts`) envuelve en una `Respuesta` todo lo que
 * ella ve fallar, pero lo que se cae antes de llegar a ella —la red cortada, la
 * sesión caducada, un cuerpo que Next rehúsa— sale como excepción dentro de la
 * transición y nadie la esperaba: se perdía en la consola del navegador y la
 * pantalla se quedaba igual que si la acción no se hubiera pulsado.
 *
 * La misma función está en `FormularioDocumento.tsx`. No se comparte porque
 * importarla desde allí arrastraría a este listado el árbol entero del editor
 * —el texto rico y los dos visores de three.js—; el sitio donde tiene que
 * quedar una sola es el gancho común de acciones del panel, que todavía no
 * existe.
 */
const motivoDeLaCaida = (fallo: unknown, porOmision: string): string =>
  fallo instanceof Error && fallo.message
    ? `${porOmision} ${fallo.message}`
    : `${porOmision} Compruebe la conexión e inténtelo otra vez.`

export function TablaDocumentos({ esquema }: { esquema: EsquemaDeColeccion }) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()

  const [filas, setFilas] = useState<FilaDeLista[]>([])
  const [total, setTotal] = useState(0)
  const [paginas, setPaginas] = useState(1)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'todos' | 'publicado' | 'borrador'>('todos')
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const resultado = await listarDocumentos(esquema.slug, { pagina, busqueda, estado })
      if (resultado.exito && resultado.datos) {
        setFilas(resultado.datos.filas)
        setTotal(resultado.datos.total)
        setPaginas(resultado.datos.paginas)
      } else {
        setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo cargar el listado.' })
      }
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo cargar el listado.') })
    } finally {
      // En el `finally` y no al final del cuerpo: con la sesión caída la acción
      // no devolvía una `Respuesta`, se caía, y el `setCargando(false)` no
      // llegaba a ejecutarse nunca. La pantalla se quedaba en «cargando…» sobre
      // una tabla vacía, que es la forma más callada de decir que algo falló.
      setCargando(false)
    }
  }, [esquema.slug, pagina, busqueda, estado])

  // La búsqueda espera a que se deje de teclear: sin esto, escribir «fractura»
  // dispara ocho consultas y la última en llegar no tiene por qué ser la buena.
  useEffect(() => {
    const temporizador = setTimeout(() => void cargar(), busqueda ? 300 : 0)
    return () => clearTimeout(temporizador)
  }, [cargar, busqueda])

  /**
   * Dónde queda el foco cuando la fila que lo tenía deja de existir.
   *
   * «Eliminar» se desmonta con su fila y el foco cae al `<body>`: el siguiente
   * tabulador arranca desde el principio de la página y hay que recorrer barra
   * lateral, migas y filtros para volver a la tabla, una vez por cada ficha que
   * se borre. Se anota la posición de la fila que se fue y, cuando el listado
   * vuelve del servidor, el foco va al «Editar» de la que ocupa ese lugar —o al
   * de la última, si se borró la última—. Si no quedó ninguna, al buscador, que
   * es el único control que sobrevive a la tabla vacía.
   */
  const focoTrasBorrar = useRef<number | null>(null)
  const cuerpo = useRef<HTMLTableSectionElement>(null)
  const buscador = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const posicion = focoTrasBorrar.current
    if (posicion === null) return
    focoTrasBorrar.current = null
    if (filas.length === 0) {
      buscador.current?.focus()
      return
    }
    const enlaces = cuerpo.current
      ? Array.from(cuerpo.current.querySelectorAll<HTMLAnchorElement>('[data-editar]'))
      : []
    const destino: HTMLAnchorElement | undefined = enlaces[Math.min(posicion, enlaces.length - 1)]
    if (destino) destino.focus()
    else buscador.current?.focus()
  }, [filas])

  const conAviso = (
    tarea: () => Promise<{ exito: boolean; mensaje?: string }>,
    exitoso: string,
    // Posición de la fila que la acción hace desaparecer, para recoger el foco.
    // Solo la manda «Eliminar». Lo que libra a publicar y duplicar de tener que
    // mandarla no es que su fila siga en su sitio —eso también, pero no basta—,
    // sino que su botón no llega a perder el foco: lleva `aria-disabled` y no
    // `disabled`, así que nadie lo desenfoca y sigue enfocado cuando la tabla
    // vuelve del servidor. El día que alguno se desactive de verdad, hará falta
    // pasarle la posición también a él.
    filaDelFoco?: number,
  ) => {
    setAviso(null)
    iniciar(async () => {
      try {
        const r = await tarea()
        if (r.exito) {
          setAviso({ tipo: 'ok', texto: exitoso })
          if (filaDelFoco !== undefined) focoTrasBorrar.current = filaDelFoco
          void cargar()
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar la acción.' })
        }
      } catch (fallo) {
        setAviso({
          tipo: 'error',
          texto: motivoDeLaCaida(fallo, 'No se pudo completar la acción.'),
        })
      }
    })
  }

  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <nav className="editor-migas">
            <Link href="/admin-panel/contenido">Contenido</Link>
          </nav>
          <h1 className="admin-title">{esquema.plural}</h1>
          <p className="admin-subtitle">
            {esquema.descripcion} · {total} en total
          </p>
        </div>
        <div className="admin-acciones">
          {esquema.subida ? (
            <SubidorDeArchivos esquema={esquema} alTerminar={() => void cargar()} />
          ) : (
            /* Decía «+ Nueva {singular en minúsculas}», con el femenino fijo y
               las siglas arrasadas: «+ Nueva hueso», «+ Nueva caso ao»,
               «+ Nueva instrumento». Seis de los once botones salían mal, y son
               el botón principal de la pantalla. «Agregar» es el verbo que las
               listas repetibles ya usan (`formulario/Campos.tsx`) y no tiene
               que concordar con nada, así que el singular entra tal como está
               escrito en el esquema y «Caso AO» conserva su sigla. */
            <Link
              href={`/admin-panel/contenido/${esquema.slug}/nuevo`}
              className="admin-btn admin-btn-primary"
            >
              + Agregar {esquema.singular}
            </Link>
          )}
        </div>
      </div>

      {/*
        La región viva se queda montada aunque no haya nada que decir: un
        `role="status"` que aparece junto con su texto no lo anuncia, porque el
        lector de pantalla tiene que estar observando la región antes de que su
        contenido cambie. Vacía no ocupa sitio: el borde y el margen los pone
        `.admin-aviso`, que sí es condicional. Montada con el mensaje dentro,
        «Se publicó «…»» y «Se eliminó «…»» eran silencio, y quien no ve la
        pantalla no tenía forma de saber si la acción había salido. Es el mismo
        arreglo que en `FormularioDocumento.tsx` y en `TablaUsuarios.tsx`.
      */}
      <div role="status">
        {aviso?.tipo === 'ok' ? (
          <div className="admin-aviso admin-aviso-ok">{aviso.texto}</div>
        ) : null}
      </div>

      {aviso?.tipo === 'error' ? (
        // El error sí puede montarse con su texto: `role="alert"` interrumpe y
        // los lectores lo leen al insertarse. Aquí no se le lleva el foco, al
        // contrario que en el editor: allí el rechazo cambia de pestaña por
        // debajo, y aquí el botón que se pulsó sigue en su fila, así que
        // moverlo dejaría a la persona lejos de donde estaba trabajando.
        <div role="alert" className="admin-aviso admin-aviso-error">
          {aviso.texto}
        </div>
      ) : null}

      <div className="admin-filters">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="buscar-doc">
            Buscar
          </label>
          <input
            id="buscar-doc"
            ref={buscador}
            className="admin-input"
            /* Sin `toLowerCase()`, aquí y en el vacío de más abajo: convertía
               «Modelos 3D» en «modelos 3d» y «Casos AO» en «casos ao». */
            placeholder={`Buscar en ${esquema.plural}`}
            value={busqueda}
            onChange={(e) => {
              setPagina(1)
              setBusqueda(e.target.value)
            }}
          />
        </div>
        {esquema.versionada ? (
          <div className="admin-filter-group">
            <label className="admin-filter-label" htmlFor="filtro-doc-estado">
              Estado
            </label>
            <select
              id="filtro-doc-estado"
              className="admin-select"
              value={estado}
              onChange={(e) => {
                setPagina(1)
                setEstado(e.target.value as typeof estado)
              }}
            >
              <option value="todos">Todos</option>
              <option value="publicado">Publicadas</option>
              <option value="borrador">Borradores</option>
            </select>
          </div>
        ) : null}
        <span className="admin-filter-count">
          {cargando ? 'cargando…' : `${filas.length} en pantalla`}
        </span>
      </div>

      <div className="admin-table-container">
        {filas.length === 0 && !cargando ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">📄</div>
            <p className="admin-empty-text">
              {busqueda || estado !== 'todos'
                ? 'Nada coincide con el filtro.'
                : `Todavía no hay nada en ${esquema.plural}.`}
            </p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                {esquema.columnas.map((c) => (
                  <th key={c.nombre}>{c.etiqueta}</th>
                ))}
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {filas.map((fila, posicion) => {
                // Las cuatro acciones se llaman igual en las veinte filas. Sin
                // el nombre de la ficha dentro, un lector de pantalla que pida
                // la lista de botones dicta «Eliminar» veinte veces, y el
                // `confirm` —el último asidero antes de algo que no se
                // deshace— tampoco decía cuál se llevaba por delante.
                const nombre = nombreDeFila(esquema, fila)
                return (
                  <tr key={fila.id}>
                    {esquema.columnas.map((columna, i) =>
                      i === 0 ? (
                        // `th scope="row"` y no `td`: es lo que ata cada botón
                        // de la fila a la ficha que nombra esta celda.
                        <th key={columna.nombre} scope="row" className="admin-table-user-name">
                          <Link href={`/admin-panel/contenido/${esquema.slug}/${fila.id}`}>
                            {celda(fila.valores[columna.nombre], columna.formato, esquema)}
                          </Link>
                        </th>
                      ) : (
                        <td key={columna.nombre}>
                          {celda(fila.valores[columna.nombre], columna.formato, esquema)}
                        </td>
                      ),
                    )}
                    <td>
                      <div className="admin-acciones">
                        <Link
                          href={`/admin-panel/contenido/${esquema.slug}/${fila.id}`}
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          aria-label={`Editar «${nombre}»`}
                          // Por dónde vuelve el foco cuando se borra una fila.
                          // Se marca este y no el título porque ocupa la misma
                          // columna que el botón que desapareció.
                          data-editar=""
                        >
                          Editar
                        </Link>
                        {/* Las tres acciones de abajo llevan `aria-disabled` y
                            no `disabled`, igual que el subidor del final de
                            este archivo y que toda la fila de
                            `TablaUsuarios.tsx`: el botón que se pulsa es
                            precisamente el que tiene el foco, y `disabled`
                            puesto por el arranque de la transición hace que el
                            navegador lo desenfoque y suelte el foco en el
                            `<body>` —antes incluso de que la fila se repinte—,
                            de modo que publicar veinte fichas seguidas devolvía
                            veinte veces al principio de la página. «Eliminar»
                            se salvaba de rebote, porque el efecto de
                            `focoTrasBorrar` lo recoge después.

                            Quien impide la doble pulsación mientras la
                            transición corre es el `if (enCurso) return` de cada
                            `onClick`, y visualmente no se pierde nada:
                            `.admin-btn` no define estilo de `:disabled`. */}
                        {esquema.versionada ? (
                          <button
                            className={`admin-btn admin-btn-sm ${fila.publicado ? 'admin-btn-secondary' : 'admin-btn-success'}`}
                            aria-disabled={enCurso}
                            aria-label={
                              fila.publicado
                                ? `Retirar de publicación «${nombre}»`
                                : `Publicar «${nombre}»`
                            }
                            onClick={() => {
                              if (enCurso) return
                              conAviso(
                                () => cambiarPublicacion(esquema.slug, fila.id, !fila.publicado),
                                // En impersonal, que es lo único que concuerda
                                // con las once colecciones: «Retirada» era
                                // femenino fijo sobre «Hueso» y «Caso AO».
                                fila.publicado
                                  ? `Se retiró de publicación «${nombre}».`
                                  : `Se publicó «${nombre}».`,
                              )
                            }}
                          >
                            {fila.publicado ? 'Retirar' : 'Publicar'}
                          </button>
                        ) : null}
                        {!esquema.subida ? (
                          <button
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            aria-disabled={enCurso}
                            aria-label={`Duplicar «${nombre}»`}
                            onClick={() => {
                              if (enCurso) return
                              conAviso(
                                () => duplicarDocumento(esquema.slug, fila.id),
                                `Copia de «${nombre}» creada como borrador.`,
                              )
                            }}
                          >
                            Duplicar
                          </button>
                        ) : null}
                        <button
                          className="admin-btn admin-btn-sm admin-btn-danger"
                          aria-disabled={enCurso}
                          aria-label={`Eliminar «${nombre}»`}
                          onClick={() => {
                            // La guarda va antes del `confirm`: preguntar por un
                            // borrado que después no se va a ejecutar es peor
                            // que no preguntar.
                            if (enCurso) return
                            if (confirm(`¿Eliminar «${nombre}»? No se puede deshacer.`)) {
                              conAviso(
                                () => eliminarDocumento(esquema.slug, fila.id),
                                `Se eliminó «${nombre}».`,
                                posicion,
                              )
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {paginas > 1 ? (
          <div className="admin-pie">
            <span>
              Página {pagina} de {paginas}
            </span>
            {/* `aria-disabled` y no `disabled`, por el mismo motivo que las
                acciones de fila y que el subidor del final de este archivo, y
                aquí el que lo apaga es el propio clic: pulsar «← Anterior»
                hasta la página 1, o «Siguiente →» hasta la última, desactiva
                bajo el dedo el botón que acaba de recibir el foco. El navegador
                lo desenfoca, el foco cae al `<body>` y la persona que estaba
                recorriendo la lista con teclado vuelve al principio de la
                página justo al llegar al tope. Quien impide pasarse de los
                extremos es la guarda del `onClick`. Visualmente no cambia nada:
                `.admin-btn` no define estilo de `:disabled`, así que el botón
                del tope ya se veía igual que uno vivo. */}
            <div className="admin-acciones">
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                aria-disabled={pagina <= 1}
                onClick={() => {
                  if (pagina <= 1) return
                  setPagina(pagina - 1)
                }}
              >
                ← Anterior
              </button>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                aria-disabled={pagina >= paginas}
                onClick={() => {
                  if (pagina >= paginas) return
                  setPagina(pagina + 1)
                }}
              >
                Siguiente →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Por qué el peso se pregunta aquí, antes de que el archivo viaje.
 *
 * El techo lo declara la colección —`subida.maximoBytes` en
 * `src/admin/esquema.ts`— y quien lo hace cumplir es la ruta de subida, que lo
 * mira dos veces: en el `Content-Length` y en el byte que se pasa. Preguntarlo
 * además aquí no es repetirlo por gusto: un vídeo de 200 MB por un túnel
 * doméstico tarda minutos en llegar hasta el servidor que lo va a rechazar, y
 * esos minutos se los ahorra quien sube. El número no está escrito en esta
 * pantalla: sale del esquema, que es de donde sale también la frase que lo
 * anuncia justo debajo del botón —50 MB en medios y 5 MB en modelos 3D.
 */
const enMegas = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',')

/** El techo dicho como lo dice `subida.ayuda`: en megabytes enteros. */
const techoEnMegas = (bytes: number): string => String(Math.round(bytes / (1024 * 1024)))

/** Subida directa para las colecciones de archivo (medios y modelos 3D). */
function SubidorDeArchivos({
  esquema,
  alTerminar,
}: {
  esquema: EsquemaDeColeccion
  alTerminar: () => void
}) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  /**
   * Aquí no se usa `useTransition`, y en el resto del archivo sí.
   *
   * Una transición marca sus actualizaciones como aplazables: React puede
   * retrasar el repintado si tiene algo más urgente, y eso es exactamente lo
   * contrario de lo que necesita una barra que solo sirve mientras se mueve.
   * Con la subida dentro de una transición, el porcentaje llegaba a saltos y a
   * veces solo al final, que es lo mismo que no tener barra.
   */
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Cómo va la subida: de qué archivo, cuál de cuántos, y cuánto lleva.
   *
   * Es un solo objeto y no cuatro estados sueltos porque las cuatro piezas
   * cambian a la vez y se leen juntas: `null` significa «no hay ninguna subida
   * en marcha», que es una pregunta que se hace una vez y no cuatro.
   */
  const [progreso, setProgreso] = useState<{
    nombre: string
    cual: number
    total: number
    fraccion: number
  } | null>(null)
  /**
   * El `<input type="file">` sigue existiendo, pero ya no es el control.
   *
   * Estaba `hidden` dentro de un `<label>`, y eso es un botón solo para el
   * ratón: `hidden` equivale a `display:none`, así que el input queda fuera del
   * orden de tabulación y del árbol de accesibilidad, y un `<label>` no recibe
   * foco porque no es un elemento tabulable. En medios y en modelos 3D este
   * subidor **sustituye** al enlace «+ Agregar» —son las dos colecciones que
   * nacen de un archivo—, de modo que con teclado o con lector de pantalla no
   * había ninguna forma de crear una ficha en ellas. Es el mismo arreglo que en
   * `formulario/Campos.tsx`.
   */
  const entrada = useRef<HTMLInputElement>(null)

  const describe =
    [esquema.subida?.ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') ||
    undefined

  const subir = (archivos: File[]) => {
    const techo = esquema.subida?.maximoBytes ?? Number.POSITIVE_INFINITY
    // Un archivo pasado de peso no aborta la tanda: se apunta y se sigue con
    // los demás. El bucle cortaba con `break` en el primer fallo, así que
    // arrastrar diez radiografías y que la tercera pesara de más dejaba siete
    // sin subir, con un mensaje que solo nombraba a la tercera.
    const problemas = archivos
      .filter((a) => a.size > techo)
      .map((a) => `«${a.name}» pesa ${enMegas(a.size)} MB y el máximo son ${techoEnMegas(techo)} MB.`)
    const admitidos = archivos.filter((a) => a.size <= techo)
    if (admitidos.length === 0) {
      setError(`${problemas.join(' ')} Comprímalos, o recorte el video, antes de subirlos.`)
      return
    }
    setEnCurso(true)
    void (async () => {
      // La cuenta lleva la voz: «(2 de 5)» es lo que convierte una barra que se
      // reinicia en una tanda que avanza. Va en una variable de fuera y no en
      // un `entries()` para que el bucle siga recorriendo archivos y no pares,
      // que es lo único que hace.
      let hechos = 0
      for (const archivo of admitidos) {
        const cual = ++hechos
        const avisar = (fraccion: number) =>
          setProgreso({ nombre: archivo.name, cual, total: admitidos.length, fraccion })
        // A cero antes de empezar: así la barra aparece con el nombre del
        // archivo en cuanto arranca y no en el primer evento de avance, que en
        // un archivo grande puede tardar segundos en llegar.
        avisar(0)
        // Se compone uno por archivo, no uno por tanda: lo que el subidor lleva
        // dentro es a quién avisar, y el aviso nombra el archivo del que habla.
        // Ya no es la acción de servidor que se llamaba igual: esto manda a
        // `/api/subidas/<coleccion>` (ver `src/admin/subidas.ts`).
        const subirArchivo = subidorQueAvisa(avisar)
        const formulario = new FormData()
        formulario.set('coleccion', esquema.slug)
        formulario.set('archivo', archivo)
        const nombre = archivo.name.replace(/\.[^.]+$/, '')
        formulario.set('alt', nombre)
        formulario.set('nombre', nombre)
        formulario.set('origen', 'tc')
        try {
          const r = await subirArchivo(formulario)
          if (!r.exito) problemas.push(`«${archivo.name}»: ${r.mensaje ?? 'no se pudo subir'}.`)
        } catch (fallo) {
          // El subidor devuelve una `Respuesta` en vez de rechazar, incluso
          // cuando lo que contesta no es de la plataforma, así que por aquí solo
          // caen las averías del propio navegador —un `setRequestHeader` con un
          // valor que no acepta, por ejemplo—. Sin este `catch` se perderían en
          // la consola, que es donde ya se perdió una vez lo que rechazaba el
          // marco: el botón salía de «Subiendo…», el listado se recargaba igual
          // y nada decía que faltaba un archivo.
          problemas.push(
            `«${archivo.name}»: ${
              fallo instanceof Error && fallo.message ? fallo.message : 'no se pudo subir'
            }.`,
          )
        }
      }
      setProgreso(null)
      setEnCurso(false)
      setError(problemas.length > 0 ? problemas.join(' ') : null)
      // Se recarga siempre: aunque alguno fallara, los que sí subieron tienen
      // que aparecer en la tabla.
      alTerminar()
    })()
  }

  return (
    <div>
      {/* `aria-disabled` y no `disabled`: este botón tiene el foco justo cuando
          la subida arranca —es el que se acaba de pulsar— y desactivarlo con el
          foco dentro lo suelta en el `<body>`, de modo que el siguiente
          tabulador arranca desde el principio de la página. Quien avisa de que
          está ocupado es el rótulo. */}
      <button
        type="button"
        className="admin-btn admin-btn-primary"
        aria-disabled={enCurso}
        aria-describedby={describe}
        onClick={() => {
          if (enCurso) return
          entrada.current?.click()
        }}
      >
        {enCurso ? 'Subiendo…' : '+ Subir archivo'}
      </button>
      <input
        ref={entrada}
        type="file"
        hidden
        accept={esquema.subida?.acepta}
        disabled={enCurso}
        multiple
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (archivos.length === 0) return
          setError(null)
          subir(archivos)
        }}
      />
      {/* El techo de tamaño y los formatos aceptados están escritos en
          `esquema.subida.ayuda` desde que se descubrió que el límite real no
          era el que anunciaba Payload, pero no se pintaban en ninguna pantalla:
          el que subía un video de quirófano se enteraba del techo cuando la
          subida fallaba a medias. Va debajo del botón y no en un `title` porque
          hay que leerlo ANTES de abrir el cuadro de archivos, que es cuando
          todavía se puede elegir otro o recortarlo. */}
      {esquema.subida?.ayuda ? (
        <p className="campo-ayuda admin-subida-ayuda" id={idAyuda}>
          {esquema.subida.ayuda}
        </p>
      ) : null}

      {/*
        La región viva se queda montada aunque no haya subida en marcha, por lo
        mismo que la del aviso de la tabla: un `role="status"` que aparece junto
        con su texto no se anuncia, porque el lector de pantalla tiene que estar
        observando la región antes de que su contenido cambie.

        Dentro va el nombre del archivo y cuál de cuántos es, y NO el
        porcentaje: eso cambia decenas de veces por archivo y convertiría el
        aviso en una letanía que tapa todo lo demás. El porcentaje se lee del
        `<progress>`, que es donde un lector lo busca cuando lo quiere.
      */}
      <div role="status">
        {progreso ? (
          <p className="campo-ayuda admin-subida-ayuda">
            {progreso.total > 1
              ? `Subiendo «${progreso.nombre}» (${progreso.cual} de ${progreso.total}).`
              : `Subiendo «${progreso.nombre}».`}
          </p>
        ) : null}
      </div>
      {progreso ? (
        <p className="campo-ayuda admin-subida-ayuda">
          {/* `<progress>` del navegador y sin clase propia: la hoja del panel
              es de otro lote y una barra hecha con dos `<div>` y un ancho en
              línea no la anuncia ningún lector de pantalla. */}
          <progress
            style={{ width: '100%' }}
            max={100}
            value={Math.round(progreso.fraccion * 100)}
            aria-label={`Avance de la subida de «${progreso.nombre}»`}
          />
          {/* Al llegar al 100 % la subida no ha terminado: falta que el
              servidor escriba el archivo, saque las miniaturas y cree el
              registro. Decirlo evita la lectura contraria —«se colgó al
              final»— que es justo la que lleva a recargar la página a mitad. */}
          {progreso.fraccion >= 1
            ? ' Procesando en el servidor…'
            : ` ${Math.round(progreso.fraccion * 100)} %`}
        </p>
      ) : null}

      {error ? (
        <p className="campo-error" id={idError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
