import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeEditar } from '@/lib/guardias'
import { agruparManiobrasPorSegmento } from '@/lib/maniobras'
import { SinAcceso, Vacio } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { FormularioComentario } from '@/components/FormularioComentario'
import { Rico, tieneContenido } from '@/components/Rico'
import { RastreadorActividad } from '@/components/RastreadorActividad'
import { VisitaDeManiobraEnlazada } from '@/components/VisitaDeManiobraEnlazada'

export const dynamic = 'force-dynamic'

/**
 * Cuántas maniobras se piden de una vez, y cuántas filas de lectura con ellas.
 *
 * Es el mismo número a propósito, y de ahí que sea una constante y no dos
 * literales: la consulta a `actividad` de abajo busca las filas de estas
 * maniobras y de ninguna otra, así que un tope más bajo allí dejaría maniobras
 * ya leídas con la casilla en blanco. Ese fallo no se ve: la página carga, el
 * residente vuelve a marcar lo que ya tenía marcado y la portada no se mueve.
 */
const TOPE_DE_MANIOBRAS = 300

/** Módulo 02 · Repositorio de examen físico, agrupado por segmento. */
export default async function ExamenFisico() {
  const { activo, usuario, rolReal, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Examen físico" />

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
  const usuarioId = (usuarioEfectivo as { id?: string | number } | null)?.id

  // Qué maniobras tiene ya marcadas este residente, en UNA consulta.
  //
  // Las casillas las pinta `RastreadorActividad`, que es de cliente y nace con
  // `completadoInicial`: sin esto salen todas en blanco en cada carga y el
  // residente vuelve a marcar lo que ya tenía marcado. Los otros cuatro módulos
  // resuelven lo mismo con una consulta por ficha porque tienen una ficha por
  // página; aquí las fichas son treinta en la misma página, así que la consulta
  // por ficha serían treinta viajes a PostgreSQL para pintar treinta casillas.
  // Se pregunta por el `in:` de los identificadores que se acaban de traer.
  //
  // El `.catch` está porque la actividad es una comodidad y las maniobras son
  // el contenido: una avería en esa tabla no puede llevarse por delante el
  // módulo entero. Lo que se pierde es el estado de las casillas, no el texto.
  //
  // Es la quinta consulta de este tipo en la plataforma —`biblioteca/[id]`,
  // `simulador/[id]`, `tecnica-ao/[id]` e `imagenes/[id]` llevan la suya—, y
  // las cuatro anteriores ya están anotadas como pendientes de mudarse a
  // `src/lib`. Esta llega con una diferencia que la mudanza tiene que respetar:
  // las otras cuatro preguntan por un documento y esta por una lista.
  //
  // Va sin `overrideAccess: false` como las otras cuatro, y aquí eso no abre
  // nada: quien acota a una sola cuenta es el `usuario: { equals: usuarioId }`
  // de este mismo `where`, que es literalmente el filtro que añadiría
  // `accesoDePropiedad` para un lector —y que para un admin o un editor no
  // añade ninguno, porque para ellos devuelve `true`—. Ninguna consulta a
  // `actividad` de la plataforma pasa hoy por el control de acceso (la portada
  // escribe `overrideAccess: true` a propósito), así que estrenarlo justo aquí
  // sería probar un camino nuevo detrás de un `.catch` que se traga el fallo:
  // si algo no casara, las casillas saldrían todas en blanco y nadie vería por
  // qué. Si esto cambia, cambia para las cinco a la vez.
  const yaLeidas =
    usuarioId && identificadores.length > 0
      ? await payload
          .find({
            collection: 'actividad',
            where: {
              and: [
                { usuario: { equals: usuarioId } },
                { coleccion: { equals: 'maniobras' } },
                { documentoId: { in: identificadores } },
              ],
            },
            user,
            limit: TOPE_DE_MANIOBRAS,
            depth: 0,
          })
          .then(
            (r) =>
              new Set(
                r.docs.filter((d) => d.completado === true).map((d) => String(d.documentoId)),
              ),
          )
          .catch(() => new Set<string>())
      : new Set<string>()

  // El reparto por segmentos lo hace `src/lib/maniobras.ts` y no un `.filter`
  // dentro del JSX, porque lo que hay que sostener —que las maniobras que
  // entran son exactamente las que salen— no se ve leyendo esta página y aquí
  // no hay prueba que la ejecute. Su cabecera explica a quién se dejaba fuera y
  // qué costaba: una maniobra sin grupo no se pintaba, y en este módulo no
  // pintarse es no poderse leer ni marcar nunca.
  const grupos = agruparManiobrasPorSegmento(maniobras.docs, segmentos.docs)

  return (
    <main>
      <h1>Examen físico</h1>
      <p className="entrada">
        Maniobras por segmento, con su técnica, qué se considera positivo y cómo interpretarlo.
      </p>

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

          {grupos.map((g) => (
            <section key={g.clave} className="grupo-segmento">
              <h2>{g.titulo}</h2>
              {g.lista.map((m) => (
                // El ancla que compone `rutaPublica('maniobras', id)`
                // (`admin-panel/modulos.ts`). El examen físico es el único
                // módulo sin página por documento, así que «Ver publicado ↗»
                // tras publicar una maniobra y «abrir ficha →» sobre un
                // comentario apuntan los dos a `/examen-fisico#maniobra-<id>`.
                // Sin este `id` el enlace aterrizaba arriba del listado y el
                // editor tenía que buscar su maniobra a ojo entre todas las de
                // todos los segmentos. Si algún día hay ficha por maniobra,
                // esto y la excepción de `rutaPublica` se quitan juntos.
                <article key={m.id} id={`maniobra-${m.id}`} className="maniobra">
                  <h3>{m.nombre as string}</h3>
                  <dl className="ficha-datos">
                    <dt>Evalúa</dt>
                    <dd>{m.evalua as string}</dd>
                    <dt>Técnica</dt>
                    <dd><Rico valor={m.tecnica} /></dd>
                    <dt>Positivo</dt>
                    <dd><Rico valor={m.positivo} /></dd>
                    {tieneContenido(m.nota) ? (
                      <>
                        <dt>Nota</dt>
                        <dd><Rico valor={m.nota} /></dd>
                      </>
                    ) : null}
                  </dl>
                  <Bloques bloques={m.contenido} />
                  {/* La marca de lectura va por maniobra y no por listado, que
                      es lo que hacía que de este módulo no se registrara ni una
                      lectura: sus fichas contaban en el total de la portada y
                      nunca en las leídas, y la cifra «por leer» tenía un suelo
                      igual al número de maniobras publicadas. Marcar el listado
                      entero de una vez habría quitado el suelo mintiendo: son
                      treinta maniobras, no un documento.

                      `anotarVisita={false}` es obligatorio aquí: ver la
                      cabecera de la propiedad en `RastreadorActividad`.

                      `nombreDeLaFicha` también, y por lo mismo que el `label`
                      del formulario de justo debajo: son N casillas seguidas en
                      una página cuyo `<h1>` dice «Examen físico» y nada más, así
                      que sin el nombre el lector de pantalla las anuncia todas
                      igual. Las cuatro fichas por documento no la escriben. */}
                  <RastreadorActividad
                    coleccion="maniobras"
                    documentoId={String(m.id)}
                    completadoInicial={yaLeidas.has(String(m.id))}
                    anotarVisita={false}
                    nombreDeLaFicha={String(m.nombre)}
                  />
                  <FormularioComentario
                    coleccion="maniobras"
                    documentoId={String(m.id)}
                    label={`Comentar mejora sobre ${m.nombre}`}
                  />
                </article>
              ))}
            </section>
          ))}
        </>
      )}
    </main>
  )
}
