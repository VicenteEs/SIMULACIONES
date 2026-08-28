import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Miga } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'

export const dynamic = 'force-dynamic'

export default async function Estudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Lectura de imágenes" />

  const payload = await getPayload({ config })
  const estudio = await payload
    .findByID({
      collection: 'estudios-ia',
      id,
      overrideAccess: false,
      user: usuarioEfectivo as never,
      depth: 1,
    })
    .catch(() => null)
  if (!estudio) notFound()

  const hallazgos = Array.isArray(estudio.hallazgos)
    ? (estudio.hallazgos as Record<string, string>[])
    : []
  const opciones = Array.isArray(estudio.opciones)
    ? (estudio.opciones as Record<string, unknown>[])
    : []

  return (
    <main>
      <Miga href="/imagenes" texto="Lectura de imágenes" />

      {/* La advertencia va arriba y no al pie: quien lee un resultado debe
          saber antes que no hay ningún modelo detrás. */}
      <aside className="advertencia error-frecuente">
        <span className="advertencia-etiqueta">Demostración</span>
        <p>
          No existe un modelo de inferencia: estos resultados están escritos a mano. No apto para
          uso clínico ni para decisiones sobre pacientes.
        </p>
      </aside>

      <header className="cabecera-ficha">
        <h1>{estudio.nombre as string}</h1>
        <div className="etiquetas">
          {estudio.codigo ? <span className="codigo">{estudio.codigo as string}</span> : null}
          {typeof estudio.confianza === 'number' ? (
            <span className="etiqueta">Confianza declarada: {estudio.confianza}%</span>
          ) : null}
        </div>
      </header>

      {hallazgos.length > 0 ? (
        <section className="pestana">
          <h2>Hallazgos</h2>
          <ul className="lista-clinica">
            {hallazgos.map((h, i) => (
              <li key={i}>{h.texto}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {opciones.length > 0 ? (
        <section className="pestana">
          <h2>Opciones de manejo</h2>
          {opciones.map((o, i) => {
            const aFavor = Array.isArray(o.aFavor) ? (o.aFavor as Record<string, string>[]) : []
            const enContra = Array.isArray(o.enContra) ? (o.enContra as Record<string, string>[]) : []
            return (
              <article key={i} className="opcion">
                <h3>
                  {o.titulo as string}
                  {o.frecuente ? <span className="etiqueta"> Indicación más frecuente</span> : null}
                </h3>
                <div className="pros-contras">
                  <div>
                    <h4>A favor</h4>
                    <ul>
                      {aFavor.map((a, j) => (
                        <li key={j}>{a.texto}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>En contra</h4>
                    <ul>
                      {enContra.map((a, j) => (
                        <li key={j}>{a.texto}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      ) : null}

      <Bloques bloques={estudio.contenido} />

      <p className="aviso">
        Las opciones se muestran como apoyo docente. La decisión es del cirujano tratante y depende
        del paciente, del entorno y del material disponible.
      </p>
    </main>
  )
}
