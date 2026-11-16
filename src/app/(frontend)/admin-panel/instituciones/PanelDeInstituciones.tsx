'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Copy, Download, Mail, Pencil, Plus } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { Modal } from '@/components/ui/Modal'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { Vacio } from '@/components/ui/Vacio'
import { claseDeInsignia, type Tono } from '@/lib/tonosDeEstado'
import { ruta } from '@/lib/rutas'
import {
  DIAS_DEL_PILOTO,
  HORAS_DE_INVITACION,
  diaEnChile,
  leerDatosDeInstitucion,
  normalizarSubdominio,
  vencimientoDelPiloto,
  type CampoDeInstitucion,
  type EstadoDelPlazo,
  type EtapaDelBloqueo,
  type Modalidad,
  type ProblemasDeInstitucion,
} from '@/lib/instituciones'
import {
  actualizarInstitucion,
  crearInstitucion,
  invitarAdministrador,
  type Invitacion,
} from '@/app/(frontend)/acciones/instituciones'

/** Una institución como la pinta la tabla: solo texto y números, ya calculados en el servidor. */
export interface InstitucionDelPanel {
  id: string
  nombre: string
  subdominio: string
  direccion: string
  modalidad: Modalidad
  inicio: string
  vence: string
  plazo: EstadoDelPlazo
  dias: number | null
  /** En qué punto del bloqueo está (D-403), con sus días como `AAAA-MM-DD`. */
  bloqueo: {
    etapa: EtapaDelBloqueo['etapa']
    avisoEl?: string
    avisadaEl?: string
    borradoEl?: string
    borradaEl?: string
  }
  cupo: number
  activas: number
  correoDelAdministrador: string
  administradores: { email: string; nombre: string; activo: boolean; haEntrado: boolean }[]
}

type Formulario = Record<CampoDeInstitucion, string>

/** «1 dic 2026», de un `AAAA-MM-DD`. A mano, como `series.ts`: viaja al navegador y se hidrata. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (dia: string) => {
  const [a, m, d] = dia.split('-').map(Number)
  return a && m && d ? `${d} ${MESES[m - 1]} ${a}` : dia
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Cómo se dice el plazo en la tabla, con su tono. */
function insigniaDelPlazo(i: InstitucionDelPanel): { tono: Tono; texto: string } {
  switch (i.plazo) {
    case 'sin-termino':
      return { tono: 'neutra', texto: 'Sin término' }
    case 'vencida':
      return {
        tono: 'peligro',
        texto: i.dias === null ? 'Vencida' : i.dias === 0 ? 'Venció hoy' : `Vencida hace ${plural(i.dias, 'día', 'días')}`,
      }
    case 'por-vencer':
      return { tono: 'atencion', texto: `Vence en ${plural(i.dias ?? 0, 'día', 'días')}` }
    default:
      return { tono: 'ok', texto: `Hasta el ${fechaCorta(i.vence)}` }
  }
}

/**
 * Qué pasa con una institución bloqueada, en una línea (D-403). Lo primero que
 * tiene que saber quien mira la tabla es si se van a borrar cuentas y cuándo:
 * es lo único de aquí que no tiene vuelta atrás.
 */
function lineaDelBloqueo(b: InstitucionDelPanel['bloqueo']): { tono: Tono; texto: string } | null {
  switch (b.etapa) {
    case 'bloqueada':
      return b.avisoEl
        ? { tono: 'atencion', texto: `Nadie entra. Si no se extiende, el ${fechaCorta(b.avisoEl)} se avisa del borrado de sus cuentas.` }
        : { tono: 'peligro', texto: 'Nadie entra. Su fecha de término no se puede leer: corríjala con «Editar».' }
    case 'por-avisar':
      return { tono: 'peligro', texto: 'Nadie entra. El aviso de borrado de sus cuentas sale en la próxima pasada diaria.' }
    case 'avisada':
      return {
        tono: 'peligro',
        texto: `Avisada el ${fechaCorta(b.avisadaEl ?? '')}: sus cuentas se borran el ${fechaCorta(b.borradoEl ?? '')}. Extender el plazo lo detiene.`,
      }
    case 'por-borrar':
      return { tono: 'peligro', texto: 'Sus cuentas se borran en la próxima pasada diaria. Extender el plazo lo detiene.' }
    case 'borrada':
      return { tono: 'neutra', texto: `Sus cuentas se borraron el ${fechaCorta(b.borradaEl ?? '')}. El contenido sigue.` }
    default:
      return null
  }
}

/**
 * La pestaña «Instituciones» (P-016 E5.5).
 *
 * Crear una pide lo que se contrató —modalidad, fechas, cupo— y a quién la
 * administra, y deja todo listo: la fila, la cuenta de su administrador y la
 * invitación a su subdominio. Después se cambia el plazo, la modalidad y el
 * cupo. No se borra: eso es el bloqueo y sus doce meses (E5.8, D-403), que se
 * cuenta en la columna del plazo, y antes de él se exporta su contenido.
 */
export function PanelDeInstituciones({
  instituciones,
  hoy,
  dominio,
  hayCorreo,
  hayMas,
}: {
  instituciones: InstitucionDelPanel[]
  hoy: string
  dominio: string
  hayCorreo: boolean
  hayMas: boolean
}) {
  const router = useRouter()
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const [enCurso, iniciar] = useTransition()
  const [abierto, setAbierto] = useState<'crear' | InstitucionDelPanel | null>(null)
  const [error, setError] = useState<string | null>(null)
  // El enlace que hay que entregar a mano cuando el correo no salió.
  const [aMano, setAMano] = useState<Invitacion | null>(null)

  const cerrar = () => {
    setAbierto(null)
    setError(null)
  }

  /** Lo que se dice tras invitar: el correo salió, o el enlace para entregarlo. */
  const contarLaInvitacion = (invitacion: Invitacion, antes: string) => {
    if (invitacion.enviada) {
      avisar('ok', `${antes} ${invitacion.correo} recibió el enlace para elegir su contraseña.`)
    } else {
      setAMano(invitacion)
    }
  }

  const alCrear = (formulario: Formulario) => {
    setError(null)
    iniciar(async () => {
      const r = await crearInstitucion(formulario)
      if (!r.exito || !r.datos) {
        setError(r.mensaje ?? 'No se pudo guardar.')
        return
      }
      cerrar()
      router.refresh()
      contarLaInvitacion(r.datos.invitacion, `${formulario.nombre} quedó creada.`)
    })
  }

  const alGuardar = (institucion: InstitucionDelPanel, formulario: Formulario) => {
    setError(null)
    iniciar(async () => {
      const r = await actualizarInstitucion(institucion.id, formulario)
      if (!r.exito || !r.datos) {
        setError(r.mensaje ?? 'No se pudo guardar.')
        return
      }
      cerrar()
      router.refresh()
      if (r.datos.activas > r.datos.cupo) {
        avisar(
          'atencion',
          `Guardado. ${institucion.nombre} tiene ${plural(r.datos.activas, 'cuenta activa', 'cuentas activas')}, más que el cupo nuevo: ninguna se desactiva, pero no se podrán aprobar más hasta que se liberen lugares.`,
        )
      } else {
        avisar('ok', 'Guardado.')
      }
    })
  }

  const alInvitar = async (institucion: InstitucionDelPanel) => {
    const seguro = await confirmar({
      titulo: `¿Enviar la invitación a ${institucion.correoDelAdministrador}?`,
      mensaje: `Recibe un enlace nuevo para elegir su contraseña en ${institucion.direccion}, que caduca en ${HORAS_DE_INVITACION} horas. Si su cuenta estaba desactivada, queda activa y como administrador de ${institucion.nombre}.`,
      confirmar: 'Enviar',
    })
    if (!seguro) return
    iniciar(async () => {
      const r = await invitarAdministrador(institucion.id)
      if (!r.exito || !r.datos) {
        avisar('error', r.mensaje ?? 'No se pudo enviar la invitación.')
        return
      }
      router.refresh()
      contarLaInvitacion(r.datos, 'Invitación enviada.')
    })
  }

  const subtitulo =
    instituciones.length === 0
      ? 'Cada institución tiene su subdominio, sus cuentas y su contenido propio.'
      : `${plural(instituciones.length, 'institución', 'instituciones')}.`

  return (
    <div>
      <CabeceraDePagina
        titulo="Instituciones"
        subtitulo={subtitulo}
        acciones={
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => setAbierto('crear')}>
            <Plus aria-hidden size={16} />
            Crear institución
          </button>
        }
      />

      {hayMas ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          Se muestran las primeras {instituciones.length}, por nombre.
        </div>
      ) : null}

      {!hayCorreo ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          No hay servidor de correo configurado: al crear una institución, el enlace para su administrador aparece aquí
          para entregarlo a mano.
        </div>
      ) : null}

      {instituciones.length === 0 ? (
        <Vacio icono={Building2} titulo="Todavía no hay ninguna institución">
          Al crear una, su administrador recibe la invitación y su subdominio funciona en el acto.
        </Vacio>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table tabla-apilable inst-tabla">
            <thead>
              <tr>
                <th scope="col">Institución</th>
                <th scope="col">Plazo</th>
                <th scope="col">Cuentas activas</th>
                <th scope="col">Administración</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {instituciones.map((i) => {
                const plazo = insigniaDelPlazo(i)
                const bloqueo = lineaDelBloqueo(i.bloqueo)
                const lleno = i.activas >= i.cupo
                return (
                  <tr key={i.id}>
                    {/* Cada celda en su `div`: en el teléfono la celda apilada es
                        una fila flexible con su rótulo, y sin envoltorio el nombre
                        y la dirección se ponían uno al lado del otro. */}
                    <td data-etiqueta="Institución">
                      <div>
                        <div className="admin-table-user-name">{i.nombre}</div>
                        <a className="admin-table-user-email inst-direccion" href={i.direccion} target="_blank" rel="noreferrer">
                          {i.direccion.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    </td>
                    <td data-etiqueta="Plazo">
                      <div>
                        <span className={claseDeInsignia(plazo.tono)}>{plazo.texto}</span>
                        <div className="admin-table-user-email">
                          {i.modalidad === 'piloto' ? 'Piloto' : 'Definitiva'} · desde el {fechaCorta(i.inicio)}
                        </div>
                        {bloqueo ? <p className={`inst-bloqueo inst-bloqueo-${bloqueo.tono}`}>{bloqueo.texto}</p> : null}
                      </div>
                    </td>
                    <td data-etiqueta="Cuentas activas">
                      <div>
                        <span className={lleno ? claseDeInsignia(i.activas > i.cupo ? 'peligro' : 'atencion') : 'inst-cupo'}>
                          {i.activas} de {i.cupo}
                        </span>
                        {lleno ? <div className="admin-table-user-email">Cupo lleno</div> : null}
                      </div>
                    </td>
                    <td data-etiqueta="Administración">
                      <div>
                        <AdministracionDe institucion={i} />
                      </div>
                    </td>
                    <td className="admin-table-acciones">
                      <div className="admin-table-acciones-fila">
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => setAbierto(i)}
                          disabled={enCurso}
                        >
                          <Pencil aria-hidden size={14} />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => void alInvitar(i)}
                          disabled={enCurso}
                        >
                          <Mail aria-hidden size={14} />
                          Enviar invitación
                        </button>
                        {/* Un enlace y no un botón: es una descarga, y la ruta
                            tiene su propia guardia (D-403). */}
                        <a
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          href={ruta(`/api/instituciones/${i.id}/contenido`)}
                          download
                          aria-label={`Exportar el contenido de ${i.nombre}`}
                        >
                          <Download aria-hidden size={14} />
                          Exportar
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {abierto === 'crear' ? (
        <ModalDeInstitucion
          titulo="Crear institución"
          operacion="crear"
          inicial={formularioNuevo(hoy)}
          hoy={hoy}
          dominio={dominio}
          enCurso={enCurso}
          error={error}
          onCerrar={cerrar}
          onEnviar={alCrear}
          boton={enCurso ? 'Creando…' : 'Crear institución'}
        />
      ) : abierto ? (
        <ModalDeInstitucion
          titulo={`Editar ${abierto.nombre}`}
          operacion="cambiar"
          inicial={formularioDe(abierto)}
          hoy={hoy}
          dominio={dominio}
          enCurso={enCurso}
          error={error}
          onCerrar={cerrar}
          onEnviar={(f) => alGuardar(abierto, f)}
          boton={enCurso ? 'Guardando…' : 'Guardar'}
        />
      ) : null}

      {aMano ? <ModalDelEnlace invitacion={aMano} onCerrar={() => setAMano(null)} /> : null}
    </div>
  )
}

/** Quién administra la institución, y si ya entró: una invitación sin usar es lo primero a mirar. */
function AdministracionDe({ institucion }: { institucion: InstitucionDelPanel }) {
  if (institucion.administradores.length === 0) {
    return (
      <>
        <div className="admin-table-user-email">{institucion.correoDelAdministrador}</div>
        <span className={claseDeInsignia('peligro')}>Sin administrador</span>
      </>
    )
  }
  return (
    <ul className="inst-administradores">
      {institucion.administradores.map((a) => (
        <li key={a.email}>
          <span className="admin-table-user-email">{a.email}</span>{' '}
          {!a.activo ? (
            <span className={claseDeInsignia('neutra')}>desactivada</span>
          ) : !a.haEntrado ? (
            <span className={claseDeInsignia('atencion')}>aún no entra</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

const formularioNuevo = (hoy: string): Formulario => ({
  nombre: '',
  subdominio: '',
  modalidad: 'piloto',
  inicio: hoy,
  vence: diaEnChile(vencimientoDelPiloto(new Date(`${hoy}T12:00:00Z`))),
  cupo: '30',
  correoDelAdministrador: '',
  nombreDelAdministrador: '',
})

const formularioDe = (i: InstitucionDelPanel): Formulario => ({
  nombre: i.nombre,
  subdominio: i.subdominio,
  modalidad: i.modalidad,
  inicio: i.inicio,
  vence: i.vence,
  cupo: String(i.cupo),
  correoDelAdministrador: i.correoDelAdministrador,
  nombreDelAdministrador: '',
})

/**
 * El formulario de crear y el de editar, que son el mismo con menos campos.
 *
 * Se valida con `leerDatosDeInstitucion`, la misma función que aplica la
 * acción: lo que aquí se acepta, allí también. Los avisos salen al enviar, no
 * al teclear, para no gritarle a quien todavía está escribiendo.
 */
function ModalDeInstitucion({
  titulo,
  operacion,
  inicial,
  hoy,
  dominio,
  enCurso,
  error,
  onCerrar,
  onEnviar,
  boton,
}: {
  titulo: string
  operacion: 'crear' | 'cambiar'
  inicial: Formulario
  hoy: string
  dominio: string
  enCurso: boolean
  error: string | null
  onCerrar: () => void
  onEnviar: (f: Formulario) => void
  boton: string
}) {
  const [f, setF] = useState<Formulario>(inicial)
  const [problemas, setProblemas] = useState<ProblemasDeInstitucion>({})
  const alCrear = operacion === 'crear'
  const poner = (campo: CampoDeInstitucion) => (valor: string) => setF((anterior) => ({ ...anterior, [campo]: valor }))

  const cambiarModalidad = (modalidad: Modalidad) => {
    setF((anterior) => ({
      ...anterior,
      modalidad,
      // Al pasar a piloto sin fecha, se propone la de siempre; a definitiva,
      // se deja la que hubiera: puede tener término o no.
      vence:
        modalidad === 'piloto' && !anterior.vence
          ? diaEnChile(vencimientoDelPiloto(new Date(`${anterior.inicio || hoy}T12:00:00Z`)))
          : anterior.vence,
    }))
  }

  const campo = (
    nombre: CampoDeInstitucion,
    etiqueta: string,
    control: ReactNode,
    ayuda?: ReactNode,
  ) => (
    <div className="admin-form-group">
      <label className="admin-form-label" htmlFor={`inst-${nombre}`}>
        {etiqueta}
      </label>
      {control}
      {problemas[nombre] ? (
        <p className="campo-error" id={`inst-${nombre}-error`}>
          {problemas[nombre]}
        </p>
      ) : ayuda ? (
        <p className="admin-form-hint">{ayuda}</p>
      ) : null}
    </div>
  )

  const entrada = (nombre: CampoDeInstitucion, props: Record<string, unknown> = {}) => (
    <input
      id={`inst-${nombre}`}
      className="admin-form-input"
      value={f[nombre]}
      onChange={(e) => poner(nombre)(e.target.value)}
      aria-invalid={problemas[nombre] ? true : undefined}
      aria-describedby={problemas[nombre] ? `inst-${nombre}-error` : undefined}
      {...props}
    />
  )

  const subdominio = normalizarSubdominio(f.subdominio)

  return (
    <Modal titulo={titulo} error={error} onCerrar={onCerrar} ancho="ancho">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          const { problemas: encontrados } = leerDatosDeInstitucion(f, operacion, hoy)
          setProblemas(encontrados)
          if (Object.keys(encontrados).length === 0) onEnviar(f)
        }}
      >
        <div className="admin-form-fila">
          {campo('nombre', 'Nombre de la institución', entrada('nombre', { 'data-foco-inicial': true, maxLength: 160 }))}
          {alCrear
            ? campo(
                'subdominio',
                'Subdominio',
                entrada('subdominio', { maxLength: 40, autoCapitalize: 'none', spellCheck: false }),
                <>
                  Su dirección: <strong>{subdominio || 'nombre'}.{dominio || 'traumahub.cl'}</strong>. No cambia después.
                </>,
              )
            : null}
        </div>

        <fieldset className="inst-opciones">
          <legend className="admin-form-label">Modalidad</legend>
          <label className="inst-opcion">
            <input
              type="radio"
              name="inst-modalidad"
              checked={f.modalidad === 'piloto'}
              onChange={() => cambiarModalidad('piloto')}
            />
            <span>
              Piloto
              <small>Con fecha de término; sin otra, {DIAS_DEL_PILOTO} días desde el inicio.</small>
            </span>
          </label>
          <label className="inst-opcion">
            <input
              type="radio"
              name="inst-modalidad"
              checked={f.modalidad === 'definitiva'}
              onChange={() => cambiarModalidad('definitiva')}
            />
            <span>
              Definitiva
              <small>Con o sin término.</small>
            </span>
          </label>
        </fieldset>

        <div className="admin-form-fila">
          {alCrear ? campo('inicio', 'Empieza', entrada('inicio', { type: 'date' })) : null}
          {campo(
            'vence',
            'Último día',
            entrada('vence', { type: 'date', min: alCrear ? f.inicio : undefined }),
            f.modalidad === 'definitiva'
              ? 'Vacío si no tiene término.'
              : 'Al día siguiente la institución se bloquea: nadie entra y nada se borra.',
          )}
          {campo(
            'cupo',
            'Cupo de cuentas',
            entrada('cupo', { type: 'number', min: 1, step: 1, inputMode: 'numeric' }),
            'Cuentas activas de cualquier rol. Desactivar una libera su lugar.',
          )}
        </div>

        <div className="admin-form-fila">
          {alCrear
            ? campo('nombreDelAdministrador', 'Quién la administra', entrada('nombreDelAdministrador', { maxLength: 120 }))
            : null}
          {campo(
            'correoDelAdministrador',
            alCrear ? 'Su correo' : 'Correo del administrador',
            entrada('correoDelAdministrador', { type: 'email', autoCapitalize: 'none', spellCheck: false }),
            alCrear
              ? `Recibe la invitación para elegir su contraseña, válida ${HORAS_DE_INVITACION} horas.`
              : 'Cambiarlo no toca ninguna cuenta: «Enviar invitación» invita a este correo.',
          )}
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={enCurso}>
            {boton}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** El enlace de la invitación cuando el correo no salió, para copiarlo y entregarlo a mano. */
function ModalDelEnlace({ invitacion, onCerrar }: { invitacion: Invitacion; onCerrar: () => void }) {
  const avisar = useAvisos()
  return (
    <Modal titulo="Entregue este enlace a mano" onCerrar={onCerrar}>
      <p>
        El correo a <strong>{invitacion.correo}</strong> no salió. Con este enlace elige su contraseña: sirve una sola
        vez y caduca en {HORAS_DE_INVITACION} horas. Entréguelo solo a esa persona.
      </p>
      <div className="inst-enlace">
        <input className="admin-form-input admin-table-mono" readOnly value={invitacion.enlace} aria-label="Enlace" />
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(invitacion.enlace)
              .then(() => avisar('info', 'Enlace copiado.'))
              .catch(() => avisar('error', 'No se pudo copiar: selecciónelo y cópielo a mano.'))
          }}
        >
          <Copy aria-hidden size={14} />
          Copiar
        </button>
      </div>
      <div className="admin-modal-actions">
        <button type="button" className="admin-btn admin-btn-primary" onClick={onCerrar}>
          Listo
        </button>
      </div>
    </Modal>
  )
}
