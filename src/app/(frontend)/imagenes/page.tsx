import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Vacio } from '@/components/Estados'

export const dynamic = 'force-dynamic'

export default async function Listado() {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Lectura de imágenes" />

  const payload = await getPayload({ config })
  const resultado = await payload.find({
    collection: 'estudios-ia',
    overrideAccess: false,
    user: usuarioEfectivo as never,
    limit: 200,
    sort: 'nombre',
  })

  return (
    <main>
      <h1>Lectura de imágenes</h1>
      <p className="entrada">Casos de demostración con clasificación propuesta y opciones de manejo.</p>

      {resultado.totalDocs === 0 ? (
        <Vacio
          texto="Todavía no hay contenido en este módulo."
          enlace="/admin/collections/estudios-ia/create"
          accion="Crear el primero"
        />
      ) : (
        <ul className="rejilla-fichas">
          {resultado.docs.map((d) => (
            <li key={d.id}>
              <Link href={`/imagenes/${d.id}`} className="tarjeta-ficha">
                <div className="etiquetas">
                  {d.codigo ? <span className="codigo">{d.codigo as string}</span> : null}
                  {d._status === 'draft' ? <span className="borrador">Borrador</span> : null}
                </div>
                <h3>{d.nombre as string}</h3>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
