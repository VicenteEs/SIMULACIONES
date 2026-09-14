'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { solicitarCuenta } from '@/app/(frontend)/acciones/sesion'

/**
 * El `textarea` con el mismo aspecto que los `input` de `.acceso-campo`.
 *
 * La hoja pública solo declara los `input` de esa clase, y un `textarea` sin
 * estilos toma el color y el fondo del navegador: en un móvil con tema oscuro
 * sale un recuadro negro en mitad de una caja blanca. Va en línea porque la
 * hoja es de otro lote; el día que declare `.acceso-campo textarea`, esto sobra.
 */
const ESTILO_DEL_TEXTAREA = {
  padding: '10px 12px',
  border: '1px solid var(--linea)',
  borderRadius: 'var(--r)',
  font: 'inherit',
  fontSize: 15,
  color: 'var(--tinta)',
  background: 'var(--superficie)',
  resize: 'vertical' as const,
}

/**
 * El campo trampa, fuera de la pantalla y no con `display: none`.
 *
 * Los robots que rellenan formularios se saltan lo que está oculto de la forma
 * obvia, y precisamente por eso se saca de la vista moviéndolo: sigue en el
 * documento y parece un campo más. A una persona no le llega ni con el
 * tabulador (`tabIndex={-1}`) ni con el lector de pantalla (`aria-hidden`), y
 * el `autoComplete="off"` evita que el navegador lo rellene solo con la web de
 * su perfil, que convertiría a esa persona en robot sin que lo supiera.
 */
const ESTILO_DE_LA_TRAMPA = {
  position: 'absolute' as const,
  left: '-10000px',
  top: 'auto',
  width: 1,
  height: 1,
  overflow: 'hidden',
}

export function FormularioRegistro({ conCorreo }: { conCorreo: boolean }) {
  const [enCurso, iniciar] = useTransition()
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [institucion, setInstitucion] = useState('')
  const [motivo, setMotivo] = useState('')
  const [clave, setClave] = useState('')
  const [repetida, setRepetida] = useState('')
  const [sitioWeb, setSitioWeb] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)

  const corta = clave.length > 0 && clave.length < 12
  const distintas = repetida.length > 0 && clave !== repetida

  if (enviada) {
    return (
      <div className="acceso-formulario">
        {/* El mismo texto exista o no una cuenta con ese correo: la acción
            contesta igual en los dos casos, y la verdad le llega al titular
            por correo. */}
        <div className="acceso-aviso" role="status">
          <strong>Solicitud enviada.</strong>{' '}
          {conCorreo
            ? `Le llegará un correo a ${correo} confirmando que la recibimos. Un administrador la revisará y, cuando active su cuenta, le avisaremos por correo para que pueda entrar.`
            : 'Un administrador la revisará antes de activar su cuenta. Esta plataforma no envía avisos por correo, así que consulte con quien la administra para saber cuándo queda activa.'}
        </div>
        <Link href="/entrar" className="acceso-enlace">
          Ir a la pantalla de entrada
        </Link>
      </div>
    )
  }

  return (
    <form
      className="acceso-formulario"
      onSubmit={(evento) => {
        evento.preventDefault()
        setError(null)
        if (clave !== repetida) {
          setError('Las dos contraseñas no coinciden.')
          return
        }
        iniciar(async () => {
          const resultado = await solicitarCuenta({
            nombre,
            correo,
            institucion,
            motivo,
            contrasena: clave,
            sitioWeb,
          })
          if (resultado.exito) {
            setClave('')
            setRepetida('')
            setEnviada(true)
          } else {
            // Los campos se conservan: el fallo más probable es el límite de
            // solicitudes, y volver a escribirlo todo no lo arregla.
            setError(resultado.mensaje ?? 'No se pudo enviar la solicitud.')
          }
        })
      }}
    >
      {error ? (
        <div className="acceso-error" role="alert">
          {error}
        </div>
      ) : null}

      <label className="acceso-campo">
        <span>Nombre y apellido</span>
        <input
          autoComplete="name"
          required
          autoFocus
          maxLength={120}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </label>

      <label className="acceso-campo">
        <span>Correo electrónico</span>
        <input
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
      </label>

      <label className="acceso-campo">
        <span>Institución o servicio</span>
        <input
          autoComplete="organization"
          required
          maxLength={160}
          value={institucion}
          onChange={(e) => setInstitucion(e.target.value)}
        />
      </label>

      <label className="acceso-campo">
        <span>Cuéntenos quién es</span>
        <textarea
          rows={3}
          maxLength={1000}
          style={ESTILO_DEL_TEXTAREA}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <small className="acceso-pista">
          Opcional. Por ejemplo: residente de segundo año, docente, kinesiólogo del servicio. Es
          lo que ve el administrador al decidir.
        </small>
      </label>

      <label className="acceso-campo">
        <span>Contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        <small className="acceso-pista">
          {corta ? `Mínimo 12 caracteres; faltan ${12 - clave.length}.` : 'Mínimo 12 caracteres.'}
        </small>
      </label>

      <label className="acceso-campo">
        <span>Repita la contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />
        {distintas ? <small className="acceso-pista">Todavía no coinciden.</small> : null}
      </label>

      <div aria-hidden="true" style={ESTILO_DE_LA_TRAMPA}>
        <label>
          Sitio web
          <input
            type="text"
            name="sitioWeb"
            tabIndex={-1}
            autoComplete="off"
            value={sitioWeb}
            onChange={(e) => setSitioWeb(e.target.value)}
          />
        </label>
      </div>

      <button
        type="submit"
        className="acceso-boton"
        disabled={enCurso || clave.length < 12 || clave !== repetida}
      >
        {enCurso ? 'Enviando…' : 'Enviar solicitud'}
      </button>
    </form>
  )
}
