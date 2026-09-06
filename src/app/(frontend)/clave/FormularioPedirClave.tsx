'use client'

import { useState, useTransition } from 'react'
import { pedirEnlaceDeClave } from '@/app/(frontend)/acciones/sesion'

export function FormularioPedirClave() {
  const [enCurso, iniciar] = useTransition()
  const [correo, setCorreo] = useState('')
  const [enviado, setEnviado] = useState(false)

  if (enviado) {
    return (
      <div className="acceso-aviso" role="status">
        Si esa dirección corresponde a una cuenta, le llegará un enlace para elegir contraseña
        nueva. Caduca en una hora y sirve una sola vez.
      </div>
    )
  }

  return (
    <form
      className="acceso-formulario"
      onSubmit={(evento) => {
        evento.preventDefault()
        // Se muestra el mismo mensaje pase lo que pase: distinguir los casos
        // convertiría este formulario en un comprobador de quién tiene cuenta.
        iniciar(async () => {
          await pedirEnlaceDeClave(correo)
          setEnviado(true)
        })
      }}
    >
      <label className="acceso-campo">
        <span>Correo de su cuenta</span>
        <input
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
      </label>

      <button type="submit" className="acceso-boton" disabled={enCurso}>
        {enCurso ? 'Enviando…' : 'Enviar enlace'}
      </button>
    </form>
  )
}
