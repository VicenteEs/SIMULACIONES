import { BarrasApiladasPorFila, BarrasHorizontales, NoSePudoLeer } from '@/components/admin/Graficos'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { cifra } from '@/lib/graficos'
import { clientePayload } from '../../datos'
import { MODULOS, NOMBRE_DE_MODULO } from '../../modulos'
import { leerEquipo } from '../equipo'

/**
 * El nombre corto de cada módulo, para las etiquetas de las tarjetas de
 * persona: con el nombre entero, «Biblioteca de patologías» y «Simulador
 * quirúrgico» no caben juntas en una tarjeta de un cuarto de fila.
 */
const NOMBRE_CORTO: Record<string, string> = {
  patologias: 'Biblioteca',
  maniobras: 'Examen físico',
  'casos-ao': 'Técnica AO',
  cirugias: 'Simulador',
  'estudios-ia': 'Imágenes',
}

const plural = (n: number, singular: string, plural: string) => `${cifra(n)} ${n === 1 ? singular : plural}`

/** «Dra. Paula Riquelme» → «PR»: el círculo de cada persona. */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((p) => /^[\p{L}]/u.test(p) && !/^(dr|dra)\.?$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '·'

/**
 * Lo que «Equipo» pinta encima de la lista de colaboradores (P-007 E5, D-238):
 * una tarjeta por persona con sus módulos y su revisión, cuánta revisión tiene
 * encima cada uno y cuántas personas pueden validar en cada módulo.
 *
 * Es de servidor y la pinta la página dentro de `TablaDocumentos`, entre la
 * cabecera y la lista: así la pantalla sigue teniendo un solo título y la lista
 * de la página pública sigue funcionando exactamente igual que antes.
 */
export async function TableroDeEquipo() {
  const payload = await clientePayload()
  const equipo = await leerEquipo(payload)

  if (equipo === null) {
    return (
      <div className="admin-aviso admin-aviso-atencion" role="status">
        <strong>No se pudo leer quién revisa qué.</strong>
        Las cuentas o la cola de revisión no respondieron; el detalle queda en el registro del servidor. La lista de
        colaboradores, debajo, no depende de ellas.
      </div>
    )
  }

  const conCarga = equipo.personas.filter((p) => p.activa || p.pendientesRecientes + p.pendientesAntiguas > 0)
  const solas = equipo.cobertura.filter((m) => m.editores === 1)
  const nadie = equipo.cobertura.filter((m) => m.editores === 0)

  return (
    <>
      {equipo.personas.length === 0 ? (
        <p className="admin-aviso admin-aviso-info">
          Todavía no hay ninguna cuenta de editor. Las cuentas y sus módulos se dan en «Usuarios y permisos».
        </p>
      ) : (
        <ul className="equipo-personas">
          {equipo.personas.map((p) => {
            const todos = p.modulos.length === MODULOS.length
            return (
              <li key={p.id} className="admin-card equipo-persona">
                <div className="equipo-persona-cabeza">
                  <span className="equipo-iniciales" aria-hidden>
                    {iniciales(p.nombre)}
                  </span>
                  <div className="equipo-persona-nombre">
                    <strong>{p.nombre}</strong>
                    <span className={`insignia ${p.activa ? 'insignia-ok' : 'insignia-neutra'}`}>
                      {p.activa ? 'Activa' : 'Desactivada'}
                    </span>
                  </div>
                </div>
                <span className="equipo-persona-detalle">
                  {[p.rol === 'admin' ? 'Administrador' : 'Editor', p.institucion].filter(Boolean).join(' · ')}
                </span>
                <ul className="equipo-modulos" aria-label="Módulos que puede editar">
                  {todos ? (
                    <li className="insignia insignia-info">Los cinco módulos</li>
                  ) : p.modulos.length === 0 ? (
                    <li className="insignia insignia-neutra">Ningún módulo</li>
                  ) : (
                    p.modulos.map((slug) => (
                      <li key={slug} className={`insignia equipo-modulo ${IDENTIDAD_DE_MODULO[slug]?.clase ?? ''}`}>
                        {NOMBRE_CORTO[slug] ?? NOMBRE_DE_MODULO[slug] ?? slug}
                      </li>
                    ))
                  )}
                </ul>
                <dl className="equipo-cifras">
                  <div>
                    <dt>validadas</dt>
                    <dd>{cifra(p.validadas)}</dd>
                  </div>
                  <div>
                    <dt>pendientes</dt>
                    <dd>{cifra(p.pendientesRecientes + p.pendientesAntiguas)}</dd>
                  </div>
                </dl>
              </li>
            )
          })}
        </ul>
      )}

      <div className="tablero-fila tablero-fila-mitades">
        <TarjetaDeGrafico
          titulo="Carga de revisión"
          bajada={
            <>
              Fichas asignadas sin terminar, por persona, según cuánto llevan en la cola
              {equipo.sinAsignar > 0 ? ` · ${plural(equipo.sinAsignar, 'más espera', 'más esperan')} sin asignar` : ''}
            </>
          }
        >
          <BarrasApiladasPorFila
            titulo="Fichas asignadas sin terminar de cada persona, según cuánto llevan en la cola"
            series={[
              { etiqueta: 'Menos de 7 días', color: 'var(--marca)' },
              { etiqueta: '7 días o más', color: 'var(--ambar)' },
            ]}
            filas={conCarga.map((p) => ({ etiqueta: p.nombre, valores: [p.pendientesRecientes, p.pendientesAntiguas] }))}
          />
        </TarjetaDeGrafico>

        <TarjetaDeGrafico
          titulo="Cobertura por módulo"
          bajada={`Editores activos que pueden validar en cada uno${
            equipo.administradores > 0
              ? `; ${equipo.administradores === 1 ? 'el administrador puede' : `los ${equipo.administradores} administradores pueden`} en todos`
              : ''
          }`}
          className="equipo-cobertura"
        >
          <BarrasHorizontales
            titulo="Editores activos que pueden validar en cada módulo"
            datos={equipo.cobertura.map((m) => ({ etiqueta: NOMBRE_DE_MODULO[m.slug] ?? m.slug, valor: m.editores }))}
            destacar={(punto) => punto.valor <= 1}
            formato={(v) => plural(v, 'persona', 'personas')}
          />
          {/* La bandera dice qué módulos; el aviso, qué pasa: con una sola
              persona, su ausencia para la cola de ese módulo entero. */}
          {nadie.length > 0 || solas.length > 0 ? (
            <div className="admin-aviso admin-aviso-atencion equipo-aviso">
              {nadie.length > 0 ? (
                <p>
                  {nadie.length === 1 ? 'Un módulo no tiene' : `${nadie.length} módulos no tienen`} ningún editor: solo un
                  administrador puede validarlo{nadie.length === 1 ? '' : 's'}.
                </p>
              ) : null}
              {solas.length > 0 ? (
                <p>
                  {solas.length === 1 ? 'Un módulo depende' : `${solas.length} módulos dependen`} de una sola persona: si
                  falta, su cola se detiene.
                </p>
              ) : null}
            </div>
          ) : null}
        </TarjetaDeGrafico>
      </div>

      <h2 className="equipo-lista-titulo">Colaboradores de la página pública</h2>
      <p className="equipo-lista-bajada">
        Las personas que aparecen en «Equipo» del sitio, con su foto, su cargo y una descripción breve. No son cuentas:
        aparecer aquí no da acceso a nada.
      </p>
    </>
  )
}
