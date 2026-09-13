'use client'

import {
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { MODULOS } from '../modulos'
import { normalizar } from '@/lib/busqueda'
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
 * Lo que se dice cuando la acción ni siquiera llegó a contestar.
 *
 * `accion()` (src/lib/guardias.ts) convierte en mensaje lo que falla DENTRO del
 * servidor. Lo que se rompe en el camino no pasa por ahí: el proxy compartido
 * devuelve 502, la sesión caduca y vuelve HTML en vez de la respuesta de
 * acción, o se reconstruye la imagen y Next ya no reconoce el identificador de
 * acción que tiene abierta esta pestaña. En esos casos la promesa rechaza y no
 * hay ningún `mensaje` que enseñar, así que lo pone este texto.
 */
const FALLO_DE_TRANSPORTE = 'No se pudo contactar con el servidor. Recargue la página y reintente.'

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

  /**
   * Qué fila está trabajando, no solo si hay algo trabajando.
   *
   * `enCurso` es uno para toda la tabla: usándolo como `disabled` en los seis
   * controles de cada fila, una acción sobre una cuenta dejaba inertes los
   * controles de las treinta y siete durante todo el viaje de ida y vuelta, que
   * además incluye un `router.refresh()` sobre una página `force-dynamic`.
   * Guardando el identificador solo se apaga la fila afectada. `enCurso` se
   * sigue usando en los modales, donde sí hay una única acción posible.
   */
  const [filaEnCurso, setFilaEnCurso] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<UsuarioDelPanel | null>(null)
  const [permisos, setPermisos] = useState<UsuarioDelPanel | null>(null)

  /**
   * El rol elegido se ve mientras la acción viaja.
   *
   * El `<select>` de la columna Rol es controlado con el rol que llega del
   * servidor, y ese valor no cambia hasta que termina el `router.refresh()`.
   * Sin esto, React devolvía el desplegable al rol anterior en cuanto se elegía
   * otro —es un control controlado: React reescribe el valor del nodo— y
   * parecía que el cambio no se había aplicado, con lo que se volvía a elegir y
   * se disparaba una segunda escritura. React descarta el valor optimista
   * cuando la transición acaba, así que un fallo revierte solo, que es
   * exactamente lo que aquí se quiere.
   */
  const [listaMostrada, ponerRolOptimista] = useOptimistic<
    UsuarioDelPanel[],
    { id: string; rol: UsuarioDelPanel['rol'] }
  >(usuarios, (lista, cambio) =>
    lista.map((u) => (u.id === cambio.id ? { ...u, rol: cambio.rol } : u)),
  )

  const visibles = useMemo(() => {
    // `normalizar()` quita las tildes además de las mayúsculas, que es lo que
    // `toLowerCase()` no hacía: buscar «jose» no encontraba a José Pérez ni
    // «munoz» a Muñoz, y en un padrón chileno eso es media tabla. Las palabras
    // se exigen todas y en cualquier orden, igual que en `filtrarFichas`, para
    // que «perez jose» valga tanto como «jose perez».
    const palabras = normalizar(busqueda).split(' ').filter(Boolean)
    return listaMostrada.filter((u) => {
      if (filtroRol !== 'todos' && u.rol !== filtroRol) return false
      if (filtroEstado === 'activos' && !u.activo) return false
      if (filtroEstado === 'inactivos' && u.activo) return false
      if (palabras.length === 0) return true
      const donde = normalizar([u.nombre, u.email, u.institucion].join(' '))
      return palabras.every((palabra) => donde.includes(palabra))
    })
  }, [listaMostrada, busqueda, filtroRol, filtroEstado])

  /**
   * Ejecuta una acción, muestra su resultado y recarga los datos del servidor.
   *
   * El `try` no es precaución de más: sin él, el rechazo de la promesa se
   * propaga al render de la transición —React guarda el thenable rechazado como
   * estado y vuelve a lanzarlo al pintar—, ninguna de las dos ramas llega a
   * poner un aviso y la frontera de error de Next se lleva por delante la tabla
   * entera. El administrador se queda con «Application error» y sin saber si la
   * acción llegó a aplicarse.
   *
   * `alLograrlo` corre solo si el servidor confirmó: es lo que permite cerrar
   * el modal DESPUÉS de guardar. Cerrándolo antes, un rechazo —un correo que ya
   * existe, la sesión caducada mientras se marcaban diez casillas— desmontaba
   * el formulario con todo lo escrito dentro y no había dónde volver.
   */
  const ejecutar = (
    tarea: () => Promise<{ exito: boolean; mensaje?: string }>,
    exitoso: string,
    opciones: { fila?: string; alEnviar?: () => void; alLograrlo?: () => void } = {},
  ) => {
    setAviso(null)
    iniciar(async () => {
      // Dentro de la transición y antes del `await`: es la única forma de que
      // React acepte el valor optimista y lo mantenga hasta que la acción y su
      // recarga terminen.
      opciones.alEnviar?.()
      if (opciones.fila) setFilaEnCurso(opciones.fila)
      try {
        const resultado = await tarea()
        if (resultado.exito) {
          opciones.alLograrlo?.()
          setAviso({ tipo: 'ok', texto: exitoso })
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo completar la acción.' })
        }
      } catch {
        setAviso({ tipo: 'error', texto: FALLO_DE_TRANSPORTE })
      } finally {
        setFilaEnCurso(null)
      }
    })
  }

  const pedirEnlace = (u: UsuarioDelPanel) => {
    setAviso(null)
    iniciar(async () => {
      setFilaEnCurso(u.id)
      try {
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
      } catch {
        // Sin esto, el fallo de transporte tumbaba la página y el testigo ya
        // emitido quedaba sin enseñar: cada nueva pulsación invalida el
        // anterior, así que el administrador acababa copiando un enlace muerto.
        setAviso({ tipo: 'error', texto: FALLO_DE_TRANSPORTE })
      } finally {
        setFilaEnCurso(null)
      }
    })
  }

  /** El error que hay que enseñar dentro del modal abierto, si lo hay. */
  const errorDelModal = aviso?.tipo === 'error' ? aviso.texto : null

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

      {/*
        La región viva se queda montada aunque no haya nada que decir. Un
        `role="status"` que aparece con el mensaje no se anuncia de forma
        fiable: el lector de pantalla tiene que estar observando la región antes
        de que su contenido cambie. Vacía no ocupa sitio, porque el borde y el
        margen los pone `.admin-aviso`, que sí es condicional. Sin esto, pulsar
        «Clave» no anunciaba nada y se volvía a pulsar, invalidando el testigo
        recién emitido.
      */}
      <div role="status">
        {aviso ? (
          <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>
            {aviso.texto}
            {aviso.enlace ? (
              <div className="admin-copiable">
                <input
                  readOnly
                  aria-label="Enlace de restablecimiento"
                  value={aviso.enlace}
                  onFocus={(e) => e.currentTarget.select()}
                />
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
      </div>

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
                const ocupada = filaEnCurso === u.id
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
                      {/*
                        Mientras la fila trabaja, este desplegable lleva
                        `aria-disabled` y no `disabled`, por la misma razón que
                        los botones de la última columna —ver el comentario de
                        ahí— y con más motivo: es el único control de la fila
                        que con seguridad tiene el foco en el instante en que su
                        acción arranca, porque el `onChange` lo dispara él
                        mismo. Desactivándolo de verdad, el navegador le quitaba
                        el foco y lo soltaba en `<body>`, y la siguiente
                        tabulación volvía a empezar por el principio del
                        documento. Tampoco hace falta apagarlo para que se vea
                        el rol recién elegido: de eso se encarga el valor
                        optimista.
                      */}
                      <select
                        className="admin-select"
                        value={u.rol}
                        disabled={esUnoMismo}
                        aria-disabled={ocupada}
                        aria-label={`Rol de ${u.email}`}
                        title={
                          esUnoMismo ? 'No puede cambiarse el rol a sí mismo.' : 'Cambiar el rol'
                        }
                        style={ocupada ? { opacity: 0.5 } : undefined}
                        onChange={(e) => {
                          if (ocupada) return
                          const rol = e.target.value as UsuarioDelPanel['rol']
                          ejecutar(
                            () => actualizarUsuario(u.id, { rol }),
                            `${u.email} ahora es ${ETIQUETA_ROL[rol].toLowerCase()}.`,
                            { fila: u.id, alEnviar: () => ponerRolOptimista({ id: u.id, rol }) },
                          )
                        }}
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
                      {/*
                        Mientras la fila trabaja, sus botones llevan
                        `aria-disabled` y no `disabled`: un elemento que se
                        desactiva teniendo el foco lo devuelve a `<body>`, y
                        quien navega con teclado tenía que tabular otra vez
                        desde los filtros y por todas las filas anteriores. El
                        `disabled` de verdad se reserva para lo que no depende
                        del momento —no puede uno desactivarse ni eliminarse a
                        sí mismo—. Como `.admin-btn` no define estilo de
                        `:disabled`, tampoco se pierde nada visual: el aviso de
                        que la fila está ocupada lo da la opacidad de aquí.
                      */}
                      <div
                        className="admin-acciones"
                        aria-busy={ocupada}
                        style={ocupada ? { opacity: 0.5 } : undefined}
                      >
                        <button
                          className={`admin-btn admin-btn-sm ${u.activo ? 'admin-btn-secondary' : 'admin-btn-success'}`}
                          disabled={esUnoMismo && u.activo}
                          aria-disabled={ocupada}
                          aria-label={
                            u.activo
                              ? `Retirar el acceso a ${u.email}`
                              : `Dar acceso a la cuenta de ${u.email}`
                          }
                          title={
                            esUnoMismo && u.activo ? 'No puede desactivar su propia cuenta.' : ''
                          }
                          onClick={() => {
                            if (ocupada) return
                            ejecutar(
                              () => cambiarActivoUsuario(u.id, !u.activo),
                              u.activo
                                ? `Se retiró el acceso a ${u.email}.`
                                : `${u.email} ya puede entrar.`,
                              { fila: u.id },
                            )
                          }}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          aria-disabled={ocupada}
                          aria-label={`Editar la cuenta de ${u.email}`}
                          onClick={() => {
                            if (ocupada) return
                            setEditando(u)
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          aria-disabled={ocupada}
                          aria-label={`Permisos por módulo de ${u.email}`}
                          onClick={() => {
                            if (ocupada) return
                            setPermisos(u)
                          }}
                          title="Qué módulos puede ver y editar esta cuenta"
                        >
                          Permisos
                        </button>
                        <button
                          className="admin-btn admin-btn-sm admin-btn-secondary"
                          aria-disabled={ocupada}
                          aria-label={`Restablecer la contraseña de ${u.email}`}
                          onClick={() => {
                            if (ocupada) return
                            pedirEnlace(u)
                          }}
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
                          disabled={esUnoMismo}
                          aria-disabled={ocupada}
                          aria-label={`Eliminar la cuenta de ${u.email}`}
                          title={esUnoMismo ? 'No puede eliminar su propia cuenta.' : ''}
                          onClick={() => {
                            if (ocupada) return
                            if (
                              confirm(
                                `¿Eliminar la cuenta de ${u.email}?\n\nSe pierde su historial de lectura y sus comentarios quedan sin autor. Si solo quiere retirarle el acceso, desactívela.`,
                              )
                            ) {
                              ejecutar(
                                () => eliminarUsuario(u.id),
                                `Se eliminó la cuenta de ${u.email}.`,
                                { fila: u.id },
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
          error={errorDelModal}
          onCerrar={() => setCreando(false)}
          onCrear={(datos) =>
            ejecutar(
              () =>
                crearUsuario(
                  datos.email,
                  datos.nombre,
                  datos.contrasena,
                  datos.rol,
                  datos.institucion,
                  datos.activo,
                ),
              `Cuenta creada para ${datos.email}. Contraseña inicial: ${datos.contrasena} — entréguela y pida que la cambie.`,
              { alLograrlo: () => setCreando(false) },
            )
          }
        />
      ) : null}

      {permisos ? (
        <ModalPermisos
          usuario={permisos}
          enCurso={enCurso}
          error={errorDelModal}
          onCerrar={() => setPermisos(null)}
          onGuardar={(datos) =>
            ejecutar(() => actualizarUsuario(permisos.id, datos), 'Permisos actualizados.', {
              alLograrlo: () => setPermisos(null),
            })
          }
        />
      ) : null}

      {editando ? (
        <ModalEditar
          usuario={editando}
          enCurso={enCurso}
          error={errorDelModal}
          onCerrar={() => setEditando(null)}
          onGuardar={(datos) =>
            ejecutar(() => actualizarUsuario(editando.id, datos), 'Cuenta actualizada.', {
              alLograrlo: () => setEditando(null),
            })
          }
        />
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ modales

/**
 * Velo y caja de los modales de esta pantalla.
 *
 * Los tres empezaban con dos `div` desnudos: sin `role="dialog"`, sin Escape,
 * sin llevar el foco dentro ni devolverlo al salir, y montados al final del
 * documento, detrás de la tabla. Abrir «Permisos» con teclado dejaba el foco en
 * el botón de la fila y la primera tabulación bajaba a la fila siguiente, por
 * detrás del velo. El patrón completo ya estaba resuelto en
 * `src/components/MenuMovil.tsx` y es el que se repite aquí.
 *
 * El alto máximo y el desplazamiento estuvieron un tiempo en línea aquí, y ya
 * no: viven en `.admin-modal-backdrop` y `.admin-modal` de `admin.css`, con su
 * porqué escrito al lado. El modal de permisos de esta misma pantalla es el que
 * manda sobre esos cuatro valores —mide unos 675 px y no cabe en un portátil
 * 1080p con el escalado de Windows al 125 %—, así que quien los cambie tiene
 * que abrirlo. Repetirlos aquí en línea dejaba dos copias de la misma regla y
 * los modales del resto del panel sin ninguna.
 */
function EnvolturaModal({
  titulo,
  error,
  onCerrar,
  children,
}: {
  titulo: string
  error?: string | null
  onCerrar: () => void
  children: ReactNode
}) {
  const caja = useRef<HTMLDivElement>(null)
  const idTitulo = useId()

  // El padre pasa una función nueva en cada pintado. Con `onCerrar` en las
  // dependencias del efecto de abajo, este se desmontaba y volvía a montarse en
  // cada tecla escrita, devolviendo el foco a la caja y sacándolo del campo que
  // se estaba rellenando. Por eso el efecto no depende de nada y lee la última
  // versión desde aquí.
  const cerrar = useRef(onCerrar)
  useEffect(() => {
    cerrar.current = onCerrar
  })

  useEffect(() => {
    const devolverA = document.activeElement as HTMLElement | null

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        cerrar.current()
        return
      }

      if (evento.key !== 'Tab') return

      // El diálogo se anuncia `aria-modal="true"`, y eso le promete al lector de
      // pantalla que detrás no queda nada que alcanzar. Sin ciclar el foco la
      // promesa es falsa: con el modal de permisos abierto, cuatro tabulaciones
      // desde «Guardar permisos» dejaban el foco en la tabla de cuentas que el
      // velo está tapando, que se seguía leyendo en voz alta y sin camino
      // evidente de vuelta. Llevar el foco al abrir no basta; hay que
      // mantenerlo dentro. Es el mismo bloque de `src/components/MenuMovil.tsx`.
      const contenedor = caja.current
      if (!contenedor) return

      // `:disabled` donde `MenuMovil` usa `[disabled]`, y la diferencia importa
      // aquí: el modal de permisos apaga `fieldset` enteros, y una casilla
      // dentro de un `fieldset` desactivado no lleva el atributo pero tampoco
      // acepta el foco. Con el selector por atributo, el ciclo acababa llamando
      // a `focus()` sobre una casilla inerte —la cuenta de un administrador
      // tiene los dos grupos apagados— y, con la tabulación ya frenada, el foco
      // se quedaba clavado donde estaba.
      const enfocables = Array.from(
        contenedor.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (enfocables.length === 0) return

      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]
      const activo = document.activeElement

      // El foco puede no estar en ninguno de los dos extremos y ni siquiera
      // dentro del diálogo: el botón de guardar de estos tres modales lleva
      // `disabled={enCurso}`, y un elemento que se desactiva teniendo el foco
      // lo suelta en `<body>`. Sin esta rama, pulsar «Guardar permisos» y
      // tabular mientras la acción viaja se iba a la tabla de detrás sin pasar
      // por `primero` ni por `ultimo`, que es el agujero por el que se colaba
      // justo lo que este bloque viene a cerrar.
      if (!contenedor.contains(activo)) {
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
        return
      }

      // El propio diálogo cuenta como «principio»: al abrirse el foco entra en
      // él —tiene `tabIndex -1` justo para eso— y desde ahí Shift+Tab se iría a
      // la tabla de detrás.
      if (evento.shiftKey && (activo === primero || activo === contenedor)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && activo === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', alTeclear)

    // El fondo no se desplaza mientras el modal está abierto.
    const desbordeOriginal = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    caja.current?.focus()

    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = desbordeOriginal
      // Al cerrar, el foco vuelve al botón que abrió el modal. Si ese botón ya
      // no está —la recarga del servidor rehízo la fila—, `focus()` sobre un
      // nodo suelto no hace nada y no rompe.
      devolverA?.focus()
    }
  }, [])

  return (
    <div className="admin-modal-backdrop" onClick={onCerrar}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        ref={caja}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="admin-modal-title" id={idTitulo}>
          {titulo}
        </h2>
        {/*
          El motivo del rechazo se lee aquí dentro y no solo en el aviso de la
          página: ahora el modal sobrevive al error, y el aviso de arriba queda
          detrás del velo, donde no se ve.
        */}
        {error ? (
          <div className="admin-aviso admin-aviso-error" role="status">
            {error}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

function ModalNuevaCuenta({
  enCurso,
  error,
  onCerrar,
  onCrear,
}: {
  enCurso: boolean
  error?: string | null
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
    <EnvolturaModal titulo="Nueva cuenta" error={error} onCerrar={onCerrar}>
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
    </EnvolturaModal>
  )
}

function ModalEditar({
  usuario,
  enCurso,
  error,
  onCerrar,
  onGuardar,
}: {
  usuario: UsuarioDelPanel
  enCurso: boolean
  error?: string | null
  onCerrar: () => void
  onGuardar: (datos: { nombre: string; email: string; institucion: string }) => void
}) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email)
  const [institucion, setInstitucion] = useState(usuario.institucion)

  return (
    <EnvolturaModal titulo="Editar cuenta" error={error} onCerrar={onCerrar}>
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
    </EnvolturaModal>
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
  error,
  onCerrar,
  onGuardar,
}: {
  usuario: UsuarioDelPanel
  enCurso: boolean
  error?: string | null
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
    <EnvolturaModal
      titulo={`Permisos de ${usuario.nombre || usuario.email}`}
      error={error}
      onCerrar={onCerrar}
    >
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
    </EnvolturaModal>
  )
}
