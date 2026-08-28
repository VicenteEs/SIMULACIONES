import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Miga, Vacio } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { Visor3D } from '@/components/Visor3D'

export const dynamic = 'force-dynamic'

export default async function CasoAO({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Técnica AO" />

  const payload = await getPayload({ config })
  const caso = await payload
    .findByID({
      collection: 'casos-ao',
      id,
      overrideAccess: false,
      user: usuarioEfectivo as never,
      depth: 2,
    })
    .catch(() => null)
  if (!caso) notFound()

  const pasos = Array.isArray(caso.pasos) ? (caso.pasos as Record<string, unknown>[]) : []

  return (
    <main>
      <Miga href="/tecnica-ao" texto="Técnica AO" />
      <header className="cabecera-ficha">
        <h1>{caso.titulo as string}</h1>
        {caso.procedimiento ? <p className="entrada">{caso.procedimiento as string}</p> : null}
        {caso.codigo ? (
          <div className="etiquetas">
            <span className="codigo">{caso.codigo as string}</span>
          </div>
        ) : null}
      </header>

      {pasos.length === 0 ? (
        <Vacio texto="Este caso todavía no tiene pasos escritos." />
      ) : (
        <ol className="pasos-ao">
          {pasos.map((p, i) => {
            const modelo = p.modelo as { url?: string; nombre?: string } | undefined
            return (
              <li key={i}>
                <span className="paso-numero">Paso {i + 1}</span>
                <h2>{p.titulo as string}</h2>
                <p>{p.descripcion as string}</p>
                {p.principio ? (
                  <aside className="advertencia perla">
                    <span className="advertencia-etiqueta">Principio AO</span>
                    <p>{p.principio as string}</p>
                  </aside>
                ) : null}
                {p.nota ? <p className="nota-tecnica">{p.nota as string}</p> : null}
                {modelo?.url ? <Visor3D url={modelo.url} nombre={modelo.nombre} /> : null}
              </li>
            )
          })}
        </ol>
      )}

      <Bloques bloques={caso.contenido} />
    </main>
  )
}
