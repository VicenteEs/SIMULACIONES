import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'

/**
 * Renderizado de los bloques de contenido.
 *
 * El texto llega como árbol JSON estructurado y se pinta con componentes
 * propios (decisión D-014). En ninguna parte de este archivo hay
 * `dangerouslySetInnerHTML`: esa es la razón por la que un autor no puede
 * inyectar comportamiento en la página aunque escriba etiquetas.
 */

type Bloque = { blockType?: string; id?: string; [clave: string]: unknown }

const ETIQUETA_TONO: Record<string, string> = {
  atencion: 'Atención',
  'error-frecuente': 'Error frecuente',
  perla: 'Perla clínica',
}

function BloqueTexto({ bloque }: { bloque: Bloque }) {
  return (
    <section className="bloque">
      {typeof bloque.titulo === 'string' && bloque.titulo ? <h3>{bloque.titulo}</h3> : null}
      {bloque.cuerpo ? <RichText data={bloque.cuerpo as never} /> : null}
    </section>
  )
}

function BloqueLista({ bloque }: { bloque: Bloque }) {
  const puntos = Array.isArray(bloque.puntos) ? (bloque.puntos as Bloque[]) : []
  return (
    <section className="bloque">
      {typeof bloque.titulo === 'string' && bloque.titulo ? <h3>{bloque.titulo}</h3> : null}
      <ul className="lista-clinica">
        {puntos.map((p, i) => (
          <li key={(p.id as string) ?? i}>
            {typeof p.destacado === 'string' && p.destacado ? <strong>{p.destacado} </strong> : null}
            {typeof p.texto === 'string' ? p.texto : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function BloqueClasificacion({ bloque }: { bloque: Bloque }) {
  const filas = Array.isArray(bloque.filas) ? (bloque.filas as Bloque[]) : []
  return (
    <section className="bloque">
      {typeof bloque.titulo === 'string' ? <h3>{bloque.titulo}</h3> : null}
      <div className="tabla-desplazable">
        <table className="clasificacion">
          <tbody>
            {filas.map((f, i) => (
              <tr key={(f.id as string) ?? i}>
                <th scope="row">{typeof f.clave === 'string' ? f.clave : null}</th>
                <td>{typeof f.descripcion === 'string' ? f.descripcion : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BloqueAdvertencia({ bloque }: { bloque: Bloque }) {
  const tono = typeof bloque.tono === 'string' ? bloque.tono : 'atencion'
  return (
    <aside className={`advertencia ${tono}`}>
      <span className="advertencia-etiqueta">{ETIQUETA_TONO[tono] ?? ETIQUETA_TONO.atencion}</span>
      <p>{typeof bloque.texto === 'string' ? bloque.texto : null}</p>
    </aside>
  )
}

function BloqueImagen({ bloque }: { bloque: Bloque }) {
  const imagen = bloque.imagen as { url?: string; alt?: string } | undefined
  if (!imagen?.url) return null
  const ancho = typeof bloque.ancho === 'string' ? bloque.ancho : 'completo'
  return (
    <figure className={`figura ${ancho}`}>
      {/* Se usa img y no next/image: los archivos los sube el autor y sus
          dimensiones no se conocen de antemano. */}
      <img src={imagen.url} alt={imagen.alt ?? ''} loading="lazy" />
      {typeof bloque.pie === 'string' && bloque.pie ? <figcaption>{bloque.pie}</figcaption> : null}
    </figure>
  )
}

function BloqueVideo({ bloque }: { bloque: Bloque }) {
  const video = bloque.video as { url?: string; mimeType?: string } | undefined
  if (!video?.url) return null
  return (
    <figure className="figura completo">
      <video controls preload="metadata" src={video.url} />
      {typeof bloque.pie === 'string' && bloque.pie ? <figcaption>{bloque.pie}</figcaption> : null}
    </figure>
  )
}

function BloqueModelo3D({ bloque }: { bloque: Bloque }) {
  const modelo = bloque.modelo as { nombre?: string; url?: string } | undefined
  return (
    <figure className="figura completo visor-3d">
      <div className="visor-3d-marco">
        <span className="visor-3d-nombre">{modelo?.nombre ?? 'Modelo tridimensional'}</span>
        <span className="visor-3d-nota">Visor interactivo pendiente de integración</span>
      </div>
      {typeof bloque.pie === 'string' && bloque.pie ? <figcaption>{bloque.pie}</figcaption> : null}
    </figure>
  )
}

const RENDERIZADORES: Record<string, React.ComponentType<{ bloque: Bloque }>> = {
  texto: BloqueTexto,
  'lista-clinica': BloqueLista,
  'tabla-clasificacion': BloqueClasificacion,
  advertencia: BloqueAdvertencia,
  imagen: BloqueImagen,
  video: BloqueVideo,
  'modelo-3d': BloqueModelo3D,
}

export function Bloques({ bloques }: { bloques: unknown }) {
  if (!Array.isArray(bloques)) return null
  return (
    <>
      {(bloques as Bloque[]).map((bloque, i) => {
        const Componente = RENDERIZADORES[bloque.blockType ?? '']
        // Un bloque desconocido se omite en silencio en lugar de romper la
        // pagina: puede venir de una version anterior del modelo de contenido.
        if (!Componente) return null
        return <Componente key={bloque.id ?? i} bloque={bloque} />
      })}
    </>
  )
}
