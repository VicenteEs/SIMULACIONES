import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeEditar } from '@/lib/guardias'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { SinAcceso, SinAccesoAlModulo, Vacio } from '@/components/Estados'

export const dynamic = 'force-dynamic'

export default async function Listado() {
  const { activo, usuario, rolReal, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Simulador quirúrgico" />

  // Antes de consultar, y con el usuario efectivo que va a la consulta: para
  // un módulo que la cuenta no tiene, el `find` de abajo no devuelve una lista
  // vacía sino que lanza `Forbidden`, y eso acababa en la pantalla de avería.
  // El porqué entero está en la cabecera de `SinAccesoAlModulo`.
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'cirugias')) {
    return <SinAccesoAlModulo titulo="Simulador quirúrgico" />
  }

  // El enlace del estado vacío lleva al panel, que devuelve a la portada sin
  // mensaje a quien no es admin ni editor (`admin-panel/acceso.ts`). Para el
  // residente que entra el primer día —la plataforma nace vacía por decisión
  // (D-016)— ese era el único botón de la pantalla, y pulsarlo lo sacaba del
  // módulo sin explicación: se lee como una avería, no como contenido que
  // todavía no está. Se usa `rolReal`, no el efectivo, igual que la portada.
  const puedeCrear =
    (rolReal === 'admin' || rolReal === 'editor') && puedeEditar(usuario ?? {}, 'cirugias')

  const payload = await getPayload({ config })
  const resultado = await payload.find({
    collection: 'cirugias',
    overrideAccess: false,
    user: usuarioEfectivo as never,
    limit: 200,
    sort: 'nombre',
  })

  return (
    <main>
      <h1>Simulador quirúrgico</h1>
      <p className="entrada">Paso a paso con instrumental y control de la fuerza aplicada.</p>

      {resultado.totalDocs === 0 ? (
        <Vacio
          texto={
            puedeCrear
              ? 'Todavía no hay contenido en este módulo.'
              : 'Todavía no hay cirugías publicadas en este módulo. El equipo docente las está preparando.'
          }
          enlace={puedeCrear ? '/admin-panel/contenido/cirugias/nuevo' : undefined}
          accion={puedeCrear ? 'Crear el primero' : undefined}
        />
      ) : (
        <ul className="rejilla-fichas">
          {resultado.docs.map((d) => (
            <li key={d.id}>
              <Link href={`/simulador/${d.id}`} className="tarjeta-ficha">
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
