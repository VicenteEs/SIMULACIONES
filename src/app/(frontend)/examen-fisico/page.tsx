import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeEditar } from '@/lib/guardias'
import { SinAcceso, Vacio } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { FormularioComentario } from '@/components/FormularioComentario'
import { Rico, tieneContenido } from '@/components/Rico'

export const dynamic = 'force-dynamic'

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
    payload.find({ collection: 'maniobras', overrideAccess: false, user, limit: 300, depth: 1, sort: 'nombre' }),
    payload.find({ collection: 'segmentos', overrideAccess: false, user, limit: 100, sort: 'orden' }),
  ])

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
        segmentos.docs.map((s) => {
          const lista = maniobras.docs.filter((m) => {
            const seg = m.segmento as { id?: number | string } | number | string | null
            return (typeof seg === 'object' && seg !== null ? seg.id : seg) === s.id
          })
          if (lista.length === 0) return null
          return (
            <section key={s.id} className="grupo-segmento">
              <h2>{s.nombre as string}</h2>
              {lista.map((m) => (
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
                  <FormularioComentario 
                    coleccion="maniobras" 
                    documentoId={String(m.id)} 
                    label={`Comentar mejora sobre ${m.nombre}`} 
                  />
                </article>
              ))}
            </section>
          )
        })
      )}
    </main>
  )
}
