import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Download, Minus, ScrollText, Timer, Users } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { BarrasVerticales, Dona, NoSePudoLeer, type Punto } from '@/components/admin/Graficos'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { Cifra } from '@/components/admin/tablero/Cifra'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { Vacio } from '@/components/ui/Vacio'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { cifra } from '@/lib/graficos'
import { iniciales } from '@/lib/iniciales'
import { leerTodas } from '@/lib/leerTodas'
import { capacidadesPorRol, etiquetaDeRolEnRegistro, ROLES } from '@/lib/permisos'
import { ACCIONES_DEL_REGISTRO, accionDelRegistroEnPalabras, duracionCorta, quienEnElRegistro } from '@/lib/registro'
import {
  TIPOS_DE_ACCION,
  leerRegistro,
  leerResumenDeCuentas,
  resumirActos,
  tiempoPorCasilla,
  type FiltrosDelRegistro,
  type ResumenDelRegistro,
  type TipoDeAccion,
} from '@/lib/registroPanel'
import { ruta } from '@/lib/rutas'
import { leerFecha, ultimosDias } from '@/lib/series'
import { DIAS_DE_LA_SEMANA, diaDeLaSemana } from '@/lib/tableroDeActividad'
import { clientePayload } from '../datos'
import { MODULOS, NOMBRE_DE_MODULO } from '../modulos'
import './registro.css'

export const dynamic = 'force-dynamic'

/**
 * El registro de lo que hace cada cuenta (D-145).
 *
 * Lo pidió el dueño: «el registro de todos los usuarios, qué hacen y cuándo,
 * con todos los permisos y roles, y calcular un tiempo de actividad». Cuatro
 * bloques, de lo que se mira primero a lo que se busca: los números del día, las
 * cuentas con sus permisos y su tiempo, lo que cada rol puede hacer, y el
 * registro acto por acto con filtros. Todo sale de las mismas lecturas que la
 * planilla de Excel (`registroPanel.ts`).
 *
 * Desde el tablero de Penpot (P-007 E5, D-238), los números del día llevan su
 * línea de las dos últimas semanas, y debajo van los minutos activos por día
 * —el `tiempoPorDia` que `leerResumenDeCuentas` ya traía para la planilla y la
 * pantalla no usaba— y en qué se va el tiempo de las cuentas. Las tablas siguen
 * plegables y con memoria, con sus filtros, su paginación y su planilla.
 *
 * Solo el administrador: dice qué hace cada persona.
 */

/** Lo que dibujan las líneas de las cifras y las barras de minutos: dos semanas, como en Penpot. */
const DIAS_DIBUJADOS = 14

/** El color de cada tipo de «Qué se hace», de la paleta: el del módulo cuando lo hay. */
const COLOR_DEL_TIPO: Record<TipoDeAccion, string> = {
  leer: 'var(--marca)',
  simulador: 'var(--mod-4)',
  comentar: 'var(--cian)',
  editar: 'var(--verde)',
  sesion: 'var(--linea-fuerte)',
  administrar: 'var(--mod-3)',
}

/** La insignia del rol en la tabla de cuentas, con el color que tiene en Penpot. */
const INSIGNIA_DEL_ROL: Record<string, string> = {
  admin: 'insignia insignia-acento registro-rol-admin',
  editor: 'insignia insignia-ok',
  lector: 'insignia insignia-info',
}

const primero = (valor: string | string[] | undefined): string | undefined => {
  const v = Array.isArray(valor) ? valor[0] : valor
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 100) : undefined
}

const fechaHora = (valor?: string | null) =>
  valor
    ? new Date(valor).toLocaleString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—'

/** Lo que se anota además de los cinco módulos. */
const NOMBRE_DEL_SITIO: Record<string, string> = {
  usuarios: 'Cuentas',
  medios: 'Medios',
  ingesta: 'Ingesta de libros',
  segmentos: 'Segmentos',
}

const modulosEnPalabras = (lista: string[]) =>
  lista.length === 0 ? 'todos' : lista.map((m) => NOMBRE_DE_MODULO[m] ?? m).join(', ')

export default async function PaginaDelRegistro({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirPanel('admin')
  const p = await searchParams
  const filtros: FiltrosDelRegistro = {
    usuario: primero(p.usuario),
    accion: primero(p.accion),
    coleccion: primero(p.coleccion),
    desde: primero(p.desde),
    hasta: primero(p.hasta),
  }
  const hayFiltro = Object.values(filtros).some(Boolean)
  const pagina = Math.max(1, Number(primero(p.pagina)) || 1)

  const dias = ultimosDias(DIAS_DIBUJADOS)
  let resumen: ResumenDelRegistro | null = null
  let registro: Awaited<ReturnType<typeof leerRegistro>> | null = null
  // Los actos de las dos semanas, aparte y con su propio `null`: sin ellos faltan la línea de «Acciones hoy» y «Qué se
  // hace», pero las cuentas y el registro se leyeron bien y no hay por qué tirar la pantalla entera.
  let actos: Record<string, unknown>[] | null = null
  try {
    const payload = await clientePayload()
    ;[resumen, registro, actos] = await Promise.all([
      leerResumenDeCuentas(payload),
      leerRegistro(payload, filtros, pagina),
      leerTodas(payload, {
        coleccion: 'registro-de-acciones',
        where: { fecha: { greater_than_equal: (leerFecha(dias[0].clave) ?? new Date(0)).toISOString() } },
        select: { fecha: true, accion: true, coleccion: true, origen: true },
      }).then(
        (r) => r.docs,
        (error: unknown) => {
          console.error('[panel] no se pudieron leer los actos de las dos últimas semanas:', error)
          return null
        },
      ),
    ])
  } catch (error) {
    console.error('[panel] no se pudo leer el registro de acciones:', error)
  }

  if (!resumen || !registro) {
    return (
      <div>
        <CabeceraDePagina titulo="Registro de acciones" />
        <div className="admin-aviso admin-aviso-error">
          <strong>La base no respondió al registro.</strong>
          Lo corriente es un despliegue sin su migración (las tablas «registro_de_acciones» y
          «tiempo_activo»); el detalle queda en el registro del servidor.
        </div>
      </div>
    )
  }

  const consulta = (extra: Record<string, string | number>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...filtros, ...extra })) if (v !== undefined && v !== '') q.set(k, String(v))
    const s = q.toString()
    return `/admin-panel/registro${s ? `?${s}` : ''}`
  }

  // --- el tablero -----------------------------------------------------------
  const tiempo = tiempoPorCasilla(resumen.tiempoPorDia, dias, new Set(resumen.cuentas.map((c) => c.id)))
  const deLosActos = actos ? resumirActos(actos, dias) : null
  const minutosPorDia: Punto[] = dias.map((d, i) => {
    const dia = diaDeLaSemana(d.clave)
    return {
      etiqueta: String(leerFecha(d.clave)?.getDate() ?? ''),
      detalle: `${dia === null ? '' : `${DIAS_DE_LA_SEMANA[dia]} `}${d.detalle}`,
      valor: tiempo.minutos[i],
    }
  })
  // Dónde cae el primer sábado de las barras, de 1 a 7: con eso `registro.css` aclara los fines de semana (ver allí
  // por qué así y no con una opción del gráfico).
  const primerSabado = dias.findIndex((d) => diaDeLaSemana(d.clave) === 5) + 1

  return (
    <div>
      <CabeceraDePagina
        titulo="Registro de acciones"
        subtitulo="Qué hace cada cuenta, cuándo y con qué permisos. El tiempo de actividad cuenta solo mientras la plataforma está a la vista y alguien la toca: sin tocar nada durante 90 s, deja de contar."
        acciones={
          <a className="admin-btn admin-btn-primary" href={ruta('/api/registro/planilla')} download>
            <Download aria-hidden size={16} />
            Descargar planilla (Excel)
          </a>
        }
      />

      {/* Sin flecha de cambio: «hoy» va por la mitad mientras se mira, y compararlo con el día entero de ayer diría
          siempre que baja. La línea enseña los días cerrados y el de hoy al final, que se lee como lo que es. */}
      <div className="tablero-cifras tablero-cifras-3">
        <Cifra
          titulo="Cuentas activas hoy"
          icono={Users}
          tono="info"
          valor={cifra(resumen.cuentasActivasHoy)}
          serie={tiempo.cuentas}
          descripcionDeLaSerie="Cuentas con tiempo activo cada día de las últimas dos semanas."
          nota="con la plataforma en uso"
        />
        <Cifra
          titulo="Tiempo activo hoy"
          icono={Timer}
          tono="info"
          valor={duracionCorta(resumen.segundosHoy)}
          serie={tiempo.minutos}
          descripcionDeLaSerie="Minutos activos sumados entre todas las cuentas, cada día de las últimas dos semanas."
          nota="sumado entre todas las cuentas"
        />
        <Cifra
          titulo="Acciones hoy"
          icono={ScrollText}
          tono="info"
          valor={cifra(resumen.accionesHoy)}
          serie={deLosActos?.porDia}
          descripcionDeLaSerie="Actos anotados en el registro cada día de las últimas dos semanas."
          nota="inicios de sesión, cambios, lecturas…"
        />
      </div>

      <div className="tablero-fila">
        <TarjetaDeGrafico
          titulo="Minutos activos por día"
          bajada="Todas las cuentas · últimas 2 semanas · más claros, el sábado y el domingo"
        >
          <div className={`registro-minutos registro-sabado-${primerSabado}`}>
            <BarrasVerticales
              titulo="Minutos activos por día, sumados entre todas las cuentas, en las últimas dos semanas"
              datos={minutosPorDia}
              // Más alto que el de serie: la dona de al lado, con su leyenda debajo, mide casi el doble, y la
              // fila quedaba con un hueco bajo las barras.
              altura={250}
            />
          </div>
        </TarjetaDeGrafico>

        <TarjetaDeGrafico
          titulo="Qué se hace"
          bajada="Lo que hicieron las cuentas en los últimos 7 días"
          ilegible={deLosActos === null}
        >
          {deLosActos === null ? (
            <NoSePudoLeer que="el registro de la semana" />
          ) : (
            <Dona
              titulo="Acciones de las cuentas en los últimos 7 días, por tipo"
              rotuloDelTotal="acciones"
              partes={TIPOS_DE_ACCION.map((t) => ({
                etiqueta: t.etiqueta,
                valor: deLosActos.porTipo[t.clave],
                color: COLOR_DEL_TIPO[t.clave],
              }))}
            />
          )}
        </TarjetaDeGrafico>
      </div>

      <PlegarTodo />

      <SeccionPlegable
        clave="registro.cuentas"
        titulo="Cuentas, permisos y tiempo de actividad"
        resumen={`${resumen.cuentas.length} cuentas`}
      >
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Rol</th>
              <th>Ve</th>
              <th>Edita</th>
              <th>Último acceso</th>
              <th>Hoy</th>
              <th>7 días</th>
              <th>30 días</th>
              <th>Días activos</th>
              <th>Sesiones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {resumen.cuentas.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="registro-cuenta">
                    <span className="registro-cuenta-circulo" aria-hidden>
                      {iniciales(c.nombre)}
                    </span>
                    <div>
                      <strong>{c.nombre}</strong>
                      <br />
                      <span className="admin-card-note">{c.correo}</span>
                      {!c.activo ? (
                        <>
                          <br />
                          <span className="admin-card-note">{c.pendiente ? 'solicitud pendiente' : 'desactivada'}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  <span className={INSIGNIA_DEL_ROL[c.rol] ?? 'insignia insignia-neutra'}>
                    {etiquetaDeRolEnRegistro(c.rol)}
                  </span>
                </td>
                <td>{c.rol === 'admin' ? 'todos' : modulosEnPalabras(c.modulosVisibles)}</td>
                <td>
                  {c.rol === 'lector' ? '—' : c.rol === 'admin' ? 'todos' : modulosEnPalabras(c.modulosEditables)}
                </td>
                <td>{fechaHora(c.ultimoAcceso)}</td>
                <td>{duracionCorta(c.segundosHoy)}</td>
                <td>{duracionCorta(c.segundos7d)}</td>
                <td>{duracionCorta(c.segundos30d)}</td>
                <td>{c.diasActivos30d}</td>
                <td>{c.sesiones30d}</td>
                <td>{c.acciones30d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-card-note">
        Sesiones y acciones son de los últimos 30 días. «Ve» y «Edita» vacíos significan todos los módulos.
      </p>
      </SeccionPlegable>

      <SeccionPlegable clave="registro.roles" titulo="Qué puede hacer cada rol" resumen={`${capacidadesPorRol().length} permisos`}>
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Permiso</th>
              {ROLES.map((r) => (
                <th key={r.value}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capacidadesPorRol().map((c) => (
              <tr key={c.clave}>
                <td>{c.etiqueta}</td>
                <td>
                  {c.admin ? <Check aria-label="Sí" size={16} className="icono-si" /> : <Minus aria-label="No" size={16} className="icono-no" />}
                </td>
                <td>
                  {c.editor ? <Check aria-label="Sí" size={16} className="icono-si" /> : <Minus aria-label="No" size={16} className="icono-no" />}
                </td>
                <td>
                  {c.lector ? <Check aria-label="Sí" size={16} className="icono-si" /> : <Minus aria-label="No" size={16} className="icono-no" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </SeccionPlegable>

      <SeccionPlegable
        clave="registro.actos"
        titulo="Registro, acto por acto"
        resumen={`${registro.total} acto${registro.total === 1 ? '' : 's'}`}
      >
      <form className="admin-filters" method="get">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-usuario">Cuenta</label>
          <select id="registro-usuario" name="usuario" className="admin-select" defaultValue={filtros.usuario ?? ''}>
            <option value="">Todas</option>
            {resumen.cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-accion">Acción</label>
          <select id="registro-accion" name="accion" className="admin-select" defaultValue={filtros.accion ?? ''}>
            <option value="">Todas</option>
            {ACCIONES_DEL_REGISTRO.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-coleccion">Módulo</label>
          <select id="registro-coleccion" name="coleccion" className="admin-select" defaultValue={filtros.coleccion ?? ''}>
            <option value="">Todos</option>
            {MODULOS.map((m) => (
              <option key={m.slug} value={m.slug}>{m.nombre}</option>
            ))}
            <option value="usuarios">Cuentas</option>
            <option value="medios">Medios</option>
            <option value="ingesta">Ingesta</option>
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-desde">Desde</label>
          <input id="registro-desde" name="desde" type="date" className="admin-select" defaultValue={filtros.desde ?? ''} />
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="registro-hasta">Hasta</label>
          <input id="registro-hasta" name="hasta" type="date" className="admin-select" defaultValue={filtros.hasta ?? ''} />
        </div>
        <button type="submit" className="admin-btn admin-btn-secondary admin-btn-sm">Aplicar</button>
        {hayFiltro ? (
          <Link href="/admin-panel/registro" className="admin-btn admin-btn-secondary admin-btn-sm">
            Quitar filtros
          </Link>
        ) : null}
      </form>

      {registro.filas.length === 0 ? (
        <Vacio
          icono={ScrollText}
          titulo={hayFiltro ? 'Nada coincide con el filtro.' : 'Todavía no hay nada registrado.'}
          accion={
            hayFiltro ? (
              <Link href="/admin-panel/registro" className="admin-btn admin-btn-secondary">
                Quitar filtros
              </Link>
            ) : undefined
          }
        >
          {hayFiltro
            ? 'Quite algún filtro para ver más.'
            : 'Desde el despliegue de esta versión, cada inicio de sesión y cada cambio queda aquí.'}
        </Vacio>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Cuenta</th>
                <th>Rol (entonces)</th>
                <th>Acción</th>
                <th>Dónde</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {registro.filas.map((f) => (
                <tr key={f.id}>
                  <td>{fechaHora(f.fecha)}</td>
                  <td>
                    {quienEnElRegistro({ usuarioNombre: f.nombre, origen: f.origen })}
                    {f.correo ? (
                      <>
                        <br />
                        <span className="admin-card-note">{f.correo}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{f.rol ? etiquetaDeRolEnRegistro(f.rol) : '—'}</td>
                  <td>{accionDelRegistroEnPalabras(f.accion)}</td>
                  <td>
                    {f.coleccion ? NOMBRE_DEL_SITIO[f.coleccion] ?? NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion : '—'}
                    {f.titulo ? (
                      <>
                        <br />
                        <span className="admin-card-note">{f.titulo}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{f.detalle || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-pie">
        <span className="admin-card-note">
          {registro.total} acto{registro.total === 1 ? '' : 's'} · página {Math.min(pagina, Math.max(1, registro.paginas))} de {Math.max(1, registro.paginas)}
        </span>
        {pagina > 1 ? (
          <Link className="admin-btn admin-btn-secondary admin-btn-sm" href={consulta({ pagina: pagina - 1 })}>
            <ArrowLeft aria-hidden size={14} />
            Más recientes
          </Link>
        ) : null}
        {pagina < registro.paginas ? (
          <Link className="admin-btn admin-btn-secondary admin-btn-sm" href={consulta({ pagina: pagina + 1 })}>
            Más antiguos
            <ArrowRight aria-hidden size={14} />
          </Link>
        ) : null}
      </div>
      </SeccionPlegable>
    </div>
  )
}
