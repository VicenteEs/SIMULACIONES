'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearPrimeraCuenta } from '@/app/(frontend)/acciones/sesion'

export function FormularioInstalar() {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
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
          const resultado = await crearPrimeraCuenta(nombre, correo, clave)
          if (resultado.exito && resultado.datos) {
            router.push(resultado.datos.destino)
            router.refresh()
          } else {
            setError(resultado.mensaje ?? 'No se pudo crear la cuenta.')
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
        <input required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>

      <label className="acceso-campo">
        <span>Correo electrónico</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
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
        {corta ? (
          <small className="acceso-pista">Mínimo 12 caracteres; faltan {12 - clave.length}.</small>
        ) : null}
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
        {enCurso ? 'Creando…' : 'Crear cuenta y entrar'}
      </button>
    </form>
  )
}
