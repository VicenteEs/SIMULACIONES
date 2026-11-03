'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronLeft, CircleAlert, CircleCheck, Loader2, Lock, Mail, Send } from 'lucide-react'
import { solicitarCuenta } from '@/app/(frontend)/acciones/sesion'
import { normalizar } from '@/lib/busqueda'
import {
  CLAVE_MINIMA,
  ETAPAS_DE_FORMACION,
  LARGOS_DE_SOLICITUD,
  PASOS_DE_LA_SOLICITUD,
  PROGRAMAS_CONOCIDOS,
  etiquetaDeEtapa,
  institucionConPrograma,
  problemasDelPaso,
  type CampoDeSolicitud,
  type DatosDeSolicitud,
  type EtapaDeFormacion,
} from '@/lib/solicitudDeCuenta'

const VACIA: DatosDeSolicitud = { nombre: '', correo: '', clave: '', repetida: '', institucion: '', programa: '', etapa: '', motivo: '' }

const ULTIMO = PASOS_DE_LA_SOLICITUD.length - 1

/**
 * La solicitud de cuenta en los tres pasos del tablero «Registro» de Penpot
 * (P-007 E3, D-236): tus datos, tu institución y confirmación.
 *
 * Es un solo formulario y una sola llamada a `solicitarCuenta`, al final: los
 * pasos son de la pantalla y no del servidor. Guardar a medias en la base
 * dejaría cuentas pendientes sin institución que el administrador no sabría si
 * activar, y el freno por dirección contaría tres intentos por persona.
 *
 * Cada paso se valida con las reglas de `solicitudDeCuenta.ts` antes de dejar
 * pasar al siguiente, y avisa campo a campo como el de cotizar: después de
 * pulsar «Continuar» o al salir de un campo ya tocado, no mientras se escribe
 * el primer carácter.
 *
 * Al cambiar de paso el foco va al titular nuevo. Sin eso, quien navega con
 * lector de pantalla pulsa «Continuar», el botón desaparece bajo su foco y el
 * lector no anuncia nada: no sabe si avanzó.
 */
export function FormularioRegistro({ conCorreo }: { conCorreo: boolean }) {
  const [paso, setPaso] = useState(0)
  const [datos, setDatos] = useState<DatosDeSolicitud>(VACIA)
  const [intentados, setIntentados] = useState<ReadonlySet<number>>(new Set())
  const [tocados, setTocados] = useState<ReadonlySet<CampoDeSolicitud>>(new Set())
  const [estado, setEstado] = useState<'editando' | 'enviando' | 'enviada'>('editando')
  const [error, setError] = useState<string | null>(null)
  const formulario = useRef<HTMLFormElement>(null)
  const titular = useRef<HTMLHeadingElement>(null)
  const trampa = useRef<HTMLInputElement>(null)
  const montado = useRef(false)

  useEffect(() => {
    // En la primera pintura el foco va al nombre, como iba antes de los pasos;
    // después, al titular de cada paso nuevo.
    if (!montado.current) {
      montado.current = true
      formulario.current?.querySelector<HTMLElement>('[data-campo="nombre"]')?.focus()
      return
    }
    titular.current?.focus()
  }, [paso, estado])

  const problemas = problemasDelPaso(paso, datos)
  const aviso = (campo: CampoDeSolicitud) => (intentados.has(paso) || tocados.has(campo) ? problemas[campo] : undefined)
  const enviando = estado === 'enviando'

  const cambiar = <K extends CampoDeSolicitud>(campo: K, valor: DatosDeSolicitud[K]) => {
    setDatos((antes) => ({ ...antes, [campo]: valor }))
    setError(null)
  }
  const tocar = (campo: CampoDeSolicitud) => setTocados((antes) => (antes.has(campo) ? antes : new Set(antes).add(campo)))
  const irAlPaso = (destino: number) => {
    setError(null)
    setPaso(destino)
  }

  const enviar = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Parece que no hay conexión. Revisa tu red y vuelve a intentarlo: lo escrito sigue aquí.')
      return
    }
    setEstado('enviando')
    setError(null)
    try {
      const respuesta = await solicitarCuenta({
        nombre: datos.nombre,
        correo: datos.correo,
        contrasena: datos.clave,
        institucion: datos.institucion,
        programa: datos.programa,
        etapaDeFormacion: datos.etapa,
        motivo: datos.motivo,
        sitioWeb: trampa.current?.value ?? '',
      })
      if (respuesta.exito) {
        setDatos((antes) => ({ ...antes, clave: '', repetida: '' }))
        setEstado('enviada')
        return
      }
      // Lo escrito se conserva: el fallo más probable es el límite de
      // solicitudes, y volver a escribirlo todo no lo arregla. Si el servidor
      // rechaza un campo de un paso anterior, el mensaje lo nombra y el resumen
      // de arriba tiene su «Cambiar».
      setError(respuesta.mensaje ?? 'No se pudo enviar la solicitud.')
    } catch {
      setError('No se pudo enviar la solicitud: se cortó la conexión. Lo escrito sigue aquí; vuelve a intentarlo.')
    }
    setEstado('editando')
  }

  const continuar = (evento: React.FormEvent) => {
    evento.preventDefault()
    if (enviando) return
    setIntentados((antes) => new Set(antes).add(paso))
    const primero = PASOS_DE_LA_SOLICITUD[paso].campos.find((campo) => problemas[campo])
    if (primero) {
      formulario.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`)?.focus()
      return
    }
    if (paso < ULTIMO) irAlPaso(paso + 1)
    else void enviar()
  }

  if (estado === 'enviada') {
    return (
      <div className="ac-enviada" role="status">
        <span className="ac-enviada-icono" aria-hidden="true">
          <CircleCheck size={34} />
        </span>
        <h1 ref={titular} tabIndex={-1} className="ac-paso-titular">
          Solicitud enviada
        </h1>
        {/* El mismo texto exista o no una cuenta con ese correo: la acción
            contesta igual en los dos casos, y la verdad le llega al titular
            por correo. */}
        <p>
          {conCorreo
            ? `Te llegará un correo a ${datos.correo.trim()} confirmando que la recibimos. Cuando un administrador active tu cuenta, te avisaremos por correo para que puedas entrar.`
            : 'Un administrador la revisará antes de activar tu cuenta. Esta plataforma no envía avisos por correo, así que consulta con quien la administra para saber cuándo queda activa.'}
        </p>
        <Link href="/entrar" className="ac-boton">
          Ir a la pantalla de entrada
        </Link>
      </div>
    )
  }

  const propiedades = (campo: CampoDeSolicitud, conPista = false) => ({
    id: `registro-${campo}`,
    'data-campo': campo,
    'aria-invalid': aviso(campo) ? true : undefined,
    'aria-describedby':
      // La pista y el aviso se turnan en el mismo sitio: con el aviso puesto, la pista no está.
      (aviso(campo) ? `registro-${campo}-aviso` : conPista ? `registro-${campo}-pista` : undefined),
    onBlur: () => tocar(campo),
    disabled: enviando,
  })
  const avisoDe = (campo: CampoDeSolicitud) =>
    aviso(campo) ? (
      <p id={`registro-${campo}-aviso`} className="ac-aviso">
        {aviso(campo)}
      </p>
    ) : null

  const programaConocido =
    datos.programa.trim() !== '' && PROGRAMAS_CONOCIDOS.some((p) => normalizar(p) === normalizar(datos.programa.trim()))

  return (
    <>
      <ol className="ac-pasos" aria-label="Pasos de la solicitud">
        {PASOS_DE_LA_SOLICITUD.map((p, i) => (
          <li
            key={p.titulo}
            className="ac-paso"
            data-estado={i < paso ? 'hecho' : i === paso ? 'actual' : 'pendiente'}
            aria-current={i === paso ? 'step' : undefined}
          >
            <span className="ac-paso-marca" aria-hidden="true">
              {i < paso ? <Check size={16} strokeWidth={3} /> : i + 1}
            </span>
            <span className="ac-paso-rotulo">
              {p.titulo}
              {i < paso ? <span className="sr-only"> (hecho)</span> : null}
            </span>
          </li>
        ))}
      </ol>

      <form ref={formulario} className="ac-formulario" onSubmit={continuar} noValidate aria-busy={enviando}>
        {paso === 0 ? (
          <>
            <div>
              <h1 ref={titular} tabIndex={-1} className="ac-paso-titular">
                Solicita tu cuenta
              </h1>
              <p className="ac-paso-bajada">
                Tu nombre, tu correo y la contraseña con que entrarás cuando un administrador active la cuenta.
              </p>
            </div>
            <div className="ac-campo">
              <label htmlFor="registro-nombre">Nombre y apellido</label>
              <input
                {...propiedades('nombre')}
                type="text"
                autoComplete="name"
                maxLength={LARGOS_DE_SOLICITUD.nombre}
                value={datos.nombre}
                onChange={(e) => cambiar('nombre', e.target.value)}
              />
              {avisoDe('nombre')}
            </div>
            <div className="ac-campo">
              <label htmlFor="registro-correo">Correo electrónico</label>
              <span className="ac-con-icono">
                <Mail size={17} aria-hidden />
                <input
                  {...propiedades('correo')}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="nombre@hospital.cl"
                  maxLength={LARGOS_DE_SOLICITUD.correo}
                  value={datos.correo}
                  onChange={(e) => cambiar('correo', e.target.value)}
                />
              </span>
              {avisoDe('correo')}
            </div>
            <div className="ac-pareja">
              <div className="ac-campo">
                <label htmlFor="registro-clave">Contraseña</label>
                <span className="ac-con-icono">
                  <Lock size={17} aria-hidden />
                  <input
                    {...propiedades('clave', true)}
                    type="password"
                    autoComplete="new-password"
                    value={datos.clave}
                    onChange={(e) => cambiar('clave', e.target.value)}
                  />
                </span>
                {aviso('clave') ? (
                  avisoDe('clave')
                ) : (
                  <p id="registro-clave-pista" className="ac-pista">
                    {datos.clave.length > 0 && datos.clave.length < CLAVE_MINIMA
                      ? `Faltan ${CLAVE_MINIMA - datos.clave.length} caracteres.`
                      : `Mínimo ${CLAVE_MINIMA} caracteres.`}
                  </p>
                )}
              </div>
              <div className="ac-campo">
                <label htmlFor="registro-repetida">Repite la contraseña</label>
                <span className="ac-con-icono">
                  <Lock size={17} aria-hidden />
                  <input
                    {...propiedades('repetida')}
                    type="password"
                    autoComplete="new-password"
                    value={datos.repetida}
                    onChange={(e) => cambiar('repetida', e.target.value)}
                  />
                </span>
                {avisoDe('repetida')}
              </div>
            </div>
          </>
        ) : paso === 1 ? (
          <>
            <div>
              <h1 ref={titular} tabIndex={-1} className="ac-paso-titular">
                ¿Dónde te formas?
              </h1>
              <p className="ac-paso-bajada">
                {conCorreo
                  ? 'Con esto un administrador revisa y activa tu cuenta. Te avisamos por correo.'
                  : 'Con esto un administrador revisa y activa tu cuenta.'}
              </p>
            </div>
            <div className="ac-campo">
              <label htmlFor="registro-institucion">Institución</label>
              <input
                {...propiedades('institucion', true)}
                type="text"
                autoComplete="organization"
                placeholder="Hospital, universidad o servicio"
                maxLength={LARGOS_DE_SOLICITUD.institucion}
                value={datos.institucion}
                onChange={(e) => cambiar('institucion', e.target.value)}
              />
              {aviso('institucion') ? (
                avisoDe('institucion')
              ) : (
                <p id="registro-institucion-pista" className="ac-pista">
                  Escríbela completa, como la reconocería quien revisa tu solicitud.
                </p>
              )}
            </div>
            <div className="ac-campo">
              <label htmlFor="registro-programa">
                Programa o servicio <span className="ac-opcional">(opcional)</span>
              </label>
              <input
                {...propiedades('programa', programaConocido)}
                type="text"
                list="registro-programas"
                placeholder="Traumatología y ortopedia"
                maxLength={LARGOS_DE_SOLICITUD.programa}
                value={datos.programa}
                onChange={(e) => cambiar('programa', e.target.value)}
              />
              <datalist id="registro-programas">
                {PROGRAMAS_CONOCIDOS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {aviso('programa') ? (
                avisoDe('programa')
              ) : programaConocido ? (
                <p id="registro-programa-pista" className="ac-acierto">
                  <Check size={16} aria-hidden /> Lo encontramos en la lista.
                </p>
              ) : null}
            </div>
            <div className="ac-campo ac-select-corto">
              <label htmlFor="registro-etapa">
                Año de residencia <span className="ac-opcional">(opcional)</span>
              </label>
              <select
                {...propiedades('etapa', true)}
                value={datos.etapa}
                onChange={(e) => {
                  cambiar('etapa', e.target.value as EtapaDeFormacion | '')
                  tocar('etapa')
                }}
              >
                <option value="">Sin indicar</option>
                {ETAPAS_DE_FORMACION.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.larga}
                  </option>
                ))}
              </select>
              {aviso('etapa') ? (
                avisoDe('etapa')
              ) : (
                <p id="registro-etapa-pista" className="ac-pista">
                  Si no eres residente, elige kinesiología o docente.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 ref={titular} tabIndex={-1} className="ac-paso-titular">
                Revisa y envía
              </h1>
              <p className="ac-paso-bajada">
                Tu cuenta queda <strong>pendiente</strong> hasta que un administrador revise la solicitud; mientras tanto no podrás
                entrar.
              </p>
            </div>
            <div className="ac-resumen">
              <div className="ac-resumen-grupo">
                <div className="ac-resumen-cabecera">
                  <h2>Tus datos</h2>
                  <button type="button" className="ac-boton-texto" onClick={() => irAlPaso(0)} disabled={enviando} aria-label="Cambiar tus datos">
                    Cambiar
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>Nombre</dt>
                    <dd>{datos.nombre.trim()}</dd>
                  </div>
                  <div>
                    <dt>Correo</dt>
                    <dd>{datos.correo.trim()}</dd>
                  </div>
                </dl>
              </div>
              <div className="ac-resumen-grupo">
                <div className="ac-resumen-cabecera">
                  <h2>Tu institución</h2>
                  <button type="button" className="ac-boton-texto" onClick={() => irAlPaso(1)} disabled={enviando} aria-label="Cambiar tu institución">
                    Cambiar
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>Institución</dt>
                    <dd>{institucionConPrograma(datos.institucion, datos.programa)}</dd>
                  </div>
                  <div>
                    <dt>Año de residencia</dt>
                    <dd>{etiquetaDeEtapa(datos.etapa) || 'Sin indicar'}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="ac-campo">
              <label htmlFor="registro-motivo">
                ¿Algo más que deba saber quien revisa? <span className="ac-opcional">(opcional)</span>
              </label>
              <textarea
                {...propiedades('motivo', true)}
                rows={3}
                maxLength={LARGOS_DE_SOLICITUD.motivo}
                value={datos.motivo}
                onChange={(e) => cambiar('motivo', e.target.value)}
              />
              {aviso('motivo') ? (
                avisoDe('motivo')
              ) : (
                <p id="registro-motivo-pista" className="ac-pista">
                  Por ejemplo, en qué rotación estás o quién te habló de la plataforma. Es lo que lee el administrador al decidir.
                </p>
              )}
            </div>
          </>
        )}

        {/* El campo trampa (`.campo-trampa` en `estilos.css`), fuera de la
            pantalla y no con `display: none`: los robots que rellenan
            formularios se saltan lo que está oculto de la forma obvia, y por
            eso se saca de la vista moviéndolo. A una persona no le llega ni
            con el tabulador ni con el lector de pantalla, y el
            `autoComplete="off"` evita que el navegador lo rellene solo con la
            web de su perfil, que la convertiría en robot sin saberlo. Va fuera
            de los pasos para que siga en el documento en los tres. */}
        <div aria-hidden="true" className="campo-trampa">
          <label>
            Sitio web
            <input ref={trampa} type="text" name="sitioWeb" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        {error ? (
          <p className="ac-error" role="alert">
            <CircleAlert size={18} aria-hidden />
            {error}
          </p>
        ) : null}

        <div className="ac-navegacion">
          {paso > 0 ? (
            <button type="button" className="ac-boton-texto" onClick={() => irAlPaso(paso - 1)} disabled={enviando}>
              <ChevronLeft size={18} aria-hidden /> Volver
            </button>
          ) : null}
          <button type="submit" className="ac-boton" disabled={enviando}>
            {paso < ULTIMO ? (
              <>
                Continuar <ArrowRight size={18} aria-hidden />
              </>
            ) : enviando ? (
              <>
                <Loader2 size={18} className="ac-girando" aria-hidden /> Enviando…
              </>
            ) : (
              <>
                <Send size={17} aria-hidden /> Enviar solicitud
              </>
            )}
          </button>
        </div>
      </form>
    </>
  )
}
