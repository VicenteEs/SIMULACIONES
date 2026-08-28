import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { pestanasConContenido } from '@/lib/fichas'
import { Bloques } from '@/components/Bloques'

export const dynamic = 'force-dynamic'

/**
 * Ficha de patología.
 *
 * El acceso se resuelve en la consulta: se pasa el usuario de la sesión y se
 * deja que Payload aplique las reglas. Si la ficha es un borrador y quien mira
 * es un lector, la consulta no la devuelve y aquí llega un 404, que es lo
 * correcto: un lector no debe poder distinguir entre «no existe» y «existe pero
 * no puedes verla».
 */
export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await siguientesCabeceras() })

  if (!user || !(user as { activo?: boolean }).activo) {
    return (
      <main>
        <div className="tarjeta">
          <p>Necesita una cuenta activa para ver esta ficha.</p>
          <a className="boton" href="/admin">Iniciar sesión</a>
        </div>
      </main>
    )
  }

  const ficha = await payload
    .findByID({ collection: 'patologias', id, overrideAccess: false, user, depth: 2 })
    .catch(() => null)

  if (!ficha) notFound()

  const pestanas = pestanasConContenido(ficha as never)
  const segmento = ficha.segmento as { nombre?: string } | undefined

  return (
    <main>
      <nav className="miga">
        <Link href="/biblioteca">Biblioteca</Link>
        {segmento?.nombre ? <span> · {segmento.nombre}</span> : null}
      </nav>

      <header className="cabecera-ficha">
        <h1>{ficha.nombre as string}</h1>
        {ficha.subtitulo ? <p className="entrada">{ficha.subtitulo as string}</p> : null}
        <div className="etiquetas">
          {ficha.codigo ? <span className="codigo">{ficha.codigo as string}</span> : null}
          {segmento?.nombre ? <span className="etiqueta">{segmento.nombre}</span> : null}
        </div>
      </header>

      {pestanas.length === 0 ? (
        <div className="tarjeta">
          <p>Esta ficha aún no tiene contenido publicado.</p>
        </div>
      ) : (
        pestanas.map((p) => (
          <section key={p.campo} className="pestana" id={p.campo}>
            <h2>{p.etiqueta}</h2>
            <Bloques bloques={ficha[p.campo as keyof typeof ficha]} />
            {p.campo === 'rehabilitacion' && Array.isArray(ficha.fases) ? (
              <ol className="fases">
                {(ficha.fases as Record<string, string>[]).map((f, i) => (
                  <li key={i}>
                    <span className="fase-cuando">{f.cuando}</span>
                    <h4>{f.titulo}</h4>
                    <p>{f.contenido}</p>
                    {f.criterio ? (
                      <p className="fase-criterio">
                        <strong>Para progresar:</strong> {f.criterio}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ))
      )}
    </main>
  )
}
