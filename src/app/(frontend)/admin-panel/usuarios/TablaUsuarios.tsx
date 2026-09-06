'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MODULOS } from '../modulos'
import {
  actualizarUsuario,
  cambiarActivoUsuario,
  crearUsuario,
  eliminarUsuario,
  generarEnlaceDeClave,
} from '@/app/(frontend)/acciones/admin'

export interface UsuarioDelPanel {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'editor' | 'lector'
  activo: boolean
  institucion: string
  creado: string
  ultimoAcceso: string | null
  modulosVisibles: string[]
  modulosEditables: string[]
}

const ETIQUETA_ROL: Record<UsuarioDelPanel['rol'], string> = {
  admin: 'Administrador',
  editor: 'Editor',
  lector: 'Lector',
}

const fecha = (valor?: string | null) =>
  valor
    ? new Date(valor).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

/**
 * Contraseña inicial sugerida.
 *
 * Se genera en el navegador y se muestra una sola vez: el administrador la
 * entrega y la persona la cambia con el enlace de restablecimiento. Es mejor
 * que la alternativa real, que es teclear «Trauma2026» en las cinco cuentas.
 */
function claveSugerida(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const valores = new Uint32Array(16)
  crypto.getRandomValues(valores)
  return Array.from(valores, (v) => alfabeto[v % alfabeto.length]).join('')
}

type Aviso = { tipo: 'ok' | 'error' | 'info'; texto: string; enlace?: string } | null

export function TablaUsuarios({
  usuarios,
  idPropio,
  hayCorreo,
}: {
  usuarios: UsuarioDelPanel[]
  idPropio: string
  hayCorreo: boolean
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [aviso, setAviso] = useState<Aviso>(null)

  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<UsuarioDelPanel | null>(null)
  const [permisos, setPermisos] = useState<UsuarioDelPanel | null>(null)

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return usuarios.filter((u) => {
      if (filtroRol !== 'todos' && u.rol !== filtroRol) return false
      if (filtroEstado === 'activos' && !u.activo) return false
      if (filtroEstado === 'inactivos' && u.activo) return false
      if (!texto) return true
      return [u.nombre, u.email, u.institucion].join(' ').toLowerCase().includes(texto)
    })
  }, [usuarios, busqueda, filtroRol, filtroEstado])

  /** Ejecuta una acción, muestra su resultado y recarga los datos del servidor. */
  const ejecutar = (
    tarea: () => Promise<{ exito: boolean; mensaje?: string }>,
    exitoso: string,
  ) => {
    setAviso(null)
    iniciar(async () => {
      const resultado = await tarea()
      if (resultado.exito) {
        setAviso({ tipo: 'ok', texto: exitoso })
        router.refresh()
      } else {
        setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo completar la acción.' })
      }
    })
  }

  const pedirEnlace = (u: UsuarioDelPanel) => {
    setAviso(null)
    iniciar(async () => {
      const resultado = await generarEnlaceDeClave(u.id)
      if (!resultado.exito || !resultado.datos) {
        setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo generar el enlace.' })
        return
      }
      setAviso({
        tipo: 'info',
        texto: resultado.datos.enviadoPorCorreo
          ? `Se envió un enlace a ${u.email}. Caduca en una hora y sirve una sola vez.`
          : `No hay servidor de correo configurado: entregue este enlace a ${u.email}. Caduca en una hora y sirve una sola vez.`,
        enlace: resultado.datos.enlace,
      })
    })
  }

  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <h1 className="admin-title">Usuarios y roles</h1>
          <p className="admin-subtitle">
            {usuarios.length} cuenta{usuarios.length === 1 ? '' : 's'} ·{' '}
            {usuarios.filter((u) => u.activo).length} con acceso. Una cuenta sin activar no ve nada
            de la plataforma.
          </p>
        </div>
        <div className="admin-acciones">
          <button className="admin-btn admin-btn-primary" onClick={() => setCreando(true)}>
            + Nueva cuenta
          </button>
        </div>
      </div>

      {aviso ? (
        <div className={`admin-aviso admin-aviso-${aviso.tipo === 'ok' ? 'ok' : aviso.tipo}`}>
          {aviso.texto}
          {aviso.enlace ? (
            <div className="admin-copiable">
              <input readOnly value={aviso.enlace} onFocus={(e) => e.currentTarget.select()} />
              <button
                className="admin-btn admin-btn-sm admin-btn-secondary"
                onClick={() => navigator.clipboard?.writeText(aviso.enlace!)}
              >
                Copiar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="admin-filters">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="buscar-usuario">
            Buscar
          </label>
          <input
            id="buscar-usuario"
            className="admin-input"
            placeholder="Nombre, correo o institución"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="filtro-rol">
            Rol
          </label>
          <select
            id="filtro-rol"
            className="admin-select"
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value)}
          >
            <option value="todos">Todos los roles</option>
            <option value="admin">Administradores</option>
            <option value="editor">Editores</option>
            <option value="lector">Lectores</option>
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="filtro-estado">
            Estado
          </label>
          <select
            id="filtro-estado"
            className="admin-select"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="activos">Con acceso</option>
            <option value="inactivos">Sin activar</option>
          </select>
        </div>
        <span className="admin-filter-count">
          {visibles.length} de {usuarios.length}
        </span>
      </div>

      <div className="admin-table-container">
        {visibles.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">👤</div>
            <p className="admin-empty-text">Ninguna cuenta coincide con el filtro.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último acceso</th>
                <th>Alta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((u) => {
                const esUnoMismo = u.id === idPropio
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="admin-table-user-name">
                        {u.nombre || '—'}
                        {esUnoMismo ? (
                          <span className="admin-badge admin-badge-neutro" style={{ marginLeft: 8 }}>
                            usted
                          </span>
                        ) : null}
                      </div>
                      <div className="admin-table-user-email">{u.email}</div>
                      {u.institucion ? (
                        <div className="admin-table-user-email">{u.institucion}</div>
                      ) : null}
                    </td>
                    <td>
                      <select
                        className="admin-select"
                        value={u.rol}
                        disabled={enCurso || esUnoMismo}
                        title={
                          esUnoMismo ? 'No puede cambiarse el rol a sí mismo.' : 'Cambiar el rol'
                        }
                        onChange={(e) =>
                          ejecutar(
                            () => actualizarUsuario(u.id, { rol: e.target.value }),
                            `${u.email} ahora es ${ETIQUETA_ROL[e.target.value as UsuarioDelPanel['rol']].toLowerCase()}.`,
                          )
                        }
                      >
                        <option value="admin">Administrador</option>
                        <option value="editor">Editor</option>
                        <option value="lector">Lector</option>
                      </select>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${u.activo ? 'admin-badge-active' : 'admin-badge-inactive'}`}
                      >
                        {u.activo ? '● Con acceso' : '○ Sin activar'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fecha(u.ultimoAcceso)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fecha(u.creado)}</td>
                    <td>
                      <div className="admin-acciones">
                        <button
                          className={`admin-btn admin-btn-sm ${u.activo ? 'admin-btn-secondary' : 'admin-btn-success'}`}
                          disabled={enCurso || (esUnoMismo && u.activo)}
                          title={
                            esUnoMismo && u.activo ? 'No puede desactivar su propia cuenta.' : ''
                          }
                          onClick={() =>
                            ejecutar(
                              () => cambiarActivoUsuario(u.id, !u.activo),
                              u.activo
                                ? `Se retiró el acceso a ${u.email}.`
                                : `${u.email} ya puede entrar.`,
                            )
                          }
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          disabled={enCurso}
                          onClick={() => setEditando(u)}
                        >
                          Editar
                        </button>
                        <button
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          disabled={enCurso}
                          onClick={() => setPermisos(u)}
                          title="Qué módulos puede ver y editar esta cuenta"
                        >
                          Permisos
                        </button>
                        <button
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          disabled={enCurso}
                          onClick={() => pedirEnlace(u)}
                          title={
                            hayCorreo
                              ? 'Envía un enlace de restablecimiento por correo'
                              : 'Genera un enlace de restablecimiento para entregar a mano'
                          }
                        >
                          Clave
                        </button>
                        <button
                          className="admin-btn admin-btn-sm admin-btn-danger"
                          disabled={enCurso || esUnoMismo}
                          title={esUnoMismo ? 'No puede eliminar su propia cuenta.' : ''}
                          onClick={() => {
                            if (
                              confirm(
                                `¿Eliminar la cuenta de ${u.email}?\n\nSe pierde su historial de lectura y sus comentarios quedan sin autor. Si solo quiere retirarle el acceso, desactívela.`,
                              )
                            ) {
                              ejecutar(
                                () => eliminarUsuario(u.id),
                                `Se eliminó la cuenta de ${u.email}.`,
                              )
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {creando ? (
        <ModalNuevaCuenta
          enCurso={enCurso}
          onCerrar={() => setCreando(false)}
          onCrear={(datos) => {
            setAviso(null)
            iniciar(async () => {
              const resultado = await crearUsuario(
                datos.email,
                datos.nombre,
                datos.contrasena,
                datos.rol,
                datos.institucion,
                datos.activo,
              )
              if (resultado.exito) {
                setCreando(false)
                setAviso({
                  tipo: 'ok',
                  texto: `Cuenta creada para ${datos.email}. Contraseña inicial: ${datos.contrasena} — entréguela y pida que la cambie.`,
                })
                router.refresh()
              } else {
                setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo crear.' })
              }
            })
          }}
        />
      ) : null}

      {permisos ? (
        <ModalPermisos
          usuario={permisos}
          enCurso={enCurso}
          onCerrar={() => setPermisos(null)}
          onGuardar={(datos) => {
            setPermisos(null)
            ejecutar(() => actualizarUsuario(permisos.id, datos), 'Permisos actualizados.')
          }}
        />
      ) : null}

      {editando ? (
        <ModalEditar
          usuario={editando}
          enCurso={enCurso}
          onCerrar={() => setEditando(null)}
          onGuardar={(datos) => {
            setEditando(null)
            ejecutar(() => actualizarUsuario(editando.id, datos), 'Cuenta actualizada.')
          }}
        />
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ modales

function ModalNuevaCuenta({
  enCurso,
  onCerrar,
  onCrear,
}: {
  enCurso: boolean
  onCerrar: () => void
  onCrear: (datos: {
    email: string
    nombre: string
    contrasena: string
    rol: string
    institucion: string
    activo: boolean
  }) => void
}) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [institucion, setInstitucion] = useState('')
  const [contrasena, setContrasena] = useState(claveSugerida)
  const [rol, setRol] = useState('lector')
  const [activo, setActivo] = useState(true)

  return (
    <div className="admin-modal-backdrop" onClick={onCerrar}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal-title">Nueva cuenta</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onCrear({ email, nombre, contrasena, rol, institucion, activo })
          }}
        >
          <div className="admin-form-fila">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="nuevo-nombre">
                Nombre y apellido
              </label>
              <input
                id="nuevo-nombre"
                className="admin-form-input"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="nuevo-email">
                Correo
              </label>
              <input
                id="nuevo-email"
                type="email"
                className="admin-form-input"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="nueva-institucion">
              Institución o servicio
            </label>
            <input
              id="nueva-institucion"
              className="admin-form-input"
              value={institucion}
              onChange={(e) => setInstitucion(e.target.value)}
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="nueva-clave">
              Contraseña inicial
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="nueva-clave"
                className="admin-form-input"
                required
                minLength={12}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
              />
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setContrasena(claveSugerida())}
              >
                Generar
              </button>
            </div>
            <p className="admin-form-hint">
              Mínimo 12 caracteres. Se muestra una sola vez: cópiela antes de guardar y pida que la
              cambie con el botón «Clave».
            </p>
          </div>

          <div className="admin-form-fila">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="nuevo-rol">
                Rol
              </label>
              <select
                id="nuevo-rol"
                className="admin-form-input"
                value={rol}
                onChange={(e) => setRol(e.target.value)}
              >
                <option value="lector">Lector — solo lee lo publicado</option>
                <option value="editor">Editor — redacta y publica contenido</option>
                <option value="admin">Administrador — además gestiona cuentas</option>
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="nuevo-activo">
                Acceso
              </label>
              <label
                htmlFor="nuevo-activo"
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: 8 }}
              >
                <input
                  id="nuevo-activo"
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                />
                <span style={{ fontSize: '0.875rem' }}>Activar de inmediato</span>
              </label>
            </div>
          </div>

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={enCurso}>
              {enCurso ? 'Creando…' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModalEditar({
  usuario,
  enCurso,
  onCerrar,
  onGuardar,
}: {
  usuario: UsuarioDelPanel
  enCurso: boolean
  onCerrar: () => void
  onGuardar: (datos: { nombre: string; email: string; institucion: string }) => void
}) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email)
  const [institucion, setInstitucion] = useState(usuario.institucion)

  return (
    <div className="admin-modal-backdrop" onClick={onCerrar}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal-title">Editar cuenta</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onGuardar({ nombre, email, institucion })
          }}
        >
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="editar-nombre">
              Nombre y apellido
            </label>
            <input
              id="editar-nombre"
              className="admin-form-input"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="editar-email">
              Correo
            </label>
            <input
              id="editar-email"
              type="email"
              className="admin-form-input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="admin-form-hint">
              Cambiar el correo cambia también el usuario con el que esta persona inicia sesión.
            </p>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="editar-institucion">
              Institución o servicio
            </label>
            <input
              id="editar-institucion"
              className="admin-form-input"
              value={institucion}
              onChange={(e) => setInstitucion(e.target.value)}
            />
          </div>
          <div className="admin-modal-actions">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={enCurso}>
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Permisos por módulo de una cuenta.
 *
 * Dos listas y una regla que hay que dejar dicha en la propia pantalla: no
 * marcar nada significa «todos», no «ninguno». Es la interpretación que evita
 * el error más probable —crear una cuenta, olvidar los módulos y que la persona
 * no vea nada sin que se entienda por qué—, pero solo funciona si quien
 * administra lo sabe al mirar.
 */
function ModalPermisos({
  usuario,
  enCurso,
  onCerrar,
  onGuardar,
}: {
  usuario: UsuarioDelPanel
  enCurso: boolean
  onCerrar: () => void
  onGuardar: (datos: { modulosVisibles: string[]; modulosEditables: string[] }) => void
}) {
  const [visibles, setVisibles] = useState<string[]>(usuario.modulosVisibles)
  const [editables, setEditables] = useState<string[]>(usuario.modulosEditables)

  const alternar = (lista: string[], slug: string): string[] =>
    lista.includes(slug) ? lista.filter((s) => s !== slug) : [...lista, slug]

  const esAdmin = usuario.rol === 'admin'
  const esLector = usuario.rol === 'lector'

  return (
    <div className="admin-modal-backdrop" onClick={onCerrar}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal-title">Permisos de {usuario.nombre || usuario.email}</h2>

        {esAdmin ? (
          <div className="admin-aviso admin-aviso-info">
            Es administrador: ve y edita los cinco módulos siempre. Estos permisos no le afectan.
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onGuardar({ modulosVisibles: visibles, modulosEditables: editables })
          }}
        >
          <fieldset className="permisos-grupo" disabled={esAdmin}>
            <legend>Módulos que puede ver</legend>
            <p className="admin-form-hint">
              {visibles.length === 0
                ? 'Sin marcar ninguno: ve los cinco. Marque solo para restringir.'
                : `Ve únicamente ${visibles.length} de 5 módulos.`}
            </p>
            {MODULOS.map((m) => (
              <label key={m.slug} className="permisos-casilla">
                <input
                  type="checkbox"
                  checked={visibles.includes(m.slug)}
                  onChange={() => setVisibles(alternar(visibles, m.slug))}
                />
                <span>{m.nombre}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="permisos-grupo" disabled={esAdmin || esLector}>
            <legend>Módulos que puede editar</legend>
            <p className="admin-form-hint">
              {esLector
                ? 'Un lector no escribe contenido: cambie el rol a editor para asignar módulos.'
                : editables.length === 0
                  ? 'Sin marcar ninguno: edita los cinco.'
                  : `Edita únicamente ${editables.length} de 5 módulos.`}
            </p>
            {MODULOS.map((m) => (
              <label key={m.slug} className="permisos-casilla">
                <input
                  type="checkbox"
                  checked={editables.includes(m.slug)}
                  onChange={() => setEditables(alternar(editables, m.slug))}
                />
                <span>{m.nombre}</span>
              </label>
            ))}
          </fieldset>

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onCerrar}>
              Cancelar
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={enCurso || esAdmin}
            >
              Guardar permisos
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
