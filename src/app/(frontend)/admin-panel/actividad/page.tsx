import Link from 'next/link'
import { BookOpen, BookOpenCheck, Check, ExternalLink, Pencil, Scissors, Users } from 'lucide-react'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { BarrasHorizontales, MapaDeCalor, Minigrafico, NoSePudoLeer, SinDatos, type Punto } from '@/components/admin/Graficos'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { Cifra } from '@/components/admin/tablero/Cifra'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { Vacio } from '@/components/ui/Vacio'
import { NOMBRE_DEL_DESENLACE } from '@/lib/progresoDelSimulador'
import { FiltroDeQuien } from '@/components/admin/FiltroDeQuien'
import { cifra, variacion } from '@/lib/graficos'
import { iniciales } from '@/lib/iniciales'
import { leerTodas } from '@/lib/leerTodas'
import { etiquetaDeRolEnRegistro } from '@/lib/permisos'
import { QUIEN_EN_PALABRAS, entraEnLoPedido, esDelEquipo, filasDeQuien, quienDeLaConsulta, type QuienLee } from '@/lib/seguimiento'
import { diasEntre, leerFecha, ultimosDias } from '@/lib/series'
import {
  DIAS_DE_LA_SEMANA,
  franjaConMasUso,
  franjaEnPalabras,
  mapaDeUso,
  parteEntreSemana,
  resumirLecturas,
} from '@/lib/tableroDeActividad'
import { clientePayload, resumenDeActividad } from '../datos'
import { NOMBRE_DE_MODULO, rutaPublica } from '../modulos'
import {
  claveDeFicha,
  leerTitulosDeFichas,
  type EstadoDeFicha,
  type ReferenciaDeFicha,
} from '../titulosDeFichas'
import '../seguimiento.css'
import './actividad.css'

export const dynamic = 'force-dynamic'

/** Lo que cubren las cifras de lectura, y lo mismo antes, para la flecha. */
const DIAS_DEL_PERIODO = 30
/** El mapa de calor: cuatro semanas enteras, para que cada día de la semana sume las mismas veces. */
const DIAS_DEL_MAPA = 28
/** Lo que dibujan los minigráficos, de las cifras y de cada persona. */
const DIAS_DIBUJADOS = 14
/** Más que esto sin abrir una ficha y la persona sale nombrada debajo de su tabla. */
const DIAS_SIN_LEER = 7

const HORAS = Array.from({ length: 24 }, (_, hora) => `${hora} h`)

const TITULO_DE_LOS_ACTIVOS: Record<QuienLee, string> = {
  todos: 'Personas activas',
  residentes: 'Residentes activos',
  equipo: 'Equipo activo',
}

const porcentaje = (parte: number, total: number) => (total === 0 ? 0 : Math.round((parte / total) * 100))

/**
 * Cómo se nombra una ficha en las tablas de esta página.
 *
 * El número de fila solo aparece cuando no hay título que poner, y entonces va
 * con la razón delante —borrada, sin título, no se pudo leer— para que no
 * parezca un rótulo sino lo que es. Son los mismos cuatro casos que rotula
 * «Fichas más leídas» en estadísticas (`rotularFichasLeidas`), con la misma
 * redacción, para que una ficha no se llame de dos maneras según la pantalla.
 *
 * `eliminada` llega de fuera porque la tabla del simulador habla de casos y las
 * otras de fichas, y en español el participio concuerda.
 */
function rotuloDeFicha(estado: EstadoDeFicha, documentoId: string, eliminada: string): string {
  switch (estado.tipo) {
    case 'titulo':
      return estado.titulo
    case 'sinTitulo':
      return `Sin título · #${documentoId}`
    case 'eliminada':
      return `${eliminada} · #${documentoId}`
    case 'ilegible':
      return `Título no disponible · #${documentoId}`
  }
}

/**
 * La insignia del módulo, con su color: en «Fichas más leídas» y «Últimas
 * visitas» se reconoce de un vistazo de qué módulo es cada fila, como en el
 * resto de la plataforma. Un módulo que ya no existe sale neutro.
 */
function InsigniaDeModulo({ coleccion }: { coleccion: string }) {
  const identidad = IDENTIDAD_DE_MODULO[coleccion]
  const nombre = NOMBRE_DE_MODULO[coleccion] ?? coleccion
  if (!identidad) return <span className="insignia insignia-neutra">{nombre}</span>
  const Icono = identidad.icono
  return (
    <span className={`insignia insignia-acento seguimiento-modulo ${identidad.clase}`}>
      <Icono aria-hidden size={12} />
      {nombre}
    </span>
  )
}

/**
 * «Equipo» junto al nombre de quien es administrador o editor, para que se vea a primera vista quién es residente y quién
 * prueba la plataforma (D-175). El residente no lleva marca: es el caso normal, y marcarlo llenaría la tabla.
 */
function InsigniaDeRol({ rol }: { rol: string }) {
  if (!esDelEquipo(rol)) return null
  return (
    <span className="insignia insignia-neutra seguimiento-rol" title={rol === 'admin' ? 'Administrador' : 'Editor'}>
      Equipo
    </span>
  )
}

const fechaHora = (valor?: string | null) =>
  valor
    ? new Date(valor).toLocaleString('es-CL', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

interface Registro {
  id: string
  usuarioId: string
  usuarioNombre: string
  usuarioCorreo: string
  /** El rol real de la cuenta, para saber si es equipo o residente. Vacío si la cuenta ya no existe. */
  rol: string
  coleccion: string
  documentoId: string
  completado: boolean
  ultimaVisita: string | null
}

interface PorPersona {
  usuarioId: string
  nombre: string
  correo: string
  rol: string
  visitadas: number
  completadas: number
  ultima: string | null
}

/**
 * Actividad de lectura y recorridos del simulador.
 *
 * Responde a tres preguntas distintas y las presenta por separado, porque
 * mezclarlas no informa de nada: quién está usando la plataforma (una fila por
 * persona), qué se está leyendo (una fila por ficha) y dónde se atasca la gente
 * en pabellón (una fila por paso del guion). Las dos primeras dicen si el
 * material llega a alguien y qué contenido vale la pena ampliar; la tercera, qué
 * gesto hay que explicar mejor.
 *
 * No es vigilancia del residente: son visitas a fichas de estudio, sin tiempos
 * ni recorridos. Sirve para decidir dónde poner el esfuerzo de redacción. Y el
 * puntaje del simulador no es una nota —lo calcula el navegador y el servidor no
 * lo puede recalcular—, así que se enseña dicho en la propia pantalla.
 *
 * Encima de las tablas, el tablero de Penpot (P-007 E5, D-238): cuatro cifras
 * de los últimos 30 días, cuándo se estudia y en qué paso del simulador se
 * equivoca la gente. Todo respeta «Lecturas de»: con «solo residentes», el
 * mapa de calor es el de los residentes y no el de quien prueba la plataforma.
 * Las tablas siguen plegables y con memoria, como pidió el dueño; el tablero
 * no, porque es lo que se viene a mirar.
 *
 * Los tiempos del mapa son por día y hora sumados entre todas las cuentas, no
 * de nadie en particular: dicen a qué hora conviene mandar un aviso, no a qué
 * hora estudia cada residente.
 */
export default async function PaginaActividad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirPanel('admin')
  const quien = quienDeLaConsulta((await searchParams).quien)

  const payload = await clientePayload()

  // Las dos consultas van juntas y ninguna espera a la otra: la de abajo trae
  // la tabla para las tablas de lectura y `resumenDeActividad` cuenta los
  // recorridos del simulador, que es lo que sabe qué fila es un caso jugado.
  //
  // El `catch` de la tabla devuelve `null` y no una lista vacía. Devolvía
  // `{ docs: [], totalDocs: 0 }`, y con la tabla sin poder leerse —lo corriente:
  // un cambio de esquema desplegado sin su migración— la pantalla decía
  // «Todavía nadie ha abierto una ficha»: la misma confusión entre «no hay» y
  // «no se pudo leer» que los títulos de abajo arrastraban con «Ficha
  // eliminada», y que las tarjetas del resumen dejaron de cometer con
  // `ilegible`.
  //
  // Todas las filas y no las mil más recientes (D-175): con el tope, «Por persona» y «Fichas más leídas» eran un recuento de
  // las últimas mil filas presentado como el total. La cuenta de cada fila se pide aparte y una sola vez —nombre, correo y
  // rol—, en vez de poblarla fila por fila, y de ella sale también la separación entre el equipo y los residentes.
  //
  // El tablero lee dos tablas más, cada una con su `null` si falla, por lo mismo que el listado: las lecturas del
  // registro de acciones —sesenta días, para comparar los últimos treinta con los anteriores— y el tiempo activo de las
  // cuatro últimas semanas, que es el del mapa de calor.
  const desdeLecturas = (leerFecha(ultimosDias(2 * DIAS_DEL_PERIODO)[0].clave) ?? new Date(0)).toISOString()
  const desdeElMapa = ultimosDias(DIAS_DEL_MAPA)[0].clave
  const [listado, cuentas, resumen, eventos, tiempos] = await Promise.all([
    leerTodas(payload, { coleccion: 'actividad', sort: '-ultimaVisita' }).catch((error) => {
      console.error('[panel] no se pudo leer la tabla de actividad:', error)
      return null
    }),
    leerTodas(payload, {
      coleccion: 'usuarios',
      select: { nombre: true, email: true, rol: true, activo: true, pendiente: true },
    }).catch((error) => {
      console.error('[panel] no se pudieron leer las cuentas de la actividad:', error)
      return null
    }),
    resumenDeActividad(payload, quien),
    leerTodas(payload, {
      coleccion: 'registro-de-acciones',
      where: { and: [{ accion: { equals: 'lectura' } }, { fecha: { greater_than_equal: desdeLecturas } }] },
      select: { fecha: true, usuario: true, coleccion: true, documentoId: true, detalle: true },
    }).catch((error) => {
      console.error('[panel] no se pudieron leer las lecturas de la actividad:', error)
      return null
    }),
    // `dia` es texto «AAAA-MM-DD», y comparado como texto ordena igual que la fecha: es como lo filtra el registro.
    leerTodas(payload, {
      coleccion: 'tiempo-activo',
      where: { dia: { greater_than_equal: desdeElMapa } },
      select: { usuario: true, dia: true, porHora: true },
    }).catch((error) => {
      console.error('[panel] no se pudo leer el tiempo activo de la actividad:', error)
      return null
    }),
  ])
  const infoDe = new Map(
    (cuentas?.docs ?? []).map((c) => [
      String(c.id),
      {
        nombre: typeof c.nombre === 'string' && c.nombre ? c.nombre : '',
        correo: typeof c.email === 'string' ? c.email : '—',
        rol: typeof c.rol === 'string' ? c.rol : '',
        // Una cuenta desactivada o por aprobar que no lee no es una noticia: no se nombra en el aviso de abajo.
        habilitada: c.activo === true && c.pendiente !== true,
      },
    ]),
  )
  const rolDe = new Map([...infoDe].map(([id, c]) => [id, c.rol]))
  // Sin cuentas no se puede separar a nadie: se enseña todo y se avisa, en vez de rotular «solo residentes» lo que no lo es.
  const sinRoles = cuentas === null && quien !== 'todos'
  const vista: QuienLee = sinRoles ? 'todos' : quien
  const deQuien = <T extends Record<string, unknown>>(filas: readonly T[]): T[] =>
    sinRoles ? [...filas] : filasDeQuien(filas, quien, rolDe)
  const todasLasFilas = (listado?.docs ?? []) as Record<string, unknown>[]
  const docs = deQuien(todasLasFilas)
  const totalDocs = docs.length

  // --- el tablero -----------------------------------------------------------
  const lecturas = eventos ? resumirLecturas(deQuien(eventos.docs), { dias: DIAS_DEL_PERIODO, dibujados: DIAS_DIBUJADOS }) : null
  const mapa = tiempos ? mapaDeUso(deQuien(tiempos.docs)) : null
  const franja = mapa ? franjaConMasUso(mapa) : null
  const entreSemana = mapa ? parteEntreSemana(mapa) : null
  // «De 39 con cuenta»: las cuentas habilitadas del lado que se mira. Las personas activas se cuentan dentro de ellas, para
  // que el porcentaje no pase de cien con lecturas de una cuenta que después se desactivó.
  const conCuenta =
    cuentas === null
      ? null
      : new Set([...infoDe].filter(([, c]) => c.habilitada && entraEnLoPedido(vista, c.rol)).map(([id]) => id))
  const activas = lecturas
    ? conCuenta
      ? [...lecturas.personas].filter((id) => conCuenta.has(id)).length
      : lecturas.personas.size
    : null
  const delEquipo = todasLasFilas.filter((d) => esDelEquipo(rolDe.get(String(d.usuario)))).length
  const simulador = resumen.simulador
  const atascos = simulador.atascos.slice(0, 20)

  const registros: Registro[] = docs.map((d) => {
    const id = String(d.usuario ?? '')
    const cuenta = infoDe.get(id)
    return {
      id: String(d.id),
      usuarioId: id,
      usuarioNombre: cuenta ? cuenta.nombre || cuenta.correo : 'Cuenta eliminada',
      usuarioCorreo: cuenta?.correo ?? '—',
      rol: cuenta?.rol ?? '',
      coleccion: String(d.coleccion ?? ''),
      documentoId: String(d.documentoId ?? ''),
      completado: d.completado === true,
      ultimaVisita: (d.ultimaVisita as string) ?? null,
    }
  })

  // Una fila por persona.
  const porPersona = new Map<string, PorPersona>()
  for (const r of registros) {
    const actual = porPersona.get(r.usuarioId) ?? {
      usuarioId: r.usuarioId,
      nombre: r.usuarioNombre,
      correo: r.usuarioCorreo,
      rol: r.rol,
      visitadas: 0,
      completadas: 0,
      ultima: null,
    }
    actual.visitadas += 1
    if (r.completado) actual.completadas += 1
    if (r.ultimaVisita && (!actual.ultima || r.ultimaVisita > actual.ultima)) {
      actual.ultima = r.ultimaVisita
    }
    porPersona.set(r.usuarioId, actual)
  }
  // Por fichas abiertas, como en Penpot: arriba quien más usa la plataforma. Antes iba por la última visita, que cambia
  // de orden cada vez que alguien entra y no dice nada que no diga ya su columna.
  const personas = [...porPersona.values()].sort(
    (a, b) => b.visitadas - a.visitadas || (b.ultima ?? '').localeCompare(a.ultima ?? ''),
  )

  // Los residentes que llevan más de una semana sin abrir una ficha, de más a menos días. Solo cuentas que existen y
  // están habilitadas, y solo residentes: que un editor no lea no es una alarma.
  const sinVolver =
    vista === 'equipo'
      ? []
      : personas
          .filter((p) => infoDe.get(p.usuarioId)?.habilitada === true && !esDelEquipo(p.rol))
          .map((p) => ({ nombre: p.nombre, dias: diasEntre(p.ultima) }))
          .filter((p): p is { nombre: string; dias: number } => p.dias !== null && p.dias > DIAS_SIN_LEER)
          .sort((a, b) => b.dias - a.dias)

  // Una fila por ficha, ordenada por número de lectores.
  const porFicha = new Map<string, { coleccion: string; documentoId: string; lectores: number; completadas: number }>()
  for (const r of registros) {
    const clave = `${r.coleccion}/${r.documentoId}`
    const actual = porFicha.get(clave) ?? {
      coleccion: r.coleccion,
      documentoId: r.documentoId,
      lectores: 0,
      completadas: 0,
    }
    actual.lectores += 1
    if (r.completado) actual.completadas += 1
    porFicha.set(clave, actual)
  }
  const fichas = [...porFicha.values()].sort((a, b) => b.lectores - a.lectores).slice(0, 20)
  const ultimas = registros.slice(0, 30)

  // Las dos tablas de fichas nombraban cada una con el identificador de fila de
  // la base —«#3», «#17», «#41»—, en la página cuyo único propósito es
  // responder qué se está leyendo: para saber cuál era la ficha más leída del
  // semestre había que abrirlas de una en una.
  //
  // Los títulos los busca `leerTitulosDeFichas`, la misma que usan
  // «Fichas más leídas» de estadísticas y la bandeja de comentarios. Aquí se
  // hacía con un `findByID` por ficha y un `catch` vacío, y ese `catch` era el
  // defecto: `findByID` lanza igual con la ficha borrada que con la base sin
  // responder, así que una tabla caída pintaba las cincuenta filas como «Ficha
  // eliminada» y mandaba a buscar en los respaldos algo que estaba en su sitio.
  // La función compartida separa las dos cosas, y de paso son cinco consultas
  // como mucho —una por colección— y no cincuenta.
  //
  // Un `documentoId` vacío no se pregunta: en el `id: { in: … }` de su colección
  // basta con que la base lo rechace para que falle la consulta entera y todo
  // ese módulo salga ilegible por culpa de una fila.
  const porResolver = new Map<string, ReferenciaDeFicha>()
  const pedir = (coleccion: string, documentoId: string) => {
    if (coleccion === '' || documentoId === '') return
    porResolver.set(claveDeFicha(coleccion, documentoId), { coleccion, documentoId })
  }
  for (const f of [...fichas, ...ultimas]) pedir(f.coleccion, f.documentoId)
  // Los casos donde alguien se atascó entran en el mismo barrido: casi siempre
  // ya están —un caso que se juega se visita—, y el mapa los deduplica solo. Sin
  // esto, la tabla de abajo nombraría la cirugía con el número de fila, que es
  // justo lo que esta pantalla dejó de hacer.
  for (const atasco of atascos) pedir('cirugias', atasco.documentoId)

  const estados = await leerTitulosDeFichas(payload, [...porResolver.values()])

  // Una ficha que no llegó a preguntarse no tiene estado. Llamarla «eliminada»
  // sería inventárselo; `ilegible` es lo único que no afirma nada sobre ella.
  // Es el mismo criterio que `estadoDeLaFicha` en `fichasMasLeidas.ts`.
  const estadoDe = (coleccion: string, documentoId: string): EstadoDeFicha =>
    estados.get(claveDeFicha(coleccion, documentoId)) ?? { tipo: 'ilegible' }

  const modulosIlegibles = Array.from(
    new Set(
      [...porResolver.values()]
        .filter((f) => estadoDe(f.coleccion, f.documentoId).tipo === 'ilegible')
        .map((f) => NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion),
    ),
  )

  // «Dónde se equivocan más»: los cinco pasos con más gestos que dañaron, nombrados con el caso y el paso como en la
  // tabla de abajo. La etiqueta es también la clave de cada barra, así que dos pasos que se llamaran igual —un guion
  // reordenado que dejó dos «paso 3» del mismo caso— se distinguen por su identificador en vez de pisarse.
  const vistas = new Set<string>()
  const pasosConMasDano: Punto[] = atascos.slice(0, 5).map((atasco) => {
    const caso = rotuloDeFicha(estadoDe('cirugias', atasco.documentoId), atasco.documentoId, 'Caso eliminado')
    const paso = [atasco.numero ? `paso ${atasco.numero}` : null, atasco.titulo].filter(Boolean).join(', ') || 'paso sin título'
    let etiqueta = `${caso} · ${paso}`
    if (vistas.has(etiqueta)) etiqueta = `${etiqueta} (${atasco.paso})`
    vistas.add(etiqueta)
    const personasConDano = `${atasco.residentes} persona${atasco.residentes === 1 ? '' : 's'}`
    return { etiqueta, valor: atasco.veces, detalle: `${etiqueta} · a ${personasConDano}` }
  })

  return (
    <div>
      <CabeceraDePagina
        titulo="Actividad"
        // Sin listado no hay recuento que dar: «0 registros» sería la misma
        // respuesta falsa que el aviso de abajo existe para no dar.
        subtitulo={
          listado ? (
            <>
              {totalDocs} registro{totalDocs === 1 ? '' : 's'} de lectura · {personas.length}{' '}
              persona
              {personas.length === 1 ? '' : 's'} han abierto alguna ficha
              {quien === 'todos' ? '' : ` (${QUIEN_EN_PALABRAS[quien]})`}
            </>
          ) : undefined
        }
      />

      {/* El filtro va aunque no se haya podido leer el listado: el tablero de abajo sale de otras tablas y también lo
          respeta. Lo que se calla es la nota, que cuenta filas del listado. */}
      <FiltroDeQuien
        actual={quien}
        ruta="/admin-panel/actividad"
        nota={listado ? `${todasLasFilas.length - delEquipo} de residentes · ${delEquipo} del equipo` : undefined}
      />

      {sinRoles ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudieron leer las cuentas.</strong> Sin ellas no se puede separar al equipo de los residentes, así
          que lo que se ve aquí es de todas las cuentas aunque se haya pedido otra cosa. El detalle queda en el registro
          del servidor.
        </div>
      ) : null}

      {modulosIlegibles.length > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudieron leer los títulos de {modulosIlegibles.join(', ')}.</strong> Esas
          fichas aparecen como «Título no disponible», y eso no significa que se hayan eliminado:
          la consulta falló. El detalle queda en el registro del servidor.
        </div>
      ) : null}

      {listado === null ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudo leer la tabla de actividad.</strong> Esto no significa que nadie haya
          abierto una ficha: la consulta falló. Lo corriente es que falte una tabla —un cambio de
          esquema desplegado sin su migración—; el detalle queda en el registro del servidor.
        </div>
      ) : null}

      <div className="tablero-cifras">
        <Cifra
          titulo={TITULO_DE_LOS_ACTIVOS[vista]}
          icono={Users}
          tono="ok"
          ilegible={lecturas === null}
          valor={activas === null ? '—' : cifra(activas)}
          serie={lecturas?.personasPorDia}
          descripcionDeLaSerie="Personas distintas que abrieron alguna ficha cada día de las últimas dos semanas."
          nota={
            activas === null
              ? 'no se pudo leer el registro de lecturas'
              : conCuenta && conCuenta.size > 0
                ? `de ${cifra(conCuenta.size)} con cuenta · ${porcentaje(activas, conCuenta.size)} % · abrieron alguna ficha en 30 días`
                : 'abrieron alguna ficha en los últimos 30 días'
          }
        />
        <Cifra
          titulo="Fichas abiertas"
          icono={BookOpen}
          tono="info"
          ilegible={lecturas === null}
          valor={lecturas ? cifra(lecturas.aperturas) : '—'}
          cambio={(() => {
            const v = lecturas ? variacion(lecturas.aperturas, lecturas.aperturasAntes) : null
            return v === null ? null : { valor: v, respecto: 'que los 30 días anteriores' }
          })()}
          serie={lecturas?.aperturasPorDia}
          descripcionDeLaSerie="Fichas abiertas cada día de las últimas dos semanas."
          nota={lecturas ? 'aperturas en los últimos 30 días' : 'no se pudo leer el registro de lecturas'}
        />
        <Cifra
          titulo="Marcadas como leídas"
          icono={BookOpenCheck}
          tono="info"
          ilegible={lecturas === null}
          valor={lecturas ? cifra(lecturas.marcadas) : '—'}
          serie={lecturas?.marcasPorDia}
          descripcionDeLaSerie="Fichas marcadas como leídas cada día de las últimas dos semanas."
          nota={
            lecturas === null
              ? 'no se pudo leer el registro de lecturas'
              : lecturas.abiertas > 0
                ? `${porcentaje(lecturas.marcadasDeLoAbierto, lecturas.abiertas)} % de lo abierto · en 30 días`
                : 'en los últimos 30 días'
          }
        />
        {/* De siempre y sin minigráfico: la fila de `actividad` guarda el último recorrido de cada caso, no cuándo se
            jugó cada uno, y una línea por fecha de visita contaría el mismo caso en el día en que se volvió a abrir. */}
        <Cifra
          titulo="Casos del simulador"
          icono={Scissors}
          tono="info"
          ilegible={simulador.ilegible}
          valor={simulador.ilegible ? '—' : cifra(simulador.casos)}
          nota={
            simulador.ilegible
              ? 'no se pudieron leer los recorridos'
              : simulador.casos === 0
                ? 'nadie ha recorrido un caso todavía'
                : `recorridos · ${porcentaje(simulador.casos - simulador.casosConComplicacion, simulador.casos)} % sin ninguna complicación`
          }
        />
      </div>

      <div className="tablero-fila">
        <TarjetaDeGrafico
          titulo="Cuándo se estudia"
          className="actividad-calor"
          bajada={`Minutos con la plataforma a la vista, según día y hora · últimas 4 semanas${
            vista === 'todos' ? '' : ` · ${QUIEN_EN_PALABRAS[vista]}`
          }`}
          ilegible={mapa === null}
        >
          {mapa === null ? (
            <NoSePudoLeer que="el tiempo activo" />
          ) : (
            <>
              <MapaDeCalor
                titulo="Minutos activos por día de la semana y hora, en las últimas cuatro semanas"
                filas={[...DIAS_DE_LA_SEMANA]}
                columnas={HORAS}
                valores={mapa.map((horas) => horas.map((segundos) => Math.round(segundos / 60)))}
                unidad="min"
                cadaCuantasColumnas={3}
              />
              {/* Lo que el dibujo dice, en una frase y con sus números: el pico y cuánto cae entre semana. Penpot
                  añadía un consejo —a qué hora mandar un aviso—, que es una conclusión de quien mira y no un dato. */}
              {franja ? (
                <p className="actividad-nota">
                  La franja con más uso es {franjaEnPalabras(franja)}
                  {entreSemana === null ? '.' : `, y el ${Math.round(entreSemana * 100)} % del tiempo cae de lunes a viernes.`}
                </p>
              ) : null}
            </>
          )}
        </TarjetaDeGrafico>

        <TarjetaDeGrafico
          titulo="Dónde se equivocan más"
          bajada="Simulador quirúrgico · gestos que dañaron, por paso del guion"
          ilegible={simulador.ilegible}
          className="actividad-atascos"
        >
          {simulador.ilegible ? (
            <NoSePudoLeer que="los recorridos del simulador" />
          ) : pasosConMasDano.length === 0 ? (
            <SinDatos
              texto={
                simulador.casos === 0
                  ? 'Todavía nadie ha recorrido un caso del simulador.'
                  : 'Ningún paso ha dado complicaciones todavía.'
              }
            />
          ) : (
            <BarrasHorizontales
              titulo="Pasos del simulador con más gestos que dañaron"
              datos={pasosConMasDano}
              formato={(v) => `${cifra(v)} ${v === 1 ? 'vez' : 'veces'}`}
            />
          )}
        </TarjetaDeGrafico>
      </div>

      {listado === null ? null : registros.length === 0 ? (
        <Vacio icono={BookOpen} titulo="Todavía nadie ha abierto una ficha.">
          El registro empieza en cuanto una cuenta activa visita contenido publicado.
        </Vacio>
      ) : (
        <>
          {/* Cuatro tablas apiladas, plegables y con memoria (pedido del
              dueño): quien solo mira el simulador no baja por encima de una
              fila por residente. */}
          <PlegarTodo />

          <SeccionPlegable
            clave="actividad.personas"
            titulo="Por persona"
            resumen={`${personas.length} persona${personas.length === 1 ? '' : 's'}`}
          >
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Rol</th>
                    <th>Fichas abiertas</th>
                    <th>Marcadas como leídas</th>
                    <th>Últimos {DIAS_DIBUJADOS} días</th>
                    <th>Última visita</th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map((p) => {
                    const leidas = porcentaje(p.completadas, p.visitadas)
                    // Las aperturas de cada día, del registro de acciones. «Fichas abiertas» son las distintas de
                    // siempre, de `actividad`; la línea dice si ese número sigue creciendo o se paró.
                    const serie = lecturas?.aperturasDe.get(p.usuarioId)
                    const enLaQuincena = serie?.reduce((t, v) => t + v, 0) ?? 0
                    return (
                      <tr key={p.usuarioId}>
                        <td>
                          <div className="actividad-persona">
                            <span className="actividad-persona-circulo" aria-hidden>
                              {iniciales(p.nombre)}
                            </span>
                            <div>
                              <div className="admin-table-user-name">{p.nombre}</div>
                              <div className="admin-table-user-email">{p.correo}</div>
                            </div>
                          </div>
                        </td>
                        <td>{etiquetaDeRolEnRegistro(p.rol)}</td>
                        <td className="u-num">{p.visitadas}</td>
                        <td className="seguimiento-celda-progreso u-num">
                          {p.completadas}
                          <span className="admin-numero-tenue"> · {leidas}%</span>
                          <div className="admin-progreso" aria-hidden="true">
                            <div
                              className="admin-progreso-relleno"
                              style={{ width: `${leidas}%` }}
                            />
                          </div>
                        </td>
                        <td className="actividad-celda-tendencia">
                          {lecturas === null ? (
                            '—'
                          ) : serie && enLaQuincena > 0 ? (
                            <Minigrafico
                              valores={serie}
                              ancho={88}
                              alto={26}
                              descripcion={`${enLaQuincena} apertura${enLaQuincena === 1 ? '' : 's'} en los últimos ${DIAS_DIBUJADOS} días`}
                            />
                          ) : (
                            <span className="admin-numero-tenue">sin aperturas</span>
                          )}
                        </td>
                        <td className="u-nowrap">{fechaHora(p.ultima)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Lo que en Penpot cierra la tabla: quién dejó de leer. Con los días y sin conclusión: el panel ve que
                no abrió nada, no por qué. */}
            {sinVolver.length > 0 ? (
              <div className="admin-aviso admin-aviso-atencion actividad-aviso" role="status">
                <strong>
                  {sinVolver.length === 1
                    ? `${sinVolver[0].nombre} lleva ${sinVolver[0].dias} días sin abrir una ficha.`
                    : `${sinVolver.length} residentes llevan más de ${DIAS_SIN_LEER} días sin abrir una ficha:`}
                </strong>
                {sinVolver.length > 1
                  ? ` ${sinVolver
                      .slice(0, 4)
                      .map((p) => `${p.nombre} (${p.dias} días)`)
                      .join(', ')}${sinVolver.length > 4 ? ` y ${sinVolver.length - 4} más` : ''}.`
                  : ''}{' '}
                Lo que muestra el panel es lo que pasó, no por qué: conviene preguntar antes de suponer.
              </div>
            ) : null}
          </SeccionPlegable>

          {/* ------------------------------------------------- simulador --
              La mitad visible de lo que la consola guarda. Sin ella, el puntaje
              y las complicaciones vuelven a ser tres columnas que se escriben y
              no lee nadie, que es de donde vienen. */}
          <SeccionPlegable
            clave="actividad.simulador"
            titulo="Simulador quirúrgico"
            resumen={
              simulador.ilegible
                ? undefined
                : `${simulador.casos} caso${simulador.casos === 1 ? '' : 's'} recorrido${simulador.casos === 1 ? '' : 's'}`
            }
          >

            {simulador.ilegible ? (
              <div className="admin-aviso admin-aviso-error">
                <strong>No se pudieron leer los recorridos.</strong>
                Aquí no hay un recuento, hay una consulta que falló: el fallo queda
                en el registro del servidor.
              </div>
            ) : simulador.casos === 0 ? (
              <p className="seguimiento-nota">
                Todavía nadie ha recorrido un caso del simulador. El registro
                empieza en cuanto un residente supera el primer paso.
              </p>
            ) : (
              <>
                {/* Antes de la primera cifra, no debajo: quien mira una tabla de
                    números la interpreta mientras la lee, y el puntaje se parece
                    demasiado a una nota. La advertencia detrás llegaría tarde. */}
                <div className="admin-aviso admin-aviso-atencion">
                  <strong>El puntaje no es una calificación.</strong>
                  Lo calcula la consola en el navegador del residente y el servidor
                  no puede recalcularlo sin repetir la simulación, así que un
                  residente podría escribir el suyo. Sirve para ver quién ha
                  recorrido qué y qué gesto se le atraviesa a la gente, no para
                  evaluar a nadie.
                </div>

                <p className="seguimiento-nota">
                  {simulador.casos} caso{simulador.casos === 1 ? '' : 's'} recorrido
                  {simulador.casos === 1 ? '' : 's'} ·{' '}
                  {simulador.casosConComplicacion} con alguna complicación ·{' '}
                  {simulador.complicaciones} gesto
                  {simulador.complicaciones === 1 ? '' : 's'} que dañaron
                </p>

                {atascos.length === 0 ? (
                  <p className="seguimiento-nota">
                    Ningún paso ha dado complicaciones todavía.
                  </p>
                ) : (
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Caso</th>
                          <th>Paso</th>
                          <th>Qué pasó</th>
                          <th>Veces</th>
                          <th>Residentes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {atascos.map((atasco) => {
                          const clave = claveDeFicha('cirugias', atasco.documentoId)
                          const estado = estadoDe('cirugias', atasco.documentoId)
                          const rotulo = rotuloDeFicha(estado, atasco.documentoId, 'Caso eliminado')
                          return (
                            <tr key={`${clave}#${atasco.paso}`}>
                              <th scope="row" className="admin-table-user-name">
                                {estado.tipo === 'eliminada' ? (
                                  rotulo
                                ) : (
                                  <Link
                                    href={`/admin-panel/contenido/cirugias/${atasco.documentoId}`}
                                  >
                                    {rotulo}
                                  </Link>
                                )}
                              </th>
                              <td>
                                {/* El número y el título son la copia de cómo vio
                                    el paso quien lo jugó: el identificador deja de
                                    encontrar nada en cuanto el guion se reordena,
                                    y entonces esto es lo único que lo nombra. */}
                                {atasco.numero ? `${atasco.numero}. ` : ''}
                                {atasco.titulo ?? 'Paso sin título guardado'}
                              </td>
                              <td>
                                <div className="admin-acciones">
                                  {atasco.desenlaces.length === 0 ? (
                                    <span className="admin-numero-tenue">Sin desenlace</span>
                                  ) : (
                                    atasco.desenlaces.map((desenlace) => (
                                      <span key={desenlace} className="insignia insignia-atencion">
                                        {NOMBRE_DEL_DESENLACE[desenlace]}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="u-num">{atasco.veces}</td>
                              <td className="u-num">{atasco.residentes}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </SeccionPlegable>

          <SeccionPlegable
            clave="actividad.mas-leidas"
            titulo="Fichas más leídas"
            resumen={`${fichas.length} ficha${fichas.length === 1 ? '' : 's'}`}
          >
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Ficha</th>
                    <th>Módulo</th>
                    <th>Lectores</th>
                    <th>La dieron por leída</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {fichas.map((f) => {
                    const clave = claveDeFicha(f.coleccion, f.documentoId)
                    const estado = estadoDe(f.coleccion, f.documentoId)
                    const rotulo = rotuloDeFicha(estado, f.documentoId, 'Ficha eliminada')
                    return (
                      <tr key={clave}>
                        <th scope="row" className="admin-table-user-name">
                          {rotulo}
                          {estado.tipo === 'titulo' ? (
                            <div className="admin-table-user-email">#{f.documentoId}</div>
                          ) : null}
                        </th>
                        <td>
                          <InsigniaDeModulo coleccion={f.coleccion} />
                        </td>
                        <td className="u-num">{f.lectores}</td>
                        <td className="u-num">{f.completadas}</td>
                        <td>
                          {/* Solo se quita lo que se sabe que no lleva a nada: a
                              una ficha borrada los dos enlaces acababan en un
                              404, el del panel y el público. La que no se pudo
                              leer los conserva, porque lo probable es que siga
                              ahí y abrirla es la forma de comprobarlo. Y
                              «Editar» va primero y al editor porque es donde se
                              actúa sobre lo que se acaba de leer, y ese funciona
                              esté publicada o retirada; el botón de antes solo
                              servía si seguía publicada. */}
                          {estado.tipo !== 'eliminada' ? (
                            <div className="admin-acciones">
                              <Link
                                href={`/admin-panel/contenido/${f.coleccion}/${f.documentoId}`}
                                className="admin-btn admin-btn-sm admin-btn-secondary"
                                aria-label={`Editar «${rotulo}»`}
                              >
                                <Pencil aria-hidden size={14} />
                                Editar
                              </Link>
                              <Link
                                href={rutaPublica(f.coleccion, f.documentoId)}
                                className="admin-btn admin-btn-sm admin-btn-secondary"
                                aria-label={`Ver «${rotulo}» en el sitio público`}
                              >
                                <ExternalLink aria-hidden size={14} />
                                Ver
                              </Link>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </SeccionPlegable>

          <SeccionPlegable
            clave="actividad.ultimas"
            titulo="Últimas visitas"
            resumen={`${ultimas.length} visita${ultimas.length === 1 ? '' : 's'}`}
          >
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Ficha</th>
                    <th>Módulo</th>
                    <th>Cuándo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimas.map((r) => {
                    const estado = estadoDe(r.coleccion, r.documentoId)
                    const rotulo = rotuloDeFicha(estado, r.documentoId, 'Ficha eliminada')
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="admin-table-user-name">
                            {r.usuarioNombre}
                            <InsigniaDeRol rol={r.rol} />
                          </div>
                          <div className="admin-table-user-email">{r.usuarioCorreo}</div>
                        </td>
                        <td>
                          {estado.tipo === 'eliminada' ? (
                            <span className="admin-table-user-email">{rotulo}</span>
                          ) : (
                            <Link href={`/admin-panel/contenido/${r.coleccion}/${r.documentoId}`}>
                              {rotulo}
                            </Link>
                          )}
                        </td>
                        <td>
                          <InsigniaDeModulo coleccion={r.coleccion} />
                        </td>
                        <td className="u-nowrap">{fechaHora(r.ultimaVisita)}</td>
                        <td>
                          <span className={`insignia ${r.completado ? 'insignia-ok' : 'insignia-neutra'}`}>
                            {r.completado ? <Check aria-hidden size={12} /> : null}
                            {r.completado ? 'Leída' : 'En curso'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </SeccionPlegable>
        </>
      )}
    </div>
  )
}
