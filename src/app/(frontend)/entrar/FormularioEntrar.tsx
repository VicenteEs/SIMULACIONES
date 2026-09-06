'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { entrar } from '@/app/(frontend)/acciones/sesion'

export function FormularioEntrar({ cuentaInactiva }: { cuentaInactiva: boolean }) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(
    cuentaInactiva
      ? 'Su cuenta existe pero todavía no está activada. Un administrador debe habilitarla.'
      : null,
  )

  return (
    <form
      className="acceso-formulario"
      onSubmit={(evento) => {
        evento.preventDefault()
        setError(null)
        iniciar(async () => {
          const resultado = await entrar(correo, contrasena)
          if (resultado.exito && resultado.datos) {
            // `refresh` además de `push`: el layout es de servidor y necesita
            // volver a resolverse para pintar la barra con la sesión puesta.
            router.push(resultado.datos.destino)
            router.refresh()
          } else {
            setError(resultado.mensaje ?? 'No se pudo entrar.')
            setContrasena('')
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
        <span>Correo electrónico</span>
        <input
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
      </label>

      <label className="acceso-campo">
        <span>Contraseña</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
      </label>

      <button type="submit" className="acceso-boton" disabled={enCurso}>
        {enCurso ? 'Entrando…' : 'Entrar'}
      </button>

      <Link href="/clave" className="acceso-enlace">
        Olvidé mi contraseña
      </Link>
    </form>
  )
}
