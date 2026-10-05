import Link from 'next/link'
import type { Payload } from 'payload'
import {
  Bone,
  ExternalLink,
  FileText,
  Film,
  Layers,
  ListChecks,
  Plus,
  Scissors,
  Stethoscope,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { ESQUEMAS, type EsquemaDeColeccion } from '@/admin/esquema'
import { puedeEditar } from '@/lib/guardias'
import { clientePayload } from '../datos'
import { rutaPublica } from '../modulos'

export const dynamic = 'force-dynamic'

/**
 * El icono de cada colección de apoyo. Un mapa y no un campo del esquema: el
 * esquema (`src/admin/esquema.ts`) no sabe nada de la interfaz, y una
 * colección nueva sin entrada aquí cae al icono genérico de documento.
 */
const ICONO_DE_APOYO: Record<string, LucideIcon> = {
  segmentos: Layers,
  medios: Film,
  'modelos-3d': Layers,
  'huesos-ao': Bone,
  'clasificaciones-ao': ListChecks,
  'tecnicas-quirurgicas': Scissors,
  'fases-quirurgicas': ListChecks,
  instrumental: Wrench,
  maniobras: Stethoscope,
}

const fecha = (valor?: string) =>
  valor
    ? new Date(valor).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

interface ResumenDeColeccion {
  esquema: EsquemaDeColeccion
  publicados: number
  borradores: number
  recientes: { id: string; titulo: string; publicado: boolean; editado?: string }[]
}

async function resumir(payload: Payload, esquema: EsquemaDeColeccion): Promise<ResumenDeColeccion> {
  const contar = async (where?: Record<string, unknown>) => {
    try {
      const { totalDocs } = await payload.count({
        collection: esquema.slug as never,
        ...(where ? { where: where as never } : {}),
        overrideAccess: true,
      })
      return totalDocs
    } catch {
      return 0
    }
  }

  const [publicados, borradores, ultimos] = await Promise.all([
    esquema.versionada ? contar({ _status: { equals: 'published' } }) : contar(),
    esquema.versionada ? contar({ _status: { equals: 'draft' } }) : Promise.resolve(0),
    payload
      .find({
        collection: esquema.slug as never,
        limit: 5,
        sort: '-updatedAt',
        depth: 0,
        draft: esquema.versionada,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as unknown[] })),
  ])

  return {
    esquema,
    publicados,
    borradores,
    recientes: (ultimos.docs as Record<string, unknown>[]).map((doc) => ({
      id: String(doc.id),
      titulo: String(doc[esquema.titulo] ?? doc.filename ?? `#${doc.id}`),
      publicado: doc._status === 'published' || !esquema.versionada,
      editado: doc.updatedAt as string | undefined,
    })),
  }
}

/**
 * Índice del contenido.
 *
 * Es la portada de trabajo del traumatólogo: qué hay en cada módulo, qué quedó
 * a medias y por dónde seguir. Todo lleva al editor propio; nada de aquí sale
 * de la plataforma.
 */
export default async function PaginaContenido() {
  const { sesion } = await exigirPanel()

  // Un editor con módulos asignados solo ve los suyos. Antes se listaban todos
  // y los ajenos se abrían igual: el «no tiene permiso» llegaba al guardar, con
  // la ficha ya escrita. Un administrador, y un editor sin restricción, siguen
  // viéndolo todo.
  const visibles = ESQUEMAS.filter((e) => puedeEditar(sesion.usuario, e.slug))

  const payload = await clientePayload()
  const resumenes = await Promise.all(visibles.map((e) => resumir(payload, e)))

  const modulos = resumenes.filter((r) => r.esquema.familia === 'modulos')
  const apoyo = resumenes.filter((r) => r.esquema.familia === 'apoyo')
  const borradores = modulos.reduce((t, r) => t + r.borradores, 0)

  return (
    <div>
      <CabeceraDePagina
        titulo="Contenido"
        subtitulo={`${modulos.reduce((t, r) => t + r.publicados, 0)} fichas publicadas${
          borradores > 0 ? ` · ${borradores} en borrador` : ''
        }`}
      />

      {borradores > 0 ? (
        <div className="admin-aviso admin-aviso-info">
          <strong>
            Hay {borradores} ficha{borradores === 1 ? '' : 's'} sin publicar.
          </strong>
          Un borrador no lo ve ningún lector, ni siquiera con el enlace directo. Publicarlo es un
          acto explícito desde el editor.
        </div>
      ) : null}

      <PlegarTodo />

      <SeccionPlegable clave="contenido.modulos" titulo="Módulos" resumen={`${modulos.length} módulos`}>
        <div className="admin-grid">
          {modulos.map(({ esquema, publicados, borradores: enBorrador, recientes }) => {
            // El color y el icono del módulo, los mismos de la portada y de la
            // barra del sitio: quien edita reconoce de un vistazo de cuál habla.
            const identidad = IDENTIDAD_DE_MODULO[esquema.slug]
            const Icono = identidad?.icono ?? FileText
            return (
              <div
                key={esquema.slug}
                className={`admin-card tarjeta-modulo${identidad ? ` ${identidad.clase}` : ''}`}
              >
                <div className="tarjeta-modulo-cabeza">
                  <span className="icono-modulo">
                    <Icono aria-hidden size={20} />
                  </span>
                  <div className="tarjeta-modulo-nombre">{esquema.plural}</div>
                </div>
                <div className="admin-card-value admin-card-value-sm">
                  {publicados}
                  {enBorrador > 0 ? <span className="admin-numero-tenue"> +{enBorrador} borr.</span> : null}
                </div>
                <p className="admin-card-note">{esquema.descripcion}</p>

                {recientes.length > 0 ? (
                  <ul className="contenido-recientes">
                    {recientes.map((r) => (
                      <li key={r.id}>
                        <Link href={`/admin-panel/contenido/${esquema.slug}/${r.id}`}>{r.titulo}</Link>
                        {!r.publicado ? <span className="insignia insignia-atencion">borrador</span> : null}
                        <span className="contenido-fecha">{fecha(r.editado)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-card-note">Sin contenido aún.</p>
                )}

                <div className="admin-card-actions">
                  <Link href={`/admin-panel/contenido/${esquema.slug}`} className="admin-btn admin-btn-secondary">
                    Ver todas
                  </Link>
                  <Link href={`/admin-panel/contenido/${esquema.slug}/nuevo`} className="admin-btn admin-btn-primary">
                    <Plus aria-hidden size={16} />
                    Nueva
                  </Link>
                  <Link
                    href={rutaPublica(esquema.slug, '').replace(/\/$/, '')}
                    className="admin-btn admin-btn-ghost"
                  >
                    Ver público
                    <ExternalLink aria-hidden size={14} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </SeccionPlegable>

      <SeccionPlegable clave="contenido.apoyo" titulo="Material de apoyo" resumen={`${apoyo.length} colecciones`}>
        <div className="apoyo-rejilla">
          {apoyo.map(({ esquema, publicados }) => {
            const Icono = ICONO_DE_APOYO[esquema.slug] ?? FileText
            return (
              <Link
                key={esquema.slug}
                href={`/admin-panel/contenido/${esquema.slug}`}
                className="admin-card admin-card-enlace apoyo-tarjeta"
              >
                <span className="icono-modulo">
                  <Icono aria-hidden size={20} />
                </span>
                <div>
                  <div className="admin-card-title">{esquema.plural}</div>
                  <p className="admin-card-note">{esquema.descripcion}</p>
                </div>
                <span className="apoyo-cifra">{publicados}</span>
              </Link>
            )
          })}
        </div>
      </SeccionPlegable>
    </div>
  )
}
