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
  if (!activo) return <SinAcceso titulo="Técnica AO" />

  // Antes de consultar, y con el usuario efectivo que va a la consulta: para
  // un módulo que la cuenta no tiene, el `find` de abajo no devuelve una lista
  // vacía sino que lanza `Forbidden`, y eso acababa en la pantalla de avería.
  // El porqué entero está en la cabecera de `SinAccesoAlModulo`.
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'casos-ao')) {
    return <SinAccesoAlModulo titulo="Técnica AO" />
  }

  // El enlace del estado vacío lleva al panel, que devuelve a la portada sin
  // mensaje a quien no es admin ni editor (`admin-panel/acceso.ts`). La
  // plataforma nace vacía por decisión (D-016), así que para el residente que
  // entra el primer día ese era el único botón de la pantalla, y pulsarlo lo
  // sacaba del módulo sin explicación: se lee como una avería, no como
  // contenido que todavía no está. Se usa `rolReal`, no el efectivo, igual que
  // la portada y que los otros tres listados: la vista previa baja la lectura,
  // no el acceso al panel. `puedeEditar` añade el permiso por módulo, para que
  // un editor restringido a otro módulo no reciba un enlace que el guardado le
  // va a rechazar.
  const puedeCrear =
    (rolReal === 'admin' || rolReal === 'editor') && puedeEditar(usuario ?? {}, 'casos-ao')

  const payload = await getPayload({ config })
  const resultado = await payload.find({
    collection: 'casos-ao',
    overrideAccess: false,
    user: usuarioEfectivo as never,
    limit: 200,
    // Solo lo que pinta la tarjeta, y sin poblar relaciones (D-128). Sin esto
    // viajaba cada documento entero, con sus relaciones a dos niveles, para
    // enseñar un código y un nombre.
    depth: 0,
    select: { titulo: true, codigo: true, _status: true },
    sort: 'titulo',
  })

  return (
    <main>
      <h1>Técnica AO</h1>
      <p className="entrada">La secuencia quirúrgica con el principio AO que sustenta cada gesto.</p>

      {resultado.totalDocs === 0 ? (
        <Vacio
          texto={
            puedeCrear
              ? 'Todavía no hay contenido en este módulo.'
              : 'Todavía no hay casos publicados en este módulo. El equipo docente los está preparando.'
          }
          enlace={puedeCrear ? '/admin-panel/contenido/casos-ao/nuevo' : undefined}
          accion={puedeCrear ? 'Crear el primero' : undefined}
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
