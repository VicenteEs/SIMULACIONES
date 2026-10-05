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
  type FiltroDeRevision,
} from '@/app/(frontend)/acciones/contenido'
import { estadoEnPalabras as estadoDeRevision } from '@/lib/revision'
import { claseDeInsignia, tonoDeRevision, tonoDePublicacion } from '@/lib/tonosDeEstado'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { MenuAcciones, type OpcionDeMenu } from '@/components/ui/MenuAcciones'
import { Vacio } from '@/components/ui/Vacio'
import { CabeceraDePagina } from './CabeceraDePagina'

/**
 * Los filtros de revisión del listado de un módulo (D-142), en el orden en que
 * se buscan: lo que espera a un revisor primero.
 */
const FILTROS_DE_REVISION: { valor: FiltroDeRevision; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'por-revisar', etiqueta: 'Por revisar' },
  { valor: 'mias', etiqueta: 'Asignadas a mí' },
  { valor: 'devueltas', etiqueta: 'Devueltas' },
  { valor: 'listas', etiqueta: 'Listas para publicar' },
  { valor: 'publicadas', etiqueta: 'Publicadas tras revisión' },
  { valor: 'sin-revision', etiqueta: 'Fuera de revisión' },
]

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
      <span className={claseDeInsignia(valor === true ? 'ok' : 'neutra')}>
        {valor === true ? 'Sí' : 'No'}
      </span>
    )
  }
  if (formato === 'estado') {
    const publicado = valor === 'published'
    return (
      <span className={claseDeInsignia(tonoDePublicacion(publicado))}>
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

export function TablaDocumentos({
  esquema,
  esAdmin = false,
}: {
  esquema: EsquemaDeColeccion
  /** Rol real: el editor no publica una ficha en revisión (D-142). */
  esAdmin?: boolean
}) {
  const conRevision = esquema.familia === 'modulos'
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()

  const [filas, setFilas] = useState<FilaDeLista[]>([])
  const [total, setTotal] = useState(0)
  const [paginas, setPaginas] = useState(1)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'todos' | 'publicado' | 'borrador'>('todos')
  const [filtroRevision, setFiltroRevision] = useState<FiltroDeRevision>('todas')
  const [cargando, setCargando] = useState(true)
  // Solo el error se queda en la página: el detalle de por qué falló tiene que
  // seguir a la vista mientras se corrige. El «se publicó» ya no: era un
  // recuadro arriba del todo que quien había bajado a la fila veinte no veía, y
  // ahora sale como aviso flotante junto a donde se pulsó.
  const [aviso, setAviso] = useState<{ tipo: 'error'; texto: string } | null>(null)
  const avisar = useAvisos()
  const confirmar = useConfirmar()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const resultado = await listarDocumentos(esquema.slug, {
        pagina,
        busqueda,
        estado,
        ...(conRevision ? { revision: filtroRevision } : {}),
      })
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
  }, [esquema.slug, pagina, busqueda, estado, conRevision, filtroRevision])

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
          avisar('ok', exitoso)
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

  /**
   * Las acciones secundarias de una fila, como opciones del menú «⋯».
   *
   * Es una función y no un JSX en línea para que el cuerpo de la tabla se
   * lea de un golpe; los nombres de las opciones dicen la acción y el menú
   * trae el nombre de la ficha en su etiqueta.
   */
  const opcionesDeFila = (fila: FilaDeLista, nombre: string, posicion: number): OpcionDeMenu[] => {
    const opciones: OpcionDeMenu[] = []
    // Una ficha en revisión no la publica el editor (D-142): la opción no se le
    // ofrece. Retirarla sí.
    if (esquema.versionada && !(fila.revision && !esAdmin && !fila.publicado)) {
      opciones.push({
        etiqueta: fila.publicado ? 'Retirar de publicación' : 'Publicar',
        icono: fila.publicado ? EyeOff : Eye,
        alElegir: () => {
          if (enCurso) return
          conAviso(
            () => cambiarPublicacion(esquema.slug, fila.id, !fila.publicado),
            // En impersonal, que es lo único que concuerda con las once
            // colecciones: «Retirada» era femenino fijo sobre «Hueso» y
            // «Caso AO».
            fila.publicado ? `Se retiró de publicación «${nombre}».` : `Se publicó «${nombre}».`,
            posicion,
          )
        },
      })
    }
    if (!esquema.subida) {
      opciones.push({
        etiqueta: 'Duplicar',
        icono: Copy,
        alElegir: () => {
          if (enCurso) return
          conAviso(
            () => duplicarDocumento(esquema.slug, fila.id),
            `Copia de «${nombre}» creada como borrador.`,
            posicion,
          )
        },
      })
    }
    opciones.push({
      etiqueta: 'Eliminar',
      icono: Trash2,
      peligro: true,
      alElegir: async () => {
        // La guarda va antes de la pregunta: preguntar por un borrado que
        // después no se va a ejecutar es peor que no preguntar.
        if (enCurso) return
        const si = await confirmar({
          titulo: `¿Eliminar «${nombre}»?`,
          mensaje: 'No se puede deshacer.',
          confirmar: 'Eliminar',
          peligro: true,
        })
        if (!si) return
        conAviso(
          () => eliminarDocumento(esquema.slug, fila.id),
          `Se eliminó «${nombre}».`,
          posicion,
        )
      },
    })
    return opciones
  }

  return (
    <div>
      <CabeceraDePagina
        migas={[{ etiqueta: 'Contenido', href: '/admin-panel/contenido' }, { etiqueta: esquema.plural }]}
        titulo={esquema.plural}
        subtitulo={`${esquema.descripcion} · ${total} en total`}
        acciones={
          esquema.subida ? (
            <SubidorDeArchivos esquema={esquema} alTerminar={() => void cargar()} />
          ) : (
            /* Decía «+ Nueva {singular en minúsculas}», con el femenino fijo y
               las siglas arrasadas: «+ Nueva hueso», «+ Nueva caso ao»,
               «+ Nueva instrumento». Seis de los once botones salían mal, y son
               el botón principal de la pantalla. «Agregar» es el verbo que las
               listas repetibles ya usan (`formulario/Campos.tsx`) y no tiene
               que concordar con nada, así que el singular entra tal como está
               escrito en el esquema y «Caso AO» conserva su sigla. */
            <Link href={`/admin-panel/contenido/${esquema.slug}/nuevo`} className="admin-btn admin-btn-primary">
              <Plus aria-hidden size={16} />
              Agregar {esquema.singular}
            </Link>
          )
        }
      />

      {/* El error sí puede montarse con su texto: `role="alert"` interrumpe y
          los lectores lo leen al insertarse. Aquí no se le lleva el foco, al
          contrario que en el editor: allí el rechazo cambia de pestaña por
          debajo, y aquí el botón que se pulsó sigue en su fila, así que
          moverlo dejaría a la persona lejos de donde estaba trabajando. El
          aviso de éxito ya no vive aquí: es flotante (`useAvisos`), que trae su
          propia región viva. */}
      {aviso?.tipo === 'error' ? (
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
        {conRevision ? (
          <div className="admin-filter-group">
            <label className="admin-filter-label" htmlFor="filtro-doc-revision">
              Revisión
            </label>
            <select
              id="filtro-doc-revision"
              className="admin-select"
              value={filtroRevision}
              onChange={(e) => {
                setPagina(1)
                setFiltroRevision(e.target.value as FiltroDeRevision)
              }}
            >
              {FILTROS_DE_REVISION.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <span className="admin-filter-count">
          {cargando ? 'cargando…' : `${filas.length} en pantalla`}
        </span>
      </div>

      <div className="admin-table-container">
        {filas.length === 0 && !cargando ? (
          <Vacio
            icono={FileText}
            titulo={
              busqueda || estado !== 'todos' || filtroRevision !== 'todas'
                ? 'Nada coincide con el filtro.'
                : `Todavía no hay nada en ${esquema.plural}.`
            }
            accion={
              !esquema.subida && !(busqueda || estado !== 'todos' || filtroRevision !== 'todas') ? (
                <Link href={`/admin-panel/contenido/${esquema.slug}/nuevo`} className="admin-btn admin-btn-primary">
                  <Plus aria-hidden size={16} />
                  Agregar {esquema.singular}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table tabla-apilable">
            <thead>
              <tr>
                {esquema.columnas.map((c) => (
                  <th key={c.nombre}>{c.etiqueta}</th>
                ))}
                {conRevision ? <th>Revisión</th> : null}
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {/* El lint de refs ve que `opcionesDeFila` termina en `conAviso`,
                  que anota la fila en `focoTrasBorrar.current`, y lo toma por
                  un acceso durante el pintado. No lo es: esa escritura solo
                  corre dentro de `alElegir`, al elegir una opción. */}
              {/* eslint-disable-next-line react-hooks/refs */}
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
                        <td key={columna.nombre} data-etiqueta={columna.etiqueta}>
                          {celda(fila.valores[columna.nombre], columna.formato, esquema)}
                        </td>
                      ),
                    )}
                    {conRevision ? (
                      <td data-etiqueta="Revisión">
                        {fila.revision ? (
                          <>
                            <span className={claseDeInsignia(tonoDeRevision(fila.revision.estado))}>
                              {estadoDeRevision(fila.revision.estado)}
                            </span>
                            {/* La señal de validación rápida es del
                                administrador: al revisor no se le enseña la
                                suya en cada fila de su propio trabajo. */}
                            {esAdmin && fila.revision.rapida ? (
                              <span className="revision-senal" title="Validación señalada como rápida">
                                <Flag aria-label="Validación señalada como rápida" size={14} />
                              </span>
                            ) : null}
                            <div className="revision-tenue">
                              {fila.revision.asignada ? fila.revision.asignada : 'sin asignar'}
                            </div>
                          </>
                        ) : (
                          <span className="revision-tenue">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="admin-table-acciones">
                      <div className="admin-table-acciones-fila">
                        <Link
                          href={`/admin-panel/contenido/${esquema.slug}/${fila.id}`}
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          aria-label={`Editar «${nombre}»`}
                          // Por dónde vuelve el foco cuando una acción del menú
                          // cambia la fila. Se marca este y no el título porque
                          // ocupa la misma columna que el menú.
                          data-editar=""
                        >
                          <Pencil aria-hidden size={14} />
                          Editar
                        </Link>
                        {/* Las acciones secundarias, en el menú «⋯»: cuatro
                            botones por fila se comían media tabla en un
                            portátil y obligaban a desplazar de lado en el
                            móvil. Lo frecuente —editar— se queda fuera.

                            Ninguna opción lleva `disabled`: el menú se cierra
                            al elegir y la guarda de cada `alElegir` —el
                            `if (enCurso) return`— es quien corta la doble
                            pulsación. El foco, que se perdía al cerrarse el
                            menú, vuelve al «Editar» de la fila con
                            `focoTrasBorrar`. */}
                        <MenuAcciones etiqueta={`Más acciones de «${nombre}»`} opciones={opcionesDeFila(fila, nombre, posicion)} />
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
            <div className="admin-paginas">
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary admin-btn-icon"
                aria-disabled={pagina <= 1}
                onClick={() => {
                  if (pagina <= 1) return
                  setPagina(pagina - 1)
                }}
              >
                <ChevronLeft aria-hidden size={16} />
                <span className="sr-only">Página anterior</span>
              </button>
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary admin-btn-icon"
                aria-disabled={pagina >= paginas}
                onClick={() => {
                  if (pagina >= paginas) return
                  setPagina(pagina + 1)
                }}
              >
                <ChevronRight aria-hidden size={16} />
                <span className="sr-only">Página siguiente</span>
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
              línea no la anuncia ningún lector de pantalla. Se viste con
              `.admin-progreso-nativo`, que antes no existía: salía con el gris
              y el azul del sistema, sin relación con la paleta. */}
          <progress
            className="admin-progreso-nativo"
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
