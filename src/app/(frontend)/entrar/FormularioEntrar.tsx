'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CircleAlert, Loader2, Lock, Mail } from 'lucide-react'
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
      className="ac-formulario"
      aria-busy={enCurso}
      onSubmit={(evento) => {
        evento.preventDefault()
        setError(null)
        // Sin red, la acción del servidor no contesta con un mensaje sino con
        // una excepción, y el botón se quedaba en «Entrando…» sin decir nada.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setError('Parece que no hay conexión. Revise su red y vuelva a intentarlo.')
          return
        }
        iniciar(async () => {
          try {
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
          } catch {
            setError('No se pudo entrar: se cortó la conexión. Vuelva a intentarlo.')
          }
        })
      }}
    >
      {error ? (
        <p className="ac-error" role="alert">
          <CircleAlert size={18} aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="ac-campo">
        <label htmlFor="entrar-correo">Correo electrónico</label>
        <span className="ac-con-icono">
          <Mail size={17} aria-hidden />
          <input
            id="entrar-correo"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="nombre@hospital.cl"
            required
            autoFocus
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </span>
      </div>

      <div className="ac-campo">
        <label htmlFor="entrar-clave">Contraseña</label>
        <span className="ac-con-icono">
          <Lock size={17} aria-hidden />
          <input
            id="entrar-clave"
            type="password"
            autoComplete="current-password"
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </span>
      </div>

      <button type="submit" className="ac-boton ac-boton-bloque" disabled={enCurso}>
        {enCurso ? (
          <>
            <Loader2 size={18} className="ac-girando" aria-hidden /> Entrando…
          </>
        ) : (
          'Entrar'
        )}
      </button>

      <Link href="/clave" className="ac-enlace">
        Olvidé mi contraseña
      </Link>
    </form>
  )
}
