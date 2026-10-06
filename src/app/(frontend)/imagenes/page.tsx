import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeEditar } from '@/lib/guardias'
import { cerradoPorMantencion, puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { SinAcceso, ModuloNoDisponible, SinAccesoAlModulo, Vacio } from '@/components/Estados'
import { CabeceraDeModulo, claseDeModulo } from '@/components/Cabeceras'
import { TarjetaFicha } from '@/components/TarjetaFicha'
import { lecturasDelResidente } from '@/lib/lecturas'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function Listado() {
  const { activo, usuario, rolReal, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Lectura de imágenes" />

  // Antes de consultar, y con el usuario efectivo que va a la consulta: para
  // un módulo que la cuenta no tiene, el `find` de abajo no devuelve una lista
  // vacía sino que lanza `Forbidden`, y eso acababa en la pantalla de avería.
  // El porqué entero está en la cabecera de `SinAccesoAlModulo`.
  // Un módulo en mantención se le cierra al residente con su propia pantalla (D-156).
  const enMantencion = await modulosEnMantencion()
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'estudios-ia', enMantencion)) {
    return cerradoPorMantencion(usuarioEfectivo as UsuarioSesion | null, 'estudios-ia', enMantencion) ? (
      <ModuloNoDisponible titulo="Lectura de imágenes" />
    ) : (
      <SinAccesoAlModulo titulo="Lectura de imágenes" />
    )
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
    (rolReal === 'admin' || rolReal === 'editor') && puedeEditar(usuario ?? {}, 'estudios-ia')

  const payload = await getPayload({ config })
  const resultado = await payload.find({
    collection: 'estudios-ia',
    overrideAccess: false,
    user: usuarioEfectivo as never,
    limit: 200,
    // Solo lo que pinta la tarjeta, y sin poblar relaciones (D-128). Sin esto
    // viajaba cada documento entero, con sus relaciones a dos niveles, para
    // enseñar un código y un nombre.
    depth: 0,
    select: { nombre: true, codigo: true, _status: true },
    sort: 'nombre',
  })

  // Qué casos tiene ya leídos, en una sola consulta para todo el listado: la
  // misma pregunta que hace cada ficha al abrirse (`src/lib/lecturas.ts`), que
  // no lanza si la tabla falla —el listado sale igual, sin la marca—.
  const lecturas = await lecturasDelResidente(
    payload,
    usuarioEfectivo,
    'estudios-ia',
    resultado.docs.map((d) => d.id),
  )

  return (
    <main className={claseDeModulo('estudios-ia')}>
      <CabeceraDeModulo
        slug="estudios-ia"
        enMantencion={enMantencion.includes('estudios-ia')}
        titulo="Lectura de imágenes"
        entradilla="Casos de demostración con clasificación propuesta y opciones de manejo."
        acciones={
          puedeCrear && resultado.totalDocs > 0 ? (
            <Link className="boton boton-secundario boton-sm" href="/admin-panel/contenido/estudios-ia/nuevo">
              <Plus size={16} aria-hidden="true" />
              Nuevo estudio
            </Link>
          ) : null
        }
      />

      {resultado.totalDocs === 0 ? (
        <Vacio
          texto={
            puedeCrear
              ? 'Todavía no hay contenido en este módulo.'
              : 'Todavía no hay estudios publicados en este módulo. El equipo docente los está preparando.'
          }
          enlace={puedeCrear ? '/admin-panel/contenido/estudios-ia/nuevo' : undefined}
          accion={puedeCrear ? 'Crear el primero' : undefined}
        />
      ) : (
        <ul className="rejilla-fichas">
          {resultado.docs.map((d) => (
            <li key={d.id}>
              <TarjetaFicha
                href={`/imagenes/${d.id}`}
                titulo={d.nombre as string}
                codigo={(d.codigo as string) ?? null}
                borrador={d._status === 'draft'}
                leida={lecturas.leida(d.id)}
                accion="Ver estudio"
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
