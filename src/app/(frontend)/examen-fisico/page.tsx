import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeEditar } from '@/lib/guardias'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { agruparManiobrasPorSegmento } from '@/lib/maniobras'
import { lecturasDelResidente } from '@/lib/lecturas'
import { SinAcceso, SinAccesoAlModulo, Vacio } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { FormularioComentario } from '@/components/FormularioComentario'
import { Rico, tieneContenido } from '@/components/Rico'
import { RastreadorActividad } from '@/components/RastreadorActividad'
import { VisitaDeManiobraEnlazada } from '@/components/VisitaDeManiobraEnlazada'

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

/** Módulo 02 · Repositorio de examen físico, agrupado por segmento. */
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
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'maniobras')) {
    return <SinAccesoAlModulo titulo="Examen físico" />
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
                    completadoInicial={lecturas.leida(m.id)}
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
