'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  detenerDifusion,
  enviarPruebaDeDifusion,
  iniciarDifusion,
  reanudarDifusion,
} from '@/app/(frontend)/acciones/difusion'
import { apuntarCambiosSinGuardar } from '@/admin/salidaDelEditor'
import { mensajeDeDifusion } from '@/correo/mensajes'
import { armarCorreo, esEnlaceSeguro } from '@/correo/plantilla'
import { ruta } from '@/lib/rutas'
import './difusion.css'

export interface GrupoDeDestinatarios {
  valor: string
  etiqueta: string
  cuantos: number
}

export interface DifusionDelHistorial {
  id: string
  asunto: string
  audiencia: string
  autor: string | null
  creada: string
  terminada: string | null
  estado: 'enviando' | 'enviada' | 'con-fallos' | 'detenida'
  /** Si hay un trabajador de este proceso mandándola ahora mismo. */
  enCurso: boolean
  total: number
  enviados: number
  fallidos: number
  pendientes: number
  fallos: Array<{ correo: string; motivo: string }>
}

const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const personas = (n: number) => (n === 1 ? '1 persona' : `${n} personas`)

/**
 * Cuánto tarda en salir una difusión a este ritmo, dicho como lo diría alguien.
 *
 * El primer correo sale enseguida y cada uno de los demás espera su pausa. Se
 * dice «alrededor de» porque el servidor de correo añade lo suyo a cada envío,
 * y un «tardará 42 minutos» exacto se lee como una promesa.
 */
export function duracionAproximada(cuantos: number, pausaMs: number): string {
  const minutos = Math.ceil((Math.max(0, cuantos - 1) * pausaMs) / 60_000)
  if (minutos < 1) return 'menos de un minuto'
  if (minutos === 1) return 'alrededor de un minuto'
  if (minutos < 60) return `alrededor de ${minutos} minutos`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  const minutosSobrantes = resto === 0 ? '' : resto === 1 ? ' y un minuto' : ` y ${resto} minutos`
  return `alrededor de ${horas === 1 ? 'una hora' : `${horas} horas`}${minutosSobrantes}`
}

/**
 * ¿Hay una difusión saliendo ahora? La misma regla que `difusionEnCurso` en la
 * acción: estado `enviando` **y** un trabajador detrás.
 *
 * Mirar solo el trabajador dejaba bloqueada la pantalla después de «Detener»:
 * el trabajador sigue apuntado mientras duerme la pausa —dieciocho segundos por
 * omisión, una hora con un ritmo de uno— y hasta despertar no ve el estado
 * nuevo. La fila decía «Detenida» y el formulario, que había una enviándose.
 */
export const hayAlgunaEnviandose = (historial: Pick<DifusionDelHistorial, 'estado' | 'enCurso'>[]): boolean =>
  historial.some((d) => d.estado === 'enviando' && d.enCurso)

/**
 * Qué botones se ofrecen. Va aparte y sin estado de React para poder probarlo:
 * la pantalla se pinta en el servidor con el formulario vacío, y ahí los
 * botones salen desactivados por falta de texto, sea cual sea el correo.
 */
export function botonesDisponibles(e: {
  hayCorreo: boolean
  problema: string | null
  ocupado: boolean
  cuantos: number
  algunaEnCurso: boolean
}): { probar: boolean; enviar: boolean } {
  const probar = e.hayCorreo && !e.problema && !e.ocupado
  return { probar, enviar: probar && e.cuantos > 0 && !e.algunaEnCurso }
}

/**
 * Qué decir cuando la acción de servidor no llega a contestar.
 *
 * Cuarta copia literal, tras `FormularioDocumento.tsx`, `TablaDocumentos.tsx` y
 * `PanelDeRespaldos.tsx`, y por el mismo motivo que da la tercera: importarla
 * de cualquiera de ellas arrastra una pantalla ajena, y el gancho común de
 * acciones del panel sigue sin existir. Aquí importa sobre todo en «Enviar»: sin
 * ella, una red cortada a mitad deja los botones desbloqueados y ningún aviso,
 * y lo natural es volver a pulsar sin saber si la primera salió.
 */
const motivoDeLaCaida = (fallo: unknown, porOmision: string): string =>
  fallo instanceof Error && fallo.message
    ? `${porOmision} ${fallo.message}`
    : `${porOmision} Compruebe la conexión e inténtelo otra vez.`

/**
 * La etiqueta de estado de una fila del historial.
 *
 * «Interrumpida» no es un estado guardado: es una difusión que dice `enviando`
 * sin que nadie la esté mandando: el servicio se reinició a mitad, o el
 * trabajador se cortó por un error que quedó en el registro. No
 * sigue sola a propósito (ver `lanzarDifusion`), y si se pintara «Enviando» el
 * administrador esperaría un avance que no va a llegar.
 */
function etiquetaDeEstado(d: DifusionDelHistorial): { texto: string; clase: string } {
  switch (d.estado) {
    case 'enviando':
      return d.enCurso
        ? { texto: 'Enviando', clase: 'admin-badge-activo' }
        : { texto: 'Interrumpida', clase: 'admin-badge-pending' }
    case 'enviada':
      return { texto: 'Enviada', clase: 'admin-badge-publicado' }
    case 'con-fallos':
      return { texto: 'Con fallos', clase: 'difusion-etiqueta-fallos' }
    case 'detenida':
      return { texto: 'Detenida', clase: 'admin-badge-neutro' }
  }
}

export function PanelDeDifusion({
  grupos,
  historial,
  hayCorreo,
  pausaMs,
  correosPorHora,
  direccionPlataforma,
}: {
  grupos: GrupoDeDestinatarios[]
  historial: DifusionDelHistorial[]
  hayCorreo: boolean
  pausaMs: number
  correosPorHora: number
  direccionPlataforma: string
}) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [botonTexto, setBotonTexto] = useState('')
  const [botonEnlace, setBotonEnlace] = useState('')
  const [audiencia, setAudiencia] = useState(grupos[0]?.valor ?? 'todas')
  const [confirmando, setConfirmando] = useState(false)
  // Qué se está esperando, para rotular el botón que lo pidió y no todos: con
  // un «Enviando…» en la prueba mientras se detiene otra difusión, parecería
  // que salió un correo que nadie mandó.
  const [probando, setProbando] = useState(false)

  const idAyudaMensaje = useId()
  const idConfirmacion = useId()
  const botonConfirmar = useRef<HTMLButtonElement>(null)

  const grupo = grupos.find((g) => g.valor === audiencia)
  const cuantos = grupo?.cuantos ?? 0
  const algunaEnCurso = hayAlgunaEnviandose(historial)

  const sucio = [asunto, mensaje, botonTexto, botonEnlace].some((t) => t.trim() !== '')

  // Lo que impide enviar, en el orden en que conviene arreglarlo. El servidor
  // vuelve a comprobarlo todo; esto es para no dejar pulsar un botón que va a
  // contestar con un error.
  const tieneTexto = botonTexto.trim() !== ''
  const tieneEnlace = botonEnlace.trim() !== ''
  const enlaceInseguro = tieneEnlace && !esEnlaceSeguro(botonEnlace)
  const problema = !asunto.trim() || !mensaje.trim()
    ? 'Escriba el asunto y el mensaje.'
    : tieneTexto !== tieneEnlace
      ? 'El botón necesita el texto y el enlace, o ninguno de los dos.'
      : enlaceInseguro
        ? 'El enlace del botón tiene que ser una dirección completa, que empiece por http:// o https://.'
        : null

  const { probar: puedeProbar, enviar: puedeEnviar } = botonesDisponibles({
    hayCorreo,
    problema,
    ocupado,
    cuantos,
    algunaEnCurso,
  })

  /**
   * La vista previa se arma con las mismas dos funciones con las que sale el
   * correo (`mensajeDeDifusion` y `armarCorreo`), no con un parecido. Lo único
   * distinto es el logotipo: en el correo va adjunto (`cid:`) y aquí se pide a
   * la plataforma, que el marco sí puede cargar.
   *
   * Va en un `<iframe sandbox="">` y no pintada en la página por dos motivos: el
   * HTML de un correo trae su `<body>` y sus estilos, que dentro del panel
   * chocarían con `admin.css`; y el sandbox vacío no deja correr nada ni seguir
   * enlaces desde el marco, así que lo que el administrador pegue en el mensaje
   * no puede hacer nada en su sesión.
   */
  const vistaPrevia = useMemo(
    () =>
      armarCorreo(
        mensajeDeDifusion(
          {
            asunto: asunto.trim() || 'Asunto del correo',
            mensaje: mensaje.trim() || 'Aquí aparecerá su mensaje.',
            boton: tieneTexto && tieneEnlace ? { texto: botonTexto.trim(), enlace: botonEnlace.trim() } : undefined,
          },
          'Nombre',
        ),
        { logo: ruta('/logo-correo.png') },
      ).html,
    [asunto, mensaje, botonTexto, botonEnlace, tieneTexto, tieneEnlace],
  )

  // Con texto escrito, la barra lateral y Atrás preguntan antes de salir. Es
  // el mismo patrón que el editor de fichas: apuntarse solo mientras hay algo,
  // para que después de enviar —que vacía el formulario— se pueda salir sin
  // pregunta.
  useEffect(() => {
    if (!sucio) return
    return apuntarCambiosSinGuardar()
  }, [sucio])

  // Mientras una difusión sale, el historial se vuelve a pedir cada pocos
  // segundos para ver avanzar la barra. Solo entonces: una pantalla quieta que
  // consulta la base cada cuatro segundos para nada es carga gratuita. El
  // formulario no se pierde, porque `refresh` rehace la parte de servidor y
  // conserva el estado de este componente.
  useEffect(() => {
    if (!algunaEnCurso) return
    const reloj = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(reloj)
  }, [algunaEnCurso, router])

  useEffect(() => {
    if (confirmando) botonConfirmar.current?.focus()
  }, [confirmando])

  /** Cualquier cambio en lo escrito anula una confirmación ya pedida. */
  const cambiar = (fijar: (valor: string) => void) => (valor: string) => {
    fijar(valor)
    setConfirmando(false)
  }

  const datos = { asunto, mensaje, botonTexto, botonEnlace, audiencia }

  const probar = () => {
    setAviso(null)
    setProbando(true)
    iniciar(async () => {
      try {
        const resultado = await enviarPruebaDeDifusion(datos)
        if (resultado.exito && resultado.datos) {
          setAviso({
            tipo: 'ok',
            texto: `Prueba enviada a ${resultado.datos.para}. Si no llega en unos minutos, mire en el correo no deseado.`,
          })
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo enviar la prueba.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo enviar la prueba.') })
      } finally {
        setProbando(false)
      }
    })
  }

  const enviar = () => {
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await iniciarDifusion(datos)
        setConfirmando(false)
        if (resultado.exito && resultado.datos) {
          setAviso({
            tipo: 'ok',
            texto: `Enviando «${asunto.trim()}» a ${personas(resultado.datos.total)}. El envío sigue aunque salga de esta pantalla; el avance se ve en el historial.`,
          })
          setAsunto('')
          setMensaje('')
          setBotonTexto('')
          setBotonEnlace('')
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo empezar la difusión.' })
        }
      } catch (fallo) {
        setConfirmando(false)
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo empezar la difusión.') })
      }
    })
  }

  const detener = (d: DifusionDelHistorial) => {
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await detenerDifusion(d.id)
        if (resultado.exito) {
          setAviso({
            tipo: 'ok',
            texto: `Se detuvo «${d.asunto}». El correo que estuviera saliendo en ese instante termina de salir; los siguientes, no.`,
          })
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo detener.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo detener.') })
      }
    })
  }

  const reanudar = (d: DifusionDelHistorial) => {
    if (
      !confirm(
        `¿Reanudar «${d.asunto}»?\n\nQuedan ${personas(d.pendientes)} por recibirla. Al ritmo configurado tardará ${duracionAproximada(d.pendientes, pausaMs)}. Quienes ya la recibieron no la reciben otra vez; si el envío se cortó justo al mandar un correo, esa última persona puede recibirla dos veces.`,
      )
    ) {
      return
    }
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await reanudarDifusion(d.id)
        if (resultado.exito) {
          setAviso({ tipo: 'ok', texto: `Se reanudó «${d.asunto}».` })
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo reanudar.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo reanudar.') })
      }
    })
  }

  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <h1 className="admin-title">Difusión</h1>
          <p className="admin-subtitle">
            Un correo a todas las cuentas activas o a un grupo: un aviso de clase, un caso nuevo, un
            cambio de horario. Sale uno por persona, con su nombre, al ritmo que admite el servidor de
            correo.
          </p>
        </div>
      </div>

      {aviso ? (
        <div className={`admin-aviso admin-aviso-${aviso.tipo}`} role="status">
          {aviso.texto}
        </div>
      ) : null}

      {!hayCorreo ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>No hay servidor de correo configurado.</strong>
          Puede redactar y ver cómo quedará, pero no enviar ni la prueba ni la difusión. La
          configuración del correo saliente y su estado están en{' '}
          <Link href="/admin-panel/sistema">Sistema</Link>.
        </div>
      ) : null}

      <div className="difusion-rejilla">
        <section className="admin-card difusion-redaccion" aria-label="Redactar la difusión">
          <h2 className="difusion-subtitulo">Redactar</h2>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="difusion-asunto">
              Asunto
            </label>
            <input
              id="difusion-asunto"
              className="admin-form-input"
              value={asunto}
              maxLength={150}
              onChange={(e) => cambiar(setAsunto)(e.target.value)}
              placeholder="Sesión del lunes: fracturas de meseta tibial"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="difusion-mensaje">
              Mensaje
            </label>
            <textarea
              id="difusion-mensaje"
              className="admin-form-input difusion-mensaje"
              value={mensaje}
              maxLength={5000}
              rows={12}
              aria-describedby={idAyudaMensaje}
              onChange={(e) => cambiar(setMensaje)(e.target.value)}
            />
            <p className="admin-form-hint" id={idAyudaMensaje}>
              Una línea en blanco separa párrafos. Las líneas que empiezan por «- » forman una lista.
              Las direcciones que empiezan por https:// se convierten solas en enlaces. El saludo
              («Hola, …») lo pone la plataforma con el nombre de cada persona.
              <span className="difusion-contador">{mensaje.length} / 5000</span>
            </p>
          </div>

          <fieldset className="difusion-boton">
            <legend className="admin-form-label">Botón (opcional)</legend>
            <div className="admin-form-fila">
              <div>
                <label className="difusion-etiqueta-menor" htmlFor="difusion-boton-texto">
                  Texto
                </label>
                <input
                  id="difusion-boton-texto"
                  className="admin-form-input"
                  value={botonTexto}
                  maxLength={60}
                  onChange={(e) => cambiar(setBotonTexto)(e.target.value)}
                  placeholder="Abrir el caso"
                />
              </div>
              <div>
                <label className="difusion-etiqueta-menor" htmlFor="difusion-boton-enlace">
                  Enlace
                </label>
                <input
                  id="difusion-boton-enlace"
                  className="admin-form-input"
                  type="url"
                  value={botonEnlace}
                  maxLength={500}
                  aria-invalid={enlaceInseguro || undefined}
                  onChange={(e) => cambiar(setBotonEnlace)(e.target.value)}
                  placeholder={direccionPlataforma ? `${direccionPlataforma}/…` : 'https://…'}
                />
              </div>
            </div>
            {direccionPlataforma ? (
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary difusion-sugerencia"
                onClick={() => {
                  cambiar(setBotonEnlace)(direccionPlataforma)
                  if (!tieneTexto) setBotonTexto('Entrar a TraumaHub')
                }}
              >
                Usar la dirección de TraumaHub
              </button>
            ) : null}
          </fieldset>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="difusion-audiencia">
              Destinatarios
            </label>
            <select
              id="difusion-audiencia"
              className="admin-form-input"
              value={audiencia}
              onChange={(e) => cambiar(setAudiencia)(e.target.value)}
            >
              {grupos.map((g) => (
                <option key={g.valor} value={g.valor}>
                  {g.etiqueta} ({g.cuantos})
                </option>
              ))}
            </select>
            <p className="admin-form-hint">
              Solo cuentas activas. Las solicitudes de cuenta sin revisar y las cuentas desactivadas no
              reciben nada.
            </p>
          </div>

          {problema && sucio ? <p className="difusion-problema">{problema}</p> : null}
          {!problema && cuantos === 0 ? (
            <p className="difusion-problema">No hay ninguna cuenta activa en ese grupo.</p>
          ) : null}
          {algunaEnCurso ? (
            <p className="difusion-problema">
              Hay una difusión enviándose. Puede probar esta, pero no enviarla hasta que aquella termine
              o se detenga.
            </p>
          ) : null}

          {confirmando ? (
            <div
              className="admin-aviso admin-aviso-atencion difusion-confirmacion"
              role="alertdialog"
              aria-labelledby={idConfirmacion}
            >
              <strong id={idConfirmacion}>
                ¿Enviar «{asunto.trim()}» a {personas(cuantos)}?
              </strong>
              Grupo: {grupo?.etiqueta}. Al ritmo configurado —{correosPorHora} correos por hora— tardará{' '}
              {duracionAproximada(cuantos, pausaMs)}. El envío sigue aunque cierre esta pantalla y se
              puede detener desde el historial, pero lo que ya salió no se recupera.
              <div className="admin-acciones difusion-confirmacion-botones">
                <button
                  ref={botonConfirmar}
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={enviar}
                  disabled={!puedeEnviar}
                >
                  {ocupado ? 'Empezando…' : `Sí, enviar a ${personas(cuantos)}`}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setConfirmando(false)}
                  disabled={ocupado}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="admin-acciones difusion-envio">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={probar} disabled={!puedeProbar}>
                {probando ? 'Enviando la prueba…' : 'Enviarme una prueba'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={() => setConfirmando(true)}
                disabled={!puedeEnviar}
              >
                Enviar a {personas(cuantos)}
              </button>
            </div>
          )}
        </section>

        <section className="difusion-vista" aria-label="Vista previa del correo">
          <div className="difusion-vista-cabecera">
            <h2 className="difusion-subtitulo">Vista previa</h2>
            <span className="admin-form-hint">Así lo recibirá cada persona, con su nombre en el saludo.</span>
          </div>
          <iframe className="difusion-vista-marco" title="Vista previa del correo" sandbox="" srcDoc={vistaPrevia} />
        </section>
      </div>

      <h2 className="admin-section-title">Historial</h2>
      <div className="admin-table-container">
        {historial.length === 0 ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Todavía no se ha enviado ninguna difusión.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Asunto</th>
                <th>Destinatarios</th>
                <th>Enviados</th>
                <th>Fallidos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((d) => {
                const estado = etiquetaDeEstado(d)
                const interrumpida = d.estado === 'enviando' && !d.enCurso
                const reanudable = (d.estado === 'detenida' || interrumpida) && d.pendientes > 0
                const avance = d.total > 0 ? Math.round((d.enviados / d.total) * 100) : 100
                return (
                  <tr key={d.id}>
                    <td className="difusion-fecha">
                      {fechaHora(d.creada)}
                      {d.autor ? <div className="admin-table-user-email">{d.autor}</div> : null}
                    </td>
                    <th scope="row" className="difusion-asunto">
                      {d.asunto}
                      <div className="admin-table-user-email">{d.audiencia}</div>
                    </th>
                    <td>{d.total}</td>
                    <td className="difusion-avance">
                      {d.enviados} de {d.total}
                      <div
                        className="admin-progreso"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={avance}
                        aria-label={`Enviados ${d.enviados} de ${d.total}`}
                      >
                        <div className="admin-progreso-relleno" style={{ width: `${avance}%` }} />
                      </div>
                    </td>
                    <td>
                      {d.fallidos === 0 ? (
                        <span className="difusion-sin-fallos">0</span>
                      ) : (
                        <details className="difusion-fallos">
                          <summary>{d.fallidos}</summary>
                          <ul>
                            {d.fallos.map((f, i) => (
                              <li key={`${f.correo}-${i}`}>
                                <span className="difusion-fallo-correo">{f.correo}</span>
                                {f.motivo ? <span className="difusion-fallo-motivo">{f.motivo}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td>
                      <span className={`admin-badge ${estado.clase}`}>{estado.texto}</span>
                      {interrumpida ? (
                        <div className="admin-table-user-email">
                          El envío se cortó a la mitad (un reinicio del servicio o un error: ver el
                          registro). Quedan {personas(d.pendientes)}.
                        </div>
                      ) : d.estado === 'detenida' && d.pendientes > 0 ? (
                        <div className="admin-table-user-email">Quedan {personas(d.pendientes)}.</div>
                      ) : null}
                    </td>
                    <td>
                      <div className="admin-acciones">
                        {d.estado === 'enviando' && d.enCurso ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => detener(d)}
                            disabled={ocupado}
                          >
                            Detener
                          </button>
                        ) : null}
                        {reanudable ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-primary"
                            onClick={() => reanudar(d)}
                            disabled={ocupado || !hayCorreo || algunaEnCurso}
                            title={
                              !hayCorreo
                                ? 'No hay servidor de correo configurado.'
                                : algunaEnCurso
                                  ? 'Hay otra difusión enviándose.'
                                  : undefined
                            }
                          >
                            Reanudar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
