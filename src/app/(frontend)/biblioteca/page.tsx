import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Vacio } from '@/components/Estados'
import { BibliotecaFiltrable } from '@/components/BibliotecaFiltrable'

export const dynamic = 'force-dynamic'

/**
 * Biblioteca de patologías.
 *
 * El servidor consulta con el rol efectivo y sin saltarse el control de acceso,
 * de modo que un lector solo recibe lo publicado: el filtrado por permisos
 * ocurre en la base. Lo que hace el componente cliente es solo buscar y filtrar
 * sobre esa lista ya autorizada.
 */
export default async function Biblioteca() {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Biblioteca de patologías" />

  const payload = await getPayload({ config })
  const user = usuarioEfectivo as never

  const [fichas, segmentos] = await Promise.all([
    payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user,
      limit: 500,
      depth: 1,
      sort: 'nombre',
    }),
    payload.find({ collection: 'segmentos', overrideAccess: false, user, limit: 100, sort: 'orden' }),
  ])

  const idDe = (relacion: unknown): number | string | null => {
    if (relacion && typeof relacion === 'object') return (relacion as { id: number | string }).id
    return (relacion as number | string | null) ?? null
  }

  const lista = fichas.docs.map((f) => ({
    id: f.id,
    nombre: f.nombre as string,
    subtitulo: (f.subtitulo as string) ?? null,
    codigo: (f.codigo as string) ?? null,
    tipo: (f.tipo as string) ?? null,
    segmentoId: idDe(f.segmento),
    borrador: f._status === 'draft',
  }))

  const listaSegmentos = segmentos.docs.map((s) => ({ id: s.id, nombre: s.nombre as string }))

  return (
    <main>
      <nav className="miga">
        <Link href="/">Inicio</Link>
      </nav>
      <h1>Biblioteca de patologías</h1>
      <p className="entrada">
        Fichas estructuradas por segmento. Cada una termina en recomendaciones de manejo y una
        pestaña dedicada a rehabilitación.
      </p>

      {segmentos.totalDocs === 0 ? (
        <Vacio
          texto="Aún no hay segmentos anatómicos. Son la estructura sobre la que se ordenan las fichas y se crean primero."
          enlace="/admin/collections/segmentos/create"
          accion="Crear el primer segmento"
        />
      ) : fichas.totalDocs === 0 ? (
        <Vacio
          texto="Todavía no hay fichas escritas."
          enlace="/admin/collections/patologias/create"
          accion="Crear la primera ficha"
        />
      ) : (
        <BibliotecaFiltrable fichas={lista} segmentos={listaSegmentos} />
      )}
    </main>
  )
}
