import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { conversoresRicos } from '@/components/Rico'
import { encuadreVigente, type Encuadre } from '@/lib/encuadre'
import { leerTablaPegada, trozosDeLaCelda } from '@/lib/tablaPegada'
import { Visor3D, VisorInstancia } from './VisoresPerezosos'
import { Info, Lightbulb, OctagonAlert, type LucideIcon } from 'lucide-react'

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

/**
 * Tabla de Vera Health: el texto pegado, leído con `leerTablaPegada`.
 *
 * Comparte envoltorio con `.clasificacion` —el mismo marco, el mismo desborde
 * horizontal en el teléfono— y solo añade lo suyo en `.tabla-vera`
 * (`estilos.css`), de modo que el aspecto de las dos tablas se gobierna junto.
 * Cada celda se pinta como texto de React: lo pegado no puede traer HTML a la
 * ficha.
 */
function BloqueTablaVera({ bloque }: { bloque: Bloque }) {
  const leida = leerTablaPegada(bloque.tabla)
  // Una tabla que ya no se lee —se guardó como borrador sin reconocer— no se
  // enseña a medias: el título solo, o nada, es mejor que una tabla rota.
  if (!leida.ok) return null
  const { encabezados, filas, alineaciones } = leida.tabla
  return (
    <section className="bloque">
      {typeof bloque.titulo === 'string' && bloque.titulo ? <h3>{bloque.titulo}</h3> : null}
      <div className="tabla-desplazable">
        <table className="tabla-vera">
          <thead>
            <tr>
              {encabezados.map((e, i) => (
                <th key={i} scope="col" data-alinea={alineaciones[i] ?? undefined}>
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((celda, j) => (
                  <td key={j} data-alinea={alineaciones[j] ?? undefined}>
                    <TextoDeCelda celda={celda} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {typeof bloque.pie === 'string' && bloque.pie ? (
        <p className="tabla-vera-pie">{bloque.pie}</p>
      ) : null}
    </section>
  )
}

/** Los saltos de línea y la negrita de una celda, sin tocar el HTML. */
function TextoDeCelda({ celda }: { celda: string }) {
  return (
    <>
      {celda.split('\n').map((linea, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <br /> : null}
          {trozosDeLaCelda(linea).map((t, j) => (t.negrita ? <strong key={j}>{t.texto}</strong> : t.texto))}
        </React.Fragment>
      ))}
    </>
  )
}

/** El icono de cada tono: se reconoce el tipo de aviso antes de leer el rótulo. */
const ICONO_TONO: Record<string, LucideIcon> = {
  atencion: Info,
  'error-frecuente': OctagonAlert,
  perla: Lightbulb,
}

function BloqueAdvertencia({ bloque }: { bloque: Bloque }) {
  const tono = typeof bloque.tono === 'string' ? bloque.tono : 'atencion'
  const Icono = ICONO_TONO[tono] ?? Info
  return (
    <aside className={`advertencia ${tono}`}>
      <span className="advertencia-etiqueta">
        <Icono size={15} aria-hidden="true" />
        {ETIQUETA_TONO[tono] ?? ETIQUETA_TONO.atencion}
      </span>
      <p>{typeof bloque.texto === 'string' ? bloque.texto : null}</p>
    </aside>
  )
}

function BloqueImagen({ bloque }: { bloque: Bloque }) {
  const imagen = bloque.imagen as
    | { url?: string; alt?: string; width?: number | null; height?: number | null }
    | undefined
  if (!imagen?.url) return null
  const ancho = typeof bloque.ancho === 'string' ? bloque.ancho : 'completo'
  return (
    <figure className={`figura ${ancho}`}>
      {/* Sigue siendo `img` y no `next/image`: el archivo lo sube el autor a
          `medios` y la dirección la arma Payload, no el árbol de `public`.

          Lo que no era cierto es la otra mitad de lo que decía aquí este
          comentario —que las dimensiones «no se conocen de antemano»—, y con eso
          mandaba al siguiente a no intentarlo: Payload las mide al subir el
          archivo (`Medio.width` y `Medio.height` en `payload-types.ts`) y la
          ficha se lee con `depth: 2`, así que llegan pobladas. Puestas en los
          atributos, el navegador calcula la proporción y reserva el hueco antes
          de descargar nada; sin ellas, y con `loading="lazy"`, cada imagen
          clínica empujaba el texto hacia abajo justo mientras el residente lo
          estaba leyendo.

          No fijan píxeles: `.figura img` conserva en `estilos.css` su
          `max-width: 100%` con `height: auto`, y es esa pareja la que hace que
          los atributos aporten solo la proporción. Un medio subido antes de que
          Payload guardara medidas cae en `undefined` y se pinta como hasta
          ahora: sin reserva, pero sin romperse. */}
      <img
        src={imagen.url}
        alt={imagen.alt ?? ''}
        width={imagen.width ?? undefined}
        height={imagen.height ?? undefined}
        loading="lazy"
      />
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
  // El `encuadre` del modelo llega poblado porque las fichas se leen con
  // profundidad 1 o más, que es la misma lectura que trae la `url`: si alguna
  // bajara a 0, aquí no habría dirección que abrir y el bloque saldría por el
  // aviso de abajo antes de llegar al encuadre.
  const modelo = bloque.modelo as
    | { nombre?: string; url?: string; encuadre?: Encuadre | null }
    | undefined

  // Manda el del bloque; si el bloque no dice nada, el del modelo; si ninguno
  // dice nada, el visor lo encuadra solo. La regla y su porqué —incluido por
  // qué no puede ser un `??`— están en `encuadreVigente` (`src/lib/encuadre.ts`),
  // que es también quien la comparte con las demás pantallas que abren un
  // modelo del catálogo.
  const encuadre = encuadreVigente(
    bloque.encuadre as Encuadre | null | undefined,
    modelo?.encuadre,
  )

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
  'tabla-vera-health': BloqueTablaVera,
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
