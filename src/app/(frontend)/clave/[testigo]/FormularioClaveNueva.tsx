'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fijarClaveNueva } from '@/app/(frontend)/acciones/sesion'

export function FormularioClaveNueva({ testigo }: { testigo: string }) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [clave, setClave] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)

  const corta = clave.length > 0 && clave.length < 12
  const distintas = repetida.length > 0 && clave !== repetida

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
          const resultado = await fijarClaveNueva(testigo, clave)
          if (resultado.exito && resultado.datos) {
            router.push(resultado.datos.destino)
            router.refresh()
          } else {
            setError(resultado.mensaje ?? 'No se pudo cambiar la contraseña.')
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
        <span>Contraseña nueva</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          autoFocus
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        {corta ? <small className="acceso-pista">Faltan {12 - clave.length} caracteres.</small> : null}
      </label>

      <label className="acceso-campo">
        <span>Repítala</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />
        {distintas ? <small className="acceso-pista">Todavía no coinciden.</small> : null}
      </label>

      <button
        type="submit"
        className="acceso-boton"
        disabled={enCurso || clave.length < 12 || clave !== repetida}
      >
        {enCurso ? 'Guardando…' : 'Guardar y entrar'}
      </button>
    </form>
  )
}
