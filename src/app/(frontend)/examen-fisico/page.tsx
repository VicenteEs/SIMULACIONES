import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeEditar } from '@/lib/guardias'
import { cerradoPorMantencion, puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { agruparManiobrasPorSegmento } from '@/lib/maniobras'
import { agruparEnRegiones } from '@/lib/regiones'
import { lecturasDelResidente } from '@/lib/lecturas'
import { SinAcceso, ModuloNoDisponible, SinAccesoAlModulo, Vacio } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { FormularioComentario } from '@/components/FormularioComentario'
import { Rico, tieneContenido } from '@/components/Rico'
import { RastreadorActividad } from '@/components/RastreadorActividad'
import { VisitaDeManiobraEnlazada } from '@/components/VisitaDeManiobraEnlazada'
import { ManiobrasPorSegmento, PanelDeManiobra } from '@/components/examen/ManiobrasPorSegmento'
import { CabeceraDeModulo, claseDeModulo } from '@/components/Cabeceras'
import { separarVideo, textoBuscable, type SegmentoDeLaLista } from '@/lib/listaDeManiobras'
import Link from 'next/link'
import { Fragment } from 'react'
import { CircleCheck, Info, Pencil, Plus, Target } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Cuántas maniobras se piden de una vez.
 *
 * Pasado este número las de más no se pintan, y por tanto no se pueden leer ni
 * marcar. Antes era también el tope de la consulta de lectura, y tenía que
 * serlo: uno más bajo allí dejaba maniobras leídas con la casilla en blanco.
 * Esa consulta ya no lleva tope (`src/lib/lecturas.ts` explica por qué), así
 * que este número solo gobierna el listado.
 *
 * Lo que lo sigue atando a la lectura es `identificadores`: se pregunta por
 * exactamente las maniobras que trajo esta consulta, las mismas de las que
 * salen las tarjetas. Filtrar o recortar esa lista entre medias es volver a
 * poner a la lectura un tope más bajo que el del listado, con las casillas de
 * las que se quedan fuera en blanco y sin que falle nada
 * (`lecturaDelExamenFisico.test.ts` lo vigila).
 */
const TOPE_DE_MANIOBRAS = 300

/**
 * Módulo 02 · Repositorio de examen físico, agrupado por segmento.
 *
 * En dos columnas desde P-007 (D-237): la lista del segmento a la izquierda y
 * la maniobra elegida a la derecha. La página sigue pintando todas las
 * maniobras —es la única sin página por documento, y el ancla
 * `#maniobra-<id>` depende de eso—; cuál se ve lo decide
 * `ManiobrasPorSegmento`.
 */
export default async function ExamenFisico() {
  const { activo, usuario, rolReal, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Examen físico" />

  // Antes de consultar, y con el usuario efectivo que va a la consulta. Para
  // una cuenta sin este módulo, el `find` de maniobras no devuelve una lista
  // vacía sino que lanza `Forbidden`, y eso acababa en `error.tsx` pidiendo
  // «vuelva a intentarlo» por una avería que no existe. Con el usuario real, un
  // administrador en vista previa pasaría la guardia y se estrellaría igual en
  // la consulta, que va con su rol simulado. Es la misma guardia que los otros
  // cuatro listados, con la misma pantalla: si aquí dijera otra cosa, se leería
  // como un problema distinto. El porqué entero, en `SinAccesoAlModulo`.
  // Un módulo en mantención se le cierra al residente con su propia pantalla (D-156).
  const enMantencion = await modulosEnMantencion()
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'maniobras', enMantencion)) {
    return cerradoPorMantencion(usuarioEfectivo as UsuarioSesion | null, 'maniobras', enMantencion) ? (
      <ModuloNoDisponible titulo="Examen físico" />
    ) : (
      <SinAccesoAlModulo titulo="Examen físico" />
    )
  }

  // El botón del estado vacío lleva al panel, y el panel devuelve a la portada
  // sin decir nada a quien no es admin ni editor (`admin-panel/acceso.ts`). La
  // plataforma nace vacía a propósito (D-016), así que esta es la pantalla que
  // recibe al primer residente: el único botón que veía lo expulsaba del
  // módulo, sin error ni explicación. Se mira `rolReal` y no el rol efectivo,
  // igual que la portada: la vista previa baja la lectura, no el acceso al
  // panel.
  const puedeCrear =
    (rolReal === 'admin' || rolReal === 'editor') && puedeEditar(usuario ?? {}, 'maniobras')

  const payload = await getPayload({ config })
  const user = usuarioEfectivo as never

  const [maniobras, segmentos] = await Promise.all([
    payload.find({ collection: 'maniobras', overrideAccess: false, user, limit: TOPE_DE_MANIOBRAS, depth: 1, sort: 'nombre' }),
    payload.find({ collection: 'segmentos', overrideAccess: false, user, limit: 100, sort: 'orden' }),
  ])

  const identificadores = maniobras.docs.map((m) => String(m.id))

  // Qué maniobras tiene ya marcadas este residente, en UNA consulta para todas.
  //
  // Las casillas las pinta `RastreadorActividad`, que es de cliente y nace con
  // `completadoInicial`: sin esto salen todas en blanco en cada carga y el
  // residente vuelve a marcar lo que ya tenía marcado.
  //
  // Se llama una sola vez, fuera del `.map` de las tarjetas, con la lista
  // entera de identificadores que se acaban de traer. Es la misma función que
  // usan las cuatro fichas por documento (`src/lib/lecturas.ts`), y pregunta
  // siempre por una lista precisamente por este listado: llamarla dentro del
  // `.map` con una maniobra cada vez funcionaría igual y serían treinta viajes
  // a PostgreSQL para pintar treinta casillas, sin nada en pantalla que lo
  // delate. Por qué no lanza y por qué no lleva tope, en su cabecera.
  const lecturas = await lecturasDelResidente(payload, usuarioEfectivo, 'maniobras', identificadores)

  // El reparto por segmentos lo hace `src/lib/maniobras.ts` y no un `.filter`
  // dentro del JSX, porque lo que hay que sostener —que las maniobras que
  // entran son exactamente las que salen— no se ve leyendo esta página y aquí
  // no hay prueba que la ejecute. Su cabecera explica a quién se dejaba fuera y
  // qué costaba: una maniobra sin grupo no se pintaba, y en este módulo no
  // pintarse es no poderse leer ni marcar nunca.
  const grupos = agruparManiobrasPorSegmento(maniobras.docs, segmentos.docs)
  // Y encima, las regiones (D-157): miembro superior, inferior, axial y
  // generales, con los segmentos de proximal a distal dentro de cada una. Es solo
  // presentación; las anclas de los segmentos y de las maniobras no cambian.
  const regiones = agruparEnRegiones(grupos)

  // Lo que necesita la lista de la izquierda, y nada más: el detalle lo pinta
  // esta página y no viaja como datos. En el mismo orden en que se pintan los
  // paneles, que es el de las regiones.
  const lista: SegmentoDeLaLista[] = regiones.flatMap(({ grupos: deLaRegion }) =>
    deLaRegion.map((g) => ({
      clave: g.clave,
      titulo: g.titulo,
      maniobras: g.lista.map((m) => ({
        id: String(m.id),
        nombre: String(m.nombre ?? ''),
        evalua: typeof m.evalua === 'string' ? m.evalua : '',
        busqueda: textoBuscable(m),
        leida: lecturas.leida(m.id),
      })),
    })),
  )

  return (
    <main className={claseDeModulo('maniobras')}>
      <CabeceraDeModulo
        slug="maniobras"
        enMantencion={enMantencion.includes('maniobras')}
        titulo="Examen físico"
        entradilla="Maniobras por segmento, con su técnica, qué se considera positivo y cómo interpretarlo."
        acciones={
          puedeCrear && maniobras.totalDocs > 0 ? (
            <Link className="boton boton-secundario boton-sm" href="/admin-panel/contenido/maniobras/nuevo">
              <Plus size={16} aria-hidden="true" />
              Nueva maniobra
            </Link>
          ) : null
        }
      />

      {maniobras.totalDocs === 0 ? (
        <Vacio
          texto={
            puedeCrear
              ? 'Todavía no hay maniobras registradas.'
              : 'Todavía no hay maniobras publicadas. El equipo docente las está escribiendo.'
          }
          enlace={puedeCrear ? '/admin-panel/contenido/maniobras/nuevo' : undefined}
          accion={puedeCrear ? 'Crear la primera maniobra' : undefined}
        />
      ) : (
        <>
          {/* No pinta nada: anota la visita de la maniobra que nombraba el
              enlace, si lo hacía. Va una sola vez para todo el listado, que es
              justo la diferencia con las casillas de abajo. */}
          <VisitaDeManiobraEnlazada identificadores={identificadores} />

          <ManiobrasPorSegmento segmentos={lista}>
            {regiones.map(({ region, grupos: deLaRegion }) => (
              <Fragment key={region.clave}>
                {deLaRegion.map((g) =>
                  g.lista.map((m) => {
                    const { video, resto } = separarVideo(m.contenido)
                    return (
                      // El ancla que compone `rutaPublica('maniobras', id)`
                      // (`admin-panel/modulos.ts`). El examen físico es el único
                      // módulo sin página por documento, así que «Ver publicado ↗»
                      // tras publicar una maniobra y «abrir ficha →» sobre un
                      // comentario apuntan los dos a `/examen-fisico#maniobra-<id>`,
                      // y con ella `ManiobrasPorSegmento` elige esta maniobra al
                      // llegar. Si algún día hay ficha por maniobra, esto y la
                      // excepción de `rutaPublica` se quitan juntos.
                      <PanelDeManiobra key={m.id} id={`maniobra-${m.id}`} maniobra={String(m.id)}>
                        {video ? (
                          <div className="maniobra-video">
                            <Bloques bloques={[video]} />
                          </div>
                        ) : null}

                        <header className="maniobra-cabecera">
                          <div className="maniobra-titulo">
                            <p className="maniobra-antetitulo">{g.titulo}</p>
                            {/* `tabIndex={-1}`: al elegir la maniobra en la lista
                                el foco viene aquí, para que el lector de pantalla
                                lea lo que se acaba de abrir. */}
                            <h3 tabIndex={-1} data-titulo-de-maniobra="">
                              {m.nombre as string}
                            </h3>
                          </div>
                          <div className="maniobra-acciones">
                            {/* `anotarVisita={false}` es obligatorio aquí: ver la
                                cabecera de la propiedad en `RastreadorActividad`.
                                La visita la anota quien elige la maniobra.

                                `nombreDeLaFicha` también, y por lo mismo que el
                                `label` del comentario de más abajo: son N casillas
                                en una página cuyo `<h1>` dice «Examen físico» y
                                nada más, y sin el nombre el lector de pantalla las
                                anuncia todas igual. */}
                            <RastreadorActividad
                              coleccion="maniobras"
                              documentoId={String(m.id)}
                              completadoInicial={lecturas.leida(m.id)}
                              anotarVisita={false}
                              nombreDeLaFicha={String(m.nombre)}
                            />
                            {puedeCrear ? (
                              <Link
                                className="boton boton-fantasma boton-sm"
                                href={`/admin-panel/contenido/maniobras/${m.id}`}
                              >
                                <Pencil size={15} aria-hidden="true" />
                                Editar
                              </Link>
                            ) : null}
                          </div>
                        </header>

                        <div className="maniobra-claves">
                          <section className="maniobra-clave">
                            <h4>
                              <Target size={18} aria-hidden="true" />
                              Evalúa
                            </h4>
                            <p>{m.evalua as string}</p>
                          </section>
                          <section className="maniobra-clave">
                            <h4>
                              <CircleCheck size={18} aria-hidden="true" />
                              Positivo si
                            </h4>
                            <Rico valor={m.positivo} />
                          </section>
                          {tieneContenido(m.nota) ? (
                            <section className="maniobra-clave">
                              <h4>
                                <Info size={18} aria-hidden="true" />
                                Nota
                              </h4>
                              <Rico valor={m.nota} />
                            </section>
                          ) : null}
                        </div>

                        <section className="maniobra-tecnica">
                          <h4>Técnica</h4>
                          <Rico valor={m.tecnica} />
                        </section>

                        <Bloques bloques={resto} />

                        <div className="maniobra-pie">
                          <FormularioComentario
                            coleccion="maniobras"
                            documentoId={String(m.id)}
                            label={`Comentar mejora sobre ${m.nombre}`}
                            textoBoton="Comentar"
                          />
                        </div>
                      </PanelDeManiobra>
                    )
                  }),
                )}
              </Fragment>
            ))}
          </ManiobrasPorSegmento>
        </>
      )}
    </main>
  )
}
