import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Vacio } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'

export const dynamic = 'force-dynamic'

/** Módulo 02 · Repositorio de examen físico, agrupado por segmento. */
export default async function ExamenFisico() {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Examen físico" />

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
          texto="Todavía no hay maniobras registradas."
          enlace="/admin/collections/maniobras/create"
          accion="Crear la primera maniobra"
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
                <article key={m.id} className="maniobra">
                  <h3>{m.nombre as string}</h3>
                  <dl className="ficha-datos">
                    <dt>Evalúa</dt>
                    <dd>{m.evalua as string}</dd>
                    <dt>Técnica</dt>
                    <dd>{m.tecnica as string}</dd>
                    <dt>Positivo</dt>
                    <dd>{m.positivo as string}</dd>
                    {m.nota ? (
                      <>
                        <dt>Nota</dt>
                        <dd>{m.nota as string}</dd>
                      </>
                    ) : null}
                  </dl>
                  <Bloques bloques={m.contenido} />
                </article>
              ))}
            </section>
          )
        })
      )}
    </main>
  )
}
