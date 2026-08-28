import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'

export const dynamic = 'force-dynamic'

/**
 * Biblioteca de patologías.
 *
 * Las fichas se agrupan por segmento anatómico. La consulta va con el usuario
 * de la sesión y sin saltarse el control de acceso, de modo que un lector solo
 * recibe lo publicado: el filtrado ocurre en la base y no en esta página.
 */
export default async function Biblioteca() {
  const payload = await getPayload({ config })
  // Se consulta con el rol efectivo: cuando un editor mira «como residente»,
  // el filtrado lo hace la base y no esta página, de modo que la vista previa
  // enseña exactamente lo que el residente recibiría.
  const { activo, usuarioEfectivo } = await obtenerSesion()
  const user = usuarioEfectivo as never

  if (!activo) {
    return (
      <main>
        <h1>Biblioteca de patologías</h1>
        <div className="tarjeta">
          <p>Necesita una cuenta activa para ver el contenido.</p>
          <a className="boton" href="/admin">Iniciar sesión</a>
        </div>
      </main>
    )
  }

  const [fichas, segmentos] = await Promise.all([
    payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user,
      limit: 200,
      depth: 1,
      sort: 'nombre',
    }),
    payload.find({ collection: 'segmentos', overrideAccess: false, user, limit: 100, sort: 'orden' }),
  ])

  const porSegmento = segmentos.docs.map((s) => ({
    segmento: s,
    fichas: fichas.docs.filter((f) => {
      const seg = f.segmento as { id?: number | string } | number | string | null
      const idSeg = typeof seg === 'object' && seg !== null ? seg.id : seg
      return idSeg === s.id
    }),
  }))

  return (
    <main>
      <nav className="miga">
        <Link href="/">Inicio</Link>
      </nav>
      <h1>Biblioteca de patologías</h1>
      <p className="entrada">
        {fichas.totalDocs === 0
          ? 'Todavía no hay fichas. Se crean desde el panel de contenido.'
          : `${fichas.totalDocs} ${fichas.totalDocs === 1 ? 'ficha' : 'fichas'} en ${segmentos.totalDocs} ${segmentos.totalDocs === 1 ? 'segmento' : 'segmentos'}.`}
      </p>

      {segmentos.totalDocs === 0 ? (
        <div className="tarjeta">
          <p>
            Aún no hay segmentos anatómicos. Son la estructura sobre la que se ordenan las
            fichas y se crean primero.
          </p>
          <a className="boton" href="/admin/collections/segmentos/create">
            Crear el primer segmento
          </a>
        </div>
      ) : (
        porSegmento.map(({ segmento, fichas: lista }) => (
          <section key={segmento.id} className="grupo-segmento">
            <h2>{segmento.nombre as string}</h2>
            {lista.length === 0 ? (
              <p className="vacio">Sin fichas en este segmento todavía.</p>
            ) : (
              <ul className="rejilla-fichas">
                {lista.map((f) => (
                  <li key={f.id}>
                    <Link href={`/biblioteca/${f.id}`} className="tarjeta-ficha">
                      <div className="etiquetas">
                        {f.codigo ? <span className="codigo">{f.codigo as string}</span> : null}
                        {f._status === 'draft' ? <span className="borrador">Borrador</span> : null}
                      </div>
                      <h3>{f.nombre as string}</h3>
                      {f.subtitulo ? <p>{f.subtitulo as string}</p> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </main>
  )
}
