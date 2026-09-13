import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { conversoresRicos } from '@/components/Rico'
import { Visor3D, VisorInstancia } from './VisoresPerezosos'

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
      {/* Con los convertidores de la casa, no con los de Payload: los suyos
          emiten `<a href={url}>` tal cual, y eso deja el enlace del autor sin
          `ruta()` —404 bajo el prefijo—, sin pasar por `enlaceSeguro` y
          abriéndose en otra pestaña aunque apunte a esta misma plataforma. */}
      {bloque.cuerpo ? (
        <RichText data={bloque.cuerpo as never} converters={conversoresRicos} />
      ) : null}
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
  const video = bloque.video as { url?: string; alt?: string; mimeType?: string } | undefined
  if (!video?.url) return null
  return (
    <figure className="figura completo">
      {/* El `alt` de `medios` es obligatorio y se le pide al autor con el
          rótulo «Descripción para lectores de pantalla»: aquí es donde tiene
          que llegar. Sin él el reproductor se anuncia como «video, botón
          reproducir» y nada más, y el residente no tiene con qué decidir si
          vale la pena reproducirlo. El `<figcaption>` no sirve: nombra a la
          `<figure>`, no al reproductor. */}
      <video controls preload="metadata" src={video.url} aria-label={video.alt} />
      {typeof bloque.pie === 'string' && bloque.pie ? <figcaption>{bloque.pie}</figcaption> : null}
    </figure>
  )
}

function BloqueModelo3D({ bloque }: { bloque: Bloque }) {
  const modelo = bloque.modelo as { nombre?: string; url?: string } | undefined
  const encuadre = (bloque.encuadre ?? {}) as Record<string, number>

  // Aquí no ha fallado ninguna descarga: el visor ni se monta. O el autor no
  // eligió modelo en el desplegable, o la relación quedó en nulo porque alguien
  // borró el archivo del catálogo. El texto anterior hablaba de una carga
  // fallida y mandaba al traumatólogo a buscar la avería en el servidor, con el
  // campo vacío a dos clics en su propio editor.
  if (!modelo?.url) {
    return (
      <figure className="figura completo">
        <div className="visor-3d-marco">
          <span className="visor-3d-nombre">Este bloque no tiene modelo</span>
          <span className="visor-3d-nota">
            No se eligió ningún archivo 3D, o el modelo que tenía se eliminó del catálogo.
          </span>
        </div>
      </figure>
    )
  }

  return (
    <figure className="figura completo">
      <Visor3D url={modelo.url} encuadre={encuadre} nombre={modelo.nombre} />
      {typeof bloque.pie === 'string' && bloque.pie ? <figcaption>{bloque.pie}</figcaption> : null}
    </figure>
  )
}

function BloqueInstanciaAtlas({ bloque }: { bloque: Bloque }) {
  const preparacion = bloque.preparacion as
    | { contenido?: unknown; nombre?: string }
    | undefined
  const contenido = preparacion?.contenido as
    | { piezas?: unknown[]; vista?: unknown }
    | undefined

  // La relación puede quedar en nulo si alguien borró la preparación: se avisa
  // en lugar de romper la ficha entera.
  if (!contenido || !Array.isArray(contenido.piezas) || contenido.piezas.length === 0) {
    return (
      <figure className="figura completo">
        <div className="visor-3d-marco">
          <span className="visor-3d-nombre">Preparación no disponible</span>
          <span className="visor-3d-nota">
            La preparación anatómica de este bloque ya no existe.
          </span>
        </div>
      </figure>
    )
  }

  return (
    <VisorInstancia
      contenido={contenido as never}
      pie={typeof bloque.pie === 'string' ? bloque.pie : undefined}
    />
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
  'instancia-atlas': BloqueInstanciaAtlas,
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
