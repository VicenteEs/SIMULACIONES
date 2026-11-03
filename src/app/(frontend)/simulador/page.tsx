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
import { codigoDelCaso } from '@/lib/casoQuirurgico'
import { segmentoDeLaPlataforma } from '@/lib/clasificacionAO'
import { FiguraDelSegmento, tieneFigura } from '@/components/FiguraDelSegmento'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function Listado() {
  const { activo, usuario, rolReal, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Simulador quirúrgico" />

  // Antes de consultar, y con el usuario efectivo que va a la consulta: para
  // un módulo que la cuenta no tiene, el `find` de abajo no devuelve una lista
  // vacía sino que lanza `Forbidden`, y eso acababa en la pantalla de avería.
  // El porqué entero está en la cabecera de `SinAccesoAlModulo`.
  // Un módulo en mantención se le cierra al residente con su propia pantalla (D-156).
  const enMantencion = await modulosEnMantencion()
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'cirugias', enMantencion)) {
    return cerradoPorMantencion(usuarioEfectivo as UsuarioSesion | null, 'cirugias', enMantencion) ? (
      <ModuloNoDisponible titulo="Simulador quirúrgico" />
    ) : (
      <SinAccesoAlModulo titulo="Simulador quirúrgico" />
    )
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
    // Solo lo que pinta la tarjeta (D-128). Sin esto viajaba cada documento
    // entero, con sus relaciones a dos niveles, para enseñar un código y un
    // nombre.
    //
    // Desde D-237 la tarjeta enseña también el hueso, el recorte del atlas y
    // «N pasos · N puntos», así que se pide un nivel de relaciones, pero de
    // cada una solo su nombre y su código (`populate`), y de cada paso solo sus
    // puntos. El código del caso puede no estar escrito: se compone con el del
    // hueso y el de la clasificación, como en la consola (`codigoDelCaso`).
    depth: 1,
    select: { nombre: true, codigo: true, _status: true, hueso: true, clasificacion: true, pasos: { puntos: true } },
    populate: {
      'huesos-ao': { nombre: true, codigo: true },
      'clasificaciones-ao': { nombre: true, codigo: true },
    },
    sort: 'nombre',
  })

  // Qué casos tiene ya leídos, en una sola consulta para todo el listado: la
  // misma pregunta que hace cada ficha al abrirse (`src/lib/lecturas.ts`), que
  // no lanza si la tabla falla —el listado sale igual, sin la marca—.
  const lecturas = await lecturasDelResidente(
    payload,
    usuarioEfectivo,
    'cirugias',
    resultado.docs.map((d) => d.id),
  )

  return (
    <main className={claseDeModulo('cirugias')}>
      <CabeceraDeModulo
        slug="cirugias"
        enMantencion={enMantencion.includes('cirugias')}
        titulo="Simulador quirúrgico"
        entradilla="Paso a paso con instrumental y control de la fuerza aplicada."
        acciones={
          puedeCrear && resultado.totalDocs > 0 ? (
            <Link className="boton boton-secundario boton-sm" href="/admin-panel/contenido/cirugias/nuevo">
              <Plus size={16} aria-hidden="true" />
              Nueva cirugía
            </Link>
          ) : null
        }
      />

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
          {resultado.docs.map((d) => {
            const codigo = codigoDelCaso(d as never)
            const segmento = segmentoDeLaPlataforma(codigo)
            const hueso = typeof d.hueso === 'object' && d.hueso ? (d.hueso as { nombre?: string }).nombre : null
            const pasos = Array.isArray(d.pasos) ? d.pasos : []
            const puntos = pasos.reduce((suma, p) => suma + (typeof p.puntos === 'number' ? p.puntos : 0), 0)
            return (
              <li key={d.id}>
                <TarjetaFicha
                  href={`/simulador/${d.id}`}
                  titulo={d.nombre as string}
                  codigo={codigo}
                  resumen={hueso}
                  borrador={d._status === 'draft'}
                  leida={lecturas.leida(d.id)}
                  antetitulo={segmento}
                  figura={segmento && tieneFigura(segmento) ? <FiguraDelSegmento segmento={segmento} /> : undefined}
                  insignias={
                    pasos.length > 0 ? (
                      <span className="etiqueta">
                        {pasos.length} {pasos.length === 1 ? 'paso' : 'pasos'} · {puntos} puntos
                      </span>
                    ) : undefined
                  }
                  accion="Abrir caso"
                />
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
