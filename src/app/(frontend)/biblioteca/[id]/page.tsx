import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { pestanasConContenido } from '@/lib/fichas'
import { SinAcceso } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { IndiceFicha } from '@/components/IndiceFicha'

import { FormularioComentario } from '@/components/FormularioComentario'

import { BotonImprimir } from '@/components/BotonImprimir'
import { RastreadorActividad } from '@/components/RastreadorActividad'

export const dynamic = 'force-dynamic'

/**
 * Ficha de patología.
 */
export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Biblioteca de patologías" />

  const payload = await getPayload({ config })
  const user = usuarioEfectivo as never

  const ficha = await payload
    .findByID({ collection: 'patologias', id, overrideAccess: false, user, depth: 2 })
    .catch(() => null)

  if (!ficha) notFound()

  const userId = (usuarioEfectivo as { id?: string | number } | null)?.id

  // Buscar actividad previa para saber si ya está leída
  const actividadQuery = userId
    ? await payload.find({
        collection: 'actividad',
        where: {
          and: [
            { usuario: { equals: userId } },
            { coleccion: { equals: 'patologias' } },
            { documentoId: { equals: id } },
          ],
        },
        user,
        limit: 1,
      })
    : { docs: [] }
  
  const completadoInicial = actividadQuery.docs.length > 0 ? Boolean((actividadQuery.docs[0] as any).completado) : false

  const pestanas = pestanasConContenido(ficha as never)
  const segmento = ficha.segmento as { nombre?: string } | undefined

  return (
    <main>
      <nav className="miga" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <Link href="/biblioteca">Biblioteca</Link>
          {segmento?.nombre ? <span> · {segmento.nombre}</span> : null}
        </div>
        <BotonImprimir />
      </nav>

      <header className="cabecera-ficha">
        <h1>{ficha.nombre as string}</h1>
        {ficha.subtitulo ? <p className="entrada">{ficha.subtitulo as string}</p> : null}
        <div className="etiquetas">
          {ficha.codigo ? <span className="codigo">{ficha.codigo as string}</span> : null}
          {segmento?.nombre ? <span className="etiqueta">{segmento.nombre}</span> : null}
        </div>
        <RastreadorActividad coleccion="patologias" documentoId={id} completadoInicial={completadoInicial as boolean} />
      </header>

      <div className="ficha-cuerpo">
        <IndiceFicha pestanas={pestanas} />
        <div className="ficha-contenido">
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
        </div>
      </div>
      
      <FormularioComentario coleccion="patologias" documentoId={id} />
    </main>
  )
}
