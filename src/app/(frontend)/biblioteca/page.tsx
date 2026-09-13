import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeEditar } from '@/lib/guardias'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { SinAcceso, SinAccesoAlModulo, Vacio } from '@/components/Estados'
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
  const { activo, usuario, rolReal, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Biblioteca de patologías" />

  // Antes de consultar, y con el usuario efectivo que va a la consulta: para
  // un módulo que la cuenta no tiene, el `find` de las fichas no devuelve una
  // lista vacía sino que lanza `Forbidden`, y eso acababa en la pantalla de
  // avería. El porqué entero está en la cabecera de `SinAccesoAlModulo`.
  //
  // Se pregunta por `patologias` y no por `segmentos`: los segmentos son
  // material de apoyo de los cinco módulos y no admiten restricción, así que
  // se leerían igual, y lo que decide si esta página es de la cuenta son las
  // fichas. La guardia va antes de las dos consultas para no pedir segmentos
  // que no se van a pintar.
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'patologias')) {
    return <SinAccesoAlModulo titulo="Biblioteca de patologías" />
  }

  const payload = await getPayload({ config })
  const user = usuarioEfectivo as never

  // El botón del estado vacío lleva al panel, y el panel echa a la portada sin
  // una palabra a quien no es admin ni editor (`admin-panel/acceso.ts`). Como
  // la plataforma nace vacía a propósito (D-016), esa pantalla es la primera
  // que ve un residente el primer día, y su único botón lo expulsaba del
  // módulo: sin error y sin mensaje, no tenía forma de distinguir un permiso
  // que le falta de una plataforma rota. Es el mismo fallo que `acceso.ts`
  // describe como su razón de existir, resuelto para el editor y no para el
  // lector.
  //
  // Se mira `rolReal` y no el rol efectivo, igual que hace la portada con el
  // botón «Escribir contenido»: la vista previa baja los privilegios de
  // lectura, pero quien la tiene puesta sigue pudiendo entrar al panel, y
  // ofrecerle un enlace que sí funciona no engaña a nadie.
  //
  // `puedeEditar` añade encima el permiso por módulo: un editor restringido a
  // «maniobras» tampoco debe ver aquí un enlace que la acción de guardado le
  // va a rechazar.
  const esEditor = rolReal === 'admin' || rolReal === 'editor'
  const puedeCrearFichas = esEditor && puedeEditar(usuario ?? {}, 'patologias')
  const puedeCrearSegmentos = esEditor && puedeEditar(usuario ?? {}, 'segmentos')

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
          texto={
            puedeCrearSegmentos
              ? 'Aún no hay segmentos anatómicos. Son la estructura sobre la que se ordenan las fichas y se crean primero.'
              : // Al lector no se le cuenta la diferencia entre «faltan
                // segmentos» y «faltan fichas»: es un detalle interno del panel,
                // y lo que necesita es un texto que cierre en vez de un botón
                // que abre en falso.
                'El equipo docente todavía no ha publicado fichas en este módulo. Las está preparando.'
          }
          enlace={puedeCrearSegmentos ? '/admin-panel/contenido/segmentos/nuevo' : undefined}
          accion={puedeCrearSegmentos ? 'Crear el primer segmento' : undefined}
        />
      ) : fichas.totalDocs === 0 ? (
        <Vacio
          texto={
            puedeCrearFichas
              ? 'Todavía no hay fichas escritas.'
              : 'El equipo docente todavía no ha publicado fichas en este módulo. Las está preparando.'
          }
          enlace={puedeCrearFichas ? '/admin-panel/contenido/patologias/nuevo' : undefined}
          accion={puedeCrearFichas ? 'Crear la primera ficha' : undefined}
        />
      ) : (
        <BibliotecaFiltrable fichas={lista} segmentos={listaSegmentos} />
      )}
    </main>
  )
}
