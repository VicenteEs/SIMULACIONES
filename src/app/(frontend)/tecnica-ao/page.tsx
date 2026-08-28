import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Vacio } from '@/components/Estados'

export const dynamic = 'force-dynamic'

export default async function Listado() {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Técnica AO" />

  const payload = await getPayload({ config })
  const resultado = await payload.find({
    collection: 'casos-ao',
    overrideAccess: false,
    user: usuarioEfectivo as never,
    limit: 200,
    sort: 'titulo',
  })

  return (
    <main>
      <h1>Técnica AO</h1>
      <p className="entrada">La secuencia quirúrgica con el principio AO que sustenta cada gesto.</p>

      {resultado.totalDocs === 0 ? (
        <Vacio
          texto="Todavía no hay contenido en este módulo."
          enlace="/admin/collections/casos-ao/create"
          accion="Crear el primero"
        />
      ) : (
        <ul className="rejilla-fichas">
          {resultado.docs.map((d) => (
            <li key={d.id}>
              <Link href={`/tecnica-ao/${d.id}`} className="tarjeta-ficha">
                <div className="etiquetas">
                  {d.codigo ? <span className="codigo">{d.codigo as string}</span> : null}
                  {d._status === 'draft' ? <span className="borrador">Borrador</span> : null}
                </div>
                <h3>{d.titulo as string}</h3>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
